# Security Architecture: Role-Based Access Control (RBAC) & Boundaries

## 1. Authorization Philosophy
Frontend UI visibility toggles are treated strictly as ergonomic conveniences. The authoritative authorization boundary is enforced at the domain service layer (`patientService.ts`), persistence layer (`localRepository.ts`), and server API layer.

Every sensitive operation requires:
- An `AuthenticatedPrincipal` with non-empty identity and verified role.
- Fine-grained capability checks via `canUserPerform(principal, capability)`.
- Tenant / facility scope verification (`principal.facilityId === targetFacilityId` or role is `system_administrator`).

## 2. Canonical Clinical Roles & Capability Matrix

| Role | Description | Core Capabilities |
|---|---|---|
| `doctor` | Attending physician | Clinical chart access, diagnosis recording, clinical notes, lab/radiology ordering, medication prescribing, patient status transitions |
| `nurse` | Bedside nurse / Triage | Triage urgency, vital signs recording, bedside nursing notes, medication administration logging |
| `receptionist` / `registration_clerk` | Patient intake | Patient registration, demographic updates, duplicate search & review, merge execution |
| `pharmacist` | Pharmacy dispensary | Medication dispensing, prescription verification, inventory audit |
| `lab_technician` | Diagnostic laboratory | Lab order retrieval, specimen logging, lab result entry & validation |
| `radiologist` / `radiographer` | Diagnostic imaging | Radiology worklist, scan image capture, radiology diagnostic reporting |
| `facility_administrator` | Hospital administrator | Facility operational oversight, user assignment, compliance audits, patient deduplication approval |
| `system_administrator` | System engineer | Cross-facility system governance, cryptographic audit verification, synchronization maintenance |

## 3. Capability Normalization
To bridge legacy dot-notation (`patient.create`) and colon-notation (`patient:create`), `canUserPerform` normalizes all capability tokens before evaluation, guaranteeing seamless authorization across both code conventions.
