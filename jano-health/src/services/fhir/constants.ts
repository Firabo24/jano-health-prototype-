/**
 * Jano Health - FHIR R5 Interoperability Constants
 * Canonical specifications and uniform URI registries for Clinical Core V11.
 */

export const FHIR_VERSION = '5.0.0';
export const FHIR_RELEASE = 'R5';

// MIME Types
export const FHIR_MIME_TYPE = 'application/fhir+json';
export const FHIR_MIME_TYPE_JSON = 'application/json';

// Canonical Jano URIs
export const JANO_SYSTEM_BASE = 'http://jano.health/fhir';
export const JANO_IDENTIFIER_SYSTEM = `${JANO_SYSTEM_BASE}/identifier`;
export const JANO_PATIENT_MRN_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/mrn`;
export const JANO_PATIENT_NATIONAL_ID_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/national-id`;
export const JANO_FACILITY_CODE_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/facility`;
export const JANO_ENCOUNTER_ID_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/encounter`;
export const JANO_ORDER_NUMBER_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/order-number`;
export const JANO_PRESCRIPTION_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/prescription`;
export const JANO_DISPENSE_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/dispense`;
export const JANO_ACCESSION_SYSTEM = `${JANO_IDENTIFIER_SYSTEM}/accession`;

// Canonical Extension URIs
export const JANO_EXT_FACILITY_ID = `${JANO_SYSTEM_BASE}/StructureDefinition/facility-id`;
export const JANO_EXT_MRN_METADATA = `${JANO_SYSTEM_BASE}/StructureDefinition/mrn-metadata`;
export const JANO_EXT_SYNC_METADATA = `${JANO_SYSTEM_BASE}/StructureDefinition/sync-metadata`;
export const JANO_EXT_OFFLINE_PROVENANCE = `${JANO_SYSTEM_BASE}/StructureDefinition/offline-provenance`;
export const JANO_EXT_TRIAGE_SYSTEM = `${JANO_SYSTEM_BASE}/StructureDefinition/triage-system`;
export const JANO_EXT_AI_DECISION_SUPPORT = `${JANO_SYSTEM_BASE}/StructureDefinition/ai-decision-support`;
export const JANO_EXT_PRESCRIPTION_SEAL = `${JANO_SYSTEM_BASE}/StructureDefinition/prescription-seal`;
export const JANO_EXT_INVENTORY_BATCH = `${JANO_SYSTEM_BASE}/StructureDefinition/inventory-batch`;

// Canonical Profile URIs
export const JANO_PROFILE_PATIENT = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-patient`;
export const JANO_PROFILE_ENCOUNTER = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-encounter`;
export const JANO_PROFILE_OBSERVATION = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-observation`;
export const JANO_PROFILE_CONDITION = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-condition`;
export const JANO_PROFILE_MEDICATION_REQUEST = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-medication-request`;
export const JANO_PROFILE_MEDICATION_DISPENSE = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-medication-dispense`;
export const JANO_PROFILE_DIAGNOSTIC_REPORT = `${JANO_SYSTEM_BASE}/StructureDefinition/jano-diagnostic-report`;

// Standard Terminology Systems
export const TERMINOLOGY_SYSTEM_ICD10 = 'http://hl7.org/fhir/sid/icd-10';
export const TERMINOLOGY_SYSTEM_LOINC = 'http://loinc.org';
export const TERMINOLOGY_SYSTEM_SNOMED = 'http://snomed.info/sct';
export const TERMINOLOGY_SYSTEM_RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
export const TERMINOLOGY_SYSTEM_UCUM = 'http://unitsofmeasure.org';
export const TERMINOLOGY_SYSTEM_WHO_EML = 'http://who.int/eml';
export const TERMINOLOGY_SYSTEM_DICOM = 'http://dicom.nema.org/resources/ontology/DCM';

// FHIR R5 Standard ValueSet / CodeSystem URIs
export const FHIR_CS_OBSERVATION_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
export const FHIR_CS_DIAGNOSTIC_SERVICE_SECTION = 'http://terminology.hl7.org/CodeSystem/v2-0074';
export const FHIR_CS_CONDITION_CLINICAL = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
export const FHIR_CS_CONDITION_VER_STATUS = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';
export const FHIR_CS_ALLERGY_CLINICAL = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';
export const FHIR_CS_ALLERGY_VERIFICATION = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';
export const FHIR_CS_TASK_CODE = 'http://hl7.org/fhir/CodeSystem/task-code';
export const FHIR_CS_ENCOUNTER_CLASS = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

// Rate Limiting & Safety Defaults
export const FHIR_MAX_PAGE_SIZE = 50;
export const FHIR_DEFAULT_PAGE_SIZE = 20;
export const FHIR_MAX_TRANSACTION_ENTRIES = 100;
