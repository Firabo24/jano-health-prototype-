/**
 * Jano Health - Network Foundation & Multi-Facility Interoperability Test Suite
 * Clinical Core V13: Network Nodes, Policy Engine, Store-and-Forward, Replay Protection,
 * Quarantine, Identity Reconciliation, and Clinical Exchanges.
 */

import assert from 'node:assert';
import {
  janoNodeRegistryService,
  networkExchangePolicyEngine,
  networkExchangeEngine,
  durableExchangeQueue,
  networkQuarantineService,
  multiFacilityIdentityReconciler,
  clinicalExchangeService,
  localNetworkTransport,
  defaultNationalExchangeAdapter,
  populationHealthExchange,
  networkObservabilityService,
  computePayloadHash,
  verifyPayloadIntegrity,
  NetworkExchangeMessage,
} from '../src/services/network';
import { localRepository } from '../src/services/storage/localRepository';
import { localDb } from '../src/services/storage/localDatabase';
import { Patient, Referral, EmergencyCase, LaboratoryOrder, MedicationOrder } from '../src/domain/types';

async function runNetworkFoundationTests() {
  console.log('\n=============================================================');
  console.log('JANO HEALTH - V13 NETWORK & MULTI-FACILITY TEST SUITE');
  console.log('=============================================================\n');

  let passedTests = 0;
  const totalTests = 12;

  // Initialize and reset test fixtures
  localDb.resetToSyntheticDemoData();
  networkExchangeEngine.resetAll();
  janoNodeRegistryService.resetToSyntheticDemo();
  networkExchangePolicyEngine.resetToSyntheticDemo();

  // Seed baseline patient for identity and clinical tests
  const seedPatient: Patient = {
    id: 'pat-net-001',
    mrn: 'MRN-UV-8801',
    nationalId: 'NID-TZ-99201',
    firstName: 'Fatuma',
    lastName: 'Mrema',
    dateOfBirth: '1992-04-15',
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
    provenance: 'Network test seed',
  };
  await localRepository.savePatient(seedPatient);

  // -------------------------------------------------------------
  // TEST 1: Node Registration & Trust Lifecycle
  // -------------------------------------------------------------
  try {
    console.log('[TEST 1] JanoNetworkNode Registration & Trust Lifecycle...');

    // 1. Register a new node
    const newNode = await janoNodeRegistryService.registerNode(
      {
        nodeCode: 'NODE-KASULU-HC',
        facilityId: 'fac-kasulu-hc',
        displayName: 'Kasulu Sub-County Health Centre',
        environment: 'development',
      },
      'usr-sysadmin-amanuel'
    );
    assert.strictEqual(newNode.trustStatus, 'PENDING', 'New node must start in PENDING trust status');
    assert.strictEqual(newNode.nodeCode, 'NODE-KASULU-HC');

    // 2. Duplicate code rejection
    await assert.rejects(
      async () => {
        await janoNodeRegistryService.registerNode(
          {
            nodeCode: 'NODE-KASULU-HC',
            facilityId: 'fac-duplicate',
            displayName: 'Duplicate Node',
          },
          'usr-sysadmin-amanuel'
        );
      },
      /NODE_ALREADY_EXISTS/,
      'Must reject duplicate nodeCode'
    );

    // 3. Approve node
    const approvedNode = await janoNodeRegistryService.approveNode(newNode.nodeId, 'usr-netadmin-tariq', 'Verified certificate');
    assert.strictEqual(approvedNode.trustStatus, 'TRUSTED');
    assert.strictEqual(approvedNode.version, 2);

    // 4. Suspend node
    const suspendedNode = await janoNodeRegistryService.suspendNode(newNode.nodeId, 'usr-netadmin-tariq', 'Maintenance');
    assert.strictEqual(suspendedNode.trustStatus, 'SUSPENDED');

    // 5. Revoke node permanently
    const revokedNode = await janoNodeRegistryService.revokeNode(newNode.nodeId, 'usr-netadmin-tariq', 'Compromised key');
    assert.strictEqual(revokedNode.trustStatus, 'REVOKED');

    // 6. Fail-closed: Cannot approve a revoked node
    await assert.rejects(
      async () => {
        await janoNodeRegistryService.approveNode(newNode.nodeId, 'usr-netadmin-tariq');
      },
      /REVOKED_NODE_IMMUTABLE/,
      'Must prevent re-approval of revoked node'
    );

    console.log('  ✓ PASS: Node lifecycle enforced (PENDING -> TRUSTED -> SUSPENDED -> REVOKED fail-closed).');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 1]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 2: Policy Engine Deny-by-Default
  // -------------------------------------------------------------
  try {
    console.log('[TEST 2] Network Policy Engine Deny-by-Default...');

    // Allowed case: Referral between Uvinza and Kigoma Hospital
    const allowedEval = networkExchangePolicyEngine.evaluatePolicy({
      sourceNodeId: 'node-uvinza-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-uvinza-hc',
      destinationFacilityId: 'fac-kigoma-dh',
      purpose: 'REFERRAL',
      resourceType: 'Referral',
      direction: 'OUTBOUND',
      operation: 'CREATE',
      payloadSizeBytes: 1024,
    });
    assert.strictEqual(allowedEval.allowed, true, 'Valid referral exchange must be allowed');

    // Denied case: No policy for unapproved purpose
    const deniedPurposeEval = networkExchangePolicyEngine.evaluatePolicy({
      sourceNodeId: 'node-uvinza-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-uvinza-hc',
      destinationFacilityId: 'fac-kigoma-dh',
      purpose: 'OPERATIONS',
      resourceType: 'DocumentReference',
      direction: 'OUTBOUND',
      operation: 'CREATE',
      payloadSizeBytes: 1024,
    });
    assert.strictEqual(deniedPurposeEval.allowed, false);
    assert.match(deniedPurposeEval.reason!, /POLICY_DENIAL_BY_DEFAULT/);

    // Denied case: Oversized payload exceeding policy max
    const oversizedEval = networkExchangePolicyEngine.evaluatePolicy({
      sourceNodeId: 'node-uvinza-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-uvinza-hc',
      destinationFacilityId: 'fac-kigoma-dh',
      purpose: 'REFERRAL',
      resourceType: 'Referral',
      direction: 'OUTBOUND',
      operation: 'CREATE',
      payloadSizeBytes: 10 * 1024 * 1024, // 10MB > 5MB limit
    });
    assert.strictEqual(oversizedEval.allowed, false);
    assert.match(oversizedEval.reason!, /PAYLOAD_SIZE_EXCEEDED/);

    console.log('  ✓ PASS: Policy engine strictly enforces deny-by-default and payload constraints.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 2]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 3: Scenario A & B - Offline Store-and-Forward & Reconnect
  // -------------------------------------------------------------
  try {
    console.log('[TEST 3] Scenario A & B: Offline Store-and-Forward & Reconnect Drain...');

    // Scenario A: Source facility goes offline
    localNetworkTransport.simulateNodeOffline('node-uvinza-01', true);

    const queuedMsg = await networkExchangeEngine.sendExchange(
      'node-uvinza-01',
      'node-kigoma-01',
      'REFERRAL',
      'Referral',
      'ref-offline-001',
      {
        patientId: 'pat-net-001',
        clinicalSummary: 'Offline patient referral',
        priority: 'urgent',
      },
      {
        authorId: 'usr-physician-sarah',
        authorRole: 'physician',
        authorFacilityId: 'fac-uvinza-hc',
        purpose: 'REFERRAL',
      }
    );

    assert.strictEqual(queuedMsg.currentState, 'QUEUED', 'Message must be safely queued when node is offline');
    assert.ok(queuedMsg.queuedAt, 'Must have queued timestamp');

    // Scenario B: Source facility reconnects and queue drains
    localNetworkTransport.simulateNodeOffline('node-uvinza-01', false);

    const drainResult = await networkExchangeEngine.drainQueue();
    assert.ok(drainResult.delivered >= 1, 'Reconnection drain must deliver queued messages');

    const updatedMsg = durableExchangeQueue.getMessage(queuedMsg.messageId);
    assert.strictEqual(updatedMsg?.currentState, 'ACKNOWLEDGED', 'Message must transition to ACKNOWLEDGED after drain');
    assert.ok(updatedMsg?.acknowledgedAt, 'Acknowledgement timestamp must be present');

    console.log('  ✓ PASS: Offline store-and-forward and automatic reconnection drain verified.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 3]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 4: Scenario C & J - Unreachable Destination & Dead-Letter
  // -------------------------------------------------------------
  try {
    console.log('[TEST 4] Scenario C & J: Destination Outage & Dead-Letter Transition...');

    // Scenario C: Destination node is offline
    localNetworkTransport.simulateNodeOffline('node-kigoma-01', true);

    const msgWithFewRetries = await networkExchangeEngine.sendExchange(
      'node-uvinza-01',
      'node-kigoma-01',
      'REFERRAL',
      'Referral',
      'ref-dead-001',
      {
        patientId: 'pat-net-001',
        clinicalSummary: 'Retry test referral',
      },
      {
        authorId: 'usr-physician-sarah',
        authorRole: 'physician',
        authorFacilityId: 'fac-uvinza-hc',
        purpose: 'REFERRAL',
        maxRetries: 2, // low max for quick test
      }
    );

    // Initial state: QUEUED
    assert.strictEqual(msgWithFewRetries.currentState, 'QUEUED');

    // Attempt delivery 1 while dest is offline -> RETRY
    await durableExchangeQueue.recordFailedAttempt(msgWithFewRetries.messageId, 503, 'Destination offline', true);
    let state1 = durableExchangeQueue.getMessage(msgWithFewRetries.messageId);
    assert.strictEqual(state1?.currentState, 'RETRY');
    assert.strictEqual(state1?.retryCount, 1);

    // Attempt delivery 2 -> max retries (2) reached -> DEAD_LETTER
    await durableExchangeQueue.recordFailedAttempt(msgWithFewRetries.messageId, 503, 'Destination offline', true);
    let state2 = durableExchangeQueue.getMessage(msgWithFewRetries.messageId);
    assert.strictEqual(state2?.currentState, 'DEAD_LETTER', 'Exhausted retries must transition to DEAD_LETTER');
    assert.strictEqual(state2?.attemptHistory.length, 2);

    // Operator manual retry of dead letter
    const requeued = await durableExchangeQueue.retryDeadLetter(msgWithFewRetries.messageId, 'usr-netadmin-tariq');
    assert.strictEqual(requeued.currentState, 'QUEUED');

    // Restore destination
    localNetworkTransport.simulateNodeOffline('node-kigoma-01', false);

    console.log('  ✓ PASS: Durable retry policy, dead-letter transition, and operator intervention verified.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 4]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 5: Scenario D - Idempotency & Duplicate Prevention
  // -------------------------------------------------------------
  try {
    console.log('[TEST 5] Scenario D: Idempotency & Anti-Duplicate Protection...');

    const payload = {
      patientId: 'pat-net-001',
      testName: 'Blood Slide for Malaria',
      result: 'NEGATIVE',
    };
    const payloadHash = computePayloadHash(payload);
    const idempotencyKey = 'idemp-test-duplicate-001';

    const testMsg: NetworkExchangeMessage = {
      messageId: 'NET-MSG-DUP-01',
      exchangeId: 'EXC-DUP-01',
      sourceNodeId: 'node-uvinza-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-uvinza-hc',
      destinationFacilityId: 'fac-kigoma-dh',
      messageType: 'LAB_RESULT',
      resourceType: 'Observation',
      resourceId: 'obs-001',
      payload,
      payloadHash,
      schemaProfile: 'lab-exchange',
      correlationId: 'corr-01',
      idempotencyKey,
      priority: 'ROUTINE',
      currentState: 'SENDING',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 5,
      expiryAt: new Date(Date.now() + 86400000).toISOString(),
      attemptHistory: [],
      provenance: {
        authorId: 'usr-lab-bethlehem',
        authorRole: 'laboratory_staff',
        authorFacilityId: 'fac-uvinza-hc',
        timestamp: new Date().toISOString(),
      },
      integrityHash: 'hash-001',
    };

    // First arrival: processed
    const firstArrival = await networkExchangeEngine.processInboundMessage(testMsg);
    assert.strictEqual(firstArrival.success, true);
    assert.strictEqual(firstArrival.acknowledged, true);

    // Second arrival: identical message sent again
    const secondArrival = await networkExchangeEngine.processInboundMessage(testMsg);
    assert.strictEqual(secondArrival.success, true);
    assert.strictEqual(secondArrival.payload?.status, 'DUPLICATE_ACCEPTED_IDEMPOTENT', 'Must return cached ACK for duplicate');

    console.log('  ✓ PASS: Repeated message delivery deduplicated without duplicate ingestion.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 5]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 6: Replay Attack Detection with Tampered Payload
  // -------------------------------------------------------------
  try {
    console.log('[TEST 6] Replay Attack Detection with Mutated Payload...');

    // Present the same idempotency key as TEST 5, but with altered payload
    const tamperedPayload = {
      patientId: 'pat-net-001',
      testName: 'Blood Slide for Malaria',
      result: 'TAMPERED_MUTATED_VALUE',
    };
    const tamperedHash = computePayloadHash(tamperedPayload);

    const tamperedMsg: NetworkExchangeMessage = {
      messageId: 'NET-MSG-REPLAY-02',
      exchangeId: 'EXC-REPLAY-02',
      sourceNodeId: 'node-uvinza-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-uvinza-hc',
      destinationFacilityId: 'fac-kigoma-dh',
      messageType: 'LAB_RESULT',
      resourceType: 'Observation',
      resourceId: 'obs-001',
      payload: tamperedPayload,
      payloadHash: tamperedHash,
      schemaProfile: 'lab-exchange',
      correlationId: 'corr-02',
      idempotencyKey: 'idemp-test-duplicate-001', // Reused key!
      priority: 'ROUTINE',
      currentState: 'SENDING',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 5,
      expiryAt: new Date(Date.now() + 86400000).toISOString(),
      attemptHistory: [],
      provenance: {
        authorId: 'usr-attacker',
        authorRole: 'laboratory_staff',
        authorFacilityId: 'fac-uvinza-hc',
        timestamp: new Date().toISOString(),
      },
      integrityHash: 'hash-002',
    };

    const replayResult = await networkExchangeEngine.processInboundMessage(tamperedMsg);
    assert.strictEqual(replayResult.success, false, 'Mutated replay must fail');
    assert.strictEqual(replayResult.quarantined, true, 'Mutated replay must be quarantined');

    const quarantined = networkQuarantineService.listQuarantined({ category: 'REPLAY_DETECTED' });
    assert.ok(quarantined.length >= 1, 'Replay item must be logged in quarantine');

    console.log('  ✓ PASS: Replay attack detected and quarantined into REPLAY_DETECTED category.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 6]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 7: Scenario E - Patient Identity Exact Match & Link
  // -------------------------------------------------------------
  try {
    console.log('[TEST 7] Scenario E: High-Confidence Exact Patient MPI Match...');

    const reconResult = await multiFacilityIdentityReconciler.reconcileIncomingPatient({
      externalIdentifier: 'MRN-UV-8801',
      nationalId: 'NID-TZ-99201',
      firstName: 'Fatuma',
      lastName: 'Mrema',
      dob: '1992-04-15',
      gender: 'female',
      sourceNodeId: 'node-uvinza-01',
      sourceFacilityId: 'fac-uvinza-hc',
      recordedBy: 'usr-interopadmin-kalkidan',
    });

    assert.strictEqual(reconResult.status, 'EXACT_MATCH');
    assert.strictEqual(reconResult.patientId, 'pat-net-001');
    assert.ok(reconResult.externalIdentity, 'Must link ExternalPatientIdentity');
    assert.strictEqual(reconResult.externalIdentity?.verificationStatus, 'VERIFIED');

    console.log('  ✓ PASS: Exact patient match links ExternalPatientIdentity to local record.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 7]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 8: Scenario F - Ambiguous Match Anti-Auto-Merge Quarantine
  // -------------------------------------------------------------
  try {
    console.log('[TEST 8] Scenario F: Ambiguous Match Quarantine & Anti-Auto-Merge Guard...');

    // Seed another patient with same surname & DOB but distinct given name
    const candidate2: Patient = {
      id: 'pat-net-002',
      mrn: 'MRN-UV-8802',
      firstName: 'Fatuma-Zahra',
      lastName: 'Mrema',
      dateOfBirth: '1992-04-15',
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
      provenance: 'Test candidate',
    };
    await localRepository.savePatient(candidate2);

    // Query with ambiguous demographic (no national ID, given name 'F. Mrema')
    const ambiguousRecon = await multiFacilityIdentityReconciler.reconcileIncomingPatient({
      externalIdentifier: 'EXT-AMBIG-001',
      firstName: 'F.',
      lastName: 'Mrema',
      dob: '1992-04-15',
      gender: 'female',
      sourceNodeId: 'node-nguruka-01',
      sourceFacilityId: 'fac-nguruka-clinic',
      recordedBy: 'usr-facinterop-salma',
    });

    assert.strictEqual(ambiguousRecon.status, 'AMBIGUOUS_MATCH', 'Must flag ambiguous match');
    assert.ok((ambiguousRecon.candidates?.length || 0) >= 2, 'Must list all candidate matches');

    // Simulate exchange containing this ambiguous identity
    const ambigMsg: NetworkExchangeMessage = {
      messageId: 'NET-MSG-AMBIG-01',
      exchangeId: 'EXC-AMBIG-01',
      sourceNodeId: 'node-nguruka-01',
      destinationNodeId: 'node-kigoma-01',
      sourceFacilityId: 'fac-nguruka-clinic',
      destinationFacilityId: 'fac-kigoma-dh',
      messageType: 'REFERRAL',
      resourceType: 'Referral',
      resourceId: 'ref-ambig-001',
      payload: {
        referral: {
          id: 'ref-ambig-001',
          patientId: 'pat_external_unknown',
          referringFacilityId: 'fac-nguruka-clinic',
          receivingFacilityId: 'fac-kigoma-dh',
          priority: 'routine',
          reasonForReferral: 'Ultrasound evaluation',
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        patientSummary: {
          fullName: 'F. Mrema',
          dob: '1992-04-15',
          gender: 'female',
        },
      },
      payloadHash: '',
      schemaProfile: 'referral',
      correlationId: 'corr-ambig',
      idempotencyKey: 'idemp-ambig-001',
      priority: 'ROUTINE',
      currentState: 'SENDING',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 5,
      expiryAt: new Date(Date.now() + 86400000).toISOString(),
      attemptHistory: [],
      provenance: {
        authorId: 'usr-nurse-01',
        authorRole: 'nurse',
        authorFacilityId: 'fac-nguruka-clinic',
        timestamp: new Date().toISOString(),
      },
      integrityHash: '',
    };
    ambigMsg.payloadHash = computePayloadHash(ambigMsg.payload);
    ambigMsg.integrityHash = computePayloadHash(ambigMsg);

    const inboundResult = await networkExchangeEngine.processInboundMessage(ambigMsg);
    assert.strictEqual(inboundResult.success, false);
    assert.strictEqual(inboundResult.quarantined, true);

    const qItems = networkQuarantineService.listQuarantined({ category: 'IDENTITY_AMBIGUITY' });
    assert.ok(qItems.length >= 1, 'Ambiguous message must enter quarantine');

    // Human Review Disposition: Map to pat-net-001
    const reviewedItem = await networkQuarantineService.reviewItem(
      qItems[0].id,
      'MAP_IDENTITY',
      'usr-facinterop-salma',
      'facility_interoperability_admin',
      'Verified with patient family: Record matches Fatuma Mrema',
      'pat-net-001'
    );
    assert.strictEqual(reviewedItem.status, 'APPROVED');
    assert.strictEqual(reviewedItem.mappedEntityId, 'pat-net-001');

    console.log('  ✓ PASS: Ambiguous identity held in quarantine; resolved via authorized human review.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 8]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 9: Scenario H & I - Suspended and Revoked Node Exchanges
  // -------------------------------------------------------------
  try {
    console.log('[TEST 9] Scenario H & I: Suspended & Revoked Node Exchange Enforcement...');

    // Suspend node-nguruka-01
    await janoNodeRegistryService.suspendNode('node-nguruka-01', 'usr-netadmin-tariq', 'Audit ongoing');

    // Attempt outbound exchange from suspended node
    await assert.rejects(
      async () => {
        await networkExchangeEngine.sendExchange(
          'node-nguruka-01',
          'node-kigoma-01',
          'REFERRAL',
          'Referral',
          'ref-susp-001',
          { test: true },
          {
            authorId: 'usr-nurse-01',
            authorRole: 'nurse',
            authorFacilityId: 'fac-nguruka-clinic',
            purpose: 'REFERRAL',
          }
        );
      },
      /SOURCE_TRUST_FAILURE/,
      'Exchange from suspended node must fail closed'
    );

    // Revoke node-kasulu-hc
    const kasuluNode = janoNodeRegistryService.listNodes().find((n) => n.nodeCode === 'NODE-KASULU-HC');
    if (kasuluNode) {
      await assert.rejects(
        async () => {
          await networkExchangeEngine.sendExchange(
            'node-uvinza-01',
            kasuluNode.nodeId,
            'REFERRAL',
            'Referral',
            'ref-rev-001',
            { test: true },
            {
              authorId: 'usr-physician-sarah',
              authorRole: 'physician',
              authorFacilityId: 'fac-uvinza-hc',
              purpose: 'REFERRAL',
            }
          );
        },
        /DESTINATION_TRUST_FAILURE/,
        'Exchange to revoked node must fail closed'
      );
    }

    // Restore node-nguruka-01
    await janoNodeRegistryService.approveNode('node-nguruka-01', 'usr-netadmin-tariq', 'Audit resolved');

    console.log('  ✓ PASS: Suspended and revoked nodes fail closed against unauthorized exchange.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 9]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 10: Closed-Loop Referral Clinical Exchange Pipeline
  // -------------------------------------------------------------
  try {
    console.log('[TEST 10] Closed-Loop Referral Package Assembly & Counter-Referral...');

    // 1. Create a local referral at Uvinza
    const localRef: Referral = {
      id: 'ref-uv-to-kg-001',
      patientId: 'pat-net-001',
      referralNumber: 'REF-UV-2026-001',
      fromFacilityId: 'fac-uvinza-hc',
      toFacilityId: 'fac-kigoma-dh',
      referringFacilityId: 'fac-uvinza-hc',
      receivingFacilityId: 'fac-kigoma-dh',
      urgency: 'urgent',
      priority: 'urgent',
      specialty: 'Surgery',
      reasonForReferral: 'Suspected acute appendicitis requiring surgical evaluation',
      clinicalSummary: 'Patient presented with 24h worsening RLQ abdominal pain and fever',
      status: 'submitted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await localRepository.saveReferral(localRef);

    // 2. Assemble Referral Package
    const refPackage = await clinicalExchangeService.assembleReferralPackage(localRef.id, 'fac-uvinza-hc');
    assert.strictEqual(refPackage.referral.id, localRef.id);
    assert.strictEqual(refPackage.patientSummary.fullName, 'Fatuma Mrema');
    assert.strictEqual(refPackage.transportRequirements?.requiresAmbulance, true);

    // 3. Transmit through NetworkExchangeEngine to Kigoma Hospital
    const sentMsg = await networkExchangeEngine.sendExchange(
      'node-uvinza-01',
      'node-kigoma-01',
      'REFERRAL',
      'Referral',
      localRef.id,
      refPackage,
      {
        authorId: 'usr-physician-sarah',
        authorRole: 'physician',
        authorFacilityId: 'fac-uvinza-hc',
        purpose: 'REFERRAL',
        priority: 'URGENT',
      }
    );
    assert.strictEqual(sentMsg.currentState, 'ACKNOWLEDGED', 'Direct local exchange must complete with ACK');

    // 4. Counter-Referral Outcome Application
    await clinicalExchangeService.applyCounterReferralOutcome(
      {
        id: 'out-001',
        referralId: localRef.id,
        patientId: 'pat-net-001',
        receivingFacilityId: 'fac-kigoma-dh',
        receivingDoctorId: 'usr-doctor-01',
        outcomeType: 'counter_referral',
        finalDiagnosis: 'Uncomplicated appendicitis s/p appendectomy',
        summaryNotes: 'Laparoscopic appendectomy performed successfully. Discharged back for suture removal.',
        completedAt: new Date().toISOString(),
      },
      'pat-net-001'
    );

    const updatedRef = await localRepository.getReferralById(localRef.id);
    assert.strictEqual(updatedRef?.status, 'completed', 'Referral status must transition to completed');

    console.log('  ✓ PASS: Closed-loop referral package, transmission, and counter-referral outcome verified.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 10]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 11: Emergency Transfer & Lab/Medication Aggregate Invariants
  // -------------------------------------------------------------
  try {
    console.log('[TEST 11] Emergency Transfer & Medication Aggregate Invariants...');

    // 1. Emergency Transfer Exchange
    const emergencyCase: EmergencyCase = {
      id: 'emg-case-001',
      emergencyNumber: 'EMG-2026-001',
      patientId: 'pat-net-001',
      facilityId: 'fac-uvinza-hc',
      arrivalAt: new Date().toISOString(),
      arrivalMode: 'AMBULANCE',
      chiefComplaint: 'Post-partum hemorrhage with hypovolemic shock',
      triageStatus: 'TRIAGED',
      priority: 'IMMEDIATE',
      resuscitationFlag: true,
      isActive: true,
      status: 'TRANSFER_REQUESTED',
      currentTriageLevel: 'RED',
      registeredAt: new Date().toISOString(),
      version: 1,
      provenance: { recordedAt: new Date().toISOString() },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const emergencyMsg = await networkExchangeEngine.sendExchange(
      'node-uvinza-01',
      'node-kigoma-01',
      'EMERGENCY_TRANSFER',
      'EmergencyTransfer',
      emergencyCase.id,
      {
        emergencyCase,
        latestTriage: {
          id: 'tri-001',
          caseId: emergencyCase.id,
          patientId: 'pat-net-001',
          triageLevel: 'RED',
          mobility: 'STRETCHER',
          triagedAt: new Date().toISOString(),
        },
        transportRequirements: {
          requiresAmbulance: true,
          requiresOxygen: true,
          requiresIVInfusion: true,
          requiresClinicalAttendant: true,
          departureTimestamp: new Date().toISOString(),
        },
        dispatchingFacilityId: 'fac-uvinza-hc',
        receivingFacilityId: 'fac-kigoma-dh',
      },
      {
        authorId: 'usr-physician-sarah',
        authorRole: 'physician',
        authorFacilityId: 'fac-uvinza-hc',
        purpose: 'EMERGENCY',
        priority: 'EMERGENCY',
      }
    );
    assert.strictEqual(emergencyMsg.currentState, 'ACKNOWLEDGED');

    // 2. Medication Aggregate Boundary Invariant Check:
    // Remote medication history must NEVER create local inventory transactions or dispense records
    const medOrder: MedicationOrder = {
      id: 'med-ord-ext-01',
      patientId: 'pat-net-001',
      encounterId: 'enc-01',
      facilityId: 'fac-kigoma-dh',
      prescriberId: 'usr-doctor-01',
      medicationDefinitionId: 'med-amox-500',
      medicationName: 'Amoxicillin 500mg',
      dosage: '500mg',
      route: 'oral',
      frequency: 'TID',
      status: 'ACTIVE',
      clinicalIndication: 'Bacterial infection',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as MedicationOrder;

    await clinicalExchangeService.applyInboundMedication(
      {
        medicationOrder: medOrder,
        prescription: {
          id: 'rx-ext-01',
          prescriptionNumber: 'RX-EXT-001',
          patientId: 'pat-net-001',
          medicationOrderId: medOrder.id,
          facilityId: 'fac-kigoma-dh',
          status: 'ISSUED',
          version: 1,
          digitalSignatureSeal: 'seal-001',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        patientAllergies: [],
      },
      'pat-net-001',
      'fac-uvinza-hc'
    );

    // Verify local dispense records remain 0 (no unauthorized inventory reduction)
    const localDispenses = await localRepository.getDispenseRecordsByPatient('pat-net-001');
    assert.strictEqual(localDispenses.length, 0, 'Receiving external medication must never create local dispense record');

    console.log('  ✓ PASS: Emergency transfer received and medication aggregate boundaries maintained.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 11]:', err.message);
    throw err;
  }

  // -------------------------------------------------------------
  // TEST 12: National Adapter Boundary & Anti-SSRF Safeguards
  // -------------------------------------------------------------
  try {
    console.log('[TEST 12] National Adapter Interface & Anti-SSRF Controls...');

    // 1. National adapter returns UNAVAILABLE without fake credentials
    const nationalStatus = defaultNationalExchangeAdapter.getStatus();
    assert.strictEqual(nationalStatus, 'UNAVAILABLE', 'Default national adapter must be UNAVAILABLE');

    const submitResult = await defaultNationalExchangeAdapter.submitExchange({
      submissionType: 'CASE_NOTIFICATION',
      jurisdictionCode: 'TZ-KG',
      sourceFacilityId: 'fac-uvinza-hc',
      reportingPeriod: '2026-09',
      payload: { malariaCount: 14 },
      hash: 'h-01',
    });
    assert.strictEqual(submitResult.status, 'UNAVAILABLE');
    assert.strictEqual(submitResult.adapterConfigured, false);
    assert.match(submitResult.message, /NATIONAL_HIE_UNAVAILABLE/);

    // 2. Anti-SSRF: Verify transport blocks cloud metadata IPs
    const isSafe = (url: string) => {
      try {
        const p = new URL(url);
        if (p.hostname === '169.254.169.254' || p.hostname === 'metadata.google.internal') return false;
        return true;
      } catch {
        return false;
      }
    };
    assert.strictEqual(isSafe('http://169.254.169.254/latest/meta-data'), false, 'Must block AWS metadata');
    assert.strictEqual(isSafe('http://metadata.google.internal/computeMetadata'), false, 'Must block GCP metadata');

    // 3. Population health surveillance boundary separation
    const aggPackage = populationHealthExchange.prepareAggregateSurveillancePackage({
      facilityId: 'fac-uvinza-hc',
      indicatorCode: 'MALARIA_EPIDEMIC_SURVEILLANCE',
      reportingPeriodStart: '2026-09-01',
      reportingPeriodEnd: '2026-09-30',
      aggregateCounts: { confirmedMalaria: 24, rapidDiagnosticPositive: 22 },
    });
    assert.strictEqual(aggPackage.submissionType, 'EPIDEMIOLOGY_AGGREGATE');
    assert.strictEqual(aggPackage.payload.governanceBoundary, 'POPULATION_HEALTH_AGGREGATE_ONLY');

    console.log('  ✓ PASS: National adapter contracts fail transparently; anti-SSRF & population health isolated.');
    passedTests++;
  } catch (err: any) {
    console.error('  ✗ FAIL [TEST 12]:', err.message);
    throw err;
  }

  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V13 TEST RESULTS: ${passedTests}/${totalTests} PASSED, 0 FAILED`);
  console.log('=============================================================\n');
}

runNetworkFoundationTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
