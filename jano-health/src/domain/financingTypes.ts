/**
 * Jano Health - Clinical Core V15: Health Financing Interoperability Domain Types
 * 
 * Defines domain-neutral health financing: Payers, Financing Programs,
 * Coverage, Eligibility, Authorizations, Claims, Invoices, Payments,
 * Append-Only Financial Ledger, and Financial Quarantine.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Coverage ≠ Payment
 * 2. Claim ≠ Invoice
 * 3. Invoice ≠ Payment
 * 4. Financing Program ≠ Payer
 * 5. Payer ≠ Government Agency
 * 6. Financial Transaction ≠ Clinical Event
 * 7. Financial failure or claim denial NEVER cancels or alters clinical treatment or emergency care.
 * 8. UNAVAILABLE ≠ NOT_ELIGIBLE (fail transparently, offline cached with staleness indicator).
 * 9. No raw payment credentials stored.
 * 10. Financial ledger is append-only with SHA-256 tamper-evident integrity hashes.
 */

import { RoleType } from './types';

export type PayerType =
  | 'PUBLIC'
  | 'PRIVATE'
  | 'EMPLOYER'
  | 'COMMUNITY'
  | 'DONOR'
  | 'SELF_PAY'
  | 'OTHER';

export type CoverageStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type CoverageVerificationStatus =
  | 'VERIFIED'
  | 'NOT_ELIGIBLE'
  | 'EXPIRED'
  | 'PENDING'
  | 'UNAVAILABLE'
  | 'ERROR';

export type AuthorizationRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'DENIED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'UNAVAILABLE';

export type ClaimStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PENDING'
  | 'ADJUDICATED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'DENIED'
  | 'VOIDED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_SETTLED'
  | 'SETTLED'
  | 'VOIDED'
  | 'OVERDUE';

export type PaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'FAILED'
  | 'REVERSED'
  | 'RECONCILED';

export type FinancialQuarantineCategory =
  | 'COVERAGE_AMBIGUITY'
  | 'ELIGIBILITY_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'CLAIM_VALIDATION_ERROR'
  | 'DUPLICATE_CLAIM'
  | 'PAYMENT_RECONCILIATION'
  | 'UNSUPPORTED_CODE'
  | 'REPLAY_DETECTED'
  | 'INTEGRITY_FAILURE';

export type ReconciliationDecisionType =
  | 'MATCHED'
  | 'UNMATCHED'
  | 'PARTIAL'
  | 'CONFLICT'
  | 'REVERSED';

export interface FinancialReconciliationRecord {
  reconciliationId: string;
  reconciliationType: 'INVOICE_PAYMENT' | 'CLAIM_PAYMENT' | 'PAYMENT_EXTERNAL' | 'REVERSAL_ORIGINAL' | 'PAYER_CLAIM';
  primaryEntityId: string;
  secondaryEntityId: string;
  facilityId: string;
  decision: ReconciliationDecisionType;
  primaryAmount: number;
  secondaryAmount: number;
  discrepancyAmount: number;
  notes: string;
  timestamp: string;
  actorId: string;
  actorRole: RoleType | string;
  auditHash: string;
}

export interface ClaimCorrectionRecord {
  correctionId: string;
  originalClaimId: string;
  supersedingClaimId?: string;
  action: 'CORRECTION' | 'REVERSAL' | 'VOID';
  reason: string;
  changedFields: string[];
  actorId: string;
  actorRole: RoleType | string;
  facilityId: string;
  timestamp: string;
  integrityHash: string;
}

export interface Payer {
  payerId: string;
  name: string;
  type: PayerType;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  contact: {
    phone?: string;
    email?: string;
    address?: string;
    portalUrl?: string;
  };
  supportedPrograms: string[];
  policyMetadata: Record<string, any>;
  provenance: {
    createdAt: string;
    registeredBy: string;
    systemVersion: string;
  };
}

export interface FinancingProgram {
  programId: string;
  payerId: string;
  name: string;
  programType: string;
  eligibilityRulesReference: {
    version: string;
    rulesId: string;
    description?: string;
  };
  coverageRulesReference: {
    version: string;
    rulesId: string;
    description?: string;
  };
  effectivePeriod: {
    start: string;
    end?: string;
  };
  status: 'ACTIVE' | 'INACTIVE' | 'SUNSET';
  version: number;
  provenance: {
    registeredAt: string;
    registeredBy: string;
  };
}

export interface Coverage {
  coverageId: string;
  patientId: string;
  payerId: string;
  programId: string;
  memberReference: string;
  status: CoverageStatus;
  effectiveFrom: string;
  effectiveTo: string;
  coverageClass: string;
  benefitReference: {
    planName: string;
    copayPercent?: number;
    deductibles?: number;
    maximumBenefit?: number;
  };
  verificationStatus: CoverageVerificationStatus;
  lastVerifiedAt?: string;
  verificationSource?: string;
  provenance: {
    recordedAt: string;
    recordedBy: string;
    facilityId: string;
  };
}

export interface EligibilityCheckRequest {
  checkId: string;
  patientId: string;
  coverageId: string;
  serviceDate: string;
  facilityId: string;
  actorId: string;
  requestedServices?: string[];
  status: 'QUEUED' | 'PENDING' | 'COMPLETED' | 'FAILED';
  isOfflineCached?: boolean;
  createdAt: string;
}

export interface EligibilityCheckResponse {
  checkId: string;
  coverageId: string;
  status: CoverageVerificationStatus;
  effectiveDates: {
    start: string;
    end: string;
  };
  coveredServices: string[];
  limitations: string[];
  authorizationRequired: boolean;
  stale: boolean;
  verifiedAt: string;
  source: string;
  provenance: {
    responderId: string;
    timestamp: string;
  };
}

export interface AuthorizationRequest {
  authorizationId: string;
  patientId: string;
  coverageId: string;
  facilityId: string;
  requestedService: string;
  serviceCode: string;
  clinicalReference: {
    type: 'ENCOUNTER' | 'LAB_ORDER' | 'RADIOLOGY_ORDER' | 'MEDICATION_ORDER' | 'REFERRAL';
    referenceId: string;
    description: string;
  };
  requestedAmount: number;
  requestedUnits: number;
  approvedAmount?: number;
  purpose: string;
  status: AuthorizationRequestStatus;
  submittedAt: string;
  respondedAt?: string;
  payerReference?: string;
  denialReason?: string;
  provenance: {
    requestedById: string;
    requestedByRole: RoleType | string;
    systemVersion: string;
  };
}

export interface ClaimLine {
  lineId: string;
  claimId: string;
  lineNumber: number;
  serviceCode: string;
  serviceDescription: string;
  quantity: number;
  unitAmount: number;
  submittedAmount: number;
  adjudicatedAmount?: number;
  patientResponsibility?: number;
  sourceReference: {
    domain: 'encounter' | 'lab' | 'radiology' | 'medication' | 'dispense' | 'referral';
    id: string;
  };
  provenance: {
    facilityId: string;
    recordedAt: string;
  };
}

export interface Claim {
  claimId: string;
  claimNumber: string;
  patientId: string;
  payerId: string;
  coverageId: string;
  facilityId: string;
  encounterReference: string;
  servicePeriod: {
    start: string;
    end: string;
  };
  claimLines: ClaimLine[];
  submittedAmount: number;
  approvedAmount?: number;
  patientResponsibility: number;
  status: ClaimStatus;
  externalReference?: string;
  denialReason?: string;
  adjudicationNotes?: string;
  provenance: {
    preparedById: string;
    preparedByRole: RoleType | string;
    preparedAt: string;
    submittedAt?: string;
    facilityId: string;
  };
  integrityHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  payerPortion: number;
  patientPortion: number;
  serviceRef?: string;
}

export interface Invoice {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  payerId?: string;
  claimId?: string;
  facilityId: string;
  payerResponsibility: number;
  patientResponsibility: number;
  totalAmount: number;
  discounts: number;
  adjustments: number;
  taxes: number;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  issuedAt: string;
  dueAt: string;
  settledAt?: string;
  provenance: {
    issuedById: string;
    issuedByRole: RoleType | string;
    facilityId: string;
  };
  integrityHash: string;
}

export interface Payment {
  paymentId: string;
  receiptNumber: string;
  invoiceId: string;
  patientId: string;
  payerId?: string;
  amount: number;
  currency: string;
  method:
    | 'CASH'
    | 'MOBILE_MONEY'
    | 'BANK_TRANSFER'
    | 'DIRECT_DEBIT'
    | 'INSURANCE_EFT'
    | 'VOUCHER';
  reference: string;
  timestamp: string;
  status: PaymentStatus;
  reconciliationState: 'UNRECONCILED' | 'MATCHED' | 'DISCREPANCY';
  reversalReason?: string;
  reversedAt?: string;
  reversedById?: string;
  provenance: {
    recordedById: string;
    recordedByRole: RoleType | string;
    facilityId: string;
  };
  integrityHash: string;
}

export type FinancialEventType =
  | 'COVERAGE_VERIFIED'
  | 'SERVICE_AUTHORIZED'
  | 'CLAIM_CREATED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_ACKNOWLEDGED'
  | 'CLAIM_ADJUDICATED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_REVERSED'
  | 'CLAIM_VOIDED'
  | 'FINANCIAL_CORRECTION';

export interface FinancialEvent {
  eventId: string;
  eventType: FinancialEventType;
  aggregateId: string;
  aggregateType: 'COVERAGE' | 'AUTHORIZATION' | 'CLAIM' | 'INVOICE' | 'PAYMENT';
  facilityId: string;
  actorId: string;
  actorRole: RoleType | string;
  timestamp: string;
  payload: Record<string, any>;
  previousHash: string;
  currentHash: string;
  correctionReason?: string;
  originalEventId?: string;
}

export interface FinancialQuarantineRecord {
  quarantineId: string;
  category: FinancialQuarantineCategory;
  entityType: string;
  entityId: string;
  facilityId: string;
  reason: string;
  details: Record<string, any>;
  status: 'ACTIVE' | 'RESOLVED' | 'DISMISSED';
  quarantinedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export type FinancialAdapterStatus = 'UNAVAILABLE' | 'SANDBOX' | 'CONFIGURED';

export interface IFinancingExchangeAdapter {
  readonly status: FinancialAdapterStatus;
  verifyEligibility(request: EligibilityCheckRequest): Promise<EligibilityCheckResponse>;
  submitClaim(claim: Claim): Promise<{ success: boolean; externalReference?: string; status: ClaimStatus; message: string }>;
}

export interface INationalIdentityAdapter {
  readonly status: FinancialAdapterStatus;
  verifyNationalId(idNumber: string): Promise<{ configured: boolean; verified: boolean; status: string }>;
}

export interface INationalCoverageAdapter {
  readonly status: FinancialAdapterStatus;
  checkNationalRegistry(nationalId: string): Promise<{ configured: boolean; coverageFound: boolean; details?: any }>;
}

export interface INationalClaimsAdapter {
  readonly status: FinancialAdapterStatus;
  transmitClaimBatch(claims: Claim[]): Promise<{ configured: boolean; acceptedCount: number; status: string }>;
}

export interface INationalPaymentAdapter {
  readonly status: FinancialAdapterStatus;
  initiatePayment(payment: Payment): Promise<{ configured: boolean; transactionId?: string; status: string }>;
}
