/**
 * JANO HEALTH — STAGE 3.2.5.6.2.2 TEST SUITE
 * AUTHORITATIVE STOCK DATA & RECEIPT SNAPSHOT INTEGRITY (FINDING-IB-03A & FINDING-IB-03B)
 *
 * Verifies that InventoryBridgeService:
 * 1. Case A: Derives stock and ledger mutations strictly from authoritative persisted receipt, ignoring caller modifications.
 * 2. Case B.1: Aborts transaction and leaves inventory untouched if acceptedQuantity is mutated between preparation and commit.
 * 3. Case B.2: Aborts transaction and leaves inventory untouched if lotNumber or line identity is mutated between preparation and commit.
 * 4. Case C: Aborts transaction if lifecycle status is mutated to REJECTED between preparation and commit.
 * 5. Case D: Successfully integrates an unchanged valid receipt with exact stock and ledger quantities.
 * 6. Case E.1: Rejects missing authoritative receipt with zero partial writes.
 * 7. Case E.2: Rejects DRAFT authoritative receipt with zero partial writes.
 * 8. Case E.3: Rejects REJECTED authoritative receipt with zero partial writes.
 * 9. Case E.4: Rejects already-integrated receipt with zero partial writes.
 * 10. Case F.1: Sequential duplicate attempts are blocked without second stock increase.
 * 11. Case F.2: Concurrent duplicate calls fulfill exactly once and reject duplicate.
 * 12. Case F.3: Independent service instances cannot integrate the same receipt twice.
 * 13. Case G: Transaction abort / request error rolls back all stores and permits clean retry.
 * 14. Case H: LogisticsReceivingService.finalizeGoodsReceipt() integrates cleanly and idempotently.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import 'fake-indexeddb/auto';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import {
  InventoryBridgeService,
  inventoryBridgeService,
  resolveCanonicalReceiptTimestamp,
  computeRawReceivedAtSnapshot,
  validateCanonicalQuantity,
  computeReceiptStockSnapshotFingerprint,
  withReceiptPreCommitRace,
  registerReceiptPreCommitHookForTesting,
  getActivePreCommitHookCountForTesting,
  clearPreCommitHooksForTesting,
} from '../src/services/supplyChain/inventoryBridgeService';
import { logisticsReceivingService } from '../src/services/supplyChain/logisticsReceivingService';
import { supplyCatalogService } from '../src/services/supplyChain/supplyCatalogService';
import { GoodsReceipt, GoodsReceiptStatus } from '../src/domain/v17SupplyChainTypes';
import { InventoryBatch, InventoryItem, InventoryTransaction } from '../src/domain/pharmacyTypes';
import { generateUUIDv7 } from '../src/domain/identifiers';

async function runStage325622Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.6.2.2: AUTHORITATIVE STOCK DATA & SNAPSHOT INTEGRITY');
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
      clearPreCommitHooksForTesting();
    }
  };

  const facilityId = 'fac-auth-stock-325622';
  const actorId = 'usr-pharmacist-325622';
  let scenarioCounter = 0;

  const setupBaseline = async (initialStock = 100) => {
    scenarioCounter++;
    const id = `${generateUUIDv7()}_sc${scenarioCounter}`;
    const code = `MED-AUTH-${scenarioCounter}-${id}`;
    const genericName = `AuthCillin-${scenarioCounter}-${id}`;
    const lotNumber = `LOT-AUTH-${scenarioCounter}-${id}`;
    const now = new Date().toISOString();

    const createdSupply = await supplyCatalogService.createSupplyItem({
      code,
      name: `Auth Test Medication ${scenarioCounter}`,
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
      supplierName: 'Global Auth Logistics',
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

  const createAndPersistReceipt = async (
    lines: Array<{ supplyItemId: string; lotNumber: string; acceptedQuantity: number }>,
    status: GoodsReceiptStatus = 'RECEIVED',
    customReceiptId?: string,
    customReceivedAt?: string
  ): Promise<GoodsReceipt> => {
    const rId = customReceiptId || `grn_${generateUUIDv7()}`;
    const now = new Date().toISOString();
    const receipt: GoodsReceipt = {
      goodsReceiptId: rId,
      receiptNumber: `GRN-AUTH-${Date.now().toString(36)}`,
      shipmentId: `ship_${generateUUIDv7()}`,
      purchaseOrderReference: `PO-AUTH-${Date.now().toString(36)}`,
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
      receivedAt: customReceivedAt !== undefined ? customReceivedAt : now,
      receivedBy: actorId,
      status,
      inspectionStatus: status === 'REJECTED' ? 'FAILED' : 'PASSED',
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
  // TEST GROUP 1: AUTHORITATIVE DATA SOURCE OF TRUTH (FINDING-IB-03A)
  // =========================================================================
  console.log('--- Test Group 1: Authoritative Data Source of Truth (FINDING-IB-03A) ---');

  await test('1. Case A: Caller-supplied modified lines/quantities are ignored; stock reflects authoritative receipt', async () => {
    const b = await setupBaseline(100);
    // Authoritative persisted receipt has acceptedQuantity = 50
    const authoritative = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // Caller passes tampered in-memory object with acceptedQuantity = 999 and altered lotNumber
    const tamperedCallerReceipt: GoodsReceipt = {
      ...authoritative,
      lines: [
        {
          lineId: authoritative.lines[0].lineId,
          supplyItemId: b.supplyItemId,
          orderedQuantity: 999,
          receivedQuantity: 999,
          acceptedQuantity: 999, // TAMPERED!
          rejectedQuantity: 0,
          lotNumber: 'TAMPERED-LOT-999', // TAMPERED!
          expiryDate: '2030-01-01',
          qualityPassed: true,
        },
      ],
    };

    const txnIds = await inventoryBridgeService.postReceiptToInventory(tamperedCallerReceipt, actorId);
    assert.strictEqual(txnIds.length, 1, 'Exactly 1 transaction created');

    // CRITICAL (FINDING-IB-03A): Stock must be 100 + 50 (authoritative), NOT 100 + 999!
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 150, 'Stock must be 150 based on authoritative receipt (50), not 999');
    assert.strictEqual(batch?.batchNumber, b.lotNumber, 'Batch number must match authoritative lot, not tampered lot');

    // Verify transaction quantity matches authoritative
    const txn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnIds[0]);
    assert(txn, 'Transaction must exist');
    assert.strictEqual(txn.quantity, 50, 'Ledger transaction quantity must be 50 from authoritative receipt');
    assert.strictEqual(txn.batchId, b.batchId, 'Transaction must reference authoritative batch');
  });

  // =========================================================================
  // TEST GROUP 2: PREPARATION SNAPSHOT CONCURRENCY GUARDS (FINDING-IB-03B)
  // =========================================================================
  console.log('\n--- Test Group 2: Preparation Snapshot Concurrency Guards (FINDING-IB-03B) ---');

  await test('2. Case B.1: Mutating acceptedQuantity between preparation and commit aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].acceptedQuantity = 75; // Mutated concurrently!
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch: ${err.message}`
        );
        return true;
      }
    );

    // CRITICAL: All inventory writes must have been aborted natively!
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock must remain 100 (aborted)');
    assert.strictEqual(batch?.version, 1, 'Batch version must remain 1');

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0, 'Zero ledger transactions committed');

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false, 'Receipt must remain unintegrated');
  });

  await test('3. Case B.2: Mutating lotNumber between preparation and commit aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 40 },
    ]);

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].lotNumber = 'CONCURRENTLY-CHANGED-LOT';
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch: ${err.message}`
        );
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock remains 100');
  });

  await test('4. Case C: Mutating status to REJECTED between preparation and commit aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 30 },
    ]);

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.status = 'REJECTED';
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('REJECTED') || err.message.includes('snapshot mismatch'),
          `Error must indicate REJECTED/snapshot abort: ${err.message}`
        );
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Stock remains 100 on abort');
  });

  await test('4a. Case B.3: Mutating receivedAt between preparation and commit aborts transaction', async () => {
    const b = await setupBaseline(100);
    const originalReceivedAt = '2026-10-18T10:00:00.000Z';
    const mutatedReceivedAt = '2026-10-18T12:00:00.000Z';
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 45 }],
      'RECEIVED',
      undefined,
      originalReceivedAt
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.receivedAt = mutatedReceivedAt; // Mutated timestamp during race window!
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch on timestamp change: ${err.message}`
        );
        return true;
      }
    );

    // Verify all durable stores and memory caches remain untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock must remain 100');
    assert.strictEqual(batch?.version, 1, 'Batch version must remain 1');

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0, 'Zero ledger transactions committed');

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false, 'Receipt must remain unintegrated');

    // Clean retry with the updated authoritative receipt succeeds exactly once
    const updatedAuthoritative = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(updatedAuthoritative, 'Authoritative receipt must exist');
    const retryTxnIds = await inventoryBridgeService.postReceiptToInventory(updatedAuthoritative, actorId);
    assert.strictEqual(retryTxnIds.length, 1, 'Clean retry creates exactly 1 transaction');

    const retriedBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(retriedBatch?.quantityOnHand, 145, 'Batch stock increases to 145 exactly once on retry');

    const retriedTxn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', retryTxnIds[0]);
    assert.strictEqual(retriedTxn?.occurredAt, mutatedReceivedAt, 'Ledger transaction reflects updated receivedAt');
  });

  await test('4b. Case B.4: Receipt without receivedAt uses existing fallback safely and deterministically', async () => {
    const b = await setupBaseline(100);
    // Receipt created with empty receivedAt string
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 35 }],
      'RECEIVED',
      undefined,
      ''
    );

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 135, 'Batch stock increased by 35');

    const txn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnIds[0]);
    assert(txn, 'Ledger transaction exists');
    assert(txn.occurredAt && !isNaN(new Date(txn.occurredAt).getTime()), 'Fallback occurredAt is a valid ISO timestamp');
  });

  await test('4c. Case B.5: Receipt with valid unchanged receivedAt preserves exact timestamp in ledger and batch', async () => {
    const b = await setupBaseline(100);
    const fixedTimestamp = '2026-10-15T08:45:00.000Z';
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 }],
      'RECEIVED',
      undefined,
      fixedTimestamp
    );

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const txn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnIds[0]);
    assert.strictEqual(txn?.occurredAt, fixedTimestamp, 'Transaction occurredAt must match exact authoritative receivedAt');

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 125);
  });

  await test('4d. Case B.6: Mutating receivedAt from empty string to whitespace-only string between preparation and commit is detected and rejected', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 30 }],
      'RECEIVED',
      undefined,
      ''
    );

    // Race hook mutates receivedAt from "" to "   "
    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.receivedAt = '   ';
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch on empty-to-whitespace race: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores and cache remain completely untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock must remain 100');
    assert.strictEqual(batch?.version, 1, 'Batch version must remain 1');

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0, 'Zero ledger transactions committed');

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false, 'Receipt must remain unintegrated');

    // Clean retry after rejection succeeds cleanly
    const updatedAuthoritative = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(updatedAuthoritative);
    const retryTxnIds = await inventoryBridgeService.postReceiptToInventory(updatedAuthoritative, actorId);
    assert.strictEqual(retryTxnIds.length, 1, 'Clean retry succeeds');

    const retriedBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(retriedBatch?.quantityOnHand, 130, 'Batch stock increased to 130 on clean retry');
  });

  await test('4e. Case B.7: Mutating receivedAt from canonical timestamp to whitespace-padded equivalent between preparation and commit is detected and rejected', async () => {
    const b = await setupBaseline(100);
    const canonicalTs = '2026-10-18T14:30:00.000Z';
    const paddedTs = '  2026-10-18T14:30:00.000Z  ';
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'RECEIVED',
      undefined,
      canonicalTs
    );

    // Concurrency invariant: Any alteration of authoritative receivedAt source representation between
    // preparation and commit must cause the transaction snapshot precondition to fail.
    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              stored.receivedAt = paddedTs;
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch on canonical-to-padded race: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores remain untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock must remain 100 on aborted transaction');
    assert.strictEqual(batch?.version, 1, 'Batch version must remain 1');

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0, 'Zero ledger transactions committed');

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false, 'Receipt must remain unintegrated');

    // Clean retry after rejection succeeds cleanly with the updated authoritative state
    const updatedAuthoritative = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert(updatedAuthoritative);
    assert.strictEqual(updatedAuthoritative.receivedAt, paddedTs);
    const retryTxnIds = await inventoryBridgeService.postReceiptToInventory(updatedAuthoritative, actorId);
    assert.strictEqual(retryTxnIds.length, 1, 'Clean retry succeeds');

    const retriedBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(retriedBatch?.quantityOnHand, 120, 'Batch stock increased to 120 on clean retry');

    const retriedTxn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', retryTxnIds[0]);
    assert.strictEqual(
      retriedTxn?.occurredAt,
      canonicalTs,
      'Committed ledger occurredAt must be trimmed canonical timestamp without whitespace padding'
    );
  });

  await test('4e.1. Case B.7b: Mutating receivedAt from defined timestamp to null between preparation and commit is detected and rejected', async () => {
    const b = await setupBaseline(100);
    const canonicalTs = '2026-10-18T14:30:00.000Z';
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'RECEIVED',
      undefined,
      canonicalTs
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              (stored as any).receivedAt = null;
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch on timestamp-to-null race: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores remain untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0);
  });

  await test('4e.2. Case B.7c: computeRawReceivedAtSnapshot distinguishes all 7 valid source states and fails closed on unexpected types', () => {
    const canonicalTs = '2026-10-18T14:30:00.000Z';
    const paddedTs = '  2026-10-18T14:30:00.000Z  ';

    // 1. Property missing
    const rMissing = {} as GoodsReceipt;
    const snapMissing = computeRawReceivedAtSnapshot(rMissing);
    assert.deepStrictEqual(snapMissing, { present: false, type: 'missing', value: null });

    // 2. Property present with undefined
    const rUndefined = { receivedAt: undefined } as any as GoodsReceipt;
    const snapUndefined = computeRawReceivedAtSnapshot(rUndefined);
    assert.deepStrictEqual(snapUndefined, { present: true, type: 'undefined', value: null });

    // 3. Property present with null
    const rNull = { receivedAt: null } as any as GoodsReceipt;
    const snapNull = computeRawReceivedAtSnapshot(rNull);
    assert.deepStrictEqual(snapNull, { present: true, type: 'null', value: null });

    // 4. Empty string
    const rEmpty = { receivedAt: '' } as GoodsReceipt;
    const snapEmpty = computeRawReceivedAtSnapshot(rEmpty);
    assert.deepStrictEqual(snapEmpty, { present: true, type: 'string', value: '' });

    // 5. Whitespace-only string
    const rWhitespace = { receivedAt: '   ' } as GoodsReceipt;
    const snapWhitespace = computeRawReceivedAtSnapshot(rWhitespace);
    assert.deepStrictEqual(snapWhitespace, { present: true, type: 'string', value: '   ' });

    // 6. Canonical timestamp
    const rCanonical = { receivedAt: canonicalTs } as GoodsReceipt;
    const snapCanonical = computeRawReceivedAtSnapshot(rCanonical);
    assert.deepStrictEqual(snapCanonical, { present: true, type: 'string', value: canonicalTs });

    // 7. Whitespace-padded timestamp
    const rPadded = { receivedAt: paddedTs } as GoodsReceipt;
    const snapPadded = computeRawReceivedAtSnapshot(rPadded);
    assert.deepStrictEqual(snapPadded, { present: true, type: 'string', value: paddedTs });

    // Ensure all 7 stringified representations are distinct (zero collision)
    const representations = [
      JSON.stringify(snapMissing),
      JSON.stringify(snapUndefined),
      JSON.stringify(snapNull),
      JSON.stringify(snapEmpty),
      JSON.stringify(snapWhitespace),
      JSON.stringify(snapCanonical),
      JSON.stringify(snapPadded),
    ];
    const unique = new Set(representations);
    assert.strictEqual(unique.size, 7, 'All 7 valid source states must produce distinct snapshot representations');

    // 8. Fail-closed behavior on unexpected runtime types (FINDING-IB-04A)
    assert.throws(
      () => computeRawReceivedAtSnapshot({ receivedAt: 123456789 } as any as GoodsReceipt),
      /Malformed receivedAt.*number/
    );
    assert.throws(
      () => computeRawReceivedAtSnapshot({ receivedAt: { a: 1 } } as any as GoodsReceipt),
      /Malformed receivedAt.*object/
    );
    assert.throws(
      () => computeRawReceivedAtSnapshot({ receivedAt: [1, 2] } as any as GoodsReceipt),
      /Malformed receivedAt.*object/
    );
    assert.throws(
      () => computeRawReceivedAtSnapshot({ receivedAt: true } as any as GoodsReceipt),
      /Malformed receivedAt.*boolean/
    );
  });

  await test('4e.3. Case B.7d: Malformed non-string receivedAt values (object, array, number, boolean) are strictly rejected before preparation', async () => {
    const b = await setupBaseline(100);

    const invalidTypes: Array<{ name: string; val: any; expectedType: string }> = [
      { name: 'object', val: { date: '2026-10-18' }, expectedType: 'object' },
      { name: 'array', val: ['2026-10-18'], expectedType: 'object' },
      { name: 'number', val: 1729267200000, expectedType: 'number' },
      { name: 'boolean', val: true, expectedType: 'boolean' },
    ];

    for (const { name, val, expectedType } of invalidTypes) {
      const receipt = await createAndPersistReceipt(
        [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
        'RECEIVED'
      );
      // Mutate durable receipt to have invalid receivedAt
      const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
      assert(stored);
      (stored as any).receivedAt = val;
      await idbEngine.put('goodsReceipts', stored);

      await assert.rejects(
        async () => {
          await inventoryBridgeService.postReceiptToInventory(stored, actorId);
        },
        (err: any) => {
          assert(
            err.message.includes(`invalid receivedAt type (${expectedType})`),
            `Expected invalid receivedAt type error for ${name}, got: ${err.message}`
          );
          return true;
        }
      );

      // Verify all four stores and cache remain completely untouched
      const batch = await localRepository.getInventoryBatch(b.batchId);
      assert.strictEqual(batch?.quantityOnHand, 100, `Stock must remain 100 on ${name} rejection`);
      assert.strictEqual(batch?.version, 1, `Batch version must remain 1 on ${name} rejection`);

      const txns = await localRepository.getInventoryTransactions(facilityId);
      const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
      assert.strictEqual(related.length, 0, `Zero transactions on ${name} rejection`);

      const durable = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
      assert.strictEqual(durable?.inventoryIntegrated, false, `Receipt must remain unintegrated on ${name}`);

      // Safe recovery: after correcting receivedAt to canonical string, posting succeeds
      durable!.receivedAt = '2026-10-18T12:00:00.000Z';
      await idbEngine.put('goodsReceipts', durable!);

      const retryTxnIds = await inventoryBridgeService.postReceiptToInventory(durable!, actorId);
      assert.strictEqual(retryTxnIds.length, 1, `Clean retry succeeds after correcting ${name}`);

      const retriedBatch = await localRepository.getInventoryBatch(b.batchId);
      assert.strictEqual(retriedBatch?.quantityOnHand, 120, `Stock increases to 120 on clean retry`);

      // Reset baseline batch stock for next iteration
      const resetBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', b.batchId);
      if (resetBatch) {
        resetBatch.quantityOnHand = 100;
        resetBatch.availableQuantity = 100;
        resetBatch.version = 1;
        await idbEngine.put('inventoryBatches', resetBatch);
        localRepository.updateCache('inventoryBatches', resetBatch);
      }
    }
  });

  await test('4e.4. Case B.7e: Concurrent race mutating receivedAt to malformed object between preparation and commit fails closed and aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'RECEIVED',
      undefined,
      '2026-10-18T14:30:00.000Z'
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receiptId);
            if (stored) {
              (stored as any).receivedAt = { malicious: true };
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('Malformed receivedAt') || err.message.includes('snapshot mismatch'),
          `Error must indicate malformed receivedAt or snapshot mismatch: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores remain untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    assert.strictEqual(batch?.version, 1);
    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0);
  });

  await test('4e.5. Case B.7f: Type-safe numeric fingerprinting distinguishes quantities, rejects lossy coercion, and fails closed on invalid types (zero collision)', () => {
    // 1. validateCanonicalQuantity accepts valid non-negative finite numbers
    assert.strictEqual(validateCanonicalQuantity(25, 'acceptedQuantity'), 25);
    assert.strictEqual(validateCanonicalQuantity(0, 'acceptedQuantity'), 0);
    assert.strictEqual(validateCanonicalQuantity(-0, 'acceptedQuantity'), 0, 'Normalizes -0 to +0');
    assert.strictEqual(validateCanonicalQuantity(10.5, 'acceptedQuantity'), 10.5);

    // 2. validateCanonicalQuantity strictly rejects invalid types (fails closed)
    const invalidInputs: Array<{ label: string; val: any }> = [
      { label: 'negative number', val: -1 },
      { label: 'negative fraction', val: -0.001 },
      { label: 'NaN', val: NaN },
      { label: 'Infinity', val: Infinity },
      { label: '-Infinity', val: -Infinity },
      { label: 'numeric string', val: '25' },
      { label: 'empty string', val: '' },
      { label: 'whitespace string', val: '  ' },
      { label: 'zero string', val: '0' },
      { label: 'array', val: [25] },
      { label: 'empty array', val: [] },
      { label: 'object', val: { quantity: 25 } },
      { label: 'null', val: null },
      { label: 'undefined', val: undefined },
      { label: 'boolean true', val: true },
      { label: 'boolean false', val: false },
    ];

    for (const { label, val } of invalidInputs) {
      assert.throws(
        () => validateCanonicalQuantity(val, 'acceptedQuantity', 'line_1', 'grn_1'),
        (err: any) => {
          assert(
            err.message.includes('Malformed or invalid acceptedQuantity') &&
              err.message.includes('expected non-negative finite number'),
            `Expected malformed/invalid message for ${label}, got: ${err.message}`
          );
          return true;
        }
      );
    }

    // 3. computeReceiptStockSnapshotFingerprint produces distinct representations for different numbers
    const makeSampleReceipt = (qty: number, rej: number = 0): GoodsReceipt => ({
      goodsReceiptId: 'grn_snap_01',
      receiptNumber: 'GRN-01',
      shipmentId: 'ship_01',
      purchaseOrderReference: 'PO-01',
      facilityId: 'fac_01',
      warehouseId: 'wh_01',
      lines: [{
        lineId: 'line_01',
        supplyItemId: 'item_01',
        orderedQuantity: qty,
        receivedQuantity: qty,
        acceptedQuantity: qty,
        rejectedQuantity: rej,
        lotNumber: 'LOT-01',
        qualityPassed: true,
      }],
      receivedAt: '2026-10-18T10:00:00.000Z',
      receivedBy: 'user_01',
      status: 'RECEIVED',
      inspectionStatus: 'PASSED',
      discrepancyStatus: 'NONE',
      inventoryIntegrated: false,
      provenance: { createdAt: '2026-10-18T10:00:00.000Z', createdBy: 'user_01', facilityId: 'fac_01', systemVersion: '1.0' },
      integrityMetadata: { hash: 'h', lastVerifiedAt: '2026-10-18T10:00:00.000Z' },
    });

    const snap25 = computeReceiptStockSnapshotFingerprint(makeSampleReceipt(25));
    const snap30 = computeReceiptStockSnapshotFingerprint(makeSampleReceipt(30));
    const snap0 = computeReceiptStockSnapshotFingerprint(makeSampleReceipt(0));
    const snap1 = computeReceiptStockSnapshotFingerprint(makeSampleReceipt(1));

    assert.notStrictEqual(snap25, snap30, 'Different quantities (25 vs 30) must have different fingerprints');
    assert.notStrictEqual(snap0, snap1, '0 vs 1 must have different fingerprints');

    // 4. Zero collisions: Any non-numeric runtime type throws, so it cannot produce a colliding fingerprint
    for (const field of ['orderedQuantity', 'receivedQuantity', 'acceptedQuantity', 'rejectedQuantity'] as const) {
      const corruptReceipt = makeSampleReceipt(25) as any;
      corruptReceipt.lines[0][field] = '25';
      assert.throws(
        () => computeReceiptStockSnapshotFingerprint(corruptReceipt),
        new RegExp(`Malformed or invalid ${field}.*expected non-negative finite number`)
      );

      corruptReceipt.lines[0][field] = [25];
      assert.throws(
        () => computeReceiptStockSnapshotFingerprint(corruptReceipt),
        new RegExp(`Malformed or invalid ${field}.*expected non-negative finite number`)
      );

      corruptReceipt.lines[0][field] = NaN;
      assert.throws(
        () => computeReceiptStockSnapshotFingerprint(corruptReceipt),
        new RegExp(`Malformed or invalid ${field}.*expected non-negative finite number`)
      );

      corruptReceipt.lines[0][field] = null;
      assert.throws(
        () => computeReceiptStockSnapshotFingerprint(corruptReceipt),
        new RegExp(`Malformed or invalid ${field}.*expected non-negative finite number`)
      );
    }
  });

  await test('4e.6. Case B.7g: Concurrent race mutating acceptedQuantity from numeric 25 to string "25" between preparation and commit fails closed and aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 }],
      'RECEIVED'
    );

    // Pre-commit race mutates stored line acceptedQuantity from 25 to string '25'
    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored: any = await idbEngine.get('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].acceptedQuantity = '25';
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('Malformed or invalid acceptedQuantity') ||
            err.message.includes('snapshot mismatch') ||
            err.message.includes('invalid acceptedQuantity'),
          `Error must indicate malformed quantity or snapshot mismatch on string race: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores remain completely untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock must remain 100');
    assert.strictEqual(batch?.version, 1, 'Batch version must remain 1');

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0, 'Zero ledger transactions committed');

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false, 'Receipt must remain unintegrated');

    // Clean retry after repairing authoritative stored record to valid numeric 25 succeeds cleanly
    durableReceipt!.lines[0].acceptedQuantity = 25;
    await idbEngine.put('goodsReceipts', durableReceipt!);

    const retryTxnIds = await inventoryBridgeService.postReceiptToInventory(durableReceipt!, actorId);
    assert.strictEqual(retryTxnIds.length, 1, 'Clean retry succeeds after repair');

    const retriedBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(retriedBatch?.quantityOnHand, 125, 'Stock increases to 125 on clean retry');
  });

  await test('4e.7. Case B.7h: Concurrent race mutating acceptedQuantity from numeric 25 to array [25] between preparation and commit fails closed and aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 }],
      'RECEIVED'
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored: any = await idbEngine.get('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].acceptedQuantity = [25];
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('Malformed or invalid acceptedQuantity') ||
            err.message.includes('snapshot mismatch') ||
            err.message.includes('invalid acceptedQuantity'),
          `Error must indicate malformed quantity or snapshot mismatch on array race: ${err.message}`
        );
        return true;
      }
    );

    // Verify all four stores remain untouched
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    assert.strictEqual(batch?.version, 1);

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0);

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false);
  });

  await test('4e.8. Case B.7i: Concurrent race mutating quantity (accepted/rejected) to NaN between preparation and commit fails closed and aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'RECEIVED'
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored: any = await idbEngine.get('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].rejectedQuantity = NaN;
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('Malformed or invalid rejectedQuantity') ||
            err.message.includes('snapshot mismatch') ||
            err.message.includes('invalid rejectedQuantity'),
          `Error must indicate malformed rejectedQuantity or snapshot mismatch on NaN race: ${err.message}`
        );
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    assert.strictEqual(batch?.version, 1);

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0);

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false);
  });

  await test('4e.9. Case B.7j: Concurrent race mutating acceptedQuantity to distinct numeric 35 triggers snapshot mismatch and aborts transaction', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'RECEIVED'
    );

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async (receiptId: string) => {
            const stored: any = await idbEngine.get('goodsReceipts', receiptId);
            if (stored) {
              stored.lines[0].acceptedQuantity = 35;
              await idbEngine.put('goodsReceipts', stored);
            }
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      (err: any) => {
        assert(
          err.message.includes('snapshot mismatch') || err.message.includes('modified between preparation and commit'),
          `Error must indicate snapshot mismatch on concurrent quantity change: ${err.message}`
        );
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    assert.strictEqual(batch?.version, 1);

    const txns = await localRepository.getInventoryTransactions(facilityId);
    const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
    assert.strictEqual(related.length, 0);

    const durableReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(durableReceipt?.inventoryIntegrated, false);
  });

  await test('4f. Case B.8: Receipts with undefined, null, empty string, and whitespace-only all resolve to identical fallback timestamps', async () => {
    const fixedFallback = '2026-10-19T00:00:00.000Z';

    const resUndefined = resolveCanonicalReceiptTimestamp(undefined, fixedFallback);
    const resNull = resolveCanonicalReceiptTimestamp(null, fixedFallback);
    const resEmpty = resolveCanonicalReceiptTimestamp('', fixedFallback);
    const resWhitespace = resolveCanonicalReceiptTimestamp('   ', fixedFallback);

    assert.strictEqual(resUndefined, fixedFallback);
    assert.strictEqual(resNull, fixedFallback);
    assert.strictEqual(resEmpty, fixedFallback);
    assert.strictEqual(resWhitespace, fixedFallback);

    // Test through full postReceiptToInventory pipeline for null/whitespace
    const b = await setupBaseline(100);
    const receiptWhitespace = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 15 }],
      'RECEIVED',
      undefined,
      '   \t\n  '
    );

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receiptWhitespace, actorId);
    assert.strictEqual(txnIds.length, 1);

    const txn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnIds[0]);
    assert(txn, 'Transaction exists');
    assert(txn.occurredAt && !isNaN(new Date(txn.occurredAt).getTime()), 'occurredAt is valid ISO timestamp');
    assert.strictEqual(txn.occurredAt.trim(), txn.occurredAt, 'occurredAt has no whitespace');
    assert.notStrictEqual(txn.occurredAt, '   \t\n  ', 'occurredAt must not be the raw whitespace string');
  });

  await test('4g. Case B.9: Valid timestamp with leading/trailing whitespace commits trimmed canonical timestamp to batch and ledger', async () => {
    const b = await setupBaseline(100);
    const canonical = '2026-10-17T09:15:30.123Z';
    const padded = `  \t ${canonical}   \n `;

    const newLot = `LOT-CANONICAL-${Date.now().toString(36)}`;
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: newLot, acceptedQuantity: 25 }],
      'RECEIVED',
      undefined,
      padded
    );

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const txn = await idbEngine.get<InventoryTransaction>('inventoryTransactions', txnIds[0]);
    assert.strictEqual(txn?.occurredAt, canonical, 'Ledger transaction occurredAt must be strictly trimmed canonical');

    // Verify batch also has trimmed canonical receivedAt
    const createdBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', txn?.batchId || '');
    assert.strictEqual(createdBatch?.receivedAt, canonical, 'Batch receivedAt must be strictly trimmed canonical');
  });

  // =========================================================================
  // TEST GROUP 3: VALID INTEGRATION & REJECTION GUARDS
  // =========================================================================
  console.log('\n--- Test Group 3: Valid Integration & Rejection Guards ---');

  await test('5. Case D: Unchanged valid receipt integrates successfully with exact quantities', async () => {
    const b = await setupBaseline(80);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 35 },
    ]);

    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 115, '80 + 35 = 115');

    const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(stored?.inventoryIntegrated, true);
    assert.deepStrictEqual(stored?.inventoryTransactionIds, txnIds);
  });

  await test('5a. Case D.1: Stored RECEIVED receipt cannot be promoted to FINALIZED by caller in-memory status', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 }],
      'RECEIVED'
    );

    const callerPromotedReceipt: GoodsReceipt = {
      ...receipt,
      status: 'FINALIZED',
    };

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(callerPromotedReceipt, actorId);
      },
      (err: any) => {
        assert(
          err.message.includes("status mismatch: caller supplied 'FINALIZED', but authoritative stored status is 'RECEIVED'"),
          `Expected status mismatch rejection, got: ${err.message}`
        );
        return true;
      }
    );

    // Verify zero writes: stock unchanged, stored receipt still RECEIVED and unintegrated
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(stored?.status, 'RECEIVED');
    assert.strictEqual(stored?.inventoryIntegrated, false);
    assert.strictEqual(stored?.inventoryTransactionIds, undefined);
  });

  await test('5b. Case D.2: Stored PARTIALLY_ACCEPTED receipt cannot be regressed to RECEIVED by caller-supplied status', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 15 }],
      'PARTIALLY_ACCEPTED'
    );

    const callerRegressedReceipt: GoodsReceipt = {
      ...receipt,
      status: 'RECEIVED',
    };

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(callerRegressedReceipt, actorId);
      },
      (err: any) => {
        assert(
          err.message.includes("status mismatch: caller supplied 'RECEIVED', but authoritative stored status is 'PARTIALLY_ACCEPTED'"),
          `Expected status mismatch regression rejection, got: ${err.message}`
        );
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
    const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    assert.strictEqual(stored?.status, 'PARTIALLY_ACCEPTED');
    assert.strictEqual(stored?.inventoryIntegrated, false);
  });

  await test('5c. Case D.3: Malformed acceptedQuantity (string, NaN, negative, non-numeric) is strictly rejected before preparation', async () => {
    const b = await setupBaseline(100);

    const malformedQuantities = [
      { label: 'string quantity', val: '25' as any },
      { label: 'NaN quantity', val: NaN },
      { label: 'negative quantity', val: -10 },
      { label: 'object quantity', val: { qty: 25 } as any },
    ];

    for (const { label, val } of malformedQuantities) {
      const receipt = await createAndPersistReceipt(
        [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 10 }],
        'RECEIVED'
      );
      // Alter durable receipt line to have malformed acceptedQuantity
      const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
      assert(stored);
      (stored.lines[0] as any).acceptedQuantity = val;
      await idbEngine.put('goodsReceipts', stored);

      await assert.rejects(
        async () => {
          await inventoryBridgeService.postReceiptToInventory(stored, actorId);
        },
        (err: any) => {
          assert(
            err.message.includes('invalid acceptedQuantity'),
            `Expected invalid acceptedQuantity error for ${label}, got: ${err.message}`
          );
          return true;
        }
      );

      // Verify zero stock mutation across stores
      const batch = await localRepository.getInventoryBatch(b.batchId);
      assert.strictEqual(batch?.quantityOnHand, 100, `Stock must remain 100 for ${label}`);
      assert.strictEqual(batch?.version, 1);
      const txns = await localRepository.getInventoryTransactions(facilityId);
      const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
      assert.strictEqual(related.length, 0);
    }
  });

  await test('5d. Case D.4: Malformed orderedQuantity, receivedQuantity, and rejectedQuantity are strictly rejected before preparation', async () => {
    const b = await setupBaseline(100);

    const testCases: Array<{ field: 'orderedQuantity' | 'receivedQuantity' | 'rejectedQuantity'; label: string; val: any }> = [
      { field: 'orderedQuantity', label: 'string orderedQuantity', val: '50' },
      { field: 'orderedQuantity', label: 'negative orderedQuantity', val: -5 },
      { field: 'receivedQuantity', label: 'NaN receivedQuantity', val: NaN },
      { field: 'receivedQuantity', label: 'array receivedQuantity', val: [10] },
      { field: 'rejectedQuantity', label: 'object rejectedQuantity', val: { rej: 0 } },
      { field: 'rejectedQuantity', label: 'negative rejectedQuantity', val: -1 },
    ];

    for (const { field, label, val } of testCases) {
      const receipt = await createAndPersistReceipt(
        [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 10 }],
        'RECEIVED'
      );
      const stored = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
      assert(stored);
      (stored.lines[0] as any)[field] = val;
      await idbEngine.put('goodsReceipts', stored);

      await assert.rejects(
        async () => {
          await inventoryBridgeService.postReceiptToInventory(stored, actorId);
        },
        (err: any) => {
          assert(
            err.message.includes(`invalid ${field}`) || err.message.includes(`Malformed or invalid ${field}`),
            `Expected invalid ${field} error for ${label}, got: ${err.message}`
          );
          return true;
        }
      );

      // Verify zero stock mutation across stores
      const batch = await localRepository.getInventoryBatch(b.batchId);
      assert.strictEqual(batch?.quantityOnHand, 100, `Stock must remain 100 for ${label}`);
      assert.strictEqual(batch?.version, 1);
      const txns = await localRepository.getInventoryTransactions(facilityId);
      const related = txns.filter((t) => t.referenceId === receipt.goodsReceiptId);
      assert.strictEqual(related.length, 0);
    }
  });

  await test('6. Case E.1: Missing authoritative receipt is strictly rejected', async () => {
    const b = await setupBaseline(100);
    const fakeReceipt: GoodsReceipt = {
      goodsReceiptId: `grn_fake_${Date.now()}`,
      receiptNumber: 'GRN-FAKE',
      shipmentId: 'ship_fake',
      purchaseOrderReference: 'PO-FAKE',
      facilityId,
      warehouseId: 'wh_fake',
      lines: [{
        lineId: 'line_fake',
        supplyItemId: b.supplyItemId,
        orderedQuantity: 50,
        receivedQuantity: 50,
        acceptedQuantity: 50,
        rejectedQuantity: 0,
        lotNumber: b.lotNumber,
        qualityPassed: true,
      }],
      receivedAt: new Date().toISOString(),
      receivedBy: actorId,
      status: 'RECEIVED',
      inspectionStatus: 'PASSED',
      discrepancyStatus: 'NONE',
      inventoryIntegrated: false,
      provenance: {
        createdAt: new Date().toISOString(),
        createdBy: actorId,
        facilityId,
        systemVersion: '1.0',
      },
      integrityMetadata: { hash: 'hash', lastVerifiedAt: new Date().toISOString() },
    };

    await assert.rejects(
      async () => {
        await inventoryBridgeService.postReceiptToInventory(fakeReceipt, actorId);
      },
      (err: any) => {
        assert(err.message.includes('Authoritative goods receipt not found in storage'));
        return true;
      }
    );

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Batch stock remains 100');
  });

  await test('7. Case E.2: DRAFT authoritative receipt is rejected', async () => {
    const b = await setupBaseline(100);
    const draftReceipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'DRAFT'
    );

    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(draftReceipt, actorId);
    });

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
  });

  await test('8. Case E.3: REJECTED authoritative receipt is rejected', async () => {
    const b = await setupBaseline(100);
    const rejectedReceipt = await createAndPersistReceipt(
      [{ supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 }],
      'REJECTED'
    );

    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(rejectedReceipt, actorId);
    });

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100);
  });

  await test('9. Case E.4: Already-integrated receipt is rejected on second call', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 },
    ]);

    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);

    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    });

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 120, 'Stock must not increase on duplicate call');
  });

  // =========================================================================
  // TEST GROUP 4: CONCURRENCY, IDEMPOTENCY & WORKFLOWS
  // =========================================================================
  console.log('\n--- Test Group 4: Concurrency, Idempotency & Workflows ---');

  await test('10. Case F.1: Sequential duplicate attempts are blocked without second stock increase', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 25 },
    ]);

    await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    const midBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(midBatch?.quantityOnHand, 125);

    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    });

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 125);
  });

  await test('11. Case F.2: Concurrent duplicate calls fulfill exactly once and reject duplicate', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 30 },
    ]);

    const results = await Promise.allSettled([
      inventoryBridgeService.postReceiptToInventory(receipt, actorId),
      inventoryBridgeService.postReceiptToInventory(receipt, actorId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent call must succeed');
    assert.strictEqual(rejected.length, 1, 'Exactly one concurrent call must be rejected');

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 130, 'Stock must increase by 30 exactly once');
  });

  await test('12. Case F.3: Independent bridge instances cannot integrate the same receipt twice', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 40 },
    ]);

    const bridge1 = InventoryBridgeService.getInstance();
    const bridge2 = InventoryBridgeService.getInstance();

    await bridge1.postReceiptToInventory(receipt, actorId);

    await assert.rejects(async () => {
      await bridge2.postReceiptToInventory(receipt, actorId);
    });

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 140);
  });

  await test('13. Case G: Transaction abort / request error rolls back all stores and permits clean retry', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    // 1st attempt: fails on simulated error
    idbEngine.setSimulatedFailure('request_error');
    try {
      await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    } catch {}

    const midBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(midBatch?.quantityOnHand, 100, 'Batch must remain 100 after aborted attempt');

    // 2nd attempt: succeeds cleanly
    idbEngine.setSimulatedFailure('none');
    const txnIds = await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
    assert.strictEqual(txnIds.length, 1);

    const finalBatch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(finalBatch?.quantityOnHand, 150, 'Clean retry succeeds to 150');
  });

  await test('14. Case H: LogisticsReceivingService.finalizeGoodsReceipt() integrates cleanly and idempotently', async () => {
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 50 },
    ]);

    (logisticsReceivingService as any).shipments.set(receipt.shipmentId, {
      shipmentId: receipt.shipmentId,
      status: 'DISPATCHED',
    });
    (logisticsReceivingService as any).receipts.set(receipt.goodsReceiptId, receipt);

    const finalized = await logisticsReceivingService.finalizeGoodsReceipt(receipt.goodsReceiptId, actorId);
    assert.strictEqual(finalized.status, 'FINALIZED');
    assert.strictEqual(finalized.inventoryIntegrated, true);
    assert.strictEqual(finalized.inventoryTransactionIds?.length, 1);

    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 150, 'Batch stock increased by 50');

    // Duplicate call to finalizeGoodsReceipt is blocked
    await assert.rejects(async () => {
      await logisticsReceivingService.finalizeGoodsReceipt(receipt.goodsReceiptId, actorId);
    });

    // Direct bridge call is also independently blocked
    await assert.rejects(async () => {
      await inventoryBridgeService.postReceiptToInventory(finalized, actorId);
    });
  });

  // =========================================================================
  // TEST GROUP 5: PRODUCTION TEST-SEAM ISOLATION & SAFETY VERIFICATION
  // =========================================================================
  console.log('\n--- Test Group 5: Production Test-Seam Isolation & Safety Verification ---');

  await test('15. Case P.1: Test hook cleanup after callback success and callback failure', async () => {
    const dummyReceiptId = 'grn_cleanup_test_01';

    // 1. Success case: hook executed and cleaned up
    assert.strictEqual(getActivePreCommitHookCountForTesting(), 0, 'Initially 0 active hooks');
    await withReceiptPreCommitRace(
      dummyReceiptId,
      async () => {},
      async () => {
        assert.strictEqual(getActivePreCommitHookCountForTesting(), 1, '1 active hook during block');
      }
    );
    assert.strictEqual(getActivePreCommitHookCountForTesting(), 0, 'Cleaned up after success');

    // 2. Failure case: hook throwing exception still cleans up registry
    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          dummyReceiptId,
          async () => {},
          async () => {
            assert.strictEqual(getActivePreCommitHookCountForTesting(), 1, '1 active hook during block');
            throw new Error('INTENTIONAL_BLOCK_FAILURE');
          }
        );
      },
      /INTENTIONAL_BLOCK_FAILURE/
    );
    assert.strictEqual(getActivePreCommitHookCountForTesting(), 0, 'Cleaned up after failure');

    // 3. Callback exception during pre-commit execution fails closed
    const b = await setupBaseline(100);
    const receipt = await createAndPersistReceipt([
      { supplyItemId: b.supplyItemId, lotNumber: b.lotNumber, acceptedQuantity: 20 },
    ]);

    await assert.rejects(
      async () => {
        await withReceiptPreCommitRace(
          receipt.goodsReceiptId,
          async () => {
            throw new Error('SIMULATED_PRE_COMMIT_HOOK_FAILURE');
          },
          async () => {
            await inventoryBridgeService.postReceiptToInventory(receipt, actorId);
          }
        );
      },
      /SIMULATED_PRE_COMMIT_HOOK_FAILURE/
    );

    // Ensure zero writes committed and hook registry is clean
    const batch = await localRepository.getInventoryBatch(b.batchId);
    assert.strictEqual(batch?.quantityOnHand, 100, 'Zero writes on hook failure');
    assert.strictEqual(getActivePreCommitHookCountForTesting(), 0, 'Hook cleaned up after callback failure');
  });

  await test('16. Case P.2: Structural verification that testHookBeforeTransactionCommit is absent from InventoryBridgeService', () => {
    // Verify static class definition has no test hook property
    assert.strictEqual(
      (InventoryBridgeService as any).testHookBeforeTransactionCommit,
      undefined,
      'InventoryBridgeService must not have static testHookBeforeTransactionCommit'
    );

    // Verify singleton instance has no test hook property
    assert.strictEqual(
      (inventoryBridgeService as any).testHookBeforeTransactionCommit,
      undefined,
      'inventoryBridgeService instance must not have testHookBeforeTransactionCommit'
    );

    // Verify own property descriptor is non-existent
    const ownProps = Object.getOwnPropertyNames(InventoryBridgeService);
    assert(
      !ownProps.includes('testHookBeforeTransactionCommit'),
      'testHookBeforeTransactionCommit must not be an own property of InventoryBridgeService'
    );
  });

  await test('17. Case P.3: Prohibition of test hook registration when NODE_ENV === "production"', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';

      // withReceiptPreCommitRace must reject immediately
      await assert.rejects(
        async () => {
          await withReceiptPreCommitRace('grn_prod_test', async () => {}, async () => {});
        },
        /Receipt pre-commit test seam is strictly disabled in production environments/
      );

      // registerReceiptPreCommitHookForTesting must throw immediately
      assert.throws(
        () => {
          registerReceiptPreCommitHookForTesting('grn_prod_test', async () => {});
        },
        /Receipt pre-commit test seam is strictly disabled in production environments/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  await test('18. Case P.4: Build-level verification: testHookBeforeTransactionCommit does not exist in production bundle', () => {
    // If dist/ directory exists, inspect assets for any occurrence of testHookBeforeTransactionCommit
    if (fs.existsSync('dist/assets')) {
      const files = fs.readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(`dist/assets/${file}`, 'utf-8');
        assert(
          !content.includes('testHookBeforeTransactionCommit'),
          `Production bundle asset ${file} must not contain testHookBeforeTransactionCommit`
        );
      }
    }
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/38 STAGE 3.2.5.6.2.2 AUTHORITATIVE STOCK DATA TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage325622Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
