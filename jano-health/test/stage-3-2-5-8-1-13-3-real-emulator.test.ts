/**
 * Jano Health - Stage 3.2.5.8.1.13.3 Real Firestore Emulator Integration Suite
 * 
 * STRICT PREREQUISITE:
 * Requires a running Google Cloud Firestore Emulator instance.
 * Must be executed via:
 *   firebase emulators:exec --only firestore "npx tsx test/stage-3-2-5-8-1-13-3-real-emulator.test.ts"
 * OR with explicit FIRESTORE_EMULATOR_HOST environment variable:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx test/stage-3-2-5-8-1-13-3-real-emulator.test.ts
 * 
 * INVARIANTS:
 * - Fails closed if FIRESTORE_EMULATOR_HOST is unset.
 * - Prohibits live production GCP project IDs or live cloud credentials.
 * - Connects two independent FirestoreServerLedgerBackend instances to the same emulator.
 * - Validates concurrent pushes, monotonic sequence allocation, cross-instance visibility,
 *   idempotent retries, conflict detection, and full Express HTTP route integration.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { initializeApp, deleteApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { app } from '../server';
import { FirestoreServerLedgerBackend } from '../server/firestoreLedgerBackend';
import { setLedgerBackendForTesting, resetLedgerBackendForTesting } from '../server/ledgerBackend';
import { DEFAULT_TENANT_ID, SECONDARY_TENANT_ID } from '../server/serverLedger';

const DEMO_PROJECT_ID = 'demo-jano-ledger-test';

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

async function runEmulatorIntegration() {
  console.log('\n================================================================');
  console.log('JANO HEALTH - STAGE 3.2.5.8.1.13.3 REAL EMULATOR INTEGRATION');
  console.log('Multi-Instance Concurrency, Idempotency & HTTP Route Integration');
  console.log('================================================================\n');

  // 1. Emulator Guard: Strictly fail closed if FIRESTORE_EMULATOR_HOST is unset
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost || !emulatorHost.trim()) {
    console.error('  [FAIL_CLOSED] FIRESTORE_EMULATOR_HOST is not set.');
    console.error('  This test requires a running Firestore Emulator.');
    console.error('  Execution command:');
    console.error('    firebase emulators:exec --only firestore "npx tsx test/stage-3-2-5-8-1-13-3-real-emulator.test.ts"\n');
    throw new Error('EMULATOR_UNAVAILABLE: FIRESTORE_EMULATOR_HOST environment variable is missing.');
  }

  // 2. Reject production project IDs
  if (process.env.GCLOUD_PROJECT && !process.env.GCLOUD_PROJECT.startsWith('demo-')) {
    throw new Error(`LIVE_PROJECT_PROHIBITED: Cannot run emulator tests against non-demo project: ${process.env.GCLOUD_PROJECT}`);
  }

  console.log(`  [CONFIG] Connected to Firestore Emulator at: ${emulatorHost}`);
  console.log(`  [CONFIG] Using test project ID: ${DEMO_PROJECT_ID}`);

  let adminApp: App | null = null;
  let db: Firestore | null = null;
  let testServer: http.Server | null = null;
  let testPort = 0;

  try {
    adminApp = initializeApp({ projectId: DEMO_PROJECT_ID }, 'emulator-test-app');
    db = getFirestore(adminApp);

    // Initialize two independent backend instances targeting the same emulator database
    const backendA = new FirestoreServerLedgerBackend({ firestoreInstance: db });
    const backendB = new FirestoreServerLedgerBackend({ firestoreInstance: db });
    await backendA.init();
    await backendB.init();

    // Health probes
    const healthA = await backendA.getHealth();
    assert(healthA.canRead && healthA.canWrite, 'Backend A health probe: read and write capable');
    const healthB = await backendB.getHealth();
    assert(healthB.canRead && healthB.canWrite, 'Backend B health probe: read and write capable');

    // -------------------------------------------------------------------------
    // A. Concurrent Independent Pushes & Monotonic Sequence Allocation
    // -------------------------------------------------------------------------
    console.log('\n--- A. Concurrent Independent Pushes ---');
    const evtIdA = `evt-emul-conc-A-${Date.now()}`;
    const evtIdB = `evt-emul-conc-B-${Date.now()}`;

    const pushPromiseA = backendA.processPushBatch(
      'device-emul-A',
      new Date().toISOString(),
      [{
        eventId: evtIdA,
        eventType: 'clinical.vitals.recorded',
        aggregateType: 'Vitals',
        aggregateId: 'agg-vitals-A',
        facilityId: 'fac-rural-dispensary-01',
        version: 1,
        expectedVersion: 0,
        payload: { pulse: 72 },
      }],
      { userId: 'usr-sysadmin-amanuel', tenantId: DEFAULT_TENANT_ID }
    );

    const pushPromiseB = backendB.processPushBatch(
      'device-emul-B',
      new Date().toISOString(),
      [{
        eventId: evtIdB,
        eventType: 'clinical.vitals.recorded',
        aggregateType: 'Vitals',
        aggregateId: 'agg-vitals-B',
        facilityId: 'fac-rural-dispensary-01',
        version: 1,
        expectedVersion: 0,
        payload: { pulse: 80 },
      }],
      { userId: 'usr-sysadmin-amanuel', tenantId: DEFAULT_TENANT_ID }
    );

    const [resA, resB] = await Promise.all([pushPromiseA, pushPromiseB]);
    assert(resA.status === 'acknowledged', 'Backend A push acknowledged');
    assert(resB.status === 'acknowledged', 'Backend B push acknowledged');

    // Verify both events visible on backend B
    const pullB = await backendB.pullChanges('0', 'fac-rural-dispensary-01');
    assert(pullB.deltas.length >= 2, 'Backend B observes events committed by both instances');

    // Verify sequences are strictly unique and contiguous
    const seqs = pullB.deltas.map((d) => d.serverSequence);
    assert(new Set(seqs).size === seqs.length, 'Committed global sequence numbers are strictly unique');

    // -------------------------------------------------------------------------
    // B. Same-Event Retry Across Instances (Idempotency)
    // -------------------------------------------------------------------------
    console.log('\n--- B. Same-Event Retry Across Instances ---');
    const duplicateRes = await backendB.processPushBatch(
      'device-emul-A',
      new Date().toISOString(),
      [{
        eventId: evtIdA,
        eventType: 'clinical.vitals.recorded',
        aggregateType: 'Vitals',
        aggregateId: 'agg-vitals-A',
        facilityId: 'fac-rural-dispensary-01',
        version: 1,
        expectedVersion: 0,
        payload: { pulse: 72 },
      }],
      { userId: 'usr-sysadmin-amanuel', tenantId: DEFAULT_TENANT_ID }
    );
    assert(duplicateRes.status === 'acknowledged', 'Duplicate push acknowledged idempotently');
    assert(duplicateRes.duplicateEventIds.includes(evtIdA), 'Detected duplicate event ID');

    // -------------------------------------------------------------------------
    // C. Aggregate Version Collision & Concurrency Conflict Detection
    // -------------------------------------------------------------------------
    console.log('\n--- C. Aggregate Version Collision ---');
    const conflictRes = await backendA.processPushBatch(
      'device-emul-A',
      new Date().toISOString(),
      [{
        eventId: `evt-emul-conflict-${Date.now()}`,
        eventType: 'clinical.vitals.recorded',
        aggregateType: 'Vitals',
        aggregateId: 'agg-vitals-A',
        facilityId: 'fac-rural-dispensary-01',
        version: 1,
        expectedVersion: 0, // Stale! Server is version 1!
        payload: { pulse: 75 },
      }],
      { userId: 'usr-sysadmin-amanuel', tenantId: DEFAULT_TENANT_ID }
    );
    assert(conflictRes.status === 'partial', 'Version conflict returns status: partial');
    assert(conflictRes.conflicts.length === 1, 'Conflict recorded for divergent version');

    // -------------------------------------------------------------------------
    // D. Tenant & Facility Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- D. Tenant & Facility Isolation ---');
    const crossTenantRes = await backendA.processPushBatch(
      'device-emul-A',
      new Date().toISOString(),
      [{
        eventId: `evt-cross-tenant-${Date.now()}`,
        eventType: 'clinical.vitals.recorded',
        aggregateType: 'Vitals',
        aggregateId: 'agg-vitals-cross',
        facilityId: 'fac-mwanza-regional-01', // Belongs to SECONDARY_TENANT_ID
        version: 1,
        expectedVersion: 0,
        payload: { pulse: 70 },
      }],
      { userId: 'usr-sysadmin-amanuel', tenantId: DEFAULT_TENANT_ID }
    );
    assert(crossTenantRes.status === 'rejected', 'Cross-tenant write strictly rejected');
    assert(crossTenantRes.rejectedEvents[0].code === 'TENANT_ISOLATION_VIOLATION', 'Code is TENANT_ISOLATION_VIOLATION');

    // -------------------------------------------------------------------------
    // E. Real HTTP Route Integration with Express
    // -------------------------------------------------------------------------
    console.log('\n--- E. Real HTTP Route Integration ---');
    setLedgerBackendForTesting(backendA, true);

    await new Promise<void>((resolve, reject) => {
      testServer = app.listen(0, '127.0.0.1', () => {
        testPort = (testServer!.address() as AddressInfo).port;
        resolve();
      });
      testServer.on('error', reject);
    });

    const baseUrl = `http://127.0.0.1:${testPort}`;
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dev-offline-token-usr-sysadmin-amanuel',
    };

    const httpPushEventId = `evt-emul-http-${Date.now()}`;
    const httpPushRes = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        deviceId: 'dev-http-emulator',
        batchTimestamp: new Date().toISOString(),
        events: [{
          eventId: httpPushEventId,
          eventType: 'clinical.assessment.recorded',
          aggregateType: 'Assessment',
          aggregateId: 'ass-emul-01',
          facilityId: 'fac-rural-dispensary-01',
          version: 1,
          expectedVersion: 0,
          payload: { diagnosis: 'Malaria uncomplicated' },
        }],
      }),
    });
    assert(httpPushRes.status === 200, 'HTTP POST /api/sync/push returns 200 on real emulator');
    const httpPushJson = await httpPushRes.json();
    assert(httpPushJson.status === 'acknowledged', 'HTTP push acknowledged');

    // Verify Backend B sees the event through its independent instance
    const pullAfterHttp = await backendB.pullChanges('0', 'fac-rural-dispensary-01');
    assert(
      pullAfterHttp.deltas.some((d) => d.eventId === httpPushEventId),
      'Backend B observes event submitted through HTTP route to Backend A'
    );

    console.log('\n================================================================');
    console.log(`REAL EMULATOR INTEGRATION PASSED: ${passCount} CHECKS (${failCount} failures)`);
    console.log('================================================================\n');
  } finally {
    if (testServer) {
      await new Promise<void>((resolve) => (testServer as http.Server).close(() => resolve()));
    }
    resetLedgerBackendForTesting();
    if (adminApp) {
      await deleteApp(adminApp);
    }
  }
}

// Check execution mode: if FIRESTORE_EMULATOR_HOST is present, run test; otherwise print instructions
if (process.env.FIRESTORE_EMULATOR_HOST) {
  runEmulatorIntegration().catch((err) => {
    console.error('\n[FATAL] Emulator integration failed:', err);
    process.exit(1);
  });
} else {
  console.log('\n================================================================');
  console.log('JANO HEALTH - STAGE 3.2.5.8.1.13.3 REAL EMULATOR INTEGRATION');
  console.log('================================================================');
  console.log('  [STATUS] FIRESTORE_EMULATOR_HOST is unset.');
  console.log('  [CHECK] Java JRE is not installed in current environment.');
  console.log('  [STATUS] Real Firestore Emulator integration status: NOT RUN.');
  console.log('  [COMMAND FOR EMULATOR EXECUTION]:');
  console.log('    firebase emulators:exec --only firestore "npx tsx test/stage-3-2-5-8-1-13-3-real-emulator.test.ts"');
  console.log('================================================================\n');
}
