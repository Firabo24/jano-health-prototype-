# Jano Health - System Architecture (Foundation v1.1 Hardened)

## 1. Executive Summary

Jano Health is an offline-first, enterprise Electronic Health Record (EHR) and Clinical Decision Support platform engineered specifically for low-resource environments, rural dispensaries, district hospitals, and mobile outreach units.

The system is architected around a non-negotiable mandate: **clinical workflows must never halt, lose data, or corrupt records when cellular and local network connectivity is completely severed.**

---

## 2. Core Architectural Pillars

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Jano Health Workspace UI                        │
│          (16 Clinical & Operational Modules: Triage, EHR, etc.)        │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Clinical Workflow & Security Boundary                 │
│         - Role-Based Access Control (RBAC) Permissions                 │
│         - Facility Boundary Enforcement (Tenant Isolation)             │
│         - Pluggable Auth Adapter (Local Dev / Firebase Auth)           │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Atomic Clinical Transaction Manager                      │
│   Executes ACID mutations across local persistence:                   │
│   ├── Target Store Mutation (Patients, Encounters, Meds, etc.)        │
│   ├── Append-Only Event Store (SHA-256 Hash Chain)                    │
│   ├── Tamper-Evident Audit Trail (Actor, Facility, Cryptographic Hash) │
│   └── Persistent Outbox Sync Queue (Pending Push Queue)                │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Durable Synchronization Engine                    │
│   ├── Push Synchronization (Atomic batch push with retry backoff)      │
│   ├── Pull Synchronization (Cursor-based incremental catch-up)         │
│   └── Deterministic Conflict Resolver (UUIDv7 conflict isolation)      │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                         (HTTP / REST / Firestore)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Authoritative Server Ledger                           │
│   - Global Monotonic Sequence & Aggregate Versioning                   │
│   - Idempotent Event Deduplication                                     │
│   - Cross-Facility Multi-Tenant Isolation Verification                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage & Event Sourcing

### 3.1 Local Storage
- **IndexedDB**: The primary client-side persistent storage, structured into isolated object stores:
  - `patients`, `encounters`, `vitals`, `diagnoses`, `medications`, `lab_orders`, `lab_results`, `radiology_orders`, `radiology_results`, `appointments`, `referrals`, `emergency_cases`, `ai_requests`
  - `event_store` (all generated domain events)
  - `sync_queue` (pending events awaiting cloud upload)
  - `audit_trail` (tamper-evident immutable audit logs)
  - `sync_conflicts` (divergent concurrent mutations preserved for audit and resolution)
  - `facility_config` / `system_metadata`

### 3.2 Cryptographic Event Hash Chaining
Every domain event is sealed with a SHA-256 cryptographic digest computed over canonical JSON representation:
- **`computeEventHash(event, previousEventHash)`**: Enforces strict tamper-evidence. Any client or malicious script attempting to alter a patient's historical diagnoses or allergies invalidates the subsequent event chain and triggers immediate verification failure (`verifyEventChain`).
- **`verifyAuditTrailIntegrity(auditLogs)`**: Verifies that the audit trail has not been retroactively deleted or modified.

---

## 4. Synchronization Protocol

### 4.1 Push Synchronization
- Events generated while offline remain queued in `sync_queue` with status `PENDING`.
- Upon network restoration or explicit trigger, batches of events are transmitted to the cloud repository.
- Each event is transmitted with client timestamps, device IDs, and aggregate versions.

### 4.2 Pull Synchronization
- Utilizes an opaque cursor (`lastPulledCursor`) tracking the server ledger's high-water mark.
- When reconnected, the client polls `pullSync(cursor, limit)` to ingest changes recorded by other mobile units or hospital workstations.
- Replayed events update local state idempotently.

### 4.3 Conflict Resolution
- When a client attempts to commit version $V$ but the server has already committed version $V' \ge V$, a conflict is generated.
- Conflicts are isolated into `sync_conflicts` with deterministic UUIDv7 identifiers.
- Default resolution policy allows clinician-in-the-loop review or deterministic last-write-wins with complete audit history retention.

---

## 5. Security and Tenant Isolation

### 5.1 Facility Boundaries
- Every mutation and audit entry is stamped with the operational `facilityId`.
- The server validates that the active user possesses credentials for the designated facility (`serverLedger.verifyFacilityAccess`).
- Cross-facility data leakage is strictly blocked at both client query and server middleware layers.

### 5.2 Pluggable Authentication Adapter
- **`IAuthAdapter`**: Decouples UI authentication from the identity provider.
- **`LocalDevelopmentAuthAdapter`**: Zero-configuration offline mode for disconnected rural installations and development testing.
- **`FirebaseAuthAdapter`**: Production-ready binding for Firebase Authentication, retaining offline cached session capabilities.

---

## 6. Jano AI Safety & Decision Support Boundaries

Jano AI is strictly designed as a **Clinical Decision-Support System (CDSS)**:
1. **Gemini Model Configuration**:
   - Primary model: `gemini-3.8-flash`
   - Fallback model: `gemini-3.7-flash` (strictly reserved for appropriate transient network/availability issues; fails closed on authentication, permission, and validation errors)
   - Structured JSON output with schema adherence validation
   - Deprecated sampling parameters (`temperature`, `top_p`, `top_k`) removed in favor of system prompts, schema constraints, and grounding.
2. **Zero Autonomous Actions**: Jano AI is architecturally prohibited from creating prescriptions, finalizing diagnoses, or placing medical orders autonomously (`isAutonomousMutationAllowed: false`).
3. **Mandatory Human Verification**: Every recommendation requires explicit review and execution by a licensed clinician (`clinicianReviewRequired: true`, status `PENDING_CLINICIAN_REVIEW`).
4. **Graceful Offline Degradation & Provenance**: When offline or if cloud services are unconfigured, Jano AI provides verified WHO and National Standard Treatment Guidelines (NSTG) deterministic protocols with transparent provenance (`source: 'standard_treatment_guidelines'`, `deterministic: true`).
5. **Secure Cloud Proxy & Real Clinician Audit**: Gemini API requests route through the backend proxy (`/api/ai/clinical-assist`), requiring authenticated credentials. The authenticating clinician identity is immutably logged in the audit trail (no hardcoded fallback identity).

---

## 7. Verification & Hardening Suites

The codebase includes five comprehensive automated verification suites (68 total passing tests) run via `npm test`:

1. **`test/offline-persistence-resilience.test.ts`** (15 Resilience Scenarios):
   - Online/offline patient creation and updating
   - Encounter creation and sequencing
   - Multi-event offline queueing and batched synchronization
   - Exponential retry backoff on intermittent networks
   - Strict idempotency on duplicate event delivery
   - Concurrency conflict detection and resolution
   - Facility isolation and RBAC authorization rejection

2. **`test/failure-recovery-resilience.test.ts`** (15 Production Failure Scenarios):
   - Browser crash and mid-mutation transaction rollback
   - Network drop during synchronization
   - Packet loss after server acceptance
   - Duplicate event submission and deduplication
   - Server restart with durable ledger preservation
   - Multi-device concurrent modification isolation
   - Seamless offline facility context transitions
   - Unauthorized facility access rejection
   - IndexedDB quota and storage failure resilience
   - Explicit retry triggers (`retryNow`)
   - Cursor-based pull synchronization and missing-cursor recovery
   - Cryptographic event chain tamper detection
   - Cryptographic audit log tamper detection

3. **`test/security-hardening.test.ts`** (19 Security & Resilience Hardening Tests):
   - Primary model verification (`gemini-3.8-flash`)
   - Fallback model verification (`gemini-3.7-flash`)
   - Non-retryable error fail-closed handling
   - Deprecated sampling parameter removal
   - Structured AI response schema validation
   - Production auth adapter fail-closed guarantee (no silent dev fallback)
   - Development auth isolation and warning flags
   - Rejection of unauthenticated requests relying only on `x-user-id`
   - Strict facility access fail-closed for unknown users
   - Cross-facility access boundary rejection
   - Server-authoritative aggregate versioning and anti-override
   - Strict push idempotency without ledger corruption
   - Monotonic pull cursor tracking and cursor separation
   - Events transition to `SYNCED` strictly upon server acknowledgment
   - AI request identifier UUIDv7 format validation
   - Real clinician audit identity recording in AI audit trails
   - Clinical safety boundary (unapproved until clinician review, zero autonomous mutation)
   - Offline clinical rule governance and deterministic provenance
   - State reset endpoint permanently disabled in production; diagnostics restricted without PHI exposure

4. **`test/multi-role-security.test.ts`** (9 Multi-Role & RBAC Access Control Tests):
   - Canonical demo users match `getRoleCapabilities`
   - Doctor clinical capabilities and boundaries
   - Nurse triage and bedside recording boundaries
   - Pharmacist dispensary boundary
   - Laboratory Technician result entry boundary
   - Radiographer reporting boundary
   - Facility Administrator governance boundary
   - Dual-notation normalization in `canUserPerform`
   - Production auth fail-closed on unauthorized requests

5. **`test/clinical-core-patient.test.ts`** (10 Clinical Core V1 Identity & Lifecycle Tests):
   - MRN generation format, device isolation, and Modulo-36 Luhn-variant checksum
   - Multi-signal duplicate detection scoring and fuzzy Levenshtein matching
   - Authoritative registration pipeline with atomic transactions, domain events, and audit trail
   - Role-based capability rejection for unauthorized roles (fail-closed)
   - Cross-facility tenant isolation boundary enforcement
   - Duplicate registration interception and mandatory clinical justification override
   - Demographic updates, version incrementing, and audit logging
   - Patient lifecycle transitions (ACTIVE -> DECEASED with timestamp and attending audit)
   - Deduplication record merge (surviving chart preservation, duplicate retirement and lock)
   - Longitudinal timeline event aggregation across clinical encounters and cryptographic hashes

---

## 8. Clinical Core V1: Patient Identity & Longitudinal Record

### 8.1 Master Patient Index (MPI) & Identity Resilience
- Offline-safe deterministic Medical Record Number (MRN) generation with facility code, millisecond epoch, device signature, and Modulo-36 Luhn-variant checksum.
- Multi-tier duplicate matching with exact National ID, phone + DOB, normalized name + DOB, and fuzzy string similarity.
- Strict duplicate override requirement with mandatory clinical justification logged immutably.

### 8.2 Longitudinal Patient Workspace
- Multi-tab clinical workspace (`PatientChartModal`): Demographics, Longitudinal Timeline, Deduplication Merge, Clinical Documentation.
- Chronologically aggregated longitudinal patient history combining encounters, vitals, clinical notes, medications, diagnoses, and lab results.
- Verification of SHA-256 event integrity hash for every entry on the patient timeline.
- Fail-closed clinical safety checks preventing documentation on retired/merged records.

---

## 9. Clinical Core V6: Medication Order, Prescription & Clinical Safety Foundation

### 9.1 Authoritative Medication Data Model
- Decouples clinical prescribing intent (`MedicationOrder`) from legal dispensary fulfillment (`Prescription`).
- Deterministic offline identifier generation:
  - `MedicationOrderNumber`: `ORD-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]` with Modulo-36 checksum.
  - `PrescriptionNumber`: `RX-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]` with Modulo-36 checksum.
- Cryptographic SHA-256 tamper-evident digital signature seal on all issued prescriptions (`signatureHash`), verified via `verifyPrescriptionSeal()`.

### 9.2 Real-Time Clinical Decision Support & Safety Engine (`MedicationSafetyService`)
- Multi-factor safety checks:
  - Drug-allergy and beta-lactam / penicillin cross-reactivity.
  - Drug-drug interactions (e.g. Warfarin + NSAIDs, ACEI + Potassium-sparing diuretics, Quinolone + NSAIDs).
  - Duplicate therapy detection for active overlapping therapeutic classes.
  - Physiological contraindications (pediatric age bounds, pregnancy).
- Strict clinical guard: AI agents are strictly forbidden from creating or issuing medication orders.
- Absolute contraindications block ordering unless a licensed physician provides an explicit written override (`ACKNOWLEDGE_AND_CONTINUE`).
- Unclassified compounds explicitly yield `KNOWLEDGE_UNAVAILABLE` to maintain fail-safe transparency.

### 9.3 Pharmacy Dispense & Versioned Amendment Lifecycle
- Pharmacy dispense workflow captures manufacturer batch attribution (`batchNumber`), dispensed quantity, and pharmacist counseling notes under `pharmacy:dispense` capability.
- Full order lifecycle: `ACTIVE`, `HELD`, `DISCONTINUED`, `COMPLETED`, `CANCELLED`.
- Versioned prescription amendment: Prescriptions are immutable once issued; modifications generate incremented versions with audit lineage and refreshed cryptographic seals.
- Legacy `Medication` projection is maintained for backwards compatibility and can be migrated using `MedicationService.migrateLegacyMedications()`.

---

## 10. Clinical Core V15: Identity, Consent & Health Financing Foundation

### 10.1 Longitudinal Person Identity Architecture
- **Person vs. Patient Partitioning**: The person exists across multiple health systems and time, while a local patient chart is anchored to a specific facility context.
- **`LongitudinalIdentity` & Provenance**: Deterministic `lid_` identifier, facility links, external identity linkages (e.g. DHIS2, national registry), cryptographic integrity hash, and version lineage.
- **Fail-Closed Verification Lifecycle**: States progress monotonically (`PROVISIONAL` -> `VERIFIED` -> `SUSPENDED` -> `RETIRED`). Transitions from the terminal `RETIRED` state are strictly blocked.
- **Anti-Auto-Merge Protection**: Ambiguous demographic and biometric matches are automatically isolated into an administrative quarantine queue requiring multi-role human clinician review.
- **National Identity Adapter**: Fails closed when offline or unconfigured (`NOT_CONFIGURED`), returning transparent adapter status with zero synthetic identity fabrication.

### 10.2 Consent Directives & Security Policy Engine
- **Granular Purpose Scoping**: Consent directives strictly partition clinical care (`DIRECT_CARE`), clinical audit (`AUDIT`), population health analytics (`RESEARCH` / `POPULATION_HEALTH`), emergency access (`EMERGENCY`), and cross-facility network transfer (`REFERRAL` / `TRANSFER`).
- **Fail-Closed Evaluation**: In the absence of an explicit active consent directive, access to sensitive clinical and financing records is denied by default (`MISSING CONSENT ≠ CONSENTED`).
- **Revocation Cut-off**: Immediate invalidation of downstream queries and cross-facility network exchanges upon status transition to `REVOKED`.
- **Emergency Break-Glass Override**: Licensed clinicians may override consent restrictions during life-threatening emergencies (`EMERGENCY_ALLOWED`), logging a tamper-evident cryptographic audit trace with mandatory clinical justification.

### 10.3 Health Financing, Eligibility & Financial Ledger
- **Clinical vs. Financial Separation**: Hard architectural invariant. Care delivery, emergency stabilization, and clinical records are never halted, denied, or modified by coverage denial, payer downtime, or lack of payment.
- **Offline-First Eligibility Engine**: Cached eligibility verification enables offline patient registration and billing estimation with explicit `OFFLINE_LOCAL_CACHE` provenance.
- **Prior Authorization & Claims Workflow**: End-to-end support for authorizations (`auth_`), itemized claims (`clm_`), clearinghouse submission, adjudication (`PAID`, `DENIED`, `PARTIAL`), patient copay responsibility calculation, invoices (`inv_`), and receipts (`pmt_`).
- **Non-Destructive Corrections**: Superseded claims retain audit lineage via `-CORR` suffixes and parent references; historical claims are marked `VOIDED` without destructive deletion.
- **Financial Reconciliation Engine**: Deterministic reconciliation of invoices, claims, receipts, reversed transactions, and banking settlement references (`MATCHED`, `PARTIAL`, `CONFLICT`, `REVERSED`).
- **Tamper-Evident Ledger**: Append-only cryptographic event hash chain securing financial transactions against replay and modification.

### 10.4 FHIR R5 Mappings & Population Analytics
- **FHIR R5 Resources**: Fully conformant bidirectional mapping for `Consent`, `Coverage`, `Claim`, `ClaimResponse`, `Invoice`, `PaymentNotice`, `Account`, and `ExplanationOfBenefit`.
- **OperationOutcome Validation**: Strict conformance validation returning standard `OperationOutcome` diagnostic issues.
- **Differential Privacy & Micro-Cell Suppression**: Analytical reporting engines automatically suppress small cohorts ($N < 5$) to prevent re-identification of patients in financial and coverage metrics.

---

## 11. Master Architectural Roadmap & Future Boundaries (V16–V20)

### V16 — Workforce & Care Operations
- **Scope**: Staff credentialing, duty rosters, shift handover notes, and care team assignments.
- **Extension Contracts**: Defined in `src/domain/v16WorkforceTypes.ts` (`StaffCredential`, `DutyRoster`, `ShiftHandover`, `CareTeamAssignment`).
- **Invariants**: 
  - Clinical credentials must be verifiable offline against local cryptographic store.
  - Staff rosters cannot unilaterally override licensing authority.
  - AI decision support cannot make autonomous workforce disciplinary or scheduling decisions.

### V17 — Supply Chain, Procurement & Logistics Intelligence
- **Scope**: Requisitions, purchase orders, cold-chain monitoring, vaccine vials, and regional replenishment.
- **Extension Contracts**: Defined in `src/domain/v17SupplyChainTypes.ts` (`Requisition`, `PurchaseOrder`, `ShipmentConsignment`, `ColdChainLog`).
- **Invariants**: 
  - Dispense inventory transactions remain authoritative; procurement and shipments are strictly ledgered before stock adjustments.
  - Expired or damaged stock quarantined immediately with dual-signature verification.

### V18 — Research, Evidence & Learning Infrastructure
- **Scope**: Anonymized clinical trial cohorts, secondary research consent, registry data extraction, and clinical trial matching.
- **Extension Contracts**: Defined in `src/domain/v18ResearchTypes.ts` (`ResearchStudyProtocol`, `ResearchCohortDefinition`, `EvidenceSynthesis`).
- **Invariants**: 
  - Primary patient care data and secondary research datasets remain strictly partitioned.
  - Secondary research requires explicit consent directive (`RESEARCH`); general care consent never implies research participation.

### V19 — National Digital Health Integration & Ecosystem Interoperability
- **Scope**: National Health Information Exchanges (HIE), Master Facility Registry (MFR), National Terminology Services, and Public Health Registries.
- **Extension Contracts**: Defined in `src/domain/v19NationalEcosystemTypes.ts` (`NationalHIEExchangeGateway`, `NationalTerminologyBinding`, `DiseaseSurveillanceNotification`).
- **Invariants**: 
  - Fail-closed adapter architecture: downtime or network failure of national endpoints never degrades local facility clinical capabilities.
  - Strict anti-SSRF and payload validation on all external endpoints.

### V20 — Jano Health System Intelligence & Autonomous Operations Governance
- **Scope**: Self-healing synchronization, cross-facility capacity balancing, autonomous operational anomalies detection, and platform governance audit.
- **Extension Contracts**: Defined in `src/domain/v20SystemIntelligenceTypes.ts` (`SystemAutonomousPolicy`, `AutonomousExecutionAudit`, `CapacityBalancingProposal`).
- **Invariants**: 
  - Hard clinical guard: Autonomous operations are strictly limited to technical infrastructure and logistics. Autonomous clinical interventions or medical diagnostic decisions are prohibited.
  - Every autonomous proposal or adjustment maintains full cryptographic provenance and reversibility.


