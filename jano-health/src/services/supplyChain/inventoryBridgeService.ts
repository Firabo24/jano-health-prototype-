/**
 * Jano Health - Clinical Core V17: Supply Chain to V7 Inventory Bridge
 * 
 * Bridges authoritative GoodsReceipt events into the V7 operational stock ledger.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - V7 inventory remains authoritative for clinical dispensing stock.
 * - DispenseRecord ≠ Shipment
 * - GoodsReceipt ≠ InventoryTransaction: Goods receipt confirms physical arrival;
 *   InventoryTransaction records the append-only stock movement into the pharmacy/clinical ledger.
 * - Stock balances are NEVER directly mutated. Stock is computed deterministically
 *   from append-only transactions in the local repository ledger.
 * - Preserves lot number, expiry date, and unit integrity.
 */

import { GoodsReceipt, GoodsReceiptStatus } from '../../domain/v17SupplyChainTypes';
import { InventoryTransaction, InventoryItem, InventoryBatch } from '../../domain/pharmacyTypes';
import { localRepository } from '../storage/localRepository';
import { supplyCatalogService } from './supplyCatalogService';
import { auditService } from '../audit/auditService';
import { idbEngine, StoreName, TransactionPrecondition } from '../storage/indexedDbEngine';

/**
 * Canonical timestamp resolver for goods receipt inventory integration.
 * Resolves non-empty trimmed receivedAt, or falls back to the deterministic capture time.
 */
export function resolveCanonicalReceiptTimestamp(
  receivedAt: string | undefined | null,
  fallbackNow: string
): string {
  if (typeof receivedAt === 'string') {
    const trimmed = receivedAt.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallbackNow;
}

export interface RawReceivedAtSnapshot {
  present: boolean;
  type: string;
  value: string | null;
}

/**
 * Type-aware raw source representation of `receivedAt` for snapshot fingerprinting.
 * Distinguishes:
 * - Property missing
 * - Property present with undefined
 * - Property present with null
 * - Empty string ""
 * - Whitespace-only string
 * - Canonical timestamp string
 * - Whitespace-padded timestamp string
 * - Unexpected runtime non-string types (fails closed)
 *
 * Preserves the exact original string without trimming so that any change in source
 * representation between preparation and commit causes a snapshot mismatch.
 */
export function computeRawReceivedAtSnapshot(receipt: GoodsReceipt): RawReceivedAtSnapshot {
  if (!receipt || !Object.prototype.hasOwnProperty.call(receipt, 'receivedAt')) {
    return { present: false, type: 'missing', value: null };
  }
  const raw = receipt.receivedAt;
  if (raw === undefined) {
    return { present: true, type: 'undefined', value: null };
  }
  if (raw === null) {
    return { present: true, type: 'null', value: null };
  }
  if (typeof raw === 'string') {
    return { present: true, type: 'string', value: raw };
  }
  throw new Error(
    `Malformed receivedAt on receipt ${receipt?.goodsReceiptId || 'unknown'}: expected string, null, or undefined, got ${typeof raw}.`
  );
}

/**
 * Validates and normalizes canonical line quantity fields for snapshot generation.
 * Strict numeric enforcement:
 * - typeof value === 'number'
 * - Number.isFinite(value)
 * - !isNaN(value)
 * - value >= 0
 * Normalizes -0 to +0.
 * Fails closed with descriptive Error on any malformed or non-numeric value.
 */
export function validateCanonicalQuantity(
  value: unknown,
  fieldName: string,
  lineId?: string,
  receiptId?: string
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || isNaN(value) || value < 0) {
    const typeLabel =
      typeof value === 'number'
        ? String(value)
        : value === null
        ? 'null'
        : Array.isArray(value)
        ? 'array'
        : typeof value;
    throw new Error(
      `Malformed or invalid ${fieldName} on receipt ${receiptId || 'unknown'} line ${lineId || 'unknown'}: expected non-negative finite number, got ${typeLabel}.`
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Computes a deterministic canonical fingerprint of the stock-driving and lifecycle
 * state of a GoodsReceipt. Used for optimistic concurrency validation at the native transaction boundary.
 */
export function computeReceiptStockSnapshotFingerprint(receipt: GoodsReceipt): string {
  const normalizedLines = (receipt.lines || []).map((l, index) => {
    const lineId = l.lineId || `line_${index}`;
    return {
      lineId,
      supplyItemId: l.supplyItemId || '',
      orderedQuantity: validateCanonicalQuantity(l.orderedQuantity, 'orderedQuantity', lineId, receipt.goodsReceiptId),
      receivedQuantity: validateCanonicalQuantity(l.receivedQuantity, 'receivedQuantity', lineId, receipt.goodsReceiptId),
      acceptedQuantity: validateCanonicalQuantity(l.acceptedQuantity, 'acceptedQuantity', lineId, receipt.goodsReceiptId),
      rejectedQuantity: validateCanonicalQuantity(l.rejectedQuantity, 'rejectedQuantity', lineId, receipt.goodsReceiptId),
      lotNumber: l.lotNumber || '',
      expiryDate: l.expiryDate || '',
      qualityPassed: Boolean(l.qualityPassed),
    };
  });

  normalizedLines.sort((a, b) => a.lineId.localeCompare(b.lineId));

  const snapshot = {
    goodsReceiptId: receipt.goodsReceiptId,
    receiptNumber: receipt.receiptNumber || '',
    purchaseOrderReference: receipt.purchaseOrderReference || '',
    facilityId: receipt.facilityId,
    warehouseId: receipt.warehouseId || '',
    status: receipt.status,
    rawReceivedAt: computeRawReceivedAtSnapshot(receipt),
    inventoryIntegrated: Boolean(receipt.inventoryIntegrated),
    lines: normalizedLines,
  };

  return JSON.stringify(snapshot);
}

/**
 * Internal test seam registry for deterministic concurrency and race simulation.
 * Isolated from production:
 * - Scoped strictly to specific goodsReceiptId (cannot leak across unrelated receipts).
 * - One-shot execution (automatically discarded upon execution).
 * - Enforces environment check: forbidden when NODE_ENV === 'production'.
 * - Guaranteed cleanup via try/finally in test harnesses.
 */
type ReceiptPreCommitHook = (receiptId: string) => Promise<void> | void;
const testPreCommitHooks = new Map<string, ReceiptPreCommitHook>();

/**
 * Test-only utility to execute an inventory bridge operation with an isolated,
 * one-shot pre-commit race hook.
 *
 * Normal production code cannot activate this path.
 */
export async function withReceiptPreCommitRace<T>(
  receiptId: string,
  hook: (receiptId: string) => Promise<void> | void,
  action: () => Promise<T>
): Promise<T> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Receipt pre-commit test seam is strictly disabled in production environments.');
  }
  if (!receiptId) {
    throw new Error('receiptId is required to register a pre-commit test hook.');
  }
  testPreCommitHooks.set(receiptId, hook);
  try {
    return await action();
  } finally {
    testPreCommitHooks.delete(receiptId);
  }
}

/**
 * Direct registration of a one-shot pre-commit race hook for test scenarios
 * where withReceiptPreCommitRace wrapper cannot be used. Returns an unregister function.
 */
export function registerReceiptPreCommitHookForTesting(
  receiptId: string,
  hook: (receiptId: string) => Promise<void> | void
): () => void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Receipt pre-commit test seam is strictly disabled in production environments.');
  }
  if (!receiptId) {
    throw new Error('receiptId is required to register a pre-commit test hook.');
  }
  testPreCommitHooks.set(receiptId, hook);
  return () => {
    testPreCommitHooks.delete(receiptId);
  };
}

/**
 * Returns count of active test hooks (used for structural testing).
 */
export function getActivePreCommitHookCountForTesting(): number {
  return testPreCommitHooks.size;
}

/**
 * Clears all test hooks (used in test teardown).
 */
export function clearPreCommitHooksForTesting(): void {
  testPreCommitHooks.clear();
}

export class InventoryBridgeService {
  private static instance: InventoryBridgeService;
  private activePostings: Map<string, Promise<string[]>> = new Map();

  private constructor() {}

  public static getInstance(): InventoryBridgeService {
    if (!InventoryBridgeService.instance) {
      InventoryBridgeService.instance = new InventoryBridgeService();
    }
    return InventoryBridgeService.instance;
  }

  /**
   * Posts accepted goods from a finalized GoodsReceipt into the V7 inventory ledger.
   * Commits all affected entities (inventoryItems, inventoryBatches, inventoryTransactions, goodsReceipts)
   * atomically in a single IndexedDB transaction with commit-first cache integrity,
   * authoritative receipt existence, lifecycle validation, and durable idempotency protection.
   * Returns list of created InventoryTransaction IDs.
   */
  public async postReceiptToInventory(
    receipt: GoodsReceipt,
    actorId: string
  ): Promise<string[]> {
    if (!receipt || !receipt.goodsReceiptId) {
      throw new Error('Invalid goods receipt: missing goodsReceiptId');
    }

    // Await any in-flight posting for the same goods receipt to serialize intra-process calls
    const inFlight = this.activePostings.get(receipt.goodsReceiptId);
    if (inFlight) {
      await inFlight.catch(() => {});
    }

    const task = this.executePostReceiptToInventory(receipt, actorId);
    this.activePostings.set(receipt.goodsReceiptId, task);
    try {
      return await task;
    } finally {
      this.activePostings.delete(receipt.goodsReceiptId);
    }
  }

  private async executePostReceiptToInventory(
    receipt: GoodsReceipt,
    actorId: string
  ): Promise<string[]> {
    if (receipt.inventoryIntegrated) {
      throw new Error(`Receipt ${receipt.goodsReceiptId} has already been integrated into inventory.`);
    }

    // Pre-transaction check against durable store: authoritative receipt MUST exist
    const authoritativeReceipt = await idbEngine.get<GoodsReceipt>('goodsReceipts', receipt.goodsReceiptId);
    if (!authoritativeReceipt) {
      throw new Error(`Authoritative goods receipt not found in storage: ${receipt.goodsReceiptId}`);
    }

    if (receipt.goodsReceiptId !== authoritativeReceipt.goodsReceiptId) {
      throw new Error(`Goods receipt ID mismatch: caller ${receipt.goodsReceiptId} vs authoritative ${authoritativeReceipt.goodsReceiptId}`);
    }

    if (authoritativeReceipt.inventoryIntegrated) {
      receipt.inventoryIntegrated = true;
      if (authoritativeReceipt.inventoryTransactionIds) {
        receipt.inventoryTransactionIds = authoritativeReceipt.inventoryTransactionIds;
      }
      throw new Error(`Receipt ${receipt.goodsReceiptId} has already been integrated into inventory.`);
    }

    const ALLOWED_INTEGRATION_STATUSES: GoodsReceiptStatus[] = ['RECEIVED', 'PARTIALLY_ACCEPTED', 'FINALIZED'];
    if (!ALLOWED_INTEGRATION_STATUSES.includes(authoritativeReceipt.status)) {
      throw new Error(
        `Receipt ${receipt.goodsReceiptId} cannot be integrated into inventory with status '${authoritativeReceipt.status}'. Valid statuses: ${ALLOWED_INTEGRATION_STATUSES.join(', ')}.`
      );
    }

    if (receipt.status && !ALLOWED_INTEGRATION_STATUSES.includes(receipt.status)) {
      throw new Error(
        `Receipt ${receipt.goodsReceiptId} cannot be integrated into inventory with status '${receipt.status}'. Valid statuses: ${ALLOWED_INTEGRATION_STATUSES.join(', ')}.`
      );
    }

    // Enforce authoritative lifecycle preservation (FINDING-IB-04B):
    // Caller cannot supply an unapproved lifecycle transition that does not match authoritative storage.
    if (receipt.status && receipt.status !== authoritativeReceipt.status) {
      throw new Error(
        `Receipt ${receipt.goodsReceiptId} status mismatch: caller supplied '${receipt.status}', but authoritative stored status is '${authoritativeReceipt.status}'. Unapproved lifecycle transitions are forbidden.`
      );
    }

    // Validate authoritative receivedAt type: must be string, null, or undefined (FINDING-IB-04A)
    if (Object.prototype.hasOwnProperty.call(authoritativeReceipt, 'receivedAt')) {
      const rawTs = authoritativeReceipt.receivedAt;
      if (rawTs !== undefined && rawTs !== null && typeof rawTs !== 'string') {
        throw new Error(
          `Authoritative receipt ${receipt.goodsReceiptId} has invalid receivedAt type (${typeof rawTs}). Expected string, null, or undefined.`
        );
      }
    }

    // Validate stock-driving line quantities: must be non-negative finite numbers (FINDING-IB-04C)
    for (const line of authoritativeReceipt.lines || []) {
      for (const field of ['orderedQuantity', 'receivedQuantity', 'acceptedQuantity', 'rejectedQuantity'] as const) {
        const val = (line as any)[field];
        if (typeof val !== 'number' || !Number.isFinite(val) || isNaN(val) || val < 0) {
          throw new Error(
            `Receipt ${receipt.goodsReceiptId} line ${line.lineId || 'unknown'} has invalid ${field}: ${String(val)} (must be a non-negative finite number).`
          );
        }
      }
    }

    // Capture deterministic snapshot of authoritative receipt state used for preparation (FINDING-IB-03B)
    const preparationSnapshotFingerprint = computeReceiptStockSnapshotFingerprint(authoritativeReceipt);

    // Derived strictly from the authoritative persisted receipt, not caller parameter (FINDING-IB-03A)
    const facilityId = authoritativeReceipt.facilityId;
    const now = new Date().toISOString();
    const resolvedReceivedAt = resolveCanonicalReceiptTimestamp(authoritativeReceipt.receivedAt, now);

    const validLines = (authoritativeReceipt.lines || []).filter((l) => l.acceptedQuantity > 0);
    if (validLines.length === 0) {
      return [];
    }

    const existingItems = await localRepository.getInventoryItems(facilityId);

    // Staging maps to track entity updates within this receipt posting
    const stagedItems = new Map<string, { item: InventoryItem; isNew: boolean; originalVersion?: number }>();
    const stagedBatches = new Map<string, { batch: InventoryBatch; isNew: boolean; originalVersion?: number }>();
    const stagedTransactions: InventoryTransaction[] = [];
    const transactionIds: string[] = [];

    for (const line of validLines) {
      const supplyItem = supplyCatalogService.getItem(line.supplyItemId);
      const itemName = supplyItem ? supplyItem.name : line.supplyItemId;
      const medCode = supplyItem?.code || line.supplyItemId;
      const genericName = supplyItem?.genericName || itemName;

      // 1. Locate or create corresponding V7 InventoryItem
      let foundItemEntry = Array.from(stagedItems.values()).find(
        (entry) =>
          (supplyItem?.code && entry.item.medicationCode === supplyItem.code) ||
          entry.item.genericName.toLowerCase() === itemName.toLowerCase()
      );

      if (!foundItemEntry) {
        const existingItem = existingItems.find(
          (i) =>
            (supplyItem?.code && i.medicationCode === supplyItem.code) ||
            i.genericName.toLowerCase() === itemName.toLowerCase()
        );

        if (!existingItem) {
          const newItemId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          const newItem: InventoryItem = {
            id: newItemId,
            facilityId,
            medicationDefinitionId: supplyItem?.supplyItemId || line.supplyItemId,
            medicationCode: medCode,
            genericName,
            formulation: supplyItem?.packagingUnit || 'UNIT',
            strength: 'Standard',
            unit: supplyItem?.packagingUnit || 'UNIT',
            storageRequirements: {
              type: 'ROOM_TEMPERATURE',
            },
            reorderPoint: 20,
            minimumStock: 10,
            maximumStock: 100,
            active: true,
            provenance: {
              source: 'V17_SUPPLY_CHAIN_LOGISTICS',
              facilityId,
              actorId,
              createdAt: now,
            },
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          foundItemEntry = { item: newItem, isNew: true };
          stagedItems.set(newItem.id, foundItemEntry);
        } else {
          // Prepare proposed updated item without mutating cached reference
          const updatedInvItem: InventoryItem = {
            ...existingItem,
            provenance: existingItem.provenance
              ? { ...existingItem.provenance }
              : {
                  source: 'V17_SUPPLY_CHAIN_LOGISTICS',
                  facilityId,
                  actorId,
                  createdAt: now,
                },
            version: (existingItem.version || 1) + 1,
            updatedAt: now,
          };
          foundItemEntry = {
            item: updatedInvItem,
            isNew: false,
            originalVersion: existingItem.version || 1,
          };
          stagedItems.set(existingItem.id, foundItemEntry);
        }
      }

      const invItem = foundItemEntry.item;

      // 2. Locate or create corresponding V7 InventoryBatch
      const existingBatches = await localRepository.getInventoryBatches(invItem.id, facilityId);

      let foundBatchEntry = Array.from(stagedBatches.values()).find(
        (entry) => entry.batch.inventoryItemId === invItem.id && entry.batch.batchNumber === line.lotNumber
      );

      let committedBatch: InventoryBatch;

      if (!foundBatchEntry) {
        const existingBatch = existingBatches.find((b) => b.batchNumber === line.lotNumber);

        if (!existingBatch) {
          const newBatchId = `bat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
          const acceptedQty = line.acceptedQuantity;
          const newBatch: InventoryBatch = {
            id: newBatchId,
            inventoryItemId: invItem.id,
            facilityId,
            batchNumber: line.lotNumber,
            lotNumber: line.lotNumber,
            expiryDate: line.expiryDate || new Date(Date.now() + 365 * 24 * 3600000).toISOString(),
            quantityOnHand: acceptedQty,
            reservedQuantity: 0,
            availableQuantity: acceptedQty,
            receivedAt: resolvedReceivedAt,
            receivedById: actorId,
            status: 'AVAILABLE',
            provenance: {
              source: 'V17_SUPPLY_CHAIN_LOGISTICS',
              facilityId,
              actorId,
              createdAt: now,
            },
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          foundBatchEntry = { batch: newBatch, isNew: true };
          stagedBatches.set(newBatch.id, foundBatchEntry);
          committedBatch = newBatch;
        } else {
          // Construct a separate proposed updated batch WITHOUT mutating the existing cached object
          const acceptedQty = line.acceptedQuantity;
          const newOnHand = existingBatch.quantityOnHand + acceptedQty;
          const newAvailable = existingBatch.availableQuantity + acceptedQty;
          const proposedBatch: InventoryBatch = {
            ...existingBatch,
            provenance: existingBatch.provenance
              ? { ...existingBatch.provenance }
              : {
                  source: 'V17_SUPPLY_CHAIN_LOGISTICS',
                  facilityId,
                  actorId,
                  createdAt: now,
                },
            quantityOnHand: newOnHand,
            availableQuantity: newAvailable,
            status: newOnHand > 0 && existingBatch.status === 'DEPLETED' ? 'AVAILABLE' : existingBatch.status,
            version: (existingBatch.version || 1) + 1,
            updatedAt: now,
          };
          foundBatchEntry = {
            batch: proposedBatch,
            isNew: false,
            originalVersion: existingBatch.version || 1,
          };
          stagedBatches.set(existingBatch.id, foundBatchEntry);
          committedBatch = proposedBatch;
        }
      } else {
        // Additional line in the same receipt updating the same batch
        const currentBatch = foundBatchEntry.batch;
        const acceptedQty = line.acceptedQuantity;
        const newOnHand = currentBatch.quantityOnHand + acceptedQty;
        const newAvailable = currentBatch.availableQuantity + acceptedQty;
        const updatedBatch: InventoryBatch = {
          ...currentBatch,
          provenance: currentBatch.provenance
            ? { ...currentBatch.provenance }
            : {
                source: 'V17_SUPPLY_CHAIN_LOGISTICS',
                facilityId,
                actorId,
                createdAt: now,
              },
          quantityOnHand: newOnHand,
          availableQuantity: newAvailable,
          status: newOnHand > 0 && currentBatch.status === 'DEPLETED' ? 'AVAILABLE' : currentBatch.status,
          updatedAt: now,
        };
        foundBatchEntry.batch = updatedBatch;
        committedBatch = updatedBatch;
      }

      // 3. Create append-only InventoryTransaction
      const txnId = `txn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const txn: InventoryTransaction = {
        id: txnId,
        facilityId,
        inventoryItemId: invItem.id,
        batchId: committedBatch.id,
        transactionType: 'RECEIPT',
        quantity: line.acceptedQuantity,
        unit: invItem.unit,
        referenceType: 'RECEIPT',
        referenceId: authoritativeReceipt.goodsReceiptId,
        actorId,
        occurredAt: resolvedReceivedAt,
        reason: `V17 Goods Receipt: ${authoritativeReceipt.receiptNumber || receipt.receiptNumber} (PO: ${authoritativeReceipt.purchaseOrderReference || receipt.purchaseOrderReference})`,
        source: 'V17_SUPPLY_CHAIN_LOGISTICS',
        version: 1,
        eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      };

      stagedTransactions.push(txn);
      transactionIds.push(txnId);
    }

    // 4. Construct Preconditions for concurrent safety
    const preconditions: TransactionPrecondition[] = [];

    for (const entry of stagedItems.values()) {
      if (!entry.isNew && entry.originalVersion !== undefined) {
        const origVer = entry.originalVersion;
        preconditions.push({
          store: 'inventoryItems',
          key: entry.item.id,
          expectedVersion: origVer,
          predicate: (live) => live && live.version === origVer,
          errorMessage: `Concurrency conflict on inventory item ${entry.item.id}: version mismatch (expected ${origVer}, got ${entry.item.version})`,
        });
      }
    }

    for (const entry of stagedBatches.values()) {
      if (!entry.isNew && entry.originalVersion !== undefined) {
        const origVer = entry.originalVersion;
        preconditions.push({
          store: 'inventoryBatches',
          key: entry.batch.id,
          expectedVersion: origVer,
          predicate: (live) => live && live.version === origVer,
          errorMessage: `Concurrency conflict on inventory batch ${entry.batch.id}: version mismatch (expected ${origVer})`,
        });
      }
    }

    // Precondition: GoodsReceipt must exist, must not be integrated, must be in a valid lifecycle status,
    // and must match the preparation snapshot fingerprint byte-for-byte (FINDING-IB-03B).
    preconditions.push({
      store: 'goodsReceipts',
      key: authoritativeReceipt.goodsReceiptId,
      predicate: (live: any) => {
        if (!live) {
          throw new Error(`Authoritative goods receipt not found in storage: ${receipt.goodsReceiptId}`);
        }
        if (live.inventoryIntegrated === true) {
          throw new Error(`Receipt ${receipt.goodsReceiptId} has already been integrated into inventory.`);
        }
        const validStatuses: GoodsReceiptStatus[] = ['RECEIVED', 'PARTIALLY_ACCEPTED', 'FINALIZED'];
        if (!validStatuses.includes(live.status)) {
          throw new Error(
            `Receipt ${receipt.goodsReceiptId} cannot be integrated in '${live.status}' status.`
          );
        }
        const liveFingerprint = computeReceiptStockSnapshotFingerprint(live);
        if (liveFingerprint !== preparationSnapshotFingerprint) {
          throw new Error(
            `Authoritative receipt ${receipt.goodsReceiptId} was modified between preparation and commit (snapshot mismatch). Transaction aborted.`
          );
        }
        return true;
      },
      errorMessage: `Receipt ${receipt.goodsReceiptId} validation failed during transaction commit.`,
    });

    // Execute test seam hook if configured in non-production environments
    if (process.env.NODE_ENV !== 'production' && testPreCommitHooks.size > 0) {
      const raceHook = testPreCommitHooks.get(authoritativeReceipt.goodsReceiptId);
      if (raceHook) {
        // One-shot consumption: delete before execution so it cannot re-fire or leak
        testPreCommitHooks.delete(authoritativeReceipt.goodsReceiptId);
        await raceHook(authoritativeReceipt.goodsReceiptId);
      }
    }

    // 5. Execute Atomic Multi-Store IndexedDB Transaction
    const storesToLock: StoreName[] = [
      'inventoryItems',
      'inventoryBatches',
      'inventoryTransactions',
      'goodsReceipts',
    ];

    const integratedReceipt: GoodsReceipt = {
      ...authoritativeReceipt,
      receivedAt: resolvedReceivedAt,
      status: authoritativeReceipt.status,
      inventoryIntegrated: true,
      inventoryTransactionIds: transactionIds,
      integrityMetadata: authoritativeReceipt.integrityMetadata
        ? { ...authoritativeReceipt.integrityMetadata, lastVerifiedAt: now }
        : receipt.integrityMetadata
        ? { ...receipt.integrityMetadata, lastVerifiedAt: now }
        : { hash: '', lastVerifiedAt: now },
    };

    await idbEngine.executeTransaction(
      storesToLock,
      async (txContext) => {
        // Stage inventory items
        for (const entry of stagedItems.values()) {
          await txContext.put('inventoryItems', entry.item);
        }

        // Stage inventory batches
        for (const entry of stagedBatches.values()) {
          await txContext.put('inventoryBatches', entry.batch);
        }

        // Stage inventory transactions
        for (const txn of stagedTransactions) {
          await txContext.put('inventoryTransactions', txn);
        }

        // Stage authoritative integrated receipt idempotency marker
        await txContext.put('goodsReceipts', integratedReceipt);
      },
      preconditions
    );

    // 6. Commit-First: Advance localRepository memory cache ONLY AFTER transaction commits
    for (const entry of stagedItems.values()) {
      localRepository.updateCache('inventoryItems', entry.item);
    }
    for (const entry of stagedBatches.values()) {
      localRepository.updateCache('inventoryBatches', entry.batch);
    }
    for (const txn of stagedTransactions) {
      localRepository.updateCache('inventoryTransactions', txn);
    }

    // Mark caller's receipt reference as integrated
    receipt.inventoryIntegrated = true;
    receipt.inventoryTransactionIds = transactionIds;

    try {
      await auditService.log({
        action: 'V17_INVENTORY_INTEGRATION_COMPLETED',
        actorId,
        facilityId,
        details: {
          goodsReceiptId: receipt.goodsReceiptId,
          transactionsCreated: transactionIds.length,
        },
      });
    } catch (auditErr) {
      console.warn('[InventoryBridgeService] Post-commit audit logging failed:', auditErr);
    }

    return transactionIds;
  }
}

export const inventoryBridgeService = InventoryBridgeService.getInstance();
