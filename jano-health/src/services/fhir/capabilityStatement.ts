/**
 * Jano Health - FHIR R5 CapabilityStatement Generator
 * Provides an authoritative conformance metadata resource for GET /fhir/metadata.
 * 
 * STRICT STANDARDS RULE:
 * Accurately declares supported FHIR R5 (5.0.0) resources and interactions without phantom entries.
 */

import { FHIR_VERSION, JANO_SYSTEM_BASE } from './constants';
import { FHIRCapabilityStatement } from './types';

export function getCapabilityStatement(): FHIRCapabilityStatement {
  return {
    resourceType: 'CapabilityStatement',
    id: 'jano-fhir-r5-capabilities',
    url: `${JANO_SYSTEM_BASE}/metadata`,
    version: '1.0.0',
    name: 'JanoHealthFHIRCapabilityStatement',
    title: 'Jano Health Clinical Core V11 FHIR R5 Interoperability Endpoint',
    status: 'active',
    experimental: false,
    date: '2026-09-18T00:00:00Z',
    publisher: 'Jano Health Consortium',
    kind: 'instance',
    software: {
      name: 'Jano Health Clinical Core',
      version: '11.0.0',
      releaseDate: '2026-09-18',
    },
    fhirVersion: FHIR_VERSION,
    format: ['application/fhir+json', 'application/json'],
    rest: [
      {
        mode: 'server',
        documentation:
          'Jano Health offline-first RESTful FHIR R5 API supporting patient care continuity, diagnostic exchange, and national health information network interoperability.',
        security: {
          cors: true,
          description:
            'Protected by Bearer Tokens, mutual TLS, and role-based access control with tenant facility isolation.',
        },
        interaction: [
          { code: 'transaction' },
          { code: 'batch' },
          { code: 'search-system' },
        ],
        resource: [
          {
            type: 'Patient',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-patient`,
            interaction: [
              { code: 'read', documentation: 'Read patient by ID' },
              { code: 'create', documentation: 'Create patient aggregate' },
              { code: 'search-type', documentation: 'Search by identifier or name' },
            ],
            searchParam: [
              { name: '_id', type: 'token', documentation: 'Resource logical ID' },
              { name: 'identifier', type: 'token', documentation: 'MRN or National Identifier' },
              { name: 'name', type: 'string', documentation: 'Given or family name' },
              { name: 'birthdate', type: 'date', documentation: 'Patient date of birth' },
              { name: 'gender', type: 'token', documentation: 'Administrative gender' },
            ],
          },
          {
            type: 'Encounter',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-encounter`,
            interaction: [
              { code: 'read', documentation: 'Read clinical encounter' },
              { code: 'search-type', documentation: 'Search encounters by patient or date' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Subject patient reference' },
              { name: 'date', type: 'date', documentation: 'Encounter started period' },
              { name: 'status', type: 'token', documentation: 'Encounter status' },
            ],
          },
          {
            type: 'Observation',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-observation`,
            interaction: [
              { code: 'read', documentation: 'Read observation by ID' },
              { code: 'create', documentation: 'Record vital signs or lab observations' },
              { code: 'search-type', documentation: 'Search observations by patient, category, or code' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Subject patient reference' },
              { name: 'category', type: 'token', documentation: 'Observation category (vital-signs, laboratory)' },
              { name: 'code', type: 'token', documentation: 'LOINC or local observation code' },
            ],
          },
          {
            type: 'Condition',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-condition`,
            interaction: [
              { code: 'read', documentation: 'Read condition' },
              { code: 'create', documentation: 'Record clinical problem or diagnosis' },
              { code: 'search-type', documentation: 'Search conditions by patient or clinical status' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Subject patient reference' },
              { name: 'code', type: 'token', documentation: 'ICD-10 clinical condition code' },
              { name: 'clinical-status', type: 'token', documentation: 'Active, resolved, or inactive' },
            ],
          },
          {
            type: 'AllergyIntolerance',
            interaction: [
              { code: 'read', documentation: 'Read allergy record' },
              { code: 'create', documentation: 'Record allergy intolerance' },
              { code: 'search-type', documentation: 'Search allergies by patient' },
            ],
            searchParam: [{ name: 'patient', type: 'reference', documentation: 'Patient reference' }],
          },
          {
            type: 'ServiceRequest',
            interaction: [
              { code: 'read', documentation: 'Read referral or diagnostic request' },
              { code: 'search-type', documentation: 'Search service requests by patient or category' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Patient reference' },
              { name: 'category', type: 'token', documentation: 'Category of service request' },
            ],
          },
          {
            type: 'DiagnosticReport',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-diagnostic-report`,
            interaction: [
              { code: 'read', documentation: 'Read diagnostic report' },
              { code: 'search-type', documentation: 'Search diagnostic reports' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Patient reference' },
              { name: 'category', type: 'token', documentation: 'Service section code (LAB, RAD)' },
            ],
          },
          {
            type: 'ImagingStudy',
            interaction: [
              { code: 'read', documentation: 'Read imaging study metadata' },
              { code: 'search-type', documentation: 'Search imaging studies by patient or modality' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Patient reference' },
              { name: 'modality', type: 'token', documentation: 'DICOM imaging modality code' },
            ],
          },
          {
            type: 'MedicationRequest',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-medication-request`,
            interaction: [
              { code: 'read', documentation: 'Read medication order' },
              { code: 'search-type', documentation: 'Search medication requests' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Patient reference' },
              { name: 'status', type: 'token', documentation: 'Medication request status' },
            ],
          },
          {
            type: 'MedicationDispense',
            profile: `${JANO_SYSTEM_BASE}/StructureDefinition/jano-medication-dispense`,
            interaction: [
              { code: 'read', documentation: 'Read pharmacy dispense record' },
              { code: 'search-type', documentation: 'Search medication dispenses' },
            ],
            searchParam: [{ name: 'patient', type: 'reference', documentation: 'Patient reference' }],
          },
          {
            type: 'Task',
            interaction: [
              { code: 'read', documentation: 'Read referral workflow task' },
              { code: 'search-type', documentation: 'Search tasks by status or owner' },
            ],
            searchParam: [
              { name: 'patient', type: 'reference', documentation: 'Patient reference' },
              { name: 'status', type: 'token', documentation: 'Task state' },
            ],
          },
          {
            type: 'DocumentReference',
            interaction: [
              { code: 'read', documentation: 'Read clinical note document reference' },
            ],
          },
          {
            type: 'Provenance',
            interaction: [
              { code: 'read', documentation: 'Read mutation provenance record' },
            ],
          },
        ],
      },
    ],
  };
}
