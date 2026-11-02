/**
 * Jano Health — Post-Core Execution Track 3
 * FIRST-SITE DEPLOYMENT READINESS & GO-LIVE EXECUTION
 *
 * Types, models, lifecycles, and invariants for:
 * 1. Repository Reality Audit & Capability Verification Matrix
 * 2. First-Site Definition & Controlled Site Dossier
 * 3. 5-Domain Facility Readiness Assessment
 * 4. 15-Phase Facility Deployment Plan
 * 5. Site Acceptance Testing (SAT) — Local Synthetic vs Facility-Executed
 * 6. Clinical Safety, Offline & Fail-Closed Emergency Protection
 * 7. Production Security Readiness & Secret Sanitization
 * 8. Training, Support Escalation Paths (Technical vs Clinical Safety Separation)
 * 9. Operational Metrics Baseline & Instrumentation Plan
 * 10. Formal Human-Authorized Go/No-Go Decision Dossier
 * 11. First-Site Deployment Readiness Package (20-Point Traceable Export)
 * 12. Executable Controlled Activation Runbook
 */

export const TRACK3_STATUTORY_DISCLAIMER =
  'Jano Health First-Site Deployment Readiness & Go-Live Evidence Dossier: ' +
  'Prepared for authorized clinical leadership and operational governance. ' +
  'No clinical live operation may commence without verified site infrastructure, ' +
  'named clinical safety officer authorization, verified backup restoration, ' +
  'and formal Site Acceptance Testing conducted on-site.';

// ============================================================================
// 1. REPOSITORY REALITY AUDIT & CAPABILITY MATRIX
// ============================================================================

export type VerificationClassification =
  | 'IMPLEMENTED'
  | 'INTERNALLY_VERIFIED'
  | 'SITE_VERIFIED'
  | 'EXTERNALLY_ASSESSED'
  | 'PRODUCTION_CONFIGURED'
  | 'NOT_VERIFIED';

export interface CapabilityAuditItem {
  id: string;
  capabilityName: string;
  category: 'CLINICAL' | 'OFFLINE' | 'SECURITY' | 'INTEROPERABILITY' | 'AI_GOVERNANCE' | 'INFRASTRUCTURE';
  implemented: boolean;
  internallyVerified: boolean;
  siteVerified: boolean;
  externallyAssessed: boolean;
  productionConfigured: boolean;
  classification: VerificationClassification;
  evidenceReference: string;
  discrepanciesOrGaps: string[];
}

// ============================================================================
// 2. FIRST-SITE DEFINITION & SITE SELECTION LIFECYCLE
// ============================================================================

export type SiteSelectionState =
  | 'SITE_NOT_SELECTED'
  | 'SITE_UNDER_ASSESSMENT'
  | 'SITE_SELECTED'
  | 'SITE_APPROVED'
  | 'SITE_DEPLOYMENT_IN_PROGRESS'
  | 'SITE_ACCEPTED'
  | 'SITE_ACTIVATED'
  | 'SITE_SUSPENDED';

export type AssessmentFieldStatus = 'CONFIRMED' | 'NOT_ASSESSED' | 'EVIDENCE_REQUIRED';

export interface FieldWithEvidence<T> {
  value: T;
  status: AssessmentFieldStatus;
  evidenceRef?: string;
}

export interface FirstSiteDossier {
  id: string;
  siteSelectionState: SiteSelectionState;
  targetCountry: string; // e.g. Ethiopia / Tanzania
  facilityName: FieldWithEvidence<string>;
  facilityLocation: FieldWithEvidence<string>;
  facilityType: FieldWithEvidence<string>;
  authorizedFacilityOwner: FieldWithEvidence<string>;
  clinicalLead: FieldWithEvidence<string>;
  clinicalSafetyOfficer: FieldWithEvidence<string>;
  technicalDeploymentOwner: FieldWithEvidence<string>;
  intendedUserRoles: FieldWithEvidence<string[]>;
  intendedModules: FieldWithEvidence<string[]>;
  hardwareDeviceInventory: FieldWithEvidence<string[]>;
  powerAndBackupPower: FieldWithEvidence<string>;
  localNetworkTopology: FieldWithEvidence<string>;
  internetConnectivityProfile: FieldWithEvidence<string>;
  existingDigitalSystems: FieldWithEvidence<string[]>;
  referralAndLabWorkflows: FieldWithEvidence<string>;
  pharmacyAndMedicationWorkflows: FieldWithEvidence<string>;
  trainingNeeds: FieldWithEvidence<string>;
  supportArrangements: FieldWithEvidence<string>;
  governanceApprovals: FieldWithEvidence<string[]>;
  externalIntegrationRequirements: FieldWithEvidence<string[]>;
  knownLimitationsAndRisks: string[];
  lastUpdated: string;
}

// ============================================================================
// 3. 5-DOMAIN FACILITY READINESS ASSESSMENT
// ============================================================================

export type DomainReadinessStatus = 'READY' | 'CONDITIONALLY_READY' | 'BLOCKED' | 'NOT_ASSESSED';

export interface InfrastructureReadiness {
  status: DomainReadinessStatus;
  hardwareCompatibilityVerified: boolean;
  operatingEnvironmentValidated: boolean;
  storageCapacityQualified: boolean;
  powerContinuityDocumented: boolean;
  offlineOperationProven: boolean;
  localNetworkArrangementsConfirmed: boolean;
  syncTopologyConfigured: boolean;
  backupArrangementsTested: boolean;
  supportAccessEstablished: boolean;
  findings: string[];
}

export interface ClinicalReadiness {
  status: DomainReadinessStatus;
  intendedWorkflowsIdentified: string[];
  workflowValidationEvidenceLinked: boolean;
  identifiedClinicalOwner: string;
  medicationFormularyLoaded: boolean;
  clinicalSafetyOfficerAssigned: boolean;
  emergencyCareProtectionConfirmed: boolean;
  findings: string[];
}

export interface WorkforceReadiness {
  status: DomainReadinessStatus;
  userAccountsProvisioned: boolean;
  rbacRolesAssigned: boolean;
  trainingCurriculumCompleted: boolean;
  clinicalCompetencyVerified: boolean;
  supervisionArrangementsActive: boolean;
  escalationContactsDisseminated: boolean;
  findings: string[];
}

export interface GovernanceReadiness {
  status: DomainReadinessStatus;
  siteAcceptanceCriteriaApproved: boolean;
  dataGovernanceResponsibilitiesAssigned: boolean;
  incidentProceduresAdopted: boolean;
  clinicalSafetyGovernanceChartered: boolean;
  statutoryRetentionPolicyEnacted: boolean;
  findings: string[];
}

export type IntegrationLifecycleState =
  | 'ADAPTER_IMPLEMENTED'
  | 'ENDPOINT_CONFIGURED'
  | 'CREDENTIALS_VERIFIED'
  | 'CONNECTION_TESTED'
  | 'EXCHANGE_TESTED'
  | 'AUTHORIZED_PRODUCTION_RELATIONSHIP'
  | 'SANDBOX'
  | 'NOT_CONFIGURED'
  | 'SUSPENDED'
  | 'FAILED_CLOSED';

export interface ExternalSystemIntegrationCheck {
  systemName: string;
  purpose: string;
  state: IntegrationLifecycleState;
  isProductionAuthorized: boolean;
  testNotes: string;
}

export interface IntegrationReadiness {
  status: DomainReadinessStatus;
  integrations: ExternalSystemIntegrationCheck[];
  failClosedBehaviorPreserved: boolean;
  findings: string[];
}

export interface FacilityReadinessAssessment {
  id: string;
  siteId: string;
  assessedAt: string;
  overallStatus: DomainReadinessStatus;
  infrastructure: InfrastructureReadiness;
  clinical: ClinicalReadiness;
  workforce: WorkforceReadiness;
  governance: GovernanceReadiness;
  integration: IntegrationReadiness;
  unresolvedBlockers: string[];
}

// ============================================================================
// 4. 15-PHASE DEPLOYMENT PLAN
// ============================================================================

export type DeploymentPhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'SKIPPED';

export interface DeploymentPhaseItem {
  phaseNumber: number;
  name: string;
  status: DeploymentPhaseStatus;
  responsibleRole: string;
  acceptanceCriteria: string;
  evidenceRequirement: string;
  failureCondition: string;
  rollbackArrangement: string;
  completedAt?: string;
}

// ============================================================================
// 5. SITE ACCEPTANCE TESTING (SAT)
// ============================================================================

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

export type SatTestResult = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE';

export interface SatTestCaseExecution {
  testId: string;
  category: SatCategory;
  description: string;
  expectedBehavior: string;
  actualObservedBehavior: string;
  environment: 'LOCAL_SYNTHETIC' | 'STAGING_LAB' | 'FACILITY_ON_SITE';
  softwareVersion: string;
  configurationVersion: string;
  testOperator: string;
  executedAt: string;
  result: SatTestResult;
  evidenceRef: string;
  sha256EvidenceHash: string;
  defectOrDeviation?: string;
  correctiveAction?: string;
  retestResult?: SatTestResult;
  reviewerApproval: {
    reviewerName: string;
    approved: boolean;
    timestamp: string;
  };
}

// ============================================================================
// 6. CLINICAL SAFETY, OFFLINE & SECURITY GATES
// ============================================================================

export interface ClinicalSafetyOfflineGate {
  clinicianReviewRequired: boolean; // MUST be true
  isAutonomousMutationAllowed: boolean; // MUST be false
  emergencyTriageProtectionActive: boolean; // MUST be true
  wrongPatientPreventionVerified: boolean;
  roleAndFacilityAuthorizationVerified: boolean;
  medicationAllergyConflictAlertsVerified: boolean;
  criticalLabRadiologyAlertsActive: boolean;
  offlineDocumentationVerified: boolean;
  localPersistenceAfterDisconnectionVerified: boolean;
  queueRecoveryAndSyncVerified: boolean;
  conflictDetectionQuarantineVerified: boolean;
  backupRestoreVerified: boolean;
  aiAdvisoryOnlyEnforced: boolean;
}

export interface ProductionSecurityGate {
  failClosedAuthEnforced: boolean;
  tenantFacilityIsolationEnforced: boolean;
  zeroDevCredentialsInProd: boolean;
  auditLoggingActive: boolean;
  privacyPreservingTelemetryEnforced: boolean;
  backupEncryptionEnforced: boolean;
  dependencyIntegrityVerified: boolean;
}

// ============================================================================
// 7. TRAINING, SUPPORT & SEPARATED ESCALATION PATHS
// ============================================================================

export interface EscalationPath {
  category: 'IT_SUPPORT_TECHNICAL' | 'CLINICAL_SAFETY_INCIDENT' | 'CYBERSECURITY_PRIVACY';
  primaryOwnerRole: string;
  targetResponseHours: number;
  contactChannel: string;
  slaDescription: string;
}

export interface TrainingSupportPlan {
  id: string;
  siteId: string;
  requiredRoleTraining: {
    roleName: string;
    curriculumModule: string;
    passingScorePercentage: number;
    supervisedHoursRequired: number;
  }[];
  escalationPaths: EscalationPath[];
  handoverConditions: string[];
}

// ============================================================================
// 8. OPERATIONAL METRICS BASELINE
// ============================================================================

export interface OperationalMetricDefinition {
  metricId: string;
  name: string;
  category: 'RELIABILITY' | 'SYNC' | 'CLINICAL_SAFETY' | 'WORKFLOW' | 'SUPPORT';
  numerator: string;
  denominator: string;
  dataSource: string;
  collectionMethod: 'AUTOMATED_TELEMETRY' | 'PERIODIC_AUDIT' | 'INCIDENT_LOG';
  observationPeriod: string;
  limitations: string;
  ownerRole: string;
  baselineObservedValue?: number;
}

// ============================================================================
// 9. GO/NO-GO DECISION DOSSIER
// ============================================================================

export type GoNoGoOutcome =
  | 'NOT_READY'
  | 'READY_WITH_BLOCKERS'
  | 'CONDITIONALLY_READY'
  | 'READY_FOR_AUTHORIZED_GO_LIVE'
  | 'LIVE_AND_MONITORED'
  | 'SUSPENDED';

export interface GoNoGoDecisionDossier {
  id: string;
  siteId: string;
  siteConfirmationState: SiteSelectionState;
  outcome: GoNoGoOutcome;
  reviewedEvidenceIds: string[];
  failedCriteria: string[];
  openHazardsAndResidualRisks: string[];
  approvedLimitations: string[];
  externalIntegrationStatus: string;
  trainingAndSupportReadiness: string;
  backupAndRecoveryReadiness: string;
  decisionRationale: string;
  authorizedReviewer: {
    name: string;
    role: string;
    licenseOrCredential?: string;
  };
  signoffTimestamp: string;
  conditionsAndExpiration?: string;
  humanAuthorizationVerified: boolean; // MUST be true
}

// ============================================================================
// 10. FIRST-SITE DEPLOYMENT READINESS PACKAGE (20-POINT EXPORT)
// ============================================================================

export interface FirstSiteDeploymentReadinessPackage {
  id: string;
  generatedAt: string;
  targetSiteState: SiteSelectionState;
  targetReleaseVersion: string;
  databaseStoreCount: number; // 362
  section1_executiveSummary: string;
  section2_repositoryVerificationStatus: string;
  section3_confirmedSiteInformation: FirstSiteDossier;
  section4_infrastructureAssessment: InfrastructureReadiness;
  section5_deploymentConfiguration: {
    env: string;
    dbVersion: number;
    topology: string;
  };
  section6_acceptanceTestMatrixSummary: {
    totalTests: number;
    passedSynthetic: number;
    passedOnSite: number;
    blockedOrFailed: number;
  };
  section7_clinicalSafetyReview: ClinicalSafetyOfflineGate;
  section8_securityPrivacyReadiness: ProductionSecurityGate;
  section9_integrationStatus: ExternalSystemIntegrationCheck[];
  section10_trainingCompetencyStatus: string;
  section11_backupRecoveryEvidence: string;
  section12_operationalMetricsPlan: OperationalMetricDefinition[];
  section13_knownLimitations: string[];
  section14_openIssuesAndCapa: string[];
  section15_siteAcceptanceStatus: string;
  section16_goNoGoDecision: GoNoGoDecisionDossier;
  section17_signoffHistory: string[];
  section18_evidenceProvenanceSha256: string;
  section19_exactExternalDependencies: string[];
  section20_explicitUnverifiedStatements: string[];
  statutoryDisclaimer: string;
}
