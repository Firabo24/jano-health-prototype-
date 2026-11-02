/**
 * Jano Health - Clinical Core V18: FHIR R5 Research Mapper
 * 
 * Maps internal research studies, subjects, evidence variables, evidence records,
 * and citations to HL7 FHIR R5 resources (ResearchStudy, ResearchSubject, EvidenceVariable, Evidence, Citation).
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - FHIR Resource ≠ Internal Domain Model: Decoupled translation boundaries.
 * - Conformance validation returns FHIROperationOutcome on malformed resources.
 * - Does NOT claim full FHIR conformance without verifiable structural validation.
 */

import {
  FHIRResearchStudy,
  FHIRResearchSubject,
  FHIREvidenceVariable,
  FHIREvidence,
  FHIRCitation,
  FHIROperationOutcome,
} from './types';
import {
  ResearchStudy,
  ResearchSubject,
  EvidenceVariable,
  EvidenceRecord,
  CitationRecord,
} from '../../domain/v18ResearchTypes';

export class FHIRResearchMapper {
  /**
   * Maps a ResearchStudy to a FHIR R5 ResearchStudy resource.
   */
  public static studyToFHIR(study: ResearchStudy): FHIRResearchStudy {
    let status: FHIRResearchStudy['status'] = 'draft';
    if (study.status === 'ACTIVE') status = 'active';
    else if (study.status === 'COMPLETED') status = 'completed';
    else if (study.status === 'APPROVED') status = 'approved';
    else if (study.status === 'UNDER_REVIEW') status = 'in-review';
    else if (study.status === 'TERMINATED') status = 'administratively-completed';
    else if (study.status === 'SUSPENDED') status = 'temporarily-closed-to-accrual';

    return {
      resourceType: 'ResearchStudy',
      id: study.researchStudyId,
      identifier: [
        {
          system: 'https://jano.health/identifiers/research-studies',
          value: study.canonicalIdentifier,
        },
      ],
      title: study.title,
      description: study.description,
      status,
      principalInvestigator: {
        reference: `Practitioner/${study.principalInvestigator}`,
        display: study.principalInvestigator,
      },
      site: study.studySites.map((siteId) => ({
        reference: `Location/${siteId}`,
      })),
      meta: {
        versionId: study.version.toString(),
        lastUpdated: study.provenance.updatedAt,
      },
    };
  }

  /**
   * Maps a ResearchSubject to a FHIR R5 ResearchSubject resource.
   * INVARIANT: ResearchSubject references Patient context rather than replacing it.
   */
  public static subjectToFHIR(subject: ResearchSubject): FHIRResearchSubject {
    let status: FHIRResearchSubject['status'] = 'candidate';
    if (subject.status === 'ENROLLED' || subject.status === 'ACTIVE') status = 'active';
    else if (subject.status === 'WITHDRAWN') status = 'withdrawn';
    else if (subject.status === 'INELIGIBLE') status = 'ineligible';
    else if (subject.status === 'COMPLETED' || subject.status === 'RETIRED') status = 'retired';

    return {
      resourceType: 'ResearchSubject',
      id: subject.researchSubjectId,
      identifier: [
        {
          system: 'https://jano.health/identifiers/research-subjects',
          value: subject.studySpecificIdentifier,
        },
        {
          system: 'https://jano.health/identifiers/research-pseudonyms',
          value: subject.studyPseudonym,
        },
      ],
      status,
      study: {
        reference: `ResearchStudy/${subject.studyId}`,
      },
      subject: {
        reference: `Patient/${subject.patientReference}`,
      },
      consent: subject.consentReferences.length > 0
        ? { reference: `Consent/${subject.consentReferences[0]}` }
        : undefined,
    };
  }

  /**
   * Maps an EvidenceVariable to a FHIR R5 EvidenceVariable resource.
   */
  public static variableToFHIR(variable: EvidenceVariable): FHIREvidenceVariable {
    return {
      resourceType: 'EvidenceVariable',
      id: variable.variableId,
      name: variable.name,
      title: variable.description,
      status: 'active',
      actual: true,
      characteristic: [
        {
          description: `PICO Role: ${variable.picoRole} | Handling: ${variable.handling}`,
        },
      ],
      meta: {
        versionId: variable.version.toString(),
      },
    };
  }

  /**
   * Maps an EvidenceRecord to a FHIR R5 Evidence resource.
   */
  public static evidenceToFHIR(evidence: EvidenceRecord): FHIREvidence {
    let status: FHIREvidence['status'] = 'draft';
    if (evidence.status === 'ACTIVE') status = 'active';
    else if (evidence.status === 'RETRACTED' || evidence.status === 'RETIRED') status = 'retired';

    return {
      resourceType: 'Evidence',
      id: evidence.evidenceId,
      title: evidence.title,
      status,
      variableDefinition: [
        {
          description: 'Population Variable',
          variableRole: { text: 'population' },
          observed: { reference: `EvidenceVariable/${evidence.variables.populationVariableId}` },
        },
        {
          description: 'Outcome Variable',
          variableRole: { text: 'outcome' },
          observed: { reference: `EvidenceVariable/${evidence.variables.outcomeVariableId}` },
        },
      ],
      statistic: [
        {
          description: `Sample Size: ${evidence.statistics.sampleSize}`,
          sampleSize: {
            numberOfParticipants: evidence.statistics.sampleSize,
          },
        },
      ],
      certainty: [
        {
          type: { text: evidence.certainty.framework },
          rating: { text: evidence.certainty.rating },
        },
      ],
    };
  }

  /**
   * Maps a CitationRecord to a FHIR R5 Citation resource.
   */
  public static citationToFHIR(citation: CitationRecord): FHIRCitation {
    return {
      resourceType: 'Citation',
      id: citation.citationId,
      title: citation.title,
      status: citation.verificationStatus === 'VERIFIED' ? 'active' : 'draft',
      citedArtifact: {
        title: [{ text: citation.title }],
        publicationForm: {
          publishedDate: citation.year.toString(),
        },
      },
    };
  }

  /**
   * Validates structural requirements for FHIR research resources.
   */
  public static validateResource(resource: any): { valid: boolean; outcome?: FHIROperationOutcome } {
    if (!resource || typeof resource !== 'object') {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Resource is null, undefined, or not an object',
            },
          ],
        },
      };
    }

    if (!resource.resourceType) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Missing mandatory field resourceType',
            },
          ],
        },
      };
    }

    if (resource.resourceType === 'ResearchStudy' && (!resource.title || !resource.status)) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'ResearchStudy requires title and status',
            },
          ],
        },
      };
    }

    if (resource.resourceType === 'ResearchSubject' && (!resource.study || !resource.subject)) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'ResearchSubject requires study and subject references',
            },
          ],
        },
      };
    }

    return { valid: true };
  }
}
