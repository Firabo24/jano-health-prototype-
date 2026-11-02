/**
 * Jano Health - Clinical Core V19: Ecosystem Registry & Lifecycle Service
 * 
 * Formal ecosystem system registry, trust lifecycle, service directory,
 * endpoint security with anti-SSRF enforcement, and production activation gates.
 * 
 * INVARIANTS:
 * - Jano ≠ External System / National HIE.
 * - System ≠ Service.
 * - Endpoint URLs cannot target internal cloud metadata or forbidden loopbacks.
 * - Sandbox ≠ Production. Never treat SANDBOX as PRODUCTION.
 * - Integration cannot transition directly to ACTIVE without passing the production activation gate.
 */

import {
  EcosystemSystem,
  EcosystemService,
  EcosystemEndpoint,
  EcosystemCapability,
  EcosystemTrustProfile,
  NationalIntegration,
  NationalIntegrationProfile,
  NationalExchangePolicy,
  NationalIntegrationStatus,
  SystemTrustLevel,
  EcosystemEnvironment,
  computeSha256,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { ExternalSystemRegistryService } from '../fhir/externalSystems';

export class EcosystemRegistryService {
  private static instance: EcosystemRegistryService;

  private constructor() {}

  public static getInstance(): EcosystemRegistryService {
    if (!EcosystemRegistryService.instance) {
      EcosystemRegistryService.instance = new EcosystemRegistryService();
    }
    return EcosystemRegistryService.instance;
  }

  // ----------------------------------------------------
  // 1. Ecosystem Systems
  // ----------------------------------------------------

  public async registerSystem(params: {
    systemCode: string;
    name: string;
    organization: string;
    systemType: EcosystemSystem['systemType'];
    environment: EcosystemEnvironment;
    supportedProfiles?: string[];
    supportedFHIRVersion?: string;
    dataClassification?: EcosystemSystem['dataClassification'];
    actorId: string;
  }): Promise<EcosystemSystem> {
    const now = new Date().toISOString();
    const systemId = `ecosys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const coreData = {
      systemId,
      systemCode: params.systemCode,
      name: params.name,
      organization: params.organization,
      systemType: params.systemType,
      environment: params.environment,
      trustLevel: 'PENDING' as SystemTrustLevel, // Invariant: Initial trust is strictly PENDING
      status: 'ACTIVE' as const,
      supportedProfiles: params.supportedProfiles || [],
      supportedFHIRVersion: params.supportedFHIRVersion || '5.0.0',
      endpointReferences: [],
      capabilities: [],
      dataClassification: params.dataClassification || 'GOVERNED_AGGREGATE',
      provenance: {
        registeredAt: now,
        registeredBy: params.actorId,
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const integrityHash = computeSha256(coreData);
    const system: EcosystemSystem = {
      ...coreData,
      integrityHash,
    };

    await idbEngine.put('ecosystemSystems', system);
    return system;
  }

  public async getSystem(systemId: string): Promise<EcosystemSystem | null> {
    const system = await idbEngine.get<EcosystemSystem>('ecosystemSystems', systemId);
    return system || null;
  }

  public async listSystems(): Promise<EcosystemSystem[]> {
    return await idbEngine.getAll<EcosystemSystem>('ecosystemSystems');
  }

  public async updateTrustLevel(params: {
    systemId: string;
    newTrustLevel: SystemTrustLevel;
    actorId: string;
    justification: string;
    expiresAt?: string;
  }): Promise<EcosystemSystem> {
    const system = await this.getSystem(params.systemId);
    if (!system) {
      throw new Error(`Ecosystem system ${params.systemId} not found`);
    }

    // Invariant: Direct transition to APPROVED requires explicit human justification and cannot be done without record
    if (params.newTrustLevel === 'APPROVED' && (!params.actorId || !params.justification)) {
      throw new Error('Approval of an ecosystem system requires an authorized human actor and formal justification.');
    }

    const now = new Date().toISOString();
    system.trustLevel = params.newTrustLevel;
    system.version += 1;
    system.updatedAt = now;
    system.provenance.lastReviewedAt = now;
    system.provenance.reviewNotes = params.justification;

    // Record trust profile
    const profileId = `trust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const trustProfile: EcosystemTrustProfile = {
      profileId,
      systemId: system.systemId,
      trustLevel: params.newTrustLevel,
      approvedBy: params.actorId,
      approvedAt: now,
      justification: params.justification,
      expiresAt: params.expiresAt,
    };
    await idbEngine.put('ecosystemTrustProfiles', trustProfile);

    system.integrityHash = computeSha256(system);
    await idbEngine.put('ecosystemSystems', system);
    return system;
  }

  // ----------------------------------------------------
  // 2. Ecosystem Services (System ≠ Service)
  // ----------------------------------------------------

  public async registerService(params: {
    systemId: string;
    serviceName: string;
    serviceType: EcosystemService['serviceType'];
    supportedProtocols: EcosystemService['supportedProtocols'];
    endpointId: string;
  }): Promise<EcosystemService> {
    const system = await this.getSystem(params.systemId);
    if (!system) {
      throw new Error(`Ecosystem system ${params.systemId} not found`);
    }

    const serviceId = `esvc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const service: EcosystemService = {
      serviceId,
      systemId: params.systemId,
      serviceName: params.serviceName,
      serviceType: params.serviceType,
      supportedProtocols: params.supportedProtocols,
      status: 'ONLINE',
      endpointId: params.endpointId,
    };

    await idbEngine.put('ecosystemServices', service);
    return service;
  }

  // ----------------------------------------------------
  // 3. Ecosystem Endpoints & Anti-SSRF Enforcement
  // ----------------------------------------------------

  public async registerEndpoint(params: {
    systemId: string;
    serviceId: string;
    environment: EcosystemEnvironment;
    baseUrlReference: string;
    protocol: 'HTTPS' | 'HTTP' | 'SFTP';
    authenticationMode: EcosystemEndpoint['authenticationMode'];
    actorId: string;
  }): Promise<EcosystemEndpoint> {
    // Enforce Anti-SSRF validation
    const ssrfCheck = ExternalSystemRegistryService.getInstance().validateDestinationUrl(params.baseUrlReference);
    if (!ssrfCheck.safe) {
      throw new Error(`Anti-SSRF Security Violation: ${ssrfCheck.error}`);
    }

    // Enforce HTTPS for non-sandbox environments
    if (params.environment === 'PRODUCTION' && params.protocol !== 'HTTPS') {
      throw new Error('Production endpoints must strictly use HTTPS protocol.');
    }

    const now = new Date().toISOString();
    const endpointId = `eend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const endpoint: EcosystemEndpoint = {
      endpointId,
      systemId: params.systemId,
      serviceId: params.serviceId,
      environment: params.environment,
      baseUrlReference: params.baseUrlReference,
      protocol: params.protocol,
      authenticationMode: params.authenticationMode,
      healthStatus: 'HEALTHY',
      lastHealthCheck: now,
      status: 'ACTIVE',
      provenance: {
        configuredAt: now,
        configuredBy: params.actorId,
      },
    };

    await idbEngine.put('ecosystemEndpoints', endpoint);
    return endpoint;
  }

  public async getEndpoint(endpointId: string): Promise<EcosystemEndpoint | null> {
    const ep = await idbEngine.get<EcosystemEndpoint>('ecosystemEndpoints', endpointId);
    return ep || null;
  }

  // ----------------------------------------------------
  // 4. National Integration Lifecycle & Production Gate
  // ----------------------------------------------------

  public async configureIntegration(params: {
    systemId: string;
    name: string;
    description: string;
    adapterIdentifier: string;
    environment: EcosystemEnvironment;
    primaryEndpointId?: string;
    credentialReferenceId?: string;
  }): Promise<NationalIntegration> {
    const now = new Date().toISOString();
    const integrationId = `nint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const integration: NationalIntegration = {
      integrationId,
      systemId: params.systemId,
      name: params.name,
      description: params.description,
      adapterIdentifier: params.adapterIdentifier,
      environment: params.environment,
      status: 'CONFIGURED',
      primaryEndpointId: params.primaryEndpointId,
      credentialReferenceId: params.credentialReferenceId,
      createdAt: now,
      updatedAt: now,
    };

    await idbEngine.put('nationalIntegrations', integration);
    return integration;
  }

  public async recordConnectivityTest(params: {
    integrationId: string;
    successful: boolean;
    latencyMs: number;
    errorMessage?: string;
  }): Promise<NationalIntegration> {
    const integration = await idbEngine.get<NationalIntegration>('nationalIntegrations', params.integrationId);
    if (!integration) {
      throw new Error(`Integration ${params.integrationId} not found`);
    }

    const now = new Date().toISOString();
    integration.lastConnectivityTest = {
      testedAt: now,
      successful: params.successful,
      latencyMs: params.latencyMs,
      errorMessage: params.errorMessage,
    };

    if (params.successful) {
      if (integration.status === 'CONFIGURED' || integration.status === 'PENDING_APPROVAL') {
        integration.status = 'CONNECTIVITY_TESTED';
      }
    } else {
      integration.status = 'DEGRADED';
    }

    integration.updatedAt = now;
    await idbEngine.put('nationalIntegrations', integration);
    return integration;
  }

  /**
   * Production Activation Gate:
   * Requires:
   * - endpoint configured
   * - environment explicitly defined
   * - system trust approved
   * - connectivity test verified
   * - authorized human governance signoff
   */
  public async activateIntegration(params: {
    integrationId: string;
    actorId: string;
    governanceTicket: string;
  }): Promise<NationalIntegration> {
    const integration = await idbEngine.get<NationalIntegration>('nationalIntegrations', params.integrationId);
    if (!integration) {
      throw new Error(`Integration ${params.integrationId} not found`);
    }

    const system = await this.getSystem(integration.systemId);
    if (!system) {
      throw new Error(`System ${integration.systemId} not found for integration`);
    }

    if (system.trustLevel !== 'APPROVED') {
      throw new Error(`Cannot activate integration: parent system trust level is "${system.trustLevel}", must be "APPROVED".`);
    }

    if (!integration.primaryEndpointId) {
      throw new Error('Cannot activate integration: primary endpoint is not configured.');
    }

    if (!integration.lastConnectivityTest || !integration.lastConnectivityTest.successful) {
      throw new Error('Cannot activate integration: connectivity test has not succeeded.');
    }

    if (!params.actorId || !params.governanceTicket) {
      throw new Error('Cannot activate integration: missing authorized governance approval credentials.');
    }

    const now = new Date().toISOString();
    integration.status = 'ACTIVE';
    integration.activationGateApproval = {
      approvedBy: params.actorId,
      approvedAt: now,
      governanceTicket: params.governanceTicket,
    };
    integration.updatedAt = now;

    await idbEngine.put('nationalIntegrations', integration);
    return integration;
  }

  public async setIntegrationStatus(
    integrationId: string,
    status: NationalIntegrationStatus,
    reason?: string
  ): Promise<NationalIntegration> {
    const integration = await idbEngine.get<NationalIntegration>('nationalIntegrations', integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    // Invariant: Cannot set directly to ACTIVE without passing activation gate
    if (status === 'ACTIVE' && (!integration.activationGateApproval || !integration.lastConnectivityTest?.successful)) {
      throw new Error('Cannot transition directly to ACTIVE without valid activation gate approval.');
    }

    integration.status = status;
    integration.updatedAt = new Date().toISOString();
    await idbEngine.put('nationalIntegrations', integration);
    return integration;
  }

  public async getIntegration(integrationId: string): Promise<NationalIntegration | null> {
    const integration = await idbEngine.get<NationalIntegration>('nationalIntegrations', integrationId);
    return integration || null;
  }

  public async listIntegrations(): Promise<NationalIntegration[]> {
    return await idbEngine.getAll<NationalIntegration>('nationalIntegrations');
  }
}

export const ecosystemRegistryService = EcosystemRegistryService.getInstance();
