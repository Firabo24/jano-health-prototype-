/**
 * Jano Health - Atomic Clinical Transaction Manager
 * 
 * Implements the Foundation v1.1 transactional protocol:
 * 
 * Clinical Command
 *   ↓
 * Validation
 *   ↓
 * Authorization
 *   ↓
 * Atomic Local Transaction
 *   ├── Clinical State
 *   ├── Domain Event
 *   ├── Audit Event
 *   └── Sync Queue
 *   ↓
 * Sync Engine (Background if online)
 * 
 * Guarantees that no clinically significant mutation can leave local storage
 * in a partially committed or divergent state. If any step fails, the entire
 * transaction rolls back.
 */

import { AggregateType, DomainEvent, DomainEventName, EventMetadata } from '../../domain/persistence';
import { AuditEvent, Permission, RoleType } from '../../domain/types';
import { hasPermission } from '../../domain/permissions';
import { idbEngine, StoreName, ITransactionContext, TransactionPrecondition } from '../storage/indexedDbEngine';
import { generateAuditId, generateEventId } from '../../domain/identifiers';
import { computeAuditHash, computeEventHash, deepFreeze } from '../../domain/eventIntegrity';
import { eventStore } from '../events/eventStore';
import { syncQueue } from '../sync/syncQueue';
import { auditRepository } from '../audit/auditRepository';
import { syncEngine } from '../sync/syncEngine';
import { localRepository } from '../storage/localRepository';
import { localDb } from '../storage/localDatabase';

export interface ClinicalActorContext {
  userId: string;
  userName: string;
  userRole: RoleType;
  facilityId: string;
  deviceId: string;
  allowedFacilities?: string[];
}

export interface ClinicalTransactionCommand<TEntity extends Record<string, any>> {
  actionName: string;
  resourceType: AggregateType;
  resourceId?: string;
  targetStore: StoreName;
  additionalStores?: StoreName[];
  actor: ClinicalActorContext;
  requiredPermission?: Permission;
  validate: () => void | Promise<void>;
  preconditions?: TransactionPrecondition[];
  buildEntity: (txContext: ITransactionContext) => Promise<{
    entity: TEntity;
    eventType: DomainEventName;
    aggregateId: string;
    aggregateType: AggregateType;
    version: number;
    auditAction: string;
    previousState?: Record<string, unknown>;
    additionalEntities?: Array<{ store: StoreName; entity: any }>;
  }>;
}

export class ClinicalTransactionManager {
  private static instance: ClinicalTransactionManager;

  private constructor() {}

  public static getInstance(): ClinicalTransactionManager {
    if (!ClinicalTransactionManager.instance) {
      ClinicalTransactionManager.instance = new ClinicalTransactionManager();
    }
    return ClinicalTransactionManager.instance;
  }

  /**
   * Execute an atomic clinical transaction.
   */
  public async execute<TEntity extends Record<string, any>>(
    command: ClinicalTransactionCommand<TEntity>
  ): Promise<TEntity> {
    const { actor } = command;

    // 1. Validation Phase
    await command.validate();

    // 2. Authorization Phase
    if (command.requiredPermission) {
      const authorized = hasPermission(actor.userRole, command.requiredPermission);
      if (!authorized) {
        // Audit unauthorized attempt
        const unauthAudit: AuditEvent = {
          id: generateAuditId(),
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          action: `UNAUTHORIZED_ATTEMPT:${command.actionName}`,
          resourceType: command.resourceType,
          resourceId: command.resourceId || 'UNKNOWN',
          timestamp: new Date().toISOString(),
          deviceId: actor.deviceId,
          syncStatus: 'offline_retained',
        };
        await auditRepository.record(unauthAudit).catch(() => {});
        throw new Error(
          `Security Exception: Role [${actor.userRole}] is not authorized for operation [${command.actionName}] (required permission: ${command.requiredPermission})`
        );
      }
    }

    // Verify Facility boundary if actor specifies allowed facilities
    if (actor.allowedFacilities && actor.allowedFacilities.length > 0) {
      if (!actor.allowedFacilities.includes(actor.facilityId)) {
        throw new Error(
          `Facility Security Violation: User [${actor.userId}] does not belong to facility [${actor.facilityId}]`
        );
      }
    }

    // 3. Atomic Multi-Store Local Transaction
    const storesToLock: StoreName[] = [
      command.targetStore,
      ...(command.additionalStores || []),
      'domainEvents',
      'auditLog',
      'syncQueue',
    ];

    let committedEntity!: TEntity;
    let committedDomainEvent!: DomainEvent;
    let committedAuditEvent!: AuditEvent;
    let committedAdditionalEntities: Array<{ store: StoreName; entity: any }> = [];

    await idbEngine.executeTransaction(
      storesToLock,
      async (txContext) => {
        // Build entity and state within transaction
        const {
          entity,
          eventType,
          aggregateId,
          aggregateType,
          version,
          auditAction,
          previousState,
          additionalEntities,
        } = await command.buildEntity(txContext);

      const clientNow = new Date().toISOString();

      // Determine sequence for aggregate
      const sequence = await eventStore.getNextSequence(aggregateType, aggregateId);

      // Deep freeze payload to ensure domain event immutability
      const frozenPayload = deepFreeze(entity);

      // Integrity: Event Hash Chain
      const lastEvent = await eventStore.getLastEvent();
      const previousEventHash = lastEvent ? (lastEvent.eventHash || null) : null;

      const eventId = generateEventId();
      const domainEvent: DomainEvent = {
        eventId,
        eventType,
        aggregateType,
        aggregateId,
        facilityId: (entity as any).facilityId || (entity as any).primaryFacilityId || actor.facilityId,
        actorId: actor.userId,
        deviceId: actor.deviceId,
        timestamp: clientNow,
        sequence,
        version,
        payload: frozenPayload,
        metadata: {
          deviceId: actor.deviceId,
          appVersion: '1.1.0-foundation',
          offlineGenerated: typeof navigator !== 'undefined' ? !navigator.onLine : false,
          userRole: actor.userRole,
          userName: actor.userName,
        },
        previousEventHash,
        hashVersion: 2,
        eventHash: computeEventHash(
          {
            hashVersion: 2,
            eventId,
            eventType,
            aggregateType,
            aggregateId,
            facilityId: actor.facilityId,
            actorId: actor.userId,
            deviceId: actor.deviceId,
            timestamp: clientNow,
            sequence,
            version,
            payload: frozenPayload,
            metadata: {
              deviceId: actor.deviceId,
              appVersion: '1.1.0-foundation',
              offlineGenerated: typeof navigator !== 'undefined' ? !navigator.onLine : false,
              userRole: actor.userRole,
              userName: actor.userName,
            },
            clientCreatedAt: clientNow,
            clientUpdatedAt: clientNow,
          },
          previousEventHash
        ),
        clientCreatedAt: clientNow,
        clientUpdatedAt: clientNow,
        syncStatus: 'PENDING',
        retryCount: 0,
      };

      // Integrity: Audit Hash Chain
      const lastAudit = await auditRepository.getLastAudit();
      const previousAuditHash = lastAudit ? (lastAudit.auditHash || null) : null;
      const auditId = generateAuditId();

      const auditEvent: AuditEvent = {
        id: auditId,
        eventId,
        actorId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.userRole,
        facilityId: domainEvent.facilityId,
        action: auditAction,
        resourceType: command.resourceType || aggregateType,
        resourceId: command.resourceId || aggregateId,
        timestamp: clientNow,
        deviceId: actor.deviceId,
        syncStatus: typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline_retained',
        previousState,
        resultingState: frozenPayload as unknown as Record<string, unknown>,
        previousAuditHash,
        auditHash: computeAuditHash(
          {
            id: auditId,
            actorId: actor.userId,
            action: auditAction,
            resourceType: command.resourceType || aggregateType,
            resourceId: command.resourceId || aggregateId,
            timestamp: clientNow,
            resultingState: frozenPayload,
          },
          previousAuditHash
        ),
      };

      // Put 1: Clinical State
      await txContext.put(command.targetStore, entity);

      // Put 1b: Additional Staged Entities in the same atomic unit of work
      if (additionalEntities && additionalEntities.length > 0) {
        for (const add of additionalEntities) {
          await txContext.put(add.store, add.entity);
        }
        committedAdditionalEntities = additionalEntities;
      }

      // Put 2: Append Domain Event
      await txContext.put('domainEvents', domainEvent);

      // Put 3: Append Audit Event
      await txContext.put('auditLog', auditEvent);

      // Put 4: Outgoing Sync Queue Item
      await txContext.put('syncQueue', domainEvent);

      // Keep references to broadcast after transaction commits
      committedEntity = entity;
      committedDomainEvent = domainEvent;
      committedAuditEvent = auditEvent;
    }, command.preconditions);

    // 4. Update in-memory caches and notify reactive listeners
    localRepository.updateCache(command.targetStore, committedEntity);
    if (committedAdditionalEntities && committedAdditionalEntities.length > 0) {
      for (const add of committedAdditionalEntities) {
        localRepository.updateCache(add.store, add.entity);
        try {
          if (add.store === 'prescriptions') await localDb.savePrescription(add.entity as any);
        } catch {
          // LocalDb sync fallback
        }
      }
    }
    try {
      if (command.targetStore === 'labOrders') await localDb.saveLabOrder(committedEntity as any);
      else if (command.targetStore === 'labResults') await localDb.saveLabResult(committedEntity as any);
      else if (command.targetStore === 'labSpecimens') await localDb.saveLabSpecimen(committedEntity as any);
      else if (command.targetStore === 'medicationOrders') await localDb.saveMedicationOrder(committedEntity as any);
      else if (command.targetStore === 'prescriptions') await localDb.savePrescription(committedEntity as any);
      else if (command.targetStore === 'medicationDefinitions') await localDb.saveMedicationDefinition(committedEntity as any);
      else if (command.targetStore === 'emergencyCases') await localDb.saveEmergencyCase(committedEntity as any);
      else if (command.targetStore === 'emergencyTriages') await localDb.saveEmergencyTriage(committedEntity as any);
      else if (command.targetStore === 'emergencyReassessments') await localDb.saveEmergencyReassessment(committedEntity as any);
      else if (command.targetStore === 'emergencyAlerts') await localDb.saveEmergencyAlert(committedEntity as any);
      else if (command.targetStore === 'transportRequests') await localDb.saveTransportRequest(committedEntity as any);
    } catch {
      // LocalDb sync fallback
    }
    await localDb.recordAuditLog(committedAuditEvent);
    eventStore.registerCommittedEvent(committedDomainEvent);
    syncQueue.registerCommittedEvent(committedDomainEvent);
    auditRepository.registerCommittedAudit(committedAuditEvent);

    // 5. Trigger background synchronization if online
    if (syncEngine.isEffectivelyOnline()) {
      syncEngine.triggerSync().catch(() => {});
    }

    return committedEntity;
  }
}

export const clinicalTransaction = ClinicalTransactionManager.getInstance();
export const clinicalTransactionManager = clinicalTransaction;
