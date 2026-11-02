/**
 * Jano Health - FHIR Terminology Service
 * Translates clinical concepts between internal Jano terminologies and FHIR R5 standard code systems.
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * Do not fabricate codes. If an authoritative mapping does not exist, return 'UNMAPPED'
 * and preserve source code, system, and raw display without falsification.
 */

import {
  TERMINOLOGY_SYSTEM_ICD10,
  TERMINOLOGY_SYSTEM_LOINC,
  TERMINOLOGY_SYSTEM_RXNORM,
  TERMINOLOGY_SYSTEM_WHO_EML,
  TERMINOLOGY_SYSTEM_UCUM,
  TERMINOLOGY_SYSTEM_DICOM,
  JANO_SYSTEM_BASE,
} from './constants';
import { Coding, CodeableConcept, TerminologyMappingResult } from './types';
import { clinicalTerminologyService } from '../terminology/clinicalTerminologyService';

export interface StandardVitalConcept {
  loincCode: string;
  display: string;
  defaultUnit: string;
  ucumUnit: string;
}

export const VITAL_SIGNS_LOINC_MAP: Record<string, StandardVitalConcept> = {
  temperature: {
    loincCode: '8310-5',
    display: 'Body temperature',
    defaultUnit: '°C',
    ucumUnit: 'Cel',
  },
  heartRate: {
    loincCode: '8867-4',
    display: 'Heart rate',
    defaultUnit: 'bpm',
    ucumUnit: '/min',
  },
  respiratoryRate: {
    loincCode: '9279-1',
    display: 'Respiratory rate',
    defaultUnit: 'breaths/min',
    ucumUnit: '/min',
  },
  bloodPressure: {
    loincCode: '85354-9',
    display: 'Blood pressure panel with all children optional',
    defaultUnit: 'mmHg',
    ucumUnit: 'mm[Hg]',
  },
  systolicBp: {
    loincCode: '8480-6',
    display: 'Systolic blood pressure',
    defaultUnit: 'mmHg',
    ucumUnit: 'mm[Hg]',
  },
  diastolicBp: {
    loincCode: '8462-4',
    display: 'Diastolic blood pressure',
    defaultUnit: 'mmHg',
    ucumUnit: 'mm[Hg]',
  },
  oxygenSaturation: {
    loincCode: '59408-5',
    display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
    defaultUnit: '%',
    ucumUnit: '%',
  },
  weight: {
    loincCode: '29463-7',
    display: 'Body weight',
    defaultUnit: 'kg',
    ucumUnit: 'kg',
  },
  height: {
    loincCode: '8302-2',
    display: 'Body height',
    defaultUnit: 'cm',
    ucumUnit: 'cm',
  },
  painScore: {
    loincCode: '72514-3',
    display: 'Pain severity - 0-10 verbal numeric rating score',
    defaultUnit: '{score}',
    ucumUnit: '{score}',
  },
};

export const COMMON_LAB_LOINC_MAP: Record<string, { loincCode: string; display: string; unit: string; ucum: string }> = {
  MALARIA_BS: {
    loincCode: '34444-0',
    display: 'Malaria parasite [Presence] in Blood by Thin smear and Thick smear',
    unit: 'parasites/uL',
    ucum: '/uL',
  },
  MALARIA_RDT: {
    loincCode: '50554-5',
    display: 'Malaria Ag [Presence] in Blood by Rapid immunoassay',
    unit: 'qualitative',
    ucum: '{qualitative}',
  },
  HEMOGLOBIN: {
    loincCode: '718-7',
    display: 'Hemoglobin [Mass/volume] in Blood',
    unit: 'g/dL',
    ucum: 'g/dL',
  },
  GLUCOSE_FASTING: {
    loincCode: '1558-6',
    display: 'Fasting glucose [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    ucum: 'mg/dL',
  },
  GLUCOSE_RANDOM: {
    loincCode: '2345-7',
    display: 'Glucose [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    ucum: 'mg/dL',
  },
  HIV_RAPID: {
    loincCode: '49580-4',
    display: 'HIV 1 and 2 Ab [Presence] in Serum or Plasma by Rapid immunoassay',
    unit: 'qualitative',
    ucum: '{qualitative}',
  },
  CREATININE: {
    loincCode: '2160-0',
    display: 'Creatinine [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    ucum: 'mg/dL',
  },
};

export const COMMON_MEDICATION_MAP: Record<string, { rxNormCode?: string; emlCode: string; display: string }> = {
  'AMOX-500': {
    rxNormCode: '308182',
    emlCode: 'EML-J01CA04',
    display: 'Amoxicillin 500 mg oral capsule',
  },
  'AL-20-120': {
    rxNormCode: '856384',
    emlCode: 'EML-P01BF01',
    display: 'Artemether 20 mg / Lumefantrine 120 mg oral tablet',
  },
  'PARA-500': {
    rxNormCode: '198440',
    emlCode: 'EML-N02BE01',
    display: 'Paracetamol 500 mg oral tablet',
  },
  'IBU-400': {
    rxNormCode: '197806',
    emlCode: 'EML-M01AE01',
    display: 'Ibuprofen 400 mg oral tablet',
  },
  'WARF-5': {
    rxNormCode: '855332',
    emlCode: 'EML-B01AA03',
    display: 'Warfarin sodium 5 mg oral tablet',
  },
  'ORS-SACHET': {
    emlCode: 'EML-A07CA01',
    display: 'Oral Rehydration Salts sachet',
  },
  'CEFT-1G': {
    rxNormCode: '309094',
    emlCode: 'EML-J01DD04',
    display: 'Ceftriaxone 1 g powder for injection',
  },
};

export class FHIRTerminologyService {
  private static instance: FHIRTerminologyService;

  private constructor() {}

  public static getInstance(): FHIRTerminologyService {
    if (!FHIRTerminologyService.instance) {
      FHIRTerminologyService.instance = new FHIRTerminologyService();
    }
    return FHIRTerminologyService.instance;
  }

  /**
   * Translates a diagnosis/problem ICD-10 code into a FHIR CodeableConcept.
   */
  public mapICD10ToCodeableConcept(code: string, display?: string): CodeableConcept {
    const verified = clinicalTerminologyService.lookupByCode(code);
    const resolvedDisplay = display || verified?.display || code;

    return {
      coding: [
        {
          system: TERMINOLOGY_SYSTEM_ICD10,
          code: code.toUpperCase().trim(),
          display: resolvedDisplay,
          version: '2019',
        },
      ],
      text: resolvedDisplay,
    };
  }

  public toICD10Concept(code: string, display?: string): CodeableConcept {
    return this.mapICD10ToCodeableConcept(code, display);
  }

  public toLOINCConcept(code: string, display?: string, _category?: string): CodeableConcept {
    return {
      coding: [
        {
          system: TERMINOLOGY_SYSTEM_LOINC,
          code: code.trim(),
          display: display || code,
        },
      ],
      text: display || code,
    };
  }

  /**
   * Reverse-translates a FHIR CodeableConcept to a validated ICD-10 code.
   */
  public extractICD10(concept?: CodeableConcept): TerminologyMappingResult {
    if (!concept || !concept.coding || concept.coding.length === 0) {
      return {
        sourceSystem: 'UNKNOWN',
        sourceCode: '',
        targetSystem: TERMINOLOGY_SYSTEM_ICD10,
        targetCode: undefined,
        display: concept?.text,
        status: 'UNMAPPED',
      };
    }

    const icdCoding = concept.coding.find(
      (c) => c.system === TERMINOLOGY_SYSTEM_ICD10 || c.system?.includes('icd-10')
    );

    if (icdCoding && icdCoding.code) {
      const code = icdCoding.code.toUpperCase().trim();
      const verified = clinicalTerminologyService.lookupByCode(code);
      return {
        sourceSystem: icdCoding.system || TERMINOLOGY_SYSTEM_ICD10,
        sourceCode: code,
        targetSystem: TERMINOLOGY_SYSTEM_ICD10,
        targetCode: code,
        display: icdCoding.display || verified?.display,
        status: verified ? 'EXACT' : 'EQUIVALENT',
        version: icdCoding.version || '2019',
      };
    }

    // No ICD-10 coding found, check fallback or return UNMAPPED
    const primary = concept.coding[0];
    return {
      sourceSystem: primary.system || 'LOCAL',
      sourceCode: primary.code || '',
      targetSystem: TERMINOLOGY_SYSTEM_ICD10,
      targetCode: undefined,
      display: primary.display || concept.text,
      status: 'UNMAPPED',
    };
  }

  /**
   * Maps a vital sign measurement key to LOINC CodeableConcept.
   */
  public mapVitalKeyToCodeableConcept(vitalKey: string): CodeableConcept {
    const loinc = VITAL_SIGNS_LOINC_MAP[vitalKey];
    if (loinc) {
      return {
        coding: [
          {
            system: TERMINOLOGY_SYSTEM_LOINC,
            code: loinc.loincCode,
            display: loinc.display,
          },
        ],
        text: loinc.display,
      };
    }

    // Explicitly unmapped without code fabrication
    return {
      coding: [
        {
          system: `${JANO_SYSTEM_BASE}/vitals`,
          code: vitalKey,
          display: vitalKey,
        },
      ],
      text: vitalKey,
    };
  }

  /**
   * Maps a laboratory test code to LOINC CodeableConcept.
   */
  public mapLabTestToCodeableConcept(testCode: string, testName?: string): CodeableConcept {
    const upperKey = testCode.toUpperCase().trim();
    const loinc = COMMON_LAB_LOINC_MAP[upperKey];
    if (loinc) {
      return {
        coding: [
          {
            system: TERMINOLOGY_SYSTEM_LOINC,
            code: loinc.loincCode,
            display: loinc.display,
          },
        ],
        text: testName || loinc.display,
      };
    }

    return {
      coding: [
        {
          system: `${JANO_SYSTEM_BASE}/lab-tests`,
          code: testCode,
          display: testName || testCode,
        },
      ],
      text: testName || testCode,
    };
  }

  /**
   * Maps medication formulary item to standard coding (RxNorm / WHO EML).
   */
  public mapMedicationToCodeableConcept(medicationCode?: string, name?: string): CodeableConcept {
    const rawCode = (medicationCode || name || 'UNKNOWN').trim();
    const upperKey = rawCode.toUpperCase();
    const mapping = COMMON_MEDICATION_MAP[upperKey];
    const codings: Coding[] = [];

    if (mapping) {
      if (mapping.rxNormCode) {
        codings.push({
          system: TERMINOLOGY_SYSTEM_RXNORM,
          code: mapping.rxNormCode,
          display: mapping.display,
        });
      }
      if (mapping.emlCode) {
        codings.push({
          system: TERMINOLOGY_SYSTEM_WHO_EML,
          code: mapping.emlCode,
          display: mapping.display,
        });
      }
    } else {
      // Local Jano formulary coding
      codings.push({
        system: `${JANO_SYSTEM_BASE}/medications`,
        code: rawCode,
        display: name || rawCode,
      });
    }

    return {
      coding: codings,
      text: name || mapping?.display || rawCode,
    };
  }

  /**
   * Maps radiology modality to standard DICOM modality code.
   */
  public mapRadiologyModality(modality: string): Coding {
    const m = modality.toUpperCase().trim();
    let code = 'OT';
    let display = 'Other';

    if (m === 'X-RAY' || m === 'XR' || m === 'RADIOGRAPHY') {
      code = 'DX';
      display = 'Digital Radiography';
    } else if (m === 'ULTRASOUND' || m === 'US') {
      code = 'US';
      display = 'Ultrasound';
    } else if (m === 'CT' || m === 'COMPUTED TOMOGRAPHY') {
      code = 'CT';
      display = 'Computed Tomography';
    } else if (m === 'MRI' || m === 'MR') {
      code = 'MR';
      display = 'Magnetic Resonance';
    }

    return {
      system: TERMINOLOGY_SYSTEM_DICOM,
      code,
      display,
    };
  }
}

export const fhirTerminologyService = FHIRTerminologyService.getInstance();
