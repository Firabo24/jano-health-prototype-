/**
 * JANO HEALTH — STAGE 3.2.5.8.1.4 TEST SUITE
 * LEGACY SOURCE CLEANUP SAFETY, HONEST ADMINISTRATIVE ACKS & AUDIT DURABILITY
 *
 * Verifies remediation of:
 * 1. Legacy source cleanup protection against concurrent payload mutation.
 * 2. Truthful administrative reset and sync-event clearing execution and error handling.
 * 3. AuditService observable durability boundary, distinguishing provisional vs persisted events.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localDb } from '../src/services/storage/localDatabase';
import { localRepository } from '../src/services/storage/localRepository';
import { auditService } from '../src/services/audit/auditService';
import { auditRepository } from '../src/services/audit/auditRepository';
import { Patient, SyncEvent } from '../src/domain/types';

import { installTestWebLocksMock } from './helpers/testWebLocks';

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

installTestWebLocksMock();

async function runStage325814Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8.1.4: CLEANUP SAFETY & ADMIN ACKS');
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

  // Ensure repository is initialized
  await localRepository.ensureInitialized();

  // ============================================================================
  // GROUP 1: LEGACY SOURCE CLEANUP SAFETY UNDER CONCURRENT MUTATION
  // ============================================================================
  console.log('--- Group 1: Legacy Source Cleanup Safety & Concurrent Mutation Protection ---');

  await test('1.1. Source payload mutated during migration transaction is PRESERVED and not deleted', async () => {
    const patientIdA = `pat-src-mut-A-${Date.now()}`;
    const patientIdB = `pat-src-mut-B-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    const initialItem: Patient = {
      id: patientIdA,
      mrn: 'MRN-SRC-A',
      firstName: 'AliceInitial',
      lastName: 'Legacy',
      dateOfBirth: '1985-01-01',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'TownA',
      district: 'DistA',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // 1. Seed initial legacy payload
    localStorage.setItem(legacyStorageKey, JSON.stringify([initialItem]));

    // 2. Intercept migration: simulate a concurrent external writer mutating localStorage
    // while IndexedDB transaction is being processed
    const originalGet = localStorage.getItem.bind(localStorage);
    let getItemCount = 0;
    (localStorage as any).getItem = (key: string) => {
      const val = originalGet(key);
      if (key === legacyStorageKey) {
        getItemCount++;
        // On subsequent read (pre-cleanup check), simulate that an external writer appended patient B
        if (getItemCount >= 2) {
          const appended: Patient = {
            id: patientIdB,
            mrn: 'MRN-SRC-B',
            firstName: 'BobConcurrent',
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

      // 3. Verify migration detected payload mutation and refused to delete source key
      assert.ok(report.unmigratedKeys.includes(legacyStorageKey), 'Source key must be in unmigratedKeys');
      assert.ok(
        report.errors.some((e) => e.includes('modified concurrently during migration')),
        'Report must record concurrent modification error'
      );

      // 4. Verify initialItem was committed to IndexedDB
      const committedA = await idbEngine.get<Patient>('patients', patientIdA);
      assert.ok(committedA, 'Initial item should have committed to IndexedDB');
      assert.strictEqual(committedA?.firstName, 'AliceInitial');
    } finally {
      (localStorage as any).getItem = originalGet;
    }

    // 5. Restore full state and verify source key is still in localStorage
    const remaining = localStorage.getItem(legacyStorageKey);
    assert.ok(remaining, 'Source key must remain intact in localStorage');
    localStorage.removeItem(legacyStorageKey);
  });

  await test('1.2. Unchanged, fully resolved legacy source payload is safely deleted after verified commit', async () => {
    const patientId = `pat-clean-safe-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    const cleanItem: Patient = {
      id: patientId,
      mrn: 'MRN-CLEAN-SAFE',
      firstName: 'CleanPatient',
      lastName: 'Legacy',
      dateOfBirth: '1990-05-15',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'CleanTown',
      district: 'CleanDist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyStorageKey, JSON.stringify([cleanItem]));

    const report = await idbEngine.migrateLegacyFallbackData();

    assert.strictEqual(report.insertedCount, 1);
    assert.strictEqual(report.conflictedCount, 0);
    assert.ok(report.clearedKeys.includes(legacyStorageKey), 'Key must be cleared');
    assert.strictEqual(localStorage.getItem(legacyStorageKey), null, 'Source key must be deleted');

    const fromIdb = await idbEngine.get<Patient>('patients', patientId);
    assert.ok(fromIdb);
    assert.strictEqual(fromIdb?.firstName, 'CleanPatient');
  });

  await test('1.3. Concurrent migration calls within the same process coordinate via activeMigrationPromise', async () => {
    const patientId = `pat-conc-mig-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    const item: Patient = {
      id: patientId,
      mrn: 'MRN-CONC-MIG',
      firstName: 'ConcurrentMig',
      lastName: 'Legacy',
      dateOfBirth: '1988-08-08',
      gender: 'male',
      primaryFacilityId: 'fac-1',
      villageTown: 'Town',
      district: 'Dist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyStorageKey, JSON.stringify([item]));

    // Execute two migrations concurrently
    const [reportA, reportB] = await Promise.all([
      idbEngine.migrateLegacyFallbackData(),
      idbEngine.migrateLegacyFallbackData(),
    ]);

    // Both should receive identical coordinated report
    assert.strictEqual(reportA.migratedCount, 1);
    assert.strictEqual(reportB.migratedCount, 1);
    assert.strictEqual(localStorage.getItem(legacyStorageKey), null);

    const fromIdb = await idbEngine.get<Patient>('patients', patientId);
    assert.ok(fromIdb);
    assert.strictEqual(fromIdb?.firstName, 'ConcurrentMig');
  });

  // ============================================================================
  // GROUP 2: TRUTHFUL ADMINISTRATIVE RESET & SYNC-CLEARING ACKS
  // ============================================================================
  console.log('\n--- Group 2: Truthful Administrative Reset & Sync-Clearing Acks ---');

  await test('2.1. localDb.resetToSyntheticDemoData() fails closed and rejects on persistence failure', async () => {
    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await localDb.resetToSyntheticDemoData();
      },
      /error|failed/i,
      'resetToSyntheticDemoData must reject honestly when IndexedDB write fails'
    );

    idbEngine.setSimulatedFailure('none');
  });

  await test('2.2. localDb.clearSyncedEvents() prunes synced events, preserves unsynced, and deletes from IDB', async () => {
    const syncedEvt: SyncEvent = {
      id: `sync-evt-prune-${Date.now()}`,
      eventType: 'PATIENT_REGISTERED' as any,
      entityName: 'Patient',
      entityId: 'p1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'synced',
      retryCount: 0,
    };

    const queuedEvt: SyncEvent = {
      id: `sync-evt-keep-${Date.now()}`,
      eventType: 'ENCOUNTER_CREATED' as any,
      entityName: 'Encounter',
      entityId: 'e1',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      status: 'queued',
      retryCount: 0,
    };

    await localDb.enqueueSyncEvent(syncedEvt);
    await localDb.enqueueSyncEvent(queuedEvt);

    // Prune synced events
    await localDb.clearSyncedEvents();

    const currentQueue = localDb.getSyncQueue();
    const foundSynced = currentQueue.find((e) => e.id === syncedEvt.id);
    const foundQueued = currentQueue.find((e) => e.id === queuedEvt.id);

    assert.strictEqual(foundSynced, undefined, 'Synced event must be removed from queue');
    assert.ok(foundQueued, 'Queued unsynced event must remain in queue');
  });

  await test('2.3. localDb.clearSyncedEvents() rejects on persistence failure without false success', async () => {
    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await localDb.clearSyncedEvents();
      },
      /aborted|failed|error/i,
      'clearSyncedEvents must reject when transaction aborts'
    );

    idbEngine.setSimulatedFailure('none');
  });

  // ============================================================================
  // GROUP 3: AUDIT SERVICE DURABILITY BOUNDARY & PROVISIONAL TRACKING
  // ============================================================================
  console.log('\n--- Group 3: AuditService Durability Boundary & Provisional Tracking ---');

  await test('3.1. Synchronous auditService.record() provides provisional result that transitions to persisted on commit', async () => {
    const auditContext = {
      actorId: 'doc-audit-1',
      actorName: 'Dr. Observer',
      actorRole: 'physician' as const,
      facilityId: 'fac-audit',
    };

    const event = auditService.record(auditContext, 'TEST_AUDIT_ACTION', 'Patient', 'pat-aud-1');
    assert.strictEqual(event.isProvisional, true, 'Event must initially be provisional');
    assert.strictEqual(event.persistenceStatus, 'provisional');

    // Await durable persistence via new observable method
    const durableEvent = await auditService.awaitDurable(event.id);
    assert.strictEqual(durableEvent.isProvisional, false, 'Committed event must not be provisional');
    assert.strictEqual(durableEvent.persistenceStatus, 'persisted');
    assert.strictEqual(auditService.getPersistenceStatus(event.id), 'persisted');

    // Check durable trail from IndexedDB
    const durableLogs = await auditService.getDurableTrail({ resourceId: 'pat-aud-1' });
    assert.ok(durableLogs.some((l) => l.id === event.id), 'Event must be in durable trail');
  });

  await test('3.2. Authoritative audit persistence failure marks event as failed and rejects awaitDurable()', async () => {
    const auditContext = {
      actorId: 'doc-audit-fail',
      actorName: 'Dr. FailureTester',
      actorRole: 'physician' as const,
      facilityId: 'fac-audit',
    };

    // Simulate failure during IndexedDB audit persistence
    idbEngine.setSimulatedFailure('request_error');

    const event = auditService.record(auditContext, 'FAILING_AUDIT_ACTION', 'Patient', 'pat-aud-fail');
    assert.strictEqual(event.persistenceStatus, 'provisional');

    // awaitDurable must reject with the persistence error
    await assert.rejects(
      async () => {
        await auditService.awaitDurable(event.id);
      },
      /error|failed/i,
      'awaitDurable must reject when authoritative persistence fails'
    );

    // Event status in memory should be 'failed'
    assert.strictEqual(auditService.getPersistenceStatus(event.id), 'failed');
    const err = auditService.getPersistenceError(event.id);
    assert.ok(err, 'Persistence error must be accessible');

    idbEngine.setSimulatedFailure('none');
  });

  await test('3.3. AuditRepository commit-first ordering prevents cache mutation on write failure', async () => {
    const auditId = `aud-repo-fail-${Date.now()}`;
    const testAuditEvent = {
      id: auditId,
      actorId: 'doc-1',
      actorName: 'Doc',
      actorRole: 'physician' as const,
      facilityId: 'fac-1',
      action: 'FAIL_TEST',
      resourceType: 'Patient',
      resourceId: 'pat-1',
      timestamp: new Date().toISOString(),
      deviceId: 'dev-1',
      syncStatus: 'offline_retained' as const,
    };

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await auditRepository.record(testAuditEvent);
      },
      /error|failed/i
    );

    // Verify AuditRepository internal cache does NOT contain the uncommitted event
    const lastAudit = await auditRepository.getLastAudit();
    assert.notStrictEqual(lastAudit?.id, auditId, 'Failed audit must not be recorded as lastRecordedAudit');

    idbEngine.setSimulatedFailure('none');
  });

  console.log('\n========================================================================');
  console.log(`STAGE 3.2.5.8.1.4: ALL ${passed} DETERMINISTIC TESTS PASSED!`);
  console.log('========================================================================\n');
}

runStage325814Tests().catch((err) => {
  console.error('\nSTAGE 3.2.5.8.1.4 FATAL TEST ERROR:', err);
  process.exit(1);
});
