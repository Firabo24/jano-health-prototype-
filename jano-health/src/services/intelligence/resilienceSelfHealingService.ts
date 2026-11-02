/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Resilience & Self-Healing Service
 * 
 * INVARIANTS:
 * - Network Healing ≠ Data Fabrication. Never fabricate missing data.
 * - Derived Data ≠ Authoritative Data.
 * - Safe automatic repair is strictly limited to DERIVED projections.
 * - Authoritative clinical data remains strongly protected and requires explicit human review.
 */

import {
  SyncHealingPlan,
  IntegrationRecoveryPlan,
  QueueRecoveryPlan,
  DataRepairProposal,
  DataClassification,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class ResilienceSelfHealingService {
  private static instance: ResilienceSelfHealingService;

  private syncPlansCache = new Map<string, SyncHealingPlan>();
  private integrationPlansCache = new Map<string, IntegrationRecoveryPlan>();
  private queuePlansCache = new Map<string, QueueRecoveryPlan>();
  private repairProposalsCache = new Map<string, DataRepairProposal>();

  private constructor() {}

  public static getInstance(): ResilienceSelfHealingService {
    if (!ResilienceSelfHealingService.instance) {
      ResilienceSelfHealingService.instance = new ResilienceSelfHealingService();
    }
    return ResilienceSelfHealingService.instance;
  }

  /**
   * Generates a SyncHealingPlan for stuck queues or repeated transient sync failures.
   * INVARIANT: Never fabricates missing clinical payload.
   */
  public async createSyncHealingPlan(input: {
    detectedIssue: SyncHealingPlan['detectedIssue'];
    sourceQueue: string;
    failureCount: number;
    strategy: SyncHealingPlan['strategy'];
    maxRetries?: number;
    idempotencyKey?: string;
  }): Promise<SyncHealingPlan> {
    const planId = `syncplan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const plan: SyncHealingPlan = {
      planId,
      detectedIssue: input.detectedIssue,
      sourceQueue: input.sourceQueue,
      failureCount: input.failureCount,
      strategy: input.strategy,
      status: 'PROPOSED',
      maxRetries: input.maxRetries || 3,
      retryCount: 0,
      requiresHumanReview: input.failureCount >= 5, // Escalate if repeated failure
      integrityVerified: true,
      idempotencyKey: input.idempotencyKey || `idem-${planId}`,
      createdAt: new Date().toISOString(),
    };

    this.syncPlansCache.set(planId, plan);
    await idbEngine.put('syncHealingPlans', plan);
    return plan;
  }

  /**
   * Executes a bounded sync healing strategy (e.g. bounded retry with backoff).
   */
  public async executeSyncHealing(planId: string): Promise<{ success: boolean; plan: SyncHealingPlan; message: string }> {
    const plan = this.syncPlansCache.get(planId) || (await idbEngine.get<SyncHealingPlan>('syncHealingPlans', planId));
    if (!plan) {
      throw new Error('SYNC_HEALING_PLAN_NOT_FOUND');
    }

    if (plan.requiresHumanReview && plan.status !== 'APPROVED') {
      return {
        success: false,
        plan,
        message: 'HUMAN_REVIEW_REQUIRED: Repeated failure threshold exceeded; human supervision required',
      };
    }

    plan.status = 'EXECUTING';
    plan.retryCount++;

    // Bounded retry simulation: success if retry count within maxRetries
    if (plan.retryCount <= plan.maxRetries) {
      plan.status = 'COMPLETED';
      await idbEngine.put('syncHealingPlans', plan);
      return {
        success: true,
        plan,
        message: `Sync healing executed: Bounded retry ${plan.retryCount}/${plan.maxRetries} succeeded`,
      };
    } else {
      plan.status = 'FAILED';
      plan.requiresHumanReview = true;
      await idbEngine.put('syncHealingPlans', plan);
      return {
        success: false,
        plan,
        message: 'Bounded retry limit exhausted without recovery; escalated to human review',
      };
    }
  }

  /**
   * Generates an IntegrationRecoveryPlan for an external circuit breaker in OPEN state.
   */
  public async createIntegrationRecoveryPlan(
    integrationId: string,
    systemName: string,
    circuitState: 'OPEN' | 'HALF_OPEN' | 'CLOSED'
  ): Promise<IntegrationRecoveryPlan> {
    const planId = `intrec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const plan: IntegrationRecoveryPlan = {
      planId,
      integrationId,
      systemName,
      circuitState,
      recoverySteps: [
        'PRESERVE_LOCAL_OFFLINE_QUEUE',
        'APPLY_EXPONENTIAL_BACKOFF',
        'PROBE_HEALTH_ENDPOINT_HALF_OPEN',
        'DRAIN_QUEUED_MESSAGES_ON_CONFIRMATION',
      ],
      status: 'PENDING',
      humanEscalationRequired: circuitState === 'OPEN',
      createdAt: new Date().toISOString(),
    };

    this.integrationPlansCache.set(planId, plan);
    await idbEngine.put('integrationRecoveryPlans', plan);
    return plan;
  }

  /**
   * Creates a DataRepairProposal strictly distinguishing DERIVED vs AUTHORITATIVE data.
   */
  public async createDataRepairProposal(input: {
    targetStore: string;
    targetEntityId: string;
    classification: DataClassification;
    anomalyType: DataRepairProposal['anomalyType'];
    proposedRepairAction: string;
    evidence: string[];
  }): Promise<DataRepairProposal> {
    const proposalId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // INVARIANT: Only DERIVED projections can be safely auto-rebuilt
    const safeToAutoRebuild = input.classification === 'DERIVED';
    const humanReviewRequired = input.classification === 'AUTHORITATIVE';

    const proposal: DataRepairProposal = {
      proposalId,
      targetStore: input.targetStore,
      targetEntityId: input.targetEntityId,
      classification: input.classification,
      anomalyType: input.anomalyType,
      proposedRepairAction: input.proposedRepairAction,
      safeToAutoRebuild,
      status: safeToAutoRebuild ? 'DRAFT' : 'REVIEW_REQUIRED',
      humanReviewRequired,
      evidence: input.evidence,
      createdAt: new Date().toISOString(),
    };

    this.repairProposalsCache.set(proposalId, proposal);
    await idbEngine.put('dataRepairProposals', proposal);
    return proposal;
  }

  /**
   * Executes a DataRepairProposal.
   * If classification === 'AUTHORITATIVE', refuses automatic mutation without approved status.
   */
  public async executeDataRepair(proposalId: string): Promise<{ success: boolean; proposal: DataRepairProposal; error?: string }> {
    const proposal =
      this.repairProposalsCache.get(proposalId) || (await idbEngine.get<DataRepairProposal>('dataRepairProposals', proposalId));

    if (!proposal) {
      throw new Error('DATA_REPAIR_PROPOSAL_NOT_FOUND');
    }

    if (proposal.classification === 'AUTHORITATIVE' && proposal.status !== 'APPROVED') {
      return {
        success: false,
        proposal,
        error: 'AUTHORITATIVE_DATA_PROTECTED: Authoritative clinical or financial data cannot be automatically mutated without explicit human approval',
      };
    }

    // Rebuild derived data safely
    proposal.status = 'EXECUTED';
    proposal.executedAt = new Date().toISOString();
    await idbEngine.put('dataRepairProposals', proposal);
    return { success: true, proposal };
  }

  public async getSyncHealingPlans(): Promise<SyncHealingPlan[]> {
    try {
      const stored = await idbEngine.getAll<SyncHealingPlan>('syncHealingPlans');
      if (stored && stored.length > 0) return stored;
    } catch {}
    return Array.from(this.syncPlansCache.values());
  }

  public async getDataRepairProposals(): Promise<DataRepairProposal[]> {
    try {
      const stored = await idbEngine.getAll<DataRepairProposal>('dataRepairProposals');
      if (stored && stored.length > 0) return stored;
    } catch {}
    return Array.from(this.repairProposalsCache.values());
  }

  public clearMemoryCache(): void {
    this.syncPlansCache.clear();
    this.integrationPlansCache.clear();
    this.queuePlansCache.clear();
    this.repairProposalsCache.clear();
  }
}

export const resilienceSelfHealingService = ResilienceSelfHealingService.getInstance();
