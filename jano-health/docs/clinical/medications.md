# Clinical Domain: Medication Definition & Formulary Concepts

## 1. Overview
In Jano Health Clinical Core V6, medication terminology and definitions serve as the authoritative reference catalog for all prescribing, safety evaluation, dispensing, and inventory operations. The formulary catalog is rooted in the WHO Model List of Essential Medicines (WHO-EML) 2026, augmented with standard international nomenclature (ATC / RxNorm) to guarantee offline clinical safety without requiring live terminology server calls.

## 2. Formulary Schema: MedicationDefinition
Every medication available for prescription in the system is defined by an immutable, versioned `MedicationDefinition` concept:

```typescript
export interface MedicationDefinition {
  id: string; // Aggregate ID: med_def_<uuidv7>
  code: string; // WHO EML / ATC / National Formulary Code
  genericName: string;
  brandName?: string;
  synonyms?: string[];
  therapeuticClass: string;
  atcClassification?: string;
  dosageForm: string; // e.g., 'Tablet', 'Capsule', 'Suspension', 'Injection'
  strength: string; // e.g., '500'
  strengthUnit: string; // e.g., 'mg'
  allowedRoutes: MedicationRoute[];
  packageQuantity?: number;
  packageUnit?: string;
  isControlledSubstance?: boolean;
  whoEssentialMedicineList: boolean;
  version: number;
}
```

## 3. Offline Terminology Service
The `MedicationTerminologyService` acts as an edge repository for all formulary concepts:
- **Seed Catalog**: Bundles essential antimicrobials (Artemether/Lumefantrine, Amoxicillin, Ciprofloxacin, Ceftriaxone), analgesics (Paracetamol, Ibuprofen, Morphine), cardiovascular agents (Amlodipine, Lisinopril, Atenolol), anticoagulants (Warfarin), endocrine therapies (Metformin, Glibenclamide, Regular Insulin), and fluid replacement therapies (Oral Rehydration Salts).
- **Sub-string & Multi-alias Search**: Matches generic names, brand names, and colloquial abbreviations (e.g. `PCM`, `Coartem`, `Amoxil`).
- **Standardized Coding**: Pre-configured with WHO-EML codes (`WHO-EML-AL-20-120-TAB`, `WHO-EML-AMOX-500-CAP`) enabling seamless interoperability across clinical facilities.

## 4. Backwards Compatibility & Data Model Unification
Legacy `Medication` records from previous versions are reconciled through `MedicationService.getMedicationHistory()`, attributing legacy entries with appropriate provenance while authoritative prescribing transitions completely to `MedicationOrder` and `Prescription`.
