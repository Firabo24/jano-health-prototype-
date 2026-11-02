/**
 * Jano Health - Clinical Core V22 Clinical Validation,
 * Quality & Safety Assurance Comprehensive Test Suite
 */

import 'fake-indexeddb/auto';
import {
  clinicalSafetyCaseService,
  clinicalHazardRegistryService,
  workflowValidationMatrixService,
  aiValidationEvaluationService,
  clinicalUsabilityAlertService,
  clinicalSafetyIncidentCAPAService,
  clinicalValidationGateService,
} from '../src/services/clinicalValidation';
import {
  V22_INVARIANTS,
  HazardCategory,
} from '../src/domain/v22ClinicalValidationTypes';
import { idbEngine, ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { hasCapability, ROLE_DEFINITIONS } from '../src/domain/permissions';

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  assertionsPassed++;
  console.log(`✅ PASS: ${message}`);
}

async function runV22ClinicalValidationSafetyTests(): Promise<void> {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V22 CLINICAL VALIDATION & SAFETY TESTS');
  console.log('================================================================');

  // ----------------------------------------------------------------
  // 1. Clinical Safety Case & Evidence Linkage
  // ----------------------------------------------------------------
  console.log('\n--- 1. Clinical Safety Case & Evidence Traceability ---');
  const sc = await clinicalSafetyCaseService.createSafetyCase(
    'Jano Clinical Core Safety Assurance Case',
    '22.0.0',
    'Full Clinical Workflow Scope',
    'Dr. Amani (Lead Safety Assessor)'
  );
  assert(sc.status === 'DRAFT', 'Safety case initialized in DRAFT state');
  assert(sc.version === '1.0.0', 'Safety case versioned as 1.0.0');

  const claim = await clinicalSafetyCaseService.createSafetyClaim(
    sc.caseId,
    'Medication orders are checked against active allergy records prior to dispensation.',
    'MEDICATION_SAFETY',
    ['haz_medication_base'],
    ['ctrl_allergy_firewall'],
    'Dr. Amani'
  );
  assert(claim.status === 'DRAFT', 'Safety claim created in DRAFT state');
  assert(claim.evidenceIds.length === 0, 'Safety claim starts with empty evidence list');

  // INVARIANT TEST: Cannot mark claim as VALIDATED without documented evidence
  let unevidencedValidationBlocked = false;
  try {
    await clinicalSafetyCaseService.reviewClaim(claim.claimId, 'VALIDATED', 'Dr. Amani');
  } catch (err: any) {
    unevidencedValidationBlocked = true;
  }
  assert(unevidencedValidationBlocked, 'INVARIANT ENFORCED: Safety claim cannot reach VALIDATED without evidence');

  // Record valid evidence artifact
  const evidence = await clinicalSafetyCaseService.recordSafetyEvidence(
    'Allergy Cross-Reaction Simulation Audit Trace',
    'ADVERSARIAL_TEST',
    { testId: 'adv_allergy_01', passed: true, blockedReactions: 14 },
    true, // Synthetic test data
    'Dr. Amani'
  );
  assert(evidence.evidenceId.startsWith('ev_'), 'Safety evidence recorded');
  assert(evidence.provenanceHash.length === 64, 'Evidence sealed with SHA-256 provenance hash');
  assert(evidence.isSynthetic === true, 'Evidence explicitly flagged as synthetic');

  // Link evidence and review claim
  await clinicalSafetyCaseService.linkEvidenceToClaim(claim.claimId, evidence.evidenceId);
  const validatedClaim = await clinicalSafetyCaseService.reviewClaim(claim.claimId, 'VALIDATED', 'Dr. Amani');
  assert(validatedClaim.status === 'VALIDATED', 'Safety claim successfully reached VALIDATED with linked evidence');
  assert(validatedClaim.reviewer === 'Dr. Amani', 'Reviewer attribution recorded');

  // Accept residual risk
  const residualRisk = await clinicalSafetyCaseService.acceptResidualRisk(
    claim.claimId,
    'haz_medication_base',
    'Novel unrecorded idiosyncratic reaction cannot be detected from historical allergy records',
    'Clinician observation and adverse event reporting in place as mitigating control',
    'Dr. Sarah (Chief Medical Officer)'
  );
  assert(residualRisk.acceptable === true, 'Residual risk accepted with clinical justification');

  // ----------------------------------------------------------------
  // 2. Clinical Hazard & Risk Register
  // ----------------------------------------------------------------
  console.log('\n--- 2. Clinical Hazard Registry across 9 Domains ---');
  const baselineHazards = await clinicalHazardRegistryService.initializeBaselineHazards();
  assert(baselineHazards.length === 9, 'All 9 hazard domains registered');

  const medHazard = baselineHazards.find(h => h.category === 'MEDICATION')!;
  assert(medHazard.initialSeverity === 'CATASTROPHIC', 'Medication allergy hazard initial severity is CATASTROPHIC');
  assert(medHazard.initialRiskScore >= 15, 'Initial risk score calculated correctly');

  // Apply controls and verify residual risk reduction
  const controlledHazard = await clinicalHazardRegistryService.applyControls(
    medHazard.hazardId,
    [
      { controlType: 'SOFTWARE_GUARD', description: 'Hard allergy blocking check in prescription engine' },
      { controlType: 'UI_AFFORDANCE', description: 'Prominent red allergy warning banner on patient chart' },
    ],
    'MINOR',
    'REMOTE'
  );
  assert(controlledHazard.controls.length >= 2, 'Controls attached to hazard');
  assert(controlledHazard.residualSeverity === 'MINOR', 'Residual severity reduced to MINOR');
  assert(controlledHazard.residualRiskScore <= 6, 'Residual risk score significantly reduced');
  assert(controlledHazard.status === 'CONTROLS_APPLIED', 'Hazard status transitioned to CONTROLS_APPLIED');

  // FMEA Failure Modes Analysis
  const fmea = await clinicalHazardRegistryService.performFMEA(
    'Emergency Drug Administration',
    [
      {
        step: 'Order Entry',
        failureMode: 'Incorrect dose unit entered',
        potentialEffect: 'Overdose toxicity',
        severityScore: 9,
        potentialCause: 'Typo in milligram vs microgram',
        occurrenceScore: 3,
        currentControls: 'Standard dose range checking',
        detectionScore: 2,
        mitigationPlan: 'Mandatory unit dropdown selection with standard dosing bounds',
      },
    ],
    'Clinical Safety Team'
  );
  assert(fmea.failureModes[0].rpn === 54, 'FMEA RPN calculated as 9 * 3 * 2 = 54');
  assert(fmea.failureModes[0].residualRpn < 54, 'Residual RPN reflects post-mitigation control');

  // ----------------------------------------------------------------
  // 3. Clinical Workflow Validation Matrix & SATS Preservation
  // ----------------------------------------------------------------
  console.log('\n--- 3. Clinical Workflow Validation Matrix & SATS Triage ---');
  const matrices = await workflowValidationMatrixService.initializeBaselineMatrices();
  assert(matrices.length >= 4, 'Core workflow validation matrices registered');

  // Verify Encounter forbidden transition
  const invalidTransition = await workflowValidationMatrixService.validateTransition(
    'wf_encounter_lifecycle',
    'PLANNED',
    'SIGNED'
  );
  assert(invalidTransition.allowed === false, 'FORBIDDEN TRANSITION BLOCKED: Cannot jump from PLANNED to SIGNED');
  assert(invalidTransition.violationReason?.includes('FORBIDDEN_TRANSITION') === true, 'Forbidden transition error returned');

  const validTransition = await workflowValidationMatrixService.validateTransition(
    'wf_encounter_lifecycle',
    'PLANNED',
    'ARRIVED'
  );
  assert(validTransition.allowed === true, 'Permitted transition allowed');

  // SATS Emergency Triage Invariant Verification
  assert(workflowValidationMatrixService.verifySatsTier('RED'), 'SATS RED verified');
  assert(workflowValidationMatrixService.verifySatsTier('ORANGE'), 'SATS ORANGE verified');
  assert(workflowValidationMatrixService.verifySatsTier('YELLOW'), 'SATS YELLOW verified');
  assert(workflowValidationMatrixService.verifySatsTier('GREEN'), 'SATS GREEN verified');
  assert(workflowValidationMatrixService.verifySatsTier('BLUE'), 'SATS BLUE verified');

  let blackSatsRejected = false;
  try {
    workflowValidationMatrixService.verifySatsTier('BLACK');
  } catch (err: any) {
    blackSatsRejected = true;
  }
  assert(blackSatsRejected, 'HARD INVARIANT ENFORCED: SATS strictly does not include BLACK');

  // ----------------------------------------------------------------
  // 4. AI Clinical Validation & Grounding Framework
  // ----------------------------------------------------------------
  console.log('\n--- 4. AI Clinical Validation & Grounding ---');
  const aiStudy = await aiValidationEvaluationService.createStudy(
    'clinical.assessment.differential',
    'gemini-2.5-flash-grounded',
    'v2.4.0',
    'dataset-v22-synthetic-outpatient',
    'Dr. Sarah'
  );
  assert(aiStudy.status === 'IN_PROGRESS', 'AI validation study initialized');

  // Record a passed evaluation case
  const aiCasePass = await aiValidationEvaluationService.recordEvaluationCase(
    aiStudy.studyId,
    'Adult with productive cough, fever 38.8C, tachypnea, left lower lobe crackles.',
    'Community-acquired pneumonia, acute bronchitis',
    'Primary consideration: Community-acquired pneumonia. Secondary: Acute bronchitis.',
    'PASS',
    [],
    'Well grounded in physical findings'
  );
  assert(aiCasePass.clinicianReviewRequired === true, 'INVARIANT ENFORCED: clinicianReviewRequired is strictly true');
  assert(aiCasePass.isAutonomousMutationAllowed === false, 'INVARIANT ENFORCED: isAutonomousMutationAllowed is strictly false');

  // Clinician human override recording
  const override = await aiValidationEvaluationService.recordClinicianOverride(
    'ai_sugg_001',
    'usr-physician-sarah',
    'MODIFY',
    'Clinician adjusted antimicrobial coverage based on local antibiogram.'
  );
  assert(override.decisionRecorded === true, 'Clinician human decision independently recorded');
  assert(override.independentAttribution.includes('MODIFY'), 'Independent decision attribution verified');

  // ----------------------------------------------------------------
  // 5. Usability & Human Factors Validation
  // ----------------------------------------------------------------
  console.log('\n--- 5. Usability & Human Factors Safety Guard ---');
  const usability = await clinicalUsabilityAlertService.recordUsabilityStudy({
    workflowName: 'Emergency Bedside Patient Lookup',
    participantRole: 'emergency_nurse',
    taskDescription: 'Locate patient by MRN during emergency intake',
    taskCompletionRate: 100,
    medianTimeSeconds: 4.2,
    observedErrors: [],
    confusionPoints: [],
    workarounds: [],
    safetyConcerns: [],
    safetyRiskIncreased: false,
    assessor: 'Human Factors Lead',
  });
  assert(usability.taskCompletionRate === 100, 'Usability task completion rate recorded');

  // INVARIANT TEST: A faster workflow that increases risk cannot be accepted
  let speedTradeoffCaught = false;
  try {
    V22_INVARIANTS.assertUsabilitySpeedDoesNotCompromiseSafety(2.1, true); // Faster, but risk increased!
  } catch (err: any) {
    speedTradeoffCaught = true;
  }
  assert(speedTradeoffCaught, 'HARD INVARIANT ENFORCED: Faster workflow that increases clinical risk is rejected');

  // Alert safety governance
  const alertRules = await clinicalUsabilityAlertService.initializeBaselineAlertRules();
  assert(alertRules.length >= 2, 'Baseline safety alert rules registered');
  const allergyRule = alertRules.find(r => r.alertType === 'ALLERGY_CONFLICT')!;
  assert(allergyRule.offlineUsable === true, 'Critical allergy alert is guaranteed usable offline');
  assert(allergyRule.canBeSuppressed === false, 'Critical allergy alert can NEVER be suppressed');

  // ----------------------------------------------------------------
  // 6. Clinical Safety Incidents, Near-Misses & CAPA
  // ----------------------------------------------------------------
  console.log('\n--- 6. Clinical Safety Incidents & CAPA ---');
  const incident = await clinicalSafetyIncidentCAPAService.reportIncident(
    'NEAR_MISS',
    'fac-uvinza-hc',
    'MODERATE',
    false,
    'Near-miss: Prescriber initially selected penicillin for patient with known rash, caught by allergy warning banner.'
  );
  assert(incident.status === 'REPORTED', 'Clinical near-miss reported');
  assert(incident.patientHarmOccurred === false, 'Confirmed no patient harm occurred');

  // Attach RCA & CAPA
  const capaIncident = await clinicalSafetyIncidentCAPAService.attachRCAAndCAPA(
    incident.incidentId,
    'Prescriber clicked quickly past confirmation modal during busy outpatient shift.',
    ['Enhanced modal requiring explicit click on alternative medication options'],
    ['Include allergy recognition in monthly clinician refresher training']
  );
  assert(capaIncident.status === 'CAPA_PENDING', 'Incident transitioned to CAPA_PENDING');
  assert(capaIncident.correctiveActions.length === 1, 'Corrective action linked');

  // Formally close incident
  const closedIncident = await clinicalSafetyIncidentCAPAService.closeIncident(
    incident.incidentId,
    'Dr. Amani (Safety Officer)'
  );
  assert(closedIncident.status === 'CLOSED', 'Incident formally closed after CAPA verification');

  // ----------------------------------------------------------------
  // 7. Clinical Validation Gates across 20 Subsystems
  // ----------------------------------------------------------------
  console.log('\n--- 7. Clinical Validation Gates across 20 Domains ---');
  const gates = await clinicalValidationGateService.initializeBaselineGates();
  assert(gates.length === 20, 'Exact 20 clinical validation gates initialized');

  const labGate = gates.find(g => g.domain === 'Laboratory')!;
  assert(labGate.status === 'TESTING', 'Lab validation gate initial status is TESTING');

  // Attempt to mark VALIDATED without meeting all mandatory evidence
  let incompleteGateBlocked = false;
  try {
    await clinicalValidationGateService.evaluateGate(
      labGate.gateId,
      'VALIDATED',
      [], // Missing second required evidence
      'Dr. Amani'
    );
  } catch (err: any) {
    incompleteGateBlocked = true;
  }
  assert(incompleteGateBlocked, 'INVARIANT ENFORCED: Gate cannot reach VALIDATED when mandatory evidence is missing');

  // Satisfy evidence and pass gate
  const passedGate = await clinicalValidationGateService.evaluateGate(
    labGate.gateId,
    'VALIDATED',
    [`ev_${labGate.gateId}_adversarial`],
    'Dr. Amani'
  );
  assert(passedGate.status === 'VALIDATED', 'Validation gate reached VALIDATED upon evidence completion');

  // ----------------------------------------------------------------
  // 8. Clinical Limitations Transparency Register
  // ----------------------------------------------------------------
  console.log('\n--- 8. Clinical Limitations Register ---');
  const limitation = await clinicalValidationGateService.registerLimitation(
    'Pediatric Fluid Resuscitation',
    'Automated pediatric fluid balance calculators do not replace manual weight-based bedside titration in severe burns.',
    ['physician', 'nurse'],
    'Potential fluid overload if clinician relies solely on initial calculation without hourly titration',
    'Follow national pediatric burn protocol and calculate manual hourly fluid rates',
    'Prominent disclaimer displayed when pediatric weight is entered',
    'Clinical Safety Committee'
  );
  assert(limitation.isDisclosedInUI === true, 'Material clinical limitation explicitly disclosed in UI');

  // ----------------------------------------------------------------
  // 9. Release Safety Gate Evaluation
  // ----------------------------------------------------------------
  console.log('\n--- 9. Release Safety Gate Evaluation ---');
  const releaseEvaluationBlocked = await clinicalValidationGateService.evaluateReleaseSafety({
    softwareTestsPassing: true,
    clinicalValidationComplete: true,
    unresolvedCriticalHazardsCount: 1, // Unresolved critical hazard!
    knownLimitationsDisclosed: true,
  });
  assert(releaseEvaluationBlocked.isApprovedForLive === false, 'Release gate BLOCKS live deployment when critical hazard unresolved');
  assert(releaseEvaluationBlocked.blockingReasons.length > 0, 'Explicit blocking reasons returned');

  const releaseEvaluationApproved = await clinicalValidationGateService.evaluateReleaseSafety({
    softwareTestsPassing: true,
    clinicalValidationComplete: true,
    unresolvedCriticalHazardsCount: 0,
    knownLimitationsDisclosed: true,
  });
  assert(releaseEvaluationApproved.isApprovedForLive === true, 'Release gate APPROVES live deployment when all gates satisfied');

  // ----------------------------------------------------------------
  // 10. Pilot Validation Packet Generation (Strict Separation)
  // ----------------------------------------------------------------
  console.log('\n--- 10. Pilot Validation Packet Generation ---');
  const packet = await clinicalValidationGateService.generatePilotValidationPacket(
    'fac-uvinza-pilot',
    '22.0.0',
    'Dr. Amani (Safety Lead)'
  );
  assert(packet.packetId.startsWith('pvp_'), 'Pilot Validation Packet generated');
  assert(packet.verifiedSoftwareBehavior.length > 0, 'Software verification section populated');
  assert(packet.clinicalValidationEvidence.length > 0, 'Clinical validation evidence section populated');
  assert(packet.externalRegulatoryRequirements.length > 0, 'Regulatory requirements section populated');
  assert(packet.packetHash.length === 64, 'Packet cryptographically sealed with SHA-256 hash');

  // Verify non-misrepresentation invariant
  assert(
    packet.externalRegulatoryRequirements.some(r => r.includes('does NOT claim formal statutory')),
    'INVARIANT VERIFIED: Packet explicitly states it does not fabricate formal statutory device certification'
  );

  // ----------------------------------------------------------------
  // 11. Training & Competency Assessment Invariant
  // ----------------------------------------------------------------
  console.log('\n--- 11. Training vs Competency Assessment Invariant ---');
  const compRecord = await clinicalValidationGateService.recordCompetencyAssessment(
    'usr-nurse-hana',
    'nurse',
    'Emergency SATS Triage & Reassessment',
    true,
    true,
    96,
    'Dr. Sarah (Clinical Evaluator)'
  );
  assert(compRecord.trainingCompleted === true, 'Training completed recorded');
  assert(compRecord.competencyAssessed === true, 'Competency assessment independently confirmed');
  assert(compRecord.assessmentScore >= 90, 'Competency assessment score documented');

  // ----------------------------------------------------------------
  // 12. RBAC & Separation of Duties
  // ----------------------------------------------------------------
  console.log('\n--- 12. RBAC & Separation of Duties ---');
  assert(hasCapability('clinical_safety_officer', 'clinical.safety.manage'), 'clinical_safety_officer has clinical.safety.manage');
  assert(hasCapability('clinical_safety_officer', 'clinical.safety.approve'), 'clinical_safety_officer has clinical.safety.approve');
  assert(hasCapability('clinical_safety_officer', 'clinical.risk.accept'), 'clinical_safety_officer has clinical.risk.accept');
  assert(hasCapability('clinical_quality_reviewer', 'clinical.validation.review'), 'clinical_quality_reviewer has clinical.validation.review');

  // Least privilege: Reviewer cannot approve, nurse cannot accept clinical risk
  assert(!hasCapability('clinical_quality_reviewer', 'clinical.safety.approve'), 'clinical_quality_reviewer CANNOT approve safety claims');
  assert(!hasCapability('nurse', 'clinical.risk.accept'), 'nurse CANNOT accept residual clinical risk');
  assert(!hasCapability('physician', 'clinical.release.gate_approve'), 'physician does not hold clinical release gate approval authority');

  // ----------------------------------------------------------------
  // 13. All 301 IndexedDB Stores Persistence & Schema Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 13. All 301 IndexedDB Stores Schema & Persistence ---');
  assert(ALL_STORE_NAMES.length >= 301, `ALL_STORE_NAMES contains at least 301 stores including all V22 stores (actual: ${ALL_STORE_NAMES.length})`);

  // Durable write & read into new V22 stores
  await idbEngine.put('clinicalSafetyCases', sc);
  const fetchedSc = await idbEngine.get('clinicalSafetyCases', sc.caseId);
  assert(fetchedSc !== undefined, 'Durable persistence verified in clinicalSafetyCases store');

  await idbEngine.put('clinicalValidationGates', labGate);
  const fetchedGate = await idbEngine.get('clinicalValidationGates', labGate.gateId);
  assert(fetchedGate !== undefined, 'Durable persistence verified in clinicalValidationGates store');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V22 TESTS PASSED: ${assertionsPassed} assertions verified`);
  console.log('================================================================\n');
}

runV22ClinicalValidationSafetyTests().catch((e) => {
  console.error('V22 Test Suite Failed:', e);
  process.exit(1);
});
