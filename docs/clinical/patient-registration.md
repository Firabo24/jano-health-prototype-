# Clinical Domain: Patient Registration & Duplicate Detection Pipeline

## 1. Registration Pipeline Architecture
Patient registration in Jano Health is an authoritative clinical pipeline executing through deterministic stages:

```
[UI Registration Form]
         │
         ▼
[Authenticated Principal Verification]
         │
         ▼
[RBAC Capability Check (patient.create)]
         │
         ▼
[Facility Tenant Scope Check]
         │
         ▼
[Clinical Validation (Names, DOB precision, Identifiers)]
         │
         ▼
[Multi-Tier Duplicate Detection Engine (Levenshtein + Signals)]
    ├── Match Score >= 65 & No Override -> [HALT: Duplicate Candidate Modal]
    └── Match Score >= 65 & With Override -> [Enforce Clinical Justification]
         │
         ▼
[Deterministic MRN Generation (Offline-Safe, Device-Isolated, Modulo-36 Checksum)]
         │
         ▼
[Atomic Local Persistence (IndexedDB + Memory Cache)]
         │
         ▼
[Append-Only Domain Event (PatientRegistered with SHA-256 Hash)]
         │
         ▼
[Audit Log Entry (PATIENT_REGISTERED, Actor, Facility, Non-PHI payload)]
         │
         ▼
[Outbox Sync Queue Enqueue (SyncEngine)]
```

## 2. Duplicate Detection Engine
To prevent duplicate patient records in low-resource settings without connectivity:
- **Exact National ID**: Score = 100 (HIGH confidence).
- **Exact Phone + Exact Date of Birth**: Score = 95 (HIGH confidence).
- **Normalized Name + Exact Date of Birth**: Score = 85 (HIGH confidence).
- **Normalized Name + Exact Phone**: Score = 75 (MEDIUM confidence).
- **Normalized Name + Same Village/Locality**: Score = 60 (MEDIUM confidence).
- **Fuzzy Name Similarity (Levenshtein edit distance >= 82%)**: Score up to 75 (MEDIUM/LOW confidence).

If a candidate scores >= 65%, the registration pipeline intercepts the workflow and presents candidate records to the registrar. Overriding requires an explicit clinical justification (minimum 3 characters), which is permanently recorded in the immutable audit log and domain event.

## 3. Merge & Deduplication Protocol
When duplicate records are discovered:
1. **Surviving Master Chart Selected**: Retains canonical identity and receives merged clinical encounters, notes, and vitals.
2. **Duplicate Record Retired**:
   - Status updated to `MERGED`.
   - `mergedIntoPatientId` set to surviving patient ID.
   - Record locked against further clinical modifications or status transitions.
3. **Audit & Event Sourcing**: A `PatientMerged` domain event and `PATIENT_MERGED` audit trail record are permanently stored.
