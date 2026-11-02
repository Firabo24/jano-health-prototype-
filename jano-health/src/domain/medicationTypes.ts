/**
 * Jano Health - Clinical Core V6: Medication Domain Types
 * Authoritative models for MedicationDefinition, MedicationOrder, Prescription,
 * DispenseRecord boundaries, and Medication Safety Review.
 * 
 * DISCLAIMER: Clinical validation and synthetic knowledge dataset for rural and offline health facilities.
 */

import { RoleType } from './types';

export type MedicationRoute =
  | 'oral'
  | 'intravenous'
  | 'intramuscular'
  | 'subcutaneous'
  | 'topical'
  | 'inhalation'
  | 'sublingual'
  | 'rectal'
  | 'ophthalmic'
  | 'otic';

export type MedicationOrderPriority = 'routine' | 'urgent' | 'stat';

export type MedicationOrderStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'ACTIVE'
  | 'HELD'
  | 'DISCONTINUED'
  | 'CANCELLED';

export type PrescriptionStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'ON_HOLD'
  | 'PARTIALLY_DISPENSED'
  | 'DISPENSED'
  | 'CANCELLED'
  | 'EXPIRED';

export type MedicationSafetyStatus =
  | 'CLEAR'
  | 'WARNING'
  | 'HIGH_RISK'
  | 'CONTRAINDICATED'
  | 'UNKNOWN'
  | 'KNOWLEDGE_UNAVAILABLE';

export type OverallMedicationOrderSafetyState =
  | 'PENDING_REVIEW'
  | 'SAFE_TO_REVIEW'
  | 'WARNING'
  | 'HIGH_RISK'
  | 'CONTRAINDICATED'
  | 'KNOWLEDGE_UNAVAILABLE';

export interface MedicationDefinition {
  id: string; // e.g., "med_def_amox_500"
  code: string; // e.g., "WHO-EML-AMOX-500"
  codingSystem: string; // e.g., "WHO_EML" | "SYNTHETIC_RXNORM" | "LOCAL_FORMULARY"
  genericName: string;
  brandName?: string;
  dosageForm: string; // e.g., "Capsule", "Tablet", "Oral Suspension", "Injection"
  strength: string; // e.g., "500", "250mg/5mL", "1"
  strengthUnit: string; // e.g., "mg", "g", "mL", "mcg"
  routeOptions: MedicationRoute[];
  active: boolean;
  source: string; // e.g., "WHO Model List of Essential Medicines (24th List, 2025)"
  sourceVersion: string; // e.g., "24th-2025"
  effectiveDate: string; // ISO date
  provenance: string; // Provenance description
  sourceOrganization?: string; // e.g., "WHO"
  sourceDocument?: string; // e.g., "WHO Model List of Essential Medicines"
  edition?: string; // e.g., "24th"
  publicationYear?: number; // e.g., 2025
  publishedAt?: string; // e.g., "2025-09-05"
  ruleClassification?: 'AUTHORITATIVE' | 'SYNTHETIC_DEMO' | 'CONFIGURED_POLICY' | 'UNAVAILABLE';
  isControlledSubstance?: boolean;
  therapeuticClass?: string; // e.g., "Penicillin Antibacterial", "Antimalarial", "NSAID", "Anticoagulant"
  defaultFrequency?: string;
  defaultDurationDays?: number;
  atcCode?: string;
  contraindications?: string[];
  boxedWarnings?: string[];
}

export interface SafetyCheckResult {
  checkType: 'ALLERGY' | 'DRUG_INTERACTION' | 'CONTRAINDICATION' | 'DUPLICATE_THERAPY' | 'DOSE_STRUCTURE' | 'ROUTE';
  status: MedicationSafetyStatus;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  source: string;
  sourceVersion: string;
  jurisdiction?: string;
  effectiveDate?: string;
  ruleSetVersion?: string;
  sourceOrganization?: string;
  sourceDocument?: string;
  edition?: string;
  publicationYear?: number;
  publishedAt?: string;
  ruleClassification?: 'AUTHORITATIVE' | 'SYNTHETIC_DEMO' | 'CONFIGURED_POLICY' | 'UNAVAILABLE';
  checkedAt: string;
  message: string;
  matchedEvidence?: string[];
  recommendation?: string;
}

export interface WarningAcknowledgement {
  checkType: string;
  warningMessage: string;
  clinicianId: string;
  clinicianName: string;
  clinicianRole: RoleType;
  response: 'ACKNOWLEDGE_AND_CONTINUE';
  justification: string;
  timestamp: string;
}

export interface MedicationOrder {
  // Identity
  id: string; // UUIDv7 aggregate ID: med_ord_<uuidv7>
  orderNumber: string; // MED-ORD-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]
  patientId: string;
  encounterId?: string;
  facilityId: string;

  // Prescriber
  orderedById: string;
  orderedByName: string;
  orderedByRole: RoleType;
  orderedAt: string;

  // Medication Clinical Data
  medicationDefinitionId: string;
  medicationCode: string;
  genericName: string;
  brandName?: string;
  formulation: string;
  strength: string;
  strengthUnit: string;
  route: MedicationRoute;
  dose: string;
  doseUnit: string;
  frequency: string;
  frequencyText?: string;
  durationValue: number;
  durationUnit: 'days' | 'weeks' | 'months' | 'doses';
  quantity: number;
  quantityUnit: string;

  // Clinical Indication & Instructions
  indication: string;
  instructions?: string;
  priority: MedicationOrderPriority;
  notes?: string;

  // Safety Verification State
  safetyReviewState: OverallMedicationOrderSafetyState;
  safetyChecks: SafetyCheckResult[];
  acknowledgedWarnings?: WarningAcknowledgement[];

  // Lifecycle & Version
  status: MedicationOrderStatus;
  version: number;
  previousVersionId?: string;

  // Discontinue / Held / Cancel Attributions
  heldAt?: string;
  heldReason?: string;
  heldById?: string;
  discontinuedAt?: string;
  discontinuedReason?: string;
  discontinuedById?: string;
  discontinuedByName?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledById?: string;

  // Backwards-compatible aliases
  medicationName?: string;
  dosage?: string;
  prescriberId?: string;
  prescriberName?: string;
  prescriberRole?: RoleType;
  clinicalIndication?: string;

  // Provenance & Audit
  source: 'LOCAL_PRESCRIPTION' | 'EXTERNAL' | 'PATIENT_REPORTED';
  provenance: string;
  createdAt: string;
  updatedAt: string;

  // Synchronization
  syncStatus: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export interface PrescriptionAmendmentRecord {
  version: number;
  amendedAt: string;
  amendedById: string;
  amendedByName: string;
  amendmentReason: string;
  previousSignatureHash: string;
  snapshot: Record<string, unknown>;
}

export interface Prescription {
  // Identity
  id: string; // UUIDv7 aggregate ID: rx_<uuidv7>
  prescriptionNumber: string; // RX-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]
  medicationOrderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;

  // Prescriber Identity & Attribution
  prescriberId: string;
  prescriberName: string;
  prescriberRole: RoleType;
  issuedAt: string;

  // Medication Snapshot (denormalized at issuance)
  medicationDefinitionId: string;
  medicationCode?: string;
  genericName: string;
  brandName?: string;
  formulation: string;
  strength: string;
  strengthUnit: string;
  dose: string;
  doseUnit: string;
  route: MedicationRoute;
  frequency: string;
  durationValue: number;
  durationUnit: string;

  // Dispensing Bounds & Validity
  validityStart: string;
  validityEnd: string;
  quantity: number;
  quantityUnit: string;
  refills: number;
  instructions?: string;

  // Safety Snapshot & Legal Clinical Attestation
  safetyReviewState: OverallMedicationOrderSafetyState;
  acknowledgedWarnings?: WarningAcknowledgement[];
  prescriberAttestation: {
    attestedAt: string;
    attestedById: string;
    attestedByName: string;
    statement: string;
  };
  signatureHash: string; // Tamper-evident SHA-256 seal of the issued prescription

  // Lifecycle
  status: PrescriptionStatus;
  version: number;

  // Holds, Amendments & Cancellations
  onHoldAt?: string;
  onHoldReason?: string;
  onHoldById?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledById?: string;
  amendedAt?: string;
  amendmentReason?: string;
  amendedById?: string;
  previousPrescriptionId?: string;
  amendmentHistory?: PrescriptionAmendmentRecord[];

  // Provenance & Sync
  source: string;
  provenance: string;
  syncStatus: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;

  // Pharmacy Review & Dispensing Handoff (V6 -> V7 bridge)
  pharmacyReviewStatus?: 'APPROVED' | 'REJECTED' | 'CLARIFICATION_NEEDED';
  pharmacyReviewedAt?: string;
  pharmacyReviewedById?: string;
  pharmacyReviewedByName?: string;
  pharmacyReviewNotes?: string;
  dispenseRecordId?: string;

  // Dispense Details
  batchNumber?: string;
  dispensedQuantity?: number;
  dispensedAt?: string;
  dispensedById?: string;
  dispensedByName?: string;
  dispenseNotes?: string;
}

export type { DispenseRecord, DispenseStatus } from './pharmacyTypes';


export interface MedicationAdministration {
  id: string;
  medicationOrderId: string;
  prescriptionId?: string;
  patientId: string;
  encounterId?: string;
  administeredById: string;
  administeredAt: string;
  doseGiven: string;
  route: MedicationRoute;
  status: 'GIVEN' | 'REFUSED' | 'HELD' | 'MISSED';
  notes?: string;
}

export interface MedicationReconciliation {
  id: string;
  patientId: string;
  encounterId?: string;
  reconciledById: string;
  reconciledAt: string;
  source: 'ADMISSION' | 'TRANSFER' | 'DISCHARGE' | 'OUTPATIENT';
  status: 'DRAFT' | 'COMPLETED';
  notes?: string;
}

export type MedicationHistoryCategory =
  | 'ACTIVE'
  | 'DISCONTINUED'
  | 'COMPLETED'
  | 'HELD'
  | 'HISTORICAL'
  | 'EXTERNAL'
  | 'PATIENT_REPORTED';

export interface DerivedMedicationHistoryItem {
  id: string;
  orderNumber?: string;
  prescriptionNumber?: string;
  patientId: string;
  genericName: string;
  brandName?: string;
  formulation: string;
  strength: string;
  strengthUnit: string;
  route: string;
  dose: string;
  frequency: string;
  durationText?: string;
  category: MedicationHistoryCategory;
  source: 'LOCAL_PRESCRIPTION' | 'EXTERNAL' | 'PATIENT_REPORTED';
  prescriberName?: string;
  prescribedAt?: string;
  discontinuedAt?: string;
  discontinuedReason?: string;
  facilityId?: string;
  status: string;
}
