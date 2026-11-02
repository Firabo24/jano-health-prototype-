/**
 * Jano Health - Network Observability & Exchange Metrics Subsystem
 * Clinical Core V13: Telemetry, SLA Latency Tracking, and Exchange Audit Logging
 */

import { NetworkExchangeLogEntry, ExchangeLifecycleState } from '../../domain/types';
import { NetworkMetricsSummary } from './types';
import { janoNodeRegistryService } from './nodeRegistry';
import { durableExchangeQueue } from './messageQueue';
import { networkQuarantineService } from './quarantine';
import { idbEngine } from '../storage/indexedDbEngine';

export class NetworkObservabilityService {
  private static instance: NetworkObservabilityService;
  private logs: NetworkExchangeLogEntry[] = [];
  private policyDenials = 0;
  private trustFailures = 0;

  private constructor() {}

  public static getInstance(): NetworkObservabilityService {
    if (!NetworkObservabilityService.instance) {
      NetworkObservabilityService.instance = new NetworkObservabilityService();
    }
    return NetworkObservabilityService.instance;
  }

  public async recordLog(entry: Omit<NetworkExchangeLogEntry, 'id' | 'timestamp'>): Promise<NetworkExchangeLogEntry> {
    const fullEntry: NetworkExchangeLogEntry = {
      id: `log-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > 500) {
      this.logs.pop();
    }

    try {
      await idbEngine.put('networkTelemetry', fullEntry);
    } catch {
      // Memory fallback
    }

    return fullEntry;
  }

  public recordPolicyDenial(): void {
    this.policyDenials += 1;
  }

  public recordTrustFailure(): void {
    this.trustFailures += 1;
  }

  public getLogs(limit = 100): NetworkExchangeLogEntry[] {
    return this.logs.slice(0, limit);
  }

  public getMetricsSummary(): NetworkMetricsSummary {
    const allMessages = durableExchangeQueue.getQueue();
    const queuedCount = allMessages.filter((m) => m.currentState === 'QUEUED').length;
    const deliveredCount = allMessages.filter((m) => m.currentState === 'DELIVERED').length;
    const acknowledgedCount = allMessages.filter((m) => m.currentState === 'ACKNOWLEDGED').length;
    const failedCount = allMessages.filter((m) => m.currentState === 'FAILED' || m.currentState === 'RETRY').length;
    const deadLetterCount = allMessages.filter((m) => m.currentState === 'DEAD_LETTER').length;
    const quarantinedItems = networkQuarantineService.listQuarantined();

    const nodes = janoNodeRegistryService.listNodes();
    const activeNodes = nodes.filter((n) => n.networkStatus === 'ONLINE').length;
    const trustedNodes = nodes.filter((n) => n.trustStatus === 'TRUSTED').length;

    const latencies = this.logs.map((l) => l.durationMs).filter((d) => d > 0);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 15;

    let health: 'HEALTHY' | 'DEGRADED' | 'DISRUPTED' = 'HEALTHY';
    if (deadLetterCount > 5 || failedCount > 10) {
      health = 'DISRUPTED';
    } else if (deadLetterCount > 0 || queuedCount > 20) {
      health = 'DEGRADED';
    }

    return {
      totalMessages: allMessages.length,
      queuedCount,
      deliveredCount,
      acknowledgedCount,
      failedCount,
      quarantinedCount: quarantinedItems.length,
      deadLetterCount,
      averageLatencyMs: avgLatency,
      activeNodesCount: activeNodes,
      trustedNodesCount: trustedNodes,
      policyDenialsCount: this.policyDenials,
      health,
    };
  }

  public resetMetrics(): void {
    this.logs = [];
    this.policyDenials = 0;
    this.trustFailures = 0;
  }
}

export const networkObservabilityService = NetworkObservabilityService.getInstance();
