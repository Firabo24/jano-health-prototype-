/**
 * Jano Health - Security & Clinical Audit Layer
 * Guarantees tamper-evident, append-only operational audit trails across offline & online states.
 */

import { AuditEvent, RoleType } from '../../domain/types';
import { localDb } from '../storage/localDatabase';
import { auditRepository } from './auditRepository';
import { generateAuditId } from '../../domain/identifiers';

export interface AuditContext {
  actorId: string;
  actorName: string;
  actorRole: RoleType;
  facilityId: string;
  deviceId?: string;
}

class AuditService {
  private static instance: AuditService;
  private inMemoryTrail: AuditEvent[] = [];
  private persistenceMap = new Map<
    string,
    { status: 'provisional' | 'persisted' | 'failed'; error?: Error; promise: Promise<void> }
  >();

  private constructor() {}

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  public record(
    context: AuditContext,
    action: string,
    resourceType: string,
    resourceId: string,
    resultingState?: Record<string, unknown>,
    previousState?: Record<string, unknown>
  ): AuditEvent {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;
    const event: AuditEvent = {
      id: generateAuditId(),
      actorId: context.actorId,
      actorName: context.actorName,
      actorRole: context.actorRole,
      facilityId: context.facilityId,
      action,
      resourceType,
      resourceId,
      timestamp: new Date().toISOString(),
      deviceId: context.deviceId || localDb.getDeviceId(),
      syncStatus: isOnline ? 'synced' : 'offline_retained',
      resultingState,
      previousState,
      isProvisional: true,
      persistenceStatus: 'provisional',
    };

    // Keep immediate in-memory reference for synchronous queries
    this.inMemoryTrail.unshift(event);
    if (this.inMemoryTrail.length > 500) {
      this.inMemoryTrail.length = 500;
    }

    // Authoritative durable persistence via auditRepository (IndexedDB hash chain)
    const durablePromise = (async () => {
      try {
        await auditRepository.record(event);
        event.isProvisional = false;
        event.persistenceStatus = 'persisted';
        event.persistenceError = undefined;
        const entry = this.persistenceMap.get(event.id);
        if (entry) {
          entry.status = 'persisted';
          delete entry.error;
        }
      } catch (err: any) {
        event.isProvisional = false;
        event.persistenceStatus = 'failed';
        event.persistenceError = err?.message || String(err);
        const entry = this.persistenceMap.get(event.id);
        if (entry) {
          entry.status = 'failed';
          entry.error = err instanceof Error ? err : new Error(String(err));
        }
        console.warn('[AuditService] Authoritative audit write failed for event', event.id, err);
        throw err;
      }
    })();

    // Prevent uncaught rejection warnings when callers do not await
    durablePromise.catch(() => {});

    this.persistenceMap.set(event.id, {
      status: 'provisional',
      promise: durablePromise,
    });

    // Secondary localDb IndexedDB mirror write (failure here does not mask authoritative persistence)
    localDb.recordAuditLog(event).catch((mirrorErr) => {
      console.warn('[AuditService] Secondary localDb audit mirror write failed:', mirrorErr);
    });

    return event;
  }

  public getPersistenceStatus(eventId: string): 'provisional' | 'persisted' | 'failed' | 'unknown' {
    return this.persistenceMap.get(eventId)?.status || 'unknown';
  }

  public getPersistenceError(eventId: string): Error | undefined {
    return this.persistenceMap.get(eventId)?.error;
  }

  public async awaitDurable(eventId: string): Promise<AuditEvent> {
    const entry = this.persistenceMap.get(eventId);
    if (!entry) {
      const existing = await auditRepository.getLastAudit();
      if (existing && existing.id === eventId) return existing;
      throw new Error(`[AuditService] No pending or known durable write found for event [${eventId}]`);
    }
    await entry.promise;
    return this.inMemoryTrail.find((e) => e.id === eventId) || (await auditRepository.getLastAudit())!;
  }

  public async recordDurable(
    context: AuditContext,
    action: string,
    resourceType: string,
    resourceId: string,
    resultingState?: Record<string, unknown>,
    previousState?: Record<string, unknown>
  ): Promise<AuditEvent> {
    const event = this.record(context, action, resourceType, resourceId, resultingState, previousState);
    return this.awaitDurable(event.id);
  }

  public getTrail(resourceId?: string, limit = 100): AuditEvent[] {
    const dbLogs = localDb.getAuditLogs();
    const seen = new Set<string>();
    const all: AuditEvent[] = [];
    for (const item of [...this.inMemoryTrail, ...dbLogs]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        if (!item.persistenceStatus) {
          item.persistenceStatus = 'persisted';
          item.isProvisional = false;
        }
        all.push(item);
      }
    }
    if (resourceId) {
      return all.filter((l) => l.resourceId === resourceId).slice(0, limit);
    }
    return all.slice(0, limit);
  }

  public async getDurableTrail(filters?: {
    resourceId?: string;
    resourceType?: string;
    actorId?: string;
    facilityId?: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const logs = await auditRepository.query(filters);
    return logs.map((l) => ({
      ...l,
      isProvisional: false,
      persistenceStatus: 'persisted' as const,
    }));
  }

  public logSecurityEvent(event: {
    actorId: string;
    actorName: string;
    actorRole: RoleType;
    facilityId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
  }): AuditEvent {
    return this.record(
      {
        actorId: event.actorId,
        actorName: event.actorName,
        actorRole: event.actorRole,
        facilityId: event.facilityId,
      },
      event.action,
      event.resourceType,
      event.resourceId,
      event.details
    );
  }

  public async log(event: {
    action: string;
    actorId?: string;
    actorName?: string;
    actorRole?: RoleType;
    facilityId?: string;
    patientId?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, unknown>;
  }): Promise<AuditEvent> {
    return this.record(
      {
        actorId: event.actorId || 'system',
        actorName: event.actorName || 'Clinical Actor',
        actorRole: event.actorRole || 'nurse',
        facilityId: event.facilityId || 'fac_default',
      },
      event.action,
      event.resourceType || 'Patient',
      event.resourceId || event.patientId || 'unknown',
      event.details
    );
  }
}

export const auditService = AuditService.getInstance();
