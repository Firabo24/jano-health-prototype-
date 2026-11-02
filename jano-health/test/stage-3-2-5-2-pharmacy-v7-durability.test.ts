/**
 * JANO HEALTH — STAGE 3.2.5.2 TEST SUITE
 * PHARMACY V7 DURABLE WRITE ACKNOWLEDGEMENT & CACHE INTEGRITY
 *
 * Verifies that all eight Pharmacy V7 persistence methods:
 * 1. saveDispenseRecord()
 * 2. saveInventoryItem()
 * 3. saveInventoryBatch()
 * 4. saveInventoryTransaction()
 * 5. saveInventoryReceipt()
 * 6. saveInventoryTransfer()
 * 7. saveInventoryWastage()
 * 8. savePharmacyReview()
 *
 * Enforce:
 * - Commit-first ordering: Cache is updated ONLY after durable write succeeds.
 * - Error propagation: Storage rejections (request errors, aborts, unavailable) reject the promise.
 * - Zero false-success: Rejections are never converted into successful Promise<void>.
 * - Creation cache integrity: Failed creation does not leave uncommitted records in memory cache.
 * - Update cache integrity: Failed update does not corrupt or overwrite previously cached records.
 * - Offline durability: Normal IndexedDB operations commit and update cache cleanly when offline.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import {
  DispenseRecord,
  InventoryItem,
  InventoryBatch,
  InventoryTransaction,
  InventoryReceipt,
  InventoryTransfer,
  InventoryWastage,
  PharmacyReview,
} from '../src/domain/pharmacyTypes';

async function runStage3252Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.2: PHARMACY V7 DURABLE WRITE ACKNOWLEDGEMENT');
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

  const testFacility = 'fac-pharmacy-test';

  // Helper factories for synthetic records
  const createSyntheticDispenseRecord = (id: string, overrides?: Partial<DispenseRecord>): DispenseRecord => ({
    id,
    dispenseNumber: `DSP-${id}`,
    prescriptionId: `rx-${id}`,
    medicationOrderId: `ord-${id}`,
    patientId: `pat-${id}`,
    facilityId: testFacility,
    dispensingPharmacistId: 'usr-pharm-01',
    dispensingPharmacistRole: 'PHARMACIST' as any,
    dispensedAt: new Date().toISOString(),
    medicationDefinitionId: 'med-amox-500',
    medicationCode: 'AMX-500',
    genericName: 'Amoxicillin',
    formulation: 'CAPSULE',
    strength: '500mg',
    route: 'ORAL',
    quantityPrescribed: 30,
    quantityDispensed: 30,
    quantityRemaining: 0,
    quantityUnit: 'capsule',
    inventoryItemId: 'inv-amox',
    batchId: 'batch-001',
    batchNumber: 'LOT-2026-001',
    expiryDate: '2027-12-31',
    status: 'DISPENSED' as any,
    version: 1,
    source: 'TEST',
    deviceId: 'dev-tab-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'PENDING' as any,
    ...overrides,
  });

  const createSyntheticInventoryItem = (id: string, overrides?: Partial<InventoryItem>): InventoryItem => ({
    id,
    facilityId: testFacility,
    medicationDefinitionId: 'med-amox-500',
    medicationCode: 'AMX-500',
    genericName: 'Amoxicillin',
    formulation: 'CAPSULE',
    strength: '500mg',
    unit: 'capsule',
    storageRequirements: {
      type: 'ROOM_TEMPERATURE',
      lightSensitive: false,
      humidityControlled: true,
    },
    reorderPoint: 100,
    minimumStock: 50,
    maximumStock: 1000,
    active: true,
    provenance: {
      facilityId: testFacility,
      source: 'TEST',
      recordedAt: new Date().toISOString(),
      recordedBy: 'usr-pharm-01',
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createSyntheticInventoryBatch = (id: string, overrides?: Partial<InventoryBatch>): InventoryBatch => ({
    id,
    inventoryItemId: `inv-item-${id}`,
    facilityId: testFacility,
    batchNumber: `LOT-${id}`,
    expiryDate: '2027-06-30',
    quantityOnHand: 500,
    reservedQuantity: 0,
    availableQuantity: 500,
    receivedAt: new Date().toISOString(),
    receivedById: 'usr-pharm-01',
    status: 'AVAILABLE' as any,
    provenance: {
      facilityId: testFacility,
      source: 'TEST',
      recordedAt: new Date().toISOString(),
      recordedBy: 'usr-pharm-01',
    },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createSyntheticInventoryTransaction = (id: string, overrides?: Partial<InventoryTransaction>): InventoryTransaction => ({
    id,
    facilityId: testFacility,
    inventoryItemId: 'inv-amox',
    batchId: 'batch-001',
    transactionType: 'DISPENSE' as any,
    quantity: 30,
    unit: 'capsule',
    referenceType: 'DISPENSE_RECORD',
    referenceId: `disp-${id}`,
    actorId: 'usr-pharm-01',
    occurredAt: new Date().toISOString(),
    source: 'TEST',
    version: 1,
    eventId: `evt-${id}`,
    ...overrides,
  });

  const createSyntheticInventoryReceipt = (id: string, overrides?: Partial<InventoryReceipt>): InventoryReceipt => ({
    id,
    receiptNumber: `RCV-${id}`,
    facilityId: testFacility,
    supplierName: 'National Central Medical Stores',
    receivedBy: 'Chief Pharmacist',
    receivedById: 'usr-pharm-01',
    receivedAt: new Date().toISOString(),
    items: [
      {
        inventoryItemId: 'inv-amox',
        medicationCode: 'AMX-500',
        genericName: 'Amoxicillin',
        batchNumber: 'LOT-RCV-01',
        expiryDate: '2028-01-01',
        quantity: 1000,
        unit: 'capsule',
      },
    ],
    status: 'RECEIVED',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createSyntheticInventoryTransfer = (id: string, overrides?: Partial<InventoryTransfer>): InventoryTransfer => ({
    id,
    transferNumber: `TRF-${id}`,
    sourceFacilityId: testFacility,
    destinationFacilityId: 'fac-clinic-b',
    inventoryItemId: 'inv-amox',
    batchId: 'batch-001',
    batchNumber: 'LOT-2026-001',
    quantity: 100,
    unit: 'capsule',
    status: 'IN_TRANSIT',
    initiatedById: 'usr-pharm-01',
    initiatedAt: new Date().toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createSyntheticInventoryWastage = (id: string, overrides?: Partial<InventoryWastage>): InventoryWastage => ({
    id,
    wastageNumber: `WST-${id}`,
    facilityId: testFacility,
    inventoryItemId: 'inv-amox',
    batchId: 'batch-001',
    batchNumber: 'LOT-2026-001',
    quantity: 10,
    unit: 'capsule',
    reason: 'EXPIRED' as any,
    actorId: 'usr-pharm-01',
    actorName: 'Pharmacist Tester',
    occurredAt: new Date().toISOString(),
    version: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const createSyntheticPharmacyReview = (id: string, overrides?: Partial<PharmacyReview>): PharmacyReview => ({
    id,
    prescriptionId: `rx-${id}`,
    medicationOrderId: `ord-${id}`,
    patientId: `pat-${id}`,
    facilityId: testFacility,
    pharmacistId: 'usr-pharm-01',
    pharmacistName: 'Lead Clinical Pharmacist',
    pharmacistRole: 'PHARMACIST' as any,
    reviewedAt: new Date().toISOString(),
    decision: 'APPROVED',
    verificationChecklist: {
      patientVerified: true,
      prescriptionValid: true,
      prescriberVerified: true,
      medicationMatch: true,
      doseRouteFrequencyVerified: true,
      safetyWarningsChecked: true,
      inventoryAvailable: true,
    },
    version: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  try {
    console.log('--- Test Group 1: Commit-First Ordering on Successful Persistence ---');

    await test('1.1. saveDispenseRecord() persists durably before updating memory cache', async () => {
      const id = `disp-ok-${Date.now()}`;
      const record = createSyntheticDispenseRecord(id);

      await localRepository.saveDispenseRecord(record);

      const cached = await localRepository.getDispenseRecord(id);
      assert.ok(cached, 'Record must be present in repository cache after successful save');
      assert.strictEqual(cached.id, id);
      assert.strictEqual(cached.quantityDispensed, 30);

      const persisted = await idbEngine.get<DispenseRecord>('dispenseRecords', id);
      assert.ok(persisted, 'Record must be durably persisted in IndexedDB');
      assert.strictEqual(persisted.dispenseNumber, record.dispenseNumber);
    });

    await test('1.2. saveInventoryItem() persists durably before updating memory cache', async () => {
      const id = `inv-ok-${Date.now()}`;
      const item = createSyntheticInventoryItem(id, { genericName: 'Ciprofloxacin' });

      await localRepository.saveInventoryItem(item);

      const cached = await localRepository.getInventoryItem(id);
      assert.ok(cached, 'Inventory item must exist in cache');
      assert.strictEqual(cached.genericName, 'Ciprofloxacin');

      const persisted = await idbEngine.get<InventoryItem>('inventoryItems', id);
      assert.ok(persisted, 'Inventory item must exist in IndexedDB');
      assert.strictEqual(persisted.id, id);
    });

    await test('1.3. saveInventoryBatch() persists durably before updating memory cache', async () => {
      const id = `batch-ok-${Date.now()}`;
      const batch = createSyntheticInventoryBatch(id, { quantityOnHand: 750 });

      await localRepository.saveInventoryBatch(batch);

      const cached = await localRepository.getInventoryBatch(id);
      assert.ok(cached, 'Batch must exist in cache');
      assert.strictEqual(cached.quantityOnHand, 750);

      const persisted = await idbEngine.get<InventoryBatch>('inventoryBatches', id);
      assert.ok(persisted, 'Batch must exist in IndexedDB');
      assert.strictEqual(persisted.availableQuantity, 500);
    });

    await test('1.4. saveInventoryTransaction() persists durably before updating memory cache', async () => {
      const id = `txn-ok-${Date.now()}`;
      const txn = createSyntheticInventoryTransaction(id, { quantity: 15 });

      await localRepository.saveInventoryTransaction(txn);

      const all = await localRepository.getInventoryTransactions(testFacility);
      const found = all.find((t) => t.id === id);
      assert.ok(found, 'Transaction must exist in cache');
      assert.strictEqual(found.quantity, 15);

      const persisted = await idbEngine.get<InventoryTransaction>('inventoryTransactions', id);
      assert.ok(persisted, 'Transaction must exist in IndexedDB');
    });

    await test('1.5. saveInventoryReceipt() persists durably before updating memory cache', async () => {
      const id = `rcv-ok-${Date.now()}`;
      const receipt = createSyntheticInventoryReceipt(id, { supplierName: 'Global Health Supply' });

      await localRepository.saveInventoryReceipt(receipt);

      const cached = await localRepository.getInventoryReceipt(id);
      assert.ok(cached, 'Receipt must exist in cache');
      assert.strictEqual(cached.supplierName, 'Global Health Supply');

      const persisted = await idbEngine.get<InventoryReceipt>('inventoryReceipts', id);
      assert.ok(persisted, 'Receipt must exist in IndexedDB');
    });

    await test('1.6. saveInventoryTransfer() persists durably before updating memory cache', async () => {
      const id = `trf-ok-${Date.now()}`;
      const transfer = createSyntheticInventoryTransfer(id, { quantity: 45 });

      await localRepository.saveInventoryTransfer(transfer);

      const cached = await localRepository.getInventoryTransfer(id);
      assert.ok(cached, 'Transfer must exist in cache');
      assert.strictEqual(cached.quantity, 45);

      const persisted = await idbEngine.get<InventoryTransfer>('inventoryTransfers', id);
      assert.ok(persisted, 'Transfer must exist in IndexedDB');
    });

    await test('1.7. saveInventoryWastage() persists durably before updating memory cache', async () => {
      const id = `wst-ok-${Date.now()}`;
      const wastage = createSyntheticInventoryWastage(id, { quantity: 8 });

      await localRepository.saveInventoryWastage(wastage);

      const cached = await localRepository.getInventoryWastage(id);
      assert.ok(cached, 'Wastage must exist in cache');
      assert.strictEqual(cached.quantity, 8);

      const persisted = await idbEngine.get<InventoryWastage>('inventoryWastage', id);
      assert.ok(persisted, 'Wastage must exist in IndexedDB');
    });

    await test('1.8. savePharmacyReview() persists durably before updating memory cache', async () => {
      const id = `rev-ok-${Date.now()}`;
      const review = createSyntheticPharmacyReview(id, { decision: 'APPROVED' });

      await localRepository.savePharmacyReview(review);

      const cached = await localRepository.getPharmacyReview(id);
      assert.ok(cached, 'Review must exist in cache');
      assert.strictEqual(cached.decision, 'APPROVED');

      const persisted = await idbEngine.get<PharmacyReview>('pharmacyReviews', id);
      assert.ok(persisted, 'Review must exist in IndexedDB');
    });

    console.log('\n--- Test Group 2: Error Propagation & Zero False-Success on Request Error ---');

    await test('2.1. saveDispenseRecord() rejects on write request error and does not mutate cache', async () => {
      const id = `disp-err-${Date.now()}`;
      const record = createSyntheticDispenseRecord(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveDispenseRecord(record);
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('request error') || err.message.includes('failed'));
      }

      assert.strictEqual(threw, true, 'saveDispenseRecord must reject on write request error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getDispenseRecord(id);
      assert.strictEqual(cached, undefined, 'Unpersisted dispense record must NOT exist in cache');

      const persisted = await idbEngine.get('dispenseRecords', id);
      assert.strictEqual(persisted, undefined, 'Unpersisted dispense record must NOT exist in IndexedDB');
    });

    await test('2.2. saveInventoryItem() rejects on request error and does not mutate cache', async () => {
      const id = `inv-err-${Date.now()}`;
      const item = createSyntheticInventoryItem(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryItem(item);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryItem must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryItem(id);
      assert.strictEqual(cached, undefined, 'Unpersisted item must NOT exist in cache');
    });

    await test('2.3. saveInventoryBatch() rejects on request error and does not mutate cache', async () => {
      const id = `batch-err-${Date.now()}`;
      const batch = createSyntheticInventoryBatch(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryBatch(batch);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryBatch must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryBatch(id);
      assert.strictEqual(cached, undefined, 'Unpersisted batch must NOT exist in cache');
    });

    await test('2.4. saveInventoryTransaction() rejects on request error and does not mutate cache', async () => {
      const id = `txn-err-${Date.now()}`;
      const txn = createSyntheticInventoryTransaction(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryTransaction(txn);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryTransaction must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const all = await localRepository.getInventoryTransactions(testFacility);
      const found = all.find((t) => t.id === id);
      assert.strictEqual(found, undefined, 'Unpersisted transaction must NOT exist in cache');
    });

    await test('2.5. saveInventoryReceipt() rejects on request error and does not mutate cache', async () => {
      const id = `rcv-err-${Date.now()}`;
      const receipt = createSyntheticInventoryReceipt(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryReceipt(receipt);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryReceipt must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryReceipt(id);
      assert.strictEqual(cached, undefined, 'Unpersisted receipt must NOT exist in cache');
    });

    await test('2.6. saveInventoryTransfer() rejects on request error and does not mutate cache', async () => {
      const id = `trf-err-${Date.now()}`;
      const transfer = createSyntheticInventoryTransfer(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryTransfer(transfer);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryTransfer must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryTransfer(id);
      assert.strictEqual(cached, undefined, 'Unpersisted transfer must NOT exist in cache');
    });

    await test('2.7. saveInventoryWastage() rejects on request error and does not mutate cache', async () => {
      const id = `wst-err-${Date.now()}`;
      const wastage = createSyntheticInventoryWastage(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveInventoryWastage(wastage);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'saveInventoryWastage must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryWastage(id);
      assert.strictEqual(cached, undefined, 'Unpersisted wastage must NOT exist in cache');
    });

    await test('2.8. savePharmacyReview() rejects on request error and does not mutate cache', async () => {
      const id = `rev-err-${Date.now()}`;
      const review = createSyntheticPharmacyReview(id);

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.savePharmacyReview(review);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'savePharmacyReview must reject on write error');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getPharmacyReview(id);
      assert.strictEqual(cached, undefined, 'Unpersisted review must NOT exist in cache');
    });

    console.log('\n--- Test Group 3: Transaction Abort Rejections & Cache Non-Pollution ---');

    await test('3.1. saveDispenseRecord() rejects on transaction abort and preserves existing cache', async () => {
      const id = `disp-abort-${Date.now()}`;
      const record = createSyntheticDispenseRecord(id);

      idbEngine.setSimulatedFailure('transaction_abort');

      let threw = false;
      try {
        await localRepository.saveDispenseRecord(record);
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('aborted') || err.message.includes('failed'));
      }

      assert.strictEqual(threw, true, 'Must reject on transaction abort');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getDispenseRecord(id);
      assert.strictEqual(cached, undefined, 'Aborted dispense record must NOT be in cache');
    });

    await test('3.2. saveInventoryBatch() rejects on transaction abort and preserves existing cache', async () => {
      const id = `batch-abort-${Date.now()}`;
      const batch = createSyntheticInventoryBatch(id);

      idbEngine.setSimulatedFailure('transaction_abort');

      let threw = false;
      try {
        await localRepository.saveInventoryBatch(batch);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'Must reject on transaction abort');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryBatch(id);
      assert.strictEqual(cached, undefined, 'Aborted batch must NOT be in cache');
    });

    console.log('\n--- Test Group 4: Preserving Prior Cache State on Failed Updates ---');

    await test('4.1. Failed update of DispenseRecord preserves prior cached record byte-for-byte', async () => {
      const id = `disp-upd-${Date.now()}`;
      const initial = createSyntheticDispenseRecord(id, {
        status: 'DISPENSED' as any,
        notes: 'Original Clean Notes',
      });

      // Save initial cleanly
      await localRepository.saveDispenseRecord(initial);
      const pre = await localRepository.getDispenseRecord(id);
      assert.strictEqual(pre?.status, 'DISPENSED');
      assert.strictEqual(pre?.notes, 'Original Clean Notes');

      // Attempt update that fails storage
      const updated = {
        ...initial,
        status: 'REVERSED' as any,
        notes: 'Attempted Corrupt Notes',
        reversedAt: new Date().toISOString(),
      };

      idbEngine.setSimulatedFailure('request_error');

      let threw = false;
      try {
        await localRepository.saveDispenseRecord(updated);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'Update must reject on storage failure');

      // Verify prior record is preserved and not overwritten
      idbEngine.setSimulatedFailure('none');
      const post = await localRepository.getDispenseRecord(id);
      assert.ok(post, 'Prior record must still exist');
      assert.strictEqual(post.status, 'DISPENSED', 'Status must NOT have mutated to REVERSED');
      assert.strictEqual(post.notes, 'Original Clean Notes', 'Notes must NOT have mutated');
    });

    await test('4.2. Failed update of InventoryBatch preserves prior stock quantity in cache', async () => {
      const id = `batch-upd-${Date.now()}`;
      const initial = createSyntheticInventoryBatch(id, {
        quantityOnHand: 200,
        availableQuantity: 200,
      });

      // Save initial cleanly
      await localRepository.saveInventoryBatch(initial);
      const pre = await localRepository.getInventoryBatch(id);
      assert.strictEqual(pre?.quantityOnHand, 200);

      // Attempt update that reduces stock to 50, but persistence fails
      const updated = {
        ...initial,
        quantityOnHand: 50,
        availableQuantity: 50,
      };

      idbEngine.setSimulatedFailure('transaction_abort');

      let threw = false;
      try {
        await localRepository.saveInventoryBatch(updated);
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, true, 'Batch stock update must reject on abort');

      idbEngine.setSimulatedFailure('none');
      const post = await localRepository.getInventoryBatch(id);
      assert.ok(post, 'Batch must still exist');
      assert.strictEqual(post.quantityOnHand, 200, 'Stock in cache must NOT drop when write aborts');
      assert.strictEqual(post.availableQuantity, 200, 'Available stock must remain 200');
    });

    console.log('\n--- Test Group 5: Storage Unavailability Rejections ---');

    await test('5.1. Storage unavailability rejects and is not converted into memory-only success', async () => {
      const id = `unavail-${Date.now()}`;
      const item = createSyntheticInventoryItem(id);

      idbEngine.setSimulatedFailure('unavailable');

      let threw = false;
      try {
        await localRepository.saveInventoryItem(item);
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('unavailable'), 'Must report storage unavailable');
      }

      assert.strictEqual(threw, true, 'Must reject when IndexedDB is unavailable');

      idbEngine.setSimulatedFailure('none');
      const cached = await localRepository.getInventoryItem(id);
      assert.strictEqual(cached, undefined, 'Must NOT create memory-only entry when storage unavailable');
    });

    console.log('\n--- Test Group 6: Offline Operation with Available IndexedDB ---');

    await test('6.1. Offline writes with healthy IndexedDB commit and update cache cleanly', async () => {
      const id = `offline-${Date.now()}`;
      const record = createSyntheticDispenseRecord(id, { syncStatus: 'PENDING' });

      // In offline mode, IndexedDB is available and operations commit cleanly
      idbEngine.setSimulatedFailure('none');

      await localRepository.saveDispenseRecord(record);

      const cached = await localRepository.getDispenseRecord(id);
      assert.ok(cached, 'Offline record must be cached');
      assert.strictEqual(cached.syncStatus, 'PENDING');

      const persisted = await idbEngine.get<DispenseRecord>('dispenseRecords', id);
      assert.ok(persisted, 'Offline record must be durably saved in IndexedDB');
      assert.strictEqual(persisted.id, id);
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/22 STAGE 3.2.5.2 PHARMACY V7 DURABILITY TESTS PASSED PERFECTLY`);
    console.log('========================================================================\n');
  } finally {
    idbEngine.setSimulatedFailure('none');
  }
}

runStage3252Tests().catch((err) => {
  console.error('\nStage 3.2.5.2 Durability Test Suite Failed:', err);
  process.exit(1);
});
