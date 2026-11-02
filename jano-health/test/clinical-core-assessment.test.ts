/**
 * Jano Health - Clinical Core V3: Problems, Diagnoses & Clinical Assessment Test Suite
 * 
 * Verifies:
 * 1. Offline Clinical Terminology Service (ICD-10 search, exact code lookup, synonym matching)
 * 2. Clinical Safety Protocol (rejection of un-attested diagnoses and fake identities)
 * 3. Longitudinal Problem List (creation, priority levels, resolution, and entered-in-error voiding)
 * 4. Diagnoses & Certainty Lifecycle (provisional to confirmed, versioned corrections, error-voiding)
 * 5. Differential Diagnostic Considerations (evidence recording, deprioritization, rule-outs, promotion)
 * 6. Holistic Clinical Assessment Synthesis (drafting, problem/differential linkage)
 * 7. Cryptographic Signing & Immutability (SHA-256 integrity seal, direct edit lockout)
 * 8. Versioned Assessment Amendment Pipeline (mandatory reason, lineage tracking)
 * 9. Facility Isolation & Role-Based Access Control (RBAC) boundaries
 * 10. Atomic Transactions, Event Sourcing & Audit Logging integration
 */

import { clinicalTerminologyService } from '../src/services/terminology/clinicalTerminologyService';
import {
  clinicalAssessmentService,
  ClinicalAssessmentSecurityError,
  ClinicalSafetyViolationError,
  SignedAssessmentImmutabilityError,
} from '../src/services/clinical/clinicalAssessmentService';
import { patientService, AuthenticatedPrincipal } from '../src/services/clinical/patientService';
import { encounterService } from '../src/services/clinical/encounterService';
import { localDb } from '../src/services/storage/localDatabase';
import { eventStore } from '../src/services/events/eventStore';

// Test Principals across roles and facilities
const doctorAmgh: AuthenticatedPrincipal = {
  id: 'usr_doc_kwame',
  fullName: 'Dr. Kwame Antwi',
  role: 'physician',
  facilityId: 'AMGH-001',
};

const supervisorAmgh: AuthenticatedPrincipal = {
  id: 'usr_sup_mensah',
  fullName: 'Dr. Akua Mensah',
  role: 'clinical_supervisor',
  facilityId: 'AMGH-001',
};

const nurseAmgh: AuthenticatedPrincipal = {
  id: 'usr_nur_grace',
  fullName: 'Nurse Grace Darko',
  role: 'nurse',
  facilityId: 'AMGH-001',
};

const receptionistAmgh: AuthenticatedPrincipal = {
  id: 'usr_rec_kofi',
  fullName: 'Kofi Boateng',
  role: 'receptionist',
  facilityId: 'AMGH-001',
};

const doctorOtherFacility: AuthenticatedPrincipal = {
  id: 'usr_doc_foreign',
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
  console.log('JANO HEALTH - CLINICAL CORE V3: ASSESSMENT, DIAGNOSES & PROBLEMS');
  console.log('=============================================================');

  // Reset database before execution
  localDb.clearAll();

  // Register baseline patient
  const regResult = await patientService.registerPatient(doctorAmgh, {
    givenName: 'Abena',
    familyName: 'Osei',
    dateOfBirth: '1992-06-15',
    sex: 'female',
    phone: '+233201234567',
    villageTown: 'Kumasi Central',
    district: 'Kumasi Metro',
    registrationFacilityId: 'AMGH-001',
  });
  assert(regResult.success && !!regResult.patient, 'Baseline test patient registered successfully');
  const patient = regResult.patient!;

  // Create active clinical encounter
  const encounter = await encounterService.createEncounter(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      encounterType: 'outpatient',
      attendingClinicianId: doctorAmgh.id,
      chiefComplaint: 'Acute high-grade fever, chills, severe headache, and vomiting for 3 days',
    },
    doctorAmgh
  );
  assert(!!encounter && !!encounter.id, 'Clinical encounter initialized for V3 assessment testing');

  // =========================================================================
  // TEST 1: OFFLINE CLINICAL TERMINOLOGY SERVICE (ICD-10)
  // =========================================================================
  console.log('\nTEST 1: Offline Clinical Terminology Service (ICD-10 Search & Synonym Matching)...');
  
  const malariaLookup = clinicalTerminologyService.getByCode('B50.9');
  assert(!!malariaLookup && malariaLookup.display.includes('falciparum'), 'Exact ICD-10 code lookup returns canonical entity');

  const searchResults = clinicalTerminologyService.search('malaria');
  assert(searchResults.length >= 2, 'Search by keyword "malaria" returns multiple matching clinical terms');
  assert(searchResults.some((t) => t.code === 'B50.9'), 'Search matches canonical P. falciparum code B50.9');

  const synonymResults = clinicalTerminologyService.search('sugar');
  assert(synonymResults.some((t) => t.code.startsWith('E11')), 'Synonym "sugar" resolves to Type 2 Diabetes (E11)');

  const chapterTerms = clinicalTerminologyService.getByCategory('infectious');
  assert(chapterTerms.length >= 5, 'Category filtering returns curated infectious disease terms');

  // =========================================================================
  // TEST 2: CLINICAL SAFETY RULE - ATTESTATION & IDENTITY ENFORCEMENT
  // =========================================================================
  console.log('\nTEST 2: Clinical Safety Mandate & Attestation Protocol...');

  let unAttestedFailed = false;
  try {
    await clinicalAssessmentService.recordDiagnosis(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        diagnosisText: 'Inferred Bacterial Meningitis',
        clinicianAttested: false, // VIOLATION: Unattested diagnosis
      },
      doctorAmgh
    );
  } catch (err: any) {
    if (err instanceof ClinicalSafetyViolationError) {
      unAttestedFailed = true;
    }
  }
  assert(unAttestedFailed, 'Safety Rule: Algorithmically inferred diagnoses without clinician attestation are strictly rejected');

  let fakeIdentityFailed = false;
  try {
    await clinicalAssessmentService.recordDiagnosis(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        diagnosisText: 'Severe Dehydration',
        clinicianAttested: true,
      },
      {
        id: 'fake_user_1',
        fullName: 'Current User', // VIOLATION: Fake production placeholder
        role: 'physician',
        facilityId: 'AMGH-001',
      }
    );
  } catch (err: any) {
    if (err instanceof ClinicalAssessmentSecurityError) {
      fakeIdentityFailed = true;
    }
  }
  assert(fakeIdentityFailed, 'Safety Rule: Fake production identity ("Current User") is rejected with security violation');

  let rbacDenied = false;
  try {
    await clinicalAssessmentService.recordDiagnosis(
      {
        patientId: patient.id,
        facilityId: 'AMGH-001',
        diagnosisText: 'Gastritis',
        clinicianAttested: true,
      },
      receptionistAmgh // Receptionist lacks diagnosis.write capability
    );
  } catch (err: any) {
    if (err instanceof ClinicalAssessmentSecurityError) {
      rbacDenied = true;
    }
  }
  assert(rbacDenied, 'RBAC: Receptionist role is forbidden from recording diagnoses');

  // =========================================================================
  // TEST 3: LONGITUDINAL PROBLEM LIST MANAGEMENT
  // =========================================================================
  console.log('\nTEST 3: Longitudinal Problem List (Creation, Resolution, and Entered-in-Error)...');

  const prob1 = await clinicalAssessmentService.createProblem(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      description: 'Essential Hypertension, Stage 1',
      clinicalDescription: 'Consistent BP readings > 140/90 mmHg over two clinic visits',
      priority: 'medium',
      onsetDate: '2024-01-15',
      sourceEncounterId: encounter.id,
    },
    doctorAmgh
  );
  assert(prob1.status === 'ACTIVE' && prob1.priority === 'medium', 'Problem created as ACTIVE with medium priority');

  const prob2 = await clinicalAssessmentService.createProblem(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      description: 'Acute Gastroenteritis with moderate dehydration',
      priority: 'high',
      onsetDate: '2026-09-05',
    },
    doctorAmgh
  );
  assert(prob2.status === 'ACTIVE', 'Acute problem successfully added to patient problem list');

  // Resolve acute problem
  const resolvedProb2 = await clinicalAssessmentService.resolveProblem(
    prob2.id,
    { resolutionReason: 'Rehydrated successfully with oral rehydration salts and symptoms cleared' },
    doctorAmgh
  );
  assert(resolvedProb2.status === 'RESOLVED', 'Problem successfully updated to RESOLVED');
  assert(!!resolvedProb2.resolvedAt && !!resolvedProb2.resolutionReason, 'Problem resolution records timestamp and justification');

  // Mark entered-in-error
  const prob3 = await clinicalAssessmentService.createProblem(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      description: 'Erroneous Type 1 Diabetes',
      priority: 'low',
    },
    doctorAmgh
  );
  const voidedProb3 = await clinicalAssessmentService.markProblemEnteredInError(
    prob3.id,
    { errorReason: 'Recorded on wrong chart due to duplicate patient name mixup' },
    doctorAmgh
  );
  assert(voidedProb3.status === 'ENTERED_IN_ERROR', 'Problem successfully voided as ENTERED_IN_ERROR');

  let resolveVoidedFailed = false;
  try {
    await clinicalAssessmentService.resolveProblem(
      prob3.id,
      { resolutionReason: 'Trying to resolve voided problem' },
      doctorAmgh
    );
  } catch (err) {
    resolveVoidedFailed = true;
  }
  assert(resolveVoidedFailed, 'Integrity Rule: Cannot resolve an item that was marked as ENTERED_IN_ERROR');

  // =========================================================================
  // TEST 4: DIAGNOSES & CERTAINTY LIFECYCLE
  // =========================================================================
  console.log('\nTEST 4: Formally Attested Diagnoses & Certainty Lifecycle...');

  // Record provisional diagnosis
  const dx1 = await clinicalAssessmentService.recordDiagnosis(
    {
      patientId: patient.id,
      encounterId: encounter.id,
      facilityId: 'AMGH-001',
      diagnosisText: 'Plasmodium falciparum malaria with severe thrombocytopenia',
      diagnosisCode: 'B50.9',
      codingSystem: 'ICD-10',
      diagnosisType: 'PRIMARY',
      certainty: 'PROVISIONAL',
      onsetContext: 'Recent travel to peri-urban swamp area, fever spike 39.5°C',
      clinicianAttested: true,
    },
    doctorAmgh
  );
  assert(dx1.certainty === 'PROVISIONAL' && dx1.diagnosisType === 'PRIMARY', 'Provisional primary diagnosis recorded');

  // Confirm diagnosis
  const confirmedDx1 = await clinicalAssessmentService.confirmDiagnosis(dx1.id, doctorAmgh);
  assert(confirmedDx1.certainty === 'CONFIRMED' && confirmedDx1.status === 'CONFIRMED', 'Clinician confirmed provisional diagnosis');
  assert(confirmedDx1.confirmedById === doctorAmgh.id, 'Attesting clinician ID permanently bound to confirmed diagnosis');

  // Correct diagnosis with versioned amendment
  const correctedDx1 = await clinicalAssessmentService.correctDiagnosis(
    dx1.id,
    {
      diagnosisText: 'Complicated Plasmodium falciparum malaria with severe thrombocytopenia and jaundice',
      diagnosisCode: 'B50.0',
      amendmentReason: 'Serum bilirubin elevated to 42 umol/L confirming clinical jaundice complication',
    },
    doctorAmgh
  );
  assert((correctedDx1.version || 1) >= 2, 'Diagnosis correction increments record version');
  assert(correctedDx1.diagnosisCode === 'B50.0', 'Diagnosis updated with specific ICD-10 code B50.0');
  assert(!!correctedDx1.amendmentReason, 'Amendment reason persisted in clinical record');

  // Mark diagnosis as entered in error
  const erroneousDx = await clinicalAssessmentService.recordDiagnosis(
    {
      patientId: patient.id,
      encounterId: encounter.id,
      facilityId: 'AMGH-001',
      diagnosisText: 'Misdiagnosed Sickle Cell Crisis',
      clinicianAttested: true,
    },
    doctorAmgh
  );
  const voidedDx = await clinicalAssessmentService.markDiagnosisEnteredInError(
    erroneousDx.id,
    { errorReason: 'Hemoglobin electrophoresis confirmed normal Hb AA pattern' },
    doctorAmgh
  );
  assert(voidedDx.status === 'ENTERED_IN_ERROR', 'Erroneous diagnosis marked as ENTERED_IN_ERROR with audit trail');

  // =========================================================================
  // TEST 5: DIFFERENTIAL CONSIDERATIONS
  // =========================================================================
  console.log('\nTEST 5: Differential Diagnostic Hypotheses, Evidence & Promotion...');

  const diff1 = await clinicalAssessmentService.createDifferential(
    {
      encounterId: encounter.id,
      patientId: patient.id,
      facilityId: 'AMGH-001',
      diagnosisText: 'Enteric / Typhoid Fever (Salmonella enterica)',
      diagnosisCode: 'A01.0',
      rationale: 'Persistent high remittent fever, coated tongue, step-ladder temperature chart',
      supportingFindings: ['Relative bradycardia (Faget sign)', 'Hepatosplenomegaly on palpation'],
      contradictoryFindings: ['Rapid diagnostic blood smear positive for Ring form trophozoites'],
      confidenceLevel: 'moderate',
    },
    doctorAmgh
  );
  assert(diff1.status === 'CONSIDERED' && diff1.supportingFindings?.length === 2, 'Differential consideration recorded with clinical findings');

  // Promote differential to diagnosis
  const promotionResult = await clinicalAssessmentService.promoteDifferentialToDiagnosis(
    diff1.id,
    { certainty: 'SUSPECTED', diagnosisType: 'SECONDARY' },
    doctorAmgh
  );
  assert(promotionResult.differential.status === 'PROMOTED_TO_WORKING', 'Differential marked as PROMOTED_TO_WORKING');
  assert(promotionResult.diagnosis.diagnosisText === diff1.diagnosisText, 'New diagnosis generated from promoted differential');

  // Deprioritize differential
  const diff2 = await clinicalAssessmentService.createDifferential(
    {
      encounterId: encounter.id,
      patientId: patient.id,
      facilityId: 'AMGH-001',
      diagnosisText: 'Dengue Fever with warning signs',
      rationale: 'Severe retro-orbital pain and myalgia',
      confidenceLevel: 'low',
    },
    doctorAmgh
  );
  const deprioritized = await clinicalAssessmentService.deprioritizeDifferential(
    diff2.id,
    { deprioritizedReason: 'Tourniquet test negative, no hemorrhagic rash' },
    doctorAmgh
  );
  assert(deprioritized.status === 'DEPRIORITIZED', 'Differential deprioritized with clinical reason');

  // Rule out differential
  const diff3 = await clinicalAssessmentService.createDifferential(
    {
      encounterId: encounter.id,
      patientId: patient.id,
      facilityId: 'AMGH-001',
      diagnosisText: 'Acute Viral Meningitis',
      confidenceLevel: 'low',
    },
    doctorAmgh
  );
  const ruledOut = await clinicalAssessmentService.ruleOutDifferential(
    diff3.id,
    'Neck supple, Kernig and Brudzinski signs negative, clear CSF on diagnostic tap',
    doctorAmgh
  );
  assert(ruledOut.status === 'RULED_OUT', 'Differential definitively ruled out with clinical rationale');

  // =========================================================================
  // TEST 6: HOLISTIC CLINICAL ASSESSMENT SYNTHESIS & SIGNING
  // =========================================================================
  console.log('\nTEST 6: Holistic Clinical Assessment Synthesis & Cryptographic Signing...');

  const draftAssessment = await clinicalAssessmentService.draftClinicalAssessment(
    {
      encounterId: encounter.id,
      patientId: patient.id,
      facilityId: 'AMGH-001',
      overallClinicalImpression: '34-year-old female presenting with severe falciparum malaria complicated by profound thrombocytopenia and borderline jaundice. Hemodynamically stable but requires parenteral antimalarial therapy.',
      clinicalReasoning: 'Microscopy 4+ ring trophozoites with parasitemia > 5%. Typhoid co-infection considered but malaria remains the primary acute driver.',
      uncertaintyComments: 'Platelet count trending down to 45 x10^9/L. Monitor closely for spontaneous bleeding manifestations.',
      severityPriority: 'urgent',
      activeProblemIds: [prob1.id],
      primaryDiagnosisId: confirmedDx1.id,
    },
    doctorAmgh
  );
  assert(draftAssessment.status === 'DRAFT', 'Holistic clinical assessment created in DRAFT status');

  // Cryptographic Signing with SHA-256 seal
  const signedAssessment = await clinicalAssessmentService.signClinicalAssessment(
    draftAssessment.id,
    doctorAmgh
  );
  assert(signedAssessment.status === 'SIGNED', 'Clinical assessment transitioned to SIGNED');
  assert(!!signedAssessment.integrityHash && signedAssessment.integrityHash.length === 64, 'Assessment sealed with 64-character SHA-256 integrity hash');
  assert(signedAssessment.signedById === doctorAmgh.id, 'Attestation binds signing clinician identity');

  // Enforce immutability on signed assessment
  let directEditFailed = false;
  try {
    await clinicalAssessmentService.draftClinicalAssessment(
      {
        id: signedAssessment.id,
        encounterId: encounter.id,
        patientId: patient.id,
        facilityId: 'AMGH-001',
        overallClinicalImpression: 'Attempting unauthorized direct overwrite of signed record',
      },
      doctorAmgh
    );
  } catch (err: any) {
    if (err instanceof SignedAssessmentImmutabilityError) {
      directEditFailed = true;
    }
  }
  assert(directEditFailed, 'Immutability: Direct edits to signed clinical assessments are strictly rejected');

  // Versioned Amendment Pipeline
  const amendedAssessment = await clinicalAssessmentService.amendClinicalAssessment(
    signedAssessment.id,
    {
      amendmentReason: 'Subsequent repeat microscopy at 12 hours demonstrates 60% parasite clearance following initial IV artesunate dose',
      overallClinicalImpression: 'Improving complicated falciparum malaria showing positive therapeutic response to parenteral artesunate. Platelet counts stabilizing.',
    },
    supervisorAmgh
  );
  assert(amendedAssessment.status === 'AMENDED', 'Amended assessment created with status AMENDED');
  assert(amendedAssessment.version === signedAssessment.version + 1, 'Amendment increments version number');
  assert(amendedAssessment.previousVersionId === signedAssessment.id, 'Amendment preserves lineage back to previous signed assessment');
  assert(!!amendedAssessment.integrityHash, 'Amended assessment receives its own new cryptographic seal');

  // =========================================================================
  // TEST 7: MULTI-FACILITY ISOLATION BOUNDARIES
  // =========================================================================
  console.log('\nTEST 7: Facility Authorization Boundaries...');

  let foreignFacilityBlocked = false;
  try {
    await clinicalAssessmentService.draftClinicalAssessment(
      {
        encounterId: encounter.id,
        patientId: patient.id,
        facilityId: 'AMGH-001',
        overallClinicalImpression: 'Clinician from foreign facility attempting to document without transfer',
      },
      doctorOtherFacility // Belongs to KATH-002, encounter is at AMGH-001
    );
  } catch (err: any) {
    if (err instanceof ClinicalAssessmentSecurityError) {
      foreignFacilityBlocked = true;
    }
  }
  assert(foreignFacilityBlocked, 'Facility Isolation: Clinician from external facility is prevented from editing local encounter assessments');

  // =========================================================================
  // TEST 8: EVENT SOURCING & AUDIT TRAIL VERIFICATION
  // =========================================================================
  console.log('\nTEST 8: Event Sourcing & Audit Ledger...');

  const events = eventStore.getEventsByAggregate(patient.id);
  assert(events.length > 0, 'Aggregate events recorded for patient');

  const auditLogs = localDb.getAuditLogs();
  const assessmentAudit = auditLogs.filter((l) => l.action.includes('CLINICAL_ASSESSMENT') || l.action.includes('DIAGNOSIS') || l.action.includes('PROBLEM'));
  assert(assessmentAudit.length >= 5, 'Comprehensive audit entries generated across all V3 clinical actions');

  // Final Summary
  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
