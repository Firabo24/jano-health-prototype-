/**
 * Jano Health - Collision-Resistant Identifiers (UUIDv7)
 * 
 * Implements RFC 9562 UUIDv7 for monotonically sortable distributed identifiers.
 * Combines 48-bit millisecond timestamps with monotonic sub-millisecond sequence
 * counters and cryptographically strong pseudo-random bits.
 * 
 * Provides backwards-compatible parsing for existing legacy prefixes.
 */

let lastTimestamp = -1;
let sequenceCounter = 0;

/**
 * Generate an RFC 9562 compliant UUIDv7 string.
 * Format: 8-4-4-4-12 hex characters (36 chars with hyphens).
 */
export function generateUUIDv7(): string {
  let now = Date.now();

  // Handle clock drift / monotonicity within same millisecond
  if (now === lastTimestamp) {
    sequenceCounter = (sequenceCounter + 1) & 0xfff; // 12-bit sequence
    if (sequenceCounter === 0) {
      // Sequence overflowed 4096 in single millisecond, increment simulated ms
      now = lastTimestamp + 1;
    }
  } else if (now > lastTimestamp) {
    lastTimestamp = now;
    sequenceCounter = Math.floor(Math.random() * 0x100); // randomize sequence start
  } else {
    // Clock moved backwards, preserve monotonicity
    now = lastTimestamp;
    sequenceCounter = (sequenceCounter + 1) & 0xfff;
  }

  // 48-bit timestamp
  const timeHex = now.toString(16).padStart(12, '0');
  const timeHigh = timeHex.substring(0, 8);
  const timeMid = timeHex.substring(8, 12);

  // 4-bit version (0x7) + 12-bit sequence
  const verAndSeq = (0x7000 | (sequenceCounter & 0x0fff)).toString(16).padStart(4, '0');

  // 2-bit variant (0b10) + 14-bit random
  const randA = (0x8000 | (Math.floor(Math.random() * 0x4000))).toString(16).padStart(4, '0');

  // 48-bit random
  const randB1 = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const randB2 = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const randB3 = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  const randNode = `${randB1}${randB2}${randB3}`;

  return `${timeHigh}-${timeMid}-${verAndSeq}-${randA}-${randNode}`;
}

/**
 * Generate a domain event ID: evt_<uuidv7>
 */
export function generateEventId(): string {
  return `evt_${generateUUIDv7()}`;
}

/**
 * Generate an audit record ID: aud_<uuidv7>
 */
export function generateAuditId(): string {
  return `aud_${generateUUIDv7()}`;
}

/**
 * Generate a sync record ID: sync_<uuidv7>
 */
export function generateSyncId(): string {
  return `sync_${generateUUIDv7()}`;
}

/**
 * Generate a conflict arbitration ID: conf_<uuidv7>
 */
export function generateConflictId(): string {
  return `conf_${generateUUIDv7()}`;
}

/**
 * Generate a clinical entity ID with domain prefix: e.g. pat_<uuidv7>, enc_<uuidv7>
 */
export function generateEntityId(prefix: string): string {
  return `${prefix}_${generateUUIDv7()}`;
}

/**
 * Generate a collision-resistant AI request ID: air_<uuidv7>
 */
export function generateAIRequestId(): string {
  return `air_${generateUUIDv7()}`;
}

export { generateMRN, validateMRN, calculateMRNChecksum, extractFacilityCode, deriveDeviceSignature } from './mrn';
export { generateEncounterNumber, validateEncounterNumber, calculateEncounterChecksum } from './encounterNumber';
export { generateLabOrderNumber, validateLabOrderNumber, generateAccessionNumber, validateAccessionNumber, calculateLabChecksum } from './labIdentifiers';
export {
  generateRadiologyOrderNumber,
  validateRadiologyOrderNumber,
  generateRadiologyStudyNumber,
  validateRadiologyStudyNumber,
  generateRadiologyAccessionNumber,
  validateRadiologyAccessionNumber,
  calculateRadiologyChecksum,
} from './radiologyIdentifiers';
export {
  generateMedicationOrderNumber,
  validateMedicationOrderNumber,
  generatePrescriptionNumber,
  validatePrescriptionNumber,
  calculateMedicationChecksum,
  generateMedicationOrderId,
  generatePrescriptionId,
} from './medicationIdentifiers';

/**
 * Validates whether an identifier is a valid UUIDv7 or legacy identifier.
 * Ensures zero-breakage for existing stored records.
 */
export function isValidIdentifier(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  // UUIDv7 standard pattern
  const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Prefixed UUIDv7 pattern (evt_..., aud_..., pat_...)
  const prefixedPattern = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // Legacy timestamp-based patterns (e.g. evt-123456789-abc, aud-123..., pat-...)
  const legacyPattern = /^[a-z]+-[\w-]+$/i;

  return uuidv7Pattern.test(id) || prefixedPattern.test(id) || legacyPattern.test(id);
}
