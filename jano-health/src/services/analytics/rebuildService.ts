/**
 * Jano Health - Deterministic Analytics Rebuild Service
 * Clinical Core V14: Reproducible Aggregation from Append-Only Source Events
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Analytics layer must be completely rebuildable from durable source events.
 * 2. A rebuilt aggregate produces the exact same result for the same source state and metric version.
 * 3. Never delete source clinical records because an analytical record is cleared or recalculated.
 */

import { EventStore } from '../events/eventStore';
import { analyticalFactStore } from './factStore';
import { metricEngine } from './metricEngine';

export interface RebuildResult {
  rebuiltFactsCount: number;
  durationMs: number;
  rebuiltAt: string;
  scope: string;
}

export class AnalyticsRebuildService {
  private static instance: AnalyticsRebuildService;

  private constructor() {
    // Automatically subscribe fact store to newly committed domain events
    EventStore.getInstance().subscribe((event) => {
      analyticalFactStore.ingestDomainEvent(event).catch((err) => {
        console.warn('[AnalyticsRebuildService] Auto-ingestion error:', err);
      });
    });
  }

  public static getInstance(): AnalyticsRebuildService {
    if (!AnalyticsRebuildService.instance) {
      AnalyticsRebuildService.instance = new AnalyticsRebuildService();
    }
    return AnalyticsRebuildService.instance;
  }

  /**
   * Performs a deterministic full rebuild of all analytical facts from the append-only event store.
   */
  public async rebuildAll(): Promise<RebuildResult> {
    const startTime = Date.now();
    await analyticalFactStore.clear();

    const allEvents = await EventStore.getInstance().getAllEvents(10000);
    // Sort chronologically ascending
    allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let count = 0;
    for (const evt of allEvents) {
      const fact = await analyticalFactStore.ingestDomainEvent(evt);
      if (fact) count++;
    }

    return {
      rebuiltFactsCount: count,
      durationMs: Date.now() - startTime,
      rebuiltAt: new Date().toISOString(),
      scope: 'ALL_FACILITIES',
    };
  }

  /**
   * Rebuilds facts within a specific time window.
   */
  public async rebuildTimeWindow(fromTimestamp: string, toTimestamp: string): Promise<RebuildResult> {
    const startTime = Date.now();
    const allEvents = await EventStore.getInstance().getAllEvents(10000);
    const windowEvents = allEvents.filter(
      (e) => e.timestamp >= fromTimestamp && e.timestamp <= toTimestamp
    );
    windowEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let count = 0;
    for (const evt of windowEvents) {
      const fact = await analyticalFactStore.ingestDomainEvent(evt);
      if (fact) count++;
    }

    return {
      rebuiltFactsCount: count,
      durationMs: Date.now() - startTime,
      rebuiltAt: new Date().toISOString(),
      scope: `TIME_WINDOW_${fromTimestamp}_${toTimestamp}`,
    };
  }

  /**
   * Rebuilds facts for a single facility.
   */
  public async rebuildFacility(facilityId: string): Promise<RebuildResult> {
    const startTime = Date.now();
    const allEvents = await EventStore.getInstance().getAllEvents(10000);
    const facilityEvents = allEvents.filter((e) => e.facilityId === facilityId);
    facilityEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let count = 0;
    for (const evt of facilityEvents) {
      const fact = await analyticalFactStore.ingestDomainEvent(evt);
      if (fact) count++;
    }

    return {
      rebuiltFactsCount: count,
      durationMs: Date.now() - startTime,
      rebuiltAt: new Date().toISOString(),
      scope: `FACILITY_${facilityId}`,
    };
  }
}

export const analyticsRebuildService = AnalyticsRebuildService.getInstance();
