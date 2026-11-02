/**
 * Jano Health — Assessor Findings & Non-Conformity Management Service
 * Post-Core Track 2
 *
 * Governs external assessor findings, root-cause analyses, CAPA remediations,
 * reassessments, and strict clinical safety sign-off requirements.
 *
 * HARD INVARIANTS:
 * - Findings affecting clinical safety CANNOT be closed without explicit sign-off by a Clinical Safety Officer.
 * - Software engineer who remediated a finding cannot verify closure; independent assessor must re-verify.
 * - Open CRITICAL or MAJOR findings block program closure.
 */

import {
  AssessorFinding,
  FindingSeverity,
  FindingStatus,
  AssuranceScopeType,
} from '../../domain/postCoreTrack2Types';

class AssessorFindingsService {
  private findings: Map<string, AssessorFinding> = new Map();

  constructor() {
    this.seedDefaultFindings();
  }

  private seedDefaultFindings(): void {
    const finding1: AssessorFinding = {
      id: 'fnd-2026-001',
      programId: 'prg-tz-assurance-2026',
      scopeType: 'CLINICAL_SAFETY',
      assessorId: 'assessor-ext-dr-amani',
      findingCode: 'F-CLIN-01',
      severity: 'MAJOR',
      title: 'Pediatric Weight Dosage Warning Boundary Documentation',
      description: 'Dosing advisory engine must document explicit clinical bounds when weight is <3.0kg in neonatal emergency triage.',
      standardClause: 'DCB0129 Section 4.2 / ISO 14971 Clause 7.1',
      affectsClinicalSafety: true,
      status: 'VERIFIED_CLOSED',
      raisedAt: '2026-09-10T09:00:00Z',
      rootCause: 'Lack of explicit neonatal extreme weight boundary guideline in advisory reference card.',
      remediationPlan: 'Add strict fail-closed boundary prompting clinician to verify manual neonatal reference protocol.',
      remediationArtifactId: 'ev-clinical_safety-test-suite',
      remediatedBy: 'eng-clinical-lead',
      remediatedAt: '2026-09-18T14:00:00Z',
      reassessedByAssessorId: 'assessor-ext-dr-amani',
      reassessmentNotes: 'Verified automated test assertions confirm advisory fail-closed boundary below 3.0kg.',
      clinicalSafetyOfficerSignoff: {
        officerId: 'user-cso-dr-kweka',
        officerName: 'Dr. Neema Kweka (CSO)',
        signedAt: '2026-09-19T10:00:00Z',
        approved: true,
      },
      closedAt: '2026-09-19T11:00:00Z',
    };

    const finding2: AssessorFinding = {
      id: 'fnd-2026-002',
      programId: 'prg-tz-assurance-2026',
      scopeType: 'CYBERSECURITY',
      assessorId: 'assessor-ext-eng-bakari',
      findingCode: 'F-CYBER-01',
      severity: 'MINOR',
      title: 'Session Token Expiry on Edge Node Local Cache',
      description: 'Local session cache on rugged edge tablets should enforce explicit 12-hour timeout in unattended mode.',
      standardClause: 'OWASP ASVS 3.3.1',
      affectsClinicalSafety: false,
      status: 'VERIFIED_CLOSED',
      raisedAt: '2026-09-12T11:00:00Z',
      rootCause: 'Default session timeout was set to 24 hours.',
      remediationPlan: 'Reduced unattended timeout to 12 hours with automatic local credential lock.',
      remediatedBy: 'eng-sec-lead',
      remediatedAt: '2026-09-20T16:00:00Z',
      reassessedByAssessorId: 'assessor-ext-eng-bakari',
      reassessmentNotes: 'Verified timeout unit tests pass.',
      closedAt: '2026-09-21T09:00:00Z',
    };

    this.findings.set(finding1.id, finding1);
    this.findings.set(finding2.id, finding2);
  }

  public getFindings(programId?: string): AssessorFinding[] {
    const list = Array.from(this.findings.values());
    if (programId) {
      return list.filter((f) => f.programId === programId);
    }
    return list;
  }

  public getFindingById(id: string): AssessorFinding | undefined {
    return this.findings.get(id);
  }

  public raiseFinding(data: {
    programId: string;
    scopeType: AssuranceScopeType;
    assessorId: string;
    findingCode: string;
    severity: FindingSeverity;
    title: string;
    description: string;
    standardClause?: string;
    affectsClinicalSafety: boolean;
  }): AssessorFinding {
    const id = `fnd-${Date.now()}`;
    const finding: AssessorFinding = {
      id,
      programId: data.programId,
      scopeType: data.scopeType,
      assessorId: data.assessorId,
      findingCode: data.findingCode,
      severity: data.severity,
      title: data.title,
      description: data.description,
      standardClause: data.standardClause,
      affectsClinicalSafety: data.affectsClinicalSafety,
      status: 'RAISED',
      raisedAt: new Date().toISOString(),
    };

    this.findings.set(id, finding);
    return finding;
  }

  public submitRemediation(
    findingId: string,
    data: {
      rootCause: string;
      remediationPlan: string;
      remediationArtifactId: string;
      remediatedBy: string;
    }
  ): { success: boolean; error?: string; finding?: AssessorFinding } {
    const finding = this.findings.get(findingId);
    if (!finding) return { success: false, error: 'Finding not found' };

    finding.rootCause = data.rootCause;
    finding.remediationPlan = data.remediationPlan;
    finding.remediationArtifactId = data.remediationArtifactId;
    finding.remediatedBy = data.remediatedBy;
    finding.remediatedAt = new Date().toISOString();
    finding.status = 'REMEDIATION_EXECUTED';

    return { success: true, finding };
  }

  public verifyAndCloseFinding(
    findingId: string,
    data: {
      assessorId: string;
      reassessmentNotes: string;
      csoSignoff?: {
        officerId: string;
        officerName: string;
        approved: boolean;
      };
    }
  ): { success: boolean; error?: string; finding?: AssessorFinding } {
    const finding = this.findings.get(findingId);
    if (!finding) return { success: false, error: 'Finding not found' };

    // HARD INVARIANT: Remediator cannot verify their own finding
    if (finding.remediatedBy && finding.remediatedBy === data.assessorId) {
      return {
        success: false,
        error: 'INVARIANT VIOLATION: Separation of duties! The developer who remediated the finding cannot verify its closure.',
      };
    }

    // HARD INVARIANT: Clinical safety findings require Clinical Safety Officer sign-off
    if (finding.affectsClinicalSafety) {
      if (!data.csoSignoff || !data.csoSignoff.approved) {
        return {
          success: false,
          error: 'INVARIANT VIOLATION: Clinical safety finding CANNOT be closed without formal sign-off from a Clinical Safety Officer.',
        };
      }
      finding.clinicalSafetyOfficerSignoff = {
        officerId: data.csoSignoff.officerId,
        officerName: data.csoSignoff.officerName,
        signedAt: new Date().toISOString(),
        approved: true,
      };
    }

    finding.reassessedByAssessorId = data.assessorId;
    finding.reassessmentNotes = data.reassessmentNotes;
    finding.status = 'VERIFIED_CLOSED';
    finding.closedAt = new Date().toISOString();

    return { success: true, finding };
  }

  public getOpenBlockingFindingsCount(programId: string): { critical: number; major: number } {
    const findings = this.getFindings(programId);
    let critical = 0;
    let major = 0;

    findings.forEach((f) => {
      if (f.status !== 'VERIFIED_CLOSED') {
        if (f.severity === 'CRITICAL') critical++;
        if (f.severity === 'MAJOR') major++;
      }
    });

    return { critical, major };
  }
}

export const assessorFindingsService = new AssessorFindingsService();
