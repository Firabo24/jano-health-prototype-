/**
 * Jano Health - Offline Condition Analysis Service (V24)
 * Analyzes multi-site performance under real-world disconnected operations,
 * store pressure, sync latency, and local conflict resolution.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import { OfflineConditionAnalysis } from '../../domain/v24MultiSiteEvidenceTypes';

export class OfflineConditionAnalysisService {
  private analyses: Map<string, OfflineConditionAnalysis> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const o1: OfflineConditionAnalysis = {
      analysisId: 'off-analysis-site-amani-01',
      siteId: 'site-amani-01',
      periodStart: '2026-02-01T00:00:00.000Z',
      periodEnd: '2026-02-28T23:59:59.000Z',
      totalOfflineHours: 142.5,
      longestOfflineSessionMinutes: 780,
      offlineTransactionCount: 1420,
      syncLatencyAverageMinutes: 34.2,
      maxSyncQueueDepth: 184,
      conflictResolutionCount: 3,
      failedSyncBatchesCount: 0,
      environmentalNetworkConstraintScore: 78,
      softwareResilienceScore: 99,
    };

    const o2: OfflineConditionAnalysis = {
      analysisId: 'off-analysis-site-kilima-02',
      siteId: 'site-kilima-02',
      periodStart: '2026-02-01T00:00:00.000Z',
      periodEnd: '2026-02-28T23:59:59.000Z',
      totalOfflineHours: 298.0,
      longestOfflineSessionMinutes: 1440,
      offlineTransactionCount: 860,
      syncLatencyAverageMinutes: 88.5,
      maxSyncQueueDepth: 312,
      conflictResolutionCount: 5,
      failedSyncBatchesCount: 1,
      environmentalNetworkConstraintScore: 92,
      softwareResilienceScore: 97,
    };

    this.analyses.set(o1.siteId, o1);
    this.analyses.set(o2.siteId, o2);
  }

  public async getAnalysis(siteId: string): Promise<OfflineConditionAnalysis | null> {
    return this.analyses.get(siteId) || null;
  }

  public async listAnalyses(): Promise<OfflineConditionAnalysis[]> {
    return Array.from(this.analyses.values());
  }

  public async recordOfflineAnalysis(
    params: Omit<OfflineConditionAnalysis, 'analysisId'>
  ): Promise<OfflineConditionAnalysis> {
    const analysis: OfflineConditionAnalysis = {
      ...params,
      analysisId: `off-analysis-${params.siteId}-${Date.now().toString(16)}`,
    };
    this.analyses.set(analysis.siteId, analysis);
    await idbEngine.put('offlineConditionAnalyses', analysis);
    return analysis;
  }
}

export const offlineConditionAnalysisService = new OfflineConditionAnalysisService();
