# Jano Health - FHIR R5 Ingestion & Export Pipelines

This document details the step-by-step processing pipelines for inbound and outbound FHIR R5 data exchange.

---

## 1. The Ingestion Pipeline (Inbound FHIR)

```
[External Payload]
       │
       ▼
 1. Authenticate Source System & Verify Facility Whitelist
       │
       ▼
 2. Validate FHIR R5 Schema, Structure & Invariants
       │
       ▼
 3. Identity Reconciliation (Deterministic vs Ambiguous vs New)
    ├── Ambiguous? ──► Quarantine as PENDING_IDENTITY_RECONCILIATION
    └── Confirmed / New ──► Continue
       │
       ▼
 4. Validate & Normalize Terminology (ICD-10, LOINC, UCUM)
       │
       ▼
 5. Establish Provenance (Source system, external ID, timestamp)
       │
       ▼
 6. Map to Domain Command Objects
       │
       ▼
 7. RBAC & Facility Boundary Authorization
       │
       ▼
 8. Atomic Transaction Execution into Local Repository
       │
       ▼
 9. Append Cryptographic Audit Event to Hash-Chained Ledger
       │
       ▼
10. Return FHIROperationOutcome / HTTP Status
```

---

## 2. The Export Pipeline (Outbound FHIR)

```
[Client / External GET Request]
       │
       ▼
 1. Authenticate Requesting Principal
       │
       ▼
 2. Evaluate Clinical Privacy Policy (Purpose of Use, Break-Glass)
       │
       ▼
 3. Enforce Multi-Tenant Facility Isolation Boundary
       │
       ▼
 4. Query Domain Aggregates from Local Repository
       │
       ▼
 5. Map Aggregates to FHIR R5 Standard Resources (via FHIRMapper)
       │
       ▼
 6. Attach FHIR Provenance Resource
       │
       ▼
 7. Assemble Standards-Compliant Bundle (type: collection or searchset)
       │
       ▼
 8. Append Audit Event to Tamper-Evident Ledger
       │
       ▼
 9. Return Payload with Content-Type: application/fhir+json
```
