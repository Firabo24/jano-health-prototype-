/**
 * Jano Health — External Assessor & Independence Service
 * Post-Core Track 2
 *
 * Governs external independent assessors, accredited organizations,
 * conflict of interest declarations, and strict independence enforcement.
 *
 * HARD INVARIANTS:
 * - Assessors cannot evaluate components, subsystems, or code they authored.
 * - Assessor with declared conflict of interest cannot perform review without approved mitigation.
 * - Independence status must be explicitly classified and verified.
 */

import {
  ExternalAssessor,
  AssessorIndependenceStatus,
  EngagementState,
  AssuranceScopeType,
} from '../../domain/postCoreTrack2Types';

class ExternalAssessorService {
  private assessors: Map<string, ExternalAssessor> = new Map();

  constructor() {
    this.seedDefaultAssessors();
  }

  private seedDefaultAssessors(): void {
    const leadAssessor: ExternalAssessor = {
      id: 'assessor-ext-dr-amani',
      fullName: 'Dr. Amani Mwita',
      organizationName: 'AfriHealth Quality Assurance Advisory',
      accreditationBody: 'Independent Health IT Auditor Board',
      credentials: ['Lead Auditor ISO 13485', 'Certified Clinical Informaticist (CHIA)', 'IEC 62304 Assessor'],
      specialties: ['SOFTWARE_QUALITY', 'CLINICAL_SAFETY', 'AI_ASSURANCE', 'INTEROPERABILITY'],
      independenceStatus: 'INDEPENDENT_THIRD_PARTY',
      conflictOfInterest: {
        declared: false,
        details: 'Zero financial, commercial, or authoring relationship with Jano Health core team.',
        approvedByComplianceOfficer: true,
      },
      engagementState: 'ACTIVE',
      contractStartDate: '2026-08-01',
      contractEndDate: '2026-12-31',
      authoredComponentIds: [], // Authored zero components
    };

    const secAssessor: ExternalAssessor = {
      id: 'assessor-ext-eng-bakari',
      fullName: 'Eng. Sarah Bakari',
      organizationName: 'Kilimanjaro Cyber Systems Verification',
      accreditationBody: 'CREST Certified Tester / CISSP',
      credentials: ['CISSP', 'CREST Lead Assessor', 'ISO 27001 Auditor'],
      specialties: ['CYBERSECURITY', 'INFRASTRUCTURE', 'SUPPLY_CHAIN', 'PRIVACY'],
      independenceStatus: 'INDEPENDENT_THIRD_PARTY',
      conflictOfInterest: {
        declared: false,
        approvedByComplianceOfficer: true,
      },
      engagementState: 'ACTIVE',
      contractStartDate: '2026-08-15',
      contractEndDate: '2026-12-31',
      authoredComponentIds: [],
    };

    this.assessors.set(leadAssessor.id, leadAssessor);
    this.assessors.set(secAssessor.id, secAssessor);
  }

  public getAssessors(): ExternalAssessor[] {
    return Array.from(this.assessors.values());
  }

  public getAssessorById(id: string): ExternalAssessor | undefined {
    return this.assessors.get(id);
  }

  public registerAssessor(data: {
    fullName: string;
    organizationName: string;
    accreditationBody?: string;
    credentials: string[];
    specialties: AssuranceScopeType[];
    independenceStatus: AssessorIndependenceStatus;
    declaredConflict: boolean;
    conflictDetails?: string;
    authoredComponentIds?: string[];
  }): ExternalAssessor {
    const id = `assessor-${Date.now()}`;
    const assessor: ExternalAssessor = {
      id,
      fullName: data.fullName,
      organizationName: data.organizationName,
      accreditationBody: data.accreditationBody,
      credentials: data.credentials,
      specialties: data.specialties,
      independenceStatus: data.independenceStatus,
      conflictOfInterest: {
        declared: data.declaredConflict,
        details: data.conflictDetails,
        approvedByComplianceOfficer: !data.declaredConflict, // Requires explicit sign-off if declared
      },
      engagementState: 'PLANNED',
      contractStartDate: new Date().toISOString().split('T')[0],
      authoredComponentIds: data.authoredComponentIds || [],
    };

    this.assessors.set(id, assessor);
    return assessor;
  }

  public checkEvaluationEligibility(
    assessorId: string,
    targetComponentId: string,
    targetScope: AssuranceScopeType
  ): { eligible: boolean; rejectionReason?: string } {
    const assessor = this.assessors.get(assessorId);
    if (!assessor) {
      return { eligible: false, rejectionReason: 'Assessor not registered.' };
    }

    // HARD INVARIANT: Assessor cannot evaluate components they authored
    if (assessor.authoredComponentIds.includes(targetComponentId)) {
      return {
        eligible: false,
        rejectionReason: `INVARIANT VIOLATION: Conflict of interest! Assessor ${assessor.fullName} authored component ${targetComponentId} and cannot evaluate their own work.`,
      };
    }

    // Conflict of interest check
    if (assessor.conflictOfInterest.declared && !assessor.conflictOfInterest.approvedByComplianceOfficer) {
      return {
        eligible: false,
        rejectionReason: 'Assessor has unapproved conflict of interest; review cannot proceed without compliance sign-off.',
      };
    }

    // Independence verification
    if (assessor.independenceStatus === 'NON_INDEPENDENT_PROHIBITED') {
      return {
        eligible: false,
        rejectionReason: 'Assessor is classified as NON_INDEPENDENT_PROHIBITED for third-party assurance.',
      };
    }

    // Specialty alignment
    if (!assessor.specialties.includes(targetScope)) {
      return {
        eligible: false,
        rejectionReason: `Assessor is not certified or specialized in scope ${targetScope}.`,
      };
    }

    return { eligible: true };
  }

  public updateEngagementState(assessorId: string, newState: EngagementState): boolean {
    const assessor = this.assessors.get(assessorId);
    if (!assessor) return false;
    assessor.engagementState = newState;
    return true;
  }
}

export const externalAssessorService = new ExternalAssessorService();
