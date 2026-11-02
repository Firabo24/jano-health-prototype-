# Jano Health - FHIR R5 Terminology Normalization & Safe Mapping

This document specifies the terminology translation architecture between Jano clinical domain concepts and international standard coding systems.

---

## 1. Supported Coding Standards

| Clinical Domain | Standard System URI | Standard Code System |
| :--- | :--- | :--- |
| **Diagnoses & Conditions** | `http://hl7.org/fhir/sid/icd-10` | ICD-10 (WHO) |
| **Vitals & Measurements** | `http://loinc.org` | LOINC |
| **Laboratory Observations** | `http://loinc.org` | LOINC |
| **Medication Concepts** | `http://www.nlm.nih.gov/research/umls/rxnorm` | RxNorm / WHO EML |
| **Physical Units** | `http://unitsofmeasure.org` | UCUM |
| **Radiology Modalities** | `http://dicom.nema.org/resources/ontology/DCM` | DICOM Modalities |
| **Clinical Encounters** | `http://terminology.hl7.org/CodeSystem/v3-ActCode` | HL7 ActEncounterCode |

---

## 2. Invariant: Safe Mapping Without Fabrication

1. **Strict Non-Fabrication**:
   - The engine never invents or synthesizes codes to satisfy external validation.
   - If an incoming or local concept cannot be definitively mapped to a recognized standard code, the mapper sets `status: 'UNMAPPED'`.
   - The unmapped text is preserved in `CodeableConcept.text` and marked with the local system URI.

2. **Bidirectional Resolution**:
   - `extractICD10`: Resolves ICD-10 codes from incoming `CodeableConcept` objects, falling back to clean code representation.
   - `extractLOINC`: Resolves LOINC codes for laboratory and vital sign observations.
   - `extractRxNorm`: Resolves medication concepts against the clinical pharmacy catalog.

3. **Units of Measure (UCUM)**:
   - Temperatures: `Cel`
   - Rates: `/min`
   - Pressures: `mm[Hg]`
   - Percentages: `%`
   - Masses: `kg`, `g`, `mg`
   - Lengths: `cm`, `m`
