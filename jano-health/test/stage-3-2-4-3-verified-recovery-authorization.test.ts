/**
 * JANO HEALTH — STAGE 3.2.4.3 TEST SUITE
 * VERIFIED RECOVERY AUTHORIZATION & TRUSTED PRINCIPAL ENFORCEMENT
 * 
 * Verifies that:
 * 1. Caller-constructed object literals (e.g. { userId, roles: ['system_administrator'] })
 *    are strictly rejected from isAuthorizedForLedgerRecovery, adminForceReset, and reconcileAndResume.
 * 2. Cloned, serialized, or shallow-copied objects are strictly rejected (reference identity enforced).
 * 3. Tampering with registered non-admin principals cannot elevate privileges.
 * 4. Genuine development principals work in development/test environment.
 * 5. Production mode blocks development principals while allowing genuine Firebase-authenticated administrators.
 * 6. HTTP middleware (requireLedgerRecoveryAuth) strictly enforces trusted principal provenance.
 */

import assert from 'node:assert';
import fs from 'fs';
import { serverLedger, isAuthorizedForLedgerRecovery } from '../server/serverLedger';
import {
  DEVELOPMENT_PRINCIPALS,
  requireLedgerRecoveryAuth,
} from '../server/authMiddleware';
import {
  registerServerAuthenticatedPrincipal,
  getTrustedPrincipalData,
  isServerAuthenticatedPrincipal,
} from '../server/trustedPrincipal';

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

async function runStage3243Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.3: VERIFIED RECOVERY AUTHORIZATION TEST SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  };

  const cleanAllLedgerFiles = () => {
    const ledgerPath = serverLedger.getLedgerFilePath();
    const backupPath = serverLedger.getBackupFilePath();
    const markerPath = serverLedger.getEstablishedMarkerPath();
    const auditPath = serverLedger.getRecoveryAuditPath();
    const resetTxPath = serverLedger.getResetTransactionPath();
    const commitMetaPath = serverLedger.getCommitMetadataPath();

    for (const p of [ledgerPath, backupPath, markerPath, auditPath, resetTxPath, commitMetaPath]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
    }

    const dir = process.cwd();
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (f.startsWith('.server_ledger_') && f.endsWith('.archived')) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    serverLedger.reloadFromDisk();
    serverLedger.adminForceReset(DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'], 'Clean test baseline');
  };

  try {
    cleanAllLedgerFiles();

    // ------------------------------------------------------------------
    console.log('--- Group 1: Rejection of Caller-Constructed & Forged Principals ---');
    // ------------------------------------------------------------------

    await test('1. Unregistered object literal with system_administrator role is rejected', () => {
      const forgedPrincipal = {
        userId: 'arbitrary-attacker',
        roles: ['system_administrator'],
      };

      assert.strictEqual(
        isAuthorizedForLedgerRecovery(forgedPrincipal),
        false,
        'Caller-constructed object literal must never be authorized'
      );

      assert.throws(
        () => serverLedger.adminForceReset(forgedPrincipal, 'Malicious reset attempt'),
        /UNAUTHORIZED/,
        'adminForceReset must reject unregistered caller-constructed object literal'
      );

      assert.throws(
        () => serverLedger.reconcileAndResume(forgedPrincipal),
        /UNAUTHORIZED/,
        'reconcileAndResume must reject unregistered caller-constructed object literal'
      );
    });

    await test('2. Forged object literal matching known sysadmin userId is rejected', () => {
      const forgedSysAdmin = {
        userId: 'usr-sysadmin-amanuel',
        roles: ['system_administrator', 'admin'],
        provider: 'local_development',
        accountStatus: 'active',
      };

      assert.strictEqual(
        isAuthorizedForLedgerRecovery(forgedSysAdmin),
        false,
        'Object literal with matching sysadmin fields must be rejected without server registration'
      );

      assert.throws(
        () => serverLedger.adminForceReset(forgedSysAdmin, 'Spoofed sysadmin attempt'),
        /UNAUTHORIZED/,
        'adminForceReset must reject forged sysadmin object literal'
      );
    });

    await test('3. Shallow clone ({ ...sysAdmin }) is rejected due to lost reference identity', () => {
      const genuine = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
      const shallowClone = { ...genuine };

      assert.strictEqual(
        isAuthorizedForLedgerRecovery(shallowClone),
        false,
        'Shallow clone of genuine principal must NOT inherit trusted provenance'
      );

      assert.throws(
        () => serverLedger.adminForceReset(shallowClone, 'Shallow clone reset attempt'),
        /UNAUTHORIZED/,
        'adminForceReset must reject shallow clones'
      );
    });

    await test('4. Serialized / JSON-parsed clone is rejected', () => {
      const genuine = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
      const jsonClone = JSON.parse(JSON.stringify(genuine));

      assert.strictEqual(
        isAuthorizedForLedgerRecovery(jsonClone),
        false,
        'JSON serialized/deserialized clone must NOT inherit trusted provenance'
      );

      assert.throws(
        () => serverLedger.adminForceReset(jsonClone, 'JSON clone reset attempt'),
        /UNAUTHORIZED/,
        'adminForceReset must reject JSON clones'
      );
    });

    await test('5. Object.assign clone is rejected', () => {
      const genuine = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
      const assignedClone = Object.assign({}, genuine);

      assert.strictEqual(
        isAuthorizedForLedgerRecovery(assignedClone),
        false,
        'Object.assign clone must NOT inherit trusted provenance'
      );
    });

    // ------------------------------------------------------------------
    console.log('--- Group 2: Tamper Resistance on Registered Principals ---');
    // ------------------------------------------------------------------

    await test('6. Attempting to elevate non-admin principal by mutating roles is prevented', () => {
      const clinician = DEVELOPMENT_PRINCIPALS['usr-doctor-01'];

      // Principal is frozen, attempting to assign roles will throw in strict mode or fail
      assert.throws(
        () => {
          (clinician as any).roles = ['system_administrator'];
        },
        /Cannot assign to read only property|Cannot set property/,
        'Registered principal properties must be frozen'
      );

      // Verify that even if someone accessed the internal registry, verified roles remain authoritative
      const data = getTrustedPrincipalData(clinician);
      assert.ok(data);
      assert.deepStrictEqual(data!.roles, ['physician']);
      assert.strictEqual(isAuthorizedForLedgerRecovery(clinician), false);
    });

    await test('7. Facility administrator role remains rejected even when registered', () => {
      const facAdmin = DEVELOPMENT_PRINCIPALS['usr-facadmin-meron'];
      assert.strictEqual(isServerAuthenticatedPrincipal(facAdmin), true);
      assert.strictEqual(
        isAuthorizedForLedgerRecovery(facAdmin),
        false,
        'facility_administrator must never possess global ledger recovery privileges'
      );
    });

    await test('8. Suspended or revoked accounts remain rejected even when registered', () => {
      const suspended = DEVELOPMENT_PRINCIPALS['usr-suspended-test'];
      const revoked = DEVELOPMENT_PRINCIPALS['usr-revoked-test'];

      assert.strictEqual(isAuthorizedForLedgerRecovery(suspended), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery(revoked), false);
    });

    // ------------------------------------------------------------------
    console.log('--- Group 3: Genuine Server-Validated Principals in Dev & Prod ---');
    // ------------------------------------------------------------------

    await test('9. Genuine server-authenticated development sysadmin is authorized in dev mode', () => {
      const sysAdmin = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
      assert.strictEqual(isServerAuthenticatedPrincipal(sysAdmin), true);
      assert.strictEqual(isAuthorizedForLedgerRecovery(sysAdmin), true);

      // Can execute adminForceReset cleanly
      serverLedger.adminForceReset(sysAdmin, 'Authorized reset test');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    await test('10. Genuine Firebase authenticated system_administrator is authorized', () => {
      // Simulate server-authenticated principal minted from verified Firebase ID token
      const firebaseSysAdmin = registerServerAuthenticatedPrincipal({
        userId: 'firebase-uid-sysadmin-99',
        provider: 'firebase_auth' as const,
        roles: ['system_administrator'],
        facilityIds: ['fac-kigoma-dh'],
        email: 'sysadmin@firebase.local',
      });

      assert.strictEqual(isServerAuthenticatedPrincipal(firebaseSysAdmin), true);
      assert.strictEqual(isAuthorizedForLedgerRecovery(firebaseSysAdmin), true);

      // Non-admin Firebase principal is rejected
      const firebaseClinician = registerServerAuthenticatedPrincipal({
        userId: 'firebase-uid-doc-88',
        provider: 'firebase_auth' as const,
        roles: ['clinician'],
        facilityIds: ['fac-kigoma-dh'],
        email: 'doc@firebase.local',
      });

      assert.strictEqual(isAuthorizedForLedgerRecovery(firebaseClinician), false);
    });

    await test('11. In production mode, development principals are strictly rejected', () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';

        const sysAdminDev = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
        assert.strictEqual(
          isAuthorizedForLedgerRecovery(sysAdminDev),
          false,
          'Development principal must be rejected in production mode'
        );

        // However, genuine Firebase authenticated administrator remains authorized in production
        const prodFirebaseAdmin = registerServerAuthenticatedPrincipal({
          userId: 'firebase-prod-sysadmin-01',
          provider: 'firebase_auth' as const,
          roles: ['system_administrator'],
          facilityIds: ['fac-kigoma-dh'],
        });

        assert.strictEqual(
          isAuthorizedForLedgerRecovery(prodFirebaseAdmin),
          true,
          'Firebase authenticated admin must be authorized in production mode'
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    // ------------------------------------------------------------------
    console.log('--- Group 4: HTTP Middleware Boundary (requireLedgerRecoveryAuth) ---');
    // ------------------------------------------------------------------

    await test('12. requireLedgerRecoveryAuth returns 401 when unauthenticated', () => {
      const req: any = { headers: {}, body: {} };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
    });

    await test('13. requireLedgerRecoveryAuth returns 403 when principal is forged / caller-constructed', () => {
      const req: any = {
        headers: {},
        authenticatedPrincipal: {
          userId: 'attacker-injected',
          roles: ['system_administrator'],
        },
      };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.error, 'FORBIDDEN');
    });

    await test('14. requireLedgerRecoveryAuth returns 403 for authenticated clinician', () => {
      const req: any = {
        headers: {},
        authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-doctor-01'],
      };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.error, 'FORBIDDEN');
    });

    await test('15. requireLedgerRecoveryAuth succeeds for genuine server-validated sysadmin', () => {
      const req: any = {
        headers: {},
        authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'],
      };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(res.statusCode, 200);
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/15 STAGE 3.2.4.3 VERIFIED RECOVERY AUTHORIZATION TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllLedgerFiles();
  }
}

runStage3243Tests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
