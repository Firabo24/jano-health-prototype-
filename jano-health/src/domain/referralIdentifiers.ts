/**
 * Jano Health - Deterministic Offline Referral Identifiers (Clinical Core V8)
 * 
 * Formatted canonical identifier:
 * REF-[FACILITY]-[YYYYMMDD]-[DEV_SIG]-[SEQ_HEX][CHECK]
 * Example: REF-UV01-20260915-F1P-0001K
 * 
 * Invariants:
 * 1. Offline Determinism: Fully mintable on disconnected tablets in remote rural dispensaries.
 * 2. Device Partitioning: Contains device signature to ensure uniqueness across concurrent offline devices.
 * 3. Human Scannability: Formatted for referral slips, telephone handoffs, and hospital intake registers.
 * 4. Error Detection: Modulo-36 Luhn-variant checksum protects against verbal and manual transcription typos.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localReferralCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for referral identifiers.
 */
export function calculateReferralChecksum(input: string): string {
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
 * Generates an offline-safe, collision-resistant Referral Number.
 * Format: REF-[FACILITY]-[YYYYMMDD]-[DEV_SIG]-[SEQ_HEX][CHECKSUM]
 */
export function generateReferralNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-ref-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localReferralCounter = (localReferralCounter + 1) % 65536;

  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const seqHex = localReferralCounter.toString(16).toUpperCase().padStart(4, '0');
  const core = `REF-${facCode}-${dateStr}-${devSig}-${seqHex}`;
  const checksum = calculateReferralChecksum(core);

  return `${core}${checksum}`;
}

export function generateReferralId(): string {
  return 'ref-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

export function generateReferralOutcomeId(): string {
  return 'ref-out-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

export function generateReferralCommunicationId(): string {
  return 'ref-comm-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
}

/**
 * Validates a Referral Number format and Luhn-36 checksum.
 */
export function validateReferralNumber(referralNumber: string): boolean {
  if (!referralNumber || typeof referralNumber !== 'string') return false;
  const clean = referralNumber.trim().toUpperCase();
  const pattern = /^REF-[A-Z0-9]{3,6}-\d{8}-[A-Z0-9]{3}-[A-Z0-9]{4}[A-Z0-9]$/;
  if (!pattern.test(clean)) return false;

  const core = clean.slice(0, -1);
  const expectedChecksum = clean.slice(-1);
  return calculateReferralChecksum(core) === expectedChecksum;
}
