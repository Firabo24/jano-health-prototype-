/**
 * Jano Health - AI Clinical Validation & Grounding Service (Clinical Core V22)
 * 
 * Governs AI validation studies, test cases, error taxonomy evaluation,
 * and clinician human override records.
 * 
 * Hard Invariants:
 * - clinicianReviewRequired = true
 * - isAutonomousMutationAllowed = false
 * - Never transform AI recommendation into diagnosis or medication order without explicit human action.
 */

import {
  AIValidationStudy,
  AIValidationCase,
  V22_INVARIANTS,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class AIValidationEvaluationService {
  private static instance: AIValidationEvaluationService;

  private constructor() {}

  public static getInstance(): AIValidationEvaluationService {
    if (!AIValidationEvaluationService.instance) {
      AIValidationEvaluationService.instance = new AIValidationEvaluationService();
    }
    return AIValidationEvaluationService.instance;
  }

  /**
   * Creates a structured AI validation study.
   */
  public async createStudy(
    capability: string,
    modelIdentifier: string,
    modelVersion: string,
    datasetVersion: string,
    reviewer: string
  ): Promise<AIValidationStudy> {
    const studyId = `aistudy_${Date.now()}`;
    const study: AIValidationStudy = {
      studyId,
      capability,
      modelIdentifier,
      modelVersion,
      datasetVersion,
      cases: [],
      summaryMetrics: {
        factualGroundingScore: 100,
        clinicalFidelityScore: 100,
        hallucinationsDetected: 0,
        totalCases: 0,
        passedCases: 0,
      },
      status: 'IN_PROGRESS',
      reviewer,
      reviewedAt: new Date().toISOString(),
    };

    await idbEngine.put('aiValidationStudies', study);
    return study;
  }

  /**
   * Evaluates an individual AI validation case against grounding and clinical fidelity.
   */
  public async recordEvaluationCase(
    studyId: string,
    clinicalContext: string,
    expectedClinicalOutput: string,
    observedModelOutput: string,
    outcome: AIValidationCase['outcome'],
    errorTaxonomy: AIValidationCase['errorTaxonomy'] = [],
    reviewerNotes: string
  ): Promise<AIValidationCase> {
    const caseId = `aicase_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Hard Invariant Enforcement: AI must mandate review and forbid autonomous mutation
    V22_INVARIANTS.assertNoAutonomousAIClinicalMutation(true, false);

    const valCase: AIValidationCase = {
      caseId,
      studyId,
      promptVersion: 'V22_CLINICAL_ADVISORY_PROMPT_V1',
      clinicalContext,
      expectedClinicalOutput,
      observedModelOutput,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
      outcome,
      errorTaxonomy,
      reviewerNotes,
    };

    await idbEngine.put('aiEvaluationCases', valCase);

    // Update study metrics
    const study = await idbEngine.get<AIValidationStudy>('aiValidationStudies', studyId);
    if (study) {
      study.cases.push(valCase);
      study.summaryMetrics.totalCases++;
      if (outcome === 'PASS') {
        study.summaryMetrics.passedCases++;
      }
      if (errorTaxonomy?.includes('FACTUAL_UNGROUNDED')) {
        study.summaryMetrics.hallucinationsDetected++;
      }
      study.summaryMetrics.factualGroundingScore = Math.round(
        ((study.summaryMetrics.totalCases - study.summaryMetrics.hallucinationsDetected) /
          study.summaryMetrics.totalCases) *
          100
      );
      study.summaryMetrics.clinicalFidelityScore = Math.round(
        (study.summaryMetrics.passedCases / study.summaryMetrics.totalCases) * 100
      );
      if (study.summaryMetrics.totalCases >= 5 && study.summaryMetrics.clinicalFidelityScore >= 90) {
        study.status = 'VALIDATED';
      }
      await idbEngine.put('aiValidationStudies', study);
    }

    return valCase;
  }

  /**
   * Records a clinician's explicit human action on an AI suggestion.
   * Actions: ACCEPT, REJECT, DEFER, MODIFY, ANNOTATE, ESCALATE.
   */
  public async recordClinicianOverride(
    suggestionId: string,
    clinicianId: string,
    decision: 'ACCEPT' | 'REJECT' | 'DEFER' | 'MODIFY' | 'ANNOTATE' | 'ESCALATE',
    clinicalRationale: string
  ): Promise<{ decisionRecorded: boolean; independentAttribution: string }> {
    const record = {
      resultId: `ai_override_${Date.now()}`,
      suggestionId,
      clinicianId,
      decision,
      clinicalRationale,
      decidedAt: new Date().toISOString(),
      isHumanAutonomousAction: true,
    };

    await idbEngine.put('aiEvaluationResults', record);
    return {
      decisionRecorded: true,
      independentAttribution: `Clinician ${clinicianId} formally recorded ${decision}: ${clinicalRationale}`,
    };
  }
}

export const aiValidationEvaluationService = AIValidationEvaluationService.getInstance();
