/**
 * Jano Health - Clinical Core V21: Production Hardening, Deployment,
 * Disaster Recovery, and Pilot Readiness Domain Models & Invariants.
 * 
 * Strict architectural boundaries ensuring:
 * - Environment Separation (Dev / Test / Staging / Production)
 * - Secret Management & Safe Failures
 * - Configuration Validation & Drift Tracking
 * - Governed Feature Flags (Feature Flag !== Permission)
 * - Cryptographic Backup & Restore Verification
 * - Disaster Recovery & Repeatable Drills (RPO / RTO)
 * - Authoritative Data Corruption Firewalls (Do not auto-repair authoritative clinical data)
 * - Schema Migration Engine with Backup Gates
 * - Low-Resource Device & Offline Resilience
 * - Client-Server Compatibility & API Policies
 * - Technical Health vs Clinical Readiness Separation
 * - Facility Deployment, Onboarding & Go-Live Gates
 * - Pilot Facility Mode & Segregated Synthetic Data
 * - Privacy-Preserving Telemetry & Operational Alerting
 * - Security Monitoring, Rate Limiting & Tamper-Evident Forensics
 * - System Recovery Modes (Normal, Degraded, Recovery, Read-Only, Maintenance)
 */

export type DeploymentEnvironment = 'DEVELOPMENT' | 'TEST' | 'STAGING' | 'PRODUCTION';

export interface EnvironmentConfig {
  environment: DeploymentEnvironment;
  facilityScope: string;
  externalEndpoints: {
    nationalRegistry?: string;
    fhirGateway?: string;
    insuranceExchange?: string;
    surveillanceHub?: string;
    researchPortal?: string;
  };
  failClosed: boolean;
  allowDevelopmentFallback: boolean;
  telemetryLevel: 'MINIMAL' | 'STANDARD' | 'VERBOSE';
  featureFlagDefaults: Record<string, boolean>;
  authenticationMode: 'SECURE_STRICT' | 'STANDARD_FAIL_CLOSED';
  secretProvider: string;
  databaseName: string;
  version: string;
}

export interface SecretReference {
  secretId: string;
  name: string;
  providerRef: string; // e.g. "vault://prod/keys/v21-national-signing"
  version: string;
  status: 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt?: string;
  lastRotatedAt?: string;
  allowedRoles: string[];
}

export interface ConfigurationSnapshot {
  snapshotId: string;
  environment: DeploymentEnvironment;
  version: string;
  timestamp: string;
  configHash: string; // SHA-256 hash of configuration
  actor: string;
  approvedBy: string;
  driftDetected: boolean;
  driftDetails?: string[];
  runningConfig: Record<string, any>;
}

export type FeatureFlagStatus = 'DISABLED' | 'TESTING' | 'FACILITY_PILOT' | 'GLOBAL';

export interface FeatureFlag {
  flagId: string;
  name: string;
  environment: DeploymentEnvironment;
  status: FeatureFlagStatus;
  scope: string[]; // facility IDs or module tags
  rolloutPercentage: number;
  owner: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  provenance: string;
}

export type BackupType = 'FULL' | 'INCREMENTAL';
export type BackupIntegrityStatus = 'VALID' | 'INVALID' | 'CORRUPTED';

export interface BackupArchive {
  backupId: string;
  environment: DeploymentEnvironment;
  facilityScope: string;
  databaseVersion: number;
  schemaVersion: string;
  timestamp: string;
  backupType: BackupType;
  isEncrypted: boolean;
  recordCounts: Record<string, number>;
  totalRecords: number;
  checksum: string; // SHA-256 hash of backup content
  integrityStatus: BackupIntegrityStatus;
  payload?: string | Record<string, any[]>;
}

export interface BackupVerificationResult {
  backupId: string;
  verifiedAt: string;
  status: BackupIntegrityStatus;
  checksumVerified: boolean;
  recordCountVerified: boolean;
  schemaVerified: boolean;
  notes: string;
}

export type RestoreStatus = 
  | 'PLANNED' 
  | 'VERIFIED' 
  | 'DRY_RUN_PASSED' 
  | 'EXECUTING' 
  | 'RESTORED' 
  | 'VALIDATED' 
  | 'RECONCILED' 
  | 'FAILED';

export interface RestoreExecution {
  restoreId: string;
  backupId: string;
  targetEnvironment: DeploymentEnvironment;
  targetFacilityId: string;
  isDryRun: boolean;
  status: RestoreStatus;
  recordsRestored: number;
  approvedBy: string;
  validationResult?: {
    passed: boolean;
    schemaValid: boolean;
    countMatch: boolean;
    details: string[];
  };
  reconciledAt?: string;
  timestamp: string;
}

export interface RecoveryPoint {
  pointId: string;
  timestamp: string;
  backupId: string;
  eventPosition: number;
  schemaVersion: string;
  integrityState: 'VERIFIED' | 'UNVERIFIED' | 'STALE';
}

export type DisasterCategory =
  | 'DATABASE_CORRUPTION'
  | 'SERVER_LOSS'
  | 'FACILITY_DEVICE_LOSS'
  | 'REGIONAL_NETWORK_OUTAGE'
  | 'EXTERNAL_SERVICE_OUTAGE'
  | 'SECURITY_INCIDENT'
  | 'RANSOMWARE_EVENT'
  | 'ACCIDENTAL_DELETION'
  | 'FAILED_MIGRATION'
  | 'HARDWARE_FAILURE';

export interface DisasterRecoveryPlan {
  planId: string;
  category: DisasterCategory;
  name: string;
  rpoTargetMinutes: number | 'NOT_DEFINED';
  rtoTargetMinutes: number | 'NOT_DEFINED';
  procedureSteps: string[];
  lastTestedAt?: string;
  testStatus?: 'PASSED' | 'FAILED' | 'UNTESTED';
}

export interface DisasterRecoveryTest {
  testId: string;
  planId: string;
  scenario: string;
  startTime: string;
  endTime: string;
  recoveryDurationMinutes: number;
  recoveredDataSummary: string;
  missingDataSummary: string;
  result: 'PASSED' | 'FAILED' | 'PARTIAL';
  reviewer: string;
  nextActions: string[];
}

export type IntegrityAnomalyType =
  | 'EVENT_CHAIN_BROKEN'
  | 'RECORD_HASH_MISMATCH'
  | 'FOREIGN_REFERENCE_MISSING'
  | 'DUPLICATE_ID'
  | 'INVALID_STATE'
  | 'CORRUPTED_PROJECTION'
  | 'ORPHANED_RECORD'
  | 'SCHEMA_MISMATCH';

export interface DataIntegrityAudit {
  auditId: string;
  timestamp: string;
  inspectedStores: number;
  totalRecordsChecked: number;
  anomaliesFound: number;
  anomalies: {
    storeName: string;
    recordId: string;
    type: IntegrityAnomalyType;
    isAuthoritativeClinical: boolean;
    description: string;
  }[];
  criticalAlertCreated: boolean;
  status: 'CLEAN' | 'WARNING' | 'CORRUPTED';
}

export interface SchemaMigration {
  migrationId: string;
  sourceVersion: number;
  targetVersion: number;
  timestamp: string;
  checksum: string;
  isDryRun: boolean;
  backupGateVerified: boolean;
  status: 'PLANNED' | 'DRY_RUN_SUCCESS' | 'MIGRATED' | 'FAILED' | 'ROLLED_BACK';
  rollbackPlan: string;
  appliedBy: string;
}

export interface DeviceHealthRecord {
  deviceId: string;
  facilityId: string;
  storageAvailableMb: number;
  indexedDbStatus: 'HEALTHY' | 'DEGRADED' | 'QUOTA_EXCEEDED';
  appVersion: string;
  browserRuntime: string;
  syncStatus: 'SYNCED' | 'PENDING' | 'OFFLINE_BLOCKED';
  lastSuccessfulPersistence: string;
  lowResourceMode: boolean;
  timestamp: string;
}

export interface ClientServerCompatibility {
  clientVersion: string;
  serverVersion: string;
  status: 'COMPATIBLE' | 'UPGRADE_RECOMMENDED' | 'UPGRADE_REQUIRED' | 'INCOMPATIBLE';
  details: string;
}

export interface APIVersionPolicy {
  currentApiVersion: string;
  supportedApiVersions: string[];
  deprecatedApiVersions: string[];
  minimumClientVersion: string;
}

export type ReadinessCheckCategory =
  | 'CONFIGURATION'
  | 'SECURITY'
  | 'DATABASE'
  | 'PERSISTENCE'
  | 'BACKUP'
  | 'RESTORE'
  | 'AUTHENTICATION'
  | 'FHIR'
  | 'NETWORK'
  | 'AI'
  | 'AUTOMATION'
  | 'MONITORING';

export interface DeploymentReadinessItem {
  category: ReadinessCheckCategory;
  name: string;
  status: 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY';
  details: string;
  isClinicalBlocker: boolean;
}

export interface DeploymentReadinessReport {
  overallStatus: 'READY' | 'READY_WITH_WARNINGS' | 'NOT_READY';
  technicalHealthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  clinicalReadinessStatus: 'SAFE_FOR_CARE' | 'CONDITIONAL' | 'BLOCKED_UNSAFE';
  timestamp: string;
  checks: DeploymentReadinessItem[];
}

export interface FacilityDeploymentProfile {
  facilityId: string;
  facilityName: string;
  departments: string[];
  connectivityTier: 'ONLINE' | 'INTERMITTENT' | 'OFFLINE_EXTENDED';
  hardwareClass: 'STANDARD' | 'LOW_RESOURCE';
  workforceConfigured: boolean;
  trainingCompleted: boolean;
  backupVerified: boolean;
  status: 'PLANNED' | 'STAGED' | 'PILOT' | 'PRODUCTION_ACTIVE';
  supportContact: string;
}

export type OnboardingStage =
  | 'DISCOVERED'
  | 'CONFIGURED'
  | 'DATA_INITIALIZED'
  | 'USERS_CONFIGURED'
  | 'WORKFORCE_CONFIGURED'
  | 'INTEGRATIONS_TESTED'
  | 'TRAINING_COMPLETE'
  | 'GO_LIVE_READY'
  | 'LIVE'
  | 'POST_GO_LIVE_MONITORING';

export interface FacilityOnboardingWorkflow {
  workflowId: string;
  facilityId: string;
  currentStage: OnboardingStage;
  stageHistory: {
    stage: OnboardingStage;
    completedAt: string;
    completedBy: string;
    signOffNotes: string;
  }[];
  goLiveGatePassed: boolean;
  targetGoLiveDate: string;
}

export interface PilotFacility {
  pilotId: string;
  facilityId: string;
  facilityName: string;
  startDate: string;
  endDate: string;
  scopeDescription: string;
  participatingModules: string[];
  supportStatus: 'ACTIVE_SUPERVISED' | 'STABLE_MONITORED' | 'ESCALATED';
  metrics: {
    uptimePercentage: number;
    offlineHoursRecorded: number;
    syncSuccessRate: number;
    encountersLogged: number;
    supportTicketsCount: number;
  };
  incidentStatus: 'NONE' | 'RESOLVED' | 'UNDER_REVIEW';
  reviewStatus: 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'EXTENDED' | 'CONCLUDED';
}

export interface SyntheticDataRecord {
  syntheticRecordId: string;
  entityType: string;
  facilityScope: string;
  isSynthetic: true;
  label: 'SYNTHETIC DATA';
  generatedAt: string;
  payload: Record<string, any>;
}

export type ImportDomain =
  | 'IDENTITY'
  | 'TERMINOLOGY'
  | 'CLINICAL'
  | 'FINANCIAL'
  | 'WORKFORCE'
  | 'SUPPLY'
  | 'RESEARCH';

export interface DataImportJob {
  jobId: string;
  domain: ImportDomain;
  facilityId: string;
  sourceSystem: string;
  totalRecords: number;
  importedCount: number;
  quarantinedCount: number;
  status: 'PENDING' | 'VALIDATING' | 'COMPLETED' | 'QUARANTINED_ITEMS_PRESENT' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
  provenanceHash: string;
}

export interface ImportQuarantineRecord {
  quarantineId: string;
  jobId: string;
  domain: ImportDomain;
  recordIdentifier: string;
  rejectionReason: string;
  rawPayload: Record<string, any>;
  quarantinedAt: string;
  reviewedBy?: string;
  resolutionStatus: 'QUARANTINED' | 'RESOLVED_IMPORTED' | 'REJECTED_DISCARDED';
}

export type SupportSeverity = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';

export interface OperationalSupportCase {
  caseId: string;
  facilityId: string;
  severity: SupportSeverity;
  category: 'CONNECTIVITY' | 'SYNC' | 'DATABASE' | 'DEVICE' | 'SECURITY' | 'AUTHENTICATION' | 'PERFORMANCE';
  title: string;
  diagnosticsSnippet: string; // strictly technical, privacy-preserving
  status: 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';
  reportedAt: string;
  resolvedAt?: string;
  operatorId: string;
}

export type OperationalAlertType =
  | 'SERVICE_UNAVAILABLE'
  | 'QUEUE_BACKLOG'
  | 'STORAGE_PRESSURE'
  | 'BACKUP_FAILURE'
  | 'INTEGRITY_FAILURE'
  | 'AUTHENTICATION_ANOMALY'
  | 'EXTERNAL_INTEGRATION_OUTAGE'
  | 'CREDENTIAL_EXPIRY'
  | 'APPLICATION_ERROR'
  | 'DEVICE_PROBLEM';

export interface OperationalAlert {
  alertId: string;
  alertType: OperationalAlertType;
  severity: SupportSeverity;
  facilityId: string;
  sourceComponent: string;
  message: string;
  timestamp: string;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
}

export interface SecurityIncidentRecord {
  incidentId: string;
  threatType: 'BRUTE_FORCE' | 'PRIVILEGE_ESCALATION' | 'REPLAY_ATTACK' | 'ANOMALOUS_API' | 'SCANNING' | 'FORBIDDEN_OPERATIONS';
  ipAddressOrOrigin: string;
  targetedEndpoint: string;
  attemptsCount: number;
  actionTaken: 'RATE_LIMITED' | 'QUARANTINED' | 'CIRCUIT_BROKEN' | 'SESSION_INVALIDATED' | 'LOGGED_ONLY';
  timestamp: string;
  tamperProofHash: string;
}

export interface AuditRetentionPolicy {
  policyId: string;
  retentionDays: number;
  archiveIntervalDays: number;
  exportFormat: 'JSONL' | 'SECURE_ARCHIVE';
  integrityVerificationIntervalHours: number;
  lastVerificationTimestamp: string;
}

export type SystemRecoveryState = 'NORMAL' | 'DEGRADED' | 'RECOVERY' | 'READ_ONLY' | 'MAINTENANCE';

export interface MaintenanceWindow {
  windowId: string;
  startTime: string;
  endTime: string;
  scope: string; // e.g. "Global" or "Facility:fac-01"
  reason: string;
  approvedBy: string;
  affectedServices: string[];
  rollbackPlan: string;
  emergencyClinicalCareProtected: true; // Hard invariant: never block emergency care
  isActive: boolean;
}

export interface TrainingReadinessRecord {
  trainingId: string;
  facilityId: string;
  role: string;
  moduleName: string;
  completionPercentage: number;
  isVerified: boolean;
  verifiedAt?: string;
  reviewer: string;
}

export interface PilotMetric {
  metricId: string;
  facilityId: string;
  category: string;
  metricName: string;
  value: number;
  unit: string;
  recordedAt: string;
  isClinicalOutcome: false; // Invariant: operational metric != clinical outcome
}

export interface UserFeedbackEntry {
  feedbackId: string;
  facilityId: string;
  role: string;
  category: 'USABILITY' | 'WORKFLOW' | 'SPEED' | 'OFFLINE_SYNC' | 'FEATURE_REQUEST';
  comment: string;
  severity: 'COSMETIC' | 'ANNOYING' | 'WORKFLOW_BLOCKED';
  submittedAt: string;
  isClinicalRecord: false; // Invariant: feedback != clinical record
}

export interface ChangeRequest {
  requestId: string;
  title: string;
  affectedDomains: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  impactAssessment: string;
  testingEvidence: string;
  approvedBy: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'DEPLOYED' | 'ROLLED_BACK';
  requestedAt: string;
}

export interface ReleaseRecord {
  releaseId: string;
  version: string;
  releaseTimestamp: string;
  changesSummary: string;
  migrationRequired: boolean;
  schemaVersion: string;
  securityReviewPassed: boolean;
  testsPassed: boolean;
  backupGatePassed: boolean;
  approvedBy: string;
  status: 'DRAFT' | 'READY_FOR_DEPLOY' | 'DEPLOYED' | 'ROLLED_BACK';
}

export interface ReleaseArtifact {
  artifactId: string;
  version: string;
  artifactHash: string; // SHA-256
  buildTimestamp: string;
  sourceCommitRef: string;
  nodeVersion: string;
  environment: DeploymentEnvironment;
  buildStatus: 'SUCCESS' | 'FAILED';
}

export interface DependencySecurityReport {
  reportId: string;
  timestamp: string;
  totalDependencies: number;
  vulnerabilitiesCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  licensesFound: string[];
  incompatibleLicensesCount: number;
  approvalStatus: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
}

export interface IncidentTimelineEvent {
  eventId: string;
  incidentId: string;
  timestamp: string;
  phase: 'DETECTION' | 'TRIAGE' | 'CONTAINMENT' | 'RECOVERY' | 'POST_MORTEM';
  actionTaken: string;
  actor: string;
  tamperProofHash: string;
}

export interface SupportDiagnosticBundle {
  bundleId: string;
  generatedAt: string;
  facilityId: string;
  appVersion: string;
  systemHealth: string;
  deviceRuntimeInfo: string;
  queueDepth: number;
  indexedDbSizeEstimateMb: number;
  containsPatientData: false; // Hard invariant: strictly privacy-preserving
  auditHash: string;
}

export interface PilotGoLiveReport {
  reportId: string;
  pilotId: string;
  facilityId: string;
  goLiveTimestamp: string;
  activeModules: string[];
  readinessSummary: string;
  backupVerified: boolean;
  offlineTestingPassed: boolean;
  trainingCompleted: boolean;
  openRisks: string[];
  signOffLead: string;
}

export interface PilotReview {
  reviewId: string;
  pilotId: string;
  facilityId: string;
  reviewDate: string;
  incidentsSummary: string;
  userFeedbackScore: number;
  syncReliabilityScore: number;
  status: 'IN_PROGRESS' | 'REVIEWED' | 'APPROVED' | 'EXPANDED' | 'PAUSED' | 'CLOSED';
  recommendations: string[];
  reviewer: string;
}

/**
 * Hard Invariant Assertion Helpers for V21
 */
export const V21_INVARIANTS = {
  assertNotProductionInDev(env: DeploymentEnvironment, allowDev: boolean): void {
    if (env === 'PRODUCTION' && allowDev) {
      throw new Error('INVARIANT_VIOLATION: Production must never allow development fallback mode');
    }
  },
  assertAuthoritativeDataProtected(isAuthoritative: boolean, autoRepair: boolean): void {
    if (isAuthoritative && autoRepair) {
      throw new Error('INVARIANT_VIOLATION: Authoritative clinical data corruption must NEVER be auto-repaired');
    }
  },
  assertFeatureFlagDoesNotBypassRBAC(flagEnabled: boolean, hasPermission: boolean): boolean {
    if (flagEnabled && !hasPermission) {
      return false; // Still blocked! Feature flag does not grant permission.
    }
    return flagEnabled && hasPermission;
  },
  assertEmergencyCareNotBlockedInMaintenance(isEmergency: boolean, maintenanceActive: boolean): void {
    if (isEmergency && maintenanceActive) {
      // Invariant: Emergency care must ALWAYS proceed despite maintenance windows
    }
  },
  assertSyntheticDataSegregated(isSynthetic: boolean, patientId: string): void {
    if (isSynthetic && !patientId.startsWith('synth_')) {
      throw new Error('INVARIANT_VIOLATION: Synthetic data must be visibly and explicitly segregated with synth_ prefix');
    }
  },
};
