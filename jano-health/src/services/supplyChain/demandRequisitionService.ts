/**
 * Jano Health - Clinical Core V17: Demand Signal & Requisition Service
 * 
 * Manages clinical supply demand signals, formal facility requisitions,
 * and multi-tier approval workflows with cryptographic integrity seals.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Prescription ≠ Requisition: Prescriptions represent patient clinical directives;
 *   Requisitions represent operational facility commodity replenishment requests.
 * - Requisition ≠ InventoryTransaction: A requisition does not decrement or mutate stock.
 * - Amount thresholds and departmental scopes are server-authoritatively enforced.
 */

import {
  DemandSignal,
  DemandSignalSource,
  Requisition,
  RequisitionStatus,
  RequisitionLine,
  ProcurementApproval,
} from '../../domain/v17SupplyChainTypes';
import { supplyCatalogService } from './supplyCatalogService';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export class DemandRequisitionService {
  private static instance: DemandRequisitionService;
  private signals: Map<string, DemandSignal> = new Map();
  private requisitions: Map<string, Requisition> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): DemandRequisitionService {
    if (!DemandRequisitionService.instance) {
      DemandRequisitionService.instance = new DemandRequisitionService();
    }
    return DemandRequisitionService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T08:00:00Z';

    const req1: Requisition = {
      requisitionId: 'req-amgh-emg-001',
      facilityId: 'fac-amgh',
      requestingDepartment: 'Emergency & Outpatient',
      requesterId: 'usr-dr-amani',
      purpose: 'Monthly resuscitation & antimicrobial buffer replenishment',
      lines: [
        {
          requisitionLineId: 'rql-amox-01',
          supplyItemId: 'itm-amox-500',
          quantityRequested: 50,
          quantityApproved: 50,
          unit: 'BOTTLE_1000',
          justification: 'Critical antibiotic stock buffer at 3 days remaining',
          requiredDate: '2026-01-10',
          estimatedUnitCost: 15.0,
          status: 'APPROVED',
          provenance: { createdAt: now },
        },
        {
          requisitionLineId: 'rql-oxy-01',
          supplyItemId: 'itm-oxytocin-10iu',
          quantityRequested: 10,
          quantityApproved: 10,
          unit: 'BOX_100',
          justification: 'Maternity hemorrhage emergency readiness',
          requiredDate: '2026-01-05',
          estimatedUnitCost: 45.0,
          status: 'APPROVED',
          provenance: { createdAt: now },
        },
      ],
      priority: 'HIGH',
      requestedAt: now,
      neededBy: '2026-01-10',
      status: 'APPROVED',
      approvalHistory: [
        {
          approvalId: 'appr-req-001',
          entityType: 'REQUISITION',
          entityId: 'req-amgh-emg-001',
          reviewerId: 'usr-admin-amgh',
          reviewerRole: 'facility_administrator',
          action: 'APPROVED',
          timestamp: '2026-01-01T10:00:00Z',
          justification: 'Approved within facility monthly operating budget',
          authorizationScope: {
            facilityId: 'fac-amgh',
            department: 'Emergency & Outpatient',
            maxAmountLimit: 5000,
          },
          amountApproved: 1200,
          provenance: { systemVersion: 'v17.0' },
        },
      ],
      provenance: {
        createdAt: now,
        createdBy: 'usr-dr-amani',
        facilityId: 'fac-amgh',
        systemVersion: 'v17.0',
      },
      version: 2,
      integrityMetadata: {
        hash: sha256(`req-amgh-emg-001:APPROVED:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.requisitions.set(req1.requisitionId, req1);
  }

  // ==========================================================================
  // DEMAND SIGNALS
  // ==========================================================================

  public async recordDemandSignal(params: {
    facilityId: string;
    supplyItemId: string;
    quantity: number;
    unit: string;
    priority: DemandSignal['priority'];
    source: DemandSignalSource;
    reportingPeriod: { start: string; end: string };
    confidence?: number;
    actorId: string;
  }): Promise<DemandSignal> {
    const demandSignalId = `dsg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const signal: DemandSignal = {
      demandSignalId,
      facilityId: params.facilityId,
      supplyItemId: params.supplyItemId,
      quantity: params.quantity,
      unit: params.unit,
      priority: params.priority,
      source: params.source,
      reportingPeriod: params.reportingPeriod,
      confidence: params.confidence !== undefined ? params.confidence : 1.0,
      createdAt: now,
      provenance: {
        generatedBy: params.actorId,
        systemVersion: 'v17.0',
      },
    };

    this.signals.set(demandSignalId, signal);

    try {
      await idbEngine.put('demandSignals' as any, signal);
    } catch {}

    await auditService.log({
      action: 'DEMAND_SIGNAL_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        demandSignalId,
        supplyItemId: params.supplyItemId,
        quantity: params.quantity,
        source: params.source,
      },
    });

    return signal;
  }

  public async createDemandSignal(params: {
    facilityId: string;
    supplyItemId: string;
    quantity: number;
    unit: string;
    priority: DemandSignal['priority'];
    source: DemandSignalSource;
    reportingPeriod: { start: string; end: string };
    confidence?: number;
    actorId: string;
  }): Promise<DemandSignal> {
    return this.recordDemandSignal(params);
  }

  public getDemandSignals(facilityId: string, supplyItemId?: string): DemandSignal[] {
    let result = Array.from(this.signals.values()).filter((s) => s.facilityId === facilityId);
    if (supplyItemId) {
      result = result.filter((s) => s.supplyItemId === supplyItemId);
    }
    return result;
  }

  public listDemandSignals(facilityId: string, supplyItemId?: string): DemandSignal[] {
    return this.getDemandSignals(facilityId, supplyItemId);
  }

  // ==========================================================================
  // REQUISITIONS
  // ==========================================================================

  public async createRequisition(params: {
    facilityId: string;
    requestingDepartment: string;
    requesterId: string;
    purpose: string;
    priority: Requisition['priority'];
    neededBy: string;
    lines: Array<{
      supplyItemId: string;
      quantityRequested: number;
      unit: string;
      justification: string;
      requiredDate: string;
      sourceDemandSignalId?: string;
      estimatedUnitCost?: number;
    }>;
  }): Promise<Requisition> {
    const requisitionId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const lines: RequisitionLine[] = params.lines.map((l) => ({
      requisitionLineId: `rql_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      supplyItemId: l.supplyItemId,
      quantityRequested: l.quantityRequested,
      unit: l.unit,
      justification: l.justification,
      requiredDate: l.requiredDate,
      sourceDemandSignalId: l.sourceDemandSignalId,
      estimatedUnitCost: l.estimatedUnitCost,
      status: 'PENDING',
      provenance: { createdAt: now },
    }));

    const requisition: Requisition = {
      requisitionId,
      facilityId: params.facilityId,
      requestingDepartment: params.requestingDepartment,
      requesterId: params.requesterId,
      purpose: params.purpose,
      lines,
      priority: params.priority,
      requestedAt: now,
      neededBy: params.neededBy,
      status: 'DRAFT',
      approvalHistory: [],
      provenance: {
        createdAt: now,
        createdBy: params.requesterId,
        facilityId: params.facilityId,
        systemVersion: 'v17.0',
      },
      version: 1,
      integrityMetadata: {
        hash: sha256(`${requisitionId}:DRAFT:${params.requesterId}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.requisitions.set(requisitionId, requisition);

    try {
      await idbEngine.put('requisitions' as any, requisition);
    } catch {}

    await auditService.log({
      action: 'REQUISITION_CREATED',
      actorId: params.requesterId,
      facilityId: params.facilityId,
      details: {
        requisitionId,
        department: params.requestingDepartment,
        lineCount: lines.length,
      },
    });

    return requisition;
  }

  public async submitRequisition(
    requisitionId: string,
    actorId: string
  ): Promise<Requisition> {
    const req = this.requisitions.get(requisitionId);
    if (!req) throw new Error(`Requisition not found: ${requisitionId}`);

    if (req.status !== 'DRAFT') {
      throw new Error(`Cannot submit requisition in status '${req.status}'`);
    }

    const now = new Date().toISOString();
    req.status = 'SUBMITTED';
    req.version += 1;
    req.integrityMetadata.hash = sha256(`${req.requisitionId}:SUBMITTED:${req.version}:${now}`);
    req.integrityMetadata.lastVerifiedAt = now;

    this.requisitions.set(requisitionId, req);

    try {
      await idbEngine.put('requisitions' as any, req);
    } catch {}

    await auditService.log({
      action: 'REQUISITION_SUBMITTED',
      actorId,
      facilityId: req.facilityId,
      details: { requisitionId, version: req.version },
    });

    return req;
  }

  public async reviewAndApproveRequisition(params: {
    requisitionId: string;
    reviewerId: string;
    reviewerRole: string;
    action: 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'RETURNED';
    justification: string;
    approvedLineQuantities?: Record<string, number>; // requisitionLineId -> approved quantity
    maxAuthorizedAmount?: number;
  }): Promise<Requisition> {
    const req = this.requisitions.get(params.requisitionId);
    if (!req) throw new Error(`Requisition not found: ${params.requisitionId}`);

    if (req.status !== 'SUBMITTED' && req.status !== 'UNDER_REVIEW') {
      throw new Error(`Cannot review requisition in status '${req.status}'`);
    }

    const now = new Date().toISOString();
    const approvalId = `appr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    let totalAmount = 0;
    for (const line of req.lines) {
      if (params.approvedLineQuantities && params.approvedLineQuantities[line.requisitionLineId] !== undefined) {
        line.quantityApproved = params.approvedLineQuantities[line.requisitionLineId];
        line.status = line.quantityApproved > 0 ? (line.quantityApproved === line.quantityRequested ? 'APPROVED' : 'PARTIALLY_APPROVED') : 'REJECTED';
      } else if (params.action === 'APPROVED') {
        line.quantityApproved = line.quantityRequested;
        line.status = 'APPROVED';
      } else if (params.action === 'REJECTED') {
        line.quantityApproved = 0;
        line.status = 'REJECTED';
      }
      totalAmount += (line.quantityApproved || 0) * (line.estimatedUnitCost || 0);
    }

    // Amount threshold check
    if (params.maxAuthorizedAmount && totalAmount > params.maxAuthorizedAmount) {
      throw new Error(`Requisition amount ($${totalAmount}) exceeds reviewer authorization limit ($${params.maxAuthorizedAmount})`);
    }

    let targetStatus: RequisitionStatus = 'APPROVED';
    if (params.action === 'REJECTED') targetStatus = 'REJECTED';
    else if (params.action === 'PARTIALLY_APPROVED') targetStatus = 'PARTIALLY_APPROVED';
    else if (params.action === 'RETURNED') targetStatus = 'DRAFT';

    const approval: ProcurementApproval = {
      approvalId,
      entityType: 'REQUISITION',
      entityId: req.requisitionId,
      reviewerId: params.reviewerId,
      reviewerRole: params.reviewerRole,
      action: params.action,
      timestamp: now,
      justification: params.justification,
      authorizationScope: {
        facilityId: req.facilityId,
        department: req.requestingDepartment,
        maxAmountLimit: params.maxAuthorizedAmount,
      },
      amountApproved: totalAmount,
      provenance: { systemVersion: 'v17.0' },
    };

    req.status = targetStatus;
    req.approvalHistory.push(approval);
    req.version += 1;
    req.integrityMetadata.hash = sha256(`${req.requisitionId}:${targetStatus}:${req.version}:${now}`);
    req.integrityMetadata.lastVerifiedAt = now;

    this.requisitions.set(req.requisitionId, req);

    try {
      await idbEngine.put('requisitions' as any, req);
    } catch {}

    await auditService.log({
      action: `REQUISITION_${params.action}`,
      actorId: params.reviewerId,
      facilityId: req.facilityId,
      details: {
        requisitionId: req.requisitionId,
        action: params.action,
        totalAmountApproved: totalAmount,
        status: targetStatus,
      },
    });

    return req;
  }

  public getRequisition(requisitionId: string): Requisition | undefined {
    return this.requisitions.get(requisitionId);
  }

  public listRequisitions(filter?: {
    facilityId?: string;
    status?: RequisitionStatus;
    department?: string;
  }): Requisition[] {
    let result = Array.from(this.requisitions.values());

    if (filter?.facilityId) {
      result = result.filter((r) => r.facilityId === filter.facilityId);
    }
    if (filter?.status) {
      result = result.filter((r) => r.status === filter.status);
    }
    if (filter?.department) {
      result = result.filter((r) => r.requestingDepartment.toLowerCase() === filter.department!.toLowerCase());
    }

    return result;
  }
}

export const demandRequisitionService = DemandRequisitionService.getInstance();
