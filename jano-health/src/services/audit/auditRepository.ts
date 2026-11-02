/**
 * Jano Health - Audit Repository
 * 
 * Implements IAuditRepository to provide an immutable, locally durable clinical audit ledger.
 * Ensures every clinical mutation, prescription, triage, and encounter modification is
 * recorded with user credentials, facility context, timestamp, and sync status.
 */

import { AuditEvent } from '../../domain/types';
import { IAuditRepository } from '../../domain/persistence';
import { idbEngine } from '../storage/indexedDbEngine';
import { DEMO_AUDIT_EVENTS } from '../../data/syntheticDemoData';
import { generateAuditId } from '../../domain/identifiers';
import { computeAuditHash, verifyAuditChain, deepFreeze } from '../../domain/eventIntegrity';

export class AuditRepository implements IAuditRepository {
  private static instance: AuditRepository;
  private cache: Map<string, AuditEvent> = new Map();
  private listeners: Set<(event: AuditEvent) => void> = new Set();
  private lastRecordedAudit: AuditEvent | null = null;
  private initialized = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): AuditRepository {
    if (!AuditRepository.instance) {
      AuditRepository.instance = new AuditRepository();
    }
    return AuditRepository.instance;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const logs = await idbEngine.getAll<AuditEvent>('auditLog');
      logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (logs.length === 0) {
        DEMO_AUDIT_EVENTS.forEach((e) => {
          this.cache.set(e.id, e);
          this.lastRecordedAudit = e;
        });
        await idbEngine.putBatch('auditLog', DEMO_AUDIT_EVENTS);
      } else {
        logs.forEach((e) => {
          this.cache.set(e.id, e);
          this.lastRecordedAudit = e;
        });
      }
      this.initialized = true;
    } catch {
      DEMO_AUDIT_EVENTS.forEach((e) => {
        this.cache.set(e.id, e);
        this.lastRecordedAudit = e;
      });
      this.initialized = true;
    }
  }

  public async getLastAudit(): Promise<AuditEvent | null> {
    await this.init();
    return this.lastRecordedAudit;
  }

  public registerCommittedAudit(event: AuditEvent): void {
    const immutableEvent: AuditEvent = deepFreeze(event);
    this.cache.set(immutableEvent.id, immutableEvent);
    this.lastRecordedAudit = immutableEvent;

    this.listeners.forEach((fn) => {
      try {
        fn(immutableEvent);
      } catch (err) {
        console.error('[AuditRepository] Listener error:', err);
      }
    });
  }

  public async record(event: AuditEvent): Promise<void> {
    await this.init();
    const prevHash = this.lastRecordedAudit ? (this.lastRecordedAudit.auditHash || null) : null;
    const auditId = event.id || generateAuditId();
    const auditHash = event.auditHash || computeAuditHash({ ...event, id: auditId }, prevHash);

    const immutableEvent: AuditEvent = deepFreeze({
      ...event,
      id: auditId,
      previousAuditHash: event.previousAuditHash !== undefined ? event.previousAuditHash : prevHash,
      auditHash,
    });

    // Commit durably to IndexedDB before updating memory cache
    await idbEngine.put('auditLog', immutableEvent);

    this.cache.set(immutableEvent.id, immutableEvent);
    this.lastRecordedAudit = immutableEvent;

    this.listeners.forEach((fn) => {
      try {
        fn(immutableEvent);
      } catch (err) {
        console.error('[AuditRepository] Listener error:', err);
      }
    });
  }

  public async verifyIntegrity(): Promise<{ valid: boolean; brokenAtIndex?: number; brokenAuditId?: string; reason?: string }> {
    await this.init();
    const sorted = Array.from(this.cache.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return verifyAuditChain(sorted);
  }

  public async query(filters?: {
    resourceId?: string;
    resourceType?: string;
    actorId?: string;
    facilityId?: string;
    syncStatus?: 'synced' | 'pending' | 'offline_retained';
    limit?: number;
  }): Promise<AuditEvent[]> {
    await this.init();
    let list = Array.from(this.cache.values());

    if (filters?.resourceId) {
      list = list.filter((a) => a.resourceId === filters.resourceId);
    }
    if (filters?.resourceType) {
      list = list.filter((a) => a.resourceType === filters.resourceType);
    }
    if (filters?.actorId) {
      list = list.filter((a) => a.actorId === filters.actorId);
    }
    if (filters?.facilityId) {
      list = list.filter((a) => a.facilityId === filters.facilityId);
    }
    if (filters?.syncStatus) {
      list = list.filter((a) => a.syncStatus === filters.syncStatus);
    }

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list.slice(0, filters?.limit || 100);
  }

  public async getPendingSync(): Promise<AuditEvent[]> {
    await this.init();
    return Array.from(this.cache.values())
      .filter((a) => a.syncStatus === 'pending' || a.syncStatus === 'offline_retained')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async markSynced(auditIds: string[]): Promise<void> {
    await this.init();
    for (const id of auditIds) {
      const existing = this.cache.get(id);
      if (existing) {
        const updated: AuditEvent = Object.freeze({
          ...existing,
          syncStatus: 'synced',
        });
        this.cache.set(id, updated);
        await idbEngine.put('auditLog', updated);
      }
    }
  }

  public subscribe(listener: (event: AuditEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const auditRepository = AuditRepository.getInstance();
