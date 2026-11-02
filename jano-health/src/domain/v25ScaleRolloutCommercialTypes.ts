/**
 * Jano Health - Clinical Core V25: Scale Readiness, Production Rollout & Commercial Operations
 * Domain Models & Invariants
 * 
 * Strict architectural boundaries:
 * - Clear distinction between Organization, Facility, Deployment, Device, User, and Patient.
 * - Multi-tenant isolation with deny-by-default cross-tenant boundaries.
 * - Separation between Patient Healthcare Financing (V15) and Jano Commercial Billing (V25).
 * - Commercial entitlements can NEVER override clinical safety, audit, or mandatory emergency care.
 * - Staged release orchestration with rollback readiness and progressive canary waves.
 * - Deterministic, non-autonomous scale governance gates (A through G).
 * - Cryptographic hash distinguished from digital signatures.
 * - Advisory AI safety invariants preserved: clinicianReviewRequired = true, isAutonomousMutationAllowed = false.
 */

// ----------------------------------------------------
// 1. ORGANIZATION & DEPLOYMENT HIERARCHY
// ----------------------------------------------------

export type OrganizationType =
  | 'MINISTRY_OF_HEALTH'
  | 'REGIONAL_HEALTH_AUTHORITY'
  | 'FAITH_BASED_NETWORK'
  | 'NGO_HUMANITARIAN'
  | 'PRIVATE_HOSPITAL_GROUP'
  | 'ACADEMIC_MEDICAL_CONSORTIUM';

export type OrganizationLifecycleStatus =
  | 'PROSPECT'
  | 'ONBOARDING'
  | 'ACTIVE'
  | 'EXPANSION'
  | 'SUSPENDED'
  | 'OFFBOARDING'
  | 'CLOSED';

export type DeploymentEnvironment =
  | 'DEV'
  | 'TEST'
  | 'STAGING'
  | 'CANARY'
  | 'PRODUCTION';

export type DeploymentTopologyRole =
  | 'STANDALONE_EDGE'
  | 'FACILITY_NODE'
  | 'FACILITY_HUB'
  | 'DISTRICT_NETWORK_NODE'
  | 'CLOUD_CONNECTED_NODE';

export interface ProductionOrganization {
  orgId: string;
  name: string;
  type: OrganizationType;
  jurisdictionCountry: string;
  primaryRegion: string;
  status: OrganizationLifecycleStatus;
  primaryContactName: string;
  primaryContactEmail: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationGroup {
  groupId: string;
  orgId: string;
  groupName: string;
  groupType: 'REGION' | 'FACILITY_CLUSTER' | 'SPECIALTY_NETWORK' | 'PILOT_COHORT';
  facilityIds: string[];
  createdAt: string;
}

export interface ProductionTenant {
  tenantId: string;
  orgId: string;
  subdomain: string;
  environment: DeploymentEnvironment;
  configurationVersion: string;
  securityStatus: 'COMPLIANT' | 'NEEDS_REVIEW' | 'SUSPENDED';
  deploymentStatus: 'PROVISIONING' | 'DEPLOYED' | 'MAINTENANCE' | 'ARCHIVED';
  enabledFeatureFlagKeys: string[];
  dataIsolationBoundary: 'LOGICAL_DATABASE_SCOPED' | 'PHYSICAL_ENCRYPTED_ISOLATE';
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------
// 2. FLEET & TOPOLOGY MANAGEMENT
// ----------------------------------------------------

export type DeviceFleetLifecycle =
  | 'REGISTERED'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'QUARANTINED'
  | 'RETIRED';

export interface FleetDevice {
  deviceId: string;
  tenantId: string;
  facilityId: string;
  hardwareClass: 'LOW_RESOURCE_TABLET' | 'STANDARD_WORKSTATION' | 'RUGGED_HANDHELD' | 'FACILITY_SERVER';
  operatingSystem: string;
  janoVersion: string;
  databaseSchemaVersion: number;
  availableStorageMb: number;
  totalStorageMb: number;
  batteryHealthPercent?: number;
  lastHeartbeatAt: string;
  lastSyncAt: string;
  consecutiveOfflineHours: number;
  lifecycle: DeviceFleetLifecycle;
  quarantineReason?: string;
  registeredAt: string;
  updatedAt: string;
}

export interface FleetTopologyNode {
  nodeId: string;
  tenantId: string;
  facilityId: string;
  topologyRole: DeploymentTopologyRole;
  meshPeerNodeIds: string[];
  trustState: 'VERIFIED' | 'REVOKED' | 'PROVISIONAL';
  janoVersion: string;
  databaseSchemaVersion: number;
  syncHealth: 'HEALTHY' | 'SYNC_LAG' | 'CONFLICT_STORM' | 'ISOLATED';
  lastUpstreamSyncAt: string;
  registeredAt: string;
}

// ----------------------------------------------------
// 3. DEPLOYMENT FACTORY & ROLLOUT WAVES
// ----------------------------------------------------

export type DeploymentWorkflowStage =
  | 'DISCOVER'
  | 'CONFIGURE'
  | 'VALIDATE'
  | 'PROVISION'
  | 'BACKUP'
  | 'DEPLOY'
  | 'VERIFY'
  | 'ACTIVATE'
  | 'MONITOR'
  | 'HANDOFF';

export type DeploymentExecutionStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'VERIFIED'
  | 'ACTIVATED'
  | 'ROLLED_BACK'
  | 'FAILED';

export interface DeploymentTemplate {
  templateId: string;
  name: string;
  targetFacilityTier: 'DISPENSARY' | 'HEALTH_CENTER' | 'DISTRICT_HOSPITAL' | 'REFERRAL_TERTIARY';
  targetTopologyRole: DeploymentTopologyRole;
  defaultModules: string[];
  defaultTerminologyVersion: string;
  defaultMedKnowledgeVersion: string;
  backupCadenceHours: number;
  telemetryProfile: 'STANDARD_PRIVACY' | 'MINIMAL_OFFLINE';
  version: string;
  createdAt: string;
}

export interface DeploymentPlan {
  planId: string;
  tenantId: string;
  facilityId: string;
  templateId: string;
  targetReleaseVersion: string;
  stage: DeploymentWorkflowStage;
  siteSpecificConfigOverrides: Record<string, any>;
  authorizedBy: string;
  authorizedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentExecution {
  executionId: string;
  planId: string;
  tenantId: string;
  facilityId: string;
  status: DeploymentExecutionStatus;
  currentStep: DeploymentWorkflowStage;
  stepResults: {
    stage: DeploymentWorkflowStage;
    status: 'PASSED' | 'FAILED' | 'SKIPPED';
    executedAt: string;
    details: string;
  }[];
  backupReferenceId?: string;
  rollbackPlanRef?: string;
  executedBy: string;
  startedAt: string;
  completedAt?: string;
}

export interface ProductionRelease {
  releaseId: string;
  releaseTag: string; // e.g. "v25.0.0"
  gitCommitHash: string;
  sbomSha256: string;
  artifactSha256: string;
  clinicalValidationGateId: string;
  changelogSummary: string;
  isEmergencyHotfix: boolean;
  status: 'DRAFT' | 'CANDIDATE' | 'APPROVED' | 'DEPLOYED' | 'DEPRECATED' | 'REVOKED';
  approvedBy: string;
  approvedAt: string;
  createdAt: string;
}

export interface ReleaseWave {
  waveId: string;
  releaseId: string;
  waveIndex: number;
  waveScope: 'CANARY' | 'LIMITED_COHORT' | 'CONTROLLED_COHORT' | 'BROADER_COHORT' | 'ORGANIZATION_WIDE' | 'FULL_SCALE';
  targetFacilityIds: string[];
  minimumCanaryHours: number;
  healthThresholdPercent: number; // e.g. 98%
  status: 'SCHEDULED' | 'IN_FLIGHT' | 'VERIFIED' | 'HALTED' | 'COMPLETED';
  startedAt?: string;
  completedAt?: string;
}

// ----------------------------------------------------
// 4. CAPACITY & OBSERVABILITY
// ----------------------------------------------------

export interface ProductionCapacityForecast {
  forecastId: string;
  tenantId: string;
  horizonDays: number;
  projectedPatientRecords: number;
  projectedEncounterVolume: number;
  projectedStorageMb: number;
  storageGrowthRateMbPerDay: number;
  estimatedMemoryPressureMb: number;
  warningThresholdBreached: boolean;
  criticalThresholdBreached: boolean;
  recommendedAction: string;
  assumptionsExposed: string[];
  calculatedAt: string;
}

export interface ProductionObservabilitySnapshot {
  snapshotId: string;
  tenantId: string;
  facilityId: string;
  nodeId: string;
  serviceHealth: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  readLatencyP95Ms: number;
  writeLatencyP95Ms: number;
  activeSyncQueueDepth: number;
  errorRatePercent: number;
  storageUtilizationPercent: number;
  indexedDbStoreCount: number;
  privacyTelemetryRedacted: true; // Hard invariant
  capturedAt: string;
}

// ----------------------------------------------------
// 5. SERVICE LEVEL & SUPPORT OPERATIONS
// ----------------------------------------------------

export interface ServiceLevelPolicy {
  policyId: string;
  tenantId: string;
  orgId: string;
  tierName: 'STANDARD_RURAL' | 'PRIORITY_DISTRICT' | 'MISSION_CRITICAL_HUB' | 'ENTERPRISE_NETWORK';
  targetSeverityP0AckMinutes: number;
  targetSeverityP0ResolutionHours: number;
  targetSeverityP1AckMinutes: number;
  targetSeverityP1ResolutionHours: number;
  supportAvailabilityHours: 'BUSINESS_HOURS' | 'EXTENDED_12_HOURS' | '24_7_MISSION_CRITICAL';
  isUniversalSlaClaimForbidden: true; // Hard invariant
  configuredAt: string;
}

export interface CustomerAccount {
  accountId: string;
  orgId: string;
  accountName: string;
  tier: 'STANDARD' | 'PROFESSIONAL' | 'NETWORK' | 'ENTERPRISE';
  assignedCustomerSuccessLeadId: string;
  status: 'ACTIVE' | 'AT_RISK' | 'CHURN_PENDING' | 'RENEWAL_EXPANDING';
  healthScore: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicket {
  ticketId: string;
  tenantId: string;
  facilityId: string;
  orgId: string;
  category: 'HARDWARE' | 'SYNC_CONNECTIVITY' | 'USABILITY' | 'CONFIGURATION' | 'USER_ACCESS' | 'BILLING_INQUIRY';
  severity: 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';
  title: string;
  description: string;
  status: 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  isPotentialClinicalSafetyEvent: boolean; // If true, must cross-link to Clinical Safety Officer
  crossLinkedSafetyIncidentId?: string;
  createdById: string;
  assignedToId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ServiceIncident {
  incidentId: string;
  tenantId: string;
  title: string;
  affectedFacilityIds: string[];
  severity: 'MAJOR' | 'MODERATE' | 'MINOR';
  rootCauseCategory: 'NETWORK_CARRIER' | 'POWER_OUTAGE' | 'HARDWARE_FAULT' | 'SOFTWARE_REGRESSION' | 'STORAGE_PRESSURE';
  remediationSummary: string;
  downtimeMinutes: number;
  status: 'ACTIVE' | 'RESOLVED' | 'POSTMORTEM_COMPLETED';
  openedAt: string;
  resolvedAt?: string;
}

// ----------------------------------------------------
// 6. COMMERCIAL CONTRACTS & ENTITLEMENTS (STRICTLY SEPARATE FROM PATIENT FINANCING)
// ----------------------------------------------------

export interface CommercialContract {
  contractId: string;
  orgId: string;
  contractNumber: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  productEdition: 'CORE' | 'PROFESSIONAL' | 'NETWORK' | 'ENTERPRISE';
  contractedFacilityCount: number;
  contractedDeviceLimit: number;
  includedSupportTier: string;
  isLegalAdviceDisclaimerAcknowledged: true; // Hard invariant
  commercialTermsStatus: 'EXECUTED' | 'DRAFT' | 'AMENDED' | 'TERMINATED';
  createdAt: string;
}

export interface CommercialEntitlement {
  entitlementId: string;
  contractId: string;
  orgId: string;
  tenantId: string;
  featureKey: string;
  maximumQuota?: number;
  currentConsumption: number;
  isSafetyCritical: boolean;
  canOverrideClinicalSafety: false; // HARD INVARIANT: Commercial rules NEVER disable clinical safety
  expiresAt: string;
}

export interface CommercialInvoice {
  invoiceId: string;
  contractId: string;
  orgId: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  currency: 'USD' | 'EUR' | 'TZS' | 'KES' | 'ETB';
  amountTotal: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'DISPUTED';
  isPatientClaim: false; // HARD INVARIANT: Strictly commercial, not patient healthcare claim
  issuedAt: string;
}

// ----------------------------------------------------
// 7. IMPLEMENTATION PROJECTS & MIGRATION AT SCALE
// ----------------------------------------------------

export interface ImplementationProject {
  projectId: string;
  orgId: string;
  projectName: string;
  currentPhase: 'DISCOVERY' | 'DESIGN' | 'CONFIGURATION' | 'DATA_PREPARATION' | 'TRAINING' | 'PILOT' | 'GO_LIVE' | 'STABILIZATION' | 'HANDOVER';
  targetGoLiveDate: string;
  actualGoLiveDate?: string;
  leadProjectManagerId: string;
  progressPercent: number; // 0-100
  unresolvedRisksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScaleDataMigration {
  migrationJobId: string;
  tenantId: string;
  facilityId: string;
  sourceSystemType: 'LEGACY_EHR_EXPORT' | 'PAPER_REGISTRY_CSV' | 'DHIS2_AGGREGATE' | 'OPENMRS_MIGRATION';
  totalSourceRecords: number;
  transformedRecordsCount: number;
  quarantinedRecordsCount: number;
  rejectedRecordsCount: number;
  dryRunPassed: boolean;
  isReconciliationVerified: boolean;
  reconciliationAuditNotes: string;
  approvedBy: string;
  executedAt?: string;
  status: 'PROFILED' | 'DRY_RUN' | 'APPROVED' | 'MIGRATED' | 'FAILED';
}

// ----------------------------------------------------
// 8. SECURITY OPERATIONS & SUPPLY CHAIN
// ----------------------------------------------------

export interface SecurityOperationFinding {
  findingId: string;
  tenantId?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
  category: 'AUTH_ANOMALY' | 'CONFIG_DRIFT' | 'EXPIRED_SECRET' | 'VULNERABILITY' | 'ANOMALOUS_TRAFFIC';
  description: string;
  affectedComponent: string;
  status: 'OPEN' | 'INVESTIGATING' | 'REMEDIATED' | 'EXCEPTION_APPROVED';
  exceptionExpiryDate?: string;
  detectedAt: string;
  remediatedAt?: string;
}

export interface VulnerabilityRecord {
  vulnerabilityId: string;
  cveIdentifier?: string;
  packageName: string;
  affectedVersionRange: string;
  remediationStatus: 'PATCH_AVAILABLE' | 'COMPENSATING_CONTROL_ACTIVE' | 'EXCEPTION_GRANTED' | 'RESOLVED';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  compensatingControlDescription?: string;
  ownerId: string;
  createdAt: string;
  reviewedAt: string;
}

// ----------------------------------------------------
// 9. CONTINUITY DRILLS & OPERATIONAL ECONOMICS
// ----------------------------------------------------

export interface ScaleContinuityDrill {
  drillId: string;
  drillType: 'SITE_ISOLATION' | 'DEVICE_FLEET_LOSS' | 'SERVER_CRASH' | 'PROLONGED_SYNC_BACKLOG' | 'ROLLBACK_EXECUTION';
  plannedRpoMinutes: number;
  actualRpoMinutes: number;
  plannedRtoMinutes: number;
  actualRtoMinutes: number;
  rpoAchieved: boolean;
  rtoAchieved: boolean;
  evidenceNotes: string;
  conductedBy: string;
  conductedAt: string;
}

export interface DeploymentCostLedger {
  costEntryId: string;
  orgId: string;
  facilityId: string;
  category: 'HARDWARE' | 'CONNECTIVITY' | 'SUPPORT_LABOR' | 'TRAINING' | 'STORAGE_INFRA' | 'MAINTENANCE';
  costType: 'OBSERVED' | 'ESTIMATED' | 'FORECAST';
  amountUsd: number;
  currencyOriginal: string;
  periodMonth: string; // "2026-03"
  justificationNotes: string;
  recordedAt: string;
}

export interface CustomerHealthScore {
  scoreId: string;
  orgId: string;
  overallScore: number; // 0-100
  adoptionEngagementScore: number;
  trainingCompetencyScore: number;
  supportTicketBurdenScore: number;
  releaseStabilityScore: number;
  safetyAdherenceScore: number;
  expansionReadiness: 'READY' | 'CONDITIONAL' | 'BLOCKED';
  blockers: string[];
  assessedAt: string;
}

// ----------------------------------------------------
// 10. SCALE GATES (A–G) & PRODUCTION READINESS PACKET
// ----------------------------------------------------

export type ScaleReadinessGateCategory =
  | 'GATE_A_TECHNICAL'
  | 'GATE_B_CLINICAL'
  | 'GATE_C_OPERATIONAL'
  | 'GATE_D_SECURITY'
  | 'GATE_E_DATA'
  | 'GATE_F_COMMERCIAL'
  | 'GATE_G_FINAL_SCALE';

export interface ScaleReadinessGateEvaluation {
  evaluationId: string;
  orgId: string;
  targetReleaseVersion: string;
  gateCategory: ScaleReadinessGateCategory;
  prerequisitesVerified: boolean;
  blockingReasons: string[];
  status: 'PENDING' | 'PASSED' | 'FAILED';
  evaluatedBy: string;
  evaluatedAt: string;
}

export type EvidenceItemState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'DERIVED'
  | 'ESTIMATED'
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'EXTERNALLY_REQUIRED';

export interface ProductionScalePacket {
  packetId: string;
  orgId: string;
  organizationName: string;
  targetReleaseVersion: string;
  generatedAt: string;
  gatesPassed: {
    gate: ScaleReadinessGateCategory;
    passed: boolean;
    state: EvidenceItemState;
  }[];
  facilityCount: number;
  deviceFleetCount: number;
  technicalReadinessSummary: string;
  clinicalSafetySummary: string;
  operationalSupportSummary: string;
  securityComplianceSummary: string;
  commercialStatusSummary: string;
  knownLimitations: string[];
  unresolvedBlockers: string[];
  approvingAuthorityName: string;
  approvingAuthorityRole: string;
  integrityHash: string; // SHA-256 seal (distinguished from digital signature)
}

export interface ProductionChangeRequest {
  requestId: string;
  orgId: string;
  title: string;
  reason: string;
  riskSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedFacilityIds: string[];
  affectedReleaseTag: string;
  isEmergencyChange: boolean;
  retrospectiveReviewCompleted: boolean;
  rollbackPlanSummary: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'ROLLED_BACK';
  requestedBy: string;
  approvedBy?: string;
  executedAt?: string;
}
