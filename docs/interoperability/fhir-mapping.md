# Jano Health - FHIR R5 Clinical Data Mapping Matrix

This document defines the complete bidirectional transformation mapping between Jano domain aggregates and FHIR R5 standard resources.

---

## 1. Resource Mapping Overview

| Jano Domain Entity | FHIR R5 Resource | Mapping Logic & Specific Rules |
| :--- | :--- | :--- |
| **Patient** | `Patient` | Identifiers (MRN system, National ID), HumanName, Address, Gender, extensions for facility and sync status. |
| **Encounter** | `Encounter` | Class ('AMB', 'IMP', 'EMER'), Status ('in-progress', 'completed'), Subject reference, Participants, Period. |
| **VitalSign** | `Observation` (xN) | Decomposes panel into LOINC-coded atomic observations (`8310-5` Temp, `8867-4` HR, `9279-1` RR, `85354-9` BP with components). |
| **Problem** | `Condition` | Category `problem-list-item`, ICD-10 code, ClinicalStatus (`active`, `resolved`), Recorder. |
| **Diagnosis** | `Condition` | Category `encounter-diagnosis`, ICD-10 code, VerificationStatus (`confirmed`, `provisional`), Onset. |
| **Allergy** | `AllergyIntolerance`| Category (`food`, `medication`, `environment`), Criticality (`low`, `high`), Manifestation narrative. |
| **LaboratoryOrder** | `ServiceRequest` | Category `laboratory`, Intent `order`, LOINC test concept, Subject reference, OccurrenceDateTime. |
| **LaboratorySpecimen** | `Specimen` | Accession identifier with `JANO_ACCESSION_SYSTEM` (independent from FHIR id), Specimen type, Collection time. |
| **LaboratoryReport** | `DiagnosticReport` | Category `LAB`, LOINC `11502-2`, References to child atomic Observations and Specimens, Conclusion. |
| **RadiologyStudy** | `ImagingStudy` | Modality (DICOM standard codes), Series metadata, Number of instances. NO raw binary embedding. |
| **RadiologyReport** | `DiagnosticReport` | Category `RAD`, LOINC `18748-4`, Interpreter reference, Study reference, Findings and Impression conclusion. |
| **MedicationOrder** | `MedicationRequest`| Intent `order`, Medication concept (RxNorm / WHO EML), Dosage instructions, Prescriber reference. |
| **DispenseRecord** | `MedicationDispense`| Status (`completed`), Authorizing prescription reference, Performer reference, Inventory batch extension. |
| **Referral** | `ServiceRequest` + `Task` | Dual representation: clinical service request + inter-facility fulfillment workflow task. |
| **EmergencyCase** | `Encounter` + `Observation` | Encounter (class `EMER`) + Triage score observation (SATS score, category) + emergency task. |
| **ClinicalNote** | `DocumentReference` | LOINC `11488-4`, Plain text / UTF-8 base64 attachment, Signed status. |
| **ProvenanceRecord**| `Provenance` | Target reference, Recorded timestamp, Agent attribution, Facility extension. |

---

## 2. Field Transformation Details

### 2.1 Patient Mapping
- `patient.mrn` -> `Patient.identifier[system='http://jano.health/fhir/identifier/mrn', use='official']`
- `patient.primaryFacilityId` -> `Patient.extension[url='http://jano.health/fhir/StructureDefinition/facility-id']`
- `patient.gender` -> `Patient.gender` (`male`, `female`, `other`, `unknown`)

### 2.2 Vitals & Observations
- Multi-component VitalSign entities are decomposed into conformant atomic FHIR Observations:
  - **Body Temperature**: LOINC `8310-5`, Unit `Cel` (UCUM), display `Body temperature`
  - **Heart Rate**: LOINC `8867-4`, Unit `/min` (UCUM), display `Heart rate`
  - **Respiratory Rate**: LOINC `9279-1`, Unit `/min` (UCUM), display `Respiratory rate`
  - **Blood Pressure Panel**: LOINC `85354-9`
    - Systolic component: LOINC `8480-6`, Unit `mm[Hg]`
    - Diastolic component: LOINC `8462-4`, Unit `mm[Hg]`
  - **Oxygen Saturation**: LOINC `59408-5`, Unit `%`
  - **Weight**: LOINC `29463-7`, Unit `kg`
  - **Height**: LOINC `8302-2`, Unit `cm`

### 2.3 Diagnostic Reports & Studies
- **Specimens**: Specimen accession numbers are preserved strictly in `Specimen.accessionIdentifier` to prevent collision with FHIR logical IDs.
- **Radiology**: `ImagingStudy` captures modality, series number, and study descriptions. Raw DICOM files or heavy images are linked via endpoints and never embedded directly in the JSON resource.

### 2.4 Emergency Presentation
- Standard FHIR R5 does NOT define an "EmergencyCase" resource type.
- Creating non-standard synthetic resources breaks external HIE integration.
- Jano maps an Emergency Presentation to:
  1. `Encounter` with `class` = `EMER` (`http://terminology.hl7.org/CodeSystem/v3-ActCode`).
  2. `Observation` with category = `survey` capturing South African Triage Scale (SATS) score, triage urgency category, and vitals.
  3. `Task` representing emergency disposition and transport coordination.
