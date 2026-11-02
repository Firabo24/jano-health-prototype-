/**
 * JANO HEALTH — STAGE 3.2.5.5 TEST SUITE
 * ATOMIC INVENTORY RECEIPT POSTING & LEDGER CONSISTENCY (FINDING-IB-01)
 *
 * Verifies that InventoryBridgeService:
 * 1. Commits all affected items, batches, and transactions atomically in a single IndexedDB transaction.
 * 2. Eliminates FINDING-IB-01: prevents quantity updates from committing if transaction write fails.
 * 3. Handles multi-line receipts (distinct items, shared items, distinct lots, shared lots) with full ledger parity.
 * 4. Preserves 100% untouched cache and durable state on simulated failures (request_error, transaction_abort, unavailable).
 * 5. Strictly enforces version preconditions to prevent concurrency collisions.
 * 6. Guarantees clean retries without double counting or dangling records.
 */

import assert from 'node:assert';
import 'fake-indexeddb/auto';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { inventoryBridgeService } from '../src/services/supplyChain/inventoryBridgeService';
import { supplyCatalogService } from '../src/services/supplyChain/supplyCatalogService';
import { GoodsReceipt } from '../src/domain/v17SupplyChainTypes';
import { InventoryBatch, InventoryItem, InventoryTransaction } from '../src/domain/pharmacyTypes';
import { generateUUIDv7 } from '../src/domain/identifiers';

async function runStage3255Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.5: ATOMIC INVENTORY RECEIPT POSTING (FINDING-IB-01)');
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

  const facilityId = 'fac-atomic-receipt-3255';
  const actorId = 'usr-pharmacist-atomic-3255';
  let scenarioCounter = 0;

  // Helper to setup a supply item and baseline inventory item + batch
  const setupBaseline = async (initialStock = 100, customLot?: string) => {
    scenarioCounter++;
    const id = `${generateUUIDv7()}_sc${scenarioCounter}`;
    const code = `MED-ATOMIC-${scenarioCounter}-${id}`;
    const genericName = `AtomicCillin-${scenarioCounter}-${id}`;
    const lotNumber = customLot || `LOT-ATOMIC-${scenarioCounter}-${id}`;
    const now = new Date().toISOString();

    const createdSupply = await supplyCatalogService.createSupplyItem({
      code,
      name: `Atomic Test Medication ${scenarioCounter}`,
      genericName,
      category: 'medicines',
      unitOfMeasure: 'TABLET',
      packagingUnit: 'BOTTLE_100',
      procurementClassification: 'ESSENTIAL',
      storageRequirements: {
        temperatureZone: 'CONTROLLED_ROOM',
        minCelsius: 15,
        maxCelsius: 25,
      },
      expiryRequired: true,
      batchTrackingRequired: true,
      controlledItemFlag: false,
      actorId,
      facilityId,
    });

    const supplyItemId = createdSupply.supplyItemId;

    const invItem: InventoryItem = {
      id: `inv_item_${id}`,
      facilityId,
      medicationDefinitionId: supplyItemId,
      medicationCode: code,
      genericName,
      formulation: 'BOTTLE_100',
      strength: '500mg',
      unit: 'BOTTLE_100',
      storageRequirements: {} as any,
      minimumStock: 10,
      reorderPoint: 20,
      maximumStock: 500,
      active: true,
      provenance: {
        source: 'INITIAL_SETUP',
        facilityId,
        actorId,
        createdAt: now,
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await localRepository.saveInventoryItem(invItem);

    const batchId = `bat_${id}`;
    const batch: InventoryBatch = {
      id: batchId,
      inventoryItemId: invItem.id,
      facilityId,
      batchNumber: lotNumber,
      lotNumber,
      expiryDate: '2028-12-31',
      quantityOnHand: initialStock,
      reservedQuantity: 0,
      availableQuantity: initialStock,
      receivedAt: now,
      receivedById: actorId,
      status: initialStock > 0 ? 'AVAILABLE' : 'DEPLETED',
      supplierName: 'Global Atomic Logistics',
      provenance: {
        source: 'INITIAL_SETUP',
        facilityId,
        actorId,
        createdAt: now,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await localRepository.saveInventoryBatch(batch);

    return { id, supplyItemId, code, invItem, batchId, batch, lotNumber };
  };

  const createMultiLineReceipt = async (
    lines: Array<{ supplyItemId: string; lotNumber: string; acceptedQuantity: number }>
  ): Promise<GoodsReceipt> => {
    const rId = `grn_${generateUUIDv7()}`;
    const now = new Date().toISOString();
    const receipt: GoodsReceipt = {
      goodsReceiptId: rId,
      receiptNumber: `GRN-ATOMIC-${Date.now().toString(36)}`,
      shipmentId: `ship_${generateUUIDv7()}`,
      purchaseOrderReference: `PO-ATOMIC-${Date.now().toString(36)}`,
      facilityId,
      warehouseId: `wh_${generateUUIDv7()}`,
      lines: lines.map((l) => ({
        lineId: `line_${generateUUIDv7()}`,
        supplyItemId: l.supplyItemId,
        orderedQuantity: l.acceptedQuantity,
        receivedQuantity: l.acceptedQuantity,
        acceptedQuantity: l.acceptedQuantity,
        rejectedQuantity: 0,
        lotNumber: l.lotNumber,
        expiryDate: '2028-12-31',
        qualityPassed: true,
      })),
      receivedAt: now,
      receivedBy: actorId,
      status: 'RECEIVED',
      inspectionStatus: 'PASSED',
      discrepancyStatus: 'NONE',
      inventoryIntegrated: false,
      provenance: {
        createdAt: now,
        createdBy: actorId,
        facilityId,
        systemVersion: '1.17.0',
      },
      integrityMetadata: {
        hash: `mock_hash_${Date.now()}`,
        lastVerifiedAt: now,
      },
    };
    await idbEngine.put('goodsReceipts', receipt);
    return receipt;
  };

  // =========================================================================
  // TEST GROUP 1: ATOMIC MULTI-LINE POSTING & LEDGER PARITY
  // =========================================================================
  console.log('--- Test Group 1: Atomic Multi-Line Posting & Ledger Parity ---');

  await test('1. Multi-line receipt posting commits all batches and ledger transactions atomically', async () => {
    const b1 = await setupBaseline(50);
    const b2 = await setupBaseline(75);

    const receipt = await createMultiLineReceipt([
      { supplyItemId: b1.supplyItemId, lotNumber: b1.lotNumber, acceptedQuantity: 25 },
      { supplyItemId: b2.supplyItemId, lotNumber: b2.lotNumber, acceptedQuantity: 30 },
    ]);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 2, 'Must create exactly 2 transaction IDs');

    // Verify batches in cache and durable storage
    const cachedB1 = await localRepository.getInventoryBatch(b1.batchId);
    const durableB1 = await idbEngine.get<InventoryBatch>('inventoryBatches', b1.batchId);
    assert.strictEqual(cachedB1?.quantityOnHand, 75, 'Batch 1 cached stock must be 50 + 25 = 75');
    assert.strictEqual(durableB1?.quantityOnHand, 75, 'Batch 1 durable stock must be 75');

    const cachedB2 = await localRepository.getInventoryBatch(b2.batchId);
    const durableB2 = await idbEngine.get<InventoryBatch>('inventoryBatches', b2.batchId);
    assert.strictEqual(cachedB2?.quantityOnHand, 105, 'Batch 2 cached stock must be 75 + 30 = 105');
    assert.strictEqual(durableB2?.quantityOnHand, 105, 'Batch 2 durable stock must be 105');

    // Verify ledger transactions exist in both cache and durable store
    for (const txnId of txnIds) {
      const durableTxn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnId);
      assert(durableTxn, `Transaction ${txnId} must exist in durable storage`);
      assert.strictEqual(durableTxn.referenceId, receipt.goodsReceiptId, 'Txn must reference GoodsReceipt');
    }
  });

  await test('2. Shared item and shared batch across multiple receipt lines aggregates stock deterministically', async () => {
    const b1 = await setupBaseline(100);

    // Single receipt with two lines targeting the SAME batch
    const receipt = await createMultiLineReceipt([
      { supplyItemId: b1.supplyItemId, lotNumber: b1.lotNumber, acceptedQuantity: 20 },
      { supplyItemId: b1.supplyItemId, lotNumber: b1.lotNumber, acceptedQuantity: 30 },
    ]);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 2, 'Must create 2 transactions for the 2 lines');

    const cachedB1 = await localRepository.getInventoryBatch(b1.batchId);
    assert.strictEqual(cachedB1?.quantityOnHand, 150, 'Batch stock must be 100 + 20 + 30 = 150');
    assert.strictEqual(cachedB1?.availableQuantity, 150, 'Batch available stock must be 150');

    // Verify ledger entries sum to 50
    const txns = await localRepository.getInventoryTransactions(facilityId, b1.invItem.id, b1.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 2, 'Must find 2 ledger transactions');
    const totalReceiptQty = receiptTxns.reduce((sum, t) => sum + t.quantity, 0);
    assert.strictEqual(totalReceiptQty, 50, 'Ledger transactions must sum to 50');
  });

  await test('3. Brand new supply items and batches are created and persisted atomically', async () => {
    const customLot = `LOT-BRAND-NEW-${Date.now()}`;
    const code = `MED-NEW-${Date.now()}`;
    const genericName = `NewCompound-${Date.now()}`;
    const createdSupply = await supplyCatalogService.createSupplyItem({
      code,
      name: 'Brand New Test Medication',
      genericName,
      category: 'medicines',
      unitOfMeasure: 'TABLET',
      packagingUnit: 'BOX_50',
      procurementClassification: 'ESSENTIAL',
      storageRequirements: { temperatureZone: 'CONTROLLED_ROOM', minCelsius: 15, maxCelsius: 25 },
      expiryRequired: true,
      batchTrackingRequired: true,
      controlledItemFlag: false,
      actorId,
      facilityId,
    });

    const receipt = await createMultiLineReceipt([
      { supplyItemId: createdSupply.supplyItemId, lotNumber: customLot, acceptedQuantity: 80 },
    ]);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    // Locate created item in repository
    const items = await localRepository.getInventoryItems(facilityId);
    const newItem = items.find((i) => i.medicationCode === code);
    assert(newItem, 'Newly created InventoryItem must exist in repository');
    assert.strictEqual(newItem.version, 1, 'New item must have version 1');

    // Locate created batch
    const batches = await localRepository.getInventoryBatches(newItem.id, facilityId);
    const newBatch = batches.find((b) => b.batchNumber === customLot);
    assert(newBatch, 'Newly created InventoryBatch must exist in repository');
    assert.strictEqual(newBatch.quantityOnHand, 80, 'New batch quantityOnHand must be 80');
    assert.strictEqual(newBatch.version, 1, 'New batch must have version 1');
  });

  // =========================================================================
  // TEST GROUP 2: ATOMICITY UNDER FAILURES (FINDING-IB-01 RESOLUTION)
  // =========================================================================
  console.log('--- Test Group 2: Atomicity Under Failures (FINDING-IB-01 Verification) ---');

  await test('4. Simulated request_error during atomic transaction leaves ALL batches and ledger untouched', async () => {
    const b1 = await setupBaseline(100);
    const b2 = await setupBaseline(200);

    const receipt = await createMultiLineReceipt([
      { supplyItemId: b1.supplyItemId, lotNumber: b1.lotNumber, acceptedQuantity: 50 },
      { supplyItemId: b2.supplyItemId, lotNumber: b2.lotNumber, acceptedQuantity: 50 },
    ]);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('simulated') || err.message.includes('failed'), 'Must reject on request error');
        return true;
      }
    );

    // CRITICAL (FINDING-IB-01): Batch 1 must NOT have increased to 150 even though it was the first line!
    const cachedB1 = await localRepository.getInventoryBatch(b1.batchId);
    const durableB1 = await idbEngine.get<InventoryBatch>('inventoryBatches', b1.batchId);
    assert.strictEqual(cachedB1?.quantityOnHand, 100, 'FINDING-IB-01: Batch 1 cache must remain 100');
    assert.strictEqual(durableB1?.quantityOnHand, 100, 'FINDING-IB-01: Batch 1 durable must remain 100');

    const cachedB2 = await localRepository.getInventoryBatch(b2.batchId);
    const durableB2 = await idbEngine.get<InventoryBatch>('inventoryBatches', b2.batchId);
    assert.strictEqual(cachedB2?.quantityOnHand, 200, 'Batch 2 cache must remain 200');
    assert.strictEqual(durableB2?.quantityOnHand, 200, 'Batch 2 durable must remain 200');

    // No ledger transactions should have leaked
    const allTxns = await localRepository.getInventoryTransactions(facilityId);
    const leakedTxns = allTxns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(leakedTxns.length, 0, 'Zero ledger transactions must exist after aborted receipt');
  });

  await test('5. Transaction abort rolls back all staged changes natively', async () => {
    const b = await setupBaseline(120);
    const receipt = await createMultiLineReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 40 },
    ]);

    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('abort'), 'Must reject on transaction abort');
        return true;
      }
    );

    const cached = await localRepository.getInventoryBatch(b.batchId);
    const durable = await idbEngine.get<InventoryBatch>('inventoryBatches', b.batchId);
    assert.strictEqual(cached?.quantityOnHand, 120, 'Cache preserved at 120');
    assert.strictEqual(durable?.quantityOnHand, 120, 'Durable preserved at 120');

    const txns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 0, 'Zero ledger transactions on abort');
  });

  await test('6. Database unavailability prevents memory-only updates', async () => {
    const b = await setupBaseline(300);
    const receipt = await createMultiLineReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    idbEngine.setSimulatedFailure('unavailable');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('unavailable'), 'Must reject when unavailable');
        return true;
      }
    );

    const cached = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(cached?.quantityOnHand, 300, 'Cache must not advance when database unavailable');
  });

  // =========================================================================
  // TEST GROUP 3: CONCURRENCY GUARDS & PRECONDITIONS
  // =========================================================================
  console.log('--- Test Group 3: Concurrency Guards & Preconditions ---');

  await test('7. Precondition conflict: concurrent batch version increment aborts receipt posting', async () => {
    const b = await setupBaseline(100);

    // Retrieve batch before posting
    const batchBefore = await localRepository.getInventoryBatch(b.batchId);
    assert(batchBefore, 'Batch must exist');

    // Simulate concurrent modification in storage directly advancing version to 2
    const concurrentBatch: InventoryBatch = {
      ...batchBefore,
      quantityOnHand: 110,
      availableQuantity: 110,
      version: 2,
      updatedAt: new Date().toISOString(),
    };
    await idbEngine.put('inventoryBatches', concurrentBatch);

    const receipt = await createMultiLineReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // Receipt posting read version 1 initially, but native transaction will detect version 2 in precondition
    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('Concurrency conflict') || err.message.includes('version mismatch'),
          `Error must indicate concurrency conflict: ${err.message}`);
        return true;
      }
    );

    // Verify no ledger transactions committed
    const txns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 0, 'No ledger transactions must commit on concurrency conflict');
  });

  await test('8. Clean retry after failed attempt succeeds without double counting', async () => {
    const b = await setupBaseline(100);
    const receipt = await createMultiLineReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 60 },
    ]);

    // 1st attempt: fails
    idbEngine.setSimulatedFailure('request_error');
    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    // Verify state is clean
    const cachedMid = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(cachedMid?.quantityOnHand, 100, 'Stock remains 100 after 1st attempt failed');

    // 2nd attempt: succeeds cleanly
    idbEngine.setSimulatedFailure('none');
    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1, 'Exactly 1 transaction created on retry');

    const cachedFinal = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(cachedFinal?.quantityOnHand, 160, 'Stock cleanly reaches 160 on retry');
    assert.strictEqual(cachedFinal?.version, 2, 'Version is cleanly incremented once to 2');

    // Verify ledger count
    const txns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 1, 'Exactly 1 ledger record exists');
    assert.strictEqual(receiptTxns[0].quantity, 60, 'Ledger record quantity is 60');
  });

  await test('9. Zero-quantity lines are skipped cleanly without transaction staging', async () => {
    const b = await setupBaseline(50);
    const receipt = await createMultiLineReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 0 },
    ]);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 0, 'No transaction created for 0 quantity line');

    const cached = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(cached?.quantityOnHand, 50, 'Stock remains untouched at 50');
    assert.strictEqual(cached?.version, 1, 'Version remains 1');
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/9 STAGE 3.2.5.5 ATOMIC INVENTORY RECEIPT POSTING TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage3255Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
