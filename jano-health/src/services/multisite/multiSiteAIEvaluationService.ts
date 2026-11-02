/**
 * Jano Health - Multi-Site AI Advisory Evaluation Service (V24)
 * Monitors, compares, and audits advisory-only clinical AI performance across sites.
 * 
 * HARD INVARIANTS:
 * - clinicianReviewRequired: true (AI is strictly advisory)
 * - isAutonomousMutationAllowed: false (No autonomous clinical state changes permitted)
 */

import { idbEngine } from '../storage/indexedDbEngine';
import { MultiSiteAIEvaluation } from '../../domain/v24MultiSiteEvidenceTypes';

export class MultiSiteAIEvaluationService {
  private evaluations: Map<string, MultiSiteAIEvaluation> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const e1: MultiSiteAIEvaluation = {
      evaluationId: 'aieval-site-amani-01',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-amani-01',
      modelVersion: 'gemini-1.5-pro-clinical-advisory-v2',
      knowledgeVersion: 'WHO_GUIDELINES_AFRO_2025_Q4',
      totalAdvisoryInvocations: 340,
      groundedAdvisoriesCount: 334,
      unsupportedResponsesCount: 6,
      clinicianAcceptedCount: 295,
      clinicianRejectedCount: 45,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
      groundingFailureDisablementCount: 0,
      acceptanceRateNote: 'Clinicians accepted 86.8% of triage guidance with deliberate manual confirmation.',
    };

    const e2: MultiSiteAIEvaluation = {
      evaluationId: 'aieval-site-kilima-02',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-kilima-02',
      modelVersion: 'gemini-1.5-pro-clinical-advisory-v2',
      knowledgeVersion: 'WHO_GUIDELINES_AFRO_2025_Q4',
      totalAdvisoryInvocations: 180,
      groundedAdvisoriesCount: 177,
      unsupportedResponsesCount: 3,
      clinicianAcceptedCount: 151,
      clinicianRejectedCount: 29,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
      groundingFailureDisablementCount: 0,
      acceptanceRateNote: 'Clinical officer reviewed all antibiotic dosage suggestions before prescription issuance.',
    };

    this.evaluations.set(e1.siteId, e1);
    this.evaluations.set(e2.siteId, e2);
  }

  public async getEvaluation(siteId: string): Promise<MultiSiteAIEvaluation | null> {
    return this.evaluations.get(siteId) || null;
  }

  public async listEvaluations(programId: string): Promise<MultiSiteAIEvaluation[]> {
    return Array.from(this.evaluations.values()).filter((e) => e.programId === programId);
  }

  public async recordEvaluation(
    params: Omit<MultiSiteAIEvaluation, 'evaluationId' | 'clinicianReviewRequired' | 'isAutonomousMutationAllowed'>
  ): Promise<MultiSiteAIEvaluation> {
    // ENFORCE HARD INVARIANTS: AI cannot mutate clinical records autonomously, clinician review always required
    const evaluation: MultiSiteAIEvaluation = {
      ...params,
      evaluationId: `aieval-${params.siteId}-${Date.now().toString(16)}`,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
    };

    this.evaluations.set(evaluation.siteId, evaluation);
    await idbEngine.put('multiSiteAIEvaluations', evaluation);
    return evaluation;
  }

  /**
   * Asserts and certifies that all pilot sites adhere to the advisory-only AI invariants.
   */
  public async verifyAIGovernanceCompliance(programId: string): Promise<{
    compliant: boolean;
    totalEvaluations: number;
    violations: string[];
  }> {
    const evals = await this.listEvaluations(programId);
    const violations: string[] = [];

    for (const e of evals) {
      if (!e.clinicianReviewRequired) {
        violations.push(`Site ${e.siteId} breached invariant: clinicianReviewRequired is false`);
      }
      if (e.isAutonomousMutationAllowed) {
        violations.push(`Site ${e.siteId} breached invariant: autonomous clinical mutation is enabled`);
      }
    }

    return {
      compliant: violations.length === 0,
      totalEvaluations: evals.length,
      violations,
    };
  }
}

export const multiSiteAIEvaluationService = new MultiSiteAIEvaluationService();
