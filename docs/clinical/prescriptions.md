# Clinical Domain: Digital Prescriptions (Prescription)

## 1. Overview
A `Prescription` is the legally binding, tamper-evident digital authorization issued by a licensed clinician to dispense medication to a patient. In Jano Health Clinical Core V6, prescriptions decouple clinical intent (`MedicationOrder`) from dispensary fulfillment (`Prescription`).

## 2. Prescription Number Architecture
Prescription identifiers adhere to deterministic edge-generation rules with Modulo-36 checksum verification:

```
RX-[FACILITY]-[YYYYMMDD]-[DEVICE]-[SEQ][CHECK]
Example: RX-AMGH-20260913-F1P-0001Z
```

## 3. Tamper-Evident SHA-256 Digital Seal
Every issued prescription contains a 64-character SHA-256 digital cryptographic signature seal:
- Computed across the canonical canonicalized payload: prescription ID, prescription number, order ID, patient ID, facility ID, prescriber ID, generic name, formulation, dose, route, frequency, quantity, validity window, and prescriber attestation.
- Any modification of quantity, dose, or validity after issuance immediately breaks cryptographic verification (`verifyPrescriptionSeal()`), intercepting prescription tampering.

## 4. Prescription Lifecycle
1. `ISSUED`: Valid prescription attested by clinician, awaiting dispensary presentation.
2. `PARTIALLY_DISPENSED`: Dispensed partially due to stock limitations or installment schedules.
3. `DISPENSED`: Fully fulfilled by a licensed pharmacy professional (`userRole: 'pharmacist'`). Records manufacturer batch attribution (`batchNumber`), quantity dispensed, and counseling notes.
4. `ON_HOLD`: Temporarily frozen pending clarification or safety alert.
5. `EXPIRED`: Passed the designated `validityEnd` date (default 30 days).
6. `CANCELLED`: Revoked by prescriber with clinical rationale.

## 5. Versioned Amendment Protocol
If dosage, quantity, or instructions require revision:
- Original prescription is NOT mutated in place.
- The record version increments (`version + 1`).
- An entry is appended to `amendmentHistory` capturing `previousSignatureHash`, timestamp, amending clinician ID, and written justification.
- A fresh SHA-256 cryptographic seal is generated and signed.
