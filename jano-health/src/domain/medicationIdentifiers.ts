/**
 * Jano Health - Deterministic Offline-Safe Medication & Prescription Identifiers (Clinical Core V6)
 * 
 * Identifier Architecture:
 * - Medication Order Number: MED-ORD-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: MED-ORD-AMGH-20260913-F1P-0001K
 * - Prescription Number: RX-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: RX-AMGH-20260913-F1P-0001Z
 * 
 * Architectural Invariants:
 * 1. Offline Determinism: Can be minted instantly in completely disconnected rural dispensaries.
 * 2. Device Partitioning: Contains device signature to prevent ID collision across multiple offline tablets.
 * 3. Human Scannability: Formatted for clinical paper prescription slips, dispensary bottle labels, and pharmacy queues.
 * 4. Error Detection: Modulo-36 Luhn-variant checksum flags manual transcription/entry errors before dispensing.
 * 5. Aggregate ID Distinction: Display numbers are distinct from underlying immutable UUIDv7 aggregate IDs (med_ord_..., rx_...).
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';
import { generateUUIDv7 } from './identifiers';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localMedOrderCounter = 0;
let localPrescriptionCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for medication identifiers.
 */
export function calculateMedicationChecksum(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < clean.length; i++) {
    const charIndex = BASE36_CHARS.indexOf(clean[i]);
    const weight = (i % 2 === 0) ? 2 : 1;
    let val = (charIndex >= 0 ? charIndex : 0) * weight;
    if (val >= 36) {
      val = Math.floor(val / 36) + (val % 36);
    }
    sum += val;
  }
  const checkVal = (36 - (sum % 36)) % 36;
  return BASE36_CHARS[checkVal];
}

/**
 * Generates an offline-safe, collision-resistant Medication Order Number.
 * Format: MED-ORD-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateMedicationOrderNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-doc-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localMedOrderCounter = (localMedOrderCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localMedOrderCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `MED-ORD-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateMedicationChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Medication Order Number including structure and Luhn checksum.
 */
export function validateMedicationOrderNumber(orderNumber: string): boolean {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  const pattern = /^MED-ORD-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(orderNumber.trim().toUpperCase())) return false;

  const core = orderNumber.slice(0, -1);
  const expectedChecksum = orderNumber.slice(-1);
  return calculateMedicationChecksum(core) === expectedChecksum;
}

/**
 * Generates an offline-safe, collision-resistant Prescription Number.
 * Format: RX-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generatePrescriptionNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-doc-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localPrescriptionCounter = (localPrescriptionCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localPrescriptionCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `RX-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateMedicationChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Prescription Number including structure and Luhn checksum.
 */
export function validatePrescriptionNumber(rxNumber: string): boolean {
  if (!rxNumber || typeof rxNumber !== 'string') return false;
  const pattern = /^RX-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(rxNumber.trim().toUpperCase())) return false;

  const core = rxNumber.slice(0, -1);
  const expectedChecksum = rxNumber.slice(-1);
  return calculateMedicationChecksum(core) === expectedChecksum;
}

/**
 * Generates an aggregate ID for a Medication Order.
 */
export function generateMedicationOrderId(): string {
  return `med_ord_${generateUUIDv7()}`;
}

/**
 * Generates an aggregate ID for a Prescription.
 */
export function generatePrescriptionId(): string {
  return `rx_${generateUUIDv7()}`;
}
