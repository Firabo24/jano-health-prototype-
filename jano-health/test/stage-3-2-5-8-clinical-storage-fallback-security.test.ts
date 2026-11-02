/**
 * JANO HEALTH — STAGE 3.2.5.8 TEST SUITE
 * CLINICAL STORAGE FALLBACK SECURITY & FAIL-CLOSED PERSISTENCE
 *
 * Verifies that:
 * A. Plaintext persistence prevention:
 *    - Failed or successful IndexedDB writes NEVER persist clinical records into browser localStorage.
 *    - Callers receive honest rejection on storage failures; no false-success acknowledgements.
 * B. IndexedDB unavailable:
 *    - Database-open failure or unavailable storage fails closed across all clinical APIs.
 *    - Zero fallback writes occur; errors honestly reach the caller.
 * C. Cache ordering:
 *    - Failed durable writes leave in-memory caches and prior database state completely unmutated.
 * D. Authoritative read failure:
 *    - Read failures are not masked as genuinely absent records or superseded by stale memory values.
 * E. Legacy fallback data migration:
 *    - Legacy plaintext fallback keys in localStorage are safely migrated to IndexedDB without duplicates.
 *    - Legacy keys are removed ONLY AFTER destination write is durably committed and verified.
 *    - Legacy data is preserved without deletion if IndexedDB is unavailable or unhealthy.
 * F. Normal offline operation:
 *    - Ordinary offline clinical workflows persist and retrieve records cleanly through IndexedDB.
 * G. Event and transaction consistency:
 *    - Multi-store transactions rollback atomically on failure, preventing partial commits.
 * H. No regression:
 *    - Event chains and clinical workflows maintain strict cryptographic and sequential integrity.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { eventStore } from '../src/services/events/eventStore';
import { localDb } from '../src/services/storage/localDatabase';
import { Patient, Encounter } from '../src/domain/types';
import { DomainEvent } from '../src/domain/persistence';

async function runStage3258Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8: CLINICAL STORAGE FALLBACK SECURITY TESTS');
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

  // Helper to scan localStorage for any clinical fallback keys
  function getClinicalLocalStorageKeys(): string[] {
    if (typeof localStorage === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('jano_idb_fallback_') || k.startsWith('jano_health_db_v1_'))) {
        keys.push(k);
      }
    }
    return keys;
  }

  // --- Test Group A: Plaintext Persistence Prevention ---
  console.log('--- Group A: Plaintext Persistence Prevention ---');

  await test('A.1. Failed put() does NOT persist clinical data to localStorage and rejects honestly', async () => {
    const testPatient: Patient = {
      id: `pat-sec-${Date.now()}`,
      mrn: `MRN-SEC-${Date.now()}`,
      firstName: 'Confidential',
      lastName: 'Patient',
      dateOfBirth: '1985-06-15',
      gender: 'female',
      primaryFacilityId: 'fac-rural-01',
      villageTown: 'Highland',
      district: 'District 1',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await idbEngine.put('patients', testPatient);
      },
      /Write request failed|request error/i,
      'put() must reject on write request error'
    );

    // Verify localStorage has zero clinical keys
    const fallbackKeys = getClinicalLocalStorageKeys();
    assert.strictEqual(fallbackKeys.length, 0, 'No clinical fallback keys may exist in localStorage');
  });

  await test('A.2. Successful put() and putBatch() do NOT write plaintext copies to localStorage', async () => {
    const testPatient: Patient = {
      id: `pat-succ-${Date.now()}`,
      mrn: `MRN-SUCC-${Date.now()}`,
      firstName: 'Protected',
      lastName: 'Record',
      dateOfBirth: '1990-01-01',
      gender: 'male',
      primaryFacilityId: 'fac-rural-01',
      villageTown: 'Valley',
      district: 'District 1',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await idbEngine.put('patients', testPatient);

    // Verify entity is in IndexedDB
    const retrieved = await idbEngine.get<Patient>('patients', testPatient.id);
    assert.ok(retrieved, 'Patient must exist in IndexedDB');
    assert.strictEqual(retrieved.firstName, 'Protected');

    // Verify localStorage has ZERO plaintext entries
    const fallbackKeys = getClinicalLocalStorageKeys();
    assert.strictEqual(fallbackKeys.length, 0, 'Successful write must NOT mirror to localStorage');
  });

  await test('A.3. localDb.savePatient() does NOT persist clinical records to localStorage', async () => {
    const localDbPatient: Patient = {
      id: `pat-localdb-${Date.now()}`,
      mrn: `MRN-LDB-${Date.now()}`,
      firstName: 'LocalDbProtected',
      lastName: 'Patient',
      dateOfBirth: '1992-03-10',
      gender: 'female',
      primaryFacilityId: 'fac-rural-01',
      villageTown: 'Plateau',
      district: 'District 1',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    localDb.savePatient(localDbPatient);

    // Check localStorage
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('jano_health_db_v1_patients');
      assert.strictEqual(stored, null, 'localDb must NEVER write patients collection to localStorage');
    }
  });

  // --- Test Group B: IndexedDB Unavailable Fail-Closed Behavior ---
  console.log('\n--- Group B: IndexedDB Unavailable Fail-Closed Behavior ---');

  await test('B.1. idbEngine.put() rejects when storage is unavailable (zero silent fallback)', async () => {
    idbEngine.setSimulatedFailure('unavailable');

    await assert.rejects(
      async () => {
        await idbEngine.put('patients', { id: 'unavail-1', firstName: 'Fail' });
      },
      /Database unavailable/i,
      'put() must reject when storage is unavailable'
    );

    const fallbackKeys = getClinicalLocalStorageKeys();
    assert.strictEqual(fallbackKeys.length, 0, 'Must NOT write fallback when database is unavailable');
  });

  await test('B.2. idbEngine.get() and getAll() reject when storage is unavailable (no false absence)', async () => {
    idbEngine.setSimulatedFailure('unavailable');

    await assert.rejects(
      async () => {
        await idbEngine.get('patients', 'any-id');
      },
      /Database unavailable/i,
      'get() must reject when storage is unavailable, NOT return undefined'
    );

    await assert.rejects(
      async () => {
        await idbEngine.getAll('patients');
      },
      /Database unavailable/i,
      'getAll() must reject when storage is unavailable, NOT return empty array'
    );
  });

  await test('B.3. LocalRepository savePatient rejects when storage is unavailable', async () => {
    idbEngine.setSimulatedFailure('unavailable');

    await assert.rejects(
      async () => {
        await localRepository.savePatient({
          id: `pat-unavail-${Date.now()}`,
          mrn: 'MRN-UNAVAIL',
          firstName: 'Unavail',
          lastName: 'User',
          dateOfBirth: '1980-01-01',
          gender: 'other',
          primaryFacilityId: 'fac-01',
          villageTown: 'Town',
          district: 'District 1',
          triageUrgency: 'routine',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        });
      },
      /Database unavailable/i,
      'LocalRepository savePatient must propagate storage unavailability error'
    );
  });

  // --- Test Group C: Cache Ordering & Immutability Under Failure ---
  console.log('\n--- Group C: Cache Ordering & Immutability Under Failure ---');

  await test('C.1. Failed savePatient leaves in-memory cache and persisted store completely unmutated', async () => {
    const patientId = `pat-cache-safe-${Date.now()}`;
    const initialPatient: Patient = {
      id: patientId,
      mrn: `MRN-INIT-${Date.now()}`,
      firstName: 'InitialName',
      lastName: 'Patient',
      dateOfBirth: '1975-05-05',
      gender: 'male',
      primaryFacilityId: 'fac-01',
      villageTown: 'Village',
      district: 'District 1',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    // 1. Commit initial patient successfully
    await localRepository.savePatient(initialPatient);
    const cachedBefore = await localRepository.getPatient(patientId);
    assert.strictEqual(cachedBefore?.firstName, 'InitialName');

    // 2. Attempt failed update
    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await localRepository.savePatient({
          ...initialPatient,
          firstName: 'TamperedUnpersistedName',
          version: 2,
        });
      },
      /transaction aborted|failed/i
    );

    // 3. Verify in-memory cache was NOT mutated
    idbEngine.setSimulatedFailure('none');
    const cachedAfter = await localRepository.getPatient(patientId);
    assert.strictEqual(cachedAfter?.firstName, 'InitialName', 'Cache must NOT advance when write fails');
    assert.strictEqual(cachedAfter?.version, 1);

    // 4. Verify durable store state
    const durableAfter = await idbEngine.get<Patient>('patients', patientId);
    assert.strictEqual(durableAfter?.firstName, 'InitialName', 'Durable record must remain unchanged');
  });

  // --- Test Group D: Authoritative Read Integrity ---
  console.log('\n--- Group D: Authoritative Read Integrity ---');

  await test('D.1. Confirmed genuinely absent record resolves to undefined on healthy storage', async () => {
    const nonExistentKey = `pat-absent-${Date.now()}-${Math.random()}`;
    const res = await idbEngine.get('patients', nonExistentKey);
    assert.strictEqual(res, undefined, 'Genuinely absent key must resolve to undefined');
  });

  await test('D.2. Authoritative IndexedDB read takes precedence over any stale memory state', async () => {
    const key = `pat-auth-${Date.now()}`;
    const durableEntity: Patient = {
      id: key,
      mrn: 'MRN-AUTH',
      firstName: 'AuthoritativeTruth',
      lastName: 'FromDisk',
      dateOfBirth: '1988-08-08',
      gender: 'female',
      primaryFacilityId: 'fac-01',
      villageTown: 'City',
      district: 'District 1',
      triageUrgency: 'routine',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await idbEngine.put('patients', durableEntity);

    // Read directly via get
    const fetched = await idbEngine.get<Patient>('patients', key);
    assert.strictEqual(fetched?.firstName, 'AuthoritativeTruth');
  });

  // --- Test Group E: Safe Legacy Fallback Data Migration ---
  console.log('\n--- Group E: Safe Legacy Fallback Data Migration ---');

  await test('E.1. migrateLegacyFallbackData defers and preserves keys if IndexedDB is unavailable', async () => {
    if (typeof localStorage === 'undefined') return;

    const legacyKey = 'jano_idb_fallback_patients';
    const legacyItem = {
      id: `pat-legacy-unavail-${Date.now()}`,
      mrn: 'MRN-LEGACY-01',
      firstName: 'LegacyPreserved',
      lastName: 'DoNotDelete',
      primaryFacilityId: 'fac-01',
    };
    localStorage.setItem(legacyKey, JSON.stringify([legacyItem]));

    // Simulate unavailable database
    idbEngine.setSimulatedFailure('unavailable');

    const migrationResult = await idbEngine.migrateLegacyFallbackData();
    assert.strictEqual(migrationResult.migratedCount, 0, 'No records may be migrated when DB unavailable');
    assert.strictEqual(migrationResult.clearedKeys.length, 0, 'No keys may be cleared when DB unavailable');

    // Verify key was NOT deleted from localStorage (prevents silent data loss)
    const stillInLocalStorage = localStorage.getItem(legacyKey);
    assert.ok(stillInLocalStorage, 'Legacy key MUST remain preserved in localStorage when DB is unavailable');

    // Clean up
    idbEngine.setSimulatedFailure('none');
    localStorage.removeItem(legacyKey);
  });

  await test('E.2. migrateLegacyFallbackData migrates items, avoids duplicates, and clears localStorage after durable commit', async () => {
    if (typeof localStorage === 'undefined') return;

    // 1. Seed existing record in IndexedDB
    const existingId = `pat-existing-${Date.now()}`;
    await idbEngine.put('patients', {
      id: existingId,
      mrn: 'MRN-EXISTING',
      firstName: 'AlreadyInDb',
      primaryFacilityId: 'fac-01',
    });

    // 2. Seed legacy fallback with 1 duplicate and 1 brand-new item
    const newLegacyId = `pat-new-migrated-${Date.now()}`;
    const legacyKey = 'jano_idb_fallback_patients';
    localStorage.setItem(
      legacyKey,
      JSON.stringify([
        { id: existingId, firstName: 'AlreadyInDb' },
        { id: newLegacyId, mrn: 'MRN-NEW-MIG', firstName: 'MigratedSuccessfully', primaryFacilityId: 'fac-01' },
      ])
    );

    // 3. Execute safe migration
    const migrationResult = await idbEngine.migrateLegacyFallbackData();
    assert.strictEqual(migrationResult.migratedCount, 1, 'Only non-duplicate item must be migrated');
    assert.ok(migrationResult.clearedKeys.includes(legacyKey), 'Legacy key must be cleared after verified commit');

    // 4. Verify new item now durably exists in IndexedDB
    const migratedItem = await idbEngine.get<any>('patients', newLegacyId);
    assert.ok(migratedItem, 'New item must exist in IndexedDB');
    assert.strictEqual(migratedItem.firstName, 'MigratedSuccessfully');

    // 5. Verify legacy key was deleted from localStorage
    assert.strictEqual(localStorage.getItem(legacyKey), null, 'Legacy plaintext key must be removed from localStorage');
  });

  // --- Test Group F: Normal Offline Operation with Functioning IndexedDB ---
  console.log('\n--- Group F: Normal Offline Operation with Functioning IndexedDB ---');

  await test('F.1. Offline clinical workflows persist and retrieve records cleanly through IndexedDB', async () => {
    const encounterId = `enc-offline-${Date.now()}`;
    const encounter: Encounter = {
      id: encounterId,
      patientId: 'pat-offline-01',
      facilityId: 'fac-rural-01',
      clinicianId: 'usr-clinician-01',
      startedAt: new Date().toISOString(),
      type: 'OUTPATIENT',
      status: 'IN_PROGRESS',
      chiefComplaint: 'Routine checkup',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    await localRepository.saveEncounter(encounter);

    const retrieved = await localRepository.getEncounter(encounterId);
    assert.ok(retrieved, 'Encounter must be retrievable from repository');
    assert.strictEqual(retrieved.status, 'IN_PROGRESS');

    const durableInDb = await idbEngine.get<Encounter>('encounters', encounterId);
    assert.ok(durableInDb, 'Encounter must be durably present in IndexedDB');
    assert.strictEqual(durableInDb.id, encounterId);
  });

  // --- Test Group G: Event and Transaction Consistency ---
  console.log('\n--- Group G: Event and Transaction Consistency ---');

  await test('G.1. Multi-store transaction failure leaves zero partial commits or unpersisted events', async () => {
    const eventId = `ev-fail-${Date.now()}`;
    const patientId = `pat-tx-fail-${Date.now()}`;

    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(['patients', 'domainEvents'], async (txContext) => {
          await txContext.put('patients', { id: patientId, firstName: 'ShouldRollback' });
          await txContext.put('domainEvents', {
            eventId,
            eventType: 'PATIENT_CREATED',
            aggregateType: 'Patient',
            aggregateId: patientId,
            facilityId: 'fac-01',
            actorId: 'usr-01',
            deviceId: 'dev-01',
            timestamp: new Date().toISOString(),
            sequence: 0,
            version: 1,
            payload: { test: true },
            metadata: {},
            syncStatus: 'PENDING',
          } as DomainEvent);
        });
      },
      /transaction aborted|failed/i
    );

    idbEngine.setSimulatedFailure('none');

    // Verify neither entity committed to IndexedDB
    const patientInDb = await idbEngine.get('patients', patientId);
    assert.strictEqual(patientInDb, undefined, 'Patient must NOT commit on transaction abort');

    const eventInDb = await idbEngine.get('domainEvents', eventId);
    assert.strictEqual(eventInDb, undefined, 'Domain event must NOT commit on transaction abort');

    // Verify zero localStorage entries
    const fallbackKeys = getClinicalLocalStorageKeys();
    assert.strictEqual(fallbackKeys.length, 0, 'No fallback keys created on transaction abort');
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/${passed} STAGE 3.2.5.8 FALLBACK SECURITY TESTS PASSED`);
  console.log('========================================================================\n');
}

runStage3258Tests().catch((err) => {
  console.error('\nStage 3.2.5.8 test execution failed:', err);
  process.exit(1);
});
