/**
 * Jano Health - Device & Edge Fleet Management Service (V25)
 * Governs edge devices, lifecycle states, distributed topology roles, and quarantine controls.
 * 
 * HARD INVARIANTS:
 * - Full offline operational capability is maintained on approved clinical edge devices.
 * - Quarantined devices are isolated immediately from synchronization while preserving local read-only emergency access.
 * - Distributed topology roles (Edge, Hub, District Node, Cloud Node) are modeled explicitly.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  EdgeDeviceRecord,
  TopologyNodeRecord,
  DeviceLifecycleState,
  TopologyRole,
} from '../../domain/v25ScaleOperationsTypes';

export class EdgeFleetService {
  private devices: Map<string, EdgeDeviceRecord> = new Map();
  private nodes: Map<string, TopologyNodeRecord> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    // 1. Certified Edge Devices at Amani
    const dev1: EdgeDeviceRecord = {
      deviceId: 'dev-amani-tablet-01',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-amani-primary-clinic',
      hardwareModel: 'Samsung Galaxy Active Tab 4 Pro',
      serialNumber: 'R52N809XABC',
      softwareVersion: '25.0.0',
      dbVersion: 25,
      storageCapacityBytes: 64 * 1024 * 1024 * 1024,
      storageUsedBytes: 8 * 1024 * 1024 * 1024,
      lifecycleState: 'ACTIVE',
      securityState: 'COMPLIANT',
      isOfflineOperational: true,
      nodeAssignmentId: 'node-amani-local-hub',
      lastSyncAt: '2026-06-12T08:30:00Z',
      registeredAt: '2026-06-01T08:00:00Z',
    };
    this.devices.set(dev1.deviceId, dev1);

    const dev2: EdgeDeviceRecord = {
      deviceId: 'dev-amani-station-02',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-amani-primary-clinic',
      hardwareModel: 'HP EliteDesk Mini Low-Power G5',
      serialNumber: '2UA9304XYZ',
      softwareVersion: '25.0.0',
      dbVersion: 25,
      storageCapacityBytes: 256 * 1024 * 1024 * 1024,
      storageUsedBytes: 32 * 1024 * 1024 * 1024,
      lifecycleState: 'ACTIVE',
      securityState: 'COMPLIANT',
      isOfflineOperational: true,
      nodeAssignmentId: 'node-amani-local-hub',
      lastSyncAt: '2026-06-12T08:45:00Z',
      registeredAt: '2026-06-01T08:00:00Z',
    };
    this.devices.set(dev2.deviceId, dev2);

    // 2. Topology Nodes
    const node1: TopologyNodeRecord = {
      nodeId: 'node-amani-local-hub',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-amani-primary-clinic',
      topologyRole: 'FACILITY_HUB',
      endpointUrl: 'https://hub.amani.internal:8443',
      peerNodeIds: ['node-kilima-district-node'],
      trustState: 'VERIFIED_MUTUAL_TLS',
      softwareVersion: '25.0.0',
      dbVersion: 25,
      syncHealth: 'SYNCHRONIZED',
      lastHeartbeatAt: '2026-06-12T09:00:00Z',
    };
    this.nodes.set(node1.nodeId, node1);

    const node2: TopologyNodeRecord = {
      nodeId: 'node-kilima-district-node',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-kilima-subcounty-hospital',
      topologyRole: 'DISTRICT_NETWORK_NODE',
      endpointUrl: 'https://node.kilima.district.internal:8443',
      peerNodeIds: ['node-amani-local-hub'],
      trustState: 'VERIFIED_MUTUAL_TLS',
      softwareVersion: '25.0.0',
      dbVersion: 25,
      syncHealth: 'SYNCHRONIZED',
      lastHeartbeatAt: '2026-06-12T09:00:00Z',
    };
    this.nodes.set(node2.nodeId, node2);
  }

  // Device Methods
  public async getDevice(deviceId: string): Promise<EdgeDeviceRecord | null> {
    return this.devices.get(deviceId) || null;
  }

  public async listDevices(facilityId?: string): Promise<EdgeDeviceRecord[]> {
    const all = Array.from(this.devices.values());
    if (facilityId) return all.filter((d) => d.facilityId === facilityId);
    return all;
  }

  public async registerDevice(device: EdgeDeviceRecord): Promise<EdgeDeviceRecord> {
    this.devices.set(device.deviceId, device);
    await idbEngine.put('edgeDevices', device);
    return device;
  }

  public async transitionDeviceState(
    deviceId: string,
    nextState: DeviceLifecycleState,
    reason?: string
  ): Promise<EdgeDeviceRecord> {
    const dev = this.devices.get(deviceId);
    if (!dev) throw new Error(`Device ${deviceId} not found`);

    dev.lifecycleState = nextState;
    if (nextState === 'QUARANTINED') {
      dev.quarantineReason = reason || 'Security finding or communication anomaly';
      dev.securityState = 'ISOLATED';
    } else if (nextState === 'RETIRED') {
      dev.isOfflineOperational = false;
    }

    this.devices.set(deviceId, dev);
    await idbEngine.put('edgeDevices', dev);
    return dev;
  }

  // Topology Node Methods
  public async getNode(nodeId: string): Promise<TopologyNodeRecord | null> {
    return this.nodes.get(nodeId) || null;
  }

  public async listNodes(): Promise<TopologyNodeRecord[]> {
    return Array.from(this.nodes.values());
  }

  public async registerNode(node: TopologyNodeRecord): Promise<TopologyNodeRecord> {
    this.nodes.set(node.nodeId, node);
    await idbEngine.put('topologyNodes', node);
    return node;
  }
}

export const edgeFleetService = new EdgeFleetService();
