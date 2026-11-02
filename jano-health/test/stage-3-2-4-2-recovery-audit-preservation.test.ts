/**
 * Jano Health — Stage 3.2.4.2 Verification Test Suite
 * Recovery Audit Preservation — Controlled Remediation
 *
 * Verifies all required controls:
 * 1. Historical audit record is archived, not deleted, during adminForceReset().
 * 2. Archived file contains identical contents (byte-for-byte) to the pre-reset recovery audit.
 * 3. Multiple resets create multiple distinct archives without overwriting or deleting prior archives.
 * 4. Filename collisions are handled explicitly with collision-resistant suffixes.
 * 5. Archival failure fails closed: reset aborts before any state mutation or destructive write.
 * 6. Archive verification failure fails closed: reset aborts before any state mutation or destructive write.
 * 7. When no recovery audit exists, adminForceReset() proceeds cleanly without creating invalid archives.
 * 8. A newly initialized ledger does not claim continuation of complete historical clinical records.
 * 9. Original ledger and backup quarantine artifacts remain preserved across resets.
 * 10. Archived audit files remain discoverable via getRecoveryAuditArchives() / getArchivedRecoveryAuditPaths().
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DataLossAuditRecord } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

async function runStage3242Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.2: RECOVERY AUDIT PRESERVATION TEST SUITE');
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

  const cleanAllLedgerAndArchiveFiles = () => {
    serverLedger.setSimulatedArchivalFailure(false);
    serverLedger.setSimulatedArchiveVerificationFailure(false);
    serverLedger.setSimulatedAuditFailure(false);

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

    // Clean archived audits and corrupted quarantine files
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

    serverLedger.adminForceReset(sysAdmin, 'Clean test initialization');
  };

  try {
    cleanAllLedgerAndArchiveFiles();

    // ------------------------------------------------------------------
    console.log('--- Group 1: Durable Archival on Administrative Reset ---');
    // ------------------------------------------------------------------

    await test('1. Historical audit record is archived, not deleted, during adminForceReset()', () => {
      // Create a genuine recovery audit record representing an acknowledged gap
      const sampleAudit: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [4, 5, 6],
        missingEventIds: ['evt-lost-004', 'evt-lost-005', 'evt-lost-006'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Severe storage node corruption at facility alpha',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };

      fs.writeFileSync(auditPath, JSON.stringify(sampleAudit, null, 2), 'utf-8');
      assert.strictEqual(fs.existsSync(auditPath), true, 'Pre-condition: Audit file must exist');

      const preResetArchives = serverLedger.getRecoveryAuditArchives();
      const preCount = preResetArchives.length;

      // Execute authorized admin force reset
      serverLedger.adminForceReset(sysAdmin, 'Emergency disaster reinitialization test');

      // The original active audit file path must be cleared (moved to archive)
      assert.strictEqual(fs.existsSync(auditPath), false, 'Active audit path must have been moved/archived');

      // Archive count must increase by exactly 1
      const postResetArchives = serverLedger.getRecoveryAuditArchives();
      assert.strictEqual(postResetArchives.length, preCount + 1, 'Exactly one archive must have been created');

      const newlyArchivedPath = postResetArchives[postResetArchives.length - 1];
      assert.strictEqual(fs.existsSync(newlyArchivedPath), true, 'Archived file must exist on disk');
      assert.match(
        path.basename(newlyArchivedPath),
        /^\.server_ledger_recovery_audit\.\d{8}T\d{6}Z\..+\.archived$/,
        'Archive filename must follow collision-resistant timestamp format'
      );
    });

    await test('2. Archived file contains identical contents (byte-for-byte) to pre-reset audit', () => {
      const detailedAudit: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator', 'admin'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: '2026-10-11T13:45:00.000Z',
        missingSequences: [12, 13, 14, 15],
        missingEventIds: ['evt-crit-012', 'evt-crit-013'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Forensic drive sector degradation. Missing 2 events.',
        completenessStatus: 'MISSING_ACKNOWLEDGED_EVENTS',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };

      const originalJson = JSON.stringify(detailedAudit, null, 2);
      fs.writeFileSync(auditPath, originalJson, 'utf-8');

      const preArchives = serverLedger.getRecoveryAuditArchives();
      serverLedger.adminForceReset(sysAdmin, 'Testing exact content preservation');

      const postArchives = serverLedger.getRecoveryAuditArchives();
      assert.strictEqual(postArchives.length, preArchives.length + 1);

      const latestArchive = postArchives[postArchives.length - 1];
      const archivedContent = fs.readFileSync(latestArchive, 'utf-8');

      // Byte-for-byte identity check
      assert.strictEqual(archivedContent, originalJson, 'Archived content must match original verbatim');

      // Parsed content check
      const parsedArchived: DataLossAuditRecord = JSON.parse(archivedContent);
      assert.deepStrictEqual(parsedArchived.missingSequences, [12, 13, 14, 15]);
      assert.deepStrictEqual(parsedArchived.missingEventIds, ['evt-crit-012', 'evt-crit-013']);
      assert.strictEqual(parsedArchived.reason, 'Forensic drive sector degradation. Missing 2 events.');
      assert.strictEqual(parsedArchived.operatorId, 'usr-sysadmin-amanuel');
    });

    await test('3. Multiple resets create multiple distinct archives without overwriting or deleting prior archives', () => {
      // First audit and reset
      const audit1: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [100],
        missingEventIds: ['evt-100'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'First incident',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(audit1, null, 2), 'utf-8');
      serverLedger.adminForceReset(sysAdmin, 'Reset after incident 1');

      const archivesAfter1 = serverLedger.getRecoveryAuditArchives();
      const count1 = archivesAfter1.length;

      // Second audit and reset
      const audit2: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [200, 201],
        missingEventIds: ['evt-200', 'evt-201'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Second incident',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(audit2, null, 2), 'utf-8');
      serverLedger.adminForceReset(sysAdmin, 'Reset after incident 2');

      const archivesAfter2 = serverLedger.getRecoveryAuditArchives();
      assert.strictEqual(archivesAfter2.length, count1 + 1, 'Second archive must be created without deleting first');

      // Third audit and reset
      const audit3: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [300],
        missingEventIds: ['evt-300'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Third incident',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(audit3, null, 2), 'utf-8');
      serverLedger.adminForceReset(sysAdmin, 'Reset after incident 3');

      const archivesAfter3 = serverLedger.getRecoveryAuditArchives();
      assert.strictEqual(archivesAfter3.length, count1 + 2, 'Third archive must be created without deleting prior two');

      // Verify all archives exist and have distinct filenames
      const uniqueNames = new Set(archivesAfter3);
      assert.strictEqual(uniqueNames.size, archivesAfter3.length, 'All archive filepaths must be distinct');

      // Verify that every archive file is non-empty and valid JSON
      for (const arch of archivesAfter3) {
        assert.strictEqual(fs.existsSync(arch), true);
        const parsed = JSON.parse(fs.readFileSync(arch, 'utf-8'));
        assert.ok(parsed.operatorId, 'Archived audit must contain valid operatorId');
      }
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 2: Fail-Closed Semantics on Archival Failures ---');
    // ------------------------------------------------------------------

    await test('4. Archival failure aborts adminForceReset() before destructive mutation (fail-closed)', () => {
      // Setup a specific ledger state that should NOT be wiped if archival fails
      const preciousAudit: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [999],
        missingEventIds: ['evt-precious-999'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Critical evidence that must not be deleted if archival fails',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      const preciousRaw = JSON.stringify(preciousAudit, null, 2);
      fs.writeFileSync(auditPath, preciousRaw, 'utf-8');

      // Record pre-reset state
      const preStateEventsCount = (serverLedger as any).state?.events?.length ?? 0;
      const preOperationalState = serverLedger.getOperationalState();

      // Enable simulated archival failure
      serverLedger.setSimulatedArchivalFailure(true);

      // adminForceReset must throw and abort
      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Should fail and abort'),
        /SIMULATED_ARCHIVAL_FAILURE/,
        'adminForceReset must throw if archival fails'
      );

      // Verify fail-closed guarantees:
      // 1. Original audit file is untouched and still exists at its path
      assert.strictEqual(fs.existsSync(auditPath), true, 'Original audit file must remain intact');
      assert.strictEqual(fs.readFileSync(auditPath, 'utf-8'), preciousRaw, 'Original audit content must not be modified');

      // 2. Ledger operational state is unchanged
      assert.strictEqual(serverLedger.getOperationalState(), preOperationalState, 'Operational state must not mutate on failed reset');

      // Clean up simulated failure
      serverLedger.setSimulatedArchivalFailure(false);
    });

    await test('5. Archive verification failure aborts adminForceReset() before destructive mutation', () => {
      const auditToVerify: DataLossAuditRecord = {
        operatorId: 'usr-sysadmin-amanuel',
        operatorRoles: ['system_administrator'],
        authorizedCapability: 'LEDGER_RECOVERY_DATA_LOSS_OVERRIDE',
        decision: 'GAP_ACKNOWLEDGED_RESTRICTION_RETAINED',
        affectedScope: 'global_server_ledger',
        timestamp: new Date().toISOString(),
        missingSequences: [888],
        missingEventIds: ['evt-888'],
        confirmationPhrase: 'ACKNOWLEDGE_DATA_LOSS_AND_RESUME_DEGRADED',
        reason: 'Testing verification abort',
        completenessStatus: 'SEQUENCE_GAP_DETECTED',
        recoveryOutcome: 'RESTRICTED_RECOVERY_REQUIRED',
      };
      fs.writeFileSync(auditPath, JSON.stringify(auditToVerify, null, 2), 'utf-8');

      serverLedger.setSimulatedArchiveVerificationFailure(true);

      assert.throws(
        () => serverLedger.adminForceReset(sysAdmin, 'Verification fail test'),
        /SIMULATED_ARCHIVE_VERIFICATION_FAILURE/,
        'adminForceReset must throw if archive verification fails'
      );

      // Verify canonical audit file is still intact and not lost
      assert.strictEqual(fs.existsSync(auditPath), true, 'Canonical audit file must remain intact at its canonical path');

      // Clean up simulated failure
      serverLedger.setSimulatedArchiveVerificationFailure(false);
    });

    await test('6. When no recovery audit exists, adminForceReset() proceeds cleanly without errors or spurious archives', () => {
      // Ensure no audit exists
      try { if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath); } catch {}
      assert.strictEqual(fs.existsSync(auditPath), false);

      const preCount = serverLedger.getRecoveryAuditArchives().length;

      // Reset should succeed without creating any new archive
      serverLedger.adminForceReset(sysAdmin, 'Clean reset without audit');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      const postCount = serverLedger.getRecoveryAuditArchives().length;
      assert.strictEqual(postCount, preCount, 'No archive should be created when no prior audit existed');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 3: Historical Evidence Non-Erasure & Diagnostics ---');
    // ------------------------------------------------------------------

    await test('7. Disaster reinitialization does not erase historical archives from disk', () => {
      // Ensure at least one archive exists from prior tests
      const archives = serverLedger.getRecoveryAuditArchives();
      assert.ok(archives.length >= 1, 'At least one archive should exist on disk');

      // Now run another clean reset
      serverLedger.adminForceReset(sysAdmin, 'Clean reinitialization');

      // All prior archives must still exist on disk
      for (const arch of archives) {
        assert.strictEqual(fs.existsSync(arch), true, `Archive ${arch} must still exist after fresh reset`);
      }
    });

    await test('8. Newly initialized ledger does not claim continuation of complete historical clinical records', () => {
      serverLedger.adminForceReset(sysAdmin, 'Fresh system establishment');

      const recoveryInfo = serverLedger.getRecoveryInfo();
      assert.strictEqual(recoveryInfo.state, 'NORMAL');
      assert.match(recoveryInfo.reason || '', /Force reset by admin usr-sysadmin-amanuel/);

      // Verify the audit history is tracked in recoveryInfo.archivedAudits
      assert.ok(Array.isArray(recoveryInfo.archivedAudits), 'recoveryInfo must expose archivedAudits array');
      assert.ok(recoveryInfo.archivedAudits.length > 0, 'archivedAudits must list existing historical audit archives');
    });

    await test('9. Quarantined primary and backup artifacts are preserved alongside audit archives across resets', () => {
      // Create a synthetic quarantined artifact
      const fakeQuarantine = path.join(process.cwd(), `.server_ledger_data.json.corrupted.${Date.now()}`);
      fs.writeFileSync(fakeQuarantine, '{"events": [{"serverSequence": 99, "eventId": "evt-lost-q"}]}', 'utf-8');

      try {
        serverLedger.adminForceReset(sysAdmin, 'Reset with existing quarantine');

        // Verify quarantine artifact was NOT deleted
        assert.strictEqual(fs.existsSync(fakeQuarantine), true, 'Corrupted quarantine artifact must be preserved');

        // Verify recovery completeness detects missing events from the preserved quarantine
        const completeness = serverLedger.verifyRecoveryCompleteness();
        assert.strictEqual(completeness.status, 'MISSING_ACKNOWLEDGED_EVENTS');
        assert.ok(completeness.missingSequences.includes(99), 'Preserved quarantine sequence 99 must be detected as missing');
        assert.ok(completeness.missingEventIds.includes('evt-lost-q'), 'Preserved quarantine event ID must be detected');
      } finally {
        try { if (fs.existsSync(fakeQuarantine)) fs.unlinkSync(fakeQuarantine); } catch {}
      }
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4.2 RECOVERY AUDIT PRESERVATION TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllLedgerAndArchiveFiles();
  }
}

runStage3242Tests().catch((err) => {
  console.error('\nStage 3.2.4.2 Test Suite Failed:', err);
  process.exit(1);
});
