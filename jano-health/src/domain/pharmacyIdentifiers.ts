/**
 * Jano Health - Deterministic Offline-Safe Pharmacy & Inventory Identifiers (Clinical Core V7)
 * 
 * Identifier Architecture:
 * - Dispense Number: DSP-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: DSP-AMGH-20260914-F1P-0001K
 * - Receipt Number: RCV-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: RCV-AMGH-20260914-F1P-0001Z
 * - Transfer Number: TRF-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: TRF-AMGH-20260914-F1P-0001M
 * - Wastage Number: WST-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 *   Example: WST-AMGH-20260914-F1P-0001T
 * 
 * Architectural Invariants:
 * 1. Offline Determinism: Can be minted locally in disconnected dispensaries.
 * 2. Device Partitioning: Contains device signature to prevent ID collision across multiple offline tablets.
 * 3. Human Scannability: Formatted for prescription receipts, box labels, and pharmacy reports.
 * 4. Error Detection: Modulo-36 Luhn-variant checksum detects transcription errors.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localDispenseCounter = 0;
let localReceiptCounter = 0;
let localTransferCounter = 0;
let localWastageCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for pharmacy identifiers.
 */
export function calculatePharmacyChecksum(input: string): string {
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
 * Generates an offline-safe, collision-resistant Dispense Number.
 * Format: DSP-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateDispenseNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-pharm-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localDispenseCounter = (localDispenseCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localDispenseCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `DSP-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculatePharmacyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Dispense Number format and Luhn-36 checksum.
 */
export function validateDispenseNumber(dispenseNumber: string): boolean {
  if (!dispenseNumber || typeof dispenseNumber !== 'string') return false;
  const pattern = /^DSP-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(dispenseNumber.trim().toUpperCase())) return false;

  const core = dispenseNumber.slice(0, -1);
  const expectedChecksum = dispenseNumber.slice(-1);
  return calculatePharmacyChecksum(core) === expectedChecksum;
}

/**
 * Generates an offline-safe, collision-resistant Inventory Receipt Number.
 * Format: RCV-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateReceiptNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-pharm-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localReceiptCounter = (localReceiptCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localReceiptCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `RCV-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculatePharmacyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Generates an offline-safe, collision-resistant Inventory Transfer Number.
 * Format: TRF-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateTransferNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-pharm-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localTransferCounter = (localTransferCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localTransferCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `TRF-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculatePharmacyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Generates an offline-safe, collision-resistant Inventory Wastage Number.
 * Format: WST-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 */
export function generateWastageNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-pharm-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localWastageCounter = (localWastageCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localWastageCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `WST-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculatePharmacyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates a Receipt Number format and Luhn-36 checksum.
 */
export function validateReceiptNumber(receiptNumber: string): boolean {
  if (!receiptNumber || typeof receiptNumber !== 'string') return false;
  const pattern = /^RCV-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(receiptNumber.trim().toUpperCase())) return false;

  const core = receiptNumber.slice(0, -1);
  const expectedChecksum = receiptNumber.slice(-1);
  return calculatePharmacyChecksum(core) === expectedChecksum;
}

/**
 * Validates a Transfer Number format and Luhn-36 checksum.
 */
export function validateTransferNumber(transferNumber: string): boolean {
  if (!transferNumber || typeof transferNumber !== 'string') return false;
  const pattern = /^TRF-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(transferNumber.trim().toUpperCase())) return false;

  const core = transferNumber.slice(0, -1);
  const expectedChecksum = transferNumber.slice(-1);
  return calculatePharmacyChecksum(core) === expectedChecksum;
}

/**
 * Validates a Wastage Number format and Luhn-36 checksum.
 */
export function validateWastageNumber(wastageNumber: string): boolean {
  if (!wastageNumber || typeof wastageNumber !== 'string') return false;
  const pattern = /^WST-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(wastageNumber.trim().toUpperCase())) return false;

  const core = wastageNumber.slice(0, -1);
  const expectedChecksum = wastageNumber.slice(-1);
  return calculatePharmacyChecksum(core) === expectedChecksum;
}
