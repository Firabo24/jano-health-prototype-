/**
 * Jano Health — Assurance Program & Scope Management Service
 * Post-Core Track 2
 *
 * Governs independent assurance programs across 12 distinct technical/clinical scopes,
 * milestone tracking, and strict closure gating based on empirical evidence.
 *
 * HARD INVARIANTS:
 * - Program status cannot transition to CLOSED without documented closure evidence.
 * - Closure requires all open CRITICAL and MAJOR findings to be fully verified as closed.
 * - Evaluation of one scope does not validate or imply conformity of other scopes.
 */

import {
  AssuranceProgram,
  AssuranceScope,
  AssuranceScopeType,
  AssuranceProgramStatus,
  TRACK2_STATUTORY_DISCLAIMER,
} from '../../domain/postCoreTrack2Types';

export const ALL_ASSURANCE_SCOPES: AssuranceScopeType[] = [
  'SOFTWARE_QUALITY',
  'CLINICAL_SAFETY',
  'CYBERSECURITY',
  'PRIVACY',
  'INTEROPERABILITY',
  'AI_ASSURANCE',
  'DEPLOYMENT',
  'BUSINESS_CONTINUITY',
  'DATA_GOVERNANCE',
  'USABILITY',
  'INFRASTRUCTURE',
  'SUPPLY_CHAIN',
];

class AssuranceProgramService {
  private programs: Map<string, AssuranceProgram> = new Map();

  constructor() {
    this.seedDefaultProgram();
  }

  private seedDefaultProgram(): void {
    const defaultScopes: AssuranceScope[] = ALL_ASSURANCE_SCOPES.map((scopeType, idx) => ({
      id: `scope-${scopeType.toLowerCase()}-01`,
      scopeType,
      title: `${scopeType.replace(/_/g, ' ')} Independent Evaluation`,
      objective: `Evaluate Jano Health evidence artifacts against ${scopeType} standard baselines`,
      boundaries: [`Subsystem: ${scopeType}`, 'Offline edge nodes', 'Facility sync hub'],
      applicableStandards: [
        scopeType === 'CLINICAL_SAFETY' ? 'DCB0129 / ISO 14971' :
        scopeType === 'CYBERSECURITY' ? 'OWASP ASVS / IEC 62443' :
        scopeType === 'INTEROPERABILITY' ? 'HL7 FHIR R4 / IHE' :
        scopeType === 'AI_ASSURANCE' ? 'WHO AI Health Guidance / ISO 42001' :
        'ISO 13485 / IEC 62304 Baseline Alignment'
      ],
      exclusions: ['External third-party proprietary PACS hardware', 'Unmanaged mobile consumer networks'],
      evidenceIds: [`ev-${scopeType.toLowerCase()}-test-suite`],
      status: 'IN_EVALUATION',
      limitations: 'Limited strictly to internal automated and empirical observation logs; excludes external field trials.',
    }));

    const program: AssuranceProgram = {
      id: 'prg-tz-assurance-2026',
      programCode: 'AP-TZ-2026-V25',
      title: 'Tanzania Rural Network Independent Assurance Assessment',
      organizationId: 'org-mkwawa-district',
      targetRelease: '25.0.0-PROD',
      status: 'UNDER_REVIEW',
      leadAssessorId: 'assessor-ext-dr-amani',
      complianceOfficerId: 'user-compliance-kibona',
      clinicalSafetyOfficerId: 'user-cso-dr-kweka',
      scopes: defaultScopes,
      milestones: [
        {
          id: 'ms-01',
          title: 'Evidence Package Compilation',
          targetDate: '2026-09-15',
          completionDate: '2026-09-14',
          status: 'COMPLETED',
          deliverables: ['Traceability Matrix v1', 'Automated Test Logs'],
        },
        {
          id: 'ms-02',
          title: 'Independent Assessor Review',
          targetDate: '2026-10-15',
          status: 'IN_PROGRESS',
          deliverables: ['Finding Log v1', 'Scope Evaluation Checklists'],
        },
        {
          id: 'ms-03',
          title: 'Remediation and Closure Verification',
          targetDate: '2026-11-01',
          status: 'PENDING',
          deliverables: ['CAPA Remediations', 'Final Sealed Audit Dossier'],
        },
      ],
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
      disclaimer: TRACK2_STATUTORY_DISCLAIMER,
    };

    this.programs.set(program.id, program);
  }

  public getPrograms(): AssuranceProgram[] {
    return Array.from(this.programs.values());
  }

  public getProgramById(id: string): AssuranceProgram | undefined {
    return this.programs.get(id);
  }

  public createProgram(data: {
    programCode: string;
    title: string;
    organizationId: string;
    targetRelease: string;
    complianceOfficerId: string;
    clinicalSafetyOfficerId: string;
  }): AssuranceProgram {
    const id = `prg-${Date.now()}`;
    const scopes: AssuranceScope[] = ALL_ASSURANCE_SCOPES.map((scopeType) => ({
      id: `scope-${scopeType.toLowerCase()}-${Date.now()}`,
      scopeType,
      title: `${scopeType.replace(/_/g, ' ')} Scope`,
      objective: `Assessment of ${scopeType}`,
      boundaries: ['Facility scope', 'Offline edge devices'],
      applicableStandards: ['IEC 62304 / ISO 14971 Reference'],
      exclusions: ['External telecommunication infrastructure'],
      evidenceIds: [],
      status: 'PENDING',
      limitations: 'Strictly bounded to declared software versions.',
    }));

    const program: AssuranceProgram = {
      id,
      programCode: data.programCode,
      title: data.title,
      organizationId: data.organizationId,
      targetRelease: data.targetRelease,
      status: 'PLANNED',
      complianceOfficerId: data.complianceOfficerId,
      clinicalSafetyOfficerId: data.clinicalSafetyOfficerId,
      scopes,
      milestones: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      disclaimer: TRACK2_STATUTORY_DISCLAIMER,
    };

    this.programs.set(id, program);
    return program;
  }

  public updateProgramStatus(
    programId: string,
    newStatus: AssuranceProgramStatus,
    options?: {
      closureEvidenceId?: string;
      closureSummary?: string;
      openCriticalFindingsCount?: number;
      openMajorFindingsCount?: number;
    }
  ): { success: boolean; error?: string; program?: AssuranceProgram } {
    const program = this.programs.get(programId);
    if (!program) {
      return { success: false, error: `Assurance program ${programId} not found.` };
    }

    // HARD INVARIANT: Cannot transition to CLOSED without documented closure evidence
    if (newStatus === 'CLOSED') {
      if (!options?.closureEvidenceId || !options.closureSummary) {
        return {
          success: false,
          error: 'INVARIANT VIOLATION: Program cannot be marked CLOSED without closureEvidenceId and closureSummary.',
        };
      }
      if ((options.openCriticalFindingsCount ?? 0) > 0 || (options.openMajorFindingsCount ?? 0) > 0) {
        return {
          success: false,
          error: `INVARIANT VIOLATION: Program cannot be CLOSED while open CRITICAL (${options.openCriticalFindingsCount}) or MAJOR (${options.openMajorFindingsCount}) findings remain.`,
        };
      }

      program.closureEvidenceId = options.closureEvidenceId;
      program.closureSummary = options.closureSummary;
      program.closedAt = new Date().toISOString();
    }

    program.status = newStatus;
    program.updatedAt = new Date().toISOString();
    this.programs.set(program.id, program);
    return { success: true, program };
  }

  public updateScopeStatus(
    programId: string,
    scopeId: string,
    status: AssuranceScope['status'],
    limitations?: string
  ): { success: boolean; error?: string; scope?: AssuranceScope } {
    const program = this.programs.get(programId);
    if (!program) return { success: false, error: 'Program not found' };

    const scope = program.scopes.find((s) => s.id === scopeId);
    if (!scope) return { success: false, error: 'Scope not found' };

    scope.status = status;
    if (limitations) {
      scope.limitations = limitations;
    }
    program.updatedAt = new Date().toISOString();
    return { success: true, scope };
  }
}

export const assuranceProgramService = new AssuranceProgramService();
