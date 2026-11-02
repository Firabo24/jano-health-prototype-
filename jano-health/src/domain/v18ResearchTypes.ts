/**
 * Jano Health - Clinical Core V18: Research, Evidence & Learning Infrastructure
 * 
 * Formal Domain Model & Types for Healthcare Research, Evidence Synthesis & Institutional Learning.
 * 
 * ABSOLUTE ARCHITECTURAL INVARIANTS:
 * 1.  Clinical Record ≠ Research Dataset
 * 2.  Clinical Consent ≠ Research Consent
 * 3.  Research Consent ≠ Authorization
 * 4.  Research Subject ≠ Patient Record
 * 5.  Research Cohort ≠ Clinical Cohort
 * 6.  Research Dataset ≠ Population Dashboard
 * 7.  Evidence ≠ Clinical Guideline
 * 8.  Evidence ≠ Diagnosis
 * 9.  Research Finding ≠ Clinical Decision
 * 10. Study Protocol ≠ Clinical Workflow
 * 11. Study Visit ≠ Encounter
 * 12. Research Event ≠ Clinical Event
 * 13. Research Outcome ≠ Clinical Observation
 * 14. De-identified Dataset ≠ Patient Chart
 * 15. Pseudonymized Dataset ≠ Anonymous Dataset
 * 16. AI Literature Summary ≠ Evidence Certification
 * 17. AI Research Recommendation ≠ Clinical Order
 * 18. Research Approval ≠ Clinical Approval
 * 19. Data Access Approval ≠ Research Consent
 * 20. Study Closure ≠ Data Deletion
 * 21. FHIR Research Resource ≠ Internal Research Domain
 * 22. SHA-256 Integrity ≠ Legal Digital Signature
 * 23. Unavailable Evidence Source ≠ Fabricated Evidence
 * 24. No Data ≠ Zero ≠ Suppressed
 * 25. Withdrawn Consent ≠ Historical Data Erasure
 */

// ============================================================================
// 1. RESEARCH STUDY & PROTOCOL
// ============================================================================

export type ResearchStudyStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'COMPLETED'
  | 'TERMINATED'
  | 'RETIRED';

export type ResearchStudyType =
  | 'retrospective'
  | 'prospective'
  | 'observational'
  | 'interventional'
  | 'clinical_trial'
  | 'implementation_research'
  | 'quality_improvement'
  | 'operational_research'
  | 'public_health_research'
  | 'evidence_synthesis'
  | 'other';

export type ClinicalTrialPhase =
  | 'PHASE_1'
  | 'PHASE_2'
  | 'PHASE_3'
  | 'PHASE_4'
  | 'NOT_APPLICABLE';

export interface ResearchStudy {
  researchStudyId: string;
  canonicalIdentifier: string;
  title: string;
  shortTitle: string;
  description: string;
  studyType: ResearchStudyType;
  phase?: ClinicalTrialPhase;
  sponsorReference?: string;
  principalInvestigator: string; // references V16 workforceMemberId
  organizations: string[];
  studySites: string[]; // references studySiteId[]
  objective: string;
  eligibilityCriteriaReference?: string;
  protocolReference: string; // references active protocolId
  plannedPeriod: {
    startDate: string;
    endDate?: string;
  };
  actualPeriod?: {
    startDate?: string;
    endDate?: string;
  };
  status: ResearchStudyStatus;
  version: number;
  provenance: {
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export interface StudyProtocol {
  protocolId: string;
  studyId: string;
  version: number;
  title: string;
  objectives: string[];
  design: {
    studyType: ResearchStudyType;
    allocation?: 'RANDOMIZED' | 'NON_RANDOMIZED' | 'OBSERVATIONAL';
    masking?: 'OPEN_LABEL' | 'SINGLE_BLIND' | 'DOUBLE_BLIND' | 'NOT_APPLICABLE';
    control?: 'PLACEBO' | 'ACTIVE_COMPARATOR' | 'HISTORICAL' | 'NO_INTERVENTION' | 'NOT_APPLICABLE';
  };
  populationCriteria: {
    inclusion: string[];
    exclusion: string[];
    targetSampleSize: number;
    minimumAgeYears?: number;
    maximumAgeYears?: number;
    genderRestriction?: 'ANY' | 'FEMALE' | 'MALE';
  };
  interventionReference?: {
    type: 'DRUG' | 'DEVICE' | 'PROCEDURE' | 'BEHAVIORAL' | 'QUALITY_IMPROVEMENT' | 'OTHER';
    name: string;
    description: string;
  };
  endpoints: {
    primary: string[];
    secondary: string[];
    exploratory?: string[];
  };
  statisticalAnalysisPlanReference?: string;
  dataCollectionPlan: string;
  safetyPlan: string;
  privacyPlan: string;
  retentionPlan: string;
  approvalReferences: string[]; // references researchApprovalId[]
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'RETIRED';
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export interface ProtocolVersion {
  versionId: string;
  protocolId: string;
  studyId: string;
  versionNumber: number;
  priorVersionId?: string;
  successorVersionId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  approvalReference: string;
  reasonForChange: string;
  actor: string;
  timestamp: string;
  protocolSnapshot: StudyProtocol;
  integrityHash: string;
}

// ============================================================================
// 2. GOVERNANCE, APPROVALS & POLICIES
// ============================================================================

export type ApprovalCategory =
  | 'INTERNAL_SCIENTIFIC_REVIEW'
  | 'ETHICS_REVIEW'
  | 'INSTITUTIONAL_REVIEW'
  | 'DATA_ACCESS_APPROVAL'
  | 'STUDY_SITE_APPROVAL'
  | 'SAFETY_REVIEW'
  | 'PUBLICATION_APPROVAL';

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED';

export interface ResearchApproval {
  approvalId: string;
  studyId: string;
  category: ApprovalCategory;
  committeeName: string;
  referenceNumber: string;
  status: ApprovalStatus;
  conditions?: string[];
  approvedBy: string;
  decisionDate: string;
  expiryDate?: string;
  revokedAt?: string;
  revocationReason?: string;
  notes?: string;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

export interface ResearchGovernancePolicy {
  policyId: string;
  version: number;
  name: string;
  allowedStudyTypes: ResearchStudyType[];
  requiredApprovalTypes: ApprovalCategory[];
  minimumConsentRequirements: ResearchConsentPurpose[];
  allowedDataCategories: string[];
  minimumCohortSize: number; // default small cell threshold N=5
  deIdentificationRequirements: {
    directIdentifierRemoval: boolean;
    pseudonymizationRequired: boolean;
    dateShiftingAllowed: boolean;
    geographicGeneralizationLevel: 'NONE' | 'DISTRICT' | 'REGION' | 'COUNTRY';
  };
  retentionRules: {
    defaultRetentionYears: number;
    requireConsentBasedRetention: boolean;
    archivalRequired: boolean;
  };
  externalSharingRules: {
    allowed: boolean;
    requiresSpecificConsent: boolean;
    requiresBilateralAgreement: boolean;
  };
  publicationRules: {
    requiresPriorReview: boolean;
    aggregateOnly: boolean;
  };
  accessReviewFrequencyDays: number;
  effectiveDate: string;
  auditTrail: {
    changedBy: string;
    changedAt: string;
    reason: string;
  }[];
}

export interface StudySite {
  studySiteId: string;
  studyId: string;
  facilityId: string; // references V1/V16 facilityId
  organizationId: string;
  principalInvestigator: string; // V16 workforceMemberId
  siteStatus: 'INITIATING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  activationDate?: string;
  closureDate?: string;
  approvedScopes: string[];
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export type StudyRole =
  | 'PRINCIPAL_INVESTIGATOR'
  | 'CO_INVESTIGATOR'
  | 'RESEARCH_COORDINATOR'
  | 'DATA_MANAGER'
  | 'STATISTICIAN'
  | 'STUDY_NURSE'
  | 'STUDY_PHARMACIST'
  | 'LABORATORY_INVESTIGATOR'
  | 'MONITOR'
  | 'REVIEWER'
  | 'DATA_ACCESS_STEWARD';

export interface StudyTeamMember {
  studyTeamMemberId: string;
  studyId: string;
  workforceMemberId: string; // References V16 WorkforceMember
  role: StudyRole;
  scope: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'RESIGNED' | 'COMPLETED';
  provenance: {
    assignedAt: string;
    assignedBy: string;
  };
}

// ============================================================================
// 3. PARTICIPANTS, SUBJECTS & RESEARCH CONSENT
// ============================================================================

export type ResearchSubjectStatus =
  | 'SCREENING'
  | 'ELIGIBLE'
  | 'INELIGIBLE'
  | 'ENROLLED'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'WITHDRAWN'
  | 'COMPLETED'
  | 'LOST_TO_FOLLOW_UP'
  | 'DECEASED'
  | 'RETIRED';

export interface ResearchSubject {
  researchSubjectId: string;
  studyId: string;
  patientReference: string; // Source clinical patient identity (Patient.id)
  studySpecificIdentifier: string; // e.g. "SUBJ-AMGH-0042"
  studyPseudonym: string; // Cryptographic deterministic study-scoped pseudonym
  status: ResearchSubjectStatus;
  enrollmentDate?: string;
  withdrawalDate?: string;
  withdrawalReason?: string;
  consentReferences: string[]; // references researchConsentId[]
  siteReference: string; // references studySiteId
  eligibilityStatus: {
    criteriaSatisfied: boolean;
    reviewedBy: string; // authorized human workforceMemberId
    reviewedAt: string;
    notes?: string;
  };
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export interface ResearchEnrollment {
  enrollmentId: string;
  studyId: string;
  researchSubjectId: string;
  enrolledAt: string;
  enrolledBy: string;
  siteId: string;
  consentReference: string;
  protocolVersion: number;
  baselineAssessmentsCompleted: boolean;
}

export type ResearchConsentPurpose =
  | 'STUDY_PARTICIPATION'
  | 'FUTURE_RESEARCH'
  | 'SPECIMEN_USE'
  | 'DATA_REUSE'
  | 'DATA_LINKAGE'
  | 'EXTERNAL_DATA_SHARING'
  | 'GENOMIC_RESEARCH'
  | 'PUBLICATION'
  | 'CONTACT_FOR_FUTURE_STUDIES';

export type ResearchConsentStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'REJECTED';

export interface ResearchConsent {
  researchConsentId: string;
  researchSubjectId: string;
  studyId: string;
  patientReference: string; // V1/V15 clinical identity
  purposes: ResearchConsentPurpose[];
  scope: {
    dataCategories: string[];
    allowSpecimenUse: boolean;
    allowRecontact: boolean;
    allowExternalSharing: boolean;
  };
  consentVersion: number;
  protocolVersion: number;
  grantedAt: string;
  expiresAt?: string;
  withdrawnAt?: string;
  status: ResearchConsentStatus;
  signerReference: {
    actorId: string;
    actorType: 'PATIENT' | 'GUARDIAN' | 'LEGAL_REPRESENTATIVE';
    signerName: string;
  };
  witness?: {
    name: string;
    role: string;
  };
  provenance: {
    recordedAt: string;
    recordedBy: string;
    facilityId: string;
  };
  integrityHash: string;
}

export interface ResearchWithdrawal {
  withdrawalId: string;
  researchSubjectId: string;
  studyId: string;
  patientReference: string;
  withdrawnAt: string;
  withdrawnBy: string;
  reason: string;
  affectedConsentIds: string[];
  actionsEnforced: {
    futureResearchBlocked: boolean;
    futureCollectionStopped: boolean;
    futureSharingBlocked: boolean;
    historicalLegitimateUseAudited: boolean;
    retainedDataGoverned: boolean;
  };
  provenance: {
    createdAt: string;
  };
  integrityHash: string;
}

export interface ResearchMilestone {
  milestoneId: string;
  researchSubjectId: string;
  studyId: string;
  name: string;
  targetDate: string;
  achievedDate?: string;
  status: 'PENDING' | 'ACHIEVED' | 'MISSED' | 'WAIVED';
}

export interface StudyEligibilityCandidate {
  candidateId: string;
  studyId: string;
  patientReference: string;
  status: 'CANDIDATE' | 'REVIEW_REQUIRED' | 'ELIGIBLE' | 'INELIGIBLE' | 'CONTACT_APPROVED' | 'DECLINED';
  matchedCriteria: string[];
  unmatchedCriteria: string[];
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ============================================================================
// 4. RESEARCH COHORTS & DATASETS
// ============================================================================

export interface ResearchCohortDefinition {
  definitionId: string;
  studyId: string;
  name: string;
  version: number;
  criteria: {
    ageRange?: { min?: number; max?: number };
    gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'ANY';
    encounterTypes?: string[];
    diagnosisCodes?: string[];
    laboratoryTests?: { testCode: string; valueRange?: { min?: number; max?: number } }[];
    medications?: string[];
    facilities?: string[];
    dateRange?: { start: string; end: string };
  };
  inclusionRules: string[];
  exclusionRules: string[];
  executionEnvironment: string;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

export interface ResearchCohort {
  cohortId: string;
  studyId: string;
  name: string;
  definitionReference: string; // references definitionId
  sourceDataset?: string;
  version: number;
  rawCount: number;
  count: number | 'SUPPRESSED'; // Small cell suppression if count < threshold
  privacyStatus: 'EXACT' | 'SUPPRESSED' | 'NO_DATA';
  generatedAt: string;
  generatedBy: string;
  approvalReference: string;
  subjectPseudonyms: string[]; // Study-scoped pseudonyms only, no direct patient IDs
  provenance: {
    executionTimestamp: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export type ResearchDatasetType =
  | 'IDENTIFIABLE'
  | 'PSEUDONYMIZED'
  | 'DE_IDENTIFIED'
  | 'AGGREGATED'
  | 'SYNTHETIC';

export type ResearchDatasetStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'REVOKED';

export interface ResearchDataset {
  datasetId: string;
  studyId: string;
  name: string;
  description: string;
  datasetType: ResearchDatasetType;
  sourceSystems: string[];
  cohortReference: string; // references cohortId
  variables: string[];
  transformationPolicy: {
    pseudonymized: boolean;
    dateShiftDays?: number;
    suppressedFields: string[];
    geographicGeneralization?: string;
  };
  privacyMethod: 'DIRECT_REMOVAL' | 'PSEUDONYMIZATION' | 'SAFE_HARBOR_ANONYMIZED' | 'K_ANONYMIZED' | 'DIFFERENTIAL_PRIVACY_READY';
  accessScope: string[];
  retentionPolicy: {
    retentionYears: number;
    expiryDate: string;
  };
  version: number;
  status: ResearchDatasetStatus;
  releaseApprovedBy?: string;
  releaseApprovedAt?: string;
  records: any[]; // de-identified or pseudonymized records
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export interface ResearchDatasetVersion {
  versionId: string;
  datasetId: string;
  versionNumber: number;
  cohortDefinitionId: string;
  transformationHistory: string[];
  generationTime: string;
  responsibleActor: string;
  privacyStatus: string;
  recordCount: number;
  integrityHash: string;
}

export interface DataAccessRequest {
  requestId: string;
  studyId: string;
  requesterId: string; // V16 workforceMemberId
  requesterName: string;
  datasetId: string;
  requestedVariables: string[];
  purpose: string;
  durationDays: number;
  requestedScope: string;
  justification: string;
  consentBasis: string;
  approvalReferences: string[];
  status: 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'DENIED' | 'EXPIRED' | 'REVOKED';
  provenance: {
    createdAt: string;
  };
  integrityHash: string;
}

export interface DataAccessDecision {
  decisionId: string;
  requestId: string;
  studyId: string;
  datasetId: string;
  approverId: string;
  decision: 'APPROVED' | 'PARTIALLY_APPROVED' | 'DENIED';
  scope: string[];
  justification: string;
  conditions?: string[];
  validFrom: string;
  validTo: string;
  timestamp: string;
  provenance: {
    recordedAt: string;
  };
  integrityHash: string;
}

export interface DataUseRecord {
  recordId: string;
  requesterId: string;
  datasetId: string;
  studyId: string;
  purpose: string;
  queryReference?: string;
  accessTime: string;
  dataScope: string[];
  outputType: 'PREVIEW' | 'AGGREGATE' | 'EXPORT_FILE';
  exportState?: 'NONE' | 'DOWNLOADED' | 'EXPIRED';
  approvalReference: string;
  expiryDate: string;
  auditReference: string;
}

export interface ResearchReIdentificationRequest {
  reIdentifyRequestId: string;
  studyId: string;
  requesterId: string; // Must be authorized data-access steward or safety officer
  studyPseudonym: string;
  justification: string;
  purpose: 'SAFETY_EVENT_INVESTIGATION' | 'INCIDENTAL_CRITICAL_FINDING' | 'COURT_ORDER_LEGAL' | 'OTHER_GOVERNED';
  status: 'REQUIRES_REVIEW' | 'APPROVED' | 'DENIED';
  reviewedBy?: string;
  reviewedAt?: string;
  temporaryAccessExpiry?: string;
  revealedPatientReference?: string; // Revealed ONLY when approved
  auditRecordId: string;
}

// ============================================================================
// 5. STUDY OPERATIONS: VISITS, TASKS, EVENTS & SAFETY
// ============================================================================

export type StudyVisitStatus =
  | 'PLANNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'MISSED'
  | 'CANCELLED';

export interface StudyVisit {
  studyVisitId: string;
  researchSubjectId: string;
  studyId: string;
  visitType: 'SCREENING' | 'BASELINE' | 'TREATMENT' | 'FOLLOW_UP' | 'CLOSEOUT' | 'UNSCHEDULED';
  visitNumber: number;
  scheduledAt: string;
  actualAt?: string;
  clinicalEncounterReference?: string; // OPTIONAL link to existing clinical encounter (StudyVisit ≠ Encounter)
  status: StudyVisitStatus;
  requiredAssessments: string[];
  dataCollectionReferences: string[];
  deviations: string[];
  provenance: {
    recordedBy: string;
    recordedAt: string;
  };
}

export interface StudyTask {
  studyTaskId: string;
  studyId: string;
  assignedTo: string; // V16 workforceMemberId
  taskType: 'DATA_COLLECTION' | 'QUESTIONNAIRE' | 'SAMPLE_HANDLING' | 'FOLLOW_UP' | 'MONITORING' | 'REVIEW' | 'ADJUDICATION' | 'DOCUMENTATION';
  description: string;
  dueDate: string;
  completedAt?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  relatedSubjectId?: string;
}

export type ResearchEventType =
  | 'SUBJECT_SCREENED'
  | 'SUBJECT_ENROLLED'
  | 'CONSENT_GRANTED'
  | 'CONSENT_WITHDRAWN'
  | 'VISIT_COMPLETED'
  | 'SPECIMEN_COLLECTED'
  | 'DATA_CAPTURED'
  | 'PROTOCOL_DEVIATION'
  | 'SAFETY_EVENT'
  | 'FOLLOW_UP_COMPLETED'
  | 'SUBJECT_WITHDRAWN';

export interface ResearchEvent {
  eventId: string;
  studyId: string;
  eventType: ResearchEventType;
  subjectPseudonym?: string;
  siteId: string;
  actorId: string;
  timestamp: string;
  details: Record<string, any>;
  integrityHash: string;
}

export interface StudyDeviation {
  deviationId: string;
  studyId: string;
  researchSubjectId?: string;
  protocolVersion: number;
  description: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  occurredDate: string;
  cause: string;
  impactAssessment: string;
  correctiveAction: string;
  reviewerId: string;
  status: 'REPORTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'RESOLVED';
  provenance: {
    reportedAt: string;
    reportedBy: string;
  };
}

export interface StudySafetyEvent {
  safetyEventId: string;
  studyId: string;
  researchSubjectId?: string;
  eventType: 'UNEXPECTED_EVENT' | 'PROTOCOL_SAFETY_ISSUE' | 'PARTICIPANT_SAFETY_CONCERN' | 'INTERVENTION_ISSUE' | 'STUDY_SUSPENSION_TRIGGER';
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
  description: string;
  occurredAt: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED';
  investigatorAssessment: string;
  actionTaken?: string;
  reportedBy: string;
  resolvedAt?: string;
  provenance: {
    createdAt: string;
  };
  integrityHash: string;
}

export interface ResearchSpecimen {
  researchSpecimenId: string;
  studyId: string;
  subjectPseudonym: string;
  sourceClinicalSpecimenId?: string; // V4 Specimen link
  collectionPurpose: string;
  processingStatus: 'COLLECTED' | 'PROCESSED' | 'STORED' | 'TRANSFERRED' | 'DEPLETED' | 'DESTROYED';
  storageLocation: string;
  retentionYears: number;
  consentBasisReference: string;
  provenance: {
    collectedAt: string;
    collectedBy: string;
  };
}

export interface StudyMonitoringRecord {
  monitoringId: string;
  studyId: string;
  siteId: string;
  monitorId: string; // V16 workforceMemberId
  visitDate: string;
  siteStatus: 'ACTIVE' | 'FLAGGED' | 'SUSPENDED';
  enrollmentCompliance: boolean;
  missingDataRatePercent: number;
  unresolvedDeviationsCount: number;
  consentCompletenessPercent: number;
  findings: string[];
}

export interface StatisticalAnalysisPlan {
  planId: string;
  studyId: string;
  version: number;
  primaryEndpoints: string[];
  secondaryEndpoints: string[];
  populationDefinitions: string[];
  analysisMethods: string[];
  missingDataMethod: string;
  subgroupRules: string[];
  effectiveDate: string;
  approvalReference: string;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

export interface StudyOutcomeDefinition {
  outcomeId: string;
  studyId: string;
  name: string;
  type: 'PRIMARY' | 'SECONDARY' | 'EXPLORATORY';
  definition: string;
  population: string;
  timeframe: string;
  variableReferences: string[];
  version: number;
}

// ============================================================================
// 6. EVIDENCE MANAGEMENT & SYNTHESIS
// ============================================================================

export type EvidenceVariableType =
  | 'POPULATION'
  | 'EXPOSURE'
  | 'INTERVENTION'
  | 'COMPARATOR'
  | 'OUTCOME'
  | 'CONFOUNDER'
  | 'MEASURED_VARIABLE';

export interface EvidenceVariable {
  variableId: string;
  name: string;
  description: string;
  variableType: EvidenceVariableType;
  picoRole: 'P' | 'I' | 'C' | 'O' | 'NONE';
  definition: {
    codingSystem?: string;
    code?: string;
    expression?: string;
  };
  handling: 'CONTINUOUS' | 'DICHOTOMOUS' | 'ORDINAL' | 'CATEGORICAL';
  version: number;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export type EvidenceStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'ACTIVE'
  | 'RETRACTED'
  | 'SUPERSEDED'
  | 'RETIRED';

export interface EvidenceRecord {
  evidenceId: string;
  title: string;
  assertion: string;
  variables: {
    populationVariableId: string;
    exposureVariableId?: string;
    comparatorVariableId?: string;
    outcomeVariableId: string;
  };
  sourceStudies: string[]; // study IDs or citation IDs
  statistics: {
    sampleSize: number;
    effectSizeEstimate?: number;
    effectSizeType?: 'RELATIVE_RISK' | 'ODDS_RATIO' | 'HAZARD_RATIO' | 'MEAN_DIFFERENCE' | 'PROPORTION';
    confidenceInterval?: {
      lower: number;
      upper: number;
      level: number; // e.g., 0.95
    };
    pValue?: number;
  };
  certainty: {
    rating: 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH';
    framework: 'GRADE' | 'OTHER';
    rationales: string[];
  };
  applicability: {
    targetPopulation: string;
    clinicalSetting: string;
  };
  provenance: {
    createdAt: string;
    createdBy: string;
    reviewedBy?: string;
    reviewedAt?: string;
    systemVersion: string;
  };
  version: number;
  status: EvidenceStatus;
  integrityHash: string;
}

export interface CitationRecord {
  citationId: string;
  title: string;
  authors: string[];
  publication: string;
  year: number;
  doi?: string;
  sourceType: 'PEER_REVIEWED_JOURNAL' | 'CLINICAL_TRIAL_REPORT' | 'SYSTEMATIC_REVIEW' | 'INSTITUTIONAL_REPORT' | 'OTHER';
  url?: string;
  accessDate: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'EVIDENCE_UNAVAILABLE';
  provenance: {
    recordedAt: string;
    recordedBy: string;
  };
}

export interface EvidenceSource {
  sourceId: string;
  sourceType: 'PEER_REVIEWED' | 'STUDY_REPORT' | 'SYSTEMATIC_REVIEW' | 'META_ANALYSIS' | 'GUIDELINE_REFERENCE' | 'DATASET' | 'REGISTRY' | 'INTERNAL_STUDY' | 'OTHER';
  name: string;
  origin: string;
  accessStatus: 'AVAILABLE' | 'RESTRICTED' | 'UNAVAILABLE';
  verificationStatus: 'VERIFIED' | 'VERIFICATION_REQUIRED' | 'UNVERIFIED';
  provenance: {
    registeredAt: string;
  };
}

export interface EvidenceAssessment {
  assessmentId: string;
  evidenceId: string;
  assessorId: string;
  relevanceRating: 'HIGH' | 'MODERATE' | 'LOW';
  qualityRating: 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';
  certainty: 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW';
  applicabilityRating: 'DIRECT' | 'INDIRECT' | 'QUESTIONABLE';
  biasConcerns: string[];
  studyDesign: string;
  dataCompleteness: 'COMPLETE' | 'PARTIAL' | 'DEFICIENT';
  notes: string;
  assessedAt: string;
}

export interface EvidenceSynthesis {
  synthesisId: string;
  researchQuestion: string; // PICO/PECO formulation
  pico: {
    population: string;
    interventionOrExposure: string;
    comparator: string;
    outcome: string;
  };
  includedEvidenceIds: string[];
  excludedEvidenceIds: string[];
  synthesisMethod: 'NARRATIVE_SYNTHESIS' | 'SYSTEMATIC_SYNTHESIS' | 'META_ANALYSIS' | 'QUALITATIVE_SYNTHESIS';
  findings: string[];
  hasConflict: boolean;
  conflictNotes?: string;
  overallCertainty: 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH';
  limitations: string[];
  reviewerId: string;
  version: number;
  status: 'DRAFT' | 'COMPLETED' | 'SUPERSEDED';
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

// ============================================================================
// 7. INSTITUTIONAL LEARNING & PRACTICE CHANGE
// ============================================================================

export interface LearningCycle {
  cycleId: string;
  name: string;
  question: string;
  evidenceReferences: string[];
  findingsReferences: string[];
  practiceChangeProposalReference?: string;
  status: 'QUESTIONING' | 'EVIDENCE_GATHERING' | 'SYNTHESIZING' | 'PROPOSING_CHANGE' | 'IMPLEMENTING' | 'MEASURING' | 'LEARNING_COMPLETED';
  startDate: string;
  endDate?: string;
}

export interface QualityImprovementProject {
  projectId: string;
  title: string;
  objective: string;
  baselineMetric: string;
  targetMetric: string;
  currentMetric?: string;
  interventionDescription: string;
  period: {
    start: string;
    end?: string;
  };
  ownerId: string; // V16 workforceMemberId
  facilityId: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
  lessonsLearned?: string[];
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export interface LearningFinding {
  findingId: string;
  projectId?: string;
  studyId?: string;
  observation: string;
  evidenceReferences: string[];
  certainty: 'LOW' | 'MODERATE' | 'HIGH';
  context: string;
  recommendation: string;
  limitations: string[];
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export interface PracticeChangeProposal {
  proposalId: string;
  findingReference: string; // references findingId
  affectedService: string;
  proposedChange: string;
  expectedImpact: string;
  risks: string[];
  implementationPlan: string;
  approvals: {
    approvedBy: string;
    role: string;
    approvedAt: string;
  }[];
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTING' | 'COMPLETED';
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

export interface KnowledgeArtifact {
  artifactId: string;
  artifactType: 'RESEARCH_SUMMARY' | 'EVIDENCE_BRIEF' | 'LEARNING_REPORT' | 'IMPLEMENTATION_GUIDE' | 'INTERNAL_EVIDENCE_NOTE';
  title: string;
  evidenceSources: string[];
  content: string;
  version: number;
  reviewerId: string;
  approvalState: 'DRAFT' | 'APPROVED' | 'ARCHIVED';
  effectivePeriod: {
    from: string;
    to?: string;
  };
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

// ============================================================================
// 8. GOVERNANCE, RETENTION, QUARANTINE & ADAPTERS
// ============================================================================

export interface ResearchRetentionPolicy {
  policyId: string;
  studyId: string;
  retentionYears: number;
  consentBasedRetention: boolean;
  datasetRetentionYears: number;
  specimenRetentionYears: number;
  auditRetentionYears: number;
  archivalState: 'ACTIVE' | 'ARCHIVED' | 'SCHEDULED_DISPOSITION';
  effectiveDate: string;
}

export interface ResearchQuarantineItem {
  quarantineId: string;
  studyId: string;
  resourceType: 'SUBJECT' | 'CONSENT' | 'DATASET' | 'SPECIMEN' | 'EVENT';
  resourceId: string;
  reason: 'IDENTITY_AMBIGUITY' | 'CONSENT_MISMATCH' | 'PROTOCOL_VERSION_MISMATCH' | 'DATASET_INTEGRITY_FAILURE' | 'PROHIBITED_VARIABLE' | 'INVALID_STUDY_SCOPE' | 'UNSUPPORTED_TRANSFORMATION' | 'SUSPICIOUS_EXPORT' | 'DUPLICATE_SUBJECT' | 'CONFLICTING_SOURCE_DATA';
  details: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  quarantinedAt: string;
  quarantinedBy: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

export interface ResearchOutput {
  outputId: string;
  studyId: string;
  title: string;
  authors: string[];
  datasetVersionId: string;
  analysisPlanVersionId: string;
  evidenceReferences: string[];
  status: 'DRAFT' | 'INTERNAL_REVIEW' | 'APPROVED' | 'RELEASED' | 'RETRACTED';
  approvedBy?: string;
  approvedAt?: string;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
  integrityHash: string;
}

export interface ResearchFundingReference {
  fundingId: string;
  studyId: string;
  fundingSource: string;
  financingProgramReference?: string; // V15 link
  budgetReference?: string;
  allocatedAmount?: number;
  currency?: string;
  status: 'ACTIVE' | 'DEPLETED' | 'CLOSED';
}

/**
 * External Research Exchange Adapter Interface
 */
export interface IResearchExchangeAdapter {
  status: 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'SANDBOX' | 'ACTIVE';
  endpoint?: string;
  transmitStudySummary(studyId: string): Promise<{ success: boolean; error?: string; transmissionId?: string }>;
  fetchExternalProtocol(referenceNumber: string): Promise<{ success: boolean; error?: string; protocolData?: any }>;
}

/**
 * External Evidence Source Adapter Interface
 */
export interface IEvidenceSourceAdapter {
  status: 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'SANDBOX' | 'ACTIVE';
  searchLiterature(query: string): Promise<{ status: 'EVIDENCE_UNAVAILABLE' | 'AVAILABLE'; records: CitationRecord[] }>;
  verifyDoi(doi: string): Promise<{ verified: boolean; citation?: CitationRecord }>;
}
