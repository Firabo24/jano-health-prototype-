/**
 * Jano Health — Post-Core Track 1
 * REAL-SITE DEPLOYMENT, QUALITY SYSTEM & REGULATORY EVIDENCE
 *
 * Types, models, lifecycles, and invariants for:
 * - Real-Site Deployment & Site Acceptance Testing (SAT)
 * - Software Quality Management System (QMS)
 * - Controlled Document Management
 * - Generic Requirements & Regulatory Evidence Register
 * - Post-Deployment Clinical Safety Surveillance & Hazard Logs
 * - Cybersecurity Evidence, Provenance & SBOM
 * - Interoperability Conformance & Workforce Training
 * - Corrective and Preventive Actions (CAPA)
 * - Engineering Change Control (ECR / ECN)
 * - Release Evidence Dossier & Audit Inspection Packets
 */

// ============================================================================
// 1. REAL-SITE DEPLOYMENT & SITE ACCEPTANCE (SAT)
// ============================================================================

export type RealSiteDeploymentState =
  | 'PLANNED'
  | 'APPROVED'
  | 'PREPARED'
  | 'DEPLOYING'
  | 'VERIFIED'
  | 'ACTIVATED'
  | 'MONITORED'
  | 'HANDED_OVER'
  | 'CLOSED';

export type DeploymentTopologyType =
  | 'STANDALONE_RUGGED_TABLET'
  | 'FACILITY_LOCAL_HUB'
  | 'DISTRICT_NETWORKED_CLUSTER'
  | 'HYBRID_EDGE_CLOUD';

export interface RealSiteDeployment {
  deploymentId: string;
  organizationId: string;
  facilityId: string;
  siteName: string;
  jurisdiction: string;
  deploymentVersion: string;
  databaseVersion: number;
  configurationVersion: string;
  topology: DeploymentTopologyType;
  hardwareSpec: {
    deviceCount: number;
    primaryHardware: string;
    batteryBackupPresent: boolean;
    localNetworkType: 'OFFLINE_MESH' | 'LOCAL_WIFI' | 'ETHERNET' | 'CELLULAR_PERIODIC';
  };
  enabledModules: string[];
  enabledAiCapabilities: string[]; // Advisory only
  externalIntegrations: string[];
  responsiblePersonnel: {
    siteLead: string;
    deploymentEngineer: string;
    clinicalSafetyOfficer: string;
    qualityManager: string;
  };
  state: RealSiteDeploymentState;
  hasEmpiricalActivityEvidence: boolean; // Cannot be REAL without verified activity
  activityEvidenceArtifacts: string[];
  plannedDate: string;
  activatedDate?: string;
  handedOverDate?: string;
  closedDate?: string;
  handoverNotes?: string;
}

export type SatCategory =
  | 'IDENTITY'
  | 'ENCOUNTER'
  | 'CLINICAL'
  | 'LABORATORY'
  | 'RADIOLOGY'
  | 'MEDICATION'
  | 'PHARMACY'
  | 'EMERGENCY'
  | 'REFERRAL'
  | 'OFFLINE'
  | 'SYNCHRONIZATION'
  | 'SECURITY'
  | 'INTEROPERABILITY'
  | 'BACKUP'
  | 'RESTORE'
  | 'REPORTING'
  | 'AI_GOVERNANCE';

export interface SiteAcceptanceCriterion {
  criterionId: string;
  category: SatCategory;
  title: string;
  description: string;
  isMandatory: boolean;
  expectedResult: string;
  observedResult?: string;
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'CONDITIONALLY_ACCEPTED';
  testerId?: string;
  testedAt?: string;
  evidenceArtifact?: string;
  deviationNotes?: string;
  conditionalApprovalJustification?: string;
  conditionalApproverId?: string;
}

export interface SiteAcceptancePlan {
  planId: string;
  deploymentId: string;
  facilityId: string;
  softwareVersion: string;
  configurationVersion: string;
  criteria: SiteAcceptanceCriterion[];
  overallStatus: 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'CONDITIONALLY_ACCEPTED';
  evaluatedAt?: string;
  evaluatedBy?: string;
  approvalRecord?: {
    approvedBy: string;
    approvalRole: string;
    timestamp: string;
    remarks: string;
  };
}

// ============================================================================
// 2. QUALITY MANAGEMENT SYSTEM (QMS)
// ============================================================================

export type QualityRecordType =
  | 'QUALITY_PLAN'
  | 'QUALITY_OBJECTIVE'
  | 'QUALITY_AUDIT'
  | 'QUALITY_REVIEW'
  | 'PROCESS_VERIFICATION';

export interface QualityObjective {
  objectiveId: string;
  title: string;
  workflowScope: string;
  targetMetric: string;
  currentObservedMetric: string;
  status: 'ON_TRACK' | 'AT_RISK' | 'NON_CONFORMANT' | 'ACHIEVED';
  owner: string;
  reviewDate: string;
  evidenceSummary: string;
}

export interface QualityFinding {
  findingId: string;
  auditId: string;
  severity: 'OBSERVATION' | 'MINOR_NONCONFORMANCE' | 'MAJOR_NONCONFORMANCE' | 'CRITICAL';
  description: string;
  affectedProcess: string;
  identifiedBy: string;
  identifiedAt: string;
  assignedCapaId?: string;
  status: 'OPEN' | 'INVESTIGATING' | 'REMEDIATED' | 'VERIFIED';
}

export interface QualityAudit {
  auditId: string;
  title: string;
  auditScope: string;
  scheduledDate: string;
  completedDate?: string;
  auditorId: string;
  auditorType: 'INTERNAL_QUALITY_TEAM' | 'INDEPENDENT_INTERNAL_PEER';
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FINDINGS_OPEN';
  findings: QualityFinding[];
  summaryReport: string;
  regulatoryCertificationClaimed: false; // Mandatory hard invariant: QMS records NEVER claim external certification
}

// ============================================================================
// 3. CONTROLLED DOCUMENT MANAGEMENT
// ============================================================================

export type ControlledDocumentClass =
  | 'SOP'
  | 'WorkInstruction'
  | 'DeploymentGuide'
  | 'ClinicalWorkflowGuide'
  | 'IncidentProcedure'
  | 'BackupProcedure'
  | 'DisasterRecoveryProcedure'
  | 'SecurityProcedure'
  | 'TrainingMaterial'
  | 'ReleaseNote'
  | 'ValidationProtocol'
  | 'ValidationReport';

export type ControlledDocumentState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'EFFECTIVE'
  | 'SUPERSEDED'
  | 'RETIRED';

export interface DocumentRevision {
  revisionNumber: number;
  versionString: string;
  authorId: string;
  reviewerId: string;
  approverId: string;
  state: ControlledDocumentState;
  effectiveDate?: string;
  supersededDate?: string;
  changeSummary: string;
  contentDigest: string; // SHA-256 of document content
  immutabilityLocked: boolean; // Approved versions cannot be modified in place
}

export interface ControlledDocument {
  documentId: string;
  documentNumber: string; // e.g. "SOP-CLIN-004"
  title: string;
  docClass: ControlledDocumentClass;
  applicability: string[]; // e.g. ["RUGGED_TABLET", "RURAL_CLINIC"]
  currentVersion: string;
  currentState: ControlledDocumentState;
  revisions: DocumentRevision[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 4. REQUIREMENTS & REGULATORY EVIDENCE REGISTER
// ============================================================================

export type RequirementApplicability =
  | 'APPLICABLE'
  | 'PARTIALLY_APPLICABLE'
  | 'NOT_APPLICABLE'
  | 'UNDER_EVALUATION';

export type ComplianceEvidenceStatus =
  | 'UNASSESSED'
  | 'GAP_IDENTIFIED'
  | 'SUBSTANTIATED_BY_INTERNAL_EVIDENCE'
  | 'THIRD_PARTY_AUDITED' // Only valid if explicit verifiable artifact linked
  | 'EXEMPTION_DOCUMENTED';

export interface ExternalRequirement {
  requirementId: string;
  sourceAuthority: string; // e.g., "MOH-TZ", "WHO-DigitalHealth", "ISO-13485-Informed"
  jurisdiction: string; // e.g., "East Africa Community / Tanzania", "Global Standard"
  publicationVersion: string;
  effectiveDate?: string;
  requirementSection: string;
  requirementText: string;
  applicability: RequirementApplicability;
  applicabilityRationale: string;
  evidenceStatus: ComplianceEvidenceStatus;
  internalEvidenceLinks: string[];
  knownGaps: string[];
  reviewedBy: string;
  lastReviewedAt: string;
  disclaimer: string; // Mandatory non-accreditation disclaimer
}

// ============================================================================
// 5. CLINICAL SAFETY SURVEILLANCE & HAZARD LOG
// ============================================================================

export type ClinicalSafetySeverity = 'NEGLIGIBLE' | 'MINOR' | 'SERIOUS' | 'CRITICAL' | 'CATASTROPHIC';
export type IncidentDisposition = 'UNDER_INVESTIGATION' | 'SAFETY_ALERT_ISSUED' | 'MITIGATION_DEPLOYED' | 'CLOSED_RESOLVED';

export interface ClinicalHazardLogEntry {
  hazardId: string;
  hazardCode: string;
  clinicalDomain: string;
  potentialHarm: string;
  initialSeverity: ClinicalSafetySeverity;
  implementedMitigations: string[];
  residualSeverity: ClinicalSafetySeverity;
  safetyCaseReference: string;
  status: 'ACTIVE_MITIGATED' | 'NEW_IDENTIFIED' | 'UNDER_REVIEW';
  lastReviewedAt: string;
  reviewedByClinicalSafetyOfficer: string;
}

export interface ClinicalIncidentReport {
  incidentId: string;
  facilityId: string;
  reportedAt: string;
  reportedBy: string;
  clinicalSummary: string;
  patientImpact: 'NO_HARM' | 'POTENTIAL_HARM_INTERCEPTED' | 'TEMPORARY_HARM' | 'SERIOUS_HARM';
  disposition: IncidentDisposition;
  isSeparatedFromTechSupport: true; // Hard invariant: never hidden in support tickets
  clinicianReviewRequired: true; // Advisory-only invariant
  correctiveCapaId?: string;
  closedAt?: string;
  closedBySafetyOfficer?: string;
}

// ============================================================================
// 6. CYBERSECURITY EVIDENCE & PROVENANCE
// ============================================================================

export interface SbomComponent {
  componentName: string;
  version: string;
  license: string;
  checksumSha256: string;
  supplier: string;
  dependencyType: 'DIRECT_RUNTIME' | 'BUILD_TOOL' | 'CORE_PLATFORM';
  knownVulnerabilitiesCount: number;
}

export interface VulnerabilityRecord {
  vulnerabilityId: string;
  cveOrIdentifier: string;
  affectedComponent: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'INVESTIGATING' | 'MITIGATED_BY_CONFIGURATION' | 'PATCHED' | 'FALSE_POSITIVE';
  mitigationSummary: string;
  discoveredAt: string;
  resolvedAt?: string;
}

export interface CybersecurityEvidenceRecord {
  recordId: string;
  buildDigestSha256: string;
  rawDigestDistinguishedFromDigitalSignature: true; // Invariant
  pkiSignaturePresent: boolean;
  pkiSignerIdentity?: string;
  sbomComponents: SbomComponent[];
  vulnerabilities: VulnerabilityRecord[];
  penetrationTestingCompleted: boolean;
  penetrationTestDate?: string;
  securityOfficerSignOff: string;
  timestamp: string;
}

// ============================================================================
// 7. INTEROPERABILITY & WORKFORCE TRAINING
// ============================================================================

export interface InteroperabilityConformanceTest {
  testId: string;
  protocol: 'FHIR_R4' | 'HL7_V2' | 'DICOM_WEB' | 'OPENEHR' | 'MOH_REPORTING';
  profileUri: string;
  endpointUrl: string;
  executionMode: 'OFFLINE_SYNTACTIC_VALIDATION' | 'SANDBOX_EXCHANGE' | 'PRODUCTION_MUTUAL_TLS';
  testResult: 'PASSED' | 'FAILED' | 'PARTIAL';
  conformanceFindings: string[];
  testedAt: string;
  isOfficialBilateralAgreement: boolean; // Cannot claim official government integration without agreement
}

export interface WorkforceTrainingRecord {
  trainingRecordId: string;
  userId: string;
  userName: string;
  role: string;
  facilityId: string;
  moduleCode: string;
  moduleTitle: string;
  completionDate: string;
  competencyScorePercent: number;
  isCompetencyVerified: boolean;
  supervisedHoursCompleted: number;
  supervisedBy: string;
  unsupervisedClinicalAccessApproved: boolean; // Gated on training
}

// ============================================================================
// 8. CORRECTIVE AND PREVENTIVE ACTION (CAPA)
// ============================================================================

export type CapaState =
  | 'INITIATED'
  | 'INVESTIGATION'
  | 'ROOT_CAUSE_IDENTIFIED'
  | 'ACTION_PLAN_APPROVED'
  | 'IMPLEMENTING'
  | 'EFFECTIVENESS_VERIFICATION'
  | 'CLOSED';

export interface CapaRecord {
  capaId: string;
  sourceType: 'QUALITY_AUDIT' | 'CLINICAL_INCIDENT' | 'SAT_FAILURE' | 'SECURITY_VULNERABILITY' | 'REGULATORY_GAP';
  sourceReferenceId: string;
  problemDescription: string;
  rootCauseAnalysis?: string;
  correctiveActions: {
    actionId: string;
    description: string;
    assignedTo: string;
    dueDate: string;
    completedAt?: string;
  }[];
  preventiveActions: {
    actionId: string;
    description: string;
    assignedTo: string;
    dueDate: string;
    completedAt?: string;
  }[];
  state: CapaState;
  effectivenessVerificationCriteria: string;
  effectivenessEmpiricalEvidence?: string;
  isEffectivenessVerified: boolean; // Cannot close without verified evidence
  qualityManagerSignOff?: string;
  closedAt?: string;
}

// ============================================================================
// 9. ENGINEERING CHANGE CONTROL (ECR / ECN)
// ============================================================================

export interface EngineeringChangeOrder {
  changeOrderId: string;
  title: string;
  category: 'FIRMWARE_UPDATE' | 'SCHEMA_MIGRATION' | 'WORKFLOW_ENHANCEMENT' | 'SECURITY_PATCH';
  impactAssessment: {
    clinicalSafetyImpact: 'NONE' | 'LOW' | 'REQUIRES_CLINICAL_SAFETY_OFFICER_SIGN_OFF';
    dataIntegrityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    offlineResilienceImpact: 'PRESERVED' | 'MODIFIED';
    regulatoryQualityImpact: 'DOCUMENTED';
  };
  clinicalSafetyOfficerApproved: boolean;
  qualityManagerApproved: boolean;
  engineeringLeadApproved: boolean;
  rollbackPlanDocumented: boolean;
  status: 'PROPOSED' | 'APPROVED' | 'DEPLOYED' | 'VERIFIED' | 'ROLLED_BACK';
  effectiveDate: string;
}

// ============================================================================
// 10. RELEASE EVIDENCE DOSSIER & AUDIT INSPECTION PACKET
// ============================================================================

export interface ReleaseEvidenceDossier {
  dossierId: string;
  releaseVersion: string;
  databaseSchemaVersion: number;
  timestamp: string;
  verificationSummary: {
    totalTestAssertions: number;
    passedTestAssertions: number;
    failedTestAssertions: number;
    testSuiteReports: string[];
  };
  knownDefects: {
    defectId: string;
    severity: string;
    workaround: string;
    clinicalSafetyRisk: 'NONE' | 'MITIGATED';
  }[];
  residualRiskAcceptance: {
    acceptedBy: string;
    role: string;
    statement: string;
  };
  tamperEvidentSha256Digest: string;
  statutoryDisclaimer: string; // Internal evidence disclaimer
}
