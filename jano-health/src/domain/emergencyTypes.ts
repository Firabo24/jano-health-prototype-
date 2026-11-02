/**
 * Jano Health - Clinical Core V9: Emergency Domain Types
 * 
 * Defines aggregates, value objects, and operational models for:
 * 1. EmergencyCase: Acute care presentation aggregate with deterministic identifier.
 * 2. EmergencyTriage: Distinct clinical triage record with explicit rule provenance.
 * 3. EmergencyReassessment: Longitudinal evaluation records during acute observation.
 * 4. EmergencyAlert: Operational clinical alert signals (critical vitals/labs/rads).
 * 5. TransportRequest: Transport coordination abstraction for emergency transfers.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * - Emergency triage is a workflow-prioritization mechanism, NOT a diagnosis.
 * - EmergencyCase is NOT an Encounter (can reference source, resulting, or admission encounters).
 * - A triage signal is NOT a treatment decision.
 * - A critical alert is NOT an autonomous order.
 * - AI assistance is NOT an autonomous emergency clinician.
 */

import { ProvenanceRecord } from './types';

/**
 * Emergency arrival modes.
 * Note: Arrival mode is purely logistical; no medical significance is attached.
 */
export type EmergencyArrivalMode =
  | 'WALK_IN'
  | 'AMBULANCE'
  | 'INTER_FACILITY_TRANSFER'
  | 'COMMUNITY_REFERRAL'
  | 'POLICE_AUTHORITY'
  | 'OTHER';

/**
 * Valid emergency case status state machine.
 * Transitions strictly enforced by EmergencyService.
 */
export type EmergencyCaseStatus =
  | 'PRESENTED'
  | 'TRIAGE_PENDING'
  | 'TRIAGED'
  | 'ASSESSMENT'
  | 'STABILIZATION'
  | 'OBSERVATION'
  | 'DISPOSITION_PENDING'
  | 'DISCHARGED'
  | 'ADMITTED'
  | 'TRANSFERRED'
  | 'TRANSFER_REQUESTED'
  | 'DECEASED'
  | 'CANCELLED';

/**
 * Operational triage status.
 */
export type EmergencyTriageStatus = 'PENDING' | 'TRIAGED' | 'OVERRIDDEN';

/**
 * Triage systems supported by the clinical engine.
 * Never merge different triage frameworks into one supposedly standard SATS implementation.
 */
export type TriageSystemType = 'SATS' | 'MASS_CASUALTY_POLICY';

/**
 * Standard South African Triage Scale (SATS) color categories.
 * RED: Resuscitation (Immediate 0 min)
 * ORANGE: Very Urgent (< 10 min)
 * YELLOW: Urgent (< 60 min)
 * GREEN: Routine / Non-urgent (< 240 min)
 * BLUE: Dead on arrival / No signs of life in standard SATS descriptions
 *
 * NOTE: SATS does NOT contain a BLACK category.
 */
export type SATSCategory =
  | 'SATS_RED'
  | 'SATS_ORANGE'
  | 'SATS_YELLOW'
  | 'SATS_GREEN'
  | 'SATS_BLUE';

/**
 * Mass casualty / disaster triage categories.
 * Configured separately from standard in-hospital SATS.
 */
export type MassCasualtyCategory =
  | 'MASS_CASUALTY_RED'     // Immediate
  | 'MASS_CASUALTY_YELLOW'  // Delayed
  | 'MASS_CASUALTY_GREEN'   // Minor / Walking wounded
  | 'MASS_CASUALTY_BLACK';  // Expectant / Deceased

/**
 * Policy scopes for triage execution.
 */
export type TriagePolicyScope =
  | 'ADULT_IN_HOSPITAL'
  | 'PEDIATRIC_IN_HOSPITAL'
  | 'PREHOSPITAL_LOCAL_ADAPTATION';

/**
 * Implementation provenance classification.
 */
export type TriageImplementationType =
  | 'AUTHORITATIVE_SOURCE'
  | 'LOCAL_ADAPTATION'
  | 'SYNTHETIC_DEMO';

/**
 * Configurable target time policy metadata.
 * Explicitly NOT immutable medical law.
 */
export interface TriageTargetTimePolicy {
  targetTime: number;
  targetTimeUnit: 'MINUTES' | 'HOURS';
  source: string;
  version: string;
  policyScope: TriagePolicyScope;
  isImmutableMedicalLaw: false;
}

/**
 * Emergency acuity levels.
 * Standard SATS categories: RED, ORANGE, YELLOW, GREEN, BLUE.
 * EXPECTANT_BLACK is strictly restricted to MASS_CASUALTY_POLICY.
 */
export type EmergencyAcuity =
  | 'RESUSCITATION_RED'     // SATS Level 1: Immediate life threat (0m)
  | 'EMERGENT_ORANGE'       // SATS Level 2: Very urgent / high risk (<10m)
  | 'URGENT_YELLOW'         // SATS Level 3: Urgent (<60m)
  | 'LESS_URGENT_GREEN'     // SATS Level 4: Routine ambulatory (<240m)
  | 'DEAD_ON_ARRIVAL_BLUE'  // SATS Level 5: Dead on arrival / no signs of life (Standard SATS Blue)
  | 'NON_URGENT_BLUE'       // Alias for SATS Blue
  | 'EXPECTANT_BLACK';      // MASS_CASUALTY_POLICY ONLY: Expectant / Deceased (NOT standard SATS)

/**
 * Operational workflow priority (stored separately from clinical triage acuity).
 */
export type EmergencyWorkflowPriority = 'IMMEDIATE' | 'HIGH' | 'URGENT' | 'STANDARD' | 'LOW';

/**
 * Disposition types for acute emergency care.
 */
export type EmergencyDispositionType =
  | 'DISCHARGE'
  | 'OBSERVATION'
  | 'ADMISSION'
  | 'TRANSFER'
  | 'DEATH'
  | 'LEFT_BEFORE_COMPLETION'
  | 'OTHER';

/**
 * Emergency Case Aggregate.
 * Represents an acute care presentation at an emergency department or rural health center.
 */
export interface EmergencyCase {
  // Identity
  id: string;
  emergencyNumber: string; // EMR-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]
  patientId?: string; // Optional if unidentified / trauma unknown
  provisionalPatientName?: string;
  facilityId: string;
  departmentId?: string;

  // Presentation
  arrivalAt: string; // ISO 8601
  arrivalTime?: string; // Backward compatibility alias
  arrivalMode: EmergencyArrivalMode;
  chiefComplaint: string;
  presentingProblem?: string;
  referralSource?: string;
  broughtBy?: string;
  accompanyingPerson?: string;

  // Triage Summary
  triageStatus: EmergencyTriageStatus;
  acuity?: EmergencyAcuity;
  triagedById?: string;
  triagedByName?: string;
  triagedAt?: string;
  triageCategorySource?: string;
  triageRuleVersion?: string;
  emergencyTriageId?: string;

  // Backward compatibility triage fields
  currentTriageLevel?: string;
  transferFromFacilityId?: string;
  transferToFacilityId?: string;
  registeredAt?: string;
  triageCategory?: 'RED_RESUSCITATION' | 'YELLOW_URGENT' | 'GREEN_DELAYED' | 'BLACK_EXPECTANT';
  airwayBreathingCirculation?: {
    airwayPatent: boolean;
    respiratoryDistress: boolean;
    shockSigns: boolean;
    glasgowComaScale?: number;
  };

  // Clinical References (References only - do NOT copy entire chart)
  initialObservationsReference?: string;
  vitalSignsReference?: string[]; // IDs of existing VitalSign records
  immediateClinicalConcerns?: string[];
  allergiesReference?: string[]; // IDs of Allergy records
  medicationReference?: string[]; // IDs of MedicationOrder records
  knownProblemsReference?: string[]; // IDs of Problem records
  labOrdersReference?: string[]; // IDs of LaboratoryOrder records
  radiologyOrdersReference?: string[]; // IDs of RadiologyOrder records
  clinicalNotesReference?: string[]; // IDs of ClinicalNote records

  // Workflow
  status: EmergencyCaseStatus;
  priority: EmergencyWorkflowPriority;
  assignedClinicianId?: string;
  assignedClinicianName?: string;
  treatmentArea?: string; // e.g. "Resuscitation Bay 1", "Acute Bed 2"
  resuscitationFlag: boolean; // Operational state flag
  isActive: boolean; // Backward compatibility flag

  // Disposition
  disposition?: EmergencyDispositionType;
  dispositionAt?: string;
  dispositionById?: string;
  dispositionByName?: string;
  dispositionNotes?: string;
  resultingEncounterId?: string; // For ADMISSION
  transferReferralId?: string; // For TRANSFER (links to canonical Referral aggregate)
  dischargeInstructions?: string; // For DISCHARGE
  followUpPlan?: string;

  // Concurrency & Metadata
  version: number;
  provenance: ProvenanceRecord;
  createdAt: string;
  updatedAt: string;
  clientCreatedAt?: string;
  clientObservedAt?: string;
  serverReceivedAt?: string;
  serverCommittedAt?: string;
}

/**
 * Distinct Emergency Triage Record.
 * Stores comprehensive triage assessment with explicit rule provenance.
 */
export interface EmergencyTriage {
  id: string;
  emergencyCaseId: string;
  patientId?: string;
  facilityId: string;
  assessedById: string;
  assessedByName: string;
  assessedAt: string;
  acuity: EmergencyAcuity;
  chiefComplaint: string;
  immediateConcerns: string[];
  vitalSignsReference?: string[];
  triageNotes?: string;
  
  // Physical quick indicators
  airwayPatent: boolean;
  respiratoryDistress: boolean;
  shockSigns: boolean;
  glasgowComaScale?: number;
  hasSignsOfLife?: boolean;

  // Explicit SATS Provenance (Clinical Core V9/V10)
  triageSystem: TriageSystemType;
  version: string;
  jurisdiction: string;
  sourceReference: string;
  effectiveDate: string;
  ruleSetVersion: string;
  implementationType: TriageImplementationType;
  policyScope: TriagePolicyScope;
  targetTimePolicy?: TriageTargetTimePolicy;

  // Provenance & Rules
  ruleSetReference: string;
  provenance: ProvenanceRecord;
  isSyntheticDemoRule: boolean;
}

/**
 * Emergency Reassessment Aggregate.
 * Longitudinal acute monitoring records. Do NOT overwrite previous assessments.
 */
export interface EmergencyReassessment {
  id: string;
  emergencyCaseId: string;
  patientId?: string;
  facilityId: string;
  assessedById: string;
  assessedByName: string;
  assessedAt: string;
  currentStatus: EmergencyCaseStatus;
  updatedVitalsReference?: string[];
  clinicalChange: string; // Documented change in patient condition
  responseOrObservation: string; // Response to ongoing interventions
  planReference?: string;
  provenance: ProvenanceRecord;
}

/**
 * Operational Emergency Clinical Alert.
 * Aggregates clinical signals without autonomous medical prescribing or diagnosing.
 */
export interface EmergencyAlert {
  id: string;
  emergencyCaseId: string;
  patientId?: string;
  facilityId: string;
  type:
    | 'CRITICAL_VITAL'
    | 'HIGH_ACUITY_TRIAGE'
    | 'RAPID_DETERIORATION'
    | 'UNRESOLVED_CRITICAL_LAB'
    | 'UNRESOLVED_CRITICAL_RADIOLOGY'
    | 'TRANSPORT_DELAY';
  severity: 'WARNING' | 'CRITICAL' | 'LIFE_THREAT';
  title: string;
  details: string;
  detectedAt: string;
  sourceId?: string; // VitalSign ID, LabResult ID, etc.
  acknowledgedAt?: string;
  acknowledgedById?: string;
}

/**
 * Transport Coordination Abstraction for Emergency Transfers.
 * Links EmergencyCase to Referral domain without building a heavy dispatch engine.
 */
export interface TransportRequest {
  id: string;
  emergencyCaseId: string;
  referralId: string;
  status: 'REQUESTED' | 'DISPATCHED' | 'EN_ROUTE' | 'ARRIVED' | 'CANCELLED' | 'COMPLETED';
  ambulanceRequired: boolean;
  oxygenRequired: boolean;
  infusionSupportRequired: boolean;
  clinicalEscortRequired: boolean;
  originFacilityId: string;
  originFacilityName: string;
  destinationFacilityId: string;
  destinationFacilityName: string;
  vehicleIdentifier?: string;
  dispatchTime?: string;
  departureTime?: string;
  estimatedArrival?: string;
  actualArrival?: string;
  transportNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Valid state transitions for EmergencyCase.
 */
export const VALID_EMERGENCY_TRANSITIONS: Record<EmergencyCaseStatus, EmergencyCaseStatus[]> = {
  PRESENTED: ['TRIAGE_PENDING', 'CANCELLED'],
  TRIAGE_PENDING: ['TRIAGED', 'CANCELLED'],
  TRIAGED: ['ASSESSMENT', 'STABILIZATION', 'DISPOSITION_PENDING', 'CANCELLED'],
  ASSESSMENT: ['STABILIZATION', 'OBSERVATION', 'DISPOSITION_PENDING', 'CANCELLED'],
  STABILIZATION: ['ASSESSMENT', 'OBSERVATION', 'DISPOSITION_PENDING', 'CANCELLED'],
  OBSERVATION: ['ASSESSMENT', 'STABILIZATION', 'DISPOSITION_PENDING', 'CANCELLED'],
  DISPOSITION_PENDING: [
    'DISCHARGED',
    'ADMITTED',
    'TRANSFERRED',
    'TRANSFER_REQUESTED',
    'DECEASED',
    'OBSERVATION',
    'CANCELLED',
  ],
  TRANSFER_REQUESTED: ['TRANSFERRED', 'CANCELLED'],
  DISCHARGED: [],
  ADMITTED: [],
  TRANSFERRED: [],
  DECEASED: [],
  CANCELLED: [],
};
