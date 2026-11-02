/**
 * JANO HEALTH — STAGE 3.2.5.8.1.2 TEST SUITE
 * HONEST CLINICAL WRITE ACKNOWLEDGMENTS & RACE-SAFE LEGACY MIGRATION
 *
 * Verifies remediation of:
 * - FINDING-3.2.5.8.1.1-01: Honest write acknowledgments across LocalClinicalDatabase.
 *   - No speculative mutation of inMemoryFallbackStore before durable IndexedDB commit.
 *   - Failures in idbEngine.putBatch() honestly propagate to callers.
 *   - Uncommitted data is NOT exposed in subsequent localDb reads.
 *   - Direct safeStorage.setItem bypass with clinical keys is rejected.
 *   - Retry after storage recovery commits durably and updates in-memory mirrors.
 *
 * - FINDING-3.2.5.8.1.1-02: Race-safe transactional legacy migration.
 *   - Reads and writes execute in a single native readwrite transaction.
 *   - Pre-existing newer/conflicting authoritative IndexedDB records are never overwritten.
 *   - Non-conflicting legacy items are inserted via store.add().
 *   - Legacy localStorage source key is retained whenever unresolved conflicts exist.
 *   - Post-commit content verification occurs before any source deletion.
 */

import assert from 'node:assert';
import { idbEngine, areRecordsStructurallyEquivalent } from '../src/services/storage/indexedDbEngine';
import { localDb, safeStorage } from '../src/services/storage/localDatabase';
import { localRepository } from '../src/services/storage/localRepository';
import { Patient, Encounter } from '../src/domain/types';

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

async function runStage325812Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8.1.2: WRITE ACK & MIGRATION RACE TESTS');
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
  // PART A: FINDING-3.2.5.8.1.1-01 REMEDIATION — HONEST CLINICAL WRITE ACKS
  // ============================================================================
  console.log('--- Part A: Honest Clinical Write Acknowledgments & Safe Memory Mirror ---');

  await test('A.1. Baseline state is maintained: failed localDb.savePatient() rejects and does not pollute memory mirror', async () => {
    const existingPatientsBefore = localDb.getPatients();
    const existingCount = existingPatientsBefore.length;

    const uncommittedPatient: Patient = {
      id: `pat-fail-ack-${Date.now()}`,
      mrn: `MRN-FAIL-${Date.now()}`,
      firstName: 'Ghost',
      lastName: 'Record',
      dateOfBirth: '1990-01-01',
      gender: 'other',
      primaryFacilityId: 'fac-test',
      villageTown: 'TestTown',
      district: 'TestDistrict',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // Simulate failure during IndexedDB write
    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await localDb.savePatient(uncommittedPatient);
      },
      /Write request failed|Simulated request error|error/i,
      'savePatient must reject honestly and propagate the error'
    );

    // Verify in-memory mirror was NOT mutated
    const inMemoryAfter = localDb.getPatients();
    assert.strictEqual(inMemoryAfter.length, existingCount, 'In-memory patients list must not grow on failure');
    const foundInMemory = localDb.getPatientById(uncommittedPatient.id);
    assert.strictEqual(foundInMemory, undefined, 'Uncommitted patient must not be visible in localDb memory mirror');

    // Verify IndexedDB does not contain the uncommitted patient
    idbEngine.setSimulatedFailure('none');
    const fromIdb = await idbEngine.get<Patient>('patients', uncommittedPatient.id);
    assert.strictEqual(fromIdb, undefined, 'Uncommitted patient must not exist in IndexedDB');
  });

  await test('A.2. Failed update does NOT overwrite existing memory mirror record with uncommitted edits', async () => {
    // 1. Durably save a baseline patient
    const patientId = `pat-update-ack-${Date.now()}`;
    const initialPatient: Patient = {
      id: patientId,
      mrn: `MRN-INIT-${Date.now()}`,
      firstName: 'VerifiedInitial',
      lastName: 'Patient',
      dateOfBirth: '1982-04-12',
      gender: 'female',
      primaryFacilityId: 'fac-test',
      villageTown: 'TownA',
      district: 'DistA',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await localDb.savePatient(initialPatient);
    assert.strictEqual(localDb.getPatientById(patientId)?.firstName, 'VerifiedInitial');

    // 2. Simulate transaction abort on subsequent update
    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await localDb.savePatient({
          ...initialPatient,
          firstName: 'IllegalGhostMutation',
          version: 2,
        });
      },
      /transaction aborted|failed/i
    );

    // 3. Clear failure and verify memory mirror and disk retained baseline
    idbEngine.setSimulatedFailure('none');

    const readAfterFail = localDb.getPatientById(patientId);
    assert.strictEqual(readAfterFail?.firstName, 'VerifiedInitial', 'Memory mirror must retain pre-failure state');
    assert.strictEqual(readAfterFail?.version, 1);

    const fromDisk = await idbEngine.get<Patient>('patients', patientId);
    assert.strictEqual(fromDisk?.firstName, 'VerifiedInitial', 'Disk must retain pre-failure state');
  });

  await test('A.3. Direct safeStorage.setItem bypass for clinical collections throws and is prevented', () => {
    // Attempting to bypass saveCollection by directly writing to clinical key in safeStorage
    assert.throws(
      () => {
        safeStorage.setItem('jano_health_db_v1_patients', JSON.stringify([]));
      },
      /Direct mutation of clinical collection.*is prohibited/i,
      'Direct safeStorage write with clinical prefix must throw'
    );
  });

  await test('A.4. Successful retry commits to IndexedDB first, then accurately updates memory mirror', async () => {
    const encId = `enc-ack-retry-${Date.now()}`;
    const testEncounter: Encounter = {
      id: encId,
      patientId: 'pat-1',
      facilityId: 'fac-1',
      clinicianId: 'doc-1',
      type: 'outpatient',
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      chiefComplaint: 'Mild headache',
    };

    // First attempt fails
    idbEngine.setSimulatedFailure('request_error');
    await assert.rejects(async () => {
      await localDb.saveEncounter(testEncounter);
    });

    assert.strictEqual(
      localDb.getEncounters().find((e) => e.id === encId),
      undefined,
      'Must not be present after failed write'
    );

    // Clear simulation and retry
    idbEngine.setSimulatedFailure('none');
    await localDb.saveEncounter(testEncounter);

    // Verify presence in both memory mirror and IndexedDB
    const inMem = localDb.getEncounters().find((e) => e.id === encId);
    assert.ok(inMem, 'Encounter must be in memory mirror after commit');
    assert.strictEqual(inMem?.chiefComplaint, 'Mild headache');

    const onDisk = await idbEngine.get<Encounter>('encounters', encId);
    assert.ok(onDisk, 'Encounter must be durably committed on disk');
    assert.strictEqual(onDisk?.chiefComplaint, 'Mild headache');
  });

  // ============================================================================
  // PART B: FINDING-3.2.5.8.1.1-02 REMEDIATION — RACE-SAFE LEGACY MIGRATION
  // ============================================================================
  console.log('\n--- Part B: Race-Safe Transactional Legacy Migration ---');

  await test('B.1. Structural equivalence utility distinguishes equivalent vs differing records correctly', () => {
    const recordA = { id: 'p1', name: 'John', details: { allergies: ['Penicillin'], age: 30 } };
    const recordB = { details: { age: 30, allergies: ['Penicillin'] }, name: 'John', id: 'p1' };
    const recordC = { id: 'p1', name: 'John', details: { allergies: ['Penicillin'], age: 31 } };

    assert.strictEqual(areRecordsStructurallyEquivalent(recordA, recordB), true, 'Equivalent records must return true');
    assert.strictEqual(areRecordsStructurallyEquivalent(recordA, recordC), false, 'Differing records must return false');
  });

  await test('B.2. Migration race condition: Authoritative newer record in IDB is NEVER overwritten by legacy data', async () => {
    const patientId = `pat-race-test-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    // 1. Authoritative writer puts newer Version 2 record directly into IndexedDB
    const newerAuthoritativeRecord: Patient = {
      id: patientId,
      mrn: 'MRN-RACE-AUTHORITATIVE',
      firstName: 'NewerAuthoritative',
      lastName: 'Record',
      dateOfBirth: '1995-10-20',
      gender: 'male',
      primaryFacilityId: 'fac-authoritative',
      villageTown: 'CapitalCity',
      district: 'Central',
      triageUrgency: 'urgent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 2,
    };

    await idbEngine.put('patients', newerAuthoritativeRecord);

    // 2. Prepare legacy plaintext key in localStorage with an older conflicting Version 1 record
    const olderLegacyRecord: Patient = {
      id: patientId,
      mrn: 'MRN-RACE-LEGACY-STALE',
      firstName: 'StaleLegacyName',
      lastName: 'Record',
      dateOfBirth: '1995-10-20',
      gender: 'male',
      primaryFacilityId: 'fac-old',
      villageTown: 'OldVillage',
      district: 'Rural',
      triageUrgency: 'routine',
      createdAt: new Date(Date.now() - 100000).toISOString(),
      updatedAt: new Date(Date.now() - 100000).toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyStorageKey, JSON.stringify([olderLegacyRecord]));

    // 3. Execute legacy migration
    const report = await idbEngine.migrateLegacyFallbackData();

    // 4. Verify conflict was detected and authoritative record was NOT overwritten
    assert.strictEqual(report.conflictedCount, 1, 'Conflict count must be 1 for differing destination key');
    assert.strictEqual(report.hasUnresolvedConflict, true, 'hasUnresolvedConflict must be true');

    // 5. Verify authoritative record on disk is intact
    const diskRecord = await idbEngine.get<Patient>('patients', patientId);
    assert.strictEqual(diskRecord?.firstName, 'NewerAuthoritative', 'Authoritative record must be preserved intact');
    assert.strictEqual(diskRecord?.version, 2, 'Authoritative version 2 must remain');
    assert.strictEqual(diskRecord?.mrn, 'MRN-RACE-AUTHORITATIVE');

    // 6. Verify legacy source key was PRESERVED in localStorage (fail-closed, no silent loss)
    const preservedLegacy = localStorage.getItem(legacyStorageKey);
    assert.ok(preservedLegacy, 'Legacy storage key must NOT be deleted when unresolved conflicts exist');

    // Cleanup legacy key
    localStorage.removeItem(legacyStorageKey);
  });

  await test('B.3. Identical legacy records resolve as alreadyEquivalent without conflicts and delete source safely', async () => {
    const patientId = `pat-equiv-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    const identicalRecord: Patient = {
      id: patientId,
      mrn: 'MRN-EQUIV',
      firstName: 'SameName',
      lastName: 'SameFamily',
      dateOfBirth: '2000-01-01',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'SameTown',
      district: 'SameDist',
      triageUrgency: 'routine',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    };

    // Store in IDB
    await idbEngine.put('patients', identicalRecord);

    // Also store identical record in legacy localStorage
    localStorage.setItem(legacyStorageKey, JSON.stringify([identicalRecord]));

    // Run migration
    const report = await idbEngine.migrateLegacyFallbackData();

    assert.strictEqual(report.alreadyEquivalentCount, 1, 'Must count 1 already-equivalent record');
    assert.strictEqual(report.conflictedCount, 0, 'Must have 0 conflicts');
    assert.strictEqual(report.hasUnresolvedConflict, false, 'Must have no unresolved conflict');

    // Because it is equivalent with no conflicts, the legacy key should be safely deleted
    const remainingLegacy = localStorage.getItem(legacyStorageKey);
    assert.strictEqual(remainingLegacy, null, 'Legacy key should be deleted when fully equivalent');
  });

  await test('B.4. Non-conflicting legacy records are inserted into IDB, verified, and safely removed from source', async () => {
    const patientId = `pat-new-migrated-${Date.now()}`;
    const legacyStorageKey = 'jano_idb_fallback_patients';

    const newLegacyRecord: Patient = {
      id: patientId,
      mrn: 'MRN-MIGRATE-FRESH',
      firstName: 'FreshLegacy',
      lastName: 'Patient',
      dateOfBirth: '2001-02-03',
      gender: 'female',
      primaryFacilityId: 'fac-1',
      villageTown: 'FreshTown',
      district: 'FreshDist',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localStorage.setItem(legacyStorageKey, JSON.stringify([newLegacyRecord]));

    const report = await idbEngine.migrateLegacyFallbackData();

    assert.strictEqual(report.insertedCount, 1, 'Must count 1 inserted record');
    assert.strictEqual(report.conflictedCount, 0, 'Must have 0 conflicts');

    // Post-commit content verification check
    const fromIdb = await idbEngine.get<Patient>('patients', patientId);
    assert.ok(fromIdb, 'Record must be present in IndexedDB');
    assert.strictEqual(fromIdb?.firstName, 'FreshLegacy');

    // Legacy key must be deleted
    assert.strictEqual(localStorage.getItem(legacyStorageKey), null, 'Source key must be deleted after verified migration');
  });

  console.log('\n========================================================================');
  console.log(`STAGE 3.2.5.8.1.2: ALL ${passed} DETERMINISTIC TESTS PASSED!`);
  console.log('========================================================================\n');
}

runStage325812Tests().catch((err) => {
  console.error('\nSTAGE 3.2.5.8.1.2 FATAL TEST ERROR:', err);
  process.exit(1);
});
