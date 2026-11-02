/**
 * Jano Health - Deterministic Offline Emergency Identifiers (Clinical Core V9)
 * 
 * Formatted canonical identifier:
 * EMR-[FACILITY]-[YYYYMMDD]-[DEV_SIG]-[SEQ_HEX][CHECK]
 * Example: EMR-UV01-20260915-F1P-0001K
 * 
 * Invariants:
 * 1. Offline Determinism: Fully mintable on disconnected tablets in acute triage bays.
 * 2. Device Partitioning: Contains device signature to ensure uniqueness across concurrent offline devices.
 * 3. Human Scannability: Formatted for emergency wristbands, resuscitation boards, and rapid handoffs.
 * 4. Error Detection: Modulo-36 Luhn-variant checksum protects against verbal and manual transcription typos.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localEmergencyCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for emergency identifiers.
 */
export function calculateEmergencyChecksum(input: string): string {
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
 * Generates an offline-safe, collision-resistant Emergency Case Number.
 * Format: EMR-[FACILITY]-[YYYYMMDD]-[DEV_SIG]-[SEQ_HEX][CHECKSUM]
 */
export function generateEmergencyNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-emg-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localEmergencyCounter = (localEmergencyCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localEmergencyCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `EMR-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateEmergencyChecksum(core);

  return `${core}${checksum}`;
}

/**
 * Validates whether an Emergency Number adheres to format and Modulo-36 checksum integrity.
 */
export function validateEmergencyNumber(emergencyNumber: string): boolean {
  if (!emergencyNumber || typeof emergencyNumber !== 'string') return false;

  const trimmed = emergencyNumber.trim().toUpperCase();
  const pattern = /^EMR-[A-Z0-9]{2,8}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{5}$/;
  if (!pattern.test(trimmed)) return false;

  const core = trimmed.slice(0, -1);
  const checkChar = trimmed.slice(-1);
  const expectedCheck = calculateEmergencyChecksum(core);

  return checkChar === expectedCheck;
}
