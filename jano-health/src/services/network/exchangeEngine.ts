/**
 * Jano Health - Network Exchange Engine
 * Clinical Core V13: Central Inter-Facility Exchange Orchestration, Store-and-Forward, and Delivery Lifecycle
 */

import {
  NetworkExchangeMessage,
  ExchangeLifecycleState,
  ExchangeResourceType,
  JanoNetworkNode,
} from '../../domain/types';
import {
  SendMessageOptions,
  PolicyEvaluationResult,
  NetworkTransportResult,
} from './types';
import { computePayloadHash, computeMessageIntegrityHash, verifyPayloadIntegrity } from './crypto';
import { janoNodeRegistryService } from './nodeRegistry';
import { networkExchangePolicyEngine } from './policyEngine';
import { localNetworkTransport, httpNetworkTransport, LocalNetworkTransport } from './transport';
import { durableExchangeQueue } from './messageQueue';
import { networkQuarantineService } from './quarantine';
import { multiFacilityIdentityReconciler } from './identityReconciliation';
import { clinicalExchangeService } from './clinicalExchange';
import { networkObservabilityService } from './observability';
import { auditService } from '../audit/auditService';

export class NetworkExchangeEngine {
  private static instance: NetworkExchangeEngine;
  private isOfflineSimulation = false;

  private constructor() {
    // Bind local receiver handler to in-memory transport for synchronous simulation & testing
    localNetworkTransport.setReceiverHandler(async (msg: NetworkExchangeMessage) => {
      return this.processInboundMessage(msg);
    });
  }

  public static getInstance(): NetworkExchangeEngine {
    if (!NetworkExchangeEngine.instance) {
      NetworkExchangeEngine.instance = new NetworkExchangeEngine();
    }
    return NetworkExchangeEngine.instance;
  }

  public setOfflineSimulation(offline: boolean): void {
    this.isOfflineSimulation = offline;
  }

  /**
   * Outbound: Initiates a facility-to-facility network exchange message.
   */
  public async sendExchange(
    sourceNodeId: string,
    destinationNodeId: string,
    messageType: NetworkExchangeMessage['messageType'],
    resourceType: ExchangeResourceType,
    resourceId: string,
    payload: any,
    options: SendMessageOptions
  ): Promise<NetworkExchangeMessage> {
    const startTime = Date.now();
    const sourceNode = janoNodeRegistryService.getNode(sourceNodeId);
    if (!sourceNode) {
      throw new Error(`SOURCE_NODE_UNKNOWN: Node '${sourceNodeId}' is not registered.`);
    }

    const destNode = janoNodeRegistryService.getNode(destinationNodeId);
    if (!destNode) {
      throw new Error(`DESTINATION_NODE_UNKNOWN: Node '${destinationNodeId}' is not registered.`);
    }

    // 1. Evaluate Outbound Policy (Deny-by-default)
    const payloadHash = computePayloadHash(payload);
    const payloadSizeBytes = JSON.stringify(payload).length;

    const policyEval: PolicyEvaluationResult = networkExchangePolicyEngine.evaluatePolicy({
      sourceNodeId,
      destinationNodeId,
      sourceFacilityId: sourceNode.facilityId,
      destinationFacilityId: destNode.facilityId,
      purpose: options.purpose || 'TREATMENT',
      resourceType,
      direction: 'OUTBOUND',
      operation: 'CREATE',
      payloadSizeBytes,
      priority: options.priority || 'ROUTINE',
    });

    if (!policyEval.allowed) {
      networkObservabilityService.recordPolicyDenial();
      if (policyEval.reason?.includes('TRUST_FAILURE')) {
        networkObservabilityService.recordTrustFailure();
      }
      throw new Error(`EXCHANGE_POLICY_DENIED: ${policyEval.reason}`);
    }

    // 2. Mint Message Envelope
    const now = new Date().toISOString();
    const messageId = `NET-MSG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const exchangeId = `EXC-${Date.now().toString(36).toUpperCase()}`;
    const idempotencyKey = `idemp-${sourceNodeId}-${resourceType}-${resourceId}-${payloadHash.substring(0, 12)}`;

    const envelopeHash = computeMessageIntegrityHash({
      messageId,
      exchangeId,
      sourceNodeId,
      destinationNodeId,
      sourceFacilityId: sourceNode.facilityId,
      destinationFacilityId: destNode.facilityId,
      messageType,
      resourceType,
      resourceId,
      payloadHash,
      idempotencyKey,
      createdAt: now,
    });

    const message: NetworkExchangeMessage = {
      messageId,
      exchangeId,
      sourceNodeId,
      destinationNodeId,
      sourceFacilityId: sourceNode.facilityId,
      destinationFacilityId: destNode.facilityId,
      messageType,
      resourceType,
      resourceId,
      payload,
      payloadHash,
      schemaProfile: `jano-net-profile-${messageType.toLowerCase()}`,
      correlationId: options.correlationId || exchangeId,
      idempotencyKey,
      priority: options.priority || 'ROUTINE',
      currentState: 'CREATED',
      createdAt: now,
      retryCount: 0,
      maxRetries: options.maxRetries || 5,
      expiryAt: new Date(Date.now() + (options.expiryMinutes || 1440) * 60000).toISOString(),
      attemptHistory: [],
      provenance: {
        authorId: options.authorId,
        authorRole: options.authorRole,
        authorFacilityId: options.authorFacilityId,
        timestamp: now,
        signatureSeal: envelopeHash,
      },
      integrityHash: envelopeHash,
    };

    // 3. Store-and-Forward Decision
    // If system is simulating offline source or transport is unreachable, persist directly in durable queue
    const isDestReachable = await localNetworkTransport.ping(destinationNodeId);
    const shouldQueueLocally = this.isOfflineSimulation || !isDestReachable || sourceNode.networkStatus === 'OFFLINE';

    if (shouldQueueLocally) {
      await durableExchangeQueue.enqueue(message);
      await networkObservabilityService.recordLog({
        exchangeId,
        messageId,
        sourceNodeId,
        destinationNodeId,
        sourceFacilityId: sourceNode.facilityId,
        destinationFacilityId: destNode.facilityId,
        messageType,
        state: 'QUEUED',
        durationMs: Date.now() - startTime,
        payloadSize: payloadSizeBytes,
        payloadHash,
        actorId: options.authorId,
      });

      // Audit trail
      auditService.record(
        {
          actorId: options.authorId,
          actorName: options.authorId,
          actorRole: options.authorRole as any,
          facilityId: sourceNode.facilityId,
        },
        'NETWORK_EXCHANGE_QUEUED',
        'NetworkExchangeMessage',
        message.messageId,
        {
          exchangeId,
          destinationFacilityId: destNode.facilityId,
          resourceType,
          resourceId,
          reason: 'Node offline or store-and-forward transmission requested',
        }
      );

      return message;
    }

    // 4. Immediate Online Transmission
    message.currentState = 'SENDING';
    message.sentAt = new Date().toISOString();
    await durableExchangeQueue.updateMessage(message);

    const transportResult = await localNetworkTransport.send(message);

    if (transportResult.success && transportResult.acknowledged) {
      message.currentState = 'ACKNOWLEDGED';
      message.deliveredAt = transportResult.acknowledgedAt || new Date().toISOString();
      message.acknowledgedAt = message.deliveredAt;
      await durableExchangeQueue.updateMessage(message);

      await networkObservabilityService.recordLog({
        exchangeId,
        messageId,
        sourceNodeId,
        destinationNodeId,
        sourceFacilityId: sourceNode.facilityId,
        destinationFacilityId: destNode.facilityId,
        messageType,
        state: 'ACKNOWLEDGED',
        statusCode: transportResult.statusCode,
        durationMs: Date.now() - startTime,
        payloadSize: payloadSizeBytes,
        payloadHash,
        actorId: options.authorId,
      });

      return message;
    }

    // 5. Handle Failure / Queue for Retry
    await durableExchangeQueue.recordFailedAttempt(
      message.messageId,
      transportResult.statusCode,
      transportResult.error || 'TRANSMISSION_FAILED',
      Boolean(transportResult.isTransient)
    );

    await networkObservabilityService.recordLog({
      exchangeId,
      messageId,
      sourceNodeId,
      destinationNodeId,
      sourceFacilityId: sourceNode.facilityId,
      destinationFacilityId: destNode.facilityId,
      messageType,
      state: message.currentState,
      statusCode: transportResult.statusCode,
      durationMs: Date.now() - startTime,
      payloadSize: payloadSizeBytes,
      payloadHash,
      actorId: options.authorId,
      error: transportResult.error,
    });

    return message;
  }

  /**
   * Inbound: Processes a received network message on the destination node.
   */
  public async processInboundMessage(message: NetworkExchangeMessage): Promise<{
    success: boolean;
    acknowledged?: boolean;
    error?: string;
    payload?: any;
    quarantined?: boolean;
  }> {
    // 1. Idempotency & Replay Attack Check
    const idemCheck = durableExchangeQueue.checkIdempotency(message.idempotencyKey, message.payloadHash);

    if (idemCheck.isTamperedReplay) {
      // Replay attack with altered payload! Quarantine immediately.
      await networkQuarantineService.quarantine({
        category: 'REPLAY_DETECTED',
        messageId: message.messageId,
        sourceNodeId: message.sourceNodeId,
        destinationNodeId: message.destinationNodeId,
        sourceFacilityId: message.sourceFacilityId,
        destinationFacilityId: message.destinationFacilityId,
        resourceType: message.resourceType,
        resourceId: message.resourceId,
        rawPayload: message.payload,
        quarantineReason: `REPLAY_ATTACK_DETECTED: Idempotency key '${message.idempotencyKey}' was previously presented with a different payload hash.`,
      });

      return {
        success: false,
        quarantined: true,
        error: 'REPLAY_ATTACK_DETECTED: Idempotency key collision with mutated payload.',
      };
    }

    if (idemCheck.isDuplicate) {
      // Clean duplicate message (e.g. repeated delivery after network glitch).
      // Return previous ACK without re-running clinical ingestion or creating duplicates.
      return {
        success: true,
        acknowledged: true,
        payload: { status: 'DUPLICATE_ACCEPTED_IDEMPOTENT', previousMessageId: idemCheck.existingMessageId },
      };
    }

    // 2. Payload Cryptographic Integrity Check
    if (!verifyPayloadIntegrity(message.payload, message.payloadHash)) {
      await networkQuarantineService.quarantine({
        category: 'INTEGRITY_FAILURE',
        messageId: message.messageId,
        sourceNodeId: message.sourceNodeId,
        destinationNodeId: message.destinationNodeId,
        sourceFacilityId: message.sourceFacilityId,
        destinationFacilityId: message.destinationFacilityId,
        resourceType: message.resourceType,
        resourceId: message.resourceId,
        rawPayload: message.payload,
        quarantineReason: 'PAYLOAD_INTEGRITY_COMPROMISED: SHA-256 payload hash does not match computed digest.',
      });

      return {
        success: false,
        quarantined: true,
        error: 'PAYLOAD_INTEGRITY_COMPROMISED',
      };
    }

    // 3. Inbound Policy Check
    const inboundPurpose =
      message.priority === 'EMERGENCY'
        ? 'EMERGENCY'
        : message.messageType === 'REFERRAL'
        ? 'REFERRAL'
        : message.messageType === 'LAB_ORDER' ||
          message.messageType === 'LAB_RESULT' ||
          message.messageType === 'RADIOLOGY_ORDER' ||
          message.messageType === 'RADIOLOGY_RESULT'
        ? 'DIAGNOSTIC_REPORT'
        : 'TREATMENT';

    const inboundPolicy = networkExchangePolicyEngine.evaluatePolicy({
      sourceNodeId: message.sourceNodeId,
      destinationNodeId: message.destinationNodeId,
      sourceFacilityId: message.sourceFacilityId,
      destinationFacilityId: message.destinationFacilityId,
      purpose: inboundPurpose,
      resourceType: message.resourceType,
      direction: 'INBOUND',
      operation: 'CREATE',
      payloadSizeBytes: JSON.stringify(message.payload).length,
      priority: message.priority,
    });

    if (!inboundPolicy.allowed) {
      await networkQuarantineService.quarantine({
        category: 'POLICY_FAILURE',
        messageId: message.messageId,
        sourceNodeId: message.sourceNodeId,
        destinationNodeId: message.destinationNodeId,
        sourceFacilityId: message.sourceFacilityId,
        destinationFacilityId: message.destinationFacilityId,
        resourceType: message.resourceType,
        resourceId: message.resourceId,
        rawPayload: message.payload,
        quarantineReason: `INBOUND_POLICY_DENIED: ${inboundPolicy.reason}`,
      });

      return {
        success: false,
        quarantined: true,
        error: `INBOUND_POLICY_DENIED: ${inboundPolicy.reason}`,
      };
    }

    // 4. Clinical Domain Routing & Identity Reconciliation
    try {
      let resolvedLocalPatientId = message.payload?.patientId || message.payload?.referral?.patientId || 'pat_anon';

      // Reconcile patient demographics if present in message payload
      if (message.payload?.patientSummary) {
        const pSum = message.payload.patientSummary;
        const [firstName, ...lastParts] = (pSum.fullName || 'Unknown External').split(' ');
        const lastName = lastParts.join(' ') || 'Patient';

        const recon = await multiFacilityIdentityReconciler.reconcileIncomingPatient({
          externalIdentifier: pSum.mrn || message.payload.patientId || `EXT-${Date.now()}`,
          sourceNodeId: message.sourceNodeId,
          sourceFacilityId: message.sourceFacilityId,
          firstName,
          lastName,
          dob: pSum.dob || '1990-01-01',
          gender: (pSum.gender || 'unknown').toLowerCase() as any,
          recordedBy: `node:${message.sourceNodeId}`,
        });

        if (recon.status === 'AMBIGUOUS_MATCH') {
          // Multiple candidate matches! ANTI-AUTO-MERGE GUARD: Route to Quarantine
          await networkQuarantineService.quarantine({
            category: 'IDENTITY_AMBIGUITY',
            messageId: message.messageId,
            sourceNodeId: message.sourceNodeId,
            destinationNodeId: message.destinationNodeId,
            sourceFacilityId: message.sourceFacilityId,
            destinationFacilityId: message.destinationFacilityId,
            resourceType: message.resourceType,
            resourceId: message.resourceId,
            rawPayload: message.payload,
            quarantineReason: recon.reason,
            identityCandidates: recon.candidates,
          });

          return {
            success: false,
            quarantined: true,
            error: recon.reason,
          };
        } else if (recon.status === 'EXACT_MATCH') {
          resolvedLocalPatientId = recon.patientId!;
        }
      }

      // Route to clinical domain handlers
      switch (message.messageType) {
        case 'REFERRAL':
          await clinicalExchangeService.applyInboundReferral(
            message.payload,
            resolvedLocalPatientId,
            message.destinationFacilityId
          );
          break;
        case 'LAB_ORDER':
        case 'LAB_RESULT':
          await clinicalExchangeService.applyInboundLab(
            message.payload,
            resolvedLocalPatientId,
            message.destinationFacilityId
          );
          break;
        case 'RADIOLOGY_ORDER':
        case 'RADIOLOGY_RESULT':
          await clinicalExchangeService.applyInboundRadiology(
            message.payload,
            resolvedLocalPatientId,
            message.destinationFacilityId
          );
          break;
        case 'MEDICATION_HISTORY':
          await clinicalExchangeService.applyInboundMedication(
            message.payload,
            resolvedLocalPatientId,
            message.destinationFacilityId
          );
          break;
        case 'EMERGENCY_TRANSFER':
          await clinicalExchangeService.applyInboundEmergencyTransfer(
            message.payload,
            resolvedLocalPatientId,
            message.destinationFacilityId
          );
          break;
        default:
          // Validated generic payload
          break;
      }

      // 5. Register processed idempotency key
      const now = new Date().toISOString();
      durableExchangeQueue.registerProcessedIdempotency(
        message.idempotencyKey,
        message.messageId,
        message.payloadHash,
        'APPLIED',
        now
      );

      return {
        success: true,
        acknowledged: true,
        payload: {
          status: 'APPLIED',
          resolvedLocalPatientId,
          processedAt: now,
        },
      };
    } catch (err: any) {
      await networkQuarantineService.quarantine({
        category: 'VALIDATION_FAILURE',
        messageId: message.messageId,
        sourceNodeId: message.sourceNodeId,
        destinationNodeId: message.destinationNodeId,
        sourceFacilityId: message.sourceFacilityId,
        destinationFacilityId: message.destinationFacilityId,
        resourceType: message.resourceType,
        resourceId: message.resourceId,
        rawPayload: message.payload,
        quarantineReason: `CLINICAL_INGESTION_ERROR: ${err?.message || 'Failed to ingest clinical aggregate'}`,
      });

      return {
        success: false,
        quarantined: true,
        error: err?.message || 'Ingestion failed',
      };
    }
  }

  /**
   * Drain store-and-forward queue upon network reconnection (Scenario B & C).
   */
  public async drainQueue(): Promise<{ attempted: number; delivered: number; deadLettered: number }> {
    const queuedItems = durableExchangeQueue.getQueue({ currentState: 'QUEUED' });
    const retryItems = durableExchangeQueue.getQueue({ currentState: 'RETRY' });
    const eligible = [...queuedItems, ...retryItems];

    let delivered = 0;
    let deadLettered = 0;

    for (const msg of eligible) {
      const isReachable = await localNetworkTransport.ping(msg.destinationNodeId);
      if (!isReachable) continue;

      msg.currentState = 'SENDING';
      msg.sentAt = new Date().toISOString();

      const res = await localNetworkTransport.send(msg);
      if (res.success && res.acknowledged) {
        msg.currentState = 'ACKNOWLEDGED';
        msg.deliveredAt = res.acknowledgedAt || new Date().toISOString();
        msg.acknowledgedAt = msg.deliveredAt;
        await durableExchangeQueue.updateMessage(msg);
        delivered += 1;
      } else {
        const updated = await durableExchangeQueue.recordFailedAttempt(
          msg.messageId,
          res.statusCode,
          res.error || 'RETRY_FAILED',
          Boolean(res.isTransient)
        );
        if (updated.currentState === 'DEAD_LETTER') {
          deadLettered += 1;
        }
      }
    }

    return {
      attempted: eligible.length,
      delivered,
      deadLettered,
    };
  }

  public resetAll(): void {
    this.isOfflineSimulation = false;
    localNetworkTransport.resetSimulations();
    durableExchangeQueue.resetQueue();
    networkQuarantineService.resetToSyntheticDemo();
    multiFacilityIdentityReconciler.resetToSyntheticDemo();
    networkObservabilityService.resetMetrics();
  }
}

export const networkExchangeEngine = NetworkExchangeEngine.getInstance();
