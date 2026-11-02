/**
 * Jano Health - Authoritative Firestore Directory Provisioning Service
 * 
 * Production-ready administrative provisioning engine:
 * 1. Provision a tenant.
 * 2. Provision a facility under an existing tenant.
 * 3. Provision a user account.
 * 4. Create an active tenant membership.
 * 5. Create an active facility membership.
 * 6. Update membership roles and capabilities.
 * 7. Suspend or revoke a user account.
 * 8. Suspend or revoke a tenant membership.
 * 9. Suspend or revoke a facility membership.
 * 10. Inspect existing directory records and provisioning status.
 * 11. Secure first-administrator bootstrap with environment & replay guards.
 * 
 * Security Invariants:
 * - Read-before-write inside atomic Firestore transactions.
 * - Monotonic version increments (membershipVersion, revocationVersion).
 * - Comprehensive immutable audit trail (directory_audit_logs/{logId}) committed in same transaction.
 * - Strict tenant and facility boundary enforcement (anti-cross-tenant).
 * - Zero self-provisioning or self-elevation.
 * - Fails closed in production mode (no synthetic development principals).
 */

import { getFirebaseAdminApp, isProductionMode } from './authMiddleware';
import {
  AuthorizationDirectory,
  getAuthorizationDirectory,
  DirectoryTenant,
  DirectoryFacility,
  DirectoryUserAccount,
  DirectoryTenantMembership,
  DirectoryFacilityMembership,
} from './authorizationDirectory';

// -----------------------------------------------------------------------------
// Canonical Roles & Capabilities Whitelists
// -----------------------------------------------------------------------------

export const VALID_PROVISIONING_ROLES = [
  'system_administrator',
  'tenant_administrator',
  'facility_administrator',
  'clinical_supervisor',
  'supervisor',
  'physician',
  'clinician',
  'nurse',
  'pharmacist',
  'laboratory_staff',
  'radiology_staff',
  'receptionist',
  'health_officer',
  'system_interoperability_admin',
  'network_administrator',
  'terminology_administrator',
  'facility_interoperability_admin',
  'facility_intelligence_user',
  'network_intelligence_user',
  'public_health_intelligence_user',
  'system_intelligence_admin',
  'national_interoperability_officer',
  'ecosystem_data_steward',
  'system_intelligence_governor',
] as const;

export type ValidProvisioningRole = typeof VALID_PROVISIONING_ROLES[number];

export const VALID_PROVISIONING_CAPABILITIES = [
  'sync:facility',
  'sync:cross_facility',
  'sync:delegation',
  'sync:manage',
  'directory:provision',
  'directory:read',
] as const;

export type ValidProvisioningCapability = typeof VALID_PROVISIONING_CAPABILITIES[number];

/**
 * Capabilities reserved exclusively for global system administrators.
 * Scoped tenant or facility administrators cannot grant or assign these.
 */
export const GLOBALLY_PRIVILEGED_CAPABILITIES = [
  'directory:provision',
  'sync:manage',
] as const;

export type GloballyPrivilegedCapability = typeof GLOBALLY_PRIVILEGED_CAPABILITIES[number];

/**
 * Authoritatively determines whether an administrative operator holds valid,
 * active global system administration authority.
 */
export function isAuthorizedGlobalAdmin(operator: AdministrativeOperator): boolean {
  if (!operator || typeof operator !== 'object') return false;
  if (operator.accountStatus && operator.accountStatus !== 'active') return false;
  if (isProductionMode() && operator.provider === 'local_development') return false;
  const roles = Array.isArray(operator.roles) ? operator.roles : [];
  return roles.includes('system_administrator');
}

// -----------------------------------------------------------------------------
// Operator & Input Interfaces
// -----------------------------------------------------------------------------

export interface AdministrativeOperator {
  userId: string;
  provider?: 'local_development' | 'firebase_auth';
  roles: string[];
  tenantId?: string;
  facilityIds?: string[];
  accountStatus?: 'active' | 'suspended' | 'revoked';
  capabilities?: string[];
  isBootstrapOperator?: boolean;
}

export type DirectoryProvisioningOperation =
  | 'PROVISION_TENANT'
  | 'PROVISION_FACILITY'
  | 'PROVISION_USER'
  | 'CREATE_TENANT_MEMBERSHIP'
  | 'CREATE_FACILITY_MEMBERSHIP'
  | 'UPDATE_MEMBERSHIP'
  | 'SET_USER_STATUS'
  | 'SET_TENANT_MEMBERSHIP_STATUS'
  | 'SET_FACILITY_MEMBERSHIP_STATUS'
  | 'BOOTSTRAP_FIRST_ADMIN';

export interface DirectoryAuditRecord {
  logId: string;
  actorUid: string;
  actorIdentityVerified?: boolean;
  executionPrincipal?: string | null;
  executionPrincipalVerified?: boolean;
  executionCredentialSource?: string;
  actorTenantId?: string;
  actorRoles: string[];
  operation: DirectoryProvisioningOperation;
  targetType: 'tenant' | 'facility' | 'user' | 'tenant_membership' | 'facility_membership' | 'bootstrap';
  targetId: string;
  targetTenantId?: string;
  targetFacilityId?: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  reason: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED';
  details?: Record<string, unknown>;
}

export interface ProvisioningResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  auditLogId?: string;
}

export interface ProvisionTenantInput {
  tenantId: string;
  policyMetadata?: Record<string, unknown>;
  reason?: string;
}

export interface ProvisionFacilityInput {
  facilityId: string;
  tenantId: string;
  facilityMetadata?: Record<string, unknown>;
  reason?: string;
}

export interface ProvisionUserInput {
  uid: string;
  metadata?: Record<string, unknown>;
  reason?: string;
}

export interface CreateTenantMembershipInput {
  uid: string;
  tenantId: string;
  roles: string[];
  capabilities: string[];
  reason?: string;
}

export interface CreateFacilityMembershipInput {
  uid: string;
  tenantId: string;
  facilityId: string;
  capabilities: string[];
  reason?: string;
}

export interface UpdateMembershipInput {
  type: 'tenant' | 'facility';
  uid: string;
  tenantId: string;
  facilityId?: string;
  roles?: string[];
  capabilities?: string[];
  reason?: string;
}

export interface SetUserAccountStatusInput {
  uid: string;
  newStatus: 'active' | 'suspended' | 'revoked';
  reason: string;
}

export interface SetTenantMembershipStatusInput {
  uid: string;
  tenantId: string;
  newStatus: 'active' | 'suspended' | 'revoked';
  reason: string;
}

export interface SetFacilityMembershipStatusInput {
  uid: string;
  tenantId: string;
  facilityId: string;
  newStatus: 'active' | 'suspended' | 'revoked';
  reason: string;
}

export interface InspectDirectoryQuery {
  tenantId?: string;
  facilityId?: string;
  uid?: string;
  includeAuditLogs?: boolean;
  auditLogLimit?: number;
}

export interface DirectoryInspectionResult {
  tenant?: DirectoryTenant | null;
  tenants?: DirectoryTenant[];
  facility?: DirectoryFacility | null;
  facilities?: DirectoryFacility[];
  user?: DirectoryUserAccount | null;
  tenantMemberships?: DirectoryTenantMembership[];
  facilityMemberships?: DirectoryFacilityMembership[];
  auditLogs?: DirectoryAuditRecord[];
  summary?: {
    totalTenants: number;
    totalFacilities: number;
    totalUsers: number;
  };
}

export interface BootstrapFirstAdminParams {
  expectedProjectId: string;
  tenantId: string;
  adminUid: string;
  adminEmail?: string;
  reason?: string;
  initiatingOperator?: {
    operatorId?: string;
    executionPrincipal?: string | null;
    executionPrincipalVerified?: boolean;
    executionCredentialSource?: string;
    method?: string;
  };
}

export function resolveAuthoritativeProjectId(app?: any | null): string | undefined {
  if (app && app.options && typeof app.options.projectId === 'string' && app.options.projectId.trim()) {
    return app.options.projectId.trim();
  }
  return undefined;
}

export interface BootstrapResult {
  bootstrappedAt: string;
  projectId: string;
  tenant: DirectoryTenant;
  adminUser: DirectoryUserAccount;
  adminTenantMembership: DirectoryTenantMembership;
  auditLogId: string;
}

// -----------------------------------------------------------------------------
// Helper ID Format Validator
// -----------------------------------------------------------------------------
const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/;

function isValidIdentifier(id: string): boolean {
  return typeof id === 'string' && ID_PATTERN.test(id.trim());
}

// -----------------------------------------------------------------------------
// Directory Provisioning Service
// -----------------------------------------------------------------------------

export class DirectoryProvisioningService {
  private db: any | null = null;
  private authDirectory: AuthorizationDirectory;
  private simulatedAuditFailure = false;
  private firebaseAuthValidator: ((uid: string) => Promise<{ exists: boolean; disabled: boolean; email?: string }>) | null = null;
  private authoritativeProjectIdResolver: (() => string | undefined) | null = null;

  constructor(options?: { firestoreInstance?: any; authDirectory?: AuthorizationDirectory }) {
    if (options?.firestoreInstance) {
      this.db = options.firestoreInstance;
    }
    this.authDirectory = options?.authDirectory || getAuthorizationDirectory();
  }

  public setFirestoreInstance(db: any): void {
    this.db = db;
    this.authDirectory.setFirestoreInstance(db);
  }

  public setSimulatedAuditFailureForTesting(enabled: boolean): void {
    this.simulatedAuditFailure = enabled;
  }

  public setFirebaseAuthValidatorForTesting(
    validator: ((uid: string) => Promise<{ exists: boolean; disabled: boolean; email?: string }>) | null
  ): void {
    this.firebaseAuthValidator = validator;
  }

  public setAuthoritativeProjectIdResolverForTesting(
    resolver: (() => string | undefined) | null
  ): void {
    this.authoritativeProjectIdResolver = resolver;
  }

  private async getDb(): Promise<any> {
    if (this.db) {
      return this.db;
    }
    const app = getFirebaseAdminApp();
    if (!app) {
      throw new Error('FIREBASE_ADMIN_UNAVAILABLE: Firebase Admin App not initialized for Directory Provisioning Service.');
    }
    const { getFirestore } = await import('firebase-admin/firestore');
    this.db = getFirestore(app);
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Operator Validation & Boundary Enforcement
  // ---------------------------------------------------------------------------

  private verifyOperator(
    operator: AdministrativeOperator,
    requiredScope: 'global' | 'tenant' | 'facility',
    targetTenantId?: string,
    targetFacilityId?: string,
    targetUid?: string
  ): { valid: boolean; error?: string; message?: string } {
    if (!operator || typeof operator !== 'object') {
      return { valid: false, error: 'UNAUTHORIZED_OPERATOR', message: 'Missing operator credentials.' };
    }

    if (!operator.userId || !operator.userId.trim()) {
      return { valid: false, error: 'UNAUTHORIZED_OPERATOR', message: 'Operator userId is required.' };
    }

    // Bootstrap operator has explicit single-purpose authority
    if (operator.isBootstrapOperator) {
      return { valid: true };
    }

    // Production mode security: strictly reject development principal fixtures
    if (isProductionMode() && operator.provider === 'local_development') {
      return {
        valid: false,
        error: 'DEVELOPMENT_PRINCIPALS_FORBIDDEN_IN_PRODUCTION',
        message: 'Development credentials cannot perform directory provisioning in production mode.',
      };
    }

    // Reject inactive accounts
    if (operator.accountStatus && operator.accountStatus !== 'active') {
      return {
        valid: false,
        error: `OPERATOR_ACCOUNT_${operator.accountStatus.toUpperCase()}`,
        message: `Operator account '${operator.userId}' is ${operator.accountStatus}. Provisioning denied.`,
      };
    }

    // Anti-self-provisioning / Anti-self-elevation check:
    // Operators cannot grant themselves new memberships or change their own account status
    if (targetUid && operator.userId === targetUid) {
      return {
        valid: false,
        error: 'SELF_PROVISIONING_FORBIDDEN',
        message: 'Administrative operators are strictly prohibited from provisioning or modifying their own access.',
      };
    }

    const roles = Array.isArray(operator.roles) ? operator.roles : [];
    const caps = Array.isArray(operator.capabilities) ? operator.capabilities : [];

    const isGlobalAdmin = roles.includes('system_administrator');

    if (requiredScope === 'global') {
      if (!isGlobalAdmin && !caps.includes('directory:provision')) {
        return {
          valid: false,
          error: 'GLOBAL_ADMIN_REQUIRED',
          message: 'Operation requires global system administrator privileges.',
        };
      }
      return { valid: true };
    }

    if (requiredScope === 'tenant') {
      if (isGlobalAdmin && !roles.includes('tenant_administrator')) {
        return { valid: true };
      }
      const isTenantAdmin =
        roles.includes('tenant_administrator') ||
        roles.includes('facility_administrator') ||
        caps.includes('directory:provision');

      if (!isTenantAdmin) {
        return {
          valid: false,
          error: 'TENANT_ADMIN_REQUIRED',
          message: 'Operation requires tenant administrator authority.',
        };
      }
      if (targetTenantId && operator.tenantId && operator.tenantId !== targetTenantId) {
        return {
          valid: false,
          error: 'CROSS_TENANT_PROVISIONING_FORBIDDEN',
          message: `Operator belongs to tenant '${operator.tenantId}' and cannot manage tenant '${targetTenantId}'.`,
        };
      }
      return { valid: true };
    }

    if (requiredScope === 'facility') {
      if (isGlobalAdmin && !roles.includes('tenant_administrator') && !roles.includes('facility_administrator')) {
        return { valid: true };
      }
      if (targetTenantId && operator.tenantId && operator.tenantId !== targetTenantId) {
        return {
          valid: false,
          error: 'CROSS_TENANT_PROVISIONING_FORBIDDEN',
          message: `Operator belongs to tenant '${operator.tenantId}' and cannot manage facility in tenant '${targetTenantId}'.`,
        };
      }
      const isFacilityAdmin =
        roles.includes('facility_administrator') &&
        targetFacilityId &&
        Array.isArray(operator.facilityIds) &&
        operator.facilityIds.includes(targetFacilityId);

      const isTenantAdmin = roles.includes('tenant_administrator');

      if (!isTenantAdmin && !isFacilityAdmin) {
        return {
          valid: false,
          error: 'FACILITY_ADMIN_REQUIRED',
          message: `Operator is not authorized to manage facility '${targetFacilityId}'.`,
        };
      }
      return { valid: true };
    }

    return { valid: false, error: 'UNAUTHORIZED_OPERATOR', message: 'Insufficient administrative privileges.' };
  }

  // ---------------------------------------------------------------------------
  // 1. Provision a Tenant
  // ---------------------------------------------------------------------------
  public async provisionTenant(
    operator: AdministrativeOperator,
    input: ProvisionTenantInput
  ): Promise<ProvisioningResult<DirectoryTenant>> {
    const opCheck = this.verifyOperator(operator, 'global');
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    const tenantId = input.tenantId ? input.tenantId.trim() : '';
    if (!isValidIdentifier(tenantId)) {
      return {
        success: false,
        error: 'INVALID_TENANT_ID',
        message: `Tenant ID '${tenantId}' is invalid. Must be 3-64 alphanumeric, dash, or underscore characters.`,
      };
    }

    try {
      const db = await this.getDb();
      const tenantRef = db.collection('directory_tenants').doc(tenantId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);

      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const existingSnap = await txn.get(tenantRef);

        let previousState: Record<string, unknown> | null = null;
        if (existingSnap.exists) {
          const existingData = existingSnap.data() as DirectoryTenant;
          previousState = existingData as any;
          if (existingData.status === 'active') {
            // Idempotent success if active
            return {
              tenant: existingData,
              isIdempotent: true,
              auditRecord: {
                logId: auditLogId,
                actorUid: operator.userId,
                actorTenantId: operator.tenantId,
                actorRoles: operator.roles,
                operation: 'PROVISION_TENANT',
                targetType: 'tenant',
                targetId: tenantId,
                targetTenantId: tenantId,
                previousState,
                newState: previousState,
                reason: input.reason || 'Idempotent tenant provision request',
                timestamp: now,
                status: 'SUCCESS',
                details: { idempotent: true },
              } as DirectoryAuditRecord,
            };
          } else {
            throw new Error(`DUPLICATE_TENANT_ID:Tenant '${tenantId}' already exists with status '${existingData.status}'.`);
          }
        }

        // --- PHASE 2: WRITES ---
        const newTenant: DirectoryTenant = {
          tenantId,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          policyMetadata: input.policyMetadata || {},
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'PROVISION_TENANT',
          targetType: 'tenant',
          targetId: tenantId,
          targetTenantId: tenantId,
          previousState: null,
          newState: newTenant as any,
          reason: input.reason || 'Authoritative tenant provisioning',
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed. Rolling back transaction.');
        }

        txn.set(tenantRef, newTenant);
        txn.set(auditRef, auditRecord);

        return { tenant: newTenant, isIdempotent: false, auditRecord };
      });

      return {
        success: true,
        data: result.tenant,
        auditLogId,
        message: result.isIdempotent ? 'Tenant already active (idempotent).' : 'Tenant provisioned successfully.',
      };
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.startsWith('DUPLICATE_TENANT_ID:')) {
        return { success: false, error: 'DUPLICATE_TENANT_ID', message: msg.replace('DUPLICATE_TENANT_ID:', '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Provision a Facility Under an Existing Tenant
  // ---------------------------------------------------------------------------
  public async provisionFacility(
    operator: AdministrativeOperator,
    input: ProvisionFacilityInput
  ): Promise<ProvisioningResult<DirectoryFacility>> {
    const tenantId = input.tenantId ? input.tenantId.trim() : '';
    const facilityId = input.facilityId ? input.facilityId.trim() : '';

    if (!isValidIdentifier(tenantId)) {
      return { success: false, error: 'INVALID_TENANT_ID', message: `Invalid tenantId: '${tenantId}'` };
    }
    if (!isValidIdentifier(facilityId)) {
      return { success: false, error: 'INVALID_FACILITY_ID', message: `Invalid facilityId: '${facilityId}'` };
    }

    const opCheck = this.verifyOperator(operator, 'tenant', tenantId);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    try {
      const db = await this.getDb();
      const tenantRef = db.collection('directory_tenants').doc(tenantId);
      const facilityRef = db.collection('directory_facilities').doc(facilityId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const tenantSnap = await txn.get(tenantRef);
        if (!tenantSnap.exists) {
          throw new Error(`TENANT_NOT_FOUND:Target tenant '${tenantId}' does not exist.`);
        }
        const tenantData = tenantSnap.data() as DirectoryTenant;
        if (tenantData.status !== 'active') {
          throw new Error(`TENANT_NOT_ACTIVE:Target tenant '${tenantId}' is ${tenantData.status}.`);
        }

        const facilitySnap = await txn.get(facilityRef);
        if (facilitySnap.exists) {
          const existingFac = facilitySnap.data() as DirectoryFacility;
          if (existingFac.tenantId !== tenantId) {
            throw new Error(`DUPLICATE_FACILITY_ID:Facility '${facilityId}' already exists under tenant '${existingFac.tenantId}'.`);
          }
          if (existingFac.status === 'active') {
            return { facility: existingFac, isIdempotent: true };
          }
          if (existingFac.status === 'decommissioned') {
            throw new Error(`FACILITY_DECOMMISSIONED:Facility '${facilityId}' is decommissioned. Cannot overwrite.`);
          }
        }

        // --- PHASE 2: WRITES ---
        const newFacility: DirectoryFacility = {
          facilityId,
          tenantId,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          facilityMetadata: input.facilityMetadata || {},
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'PROVISION_FACILITY',
          targetType: 'facility',
          targetId: facilityId,
          targetTenantId: tenantId,
          targetFacilityId: facilityId,
          previousState: null,
          newState: newFacility as any,
          reason: input.reason || 'Authoritative facility provisioning',
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(facilityRef, newFacility);
        txn.set(auditRef, auditRecord);

        return { facility: newFacility, isIdempotent: false };
      });

      return {
        success: true,
        data: result.facility,
        auditLogId,
        message: result.isIdempotent ? 'Facility already active (idempotent).' : 'Facility provisioned successfully.',
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['TENANT_NOT_FOUND', 'TENANT_NOT_ACTIVE', 'DUPLICATE_FACILITY_ID', 'FACILITY_DECOMMISSIONED'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Provision a User Account
  // ---------------------------------------------------------------------------
  public async provisionUser(
    operator: AdministrativeOperator,
    input: ProvisionUserInput
  ): Promise<ProvisioningResult<DirectoryUserAccount>> {
    const uid = input.uid ? input.uid.trim() : '';
    if (!uid) {
      return { success: false, error: 'INVALID_UID', message: 'User uid is required.' };
    }

    const opCheck = this.verifyOperator(operator, 'tenant', undefined, undefined, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    // Verify user exists in Firebase Authentication before creating directory user account
    if (this.firebaseAuthValidator) {
      const authUser = await this.firebaseAuthValidator(uid);
      if (!authUser || !authUser.exists) {
        return {
          success: false,
          error: 'FIREBASE_USER_NOT_FOUND',
          message: `User '${uid}' does not exist in Firebase Authentication. Create the Firebase Auth identity first.`,
        };
      }
      if (authUser.disabled) {
        return {
          success: false,
          error: 'FIREBASE_USER_DISABLED',
          message: `User '${uid}' is disabled in Firebase Authentication.`,
        };
      }
    } else {
      try {
        const app = getFirebaseAdminApp();
        if (app) {
          const { getAuth } = await import('firebase-admin/auth');
          const userRecord = await getAuth(app).getUser(uid);
          if (userRecord.disabled) {
            return {
              success: false,
              error: 'FIREBASE_USER_DISABLED',
              message: `User '${uid}' is disabled in Firebase Authentication.`,
            };
          }
        }
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          return {
            success: false,
            error: 'FIREBASE_USER_NOT_FOUND',
            message: `User '${uid}' does not exist in Firebase Authentication. Create the Firebase Auth identity first.`,
          };
        }
        if (isProductionMode()) {
          return {
            success: false,
            error: 'FIREBASE_AUTH_VERIFICATION_FAILED',
            message: `Failed to verify user '${uid}' in Firebase Authentication: ${err.message}`,
          };
        }
      }
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const userSnap = await txn.get(userRef);
        if (userSnap.exists) {
          const existingUser = userSnap.data() as DirectoryUserAccount;
          if (existingUser.accountStatus === 'active') {
            return { user: existingUser, isIdempotent: true };
          }
          throw new Error(`ACCOUNT_ALREADY_EXISTS:User '${uid}' exists with status '${existingUser.accountStatus}'. Use setUserAccountStatus to modify.`);
        }

        // --- PHASE 2: WRITES ---
        const newUser: DirectoryUserAccount = {
          uid,
          accountStatus: 'active',
          createdAt: now,
          updatedAt: now,
          revocationVersion: 1,
          metadata: input.metadata || {},
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'PROVISION_USER',
          targetType: 'user',
          targetId: uid,
          previousState: null,
          newState: newUser as any,
          reason: input.reason || 'Authoritative user provisioning',
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(userRef, newUser);
        txn.set(auditRef, auditRecord);

        return { user: newUser, isIdempotent: false };
      });

      return {
        success: true,
        data: result.user,
        auditLogId,
        message: result.isIdempotent ? 'User already active (idempotent).' : 'User account provisioned successfully.',
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['ACCOUNT_ALREADY_EXISTS'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Create an Active Tenant Membership
  // ---------------------------------------------------------------------------
  public async createTenantMembership(
    operator: AdministrativeOperator,
    input: CreateTenantMembershipInput
  ): Promise<ProvisioningResult<DirectoryTenantMembership>> {
    const uid = input.uid ? input.uid.trim() : '';
    const tenantId = input.tenantId ? input.tenantId.trim() : '';

    if (!uid || !tenantId) {
      return { success: false, error: 'INVALID_INPUT', message: 'uid and tenantId are required.' };
    }

    const opCheck = this.verifyOperator(operator, 'tenant', tenantId, undefined, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    // Role validation
    const roles = Array.isArray(input.roles) ? input.roles : [];
    if (roles.length === 0) {
      return { success: false, error: 'ROLES_REQUIRED', message: 'At least one role is required.' };
    }
    for (const r of roles) {
      if (!VALID_PROVISIONING_ROLES.includes(r as any)) {
        return { success: false, error: 'INVALID_ROLE', message: `Role '${r}' is not recognized in the clinical security model.` };
      }
    }

    // Role elevation guard: only authorized global admin can assign system_administrator
    const isGlobalAdmin = isAuthorizedGlobalAdmin(operator);
    if (roles.some((r) => ['system_administrator'].includes(r)) && !isGlobalAdmin) {
      return {
        success: false,
        error: 'PRIVILEGE_ELEVATION_FORBIDDEN',
        message: 'Only authorized global system administrators can grant global administrative role (system_administrator).',
      };
    }

    // Capability validation
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    for (const c of capabilities) {
      if (!VALID_PROVISIONING_CAPABILITIES.includes(c as any)) {
        return { success: false, error: 'INVALID_CAPABILITY', message: `Capability '${c}' is not recognized.` };
      }
    }

    // Capability elevation guard: only authorized global admin can assign globally privileged capabilities
    if (capabilities.some((c) => (GLOBALLY_PRIVILEGED_CAPABILITIES as readonly string[]).includes(c)) && !isGlobalAdmin) {
      return {
        success: false,
        error: 'CAPABILITY_ELEVATION_FORBIDDEN',
        message: `Only authorized global system administrators can grant globally privileged capabilities (${GLOBALLY_PRIVILEGED_CAPABILITIES.join(', ')}).`,
      };
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const tenantRef = db.collection('directory_tenants').doc(tenantId);
      const memRef = userRef.collection('tenant_memberships').doc(tenantId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const userSnap = await txn.get(userRef);
        if (!userSnap.exists) {
          throw new Error(`USER_NOT_FOUND:User '${uid}' does not exist.`);
        }
        const userData = userSnap.data() as DirectoryUserAccount;
        if (userData.accountStatus !== 'active') {
          throw new Error(`ACCOUNT_${userData.accountStatus.toUpperCase()}:User '${uid}' account is ${userData.accountStatus}.`);
        }

        const tenantSnap = await txn.get(tenantRef);
        if (!tenantSnap.exists) {
          throw new Error(`TENANT_NOT_FOUND:Tenant '${tenantId}' does not exist.`);
        }
        const tenantData = tenantSnap.data() as DirectoryTenant;
        if (tenantData.status !== 'active') {
          throw new Error(`TENANT_NOT_ACTIVE:Tenant '${tenantId}' is ${tenantData.status}.`);
        }

        const memSnap = await txn.get(memRef);
        if (memSnap.exists) {
          throw new Error(`DUPLICATE_MEMBERSHIP:Tenant membership already exists for '${uid}/${tenantId}'. Use updateMembership.`);
        }

        // --- PHASE 2: WRITES ---
        const newMembership: DirectoryTenantMembership = {
          tenantId,
          status: 'active',
          roles,
          capabilities,
          membershipVersion: 1,
          createdAt: now,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'CREATE_TENANT_MEMBERSHIP',
          targetType: 'tenant_membership',
          targetId: `${uid}/${tenantId}`,
          targetTenantId: tenantId,
          previousState: null,
          newState: newMembership as any,
          reason: input.reason || 'Authoritative tenant membership assignment',
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(memRef, newMembership);
        txn.set(auditRef, auditRecord);

        return newMembership;
      });

      return {
        success: true,
        data: result,
        auditLogId,
        message: 'Tenant membership created successfully.',
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['USER_NOT_FOUND', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REVOKED', 'TENANT_NOT_FOUND', 'TENANT_NOT_ACTIVE', 'DUPLICATE_MEMBERSHIP'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Create an Active Facility Membership
  // ---------------------------------------------------------------------------
  public async createFacilityMembership(
    operator: AdministrativeOperator,
    input: CreateFacilityMembershipInput
  ): Promise<ProvisioningResult<DirectoryFacilityMembership>> {
    const uid = input.uid ? input.uid.trim() : '';
    const tenantId = input.tenantId ? input.tenantId.trim() : '';
    const facilityId = input.facilityId ? input.facilityId.trim() : '';

    if (!uid || !tenantId || !facilityId) {
      return { success: false, error: 'INVALID_INPUT', message: 'uid, tenantId, and facilityId are required.' };
    }

    const opCheck = this.verifyOperator(operator, 'facility', tenantId, facilityId, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    const isGlobalAdmin = isAuthorizedGlobalAdmin(operator);
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : ['sync:facility'];
    for (const c of capabilities) {
      if (!VALID_PROVISIONING_CAPABILITIES.includes(c as any)) {
        return { success: false, error: 'INVALID_CAPABILITY', message: `Capability '${c}' is not recognized.` };
      }
    }

    // Capability elevation guard: only authorized global admin can assign globally privileged capabilities
    if (capabilities.some((c) => (GLOBALLY_PRIVILEGED_CAPABILITIES as readonly string[]).includes(c)) && !isGlobalAdmin) {
      return {
        success: false,
        error: 'CAPABILITY_ELEVATION_FORBIDDEN',
        message: `Only authorized global system administrators can grant globally privileged capabilities (${GLOBALLY_PRIVILEGED_CAPABILITIES.join(', ')}).`,
      };
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const tenantRef = db.collection('directory_tenants').doc(tenantId);
      const facilityRef = db.collection('directory_facilities').doc(facilityId);
      const tenantMemRef = userRef.collection('tenant_memberships').doc(tenantId);
      const facMemRef = tenantMemRef.collection('facility_memberships').doc(facilityId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const userSnap = await txn.get(userRef);
        if (!userSnap.exists) {
          throw new Error(`USER_NOT_FOUND:User '${uid}' does not exist.`);
        }
        const userData = userSnap.data() as DirectoryUserAccount;
        if (userData.accountStatus !== 'active') {
          throw new Error(`ACCOUNT_${userData.accountStatus.toUpperCase()}:User '${uid}' account is ${userData.accountStatus}.`);
        }

        const tenantSnap = await txn.get(tenantRef);
        if (!tenantSnap.exists) {
          throw new Error(`TENANT_NOT_FOUND:Tenant '${tenantId}' does not exist.`);
        }

        const facilitySnap = await txn.get(facilityRef);
        if (!facilitySnap.exists) {
          throw new Error(`FACILITY_NOT_FOUND:Facility '${facilityId}' does not exist.`);
        }
        const facilityData = facilitySnap.data() as DirectoryFacility;
        if (facilityData.status === 'decommissioned') {
          throw new Error(`FACILITY_DECOMMISSIONED:Facility '${facilityId}' is decommissioned.`);
        }
        if (facilityData.status !== 'active') {
          throw new Error(`FACILITY_NOT_ACTIVE:Facility '${facilityId}' is ${facilityData.status}.`);
        }
        if (facilityData.tenantId !== tenantId) {
          throw new Error(`FACILITY_TENANT_MISMATCH:Facility '${facilityId}' belongs to tenant '${facilityData.tenantId}', but membership targets '${tenantId}'.`);
        }

        const tenantMemSnap = await txn.get(tenantMemRef);
        if (!tenantMemSnap.exists) {
          throw new Error(`TENANT_MEMBERSHIP_MISSING:User '${uid}' lacks tenant membership for '${tenantId}'.`);
        }
        const tenantMemData = tenantMemSnap.data() as DirectoryTenantMembership;
        if (tenantMemData.status !== 'active') {
          throw new Error(`TENANT_MEMBERSHIP_${tenantMemData.status.toUpperCase()}:User tenant membership is ${tenantMemData.status}.`);
        }

        const facMemSnap = await txn.get(facMemRef);
        if (facMemSnap.exists) {
          throw new Error(`DUPLICATE_MEMBERSHIP:Facility membership already exists for '${uid}/${facilityId}'. Use updateMembership.`);
        }

        // --- PHASE 2: WRITES ---
        const newFacMembership: DirectoryFacilityMembership = {
          facilityId,
          tenantId,
          status: 'active',
          capabilities,
          membershipVersion: 1,
          createdAt: now,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'CREATE_FACILITY_MEMBERSHIP',
          targetType: 'facility_membership',
          targetId: `${uid}/${tenantId}/${facilityId}`,
          targetTenantId: tenantId,
          targetFacilityId: facilityId,
          previousState: null,
          newState: newFacMembership as any,
          reason: input.reason || 'Authoritative facility membership assignment',
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(facMemRef, newFacMembership);
        txn.set(auditRef, auditRecord);

        return newFacMembership;
      });

      return {
        success: true,
        data: result,
        auditLogId,
        message: 'Facility membership created successfully.',
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['USER_NOT_FOUND', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REVOKED', 'TENANT_NOT_FOUND', 'FACILITY_NOT_FOUND', 'FACILITY_DECOMMISSIONED', 'FACILITY_NOT_ACTIVE', 'FACILITY_TENANT_MISMATCH', 'TENANT_MEMBERSHIP_MISSING', 'TENANT_MEMBERSHIP_SUSPENDED', 'TENANT_MEMBERSHIP_REVOKED', 'DUPLICATE_MEMBERSHIP'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Update Membership Roles & Capabilities
  // ---------------------------------------------------------------------------
  public async updateMembership(
    operator: AdministrativeOperator,
    input: UpdateMembershipInput
  ): Promise<ProvisioningResult<DirectoryTenantMembership | DirectoryFacilityMembership>> {
    const uid = input.uid ? input.uid.trim() : '';
    const tenantId = input.tenantId ? input.tenantId.trim() : '';
    const facilityId = input.facilityId ? input.facilityId.trim() : '';

    if (!uid || !tenantId) {
      return { success: false, error: 'INVALID_INPUT', message: 'uid and tenantId are required.' };
    }

    const scope = input.type === 'facility' ? 'facility' : 'tenant';
    const opCheck = this.verifyOperator(operator, scope, tenantId, facilityId, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    const isGlobalAdmin = isAuthorizedGlobalAdmin(operator);

    if (input.roles) {
      for (const r of input.roles) {
        if (!VALID_PROVISIONING_ROLES.includes(r as any)) {
          return { success: false, error: 'INVALID_ROLE', message: `Invalid role: '${r}'` };
        }
      }
      if (input.roles.some((r) => ['system_administrator'].includes(r)) && !isGlobalAdmin) {
        return {
          success: false,
          error: 'PRIVILEGE_ELEVATION_FORBIDDEN',
          message: 'Only authorized global system administrators can grant global administrative role (system_administrator).',
        };
      }
    }
    if (input.capabilities) {
      for (const c of input.capabilities) {
        if (!VALID_PROVISIONING_CAPABILITIES.includes(c as any)) {
          return { success: false, error: 'INVALID_CAPABILITY', message: `Invalid capability: '${c}'` };
        }
      }
      if (input.capabilities.some((c) => (GLOBALLY_PRIVILEGED_CAPABILITIES as readonly string[]).includes(c)) && !isGlobalAdmin) {
        return {
          success: false,
          error: 'CAPABILITY_ELEVATION_FORBIDDEN',
          message: `Only authorized global system administrators can grant globally privileged capabilities (${GLOBALLY_PRIVILEGED_CAPABILITIES.join(', ')}).`,
        };
      }
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const tenantMemRef = userRef.collection('tenant_memberships').doc(tenantId);
      const targetRef = input.type === 'facility'
        ? tenantMemRef.collection('facility_memberships').doc(facilityId)
        : tenantMemRef;

      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const snap = await txn.get(targetRef);
        if (!snap.exists) {
          throw new Error(`MEMBERSHIP_NOT_FOUND:Target ${input.type} membership does not exist.`);
        }
        const existing = snap.data();
        if (existing.status !== 'active') {
          throw new Error(`CANNOT_UPDATE_INACTIVE_MEMBERSHIP:Membership is ${existing.status}. Reactivate first.`);
        }

        const newVersion = (existing.membershipVersion || 1) + 1;
        const updatedRecord = {
          ...existing,
          roles: input.roles ? input.roles : existing.roles,
          capabilities: input.capabilities ? input.capabilities : existing.capabilities,
          membershipVersion: newVersion,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'UPDATE_MEMBERSHIP',
          targetType: input.type === 'facility' ? 'facility_membership' : 'tenant_membership',
          targetId: input.type === 'facility' ? `${uid}/${tenantId}/${facilityId}` : `${uid}/${tenantId}`,
          targetTenantId: tenantId,
          targetFacilityId: input.type === 'facility' ? facilityId : undefined,
          previousState: existing,
          newState: updatedRecord,
          reason: input.reason || `Update ${input.type} membership`,
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(targetRef, updatedRecord);
        txn.set(auditRef, auditRecord);

        return updatedRecord;
      });

      return {
        success: true,
        data: result,
        auditLogId,
        message: `${input.type} membership updated successfully.`,
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['MEMBERSHIP_NOT_FOUND', 'CANNOT_UPDATE_INACTIVE_MEMBERSHIP'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Suspend or Revoke a User Account
  // ---------------------------------------------------------------------------
  public async setUserAccountStatus(
    operator: AdministrativeOperator,
    input: SetUserAccountStatusInput
  ): Promise<ProvisioningResult<DirectoryUserAccount>> {
    const uid = input.uid ? input.uid.trim() : '';
    if (!uid) {
      return { success: false, error: 'INVALID_UID', message: 'User uid is required.' };
    }

    if (!['active', 'suspended', 'revoked'].includes(input.newStatus)) {
      return { success: false, error: 'INVALID_STATUS', message: `Invalid status '${input.newStatus}'.` };
    }

    if (!input.reason || !input.reason.trim()) {
      return { success: false, error: 'REASON_REQUIRED', message: 'A justification reason is required for status changes.' };
    }

    const opCheck = this.verifyOperator(operator, 'tenant', undefined, undefined, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const userSnap = await txn.get(userRef);
        if (!userSnap.exists) {
          throw new Error(`USER_NOT_FOUND:User '${uid}' does not exist.`);
        }
        const existing = userSnap.data() as DirectoryUserAccount;
        if (existing.accountStatus === input.newStatus) {
          return { user: existing, isIdempotent: true };
        }

        const newRevocationVersion = (existing.revocationVersion || 1) + 1;
        const updatedUser: DirectoryUserAccount = {
          ...existing,
          accountStatus: input.newStatus,
          revocationVersion: newRevocationVersion,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'SET_USER_STATUS',
          targetType: 'user',
          targetId: uid,
          previousState: existing as any,
          newState: updatedUser as any,
          reason: input.reason,
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(userRef, updatedUser);
        txn.set(auditRef, auditRecord);

        return { user: updatedUser, isIdempotent: false };
      });

      return {
        success: true,
        data: result.user,
        auditLogId,
        message: result.isIdempotent ? `User account is already ${input.newStatus}.` : `User account status set to ${input.newStatus}.`,
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['USER_NOT_FOUND'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Suspend or Revoke a Tenant Membership
  // ---------------------------------------------------------------------------
  public async setTenantMembershipStatus(
    operator: AdministrativeOperator,
    input: SetTenantMembershipStatusInput
  ): Promise<ProvisioningResult<DirectoryTenantMembership>> {
    const uid = input.uid ? input.uid.trim() : '';
    const tenantId = input.tenantId ? input.tenantId.trim() : '';

    if (!uid || !tenantId) {
      return { success: false, error: 'INVALID_INPUT', message: 'uid and tenantId are required.' };
    }
    if (!['active', 'suspended', 'revoked'].includes(input.newStatus)) {
      return { success: false, error: 'INVALID_STATUS', message: `Invalid status '${input.newStatus}'.` };
    }
    if (!input.reason || !input.reason.trim()) {
      return { success: false, error: 'REASON_REQUIRED', message: 'A justification reason is required for status changes.' };
    }

    const opCheck = this.verifyOperator(operator, 'tenant', tenantId, undefined, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const memRef = userRef.collection('tenant_memberships').doc(tenantId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const memSnap = await txn.get(memRef);
        if (!memSnap.exists) {
          throw new Error(`MEMBERSHIP_NOT_FOUND:Tenant membership does not exist for '${uid}/${tenantId}'.`);
        }
        const existing = memSnap.data() as DirectoryTenantMembership;
        if (existing.status === input.newStatus) {
          return { membership: existing, isIdempotent: true };
        }

        const newVersion = (existing.membershipVersion || 1) + 1;
        const updatedMem: DirectoryTenantMembership = {
          ...existing,
          status: input.newStatus,
          membershipVersion: newVersion,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'SET_TENANT_MEMBERSHIP_STATUS',
          targetType: 'tenant_membership',
          targetId: `${uid}/${tenantId}`,
          targetTenantId: tenantId,
          previousState: existing as any,
          newState: updatedMem as any,
          reason: input.reason,
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(memRef, updatedMem);
        txn.set(auditRef, auditRecord);

        return { membership: updatedMem, isIdempotent: false };
      });

      return {
        success: true,
        data: result.membership,
        auditLogId,
        message: result.isIdempotent ? `Tenant membership is already ${input.newStatus}.` : `Tenant membership status set to ${input.newStatus}.`,
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['MEMBERSHIP_NOT_FOUND'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Suspend or Revoke a Facility Membership
  // ---------------------------------------------------------------------------
  public async setFacilityMembershipStatus(
    operator: AdministrativeOperator,
    input: SetFacilityMembershipStatusInput
  ): Promise<ProvisioningResult<DirectoryFacilityMembership>> {
    const uid = input.uid ? input.uid.trim() : '';
    const tenantId = input.tenantId ? input.tenantId.trim() : '';
    const facilityId = input.facilityId ? input.facilityId.trim() : '';

    if (!uid || !tenantId || !facilityId) {
      return { success: false, error: 'INVALID_INPUT', message: 'uid, tenantId, and facilityId are required.' };
    }
    if (!['active', 'suspended', 'revoked'].includes(input.newStatus)) {
      return { success: false, error: 'INVALID_STATUS', message: `Invalid status '${input.newStatus}'.` };
    }
    if (!input.reason || !input.reason.trim()) {
      return { success: false, error: 'REASON_REQUIRED', message: 'A justification reason is required for status changes.' };
    }

    const opCheck = this.verifyOperator(operator, 'facility', tenantId, facilityId, uid);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    try {
      const db = await this.getDb();
      const userRef = db.collection('directory_users').doc(uid);
      const tenantMemRef = userRef.collection('tenant_memberships').doc(tenantId);
      const facMemRef = tenantMemRef.collection('facility_memberships').doc(facilityId);
      const auditLogId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS ---
        const memSnap = await txn.get(facMemRef);
        if (!memSnap.exists) {
          throw new Error(`MEMBERSHIP_NOT_FOUND:Facility membership does not exist for '${uid}/${facilityId}'.`);
        }
        const existing = memSnap.data() as DirectoryFacilityMembership;
        if (existing.status === input.newStatus) {
          return { membership: existing, isIdempotent: true };
        }

        const newVersion = (existing.membershipVersion || 1) + 1;
        const updatedMem: DirectoryFacilityMembership = {
          ...existing,
          status: input.newStatus,
          membershipVersion: newVersion,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operator.userId,
          actorTenantId: operator.tenantId,
          actorRoles: operator.roles,
          operation: 'SET_FACILITY_MEMBERSHIP_STATUS',
          targetType: 'facility_membership',
          targetId: `${uid}/${tenantId}/${facilityId}`,
          targetTenantId: tenantId,
          targetFacilityId: facilityId,
          previousState: existing as any,
          newState: updatedMem as any,
          reason: input.reason,
          timestamp: now,
          status: 'SUCCESS',
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed.');
        }

        txn.set(facMemRef, updatedMem);
        txn.set(auditRef, auditRecord);

        return { membership: updatedMem, isIdempotent: false };
      });

      return {
        success: true,
        data: result.membership,
        auditLogId,
        message: result.isIdempotent ? `Facility membership is already ${input.newStatus}.` : `Facility membership status set to ${input.newStatus}.`,
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['MEMBERSHIP_NOT_FOUND'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'TRANSACTION_FAILED', message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Inspect Directory Records & Provisioning Status
  // ---------------------------------------------------------------------------
  public async inspectDirectory(
    operator: AdministrativeOperator,
    query: InspectDirectoryQuery = {}
  ): Promise<ProvisioningResult<DirectoryInspectionResult>> {
    const isGlobal = isAuthorizedGlobalAdmin(operator);
    const isTenantAdmin = Array.isArray(operator.roles) && operator.roles.includes('tenant_administrator');
    const isFacilityAdmin = Array.isArray(operator.roles) && operator.roles.includes('facility_administrator');
    const permittedFacilityIds = Array.isArray(operator.facilityIds) ? operator.facilityIds : [];
    let effectiveTenantId = query.tenantId;

    if (!isGlobal) {
      if (!operator.tenantId) {
        return {
          success: false,
          error: 'UNAUTHORIZED_OPERATOR',
          message: 'Scoped administrative operator is missing tenantId association.',
        };
      }
      if (query.tenantId && query.tenantId !== operator.tenantId) {
        return {
          success: false,
          error: 'CROSS_TENANT_INSPECTION_FORBIDDEN',
          message: `Operator belongs to tenant '${operator.tenantId}' and cannot inspect tenant '${query.tenantId}'.`,
        };
      }
      effectiveTenantId = operator.tenantId;
    }

    // Facility administrator authorization checks
    if (!isGlobal && !isTenantAdmin && isFacilityAdmin) {
      if (query.facilityId && !permittedFacilityIds.includes(query.facilityId)) {
        return {
          success: false,
          error: 'CROSS_FACILITY_INSPECTION_FORBIDDEN',
          message: `Operator is not authorized to inspect facility '${query.facilityId}'. Authorized facilities: ${permittedFacilityIds.join(', ')}`,
        };
      }
    }

    const opCheck = this.verifyOperator(operator, 'tenant', effectiveTenantId);
    if (!opCheck.valid) {
      return { success: false, error: opCheck.error, message: opCheck.message };
    }

    try {
      const db = await this.getDb();
      const result: DirectoryInspectionResult = {};

      if (effectiveTenantId) {
        const tenantSnap = await db.collection('directory_tenants').doc(effectiveTenantId).get();
        result.tenant = tenantSnap.exists ? (tenantSnap.data() as DirectoryTenant) : null;
        result.tenants = result.tenant ? [result.tenant] : [];
      } else {
        const tenantsSnap = await db.collection('directory_tenants').get();
        const tenants: DirectoryTenant[] = [];
        tenantsSnap.forEach((doc: any) => tenants.push(doc.data() as DirectoryTenant));
        result.tenants = tenants;
      }

      if (query.facilityId) {
        if (!isGlobal && !isTenantAdmin && isFacilityAdmin && !permittedFacilityIds.includes(query.facilityId)) {
          return {
            success: false,
            error: 'CROSS_FACILITY_INSPECTION_FORBIDDEN',
            message: `Operator is not authorized to inspect facility '${query.facilityId}'.`,
          };
        }
        const facSnap = await db.collection('directory_facilities').doc(query.facilityId).get();
        if (facSnap.exists) {
          const facData = facSnap.data() as DirectoryFacility;
          if (effectiveTenantId && facData.tenantId !== effectiveTenantId) {
            result.facility = null;
            result.facilities = [];
          } else {
            result.facility = facData;
            result.facilities = [facData];
          }
        } else {
          result.facility = null;
          result.facilities = [];
        }
      } else if (!isGlobal && !isTenantAdmin && isFacilityAdmin) {
        // Scoped strictly to authorized facilities, directly querying permitted documents
        const facilities: DirectoryFacility[] = [];
        for (const fid of permittedFacilityIds) {
          const fSnap = await db.collection('directory_facilities').doc(fid).get();
          if (fSnap.exists) {
            const fData = fSnap.data() as DirectoryFacility;
            if (!effectiveTenantId || fData.tenantId === effectiveTenantId) {
              facilities.push(fData);
            }
          }
        }
        result.facilities = facilities;
      } else if (effectiveTenantId) {
        const facsSnap = await db.collection('directory_facilities').where('tenantId', '==', effectiveTenantId).get();
        const facilities: DirectoryFacility[] = [];
        facsSnap.forEach((doc: any) => facilities.push(doc.data() as DirectoryFacility));
        result.facilities = facilities;
      } else {
        const facsSnap = await db.collection('directory_facilities').get();
        const facilities: DirectoryFacility[] = [];
        facsSnap.forEach((doc: any) => facilities.push(doc.data() as DirectoryFacility));
        result.facilities = facilities;
      }

      if (query.uid) {
        const userSnap = await db.collection('directory_users').doc(query.uid).get();

        // FINDING-04: Facility administrator user account inspection isolation & anti-enumeration.
        // Facility admins may ONLY inspect users who have an active facility membership within their authorized facilities.
        // If the user does not exist, or has no active membership in permitted facilities, fail closed with
        // USER_NOT_FOUND_OR_UNAUTHORIZED so external or unauthorized user presence cannot be enumerated.
        if (!isGlobal && !isTenantAdmin && isFacilityAdmin) {
          if (!userSnap.exists) {
            return {
              success: false,
              error: 'USER_NOT_FOUND_OR_UNAUTHORIZED',
              message: 'User not found or unauthorized for facility inspection.',
            };
          }

          if (!effectiveTenantId) {
            return {
              success: false,
              error: 'UNAUTHORIZED_OPERATOR',
              message: 'Facility administrator must have an associated tenant ID.',
            };
          }

          const facMemsSnap = await db
            .collection('directory_users')
            .doc(query.uid)
            .collection('tenant_memberships')
            .doc(effectiveTenantId)
            .collection('facility_memberships')
            .get();

          const facMems: DirectoryFacilityMembership[] = [];
          facMemsSnap.forEach((d: any) => facMems.push(d.data() as DirectoryFacilityMembership));

          const targetScopeFacilities = query.facilityId ? [query.facilityId] : permittedFacilityIds;
          const hasActiveMembershipInScope = facMems.some(
            (fm) => targetScopeFacilities.includes(fm.facilityId) && fm.status === 'active'
          );

          if (!hasActiveMembershipInScope) {
            return {
              success: false,
              error: 'USER_NOT_FOUND_OR_UNAUTHORIZED',
              message: 'User not found or unauthorized for facility inspection.',
            };
          }

          // Return data-minimized account and scoped facility memberships only
          const rawUser = userSnap.data() as DirectoryUserAccount;
          result.user = {
            uid: rawUser.uid,
            accountStatus: rawUser.accountStatus,
            createdAt: rawUser.createdAt,
            updatedAt: rawUser.updatedAt,
            revocationVersion: rawUser.revocationVersion,
          };
          result.facilityMemberships = facMems.filter((fm) => targetScopeFacilities.includes(fm.facilityId));
          result.tenantMemberships = []; // Never expose tenant-level memberships or roles to facility admin
        } else {
          result.user = userSnap.exists ? (userSnap.data() as DirectoryUserAccount) : null;

          if (effectiveTenantId) {
            const tenantMemSnap = await db
              .collection('directory_users')
              .doc(query.uid)
              .collection('tenant_memberships')
              .doc(effectiveTenantId)
              .get();
            result.tenantMemberships = tenantMemSnap.exists ? [tenantMemSnap.data() as DirectoryTenantMembership] : [];

            const facMemsSnap = await db
              .collection('directory_users')
              .doc(query.uid)
              .collection('tenant_memberships')
              .doc(effectiveTenantId)
              .collection('facility_memberships')
              .get();
            const facMems: DirectoryFacilityMembership[] = [];
            facMemsSnap.forEach((d: any) => facMems.push(d.data() as DirectoryFacilityMembership));
            result.facilityMemberships = facMems;
          } else {
            const tenantMemsSnap = await db
              .collection('directory_users')
              .doc(query.uid)
              .collection('tenant_memberships')
              .get();
            const tenantMems: DirectoryTenantMembership[] = [];
            tenantMemsSnap.forEach((d: any) => tenantMems.push(d.data() as DirectoryTenantMembership));
            result.tenantMemberships = tenantMems;
          }
        }
      }

      if (query.includeAuditLogs) {
        const limit = query.auditLogLimit || 50;
        let auditQuery = db.collection('directory_audit_logs');
        if (effectiveTenantId) {
          auditQuery = auditQuery.where('targetTenantId', '==', effectiveTenantId);
        }
        if (!isGlobal && !isTenantAdmin && isFacilityAdmin) {
          if (query.facilityId) {
            auditQuery = auditQuery.where('targetFacilityId', '==', query.facilityId);
          } else if (permittedFacilityIds.length === 1) {
            auditQuery = auditQuery.where('targetFacilityId', '==', permittedFacilityIds[0]);
          }
        }
        const logsSnap = await auditQuery.limit(limit).get();
        let logs: DirectoryAuditRecord[] = [];
        logsSnap.forEach((doc: any) => logs.push(doc.data() as DirectoryAuditRecord));
        if (!isGlobal && !isTenantAdmin && isFacilityAdmin) {
          logs = logs.filter((l) => l.targetFacilityId && permittedFacilityIds.includes(l.targetFacilityId));
        }
        result.auditLogs = logs;
      }

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      return { success: false, error: 'INSPECTION_FAILED', message: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // 11. Secure First-Administrator Bootstrap Procedure
  // ---------------------------------------------------------------------------
  public async bootstrapFirstAdministrator(
    params: BootstrapFirstAdminParams
  ): Promise<ProvisioningResult<BootstrapResult>> {
    const { expectedProjectId, tenantId, adminUid, adminEmail, reason } = params;

    if (!expectedProjectId || !expectedProjectId.trim()) {
      return {
        success: false,
        error: 'EXPECTED_PROJECT_ID_REQUIRED',
        message: 'Bootstrap requires an explicit expectedProjectId.',
      };
    }
    if (!tenantId || !tenantId.trim()) {
      return { success: false, error: 'TENANT_ID_REQUIRED', message: 'Bootstrap requires a valid tenantId.' };
    }
    if (!adminUid || !adminUid.trim()) {
      return { success: false, error: 'ADMIN_UID_REQUIRED', message: 'Bootstrap requires a valid adminUid.' };
    }

    // Authoritative target project verification guard
    let resolvedProjectId: string | undefined;
    if (this.authoritativeProjectIdResolver) {
      resolvedProjectId = this.authoritativeProjectIdResolver();
    } else {
      const app = getFirebaseAdminApp();
      resolvedProjectId = resolveAuthoritativeProjectId(app);
    }

    if (!resolvedProjectId || !resolvedProjectId.trim()) {
      return {
        success: false,
        error: 'PROJECT_IDENTITY_UNRESOLVED',
        message: 'Authoritative Firebase project identity cannot be resolved from Firebase Admin app.',
      };
    }

    if (resolvedProjectId.trim() !== expectedProjectId.trim()) {
      return {
        success: false,
        error: 'BOOTSTRAP_PROJECT_MISMATCH',
        message: `Bootstrap refused: provided expectedProjectId '${expectedProjectId}' does not match authoritative active project '${resolvedProjectId}'.`,
      };
    }

    try {
      const db = await this.getDb();
      if (db && typeof db.projectId === 'string' && db.projectId.trim()) {
        if (db.projectId.trim() !== expectedProjectId.trim()) {
          return {
            success: false,
            error: 'BOOTSTRAP_PROJECT_MISMATCH',
            message: `Bootstrap refused: Firestore resource project '${db.projectId}' does not match expected project '${expectedProjectId}'.`,
          };
        }
      }

      const bootstrapMarkerRef = db.collection('directory_system').doc('bootstrap_marker');
      const tenantRef = db.collection('directory_tenants').doc(tenantId.trim());
      const userRef = db.collection('directory_users').doc(adminUid.trim());
      const tenantMemRef = userRef.collection('tenant_memberships').doc(tenantId.trim());
      const auditLogId = `aud-bootstrap-${Date.now()}`;
      const auditRef = db.collection('directory_audit_logs').doc(auditLogId);
      const now = new Date().toISOString();

      const operatorId = params.initiatingOperator?.operatorId || 'bootstrap_operator_adc';
      const executionPrincipal = params.initiatingOperator?.executionPrincipal !== undefined
        ? params.initiatingOperator.executionPrincipal
        : 'gcp_application_default_credentials';
      const rawVerified = Boolean(params.initiatingOperator?.executionPrincipalVerified);
      const executionCredentialSource = params.initiatingOperator?.executionCredentialSource || 'application_default_credentials';
      // FINDING-02: Server-side execution principal verification enforcement.
      // Unvalidated file/env JSON metadata or unverified caller assertions MUST NOT be accepted as verified: true.
      // Verification requires trusted internal attestation (e.g. google_iam_token_attestation or server_internal_attestation).
      const executionPrincipalVerified = rawVerified && (
        executionCredentialSource === 'google_iam_token_attestation' ||
        executionCredentialSource === 'server_internal_attestation'
      );

      const result = await db.runTransaction(async (txn: any) => {
        // --- PHASE 1: READS & CONCURRENCY / REPLAY LOCKS ---
        const markerSnap = await txn.get(bootstrapMarkerRef);
        if (markerSnap.exists) {
          throw new Error('BOOTSTRAP_ALREADY_COMPLETED:Directory has already been bootstrapped.');
        }

        const tenantSnap = await txn.get(tenantRef);
        if (tenantSnap.exists) {
          throw new Error(`BOOTSTRAP_ALREADY_COMPLETED:Tenant '${tenantId}' already exists in directory.`);
        }

        const userSnap = await txn.get(userRef);
        if (userSnap.exists) {
          throw new Error(`BOOTSTRAP_ALREADY_COMPLETED:User '${adminUid}' already exists in directory.`);
        }

        // Check if ANY tenant exists (bootstrap is strictly for an uninitialized directory)
        const allTenantsSnap = await db.collection('directory_tenants').limit(1).get();
        let existingTenantCount = 0;
        allTenantsSnap.forEach(() => { existingTenantCount++; });
        if (existingTenantCount > 0) {
          throw new Error('BOOTSTRAP_ALREADY_COMPLETED:Directory already contains provisioned tenants. Bootstrap can only run on empty directory.');
        }

        // --- PHASE 2: WRITES ---
        const bootstrapMarker = {
          bootstrappedAt: now,
          rootTenantId: tenantId.trim(),
          initialAdminUid: adminUid.trim(),
          projectId: expectedProjectId.trim(),
          auditLogId,
          initiatingOperator: operatorId,
          executionPrincipal,
          executionPrincipalVerified,
          executionCredentialSource,
        };

        const newTenant: DirectoryTenant = {
          tenantId: tenantId.trim(),
          status: 'active',
          createdAt: now,
          updatedAt: now,
          policyMetadata: {
            bootstrapped: true,
            bootstrappedBy: operatorId,
            initialAdminUid: adminUid.trim(),
          },
        };

        const newAdminUser: DirectoryUserAccount = {
          uid: adminUid.trim(),
          accountStatus: 'active',
          createdAt: now,
          updatedAt: now,
          revocationVersion: 1,
          metadata: {
            email: adminEmail || '',
            bootstrapped: true,
          },
        };

        const newTenantMembership: DirectoryTenantMembership = {
          tenantId: tenantId.trim(),
          status: 'active',
          roles: ['system_administrator'],
          capabilities: [
            'sync:facility',
            'sync:cross_facility',
            'sync:manage',
            'directory:provision',
            'directory:read',
          ],
          membershipVersion: 1,
          createdAt: now,
          updatedAt: now,
        };

        const auditRecord: DirectoryAuditRecord = {
          logId: auditLogId,
          actorUid: operatorId,
          actorIdentityVerified: false,
          executionPrincipal,
          executionPrincipalVerified,
          executionCredentialSource,
          actorTenantId: tenantId.trim(),
          actorRoles: ['system_bootstrap_operator'],
          operation: 'BOOTSTRAP_FIRST_ADMIN',
          targetType: 'bootstrap',
          targetId: `${tenantId.trim()}/${adminUid.trim()}`,
          targetTenantId: tenantId.trim(),
          previousState: null,
          newState: {
            tenant: newTenant,
            user: newAdminUser,
            membership: newTenantMembership,
          },
          reason: reason || 'Initial system administrator bootstrap via Application Default Credentials',
          timestamp: now,
          status: 'SUCCESS',
          details: {
            initiatingOperator: operatorId,
            executionPrincipal,
            executionPrincipalVerified,
            executionCredentialSource,
            createdAdminUid: adminUid.trim(),
            createdTenantId: tenantId.trim(),
          },
        };

        if (this.simulatedAuditFailure) {
          throw new Error('SIMULATED_AUDIT_FAILURE: Audit persistence failed during bootstrap.');
        }

        txn.set(bootstrapMarkerRef, bootstrapMarker);
        txn.set(tenantRef, newTenant);
        txn.set(userRef, newAdminUser);
        txn.set(tenantMemRef, newTenantMembership);
        txn.set(auditRef, auditRecord);

        return {
          bootstrappedAt: now,
          projectId: expectedProjectId.trim(),
          tenant: newTenant,
          adminUser: newAdminUser,
          adminTenantMembership: newTenantMembership,
          auditLogId,
        };
      });

      return {
        success: true,
        data: result,
        auditLogId: result.auditLogId,
        message: `First administrator '${adminUid}' and root tenant '${tenantId}' bootstrapped successfully.`,
      };
    } catch (err: any) {
      const msg = err.message || '';
      const prefix = msg.split(':')[0];
      if (['BOOTSTRAP_ALREADY_COMPLETED'].includes(prefix)) {
        return { success: false, error: prefix, message: msg.replace(`${prefix}:`, '') };
      }
      return { success: false, error: 'BOOTSTRAP_FAILED', message: msg };
    }
  }
}

// -----------------------------------------------------------------------------
// Singleton Provisioning Service Instance
// -----------------------------------------------------------------------------
let globalProvisioningService: DirectoryProvisioningService | null = null;

export function getDirectoryProvisioningService(): DirectoryProvisioningService {
  if (!globalProvisioningService) {
    globalProvisioningService = new DirectoryProvisioningService();
  }
  return globalProvisioningService;
}

export function setDirectoryProvisioningServiceForTesting(service: DirectoryProvisioningService | null): void {
  globalProvisioningService = service;
}
