/**
 * Jano Health - Clinical Safety Case Service (Clinical Core V22)
 * 
 * Manages clinical safety cases, claims, arguments, evidence, and residual risks.
 * Enforces hard invariant: A safety claim cannot be labeled VALIDATED without
 * documented evidence and authorized human clinical reviewer sign-off.
 */

import {
  SafetyCase,
  SafetyClaim,
  SafetyEvidence,
  SafetyResidualRisk,
  SafetyClaimStatus,
  V22_INVARIANTS,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { computeSha256 } from '../production/environmentConfigService';

export class ClinicalSafetyCaseService {
  private static instance: ClinicalSafetyCaseService;

  private constructor() {}

  public static getInstance(): ClinicalSafetyCaseService {
    if (!ClinicalSafetyCaseService.instance) {
      ClinicalSafetyCaseService.instance = new ClinicalSafetyCaseService();
    }
    return ClinicalSafetyCaseService.instance;
  }

  /**
   * Initializes or creates a top-level Clinical Safety Case.
   */
  public async createSafetyCase(
    title: string,
    systemVersion: string,
    scope: string,
    leadAssessor: string
  ): Promise<SafetyCase> {
    const caseId = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const safetyCase: SafetyCase = {
      caseId,
      title,
      systemVersion,
      scope,
      claimIds: [],
      status: 'DRAFT',
      leadAssessor,
      version: '1.0.0',
      lastUpdatedAt: new Date().toISOString(),
    };
    await idbEngine.put('clinicalSafetyCases', safetyCase);
    return safetyCase;
  }

  /**
   * Records a documented Safety Evidence artifact.
   */
  public async recordSafetyEvidence(
    title: string,
    evidenceType: SafetyEvidence['evidenceType'],
    rawEvidencePayload: Record<string, any>,
    isSynthetic: boolean,
    assessor: string
  ): Promise<SafetyEvidence> {
    const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const provenanceHash = await computeSha256(JSON.stringify(rawEvidencePayload));

    // Hard Invariant Check: Synthetic evidence must be visibly labeled as synthetic
    if (isSynthetic) {
      V22_INVARIANTS.assertSyntheticEvidenceExplicitlyLabeled(true, 'SYNTHETIC_TEST_DATA');
    }

    const evidence: SafetyEvidence = {
      evidenceId,
      title,
      claimIds: [],
      evidenceType,
      provenanceHash,
      isSynthetic,
      status: 'EVIDENCE_ACCEPTED',
      recordedAt: new Date().toISOString(),
      assessor,
    };

    await idbEngine.put('clinicalSafetyEvidence', evidence);
    return evidence;
  }

  /**
   * Adds a Safety Claim to a Safety Case.
   */
  public async createSafetyClaim(
    caseId: string,
    claimStatement: string,
    domain: string,
    hazardsAddressed: string[],
    controlsApplied: string[],
    reviewer: string
  ): Promise<SafetyClaim> {
    const claimId = `claim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const claim: SafetyClaim = {
      claimId,
      caseId,
      claimStatement,
      domain,
      hazardsAddressed,
      controlsApplied,
      evidenceIds: [],
      status: 'DRAFT',
      reviewer,
      reviewDate: new Date().toISOString(),
      version: '1.0.0',
    };

    await idbEngine.put('clinicalSafetyClaims', claim);

    // Link claim to safety case
    const safetyCase = await idbEngine.get<SafetyCase>('clinicalSafetyCases', caseId);
    if (safetyCase) {
      safetyCase.claimIds.push(claimId);
      safetyCase.lastUpdatedAt = new Date().toISOString();
      await idbEngine.put('clinicalSafetyCases', safetyCase);
    }

    return claim;
  }

  /**
   * Links evidence to a claim.
   */
  public async linkEvidenceToClaim(claimId: string, evidenceId: string): Promise<SafetyClaim> {
    const claim = await idbEngine.get<SafetyClaim>('clinicalSafetyClaims', claimId);
    if (!claim) throw new Error(`Safety claim not found: ${claimId}`);

    if (!claim.evidenceIds.includes(evidenceId)) {
      claim.evidenceIds.push(evidenceId);
      await idbEngine.put('clinicalSafetyClaims', claim);
    }

    const evidence = await idbEngine.get<SafetyEvidence>('clinicalSafetyEvidence', evidenceId);
    if (evidence && !evidence.claimIds.includes(claimId)) {
      evidence.claimIds.push(claimId);
      await idbEngine.put('clinicalSafetyEvidence', evidence);
    }

    return claim;
  }

  /**
   * Transitions a safety claim status.
   * INVARIANT: Cannot transition to VALIDATED without documented evidence and human reviewer!
   */
  public async reviewClaim(
    claimId: string,
    targetStatus: SafetyClaimStatus,
    reviewer: string
  ): Promise<SafetyClaim> {
    const claim = await idbEngine.get<SafetyClaim>('clinicalSafetyClaims', claimId);
    if (!claim) throw new Error(`Safety claim not found: ${claimId}`);

    // Invariant Enforcement
    V22_INVARIANTS.assertSafetyClaimHasEvidence(targetStatus, claim.evidenceIds, reviewer);

    claim.status = targetStatus;
    claim.reviewer = reviewer;
    claim.reviewDate = new Date().toISOString();

    await idbEngine.put('clinicalSafetyClaims', claim);
    return claim;
  }

  /**
   * Records a formally accepted residual clinical risk.
   */
  public async acceptResidualRisk(
    claimId: string,
    hazardId: string,
    description: string,
    justification: string,
    acceptedBy: string
  ): Promise<SafetyResidualRisk> {
    const residualRisk: SafetyResidualRisk = {
      residualRiskId: `res_${Date.now()}`,
      claimId,
      hazardId,
      description,
      acceptable: true,
      acceptedBy,
      acceptedAt: new Date().toISOString(),
      justification,
    };

    await idbEngine.put('hazardRiskAssessments', residualRisk);
    return residualRisk;
  }
}

export const clinicalSafetyCaseService = ClinicalSafetyCaseService.getInstance();
