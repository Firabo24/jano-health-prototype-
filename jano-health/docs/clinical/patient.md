# Clinical Domain: Patient Identity & Master Patient Index (MPI)

## 1. Overview
In Jano Health, the Patient aggregate is the authoritative root of the clinical record. Because the system operates in offline-first, intermittent-connectivity, and disaster-response environments, patient identification and identity reconciliation cannot rely solely on online central server lookups.

## 2. Medical Record Number (MRN) Architecture
The Medical Record Number (MRN) is generated deterministically at the edge without requiring server round-trips, while guaranteeing global uniqueness and collision resistance:

```
[FACILITY_CODE]-[TIMESTAMP_BASE36]-[DEVICE_SIGNATURE]-[CHECKSUM]
Example: KIG-1H4J9L2-3X9-K
```

- **Facility Code**: 3-4 alphanumeric uppercase characters designating the originating health center (e.g. `KIG` for Kigoma District Hospital).
- **Timestamp Base-36**: Monotonic millisecond timestamp encoded in base-36, ensuring chronological sorting.
- **Device Signature**: 3-character base-36 hash derived from the device hardware fingerprint and station ID (`deriveDeviceSignature`), preventing collision between concurrent offline registrations across tablets or workstations.
- **Modulo-36 Luhn-Variant Checksum**: Single base-36 digit calculated over the preceding characters to detect manual transcription, typos, or digit transpositions.

## 3. Demographics and Name Conventions
To accommodate diverse naming traditions, Jano Health implements dual naming models:
- Canonical given and family names: `givenName`, `middleName`, `familyName`, `preferredName`.
- Backwards-compatibility aliases: `firstName`, `lastName`.
- Flexible Date of Birth precision:
  - `EXACT`: Full YYYY-MM-DD.
  - `MONTH_YEAR`: Approximate YYYY-MM (e.g. when patient knows month and year).
  - `YEAR_ONLY`: Approximate YYYY (e.g. estimated age in elder patients or emergency intake).
  - `UNKNOWN`: With estimated age in years.

## 4. Patient Status Lifecycle
Patient records transition through well-defined lifecycle states:
- `ACTIVE`: Normal clinical care active in facility or community.
- `INACTIVE`: Transferred out, lost to follow-up, or archived.
- `DECEASED`: Clinically verified death, requiring `deceasedAt` ISO timestamp and attending clinician audit.
- `MERGED`: Duplicate record retired in favor of a surviving master chart. The record retains all historical data, links to `mergedIntoPatientId`, and is locked against future clinical documentation or status modification.

## 5. Security & PHI Minimization
- Patient data is strictly scoped to the patient's primary facility or authorized referral facilities.
- Audit logs record all reads (`PATIENT_VIEWED`), searches (`PATIENT_SEARCHED`), mutations (`PATIENT_DEMOGRAPHICS_UPDATED`), and status changes.
- In accordance with PHI minimization standards, audit payloads and logs never store unencrypted or extraneous patient demographic blobs.
