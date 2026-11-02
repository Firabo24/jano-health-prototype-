# Jano Health - FHIR R5 (5.0.0) Interoperability Architecture

## 1. Executive Summary

Jano Health Clinical Core V11 provides an authoritative, enterprise-grade **FHIR R5 (Release 5.0.0)** data exchange subsystem. Designed specifically for low-resource and bandwidth-constrained distributed healthcare environments, the implementation balances international standards compliance with strict offline-first operational resilience, robust identity reconciliation, and multi-tenant facility isolation.

---

## 2. Technical Conformance & Specifications

| Property | Value |
| :--- | :--- |
| **FHIR Version** | `5.0.0` (FHIR R5) |
| **Canonical MIME Type** | `application/fhir+json; fhirVersion=5.0.0` |
| **Alternative MIME Type**| `application/json` |
| **Conformance Statement**| `GET /fhir/metadata` |
| **Base URI** | `http://jano.health/fhir` |
| **Default Encoding** | UTF-8 JSON |
| **Max Transaction Size** | 100 Resources per Bundle |
| **Default Page Size** | 20 entries (configurable up to 50) |

---

## 3. Endpoints & RESTful Capabilities

### 3.1 Conformance Metadata (`GET /fhir/metadata`)
- Returns the complete `CapabilityStatement` declaring all supported resources, interactions, search parameters, and security policies.
- Publicly accessible to enable automated client discovery and conformance auditing.

### 3.2 Patient Record Export (`GET /fhir/Patient/:id/$everything`)
- Produces a comprehensive, patient-scoped FHIR Bundle (`type: collection`) comprising:
  - `Patient` (demographics, official MRN, national ID)
  - `Encounter` (outpatient, inpatient, emergency episodes)
  - `Observation` (vital signs, physical measurements, atomic lab results)
  - `Condition` (active problems, working diagnoses, confirmed ICD-10 findings)
  - `AllergyIntolerance` (manifestations, criticality, substance categories)
  - `ServiceRequest` (diagnostic orders, clinical referrals)
  - `MedicationRequest` & `MedicationDispense` (orders and pharmacy dispense records)
  - `DiagnosticReport` & `ImagingStudy` (lab and radiology reports with metadata)
  - `DocumentReference` (clinical notes and narrative consultations)
  - `Provenance` (cryptographic and actor attribution of the export)
- Requires valid bearer authentication and facility access authorization.

### 3.3 Resource Read (`GET /fhir/:resourceType/:id`)
- Reads a single resource by its canonical logical ID.
- Resolves local Jano aggregate identifiers or mapped external identifiers.

### 3.4 Resource Search (`GET /fhir/:resourceType`)
- Parameterized search supporting token, reference, date, and string queries:
  - `Patient`: `_id`, `identifier`, `name`, `birthdate`, `gender`, `facility`
  - `Observation`: `patient`, `category`, `code`, `date`
  - `Condition`: `patient`, `clinical-status`, `code`
  - `DiagnosticReport`: `patient`, `category`
- Automatically enforces server-side pagination with `total` counts and navigation links.

### 3.5 Bundle Transaction & Batch (`POST /fhir`)
- Ingests multi-resource bundles for atomic transaction execution or batch synchronization.
- Fails closed: If any entry in a `transaction` bundle fails schema validation or tenant authorization, the entire batch is rolled back.

### 3.6 Single Resource Creation (`POST /fhir/:resourceType`)
- Ingests inbound clinical resources (e.g. `Patient`, `Condition`, `Observation`, `AllergyIntolerance`).
- Executes the full 10-step ingestion pipeline before committing state to local storage.

---

## 4. Architectural Invariants

1. **Anti-Auto-Merge Policy**: Ambiguous MPI matches return `PENDING_IDENTITY_RECONCILIATION` or `IDENTITY_CONFLICT`. Under no circumstances does the engine guess or silently merge medical records.
2. **Zero Autonomous AI Actions**: Inbound FHIR resources never trigger autonomous prescribing, dispensing, or unverified clinical modifications.
3. **No Code Fabrication**: Unknown clinical codes return `UNMAPPED` with source system preserved.
4. **Standard FHIR Resources**: No synthetic resources (e.g. "EmergencyCase"). Emergency care maps strictly to `Encounter` (class `EMER`), `Observation` (triage score), and `Task`.
