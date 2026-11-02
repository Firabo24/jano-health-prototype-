/**
 * Jano Health - Durable Server Ledger & Synchronization Controller
 * 
 * Production-hardened server-side persistence that survives process restarts.
 * Features:
 * - Persistent disk ledger (JSON-backed durable storage)
 * - Strict server-side idempotency deduplication
 * - Authoritative aggregate versioning & divergence conflict generation
 * - Append-only server domain event store with strict sequential cursors
 * - Multi-facility security boundary enforcement
 * - Durable push/pull sync checkpoints
 */

import fs from 'fs';
import path from 'path';
import { getTrustedPrincipalData } from './trustedPrincipal';

export const DEFAULT_TENANT_ID = 'tenant-prod-ea-moh';
export const SECONDARY_TENANT_ID = 'tenant-prod-tz-health';

export type LedgerOperationalState = 'NORMAL' | 'RECOVERY_REQUIRED' | 'RECOVERY_BLOCKED';

export interface RecoveryCompletenessResult {
  verified: boolean;
  status: 'VERIFIED_COMPLETE' | 'MISSING_ACKNOWLEDGED_EVENTS' | 'UNVERIFIED_INCOMPLETE_EVIDENCE' | 'SEQUENCE_GAP_DETECTED';
  maxCandidateSequence: number;
  highestKnownSequence: number;
  missingSequences: number[];
  missingEventIds: string[];
  unverifiedReasons: string[];
  details: {
    candidateEventCount: number;
    quarantinedArtifactsScanned: number;
    quarantinedMaxSequence?: number;
    cursorMaxSequence?: number;
    aggregateDiscrepancies?: string[];
  };
}

export interface DurableCommitMetadata {
  lastCommittedAt: string;
  lastServerSequence: number;
  lastEventId: string | null;
  processedEventIdsCount: number;
  aggregateCount: number;
  highestAggregateVersions: Record<string, number>;
  deviceCursors: Record<string, number>;
  lastAcknowledgedBatchIds: string[];
}

export interface ReconcileOptions {
  notes?: string;
  allowDataLoss?: boolean;
  acknowledgeGapsConfirmation?: string;
}

export interface DataLossAuditRecord {
  operatorId: string;
  operatorRoles: string[];
  authorizedCapability: string;
  decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED';
  reason: string;
  timestamp: string;
  affectedScope: string;
  missingEventIds: string[];
  missingSequences: number[];
  completenessStatus: string;
  recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED';
  confirmationPhrase?: string;
}

export function isAuthorizedForLedgerRecovery(
  principal: { userId?: string; roles?: string[]; provider?: string; accountStatus?: string } | any
): boolean {
  if (!principal || typeof principal !== 'object') {
    return false; // A username or string by itself NEVER grants authority
  }

  // Server-authoritative provenance verification:
  // Reject arbitrary caller-constructed object literals, forged bodies, or unverified clones.
  // Principal must have been verified and registered by server authentication middleware.
  const verified = getTrustedPrincipalData(principal);
  if (!verified) {
    return false;
  }

  // Must have a valid string userId
  if (typeof verified.userId !== 'string' || !verified.userId.trim()) {
    return false;
  }

  // Must have roles array with at least one role
  if (!Array.isArray(verified.roles) || verified.roles.length === 0) {
    return false;
  }

  // Reject suspended or revoked accounts
  if (verified.accountStatus === 'suspended' || verified.accountStatus === 'revoked') {
    return false;
  }

  // In production mode, development principal fixtures cannot grant production recovery privileges
  const isProd = typeof process !== 'undefined' && (process.env.NODE_ENV === 'production' || process.env.VITE_AUTH_MODE === 'production');
  if (isProd && verified.provider === 'local_development') {
    return false;
  }

  // Local or facility-scoped roles cannot perform global ledger recovery operations
  if (verified.roles.includes('facility_administrator')) {
    return false;
  }

  // Global system authority required: explicit role check only (NO static userId shortcuts!)
  return verified.roles.includes('system_administrator');
}

export interface LedgerRecoveryInfo {
  state: LedgerOperationalState;
  reason: string | null;
  timestamp: string;
  primaryCorrupted: boolean;
  backupRestored: boolean;
  quarantinedFiles: string[];
  reconciliationRequired: boolean;
  authorizedBy?: string;
  reconciledAt?: string;
  completeness?: RecoveryCompletenessResult;
  dataLossAcknowledged?: boolean;
  acknowledgedGaps?: number[];
  missingEventIds?: string[];
  unverifiedStatus?: string;
  auditRecord?: DataLossAuditRecord;
  archivedAudits?: string[];
  resetTransaction?: ResetTransactionRecord;
  resetTransactionCorrupted?: boolean;
  resetTransactionError?: string;
  archivedResetTransactions?: string[];
}

export interface ResetJournalInspectionResult {
  exists: boolean;
  valid: boolean;
  record: ResetTransactionRecord | null;
  error: string | null;
}

export interface ResetTransactionRecord {
  transactionId: string;
  status: 'IN_PROGRESS' | 'COMMITTED';
  operatorId: string;
  reason: string;
  startedAt: string;
  committedAt?: string;
  archivedAuditPath?: string | null;
  archivedResetTxPath?: string | null;
  phase?: string;
}

export interface ServerAggregateRecord {
  aggregateType: string;
  aggregateId: string;
  version: number;
  data: Record<string, unknown>;
  lastModified: string;
  facilityId: string;
  tenantId?: string;
  lastEventId: string;
}

export interface ServerDomainEventRecord {
  serverSequence: number;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  facilityId: string;
  tenantId?: string;
  actorId: string;
  deviceId: string;
  clientVersion: number;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  serverReceivedAt: string;
  serverCommittedAt: string;
}

export interface ServerConflictRecord {
  conflictId: string;
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  facilityId: string;
  tenantId?: string;
  serverVersion: number;
  clientVersion: number;
  serverState: Record<string, unknown>;
  clientState: Record<string, unknown>;
  reason: string;
  detectedAt: string;
  status: 'PENDING' | 'RESOLVED_LOCAL' | 'RESOLVED_REMOTE' | 'RESOLVED_MERGED';
}

export interface ServerLedgerState {
  processedEventIds: string[];
  aggregates: Record<string, ServerAggregateRecord>;
  events: ServerDomainEventRecord[];
  conflicts: ServerConflictRecord[];
  facilityMemberships: Record<string, string[]>; // userId -> facilityIds[]
  facilityTenants: Record<string, string>; // facilityId -> tenantId
  userTenants: Record<string, string>; // userId -> tenantId
  userAccountStatus: Record<string, 'active' | 'suspended' | 'revoked'>; // userId -> status
  userSyncCapabilities: Record<string, string[]>; // userId -> capabilities[]
  deviceCursors: Record<string, number>; // deviceId:facilityId -> lastSequence
}

const LEDGER_FILE_PATH = path.join(process.cwd(), '.server_ledger_data.json');
const BACKUP_FILE_PATH = path.join(process.cwd(), '.server_ledger_data.json.bak');
const ESTABLISHED_MARKER_PATH = path.join(process.cwd(), '.server_ledger_established');
const COMMIT_METADATA_PATH = path.join(process.cwd(), '.server_ledger_commit_meta.json');
const RECOVERY_AUDIT_PATH = path.join(process.cwd(), '.server_ledger_recovery_audit.json');
const RESET_TRANSACTION_PATH = path.join(process.cwd(), '.server_ledger_reset_transaction.json');

export const DEFAULT_FACILITY_TENANTS: Record<string, string> = {
  'fac-rural-dispensary-01': DEFAULT_TENANT_ID,
  'fac-district-hospital-01': DEFAULT_TENANT_ID,
  'fac-district-hospital': DEFAULT_TENANT_ID,
  'fac-mobile-outreach-01': DEFAULT_TENANT_ID,
  'fac-kigoma-dh': DEFAULT_TENANT_ID,
  'fac-uvinza-hc': DEFAULT_TENANT_ID,
  'fac-nguruka-clinic': DEFAULT_TENANT_ID,
  'fac-mobile-unit-02': DEFAULT_TENANT_ID,
  'fac-amani-primary-clinic': DEFAULT_TENANT_ID,
  'fac-kilima-subcounty-hospital': DEFAULT_TENANT_ID,
  // Secondary isolated tenant facilities
  'fac-mwanza-regional-01': SECONDARY_TENANT_ID,
  'fac-lake-zone-01': SECONDARY_TENANT_ID,
};

export const DEFAULT_USER_CAPABILITIES: Record<string, string[]> = {
  'usr-sysadmin-amanuel': ['sync:facility', 'sync:cross_facility'],
  'usr-interopadmin-kalkidan': ['sync:facility', 'sync:cross_facility'],
  'usr-system': ['sync:facility', 'sync:cross_facility', 'sync:delegation'],
  'usr-admin-01': ['sync:facility'],
  'usr-doctor-01': ['sync:facility'],
  'usr-nurse-01': ['sync:facility'],
  'usr-clinician-dr-amin': ['sync:facility'],
  'usr-facadmin-meron': ['sync:facility'],
};

export class ServerLedger {
  private static instance: ServerLedger;
  private state: ServerLedgerState;
  private simulatedPersistenceFailure = false;
  private simulatedAuditFailure = false;
  private simulatedArchivalFailure = false;
  private simulatedArchiveVerificationFailure = false;
  private simulatedDirectoryFsyncFailure = false;
  private simulatedBackupFailure = false;
  private simulatedFinalDirectoryFsyncFailure = false;
  private simulatedResetJournalReadFailure = false;
  private simulatedResetJournalArchivalFailure = false;
  private simulatedResetJournalArchiveVerificationFailure = false;
  private operationalState!: LedgerOperationalState;
  private recoveryInfo!: LedgerRecoveryInfo;

  private constructor() {
    this.state = this.loadFromDisk();
  }

  public static getInstance(): ServerLedger {
    if (!ServerLedger.instance) {
      ServerLedger.instance = new ServerLedger();
    }
    return ServerLedger.instance;
  }

  public getOperationalState(): LedgerOperationalState {
    return this.operationalState;
  }

  public getRecoveryInfo(): LedgerRecoveryInfo {
    return { ...this.recoveryInfo };
  }

  public getQuarantinePaths(): string[] {
    return [...(this.recoveryInfo?.quarantinedFiles || [])];
  }

  public getEstablishedMarkerPath(): string {
    return ESTABLISHED_MARKER_PATH;
  }

  public getCommitMetadataPath(): string {
    return COMMIT_METADATA_PATH;
  }

  public getRecoveryAuditPath(): string {
    return RECOVERY_AUDIT_PATH;
  }

  public getResetTransactionPath(): string {
    return RESET_TRANSACTION_PATH;
  }

  /**
   * Validate the schema and invariants of a reset transaction journal record.
   * Rejects malformed JSON structures, invalid statuses, empty IDs, or unparseable timestamps.
   */
  public validateResetTransactionRecord(record: unknown): { valid: boolean; error?: string } {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return { valid: false, error: 'Record must be a non-null object' };
    }
    const r = record as Record<string, unknown>;
    if (typeof r.transactionId !== 'string' || r.transactionId.trim().length === 0) {
      return { valid: false, error: 'transactionId must be a non-empty string' };
    }
    if (r.status !== 'IN_PROGRESS' && r.status !== 'COMMITTED') {
      return { valid: false, error: `status must be 'IN_PROGRESS' or 'COMMITTED', got '${String(r.status)}'` };
    }
    if (typeof r.operatorId !== 'string' || r.operatorId.trim().length === 0) {
      return { valid: false, error: 'operatorId must be a non-empty string' };
    }
    if (typeof r.reason !== 'string') {
      return { valid: false, error: 'reason must be a string' };
    }
    if (typeof r.startedAt !== 'string' || r.startedAt.trim().length === 0) {
      return { valid: false, error: 'startedAt must be a non-empty timestamp string' };
    }
    const startedTime = Date.parse(r.startedAt);
    if (isNaN(startedTime)) {
      return { valid: false, error: 'startedAt must be a valid parseable date string' };
    }

    // Lifecycle field consistency checks (Finding FND-04)
    if (r.status === 'IN_PROGRESS') {
      if (r.committedAt !== undefined && r.committedAt !== null) {
        return { valid: false, error: 'IN_PROGRESS record must not contain committedAt' };
      }
      if (typeof r.phase === 'string' && r.phase === 'COMPLETED') {
        return { valid: false, error: 'IN_PROGRESS record cannot have COMPLETED phase' };
      }
    }

    if (r.status === 'COMMITTED') {
      if (typeof r.committedAt !== 'string' || r.committedAt.trim().length === 0) {
        return { valid: false, error: 'COMMITTED record must include a non-empty committedAt timestamp' };
      }
      const committedTime = Date.parse(r.committedAt);
      if (isNaN(committedTime)) {
        return { valid: false, error: 'committedAt must be a valid parseable date string' };
      }
      if (committedTime < startedTime) {
        return { valid: false, error: 'committedAt timestamp cannot precede startedAt timestamp' };
      }
      if (typeof r.phase === 'string' && r.phase === 'INITIALIZING_FRESH_STATE') {
        return { valid: false, error: 'COMMITTED record cannot have INITIALIZING_FRESH_STATE phase' };
      }
    }

    if (r.archivedAuditPath !== undefined && r.archivedAuditPath !== null && typeof r.archivedAuditPath !== 'string') {
      return { valid: false, error: 'archivedAuditPath must be a string or null' };
    }
    if (r.archivedResetTxPath !== undefined && r.archivedResetTxPath !== null && typeof r.archivedResetTxPath !== 'string') {
      return { valid: false, error: 'archivedResetTxPath must be a string or null' };
    }
    if (r.phase !== undefined && typeof r.phase !== 'string') {
      return { valid: false, error: 'phase must be a string' };
    }
    return { valid: true };
  }

  /**
   * Inspect the durable reset transaction journal file on disk.
   * Explicitly distinguishes:
   * 1. Does not exist: exists=false, valid=false, error=null
   * 2. Exists and valid: exists=true, valid=true, record=ResetTransactionRecord, error=null
   * 3. Exists and unreadable / malformed / invalid schema: exists=true, valid=false, record=null, error=description
   */
  public inspectResetTransactionJournal(): ResetJournalInspectionResult {
    if (this.simulatedResetJournalReadFailure) {
      return {
        exists: true,
        valid: false,
        record: null,
        error: 'SIMULATED_RESET_JOURNAL_READ_FAILURE: Simulated I/O failure reading reset transaction journal',
      };
    }

    if (!fs.existsSync(RESET_TRANSACTION_PATH)) {
      return { exists: false, valid: false, record: null, error: null };
    }

    let raw: string;
    try {
      raw = fs.readFileSync(RESET_TRANSACTION_PATH, 'utf-8');
    } catch (err: any) {
      return {
        exists: true,
        valid: false,
        record: null,
        error: `UNREADABLE_FILE: Failed to read journal file: ${err.message}`,
      };
    }

    if (!raw || raw.trim().length === 0) {
      return {
        exists: true,
        valid: false,
        record: null,
        error: 'EMPTY_FILE: Reset transaction journal file is empty',
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      return {
        exists: true,
        valid: false,
        record: null,
        error: `MALFORMED_JSON: Failed to parse reset transaction journal: ${err.message}`,
      };
    }

    const validation = this.validateResetTransactionRecord(parsed);
    if (!validation.valid) {
      return {
        exists: true,
        valid: false,
        record: null,
        error: `INVALID_SCHEMA: ${validation.error}`,
      };
    }

    return {
      exists: true,
      valid: true,
      record: parsed as ResetTransactionRecord,
      error: null,
    };
  }

  public getResetTransaction(): ResetTransactionRecord | null {
    const inspected = this.inspectResetTransactionJournal();
    if (inspected.valid && inspected.record) {
      return inspected.record;
    }
    return null;
  }

  public setSimulatedResetJournalReadFailure(fail: boolean): void {
    this.simulatedResetJournalReadFailure = fail;
  }

  public setSimulatedPersistenceFailure(fail: boolean): void {
    this.simulatedPersistenceFailure = fail;
  }

  public setSimulatedAuditFailure(fail: boolean): void {
    this.simulatedAuditFailure = fail;
  }

  public setSimulatedArchivalFailure(fail: boolean): void {
    this.simulatedArchivalFailure = fail;
  }

  public setSimulatedArchiveVerificationFailure(fail: boolean): void {
    this.simulatedArchiveVerificationFailure = fail;
  }

  public setSimulatedDirectoryFsyncFailure(fail: boolean): void {
    this.simulatedDirectoryFsyncFailure = fail;
  }

  public setSimulatedBackupFailure(fail: boolean): void {
    this.simulatedBackupFailure = fail;
  }

  public setSimulatedFinalDirectoryFsyncFailure(fail: boolean): void {
    this.simulatedFinalDirectoryFsyncFailure = fail;
  }

  public setSimulatedResetJournalArchivalFailure(fail: boolean): void {
    this.simulatedResetJournalArchivalFailure = fail;
  }

  public setSimulatedResetJournalArchiveVerificationFailure(fail: boolean): void {
    this.simulatedResetJournalArchiveVerificationFailure = fail;
  }

  /**
   * Durably persist a reset transaction journal record.
   * Uses atomic write-to-temp, fsync, rename, and parent directory synchronization.
   */
  private writeResetTransaction(tx: ResetTransactionRecord): void {
    const tempPath = `${RESET_TRANSACTION_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 10)}`;
    const raw = JSON.stringify(tx, null, 2);
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeSync(fd, raw, 0, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    fs.renameSync(tempPath, RESET_TRANSACTION_PATH);
    this.syncParentDirectory(RESET_TRANSACTION_PATH);
  }

  /**
   * Durably synchronize the parent directory of targetPath.
   * Flushes directory entry modifications to non-volatile storage.
   * Distinguishes documented unsupported platform operations from genuine I/O failures.
   */
  public syncParentDirectory(targetPath: string): void {
    if (this.simulatedDirectoryFsyncFailure) {
      throw new Error('SIMULATED_DIRECTORY_FSYNC_FAILURE: Directory synchronization failed.');
    }

    const dirPath = path.dirname(targetPath);
    let dirFd: number;
    try {
      dirFd = fs.openSync(dirPath, 'r');
    } catch (err: any) {
      // Platform-documented unsupported directory open operations (e.g., Windows EISDIR / EPERM)
      if (
        err.code === 'EISDIR' ||
        err.code === 'ENOTSUP' ||
        err.code === 'EOPNOTSUPP' ||
        err.code === 'ENOSYS' ||
        err.code === 'EINVAL' ||
        (process.platform === 'win32' && err.code === 'EPERM')
      ) {
        return;
      }
      throw new Error(`DIRECTORY_FSYNC_FAILED: Unable to open directory for synchronization: ${err.message}`);
    }

    try {
      fs.fsyncSync(dirFd);
    } catch (err: any) {
      // Platform-documented unsupported directory fsync operations
      if (
        err.code === 'EINVAL' ||
        err.code === 'ENOTSUP' ||
        err.code === 'EOPNOTSUPP' ||
        err.code === 'ENOSYS' ||
        err.code === 'EISDIR' ||
        (process.platform === 'win32' && err.code === 'EPERM')
      ) {
        return;
      }
      throw new Error(`DIRECTORY_FSYNC_FAILED: Failed to synchronize directory metadata: ${err.message}`);
    } finally {
      try {
        fs.closeSync(dirFd);
      } catch {}
    }
  }

  public getRecoveryAuditArchives(): string[] {
    try {
      const files = fs.readdirSync(process.cwd());
      return files
        .filter((f) => f.startsWith('.server_ledger_recovery_audit.') && f.endsWith('.archived'))
        .sort()
        .map((f) => path.join(process.cwd(), f));
    } catch {
      return [];
    }
  }

  public getArchivedRecoveryAuditPaths(): string[] {
    return this.getRecoveryAuditArchives();
  }

  public getResetTransactionArchives(): string[] {
    try {
      const files = fs.readdirSync(process.cwd());
      return files
        .filter((f) => f.startsWith('.server_ledger_reset_transaction.') && f.endsWith('.archived'))
        .sort()
        .map((f) => path.join(process.cwd(), f));
    } catch {
      return [];
    }
  }

  public getArchivedResetTransactionPaths(): string[] {
    return this.getResetTransactionArchives();
  }

  public isSimulatedPersistenceFailure(): boolean {
    return this.simulatedPersistenceFailure;
  }

  public getLedgerFilePath(): string {
    return LEDGER_FILE_PATH;
  }

  public getBackupFilePath(): string {
    return BACKUP_FILE_PATH;
  }

  public reloadFromDisk(): void {
    this.state = this.loadFromDisk();
  }

  private getExistingQuarantinedFiles(): string[] {
    try {
      const cwd = process.cwd();
      const files = fs.readdirSync(cwd);
      return files
        .filter((f) => f.includes('.server_ledger_data.json.corrupted.') || f.includes('.server_ledger_data.json.bak.corrupted.'))
        .map((f) => path.join(cwd, f));
    } catch {
      return [];
    }
  }

  private parseState(raw: string): ServerLedgerState | null {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        processedEventIds: Array.isArray(parsed.processedEventIds) ? parsed.processedEventIds : [],
        aggregates: (parsed.aggregates && typeof parsed.aggregates === 'object') ? parsed.aggregates : {},
        events: Array.isArray(parsed.events) ? parsed.events : [],
        conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
        facilityMemberships: parsed.facilityMemberships || {
          'usr-admin-01': ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
          'usr-doctor-01': ['fac-rural-dispensary-01', 'fac-district-hospital-01'],
          'usr-nurse-01': ['fac-rural-dispensary-01'],
          'usr-clinician-dr-amin': ['fac-rural-dispensary-01'],
          'usr-system': ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
        },
        facilityTenants: parsed.facilityTenants || { ...DEFAULT_FACILITY_TENANTS },
        userTenants: parsed.userTenants || {},
        userAccountStatus: parsed.userAccountStatus || {},
        userSyncCapabilities: parsed.userSyncCapabilities || { ...DEFAULT_USER_CAPABILITIES },
        deviceCursors: parsed.deviceCursors || {},
      };
    } catch {
      return null;
    }
  }

  private createFreshDefaultState(): ServerLedgerState {
    return {
      processedEventIds: [],
      aggregates: {},
      events: [],
      conflicts: [],
      facilityMemberships: {
        'usr-admin-01': ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
        'usr-doctor-01': ['fac-rural-dispensary-01', 'fac-district-hospital-01'],
        'usr-nurse-01': ['fac-rural-dispensary-01'],
        'usr-clinician-dr-amin': ['fac-rural-dispensary-01'],
        'usr-system': ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
      },
      facilityTenants: { ...DEFAULT_FACILITY_TENANTS },
      userTenants: {},
      userAccountStatus: {},
      userSyncCapabilities: { ...DEFAULT_USER_CAPABILITIES },
      deviceCursors: {},
    };
  }

  private loadFromDisk(): ServerLedgerState {
    const quarantinedFiles = this.getExistingQuarantinedFiles();
    const markerExists = fs.existsSync(ESTABLISHED_MARKER_PATH);
    const primaryExists = fs.existsSync(LEDGER_FILE_PATH);
    const backupExists = fs.existsSync(BACKUP_FILE_PATH);
    const recoveryAuditExists = fs.existsSync(RECOVERY_AUDIT_PATH);
    const archivedAudits = this.getRecoveryAuditArchives();
    const archivedResetTransactions = this.getResetTransactionArchives();

    const resetJournalInspection = this.inspectResetTransactionJournal();
    const resetTxExists = resetJournalInspection.exists;
    const resetTxValid = resetJournalInspection.valid;
    const resetJournalCorrupted = resetTxExists && !resetTxValid;
    const resetJournalError = resetJournalInspection.error;
    const resetTx = resetJournalInspection.record;

    const isEstablished =
      markerExists ||
      primaryExists ||
      backupExists ||
      quarantinedFiles.length > 0 ||
      recoveryAuditExists ||
      archivedAudits.length > 0 ||
      archivedResetTransactions.length > 0 ||
      resetTxExists;

    // 1. Pristine first-time installation (clean deployment)
    if (!isEstablished) {
      console.log('[ServerLedger] Pristine first-time installation detected. Establishing new ledger baseline.');
      this.operationalState = 'NORMAL';
      this.recoveryInfo = {
        state: 'NORMAL',
        reason: null,
        timestamp: new Date().toISOString(),
        primaryCorrupted: false,
        backupRestored: false,
        quarantinedFiles: [],
        reconciliationRequired: false,
        archivedAudits: [],
        archivedResetTransactions: [],
        resetTransaction: resetTx || undefined,
        resetTransactionCorrupted: false,
      };
      const fresh = this.createFreshDefaultState();
      try {
        this.durablePersistToDisk(fresh, true);
        fs.writeFileSync(
          ESTABLISHED_MARKER_PATH,
          JSON.stringify({ establishedAt: new Date().toISOString() }, null, 2),
          'utf-8'
        );
        this.syncParentDirectory(ESTABLISHED_MARKER_PATH);
      } catch (err: any) {
        console.error('[ServerLedger] Failed to persist initial ledger setup:', err.message);
      }
      return fresh;
    }

    // 2. Established installation: Attempt reading from primary authoritative ledger file
    if (primaryExists) {
      try {
        const raw = fs.readFileSync(LEDGER_FILE_PATH, 'utf-8');
        const parsed = this.parseState(raw);
        if (parsed) {
          // Check if active recovery audit exists indicating unresolved gaps
          let priorAudit: DataLossAuditRecord | null = null;
          if (recoveryAuditExists) {
            try {
              const rawAudit = fs.readFileSync(RECOVERY_AUDIT_PATH, 'utf-8');
              priorAudit = JSON.parse(rawAudit);
            } catch {}
          }

          // Check for corrupted, unreadable, or structurally invalid reset transaction journal
          // Fail-closed protection: An invalid journal MUST NEVER be silently treated as null or allow NORMAL startup.
          if (resetJournalCorrupted) {
            console.error(`[ServerLedger] CRITICAL: Reset transaction journal exists but is unreadable, malformed, or structurally invalid: ${resetJournalError}. Entering RECOVERY_REQUIRED.`);
            this.operationalState = 'RECOVERY_REQUIRED';
            this.recoveryInfo = {
              state: 'RECOVERY_REQUIRED',
              reason: `CORRUPTED_RESET_TRANSACTION_JOURNAL: Reset transaction journal exists at ${RESET_TRANSACTION_PATH} but is unreadable, malformed, or structurally invalid (${resetJournalError}). Normal operations blocked pending authorized administrative resolution.`,
              timestamp: new Date().toISOString(),
              primaryCorrupted: false,
              backupRestored: false,
              quarantinedFiles,
              reconciliationRequired: true,
              dataLossAcknowledged: Boolean(priorAudit),
              acknowledgedGaps: priorAudit?.missingSequences,
              missingEventIds: priorAudit?.missingEventIds,
              unverifiedStatus: priorAudit?.completenessStatus,
              auditRecord: priorAudit || undefined,
              archivedAudits,
              archivedResetTransactions,
              resetTransactionCorrupted: true,
              resetTransactionError: resetJournalError || 'Malformed reset transaction journal',
            };
            return parsed;
          }

          // Check for interrupted reset transaction journal (Fixes F-05)
          if (resetTx && resetTx.status === 'IN_PROGRESS') {
            console.warn(`[ServerLedger] Interrupted reset transaction detected (${resetTx.transactionId}). Entering RECOVERY_REQUIRED.`);
            this.operationalState = 'RECOVERY_REQUIRED';
            this.recoveryInfo = {
              state: 'RECOVERY_REQUIRED',
              reason: `INTERRUPTED_RESET_TRANSACTION: Previous reset transaction ${resetTx.transactionId} started by ${resetTx.operatorId} did not commit cleanly (status: IN_PROGRESS). Ledger remains restricted pending authorized resolution.`,
              timestamp: new Date().toISOString(),
              primaryCorrupted: false,
              backupRestored: false,
              quarantinedFiles,
              reconciliationRequired: true,
              authorizedBy: resetTx.operatorId,
              dataLossAcknowledged: Boolean(priorAudit),
              acknowledgedGaps: priorAudit?.missingSequences,
              missingEventIds: priorAudit?.missingEventIds,
              unverifiedStatus: priorAudit?.completenessStatus,
              auditRecord: priorAudit || undefined,
              archivedAudits,
              archivedResetTransactions,
              resetTransaction: resetTx,
              resetTransactionCorrupted: false,
            };
            return parsed;
          }

          if (priorAudit && priorAudit.recoveryOutcome === 'RESTRICTED_RECOVERY_REQUIRED') {
            console.warn('[ServerLedger] Authoritative ledger loaded, but active recovery audit indicates unresolved data loss. Entering RECOVERY_REQUIRED.');
            this.operationalState = 'RECOVERY_REQUIRED';
            this.recoveryInfo = {
              state: 'RECOVERY_REQUIRED',
              reason: `Active recovery audit indicates unresolved data loss acknowledged by ${priorAudit.operatorId}. Ledger remains restricted pending authorized resolution.`,
              timestamp: new Date().toISOString(),
              primaryCorrupted: false,
              backupRestored: false,
              quarantinedFiles,
              reconciliationRequired: true,
              authorizedBy: priorAudit.operatorId,
              reconciledAt: priorAudit.timestamp,
              dataLossAcknowledged: true,
              acknowledgedGaps: priorAudit.missingSequences,
              missingEventIds: priorAudit.missingEventIds,
              unverifiedStatus: priorAudit.completenessStatus,
              auditRecord: priorAudit,
              archivedAudits,
              archivedResetTransactions,
            };
            return parsed;
          }

          // Primary ledger loaded successfully in NORMAL state
          if (!markerExists) {
            try {
              fs.writeFileSync(
                ESTABLISHED_MARKER_PATH,
                JSON.stringify({ establishedAt: new Date().toISOString() }, null, 2),
                'utf-8'
              );
              this.syncParentDirectory(ESTABLISHED_MARKER_PATH);
            } catch {}
          }
          if (!backupExists) {
            try {
              fs.copyFileSync(LEDGER_FILE_PATH, BACKUP_FILE_PATH);
              this.syncParentDirectory(BACKUP_FILE_PATH);
            } catch {}
          }
          if (!fs.existsSync(COMMIT_METADATA_PATH)) {
            try { this.writeCommitMetadata(parsed); } catch {}
          }
          this.operationalState = 'NORMAL';
          this.recoveryInfo = {
            state: 'NORMAL',
            reason: null,
            timestamp: new Date().toISOString(),
            primaryCorrupted: false,
            backupRestored: false,
            quarantinedFiles,
            reconciliationRequired: false,
            archivedAudits,
            archivedResetTransactions,
            resetTransaction: resetTx || undefined,
            resetTransactionCorrupted: false,
          };
          return parsed;
        }
        throw new Error('CORRUPTED_LEDGER_DATA: Invalid JSON structure in authoritative ledger');
      } catch (err: any) {
        console.error('[ServerLedger] CRITICAL: Authoritative ledger file corrupted or unreadable:', err.message);

        // Quarantine corrupted primary file to prevent data loss or silent erasure
        const quarantinePath = `${LEDGER_FILE_PATH}.corrupted.${Date.now()}`;
        try {
          fs.renameSync(LEDGER_FILE_PATH, quarantinePath);
          quarantinedFiles.push(quarantinePath);
          console.error(`[ServerLedger] Forensic quarantine created at: ${quarantinePath}`);
        } catch (qErr) {
          console.error('[ServerLedger] Failed to quarantine corrupt file:', qErr);
        }

        // 3. Attempt recovery from backup snapshot
        if (fs.existsSync(BACKUP_FILE_PATH)) {
          try {
            console.log('[ServerLedger] Attempting state restoration from backup ledger:', BACKUP_FILE_PATH);
            const backupRaw = fs.readFileSync(BACKUP_FILE_PATH, 'utf-8');
            const backupParsed = this.parseState(backupRaw);
            if (backupParsed) {
              console.warn('[ServerLedger] Valid backup loaded. Entering RECOVERY_REQUIRED state pending authorized reconciliation.');
              this.operationalState = 'RECOVERY_REQUIRED';
              let priorAudit: DataLossAuditRecord | null = null;
              if (fs.existsSync(RECOVERY_AUDIT_PATH)) {
                try {
                  const rawAudit = fs.readFileSync(RECOVERY_AUDIT_PATH, 'utf-8');
                  priorAudit = JSON.parse(rawAudit);
                } catch {}
              }
              const auditNote = priorAudit ? ` Prior gap acknowledged by ${priorAudit.operatorId}.` : '';

              this.recoveryInfo = {
                state: 'RECOVERY_REQUIRED',
                reason: `Authoritative ledger was corrupted. Potentially stale backup snapshot loaded; normal mutations blocked pending authorized reconciliation.${auditNote}`,
                timestamp: new Date().toISOString(),
                primaryCorrupted: true,
                backupRestored: true,
                quarantinedFiles,
                reconciliationRequired: true,
                authorizedBy: priorAudit?.operatorId || resetTx?.operatorId,
                reconciledAt: priorAudit?.timestamp,
                dataLossAcknowledged: Boolean(priorAudit),
                acknowledgedGaps: priorAudit?.missingSequences,
                missingEventIds: priorAudit?.missingEventIds,
                unverifiedStatus: priorAudit?.completenessStatus,
                auditRecord: priorAudit || undefined,
                archivedAudits,
                archivedResetTransactions,
                resetTransaction: resetTx || undefined,
                resetTransactionCorrupted: resetJournalCorrupted || undefined,
                resetTransactionError: resetJournalError || undefined,
              };
              return backupParsed;
            }
            throw new Error('CORRUPTED_BACKUP: Backup ledger is also invalid');
          } catch (bErr: any) {
            console.error('[ServerLedger] Backup ledger could not be restored:', bErr.message);
            const quarantineBackup = `${BACKUP_FILE_PATH}.corrupted.${Date.now()}`;
            try {
              fs.renameSync(BACKUP_FILE_PATH, quarantineBackup);
              quarantinedFiles.push(quarantineBackup);
            } catch {}
          }
        }

        // Both primary and backup corrupted
        console.error('[ServerLedger] CRITICAL: Both primary and backup ledgers are corrupt. Entering RECOVERY_BLOCKED state.');
        this.operationalState = 'RECOVERY_BLOCKED';
        this.recoveryInfo = {
          state: 'RECOVERY_BLOCKED',
          reason: 'Authoritative ledger and backup are corrupt. Normal mutations and unverified recoveries blocked.',
          timestamp: new Date().toISOString(),
          primaryCorrupted: true,
          backupRestored: false,
          quarantinedFiles,
          reconciliationRequired: true,
          archivedAudits,
          archivedResetTransactions,
        };
        return this.createFreshDefaultState();
      }
    }

    // 4. Primary file is missing from established installation
    if (backupExists) {
      try {
        const backupRaw = fs.readFileSync(BACKUP_FILE_PATH, 'utf-8');
        const backupParsed = this.parseState(backupRaw);
        if (backupParsed) {
          console.warn('[ServerLedger] Authoritative ledger missing. Valid backup loaded. Entering RECOVERY_REQUIRED state.');
          this.operationalState = 'RECOVERY_REQUIRED';
          let priorAudit: DataLossAuditRecord | null = null;
          if (fs.existsSync(RECOVERY_AUDIT_PATH)) {
            try {
              const rawAudit = fs.readFileSync(RECOVERY_AUDIT_PATH, 'utf-8');
              priorAudit = JSON.parse(rawAudit);
            } catch {}
          }
          const auditNote = priorAudit ? ` Prior gap acknowledged by ${priorAudit.operatorId}.` : '';

          this.recoveryInfo = {
            state: 'RECOVERY_REQUIRED',
            reason: `Authoritative ledger file missing; potentially stale backup loaded. Normal mutations blocked pending authorized reconciliation.${auditNote}`,
            timestamp: new Date().toISOString(),
            primaryCorrupted: true,
            backupRestored: true,
            quarantinedFiles,
            reconciliationRequired: true,
            authorizedBy: priorAudit?.operatorId || resetTx?.operatorId,
            reconciledAt: priorAudit?.timestamp,
            dataLossAcknowledged: Boolean(priorAudit),
            acknowledgedGaps: priorAudit?.missingSequences,
            missingEventIds: priorAudit?.missingEventIds,
            unverifiedStatus: priorAudit?.completenessStatus,
            auditRecord: priorAudit || undefined,
            archivedAudits,
            archivedResetTransactions,
            resetTransaction: resetTx || undefined,
            resetTransactionCorrupted: resetJournalCorrupted || undefined,
            resetTransactionError: resetJournalError || undefined,
          };
          return backupParsed;
        }
      } catch {}
      const quarantineBackup = `${BACKUP_FILE_PATH}.corrupted.${Date.now()}`;
      try {
        fs.renameSync(BACKUP_FILE_PATH, quarantineBackup);
        quarantinedFiles.push(quarantineBackup);
      } catch {}
    }

    // Established system has lost both primary and backup files
    console.error('[ServerLedger] CRITICAL: Established ledger files are missing or unrecoverable. Entering RECOVERY_BLOCKED state.');
    this.operationalState = 'RECOVERY_BLOCKED';
    this.recoveryInfo = {
      state: 'RECOVERY_BLOCKED',
      reason: 'Established authoritative ledger and backup are missing. Normal mutations and unverified recoveries blocked.',
      timestamp: new Date().toISOString(),
      primaryCorrupted: true,
      backupRestored: false,
      quarantinedFiles,
      reconciliationRequired: true,
      archivedAudits,
      archivedResetTransactions,
    };
    return this.createFreshDefaultState();
  }

  /**
   * Atomic, durable disk persistence with sync flushing (fsync).
   * Guarantees that data is physically written to non-volatile storage
   * BEFORE any success acknowledgment or in-memory state advancement.
   * Throws if write, fsync, or atomic rename fails.
   */
  private durablePersistToDisk(stateToPersist: ServerLedgerState, allowDuringRecovery = false): void {
    if (this.simulatedPersistenceFailure) {
      throw new Error('SIMULATED_PERSISTENCE_FAILURE: Durable ledger write failed before commit');
    }

    if (!allowDuringRecovery && this.operationalState && this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot persist state while in recovery mode.`);
    }

    const jsonString = JSON.stringify(stateToPersist, null, 2);
    const tempPath = `${LEDGER_FILE_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}`;

    try {
      // 1. Write to temporary file with synchronous fsync
      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeSync(fd, jsonString, 0, 'utf-8');
        fs.fsyncSync(fd); // Force OS to flush buffer cache to durable media
      } finally {
        fs.closeSync(fd);
      }

      // 2. Atomically replace target authoritative file
      fs.renameSync(tempPath, LEDGER_FILE_PATH);
      this.syncParentDirectory(LEDGER_FILE_PATH);

      // 3. Atomically write durable commit metadata with fsync
      try {
        this.writeCommitMetadata(stateToPersist);
      } catch {}

      // 4. Maintain valid mirror backup of successfully committed authoritative file
      try {
        fs.copyFileSync(LEDGER_FILE_PATH, BACKUP_FILE_PATH);
      } catch {
        // Non-fatal backup copy
      }
    } catch (err: any) {
      // Clean up temp file on failure
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {}
      throw err;
    }
  }

  private writeCommitMetadata(stateToPersist: ServerLedgerState): void {
    const maxSeq = stateToPersist.events.length > 0
      ? Math.max(...stateToPersist.events.map((e) => e.serverSequence))
      : 0;
    const lastEvt = stateToPersist.events.length > 0
      ? stateToPersist.events[stateToPersist.events.length - 1].eventId
      : null;
    const aggVersions: Record<string, number> = {};
    for (const [k, v] of Object.entries(stateToPersist.aggregates)) {
      aggVersions[k] = v.version;
    }
    const meta: DurableCommitMetadata = {
      lastCommittedAt: new Date().toISOString(),
      lastServerSequence: maxSeq,
      lastEventId: lastEvt,
      processedEventIdsCount: stateToPersist.processedEventIds.length,
      aggregateCount: Object.keys(stateToPersist.aggregates).length,
      highestAggregateVersions: aggVersions,
      deviceCursors: { ...stateToPersist.deviceCursors },
      lastAcknowledgedBatchIds: stateToPersist.events.slice(-10).map((e) => e.eventId),
    };

    const tempPath = `${COMMIT_METADATA_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
    try {
      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeSync(fd, JSON.stringify(meta, null, 2), 0, 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempPath, COMMIT_METADATA_PATH);
    } catch {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    }
  }

  private writeRecoveryAudit(audit: DataLossAuditRecord): void {
    if (this.simulatedAuditFailure) {
      throw new Error('SIMULATED_AUDIT_PERSISTENCE_FAILURE: Failed to persist recovery audit record to durable storage.');
    }

    const tempPath = `${RECOVERY_AUDIT_PATH}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
    try {
      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeSync(fd, JSON.stringify(audit, null, 2), 0, 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempPath, RECOVERY_AUDIT_PATH);
      this.syncParentDirectory(RECOVERY_AUDIT_PATH);
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      throw new Error(`AUDIT_PERSISTENCE_FAILED: Could not persist recovery audit record: ${err.message}`);
    }
  }

  private persistToDisk(): void {
    this.durablePersistToDisk(this.state);
  }

  /**
   * Authoritative aggregate version getter
   */
  public authoritativeVersion(aggregateType: string, aggregateId: string): number {
    const aggKey = `${aggregateType}:${aggregateId}`;
    return this.state.aggregates[aggKey]?.version || 0;
  }

  public getUserTenant(userId: string): string {
    if (!userId) return DEFAULT_TENANT_ID;
    return this.state.userTenants[userId] || DEFAULT_TENANT_ID;
  }

  public registerUserTenant(userId: string, tenantId: string): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot mutate ledger configuration while in recovery state.`);
    }
    const draftState = {
      ...this.state,
      userTenants: { ...this.state.userTenants, [userId]: tenantId },
    };
    this.durablePersistToDisk(draftState);
    this.state = draftState;
  }

  public getFacilityTenant(facilityId: string): string {
    if (!facilityId) return DEFAULT_TENANT_ID;
    return this.state.facilityTenants[facilityId] || DEFAULT_TENANT_ID;
  }

  public registerFacilityTenant(facilityId: string, tenantId: string): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot mutate ledger configuration while in recovery state.`);
    }
    const draftState = {
      ...this.state,
      facilityTenants: { ...this.state.facilityTenants, [facilityId]: tenantId },
    };
    this.durablePersistToDisk(draftState);
    this.state = draftState;
  }

  public getUserAccountStatus(userId: string): 'active' | 'suspended' | 'revoked' {
    if (!userId) return 'revoked';
    return this.state.userAccountStatus[userId] || 'active';
  }

  public setUserAccountStatus(userId: string, status: 'active' | 'suspended' | 'revoked'): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot mutate ledger configuration while in recovery state.`);
    }
    const draftState = {
      ...this.state,
      userAccountStatus: { ...this.state.userAccountStatus, [userId]: status },
    };
    this.durablePersistToDisk(draftState);
    this.state = draftState;
  }

  public getUserSyncCapabilities(userId: string): string[] {
    if (!userId) return [];
    return this.state.userSyncCapabilities[userId] || ['sync:facility'];
  }

  public setUserSyncCapabilities(userId: string, caps: string[]): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot mutate ledger configuration while in recovery state.`);
    }
    const draftState = {
      ...this.state,
      userSyncCapabilities: { ...this.state.userSyncCapabilities, [userId]: caps },
    };
    this.durablePersistToDisk(draftState);
    this.state = draftState;
  }

  public hasCrossFacilitySyncCapability(userId: string): boolean {
    if (!userId) return false;
    if (this.getUserAccountStatus(userId) !== 'active') return false;
    const caps = this.getUserSyncCapabilities(userId);
    return caps.includes('sync:cross_facility');
  }

  /**
   * Enforce facility authorization security boundary (STRICT FAIL-CLOSED)
   * Resolves from server-authoritative membership and tenant data.
   */
  public verifyFacilityAccess(userId: string, facilityId: string, tenantId?: string): boolean {
    if (!facilityId || !userId) return false;

    // Check account status
    const status = this.getUserAccountStatus(userId);
    if (status !== 'active') return false;

    // Check tenant boundary
    const userTenant = this.getUserTenant(userId);
    const facilityTenant = this.getFacilityTenant(facilityId);
    if (userTenant && facilityTenant && userTenant !== facilityTenant) {
      return false; // Cross-tenant denied
    }
    if (tenantId && userTenant && tenantId !== userTenant) {
      return false;
    }

    const allowedFacilities = this.state.facilityMemberships[userId];
    if (!allowedFacilities || allowedFacilities.length === 0) {
      // Unknown user / no facility membership -> Strict Fail-Closed -> DENY
      return false;
    }
    return allowedFacilities.includes(facilityId);
  }

  public getUserFacilities(userId: string): string[] {
    if (!userId) return [];
    return this.state.facilityMemberships[userId] || [];
  }

  public registerFacilityMembership(userId: string, facilityIds: string[]): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`LEDGER_${this.operationalState}: Cannot mutate ledger configuration while in recovery state.`);
    }
    const draftState = {
      ...this.state,
      facilityMemberships: { ...this.state.facilityMemberships, [userId]: facilityIds },
    };
    this.durablePersistToDisk(draftState);
    this.state = draftState;
  }

  /**
   * Process push batch with strict idempotency and authoritative version checking.
   * Validates tenant isolation, facility permissions, and actor attribution.
   * Enforces transactional durability: in-memory state is mutated ONLY AFTER
   * authoritative persistence has genuinely committed.
   */
  public processPushBatch(
    deviceId: string,
    batchTimestamp: string,
    events: any[],
    principalOrActor: any = 'usr-system'
  ): {
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
  } {
    const receivedAt = new Date().toISOString();

    // Recovery gate enforcement
    if (this.operationalState !== 'NORMAL') {
      const errCode = this.operationalState === 'RECOVERY_REQUIRED'
        ? 'LEDGER_RECOVERY_REQUIRED'
        : 'LEDGER_RECOVERY_BLOCKED';
      console.error(`[ServerLedger] Rejecting push batch: Ledger is in ${this.operationalState} state.`);
      return {
        status: 'error',
        error: errCode,
        message: `Clinical and sync writes blocked: Server ledger is in ${this.operationalState} state. ${this.recoveryInfo?.reason || ''}`,
        operationalState: this.operationalState,
        recoveryRequired: true,
        receivedAt,
        processedCount: 0,
        acknowledgedEventIds: [],
        duplicateEventIds: [],
        rejectedEvents: [],
        conflicts: [],
      };
    }
    const acknowledgedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    const rejectedEvents: Array<{
      eventId: string;
      reason: string;
      code: string;
    }> = [];
    const conflicts: Array<{
      eventId: string;
      aggregateType: string;
      aggregateId: string;
      serverVersion: number;
      serverState: Record<string, unknown>;
      reason: string;
    }> = [];

    // Resolve caller identity and security context
    let principalUserId = 'usr-system';
    let callerTenantId = DEFAULT_TENANT_ID;
    let callerAccountStatus: 'active' | 'suspended' | 'revoked' = 'active';
    let allowedFacilities: string[] = [];
    let isSystemDelegation = false;
    let hasCrossFacility = false;

    if (typeof principalOrActor === 'string') {
      principalUserId = principalOrActor;
      callerTenantId = this.getUserTenant(principalUserId);
      callerAccountStatus = this.getUserAccountStatus(principalUserId);
      allowedFacilities = this.getUserFacilities(principalUserId);
      const caps = this.getUserSyncCapabilities(principalUserId);
      hasCrossFacility = caps.includes('sync:cross_facility');
      isSystemDelegation = principalUserId === 'usr-system' || caps.includes('sync:delegation');
    } else if (typeof principalOrActor === 'object' && principalOrActor !== null) {
      principalUserId = principalOrActor.userId || 'usr-system';
      callerTenantId = principalOrActor.tenantId || this.getUserTenant(principalUserId);
      callerAccountStatus = principalOrActor.accountStatus || this.getUserAccountStatus(principalUserId);
      allowedFacilities = Array.isArray(principalOrActor.facilityIds)
        ? principalOrActor.facilityIds
        : this.getUserFacilities(principalUserId);
      const caps = Array.isArray(principalOrActor.syncCapabilities)
        ? principalOrActor.syncCapabilities
        : this.getUserSyncCapabilities(principalUserId);
      hasCrossFacility = caps.includes('sync:cross_facility');
      isSystemDelegation = (Array.isArray(principalOrActor.roles) && principalOrActor.roles.includes('system_administrator'))
        || caps.includes('sync:delegation')
        || principalUserId === 'usr-system';
    }

    if (callerAccountStatus !== 'active') {
      return {
        status: 'rejected',
        receivedAt,
        processedCount: 0,
        acknowledgedEventIds: [],
        duplicateEventIds: [],
        rejectedEvents: [],
        conflicts: [],
        error: `ACCOUNT_${callerAccountStatus.toUpperCase()}`,
      };
    }

    // Stage updates in isolated draft state — zero mutation of this.state before commit
    const draftState: ServerLedgerState = {
      processedEventIds: [...this.state.processedEventIds],
      aggregates: Object.fromEntries(
        Object.entries(this.state.aggregates).map(([k, v]) => [k, { ...v, data: { ...v.data } }])
      ),
      events: [...this.state.events],
      conflicts: [...this.state.conflicts],
      facilityMemberships: { ...this.state.facilityMemberships },
      facilityTenants: { ...this.state.facilityTenants },
      userTenants: { ...this.state.userTenants },
      userAccountStatus: { ...this.state.userAccountStatus },
      userSyncCapabilities: { ...this.state.userSyncCapabilities },
      deviceCursors: { ...this.state.deviceCursors },
    };

    const stagedAcknowledgedIds: string[] = [];

    for (const ev of events) {
      const eventId = ev.eventId || ev.id;
      if (!eventId || typeof eventId !== 'string') {
        rejectedEvents.push({
          eventId: eventId || 'missing-event-id',
          reason: 'Event missing required eventId string.',
          code: 'MALFORMED_EVENT',
        });
        continue;
      }

      // Event structure validation
      if (
        !ev.eventType || typeof ev.eventType !== 'string' ||
        !ev.aggregateType || typeof ev.aggregateType !== 'string' ||
        !ev.aggregateId || typeof ev.aggregateId !== 'string' ||
        !ev.facilityId || typeof ev.facilityId !== 'string' ||
        ev.payload === undefined || ev.payload === null || typeof ev.payload !== 'object'
      ) {
        rejectedEvents.push({
          eventId,
          reason: 'Event missing required schema fields (eventType, aggregateType, aggregateId, facilityId, payload).',
          code: 'MALFORMED_EVENT',
        });
        continue;
      }

      // Facility tenant isolation check
      const eventFacilityTenant = this.getFacilityTenant(ev.facilityId);
      if (eventFacilityTenant !== callerTenantId) {
        rejectedEvents.push({
          eventId,
          reason: `Cross-tenant event rejected: Target facility '${ev.facilityId}' belongs to tenant '${eventFacilityTenant}', but caller is in tenant '${callerTenantId}'.`,
          code: 'TENANT_ISOLATION_VIOLATION',
        });
        continue;
      }

      // Facility membership check
      const isAuthorizedFacility = allowedFacilities.includes(ev.facilityId)
        || (hasCrossFacility && eventFacilityTenant === callerTenantId);
      if (!isAuthorizedFacility) {
        rejectedEvents.push({
          eventId,
          reason: `Principal '${principalUserId}' is not authorized to write events for facility '${ev.facilityId}'.`,
          code: 'FACILITY_ACCESS_FORBIDDEN',
        });
        continue;
      }

      // Actor attribution verification (Anti-Spoofing)
      const eventActorId = ev.actorId || ev.metadata?.actorId;
      if (eventActorId && eventActorId !== principalUserId && !isSystemDelegation) {
        rejectedEvents.push({
          eventId,
          reason: `Actor attribution mismatch: Client asserted actor '${eventActorId}', but authenticated principal is '${principalUserId}'.`,
          code: 'ACTOR_ATTRIBUTION_FORBIDDEN',
        });
        continue;
      }

      // 1. Idempotency Check: Already processed this exact event?
      if (draftState.processedEventIds.includes(eventId)) {
        duplicateEventIds.push(eventId);
        stagedAcknowledgedIds.push(eventId); // Idempotently acknowledge
        continue;
      }

      const aggKey = `${ev.aggregateType}:${ev.aggregateId}`;
      const existing = draftState.aggregates[aggKey];
      const currentVer = existing ? existing.version : 0;

      // Determine client expected base version
      let clientBaseVersion = 0;
      if (typeof ev.baseVersion === 'number') {
        clientBaseVersion = ev.baseVersion;
      } else if (typeof ev.expectedVersion === 'number') {
        clientBaseVersion = ev.expectedVersion;
      } else if (typeof ev.clientBaseVersion === 'number') {
        clientBaseVersion = ev.clientBaseVersion;
      } else if (typeof ev.version === 'number') {
        clientBaseVersion = existing ? ev.version - 1 : 0;
      }

      // 2. Authoritative Server-Side Versioning & Concurrency Conflict Check
      if (existing) {
        if (clientBaseVersion !== currentVer) {
          const conflictReason = `Version divergence on aggregate ${aggKey}: Server authoritative version is ${currentVer}, incoming event expected base version ${clientBaseVersion}.`;
          conflicts.push({
            eventId,
            aggregateType: ev.aggregateType,
            aggregateId: ev.aggregateId,
            serverVersion: currentVer,
            serverState: existing.data,
            reason: conflictReason,
          });

          // Record conflict in draft ledger
          draftState.conflicts.push({
            conflictId: `cnf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            eventId,
            aggregateType: ev.aggregateType,
            aggregateId: ev.aggregateId,
            facilityId: ev.facilityId || existing.facilityId,
            tenantId: callerTenantId,
            serverVersion: currentVer,
            clientVersion: typeof ev.version === 'number' ? ev.version : clientBaseVersion + 1,
            serverState: existing.data,
            clientState: ev.payload || {},
            reason: conflictReason,
            detectedAt: receivedAt,
            status: 'PENDING',
          });

          continue;
        }
      } else {
        if (clientBaseVersion !== 0) {
          const conflictReason = `Aggregate ${aggKey} does not exist on server (current version 0), but event expected base version ${clientBaseVersion}.`;
          conflicts.push({
            eventId,
            aggregateType: ev.aggregateType,
            aggregateId: ev.aggregateId,
            serverVersion: 0,
            serverState: {},
            reason: conflictReason,
          });
          continue;
        }
      }

      // 3. Stage mutation: Next version is strictly and monotonically calculated by server!
      const committedVersion = currentVer + 1;
      const committedData = existing
        ? { ...existing.data, ...(ev.payload || {}) }
        : { ...(ev.payload || {}) };

      draftState.aggregates[aggKey] = {
        aggregateType: ev.aggregateType,
        aggregateId: ev.aggregateId,
        version: committedVersion,
        data: committedData,
        lastModified: receivedAt,
        facilityId: ev.facilityId,
        tenantId: callerTenantId,
        lastEventId: eventId,
      };

      // 4. Append to server domain event sequence
      const nextSequence = draftState.events.length + 1;
      draftState.events.push({
        serverSequence: nextSequence,
        eventId,
        eventType: ev.eventType,
        aggregateType: ev.aggregateType,
        aggregateId: ev.aggregateId,
        facilityId: ev.facilityId,
        tenantId: callerTenantId,
        actorId: isSystemDelegation && eventActorId ? eventActorId : principalUserId,
        deviceId: deviceId || 'unknown-device',
        clientVersion: committedVersion,
        payload: ev.payload || {},
        clientTimestamp: ev.timestamp || receivedAt,
        serverReceivedAt: receivedAt,
        serverCommittedAt: receivedAt,
      });

      // 5. Stage in processed set
      draftState.processedEventIds.push(eventId);
      stagedAcknowledgedIds.push(eventId);
    }

    // 6. Durable Commit Boundary
    const hasMutations =
      draftState.events.length > this.state.events.length ||
      draftState.conflicts.length > this.state.conflicts.length;

    if (hasMutations) {
      try {
        // Authoritative persistence write MUST genuinely succeed before updating in-memory state or acknowledging!
        this.durablePersistToDisk(draftState);
      } catch (err: any) {
        console.error('[ServerLedger] Authoritative persistence failed during processPushBatch:', err.message);
        // In-memory state this.state is completely untouched!
        // Return honest error: zero events acknowledged!
        return {
          status: 'error',
          receivedAt,
          processedCount: 0,
          acknowledgedEventIds: [],
          duplicateEventIds: [],
          rejectedEvents,
          conflicts: [],
          error: 'PERSISTENCE_FAILED',
        };
      }

      // Durable commit succeeded! Now, and ONLY now, advance in-memory authoritative state.
      this.state = draftState;
    }

    // Acknowledge genuinely committed and verified duplicate events
    acknowledgedEventIds.push(...stagedAcknowledgedIds);

    let batchStatus: 'acknowledged' | 'partial' | 'rejected' = 'acknowledged';
    if (conflicts.length > 0) {
      batchStatus = 'partial';
    } else if (rejectedEvents.length > 0) {
      batchStatus = acknowledgedEventIds.length === 0 ? 'rejected' : 'partial';
    }

    return {
      status: batchStatus,
      receivedAt,
      processedCount: acknowledgedEventIds.length,
      acknowledgedEventIds,
      duplicateEventIds,
      rejectedEvents,
      conflicts,
    };
  }

  /**
   * Pull server changes occurred after known cursor.
   * Strictly enforces tenant boundary and facility access controls.
   */
  public pullChanges(
    cursor: string | null,
    facilityId?: string,
    deviceId?: string,
    callerTenantId?: string,
    authorizedFacilityIds?: string[],
    allowCrossFacility = false
  ): {
    status: 'ok';
    facilityId: string;
    serverTimestamp: string;
    cursor: string;
    deltas: any[];
  } {
    const serverTimestamp = new Date().toISOString();
    let sinceSequence = 0;

    if (cursor) {
      const parsed = parseInt(cursor, 10);
      if (!isNaN(parsed)) {
        sinceSequence = parsed;
      }
    }

    const effectiveTenantId = callerTenantId || DEFAULT_TENANT_ID;

    // Filter events after cursor with strict tenant and facility isolation
    const eligibleEvents = this.state.events.filter((ev) => {
      const sequenceMatches = ev.serverSequence > sinceSequence;

      // Tenant isolation: event tenant must match caller tenant
      const eventTenant = ev.tenantId || this.getFacilityTenant(ev.facilityId);
      if (eventTenant !== effectiveTenantId) {
        return false;
      }

      // Facility filtering
      let facilityMatches = false;
      if (facilityId === 'all') {
        if (!allowCrossFacility) {
          // If cross-facility synchronization is not explicitly authorized, deny access
          return false;
        }
        // If cross-facility authorized, restrict to caller's authorized facilities or whole tenant
        if (authorizedFacilityIds && authorizedFacilityIds.length > 0) {
          facilityMatches = authorizedFacilityIds.includes(ev.facilityId);
        } else {
          facilityMatches = true;
        }
      } else if (facilityId) {
        facilityMatches = ev.facilityId === facilityId;
      } else {
        // Missing facility ID: default strictly to caller's first authorized facility (never 'all')
        if (authorizedFacilityIds && authorizedFacilityIds.length > 0) {
          facilityMatches = ev.facilityId === authorizedFacilityIds[0];
        } else {
          return false;
        }
      }

      // Optionally don't echo back events originally created by same device
      const isExternalDevice = !deviceId || ev.deviceId !== deviceId;
      return sequenceMatches && facilityMatches && isExternalDevice;
    });

    const maxSequence = this.state.events.reduce(
      (max, ev) => Math.max(max, ev.serverSequence),
      sinceSequence
    );

    // Track device pull cursor only in NORMAL operational state
    if (deviceId && facilityId && this.operationalState === 'NORMAL') {
      const draftState = {
        ...this.state,
        deviceCursors: { ...this.state.deviceCursors, [`${deviceId}:${facilityId}`]: maxSequence },
      };
      try {
        this.durablePersistToDisk(draftState);
        this.state = draftState;
      } catch (err: any) {
        console.warn('[ServerLedger] Failed to persist device cursor update:', err.message);
      }
    }

    return {
      status: 'ok',
      facilityId: facilityId || (authorizedFacilityIds && authorizedFacilityIds[0]) || 'unknown',
      serverTimestamp,
      cursor: String(maxSequence),
      deltas: eligibleEvents.map((ev) => ({
        eventId: ev.eventId,
        eventType: ev.eventType,
        aggregateType: ev.aggregateType,
        aggregateId: ev.aggregateId,
        facilityId: ev.facilityId,
        actorId: ev.actorId,
        deviceId: ev.deviceId,
        timestamp: ev.serverCommittedAt,
        sequence: ev.serverSequence,
        version: ev.clientVersion,
        payload: ev.payload,
        syncStatus: 'SYNCED',
      })),
    };
  }

  /**
   * Maintenance / testing state reset (ordinary reset fails when in recovery state)
   */
  public reset(): void {
    if (this.operationalState !== 'NORMAL') {
      throw new Error(`CANNOT_RESET: Ledger is in ${this.operationalState} state. Ordinary reset cannot bypass recovery gate. Authorized recovery required.`);
    }
    const freshState = this.createFreshDefaultState();
    this.durablePersistToDisk(freshState);
    this.state = freshState;
  }

  /**
   * Durably archive the current recovery audit file before any destructive reinitialization.
   * Preserves historical contents verbatim under a collision-resistant, timestamped filename.
   * IMPORTANT: The canonical recovery audit file (.server_ledger_recovery_audit.json) is KEPT
   * intact in place during this archival and verification step. It is NOT deleted or renamed away.
   * Returns the archived file path if an audit file was archived, or null if no audit existed.
   * Throws if archival, directory sync, or verification fails, ensuring fail-closed semantics.
   */
  public archiveRecoveryAuditIfExists(): string | null {
    if (!fs.existsSync(RECOVERY_AUDIT_PATH)) {
      return null;
    }

    if (this.simulatedArchivalFailure) {
      throw new Error('SIMULATED_ARCHIVAL_FAILURE: Failed to archive recovery audit record to durable storage.');
    }

    // Step 1: Read canonical recovery audit as raw bytes (avoiding any UTF-8 decoding distortions)
    const canonicalBytes = fs.readFileSync(RECOVERY_AUDIT_PATH);
    const baseDir = path.dirname(RECOVERY_AUDIT_PATH);

    // Step 2: Collision-resistant, timestamped filename generation:
    // Format: .server_ledger_recovery_audit.YYYYMMDDTHHMMSSZ.<unique-suffix>.archived
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

    let archivePath = '';
    let archiveFd: number | null = null;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const uniqueSuffix = `${process.pid}.${Date.now()}.${randomSuffix}${attempt > 0 ? `.${attempt}` : ''}`;
      const candidateName = `.server_ledger_recovery_audit.${timestamp}.${uniqueSuffix}.archived`;
      const candidatePath = path.join(baseDir, candidateName);

      // Atomic non-overwriting archive creation using 'wx' flag (O_CREAT | O_EXCL | O_WRONLY)
      // Guarantees at kernel/filesystem level that an existing file is NEVER overwritten.
      try {
        archiveFd = fs.openSync(candidatePath, 'wx');
        archivePath = candidatePath;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          // File already exists; select another unique candidate
          continue;
        }
        throw new Error(`ARCHIVE_CREATION_FAILED: Failed to create archive file: ${err.message}`);
      }
    }

    if (!archivePath || archiveFd === null) {
      throw new Error('ARCHIVE_NAME_COLLISION: Failed to generate a unique, non-colliding archive filename.');
    }

    // Step 3: Write raw bytes to the exclusively created archive file and flush to disk
    try {
      fs.writeSync(archiveFd, canonicalBytes, 0, canonicalBytes.length);
      fs.fsyncSync(archiveFd);
    } finally {
      try {
        fs.closeSync(archiveFd);
      } catch {}
    }

    // Step 4: Synchronize parent directory metadata to flush directory entry
    this.syncParentDirectory(archivePath);

    // Step 5: Verification checks
    if (this.simulatedArchiveVerificationFailure) {
      throw new Error('SIMULATED_ARCHIVE_VERIFICATION_FAILURE: Verification of archived recovery audit failed.');
    }

    // 5a. Verify archived file exists on disk
    if (!fs.existsSync(archivePath)) {
      throw new Error(`ARCHIVE_VERIFICATION_FAILED: Archived recovery audit does not exist at ${archivePath}`);
    }

    // 5b. Verify archived contents match original contents byte-for-byte using Buffer comparison
    const archivedBytes = fs.readFileSync(archivePath);
    if (canonicalBytes.length !== archivedBytes.length || !canonicalBytes.equals(archivedBytes)) {
      throw new Error('ARCHIVE_VERIFICATION_FAILED: Archived audit content does not match original audit content byte-for-byte');
    }

    // 5c. Verify the original canonical recovery audit is STILL intact and unmodified at its canonical path
    if (!fs.existsSync(RECOVERY_AUDIT_PATH)) {
      throw new Error(`ARCHIVE_VERIFICATION_FAILED: Canonical recovery audit disappeared during archival from ${RECOVERY_AUDIT_PATH}`);
    }
    const currentCanonicalBytes = fs.readFileSync(RECOVERY_AUDIT_PATH);
    if (canonicalBytes.length !== currentCanonicalBytes.length || !canonicalBytes.equals(currentCanonicalBytes)) {
      throw new Error('ARCHIVE_VERIFICATION_FAILED: Canonical recovery audit was modified during archival');
    }

    console.log(`[ServerLedger] Preserved and verified historical recovery audit: ${archivePath}`);
    return archivePath;
  }

  /**
   * Durably archive the current reset transaction journal before replacing it.
   * Preserves historical or interrupted transaction bytes verbatim under a collision-resistant,
   * timestamped filename, whether the journal is valid COMMITTED, IN_PROGRESS, or malformed/corrupted.
   *
   * Convention: .server_ledger_reset_transaction.<timestamp>.<pid>.<unique-suffix>.archived
   *
   * The canonical reset transaction file (.server_ledger_reset_transaction.json) is kept intact
   * in place during this archival and verification step until atomic replacement occurs later.
   * Returns the archived file path if a journal was archived, or null if no journal existed.
   * Throws if archival, directory sync, or verification fails, ensuring fail-closed semantics.
   */
  public archiveResetTransactionIfExists(): string | null {
    if (!fs.existsSync(RESET_TRANSACTION_PATH)) {
      return null;
    }

    if (this.simulatedResetJournalArchivalFailure) {
      throw new Error('SIMULATED_RESET_JOURNAL_ARCHIVAL_FAILURE: Failed to archive reset transaction journal to durable storage.');
    }

    // Step 1: Read canonical reset transaction journal as raw bytes (Buffer)
    // Preserves raw bytes without parsing or reconstructing, capturing malformed/corrupted bytes verbatim
    const canonicalBytes = fs.readFileSync(RESET_TRANSACTION_PATH);
    const baseDir = path.dirname(RESET_TRANSACTION_PATH);

    // Step 2: Collision-resistant, timestamped filename generation:
    // Format: .server_ledger_reset_transaction.YYYYMMDDTHHMMSSZ.<pid>.<unique-suffix>.archived
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

    let archivePath = '';
    let archiveFd: number | null = null;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const uniqueSuffix = `${process.pid}.${Date.now()}.${randomSuffix}${attempt > 0 ? `.${attempt}` : ''}`;
      const candidateName = `.server_ledger_reset_transaction.${timestamp}.${uniqueSuffix}.archived`;
      const candidatePath = path.join(baseDir, candidateName);

      // Atomic non-overwriting archive creation using 'wx' flag (O_CREAT | O_EXCL | O_WRONLY)
      // Guarantees at kernel/filesystem level that an existing file is NEVER overwritten.
      try {
        archiveFd = fs.openSync(candidatePath, 'wx');
        archivePath = candidatePath;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          continue;
        }
        throw new Error(`ARCHIVE_CREATION_FAILED: Failed to create reset transaction archive file: ${err.message}`);
      }
    }

    if (!archivePath || archiveFd === null) {
      throw new Error('ARCHIVE_NAME_COLLISION: Failed to generate a unique, non-colliding reset transaction archive filename.');
    }

    // Step 3: Write raw bytes to the exclusively created archive file and flush to disk
    try {
      fs.writeSync(archiveFd, canonicalBytes, 0, canonicalBytes.length);
      fs.fsyncSync(archiveFd);
    } finally {
      try {
        fs.closeSync(archiveFd);
      } catch {}
    }

    // Step 4: Synchronize parent directory metadata to flush directory entry
    this.syncParentDirectory(archivePath);

    // Step 5: Verification checks
    if (this.simulatedResetJournalArchiveVerificationFailure) {
      throw new Error('SIMULATED_RESET_JOURNAL_ARCHIVE_VERIFICATION_FAILURE: Verification of archived reset transaction failed.');
    }

    // 5a. Verify archived file exists on disk
    if (!fs.existsSync(archivePath)) {
      throw new Error(`ARCHIVE_VERIFICATION_FAILED: Archived reset transaction does not exist at ${archivePath}`);
    }

    // 5b. Verify archived contents match original contents byte-for-byte using Buffer comparison
    const archivedBytes = fs.readFileSync(archivePath);
    if (canonicalBytes.length !== archivedBytes.length || !canonicalBytes.equals(archivedBytes)) {
      throw new Error('ARCHIVE_VERIFICATION_FAILED: Archived reset transaction content does not match original journal byte-for-byte');
    }

    // 5c. Verify the original canonical journal is STILL intact and unmodified at its canonical path
    if (!fs.existsSync(RESET_TRANSACTION_PATH)) {
      throw new Error(`ARCHIVE_VERIFICATION_FAILED: Canonical reset transaction disappeared during archival from ${RESET_TRANSACTION_PATH}`);
    }
    const currentCanonicalBytes = fs.readFileSync(RESET_TRANSACTION_PATH);
    if (canonicalBytes.length !== currentCanonicalBytes.length || !canonicalBytes.equals(currentCanonicalBytes)) {
      throw new Error('ARCHIVE_VERIFICATION_FAILED: Canonical reset transaction journal was modified during archival');
    }

    console.log(`[ServerLedger] Preserved and verified historical reset transaction journal: ${archivePath}`);
    return archivePath;
  }

  /**
   * Authorized administrative force reset for disaster recovery or testing re-initialization.
   * Enforces fail-closed recovery audit preservation: if a recovery audit exists, it MUST be
   * safely archived and verified BEFORE any destructive reset actions occur.
   * Keeps canonical audit in place until all durable persistence operations have succeeded.
   */
  public adminForceReset(principal: { userId?: string; roles?: string[]; provider?: string; accountStatus?: string } | any, reason?: string): void {
    if (!isAuthorizedForLedgerRecovery(principal)) {
      throw new Error('UNAUTHORIZED: Global administrative authority required for force reset.');
    }

    // STEP 1: Archive and verify existing recovery audit BEFORE any destructive operations.
    // Canonical recovery audit file (.server_ledger_recovery_audit.json) remains intact in place.
    // If archival, directory sync, or verification fails, an exception is thrown, aborting reset immediately.
    const archivedPath = this.archiveRecoveryAuditIfExists();

    // STEP 1a: Archive and verify existing reset transaction journal BEFORE replacement (Finding FND-05).
    // Preserves original bytes of any existing journal (whether COMMITTED, IN_PROGRESS, or corrupted)
    // in a distinct forensic archive. Original canonical journal remains intact until replaced.
    const archivedResetTxPath = this.archiveResetTransactionIfExists();

    const userId = typeof principal === 'object' && principal?.userId ? principal.userId : 'unknown';
    const txId = `reset-tx-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // STEP 1b: Persist durable reset transaction journal in IN_PROGRESS state BEFORE destructive operations.
    const txRecord: ResetTransactionRecord = {
      transactionId: txId,
      status: 'IN_PROGRESS',
      operatorId: userId,
      reason: reason || 'Manual reinitialization',
      startedAt: new Date().toISOString(),
      archivedAuditPath: archivedPath || null,
      archivedResetTxPath: archivedResetTxPath || null,
      phase: 'INITIALIZING_FRESH_STATE',
    };
    this.writeResetTransaction(txRecord);

    // STEP 2: Proceed with destructive re-initialization only after successful archival verification and IN_PROGRESS journal persistence.
    // The canonical audit file STILL remains in place while destructive operations occur.
    const freshState = this.createFreshDefaultState();
    this.durablePersistToDisk(freshState, true);

    // STEP 2b: Update backup mirror durably (NO empty catch! Fail closed on backup failure - Fixes F-06)
    if (this.simulatedBackupFailure) {
      throw new Error('SIMULATED_BACKUP_FAILURE: Backup ledger creation failed.');
    }
    try {
      fs.copyFileSync(LEDGER_FILE_PATH, BACKUP_FILE_PATH);
      const backupFd = fs.openSync(BACKUP_FILE_PATH, 'r');
      try {
        fs.fsyncSync(backupFd);
      } finally {
        try { fs.closeSync(backupFd); } catch {}
      }
      this.syncParentDirectory(BACKUP_FILE_PATH);
    } catch (bErr: any) {
      throw new Error(`BACKUP_CREATION_FAILED: Failed to create or synchronize backup ledger during reset: ${bErr.message}`);
    }

    // STEP 2c: Update established installation marker durably
    try {
      if (!fs.existsSync(ESTABLISHED_MARKER_PATH)) {
        fs.writeFileSync(
          ESTABLISHED_MARKER_PATH,
          JSON.stringify({ establishedAt: new Date().toISOString() }, null, 2),
          'utf-8'
        );
        this.syncParentDirectory(ESTABLISHED_MARKER_PATH);
      }
    } catch (mErr: any) {
      throw new Error(`ESTABLISHED_MARKER_FAILED: Failed to persist established marker during reset: ${mErr.message}`);
    }

    // STEP 3: ONLY after all required durable persistence operations have succeeded,
    // remove the canonical recovery audit file as the final completion step of the reset,
    // and synchronize the parent directory.
    if (archivedPath && fs.existsSync(RECOVERY_AUDIT_PATH)) {
      fs.unlinkSync(RECOVERY_AUDIT_PATH);
      if (this.simulatedFinalDirectoryFsyncFailure) {
        throw new Error('SIMULATED_DIRECTORY_FSYNC_FAILURE: Directory synchronization failed after canonical audit removal.');
      }
      this.syncParentDirectory(RECOVERY_AUDIT_PATH);
    }

    // STEP 4: Durably commit the reset transaction journal to COMMITTED.
    txRecord.status = 'COMMITTED';
    txRecord.committedAt = new Date().toISOString();
    txRecord.phase = 'COMPLETED';
    this.writeResetTransaction(txRecord);

    // STEP 5: In-memory state mutation and transition to NORMAL
    this.state = freshState;
    this.operationalState = 'NORMAL';
    this.recoveryInfo = {
      state: 'NORMAL',
      reason: `Force reset by admin ${userId}: ${reason || 'Manual reinitialization'}`,
      timestamp: new Date().toISOString(),
      primaryCorrupted: false,
      backupRestored: false,
      quarantinedFiles: this.recoveryInfo?.quarantinedFiles || [],
      reconciliationRequired: false,
      authorizedBy: userId,
      reconciledAt: new Date().toISOString(),
      completeness: this.verifyRecoveryCompleteness(),
      dataLossAcknowledged: false,
      archivedAudits: this.getRecoveryAuditArchives(),
      resetTransaction: txRecord,
      resetTransactionCorrupted: false,
    };
  }

  private scanQuarantinedArtifacts(
    candidateEventIds: Set<string>,
    maxCandidateSequence: number
  ): {
    scannedCount: number;
    discoveredSequences: number[];
    missingSequences: number[];
    discoveredEventIds: string[];
    missingEventIds: string[];
  } {
    const quarantinedFiles = new Set<string>(this.recoveryInfo?.quarantinedFiles || []);
    try {
      const dirEntries = fs.readdirSync(process.cwd());
      for (const f of dirEntries) {
        if (f.includes('.server_ledger_data.json.corrupted.') || f.includes('.server_ledger_data.json.bak.corrupted.')) {
          quarantinedFiles.add(path.join(process.cwd(), f));
        }
      }
    } catch {}

    const discoveredSequences = new Set<number>();
    const discoveredEventIds = new Set<string>();
    let scannedCount = 0;

    for (const qPath of quarantinedFiles) {
      if (!fs.existsSync(qPath)) continue;
      scannedCount++;
      try {
        const raw = fs.readFileSync(qPath, 'utf-8');
        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch {}

        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.events)) {
            for (const ev of parsed.events) {
              if (typeof ev.serverSequence === 'number') discoveredSequences.add(ev.serverSequence);
              if (typeof ev.eventId === 'string') discoveredEventIds.add(ev.eventId);
            }
          }
          if (Array.isArray(parsed.processedEventIds)) {
            for (const id of parsed.processedEventIds) {
              if (typeof id === 'string') discoveredEventIds.add(id);
            }
          }
        } else {
          const seqMatches = raw.matchAll(/"serverSequence"\s*:\s*(\d+)/g);
          for (const m of seqMatches) {
            const s = parseInt(m[1], 10);
            if (!isNaN(s)) discoveredSequences.add(s);
          }
          const evtMatches = raw.matchAll(/"eventId"\s*:\s*"([^"]+)"/g);
          for (const m of evtMatches) {
            if (m[1]) discoveredEventIds.add(m[1]);
          }
          const lastEvtMatches = raw.matchAll(/"lastEventId"\s*:\s*"([^"]+)"/g);
          for (const m of lastEvtMatches) {
            if (m[1]) discoveredEventIds.add(m[1]);
          }
        }
      } catch (err: any) {
        console.warn(`[ServerLedger] Could not inspect forensic artifact ${qPath}:`, err.message);
      }
    }

    const missingSequences = Array.from(discoveredSequences)
      .filter((s) => s > maxCandidateSequence)
      .sort((a, b) => a - b);

    const missingEventIds = Array.from(discoveredEventIds)
      .filter((id) => !candidateEventIds.has(id));

    return {
      scannedCount,
      discoveredSequences: Array.from(discoveredSequences).sort((a, b) => a - b),
      missingSequences,
      discoveredEventIds: Array.from(discoveredEventIds),
      missingEventIds,
    };
  }

  public verifyRecoveryCompleteness(): RecoveryCompletenessResult {
    const candidateEvents = this.state.events || [];
    const candidateEventIds = new Set<string>([
      ...(this.state.processedEventIds || []),
      ...candidateEvents.map((e) => e.eventId),
    ]);
    const candidateSequences = candidateEvents.map((e) => e.serverSequence).sort((a, b) => a - b);
    const maxCandidateSequence = candidateSequences.length > 0 ? Math.max(...candidateSequences) : 0;

    const missingSequencesSet = new Set<number>();
    const missingEventIdsSet = new Set<string>();
    const unverifiedReasons: string[] = [];
    const aggregateDiscrepancies: string[] = [];

    // 1. Internal candidate sequence continuity check (1..N)
    if (maxCandidateSequence > 0) {
      const seqSet = new Set(candidateSequences);
      for (let s = 1; s <= maxCandidateSequence; s++) {
        if (!seqSet.has(s)) {
          missingSequencesSet.add(s);
        }
      }
    }

    // 2. Candidate aggregate consistency
    for (const [key, agg] of Object.entries(this.state.aggregates || {})) {
      if (agg.lastEventId && !candidateEventIds.has(agg.lastEventId)) {
        missingEventIdsSet.add(agg.lastEventId);
        aggregateDiscrepancies.push(`Aggregate ${key} references lastEventId '${agg.lastEventId}' missing from candidate history.`);
      }
    }

    // 3. Candidate device cursors consistency
    for (const [deviceContext, cursorSeq] of Object.entries(this.state.deviceCursors || {})) {
      if (typeof cursorSeq === 'number' && cursorSeq > maxCandidateSequence) {
        for (let s = maxCandidateSequence + 1; s <= cursorSeq; s++) {
          missingSequencesSet.add(s);
        }
        unverifiedReasons.push(`Device cursor '${deviceContext}' acknowledges sequence ${cursorSeq}, exceeding candidate max sequence ${maxCandidateSequence}.`);
      }
    }

    // 4. Scan forensic quarantine artifacts
    const quarantineScan = this.scanQuarantinedArtifacts(candidateEventIds, maxCandidateSequence);
    for (const s of quarantineScan.missingSequences) {
      missingSequencesSet.add(s);
    }
    for (const id of quarantineScan.missingEventIds) {
      missingEventIdsSet.add(id);
    }

    // 5. Check durable commit metadata
    let commitMeta: DurableCommitMetadata | null = null;
    let commitMetaFound = false;
    if (fs.existsSync(COMMIT_METADATA_PATH)) {
      try {
        const rawMeta = fs.readFileSync(COMMIT_METADATA_PATH, 'utf-8');
        commitMeta = JSON.parse(rawMeta);
        commitMetaFound = true;
      } catch {}
    }

    if (commitMeta) {
      if (typeof commitMeta.lastServerSequence === 'number' && commitMeta.lastServerSequence > maxCandidateSequence) {
        for (let s = maxCandidateSequence + 1; s <= commitMeta.lastServerSequence; s++) {
          missingSequencesSet.add(s);
        }
      }
      if (commitMeta.lastEventId && !candidateEventIds.has(commitMeta.lastEventId)) {
        missingEventIdsSet.add(commitMeta.lastEventId);
      }
      if (commitMeta.highestAggregateVersions) {
        for (const [key, expectedVer] of Object.entries(commitMeta.highestAggregateVersions)) {
          const currentAgg = this.state.aggregates[key];
          const currentVer = currentAgg ? currentAgg.version : 0;
          if (currentVer < expectedVer) {
            aggregateDiscrepancies.push(`Aggregate ${key} has version ${currentVer}, but committed metadata recorded version ${expectedVer}.`);
          }
        }
      }
      if (commitMeta.deviceCursors) {
        for (const [dc, cursorSeq] of Object.entries(commitMeta.deviceCursors)) {
          if (typeof cursorSeq === 'number' && cursorSeq > maxCandidateSequence) {
            for (let s = maxCandidateSequence + 1; s <= cursorSeq; s++) {
              missingSequencesSet.add(s);
            }
          }
        }
      }
    }

    const missingSequences = Array.from(missingSequencesSet).sort((a, b) => a - b);
    const missingEventIds = Array.from(missingEventIdsSet);

    // Determine status:
    // A. Missing acknowledged events detected or sequence gaps
    if (missingSequences.length > 0 || missingEventIds.length > 0 || aggregateDiscrepancies.length > 0) {
      const isInternalGap = candidateSequences.length > 0 && missingSequences.some((s) => s < maxCandidateSequence);
      const status: RecoveryCompletenessResult['status'] = isInternalGap
        ? 'SEQUENCE_GAP_DETECTED'
        : 'MISSING_ACKNOWLEDGED_EVENTS';

      const reasons: string[] = [];
      if (missingSequences.length > 0) {
        reasons.push(`Missing acknowledged sequence numbers: [${missingSequences.join(', ')}].`);
      }
      if (missingEventIds.length > 0) {
        reasons.push(`Missing acknowledged event IDs: [${missingEventIds.join(', ')}].`);
      }
      if (aggregateDiscrepancies.length > 0) {
        reasons.push(...aggregateDiscrepancies);
      }
      if (unverifiedReasons.length > 0) {
        reasons.push(...unverifiedReasons);
      }

      return {
        verified: false,
        status,
        maxCandidateSequence,
        highestKnownSequence: Math.max(maxCandidateSequence, ...(missingSequences.length > 0 ? missingSequences : [maxCandidateSequence])),
        missingSequences,
        missingEventIds,
        unverifiedReasons: reasons,
        details: {
          candidateEventCount: candidateEvents.length,
          quarantinedArtifactsScanned: quarantineScan.scannedCount,
          quarantinedMaxSequence: quarantineScan.discoveredSequences.length > 0 ? Math.max(...quarantineScan.discoveredSequences) : undefined,
          cursorMaxSequence: Object.values(this.state.deviceCursors || {}).length > 0 ? Math.max(...Object.values(this.state.deviceCursors || {})) : undefined,
          aggregateDiscrepancies: aggregateDiscrepancies.length > 0 ? aggregateDiscrepancies : undefined,
        },
      };
    }

    // B. Completeness cannot be proven because authoritative commit metadata is absent AND forensic artifacts offer no sequence proof
    const isEstablished = fs.existsSync(ESTABLISHED_MARKER_PATH);
    const hasForensicEvidence = quarantineScan.discoveredSequences.length > 0 || commitMetaFound;
    if (this.operationalState === 'RECOVERY_REQUIRED' && isEstablished && !hasForensicEvidence && maxCandidateSequence > 0) {
      return {
        verified: false,
        status: 'UNVERIFIED_INCOMPLETE_EVIDENCE',
        maxCandidateSequence,
        highestKnownSequence: maxCandidateSequence,
        missingSequences: [],
        missingEventIds: [],
        unverifiedReasons: [
          'Authoritative commit metadata is missing, and preserved forensic quarantine artifacts contain no verifiable sequence records to prove backup completeness.'
        ],
        details: {
          candidateEventCount: candidateEvents.length,
          quarantinedArtifactsScanned: quarantineScan.scannedCount,
          quarantinedMaxSequence: undefined,
        },
      };
    }

    // C. Verified Complete: All known sequences match, continuous 1..N, aggregates aligned
    return {
      verified: true,
      status: 'VERIFIED_COMPLETE',
      maxCandidateSequence,
      highestKnownSequence: maxCandidateSequence,
      missingSequences: [],
      missingEventIds: [],
      unverifiedReasons: [],
      details: {
        candidateEventCount: candidateEvents.length,
        quarantinedArtifactsScanned: quarantineScan.scannedCount,
        quarantinedMaxSequence: quarantineScan.discoveredSequences.length > 0 ? Math.max(...quarantineScan.discoveredSequences) : undefined,
      },
    };
  }

  /**
   * Authorized recovery and reconciliation gate
   */
  public reconcileAndResume(
    principal: { userId?: string; roles?: string[]; provider?: string; accountStatus?: string } | any,
    optionsOrNotes?: string | ReconcileOptions
  ): {
    success: boolean;
    operationalState: LedgerOperationalState;
    message: string;
    completeness?: RecoveryCompletenessResult;
    dataLossAcknowledged?: boolean;
    auditRecord?: DataLossAuditRecord;
  } {
    if (!isAuthorizedForLedgerRecovery(principal)) {
      throw new Error('UNAUTHORIZED: Global system administrator authority required for ledger reconciliation and recovery.');
    }

    const userId = typeof principal === 'object' && principal?.userId ? principal.userId : 'unknown';

    if (this.operationalState === 'NORMAL') {
      return {
        success: true,
        operationalState: 'NORMAL',
        message: 'Ledger is already in NORMAL operational state.',
        completeness: this.verifyRecoveryCompleteness(),
      };
    }

    if (this.operationalState === 'RECOVERY_BLOCKED') {
      throw new Error('RECOVERY_BLOCKED: Cannot auto-reconcile unrecoverable ledger without administrative force reset or external snapshot restoration.');
    }

    if (this.operationalState === 'RECOVERY_REQUIRED') {
      const completeness = this.verifyRecoveryCompleteness();
      const options = typeof optionsOrNotes === 'object' && optionsOrNotes !== null
        ? optionsOrNotes
        : { notes: typeof optionsOrNotes === 'string' ? optionsOrNotes : undefined };

      const isExplicitOverride =
        options.allowDataLoss === true &&
        (options.acknowledgeGapsConfirmation === 'CONFIRM_DATA_LOSS_ACKNOWLEDGED' ||
         options.acknowledgeGapsConfirmation === 'CONFIRM_UNVERIFIED_RECOVERY');

      if (!completeness.verified) {
        if (!isExplicitOverride) {
          const details = completeness.missingSequences.length > 0
            ? `Missing acknowledged sequences: [${completeness.missingSequences.join(', ')}]. Missing event IDs: [${completeness.missingEventIds.join(', ')}].`
            : completeness.unverifiedReasons.join('; ');
          throw new Error(
            `CANNOT_PROMOTE_RECOVERY: Historical completeness cannot be verified (${completeness.status}). ${details} Promotion to NORMAL refused to prevent silent clinical data loss.`
          );
        }

        // Caller provided explicit data-loss acknowledgement parameters.
        // Stage 3.2.4: Data-Loss Acknowledgement Must Not Mean Complete Recovery!
        // - An incomplete or unverified candidate cannot transition to NORMAL.
        // - Accepting the documentation of a gap does not clear the recovery safety gate.
        // - Ledger remains restricted in RECOVERY_REQUIRED.
        // - Durably persist audit record. If persistence fails, remain restricted.

        const auditRecord: DataLossAuditRecord = {
          operatorId: userId,
          operatorRoles: Array.isArray(principal.roles) ? principal.roles : [],
          authorizedCapability: 'ledger:recovery_reconcile',
          decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
          reason: options.notes || 'Administrative gap acknowledgement without recovery promotion',
          timestamp: new Date().toISOString(),
          affectedScope: 'global_server_ledger',
          missingEventIds: completeness.missingEventIds,
          missingSequences: completeness.missingSequences,
          completenessStatus: completeness.status,
          recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
        };

        // Persist recovery audit to disk. Throws if failed, leaving ledger restricted.
        this.writeRecoveryAudit(auditRecord);

        this.operationalState = 'RECOVERY_REQUIRED';
        this.recoveryInfo = {
          state: 'RECOVERY_REQUIRED',
          reason: `Data loss acknowledged by system administrator ${userId}: ${options.notes || 'Manual administrative acknowledgement'}. Ledger remains restricted; ordinary writes remain blocked because historical completeness is unverified (${completeness.status}).`,
          timestamp: new Date().toISOString(),
          primaryCorrupted: this.recoveryInfo?.primaryCorrupted ?? true,
          backupRestored: this.recoveryInfo?.backupRestored ?? true,
          quarantinedFiles: this.recoveryInfo?.quarantinedFiles || [],
          reconciliationRequired: true,
          authorizedBy: userId,
          reconciledAt: new Date().toISOString(),
          completeness,
          dataLossAcknowledged: true,
          acknowledgedGaps: completeness.missingSequences,
          missingEventIds: completeness.missingEventIds,
          unverifiedStatus: completeness.status,
          auditRecord,
        };

        return {
          success: false,
          operationalState: 'RECOVERY_REQUIRED',
          message: `Data loss acknowledged by ${userId}, but ledger remains restricted in RECOVERY_REQUIRED state. Incomplete historical evidence cannot transition to NORMAL. Ordinary writes remain blocked.`,
          completeness,
          dataLossAcknowledged: true,
          auditRecord,
        };
      }

      // completeness.verified is TRUE (status: 'VERIFIED_COMPLETE')
      // Safe, verified recovery!
      this.durablePersistToDisk(this.state, true);
      try { fs.copyFileSync(LEDGER_FILE_PATH, BACKUP_FILE_PATH); } catch {}

      this.operationalState = 'NORMAL';
      this.recoveryInfo = {
        state: 'NORMAL',
        reason: null,
        timestamp: new Date().toISOString(),
        primaryCorrupted: false,
        backupRestored: true,
        quarantinedFiles: this.recoveryInfo?.quarantinedFiles || [],
        reconciliationRequired: false,
        authorizedBy: userId,
        reconciledAt: new Date().toISOString(),
        completeness,
        dataLossAcknowledged: false,
      };

      return {
        success: true,
        operationalState: 'NORMAL',
        message: `Ledger successfully reconciled by ${userId} with completeness verified (${completeness.status}) and returned to NORMAL operation. Notes: ${options.notes || 'none'}`,
        completeness,
        dataLossAcknowledged: false,
      };
    }

    return {
      success: false,
      operationalState: this.operationalState,
      message: 'Unknown state transition.',
    };
  }

  public getStats(tenantId?: string): {
    processedEventsCount: number;
    aggregatesCount: number;
    eventsLogCount: number;
    conflictsCount: number;
  } {
    if (tenantId) {
      const tenantEvents = this.state.events.filter(
        (e) => (e.tenantId || this.getFacilityTenant(e.facilityId)) === tenantId
      );
      const tenantAggs = Object.values(this.state.aggregates).filter(
        (a) => (a.tenantId || this.getFacilityTenant(a.facilityId)) === tenantId
      );
      const tenantConflicts = this.state.conflicts.filter(
        (c) => (c.tenantId || this.getFacilityTenant(c.facilityId)) === tenantId
      );
      return {
        processedEventsCount: tenantEvents.length,
        aggregatesCount: tenantAggs.length,
        eventsLogCount: tenantEvents.length,
        conflictsCount: tenantConflicts.length,
      };
    }

    return {
      processedEventsCount: this.state.processedEventIds.length,
      aggregatesCount: Object.keys(this.state.aggregates).length,
      eventsLogCount: this.state.events.length,
      conflictsCount: this.state.conflicts.length,
    };
  }
}

export const serverLedger = ServerLedger.getInstance();
