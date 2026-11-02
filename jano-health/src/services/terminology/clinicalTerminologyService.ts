/**
 * Jano Health - Clinical Terminology Service
 * 
 * Provides offline-first clinical terminology lookup, validation, synonym matching,
 * and coding system abstractions (ICD-10, SNOMED-CT, Synthetic/Regional WHO).
 * Guaranteed to operate 100% offline without remote network round-trips.
 */

export interface ClinicalTerm {
  code: string;
  system: 'ICD-10' | 'SNOMED-CT' | 'LOCAL';
  display: string;
  category: 'infectious' | 'cardiovascular' | 'respiratory' | 'endocrine' | 'maternal_neonatal' | 'gastrointestinal' | 'neurological' | 'injury' | 'general';
  synonyms: string[];
  icd10Chapter?: string;
  isChronic?: boolean;
  priorityLevel?: 'routine' | 'urgent' | 'emergency';
}

export const CANONICAL_CLINICAL_TERMS: ClinicalTerm[] = [
  {
    code: 'B50.9',
    system: 'ICD-10',
    display: 'Plasmodium falciparum malaria, unspecified',
    category: 'infectious',
    synonyms: ['malaria', 'falciparum', 'paludisme', 'fever and chills', 'severe fever'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'urgent',
  },
  {
    code: 'B54',
    system: 'ICD-10',
    display: 'Unspecified malaria',
    category: 'infectious',
    synonyms: ['clinical malaria', 'febrile illness', 'suspected malaria'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'urgent',
  },
  {
    code: 'A01.0',
    system: 'ICD-10',
    display: 'Typhoid fever',
    category: 'infectious',
    synonyms: ['typhoid', 'enteric fever', 'salmonella typhi', 'stepwise fever'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'urgent',
  },
  {
    code: 'A09.0',
    system: 'ICD-10',
    display: 'Other and unspecified gastroenteritis and colitis of infectious origin',
    category: 'gastrointestinal',
    synonyms: ['diarrhea', 'gastroenteritis', 'loose stools', 'acute diarrhea', 'watery diarrhea'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'A00.9',
    system: 'ICD-10',
    display: 'Cholera, unspecified',
    category: 'gastrointestinal',
    synonyms: ['cholera', 'rice water stool', 'acute dehydrating diarrhea'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'J18.9',
    system: 'ICD-10',
    display: 'Pneumonia, unspecified organism',
    category: 'respiratory',
    synonyms: ['pneumonia', 'chest infection', 'lung infection', 'fast breathing', 'crackles'],
    icd10Chapter: 'Diseases of the respiratory system',
    isChronic: false,
    priorityLevel: 'urgent',
  },
  {
    code: 'J06.9',
    system: 'ICD-10',
    display: 'Acute upper respiratory infection, unspecified',
    category: 'respiratory',
    synonyms: ['URTI', 'cold', 'upper respiratory infection', 'cough and runny nose'],
    icd10Chapter: 'Diseases of the respiratory system',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'J45.9',
    system: 'ICD-10',
    display: 'Asthma, unspecified',
    category: 'respiratory',
    synonyms: ['asthma', 'bronchial asthma', 'wheezing', 'reactive airway'],
    icd10Chapter: 'Diseases of the respiratory system',
    isChronic: true,
    priorityLevel: 'urgent',
  },
  {
    code: 'A15.0',
    system: 'ICD-10',
    display: 'Tuberculosis of lung',
    category: 'respiratory',
    synonyms: ['TB', 'pulmonary tuberculosis', 'cough with blood', 'hemoptysis', 'consumption'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: true,
    priorityLevel: 'urgent',
  },
  {
    code: 'I10',
    system: 'ICD-10',
    display: 'Essential (primary) hypertension',
    category: 'cardiovascular',
    synonyms: ['hypertension', 'high blood pressure', 'HTN', 'elevated BP'],
    icd10Chapter: 'Diseases of the circulatory system',
    isChronic: true,
    priorityLevel: 'routine',
  },
  {
    code: 'I21.9',
    system: 'ICD-10',
    display: 'Acute myocardial infarction, unspecified',
    category: 'cardiovascular',
    synonyms: ['heart attack', 'MI', 'STEMI', 'acute coronary syndrome', 'crushing chest pain'],
    icd10Chapter: 'Diseases of the circulatory system',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'E11.9',
    system: 'ICD-10',
    display: 'Type 2 diabetes mellitus without complications',
    category: 'endocrine',
    synonyms: ['diabetes', 'T2D', 'sugar disease', 'type 2 diabetes', 'hyperglycemia'],
    icd10Chapter: 'Endocrine, nutritional and metabolic diseases',
    isChronic: true,
    priorityLevel: 'routine',
  },
  {
    code: 'E10.9',
    system: 'ICD-10',
    display: 'Type 1 diabetes mellitus without complications',
    category: 'endocrine',
    synonyms: ['juvenile diabetes', 'T1D', 'insulin dependent diabetes'],
    icd10Chapter: 'Endocrine, nutritional and metabolic diseases',
    isChronic: true,
    priorityLevel: 'urgent',
  },
  {
    code: 'D64.9',
    system: 'ICD-10',
    display: 'Anemia, unspecified',
    category: 'general',
    synonyms: ['anemia', 'low hemoglobin', 'pallor', 'iron deficiency'],
    icd10Chapter: 'Diseases of the blood and blood-forming organs',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'O14.9',
    system: 'ICD-10',
    display: 'Preeclampsia, unspecified',
    category: 'maternal_neonatal',
    synonyms: ['preeclampsia', 'toxemia of pregnancy', 'pregnancy hypertension with proteinuria'],
    icd10Chapter: 'Pregnancy, childbirth and the puerperium',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'O15.0',
    system: 'ICD-10',
    display: 'Eclampsia in pregnancy',
    category: 'maternal_neonatal',
    synonyms: ['eclampsia', 'pregnancy seizures', 'convulsions in pregnancy'],
    icd10Chapter: 'Pregnancy, childbirth and the puerperium',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'B24',
    system: 'ICD-10',
    display: 'Human immunodeficiency virus [HIV] disease, unspecified',
    category: 'infectious',
    synonyms: ['HIV', 'retroviral disease', 'AIDS', 'HIV infection'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: true,
    priorityLevel: 'routine',
  },
  {
    code: 'N39.0',
    system: 'ICD-10',
    display: 'Urinary tract infection, site not specified',
    category: 'general',
    synonyms: ['UTI', 'dysuria', 'bladder infection', 'cystitis'],
    icd10Chapter: 'Diseases of the genitourinary system',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'G03.9',
    system: 'ICD-10',
    display: 'Meningitis, unspecified',
    category: 'neurological',
    synonyms: ['meningitis', 'neck stiffness', 'meningism', 'CNS infection'],
    icd10Chapter: 'Diseases of the nervous system',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'R50.9',
    system: 'ICD-10',
    display: 'Fever, unspecified',
    category: 'general',
    synonyms: ['fever', 'pyrexia', 'febrile', 'elevated temperature'],
    icd10Chapter: 'Symptoms, signs and abnormal clinical findings',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'A41.9',
    system: 'ICD-10',
    display: 'Sepsis, unspecified organism',
    category: 'infectious',
    synonyms: ['sepsis', 'septicemia', 'blood poisoning', 'severe systemic infection'],
    icd10Chapter: 'Certain infectious and parasitic diseases',
    isChronic: false,
    priorityLevel: 'emergency',
  },
  {
    code: 'E46',
    system: 'ICD-10',
    display: 'Unspecified protein-energy malnutrition',
    category: 'endocrine',
    synonyms: ['malnutrition', 'wasting', 'underweight', 'SAM', 'MAM'],
    icd10Chapter: 'Endocrine, nutritional and metabolic diseases',
    isChronic: true,
    priorityLevel: 'urgent',
  },
  {
    code: 'H66.9',
    system: 'ICD-10',
    display: 'Otitis media, unspecified',
    category: 'general',
    synonyms: ['ear infection', 'otitis media', 'ear pain', 'ear discharge'],
    icd10Chapter: 'Diseases of the ear and mastoid process',
    isChronic: false,
    priorityLevel: 'routine',
  },
  {
    code: 'T14.9',
    system: 'ICD-10',
    display: 'Injury, unspecified',
    category: 'injury',
    synonyms: ['trauma', 'physical injury', 'fall', 'wound', 'laceration'],
    icd10Chapter: 'Injury, poisoning and certain other consequences of external causes',
    isChronic: false,
    priorityLevel: 'urgent',
  },
];

export class ClinicalTerminologyService {
  private static instance: ClinicalTerminologyService;
  private terms: ClinicalTerm[] = CANONICAL_CLINICAL_TERMS;

  public static getInstance(): ClinicalTerminologyService {
    if (!ClinicalTerminologyService.instance) {
      ClinicalTerminologyService.instance = new ClinicalTerminologyService();
    }
    return ClinicalTerminologyService.instance;
  }

  /**
   * Look up a clinical term by its exact primary code.
   */
  public lookupByCode(code: string): ClinicalTerm | undefined {
    if (!code) return undefined;
    const cleanCode = code.trim().toUpperCase();
    return this.terms.find((t) => t.code.toUpperCase() === cleanCode);
  }

  public getByCode(code: string): ClinicalTerm | undefined {
    return this.lookupByCode(code);
  }

  /**
   * Validates whether a given code exists in the terminology registry.
   */
  public isValidCode(code: string, system?: string): boolean {
    if (!code) return false;
    const term = this.lookupByCode(code);
    if (!term) return false;
    if (system && term.system !== system) return false;
    return true;
  }

  /**
   * Performs an instant offline fuzzy text search across codes, descriptions, and clinical synonyms.
   */
  public search(query: string, limit = 10): ClinicalTerm[] {
    if (!query || query.trim().length === 0) {
      return this.terms.slice(0, limit);
    }

    const q = query.trim().toLowerCase();
    const scored: { term: ClinicalTerm; score: number }[] = [];

    for (const term of this.terms) {
      let score = 0;
      const codeLower = term.code.toLowerCase();
      const displayLower = term.display.toLowerCase();

      // Exact code match
      if (codeLower === q) {
        score = 100;
      } else if (codeLower.startsWith(q)) {
        score = 80;
      } else if (displayLower === q) {
        score = 90;
      } else if (displayLower.startsWith(q)) {
        score = 70;
      } else if (displayLower.includes(q)) {
        score = 50;
      } else {
        // Synonym matches
        for (const syn of term.synonyms) {
          const synLower = syn.toLowerCase();
          if (synLower === q) {
            score = Math.max(score, 65);
          } else if (synLower.startsWith(q)) {
            score = Math.max(score, 45);
          } else if (synLower.includes(q)) {
            score = Math.max(score, 30);
          }
        }
      }

      if (score > 0) {
        scored.push({ term, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.term);
  }

  /**
   * Returns all clinical terms grouped by category.
   */
  public getByCategory(category: ClinicalTerm['category']): ClinicalTerm[] {
    return this.terms.filter((t) => t.category === category);
  }

  /**
   * Formats a standardized diagnosis string with code and text.
   */
  public formatDiagnosis(code: string, fallbackText?: string): string {
    const term = this.lookupByCode(code);
    if (term) {
      return `[${term.code}] ${term.display}`;
    }
    return fallbackText ? `[${code}] ${fallbackText}` : code;
  }
}

export const clinicalTerminologyService = ClinicalTerminologyService.getInstance();
