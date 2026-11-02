/**
 * Jano Health - Clinical Core V16: Care Team Service
 * 
 * Coordinates multi-disciplinary patient care teams and operational service teams.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - Care Team ≠ User Role
 * - Membership must be explicitly assigned; presence in facility does not imply care responsibility.
 * - Source patient clinical record remains authoritative; care teams coordinate delivery.
 */

import {
  CareTeam,
  CareTeamMembership,
  CareTeamStatus,
} from '../../domain/v16WorkforceTypes';
import { workforceService } from './workforceService';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class CareTeamService {
  private static instance: CareTeamService;
  private careTeams: Map<string, CareTeam> = new Map();
  private memberships: Map<string, CareTeamMembership> = new Map();

  private constructor() {
    this.seedInitialSyntheticCareTeams();
  }

  public static getInstance(): CareTeamService {
    if (!CareTeamService.instance) {
      CareTeamService.instance = new CareTeamService();
    }
    return CareTeamService.instance;
  }

  private seedInitialSyntheticCareTeams() {
    const now = '2026-01-01T08:00:00Z';

    // 1. Operational Service Team: AMGH Emergency Response Team
    const emergencyTeamId = 'ct-amgh-emergency-alpha';
    const amghEmergencyTeam: CareTeam = {
      careTeamId: emergencyTeamId,
      facilityId: 'fac-amgh',
      service: 'Emergency Medicine',
      purpose: 'Acute resuscitation and critical emergency management',
      leader: 'wfm-dr-amani',
      status: 'ACTIVE',
      effectivePeriod: {
        start: '2025-01-01T00:00:00Z',
      },
      members: [
        {
          membershipId: 'ctm-amani-emg',
          careTeamId: emergencyTeamId,
          workforceMemberId: 'wfm-dr-amani',
          role: 'attending_clinician',
          responsibility: 'Emergency team leader and attending physician',
          startAt: '2025-01-01T00:00:00Z',
          status: 'ACTIVE',
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: now,
          },
        },
        {
          membershipId: 'ctm-zawadi-emg',
          careTeamId: emergencyTeamId,
          workforceMemberId: 'wfm-nurse-zawadi',
          role: 'primary_nurse',
          responsibility: 'Triage nursing and emergency bedside resuscitation',
          startAt: '2025-01-01T00:00:00Z',
          status: 'ACTIVE',
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: now,
          },
        },
      ],
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
        facilityId: 'fac-amgh',
      },
    };

    // 2. Patient-Specific Care Team for Demo Patient pat-001-mkwawa
    const patientTeamId = 'ct-pat-mkwawa-primary';
    const patientCareTeam: CareTeam = {
      careTeamId: patientTeamId,
      patientReference: 'pat-001-mkwawa',
      facilityId: 'fac-amgh',
      service: 'Inpatient Medicine',
      purpose: 'Longitudinal inpatient care and treatment coordination',
      leader: 'wfm-dr-amani',
      status: 'ACTIVE',
      effectivePeriod: {
        start: '2026-01-01T08:00:00Z',
      },
      members: [
        {
          membershipId: 'ctm-pat-amani',
          careTeamId: patientTeamId,
          workforceMemberId: 'wfm-dr-amani',
          role: 'attending_clinician',
          responsibility: 'Primary attending medical officer',
          startAt: '2026-01-01T08:00:00Z',
          status: 'ACTIVE',
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: now,
          },
        },
        {
          membershipId: 'ctm-pat-zawadi',
          careTeamId: patientTeamId,
          workforceMemberId: 'wfm-nurse-zawadi',
          role: 'primary_nurse',
          responsibility: 'Ward bedside medication administration',
          startAt: '2026-01-01T08:00:00Z',
          status: 'ACTIVE',
          provenance: {
            assignedBy: 'usr-admin-amgh',
            assignedAt: now,
          },
        },
      ],
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
        facilityId: 'fac-amgh',
      },
    };

    this.careTeams.set(emergencyTeamId, amghEmergencyTeam);
    this.careTeams.set(patientTeamId, patientCareTeam);

    for (const m of amghEmergencyTeam.members) {
      this.memberships.set(m.membershipId, m);
    }
    for (const m of patientCareTeam.members) {
      this.memberships.set(m.membershipId, m);
    }
  }

  public async createCareTeam(params: {
    patientReference?: string;
    facilityId: string;
    service: string;
    purpose: string;
    leader?: string;
    effectivePeriod: { start: string; end?: string };
    actorId: string;
  }): Promise<CareTeam> {
    const careTeamId = `ct_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const team: CareTeam = {
      careTeamId,
      patientReference: params.patientReference,
      facilityId: params.facilityId,
      service: params.service,
      purpose: params.purpose,
      leader: params.leader,
      members: [],
      effectivePeriod: params.effectivePeriod,
      status: 'ACTIVE',
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        facilityId: params.facilityId,
      },
    };

    this.careTeams.set(careTeamId, team);
    try {
      await idbEngine.put('careTeams' as any, team);
    } catch {}

    await auditService.log({
      action: 'CARE_TEAM_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      patientId: params.patientReference,
      details: {
        careTeamId,
        service: team.service,
        patientReference: team.patientReference,
      },
    });

    return team;
  }

  public async addMember(params: {
    careTeamId: string;
    workforceMemberId: string;
    role: CareTeamMembership['role'];
    responsibility: string;
    startAt?: string;
    actorId: string;
    facilityId: string;
  }): Promise<CareTeamMembership> {
    const team = this.careTeams.get(params.careTeamId);
    if (!team) throw new Error(`Care team not found: ${params.careTeamId}`);

    const member = workforceService.getMember(params.workforceMemberId);
    if (!member) throw new Error(`Workforce member not found: ${params.workforceMemberId}`);

    const membershipId = `ctm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const membership: CareTeamMembership = {
      membershipId,
      careTeamId: params.careTeamId,
      workforceMemberId: params.workforceMemberId,
      role: params.role,
      responsibility: params.responsibility,
      startAt: params.startAt || now,
      status: 'ACTIVE',
      provenance: {
        assignedBy: params.actorId,
        assignedAt: now,
      },
    };

    this.memberships.set(membershipId, membership);

    team.members = [
      ...team.members.filter((m) => m.membershipId !== membershipId),
      membership,
    ];
    this.careTeams.set(team.careTeamId, team);

    try {
      await idbEngine.put('careTeamMemberships' as any, membership);
      await idbEngine.put('careTeams' as any, team);
    } catch {}

    await auditService.log({
      action: 'CARE_TEAM_MEMBER_ASSIGNED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      patientId: team.patientReference,
      details: {
        careTeamId: team.careTeamId,
        membershipId,
        workforceMemberId: params.workforceMemberId,
        role: params.role,
      },
    });

    return membership;
  }

  public async relieveMember(
    membershipId: string,
    actor: { actorId: string; facilityId: string }
  ): Promise<CareTeamMembership> {
    const membership = this.memberships.get(membershipId);
    if (!membership) throw new Error(`Care team membership not found: ${membershipId}`);

    const now = new Date().toISOString();
    membership.status = 'RELIEVED';
    membership.endAt = now;

    this.memberships.set(membershipId, membership);

    const team = this.careTeams.get(membership.careTeamId);
    if (team) {
      team.members = team.members.map((m) =>
        m.membershipId === membershipId ? membership : m
      );
      this.careTeams.set(team.careTeamId, team);
      try {
        await idbEngine.put('careTeams' as any, team);
      } catch {}
    }

    try {
      await idbEngine.put('careTeamMemberships' as any, membership);
    } catch {}

    await auditService.log({
      action: 'CARE_TEAM_MEMBER_RELIEVED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: {
        careTeamId: membership.careTeamId,
        membershipId,
        workforceMemberId: membership.workforceMemberId,
      },
    });

    return membership;
  }

  public async setTeamStatus(
    careTeamId: string,
    status: CareTeamStatus,
    actor: { actorId: string; facilityId: string }
  ): Promise<CareTeam> {
    const team = this.careTeams.get(careTeamId);
    if (!team) throw new Error(`Care team not found: ${careTeamId}`);

    team.status = status;
    this.careTeams.set(careTeamId, team);

    try {
      await idbEngine.put('careTeams' as any, team);
    } catch {}

    await auditService.log({
      action: 'CARE_TEAM_STATUS_CHANGED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      details: {
        careTeamId,
        status,
      },
    });

    return team;
  }

  public getCareTeamsForPatient(patientId: string): CareTeam[] {
    return Array.from(this.careTeams.values()).filter(
      (t) => t.patientReference === patientId && t.status === 'ACTIVE'
    );
  }

  public getCareTeamsForFacility(facilityId: string): CareTeam[] {
    return Array.from(this.careTeams.values()).filter(
      (t) => t.facilityId === facilityId && t.status === 'ACTIVE'
    );
  }

  public getTeamsForMember(workforceMemberId: string): CareTeam[] {
    return Array.from(this.careTeams.values()).filter((t) =>
      t.members.some((m) => m.workforceMemberId === workforceMemberId && m.status === 'ACTIVE')
    );
  }

  public getAttendingClinician(patientId: string): CareTeamMembership | undefined {
    const teams = this.getCareTeamsForPatient(patientId);
    for (const team of teams) {
      const attending = team.members.find(
        (m) => m.role === 'attending_clinician' && m.status === 'ACTIVE'
      );
      if (attending) return attending;
    }
    return undefined;
  }

  public getCareTeam(careTeamId: string): CareTeam | undefined {
    return this.careTeams.get(careTeamId);
  }
}

export const careTeamService = CareTeamService.getInstance();
