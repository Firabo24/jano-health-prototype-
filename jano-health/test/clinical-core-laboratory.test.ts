/**
 * Jano Health - Clinical Core V4: Laboratory Workflow Test Suite
 * 
 * Verifies:
 * 1. Offline Deterministic Laboratory Identifiers (ORD- and ACC- with Modulo-36 Luhn-variant checksums)
 * 2. Laboratory Order Requisition Pipeline & Role-Based Access Control (RBAC) boundaries
 * 3. Specimen Collection, Chain-of-Custody & Specimen Intake
 * 4. Specimen Rejection Protocol with mandatory clinical reasons
 * 5. Preliminary Result Entry, Reference Range Association & Flagging
 * 6. Clinical Safety Invariant: Lab findings inform clinical judgment but NEVER automatically generate diagnoses
 * 7. Senior Laboratory Result Verification & Immutability Lock
 * 8. Versioned Result Correction Pipeline with Clinical Justification & Audit Lineage
 * 9. Critical Panic Value Alerting & Mandatory Attested Clinician Acknowledgment
 * 10. Atomic Transactions, Event Sourcing & Audit Ledger Integration
 */

import {
  generateLabOrderNumber,
  validateLabOrderNumber,
  generateAccessionNumber,
  validateAccessionNumber,
  calculateLabChecksum,
} from '../src/domain/labIdentifiers';
import {
  laboratoryWorkflowService,
  CreateLabOrderParams,
  CollectSpecimenParams,
  ReceiveSpecimenParams,
  RejectSpecimenParams,
  EnterResultParams,
  VerifyResultParams,
  CorrectResultParams,
  AcknowledgeCriticalParams,
} from '../src/services/clinical/laboratoryWorkflowService';
import { patientService, AuthenticatedPrincipal } from '../src/services/clinical/patientService';
import { localRepository } from '../src/services/storage/localRepository';
import { localDb } from '../src/services/storage/localDatabase';
import { eventStore } from '../src/services/events/eventStore';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';

// Test Principals across clinical and laboratory roles
const doctorAmgh: ClinicalActorContext = {
  userId: 'usr_doc_kwame',
  userName: 'Dr. Kwame Antwi',
  userRole: 'physician',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-doc-01',
};

const nurseAmgh: ClinicalActorContext = {
  userId: 'usr_nur_grace',
  userName: 'Nurse Grace Darko',
  userRole: 'nurse',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-ward-01',
};

const labTechAmgh: ClinicalActorContext = {
  userId: 'usr_lab_mensah',
  userName: 'Kofi Mensah, MLS',
  userRole: 'laboratory_staff',
  facilityId: 'AMGH-001',
  deviceId: 'workstation-lab-01',
};

const seniorLabScientistAmgh: ClinicalActorContext = {
  userId: 'usr_lab_senior_asante',
  userName: 'Ernest Asante, Lead Pathologist / MLS',
  userRole: 'laboratory_staff',
  facilityId: 'AMGH-001',
  deviceId: 'workstation-lab-02',
};

const supervisorAmgh: ClinicalActorContext = {
  userId: 'usr_sup_akua',
  userName: 'Dr. Akua Mensah',
  userRole: 'clinical_supervisor',
  facilityId: 'AMGH-001',
  deviceId: 'workstation-admin-01',
};

const receptionistAmgh: ClinicalActorContext = {
  userId: 'usr_rec_boateng',
  userName: 'Yaw Boateng',
  userRole: 'receptionist',
  facilityId: 'AMGH-001',
  deviceId: 'front-desk-01',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✓ Passed: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V4 (LABORATORY WORKFLOW TEST SUITE)');
  console.log('=============================================================');

  // Setup: Register a clean test patient for the laboratory workflow
  const registrarActor: AuthenticatedPrincipal = {
    id: doctorAmgh.userId,
    fullName: doctorAmgh.userName,
    role: doctorAmgh.userRole as any,
    facilityId: doctorAmgh.facilityId,
  };

  const regResult = await patientService.registerPatient(
    registrarActor,
    {
      givenName: 'Abena',
      familyName: 'Osei',
      dateOfBirth: '1998-03-24',
      sex: 'female',
      phone: '+233244112233',
      villageTown: 'Ejisu',
      district: 'Ejisu-Juaben',
      registrationFacilityId: 'AMGH-001',
    }
  );
  assert(regResult.success && !!regResult.patient && !!regResult.patient.id, 'Test patient registered successfully for laboratory workflow testing');
  const patient = regResult.patient!;

  // =========================================================================
  // TEST 1: OFFLINE-SAFE LABORATORY IDENTIFIERS & CHECKSUM VERIFICATION
  // =========================================================================
  console.log('\nTEST 1: Laboratory Identifiers & Modulo-36 Checksum Validation...');

  const orderNumber1 = generateLabOrderNumber('AMGH-001', 'tablet-doc-01', new Date('2026-09-09T08:00:00Z'));
  assert(
    orderNumber1.startsWith('ORD-AMGH-20260909-'),
    'Order number conforms to canonical structure: ORD-<FAC>-<YYYYMMDD>-<DEV>-<SEQ><CHECK>',
    `Generated: ${orderNumber1}`
  );
  assert(validateLabOrderNumber(orderNumber1), 'Order number validates cleanly with Modulo-36 Luhn checksum');

  // Test typo interception in order number
  const corruptedOrderNumber = orderNumber1.slice(0, -2) + (orderNumber1.slice(-2, -1) === 'A' ? 'B' : 'A') + orderNumber1.slice(-1);
  assert(!validateLabOrderNumber(corruptedOrderNumber), 'Modulo-36 checksum intercepts transcription typo in Order Number');

  const accessionNumber1 = generateAccessionNumber('AMGH-001', 'workstation-lab-01', new Date('2026-09-09T08:15:00Z'));
  assert(
    accessionNumber1.startsWith('ACC-AMGH-20260909-'),
    'Accession number conforms to canonical structure: ACC-<FAC>-<YYYYMMDD>-<DEV>-<SEQ><CHECK>',
    `Generated: ${accessionNumber1}`
  );
  assert(validateAccessionNumber(accessionNumber1), 'Accession number validates cleanly with Modulo-36 Luhn checksum');

  // Test collision resistance across distinct device signatures
  const accessionFromTablet = generateAccessionNumber('AMGH-001', 'tablet-ward-01', new Date('2026-09-09T08:15:00Z'));
  assert(accessionNumber1 !== accessionFromTablet, 'Accession numbers generated on distinct devices are globally unique without server coordination');

  // =========================================================================
  // TEST 2: LABORATORY ORDER REQUISITION & RBAC AUTHORIZATION BOUNDARIES
  // =========================================================================
  console.log('\nTEST 2: Laboratory Order Requisition & RBAC Boundaries...');

  // Physician creates requisition
  const labOrder = await laboratoryWorkflowService.orderLabTests(
    {
      patientId: patient.id,
      testName: 'Complete Blood Count with Malaria Parasite Film',
      category: 'hematology',
      priority: 'urgent',
      clinicalIndication: 'Fever (39.2C), rigors, severe headaches for 3 days',
      instructions: 'Urgent slide review for Ring Forms',
    },
    doctorAmgh
  );

  assert(!!labOrder && !!labOrder.id, 'Laboratory order created successfully with aggregate ID');
  assert(labOrder.status === 'PLACED', 'Initial order status is strictly PLACED');
  assert(validateLabOrderNumber(labOrder.orderNumber), `Order assigned valid checksummed order number: ${labOrder.orderNumber}`);
  assert(labOrder.priority === 'urgent', 'Urgent priority preserved');
  assert(labOrder.patientId === patient.id, 'Order correctly bound to patient ID');

  // RBAC: Receptionist role is forbidden from ordering lab tests
  let receptionistBlocked = false;
  try {
    await laboratoryWorkflowService.orderLabTests(
      {
        patientId: patient.id,
        testName: 'Biochemistry Panel',
      },
      receptionistAmgh
    );
  } catch (err: any) {
    if (err.message.includes('not authorized') || err.message.includes('Security Exception')) {
      receptionistBlocked = true;
    }
  }
  assert(receptionistBlocked, 'RBAC: Receptionist role lacking lab:order capability is rejected fail-closed');

  // Validation: Missing patient or test name
  let missingPatientBlocked = false;
  try {
    await laboratoryWorkflowService.orderLabTests(
      {
        patientId: '',
        testName: 'Stool Microscopy',
      },
      doctorAmgh
    );
  } catch {
    missingPatientBlocked = true;
  }
  assert(missingPatientBlocked, 'Validation: Order without patient ID is rejected');

  // =========================================================================
  // TEST 3: SPECIMEN COLLECTION & CHAIN-OF-CUSTODY
  // =========================================================================
  console.log('\nTEST 3: Specimen Collection & Chain-of-Custody...');

  const specimen = await laboratoryWorkflowService.collectSpecimen(
    {
      orderId: labOrder.id,
      patientId: patient.id,
      specimenType: 'WHOLE_BLOOD',
      collectionSite: 'Left antecubital fossa venipuncture',
      condition: 'Adequate volume, 4 mL EDTA tube, no visible hemolysis',
    },
    nurseAmgh
  );

  assert(!!specimen && !!specimen.id, 'Specimen collection record created with aggregate ID');
  assert(specimen.status === 'COLLECTED', 'Specimen status is strictly COLLECTED');
  assert(specimen.collectedById === nurseAmgh.userId, 'Specimen bound to collecting nurse identity');
  assert(specimen.orderId === labOrder.id, 'Specimen bound to original laboratory order ID');

  // Check that the order status updated to sample_collected / ACCEPTED
  const allOrdersAfterCollect = await localRepository.getLabOrders();
  const updatedOrderAfterCollect = allOrdersAfterCollect.find((o) => o.id === labOrder.id);
  assert(
    updatedOrderAfterCollect?.status === 'ACCEPTED',
    'Laboratory order automatically transitioned to ACCEPTED upon specimen collection'
  );

  // =========================================================================
  // TEST 4: SPECIMEN INTAKE & REJECTION WORKFLOW
  // =========================================================================
  console.log('\nTEST 4: Specimen Intake & Rejection Workflow...');

  // Create a separate order and specimen specifically to test laboratory rejection protocol
  const rejectedOrder = await laboratoryWorkflowService.orderLabTests(
    {
      patientId: patient.id,
      testName: 'Electrolytes and Coagulation Screen',
      category: 'biochemistry',
      priority: 'routine',
    },
    doctorAmgh
  );

  const specimenToReject = await laboratoryWorkflowService.collectSpecimen(
    {
      orderId: rejectedOrder.id,
      patientId: patient.id,
      specimenType: 'WHOLE_BLOOD',
    },
    nurseAmgh
  );

  // Laboratory Scientist rejects clotted/hemolyzed specimen
  const rejectedSpecimen = await laboratoryWorkflowService.rejectSpecimen(
    {
      specimenId: specimenToReject.id,
      rejectionReason: 'CLOTTED',
      rejectionNotes: 'Micro-clots observed in citrate tube upon inversion; invalid for coagulation assays',
    },
    labTechAmgh
  );

  assert(rejectedSpecimen.status === 'REJECTED', 'Specimen status transitioned to REJECTED');
  assert(rejectedSpecimen.rejectionReason === 'CLOTTED', 'Clinical rejection reason properly recorded');
  assert(
    rejectedSpecimen.rejectionNotes.includes('Micro-clots'),
    'Detailed laboratory technologist rejection rationale persisted'
  );

  // Laboratory reception for the valid specimen
  const receivedSpecimen = await laboratoryWorkflowService.receiveSpecimen(
    {
      specimenId: specimen.id,
      condition: 'Received on cold pack at 4C within 20 minutes',
    },
    labTechAmgh
  );

  assert(receivedSpecimen.status === 'RECEIVED', 'Specimen successfully transitioned to RECEIVED');
  assert(!!receivedSpecimen.receivedAt, 'Specimen intake timestamp recorded');
  assert(validateAccessionNumber(receivedSpecimen.accessionNumber), `Accession barcode generated: ${receivedSpecimen.accessionNumber}`);

  // =========================================================================
  // TEST 5: PRELIMINARY RESULT ENTRY, NUMERIC EVALUATION & FLAG GENERATION
  // =========================================================================
  console.log('\nTEST 5: Result Entry, Reference Ranges & Flagging...');

  // 1. Enter Hemoglobin (abnormal low)
  const hbResult = await laboratoryWorkflowService.enterPreliminaryResult(
    {
      orderId: labOrder.id,
      patientId: patient.id,
      specimenId: receivedSpecimen.id,
      testCode: 'hb',
      testName: 'Hemoglobin',
      parameterName: 'Hb Concentration',
      value: '7.8 g/dL',
      numericValue: 7.8,
      unit: 'g/dL',
      referenceRange: '12.0 - 15.5 g/dL',
      abnormalFlag: 'LOW',
      criticalFlag: false,
      technicianNotes: 'Microcytic hypochromic picture confirmed on film',
    },
    labTechAmgh
  );

  assert(!!hbResult && !!hbResult.id, 'Preliminary laboratory result recorded with aggregate ID');
  assert(hbResult.status === 'PRELIMINARY', 'Initial result status is PRELIMINARY');
  assert(hbResult.abnormalFlag === 'LOW', 'Abnormal flag correctly marked as LOW');
  assert(hbResult.criticalFlag === false, 'Non-critical result has criticalFlag=false');

  // 2. Enter Malaria Parasite Film with a CRITICAL PANIC VALUE (> 100,000 parasites/uL or 4+ ring forms)
  const malariaResult = await laboratoryWorkflowService.enterPreliminaryResult(
    {
      orderId: labOrder.id,
      patientId: patient.id,
      specimenId: receivedSpecimen.id,
      testCode: 'malaria_film',
      testName: 'P. falciparum Thin & Thick Film',
      parameterName: 'Parasite Density',
      value: 'Plasmodium falciparum 4+ (Ring forms > 250,000 / uL)',
      unit: 'parasites/uL',
      referenceRange: 'Negative (0 parasites/uL)',
      abnormalFlag: 'CRITICAL',
      criticalFlag: true,
      technicianNotes: 'High parasitemia. Immediate clinical notification initiated per protocol.',
    },
    labTechAmgh
  );

  assert(malariaResult.criticalFlag === true, 'Critical panic value flag recorded on laboratory result');
  assert(malariaResult.criticalAcknowledged === false, 'Critical alert is initially unacknowledged');

  // Check that the parent order recorded the panic state
  const allOrdersWithCritical = await localRepository.getLabOrders();
  const orderWithCritical = allOrdersWithCritical.find((o) => o.id === labOrder.id);
  assert(
    orderWithCritical?.hasCriticalResults === true,
    'Parent laboratory order marked with hasCriticalResults=true'
  );

  // =========================================================================
  // TEST 6: CLINICAL SAFETY INVARIANT: NO SILENT DIAGNOSES GENERATION
  // =========================================================================
  console.log('\nTEST 6: Clinical Safety Invariant (Lab Results Cannot Silently Become Diagnoses)...');

  // A laboratory result can inform clinical reasoning. It cannot automatically become a diagnosis or treatment decision.
  const patientDiagnoses = await localRepository.getDiagnoses(patient.id);
  assert(
    patientDiagnoses.length === 0,
    'Clinical Safety Mandate: No diagnoses were silently or automatically generated for the patient from positive lab results'
  );

  const patientProblems = await localRepository.getProblems(patient.id);
  assert(
    patientProblems.length === 0,
    'Clinical Safety Mandate: No patient problems were automatically committed without attested physician evaluation'
  );

  // =========================================================================
  // TEST 7: SENIOR LABORATORY RESULT VERIFICATION & IMMUTABILITY
  // =========================================================================
  console.log('\nTEST 7: Senior Result Verification & Immutability Lock...');

  // RBAC: Roles lacking lab:result_verify (e.g. nurse or receptionist) cannot verify lab results
  let nurseVerifyBlocked = false;
  try {
    await laboratoryWorkflowService.verifyResult(
      {
        resultId: hbResult.id,
      },
      nurseAmgh
    );
  } catch (err: any) {
    if (err.message.includes('not authorized') || err.message.includes('Security Exception')) {
      nurseVerifyBlocked = true;
    }
  }
  assert(nurseVerifyBlocked, 'RBAC: Role lacking lab:result_verify is rejected fail-closed');

  const verifiedHb = await laboratoryWorkflowService.verifyResult(
    {
      resultId: hbResult.id,
      verificationNotes: 'Reviewed blood film and analyzer calibration data. Findings verified.',
    },
    seniorLabScientistAmgh
  );

  assert(verifiedHb.status === 'FINAL', 'Verified result transitioned to FINAL status');
  assert(verifiedHb.verifiedById === seniorLabScientistAmgh.userId, 'Verification locked to attesting laboratory scientist ID');
  assert(!!verifiedHb.verifiedAt, 'Verification timestamp permanently recorded');

  // Verify the malaria result as well
  const verifiedMalaria = await laboratoryWorkflowService.verifyResult(
    {
      resultId: malariaResult.id,
      verificationNotes: 'Double-read performed on high-power field. Findings verified.',
    },
    seniorLabScientistAmgh
  );
  assert(verifiedMalaria.status === 'FINAL', 'Critical finding verified to FINAL status');

  // Both results are now finalized -> order should be completed
  const allOrdersFinalized = await localRepository.getLabOrders();
  const completedOrder = allOrdersFinalized.find((o) => o.id === labOrder.id);
  assert(
    completedOrder?.status === 'COMPLETED',
    'Laboratory order transitioned to COMPLETED once all preliminary results are verified'
  );

  // =========================================================================
  // TEST 8: VERSIONED RESULT CORRECTION PIPELINE WITH CLINICAL REASONING
  // =========================================================================
  console.log('\nTEST 8: Versioned Result Correction Pipeline...');

  // Senior lab staff discovers an amendment is required (e.g. baseline Hb recalibration)
  const correctedHb = await laboratoryWorkflowService.correctResult(
    {
      resultId: verifiedHb.id,
      newValue: '8.1 g/dL',
      newNumericValue: 8.1,
      newAbnormalFlag: 'LOW',
      correctionReason: 'Analyzer sample probe recalibration shift; rerun on secondary automated bench yielded 8.1 g/dL',
    },
    labTechAmgh
  );

  assert(correctedHb.status === 'CORRECTED', 'Corrected result has status CORRECTED');
  assert(correctedHb.value === '8.1 g/dL', 'New value updated in corrected result');
  assert(correctedHb.correctionHistory && correctedHb.correctionHistory.length === 1, 'Correction history contains 1 versioned record');
  assert(
    correctedHb.correctionHistory[0].previousValue === '7.8 g/dL',
    'Audit lineage accurately tracks previous value of 7.8 g/dL'
  );
  assert(
    correctedHb.correctionHistory[0].correctionReason.includes('Analyzer sample probe'),
    'Mandatory clinical correction reason persisted in audit history'
  );

  // Missing correction reason fails
  let emptyReasonBlocked = false;
  try {
    await laboratoryWorkflowService.correctResult(
      {
        resultId: correctedHb.id,
        newValue: '8.2 g/dL',
        correctionReason: '',
      },
      labTechAmgh
    );
  } catch {
    emptyReasonBlocked = true;
  }
  assert(emptyReasonBlocked, 'Integrity Mandate: Result correction without explicit justification is rejected fail-closed');

  // =========================================================================
  // TEST 9: CRITICAL PANIC ALERTING & CLINICIAN ATTESTED ACKNOWLEDGMENT
  // =========================================================================
  console.log('\nTEST 9: Critical Panic Alerting & Attested Clinician Acknowledgment...');

  // Unacknowledged critical results can be queried by clinician
  const unackCriticalResults = await laboratoryWorkflowService.getUnacknowledgedCriticalResults('AMGH-001');
  assert(
    unackCriticalResults.some((r) => r.id === malariaResult.id),
    'Critical malaria result appears in the facility unacknowledged panic queue'
  );

  // Attending physician formally acknowledges the panic alert with documentation of clinical action taken
  const acknowledgedResult = await laboratoryWorkflowService.acknowledgeCriticalResult(
    {
      resultId: malariaResult.id,
      clinicalActionTaken: 'Physician notified at bedside. IV Artesunate initiated immediately; blood glucose and hematocrit monitoring scheduled Q4H.',
    },
    doctorAmgh
  );

  assert(acknowledgedResult.criticalAcknowledged === true, 'Critical alert marked as acknowledged');
  assert(
    acknowledgedResult.criticalAcknowledgedById === doctorAmgh.userId,
    'Acknowledgment bound to attending physician ID'
  );
  assert(
    acknowledgedResult.criticalAcknowledgedByName === doctorAmgh.userName,
    'Physician display name recorded'
  );
  assert(
    acknowledgedResult.criticalAcknowledgementNotes?.includes('IV Artesunate'),
    'Clinical emergency escalation notes securely documented'
  );

  // Verify that empty acknowledgment is rejected
  let emptyActionBlocked = false;
  try {
    await laboratoryWorkflowService.acknowledgeCriticalResult(
      {
        resultId: malariaResult.id,
        clinicalActionTaken: '   ',
      },
      doctorAmgh
    );
  } catch {
    emptyActionBlocked = true;
  }
  assert(emptyActionBlocked, 'Safety Mandate: Critical alert acknowledgment without documented action taken is rejected');

  // =========================================================================
  // TEST 10: EVENT SOURCING LEDGER & AUDIT TRAIL VERIFICATION
  // =========================================================================
  console.log('\nTEST 10: Event Sourcing & Audit Ledger Integrity...');

  const patientEvents = eventStore.getEventsByAggregate(patient.id);
  assert(patientEvents.length > 0, 'Domain events successfully captured in event store for patient aggregate');

  const auditLogs = localDb.getAuditLogs();
  const labAudits = auditLogs.filter(
    (l) =>
      l.action.includes('LAB') ||
      l.action.includes('CRITICAL') ||
      l.resourceType === 'LaboratoryOrder' ||
      l.resourceType === 'LaboratorySpecimen' ||
      l.resourceType === 'LaboratoryResult'
  );

  assert(
    labAudits.length >= 6,
    `Audit ledger captured ${labAudits.length} tamper-evident records across lab lifecycle`
  );

  const criticalAckAudit = labAudits.find((l) => l.action.includes('CRITICAL_RESULT_ACKNOWLEDGED'));
  assert(!!criticalAckAudit, 'Critical panic alert acknowledgment has distinct audit ledger entry');
  assert(
    criticalAckAudit?.facilityId === 'AMGH-001',
    'Audit record correctly maintains facility tenancy (AMGH-001)'
  );

  // Final Summary
  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V4 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure in Laboratory Workflow Suite:', err);
  process.exit(1);
});
