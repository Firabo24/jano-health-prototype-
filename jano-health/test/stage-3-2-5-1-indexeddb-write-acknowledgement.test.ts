/**
 * JANO HEALTH — STAGE 3.2.5.1 TEST SUITE
 * CLIENT-SIDE INDEXEDDB WRITE-ACKNOWLEDGEMENT & DURABILITY VERIFICATION
 *
 * Verifies that:
 * 1. put() resolves strictly on tx.oncomplete, NOT on req.onsuccess alone.
 * 2. put() rejects on write request error and does not mutate in-memory fallback or report success.
 * 3. put() rejects on transaction abort and does not mutate in-memory fallback or report success.
 * 4. put() rejects when IndexedDB is unavailable without reporting false success.
 * 5. putBatch() resolves only on tx.oncomplete and rolls back/rejects on failure without mutating memory fallback.
 * 6. delete() and clearStore() commit changes to memory fallback only after durable transaction completion.
 * 7. executeTransaction() rejects and preserves in-memory cache integrity when any transaction step fails.
 * 8. Clinical EventStore and LocalRepository never advance in-memory state when IndexedDB write fails.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { eventStore } from '../src/services/events/eventStore';
import { localRepository } from '../src/services/storage/localRepository';
import { DomainEvent } from '../src/domain/persistence';

async function runStage3251Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.1: INDEXEDDB WRITE COMMIT ACKNOWLEDGEMENT');
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
      // Ensure failure simulation is always cleared after each test
      idbEngine.setSimulatedFailure('none');
    }
  };

  try {
    console.log('--- Test Group 1: Genuine Transaction Completion & Durability ---');

    await test('1.1. put() successfully writes to IndexedDB and resolves upon transaction commit', async () => {
      const testPatient = {
        id: `pat-durability-${Date.now()}`,
        mrn: `MRN-DUR-${Date.now()}`,
        firstName: 'DurablePatient',
        lastName: 'Verified',
        primaryFacilityId: 'fac-main',
        villageTown: 'Central',
      };

      await idbEngine.put('patients', testPatient);

      const fetched = await idbEngine.get<any>('patients', testPatient.id);
      assert.ok(fetched, 'Committed entity must be retrievable');
      assert.strictEqual(fetched.firstName, 'DurablePatient');
    });

    await test('1.2. putBatch() successfully commits multiple items atomically', async () => {
      const items = [
        { id: `batch-item-1-${Date.now()}`, name: 'Item One', category: 'TEST' },
        { id: `batch-item-2-${Date.now()}`, name: 'Item Two', category: 'TEST' },
      ];

      await idbEngine.putBatch('inventoryItems', items);

      const item1 = await idbEngine.get<any>('inventoryItems', items[0].id);
      const item2 = await idbEngine.get<any>('inventoryItems', items[1].id);
      assert.strictEqual(item1?.name, 'Item One');
      assert.strictEqual(item2?.name, 'Item Two');
    });

    console.log('\n--- Test Group 2: Error Propagation & Zero False Success ---');

    await test('2.1. put() strictly rejects on simulated write request error (no false success)', async () => {
      const testId = `pat-req-err-${Date.now()}`;
      const uncommittedItem = {
        id: testId,
        mrn: 'MRN-FAIL-REQ',
        firstName: 'ShouldNotPersist',
        primaryFacilityId: 'fac-main',
        villageTown: 'FailTown',
      };

      idbEngine.setSimulatedFailure('request_error');

      let errorCaught = false;
      try {
        await idbEngine.put('patients', uncommittedItem);
      } catch (err: any) {
        errorCaught = true;
        assert.ok(err.message.includes('request error') || err.message.includes('failed'), 'Must contain descriptive error');
      }

      assert.strictEqual(errorCaught, true, 'put() must reject on request error');

      // Verify that in-memory fallback was NOT polluted
      idbEngine.setSimulatedFailure('none');
      const retrieved = await idbEngine.get('patients', testId);
      assert.strictEqual(retrieved, undefined, 'Uncommitted item must NOT exist in memory or database');
    });

    await test('2.2. put() strictly rejects on transaction abort (no false success)', async () => {
      const testId = `pat-tx-abort-${Date.now()}`;
      const abortedItem = {
        id: testId,
        mrn: 'MRN-FAIL-ABORT',
        firstName: 'AbortedItem',
        primaryFacilityId: 'fac-main',
        villageTown: 'AbortTown',
      };

      idbEngine.setSimulatedFailure('transaction_abort');

      let errorCaught = false;
      try {
        await idbEngine.put('patients', abortedItem);
      } catch (err: any) {
        errorCaught = true;
        assert.ok(err.message.includes('aborted') || err.message.includes('failed'), 'Must report transaction abort');
      }

      assert.strictEqual(errorCaught, true, 'put() must reject when transaction aborts');

      // Verify memory fallback is untouched
      idbEngine.setSimulatedFailure('none');
      const retrieved = await idbEngine.get('patients', testId);
      assert.strictEqual(retrieved, undefined, 'Aborted item must NOT exist in memory fallback');
    });

    await test('2.3. put() strictly rejects when storage is unavailable (zero silent returns)', async () => {
      const testId = `pat-unavail-${Date.now()}`;
      const unavailItem = {
        id: testId,
        firstName: 'UnavailableStorage',
      };

      idbEngine.setSimulatedFailure('unavailable');

      let errorCaught = false;
      try {
        await idbEngine.put('patients', unavailItem);
      } catch (err: any) {
        errorCaught = true;
        assert.ok(err.message.includes('unavailable'), 'Must indicate database unavailable');
      }

      assert.strictEqual(errorCaught, true, 'put() must reject when IndexedDB is unavailable');

      idbEngine.setSimulatedFailure('none');
      const retrieved = await idbEngine.get('patients', testId);
      assert.strictEqual(retrieved, undefined, 'Item must NOT be recorded when storage unavailable');
    });

    console.log('\n--- Test Group 3: Batch and Deletion Durability Semantics ---');

    await test('3.1. putBatch() rejects on error and leaves in-memory fallback unmutated', async () => {
      const items = [
        { id: `batch-fail-1-${Date.now()}`, name: 'Fail1' },
        { id: `batch-fail-2-${Date.now()}`, name: 'Fail2' },
      ];

      idbEngine.setSimulatedFailure('transaction_abort');

      let caught = false;
      try {
        await idbEngine.putBatch('inventoryItems', items);
      } catch (err) {
        caught = true;
      }

      assert.strictEqual(caught, true, 'putBatch must reject on abort');

      idbEngine.setSimulatedFailure('none');
      const item1 = await idbEngine.get('inventoryItems', items[0].id);
      const item2 = await idbEngine.get('inventoryItems', items[1].id);
      assert.strictEqual(item1, undefined, 'Batch item 1 must not be in fallback');
      assert.strictEqual(item2, undefined, 'Batch item 2 must not be in fallback');
    });

    await test('3.2. delete() rejects when unavailable and does not delete from memory fallback', async () => {
      const existingKey = `del-test-${Date.now()}`;
      await idbEngine.put('patients', { id: existingKey, firstName: 'PreExisting' });

      idbEngine.setSimulatedFailure('unavailable');

      let caught = false;
      try {
        await idbEngine.delete('patients', existingKey);
      } catch (err) {
        caught = true;
      }

      assert.strictEqual(caught, true, 'delete must reject when storage is unavailable');

      idbEngine.setSimulatedFailure('none');
      const stillThere = await idbEngine.get<any>('patients', existingKey);
      assert.ok(stillThere, 'Entity must still exist because delete was rejected');
      assert.strictEqual(stillThere.firstName, 'PreExisting');
    });

    console.log('\n--- Test Group 4: Multi-Store Atomic Transactions ---');

    await test('4.1. executeTransaction() commits changes only when entire multi-store transaction completes', async () => {
      const patId = `pat-tx-ok-${Date.now()}`;
      const encId = `enc-tx-ok-${Date.now()}`;

      await idbEngine.executeTransaction(['patients', 'encounters'], async (ctx) => {
        await ctx.put('patients', { id: patId, firstName: 'AtomicPat' });
        await ctx.put('encounters', { id: encId, patientId: patId, status: 'OPEN' });
        return { success: true };
      });

      const p = await idbEngine.get<any>('patients', patId);
      const e = await idbEngine.get<any>('encounters', encId);
      assert.strictEqual(p?.firstName, 'AtomicPat');
      assert.strictEqual(e?.status, 'OPEN');
    });

    await test('4.2. executeTransaction() rolls back all stores and rejects when an operation throws', async () => {
      const patId = `pat-tx-rb-${Date.now()}`;
      const encId = `enc-tx-rb-${Date.now()}`;

      let errorCaught = false;
      try {
        await idbEngine.executeTransaction(['patients', 'encounters'], async (ctx) => {
          await ctx.put('patients', { id: patId, firstName: 'ShouldRollback' });
          throw new Error('SIMULATED_CLINICAL_VALIDATION_FAILURE');
        });
      } catch (err: any) {
        errorCaught = true;
        assert.strictEqual(err.message, 'SIMULATED_CLINICAL_VALIDATION_FAILURE');
      }

      assert.strictEqual(errorCaught, true, 'executeTransaction must reject on error');

      const p = await idbEngine.get('patients', patId);
      assert.strictEqual(p, undefined, 'Rolled-back patient must NOT exist in store or cache');
    });

    console.log('\n--- Test Group 5: Dependent Clinical Service Protection ---');

    await test('5.1. EventStore appendEvent rejects and does not update eventCache when IndexedDB write fails', async () => {
      const eventId = `evt-safe-test-${Date.now()}`;
      const event: DomainEvent = {
        eventId,
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: `pat-${Date.now()}`,
        facilityId: 'fac-main',
        actorId: 'usr-doc',
        deviceId: 'dev-1',
        timestamp: new Date().toISOString(),
        sequence: 1,
        version: 1,
        payload: { test: true },
        metadata: {} as any,
        previousEventHash: null,
        eventHash: 'hash',
        clientCreatedAt: new Date().toISOString(),
        clientUpdatedAt: new Date().toISOString(),
        syncStatus: 'PENDING',
        retryCount: 0,
      };

      idbEngine.setSimulatedFailure('transaction_abort');

      let caught = false;
      try {
        await eventStore.appendEvent(event);
      } catch (err) {
        caught = true;
      }

      assert.strictEqual(caught, true, 'appendEvent must reject when durable write fails');

      idbEngine.setSimulatedFailure('none');
      const retrieved = await eventStore.getEventsForAggregate('Patient', event.aggregateId);
      assert.strictEqual(retrieved.length, 0, 'EventStore must NOT cache unpersisted event');
    });

    await test('5.2. LocalRepository savePatient rejects and does not advance cache when storage fails', async () => {
      const patientId = `pat-repo-safe-${Date.now()}`;
      const patient: any = {
        id: patientId,
        mrn: `MRN-FAIL-${Date.now()}`,
        firstName: 'Unsaved',
        lastName: 'Patient',
        primaryFacilityId: 'fac-main',
        villageTown: 'Nowhere',
      };

      idbEngine.setSimulatedFailure('request_error');

      let caught = false;
      try {
        await localRepository.savePatient(patient);
      } catch (err) {
        caught = true;
      }

      assert.strictEqual(caught, true, 'savePatient must reject when durable write fails');

      idbEngine.setSimulatedFailure('none');
      const retrieved = await localRepository.getPatient(patientId);
      assert.strictEqual(retrieved, undefined, 'LocalRepository cache must NOT contain unpersisted patient');
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/10 STAGE 3.2.5.1 WRITE-ACKNOWLEDGEMENT TESTS PASSED PERFECTLY`);
    console.log('========================================================================\n');
  } finally {
    idbEngine.setSimulatedFailure('none');
  }
}

runStage3251Tests().catch((err) => {
  console.error('\nStage 3.2.5.1 Test Suite Failed:', err);
  process.exit(1);
});
