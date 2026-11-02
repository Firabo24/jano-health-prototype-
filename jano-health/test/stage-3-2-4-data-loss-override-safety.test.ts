/**
 * Jano Health — Stage 3.2.4 Verification Test Suite
 * Data-Loss Override Safety & Verified Recovery Authority
 *
 * Verifies all 15 required controls:
 * 1. allowDataLoss: true cannot transition an incomplete ledger to NORMAL.
 * 2. Correct confirmation phrase alone cannot bypass the completeness requirement.
 * 3. A known missing acknowledged event leaves writes blocked.
 * 4. Unverified completeness leaves writes blocked.
 * 5. Gap acknowledgement preserves the missing-event evidence.
 * 6. The historical gap remains visible after restart.
 * 7. isAuthorizedForLedgerRecovery('usr-system') is denied.
 * 8. adminForceReset('usr-system') is denied unless the actual trusted principal contract explicitly authorizes the operation; a string-only identity must never suffice.
 * 9. A forged request-body identity cannot authorize HTTP recovery.
 * 10. An actual authorized recovery principal can proceed when all required conditions are met.
 * 11. An unauthorized facility administrator cannot reconcile a global ledger.
 * 12. Failed authorization causes no mutation.
 * 13. Failure to persist the recovery audit leaves the ledger restricted.
 * 14. Ordinary sync push remains blocked after data loss has been acknowledged.
 * 15. Genuine, fully verified recovery still follows its approved path.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, isAuthorizedForLedgerRecovery } from '../server/serverLedger';
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

async function runStage324Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4: DATA-LOSS OVERRIDE SAFETY & RECOVERY AUTHORITY');
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
    serverLedger.setSimulatedAuditFailure(false);
    serverLedger.adminForceReset(sysAdmin, 'Clean test baseline');
  };

  try {
    cleanAllLedgerFiles();

    // ------------------------------------------------------------------
    console.log('--- Group 1: Elimination of Static-Identity Authorization ---');
    // ------------------------------------------------------------------

    await test("7. isAuthorizedForLedgerRecovery('usr-system') is denied", () => {
      // String alone must never grant recovery authority
      assert.strictEqual(isAuthorizedForLedgerRecovery('usr-system'), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery('usr-admin-01'), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery('usr-sysadmin-amanuel'), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery('system_administrator'), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery(''), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery(null), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery(undefined), false);
      assert.strictEqual(isAuthorizedForLedgerRecovery(12345 as any), false);
    });

    await test("8. adminForceReset('usr-system') is denied; a string-only identity must never suffice", () => {
      assert.throws(
        () => serverLedger.adminForceReset('usr-system' as any, 'Attempt with string'),
        /UNAUTHORIZED/,
        "adminForceReset('usr-system') string identity must be denied"
      );
      assert.throws(
        () => serverLedger.adminForceReset('usr-admin-01' as any, 'Attempt with string'),
        /UNAUTHORIZED/,
        "adminForceReset('usr-admin-01') string identity must be denied"
      );
      assert.throws(
        () => serverLedger.adminForceReset({ userId: 'usr-system' } as any, 'Attempt without roles'),
        /UNAUTHORIZED/,
        'adminForceReset without roles array must be denied'
      );
      // Valid trusted principal contract succeeds
      serverLedger.adminForceReset(sysAdmin, 'Authorized reset with trusted principal');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    await test('11. An unauthorized facility administrator cannot reconcile or reset a global ledger', () => {
      // Put ledger in RECOVERY_REQUIRED
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Direct reconcile throws UNAUTHORIZED
      assert.throws(
        () => serverLedger.reconcileAndResume(facAdmin),
        /UNAUTHORIZED/,
        'facility_administrator must be denied from reconcileAndResume'
      );

      // Direct reset throws UNAUTHORIZED
      assert.throws(
        () => serverLedger.adminForceReset(facAdmin, 'Facility admin reset'),
        /UNAUTHORIZED/,
        'facility_administrator must be denied from adminForceReset'
      );

      // HTTP middleware denies with 403 Forbidden
      const req: any = { authenticatedPrincipal: facAdmin };
      const res = mockRes();
      let nextCalled = false;
      requireLedgerRecoveryAuth(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.error, 'FORBIDDEN');

      // Restore baseline
      serverLedger.adminForceReset(sysAdmin, 'Restore clean');
    });

    await test('9. A forged request-body identity cannot authorize HTTP recovery', () => {
      // Put ledger in RECOVERY_REQUIRED
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Attacker attempts to forge system admin in request body while authenticated as clinician
      const reqClinician: any = {
        authenticatedPrincipal: clinician,
        body: {
          userId: 'usr-sysadmin-amanuel',
          roles: ['system_administrator'],
          allowDataLoss: true,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        },
      };
      const resClinician = mockRes();
      let nextCalled = false;

      requireLedgerRecoveryAuth(reqClinician, resClinician, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(resClinician.statusCode, 403);
      assert.strictEqual(resClinician.body.error, 'FORBIDDEN');

      // Unauthenticated attacker
      const reqUnauth: any = {
        body: {
          userId: 'usr-sysadmin-amanuel',
          roles: ['system_administrator'],
        },
      };
      const resUnauth = mockRes();
      requireLedgerRecoveryAuth(reqUnauth, resUnauth, () => {});
      assert.strictEqual(resUnauth.statusCode, 401);

      // Ledger remains in RECOVERY_REQUIRED
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      cleanAllLedgerFiles();
    });

    await test('12. Failed authorization causes no mutation', () => {
      // Put ledger in RECOVERY_REQUIRED
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ INVALID_JSON', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      const recoveryInfoBefore = serverLedger.getRecoveryInfo();
      const statsBefore = serverLedger.getStats();

      // Attempted unauthorized call
      assert.throws(
        () => serverLedger.reconcileAndResume('usr-system' as any),
        /UNAUTHORIZED/
      );

      // Zero mutations
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      assert.deepStrictEqual(serverLedger.getStats(), statsBefore);
      assert.strictEqual(serverLedger.getRecoveryInfo().state, recoveryInfoBefore.state);
      assert.strictEqual(serverLedger.getRecoveryInfo().reconciliationRequired, true);

      cleanAllLedgerFiles();
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 2: Data-Loss Override Safety & Write Blocking ---');
    // ------------------------------------------------------------------

    // Setup helper for a ledger with missing acknowledged event
    const setupLedgerWithMissingEvent = () => {
      cleanAllLedgerFiles();

      // Commit event 1
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-gap',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'S324 Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);

      const staleBackup = fs.readFileSync(serverLedger.getBackupFilePath(), 'utf-8');

      // Commit event 2 (advancing commit metadata and sequence to 2)
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-2',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-gap',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'S324 Patient v2' },
        timestamp: new Date().toISOString(),
      }], clinician);

      // Corrupt primary, restore stale backup that only has sequence 1
      fs.writeFileSync(serverLedger.getBackupFilePath(), staleBackup, 'utf-8');
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ CORRUPT_PRIMARY: true', 'utf-8');

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
    };

    await test('1. allowDataLoss: true cannot transition an incomplete ledger to NORMAL', () => {
      setupLedgerWithMissingEvent();

      // System admin attempts override
      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        notes: 'Admin acknowledged sequence 2 is missing',
      });

      // MUST NOT be NORMAL! Must remain RECOVERY_REQUIRED
      assert.strictEqual(outcome.success, false);
      assert.strictEqual(outcome.operationalState, 'RECOVERY_REQUIRED');
      assert.strictEqual(outcome.dataLossAcknowledged, true);
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
    });

    await test('2. Correct confirmation phrase alone cannot bypass the completeness requirement', () => {
      setupLedgerWithMissingEvent();

      // Confirmation phrase without allowDataLoss: true throws error
      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, {
          allowDataLoss: false,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        }),
        /CANNOT_PROMOTE_RECOVERY/
      );

      // Confirmation phrase with allowDataLoss: true does NOT promote to NORMAL
      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
      });

      assert.strictEqual(outcome.operationalState, 'RECOVERY_REQUIRED');
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
    });

    await test('3. A known missing acknowledged event leaves writes blocked', () => {
      setupLedgerWithMissingEvent();

      // Normal writes must be strictly rejected
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-attempt',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-gap',
        facilityId: testFacility,
        version: 3,
        payload: { name: 'Attempt write during gap' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(pushRes.acknowledgedEventIds.length, 0);
      assert.strictEqual(pushRes.processedCount, 0);
    });

    await test('4. Unverified completeness leaves writes blocked', () => {
      setupLedgerWithMissingEvent();

      // Delete commit metadata and clear quarantine files so status is UNVERIFIED_INCOMPLETE_EVIDENCE
      try { fs.unlinkSync(serverLedger.getCommitMetadataPath()); } catch {}
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.filter((f) => f.includes('.corrupted.')).forEach((f) => {
        try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
      });

      const completeness = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(completeness.verified, false);
      assert.strictEqual(completeness.status, 'UNVERIFIED_INCOMPLETE_EVIDENCE');

      // Attempting reconcile without override throws
      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, { notes: 'Standard attempt' }),
        /CANNOT_PROMOTE_RECOVERY/
      );

      // Attempting reconcile with override records acknowledgement, but STILL leaves writes blocked
      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_UNVERIFIED_RECOVERY',
        notes: 'Acknowledging unverified state',
      });

      assert.strictEqual(outcome.operationalState, 'RECOVERY_REQUIRED');
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Push write remains blocked
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-unverified-block',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-gap',
        facilityId: testFacility,
        version: 3,
        payload: {},
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
    });

    await test('5. Gap acknowledgement preserves the missing-event evidence', () => {
      setupLedgerWithMissingEvent();

      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        notes: 'Supervisor verified gap in sequence 2',
      });

      assert.strictEqual(outcome.dataLossAcknowledged, true);

      // Recovery info retains the evidence
      const recInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recInfo.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(recInfo.dataLossAcknowledged, true);
      assert.ok(Array.isArray(recInfo.acknowledgedGaps));
      assert.ok(recInfo.acknowledgedGaps.includes(2), 'Missing sequence 2 must be recorded');
      assert.strictEqual(recInfo.authorizedBy, sysAdmin.userId);

      // Durable audit file exists and preserves evidence
      const auditPath = serverLedger.getRecoveryAuditPath();
      assert.ok(fs.existsSync(auditPath), 'Recovery audit file must exist on disk');

      const auditData = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
      assert.strictEqual(auditData.operatorId, sysAdmin.userId);
      assert.strictEqual(auditData.decision, 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED');
      assert.strictEqual(auditData.recoveryOutcome, 'RESTRICTED_RECOVERY_REQUIRED');
      assert.ok(auditData.missingSequences.includes(2));
    });

    await test('6. The historical gap remains visible after restart', () => {
      setupLedgerWithMissingEvent();

      // Acknowledge gap
      serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        notes: 'Pre-restart acknowledgement',
      });

      // Simulate server reboot / reloadFromDisk
      serverLedger.reloadFromDisk();

      // Operational state is STILL restricted
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Gap metadata is durably preserved
      const recInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recInfo.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(recInfo.dataLossAcknowledged, true);
      assert.ok(Array.isArray(recInfo.acknowledgedGaps));
      assert.ok(recInfo.acknowledgedGaps.includes(2));
      assert.strictEqual(recInfo.authorizedBy, sysAdmin.userId);

      // Missing sequence is still detected by verifyRecoveryCompleteness()
      const comp = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(comp.verified, false);
      assert.ok(comp.missingSequences.includes(2));
    });

    await test('13. Failure to persist the recovery audit leaves the ledger restricted', () => {
      setupLedgerWithMissingEvent();

      // Simulate disk write / fsync failure during audit persistence
      serverLedger.setSimulatedAuditFailure(true);

      assert.throws(
        () => serverLedger.reconcileAndResume(sysAdmin, {
          allowDataLoss: true,
          acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
          notes: 'Attempt with audit failure',
        }),
        /AUDIT_PERSISTENCE_FAILURE/
      );

      // Ledger operational state remains restricted
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Reset test hook
      serverLedger.setSimulatedAuditFailure(false);
    });

    await test('14. Ordinary sync push remains blocked after data loss has been acknowledged', () => {
      setupLedgerWithMissingEvent();

      // Acknowledge gap
      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        allowDataLoss: true,
        acknowledgeGapsConfirmation: 'CONFIRM_DATA_LOSS_ACKNOWLEDGED',
        notes: 'Gap accepted for documentation purposes',
      });

      assert.strictEqual(outcome.operationalState, 'RECOVERY_REQUIRED');

      // Attempt push write after acknowledgement
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-post-ack',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-gap',
        facilityId: testFacility,
        version: 3,
        payload: { name: 'Post-ack write attempt' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(pushRes.acknowledgedEventIds.length, 0);
      assert.strictEqual(pushRes.processedCount, 0);
      assert.strictEqual(serverLedger.authoritativeVersion('Patient', 'pat-s324-gap'), 1);
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 3: Verified Recovery & Genuine Completeness ---');
    // ------------------------------------------------------------------

    await test('10. An actual authorized recovery principal can proceed when all required conditions are met', () => {
      cleanAllLedgerFiles();

      // Commit event 1
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-v1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-v',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Verified Patient' },
        timestamp: new Date().toISOString(),
      }], clinician);

      // Backup is up-to-date and complete (contains event 1)
      // Corrupt primary only
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ CORRUPT_PRIMARY: true', 'utf-8');
      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Backup is complete and matches commit metadata
      const comp = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(comp.verified, true);
      assert.strictEqual(comp.status, 'VERIFIED_COMPLETE');

      // Authorized system admin reconciles
      const outcome = serverLedger.reconcileAndResume(sysAdmin, {
        notes: 'Candidate backup is verified complete and matches all commit metadata',
      });

      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.operationalState, 'NORMAL');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
    });

    await test('15. Genuine, fully verified recovery still follows its approved path', () => {
      cleanAllLedgerFiles();

      // Commit event 1 and 2 normally
      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-v2-1',
        eventType: 'PATIENT_CREATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-legit',
        facilityId: testFacility,
        version: 1,
        payload: { name: 'Legit v1' },
        timestamp: new Date().toISOString(),
      }], clinician);

      serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-v2-2',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-legit',
        facilityId: testFacility,
        version: 2,
        payload: { name: 'Legit v2' },
        timestamp: new Date().toISOString(),
      }], clinician);

      // Corrupt primary; backup has both events
      fs.writeFileSync(serverLedger.getLedgerFilePath(), '{ CORRUPT_PRIMARY: true', 'utf-8');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Recovery completeness is VERIFIED_COMPLETE
      const comp = serverLedger.verifyRecoveryCompleteness();
      assert.strictEqual(comp.verified, true);
      assert.strictEqual(comp.status, 'VERIFIED_COMPLETE');

      // Reconcile to NORMAL
      const outcome = serverLedger.reconcileAndResume(sysAdmin, 'Approved restoration');
      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.operationalState, 'NORMAL');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Normal clinical writes resume successfully!
      const postRecoveryPush = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-s324-v2-3',
        eventType: 'PATIENT_UPDATED',
        aggregateType: 'Patient',
        aggregateId: 'pat-s324-legit',
        facilityId: testFacility,
        version: 3,
        payload: { name: 'Legit v3 post-recovery' },
        timestamp: new Date().toISOString(),
      }], clinician);

      assert.strictEqual(postRecoveryPush.status, 'acknowledged');
      assert.strictEqual(postRecoveryPush.processedCount, 1);
      assert.strictEqual(serverLedger.authoritativeVersion('Patient', 'pat-s324-legit'), 3);
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4 DATA-LOSS OVERRIDE & RECOVERY AUTHORITY TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllLedgerFiles();
  }
}

runStage324Tests().catch((err) => {
  console.error('\nStage 3.2.4 Test Suite Failed:', err);
  process.exit(1);
});
