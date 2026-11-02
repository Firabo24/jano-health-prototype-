/**
 * Jano Health - Clinical Core V8: Referrals & Care Coordination Domain Types
 * 
 * Defines canonical aggregates, lifecycles, structured clinical handoffs,
 * scoped information sharing, and closed-loop handoff outcomes.
 * 
 * Architectural Invariants:
 * 1. A referral is a clinical coordination record, NOT a diagnosis, encounter, or prescription.
 * 2. Receiving facilities maintain independent encounter provenance.
 * 3. Scoped data sharing preserves tenant facility isolation.
 * 4. Closed-loop handoffs require an explicit ReferralOutcome before closure.
 * 5. Full offline-first determinism with append-only event sourcing and audit trails.
 */

import { RoleType } from './types';
import { SyncStatus } from './persistence';

export interface EntityProvenance {
  source?: string;
  version?: string | number;
  recordedBy?: string;
  recordedAt?: string;
  facilityId?: string;
  sourceFacilityId?: string;
  sourceDeviceId?: string;
  actorId?: string;
  actorRole?: string;
  deviceId?: string;
  createdAt?: string;
  timestamp?: string;
  sourceType?: string;
  integrityHash?: string;
}

export type ReferralStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SENT'
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'INFORMATION_REQUESTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'IN_CARE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FOLLOW_UP_REQUIRED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'dispatched'
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'closed'
  | 'cancelled'
  | 'received'
  | 'submitted';

export type ReferralPriority =
  | 'ROUTINE'
  | 'URGENT'
  | 'EMERGENCY'
  | 'routine'
  | 'urgent'
  | 'emergency'
  | 'critical_emergency';

export type ReferralUrgency = ReferralPriority;

export type ReferralRequestedService =
  | 'MEDICINE'
  | 'SURGERY'
  | 'PEDIATRICS'
  | 'OBSTETRICS'
  | 'RADIOLOGY'
  | 'LABORATORY'
  | 'SPECIALIST_CONSULTATION'
  | 'EMERGENCY'
  | 'OTHER';

export type ReferralTransportMode =
  | 'ambulance'
  | 'public_transport'
  | 'mobile_transfer'
  | 'patient_arranged'
  | 'none';

export type DestinationFacilityStatus = 'RESOLVED' | 'UNRESOLVED';

export type ReferralOutcomeType =
  | 'SEEN'
  | 'TREATED'
  | 'ADMITTED'
  | 'TRANSFERRED'
  | 'RETURNED_TO_SENDER'
  | 'NO_LONGER_REQUIRED'
  | 'PATIENT_DECLINED'
  | 'LOST_TO_FOLLOW_UP'
  | 'OTHER'
  | 'counter_referral';

export type ReferralCommunicationType =
  | 'REQUEST_MORE_INFORMATION'
  | 'ACCEPTANCE_MESSAGE'
  | 'REJECTION_MESSAGE'
  | 'CLINICAL_HANDOFF'
  | 'OUTCOME_NOTIFICATION'
  | 'FOLLOW_UP_REQUEST'
  | 'OTHER';

/**
 * Scoped data sharing specification to prevent unbounded PHI disclosure.
 * Discloses only what is clinically pertinent to the referred episode.
 */
export interface ReferralSharingScope {
  shareSummary: boolean;
  shareDiagnoses: boolean;
  shareProblems: boolean;
  shareVitals: boolean;
  shareMedications: boolean;
  shareAllergies: boolean;
  shareLabResults: boolean;
  shareRadiologyReports: boolean;
  sharingPolicy: string;
  authorizationBasis: 'DIRECT_CARE_CONTINUITY' | 'EMERGENCY_TRANSFER' | 'EXPLICIT_CONSENT' | 'CLINICAL_PROTOCOL';
  consentReference?: string;
  recordedBy: string;
  recordedAt: string;
}

/**
 * Requester attribution and clinical provenance
 */
export interface ReferralRequester {
  requestingClinicianId: string;
  requestingClinicianName: string;
  requestingClinicianRole: RoleType;
  requestedAt: string;
}

/**
 * Administrative and logistical coordination details
 */
export interface ReferralAdministrativeDetails {
  preferredReceivingDepartment?: string;
  transportRequirement?: ReferralTransportMode | string;
  transportNotes?: string;
  appointmentRequest?: {
    preferredDate?: string;
    specialInstructions?: string;
  };
  contactInformation?: {
    contactName?: string;
    phone?: string;
    secureChannel?: string;
  };
  specialConsiderations?: string;
}

/**
 * Structured audit record for every state machine transition
 */
export interface ReferralStatusTransition {
  fromStatus: ReferralStatus;
  toStatus: ReferralStatus;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole?: RoleType | string;
  facilityId: string;
  notes?: string;
}

/**
 * Canonical Referral Aggregate
 */
export interface Referral {
  id: string;                         // UUIDv7 / distributed ID
  referralNumber?: string;            // Human-scannable deterministic identifier: REF-FAC-YYYYMMDD-DEV-SEQ+CHECK
  patientId: string;
  sourceEncounterId?: string;         // Originating encounter at sending facility
  encounterId?: string;
  sourceFacilityId?: string;
  destinationFacilityId?: string;
  destinationFacilityName?: string;
  destinationDepartment?: string;
  destinationStatus?: DestinationFacilityStatus;

  // Requester
  requester?: ReferralRequester;
  requestingClinicianId?: string;
  requestingClinicianName?: string;
  requestingClinicianRole?: RoleType;
  requestedAt?: string;
  referringProviderId?: string;
  referringProviderName?: string;

  // Backwards compatibility aliases
  fromFacilityId?: string;
  toFacilityId?: string;
  referringClinicianId?: string;
  receivingSpecialty?: string;
  transportMode?: ReferralTransportMode | string;
  transportationNeed?: string;
  oxygenRequired?: boolean;
  ivAccessRequired?: boolean;
  attendantRequired?: boolean;

  // Clinical Handoff Core
  reasonForReferral?: string;
  primaryReason?: string;
  clinicalSummary: string;
  clinicalQuestion?: string;
  provisionalDiagnosis?: string;
  icdCode?: string;
  requestedService?: ReferralRequestedService | string;
  referralType?: string;
  urgency?: ReferralUrgency | string;
  priority: ReferralPriority | string;
  notes?: string;

  // References to source records (avoids cloning entire charts)
  workingDiagnosisReferences?: string[];
  relevantProblems?: string[];
  relevantObservations?: string;
  currentMedicationsReference?: string[];
  allergiesReference?: string[];
  relevantLaboratoryReferences?: string[];
  relevantRadiologyReferences?: string[];

  // Administrative / Logistics
  administrative?: ReferralAdministrativeDetails;

  // Lifecycle & State Machine
  status: ReferralStatus;
  statusHistory?: ReferralStatusTransition[];
  version?: number;
  isSigned?: boolean;
  signedAt?: string;
  signedById?: string;
  signedByName?: string;
  digitalSeal?: string;               // Cryptographic SHA-256 seal

  // Transition Metadata & Timestamps
  submittedAt?: string;
  dispatchedAt?: string;
  receivedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  rejectionNotes?: string;
  rejectionDetails?: {
    reason: string;
    rejectedBy: string;
    rejectedByName?: string;
    rejectedAt: string;
    notes?: string;
  };
  cancellationReason?: string;
  cancellationDetails?: {
    reason: string;
    cancelledBy: string;
    cancelledAt: string;
  };
  scheduledTime?: string;
  completedAt?: string;
  closedAt?: string;

  // Cross-Facility Receiving & Closed-Loop Links
  receivingEncounterId?: string;      // Encounter minted at receiving facility
  outcomeId?: string;                 // Linked ReferralOutcome
  receivingFacilityAcknowledgedAt?: string;
  receivingFacilityAcceptedAt?: string;
  scheduledAppointmentId?: string;

  // Information Governance
  sharingScope?: ReferralSharingScope;

  // Provenance & Audit
  provenance?: EntityProvenance;
  source?: 'LOCAL' | 'EXTERNAL' | 'IMPORTED';
  deviceId?: string;
  createdAt: string;
  updatedAt?: string;

  // Synchronization
  syncStatus?: SyncStatus;
  syncedAt?: string;

  [key: string]: unknown;
}

/**
 * ReferralOutcome Aggregate
 * Represents the documented clinical conclusion and feedback loop of a referral.
 */
export interface ReferralOutcome {
  id: string;                         // UUID / ref_out_...
  referralId: string;
  patientId: string;
  encounterId?: string;
  receivingEncounterId?: string;      // Linked receiving facility encounter
  receivingFacilityId: string;
  receivingFacilityName?: string;
  receivingClinicianId?: string;
  receivingClinicianName?: string;
  receivingClinicianRole?: RoleType | string;
  consultantId?: string;
  consultantName?: string;
  consultantRole?: string;
  completedAt: string;

  outcomeType?: ReferralOutcomeType;
  disposition?: string;
  findings?: string;
  findingsSummary?: string;
  treatmentSummary?: string;
  finalDiagnosis?: string;
  icdCode?: string;
  diagnosesReference?: string[];
  treatmentReference?: string[];
  recommendations?: string;
  followUpPlan?: string;

  // Follow-Up Specification
  followUpRequired?: boolean;
  followUpDate?: string;
  followUpFacilityId?: string;
  followUpResponsibleParty?: string;
  followUpStatus?: 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

  medicationsPrescribed?: Array<{
    name: string;
    dosage: string;
    route: string;
    frequency: string;
    duration: string;
  }>;

  version?: number;
  provenance?: EntityProvenance;
  syncStatus?: SyncStatus;
  syncedAt?: string;

  [key: string]: unknown;
}

/**
 * ReferralCommunication Aggregate
 * Represents an auditable message exchange between sending and receiving teams.
 */
export interface ReferralCommunication {
  id: string;                         // ref_comm_...
  referralId: string;
  senderId: string;
  senderName: string;
  senderRole?: RoleType | string;
  receiverId?: string;
  facilityId?: string;
  senderFacilityId?: string;
  recipientFacilityId?: string;
  timestamp: string;
  communicationType?: ReferralCommunicationType;
  subject?: string;
  message: string;
  urgent?: boolean;
  acknowledgmentStatus?: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt?: string;
  acknowledgedBy?: string;

  [key: string]: unknown;
}

/**
 * Controlled Referral Package
 * The minimized transport payload crossing facility boundaries.
 */
export interface ReferralPackage {
  packageId: string;
  referralId: string;
  referralNumber: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  createdAt: string;
  urgency: ReferralUrgency;
  requestedService: string;

  // Patient Demographic Match Data (Minimized)
  patient: {
    patientId: string;
    mrn: string;
    fullName: string;
    dateOfBirth?: string;
    sex?: string;
    villageTown?: string;
    contactNumber?: string;
  };

  // Structured Clinical Handoff
  handoff: {
    reasonForReferral: string;
    clinicalSummary: string;
    clinicalQuestion: string;
    workingDiagnoses?: string[];
    activeProblems?: string[];
    currentMedications?: string[];
    allergies?: string[];
    vitalObservations?: string;
    relevantLabResults?: string[];
    relevantRadiologyReports?: string[];
  };

  sharingScope: ReferralSharingScope;
  provenance: EntityProvenance;
  digitalSeal: string;
}

/**
 * Completeness Validation Report
 */
export interface ReferralCompletenessResult {
  isValid: boolean;
  status: 'COMPLETE' | 'INCOMPLETE';
  missingFields: string[];
  warnings: string[];
}

/**
 * State machine legal transitions map
 */
export const VALID_REFERRAL_TRANSITIONS: Record<string, ReferralStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED', 'cancelled'],
  SUBMITTED: ['SENT', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'dispatched', 'cancelled'],
  SENT: ['RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'cancelled'],
  RECEIVED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'cancelled'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'SCHEDULED', 'IN_CARE', 'IN_PROGRESS', 'CANCELLED', 'cancelled'],
  ACCEPTED: ['SCHEDULED', 'IN_CARE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'completed', 'cancelled'],
  SCHEDULED: ['IN_CARE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'completed', 'cancelled'],
  IN_CARE: ['COMPLETED', 'CANCELLED', 'completed', 'cancelled'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'completed', 'cancelled'],
  COMPLETED: ['CLOSED', 'closed'],
  REJECTED: ['CLOSED', 'closed'],
  CANCELLED: ['CLOSED', 'closed'],
  CLOSED: [],
  // Legacy aliases
  dispatched: ['accepted', 'completed', 'cancelled', 'RECEIVED', 'ACCEPTED', 'COMPLETED', 'CANCELLED'],
  pending: ['accepted', 'completed', 'cancelled', 'ACCEPTED', 'COMPLETED', 'CANCELLED'],
  accepted: ['completed', 'cancelled', 'COMPLETED', 'CANCELLED'],
  completed: ['closed', 'CLOSED'],
  cancelled: ['closed', 'CLOSED'],
};
