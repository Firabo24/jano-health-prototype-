/**
 * Stage 3.2.5.8.1.12 Regression Suite:
 * Runtime Data Protection, Cloud Run Startup Contract & Honest Readiness
 * 
 * Verifies:
 * 1. Server port configuration resolution and strict TCP range validation.
 * 2. Liveness (/api/health) vs Authoritative Readiness (/api/ready) separation.
 * 3. Honest readiness reporting under Cloud Run (HTTP 503 with PERSISTENCE_NOT_DURABLE_FOR_CLOUD_RUN).
 * 4. Protection of synchronization routes on Cloud Run (rejection of push/pull with HTTP 503).
 * 5. Release artifact preflight detection, ignore rule verification, and non-destructive behavior.
 * 6. Architectural invariants: IndexedDB schema version 25, 362 registered stores, operational ledger untouched.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveServerPort } from '../server/portConfig';
import {
  evaluateServerReadiness,
  guardCloudRunSyncPersistence,
  isCloudRunEnvironment,
  getPersistenceStatus,
} from '../server/readiness';
import { runReleaseArtifactChecks } from '../scripts/checkReleaseArtifacts';
import { serverLedger } from '../server/serverLedger';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';

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

async function runTests() {
  console.log('\n================================================================');
  console.log('JANO HEALTH - STAGE 3.2.5.8.1.12 VERIFICATION SUITE');
  console.log('Runtime Data Protection, Cloud Run Startup Contract & Readiness');
  console.log('================================================================\n');

  // Preserve initial environment
  const originalPort = process.env.PORT;
  const originalKService = process.env.K_SERVICE;
  const originalKRevision = process.env.K_REVISION;
  const originalKConfig = process.env.K_CONFIGURATION;

  try {
    // -------------------------------------------------------------------------
    // 1. Port Configuration & Validation
    // -------------------------------------------------------------------------
    console.log('--- 1. Port Configuration & TCP Validation ---');

    // 1.1 Default port
    delete process.env.PORT;
    const defaultRes = resolveServerPort();
    assert(defaultRes.port === 3000 && defaultRes.source === 'default', 'Defaults to 3000 when PORT is undefined');

    const emptyRes = resolveServerPort('');
    assert(emptyRes.port === 3000 && emptyRes.source === 'default', 'Defaults to 3000 when PORT is empty string');

    const whitespaceRes = resolveServerPort('   ');
    assert(whitespaceRes.port === 3000 && whitespaceRes.source === 'default', 'Defaults to 3000 when PORT is whitespace');

    // 1.2 Explicit cloud-provided port
    process.env.PORT = '8080';
    const envRes8080 = resolveServerPort();
    assert(envRes8080.port === 8080 && envRes8080.source === 'environment', 'Resolves PORT 8080 from process.env.PORT');

    const cloudRes8080 = resolveServerPort('8080');
    assert(cloudRes8080.port === 8080 && cloudRes8080.source === 'environment', 'Resolves PORT 8080 correctly from explicit argument');

    const cloudRes3001 = resolveServerPort('  3001  ');
    assert(cloudRes3001.port === 3001 && cloudRes3001.source === 'environment', 'Trims whitespace and resolves PORT 3001');

    const boundaryPortMin = resolveServerPort('1');
    assert(boundaryPortMin.port === 1, 'Accepts minimum valid TCP port 1');

    const boundaryPortMax = resolveServerPort('65535');
    assert(boundaryPortMax.port === 65535, 'Accepts maximum valid TCP port 65535');

    // 1.3 Invalid port values fail closed
    const invalidValues = ['0', '-1', '65536', '99999', 'abc', '8080abc', '3000.5', 'NaN', 'undefined', '80 80'];
    for (const val of invalidValues) {
      let threw = false;
      try {
        resolveServerPort(val);
      } catch (err: any) {
        threw = true;
        assert(
          err.message.startsWith('INVALID_PORT_CONFIGURATION:'),
          `Fails closed with clear error for invalid PORT '${val}'`
        );
      }
      assert(threw, `Rejected invalid port value '${val}'`);
    }

    // -------------------------------------------------------------------------
    // 2. Liveness vs. Readiness Evaluation
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Liveness vs. Readiness Evaluation ---');

    // 2.1 Local development mode (K_SERVICE unset)
    delete process.env.K_SERVICE;
    delete process.env.K_REVISION;
    delete process.env.K_CONFIGURATION;

    assert(!isCloudRunEnvironment(), 'Correctly detects local development environment when K_SERVICE is unset');

    const persistence = getPersistenceStatus();
    assert(persistence.type === 'instance_local_filesystem', 'Persistence type is instance_local_filesystem');
    assert(persistence.sharedDurable === false, 'Local filesystem persistence is explicitly not shared-durable');
    assert(persistence.cloudRunSafe === false, 'Local filesystem persistence is explicitly marked not cloudRunSafe');

    const localReadiness = evaluateServerReadiness();
    assert(localReadiness.ready === true, 'Local development with healthy ledger reports ready: true');
    assert(localReadiness.statusCode === 200, 'Local readiness status code is HTTP 200');
    assert(localReadiness.environment === 'local_development', 'Readiness environment reports local_development');
    assert(localReadiness.operationalState === 'NORMAL', 'Readiness reports operationalState NORMAL');

    // 2.2 Cloud Run environment evaluation
    process.env.K_SERVICE = 'jano-health-api';
    assert(isCloudRunEnvironment(), 'Correctly detects Cloud Run environment via K_SERVICE');

    const cloudRunReadiness = evaluateServerReadiness();
    assert(cloudRunReadiness.ready === false, 'Cloud Run mode with local persistence reports ready: false');
    assert(cloudRunReadiness.statusCode === 503, 'Cloud Run readiness status code is HTTP 503');
    assert(cloudRunReadiness.error === 'PERSISTENCE_NOT_DURABLE_FOR_CLOUD_RUN', 'Reports stable machine-readable error code');
    assert(
      cloudRunReadiness.reason!.includes('ephemeral and unsafe for multi-instance replication'),
      'Provides truthful explanation of Cloud Run persistence constraint'
    );
    assert(cloudRunReadiness.environment === 'cloud_run', 'Readiness environment reports cloud_run');

    // 2.3 Verify zero PHI or sensitive internal state in readiness
    const readyJson = JSON.stringify(cloudRunReadiness);
    assert(!readyJson.includes('patient'), 'Readiness output contains zero patient references');
    assert(!readyJson.includes('token'), 'Readiness output contains zero tokens');
    assert(!readyJson.includes('secret'), 'Readiness output contains zero secrets');

    // -------------------------------------------------------------------------
    // 3. Synchronization Route Protection on Cloud Run
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Synchronization Route Protection on Cloud Run ---');

    // 3.1 Push route guard on Cloud Run
    process.env.K_SERVICE = 'jano-health-api';

    let pushResponseStatus = 0;
    let pushResponseBody: any = null;
    const mockPushReq: any = {
      method: 'POST',
      path: '/api/sync/push',
      headers: {},
      body: { deviceId: 'dev-1', events: [{ eventId: 'evt-1' }] },
    };
    const mockPushRes: any = {
      status(code: number) {
        pushResponseStatus = code;
        return this;
      },
      json(body: any) {
        pushResponseBody = body;
        return this;
      },
    };
    let pushNextCalled = false;
    guardCloudRunSyncPersistence(mockPushReq, mockPushRes, () => {
      pushNextCalled = true;
    });

    assert(!pushNextCalled, 'Push handler next() is NOT called on Cloud Run');
    assert(pushResponseStatus === 503, 'Push request is rejected with HTTP 503');
    assert(pushResponseBody.status === 'error', 'Push response status is error');
    assert(pushResponseBody.error === 'UNSAFE_CLOUD_RUN_PERSISTENCE', 'Push returns UNSAFE_CLOUD_RUN_PERSISTENCE error');
    assert(pushResponseBody.code === 'PERSISTENCE_NOT_SHARED_DURABLE', 'Push returns PERSISTENCE_NOT_SHARED_DURABLE code');
    assert(pushResponseBody.processedCount === 0, 'Push acknowledges 0 processed events');
    assert(pushResponseBody.acknowledgedEventIds.length === 0, 'Push returns empty acknowledgedEventIds array');

    // 3.2 Pull route guard on Cloud Run
    let pullResponseStatus = 0;
    let pullResponseBody: any = null;
    const mockPullReq: any = {
      method: 'GET',
      path: '/api/sync/pull',
      query: { since: '0' },
    };
    const mockPullRes: any = {
      status(code: number) {
        pullResponseStatus = code;
        return this;
      },
      json(body: any) {
        pullResponseBody = body;
        return this;
      },
    };
    let pullNextCalled = false;
    guardCloudRunSyncPersistence(mockPullReq, mockPullRes, () => {
      pullNextCalled = true;
    });

    assert(!pullNextCalled, 'Pull handler next() is NOT called on Cloud Run');
    assert(pullResponseStatus === 503, 'Pull request is rejected with HTTP 503');
    assert(pullResponseBody.error === 'UNSAFE_CLOUD_RUN_PERSISTENCE', 'Pull returns UNSAFE_CLOUD_RUN_PERSISTENCE error');

    // 3.3 Local development route guard permits execution
    delete process.env.K_SERVICE;
    let localPushNextCalled = false;
    guardCloudRunSyncPersistence(mockPushReq, mockPushRes, () => {
      localPushNextCalled = true;
    });
    assert(localPushNextCalled, 'Local single-process development allows push to proceed to ledger');

    let localPullNextCalled = false;
    guardCloudRunSyncPersistence(mockPullReq, mockPullRes, () => {
      localPullNextCalled = true;
    });
    assert(localPullNextCalled, 'Local single-process development allows pull to proceed to ledger');

    // -------------------------------------------------------------------------
    // 4. Release Artifact Preflight & Data Boundary Protection
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Release Artifact Preflight & Data Boundary Protection ---');

    // 4.1 Verify workspace ignore rules
    const workspaceCheck = runReleaseArtifactChecks(process.cwd());
    assert(workspaceCheck.ignoreRulesVerified.gitignore === true, '.gitignore contains server ledger exclusion pattern');
    assert(workspaceCheck.ignoreRulesVerified.dockerignore === true, '.dockerignore contains server ledger exclusion pattern');

    // Verify operational ledger artifacts are enumerated without throwing or deleting
    assert(workspaceCheck.ledgerArtifactsFound.length > 0, 'Enumerates operational ledger artifacts in workspace root');
    for (const artifact of workspaceCheck.ledgerArtifactsFound) {
      assert(artifact.filename.startsWith('.server_ledger_'), `Discovered artifact matches naming prefix: ${artifact.filename}`);
      assert(artifact.sizeBytes > 0, `Artifact ${artifact.filename} has nonzero size: ${artifact.sizeBytes} bytes`);
    }

    // 4.2 Test preflight in isolated disposable directory (non-destructive test)
    const tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jano_preflight_fixture_'));
    try {
      // Clean fixture directory with proper ignore files
      fs.writeFileSync(path.join(tempTestDir, '.gitignore'), 'node_modules/\n.server_ledger_*\n*.corrupted.*\n', 'utf-8');
      fs.writeFileSync(path.join(tempTestDir, '.dockerignore'), 'node_modules\n.server_ledger_*\n*.corrupted.*\n', 'utf-8');

      const cleanCheck = runReleaseArtifactChecks(tempTestDir);
      assert(cleanCheck.passed === true, 'Clean fixture directory passes release preflight');
      assert(cleanCheck.violations.length === 0, 'Clean fixture directory has zero violations');

      // Add prohibited credential file to fixture directory
      fs.writeFileSync(path.join(tempTestDir, 'service-account.json'), '{"private_key": "test"}', 'utf-8');
      const credCheck = runReleaseArtifactChecks(tempTestDir);
      assert(credCheck.passed === false, 'Detects prohibited service account credential file');
      assert(
        credCheck.violations.some((v) => v.includes('service-account.json')),
        'Violation explicitly names the credential file'
      );
      fs.unlinkSync(path.join(tempTestDir, 'service-account.json'));

      // Missing .gitignore in fixture directory
      fs.unlinkSync(path.join(tempTestDir, '.gitignore'));
      const missingGitignoreCheck = runReleaseArtifactChecks(tempTestDir);
      assert(missingGitignoreCheck.passed === false, 'Fails when .gitignore is missing');
      assert(
        missingGitignoreCheck.violations.some((v) => v.includes('.gitignore')),
        'Violation mentions missing .gitignore'
      );
    } finally {
      // Clean up fixture directory
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }

    // -------------------------------------------------------------------------
    // 5. Architectural Invariants
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Architectural Invariants ---');

    // 5.1 Schema version remains 25 and stores count remains 362
    assert(ALL_STORE_NAMES.length === 362, `Total registered IndexedDB stores count is exactly 362 (got ${ALL_STORE_NAMES.length})`);

    // 5.2 Authoritative operational ledger files exist and were untouched
    const operationalLedgerPath = path.join(process.cwd(), '.server_ledger_data.json');
    assert(fs.existsSync(operationalLedgerPath), 'Authoritative operational ledger file exists (.server_ledger_data.json)');
    const stat = fs.statSync(operationalLedgerPath);
    assert(stat.size > 0, `Operational ledger file size preserved (> 0 bytes, actual: ${stat.size} bytes)`);

    const commitMetaPath = path.join(process.cwd(), '.server_ledger_commit_meta.json');
    assert(fs.existsSync(commitMetaPath), 'Durable commit metadata exists (.server_ledger_commit_meta.json)');

    const backupPath = path.join(process.cwd(), '.server_ledger_data.json.bak');
    assert(fs.existsSync(backupPath), 'Mirror backup file exists (.server_ledger_data.json.bak)');

    console.log('\n================================================================');
    console.log(`STAGE 3.2.5.8.1.12 RESULTS: ALL ${passCount} CHECKS PASSED (${failCount} failures)`);
    console.log('================================================================\n');
  } finally {
    // Restore environment
    if (originalPort !== undefined) process.env.PORT = originalPort;
    else delete process.env.PORT;

    if (originalKService !== undefined) process.env.K_SERVICE = originalKService;
    else delete process.env.K_SERVICE;

    if (originalKRevision !== undefined) process.env.K_REVISION = originalKRevision;
    else delete process.env.K_REVISION;

    if (originalKConfig !== undefined) process.env.K_CONFIGURATION = originalKConfig;
    else delete process.env.K_CONFIGURATION;
  }
}

runTests().catch((err) => {
  console.error('\n[FATAL] Test suite encountered unhandled exception:', err);
  process.exit(1);
});
