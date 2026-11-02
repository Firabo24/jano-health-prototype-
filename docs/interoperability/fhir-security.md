# Jano Health - FHIR R5 Security & Privacy Controls

This document details the multi-layered security controls governing the Jano FHIR R5 Interoperability Subsystem.

---

## 1. Authentication & Authorization Architecture

1. **Bearer Token Authentication**:
   - All FHIR operations (except `GET /fhir/metadata`) require an authenticated principal (`Bearer <token>` or session identity).
   - Unauthenticated requests are rejected with HTTP 401 and an `OperationOutcome`.

2. **Role-Based Access Control (RBAC)**:
   - Data exchange privileges are restricted by clinical role:
     - `physician`, `health_officer`: Full clinical export, import, diagnosis, order, note creation.
     - `nurse`, `midwife`: Vital signs observation, encounter status updates, clinical triage.
     - `pharmacist`: Medication dispense reading and creation.
     - `laboratory_staff`: Laboratory specimen, observation, and diagnostic report creation.
     - `radiology_staff`: Imaging study and radiology diagnostic report creation.
     - `facility_administrator`, `system_administrator`: Full administrative and audit access.

3. **Multi-Tenant Facility Boundary Isolation**:
   - Every read and export request enforces tenant facility boundaries.
   - Patients registered at Facility A cannot be accessed by clinicians at Facility B without explicit cross-facility emergency break-glass authorization (`purposeOfUse=EMERGENCY`).

---

## 2. Anti-SSRF (Server-Side Request Forgery) Guard

To safeguard the local deployment environment against external network manipulation:
- Inbound and outbound partner systems are whitelisted through the `ExternalSystemRegistry`.
- URLs resolving to loopback addresses (`127.0.0.1`, `localhost`), link-local metadata IP (`169.254.169.254`), or private network subnets in production mode are blocked immediately.
- Only registered protocols (`http:`, `https:`) are permitted.

---

## 3. Identity Reconciliation & Anti-Auto-Merge Policy

When ingesting external Patient resources:
1. **Deterministic Match (Score >= 0.95)**:
   - Same official National ID or MRN + identical birthdate + name match.
   - Reconciled with existing Jano aggregate.
2. **Ambiguous Match (Score 0.50 - 0.94)**:
   - Matching name and birthdate, but conflicting phone, address, or facility registration.
   - System flags as `PENDING_IDENTITY_RECONCILIATION`.
   - **Auto-merging is strictly prohibited.** Data is quarantined pending clinician or records clerk manual verification.
3. **No Match (Score < 0.50)**:
   - New patient aggregate created with source system provenance.

---

## 4. Cryptographic Provenance & Tamper-Evident Ledger

- Every outbound export and inbound mutation generates an audit event recorded in the tamper-evident hash-chained ledger.
- Exported bundles attach a FHIR `Provenance` resource documenting:
  - Exporting practitioner (`agent.who`)
  - Exporting facility (`agent.onBehalfOf`)
  - Purpose of Use (`activity.coding`)
  - Target resources referenced.
