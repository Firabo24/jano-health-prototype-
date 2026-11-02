/**
 * Jano Health - Immutable Append-Only Event Store
 * 
 * Implements IEventStore for clinical event sourcing.
 * Guarantees that historical clinical events are immutable once created.
 * Tracks monotonic sequence and aggregate versions, persists to IndexedDB,
 * and notifies reactive listeners.
 */

import { AggregateType, DomainEvent, IEventStore, SyncStatus } from '../../domain/persistence';
import { idbEngine, registerDomainEventCommitListener } from '../storage/indexedDbEngine';
import { deepFreeze, computeEventHash, sortEventChain, validateEventChainIntegrity } from '../../domain/eventIntegrity';

export class EventStore implements IEventStore {
  private static instance: EventStore;
  private listeners: Set<(event: DomainEvent) => void> = new Set();
  private eventCache: Map<string, DomainEvent> = new Map();
  private sequenceCounters: Map<string, number> = new Map();
  private lastAppendedEvent: DomainEvent | null = null;
  private initialized = false;

  public constructor() {
    registerDomainEventCommitListener((ev) => {
      this.registerCommittedEvent(ev);
    });
    this.init().catch((err) => {
      console.warn('[EventStore] Asynchronous initial load warning:', err.message);
    });
  }

  public static getInstance(): EventStore {
    if (!EventStore.instance) {
      EventStore.instance = new EventStore();
    }
    return EventStore.instance;
  }

  public async init(forceReload = false): Promise<void> {
    if (this.initialized && !forceReload) return;
    const stored = await idbEngine.getAll<DomainEvent>('domainEvents');
    const validation = validateEventChainIntegrity(stored);
    if (!validation.valid) {
      this.initialized = false;
      this.lastAppendedEvent = null;
      this.eventCache.clear();
      this.sequenceCounters.clear();
      throw new Error(`[EventStore] Failed to initialize: Authoritative event chain integrity violation: ${validation.error}`);
    }

    const sorted = validation.sortedEvents;
    this.eventCache.clear();
    this.sequenceCounters.clear();
    this.lastAppendedEvent = null;
    sorted.forEach((ev) => {
      this.eventCache.set(ev.eventId, ev);
      const aggKey = `${ev.aggregateType}:${ev.aggregateId}`;
      const currentSeq = this.sequenceCounters.get(aggKey) || 0;
      if (ev.sequence > currentSeq) {
        this.sequenceCounters.set(aggKey, ev.sequence);
      }
      this.lastAppendedEvent = ev;
    });
    this.initialized = true;
  }

  public getEvent(eventId: string): DomainEvent | undefined {
    return this.eventCache.get(eventId);
  }

  public async getLastEvent(): Promise<DomainEvent | null> {
    await this.init();
    return this.lastAppendedEvent;
  }

  public registerCommittedEvent(event: DomainEvent): void {
    const existing = this.eventCache.get(event.eventId);
    if (existing && existing.eventHash && existing.eventHash !== event.eventHash) {
      // The event was already finalized and committed with an authoritative hash.
      // Do not overwrite with a stale draft.
      return;
    }

    const immutableEvent: DomainEvent = deepFreeze(event);
    this.eventCache.set(immutableEvent.eventId, immutableEvent);
    const aggKey = `${immutableEvent.aggregateType}:${immutableEvent.aggregateId}`;
    const cur = this.sequenceCounters.get(aggKey) || 0;
    if (immutableEvent.sequence > cur) {
      this.sequenceCounters.set(aggKey, immutableEvent.sequence);
    }
    this.lastAppendedEvent = immutableEvent;

    // Notify reactive listeners
    this.listeners.forEach((fn) => {
      try {
        fn(immutableEvent);
      } catch (err) {
        console.error('[EventStore] Listener error:', err);
      }
    });
  }

  public async getNextSequence(aggregateType: AggregateType, aggregateId: string): Promise<number> {
    await this.init();
    const aggKey = `${aggregateType}:${aggregateId}`;
    const current = this.sequenceCounters.get(aggKey) || 0;
    const next = current + 1;
    this.sequenceCounters.set(aggKey, next);
    return next;
  }

  /**
   * Prepares and cryptographically seals a domain event for atomic transaction commit.
   * Does NOT persist or update in-memory cache until registerCommittedEvent is called.
   */
  public async prepareEvent(event: DomainEvent): Promise<DomainEvent> {
    await this.init();

    if (this.eventCache.has(event.eventId)) {
      throw new Error(`[EventStore] Event ${event.eventId} already exists in cache. Cannot prepare duplicate.`);
    }

    const prevHash = this.lastAppendedEvent ? (this.lastAppendedEvent.eventHash || null) : null;
    const aggKey = `${event.aggregateType}:${event.aggregateId}`;
    const cur = this.sequenceCounters.get(aggKey) || 0;
    const sequence = event.sequence && event.sequence > cur ? event.sequence : cur + 1;
    const targetHashVersion = event.hashVersion ?? 2;
    const eventWithSeq = {
      ...event,
      id: event.eventId,
      sequence,
      previousEventHash: event.previousEventHash !== undefined ? event.previousEventHash : prevHash,
      hashVersion: targetHashVersion,
    };
    const eventHash = event.eventHash || computeEventHash(eventWithSeq, prevHash);

    return deepFreeze({
      ...eventWithSeq,
      eventHash,
    });
  }

  /**
   * Append an immutable domain event.
   * Commits through executeTransaction to ensure authoritative sequence allocation and chain head continuity.
   * Throws if an event with the same eventId already exists (immutability rule).
   */
  public async appendEvent(event: DomainEvent): Promise<void> {
    await this.init();

    if (this.eventCache.has(event.eventId)) {
      console.warn(`[EventStore] Event ${event.eventId} already appended. Ignoring duplicate.`);
      return;
    }

    await idbEngine.executeTransaction(['domainEvents'], async (txContext) => {
      await txContext.put('domainEvents', event);
    });
  }

  public async getEventsForAggregate(
    aggregateType: AggregateType,
    aggregateId: string
  ): Promise<DomainEvent[]> {
    await this.init();
    return Array.from(this.eventCache.values())
      .filter((e) => e.aggregateType === aggregateType && e.aggregateId === aggregateId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  public getEventsByAggregate(aggregateId: string): DomainEvent[] {
    return Array.from(this.eventCache.values())
      .filter((e) => e.aggregateId === aggregateId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  public async getAllEvents(limit = 200): Promise<DomainEvent[]> {
    await this.init();
    return Array.from(this.eventCache.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  public async getEventsByStatus(status: SyncStatus): Promise<DomainEvent[]> {
    await this.init();
    return Array.from(this.eventCache.values())
      .filter((e) => e.syncStatus === status)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Update the sync status of an existing event without mutating historical domain payload.
   */
  public async updateEventStatus(eventId: string, status: SyncStatus, error?: string): Promise<void> {
    await this.init();
    const existing = this.eventCache.get(eventId);
    if (!existing) return;

    const updated: DomainEvent = Object.freeze({
      ...existing,
      id: eventId,
      syncStatus: status,
      syncError: error,
      lastAttemptAt: new Date().toISOString(),
      retryCount: status === 'FAILED' ? (existing.retryCount || 0) + 1 : existing.retryCount,
    });

    this.eventCache.set(eventId, updated);
    await idbEngine.put('domainEvents', updated);
  }

  public subscribe(listener: (event: DomainEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public clear(): void {
    this.eventCache.clear();
    this.sequenceCounters.clear();
    this.lastAppendedEvent = null;
    this.initialized = false;
  }
}

export const eventStore = EventStore.getInstance();
