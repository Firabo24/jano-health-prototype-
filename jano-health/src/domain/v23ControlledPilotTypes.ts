/**
 * Jano Health - Clinical Core V23: Controlled Pilot Deployment,
 * Clinical Operations & Real-World Evidence Domain Models & Invariants.
 * 
 * Strict architectural boundaries ensuring:
 * - Controlled, supervised, reversible pilot execution
 * - Rigorous Go-Live gating (combining V21 production & V22 clinical safety)
 * - Real-World Evidence (RWE) integrity & distinction from synthetic/efficacy claims
 * - Privacy-preserving telemetry and minimization
 * - Operational Kill-Switch preserving emergency care
 * - Governed AI advisory supervision (clinicianReviewRequired = true, isAutonomousMutationAllowed = false)
 */

export type PilotLifecyclePhase =
  | 'PLANNING'
  | 'SITE_ASSESSMENT'
  | 'PREPARATION'
  | 'TRAINING'
  | 'SHADOW'
  | 'LIMITED_GO_LIVE'
  | 'CONTROLLED_LIVE'
  | 'MONITORED_OPERATION'
  | 'EXPANSION_REVIEW'
  | 'COMPLETED'
  | 'SUSPENDED'
  | 'TERMINATED';

export type PilotGateStatus = 'BLOCKED' | 'CONDITIONAL' | 'APPROVED' | 'EXPIRED';

export type PilotEvidenceProvenance =
  | 'PILOT_OBSERVED'
  | 'SYNTHETIC'
  | 'DERIVED'
  | 'EXTERNAL_REFERENCE';

export type PilotIncidentSeverity = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';

export type PilotIncidentType = 'TECHNICAL' | 'CLINICAL' | 'SECURITY' | 'PRIVACY' | 'AI';

export type PilotIncidentStatus =
  | 'LOGGED'
  | 'ACKNOWLEDGED'
  | 'UNDER_INVESTIGATION'
  | 'CONTAINED'
  | 'CAPA_PENDING'
  | 'RESOLVED'
  | 'CLOSED';

export type PilotExitDecision =
  | 'CONTINUE'
  | 'EXPAND'
  | 'CONDITIONAL_EXPANSION'
  | 'HOLD'
  | 'REMEDIATE'
  | 'PAUSE'
  | 'TERMINATE';

export interface PilotProgram {
  programId: string;
  name: string;
  sponsor: string;
  protocolVersion: string;
  governingSafetyOfficer: string;
  targetFacilities: string[];
  status: 'ACTIVE' | 'PAUSED' | 'CONCLUDED';
  createdAt: string;
  lastReviewedAt: string;
}

export interface PilotPhaseTransition {
  phase: PilotLifecyclePhase;
  enteredAt: string;
  authorizedBy: string;
  rationale: string;
}

export interface PilotSite {
  siteId: string;
  programId: string;
  facilityId: string;
  facilityName: string;
  currentPhase: PilotLifecyclePhase;
  phaseHistory: PilotPhaseTransition[];
  readinessScore: number; // 0 to 100
  isSuspended: boolean;
  suspendedReason?: string;
  assignedSupervisor: string;
  safetyLead: string;
  lastEvaluatedAt: string;
}

export interface PilotSiteAssessment {
  assessmentId: string;
  siteId: string;
  assessedAt: string;
  assessor: string;
  infrastructure: {
    deviceCount: number;
    ramStorageClassOk: boolean;
    powerReliabilityScore: number; // 1-5
    backupPowerAvailable: boolean;
    localNetworkOk: boolean;
    connectivityClass: 'CONTINUOUS' | 'INTERMITTENT' | 'PROLONGED_OFFLINE';
    localSyncTopology: string;
  };
  clinicalCapability: {
    servicesProvided: string[];
    departments: string[];
    activeWorkflows: string[];
    labAvailable: boolean;
    pharmacyAvailable: boolean;
    radiologyAvailable: boolean;
    emergencyActive: boolean;
    referralActive: boolean;
  };
  workforce: {
    designatedSafetyLead: string;
    clinicianCount: number;
    nurseCount: number;
    pharmacistCount: number;
    labTechCount: number;
    radTechCount: number;
    adminCount: number;
    trainingCompletionRate: number; // 0 - 100
    competencyVerifiedRate: number; // 0 - 100
  };
  governance: {
    facilityApprovalReceived: boolean;
    sopAcknowledged: boolean;
    technicalOwner: string;
    incidentContactsConfigured: boolean;
  };
  overallReadinessPassed: boolean;
  blockingFactors: string[];
}

export interface PilotAICapabilityConfig {
  capabilityId: string;
  modelId: string;
  version: string;
  clinicianReviewRequired: true;
  isAutonomousMutationAllowed: false;
  enabled: boolean;
}

export interface PilotConfiguration {
  configId: string;
  siteId: string;
  version: string;
  enabledModules: string[];
  enabledAICapabilities: PilotAICapabilityConfig[];
  authorizedRoles: string[];
  syncPeers: string[];
  networkMode: 'OFFLINE_ONLY' | 'LOCAL_MESH' | 'HYBRID_SYNC' | 'CLOUD_PERIODIC';
  terminologyPackageVersion: string;
  medicationKnowledgeVersion: string;
  criticalAlertSuppressionAllowed: false; // Invariant: Critical allergy/contraindication alerts can never be suppressed
  maintenanceWindows: { windowId: string; start: string; end: string }[];
  supportContacts: string[];
  escalationPolicyId: string;
  lastUpdatedAt: string;
  changeRequestId?: string;
}

export interface PilotGoLiveGateCheck {
  category: string;
  description: string;
  passed: boolean;
  evidenceRef: string;
}

export interface PilotGoLiveGate {
  gateId: string;
  siteId: string;
  targetPhase: PilotLifecyclePhase;
  status: PilotGateStatus;
  checks: PilotGoLiveGateCheck[];
  reviewedBy?: string;
  reviewedAt?: string;
  conditions?: string[];
  rejectionReasons?: string[];
}

export interface PilotOperationalTelemetry {
  telemetryId: string;
  siteId: string;
  deviceId: string;
  timestamp: string;
  uptimeMinutes: number;
  isOnline: boolean;
  queueDepth: number;
  storagePressurePct: number;
  syncStatus: 'SYNCED' | 'PENDING' | 'CONFLICT_DETECTED' | 'OFFLINE_HELD';
  crashesObserved: number;
  batteryStatus?: string;
  redactedPayloadSummary: string; // Guaranteed zero PII
}

export interface PilotWorkflowMetric {
  metricId: string;
  siteId: string;
  workflowType:
    | 'PATIENT_REGISTRATION'
    | 'ENCOUNTER'
    | 'LAB_RESULT'
    | 'RADIOLOGY'
    | 'MEDICATION'
    | 'EMERGENCY'
    | 'REFERRAL'
    | 'OFFLINE_SYNC';
  totalStarted: number;
  totalCompleted: number;
  totalAbandoned: number;
  averageDurationSeconds: number;
  errorCount: number;
  overrideCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface PilotEvidenceArtifact {
  artifactId: string;
  siteId: string;
  category:
    | 'RELIABILITY'
    | 'OFFLINE_RESILIENCE'
    | 'CLINICAL_WORKFLOW'
    | 'USABILITY'
    | 'SAFETY'
    | 'AI_GOVERNANCE';
  provenance: PilotEvidenceProvenance;
  title: string;
  metrics: Record<string, number | string | boolean>;
  recordedAt: string;
  recordedBy: string;
  integrityHash: string; // SHA-256
  verifiedAgainstSafetyCase: boolean;
}

export interface PilotSafetyIncident {
  incidentId: string;
  siteId: string;
  severity: PilotIncidentSeverity;
  type: PilotIncidentType;
  title: string;
  description: string;
  status: PilotIncidentStatus;
  affectedWorkflow?: string;
  potentialHarm: string;
  containmentAction?: string;
  capaReference?: string;
  reportedBy: string;
  assignedInvestigator?: string;
  clinicalSafetyOfficerSignoff?: string;
  noPatientHarmConfirmed: boolean;
  createdAt: string;
  closedAt?: string;
}

export interface PilotEscalation {
  escalationId: string;
  incidentId: string;
  siteId: string;
  level: 'FACILITY_LEAD' | 'SAFETY_OFFICER' | 'PROGRAM_DIRECTOR' | 'SYSTEM_GOVERNOR';
  escalatedAt: string;
  escalatedBy: string;
  reason: string;
  resolutionNotes?: string;
}

export interface PilotKillSwitchEvent {
  eventId: string;
  siteId: string;
  action:
    | 'PAUSE_MODULE'
    | 'DISABLE_AI'
    | 'PAUSE_SYNC_PEER'
    | 'SET_READ_ONLY'
    | 'SUSPEND_SITE'
    | 'TERMINATE_SITE';
  targetComponent: string;
  initiatedBy: string;
  initiatedAt: string;
  justification: string;
  emergencyCareProtected: true; // Hard Invariant: Emergency care protected even during pilot suspension
  auditSignature: string;
}

export interface PilotAIGovernanceRecord {
  recordId: string;
  siteId: string;
  capability: string;
  modelId: string;
  modelVersion: string;
  knowledgeSourceVersion: string;
  clinicianReviewRequired: true;
  isAutonomousMutationAllowed: false;
  totalAdvisoriesIssued: number;
  clinicianAcceptanceCount: number;
  clinicianRejectionCount: number;
  clinicianOverrideRationaleRecorded: number;
  groundingFailureCount: number;
  immediateDisableTriggered: boolean;
  disableReason?: string;
}

export interface PilotReleaseDeployment {
  deploymentId: string;
  siteId: string;
  softwareVersion: string;
  dbVersion: number;
  stagedStage: 'CANARY' | 'PILOT_ROLLOUT' | 'GENERAL_PILOT';
  rollbackReady: boolean;
  backupChecksumVerified: string;
  postDeploymentVerificationPassed: boolean;
  approvedBy: string;
  deployedAt: string;
  status: 'PLANNED' | 'DEPLOYED' | 'ROLLED_BACK' | 'HELD';
}

export interface PilotChangeRequest {
  requestId: string;
  siteId: string;
  changeType:
    | 'CONFIGURATION'
    | 'UI'
    | 'TECHNICAL'
    | 'CLINICAL_WORKFLOW'
    | 'AI'
    | 'TERMINOLOGY'
    | 'DATA_SCHEMA'
    | 'SECURITY'
    | 'INTEGRATION';
  description: string;
  rationale: string;
  riskAssessment: string;
  revalidationRequired: boolean;
  status: 'PROPOSED' | 'REVIEWED' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED';
  proposedBy: string;
  approvedBy?: string;
  implementedAt?: string;
}

export interface PilotSupportCase {
  caseId: string;
  siteId: string;
  category:
    | 'TRAINING'
    | 'CLINICAL_WORKFLOW'
    | 'TECHNICAL'
    | 'SYNC'
    | 'SECURITY'
    | 'PRIVACY'
    | 'AI'
    | 'DATA_QUALITY'
    | 'HARDWARE'
    | 'CONNECTIVITY';
  priority: 'P1' | 'P2' | 'P3';
  summary: string;
  isSafetyIncident: false; // Strict separation: Support cases are non-safety. If safety-critical, escalated to PilotSafetyIncident.
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  workaroundProvided?: string;
  resolution?: string;
}

export interface PilotDataQualityAudit {
  auditId: string;
  siteId: string;
  completenessScore: number; // 0 - 100
  validityScore: number;     // 0 - 100
  duplicatesFound: number;
  unresolvedIdentityCount: number;
  missingRequiredFieldsCount: number;
  staleRecordsCount: number;
  syncInconsistenciesCount: number;
  auditedAt: string;
  auditedBy: string;
}

export interface PilotTrainingRecord {
  trainingId: string;
  siteId: string;
  userId: string;
  userRole: string;
  courseModule: string;
  trainingType: 'INITIAL' | 'REFRESHER' | 'REMEDIATION' | 'RELEASE_UPDATE';
  completedAt: string;
  observedCompetencyScore: number; // 0 - 100
  verifiedBy: string;
}

export interface PilotUserFeedback {
  feedbackId: string;
  siteId: string;
  type:
    | 'SUGGESTION'
    | 'USABILITY_ISSUE'
    | 'WORKFLOW_PROBLEM'
    | 'SAFETY_CONCERN'
    | 'MISSING_CAPABILITY'
    | 'TRAINING_ISSUE'
    | 'POSITIVE_OBSERVATION';
  comment: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL_SAFETY';
  submittedBy: string;
  linkedChangeRequestId?: string;
  createdAt: string;
}

export interface PilotSiteReport {
  reportId: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  currentPhase: PilotLifecyclePhase;
  softwareVersion: string;
  technicalReliabilitySummary: {
    uptimeScore: number;
    offlineHoursTracked: number;
    syncSuccessRate: number;
    crashCount: number;
  };
  clinicalWorkflowSummary: {
    encountersCompleted: number;
    documentationCompletenessRate: number;
    criticalAlertCount: number;
    overrideRate: number;
  };
  safetySummary: {
    totalIncidents: number;
    nearMisses: number;
    openCAPACount: number;
    unresolvedHighHazards: number;
  };
  aiGovernanceSummary: {
    advisoryUtilizationRate: number;
    clinicianAcceptanceRate: number;
    groundingConcerns: number;
    autonomousMutationsAttempted: 0; // Strictly 0
  };
  recommendedNextPhase: PilotExitDecision;
  disclaimers: string[];
  generatedAt: string;
  generatedBy: string;
  reportHash: string;
}

export interface ExternalIntegrationState {
  integrationName: string;
  configurationState: 'ACTIVE' | 'SANDBOX' | 'NOT_CONFIGURED' | 'SUSPENDED' | 'FAILED_CLOSED';
  trustLevel: 'UNTRUSTED' | 'PROVISIONAL' | 'VERIFIED';
  environment: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  credentialsState: 'UNCONFIGURED' | 'VALID' | 'EXPIRED' | 'REVOKED';
  lastSuccessfulExchange?: string;
  failureNotes?: string;
}
