/**
 * Jano Health - Outgoing Synchronization Queue
 * 
 * Implements ISyncQueue to manage clinical sync events, tracking status
 * (PENDING, SYNCING, SYNCED, FAILED, CONFLICT), backoff retries, and persistence
 * across offline app restarts.
 */

import { DomainEvent, ISyncQueue, SyncQueueStats } from '../../domain/persistence';
import { idbEngine } from '../storage/indexedDbEngine';

export class SyncQueue implements ISyncQueue {
  private static instance: SyncQueue;
  private queue: Map<string, DomainEvent> = new Map();
  private listeners: Set<(stats: SyncQueueStats) => void> = new Set();
  private initialized = false;
  private lastAttemptTime: string | null = null;
  private lastSuccessfulSyncTime: string | null = null;

  private constructor() {
    this.init();
  }

  public static getInstance(): SyncQueue {
    if (!SyncQueue.instance) {
      SyncQueue.instance = new SyncQueue();
    }
    return SyncQueue.instance;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const items = await idbEngine.getAll<DomainEvent>('syncQueue');
      items.forEach((item) => {
        this.queue.set(item.eventId, item);
      });
      this.initialized = true;
    } catch {
      this.initialized = true;
    }
  }

  public registerCommittedEvent(event: DomainEvent): void {
    const queueItem: DomainEvent = {
      ...event,
      syncStatus: 'PENDING',
      retryCount: 0,
    };
    (queueItem as any).id = queueItem.eventId;
    this.queue.set(queueItem.eventId, queueItem);
    this.notify();
  }

  public getCachedStats(): SyncQueueStats {
    const all = Array.from(this.queue.values());
    const pendingCount = all.filter((e) => e.syncStatus === 'PENDING').length;
    const syncingCount = all.filter((e) => e.syncStatus === 'SYNCING').length;
    const syncedCount = all.filter((e) => e.syncStatus === 'SYNCED').length;
    const failedCount = all.filter((e) => e.syncStatus === 'FAILED').length;
    const conflictCount = all.filter((e) => e.syncStatus === 'CONFLICT').length;

    let activeState: SyncQueueStats['activeState'] = 'IDLE';
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      activeState = 'OFFLINE';
    } else if (syncingCount > 0) {
      activeState = 'SYNCING';
    } else if (conflictCount > 0) {
      activeState = 'CONFLICT';
    } else if (failedCount > 0) {
      activeState = 'ERROR';
    }

    return {
      pendingCount,
      syncingCount,
      syncedCount,
      failedCount,
      conflictCount,
      totalEvents: all.length,
      lastAttemptTime: this.lastAttemptTime,
      lastSuccessfulSyncTime: this.lastSuccessfulSyncTime,
      activeState,
    };
  }

  public async enqueue(event: DomainEvent): Promise<void> {
    await this.init();
    // Enqueue cloned record with PENDING status
    const queueItem: DomainEvent = {
      ...event,
      syncStatus: 'PENDING',
      retryCount: 0,
    };
    (queueItem as any).id = queueItem.eventId;
    this.queue.set(queueItem.eventId, queueItem);
    await idbEngine.put('syncQueue', queueItem);
    this.notify();
  }

  public async peekPending(batchSize = 25): Promise<DomainEvent[]> {
    await this.init();
    const pending = Array.from(this.queue.values())
      .filter((e) => e.syncStatus === 'PENDING' || e.syncStatus === 'FAILED')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return pending.slice(0, batchSize);
  }

  public async markSyncing(eventIds: string[]): Promise<void> {
    await this.init();
    this.lastAttemptTime = new Date().toISOString();
    for (const id of eventIds) {
      const item = this.queue.get(id);
      if (item) {
        (item as any).id = item.eventId;
        item.syncStatus = 'SYNCING';
        item.lastAttemptAt = this.lastAttemptTime;
        await idbEngine.put('syncQueue', item);
      }
    }
    this.notify();
  }

  public async markSuccess(eventIds: string[]): Promise<void> {
    await this.init();
    this.lastSuccessfulSyncTime = new Date().toISOString();
    for (const id of eventIds) {
      const item = this.queue.get(id);
      if (item) {
        (item as any).id = item.eventId;
        item.syncStatus = 'SYNCED';
        await idbEngine.put('syncQueue', item);
      }
    }
    this.notify();
  }

  public async markFailed(eventId: string, error: string, retryCount: number): Promise<void> {
    await this.init();
    const item = this.queue.get(eventId);
    if (item) {
      (item as any).id = item.eventId;
      item.syncStatus = 'FAILED';
      item.syncError = error;
      item.retryCount = retryCount;
      item.lastAttemptAt = new Date().toISOString();
      await idbEngine.put('syncQueue', item);
    }
    this.notify();
  }

  public async markConflict(eventId: string, details: string): Promise<void> {
    await this.init();
    const item = this.queue.get(eventId);
    if (item) {
      (item as any).id = item.eventId;
      item.syncStatus = 'CONFLICT';
      item.syncError = details;
      await idbEngine.put('syncQueue', item);
    }
    this.notify();
  }

  public async getStats(): Promise<SyncQueueStats> {
    await this.init();
    const all = Array.from(this.queue.values());
    const pendingCount = all.filter((e) => e.syncStatus === 'PENDING').length;
    const syncingCount = all.filter((e) => e.syncStatus === 'SYNCING').length;
    const syncedCount = all.filter((e) => e.syncStatus === 'SYNCED').length;
    const failedCount = all.filter((e) => e.syncStatus === 'FAILED').length;
    const conflictCount = all.filter((e) => e.syncStatus === 'CONFLICT').length;

    let activeState: SyncQueueStats['activeState'] = 'IDLE';
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      activeState = 'OFFLINE';
    } else if (syncingCount > 0) {
      activeState = 'SYNCING';
    } else if (conflictCount > 0) {
      activeState = 'CONFLICT';
    } else if (failedCount > 0) {
      activeState = 'ERROR';
    }

    return {
      pendingCount,
      syncingCount,
      syncedCount,
      failedCount,
      conflictCount,
      totalEvents: all.length,
      lastAttemptTime: this.lastAttemptTime,
      lastSuccessfulSyncTime: this.lastSuccessfulSyncTime,
      activeState,
    };
  }

  public async clearCompleted(): Promise<void> {
    await this.init();
    const toRemove: string[] = [];
    for (const [id, item] of this.queue.entries()) {
      if (item.syncStatus === 'SYNCED') {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.queue.delete(id);
      await idbEngine.delete('syncQueue', id);
    }
    this.notify();
  }

  public subscribe(listener: (stats: SyncQueueStats) => void): () => void {
    this.listeners.add(listener);
    this.getStats().then((s) => listener(s));
    return () => this.listeners.delete(listener);
  }

  private async notify(): Promise<void> {
    const stats = await this.getStats();
    this.listeners.forEach((fn) => fn(stats));
  }
}

export const syncQueue = SyncQueue.getInstance();
