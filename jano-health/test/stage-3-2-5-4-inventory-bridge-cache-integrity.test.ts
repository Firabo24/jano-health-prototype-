/**
 * JANO HEALTH — STAGE 3.2.5.4 TEST SUITE
 * INVENTORY BRIDGE IMMUTABILITY & COMMIT-FIRST CACHE INTEGRITY (SRV-PHARM-04)
 *
 * Verifies that InventoryBridgeService:
 * 1. Constructs separate proposed updated batch objects without mutating cached objects in place.
 * 2. Advances repository cache only after durable IndexedDB persistence succeeds.
 * 3. Preserves prior cache state byte-for-byte when writes fail (request error, abort, unavailability).
 * 4. Ensures rejected updates never leak into shared references or memory fallback.
 * 5. Supports clean subsequent retries after failure without double-counting.
 * 6. Supports standard offline workflows with healthy IndexedDB.
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

async function runStage3254Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.4: INVENTORY BRIDGE CACHE INTEGRITY (SRV-PHARM-04)');
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

  const facilityId = 'fac-bridge-audit';
  const actorId = 'usr-pharmacist-bridge';
  let scenarioCounter = 0;

  // Helper to setup a supply item and baseline inventory item + batch
  const setupBaseline = async (initialStock = 100, customLot?: string) => {
    scenarioCounter++;
    const id = `${generateUUIDv7()}_sc${scenarioCounter}`;
    const code = `MED-BRIDGE-${scenarioCounter}-${id}`;
    const genericName = `BridgeCillin-${scenarioCounter}-${id}`;
    const lotNumber = customLot || `LOT-${scenarioCounter}-${id}`;
    const now = new Date().toISOString();

    const createdSupply = await supplyCatalogService.createSupplyItem({
      code,
      name: `Bridge Test Medication ${scenarioCounter}`,
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
      provenance: {} as any,
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
      supplierName: 'Global Bridge Logistics',
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

  const createSyntheticReceipt = async (lotNumber: string, acceptedQuantity: number, supplyItemId: string): Promise<GoodsReceipt> => {
    const rId = `grn_${generateUUIDv7()}`;
    const now = new Date().toISOString();
    const receipt: GoodsReceipt = {
      goodsReceiptId: rId,
      receiptNumber: `GRN-BRIDGE-${Date.now().toString(36)}`,
      shipmentId: `ship_${generateUUIDv7()}`,
      purchaseOrderReference: `PO-REF-${Date.now().toString(36)}`,
      facilityId,
      warehouseId: 'wh-main',
      receivedBy: actorId,
      receivedAt: now,
      lines: [
        {
          lineId: `line_${generateUUIDv7()}`,
          supplyItemId,
          orderedQuantity: acceptedQuantity,
          receivedQuantity: acceptedQuantity,
          acceptedQuantity,
          rejectedQuantity: 0,
          lotNumber,
          expiryDate: '2028-12-31',
          qualityPassed: true,
        },
      ],
      inspectionStatus: 'PASSED',
      discrepancyStatus: 'NONE',
      status: 'RECEIVED',
      inventoryIntegrated: false,
      provenance: {
        createdAt: now,
        createdBy: actorId,
        facilityId,
        systemVersion: '1.0.0',
      },
      integrityMetadata: {
        hash: 'mock-hash',
        lastVerifiedAt: now,
      },
    };
    await idbEngine.put('goodsReceipts', receipt);
    return receipt;
  };

  // =========================================================================
  // TEST GROUP 1: SUCCESSFUL BATCH UPDATES & COMMIT-FIRST CACHE INTEGRITY
  // =========================================================================
  console.log('--- Test Group 1: Successful Batch Updates & Cache Advancement ---');

  await test('1. Successful batch update persists expected quantity and updates durable store', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(100);
    const receipt = await createSyntheticReceipt(lotNumber, 50, supplyItemId);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1, 'Must create 1 inventory transaction');

    // Durable store verification
    const durableBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);
    assert(durableBatch, 'Batch must exist in durable storage');
    assert.strictEqual(durableBatch.quantityOnHand, 150, 'Durable quantityOnHand must be 150 (100 + 50)');
    assert.strictEqual(durableBatch.availableQuantity, 150, 'Durable availableQuantity must be 150');
    assert.strictEqual(durableBatch.version, 2, 'Version must be incremented to 2');
  });

  await test('2. Successful batch update advances repository cache to committed state', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(50);
    const receipt = await createSyntheticReceipt(lotNumber, 25, supplyItemId);

    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);

    const cachedBatch = await localRepository.getInventoryBatch(batchId);
    assert(cachedBatch, 'Cached batch must exist');
    assert.strictEqual(cachedBatch.quantityOnHand, 75, 'Cached quantityOnHand must be 75');
    assert.strictEqual(cachedBatch.availableQuantity, 75, 'Cached availableQuantity must be 75');
    assert.strictEqual(cachedBatch.version, 2, 'Cached version must be 2');
  });

  // =========================================================================
  // TEST GROUP 2: FAILURE PROPAGATION & IMMUTABILITY (SRV-PHARM-04)
  // =========================================================================
  console.log('--- Test Group 2: Failure Propagation & Immutability Under Errors ---');

  await test('3. A failed batch write propagates the error to caller', async () => {
    const { lotNumber, supplyItemId } = await setupBaseline(100);
    const receipt = await createSyntheticReceipt(lotNumber, 50, supplyItemId);

    idbEngine.setSimulatedFailure('request_error');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('simulated') || err.message.includes('failed'), 'Must propagate persistence error');
        return true;
      }
    );
  });

  await test('4. A failed write leaves the previous cached quantity unchanged', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(80);
    const receipt = await createSyntheticReceipt(lotNumber, 40, supplyItemId);

    idbEngine.setSimulatedFailure('request_error');

    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    const cached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cached?.quantityOnHand, 80, 'Cached quantityOnHand must remain untouched at 80');
  });

  await test('5. A failed write leaves the previous available quantity unchanged', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(60);
    const receipt = await createSyntheticReceipt(lotNumber, 30, supplyItemId);

    idbEngine.setSimulatedFailure('request_error');

    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    const cached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cached?.availableQuantity, 60, 'Cached availableQuantity must remain untouched at 60');
  });

  await test('6. A failed write leaves the previous status and version unchanged', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(0); // initially DEPLETED
    const receipt = await createSyntheticReceipt(lotNumber, 10, supplyItemId);

    idbEngine.setSimulatedFailure('request_error');

    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    const cached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cached?.status, 'DEPLETED', 'Status must remain DEPLETED on failed receipt');
    assert.strictEqual(cached?.version, 1, 'Version must remain 1 on failed receipt');
  });

  await test('7. The original cached batch object is not mutated during preparation', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(120);

    // Retrieve direct reference to cached object before posting receipt
    const originalRef = await localRepository.getInventoryBatch(batchId);
    assert(originalRef, 'Must retrieve original cached batch reference');

    // Freeze original reference to strictly enforce runtime immutability
    Object.freeze(originalRef);

    const receipt = await createSyntheticReceipt(lotNumber, 50, supplyItemId);

    // Should NOT throw TypeError: Cannot assign to read only property
    // because proposed update uses object spread rather than in-place mutation
    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);

    // After success, localRepository cache holds the new object
    const newCached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(newCached?.quantityOnHand, 170, 'New cached batch has 170');
    assert.notStrictEqual(newCached, originalRef, 'New cached object must be a distinct reference from original');
    assert.strictEqual(originalRef.quantityOnHand, 120, 'Original frozen reference retained 120');
  });

  await test('8. A rejected write does not leave proposed object accessible through previous cached reference', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(90);

    const cachedBefore = await localRepository.getInventoryBatch(batchId);
    const snapshotQty = cachedBefore?.quantityOnHand;

    const receipt = await createSyntheticReceipt(lotNumber, 60, supplyItemId);
    idbEngine.setSimulatedFailure('request_error');

    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    // Verify through the exact reference obtained before the call
    assert.strictEqual(cachedBefore?.quantityOnHand, snapshotQty, 'Original reference quantity must not change');

    // Verify through fresh query
    const cachedAfter = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedAfter?.quantityOnHand, snapshotQty, 'Fresh query quantity must equal prior snapshot');
    assert.strictEqual(cachedAfter?.version, 1, 'Version must remain 1');
  });

  // =========================================================================
  // TEST GROUP 3: TRANSACTION ABORT & UNCHECKED FAILURE BOUNDARIES
  // =========================================================================
  console.log('--- Test Group 3: Transaction Abort & Unavailability Safeguards ---');

  await test('9. A transaction abort preserves both durable and cached prior state', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(200);
    const receipt = await createSyntheticReceipt(lotNumber, 50, supplyItemId);

    idbEngine.setSimulatedFailure('transaction_abort');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('aborted') || err.message.includes('abort'), 'Must reject on abort');
        return true;
      }
    );

    const cached = await localRepository.getInventoryBatch(batchId);
    const durable = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);

    assert.strictEqual(cached?.quantityOnHand, 200, 'Cache preserved at 200 on abort');
    assert.strictEqual(durable?.quantityOnHand, 200, 'Durable preserved at 200 on abort');
  });

  await test('10. Database unavailability is not treated as a successful memory-only update', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(150);
    const receipt = await createSyntheticReceipt(lotNumber, 50, supplyItemId);

    idbEngine.setSimulatedFailure('unavailable');

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('unavailable'), 'Must reject when database is unavailable');
        return true;
      }
    );

    // Must not retain memory-only updated quantity
    const cached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cached?.quantityOnHand, 150, 'Must not advance cache in memory when DB is unavailable');
  });

  await test('11. A later successful retry commits the expected quantity exactly once', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(100);
    const receipt = await createSyntheticReceipt(lotNumber, 25, supplyItemId);

    // Attempt 1: Fails due to simulated request error
    idbEngine.setSimulatedFailure('request_error');
    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    // Verify uncommitted state preserved
    const cachedMid = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cachedMid?.quantityOnHand, 100, 'Pre-retry state must remain 100');

    // Attempt 2: Healthy storage retry
    idbEngine.setSimulatedFailure('none');
    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1, 'Retry must return 1 transaction ID');

    // Verify committed state
    const cachedFinal = await localRepository.getInventoryBatch(batchId);
    const durableFinal = await idbEngine.get<InventoryBatch>('inventoryBatches', batchId);

    assert.strictEqual(cachedFinal?.quantityOnHand, 125, 'Final cached quantity must be 125 (100 + 25)');
    assert.strictEqual(durableFinal?.quantityOnHand, 125, 'Final durable quantity must be 125');
    assert.strictEqual(cachedFinal?.version, 2, 'Version must be 2');
  });

  await test('12. Existing successful offline inventory-bridge workflows continue to work with functioning IndexedDB', async () => {
    const { batchId, lotNumber, supplyItemId } = await setupBaseline(75);
    const receipt = await createSyntheticReceipt(lotNumber, 25, supplyItemId);

    // Normal functioning IndexedDB in offline environment
    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const cached = await localRepository.getInventoryBatch(batchId);
    assert.strictEqual(cached?.quantityOnHand, 100, 'Batch stock correctly increased to 100');

    const txns = await localRepository.getInventoryTransactions(facilityId, undefined, batchId);
    const receiptTxn = txns.find((t) => t.referenceId === receipt.goodsReceiptId);
    assert(receiptTxn, 'Receipt inventory transaction must be created');
    assert.strictEqual(receiptTxn.quantity, 25);
    assert.strictEqual(receiptTxn.transactionType, 'RECEIPT');
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log(`ALL ${passed}/12 STAGE 3.2.5.4 INVENTORY BRIDGE CACHE INTEGRITY TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage3254Tests().catch((err) => {
  console.error('\nSTAGE 3.2.5.4 TEST SUITE ENCOUNTERED UNEXPECTED ERROR:', err);
  process.exit(1);
});
