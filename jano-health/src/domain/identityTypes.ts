/**
 * Jano Health - Clinical Core V15: Longitudinal Identity Domain Types
 * 
 * Defines multi-facility longitudinal identity, verification evidence,
 * reconciliation decisions, and external identity references.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Patient Identity ≠ Clinical Record
 * 2. Authentication Identity ≠ Patient Identity
 * 3. National Identity ≠ Jano Patient ID
 * 4. Deterministic MPI remains authoritative; no silent auto-merge.
 * 5. MERGED and DECEASED identity protections strictly enforced.
 * 6. National identity adapter defaults to NOT_CONFIGURED (never fabricate national IDs).
 */

import { RoleType } from './types';

export type LongitudinalIdentityStatus =
  | 'PROVISIONAL'
  | 'VERIFIED'
  | 'REVIEW_REQUIRED'
  | 'SUSPENDED'
  | 'MERGED'
  | 'RETIRED';

export type IdentityVerificationLevel =
  | 'NONE'
  | 'UNVERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'FACILITY_VERIFIED'
  | 'MULTI_SOURCE_VERIFIED'
  | 'REQUIRES_REVIEW'
  | 'DEMOGRAPHIC_MATCH'
  | 'DOCUMENT_VERIFIED'
  | 'CLINICIAN_VERIFIED'
  | 'BIOMETRIC_VERIFIED';

export type IdentityEvidenceType =
  | 'IDENTIFIER'
  | 'DEMOGRAPHIC'
  | 'FACILITY_REGISTRATION'
  | 'EXTERNAL_SYSTEM'
  | 'CLINICIAN_VERIFICATION'
  | 'PATIENT_SUBMITTED'
  | 'DOCUMENT_REFERENCE';

export type IdentityResolutionDecisionType =
  | 'LINK'
  | 'CREATE_PROVISIONAL'
  | 'REVIEW_REQUIRED'
  | 'REJECT';

export type NationalIdentityVerificationState =
  | 'NOT_CONFIGURED'
  | 'PENDING'
  | 'VERIFIED'
  | 'UNAVAILABLE'
  | 'FAILED';

export interface IdentityIdentifier {
  system: string;
  value: string;
  type: string;
  issuer?: string;
  assignedAt?: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

export interface LinkedExternalSystem {
  systemCode: string;
  systemName: string;
  externalId: string;
  linkedAt: string;
  trustStatus: 'TRUSTED' | 'PENDING' | 'PROVISIONAL';
}

export interface ExternalPatientIdentity {
  externalIdentityId: string;
  patientId: string;
  sourceSystem: string;
  sourceNodeId?: string;
  sourceFacilityId?: string;
  identifierSystem: string;
  identifierReference: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'REJECTED';
  firstSeenAt: string;
  lastVerifiedAt: string;
  provenance: {
    recordedBy: string;
    systemVersion: string;
  };
  status: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
}

export interface LongitudinalIdentity {
  identityId: string;
  patientId: string;
  identityStatus: LongitudinalIdentityStatus;
  verificationLevel: IdentityVerificationLevel;
  identifiers: IdentityIdentifier[];
  identityAttributes: {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    gender?: string;
    nationalIdRef?: string;
    phone?: string;
    addressVillage?: string;
    [key: string]: any;
  };
  aliases: string[];
  linkedFacilities: string[];
  linkedExternalSystems: LinkedExternalSystem[];
  confidence: number; // 0.0 to 1.0
  provenance: {
    registeredAt: string;
    registeredFacilityId: string;
    actorId: string;
    actorRole: RoleType | string;
    systemVersion: string;
  };
  createdAt: string;
  updatedAt: string;
  version: number;
  integrityHash: string;
}

export interface IdentityEvidence {
  evidenceId: string;
  identityId: string;
  patientId: string;
  evidenceType: IdentityEvidenceType;
  source: string;
  sourceType?: string;
  collectedAt?: string;
  timestamp: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewerId?: string;
  reviewerRole?: RoleType | string;
  reviewer?: {
    id: string;
    role: string;
    name?: string;
  };
  confidence: number;
  provenance: {
    capturedFacilityId: string;
    capturedByActorId: string;
    capturedAt: string;
  };
  documentReference?: {
    documentType: string;
    referenceUri?: string;
    hash: string;
  };
}

export interface IdentityResolutionDecision {
  decisionId: string;
  incomingIdentity: {
    sourceSystem: string;
    externalId: string;
    demographics: Record<string, any>;
    identifiers: IdentityIdentifier[];
  };
  candidatePatientIds: string[];
  decision: IdentityResolutionDecisionType;
  confidence: number;
  evidence: string[];
  actor: {
    actorId: string;
    actorRole: RoleType | string;
    actorName?: string;
  };
  timestamp: string;
  reason: string;
  provenance: {
    facilityId: string;
    systemVersion: string;
  };
}

export interface NationalIdentityReference {
  system: string;
  identifierReference?: string;
  verificationState: NationalIdentityVerificationState;
  provenance: {
    checkedAt?: string;
    adapterVersion: string;
    adapterStatus: string;
  };
  effectivePeriod?: {
    start?: string;
    end?: string;
  };
}

/**
 * Validates whether a proposed Longitudinal Identity status transition is permissible.
 * Invariant: Terminal states MERGED and RETIRED cannot transition out without supervisor audit.
 */
export function isValidIdentityStatusTransition(
  current: LongitudinalIdentityStatus,
  next: LongitudinalIdentityStatus
): boolean {
  if (current === next) return true;
  if (current === 'MERGED' || current === 'RETIRED') {
    return false; // Terminal states fail-closed
  }
  const allowedTransitions: Record<LongitudinalIdentityStatus, LongitudinalIdentityStatus[]> = {
    PROVISIONAL: ['VERIFIED', 'REVIEW_REQUIRED', 'SUSPENDED', 'MERGED', 'RETIRED'],
    VERIFIED: ['REVIEW_REQUIRED', 'SUSPENDED', 'MERGED', 'RETIRED'],
    REVIEW_REQUIRED: ['PROVISIONAL', 'VERIFIED', 'SUSPENDED', 'MERGED', 'RETIRED'],
    SUSPENDED: ['REVIEW_REQUIRED', 'VERIFIED', 'RETIRED'],
    MERGED: [],
    RETIRED: [],
  };
  return allowedTransitions[current]?.includes(next) ?? false;
}
