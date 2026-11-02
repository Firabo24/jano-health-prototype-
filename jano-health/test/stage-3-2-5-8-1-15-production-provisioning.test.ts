/**
 * Jano Health - Stage 3.2.5.8.1.15 Verification Suite
 * Production Authorization Directory Provisioning
 * 
 * Verifies:
 * 1. Secure first-administrator bootstrap (project match, empty directory check, replay prevention)
 * 2. Authorized provisioning (tenants, facilities, users, tenant memberships, facility memberships)
 * 3. Unauthorized provisioning rejection & missing operator identity
 * 4. Cross-tenant & cross-facility boundary enforcement
 * 5. Duplicate and invalid reference rejections
 * 6. Anti-self-provisioning & privilege elevation guards
 * 7. Suspended and revoked account handling
 * 8. Monotonic versioning (revocationVersion, membershipVersion) and idempotency
 * 9. Atomic transaction execution and audit persistence guarantees
 * 10. Directory inspection API
 * 11. Preservation of operational server ledger files (1,888 bytes, exact SHA-256)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DirectoryProvisioningService,
  AdministrativeOperator,
  VALID_PROVISIONING_ROLES,
  VALID_PROVISIONING_CAPABILITIES,
} from '../server/directoryProvisioning';
import {
  AuthorizationDirectory,
  setAuthorizationDirectoryForTesting,
} from '../server/authorizationDirectory';
import { getFirebaseAdminApp } from '../server/authMiddleware';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { getPersistenceStatus } from '../server/readiness';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// -----------------------------------------------------------------------------
// In-Memory Firestore Simulation Engine
// -----------------------------------------------------------------------------
class MockDocSnapshot {
  constructor(
    public readonly id: string,
    public readonly exists: boolean,
    private readonly _data?: Record<string, unknown>
  ) {}

  data(): Record<string, unknown> | undefined {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class MockDocRef {
  constructor(private readonly engine: MockFirestoreDB, public readonly fullPath: string) {}

  collection(subColl: string): MockCollRef {
    return new MockCollRef(this.engine, `${this.fullPath}/${subColl}`);
  }

  async get(): Promise<MockDocSnapshot> {
    return this.engine.getDoc(this.fullPath);
  }

  async set(data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void> {
    this.engine.setDoc(this.fullPath, data, options?.merge);
  }
}

class MockCollRef {
  constructor(private readonly engine: MockFirestoreDB, public readonly collPath: string) {}

  doc(id: string): MockDocRef {
    return new MockDocRef(this.engine, `${this.collPath}/${id}`);
  }

  where(field: string, op: string, val: any): MockQuery {
    return new MockQuery(this.engine, this.collPath, [{ field, op, val }]);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.engine, this.collPath, [], undefined, undefined, count);
  }

  async get(): Promise<{ forEach: (cb: (doc: MockDocSnapshot) => void) => void }> {
    return new MockQuery(this.engine, this.collPath).get();
  }
}

class MockQuery {
  constructor(
    private readonly engine: MockFirestoreDB,
    private readonly collPath: string,
    private readonly filters: Array<{ field: string; op: string; val: any }> = [],
    private readonly sortField?: string,
    private readonly sortDir?: 'asc' | 'desc',
    private readonly limitCount?: number
  ) {}

  where(field: string, op: string, val: any): MockQuery {
    return new MockQuery(this.engine, this.collPath, [...this.filters, { field, op, val }], this.sortField, this.sortDir, this.limitCount);
  }

  limit(count: number): MockQuery {
    return new MockQuery(this.engine, this.collPath, this.filters, this.sortField, this.sortDir, count);
  }

  async get(): Promise<{ forEach: (cb: (doc: MockDocSnapshot) => void) => void }> {
    let docs = this.engine.getDocsInColl(this.collPath);
    if (this.filters.length > 0) {
      docs = docs.filter((d) => {
        const data = d.data();
        if (!data) return false;
        return this.filters.every((f) => {
          const docVal = data[f.field];
          if (f.op === '==') return docVal === f.val;
          if (f.op === '>') return docVal > f.val;
          if (f.op === '<') return docVal < f.val;
          return false;
        });
      });
    }

    if (this.limitCount && this.limitCount > 0) {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      forEach(cb: (doc: MockDocSnapshot) => void) {
        docs.forEach(cb);
      },
    };
  }
}

class MockTx {
  private hasPerformedWrite = false;
  private pendingWrites: Array<() => void> = [];

  constructor(private readonly engine: MockFirestoreDB) {}

  async get(ref: MockDocRef): Promise<MockDocSnapshot> {
    if (this.hasPerformedWrite) {
      throw new Error('FIRESTORE_TX_READ_AFTER_WRITE: Firestore transactions require all reads to precede all writes.');
    }
    return this.engine.getDoc(ref.fullPath);
  }

  set(ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }): void {
    this.hasPerformedWrite = true;
    this.pendingWrites.push(() => {
      this.engine.setDoc(ref.fullPath, data, options?.merge);
    });
  }

  commit(): void {
    for (const w of this.pendingWrites) {
      w();
    }
  }
}

class MockFirestoreDB {
  public readonly data: Map<string, Record<string, unknown>> = new Map();

  collection(collName: string): MockCollRef {
    return new MockCollRef(this, collName);
  }

  getDoc(fullPath: string): MockDocSnapshot {
    const val = this.data.get(fullPath);
    const id = fullPath.split('/').pop() || '';
    return new MockDocSnapshot(id, Boolean(val), val);
  }

  setDoc(fullPath: string, val: Record<string, unknown>, merge = false): void {
    if (merge && this.data.has(fullPath)) {
      const existing = this.data.get(fullPath)!;
      this.data.set(fullPath, { ...existing, ...val });
    } else {
      this.data.set(fullPath, { ...val });
    }
  }

  getDocsInColl(collPath: string): MockDocSnapshot[] {
    const results: MockDocSnapshot[] = [];
    const prefix = `${collPath}/`;
    for (const [key, val] of this.data.entries()) {
      if (key.startsWith(prefix)) {
        const subPath = key.substring(prefix.length);
        if (!subPath.includes('/')) {
          results.push(new MockDocSnapshot(subPath, true, val));
        }
      }
    }
    return results;
  }

  async runTransaction(cb: (txn: MockTx) => Promise<any>): Promise<any> {
    const tx = new MockTx(this);
    const result = await cb(tx);
    tx.commit();
    return result;
  }
}

// -----------------------------------------------------------------------------
// Test Execution Suite
// -----------------------------------------------------------------------------

async function runProvisioningTests(): Promise<void> {
  console.log('================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8.1.15 TEST SUITE');
  console.log('PRODUCTION AUTHORIZATION DIRECTORY PROVISIONING');
  console.log('================================================================\n');

  // Baseline Operational Ledger Verification
  const operationalLedgerPath = path.join(process.cwd(), '.server_ledger_data.json');
  assert(fs.existsSync(operationalLedgerPath), 'Operational ledger file exists');
  const initialContent = fs.readFileSync(operationalLedgerPath);
  const initialSize = initialContent.length;
  const initialHash = crypto.createHash('sha256').update(initialContent).digest('hex');
  assert(initialSize === 1888, `Initial operational ledger size is exactly 1,888 bytes (got ${initialSize})`);
  assert(
    initialHash === 'c7846a11fec0716f7bbe8f0117c4288659ed2deb90fa73f1251f0da9a1afd648',
    'Initial operational ledger SHA-256 verified'
  );

  // Setup Test Environment
  const mockDb = new MockFirestoreDB();
  const authDir = new AuthorizationDirectory({ firestoreInstance: mockDb });
  setAuthorizationDirectoryForTesting(authDir);
  const provisioningService = new DirectoryProvisioningService({ firestoreInstance: mockDb, authDirectory: authDir });

  // ---------------------------------------------------------------------------
  // 1. First-Administrator Bootstrap Procedure
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. First-Administrator Bootstrap Procedure ---');
  process.env.FIREBASE_PROJECT_ID = 'jano-health-prod-test';

  // 1.1 Project mismatch guard
  const mismatchResult = await provisioningService.bootstrapFirstAdministrator({
    expectedProjectId: 'wrong-project-id',
    tenantId: 'tenant-prod-ea-moh',
    adminUid: 'usr-root-admin',
  });
  assert(mismatchResult.success === false, '1.1 Bootstrap rejects project mismatch');
  assert(mismatchResult.error === 'BOOTSTRAP_PROJECT_MISMATCH', 'Reports BOOTSTRAP_PROJECT_MISMATCH');

  // 1.2 Valid bootstrap on empty directory
  const bootstrapResult = await provisioningService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-prod-ea-moh',
    adminUid: 'usr-root-admin',
    adminEmail: 'root-admin@janohealth.org',
    reason: 'Initial test bootstrap',
  });
  assert(bootstrapResult.success === true, '1.2 Valid bootstrap on empty directory succeeds');
  assert(bootstrapResult.data?.tenant.tenantId === 'tenant-prod-ea-moh', 'Root tenant created');
  assert(bootstrapResult.data?.adminUser.uid === 'usr-root-admin', 'Admin user created');
  assert(
    bootstrapResult.data?.adminTenantMembership.roles.includes('system_administrator'),
    'Admin granted system_administrator role'
  );
  assert(
    bootstrapResult.data?.adminTenantMembership.capabilities.includes('directory:provision'),
    'Admin granted directory:provision capability'
  );

  // Verify audit log created for bootstrap
  const auditLogsSnap = mockDb.getDocsInColl('directory_audit_logs');
  assert(auditLogsSnap.length === 1, 'Bootstrap created exactly 1 audit log record');
  const bootLog = auditLogsSnap[0].data() as any;
  assert(bootLog?.operation === 'BOOTSTRAP_FIRST_ADMIN', 'Audit log records BOOTSTRAP_FIRST_ADMIN');
  assert(bootLog?.actorUid === 'bootstrap_operator_adc', 'Default operator UID is bootstrap_operator_adc');
  assert(bootLog?.executionPrincipal === 'gcp_application_default_credentials', 'Default execution principal is ADC');
  assert(bootLog?.details?.createdAdminUid === 'usr-root-admin', 'Created admin UID recorded in audit details');

  // Verify singleton marker document was created
  const markerDoc = mockDb.getDoc('directory_system/bootstrap_marker');
  assert(markerDoc.exists === true, 'Singleton bootstrap_marker document created in directory_system');
  assert((markerDoc.data() as any)?.rootTenantId === 'tenant-prod-ea-moh', 'Marker records rootTenantId');

  // 1.3 Replay prevention: Bootstrap fails if directory is already initialized
  const replayResult = await provisioningService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-second',
    adminUid: 'usr-second-admin',
  });
  assert(replayResult.success === false, '1.3 Bootstrap replay attempt rejected');
  assert(replayResult.error === 'BOOTSTRAP_ALREADY_COMPLETED', 'Reports BOOTSTRAP_ALREADY_COMPLETED');

  // 1.4 Concurrency conflict guard with divergent tenant & admin parameters
  const freshDb = new MockFirestoreDB();
  const freshAuthDir = new AuthorizationDirectory({ firestoreInstance: freshDb });
  const freshProvService = new DirectoryProvisioningService({ firestoreInstance: freshDb, authDirectory: freshAuthDir });

  // First bootstrap succeeds and locks the directory
  const concRes1 = await freshProvService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-branch-alpha',
    adminUid: 'usr-admin-alpha',
    initiatingOperator: { operatorId: 'op-runner-alpha', executionPrincipal: 'alpha-sa@gcp' },
  });
  assert(concRes1.success === true, '1.4 First concurrent bootstrap wins race');

  // Divergent second bootstrap attempt fails on bootstrap_marker singleton
  const concRes2 = await freshProvService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-branch-beta',
    adminUid: 'usr-admin-beta',
    initiatingOperator: { operatorId: 'op-runner-beta', executionPrincipal: 'beta-sa@gcp' },
  });
  assert(concRes2.success === false, '1.4 Divergent second concurrent bootstrap rejected');
  assert(concRes2.error === 'BOOTSTRAP_ALREADY_COMPLETED', 'Second bootstrap aborts on singleton marker collision');

  // 1.5 Authoritative Project Resolution Check
  const emptyDb = new MockFirestoreDB();
  const emptyProvService = new DirectoryProvisioningService({ firestoreInstance: emptyDb });
  emptyProvService.setAuthoritativeProjectIdResolverForTesting(() => undefined);

  const unresProjRes = await emptyProvService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-unres',
    adminUid: 'usr-unres',
  });
  assert(unresProjRes.success === false, '1.5 Bootstrap rejects when active project identity is unresolved');
  assert(unresProjRes.error === 'PROJECT_IDENTITY_UNRESOLVED', 'Reports PROJECT_IDENTITY_UNRESOLVED');

  // 1.6 Bootstrap Operator Attribution Separation
  const alphaAuditDoc = freshDb.getDoc(`directory_audit_logs/${concRes1.data?.auditLogId}`);
  assert(alphaAuditDoc.exists === true, '1.6 Alpha bootstrap audit log exists');
  const alphaLog = alphaAuditDoc.data() as any;
  assert(alphaLog?.actorUid === 'op-runner-alpha', 'Audit log attributes operator UID to initiating operator');
  assert(alphaLog?.executionPrincipal === 'alpha-sa@gcp', 'Audit log attributes execution principal to initiating principal');
  assert(alphaLog?.details?.createdAdminUid === 'usr-admin-alpha', 'Created administrator UID separated into details.createdAdminUid');
  assert(concRes1.data?.tenant?.policyMetadata?.bootstrappedBy === 'op-runner-alpha', 'Tenant policyMetadata attributes bootstrappedBy');

  // ---------------------------------------------------------------------------
  // 2. Authorized Provisioning Workflows
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Authorized Provisioning Workflows ---');

  // 2.0 Firebase Auth User Existence & Disabled Validation
  const validUsers: Record<string, { exists: boolean; disabled: boolean }> = {
    'usr-tz-admin': { exists: true, disabled: false },
    'usr-tz-physician-01': { exists: true, disabled: false },
    'usr-no-tenant-mem-yet': { exists: true, disabled: false },
    'usr-temp-suspended': { exists: true, disabled: false },
    'usr-to-suspend': { exists: true, disabled: false },
    'usr-disabled-auth': { exists: true, disabled: true },
  };

  provisioningService.setFirebaseAuthValidatorForTesting(async (uid: string) => {
    return validUsers[uid] || { exists: false, disabled: false };
  });

  const rootAdminOp: AdministrativeOperator = {
    userId: 'usr-root-admin',
    provider: 'firebase_auth',
    roles: ['system_administrator'],
    tenantId: 'tenant-prod-ea-moh',
    capabilities: ['directory:provision', 'sync:facility'],
    accountStatus: 'active',
  };

  // 2.0.1 Unknown Firebase Auth user rejected
  const unknownAuthRes = await provisioningService.provisionUser(rootAdminOp, {
    uid: 'usr-not-in-firebase-auth',
  });
  assert(unknownAuthRes.success === false, '2.0.1 Provisioning non-existent Firebase Auth user rejected');
  assert(unknownAuthRes.error === 'FIREBASE_USER_NOT_FOUND', 'Reports FIREBASE_USER_NOT_FOUND');

  // 2.0.2 Disabled Firebase Auth user rejected
  const disabledAuthRes = await provisioningService.provisionUser(rootAdminOp, {
    uid: 'usr-disabled-auth',
  });
  assert(disabledAuthRes.success === false, '2.0.2 Provisioning disabled Firebase Auth user rejected');
  assert(disabledAuthRes.error === 'FIREBASE_USER_DISABLED', 'Reports FIREBASE_USER_DISABLED');

  // 2.1 Provision a second tenant
  const tenant2Result = await provisioningService.provisionTenant(rootAdminOp, {
    tenantId: 'tenant-prod-tz-health',
    reason: 'Onboarding Tanzania Health Authority',
  });
  assert(tenant2Result.success === true, '2.1 Global admin provisions tenant');
  assert(tenant2Result.data?.tenantId === 'tenant-prod-tz-health', 'Second tenant active');

  // 2.2 Provision a facility under existing tenant
  const facResult = await provisioningService.provisionFacility(rootAdminOp, {
    facilityId: 'fac-mwanza-regional-01',
    tenantId: 'tenant-prod-tz-health',
    reason: 'Commissioning Mwanza Hospital',
  });
  assert(facResult.success === true, '2.2 Global admin provisions facility under tenant');
  assert(facResult.data?.facilityId === 'fac-mwanza-regional-01', 'Facility active');

  // 2.3 Provision user accounts
  const user1Result = await provisioningService.provisionUser(rootAdminOp, {
    uid: 'usr-tz-admin',
    reason: 'Onboarding TZ Tenant Administrator',
  });
  assert(user1Result.success === true, '2.3 Global admin provisions user account');

  const user2Result = await provisioningService.provisionUser(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    reason: 'Onboarding TZ Staff Physician',
  });
  assert(user2Result.success === true, 'Global admin provisions clinician account');

  // 2.4 Create tenant membership for TZ admin
  const tzAdminMem = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-tz-admin',
    tenantId: 'tenant-prod-tz-health',
    roles: ['tenant_administrator', 'facility_administrator'],
    capabilities: ['sync:facility', 'directory:provision'],
    reason: 'Assigning TZ tenant admin authority',
  });
  assert(tzAdminMem.success === true, '2.4 Tenant membership created with tenant_administrator role');

  // 2.5 Create clinician tenant membership
  const tzClinicianMem = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['physician', 'clinician'],
    capabilities: ['sync:facility'],
    reason: 'Staff physician assignment',
  });
  assert(tzClinicianMem.success === true, 'Clinician tenant membership created');

  // 2.6 Create facility membership
  const facMemResult = await provisioningService.createFacilityMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    facilityId: 'fac-mwanza-regional-01',
    capabilities: ['sync:facility'],
    reason: 'Staff physician deployment to Mwanza Regional',
  });
  assert(facMemResult.success === true, '2.6 Facility membership created');

  // ---------------------------------------------------------------------------
  // 3. Unauthorized Provisioning Rejection & Missing Operator Identity
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Unauthorized Provisioning Rejection ---');

  // 3.1 Missing operator credentials
  const noOpResult = await provisioningService.provisionTenant(null as any, { tenantId: 'tenant-fail' });
  assert(noOpResult.success === false, '3.1 Missing operator fails closed');
  assert(noOpResult.error === 'UNAUTHORIZED_OPERATOR', 'Reports UNAUTHORIZED_OPERATOR');

  // 3.2 Ordinary clinician operator attempting to provision tenant
  const clinicianOp: AdministrativeOperator = {
    userId: 'usr-tz-physician-01',
    provider: 'firebase_auth',
    roles: ['physician'],
    tenantId: 'tenant-prod-tz-health',
    accountStatus: 'active',
  };
  const clinicianTenantAttempt = await provisioningService.provisionTenant(clinicianOp, { tenantId: 'tenant-hacked' });
  assert(clinicianTenantAttempt.success === false, '3.2 Ordinary clinician cannot provision tenant');
  assert(clinicianTenantAttempt.error === 'GLOBAL_ADMIN_REQUIRED', 'Reports GLOBAL_ADMIN_REQUIRED');

  // 3.3 Development principal fixture in production mode
  const devOpInProd: AdministrativeOperator = {
    userId: 'usr-sysadmin-amanuel',
    provider: 'local_development', // Development provider!
    roles: ['system_administrator'],
    accountStatus: 'active',
  };
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodDevAttempt = await provisioningService.provisionTenant(devOpInProd, { tenantId: 'tenant-dev-in-prod' });
  assert(prodDevAttempt.success === false, '3.3 Development principal rejected in production mode');
  assert(prodDevAttempt.error === 'DEVELOPMENT_PRINCIPALS_FORBIDDEN_IN_PRODUCTION', 'Reports DEVELOPMENT_PRINCIPALS_FORBIDDEN_IN_PRODUCTION');
  process.env.NODE_ENV = prevEnv;

  // ---------------------------------------------------------------------------
  // 4. Cross-Tenant & Cross-Facility Boundaries
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Cross-Tenant & Cross-Facility Boundaries ---');

  const tzAdminOp: AdministrativeOperator = {
    userId: 'usr-tz-admin',
    provider: 'firebase_auth',
    roles: ['tenant_administrator'],
    tenantId: 'tenant-prod-tz-health',
    capabilities: ['directory:provision'],
    accountStatus: 'active',
  };

  // 4.1 Tenant admin attempts to provision facility in EA-MOH tenant
  const crossTenantFac = await provisioningService.provisionFacility(tzAdminOp, {
    facilityId: 'fac-illegal-cross-01',
    tenantId: 'tenant-prod-ea-moh', // Target is EA-MOH, operator is TZ!
  });
  assert(crossTenantFac.success === false, '4.1 Tenant admin cannot provision facility in other tenant');
  assert(crossTenantFac.error === 'CROSS_TENANT_PROVISIONING_FORBIDDEN', 'Reports CROSS_TENANT_PROVISIONING_FORBIDDEN');

  // 4.2 Tenant admin attempts to assign membership in EA-MOH tenant
  const crossTenantMem = await provisioningService.createTenantMembership(tzAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
  });
  assert(crossTenantMem.success === false, '4.2 Tenant admin cannot manage memberships in other tenant');
  assert(crossTenantMem.error === 'CROSS_TENANT_PROVISIONING_FORBIDDEN', 'Reports CROSS_TENANT_PROVISIONING_FORBIDDEN');

  // 4.3 Facility membership targeting facility owned by different tenant
  // Provision a facility in EA-MOH tenant
  await provisioningService.provisionFacility(rootAdminOp, {
    facilityId: 'fac-ea-kigoma-01',
    tenantId: 'tenant-prod-ea-moh',
  });
  const facTenantMismatch = await provisioningService.createFacilityMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health', // User's tenant is TZ
    facilityId: 'fac-ea-kigoma-01', // Facility belongs to EA-MOH!
    capabilities: ['sync:facility'],
  });
  assert(facTenantMismatch.success === false, '4.3 Facility membership cross-tenant mismatch rejected');
  assert(facTenantMismatch.error === 'FACILITY_TENANT_MISMATCH', 'Reports FACILITY_TENANT_MISMATCH');

  // ---------------------------------------------------------------------------
  // 5. Duplicate & Invalid References Rejections
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Duplicate & Invalid References ---');

  // 5.1 Duplicate tenant with different state
  mockDb.setDoc('directory_tenants/tenant-suspended-demo', { tenantId: 'tenant-suspended-demo', status: 'suspended' });
  const dupTenant = await provisioningService.provisionTenant(rootAdminOp, { tenantId: 'tenant-suspended-demo' });
  assert(dupTenant.success === false, '5.1 Duplicate tenant with conflicting status rejected');
  assert(dupTenant.error === 'DUPLICATE_TENANT_ID', 'Reports DUPLICATE_TENANT_ID');

  // 5.2 Facility under non-existent tenant
  const ghostTenantFac = await provisioningService.provisionFacility(rootAdminOp, {
    facilityId: 'fac-ghost-01',
    tenantId: 'tenant-ghost-non-existent',
  });
  assert(ghostTenantFac.success === false, '5.2 Facility under unknown tenant rejected');
  assert(ghostTenantFac.error === 'TENANT_NOT_FOUND', 'Reports TENANT_NOT_FOUND');

  // 5.3 Membership for unknown user
  const ghostUserMem = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-ghost-unknown',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
  });
  assert(ghostUserMem.success === false, '5.3 Tenant membership for unknown user rejected');
  assert(ghostUserMem.error === 'USER_NOT_FOUND', 'Reports USER_NOT_FOUND');

  // 5.4 Facility membership without prior tenant membership
  await provisioningService.provisionUser(rootAdminOp, { uid: 'usr-no-tenant-mem-yet' });
  const facWithoutTenant = await provisioningService.createFacilityMembership(rootAdminOp, {
    uid: 'usr-no-tenant-mem-yet',
    tenantId: 'tenant-prod-ea-moh',
    facilityId: 'fac-ea-kigoma-01',
    capabilities: ['sync:facility'],
  });
  assert(facWithoutTenant.success === false, '5.4 Facility membership without tenant membership rejected');
  assert(facWithoutTenant.error === 'TENANT_MEMBERSHIP_MISSING', 'Reports TENANT_MEMBERSHIP_MISSING');

  // 5.5 Invalid role name rejected
  const badRoleResult = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['hacker_supreme'],
    capabilities: ['sync:facility'],
  });
  assert(badRoleResult.success === false, '5.5 Invalid role name rejected');
  assert(badRoleResult.error === 'INVALID_ROLE', 'Reports INVALID_ROLE');

  // 5.5b Legacy 'system' role rejected (deprecated in favor of system_administrator)
  const legacySystemRoleResult = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['system' as any],
    capabilities: ['sync:facility'],
  });
  assert(legacySystemRoleResult.success === false, "5.5b Legacy 'system' role rejected as invalid");
  assert(legacySystemRoleResult.error === 'INVALID_ROLE', 'Reports INVALID_ROLE for legacy system alias');

  // 5.6 Invalid capability name rejected
  const badCapResult = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['clinician'],
    capabilities: ['sync:unrestricted_root_bypass'],
  });
  assert(badCapResult.success === false, '5.6 Invalid capability name rejected');
  assert(badCapResult.error === 'INVALID_CAPABILITY', 'Reports INVALID_CAPABILITY');

  // 5.7 Tenant admin attempting privilege escalation to system_administrator in createTenantMembership
  const elevationAttempt = await provisioningService.createTenantMembership(tzAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['system_administrator'], // Privilege elevation!
    capabilities: ['sync:facility'],
  });
  assert(elevationAttempt.success === false, '5.7 Tenant admin privilege elevation in createTenantMembership rejected');
  assert(elevationAttempt.error === 'PRIVILEGE_ELEVATION_FORBIDDEN', 'Reports PRIVILEGE_ELEVATION_FORBIDDEN');

  // 5.8 Tenant admin attempting privilege escalation to system_administrator in updateMembership
  const updateRoleElevation = await provisioningService.updateMembership(tzAdminOp, {
    type: 'tenant',
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['system_administrator'],
  });
  assert(updateRoleElevation.success === false, '5.8 Role elevation in updateMembership rejected');
  assert(updateRoleElevation.error === 'PRIVILEGE_ELEVATION_FORBIDDEN', 'Reports PRIVILEGE_ELEVATION_FORBIDDEN');

  // 5.9 Tenant admin attempting capability escalation to directory:provision in createTenantMembership
  const scopedAdminOp: AdministrativeOperator = {
    userId: 'usr-scoped-subadmin',
    provider: 'firebase_auth',
    roles: ['tenant_administrator'],
    tenantId: 'tenant-prod-tz-health',
    capabilities: ['sync:facility'],
    accountStatus: 'active',
  };
  const capElevationAttempt1 = await provisioningService.createTenantMembership(scopedAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['clinician'],
    capabilities: ['sync:facility', 'directory:provision'],
  });
  assert(capElevationAttempt1.success === false, '5.9 Capability elevation in createTenantMembership rejected');
  assert(capElevationAttempt1.error === 'CAPABILITY_ELEVATION_FORBIDDEN', 'Reports CAPABILITY_ELEVATION_FORBIDDEN');

  // 5.10 Tenant admin attempting capability escalation in createFacilityMembership
  const capElevationAttempt2 = await provisioningService.createFacilityMembership(scopedAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    facilityId: 'fac-mwanza-regional-01',
    capabilities: ['sync:manage'],
  });
  assert(capElevationAttempt2.success === false, '5.10 Capability elevation in createFacilityMembership rejected');
  assert(capElevationAttempt2.error === 'CAPABILITY_ELEVATION_FORBIDDEN', 'Reports CAPABILITY_ELEVATION_FORBIDDEN');

  // 5.11 Tenant admin attempting capability escalation in updateMembership
  const capElevationAttempt3 = await provisioningService.updateMembership(scopedAdminOp, {
    type: 'tenant',
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    capabilities: ['directory:provision'],
  });
  assert(capElevationAttempt3.success === false, '5.11 Capability elevation in updateMembership rejected');
  assert(capElevationAttempt3.error === 'CAPABILITY_ELEVATION_FORBIDDEN', 'Reports CAPABILITY_ELEVATION_FORBIDDEN');

  // ---------------------------------------------------------------------------
  // 6. Anti-Self-Provisioning & Self-Modification Guards
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Anti-Self-Provisioning Guards ---');

  // 6.1 Administrator attempting to modify own account status
  const selfStatusAttempt = await provisioningService.setUserAccountStatus(tzAdminOp, {
    uid: 'usr-tz-admin', // Self!
    newStatus: 'revoked',
    reason: 'Testing self status',
  });
  assert(selfStatusAttempt.success === false, '6.1 Self account status modification rejected');
  assert(selfStatusAttempt.error === 'SELF_PROVISIONING_FORBIDDEN', 'Reports SELF_PROVISIONING_FORBIDDEN');

  // 6.2 Administrator attempting to grant self new membership
  const selfMemAttempt = await provisioningService.createTenantMembership(tzAdminOp, {
    uid: 'usr-tz-admin', // Self!
    tenantId: 'tenant-prod-tz-health',
    roles: ['system_administrator'],
    capabilities: ['sync:facility'],
  });
  assert(selfMemAttempt.success === false, '6.2 Self membership assignment rejected');
  assert(selfMemAttempt.error === 'SELF_PROVISIONING_FORBIDDEN', 'Reports SELF_PROVISIONING_FORBIDDEN');

  // ---------------------------------------------------------------------------
  // 7. Suspended and Revoked Account Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Suspended & Revoked Account Handling ---');

  // Create test user and suspend
  await provisioningService.provisionUser(rootAdminOp, { uid: 'usr-to-suspend' });
  const suspendUserRes = await provisioningService.setUserAccountStatus(rootAdminOp, {
    uid: 'usr-to-suspend',
    newStatus: 'suspended',
    reason: 'Suspension test',
  });
  assert(suspendUserRes.success === true, '7.1 User successfully suspended');
  assert(suspendUserRes.data?.revocationVersion === 2, 'Revocation version incremented to 2');

  // Attempting to assign membership to suspended user
  const suspendedMemRes = await provisioningService.createTenantMembership(rootAdminOp, {
    uid: 'usr-to-suspend',
    tenantId: 'tenant-prod-ea-moh',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
  });
  assert(suspendedMemRes.success === false, '7.2 Membership creation for suspended user rejected');
  assert(suspendedMemRes.error === 'ACCOUNT_SUSPENDED', 'Reports ACCOUNT_SUSPENDED');

  // Suspended operator attempting any action
  const suspendedOp: AdministrativeOperator = {
    userId: 'usr-suspended-op',
    roles: ['system_administrator'],
    accountStatus: 'suspended', // Suspended operator!
  };
  const opSuspendedAttempt = await provisioningService.provisionTenant(suspendedOp, { tenantId: 'tenant-fail-op' });
  assert(opSuspendedAttempt.success === false, '7.3 Suspended operator cannot perform provisioning');
  assert(opSuspendedAttempt.error === 'OPERATOR_ACCOUNT_SUSPENDED', 'Reports OPERATOR_ACCOUNT_SUSPENDED');

  // ---------------------------------------------------------------------------
  // 8. Versioning, Status Updates & Idempotency
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. Versioning & Idempotency ---');

  // 8.1 Update membership roles with monotonic version increment
  const updateMemRes = await provisioningService.updateMembership(rootAdminOp, {
    type: 'tenant',
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['physician', 'clinical_supervisor'],
    capabilities: ['sync:facility', 'sync:cross_facility'],
    reason: 'Promoted to supervisor',
  });
  assert(updateMemRes.success === true, '8.1 Update membership roles succeeds');
  assert((updateMemRes.data as any)?.membershipVersion === 2, 'Membership version monotonically incremented to 2');
  assert((updateMemRes.data as any)?.roles.includes('clinical_supervisor'), 'Roles updated');

  // 8.2 Suspend tenant membership
  const suspendMemRes = await provisioningService.setTenantMembershipStatus(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    newStatus: 'suspended',
    reason: 'Temporary suspension',
  });
  assert(suspendMemRes.success === true, '8.2 Tenant membership suspended');
  assert(suspendMemRes.data?.membershipVersion === 3, 'Membership version incremented to 3');

  // 8.3 Updating inactive membership rejected
  const updateInactiveRes = await provisioningService.updateMembership(rootAdminOp, {
    type: 'tenant',
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    roles: ['physician'],
  });
  assert(updateInactiveRes.success === false, '8.3 Updating inactive membership rejected');
  assert(updateInactiveRes.error === 'CANNOT_UPDATE_INACTIVE_MEMBERSHIP', 'Reports CANNOT_UPDATE_INACTIVE_MEMBERSHIP');

  // 8.4 Idempotent tenant provisioning returns existing active tenant
  const idempTenant = await provisioningService.provisionTenant(rootAdminOp, { tenantId: 'tenant-prod-tz-health' });
  assert(idempTenant.success === true, '8.4 Idempotent tenant provisioning succeeds cleanly');
  assert(idempTenant.data?.tenantId === 'tenant-prod-tz-health', 'Returns existing tenant data');

  // 8.5 Idempotent user provisioning returns existing active user
  const idempUser = await provisioningService.provisionUser(rootAdminOp, { uid: 'usr-tz-admin' });
  assert(idempUser.success === true, '8.5 Idempotent user provisioning succeeds cleanly');

  // ---------------------------------------------------------------------------
  // 9. Transaction Atomicity & Audit Persistence Guarantee
  // ---------------------------------------------------------------------------
  console.log('\n--- 9. Transaction Atomicity & Audit Guarantees ---');

  // 9.1 When audit persistence fails, entire transaction rolls back
  provisioningService.setSimulatedAuditFailureForTesting(true);
  const auditFailRes = await provisioningService.provisionTenant(rootAdminOp, {
    tenantId: 'tenant-should-rollback',
  });
  assert(auditFailRes.success === false, '9.1 Provisioning fails when audit write fails');
  assert(auditFailRes.error === 'TRANSACTION_FAILED', 'Transaction aborted');

  // Verify rollback: tenant document was NOT committed to Firestore
  const rolledBackDoc = mockDb.getDoc('directory_tenants/tenant-should-rollback');
  assert(rolledBackDoc.exists === false, 'Rolled back tenant document does not exist in Firestore');
  provisioningService.setSimulatedAuditFailureForTesting(false);

  // 9.2 Successful operations write audit logs
  const auditLogsAfter = mockDb.getDocsInColl('directory_audit_logs');
  assert(auditLogsAfter.length >= 10, `Audit logs recorded across mutations (total: ${auditLogsAfter.length})`);

  // ---------------------------------------------------------------------------
  // 10. Directory Inspection API
  // ---------------------------------------------------------------------------
  console.log('\n--- 10. Directory Inspection API ---');

  const inspectRes = await provisioningService.inspectDirectory(rootAdminOp, {
    tenantId: 'tenant-prod-tz-health',
    uid: 'usr-tz-physician-01',
    includeAuditLogs: true,
  });
  assert(inspectRes.success === true, '10.1 Inspect directory succeeds for global admin');
  assert(inspectRes.data?.tenant?.tenantId === 'tenant-prod-tz-health', 'Inspect returns target tenant');
  assert(inspectRes.data?.user?.uid === 'usr-tz-physician-01', 'Inspect returns target user');
  assert(Array.isArray(inspectRes.data?.tenantMemberships), 'Inspect returns tenant memberships');
  assert(Array.isArray(inspectRes.data?.auditLogs), 'Inspect returns audit logs');

  // 10.2 Cross-tenant inspection by tenant admin rejected
  const crossTenantInspect = await provisioningService.inspectDirectory(tzAdminOp, {
    tenantId: 'tenant-prod-ea-moh', // Target is EA-MOH, operator is TZ!
  });
  assert(crossTenantInspect.success === false, '10.2 Tenant admin cross-tenant inspection rejected');
  assert(crossTenantInspect.error === 'CROSS_TENANT_INSPECTION_FORBIDDEN', 'Reports CROSS_TENANT_INSPECTION_FORBIDDEN');

  // 10.3 Tenant admin omitting tenantId is strictly scoped to own tenant
  const scopedTenantInspect = await provisioningService.inspectDirectory(tzAdminOp, {
    includeAuditLogs: true,
  });
  assert(scopedTenantInspect.success === true, '10.3 Tenant admin inspection without tenantId succeeds');
  assert(scopedTenantInspect.data?.tenant?.tenantId === 'tenant-prod-tz-health', 'Scoper tenant is TZ Health');
  assert(scopedTenantInspect.data?.tenants?.length === 1, 'Only own tenant returned (anti-tenant leakage)');
  assert(scopedTenantInspect.data?.tenants?.[0]?.tenantId === 'tenant-prod-tz-health', 'Leaked foreign tenants count is 0');
  const nonTzLogs = (scopedTenantInspect.data?.auditLogs || []).filter((l) => l.targetTenantId !== 'tenant-prod-tz-health');
  assert(nonTzLogs.length === 0, 'Audit logs strictly filtered to operator tenant');

  // 10.4 User inspection membership filtering
  const userMultiTenantInspect = await provisioningService.inspectDirectory(tzAdminOp, {
    uid: 'usr-tz-physician-01',
  });
  assert(userMultiTenantInspect.success === true, '10.4 User inspection succeeds');
  const userMems = userMultiTenantInspect.data?.tenantMemberships || [];
  const foreignMems = userMems.filter((m) => m.tenantId !== 'tenant-prod-tz-health');
  assert(foreignMems.length === 0, 'Foreign tenant memberships omitted from scoped user inspection');

  // 10.5 Facility administrator cross-facility inspection rejected
  await provisioningService.provisionFacility(rootAdminOp, {
    facilityId: 'fac-dar-central-02',
    tenantId: 'tenant-prod-tz-health',
  });
  await provisioningService.createFacilityMembership(rootAdminOp, {
    uid: 'usr-tz-physician-01',
    tenantId: 'tenant-prod-tz-health',
    facilityId: 'fac-dar-central-02',
    capabilities: ['sync:facility'],
  });

  const facAdminOp: AdministrativeOperator = {
    userId: 'usr-mwanza-fac-admin',
    provider: 'firebase_auth',
    roles: ['facility_administrator'],
    tenantId: 'tenant-prod-tz-health',
    facilityIds: ['fac-mwanza-regional-01'],
    capabilities: ['directory:read'],
    accountStatus: 'active',
  };

  const crossFacInspect = await provisioningService.inspectDirectory(facAdminOp, {
    facilityId: 'fac-dar-central-02', // Not permitted!
  });
  assert(crossFacInspect.success === false, '10.5 Facility admin cross-facility inspection rejected');
  assert(crossFacInspect.error === 'CROSS_FACILITY_INSPECTION_FORBIDDEN', 'Reports CROSS_FACILITY_INSPECTION_FORBIDDEN');

  // 10.6 Facility admin scoped inspection returns strictly permitted facilities
  const scopedFacInspect = await provisioningService.inspectDirectory(facAdminOp, {});
  assert(scopedFacInspect.success === true, '10.6 Facility admin scoped inspection succeeds');
  const returnedFacIds = (scopedFacInspect.data?.facilities || []).map((f) => f.facilityId);
  assert(returnedFacIds.length === 1 && returnedFacIds[0] === 'fac-mwanza-regional-01', 'Facility inspection strictly scoped to permitted facility');
  assert(!returnedFacIds.includes('fac-dar-central-02'), 'Unpermitted facility fac-dar-central-02 excluded from results');

  // 10.7 Facility admin inspecting user filters unpermitted facility memberships
  const facAdminUserInspect = await provisioningService.inspectDirectory(facAdminOp, {
    uid: 'usr-tz-physician-01',
  });
  assert(facAdminUserInspect.success === true, '10.7 Facility admin user inspection succeeds');
  const userFacMems = facAdminUserInspect.data?.facilityMemberships || [];
  assert(userFacMems.length === 1, 'Only permitted facility membership returned');
  assert(userFacMems[0]?.facilityId === 'fac-mwanza-regional-01', 'Returned membership is for fac-mwanza-regional-01');

  // 10.8 Facility admin audit logs filter unpermitted facilities
  const facAdminAuditInspect = await provisioningService.inspectDirectory(facAdminOp, {
    includeAuditLogs: true,
  });
  assert(facAdminAuditInspect.success === true, '10.8 Facility admin audit inspection succeeds');
  const unpermittedAuditLogs = (facAdminAuditInspect.data?.auditLogs || []).filter(
    (l) => l.targetFacilityId && l.targetFacilityId !== 'fac-mwanza-regional-01'
  );
  assert(unpermittedAuditLogs.length === 0, 'Audit logs for unpermitted facilities strictly excluded');

  // ---------------------------------------------------------------------------
  // 11. Architectural & Operational Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- 11. Architectural & Operational Invariants ---');

  // 11.1 IndexedDB store count invariant (362 stores)
  assert(ALL_STORE_NAMES.length === 362, `Total registered IndexedDB stores count is exactly 362 (got ${ALL_STORE_NAMES.length})`);

  // 11.2 Cloud Run sync remains blocked
  assert(getPersistenceStatus().cloudRunSafe === false, 'Cloud Run sync remains strictly blocked (cutover unauthorized)');

  // 11.3 Operational server ledger files strictly untouched
  const finalContent = fs.readFileSync(operationalLedgerPath);
  const finalSize = finalContent.length;
  const finalHash = crypto.createHash('sha256').update(finalContent).digest('hex');
  assert(finalSize === initialSize, `Operational ledger (.server_ledger_data.json) strictly preserved at ${finalSize} bytes`);
  assert(finalHash === initialHash, 'Operational ledger SHA-256 strictly preserved');

  const bakPath = path.join(process.cwd(), '.server_ledger_data.json.bak');
  assert(fs.existsSync(bakPath), 'Backup ledger file exists');
  const bakSize = fs.statSync(bakPath).size;
  assert(bakSize === initialSize, `Backup ledger strictly preserved at ${bakSize} bytes`);

  console.log('\n================================================================');
  console.log(`STAGE 3.2.5.8.1.15 RESULTS: ALL ${passCount} CHECKS PASSED (0 failures)`);
  console.log('================================================================\n');
}

runProvisioningTests().catch((err) => {
  console.error('\n[FATAL] Test suite encountered unhandled exception:', err);
  process.exit(1);
});
