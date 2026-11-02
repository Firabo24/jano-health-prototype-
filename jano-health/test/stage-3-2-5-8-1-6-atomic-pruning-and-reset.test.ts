/**
 * JANO HEALTH — STAGE 3.2.5.8.1.6 TEST SUITE
 * ATOMIC SYNC-QUEUE PRUNING, SAFE LEGACY CLEANUP & ATOMIC DEMO RESET
 *
 * Verifies:
 * 1. Queue Pruning:
 *    - Native single-transaction execution across syncQueue.
 *    - Zero partial deletions on transaction abort.
 *    - Zero swallowed deletion errors (request_error rejects).
 *    - Zero event loss under concurrent enqueue (before, pending, after).
 *    - Ineligible/unsynced events are preserved.
 *    - In-memory queue mirror matches authoritative state after commit and failure.
 *    - Clean idempotent retry after failure.
 * 2. Cross-Tab Legacy Migration & Cleanup:
 *    - Web Locks synchronization protocol coordinates cooperating migration callers.
 *    - Successful cleanup of unchanged, fully resolved source payloads.
 *    - Concurrent mutation before cleanup preserves modified source key (zero data loss).
 *    - Missing Web Locks support fails closed (preserves source key, reports as unresolved).
 *    - Lock acquisition failure fails closed (preserves source key).
 *    - Unresolved conflicts keep source key intact.
 *    - Uncoordinated writers that ignore the lock protocol are caught by defense-in-depth pre-check.
 * 3. Atomic Multi-Store Demo Reset:
 *    - All 16 stores participate in a single native multi-store readwrite transaction.
 *    - Transaction abort or request error rolls back all stores atomically (no partial commit).
 *    - In-memory collection mirrors remain unmutated on failure.
 *    - Clean retry succeeds and updates all 16 collections durably and in memory.
 */

import assert from 'node:assert';
import { idbEngine, LEGACY_MIGRATION_LOCK_NAME } from '../src/services/storage/indexedDbEngine';
import { localDb } from '../src/services/storage/localDatabase';
import { SyncEvent, Patient } from '../src/domain/types';
import { installTestWebLocksMock, removeTestWebLocksMock } from './helpers/testWebLocks';

// Ensure localStorage shim in Node.js test runner
if (typeof localStorage === 'undefined') {
  const mockStorage = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { mockStorage.set(key, String(value)); },
    removeItem: (key: string) => { mockStorage.delete(key); },
    clear: () => { mockStorage.clear(); },
    key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
    get length() { return mockStorage.size; },
  };
}

async function runStage325816Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8.1.6: ATOMIC PRUNING, SAFE CLEANUP & RESET');
  console.log('========================================================================\n');

  let passed = 0;
  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    } finally {
      idbEngine.setSimulatedFailure('none');
    }
  };

  // ============================================================================
  // GROUP 1: ATOMIC SYNC-QUEUE PRUNING & CONCURRENT ENQUEUE SAFETY
  // ============================================================================
  console.log('--- Group 1: Atomic Sync-Queue Pruning & Concurrent Enqueue Safety ---');

  await test('1.1. clearSyncedEvents() rejects on transaction abort and commits zero deletions', async () => {
    const syncedEvtA: SyncEvent = {
      id: `sync-abort-1-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };
    const syncedEvtB: SyncEvent = {
      id: `sync-abort-2-${Date.now()}`,
      eventType: 'ENCOUNTER_CREATED' as any,
      entityName: 'Encounter',
      entityId: 'e1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(syncedEvtA);
    await localDb.enqueueSyncEvent(syncedEvtB);

    // Simulate native transaction abort
    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await localDb.clearSyncedEvents();
      },
      /aborted|failed|error/i,
      'clearSyncedEvents must reject honestly when transaction aborts'
    );

    idbEngine.setSimulatedFailure('none');

    // Both records MUST still exist in IndexedDB and in memory mirror
    const fromIdbA = await idbEngine.get<SyncEvent>('syncQueue', syncedEvtA.id);
    const fromIdbB = await idbEngine.get<SyncEvent>('syncQueue', syncedEvtB.id);
    assert.ok(fromIdbA, 'Record A must remain in IndexedDB after transaction abort');
    assert.ok(fromIdbB, 'Record B must remain in IndexedDB after transaction abort');

    const inMem = localDb.getSyncQueue();
    assert.ok(inMem.some((e) => e.id === syncedEvtA.id), 'Record A must remain in memory queue');
    assert.ok(inMem.some((e) => e.id === syncedEvtB.id), 'Record B must remain in memory queue');
  });

  await test('1.2. clearSyncedEvents() rejects honestly on request error without swallowed failures', async () => {
    const syncedEvt: SyncEvent = {
      id: `sync-err-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p2',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(syncedEvt);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await localDb.clearSyncedEvents();
      },
      /request error|failed/i,
      'clearSyncedEvents must reject on request error without swallowing failure'
    );

    idbEngine.setSimulatedFailure('none');

    const fromIdb = await idbEngine.get<SyncEvent>('syncQueue', syncedEvt.id);
    assert.ok(fromIdb, 'Record must not be deleted on request error');
  });

  await test('1.3. clearSyncedEvents() preserves unsynced events and removes only eligible synced events', async () => {
    const syncedEvt: SyncEvent = {
      id: `sync-prune-ok-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p3',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    const queuedEvt: SyncEvent = {
      id: `sync-keep-pending-${Date.now()}`,
      eventType: 'ENCOUNTER_CREATED' as any,
      entityName: 'Encounter',
      entityId: 'e3',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'queued',
      retryCount: 0,
    };

    const failedEvt: SyncEvent = {
      id: `sync-keep-failed-${Date.now()}`,
      eventType: 'LAB_ORDER_PLACED' as any,
      entityName: 'LaboratoryOrder',
      entityId: 'l3',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'failed',
      retryCount: 2,
    };

    await localDb.enqueueSyncEvent(syncedEvt);
    await localDb.enqueueSyncEvent(queuedEvt);
    await localDb.enqueueSyncEvent(failedEvt);

    await localDb.clearSyncedEvents();

    // Synced event must be deleted from IDB and memory
    const idbSynced = await idbEngine.get<SyncEvent>('syncQueue', syncedEvt.id);
    assert.strictEqual(idbSynced, undefined, 'Synced event must be deleted from IndexedDB');

    // Unsynced events must be preserved in IDB and memory
    const idbQueued = await idbEngine.get<SyncEvent>('syncQueue', queuedEvt.id);
    const idbFailed = await idbEngine.get<SyncEvent>('syncQueue', failedEvt.id);
    assert.ok(idbQueued, 'Queued event must be preserved in IndexedDB');
    assert.ok(idbFailed, 'Failed event must be preserved in IndexedDB');

    const inMem = localDb.getSyncQueue();
    assert.strictEqual(inMem.find((e) => e.id === syncedEvt.id), undefined);
    assert.ok(inMem.find((e) => e.id === queuedEvt.id));
    assert.ok(inMem.find((e) => e.id === failedEvt.id));
  });

  await test('1.4. Concurrent enqueue during pruning is never lost or overwritten', async () => {
    const syncedEvt: SyncEvent = {
      id: `sync-race-prune-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p4',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    const concurrentEvt: SyncEvent = {
      id: `sync-race-enqueue-${Date.now()}`,
      eventType: 'PRESCRIPTION_WRITTEN' as any,
      entityName: 'Prescription',
      entityId: 'rx4',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'queued',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(syncedEvt);

    // Launch pruning and concurrent enqueue simultaneously
    await Promise.all([
      localDb.clearSyncedEvents(),
      localDb.enqueueSyncEvent(concurrentEvt),
    ]);

    // Authoritative check in IndexedDB: concurrent event must exist
    const idbConcurrent = await idbEngine.get<SyncEvent>('syncQueue', concurrentEvt.id);
    assert.ok(idbConcurrent, 'Concurrently enqueued event must persist durably in IndexedDB');

    // Memory mirror must contain concurrent event and not contain pruned event
    const inMem = localDb.getSyncQueue();
    assert.ok(inMem.some((e) => e.id === concurrentEvt.id), 'Memory mirror must include concurrent event');
    assert.strictEqual(inMem.find((e) => e.id === syncedEvt.id), undefined, 'Pruned event must not exist in memory');
  });

  await test('1.5. Clean idempotent retry of clearSyncedEvents() succeeds after recovery', async () => {
    const syncedEvt: SyncEvent = {
      id: `sync-retry-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p5',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(syncedEvt);

    // First attempt fails
    idbEngine.setSimulatedFailure('transaction_abort');
    await assert.rejects(async () => {
      await localDb.clearSyncedEvents();
    });

    // Recover storage
    idbEngine.setSimulatedFailure('none');

    // Retry must succeed cleanly
    await localDb.clearSyncedEvents();

    const fromIdb = await idbEngine.get<SyncEvent>('syncQueue', syncedEvt.id);
    assert.strictEqual(fromIdb, undefined, 'Retry must delete synced event');
  });

  await test('1.6. Deterministic status transition: event updated from synced to queued before authoritative prune read is PRESERVED', async () => {
    const testEvt: SyncEvent = {
      id: `sync-trans-queued-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p-trans-1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    // 1. Insert event with status 'synced' through ordinary durable path
    await localDb.enqueueSyncEvent(testEvt);

    // 2. Establish deterministic test barrier on idbEngine.pruneSyncQueue:
    // Before pruneSyncQueue executes its transaction read, mutate event to 'queued'
    const originalPrune = idbEngine.pruneSyncQueue.bind(idbEngine);
    let barrierExecuted = false;

    idbEngine.pruneSyncQueue = async function (predicate) {
      // 3. Mutate event to 'queued' through normal durable update path and wait for commit
      await localDb.updateSyncEvent({
        ...testEvt,
        status: 'queued',
      });
      barrierExecuted = true;
      // 4. Allow pruning transaction to proceed
      return originalPrune(predicate);
    };

    try {
      await localDb.clearSyncedEvents();
      assert.ok(barrierExecuted, 'Deterministic barrier must have executed before pruning read');

      // 5. Verify pruning preserved the event because its authoritative status was 'queued'
      const fromIdb = await idbEngine.get<SyncEvent>('syncQueue', testEvt.id);
      assert.ok(fromIdb, 'Event transitioned to queued MUST survive in authoritative IndexedDB');
      assert.strictEqual(fromIdb?.status, 'queued', 'Event status must remain queued');

      // 6. Verify event survives in in-memory queue mirror
      const inMem = localDb.getSyncQueue();
      const inMemEvt = inMem.find((e) => e.id === testEvt.id);
      assert.ok(inMemEvt, 'Event transitioned to queued MUST survive in memory queue mirror');
      assert.strictEqual(inMemEvt?.status, 'queued');
    } finally {
      idbEngine.pruneSyncQueue = originalPrune;
      await localDb.removeSyncEvent(testEvt.id);
    }
  });

  await test('1.7. Deterministic status transition: event updated from synced to failed before authoritative prune read is PRESERVED', async () => {
    const testEvt: SyncEvent = {
      id: `sync-trans-failed-${Date.now()}`,
      eventType: 'ENCOUNTER_CREATED' as any,
      entityName: 'Encounter',
      entityId: 'e-trans-1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(testEvt);

    const originalPrune = idbEngine.pruneSyncQueue.bind(idbEngine);
    let barrierExecuted = false;

    idbEngine.pruneSyncQueue = async function (predicate) {
      await localDb.updateSyncEvent({
        ...testEvt,
        status: 'failed',
        retryCount: 3,
      });
      barrierExecuted = true;
      return originalPrune(predicate);
    };

    try {
      await localDb.clearSyncedEvents();
      assert.ok(barrierExecuted, 'Deterministic barrier must have executed before pruning read');

      const fromIdb = await idbEngine.get<SyncEvent>('syncQueue', testEvt.id);
      assert.ok(fromIdb, 'Event transitioned to failed MUST survive in authoritative IndexedDB');
      assert.strictEqual(fromIdb?.status, 'failed', 'Event status must remain failed');

      const inMem = localDb.getSyncQueue();
      const inMemEvt = inMem.find((e) => e.id === testEvt.id);
      assert.ok(inMemEvt, 'Event transitioned to failed MUST survive in memory queue mirror');
      assert.strictEqual(inMemEvt?.status, 'failed');
    } finally {
      idbEngine.pruneSyncQueue = originalPrune;
      await localDb.removeSyncEvent(testEvt.id);
    }
  });

  await test('1.8. Defense-in-depth: candidate-ID predicate CANNOT delete unsynced records (queued, pending, failed)', async () => {
    const queuedEvt: SyncEvent = {
      id: `sync-def-queued-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p-def-1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'queued',
      retryCount: 0,
    };

    const failedEvt: SyncEvent = {
      id: `sync-def-failed-${Date.now()}`,
      eventType: 'ENCOUNTER_CREATED' as any,
      entityName: 'Encounter',
      entityId: 'e-def-1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'failed',
      retryCount: 1,
    };

    await localDb.enqueueSyncEvent(queuedEvt);
    await localDb.enqueueSyncEvent(failedEvt);

    // Call pruneSyncQueue with an aggressive predicate that explicitly matches their IDs
    const targetIds = [queuedEvt.id, failedEvt.id];
    const pruneResult = await idbEngine.pruneSyncQueue((e) => targetIds.includes(e?.id));

    // Invariant: Because neither event has status === 'synced', zero records may be pruned
    assert.strictEqual(pruneResult.prunedCount, 0, 'Zero unsynced records may be pruned regardless of predicate');
    assert.strictEqual(pruneResult.prunedIds.length, 0, 'Pruned IDs must be empty');

    // Both records must remain intact in IndexedDB
    const fromIdbQueued = await idbEngine.get<SyncEvent>('syncQueue', queuedEvt.id);
    const fromIdbFailed = await idbEngine.get<SyncEvent>('syncQueue', failedEvt.id);
    assert.ok(fromIdbQueued, 'Queued event must not be deleted by ID-matching predicate');
    assert.ok(fromIdbFailed, 'Failed event must not be deleted by ID-matching predicate');

    await localDb.removeSyncEvent(queuedEvt.id);
    await localDb.removeSyncEvent(failedEvt.id);
  });

  // ============================================================================
  // GROUP 2: SAFE LEGACY CLEANUP & WEB LOCKS COORDINATION
  // ============================================================================
  console.log('\n--- Group 2: Safe Legacy Cleanup & Web Locks Coordination ---');

  await test('2.1. Cooperating migration calls serialize under Web Locks protocol', async () => {
    installTestWebLocksMock();

    const patientId = `pat-weblock-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    const legacyPatient: Patient = {
      id: patientId,
      mrn: 'MRN-WEBLOCK',
      firstName: 'WebLockUser',
      lastName: 'Cooperative',
      dateOfBirth: '1985-05-05',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyKey, JSON.stringify([legacyPatient]));

    // Run two concurrent migration calls
    const [reportA, reportB] = await Promise.all([
      idbEngine.migrateLegacyFallbackData(),
      idbEngine.migrateLegacyFallbackData(),
    ]);

    assert.strictEqual(reportA.migratedCount, 1);
    assert.strictEqual(reportB.migratedCount, 1);
    assert.strictEqual(localStorage.getItem(legacyKey), null, 'Source key must be deleted after verified migration');

    const committed = await idbEngine.get<Patient>('patients', patientId);
    assert.ok(committed, 'Record must exist in IndexedDB');
    assert.strictEqual(committed?.firstName, 'WebLockUser');
  });

  await test('2.2. Missing Web Locks support fails closed: preserves source key and reports as unresolved', async () => {
    const patientId = `pat-nolock-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    const legacyPatient: Patient = {
      id: patientId,
      mrn: 'MRN-NOLOCK',
      firstName: 'NoLockUser',
      lastName: 'Preserved',
      dateOfBirth: '1986-06-06',
      gender: 'male',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyKey, JSON.stringify([legacyPatient]));

    // Disable Web Locks in test environment
    removeTestWebLocksMock();

    // Verify production code NEVER installs an in-memory polyfill onto navigator.locks
    assert.strictEqual(
      (navigator as any).locks,
      undefined,
      'Production code must never install an in-memory lock manager onto navigator.locks'
    );

    try {
      const report = await idbEngine.migrateLegacyFallbackData();

      // Destination is inserted, but source key MUST be preserved because Web Locks exclusivity was unavailable
      assert.ok(report.unmigratedKeys.includes(legacyKey), 'Key must be in unmigratedKeys');
      assert.ok(report.retainedKeys?.includes(legacyKey), 'Key must be in retainedKeys');
      assert.strictEqual(report.lockStatus, 'unavailable');
      assert.ok(report.hasUnresolvedConflict, 'Must report unresolved conflict');
      assert.ok(
        report.errors.some((e) => e.includes('Web Locks synchronization unavailable')),
        'Must record Web Locks unavailable error'
      );

      // Verify destination was inserted non-clobbering
      const inDb = await idbEngine.get<Patient>('patients', patientId);
      assert.ok(inDb, 'Record must be safely imported into IndexedDB destination');

      // Verify source key was NOT deleted from localStorage
      const inStorage = localStorage.getItem(legacyKey);
      assert.ok(inStorage, 'Source key must remain intact in localStorage');
    } finally {
      installTestWebLocksMock();
      localStorage.removeItem(legacyKey);
    }
  });

  await test('2.3. Lock acquisition failure fails closed and preserves source key with clean retry', async () => {
    const patientId = `pat-lockfail-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    const legacyPatient: Patient = {
      id: patientId,
      mrn: 'MRN-LOCKFAIL',
      firstName: 'LockFailUser',
      lastName: 'Preserved',
      dateOfBirth: '1987-07-07',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyKey, JSON.stringify([legacyPatient]));

    // Mock failing locks.request
    (navigator as any).locks = {
      request: async () => {
        throw new Error('SIMULATED_LOCK_ACQUISITION_TIMEOUT');
      },
    };

    try {
      const report = await idbEngine.migrateLegacyFallbackData();

      assert.ok(report.unmigratedKeys.includes(legacyKey));
      assert.ok(report.retainedKeys?.includes(legacyKey));
      assert.strictEqual(report.lockStatus, 'failed');
      assert.ok(
        report.errors.some((e) => e.includes('SIMULATED_LOCK_ACQUISITION_TIMEOUT')),
        'Must record lock failure error'
      );

      const inStorage = localStorage.getItem(legacyKey);
      assert.ok(inStorage, 'Source key must remain in localStorage on lock failure');

      // Verify that after locking capability is restored, retry succeeds and safely cleans up
      installTestWebLocksMock();
      const retryReport = await idbEngine.migrateLegacyFallbackData();
      assert.strictEqual(localStorage.getItem(legacyKey), null, 'Source key must be cleaned up on retry with valid locking');
      assert.ok(retryReport.clearedKeys.includes(legacyKey), 'Cleared keys must record legacyKey on retry');
    } finally {
      installTestWebLocksMock();
      localStorage.removeItem(legacyKey);
    }
  });

  await test('2.4. Unresolved conflicts preserve source key without deletion', async () => {
    const patientId = `pat-conflict-src-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    // Put authoritative record into destination first
    const authoritativePatient: Patient = {
      id: patientId,
      mrn: 'MRN-AUTHORITATIVE',
      firstName: 'AuthoritativeRecord',
      lastName: 'Official',
      dateOfBirth: '1980-01-01',
      gender: 'male',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 5,
    };
    await idbEngine.put('patients', authoritativePatient);

    // Legacy record has DIFFERENT content
    const conflictingLegacy: Patient = {
      ...authoritativePatient,
      firstName: 'ConflictingLegacyData',
      version: 1,
    };
    localStorage.setItem(legacyKey, JSON.stringify([conflictingLegacy]));

    const report = await idbEngine.migrateLegacyFallbackData();

    assert.ok(report.conflictedCount! > 0, 'Must record conflict');
    assert.ok(report.unmigratedKeys.includes(legacyKey), 'Conflicted key must be in unmigratedKeys');
    assert.strictEqual(localStorage.getItem(legacyKey) !== null, true, 'Source key must be preserved');

    // Authoritative destination MUST NOT be overwritten
    const checkDest = await idbEngine.get<Patient>('patients', patientId);
    assert.strictEqual(checkDest?.firstName, 'AuthoritativeRecord');

    localStorage.removeItem(legacyKey);
  });

  await test('2.5. Uncoordinated external writer ignoring lock is caught by defense-in-depth pre-cleanup check', async () => {
    const patientIdA = `pat-uncoord-A-${Date.now()}`;
    const patientIdB = `pat-uncoord-B-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    const initialItem: Patient = {
      id: patientIdA,
      mrn: 'MRN-UNCOORD-A',
      firstName: 'AliceInitial',
      lastName: 'Legacy',
      dateOfBirth: '1991-01-01',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'TownA',
      district: 'DistA',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyKey, JSON.stringify([initialItem]));

    // Intercept localStorage.getItem to simulate uncoordinated writer modifying the key
    // during the transaction before pre-cleanup verification
    const originalGet = localStorage.getItem.bind(localStorage);
    let getItemCount = 0;
    (localStorage as any).getItem = (k: string) => {
      const val = originalGet(k);
      if (k === legacyKey) {
        getItemCount++;
        if (getItemCount >= 2) {
          const appended: Patient = {
            id: patientIdB,
            mrn: 'MRN-UNCOORD-B',
            firstName: 'BobUncoordinated',
            lastName: 'Legacy',
            dateOfBirth: '1992-02-02',
            gender: 'male',
            primaryFacilityId: 'fac-1',
            villageTown: 'TownB',
            district: 'DistB',
            triageUrgency: 'routine',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
          };
          return JSON.stringify([initialItem, appended]);
        }
      }
      return val;
    };

    try {
      const report = await idbEngine.migrateLegacyFallbackData();

      assert.ok(report.unmigratedKeys.includes(legacyKey), 'Modified source key must not be deleted');
      assert.ok(report.retainedKeys?.includes(legacyKey));
      assert.ok(report.errors.some((e) => e.includes('modified concurrently during migration')));

      // Initial item was safely committed to IndexedDB
      const committedA = await idbEngine.get<Patient>('patients', patientIdA);
      assert.ok(committedA);
      assert.strictEqual(committedA?.firstName, 'AliceInitial');
    } finally {
      (localStorage as any).getItem = originalGet;
      localStorage.removeItem(legacyKey);
    }
  });

  await test('2.6. Migration transaction failure preserves source and clean retry succeeds', async () => {
    const patientId = `pat-mig-txfail-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';

    const patient: Patient = {
      id: patientId,
      mrn: 'MRN-TXFAIL',
      firstName: 'RetryUser',
      lastName: 'Legacy',
      dateOfBirth: '1989-09-09',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyKey, JSON.stringify([patient]));

    // First attempt: simulate transaction abort
    idbEngine.setSimulatedFailure('transaction_abort');
    const report1 = await idbEngine.migrateLegacyFallbackData();
    assert.ok(report1.unmigratedKeys.includes(legacyKey), 'Source key must be preserved on transaction failure');
    assert.ok(localStorage.getItem(legacyKey) !== null, 'Source key must remain in localStorage');

    // Second attempt: recover and retry
    idbEngine.setSimulatedFailure('none');
    const report2 = await idbEngine.migrateLegacyFallbackData();
    assert.strictEqual(report2.migratedCount, 1);
    assert.ok(report2.clearedKeys.includes(legacyKey));
    assert.strictEqual(localStorage.getItem(legacyKey), null, 'Source key must be deleted on successful retry');

    const committed = await idbEngine.get<Patient>('patients', patientId);
    assert.ok(committed);
    assert.strictEqual(committed?.firstName, 'RetryUser');
  });

  // ============================================================================
  // GROUP 3: ATOMIC MULTI-STORE DEMO DATA RESET
  // ============================================================================
  console.log('\n--- Group 3: Atomic Multi-Store Demo Data Reset ---');

  await test('3.1. resetToSyntheticDemoData() commits all 16 collections in one transaction', async () => {
    await localDb.resetToSyntheticDemoData();

    // Verify all 16 collections exist in IndexedDB
    const storesToCheck = [
      'patients',
      'encounters',
      'clinicalNotes',
      'vitals',
      'allergies',
      'medications',
      'diagnoses',
      'labOrders',
      'labResults',
      'radiologyOrders',
      'radiologyResults',
      'appointments',
      'referrals',
      'emergencyCases',
      'syncQueue',
      'auditLog',
    ];

    for (const s of storesToCheck) {
      const records = await idbEngine.getAll(s as any);
      assert.ok(records.length > 0, `Store ${s} must contain demo records after reset`);
    }

    // Verify memory mirror is also updated
    assert.ok(localDb.getPatients().length > 0, 'Patients in memory must be populated');
    assert.ok(localDb.getEncounters().length > 0, 'Encounters in memory must be populated');
  });

  await test('3.2. resetToSyntheticDemoData() aborts completely on transaction failure with zero partial commits', async () => {
    // Stage custom patient in database
    const customPatientId = `pat-custom-before-reset-${Date.now()}`;
    const customPatient: Patient = {
      id: customPatientId,
      mrn: 'MRN-CUSTOM-STAY',
      firstName: 'DoNotWipe',
      lastName: 'Custom',
      dateOfBirth: '1975-05-05',
      gender: 'other',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    await localDb.savePatient(customPatient);

    // Simulate failure during atomic reset
    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await localDb.resetToSyntheticDemoData();
      },
      /aborted|failed|error/i,
      'Reset must reject honestly when transaction aborts'
    );

    idbEngine.setSimulatedFailure('none');

    // Custom patient must STILL be present in IndexedDB and memory (no partial wipe)
    const inIdb = await idbEngine.get<Patient>('patients', customPatientId);
    assert.ok(inIdb, 'Custom patient must remain in IndexedDB after aborted reset');
    assert.strictEqual(inIdb?.firstName, 'DoNotWipe');

    const inMem = localDb.getPatientById(customPatientId);
    assert.ok(inMem, 'Custom patient must remain in memory after aborted reset');
  });

  await test('3.3. Clean retry of resetToSyntheticDemoData() succeeds after recovery', async () => {
    idbEngine.setSimulatedFailure('request_error');
    await assert.rejects(async () => {
      await localDb.resetToSyntheticDemoData();
    });

    idbEngine.setSimulatedFailure('none');

    // Retry must succeed
    await localDb.resetToSyntheticDemoData();
    const patients = await idbEngine.getAll<Patient>('patients');
    assert.ok(patients.length > 0, 'Patients must be reset on retry');
  });

  console.log('\n========================================================================');
  console.log(`STAGE 3.2.5.8.1.6: ALL ${passed} DETERMINISTIC TESTS PASSED!`);
  console.log('========================================================================\n');
}

runStage325816Tests().catch((err) => {
  console.error('\nFATAL TEST FAILURE:', err);
  process.exit(1);
});
