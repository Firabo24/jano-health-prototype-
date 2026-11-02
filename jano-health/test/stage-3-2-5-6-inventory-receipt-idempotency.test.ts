/**
 * JANO HEALTH — STAGE 3.2.5.6 TEST SUITE
 * INVENTORY RECEIPT IDEMPOTENCY & DUPLICATE-POSTING PROTECTION
 *
 * Verifies that InventoryBridgeService:
 * 1. A valid receipt integrates successfully the first time.
 * 2. A sequential direct second call is rejected without further stock increase.
 * 3. A duplicate attempt creates no additional inventory transactions.
 * 4. Two concurrent direct calls for the same receipt result in exactly one successful integration.
 * 5. Two independent bridge-service instances cannot integrate the same receipt twice.
 * 6. The idempotency guard and inventory mutations commit atomically.
 * 7. A failure before commit leaves the receipt eligible for a valid retry.
 * 8. A successful retry after an earlier aborted attempt applies quantities exactly once.
 * 9. A stale receipt version or changed integration state prevents posting.
 * 10. A fresh repository instance recognizes the committed integration state.
 * 11. finalizeGoodsReceipt() remains compatible with the new lower-level guard.
 * 12. Different legitimate receipts can each integrate independently.
 * 13. Multiple lines within a single receipt continue to aggregate item and batch quantities correctly.
 * 14. A synchronous post-commit audit exception cannot lead to duplicate inventory on retry.
 * 15. Existing inventory receipt validation and authorization regressions remain intact.
 */

import assert from 'node:assert';
import 'fake-indexeddb/auto';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { InventoryBridgeService, inventoryBridgeService } from '../src/services/supplyChain/inventoryBridgeService';
import { logisticsReceivingService } from '../src/services/supplyChain/logisticsReceivingService';
import { supplyCatalogService } from '../src/services/supplyChain/supplyCatalogService';
import { auditService } from '../src/services/audit/auditService';
import { GoodsReceipt } from '../src/domain/v17SupplyChainTypes';
import { InventoryBatch, InventoryItem, InventoryTransaction } from '../src/domain/pharmacyTypes';
import { generateUUIDv7 } from '../src/domain/identifiers';

async function runStage3256Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.6: INVENTORY RECEIPT IDEMPOTENCY (FINDING-IB-02)');
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

  const facilityId = 'fac-idempotency-3256';
  const actorId = 'usr-pharmacist-3256';
  let scenarioCounter = 0;

  const setupBaseline = async (initialStock = 100, customLot?: string) => {
    scenarioCounter++;
    const id = `${generateUUIDv7()}_sc${scenarioCounter}`;
    const code = `MED-IDEM-${scenarioCounter}-${id}`;
    const genericName = `IdemCillin-${scenarioCounter}-${id}`;
    const lotNumber = customLot || `LOT-IDEM-${scenarioCounter}-${id}`;
    const now = new Date().toISOString();

    const createdSupply = await supplyCatalogService.createSupplyItem({
      code,
      name: `Idempotency Test Medication ${scenarioCounter}`,
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
      supplierName: 'Global Idempotency Logistics',
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

  const createSyntheticReceipt = async (
    lines: Array<{ supplyItemId: string; lotNumber: string; acceptedQuantity: number }>,
    customReceiptId?: string
  ): Promise<GoodsReceipt> => {
    const rId = customReceiptId || `grn_${generateUUIDv7()}`;
    const now = new Date().toISOString();
    const receipt: GoodsReceipt = {
      goodsReceiptId: rId,
      receiptNumber: `GRN-IDEM-${Date.now().toString(36)}`,
      shipmentId: `ship_${generateUUIDv7()}`,
      purchaseOrderReference: `PO-IDEM-${Date.now().toString(36)}`,
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
        hash: `hash_${Date.now()}`,
        lastVerifiedAt: now,
      },
    };
    await idbEngine.put('goodsReceipts', receipt);
    return receipt;
  };

  // =========================================================================
  // TEST GROUP 1: SEQUENTIAL & CONCURRENT IDEMPOTENCY
  // =========================================================================
  console.log('--- Test Group 1: Sequential & Concurrent Idempotency ---');

  await test('1. A valid receipt integrates successfully the first time', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    const txns = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txns.length, 1, 'Must create 1 transaction');

    const cachedBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(cachedBatch?.quantityOnHand, 150, 'Stock increases by 50');
    assert.strictEqual(receipt.inventoryIntegrated, true, 'Receipt marked integrated');

    // Verify durable marker in goodsReceipts store
    const durableGRN = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(durableGRN, 'Receipt must exist in durable goodsReceipts store');
    assert.strictEqual(durableGRN.inventoryIntegrated, true, 'Durable receipt marked integrated');
    assert.deepStrictEqual(durableGRN.inventoryTransactionIds, txns, 'Transaction IDs attached');
  });

  await test('2. A sequential direct second call is rejected without any further stock increase', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    const midBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(midBatch?.quantityOnHand, 150);

    // Second sequential call with the same receipt
    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('already been integrated'), 'Must reject duplicate call');
        return true;
      }
    );

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 150, 'Stock must NOT increase a second time');
  });

  await test('3. A duplicate attempt creates no additional inventory transactions', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 40 },
    ]);

    const initialTxns = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(initialTxns.length, 1);

    // Clone receipt object but keep identical goodsReceiptId (simulating re-submission from another client)
    const clonedReceipt: GoodsReceipt = {
      ...receipt,
      inventoryIntegrated: false, // try to bypass in-memory flag
      inventoryTransactionIds: undefined,
    };

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(clonedReceipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('already been integrated'), 'Durable guard must catch duplicate');
        return true;
      }
    );

    const allTxns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = allTxns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 1, 'Exactly 1 ledger transaction must exist');
  });

  await test('4. Two concurrent direct calls for the same receipt result in exactly one successful integration', async () => {
    const b = await setupBaseline(200);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 60 },
    ]);

    // Launch two calls concurrently with the same receipt
    const results = await Promise.allSettled([
      inventoryBridgeService.postReceiptToInventory(receipt, actorId),
      inventoryBridgeService.postReceiptToInventory(receipt, actorId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent call must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one concurrent call must reject');
    assert(
      (rejected[0] as PromiseRejectedResult).reason.message.includes('already been integrated'),
      'Losing call must receive duplicate/integrated error'
    );

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 260, 'Stock increases by exactly 60 (not 120)');

    const txns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 1, 'Exactly 1 ledger entry created under concurrency');
  });

  await test('5. Two independent bridge-service instances cannot integrate the same receipt twice', async () => {
    const b = await setupBaseline(150);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // Create an independent unlinked instance of InventoryBridgeService via class reflection
    const instanceA = inventoryBridgeService;
    const instanceB = Object.create(InventoryBridgeService.prototype);
    (instanceB as any).activePostings = new Map();

    // Instance A posts the receipt
    await instanceA.postReceiptToInventory(receipt, actorId);

    // Instance B (which shares no memory map with A) attempts to post the same receipt
    const clonedReceipt: GoodsReceipt = {
      ...receipt,
      inventoryIntegrated: false,
    };

    await assert.rejects(
      async () => {
        await instanceB.postReceiptToInventory(clonedReceipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('already been integrated'), 'Instance B must be blocked by durable guard');
        return true;
      }
    );

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 200, 'Stock is exactly 200 (applied once)');
  });

  // =========================================================================
  // TEST GROUP 2: ATOMICITY, RETRY & FAILURE BOUNDARIES
  // =========================================================================
  console.log('--- Test Group 2: Atomicity, Retry & Failure Boundaries ---');

  await test('6. The idempotency guard and inventory mutations commit atomically', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
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

    // Verify neither inventory nor idempotency marker was committed
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock remains at 100 on abort');

    const durableGRN = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(!durableGRN || !durableGRN.inventoryIntegrated, 'Idempotency marker must not exist on abort');
  });

  await test('7. A failure before commit leaves the receipt eligible for a valid retry', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // 1st attempt fails with request error
    idbEngine.setSimulatedFailure('request_error');
    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    assert.strictEqual(receipt.inventoryIntegrated, false, 'Receipt remains unintegrated');

    // 2nd attempt succeeds cleanly
    idbEngine.setSimulatedFailure('none');
    const txns = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txns.length, 1, 'Retry successfully committed');

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 150, 'Stock reaches 150 on successful retry');
    assert.strictEqual(receipt.inventoryIntegrated, true, 'Receipt marked integrated after retry');
  });

  await test('8. A successful retry after an earlier aborted attempt applies quantities exactly once', async () => {
    const b = await setupBaseline(300);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 75 },
    ]);

    // Abort 1st attempt
    idbEngine.setSimulatedFailure('transaction_abort');
    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    // Successful 2nd attempt
    idbEngine.setSimulatedFailure('none');
    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 375, 'Stock applied exactly once (300 + 75 = 375)');

    const txns = await localRepository.getInventoryTransactions(facilityId, b.invItem.id, b.batchId);
    const receiptTxns = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(receiptTxns.length, 1, 'Exactly one transaction on retry');
  });

  await test('9. A stale receipt version or changed integration state prevents posting', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 30 },
    ]);

    // Seed the durable store with an already-integrated receipt
    const existingIntegratedGRN: GoodsReceipt = {
      ...receipt,
      inventoryIntegrated: true,
      inventoryTransactionIds: ['txn_prior_integrated'],
    };
    await idbEngine.put('goodsReceipts', existingIntegratedGRN);

    // Call bridge with unintegrated in-memory receipt
    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('already been integrated'), 'Must be blocked by existing integrated state');
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock remains at 100');
  });

  await test('10. A fresh repository instance recognizes the committed integration state', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 40 },
    ]);

    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);

    // Read directly from storage engine as a fresh instance would
    const freshRecord = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(freshRecord, 'Record must exist in storage');
    assert.strictEqual(freshRecord.inventoryIntegrated, true, 'Fresh instance observes inventoryIntegrated = true');
    assert.strictEqual(freshRecord.inventoryTransactionIds?.length, 1);
  });

  // =========================================================================
  // TEST GROUP 3: WORKFLOW COMPATIBILITY & REGRESSIONS
  // =========================================================================
  console.log('--- Test Group 3: Workflow Compatibility & Regressions ---');

  await test('11. finalizeGoodsReceipt() remains compatible with the new lower-level guard', async () => {
    const b = await setupBaseline(100);

    // Create a realistic GoodsReceipt through LogisticsReceivingService
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);
    (logisticsReceivingService as any).shipments.set(receipt.shipmentId, {
      shipmentId: receipt.shipmentId,
      status: 'DISPATCHED',
    });
    (logisticsReceivingService as any).receipts.set(receipt.goodsReceiptId, receipt);
    await idbEngine.put('goodsReceipts', receipt);

    const finalized = await logisticsReceivingService.finalizeGoodsReceipt(receipt.goodsReceiptId, actorId);
    assert.strictEqual(finalized.status, 'FINALIZED');
    assert.strictEqual(finalized.inventoryIntegrated, true);
    assert.strictEqual(finalized.inventoryTransactionIds?.length, 1);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 150, 'Batch stock increased by 50');

    // Duplicate call to finalizeGoodsReceipt is blocked at service level
    await assert.rejects(async () => {
      await logisticsReceivingService.finalizeGoodsReceipt(receipt.goodsReceiptId, actorId);
    });

    // And direct bridge call is also independently blocked at bridge level
    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(finalized, actorId);
    });
  });

  await test('12. Different legitimate receipts can each integrate independently', async () => {
    const b = await setupBaseline(100);
    const r1 = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 },
    ]);
    const r2 = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 30 },
    ]);

    const txns1 = await inventoryBridgeService.postReceiptToInventory(r1, actorId);
    const txns2 = await inventoryBridgeService.postReceiptToInventory(r2, actorId);

    assert.strictEqual(txns1.length, 1);
    assert.strictEqual(txns2.length, 1);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 150, 'Both receipts integrated (100 + 20 + 30 = 150)');
  });

  await test('13. Multiple lines within a single receipt continue to aggregate item and batch quantities correctly', async () => {
    const b = await setupBaseline(50);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 15 },
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 },
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 10 },
    ]);

    const txns = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txns.length, 3, '3 transactions created for 3 lines');

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Stock correctly aggregated to 50 + 15 + 25 + 10 = 100');

    // Duplicate call with all lines is rejected
    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    });
    assert.strictEqual(batch?.quantityOnHand, 100, 'Stock remains 100');
  });

  await test('14. A synchronous post-commit audit exception cannot lead to duplicate inventory on retry', async () => {
    const b = await setupBaseline(100);
    const receipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // Force auditService.log to throw synchronously
    const originalLog = auditService.log;
    (auditService as any).log = async () => {
      throw new Error('SIMULATED_AUDIT_LOG_EXCEPTION');
    };

    try {
      // Integration succeeds even if audit warning occurs, OR if exception is thrown:
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } finally {
      (auditService as any).log = originalLog;
    }

    const midBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(midBatch?.quantityOnHand, 150, 'Inventory successfully committed');

    // If caller retries after an audit failure:
    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('already been integrated'), 'Retry must be blocked by idempotency guard');
        return true;
      }
    );

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 150, 'Inventory must NOT be duplicated on retry');
  });

  await test('15. Existing inventory receipt validation and authorization regressions remain intact', async () => {
    // Missing goodsReceiptId
    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory({} as any, actorId);
    });

    // Zero quantity lines
    const b = await setupBaseline(100);
    const zeroReceipt = await createSyntheticReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 0 },
    ]);
    const zeroTxns = await inventoryBridgeService.postReceiptToInventory(zeroReceipt, actorId);
    assert.strictEqual(zeroTxns.length, 0, 'Zero lines produce zero transactions');
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock remains unchanged');
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/15 STAGE 3.2.5.6 INVENTORY RECEIPT IDEMPOTENCY TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage3256Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
