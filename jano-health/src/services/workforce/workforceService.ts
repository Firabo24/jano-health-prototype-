/**
 * Jano Health - Clinical Core V16: Workforce Member & Operational Services
 * 
 * Manages the operational workforce directory, multi-facility assignments,
 * qualifications, availability, leave, supervision, and training records.
 * 
 * INVARIANTS:
 * - User ≠ Practitioner ≠ WorkforceMember
 * - Historical assignments and records are NEVER destroyed; transitions are recorded append-only.
 * - RETIRED status is terminal and irreversible.
 * - Credential expiry does not modify or delete historical clinical documentation.
 */

import {
  WorkforceMember,
  WorkforceMemberStatus,
  ProfessionalCategory,
  WorkforceFacilityAssignment,
  WorkforceFacilityAssignmentStatus,
  Qualification,
  QualificationVerificationStatus,
  WorkforceAvailability,
  WorkforceAvailabilityStatus,
  WorkforceLeave,
  SupervisionAssignment,
  TrainingRecord,
  CompetencyRecord,
  ClinicalPrivilege,
} from '../../domain/v16WorkforceTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export function isValidWorkforceStatusTransition(
  current: WorkforceMemberStatus,
  target: WorkforceMemberStatus
): boolean {
  if (current === target) return true;
  if (current === 'RETIRED') {
    // RETIRED is a terminal state.
    return false;
  }
  return true;
}

export class WorkforceService {
  private static instance: WorkforceService;
  private members: Map<string, WorkforceMember> = new Map();
  private assignments: Map<string, WorkforceFacilityAssignment> = new Map();
  private qualifications: Map<string, Qualification> = new Map();
  private availabilities: Map<string, WorkforceAvailability> = new Map();
  private leaves: Map<string, WorkforceLeave> = new Map();
  private supervisions: Map<string, SupervisionAssignment> = new Map();
  private trainings: Map<string, TrainingRecord> = new Map();
  private competencies: Map<string, CompetencyRecord> = new Map();
  private privileges: Map<string, ClinicalPrivilege> = new Map();

  private constructor() {
    this.seedInitialSyntheticWorkforce();
  }

  public static getInstance(): WorkforceService {
    if (!WorkforceService.instance) {
      WorkforceService.instance = new WorkforceService();
    }
    return WorkforceService.instance;
  }

  private seedInitialSyntheticWorkforce() {
    const now = '2026-01-01T08:00:00Z';

    const drAmani: WorkforceMember = {
      workforceMemberId: 'wfm-dr-amani',
      practitionerReference: 'prc-amani-001',
      userReference: 'usr-dr-amani',
      displayName: 'Dr. Amani Mkwawa',
      professionalCategory: 'physician',
      specialties: ['General Medicine', 'Emergency Care', 'Infectious Disease'],
      status: 'ACTIVE',
      facilityAssignments: [
        {
          assignmentId: 'wfa-amani-amgh-01',
          workforceMemberId: 'wfm-dr-amani',
          facilityId: 'fac-amgh',
          role: 'Attending Physician',
          department: 'Emergency & Outpatient',
          effectiveFrom: '2025-01-01T00:00:00Z',
          status: 'ACTIVE',
          scope: ['CLINICAL_CARE', 'SUPERVISION'],
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: '2025-01-01T00:00:00Z',
          },
        },
      ],
      qualifications: [
        {
          qualificationId: 'qlf-amani-mbchb',
          workforceMemberId: 'wfm-dr-amani',
          qualificationType: 'MBChB (Bachelor of Medicine & Surgery)',
          issuingOrganization: 'Muhimbili University of Health and Allied Sciences',
          issueDate: '2016-11-15',
          verificationStatus: 'VERIFIED',
          verificationReference: 'MUHAS-MED-2016-8821',
          provenance: {
            verifiedAt: '2025-01-02T10:00:00Z',
            verifiedBy: 'usr-admin-amgh',
          },
        },
      ],
      credentials: [
        {
          credentialId: 'crd-amani-mct',
          workforceMemberId: 'wfm-dr-amani',
          credentialType: 'MEDICAL_LICENSE',
          issuingAuthority: 'Medical Council of Tanganyika',
          credentialReference: 'MCT-LIC-44821',
          effectiveFrom: '2025-01-01',
          expiresAt: '2027-12-31',
          verificationStatus: 'VERIFIED',
          scope: {
            facilityIds: ['fac-amgh', 'fac-central'],
            departments: ['Emergency', 'Outpatient', 'Inpatient Ward'],
            specialties: ['General Practice', 'Emergency Care'],
          },
          provenance: {
            verifiedBy: 'usr-admin-amgh',
            verifiedAt: '2025-01-02T10:00:00Z',
            source: 'MCT_REGISTRY_PORTAL',
          },
        },
      ],
      availability: 'AVAILABLE',
      contactReference: {
        email: 'amani.mkwawa@janohealth.org',
        phone: '+255 784 112 233',
      },
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
        facilityId: 'fac-amgh',
        systemVersion: 'v16.0',
      },
      effectivePeriod: {
        start: '2025-01-01T00:00:00Z',
      },
      version: 1,
      integrityMetadata: {
        hash: sha256(`wfm-dr-amani:ACTIVE:physician:${now}`),
        lastVerifiedAt: now,
      },
    };

    const nurseZawadi: WorkforceMember = {
      workforceMemberId: 'wfm-nurse-zawadi',
      practitionerReference: 'prc-zawadi-002',
      userReference: 'usr-nurse-1',
      displayName: 'Nurse Zawadi Mwamburi',
      professionalCategory: 'nurse',
      specialties: ['Triage', 'Bedside Care', 'Maternal Child Health'],
      status: 'ACTIVE',
      facilityAssignments: [
        {
          assignmentId: 'wfa-zawadi-amgh-01',
          workforceMemberId: 'wfm-nurse-zawadi',
          facilityId: 'fac-amgh',
          role: 'Staff Nurse',
          department: 'Outpatient Triage',
          effectiveFrom: '2025-03-01T00:00:00Z',
          status: 'ACTIVE',
          scope: ['TRIAGE', 'BEDSIDE_CARE', 'MEDICATION_ADMIN'],
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: '2025-03-01T00:00:00Z',
          },
        },
      ],
      qualifications: [],
      credentials: [
        {
          credentialId: 'crd-zawadi-tnmc',
          workforceMemberId: 'wfm-nurse-zawadi',
          credentialType: 'NURSING_BOARD',
          issuingAuthority: 'Tanzania Nursing and Midwives Council',
          credentialReference: 'TNMC-RN-9921',
          effectiveFrom: '2024-06-01',
          expiresAt: '2026-12-31',
          verificationStatus: 'VERIFIED',
          scope: {
            facilityIds: ['fac-amgh'],
            departments: ['Triage', 'Inpatient Ward'],
          },
          provenance: {
            verifiedBy: 'usr-admin-amgh',
            verifiedAt: '2025-03-01T00:00:00Z',
            source: 'TNMC_REGISTRY',
          },
        },
      ],
      availability: 'AVAILABLE',
      contactReference: {
        email: 'zawadi.mwamburi@janohealth.org',
        phone: '+255 785 223 344',
      },
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
        facilityId: 'fac-amgh',
        systemVersion: 'v16.0',
      },
      effectivePeriod: {
        start: '2025-03-01T00:00:00Z',
      },
      version: 1,
      integrityMetadata: {
        hash: sha256(`wfm-nurse-zawadi:ACTIVE:nurse:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.members.set(drAmani.workforceMemberId, drAmani);
    this.members.set(nurseZawadi.workforceMemberId, nurseZawadi);
    this.assignments.set(drAmani.facilityAssignments[0].assignmentId, drAmani.facilityAssignments[0]);
    this.assignments.set(nurseZawadi.facilityAssignments[0].assignmentId, nurseZawadi.facilityAssignments[0]);
  }

  // ==========================================================================
  // WORKFORCE DIRECTORY & LIFECYCLE
  // ==========================================================================

  public async createWorkforceMember(params: {
    displayName: string;
    professionalCategory: ProfessionalCategory;
    specialties: string[];
    practitionerReference?: string;
    userReference?: string;
    contactReference?: { email?: string; phone?: string };
    effectivePeriod: { start: string; end?: string };
    primaryFacilityId: string;
    actorId: string;
    actorRole?: string;
  }): Promise<WorkforceMember> {
    const now = new Date().toISOString();
    const workforceMemberId = `wfm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const member: WorkforceMember = {
      workforceMemberId,
      practitionerReference: params.practitionerReference,
      userReference: params.userReference,
      displayName: params.displayName,
      professionalCategory: params.professionalCategory,
      specialties: params.specialties || [],
      status: 'ACTIVE',
      facilityAssignments: [],
      qualifications: [],
      credentials: [],
      availability: 'AVAILABLE',
      contactReference: params.contactReference,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        facilityId: params.primaryFacilityId,
        systemVersion: 'v16.0',
      },
      effectivePeriod: params.effectivePeriod,
      version: 1,
      integrityMetadata: {
        hash: sha256(`${workforceMemberId}:ACTIVE:${params.professionalCategory}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.members.set(workforceMemberId, member);

    try {
      await idbEngine.put('workforceMembers' as any, member);
    } catch {}

    await auditService.log({
      action: 'WORKFORCE_MEMBER_CREATED',
      actorId: params.actorId,
      facilityId: params.primaryFacilityId,
      details: {
        workforceMemberId,
        displayName: member.displayName,
        category: member.professionalCategory,
      },
    });

    return member;
  }

  public async updateWorkforceMember(
    workforceMemberId: string,
    updates: Partial<Pick<WorkforceMember, 'displayName' | 'specialties' | 'status' | 'availability' | 'contactReference' | 'effectivePeriod'>>,
    actor: { actorId: string; facilityId: string; role?: string }
  ): Promise<WorkforceMember> {
    const existing = this.members.get(workforceMemberId);
    if (!existing) {
      throw new Error(`Workforce member not found: ${workforceMemberId}`);
    }

    if (updates.status && !isValidWorkforceStatusTransition(existing.status, updates.status)) {
      throw new Error(`Illegal status transition from ${existing.status} to ${updates.status}`);
    }

    const now = new Date().toISOString();
    const updated: WorkforceMember = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      integrityMetadata: {
        hash: sha256(`${workforceMemberId}:${updates.status || existing.status}:${existing.version + 1}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.members.set(workforceMemberId, updated);

    try {
      await idbEngine.put('workforceMembers' as any, updated);
    } catch {}

    await auditService.log({
      action: 'WORKFORCE_MEMBER_UPDATED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: {
        workforceMemberId,
        previousStatus: existing.status,
        newStatus: updated.status,
        version: updated.version,
      },
    });

    return updated;
  }

  public getMember(workforceMemberId: string): WorkforceMember | undefined {
    return this.members.get(workforceMemberId);
  }

  public listMembers(filter?: {
    facilityId?: string;
    category?: string;
    status?: WorkforceMemberStatus;
  }): WorkforceMember[] {
    let result = Array.from(this.members.values());

    if (filter?.facilityId) {
      result = result.filter((m) =>
        m.facilityAssignments.some(
          (a) => a.facilityId === filter.facilityId && a.status === 'ACTIVE'
        )
      );
    }

    if (filter?.category) {
      result = result.filter((m) => m.professionalCategory === filter.category);
    }

    if (filter?.status) {
      result = result.filter((m) => m.status === filter.status);
    }

    return result;
  }

  // ==========================================================================
  // FACILITY ASSIGNMENTS
  // ==========================================================================

  public async assignToFacility(params: {
    workforceMemberId: string;
    facilityId: string;
    organizationId?: string;
    role: string;
    department: string;
    effectiveFrom: string;
    effectiveTo?: string;
    scope?: string[];
    actorId: string;
  }): Promise<WorkforceFacilityAssignment> {
    const member = this.members.get(params.workforceMemberId);
    if (!member) {
      throw new Error(`Workforce member not found: ${params.workforceMemberId}`);
    }

    const now = new Date().toISOString();
    const assignmentId = `wfa_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const assignment: WorkforceFacilityAssignment = {
      assignmentId,
      workforceMemberId: params.workforceMemberId,
      facilityId: params.facilityId,
      organizationId: params.organizationId,
      role: params.role,
      department: params.department,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      status: 'ACTIVE',
      scope: params.scope || ['CLINICAL_CARE'],
      provenance: {
        assignedBy: params.actorId,
        assignedAt: now,
      },
    };

    this.assignments.set(assignmentId, assignment);

    // Link to member
    member.facilityAssignments = [
      ...member.facilityAssignments.filter((a) => a.assignmentId !== assignmentId),
      assignment,
    ];
    this.members.set(member.workforceMemberId, member);

    try {
      await idbEngine.put('workforceFacilityAssignments' as any, assignment);
      await idbEngine.put('workforceMembers' as any, member);
    } catch {}

    await auditService.log({
      action: 'FACILITY_ASSIGNMENT_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        assignmentId,
        workforceMemberId: params.workforceMemberId,
        role: params.role,
        department: params.department,
      },
    });

    return assignment;
  }

  public async endFacilityAssignment(
    assignmentId: string,
    reason: string,
    actor: { actorId: string; facilityId: string }
  ): Promise<WorkforceFacilityAssignment> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Facility assignment not found: ${assignmentId}`);
    }

    const now = new Date().toISOString();
    assignment.status = 'ENDED';
    assignment.effectiveTo = now;

    this.assignments.set(assignmentId, assignment);

    // Update in member record
    const member = this.members.get(assignment.workforceMemberId);
    if (member) {
      member.facilityAssignments = member.facilityAssignments.map((a) =>
        a.assignmentId === assignmentId ? assignment : a
      );
      this.members.set(member.workforceMemberId, member);
      try {
        await idbEngine.put('workforceMembers' as any, member);
      } catch {}
    }

    try {
      await idbEngine.put('workforceFacilityAssignments' as any, assignment);
    } catch {}

    await auditService.log({
      action: 'FACILITY_ASSIGNMENT_ENDED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: {
        assignmentId,
        workforceMemberId: assignment.workforceMemberId,
        reason,
      },
    });

    return assignment;
  }

  public getAssignmentsForMember(workforceMemberId: string): WorkforceFacilityAssignment[] {
    return Array.from(this.assignments.values()).filter(
      (a) => a.workforceMemberId === workforceMemberId
    );
  }

  public getAssignmentsForFacility(facilityId: string): WorkforceFacilityAssignment[] {
    return Array.from(this.assignments.values()).filter(
      (a) => a.facilityId === facilityId && a.status === 'ACTIVE'
    );
  }

  // ==========================================================================
  // QUALIFICATIONS
  // ==========================================================================

  public async recordQualification(params: {
    workforceMemberId: string;
    qualificationType: string;
    issuingOrganization: string;
    issueDate: string;
    expiryDate?: string;
    verificationStatus?: QualificationVerificationStatus;
    verificationReference?: string;
    actorId: string;
    facilityId: string;
  }): Promise<Qualification> {
    const member = this.members.get(params.workforceMemberId);
    if (!member) {
      throw new Error(`Workforce member not found: ${params.workforceMemberId}`);
    }

    const qualificationId = `qlf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const qual: Qualification = {
      qualificationId,
      workforceMemberId: params.workforceMemberId,
      qualificationType: params.qualificationType,
      issuingOrganization: params.issuingOrganization,
      issueDate: params.issueDate,
      expiryDate: params.expiryDate,
      verificationStatus: params.verificationStatus || 'PENDING',
      verificationReference: params.verificationReference,
      provenance: {
        verifiedAt: params.verificationStatus === 'VERIFIED' ? new Date().toISOString() : undefined,
        verifiedBy: params.verificationStatus === 'VERIFIED' ? params.actorId : undefined,
      },
    };

    this.qualifications.set(qualificationId, qual);

    member.qualifications = [
      ...member.qualifications.filter((q) => q.qualificationId !== qualificationId),
      qual,
    ];
    this.members.set(member.workforceMemberId, member);

    try {
      await idbEngine.put('qualifications' as any, qual);
      await idbEngine.put('workforceMembers' as any, member);
    } catch {}

    await auditService.log({
      action: 'WORKFORCE_QUALIFICATION_RECORDED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        qualificationId,
        workforceMemberId: params.workforceMemberId,
        type: qual.qualificationType,
      },
    });

    return qual;
  }

  // ==========================================================================
  // AVAILABILITY & LEAVE
  // ==========================================================================

  public async setAvailability(params: {
    workforceMemberId: string;
    status: WorkforceAvailabilityStatus;
    effectiveFrom: string;
    effectiveTo?: string;
    reason?: string;
  }): Promise<WorkforceAvailability> {
    const availabilityId = `av_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const avail: WorkforceAvailability = {
      availabilityId,
      workforceMemberId: params.workforceMemberId,
      status: params.status,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      reason: params.reason,
    };

    this.availabilities.set(availabilityId, avail);

    const member = this.members.get(params.workforceMemberId);
    if (member) {
      member.availability = params.status;
      this.members.set(member.workforceMemberId, member);
    }

    try {
      await idbEngine.put('workforceAvailability' as any, avail);
    } catch {}

    return avail;
  }

  public async requestLeave(params: {
    workforceMemberId: string;
    startAt: string;
    endAt: string;
    category: WorkforceLeave['category'];
    actorId?: string;
  }): Promise<WorkforceLeave> {
    const leaveId = `lv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const leave: WorkforceLeave = {
      leaveId,
      workforceMemberId: params.workforceMemberId,
      startAt: params.startAt,
      endAt: params.endAt,
      category: params.category,
      approvalStatus: 'PENDING',
      provenance: {
        requestedAt: new Date().toISOString(),
        requestedBy: params.actorId,
      },
    };

    this.leaves.set(leaveId, leave);
    try {
      await idbEngine.put('workforceLeave' as any, leave);
    } catch {}

    return leave;
  }

  public async approveLeave(leaveId: string, approvedBy: string): Promise<WorkforceLeave> {
    const leave = this.leaves.get(leaveId);
    if (!leave) throw new Error(`Leave not found: ${leaveId}`);

    leave.approvalStatus = 'APPROVED';
    leave.approvedBy = approvedBy;
    this.leaves.set(leaveId, leave);

    // Also update member status to ON_LEAVE
    const member = this.members.get(leave.workforceMemberId);
    if (member) {
      member.status = 'ON_LEAVE';
      member.availability = 'LEAVE';
      this.members.set(member.workforceMemberId, member);
    }

    try {
      await idbEngine.put('workforceLeave' as any, leave);
    } catch {}

    return leave;
  }

  // ==========================================================================
  // SUPERVISION, TRAINING & COMPETENCY
  // ==========================================================================

  public async assignSupervision(params: {
    supervisorId: string;
    superviseeId: string;
    facilityId: string;
    service: string;
    scope: 'CLINICAL' | 'TRAINEE' | 'OPERATIONAL';
    effectiveFrom: string;
    effectiveTo?: string;
  }): Promise<SupervisionAssignment> {
    const supervisionId = `sup_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const sup: SupervisionAssignment = {
      supervisionId,
      supervisorId: params.supervisorId,
      superviseeId: params.superviseeId,
      facilityId: params.facilityId,
      service: params.service,
      scope: params.scope,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      status: 'ACTIVE',
    };

    this.supervisions.set(supervisionId, sup);
    try {
      await idbEngine.put('supervisionAssignments' as any, sup);
    } catch {}

    return sup;
  }

  public async recordTraining(params: {
    workforceMemberId: string;
    course: string;
    provider: string;
    completedAt: string;
    expiryAt?: string;
    actorId: string;
  }): Promise<TrainingRecord> {
    const trainingId = `trn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const trn: TrainingRecord = {
      trainingId,
      workforceMemberId: params.workforceMemberId,
      course: params.course,
      provider: params.provider,
      completedAt: params.completedAt,
      expiryAt: params.expiryAt,
      status: 'COMPLETED',
      provenance: {
        recordedAt: new Date().toISOString(),
        recordedBy: params.actorId,
      },
    };

    this.trainings.set(trainingId, trn);
    try {
      await idbEngine.put('trainingRecords' as any, trn);
    } catch {}

    return trn;
  }

  public async recordCompetency(params: {
    workforceMemberId: string;
    competencyType: string;
    assessment: string;
    assessedBy: string;
    validUntil?: string;
    status: CompetencyRecord['status'];
  }): Promise<CompetencyRecord> {
    const competencyId = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const cmp: CompetencyRecord = {
      competencyId,
      workforceMemberId: params.workforceMemberId,
      competencyType: params.competencyType,
      assessment: params.assessment,
      assessedBy: params.assessedBy,
      assessedAt: new Date().toISOString(),
      validUntil: params.validUntil,
      status: params.status,
      provenance: {
        recordedAt: new Date().toISOString(),
        recordedBy: params.assessedBy,
      },
    };

    this.competencies.set(competencyId, cmp);
    try {
      await idbEngine.put('competencyRecords' as any, cmp);
    } catch {}

    return cmp;
  }

  public async grantClinicalPrivilege(params: {
    workforceMemberId: string;
    privilege: string;
    scope: string[];
    facilityId: string;
    effectiveFrom: string;
    effectiveTo?: string;
    approvingAuthority: string;
  }): Promise<ClinicalPrivilege> {
    const privilegeId = `prv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const prv: ClinicalPrivilege = {
      privilegeId,
      workforceMemberId: params.workforceMemberId,
      privilege: params.privilege,
      scope: params.scope,
      facilityId: params.facilityId,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      status: 'ACTIVE',
      approvingAuthority: params.approvingAuthority,
      provenance: {
        grantedAt: new Date().toISOString(),
        grantedBy: params.approvingAuthority,
      },
    };

    this.privileges.set(privilegeId, prv);
    return prv;
  }

  public getSupervisionsForSupervisee(superviseeId: string): SupervisionAssignment[] {
    return Array.from(this.supervisions.values()).filter(
      (s) => s.superviseeId === superviseeId && s.status === 'ACTIVE'
    );
  }
}

export const workforceService = WorkforceService.getInstance();
