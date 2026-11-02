/**
 * Jano Health - Clinical Core V19: National Digital Health & Ecosystem Interoperability
 * 
 * Formal Domain Models & Type Specifications for Participation in National Digital Health Ecosystems
 * (e.g. Ethiopian Ministry of Health NDHx, Master Facility Registry, DHIS2/HMIS, eCHIS, National Terminology,
 * National Identity & Disease Surveillance).
 * 
 * ABSOLUTE ARCHITECTURAL INVARIANTS:
 * 1.  Jano ≠ National HIE / NDHx / DHIS2 / eCHIS / MFR / National Identity System / Regulatory Body.
 * 2.  Jano Network (V13) ≠ National Ecosystem (V19). Preserve separate semantic/governance boundaries.
 * 3.  External System ≠ Jano Facility.
 * 4.  External Adapter ≠ Live Integration.
 * 5.  Configured Adapter ≠ Authorized Production Access.
 * 6.  Sandbox ≠ Production. Never render or treat SANDBOX as PRODUCTION.
 * 7.  Delivered ≠ Acknowledged ≠ Processed. Track external lifecycle stages separately.
 * 8.  External Response ≠ Clinical Truth. Never permit raw external responses to directly mutate clinical facts.
 * 9.  National Reporting ≠ Clinical Record. Aggregate reporting ≠ Patient-level exchange.
 * 10. National Identity ≠ Jano Patient Identity. Facility Registry Identity ≠ Patient Identity.
 * 11. Terminology Mapping ≠ Clinical Diagnosis.
 * 12. Surveillance Signal ≠ Confirmed Outbreak. Statistical anomaly cannot autonomously declare an outbreak.
 * 13. AI Recommendation ≠ Government Decision / Regulatory Approval / Official Submission.
 * 14. SHA-256 Integrity Hash ≠ Legal Digital Signature.
 * 15. Missing Data ≠ Zero; Unavailable ≠ Failed; Stale ≠ Current; No Report ≠ Zero.
 * 16. External System Outage is NEVER a Clinical Outage. Local clinical care must continue uninterrupted.
 * 17. All default adapters MUST remain strictly NOT_CONFIGURED until genuine authorized configuration exists.
 */

import { sha256 } from './eventIntegrity';

export function computeSha256(data: any): string {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return sha256(serialized);
}

// ----------------------------------------------------
// 1. Ecosystem Registry & Trust Models
// ----------------------------------------------------

export type EcosystemSystemType =
  | 'NATIONAL_HIE'
  | 'FACILITY_REGISTRY'
  | 'HMIS'
  | 'COMMUNITY_HEALTH'
  | 'EMR'
  | 'LABORATORY'
  | 'TERMINOLOGY'
  | 'IDENTITY'
  | 'SURVEILLANCE'
  | 'REPORTING'
  | 'SUPPLY'
  | 'FINANCING'
  | 'OTHER';

export type EcosystemEnvironment =
  | 'SANDBOX'
  | 'TEST'
  | 'STAGING'
  | 'PRODUCTION';

export type SystemTrustLevel =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

export type EcosystemDataClassification =
  | 'PUBLIC'
  | 'GOVERNED_AGGREGATE'
  | 'RESTRICTED_IDENTIFIABLE'
  | 'HIGHLY_CONFIDENTIAL';

export interface EcosystemSystem {
  systemId: string;
  systemCode: string;
  name: string;
  organization: string;
  systemType: EcosystemSystemType;
  environment: EcosystemEnvironment;
  trustLevel: SystemTrustLevel;
  status: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
  supportedProfiles: string[];
  supportedFHIRVersion: string;
  endpointReferences: string[];
  capabilities: string[];
  dataClassification: EcosystemDataClassification;
  approvalReference?: string;
  provenance: {
    registeredAt: string;
    registeredBy: string;
    lastReviewedAt?: string;
    reviewNotes?: string;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  integrityHash: string;
}

export interface EcosystemService {
  serviceId: string;
  systemId: string;
  serviceName: string;
  serviceType:
    | 'FHIR_EXCHANGE'
    | 'FACILITY_LOOKUP'
    | 'TERMINOLOGY_LOOKUP'
    | 'IDENTITY_VERIFICATION'
    | 'AGGREGATE_REPORTING'
    | 'SURVEILLANCE_DISPATCH'
    | 'CLAIMS_SUBMISSION'
    | 'SERVICE_REGISTRY';
  supportedProtocols: ('HTTPS_REST' | 'FHIR_R5' | 'SOAP' | 'SFTP')[];
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  endpointId: string;
}

export interface EcosystemEndpoint {
  endpointId: string;
  systemId: string;
  serviceId: string;
  environment: EcosystemEnvironment;
  baseUrlReference: string;
  protocol: 'HTTPS' | 'HTTP' | 'SFTP';
  authenticationMode: 'MUTUAL_TLS' | 'OAUTH2_BEARER' | 'API_KEY' | 'NONE';
  healthStatus: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  lastHealthCheck?: string;
  status: 'ACTIVE' | 'DISABLED';
  provenance: {
    configuredAt: string;
    configuredBy: string;
  };
}

export interface EcosystemCapability {
  capabilityId: string;
  systemId: string;
  supportedResources: string[];
  supportedInteractions: ('read' | 'search' | 'create' | 'update' | 'transaction' | 'batch')[];
  supportedProfiles: string[];
  messageLimits: {
    maxBatchSize: number;
    maxPayloadBytes: number;
  };
  discoveredAt: string;
  status: 'KNOWN' | 'UNKNOWN';
}

export interface EcosystemTrustProfile {
  profileId: string;
  systemId: string;
  trustLevel: SystemTrustLevel;
  approvedBy?: string;
  approvedAt?: string;
  justification?: string;
  expiresAt?: string;
}

// ----------------------------------------------------
// 2. National Integration Lifecycle
// ----------------------------------------------------

export type NationalIntegrationStatus =
  | 'DISCOVERED'
  | 'CONFIGURED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CONNECTIVITY_TESTED'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE';

export interface NationalIntegration {
  integrationId: string;
  systemId: string;
  name: string;
  description: string;
  adapterIdentifier: string;
  environment: EcosystemEnvironment;
  status: NationalIntegrationStatus;
  primaryEndpointId?: string;
  credentialReferenceId?: string;
  activeExchangePolicyId?: string;
  lastConnectivityTest?: {
    testedAt: string;
    successful: boolean;
    latencyMs: number;
    errorMessage?: string;
  };
  activationGateApproval?: {
    approvedBy: string;
    approvedAt: string;
    governanceTicket: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface NationalIntegrationProfile {
  profileId: string;
  integrationId: string;
  profileName: string;
  version: string;
  specificationUri: string;
  rules: string[];
  status: 'ACTIVE' | 'DEPRECATED';
}

export interface NationalExchangePolicy {
  policyId: string;
  integrationId: string;
  purpose: 'CARE' | 'PUBLIC_HEALTH' | 'NATIONAL_REPORTING' | 'RESEARCH' | 'DISASTER_RESPONSE';
  allowedResourceTypes: string[];
  requiredConsentTypes: string[];
  dataMinimizationRules: {
    stripPatientName?: boolean;
    stripAddress?: boolean;
    stripPhone?: boolean;
    stripFinancialData?: boolean;
  };
  maxPayloadBytes: number;
  rateLimitPerMinute: number;
  retryPolicy: {
    maxRetries: number;
    backoffBaseMs: number;
    maxBackoffMs: number;
  };
}

// ----------------------------------------------------
// 3. National Exchange Messages, Queues & Acknowledgements
// ----------------------------------------------------

export type NationalExchangeMessageState =
  | 'CREATED'
  | 'QUEUED'
  | 'SENDING'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'FAILED'
  | 'RETRY'
  | 'DEAD_LETTER'
  | 'QUARANTINED'
  | 'EXPIRED';

export interface NationalExchangeMessage {
  messageId: string;
  integrationId: string;
  source: string; // Jano node / facility
  destination: string; // Target ecosystem system code
  purpose: string;
  resourceType: string;
  profile: string;
  payloadReference?: string;
  payloadHash: string;
  payload: any;
  idempotencyKey: string;
  correlationId: string;
  createdAt: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  processedAt?: string;
  state: NationalExchangeMessageState;
  retryCount: number;
  provenance: {
    initiatedBy: string;
    originFacilityId: string;
  };
  integrityHash: string;
}

export interface NationalExchangeAttempt {
  attemptId: string;
  messageId: string;
  attemptNumber: number;
  timestamp: string;
  httpStatus?: number;
  responsePayloadHash?: string;
  status: 'SUCCESS' | 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE' | 'RATE_LIMITED';
  errorMessage?: string;
  latencyMs: number;
}

export interface NationalExchangeAcknowledgement {
  acknowledgementId: string;
  messageId: string;
  externalReferenceId: string;
  ackType: 'DELIVERED' | 'ACKNOWLEDGED' | 'PROCESSED';
  receivedAt: string;
  payloadHash?: string;
  signatureOrProof?: string;
}

// ----------------------------------------------------
// 4. Master Facility Registry (MFR) Domain
// ----------------------------------------------------

export type MFRFreshness = 'CURRENT' | 'STALE';

export interface FacilityRegistryReference {
  referenceId: string;
  mfrFacilityId: string;
  officialName: string;
  facilityType: string;
  ownership: 'GOVERNMENT' | 'PRIVATE' | 'NGO' | 'FAITH_BASED' | 'OTHER';
  region: string;
  zone: string;
  woreda: string;
  services: string[];
  is24Hours: boolean;
  operationalStatus: 'OPERATIONAL' | 'CLOSED' | 'TEMPORARILY_CLOSED';
  lastRetrievedAt: string;
  source: 'MFR_OFFICIAL_API' | 'MFR_CACHED_SNAPSHOT' | 'SYNTHETIC_MFR_FIXTURE';
  freshness: MFRFreshness;
  integrityHash: string;
}

export interface FacilityRegistrySync {
  syncId: string;
  initiatedAt: string;
  completedAt?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  recordsProcessed: number;
  conflictsFound: number;
  error?: string;
}

export type FacilityMappingStatus = 'UNMAPPED' | 'PROPOSED' | 'VERIFIED' | 'CONFLICT' | 'REJECTED';

export interface FacilityRegistryMapping {
  mappingId: string;
  localFacilityId: string;
  externalFacilityId: string;
  externalIdentifierType: 'MFR_CODE' | 'HMIS_FACILITY_CODE';
  mappingStatus: FacilityMappingStatus;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED_BY_ADMIN' | 'REJECTED';
  confidence: number; // 0.0 - 1.0
  lastVerified?: string;
  verifiedBy?: string;
  provenance: {
    createdAt: string;
    mappedBy: string;
  };
}

export interface FacilityRegistryConflict {
  conflictId: string;
  localFacilityId: string;
  mfrFacilityId: string;
  fieldName: string;
  localValue: string;
  externalValue: string;
  source: string;
  detectedAt: string;
  conflictType: 'NAME_MISMATCH' | 'TYPE_MISMATCH' | 'STATUS_MISMATCH' | 'LOCATION_MISMATCH';
  reviewer?: string;
  resolution?: 'KEEP_LOCAL' | 'ACCEPT_MFR' | 'MANUAL_OVERRIDE';
  resolutionTimestamp?: string;
  resolutionNotes?: string;
  status: 'PENDING_REVIEW' | 'RESOLVED';
}

// ----------------------------------------------------
// 5. National Terminology Domain
// ----------------------------------------------------

export interface TerminologySystem {
  systemId: string;
  uri: string;
  name: string;
  version: string;
  publisher: string;
  status: 'ACTIVE' | 'RETIRED';
}

export interface TerminologyBinding {
  bindingId: string;
  context: string;
  valueSetUri: string;
  strength: 'REQUIRED' | 'EXTENSIBLE' | 'PREFERRED' | 'EXAMPLE';
}

export type TerminologyMappingType =
  | 'EXACT'
  | 'EQUIVALENT'
  | 'WIDER'
  | 'NARROWER'
  | 'AMBIGUOUS';

export interface TerminologyMap {
  mapId: string;
  localSystem: string;
  localCode: string;
  localDisplay?: string;
  targetSystem: string;
  targetCode: string;
  targetDisplay?: string;
  mappingType: TerminologyMappingType;
  equivalence: 'equal' | 'equivalent' | 'wider' | 'subsumes' | 'narrower' | 'specializes' | 'inexact' | 'unmatched';
  confidence: number;
  terminologyVersion: string;
  mappingVersion: string;
  effectivePeriod: {
    start: string;
    end?: string;
  };
  status: 'DRAFT' | 'VERIFIED' | 'QUARANTINED' | 'REJECTED';
  reviewer?: string;
  reviewedAt?: string;
  provenance: {
    mappedAt: string;
    mappedBy: string;
  };
}

export interface TerminologyVersion {
  versionId: string;
  systemId: string;
  versionCode: string;
  releasedAt: string;
  isCurrent: boolean;
}

export interface TerminologyConflict {
  conflictId: string;
  localCode: string;
  targetCode: string;
  reason: string;
  status: 'PENDING' | 'RESOLVED';
  reviewer?: string;
}

// ----------------------------------------------------
// 6. National Reporting (DHIS2 / HMIS) Domain
// ----------------------------------------------------

export type ReportingDatasetType =
  | 'AGGREGATED'
  | 'DE_IDENTIFIED'
  | 'PSEUDONYMIZED'
  | 'IDENTIFIABLE';

export type ReportingSubmissionState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'VALIDATED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'CORRECTION_REQUIRED'
  | 'CORRECTED'
  | 'CANCELLED';

export interface NationalReportingProfile {
  profileId: string;
  reportingSystem: 'DHIS2' | 'HMIS' | 'CUSTOM_NATIONAL';
  reportingPeriodType: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  indicators: Array<{
    indicatorCode: string;
    name: string;
    description: string;
    numeratorDefinition: string;
    denominatorDefinition?: string;
  }>;
  requiredFields: string[];
  transformations: string[];
  aggregationLevel: 'FACILITY' | 'WOREDA' | 'ZONE' | 'REGION' | 'NATIONAL';
  validationRules: Array<{
    ruleId: string;
    description: string;
    expression: string;
  }>;
  submissionRules: {
    requiresHumanApproval: boolean;
    submissionDeadlineDays: number;
  };
  version: string;
  effectivePeriod: {
    start: string;
    end?: string;
  };
  provenance: {
    publishedAt: string;
    publishedBy: string;
  };
}

export interface ReportingDataset {
  datasetId: string;
  profileId: string;
  reportingPeriod: string; // e.g. "2026-W40" or "2026-10"
  facilityId: string;
  dataValues: Array<{
    dataElement: string;
    categoryOptionCombo?: string;
    value: number | string;
    comment?: string;
  }>;
  datasetType: ReportingDatasetType;
  generatedAt: string;
  completeness: number; // 0.0 - 1.0
  dataQualityScore: number; // 0.0 - 1.0
  integrityHash: string;
}

export interface ReportingSubmission {
  submissionId: string;
  datasetId: string;
  profileId: string;
  facilityId: string;
  state: ReportingSubmissionState;
  approvedBy?: string;
  approvedAt?: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  rejectionReason?: string;
  externalSubmissionId?: string;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export interface ReportingResponse {
  responseId: string;
  submissionId: string;
  externalStatus: 'SUCCESS' | 'ERROR' | 'WARNING';
  receivedAt: string;
  payload: any;
}

export interface ReportingCorrection {
  correctionId: string;
  originalSubmissionId: string;
  newDatasetId: string;
  reason: string;
  actor: string;
  timestamp: string;
  externalReference?: string;
  approval: {
    approvedBy: string;
    approvedAt: string;
  };
  provenance: {
    justification: string;
  };
}

// ----------------------------------------------------
// 7. National Identity Domain
// ----------------------------------------------------

export type NationalIdentityVerificationState =
  | 'NOT_CONFIGURED'
  | 'PENDING'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNAVAILABLE'
  | 'EXPIRED'
  | 'REQUIRES_REVIEW';

export interface NationalIdentityReference {
  referenceId: string;
  patientId: string;
  identitySystem: 'FAYDA_ETHIOPIA' | 'NATIONAL_ID_REGISTRY' | 'SYNTHETIC_SANDBOX';
  maskedIdentityNumber: string; // e.g. "******7890" (never store raw unless explicitly authorized)
  verificationState: NationalIdentityVerificationState;
  verifiedAt?: string;
  expiresAt?: string;
  source: string;
  freshness: 'CURRENT' | 'STALE';
  provenance: {
    verifiedBy?: string;
    verificationMethod: 'ONLINE_API' | 'OFFLINE_CACHE' | 'MANUAL_REVIEW';
    timestamp: string;
  };
}

export interface IdentityVerificationRequest {
  requestId: string;
  patientId: string;
  requestedFields: string[];
  requestedAt: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface IdentityVerificationResponse {
  responseId: string;
  requestId: string;
  status: NationalIdentityVerificationState;
  externalMatchScore?: number;
  timestamp: string;
  provenance: {
    systemResponseCode?: string;
  };
}

// ----------------------------------------------------
// 8. Public Health Surveillance Domain
// ----------------------------------------------------

export type SurveillanceSignalState =
  | 'NORMAL'
  | 'WATCH'
  | 'SIGNAL'
  | 'ESCALATED'
  | 'RESOLVED';

export interface SurveillanceSignal {
  signalId: string;
  reportingScope: 'FACILITY' | 'DISTRICT' | 'NATIONAL';
  period: string;
  indicator: string; // e.g. "CHOLERA_CLUSTER", "AFP_SUSPECT", "MEASLES_OUTBREAK_SIGNAL"
  observedValue: number;
  baseline: number;
  threshold: number;
  state: SurveillanceSignalState;
  confidence: number;
  dataQuality: 'SUFFICIENT' | 'INSUFFICIENT' | 'SUSPECT';
  sourceMetrics: string[];
  generatedAt: string;
  reviewer?: string;
  reviewNotes?: string;
  provenance: {
    engine: 'V14_POPULATION_INTELLIGENCE';
    version: string;
  };
}

export interface SurveillanceReport {
  reportId: string;
  signalId: string;
  reportingFacilityId: string;
  epidemiologicalWeek: number;
  caseCount: number;
  status: 'DRAFT' | 'READY_FOR_REVIEW';
}

export type SurveillanceSubmissionState =
  | 'DRAFT'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'REJECTED';

export interface SurveillanceSubmission {
  submissionId: string;
  reportId: string;
  state: SurveillanceSubmissionState;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  submittedAt?: string;
  acknowledgedAt?: string;
  acknowledgementCode?: string;
  provenance: {
    timestamp: string;
    submittedBy: string;
  };
}

// ----------------------------------------------------
// 9. Ecosystem Governance & Security Models
// ----------------------------------------------------

export interface NationalIntegrationApproval {
  approvalId: string;
  integrationId: string;
  approvalType: 'INITIAL_ONBOARDING' | 'PRODUCTION_ACTIVATION' | 'SCOPE_EXPANSION' | 'EMERGENCY_OVERRIDE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  decisionBy: string;
  decisionAt: string;
  justification: string;
  validUntil?: string;
}

export interface NationalDataSharingPolicy {
  policyId: string;
  purpose: string;
  legalPolicyReference: string;
  dataCategories: string[];
  recipient: string;
  geographicScope: string[];
  retention: string;
  transformation: string;
  approval: {
    approvedBy: string;
    approvedAt: string;
  };
  effectivePeriod: {
    start: string;
    end?: string;
  };
  version: string;
}

export type CredentialStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED' | 'NOT_CONFIGURED';

export interface IntegrationCredentialReference {
  credentialId: string;
  integrationId: string;
  credentialType: 'API_KEY_REF' | 'OAUTH_CLIENT_REF' | 'MTLS_CERT_REF';
  providerReference: string; // Identifier pointing to secure server-side vault/env, NEVER plaintext secret
  status: CredentialStatus;
  createdAt: string;
  expiresAt: string;
  rotatedAt?: string;
}

export type EcosystemQuarantineCategory =
  | 'IDENTITY'
  | 'TERMINOLOGY'
  | 'FACILITY'
  | 'PROFILE'
  | 'VALIDATION'
  | 'POLICY'
  | 'INTEGRITY'
  | 'REPLAY'
  | 'EXTERNAL_RESPONSE'
  | 'REPORTING'
  | 'SURVEILLANCE';

export interface EcosystemQuarantineItem {
  quarantineId: string;
  category: EcosystemQuarantineCategory;
  sourceSystem: string;
  payload: any;
  failureReason: string;
  quarantinedAt: string;
  status: 'QUARANTINED' | 'REVIEW_IN_PROGRESS' | 'RESOLVED' | 'DISCARDED';
  reviewerId?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
}

export type IntegrationCircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface IntegrationCircuitBreaker {
  state: IntegrationCircuitState;
  failureCount: number;
  lastFailureTime?: number;
  failureThreshold: number;
  cooldownPeriodMs: number;
}

// ----------------------------------------------------
// 10. Typed Adapter Interfaces
// ----------------------------------------------------

export interface INDHxAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  health(): Promise<{ available: boolean; latencyMs: number }>;
  discoverCapabilities(): Promise<EcosystemCapability>;
  exchange(message: NationalExchangeMessage): Promise<{
    delivered: boolean;
    externalMessageId?: string;
    status: 'DELIVERED' | 'FAILED' | 'REJECTED';
    errorMessage?: string;
  }>;
  pollAcknowledgement(externalMessageId: string): Promise<NationalExchangeAcknowledgement | null>;
}

export interface IMasterFacilityRegistryAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  searchFacilities(query: { name?: string; region?: string; woreda?: string; facilityType?: string }): Promise<FacilityRegistryReference[]>;
  getFacilityDetail(mfrFacilityId: string): Promise<FacilityRegistryReference | null>;
  syncRegistry(sinceTimestamp: string): Promise<{ records: FacilityRegistryReference[]; syncTimestamp: string }>;
}

export interface IDHIS2Adapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  discoverCapabilities(): Promise<EcosystemCapability>;
  validateDataset(dataset: ReportingDataset, profile: NationalReportingProfile): Promise<{ valid: boolean; issues: string[] }>;
  submitAggregateReport(submission: ReportingSubmission, dataset: ReportingDataset): Promise<{
    accepted: boolean;
    externalSubmissionId?: string;
    responseCode: string;
    details?: string;
  }>;
}

export interface IeCHISAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  health(): Promise<{ available: boolean }>;
  dispatchReferralTask(task: { referralId: string; targetCommunityWorkerId: string; patientId: string }): Promise<{ accepted: boolean }>;
}

export interface INationalTerminologyAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  lookupConcept(system: string, code: string): Promise<{ found: boolean; display?: string; definition?: string }>;
  validateCode(system: string, code: string): Promise<{ valid: boolean; display?: string }>;
  translateCode(sourceSystem: string, sourceCode: string, targetSystem: string): Promise<TerminologyMap[]>;
  expandValueSet(valueSetUri: string): Promise<Array<{ system: string; code: string; display: string }>>;
}

export interface INationalIdentityAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  verifyIdentity(query: { nationalId: string; demographicClaims?: Record<string, any> }): Promise<{
    state: NationalIdentityVerificationState;
    matchScore: number;
    maskedIdentity: string;
    error?: string;
  }>;
}

export interface INationalSurveillanceAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  transmitNotifiableDiseaseReport(report: {
    diseaseCode: string;
    reportingFacilityId: string;
    timestamp: string;
    caseCount: number;
    epidemiologicalWeek: number;
    evidenceSignalId?: string;
  }): Promise<{ accepted: boolean; acknowledgmentCode: string; status: 'ACKNOWLEDGED' | 'REJECTED' }>;
}

export interface INationalReportingAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  validateDataset(dataset: ReportingDataset, profile: NationalReportingProfile): Promise<{ valid: boolean; issues: string[] }>;
  submitReport(submission: ReportingSubmission, dataset: ReportingDataset): Promise<{
    accepted: boolean;
    externalSubmissionId?: string;
    responseCode: string;
  }>;
}

export interface IExternalFHIRExchangeAdapter {
  readonly adapterName: string;
  readonly status: NationalIntegrationStatus;
  exchangeFHIRResource(resourceType: string, resourcePayload: any, targetSystemUri: string): Promise<{
    success: boolean;
    responseStatus: number;
    responseBody?: any;
    error?: string;
  }>;
}
