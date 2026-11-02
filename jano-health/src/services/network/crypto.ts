/**
 * Jano Health - Network Cryptographic Integrity Helpers
 * Clinical Core V13: SHA-256 Canonical Hashing, Envelope Verification, and Tamper-Evidence
 */

import { canonicalJson, sha256 } from '../../domain/eventIntegrity';
import { NetworkExchangeMessage } from '../../domain/types';

/**
 * Computes deterministic SHA-256 hash of a payload object.
 */
export function computePayloadHash(payload: any): string {
  const canonical = canonicalJson(payload);
  return sha256(canonical);
}

/**
 * Computes deterministic SHA-256 integrity hash for a NetworkExchangeMessage envelope.
 */
export function computeMessageIntegrityHash(message: {
  messageId: string;
  exchangeId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  messageType: string;
  resourceType: string;
  resourceId: string;
  payloadHash: string;
  idempotencyKey: string;
  createdAt: string;
}): string {
  const content = [
    message.messageId,
    message.exchangeId,
    message.sourceNodeId,
    message.destinationNodeId,
    message.sourceFacilityId,
    message.destinationFacilityId,
    message.messageType,
    message.resourceType,
    message.resourceId,
    message.payloadHash,
    message.idempotencyKey,
    message.createdAt,
  ].join('|');

  return sha256(content);
}

/**
 * Validates payload integrity against an expected SHA-256 hash.
 */
export function verifyPayloadIntegrity(payload: any, expectedHash: string): boolean {
  if (!payload || !expectedHash) return false;
  const actual = computePayloadHash(payload);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}
