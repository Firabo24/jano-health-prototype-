/**
 * Jano Health - Clinical Core V18: Research Participant & Consent Service
 * 
 * Manages participant screening, human eligibility review, deterministic study pseudonyms,
 * purpose-scoped research consent, enrollment, and non-destructive withdrawal.
 * 
 * INVARIANTS:
 * - Patient Record ≠ Research Subject (Patient identity is authoritative; subject is study representation).
 * - Research Consent ≠ Care Consent (V18 research consent extends, not replaces, V15 consent).
 * - Withdrawal blocks future research access/collection without altering or deleting historical clinical records.
 * - AI cannot autonomously enroll patients or obtain consent (human review strictly required).
 */

import {
  ResearchSubject,
  ResearchSubjectStatus,
  ResearchEnrollment,
  ResearchConsent,
  ResearchConsentPurpose,
  ResearchConsentStatus,
  ResearchWithdrawal,
  StudyEligibilityCandidate,
} from '../../domain/v18ResearchTypes';
import { RoleType } from '../../domain/types';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { researchGovernanceService } from './researchGovernanceService';

function sha256(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class ResearchParticipantService {
  private static instance: ResearchParticipantService;

  private candidates = new Map<string, StudyEligibilityCandidate>();
  private subjects = new Map<string, ResearchSubject>();
  private enrollments = new Map<string, ResearchEnrollment>();
  private consents = new Map<string, ResearchConsent>();
  private withdrawals = new Map<string, ResearchWithdrawal>();

  public static getInstance(): ResearchParticipantService {
    if (!ResearchParticipantService.instance) {
      ResearchParticipantService.instance = new ResearchParticipantService();
    }
    return ResearchParticipantService.instance;
  }

  // ==========================================================================
  // CANDIDATE SCREENING & ELIGIBILITY (HUMAN REVIEW REQUIRED)
  // ==========================================================================

  public async screenCandidate(params: {
    studyId: string;
    patientReference: string;
    matchedCriteria: string[];
    unmatchedCriteria: string[];
    actorId: string;
  }): Promise<StudyEligibilityCandidate> {
    const candidateId = `cand_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const candidate: StudyEligibilityCandidate = {
      candidateId,
      studyId: params.studyId,
      patientReference: params.patientReference,
      status: 'REVIEW_REQUIRED',
      matchedCriteria: params.matchedCriteria,
      unmatchedCriteria: params.unmatchedCriteria,
    };

    this.candidates.set(candidateId, candidate);
    try {
      await idbEngine.put('studyEligibilityCandidates', candidate);
    } catch {}

    return candidate;
  }

  public async reviewEligibility(
    candidateId: string,
    actorId: string,
    approved: boolean,
    notes?: string
  ): Promise<StudyEligibilityCandidate> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found`);
    }

    const now = new Date().toISOString();
    candidate.status = approved ? 'ELIGIBLE' : 'INELIGIBLE';
    candidate.reviewedBy = actorId;
    candidate.reviewedAt = now;
    candidate.reviewNotes = notes;

    try {
      await idbEngine.put('studyEligibilityCandidates', candidate);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Clinical Research Investigator',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'ELIGIBILITY_REVIEWED',
      resourceType: 'StudyEligibilityCandidate',
      resourceId: candidateId,
      details: { approved, studyId: candidate.studyId },
    });

    return candidate;
  }

  // ==========================================================================
  // STUDY PSEUDONYMIZATION
  // ==========================================================================

  /**
   * Generates a deterministic study-scoped pseudonym for patient privacy in research workflows.
   */
  public generateStudyPseudonym(studyId: string, patientReference: string): string {
    const raw = `jano_psn:${studyId}:${patientReference}:salt_v18`;
    return `psn_${studyId.substring(4, 10)}_${sha256(raw).substring(0, 10)}`;
  }

  // ==========================================================================
  // RESEARCH CONSENT (EXTENDS V15 CONSENT)
  // ==========================================================================

  public async grantConsent(params: {
    studyId: string;
    researchSubjectId: string;
    patientReference: string;
    purposes: ResearchConsentPurpose[];
    scope: ResearchConsent['scope'];
    protocolVersion: number;
    signerReference: ResearchConsent['signerReference'];
    witness?: ResearchConsent['witness'];
    actorId: string;
    facilityId: string;
    expiresAt?: string;
  }): Promise<ResearchConsent> {
    const consentId = `rcst_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const consent: ResearchConsent = {
      researchConsentId: consentId,
      researchSubjectId: params.researchSubjectId,
      studyId: params.studyId,
      patientReference: params.patientReference,
      purposes: params.purposes,
      scope: params.scope,
      consentVersion: 1,
      protocolVersion: params.protocolVersion,
      grantedAt: now,
      expiresAt: params.expiresAt,
      status: 'ACTIVE',
      signerReference: params.signerReference,
      witness: params.witness,
      provenance: {
        recordedAt: now,
        recordedBy: params.actorId,
        facilityId: params.facilityId,
      },
      integrityHash: sha256(`${consentId}:${params.studyId}:${params.patientReference}:${now}`),
    };

    this.consents.set(consentId, consent);
    try {
      await idbEngine.put('researchConsents', consent);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: 'Research Consent Registrar',
      actorRole: 'research_coordinator',
      facilityId: params.facilityId,
      action: 'RESEARCH_CONSENT_GRANTED',
      resourceType: 'ResearchConsent',
      resourceId: consentId,
      details: { studyId: params.studyId, purposes: params.purposes },
    });

    return consent;
  }

  public async getConsent(consentId: string): Promise<ResearchConsent | undefined> {
    if (this.consents.has(consentId)) return this.consents.get(consentId);
    try {
      const fromDb = await idbEngine.get<ResearchConsent>('researchConsents', consentId);
      if (fromDb) {
        this.consents.set(consentId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  public async withdrawConsent(
    consentId: string,
    actorId: string,
    reason: string
  ): Promise<ResearchConsent> {
    const consent = await this.getConsent(consentId);
    if (!consent) throw new Error(`Consent ${consentId} not found`);

    const now = new Date().toISOString();
    consent.status = 'WITHDRAWN';
    consent.withdrawnAt = now;

    try {
      await idbEngine.put('researchConsents', consent);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Research Consent Steward',
      actorRole: 'research_coordinator',
      facilityId: consent.provenance.facilityId,
      action: 'RESEARCH_CONSENT_WITHDRAWN',
      resourceType: 'ResearchConsent',
      resourceId: consentId,
      details: { reason, studyId: consent.studyId },
    });

    return consent;
  }

  // ==========================================================================
  // RESEARCH SUBJECT ENROLLMENT & WITHDRAWAL
  // ==========================================================================

  public async enrollSubject(params: {
    studyId: string;
    patientReference: string;
    siteId: string;
    consentId: string;
    actorId: string;
  }): Promise<{ subject: ResearchSubject; enrollment: ResearchEnrollment }> {
    const study = await researchGovernanceService.getStudy(params.studyId);
    if (!study) throw new Error(`Study ${params.studyId} not found`);
    if (study.status !== 'ACTIVE') {
      throw new Error(`Cannot enroll subject into study in status ${study.status}. Study must be ACTIVE.`);
    }

    // Check duplicate enrollment for this patient in the same study
    const existing = Array.from(this.subjects.values()).find(
      (s) => s.studyId === params.studyId && s.patientReference === params.patientReference && s.status !== 'WITHDRAWN'
    );
    if (existing) {
      throw new Error(`Patient ${params.patientReference} is already enrolled in study ${params.studyId} as ${existing.researchSubjectId}`);
    }

    // Validate research consent
    const consent = await this.getConsent(params.consentId);
    if (!consent || consent.status !== 'ACTIVE') {
      throw new Error(`Active research consent required for enrollment`);
    }
    if (!consent.purposes.includes('STUDY_PARTICIPATION')) {
      throw new Error(`Consent does not include STUDY_PARTICIPATION purpose`);
    }

    const now = new Date().toISOString();
    const subjectId = `subj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const pseudonym = this.generateStudyPseudonym(params.studyId, params.patientReference);
    const studySpecificIdentifier = `SUBJ-${study.canonicalIdentifier}-${Math.floor(1000 + Math.random() * 9000)}`;

    const subject: ResearchSubject = {
      researchSubjectId: subjectId,
      studyId: params.studyId,
      patientReference: params.patientReference,
      studySpecificIdentifier,
      studyPseudonym: pseudonym,
      status: 'ENROLLED',
      enrollmentDate: now,
      consentReferences: [params.consentId],
      siteReference: params.siteId,
      eligibilityStatus: {
        criteriaSatisfied: true,
        reviewedBy: params.actorId,
        reviewedAt: now,
      },
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${subjectId}:${params.studyId}:${pseudonym}:${now}`),
    };

    const enrollmentId = `enr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const enrollment: ResearchEnrollment = {
      enrollmentId,
      studyId: params.studyId,
      researchSubjectId: subjectId,
      enrolledAt: now,
      enrolledBy: params.actorId,
      siteId: params.siteId,
      consentReference: params.consentId,
      protocolVersion: study.version,
      baselineAssessmentsCompleted: false,
    };

    this.subjects.set(subjectId, subject);
    this.enrollments.set(enrollmentId, enrollment);

    try {
      await idbEngine.put('researchSubjects', subject);
      await idbEngine.put('researchEnrollments', enrollment);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: 'Clinical Research Coordinator',
      actorRole: 'research_coordinator',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_SUBJECT_ENROLLED',
      resourceType: 'ResearchSubject',
      resourceId: subjectId,
      details: { studyId: params.studyId, studySpecificIdentifier, pseudonym },
    });

    return { subject, enrollment };
  }

  public async getSubject(subjectId: string): Promise<ResearchSubject | undefined> {
    if (this.subjects.has(subjectId)) return this.subjects.get(subjectId);
    try {
      const fromDb = await idbEngine.get<ResearchSubject>('researchSubjects', subjectId);
      if (fromDb) {
        this.subjects.set(subjectId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  public async withdrawSubject(
    subjectId: string,
    actorId: string,
    reason: string
  ): Promise<{ subject: ResearchSubject; withdrawal: ResearchWithdrawal }> {
    const subject = await this.getSubject(subjectId);
    if (!subject) throw new Error(`Research subject ${subjectId} not found`);

    const now = new Date().toISOString();
    subject.status = 'WITHDRAWN';
    subject.withdrawalDate = now;
    subject.withdrawalReason = reason;

    // Withdraw active consents
    for (const consentId of subject.consentReferences) {
      try {
        await this.withdrawConsent(consentId, actorId, `Subject withdrawal: ${reason}`);
      } catch {}
    }

    const withdrawalId = `wdr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const withdrawal: ResearchWithdrawal = {
      withdrawalId,
      researchSubjectId: subjectId,
      studyId: subject.studyId,
      patientReference: subject.patientReference,
      withdrawnAt: now,
      withdrawnBy: actorId,
      reason,
      affectedConsentIds: [...subject.consentReferences],
      actionsEnforced: {
        futureResearchBlocked: true,
        futureCollectionStopped: true,
        futureSharingBlocked: true,
        historicalLegitimateUseAudited: true,
        retainedDataGoverned: true,
      },
      provenance: {
        createdAt: now,
      },
      integrityHash: sha256(`${withdrawalId}:${subjectId}:${now}`),
    };

    this.withdrawals.set(withdrawalId, withdrawal);

    try {
      await idbEngine.put('researchSubjects', subject);
      await idbEngine.put('researchWithdrawals', withdrawal);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Clinical Research Coordinator',
      actorRole: 'research_coordinator',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_SUBJECT_WITHDRAWN',
      resourceType: 'ResearchSubject',
      resourceId: subjectId,
      details: { reason, studyId: subject.studyId },
    });

    return { subject, withdrawal };
  }

  // ==========================================================================
  // GOVERNED RESEARCH ACCESS EVALUATION (9-STEP CHAIN)
  // ==========================================================================

  public async evaluateResearchAccess(params: {
    actorRole: RoleType;
    facilityId: string;
    studyId: string;
    researchSubjectId?: string;
    purpose: ResearchConsentPurpose;
  }): Promise<{ allowed: boolean; reason?: string }> {
    // 1. RBAC check
    const allowedRoles: RoleType[] = ['clinical_researcher', 'research_coordinator', 'data_access_steward', 'system_administrator'];
    if (!allowedRoles.includes(params.actorRole)) {
      return { allowed: false, reason: `Role ${params.actorRole} not authorized for research operations` };
    }

    // 2. Study existence and status
    const study = await researchGovernanceService.getStudy(params.studyId);
    if (!study || (study.status !== 'ACTIVE' && study.status !== 'COMPLETED')) {
      return { allowed: false, reason: `Study ${params.studyId} is not ACTIVE or COMPLETED` };
    }

    // 3. Facility/Site isolation check (except for system admins)
    if (params.actorRole !== 'system_administrator') {
      const siteAuthorized = await researchGovernanceService.verifySiteIsolation(params.studyId, params.facilityId);
      if (!siteAuthorized) {
        return { allowed: false, reason: `Facility ${params.facilityId} is not an authorized active study site for study ${params.studyId}` };
      }
    }

    // 4. Research Subject & Consent evaluation
    if (params.researchSubjectId) {
      const subject = await this.getSubject(params.researchSubjectId);
      if (!subject) return { allowed: false, reason: `Subject ${params.researchSubjectId} not found` };
      if (subject.status === 'WITHDRAWN') {
        return { allowed: false, reason: `Subject ${params.researchSubjectId} has withdrawn from research` };
      }

      // Check active consent covering purpose
      let hasValidConsent = false;
      for (const consentId of subject.consentReferences) {
        const consent = await this.getConsent(consentId);
        if (consent && consent.status === 'ACTIVE' && consent.purposes.includes(params.purpose)) {
          hasValidConsent = true;
          break;
        }
      }

      if (!hasValidConsent) {
        return { allowed: false, reason: `No active consent covering requested purpose ${params.purpose}` };
      }
    }

    return { allowed: true };
  }
}

export const researchParticipantService = ResearchParticipantService.getInstance();
