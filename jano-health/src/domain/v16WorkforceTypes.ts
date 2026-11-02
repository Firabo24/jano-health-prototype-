/**
 * Jano Health - Clinical Core V16: Workforce & Care Operations
 * 
 * Domain Types & Type-Safe Operational Contracts.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * 1. User ≠ Practitioner (authentication vs clinical identity)
 * 2. User ≠ Workforce Credential
 * 3. Practitioner ≠ Employment Contract
 * 4. Practitioner ≠ Facility Assignment
 * 5. Facility Assignment ≠ Shift
 * 6. Shift ≠ Appointment
 * 7. Appointment ≠ Encounter
 * 8. Care Team ≠ User Role
 * 9. Operational Task ≠ Clinical Decision
 * 10. Workload ≠ Clinical Performance Judgment
 * 11. AI Suggestion ≠ Workforce Decision
 * 12. Credential ≠ Authorization / RBAC Permission
 * 13. Credential Expiration DOES NOT delete historical clinical records.
 * 14. Handover IS A COORDINATION ARTIFACT, not the clinical source of truth.
 */

import { RoleType } from './types';

// ============================================================================
// 1. WORKFORCE MEMBER
// ============================================================================

export type WorkforceMemberStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'ON_LEAVE'
  | 'RETIRED';

export type ProfessionalCategory =
  | 'physician'
  | 'nurse'
  | 'pharmacist'
  | 'laboratory_professional'
  | 'radiology_professional'
  | 'health_officer'
  | 'midwife'
  | 'community_health_worker'
  | 'allied_health_professional'
  | 'administrator'
  | 'technician'
  | string;

export interface ContactReference {
  email?: string;
  phone?: string;
  emergencyContact?: string;
}

export interface WorkforceProvenance {
  createdAt: string;
  createdBy: string;
  facilityId: string;
  systemVersion?: string;
}

export interface WorkforceIntegrityMetadata {
  hash: string;
  lastVerifiedAt?: string;
  signatureAlgorithm?: string;
}

export interface WorkforceMember {
  workforceMemberId: string;
  practitionerReference?: string; // Link to FHIR/Clinical Practitioner
  userReference?: string; // Link to auth User if system user
  displayName: string;
  professionalCategory: ProfessionalCategory;
  specialties: string[];
  status: WorkforceMemberStatus;
  facilityAssignments: WorkforceFacilityAssignment[];
  qualifications: Qualification[];
  credentials: WorkforceCredential[];
  availability: WorkforceAvailabilityStatus;
  contactReference?: ContactReference;
  provenance: WorkforceProvenance;
  effectivePeriod: {
    start: string;
    end?: string;
  };
  version: number;
  integrityMetadata?: WorkforceIntegrityMetadata;
}

// Backwards-compatible aliases
export type PractitionerWorkforceStatus = WorkforceMemberStatus;
export interface WorkforcePractitioner extends WorkforceMember {
  practitionerId: string;
  primaryFacilityId: string;
  assignedFacilityIds: string[];
  departmentId?: string;
  designation: string;
  roleType: RoleType;
  cadre: 'PHYSICIAN' | 'NURSE' | 'CLINICAL_OFFICER' | 'PHARMACIST' | 'LAB_TECH' | 'RADIOGRAPHER' | 'COMMUNITY_HEALTH_WORKER';
}

// ============================================================================
// 2. QUALIFICATIONS
// ============================================================================

export type QualificationVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'REJECTED';

export interface Qualification {
  qualificationId: string;
  workforceMemberId: string;
  qualificationType: string;
  issuingOrganization: string;
  issueDate: string;
  expiryDate?: string;
  verificationStatus: QualificationVerificationStatus;
  verificationReference?: string;
  provenance: {
    verifiedAt?: string;
    verifiedBy?: string;
  };
}

// ============================================================================
// 3. CREDENTIALS
// ============================================================================

export type CredentialVerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'PROVISIONAL';

export interface CredentialScope {
  facilityIds?: string[];
  departments?: string[];
  specialties?: string[];
}

export interface WorkforceCredential {
  credentialId: string;
  workforceMemberId: string;
  credentialType:
    | 'MEDICAL_LICENSE'
    | 'NURSING_BOARD'
    | 'SPECIALIST_REGISTRATION'
    | 'TRAINING_CERTIFICATE'
    | 'FACILITY_PRIVILEGE'
    | 'COMPETENCY'
    | string;
  issuingAuthority: string;
  credentialReference: string;
  effectiveFrom: string;
  expiresAt: string;
  verificationStatus: CredentialVerificationStatus;
  scope: CredentialScope;
  provenance: {
    verifiedBy?: string;
    verifiedAt?: string;
    source?: string;
  };
  // Backwards compatibility
  practitionerId?: string;
  issuingBody?: string;
  licenseNumber?: string;
  validFrom?: string;
  validTo?: string;
  scopeOfPractice?: string[];
}

// ============================================================================
// 4. FACILITY ASSIGNMENTS
// ============================================================================

export type WorkforceFacilityAssignmentStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'ENDED'
  | 'SUSPENDED';

export interface WorkforceFacilityAssignment {
  assignmentId: string;
  workforceMemberId: string;
  facilityId: string;
  organizationId?: string;
  role: string;
  department: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: WorkforceFacilityAssignmentStatus;
  scope?: string[];
  provenance: {
    assignedBy: string;
    assignedAt: string;
  };
}

// ============================================================================
// 5. CARE TEAMS
// ============================================================================

export type CareTeamStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'CONCLUDED';

export type CareTeamMembershipStatus =
  | 'ACTIVE'
  | 'RELIEVED'
  | 'TRANSFERRED';

export interface CareTeamMembership {
  membershipId: string;
  careTeamId: string;
  workforceMemberId: string;
  role:
    | 'attending_clinician'
    | 'primary_nurse'
    | 'pharmacist'
    | 'care_coordinator'
    | 'consultant'
    | 'supervisor'
    | string;
  responsibility: string;
  startAt: string;
  endAt?: string;
  status: CareTeamMembershipStatus;
  provenance: {
    assignedBy: string;
    assignedAt: string;
  };
}

export interface CareTeam {
  careTeamId: string;
  patientReference?: string; // Present for patient-specific teams, undefined for operational service teams
  facilityId: string;
  service: string;
  members: CareTeamMembership[];
  leader?: string; // workforceMemberId
  purpose: string;
  effectivePeriod: {
    start: string;
    end?: string;
  };
  status: CareTeamStatus;
  provenance: {
    createdAt: string;
    createdBy: string;
    facilityId: string;
  };
}

// Backwards-compatible alias
export interface CareTeamAssignment {
  assignmentId: string;
  patientId: string;
  practitionerId: string;
  facilityId: string;
  roleInTeam: 'PRIMARY_ATTENDING' | 'CONSULTING' | 'TRIAGE_NURSE' | 'CASE_MANAGER' | 'PHARMACIST';
  assignedAt: string;
  relievedAt?: string;
  status: 'ACTIVE' | 'CONCLUDED' | 'TRANSFERRED';
}

// ============================================================================
// 6. DUTY ROSTERS & SHIFTS
// ============================================================================

export type DutyRosterStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'CANCELLED';

export type ShiftType =
  | 'DAY'
  | 'EVENING'
  | 'NIGHT'
  | 'ON_CALL'
  | 'EMERGENCY'
  | 'WEEKEND'
  | 'CUSTOM';

export type ShiftStatus =
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'MISSED'
  | 'CANCELLED'
  | 'REASSIGNED';

export interface ShiftAssignment {
  shiftId: string;
  rosterId: string;
  workforceMemberId: string;
  facilityId: string;
  department: string;
  startAt: string;
  endAt: string;
  shiftType: ShiftType;
  status: ShiftStatus;
  replacementReference?: string;
  provenance: {
    assignedBy: string;
    assignedAt: string;
  };
}

export interface DutyRoster {
  rosterId: string;
  facilityId: string;
  department: string;
  period: {
    start: string;
    end: string;
  };
  assignments: ShiftAssignment[];
  status: DutyRosterStatus;
  publishedAt?: string;
  approvedBy?: string;
  version: number;
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

// Backwards-compatible alias
export interface ShiftSchedule {
  scheduleId: string;
  practitionerId: string;
  facilityId: string;
  departmentId: string;
  shiftType: 'MORNING' | 'EVENING' | 'NIGHT' | 'ON_CALL' | 'OUTREACH';
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABSENT' | 'SWAPPED';
  handoverNotes?: string;
}

// ============================================================================
// 7. OPERATIONAL PRESENCE
// ============================================================================

export type WorkforcePresenceStatus =
  | 'EXPECTED'
  | 'PRESENT'
  | 'LATE'
  | 'ABSENT'
  | 'LEFT';

export interface WorkforcePresence {
  presenceId: string;
  workforceMemberId: string;
  shiftId?: string;
  facilityId: string;
  status: WorkforcePresenceStatus;
  timestamp: string;
  recordedBy: string;
  notes?: string;
}

// ============================================================================
// 8. SHIFT HANDOVER
// ============================================================================

export type ShiftHandoverStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'ACKNOWLEDGED'
  | 'AMENDED';

export interface ShiftHandoverAcknowledgment {
  acknowledgedBy: string;
  acknowledgedAt: string;
  notes?: string;
}

export interface ShiftHandover {
  handoverId: string;
  outgoingWorkforceMember: string;
  incomingWorkforceMember?: string;
  facility: string;
  department: string;
  startAt: string;
  endAt: string;
  patients: string[]; // Source patient references
  unresolvedTasks: string[]; // Task references
  clinicalSafetyFlags: string[]; // Urgent coordination flags (e.g. Critical Lab, Fasting)
  operationalNotes: string;
  acknowledgment?: ShiftHandoverAcknowledgment;
  status: ShiftHandoverStatus;
  provenance: {
    submittedAt: string;
    submittedBy: string;
  };
  integrityMetadata: {
    hash: string;
  };
}

// ============================================================================
// 9. TASKS & ESCALATION
// ============================================================================

export type WorkforceTaskPriority =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'URGENT'
  | 'CRITICAL';

export type WorkforceTaskType =
  | 'DOCUMENTATION'
  | 'FOLLOW_UP'
  | 'REFERRAL_COORDINATION'
  | 'SPECIMEN_COLLECTION'
  | 'MEDICATION_WORKFLOW'
  | 'RESULT_ACKNOWLEDGMENT'
  | 'IMAGING_COORDINATION'
  | 'DISCHARGE_PREPARATION'
  | 'EQUIPMENT_CHECK'
  | 'OPERATIONAL_TASK'
  | 'SUPERVISORY_REVIEW'
  | 'CRITICAL_RESULT_FOLLOW_UP';

export type WorkforceTaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type EscalationTriggerCondition =
  | 'OVERDUE'
  | 'CRITICAL_UNRESOLVED'
  | 'UNAVAILABLE_ASSIGNEE'
  | 'SHIFT_ENDING'
  | 'FAILED_HANDOVER'
  | 'REPEATED_REASSIGNMENT';

export interface TaskEscalation {
  escalationId: string;
  taskId: string;
  triggerCondition: EscalationTriggerCondition;
  escalatedBy: string;
  escalatedTo: string;
  timestamp: string;
  reason: string;
  status: 'ACTIVE' | 'RESOLVED';
}

export interface WorkforceTask {
  taskId: string;
  facilityId: string;
  service: string;
  assignedTo?: string; // workforceMemberId
  assignedTeam?: string; // careTeamId
  creator: string;
  taskType: WorkforceTaskType;
  priority: WorkforceTaskPriority;
  patientReference?: string;
  relatedClinicalReference?: {
    resourceType: string;
    resourceId: string;
  };
  dueAt: string;
  createdAt: string;
  completedAt?: string;
  status: WorkforceTaskStatus;
  escalationHistory?: TaskEscalation[];
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

// Backwards-compatible alias
export type OperationalTask = WorkforceTask;

// ============================================================================
// 10. AVAILABILITY & LEAVE
// ============================================================================

export type WorkforceAvailabilityStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'ON_CALL'
  | 'LEAVE'
  | 'RESTRICTED'
  | 'UNKNOWN';

export interface WorkforceAvailability {
  availabilityId: string;
  workforceMemberId: string;
  status: WorkforceAvailabilityStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  reason?: string;
}

export type WorkforceLeaveCategory =
  | 'ANNUAL'
  | 'SICK'
  | 'MATERNITY_PATERNITY'
  | 'STUDY'
  | 'COMPASSIONATE'
  | 'EMERGENCY';

export interface WorkforceLeave {
  leaveId: string;
  workforceMemberId: string;
  startAt: string;
  endAt: string;
  category: WorkforceLeaveCategory;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedBy?: string;
  provenance: {
    requestedAt: string;
    requestedBy?: string;
  };
}

// ============================================================================
// 11. SUPERVISION, TRAINING & COMPETENCY
// ============================================================================

export interface SupervisionAssignment {
  supervisionId: string;
  supervisorId: string;
  superviseeId: string;
  facilityId: string;
  service: string;
  scope: 'CLINICAL' | 'TRAINEE' | 'OPERATIONAL';
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'ACTIVE' | 'CONCLUDED' | 'SUSPENDED';
}

export interface TrainingRecord {
  trainingId: string;
  workforceMemberId: string;
  course: string;
  provider: string;
  completedAt: string;
  expiryAt?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  evidenceReference?: string;
  provenance: {
    recordedAt: string;
    recordedBy: string;
  };
}

export interface CompetencyRecord {
  competencyId: string;
  workforceMemberId: string;
  competencyType: string;
  assessment: string;
  assessedBy: string;
  assessedAt: string;
  validUntil?: string;
  status: 'COMPETENT' | 'NEEDS_SUPERVISION' | 'PROVISIONAL' | 'EXPIRED';
  provenance: {
    recordedAt: string;
    recordedBy: string;
  };
}

export interface ClinicalPrivilege {
  privilegeId: string;
  workforceMemberId: string;
  privilege: string;
  scope: string[];
  facilityId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  approvingAuthority: string;
  provenance: {
    grantedAt: string;
    grantedBy: string;
  };
}

// ============================================================================
// 12. WORKLOAD & STAFFING INTELLIGENCE
// ============================================================================

export interface WorkloadSnapshotMetrics {
  activeTasks: number;
  overdueTasks: number;
  encounters: number;
  emergencyLoad: number;
  labWorkload: number;
  radiologyWorkload: number;
  pharmacyWorkload: number;
  referrals: number;
  handoverVolume: number;
}

export interface WorkloadSnapshot {
  snapshotId: string;
  facilityId: string;
  department: string;
  service: string;
  period: {
    start: string;
    end: string;
  };
  metrics: WorkloadSnapshotMetrics;
  timestamp: string;
}

export interface StaffingRequirement {
  requirementId: string;
  facilityId: string;
  service: string;
  category: string;
  requiredCount: number;
  period: {
    start: string;
    end: string;
  };
}

export interface StaffingGap {
  gapId: string;
  facilityId: string;
  service: string;
  category: string;
  requiredCount: number;
  scheduledCount: number;
  availableCount: number;
  gap: number;
  status: 'SUFFICIENT' | 'DEFICIT' | 'SURPLUS' | 'UNKNOWN';
  period: {
    start: string;
    end: string;
  };
  confidence: number;
  dataCompleteness: number;
}
