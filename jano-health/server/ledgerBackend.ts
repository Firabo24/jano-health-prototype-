/**
 * Jano Health - Authoritative Server Ledger Persistence Abstraction
 * 
 * Separates:
 * 1. Ledger domain processing and validation contracts.
 * 2. Durable authoritative persistence interfaces.
 * 3. Local-development filesystem persistence (FileServerLedgerBackend).
 * 4. Shared multi-instance Cloud Firestore persistence (FirestoreServerLedgerBackend).
 * 
 * Preserves existing ServerLedger public behavior, API response contracts,
 * multi-tenant security boundaries, and strict idempotency semantics.
 */

import {
  ServerLedger,
  ServerAggregateRecord,
  ServerDomainEventRecord,
  ServerConflictRecord,
  LedgerOperationalState,
  DEFAULT_TENANT_ID,
} from './serverLedger';
import { AuthenticatedPrincipal } from './authMiddleware';
import { FirestoreServerLedgerBackend } from './firestoreLedgerBackend';

export type LedgerBackendType = 'file' | 'firestore' | 'unconfigured';

export type LedgerBackendOperationalStatus =
  | 'OPERATIONAL'
  | 'CONFIGURED_NOT_INITIALIZED'
  | 'UNAVAILABLE'
  | 'TRANSACTION_FAILED'
  | 'COMMIT_UNCERTAIN'
  | 'RECOVERY_REQUIRED'
  | 'RECOVERY_BLOCKED'
  | 'MIGRATION_PENDING'
  | 'ACTIVATED_SHARED_DURABLE';

export interface LedgerBackendHealth {
  backendType: LedgerBackendType;
  operationalStatus: LedgerBackendOperationalStatus;
  sdkInitialized: boolean;
  authenticated: boolean;
  canRead: boolean;
  canWrite: boolean;
  transactionCapable: boolean;
  migrationCompleted: boolean;
  cutoverAuthorized: boolean;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface PushBatchResult {
  status: 'acknowledged' | 'partial' | 'rejected' | 'error';
  receivedAt: string;
  processedCount: number;
  acknowledgedEventIds: string[];
  duplicateEventIds: string[];
  rejectedEvents: Array<{
    eventId: string;
    reason: string;
    code: string;
  }>;
  conflicts: Array<{
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    serverVersion: number;
    serverState: Record<string, unknown>;
    reason: string;
  }>;
  error?: string;
  message?: string;
  operationalState?: LedgerOperationalState;
  recoveryRequired?: boolean;
}

export interface PullChangesResult {
  status: 'ok';
  facilityId: string;
  serverTimestamp: string;
  cursor: string;
  deltas: any[];
}

export interface LedgerStats {
  processedEventsCount: number;
  aggregatesCount: number;
  eventsLogCount: number;
  conflictsCount: number;
}

export interface IServerLedgerBackend {
  readonly backendType: LedgerBackendType;
  init(): Promise<void>;
  getHealth(): Promise<LedgerBackendHealth>;
  getOperationalState(): Promise<LedgerOperationalState>;
  processPushBatch(
    deviceId: string,
    batchTimestamp: string,
    events: any[],
    principal: AuthenticatedPrincipal | any
  ): Promise<PushBatchResult>;
  pullChanges(
    cursor: string | null,
    facilityId?: string,
    deviceId?: string,
    callerTenantId?: string,
    authorizedFacilityIds?: string[],
    allowCrossFacility?: boolean
  ): Promise<PullChangesResult>;
  getStats(tenantId?: string): Promise<LedgerStats>;
  getAggregate(aggregateType: string, aggregateId: string, tenantId?: string): Promise<ServerAggregateRecord | null>;
  authoritativeVersion(aggregateType: string, aggregateId: string, tenantId?: string): Promise<number>;
  isAuthorizedForFacility(userId: string, facilityId: string, tenantId?: string): Promise<boolean>;
  hasCrossFacilitySyncCapability(userId: string, tenantId?: string): Promise<boolean>;
  getDiagnostics(tenantId?: string): Promise<Record<string, unknown>>;
  getRecoveryStatus(): Promise<any>;
  reset(actorId?: string): Promise<{ status: string; timestamp: string }>;
  reconcileAndResume(principal: AuthenticatedPrincipal | any, options: any): Promise<any>;
}

/**
 * FileServerLedgerBackend:
 * Default implementation for single-process local development.
 * Delegates to the existing ServerLedger singleton and local JSON storage.
 */
export class FileServerLedgerBackend implements IServerLedgerBackend {
  public readonly backendType: LedgerBackendType = 'file';
  private ledger: ServerLedger;

  constructor(ledgerInstance?: ServerLedger) {
    this.ledger = ledgerInstance || ServerLedger.getInstance();
  }

  public async init(): Promise<void> {
    // Local filesystem ledger initializes synchronously in constructor
    return Promise.resolve();
  }

  public async getHealth(): Promise<LedgerBackendHealth> {
    const opState = this.ledger.getOperationalState();
    let status: LedgerBackendOperationalStatus = 'OPERATIONAL';
    if (opState === 'RECOVERY_REQUIRED') status = 'RECOVERY_REQUIRED';
    if (opState === 'RECOVERY_BLOCKED') status = 'RECOVERY_BLOCKED';

    return {
      backendType: 'file',
      operationalStatus: status,
      sdkInitialized: true,
      authenticated: true,
      canRead: true,
      canWrite: opState === 'NORMAL',
      transactionCapable: true,
      migrationCompleted: true, // Local file backend is the legacy source
      cutoverAuthorized: false, // Not a shared cloud backend
      details: {
        operationalState: opState,
        ledgerPath: this.ledger.getLedgerFilePath(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  public async getOperationalState(): Promise<LedgerOperationalState> {
    return Promise.resolve(this.ledger.getOperationalState());
  }

  public async processPushBatch(
    deviceId: string,
    batchTimestamp: string,
    events: any[],
    principal: AuthenticatedPrincipal | any
  ): Promise<PushBatchResult> {
    return Promise.resolve(this.ledger.processPushBatch(deviceId, batchTimestamp, events, principal));
  }

  public async pullChanges(
    cursor: string | null,
    facilityId?: string,
    deviceId?: string,
    callerTenantId?: string,
    authorizedFacilityIds?: string[],
    allowCrossFacility = false
  ): Promise<PullChangesResult> {
    return Promise.resolve(
      this.ledger.pullChanges(
        cursor,
        facilityId,
        deviceId,
        callerTenantId,
        authorizedFacilityIds,
        allowCrossFacility
      )
    );
  }

  public async getStats(tenantId?: string): Promise<LedgerStats> {
    return Promise.resolve(this.ledger.getStats(tenantId));
  }

  public async getAggregate(aggregateType: string, aggregateId: string, tenantId?: string): Promise<ServerAggregateRecord | null> {
    const ver = this.ledger.authoritativeVersion(aggregateType, aggregateId);
    if (ver === 0) return Promise.resolve(null);
    return Promise.resolve({
      aggregateType,
      aggregateId,
      version: ver,
      data: {},
      lastModified: new Date().toISOString(),
      facilityId: 'unknown',
      tenantId: tenantId || DEFAULT_TENANT_ID,
      lastEventId: '',
    });
  }

  public async authoritativeVersion(aggregateType: string, aggregateId: string, tenantId?: string): Promise<number> {
    return Promise.resolve(this.ledger.authoritativeVersion(aggregateType, aggregateId));
  }

  public async isAuthorizedForFacility(userId: string, facilityId: string, tenantId?: string): Promise<boolean> {
    if (this.ledger.hasCrossFacilitySyncCapability(userId)) {
      return Promise.resolve(true);
    }
    const facilities = this.ledger.getUserFacilities(userId);
    return Promise.resolve(facilities.includes(facilityId));
  }

  public async hasCrossFacilitySyncCapability(userId: string, tenantId?: string): Promise<boolean> {
    return Promise.resolve(this.ledger.hasCrossFacilitySyncCapability(userId));
  }

  public async getDiagnostics(tenantId?: string): Promise<Record<string, unknown>> {
    const stats = this.ledger.getStats(tenantId);
    const operationalState = this.ledger.getOperationalState();
    const recoveryInfo = this.ledger.getRecoveryInfo();

    return Promise.resolve({
      system: 'Jano Health Central Synchronization Gateway',
      timestamp: new Date().toISOString(),
      tenantId: tenantId || DEFAULT_TENANT_ID,
      operationalState,
      health: operationalState === 'NORMAL' ? 'HEALTHY' : (operationalState === 'RECOVERY_REQUIRED' ? 'DEGRADED_RECOVERY_REQUIRED' : 'UNHEALTHY_RECOVERY_BLOCKED'),
      recovery: {
        state: recoveryInfo.state,
        reason: recoveryInfo.reason,
        reconciliationRequired: recoveryInfo.reconciliationRequired,
        quarantinedFilesCount: recoveryInfo.quarantinedFiles.length,
        authorizedBy: recoveryInfo.authorizedBy || null,
        reconciledAt: recoveryInfo.reconciledAt || null,
      },
      ledger: {
        processedEventsCount: stats.processedEventsCount,
        aggregatesCount: stats.aggregatesCount,
        eventsLogCount: stats.eventsLogCount,
        conflictsCount: stats.conflictsCount,
      },
    });
  }

  public async getRecoveryStatus(): Promise<any> {
    return Promise.resolve({
      operationalState: this.ledger.getOperationalState(),
      recoveryInfo: this.ledger.getRecoveryInfo(),
      quarantinedFiles: this.ledger.getQuarantinePaths(),
      completeness: this.ledger.verifyRecoveryCompleteness(),
    });
  }

  public async reset(actorId?: string): Promise<{ status: string; timestamp: string }> {
    this.ledger.reset();
    return Promise.resolve({ status: 'reset_ok', timestamp: new Date().toISOString() });
  }

  public async reconcileAndResume(principal: AuthenticatedPrincipal | any, options: any): Promise<any> {
    return Promise.resolve(this.ledger.reconcileAndResume(principal, options));
  }
}

/**
 * UnconfiguredServerLedgerBackend:
 * Fails closed when no valid persistence backend is configured.
 */
export class UnconfiguredServerLedgerBackend implements IServerLedgerBackend {
  public readonly backendType: LedgerBackendType = 'unconfigured';

  public async init(): Promise<void> {
    throw new Error('BACKEND_UNCONFIGURED: Shared durable persistence backend is unconfigured.');
  }

  public async getHealth(): Promise<LedgerBackendHealth> {
    return {
      backendType: 'unconfigured',
      operationalStatus: 'UNAVAILABLE',
      sdkInitialized: false,
      authenticated: false,
      canRead: false,
      canWrite: false,
      transactionCapable: false,
      migrationCompleted: false,
      cutoverAuthorized: false,
      details: { error: 'No valid persistence backend configured in environment.' },
      timestamp: new Date().toISOString(),
    };
  }

  public async getOperationalState(): Promise<LedgerOperationalState> {
    return 'RECOVERY_BLOCKED';
  }

  public async processPushBatch(): Promise<PushBatchResult> {
    return {
      status: 'error',
      error: 'BACKEND_UNCONFIGURED',
      message: 'No authoritative persistence backend configured to accept synchronization writes.',
      receivedAt: new Date().toISOString(),
      processedCount: 0,
      acknowledgedEventIds: [],
      duplicateEventIds: [],
      rejectedEvents: [],
      conflicts: [],
    };
  }

  public async pullChanges(): Promise<PullChangesResult> {
    throw new Error('BACKEND_UNCONFIGURED: Cannot pull changes from unconfigured persistence backend.');
  }

  public async getStats(): Promise<LedgerStats> {
    return { processedEventsCount: 0, aggregatesCount: 0, eventsLogCount: 0, conflictsCount: 0 };
  }

  public async getAggregate(): Promise<ServerAggregateRecord | null> {
    return null;
  }

  public async authoritativeVersion(): Promise<number> {
    return 0;
  }

  public async isAuthorizedForFacility(): Promise<boolean> {
    return false;
  }

  public async hasCrossFacilitySyncCapability(): Promise<boolean> {
    return false;
  }

  public async getDiagnostics(): Promise<Record<string, unknown>> {
    return {
      system: 'Jano Health Central Synchronization Gateway',
      operationalState: 'UNAVAILABLE',
      health: 'UNAVAILABLE',
      error: 'BACKEND_UNCONFIGURED',
    };
  }

  public async getRecoveryStatus(): Promise<any> {
    return { operationalState: 'RECOVERY_BLOCKED', recoveryInfo: { state: 'RECOVERY_BLOCKED' } };
  }

  public async reset(): Promise<{ status: string; timestamp: string }> {
    throw new Error('BACKEND_UNCONFIGURED: Cannot reset unconfigured persistence backend.');
  }

  public async reconcileAndResume(): Promise<any> {
    throw new Error('BACKEND_UNCONFIGURED: Cannot reconcile unconfigured persistence backend.');
  }
}

// ---------------------------------------------------------------------------
// AUTHORITATIVE BACKEND MANAGER & FACTORY
// ---------------------------------------------------------------------------

let activeBackendInstance: IServerLedgerBackend | null = null;
let activeBackendType: LedgerBackendType | null = null;
let initPromise: Promise<IServerLedgerBackend> | null = null;
let initError: Error | null = null;
let isBackendInitialized = false;

function isCloudRunDetected(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
    process.env.K_REVISION ||
    process.env.K_CONFIGURATION
  );
}

export function resolveConfiguredBackendType(): LedgerBackendType {
  const env = process.env.JANO_LEDGER_BACKEND;
  if (env === 'firestore') return 'firestore';
  if (env === 'file') return 'file';
  if (env && env !== 'file' && env !== 'firestore') return 'unconfigured';
  // Cloud Run without explicit backend fails closed to unconfigured
  if (isCloudRunDetected()) return 'unconfigured';
  return 'file';
}

export function getLedgerBackend(): IServerLedgerBackend {
  const currentConfiguredType = resolveConfiguredBackendType();

  // If already instantiated, retain the singleton in normal operation.
  // In test mode, allow re-instantiation if the configured backend type changed dynamically.
  if (!activeBackendInstance || (process.env.NODE_ENV === 'test' && activeBackendType !== currentConfiguredType)) {
    activeBackendType = currentConfiguredType;
    if (currentConfiguredType === 'firestore') {
      activeBackendInstance = new FirestoreServerLedgerBackend();
    } else if (currentConfiguredType === 'file') {
      activeBackendInstance = new FileServerLedgerBackend();
    } else {
      activeBackendInstance = new UnconfiguredServerLedgerBackend();
    }
  }

  return activeBackendInstance;
}

export function initializeLedgerBackend(): Promise<IServerLedgerBackend> {
  const backend = getLedgerBackend();

  if (isBackendInitialized) {
    return Promise.resolve(backend);
  }
  if (initError) {
    return Promise.reject(initError);
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const type = resolveConfiguredBackendType();
      if (type === 'unconfigured') {
        throw new Error('BACKEND_CONFIGURATION_INVALID: Invalid or missing JANO_LEDGER_BACKEND configuration for environment.');
      }
      await backend.init();
      isBackendInitialized = true;
      initError = null;
      return backend;
    } catch (err: any) {
      initError = err;
      isBackendInitialized = false;
      // CRITICAL: NEVER silently fall back to file backend!
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function isBackendReady(): boolean {
  return isBackendInitialized && initError === null;
}

export function getBackendInitError(): Error | null {
  return initError;
}

export async function ensureBackendInitialized(req: any, res: any, next: any): Promise<void> {
  try {
    await initializeLedgerBackend();
    next();
  } catch (err: any) {
    const isPush = req.method === 'POST' && req.path && req.path.includes('/push');
    res.status(503).json({
      status: 'error',
      error: 'BACKEND_INITIALIZATION_FAILED',
      code: 'BACKEND_NOT_READY',
      message: `Authoritative ledger backend failed initialization: ${err.message}`,
      receivedAt: new Date().toISOString(),
      ...(isPush ? {
        processedCount: 0,
        acknowledgedEventIds: [],
        duplicateEventIds: [],
        rejectedEvents: [],
        conflicts: [],
      } : {}),
    });
  }
}

export function setLedgerBackendForTesting(backend: IServerLedgerBackend | null, initialized = true): void {
  activeBackendInstance = backend;
  activeBackendType = backend ? backend.backendType : null;
  isBackendInitialized = Boolean(backend && initialized);
  initError = null;
  initPromise = null;
}

export function resetLedgerBackendForTesting(): void {
  activeBackendInstance = null;
  activeBackendType = null;
  initPromise = null;
  initError = null;
  isBackendInitialized = false;
}

