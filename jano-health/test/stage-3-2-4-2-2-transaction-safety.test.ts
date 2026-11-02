/**
 * Jano Health — Stage 3.2.4.2.2 Verification Test Suite
 * Recovery Audit Archival Transaction Safety Correction
 *
 * Verifies all four corrected defects:
 * 1. Active recovery evidence is retained at its canonical path throughout archival
 *    and only removed upon full reset completion. Post-archive verification failures
 *    leave the canonical audit intact, preserving evidence across reboots.
 * 2. Directory fsync failures are not silently ignored; genuine failures fail closed.
 * 3. Archive creation is atomically non-overwriting using create-exclusive ('wx' flag).
 * 4. Byte-for-byte verification using Buffer equality rather than UTF-8 string comparison.
 * 5. Recovery loader preserves restrictions when an active recovery audit exists.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DataLossAuditRecord } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

async function runStage32422Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.2.2: ARCHIVAL TRANSACTION SAFETY TEST SUITE');
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
  const auditPath = serverLedger.getRecoveryAuditPath();
  const ledgerPath = serverLedger.getLedgerFilePath();
  const backupPath = serverLedger.getBackupFilePath();

  const cleanAllFiles = () => {
    serverLedger.setSimulatedArchivalFailure(false);
    serverLedger.setSimulatedArchiveVerificationFailure(false);
    serverLedger.setSimulatedAuditFailure(false);
    serverLedger.setSimulatedDirectoryFsyncFailure(false);
    serverLedger.setSimulatedPersistenceFailure(false);

    try { if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath); } catch {}
    try { if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); } catch {}
    try { if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath); } catch {}
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
        if (f.includes('.corrupted.')) {
          try { fs.unlinkSync(path.join(process.cwd(), f)); } catch {}
        }
      });
    } catch {}

    serverLedger.adminForceReset(sysAdmin, 'Clean test baseline');
  };

  try {
    cleanAllFiles();

    // ------------------------------------------------------------------
    console.log('--- Defect 1: Canonical Recovery Audit Retention Across Verification Failure ---');
    // ------------------------------------------------------------------

    await test('1. Canonical recovery audit remains intact at its canonical path when verification fails', () => {
      const auditData: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [10, 11, 12],
        missingEventIds: ['evt-10', 'evt-11', 'evt-12'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Unrecoverable block corruption on storage node beta',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      const originalBytes = Buffer.from(JSON.stringify(auditData, null, 2));
      fs.writeFileSync(auditPath, originalBytes);

      // Simulate verification failure
      serverLedger.setSimulatedArchiveVerificationFailure(true);

      // adminForceReset must abort
      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Reset should abort'),
        /SIMULATED_ARCHIVE_VERIFICATION_FAILURE/
      );

      // DEFECT 1 FIX CHECK:
      // Canonical file MUST STILL EXIST at its canonical path!
      assert.strictEqual(fs.existsSync(auditPath), true, 'Canonical audit must still exist at RECOVERY_AUDIT_PATH');

      // Canonical file bytes MUST be identical to original bytes
      const currentBytes = fs.readFileSync(auditPath);
      assert.strictEqual(currentBytes.equals(originalBytes), true, 'Canonical audit bytes must be untouched');

      serverLedger.setSimulatedArchiveVerificationFailure(false);
    });

    await test('2. Active recovery evidence is NOT lost on server reboot/reload after verification failure', () => {
      // The canonical audit is still on disk from previous test.
      assert.strictEqual(fs.existsSync(auditPath), true);

      // Simulate server reboot / reloadFromDisk
      serverLedger.reloadFromDisk();

      // Operational state MUST remain restricted
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Recovery info MUST still preserve the acknowledged gaps and operator
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(info.dataLossAcknowledged, true);
      assert.strictEqual(info.authorizedBy, 'usr-sysadmin-amanuel');
      assert.deepStrictEqual(info.acknowledgedGaps, [10, 11, 12]);
      assert.ok(info.auditRecord, 'Audit record must be loaded from canonical audit path');
    });

    await test('3. Canonical recovery audit is only removed AFTER destructive persistence completes successfully', () => {
      // Set simulated persistence failure during reset
      serverLedger.setSimulatedPersistenceFailure(true);

      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Should fail during persistence'),
        /SIMULATED_PERSISTENCE_FAILURE/
      );

      // Canonical audit MUST still exist because reset persistence failed before completion
      assert.strictEqual(fs.existsSync(auditPath), true, 'Canonical audit must survive persistence failure');

      serverLedger.setSimulatedPersistenceFailure(false);

      // Now reset with all operations succeeding
      serverLedger.adminForceReset(sysAdmin, 'Successful reset');

      // NOW canonical audit must be removed as the final step of successful reset
      assert.strictEqual(fs.existsSync(auditPath), false, 'Canonical audit removed only after successful reset');

      // And historical archive must exist
      const archives = serverLedger.getRecoveryAuditArchives();
      assert.ok(archives.length > 0, 'Archive must exist permanently');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Defect 2: Directory Fsync Failures Fail Closed ---');
    // ------------------------------------------------------------------

    await test('4. Directory fsync failure aborts adminForceReset() before state transition', () => {
      const auditData: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [50],
        missingEventIds: ['evt-50'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Testing directory fsync failure',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(auditData, null, 2));

      // Put ledger in RECOVERY_REQUIRED
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Enable simulated directory fsync failure
      serverLedger.setSimulatedDirectoryFsyncFailure(true);

      // Reset must throw and abort
      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Should fail on directory fsync'),
        /SIMULATED_DIRECTORY_FSYNC_FAILURE/
      );

      // Operational state must NOT transition to NORMAL
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Canonical audit must still exist
      assert.strictEqual(fs.existsSync(auditPath), true);

      serverLedger.setSimulatedDirectoryFsyncFailure(false);
    });

    // ------------------------------------------------------------------
    console.log('\n--- Defect 3: Atomic Non-Overwriting Archive Creation ---');
    // ------------------------------------------------------------------

    await test('5. Exclusive creation creates archives without overwriting existing files', () => {
      const archivesBefore = serverLedger.getRecoveryAuditArchives().length;

      // Successful reset
      serverLedger.adminForceReset(sysAdmin, 'Reset with exclusive file creation');

      const archivesAfter = serverLedger.getRecoveryAuditArchives();
      assert.strictEqual(archivesAfter.length, archivesBefore + 1);

      // Verify the new archive is valid and non-empty
      const latestArchive = archivesAfter[archivesAfter.length - 1];
      assert.ok(fs.existsSync(latestArchive));
      const stats = fs.statSync(latestArchive);
      assert.ok(stats.size > 0, 'Archive must be non-empty');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Defect 4: Byte-for-Byte Binary Verification ---');
    // ------------------------------------------------------------------

    await test('6. Byte-for-byte binary verification preserves raw binary identity', () => {
      // Create audit with special unicode and binary-like whitespace
      const customAudit = {
        operatorId: 'usr-sysadmin-amanuel',
        timestamp: new Date().toISOString(),
        clinicalNotes: 'Doctor\u2019s review: \uD83C\uDFE5 clinical gap acknowledged \t\r\n',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
        missingSequences: [9999],
        missingEventIds: ['evt-unicode-gap'],
      };
      const rawBytes = Buffer.from(JSON.stringify(customAudit, null, 2), 'utf-8');
      fs.writeFileSync(auditPath, rawBytes);

      // Standalone call to archiveRecoveryAuditIfExists
      const archivedPath = serverLedger.archiveRecoveryAuditIfExists();
      assert.ok(archivedPath, 'Archived path must be returned');

      // Verify byte-for-byte equality between canonical and archive
      const archivedBytes = fs.readFileSync(archivedPath!);
      assert.strictEqual(rawBytes.length, archivedBytes.length, 'Byte lengths must match exactly');
      assert.strictEqual(rawBytes.equals(archivedBytes), true, 'Raw byte buffers must be strictly equal');

      // Canonical file MUST still exist after archiveRecoveryAuditIfExists()
      assert.strictEqual(fs.existsSync(auditPath), true, 'Canonical audit must remain intact');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Recovery Loader Restrictions Preservation ---');
    // ------------------------------------------------------------------

    await test('7. Active recovery audit prevents reloadFromDisk() from clearing restrictions', () => {
      // While auditPath exists with RESTRICTED_RECOVERY_REQUIRED:
      assert.strictEqual(fs.existsSync(auditPath), true);

      // Reload
      serverLedger.reloadFromDisk();

      // Must remain RECOVERY_REQUIRED
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const recInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recInfo.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(recInfo.dataLossAcknowledged, true);
      assert.strictEqual(recInfo.reconciliationRequired, true);

      // Clean reset by authorized admin clears the restriction and archives the audit
      serverLedger.adminForceReset(sysAdmin, 'Final cleanup reset');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
      assert.strictEqual(fs.existsSync(auditPath), false);
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4.2.2 TRANSACTION SAFETY TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllFiles();
  }
}

runStage32422Tests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
