/**
 * Jano Health - Network Interoperability Quarantine Subsystem
 * Clinical Core V13: Human-in-the-Loop Quarantine Governance for Ambiguous Exchanges
 */

import {
  NetworkQuarantineItem,
  NetworkQuarantineCategory,
  QuarantineResolutionAction,
} from '../../domain/types';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export interface QuarantineMessageParams {
  category: NetworkQuarantineCategory;
  messageId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  resourceType: string;
  resourceId: string;
  rawPayload: any;
  normalizedPreview?: any;
  quarantineReason: string;
  validationFindings?: Array<{
    severity: 'error' | 'warning' | 'information';
    code: string;
    message: string;
    expression?: string;
  }>;
  identityCandidates?: Array<{
    patientId: string;
    mrn: string;
    name: string;
    dob: string;
    score: number;
    matchReasons: string[];
  }>;
  terminologyCandidates?: Array<{
    code: string;
    system: string;
    display: string;
    suggestedMapping?: string;
  }>;
}

export class NetworkQuarantineService {
  private static instance: NetworkQuarantineService;
  private items: Map<string, NetworkQuarantineItem> = new Map();

  private constructor() {}

  public static getInstance(): NetworkQuarantineService {
    if (!NetworkQuarantineService.instance) {
      NetworkQuarantineService.instance = new NetworkQuarantineService();
    }
    return NetworkQuarantineService.instance;
  }

  public async quarantine(params: QuarantineMessageParams): Promise<NetworkQuarantineItem> {
    const id = `qnt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const item: NetworkQuarantineItem = {
      id,
      category: params.category,
      messageId: params.messageId,
      sourceNodeId: params.sourceNodeId,
      destinationNodeId: params.destinationNodeId,
      sourceFacilityId: params.sourceFacilityId,
      destinationFacilityId: params.destinationFacilityId,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      rawPayload: params.rawPayload,
      normalizedPreview: params.normalizedPreview,
      quarantineReason: params.quarantineReason,
      validationFindings: params.validationFindings || [],
      identityCandidates: params.identityCandidates,
      terminologyCandidates: params.terminologyCandidates,
      status: 'PENDING_REVIEW',
      quarantinedAt: now,
      auditTrail: [
        {
          action: 'QUARANTINED',
          performedBy: 'system-quarantine-gatekeeper',
          timestamp: now,
          notes: `Quarantined into category ${params.category}: ${params.quarantineReason}`,
        },
      ],
    };

    this.items.set(id, item);

    try {
      await idbEngine.put('networkQuarantine', item);
    } catch {
      // Memory fallback
    }

    return item;
  }

  public getItem(id: string): NetworkQuarantineItem | undefined {
    return this.items.get(id);
  }

  public listQuarantined(filters?: {
    category?: NetworkQuarantineCategory;
    status?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
    facilityId?: string;
  }): NetworkQuarantineItem[] {
    let list = Array.from(this.items.values());

    if (filters?.category) {
      list = list.filter((i) => i.category === filters.category);
    }
    if (filters?.status) {
      list = list.filter((i) => i.status === filters.status);
    }
    if (filters?.facilityId) {
      list = list.filter(
        (i) => i.sourceFacilityId === filters.facilityId || i.destinationFacilityId === filters.facilityId
      );
    }

    return list.sort((a, b) => new Date(b.quarantinedAt).getTime() - new Date(a.quarantinedAt).getTime());
  }

  public async reviewItem(
    id: string,
    action: QuarantineResolutionAction,
    reviewerId: string,
    reviewerRole: string,
    notes?: string,
    mappedEntityId?: string
  ): Promise<NetworkQuarantineItem> {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`QUARANTINE_ITEM_NOT_FOUND: Quarantine item '${id}' does not exist.`);
    }

    const now = new Date().toISOString();
    item.resolvedAt = now;
    item.resolvedBy = reviewerId;
    item.reviewerRole = reviewerRole;
    item.resolutionAction = action;
    item.reviewerNotes = notes;
    if (mappedEntityId) {
      item.mappedEntityId = mappedEntityId;
    }

    switch (action) {
      case 'APPROVE':
      case 'MAP_IDENTITY':
      case 'MAP_TERMINOLOGY':
        item.status = 'APPROVED';
        break;
      case 'REJECT':
        item.status = 'REJECTED';
        break;
      case 'RETRY':
      case 'RESOLVED':
        item.status = 'RESOLVED';
        break;
      case 'REQUEST_REVIEW':
      case 'ESCALATE':
      default:
        item.status = 'PENDING_REVIEW';
        break;
    }

    item.auditTrail.push({
      action: `REVIEW_${action}`,
      performedBy: reviewerId,
      timestamp: now,
      notes: notes || `Action ${action} executed by ${reviewerRole}`,
    });

    this.items.set(id, item);

    try {
      await idbEngine.put('networkQuarantine', item);
    } catch {
      // Memory fallback
    }

    // Record immutable audit trail
    try {
      auditService.record(
        {
          actorId: reviewerId,
          actorName: reviewerId,
          actorRole: reviewerRole as any,
          facilityId: item.destinationFacilityId,
        },
        `QUARANTINE_${action}`,
        'NetworkQuarantineItem',
        item.id,
        {
          action,
          status: item.status,
          category: item.category,
          messageId: item.messageId,
          mappedEntityId,
          notes,
        }
      );
    } catch {
      // Audit fallback
    }

    return item;
  }

  public resetToSyntheticDemo(): void {
    this.items.clear();
  }
}

export const networkQuarantineService = NetworkQuarantineService.getInstance();
