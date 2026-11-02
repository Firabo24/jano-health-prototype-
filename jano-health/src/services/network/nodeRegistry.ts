/**
 * Jano Health - Jano Network Node Registry & Trust Lifecycle Subsystem
 * Clinical Core V13: Decentralized Multi-Facility Node Governance
 */

import { JanoNetworkNode, NetworkNodeStatus, NetworkTrustStatus, NodeProvenance } from '../../domain/types';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';

export interface RegisterNodeParams {
  nodeCode: string;
  facilityId: string;
  organizationId?: string;
  displayName: string;
  environment?: 'production' | 'staging' | 'development' | 'sandbox';
  endpointMetadata?: {
    url?: string;
    protocol: 'http' | 'https' | 'in_memory' | 'mesh';
    authMethod: 'mutual_tls' | 'bearer_token' | 'api_key' | 'internal';
    timeoutMs?: number;
  };
  supportedExchangeProfiles?: string[];
  supportedFhirVersion?: string;
  capabilities?: string[];
  initialTrustStatus?: NetworkTrustStatus;
  reason?: string;
}

export class JanoNodeRegistryService {
  private static instance: JanoNodeRegistryService;
  private nodes: Map<string, JanoNetworkNode> = new Map();
  private facilityToNode: Map<string, string> = new Map();
  private initialized = false;

  private constructor() {
    this.seedDefaultNodes();
  }

  public static getInstance(): JanoNodeRegistryService {
    if (!JanoNodeRegistryService.instance) {
      JanoNodeRegistryService.instance = new JanoNodeRegistryService();
    }
    return JanoNodeRegistryService.instance;
  }

  private seedDefaultNodes(): void {
    const defaultNodes: JanoNetworkNode[] = [
      {
        nodeId: 'node-uvinza-01',
        nodeCode: 'NODE-UVINZA-01',
        facilityId: 'fac-uvinza-hc',
        organizationId: 'org-kigoma-district-council',
        displayName: 'Uvinza Primary Health Centre Node',
        environment: 'development',
        networkStatus: 'ONLINE',
        trustStatus: 'TRUSTED',
        capabilities: [
          'referral.outbound',
          'referral.inbound',
          'lab.outbound',
          'emergency.transfer',
          'medication.history',
        ],
        endpointMetadata: {
          url: 'http://localhost:3000/network/exchange',
          protocol: 'in_memory',
          authMethod: 'bearer_token',
          timeoutMs: 5000,
        },
        supportedExchangeProfiles: [
          'patient-summary',
          'referral',
          'lab-exchange',
          'emergency-transfer',
          'medication-history',
        ],
        supportedFhirVersion: '5.0.0',
        lastSeenAt: new Date().toISOString(),
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        provenance: {
          registeredBy: 'usr-sysadmin-amanuel',
          approvedBy: 'usr-interopadmin-kalkidan',
          reason: 'Initial multi-facility district network provisioning',
          timestamp: '2026-01-01T00:00:00Z',
        },
        version: 1,
        integrityHash: sha256('node-uvinza-01|NODE-UVINZA-01|fac-uvinza-hc|TRUSTED'),
      },
      {
        nodeId: 'node-kigoma-01',
        nodeCode: 'NODE-KIGOMA-01',
        facilityId: 'fac-kigoma-dh',
        organizationId: 'org-kigoma-regional-health',
        displayName: 'Kigoma District Referral Hospital Central Hub',
        environment: 'development',
        networkStatus: 'ONLINE',
        trustStatus: 'TRUSTED',
        capabilities: [
          'referral.inbound',
          'referral.outbound',
          'lab.processing',
          'radiology.reporting',
          'emergency.intake',
          'medication.reconciliation',
        ],
        endpointMetadata: {
          url: 'http://localhost:3000/network/exchange',
          protocol: 'in_memory',
          authMethod: 'bearer_token',
          timeoutMs: 5000,
        },
        supportedExchangeProfiles: [
          'patient-summary',
          'referral',
          'lab-exchange',
          'radiology-report',
          'emergency-transfer',
          'medication-history',
        ],
        supportedFhirVersion: '5.0.0',
        lastSeenAt: new Date().toISOString(),
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        provenance: {
          registeredBy: 'usr-sysadmin-amanuel',
          approvedBy: 'usr-interopadmin-kalkidan',
          reason: 'Regional referral tertiary node',
          timestamp: '2026-01-01T00:00:00Z',
        },
        version: 1,
        integrityHash: sha256('node-kigoma-01|NODE-KIGOMA-01|fac-kigoma-dh|TRUSTED'),
      },
      {
        nodeId: 'node-nguruka-01',
        nodeCode: 'NODE-NGURUKA-01',
        facilityId: 'fac-nguruka-clinic',
        organizationId: 'org-kigoma-district-council',
        displayName: 'Nguruka Sub-County Dispensary Node',
        environment: 'development',
        networkStatus: 'ONLINE',
        trustStatus: 'TRUSTED',
        capabilities: ['referral.outbound', 'emergency.transfer', 'patient.lookup'],
        endpointMetadata: {
          url: 'http://localhost:3000/network/exchange',
          protocol: 'in_memory',
          authMethod: 'bearer_token',
          timeoutMs: 8000,
        },
        supportedExchangeProfiles: ['patient-summary', 'referral', 'emergency-transfer'],
        supportedFhirVersion: '5.0.0',
        lastSeenAt: new Date().toISOString(),
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: new Date().toISOString(),
        provenance: {
          registeredBy: 'usr-sysadmin-amanuel',
          approvedBy: 'usr-interopadmin-kalkidan',
          reason: 'Rural peripheral clinic integration',
          timestamp: '2026-01-02T00:00:00Z',
        },
        version: 1,
        integrityHash: sha256('node-nguruka-01|NODE-NGURUKA-01|fac-nguruka-clinic|TRUSTED'),
      },
      {
        nodeId: 'node-mobile-02',
        nodeCode: 'NODE-MOBILE-02',
        facilityId: 'fac-mobile-unit-02',
        organizationId: 'org-kigoma-outreach',
        displayName: 'Mobile Outreach Unit Bravo Node',
        environment: 'development',
        networkStatus: 'OFFLINE',
        trustStatus: 'TRUSTED',
        capabilities: ['emergency.transfer', 'patient.lookup'],
        endpointMetadata: {
          protocol: 'mesh',
          authMethod: 'api_key',
          timeoutMs: 15000,
        },
        supportedExchangeProfiles: ['patient-summary', 'emergency-transfer'],
        supportedFhirVersion: '5.0.0',
        lastSeenAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: '2026-01-05T00:00:00Z',
        updatedAt: new Date().toISOString(),
        provenance: {
          registeredBy: 'usr-sysadmin-amanuel',
          approvedBy: 'usr-interopadmin-kalkidan',
          reason: 'Lake Tanganyika mobile outreach vessel',
          timestamp: '2026-01-05T00:00:00Z',
        },
        version: 1,
        integrityHash: sha256('node-mobile-02|NODE-MOBILE-02|fac-mobile-unit-02|TRUSTED'),
      },
    ];

    defaultNodes.forEach((n) => {
      this.nodes.set(n.nodeId, n);
      this.facilityToNode.set(n.facilityId, n.nodeId);
    });
  }

  public async registerNode(params: RegisterNodeParams, registeredBy: string): Promise<JanoNetworkNode> {
    const existingNode = Array.from(this.nodes.values()).find(
      (n) => n.nodeCode.toUpperCase() === params.nodeCode.toUpperCase()
    );
    if (existingNode) {
      throw new Error(`NODE_ALREADY_EXISTS: A network node with code '${params.nodeCode}' already exists.`);
    }

    const nodeId = `node-${params.nodeCode.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const node: JanoNetworkNode = {
      nodeId,
      nodeCode: params.nodeCode.toUpperCase(),
      facilityId: params.facilityId,
      organizationId: params.organizationId || 'org-district-health',
      displayName: params.displayName,
      environment: params.environment || 'development',
      networkStatus: 'UNKNOWN',
      trustStatus: params.initialTrustStatus || 'PENDING',
      capabilities: params.capabilities || ['referral.outbound', 'emergency.transfer'],
      endpointMetadata: params.endpointMetadata || {
        protocol: 'in_memory',
        authMethod: 'bearer_token',
        timeoutMs: 5000,
      },
      supportedExchangeProfiles: params.supportedExchangeProfiles || ['patient-summary', 'referral'],
      supportedFhirVersion: params.supportedFhirVersion || '5.0.0',
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      provenance: {
        registeredBy,
        reason: params.reason || 'New facility node registration',
        timestamp: now,
      },
      version: 1,
      integrityHash: sha256(`${nodeId}|${params.nodeCode}|${params.facilityId}|${params.initialTrustStatus || 'PENDING'}`),
    };

    this.nodes.set(node.nodeId, node);
    this.facilityToNode.set(node.facilityId, node.nodeId);

    try {
      await idbEngine.put('networkNodes', node);
    } catch {
      // Memory fallback handled
    }

    return node;
  }

  public async approveNode(nodeId: string, approvedBy: string, reason?: string): Promise<JanoNetworkNode> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`NODE_NOT_FOUND: Network node '${nodeId}' does not exist.`);
    }

    if (node.trustStatus === 'REVOKED') {
      throw new Error(`REVOKED_NODE_IMMUTABLE: Cannot approve a permanently REVOKED node '${nodeId}'. Create a new node registration.`);
    }

    node.trustStatus = 'TRUSTED';
    node.updatedAt = new Date().toISOString();
    node.version += 1;
    node.provenance = {
      ...node.provenance,
      approvedBy,
      reason: reason || 'Trust verified and approved by Network Administrator',
      timestamp: node.updatedAt,
    };
    node.integrityHash = sha256(`${node.nodeId}|${node.nodeCode}|${node.facilityId}|${node.trustStatus}|${node.version}`);

    this.nodes.set(node.nodeId, node);
    try {
      await idbEngine.put('networkNodes', node);
    } catch {
      // Memory fallback
    }

    return node;
  }

  public async suspendNode(nodeId: string, suspendedBy: string, reason?: string): Promise<JanoNetworkNode> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`NODE_NOT_FOUND: Network node '${nodeId}' does not exist.`);
    }

    if (node.trustStatus === 'REVOKED') {
      throw new Error(`REVOKED_NODE_IMMUTABLE: Node '${nodeId}' is already REVOKED.`);
    }

    node.trustStatus = 'SUSPENDED';
    node.updatedAt = new Date().toISOString();
    node.version += 1;
    node.provenance = {
      ...node.provenance,
      suspendedBy,
      reason: reason || 'Temporarily suspended by Network Administrator',
      timestamp: node.updatedAt,
    };
    node.integrityHash = sha256(`${node.nodeId}|${node.nodeCode}|${node.facilityId}|${node.trustStatus}|${node.version}`);

    this.nodes.set(node.nodeId, node);
    try {
      await idbEngine.put('networkNodes', node);
    } catch {
      // Memory fallback
    }

    return node;
  }

  public async revokeNode(nodeId: string, revokedBy: string, reason?: string): Promise<JanoNetworkNode> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`NODE_NOT_FOUND: Network node '${nodeId}' does not exist.`);
    }

    node.trustStatus = 'REVOKED';
    node.networkStatus = 'OFFLINE';
    node.updatedAt = new Date().toISOString();
    node.version += 1;
    node.provenance = {
      ...node.provenance,
      revokedBy,
      reason: reason || 'Exchange trust permanently revoked',
      timestamp: node.updatedAt,
    };
    node.integrityHash = sha256(`${node.nodeId}|${node.nodeCode}|${node.facilityId}|${node.trustStatus}|${node.version}`);

    this.nodes.set(node.nodeId, node);
    try {
      await idbEngine.put('networkNodes', node);
    } catch {
      // Memory fallback
    }

    return node;
  }

  public updateNetworkStatus(nodeId: string, status: NetworkNodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.networkStatus = status;
      node.lastSeenAt = new Date().toISOString();
      node.updatedAt = node.lastSeenAt;
      this.nodes.set(nodeId, node);
    }
  }

  public getNode(nodeId: string): JanoNetworkNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getNodeByFacility(facilityId: string): JanoNetworkNode | undefined {
    const nodeId = this.facilityToNode.get(facilityId);
    if (nodeId) return this.nodes.get(nodeId);
    return Array.from(this.nodes.values()).find((n) => n.facilityId === facilityId);
  }

  public listNodes(filters?: {
    trustStatus?: NetworkTrustStatus;
    networkStatus?: NetworkNodeStatus;
    facilityId?: string;
  }): JanoNetworkNode[] {
    let list = Array.from(this.nodes.values());

    if (filters?.trustStatus) {
      list = list.filter((n) => n.trustStatus === filters.trustStatus);
    }
    if (filters?.networkStatus) {
      list = list.filter((n) => n.networkStatus === filters.networkStatus);
    }
    if (filters?.facilityId) {
      list = list.filter((n) => n.facilityId === filters.facilityId);
    }

    return list;
  }

  public resetToSyntheticDemo(): void {
    this.nodes.clear();
    this.facilityToNode.clear();
    this.seedDefaultNodes();
  }
}

export const janoNodeRegistryService = JanoNodeRegistryService.getInstance();
