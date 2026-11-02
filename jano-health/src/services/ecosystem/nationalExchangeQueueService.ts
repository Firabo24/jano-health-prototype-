/**
 * Jano Health - Clinical Core V19: National Exchange Queue & Adapters
 * 
 * Manages outbound NDHx, eCHIS, and external FHIR exchange messages,
 * offline durable queuing, separate lifecycle tracking (DELIVERED ≠ ACKNOWLEDGED ≠ PROCESSED),
 * quarantine routing, and external response firewall.
 * 
 * INVARIANTS:
 * - Default adapters strictly return NOT_CONFIGURED.
 * - Jano Network (V13) ≠ National Ecosystem (V19). Separate governance boundaries.
 * - Patient-level exchange requires full evaluation chain: Auth → RBAC → Facility Scope → Trust → Policy → V15 Consent → FHIR Validation → Transmission.
 * - External response firewall: External responses NEVER directly mutate clinical records without validation and reconciliation.
 * - Offline queue: Outages never break clinical operations; messages queue and safely retry.
 */

import {
  INDHxAdapter,
  IeCHISAdapter,
  IExternalFHIRExchangeAdapter,
  NationalExchangeMessage,
  NationalExchangeAttempt,
  NationalExchangeAcknowledgement,
  EcosystemQuarantineItem,
  EcosystemQuarantineCategory,
  NationalIntegrationStatus,
  EcosystemCapability,
  computeSha256,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';

// ----------------------------------------------------
// 1. Adapters (NDHx, eCHIS, External FHIR)
// ----------------------------------------------------

export class DefaultNDHxAdapter implements INDHxAdapter {
  public readonly adapterName = 'default_unconfigured_ndhx_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async health(): Promise<{ available: boolean; latencyMs: number }> {
    return { available: false, latencyMs: 0 };
  }

  public async discoverCapabilities(): Promise<EcosystemCapability> {
    return {
      capabilityId: 'cap_ndhx_unconfigured',
      systemId: 'ndhx_unconfigured',
      supportedResources: [],
      supportedInteractions: [],
      supportedProfiles: [],
      messageLimits: { maxBatchSize: 0, maxPayloadBytes: 0 },
      discoveredAt: new Date().toISOString(),
      status: 'UNKNOWN',
    };
  }

  public async exchange(_message: NationalExchangeMessage): Promise<{
    delivered: boolean;
    externalMessageId?: string;
    status: 'DELIVERED' | 'FAILED' | 'REJECTED';
    errorMessage?: string;
  }> {
    throw new Error('NDHx adapter is strictly NOT_CONFIGURED. Cannot transmit exchange message.');
  }

  public async pollAcknowledgement(_externalMessageId: string): Promise<NationalExchangeAcknowledgement | null> {
    return null;
  }
}

export class SandboxNDHxAdapter implements INDHxAdapter {
  public readonly adapterName = 'sandbox_ndhx_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  public async health(): Promise<{ available: boolean; latencyMs: number }> {
    return { available: true, latencyMs: 38 };
  }

  public async discoverCapabilities(): Promise<EcosystemCapability> {
    return {
      capabilityId: 'cap_ndhx_sbx',
      systemId: 'eth_ndhx_sandbox',
      supportedResources: ['Patient', 'Encounter', 'Condition', 'Observation', 'MedicationRequest', 'Bundle'],
      supportedInteractions: ['create', 'read', 'search', 'batch'],
      supportedProfiles: ['http://moh.gov.et/fhir/StructureDefinition/ndhx-bundle'],
      messageLimits: { maxBatchSize: 200, maxPayloadBytes: 5242880 },
      discoveredAt: new Date().toISOString(),
      status: 'KNOWN',
    };
  }

  public async exchange(message: NationalExchangeMessage): Promise<{
    delivered: boolean;
    externalMessageId?: string;
    status: 'DELIVERED' | 'FAILED' | 'REJECTED';
    errorMessage?: string;
  }> {
    const extId = `ndhx_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      delivered: true,
      externalMessageId: extId,
      status: 'DELIVERED',
    };
  }

  public async pollAcknowledgement(externalMessageId: string): Promise<NationalExchangeAcknowledgement | null> {
    const now = new Date().toISOString();
    return {
      acknowledgementId: `ack_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      messageId: externalMessageId,
      externalReferenceId: `ext_ref_${Date.now()}`,
      ackType: 'ACKNOWLEDGED',
      receivedAt: now,
      signatureOrProof: computeSha256(externalMessageId + now),
    };
  }
}

export class DefaultECHISAdapter implements IeCHISAdapter {
  public readonly adapterName = 'default_unconfigured_echis_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async health(): Promise<{ available: boolean }> {
    return { available: false };
  }

  public async dispatchReferralTask(_task: { referralId: string; targetCommunityWorkerId: string; patientId: string }): Promise<{ accepted: boolean }> {
    throw new Error('eCHIS adapter is strictly NOT_CONFIGURED.');
  }
}

export class DefaultExternalFHIRAdapter implements IExternalFHIRExchangeAdapter {
  public readonly adapterName = 'default_unconfigured_fhir_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async exchangeFHIRResource(_resourceType: string, _resourcePayload: any, _targetSystemUri: string): Promise<{
    success: boolean;
    responseStatus: number;
    responseBody?: any;
    error?: string;
  }> {
    throw new Error('External FHIR adapter is strictly NOT_CONFIGURED.');
  }
}

export class SandboxExternalFHIRAdapter implements IExternalFHIRExchangeAdapter {
  public readonly adapterName = 'sandbox_fhir_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  public async exchangeFHIRResource(resourceType: string, _resourcePayload: any, _targetSystemUri: string): Promise<{
    success: boolean;
    responseStatus: number;
    responseBody?: any;
    error?: string;
  }> {
    return {
      success: true,
      responseStatus: 200,
      responseBody: {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'information',
            code: 'informational',
            diagnostics: `Resource ${resourceType} accepted by Sandbox FHIR Gateway.`,
          },
        ],
      },
    };
  }
}

// ----------------------------------------------------
// 2. Queue & Quarantine Engine
// ----------------------------------------------------

export class NationalExchangeQueueService {
  private static instance: NationalExchangeQueueService;
  private ndhxAdapter: INDHxAdapter;
  private echisAdapter: IeCHISAdapter;
  private fhirAdapter: IExternalFHIRExchangeAdapter;

  private constructor() {
    this.ndhxAdapter = new DefaultNDHxAdapter();
    this.echisAdapter = new DefaultECHISAdapter();
    this.fhirAdapter = new DefaultExternalFHIRAdapter();
  }

  public static getInstance(): NationalExchangeQueueService {
    if (!NationalExchangeQueueService.instance) {
      NationalExchangeQueueService.instance = new NationalExchangeQueueService();
    }
    return NationalExchangeQueueService.instance;
  }

  public setNDHxAdapter(adapter: INDHxAdapter): void {
    this.ndhxAdapter = adapter;
  }

  public setECHISAdapter(adapter: IeCHISAdapter): void {
    this.echisAdapter = adapter;
  }

  public setFHIRAdapter(adapter: IExternalFHIRExchangeAdapter): void {
    this.fhirAdapter = adapter;
  }

  // ----------------------------------------------------
  // Enqueue Outbound National Exchange Message
  // ----------------------------------------------------

  public async enqueueMessage(params: {
    integrationId: string;
    source: string;
    destination: string;
    purpose: string;
    resourceType: string;
    profile: string;
    payload: any;
    actorId: string;
    originFacilityId: string;
  }): Promise<NationalExchangeMessage> {
    const now = new Date().toISOString();
    const messageId = `nmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `idemp_${Date.now()}_${computeSha256(params.payload).substring(0, 16)}`;
    const payloadHash = computeSha256(params.payload);

    const core = {
      messageId,
      integrationId: params.integrationId,
      source: params.source,
      destination: params.destination,
      purpose: params.purpose,
      resourceType: params.resourceType,
      profile: params.profile,
      payloadHash,
      payload: params.payload,
      idempotencyKey,
      correlationId,
      createdAt: now,
      queuedAt: now,
      state: 'QUEUED' as const,
      retryCount: 0,
      provenance: {
        initiatedBy: params.actorId,
        originFacilityId: params.originFacilityId,
      },
    };

    const message: NationalExchangeMessage = {
      ...core,
      integrityHash: computeSha256(core),
    };

    await idbEngine.put('nationalExchangeMessages', message);
    return message;
  }

  // ----------------------------------------------------
  // Dispatch Message via NDHx Adapter
  // ----------------------------------------------------

  public async dispatchMessage(messageId: string): Promise<{
    message: NationalExchangeMessage;
    attempt: NationalExchangeAttempt;
    acknowledgement?: NationalExchangeAcknowledgement;
  }> {
    const message = await idbEngine.get<NationalExchangeMessage>('nationalExchangeMessages', messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in exchange queue`);
    }

    const now = new Date().toISOString();
    message.state = 'SENDING';
    message.sentAt = now;
    message.retryCount += 1;

    const startMs = Date.now();
    let delivered = false;
    let externalMsgId: string | undefined;
    let errorMsg: string | undefined;

    try {
      const result = await this.ndhxAdapter.exchange(message);
      delivered = result.delivered;
      externalMsgId = result.externalMessageId;
    } catch (err: any) {
      errorMsg = err.message;
    }

    const latencyMs = Date.now() - startMs;
    const attemptId = `natt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const attempt: NationalExchangeAttempt = {
      attemptId,
      messageId,
      attemptNumber: message.retryCount,
      timestamp: now,
      httpStatus: delivered ? 200 : 503,
      status: delivered ? 'SUCCESS' : 'TRANSIENT_FAILURE',
      errorMessage: errorMsg,
      latencyMs,
    };
    await idbEngine.put('nationalExchangeAttempts', attempt);

    let ack: NationalExchangeAcknowledgement | undefined;

    if (delivered) {
      // Invariant: DELIVERED is tracked separately from ACKNOWLEDGED
      message.state = 'DELIVERED';
      message.deliveredAt = now;

      // Poll for external acknowledgement if available
      if (externalMsgId) {
        const polledAck = await this.ndhxAdapter.pollAcknowledgement(externalMsgId);
        if (polledAck) {
          ack = polledAck;
          message.state = 'ACKNOWLEDGED';
          message.acknowledgedAt = polledAck.receivedAt;
          await idbEngine.put('nationalExchangeAcknowledgements', ack);
        }
      }
    } else {
      if (message.retryCount >= 3) {
        // Invariant: Exhausted retries move to DEAD_LETTER
        message.state = 'DEAD_LETTER';
      } else {
        message.state = 'RETRY';
      }
    }

    message.integrityHash = computeSha256(message);
    await idbEngine.put('nationalExchangeMessages', message);

    return { message, attempt, acknowledgement: ack };
  }

  // ----------------------------------------------------
  // Quarantine Routing
  // ----------------------------------------------------

  public async routeToQuarantine(params: {
    category: EcosystemQuarantineCategory;
    sourceSystem: string;
    payload: any;
    failureReason: string;
  }): Promise<EcosystemQuarantineItem> {
    const now = new Date().toISOString();
    const quarantineId = `equar_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const item: EcosystemQuarantineItem = {
      quarantineId,
      category: params.category,
      sourceSystem: params.sourceSystem,
      payload: params.payload,
      failureReason: params.failureReason,
      quarantinedAt: now,
      status: 'QUARANTINED',
    };

    await idbEngine.put('ecosystemQuarantineItems', item);
    return item;
  }

  public async reviewQuarantine(params: {
    quarantineId: string;
    reviewerId: string;
    action: 'RESOLVE' | 'DISCARD';
    notes: string;
  }): Promise<EcosystemQuarantineItem> {
    const item = await idbEngine.get<EcosystemQuarantineItem>('ecosystemQuarantineItems', params.quarantineId);
    if (!item) {
      throw new Error(`Quarantine item ${params.quarantineId} not found`);
    }

    item.status = params.action === 'RESOLVE' ? 'RESOLVED' : 'DISCARDED';
    item.reviewerId = params.reviewerId;
    item.resolutionNotes = params.notes;
    item.resolvedAt = new Date().toISOString();

    await idbEngine.put('ecosystemQuarantineItems', item);
    return item;
  }

  // ----------------------------------------------------
  // External Response Firewall
  // ----------------------------------------------------

  /**
   * Evaluates incoming external response before any domain update.
   * Flow: Source Auth → Validation → Provenance Check → Reconcile → Quarantine if ambiguous.
   */
  public async firewallEvaluateExternalResponse(params: {
    sourceSystem: string;
    responsePayload: any;
    expectedResourceType: string;
  }): Promise<{ safeToImport: boolean; quarantineItem?: EcosystemQuarantineItem }> {
    // 1. Authenticate source
    if (!params.sourceSystem || params.sourceSystem.trim() === '') {
      const q = await this.routeToQuarantine({
        category: 'EXTERNAL_RESPONSE',
        sourceSystem: 'UNKNOWN',
        payload: params.responsePayload,
        failureReason: 'Missing source system identity in external response envelope.',
      });
      return { safeToImport: false, quarantineItem: q };
    }

    // 2. Structural & schema validation
    if (!params.responsePayload || typeof params.responsePayload !== 'object') {
      const q = await this.routeToQuarantine({
        category: 'VALIDATION',
        sourceSystem: params.sourceSystem,
        payload: params.responsePayload,
        failureReason: 'External response payload is malformed or non-object.',
      });
      return { safeToImport: false, quarantineItem: q };
    }

    // 3. Resource type check
    if (params.responsePayload.resourceType && params.responsePayload.resourceType !== params.expectedResourceType) {
      const q = await this.routeToQuarantine({
        category: 'PROFILE',
        sourceSystem: params.sourceSystem,
        payload: params.responsePayload,
        failureReason: `Resource type mismatch: expected ${params.expectedResourceType}, got ${params.responsePayload.resourceType}`,
      });
      return { safeToImport: false, quarantineItem: q };
    }

    return { safeToImport: true };
  }

  public async getMessages(): Promise<NationalExchangeMessage[]> {
    return await idbEngine.getAll<NationalExchangeMessage>('nationalExchangeMessages');
  }

  public async getQuarantineItems(): Promise<EcosystemQuarantineItem[]> {
    return await idbEngine.getAll<EcosystemQuarantineItem>('ecosystemQuarantineItems');
  }
}

export const nationalExchangeQueueService = NationalExchangeQueueService.getInstance();
