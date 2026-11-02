/**
 * Jano Health - Clinical Core V23 Controlled Pilot Deployment,
 * Clinical Operations & Real-World Evidence Test Suite
 */

import 'fake-indexeddb/auto';
import {
  pilotProgramService,
  pilotFacilityReadinessService,
  pilotConfigurationService,
  pilotGoLiveGateService,
  pilotOperationsService,
  pilotIncidentEscalationService,
  pilotKillSwitchService,
  pilotAIGovernanceService,
  pilotRealWorldEvidenceService,
  pilotReportService,
} from '../src/services/pilot';
import { idbEngine, ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { hasCapability } from '../src/domain/permissions';

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  assertionsPassed++;
  console.log(`✅ PASS: ${message}`);
}

async function runV23ControlledPilotTests(): Promise<void> {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V23 CONTROLLED PILOT DEPLOYMENT TESTS');
  console.log('================================================================');

  // ----------------------------------------------------------------
  // 1. Pilot Program & Multi-Site Lifecycle
  // ----------------------------------------------------------------
  console.log('\n--- 1. Pilot Program & Site Lifecycle Gating ---');
  const program = await pilotProgramService.initializeBaselineProgram();
  assert(program.status === 'ACTIVE', 'Pilot program initialized in ACTIVE state');
  assert(program.protocolVersion.includes('23.0.0'), 'Program operates under versioned protocol');

  const site = await pilotProgramService.registerPilotSite(
    program.programId,
    'fac-amgh-pilot',
    'Amani Memorial General Hospital',
    'Sister Grace (Pilot Supervisor)',
    'Dr. Amani (Lead Safety Officer)'
  );
  assert(site.currentPhase === 'PLANNING', 'Site registered in initial PLANNING phase');
  assert(site.phaseHistory.length === 1, 'Initial phase history recorded');
  assert(site.isSuspended === false, 'Site initialized with isSuspended = false');

  // Sequential progression through preparation & training
  const sitePrep = await pilotProgramService.transitionPhase(
    site.siteId,
    'PREPARATION',
    'Sister Grace',
    'Infrastructure and hardware deployment initiated'
  );
  assert(sitePrep.currentPhase === 'PREPARATION', 'Site transitioned to PREPARATION');

  const siteTrain = await pilotProgramService.transitionPhase(
    site.siteId,
    'TRAINING',
    'Sister Grace',
    'Staff training curriculum commenced'
  );
  assert(siteTrain.currentPhase === 'TRAINING', 'Site transitioned to TRAINING');

  // HARD INVARIANT: Cannot transition directly to CONTROLLED_LIVE without passing go-live gate
  let blockedGoLive = false;
  try {
    await pilotProgramService.transitionPhase(
      site.siteId,
      'CONTROLLED_LIVE',
      'Unauthorized Admin',
      'Attempt premature go-live without gate verification',
      false // Gate passed = false
    );
  } catch (err: any) {
    blockedGoLive = true;
    assert(err.message.includes('GO-LIVE GATE BLOCKED'), 'HARD INVARIANT ENFORCED: Transition to LIVE blocked without go-live gate pass');
  }
  assert(blockedGoLive, 'Premature live deployment strictly blocked');

  // Suspension & Resumption controls
  const suspended = await pilotProgramService.suspendSite(
    site.siteId,
    'Dr. Amani (Safety Officer)',
    'Operational containment drill'
  );
  assert(suspended.isSuspended === true, 'Site successfully suspended');
  assert(suspended.currentPhase === 'SUSPENDED', 'Phase marked as SUSPENDED');
  assert(suspended.phaseHistory.length === 4, 'Historical phase records preserved upon suspension');

  const resumed = await pilotProgramService.resumeSite(
    site.siteId,
    'Dr. Amani (Safety Officer)',
    'Containment drill concluded successfully'
  );
  assert(resumed.isSuspended === false, 'Site successfully resumed');
  assert(resumed.currentPhase === 'MONITORED_OPERATION', 'Site transitioned to MONITORED_OPERATION');

  // ----------------------------------------------------------------
  // 2. Pilot Facility Objective Readiness Assessment
  // ----------------------------------------------------------------
  console.log('\n--- 2. Pilot Facility Readiness Assessment & Scoring ---');
  // First assess a deficient site (missing safety lead & low training)
  const deficientAssessment = await pilotFacilityReadinessService.assessFacilityReadiness(
    'site-deficient',
    'Assessor Baraka',
    {
      workforce: {
        designatedSafetyLead: '', // Missing safety lead!
        clinicianCount: 2,
        nurseCount: 5,
        pharmacistCount: 1,
        labTechCount: 1,
        radTechCount: 0,
        adminCount: 1,
        trainingCompletionRate: 50, // Below 80%!
        competencyVerifiedRate: 40, // Below 80%!
      },
    }
  );
  assert(deficientAssessment.overallReadinessPassed === false, 'Deficient facility FAILS overall readiness');
  assert(deficientAssessment.blockingFactors.length >= 2, 'Explicit blocking factors identified');

  // Now assess a fully prepared facility
  const validAssessment = await pilotFacilityReadinessService.assessFacilityReadiness(
    site.siteId,
    'Dr. Amani (Lead Assessor)',
    {
      infrastructure: {
        deviceCount: 16,
        ramStorageClassOk: true,
        powerReliabilityScore: 5,
        backupPowerAvailable: true,
        localNetworkOk: true,
        connectivityClass: 'INTERMITTENT',
        localSyncTopology: 'HYBRID_MESH_LOCAL_PRIMARY',
      },
      workforce: {
        designatedSafetyLead: 'Dr. Amani (Clinical Safety Officer)',
        clinicianCount: 10,
        nurseCount: 22,
        pharmacistCount: 4,
        labTechCount: 4,
        radTechCount: 2,
        adminCount: 3,
        trainingCompletionRate: 96,
        competencyVerifiedRate: 92,
      },
    }
  );
  assert(validAssessment.overallReadinessPassed === true, 'Prepared facility PASSES readiness assessment');
  assert(validAssessment.blockingFactors.length === 0, 'Zero blocking factors for compliant facility');

  const reloadedSite = await pilotProgramService.getPilotSite(site.siteId);
  assert(reloadedSite !== null && reloadedSite.readinessScore >= 90, 'Pilot site readiness score updated (>= 90%)');

  // ----------------------------------------------------------------
  // 3. Governed Pilot Configuration & Change Control
  // ----------------------------------------------------------------
  console.log('\n--- 3. Governed Configuration & Change Control ---');
  const siteConfig = await pilotConfigurationService.getOrCreateSiteConfiguration(site.siteId);
  assert(siteConfig.version === '1.0.0', 'Configuration initialized as version 1.0.0');
  assert(siteConfig.criticalAlertSuppressionAllowed === false, 'HARD INVARIANT: criticalAlertSuppressionAllowed is strictly false');

  // Submit change request
  const cr = await pilotConfigurationService.requestConfigurationChange(
    site.siteId,
    'CLINICAL_WORKFLOW',
    'Enable structured Maternity triage workflow for pilot ward',
    'Expanding clinical scope to maternal admissions',
    'Sister Grace'
  );
  assert(cr.status === 'PROPOSED', 'Change request submitted with PROPOSED status');

  // Attempting to silence critical alerts throws error
  let blockedAlertSuppression = false;
  try {
    await pilotConfigurationService.approveAndApplyConfigurationChange(
      cr.requestId,
      'Dr. Amani',
      { criticalAlertSuppressionAllowed: true as any }
    );
  } catch (err: any) {
    blockedAlertSuppression = true;
    assert(err.message.includes('CRITICAL SAFETY INVARIANT VIOLATION'), 'HARD INVARIANT: Attempt to suppress clinical alerts rejected');
  }
  assert(blockedAlertSuppression, 'Clinical alert suppression strictly rejected');

  // Apply valid change request
  const updatedConfig = await pilotConfigurationService.approveAndApplyConfigurationChange(
    cr.requestId,
    'Dr. Amani (Safety Officer)',
    {
      enabledModules: [...siteConfig.enabledModules, 'MATERNITY_TRIAGE'],
    }
  );
  assert(updatedConfig.version === '1.1.0', 'Configuration version incremented to 1.1.0 upon approved change');
  assert(updatedConfig.enabledModules.includes('MATERNITY_TRIAGE'), 'New module active in site configuration');

  // ----------------------------------------------------------------
  // 4. Pilot Go-Live Gate Verification
  // ----------------------------------------------------------------
  console.log('\n--- 4. Integrated Pilot Go-Live Gate Evaluation ---');
  const goLiveGate = await pilotGoLiveGateService.evaluateGoLiveGate(
    site.siteId,
    'CONTROLLED_LIVE',
    'Dr. Amani (Lead Safety Officer)'
  );
  assert(goLiveGate.status === 'APPROVED', 'Go-Live gate APPROVED when all 12 categories satisfy prerequisites');
  assert(goLiveGate.checks.length === 12, 'Exact 12 prerequisite categories evaluated');
  assert(goLiveGate.reviewedBy === 'Dr. Amani (Lead Safety Officer)', 'Reviewer attribution recorded');
  assert(goLiveGate.rejectionReasons?.length === 0, 'Zero rejection reasons on approved gate');

  // Transition site to CONTROLLED_LIVE with verified gate
  const liveSite = await pilotProgramService.transitionPhase(
    site.siteId,
    'CONTROLLED_LIVE',
    'Sister Grace & Dr. Amani',
    'Authorized go-live following gate approval',
    true // Gate passed
  );
  assert(liveSite.currentPhase === 'CONTROLLED_LIVE', 'Site officially transitioned to CONTROLLED_LIVE');

  // ----------------------------------------------------------------
  // 5. Live Operations, Privacy Telemetry & Workflow Metrics
  // ----------------------------------------------------------------
  console.log('\n--- 5. Privacy-Preserving Telemetry & Workflow Metrics ---');
  const telem = await pilotOperationsService.recordDeviceTelemetry(
    site.siteId,
    'device-terminal-opd-01',
    480, // 8 hours uptime
    0,   // 0 items in queue
    18,  // 18% storage
    'SYNCED',
    0
  );
  assert(telem.isOnline === true, 'Device telemetry recorded online status');
  assert(!telem.redactedPayloadSummary.includes('patient'), 'INVARIANT: Telemetry carries zero patient names or identities');
  assert(telem.redactedPayloadSummary.includes('PII Redacted'), 'PII Redacted label confirmed in telemetry');

  const metric = await pilotOperationsService.recordWorkflowMetric(
    site.siteId,
    'ENCOUNTER',
    50,
    48,
    2,
    720,
    0,
    2,
    '2026-10-06T08:00:00Z',
    '2026-10-06T18:00:00Z'
  );
  assert(metric.totalCompleted === 48, 'Workflow metric recorded 48 completed encounters');
  assert(metric.totalAbandoned === 2, 'Workflow metric recorded 2 abandoned encounters');

  // Support ticket logging - strictly separated from safety incidents
  const supportCase = await pilotOperationsService.logSupportCase(
    site.siteId,
    'CONNECTIVITY',
    'P2',
    'Local LAN switch rebooted during shift change; offline local cache preserved consults'
  );
  assert(supportCase.isSafetyIncident === false, 'HARD SEPARATION: Support case is strictly non-safety');
  assert(supportCase.status === 'OPEN', 'Support case logged as OPEN');

  // Data Quality Audit
  const dqa = await pilotOperationsService.runDataQualityAudit(site.siteId, 'Data Steward Mussa');
  assert(dqa.completenessScore >= 95, 'Data quality completeness score verified (>= 95%)');
  assert(dqa.duplicatesFound === 0, 'Zero duplicate patients verified');

  // ----------------------------------------------------------------
  // 6. Incident Management & Escalation Operations
  // ----------------------------------------------------------------
  console.log('\n--- 6. Pilot Incidents, Escalations & CAPA ---');
  const incident = await pilotIncidentEscalationService.logIncident(
    site.siteId,
    'P1_HIGH',
    'CLINICAL',
    'Duplicate allergy entry detected during rapid intake',
    'Temporary ambiguity in chart allergy section resolved by clinician override',
    'Potential delayed order entry',
    'Nurse Juma',
    'MEDICATION_PRESCRIBING'
  );
  assert(incident.severity === 'P1_HIGH', 'Incident logged with P1_HIGH severity');
  assert(incident.status === 'LOGGED', 'Incident status is LOGGED');

  const escalation = await pilotIncidentEscalationService.escalateIncident(
    incident.incidentId,
    'SAFETY_OFFICER',
    'Sister Grace',
    'Clinical workflow clarification needed for allergy documentation'
  );
  assert(escalation.level === 'SAFETY_OFFICER', 'Incident escalated to SAFETY_OFFICER');

  const contained = await pilotIncidentEscalationService.applyContainmentAndCAPA(
    incident.incidentId,
    'Clinician human verification prompt enforced prior to submit',
    'CAPA-TZ-2026-08',
    'Dr. Amani'
  );
  assert(contained.status === 'CAPA_PENDING', 'Incident transitioned to CAPA_PENDING');

  // HARD INVARIANT: Clinical incident cannot be closed without confirmed absence of patient harm
  let blockedClosure = false;
  try {
    await pilotIncidentEscalationService.closeIncident(
      incident.incidentId,
      'Dr. Amani',
      false // noPatientHarmConfirmed = false
    );
  } catch (err: any) {
    blockedClosure = true;
    assert(err.message.includes('SAFETY INVARIANT VIOLATION'), 'INVARIANT ENFORCED: Incident cannot close without patient harm verification');
  }
  assert(blockedClosure, 'Premature incident closure strictly blocked');

  const closed = await pilotIncidentEscalationService.closeIncident(
    incident.incidentId,
    'Dr. Amani (Safety Officer)',
    true // Confirmed zero patient harm
  );
  assert(closed.status === 'CLOSED', 'Incident formally CLOSED with Safety Officer signoff');
  assert(closed.noPatientHarmConfirmed === true, 'Absence of patient harm confirmed');

  // ----------------------------------------------------------------
  // 7. Operational Kill-Switch & Emergency Care Protection
  // ----------------------------------------------------------------
  console.log('\n--- 7. Operational Kill-Switch Preserving Emergency Care ---');
  const ksEvent = await pilotKillSwitchService.executeKillSwitch(
    site.siteId,
    'DISABLE_AI',
    'ai-clinical-soap-summary',
    'Dr. Amani (Clinical Safety Officer)',
    'Routine safety drill of AI capability kill-switch'
  );
  assert(ksEvent.action === 'DISABLE_AI', 'Kill-switch action DISABLE_AI executed');
  assert(ksEvent.emergencyCareProtected === true, 'HARD INVARIANT: Emergency clinical care protected during kill switch');
  assert(ksEvent.auditSignature.startsWith('KS_SIG_'), 'Cryptographic audit signature generated');

  // ----------------------------------------------------------------
  // 8. Supervised AI Advisory Governance
  // ----------------------------------------------------------------
  console.log('\n--- 8. AI Pilot Governance & Supervision ---');
  const aiGov = await pilotAIGovernanceService.getOrCreateRecord(
    site.siteId,
    'ai-clinical-soap-summary'
  );
  assert(aiGov.clinicianReviewRequired === true, 'HARD INVARIANT: clinicianReviewRequired is strictly true');
  assert(aiGov.isAutonomousMutationAllowed === false, 'HARD INVARIANT: isAutonomousMutationAllowed is strictly false');

  const reviewRecorded = await pilotAIGovernanceService.recordReviewDecision(
    site.siteId,
    'ai-clinical-soap-summary',
    'OVERRIDDEN',
    'Dr. Amani',
    'Adjusted differential diagnosis based on physical examination findings'
  );
  assert(reviewRecorded.totalAdvisoriesIssued === 1, 'Total advisory count incremented');
  assert(reviewRecorded.clinicianOverrideRationaleRecorded === 1, 'Clinician override rationale documented');

  // Grounding failure test
  const groundingDisabled = await pilotAIGovernanceService.flagGroundingFailureAndDisable(
    site.siteId,
    'ai-clinical-soap-summary',
    'Dr. Amani',
    'Model output referenced non-existent drug formulary tier'
  );
  assert(groundingDisabled.immediateDisableTriggered === true, 'Immediate disablement triggered upon grounding failure');
  assert(groundingDisabled.groundingFailureCount === 1, 'Grounding failure count tracked');

  // ----------------------------------------------------------------
  // 9. Real-World Evidence (RWE) Collection & Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 9. Real-World Evidence (RWE) & Cryptographic Sealing ---');
  const rweObserved = await pilotRealWorldEvidenceService.recordEvidenceArtifact(
    site.siteId,
    'OFFLINE_RESILIENCE',
    'PILOT_OBSERVED',
    'Continuous 48-Hour Offline Clinical Intake Without Connectivity Loss',
    { offlineHours: 48, consultsProcessed: 120, syncConflictRatePct: 0 },
    'Field Monitor Baraka'
  );
  assert(rweObserved.provenance === 'PILOT_OBSERVED', 'Observed evidence marked as PILOT_OBSERVED');
  assert(pilotRealWorldEvidenceService.verifyArtifactIntegrity(rweObserved), 'Evidence cryptographically verified with SHA-256 seal');

  const rweSynthetic = await pilotRealWorldEvidenceService.recordEvidenceArtifact(
    site.siteId,
    'RELIABILITY',
    'SYNTHETIC',
    'Synthetic High-Volume Intake Stress Test',
    { simulatedPatients: 1000, maxLatencyMs: 140 },
    'Test Engineer'
  );
  assert(rweSynthetic.provenance === 'SYNTHETIC', 'Synthetic data clearly separated as SYNTHETIC provenance');

  const allArtifacts = await pilotRealWorldEvidenceService.listArtifacts(site.siteId);
  assert(allArtifacts.length >= 2, 'Multiple RWE artifacts persisted');

  // ----------------------------------------------------------------
  // 10. Governed Pilot Report Generation & Expansion Gate
  // ----------------------------------------------------------------
  console.log('\n--- 10. Governed Pilot Reports & Multi-Factorial Decisions ---');
  const siteReport = await pilotReportService.generateSitePilotReport(
    site.siteId,
    'Dr. Amani (Safety Lead)'
  );
  assert(siteReport.softwareVersion === '23.0.0', 'Report captures exact software version 23.0.0');
  assert(siteReport.disclaimers.length >= 3, 'Mandatory clinical efficacy disclaimers included');
  assert(siteReport.aiGovernanceSummary.autonomousMutationsAttempted === 0, 'HARD INVARIANT: Zero autonomous mutations documented');
  assert(siteReport.reportHash.startsWith('sha256_'), 'Site report sealed with SHA-256 hash');

  const programReport = await pilotReportService.generateProgramLevelReport(
    program.programId,
    'Sister Grace (Program Director)'
  );
  assert(programReport.totalSites >= 1, 'Program report compiles across pilot facilities');
  assert(programReport.totalOfflineHours > 0, 'Program captures aggregated offline resilience hours');

  // ----------------------------------------------------------------
  // 11. RBAC & Separation of Duties
  // ----------------------------------------------------------------
  console.log('\n--- 11. RBAC & Separation of Duties ---');
  assert(hasCapability('pilot_operations_director', 'pilot.program.manage'), 'pilot_operations_director has pilot.program.manage');
  assert(hasCapability('pilot_operations_director', 'pilot.golive.approve'), 'pilot_operations_director has pilot.golive.approve');
  assert(hasCapability('pilot_operations_director', 'pilot.killswitch.execute'), 'pilot_operations_director has pilot.killswitch.execute');
  assert(hasCapability('pilot_site_coordinator', 'pilot.site.assess'), 'pilot_site_coordinator has pilot.site.assess');
  assert(hasCapability('clinical_safety_officer', 'pilot.killswitch.execute'), 'clinical_safety_officer has pilot.killswitch.execute');
  assert(hasCapability('clinical_safety_officer', 'pilot.golive.approve'), 'clinical_safety_officer has pilot.golive.approve');

  // Least privilege restrictions: Clinical users cannot unilaterally approve go-live or execute kill switches
  assert(!hasCapability('physician', 'pilot.golive.approve'), 'physician CANNOT approve pilot go-live');
  assert(!hasCapability('physician', 'pilot.killswitch.execute'), 'physician CANNOT execute pilot kill switch');
  assert(!hasCapability('nurse', 'pilot.golive.approve'), 'nurse CANNOT approve pilot go-live');

  // ----------------------------------------------------------------
  // 12. All 320 IndexedDB Stores Persistence & Schema Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 12. All 320 IndexedDB Stores Schema & Persistence ---');
  assert(ALL_STORE_NAMES.length >= 320, `ALL_STORE_NAMES contains at least 320 stores including all V23 stores (actual: ${ALL_STORE_NAMES.length})`);

  // Verify durable persistence in V23 stores
  await idbEngine.put('pilotPrograms', program);
  const fetchedProg = await idbEngine.get('pilotPrograms', program.programId);
  assert(fetchedProg !== undefined, 'Durable persistence verified in pilotPrograms store');

  await idbEngine.put('pilotSites', site);
  const fetchedSite = await idbEngine.get('pilotSites', site.siteId);
  assert(fetchedSite !== undefined, 'Durable persistence verified in pilotSites store');

  await idbEngine.put('pilotGoLiveGates', goLiveGate);
  const fetchedGate = await idbEngine.get('pilotGoLiveGates', goLiveGate.gateId);
  assert(fetchedGate !== undefined, 'Durable persistence verified in pilotGoLiveGates store');

  await idbEngine.put('pilotEvidenceArtifacts', rweObserved);
  const fetchedRwe = await idbEngine.get('pilotEvidenceArtifacts', rweObserved.artifactId);
  assert(fetchedRwe !== undefined, 'Durable persistence verified in pilotEvidenceArtifacts store');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V23 TESTS PASSED: ${assertionsPassed} assertions verified`);
  console.log('================================================================\n');
}

runV23ControlledPilotTests().catch((e) => {
  console.error('V23 Test Suite Failed:', e);
  process.exit(1);
});
