/**
 * Jano Health - Persistent Firestore Tenant, Facility & User Authorization Directory
 * 
 * Server-authoritative directory service governing access control:
 * - Canonical Collections:
 *   - directory_tenants/{tenantId}
 *   - directory_facilities/{facilityId}
 *   - directory_users/{uid}
 *   - directory_users/{uid}/tenant_memberships/{tenantId}
 *   - directory_users/{uid}/tenant_memberships/{tenantId}/facility_memberships/{facilityId}
 * 
 * Strict Security Invariants:
 * 1. Zero trust: Account existence does not grant access.
 * 2. Active status required at account, tenant, tenant membership, and facility membership levels.
 * 3. Exact tenant matching: Facility must be owned by the authenticated tenant.
 * 4. Cross-facility access strictly requires authoritative 'sync:cross_facility' capability.
 * 5. Fail-closed: Missing directory documents reject requests immediately. No default tenant or facility fallback.
 * 6. Transactional integrity: Supports read-before-write validation inside Firestore transactions.
 */

import { getFirebaseAdminApp } from './authMiddleware';

export interface DirectoryTenant {
  tenantId: string;
  status: 'active' | 'suspended';
  createdAt: string;
  updatedAt: string;
  policyMetadata?: Record<string, unknown>;
}

export interface DirectoryFacility {
  facilityId: string;
  tenantId: string;
  status: 'active' | 'decommissioned';
  createdAt: string;
  updatedAt: string;
  facilityMetadata?: Record<string, unknown>;
}

export interface DirectoryUserAccount {
  uid: string;
  accountStatus: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  updatedAt: string;
  revocationVersion: number;
  metadata?: Record<string, unknown>;
}

export interface DirectoryTenantMembership {
  tenantId: string;
  status: 'active' | 'suspended' | 'revoked';
  roles: string[];
  capabilities: string[];
  membershipVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryFacilityMembership {
  facilityId: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'revoked';
  capabilities: string[];
  membershipVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type DirectoryDenialCode =
  | 'UNAUTHORIZED_PRINCIPAL'
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REVOKED'
  | 'TENANT_IDENTITY_MISSING'
  | 'TENANT_NOT_FOUND'
  | 'TENANT_SUSPENDED'
  | 'TENANT_MEMBERSHIP_MISSING'
  | 'TENANT_MEMBERSHIP_INACTIVE'
  | 'TENANT_MEMBERSHIP_SUSPENDED'
  | 'TENANT_MEMBERSHIP_REVOKED'
  | 'FACILITY_NOT_FOUND'
  | 'FACILITY_DECOMMISSIONED'
  | 'FACILITY_TENANT_MISMATCH'
  | 'FACILITY_MEMBERSHIP_MISSING'
  | 'FACILITY_MEMBERSHIP_INACTIVE'
  | 'FACILITY_MEMBERSHIP_SUSPENDED'
  | 'FACILITY_MEMBERSHIP_REVOKED'
  | 'FACILITY_UNAUTHORIZED'
  | 'CAPABILITY_DENIED'
  | 'CROSS_FACILITY_ACCESS_DENIED'
  | 'DIRECTORY_UNAVAILABLE';

export interface TenantContextResult {
  authorized: boolean;
  tenantId?: string;
  account?: DirectoryUserAccount;
  tenantMembership?: DirectoryTenantMembership;
  code?: DirectoryDenialCode;
  message?: string;
}

export interface FacilityAccessResult {
  authorized: boolean;
  facility?: DirectoryFacility;
  facilityMembership?: DirectoryFacilityMembership;
  code?: DirectoryDenialCode;
  message?: string;
}

export interface TransactionalBatchAuthResult {
  authorized: boolean;
  code?: DirectoryDenialCode;
  reason?: string;
  account?: DirectoryUserAccount;
  tenant?: DirectoryTenant;
  tenantMembership?: DirectoryTenantMembership;
  facilityMemberships?: Map<string, DirectoryFacilityMembership>;
}

export class AuthorizationDirectory {
  private db: any | null = null;

  constructor(options?: { firestoreInstance?: any }) {
    if (options?.firestoreInstance) {
      this.db = options.firestoreInstance;
    }
  }

  public setFirestoreInstance(db: any): void {
    this.db = db;
  }

  private async getDb(): Promise<any> {
    if (this.db) {
      return this.db;
    }
    const app = getFirebaseAdminApp();
    if (!app) {
      throw new Error('FIREBASE_ADMIN_UNAVAILABLE: Firebase Admin App not initialized for Authorization Directory.');
    }
    const { getFirestore } = await import('firebase-admin/firestore');
    this.db = getFirestore(app);
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Account & Tenant Lookup
  // ---------------------------------------------------------------------------

  public async getAccount(uid: string): Promise<DirectoryUserAccount | null> {
    if (!uid || !uid.trim()) return null;
    try {
      const db = await this.getDb();
      const doc = await db.collection('directory_users').doc(uid.trim()).get();
      if (!doc.exists) return null;
      return doc.data() as DirectoryUserAccount;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getAccount failed for uid '${uid}':`, err?.message);
      return null;
    }
  }

  public async getTenant(tenantId: string): Promise<DirectoryTenant | null> {
    if (!tenantId || !tenantId.trim()) return null;
    try {
      const db = await this.getDb();
      const doc = await db.collection('directory_tenants').doc(tenantId.trim()).get();
      if (!doc.exists) return null;
      return doc.data() as DirectoryTenant;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getTenant failed for tenantId '${tenantId}':`, err?.message);
      return null;
    }
  }

  public async getFacility(facilityId: string): Promise<DirectoryFacility | null> {
    if (!facilityId || !facilityId.trim()) return null;
    try {
      const db = await this.getDb();
      const doc = await db.collection('directory_facilities').doc(facilityId.trim()).get();
      if (!doc.exists) return null;
      return doc.data() as DirectoryFacility;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getFacility failed for facilityId '${facilityId}':`, err?.message);
      return null;
    }
  }

  public async getTenantMembership(uid: string, tenantId: string): Promise<DirectoryTenantMembership | null> {
    if (!uid || !tenantId) return null;
    try {
      const db = await this.getDb();
      const doc = await db
        .collection('directory_users')
        .doc(uid.trim())
        .collection('tenant_memberships')
        .doc(tenantId.trim())
        .get();
      if (!doc.exists) return null;
      return doc.data() as DirectoryTenantMembership;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getTenantMembership failed for '${uid}/${tenantId}':`, err?.message);
      return null;
    }
  }

  public async getFacilityMembership(
    uid: string,
    tenantId: string,
    facilityId: string
  ): Promise<DirectoryFacilityMembership | null> {
    if (!uid || !tenantId || !facilityId) return null;
    try {
      const db = await this.getDb();
      const doc = await db
        .collection('directory_users')
        .doc(uid.trim())
        .collection('tenant_memberships')
        .doc(tenantId.trim())
        .collection('facility_memberships')
        .doc(facilityId.trim())
        .get();
      if (!doc.exists) return null;
      return doc.data() as DirectoryFacilityMembership;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getFacilityMembership failed for '${uid}/${tenantId}/${facilityId}':`, err?.message);
      return null;
    }
  }

  public async getUserTenantMemberships(uid: string): Promise<DirectoryTenantMembership[]> {
    if (!uid || !uid.trim()) return [];
    try {
      const db = await this.getDb();
      const snap = await db
        .collection('directory_users')
        .doc(uid.trim())
        .collection('tenant_memberships')
        .get();
      const memberships: DirectoryTenantMembership[] = [];
      snap.forEach((doc: any) => {
        memberships.push(doc.data() as DirectoryTenantMembership);
      });
      return memberships;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getUserTenantMemberships failed for '${uid}':`, err?.message);
      return [];
    }
  }

  public async getUserFacilityMemberships(uid: string, tenantId: string): Promise<DirectoryFacilityMembership[]> {
    if (!uid || !tenantId) return [];
    try {
      const db = await this.getDb();
      const snap = await db
        .collection('directory_users')
        .doc(uid.trim())
        .collection('tenant_memberships')
        .doc(tenantId.trim())
        .collection('facility_memberships')
        .get();
      const memberships: DirectoryFacilityMembership[] = [];
      snap.forEach((doc: any) => {
        memberships.push(doc.data() as DirectoryFacilityMembership);
      });
      return memberships;
    } catch (err: any) {
      console.error(`[AuthorizationDirectory] getUserFacilityMemberships failed for '${uid}/${tenantId}':`, err?.message);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Context & Authorization Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves and validates an authenticated user's active tenant context.
   * If explicitTenantId is provided (e.g. from validated header or token claim), validates that specific membership.
   * If no explicitTenantId is provided, inspects active tenant memberships:
   * - 0 memberships: Fails closed (TENANT_MEMBERSHIP_MISSING).
   * - 1 membership: Binds that tenant.
   * - >1 memberships: Fails closed (TENANT_IDENTITY_MISSING) requiring explicit selection.
   */
  public async resolveActiveTenantContext(uid: string, explicitTenantId?: string): Promise<TenantContextResult> {
    if (!uid || !uid.trim()) {
      return {
        authorized: false,
        code: 'UNAUTHORIZED_PRINCIPAL',
        message: 'Missing authenticated user identifier.',
      };
    }

    const account = await this.getAccount(uid);
    if (!account) {
      return {
        authorized: false,
        code: 'UNAUTHORIZED_PRINCIPAL',
        message: `User account '${uid}' is not registered in the authoritative directory.`,
      };
    }

    if (account.accountStatus === 'suspended') {
      return {
        authorized: false,
        account,
        code: 'ACCOUNT_SUSPENDED',
        message: `User account '${uid}' is suspended. Access denied.`,
      };
    }

    if (account.accountStatus === 'revoked') {
      return {
        authorized: false,
        account,
        code: 'ACCOUNT_REVOKED',
        message: `User account '${uid}' is revoked. Access denied.`,
      };
    }

    if (account.accountStatus !== 'active') {
      return {
        authorized: false,
        account,
        code: 'UNAUTHORIZED_PRINCIPAL',
        message: `User account '${uid}' is not active (status: ${account.accountStatus}).`,
      };
    }

    let targetTenantId = explicitTenantId?.trim();

    if (targetTenantId) {
      const tenant = await this.getTenant(targetTenantId);
      if (!tenant) {
        return {
          authorized: false,
          account,
          code: 'TENANT_NOT_FOUND',
          message: `Tenant '${targetTenantId}' does not exist in the directory.`,
        };
      }
      if (tenant.status !== 'active') {
        return {
          authorized: false,
          account,
          code: 'TENANT_SUSPENDED',
          message: `Tenant '${targetTenantId}' is not active (status: ${tenant.status}).`,
        };
      }

      const membership = await this.getTenantMembership(uid, targetTenantId);
      if (!membership) {
        return {
          authorized: false,
          account,
          code: 'TENANT_MEMBERSHIP_MISSING',
          message: `User '${uid}' has no membership in tenant '${targetTenantId}'.`,
        };
      }
      if (membership.status === 'suspended') {
        return {
          authorized: false,
          account,
          code: 'TENANT_MEMBERSHIP_SUSPENDED',
          message: `User membership in tenant '${targetTenantId}' is suspended.`,
        };
      }
      if (membership.status === 'revoked') {
        return {
          authorized: false,
          account,
          code: 'TENANT_MEMBERSHIP_REVOKED',
          message: `User membership in tenant '${targetTenantId}' is revoked.`,
        };
      }
      if (membership.status !== 'active') {
        return {
          authorized: false,
          account,
          code: 'TENANT_MEMBERSHIP_INACTIVE',
          message: `User membership in tenant '${targetTenantId}' is inactive.`,
        };
      }

      return {
        authorized: true,
        tenantId: targetTenantId,
        account,
        tenantMembership: membership,
      };
    }

    // No explicit tenant provided: check active memberships
    const allMemberships = await this.getUserTenantMemberships(uid);
    const activeMemberships = allMemberships.filter((m) => m.status === 'active');

    if (activeMemberships.length === 0) {
      return {
        authorized: false,
        account,
        code: 'TENANT_MEMBERSHIP_MISSING',
        message: `User '${uid}' has no active tenant memberships.`,
      };
    }

    if (activeMemberships.length > 1) {
      return {
        authorized: false,
        account,
        code: 'TENANT_IDENTITY_MISSING',
        message: `User '${uid}' belongs to multiple tenants (${activeMemberships.map((m) => m.tenantId).join(', ')}). Explicit tenant selection is required.`,
      };
    }

    const singleMem = activeMemberships[0]!;
    const singleTenant = await this.getTenant(singleMem.tenantId);
    if (!singleTenant || singleTenant.status !== 'active') {
      return {
        authorized: false,
        account,
        code: 'TENANT_SUSPENDED',
        message: `Tenant '${singleMem.tenantId}' is not active.`,
      };
    }

    return {
      authorized: true,
      tenantId: singleMem.tenantId,
      account,
      tenantMembership: singleMem,
    };
  }

  /**
   * Validates facility access for a user within an authenticated tenant context.
   * Checks:
   * 1. Facility existence & active status.
   * 2. Facility tenant ownership matches caller tenant.
   * 3. Cross-facility capability grant OR explicit active facility membership.
   */
  public async validateFacilityAccess(
    uid: string,
    tenantId: string,
    facilityId: string
  ): Promise<FacilityAccessResult> {
    if (!uid || !tenantId || !facilityId) {
      return {
        authorized: false,
        code: 'FACILITY_UNAUTHORIZED',
        message: 'uid, tenantId, and facilityId are required for facility authorization.',
      };
    }

    const facility = await this.getFacility(facilityId);
    if (!facility) {
      return {
        authorized: false,
        code: 'FACILITY_NOT_FOUND',
        message: `Facility '${facilityId}' is not registered in the directory.`,
      };
    }

    if (facility.status === 'decommissioned') {
      return {
        authorized: false,
        code: 'FACILITY_DECOMMISSIONED',
        message: `Facility '${facilityId}' is decommissioned. Access denied.`,
      };
    }

    if (facility.status !== 'active') {
      return {
        authorized: false,
        code: 'FACILITY_UNAUTHORIZED',
        message: `Facility '${facilityId}' is not active (status: ${facility.status}).`,
      };
    }

    if (facility.tenantId !== tenantId) {
      return {
        authorized: false,
        code: 'FACILITY_TENANT_MISMATCH',
        message: `Facility '${facilityId}' belongs to tenant '${facility.tenantId}', but caller is authenticated in tenant '${tenantId}'.`,
      };
    }

    // Check tenant membership capabilities for cross-facility grant
    const tenantMem = await this.getTenantMembership(uid, tenantId);
    if (tenantMem && tenantMem.status === 'active' && tenantMem.capabilities.includes('sync:cross_facility')) {
      return {
        authorized: true,
        facility,
      };
    }

    // Standard facility membership required
    const facMem = await this.getFacilityMembership(uid, tenantId, facilityId);
    if (!facMem) {
      return {
        authorized: false,
        facility,
        code: 'FACILITY_MEMBERSHIP_MISSING',
        message: `User '${uid}' lacks facility membership for '${facilityId}' in tenant '${tenantId}'.`,
      };
    }

    if (facMem.status === 'suspended') {
      return {
        authorized: false,
        facility,
        code: 'FACILITY_MEMBERSHIP_SUSPENDED',
        message: `User membership for facility '${facilityId}' is suspended.`,
      };
    }

    if (facMem.status === 'revoked') {
      return {
        authorized: false,
        facility,
        code: 'FACILITY_MEMBERSHIP_REVOKED',
        message: `User membership for facility '${facilityId}' is revoked.`,
      };
    }

    if (facMem.status !== 'active') {
      return {
        authorized: false,
        facility,
        code: 'FACILITY_MEMBERSHIP_INACTIVE',
        message: `User membership for facility '${facilityId}' is inactive.`,
      };
    }

    return {
      authorized: true,
      facility,
      facilityMembership: facMem,
    };
  }

  public async hasCrossFacilityCapability(uid: string, tenantId: string): Promise<boolean> {
    if (!uid || !tenantId) return false;
    const mem = await this.getTenantMembership(uid, tenantId);
    if (!mem || mem.status !== 'active') return false;
    return mem.capabilities.includes('sync:cross_facility');
  }

  public async resolvePermittedFacilityIds(uid: string, tenantId: string): Promise<string[]> {
    if (!uid || !tenantId) return [];
    const isCross = await this.hasCrossFacilityCapability(uid, tenantId);
    if (isCross) {
      return ['*']; // Universal access within tenant
    }
    const memberships = await this.getUserFacilityMemberships(uid, tenantId);
    return memberships.filter((m) => m.status === 'active').map((m) => m.facilityId);
  }

  // ---------------------------------------------------------------------------
  // In-Transaction Authorization Validation (ACID read-before-write)
  // ---------------------------------------------------------------------------

  /**
   * Executes transactional reads and validations inside an active Firestore transaction.
   * MUST be executed in Phase 1 before any txn.set() calls.
   * Guarantees race-free authorization against concurrent account, tenant, or membership revocations.
   */
  public async readAndValidateBatchAuthorization(
    txn: any,
    uid: string,
    tenantId: string,
    facilityIds: string[]
  ): Promise<TransactionalBatchAuthResult> {
    const db = await this.getDb();

    // 1. Read User Account
    const userRef = db.collection('directory_users').doc(uid);
    const userSnap = await txn.get(userRef);
    if (!userSnap.exists) {
      return {
        authorized: false,
        code: 'UNAUTHORIZED_PRINCIPAL',
        reason: `User '${uid}' account record does not exist in directory.`,
      };
    }
    const account = userSnap.data() as DirectoryUserAccount;
    if (account.accountStatus === 'suspended') {
      return {
        authorized: false,
        code: 'ACCOUNT_SUSPENDED',
        reason: `User account '${uid}' is suspended.`,
      };
    }
    if (account.accountStatus === 'revoked') {
      return {
        authorized: false,
        code: 'ACCOUNT_REVOKED',
        reason: `User account '${uid}' is revoked.`,
      };
    }
    if (account.accountStatus !== 'active') {
      return {
        authorized: false,
        code: 'UNAUTHORIZED_PRINCIPAL',
        reason: `User account '${uid}' is not active.`,
      };
    }

    // 2. Read Tenant
    const tenantRef = db.collection('directory_tenants').doc(tenantId);
    const tenantSnap = await txn.get(tenantRef);
    if (!tenantSnap.exists) {
      return {
        authorized: false,
        code: 'TENANT_NOT_FOUND',
        reason: `Tenant '${tenantId}' does not exist in directory.`,
      };
    }
    const tenant = tenantSnap.data() as DirectoryTenant;
    if (tenant.status !== 'active') {
      return {
        authorized: false,
        code: 'TENANT_SUSPENDED',
        reason: `Tenant '${tenantId}' is not active (status: ${tenant.status}).`,
      };
    }

    // 3. Read Tenant Membership
    const tenantMemRef = userRef.collection('tenant_memberships').doc(tenantId);
    const tenantMemSnap = await txn.get(tenantMemRef);
    if (!tenantMemSnap.exists) {
      return {
        authorized: false,
        code: 'TENANT_MEMBERSHIP_MISSING',
        reason: `User '${uid}' has no membership in tenant '${tenantId}'.`,
      };
    }
    const tenantMembership = tenantMemSnap.data() as DirectoryTenantMembership;
    if (tenantMembership.status === 'suspended') {
      return {
        authorized: false,
        code: 'TENANT_MEMBERSHIP_SUSPENDED',
        reason: `User membership in tenant '${tenantId}' is suspended.`,
      };
    }
    if (tenantMembership.status === 'revoked') {
      return {
        authorized: false,
        code: 'TENANT_MEMBERSHIP_REVOKED',
        reason: `User membership in tenant '${tenantId}' is revoked.`,
      };
    }
    if (tenantMembership.status !== 'active') {
      return {
        authorized: false,
        code: 'TENANT_MEMBERSHIP_INACTIVE',
        reason: `User membership in tenant '${tenantId}' is inactive.`,
      };
    }

    const hasCrossFacility = tenantMembership.capabilities.includes('sync:cross_facility');

    // 4. Read each distinct facility and facility membership
    const distinctFacilityIds = Array.from(new Set(facilityIds));
    const facilityMembershipsMap = new Map<string, DirectoryFacilityMembership>();

    for (const facId of distinctFacilityIds) {
      const facRef = db.collection('directory_facilities').doc(facId);
      const facSnap = await txn.get(facRef);
      if (!facSnap.exists) {
        return {
          authorized: false,
          code: 'FACILITY_NOT_FOUND',
          reason: `Target facility '${facId}' does not exist in directory.`,
        };
      }
      const facData = facSnap.data() as DirectoryFacility;
      if (facData.status === 'decommissioned') {
        return {
          authorized: false,
          code: 'FACILITY_DECOMMISSIONED',
          reason: `Target facility '${facId}' is decommissioned.`,
        };
      }
      if (facData.status !== 'active') {
        return {
          authorized: false,
          code: 'FACILITY_UNAUTHORIZED',
          reason: `Target facility '${facId}' is not active (status: ${facData.status}).`,
        };
      }
      if (facData.tenantId !== tenantId) {
        return {
          authorized: false,
          code: 'FACILITY_TENANT_MISMATCH',
          reason: `Target facility '${facId}' belongs to tenant '${facData.tenantId}', but transaction tenant is '${tenantId}'.`,
        };
      }

      // If user lacks cross-facility capability, facility membership is mandatory
      if (!hasCrossFacility) {
        const facMemRef = tenantMemRef.collection('facility_memberships').doc(facId);
        const facMemSnap = await txn.get(facMemRef);
        if (!facMemSnap.exists) {
          return {
            authorized: false,
            code: 'FACILITY_MEMBERSHIP_MISSING',
            reason: `User '${uid}' lacks facility membership for '${facId}'.`,
          };
        }
        const facMemData = facMemSnap.data() as DirectoryFacilityMembership;
        if (facMemData.status === 'suspended') {
          return {
            authorized: false,
            code: 'FACILITY_MEMBERSHIP_SUSPENDED',
            reason: `User facility membership for '${facId}' is suspended.`,
          };
        }
        if (facMemData.status === 'revoked') {
          return {
            authorized: false,
            code: 'FACILITY_MEMBERSHIP_REVOKED',
            reason: `User facility membership for '${facId}' is revoked.`,
          };
        }
        if (facMemData.status !== 'active') {
          return {
            authorized: false,
            code: 'FACILITY_MEMBERSHIP_INACTIVE',
            reason: `User facility membership for '${facId}' is inactive.`,
          };
        }
        facilityMembershipsMap.set(facId, facMemData);
      }
    }

    return {
      authorized: true,
      account,
      tenant,
      tenantMembership,
      facilityMemberships: facilityMembershipsMap,
    };
  }

  // ---------------------------------------------------------------------------
  // Controlled Provisioning Helpers (Used exclusively by tests and administrative CLI)
  // ---------------------------------------------------------------------------

  public async provisionTenant(tenant: DirectoryTenant): Promise<void> {
    const db = await this.getDb();
    await db.collection('directory_tenants').doc(tenant.tenantId).set(tenant);
  }

  public async provisionFacility(facility: DirectoryFacility): Promise<void> {
    const db = await this.getDb();
    await db.collection('directory_facilities').doc(facility.facilityId).set(facility);
  }

  public async provisionUser(user: DirectoryUserAccount): Promise<void> {
    const db = await this.getDb();
    await db.collection('directory_users').doc(user.uid).set(user);
  }

  public async provisionTenantMembership(uid: string, membership: DirectoryTenantMembership): Promise<void> {
    const db = await this.getDb();
    await db
      .collection('directory_users')
      .doc(uid)
      .collection('tenant_memberships')
      .doc(membership.tenantId)
      .set(membership);
  }

  public async provisionFacilityMembership(
    uid: string,
    tenantId: string,
    membership: DirectoryFacilityMembership
  ): Promise<void> {
    const db = await this.getDb();
    await db
      .collection('directory_users')
      .doc(uid)
      .collection('tenant_memberships')
      .doc(tenantId)
      .collection('facility_memberships')
      .doc(membership.facilityId)
      .set(membership);
  }
}

// -----------------------------------------------------------------------------
// Global Directory Service Singleton
// -----------------------------------------------------------------------------
let globalAuthorizationDirectory: AuthorizationDirectory | null = null;

export function getAuthorizationDirectory(): AuthorizationDirectory {
  if (!globalAuthorizationDirectory) {
    globalAuthorizationDirectory = new AuthorizationDirectory();
  }
  return globalAuthorizationDirectory;
}

export function setAuthorizationDirectoryForTesting(dir: AuthorizationDirectory | null): void {
  globalAuthorizationDirectory = dir;
}
