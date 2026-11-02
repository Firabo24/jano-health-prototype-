/**
 * Jano Health - Clinical Core V10: AI Intelligence & Decision Support Domain Types
 * 
 * Defines aggregates, schemas, value objects, and operational models for:
 * 1. AIRequest: Governed AI assist requisition with actor, facility, and task metadata.
 * 2. AIResponse: Structured, validated model output with provenance and review metadata.
 * 3. AIReview: Explicit human clinician evaluation, decision, and audit record.
 * 4. AITaskPolicy: Declarative safety, role, data scope, and mutation prohibition rules.
 * 5. Structured Task Output Schemas: Task-specific contracts for summarization, differential, etc.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * - Jano AI is a controlled clinical decision-support and information-intelligence layer.
 * - This is NOT an autonomous clinician.
 * - This is NOT an AI prescribing system.
 * - This is NOT an AI diagnosis engine.
 * - AI output ≠ clinical fact.
 * - AI suggestion ≠ diagnosis.
 * - AI suggestion ≠ prescription.
 * - AI suggestion ≠ triage.
 * - AI suggestion ≠ clinical order.
 * - AI suggestion ≠ signed documentation.
 * - Autonomous mutation is strictly runtime-prohibited (isAutonomousMutationAllowed = false).
 * - Clinician review is mandatory (clinicianReviewRequired = true).
 */

import { RoleType, ProvenanceRecord } from './types';

export const PRIMARY_MODEL = 'gemini-3.8-flash';
export const FALLBACK_MODEL = 'gemini-3.7-flash';

/**
 * Initial 9 governed AI capabilities.
 */
export type AICapability =
  | 'ai.chart_summary'
  | 'ai.encounter_summary'
  | 'ai.clinical_documentation'
  | 'ai.differential_support'
  | 'ai.clinical_question'
  | 'ai.missing_information'
  | 'ai.referral_summary'
  | 'ai.medication_safety_support'
  | 'ai.patient_education'
  | 'population.summary'
  | 'population.signal.explain'
  | 'population.trend.interpret'
  | 'facility.performance.summary'
  | 'referral.network.summary'
  | 'supply.forecast.explain'
  | 'data.quality.explain'
  | 'public.health.brief'
  | 'identity.reconciliation.explain'
  | 'consent.summary'
  | 'consent.audit.summary'
  | 'coverage.summary'
  | 'claim.validation.explain'
  | 'financial.exception.summary'
  | 'financing.report.draft'
  | 'workforce.summary'
  | 'workforce.workload.explain'
  | 'handover.summary'
  | 'task.priority.suggest'
  | 'staffing.gap.explain'
  | 'roster.recommend'
  | 'procurement.summary'
  | 'supply.risk.explain'
  | 'replenishment.explain'
  | 'supplier.performance.summary'
  | 'shipment.delay.explain'
  | 'cold_chain.exception.summary'
  | 'procurement.report.draft'
  | 'demand_forecast.explain'
  | 'research.question.refine'
  | 'research.cohort.explain'
  | 'research.dataset.summary'
  | 'research.data_quality.explain'
  | 'evidence.summary'
  | 'evidence.compare'
  | 'evidence.synthesis.draft'
  | 'literature.citation.check'
  | 'study_protocol.summary'
  | 'quality_improvement.summary'
  | 'learning_report.draft'
  | 'ecosystem.report.validate'
  | 'ecosystem.report.draft'
  | 'ecosystem.mapping.explain'
  | 'ecosystem.identity.explain'
  | 'ecosystem.facility_match.explain'
  | 'ecosystem.surveillance.explain'
  | 'system.health.explain'
  | 'system.risk.explain'
  | 'system.incident.summarize'
  | 'system.playbook.draft'
  | 'system.optimization.propose'
  | 'system.simulation.explain';

/**
 * AI Service availability and failure states.
 */
export type AIServiceStatus =
  | 'AI_AVAILABLE'
  | 'AI_DEGRADED'
  | 'AI_UNAVAILABLE'
  | 'AI_VALIDATION_FAILED'
  | 'AI_UNAUTHORIZED'
  | 'AI_CONTEXT_UNAVAILABLE'
  | 'AI_KNOWLEDGE_UNAVAILABLE'
  | 'AI_CLOUD_UNAVAILABLE';

/**
 * AI Output Safety Status.
 */
export type AISafetyStatus =
  | 'PASSED'
  | 'MUTATION_BLOCKED'
  | 'PROMPT_INJECTION_DETECTED'
  | 'VALIDATION_FAILED'
  | 'REJECTED'
  | 'SAFE_FOR_REVIEW';

/**
 * AI Clinician Review Status State Machine.
 */
export type AIReviewStatus =
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'INSERTED_INTO_DRAFT'
  | 'STALE_CONTEXT';

/**
 * Source reference tracing clinical assertions back to authoritative records.
 */
export interface AISourceReference {
  sourceType: 'PATIENT' | 'ENCOUNTER' | 'VITAL_SIGN' | 'PROBLEM' | 'DIAGNOSIS' | 'LAB_RESULT' | 'RADIOLOGY_REPORT' | 'MEDICATION' | 'REFERRAL' | 'EMERGENCY_CASE' | 'GUIDELINE';
  sourceId: string;
  sourceDate: string;
  sourceVersion?: string | number;
  description?: string;
}

/**
 * AI Provenance metadata.
 */
export interface AIProvenance {
  requestId?: string;
  model?: string;
  modelVersion?: string;
  provider?: 'gemini_cloud' | 'local_deterministic_rules' | 'future_local_model';
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  taskType?: AICapability;
  generatedAt?: string;
  sourceRecordIds?: string[];
  knowledgeSourceIds?: string[];
  safetyPolicyVersion?: string;
  authorizationContextId?: string;
  reviewStatus?: AIReviewStatus;
  isDeterministicFallback?: boolean;
  recordedAt?: string;
  recordedById?: string;
  facilityId?: string;
}

/**
 * Base structured clinical AI response.
 * All task responses extend or satisfy this core contract.
 */
export interface AIClinicalResponse {
  requestId: string;
  taskType: AICapability;
  model: string;
  modelVersion: string;
  summary: string;
  findings: string[];
  considerations: AIConsideration[];
  redFlags: string[];
  missingInformation: string[];
  uncertainty: string[];
  suggestedNextSteps: string[];
  sourceReferences: AISourceReference[];
  provenance: AIProvenance;
  safetyStatus: AISafetyStatus;
  reviewStatus: AIReviewStatus;
  isAutonomousMutationAllowed: false;
  clinicianReviewRequired: true;
  clinicianApproved: boolean;
  generatedAt: string;
  disclaimer: string;
}

export interface AIConsideration {
  label: string;
  supportingEvidence: string[];
  contradictoryOrMissingEvidence: string[];
  uncertainty: string;
  provenance: string;
}

// -------------------------------------------------------------
// TASK-SPECIFIC OUTPUT SCHEMAS
// -------------------------------------------------------------

export interface ChartSummaryResponse extends AIClinicalResponse {
  taskType: 'ai.chart_summary';
  majorPatientHistory: string[];
  recentEncountersSummary: string;
  activeProblemsSummary: string[];
  activeMedicationsSummary: string[];
  recentKeyResults: string[];
  allergiesSummary: string[];
  recentEmergencyHistory?: string;
}

export interface EncounterSummaryResponse extends AIClinicalResponse {
  taskType: 'ai.encounter_summary';
  presentationSummary: string;
  significantObservations: string[];
  assessmentSynthesis: string;
  planOutline: string[];
  unresolvedIssues: string[];
}

export interface DifferentialSupportResponse extends AIClinicalResponse {
  taskType: 'ai.differential_support';
  diagnosticConsiderations: Array<{
    diagnosisText: string;
    icd10OrConceptCode?: string;
    supportingFindings: string[];
    contradictoryFindings: string[];
    riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
    suggestedConfirmatoryTests: string[];
    uncertaintyAssessment: string;
  }>;
}

export interface ClinicalQuestionResponse extends AIClinicalResponse {
  taskType: 'ai.clinical_question';
  question: string;
  directAnswer: string;
  clinicalEvidence: string[];
  limitationsAndCaveats: string[];
}

export interface DocumentationAssistResponse extends AIClinicalResponse {
  taskType: 'ai.clinical_documentation';
  draftSection: 'SUBJECTIVE' | 'OBJECTIVE' | 'ASSESSMENT' | 'PLAN' | 'DISCHARGE_SUMMARY' | 'REFERRAL_LETTER';
  draftText: string;
  clinicianGuidance: string;
  isDraftOnly: true;
}

export interface ReferralSummaryResponse extends AIClinicalResponse {
  taskType: 'ai.referral_summary';
  referringSummary: string;
  keyDiagnosesAndHistory: string[];
  vitalTrendsSummary: string;
  relevantLabsAndImaging: string[];
  urgencyRationale: string;
  recommendedReceivingSpecialty: string;
}

export interface MedicationSafetySupportResponse extends AIClinicalResponse {
  taskType: 'ai.medication_safety_support';
  evaluatedRegimen: string[];
  knownAllergies: string[];
  detectedInteractions: Array<{
    drugsInvolved: string[];
    severity: 'CONTRAINDICATED' | 'HIGH_RISK' | 'MODERATE_CAUTION';
    clinicalAdvisory: string;
    guidelineSource: string;
  }>;
  duplicateTherapies: string[];
  organFunctionAlerts: string[];
}

export interface PatientEducationResponse extends AIClinicalResponse {
  taskType: 'ai.patient_education';
  topic: string;
  language: string;
  readingLevel: 'BASIC' | 'INTERMEDIATE';
  plainLanguageExplanation: string;
  selfCareInstructions: string[];
  dangerSignsToSeekCare: string[];
  lifestyleAdvisories: string[];
}

// -------------------------------------------------------------
// GOVERNANCE & POLICY MODELS
// -------------------------------------------------------------

export interface AITaskPolicy {
  taskType: AICapability;
  requiresPatientContext: boolean;
  requiresEncounterContext: boolean;
  allowedRoles: RoleType[];
  allowedCapabilities: string[];
  allowedDataSources: string[];
  offlineAllowed: boolean;
  modelPolicy: string;
  reviewRequired: true;
  mutationAllowed: false; // Runtime invariant
}

export interface PromptTemplate {
  templateId: string;
  version: string;
  taskType: AICapability;
  createdAt: string;
  status: 'ACTIVE' | 'DEPRECATED';
  systemInstruction: string;
  templateText: string;
}

export interface AIKnowledgeReference {
  source: string;
  title: string;
  version: string;
  jurisdiction: string;
  effectiveDate: string;
  reference: string;
  isAuthoritative: boolean;
}

export interface AIRequest {
  id: string;
  requestId?: string; // Deterministic identifier (e.g. air-fac-...)
  actorId?: string;
  actorRole?: RoleType;
  actorName?: string;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  taskType?: AICapability;
  capability?: AICapability;
  clinicianId?: string;
  clinicianName?: string;
  clinicianRole?: RoleType;
  inputDataSummary?: string;
  requestedAt?: string;
  disclaimerAcknowledged?: boolean;
  clinicianReviewRequired?: boolean;
  isAutonomousMutationAllowed?: boolean;
  model?: string;
  promptTemplateId?: string;
  promptTemplateVersion?: string;
  contextReferences?: Array<{ type: string; id: string; version?: number }>;
  contextFingerprint?: string;
  createdAt?: string;
  status: 'COMPLETED' | 'FAILED' | 'REJECTED' | 'BLOCKED';
  reviewStatus?: AIReviewStatus;
  provenance: AIProvenance;
}

export interface AIResponse {
  id: string;
  requestId: string;
  responseId?: string;
  capability?: AICapability;
  model?: string;
  modelVersion?: string;
  modelUsed?: string;
  generatedContent?: string;
  generatedAt?: string;
  structuredPayload?: AIClinicalResponse;
  structuredOutput?: Record<string, any>;
  validationFindings?: any[];
  citationSources?: string[];
  provenance?: AIProvenance;
  integrityHash?: string;
  safetyStatus: AISafetyStatus;
  validationStatus?: 'VALID' | 'INVALID';
  clinicianReviewRequired?: true;
  clinicianApproved?: boolean;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  createdAt?: string;
}

export interface AIReview {
  id: string;
  requestId: string;
  responseId: string;
  reviewedById: string;
  reviewedByName: string;
  reviewedByRole: RoleType;
  facilityId: string;
  reviewedAt: string;
  action: 'ACCEPT' | 'REJECT' | 'EDIT' | 'INSERT_INTO_DRAFT';
  clinicianNotes?: string;
  draftTarget?: string; // e.g. 'SOAP_ASSESSMENT' | 'SOAP_PLAN' | 'REFERRAL_NOTES'
  resultingDraftText?: string;
}
