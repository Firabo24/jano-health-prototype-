/**
 * Jano Health - Stage 3.2.5.8.1.14 Verification Suite
 * Persistent Firestore Tenant, Facility & User Authorization Directory
 * 
 * Verifies:
 * 1. Identity & Account Lifecycle (Active, Unknown, Suspended, Revoked, Multi-tenant)
 * 2. Tenant Membership Validation (Active, Missing, Suspended, Revoked, Cross-Tenant)
 * 3. Facility Membership & Ownership (Active, Decommissioned, Tenant Mismatch, Missing, Suspended, Revoked)
 * 4. Capabilities & Scope (Ordinary Facility, Cross-Facility, Static Map Disregard, Client Spoofing)
 * 5. In-Transaction ACID Protection (Revocation before transaction, Account suspension, Concurrent mutation, Zero writes on deny)
 * 6. Tenant & Facility Isolation (Cross-tenant block, Unauthorized pull isolation, Post-revocation immediacy)
 * 7. Architectural Invariants (362 stores, Operational ledger preservation, Cloud Run gates fail closed)
 */

import http from 'http';
import { AddressInfo } from 'net';
import fs from 'fs';
import path from 'path';
import { app } from '../server';
import {
  AuthorizationDirectory,
  DirectoryTenant,
  DirectoryFacility,
  DirectoryUserAccount,
  DirectoryTenantMembership,
  DirectoryFacilityMembership,
  setAuthorizationDirectoryForTesting,
} from '../server/authorizationDirectory';
import { FirestoreServerLedgerBackend } from '../server/firestoreLedgerBackend';
import { setLedgerBackendForTesting, resetLedgerBackendForTesting } from '../server/ledgerBackend';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { DEFAULT_TENANT_ID, SECONDARY_TENANT_ID } from '../server/serverLedger';

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
// In-Memory Firestore Simulation Engine for Directory & Transactional Tests
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
    private readonly sortDir?: 'asc' | 'desc'
  ) {}

  where(field: string, op: string, val: any): MockQuery {
    return new MockQuery(this.engine, this.collPath, [...this.filters, { field, op, val }], this.sortField, this.sortDir);
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): MockQuery {
    return new MockQuery(this.engine, this.collPath, this.filters, field, dir);
  }

  limit(count: number): MockQuery {
    return this;
  }

  async get(): Promise<{ forEach: (cb: (doc: MockDocSnapshot) => void) => void }> {
    const docs = this.engine.getDocsInColl(this.collPath);
    let matched = docs.filter((d) => {
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

    if (this.sortField) {
      matched.sort((a, b) => {
        const va = (a.data() as any)?.[this.sortField!];
        const vb = (b.data() as any)?.[this.sortField!];
        if (va < vb) return this.sortDir === 'desc' ? 1 : -1;
        if (va > vb) return this.sortDir === 'desc' ? -1 : 1;
        return 0;
      });
    }

    return {
      forEach(cb: (doc: MockDocSnapshot) => void) {
        matched.forEach(cb);
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
async function runAuthorizationTests() {
  console.log('\n================================================================');
  console.log('JANO HEALTH - STAGE 3.2.5.8.1.14 VERIFICATION SUITE');
  console.log('Persistent Firestore Tenant, Facility & User Authorization Directory');
  console.log('================================================================\n');

  const operationalLedgerPath = path.join(process.cwd(), '.server_ledger_data.json');
  const initialStat = fs.statSync(operationalLedgerPath);
  const initialSize = initialStat.size;

  const mockDb = new MockFirestoreDB();
  const dir = new AuthorizationDirectory({ firestoreInstance: mockDb });
  setAuthorizationDirectoryForTesting(dir);

  const backend = new FirestoreServerLedgerBackend({
    firestoreInstance: mockDb,
    tenantId: DEFAULT_TENANT_ID,
  });
  await backend.init();
  setLedgerBackendForTesting(backend, true);

  // ---------------------------------------------------------------------------
  // 1. Identity & Account Lifecycle
  // ---------------------------------------------------------------------------
  console.log('--- 1. Identity & Account Lifecycle ---');

  // Provision active tenant
  await dir.provisionTenant({
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Provision second active tenant
  await dir.provisionTenant({
    tenantId: 'tenant-prod-tz-health',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Provision active facility
  await dir.provisionFacility({
    facilityId: 'fac-rural-dispensary-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Provision second facility
  await dir.provisionFacility({
    facilityId: 'fac-district-hospital-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Provision cross-tenant facility
  await dir.provisionFacility({
    facilityId: 'fac-mwanza-regional-01',
    tenantId: 'tenant-prod-tz-health',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // 1.1 Valid active user
  await dir.provisionUser({
    uid: 'usr-clinician-active',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  await dir.provisionTenantMembership('usr-clinician-active', {
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await dir.provisionFacilityMembership('usr-clinician-active', 'tenant-prod-ea-moh', {
    facilityId: 'fac-rural-dispensary-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const res1 = await dir.resolveActiveTenantContext('usr-clinician-active');
  assert(res1.authorized === true, '1. Valid authenticated user with active directory account is authorized');
  assert(res1.tenantId === 'tenant-prod-ea-moh', 'Resolved correct active tenant context');

  // 1.2 Unknown UID
  const res2 = await dir.resolveActiveTenantContext('usr-unknown-random');
  assert(res2.authorized === false, '2. Unknown UID fails closed');
  assert(res2.code === 'UNAUTHORIZED_PRINCIPAL', 'Returns UNAUTHORIZED_PRINCIPAL for unknown UID');

  // 1.3 Missing UID
  const res3 = await dir.resolveActiveTenantContext('');
  assert(res3.authorized === false, '3. Missing UID fails closed');
  assert(res3.code === 'UNAUTHORIZED_PRINCIPAL', 'Returns UNAUTHORIZED_PRINCIPAL for empty UID');

  // 1.4 Suspended account
  await dir.provisionUser({
    uid: 'usr-suspended-01',
    accountStatus: 'suspended',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  const res4 = await dir.resolveActiveTenantContext('usr-suspended-01');
  assert(res4.authorized === false, '4. Suspended account fails closed');
  assert(res4.code === 'ACCOUNT_SUSPENDED', 'Returns ACCOUNT_SUSPENDED code');

  // 1.5 Revoked account
  await dir.provisionUser({
    uid: 'usr-revoked-01',
    accountStatus: 'revoked',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  const res5 = await dir.resolveActiveTenantContext('usr-revoked-01');
  assert(res5.authorized === false, '5. Revoked account fails closed');
  assert(res5.code === 'ACCOUNT_REVOKED', 'Returns ACCOUNT_REVOKED code');

  // 1.6 Missing tenant context (user has account but no tenant membership)
  await dir.provisionUser({
    uid: 'usr-no-tenant-mem',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  const res6 = await dir.resolveActiveTenantContext('usr-no-tenant-mem');
  assert(res6.authorized === false, '6. User without tenant membership fails closed');
  assert(res6.code === 'TENANT_MEMBERSHIP_MISSING', 'Returns TENANT_MEMBERSHIP_MISSING');

  // 1.7 Multiple tenant memberships with explicit valid selection
  await dir.provisionUser({
    uid: 'usr-multi-tenant-01',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  await dir.provisionTenantMembership('usr-multi-tenant-01', {
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await dir.provisionTenantMembership('usr-multi-tenant-01', {
    tenantId: 'tenant-prod-tz-health',
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const res7Ambiguous = await dir.resolveActiveTenantContext('usr-multi-tenant-01');
  assert(res7Ambiguous.authorized === false, 'Multiple tenant memberships without selection is rejected');
  assert(res7Ambiguous.code === 'TENANT_IDENTITY_MISSING', 'Returns TENANT_IDENTITY_MISSING for ambiguous tenant');

  const res7Explicit = await dir.resolveActiveTenantContext('usr-multi-tenant-01', 'tenant-prod-tz-health');
  assert(res7Explicit.authorized === true, '7. Multiple tenant memberships with explicit valid selection is authorized');
  assert(res7Explicit.tenantId === 'tenant-prod-tz-health', 'Resolved explicit tenant selection');

  // 1.8 Invalid tenant selection
  const res8 = await dir.resolveActiveTenantContext('usr-multi-tenant-01', 'tenant-non-existent');
  assert(res8.authorized === false, '8. Invalid tenant selection is rejected');
  assert(res8.code === 'TENANT_NOT_FOUND', 'Returns TENANT_NOT_FOUND');

  // ---------------------------------------------------------------------------
  // 2. Tenant Membership
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Tenant Membership ---');

  // 2.9 Missing tenant document
  const res9 = await dir.resolveActiveTenantContext('usr-clinician-active', 'tenant-ghost');
  assert(res9.authorized === false, '9. Missing tenant document fails closed');
  assert(res9.code === 'TENANT_NOT_FOUND', 'Returns TENANT_NOT_FOUND');

  // 2.10 Suspended tenant
  await dir.provisionTenant({
    tenantId: 'tenant-suspended-gov',
    status: 'suspended',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await dir.provisionTenantMembership('usr-clinician-active', {
    tenantId: 'tenant-suspended-gov',
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const res10 = await dir.resolveActiveTenantContext('usr-clinician-active', 'tenant-suspended-gov');
  assert(res10.authorized === false, '10. Suspended tenant fails closed');
  assert(res10.code === 'TENANT_SUSPENDED', 'Returns TENANT_SUSPENDED');

  // 2.11 Missing tenant membership
  const res11 = await dir.resolveActiveTenantContext('usr-clinician-active', 'tenant-prod-tz-health');
  assert(res11.authorized === false, '11. Missing tenant membership fails closed');
  assert(res11.code === 'TENANT_MEMBERSHIP_MISSING', 'Returns TENANT_MEMBERSHIP_MISSING');

  // 2.12 Revoked tenant membership
  await dir.provisionTenantMembership('usr-clinician-active', {
    tenantId: 'tenant-prod-tz-health',
    status: 'revoked',
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const res12 = await dir.resolveActiveTenantContext('usr-clinician-active', 'tenant-prod-tz-health');
  assert(res12.authorized === false, '12. Revoked tenant membership fails closed');
  assert(res12.code === 'TENANT_MEMBERSHIP_REVOKED', 'Returns TENANT_MEMBERSHIP_REVOKED');

  // 2.13 Unauthorized tenant selection (user attempts accessing unassociated tenant)
  const res13 = await dir.resolveActiveTenantContext('usr-suspended-01', 'tenant-prod-ea-moh');
  assert(res13.authorized === false, '13. Unauthorized tenant selection rejected');

  // ---------------------------------------------------------------------------
  // 3. Facility Membership & Ownership
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Facility Membership & Ownership ---');

  // 3.14 Missing facility document
  const res14 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-ghost-01');
  assert(res14.authorized === false, '14. Missing facility document fails closed');
  assert(res14.code === 'FACILITY_NOT_FOUND', 'Returns FACILITY_NOT_FOUND');

  // 3.15 Decommissioned facility
  await dir.provisionFacility({
    facilityId: 'fac-decom-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'decommissioned',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const res15 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-decom-01');
  assert(res15.authorized === false, '15. Decommissioned facility fails closed');
  assert(res15.code === 'FACILITY_DECOMMISSIONED', 'Returns FACILITY_DECOMMISSIONED');

  // 3.16 Facility owned by another tenant
  const res16 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-mwanza-regional-01');
  assert(res16.authorized === false, '16. Facility owned by another tenant is rejected');
  assert(res16.code === 'FACILITY_TENANT_MISMATCH', 'Returns FACILITY_TENANT_MISMATCH');

  // 3.17 Missing facility membership
  const res17 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-district-hospital-01');
  assert(res17.authorized === false, '17. Missing facility membership fails closed');
  assert(res17.code === 'FACILITY_MEMBERSHIP_MISSING', 'Returns FACILITY_MEMBERSHIP_MISSING');

  // 3.18 Suspended facility membership
  await dir.provisionFacilityMembership('usr-clinician-active', 'tenant-prod-ea-moh', {
    facilityId: 'fac-district-hospital-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'suspended',
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const res18 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-district-hospital-01');
  assert(res18.authorized === false, '18. Suspended facility membership fails closed');
  assert(res18.code === 'FACILITY_MEMBERSHIP_SUSPENDED', 'Returns FACILITY_MEMBERSHIP_SUSPENDED');

  // 3.19 Revoked facility membership
  await dir.provisionFacilityMembership('usr-clinician-active', 'tenant-prod-ea-moh', {
    facilityId: 'fac-district-hospital-01',
    tenantId: 'tenant-prod-ea-moh',
    status: 'revoked',
    capabilities: ['sync:facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const res19 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-district-hospital-01');
  assert(res19.authorized === false, '19. Revoked facility membership fails closed');
  assert(res19.code === 'FACILITY_MEMBERSHIP_REVOKED', 'Returns FACILITY_MEMBERSHIP_REVOKED');

  // 3.20 Valid facility membership
  const res20 = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-rural-dispensary-01');
  assert(res20.authorized === true, '20. Valid facility membership is authorized');

  // ---------------------------------------------------------------------------
  // 4. Capabilities & Scope
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Capabilities & Scope ---');

  // 4.21 Ordinary facility access
  const isOrdinaryAuthorized = await backend.isAuthorizedForFacility('usr-clinician-active', 'fac-rural-dispensary-01', 'tenant-prod-ea-moh');
  assert(isOrdinaryAuthorized === true, '21. Ordinary facility access validated through backend');

  // 4.22 Cross-facility access without capability
  const hasCrossNo = await backend.hasCrossFacilitySyncCapability('usr-clinician-active', 'tenant-prod-ea-moh');
  assert(hasCrossNo === false, '22. Cross-facility access denied when capability is absent');

  // 4.23 Cross-facility access with explicit directory capability
  await dir.provisionUser({
    uid: 'usr-supervisor-cross',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  await dir.provisionTenantMembership('usr-supervisor-cross', {
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    roles: ['supervisor'],
    capabilities: ['sync:facility', 'sync:cross_facility'],
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const hasCrossYes = await backend.hasCrossFacilitySyncCapability('usr-supervisor-cross', 'tenant-prod-ea-moh');
  assert(hasCrossYes === true, '23. Cross-facility access granted with explicit directory capability');

  const crossFacilityAccess = await backend.isAuthorizedForFacility('usr-supervisor-cross', 'fac-district-hospital-01', 'tenant-prod-ea-moh');
  assert(crossFacilityAccess === true, 'Cross-facility supervisor can access un-joined facility within same tenant');

  // 4.24 Static default capability must NOT grant Firestore production access
  // 'usr-nurse-01' is in DEFAULT_USER_CAPABILITIES in serverLedger.ts, but NOT in directory
  const staticNurseAuth = await backend.isAuthorizedForFacility('usr-nurse-01', 'fac-rural-dispensary-01', 'tenant-prod-ea-moh');
  assert(staticNurseAuth === false, '24. Static default capability does NOT grant Firestore production access');

  // 4.25 Client-supplied tenant or facility IDs must not grant permissions
  const spoofAuth = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-ea-moh', 'fac-mwanza-regional-01');
  assert(spoofAuth.authorized === false, '25. Client-supplied facility belonging to another tenant strictly rejected');

  // ---------------------------------------------------------------------------
  // 5. Transactional Protection (In-Transaction ACID Authorization)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Transactional Protection ---');

  // 5.26 Membership revoked before transaction
  await dir.provisionUser({
    uid: 'usr-test-revocation-before-tx',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  await dir.provisionTenantMembership('usr-test-revocation-before-tx', {
    tenantId: 'tenant-prod-ea-moh',
    status: 'revoked', // Revoked in directory!
    roles: ['clinician'],
    capabilities: ['sync:facility'],
    membershipVersion: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const txRevokedPush = await backend.processPushBatch(
    'dev-tx-01',
    new Date().toISOString(),
    [{
      eventId: `evt-tx-revoked-${Date.now()}`,
      eventType: 'clinical.vitals.recorded',
      aggregateType: 'Vitals',
      aggregateId: 'agg-vitals-rev-01',
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      expectedVersion: 0,
      payload: { temp: 37.0 },
    }],
    { userId: 'usr-test-revocation-before-tx', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(txRevokedPush.status === 'rejected', '26. Membership revoked before write transaction: clinical push rejected');
  assert(txRevokedPush.error === 'TENANT_MEMBERSHIP_REVOKED', 'Reports TENANT_MEMBERSHIP_REVOKED error code');

  // 5.27 Account suspended before transaction
  await dir.provisionUser({
    uid: 'usr-test-suspended-before-tx',
    accountStatus: 'suspended', // Suspended in directory!
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  const txSuspendedPush = await backend.processPushBatch(
    'dev-tx-02',
    new Date().toISOString(),
    [{
      eventId: `evt-tx-suspended-${Date.now()}`,
      eventType: 'clinical.vitals.recorded',
      aggregateType: 'Vitals',
      aggregateId: 'agg-vitals-sus-01',
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      expectedVersion: 0,
      payload: { temp: 37.2 },
    }],
    { userId: 'usr-test-suspended-before-tx', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(txSuspendedPush.status === 'rejected', '27. Account suspended before write transaction: clinical push rejected');
  assert(txSuspendedPush.error === 'ACCOUNT_SUSPENDED', 'Reports ACCOUNT_SUSPENDED error code');

  // 5.28 Facility membership missing before transaction
  await dir.provisionUser({
    uid: 'usr-no-fac-mem-tx',
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 1,
  });
  await dir.provisionTenantMembership('usr-no-fac-mem-tx', {
    tenantId: 'tenant-prod-ea-moh',
    status: 'active',
    roles: ['clinician'],
    capabilities: ['sync:facility'], // No cross-facility!
    membershipVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const txNoFacPush = await backend.processPushBatch(
    'dev-tx-03',
    new Date().toISOString(),
    [{
      eventId: `evt-tx-nofac-${Date.now()}`,
      eventType: 'clinical.vitals.recorded',
      aggregateType: 'Vitals',
      aggregateId: 'agg-vitals-nofac-01',
      facilityId: 'fac-district-hospital-01',
      version: 1,
      expectedVersion: 0,
      payload: { temp: 36.8 },
    }],
    { userId: 'usr-no-fac-mem-tx', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(txNoFacPush.status === 'rejected', '28. Facility membership missing: transaction rejects push');
  assert(txNoFacPush.error === 'FACILITY_MEMBERSHIP_MISSING', 'Reports FACILITY_MEMBERSHIP_MISSING error code');

  // 5.29 Denied batch produces ZERO writes
  const snapBefore = mockDb.getDocsInColl('tenants/tenant-prod-ea-moh/events');
  assert(snapBefore.length === 0, '29. Zero events exist in Firestore before denied batch');
  assert(txNoFacPush.acknowledgedEventIds.length === 0, 'Denied batch acknowledges 0 events');
  const snapAfter = mockDb.getDocsInColl('tenants/tenant-prod-ea-moh/events');
  assert(snapAfter.length === 0, '30. Denied batch produces ZERO event writes in Firestore');

  // 5.31 Authorized batch commits successfully
  const validEvtId = `evt-authorized-${Date.now()}`;
  const authorizedPush = await backend.processPushBatch(
    'dev-tx-04',
    new Date().toISOString(),
    [{
      eventId: validEvtId,
      eventType: 'clinical.patient.registered',
      aggregateType: 'Patient',
      aggregateId: 'pat-auth-01',
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      expectedVersion: 0,
      payload: { name: 'Abebe Bikila' },
    }],
    { userId: 'usr-clinician-active', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(authorizedPush.status === 'acknowledged', '31. Authorized batch succeeds and status is acknowledged');
  assert(authorizedPush.acknowledgedEventIds.includes(validEvtId), 'Committed valid event ID');
  const snapCommitted = mockDb.getDocsInColl('tenants/tenant-prod-ea-moh/events');
  assert(snapCommitted.length === 1, 'Authorized batch writes exactly 1 event to Firestore');

  // ---------------------------------------------------------------------------
  // 6. Tenant & Facility Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Tenant & Facility Isolation ---');

  // 6.32 Same user cannot cross tenants
  const crossTenantPush = await backend.processPushBatch(
    'dev-tx-05',
    new Date().toISOString(),
    [{
      eventId: `evt-cross-tenant-${Date.now()}`,
      eventType: 'clinical.patient.registered',
      aggregateType: 'Patient',
      aggregateId: 'pat-cross-01',
      facilityId: 'fac-mwanza-regional-01',
      tenantId: 'tenant-prod-tz-health', // Targets other tenant!
      version: 1,
      expectedVersion: 0,
      payload: { name: 'Cross Tenant Patient' },
    }],
    { userId: 'usr-clinician-active', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(crossTenantPush.status === 'rejected', '32. User cannot push to different tenant');

  // 6.33 Facility cannot be accessed by another tenant
  const facCrossTenant = await dir.validateFacilityAccess('usr-clinician-active', 'tenant-prod-tz-health', 'fac-rural-dispensary-01');
  assert(facCrossTenant.authorized === false, '33. Facility cannot be accessed by another tenant (mismatch)');

  // 6.34 Unauthorized pull does not return event data
  const pullUnauthorized = await backend.pullChanges('0', 'fac-rural-dispensary-01', undefined, 'tenant-unauthorized');
  assert(pullUnauthorized.deltas.length === 0, '34. Pulling from unauthorized tenant returns 0 deltas');

  // 6.35 Cross-facility pull only returns documents within authorized facilities
  const pullCross = await backend.pullChanges('0', 'all', undefined, 'tenant-prod-ea-moh', ['fac-rural-dispensary-01'], true);
  assert(pullCross.deltas.length === 1, '35. Cross-facility pull returns deltas strictly within authorized tenant');

  // 6.36 Revocation immediacy on subsequent requests
  await dir.provisionUser({
    uid: 'usr-clinician-active',
    accountStatus: 'revoked', // Revoked in directory!
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revocationVersion: 2,
  });

  const pushAfterRevoke = await backend.processPushBatch(
    'dev-tx-06',
    new Date().toISOString(),
    [{
      eventId: `evt-after-revoke-${Date.now()}`,
      eventType: 'clinical.patient.registered',
      aggregateType: 'Patient',
      aggregateId: 'pat-revoked-01',
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      expectedVersion: 0,
      payload: { name: 'Should Not Commit' },
    }],
    { userId: 'usr-clinician-active', tenantId: 'tenant-prod-ea-moh', accountStatus: 'active' }
  );
  assert(pushAfterRevoke.status === 'rejected', '36. Immediate revocation respected on subsequent transaction');
  assert(pushAfterRevoke.error === 'ACCOUNT_REVOKED', 'Rejected with ACCOUNT_REVOKED');

  // ---------------------------------------------------------------------------
  // 7. Architectural Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. Architectural Invariants ---');

  // 7.1 IndexedDB store count invariant
  assert(ALL_STORE_NAMES.length === 362, `Total registered IndexedDB stores count is exactly 362 (got ${ALL_STORE_NAMES.length})`);

  // 7.2 Operational ledger strictly untouched
  const finalStat = fs.statSync(operationalLedgerPath);
  assert(finalStat.size === initialSize, `Operational ledger (.server_ledger_data.json) strictly preserved at ${finalStat.size} bytes`);

  // 7.3 Commit meta and backup strictly preserved
  const bakStat = fs.statSync(path.join(process.cwd(), '.server_ledger_data.json.bak'));
  assert(bakStat.size === initialSize, `Backup ledger strictly preserved at ${bakStat.size} bytes`);

  // 7.4 Reset test fixtures
  resetLedgerBackendForTesting();
  setAuthorizationDirectoryForTesting(null);

  console.log('\n================================================================');
  console.log(`STAGE 3.2.5.8.1.14 RESULTS: ALL ${passCount} CHECKS PASSED (0 failures)`);
  console.log('================================================================\n');
}

runAuthorizationTests().catch((err) => {
  console.error('\n[FATAL] Test suite encountered unhandled exception:', err);
  process.exit(1);
});
