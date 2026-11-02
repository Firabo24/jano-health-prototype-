# Clinical Domain: Medication Orders (MedicationOrder)

## 1. Overview
A `MedicationOrder` represents the clinical prescriber's therapeutic intent and authorization for a specific medication regimen. It records the diagnostic indication, dosing parameters, route, schedule, duration, and safety review state.

## 2. Order Number Architecture
Medication order numbers are generated deterministically at the edge without requiring server round-trips:

```
ORD-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]
Example: ORD-AMGH-20260913-F1P-00018
```

- **Prefix**: Canonical `ORD-` prefix.
- **Facility**: 3-4 alphanumeric uppercase facility identifier.
- **Date**: Gregorian calendar date `YYYYMMDD`.
- **Device**: 3-character base-36 hardware hash from device signature.
- **Sequence**: Monotonic 4-digit sequence per facility and calendar day.
- **Modulo-36 Luhn-Variant Checksum**: Check digit detecting transcription errors and transpositions during verbal or manual transfers.

## 3. Prescribing Safeguards & RBAC
- **Strict Prescriber Guard**: AI agents (`userRole: 'ai_assistant'`) are strictly blocked from authoring or issuing medication orders. Only licensed clinicians (`physician`, `clinical_officer`) possess the `clinical:prescribe` capability.
- **Nursing Role Boundaries**: Nurses and pharmacists cannot author primary medication orders without prescribing privileges.
- **Safety Pre-conditions**: Every order requires an active safety evaluation via `MedicationSafetyService`. Contraindicated orders are blocked unless an attested physician provides explicit written clinical justification (e.g. supervised desensitization).

## 4. Medication Order Lifecycle
A medication order advances through an audited, immutable lifecycle:
1. `ACTIVE`: Order is active, valid, and available for prescription issuance.
2. `HELD`: Order is temporarily paused (e.g., pending liver/renal function results), requiring a documented rationale (`heldReason`, `heldById`, `heldAt`).
3. `DISCONTINUED`: Order is permanently halted prior to planned completion (e.g., adverse effect, therapeutic resolution), cancelling linked open prescriptions.
4. `COMPLETED`: Patient has completed the designated therapeutic duration.
5. `CANCELLED`: Order was entered in error or revoked prior to administration.

## 5. Event Sourcing & Audit Ledger
All state transitions are committed atomically through `ClinicalTransactionManager`:
- Appends domain events (`MedicationOrderCreated`, `MedicationOrderHeld`, `MedicationOrderDiscontinued`) to the patient's immutable event store.
- Writes cryptographic SHA-256 chained entries to the facility audit log (`localDb` / `auditRepository`), maintaining strict facility tenancy.
