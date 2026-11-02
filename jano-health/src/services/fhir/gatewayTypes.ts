/**
 * Jano Health - FHIR External System & Security Data Models
 * Clinical Core V12: Gateway Security & Policy Models
 */

import { ExternalPartnerTrustStatus, ExchangeDirection, PartnerAuthType } from './registry';

export type ExternalSystemTrustLevel = 'UNTRUSTED' | 'LIMITED' | 'TRUSTED';

export type ExternalSystemTrustStatus = 'PENDING' | 'TRUSTED' | 'SUSPENDED' | 'REVOKED';

export type ExchangePurposeOfUse =
  | 'CARE'
  | 'REFERRAL'
  | 'LABORATORY'
  | 'RADIOLOGY'
  | 'MEDICATION'
  | 'PUBLIC_HEALTH'
  | 'ADMINISTRATIVE'
  | 'PATIENT_ACCESS'
  | 'SYSTEM_INTEGRATION';

export type FHIRInteractionType =
  | 'read'
  | 'search'
  | 'create'
  | 'update'
  | 'patch'
  | 'delete'
  | 'transaction'
  | 'batch';

export type InteractionSupportStatus = 'SUPPORTED' | 'NOT_SUPPORTED' | 'RESTRICTED';

/**
 * External System Entity definition adhering to Milestone V12 specs.
 */
export interface ExternalSystem {
  id: string;
  systemIdentifier: string;
  organizationName: string;
  organizationId: string;
  endpoint: string;
  fhirVersion: string;
  active: boolean;
  trustStatus: ExternalSystemTrustStatus;
  trustLevel: ExternalSystemTrustLevel;
  allowedResources: string[];
  allowedInteractions: FHIRInteractionType[];
  allowedFacilities: string[];
  allowedDirections: ExchangeDirection[];
  jurisdiction: string;
  authenticationMethod: PartnerAuthType;
  allowedScopes: string[];
  rateLimitPerMinute?: number;
  apiKeyHash?: string;
  oauthClientSecretHash?: string;
  createdAt: string;
  updatedAt: string;
  provenance: string;
}

/**
 * Standard Gateway Authentication Context
 */
export interface GatewayAuthContext {
  authenticated: boolean;
  externalSystem?: ExternalSystem;
  authenticatedUserId?: string;
  authenticatedUserRole?: string;
  scopes: string[];
  facilityScope: string[];
  clientIp?: string;
  tokenExpiry?: number;
  failureReason?: string;
  errorCode?: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'WRONG_ISSUER' | 'WRONG_AUDIENCE' | 'MISSING_SCOPE' | 'UNTRUSTED_SYSTEM' | 'UNAUTHORIZED_FACILITY' | 'AUTH_REQUIRED';
}

/**
 * Exchange Log for significant interactions
 */
export interface FHIRExchangeLogEntry {
  exchangeId: string;
  requestId: string;
  clientCorrelationId?: string;
  externalSystemId: string;
  externalSystemName: string;
  direction: 'INBOUND' | 'OUTBOUND';
  interaction: FHIRInteractionType | string;
  resourceType: string;
  resourceId?: string;
  patientId?: string;
  facilityId?: string;
  purposeOfUse: ExchangePurposeOfUse;
  requestTimestamp: string;
  responseTimestamp: string;
  durationMs: number;
  responseStatus: number;
  success: boolean;
  errorCode?: string;
  errorDiagnostics?: string;
  etag?: string;
  provenance: string;
  qualitySignals?: {
    unmappedCodesCount?: number;
    probabilisticMatch?: boolean;
    missingFields?: string[];
  };
}

/**
 * Outbound Interoperability Queue
 */
export type OutboundQueueStatus = 'READY' | 'SENDING' | 'SENT' | 'FAILED' | 'RETRY' | 'DEAD_LETTER';

export interface OutboundQueueItem {
  id: string;
  exchangeId: string;
  destinationSystemId: string;
  targetEndpoint: string;
  resourceType: string;
  resourceId: string;
  interaction: FHIRInteractionType;
  payload: any;
  purposeOfUse: ExchangePurposeOfUse;
  facilityId: string;
  status: OutboundQueueStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Import Review Record for Human-in-the-loop clinical data reconciliation
 */
export type ImportReviewStatus =
  | 'RECEIVED'
  | 'VALIDATED'
  | 'PENDING_IMPORT_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PARTIALLY_ACCEPTED';

export interface ImportReviewItem {
  id: string;
  exchangeId: string;
  sourceSystemId: string;
  sourceSystemName: string;
  resourceType: string;
  sourceResourceId: string;
  sourceVersion?: string;
  facilityId: string;
  receivedAt: string;
  status: ImportReviewStatus;
  patientMatchStatus: string;
  matchedLocalPatientId?: string;
  reconciliationConfidence?: number;
  reconciliationReasons?: string[];
  terminologyStatus: string;
  unmappedCodes: string[];
  rawPayload: any;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

/**
 * Gateway Observability Metrics
 */
export interface GatewayMetrics {
  requestCount: number;
  successCount: number;
  clientErrorCount: number; // 4xx
  serverErrorCount: number; // 5xx
  rateLimitExceededCount: number; // 429
  totalLatencyMs: number;
  averageLatencyMs: number;
  exchangeFailures: number;
  retryCount: number;
  deadLetterCount: number;
  identityReconciliationCount: number;
  validationFailureCount: number;
  lastUpdated: string;
}
