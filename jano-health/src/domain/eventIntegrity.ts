/**
 * Jano Health - Event Integrity & Tamper-Evidence Hash Chain
 * 
 * Provides deterministic cryptographic hash chaining for domain and audit events.
 * Event N is linked to Event N-1 via previousEventHash:
 *   Event 1: previousEventHash = null, eventHash = H(canonical(Event 1))
 *   Event N: previousEventHash = Event(N-1).eventHash, eventHash = H(canonical(Event N) + previousEventHash)
 * 
 * Includes deep-freezing to guarantee domain event immutability across the application runtime.
 */

import { DomainEvent } from './persistence';
import { AuditEvent } from './types';

/**
 * Deep-freeze an object and all its nested properties to guarantee immutability.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Already frozen
  if (Object.isFrozen(obj)) {
    return obj as Readonly<T>;
  }

  Object.freeze(obj);

  Object.keys(obj).forEach((key) => {
    const prop = (obj as any)[key];
    if (prop !== null && (typeof prop === 'object' || typeof prop === 'function') && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  });

  return obj as Readonly<T>;
}

/**
 * Deterministically serialize any JavaScript value to canonical JSON.
 * Sorts object keys recursively and formats without extraneous whitespace.
 */
export function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(value).sort();
  const pairs = sortedKeys
    .filter((k) => value[k] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);

  return `{${pairs.join(',')}}`;
}

/**
 * Pure TypeScript deterministic SHA-256 implementation.
 * Self-contained so it works synchronously in browser, Node, and test runners
 * without async Web Crypto API dependencies.
 */
export function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) !== 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // UTF-16 characters out of 8-bit range
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = i >= 16 ? rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3) : 0;
      const s1 = i >= 16 ? rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10) : 0;
      const sub = i < 16 ? w[i] : ((w[i - 16] + s0 + w[i - 7] + s1) | 0);

      const s0_maj = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s0_maj + maj) | 0;
      const s1_ch = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1_ch + ch + k[i] + (w[i] = sub)) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let byte = 3; byte >= 0; byte--) {
      const b = (hash[i] >> (byte * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Compute the deterministic hash of a domain event.
 * 
 * Hash Contract Versions:
 * - Version 2 (Current, complete immutable binding):
 *   Binds: hashVersion, eventId, eventType, aggregateType, aggregateId, facilityId,
 *   actorId, deviceId, timestamp, sequence, version, payload, metadata,
 *   clientCreatedAt, clientUpdatedAt, and previousEventHash.
 * 
 * - Version 1 (Legacy compatibility):
 *   Binds: eventId, eventType, aggregateId, timestamp, sequence, version, payload, and previousEventHash.
 */
export function computeEventHash(
  event: {
    eventId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId: string;
    facilityId?: string;
    actorId?: string;
    deviceId?: string;
    timestamp: string;
    sequence?: number;
    version?: number;
    payload: any;
    metadata?: any;
    clientCreatedAt?: string;
    clientUpdatedAt?: string;
    hashVersion?: number;
  },
  previousEventHash: string | null
): string {
  const version = event.hashVersion ?? 1;
  if (version !== 1 && version !== 2) {
    throw new Error(`[EventIntegrity] Unsupported event hash version: ${event.hashVersion}`);
  }

  if (version === 2) {
    const canonicalData = canonicalJson({
      hashVersion: 2,
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      facilityId: event.facilityId ?? '',
      actorId: event.actorId ?? '',
      deviceId: event.deviceId ?? '',
      timestamp: event.timestamp,
      sequence: event.sequence ?? 1,
      version: event.version ?? 1,
      payload: event.payload,
      metadata: event.metadata ?? {},
      clientCreatedAt: event.clientCreatedAt ?? null,
      clientUpdatedAt: event.clientUpdatedAt ?? null,
      previousEventHash: previousEventHash ?? 'ROOT_GENESIS',
    });
    return sha256(canonicalData);
  }

  // Version 1 (Legacy compatibility contract)
  const canonicalData = canonicalJson({
    eventId: event.eventId,
    eventType: event.eventType,
    aggregateId: event.aggregateId,
    timestamp: event.timestamp,
    sequence: event.sequence ?? 1,
    version: event.version ?? 1,
    payload: event.payload,
    previousEventHash: previousEventHash ?? 'ROOT_GENESIS',
  });

  return sha256(canonicalData);
}

/**
 * Verify the cryptographic hash chain of a series of domain events.
 * Detects broken links, payload tampering, or omitted historical events.
 */
export function verifyEventChain(events: DomainEvent[]): {
  valid: boolean;
  brokenAtIndex?: number;
  brokenEventId?: string;
  reason?: string;
} {
  if (!events || events.length === 0) {
    return { valid: true };
  }

  // Verify sequential continuity
  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const expectedPrevHash = i === 0 ? null : (events[i - 1].eventHash || null);

    // If current event has previousEventHash recorded, verify link
    if (current.previousEventHash !== undefined && current.previousEventHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        brokenEventId: current.eventId,
        reason: `Previous hash mismatch: expected '${expectedPrevHash}', found '${current.previousEventHash}'`,
      };
    }

    // Verify hash integrity if eventHash is present
    if (current.eventHash) {
      let calculatedHash: string;
      try {
        calculatedHash = computeEventHash(current, expectedPrevHash);
      } catch (hashErr: any) {
        return {
          valid: false,
          brokenAtIndex: i,
          brokenEventId: current.eventId,
          reason: `Event hash computation failed on ${current.eventId}: ${hashErr.message}`,
        };
      }
      if (current.eventHash !== calculatedHash) {
        return {
          valid: false,
          brokenAtIndex: i,
          brokenEventId: current.eventId,
          reason: `Event hash mismatch on ${current.eventId}: computed '${calculatedHash}', recorded '${current.eventHash}'`,
        };
      }
    }
  }

  return { valid: true };
}

export const verifyEventHashChain = verifyEventChain;

export interface ChainValidationResult {
  valid: boolean;
  head: DomainEvent | null;
  sortedEvents: DomainEvent[];
  error?: string;
}

/**
 * Strict, authoritative validation for the global domain event hash chain.
 * Enforces:
 * - Empty ledger is valid (head = null, sorted = []).
 * - Exactly one genesis root (previousEventHash === null or undefined).
 * - Every non-root event references an existing predecessor by its eventHash.
 * - No predecessor has multiple competing successors (fork detection).
 * - Every stored event is reachable from the genesis root in exactly one linear path.
 * - Exactly one terminal head remains (unreferenced by any other event).
 * - No duplicate eventId or eventHash.
 * - Every event's stored eventHash matches its canonical preimage SHA-256 computation.
 * - Sequence numbers for the same aggregate are strictly monotonic.
 */
export function validateEventChainIntegrity(events: DomainEvent[]): ChainValidationResult {
  if (!events || events.length === 0) {
    return { valid: true, head: null, sortedEvents: [] };
  }

  // 1. Check for duplicate eventId
  const eventIds = new Set<string>();
  for (const ev of events) {
    if (!ev.eventId) {
      return { valid: false, head: null, sortedEvents: [], error: 'Event record missing eventId' };
    }
    if (eventIds.has(ev.eventId)) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Duplicate eventId detected: '${ev.eventId}'. Immutability violation.`,
      };
    }
    eventIds.add(ev.eventId);
  }

  // 2. Check for duplicate eventHash or missing eventHash
  const eventHashes = new Set<string>();
  const byEventHash = new Map<string, DomainEvent>();
  for (const ev of events) {
    if (!ev.eventHash) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Event '${ev.eventId}' has missing or empty eventHash`,
      };
    }
    if (eventHashes.has(ev.eventHash)) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Duplicate eventHash detected: '${ev.eventHash}' on event '${ev.eventId}'`,
      };
    }
    eventHashes.add(ev.eventHash);
    byEventHash.set(ev.eventHash, ev);
  }

  // 3. Identify genesis roots (previousEventHash === null or undefined)
  const roots = events.filter((ev) => ev.previousEventHash === null || ev.previousEventHash === undefined);
  if (roots.length === 0) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: 'No genesis root event found in chain (possible cycle or all events reference predecessors)',
    };
  }
  if (roots.length > 1) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: `Multiple genesis roots detected (${roots.length} roots: [${roots.map((r) => r.eventId).join(', ')}])`,
    };
  }
  const root = roots[0];

  // 4. Index predecessor links and detect forks / dangling references
  const successorsByPrevHash = new Map<string, DomainEvent[]>();
  const referencedPrevHashes = new Set<string>();

  for (const ev of events) {
    if (ev.previousEventHash !== null && ev.previousEventHash !== undefined) {
      // Must point to an existing event
      if (!eventHashes.has(ev.previousEventHash)) {
        return {
          valid: false,
          head: null,
          sortedEvents: [],
          error: `Dangling predecessor reference on event '${ev.eventId}': predecessor hash '${ev.previousEventHash}' does not exist in store`,
        };
      }
      referencedPrevHashes.add(ev.previousEventHash);
      const list = successorsByPrevHash.get(ev.previousEventHash) || [];
      list.push(ev);
      if (list.length > 1) {
        return {
          valid: false,
          head: null,
          sortedEvents: [],
          error: `Fork detected on predecessor '${ev.previousEventHash}': multiple competing successors [${list.map((s) => s.eventId).join(', ')}]`,
        };
      }
      successorsByPrevHash.set(ev.previousEventHash, list);
    }
  }

  // 5. Check unreferenced candidate terminal heads
  const unreferenced = events.filter((ev) => !referencedPrevHashes.has(ev.eventHash!));
  if (unreferenced.length === 0) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: 'No terminal head found in chain (cyclic predecessor references)',
    };
  }
  if (unreferenced.length > 1) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: `Multiple candidate heads detected (${unreferenced.length} unreferenced heads: [${unreferenced.map((h) => h.eventId).join(', ')}])`,
    };
  }

  // 6. Traverse linear chain from genesis root to terminal tip
  const sortedEvents: DomainEvent[] = [];
  const visited = new Set<string>();
  let cur: DomainEvent | undefined = root;

  while (cur) {
    if (visited.has(cur.eventId)) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Cycle detected in event chain at event '${cur.eventId}'`,
      };
    }
    visited.add(cur.eventId);
    sortedEvents.push(cur);

    // Verify cryptographic SHA-256 hash match against canonical preimage
    const expectedPrevHash = sortedEvents.length === 1 ? null : sortedEvents[sortedEvents.length - 2].eventHash || null;
    if (cur.previousEventHash !== expectedPrevHash) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Previous hash mismatch on '${cur.eventId}': expected '${expectedPrevHash}', found '${cur.previousEventHash}'`,
      };
    }

    if (cur.hashVersion !== undefined && cur.hashVersion !== 1 && cur.hashVersion !== 2) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Unsupported event hash version '${cur.hashVersion}' on event '${cur.eventId}'`,
      };
    }

    let computedHash: string;
    try {
      computedHash = computeEventHash(cur, expectedPrevHash);
    } catch (hashErr: any) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Event hash computation failed on '${cur.eventId}': ${hashErr.message}`,
      };
    }

    if (cur.eventHash !== computedHash) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Event hash mismatch on '${cur.eventId}': computed '${computedHash}', recorded '${cur.eventHash}'`,
      };
    }

    const nextList = cur.eventHash ? successorsByPrevHash.get(cur.eventHash) : undefined;
    cur = nextList && nextList.length > 0 ? nextList[0] : undefined;
  }

  // 7. Verify all stored events were reached exactly once
  if (sortedEvents.length !== events.length) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: `Disconnected components or unreachable events detected: traversed ${sortedEvents.length} of ${events.length} stored events`,
    };
  }

  // 8. Verify the terminal head matches the last traversed event
  const terminalHead = unreferenced[0];
  const lastTraversed = sortedEvents[sortedEvents.length - 1];
  if (terminalHead.eventId !== lastTraversed.eventId) {
    return {
      valid: false,
      head: null,
      sortedEvents: [],
      error: `Ambiguous terminal head: traversal reached '${lastTraversed.eventId}' but unreferenced head is '${terminalHead.eventId}'`,
    };
  }

  // 9. Verify aggregate sequence monotonicity
  const lastSeqByAggregate = new Map<string, number>();
  for (const ev of sortedEvents) {
    const aggKey = `${ev.aggregateType}:${ev.aggregateId}`;
    const prevSeq = lastSeqByAggregate.get(aggKey);
    const curSeq = ev.sequence ?? 1;
    if (prevSeq !== undefined && curSeq <= prevSeq) {
      return {
        valid: false,
        head: null,
        sortedEvents: [],
        error: `Aggregate sequence violation on '${aggKey}': sequence ${curSeq} is not strictly greater than previous sequence ${prevSeq} on event '${ev.eventId}'`,
      };
    }
    lastSeqByAggregate.set(aggKey, curSeq);
  }

  return {
    valid: true,
    head: terminalHead,
    sortedEvents,
  };
}

/**
 * Deterministically find the authoritative tip/head of the domain event chain.
 * Fails closed: throws an actionable error if the chain is invalid, forked,
 * or has multiple candidate heads.
 */
export function findAuthoritativeChainHead(events: DomainEvent[]): DomainEvent | null {
  if (!events || events.length === 0) return null;
  const result = validateEventChainIntegrity(events);
  if (!result.valid) {
    throw new Error(`[EventIntegrity] Authoritative chain validation failed: ${result.error}`);
  }
  return result.head;
}

/**
 * Deterministically sort domain events following their cryptographic hash chain links from genesis to tip.
 * Fails closed: throws an actionable error if the chain is invalid, forked, or contains unreachable events.
 */
export function sortEventChain(events: DomainEvent[]): DomainEvent[] {
  if (!events || events.length === 0) return [];
  const result = validateEventChainIntegrity(events);
  if (!result.valid) {
    throw new Error(`[EventIntegrity] Cannot sort invalid event chain: ${result.error}`);
  }
  return result.sortedEvents;
}


/**
 * Compute the deterministic hash of an audit event.
 */
export function computeAuditHash(
  audit: {
    id: string;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    timestamp: string;
    resultingState?: any;
  },
  previousAuditHash: string | null
): string {
  const canonicalData = canonicalJson({
    id: audit.id,
    actorId: audit.actorId,
    action: audit.action,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId,
    timestamp: audit.timestamp,
    resultingState: audit.resultingState,
    previousAuditHash: previousAuditHash ?? 'AUDIT_GENESIS',
  });

  return sha256(canonicalData);
}

/**
 * Verify the audit log hash chain for tamper evidence.
 */
export function verifyAuditChain(auditLogs: AuditEvent[]): {
  valid: boolean;
  brokenAtIndex?: number;
  brokenAuditId?: string;
  reason?: string;
} {
  if (!auditLogs || auditLogs.length === 0) {
    return { valid: true };
  }

  for (let i = 0; i < auditLogs.length; i++) {
    const current = auditLogs[i];
    const expectedPrevHash = i === 0 ? null : (auditLogs[i - 1].auditHash || null);

    if (current.previousAuditHash !== undefined && current.previousAuditHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtIndex: i,
        brokenAuditId: current.id,
        reason: `Audit previous hash mismatch on ${current.id}: expected '${expectedPrevHash}', got '${current.previousAuditHash}'`,
      };
    }

    if (current.auditHash) {
      const calculatedHash = computeAuditHash(current, expectedPrevHash);
      if (current.auditHash !== calculatedHash) {
        return {
          valid: false,
          brokenAtIndex: i,
          brokenAuditId: current.id,
          reason: `Audit record hash mismatch on ${current.id}: computed '${calculatedHash}', recorded '${current.auditHash}'`,
        };
      }
    }
  }

  return { valid: true };
}

export const verifyAuditTrailIntegrity = verifyAuditChain;
