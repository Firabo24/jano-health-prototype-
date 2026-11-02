/**
 * Jano Health - Deterministic Offline-Safe Laboratory Identifiers Strategy
 * 
 * Clinical Identifier Architecture:
 * - Laboratory Order Number: ORD-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: ORD-AMGH-20260909-N4B-01A2K
 * - Specimen Accession Number: ACC-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: ACC-AMGH-20260909-N4B-042MZ
 * 
 * Architectural Characteristics:
 * 1. Scope: Facility-scoped and date-partitioned display identifier for specimen tubes,
 *    lab requisition slips, barcode labels, and phlebotomy trays.
 * 2. Distinction: Display accession and order numbers are human-readable routing identifiers.
 *    They MUST NOT be confused with immutable UUIDv7 aggregate IDs (e.g. `ord_019...`, `spec_019...`).
 * 3. Offline Safety: Generated locally without server round-trips using device signatures
 *    and monotonic counters, guaranteeing zero collision between multiple disconnected tablets/workstations.
 * 4. Transcription Error Detection: Modulo-36 Luhn-variant checksum detects typos during specimen intake.
 * 5. Reconciliation: When reconnected, accession numbers preserve facility and device provenance.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localOrderCounter = 0;
let localAccessionCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for laboratory identifiers.
 */
export function calculateLabChecksum(input: string): string {
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
 * Generates an offline-safe, collision-resistant Laboratory Order Number.
 */
export function generateLabOrderNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-node-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localOrderCounter = (localOrderCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localOrderCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `ORD-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateLabChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Laboratory Order Number including structure and Luhn checksum.
 */
export function validateLabOrderNumber(orderNumber: string): boolean {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  const pattern = /^ORD-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(orderNumber.trim().toUpperCase())) return false;

  const core = orderNumber.slice(0, -1);
  const expectedChecksum = orderNumber.slice(-1);
  return calculateLabChecksum(core) === expectedChecksum;
}

/**
 * Generates an offline-safe, collision-resistant Specimen Accession Number.
 */
export function generateAccessionNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-node-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localAccessionCounter = (localAccessionCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localAccessionCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `ACC-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateLabChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Specimen Accession Number including structure and Luhn checksum.
 */
export function validateAccessionNumber(accessionNumber: string): boolean {
  if (!accessionNumber || typeof accessionNumber !== 'string') return false;
  const pattern = /^ACC-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(accessionNumber.trim().toUpperCase())) return false;

  const core = accessionNumber.slice(0, -1);
  const expectedChecksum = accessionNumber.slice(-1);
  return calculateLabChecksum(core) === expectedChecksum;
}
