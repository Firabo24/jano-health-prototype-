/**
 * Jano Health — Stage 3.2.4.2.4.2 Verification Test Suite
 * Reset Journal Validation & Fail-Closed Startup
 *
 * Verifies that:
 * 1. An existing but malformed, unreadable, empty, or structurally invalid
 *    .server_ledger_reset_transaction.json is NEVER treated as null or ignored.
 * 2. loadFromDisk() FAILS CLOSED into RECOVERY_REQUIRED whenever a corrupted journal
 *    is detected, even if the primary ledger is valid and canonical recovery audit is missing.
 * 3. All clinical mutations remain strictly blocked in RECOVERY_REQUIRED.
 * 4. Forensic diagnostics (resetTransactionCorrupted, resetTransactionError) are preserved.
 * 5. An authorized administrator can recover the ledger cleanly via adminForceReset.
 * 6. Unauthorized users cannot bypass recovery or initiate resets.
 */

import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { serverLedger, DataLossAuditRecord } from '../server/serverLedger';
import { DEVELOPMENT_PRINCIPALS } from '../server/authMiddleware';

async function runStage324242Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.4.2.4.2: RESET JOURNAL VALIDATION & FAIL-CLOSED STARTUP');
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

    // Baseline: server is in NORMAL state
    assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

    // ------------------------------------------------------------------
    console.log('--- Test 1: Malformed JSON Syntax in Reset Journal ---');
    // ------------------------------------------------------------------

    await test('1. Malformed JSON syntax in reset journal fails closed into RECOVERY_REQUIRED', () => {
      // Intentionally corrupt the journal with malformed JSON (unclosed curly brace)
      fs.writeFileSync(resetTxPath, '{"transactionId": "tx-broken", "status": "IN_PROGRESS"');

      // Canonical audit is absent
      if (fs.existsSync(auditPath)) fs.unlinkSync(auditPath);

      // Reload/reboot from disk
      serverLedger.reloadFromDisk();

      // Operational state MUST NOT be NORMAL! Must be RECOVERY_REQUIRED!
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'RECOVERY_REQUIRED');
      assert.strictEqual(info.reconciliationRequired, true);
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('MALFORMED_JSON'), 'Diagnostics must record MALFORMED_JSON');
      assert.ok(info.reason?.includes('CORRUPTED_RESET_TRANSACTION_JOURNAL'));

      // Mutations must be rejected
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-blocked-malformed',
        eventType: 'PATIENT_ENCOUNTER_RECORDED',
        aggregateType: 'ENCOUNTER',
        aggregateId: 'enc-test',
        facilityId: 'fac-district-hospital-01',
        actorId: 'usr-doctor-01',
        clientVersion: 1,
        payload: { note: 'Must not commit' },
        timestamp: new Date().toISOString(),
      }]);
      assert.strictEqual(pushRes.status, 'error');
      assert.strictEqual(pushRes.error, 'LEDGER_RECOVERY_REQUIRED');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Empty or Whitespace-Only Reset Journal ---');
    // ------------------------------------------------------------------

    await test('2. Empty or whitespace-only reset journal fails closed into RECOVERY_REQUIRED', () => {
      // Write whitespace-only file
      fs.writeFileSync(resetTxPath, '   \n\t  \n');

      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('EMPTY_FILE'));

      const insp = serverLedger.inspectResetTransactionJournal();
      assert.strictEqual(insp.exists, true);
      assert.strictEqual(insp.valid, false);
      assert.strictEqual(insp.record, null);
      assert.ok(insp.error?.includes('EMPTY_FILE'));
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Non-Object JSON Payload in Journal ---');
    // ------------------------------------------------------------------

    await test('3. Non-object JSON in reset journal (array, primitive) fails closed into RECOVERY_REQUIRED', () => {
      // Write JSON array
      fs.writeFileSync(resetTxPath, JSON.stringify([1, 2, 3]));

      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('INVALID_SCHEMA'));

      // Write JSON primitive number
      fs.writeFileSync(resetTxPath, '12345');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Write JSON null
      fs.writeFileSync(resetTxPath, 'null');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Missing Required Fields or Invalid Status ---');
    // ------------------------------------------------------------------

    await test('4. Structurally invalid journal (missing transactionId, invalid status) fails closed', () => {
      // Missing transactionId
      fs.writeFileSync(resetTxPath, JSON.stringify({
        status: 'IN_PROGRESS',
        operatorId: 'usr-admin',
        reason: 'test',
        startedAt: new Date().toISOString(),
      }));

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      let info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('transactionId'));

      // Invalid status value
      fs.writeFileSync(resetTxPath, JSON.stringify({
        transactionId: 'tx-test-invalid-status',
        status: 'UNKNOWN_STATUS',
        operatorId: 'usr-admin',
        reason: 'test',
        startedAt: new Date().toISOString(),
      }));

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('status'));

      // Missing operatorId
      fs.writeFileSync(resetTxPath, JSON.stringify({
        transactionId: 'tx-test-no-op',
        status: 'IN_PROGRESS',
        operatorId: '   ',
        reason: 'test',
        startedAt: new Date().toISOString(),
      }));

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('operatorId'));

      // Invalid unparseable startedAt timestamp
      fs.writeFileSync(resetTxPath, JSON.stringify({
        transactionId: 'tx-test-bad-date',
        status: 'IN_PROGRESS',
        operatorId: 'usr-admin',
        reason: 'test',
        startedAt: 'not-a-date-string',
      }));

      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('startedAt'));
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 5: COMMITTED Status Missing committedAt Timestamp ---');
    // ------------------------------------------------------------------

    await test('5. COMMITTED status missing committedAt timestamp fails closed into RECOVERY_REQUIRED', () => {
      // COMMITTED but missing committedAt
      fs.writeFileSync(resetTxPath, JSON.stringify({
        transactionId: 'tx-committed-no-timestamp',
        status: 'COMMITTED',
        operatorId: 'usr-admin',
        reason: 'test',
        startedAt: new Date().toISOString(),
      }));

      serverLedger.reloadFromDisk();

      // Must NOT allow NORMAL! Incomplete committed transaction is structurally invalid.
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('committedAt'));
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Simulated Unreadable File / I/O Error ---');
    // ------------------------------------------------------------------

    await test('6. Unreadable reset journal (simulated I/O failure) fails closed into RECOVERY_REQUIRED', () => {
      // Put a valid journal first
      fs.writeFileSync(resetTxPath, JSON.stringify({
        transactionId: 'tx-unreadable-test',
        status: 'COMMITTED',
        operatorId: 'usr-admin',
        reason: 'test',
        startedAt: new Date().toISOString(),
        committedAt: new Date().toISOString(),
      }));

      // Enable simulated read failure
      serverLedger.setSimulatedResetJournalReadFailure(true);

      serverLedger.reloadFromDisk();

      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.resetTransactionCorrupted, true);
      assert.ok(info.resetTransactionError?.includes('SIMULATED_RESET_JOURNAL_READ_FAILURE'));

      serverLedger.setSimulatedResetJournalReadFailure(false);
    });

    // ------------------------------------------------------------------
    console.log('\n--- Test 7: Authorized Administrative Recovery from Corrupted Journal ---');
    // ------------------------------------------------------------------

    await test('7. Authorized adminForceReset successfully recovers from corrupted journal state', () => {
      // Corrupt the journal
      fs.writeFileSync(resetTxPath, '{CORRUPT_BYTES}');
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'RECOVERY_REQUIRED');

      // Unauthorized clinician cannot reset
      assert.throws(
        () => serverLedger.adminForceReset(unauthorizedClinician, 'Malicious bypass attempt'),
        /UNAUTHORIZED/
      );

      // Authorized system administrator performs force reset
      serverLedger.adminForceReset(sysAdmin, 'Recovery from corrupted reset journal');

      // State is now cleanly NORMAL
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');

      // Journal is now durably COMMITTED and valid
      const tx = serverLedger.getResetTransaction();
      assert.ok(tx, 'Journal must be valid');
      assert.strictEqual(tx.status, 'COMMITTED');
      assert.ok(tx.committedAt);
      assert.strictEqual(tx.operatorId, 'usr-sysadmin-amanuel');

      // Reloading from disk confirms clean NORMAL startup
      serverLedger.reloadFromDisk();
      assert.strictEqual(serverLedger.getOperationalState(), 'NORMAL');
      const info = serverLedger.getRecoveryInfo();
      assert.strictEqual(info.state, 'NORMAL');
      assert.strictEqual(info.reconciliationRequired, false);
      assert.strictEqual(info.resetTransactionCorrupted, false);
      assert.strictEqual(info.resetTransaction?.status, 'COMMITTED');

      // Push batches now succeed
      const pushRes = serverLedger.processPushBatch('dev-station', new Date().toISOString(), [{
        eventId: 'evt-recovery-verified-01',
        eventType: 'PATIENT_ENCOUNTER_RECORDED',
        aggregateType: 'ENCOUNTER',
        aggregateId: 'enc-recovery-01',
        facilityId: 'fac-district-hospital-01',
        actorId: 'usr-doctor-01',
        clientVersion: 1,
        payload: { clinicalNote: 'Post-recovery triage operational' },
        timestamp: new Date().toISOString(),
      }]);
      assert.strictEqual(pushRes.status, 'acknowledged');
      assert.strictEqual(pushRes.acknowledgedEventIds.length, 1);
    });

    console.log('\n========================================================================');
    console.log(`ALL ${passed}/${passed} STAGE 3.2.4.2.4.2 JOURNAL VALIDATION TESTS PASSED!`);
    console.log('========================================================================\n');
  } finally {
    cleanAllFiles();
  }
}

runStage324242Tests().catch((err) => {
  console.error('\nTest runner failed:', err);
  process.exit(1);
});
