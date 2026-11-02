/**
 * Jano Health - Clinical Core V5: Radiology Workflow Test Suite
 * 
 * Verifies:
 * 1. Offline Deterministic Radiology Identifiers (RAD-ORD, RAD-STD, RAD-ACC with Modulo-36 Luhn-variant checksums)
 * 2. Radiology Order Requisition Pipeline & RBAC Boundaries (order placing, mandatory clinical indication)
 * 3. Study Scheduling & Offline-Safe Accession Generation
 * 4. Image Acquisition Lifecycle (Start Acquisition, Technologist Attribution, Series/Instances Completion)
 * 5. Diagnostic Interpretation & Preliminary Reporting
 * 6. Senior Radiologist Finalization, Cryptographic Signing & SHA-256 Tamper-Evident Integrity Sealing
 * 7. Clinical Safety Invariant: Imaging Findings & Reports NEVER silently generate diagnoses, treatments, or prescriptions
 * 8. Versioned Immutable Report Amendment with Historical Audit Lineage (v1 -> v2)
 * 9. Critical Radiology Finding Escalation & Mandatory Attested Clinician Acknowledgment
 * 10. Atomic Clinical Transactions, Event Sourcing & Audit Ledger Integration
 */

import {
  generateRadiologyOrderNumber,
  validateRadiologyOrderNumber,
  generateRadiologyStudyNumber,
  validateRadiologyStudyNumber,
  generateRadiologyAccessionNumber,
  validateRadiologyAccessionNumber,
  calculateRadiologyChecksum,
} from '../src/domain/radiologyIdentifiers';
import {
  radiologyWorkflowService,
  CreateRadiologyOrderParams,
  ScheduleRadiologyStudyParams,
  StartAcquisitionParams,
  CompleteStudyParams,
  DraftRadiologyReportParams,
  FinalizeRadiologyReportParams,
  AmendRadiologyReportParams,
  AcknowledgeCriticalFindingParams,
} from '../src/services/clinical/radiologyWorkflowService';
import { patientService, AuthenticatedPrincipal } from '../src/services/clinical/patientService';
import { localRepository } from '../src/services/storage/localRepository';
import { eventStore } from '../src/services/events/eventStore';
import { auditRepository } from '../src/services/audit/auditRepository';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { sha256, canonicalJson } from '../src/domain/eventIntegrity';

// Test Principals across clinical and radiology roles
const doctorKwame: ClinicalActorContext = {
  userId: 'usr_doc_kwame',
  userName: 'Dr. Kwame Antwi',
  userRole: 'physician',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-doc-01',
};

const radiologistMensah: ClinicalActorContext = {
  userId: 'usr_rad_mensah',
  userName: 'Dr. Anthony Mensah, Radiologist',
  userRole: 'radiologist',
  facilityId: 'AMGH-001',
  deviceId: 'workstation-rad-01',
};

const radTechnologistGrace: ClinicalActorContext = {
  userId: 'usr_rad_tech_grace',
  userName: 'Grace Osei, Radiologic Technologist',
  userRole: 'radiology_staff',
  facilityId: 'AMGH-001',
  deviceId: 'modal-xray-01',
};

const receptionistAkua: ClinicalActorContext = {
  userId: 'usr_rec_akua',
  userName: 'Akua Mansa',
  userRole: 'receptionist',
  facilityId: 'AMGH-001',
  deviceId: 'reception-desk-01',
};

// Test Suite Assertion Helpers
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ Passed: ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V5 (RADIOLOGY WORKFLOW TEST SUITE)');
  console.log('=============================================================');

  // Register a designated test patient
  const patientAdminPrincipal: AuthenticatedPrincipal = {
    id: doctorKwame.userId,
    fullName: doctorKwame.userName,
    role: doctorKwame.userRole as any,
    facilityId: doctorKwame.facilityId,
  };

  const patientResult = await patientService.registerPatient(
    patientAdminPrincipal,
    {
      givenName: 'Abena',
      familyName: 'Serwaa',
      sex: 'female',
      dateOfBirth: '1988-04-12',
      nationalId: 'GHA-88412948-1',
      phone: '+233244991122',
      villageTown: 'Amanfrom Sub-district',
      district: 'Adansi South',
      registrationFacilityId: 'AMGH-001',
    }
  );

  assert(patientResult.success && !!patientResult.patient, 'Test patient registered successfully for radiology workflow testing');
  const testPatientId = patientResult.patient!.id;

  // -------------------------------------------------------------
  // TEST 1: Deterministic Radiology Identifiers & Modulo-36 Checksums
  // -------------------------------------------------------------
  console.log('\nTEST 1: Radiology Identifiers & Modulo-36 Checksum Validation...');
  const testDate = new Date(2026, 8, 12, 10, 30, 0); // 2026-09-12
  const orderNum = generateRadiologyOrderNumber('AMGH-001', 'tablet-doc-01', testDate);
  assert(orderNum.startsWith('RAD-ORD-AMGH-20260912-'), `Order number conforms to canonical structure: ${orderNum}`);
  assert(validateRadiologyOrderNumber(orderNum), 'Order number validates cleanly with Modulo-36 Luhn checksum');

  // Introduce single-character transcription error
  const corruptedOrderNum = orderNum.slice(0, -2) + 'X' + orderNum.slice(-1);
  assert(!validateRadiologyOrderNumber(corruptedOrderNum), 'Modulo-36 checksum intercepts transcription typo in Order Number');

  const studyNum = generateRadiologyStudyNumber('AMGH-001', 'modal-xray-01', testDate);
  assert(studyNum.startsWith('RAD-STU-AMGH-20260912-'), `Study number conforms to canonical structure: ${studyNum}`);
  assert(validateRadiologyStudyNumber(studyNum), 'Study number validates cleanly with Modulo-36 Luhn checksum');

  const accessionNum = generateRadiologyAccessionNumber('AMGH-001', 'modal-xray-01', testDate);
  assert(accessionNum.startsWith('RAD-ACC-AMGH-20260912-'), `Accession number conforms to canonical structure: ${accessionNum}`);
  assert(validateRadiologyAccessionNumber(accessionNum), 'Accession number validates cleanly with Modulo-36 Luhn checksum');

  // Multi-device uniqueness
  const accessionFromOtherDevice = generateRadiologyAccessionNumber('AMGH-001', 'modal-pocus-02', testDate);
  assert(accessionNum !== accessionFromOtherDevice, 'Accession numbers generated on distinct devices are globally unique without server coordination');

  // -------------------------------------------------------------
  // TEST 2: Radiology Order Requisition & RBAC Boundaries
  // -------------------------------------------------------------
  console.log('\nTEST 2: Radiology Order Requisition & RBAC Boundaries...');
  
  const radOrderParams: CreateRadiologyOrderParams = {
    patientId: testPatientId,
    modality: 'XR',
    bodySite: 'Chest',
    laterality: 'BILATERAL',
    priority: 'urgent',
    clinicalIndication: 'Persistent productive cough for 3 weeks, hemoptysis, night sweats. Rule out pulmonary tuberculosis.',
    clinicalQuestion: 'Cavitation or apical infiltration present?',
    requestedStudyType: 'Chest X-Ray PA and Lateral',
    contrastRequested: false,
    notes: 'Patient can stand upright for PA projection.',
  };

  const createdOrder = await radiologyWorkflowService.orderRadiology(radOrderParams, doctorKwame);
  assert(!!createdOrder.id, 'Radiology order created successfully with aggregate ID');
  assert(createdOrder.status === 'PLACED', 'Initial order status is strictly PLACED');
  assert(createdOrder.orderNumber!.startsWith('RAD-ORD-'), `Order assigned valid checksummed order number: ${createdOrder.orderNumber}`);
  assert(createdOrder.priority === 'urgent', 'Urgent priority preserved');
  assert(createdOrder.patientId === testPatientId, 'Order correctly bound to patient ID');
  assert(createdOrder.orderingClinicianId === doctorKwame.userId, 'Ordering clinician ID bound to Kwame');

  // RBAC Boundary: Registration clerk cannot place radiology requisitions
  let unauthorizedOrderCaught = false;
  try {
    await radiologyWorkflowService.orderRadiology(radOrderParams, receptionistAkua);
  } catch (err: any) {
    unauthorizedOrderCaught = true;
    assert(err.message.includes('Security Exception') || err.message.includes('not authorized'), 'RBAC: Receptionist role lacking radiology:order capability is rejected fail-closed');
  }
  assert(unauthorizedOrderCaught, 'Unauthorized radiology requisition was blocked');

  // Clinical Indication Validation: Missing indication is rejected
  let missingIndicationCaught = false;
  try {
    await radiologyWorkflowService.orderRadiology(
      {
        patientId: testPatientId,
        modality: 'XR',
        bodySite: 'Chest',
      } as any,
      doctorKwame
    );
  } catch (err: any) {
    missingIndicationCaught = true;
    assert(err.message.includes('clinical indication') || err.message.includes('justification'), 'Validation: Radiology order without clinical indication is rejected fail-closed');
  }
  assert(missingIndicationCaught, 'Validation caught missing indication');

  // Order Cancellation Protocol
  const orderToCancel = await radiologyWorkflowService.orderRadiology(
    {
      patientId: testPatientId,
      modality: 'ULTRASOUND',
      bodySite: 'Abdomen',
      clinicalIndication: 'Right upper quadrant pain',
    },
    doctorKwame
  );
  assert(orderToCancel.status === 'PLACED', 'Auxiliary order placed for cancellation test');

  const cancelledOrder = await radiologyWorkflowService.cancelRadiologyOrder(
    {
      orderId: orderToCancel.id,
      cancellationReason: 'Patient self-referred to regional hospital for emergency surgical evaluation',
    },
    doctorKwame
  );
  assert(cancelledOrder.status === 'CANCELLED', 'Order successfully transitioned to CANCELLED');
  assert(cancelledOrder.notes!.includes('Patient self-referred'), 'Structured cancellation reason persisted in order notes');

  // Cancellation requires mandatory reason
  let emptyCancelReasonCaught = false;
  try {
    await radiologyWorkflowService.cancelRadiologyOrder({ orderId: createdOrder.id, cancellationReason: ' ' }, doctorKwame);
  } catch (err: any) {
    emptyCancelReasonCaught = true;
    assert(err.message.includes('reason is mandatory') || err.message.includes('required'), 'Integrity: Order cancellation without explicit justification is rejected fail-closed');
  }
  assert(emptyCancelReasonCaught, 'Validation caught empty cancellation reason');

  // Cancelled order cannot be scheduled
  let scheduleCancelledCaught = false;
  try {
    await radiologyWorkflowService.scheduleRadiologyStudy({ orderId: cancelledOrder.id }, radTechnologistGrace);
  } catch (err: any) {
    scheduleCancelledCaught = true;
    assert(err.message.includes('cancelled'), 'Safety: Scheduling an imaging study for a cancelled order is rejected');
  }
  assert(scheduleCancelledCaught, 'Cancelled order cannot be scheduled');

  // -------------------------------------------------------------
  // TEST 3: Study Scheduling & Accession Generation
  // -------------------------------------------------------------
  console.log('\nTEST 3: Study Scheduling & Accession Generation...');

  const scheduleParams: ScheduleRadiologyStudyParams = {
    orderId: createdOrder.id,
    studyDescription: 'Chest 2-View (PA and Lateral)',
    scheduledTime: new Date().toISOString(),
  };

  const scheduledStudy = await radiologyWorkflowService.scheduleRadiologyStudy(scheduleParams, radTechnologistGrace);
  assert(!!scheduledStudy.id, 'Radiology study created with aggregate ID');
  assert(scheduledStudy.status === 'SCHEDULED', 'Study initial status is SCHEDULED');
  assert(scheduledStudy.studyNumber.startsWith('RAD-STU-'), `Study number assigned: ${scheduledStudy.studyNumber}`);
  assert(scheduledStudy.accessionNumber.startsWith('RAD-ACC-'), `Accession barcode assigned: ${scheduledStudy.accessionNumber}`);
  assert(scheduledStudy.orderId === createdOrder.id, 'Study bound to parent order ID');
  assert(scheduledStudy.patientId === testPatientId, 'Study bound to patient ID');

  // Check that parent order status transitioned to SCHEDULED
  const reloadedOrder = await localRepository.getRadiologyOrder(createdOrder.id);
  assert(reloadedOrder?.status === 'SCHEDULED', 'Parent order automatically updated to SCHEDULED status');

  // -------------------------------------------------------------
  // TEST 4: Image Acquisition & Study Completion
  // -------------------------------------------------------------
  console.log('\nTEST 4: Image Acquisition & Study Completion...');

  // Start Acquisition
  const inProgressStudy = await radiologyWorkflowService.startAcquisition(
    {
      studyId: scheduledStudy.id,
      technologistId: radTechnologistGrace.userId,
      technologistName: radTechnologistGrace.userName,
    },
    radTechnologistGrace
  );
  assert(inProgressStudy.status === 'IN_PROGRESS', 'Study status transitioned to IN_PROGRESS');
  assert(!!inProgressStudy.startedAt, 'Acquisition start timestamp recorded');
  assert(inProgressStudy.performingTechnologistId === radTechnologistGrace.userId, 'Performing technologist bound to Grace');

  // Complete Study with Series and Instances
  const seriesPayload = [
    {
      id: 'ser-01',
      studyId: scheduledStudy.id,
      seriesNumber: 1,
      modality: 'XR' as const,
      seriesDescription: 'Chest PA Upright',
      bodySite: 'Chest',
      instanceCount: 1,
      instances: [
        {
          id: 'inst-01',
          seriesId: 'ser-01',
          instanceNumber: 1,
          sopClassUid: '1.2.840.10008.5.1.4.1.1.1',
          sopInstanceUid: '1.2.840.113619.2.1.2026.0912.001',
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ser-02',
      studyId: scheduledStudy.id,
      seriesNumber: 2,
      modality: 'XR' as const,
      seriesDescription: 'Chest Lateral Left',
      bodySite: 'Chest',
      instanceCount: 1,
      instances: [
        {
          id: 'inst-02',
          seriesId: 'ser-02',
          instanceNumber: 1,
          sopClassUid: '1.2.840.10008.5.1.4.1.1.1',
          sopInstanceUid: '1.2.840.113619.2.1.2026.0912.002',
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ];

  const completedStudy = await radiologyWorkflowService.completeStudy(
    {
      studyId: scheduledStudy.id,
      series: seriesPayload,
    },
    radTechnologistGrace
  );
  assert(completedStudy.status === 'COMPLETED', 'Study status transitioned to COMPLETED');
  assert(!!completedStudy.completedAt, 'Study completion timestamp recorded');
  assert(completedStudy.seriesCount === 2, 'Series count matches 2 series');
  assert(completedStudy.instanceCount === 2, 'Total instances count matches 2 images');

  // -------------------------------------------------------------
  // TEST 5: Diagnostic Interpretation & Preliminary Reporting
  // -------------------------------------------------------------
  console.log('\nTEST 5: Diagnostic Interpretation & Preliminary Reporting...');

  const draftParams: DraftRadiologyReportParams = {
    studyId: completedStudy.id,
    orderId: createdOrder.id,
    patientId: testPatientId,
    findings: 'Right upper lobe dense consolidation with central radiolucency suspicious for cavitary lesion. Bilateral reticulonodular opacities in mid-zones. Heart size within normal limits. Trachea is midline.',
    impression: 'Right upper lobe cavitary lesion with surrounding parenchymal infiltrate. Highly concerning for active pulmonary tuberculosis. Correlation with sputum AFB microscopy / GeneXpert recommended.',
    technique: 'PA and lateral chest radiography performed in upright position.',
    recommendations: 'Isolate patient in airborne infection isolation room (AIIR). Urgent sputum GeneXpert MTB/RIF.',
    criticalFinding: true,
  };

  const draftedReport = await radiologyWorkflowService.draftReport(draftParams, radiologistMensah);
  assert(!!draftedReport.id, 'Draft report created with aggregate ID');
  assert(draftedReport.status === 'DRAFT', 'Initial report status is DRAFT');
  assert(draftedReport.radiologistId === radiologistMensah.userId, 'Report bound to interpreting radiologist ID');
  assert(draftedReport.criticalFinding === true, 'Critical finding flag preserved in draft');

  // -------------------------------------------------------------
  // TEST 6: Senior Radiologist Finalization & SHA-256 Tamper-Evidence
  // -------------------------------------------------------------
  console.log('\nTEST 6: Senior Radiologist Finalization & SHA-256 Tamper-Evidence...');

  const finalizeParams: FinalizeRadiologyReportParams = {
    reportId: draftedReport.id,
    studyId: completedStudy.id,
    orderId: createdOrder.id,
    patientId: testPatientId,
    findings: draftedReport.findings,
    impression: draftedReport.impression,
    technique: draftedReport.technique,
    recommendations: draftedReport.recommendations,
    criticalFinding: true,
    criticalFindingDescription: 'Active cavitary lung lesion highly suspicious for tuberculosis with airborne transmission risk.',
  };

  const { report: finalizedReport, criticalFinding } = await radiologyWorkflowService.finalizeReport(finalizeParams, radiologistMensah);
  assert(finalizedReport.status === 'FINAL', 'Report transitioned to FINAL status');
  assert(!!finalizedReport.signedAt, 'Digital signature timestamp recorded');
  assert(!!finalizedReport.integrityHash, 'Report sealed with SHA-256 integrity hash');
  assert(finalizedReport.integrityHash!.length === 64, `Integrity hash is valid 64-character hex string: ${finalizedReport.integrityHash}`);
  assert(!!criticalFinding, 'Critical finding record generated upon finalizing critical report');
  assert(criticalFinding?.acknowledged === false, 'Critical finding is initially unacknowledged');

  // Verification of SHA-256 integrity seal
  const payloadToVerify = {
    reportId: finalizedReport.id,
    studyId: finalizedReport.studyId,
    orderId: finalizedReport.orderId,
    patientId: finalizedReport.patientId,
    radiologistId: radiologistMensah.userId,
    findings: finalizedReport.findings.trim(),
    impression: finalizedReport.impression.trim(),
    criticalFinding: true,
    signedAt: finalizedReport.signedAt,
  };
  const expectedHash = sha256(canonicalJson(payloadToVerify));
  assert(finalizedReport.integrityHash === expectedHash, 'Cryptographic seal matches canonical SHA-256 hash calculation');

  // Dual-write backwards compatibility: check radiologyResults
  const radResults = await localRepository.getRadiologyResults(testPatientId, createdOrder.id);
  assert(radResults.length > 0, 'Dual-write to radiologyResults persisted for backward compatibility');
  assert(radResults[0].impression === finalizedReport.impression, 'Dual-write impression matches finalized report');

  // -------------------------------------------------------------
  // TEST 7: Clinical Safety Invariant (Imaging Evidence ≠ Diagnosis)
  // -------------------------------------------------------------
  console.log('\nTEST 7: Clinical Safety Invariant (Imaging Evidence ≠ Diagnosis)...');

  const patientDiagnoses = await localRepository.getDiagnoses(testPatientId);
  const patientProblems = await localRepository.getProblems(testPatientId);
  assert(
    patientDiagnoses.length === 0,
    'Clinical Safety Mandate: No diagnoses were silently or automatically generated for the patient from imaging impressions'
  );
  assert(
    patientProblems.length === 0,
    'Clinical Safety Mandate: No patient problems were automatically committed without attested physician evaluation'
  );

  // -------------------------------------------------------------
  // TEST 8: Versioned Immutable Report Amendment Protocol
  // -------------------------------------------------------------
  console.log('\nTEST 8: Versioned Immutable Report Amendment Protocol...');

  const amendParams: AmendRadiologyReportParams = {
    reportId: finalizedReport.id,
    newFindings: finalizedReport.findings + ' Addendum: Comparison with remote film from 2024 reveals cavitation is newly developed.',
    newImpression: finalizedReport.impression + ' Confirmed new development compared to prior remote imaging.',
    amendmentReason: 'Secondary review after accessing prior imaging records from external archive.',
    newCriticalFinding: true,
  };

  const amendedReport = await radiologyWorkflowService.amendReport(amendParams, radiologistMensah);
  assert(amendedReport.status === 'AMENDED', 'Report status transitioned to AMENDED');
  assert(amendedReport.version === (finalizedReport.version || 1) + 1, 'Report version incremented upon formal amendment');
  assert(amendedReport.amendmentHistory?.length === 1, 'Amendment history contains 1 immutable lineage record');
  assert(amendedReport.amendmentHistory![0].reason === amendParams.amendmentReason, 'Amendment reason accurately preserved in historical lineage');
  assert(amendedReport.amendmentHistory![0].previousFindings === finalizedReport.findings, 'Lineage preserves previous observational findings');
  assert(amendedReport.integrityHash !== finalizedReport.integrityHash, 'Amended report receives fresh SHA-256 cryptographic seal');

  // Amendment requires mandatory clinical reason
  let emptyAmendReasonCaught = false;
  try {
    await radiologyWorkflowService.amendReport(
      {
        reportId: finalizedReport.id,
        newFindings: 'Some changes',
        newImpression: 'Some impression',
        amendmentReason: ' ',
      },
      radiologistMensah
    );
  } catch (err: any) {
    emptyAmendReasonCaught = true;
    assert(err.message.includes('reason is mandatory') || err.message.includes('compliance'), 'Integrity Mandate: Report amendment without explicit justification is rejected fail-closed');
  }
  assert(emptyAmendReasonCaught, 'Validation caught empty amendment reason');

  // -------------------------------------------------------------
  // TEST 9: Critical Radiology Finding Escalation & Attested Acknowledgment
  // -------------------------------------------------------------
  console.log('\nTEST 9: Critical Radiology Finding Escalation & Attested Acknowledgment...');

  const unacknowledgedFindings = await radiologyWorkflowService.getUnacknowledgedCriticalFindings('AMGH-001');
  assert(unacknowledgedFindings.length > 0, 'Critical finding appears in facility unacknowledged alert queue');
  assert(unacknowledgedFindings.some((f) => f.id === criticalFinding!.id), 'Current cavitary TB critical finding is present in queue');

  const acknowledgeParams: AcknowledgeCriticalFindingParams = {
    findingId: criticalFinding!.id,
    actionTaken: 'Patient moved to airborne isolation room 4. Sputum GeneXpert ordered stat. Initiated contact tracing.',
    communicationMethod: 'DIRECT_PHONE_CALL',
    notes: 'Dr. Kwame Antwi notified directly by Radiologist Mensah at 11:15 AM.',
  };

  const acknowledgedFinding = await radiologyWorkflowService.acknowledgeCriticalFinding(acknowledgeParams, doctorKwame);
  assert(acknowledgedFinding.acknowledged === true, 'Critical finding marked as acknowledged');
  assert(!!acknowledgedFinding.acknowledgedAt, 'Acknowledgment timestamp permanently recorded');
  assert(acknowledgedFinding.acknowledgedById === doctorKwame.userId, 'Acknowledged bound to Dr. Kwame ID');
  assert(acknowledgedFinding.actionTaken.includes('airborne isolation room 4'), 'Emergency clinical action taken persisted');

  // Cannot acknowledge without documenting action taken
  let emptyActionTakenCaught = false;
  try {
    const freshCritFinding = await (radiologyWorkflowService as any).createCriticalFindingRecord(
      {
        reportId: finalizedReport.id,
        studyId: completedStudy.id,
        orderId: createdOrder.id,
        patientId: testPatientId,
        facilityId: 'AMGH-001',
        description: 'Tension Pneumothorax',
      },
      doctorKwame
    );
    await radiologyWorkflowService.acknowledgeCriticalFinding(
      {
        findingId: freshCritFinding.id,
        actionTaken: '   ',
      },
      doctorKwame
    );
  } catch (err: any) {
    emptyActionTakenCaught = true;
    assert(err.message.includes('action taken is mandatory') || err.message.includes('required'), 'Safety Mandate: Critical finding acknowledgment without documented clinical action is rejected');
  }
  assert(emptyActionTakenCaught, 'Validation caught empty action taken on critical acknowledgment');

  // -------------------------------------------------------------
  // TEST 10: Event Sourcing & Audit Ledger Integrity
  // -------------------------------------------------------------
  console.log('\nTEST 10: Event Sourcing & Audit Ledger Integrity...');

  const patientEvents = await eventStore.getEventsForAggregate('RadiologyOrder', createdOrder.id);
  assert(patientEvents.length > 0, 'Domain events successfully captured in event store for RadiologyOrder aggregate');
  assert(patientEvents.some((e) => e.eventType === 'RADIOLOGY_ORDER_CREATED'), 'RADIOLOGY_ORDER_CREATED event present in store');

  const studyEvents = await eventStore.getEventsForAggregate('RadiologyStudy', scheduledStudy.id);
  assert(studyEvents.some((e) => e.eventType === 'RADIOLOGY_STUDY_CREATED'), 'RADIOLOGY_STUDY_CREATED event present in store');
  assert(studyEvents.some((e) => e.eventType === 'RADIOLOGY_STUDY_STARTED'), 'RADIOLOGY_STUDY_STARTED event present in store');
  assert(studyEvents.some((e) => e.eventType === 'RADIOLOGY_STUDY_COMPLETED'), 'RADIOLOGY_STUDY_COMPLETED event present in store');

  const reportEvents = await eventStore.getEventsForAggregate('RadiologyReport', finalizedReport.id);
  assert(reportEvents.some((e) => e.eventType === 'RADIOLOGY_REPORT_FINALIZED'), 'RADIOLOGY_REPORT_FINALIZED event present in store');
  assert(reportEvents.some((e) => e.eventType === 'RADIOLOGY_REPORT_AMENDED'), 'RADIOLOGY_REPORT_AMENDED event present in store');

  const audits = await auditRepository.query({ resourceId: finalizedReport.id });
  assert(audits.length > 0, 'Tamper-evident audit trail entries recorded for finalized and amended report');
  assert(audits.some((a) => a.action === 'RADIOLOGY_REPORT_FINALIZED'), 'Audit record exists for RADIOLOGY_REPORT_FINALIZED');
  assert(audits.some((a) => a.action === 'RADIOLOGY_REPORT_AMENDED'), 'Audit record exists for RADIOLOGY_REPORT_AMENDED');

  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V5 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('=============================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed with unhandled error:', err);
  process.exit(1);
});
