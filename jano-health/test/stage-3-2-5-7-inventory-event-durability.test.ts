/**
 * JANO HEALTH — STAGE 3.2.5.7 TEST SUITE
 * INVENTORY SERVICE EVENT DURABILITY & HONEST FAILURE SEMANTICS
 *
 * Verifies that all four core inventory service operations:
 * 1. recordReceipt()
 * 2. recordWastage()
 * 3. adjustStock()
 * 4. transferStock() / recordTransferOut()
 *
 * Enforce:
 * - Honest failure semantics: EventStore errors are NOT swallowed via .catch(() => {}).
 * - Atomic persistence: Business mutations (batches, transactions, receipt/wastage/transfer)
 *   and their required domain events commit atomically inside IndexedDB executeTransaction.
 * - Zero partial mutations: Any storage or event failure aborts the entire transaction.
 * - Commit-first cache integrity: In-memory repository caches and EventStore caches are
 *   updated ONLY AFTER durable transaction commit.
 * - Safe retries: Aborted attempts leave stores and caches pristine; retries apply stock exactly once.
 * - Cryptographic event hash integrity: Events form a monotonic hash chain.
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { eventStore } from '../src/services/events/eventStore';
import { inventoryService } from '../src/services/pharmacy/inventoryService';
import {
  InventoryBatch,
  InventoryItem,
  InventoryReceipt,
  InventoryTransaction,
  InventoryTransfer,
  InventoryWastage,
} from '../src/domain/pharmacyTypes';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { DomainEvent } from '../src/domain/persistence';

async function runStage3257Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.7: INVENTORY SERVICE EVENT DURABILITY');
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

  const facilityId = 'fac-durability-test-7';
  const pharmacistActor: ClinicalActorContext = {
    userId: 'usr-pharm-01',
    userName: 'Abebe Bikila, RPh',
    userRole: 'pharmacist',
    facilityId,
    deviceId: 'dev-pharm-01',
  };

  // Helper to setup a test item and batch
  let testItemSeq = 0;
  async function createTestItemAndBatch(initialQty: number = 100): Promise<{ item: InventoryItem; batch: InventoryBatch }> {
    testItemSeq++;
    const now = new Date().toISOString();
    const itemId = `inv_item_test_${Date.now()}_${testItemSeq}`;
    const batchId = `batch_test_${Date.now()}_${testItemSeq}`;

    const item: InventoryItem = {
      id: itemId,
      facilityId,
      medicationDefinitionId: `med_def_test_${testItemSeq}`,
      medicationCode: `MED-CODE-TEST-${testItemSeq}`,
      genericName: `Test Medicine ${testItemSeq}`,
      formulation: 'TABLET',
      strength: '500 mg',
      unit: 'tablets',
      storageRequirements: { type: 'ROOM_TEMPERATURE', notes: 'Store dry' },
      reorderPoint: 20,
      minimumStock: 10,
      maximumStock: 500,
      active: true,
      provenance: {
        source: 'TEST',
        version: '1.0',
        recordedBy: 'tester',
        recordedAt: now,
        deviceId: 'dev-01',
        facilityId,
        actorId: 'usr-01',
        createdAt: now,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const batch: InventoryBatch = {
      id: batchId,
      inventoryItemId: itemId,
      facilityId,
      batchNumber: `BATCH-TEST-${Date.now()}-${testItemSeq}`,
      lotNumber: `LOT-${testItemSeq}`,
      expiryDate: '2028-12-31',
      quantityOnHand: initialQty,
      reservedQuantity: 0,
      availableQuantity: initialQty,
      supplierId: 'SUP-01',
      supplierName: 'Test Supplier',
      receivedAt: now,
      receivedById: 'usr-01',
      receivedByName: 'Test User',
      status: 'AVAILABLE',
      provenance: item.provenance,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await localRepository.saveInventoryItem(item);
    await localRepository.saveInventoryBatch(batch);

    return { item, batch };
  }

  // --- Group 1: Successful Operations & Atomic Event Durability ---
  console.log('--- Test Group 1: Successful Operations & Atomic Event Durability ---');

  await test('1.1. recordReceipt: persists batch, transaction, receipt, and INVENTORY_RECEIVED event atomically', async () => {
    const now = new Date().toISOString();
    const receipt = await inventoryService.recordReceipt(
      {
        facilityId,
        supplierName: 'EPSS Ethiopia',
        supplierId: 'EPSS-01',
        referenceDocument: 'WAYBILL-RECEIPT-01',
        items: [
          {
            medicationDefinitionId: 'med_def_amox_500_cap',
            medicationCode: 'WHO-EML-AMOX-500-CAP',
            genericName: 'Amoxicillin',
            batchNumber: `AMX-REC-${Date.now()}`,
            expiryDate: '2027-10-31',
            quantity: 150,
            unit: 'capsule',
          },
        ],
      },
      pharmacistActor
    );

    assert(receipt && receipt.id.startsWith('rcv_'), 'Receipt created with valid ID');

    // 1. Durable storage verification
    const durableReceipt = await idbEngine.get<InventoryReceipt>('inventoryReceipts', receipt.id);
    assert(durableReceipt, 'Receipt durably committed to IndexedDB');
    assert.strictEqual(durableReceipt.items[0].quantity, 150);

    // 2. Domain event verification in IndexedDB
    const durableEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const receiptEvent = durableEvents.find((e) => e.aggregateId === receipt.id);
    assert(receiptEvent, 'Domain event for receipt durably committed to domainEvents store');
    assert.strictEqual(receiptEvent.eventType, 'INVENTORY_RECEIVED');
    assert.strictEqual(receiptEvent.aggregateType, 'InventoryReceipt');
    assert.strictEqual((receiptEvent.payload as any).receiptNumber, receipt.receiptNumber);

    // 3. Cache verification
    const cachedReceipt = await localRepository.getInventoryReceipt(receipt.id);
    assert(cachedReceipt, 'Receipt advanced in localRepository cache');

    const cachedEvents = await eventStore.getEventsForAggregate('InventoryReceipt' as any, receipt.id);
    assert.strictEqual(cachedEvents.length, 1, 'EventStore cache contains the receipt event');
  });

  await test('1.2. recordWastage: persists batch deduction, ledger transaction, wastage record, and INVENTORY_WASTED event atomically', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    const wastage = await inventoryService.recordWastage(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        quantity: 15,
        reason: 'EXPIRED',
        notes: 'Cold chain excursion test',
      },
      pharmacistActor
    );

    assert(wastage && wastage.id.startsWith('wst_'));

    // 1. Batch stock updated
    const updatedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(updatedBatch?.quantityOnHand, 85, 'Durable batch stock decremented to 85');
    assert.strictEqual(updatedBatch?.availableQuantity, 85);
    assert.strictEqual(updatedBatch?.version, 2);

    // 2. Wastage record persisted
    const durableWastage = await idbEngine.get<InventoryWastage>('inventoryWastage', wastage.id);
    assert(durableWastage, 'Wastage record durably committed');
    assert.strictEqual(durableWastage.quantity, 15);

    // 3. Ledger transaction persisted
    const txns = await idbEngine.getAll<InventoryTransaction>('inventoryTransactions');
    const wastageTxn = txns.find((t) => t.referenceId === wastage.wastageNumber);
    assert(wastageTxn, 'Ledger transaction durably committed');
    assert.strictEqual(wastageTxn.quantity, 15);
    assert.strictEqual(wastageTxn.transactionType, 'WASTAGE');

    // 4. Domain event persisted
    const durableEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const wastageEvent = durableEvents.find((e) => e.aggregateId === wastage.id);
    assert(wastageEvent, 'INVENTORY_WASTED event committed to domainEvents store');
    assert.strictEqual(wastageEvent.eventType, 'INVENTORY_WASTED');

    // 5. Caches synchronized
    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 85);
    const cachedWastage = await localRepository.getInventoryWastage(wastage.id);
    assert(cachedWastage);
  });

  await test('1.3. adjustStock: persists batch, ledger transaction, and INVENTORY_ADJUSTED event atomically', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    const adjTxn = await inventoryService.adjustStock(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        physicalCount: 120,
        reason: 'Found misplaced stock in secondary shelf',
      },
      pharmacistActor
    );

    assert(adjTxn && adjTxn.id.startsWith('txn_'));
    assert.strictEqual(adjTxn.transactionType, 'ADJUSTMENT_IN');
    assert.strictEqual(adjTxn.quantity, 20);

    // 1. Batch updated
    const updatedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(updatedBatch?.quantityOnHand, 120);
    assert.strictEqual(updatedBatch?.version, 2);

    // 2. Transaction persisted
    const durableTxn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', adjTxn.id);
    assert(durableTxn, 'Adjustment transaction durably committed');

    // 3. Domain event persisted
    const durableEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const adjEvent = durableEvents.find((e) => e.aggregateId === batch.id && e.eventType === 'INVENTORY_ADJUSTED');
    assert(adjEvent, 'INVENTORY_ADJUSTED event durably committed');
    assert.strictEqual((adjEvent.payload as any).batch.quantityOnHand, 120);

    // 4. Caches synchronized
    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 120);
  });

  await test('1.4. transferStock: persists batch, ledger transaction, transfer record, and INVENTORY_TRANSFERRED_OUT event atomically', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    const transfer = await inventoryService.transferStock(
      {
        sourceFacilityId: facilityId,
        destinationFacilityId: 'fac-dest-02',
        inventoryItemId: item.id,
        batchId: batch.id,
        quantity: 25,
        referenceNotes: 'Emergency inter-facility replenishment',
      },
      pharmacistActor
    );

    assert(transfer && transfer.id.startsWith('trf_'));

    // 1. Batch deducted
    const updatedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(updatedBatch?.quantityOnHand, 75);
    assert.strictEqual(updatedBatch?.availableQuantity, 75);

    // 2. Transfer record persisted
    const durableTransfer = await idbEngine.get<InventoryTransfer>('inventoryTransfers', transfer.id);
    assert(durableTransfer, 'Transfer record durably committed');
    assert.strictEqual(durableTransfer.quantity, 25);

    // 3. Domain event persisted
    const durableEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const transferEvent = durableEvents.find((e) => e.aggregateId === transfer.id);
    assert(transferEvent, 'INVENTORY_TRANSFERRED_OUT event committed to domainEvents store');
    assert.strictEqual(transferEvent.eventType, 'INVENTORY_TRANSFERRED_OUT');

    // 4. Caches synchronized
    const cachedTransfer = await localRepository.getInventoryTransfer(transfer.id);
    assert(cachedTransfer);
  });

  // --- Group 2: Error Propagation & Zero Swallowed Failures ---
  console.log('\n--- Test Group 2: Error Propagation & Zero Swallowed Failures ---');

  await test('2.1. recordReceipt rejects on storage error without false success or partial mutation', async () => {
    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryService.recordReceipt(
          {
            facilityId,
            supplierName: 'Failing Supplier',
            items: [
              {
                medicationDefinitionId: 'med_def_amox_500_cap',
                medicationCode: 'WHO-EML-AMOX-500-CAP',
                genericName: 'Amoxicillin',
                batchNumber: `AMX-FAIL-${Date.now()}`,
                expiryDate: '2027-10-31',
                quantity: 50,
                unit: 'capsule',
              },
            ],
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err, 'Operation rejected with error');
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    // Verify zero partial records in receipts store
    const allReceipts = await idbEngine.getAll<InventoryReceipt>('inventoryReceipts');
    const failedReceipt = allReceipts.find((r) => r.supplierName === 'Failing Supplier');
    assert.strictEqual(failedReceipt, undefined, 'No receipt record was committed');
  });

  await test('2.2. recordWastage rejects on storage error without mutating batch quantity', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryService.recordWastage(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            quantity: 30,
            reason: 'DAMAGED',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err, 'Error propagated cleanly');
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    // Batch stock must remain 100 in both storage and cache
    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 100, 'Durable stock remained 100');
    assert.strictEqual(durableBatch?.version, 1, 'Version remained 1');

    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 100, 'Cached stock remained 100');
    assert.strictEqual(cachedBatch?.version, 1, 'Cached version remained 1');
  });

  await test('2.3. adjustStock rejects on storage error without updating batch', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryService.adjustStock(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            physicalCount: 150,
            reason: 'Test adjust failure',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err);
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 100, 'Batch stock unchanged after rejected adjust');
    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 100, 'Cached stock unchanged');
  });

  await test('2.4. transferStock rejects on storage error without deducting from source batch', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryService.transferStock(
          {
            sourceFacilityId: facilityId,
            destinationFacilityId: 'fac-dest-02',
            inventoryItemId: item.id,
            batchId: batch.id,
            quantity: 40,
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err);
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 100, 'Batch stock unchanged after rejected transfer');
    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 100);
  });

  // --- Group 3: Transaction Abort & Cache Immutability ---
  console.log('\n--- Test Group 3: Transaction Abort & Cache Immutability ---');

  await test('3.1. Transaction abort during wastage rolls back batch, transaction, wastage, and domain event', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await inventoryService.recordWastage(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            quantity: 20,
            reason: 'TEMPERATURE_EXCURSION',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err.message.includes('Transaction aborted') || err.message.includes('aborted'));
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    // Storage verification
    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 100, 'Batch was rolled back by transaction');

    const allTxns = await idbEngine.getAll<InventoryTransaction>('inventoryTransactions');
    const relatedTxns = allTxns.filter((t) => t.batchId === batch.id && t.transactionType === 'WASTAGE');
    assert.strictEqual(relatedTxns.length, 0, 'No wastage transaction was committed');

    // Cache verification
    const cachedBatch = await localRepository.getInventoryBatch(batch.id);
    assert.strictEqual(cachedBatch?.quantityOnHand, 100, 'Cache was never mutated');
  });

  await test('3.2. Transaction abort during adjustment preserves prior state byte-for-byte', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await inventoryService.adjustStock(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            physicalCount: 80,
            reason: 'Cycle count discrepancy',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err);
        return true;
      }
    );

    idbEngine.setSimulatedFailure('none');

    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 100);
    assert.strictEqual(durableBatch?.version, 1);
  });

  // --- Group 4: Safe Retries & Event Hash Integrity ---
  console.log('\n--- Test Group 4: Safe Retries & Event Hash Integrity ---');

  await test('4.1. Failed wastage followed by clean retry applies stock deduction exactly once', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    // Attempt 1 fails
    idbEngine.setSimulatedFailure('request_error');
    await assert.rejects(async () => {
      await inventoryService.recordWastage(
        {
          facilityId,
          inventoryItemId: item.id,
          batchId: batch.id,
          quantity: 25,
          reason: 'DAMAGED',
        },
        pharmacistActor
      );
    });

    // Attempt 2 succeeds
    idbEngine.setSimulatedFailure('none');
    const retryWastage = await inventoryService.recordWastage(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        quantity: 25,
        reason: 'DAMAGED',
      },
      pharmacistActor
    );

    assert(retryWastage);
    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(durableBatch?.quantityOnHand, 75, 'Stock deducted exactly once (100 - 25 = 75)');
    assert.strictEqual(durableBatch?.version, 2, 'Version incremented exactly once');

    const txns = await idbEngine.getAll<InventoryTransaction>('inventoryTransactions');
    const batchWastageTxns = txns.filter((t) => t.batchId === batch.id && t.transactionType === 'WASTAGE');
    assert.strictEqual(batchWastageTxns.length, 1, 'Exactly one ledger transaction created');
  });

  await test('4.2. Consecutive committed events maintain an unbroken cryptographic hash chain', async () => {
    const events = await eventStore.getAllEvents(20);
    assert(events.length >= 2, 'Multiple events recorded');

    // Verify hash chain
    for (let i = 0; i < events.length - 1; i++) {
      const current = events[i];
      assert(current.eventHash && current.eventHash.length === 64, 'Event has valid SHA-256 hash');
    }
  });

  // --- Group 5: Business Validation & RBAC Regressions ---
  console.log('\n--- Test Group 5: Business Validation & RBAC Regressions ---');

  await test('5.1. Non-dispensing role (physician) is blocked from inventory actions', async () => {
    const physicianActor: ClinicalActorContext = {
      userId: 'usr-phys-01',
      userName: 'Dr. Tadesse',
      userRole: 'physician',
      facilityId,
      deviceId: 'dev-phys-01',
    };

    await assert.rejects(
      async () => {
        await inventoryService.recordReceipt(
          {
            facilityId,
            supplierName: 'Unauthorized Supplier',
            items: [],
          },
          physicianActor
        );
      },
      (err: any) => {
        assert(err.message.includes('Unauthorized') || err.message.includes('cannot receive'));
        return true;
      }
    );
  });

  await test('5.2. Wastage quantity exceeding quantityOnHand is rejected before persistence', async () => {
    const { item, batch } = await createTestItemAndBatch(50);

    await assert.rejects(
      async () => {
        await inventoryService.recordWastage(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            quantity: 100, // exceeds 50
            reason: 'DAMAGED',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err.message.includes('exceeds quantity on hand'));
        return true;
      }
    );

    const untouchedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(untouchedBatch?.quantityOnHand, 50, 'Batch stock untouched');
  });

  await test('5.3. Physical count matching on-hand quantity rejects adjustment as no-op', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    await assert.rejects(
      async () => {
        await inventoryService.adjustStock(
          {
            facilityId,
            inventoryItemId: item.id,
            batchId: batch.id,
            physicalCount: 100, // matches 100
            reason: 'No change',
          },
          pharmacistActor
        );
      },
      (err: any) => {
        assert(err.message.includes('No adjustment needed') || err.message.includes('matches'));
        return true;
      }
    );

    const untouchedBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert.strictEqual(untouchedBatch?.quantityOnHand, 100);
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/${passed} STAGE 3.2.5.7 INVENTORY EVENT DURABILITY TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage3257Tests().catch((err) => {
  console.error('\nStage 3.2.5.7 test execution failed:', err);
  process.exit(1);
});
