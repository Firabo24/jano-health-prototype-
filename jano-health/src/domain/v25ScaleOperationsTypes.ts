/**
 * Jano Health — Clinical Core V25
 * SCALE READINESS, PRODUCTION ROLLOUT & COMMERCIAL OPERATIONS
 *
 * Domain types, invariants, and structures for enterprise tenancy, deployment factory,
 * device/node fleet, release orchestration, scale performance, production observability,
 * service management, commercial entitlements, and production operations.
 */

// ============================================================================
// 1. ORGANIZATION & TENANCY
// ============================================================================

export type DeploymentEnvironment = 'DEV' | 'TEST' | 'STAGING' | 'CANARY' | 'PRODUCTION';

export interface Tenant {
  tenantId: string;
  name: string;
  slug: string;
  region: string;
  isolationMode: 'STRICT_LOGICAL' | 'PHYSICAL_PARTITION' | 'AIR_GAPPED';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationGroup {
  groupId: string;
  tenantId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Organization {
  organizationId: string;
  tenantId: string;
  groupId?: string;
  name: string;
  jurisdiction: string;
  region: string;
  customerAccountId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FacilityHierarchy {
  facilityId: string;
  organizationId: string;
  tenantId: string;
  name: string;
  facilityType: 'PRIMARY_CARE_CLINIC' | 'DISTRICT_HOSPITAL' | 'REFERRAL_CENTER' | 'MOBILE_OUTPOST';
  region: string;
  departments: Department[];
  isProvisioned: boolean;
  activeDeploymentId?: string;
  createdAt: string;
}

export interface Department {
  departmentId: string;
  facilityId: string;
  name: string;
  units: Unit[];
}

export interface Unit {
  unitId: string;
  departmentId: string;
  name: string;
  bedCapacity?: number;
}

export interface DeviceGroup {
  groupId: string;
  tenantId: string;
  organizationId: string;
  facilityId?: string;
  name: string;
  policyProfile: string;
  deviceCount: number;
}

// ============================================================================
// 2. PRODUCTION DEPLOYMENT FACTORY
// ============================================================================

export type DeploymentLifecyclePhase =
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

export interface DeploymentTemplate {
  templateId: string;
  name: string;
  version: string;
  environment: DeploymentEnvironment;
  targetFacilityType: string;
  defaultModules: string[];
  defaultRoleSet: string[];
  defaultTopologyRole: string;
  createdAt: string;
}

export interface DeploymentPackage {
  packageId: string;
  templateId: string;
  softwareReleaseVersion: string;
  databaseSchemaVersion: number;
  configVersion: string;
  checksumSha256: string;
  approvedForEnvironments: DeploymentEnvironment[];
  createdAt: string;
}

export interface DeploymentStep {
  stepIndex: number;
  phase: DeploymentLifecyclePhase;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  executedAt?: string;
  executedBy?: string;
  notes?: string;
}

export interface DeploymentExecution {
  deploymentId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  packageId: string;
  environment: DeploymentEnvironment;
  currentPhase: DeploymentLifecyclePhase;
  databaseVersion: number;
  configurationVersion: string;
  deploymentEngineerId: string;
  approvedBy: string;
  steps: DeploymentStep[];
  startedAt: string;
  completedAt?: string;
  result: 'IN_PROGRESS' | 'SUCCESS' | 'ROLLED_BACK' | 'FAILED';
  verificationHash: string;
}

export interface DeploymentRollback {
  rollbackId: string;
  deploymentId: string;
  reason: string;
  triggeredBy: string;
  previousVersion: string;
  previousDbVersion: number;
  restoredBackupId: string;
  executedAt: string;
  verificationPassed: boolean;
}

// ============================================================================
// 3. FACILITY PROVISIONING
// ============================================================================

export interface FacilityProvisioningRecord {
  provisioningId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  templateId: string;
  approvedRoles: string[];
  approvedModules: string[];
  terminologyCatalogVersion: string;
  medicationKnowledgeVersion: string;
  syncTopologyRole: 'STANDALONE_EDGE' | 'FACILITY_NODE' | 'FACILITY_HUB' | 'DISTRICT_NETWORK_NODE' | 'CLOUD_CONNECTED_NODE';
  deviceProfile: string;
  backupConfig: {
    schedule: string;
    retentionDays: number;
    destination: string;
  };
  telemetryConfig: {
    piiRedactionEnforced: boolean;
    samplingRatePct: number;
  };
  supportRoutingQueue: string;
  externalIntegrationIds: string[];
  deviationsFromBaseline: string[];
  provisionedAt: string;
  status: 'PROVISIONED' | 'CONFIGURED' | 'ACTIVE' | 'DECOMMISSIONED';
}

// ============================================================================
// 4. DEVICE & EDGE FLEET
// ============================================================================

export type DeviceLifecycleState =
  | 'REGISTERED'
  | 'PROVISIONING'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'QUARANTINED'
  | 'RETIRED';

export interface EdgeDeviceRecord {
  deviceId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  hardwareModel: string;
  serialNumber: string;
  softwareVersion: string;
  dbVersion: number;
  storageCapacityBytes: number;
  storageUsedBytes: number;
  lifecycleState: DeviceLifecycleState;
  securityState: 'COMPLIANT' | 'NEEDS_PATCH' | 'ISOLATED' | 'COMPROMISED';
  isOfflineOperational: boolean;
  nodeAssignmentId: string;
  lastSyncAt: string;
  quarantineReason?: string;
  registeredAt: string;
}

// ============================================================================
// 5. DISTRIBUTED TOPOLOGY
// ============================================================================

export type TopologyRole =
  | 'STANDALONE_EDGE'
  | 'FACILITY_NODE'
  | 'FACILITY_HUB'
  | 'DISTRICT_NETWORK_NODE'
  | 'CLOUD_CONNECTED_NODE';

export interface TopologyNodeRecord {
  nodeId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  topologyRole: TopologyRole;
  endpointUrl?: string;
  peerNodeIds: string[];
  trustState: 'VERIFIED_MUTUAL_TLS' | 'LOCAL_SUBNET_TRUST' | 'PROVISIONAL' | 'UNTRUSTED';
  softwareVersion: string;
  dbVersion: number;
  syncHealth: 'SYNCHRONIZED' | 'SYNC_IN_PROGRESS' | 'BEHIND_SCHEDULE' | 'STALLED';
  lastHeartbeatAt: string;
}

// ============================================================================
// 6. RELEASE ORCHESTRATION & PROGRESSIVE ROLLOUT
// ============================================================================

export type RolloutStage =
  | 'CANARY'
  | 'LIMITED_COHORT'
  | 'CONTROLLED_COHORT'
  | 'BROADER_COHORT'
  | 'ORGANIZATION';

export interface ReleaseCandidate {
  releaseId: string;
  version: string;
  targetEnvironment: DeploymentEnvironment;
  codeSha256: string;
  dbVersion: number;
  v22SafetyGatePassed: boolean;
  v24EvidencePassed: boolean;
  isClinicallySignificant: boolean;
  approvedByClinicalAuthority?: string;
  approvedByDeploymentLead?: string;
  createdAt: string;
}

export interface RolloutWave {
  waveId: string;
  releaseId: string;
  stage: RolloutStage;
  targetFacilities: string[];
  completedFacilities: string[];
  failedFacilities: string[];
  migrationVerified: boolean;
  rollbackPlanTested: boolean;
  isPaused: boolean;
  haltReason?: string;
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// 7. CAPACITY & SCALE ENGINE
// ============================================================================

export interface CapacityObservation {
  observationId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  timestamp: string;
  cpuUtilizationPct: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  idbStoreCount: number;
  transactionVolumePerHour: number;
  syncQueueDepth: number;
  apiLoadRps: number;
  concurrentUsers: number;
  activeNodesCount: number;
  backupSizeBytes: number;
  telemetryVolumeBytesPerHour: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  projectedSaturationDays?: number;
  assumptions: string[];
  recommendedAction?: string;
}

// ============================================================================
// 8. SCALE PERFORMANCE TESTING
// ============================================================================

export interface ScalePerformanceMetrics {
  testId: string;
  executedAt: string;
  datasetMetrics: {
    patientCount: number;
    encounterCount: number;
    medicationCount: number;
    labCount: number;
    radiologyCount: number;
    referralCount: number;
    auditLedgerCount: number;
    syncQueueDepth: number;
  };
  readLatencyMs: number;
  writeLatencyMs: number;
  searchLatencyMs: number;
  startupDurationMs: number;
  syncLatencyMs: number;
  memoryPressureMb: number;
  storageGrowthRateMbPerDay: number;
  recoveryDurationSec: number;
  meetsConstrainedDeviceTarget: boolean;
}

// ============================================================================
// 9. PRODUCTION OBSERVABILITY
// ============================================================================

export interface ServiceHealthObservation {
  healthId: string;
  tenantId: string;
  facilityId: string;
  serviceName: string;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  latencyP95Ms: number;
  errorRatePct: number;
  storagePressurePct: number;
  queueDepth: number;
  syncLagSec: number;
  dependencyStatus: 'ALL_ONLINE' | 'PARTIAL_FALLBACK' | 'OFFLINE_ISOLATED';
  privacyPreserved: true; // Hard invariant: zero PII in telemetry
  piiRedacted: true;
  observedAt: string;
}

// ============================================================================
// 10. SERVICE MANAGEMENT & SLA POLICIES
// ============================================================================

export interface ServiceLevelPolicy {
  policyId: string;
  tenantId: string;
  organizationId: string;
  facilityProfile: 'RURAL_FACILITY' | 'DISTRICT_FACILITY' | 'NETWORK_NODE' | 'ENTERPRISE_ORG';
  targets: {
    criticalAckMinutes: number;
    criticalResponseMinutes: number;
    criticalRecoveryMinutes: number;
    highResponseMinutes: number;
    mediumResponseHours: number;
  };
  actualAchievedAverages?: {
    criticalAckMinutes: number;
    criticalResponseMinutes: number;
    criticalRecoveryMinutes: number;
  };
  note: string; // Explains target vs achieved separation
}

// ============================================================================
// 11. PRODUCTION SUPPORT
// ============================================================================

export type SupportCaseType = 'SERVICE_REQUEST' | 'SERVICE_INCIDENT' | 'PROBLEM_RECORD';
export type SupportSeverity = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';

export interface SupportCaseRecord {
  caseId: string;
  tenantId: string;
  organizationId: string;
  facilityId: string;
  caseType: SupportCaseType;
  severity: SupportSeverity;
  title: string;
  description: string;
  queue: string;
  assignedEngineerId?: string;
  status: 'NEW' | 'ASSIGNED' | 'IN_INVESTIGATION' | 'RESOLVED' | 'CLOSED';
  // Strict separation invariants:
  isClinicalSafetyIncident: false; // Must be false! If safety incident, routed to V22/V23 Clinical Safety Register
  isSecurityIncident: boolean;
  isPrivacyIncident: boolean;
  escalationThresholdMinutes: number;
  createdAt: string;
  resolvedAt?: string;
}

// ============================================================================
// 12. CUSTOMER / ORGANIZATION COMMERCIAL LIFECYCLE
// ============================================================================

export type CustomerLifecycleState =
  | 'PROSPECT'
  | 'ONBOARDING'
  | 'ACTIVE'
  | 'EXPANSION'
  | 'SUSPENDED'
  | 'OFFBOARDING'
  | 'CLOSED';

export interface CustomerAccountRecord {
  accountId: string;
  tenantId: string;
  organizationId: string;
  companyName: string;
  lifecycleState: CustomerLifecycleState;
  primaryContact: {
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  commercialNotes: string;
  containsPatientData: false; // Hard invariant: commercial accounts contain zero clinical data
  onboardedAt?: string;
  createdAt: string;
}

// ============================================================================
// 13. COMMERCIAL ENTITLEMENTS & EDITIONS
// ============================================================================

export type ProductEdition = 'CORE' | 'PROFESSIONAL' | 'NETWORK' | 'ENTERPRISE';

export interface CommercialEntitlementRecord {
  entitlementId: string;
  tenantId: string;
  organizationId: string;
  edition: ProductEdition;
  allowedModules: string[];
  allowedFeatures: string[];
  aiEntitlement: {
    tier: 'NONE' | 'STANDARD_ADVISORY' | 'ADVANCED_CLINICAL_ADVISORY';
    monthlyQuotaEncounters: number;
  };
  facilityLimit: number;
  deviceLimit: number;
  userLimit: number;
  validUntil: string;
  // Hard invariants:
  neverOverridesSafetyControls: true;
  neverBypassesRbac: true;
  neverWeakensOfflineCare: true;
  neverAltersClinicalSourceOfTruth: true;
}

// ============================================================================
// 14. COMMERCIAL FINANCE (SEPARATED FROM V15 PATIENT CLINICAL FINANCE)
// ============================================================================

export interface CommercialSubscriptionRecord {
  subscriptionId: string;
  tenantId: string;
  organizationId: string;
  edition: ProductEdition;
  billingCycle: 'MONTHLY' | 'ANNUAL' | 'MULTI_YEAR';
  status: 'ACTIVE' | 'DELINQUENT' | 'CANCELLED';
  currentTermEnd: string;
  // Absolute separation invariant:
  isClinicalPayerLedger: false; // Never touches V15 claims or patient coverage!
}

// ============================================================================
// 15. CONTRACT METADATA
// ============================================================================

export interface CommercialContractRecord {
  contractId: string;
  tenantId: string;
  organizationId: string;
  contractNumber: string;
  version: string;
  servicePackage: string;
  deploymentScopeFacilitiesCount: number;
  effectiveDate: string;
  expirationDate: string;
  isLegalAdviceSubstitute: false; // Disclaimer: metadata only, not legal counsel
  disclaimer: string;
}

// ============================================================================
// 16. IMPLEMENTATION PROJECTS
// ============================================================================

export type ImplementationProjectPhase =
  | 'DISCOVERY'
  | 'DESIGN'
  | 'CONFIGURATION'
  | 'DATA_PREPARATION'
  | 'TRAINING'
  | 'PILOT'
  | 'GO_LIVE'
  | 'STABILIZATION'
  | 'HANDOVER';

export interface ImplementationProjectRecord {
  projectId: string;
  tenantId: string;
  organizationId: string;
  facilityIds: string[];
  currentPhase: ImplementationProjectPhase;
  progressPct: number;
  milestones: Array<{
    name: string;
    phase: ImplementationProjectPhase;
    isCompleted: boolean;
    dueDate: string;
  }>;
  openRisksCount: number;
  handoverSignoffBy?: string;
  targetGoLiveDate: string;
  createdAt: string;
}

// ============================================================================
// 17. DATA MIGRATION AT SCALE
// ============================================================================

export interface ScaleMigrationPackage {
  migrationId: string;
  tenantId: string;
  facilityId: string;
  sourceSystemName: string;
  mappingVersion: string;
  totalRecordsProcessed: number;
  successfullyImportedRecords: number;
  quarantinedRecordsCount: number;
  rejectedRecordsCount: number;
  reconciliationStatus: 'RECONCILED' | 'UNRESOLVED_DISCREPANCY' | 'PENDING_REVIEW';
  silentDiscardOccurred: false; // Hard invariant: zero silent drops
  migrationVerifiedBy: string;
  completedAt?: string;
}

// ============================================================================
// 18. EXTERNAL INTEROPERABILITY ONBOARDING
// ============================================================================

export type IntegrationLifecycleState =
  | 'ADAPTER_EXISTS'
  | 'CONFIGURED'
  | 'SUCCESSFULLY_EXCHANGING'
  | 'AUTHORIZED_PRODUCTION_RELATIONSHIP';

export interface ExternalSystemIntegrationRecord {
  integrationId: string;
  organizationId: string;
  systemName: string;
  systemType: 'NATIONAL_REGISTRY' | 'REGIONAL_LAB' | 'INSURANCE_CLEARINGHOUSE' | 'SURVEILLANCE_PORTAL';
  fhirVersion?: string;
  currentState: IntegrationLifecycleState;
  trustState: 'VERIFIED' | 'PROVISIONAL' | 'UNVERIFIED';
  environment: DeploymentEnvironment;
  lastSuccessfulExchangeAt?: string;
  failureCountLast30Days: number;
  isFabricated: false; // Non-fabrication guarantee
}

// ============================================================================
// 19. SECURITY OPERATIONS
// ============================================================================

export type SecuritySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export interface SecurityFindingRecord {
  findingId: string;
  tenantId: string;
  facilityId?: string;
  severity: SecuritySeverity;
  category: 'AUTH_ANOMALY' | 'AUTHZ_FAILURE' | 'SECRET_EXPIRY' | 'CONFIG_DRIFT' | 'SUSPICIOUS_TRAFFIC';
  title: string;
  description: string;
  remediationPlan: string;
  status: 'OPEN' | 'IN_REMEDIATION' | 'MITIGATED' | 'CLOSED';
  isInvestigatedBreach: boolean; // Never classified as breach without empirical forensic confirmation
  detectedAt: string;
  resolvedAt?: string;
}

// ============================================================================
// 20. SOFTWARE SUPPLY-CHAIN INTEGRITY
// ============================================================================

export interface SupplyChainIntegrityRecord {
  recordId: string;
  releaseVersion: string;
  sourceGitRevision: string;
  buildRevision: string;
  lockfileHash: string;
  sbomReference: string;
  artifactSha256Hash: string;
  isDigitalSignature: false; // Disclaimed: SHA-256 hash is a digest, not a legal digital signature
  vulnerabilityStatus: 'CLEAN' | 'NON_CRITICAL_ACCEPTED' | 'VULNERABILITY_FOUND';
  verifiedAt: string;
}

// ============================================================================
// 21. DATA GOVERNANCE & OFFBOARDING
// ============================================================================

export interface DataGovernancePolicyRecord {
  policyId: string;
  tenantId: string;
  classificationRules: {
    clinicalDataRetentionYears: number; // Configurable per jurisdiction
    auditLogRetentionYears: number;
    telemetryRetentionDays: number;
    supportTicketRetentionDays: number;
  };
  commercialTerminationDeletesClinicalRecords: false; // Strict safety invariant
  updatedAt: string;
}

export interface CustomerExportPackageRecord {
  exportId: string;
  tenantId: string;
  organizationId: string;
  requestedBy: string;
  scope: 'COMMERCIAL_METADATA' | 'OPERATIONAL_TELEMETRY' | 'AUTHORIZED_PATIENT_RECORDS';
  archiveSha256Hash: string;
  authorizedByOfficer: string;
  exportedAt: string;
  deliveryStatus: 'READY' | 'DELIVERED' | 'ARCHIVED';
}

// ============================================================================
// 22. BUSINESS CONTINUITY DRILLS
// ============================================================================

export type DrillScenarioType =
  | 'SITE_LOSS'
  | 'FLEET_LOSS'
  | 'NODE_LOSS'
  | 'REGIONAL_OUTAGE'
  | 'SYNC_BACKLOG'
  | 'FAILED_MIGRATION'
  | 'FAILED_RELEASE'
  | 'RANSOMWARE_SCENARIO';

export interface BusinessContinuityDrillRecord {
  drillId: string;
  tenantId: string;
  facilityId: string;
  scenario: DrillScenarioType;
  plannedRtoMinutes: number;
  actualRtoMinutes: number;
  plannedRpoMinutes: number;
  actualRpoMinutes: number;
  dataDeltaRecordsCount: number;
  unresolvedWeaknesses: string[];
  evidenceBackedSuccess: boolean;
  executedAt: string;
  nextScheduledDrill: string;
}

// ============================================================================
// 23. OPERATIONAL ECONOMICS
// ============================================================================

export type CostClassification = 'OBSERVED_COST' | 'ESTIMATED_COST' | 'FORECAST_COST';

export interface OperationalEconomicsRecord {
  costId: string;
  tenantId: string;
  organizationId: string;
  scaleTier: 'SMALL' | 'MEDIUM' | 'LARGE' | 'NETWORK_SCALE';
  classification: CostClassification;
  currency: string;
  hardwareCostPerFacilityMonth: number;
  connectivityCostPerMonth: number;
  implementationLaborCost: number;
  supportCostPerMonth: number;
  cloudConsumptionPerMonth: number;
  storageAndBackupCostPerMonth: number;
  assumptions: string[];
  noFabricatedRoiDisclaimer: true; // Hard invariant: zero fabricated ROI claims
  recordedAt: string;
}

// ============================================================================
// 24. SCALE GOVERNANCE GATES & PRODUCTION SCALE READINESS PACKET
// ============================================================================

export interface ScaleGovernanceGates {
  technicalGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  clinicalGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  operationalGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  securityGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  dataGovernanceGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  commercialGate: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  overallScaleGate: 'APPROVED_FOR_SCALE' | 'CONDITIONAL_ROLLOUT' | 'BLOCKED';
  blockingReasons: string[];
}

export type ReadinessItemLabel =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'DERIVED'
  | 'ESTIMATED'
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'EXTERNALLY_REQUIRED';

export interface LabeledReadinessItem {
  key: string;
  category: string;
  value: string;
  label: ReadinessItemLabel;
  verificationEvidence?: string;
}

export interface ProductionScaleReadinessPacket {
  packetId: string;
  tenantId: string;
  organizationId: string;
  softwareVersion: string;
  dbVersion: number;
  gates: ScaleGovernanceGates;
  labeledItems: LabeledReadinessItem[];
  tamperEvidentSha256Seal: string;
  approvedByAuthority: string;
  statutoryDisclaimer: string;
  generatedAt: string;
}

// ============================================================================
// 25. SCALE-AWARE AI GOVERNANCE
// ============================================================================

export interface ScaleAIGovernanceRecord {
  governanceId: string;
  organizationId: string;
  facilityId: string;
  modelIdentifier: string;
  modelVersion: string;
  knowledgeBaseVersion: string;
  validationScopeCertified: boolean;
  clinicianReviewRequired: true; // Permanent invariant
  isAutonomousMutationAllowed: false; // Permanent invariant
  isSafetyBlocked: boolean;
  groundingValidationP99Pct: number;
  fallbackBehavior: 'HUMAN_CLINICIAN_ONLY';
  updatedAt: string;
}
