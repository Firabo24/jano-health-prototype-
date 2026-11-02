/**
 * Jano Health - Clinical Core V17: Quality & Recall Management Service
 * 
 * Manages batch quality holds, official regulatory recalls, and supplier quality audits.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - QualityHold ≠ Disposal: A quality hold is a safety quarantine, not automated destruction.
 * - QualityRelease ≠ ClinicalApproval: Releasing a hold affirms supply integrity,
 *   not a prescription or clinical diagnosis.
 * - Consequential actions (releasing holds, blacklisting suppliers) require authorized human decisions.
 */

import {
  BatchQualityHold,
  QualityHoldReason,
  QualityHoldStatus,
  RecallNotice,
  RecallAction,
  RecallStatus,
  SupplierQualityEvent,
} from '../../domain/v17SupplyChainTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class QualityRecallService {
  private static instance: QualityRecallService;
  private holds: Map<string, BatchQualityHold> = new Map();
  private recalls: Map<string, RecallNotice> = new Map();
  private recallActions: Map<string, RecallAction> = new Map();
  private supplierEvents: Map<string, SupplierQualityEvent> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): QualityRecallService {
    if (!QualityRecallService.instance) {
      QualityRecallService.instance = new QualityRecallService();
    }
    return QualityRecallService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T00:00:00Z';

    const hold1: BatchQualityHold = {
      holdId: 'hld-bcg-2025-01',
      supplyItemId: 'itm-bcg-vaccine',
      batchNumber: 'BCG-2025-04K',
      facilityId: 'fac-amgh',
      warehouseId: 'wh-amgh-main',
      reason: 'TEMPERATURE_EXCURSION',
      holdStatus: 'ACTIVE',
      quantityHeld: 200,
      placedBy: 'usr-pharmacist-lead',
      placedAt: now,
      provenance: {
        createdAt: now,
        systemVersion: 'v17.0',
      },
    };

    this.holds.set(hold1.holdId, hold1);
  }

  // ==========================================================================
  // BATCH QUALITY HOLDS
  // ==========================================================================

  public async placeBatchOnHold(params: {
    supplyItemId: string;
    batchNumber: string;
    facilityId: string;
    warehouseId: string;
    reason: QualityHoldReason;
    quantityHeld: number;
    placedBy: string;
  }): Promise<BatchQualityHold> {
    const holdId = `hld_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const hold: BatchQualityHold = {
      holdId,
      supplyItemId: params.supplyItemId,
      batchNumber: params.batchNumber,
      facilityId: params.facilityId,
      warehouseId: params.warehouseId,
      reason: params.reason,
      holdStatus: 'ACTIVE',
      quantityHeld: params.quantityHeld,
      placedBy: params.placedBy,
      placedAt: now,
      provenance: {
        createdAt: now,
        systemVersion: 'v17.0',
      },
    };

    this.holds.set(holdId, hold);

    try {
      await idbEngine.put('batchQualityHolds' as any, hold);
    } catch {}

    await auditService.log({
      action: 'BATCH_QUALITY_HOLD_PLACED',
      actorId: params.placedBy,
      facilityId: params.facilityId,
      details: {
        holdId,
        supplyItemId: params.supplyItemId,
        batchNumber: params.batchNumber,
        reason: params.reason,
        quantity: params.quantityHeld,
      },
    });

    return hold;
  }

  public async releaseBatchHold(params: {
    holdId: string;
    releaseDecision: string;
    releasedBy: string;
    facilityId: string;
  }): Promise<BatchQualityHold> {
    const hold = this.holds.get(params.holdId);
    if (!hold) throw new Error(`Quality hold not found: ${params.holdId}`);

    const now = new Date().toISOString();
    hold.holdStatus = 'RELEASED';
    hold.releaseDecision = params.releaseDecision;
    hold.releasedBy = params.releasedBy;
    hold.releasedAt = now;

    this.holds.set(params.holdId, hold);

    try {
      await idbEngine.put('batchQualityHolds' as any, hold);
    } catch {}

    await auditService.log({
      action: 'BATCH_QUALITY_HOLD_RELEASED',
      actorId: params.releasedBy,
      facilityId: params.facilityId,
      details: { holdId: params.holdId, decision: params.releaseDecision },
    });

    return hold;
  }

  public async disposeBatchHold(params: {
    holdId: string;
    dispositionNotes: string;
    actorId: string;
    facilityId: string;
  }): Promise<BatchQualityHold> {
    const hold = this.holds.get(params.holdId);
    if (!hold) throw new Error(`Quality hold not found: ${params.holdId}`);

    const now = new Date().toISOString();
    hold.holdStatus = 'DISPOSED';
    hold.releaseDecision = `Disposed: ${params.dispositionNotes}`;
    hold.releasedBy = params.actorId;
    hold.releasedAt = now;

    this.holds.set(params.holdId, hold);

    try {
      await idbEngine.put('batchQualityHolds' as any, hold);
    } catch {}

    await auditService.log({
      action: 'BATCH_QUALITY_HOLD_DISPOSED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: { holdId: params.holdId, dispositionNotes: params.dispositionNotes },
    });

    return hold;
  }

  public getActiveHoldsForBatch(batchNumber: string): BatchQualityHold[] {
    return Array.from(this.holds.values()).filter(
      (h) => h.batchNumber === batchNumber && h.holdStatus === 'ACTIVE'
    );
  }

  public getActiveHolds(facilityId?: string): BatchQualityHold[] {
    let result = Array.from(this.holds.values()).filter((h) => h.holdStatus === 'ACTIVE');
    if (facilityId) {
      result = result.filter((h) => h.facilityId === facilityId);
    }
    return result;
  }

  // ==========================================================================
  // RECALL NOTICES & ACTIONS
  // ==========================================================================

  public async issueRecallNotice(params: {
    affectedItemIds: string[];
    manufacturer: string;
    batchNumbers: string[];
    affectedLocations: string[];
    severity: RecallNotice['severity'];
    actionRequired: RecallNotice['actionRequired'];
    instructions: string;
    actorId: string;
  }): Promise<RecallNotice> {
    const recallId = `rcl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const recallNumber = `REC-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();

    const notice: RecallNotice = {
      recallId,
      recallNumber,
      affectedItemIds: params.affectedItemIds,
      manufacturer: params.manufacturer,
      batchNumbers: params.batchNumbers,
      affectedLocations: params.affectedLocations,
      notificationDate: now,
      severity: params.severity,
      actionRequired: params.actionRequired,
      status: 'ISSUED',
      instructions: params.instructions,
      provenance: {
        issuedBy: params.actorId,
        issuedAt: now,
      },
    };

    this.recalls.set(recallId, notice);

    try {
      await idbEngine.put('recallNotices' as any, notice);
    } catch {}

    await auditService.log({
      action: 'RECALL_NOTICE_ISSUED',
      actorId: params.actorId,
      facilityId: 'system',
      details: { recallId, recallNumber, severity: params.severity, batches: params.batchNumbers },
    });

    return notice;
  }

  public async executeRecallAction(params: {
    recallId: string;
    facilityId: string;
    actionType: RecallAction['actionType'];
    quantityAffected: number;
    quantityQuarantined: number;
    quantityReturned?: number;
    evidenceNotes: string;
    actorId: string;
  }): Promise<RecallAction> {
    const actionId = `rca_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const action: RecallAction = {
      actionId,
      recallId: params.recallId,
      facilityId: params.facilityId,
      actionType: params.actionType,
      quantityAffected: params.quantityAffected,
      quantityQuarantined: params.quantityQuarantined,
      quantityReturned: params.quantityReturned || 0,
      status: 'EXECUTED',
      executedBy: params.actorId,
      executedAt: now,
      evidenceNotes: params.evidenceNotes,
    };

    this.recallActions.set(actionId, action);

    // Update notice status
    const notice = this.recalls.get(params.recallId);
    if (notice) {
      notice.status = 'IN_PROGRESS';
    }

    try {
      await idbEngine.put('recallActions' as any, action);
      if (notice) await idbEngine.put('recallNotices' as any, notice);
    } catch {}

    await auditService.log({
      action: 'RECALL_ACTION_EXECUTED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: { actionId, recallId: params.recallId, quarantined: params.quantityQuarantined },
    });

    return action;
  }

  public getRecallNotices(): RecallNotice[] {
    return Array.from(this.recalls.values());
  }

  public listRecalls(): RecallNotice[] {
    return this.getRecallNotices();
  }

  public getRecallActions(recallId?: string): RecallAction[] {
    let result = Array.from(this.recallActions.values());
    if (recallId) {
      result = result.filter((a) => a.recallId === recallId);
    }
    return result;
  }

  // ==========================================================================
  // SUPPLIER QUALITY AUDIT
  // ==========================================================================

  public async recordSupplierQualityEvent(params: {
    supplierId: string;
    eventType: SupplierQualityEvent['eventType'];
    severity: SupplierQualityEvent['severity'];
    description: string;
    purchaseOrderId?: string;
    shipmentId?: string;
    recordedBy: string;
    humanResolutionNotes?: string;
  }): Promise<SupplierQualityEvent> {
    const eventId = `sqe_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const event: SupplierQualityEvent = {
      eventId,
      supplierId: params.supplierId,
      eventType: params.eventType,
      severity: params.severity,
      description: params.description,
      purchaseOrderId: params.purchaseOrderId,
      shipmentId: params.shipmentId,
      recordedBy: params.recordedBy,
      recordedAt: now,
      humanResolutionNotes: params.humanResolutionNotes,
    };

    this.supplierEvents.set(eventId, event);

    try {
      await idbEngine.put('supplierQualityEvents' as any, event);
    } catch {}

    await auditService.log({
      action: 'SUPPLIER_QUALITY_EVENT_RECORDED',
      actorId: params.recordedBy,
      facilityId: 'system',
      details: { eventId, supplierId: params.supplierId, eventType: params.eventType },
    });

    return event;
  }

  public getEventsForSupplier(supplierId: string): SupplierQualityEvent[] {
    return Array.from(this.supplierEvents.values()).filter((e) => e.supplierId === supplierId);
  }
}

export const qualityRecallService = QualityRecallService.getInstance();
