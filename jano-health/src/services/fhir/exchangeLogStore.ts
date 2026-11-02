/**
 * Jano Health - FHIR Exchange Log Store
 * Clinical Core V12: Audit & Operational Interaction Records
 * 
 * Invariants:
 * 1. Stores exchange records without storing unnecessary sensitive PHI payloads.
 * 2. Captures correlation IDs, durations, response codes, external system identities, and quality signals.
 */

import { FHIRExchangeLogEntry } from './gatewayTypes';

export class FHIRExchangeLogStore {
  private static instance: FHIRExchangeLogStore;
  private logs: FHIRExchangeLogEntry[] = [];
  private maxLogs = 500;

  private constructor() {}

  public static getInstance(): FHIRExchangeLogStore {
    if (!FHIRExchangeLogStore.instance) {
      FHIRExchangeLogStore.instance = new FHIRExchangeLogStore();
    }
    return FHIRExchangeLogStore.instance;
  }

  public recordLog(entry: FHIRExchangeLogEntry): void {
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  public getLogs(filter?: {
    externalSystemId?: string;
    direction?: 'INBOUND' | 'OUTBOUND';
    success?: boolean;
    resourceType?: string;
  }): FHIRExchangeLogEntry[] {
    let result = [...this.logs];
    if (!filter) return result;

    if (filter.externalSystemId) {
      result = result.filter((l) => l.externalSystemId === filter.externalSystemId);
    }
    if (filter.direction) {
      result = result.filter((l) => l.direction === filter.direction);
    }
    if (filter.success !== undefined) {
      result = result.filter((l) => l.success === filter.success);
    }
    if (filter.resourceType) {
      result = result.filter((l) => l.resourceType === filter.resourceType);
    }
    return result;
  }

  public getLogById(exchangeId: string): FHIRExchangeLogEntry | undefined {
    return this.logs.find((l) => l.exchangeId === exchangeId);
  }

  public clear(): void {
    this.logs = [];
  }
}

export const fhirExchangeLogStore = FHIRExchangeLogStore.getInstance();
