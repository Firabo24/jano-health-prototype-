/**
 * Jano Health — Stage 3.2.2 Verification Test Suite
 * Recovery Completeness Proof & Authorization Hardening
 *
 * Verifies:
 * 1. Attempting to reconcile a stale backup when acknowledged events are known to be missing fails to return the ledger to NORMAL.
 * 2. A ledger remains in a restricted recovery state when historical completeness cannot be proved.
 * 3. Completeness verification succeeds only when candidate recovery state demonstrably preserves required acknowledged events and sequence continuity.
 * 4. An explicit loss-acknowledging override records the gap in durable metadata and requires explicit non-default parameters.
 * 5. facility_administrator is strictly rejected when attempting to clear global ledger recovery gates or force-reset the ledger.
 * 6. system_administrator (and designated system authority) can perform authorized recovery actions.
 * 7. Authorization is enforced consistently in both direct ledger calls and HTTP endpoints.
 * 8. Existing valid tests continue to pass.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DEFAULT_TENANT_ID } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS, requireLedgerRecoveryAuth } from '../server/authMiddleware';

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

async function runStage322RecoveryCompletenessTests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.2: RECOVERY COMPLETENESS PROOF & RBAC HARDENING');
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

  const clinician = DEVELOPMENT_PRINCIPALS['usr-doctor-01'];
  const facAdmin = DEVELOPMENT_PRINCIPALS['usr-facadmin-meron'];
  const sysAdmin = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
  const legacyAdmin = DEVELOPMENT_PRINCIPALS['usr-admin-01'];
  const testFacility = 'fac-rural-dispensary-01';

  const cleanAllLedgerFiles = () => {
    const ledgerPath = serverLedger.getLedgerFilePath();
    const backupPath = serverLedger.getBackupFilePath();
    const markerPath = serverLedger.getEstablishedMarkerPath();
    const commitMetaPath = serverLedger.getCommitMetadataPath();
    const auditPath = serverLedger.getRecoveryAuditPath();
    try { if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath); } catch {}
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch {}
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch {}
    try { if (fs.existsSync(commitMetaPath)) fs.unlinkSync(commitMetaPath); } catch {}
    try { if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath); } catch {}
    try {
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    } catch {}
    serverLedger.adminForceReset(sysAdmin, 'Clean test baseline');
  };

  try {
    cleanAllLedgerFiles();

    // ------------------------------------------------------------------
    console.log('--- Group 1: Role Scoping & Authorization Hardening ---');
    // ------------------------------------------------------------------

    await test('facility_administrator is strictly rejected from reconcileAndResume()', () => {
      // Put ledger in RECOVERY_REQUIRED
      const ledgerPath = serverLedger.getLedgerFilePath();
      fs.writeFileSync(ledgerPath, '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // facility_administrator must throw UNAUTHORIZED
      assert.throws(
        () => serverLedger.reconcileAndResume(facAdmin),
        /UNAUTHORIZED/,
        'facility_administrator must be rejected from reconcileAndResume'
      );
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Clean up and restore baseline
      serverLedger.adminForceReset(sysAdmin, 'Restore normal');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    await test('facility_administrator is strictly rejected from adminForceReset()', () => {
      assert.throws(
        () => serverLedger.adminForceReset(facAdmin, 'Attempted facility admin reset'),
        /UNAUTHORIZED/,
        'facility_administrator must be rejected from adminForceReset'
      );
    });

    await test('requireLedgerRecoveryAuth HTTP middleware denies facility_administrator with 403', () => {
      const req: any = {
        authenticatedPrincipal: facAdmin,
        headers: {},
      };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false, 'Next must not be called for facility_administrator');
      assert.strictEqual(res.statusCode, 403, 'Must respond with 403 FORBIDDEN');
      assert.strictEqual(res.body.error, 'FORBIDDEN');
    });

    await test('requireLedgerRecoveryAuth HTTP middleware denies unauthenticated requests with 401', () => {
      const req: any = { headers: {} };
      const res = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
    });

    await test('requireLedgerRecoveryAuth HTTP middleware authorizes system_administrator and system authority', () => {
      // 1. system_administrator
      const req1: any = {
        authenticatedPrincipal: sysAdmin,
        headers: {},
      };
      const res1 = mockRes();
      let nextCalled1 = false;
      requireLedgerRecoveryAuth(req1, res1, () => { nextCalled1 = true; });
      assert.strictEqual(nextCalled1, true, 'system_administrator must pass');

      // 2. legacy system admin
      const req2: any = {
        authenticatedPrincipal: legacyAdmin,
        headers: {},
      };
      const res2 = mockRes();
      let nextCalled2 = false;
      requireLedgerRecoveryAuth(req2, res2, () => { nextCalled2 = true; });
      assert.strictEqual(nextCalled2, true, 'legacy admin with system_administrator role must pass');

      // 3. server-level system authority
      const req3: any = {
        authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-system'],
        headers: {},
      };
      const res3 = mockRes();
      let nextCalled3 = false;
      requireLedgerRecoveryAuth(req3, res3, () => { nextCalled3 = true; });
      assert.strictEqual(nextCalled3, true, 'system authority must pass');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 2: Stale Backup & Missing Acknowledged Events Detection ---');
    // ------------------------------------------------------------------

    await test('Reconciling a stale backup when acknowledged events are missing fails promotion to NORMAL', () => {
      cleanAllLedgerFiles();

      // 1. Commit Event 1 (sequence 1)
      const pushRes1 = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-audit-seq1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-audit-01',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Initial Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(pushRes1.status, 'acknowledged');

      // 2. Capture backup at sequence 1 (this represents the stale snapshot)
      const staleBackupContent = fs.readFileSync(serverLedger.getBackupFilePath(), 'utf-8');

      // 3. Commit Event 2 (sequence 2) into primary ledger
      const pushRes2 = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-audit-seq2',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-audit-01',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'Updated Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(pushRes2.status, 'acknowledged');

      // 4. Overwrite backup with older stale snapshot (simulating stale backup defect)
      fs.writeFileSync(serverLedger.getBackupFilePath(), staleBackupContent, 'utf-8');

      // 5. Corrupt primary ledger file (so system falls back to the stale backup)
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ INVALID_PRIMARY_DATA_CORRUPT: true', 'utf-8');

      // 6. Reload from disk -> system must enter RECOVERY_REQUIRED
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // 7. Verify recovery completeness check detects missing sequence 2
      const completeness = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(completeness.verified, false);
      assert.strictEqual(completeness.status, 'MISSING_ACKNOWLEDGED_EVENTS');
      assert.ok(completeness.missingSequences.includes(2), 'Missing sequence 2 must be detected');
      assert.ok(completeness.missingEventIds.includes('evt-audit-seq2'), 'Missing event ID must be detected');

      // 8. Reconcile attempt without explicit data loss confirmation MUST THROW
      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, 'Standard reconciliation attempt'),
        /CANNOT_PROMOTE_RECOVERY/,
        'Reconcile must fail closed when acknowledged events are missing'
      );

      // 9. Operational state MUST remain restricted in RECOVERY_REQUIRED
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // 10. Normal writes must still be strictly blocked
      const writeAttempt = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-blocked-mutation',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-audit-01',
        facilityId: testFacility,
        version: 3,
        payload: { name: 'Blocked Mutation' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(writeAttempt.status, 'error');
      assert.strictEqual(writeAttempt.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(writeAttempt.acknowledgedEventIds.length, 0);

      // Clean up quarantined test files
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 3: Unverified / Incomplete Evidence Protection ---');
    // ------------------------------------------------------------------

    await test('Ledger remains in RECOVERY_REQUIRED when completeness cannot be proved', () => {
      cleanAllLedgerFiles();

      // Commit event 1
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-unverified-test',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-unverified',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Unverified Test' },
        timestamp: new Date().toISOString(),
      }], clinician);

      // Corrupt primary with zero sequences
      fs.writeFileSync(serverLedger.getLedgerFilePath(), 'RANDOM_BYTES_NO_SEQUENCE_NUMBERS', 'utf-8');

      // Delete commit metadata file (simulating loss of external commit proof)
      const commitMetaPath = serverLedger.getCommitMetadataPath();
      if (fs.existsSync(commitMetaPath)) fs.unlinkSync(commitMetaPath);

      // Reload
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Check completeness: cannot be proved
      const completeness = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(completeness.verified, false);
      assert.strictEqual(completeness.status, 'UNVERIFIED_INCOMPLETE_EVIDENCE');

      // Ordinary reconcile must be refused
      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, 'Standard reconcile'),
        /CANNOT_PROMOTE_RECOVERY/,
        'Must refuse promotion when completeness cannot be proved'
      );
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 4: Completeness Verification & Safe Normal Promotion ---');
    // ------------------------------------------------------------------

    await test('Completeness verification succeeds when candidate snapshot preserves acknowledged events', () => {
      cleanAllLedgerFiles();

      // Commit event
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-proven-complete',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-complete',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Proven Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(pushRes.status, 'acknowledged');

      // Corrupt primary (backup has identical committed state and commit metadata matches)
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ INVALID_PRIMARY_DATA: true', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Verify completeness: commit metadata matches candidate backup
      const completeness = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(completeness.verified, true);
      assert.strictEqual(completeness.status, 'VERIFIED_COMPLETE');
      assert.strictEqual(completeness.missingSequences.length, 0);

      // Reconciliation succeeds cleanly
      const outcome = serverLedger.reconcileAndResume(sysAdmin, 'Verified complete snapshot');
      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.operationalState, 'NORMAL');
      assert.strictEqual(outcome.dataLossAcknowledged, false);
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Normal writes proceed smoothly
      const postReconcilePush = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-post-proven-push',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-complete',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'Proven Patient v2' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(postReconcilePush.status, 'acknowledged');

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 5: Specialized Administrative Override with Explicit Confirmation ---');
    // ------------------------------------------------------------------

    await test('Explicit loss-acknowledging override requires exact confirmation and records gap in durable metadata', () => {
      cleanAllLedgerFiles();

      // Commit event 1
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-gap-1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-gap',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Gap Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);

      const staleBackup = fs.readFileSync(serverLedger.getBackupFilePath(), 'utf-8');

      // Commit event 2
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-gap-2',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-gap',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'Gap Patient v2' },
        timestamp: new Date().toISOString(),
      }], clinician);

      // Set stale backup (only has event 1)
      fs.writeFileSync(serverLedger.getBackupFilePath(), staleBackup, 'utf-8');
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ CORRUPT_PRIMARY: true', 'utf-8');

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // 1. Partial/invalid override parameters are REJECTED
      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, {
          allowDataLoss: false,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        }),
        /CANNOT_PROMOTE_RECOVERY/,
        'Must reject if allowDataLoss is false'
      );

      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, {
          allowDataLoss: true,
          acknowledgeGapsConfirmation: 'wrong_confirmation_phrase',
        }),
        /CANNOT_PROMOTE_RECOVERY/,
        'Must reject if confirmation phrase does not match'
      );

      // 2. Override attempted by facility admin is REJECTED
      assert.throws(
        () => serverLedger.reconcileAndResume(facAdmin, {
          allowDataLoss: true,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        }),
        /UNAUTHORIZED/,
        'Facility administrator cannot perform explicit override'
      );

      // 3. Authorized override by system admin SUCCEEDS
      const overrideOutcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        notes: 'Clinical supervisor verified sequence 2 can be re-entered manually',
      });

      assert.strictEqual(overrideOutcome.success, false);
      assert.strictEqual(overrideOutcome.operationalState, 'RECOVERY_REQUIRED');
      assert.strictEqual(overrideOutcome.dataLossAcknowledged, true);
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // 4. Verify durable metadata records the gap
      const recoveryInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recoveryInfo.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(recoveryInfo.dataLossAcknowledged, true);
      assert.ok(Array.isArray(recoveryInfo.acknowledgedGaps));
      assert.ok(recoveryInfo.acknowledgedGaps.includes(2), 'Durable metadata must record missing sequence 2');
      assert.strictEqual(recoveryInfo.authorizedBy, sysAdmin.userId);

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 6: HTTP Route Consistency & Diagnostics ---');
    // ------------------------------------------------------------------

    await test('HTTP POST /api/sync/recovery/reconcile rejects missing events with 400 and succeeds with valid override', () => {
      cleanAllLedgerFiles();

      // Create missing events condition
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-http-1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-http',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'HTTP Test' },
        timestamp: new Date().toISOString(),
      }], clinician);

      const staleBackup = fs.readFileSync(serverLedger.getBackupFilePath(), 'utf-8');

      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-http-2',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-http',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'HTTP Test v2' },
        timestamp: new Date().toISOString(),
      }], clinician);

      fs.writeFileSync(serverLedger.getBackupFilePath(), staleBackup, 'utf-8');
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ CORRUPT', 'utf-8');
      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Simulate HTTP handler for POST /api/sync/recovery/reconcile
      const reqFail: any = {
        body: { notes: 'Standard attempt' },
        authenticatedPrincipal: sysAdmin,
      };
      const resFail = mockRes();

      try {
        const outcome = serverLedger.reconcileAndResume(reqFail.authenticatedPrincipal, {
          notes: reqFail.body.notes,
          allowDataLoss: reqFail.body.allowDataLoss,
          acknowledgeGapsConfirmation: reqFail.body.acknowledgeGapsConfirmation,
        });
        resFail.json(outcome);
      } catch (err: any) {
        resFail.status(400).json({
          error: 'RECONCILIATION_FAILED',
          message: err.message,
          operationalState: serverLedger.getOperationalState(),
          recoveryInfo: serverLedger.getRecoveryInfo(),
        });
      }

      assert.strictEqual(resFail.statusCode, 400);
      assert.strictEqual(resFail.body.error, 'RECONCILIATION_FAILED');
      assert.ok(resFail.body.message.includes('CANNOT_PROMOTE_RECOVERY'));

      // Now call HTTP handler with explicit override parameters
      const reqSuccess: any = {
        body: {
          notes: 'Admin accepted gap via UI',
          allowDataLoss: true,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        },
        authenticatedPrincipal: sysAdmin,
      };
      const resSuccess = mockRes();

      try {
        const outcome = serverLedger.reconcileAndResume(reqSuccess.authenticatedPrincipal, {
          notes: reqSuccess.body.notes,
          allowDataLoss: reqSuccess.body.allowDataLoss,
          acknowledgeGapsConfirmation: reqSuccess.body.acknowledgeGapsConfirmation,
        });
        resSuccess.json(outcome);
      } catch (err: any) {
        resSuccess.status(400).json({ error: 'RECONCILIATION_FAILED', message: err.message });
      }

      assert.strictEqual(resSuccess.statusCode, 200);
      assert.strictEqual(resSuccess.body.operationalState, 'RECOVERY_REQUIRED');
      assert.strictEqual(resSuccess.body.success, false);
      assert.strictEqual(resSuccess.body.dataLossAcknowledged, true);

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.2 RECOVERY COMPLETENESS & RBAC TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllLedgerFiles();
  }
}

runStage322RecoveryCompletenessTests().catch((err) => {
  console.error('\nStage 3.2.2 Test Suite Failed:', err);
  process.exit(1);
});
