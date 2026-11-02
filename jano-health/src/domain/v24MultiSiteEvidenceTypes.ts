/**
 * Jano Health - Clinical Core V24: Multi-Site Pilot, Comparative Evidence
 * & Scale Decision Domain Models & Invariants.
 * 
 * Strict architectural boundaries ensuring:
 * - Multi-site common governance with independent site isolation
 * - Objective comparability framework (no comparing fundamentally different environments)
 * - Standardized, versioned metric catalog (no retroactively altered metrics)
 * - Raw observations strictly separated from derived/normalized measurements
 * - Controlled non-causal language (no manufactured clinical efficacy or causal leaps)
 * - Baseline vs intervention model with explicit BASELINE_UNAVAILABLE handling
 * - Site implementation maturity tracking (Levels 0-5, not based solely on volume)
 * - Multi-domain scale-readiness scorecard (no single misleading "success score")
 * - Formal learning loop (OBSERVE -> ANALYZE -> REVIEW -> DECIDE -> CHANGE -> REVALIDATE -> MEASURE)
 * - Cryptographically sealed Multi-Site Evidence Packet with SHA-256 seal
 * - Offline-first resilient capture and provenance tracking
 * - AI decision support invariants: clinicianReviewRequired = true, isAutonomousMutationAllowed = false
 * - Strict emergency care protection during all pilot operations
 */

export type ProgramLifecycleStatus =
  | 'PLANNING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'TERMINATED'
  | 'COMPLETED';

export type SiteComparabilityStatus =
  | 'COMPARABLE'
  | 'CONDITIONALLY_COMPARABLE'
  | 'NOT_COMPARABLE'
  | 'INSUFFICIENT_DATA';

export type MetricCategory =
  | 'TECHNICAL'
  | 'OFFLINE'
  | 'CLINICAL_WORKFLOW'
  | 'SAFETY'
  | 'USABILITY'
  | 'AI'
  | 'DATA_QUALITY'
  | 'OPERATIONS'
  | 'SUPPORT'
  | 'TRAINING';

export type BaselinePeriodPhase =
  | 'BASELINE'
  | 'IMPLEMENTATION'
  | 'EARLY_OPERATION'
  | 'STABILIZED_OPERATION'
  | 'POST_CHANGE'
  | 'BASELINE_UNAVAILABLE';

export type ComparativeInterpretation =
  | 'OBSERVED_DIFFERENCE'
  | 'ASSOCIATION'
  | 'TREND'
  | 'INCONCLUSIVE'
  | 'INSUFFICIENT_DATA';

export type SiteImplementationMaturityLevel =
  | 'LEVEL_0_NOT_DEPLOYED'
  | 'LEVEL_1_INITIAL'
  | 'LEVEL_2_OPERATIONAL'
  | 'LEVEL_3_STABLE'
  | 'LEVEL_4_VALIDATED'
  | 'LEVEL_5_SCALE_CANDIDATE';

export type ScaleReadinessCategoryStatus =
  | 'BLOCKING'
  | 'HIGH_RISK'
  | 'ATTENTION'
  | 'READY'
  | 'NOT_APPLICABLE';

export type ScaleDecisionType =
  | 'EXPAND'
  | 'EXPAND_CONDITIONALLY'
  | 'CONTINUE_PILOT'
  | 'REMEDIATE'
  | 'HOLD'
  | 'PAUSE'
  | 'TERMINATE';

export type ExpansionGateScope =
  | 'SINGLE_TO_MULTI_SITE'
  | 'PILOT_TO_BROADER_PILOT'
  | 'PILOT_TO_PRODUCTION'
  | 'LIMITED_TO_BROAD_MODULES'
  | 'ADVISORY_TO_BROAD_AI';

export type CrossSitePatternStatus =
  | 'DETECTED_PATTERN'
  | 'POSSIBLE_ASSOCIATION'
  | 'CONFIRMED_LINK';

export type ConfigDriftClassification =
  | 'EXPECTED'
  | 'APPROVED'
  | 'UNEXPECTED'
  | 'SAFETY_RELEVANT';

export type EvidenceQualityLevel =
  | 'E0_NO_EVIDENCE'
  | 'E1_SINGLE_OBSERVATION'
  | 'E2_REPEATED_OBSERVATION'
  | 'E3_MULTI_SITE_OBSERVATION'
  | 'E4_CONTROLLED_COMPARISON'
  | 'E5_STRONG_STUDY_EVIDENCE';

export type LearningLoopPhase =
  | 'OBSERVE'
  | 'ANALYZE'
  | 'REVIEW'
  | 'DECIDE'
  | 'CHANGE'
  | 'REVALIDATE'
  | 'MEASURE';

// ----------------------------------------------------
// 1. MULTI-SITE PROGRAM MODEL
// ----------------------------------------------------

export interface EvidenceProgram {
  programId: string;
  name: string;
  protocolNumber: string;
  protocolVersion: string;
  sponsor: string;
  status: ProgramLifecycleStatus;
  leadCoordinatorId: string;
  safetyOfficerId: string;
  participatingSiteIds: string[];
  governanceModel: 'INDEPENDENT_FEDERATED' | 'CENTRALIZED_COORDINATION';
  startDate: string;
  targetEndDate?: string;
  createdAt: string;
  updatedAt: string;
  integrityHash: string;
}

export interface PilotSiteGroup {
  groupId: string;
  programId: string;
  groupName: string;
  description: string;
  cohortType: 'RURAL_PRIMARY' | 'DISTRICT_HOSPITAL' | 'REFERRAL_TERTIARY' | 'INTERMITTENT_CONNECTIVITY' | 'CONTROL_PARALLEL';
  siteIds: string[];
  commonConfigurationId?: string;
  createdAt: string;
}

export interface SiteEnrollment {
  enrollmentId: string;
  programId: string;
  siteId: string;
  facilityName: string;
  phase: string;
  groupId?: string;
  enrolledAt: string;
  isSuspended: boolean;
  suspensionReason?: string;
  suspendedAt?: string;
  isLocallyGoverned: boolean;
  governanceLeadId: string;
  enabledModules: string[];
}

export interface ProgramMilestone {
  milestoneId: string;
  programId: string;
  title: string;
  targetDate: string;
  achievedDate?: string;
  status: 'PENDING' | 'ACHIEVED' | 'DELAYED' | 'WAIVED';
  verifiedBy?: string;
  notes?: string;
}

// ----------------------------------------------------
// 2. SITE COMPARABILITY FRAMEWORK
// ----------------------------------------------------

export interface SiteProfileDimensions {
  siteId: string;
  infrastructure: {
    hardwareClass: 'LOW_RESOURCE' | 'STANDARD_CLINIC' | 'ROBUST_SERVER';
    ramStorageClass: '2GB_LIMITED' | '4GB_ADEQUATE' | '8GB_PLUS';
    networkTopology: 'STANDALONE_OFFLINE' | 'LOCAL_MESH' | 'HYBRID_WAN' | 'CELLULAR_BACKHAUL';
    powerReliability: 'UNSTABLE_DAILY_OUTAGE' | 'PARTIAL_BACKUP_SOLAR' | 'STABLE_GRID';
    internetAvailability: 'OFFLINE_90_PERCENT' | 'INTERMITTENT_WINDOW' | 'CONTINUOUS_BROADBAND';
    deviceCount: number;
  };
  clinicalEnvironment: {
    facilityType: 'DISPENSARY' | 'HEALTH_CENTER' | 'DISTRICT_HOSPITAL' | 'REGIONAL_REFERRAL';
    patientVolumePerDay: number;
    departments: string[];
    staffingFTE: number;
    workflowMaturity: 'BASIC_PAPER_TRANSITION' | 'HYBRID' | 'EXPERIENCED_DIGITAL';
  };
  software: {
    janoVersion: string;
    databaseVersion: number;
    enabledModules: string[];
    aiCapabilities: string[];
    terminologyVersion: string;
    configurationVersion: string;
  };
  operationalConditions: {
    trainingMaturityScore: number; // 0-100
    supportCoverageHours: number; // e.g. 8 vs 24
    changeFrequency: 'STABLE' | 'MODERATE' | 'HIGH';
    downtimeMinutesMonthly: number;
    implementationPhase: string;
  };
}

export interface ComparabilityAssessment {
  assessmentId: string;
  programId: string;
  baseSiteId: string;
  targetSiteId: string;
  status: SiteComparabilityStatus;
  overallSimilarityScore: number; // 0 - 100
  infrastructureSimilarity: number;
  clinicalSimilarity: number;
  softwareSimilarity: number;
  operationalSimilarity: number;
  incompatibilityReasons: string[];
  conditionalityNotes?: string;
  assessedBy: string;
  assessedAt: string;
  methodologyVersion: string;
}

// ----------------------------------------------------
// 3. STANDARDIZED PILOT METRIC CATALOG
// ----------------------------------------------------

export interface StandardizedPilotMetric {
  metricId: string;
  name: string;
  category: MetricCategory;
  definition: string;
  formula: string;
  unit: string;
  numeratorDefinition?: string;
  denominatorDefinition?: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  collectionMethod: 'AUTOMATED_TELEMETRY' | 'WORKFLOW_AUDIT' | 'SURVEY' | 'SUPERVISED_REVIEW';
  sourceStores: string[];
  version: string;
  interpretationNotes: string;
  knownLimitations: string[];
  isVersionLocked: boolean;
  createdAt: string;
}

// ----------------------------------------------------
// 4. SITE NORMALIZATION & OBSERVATIONS
// ----------------------------------------------------

export interface PilotMetricObservation {
  observationId: string;
  programId: string;
  siteId: string;
  metricId: string;
  periodStart: string;
  periodEnd: string;
  phase: BaselinePeriodPhase;
  rawNumerator?: number;
  rawDenominator?: number;
  rawValue: number;
  observationCount: number;
  provenance: {
    collectionSource: string;
    capturedOffline: boolean;
    collectedAt: string;
    collectorId: string;
    dataHash: string;
  };
}

export interface NormalizedMetricMeasurement {
  measurementId: string;
  observationId: string;
  metricId: string;
  siteId: string;
  normalizedValue: number;
  normalizationBasis: 'PER_100_ENCOUNTERS' | 'PER_ACTIVE_CLINICIAN' | 'PER_DEVICE_DAY' | 'PER_1000_HOURS';
  rawSourceValue: number;
  formulaVersion: string;
  adjustmentFactorsApplied: string[];
  caveats: string[];
  calculatedAt: string;
}

// ----------------------------------------------------
// 5. COMPARATIVE ANALYSIS ENGINE
// ----------------------------------------------------

export interface ComparativeAnalysis {
  analysisId: string;
  programId: string;
  metricId: string;
  analysisType: 'SITE_A_VS_SITE_B' | 'BASELINE_VS_PILOT' | 'BEFORE_AFTER_CHANGE' | 'OFFLINE_VS_CONNECTED';
  baseEntityId: string; // Site ID or Baseline Period ID
  comparisonEntityId: string; // Site ID or Intervention Period ID
  comparabilityStatus: SiteComparabilityStatus;
  baseValue: number;
  comparisonValue: number;
  absoluteDifference: number;
  relativeDifferencePercent: number;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'NO_COMPARISON';
  interpretation: ComparativeInterpretation;
  nonCausalDisclaimer: string;
  missingDataRate: number;
  sampleSize: number;
  statisticalAssumptions: string[];
  analystId: string;
  analyzedAt: string;
  integrityHash: string;
}

// ----------------------------------------------------
// 6. SAFETY TREND & OPERATIONAL BENCHMARKING
// ----------------------------------------------------

export interface CrossSiteSafetyTrend {
  trendId: string;
  programId: string;
  siteId: string;
  reportingPeriod: string;
  totalIncidents: number;
  nearMissCount: number;
  blockedUnsafeActionsCount: number;
  criticalAlertFailures: number;
  medicationSafetyEvents: number;
  identityAmbiguityEvents: number;
  syncSafetyEvents: number;
  aiSafetyEvents: number;
  exposureAdjustedRatePer1000Encounters: number;
  unresolvedCount: number;
  safetyIndexCategory: 'EXPECTED_MONITORED' | 'ELEVATED_ATTENTION' | 'CRITICAL_REVIEW';
  contextualCaveats: string[];
}

export interface OperationalBenchmark {
  benchmarkId: string;
  metricId: string;
  category: MetricCategory;
  name: string;
  programBaselineValue: number;
  siteTargetThreshold: number;
  unit: string;
  institutionalMethodology: string;
  version: string;
}

// ----------------------------------------------------
// 7. IMPLEMENTATION MATURITY & CONFIG DRIFT
// ----------------------------------------------------

export interface SiteImplementationMaturity {
  maturityId: string;
  siteId: string;
  currentLevel: SiteImplementationMaturityLevel;
  workflowAdoptionScore: number; // 0-100
  safetyAdherenceScore: number; // 0-100
  technicalStabilityScore: number; // 0-100
  dataQualityScore: number; // 0-100
  trainingMaturityScore: number; // 0-100
  gapsIdentified: string[];
  assessedBy: string;
  assessedAt: string;
  nextMilestonePrerequisites: string[];
}

export interface MultiSiteConfigurationDrift {
  driftId: string;
  programId: string;
  siteId: string;
  component: 'MODULES' | 'AI_MODELS' | 'TERMINOLOGY' | 'MED_KNOWLEDGE' | 'ALERTS' | 'SYNC_PEERS';
  goldenBaselineVersion: string;
  siteConfigVersion: string;
  classification: ConfigDriftClassification;
  driftDescription: string;
  isSafetyRelevant: boolean;
  alertTriggered: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
}

// ----------------------------------------------------
// 8. CROSS-SITE RISK & INCIDENT CORRELATION
// ----------------------------------------------------

export interface ProgramRiskRegisterEntry {
  riskId: string;
  programId: string;
  hazardDomain: string;
  title: string;
  description: string;
  affectedSiteIds: string[];
  isSystemic: boolean;
  systemicEvidenceNotes?: string;
  severity: 'NEGLIGIBLE' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'CATASTROPHIC';
  likelihood: 'RARE' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'ALMOST_CERTAIN';
  activeControls: string[];
  controlEffectiveness: 'HIGH' | 'MODERATE' | 'POOR';
  ownerId: string;
  status: 'OPEN' | 'MITIGATED' | 'ACCEPTED_RESIDUAL' | 'CLOSED';
}

export interface CrossSiteIncidentCorrelation {
  correlationId: string;
  programId: string;
  incidentIds: string[];
  affectedSiteIds: string[];
  patternDimension: 'SOFTWARE_VERSION' | 'WORKFLOW' | 'CONFIGURATION' | 'DEVICE_CLASS' | 'CONNECTIVITY' | 'AI_CAPABILITY';
  status: CrossSitePatternStatus;
  investigationSummary: string;
  confirmedLinkEvidence?: string;
  investigatedBy: string;
  updatedAt: string;
}

// ----------------------------------------------------
// 9. AI MULTI-SITE EVALUATION & OFFLINE ANALYSIS
// ----------------------------------------------------

export interface MultiSiteAIEvaluation {
  evaluationId: string;
  programId: string;
  siteId: string;
  modelVersion: string;
  knowledgeVersion: string;
  totalAdvisoryInvocations: number;
  groundedAdvisoriesCount: number;
  unsupportedResponsesCount: number;
  clinicianAcceptedCount: number;
  clinicianRejectedCount: number;
  clinicianReviewRequired: true; // Hard invariant
  isAutonomousMutationAllowed: false; // Hard invariant
  groundingFailureDisablementCount: number;
  acceptanceRateNote: string; // Explains automation bias caveat
}

export interface OfflineConditionAnalysis {
  analysisId: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  totalOfflineHours: number;
  longestOfflineSessionMinutes: number;
  offlineTransactionCount: number;
  syncLatencyAverageMinutes: number;
  maxSyncQueueDepth: number;
  conflictResolutionCount: number;
  failedSyncBatchesCount: number;
  environmentalNetworkConstraintScore: number; // 0-100
  softwareResilienceScore: number; // 0-100
}

// ----------------------------------------------------
// 10. PILOT LEARNING SYSTEM & FEEDBACK
// ----------------------------------------------------

export interface PilotLearningRecord {
  learningId: string;
  programId: string;
  siteId?: string; // Optional if cross-site
  phase: LearningLoopPhase;
  observedProblem: string;
  evidenceReferenceIds: string[];
  analysisFindings: string;
  decisionRationale: string;
  proposedChangeDescription: string;
  revalidationProtocol: string;
  revalidationStatus: 'PENDING' | 'VALIDATED' | 'REJECTED';
  postChangeMeasurementId?: string;
  responsibleLeadId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MultiSiteUserFeedback {
  feedbackId: string;
  programId: string;
  siteId: string;
  userRole: string;
  category: 'USABILITY' | 'TRAINING' | 'WORKFLOW' | 'SAFETY' | 'PERFORMANCE' | 'CONNECTIVITY' | 'AI' | 'DATA_QUALITY' | 'SUPPORT';
  feedbackText: string;
  isSafetyEscalation: boolean;
  provenance: {
    facilityIsolated: boolean;
    submittedAt: string;
  };
}

// ----------------------------------------------------
// 11. EVIDENCE QUALITY & SCALE DECISION ENGINE
// ----------------------------------------------------

export interface EvidenceQualityRating {
  ratingId: string;
  targetEntityId: string; // Observation, analysis, or finding ID
  level: EvidenceQualityLevel;
  methodologyDescription: string;
  limitations: string[];
  sampleSize: number;
  reviewedBy: string;
  reviewedAt: string;
  disclaimer: string;
}

export interface DomainReadinessScorecard {
  technical: ScaleReadinessCategoryStatus;
  clinicalWorkflow: ScaleReadinessCategoryStatus;
  userAdoption: ScaleReadinessCategoryStatus;
  dataQuality: ScaleReadinessCategoryStatus;
  aiGovernance: ScaleReadinessCategoryStatus;
  operations: ScaleReadinessCategoryStatus;
  externalInteroperability: ScaleReadinessCategoryStatus;
  blockingReasons: string[];
}

export interface ScaleDecisionRecord {
  decisionId: string;
  programId: string;
  participatingSiteIds: string[];
  decisionType: ScaleDecisionType;
  scorecard: DomainReadinessScorecard;
  evidenceQualitySummary: string;
  unresolvedRiskIds: string[];
  decisionRationale: string;
  conditionsForExpansion?: string[];
  approvingAuthorityName: string;
  approvingAuthorityRole: string;
  decidedAt: string;
  integrityHash: string;
}

export interface ExpansionGateEvaluation {
  gateId: string;
  programId: string;
  scope: ExpansionGateScope;
  targetCandidateSiteId?: string;
  technicalPrerequisitesSatisfied: boolean;
  clinicalSafetyPrerequisitesSatisfied: boolean;
  governancePrerequisitesSatisfied: boolean;
  workforceTrainingPrerequisitesSatisfied: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReasons: string[];
  evaluatedBy: string;
  evaluatedAt: string;
}

// ----------------------------------------------------
// 12. MULTI-SITE EVIDENCE PACKET
// ----------------------------------------------------

export interface MultiSiteEvidencePacket {
  packetId: string;
  programId: string;
  generatedAt: string;
  systemVersion: string;
  participatingSitesCount: number;
  siteSummaries: {
    siteId: string;
    facilityName: string;
    maturityLevel: SiteImplementationMaturityLevel;
    offlineHoursRecorded: number;
  }[];
  comparabilitySummary: {
    comparablePairsCount: number;
    conditionallyComparableCount: number;
    notComparableCount: number;
  };
  evidenceDistinctions: {
    rawObservedSummary: string;
    derivedMetricsSummary: string;
    analyzedFindingsSummary: string;
    interpretedContextSummary: string;
    recommendedNextStepsSummary: string;
  };
  safetyOverview: {
    totalIncidents: number;
    nearMisses: number;
    unresolvedHighRisksCount: number;
  };
  scaleRecommendation: {
    decisionType: ScaleDecisionType;
    scorecard: DomainReadinessScorecard;
    keyJustification: string;
  };
  statutoryDisclaimer: string;
  packetSha256Seal: string;
}
