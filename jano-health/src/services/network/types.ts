/**
 * Jano Health - Network Subsystem Core Types
 * Clinical Core V13: Multi-Facility Interoperability, Node Trust, and Store-and-Forward
 */

import {
  JanoNetworkNode,
  NetworkNodeStatus,
  NetworkTrustStatus,
  NetworkExchangePolicy,
  NetworkExchangeMessage,
  ExchangeLifecycleState,
  ExchangeResourceType,
  NetworkQuarantineItem,
  NetworkQuarantineCategory,
  QuarantineResolutionAction,
  ExternalPatientIdentity,
  FacilityDirectoryEntry,
  PractitionerDirectoryEntry,
  ServiceDirectoryEntry,
  NetworkExchangeLogEntry,
  NationalExchangeStatus,
} from '../../domain/types';

export * from '../../domain/types';

export interface NetworkTransportResult {
  success: boolean;
  statusCode: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  responsePayload?: any;
  error?: string;
  isTransient?: boolean;
  latencyMs?: number;
}

export interface INetworkTransport {
  readonly transportName: string;
  send(message: NetworkExchangeMessage): Promise<NetworkTransportResult>;
  ping(nodeId: string): Promise<boolean>;
}

export interface PolicyEvaluationContext {
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  purpose: 'TREATMENT' | 'EMERGENCY' | 'REFERRAL' | 'TRANSFER' | 'DIAGNOSTIC_REPORT' | 'OPERATIONS';
  resourceType: ExchangeResourceType;
  direction: 'INBOUND' | 'OUTBOUND';
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'NOTIFY' | 'QUERY';
  payloadSizeBytes: number;
  priority?: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  matchedPolicyId?: string;
  reason?: string;
  rateLimitExceeded?: boolean;
  requiresQuarantineOnAmbiguity?: boolean;
}

export interface SendMessageOptions {
  priority?: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  correlationId?: string;
  authorId: string;
  authorRole: string;
  authorFacilityId: string;
  purpose?: 'TREATMENT' | 'EMERGENCY' | 'REFERRAL' | 'TRANSFER' | 'DIAGNOSTIC_REPORT' | 'OPERATIONS';
  maxRetries?: number;
  expiryMinutes?: number;
}

export interface NetworkMetricsSummary {
  totalMessages: number;
  queuedCount: number;
  deliveredCount: number;
  acknowledgedCount: number;
  failedCount: number;
  quarantinedCount: number;
  deadLetterCount: number;
  averageLatencyMs: number;
  activeNodesCount: number;
  trustedNodesCount: number;
  policyDenialsCount: number;
  health: 'HEALTHY' | 'DEGRADED' | 'DISRUPTED';
}
