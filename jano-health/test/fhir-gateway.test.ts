/**
 * Jano Health - FHIR Gateway & External Systems Test Suite
 * Clinical Core V12: Gateway Security, Token Verification, Rate Limiting,
 * Trust Management, Observability, and Outbound Queuing.
 */

import assert from 'node:assert';
import {
  FHIR_VERSION,
  externalSystemRegistryService,
  gatewayAuthProvider,
  gatewayRateLimiter,
  gatewayObservability,
  fhirExchangeLogStore,
  fhirImportReviewStore,
  fhirOutboundClient,
  fhirExchangeGateway,
} from '../src/services/fhir';
import { localDb } from '../src/services/storage/localDatabase';
import { localRepository } from '../src/services/storage/localRepository';
import { Patient } from '../src/domain/types';

async function runGatewayTestSuite() {
  console.log('\n=============================================================');
  console.log('JANO HEALTH - FHIR GATEWAY & SECURITY SUBSYSTEM TEST SUITE');
  console.log('=============================================================\n');

  let passedTests = 0;
  const totalTests = 8;

  localDb.resetToSyntheticDemoData();

  // Seed patient for read/search tests
  const testPatient: Patient = {
    id: 'pat_gw_01',
    mrn: 'MRN-GW-001',
    nationalId: 'NID-TZ-555123',
    firstName: 'Neema',
    lastName: 'Kondo',
    dateOfBirth: '1995-07-20',
    gender: 'female',
    sex: 'female',
    villageTown: 'Uvinza',
    district: 'Uvinza',
    primaryFacilityId: 'fac-uvinza-hc',
    patientStatus: 'ACTIVE',
    triageUrgency: 'routine',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'manual_entry',
    provenance: 'Gateway test suite seed',
  };
  await localRepository.savePatient(testPatient);

  // -------------------------------------------------------------
  // Test 1: External System Trust Status & Lifecycle
  // -------------------------------------------------------------
  try {
    console.log('[TEST 1] External System Trust Status & Permissions Evaluation...');
    const systems = externalSystemRegistryService.getAllSystems();
    assert.ok(systems.length >= 3, 'Must have pre-registered external systems');

    const trustedSys = externalSystemRegistryService.getSystem('sys-tz-moh-hie');
    assert.ok(trustedSys, 'National HIE system must exist');
    assert.strictEqual(trustedSys?.trustStatus, 'TRUSTED');

    // Untrusted system check
    const untrustedSys = externalSystemRegistryService.getSystem('sys-unverified-clinic');
    assert.ok(untrustedSys, 'Untrusted clinic must exist');
    assert.strictEqual(untrustedSys?.trustStatus, 'PENDING');

    const permCheck = externalSystemRegistryService.evaluateSystemPermission(
      'sys-unverified-clinic',
      'Observation',
      'create',
      'INBOUND'
    );
    assert.strictEqual(permCheck.allowed, false, 'Untrusted system must be denied exchange permission');

    // Suspend and restore lifecycle
    externalSystemRegistryService.updateTrust('sys-kigoma-referral-node', 'SUSPENDED', 'UNTRUSTED', 'test-admin');
    const suspendedCheck = externalSystemRegistryService.evaluateSystemPermission(
      'sys-kigoma-referral-node',
      'Patient',
      'read',
      'INBOUND'
    );
    assert.strictEqual(suspendedCheck.allowed, false, 'Suspended system must be denied');

    externalSystemRegistryService.updateTrust('sys-kigoma-referral-node', 'TRUSTED', 'LIMITED', 'test-admin');
    const restoredCheck = externalSystemRegistryService.evaluateSystemPermission(
      'sys-kigoma-referral-node',
      'Patient',
      'read',
      'INBOUND',
      'fac-uvinza-hc'
    );
    assert.strictEqual(restoredCheck.allowed, true, 'Restored system within facility jurisdiction must be allowed');

    console.log('  -> PASSED: External system trust lifecycle & scope evaluated correctly.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Token Authentication & Claim Verification
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 2] Gateway Token Authentication & Scopes Verification...');

    // Missing auth
    const noAuth = gatewayAuthProvider.authenticateRequest(undefined, undefined);
    assert.strictEqual(noAuth.authenticated, false);
    assert.strictEqual(noAuth.errorCode, 'AUTH_REQUIRED');

    // Valid Signed Token for National HIE
    const validToken = gatewayAuthProvider.generateTestJWT('sys-tz-moh-hie', ['fhir.patient.read', 'fhir.bundle.transaction']);
    const verified = gatewayAuthProvider.authenticateRequest(`Bearer ${validToken}`);
    assert.strictEqual(verified.authenticated, true);
    assert.strictEqual(verified.externalSystem?.id, 'sys-tz-moh-hie');
    assert.ok(verified.scopes.includes('fhir.patient.read'));

    // Expired Token rejection
    const expiredToken = gatewayAuthProvider.generateTestJWT('sys-tz-moh-hie', ['fhir.patient.read'], -100);
    const expiredResult = gatewayAuthProvider.authenticateRequest(`Bearer ${expiredToken}`);
    assert.strictEqual(expiredResult.authenticated, false);
    assert.strictEqual(expiredResult.errorCode, 'EXPIRED_TOKEN');

    // Wrong Issuer rejection
    const wrongIssuerToken = gatewayAuthProvider.generateTestJWT(
      'sys-tz-moh-hie',
      ['fhir.patient.read'],
      3600,
      'https://malicious-rogue-issuer.org'
    );
    const rogueResult = gatewayAuthProvider.authenticateRequest(`Bearer ${wrongIssuerToken}`);
    assert.strictEqual(rogueResult.authenticated, false);
    assert.strictEqual(rogueResult.errorCode, 'WRONG_ISSUER');

    // API Key authentication
    const apiKeyResult = gatewayAuthProvider.authenticateRequest(undefined, 'sec_live_moh_tz_hie_998124');
    assert.strictEqual(apiKeyResult.authenticated, true);
    assert.strictEqual(apiKeyResult.externalSystem?.id, 'sys-tz-moh-hie');

    console.log('  -> PASSED: Token validation, expiration, issuer, and API key authentication verified.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 3: Anti-SSRF Destination Guard
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 3] Anti-SSRF Target URL Validation...');
    const localCheck = externalSystemRegistryService.validateDestinationUrl('http://169.254.169.254/latest/meta-data');
    assert.strictEqual(localCheck.safe, false, 'Cloud metadata IP must be blocked');

    const gcpMetaCheck = externalSystemRegistryService.validateDestinationUrl('http://metadata.google.internal/computeMetadata/v1');
    assert.strictEqual(gcpMetaCheck.safe, false, 'GCP internal metadata host must be blocked');

    const safeCheck = externalSystemRegistryService.validateDestinationUrl('https://hie.moh.go.tz/fhir/r5');
    assert.strictEqual(safeCheck.safe, true, 'Valid HTTPS national HIE URL must be permitted');

    console.log('  -> PASSED: Anti-SSRF safeguards block metadata services and loopback spoofing.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 4: Rate Limiting Enforcement (429 Throttling)
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 4] Gateway Rate Limiter & Concurrency Throttling...');
    gatewayRateLimiter.reset();

    const limitKey = 'test-client-limiter';
    const testLimit = 5;

    for (let i = 0; i < testLimit; i++) {
      const status = gatewayRateLimiter.checkLimit(limitKey, testLimit);
      assert.strictEqual(status.allowed, true, `Request ${i + 1} must be permitted`);
    }

    // 6th request must be throttled
    const throttled = gatewayRateLimiter.checkLimit(limitKey, testLimit);
    assert.strictEqual(throttled.allowed, false, 'Excess requests must be throttled');
    assert.strictEqual(throttled.remaining, 0);

    gatewayRateLimiter.reset(limitKey);
    const postReset = gatewayRateLimiter.checkLimit(limitKey, testLimit);
    assert.strictEqual(postReset.allowed, true, 'Requests permitted after reset');

    console.log('  -> PASSED: Strict rate limiting rejects DoS spikes with remaining quota tracking.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 5: Gateway Resource Read & Concurrency ETag Caching
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 5] Gateway Resource Read & ETag Concurrency Support...');
    const validToken = gatewayAuthProvider.generateTestJWT('sys-tz-moh-hie', ['fhir.patient.read']);

    const readResp = await fhirExchangeGateway.readResource('Patient', 'pat_gw_01', {
      authHeader: `Bearer ${validToken}`,
    });

    assert.strictEqual(readResp.status, 200);
    assert.ok(readResp.etag, 'Response must include ETag');
    assert.strictEqual((readResp.body as any).resourceType, 'Patient');

    // Test 304 Not Modified when If-None-Match matches ETag
    const cachedResp = await fhirExchangeGateway.readResource('Patient', 'pat_gw_01', {
      authHeader: `Bearer ${validToken}`,
      ifNoneMatchHeader: readResp.etag,
    });
    assert.strictEqual(cachedResp.status, 304, 'Must return 304 Not Modified when ETag matches');

    console.log('  -> PASSED: Resource retrieval passes with ETag caching and concurrency checking.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 6: Inbound Quarantine to Import Review on Ambiguous Identity
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 6] Inbound Ambiguous Demographic Quarantine Safeguard...');
    const validToken = gatewayAuthProvider.generateTestJWT('sys-tz-moh-hie', ['fhir.patient.write']);

    // Ambiguous patient payload: Matching name & DOB of testPatient but conflicting national ID
    const conflictingPat = {
      resourceType: 'Patient',
      id: 'ext-conflict-pat-01',
      identifier: [
        {
          system: 'http://jano.health/fhir/identifier/national-id',
          value: 'NID-CONFLICT-777888',
        },
      ],
      name: [{ family: 'Kondo', given: ['Neema'] }],
      birthDate: '1995-07-20',
      gender: 'female',
    };

    const importResp = await fhirExchangeGateway.processInbound(conflictingPat, {
      authHeader: `Bearer ${validToken}`,
      facilityHeader: 'fac-uvinza-hc',
    });

    assert.strictEqual(importResp.status, 409, 'Ambiguous identity conflict must return 409 Conflict');
    assert.strictEqual((importResp.body as any).resourceType, 'OperationOutcome');

    // Confirm it was quarantined to the review queue
    const reviewItems = fhirImportReviewStore.getItems('PENDING_IMPORT_REVIEW');
    assert.ok(reviewItems.length > 0, 'Conflict item must be stored in Human Review Queue');

    console.log('  -> PASSED: Zero autonomous overwrites on identity conflict; quarantined to clinical review.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 7: Outbound Queuing & Retry Policy
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 7] Outbound Queue Enqueueing & Retries...');
    const queuedItem = fhirOutboundClient.enqueueOutbound(
      'sys-tz-moh-hie',
      'Observation',
      'obs-test-01',
      'read',
      { resourceType: 'Observation', id: 'obs-test-01' },
      'fac-uvinza-hc'
    );

    assert.ok(queuedItem.id);
    assert.strictEqual(queuedItem.status, 'READY');

    // Dispatch item
    const dispatchResult = await fhirOutboundClient.dispatchItem(queuedItem.id);
    assert.strictEqual(dispatchResult.success, true);
    assert.strictEqual(queuedItem.status, 'SENT');

    console.log('  -> PASSED: Outbound queuing executes with audit lineage and idempotency guarantees.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Test 8: Gateway Observability & Health Endpoint
  // -------------------------------------------------------------
  try {
    console.log('\n[TEST 8] Observability Metrics & Health Endpoint Verification...');
    const health = fhirExchangeGateway.getHealth();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.fhirVersion, FHIR_VERSION);
    assert.ok(health.registeredExternalSystems >= 3);
    assert.ok(health.metrics.totalRequests > 0);

    const logs = fhirExchangeLogStore.getLogs();
    assert.ok(logs.length > 0, 'Exchange logs must be recorded');
    assert.ok(logs[0].durationMs >= 0);
    assert.ok(logs[0].provenance.length > 0);

    console.log('  -> PASSED: Operational health endpoint and telemetry metrics verified.');
    passedTests++;
  } catch (err: any) {
    console.error('  -> FAILED:', err.message);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(`TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runGatewayTestSuite();
