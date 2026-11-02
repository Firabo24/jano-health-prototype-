/**
 * Jano Health - Server Readiness & Cloud Run Persistence Guard
 * 
 * Implements truthful readiness evaluation and prevents unsafe synchronization
 * traffic from being accepted on Cloud Run instances that only have instance-local
 * filesystem persistence, or when shared durable persistence migration/cutover is pending.
 */

import { Request, Response, NextFunction } from 'express';
import { serverLedger } from './serverLedger';
import {
  getLedgerBackend,
  resolveConfiguredBackendType,
  LedgerBackendType,
} from './ledgerBackend';

export interface PersistenceStatus {
  type: 'instance_local_filesystem' | 'cloud_firestore' | 'cloud_sql_postgres' | 'unconfigured';
  sharedDurable: boolean;
  cloudRunSafe: boolean;
  statusText: string;
}

/**
 * Detects whether the current process is running in Google Cloud Run.
 * Uses official Cloud Run container environment variables:
 * - K_SERVICE (Service name)
 * - K_REVISION (Revision name)
 * - K_CONFIGURATION (Configuration name)
 */
export function isCloudRunEnvironment(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
    process.env.K_REVISION ||
    process.env.K_CONFIGURATION
  );
}

/**
 * Evaluates the active persistence backend configuration.
 * Resolves directly from the authoritative backend manager.
 */
export function getActiveBackendType(): LedgerBackendType {
  const backend = getLedgerBackend();
  return backend ? backend.backendType : resolveConfiguredBackendType();
}

export function getPersistenceStatus(): PersistenceStatus {
  const backendType = getActiveBackendType();
  if (backendType === 'firestore') {
    return {
      type: 'cloud_firestore',
      sharedDurable: true,
      cloudRunSafe: false, // In Stage 3.2.5.8.1.13.2, cutover is strictly unauthorized pending data migration
      statusText: 'Cloud Firestore backend configured (MIGRATION_PENDING; cutover unauthorized pending Stage 3.2.5.8.1.14)',
    };
  }

  if (backendType === 'unconfigured') {
    return {
      type: 'unconfigured',
      sharedDurable: false,
      cloudRunSafe: false,
      statusText: 'Unconfigured persistence backend',
    };
  }

  return {
    type: 'instance_local_filesystem',
    sharedDurable: false,
    cloudRunSafe: false,
    statusText: 'Instance-local filesystem persistence (ephemeral on Cloud Run; non-shared across container instances)',
  };
}

export interface ReadinessResult {
  ready: boolean;
  statusCode: number;
  operationalState: string;
  reason?: string;
  error?: string;
  persistence: PersistenceStatus;
  environment: 'cloud_run' | 'local_development';
  timestamp: string;
}

export function evaluateServerReadiness(): ReadinessResult {
  const isCloudRun = isCloudRunEnvironment();
  const backend = getLedgerBackend();
  const backendType = backend.backendType;
  const persistence = getPersistenceStatus();
  const timestamp = new Date().toISOString();

  // 1. Unconfigured or invalid backend configuration
  if (backendType === 'unconfigured') {
    return {
      ready: false,
      statusCode: 503,
      operationalState: 'UNAVAILABLE',
      error: 'BACKEND_CONFIGURATION_INVALID',
      reason: 'No valid persistence backend configured in environment.',
      persistence,
      environment: isCloudRun ? 'cloud_run' : 'local_development',
      timestamp,
    };
  }

  // 2. Cloud Run environment checks
  if (isCloudRun) {
    if (backendType === 'file') {
      return {
        ready: false,
        statusCode: 503,
        operationalState: 'NORMAL',
        error: 'PERSISTENCE_NOT_DURABLE_FOR_CLOUD_RUN',
        reason: 'Server is not ready to serve authoritative traffic on Cloud Run: shared durable persistence backend is unconfigured. Instance-local filesystem persistence is ephemeral and unsafe for multi-instance replication.',
        persistence,
        environment: 'cloud_run',
        timestamp,
      };
    }

    if (backendType === 'firestore') {
      return {
        ready: false,
        statusCode: 503,
        operationalState: 'NORMAL',
        error: 'FIRESTORE_MIGRATION_PENDING',
        reason: 'Cloud Firestore backend is configured but operational data migration has not been completed and cutover is unauthorized. Synchronization traffic remains blocked pending Stage 3.2.5.8.1.14.',
        persistence,
        environment: 'cloud_run',
        timestamp,
      };
    }
  }

  // 3. Firestore in local development mode: migration is pending
  if (backendType === 'firestore') {
    return {
      ready: false,
      statusCode: 503,
      operationalState: 'NORMAL',
      error: 'FIRESTORE_MIGRATION_PENDING',
      reason: 'Cloud Firestore backend is configured but operational data migration has not been completed and cutover is unauthorized. Synchronization traffic remains blocked pending Stage 3.2.5.8.1.14.',
      persistence,
      environment: 'local_development',
      timestamp,
    };
  }

  // 4. File backend in local development
  let operationalState = 'NORMAL';
  try {
    operationalState = serverLedger.getOperationalState();
  } catch {
    operationalState = 'NORMAL';
  }

  if (operationalState === 'RECOVERY_REQUIRED') {
    return {
      ready: false,
      statusCode: 503,
      operationalState,
      error: 'LEDGER_RECOVERY_REQUIRED',
      reason: 'Authoritative server ledger was restored from backup or unverified journal. Administrative reconciliation required before serving traffic.',
      persistence,
      environment: 'local_development',
      timestamp,
    };
  }

  if (operationalState === 'RECOVERY_BLOCKED') {
    return {
      ready: false,
      statusCode: 503,
      operationalState,
      error: 'LEDGER_RECOVERY_BLOCKED',
      reason: 'Authoritative server ledger is corrupted and backup is unrecoverable. System mutations blocked.',
      persistence,
      environment: 'local_development',
      timestamp,
    };
  }

  if (operationalState !== 'NORMAL') {
    return {
      ready: false,
      statusCode: 503,
      operationalState,
      error: 'LEDGER_INITIALIZING',
      reason: `Server ledger is in ${operationalState} state.`,
      persistence,
      environment: 'local_development',
      timestamp,
    };
  }

  // Healthy local development environment
  return {
    ready: true,
    statusCode: 200,
    operationalState: 'NORMAL',
    persistence,
    environment: 'local_development',
    timestamp,
  };
}

/**
 * Middleware: Guard authoritative synchronization routes against unsafe Cloud Run execution.
 * When Cloud Run is detected and only instance-local filesystem persistence is configured,
 * this guard immediately rejects the request with HTTP 503 and an explicit machine-readable error,
 * preventing split-brain commits, lost sync events, or divergent ledger reads.
 */
export function guardCloudRunSyncPersistence(req: Request, res: Response, next: NextFunction): void {
  if (isCloudRunEnvironment()) {
    const persistence = getPersistenceStatus();
    if (!persistence.cloudRunSafe) {
      const isPush = req.method === 'POST' && req.path.includes('/push');
      if (isPush) {
        res.status(503).json({
          status: 'error',
          error: 'UNSAFE_CLOUD_RUN_PERSISTENCE',
          code: 'PERSISTENCE_NOT_SHARED_DURABLE',
          message: 'Authoritative synchronization push rejected: Cloud Run deployment detected without shared durable persistence backend. Instance-local filesystem persistence cannot safely commit synchronization events across stateless/multi-instance Cloud Run containers.',
          receivedAt: new Date().toISOString(),
          processedCount: 0,
          acknowledgedEventIds: [],
          duplicateEventIds: [],
          rejectedEvents: [],
          conflicts: [],
        });
        return;
      }

      res.status(503).json({
        error: 'UNSAFE_CLOUD_RUN_PERSISTENCE',
        code: 'PERSISTENCE_NOT_SHARED_DURABLE',
        message: 'Authoritative synchronization operation rejected: Cloud Run deployment detected without shared durable persistence backend. Cursors and deltas cannot be safely served from instance-local filesystem storage.',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  }
  next();
}
