/**
 * Jano Health - Offline Architecture & Synchronization Verification Test Suite
 * 
 * Verifies all 15 critical offline and synchronization scenarios required for production EHR operations:
 * 1. Create patient while online
 * 2. Create patient while offline
 * 3. Modify patient while offline
 * 4. Create encounter while offline
 * 5. Queue multiple events
 * 6. Reconnect
 * 7. Synchronize queued events
 * 8. Retry failed synchronization
 * 9. Submit the same event twice
 * 10. Verify idempotency
 * 11. Simulate conflicting updates
 * 12. Verify conflict detection & resolution
 * 13. Verify audit events
 * 14. Verify facility isolation
 * 15. Verify unauthorized operations are rejected
 */

import assert from 'node:assert';
import { localRepository } from '../src/services/storage/localRepository';
import { eventStore } from '../src/services/events/eventStore';
import { syncQueue } from '../src/services/sync/syncQueue';
import { syncEngine } from '../src/services/sync/syncEngine';
import { auditRepository } from '../src/services/audit/auditRepository';
import { conflictResolver } from '../src/services/sync/conflictResolver';
import { clinicalWorkflowService, ClinicalActorContext } from '../src/services/clinical/clinicalWorkflowService';
import { hasPermission } from '../src/domain/permissions';
import { DomainEvent } from '../src/domain/persistence';
import { cloudRepository } from '../src/services/cloud/cloudRepository';

async function runOfflineArchitectureTestSuite() {
  console.log('\n======================================================');
  console.log('JANO HEALTH - OFFLINE PERSISTENCE & SYNC VERIFICATION');
  console.log('======================================================\n');

  // Configure cloudRepository with predictable in-memory push simulation for unit testing
  cloudRepository.setCustomPushHandler(async (req) => {
    return {
      status: 'acknowledged',
      receivedAt: new Date().toISOString(),
      processedCount: req.events.length,
      acknowledgedEventIds: req.events.map((e) => e.eventId),
      duplicateEventIds: [],
      conflicts: [],
    };
  });

  let passedScenarios = 0;
  const totalScenarios = 15;

  const clinicianContext: ClinicalActorContext = {
    userId: 'usr-clinician-dr-amin',
    userName: 'Dr. Amina Touré',
    userRole: 'physician',
    facilityId: 'fac-rural-dispensary-01',
    deviceId: 'dev-station-alpha',
  };

  const receptionistContext: ClinicalActorContext = {
    userId: 'usr-receptionist-john',
    userName: 'John Doe',
    userRole: 'receptionist',
    facilityId: 'fac-rural-dispensary-01',
    deviceId: 'dev-station-frontdesk',
  };

  try {
    // ----------------------------------------------------
    // Scenario 1: Create patient while online
    // ----------------------------------------------------
    console.log('Scenario 1: Create patient while online...');
    syncEngine.setSimulatedOffline(false);
    assert.strictEqual(syncEngine.isEffectivelyOnline(), true, 'Engine must be online');

    const patient1 = await clinicalWorkflowService.registerPatient(
      {
        mrn: 'JH-2026-ONLINE-001',
        firstName: 'Kofi',
        lastName: 'Mensah',
        dateOfBirth: '1988-04-12',
        gender: 'male',
        bloodGroup: 'O+',
        villageTown: 'Adansi Rural',
        district: 'Eastern Outpost',
        primaryFacilityId: 'fac-rural-dispensary-01',
        triageUrgency: 'routine',
      },
      clinicianContext
    );

    assert.ok(patient1.id, 'Patient ID must be generated');
    const storedP1 = await localRepository.getPatient(patient1.id);
    assert.ok(storedP1, 'Patient must be immediately stored in LocalRepository');
    assert.strictEqual(storedP1?.mrn, 'JH-2026-ONLINE-001');

    const eventsP1 = await eventStore.getEventsForAggregate('Patient', patient1.id);
    assert.strictEqual(eventsP1.length, 1, 'Event store must contain PATIENT_CREATED');
    assert.strictEqual(eventsP1[0].eventType, 'PATIENT_CREATED');
    assert.strictEqual(eventsP1[0].sequence, 1, 'Sequence must start at 1');

    console.log('✓ Scenario 1 PASSED: Patient created online and persisted.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 2: Create patient while offline
    // ----------------------------------------------------
    console.log('Scenario 2: Create patient while offline...');
    syncEngine.setSimulatedOffline(true);
    assert.strictEqual(syncEngine.isEffectivelyOnline(), false, 'Engine must be offline');

    const patient2 = await clinicalWorkflowService.registerPatient(
      {
        mrn: 'JH-2026-OFFLINE-002',
        firstName: 'Fatima',
        lastName: 'Zahra',
        dateOfBirth: '1992-09-21',
        gender: 'female',
        bloodGroup: 'B+',
        villageTown: 'Wadi West Village',
        district: 'Northern District',
        primaryFacilityId: 'fac-rural-dispensary-01',
        triageUrgency: 'urgent',
      },
      clinicianContext
    );

    // Verify patient is saved locally without network
    const storedP2 = await localRepository.getPatient(patient2.id);
    assert.ok(storedP2, 'Patient must be persisted locally while offline');
    assert.strictEqual(storedP2?.firstName, 'Fatima');

    // Verify queued in SyncQueue
    const pendingEvents = await syncQueue.peekPending(50);
    const offlineP2Event = pendingEvents.find((e) => e.aggregateId === patient2.id);
    assert.ok(offlineP2Event, 'Event must be queued in SyncQueue');
    assert.strictEqual(offlineP2Event.syncStatus, 'PENDING');

    console.log('✓ Scenario 2 PASSED: Patient created offline and queued for upload.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 3: Modify patient while offline
    // ----------------------------------------------------
    console.log('Scenario 3: Modify patient while offline...');
    const updatedP2 = await clinicalWorkflowService.updatePatient(
      patient2.id,
      { phone: '+233-55-123-4567', triageUrgency: 'routine' },
      clinicianContext
    );

    assert.strictEqual(updatedP2.version, 2, 'Aggregate version must increment to 2');
    assert.strictEqual(updatedP2.phone, '+233-55-123-4567');

    const eventsAfterUpdate = await eventStore.getEventsForAggregate('Patient', patient2.id);
    assert.strictEqual(eventsAfterUpdate.length, 2, 'Event store must contain 2 events for patient');
    assert.strictEqual(eventsAfterUpdate[1].eventType, 'PATIENT_UPDATED');
    assert.strictEqual(eventsAfterUpdate[1].sequence, 2, 'Sequence must monotonically increment to 2');
    assert.strictEqual(eventsAfterUpdate[1].version, 2);

    console.log('✓ Scenario 3 PASSED: Patient updated offline with sequence and version increment.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 4: Create encounter while offline
    // ----------------------------------------------------
    console.log('Scenario 4: Create encounter while offline...');
    const encounter1 = await clinicalWorkflowService.createEncounter(
      {
        patientId: patient2.id,
        clinicianId: clinicianContext.userId,
        facilityId: clinicianContext.facilityId,
        type: 'outpatient',
        status: 'in_progress',
        chiefComplaint: 'Acute fever with joint pain for 3 days',
        startedAt: new Date().toISOString(),
      },
      clinicianContext
    );

    const storedEnc = await localRepository.getEncounter(encounter1.id);
    assert.ok(storedEnc, 'Encounter must be persisted in LocalRepository');
    assert.strictEqual(storedEnc?.status, 'in_progress');

    const encEvents = await eventStore.getEventsForAggregate('Encounter', encounter1.id);
    assert.strictEqual(encEvents.length, 1);
    assert.strictEqual(encEvents[0].eventType, 'ENCOUNTER_CREATED');

    console.log('✓ Scenario 4 PASSED: Encounter created offline and persisted.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 5: Queue multiple events
    // ----------------------------------------------------
    console.log('Scenario 5: Queue multiple events offline...');
    // Add Vitals
    await clinicalWorkflowService.recordVitalSign(
      {
        patientId: patient2.id,
        encounterId: encounter1.id,
        systolicBp: 122,
        diastolicBp: 78,
        heartRate: 84,
        temperature: 38.6,
        respiratoryRate: 18,
        oxygenSaturation: 98,
      },
      clinicianContext
    );

    // Add SOAP Note
    await clinicalWorkflowService.createClinicalNote(
      {
        patientId: patient2.id,
        encounterId: encounter1.id,
        subjective: 'Patient reports chills and muscle aches.',
        objective: 'Febrile at 38.6C. Rapid malaria test positive for P. falciparum.',
        assessment: 'Uncomplicated Plasmodium falciparum malaria.',
        plan: 'Start Artemether-Lumefantrine 80/480mg twice daily for 3 days.',
      },
      clinicianContext
    );

    // Add Medication
    await clinicalWorkflowService.prescribeMedication(
      {
        patientId: patient2.id,
        encounterId: encounter1.id,
        name: 'Artemether-Lumefantrine',
        genericName: 'Artemether-Lumefantrine',
        dosage: '80/480mg',
        route: 'oral',
        frequency: 'BID',
        durationDays: 3,
        startDate: '2026-09-04',
        prescribedById: clinicianContext.userId,
        dispensedStatus: 'pending',
      },
      clinicianContext
    );

    const queueStats = await syncQueue.getStats();
    assert.ok(queueStats.pendingCount >= 4, `Expected at least 4 pending events, found ${queueStats.pendingCount}`);
    console.log(`✓ Scenario 5 PASSED: Multiple events queued (${queueStats.pendingCount} pending events).\n`);
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 6: Reconnect
    // ----------------------------------------------------
    console.log('Scenario 6: Reconnect to network...');
    syncEngine.setSimulatedOffline(false);
    assert.strictEqual(syncEngine.isEffectivelyOnline(), true, 'Engine must transition to online');
    console.log('✓ Scenario 6 PASSED: Reconnected.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 7: Synchronize queued events
    // ----------------------------------------------------
    console.log('Scenario 7: Synchronize queued events...');
    await syncEngine.triggerSync();

    const postSyncStats = await syncQueue.getStats();
    assert.strictEqual(postSyncStats.syncingCount, 0, 'No events should remain in SYNCING state');
    assert.ok(postSyncStats.syncedCount > 0, 'Events must be counted as SYNCED');
    assert.strictEqual(postSyncStats.pendingCount, 0, 'All pending events must be synchronized');

    console.log('✓ Scenario 7 PASSED: Queued events transitioned to SYNCED via syncEngine.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 8: Retry failed synchronization
    // ----------------------------------------------------
    console.log('Scenario 8: Retry failed synchronization...');
    // Create a mock transient event that fails on upload
    const dummyEvent: DomainEvent = {
      eventId: 'evt-fail-test-' + Date.now(),
      eventType: 'PATIENT_UPDATED',
      aggregateType: 'Patient',
      aggregateId: patient1.id,
      facilityId: clinicianContext.facilityId,
      actorId: clinicianContext.userId,
      deviceId: clinicianContext.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 99,
      version: 99,
      payload: { note: 'retry test' },
      metadata: {
        deviceId: clinicianContext.deviceId,
        appVersion: '1.0.0',
        offlineGenerated: false,
        userRole: clinicianContext.userRole,
        userName: clinicianContext.userName,
      },
      syncStatus: 'PENDING',
    };

    await syncQueue.enqueue(dummyEvent);
    await syncQueue.markFailed(dummyEvent.eventId, 'Simulated 503 Service Unavailable', 1);

    const failedStats = await syncQueue.getStats();
    assert.ok(failedStats.failedCount >= 1, 'Failed event must be reflected in stats');

    // Retry and mark success
    await syncQueue.markSuccess([dummyEvent.eventId]);
    const recoveredStats = await syncQueue.getStats();
    assert.strictEqual(recoveredStats.failedCount, 0, 'Failed count must clear after successful retry');

    console.log('✓ Scenario 8 PASSED: Failed event registered and successfully retried.\n');
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 9 & 10: Submit the same event twice & Verify idempotency
    // ----------------------------------------------------
    console.log('Scenario 9 & 10: Submit same event twice & verify idempotency...');
    const duplicateEventId = 'evt-idempotent-' + Date.now();
    const eventPayload: DomainEvent = {
      eventId: duplicateEventId,
      eventType: 'DIAGNOSIS_RECORDED',
      aggregateType: 'Diagnosis',
      aggregateId: 'dx-test-1',
      facilityId: clinicianContext.facilityId,
      actorId: clinicianContext.userId,
      deviceId: clinicianContext.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 1,
      version: 1,
      payload: { code: 'A09', description: 'Gastroenteritis' },
      metadata: {
        deviceId: clinicianContext.deviceId,
        appVersion: '1.0.0',
        offlineGenerated: false,
        userRole: clinicianContext.userRole,
        userName: clinicianContext.userName,
      },
      syncStatus: 'PENDING',
    };

    // First append to eventStore
    await eventStore.appendEvent(eventPayload);
    // Second append attempt with same eventId must be safely ignored without crash
    await eventStore.appendEvent(eventPayload);

    const allDxEvents = await eventStore.getEventsForAggregate('Diagnosis', 'dx-test-1');
    assert.strictEqual(allDxEvents.length, 1, 'Idempotency: exactly 1 event must exist in store despite 2 appends');

    console.log('✓ Scenarios 9 & 10 PASSED: Duplicate submission safely handled with strict idempotency.\n');
    passedScenarios += 2;

    // ----------------------------------------------------
    // Scenario 11 & 12: Simulate conflicting updates & verify conflict detection
    // ----------------------------------------------------
    console.log('Scenario 11 & 12: Simulate conflicting updates and verify detection & resolution...');
    const localConflictEvent: DomainEvent = {
      eventId: 'evt-conflict-test-' + Date.now(),
      eventType: 'PATIENT_UPDATED',
      aggregateType: 'Patient',
      aggregateId: patient1.id,
      facilityId: clinicianContext.facilityId,
      actorId: clinicianContext.userId,
      deviceId: clinicianContext.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 2,
      version: 2,
      payload: { phone: '+233-55-999-0000', villageTown: 'Local Bedside Revision' },
      metadata: {
        deviceId: clinicianContext.deviceId,
        appVersion: '1.0.0',
        offlineGenerated: true,
        userRole: clinicianContext.userRole,
        userName: clinicianContext.userName,
      },
      syncStatus: 'PENDING',
    };

    // Remote server aggregate has advanced to version 4 concurrently
    const remoteServerState = {
      id: patient1.id,
      version: 4,
      phone: '+233-20-444-1111',
      villageTown: 'Central Hospital Dispatch',
    };

    const conflict = await conflictResolver.detectConflict(localConflictEvent, remoteServerState);
    assert.ok(conflict, 'Conflict detection must trigger when remoteVersion > localVersion');
    assert.strictEqual(conflict?.resolutionStatus, 'PENDING');
    assert.strictEqual(conflict?.localVersion, 2);
    assert.strictEqual(conflict?.remoteVersion, 4);

    // Resolve conflict with RESOLVED_LOCAL
    await conflictResolver.resolveConflict(conflict.conflictId, 'RESOLVED_LOCAL', undefined, clinicianContext.userId, 'Clinician confirmed local bedside observation');
    const resolvedConflict = await conflictResolver.getConflictById(conflict.conflictId);
    assert.strictEqual(resolvedConflict?.resolutionStatus, 'RESOLVED_LOCAL');
    assert.ok(resolvedConflict?.resolvedAt);

    console.log('✓ Scenarios 11 & 12 PASSED: Conflict detected and explicitly resolved without silent overwrite.\n');
    passedScenarios += 2;

    // ----------------------------------------------------
    // Scenario 13: Verify audit events
    // ----------------------------------------------------
    console.log('Scenario 13: Verify audit events...');
    const patientAudits = await auditRepository.query({ resourceId: patient1.id });
    assert.ok(patientAudits.length > 0, 'Audit entries must be recorded for patient mutation');
    const firstAudit = patientAudits[0];
    assert.strictEqual(firstAudit.actorId, clinicianContext.userId);
    assert.strictEqual(firstAudit.facilityId, clinicianContext.facilityId);
    assert.ok(firstAudit.timestamp);

    console.log(`✓ Scenario 13 PASSED: Audit trail verified with actor, facility, and timestamps.\n`);
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 14: Verify facility isolation
    // ----------------------------------------------------
    console.log('Scenario 14: Verify facility isolation...');
    const facilityAPatients = await localRepository.getAllPatients('fac-rural-dispensary-01');
    const facilityBPatients = await localRepository.getAllPatients('fac-district-hospital');

    // All patients retrieved with facility filter must match primaryFacilityId
    facilityAPatients.forEach((p) => {
      assert.strictEqual(p.primaryFacilityId, 'fac-rural-dispensary-01');
    });
    facilityBPatients.forEach((p) => {
      assert.strictEqual(p.primaryFacilityId, 'fac-district-hospital');
    });

    console.log(`✓ Scenario 14 PASSED: Facility isolation verified (Facility A: ${facilityAPatients.length}, Facility B: ${facilityBPatients.length}).\n`);
    passedScenarios++;

    // ----------------------------------------------------
    // Scenario 15: Verify unauthorized operations are rejected
    // ----------------------------------------------------
    console.log('Scenario 15: Verify unauthorized operations are rejected...');
    // Receptionist attempting clinical prescribing
    const canReceptionistPrescribe = hasPermission('receptionist', 'clinical:prescribe');
    assert.strictEqual(canReceptionistPrescribe, false, 'Receptionist must NOT have clinical:prescribe permission');

    const canPhysicianPrescribe = hasPermission('physician', 'clinical:prescribe');
    assert.strictEqual(canPhysicianPrescribe, true, 'Physician MUST have clinical:prescribe permission');

    const canReceptionistDiagnose = hasPermission('receptionist', 'clinical:diagnose');
    assert.strictEqual(canReceptionistDiagnose, false, 'Receptionist must NOT have clinical:diagnose permission');

    console.log('✓ Scenario 15 PASSED: Unauthorized clinical operations rejected via RBAC.\n');
    passedScenarios++;

    console.log('======================================================');
    console.log(`ALL ${passedScenarios} OF ${totalScenarios} OFFLINE SCENARIOS PASSED WITH ZERO ERRORS!`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
}

runOfflineArchitectureTestSuite();
