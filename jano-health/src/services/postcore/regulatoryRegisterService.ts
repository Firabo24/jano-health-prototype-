/**
 * Jano Health — External Requirements & Regulatory Evidence Register Service
 * Post-Core Track 1
 *
 * Governs tracking of external standards, jurisdictional guidelines,
 * applicability assessments, and empirical compliance evidence vs documented gaps.
 *
 * HARD INVARIANTS:
 * - Do not claim compliance without verifiable empirical evidence.
 * - Software quality/validation evidence NEVER constitutes statutory marketing clearance,
 *   government licensing, CE Mark, or official ISO accreditation.
 * - Unsubstantiated requirements must remain UNASSESSED or GAP_IDENTIFIED.
 */

import {
  ExternalRequirement,
  RequirementApplicability,
  ComplianceEvidenceStatus,
} from '../../domain/postCoreTrack1Types';

export class RegulatoryRegisterService {
  private requirements: Map<string, ExternalRequirement> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    const r1: ExternalRequirement = {
      requirementId: 'req-moh-tz-dhis2-v2',
      sourceAuthority: 'Ministry of Health — Community Health Information Office',
      jurisdiction: 'United Republic of Tanzania',
      publicationVersion: 'Guideline Rev 2025.1',
      effectiveDate: '2025-01-01',
      requirementSection: 'Section 4.2 — Offline Clinic Aggregate Transmission',
      requirementText: 'Primary healthcare centers operating offline must cache monthly aggregate disease tallies and sync within 30 days of connectivity resumption.',
      applicability: 'APPLICABLE',
      applicabilityRationale: 'Jano Health operates directly in district and rural health centers in Tanzania.',
      evidenceStatus: 'SUBSTANTIATED_BY_INTERNAL_EVIDENCE',
      internalEvidenceLinks: [
        'TEST_REPORT_DHIS2_MONTHLY_CACHE_v25',
        'EXPORT_AGGREGATE_SCHEMA_COMPLIANCE_VERIFIED',
      ],
      knownGaps: [],
      reviewedBy: 'Regulatory Affairs Specialist',
      lastReviewedAt: '2026-09-01T10:00:00Z',
      disclaimer: 'Internal engineering evidence only. Official MOH programmatic acceptance requires bilateral district authority sign-off.',
    };
    this.requirements.set(r1.requirementId, r1);

    const r2: ExternalRequirement = {
      requirementId: 'req-who-digital-health-interop',
      sourceAuthority: 'World Health Organization (WHO)',
      jurisdiction: 'Global Technical Recommendations',
      publicationVersion: 'SMART Guidelines Architecture 2024',
      effectiveDate: '2024-06-01',
      requirementSection: 'Recommendation 7.1 — Terminology Mapping and Interoperability',
      requirementText: 'Clinical concepts must align with international standard code systems (ICD-11, LOINC, RxNorm) with localized alias extensions.',
      applicability: 'APPLICABLE',
      applicabilityRationale: 'Core EHR diagnostic and medication knowledge models utilize standard coding.',
      evidenceStatus: 'SUBSTANTIATED_BY_INTERNAL_EVIDENCE',
      internalEvidenceLinks: [
        'TERMINOLOGY_SERVICE_ICD11_VALIDATION_SUITE',
        'LOINC_PANEL_LOCALIZATION_TEST_PASS',
      ],
      knownGaps: ['Rare tropical parasite sub-strains require ongoing terminology curator additions.'],
      reviewedBy: 'Regulatory Affairs Specialist',
      lastReviewedAt: '2026-08-20T11:00:00Z',
      disclaimer: 'Technical architectural alignment with published guidelines does not constitute WHO endorsement.',
    };
    this.requirements.set(r2.requirementId, r2);

    const r3: ExternalRequirement = {
      requirementId: 'req-iso-14971-clinical-risk',
      sourceAuthority: 'International Organization for Standardization (ISO)',
      jurisdiction: 'International Medical Device Risk Management Standard',
      publicationVersion: 'ISO 14971:2019 Informative Reference',
      effectiveDate: '2019-12-01',
      requirementSection: 'Clause 7.1 — Risk Mitigation Verification',
      requirementText: 'Clinical safety hazards must demonstrate objective verification of risk control measures before routine clinical deployment.',
      applicability: 'APPLICABLE',
      applicabilityRationale: 'Jano Health Clinical Safety Framework models hazard logs and mitigations based on ISO 14971 principles.',
      evidenceStatus: 'SUBSTANTIATED_BY_INTERNAL_EVIDENCE',
      internalEvidenceLinks: [
        'CLINICAL_SAFETY_CASE_REPORT_V22',
        'HAZARD_LOG_MITIGATION_VERIFICATION_PASS',
      ],
      knownGaps: [],
      reviewedBy: 'Clinical Safety Officer & Quality Lead',
      lastReviewedAt: '2026-09-12T14:00:00Z',
      disclaimer: 'Adherence to informative engineering risk practices does NOT constitute third-party ISO 14971 certification or Notified Body audit.',
    };
    this.requirements.set(r3.requirementId, r3);
  }

  public getAllRequirements(): ExternalRequirement[] {
    return Array.from(this.requirements.values());
  }

  public getRequirement(id: string): ExternalRequirement | undefined {
    return this.requirements.get(id);
  }

  public registerRequirement(
    req: Omit<ExternalRequirement, 'disclaimer'>
  ): ExternalRequirement {
    // HARD INVARIANT: Always attach mandatory statutory disclaimer
    const requirement: ExternalRequirement = {
      ...req,
      disclaimer: 'Internal engineering evidence tracking only. Does not constitute regulatory clearance, certification, or legal representation.',
    };

    // HARD INVARIANT: Cannot claim THIRD_PARTY_AUDITED without verified external links
    if (requirement.evidenceStatus === 'THIRD_PARTY_AUDITED' && requirement.internalEvidenceLinks.length === 0) {
      requirement.evidenceStatus = 'GAP_IDENTIFIED';
      requirement.knownGaps.push('Attempted third-party claim lacked verifiable external audit certificate reference.');
    }

    this.requirements.set(requirement.requirementId, requirement);
    return requirement;
  }

  public updateRequirementAssessment(
    requirementId: string,
    updates: {
      applicability?: RequirementApplicability;
      evidenceStatus?: ComplianceEvidenceStatus;
      evidenceLinks?: string[];
      knownGaps?: string[];
      reviewedBy: string;
    }
  ): { success: boolean; requirement?: ExternalRequirement; error?: string } {
    const req = this.requirements.get(requirementId);
    if (!req) return { success: false, error: 'Requirement not found' };

    if (updates.applicability) req.applicability = updates.applicability;
    if (updates.evidenceStatus) req.evidenceStatus = updates.evidenceStatus;
    if (updates.evidenceLinks) req.internalEvidenceLinks = updates.evidenceLinks;
    if (updates.knownGaps) req.knownGaps = updates.knownGaps;
    req.reviewedBy = updates.reviewedBy;
    req.lastReviewedAt = new Date().toISOString();

    // HARD INVARIANT: Cannot claim third-party audit without verifiable links
    if (req.evidenceStatus === 'THIRD_PARTY_AUDITED' && req.internalEvidenceLinks.length === 0) {
      req.evidenceStatus = 'GAP_IDENTIFIED';
      req.knownGaps.push('Lacks verifiable external auditor report attachment.');
    }

    this.requirements.set(requirementId, req);
    return { success: true, requirement: req };
  }
}

export const regulatoryRegisterService = new RegulatoryRegisterService();
