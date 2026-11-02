/**
 * Jano Health - Clinical Core V15: Consent & Data-Use Governance Domain Types
 * 
 * Defines granular patient consent, purpose classification, scope restrictions,
 * break-glass emergency access requests, and immutable consent audit history.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Consent ≠ Authorization
 * 2. Consent ≠ RBAC
 * 3. Consent is evaluated server-side and fails closed.
 * 4. Permission for one purpose (e.g. DIRECT_CARE) NEVER authorizes another (e.g. RESEARCH).
 * 5. Emergency access is narrowly scoped, time-limited, audited, and NEVER permanent consent.
 * 6. Audit history separates consent status changes from patient record accesses.
 */

import { RoleType } from './types';

export type ConsentPurpose =
  | 'DIRECT_CARE'
  | 'REFERRAL'
  | 'SECOND_OPINION'
  | 'DIAGNOSTIC_SERVICE'
  | 'CARE_COORDINATION'
  | 'RESEARCH'
  | 'QUALITY_IMPROVEMENT'
  | 'PUBLIC_HEALTH'
  | 'FINANCING'
  | 'ADMINISTRATION';

export type ConsentResourceCategory =
  | 'PATIENT_DEMOGRAPHICS'
  | 'ENCOUNTERS'
  | 'CLINICAL_NOTES'
  | 'DIAGNOSES'
  | 'MEDICATIONS'
  | 'LABORATORY'
  | 'RADIOLOGY'
  | 'EMERGENCY'
  | 'FINANCING';

export type ConsentStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REJECTED';

export type ConsentEvaluationDecision =
  | 'ALLOWED'
  | 'DENIED'
  | 'REQUIRES_REVIEW'
  | 'EMERGENCY_ALLOWED';

export interface ConsentScope {
  facilities?: string[];
  facilityGroups?: string[];
  networks?: string[];
  externalOrganizations?: string[];
  resourceCategories?: ConsentResourceCategory[];
  specificWorkflows?: string[];
}

export interface ConsentDirective {
  directiveId: string;
  resourceCategories: ConsentResourceCategory[];
  purpose: ConsentPurpose;
  actorClasses?: string[];
  facilities?: string[];
  organizations?: string[];
  networks?: string[];
  recipients?: string[];
  timePeriod?: {
    start: string;
    end?: string;
  };
  actionType: 'PERMIT' | 'DENY';
}

export interface PatientConsent {
  consentId: string;
  patientId: string;
  purposes: ConsentPurpose[];
  scope: ConsentScope;
  directives?: ConsentDirective[];
  effectivePeriod: {
    start: string;
    end?: string;
  };
  status: ConsentStatus;
  grantedAt: string;
  withdrawnAt?: string;
  revocationReason?: string;
  version: number;
  provenance: {
    grantedFacilityId: string;
    grantedByActorId: string;
    grantedByActorRole: RoleType | string;
    systemVersion: string;
  };
  verificationMetadata: {
    witnessId?: string;
    signatureType: 'VERBAL' | 'WRITTEN' | 'ELECTRONIC' | 'GUARDIAN';
    verifiedAt: string;
  };
  integrityHash: string;
}

export interface EmergencyAccessRequest {
  requestId: string;
  actorId: string;
  actorRole: RoleType | string;
  actorName: string;
  facilityId: string;
  patientId: string;
  purpose: 'EMERGENCY_ACCESS_BREAK_GLASS';
  emergencyReason: string;
  timestamp: string;
  scopeRequested: ConsentScope;
  durationMinutes: number;
  decision: 'EMERGENCY_ALLOWED' | 'DENIED';
  auditReference: string;
  expiresAt: string;
}

export interface ConsentAuditEntry {
  id: string;
  consentId?: string;
  patientId: string;
  actorId: string;
  actorRole: RoleType | string;
  facilityId: string;
  action:
    | 'CREATED'
    | 'ACTIVATED'
    | 'MODIFIED'
    | 'REVOKED'
    | 'EXPIRED'
    | 'ACCESSED'
    | 'OVERRIDDEN'
    | 'DENIED';
  category: 'CONSENT_STATE_CHANGED' | 'RECORD_DATA_ACCESSED';
  timestamp: string;
  details: string;
  auditHash: string;
}
