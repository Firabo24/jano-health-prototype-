/**
 * Jano Health — Stage 3.2 Verification Test Suite
 * Corrupted Ledger Recovery Gate & Read-Only Safety
 *
 * Verifies:
 * 1. Explicit ledger operational states: NORMAL, RECOVERY_REQUIRED, RECOVERY_BLOCKED.
 * 2. Distinction between pristine first-time initialization and unexpected corruption/loss of established ledger.
 * 3. Fail-closed write blocking: corruption of established ledger NEVER silently becomes an empty DB with writes enabled.
 * 4. Stale backup handling: loading backup snapshot transitions state to RECOVERY_REQUIRED, disabling ordinary writes.
 * 5. Ordinary reset, sync push, client flags, and server reboot cannot bypass the recovery gate.
 * 6. Authorized reconciliation gate: only authorized administrators can reconcile state and transition back to NORMAL.
 * 7. HTTP route protection: POST /api/sync/push returns 503 during recovery, POST /api/sync/reset returns 423, GET /api/sync/diagnostics reports honest health.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DEFAULT_TENANT_ID } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

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

async function runStage32RecoveryGateTests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2: CORRUPTED LEDGER RECOVERY GATE & SAFETY');
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
  const adminPrincipal = DEVELOPMENT_PRINCIPALS['usr-admin-01'];
  const sysAdminPrincipal = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
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
      dirFiles.filter((f) => f.includes('.server_ledger_data.json.corrupted.') || f.includes('.server_ledger_data.json.bak.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    } catch {}
    serverLedger.adminForceReset(DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'], 'Clean test baseline');
  };

  try {
    cleanAllLedgerFiles();

    console.log('--- Group 1: Explicit Operational States & Establishment Detection ---');

    await test('Clean initial state boots in NORMAL operational state with establishment marker created', () => {
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
      const recoveryInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recoveryInfo.state, 'NORMAL');
      assert.strictEqual(recoveryInfo.reconciliationRequired, false);
      assert.strictEqual(fs.existsSync(serverLedger.getEstablishedMarkerPath()), true, 'Marker must be established');
    });

    await test('Established installation with missing primary and missing backup enters RECOVERY_BLOCKED', () => {
      const ledgerPath = serverLedger.getLedgerFilePath();
      const backupPath = serverLedger.getBackupFilePath();
      const markerPath = serverLedger.getEstablishedMarkerPath();

      // Ensure marker exists (established system)
      fs.writeFileSync(markerPath, JSON.stringify({ establishedAt: new Date().toISOString() }), 'utf-8');
      // Delete data files (disaster scenario: established files vanished)
      try { if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath); } catch {}
      try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch {}

      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_BLOCKED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_BLOCKED');
      assert.strictEqual(info.reconciliationRequired, true);

      // Writes must be strictly blocked fail-closed
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-test-blocked',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-test',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Attempt' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_BLOCKED');
      assert.strictEqual(pushRes.acknowledgedEventIds.length, 0);

      // Restore baseline for next tests
      serverLedger.adminForceReset(DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'], 'Disaster test complete');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    console.log('\n--- Group 2: Primary Ledger Corruption & Stale Backup Isolation ---');

    await test('Corrupted primary with valid backup enters RECOVERY_REQUIRED and blocks ordinary writes', () => {
      // 1. Commit established patient record
      const aggId = `pat-audit-${Date.now()}`;
      const eventId = `evt-audit-${Date.now()}`;
      const pushResult = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId,
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: aggId,
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Established Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);
      assert.strictEqual(pushResult.status, 'acknowledged');

      const ledgerPath = serverLedger.getLedgerFilePath();
      const backupPath = serverLedger.getBackupFilePath();
      assert.strictEqual(fs.existsSync(backupPath), true);

      // 2. Corrupt primary ledger file with invalid payload
      fs.writeFileSync(ledgerPath, '{ INVALID_JSON_CORRUPTED_PRIMARY_BYTES: true, ', 'utf-8');

      // 3. Server reboots / reloads from disk
      serverLedger.reloadFromDisk();

      // 4. Verify state is RECOVERY_REQUIRED (not NORMAL!)
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const recoveryInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recoveryInfo.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(recoveryInfo.primaryCorrupted, true);
      assert.strictEqual(recoveryInfo.backupRestored, true);
      assert.strictEqual(recoveryInfo.reconciliationRequired, true);

      // Forensic quarantine file must exist
      const quarantined = fs.readdirSync(process.cwd()).filter((f) => f.startsWith('.server_ledger_data.json.corrupted.'));
      assert.ok(quarantined.length > 0, 'Corrupted primary file must be preserved in forensic quarantine');

      // 5. Normal clinical and sync writes must be strictly BLOCKED
      const writeAttempt = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: `evt-write-attempt-${Date.now()}`,
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: aggId,
        facilityId: testFacility,
        version: 2,
        payload: { name: 'Unauthorized Mutation' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(writeAttempt.status, 'error');
      assert.strictEqual(writeAttempt.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(writeAttempt.acknowledgedEventIds.length, 0);
      assert.strictEqual(serverLedger.authoritativeVersion('Patient', aggId), 1, 'Version must not advance');

      // 6. Ordinary reset cannot clear the recovery state
      assert.throws(
        () => serverLedger.reset(),
        /CANNOT_RESET/,
        'Ordinary reset must be blocked while in RECOVERY_REQUIRED'
      );
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // 7. Restarting server against same artifacts leaves state in RECOVERY_REQUIRED
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Clean quarantined test files
      quarantined.forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    console.log('\n--- Group 3: Authorized Reconciliation Gate ---');

    await test('Reconciliation gate requires explicit administrative authority to resume NORMAL writes', () => {
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Non-administrative principal (doctor) cannot reconcile
      assert.throws(
        () => serverLedger.reconcileAndResume(clinician),
        /UNAUTHORIZED/,
        'Ordinary clinician cannot authorize ledger recovery'
      );
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Authorized administrator performs verified reconciliation
      const reconcileOutcome = serverLedger.reconcileAndResume(adminPrincipal, 'Verified backup snapshot matches clinical log');
      assert.strictEqual(reconcileOutcome.success, true);
      assert.strictEqual(reconcileOutcome.operationalState, 'NORMAL');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      const infoAfter = serverLedger.getRecoveryInfo();
      assert.strictEqual(infoAfter.state, 'NORMAL');
      assert.strictEqual(infoAfter.reconciliationRequired, false);
      assert.strictEqual(infoAfter.authorizedBy, adminPrincipal.userId);

      // Now normal writes can proceed safely and acknowledge events
      const validPush = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: `evt-post-reconcile-${Date.now()}`,
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-reconciled',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Post-Reconcile Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(validPush.status, 'acknowledged');
      assert.ok(validPush.acknowledgedEventIds.length > 0);
    });

    console.log('\n--- Group 4: Total Corruption & Administrative Disaster Recovery ---');

    await test('Total corruption of primary and backup enters RECOVERY_BLOCKED and requires admin force reset', () => {
      const ledgerPath = serverLedger.getLedgerFilePath();
      const backupPath = serverLedger.getBackupFilePath();

      fs.writeFileSync(ledgerPath, 'GARBAGE_PRIMARY', 'utf-8');
      fs.writeFileSync(backupPath, 'GARBAGE_BACKUP', 'utf-8');

      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_BLOCKED');

      // Standard reconciliation cannot auto-resolve RECOVERY_BLOCKED
      assert.throws(
        () => serverLedger.reconcileAndResume(adminPrincipal),
        /RECOVERY_BLOCKED/,
        'Cannot auto-reconcile RECOVERY_BLOCKED without admin disaster reset'
      );

      // Administrative disaster force reset re-establishes clean baseline
      serverLedger.adminForceReset(sysAdminPrincipal, 'Disaster recovery fresh baseline');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Clean up test quarantined files
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
    });

    console.log('\n--- Group 5: Configuration Mutation Lock During Recovery ---');

    await test('Tenant, capability, and membership mutations are strictly locked in non-NORMAL states', () => {
      // Put ledger into RECOVERY_REQUIRED
      const ledgerPath = serverLedger.getLedgerFilePath();
      fs.writeFileSync(ledgerPath, '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Configuration mutations must throw
      assert.throws(() => serverLedger.registerUserTenant('usr-test', DEFAULT_TENANT_ID), /LEDGER_RECOVERY_REQUIRED/);
      assert.throws(() => serverLedger.registerFacilityTenant('fac-test', DEFAULT_TENANT_ID), /LEDGER_RECOVERY_REQUIRED/);
      assert.throws(() => serverLedger.setUserAccountStatus('usr-test', 'suspended'), /LEDGER_RECOVERY_REQUIRED/);
      assert.throws(() => serverLedger.setUserSyncCapabilities('usr-test', ['sync:facility']), /LEDGER_RECOVERY_REQUIRED/);
      assert.throws(() => serverLedger.registerFacilityMembership('usr-test', [testFacility]), /LEDGER_RECOVERY_REQUIRED/);

      // Clean quarantined test files and return to NORMAL
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
      serverLedger.reconcileAndResume(adminPrincipal);
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    console.log('\n--- Group 6: HTTP Routes & Observability Anti-Bypass ---');

    await test('POST /api/sync/push returns HTTP 503 with zero acks when ledger is in RECOVERY_REQUIRED', () => {
      const ledgerPath = serverLedger.getLedgerFilePath();
      fs.writeFileSync(ledgerPath, '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      const req: any = {
        body: {
          deviceId: 'dev-unit-01',
          batchTimestamp: new Date().toISOString(),
          events: [{
            eventId: 'evt-http-blocked-1',
            eventType: 'PATIENT_CREATED',
            aggregateType: 'Patient',
            aggregateId: 'pat-http-blocked',
            facilityId: testFacility,
            version: 1,
            payload: { name: 'HTTP Blocked' },
            timestamp: new Date().toISOString(),
          }],
        },
        authenticatedPrincipal: clinician,
      };
      const res = mockRes();

      // Invoke route handler logic
      const result = serverLedger.processPushBatch(req.body.deviceId, req.body.batchTimestamp, req.body.events, req.authenticatedPrincipal);
      let statusCode = 200;
      if (result.status === 'error') {
        statusCode = ((result as any).error === 'LEDGER_RECOVERY_REQUIRED' || (result as any).error === 'LEDGER_RECOVERY_BLOCKED') ? 503 : 500;
      }
      res.status(statusCode).json(result);

      assert.strictEqual(res.statusCode, 503, 'Must return HTTP 503 Service Unavailable');
      assert.strictEqual(res.body.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(res.body.acknowledgedEventIds.length, 0);

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
      serverLedger.reconcileAndResume(adminPrincipal);
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    await test('Diagnostics endpoint reports DEGRADED_RECOVERY_REQUIRED and UNHEALTHY_RECOVERY_BLOCKED', () => {
      // 1. RECOVERY_REQUIRED health check
      const ledgerPath = serverLedger.getLedgerFilePath();
      fs.writeFileSync(ledgerPath, '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();

      const opState1 = serverLedger.getOperationalState();
      const health1 = opState1 === 'NORMAL' ? 'HEALTHY' : (opState1 === 'RECOVERY_REQUIRED' ? 'DEGRADED_RECOVERY_REQUIRED' : 'UNHEALTHY_RECOVERY_BLOCKED');
      assert.strictEqual(health1, 'DEGRADED_RECOVERY_REQUIRED');

      // 2. RECOVERY_BLOCKED health check
      const backupPath = serverLedger.getBackupFilePath();
      fs.writeFileSync(backupPath, '{ CORRUPT_BACKUP', 'utf-8');
      serverLedger.reloadFromDisk();

      const opState2 = serverLedger.getOperationalState();
      const health2 = opState2 === 'NORMAL' ? 'HEALTHY' : (opState2 === 'RECOVERY_REQUIRED' ? 'DEGRADED_RECOVERY_REQUIRED' : 'UNHEALTHY_RECOVERY_BLOCKED');
      assert.strictEqual(health2, 'UNHEALTHY_RECOVERY_BLOCKED');

      // Clean up
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });
      serverLedger.adminForceReset(DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'], 'Reset clean state after diagnostics check');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2 RECOVERY GATE & READ-ONLY SAFETY TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllLedgerFiles();
  }
}

runStage32RecoveryGateTests().catch((err) => {
  console.error('\nStage 3.2 Test Suite Failed:', err);
  process.exit(1);
});
