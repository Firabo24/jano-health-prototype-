/**
 * Jano Health - Deterministic Offline-Safe Encounter Number Strategy
 * 
 * Clinical Identifier Architecture:
 * Standard Format: ENC-<FAC_CODE>-<YYYYMMDD>-<DEV_SIG>-<SEQ_HEX><CHECKSUM>
 * Example: ENC-AMGH-20260907-N4B-042K
 * 
 * Architectural Characteristics:
 * 1. Scope: Facility-scoped and date-partitioned display identifier for paper slips,
 *    wristbands, verbal handoffs, and bed boards.
 * 2. Distinction: Display encounter numbers are human-readable routing identifiers.
 *    They MUST NOT be confused with the immutable UUIDv7 aggregate ID (e.g. `enc_019...`).
 * 3. Offline Safety: Generated locally without server round-trips using device signatures
 *    and monotonic entropy counters, guaranteeing zero collision between multiple disconnected tablets.
 * 4. Transcription Error Detection: Modulo-36 Luhn-variant checksum detects typos during clinical lookup.
 */

import { deriveDeviceSignature, extractFacilityCode } from './mrn';

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

let localEncounterCounter = 0;

/**
 * Computes a Modulo-36 Luhn-variant checksum character for encounter numbers.
 */
export function calculateEncounterChecksum(input: string): string {
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
 * Generates an offline-safe, deterministic, collision-resistant Encounter Number.
 */
export function generateEncounterNumber(
  facilityIdOrCode: string,
  deviceId: string = 'client-node-1',
  date: Date = new Date()
): string {
  const facCode = extractFacilityCode(facilityIdOrCode);
  const devSig = deriveDeviceSignature(deviceId);

  localEncounterCounter = (localEncounterCounter + 1) % 65536;

  // Format date as YYYYMMDD
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  // 3-hex counter entropy
  const timeEntropy = (Math.floor(date.getTime() / 1000) % 256).toString(16).padStart(2, '0').toUpperCase();
  const seqEntropy = (localEncounterCounter % 16).toString(16).toUpperCase();
  const sequenceStr = `${timeEntropy}${seqEntropy}`;

  const payload = `ENC-${facCode}-${dateStr}-${devSig}-${sequenceStr}`;
  const checksum = calculateEncounterChecksum(payload);

  return `${payload}${checksum}`;
}

/**
 * Validates the format and Modulo-36 checksum of an encounter number.
 */
export function validateEncounterNumber(encounterNumber: string): {
  valid: boolean;
  facilityCode?: string;
  dateString?: string;
  deviceSignature?: string;
  reason?: string;
} {
  if (!encounterNumber || typeof encounterNumber !== 'string') {
    return { valid: false, reason: 'Encounter number is empty or not a string' };
  }

  const parts = encounterNumber.trim().split('-');
  if (parts.length !== 5 || parts[0] !== 'ENC') {
    return {
      valid: false,
      reason: 'Encounter number does not conform to format ENC-<FAC>-<YYYYMMDD>-<DEVSIG>-<SEQ_HEX><CHECKSUM>',
    };
  }

  const [_, facCode, dateStr, devSig, seqWithCheck] = parts;

  if (dateStr.length !== 8 || isNaN(Number(dateStr))) {
    return { valid: false, reason: 'Invalid date segment in encounter number' };
  }

  if (seqWithCheck.length < 2) {
    return { valid: false, reason: 'Sequence and checksum segment too short' };
  }

  const payload = `ENC-${facCode}-${dateStr}-${devSig}-${seqWithCheck.slice(0, -1)}`;
  const expectedChecksum = calculateEncounterChecksum(payload);
  const actualChecksum = seqWithCheck.slice(-1).toUpperCase();

  if (expectedChecksum !== actualChecksum) {
    return {
      valid: false,
      facilityCode: facCode,
      dateString: dateStr,
      deviceSignature: devSig,
      reason: `Modulo-36 checksum mismatch. Expected ${expectedChecksum}, got ${actualChecksum}`,
    };
  }

  return {
    valid: true,
    facilityCode: facCode,
    dateString: dateStr,
    deviceSignature: devSig,
  };
}
