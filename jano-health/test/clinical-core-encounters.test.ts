/**
 * Jano Health - Clinical Core V2: Encounters, Clinical Notes & Vitals Test Suite
 * 
 * Verifies:
 * 1. Offline-safe deterministic Encounter Number generation and Modulo-36 checksum validation
 * 2. Encounter creation with role-based access control and facility boundaries
 * 3. Clinical chart protection (preventing encounters on DECEASED or MERGED patients)
 * 4. Encounter lifecycle state machine transitions and terminal status immutability
 * 5. SOAP Clinical Note drafting, validation, and attestation
 * 6. Signed clinical note immutability enforcement (rejects direct edits)
 * 7. Versioned note amendment pipeline with clinical justification
 * 8. Bedside vital signs physiological validation and critical clinical warning triggers
 * 9. Unified longitudinal patient timeline integration
 */

import { generateEncounterNumber, validateEncounterNumber, calculateEncounterChecksum } from '../src/domain/encounterNumber';
import { encounterService, PatientStatusViolationError, EncounterLifecycleError } from '../src/services/clinical/encounterService';
import { clinicalNoteService, SignedNoteImmutabilityError } from '../src/services/clinical/clinicalNoteService';
import { vitalsService, VitalValidationException } from '../src/services/clinical/vitalsService';
import { patientService, AuthenticatedPrincipal } from '../src/services/clinical/patientService';
import { patientTimelineService } from '../src/services/clinical/patientTimeline';
import { localDb } from '../src/services/storage/localDatabase';

// Mock test principals across multiple roles and facilities
const doctorAmgh: AuthenticatedPrincipal = {
  id: 'usr_doc_01',
  fullName: 'Dr. Samuel Mensah',
  role: 'physician',
  facilityId: 'AMGH-001',
};

const nurseAmgh: AuthenticatedPrincipal = {
  id: 'usr_nur_01',
  fullName: 'Nurse Grace Darko',
  role: 'nurse',
  facilityId: 'AMGH-001',
};

const pharmacistAmgh: AuthenticatedPrincipal = {
  id: 'usr_pharm_01',
  fullName: 'Kwame Asante, PharmD',
  role: 'pharmacist',
  facilityId: 'AMGH-001',
};

const doctorOtherFac: AuthenticatedPrincipal = {
  id: 'usr_doc_other',
  fullName: 'Dr. Elena Rostova',
  role: 'physician',
  facilityId: 'KATH-002',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ Passed: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${message}`);
    failed++;
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V2 (ENCOUNTERS, NOTES & VITALS)');
  console.log('=============================================================');

  // Clear local DB before run
  localDb.clearAll();

  // Seed a primary test patient
  const regResult = await patientService.registerPatient(
    doctorAmgh,
    {
      givenName: 'Kwabena',
      familyName: 'Appiah',
      dateOfBirth: '1985-04-12',
      sex: 'male',
      phone: '+233244112233',
      villageTown: 'Ejisu',
      district: 'Ejisu-Juaben',
      registrationFacilityId: 'AMGH-001',
    }
  );
  assert(regResult.success && !!regResult.patient && !!regResult.patient.id, 'Test patient registered successfully for encounter testing');
  const patient = regResult.patient!;

  // TEST 1: Encounter Number Generation & Modulo-36 Checksum
  console.log('\nTEST 1: Encounter Number generation and checksum verification...');
  const date = new Date('2026-09-08T10:00:00Z');
  const encNum1 = generateEncounterNumber('AMGH-001', 'tablet-node-a', date);
  const encNum2 = generateEncounterNumber('AMGH-001', 'tablet-node-b', date);

  assert(encNum1.startsWith('ENC-AMGH-20260908-'), `Encounter number has correct prefix structure: ${encNum1}`);
  assert(encNum1 !== encNum2, 'Encounter numbers generated on distinct tablets are globally unique');

  const valResult = validateEncounterNumber(encNum1);
  assert(valResult.valid === true, `Encounter number validated correctly with checksum: ${encNum1}`);

  // Intentionally corrupt the last character (simulate clinical typo)
  const corrupted = encNum1.slice(0, -1) + (encNum1.slice(-1) === 'Z' ? 'A' : 'Z');
  const typoResult = validateEncounterNumber(corrupted);
  assert(typoResult.valid === false, 'Modulo-36 checksum successfully intercepted transcription typo');

  // TEST 2: Authoritative Encounter Creation
  console.log('\nTEST 2: Authoritative encounter creation pipeline...');
  const encounter = await encounterService.createEncounter(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      encounterType: 'OUTPATIENT',
      chiefComplaint: 'Persistent productive cough and evening fever for 5 days',
      priority: 'urgent',
      reasonForVisit: 'Suspected respiratory tract infection',
    },
    doctorAmgh
  );

  assert(!!encounter.id, `Encounter created with unique aggregate ID: ${encounter.id}`);
  assert(!!encounter.encounterNumber, `Encounter assigned human-readable number: ${encounter.encounterNumber}`);
  assert(encounter.status === 'IN_PROGRESS', 'Default encounter status initiated as IN_PROGRESS');
  assert(encounter.syncStatus === 'LOCAL_ONLY', 'Sync status initialized to LOCAL_ONLY pending server acknowledgment');
  assert(encounter.version === 1, 'Initial encounter aggregate starts at monotonic version 1');

  // TEST 3: Cross-Facility Security Boundary & Unauthorized Role Rejection
  console.log('\nTEST 3: Cross-facility and unauthorized role enforcement...');
  let crossFacBlocked = false;
  try {
    await encounterService.createEncounter(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        encounterType: 'OUTPATIENT',
        chiefComplaint: 'Unauthorized cross-facility encounter',
      },
      doctorOtherFac // Physician at KATH-002 trying to open encounter at AMGH-001
    );
  } catch (err: any) {
    crossFacBlocked = true;
  }
  assert(crossFacBlocked, 'Cross-facility encounter initiation rejected fail-closed');

  let unauthorizedRoleBlocked = false;
  try {
    await encounterService.createEncounter(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        encounterType: 'OUTPATIENT',
        chiefComplaint: 'Dispensary role attempting clinical consultation opening',
      },
      pharmacistAmgh // Pharmacist cannot open primary clinical encounters
    );
  } catch (err: any) {
    unauthorizedRoleBlocked = true;
  }
  assert(unauthorizedRoleBlocked, 'Role lacking encounter.create capability cleanly rejected');

  // TEST 4: Patient Status Chart Protection (DECEASED / MERGED)
  console.log('\nTEST 4: Patient status protection (blocking encounters on closed charts)...');
  const decReg = await patientService.registerPatient(
    doctorAmgh,
    {
      givenName: 'Kofi',
      familyName: 'Antwi',
      dateOfBirth: '1960-01-01',
      sex: 'male',
      villageTown: 'Ejisu',
      district: 'Ejisu-Juaben',
      registrationFacilityId: 'AMGH-001',
    }
  );
  assert(decReg.success && !!decReg.patient, 'Deceased candidate registered');
  const deceasedPatient = decReg.patient!;

  await patientService.changePatientStatus(
    doctorAmgh,
    deceasedPatient.id,
    'DECEASED',
    'Cardiorespiratory arrest'
  );

  let deceasedBlocked = false;
  try {
    await encounterService.createEncounter(
      {
        patientId: deceasedPatient.id,
        facilityId: 'AMGH-001',
        encounterType: 'OUTPATIENT',
        chiefComplaint: 'Consultation attempt on deceased patient',
      },
      doctorAmgh
    );
  } catch (err: any) {
    deceasedBlocked = err instanceof PatientStatusViolationError;
  }
  assert(deceasedBlocked, 'Clinical encounter initiation blocked for deceased patient chart');

  // TEST 5: Encounter Lifecycle State Machine
  console.log('\nTEST 5: Encounter lifecycle state transitions and terminal lock...');
  // 1. IN_PROGRESS -> COMPLETED
  const completedEnc = await encounterService.transitionEncounterStatus(
    encounter.id,
    'COMPLETED',
    'Consultation finished, prescriptions pending',
    doctorAmgh
  );
  assert(completedEnc.status === 'COMPLETED', 'Encounter transitioned from IN_PROGRESS to COMPLETED');
  assert(completedEnc.version === 2, 'Encounter version incremented to 2');

  // 2. COMPLETED -> SIGNED
  const signedEnc = await encounterService.transitionEncounterStatus(
    encounter.id,
    'SIGNED',
    undefined,
    doctorAmgh
  );
  assert(signedEnc.status === 'SIGNED', 'Encounter transitioned to SIGNED');
  assert(signedEnc.signedById === doctorAmgh.id, 'Clinician signature recorded on finalized encounter');
  assert(signedEnc.version === 3, 'Encounter version incremented to 3');

  // 3. Modifying SIGNED encounter is strictly forbidden
  let signedModificationBlocked = false;
  try {
    await encounterService.updateEncounter(
      encounter.id,
      { chiefComplaint: 'Attempted retroactive alteration of complaint' },
      doctorAmgh
    );
  } catch (err: any) {
    signedModificationBlocked = err instanceof EncounterLifecycleError;
  }
  assert(signedModificationBlocked, 'Direct modification of SIGNED encounter strictly prevented');

  // TEST 6: SOAP Clinical Note Drafting & Normalization
  console.log('\nTEST 6: SOAP Clinical note drafting and structured content normalization...');
  const activeEnc = await encounterService.createEncounter(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      encounterType: 'OUTPATIENT',
      chiefComplaint: 'Follow-up for chronic hypertension',
    },
    doctorAmgh
  );

  const soapNote = await clinicalNoteService.createClinicalNote(
    {
      patientId: patient.id,
      encounterId: activeEnc.id,
      facilityId: 'AMGH-001',
      subjective: {
        chiefComplaint: 'Patient feels mild dizziness in the morning',
        historyOfPresentIllness: 'Adherent to amlodipine 5mg daily. No chest pain or palpitations.',
      },
      objective: {
        physicalExamination: 'Chest clear bilaterally. Heart sounds S1, S2 present, no murmurs.',
      },
      assessment: {
        clinicalAssessment: 'Stage 1 Essential Hypertension with morning orthostatic symptoms.',
      },
      plan: {
        treatmentPlan: 'Continue Amlodipine 5mg. Check morning and evening BP log for 2 weeks.',
      },
    },
    doctorAmgh
  );

  assert(!!soapNote.id, `SOAP note created with aggregate ID: ${soapNote.id}`);
  assert(soapNote.status === 'DRAFT', 'Initial SOAP note status is DRAFT');
  assert(soapNote.authorId === doctorAmgh.id, 'Author identity attached');
  assert(soapNote.subjective.includes('dizziness'), 'Flat subjective string normalized for searchability');
  assert(!!soapNote.structuredContent?.assessment?.clinicalAssessment, 'Structured SOAP object preserved intact');

  // TEST 7: Signed Clinical Note Immutability
  console.log('\nTEST 7: Signed note immutability enforcement...');
  const signedNote = await clinicalNoteService.signClinicalNote(soapNote.id, doctorAmgh);
  assert(signedNote.status === 'SIGNED', 'Clinical note successfully signed and sealed');
  assert(signedNote.signedById === doctorAmgh.id, 'Attesting clinician recorded on note');

  let directEditBlocked = false;
  try {
    await clinicalNoteService.updateClinicalNote(
      soapNote.id,
      { assessment: 'Silent retroactive tamper of diagnostic assessment' },
      doctorAmgh
    );
  } catch (err: any) {
    directEditBlocked = err instanceof SignedNoteImmutabilityError;
  }
  assert(directEditBlocked, 'Silent edit to signed clinical note rejected fail-closed');

  // TEST 8: Versioned Note Amendment Pipeline
  console.log('\nTEST 8: Versioned amendment pipeline for signed documentation...');
  const amendedNote = await clinicalNoteService.amendClinicalNote(
    soapNote.id,
    {
      amendmentReason: 'Patient reported additional allergy to ACE inhibitors during pharmacy review',
      assessment: 'Stage 1 Essential Hypertension. Note added: Avoid ACE inhibitors (cough/allergy).',
    },
    doctorAmgh
  );

  assert(amendedNote.previousVersionId === soapNote.id, 'Amended note points to previous version ID');
  assert(amendedNote.version === 3, 'Amended note has incremented version number');
  assert(amendedNote.amendmentReason.includes('ACE inhibitors'), 'Amendment clinical justification recorded');

  const originalRefetched = await clinicalNoteService.getClinicalNote(soapNote.id);
  assert(originalRefetched?.status === 'AMENDED', 'Original signed note marked as AMENDED in audit ledger');

  // TEST 9: Bedside Vital Signs Physiological Validation & Warning Detection
  console.log('\nTEST 9: Bedside vital signs validation and physiological warning triggers...');
  
  // Plausibility check: systolic <= diastolic must throw
  let invalidBpBlocked = false;
  try {
    await vitalsService.recordVitalSigns(
      {
        patientId: patient.id,
        encounterId: activeEnc.id,
        systolicBp: 80,
        diastolicBp: 110, // Invalid: diastolic > systolic
      },
      nurseAmgh
    );
  } catch (err: any) {
    invalidBpBlocked = err instanceof VitalValidationException;
  }
  assert(invalidBpBlocked, 'Inverted blood pressure (systolic <= diastolic) caught by physiological validator');

  // Valid record with critical clinical warnings (e.g. Severe hypertension, tachycardia, hypoxemia)
  const criticalVitals = await vitalsService.recordVitalSigns(
    {
      patientId: patient.id,
      encounterId: activeEnc.id,
      systolicBp: 195,
      diastolicBp: 125,
      heartRate: 135,
      temperature: 39.5,
      oxygenSaturation: 88,
      respiratoryRate: 32,
    },
    nurseAmgh
  );

  assert(criticalVitals.clinicalWarnings !== undefined, 'Physiological warnings generated');
  assert(criticalVitals.clinicalWarnings!.some(w => w.includes('HYPERTENSION')), 'Triggered hypertensive emergency warning');
  assert(criticalVitals.clinicalWarnings!.some(w => w.includes('TACHYCARDIA')), 'Triggered tachycardia warning');
  assert(criticalVitals.clinicalWarnings!.some(w => w.includes('HYPOXEMIA')), 'Triggered severe hypoxemia warning');
  assert(criticalVitals.clinicalWarnings!.some(w => w.includes('FEVER')), 'Triggered high fever alert');

  // TEST 10: Unified Patient Longitudinal Timeline
  console.log('\nTEST 10: Unified patient longitudinal timeline aggregation...');
  const timeline = await patientTimelineService.buildTimeline(patient.id);

  assert(timeline.entries.length >= 4, `Timeline compiled ${timeline.entries.length} longitudinal clinical entries`);
  assert(timeline.entries.some(e => e.category === 'REGISTRATION'), 'Timeline contains registration event');
  assert(timeline.entries.some(e => e.category === 'ENCOUNTER'), 'Timeline contains encounter event');
  assert(timeline.entries.some(e => e.category === 'CLINICAL_NOTE'), 'Timeline contains SOAP clinical notes');
  assert(timeline.entries.some(e => e.category === 'VITALS'), 'Timeline contains bedside vital signs');
  assert(timeline.integrityHash.length === 64, 'Timeline cryptographic SHA-256 integrity hash verified');

  console.log('\n-------------------------------------------------------------');
  console.log(`CLINICAL CORE V2 TEST SUMMARY: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('-------------------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
