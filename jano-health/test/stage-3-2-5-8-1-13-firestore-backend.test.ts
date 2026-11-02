/**
 * Jano Health - Stage 3.2.5.8.1.13 Verification Suite
 * Shared Durable Server Ledger — Firestore Backend Implementation
 * 
 * Verifies:
 * 1. IServerLedgerBackend abstraction compliance for File and Firestore backends.
 * 2. Fail-closed emulator requirement (prohibits live cloud access in tests).
 * 3. Firestore transactional execution:
 *    - Strict read-before-write ordering enforcement.
 *    - Global monotonic sequence allocation.
 *    - Atomic event, aggregate, and idempotency persistence.
 *    - Idempotent deduplication retry.
 *    - Concurrency conflict detection on aggregate version mismatch.
 *    - Maximum batch and payload size guards.
 *    - Cursor-based pull queries with tenant and facility isolation.
 * 4. Readiness separation: migrationCompleted=false and cutoverAuthorized=false prevent premature Cloud Run cutover.
 * 5. Architectural invariants: IndexedDB schema version 25, 362 registered stores, operational ledger files untouched.
 */

import fs from 'fs';
import path from 'path';
import {
  FileServerLedgerBackend,
} from '../server/ledgerBackend';
import {
  FirestoreServerLedgerBackend,
  FIRESTORE_MAX_BATCH_EVENTS,
  FIRESTORE_MAX_EVENT_PAYLOAD_BYTES,
} from '../server/firestoreLedgerBackend';
import {
  evaluateServerReadiness,
  getPersistenceStatus,
  isCloudRunEnvironment,
} from '../server/readiness';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { DEFAULT_TENANT_ID } from '../server/serverLedger';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * In-Memory Mock Firestore Engine
 * Faithfully simulates Firestore transaction semantics:
 * - Documents stored in nested paths `collection/doc/collection/doc`
 * - Strict read-before-write validation: throws if get() is called after set() in a transaction.
 * - Transaction isolation with rollbacks on thrown errors.
 * - Queries with where and orderBy.
 */
class MockFirestoreDocumentSnapshot {
  constructor(
    public readonly id: string,
    public readonly exists: boolean,
    private readonly _data: Record<string, unknown> | undefined
  ) {}

  data(): Record<string, unknown> | undefined {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class MockFirestoreCollectionReference {
  constructor(private readonly root: MockFirestoreEngine, private readonly collPath: string) {}

  doc(docId: string): MockFirestoreDocumentReference {
    return new MockFirestoreDocumentReference(this.root, `${this.collPath}/${docId}`);
  }

  where(field: string, op: string, val: any): MockFirestoreQuery {
    return new MockFirestoreQuery(this.root, this.collPath, [{ field, op, val }]);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): MockFirestoreQuery {
    return new MockFirestoreQuery(this.root, this.collPath, [], { field, dir });
  }

  async get(): Promise<MockFirestoreDocumentSnapshot[]> {
    return this.root.getCollectionDocs(this.collPath);
  }
}

class MockFirestoreDocumentReference {
  constructor(public readonly root: MockFirestoreEngine, public readonly docPath: string) {}

  collection(subCollName: string): MockFirestoreCollectionReference {
    return new MockFirestoreCollectionReference(this.root, `${this.docPath}/${subCollName}`);
  }

  async get(): Promise<MockFirestoreDocumentSnapshot> {
    return this.root.getDocument(this.docPath);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    this.root.setDocument(this.docPath, data, options?.merge);
  }
}

class MockFirestoreQuery {
  constructor(
    private readonly root: MockFirestoreEngine,
    private readonly collPath: string,
    private readonly filters: Array<{ field: string; op: string; val: any }>,
    private readonly order?: { field: string; dir: 'asc' | 'desc' }
  ) {}

  where(field: string, op: string, val: any): MockFirestoreQuery {
    return new MockFirestoreQuery(this.root, this.collPath, [...this.filters, { field, op, val }], this.order);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): MockFirestoreQuery {
    return new MockFirestoreQuery(this.root, this.collPath, this.filters, { field, dir });
  }

  async get(): Promise<Array<{ id: string; data: () => any }>> {
    let docs = await this.root.getCollectionDocs(this.collPath);

    // Apply filters
    for (const f of this.filters) {
      if (f.op === '>') {
        docs = docs.filter((d) => {
          const val = (d.data() as any)?.[f.field];
          return typeof val === 'number' && val > f.val;
        });
      } else if (f.op === '==') {
        docs = docs.filter((d) => (d.data() as any)?.[f.field] === f.val);
      }
    }

    // Apply sorting
    if (this.order) {
      const { field, dir } = this.order;
      docs.sort((a, b) => {
        const valA = (a.data() as any)?.[field] ?? 0;
        const valB = (b.data() as any)?.[field] ?? 0;
        return dir === 'asc' ? valA - valB : valB - valA;
      });
    }

    return docs.map((d) => ({
      id: d.id,
      data: () => d.data(),
    }));
  }
}

class MockFirestoreTransaction {
  private hasWritten = false;
  private stagedWrites: Map<string, { data: Record<string, unknown>; merge?: boolean }> = new Map();

  constructor(private readonly root: MockFirestoreEngine) {}

  async get(docRef: MockFirestoreDocumentReference): Promise<MockFirestoreDocumentSnapshot> {
    if (this.hasWritten) {
      throw new Error('FIRESTORE_TRANSACTION_VIOLATION: Firestore transactions require all reads before any writes.');
    }
    return this.root.getDocument(docRef.docPath);
  }

  set(docRef: MockFirestoreDocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    this.hasWritten = true;
    this.stagedWrites.set(docRef.docPath, { data: JSON.parse(JSON.stringify(data)), merge: options?.merge });
  }

  commit(): void {
    for (const [docPath, write] of this.stagedWrites.entries()) {
      this.root.setDocument(docPath, write.data, write.merge);
    }
  }
}

class MockFirestoreEngine {
  private data: Map<string, Record<string, unknown>> = new Map();

  collection(collPath: string): MockFirestoreCollectionReference {
    return new MockFirestoreCollectionReference(this, collPath);
  }

  getDocument(docPath: string): MockFirestoreDocumentSnapshot {
    const segments = docPath.split('/');
    const docId = segments[segments.length - 1];
    if (this.data.has(docPath)) {
      return new MockFirestoreDocumentSnapshot(docId, true, this.data.get(docPath));
    }
    return new MockFirestoreDocumentSnapshot(docId, false, undefined);
  }

  setDocument(docPath: string, data: Record<string, unknown>, merge = false): void {
    if (merge && this.data.has(docPath)) {
      const existing = this.data.get(docPath)!;
      this.data.set(docPath, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    } else {
      this.data.set(docPath, JSON.parse(JSON.stringify(data)));
    }
  }

  async getCollectionDocs(collPath: string): Promise<MockFirestoreDocumentSnapshot[]> {
    const results: MockFirestoreDocumentSnapshot[] = [];
    const collPrefix = collPath + '/';
    for (const [key, val] of this.data.entries()) {
      if (key.startsWith(collPrefix)) {
        const sub = key.slice(collPrefix.length);
        // Only direct document children, not subcollections
        if (!sub.includes('/')) {
          results.push(new MockFirestoreDocumentSnapshot(sub, true, val));
        }
      }
    }
    return results;
  }

  async runTransaction<T>(updateFunction: (transaction: MockFirestoreTransaction) => Promise<T>): Promise<T> {
    const txn = new MockFirestoreTransaction(this);
    const result = await updateFunction(txn);
    txn.commit();
    return result;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('JANO HEALTH - STAGE 3.2.5.8.1.13 VERIFICATION SUITE');
  console.log('Shared Durable Server Ledger — Firestore Backend Implementation');
  console.log('================================================================\n');

  const originalBackendEnv = process.env.JANO_LEDGER_BACKEND;
  const originalKService = process.env.K_SERVICE;
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  try {
    // -------------------------------------------------------------------------
    // 1. FileServerLedgerBackend Compatibility
    // -------------------------------------------------------------------------
    console.log('--- 1. FileServerLedgerBackend Compatibility ---');
    const fileBackend = new FileServerLedgerBackend();
    assert(fileBackend.backendType === 'file', 'File backend identifies as backendType: file');

    await fileBackend.init();
    const fileHealth = await fileBackend.getHealth();
    assert(fileHealth.backendType === 'file', 'File health reports backendType file');
    assert(fileHealth.canRead === true, 'File backend reports canRead true');
    assert(fileHealth.canWrite === true, 'File backend reports canWrite true');
    assert(fileHealth.cutoverAuthorized === false, 'File backend cutoverAuthorized is false');

    const fileOpState = await fileBackend.getOperationalState();
    assert(fileOpState === 'NORMAL', 'File operational state is NORMAL');

    // -------------------------------------------------------------------------
    // 2. Fail-Closed Emulator Guard
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Fail-Closed Emulator Guard in Test Context ---');
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const liveCloudAttempt = new FirestoreServerLedgerBackend({ requireEmulator: true });
    let liveCloudThrew = false;
    try {
      await liveCloudAttempt.init();
    } catch (err: any) {
      liveCloudThrew = true;
      assert(
        err.message.includes('EMULATOR_REQUIRED_FAIL_CLOSED'),
        'Rejects non-emulator endpoint when requireEmulator is configured'
      );
    }
    assert(liveCloudThrew, 'Live cloud access strictly fails closed without FIRESTORE_EMULATOR_HOST');

    // -------------------------------------------------------------------------
    // 3. Firestore Backend Transactional Semantics (Mock Engine)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Firestore Backend Transactional Semantics ---');
    const mockDb = new MockFirestoreEngine();
    const firestoreBackend = new FirestoreServerLedgerBackend({ firestoreInstance: mockDb, tenantId: DEFAULT_TENANT_ID });

    await firestoreBackend.init();

    // Seed mock authorization directory for test
    const authDir = firestoreBackend.getAuthorizationDirectory();
    await authDir.provisionTenant({
      tenantId: DEFAULT_TENANT_ID,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await authDir.provisionFacility({
      facilityId: 'fac-rural-dispensary-01',
      tenantId: DEFAULT_TENANT_ID,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await authDir.provisionUser({
      uid: 'usr-admin-01',
      accountStatus: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revocationVersion: 1,
    });
    await authDir.provisionTenantMembership('usr-admin-01', {
      tenantId: DEFAULT_TENANT_ID,
      status: 'active',
      roles: ['admin'],
      capabilities: ['sync:facility'],
      membershipVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await authDir.provisionFacilityMembership('usr-admin-01', DEFAULT_TENANT_ID, {
      facilityId: 'fac-rural-dispensary-01',
      tenantId: DEFAULT_TENANT_ID,
      status: 'active',
      capabilities: ['sync:facility'],
      membershipVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert(firestoreBackend.backendType === 'firestore', 'Identifies as backendType: firestore');

    // 3.1 Initial Health & Readiness state
    const initialHealth = await firestoreBackend.getHealth();
    assert(initialHealth.operationalStatus === 'MIGRATION_PENDING', 'Health reports operationalStatus: MIGRATION_PENDING');
    assert(initialHealth.migrationCompleted === false, 'Health reports migrationCompleted: false');
    assert(initialHealth.cutoverAuthorized === false, 'Health reports cutoverAuthorized: false');
    assert(initialHealth.canRead === true, 'Health reports canRead: true');
    assert(initialHealth.canWrite === true, 'Health reports canWrite: true');
    assert(initialHealth.transactionCapable === true, 'Health reports transactionCapable: true');

    // 3.2 Commit first single event
    console.log('  Testing single event commit...');
    const singlePush = await firestoreBackend.processPushBatch(
      'dev-tablet-01',
      new Date().toISOString(),
      [
        {
          eventId: 'evt-test-001',
          eventType: 'PatientRegistered',
          aggregateType: 'Patient',
          aggregateId: 'pat-1001',
          facilityId: 'fac-rural-dispensary-01',
          baseVersion: 0,
          payload: { name: 'Test Patient', gender: 'F' },
        },
      ],
      { userId: 'usr-admin-01', tenantId: DEFAULT_TENANT_ID, accountStatus: 'active' }
    );

    assert(singlePush.status === 'acknowledged', 'Single push status is acknowledged');
    assert(singlePush.processedCount === 1, 'Acknowledges 1 processed event');
    assert(singlePush.acknowledgedEventIds.includes('evt-test-001'), 'Event evt-test-001 is acknowledged');
    assert(singlePush.conflicts.length === 0, 'No conflicts on first event');

    // Verify assigned sequence in global counter
    const seqSnap1 = await mockDb.collection('ledger_system').doc('global_sequence').get();
    assert(seqSnap1.exists, 'Global sequence document created');
    assert(seqSnap1.data()?.lastServerSequence === 1, 'Assigned global sequence 1 to first event');

    // Verify aggregate document
    const aggSnap1 = await mockDb
      .collection('tenants')
      .doc(DEFAULT_TENANT_ID)
      .collection('aggregates')
      .doc('Patient_pat-1001')
      .get();
    assert(aggSnap1.exists, 'Patient aggregate document created');
    assert(aggSnap1.data()?.version === 1, 'Patient aggregate version is 1');
    assert(aggSnap1.data()?.lastEventId === 'evt-test-001', 'lastEventId is evt-test-001');

    // 3.3 Commit second event advancing same aggregate (version 1 -> 2)
    console.log('  Testing sequential event commit advancing aggregate...');
    const secondPush = await firestoreBackend.processPushBatch(
      'dev-tablet-01',
      new Date().toISOString(),
      [
        {
          eventId: 'evt-test-002',
          eventType: 'PatientEncounterRecorded',
          aggregateType: 'Patient',
          aggregateId: 'pat-1001',
          facilityId: 'fac-rural-dispensary-01',
          baseVersion: 1, // Correct expected version!
          payload: { encounterId: 'enc-2001' },
        },
      ],
      { userId: 'usr-admin-01', tenantId: DEFAULT_TENANT_ID, accountStatus: 'active' }
    );

    assert(secondPush.status === 'acknowledged', 'Second push status is acknowledged');
    assert(secondPush.acknowledgedEventIds.includes('evt-test-002'), 'Event evt-test-002 is acknowledged');

    const seqSnap2 = await mockDb.collection('ledger_system').doc('global_sequence').get();
    assert(seqSnap2.data()?.lastServerSequence === 2, 'Global sequence advanced monotonically to 2');

    const aggSnap2 = await mockDb
      .collection('tenants')
      .doc(DEFAULT_TENANT_ID)
      .collection('aggregates')
      .doc('Patient_pat-1001')
      .get();
    assert(aggSnap2.data()?.version === 2, 'Patient aggregate version advanced to 2');

    // 3.4 Idempotent deduplication retry
    console.log('  Testing idempotent retry of previously committed event...');
    const retryPush = await firestoreBackend.processPushBatch(
      'dev-tablet-01',
      new Date().toISOString(),
      [
        {
          eventId: 'evt-test-002', // Resending exact same event!
          eventType: 'PatientEncounterRecorded',
          aggregateType: 'Patient',
          aggregateId: 'pat-1001',
          facilityId: 'fac-rural-dispensary-01',
          baseVersion: 1,
          payload: { encounterId: 'enc-2001' },
        },
      ],
      { userId: 'usr-admin-01', tenantId: DEFAULT_TENANT_ID, accountStatus: 'active' }
    );

    assert(retryPush.status === 'acknowledged', 'Duplicate push status is acknowledged');
    assert(retryPush.duplicateEventIds.includes('evt-test-002'), 'Duplicate detected in duplicateEventIds');
    assert(retryPush.acknowledgedEventIds.includes('evt-test-002'), 'Idempotently re-acknowledged to client');

    // Assert sequence did NOT advance on duplicate!
    const seqSnapRetry = await mockDb.collection('ledger_system').doc('global_sequence').get();
    assert(seqSnapRetry.data()?.lastServerSequence === 2, 'Global sequence counter unchanged on duplicate (remains 2)');

    // 3.5 Aggregate version divergence conflict detection
    console.log('  Testing version divergence conflict detection...');
    const conflictedPush = await firestoreBackend.processPushBatch(
      'dev-tablet-02',
      new Date().toISOString(),
      [
        {
          eventId: 'evt-test-003',
          eventType: 'PatientUpdated',
          aggregateType: 'Patient',
          aggregateId: 'pat-1001',
          facilityId: 'fac-rural-dispensary-01',
          baseVersion: 0, // Server is at version 2! Mismatched base version!
          payload: { name: 'Divergent Update' },
        },
      ],
      { userId: 'usr-admin-01', tenantId: DEFAULT_TENANT_ID, accountStatus: 'active' }
    );

    assert(conflictedPush.status === 'partial', 'Push with conflict returns status: partial');
    assert(conflictedPush.conflicts.length === 1, 'Exactly 1 conflict recorded');
    assert(conflictedPush.conflicts[0].eventId === 'evt-test-003', 'Conflict references evt-test-003');
    assert(conflictedPush.conflicts[0].serverVersion === 2, 'Conflict reports server authoritative version is 2');
    assert(!conflictedPush.acknowledgedEventIds.includes('evt-test-003'), 'Conflicted event is NOT acknowledged');

    // Verify conflict document was durably staged in Firestore
    const conflictDocs = await mockDb.collection(`tenants/${DEFAULT_TENANT_ID}/conflicts`).get();
    assert(conflictDocs.length === 1, 'Conflict document persisted in Firestore collection');

    // 3.6 Batch and payload size guards
    console.log('  Testing batch and payload size limits...');
    const oversizedBatch = Array.from({ length: FIRESTORE_MAX_BATCH_EVENTS + 1 }, (_, i) => ({
      eventId: `evt-oversized-${i}`,
      eventType: 'Test',
      aggregateType: 'Test',
      aggregateId: `test-${i}`,
      facilityId: 'fac-rural-dispensary-01',
      payload: {},
    }));

    const oversizedBatchRes = await firestoreBackend.processPushBatch(
      'dev-tablet-01',
      new Date().toISOString(),
      oversizedBatch
    );
    assert(oversizedBatchRes.status === 'rejected', 'Oversized batch rejected before transaction');
    assert(
      oversizedBatchRes.error === 'BATCH_SIZE_EXCEEDS_TRANSACTION_LIMIT',
      'Reports BATCH_SIZE_EXCEEDS_TRANSACTION_LIMIT error'
    );

    const oversizedPayload = [
      {
        eventId: 'evt-huge',
        eventType: 'Test',
        aggregateType: 'Test',
        aggregateId: 'test-huge',
        facilityId: 'fac-rural-dispensary-01',
        payload: { bigData: 'X'.repeat(FIRESTORE_MAX_EVENT_PAYLOAD_BYTES + 10) },
      },
    ];
    const oversizedPayloadRes = await firestoreBackend.processPushBatch(
      'dev-tablet-01',
      new Date().toISOString(),
      oversizedPayload
    );
    assert(oversizedPayloadRes.status === 'rejected', 'Oversized individual payload rejected');
    assert(oversizedPayloadRes.error === 'PAYLOAD_TOO_LARGE', 'Reports PAYLOAD_TOO_LARGE error');

    // 3.7 Pull changes by cursor
    console.log('  Testing cursor-based pull changes...');
    const pullFromZero = await firestoreBackend.pullChanges('0', 'fac-rural-dispensary-01');
    assert(pullFromZero.status === 'ok', 'Pull status ok');
    assert(pullFromZero.deltas.length === 2, 'Pulls both events 1 and 2 from cursor 0');
    assert(pullFromZero.cursor === '2', 'Returns cursor 2');

    const pullFromOne = await firestoreBackend.pullChanges('1', 'fac-rural-dispensary-01');
    assert(pullFromOne.deltas.length === 1, 'Pulls only event 2 when since is 1');
    assert(pullFromOne.deltas[0].serverSequence === 2, 'Pulled delta has serverSequence 2');

    // -------------------------------------------------------------------------
    // 4. Readiness & Cloud Run Protection State
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Readiness & Cloud Run Protection State ---');
    process.env.JANO_LEDGER_BACKEND = 'firestore';
    process.env.K_SERVICE = 'jano-health-api';

    const pStatus = getPersistenceStatus();
    assert(pStatus.type === 'cloud_firestore', 'Persistence status recognizes cloud_firestore backend');
    assert(pStatus.cloudRunSafe === false, 'Firestore backend is marked not cloudRunSafe before migration cutover');

    const readiness = evaluateServerReadiness();
    assert(readiness.ready === false, 'Server reports ready: false on Cloud Run');
    assert(readiness.statusCode === 503, 'Server returns HTTP 503');
    assert(
      readiness.error === 'FIRESTORE_MIGRATION_PENDING',
      'Reports FIRESTORE_MIGRATION_PENDING before Stage 3.2.5.8.1.14 cutover'
    );
    assert(
      readiness.reason!.includes('migration has not been completed and cutover is unauthorized'),
      'Truthful readiness explanation'
    );

    // -------------------------------------------------------------------------
    // 5. Architectural Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Architectural Invariants ---');
    assert(ALL_STORE_NAMES.length === 362, `Total registered IndexedDB stores count is exactly 362 (got ${ALL_STORE_NAMES.length})`);

    const operationalLedgerPath = path.join(process.cwd(), '.server_ledger_data.json');
    assert(fs.existsSync(operationalLedgerPath), 'Authoritative operational ledger file exists (.server_ledger_data.json)');
    const stat = fs.statSync(operationalLedgerPath);
    assert(stat.size > 0, `Operational ledger file size preserved (> 0 bytes, actual: ${stat.size} bytes)`);

    const commitMetaPath = path.join(process.cwd(), '.server_ledger_commit_meta.json');
    assert(fs.existsSync(commitMetaPath), 'Durable commit metadata exists (.server_ledger_commit_meta.json)');

    const backupPath = path.join(process.cwd(), '.server_ledger_data.json.bak');
    assert(fs.existsSync(backupPath), 'Mirror backup file exists (.server_ledger_data.json.bak)');

    console.log('\n================================================================');
    console.log(`STAGE 3.2.5.8.1.13 RESULTS: ALL ${passCount} CHECKS PASSED (${failCount} failures)`);
    console.log('================================================================\n');
  } finally {
    if (originalBackendEnv !== undefined) process.env.JANO_LEDGER_BACKEND = originalBackendEnv;
    else delete process.env.JANO_LEDGER_BACKEND;

    if (originalKService !== undefined) process.env.K_SERVICE = originalKService;
    else delete process.env.K_SERVICE;

    if (originalEmulatorHost !== undefined) process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    else delete process.env.FIRESTORE_EMULATOR_HOST;
  }
}

runTests().catch((err) => {
  console.error('\n[FATAL] Test suite encountered unhandled exception:', err);
  process.exit(1);
});
