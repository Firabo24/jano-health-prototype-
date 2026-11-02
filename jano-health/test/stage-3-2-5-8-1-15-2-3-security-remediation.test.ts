/**
 * Jano Health - Stage 3.2.5.8.1.15.2.3 Verification Suite
 * Final CLI Credential, Legacy Role and Facility Inspection Security Remediation
 * 
 * Verifies all 4 remediation findings:
 * - FINDING-01: Production CLI bearer-token exposure (INSECURE_OPERATOR_TOKEN_INPUT, --token-stdin, TTY prompt)
 * - FINDING-02: Unverified Google Cloud execution identity (verified: false from file/env, server attestation)
 * - FINDING-03: Elimination of legacy 'system' role across operational middleware
 * - FINDING-04: Facility administrator user account inspection isolation and anti-enumeration
 * - System Invariants: 362 stores, 1,888-byte operational ledger preservation
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DirectoryProvisioningService,
  AdministrativeOperator,
} from '../server/directoryProvisioning';
import {
  resolveExecutionPrincipal,
  resolveOperatorToken,
  readTokenFromStdin,
} from '../scripts/provisionDirectory';
import {
  requireAdminOrSystem,
  requireSyncManagementAuth,
  requireClinicalAIAuth,
  DEVELOPMENT_PRINCIPALS,
} from '../server/authMiddleware';
import { isAuthorizedForLedgerRecovery } from '../server/serverLedger';
import { registerServerAuthenticatedPrincipal } from '../server/trustedPrincipal';
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

class MockQuerySnapshot {
  constructor(public readonly docs: MockDocSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
  forEach(callback: (doc: MockDocSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

class MockFirestoreDb {
  public store = new Map<string, Record<string, unknown>>();
  public projectId: string = 'jano-health-prod-test';

  public doc(docPath: string) {
    const self = this;
    return {
      get: async () => {
        const data = self.store.get(docPath);
        const parts = docPath.split('/');
        const id = parts[parts.length - 1];
        return new MockDocSnapshot(id, Boolean(data), data);
      },
      set: async (data: Record<string, unknown>) => {
        self.store.set(docPath, JSON.parse(JSON.stringify(data)));
      },
      update: async (data: Record<string, unknown>) => {
        const existing = self.store.get(docPath);
        if (!existing) throw new Error(`Document ${docPath} does not exist for update.`);
        self.store.set(docPath, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      },
      collection: (subColName: string) => self.collection(`${docPath}/${subColName}`),
    };
  }

  public collection(colPath: string) {
    const self = this;
    let filters: Array<{ field: string; op: string; val: unknown }> = [];
    let queryLimit: number | undefined;

    const builder: any = {
      doc: (docId: string) => self.doc(`${colPath}/${docId}`),
      where: (field: string, op: string, val: unknown) => {
        filters.push({ field, op, val });
        return builder;
      },
      limit: (n: number) => {
        queryLimit = n;
        return builder;
      },
      get: async () => {
        const results: MockDocSnapshot[] = [];
        const prefix = `${colPath}/`;

        for (const [key, val] of self.store.entries()) {
          if (key.startsWith(prefix)) {
            const remainder = key.substring(prefix.length);
            if (!remainder.includes('/')) {
              let match = true;
              for (const f of filters) {
                if (f.op === '==' && val[f.field] !== f.val) {
                  match = false;
                  break;
                }
              }
              if (match) {
                results.push(new MockDocSnapshot(remainder, true, val));
              }
            }
          }
        }
        const limited = queryLimit !== undefined ? results.slice(0, queryLimit) : results;
        return new MockQuerySnapshot(limited);
      },
    };
    return builder;
  }

  public async runTransaction(updateFn: (txn: any) => Promise<any>): Promise<any> {
    const self = this;
    const txn = {
      get: async (ref: any) => ref.get(),
      set: (ref: any, data: any) => ref.set(data),
      update: (ref: any, data: any) => ref.update(data),
    };
    return updateFn(txn);
  }

  public getDoc(docPath: string): MockDocSnapshot {
    const data = this.store.get(docPath);
    const parts = docPath.split('/');
    const id = parts[parts.length - 1];
    return new MockDocSnapshot(id, Boolean(data), data);
  }
}

async function runTests(): Promise<void> {
  console.log('================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.8.1.15.2.3 TEST SUITE');
  console.log('SECURITY REMEDIATION VERIFICATION');
  console.log('================================================================\n');

  // Verify Baseline Ledger
  const ledgerPath = path.resolve(process.cwd(), '.server_ledger_data.json');
  assert(fs.existsSync(ledgerPath), 'Operational ledger file exists');
  const initialLedgerBuffer = fs.readFileSync(ledgerPath);
  assert(initialLedgerBuffer.length === 1888, `Initial operational ledger size is exactly 1,888 bytes (got ${initialLedgerBuffer.length})`);
  const initialLedgerHash = crypto.createHash('sha256').update(initialLedgerBuffer).digest('hex');
  assert(initialLedgerHash === 'c7846a11fec0716f7bbe8f0117c4288659ed2deb90fa73f1251f0da9a1afd648', 'Initial operational ledger SHA-256 verified');

  // ---------------------------------------------------------------------------
  // 1. FINDING-01: CLI Bearer-Token Exposure Remediation
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. FINDING-01: CLI Bearer-Token Ingestion Hardening ---');

  // 1.1 In production, --operator-token is rejected with INSECURE_OPERATOR_TOKEN_INPUT
  let tokenErr1: any;
  try {
    await resolveOperatorToken({ production: true, 'operator-token': 'secret-bearer-123' });
  } catch (err: any) {
    tokenErr1 = err;
  }
  assert(Boolean(tokenErr1), '1.1 Production mode rejects --operator-token argument');
  assert(
    tokenErr1?.message?.includes('INSECURE_OPERATOR_TOKEN_INPUT'),
    'Reports INSECURE_OPERATOR_TOKEN_INPUT error code'
  );

  // 1.2 In production, JANO_ADMIN_TOKEN environment variable is rejected
  let tokenErr2: any;
  process.env.JANO_ADMIN_TOKEN = 'secret-env-token';
  try {
    await resolveOperatorToken({ production: true });
  } catch (err: any) {
    tokenErr2 = err;
  } finally {
    delete process.env.JANO_ADMIN_TOKEN;
  }
  assert(Boolean(tokenErr2), '1.2 Production mode rejects JANO_ADMIN_TOKEN environment variable');
  assert(
    tokenErr2?.message?.includes('INSECURE_OPERATOR_TOKEN_INPUT'),
    'Reports INSECURE_OPERATOR_TOKEN_INPUT for env variable exposure'
  );

  // 1.3 In production, FIREBASE_AUTH_TOKEN environment variable is rejected
  let tokenErr3: any;
  process.env.FIREBASE_AUTH_TOKEN = 'secret-fb-token';
  try {
    await resolveOperatorToken({ production: true });
  } catch (err: any) {
    tokenErr3 = err;
  } finally {
    delete process.env.FIREBASE_AUTH_TOKEN;
  }
  assert(Boolean(tokenErr3), '1.3 Production mode rejects FIREBASE_AUTH_TOKEN environment variable');
  assert(
    tokenErr3?.message?.includes('INSECURE_OPERATOR_TOKEN_INPUT'),
    'Reports INSECURE_OPERATOR_TOKEN_INPUT for FIREBASE_AUTH_TOKEN'
  );

  // 1.4 In production, missing credentials with non-interactive stdin throws OPERATOR_TOKEN_REQUIRED_IN_PRODUCTION
  let tokenErr4: any;
  try {
    await resolveOperatorToken({ production: true });
  } catch (err: any) {
    tokenErr4 = err;
  }
  assert(Boolean(tokenErr4), '1.4 Missing operator credentials in non-interactive production fails closed');
  assert(
    tokenErr4?.message?.includes('OPERATOR_TOKEN_REQUIRED_IN_PRODUCTION') ||
    tokenErr4?.message?.includes('INTERACTIVE_PROMPT_UNAVAILABLE'),
    'Reports credential requirement error'
  );

  // 1.5 Non-production allows explicit token for automated test environments
  const devToken = await resolveOperatorToken({ 'operator-token': 'dev-test-token' });
  assert(devToken === 'dev-test-token', '1.5 Non-production permits operator token with warning');

  // ---------------------------------------------------------------------------
  // 2. FINDING-02: Unverified Execution Identity Attribution
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. FINDING-02: Google Cloud Execution Identity Verification ---');

  // 2.1 FIREBASE_SERVICE_ACCOUNT JSON parsing is marked verified: false
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'deployer-sa@jano-health.iam.gserviceaccount.com',
  });
  const execEnv = resolveExecutionPrincipal();
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  assert(execEnv.principal === 'deployer-sa@jano-health.iam.gserviceaccount.com', '2.1 Resolved service account email');
  assert(execEnv.verified === false, 'Service account parsed from env is strictly marked verified: false');
  assert(execEnv.credentialSource === 'unverified_service_account_env', 'Source marked unverified_service_account_env');

  // 2.2 GOOGLE_APPLICATION_CREDENTIALS file parsing is marked verified: false
  const tmpCredPath = path.resolve(process.cwd(), '.tmp_test_sa_creds.json');
  fs.writeFileSync(tmpCredPath, JSON.stringify({
    client_email: 'file-sa@jano-health.iam.gserviceaccount.com',
  }));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpCredPath;
  const execFile = resolveExecutionPrincipal();
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fs.existsSync(tmpCredPath)) fs.unlinkSync(tmpCredPath);
  assert(execFile.principal === 'file-sa@jano-health.iam.gserviceaccount.com', '2.2 Resolved service account file email');
  assert(execFile.verified === false, 'Service account parsed from file is strictly marked verified: false');
  assert(execFile.credentialSource === 'unverified_google_application_credentials_file', 'Source marked unverified_google_application_credentials_file');

  // 2.3 Bootstrap server-side verification: unverified caller-supplied verified: true is rejected
  const mockDb = new MockFirestoreDb();
  const provService = new DirectoryProvisioningService({ firestoreInstance: mockDb as any });
  provService.setAuthoritativeProjectIdResolverForTesting(() => 'jano-health-prod-test');

  const bootRes1 = await provService.bootstrapFirstAdministrator({
    expectedProjectId: 'jano-health-prod-test',
    tenantId: 'tenant-test-bootstrap-1',
    adminUid: 'usr-admin-test-1',
    initiatingOperator: {
      operatorId: 'op-1',
      executionPrincipal: 'fake-sa@gcp',
      executionPrincipalVerified: true, // Caller asserts verified without attestation
      executionCredentialSource: 'application_default_credentials',
    },
  });
  assert(bootRes1.success === true, '2.3 Bootstrap commits successfully');
  const markerDoc = mockDb.getDoc('directory_system/bootstrap_marker');
  const markerData = markerDoc.data() as any;
  assert(markerData.executionPrincipalVerified === false, 'Bootstrap marker records executionPrincipalVerified: false without trusted attestation');

  // ---------------------------------------------------------------------------
  // 3. FINDING-03: Elimination of Legacy 'system' Role
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. FINDING-03: Elimination of Legacy system Role ---');

  // 3.1 Mock Express response and next handler
  function createMockExpress(roles: string[]) {
    let statusCode = 200;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = {
      authenticatedPrincipal: {
        userId: 'usr-test-subject',
        provider: 'local_development',
        roles,
        facilityIds: ['fac-uvinza-hc'],
        accountStatus: 'active',
      },
      body: {},
      headers: {},
      query: {},
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        jsonBody = data;
        return res;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    return { req, res, next, getStatus: () => statusCode, getJson: () => jsonBody, wasNextCalled: () => nextCalled };
  }

  // 3.2 requireAdminOrSystem rejects 'system' role
  const mockSystemAdmin = createMockExpress(['system']);
  requireAdminOrSystem(mockSystemAdmin.req, mockSystemAdmin.res, mockSystemAdmin.next);
  assert(mockSystemAdmin.wasNextCalled() === false, '3.2 requireAdminOrSystem rejects legacy system role');
  assert(mockSystemAdmin.getStatus() === 403, 'requireAdminOrSystem returns HTTP 403 for system role');

  // 3.3 requireAdminOrSystem accepts canonical 'system_administrator' role
  const mockCanonicalAdmin = createMockExpress(['system_administrator']);
  requireAdminOrSystem(mockCanonicalAdmin.req, mockCanonicalAdmin.res, mockCanonicalAdmin.next);
  assert(mockCanonicalAdmin.wasNextCalled() === true, '3.3 requireAdminOrSystem accepts canonical system_administrator role');

  // 3.4 requireSyncManagementAuth rejects 'system' role
  const mockSyncSystem = createMockExpress(['system']);
  requireSyncManagementAuth(mockSyncSystem.req, mockSyncSystem.res, mockSyncSystem.next);
  assert(mockSyncSystem.wasNextCalled() === false, '3.4 requireSyncManagementAuth rejects legacy system role');
  assert(mockSyncSystem.getStatus() === 403, 'requireSyncManagementAuth returns HTTP 403 for system role');

  // 3.5 requireSyncManagementAuth accepts 'system_administrator' role
  const mockSyncAdmin = createMockExpress(['system_administrator']);
  requireSyncManagementAuth(mockSyncAdmin.req, mockSyncAdmin.res, mockSyncAdmin.next);
  assert(mockSyncAdmin.wasNextCalled() === true, '3.5 requireSyncManagementAuth accepts canonical system_administrator');

  // 3.6 requireClinicalAIAuth rejects 'system' role
  const mockAISystem = createMockExpress(['system']);
  requireClinicalAIAuth(mockAISystem.req, mockAISystem.res, mockAISystem.next);
  assert(mockAISystem.wasNextCalled() === false, '3.6 requireClinicalAIAuth rejects legacy system role');
  assert(mockAISystem.getStatus() === 403, 'requireClinicalAIAuth returns HTTP 403 for system role');

  // 3.7 requireClinicalAIAuth accepts 'system_administrator' role
  const mockAIAdmin = createMockExpress(['system_administrator']);
  requireClinicalAIAuth(mockAIAdmin.req, mockAIAdmin.res, mockAIAdmin.next);
  assert(mockAIAdmin.wasNextCalled() === true, '3.7 requireClinicalAIAuth accepts canonical system_administrator');

  // 3.8 isAuthorizedForLedgerRecovery rejects 'system' role and accepts 'system_administrator'
  const pSystem = registerServerAuthenticatedPrincipal({ userId: 'u1', roles: ['system'], facilityIds: ['fac-1'], accountStatus: 'active' });
  const pSysAdmin = registerServerAuthenticatedPrincipal({ userId: 'u2', roles: ['system_administrator'], facilityIds: ['fac-1'], accountStatus: 'active' });
  assert(
    isAuthorizedForLedgerRecovery(pSystem) === false,
    '3.8 isAuthorizedForLedgerRecovery rejects legacy system role'
  );
  assert(
    isAuthorizedForLedgerRecovery(pSysAdmin) === true,
    'isAuthorizedForLedgerRecovery accepts canonical system_administrator'
  );

  // 3.9 DEVELOPMENT_PRINCIPALS['usr-system'] has canonical system_administrator role
  const devSys = DEVELOPMENT_PRINCIPALS['usr-system'];
  assert(devSys.roles.includes('system_administrator'), '3.9 usr-system development principal has system_administrator role');
  assert(!devSys.roles.includes('system'), 'usr-system development principal does not contain legacy system role');

  // ---------------------------------------------------------------------------
  // 4. FINDING-04: Facility Administrator Inspection Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. FINDING-04: Facility Admin Inspection Isolation & Anti-Enumeration ---');

  const inspDb = new MockFirestoreDb();
  const inspService = new DirectoryProvisioningService({ firestoreInstance: inspDb as any });

  // Setup directory documents:
  // Tenant A: fac-alpha-01, fac-alpha-02
  // User 1: Active in fac-alpha-01
  // User 2: Active only in fac-alpha-02
  // User 3: Inactive/suspended in fac-alpha-01
  const tenantA = 'tenant-health-ea';
  inspDb.store.set(`directory_tenants/${tenantA}`, { tenantId: tenantA, status: 'active' });
  inspDb.store.set(`directory_facilities/fac-alpha-01`, { facilityId: 'fac-alpha-01', tenantId: tenantA, status: 'active' });
  inspDb.store.set(`directory_facilities/fac-alpha-02`, { facilityId: 'fac-alpha-02', tenantId: tenantA, status: 'active' });

  // User 1
  inspDb.store.set(`directory_users/usr-member-fac1`, {
    uid: 'usr-member-fac1',
    accountStatus: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    revocationVersion: 1,
  });
  inspDb.store.set(`directory_users/usr-member-fac1/tenant_memberships/${tenantA}`, {
    tenantId: tenantA,
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
  });
  inspDb.store.set(`directory_users/usr-member-fac1/tenant_memberships/${tenantA}/facility_memberships/fac-alpha-01`, {
    facilityId: 'fac-alpha-01',
    tenantId: tenantA,
    status: 'active',
    capabilities: ['sync:facility'],
    membershipVersion: 1,
  });

  // User 2 (only in fac-alpha-02)
  inspDb.store.set(`directory_users/usr-member-fac2`, {
    uid: 'usr-member-fac2',
    accountStatus: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    revocationVersion: 1,
  });
  inspDb.store.set(`directory_users/usr-member-fac2/tenant_memberships/${tenantA}`, {
    tenantId: tenantA,
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
  });
  inspDb.store.set(`directory_users/usr-member-fac2/tenant_memberships/${tenantA}/facility_memberships/fac-alpha-02`, {
    facilityId: 'fac-alpha-02',
    tenantId: tenantA,
    status: 'active',
    capabilities: ['sync:facility'],
    membershipVersion: 1,
  });

  // Facility Admin for fac-alpha-01 only
  const facAdminOp: AdministrativeOperator = {
    userId: 'usr-admin-fac1',
    provider: 'firebase_auth',
    roles: ['facility_administrator'],
    tenantId: tenantA,
    facilityIds: ['fac-alpha-01'],
    accountStatus: 'active',
    capabilities: ['directory:provision'],
  };

  // 4.1 Inspecting user in permitted facility succeeds with data-minimized fields
  const inspRes1 = await inspService.inspectDirectory(facAdminOp, { uid: 'usr-member-fac1' });
  assert(inspRes1.success === true, '4.1 Facility admin inspecting user in authorized facility succeeds');
  assert(inspRes1.data?.user?.uid === 'usr-member-fac1', 'Returns user account');
  assert(inspRes1.data?.facilityMemberships?.length === 1, 'Returns permitted facility membership');
  assert(inspRes1.data?.facilityMemberships?.[0].facilityId === 'fac-alpha-01', 'Membership belongs to authorized facility');
  assert(inspRes1.data?.tenantMemberships?.length === 0, 'Tenant memberships omitted to prevent cross-scope disclosure');

  // 4.2 Inspecting user belonging ONLY to another facility fails closed with USER_NOT_FOUND_OR_UNAUTHORIZED
  const inspRes2 = await inspService.inspectDirectory(facAdminOp, { uid: 'usr-member-fac2' });
  assert(inspRes2.success === false, '4.2 Facility admin inspecting user outside authorized facility fails');
  assert(
    inspRes2.error === 'USER_NOT_FOUND_OR_UNAUTHORIZED',
    'Returns USER_NOT_FOUND_OR_UNAUTHORIZED error code on facility mismatch'
  );
  assert(!inspRes2.data?.user, 'No user data returned for out-of-facility user');

  // 4.3 Inspecting non-existent user returns USER_NOT_FOUND_OR_UNAUTHORIZED (anti-enumeration)
  const inspRes3 = await inspService.inspectDirectory(facAdminOp, { uid: 'usr-ghost-user-404' });
  assert(inspRes3.success === false, '4.3 Facility admin inspecting non-existent user fails closed');
  assert(
    inspRes3.error === 'USER_NOT_FOUND_OR_UNAUTHORIZED',
    'Anti-enumeration: identical error code returned for non-existent and unauthorized users'
  );

  // 4.4 Facility admin querying another facilityId is rejected with CROSS_FACILITY_INSPECTION_FORBIDDEN
  const inspRes4 = await inspService.inspectDirectory(facAdminOp, {
    uid: 'usr-member-fac1',
    facilityId: 'fac-alpha-02',
  });
  assert(inspRes4.success === false, '4.4 Facility admin querying unassigned facilityId is rejected');
  assert(
    inspRes4.error === 'CROSS_FACILITY_INSPECTION_FORBIDDEN',
    'Reports CROSS_FACILITY_INSPECTION_FORBIDDEN'
  );

  // 4.5 Global admin can inspect user in any facility
  const globalAdminOp: AdministrativeOperator = {
    userId: 'usr-global-admin',
    provider: 'firebase_auth',
    roles: ['system_administrator'],
    tenantId: tenantA,
    facilityIds: ['fac-alpha-01', 'fac-alpha-02'],
    accountStatus: 'active',
    capabilities: ['directory:provision'],
  };
  const globalInsp = await inspService.inspectDirectory(globalAdminOp, { uid: 'usr-member-fac2' });
  assert(globalInsp.success === true, '4.5 Global admin can inspect users across facilities');
  assert(globalInsp.data?.user?.uid === 'usr-member-fac2', 'Global admin receives target user record');

  // ---------------------------------------------------------------------------
  // 5. Architectural & Ledger Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Architectural & Ledger Invariants ---');

  // 5.1 IndexedDB Store Count
  assert(ALL_STORE_NAMES.length === 362, `Total registered IndexedDB stores count is exactly 362 (got ${ALL_STORE_NAMES.length})`);

  // 5.2 Cloud Run Sync Remains Blocked
  assert(getPersistenceStatus().cloudRunSafe === false, '5.2 Cloud Run sync remains strictly blocked (cutover unauthorized)');

  // 5.3 Operational Ledger File Preserved
  const finalLedgerBuffer = fs.readFileSync(ledgerPath);
  assert(finalLedgerBuffer.length === 1888, `Operational ledger (.server_ledger_data.json) strictly preserved at 1888 bytes (got ${finalLedgerBuffer.length})`);
  const finalLedgerHash = crypto.createHash('sha256').update(finalLedgerBuffer).digest('hex');
  assert(finalLedgerHash === initialLedgerHash, 'Operational ledger SHA-256 strictly preserved');

  // 5.4 Backup Ledger File Preserved
  const backupPath = path.resolve(process.cwd(), '.server_ledger_data.json.bak');
  assert(fs.existsSync(backupPath), 'Backup ledger file exists');
  const backupBuffer = fs.readFileSync(backupPath);
  assert(backupBuffer.length === 1888, `Backup ledger strictly preserved at 1888 bytes (got ${backupBuffer.length})`);

  console.log('\n================================================================');
  console.log(`STAGE 3.2.5.8.1.15.2.3 RESULTS: ALL ${passCount} CHECKS PASSED (0 failures)`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
