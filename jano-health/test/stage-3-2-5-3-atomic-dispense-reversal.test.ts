/**
 * JANO HEALTH — STAGE 3.2.5.3 TEST SUITE
 * ATOMIC DISPENSE REVERSAL & INVENTORY CONSISTENCY
 *
 * Verifies that the dispense reversal workflow (SRV-PHARM-01):
 * 1. Executes all required mutations (dispense record, inventory batch, reversal ledger transaction,
 *    prescription status, domain event, audit event, sync queue item) as a single atomic IndexedDB transaction.
 * 2. Enforces commit-first ordering: memory caches in LocalRepository and InventoryService are updated
 *    ONLY after the multi-store transaction commits successfully.
 * 3. Guarantees zero partial persistence: on transaction abort, request error, or storage unavailability,
 *    the entire operation rolls back, preserving pre-reversal states across all stores and caches.
 * 4. Strictly validates authorization, idempotency, and entity existence before transaction initiation.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { medicationService } from '../src/services/clinical/medicationService';
import { inventoryService } from '../src/services/pharmacy/inventoryService';
import { eventStore } from '../src/services/events/eventStore';
import { auditRepository } from '../src/services/audit/auditRepository';
import { syncQueue } from '../src/services/sync/syncQueue';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { AuthorizationError } from '../src/domain/permissions';
import {
  DispenseRecord,
  InventoryBatch,
  InventoryTransaction,
  InventoryItem,
} from '../src/domain/pharmacyTypes';
import { Prescription } from '../src/domain/medicationTypes';
import { generateUUIDv7 } from '../src/domain/identifiers';

async function runStage3253Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.3: ATOMIC DISPENSE REVERSAL & INVENTORY CONSISTENCY');
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

  const testFacility = 'fac-reversal-test';
  const pharmacistActor: ClinicalActorContext = {
    userId: 'usr-pharm-kofi',
    userName: 'Kofi Mensah, RPh',
    userRole: 'pharmacist' as any,
    facilityId: testFacility,
    deviceId: 'tab-dispensary-01',
    allowedFacilities: [testFacility],
  };

  const physicianActor: ClinicalActorContext = {
    userId: 'usr-doc-kwame',
    userName: 'Dr. Kwame Asante',
    userRole: 'physician' as any,
    facilityId: testFacility,
    deviceId: 'tab-consult-01',
    allowedFacilities: [testFacility],
  };

  // Helper factory for setup
  const setupDispenseScenario = async (config?: {
    batchStock?: number;
    dispensedQty?: number;
    prescribedQty?: number;
    priorDispensed?: number;
    untrackedBatch?: boolean;
  }) => {
    const id = generateUUIDv7();
    const batchStock = config?.batchStock ?? 80;
    const dispensedQty = config?.dispensedQty ?? 20;
    const prescribedQty = config?.prescribedQty ?? 50;
    const priorDispensed = config?.priorDispensed ?? dispensedQty;
    const isUntracked = config?.untrackedBatch ?? false;

    const batchId = isUntracked ? 'batch_untracked' : `batch_${id}`;
    const itemId = `item_${id}`;
    const rxId = `rx_${id}`;
    const dRecordId = `disp_${id}`;
    const now = new Date().toISOString();

    const inventoryItem: InventoryItem = {
      id: itemId,
      facilityId: testFacility,
      medicationDefinitionId: 'med-amox-500',
      medicationCode: 'AMX-500',
      genericName: 'Amoxicillin',
      formulation: 'CAPSULE',
      strength: '500mg',
      unit: 'capsule',
      storageRequirements: {} as any,
      minimumStock: 10,
      reorderPoint: 100,
      maximumStock: 1000,
      active: true,
      provenance: {} as any,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await localRepository.saveInventoryItem(inventoryItem);

    let batch: InventoryBatch | undefined;
    if (!isUntracked) {
      batch = {
        id: batchId,
        facilityId: testFacility,
        inventoryItemId: itemId,
        batchNumber: `LOT-${id}`,
        expiryDate: '2028-12-31',
        quantityOnHand: batchStock,
        reservedQuantity: 0,
        availableQuantity: batchStock,
        receivedAt: now,
        receivedById: pharmacistActor.userId,
        status: batchStock <= 0 ? 'DEPLETED' : 'AVAILABLE',
        supplierName: 'Global Meds',
        provenance: {} as any,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await localRepository.saveInventoryBatch(batch);
    }

    const prescription: Prescription = {
      id: rxId,
      prescriptionNumber: `RX-${id}`,
      medicationOrderId: `ord_${id}`,
      patientId: `pat_${id}`,
      encounterId: `enc_${id}`,
      facilityId: testFacility,
      prescriberId: physicianActor.userId,
      prescriberRole: physicianActor.userRole,
      prescriberName: physicianActor.userName,
      medicationDefinitionId: 'med-amox-500',
      genericName: 'Amoxicillin',
      formulation: 'CAPSULE',
      strength: '500mg',
      route: 'oral',
      dose: '500mg',
      frequency: 'TID',
      durationValue: 7,
      durationUnit: 'days',
      quantity: prescribedQty,
      quantityUnit: 'capsule',
      dispensedQuantity: priorDispensed,
      status: priorDispensed >= prescribedQty ? 'DISPENSED' : priorDispensed > 0 ? 'PARTIALLY_DISPENSED' : 'ISSUED',
      version: 1,
      issuedAt: now,
    } as any as Prescription;
    await localRepository.savePrescription(prescription);

    const dispenseRecord: DispenseRecord = {
      id: dRecordId,
      dispenseNumber: `DSP-${id}`,
      prescriptionId: rxId,
      medicationOrderId: `ord_${id}`,
      patientId: `pat_${id}`,
      encounterId: `enc_${id}`,
      facilityId: testFacility,
      dispensingPharmacistId: pharmacistActor.userId,
      dispensingPharmacistRole: pharmacistActor.userRole,
      dispensingPharmacistName: pharmacistActor.userName,
      dispensedAt: now,
      medicationDefinitionId: 'med-amox-500',
      medicationCode: 'AMX-500',
      genericName: 'Amoxicillin',
      formulation: 'CAPSULE',
      strength: '500mg',
      route: 'oral',
      quantityPrescribed: prescribedQty,
      quantityDispensed: dispensedQty,
      quantityRemaining: Math.max(0, prescribedQty - priorDispensed),
      quantityUnit: 'capsule',
      inventoryItemId: itemId,
      batchId,
      batchNumber: batch?.batchNumber,
      expiryDate: batch?.expiryDate,
      status: 'DISPENSED',
      version: 1,
      source: 'TEST',
      deviceId: pharmacistActor.deviceId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'offline_retained',
    } as any as DispenseRecord;
    await localRepository.saveDispenseRecord(dispenseRecord);

    return { itemId, batchId, rxId, dRecordId, batch, prescription, dispenseRecord };
  };

  // =========================================================================
  // GROUP 1: SUCCESSFUL ATOMIC DISPENSE REVERSAL & CACHE UPDATES
  // =========================================================================
  console.log('--- Test Group 1: Successful Atomic Dispense Reversal ---');

  await test('1.1. Full dispense reversal commits all records atomically and restores batch stock', async () => {
    const { batchId, rxId, dRecordId } = await setupDispenseScenario({
      batchStock: 80,
      dispensedQty: 20,
      prescribedQty: 20,
      priorDispensed: 20,
    });

    const reversed = await medicationService.reverseDispense(
      dRecordId,
      'Incorrect formulation selected by patient request',
      pharmacistActor
    );

    // 1. Verify returned DispenseRecord
    assert.strictEqual(reversed.status, 'REVERSED', 'Returned record must be REVERSED');
    assert.strictEqual(reversed.version, 2, 'Version must be incremented');
    assert.strictEqual(reversed.reversalReason, 'Incorrect formulation selected by patient request');
    assert.strictEqual(reversed.reversedById, pharmacistActor.userId);

    // 2. Verify DispenseRecord cache and durable storage
    const cachedDispense = await localRepository.getDispenseRecord(dRecordId);
    assert.strictEqual(cachedDispense?.status, 'REVERSED', 'Cached DispenseRecord must be REVERSED');
    const storedDispense = await idbEngine.get<DispenseRecord>('dispenseRecords', dRecordId);
    assert.strictEqual(storedDispense?.status, 'REVERSED', 'Stored DispenseRecord must be REVERSED');

    // 3. Verify Batch stock restoration in cache and durable storage
    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 100, 'Cached batch quantityOnHand restored to 100');
    assert.strictEqual(cachedBatch?.availableQuantity, 100, 'Cached batch availableQuantity restored to 100');
    assert.strictEqual(cachedBatch?.version, 2, 'Batch version incremented to 2');

    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 100, 'Stored batch quantityOnHand restored to 100');
    assert.strictEqual(storedBatch?.availableQuantity, 100, 'Stored batch availableQuantity restored to 100');

    // 4. Verify Reversal Ledger Transaction
    const txns = await localRepository.getInventoryTransactions(testFacility, undefined, batchId);
    const reversalTxn = txns.find((t) => t.transactionType === 'REVERSAL');
    assert(reversalTxn, 'Reversal inventory transaction must be created in cache');
    assert.strictEqual(reversalTxn.quantity, 20, 'Transaction quantity must be 20');
    assert.strictEqual(reversalTxn.referenceType, 'REVERSAL');

    const storedTxn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', reversalTxn.id);
    assert(storedTxn, 'Reversal transaction must be stored in IndexedDB');
    assert.strictEqual(storedTxn.transactionType, 'REVERSAL');

    // 5. Verify Prescription reverted to ISSUED
    const cachedRx = await localRepository.getPrescription(rxId);
    assert.strictEqual(cachedRx?.status, 'ISSUED', 'Prescription status reverted to ISSUED');
    assert.strictEqual(cachedRx?.dispensedQuantity, 0, 'Prescription dispensedQuantity reverted to 0');
    assert.strictEqual(cachedRx?.version, 2, 'Prescription version incremented to 2');

    const storedRx = await idbEngine.get<Prescription>('prescriptions', rxId);
    assert.strictEqual(storedRx?.status, 'ISSUED', 'Stored prescription status reverted to ISSUED');
    assert.strictEqual(storedRx?.dispensedQuantity, 0, 'Stored prescription dispensedQuantity reverted to 0');

    // 6. Verify Domain Event, Audit Log, and Sync Queue
    const domainEvents = await idbEngine.getAll<any>('domainEvents');
    const reversalEvent = domainEvents.find(
      (e) => e.eventType === 'DISPENSE_REVERSED' && e.aggregateId === dRecordId
    );
    assert(reversalEvent, 'DISPENSE_REVERSED domain event must be committed');

    const audits = await idbEngine.getAll<any>('auditLog');
    const reversalAudit = audits.find(
      (a) => a.action === 'DISPENSE_REVERSED' && a.resourceId === dRecordId
    );
    assert(reversalAudit, 'DISPENSE_REVERSED audit log must be committed');

    const queueItems = await idbEngine.getAll<any>('syncQueue');
    const queueEvent = queueItems.find(
      (q) => q.eventType === 'DISPENSE_REVERSED' && q.aggregateId === dRecordId
    );
    assert(queueEvent, 'SyncQueue item must be present');
  });

  await test('1.2. Partial dispense reversal reverts prescription to PARTIALLY_DISPENSED', async () => {
    // Total 50 prescribed, 40 previously dispensed, this dispense was 15 -> remaining dispensed is 25 > 0
    const { rxId, dRecordId } = await setupDispenseScenario({
      batchStock: 50,
      dispensedQty: 15,
      prescribedQty: 50,
      priorDispensed: 40,
    });

    const reversed = await medicationService.reverseDispense(
      dRecordId,
      'Partial return by patient',
      pharmacistActor
    );

    assert.strictEqual(reversed.status, 'REVERSED');
    const rx = await localRepository.getPrescription(rxId);
    assert.strictEqual(rx?.status, 'PARTIALLY_DISPENSED', 'Prescription must be PARTIALLY_DISPENSED');
    assert.strictEqual(rx?.dispensedQuantity, 25, 'Dispensed quantity must be 40 - 15 = 25');
  });

  await test('1.3. Untracked batch dispense reversal succeeds without modifying batch stores', async () => {
    const { rxId, dRecordId } = await setupDispenseScenario({
      dispensedQty: 10,
      prescribedQty: 10,
      untrackedBatch: true,
    });

    const reversed = await medicationService.reverseDispense(
      dRecordId,
      'Reversal for untracked bulk stock',
      pharmacistActor
    );

    assert.strictEqual(reversed.status, 'REVERSED');
    const rx = await localRepository.getPrescription(rxId);
    assert.strictEqual(rx?.status, 'ISSUED');
  });

  // =========================================================================
  // GROUP 2: ATOMIC ROLLBACK ON TRANSACTION ABORT
  // =========================================================================
  console.log('\n--- Test Group 2: Atomic Rollback on Transaction Abort ---');

  await test('2.1. Transaction abort rejects and preserves pre-reversal state across ALL stores and caches', async () => {
    const { batchId, rxId, dRecordId } = await setupDispenseScenario({
      batchStock: 60,
      dispensedQty: 25,
      prescribedQty: 25,
      priorDispensed: 25,
    });

    idbEngine.setSimulatedFailure('transaction_abort');

    let errorThrown = false;
    try {
      await medicationService.reverseDispense(
        dRecordId,
        'Should fail due to abort',
        pharmacistActor
      );
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('aborted') || err.message.includes('failed'), `Error: ${err.message}`);
    }
    assert.strictEqual(errorThrown, true, 'reverseDispense must reject on transaction abort');

    // INVARIANT CHECK: In-memory cache must NOT reflect the reversal!
    const cachedDispense = await localRepository.getDispenseRecord(dRecordId);
    assert.strictEqual(cachedDispense?.status, 'DISPENSED', 'Cache MUST remain DISPENSED (no mutation)');
    assert.strictEqual(cachedDispense?.version, 1, 'Version must remain 1');

    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 60, 'Cached batch quantityOnHand must remain 60');
    assert.strictEqual(cachedBatch?.availableQuantity, 60, 'Cached batch availableQuantity must remain 60');

    const cachedRx = await localRepository.getPrescription(rxId);
    assert.strictEqual(cachedRx?.status, 'DISPENSED', 'Cached prescription status must remain DISPENSED');
    assert.strictEqual(cachedRx?.dispensedQuantity, 25, 'Cached prescription dispensedQuantity must remain 25');

    const txns = await localRepository.getInventoryTransactions(testFacility, undefined, batchId);
    const reversalTxn = txns.find((t) => t.transactionType === 'REVERSAL');
    assert(!reversalTxn, 'No reversal transaction must exist in cache');

    // INVARIANT CHECK: Durable storage must NOT reflect the reversal!
    const storedDispense = await idbEngine.get<DispenseRecord>('dispenseRecords', dRecordId);
    assert.strictEqual(storedDispense?.status, 'DISPENSED', 'Stored record must remain DISPENSED');

    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 60, 'Stored batch must remain 60');

    const storedRx = await idbEngine.get<Prescription>('prescriptions', rxId);
    assert.strictEqual(storedRx?.status, 'DISPENSED', 'Stored prescription must remain DISPENSED');
  });

  // =========================================================================
  // GROUP 3: ATOMIC ROLLBACK ON REQUEST ERROR
  // =========================================================================
  console.log('\n--- Test Group 3: Atomic Rollback on Request Error ---');

  await test('3.1. Write request error rejects and preserves pre-reversal state across ALL stores', async () => {
    const { batchId, rxId, dRecordId } = await setupDispenseScenario({
      batchStock: 45,
      dispensedQty: 10,
      prescribedQty: 10,
      priorDispensed: 10,
    });

    idbEngine.setSimulatedFailure('request_error');

    let errorThrown = false;
    try {
      await medicationService.reverseDispense(
        dRecordId,
        'Should fail due to request error',
        pharmacistActor
      );
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('request error') || err.message.includes('failed'), `Error: ${err.message}`);
    }
    assert.strictEqual(errorThrown, true, 'reverseDispense must reject on request error');

    // Invariant: Zero partial updates
    const cachedDispense = await localRepository.getDispenseRecord(dRecordId);
    assert.strictEqual(cachedDispense?.status, 'DISPENSED', 'Cache must remain DISPENSED');

    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 45, 'Batch stock must remain untouched');

    const cachedRx = await localRepository.getPrescription(rxId);
    assert.strictEqual(cachedRx?.status, 'DISPENSED', 'Prescription must remain DISPENSED');
  });

  // =========================================================================
  // GROUP 4: ATOMIC ROLLBACK ON STORAGE UNAVAILABILITY
  // =========================================================================
  console.log('\n--- Test Group 4: Storage Unavailability Rejections ---');

  await test('4.1. Unavailable database rejects immediately and does NOT perform memory-only reversal', async () => {
    const { batchId, rxId, dRecordId } = await setupDispenseScenario({
      batchStock: 75,
      dispensedQty: 15,
      prescribedQty: 15,
      priorDispensed: 15,
    });

    idbEngine.setSimulatedFailure('unavailable');

    let errorThrown = false;
    try {
      await medicationService.reverseDispense(
        dRecordId,
        'Should fail due to unavailable DB',
        pharmacistActor
      );
    } catch (err: any) {
      errorThrown = true;
      assert(err.message.includes('unavailable'), `Error: ${err.message}`);
    }
    assert.strictEqual(errorThrown, true, 'Must reject when database is unavailable');

    // Invariant: No false-success in memory
    const cachedDispense = await localRepository.getDispenseRecord(dRecordId);
    assert.strictEqual(cachedDispense?.status, 'DISPENSED', 'Must NOT become REVERSED in memory fallback');

    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 75, 'Batch stock must NOT increase in memory');

    const cachedRx = await localRepository.getPrescription(rxId);
    assert.strictEqual(cachedRx?.status, 'DISPENSED', 'Prescription must NOT revert in memory');
  });

  // =========================================================================
  // GROUP 5: VALIDATION & SAFETY GUARDS
  // =========================================================================
  console.log('\n--- Test Group 5: Validation & Safety Guards ---');

  await test('5.1. Non-dispensing role (physician) is blocked with AuthorizationError before persistence', async () => {
    const { dRecordId } = await setupDispenseScenario();

    let authErrorCaught = false;
    try {
      await medicationService.reverseDispense(
        dRecordId,
        'Unauthorized reversal attempt',
        physicianActor
      );
    } catch (err: any) {
      authErrorCaught = err instanceof AuthorizationError || err.name === 'AuthorizationError';
    }
    assert.strictEqual(authErrorCaught, true, 'Physician must be blocked with AuthorizationError');
  });

  await test('5.2. Non-existent dispense record ID rejects with not found error', async () => {
    let notFoundCaught = false;
    try {
      await medicationService.reverseDispense(
        'disp_nonexistent_99999',
        'Should fail',
        pharmacistActor
      );
    } catch (err: any) {
      notFoundCaught = err.message.includes('not found');
    }
    assert.strictEqual(notFoundCaught, true, 'Non-existent dispense record must throw not found error');
  });

  await test('5.3. Already reversed dispense record rejects idempotency violation', async () => {
    const { dRecordId } = await setupDispenseScenario();

    // First reversal succeeds
    await medicationService.reverseDispense(dRecordId, 'First valid reversal', pharmacistActor);

    // Second reversal attempt must fail
    let alreadyReversedCaught = false;
    try {
      await medicationService.reverseDispense(dRecordId, 'Duplicate reversal attempt', pharmacistActor);
    } catch (err: any) {
      alreadyReversedCaught = err.message.includes('already been reversed');
    }
    assert.strictEqual(alreadyReversedCaught, true, 'Duplicate reversal must be rejected');
  });

  await test('5.4. Missing batch for tracked dispense record throws batch not found error', async () => {
    const id = generateUUIDv7();
    const dRecordId = `disp_${id}`;
    const now = new Date().toISOString();

    const dRecord: DispenseRecord = {
      id: dRecordId,
      dispenseNumber: `DSP-${id}`,
      prescriptionId: `rx_${id}`,
      medicationOrderId: `ord_${id}`,
      patientId: `pat_${id}`,
      encounterId: `enc_${id}`,
      facilityId: testFacility,
      dispensingPharmacistId: pharmacistActor.userId,
      dispensingPharmacistRole: pharmacistActor.userRole,
      dispensingPharmacistName: pharmacistActor.userName,
      dispensedAt: now,
      medicationDefinitionId: 'med-amox-500',
      medicationCode: 'AMX-500',
      genericName: 'Amoxicillin',
      formulation: 'CAPSULE',
      strength: '500mg',
      route: 'oral',
      quantityPrescribed: 10,
      quantityDispensed: 10,
      quantityRemaining: 0,
      quantityUnit: 'capsule',
      inventoryItemId: `item_${id}`,
      batchId: `batch_missing_${id}`,
      batchNumber: 'LOT-MISSING',
      expiryDate: '2028-12-31',
      status: 'DISPENSED',
      version: 1,
      source: 'TEST',
      deviceId: pharmacistActor.deviceId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'offline_retained',
    } as any as DispenseRecord;
    await localRepository.saveDispenseRecord(dRecord);

    let batchErrorCaught = false;
    try {
      await medicationService.reverseDispense(dRecordId, 'Should fail', pharmacistActor);
    } catch (err: any) {
      batchErrorCaught = err.message.includes('Batch not found');
    }
    assert.strictEqual(batchErrorCaught, true, 'Missing batch must throw Batch not found error');
  });

  // =========================================================================
  // GROUP 6: DIRECT INVENTORY SERVICE ATOMICITY
  // =========================================================================
  console.log('\n--- Test Group 6: Direct inventoryService.reverseDispenseStock() Atomicity ---');

  await test('6.1. Direct reverseDispenseStock() commits batch and ledger atomically', async () => {
    const { batchId, itemId } = await setupDispenseScenario({ batchStock: 50 });

    const txn = await inventoryService.reverseDispenseStock(
      {
        facilityId: testFacility,
        inventoryItemId: itemId,
        batchId,
        quantity: 10,
        dispenseNumber: 'DSP-TEST-001',
        reason: 'Direct inventory reversal test',
      },
      pharmacistActor
    );

    assert.strictEqual(txn.transactionType, 'REVERSAL');
    const updatedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(updatedBatch?.quantityOnHand, 60, 'Batch restored by 10 to 60');

    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 60, 'Stored batch restored by 10 to 60');
  });

  await test('6.2. Direct reverseDispenseStock() rolls back both stores and caches on abort', async () => {
    const { batchId, itemId } = await setupDispenseScenario({ batchStock: 50 });

    idbEngine.setSimulatedFailure('transaction_abort');

    let abortCaught = false;
    try {
      await inventoryService.reverseDispenseStock(
        {
          facilityId: testFacility,
          inventoryItemId: itemId,
          batchId,
          quantity: 10,
          dispenseNumber: 'DSP-TEST-002',
          reason: 'Direct abort test',
        },
        pharmacistActor
      );
    } catch (err: any) {
      abortCaught = true;
    }
    assert.strictEqual(abortCaught, true, 'Must reject on transaction abort');

    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 50, 'Batch stock must NOT change in cache');

    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 50, 'Batch stock must NOT change in store');
  });

  await test('6.3. Batch ledger consistency check verifies delta === 0 after reverseDispense', async () => {
    const { batchId, itemId, dRecordId } = await setupDispenseScenario({
      batchStock: 100,
      dispensedQty: 30,
      prescribedQty: 30,
      priorDispensed: 30,
    });

    // Add initial receipt transaction so ledger matches initial batchStock of 100
    const receiptTxn: InventoryTransaction = {
      id: `txn_rcv_${generateUUIDv7()}`,
      facilityId: testFacility,
      inventoryItemId: itemId,
      batchId,
      transactionType: 'RECEIPT',
      quantity: 130,
      unit: 'units',
      referenceType: 'RECEIPT',
      referenceId: 'RCV-001',
      actorId: pharmacistActor.userId,
      actorName: pharmacistActor.userName,
      actorRole: pharmacistActor.userRole,
      occurredAt: new Date(Date.now() - 3600000).toISOString(),
      reason: 'Initial receipt',
      source: 'TEST',
      version: 1,
      eventId: 'evt_rcv',
    };
    await localRepository.saveInventoryTransaction(receiptTxn);

    // Initial dispense transaction of 30
    const dispenseTxn: InventoryTransaction = {
      id: `txn_dsp_${generateUUIDv7()}`,
      facilityId: testFacility,
      inventoryItemId: itemId,
      batchId,
      transactionType: 'DISPENSE',
      quantity: 30,
      unit: 'units',
      referenceType: 'DISPENSE_RECORD',
      referenceId: 'DSP-001',
      actorId: pharmacistActor.userId,
      actorName: pharmacistActor.userName,
      actorRole: pharmacistActor.userRole,
      occurredAt: new Date(Date.now() - 1800000).toISOString(),
      reason: 'Initial dispense',
      source: 'TEST',
      version: 1,
      eventId: 'evt_dsp',
    };
    await localRepository.saveInventoryTransaction(dispenseTxn);

    const consistencyBefore = await inventoryService.verifyBatchLedgerConsistency(batchId);
    assert.strictEqual(consistencyBefore.consistent, true, 'Ledger must be consistent before reversal');

    await medicationService.reverseDispense(dRecordId, 'Ledger consistency test', pharmacistActor);

    const consistencyAfter = await inventoryService.verifyBatchLedgerConsistency(batchId);
    assert.strictEqual(consistencyAfter.consistent, true, 'Ledger must be consistent after reversal');
    assert.strictEqual(consistencyAfter.batchQuantity, 130, 'Batch quantity must reconcile to 130');
    assert.strictEqual(consistencyAfter.delta, 0, 'Ledger delta must be exactly 0');
  });

  // =========================================================================
  // GROUP 7: CONCURRENT DISPENSE-REVERSAL PROTECTION & ATOMIC COMMIT GUARDS (CONC-PHARM-01)
  // =========================================================================
  console.log('--- Test Group 7: Concurrent Dispense-Reversal Protection & Commit Guards (CONC-PHARM-01) ---');

  await test('7.1. Simultaneous reverseDispense() calls fulfill exactly once and reject duplicate reversal', async () => {
    const { batchId, dRecordId } = await setupDispenseScenario({
      batchStock: 50,
      dispensedQty: 20,
    });

    const results = await Promise.allSettled([
      medicationService.reverseDispense(dRecordId, 'Concurrent Reversal Request A', pharmacistActor),
      medicationService.reverseDispense(dRecordId, 'Concurrent Reversal Request B', pharmacistActor),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent reversal must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one concurrent reversal must be rejected');

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    assert(
      rejectionReason?.message?.includes('already been reversed') ||
      rejectionReason?.message?.includes('Concurrency conflict'),
      `Rejection message must indicate reversal conflict, got: ${rejectionReason?.message}`
    );

    // Verify batch stock restored exactly ONCE: 50 + 20 = 70 (NOT 90)
    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 70, 'Cached batchOnHand must be 70, not double-restored');
    assert.strictEqual(cachedBatch?.availableQuantity, 70, 'Cached batch availableQuantity must be 70');

    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 70, 'Durable batch quantityOnHand must be 70');
    assert.strictEqual(storedBatch?.availableQuantity, 70, 'Durable batch availableQuantity must be 70');

    // Verify exactly ONE reversal transaction exists in ledger
    const allTxns = await localRepository.getInventoryTransactions(testFacility, undefined, batchId);
    const reversalTxns = allTxns.filter((t) => t.transactionType === 'REVERSAL');
    assert.strictEqual(reversalTxns.length, 1, 'Exactly 1 REVERSAL ledger transaction must exist');

    // Verify DispenseRecord status
    const storedDispense = await idbEngine.get<DispenseRecord>('dispenseRecords', dRecordId);
    assert.strictEqual(storedDispense?.status, 'REVERSED');
    assert.strictEqual(storedDispense?.version, 2);
  });

  await test('7.2. In-transaction conditional commit check aborts when live dispense record is already reversed', async () => {
    const { dRecordId } = await setupDispenseScenario();

    // Perform initial reversal
    await medicationService.reverseDispense(dRecordId, 'Initial reversal', pharmacistActor);

    // Attempt direct transaction execution with precondition expecting DISPENSED / version 1
    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(
          ['dispenseRecords'],
          async (txContext) => {
            await txContext.put('dispenseRecords', {
              id: dRecordId,
              status: 'REVERSED',
              version: 99,
            });
          },
          [
            {
              store: 'dispenseRecords',
              key: dRecordId,
              expectedVersion: 1,
              predicate: (rec) => rec && rec.status !== 'REVERSED' && rec.version === 1,
              errorMessage: `DispenseRecord ${dRecordId} has already been reversed.`,
            },
          ]
        );
      },
      (err: any) => {
        assert(err.message.includes('already been reversed'), 'Precondition must fail and abort transaction');
        return true;
      }
    );

    // Verify dispense record was NOT overwritten by the aborted transaction
    const stored = await idbEngine.get<DispenseRecord>('dispenseRecords', dRecordId);
    assert.strictEqual(stored?.version, 2, 'Version must remain 2 from initial reversal');
  });

  await test('7.3. Concurrency precondition aborts transaction if inventory batch version was modified', async () => {
    const { batchId } = await setupDispenseScenario({ batchStock: 100 });

    const currentBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert(currentBatch, 'Batch must exist');

    // Concurrently simulate an out-of-band batch modification
    const modifiedBatch = { ...currentBatch, version: currentBatch.version + 1, quantityOnHand: 95 };
    await idbEngine.put('inventoryBatches', modifiedBatch);

    // Attempt a transaction with stale precondition on initial batch version
    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(
          ['inventoryBatches'],
          async (txContext) => {
            await txContext.put('inventoryBatches', {
              ...currentBatch,
              quantityOnHand: 120,
              version: currentBatch.version + 1,
            });
          },
          [
            {
              store: 'inventoryBatches',
              key: batchId,
              expectedVersion: currentBatch.version, // stale version
              errorMessage: `Concurrency conflict on batch ${batchId}`,
            },
          ]
        );
      },
      (err: any) => {
        assert(err.message.includes('Concurrency conflict'), 'Precondition must detect version divergence');
        return true;
      }
    );

    // Verify batch remains at modifiedBatch state, NOT overwritten by aborted transaction
    const finalBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 95);
    assert.strictEqual(finalBatch?.version, currentBatch.version + 1);
  });

  await test('7.4. High-concurrency burst of 5 simultaneous reverseDispense calls fulfills exactly 1', async () => {
    const { batchId, dRecordId } = await setupDispenseScenario({
      batchStock: 100,
      dispensedQty: 15,
    });

    const burstCalls = Array.from({ length: 5 }, (_, i) =>
      medicationService.reverseDispense(dRecordId, `Burst Reversal #${i + 1}`, pharmacistActor)
    );

    const outcomes = await Promise.allSettled(burstCalls);
    const successes = outcomes.filter((o) => o.status === 'fulfilled');
    const failures = outcomes.filter((o) => o.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Exactly 1 burst call must fulfill');
    assert.strictEqual(failures.length, 4, 'All 4 competing burst calls must reject');

    // Verify inventory restored exactly once: 100 + 15 = 115
    const storedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert.strictEqual(storedBatch?.quantityOnHand, 115, 'Burst must restore stock exactly once (115)');

    // Verify ledger has exactly 1 REVERSAL transaction for this batch
    const txns = await localRepository.getInventoryTransactions(testFacility, undefined, batchId);
    const reversalTxns = txns.filter((t) => t.transactionType === 'REVERSAL');
    assert.strictEqual(reversalTxns.length, 1, 'Ledger must have exactly 1 reversal transaction');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`ALL ${passed}/17 STAGE 3.2.5.3 ATOMIC DISPENSE REVERSAL TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage3253Tests().catch((err) => {
  console.error('\nSTAGE 3.2.5.3 TEST SUITE ENCOUNTERED UNEXPECTED ERROR:', err);
  process.exit(1);
});
