/**
 * Jano Health - Evidence Program Service (V24)
 * Manages multi-site evidence programs, site groups, and independent site enrollments.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  EvidenceProgram,
  PilotSiteGroup,
  SiteEnrollment,
  ProgramMilestone,
  ProgramLifecycleStatus,
} from '../../domain/v24MultiSiteEvidenceTypes';

function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256-v24-prog-${hex}-${Date.now().toString(16)}`;
}

export class EvidenceProgramService {
  private memoryPrograms: Map<string, EvidenceProgram> = new Map();
  private memoryGroups: Map<string, PilotSiteGroup> = new Map();
  private memoryEnrollments: Map<string, SiteEnrollment> = new Map();
  private memoryMilestones: Map<string, ProgramMilestone> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline(): void {
    const defaultProg: EvidenceProgram = {
      programId: 'prog-multisite-east-africa',
      name: 'East Africa Multi-Site Primary Care Digital Health Evidence Program',
      protocolNumber: 'JANO-EVD-2026-001',
      protocolVersion: '1.0.0',
      sponsor: 'Ministry of Health & Jano Clinical Research Consortium',
      status: 'ACTIVE',
      leadCoordinatorId: 'usr-coord-dr-elimu',
      safetyOfficerId: 'usr-safety-dr-faraji',
      participatingSiteIds: ['site-amani-01', 'site-kilima-02', 'site-ziwa-03'],
      governanceModel: 'INDEPENDENT_FEDERATED',
      startDate: '2026-01-15T00:00:00.000Z',
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
      integrityHash: simpleHash('prog-multisite-east-africa-baseline'),
    };
    this.memoryPrograms.set(defaultProg.programId, defaultProg);

    const group1: PilotSiteGroup = {
      groupId: 'grp-rural-primary',
      programId: defaultProg.programId,
      groupName: 'Rural Dispensary & Health Center Cohort',
      description: 'Primary facilities operating with intermittent grid power and solar backup',
      cohortType: 'RURAL_PRIMARY',
      siteIds: ['site-amani-01', 'site-kilima-02'],
      createdAt: '2026-01-15T00:00:00.000Z',
    };
    this.memoryGroups.set(group1.groupId, group1);

    const enr1: SiteEnrollment = {
      enrollmentId: 'enr-site-amani-01',
      programId: defaultProg.programId,
      siteId: 'site-amani-01',
      facilityName: 'Amani Medical Center',
      phase: 'CONTROLLED_LIVE',
      groupId: group1.groupId,
      enrolledAt: '2026-01-15T00:00:00.000Z',
      isSuspended: false,
      isLocallyGoverned: true,
      governanceLeadId: 'usr-dr-amani',
      enabledModules: ['PATIENTS', 'ENCOUNTERS', 'LAB', 'PHARMACY', 'EMERGENCY'],
    };
    const enr2: SiteEnrollment = {
      enrollmentId: 'enr-site-kilima-02',
      programId: defaultProg.programId,
      siteId: 'site-kilima-02',
      facilityName: 'Kilima Health Post',
      phase: 'LIMITED_GO_LIVE',
      groupId: group1.groupId,
      enrolledAt: '2026-02-01T00:00:00.000Z',
      isSuspended: false,
      isLocallyGoverned: true,
      governanceLeadId: 'usr-nurse-bahati',
      enabledModules: ['PATIENTS', 'ENCOUNTERS', 'PHARMACY'],
    };
    const enr3: SiteEnrollment = {
      enrollmentId: 'enr-site-ziwa-03',
      programId: defaultProg.programId,
      siteId: 'site-ziwa-03',
      facilityName: 'Ziwa District Hospital',
      phase: 'TRAINING',
      enrolledAt: '2026-02-15T00:00:00.000Z',
      isSuspended: false,
      isLocallyGoverned: true,
      governanceLeadId: 'usr-dr-ziwa-lead',
      enabledModules: ['PATIENTS', 'ENCOUNTERS', 'LAB', 'RADIOLOGY', 'PHARMACY', 'EMERGENCY'],
    };

    this.memoryEnrollments.set(enr1.enrollmentId, enr1);
    this.memoryEnrollments.set(enr2.enrollmentId, enr2);
    this.memoryEnrollments.set(enr3.enrollmentId, enr3);
  }

  public async getProgram(programId: string): Promise<EvidenceProgram | null> {
    const fromIdb = await idbEngine.get<EvidenceProgram>('evidencePrograms', programId);
    if (fromIdb) return fromIdb;
    return this.memoryPrograms.get(programId) || null;
  }

  public async listPrograms(): Promise<EvidenceProgram[]> {
    const list = Array.from(this.memoryPrograms.values());
    return list;
  }

  public async createProgram(
    input: Omit<EvidenceProgram, 'programId' | 'createdAt' | 'updatedAt' | 'integrityHash'>
  ): Promise<EvidenceProgram> {
    const programId = `prog-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const hash = simpleHash(`${programId}:${input.protocolNumber}:${input.protocolVersion}`);

    const program: EvidenceProgram = {
      ...input,
      programId,
      createdAt: now,
      updatedAt: now,
      integrityHash: hash,
    };

    this.memoryPrograms.set(programId, program);
    await idbEngine.put('evidencePrograms', program);
    return program;
  }

  public async updateProgramStatus(
    programId: string,
    status: ProgramLifecycleStatus,
    justification: string
  ): Promise<EvidenceProgram> {
    const prog = await this.getProgram(programId);
    if (!prog) throw new Error(`Program not found: ${programId}`);

    prog.status = status;
    prog.updatedAt = new Date().toISOString();
    prog.integrityHash = simpleHash(`${prog.programId}:${status}:${justification}`);

    this.memoryPrograms.set(programId, prog);
    await idbEngine.put('evidencePrograms', prog);
    return prog;
  }

  public async enrollSite(
    programId: string,
    siteId: string,
    facilityName: string,
    governanceLeadId: string,
    enabledModules: string[],
    groupId?: string
  ): Promise<SiteEnrollment> {
    const prog = await this.getProgram(programId);
    if (!prog) throw new Error(`Program not found: ${programId}`);

    const enrollmentId = `enr-${siteId}-${Date.now().toString(36)}`;
    const enrollment: SiteEnrollment = {
      enrollmentId,
      programId,
      siteId,
      facilityName,
      phase: 'PREPARATION',
      groupId,
      enrolledAt: new Date().toISOString(),
      isSuspended: false,
      isLocallyGoverned: true,
      governanceLeadId,
      enabledModules,
    };

    if (!prog.participatingSiteIds.includes(siteId)) {
      prog.participatingSiteIds.push(siteId);
      prog.updatedAt = new Date().toISOString();
      await idbEngine.put('evidencePrograms', prog);
    }

    this.memoryEnrollments.set(enrollmentId, enrollment);
    await idbEngine.put('siteEnrollments', enrollment);
    return enrollment;
  }

  /**
   * INVARIANT: Independent site governance.
   * Suspending a site updates ONLY that site's enrollment, and does NOT suspend
   * other enrolled sites or the overall program.
   */
  public async suspendSite(
    siteId: string,
    reason: string
  ): Promise<SiteEnrollment> {
    const enrollment = Array.from(this.memoryEnrollments.values()).find((e) => e.siteId === siteId);
    if (!enrollment) throw new Error(`Enrollment not found for site: ${siteId}`);

    enrollment.isSuspended = true;
    enrollment.suspensionReason = reason;
    enrollment.suspendedAt = new Date().toISOString();

    this.memoryEnrollments.set(enrollment.enrollmentId, enrollment);
    await idbEngine.put('siteEnrollments', enrollment);
    return enrollment;
  }

  public async resumeSite(siteId: string): Promise<SiteEnrollment> {
    const enrollment = Array.from(this.memoryEnrollments.values()).find((e) => e.siteId === siteId);
    if (!enrollment) throw new Error(`Enrollment not found for site: ${siteId}`);

    enrollment.isSuspended = false;
    delete enrollment.suspensionReason;
    delete enrollment.suspendedAt;

    this.memoryEnrollments.set(enrollment.enrollmentId, enrollment);
    await idbEngine.put('siteEnrollments', enrollment);
    return enrollment;
  }

  public async listSiteEnrollments(programId: string): Promise<SiteEnrollment[]> {
    return Array.from(this.memoryEnrollments.values()).filter((e) => e.programId === programId);
  }

  public async listSiteGroups(programId: string): Promise<PilotSiteGroup[]> {
    return Array.from(this.memoryGroups.values()).filter((g) => g.programId === programId);
  }
}

export const evidenceProgramService = new EvidenceProgramService();
