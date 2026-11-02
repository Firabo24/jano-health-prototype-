/**
 * Jano Health - Clinical Core V19: FHIR R5 Ecosystem Mapper
 * 
 * Maps V19 National Ecosystem entities (Facility Registry, National Reporting,
 * Surveillance) to standard FHIR R5 resources with strict validation and OperationOutcome handling.
 */

import {
  FacilityRegistryReference,
  ReportingDataset,
  SurveillanceReport,
} from '../../domain/v19NationalEcosystemTypes';
import {
  Resource,
  FHIROrganization,
  FHIRLocation,
  FHIRBundle,
  FHIRObservation,
  FHIROperationOutcome,
} from './types';
import { FHIR_VERSION } from './constants';

export class FHIREcosystemMapper {
  /**
   * Maps an MFR Facility Registry Reference to a FHIR R5 Organization
   */
  public static mapMFRToOrganization(mfr: FacilityRegistryReference): FHIROrganization {
    return {
      resourceType: 'Organization',
      id: `org-mfr-${mfr.mfrFacilityId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      meta: {
        versionId: '1',
        lastUpdated: mfr.lastRetrievedAt,
        source: 'http://mfr.moh.gov.et',
        profile: ['http://moh.gov.et/fhir/StructureDefinition/mfr-organization'],
      },
      identifier: [
        {
          use: 'official',
          system: 'http://mfr.moh.gov.et/facilities',
          value: mfr.mfrFacilityId,
        },
      ],
      active: mfr.operationalStatus === 'OPERATIONAL',
      name: mfr.officialName,
      type: [
        {
          coding: [
            {
              system: 'http://mfr.moh.gov.et/facility-types',
              code: mfr.facilityType,
              display: mfr.facilityType,
            },
          ],
        },
      ],
    };
  }

  /**
   * Maps an MFR Facility Registry Reference to a FHIR R5 Location
   */
  public static mapMFRToLocation(mfr: FacilityRegistryReference): FHIRLocation {
    return {
      resourceType: 'Location',
      id: `loc-mfr-${mfr.mfrFacilityId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      meta: {
        versionId: '1',
        lastUpdated: mfr.lastRetrievedAt,
        source: 'http://mfr.moh.gov.et',
      },
      identifier: [
        {
          use: 'official',
          system: 'http://mfr.moh.gov.et/facilities',
          value: mfr.mfrFacilityId,
        },
      ],
      status: mfr.operationalStatus === 'OPERATIONAL' ? 'active' : 'suspended',
      name: mfr.officialName,
      managingOrganization: {
        reference: `Organization/org-mfr-${mfr.mfrFacilityId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        display: mfr.officialName,
      },
      partOf: {
        display: `${mfr.woreda}, ${mfr.zone}, ${mfr.region}`,
      },
    };
  }

  /**
   * Maps a National Reporting Dataset to a FHIR R5 Document / Transaction Bundle
   */
  public static mapDatasetToBundle(dataset: ReportingDataset): FHIRBundle {
    const entries = dataset.dataValues.map((v, index) => {
      const obs: FHIRObservation = {
        resourceType: 'Observation',
        id: `obs-dhis2-${dataset.datasetId}-${index}`,
        status: 'final',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'survey',
                display: 'Survey / Reporting',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://dhis2.moh.gov.et/dataElements',
              code: v.dataElement,
            },
          ],
          text: v.comment || v.dataElement,
        },
        effectiveDateTime: dataset.generatedAt,
        valueQuantity: typeof v.value === 'number' ? { value: v.value } : undefined,
        valueString: typeof v.value === 'string' ? v.value : String(v.value),
      };

      return {
        fullUrl: `urn:uuid:${obs.id}`,
        resource: obs,
      };
    });

    return {
      resourceType: 'Bundle',
      id: `bundle-report-${dataset.datasetId}`,
      meta: {
        versionId: '1',
        lastUpdated: dataset.generatedAt,
        profile: ['http://moh.gov.et/fhir/StructureDefinition/national-reporting-bundle'],
      },
      type: 'collection',
      timestamp: dataset.generatedAt,
      entry: entries,
    };
  }

  /**
   * Validates a FHIR resource structural integrity and returns OperationOutcome if invalid
   */
  public static validateEcosystemResource(resource: any): { valid: boolean; outcome?: FHIROperationOutcome } {
    if (!resource || typeof resource !== 'object') {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Payload is null or not a valid JSON object.',
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
              diagnostics: 'Missing mandatory "resourceType" element.',
            },
          ],
        },
      };
    }

    if (!resource.id) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Missing mandatory "id" element.',
            },
          ],
        },
      };
    }

    return { valid: true };
  }
}
