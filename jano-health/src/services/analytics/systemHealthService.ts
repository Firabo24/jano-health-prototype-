/**
 * Jano Health - System Health Intelligence Service
 * Clinical Core V14: Platform Operational Health, Exchange Queues, and Infrastructure Telemetry
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Platform operational telemetry is completely distinct from population health indicators.
 * 2. Tracks queue depth, dead-letter count, quarantine count, and node connectivity.
 * 3. Telemetry never exposes unnecessary patient-level data.
 */

import { SystemHealthSummary } from '../../domain/analyticsTypes';
import { durableExchangeQueue } from '../network/messageQueue';
import { networkQuarantineService } from '../network/quarantine';
import { janoNodeRegistryService } from '../network/nodeRegistry';

export class SystemHealthIntelligenceService {
  private static instance: SystemHealthIntelligenceService;

  private constructor() {}

  public static getInstance(): SystemHealthIntelligenceService {
    if (!SystemHealthIntelligenceService.instance) {
      SystemHealthIntelligenceService.instance = new SystemHealthIntelligenceService();
    }
    return SystemHealthIntelligenceService.instance;
  }

  /**
   * Retrieves operational health summary of the Jano platform.
   */
  public async getSystemHealth(): Promise<SystemHealthSummary> {
    const queue = durableExchangeQueue.getQueue();
    const deadLetter = queue.filter((m) => m.currentState === 'DEAD_LETTER');
    const quarantineItems = networkQuarantineService.listQuarantined({ status: 'PENDING_REVIEW' });
    const nodes = janoNodeRegistryService.listNodes();
    const onlineNodes = nodes.filter((n) => n.networkStatus === 'ONLINE');
    const offlineNodes = nodes.filter((n) => n.networkStatus === 'OFFLINE');

    let overallHealth: SystemHealthSummary['overallHealth'] = 'HEALTHY';
    if (deadLetter.length > 5 || offlineNodes.length > 2) {
      overallHealth = 'DEGRADED';
    }

    return {
      overallHealth,
      databaseStatus: 'HEALTHY',
      syncStatus: 'SYNCED',
      networkExchangeQueueDepth: queue.length,
      deadLetterCount: deadLetter.length,
      quarantinedCount: quarantineItems.length,
      connectedNodesCount: onlineNodes.length,
      offlineNodesCount: offlineNodes.length,
      aiServiceStatus: 'AI_AVAILABLE',
      fhirGatewayStatus: 'OPERATIONAL',
      lastCheckedAt: new Date().toISOString(),
    };
  }
}

export const systemHealthIntelligenceService = SystemHealthIntelligenceService.getInstance();
