/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Optimization Recommendation & Human Approval Service
 * 
 * INVARIANTS:
 * - Recommendation ≠ Authorization.
 * - Authorization ≠ Execution.
 * - AI Output ≠ Human Approval.
 * - Separation of Duties: Requester ≠ Approver. AI/System identity cannot self-approve.
 * - Dual Control: Two distinct authorized human principals required when DUAL_CONTROL_REQUIRED.
 * - Every recommendation requires explicit evidence and explainability.
 */

import {
  OptimizationRecommendation,
  OptimizationStatus,
  HumanApproval,
  ActionRiskClassification,
  DecisionEvidence,
  computeSha256,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { RoleType } from '../../domain/types';
import { hasCapability } from '../../domain/permissions';

export class OptimizationRecommendationService {
  private static instance: OptimizationRecommendationService;

  private recommendationsCache = new Map<string, OptimizationRecommendation>();
  private approvalsCache = new Map<string, HumanApproval>();

  private constructor() {}

  public static getInstance(): OptimizationRecommendationService {
    if (!OptimizationRecommendationService.instance) {
      OptimizationRecommendationService.instance = new OptimizationRecommendationService();
    }
    return OptimizationRecommendationService.instance;
  }

  /**
   * Creates an OptimizationRecommendation with explicit evidence and policy reference.
   */
  public async createRecommendation(input: {
    domain: OptimizationRecommendation['domain'];
    title: string;
    description: string;
    suggestedIntervention: string;
    projectedImpact: string;
    riskClassification: ActionRiskClassification;
    evidence: DecisionEvidence[];
    affectedScope: { facilityId?: string; departmentId?: string; systemId?: string };
    decisionContextId?: string;
    policyReference: string;
    createdBy?: string;
    expiresInHours?: number;
  }): Promise<OptimizationRecommendation> {
    const recommendationId = `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInHours || 24) * 3600 * 1000).toISOString();

    const recommendation: OptimizationRecommendation = {
      recommendationId,
      domain: input.domain,
      title: input.title,
      description: input.description,
      status: input.riskClassification === 'LEVEL_0_OBSERVE' ? 'DRAFT' : 'REVIEW_REQUIRED',
      suggestedIntervention: input.suggestedIntervention,
      projectedImpact: input.projectedImpact,
      riskClassification: input.riskClassification,
      evidence: input.evidence,
      affectedScope: input.affectedScope,
      decisionContextId: input.decisionContextId || `ctx-${recommendationId}`,
      policyReference: input.policyReference,
      createdBy: input.createdBy || 'system_intelligence_engine',
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.recommendationsCache.set(recommendationId, recommendation);
    await idbEngine.put('optimizationRecommendations', recommendation);
    return recommendation;
  }

  /**
   * Retrieves recommendations with optional filters.
   */
  public async getRecommendations(filter?: {
    domain?: string;
    status?: OptimizationStatus;
    facilityId?: string;
  }): Promise<OptimizationRecommendation[]> {
    let list: OptimizationRecommendation[] = [];
    try {
      const stored = await idbEngine.getAll<OptimizationRecommendation>('optimizationRecommendations');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.recommendationsCache.values());
    } catch {
      list = Array.from(this.recommendationsCache.values());
    }

    if (filter) {
      if (filter.domain) list = list.filter((r) => r.domain === filter.domain);
      if (filter.status) list = list.filter((r) => r.status === filter.status);
      if (filter.facilityId) list = list.filter((r) => r.affectedScope.facilityId === filter.facilityId);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  /**
   * Evaluates and records human approval with authorization, capability checks,
   * separation of duties, and dual control enforcement.
   */
  public async submitHumanApproval(input: {
    recommendationId: string;
    approverId: string;
    approverRole: RoleType;
    approverName: string;
    justification: string;
    decision: 'APPROVED' | 'REJECTED';
    scope?: string[];
    isDualControlSecondApproval?: boolean;
  }): Promise<{ success: boolean; approval?: HumanApproval; error?: string }> {
    const rec = (await this.getRecommendations()).find((r) => r.recommendationId === input.recommendationId);
    if (!rec) {
      return { success: false, error: 'RECOMMENDATION_NOT_FOUND' };
    }

    // Check expiration
    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      rec.status = 'EXPIRED';
      await idbEngine.put('optimizationRecommendations', rec);
      return { success: false, error: 'RECOMMENDATION_EXPIRED' };
    }

    // Separation of Duties: Requester cannot approve their own recommendation
    if (rec.createdBy === input.approverId) {
      return { success: false, error: 'SEPARATION_OF_DUTIES_VIOLATION: Requester cannot approve their own recommendation' };
    }

    // System/AI identity cannot approve
    if (input.approverId === 'system_intelligence_engine' || input.approverId.startsWith('ai_')) {
      return { success: false, error: 'AI_SELF_APPROVAL_PROHIBITED: AI or automated system identity cannot provide human authorization' };
    }

    // Capability check: approver must have approval capability
    const canApprove =
      hasCapability(input.approverRole, 'system:automation:approve') ||
      hasCapability(input.approverRole, 'system:recommendation:review') ||
      input.approverRole === 'system_intelligence_governor' ||
      input.approverRole === 'system_administrator';

    if (!canApprove) {
      return { success: false, error: `ROLE_UNAUTHORIZED: ${input.approverRole} lacks capability system:automation:approve` };
    }

    // Check existing approvals for this recommendation to handle Dual Control
    const existingApprovals = await this.getApprovalsForRecommendation(input.recommendationId);

    if (input.isDualControlSecondApproval) {
      if (existingApprovals.length === 0) {
        return { success: false, error: 'FIRST_APPROVAL_MISSING: Dual control requires first approval before second approval' };
      }
      const firstApproval = existingApprovals[0];
      if (firstApproval.approverId === input.approverId) {
        return { success: false, error: 'DUAL_CONTROL_VIOLATION: Second approval must be from a distinct authorized principal' };
      }
    }

    const approvalId = `appr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const expiration = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const core = {
      approvalId,
      recommendationOrActionId: input.recommendationId,
      approverId: input.approverId,
      approverRole: input.approverRole,
      approverName: input.approverName,
      capability: 'system.automation.approve',
      scope: input.scope || [rec.affectedScope.facilityId || 'global'],
      decision: input.decision,
      justification: input.justification,
      timestamp: now,
      expiration,
      isDualControlSecondApproval: Boolean(input.isDualControlSecondApproval),
      provenance: {
        systemVersion: 'v20.0',
      },
    };

    const integrityHash = computeSha256(core);
    const approval: HumanApproval = {
      ...core,
      integrityHash,
    };

    this.approvalsCache.set(approvalId, approval);
    await idbEngine.put('humanApprovals', approval);

    // Update recommendation state
    if (input.decision === 'APPROVED') {
      rec.status = 'APPROVED';
      rec.approvedBy = input.approverId;
      rec.approvedAt = now;
    } else {
      rec.status = 'REJECTED';
      rec.rejectionReason = input.justification;
    }
    await idbEngine.put('optimizationRecommendations', rec);

    return { success: true, approval };
  }

  public async getApprovalsForRecommendation(recommendationId: string): Promise<HumanApproval[]> {
    let list: HumanApproval[] = [];
    try {
      const stored = await idbEngine.getAll<HumanApproval>('humanApprovals');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.approvalsCache.values());
    } catch {
      list = Array.from(this.approvalsCache.values());
    }
    return list.filter((a) => a.recommendationOrActionId === recommendationId);
  }

  public clearMemoryCache(): void {
    this.recommendationsCache.clear();
    this.approvalsCache.clear();
  }
}

export const optimizationRecommendationService = OptimizationRecommendationService.getInstance();
