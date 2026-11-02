/**
 * Jano Health — Stage 3.2.4.2.4.2.2 Verification Test Suite
 * Reset Journal Forensic Preservation & Lifecycle Consistency
 *
 * Verifies that:
 * 1. Finding FND-05: Every existing reset transaction journal (whether COMMITTED,
 *    IN_PROGRESS, malformed, or empty) is durably and verbatim preserved in a distinct,
 *    collision-resistant forensic archive before adminForceReset replaces it.
 * 2. Original raw file bytes are preserved byte-for-byte without distortion or loss.
 * 3. Canonical journal is kept intact at its canonical path until replacement.
 * 4. Archival and archive verification failures fail closed, aborting adminForceReset
 *    before any destructive modification occurs.
 * 5. Multiple resets create multiple distinct archives without overwriting prior evidence.
 * 6. Finding FND-04: Contradictory lifecycle fields are strictly rejected:
 *    - IN_PROGRESS records containing committedAt
 *    - IN_PROGRESS records with phase === 'COMPLETED'
 *    - COMMITTED records with missing, empty, or unparseable committedAt
 *    - COMMITTED records with committedAt preceding startedAt
 *    - COMMITTED records with phase === 'INITIALIZING_FRESH_STATE'
 * 7. Inconsistent or contradictory records cause loadFromDisk() to fail closed
 *    into RECOVERY_REQUIRED.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

async function runStage3242422Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.2.4.2.2: PRESERVATION & LIFECYCLE CONSISTENCY');
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
  const markerPath = serverLedger.getEstablishedMarkerPath();
  const commitMetaPath = serverLedger.getCommitMetadataPath();

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
    try { if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath); } catch {}
    try { if (fs.existsSync(commitMetaPath)) fs.unlinkSync(commitMetaPath); } catch {}

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
    console.log('--- Group 1: Finding FND-04 Lifecycle Field Consistency ---');
    // ------------------------------------------------------------------

    await test('1. validateResetTransactionRecord rejects IN_PROGRESS containing committedAt', () => {
      const invalidInProgress = {
        transactionId: 'tx-test-01',
        status: 'IN_PROGRESS',
        operatorId: 'usr-admin',
        reason: 'Testing lifecycle consistency',
        startedAt: '2026-10-12T10:00:00.000Z',
        committedAt: '2026-10-12T10:05:00.000Z', // CONTRADICTION!
      };
      const res = serverLedger.validateResetTransactionRecord(invalidInProgress);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('IN_PROGRESS record must not contain committedAt'));
    });

    await test('2. validateResetTransactionRecord rejects IN_PROGRESS with COMPLETED phase', () => {
      const invalidInProgressPhase = {
        transactionId: 'tx-test-02',
        status: 'IN_PROGRESS',
        operatorId: 'usr-admin',
        reason: 'Testing phase contradiction',
        startedAt: '2026-10-12T10:00:00.000Z',
        phase: 'COMPLETED', // CONTRADICTION!
      };
      const res = serverLedger.validateResetTransactionRecord(invalidInProgressPhase);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('IN_PROGRESS record cannot have COMPLETED phase'));
    });

    await test('3. validateResetTransactionRecord rejects COMMITTED missing committedAt', () => {
      const invalidCommittedMissing = {
        transactionId: 'tx-test-03',
        status: 'COMMITTED',
        operatorId: 'usr-admin',
        reason: 'Testing missing committedAt',
        startedAt: '2026-10-12T10:00:00.000Z',
      };
      const res = serverLedger.validateResetTransactionRecord(invalidCommittedMissing);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('COMMITTED record must include a non-empty committedAt timestamp'));
    });

    await test('4. validateResetTransactionRecord rejects COMMITTED with committedAt preceding startedAt', () => {
      const invalidTimeOrder = {
        transactionId: 'tx-test-04',
        status: 'COMMITTED',
        operatorId: 'usr-admin',
        reason: 'Testing inverted time order',
        startedAt: '2026-10-12T10:30:00.000Z',
        committedAt: '2026-10-12T10:00:00.000Z', // 30 mins before startedAt!
      };
      const res = serverLedger.validateResetTransactionRecord(invalidTimeOrder);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('committedAt timestamp cannot precede startedAt timestamp'));
    });

    await test('5. validateResetTransactionRecord rejects COMMITTED with INITIALIZING_FRESH_STATE phase', () => {
      const invalidCommittedPhase = {
        transactionId: 'tx-test-05',
        status: 'COMMITTED',
        operatorId: 'usr-admin',
        reason: 'Testing phase contradiction',
        startedAt: '2026-10-12T10:00:00.000Z',
        committedAt: '2026-10-12T10:05:00.000Z',
        phase: 'INITIALIZING_FRESH_STATE', // CONTRADICTION!
      };
      const res = serverLedger.validateResetTransactionRecord(invalidCommittedPhase);
      assert.strictEqual(res.valid, false);
      assert.ok(res.error?.includes('COMMITTED record cannot have INITIALIZING_FRESH_STATE phase'));
    });

    await test('6. Contradictory journal on disk fails closed into RECOVERY_REQUIRED at startup', () => {
      // Write contradictory record to disk
      const contradictoryRecord = {
        transactionId: 'tx-contradictory',
        status: 'IN_PROGRESS',
        operatorId: 'usr-admin',
        reason: 'Contradictory on disk',
        startedAt: new Date().toISOString(),
        committedAt: new Date().toISOString(), // Inconsistent!
      };
      fs.writeFileSync(resetTxPath, JSON.stringify(contradictoryRecord, null, 2), 'utf-8');

      // Reboot / reload from disk
      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('IN_PROGRESS record must not contain committedAt'));

      // Mutations blocked
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-blocked-01',
        eventType: 'PATIENT_ENCOUNTER_RECORDED',
        aggregateType: 'ENCOUNTER',
        aggregateId: 'enc-01',
        facilityId: 'fac-district-hospital-01',
        actorId: 'usr-doctor-01',
        clientVersion: 1,
        payload: {},
        timestamp: new Date().toISOString(),
      }]);
      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 2: Finding FND-05 Forensic Preservation Before Replacement ---');
    // ------------------------------------------------------------------

    await test('7. adminForceReset preserves existing malformed journal byte-for-byte in distinct archive', () => {
      // Create a corrupted/malformed journal on disk with raw non-JSON bytes
      const malformedBytes = Buffer.from('CORRUPTED_RAW_RESET_BYTES_!@#$%^&*()_{broken');
      fs.writeFileSync(resetTxPath, malformedBytes);

      const beforeArchives = serverLedger.getResetTransactionArchives();

      // Authorized administrator performs disaster recovery reset
      serverLedger.adminForceReset(sysAdmin, 'Recovery from corrupted journal');

      // State is now cleanly NORMAL
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Verify that a new archive was created
      const afterArchives = serverLedger.getResetTransactionArchives();
      assert.strictEqual(afterArchives.length, beforeArchives.length + 1, 'Exactly one archive must be created');

      const newestArchive = afterArchives[afterArchives.length - 1];
      assert.ok(fs.existsSync(newestArchive), 'Archive must exist on disk');

      // Verify raw bytes are identical byte-for-byte
      const archivedBytes = fs.readFileSync(newestArchive);
      assert.strictEqual(archivedBytes.length, malformedBytes.length);
      assert.ok(archivedBytes.equals(malformedBytes), 'Archived bytes must match original corrupt bytes exactly');

      // Verify new journal is valid COMMITTED and records the archive path
      const currentTx = serverLedger.getResetTransaction();
      assert.ok(currentTx);
      assert.strictEqual(currentTx.status, 'COMMITTED');
      assert.strictEqual(currentTx.archivedResetTxPath, newestArchive);
    });

    await test('8. adminForceReset preserves existing IN_PROGRESS journal verbatim before replacement', () => {
      // Write an IN_PROGRESS journal
      const inProgressData = JSON.stringify({
        transactionId: 'tx-interrupted-original',
        status: 'IN_PROGRESS',
        operatorId: 'usr-operator-amanuel',
        reason: 'First interrupted reset attempt',
        startedAt: '2026-10-12T08:00:00.000Z',
        phase: 'INITIALIZING_FRESH_STATE',
      }, null, 2);
      fs.writeFileSync(resetTxPath, inProgressData, 'utf-8');
      const origBytes = fs.readFileSync(resetTxPath);

      const beforeArchives = serverLedger.getResetTransactionArchives();

      // Subsequent reset by authorized administrator
      serverLedger.adminForceReset(sysAdmin, 'Subsequent clean reset over interrupted');

      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      const afterArchives = serverLedger.getResetTransactionArchives();
      assert.strictEqual(afterArchives.length, beforeArchives.length + 1);

      const newestArchive = afterArchives[afterArchives.length - 1];
      const archivedBytes = fs.readFileSync(newestArchive);
      assert.ok(archivedBytes.equals(origBytes), 'Archived bytes must match interrupted journal exactly');

      const currentTx = serverLedger.getResetTransaction();
      assert.ok(currentTx);
      assert.strictEqual(currentTx.status, 'COMMITTED');
      assert.strictEqual(currentTx.archivedResetTxPath, newestArchive);
    });

    await test('9. adminForceReset preserves existing COMMITTED journal verbatim on successive resets', () => {
      // Current journal is COMMITTED from test 8
      const curTx = serverLedger.getResetTransaction();
      assert.ok(curTx);
      assert.strictEqual(curTx.status, 'COMMITTED');
      const committedBytes = fs.readFileSync(resetTxPath);

      const beforeArchives = serverLedger.getResetTransactionArchives();

      // Trigger another force reset
      serverLedger.adminForceReset(sysAdmin, 'Successive administrative reset');

      const afterArchives = serverLedger.getResetTransactionArchives();
      assert.strictEqual(afterArchives.length, beforeArchives.length + 1);

      const newestArchive = afterArchives[afterArchives.length - 1];
      const archivedBytes = fs.readFileSync(newestArchive);
      assert.ok(archivedBytes.equals(committedBytes), 'Archived bytes must match previous COMMITTED journal exactly');
    });

    await test('10. Multiple consecutive resets accumulate distinct archives without overwriting', () => {
      const archivesBefore = serverLedger.getResetTransactionArchives();
      const count = archivesBefore.length;

      // Run 3 consecutive resets
      serverLedger.adminForceReset(sysAdmin, 'Sequential reset 1');
      serverLedger.adminForceReset(sysAdmin, 'Sequential reset 2');
      serverLedger.adminForceReset(sysAdmin, 'Sequential reset 3');

      const archivesAfter = serverLedger.getResetTransactionArchives();
      assert.strictEqual(archivesAfter.length, count + 3, 'Must create 3 distinct archives');

      // Verify each archive exists and is non-empty
      for (const arch of archivesAfter) {
        assert.ok(fs.existsSync(arch));
        const stat = fs.statSync(arch);
        assert.ok(stat.size > 0, 'Archive file must be non-empty');
      }

      // Verify all archive filenames are unique
      const uniqueNames = new Set(archivesAfter);
      assert.strictEqual(uniqueNames.size, archivesAfter.length, 'All archive filenames must be unique');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Group 3: Fail-Closed Behavior on Archival Failures ---');
    // ------------------------------------------------------------------

    await test('11. Simulated reset journal archival failure aborts adminForceReset fail-closed', () => {
      // Put a known journal on disk
      const testContent = Buffer.from('{"transactionId":"tx-preserve-me","status":"IN_PROGRESS","operatorId":"admin","reason":"test","startedAt":"2026-10-12T00:00:00.000Z"}');
      fs.writeFileSync(resetTxPath, testContent);

      serverLedger.setSimulatedResetJournalArchivalFailure(true);

      const beforeArchives = serverLedger.getResetTransactionArchives();

      // adminForceReset must throw and abort
      assert.throws(() => {
        serverLedger.adminForceReset(sysAdmin, 'Attempt with failing archival');
      }, /SIMULATED_RESET_JOURNAL_ARCHIVAL_FAILURE/);

      // Verify canonical journal is UNTOUCHED
      assert.ok(fs.existsSync(resetTxPath), 'Canonical journal must survive');
      const canonicalAfter = fs.readFileSync(resetTxPath);
      assert.ok(canonicalAfter.equals(testContent), 'Canonical journal must remain identical byte-for-byte');

      // Verify no extra archives were left behind
      const afterArchives = serverLedger.getResetTransactionArchives();
      assert.strictEqual(afterArchives.length, beforeArchives.length);

      serverLedger.setSimulatedResetJournalArchivalFailure(false);
    });

    await test('12. Simulated archive verification failure aborts adminForceReset fail-closed', () => {
      const testContent = Buffer.from('{"transactionId":"tx-verification-test","status":"IN_PROGRESS","operatorId":"admin","reason":"test","startedAt":"2026-10-12T00:00:00.000Z"}');
      fs.writeFileSync(resetTxPath, testContent);

      serverLedger.setSimulatedResetJournalArchiveVerificationFailure(true);

      // adminForceReset must throw and abort
      assert.throws(() => {
        serverLedger.adminForceReset(sysAdmin, 'Attempt with failing verification');
      }, /SIMULATED_RESET_JOURNAL_ARCHIVE_VERIFICATION_FAILURE/);

      // Verify canonical journal is UNTOUCHED
      assert.ok(fs.existsSync(resetTxPath));
      const canonicalAfter = fs.readFileSync(resetTxPath);
      assert.ok(canonicalAfter.equals(testContent), 'Canonical journal must remain unmodified');

      serverLedger.setSimulatedResetJournalArchiveVerificationFailure(false);
    });

    await test('13. When no reset transaction journal exists, adminForceReset proceeds cleanly', () => {
      // Ensure reset transaction file is deleted
      if (fs.existsSync(resetTxPath)) fs.unlinkSync(resetTxPath);
      assert.strictEqual(fs.existsSync(resetTxPath), false);

      const beforeArchives = serverLedger.getResetTransactionArchives();

      // Force reset should succeed without errors and without archiving non-existent journal
      serverLedger.adminForceReset(sysAdmin, 'Reset on clean slate');
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      const afterArchives = serverLedger.getResetTransactionArchives();
      assert.strictEqual(afterArchives.length, beforeArchives.length, 'No spurious archives created');

      const tx = serverLedger.getResetTransaction();
      assert.ok(tx);
      assert.strictEqual(tx.status, 'COMMITTED');
      assert.strictEqual(tx.archivedResetTxPath, null);
    });

    await test('14. Unauthorized user cannot trigger reset or journal archival', () => {
      fs.writeFileSync(resetTxPath, '{"transactionId":"tx-unauthorized-target"}');

      assert.throws(() => {
        serverLedger.adminForceReset(unauthorizedClinician, 'Unauthorized attempt');
      }, /UNAUTHORIZED/);

      // Canonical file remains untouched
      const raw = fs.readFileSync(resetTxPath, 'utf-8');
      assert.strictEqual(raw, '{"transactionId":"tx-unauthorized-target"}');
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4.2.4.2.2 PRESERVATION & CONSISTENCY TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllFiles();
  }
}

runStage3242422Tests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
