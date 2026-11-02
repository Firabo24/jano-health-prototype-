/**
 * Jano Health - Clinical Core V6: Medication Order, Prescription & Safety Test Suite
 * 
 * Verifies:
 * 1. Offline Deterministic Medication Identifiers (MED-ORD- and RX- with Luhn-variant Modulo-36 checksums)
 * 2. Strict Prescribing Guard & Non-AI Prescriber Enforcement
 * 3. Multi-Factor Medication Safety Service (Allergies, Interactions, Duplicates, Fallbacks)
 * 4. Tamper-Evident Digital Sealing & Integrity Verification (SHA-256 canonical hashing)
 * 5. End-to-End Lifecycle: Order Requisition -> Prescription Issuance -> Pharmacy Dispense
 * 6. Order Lifecycle Actions: Hold and Discontinue with documented clinical rationales
 * 7. Versioned Prescription Amendment Pipeline & Audit Lineage
 * 8. Reconciled Longitudinal Medication History View
 * 9. Atomic Transactions, Domain Events & Facility Tenancy Isolation
 */

import {
  generateMedicationOrderNumber,
  validateMedicationOrderNumber,
  generatePrescriptionNumber,
  validatePrescriptionNumber,
  calculateMedicationChecksum,
} from '../src/domain/medicationIdentifiers';
import {
  medicationService,
  CreateMedicationOrderDTO,
} from '../src/services/clinical/medicationService';
import { medicationSafetyService } from '../src/services/clinical/medicationSafetyService';
import { medicationTerminologyService } from '../src/services/clinical/medicationTerminologyService';
import { patientService } from '../src/services/clinical/patientService';
import { localRepository } from '../src/services/storage/localRepository';
import { localDb } from '../src/services/storage/localDatabase';
import { eventStore } from '../src/services/events/eventStore';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { verifyPrescriptionSeal } from '../src/services/clinical/medicationService';

// Test Actors
const doctorKwame: ClinicalActorContext = {
  userId: 'usr_doc_kwame',
  userName: 'Dr. Kwame Antwi',
  userRole: 'physician',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-doc-01',
};

const nurseGrace: ClinicalActorContext = {
  userId: 'usr_nur_grace',
  userName: 'Nurse Grace Darko',
  userRole: 'nurse',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-ward-01',
};

const pharmacistAma: ClinicalActorContext = {
  userId: 'usr_pharm_ama',
  userName: 'Ama Serwaa, PharmD',
  userRole: 'pharmacist',
  facilityId: 'AMGH-001',
  deviceId: 'pharmacy-dispensary-01',
};

const aiAgent: ClinicalActorContext = {
  userId: 'jano-ai-assistant',
  userName: 'Jano AI Clinical Copilot',
  userRole: 'ai_assistant' as any,
  facilityId: 'AMGH-001',
  deviceId: 'ai-engine-local',
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V6: MEDICATION & SAFETY TEST SUITE');
  console.log('=============================================================');

  // Initialize storage repository
  await localRepository.ensureInitialized();

  // Create a clean test patient for medication clinical trials
  const regResult = await patientService.registerPatient(
    {
      id: doctorKwame.userId,
      fullName: doctorKwame.userName,
      role: doctorKwame.userRole as any,
      facilityId: doctorKwame.facilityId,
    },
    {
      givenName: 'Kofi',
      familyName: 'Agyemang',
      dateOfBirth: '1985-06-15',
      sex: 'male',
      villageTown: 'Ejisu',
      district: 'Ejisu-Juaben',
      registrationFacilityId: 'AMGH-001',
      allergiesSummary: ['Penicillin'],
    }
  );

  assert(regResult.success && !!regResult.patient && !!regResult.patient.id, 'Test patient registered successfully');
  const patient = regResult.patient!;

  // Persist structured allergy in database
  await localDb.saveAllergy({
    id: 'alg_pen_kofi',
    patientId: patient.id,
    allergen: 'Penicillin',
    type: 'drug',
    severity: 'severe',
    reaction: 'Anaphylaxis and generalized urticaria',
    diagnosedDate: new Date().toISOString(),
    active: true,
  });

  // =========================================================================
  // TEST 1: OFFLINE DETERMINISTIC IDENTIFIERS & MODULO-36 CHECKSUMS
  // =========================================================================
  console.log('\nTEST 1: Offline Deterministic Medication Identifiers...');

  const testDate = new Date('2026-09-13T10:00:00Z');
  const orderNum1 = generateMedicationOrderNumber('AMGH-001', 'DEV01', testDate);
  assert(orderNum1.startsWith('MED-ORD-AMGH-20260913-'), 'Order number matches standardized format');
  assert(validateMedicationOrderNumber(orderNum1), 'Order number validates against Modulo-36 Luhn-variant checksum');

  const rxNum1 = generatePrescriptionNumber('AMGH-001', 'DEV01', testDate);
  assert(rxNum1.startsWith('RX-AMGH-20260913-'), 'Prescription number matches standardized format');
  assert(validatePrescriptionNumber(rxNum1), 'Prescription number validates against Modulo-36 checksum');

  // Checksum tamper detection
  const tamperedOrder = orderNum1.slice(0, -1) + (orderNum1.slice(-1) === 'X' ? 'Y' : 'X');
  assert(!validateMedicationOrderNumber(tamperedOrder), 'Tampered order number correctly fails checksum validation');

  // =========================================================================
  // TEST 2: STRICT PRESCRIBING GUARD & NON-AI AGENT POLICY
  // =========================================================================
  console.log('\nTEST 2: Strict Prescribing Guard & Non-AI Enforcement...');

  const amoxDef = medicationTerminologyService.getConcept('WHO-EML-AMOX-500-CAP');
  const coartemDef = medicationTerminologyService.getConcept('WHO-EML-AL-20-120');
  assert(!!amoxDef && !!coartemDef, 'Formulary concepts retrieved successfully');

  // Attempt 1: AI Prescriber Guard
  let aiBlocked = false;
  try {
    await medicationService.createOrderAndIssuePrescription(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        medicationDefinitionId: coartemDef!.id,
        route: 'oral',
        dose: '4 tablets',
        doseUnit: 'tablets',
        frequency: 'BID',
        durationValue: 3,
        quantity: 24,
        indication: 'Uncomplicated falciparum malaria',
      },
      aiAgent
    );
  } catch (err: any) {
    if (err.message.includes('strictly prohibited') || err.message.includes('AI')) {
      aiBlocked = true;
    }
  }
  assert(aiBlocked, 'Safety Mandate: AI agent is strictly blocked from creating or issuing prescriptions');

  // Attempt 2: Unauthorized Nurse Prescribing Guard
  let nurseBlocked = false;
  try {
    await medicationService.createOrderAndIssuePrescription(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        medicationDefinitionId: coartemDef!.id,
        route: 'oral',
        dose: '4 tablets',
        doseUnit: 'tablets',
        frequency: 'BID',
        durationValue: 3,
        quantity: 24,
        indication: 'Uncomplicated falciparum malaria',
      },
      nurseGrace
    );
  } catch (err: any) {
    nurseBlocked = true;
  }
  assert(nurseBlocked, 'RBAC Mandate: Nursing roles cannot independently prescribe medication regimens');

  // =========================================================================
  // TEST 3: MULTI-FACTOR CLINICAL SAFETY SCREENING (ALLERGIES & CONTRAINDICATIONS)
  // =========================================================================
  console.log('\nTEST 3: Multi-Factor Clinical Safety Screening...');

  // Patient has documented Penicillin allergy -> Test screening Amoxicillin
  const allergyScreen = await medicationSafetyService.evaluateSafety({
    patient: {
      id: patient.id,
      allergies: ['Penicillin', 'Beta-lactams'],
      activeDiagnoses: ['Bronchopneumonia'],
    },
    candidateMedication: amoxDef!,
    candidateDose: '500',
    candidateDoseUnit: 'mg',
    candidateRoute: 'oral',
    candidateFrequency: 'TID',
    candidateDurationDays: 7,
    candidateQuantity: 21,
    activeMedications: [],
  });

  assert(allergyScreen.overallState === 'CONTRAINDICATED', 'Safety Check: Prescribing Amoxicillin to Penicillin-allergic patient is flagged CONTRAINDICATED');
  assert(allergyScreen.requiresAcknowledgement === true, 'Contraindicated order flags mandatory clinician intervention');

  const allergyFinding = allergyScreen.checks.find((c) => c.checkType === 'ALLERGY');
  assert(!!allergyFinding && allergyFinding.status === 'CONTRAINDICATED', 'Allergy check explicitly identifies beta-lactam / penicillin cross-reactivity');
  assert(
    allergyFinding?.source === 'WHO-MODEL-EML-24TH-2025-SYNTHETIC-RULES' ||
    allergyFinding?.source === 'WHO-EML-SAFETY-RULES-2026',
    'Safety check includes authoritative knowledge source metadata'
  );
  assert(allergyFinding?.sourceOrganization === 'WHO', 'Safety check includes WHO source organization');
  assert(allergyFinding?.edition === '24th', 'Safety check identifies WHO 24th Edition');
  assert(allergyFinding?.publicationYear === 2025, 'Safety check identifies 2025 publication year');
  assert(allergyFinding?.publishedAt === '2025-09-05', 'Safety check identifies 2025-09-05 release date');
  assert(allergyFinding?.ruleClassification === 'SYNTHETIC_DEMO', 'Safety check identifies synthetic demo rule classification');

  // Test Attempt to issue CONTRAINDICATED order without acknowledgement -> Must fail
  let unacknowledgedBlocked = false;
  try {
    await medicationService.createOrderAndIssuePrescription(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        medicationDefinitionId: amoxDef!.id,
        route: 'oral',
        dose: '500',
        doseUnit: 'mg',
        frequency: 'TID',
        durationValue: 7,
        quantity: 21,
        indication: 'Bacterial pneumonia',
      },
      doctorKwame
    );
  } catch (err: any) {
    unacknowledgedBlocked = true;
  }
  assert(unacknowledgedBlocked, 'Safety Mandate: System prevents issuance of contraindicated order without documented justification');

  // =========================================================================
  // TEST 4: SUCCESSFUL ORDER & DIGITAL PRESCRIPTION ISSUANCE
  // =========================================================================
  console.log('\nTEST 4: Successful Order Requisition & Tamper-Evident Digital Seal...');

  // Prescribe Coartem (patient has no antimalarial allergies)
  const orderResult = await medicationService.createOrderAndIssuePrescription(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      medicationDefinitionId: coartemDef!.id,
      route: 'oral',
      dose: '4 tablets',
      doseUnit: 'tablets',
      frequency: 'BID with fatty food',
      durationValue: 3,
      quantity: 24,
      indication: 'Uncomplicated falciparum malaria',
      instructions: 'Take 4 tablets initially, 4 tablets after 8 hours, then 4 tablets twice daily for 2 days.',
    },
    doctorKwame,
    {
      validityDays: 30,
      refills: 0,
    }
  );

  assert(!!orderResult.order && !!orderResult.prescription, 'Medication order and prescription successfully created');
  assert(orderResult.order.status === 'ACTIVE', 'Medication order initial status is ACTIVE');
  assert(orderResult.prescription.status === 'ISSUED', 'Prescription initial status is ISSUED');
  assert(orderResult.prescription.signatureHash.length === 64, 'Prescription contains 64-character SHA-256 digital signature seal');

  // Verify digital seal
  const isSealValid = verifyPrescriptionSeal(orderResult.prescription);
  assert(isSealValid, 'Cryptographic verification confirms prescription SHA-256 digital seal is intact');

  // Verify that modifying prescription data invalidates the seal
  const tamperedPrescription = { ...orderResult.prescription, quantity: 999 };
  const isTamperedSealValid = verifyPrescriptionSeal(tamperedPrescription);
  assert(!isTamperedSealValid, 'Tamper Detection: Modified prescription quantity invalidates digital seal');

  // =========================================================================
  // TEST 5: DRUG-DRUG INTERACTION & DUPLICATE THERAPY DETECTION
  // =========================================================================
  console.log('\nTEST 5: Drug-Drug Interaction & Duplicate Therapy Detection...');

  // Patient now has active Coartem. Attempt to prescribe second antimalarial (duplicate therapy)
  const duplicateScreen = await medicationSafetyService.evaluateSafety({
    patient: {
      id: patient.id,
      allergies: [],
      activeDiagnoses: ['Malaria'],
    },
    candidateMedication: coartemDef!,
    candidateDose: '4 tablets',
    candidateDoseUnit: 'tablets',
    candidateRoute: 'oral',
    candidateFrequency: 'BID',
    candidateDurationDays: 3,
    candidateQuantity: 24,
    activeMedications: [
      {
        definitionId: coartemDef!.id,
        genericName: coartemDef!.genericName,
        active: true,
      },
    ],
  });

  const dupCheck = duplicateScreen.checks.find((c) => c.checkType === 'DUPLICATE_THERAPY');
  assert(!!dupCheck && (dupCheck.status === 'WARNING' || dupCheck.status === 'HIGH_RISK'), 'Safety Check: Duplicate active antimalarial therapy detected');

  // Drug-Drug Interaction: Warfarin + Ibuprofen (NSAID)
  const warfarinDef = medicationTerminologyService.getConcept('WHO-EML-WARFARIN-5');
  const ibuprofenDef = medicationTerminologyService.getConcept('WHO-EML-IBUPROFEN-400');
  assert(!!warfarinDef && !!ibuprofenDef, 'Warfarin and Ibuprofen formulary concepts available');

  const interactionScreen = await medicationSafetyService.evaluateSafety({
    patient: {
      id: patient.id,
      allergies: [],
      activeDiagnoses: ['Deep Vein Thrombosis'],
    },
    candidateMedication: ibuprofenDef!,
    candidateDose: '400',
    candidateDoseUnit: 'mg',
    candidateRoute: 'oral',
    candidateFrequency: 'TID',
    candidateDurationDays: 5,
    candidateQuantity: 15,
    activeMedications: [
      {
        definitionId: warfarinDef!.id,
        genericName: warfarinDef!.genericName,
        active: true,
      },
    ],
  });

  const ddiCheck = interactionScreen.checks.find((c) => c.checkType === 'DRUG_INTERACTION');
  assert(!!ddiCheck && ddiCheck.status === 'HIGH_RISK', 'Safety Check: Concurrent Warfarin + NSAID detected as HIGH_RISK major bleeding interaction');
  assert(ddiCheck?.recommendation?.includes('gastrointestinal bleeding') || ddiCheck?.message?.includes('bleeding'), 'Interaction finding contains specific clinical bleeding advisory');

  // Knowledge Unavailable Fallback test
  const unknownCompound = medicationTerminologyService.getConcept('SYNTH-UNKNOWN-999');
  assert(!!unknownCompound, 'Unknown unclassified compound concept loaded');

  const fallbackScreen = await medicationSafetyService.evaluateSafety({
    patient: {
      id: patient.id,
      allergies: [],
      activeDiagnoses: ['Investigational Protocol'],
    },
    candidateMedication: unknownCompound!,
    candidateDose: '50',
    candidateDoseUnit: 'mg',
    candidateRoute: 'oral',
    candidateFrequency: 'Once daily',
    candidateDurationDays: 14,
    candidateQuantity: 14,
    activeMedications: [],
  });

  const knowledgeCheck = fallbackScreen.checks.find((c) => c.status === 'KNOWLEDGE_UNAVAILABLE');
  assert(!!knowledgeCheck, 'Knowledge Fallback: Missing interaction rules explicitly yields KNOWLEDGE_UNAVAILABLE');
  assert(knowledgeCheck?.source.includes('KNOWLEDGE_UNAVAILABLE') || fallbackScreen.overallState === 'KNOWLEDGE_UNAVAILABLE', 'Explicit provenance maintained when interaction knowledge is unavailable');

  // =========================================================================
  // TEST 6: PHARMACY DISPENSE WORKFLOW & ARCHITECTURAL HANDOFF
  // =========================================================================
  console.log('\nTEST 6: Pharmacy Review Handoff & Dispense Aggregate...');

  // Step 6a: Pharmacist reviews and approves the issued prescription (V6 -> V7 handoff)
  const reviewedRx = await medicationService.reviewPrescription(
    orderResult.prescription.id,
    'APPROVED',
    'Clinical review clear: dose, route, and duration validated against WHO 24th EML regimen guidelines.',
    pharmacistAma
  );
  assert(reviewedRx.pharmacyReviewStatus === 'APPROVED', 'Pharmacy Review: Pharmacist successfully verified issued prescription');
  assert(!!reviewedRx.pharmacyReviewedAt, 'Pharmacy Review: Review timestamp recorded');

  // Step 6b: Pharmacist dispenses the Coartem prescription
  const dispenseRecord = await medicationService.dispensePrescription(
    {
      prescriptionId: orderResult.prescription.id,
      quantityDispensed: 24,
      batchNumber: 'COA-2026-B991',
      notes: 'Dispensed original manufacturer blister pack. Patient counseled on fatty meal co-administration.',
    },
    pharmacistAma
  );

  assert(!!dispenseRecord && dispenseRecord.status === 'DISPENSED', 'Pharmacist successfully recorded dispense transaction');
  assert(dispenseRecord.batchNumber === 'COA-2026-B991', 'Dispense record captures manufacturer batch attribution');

  // Step 6c: Verify updated prescription references separate DispenseRecord aggregate
  const updatedRx = await localRepository.getPrescription(orderResult.prescription.id);
  assert(updatedRx?.status === 'DISPENSED', 'Prescription status updated to DISPENSED');
  assert(!!updatedRx?.dispenseRecordId, 'Prescription maintains reference to separate DispenseRecord aggregate');

  // Step 6d: Verify authoritative DispenseRecord aggregate is independently retrievable
  const persistedDispense = await localRepository.getDispenseRecord(updatedRx!.dispenseRecordId!);
  assert(!!persistedDispense, 'DispenseRecord aggregate independently persisted in storage layer');
  assert(persistedDispense?.prescriptionId === orderResult.prescription.id, 'DispenseRecord references originating prescription ID');
  assert(persistedDispense?.quantityDispensed === 24, 'DispenseRecord tracks verified dispensed quantity');

  // Unauthorized Dispense Attempt (Doctor or Nurse cannot dispense pharmacy stock)
  let unauthorizedDispenseBlocked = false;
  try {
    await medicationService.dispensePrescription(
      {
        prescriptionId: orderResult.prescription.id,
        quantityDispensed: 24,
      },
      doctorKwame
    );
  } catch (err: any) {
    unauthorizedDispenseBlocked = true;
  }
  assert(unauthorizedDispenseBlocked, 'RBAC Mandate: Clinical prescribers cannot dispense pharmacy stock without pharmacy capability');

  // =========================================================================
  // TEST 7: ORDER LIFECYCLE: HOLD AND DISCONTINUE
  // =========================================================================
  console.log('\nTEST 7: Order Lifecycle: Hold and Discontinue...');

  // Create second order to test hold and discontinue
  const paracetamolDef = medicationTerminologyService.getConcept('WHO-EML-PCM-500');
  const pcmOrderResult = await medicationService.createOrderAndIssuePrescription(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      medicationDefinitionId: paracetamolDef!.id,
      route: 'oral',
      dose: '1000',
      doseUnit: 'mg',
      frequency: 'QID PRN',
      durationValue: 5,
      quantity: 20,
      indication: 'Malarial fever and headache',
    },
    doctorKwame
  );

  // Hold order
  const heldOrder = await medicationService.holdMedicationOrder(
    pcmOrderResult.order.id,
    'Hold pending liver function test results due to elevated AST/ALT',
    doctorKwame
  );

  assert(heldOrder.status === 'HELD', 'Medication order status transitioned to HELD');
  assert(heldOrder.heldReason?.includes('liver function'), 'Clinical rationale for hold accurately persisted');

  // Discontinue order
  const discontinuedOrder = await medicationService.discontinueMedicationOrder(
    pcmOrderResult.order.id,
    'Fever resolved, patient discharged from care episode',
    doctorKwame
  );

  assert(discontinuedOrder.status === 'DISCONTINUED', 'Medication order status transitioned to DISCONTINUED');
  assert(discontinuedOrder.discontinuedReason?.includes('Fever resolved'), 'Discontinuation rationale persisted in audit lineage');

  // =========================================================================
  // TEST 8: VERSIONED PRESCRIPTION AMENDMENT
  // =========================================================================
  console.log('\nTEST 8: Versioned Prescription Amendment...');

  // Create an active prescription to amend
  const amoxOrderResult = await medicationService.createOrderAndIssuePrescription(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      medicationDefinitionId: amoxDef!.id,
      route: 'oral',
      dose: '500',
      doseUnit: 'mg',
      frequency: 'TID',
      durationValue: 7,
      quantity: 21,
      indication: 'Documented override test',
      acknowledgedWarnings: [
        {
          checkType: 'ALLERGY',
          warningMessage: 'Penicillin allergy alert acknowledged',
          clinicianId: doctorKwame.userId,
          clinicianName: doctorKwame.userName,
          clinicianRole: doctorKwame.userRole,
          response: 'ACKNOWLEDGE_AND_CONTINUE',
          justification: 'Desensitization protocol completed under intensive observation',
          timestamp: new Date().toISOString(),
        },
      ],
    },
    doctorKwame
  );

  // Doctor amends the prescription (adjusts dosage instructions)
  const amendedRx = await medicationService.amendPrescription(
    amoxOrderResult.prescription.id,
    {
      instructions: 'Amended: Take with meals. Extended course by 3 days.',
      quantity: 30,
      durationValue: 10,
    },
    'Clinical response partial at day 3; expanding course with close monitoring',
    doctorKwame
  );

  assert(amendedRx.version === 2, 'Prescription version incremented from 1 to 2 upon amendment');
  assert(amendedRx.quantity === 30, 'Amended quantity reflected in updated prescription');
  assert(amendedRx.amendmentHistory && amendedRx.amendmentHistory.length === 1, 'Prescription retains immutable amendment history entry');
  assert(amendedRx.signatureHash !== amoxOrderResult.prescription.signatureHash, 'New digital signature seal generated for amended prescription');

  // =========================================================================
  // TEST 9: RECONCILED LONGITUDINAL MEDICATION HISTORY
  // =========================================================================
  console.log('\nTEST 9: Reconciled Longitudinal Medication History...');

  const medicationHistory = await medicationService.getMedicationHistory(patient.id);
  assert(medicationHistory.length >= 3, `Retrieved ${medicationHistory.length} reconciled medication history records`);

  const coartemItem = medicationHistory.find((h) => h.genericName.includes('Artemether'));
  assert(!!coartemItem, 'Reconciled history contains Artemether/Lumefantrine treatment');
  assert(coartemItem?.source === 'LOCAL_PRESCRIPTION', 'Prescription provenance accurately attributed');

  const pcmItem = medicationHistory.find((h) => h.genericName.includes('Paracetamol'));
  assert(pcmItem?.category === 'DISCONTINUED', 'Discontinued medication categorized appropriately in historical sheet');

  // =========================================================================
  // TEST 10: EVENT SOURCING & TAMPER-EVIDENT AUDIT LEDGER
  // =========================================================================
  console.log('\nTEST 10: Event Sourcing & Audit Ledger Integrity...');

  const events = eventStore.getEventsByAggregate(patient.id);
  assert(events.length > 0, 'Domain events committed to append-only EventStore for patient aggregate');

  const orderCreatedEvents = events.filter((e) => e.eventType === 'MedicationOrderCreated');
  assert(orderCreatedEvents.length >= 2, `Event store recorded ${orderCreatedEvents.length} MedicationOrderCreated events`);

  const auditLogs = localDb.getAuditLogs();
  const medAudits = auditLogs.filter(
    (a) => a.resourceType === 'MedicationOrder' || a.resourceType === 'Prescription'
  );

  assert(medAudits.length >= 5, `Tamper-evident audit ledger captured ${medAudits.length} medication lifecycle entries`);
  assert(
    medAudits.every((a) => a.facilityId === 'AMGH-001'),
    'All medication audit records strictly maintain facility isolation (AMGH-001)'
  );

  // Final Test Results Summary
  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled failure in Medication Test Suite:', err);
  process.exit(1);
});
