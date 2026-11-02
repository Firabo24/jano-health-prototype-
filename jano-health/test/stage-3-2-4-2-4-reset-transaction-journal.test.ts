/**
 * Jano Health — Stage 3.2.4.2.4 Verification Test Suite
 * Durable Reset Transaction Journal & Restart Safety
 *
 * Verifies fixes for defects F-05 and F-06:
 * - F-05: If adminForceReset() removes .server_ledger_recovery_audit.json and the
 *   subsequent directory synchronization fails, a fresh ServerLedger MUST NOT
 *   restart in NORMAL. It detects the IN_PROGRESS reset transaction and enters
 *   RECOVERY_REQUIRED.
 * - F-06: Backup-copy failures during reset are NOT swallowed by empty catch blocks.
 *   Reset aborts with fail-closed semantics, preserving recovery audit evidence.
 * - Full transaction lifecycle: IN_PROGRESS persisted before destructive operations,
 *   COMMITTED persisted only upon full completion.
 * - Interrupted reset can be safely retried and recovered by an authorized administrator.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DataLossAuditRecord, ServerLedger } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

async function runStage32424Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.2.4: RESET TRANSACTION JOURNAL & RESTART SAFETY');
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

  const sysAdmin = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
  const unauthorizedClinician = DEVELOPMENT_PRINCIPALS['usr-clinician-dr-amin'];
  const auditPath = serverLedger.getRecoveryAuditPath();
  const ledgerPath = serverLedger.getLedgerFilePath();
  const backupPath = serverLedger.getBackupFilePath();
  const resetTxPath = serverLedger.getResetTransactionPath();

  const cleanAllFiles = () => {
    serverLedger.setSimulatedArchivalFailure(false);
    serverLedger.setSimulatedArchiveVerificationFailure(false);
    serverLedger.setSimulatedAuditFailure(false);
    serverLedger.setSimulatedDirectoryFsyncFailure(false);
    serverLedger.setSimulatedPersistenceFailure(false);
    serverLedger.setSimulatedBackupFailure(false);
    serverLedger.setSimulatedFinalDirectoryFsyncFailure(false);
    serverLedger.setSimulatedResetJournalReadFailure(false);
    serverLedger.setSimulatedResetJournalArchivalFailure(false);
    serverLedger.setSimulatedResetJournalArchiveVerificationFailure(false);

    try { if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath); } catch {}
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch {}
    try { if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath); } catch {}
    try { if (fs.existsSync(resetTxPath)) fs.unlinkSync(resetTxPath); } catch {}
    try {
      const markerPath = serverLedger.getEstablishedMarkerPath();
      if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    } catch {}
    try {
      const commitMetaPath = serverLedger.getCommitMetadataPath();
      if (fs.existsSync(commitMetaPath)) fs.unlinkSync(commitMetaPath);
    } catch {}

    try {
      const dirFiles = fs.readdirSync(process.cwd());
      dirFiles.forEach((f) => {
        if (f.startsWith('.server_ledger_recovery_audit.') && f.endsWith('.archived')) {
          try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
        }
        if (f.startsWith('.server_ledger_reset_transaction.') && f.endsWith('.archived')) {
          try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
        }
        if (f.includes('.corrupted.')) {
          try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
        }
        if (f.startsWith('.server_ledger_reset_transaction.json.tmp.')) {
          try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
        }
      });
    } catch {}

    serverLedger.adminForceReset(sysAdmin, 'Clean test baseline');
  };

  try {
    cleanAllFiles();

    // ------------------------------------------------------------------
    console.log('--- Defect F-05: Final Directory Fsync Failure & Restart Protection ---');
    // ------------------------------------------------------------------

    await test('1. F-05: Directory fsync failure after audit unlinking aborts reset before COMMITTED', () => {
      // Create an active recovery audit
      const auditData: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [100, 101],
        missingEventIds: ['evt-100', 'evt-101'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Storage crash investigation',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(auditData, null, 2));

      // Put serverLedger in RECOVERY_REQUIRED
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Enable simulated failure specifically after canonical audit removal
      serverLedger.setSimulatedFinalDirectoryFsyncFailure(true);

      // adminForceReset must throw
      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Reset with final fsync failure'),
        /SIMULATED_DIRECTORY_FSYNC_FAILURE/
      );

      // Reset transaction journal MUST exist on disk with status IN_PROGRESS
      assert.strictEqual(fs.existsSync(resetTxPath), true, 'Reset transaction journal must exist');
      const tx = JSON.parse(fs.readFileSync(resetTxPath, 'utf-8'));
      assert.strictEqual(tx.status, 'IN_PROGRESS', 'Journal must remain IN_PROGRESS');
      assert.strictEqual(tx.operatorId, 'usr-sysadmin-amanuel');

      // Canonical audit was unlinked before fsync failure
      assert.strictEqual(fs.existsSync(auditPath), false, 'Canonical audit was unlinked');

      serverLedger.setSimulatedFinalDirectoryFsyncFailure(false);
    });

    await test('2. F-05: Fresh ledger restart refuses NORMAL state when IN_PROGRESS reset transaction exists', () => {
      // Verify reset transaction on disk is still IN_PROGRESS and canonical audit is gone
      assert.strictEqual(fs.existsSync(resetTxPath), true);
      const txOnDisk = JSON.parse(fs.readFileSync(resetTxPath, 'utf-8'));
      assert.strictEqual(txOnDisk.status, 'IN_PROGRESS');
      assert.strictEqual(fs.existsSync(auditPath), false);

      // Simulate process reboot by creating a fresh instance / reloading
      serverLedger.reloadFromDisk();

      // DEFECT F-05 FIX CHECK:
      // Operational state MUST be RECOVERY_REQUIRED, NOT NORMAL!
      assert.strictEqual(
        serverLedger.getOperationalState(),
        'RECOVERY_REQUIRED',
        'Ledger must NOT restart in NORMAL after interrupted reset transaction'
      );

      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(info.reconciliationRequired, true);
      assert.ok(info.reason?.includes('INTERRUPTED_RESET_TRANSACTION'), 'Reason must diagnose interrupted reset');
      assert.strictEqual(info.resetTransaction?.status, 'IN_PROGRESS');

      // Mutations must remain blocked
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-test-blocked',
        eventType: 'PATIENT_ENCOUNTER_RECORDED',
        aggregateType: 'ENCOUNTER',
        aggregateId: 'enc-test',
        facilityId: 'fac-district-hospital-01',
        actorId: 'usr-doctor-01',
        clientVersion: 1,
        payload: { clinicalNote: 'Emergency triage note' },
        timestamp: new Date().toISOString(),
      }]);
      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
      assert.strictEqual(pushRes.acknowledgedEventIds.length, 0);
    });

    // ------------------------------------------------------------------
    console.log('\n--- Defect F-06: Backup Creation Failure Fails Closed ---');
    // ------------------------------------------------------------------

    await test('3. F-06: Backup failure during reset throws and aborts before canonical audit removal', () => {
      // Place a recovery audit
      const auditData: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [200],
        missingEventIds: ['evt-200'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Backup fault test',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      const origBytes = Buffer.from(JSON.stringify(auditData, null, 2));
      fs.writeFileSync(auditPath, origBytes);

      // Enable simulated backup failure
      serverLedger.setSimulatedBackupFailure(true);

      // DEFECT F-06 FIX CHECK:
      // adminForceReset MUST NOT swallow the backup failure! It must throw!
      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Reset should fail at backup'),
        /SIMULATED_BACKUP_FAILURE/
      );

      // Canonical audit MUST still exist and be unmodified
      assert.strictEqual(fs.existsSync(auditPath), true, 'Canonical audit must survive backup failure');
      const curBytes = fs.readFileSync(auditPath);
      assert.strictEqual(curBytes.equals(origBytes), true, 'Canonical audit must be intact');

      // Transaction journal remains IN_PROGRESS
      const tx = serverLedger.getResetTransaction();
      assert.ok(tx, 'Reset transaction journal must exist');
      assert.strictEqual(tx.status, 'IN_PROGRESS', 'Journal must reflect uncommitted reset');

      serverLedger.setSimulatedBackupFailure(false);
    });

    await test('4. F-06: Restart after failed backup retains RECOVERY_REQUIRED with intact audit evidence', () => {
      assert.strictEqual(fs.existsSync(auditPath), true);

      // Reboot / reload from disk
      serverLedger.reloadFromDisk();

      // Must remain RECOVERY_REQUIRED
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(info.dataLossAcknowledged, true);
      assert.deepStrictEqual(info.acknowledgedGaps, [200]);
    });

    // ------------------------------------------------------------------
    console.log('\n--- Transaction Lifecycle & Recovery from Interrupted Resets ---');
    // ------------------------------------------------------------------

    await test('5. Authorized subsequent reset successfully recovers from interrupted reset', () => {
      // Reset without failures
      serverLedger.adminForceReset(sysAdmin, 'Clean subsequent reset by admin');

      // State transitions to NORMAL
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Transaction journal is now COMMITTED
      const tx = serverLedger.getResetTransaction();
      assert.ok(tx, 'Journal must exist');
      assert.strictEqual(tx.status, 'COMMITTED');
      assert.ok(tx.committedAt, 'committedAt timestamp must be recorded');
      assert.strictEqual(tx.phase, 'COMPLETED');

      // Canonical audit is now removed
      assert.strictEqual(fs.existsSync(auditPath), false);

      // Historical archives remain intact
      const archives = serverLedger.getRecoveryAuditArchives();
      assert.ok(archives.length > 0, 'Historical audit archives must be preserved');
    });

    await test('6. Restart after COMMITTED reset loads cleanly into NORMAL state', () => {
      const txBefore = serverLedger.getResetTransaction();
      assert.strictEqual(txBefore?.status, 'COMMITTED');

      // Reboot
      serverLedger.reloadFromDisk();

      // Must enter NORMAL
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'NORMAL');
      assert.strictEqual(info.reconciliationRequired, false);
      assert.strictEqual(info.resetTransaction?.status, 'COMMITTED');
    });

    await test('7. Unauthorized clinician is rejected and cannot initiate reset transaction', () => {
      assert.throws(
        () => serverLedger.adminForceReset(unauthorizedClinician, 'Malicious reset attempt'),
        /UNAUTHORIZED/
      );
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4.2.4 TRANSACTION JOURNAL TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllFiles();
  }
}

runStage32424Tests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
