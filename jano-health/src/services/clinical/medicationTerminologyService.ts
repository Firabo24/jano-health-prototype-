/**
 * Jano Health - Medication Terminology Service (Clinical Core V6)
 * 
 * Provides standardized medication concepts, formulary lookup, dosage form validation,
 * and deterministic terminology matching for offline clinics.
 * 
 * PROVENANCE & ATTRIBUTION:
 * Catalog concepts are derived from the WHO Model List of Essential Medicines (24th List, 2025),
 * published on 5 September 2025.
 * NOTE: Demonstrative clinical simulation catalog. Not a substitute for national formularies
 * (such as the Ethiopian National Essential Medicines List) or local facility formularies.
 */

import { MedicationDefinition, MedicationRoute } from '../../domain/medicationTypes';

export const SYNTHETIC_MEDICATION_DEFINITIONS: MedicationDefinition[] = [
  {
    id: 'med_def_coartem_20_120',
    code: 'WHO-EML-AL-20-120',
    codingSystem: 'WHO_EML',
    genericName: 'Artemether / Lumefantrine',
    brandName: 'Coartem',
    dosageForm: 'Tablet',
    strength: '20mg/120mg',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Antimalarial (Artemisinin-based combination)',
    defaultFrequency: 'Twice daily with meals',
    defaultDurationDays: 3,
  },
  {
    id: 'med_def_amox_500_cap',
    code: 'WHO-EML-AMOX-500-CAP',
    codingSystem: 'WHO_EML',
    genericName: 'Amoxicillin',
    brandName: 'Amoxil',
    dosageForm: 'Capsule',
    strength: '500',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Penicillin Antibacterial (Beta-lactam)',
    defaultFrequency: 'TID',
    defaultDurationDays: 7,
  },
  {
    id: 'med_def_amox_250_susp',
    code: 'WHO-EML-AMOX-250-SUSP',
    codingSystem: 'WHO_EML',
    genericName: 'Amoxicillin',
    brandName: 'Amoxil Suspension',
    dosageForm: 'Oral Suspension',
    strength: '250mg/5mL',
    strengthUnit: 'mg/5mL',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Penicillin Antibacterial (Beta-lactam)',
    defaultFrequency: 'TID',
    defaultDurationDays: 5,
  },
  {
    id: 'med_def_para_500_tab',
    code: 'WHO-EML-PARA-500-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Paracetamol',
    brandName: 'Panadol',
    dosageForm: 'Tablet',
    strength: '500',
    strengthUnit: 'mg',
    routeOptions: ['oral', 'rectal'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Analgesic and Antipyretic',
    defaultFrequency: 'QDS PRN',
    defaultDurationDays: 3,
  },
  {
    id: 'med_def_metf_850_tab',
    code: 'WHO-EML-METF-850-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Metformin Hydrochloride',
    brandName: 'Glucophage',
    dosageForm: 'Tablet',
    strength: '850',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Oral Antidiabetic (Biguanide)',
    defaultFrequency: 'BID with meals',
    defaultDurationDays: 90,
  },
  {
    id: 'med_def_amlo_5_tab',
    code: 'WHO-EML-AMLO-5-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Amlodipine Besylate',
    brandName: 'Norvasc',
    dosageForm: 'Tablet',
    strength: '5',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Antihypertensive (Calcium Channel Blocker)',
    defaultFrequency: 'Once daily morning',
    defaultDurationDays: 90,
  },
  {
    id: 'med_def_cipro_500_tab',
    code: 'WHO-EML-CIPRO-500-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Ciprofloxacin',
    brandName: 'Cipro',
    dosageForm: 'Tablet',
    strength: '500',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Fluoroquinolone Antibacterial',
    defaultFrequency: 'BID',
    defaultDurationDays: 7,
  },
  {
    id: 'med_def_ibup_400_tab',
    code: 'WHO-EML-IBUP-400-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Ibuprofen',
    brandName: 'Brufen',
    dosageForm: 'Tablet',
    strength: '400',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Non-steroidal Anti-inflammatory Drug (NSAID)',
    defaultFrequency: 'TID with food',
    defaultDurationDays: 5,
  },
  {
    id: 'med_def_warf_5_tab',
    code: 'WHO-EML-WARF-5-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Warfarin Sodium',
    brandName: 'Coumadin',
    dosageForm: 'Tablet',
    strength: '5',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Oral Anticoagulant (Vitamin K Antagonist)',
    defaultFrequency: 'Once daily evening',
    defaultDurationDays: 30,
  },
  {
    id: 'med_def_aspi_75_tab',
    code: 'WHO-EML-ASPI-75-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Aspirin (Acetylsalicylic Acid)',
    brandName: 'Cardiprin',
    dosageForm: 'Tablet',
    strength: '75',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Antiplatelet and NSAID',
    defaultFrequency: 'Once daily with water',
    defaultDurationDays: 90,
  },
  {
    id: 'med_def_ceft_1g_inj',
    code: 'WHO-EML-CEFT-1G-INJ',
    codingSystem: 'WHO_EML',
    genericName: 'Ceftriaxone Sodium',
    brandName: 'Rocephin',
    dosageForm: 'Powder for Injection',
    strength: '1',
    strengthUnit: 'g',
    routeOptions: ['intravenous', 'intramuscular'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Third-Generation Cephalosporin Antibacterial',
    defaultFrequency: 'Once daily slow IV/IM',
    defaultDurationDays: 5,
  },
  {
    id: 'med_def_doxy_100_cap',
    code: 'WHO-EML-DOXY-100-CAP',
    codingSystem: 'WHO_EML',
    genericName: 'Doxycycline',
    brandName: 'Vibramycin',
    dosageForm: 'Capsule',
    strength: '100',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Tetracycline Antibacterial',
    defaultFrequency: 'BID with plenty of water',
    defaultDurationDays: 7,
  },
  {
    id: 'med_def_lisi_10_tab',
    code: 'WHO-EML-LISI-10-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Lisinopril',
    brandName: 'Zestril',
    dosageForm: 'Tablet',
    strength: '10',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'ACE Inhibitor Antihypertensive',
    defaultFrequency: 'Once daily morning',
    defaultDurationDays: 30,
  },
  {
    id: 'med_def_spir_25_tab',
    code: 'WHO-EML-SPIR-25-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Spironolactone',
    brandName: 'Aldactone',
    dosageForm: 'Tablet',
    strength: '25',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Potassium-Sparing Diuretic / Aldosterone Antagonist',
    defaultFrequency: 'Once daily morning',
    defaultDurationDays: 30,
  },
  {
    id: 'med_def_meth_2_5_tab',
    code: 'WHO-EML-METH-2-5-TAB',
    codingSystem: 'WHO_EML',
    genericName: 'Methotrexate',
    brandName: 'Trexall',
    dosageForm: 'Tablet',
    strength: '2.5',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'WHO Model List of Essential Medicines (24th List, 2025)',
    sourceVersion: '24th-2025',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'WHO',
    sourceDocument: 'WHO Model List of Essential Medicines',
    edition: '24th',
    publicationYear: 2025,
    publishedAt: '2025-09-05',
    ruleClassification: 'SYNTHETIC_DEMO',
    provenance: 'Derived from WHO Model List of Essential Medicines (24th List, Sep 2025). Synthetic demo parameters for clinical simulation; distinct from Ethiopian National EML or facility-specific formularies.',
    therapeuticClass: 'Antimetabolite / Immunosuppressant (Teratogenic)',
    defaultFrequency: 'Once weekly',
    defaultDurationDays: 28,
  },
  {
    // Synthetic concept with no interaction rules defined (to test UNKNOWN / Knowledge Unavailable)
    id: 'med_def_unknown_chem_x',
    code: 'SYNTH-UNKNOWN-999',
    codingSystem: 'SYNTHETIC_EXPERIMENTAL',
    genericName: 'Synthetic Unclassified Compound X',
    brandName: 'Experimental-X',
    dosageForm: 'Tablet',
    strength: '50',
    strengthUnit: 'mg',
    routeOptions: ['oral'],
    active: true,
    source: 'DEMO / SYNTHETIC EXPERIMENTAL ENTITY',
    sourceVersion: '1.0.0-synthetic',
    effectiveDate: '2025-09-05',
    sourceOrganization: 'SYNTHETIC_LAB',
    sourceDocument: 'Experimental Clinical Simulation Library',
    ruleClassification: 'UNAVAILABLE',
    provenance: 'Synthetic entity with no catalogued interaction rules to verify UNKNOWN / KNOWLEDGE_UNAVAILABLE safety status.',
    therapeuticClass: 'Unclassified Investigation Compound',
    defaultFrequency: 'Once daily',
    defaultDurationDays: 14,
  },
];

export class MedicationTerminologyService {
  private static instance: MedicationTerminologyService;
  private definitions: Map<string, MedicationDefinition> = new Map();

  private constructor() {
    SYNTHETIC_MEDICATION_DEFINITIONS.forEach((def) => {
      this.definitions.set(def.id, def);
      this.definitions.set(def.code.toUpperCase(), def);
    });
    // Common aliases for tests and order requisitions
    const warf = this.definitions.get('WHO-EML-WARF-5-TAB');
    if (warf) {
      this.definitions.set('WHO-EML-WARFARIN-5', warf);
      this.definitions.set('WHO-EML-WARFARIN-5-TAB', warf);
    }
    const ibup = this.definitions.get('WHO-EML-IBUP-400-TAB');
    if (ibup) {
      this.definitions.set('WHO-EML-IBUPROFEN-400', ibup);
      this.definitions.set('WHO-EML-IBUPROFEN-400-TAB', ibup);
    }
    const amox = this.definitions.get('WHO-EML-AMOX-500-CAP');
    if (amox) {
      this.definitions.set('WHO-EML-AMOX-500', amox);
      this.definitions.set('WHO-EML-AMOXICILLIN-500', amox);
    }
    const pcm = this.definitions.get('WHO-EML-PARA-500-TAB');
    if (pcm) {
      this.definitions.set('WHO-EML-PCM-500', pcm);
      this.definitions.set('WHO-EML-PCM-500-TAB', pcm);
      this.definitions.set('WHO-EML-PARACETAMOL-500', pcm);
    }
  }

  public static getInstance(): MedicationTerminologyService {
    if (!MedicationTerminologyService.instance) {
      MedicationTerminologyService.instance = new MedicationTerminologyService();
    }
    return MedicationTerminologyService.instance;
  }

  public getAllDefinitions(): MedicationDefinition[] {
    // Return unique definitions by id
    const unique = new Map<string, MedicationDefinition>();
    SYNTHETIC_MEDICATION_DEFINITIONS.forEach((d) => unique.set(d.id, d));
    return Array.from(unique.values());
  }

  public getAllActiveConcepts(): MedicationDefinition[] {
    return this.getAllDefinitions().filter((d) => d.active !== false);
  }

  public getConcept(idOrCode: string): MedicationDefinition | undefined {
    if (!idOrCode) return undefined;
    const direct = this.definitions.get(idOrCode) || this.definitions.get(idOrCode.toUpperCase());
    if (direct) return direct;

    // Search by exact code or id case-insensitively
    const all = this.getAllDefinitions();
    return all.find(
      (d) =>
        d.id.toLowerCase() === idOrCode.toLowerCase() ||
        d.code.toLowerCase() === idOrCode.toLowerCase()
    );
  }

  public search(query: string): MedicationDefinition[] {
    const clean = (query || '').trim().toLowerCase();
    if (!clean) return this.getAllDefinitions();

    return this.getAllDefinitions().filter((def) => {
      const matchGeneric = def.genericName.toLowerCase().includes(clean);
      const matchBrand = def.brandName?.toLowerCase().includes(clean);
      const matchCode = def.code.toLowerCase().includes(clean);
      const matchClass = def.therapeuticClass?.toLowerCase().includes(clean);
      return matchGeneric || matchBrand || matchCode || matchClass;
    });
  }

  public validate(concept: Partial<MedicationDefinition>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!concept.code || !concept.code.trim()) {
      errors.push('Medication code is mandatory');
    }
    if (!concept.genericName || !concept.genericName.trim()) {
      errors.push('Generic name is mandatory');
    }
    if (!concept.dosageForm || !concept.dosageForm.trim()) {
      errors.push('Dosage form is mandatory');
    }
    if (!concept.strength || !concept.strength.trim()) {
      errors.push('Strength is mandatory');
    }
    if (!concept.strengthUnit || !concept.strengthUnit.trim()) {
      errors.push('Strength unit is mandatory');
    }
    if (!concept.routeOptions || concept.routeOptions.length === 0) {
      errors.push('At least one allowable clinical route must be specified');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getDisplay(definitionOrId: MedicationDefinition | string): string {
    const def = typeof definitionOrId === 'string' ? this.getConcept(definitionOrId) : definitionOrId;
    if (!def) return typeof definitionOrId === 'string' ? definitionOrId : 'Unknown Medication';

    const brandPart = def.brandName ? ` (${def.brandName})` : '';
    return `${def.genericName}${brandPart} ${def.strength}${def.strengthUnit ? ' ' + def.strengthUnit : ''} ${def.dosageForm}`;
  }
}

export const medicationTerminologyService = MedicationTerminologyService.getInstance();
