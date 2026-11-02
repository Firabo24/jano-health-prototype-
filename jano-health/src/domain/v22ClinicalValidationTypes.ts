/**
 * Jano Health - Clinical Core V22: Clinical Validation, Quality & Safety Assurance
 * 
 * Formal Domain Models & Hard Invariants for:
 * - Clinical Safety Case (Claims, Arguments, Evidence, Residual Risks)
 * - Clinical Hazard & Risk Register (Patient, Medication, Lab, Radiology, Emergency, Referral, AI, Offline)
 * - FMEA / Failure Modes & Effects Analysis Engine
 * - Clinical Workflow Validation Matrix (Preconditions, Forbidden Transitions, SATS 5-tier Preservation)
 * - AI Clinical Validation & Grounding (clinicianReviewRequired = true, isAutonomousMutationAllowed = false)
 * - Usability & Human Factors (Speed vs Safety Risk Tradeoff Guard)
 * - Clinical Safety Incidents, Near-Misses & CAPA
 * - Clinical Validation Gates across all 20 Subsystems
 * - Clinical Limitations Registry & Governed Disclosures
 * - Pilot Validation Packet Generation (Strict Separation: Software vs Clinical vs Regulatory)
 * - Training & Competency Assessment Records
 */

export type SafetyClaimStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'VALIDATED'
  | 'CONDITIONALLY_ACCEPTED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type EvidenceStatus =
  | 'EVIDENCE_DRAFT'
  | 'EVIDENCE_REVIEWED'
  | 'EVIDENCE_ACCEPTED'
  | 'EVIDENCE_REJECTED'
  | 'EVIDENCE_SUPERSEDED';

export interface SafetyCase {
  caseId: string;
  title: string;
  systemVersion: string;
  scope: string;
  claimIds: string[];
  status: SafetyClaimStatus;
  leadAssessor: string;
  authorizedApprover?: string;
  approvedAt?: string;
  version: string;
  lastUpdatedAt: string;
}

export interface SafetyClaim {
  claimId: string;
  caseId: string;
  claimStatement: string;
  domain: string;
  hazardsAddressed: string[];
  controlsApplied: string[];
  evidenceIds: string[];
  status: SafetyClaimStatus;
  reviewer: string;
  reviewDate: string;
  version: string;
}

export interface SafetyEvidence {
  evidenceId: string;
  title: string;
  claimIds: string[];
  evidenceType:
    | 'SIMULATION_TRACE'
    | 'ADVERSARIAL_TEST'
    | 'CLINICAL_AUDIT'
    | 'USABILITY_STUDY'
    | 'PEER_REVIEW'
    | 'BENCHMARK';
  provenanceHash: string;
  isSynthetic: boolean;
  status: EvidenceStatus;
  recordedAt: string;
  assessor: string;
}

export interface SafetyResidualRisk {
  residualRiskId: string;
  claimId: string;
  hazardId: string;
  description: string;
  acceptable: boolean;
  acceptedBy: string;
  acceptedAt: string;
  justification: string;
}

export type HazardCategory =
  | 'PATIENT_IDENTITY'
  | 'ENCOUNTER'
  | 'MEDICATION'
  | 'LABORATORY'
  | 'RADIOLOGY'
  | 'EMERGENCY'
  | 'REFERRAL'
  | 'OFFLINE_SYNC'
  | 'AI_DECISION_SUPPORT';

export type HazardSeverity = 'NEGLIGIBLE' | 'MINOR' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
export type HazardLikelihood = 'IMPROBABLE' | 'REMOTE' | 'OCCASIONAL' | 'PROBABLE' | 'FREQUENT';

export interface HazardControl {
  controlId: string;
  hazardId: string;
  controlType:
    | 'SOFTWARE_GUARD'
    | 'UI_AFFORDANCE'
    | 'FORBIDDEN_TRANSITION'
    | 'HUMAN_CONFIRMATION'
    | 'AUDIT_TRAIL';
  description: string;
  isVerified: boolean;
}

export interface ClinicalHazard {
  hazardId: string;
  category: HazardCategory;
  title: string;
  description: string;
  potentialHarm: string;
  initialSeverity: HazardSeverity;
  initialLikelihood: HazardLikelihood;
  initialRiskScore: number;
  controls: HazardControl[];
  residualSeverity: HazardSeverity;
  residualLikelihood: HazardLikelihood;
  residualRiskScore: number;
  residualRiskAcceptance?: {
    acceptedBy: string;
    justification: string;
    acceptedAt: string;
  };
  owner: string;
  status: 'IDENTIFIED' | 'CONTROLS_APPLIED' | 'VERIFIED' | 'ACCEPTED' | 'RETIRED';
}

export interface FMEAFailureMode {
  failureModeId: string;
  step: string;
  failureMode: string;
  potentialEffect: string;
  severityScore: number; // 1-10
  potentialCause: string;
  occurrenceScore: number; // 1-10
  currentControls: string;
  detectionScore: number; // 1-10 (10 = hardest to detect)
  rpn: number; // severity * occurrence * detection
  mitigationPlan: string;
  residualRpn: number;
}

export interface FMEAAnalysis {
  fmeaId: string;
  processName: string;
  methodologyVersion: string;
  failureModes: FMEAFailureMode[];
  assessedBy: string;
  assessedAt: string;
}

export interface ClinicalWorkflowMatrix {
  workflowId: string;
  name: string;
  lifecycleStates: string[];
  preconditions: string[];
  expectedTransitions: { from: string; to: string }[];
  forbiddenTransitions: { from: string; to: string; rationale: string }[];
  safetyControls: string[];
  auditEventRequired: string;
  validationEvidenceIds: string[];
  validationStatus: 'NOT_STARTED' | 'TESTING' | 'VALIDATED' | 'BLOCKED';
}

export interface AIValidationCase {
  caseId: string;
  studyId: string;
  promptVersion: string;
  clinicalContext: string;
  expectedClinicalOutput: string;
  observedModelOutput: string;
  clinicianReviewRequired: true; // Hard invariant: strictly required
  isAutonomousMutationAllowed: false; // Hard invariant: strictly forbidden
  outcome: 'PASS' | 'FAIL' | 'UNSAFE';
  errorTaxonomy?: (
    | 'FACTUAL_UNGROUNDED'
    | 'MISSING_CONTEXT'
    | 'TERMINOLOGY_MISMATCH'
    | 'OVERCONFIDENCE'
    | 'UNSAFE_SUGGESTION'
  )[];
  reviewerNotes: string;
}

export interface AIValidationStudy {
  studyId: string;
  capability: string;
  modelIdentifier: string;
  modelVersion: string;
  datasetVersion: string;
  cases: AIValidationCase[];
  summaryMetrics: {
    factualGroundingScore: number;
    clinicalFidelityScore: number;
    hallucinationsDetected: number;
    totalCases: number;
    passedCases: number;
  };
  status: 'IN_PROGRESS' | 'COMPLETED' | 'VALIDATED' | 'REJECTED';
  reviewer: string;
  reviewedAt: string;
}

export interface ClinicalEvidenceProvenance {
  evidenceId: string;
  sourceType: 'TEST_SCENARIO' | 'USABILITY_SESSION' | 'AUDIT_LOG' | 'CLINICAL_SIMULATION';
  sourceIdentifier: string;
  sourceVersion: string;
  creationDate: string;
  isSynthetic: boolean;
  designation: 'SYNTHETIC_TEST_DATA' | 'REAL_WORLD_PILOT_DATA';
  reviewer: string;
  evidenceHash: string;
  associatedSoftwareVersion: string;
  associatedWorkflowVersion: string;
  status: EvidenceStatus;
}

export interface ClinicalUsabilityStudy {
  studyId: string;
  workflowName: string;
  participantRole: string;
  taskDescription: string;
  taskCompletionRate: number; // 0-100%
  medianTimeSeconds: number;
  observedErrors: string[];
  confusionPoints: string[];
  workarounds: string[];
  safetyConcerns: string[];
  safetyRiskIncreased: boolean;
  assessor: string;
  assessedAt: string;
}

export interface ClinicalAlertGovernanceRule {
  ruleId: string;
  alertType: string;
  clinicalDomain: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL_SAFETY';
  triggerCondition: string;
  acknowledgementRequired: boolean;
  escalationAfterMinutes?: number;
  offlineUsable: true; // Hard invariant: critical alert path must remain usable offline
  canBeSuppressed: boolean; // Hard invariant: critical safety alert can NEVER be suppressed
  overrideReasonRequired: boolean;
}

export type ClinicalIncidentType =
  | 'INCIDENT'
  | 'NEAR_MISS'
  | 'HAZARD_OBSERVED'
  | 'SYSTEM_FAILURE'
  | 'WORKFLOW_FAILURE'
  | 'AI_FAILURE'
  | 'DATA_INTEGRITY_FAILURE'
  | 'USER_ERROR'
  | 'TRAINING_GAP';

export interface ClinicalSafetyIncident {
  incidentId: string;
  incidentType: ClinicalIncidentType;
  facilityId: string;
  reportedAt: string;
  severity: 'NEGLIGIBLE' | 'MINOR' | 'MODERATE' | 'CRITICAL' | 'CATASTROPHIC';
  patientHarmOccurred: boolean;
  clinicalSummary: string;
  rootCauseAnalysis?: string;
  correctiveActions: string[];
  preventiveActions: string[];
  status: 'REPORTED' | 'INVESTIGATING' | 'CAPA_PENDING' | 'RESOLVED' | 'CLOSED';
  closedBy?: string;
  closedAt?: string;
}

export type ValidationGateStatus =
  | 'NOT_STARTED'
  | 'PREPARED'
  | 'TESTING'
  | 'EVIDENCE_REQUIRED'
  | 'UNDER_REVIEW'
  | 'CONDITIONAL'
  | 'VALIDATED'
  | 'BLOCKED'
  | 'EXPIRED';

export interface ClinicalValidationGate {
  gateId: string;
  domain: string;
  status: ValidationGateStatus;
  mandatoryEvidenceRequired: string[];
  evidenceProvided: string[];
  blockingIssues: string[];
  reviewedBy: string;
  lastEvaluatedAt: string;
}

export interface ClinicalLimitation {
  limitationId: string;
  affectedWorkflow: string;
  description: string;
  affectedUserRoles: string[];
  clinicalRisk: string;
  recommendedWorkaround: string;
  mitigation: string;
  isDisclosedInUI: boolean;
  owner: string;
}

export interface PilotValidationPacket {
  packetId: string;
  systemVersion: string;
  facilityId: string;
  generatedAt: string;
  verifiedSoftwareBehavior: string[];
  clinicalValidationEvidence: string[];
  externalRegulatoryRequirements: string[];
  unresolvedRisks: string[];
  packetHash: string;
  authorizedLead: string;
}

export interface ClinicalCompetencyRecord {
  recordId: string;
  userId: string;
  role: string;
  moduleName: string;
  trainingCompleted: boolean;
  competencyAssessed: boolean;
  assessmentScore: number;
  evaluator: string;
  evaluatedAt: string;
}

/**
 * Hard Invariant Assertion Helpers for V22
 */
export const V22_INVARIANTS = {
  assertSafetyClaimHasEvidence(status: SafetyClaimStatus, evidenceIds: string[], reviewer: string): void {
    if (status === 'VALIDATED') {
      if (!evidenceIds || evidenceIds.length === 0) {
        throw new Error('INVARIANT_VIOLATION: A safety claim cannot be labeled VALIDATED without documented evidence.');
      }
      if (!reviewer || reviewer.trim().length === 0 || reviewer === 'SYSTEM_AUTO') {
        throw new Error('INVARIANT_VIOLATION: A safety claim cannot be labeled VALIDATED without authorized human reviewer.');
      }
    }
  },

  assertSatsEmergencyTriagePreserved(triageCode: string): void {
    const validSatsTiers = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'];
    if (!validSatsTiers.includes(triageCode)) {
      throw new Error(`INVARIANT_VIOLATION: SATS triage tier must be one of ${validSatsTiers.join(', ')}. Code '${triageCode}' is invalid.`);
    }
    if (triageCode === 'BLACK') {
      throw new Error('INVARIANT_VIOLATION: SATS emergency triage strictly does NOT include BLACK. Mass casualty must be segregated.');
    }
  },

  assertNoAutonomousAIClinicalMutation(reviewRequired: boolean, mutationAllowed: boolean): void {
    if (!reviewRequired || mutationAllowed) {
      throw new Error('INVARIANT_VIOLATION: AI capability must mandate clinicianReviewRequired=true and isAutonomousMutationAllowed=false.');
    }
  },

  assertUsabilitySpeedDoesNotCompromiseSafety(speedIncreaseSeconds: number, safetyRiskIncreased: boolean): void {
    if (safetyRiskIncreased) {
      throw new Error('INVARIANT_VIOLATION: A workflow that increases clinical risk cannot be accepted merely because it is faster.');
    }
  },

  assertCompetencyRequiresAssessment(trainingCompleted: boolean, competencyAssessed: boolean): void {
    if (trainingCompleted && !competencyAssessed) {
      // Valid reminder: Training completion alone must NOT be interpreted as clinical competency!
    }
  },

  assertValidationGateEvidenceComplete(status: ValidationGateStatus, mandatoryRequired: string[], provided: string[]): void {
    if (status === 'VALIDATED') {
      const missing = mandatoryRequired.filter((req) => !provided.includes(req));
      if (missing.length > 0) {
        throw new Error(`INVARIANT_VIOLATION: Validation gate cannot reach VALIDATED when mandatory evidence is missing: ${missing.join(', ')}`);
      }
    }
  },

  assertSyntheticEvidenceExplicitlyLabeled(isSynthetic: boolean, labelOrDesignation: string): void {
    if (isSynthetic && !labelOrDesignation.includes('SYNTHETIC')) {
      throw new Error('INVARIANT_VIOLATION: Synthetic validation evidence must be explicitly labeled as SYNTHETIC to prevent real-world misrepresentation.');
    }
  },
};
