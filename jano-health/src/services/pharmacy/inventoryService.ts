/**
 * Jano Health - Clinical Core V7: Pharmacy Operations & Inventory Ledger Service
 * 
 * Architectural Boundaries & Principles:
 * 1. Physical Stock ≠ Prescribed Quantity. Stock is only altered through explicit InventoryTransactions.
 * 2. Immutable Ledger: InventoryTransaction is append-only. Stock counts on InventoryBatch and InventoryItem
 *    are materialized projections that must always reconcile with the sum of ledger transactions.
 * 3. FEFO (First-Expired, First-Out): Available batches are sorted by earliest expiration date.
 * 4. Human Authorization & RBAC: Stock movements (receipts, transfers, adjustments, wastage) require appropriate
 *    roles (pharmacist, pharmacy_technician, admin). AI agents are architecturally prohibited from signing or moving stock.
 * 5. Deterministic Offline Identifiers: RCV-*, TRF-*, WST-* with Luhn-36 checksums.
 * 6. WHO Model List of Essential Medicines (24th List, 2025) compliance.
 */

import {
  InventoryItem,
  InventoryBatch,
  InventoryTransaction,
  InventoryReceipt,
  InventoryTransfer,
  InventoryWastage,
  StockProjection,
  BatchStatus,
  WastageReason,
  InventoryReceiptItem,
} from '../../domain/pharmacyTypes';
import { MedicationDefinition } from '../../domain/medicationTypes';
import { localRepository } from '../storage/localRepository';
import { idbEngine, StoreName } from '../storage/indexedDbEngine';
import { generateUUIDv7 } from '../../domain/identifiers';
import {
  generateReceiptNumber,
  generateTransferNumber,
  generateWastageNumber,
} from '../../domain/pharmacyIdentifiers';
import { ClinicalActorContext } from '../clinical/clinicalTransaction';
import { canUserPerform } from '../../domain/permissions';
import { SYNTHETIC_MEDICATION_DEFINITIONS } from '../clinical/medicationTerminologyService';
import { eventStore } from '../events/eventStore';
import { DomainEvent } from '../../domain/persistence';

export interface RecordReceiptDTO {
  facilityId: string;
  supplierName: string;
  supplierId?: string;
  referenceDocument?: string;
  notes?: string;
  items: Array<{
    medicationDefinitionId: string;
    medicationCode: string;
    genericName: string;
    batchNumber: string;
    lotNumber?: string;
    expiryDate: string; // ISO string or YYYY-MM-DD
    manufactureDate?: string;
    quantity: number;
    unit: string;
    storageCondition?: string;
  }>;
}

export interface RecordTransferOutDTO {
  sourceFacilityId: string;
  destinationFacilityId: string;
  inventoryItemId: string;
  batchId: string;
  quantity: number;
  referenceNotes?: string;
}

export interface RecordWastageDTO {
  facilityId: string;
  inventoryItemId: string;
  batchId: string;
  quantity: number;
  reason: WastageReason;
  notes?: string;
}

export interface StockAdjustmentDTO {
  facilityId: string;
  inventoryItemId: string;
  batchId: string;
  physicalCount: number;
  reason: string;
  notes?: string;
}

export class InventoryService {
  private static instance: InventoryService;

  private constructor() {}

  public static getInstance(): InventoryService {
    if (!InventoryService.instance) {
      InventoryService.instance = new InventoryService();
    }
    return InventoryService.instance;
  }

  private createDomainEvent<T>(params: {
    aggregateId: string;
    aggregateType: any;
    eventType: any;
    facilityId: string;
    actor: ClinicalActorContext;
    payload: T;
    version?: number;
  }): DomainEvent<T> {
    const eventId = `evt_${generateUUIDv7()}`;
    const now = new Date().toISOString();
    return {
      eventId,
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      facilityId: params.facilityId,
      actorId: params.actor.userId,
      deviceId: params.actor.deviceId,
      timestamp: now,
      sequence: 1,
      version: params.version || 1,
      payload: params.payload,
      metadata: {
        actorId: params.actor.userId,
        actorRole: params.actor.userRole,
        facilityId: params.facilityId,
        deviceId: params.actor.deviceId,
        occurredAt: now,
      },
      syncStatus: 'PENDING',
    };
  }

  // ==========================================
  // READ OPERATIONS & PROJECTIONS
  // ==========================================

  public async getInventoryItems(facilityId?: string): Promise<InventoryItem[]> {
    return localRepository.getInventoryItems ? localRepository.getInventoryItems(facilityId) : [];
  }

  public async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    return localRepository.getInventoryItem ? localRepository.getInventoryItem(id) : undefined;
  }

  public async getBatches(inventoryItemId?: string, facilityId?: string): Promise<InventoryBatch[]> {
    return localRepository.getInventoryBatches
      ? localRepository.getInventoryBatches(inventoryItemId, facilityId)
      : [];
  }

  public async getBatch(id: string): Promise<InventoryBatch | undefined> {
    return localRepository.getInventoryBatch ? localRepository.getInventoryBatch(id) : undefined;
  }

  public async getTransactions(
    facilityId?: string,
    inventoryItemId?: string,
    batchId?: string
  ): Promise<InventoryTransaction[]> {
    return localRepository.getInventoryTransactions
      ? localRepository.getInventoryTransactions(facilityId, inventoryItemId, batchId)
      : [];
  }

  public async getReceipts(facilityId?: string): Promise<InventoryReceipt[]> {
    return localRepository.getInventoryReceipts ? localRepository.getInventoryReceipts(facilityId) : [];
  }

  public async getTransfers(facilityId?: string): Promise<InventoryTransfer[]> {
    return localRepository.getInventoryTransfers ? localRepository.getInventoryTransfers(facilityId) : [];
  }

  public async getWastages(facilityId?: string): Promise<InventoryWastage[]> {
    return localRepository.getInventoryWastages ? localRepository.getInventoryWastages(facilityId) : [];
  }

  /**
   * FEFO Selection Strategy:
   * Returns active, unexpired, available batches for an inventory item, sorted by earliest expiration date.
   */
  public async getAvailableBatchesFEFO(
    inventoryItemId: string,
    facilityId: string
  ): Promise<InventoryBatch[]> {
    const allBatches = await this.getBatches(inventoryItemId, facilityId);
    const today = new Date().toISOString().split('T')[0];

    return allBatches
      .filter((b) => b.status === 'AVAILABLE' && b.availableQuantity > 0 && b.expiryDate >= today)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }

  /**
   * Calculates a materialized StockProjection for an inventory item.
   */
  public async getStockProjection(
    inventoryItemId: string,
    facilityId: string
  ): Promise<StockProjection | null> {
    const item = await this.getInventoryItem(inventoryItemId);
    if (!item) return null;

    const batches = await this.getBatches(inventoryItemId, facilityId);
    const totalOnHand = batches.reduce((acc, b) => acc + b.quantityOnHand, 0);
    const totalReserved = batches.reduce((acc, b) => acc + b.reservedQuantity, 0);
    const totalAvailable = batches
      .filter((b) => b.status === 'AVAILABLE')
      .reduce((acc, b) => acc + Math.max(0, b.availableQuantity), 0);

    return {
      inventoryItemId,
      facilityId,
      medicationCode: item.medicationCode,
      genericName: item.genericName,
      totalOnHand,
      totalReserved,
      totalAvailable,
      batches: batches.map((b) => ({
        batchId: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantityOnHand: b.quantityOnHand,
        availableQuantity: b.availableQuantity,
        status: b.status,
      })),
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies that the materialized stock counts of a batch reconcile with the sum of its transactions.
   */
  public async verifyBatchLedgerConsistency(
    batchId: string
  ): Promise<{ consistent: boolean; computedQuantity: number; batchQuantity: number; delta: number }> {
    const batch = await this.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    const txns = await this.getTransactions(batch.facilityId, batch.inventoryItemId, batchId);
    let computed = 0;

    for (const txn of txns) {
      switch (txn.transactionType) {
        case 'RECEIPT':
        case 'TRANSFER_IN':
        case 'ADJUSTMENT_IN':
        case 'RETURN':
        case 'REVERSAL':
          computed += txn.quantity;
          break;
        case 'DISPENSE':
        case 'TRANSFER_OUT':
        case 'ADJUSTMENT_OUT':
        case 'WASTAGE':
        case 'EXPIRY':
          computed -= txn.quantity;
          break;
      }
    }

    const delta = computed - batch.quantityOnHand;
    return {
      consistent: delta === 0,
      computedQuantity: computed,
      batchQuantity: batch.quantityOnHand,
      delta,
    };
  }

  // ==========================================
  // INVENTORY ITEMS & DEFINITIONS
  // ==========================================

  /**
   * Finds or creates a local facility InventoryItem linked to a MedicationDefinition.
   */
  public async getOrCreateInventoryItem(
    facilityId: string,
    medDef: MedicationDefinition,
    actor?: ClinicalActorContext
  ): Promise<InventoryItem> {
    const existingItems = await this.getInventoryItems(facilityId);
    const matched = existingItems.find(
      (item) => item.medicationDefinitionId === medDef.id || item.medicationCode === medDef.code
    );
    if (matched) return matched;

    const now = new Date().toISOString();
    const newItem: InventoryItem = {
      id: `inv_item_${generateUUIDv7()}`,
      facilityId,
      medicationDefinitionId: medDef.id,
      medicationCode: medDef.code,
      genericName: medDef.genericName,
      formulation: medDef.dosageForm,
      strength: `${medDef.strength} ${medDef.strengthUnit}`.trim(),
      unit: medDef.strengthUnit || 'units',
      storageRequirements: {
        type: 'ROOM_TEMPERATURE',
        notes: 'Standard pharmaceutical storage. Keep dry and protected from excessive heat.',
        source: medDef.source || 'WHO Model List of Essential Medicines (24th List, 2025)',
        version: medDef.sourceVersion || '24th-2025',
      },
      reorderPoint: 50,
      minimumStock: 20,
      maximumStock: 500,
      active: true,
      provenance: {
        source: 'JANO_CLINICAL_CORE_V7',
        version: '1.0',
        recordedBy: actor?.userName || actor?.userId || 'system',
        recordedAt: now,
        deviceId: actor?.deviceId || 'local-client',
        facilityId,
        actorId: actor?.userId || 'system',
        createdAt: now,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    if (localRepository.saveInventoryItem) {
      await localRepository.saveInventoryItem(newItem);
    }
    return newItem;
  }

  // ==========================================
  // INVENTORY RECEIPTS (Stock Intake)
  // ==========================================

  public async recordReceipt(
    dto: RecordReceiptDTO,
    actor: ClinicalActorContext
  ): Promise<InventoryReceipt> {
    const authorized = canUserPerform({ role: actor.userRole }, 'inventory.receive');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot receive inventory stock.`);
    }

    if (!dto.items || dto.items.length === 0) {
      throw new Error('Receipt must contain at least one inventory item.');
    }

    const now = new Date().toISOString();
    const receiptNumber = generateReceiptNumber(dto.facilityId, actor.deviceId);
    const receiptId = `rcv_${generateUUIDv7()}`;

    const receiptItems: InventoryReceiptItem[] = [];
    const stagedBatches = new Map<string, InventoryBatch>();
    const stagedTransactions: InventoryTransaction[] = [];
    const stagedItems: InventoryItem[] = [];

    const existingItems = await this.getInventoryItems(dto.facilityId);

    for (const itemDto of dto.items) {
      // 1. Get or create InventoryItem
      let invItem =
        existingItems.find(
          (i) => i.medicationCode === itemDto.medicationCode || i.medicationDefinitionId === itemDto.medicationDefinitionId
        ) ||
        stagedItems.find(
          (i) => i.medicationCode === itemDto.medicationCode || i.medicationDefinitionId === itemDto.medicationDefinitionId
        );

      if (!invItem) {
        const medDefs = await localRepository.getMedicationDefinitions();
        const def = medDefs.find((d) => d.id === itemDto.medicationDefinitionId || d.code === itemDto.medicationCode);
        if (!def) {
          throw new Error(`MedicationDefinition not found: ${itemDto.medicationCode}`);
        }
        invItem = await this.getOrCreateInventoryItem(dto.facilityId, def, actor);
        stagedItems.push(invItem);
      }

      // 2. Find or create InventoryBatch
      const batchKey = `${invItem.id}:${itemDto.batchNumber}`;
      let batch = stagedBatches.get(batchKey);

      if (!batch) {
        const existingBatches = await this.getBatches(invItem.id, dto.facilityId);
        batch = existingBatches.find((b) => b.batchNumber === itemDto.batchNumber);
      }

      if (batch) {
        // Update batch quantities
        batch = {
          ...batch,
          quantityOnHand: batch.quantityOnHand + itemDto.quantity,
          availableQuantity: batch.availableQuantity + itemDto.quantity,
          version: batch.version + 1,
          updatedAt: now,
        };
      } else {
        // Create new batch
        batch = {
          id: `batch_${generateUUIDv7()}`,
          inventoryItemId: invItem.id,
          facilityId: dto.facilityId,
          batchNumber: itemDto.batchNumber,
          lotNumber: itemDto.lotNumber,
          manufactureDate: itemDto.manufactureDate,
          expiryDate: itemDto.expiryDate,
          quantityOnHand: itemDto.quantity,
          reservedQuantity: 0,
          availableQuantity: itemDto.quantity,
          supplierId: dto.supplierId,
          supplierName: dto.supplierName,
          receivedAt: now,
          receivedById: actor.userId,
          receivedByName: actor.userName,
          status: 'AVAILABLE',
          provenance: {
            source: 'JANO_CLINICAL_CORE_V7',
            version: '1.0',
            recordedBy: actor.userName || actor.userId,
            recordedAt: now,
            deviceId: actor.deviceId,
            facilityId: dto.facilityId,
            actorId: actor.userId,
            createdAt: now,
          },
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
      }

      stagedBatches.set(batchKey, batch);

      // 3. Append ledger transaction
      const txnId = `txn_${generateUUIDv7()}`;
      const txn: InventoryTransaction = {
        id: txnId,
        facilityId: dto.facilityId,
        inventoryItemId: invItem.id,
        batchId: batch.id,
        transactionType: 'RECEIPT',
        quantity: itemDto.quantity,
        unit: itemDto.unit || invItem.unit,
        referenceType: 'RECEIPT',
        referenceId: receiptNumber,
        actorId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        occurredAt: now,
        reason: `Goods receipt from ${dto.supplierName}`,
        source: 'JANO_CLINICAL_CORE_V7',
        version: 1,
        eventId: txnId,
      };

      stagedTransactions.push(txn);

      receiptItems.push({
        inventoryItemId: invItem.id,
        medicationCode: invItem.medicationCode,
        genericName: invItem.genericName,
        batchNumber: batch.batchNumber,
        lotNumber: batch.lotNumber,
        expiryDate: batch.expiryDate,
        quantity: itemDto.quantity,
        unit: itemDto.unit || invItem.unit,
        storageCondition: itemDto.storageCondition,
      });
    }

    const receipt: InventoryReceipt = {
      id: receiptId,
      receiptNumber,
      facilityId: dto.facilityId,
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      referenceDocument: dto.referenceDocument,
      receivedBy: actor.userName,
      receivedById: actor.userId,
      receivedAt: now,
      items: receiptItems,
      status: 'RECEIVED',
      notes: dto.notes,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // Prepare domain event
    const domainEvent = await eventStore.prepareEvent(
      this.createDomainEvent({
        aggregateId: receiptId,
        aggregateType: 'InventoryReceipt' as any,
        eventType: 'INVENTORY_RECEIVED' as any,
        version: 1,
        payload: receipt as any,
        actor,
        facilityId: dto.facilityId,
      })
    );

    // Atomically commit batch, ledger transactions, receipt, and domain event
    const storesToLock: StoreName[] = [
      'inventoryBatches',
      'inventoryTransactions',
      'inventoryReceipts',
      'domainEvents',
    ];

    await idbEngine.executeTransaction(storesToLock, async (txContext) => {
      for (const batch of stagedBatches.values()) {
        await txContext.put('inventoryBatches', batch);
      }
      for (const txn of stagedTransactions) {
        await txContext.put('inventoryTransactions', txn);
      }
      await txContext.put('inventoryReceipts', receipt);
      await txContext.put('domainEvents', domainEvent);
    });

    // Commit-first cache advancement
    for (const batch of stagedBatches.values()) {
      localRepository.updateCache('inventoryBatches', batch);
    }
    for (const txn of stagedTransactions) {
      localRepository.updateCache('inventoryTransactions', txn);
    }
    localRepository.updateCache('inventoryReceipts', receipt);
    const committedEvent = eventStore.getEvent(domainEvent.eventId) || domainEvent;
    eventStore.registerCommittedEvent(committedEvent);

    return receipt;
  }

  // ==========================================
  // DISPENSE LEDGER DEDUCTION (Called by MedicationService)
  // ==========================================

  public async deductStockForDispense(
    params: {
      facilityId: string;
      inventoryItemId: string;
      batchId: string;
      quantity: number;
      dispenseNumber: string;
      dispenseRecordId: string;
    },
    actor: ClinicalActorContext
  ): Promise<InventoryTransaction> {
    const authorized = canUserPerform({ role: actor.userRole }, 'pharmacy.dispense');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot dispense inventory stock.`);
    }

    const batch = await this.getBatch(params.batchId);
    if (!batch) {
      throw new Error(`Inventory batch not found: ${params.batchId}`);
    }

    if (batch.status !== 'AVAILABLE') {
      throw new Error(`Cannot dispense from batch in status: ${batch.status}`);
    }

    const today = new Date().toISOString().split('T')[0];
    if (batch.expiryDate < today) {
      throw new Error(
        `Safety Invariant Violation: Batch ${batch.batchNumber} expired on ${batch.expiryDate} and cannot be dispensed.`
      );
    }

    if (batch.availableQuantity < params.quantity) {
      throw new Error(
        `Insufficient Stock: Batch ${batch.batchNumber} has only ${batch.availableQuantity} available, requested ${params.quantity}.`
      );
    }

    const now = new Date().toISOString();

    // 1. Update Batch Stock Projection
    const updatedBatch: InventoryBatch = {
      ...batch,
      quantityOnHand: batch.quantityOnHand - params.quantity,
      availableQuantity: batch.availableQuantity - params.quantity,
      status: batch.quantityOnHand - params.quantity <= 0 ? 'DEPLETED' : batch.status,
      version: batch.version + 1,
      updatedAt: now,
    };

    if (localRepository.saveInventoryBatch) {
      await localRepository.saveInventoryBatch(updatedBatch);
    }

    // 2. Append Ledger Transaction
    const txnId = `txn_${generateUUIDv7()}`;
    const txn: InventoryTransaction = {
      id: txnId,
      facilityId: params.facilityId,
      inventoryItemId: params.inventoryItemId,
      batchId: params.batchId,
      transactionType: 'DISPENSE',
      quantity: params.quantity,
      unit: 'units',
      referenceType: 'DISPENSE_RECORD',
      referenceId: params.dispenseNumber,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      occurredAt: now,
      reason: `Prescription Dispense: ${params.dispenseNumber}`,
      source: 'JANO_CLINICAL_CORE_V7',
      version: 1,
      eventId: txnId,
    };

    if (localRepository.saveInventoryTransaction) {
      await localRepository.saveInventoryTransaction(txn);
    }

    return txn;
  }

  /**
   * Reverses a prior dispense transaction, restoring batch quantities and logging a reversal transaction.
   */
  /**
   * Prepares the updated batch and reversal ledger transaction for a dispense reversal.
   * Does NOT persist or mutate cache, allowing callers to atomically compose it into a parent transaction.
   */
  public async prepareReverseDispenseStock(
    params: {
      facilityId: string;
      inventoryItemId: string;
      batchId: string;
      quantity: number;
      dispenseNumber: string;
      reason: string;
    },
    actor: ClinicalActorContext
  ): Promise<{ updatedBatch: InventoryBatch; txn: InventoryTransaction }> {
    const authorized = canUserPerform({ role: actor.userRole }, 'pharmacy.dispense');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot reverse dispense.`);
    }

    const batch = await this.getBatch(params.batchId);
    if (!batch) throw new Error(`Batch not found: ${params.batchId}`);

    const now = new Date().toISOString();

    const updatedBatch: InventoryBatch = {
      ...batch,
      quantityOnHand: batch.quantityOnHand + params.quantity,
      availableQuantity: batch.availableQuantity + params.quantity,
      status: batch.status === 'DEPLETED' ? 'AVAILABLE' : batch.status,
      version: batch.version + 1,
      updatedAt: now,
    };

    const txnId = `txn_${generateUUIDv7()}`;
    const txn: InventoryTransaction = {
      id: txnId,
      facilityId: params.facilityId,
      inventoryItemId: params.inventoryItemId,
      batchId: params.batchId,
      transactionType: 'REVERSAL',
      quantity: params.quantity,
      unit: 'units',
      referenceType: 'REVERSAL',
      referenceId: params.dispenseNumber,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.userRole,
      occurredAt: now,
      reason: params.reason || `Dispense Reversal for ${params.dispenseNumber}`,
      source: 'JANO_CLINICAL_CORE_V7',
      version: 1,
      eventId: txnId,
    };

    return { updatedBatch, txn };
  }

  public async reverseDispenseStock(
    params: {
      facilityId: string;
      inventoryItemId: string;
      batchId: string;
      quantity: number;
      dispenseNumber: string;
      reason: string;
    },
    actor: ClinicalActorContext
  ): Promise<InventoryTransaction> {
    const { updatedBatch, txn } = await this.prepareReverseDispenseStock(params, actor);

    // Atomically commit both inventory batch and ledger transaction
    await idbEngine.executeTransaction(['inventoryBatches', 'inventoryTransactions'], async (txContext) => {
      await txContext.put('inventoryBatches', updatedBatch);
      await txContext.put('inventoryTransactions', txn);
    });

    // Update caches only after transaction successfully commits
    localRepository.updateCache('inventoryBatches', updatedBatch);
    localRepository.updateCache('inventoryTransactions', txn);

    return txn;
  }

  // ==========================================
  // WASTAGE & SPOILAGE LOGGING
  // ==========================================

  public async recordWastage(
    dto: RecordWastageDTO,
    actor: ClinicalActorContext
  ): Promise<InventoryWastage> {
    const authorized = canUserPerform({ role: actor.userRole }, 'inventory.wastage');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot record wastage.`);
    }

    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const batch = await this.getBatch(dto.batchId);
        if (!batch) throw new Error(`Batch not found: ${dto.batchId}`);

        if (batch.quantityOnHand < dto.quantity) {
          throw new Error(
            `Wastage quantity (${dto.quantity}) exceeds quantity on hand (${batch.quantityOnHand}).`
          );
        }

        const now = new Date().toISOString();
        const wastageNumber = generateWastageNumber(dto.facilityId, actor.deviceId);
        const wastageId = `wst_${generateUUIDv7()}`;

        // 1. Deduct stock from batch
        const updatedBatch: InventoryBatch = {
          ...batch,
          quantityOnHand: batch.quantityOnHand - dto.quantity,
          availableQuantity: Math.max(0, batch.availableQuantity - dto.quantity),
          status: batch.quantityOnHand - dto.quantity <= 0 ? 'DEPLETED' : batch.status,
          version: batch.version + 1,
          updatedAt: now,
        };

        // 2. Append ledger transaction
        const txnId = `txn_${generateUUIDv7()}`;
        const txn: InventoryTransaction = {
          id: txnId,
          facilityId: dto.facilityId,
          inventoryItemId: dto.inventoryItemId,
          batchId: dto.batchId,
          transactionType: 'WASTAGE',
          quantity: dto.quantity,
          unit: 'units',
          referenceType: 'WASTAGE',
          referenceId: wastageNumber,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          occurredAt: now,
          reason: `Wastage [${dto.reason}]: ${dto.notes || 'No specific notes'}`,
          source: 'JANO_CLINICAL_CORE_V7',
          version: 1,
          eventId: txnId,
        };

        // 3. Save Wastage Record
        const wastage: InventoryWastage = {
          id: wastageId,
          wastageNumber,
          facilityId: dto.facilityId,
          inventoryItemId: dto.inventoryItemId,
          batchId: dto.batchId,
          batchNumber: batch.batchNumber,
          quantity: dto.quantity,
          unit: 'units',
          reason: dto.reason,
          actorId: actor.userId,
          actorName: actor.userName,
          occurredAt: now,
          notes: dto.notes,
          version: 1,
          createdAt: now,
        };

        // 4. Prepare domain event
        const domainEvent = await eventStore.prepareEvent(
          this.createDomainEvent({
            aggregateId: wastageId,
            aggregateType: 'InventoryWastage' as any,
            eventType: 'INVENTORY_WASTED' as any,
            version: 1,
            payload: wastage as any,
            actor,
            facilityId: dto.facilityId,
          })
        );

        // Atomically commit batch, ledger transaction, wastage record, and domain event with batch version guard
        await idbEngine.executeTransaction(
          ['inventoryBatches', 'inventoryTransactions', 'inventoryWastage', 'domainEvents'],
          async (txContext) => {
            await txContext.put('inventoryBatches', updatedBatch);
            await txContext.put('inventoryTransactions', txn);
            await txContext.put('inventoryWastage', wastage);
            await txContext.put('domainEvents', domainEvent);
          },
          [
            {
              store: 'inventoryBatches',
              key: dto.batchId,
              expectedVersion: batch.version,
              errorMessage: `[InventoryService] Concurrency conflict: Batch ${dto.batchId} modified concurrently (expected version ${batch.version})`,
            },
          ]
        );

        // Update in-memory caches only after successful commit
        localRepository.updateCache('inventoryBatches', updatedBatch);
        localRepository.updateCache('inventoryTransactions', txn);
        localRepository.updateCache('inventoryWastage', wastage);
        const committedEvent = eventStore.getEvent(domainEvent.eventId) || domainEvent;
        eventStore.registerCommittedEvent(committedEvent);

        return wastage;
      } catch (err: any) {
        const isConflict = err.message && (
          err.message.includes('Concurrency conflict') ||
          err.message.includes('Version mismatch')
        );
        if (isConflict && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 10 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[InventoryService] Record wastage failed after ${maxRetries} attempts`);
  }

  // ==========================================
  // PHYSICAL COUNT ADJUSTMENTS
  // ==========================================

  public async adjustStock(
    dto: StockAdjustmentDTO,
    actor: ClinicalActorContext
  ): Promise<InventoryTransaction> {
    const authorized = canUserPerform({ role: actor.userRole }, 'inventory.adjust');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot adjust inventory.`);
    }

    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const batch = await this.getBatch(dto.batchId);
        if (!batch) throw new Error(`Batch not found: ${dto.batchId}`);

        const delta = dto.physicalCount - batch.quantityOnHand;
        if (delta === 0) {
          throw new Error('Physical count matches current on-hand quantity. No adjustment needed.');
        }

        const now = new Date().toISOString();
        const isIncrease = delta > 0;
        const absDelta = Math.abs(delta);

        // 1. Update batch
        const updatedBatch: InventoryBatch = {
          ...batch,
          quantityOnHand: dto.physicalCount,
          availableQuantity: Math.max(0, batch.availableQuantity + delta),
          status: dto.physicalCount === 0 ? 'DEPLETED' : batch.status,
          version: batch.version + 1,
          updatedAt: now,
        };

        // 2. Append ledger transaction
        const txnId = `txn_${generateUUIDv7()}`;
        const txn: InventoryTransaction = {
          id: txnId,
          facilityId: dto.facilityId,
          inventoryItemId: dto.inventoryItemId,
          batchId: dto.batchId,
          transactionType: isIncrease ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantity: absDelta,
          unit: 'units',
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: `ADJ-${now.substring(0, 10)}`,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          occurredAt: now,
          reason: `Physical count adjustment (${dto.reason}): ${delta > 0 ? '+' : ''}${delta}`,
          source: 'JANO_CLINICAL_CORE_V7',
          version: 1,
          eventId: txnId,
        };

        // 3. Prepare domain event
        const domainEvent = await eventStore.prepareEvent(
          this.createDomainEvent({
            aggregateId: dto.batchId,
            aggregateType: 'InventoryBatch' as any,
            eventType: 'INVENTORY_ADJUSTED' as any,
            version: updatedBatch.version,
            payload: { batch: updatedBatch, transaction: txn },
            actor,
            facilityId: dto.facilityId,
          })
        );

        // Atomically commit batch, ledger transaction, and domain event with batch version guard
        await idbEngine.executeTransaction(
          ['inventoryBatches', 'inventoryTransactions', 'domainEvents'],
          async (txContext) => {
            await txContext.put('inventoryBatches', updatedBatch);
            await txContext.put('inventoryTransactions', txn);
            await txContext.put('domainEvents', domainEvent);
          },
          [
            {
              store: 'inventoryBatches',
              key: dto.batchId,
              expectedVersion: batch.version,
              errorMessage: `[InventoryService] Concurrency conflict: Batch ${dto.batchId} modified concurrently (expected version ${batch.version})`,
            },
          ]
        );

        // Update in-memory caches only after successful commit
        localRepository.updateCache('inventoryBatches', updatedBatch);
        localRepository.updateCache('inventoryTransactions', txn);
        const committedEvent = eventStore.getEvent(domainEvent.eventId) || domainEvent;
        eventStore.registerCommittedEvent(committedEvent);

        return txn;
      } catch (err: any) {
        const isConflict = err.message && (
          err.message.includes('Concurrency conflict') ||
          err.message.includes('Version mismatch')
        );
        if (isConflict && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 10 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[InventoryService] Adjust stock failed after ${maxRetries} attempts`);
  }

  // ==========================================
  // INTER-FACILITY TRANSFERS
  // ==========================================

  public async recordTransferOut(
    dto: RecordTransferOutDTO,
    actor: ClinicalActorContext
  ): Promise<InventoryTransfer> {
    const authorized = canUserPerform({ role: actor.userRole }, 'inventory.transfer');
    if (!authorized) {
      throw new Error(`Unauthorized: User with role [${actor.userRole}] cannot transfer inventory.`);
    }

    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        const batch = await this.getBatch(dto.batchId);
        if (!batch) throw new Error(`Batch not found: ${dto.batchId}`);

        if (batch.availableQuantity < dto.quantity) {
          throw new Error(
            `Insufficient available quantity (${batch.availableQuantity}) for transfer of ${dto.quantity}.`
          );
        }

        const now = new Date().toISOString();
        const transferNumber = generateTransferNumber(dto.sourceFacilityId, actor.deviceId);
        const transferId = `trf_${generateUUIDv7()}`;

        // 1. Deduct from source batch
        const updatedBatch: InventoryBatch = {
          ...batch,
          quantityOnHand: batch.quantityOnHand - dto.quantity,
          availableQuantity: batch.availableQuantity - dto.quantity,
          status: batch.quantityOnHand - dto.quantity <= 0 ? 'DEPLETED' : batch.status,
          version: batch.version + 1,
          updatedAt: now,
        };

        // 2. Append TRANSFER_OUT transaction
        const txnId = `txn_${generateUUIDv7()}`;
        const txn: InventoryTransaction = {
          id: txnId,
          facilityId: dto.sourceFacilityId,
          inventoryItemId: dto.inventoryItemId,
          batchId: dto.batchId,
          transactionType: 'TRANSFER_OUT',
          quantity: dto.quantity,
          unit: 'units',
          referenceType: 'TRANSFER',
          referenceId: transferNumber,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          occurredAt: now,
          reason: `Transfer outbound to facility ${dto.destinationFacilityId}`,
          source: 'JANO_CLINICAL_CORE_V7',
          version: 1,
          eventId: txnId,
        };

        // 3. Create Transfer record
        const transfer: InventoryTransfer = {
          id: transferId,
          transferNumber,
          sourceFacilityId: dto.sourceFacilityId,
          destinationFacilityId: dto.destinationFacilityId,
          inventoryItemId: dto.inventoryItemId,
          batchId: dto.batchId,
          batchNumber: batch.batchNumber,
          quantity: dto.quantity,
          unit: 'units',
          status: 'IN_TRANSIT',
          initiatedById: actor.userId,
          initiatedByName: actor.userName,
          initiatedAt: now,
          referenceNotes: dto.referenceNotes,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };

        // 4. Prepare domain event
        const domainEvent = await eventStore.prepareEvent(
          this.createDomainEvent({
            aggregateId: transferId,
            aggregateType: 'InventoryTransfer' as any,
            eventType: 'INVENTORY_TRANSFERRED_OUT' as any,
            version: 1,
            payload: transfer as any,
            actor,
            facilityId: dto.sourceFacilityId,
          })
        );

        // Atomically commit batch, ledger transaction, transfer record, and domain event with batch version guard
        await idbEngine.executeTransaction(
          ['inventoryBatches', 'inventoryTransactions', 'inventoryTransfers', 'domainEvents'],
          async (txContext) => {
            await txContext.put('inventoryBatches', updatedBatch);
            await txContext.put('inventoryTransactions', txn);
            await txContext.put('inventoryTransfers', transfer);
            await txContext.put('domainEvents', domainEvent);
          },
          [
            {
              store: 'inventoryBatches',
              key: dto.batchId,
              expectedVersion: batch.version,
              errorMessage: `[InventoryService] Concurrency conflict: Batch ${dto.batchId} modified concurrently (expected version ${batch.version})`,
            },
          ]
        );

        // Update in-memory caches only after successful commit
        localRepository.updateCache('inventoryBatches', updatedBatch);
        localRepository.updateCache('inventoryTransactions', txn);
        localRepository.updateCache('inventoryTransfers', transfer);
        const committedEvent = eventStore.getEvent(domainEvent.eventId) || domainEvent;
        eventStore.registerCommittedEvent(committedEvent);

        return transfer;
      } catch (err: any) {
        const isConflict = err.message && (
          err.message.includes('Concurrency conflict') ||
          err.message.includes('Version mismatch')
        );
        if (isConflict && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 10 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`[InventoryService] Record transfer failed after ${maxRetries} attempts`);
  }

  public async transferStock(
    dto: RecordTransferOutDTO,
    actor: ClinicalActorContext
  ): Promise<InventoryTransfer> {
    return this.recordTransferOut(dto, actor);
  }

  // ==========================================
  // WHO ESSENTIAL MEDICINES INITIAL STOCK SEEDER
  // ==========================================

  /**
   * Seeds an initial demonstrative inventory of WHO Model List of Essential Medicines (24th List, 2025)
   * for a facility if no stock exists.
   */
  public async seedEssentialMedicinesInventory(facilityId: string): Promise<void> {
    const existing = await this.getInventoryItems(facilityId);
    if (existing.length > 0) return; // Already seeded

    const now = new Date();
    const actor: ClinicalActorContext = {
      userId: 'system_seeder',
      userName: 'WHO EML 24th Inventory Seeder',
      userRole: 'pharmacist',
      facilityId,
      deviceId: 'client-pharm-1',
    };

    // Calculate dates
    const expiry2027 = new Date(now.getFullYear() + 2, 5, 30).toISOString().split('T')[0];
    const expiry2028 = new Date(now.getFullYear() + 3, 11, 31).toISOString().split('T')[0];

    const seedItems = [
      {
        defId: 'med_def_coartem_20_120',
        code: 'WHO-EML-AL-20-120',
        batchNumber: 'COA-2025-081',
        qty: 300,
        expiry: expiry2027,
      },
      {
        defId: 'med_def_amox_500_cap',
        code: 'WHO-EML-AMOX-500-CAP',
        batchNumber: 'AMX-2025-142',
        qty: 500,
        expiry: expiry2027,
      },
      {
        defId: 'med_def_paracetamol_500_tab',
        code: 'WHO-EML-PARA-500-TAB',
        batchNumber: 'PCM-2025-099',
        qty: 1000,
        expiry: expiry2028,
      },
      {
        defId: 'med_def_ors_sachet',
        code: 'WHO-EML-ORS-SACHET',
        batchNumber: 'ORS-2025-331',
        qty: 400,
        expiry: expiry2028,
      },
      {
        defId: 'med_def_ceftriaxone_1g_inj',
        code: 'WHO-EML-CEFT-1G-INJ',
        batchNumber: 'CTX-2025-015',
        qty: 150,
        expiry: expiry2027,
      },
      {
        defId: 'med_def_metformin_500_tab',
        code: 'WHO-EML-MET-500-TAB',
        batchNumber: 'MET-2025-204',
        qty: 600,
        expiry: expiry2028,
      },
      {
        defId: 'med_def_salbutamol_100mcg_inh',
        code: 'WHO-EML-SALB-100-INH',
        batchNumber: 'SAL-2025-055',
        qty: 100,
        expiry: expiry2027,
      },
    ];

    const receiptItemsToReceive = [];

    for (const s of seedItems) {
      const def = SYNTHETIC_MEDICATION_DEFINITIONS.find((d) => d.id === s.defId || d.code === s.code);
      if (def) {
        receiptItemsToReceive.push({
          medicationDefinitionId: def.id,
          medicationCode: def.code,
          genericName: def.genericName,
          batchNumber: s.batchNumber,
          expiryDate: s.expiry,
          quantity: s.qty,
          unit: def.strengthUnit || 'units',
        });
      }
    }

    if (receiptItemsToReceive.length > 0) {
      await this.recordReceipt(
        {
          facilityId,
          supplierName: 'Ethiopian Pharmaceuticals Supply Service (EPSS)',
          supplierId: 'EPSS-NAT-SUPPLIER',
          referenceDocument: 'EPSS-WHO-EML-24-ALLOC',
          notes: 'Demonstrative WHO Model List of Essential Medicines (24th List, Sep 2025) baseline facility inventory.',
          items: receiptItemsToReceive,
        },
        actor
      );
    }
  }
}

export const inventoryService = InventoryService.getInstance();
