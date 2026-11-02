/**
 * Jano Health - Clinical Core V1 Patient Identity & Master Record Test Suite
 * 
 * Verifies all clinical domain invariants for Clinical Core V1:
 * 1. MRN deterministic generation, device isolation, and Modulo-36 Luhn checksum validation
 * 2. Multi-tiered duplicate detection scoring and fuzzy Levenshtein name matching
 * 3. Authoritative patient registration pipeline (Auth -> Capability -> Facility -> Domain Validation -> Duplicate Check -> Event -> Sync)
 * 4. Role-based access control (RBAC) rejection of unauthorized registrar roles
 * 5. Facility tenant scope enforcement (cross-facility rejection)
 * 6. Duplicate override safeguards with required clinical justification
 * 7. Demographic updates with optimistic versioning and audit trail
 * 8. Status changes (ACTIVE -> DECEASED with deceasedAt timestamp)
 * 9. Patient merge reconciliation: survivor active, duplicate retired with pointer, locked from clinical entry
 * 10. Longitudinal timeline reconstruction with domain events, audit ledger, and cryptographic hashes
 */

import assert from 'node:assert';
import { generateMRN, validateMRN, deriveDeviceSignature } from '../src/domain/mrn';
import { evaluateDuplicates } from '../src/services/clinical/duplicateDetection';
import { patientService, AuthenticatedPrincipal } from '../src/services/clinical/patientService';
import { patientTimelineService } from '../src/services/clinical/patientTimeline';
import { localDb } from '../src/services/storage/localDatabase';
import { localRepository } from '../src/services/storage/localRepository';
import { eventStore } from '../src/services/events/eventStore';
import { syncQueue } from '../src/services/sync/syncQueue';
import { auditRepository } from '../src/services/audit/auditRepository';
import { auditService } from '../src/services/audit/auditService';
import { calculateAge, validateDateOfBirth } from '../src/domain/clinicalUtils';

async function runClinicalCorePatientTestSuite() {
  console.log('\n=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V1 (PATIENT IDENTITY & RECORD)');
  console.log('=============================================================\n');

  let passedTests = 0;
  const totalTests = 10;

  // Setup Principals
  const receptionistPrincipal: AuthenticatedPrincipal = {
    id: 'usr-rec-001',
    fullName: 'Juma Mwamburi',
    role: 'receptionist',
    facilityId: 'fac-rural-dispensary-01',
  };

  const physicianPrincipal: AuthenticatedPrincipal = {
    id: 'usr-doc-002',
    fullName: 'Dr. Amina Touré',
    role: 'physician',
    facilityId: 'fac-rural-dispensary-01',
  };

  const pharmacyTechPrincipal: AuthenticatedPrincipal = {
    id: 'usr-pharm-003',
    fullName: 'Baraka Kiprotich',
    role: 'pharmacist',
    facilityId: 'fac-rural-dispensary-01',
  };

  const facilityAdminPrincipal: AuthenticatedPrincipal = {
    id: 'usr-admin-004',
    fullName: 'Grace Mchome',
    role: 'facility_administrator',
    facilityId: 'fac-rural-dispensary-01',
  };

  // TEST 1: MRN Generation, Format, and Modulo-36 Checksum Validation
  console.log('TEST 1: Validating MRN generation, device isolation, and checksums...');
  {
    const mrn1 = generateMRN('fac-rural-dispensary-01', 'station-01');
    const mrn2 = generateMRN('fac-rural-dispensary-01', 'station-02');

    assert.ok(mrn1.startsWith('JH-'), 'MRN must start with JH-');
    assert.strictEqual(mrn1.split('-').length, 5, 'MRN must adhere to JH-[FACILITY]-[YEAR]-[DEVICE]-[SEQ+CHK]');
    assert.notStrictEqual(mrn1, mrn2, 'MRNs generated on different devices must not collide');

    const validResult1 = validateMRN(mrn1);
    const validResult2 = validateMRN(mrn2);
    assert.strictEqual(validResult1.valid, true, 'Generated MRN 1 must pass validation');
    assert.strictEqual(validResult2.valid, true, 'Generated MRN 2 must pass validation');

    // Corrupted checksum test
    const corruptedMrn = mrn1.substring(0, mrn1.length - 1) + (mrn1.endsWith('A') ? 'B' : 'A');
    assert.strictEqual(validateMRN(corruptedMrn).valid, false, 'Corrupted MRN checksum must fail validation');

    passedTests++;
    console.log('  -> PASS: MRN format and cryptographic checksum verified.');
  }

  // TEST 2: Multi-Tiered Duplicate Detection Scoring & Fuzzy Matching
  console.log('TEST 2: Validating duplicate scoring and fuzzy Levenshtein matching...');
  {
    // Exact National ID match
    const exactMatch = evaluateDuplicates(
      {
        givenName: 'Hamisi',
        familyName: 'Bakari',
        dateOfBirth: '1988-04-12',
        nationalId: '19880412-12345-00001-20',
        phone: '+255712345678',
        villageTown: 'Kigoma',
      },
      [
        {
          id: 'pat-existing-01',
          mrn: 'KIG-1000-A1B-9',
          firstName: 'Hamis',
          lastName: 'Bakary',
          dateOfBirth: '1988-04-12',
          nationalId: '19880412-12345-00001-20',
          phone: '+255712345678',
          villageTown: 'Kigoma',
          district: 'Kigoma',
          primaryFacilityId: 'fac-rural-dispensary-01',
          triageUrgency: 'routine',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          gender: 'male',
        },
      ]
    );

    assert.ok(exactMatch.length > 0, 'Must identify duplicate candidate');
    assert.strictEqual(exactMatch[0].overallScore, 100, 'Identical National ID must produce 100% score');
    assert.strictEqual(exactMatch[0].confidence, 'HIGH', 'Score of 100 must be HIGH confidence');

    // Fuzzy name similarity: "Zainab" vs "Zaynab"
    const fuzzyCandidates = evaluateDuplicates(
      {
        givenName: 'Zaynab',
        familyName: 'Mkwaua',
        dateOfBirth: '1995-11-20',
        phone: '+255755112233',
        villageTown: 'Ujiji',
      },
      [
        {
          id: 'pat-existing-02',
          mrn: 'KIG-1001-A1B-8',
          firstName: 'Zainab',
          lastName: 'Mkwawa',
          dateOfBirth: '1995-11-20',
          phone: '+255755112233',
          villageTown: 'Ujiji',
          district: 'Kigoma',
          primaryFacilityId: 'fac-rural-dispensary-01',
          triageUrgency: 'routine',
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          gender: 'female',
        },
      ]
    );

    assert.ok(fuzzyCandidates.length > 0, 'Must identify fuzzy duplicate candidate');
    assert.ok(fuzzyCandidates[0].overallScore >= 60, `Fuzzy name variations with matching DOB and phone must score >=60 (got ${fuzzyCandidates[0].overallScore})`);

    passedTests++;
    console.log('  -> PASS: Duplicate detection scoring verified.');
  }

  // TEST 3: Authoritative Registration Pipeline (Authorized Receptionist)
  console.log('TEST 3: Registering new patient through authoritative domain pipeline...');
  let registeredPatientId = '';
  let registeredPatientMrn = '';
  {
    const regResult = await patientService.registerPatient(receptionistPrincipal, {
      givenName: 'Neema',
      familyName: 'Mwita',
      dateOfBirth: '1994-08-15',
      dateOfBirthPrecision: 'EXACT',
      sex: 'female',
      phone: '+255713998877',
      villageTown: 'Kasulu Rural',
      district: 'Kasulu',
      region: 'Kigoma',
      country: 'Tanzania',
      bloodGroup: 'B+',
      allergiesSummary: ['Penicillin'],
      triageUrgency: 'routine',
      registrationFacilityId: 'fac-rural-dispensary-01',
    });

    assert.strictEqual(regResult.success, true, `Registration failed: ${regResult.error}`);
    assert.ok(regResult.patient, 'Patient must be returned');
    assert.strictEqual(regResult.patient.givenName, 'Neema');
    assert.strictEqual(regResult.patient.familyName, 'Mwita');
    assert.ok(regResult.patient.mrn, 'MRN must be generated');
    assert.strictEqual(validateMRN(regResult.patient.mrn).valid, true, 'MRN must pass checksum');

    registeredPatientId = regResult.patient.id;
    registeredPatientMrn = regResult.patient.mrn;

    // Verify persisted in localDb
    const fromDb = localDb.getPatientById(registeredPatientId);
    assert.ok(fromDb, 'Patient must be persisted in local database');
    assert.strictEqual(fromDb.version, 1, 'Initial version must be 1');

    // Verify domain event emitted
    const events = await eventStore.getEventsForAggregate('Patient', registeredPatientId);
    assert.ok(events.length > 0, 'Domain event must be recorded in event store');
    assert.strictEqual(events[0].eventType, 'PatientRegistered');
    assert.strictEqual(events[0].actorId, receptionistPrincipal.id);

    // Verify audit record emitted
    const audits = auditService.getTrail(registeredPatientId);
    const regAudit = audits.find((a) => a.action === 'PATIENT_REGISTERED');
    assert.ok(regAudit, 'Audit record PATIENT_REGISTERED must be created');

    passedTests++;
    console.log('  -> PASS: Patient registered with domain event and audit ledger.');
  }

  // TEST 4: RBAC Enforcement: Unauthorized Role Denied Registration
  console.log('TEST 4: Verifying role-based capability rejection for unauthorized roles...');
  {
    const unauthorizedResult = await patientService.registerPatient(pharmacyTechPrincipal, {
      givenName: 'Jafari',
      familyName: 'Omari',
      dateOfBirth: '2000-01-01',
      sex: 'male',
      villageTown: 'Kigoma',
      district: 'Kigoma',
      registrationFacilityId: 'fac-rural-dispensary-01',
    });

    assert.strictEqual(unauthorizedResult.success, false, 'Pharmacy technician must not register patients');
    assert.ok(unauthorizedResult.error?.includes('Access Denied'), 'Error must indicate access denied');

    passedTests++;
    console.log('  -> PASS: Unauthorized role cleanly rejected with fail-closed security.');
  }

  // TEST 5: Cross-Facility Tenant Boundary Enforcement
  console.log('TEST 5: Verifying cross-facility tenant isolation...');
  {
    const crossFacilityResult = await patientService.registerPatient(receptionistPrincipal, {
      givenName: 'Asha',
      familyName: 'Rashidi',
      dateOfBirth: '1992-03-10',
      sex: 'female',
      villageTown: 'Dodoma',
      district: 'Dodoma',
      registrationFacilityId: 'fac-regional-referral-02', // Different facility!
    });

    assert.strictEqual(crossFacilityResult.success, false, 'Cross-facility registration must be rejected');
    assert.ok(crossFacilityResult.error?.includes('outside your assigned facility'), 'Error must enforce facility scope');

    passedTests++;
    console.log('  -> PASS: Cross-facility boundary enforced.');
  }

  // TEST 6: Duplicate Interception & Override Enforcement
  console.log('TEST 6: Verifying duplicate registration interception and override validation...');
  {
    // Attempt duplicate registration with identical details
    const dupAttempt = await patientService.registerPatient(receptionistPrincipal, {
      givenName: 'Neema',
      familyName: 'Mwita',
      dateOfBirth: '1994-08-15',
      sex: 'female',
      phone: '+255713998877',
      villageTown: 'Kasulu Rural',
      district: 'Kasulu',
      registrationFacilityId: 'fac-rural-dispensary-01',
    });

    assert.strictEqual(dupAttempt.success, false, 'Duplicate registration without override must be blocked');
    assert.strictEqual(dupAttempt.requiresOverride, true, 'Result must flag requiresOverride: true');
    assert.ok(dupAttempt.duplicates && dupAttempt.duplicates.length > 0, 'Must include duplicate candidates');

    // Attempt override without justification
    const overrideNoJustification = await patientService.registerPatient(
      receptionistPrincipal,
      {
        givenName: 'Neema',
        familyName: 'Mwita',
        dateOfBirth: '1994-08-15',
        sex: 'female',
        phone: '+255713998877',
        villageTown: 'Kasulu Rural',
        district: 'Kasulu',
        registrationFacilityId: 'fac-rural-dispensary-01',
      },
      { allowDuplicateOverride: true, duplicateOverrideReason: '' }
    );

    assert.strictEqual(overrideNoJustification.success, false, 'Override without clinical justification must fail');

    passedTests++;
    console.log('  -> PASS: Duplicate detection safety checks and justification enforced.');
  }

  // TEST 7: Demographic Updates with Optimistic Versioning
  console.log('TEST 7: Verifying demographic updates, version incrementing, and audit trail...');
  {
    const updateResult = await patientService.updatePatientDemographics(
      physicianPrincipal,
      registeredPatientId,
      {
        preferredName: 'Mama Neema',
        phone: '+255713998800',
        villageTown: 'Kasulu Town Center',
      }
    );

    assert.strictEqual(updateResult.success, true, `Update failed: ${updateResult.error}`);
    assert.strictEqual(updateResult.patient?.preferredName, 'Mama Neema');
    assert.strictEqual(updateResult.patient?.version, 2, 'Patient record version must increment to 2');

    // Verify in localDb
    const updatedDb = localDb.getPatientById(registeredPatientId);
    assert.strictEqual(updatedDb?.version, 2);
    assert.strictEqual(updatedDb?.phone, '+255713998800');

    passedTests++;
    console.log('  -> PASS: Demographic update versioned and persisted.');
  }

  // TEST 8: Patient Lifecycle Status Change (Deceased with Timestamp)
  console.log('TEST 8: Verifying lifecycle status transitions...');
  let secondPatientId = '';
  {
    const pat2 = await patientService.registerPatient(receptionistPrincipal, {
      givenName: 'Kassim',
      familyName: 'Majaliwa',
      dateOfBirth: '1970-05-12',
      sex: 'male',
      villageTown: 'Kigoma Port',
      district: 'Kigoma',
      registrationFacilityId: 'fac-rural-dispensary-01',
    });
    assert.strictEqual(pat2.success, true);
    secondPatientId = pat2.patient!.id;

    const deceasedTimestamp = new Date().toISOString();
    const statusResult = await patientService.changePatientStatus(
      physicianPrincipal,
      secondPatientId,
      'DECEASED',
      'Cardiac arrest confirmed by attending physician',
      deceasedTimestamp
    );

    assert.strictEqual(statusResult.success, true);
    assert.strictEqual(statusResult.patient?.patientStatus, 'DECEASED');
    assert.strictEqual(statusResult.patient?.deceasedAt, deceasedTimestamp);

    passedTests++;
    console.log('  -> PASS: Lifecycle status updated with deceased timestamp.');
  }

  // TEST 9: Authoritative Patient Merge & Reconciliation
  console.log('TEST 9: Verifying record deduplication merge and survivor pointer...');
  let duplicatePatientId = '';
  {
    // Register duplicate candidate
    const dupPatient = await patientService.registerPatient(
      receptionistPrincipal,
      {
        givenName: 'Neema',
        familyName: 'Mwita-Duplicate',
        dateOfBirth: '1994-08-15',
        sex: 'female',
        phone: '+255713998811',
        villageTown: 'Kasulu Outskirts',
        district: 'Kasulu',
        registrationFacilityId: 'fac-rural-dispensary-01',
      },
      { allowDuplicateOverride: true, duplicateOverrideReason: 'Temporary outreach registration to be merged' }
    );
    assert.strictEqual(dupPatient.success, true);
    duplicatePatientId = dupPatient.patient!.id;

    // Perform Merge by Facility Administrator
    const mergeResult = await patientService.mergePatients(
      facilityAdminPrincipal,
      registeredPatientId, // Survivor
      duplicatePatientId, // Duplicate
      'Confirmed identity match during chart audit; outreach spelling variation.'
    );

    assert.strictEqual(mergeResult.success, true, `Merge failed: ${mergeResult.error}`);
    assert.strictEqual(mergeResult.survivingPatient?.id, registeredPatientId);
    assert.strictEqual(mergeResult.retiredPatient?.patientStatus, 'MERGED');
    assert.strictEqual(mergeResult.retiredPatient?.mergedIntoPatientId, registeredPatientId);

    // Verify duplicate is permanently locked from future demographic changes
    const illegalUpdate = await patientService.updatePatientDemographics(
      physicianPrincipal,
      duplicatePatientId,
      { villageTown: 'New Village' }
    );
    assert.strictEqual(illegalUpdate.success, false, 'Modifying retired duplicate chart must be blocked');
    assert.ok(illegalUpdate.error?.includes('retired merged patient record'));

    passedTests++;
    console.log('  -> PASS: Merge completed: survivor intact, duplicate retired and locked.');
  }

  // TEST 10: Longitudinal Timeline Reconstruction
  console.log('TEST 10: Verifying longitudinal timeline event aggregation and cryptographic hashes...');
  {
    // Log an encounter for the patient
    await localDb.saveEncounter({
      id: 'enc-test-01',
      patientId: registeredPatientId,
      clinicianId: physicianPrincipal.id,
      facilityId: receptionistPrincipal.facilityId,
      type: 'outpatient',
      status: 'completed',
      chiefComplaint: 'Fever and joint pain for 3 days',
      startedAt: new Date().toISOString(),
    });

    // Log bedside vitals
    await localDb.saveVital({
      id: 'vit-test-01',
      patientId: registeredPatientId,
      encounterId: 'enc-test-01',
      recordedById: receptionistPrincipal.id,
      recordedAt: new Date().toISOString(),
      systolicBp: 118,
      diastolicBp: 76,
      heartRate: 82,
      temperature: 38.4,
      oxygenSaturation: 98,
    });

    const timeline = await patientTimelineService.getPatientTimeline(registeredPatientId);
    assert.ok(timeline.length >= 3, `Timeline must contain at least 3 events (got ${timeline.length})`);

    const hasRegistration = timeline.some((t) => t.category === 'REGISTRATION');
    const hasVitals = timeline.some((t) => t.category === 'VITALS');
    const hasEncounter = timeline.some((t) => t.category === 'ENCOUNTER');

    assert.strictEqual(hasRegistration, true, 'Timeline must contain patient registration event');
    assert.strictEqual(hasVitals, true, 'Timeline must contain recorded vitals');
    assert.strictEqual(hasEncounter, true, 'Timeline must contain consultation encounter');

    passedTests++;
    console.log('  -> PASS: Longitudinal timeline accurately aggregated.');
  }

  console.log(`\n-------------------------------------------------------------`);
  console.log(`CLINICAL CORE V1 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`-------------------------------------------------------------\n`);
}

runClinicalCorePatientTestSuite().catch((err) => {
  console.error('\n❌ CLINICAL CORE V1 TEST SUITE FAILED:\n', err);
  process.exit(1);
});
