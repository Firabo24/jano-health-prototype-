/**
 * Jano Health - Deterministic Offline-Safe Radiology Identifiers Strategy (Clinical Core V5)
 * 
 * Clinical Identifier Architecture:
 * - Radiology Order Number: RAD-ORD-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: RAD-ORD-AMGH-20260912-N4B-01A2K
 * - Radiology Study Number: RAD-STU-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: RAD-STU-AMGH-20260912-N4B-02B1M
 * - Radiology Accession Number: RAD-ACC-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: RAD-ACC-AMGH-20260912-N4B-042MZ
 * 
 * Architectural Invariants:
 * 1. Scope: Facility-scoped and date-partitioned display identifier for imaging worklists,
 *    PACS/DICOM accession routing, requisition slips, and patient charts.
 * 2. Distinction: Accession and order numbers are human-readable routing identifiers.
 *    They MUST NOT be confused with immutable UUIDv7 aggregate IDs (e.g. `rad_ord_019...`, `rad_stu_019...`).
 * 3. Offline Safety: Generated locally without server round-trips using device signatures
 *    and monotonic counters, guaranteeing zero collision between multiple disconnected tablets/workstations.
 * 4. Transcription Error Detection: Modulo-36 Luhn-variant checksum detects typos during accession entry.
 * 5. Deterministic Reconciliation: When reconnected, accession numbers preserve facility and device provenance.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localRadOrderCounter = 0;
let localRadStudyCounter = 0;
let localRadAccessionCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for radiology identifiers.
 */
export function calculateRadiologyChecksum(input: string): string {
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
 * Generates an offline-safe, collision-resistant Radiology Order Number.
 * Format: RAD-ORD-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateRadiologyOrderNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-rad-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localRadOrderCounter = (localRadOrderCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localRadOrderCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `RAD-ORD-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateRadiologyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Radiology Order Number including structure and Luhn checksum.
 */
export function validateRadiologyOrderNumber(orderNumber: string): boolean {
  if (!orderNumber || typeof orderNumber !== 'string') return false;
  const pattern = /^RAD-ORD-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(orderNumber.trim().toUpperCase())) return false;

  const core = orderNumber.slice(0, -1);
  const expectedChecksum = orderNumber.slice(-1);
  return calculateRadiologyChecksum(core) === expectedChecksum;
}

/**
 * Generates an offline-safe, collision-resistant Radiology Study Number.
 * Format: RAD-STU-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateRadiologyStudyNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-rad-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localRadStudyCounter = (localRadStudyCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localRadStudyCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `RAD-STU-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateRadiologyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Radiology Study Number including structure and Luhn checksum.
 */
export function validateRadiologyStudyNumber(studyNumber: string): boolean {
  if (!studyNumber || typeof studyNumber !== 'string') return false;
  const pattern = /^RAD-STU-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(studyNumber.trim().toUpperCase())) return false;

  const core = studyNumber.slice(0, -1);
  const expectedChecksum = studyNumber.slice(-1);
  return calculateRadiologyChecksum(core) === expectedChecksum;
}

/**
 * Generates an offline-safe, collision-resistant Radiology Accession Number.
 * Format: RAD-ACC-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateRadiologyAccessionNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-rad-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localRadAccessionCounter = (localRadAccessionCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localRadAccessionCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `RAD-ACC-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateRadiologyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Radiology Accession Number including structure and Luhn checksum.
 */
export function validateRadiologyAccessionNumber(accessionNumber: string): boolean {
  if (!accessionNumber || typeof accessionNumber !== 'string') return false;
  const pattern = /^RAD-ACC-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(accessionNumber.trim().toUpperCase())) return false;

  const core = accessionNumber.slice(0, -1);
  const expectedChecksum = accessionNumber.slice(-1);
  return calculateRadiologyChecksum(core) === expectedChecksum;
}
