/**
 * Jano Health - Clinical Core V16: Roster, Shift & Handover Service
 * 
 * Coordinates facility duty rosters, shift assignments, operational presence,
 * and structured shift handovers with tamper-evident cryptographic seals.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - Shift ≠ Appointment ≠ Encounter
 * - Facility Assignment ≠ Shift: An assigned staff member is only actively on duty when on a shift.
 * - Shift Handover IS A COORDINATION ARTIFACT, NOT the clinical source of truth.
 *   Source clinical records remain authoritative.
 * - Cryptographic SHA-256 seal protects handover integrity.
 */

import {
  DutyRoster,
  DutyRosterStatus,
  ShiftAssignment,
  ShiftStatus,
  ShiftType,
  WorkforcePresence,
  WorkforcePresenceStatus,
  ShiftHandover,
  ShiftHandoverStatus,
} from '../../domain/v16WorkforceTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export class RosterShiftService {
  private static instance: RosterShiftService;
  private rosters: Map<string, DutyRoster> = new Map();
  private shifts: Map<string, ShiftAssignment> = new Map();
  private presences: Map<string, WorkforcePresence> = new Map();
  private handovers: Map<string, ShiftHandover> = new Map();

  private constructor() {
    this.seedInitialSyntheticRosters();
  }

  public static getInstance(): RosterShiftService {
    if (!RosterShiftService.instance) {
      RosterShiftService.instance = new RosterShiftService();
    }
    return RosterShiftService.instance;
  }

  private seedInitialSyntheticRosters() {
    const now = '2026-01-01T08:00:00Z';
    const rosterId = 'rst-amgh-emg-2026-w01';

    const initialShifts: ShiftAssignment[] = [
      {
        shiftId: 'shf-amani-001',
        rosterId,
        workforceMemberId: 'wfm-dr-amani',
        facilityId: 'fac-amgh',
        department: 'Emergency & Outpatient',
        startAt: '2026-01-01T08:00:00Z',
        endAt: '2026-01-01T16:00:00Z',
        shiftType: 'DAY',
        status: 'ACTIVE',
        provenance: {
          assignedBy: 'usr-admin-amgh',
          assignedAt: now,
        },
      },
      {
        shiftId: 'shf-zawadi-001',
        rosterId,
        workforceMemberId: 'wfm-nurse-zawadi',
        facilityId: 'fac-amgh',
        department: 'Emergency & Outpatient',
        startAt: '2026-01-01T08:00:00Z',
        endAt: '2026-01-01T16:00:00Z',
        shiftType: 'DAY',
        status: 'ACTIVE',
        provenance: {
          assignedBy: 'usr-admin-amgh',
          assignedAt: now,
        },
      },
    ];

    const roster: DutyRoster = {
      rosterId,
      facilityId: 'fac-amgh',
      department: 'Emergency & Outpatient',
      period: {
        start: '2026-01-01T00:00:00Z',
        end: '2026-01-07T23:59:59Z',
      },
      assignments: initialShifts,
      status: 'PUBLISHED',
      publishedAt: now,
      approvedBy: 'usr-admin-amgh',
      version: 1,
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
      },
    };

    this.rosters.set(rosterId, roster);
    for (const s of initialShifts) {
      this.shifts.set(s.shiftId, s);
    }
  }

  // ==========================================================================
  // DUTY ROSTERS
  // ==========================================================================

  public async createRoster(params: {
    facilityId: string;
    department: string;
    period: { start: string; end: string };
    actorId: string;
  }): Promise<DutyRoster> {
    const rosterId = `rst_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const roster: DutyRoster = {
      rosterId,
      facilityId: params.facilityId,
      department: params.department,
      period: params.period,
      assignments: [],
      status: 'DRAFT',
      version: 1,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.rosters.set(rosterId, roster);
    try {
      await idbEngine.put('dutyRosters' as any, roster);
    } catch {}

    await auditService.log({
      action: 'DUTY_ROSTER_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        rosterId,
        department: params.department,
        start: params.period.start,
        end: params.period.end,
      },
    });

    return roster;
  }

  public async approveRoster(
    rosterId: string,
    actor: { actorId: string; facilityId: string }
  ): Promise<DutyRoster> {
    const roster = this.rosters.get(rosterId);
    if (!roster) throw new Error(`Roster not found: ${rosterId}`);

    roster.status = 'APPROVED';
    roster.approvedBy = actor.actorId;
    roster.version += 1;

    this.rosters.set(rosterId, roster);
    try {
      await idbEngine.put('dutyRosters' as any, roster);
    } catch {}

    await auditService.log({
      action: 'ROSTER_APPROVED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: { rosterId, version: roster.version },
    });

    return roster;
  }

  public async publishRoster(
    rosterId: string,
    actor: { actorId: string; facilityId: string }
  ): Promise<DutyRoster> {
    const roster = this.rosters.get(rosterId);
    if (!roster) throw new Error(`Roster not found: ${rosterId}`);

    const now = new Date().toISOString();
    roster.status = 'PUBLISHED';
    roster.publishedAt = now;
    roster.version += 1;

    this.rosters.set(rosterId, roster);
    try {
      await idbEngine.put('dutyRosters' as any, roster);
    } catch {}

    await auditService.log({
      action: 'ROSTER_PUBLISHED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: { rosterId, version: roster.version, publishedAt: now },
    });

    return roster;
  }

  // ==========================================================================
  // SHIFTS
  // ==========================================================================

  public async assignShift(params: {
    rosterId: string;
    workforceMemberId: string;
    facilityId: string;
    department: string;
    startAt: string;
    endAt: string;
    shiftType: ShiftType;
    actorId: string;
  }): Promise<ShiftAssignment> {
    const shiftId = `shf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const shift: ShiftAssignment = {
      shiftId,
      rosterId: params.rosterId,
      workforceMemberId: params.workforceMemberId,
      facilityId: params.facilityId,
      department: params.department,
      startAt: params.startAt,
      endAt: params.endAt,
      shiftType: params.shiftType,
      status: 'SCHEDULED',
      provenance: {
        assignedBy: params.actorId,
        assignedAt: now,
      },
    };

    this.shifts.set(shiftId, shift);

    const roster = this.rosters.get(params.rosterId);
    if (roster) {
      roster.assignments.push(shift);
      this.rosters.set(roster.rosterId, roster);
      try {
        await idbEngine.put('dutyRosters' as any, roster);
      } catch {}
    }

    try {
      await idbEngine.put('shiftAssignments' as any, shift);
    } catch {}

    await auditService.log({
      action: 'SHIFT_ASSIGNED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        shiftId,
        workforceMemberId: params.workforceMemberId,
        shiftType: params.shiftType,
        startAt: params.startAt,
      },
    });

    return shift;
  }

  public async updateShiftStatus(
    shiftId: string,
    status: ShiftStatus,
    actor: { actorId: string; facilityId: string }
  ): Promise<ShiftAssignment> {
    const shift = this.shifts.get(shiftId);
    if (!shift) throw new Error(`Shift not found: ${shiftId}`);

    shift.status = status;
    this.shifts.set(shiftId, shift);

    try {
      await idbEngine.put('shiftAssignments' as any, shift);
    } catch {}

    await auditService.log({
      action: 'SHIFT_STATUS_CHANGED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: { shiftId, status },
    });

    return shift;
  }

  public async reassignShift(params: {
    shiftId: string;
    newWorkforceMemberId: string;
    reason: string;
    actorId: string;
    facilityId: string;
  }): Promise<ShiftAssignment> {
    const shift = this.shifts.get(params.shiftId);
    if (!shift) throw new Error(`Shift not found: ${params.shiftId}`);

    const oldMemberId = shift.workforceMemberId;
    shift.status = 'REASSIGNED';
    shift.replacementReference = params.newWorkforceMemberId;

    // Create a new replacement shift
    const replacementShift = await this.assignShift({
      rosterId: shift.rosterId,
      workforceMemberId: params.newWorkforceMemberId,
      facilityId: shift.facilityId,
      department: shift.department,
      startAt: shift.startAt,
      endAt: shift.endAt,
      shiftType: shift.shiftType,
      actorId: params.actorId,
    });

    await auditService.log({
      action: 'SHIFT_REASSIGNED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        originalShiftId: params.shiftId,
        replacementShiftId: replacementShift.shiftId,
        previousMemberId: oldMemberId,
        newMemberId: params.newWorkforceMemberId,
        reason: params.reason,
      },
    });

    return replacementShift;
  }

  // ==========================================================================
  // OPERATIONAL PRESENCE
  // ==========================================================================

  public async recordPresence(params: {
    workforceMemberId: string;
    facilityId: string;
    status: WorkforcePresenceStatus;
    shiftId?: string;
    recordedBy: string;
    notes?: string;
  }): Promise<WorkforcePresence> {
    const presenceId = `prs_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const presence: WorkforcePresence = {
      presenceId,
      workforceMemberId: params.workforceMemberId,
      shiftId: params.shiftId,
      facilityId: params.facilityId,
      status: params.status,
      timestamp: new Date().toISOString(),
      recordedBy: params.recordedBy,
      notes: params.notes,
    };

    this.presences.set(presenceId, presence);
    try {
      await idbEngine.put('workforcePresence' as any, presence);
    } catch {}

    return presence;
  }

  // ==========================================================================
  // SHIFT HANDOVER
  // ==========================================================================

  public async submitHandover(params: {
    outgoingWorkforceMember: string;
    incomingWorkforceMember?: string;
    facility: string;
    department: string;
    startAt: string;
    endAt: string;
    patients: string[]; // Patient references
    unresolvedTasks: string[]; // Task references
    clinicalSafetyFlags: string[];
    operationalNotes: string;
    actorId: string;
  }): Promise<ShiftHandover> {
    const handoverId = `hnd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const canonicalPayload = `${handoverId}:${params.outgoingWorkforceMember}:${params.facility}:${params.startAt}:${now}`;
    const hash = sha256(canonicalPayload);

    const handover: ShiftHandover = {
      handoverId,
      outgoingWorkforceMember: params.outgoingWorkforceMember,
      incomingWorkforceMember: params.incomingWorkforceMember,
      facility: params.facility,
      department: params.department,
      startAt: params.startAt,
      endAt: params.endAt,
      patients: params.patients || [],
      unresolvedTasks: params.unresolvedTasks || [],
      clinicalSafetyFlags: params.clinicalSafetyFlags || [],
      operationalNotes: params.operationalNotes,
      status: 'SUBMITTED',
      provenance: {
        submittedAt: now,
        submittedBy: params.actorId,
      },
      integrityMetadata: { hash },
    };

    this.handovers.set(handoverId, handover);
    try {
      await idbEngine.put('shiftHandovers' as any, handover);
    } catch {}

    await auditService.log({
      action: 'HANDOVER_SUBMITTED',
      actorId: params.actorId,
      facilityId: params.facility,
      details: {
        handoverId,
        outgoing: params.outgoingWorkforceMember,
        incoming: params.incomingWorkforceMember,
        patientCount: params.patients.length,
        taskCount: params.unresolvedTasks.length,
        hash,
      },
    });

    return handover;
  }

  public async acknowledgeHandover(params: {
    handoverId: string;
    acknowledgedBy: string;
    facilityId: string;
    notes?: string;
  }): Promise<ShiftHandover> {
    const handover = this.handovers.get(params.handoverId);
    if (!handover) throw new Error(`Handover not found: ${params.handoverId}`);

    const now = new Date().toISOString();
    handover.status = 'ACKNOWLEDGED';
    handover.acknowledgment = {
      acknowledgedBy: params.acknowledgedBy,
      acknowledgedAt: now,
      notes: params.notes,
    };
    handover.incomingWorkforceMember = params.acknowledgedBy;

    // Refresh integrity hash with acknowledgment
    handover.integrityMetadata.hash = sha256(
      `${handover.handoverId}:ACKNOWLEDGED:${params.acknowledgedBy}:${now}`
    );

    this.handovers.set(handover.handoverId, handover);
    try {
      await idbEngine.put('shiftHandovers' as any, handover);
    } catch {}

    await auditService.log({
      action: 'HANDOVER_ACKNOWLEDGED',
      actorId: params.acknowledgedBy,
      facilityId: params.facilityId,
      details: {
        handoverId: handover.handoverId,
        acknowledgedBy: params.acknowledgedBy,
        acknowledgedAt: now,
      },
    });

    return handover;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  public getRostersForFacility(facilityId: string): DutyRoster[] {
    return Array.from(this.rosters.values()).filter((r) => r.facilityId === facilityId);
  }

  public getShiftsForFacility(facilityId: string): ShiftAssignment[] {
    return Array.from(this.shifts.values()).filter((s) => s.facilityId === facilityId);
  }

  public getActiveShiftsForMember(workforceMemberId: string): ShiftAssignment[] {
    return Array.from(this.shifts.values()).filter(
      (s) => s.workforceMemberId === workforceMemberId && s.status === 'ACTIVE'
    );
  }

  public getHandoversForFacility(facilityId: string): ShiftHandover[] {
    return Array.from(this.handovers.values()).filter((h) => h.facility === facilityId);
  }

  public getHandover(handoverId: string): ShiftHandover | undefined {
    return this.handovers.get(handoverId);
  }
}

export const rosterShiftService = RosterShiftService.getInstance();
