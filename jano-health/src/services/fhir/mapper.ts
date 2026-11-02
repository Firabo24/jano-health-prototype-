/**
 * Jano Health - FHIR R5 Bi-Directional Resource Mapper
 * Comprehensive, standards-compliant transformation between Jano domain aggregates and FHIR R5 resources.
 * 
 * ARCHITECTURAL RULES:
 * 1. Maintain complete data fidelity without loss of provenance or integrity hashes.
 * 2. Distinguish local identifiers (MRN, Accession, Order Number) from FHIR resource IDs.
 * 3. Never synthesize fake resources like "EmergencyCase" - map to standard FHIR Encounter + Observation + Task.
 * 4. Never embed raw heavy binary image blobs into FHIR JSON - provide metadata and references.
 */

import {
  FHIR_VERSION,
  JANO_SYSTEM_BASE,
  JANO_PATIENT_MRN_SYSTEM,
  JANO_FACILITY_CODE_SYSTEM,
  JANO_ENCOUNTER_ID_SYSTEM,
  JANO_ORDER_NUMBER_SYSTEM,
  JANO_PRESCRIPTION_SYSTEM,
  JANO_DISPENSE_SYSTEM,
  JANO_ACCESSION_SYSTEM,
  JANO_EXT_FACILITY_ID,
  JANO_EXT_SYNC_METADATA,
  JANO_EXT_OFFLINE_PROVENANCE,
  JANO_EXT_TRIAGE_SYSTEM,
  JANO_EXT_PRESCRIPTION_SEAL,
  JANO_EXT_INVENTORY_BATCH,
  FHIR_CS_OBSERVATION_CATEGORY,
  FHIR_CS_DIAGNOSTIC_SERVICE_SECTION,
  FHIR_CS_ENCOUNTER_CLASS,
  TERMINOLOGY_SYSTEM_ICD10,
  TERMINOLOGY_SYSTEM_LOINC,
  TERMINOLOGY_SYSTEM_UCUM,
} from './constants';
import {
  FHIRPatient,
  FHIREncounter,
  FHIRObservation,
  FHIRCondition,
  FHIRAllergyIntolerance,
  FHIRServiceRequest,
  FHIRSpecimen,
  FHIRDiagnosticReport,
  FHIRImagingStudy,
  FHIRMedicationRequest,
  FHIRMedicationDispense,
  FHIRTask,
  FHIRDocumentReference,
  FHIRProvenance,
  FHIRAuditEvent,
  FHIRPractitioner,
  FHIROrganization,
  CodeableConcept,
  Coding,
} from './types';
import {
  Patient,
  Encounter,
  VitalSign,
  Problem,
  Diagnosis,
  Allergy,
  LaboratoryOrder,
  LaboratorySpecimen,
  LaboratoryReport,
  RadiologyOrder,
  RadiologyStudy,
  RadiologyReport,
  ClinicalNote,
  Facility,
  User,
  ProvenanceRecord,
} from '../../domain/types';
import { MedicationOrder, Prescription, DispenseRecord } from '../../domain/medicationTypes';
import { Referral } from '../../domain/referralTypes';
import { EmergencyCase, EmergencyTriage } from '../../domain/emergencyTypes';
import { fhirTerminologyService, VITAL_SIGNS_LOINC_MAP } from './terminology';
import { fhirIdentityMap } from './identityMap';

export class FHIRMapper {
  private static instance: FHIRMapper;

  private constructor() {}

  public static getInstance(): FHIRMapper {
    if (!FHIRMapper.instance) {
      FHIRMapper.instance = new FHIRMapper();
    }
    return FHIRMapper.instance;
  }

  // =========================================================================
  // 1. PATIENT MAPPINGS
  // =========================================================================

  public patientToFHIR(patient: Patient): FHIRPatient {
    const fhirId = `pat-${patient.id.replace(/^pat_/, '')}`;
    fhirIdentityMap.registerMapping({
      janoId: patient.id,
      fhirId,
      resourceType: 'Patient',
      sourceSystem: JANO_SYSTEM_BASE,
      sourceIdentifier: patient.mrn,
      confidence: 1.0,
      status: 'MATCH_CONFIRMED',
    });

    const identifiers = [
      {
        use: 'official' as const,
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'MR', display: 'Medical Record Number' }],
          text: 'Medical Record Number',
        },
        system: JANO_PATIENT_MRN_SYSTEM,
        value: patient.mrn,
      },
    ];

    if (patient.nationalId || patient.nationalIdentifier) {
      identifiers.push({
        use: 'official' as const,
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'NNxxx', display: 'National Identifier' }],
          text: 'National ID',
        },
        system: `${JANO_SYSTEM_BASE}/identifier/national-id`,
        value: (patient.nationalId || patient.nationalIdentifier)!,
      });
    }

    const telecom = [];
    if (patient.phone) {
      telecom.push({
        system: 'phone' as const,
        value: patient.phone,
        use: 'mobile' as const,
      });
    }
    if (patient.email) {
      telecom.push({
        system: 'email' as const,
        value: patient.email,
        use: 'home' as const,
      });
    }

    const addresses = [];
    if (patient.address || patient.villageTown || patient.district || patient.city || patient.country) {
      addresses.push({
        use: 'home' as const,
        type: 'physical' as const,
        text: patient.address || `${patient.villageTown}, ${patient.district}`,
        line: patient.address ? [patient.address] : [patient.villageTown],
        city: patient.city || patient.villageTown,
        district: patient.district,
        state: patient.region,
        country: patient.country || 'Tanzania',
      });
    }

    let gender: 'male' | 'female' | 'other' | 'unknown' = 'unknown';
    const sexVal = (patient.gender || patient.sex || '').toLowerCase();
    if (sexVal === 'male') gender = 'male';
    else if (sexVal === 'female') gender = 'female';
    else if (sexVal === 'other') gender = 'other';

    const fhirPatient: FHIRPatient = {
      resourceType: 'Patient',
      id: fhirId,
      meta: {
        versionId: String(patient.version || 1),
        lastUpdated: patient.updatedAt || patient.createdAt || new Date().toISOString(),
        source: JANO_SYSTEM_BASE,
      },
      identifier: identifiers,
      active: patient.patientStatus !== 'DECEASED' && patient.patientStatus !== 'INACTIVE',
      name: [
        {
          use: 'official',
          family: patient.familyName || patient.lastName,
          given: [patient.givenName || patient.firstName, ...(patient.middleName ? [patient.middleName] : [])],
          text: `${patient.firstName} ${patient.lastName}`.trim(),
        },
      ],
      gender,
      birthDate: patient.dateOfBirth,
      deceasedBoolean: patient.patientStatus === 'DECEASED' || !!patient.deceasedAt,
      deceasedDateTime: patient.deceasedAt,
      telecom: telecom.length > 0 ? telecom : undefined,
      address: addresses.length > 0 ? addresses : undefined,
      managingOrganization: {
        reference: `Organization/fac-${patient.primaryFacilityId.replace(/^fac-/, '')}`,
        display: patient.primaryFacilityId,
      },
      extension: [
        {
          url: JANO_EXT_FACILITY_ID,
          valueString: patient.primaryFacilityId,
        },
        {
          url: JANO_EXT_SYNC_METADATA,
          extension: [
            { url: 'syncStatus', valueString: patient.syncStatus || 'LOCAL_ONLY' },
            { url: 'syncedAt', valueString: patient.syncedAt },
          ],
        },
      ],
    };

    return fhirPatient;
  }

  public fhirToPatient(fhirPatient: FHIRPatient, defaultFacilityId: string): Partial<Patient> {
    const mrn = fhirPatient.identifier?.find((i) => i.system === JANO_PATIENT_MRN_SYSTEM)?.value ||
      fhirPatient.identifier?.[0]?.value || `MRN-IMP-${Date.now()}`;
    
    const primaryName = fhirPatient.name?.[0];
    const firstName = primaryName?.given?.[0] || 'Unknown';
    const lastName = primaryName?.family || 'Patient';
    const middleName = primaryName?.given && primaryName.given.length > 1 ? primaryName.given.slice(1).join(' ') : undefined;

    const phone = fhirPatient.telecom?.find((t) => t.system === 'phone')?.value;
    const email = fhirPatient.telecom?.find((t) => t.system === 'email')?.value;
    const primaryAddress = fhirPatient.address?.[0];

    const facilityExt = fhirPatient.extension?.find((e) => e.url === JANO_EXT_FACILITY_ID)?.valueString;
    const primaryFacilityId = facilityExt || defaultFacilityId || 'fac-default';

    let sex: 'male' | 'female' | 'other' = 'other';
    if (fhirPatient.gender === 'male') sex = 'male';
    else if (fhirPatient.gender === 'female') sex = 'female';

    return {
      id: fhirPatient.id?.startsWith('pat-') ? `pat_${fhirPatient.id.replace(/^pat-/, '')}` : `pat_${fhirPatient.id || Date.now()}`,
      mrn,
      firstName,
      lastName,
      middleName,
      dateOfBirth: fhirPatient.birthDate || '1990-01-01',
      gender: sex,
      sex,
      phone,
      email,
      address: primaryAddress?.text || primaryAddress?.line?.join(', '),
      villageTown: primaryAddress?.city || 'Imported Village',
      district: primaryAddress?.district || 'Imported District',
      region: primaryAddress?.state,
      country: primaryAddress?.country || 'Tanzania',
      primaryFacilityId,
      patientStatus: fhirPatient.deceasedBoolean ? 'DECEASED' : 'ACTIVE',
      deceasedAt: fhirPatient.deceasedDateTime,
      triageUrgency: 'routine',
      version: fhirPatient.meta?.versionId ? parseInt(fhirPatient.meta.versionId, 10) || 1 : 1,
      createdAt: fhirPatient.meta?.lastUpdated || new Date().toISOString(),
      updatedAt: fhirPatient.meta?.lastUpdated || new Date().toISOString(),
      source: 'mesh_import',
    };
  }

  // =========================================================================
  // 2. ENCOUNTER MAPPINGS
  // =========================================================================

  public encounterToFHIR(encounter: Encounter): FHIREncounter {
    const fhirId = `enc-${encounter.id.replace(/^enc_/, '')}`;
    fhirIdentityMap.registerMapping({
      janoId: encounter.id,
      fhirId,
      resourceType: 'Encounter',
      sourceSystem: JANO_SYSTEM_BASE,
      sourceIdentifier: encounter.encounterNumber || encounter.id,
      confidence: 1.0,
      status: 'MATCH_CONFIRMED',
    });

    let status: FHIREncounter['status'] = 'in-progress';
    const rawStatus = (encounter.status || '').toUpperCase();
    if (rawStatus === 'COMPLETED' || rawStatus === 'SIGNED') {
      status = 'completed';
    } else if (rawStatus === 'CANCELLED') {
      status = 'cancelled';
    } else if (rawStatus === 'PLANNED' || rawStatus === 'CHECKED_IN') {
      status = 'planned';
    }

    const encounterTypeStr = (encounter.type || encounter.encounterType || 'outpatient').toLowerCase();
    let classCode = 'AMB';
    let classDisplay = 'ambulatory';
    if (encounterTypeStr === 'inpatient') {
      classCode = 'IMP';
      classDisplay = 'inpatient encounter';
    } else if (encounterTypeStr === 'emergency') {
      classCode = 'EMER';
      classDisplay = 'emergency';
    } else if (encounterTypeStr === 'telemedicine' || encounterTypeStr === 'teleconsultation') {
      classCode = 'VR';
      classDisplay = 'virtual';
    }

    const participants = [];
    const clinicianId = encounter.clinicianId || encounter.attendingClinicianId;
    if (clinicianId) {
      participants.push({
        type: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                code: 'ATND',
                display: 'attender',
              },
            ],
          },
        ],
        actor: {
          reference: `Practitioner/usr-${clinicianId.replace(/^usr-/, '')}`,
          display: encounter.attendingClinicianName || clinicianId,
        },
      });
    }

    const reasons = [];
    if (encounter.chiefComplaint || encounter.reasonForVisit) {
      reasons.push({
        value: [
          {
            text: encounter.chiefComplaint || encounter.reasonForVisit,
          },
        ],
      });
    }

    const fhirEnc: FHIREncounter = {
      resourceType: 'Encounter',
      id: fhirId,
      meta: {
        versionId: String(encounter.version || 1),
        lastUpdated: encounter.updatedAt || encounter.startedAt || new Date().toISOString(),
        source: JANO_SYSTEM_BASE,
      },
      identifier: [
        {
          system: JANO_ENCOUNTER_ID_SYSTEM,
          value: encounter.encounterNumber || encounter.id,
        },
      ],
      status,
      class: [
        {
          coding: [
            {
              system: FHIR_CS_ENCOUNTER_CLASS,
              code: classCode,
              display: classDisplay,
            },
          ],
        },
      ],
      subject: {
        reference: `Patient/pat-${encounter.patientId.replace(/^pat_/, '')}`,
        display: `Patient ${encounter.patientId}`,
      },
      serviceProvider: {
        reference: `Organization/fac-${encounter.facilityId.replace(/^fac-/, '')}`,
        display: encounter.facilityId,
      },
      actualPeriod: {
        start: encounter.startedAt,
        end: encounter.completedAt || encounter.endedAt,
      },
      participant: participants.length > 0 ? participants : undefined,
      reason: reasons.length > 0 ? reasons : undefined,
      extension: [
        {
          url: JANO_EXT_FACILITY_ID,
          valueString: encounter.facilityId,
        },
        {
          url: JANO_EXT_SYNC_METADATA,
          extension: [
            { url: 'syncStatus', valueString: encounter.syncStatus || 'LOCAL_ONLY' },
            { url: 'syncedAt', valueString: encounter.syncedAt },
          ],
        },
      ],
    };

    return fhirEnc;
  }

  public fhirToEncounter(fhirEnc: FHIREncounter, defaultFacilityId: string): Partial<Encounter> {
    const rawSubject = fhirEnc.subject?.reference || '';
    const patientId = rawSubject.replace(/^Patient\//, '').replace(/^pat-/, 'pat_');

    const rawProvider = fhirEnc.serviceProvider?.reference || '';
    const facilityId = rawProvider.replace(/^Organization\//, '').replace(/^fac-/, 'fac-') || defaultFacilityId;

    let status: Encounter['status'] = 'IN_PROGRESS';
    if (fhirEnc.status === 'completed') status = 'COMPLETED';
    else if (fhirEnc.status === 'cancelled') status = 'CANCELLED';
    else if (fhirEnc.status === 'planned') status = 'PLANNED';

    const chiefComplaint = (fhirEnc.reason?.[0]?.value?.[0] as any)?.text || (fhirEnc.reason?.[0]?.value?.[0] as any)?.display || 'Clinical Encounter';

    return {
      id: fhirEnc.id?.startsWith('enc-') ? `enc_${fhirEnc.id.replace(/^enc-/, '')}` : `enc_${fhirEnc.id || Date.now()}`,
      encounterNumber: fhirEnc.identifier?.[0]?.value || fhirEnc.id,
      patientId,
      facilityId,
      status,
      type: 'OUTPATIENT',
      encounterType: 'OUTPATIENT',
      clinicianId: fhirEnc.participant?.[0]?.actor?.reference?.replace(/^Practitioner\//, '') || 'usr-imported',
      startedAt: fhirEnc.actualPeriod?.start || new Date().toISOString(),
      completedAt: fhirEnc.actualPeriod?.end,
      chiefComplaint,
    };
  }

  // =========================================================================
  // 3. VITAL SIGN MAPPINGS (OBSERVATIONS)
  // =========================================================================

  public vitalsToFHIRObservations(vitals: VitalSign): FHIRObservation[] {
    const observations: FHIRObservation[] = [];
    const patientRef = { reference: `Patient/pat-${vitals.patientId.replace(/^pat_/, '')}` };
    const encounterRef = vitals.encounterId ? { reference: `Encounter/enc-${vitals.encounterId.replace(/^enc_/, '')}` } : undefined;
    const performerRef = [{ reference: `Practitioner/usr-${vitals.recordedById.replace(/^usr-/, '')}` }];
    const effectiveDateTime = vitals.recordedAt;

    const vitalCategory: CodeableConcept = {
      coding: [
        {
          system: FHIR_CS_OBSERVATION_CATEGORY,
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    };

    // Temperature
    if (vitals.temperature !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-temp-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('temperature'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.temperature,
          unit: '°C',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: 'Cel',
        },
      });
    }

    // Heart Rate
    if (vitals.heartRate !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-hr-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('heartRate'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.heartRate,
          unit: 'bpm',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: '/min',
        },
      });
    }

    // Respiratory Rate
    if (vitals.respiratoryRate !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-rr-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('respiratoryRate'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.respiratoryRate,
          unit: 'breaths/min',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: '/min',
        },
      });
    }

    // Blood Pressure (Panel with components)
    if (vitals.systolicBp !== undefined || vitals.diastolicBp !== undefined) {
      const components = [];
      if (vitals.systolicBp !== undefined) {
        components.push({
          code: fhirTerminologyService.mapVitalKeyToCodeableConcept('systolicBp'),
          valueQuantity: {
            value: vitals.systolicBp,
            unit: 'mmHg',
            system: TERMINOLOGY_SYSTEM_UCUM,
            code: 'mm[Hg]',
          },
        });
      }
      if (vitals.diastolicBp !== undefined) {
        components.push({
          code: fhirTerminologyService.mapVitalKeyToCodeableConcept('diastolicBp'),
          valueQuantity: {
            value: vitals.diastolicBp,
            unit: 'mmHg',
            system: TERMINOLOGY_SYSTEM_UCUM,
            code: 'mm[Hg]',
          },
        });
      }

      observations.push({
        resourceType: 'Observation',
        id: `obs-bp-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('bloodPressure'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        component: components,
      });
    }

    // Oxygen Saturation
    if (vitals.oxygenSaturation !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-spo2-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('oxygenSaturation'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.oxygenSaturation,
          unit: '%',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: '%',
        },
      });
    }

    // Weight
    if (vitals.weightKg !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-wt-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('weight'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.weightKg,
          unit: 'kg',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: 'kg',
        },
      });
    }

    // Height
    if (vitals.heightCm !== undefined) {
      observations.push({
        resourceType: 'Observation',
        id: `obs-ht-${vitals.id.replace(/^vts_/, '')}`,
        status: 'final',
        category: [vitalCategory],
        code: fhirTerminologyService.mapVitalKeyToCodeableConcept('height'),
        subject: patientRef,
        encounter: encounterRef,
        effectiveDateTime,
        performer: performerRef,
        valueQuantity: {
          value: vitals.heightCm,
          unit: 'cm',
          system: TERMINOLOGY_SYSTEM_UCUM,
          code: 'cm',
        },
      });
    }

    return observations;
  }

  public fhirObservationToVital(obs: FHIRObservation): Partial<VitalSign> {
    const rawPatient = obs.subject?.reference || '';
    const patientId = rawPatient.replace(/^Patient\//, '').replace(/^pat-/, 'pat_');
    const recordedAt = obs.effectiveDateTime || obs.issued || new Date().toISOString();

    const partial: Partial<VitalSign> = {
      patientId,
      recordedAt,
      recordedById: obs.performer?.[0]?.reference?.replace(/^Practitioner\//, '') || 'usr-imported',
    };

    const code = obs.code.coding?.[0]?.code;

    if (code === '8310-5' && obs.valueQuantity?.value !== undefined) {
      partial.temperature = obs.valueQuantity.value;
    } else if (code === '8867-4' && obs.valueQuantity?.value !== undefined) {
      partial.heartRate = obs.valueQuantity.value;
    } else if (code === '9279-1' && obs.valueQuantity?.value !== undefined) {
      partial.respiratoryRate = obs.valueQuantity.value;
    } else if (code === '59408-5' && obs.valueQuantity?.value !== undefined) {
      partial.oxygenSaturation = obs.valueQuantity.value;
    } else if (code === '29463-7' && obs.valueQuantity?.value !== undefined) {
      partial.weightKg = obs.valueQuantity.value;
    } else if (code === '8302-2' && obs.valueQuantity?.value !== undefined) {
      partial.heightCm = obs.valueQuantity.value;
    } else if (code === '85354-9' && obs.component) {
      for (const comp of obs.component) {
        const compCode = comp.code.coding?.[0]?.code;
        if (compCode === '8480-6') partial.systolicBp = comp.valueQuantity?.value;
        if (compCode === '8462-4') partial.diastolicBp = comp.valueQuantity?.value;
      }
    }

    return partial;
  }

  // =========================================================================
  // 4. CONDITION MAPPINGS (DIAGNOSIS & PROBLEM)
  // =========================================================================

  public diagnosisToFHIRCondition(diagnosis: Diagnosis): FHIRCondition {
    const fhirId = `cond-${diagnosis.id.replace(/^dx_/, '')}`;
    const codeConcept = fhirTerminologyService.mapICD10ToCodeableConcept(
      diagnosis.code || diagnosis.diagnosisCode || 'R69',
      diagnosis.description || diagnosis.diagnosisText
    );

    let clinicalStatusVal = 'active';
    if (diagnosis.status === 'RESOLVED') clinicalStatusVal = 'resolved';

    let verStatusVal = 'confirmed';
    if (diagnosis.status === 'PROVISIONAL' || diagnosis.certainty === 'PROVISIONAL') {
      verStatusVal = 'provisional';
    } else if (diagnosis.certainty === 'RULED_OUT') {
      verStatusVal = 'refuted';
    } else if (diagnosis.status === 'ENTERED_IN_ERROR') {
      verStatusVal = 'entered-in-error';
    }

    const fhirCond: FHIRCondition = {
      resourceType: 'Condition',
      id: fhirId,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: clinicalStatusVal,
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: verStatusVal,
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'encounter-diagnosis',
              display: 'Encounter Diagnosis',
            },
          ],
        },
      ],
      code: codeConcept,
      subject: {
        reference: `Patient/pat-${diagnosis.patientId.replace(/^pat_/, '')}`,
      },
      encounter: diagnosis.encounterId
        ? { reference: `Encounter/enc-${diagnosis.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      recordedDate: diagnosis.recordedAt,
      recorder: diagnosis.clinicianId
        ? { reference: `Practitioner/usr-${diagnosis.clinicianId.replace(/^usr-/, '')}` }
        : undefined,
      note: diagnosis.onsetContext ? [{ text: diagnosis.onsetContext }] : undefined,
    };

    return fhirCond;
  }

  public problemToFHIRCondition(problem: Problem): FHIRCondition {
    const fhirId = `cond-prob-${problem.id.replace(/^prb_/, '')}`;
    const codeConcept = fhirTerminologyService.mapICD10ToCodeableConcept(
      'R69',
      problem.description || problem.clinicalDescription
    );

    let clinicalStatusVal = 'active';
    if (problem.status === 'RESOLVED' || problem.status === 'resolved') {
      clinicalStatusVal = 'resolved';
    } else if (problem.status === 'INACTIVE') {
      clinicalStatusVal = 'inactive';
    }

    const fhirCond: FHIRCondition = {
      resourceType: 'Condition',
      id: fhirId,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: clinicalStatusVal,
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: problem.enteredInError ? 'entered-in-error' : 'confirmed',
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-category',
              code: 'problem-list-item',
              display: 'Problem List Item',
            },
          ],
        },
      ],
      code: codeConcept,
      subject: {
        reference: `Patient/pat-${problem.patientId.replace(/^pat_/, '')}`,
      },
      onsetDateTime: problem.onsetDate,
      recordedDate: problem.recordedAt,
      recorder: problem.recordedById
        ? { reference: `Practitioner/usr-${problem.recordedById.replace(/^usr-/, '')}` }
        : undefined,
    };

    return fhirCond;
  }

  public fhirConditionToDiagnosis(cond: FHIRCondition): Partial<Diagnosis> {
    const mapping = fhirTerminologyService.extractICD10(cond.code);
    const rawPatient = cond.subject?.reference || '';
    const patientId = rawPatient.replace(/^Patient\//, '').replace(/^pat-/, 'pat_');

    const clinicalStatus = cond.clinicalStatus?.coding?.[0]?.code;
    let status: Diagnosis['status'] = 'PROVISIONAL';
    if (clinicalStatus === 'resolved') status = 'RESOLVED';
    else if (cond.verificationStatus?.coding?.[0]?.code === 'confirmed') status = 'CONFIRMED';

    return {
      id: `dx_${cond.id?.replace(/^cond-/, '') || Date.now()}`,
      patientId,
      encounterId: cond.encounter?.reference?.replace(/^Encounter\/enc-/, 'enc_'),
      code: mapping.targetCode || 'R69',
      diagnosisCode: mapping.targetCode || 'R69',
      description: cond.code?.text || mapping.display || 'Imported Diagnosis',
      diagnosisText: cond.code?.text || mapping.display || 'Imported Diagnosis',
      status,
      recordedAt: cond.recordedDate || new Date().toISOString(),
      codingSystem: 'ICD-10',
    };
  }

  // =========================================================================
  // 5. ALLERGY INTOLERANCE MAPPINGS
  // =========================================================================

  public allergyToFHIR(allergy: Allergy): FHIRAllergyIntolerance {
    const fhirId = `alg-${allergy.id.replace(/^alg_/, '')}`;
    const code: CodeableConcept = {
      coding: [
        {
          system: `${JANO_SYSTEM_BASE}/allergens`,
          code: allergy.allergen,
          display: allergy.allergen,
        },
      ],
      text: allergy.allergen,
    };

    let cat: 'food' | 'medication' | 'environment' | 'biologic' = 'environment';
    if (allergy.type === 'drug') cat = 'medication';
    else if (allergy.type === 'food') cat = 'food';

    let crit: 'low' | 'high' | 'unable-to-assess' = 'low';
    if (allergy.severity === 'severe' || allergy.severity === 'life_threatening') crit = 'high';

    const fhirAllergy: FHIRAllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: fhirId,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: allergy.active ? 'active' : 'inactive',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
          },
        ],
      },
      category: [cat],
      criticality: crit,
      code,
      patient: {
        reference: `Patient/pat-${allergy.patientId.replace(/^pat_/, '')}`,
      },
      recordedDate: allergy.diagnosedDate || new Date().toISOString(),
      reaction: [
        {
          manifestation: [
            {
              text: allergy.reaction,
            },
          ],
        },
      ],
    };

    return fhirAllergy;
  }

  public fhirToAllergy(alg: FHIRAllergyIntolerance): Partial<Allergy> {
    const rawPatient = alg.patient?.reference || '';
    const patientId = rawPatient.replace(/^Patient\//, '').replace(/^pat-/, 'pat_');

    const allergen = alg.code?.text || alg.code?.coding?.[0]?.display || alg.code?.coding?.[0]?.code || 'Unknown allergen';
    const reaction = alg.reaction?.[0]?.manifestation?.[0]?.text || 'Hypersensitivity reaction';

    let type: Allergy['type'] = 'other';
    if (alg.category?.includes('medication')) type = 'drug';
    else if (alg.category?.includes('food')) type = 'food';
    else if (alg.category?.includes('environment')) type = 'environmental';

    return {
      id: `alg_${alg.id?.replace(/^alg-/, '') || Date.now()}`,
      patientId,
      allergen,
      reaction,
      type,
      severity: alg.criticality === 'high' ? 'severe' : 'mild',
      active: alg.clinicalStatus?.coding?.[0]?.code === 'active',
      diagnosedDate: alg.recordedDate || new Date().toISOString(),
    };
  }

  // =========================================================================
  // 6. MEDICATION REQUEST & DISPENSE MAPPINGS
  // =========================================================================

  public medicationOrderToFHIR(order: MedicationOrder): FHIRMedicationRequest {
    const rawId = order.id ? order.id.replace(/^ord_/, '') : `gen-${Date.now()}`;
    const fhirId = `medrx-${rawId}`;
    const medCode = order.medicationCode || order.medicationDefinitionId || (order as any).formularyConceptId;
    const medName = order.genericName || order.brandName || (order as any).medicationName;
    const concept = fhirTerminologyService.mapMedicationToCodeableConcept(medCode, medName);

    let status: FHIRMedicationRequest['status'] = 'active';
    if (order.status === 'COMPLETED' as any) status = 'completed';
    else if (order.status === 'DISCONTINUED') status = 'stopped';
    else if (order.status === 'HELD') status = 'on-hold';
    else if (order.status === 'CANCELLED') status = 'cancelled';

    const prescriberId = order.orderedById || (order as any).prescriberId || 'usr-default';
    const prescriberName = order.orderedByName || (order as any).prescriberName || prescriberId;
    const dosageText = order.dose ? `${order.dose} ${order.doseUnit || ''}` : ((order as any).dosage || '');
    const durationDays = order.durationValue || (order as any).durationDays || 0;
    const qty = order.quantity || (order as any).dispenseQuantity || 0;
    const unit = order.quantityUnit || (order as any).dispenseUnit || 'units';

    const fhirReq: FHIRMedicationRequest = {
      resourceType: 'MedicationRequest',
      id: fhirId,
      identifier: [
        {
          system: JANO_ORDER_NUMBER_SYSTEM,
          value: order.orderNumber || fhirId,
        },
      ],
      status,
      intent: 'order',
      medication: { concept },
      subject: {
        reference: `Patient/pat-${(order.patientId || '').replace(/^pat_/, '')}`,
      },
      encounter: order.encounterId
        ? { reference: `Encounter/enc-${order.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      authoredOn: order.orderedAt || (order as any).requestedAt || (order as any).createdAt || new Date().toISOString(),
      requester: {
        reference: `Practitioner/usr-${prescriberId.replace(/^usr-/, '')}`,
        display: prescriberName,
      },
      dosageInstruction: [
        {
          text: `${dosageText} ${order.route || ''} ${order.frequency || ''} for ${durationDays} days. ${order.instructions || ''}`.trim(),
          timing: {
            code: { text: order.frequency || 'once' },
          },
          route: { text: order.route },
        },
      ],
      dispenseRequest: {
        quantity: {
          value: qty,
          unit: unit,
        },
      },
    };

    return fhirReq;
  }

  public dispenseRecordToFHIR(dispense: DispenseRecord): FHIRMedicationDispense {
    const fhirId = `dsp-${dispense.id.replace(/^dsp_/, '')}`;
    const batchId = (dispense as any).batchId || (dispense as any).inventoryBatchId || (dispense as any).batchNumber || 'batch-unknown';
    const concept = fhirTerminologyService.mapMedicationToCodeableConcept(
      dispense.medicationCode || batchId,
      dispense.genericName || `Dispensed Batch ${batchId}`
    );

    let status: FHIRMedicationDispense['status'] = 'completed';
    if (dispense.status === 'REVERSED') status = 'entered-in-error';

    const dispenserId = (dispense as any).dispensedById || dispense.dispensingPharmacistId || 'usr-pharmacy';
    const dispenserName = (dispense as any).dispensedByName || dispense.dispensingPharmacistName || dispenserId;

    const fhirDispense: FHIRMedicationDispense = {
      resourceType: 'MedicationDispense',
      id: fhirId,
      identifier: [
        {
          system: JANO_DISPENSE_SYSTEM,
          value: dispense.dispenseNumber,
        },
      ],
      status,
      medication: { concept },
      subject: {
        reference: `Patient/pat-${dispense.patientId.replace(/^pat_/, '')}`,
      },
      authorizingPrescription: [
        {
          reference: `MedicationRequest/medrx-${dispense.prescriptionId.replace(/^rx_/, '')}`,
        },
      ],
      performer: [
        {
          actor: {
            reference: `Practitioner/usr-${dispenserId.replace(/^usr-/, '')}`,
            display: dispenserName,
          },
        },
      ],
      quantity: {
        value: dispense.quantityDispensed,
        unit: dispense.quantityUnit || 'unit',
      },
      whenHandedOver: dispense.dispensedAt,
      extension: [
        {
          url: JANO_EXT_INVENTORY_BATCH,
          valueString: batchId,
        },
      ],
    };

    return fhirDispense;
  }

  // =========================================================================
  // 7. LABORATORY & DIAGNOSTIC REPORT MAPPINGS
  // =========================================================================

  public labOrderToFHIR(order: LaboratoryOrder): FHIRServiceRequest {
    const fhirId = `sr-lab-${order.id.replace(/^ord_/, '')}`;
    const testConcept = fhirTerminologyService.mapLabTestToCodeableConcept(
      order.testName || 'LAB_GENERAL',
      order.testName
    );

    let status: FHIRServiceRequest['status'] = 'active';
    if (order.status === 'COMPLETED') status = 'completed';
    else if (order.status === 'CANCELLED') status = 'revoked';

    const fhirSr: FHIRServiceRequest = {
      resourceType: 'ServiceRequest',
      id: fhirId,
      identifier: [
        {
          system: JANO_ORDER_NUMBER_SYSTEM,
          value: order.orderNumber || order.id,
        },
      ],
      status,
      intent: 'order',
      category: [
        {
          coding: [
            {
              system: FHIR_CS_OBSERVATION_CATEGORY,
              code: 'laboratory',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: { concept: testConcept },
      subject: {
        reference: `Patient/pat-${order.patientId.replace(/^pat_/, '')}`,
      },
      encounter: order.encounterId
        ? { reference: `Encounter/enc-${order.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      occurrenceDateTime: order.requestedAt || order.orderedAt,
      requester: order.orderingClinicianId || order.orderedById
        ? {
            reference: `Practitioner/usr-${(order.orderingClinicianId || order.orderedById)!.replace(/^usr-/, '')}`,
            display: order.orderingClinicianName,
          }
        : undefined,
      reason: order.clinicalIndication ? [{ concept: { text: order.clinicalIndication } }] : undefined,
    };

    return fhirSr;
  }

  public labSpecimenToFHIR(specimen: LaboratorySpecimen): FHIRSpecimen {
    const fhirId = `spc-${specimen.id.replace(/^spc_/, '')}`;

    return {
      resourceType: 'Specimen',
      id: fhirId,
      accessionIdentifier: {
        system: JANO_ACCESSION_SYSTEM,
        value: specimen.accessionNumber,
      },
      status: specimen.status === 'COLLECTED' || specimen.status === 'RECEIVED' ? 'available' : 'unavailable',
      type: {
        text: specimen.specimenType,
      },
      subject: {
        reference: `Patient/pat-${specimen.patientId.replace(/^pat_/, '')}`,
      },
      receivedTime: specimen.receivedAt,
      collection: {
        collectedDateTime: specimen.collectedAt,
        collector: specimen.collectedById
          ? { reference: `Practitioner/usr-${specimen.collectedById.replace(/^usr-/, '')}` }
          : undefined,
      },
    };
  }

  public labReportToFHIR(report: LaboratoryReport): FHIRDiagnosticReport {
    const fhirId = `dr-lab-${report.id.replace(/^rep_/, '')}`;
    const resultReferences = report.results.map((r) => ({
      reference: `Observation/obs-lab-${r.id.replace(/^res_/, '')}`,
      display: r.testName || r.testCode,
    }));

    const specimenReferences = report.specimens.map((s) => ({
      reference: `Specimen/spc-${s.id.replace(/^spc_/, '')}`,
      display: s.accessionNumber,
    }));

    let status: FHIRDiagnosticReport['status'] = 'final';
    if (report.status === 'PARTIAL' || report.status === 'PENDING') status = 'preliminary';
    else if (report.status === 'CORRECTED') status = 'corrected';

    const fhirDr: FHIRDiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: fhirId,
      identifier: [
        {
          system: JANO_ORDER_NUMBER_SYSTEM,
          value: report.orderNumber,
        },
      ],
      basedOn: [
        {
          reference: `ServiceRequest/sr-lab-${report.orderId.replace(/^ord_/, '')}`,
        },
      ],
      status,
      category: [
        {
          coding: [
            {
              system: FHIR_CS_DIAGNOSTIC_SERVICE_SECTION,
              code: 'LAB',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: TERMINOLOGY_SYSTEM_LOINC,
            code: '11502-2',
            display: 'Laboratory report',
          },
        ],
        text: 'Laboratory Report',
      },
      subject: {
        reference: `Patient/pat-${report.patientId.replace(/^pat_/, '')}`,
      },
      encounter: report.encounterId
        ? { reference: `Encounter/enc-${report.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      issued: report.generatedAt,
      specimen: specimenReferences.length > 0 ? specimenReferences : undefined,
      result: resultReferences.length > 0 ? resultReferences : undefined,
      conclusion: report.hasCritical
        ? 'CRITICAL ALERT: Abnormal critical findings flagged.'
        : report.hasAbnormal
        ? 'Abnormal results present.'
        : 'All results within normal reference ranges.',
    };

    return fhirDr;
  }

  // =========================================================================
  // 8. RADIOLOGY STUDY & REPORT MAPPINGS
  // =========================================================================

  public radiologyStudyToFHIR(study: RadiologyStudy): FHIRImagingStudy {
    const fhirId = `ims-${study.id.replace(/^std_/, '')}`;
    const modalityCoding = fhirTerminologyService.mapRadiologyModality(study.modality);

    let status: FHIRImagingStudy['status'] = 'available';
    if (study.status === 'CANCELLED') status = 'cancelled';
    else if (study.status === 'SCHEDULED' || study.status === 'ARRIVED') status = 'registered';

    const fhirStudy: FHIRImagingStudy = {
      resourceType: 'ImagingStudy',
      id: fhirId,
      identifier: [
        {
          system: `${JANO_SYSTEM_BASE}/study-number`,
          value: study.studyNumber,
        },
      ],
      status,
      modality: [
        {
          coding: [modalityCoding],
        },
      ],
      subject: {
        reference: `Patient/pat-${study.patientId.replace(/^pat_/, '')}`,
      },
      encounter: study.encounterId
        ? { reference: `Encounter/enc-${study.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      started: study.startedAt || study.createdAt,
      basedOn: [
        {
          reference: `ServiceRequest/sr-rad-${study.orderId.replace(/^ord_/, '')}`,
        },
      ],
      description: study.studyDescription,
      numberOfSeries: study.series?.length || 0,
    };

    return fhirStudy;
  }

  public radiologyReportToFHIR(report: RadiologyReport): FHIRDiagnosticReport {
    const fhirId = `dr-rad-${report.id.replace(/^rep_/, '')}`;

    let status: FHIRDiagnosticReport['status'] = 'final';
    if (report.status === 'DRAFT' || report.status === 'PRELIMINARY') status = 'preliminary';
    else if (report.status === 'AMENDED') status = 'amended';
    else if (report.status === 'CANCELLED') status = 'cancelled';

    const fhirDr: FHIRDiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: fhirId,
      basedOn: [
        {
          reference: `ServiceRequest/sr-rad-${report.orderId.replace(/^ord_/, '')}`,
        },
      ],
      study: [
        {
          reference: `ImagingStudy/ims-${report.studyId.replace(/^std_/, '')}`,
        },
      ],
      status,
      category: [
        {
          coding: [
            {
              system: FHIR_CS_DIAGNOSTIC_SERVICE_SECTION,
              code: 'RAD',
              display: 'Radiology',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: TERMINOLOGY_SYSTEM_LOINC,
            code: '18748-4',
            display: 'Diagnostic imaging study',
          },
        ],
        text: 'Radiology Diagnostic Report',
      },
      subject: {
        reference: `Patient/pat-${report.patientId.replace(/^pat_/, '')}`,
      },
      encounter: report.encounterId
        ? { reference: `Encounter/enc-${report.encounterId.replace(/^enc_/, '')}` }
        : undefined,
      issued: report.signedAt || report.createdAt,
      resultsInterpreter: [
        {
          reference: `Practitioner/usr-${report.radiologistId.replace(/^usr-/, '')}`,
          display: report.radiologistName || report.radiologistId,
        },
      ],
      conclusion: `FINDINGS:\n${report.findings}\n\nIMPRESSION:\n${report.impression}`,
    };

    return fhirDr;
  }

  // =========================================================================
  // 9. REFERRAL MAPPINGS (SERVICEREQUEST + TASK)
  // =========================================================================

  public referralToFHIR(referral: Referral): { serviceRequest: FHIRServiceRequest; task: FHIRTask } {
    const srId = `sr-ref-${referral.id.replace(/^ref_/, '')}`;
    const taskId = `task-ref-${referral.id.replace(/^ref_/, '')}`;

    let srStatus: FHIRServiceRequest['status'] = 'active';
    let taskStatus: FHIRTask['status'] = 'requested';

    const rStatus = (referral.status || '').toUpperCase();
    if (rStatus === 'COMPLETED' || rStatus === 'CLOSED') {
      srStatus = 'completed';
      taskStatus = 'completed';
    } else if (rStatus === 'CANCELLED') {
      srStatus = 'revoked';
      taskStatus = 'cancelled';
    } else if (rStatus === 'REJECTED') {
      taskStatus = 'rejected';
      srStatus = 'revoked';
    } else if (rStatus === 'ACCEPTED' || rStatus === 'IN_PROGRESS' || rStatus === 'IN_CARE') {
      taskStatus = 'in-progress';
    }

    const priorityVal = (referral.priority || 'ROUTINE').toLowerCase();
    let priority: 'routine' | 'urgent' | 'asap' | 'stat' = 'routine';
    if (priorityVal.includes('emergency')) priority = 'stat';
    else if (priorityVal.includes('urgent')) priority = 'urgent';

    const serviceRequest: FHIRServiceRequest = {
      resourceType: 'ServiceRequest',
      id: srId,
      identifier: referral.referralNumber
        ? [
            {
              system: `${JANO_SYSTEM_BASE}/identifier/referral-number`,
              value: referral.referralNumber,
            },
          ]
        : undefined,
      status: srStatus,
      intent: 'order',
      priority,
      code: {
        concept: {
          text: referral.reasonForReferral || referral.primaryReason || 'Clinical Referral / Care Coordination',
        },
      },
      subject: {
        reference: `Patient/pat-${referral.patientId.replace(/^pat_/, '')}`,
      },
      requester: referral.requestingClinicianId || referral.requester?.requestingClinicianId
        ? {
            reference: `Practitioner/usr-${(referral.requestingClinicianId || referral.requester?.requestingClinicianId)!.replace(/^usr-/, '')}`,
            display: referral.requestingClinicianName || referral.requester?.requestingClinicianName,
          }
        : undefined,
      performer: referral.destinationFacilityId
        ? [
            {
              reference: `Organization/fac-${referral.destinationFacilityId.replace(/^fac-/, '')}`,
              display: referral.destinationFacilityName || referral.destinationFacilityId,
            },
          ]
        : undefined,
      reason: referral.clinicalSummary ? [{ concept: { text: referral.clinicalSummary } }] : undefined,
    };

    const task: FHIRTask = {
      resourceType: 'Task',
      id: taskId,
      status: taskStatus,
      intent: 'order',
      priority,
      code: {
        coding: [
          {
            system: 'http://hl7.org/fhir/CodeSystem/task-code',
            code: 'fulfill',
            display: 'Fulfill the focal request',
          },
        ],
        text: 'Referral Fulfillment',
      },
      focus: {
        reference: `ServiceRequest/${srId}`,
      },
      for: {
        reference: `Patient/pat-${referral.patientId.replace(/^pat_/, '')}`,
      },
      requester: referral.sourceFacilityId
        ? {
            reference: `Organization/fac-${referral.sourceFacilityId.replace(/^fac-/, '')}`,
          }
        : undefined,
      owner: referral.destinationFacilityId
        ? {
            reference: `Organization/fac-${referral.destinationFacilityId.replace(/^fac-/, '')}`,
            display: referral.destinationFacilityName,
          }
        : undefined,
      description: referral.clinicalSummary,
    };

    return { serviceRequest, task };
  }

  // =========================================================================
  // 10. EMERGENCY CASE MAPPINGS
  // =========================================================================

  public emergencyCaseToFHIR(emergencyCase: EmergencyCase, triage?: EmergencyTriage): {
    encounter: FHIREncounter;
    triageObservation?: FHIRObservation;
  } {
    const encId = `enc-emg-${emergencyCase.id.replace(/^emc_/, '')}`;

    let encStatus: FHIREncounter['status'] = 'in-progress';
    if (emergencyCase.status === 'DISCHARGED' || emergencyCase.status === 'TRANSFERRED' || emergencyCase.status === 'ADMITTED') {
      encStatus = 'discharged';
    } else if (emergencyCase.status === 'CANCELLED') {
      encStatus = 'cancelled';
    }

    const encounter: FHIREncounter = {
      resourceType: 'Encounter',
      id: encId,
      identifier: [
        {
          system: `${JANO_SYSTEM_BASE}/identifier/emergency-case-number`,
          value: emergencyCase.emergencyNumber || (emergencyCase as any).emergencyCaseNumber || emergencyCase.id,
        },
      ],
      status: encStatus,
      class: [
        {
          coding: [
            {
              system: FHIR_CS_ENCOUNTER_CLASS,
              code: 'EMER',
              display: 'emergency',
            },
          ],
        },
      ],
      subject: {
        reference: `Patient/pat-${(emergencyCase.patientId || 'unknown').replace(/^pat_/, '')}`,
      },
      serviceProvider: {
        reference: `Organization/fac-${emergencyCase.facilityId.replace(/^fac-/, '')}`,
      },
      actualPeriod: {
        start: emergencyCase.arrivalAt || (emergencyCase as any).presentedAt || new Date().toISOString(),
        end: emergencyCase.dispositionAt || (emergencyCase as any).closedAt,
      },
      reason: [
        {
          value: [{ text: emergencyCase.chiefComplaint }],
        },
      ],
      extension: [
        {
          url: JANO_EXT_TRIAGE_SYSTEM,
          valueString: triage?.acuity || (triage as any)?.triageCategory || emergencyCase.triageStatus,
        },
      ],
    };

    let triageObservation: FHIRObservation | undefined;
    if (triage) {
      const assessedAt = triage.assessedAt || (triage as any).triagedAt || new Date().toISOString();
      const assessedById = triage.assessedById || (triage as any).triagedById || 'usr-triage';
      const assessedByName = triage.assessedByName || (triage as any).triagedByName || assessedById;
      const triageAcuity = triage.acuity || (triage as any).triageCategory || 'URGENT';

      triageObservation = {
        resourceType: 'Observation',
        id: `obs-trg-${triage.id.replace(/^trg_/, '')}`,
        status: 'final',
        category: [
          {
            coding: [
              {
                system: FHIR_CS_OBSERVATION_CATEGORY,
                code: 'survey',
                display: 'Survey',
              },
            ],
          },
        ],
        code: {
          text: 'Emergency Triage Assessment',
        },
        subject: {
          reference: `Patient/pat-${(emergencyCase.patientId || triage.patientId || 'unknown').replace(/^pat_/, '')}`,
        },
        encounter: {
          reference: `Encounter/${encId}`,
        },
        effectiveDateTime: assessedAt,
        valueCodeableConcept: {
          text: triageAcuity,
        },
        performer: [
          {
            reference: `Practitioner/usr-${assessedById.replace(/^usr-/, '')}`,
            display: assessedByName,
          },
        ],
        extension: [
          {
            url: JANO_EXT_TRIAGE_SYSTEM,
            valueString: triage.triageSystem,
          },
        ],
      };
    }

    return { encounter, triageObservation };
  }

  // =========================================================================
  // 11. CLINICAL NOTE (DOCUMENT REFERENCE)
  // =========================================================================

  public clinicalNoteToFHIR(note: ClinicalNote): FHIRDocumentReference {
    const fhirId = `doc-${note.id.replace(/^nte_/, '')}`;
    const contentText =
      (note as any).narrative ||
      [note.subjective, note.objective, note.assessment, note.plan].filter(Boolean).join('\n\n') ||
      JSON.stringify(note.structuredContent || {});
    const base64Content = Buffer.from(contentText, 'utf8').toString('base64');

    return {
      resourceType: 'DocumentReference',
      id: fhirId,
      status: note.signedAt ? 'current' : 'superseded',
      type: {
        coding: [
          {
            system: TERMINOLOGY_SYSTEM_LOINC,
            code: '11488-4',
            display: 'Consultation note',
          },
        ],
        text: note.noteType,
      },
      subject: {
        reference: `Patient/pat-${note.patientId.replace(/^pat_/, '')}`,
      },
      date: note.recordedAt,
      author: [
        {
          reference: `Practitioner/usr-${note.authorId.replace(/^usr-/, '')}`,
          display: note.authorName,
        },
      ],
      description: `Clinical Note: ${note.noteType}`,
      content: [
        {
          attachment: {
            contentType: 'text/plain',
            data: base64Content,
            title: `${note.noteType} Note`,
          },
        },
      ],
    };
  }

  // =========================================================================
  // 12. PROVENANCE & AUDIT EVENT MAPPINGS
  // =========================================================================

  public provenanceToFHIR(targetReference: string, prov: ProvenanceRecord): FHIRProvenance {
    const now = prov.recordedAt || new Date().toISOString();
    return {
      resourceType: 'Provenance',
      target: [{ reference: targetReference }],
      recorded: now,
      activity: {
        text: prov.source || 'Clinical Record Mutation',
      },
      agent: [
        {
          who: {
            reference: `Practitioner/usr-${(prov.recordedById || 'system').replace(/^usr-/, '')}`,
            display: prov.recordedByName || 'System Actor',
          },
        },
      ],
      extension: prov.facilityId
        ? [
            {
              url: JANO_EXT_FACILITY_ID,
              valueString: prov.facilityId,
            },
            {
              url: JANO_EXT_OFFLINE_PROVENANCE,
              valueString: prov.deviceId || 'offline-edge-node',
            },
          ]
        : undefined,
    };
  }
}

export const fhirMapper = FHIRMapper.getInstance();
