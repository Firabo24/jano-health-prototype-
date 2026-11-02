/**
 * Jano Health - Clinical Core V14: Population & Health Intelligence Domain Types
 * 
 * Defines canonical aggregates, analytical facts, metric definitions,
 * cohorts, syndromic signals, demand forecasting, reporting packages,
 * privacy protection rules, and operational telemetry.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Plane A (Clinical Care) ≠ Plane B (Interoperability) ≠ Plane C (Population Intelligence)
 * 2. Patient Record ≠ Analytical Fact (anonymized/aggregated by default)
 * 3. Metric Definition ≠ Metric Value (formal versioned formulas)
 * 4. Observed Data ≠ Forecast (explicit labeling of estimations)
 * 5. No Report ≠ Zero Cases (strict missing data propagation)
 * 6. Signal ≠ Confirmed Outbreak (statistical watch/escalation state machine)
 * 7. AI Insight ≠ Clinical Order or Policy Decision (human review required)
 * 8. Analytics never mutates clinical source of truth (read-derived only)
 * 9. Small-cell privacy suppression protects individual re-identification
 * 10. External adapters (DHIS2/HMIS) fail-closed (UNAVAILABLE/SANDBOX default)
 */

import { RoleType } from './types';

// ============================================================================
// 1. ANALYTICAL FACT MODELS
// ============================================================================

export type FactDomain =
  | 'clinical'
  | 'service'
  | 'encounter'
  | 'laboratory'
  | 'radiology'
  | 'medication'
  | 'dispensing'
  | 'inventory'
  | 'referral'
  | 'emergency'
  | 'facility';

export type FactDataQualityStatus = 'VALID' | 'WARNING' | 'INCOMPLETE' | 'CORRECTED';

export interface BaseFact {
  factId: string;
  sourceEventId: string;
  sourceAggregateId: string;
  sourceFacilityId: string;
  sourceNodeId?: string;
  eventTimestamp: string;
  ingestionTimestamp: string;
  reportingPeriod: string; // YYYY-MM or YYYY-Www or YYYY-MM-DD
  dimensions: Record<string, string | number | boolean | null | undefined>;
  measures: Record<string, number>;
  provenance: {
    actorId?: string;
    actorRole?: RoleType | string;
    systemVersion: string;
    sourceType: 'DOMAIN_EVENT' | 'REBUILD' | 'BATCH_AGGREGATE';
  };
  dataQualityStatus: FactDataQualityStatus;
  correctionVersion: number;
  integrityHash: string; // SHA-256
}

export interface ClinicalFact extends BaseFact {
  factType: 'CLINICAL';
  diagnosisCode?: string;
  codingSystem?: string;
  certainty?: string;
  isChronic?: boolean;
}

export interface ServiceFact extends BaseFact {
  factType: 'SERVICE';
  serviceCategory: string;
  departmentId?: string;
}

export interface EncounterFact extends BaseFact {
  factType: 'ENCOUNTER';
  encounterType: string;
  disposition?: string;
  durationMinutes?: number;
  ageYears?: number;
  gender?: string;
}

export interface LaboratoryFact extends BaseFact {
  factType: 'LABORATORY';
  testCode: string;
  testCategory: string;
  isAbnormal: boolean;
  isCritical: boolean;
  turnaroundMinutes?: number;
  specimenRejectionReason?: string;
}

export interface RadiologyFact extends BaseFact {
  factType: 'RADIOLOGY';
  modality: string;
  bodySite: string;
  isCriticalFinding: boolean;
  turnaroundMinutes?: number;
}

export interface MedicationFact extends BaseFact {
  factType: 'MEDICATION';
  medicationCode: string;
  genericName: string;
  route: string;
  quantityPrescribed: number;
}

export interface DispensingFact extends BaseFact {
  factType: 'DISPENSING';
  medicationCode: string;
  quantityDispensed: number;
  wasStockAvailable: boolean;
}

export interface InventoryFact extends BaseFact {
  factType: 'INVENTORY';
  itemId: string;
  stockLevel: number;
  daysOfSupply?: number;
  isStockout: boolean;
  nearExpiryUnits: number;
  wastedUnits: number;
}

export interface ReferralFact extends BaseFact {
  factType: 'REFERRAL';
  destinationFacilityId: string;
  specialty: string;
  urgency: string;
  status: string;
  acceptanceDurationHours?: number;
  transitHours?: number;
  hasOutcome: boolean;
}

export interface EmergencyFact extends BaseFact {
  factType: 'EMERGENCY';
  triageLevel: string; // SATS Category
  arrivalMode: string;
  waitTimeMinutes?: number;
  disposition: string;
  isTransferred: boolean;
}

export interface FacilityFact extends BaseFact {
  factType: 'FACILITY';
  operationalCapacityStatus: CapacityStatus;
  reportingCompletenessPercent: number;
}

export type AnalyticalFact =
  | ClinicalFact
  | ServiceFact
  | EncounterFact
  | LaboratoryFact
  | RadiologyFact
  | MedicationFact
  | DispensingFact
  | InventoryFact
  | ReferralFact
  | EmergencyFact
  | FacilityFact;

// ============================================================================
// 2. TIME & GEOGRAPHIC DIMENSIONS
// ============================================================================

export type TimeGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface TimeWindow {
  startDate: string;
  endDate: string;
  granularity: TimeGranularity;
}

export type AggregationLevel =
  | 'facility'
  | 'facility_group'
  | 'district'
  | 'region'
  | 'network'
  | 'system';

export interface GeographicDimension {
  facilityId: string;
  locality?: string;
  district: string;
  region: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface GeographicHierarchy {
  country: string;
  regions: Array<{
    name: string;
    districts: Array<{
      name: string;
      facilities: string[];
    }>;
  }>;
}

// ============================================================================
// 3. METRIC DEFINITIONS & VERSIONING
// ============================================================================

export type MetricDomain = 'clinical' | 'service' | 'operational' | 'access' | 'quality';

export type AggregationMethod =
  | 'SUM'
  | 'COUNT'
  | 'AVG'
  | 'RATE'
  | 'RATIO'
  | 'PERCENTAGE'
  | 'MEDIAN'
  | 'P90';

export interface MetricDefinition {
  metricId: string;
  name: string;
  description: string;
  domain: MetricDomain;
  numeratorDescription: string;
  denominatorDescription?: string;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  dimensions: string[];
  defaultTimeframe: TimeGranularity;
  aggregationMethod: AggregationMethod;
  version: number;
  status: 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
  provenance: {
    author: string;
    effectiveFrom: string;
    effectiveTo?: string;
    rationale?: string;
  };
}

export interface MetricSeriesPoint {
  period: string; // ISO date / bucket
  timestamp: string;
  value: number;
  numeratorValue?: number;
  denominatorValue?: number;
  dimensions?: Record<string, string | number>;
  version: number;
  isSuppressed?: boolean;
  dataCompletenessPercent: number;
}

export interface MetricResult {
  metricId: string;
  metricName: string;
  version: number;
  aggregationLevel: AggregationLevel;
  scopeId: string;
  timeWindow: TimeWindow;
  points: MetricSeriesPoint[];
  summaryValue: number;
  isSuppressed: boolean;
  completenessPercent: number;
  integrityHash: string;
  generatedAt: string;
}

export interface MetricCorrectionLineage {
  id: string;
  metricId: string;
  version: number;
  period: string;
  scopeId: string;
  originalValue: number;
  correctedValue: number;
  correctionTimestamp: string;
  source: string;
  reason: string;
  actorId: string;
  recalculatedAt: string;
}

// ============================================================================
// 4. COHORT ENGINE & PRIVACY PROTECTION
// ============================================================================

export interface CohortCriteria {
  ageMin?: number;
  ageMax?: number;
  sex?: 'male' | 'female' | 'other' | 'all';
  facilityIds?: string[];
  serviceTypes?: string[];
  encounterTypes?: string[];
  diagnosisCategories?: string[]; // ICD-10 or clinical chapter
  symptomCategories?: string[];
  labFindings?: string[];
  radiologyFindings?: string[];
  medicationCodes?: string[];
  referralStatuses?: string[];
  emergencyTriageLevels?: string[];
  timePeriod?: {
    from: string;
    to: string;
  };
}

export interface CohortDefinition {
  cohortId: string;
  name: string;
  description: string;
  criteria: CohortCriteria;
  version: number;
  authorId: string;
  authorRole: RoleType | string;
  authorizedRoles: RoleType[];
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface PopulationCohort {
  cohortId: string;
  cohortName: string;
  definitionVersion: number;
  scopeId: string;
  aggregationLevel: AggregationLevel;
  reportingPeriod: string;
  aggregateCount: number;
  isSuppressed: boolean;
  breakdowns: {
    byAgeGroup: Record<string, number>;
    byGender: Record<string, number>;
    byFacility: Record<string, number>;
  };
  generatedAt: string;
  integrityHash: string;
}

export interface PrivacySuppressionRule {
  minimumPopulationCount: number; // e.g. 5
  strategy: 'SUPPRESSION' | 'AGGREGATION' | 'PSEUDONYMIZATION';
  logAuditOnSuppression: boolean;
}

export interface PrivacyProtectionStrategy {
  name: string;
  protectCohort(cohort: PopulationCohort, minCount: number): PopulationCohort;
  protectMetricResult(result: MetricResult, minCount: number): MetricResult;
}

// ============================================================================
// 5. SIGNALS & SYNDROMIC SURVEILLANCE
// ============================================================================

export type SignalState = 'NORMAL' | 'WATCH' | 'SIGNAL' | 'ESCALATED' | 'RESOLVED';

export type SignalComparisonMethod =
  | 'HISTORICAL_AVG'
  | 'ROLLING_AVG'
  | 'STD_DEV_THRESHOLD'
  | 'PERCENT_CHANGE'
  | 'SEASONAL';

export type SignalType =
  | 'VOLUME_SURGE'
  | 'SYNDROME_SPIKE'
  | 'LAB_ANOMALY'
  | 'EMERGENCY_SURGE'
  | 'STOCK_OUT_CORRELATION'
  | 'REFERRAL_SURGE';

export type SignalReviewAction =
  | 'ACKNOWLEDGE'
  | 'INVESTIGATE'
  | 'ADD_CONTEXT'
  | 'ESCALATE'
  | 'DISMISS_WITH_REASON'
  | 'RESOLVE';

export interface SignalReviewRecord {
  action: SignalReviewAction;
  reviewedBy: string;
  reviewerRole: RoleType | string;
  timestamp: string;
  notes: string;
  escalationTarget?: string;
}

export interface PopulationSignal {
  signalId: string;
  signalType: SignalType;
  title: string;
  description: string;
  observedMetric: string;
  baseline: number;
  currentValue: number;
  changePercent: number;
  threshold: number;
  comparisonMethod: SignalComparisonMethod;
  timeWindow: TimeWindow;
  affectedAggregationLevel: AggregationLevel;
  facilityId: string;
  confidenceScore: number; // 0.0 - 1.0
  completenessPercent: number;
  generatedAt: string;
  status: SignalState;
  reviewHistory: SignalReviewRecord[];
  isConfirmedOutbreak: false; // Invariant: Signal ≠ Confirmed Outbreak
}

// ============================================================================
// 6. CAPACITY & FACILITY PERFORMANCE
// ============================================================================

export type CapacityStatus =
  | 'AVAILABLE'
  | 'NORMAL'
  | 'ELEVATED'
  | 'CONSTRAINED'
  | 'CRITICAL'
  | 'UNKNOWN';

export interface FacilityCapacity {
  facilityId: string;
  facilityName: string;
  overallStatus: CapacityStatus;
  emergencyStatus: CapacityStatus;
  bedStatus: CapacityStatus;
  labStatus: CapacityStatus;
  radiologyStatus: CapacityStatus;
  pharmacyStatus: CapacityStatus;
  referralReceivingStatus: CapacityStatus;
  activeQueueCount: number;
  dataAvailable: boolean;
  asOf: string;
}

export interface FacilityPerformanceSummary {
  facilityId: string;
  facilityName: string;
  period: string;
  totalEncounters: number;
  encountersPerClinicianDay?: number;
  averageEncounterDurationMinutes: number;
  emergencyArrivalsCount: number;
  labOrdersCount: number;
  labTurnaroundMinutesAverage: number;
  radiologyStudiesCount: number;
  radiologyTurnaroundMinutesAverage: number;
  pharmacyDispensesCount: number;
  stockoutItemsCount: number;
  reportingCompletenessPercent: number;
  unsignedDocumentationRate: number;
  criticalAlertAckRate: number;
  capacityStatus: CapacityStatus;
}

// ============================================================================
// 7. SUPPLY & INVENTORY FORECASTING
// ============================================================================

export type DataNature = 'OBSERVED' | 'ESTIMATED' | 'FORECAST';

export type ForecastMethod =
  | 'MOVING_AVERAGE'
  | 'WEIGHTED_MOVING_AVERAGE'
  | 'RECENT_CONSUMPTION'
  | 'SEASONAL_ADJUSTED';

export interface DemandForecast {
  forecastId: string;
  itemId: string;
  itemName: string;
  facilityId: string;
  horizonDays: number;
  historicalDaysWindow: number;
  method: ForecastMethod;
  baselineDailyConsumption: number;
  forecastQuantity: number;
  projectedStockoutDate?: string;
  confidenceScore: number;
  dataCompletenessPercent: number;
  dataNature: DataNature; // Strictly 'FORECAST'
  generatedAt: string;
  modelVersion: string;
}

export interface SupplyIntelligenceSummary {
  facilityId: string;
  period: string;
  criticalItemsCount: number;
  stockedOutCount: number;
  nearExpiryCount: number;
  totalWastageValueUnits: number;
  averageDaysOfSupply: number;
  forecasts: DemandForecast[];
}

export interface ReferralFlowEdge {
  sourceFacilityId: string;
  destinationFacilityId: string;
  referralCount: number;
  completedCount: number;
  averageAcceptanceDurationHours: number;
  isBottleneck: boolean;
}

export interface ReferralNetworkSummary {
  reportingPeriod: string;
  totalReferrals: number;
  totalCompleted: number;
  completionRatePercent: number;
  emergencyTransferCount: number;
  averageAcceptanceDurationHours: number;
  bottlenecksIdentified: Array<{
    sourceFacilityId: string;
    destinationFacilityId: string;
    type: 'PROLONGED_ACCEPTANCE' | 'HIGH_VOLUME_CONGESTION' | 'INCOMPLETE_OUTCOME';
    description: string;
  }>;
  flows: ReferralFlowEdge[];
}

// ============================================================================
// 8. DATA QUALITY & REPORTING MONITORING
// ============================================================================

export type DataQualityIssueStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'RESOLVED'
  | 'ACCEPTED_EXCEPTION';

export interface DataQualityIssue {
  issueId: string;
  facilityId: string;
  domain: FactDomain;
  issueType: 'MISSING_DIMENSION' | 'TIMELINESS_DELAY' | 'INCONSISTENT_VALUE' | 'DUPLICATE_FACT' | 'UNMAPPED_CODE';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: DataQualityIssueStatus;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface DataQualityMetric {
  facilityId: string;
  reportingPeriod: string;
  completenessPercent: number;
  timelinessPercent: number;
  consistencyScore: number;
  unacknowledgedIssuesCount: number;
  lateRecordsCount: number;
  missingFacilities: string[];
  isPartialReport: boolean;
}

// ============================================================================
// 9. PUBLIC HEALTH REPORTS & INTEROPERABILITY ADAPTERS
// ============================================================================

export type ReportApprovalStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'EXPORTED'
  | 'REJECTED';

export interface PublicHealthReportPackage {
  packageId: string;
  title: string;
  reportingPeriod: string;
  geographicScope: {
    level: AggregationLevel;
    scopeId: string;
    facilitiesCount: number;
  };
  indicatorDefinitions: Array<{
    code: string;
    name: string;
    version: number;
  }>;
  indicatorValues: Record<string, number>;
  dataQualitySummary: {
    overallCompletenessPercent: number;
    reportingFacilitiesRatio: string; // e.g. "4/4"
    dataLimitationsNotes: string[];
  };
  provenance: {
    generatedBy: string;
    generatedAt: string;
    systemVersion: string;
  };
  approvalStatus: ReportApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  exportTarget?: 'DHIS2' | 'HMIS' | 'NATIONAL_REGISTRY' | 'SANDBOX';
  exportStatus?: 'UNAVAILABLE' | 'SANDBOX_PRODUCED' | 'EXPORTED';
  integrityHash: string;
}

export interface IntelligenceReport {
  reportId: string;
  title: string;
  reportingPeriod: string;
  scope: {
    level: AggregationLevel;
    scopeId: string;
  };
  executiveSummary: string;
  majorIndicators: Record<string, number>;
  dataQualityNotes: string[];
  signals: Array<{
    type: string;
    description: string;
    state: SignalState;
  }>;
  operationalConstraints: string[];
  supplyRisks: string[];
  aiNarrative?: {
    summary: string;
    citedMetrics: string[];
    generatedAt: string;
    model: string;
    reviewedBy?: string;
  };
  approvalStatus: ReportApprovalStatus;
  version: number;
  integrityHash: string;
  createdAt: string;
}

export type ExternalAdapterStatus = 'UNAVAILABLE' | 'SANDBOX' | 'CONFIGURED';

export interface IDHIS2ExchangeAdapter {
  readonly status: ExternalAdapterStatus;
  generateDataValueSet(report: PublicHealthReportPackage): Record<string, any>;
  submitDataValueSet(payload: any): Promise<{ success: boolean; message: string; statusCode: number }>;
}

export interface IHMISExchangeAdapter {
  readonly status: ExternalAdapterStatus;
  generateMonthlyReport(report: PublicHealthReportPackage): Record<string, any>;
  submitMonthlyReport(payload: any): Promise<{ success: boolean; message: string; statusCode: number }>;
}

export interface TerminologyGovernanceAdapter {
  readonly status: ExternalAdapterStatus;
  mapInternalMetricToIndicator(metricId: string): { externalCode: string; scheme: string; mapped: boolean };
}

// ============================================================================
// 10. SYSTEM HEALTH INTELLIGENCE & TELEMETRY
// ============================================================================

export interface SystemHealthSummary {
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  databaseStatus: 'HEALTHY' | 'DEGRADED';
  syncStatus: 'SYNCED' | 'PENDING' | 'OFFLINE' | 'CONFLICT';
  networkExchangeQueueDepth: number;
  deadLetterCount: number;
  quarantinedCount: number;
  connectedNodesCount: number;
  offlineNodesCount: number;
  aiServiceStatus: string;
  fhirGatewayStatus: string;
  lastCheckedAt: string;
}

export interface PopulationIntelligenceLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  action:
    | 'QUERY_METRIC'
    | 'QUERY_COHORT'
    | 'DRILL_DOWN_ATTEMPT'
    | 'DRILL_DOWN_APPROVED'
    | 'REVIEW_SIGNAL'
    | 'GENERATE_REPORT'
    | 'APPROVE_REPORT'
    | 'EXPORT_REPORT'
    | 'REBUILD_ANALYTICS';
  scopeLevel: AggregationLevel;
  scopeId: string;
  metricId?: string;
  cohortId?: string;
  purpose: string;
  wasSmallCellSuppressed: boolean;
  durationMs: number;
  success: boolean;
  error?: string;
}
