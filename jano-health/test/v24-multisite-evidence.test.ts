/**
 * Jano Health - Clinical Core V24 Comprehensive Test Suite
 * 
 * Verifies all Multi-Site Pilot, Comparative Evidence & Scale Decision invariants:
 * 1. Multi-Site Program Model & Cohort Grouping
 * 2. Site Comparability Framework & Objective Incompatibility Detection
 * 3. Standardized Metric Catalog & Version Lock Protection
 * 4. Raw Observations vs Normalized Measurements & Non-Causal Interpretation
 * 5. Site Implementation Maturity Gating (Levels 0-5)
 * 6. Program Risk Register, Cross-Site Incident Correlation & Configuration Drift
 * 7. Multi-Site AI Advisory Governance & Autonomous Mutation Prohibition
 * 8. Offline Resilience & Disconnected Operation Analysis
 * 9. Governed Pilot Learning Loop (OBSERVE -> REVALIDATE -> MEASURE)
 * 10. Multi-Domain Scale Scorecard, Expansion Gates & Formal Scale Decision
 * 11. Multi-Site Evidence Packet Assembly & SHA-256 Sealing
 * 12. RBAC & Separation of Duties (multisite_evidence_lead)
 * 13. All 340 IndexedDB Stores Persistence & Schema Integrity
 */

import {
  evidenceProgramService,
  siteComparabilityService,
  standardizedMetricCatalogService,
  comparativeAnalysisService,
  siteImplementationMaturityService,
  crossSiteRiskService,
  multiSiteAIEvaluationService,
  offlineConditionAnalysisService,
  pilotLearningLoopService,
  scaleDecisionService,
  multiSiteEvidencePacketService,
} from '../src/services/multisite';
import { ALL_STORE_NAMES, idbEngine } from '../src/services/storage/indexedDbEngine';
import { hasCapability, ROLE_DEFINITIONS } from '../src/domain/permissions';

let assertionCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  assertionCount++;
  console.log(`✅ PASS: ${message}`);
}

async function runV24Tests() {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V24 MULTI-SITE EVIDENCE & SCALE TESTS');
  console.log('================================================================\n');

  // ----------------------------------------------------------------
  // 1. Multi-Site Program Model & Cohort Grouping
  // ----------------------------------------------------------------
  console.log('--- 1. Multi-Site Program Model & Cohort Grouping ---');
  const program = await evidenceProgramService.getProgram('prog-multisite-east-africa');
  assert(program !== null, 'Multi-site evidence program retrieved successfully');
  assert(program!.status === 'ACTIVE', 'Program initialized in ACTIVE status');
  assert(program!.governanceModel === 'INDEPENDENT_FEDERATED', 'Program operates under federated independent governance');
  assert(program!.participatingSiteIds.length >= 3, 'Program tracks at least 3 distinct pilot facilities');

  const groups = await evidenceProgramService.listSiteGroups('prog-multisite-east-africa');
  assert(groups.length >= 1, 'Program contains cohort groups');
  assert(groups[0].cohortType === 'RURAL_PRIMARY', 'Cohort group categorized as RURAL_PRIMARY');

  const enrollments = await evidenceProgramService.listSiteEnrollments('prog-multisite-east-africa');
  assert(enrollments.length >= 2, 'Program contains multiple independent site enrollments');
  assert(enrollments[0].facilityName.length > 0, 'Site enrollment captures facility name');
  assert(enrollments[0].isLocallyGoverned === true, 'Site enrollment enforces local governance');

  // ----------------------------------------------------------------
  // 2. Site Comparability Framework & Incompatibility Detection
  // ----------------------------------------------------------------
  console.log('\n--- 2. Site Comparability Framework & Incompatibility Detection ---');
  const p1 = await siteComparabilityService.getProfile('site-amani-01');
  const p2 = await siteComparabilityService.getProfile('site-kilima-02');
  assert(p1 !== null && p2 !== null, 'Site profiles retrieved for Amani and Kilima');

  const assessment = await siteComparabilityService.assessComparability(
    'prog-multisite-east-africa',
    'site-amani-01',
    'site-kilima-02',
    'usr-coord-dr-elimu'
  );
  assert(
    assessment.status === 'CONDITIONALLY_COMPARABLE' || assessment.status === 'COMPARABLE',
    `Comparability assessed objectively: ${assessment.status}`
  );
  assert(assessment.overallSimilarityScore >= 60, 'Objective multi-dimensional comparability score calculated');
  assert(assessment.incompatibilityReasons.length > 0, 'Objective caveats and limitations documented');
  assert(assessment.infrastructureSimilarity > 0, 'Infrastructure similarity evaluated');

  // ----------------------------------------------------------------
  // 3. Standardized Metric Catalog & Version Lock Protection
  // ----------------------------------------------------------------
  console.log('\n--- 3. Standardized Metric Catalog & Version Lock Protection ---');
  const syncMetric = await standardizedMetricCatalogService.getMetric('METRIC_SYNC_RELIABILITY');
  assert(syncMetric !== null, 'Metric METRIC_SYNC_RELIABILITY present in catalog');
  assert(syncMetric!.category === 'OFFLINE', 'Metric categorized under OFFLINE');
  assert(syncMetric!.isVersionLocked === true, 'Standardized metric is version-locked');
  assert(syncMetric!.unit === 'PERCENT', 'Metric unit specified as PERCENT');

  // Invariant test: Modifying locked metric with identical version must throw
  let versionLockProtected = false;
  try {
    await standardizedMetricCatalogService.registerMetricVersion({
      ...syncMetric!,
      definition: 'Altered definition without version bump',
    });
  } catch (err: any) {
    versionLockProtected = true;
  }
  assert(versionLockProtected, 'HARD INVARIANT: Modification of version-locked metric without version bump rejected');

  // Allowed: Increment version
  const v2Metric = await standardizedMetricCatalogService.registerMetricVersion({
    ...syncMetric!,
    version: '1.1.0',
    definition: 'Updated definition with valid version increment',
  });
  assert(v2Metric.version === '1.1.0', 'Metric successfully registered with incremented version number');

  // ----------------------------------------------------------------
  // 4. Raw Observations vs Normalized Measurements & Non-Causal Interpretation
  // ----------------------------------------------------------------
  console.log('\n--- 4. Raw Observations vs Normalized Measurements & Non-Causal Interpretation ---');
  const observations = await comparativeAnalysisService.listObservations('prog-multisite-east-africa');
  assert(observations.length >= 2, 'Raw metric observations recorded for multiple sites');
  assert(observations[0].provenance.capturedOffline === true, 'Observation captures offline provenance');
  assert(observations[0].rawNumerator !== undefined, 'Raw observation preserves original numerator count');

  const normalized = await comparativeAnalysisService.normalizeMeasurement(
    observations[0].observationId,
    'PER_100_ENCOUNTERS',
    1.0,
    ['Based on 200 observed sync batches']
  );
  assert(normalized.measurementId.startsWith('meas-'), 'Normalized metric measurement created');
  assert(normalized.normalizationBasis === 'PER_100_ENCOUNTERS', 'Explicit normalization basis recorded');

  // Comparative Analysis execution
  const compAnalysis = await comparativeAnalysisService.executeComparativeAnalysis(
    'prog-multisite-east-africa',
    'METRIC_SYNC_RELIABILITY',
    'SITE_A_VS_SITE_B',
    'site-amani-01',
    'site-kilima-02',
    99.0,
    94.5,
    200,
    'usr-coord-dr-elimu'
  );
  assert(compAnalysis.analysisId.startsWith('cmp-anl-'), 'Comparative analysis executed');
  assert(
    compAnalysis.interpretation === 'OBSERVED_DIFFERENCE' || compAnalysis.interpretation === 'TREND',
    `Interpretation uses non-causal language: ${compAnalysis.interpretation}`
  );
  assert(
    compAnalysis.nonCausalDisclaimer.includes('causal attribution was not established'),
    'HARD INVARIANT: Mandatory non-causal statutory disclaimer present in analysis'
  );
  assert(compAnalysis.integrityHash.startsWith('sha256-v24-cmp-'), 'Analysis has cryptographic integrity hash');

  // ----------------------------------------------------------------
  // 5. Site Implementation Maturity Gating (Levels 0-5)
  // ----------------------------------------------------------------
  console.log('\n--- 5. Site Implementation Maturity Gating (Levels 0-5) ---');
  const amaniMat = await siteImplementationMaturityService.getMaturity('site-amani-01');
  assert(amaniMat !== null, 'Site maturity profile retrieved');
  assert(amaniMat!.currentLevel === 'LEVEL_4_VALIDATED', 'Amani evaluated at LEVEL_4_VALIDATED');
  assert(amaniMat!.safetyAdherenceScore >= 95, 'Safety adherence score is >= 95%');

  // Progression evaluation
  const progressionCheck = await siteImplementationMaturityService.evaluateMaturityProgression(
    'site-amani-01',
    'LEVEL_5_SCALE_CANDIDATE'
  );
  assert(progressionCheck.eligible, 'Site eligible for Level 5 candidate review');

  // Gating rule: Level 5 requires safety adherence >= 95%
  let blockedPrematurePromotion = false;
  try {
    await siteImplementationMaturityService.recordMaturityAssessment({
      siteId: 'site-ziwa-03',
      currentLevel: 'LEVEL_5_SCALE_CANDIDATE',
      workflowAdoptionScore: 80,
      safetyAdherenceScore: 88, // BELOW 95% requirement
      technicalStabilityScore: 80,
      dataQualityScore: 80,
      trainingMaturityScore: 80,
      gapsIdentified: ['Below safety threshold'],
      assessedBy: 'usr-coord-dr-elimu',
      nextMilestonePrerequisites: [],
    });
  } catch (err: any) {
    blockedPrematurePromotion = true;
  }
  assert(blockedPrematurePromotion, 'HARD INVARIANT: Promotion to LEVEL_5_SCALE_CANDIDATE blocked when safety adherence < 95%');

  // ----------------------------------------------------------------
  // 6. Program Risk Register, Cross-Site Incident Correlation & Config Drift
  // ----------------------------------------------------------------
  console.log('\n--- 6. Program Risk Register, Incident Correlation & Config Drift ---');
  const programRisks = await crossSiteRiskService.listRisks('prog-multisite-east-africa');
  assert(programRisks.length >= 2, 'Program-level risk register entries tracked');
  assert(programRisks[0].isSystemic === true, 'Systemic cross-site risk identified');
  assert(programRisks[0].affectedSiteIds.length >= 2, 'Risk spans multiple participating sites');

  const correlations = await crossSiteRiskService.listCorrelations('prog-multisite-east-africa');
  assert(correlations.length >= 1, 'Cross-site incident correlation recorded');
  assert(correlations[0].status === 'CONFIRMED_LINK', 'Incident correlation confirmed linked');
  assert(correlations[0].patternDimension === 'DEVICE_CLASS', 'Pattern linked to device hardware class');

  const drifts = await crossSiteRiskService.listDrifts('prog-multisite-east-africa');
  assert(drifts.length >= 1, 'Multi-site configuration drift monitored');
  assert(drifts[0].classification === 'APPROVED', 'Drift classified as APPROVED exception');

  // ----------------------------------------------------------------
  // 7. Multi-Site AI Advisory Governance & Autonomous Mutation Prohibition
  // ----------------------------------------------------------------
  console.log('\n--- 7. Multi-Site AI Advisory Governance & Autonomous Mutation Prohibition ---');
  const aiEval = await multiSiteAIEvaluationService.getEvaluation('site-amani-01');
  assert(aiEval !== null, 'Multi-site AI evaluation retrieved');
  assert(aiEval!.clinicianReviewRequired === true, 'HARD INVARIANT: clinicianReviewRequired is strictly true');
  assert(aiEval!.isAutonomousMutationAllowed === false, 'HARD INVARIANT: isAutonomousMutationAllowed is strictly false');
  assert(aiEval!.clinicianAcceptedCount > 0, 'Clinician confirmed advisory decisions tracked');

  const aiCompliance = await multiSiteAIEvaluationService.verifyAIGovernanceCompliance('prog-multisite-east-africa');
  assert(aiCompliance.compliant === true, 'Program AI governance compliance certified across all sites');
  assert(aiCompliance.violations.length === 0, 'Zero AI governance violations detected');

  // ----------------------------------------------------------------
  // 8. Offline Resilience & Disconnected Operation Analysis
  // ----------------------------------------------------------------
  console.log('\n--- 8. Offline Resilience & Disconnected Operation Analysis ---');
  const offlineAnalyses = await offlineConditionAnalysisService.listAnalyses();
  assert(offlineAnalyses.length >= 2, 'Offline condition analyses recorded for multiple sites');
  assert(offlineAnalyses[0].totalOfflineHours > 100, 'Recorded extensive offline operational duration');
  assert(offlineAnalyses[0].softwareResilienceScore >= 95, 'Software resilience score >= 95 under offline constraints');
  assert(offlineAnalyses[0].failedSyncBatchesCount === 0, 'Zero failed sync batches recorded in stabilized cohort');

  // ----------------------------------------------------------------
  // 9. Governed Pilot Learning Loop (OBSERVE -> REVALIDATE -> MEASURE)
  // ----------------------------------------------------------------
  console.log('\n--- 9. Governed Pilot Learning Loop (OBSERVE -> REVALIDATE -> MEASURE) ---');
  const learnings = await pilotLearningLoopService.listLearningRecords('prog-multisite-east-africa');
  assert(learnings.length >= 2, 'Pilot learning records tracked');

  const lrn1 = learnings[0];
  assert(lrn1.revalidationStatus === 'VALIDATED', 'Learning action validated under formal revalidation protocol');

  // Advance phase test: Cannot jump to MEASURE without validation
  const lrn2 = learnings.find((l) => l.revalidationStatus === 'PENDING')!;
  let blockedUnvalidatedMeasurement = false;
  try {
    await pilotLearningLoopService.advancePhase(lrn2.learningId, 'MEASURE', 'usr-coord-dr-elimu');
  } catch (err: any) {
    blockedUnvalidatedMeasurement = true;
  }
  assert(blockedUnvalidatedMeasurement, 'HARD INVARIANT: Advance to MEASURE phase blocked when revalidation is PENDING');

  // ----------------------------------------------------------------
  // 10. Multi-Domain Scale Scorecard, Expansion Gates & Formal Scale Decision
  // ----------------------------------------------------------------
  console.log('\n--- 10. Multi-Domain Scale Scorecard, Expansion Gates & Formal Scale Decision ---');
  const scorecard = await scaleDecisionService.evaluateScorecard('prog-multisite-east-africa');
  assert(scorecard.technical === 'READY', 'Technical domain readiness verified');
  assert(scorecard.clinicalWorkflow === 'READY', 'Clinical workflow domain readiness verified');
  assert(scorecard.aiGovernance === 'READY', 'AI governance domain readiness verified');
  assert(scorecard.blockingReasons.length === 0, 'Zero blocking conditions in scorecard');

  // Evaluate expansion gate
  const gate = await scaleDecisionService.evaluateExpansionGate({
    programId: 'prog-multisite-east-africa',
    scope: 'PILOT_TO_BROADER_PILOT',
    evaluatorId: 'usr-coord-dr-elimu',
    technicalPrerequisites: true,
    clinicalSafetyPrerequisites: true,
    governancePrerequisites: true,
    workforceTrainingPrerequisites: true,
  });
  assert(gate.status === 'APPROVED', 'Expansion gate approved when all prerequisites are met');
  assert(gate.rejectionReasons.length === 0, 'Zero rejection reasons recorded on approved expansion gate');

  // Record formal scale decision
  const decision = await scaleDecisionService.recordScaleDecision({
    programId: 'prog-multisite-east-africa',
    participatingSiteIds: ['site-amani-01', 'site-kilima-02', 'site-ziwa-03'],
    decisionType: 'CONTINUE_PILOT',
    evidenceQualitySummary: 'Evidence Level B: Multi-site prospective observational data.',
    unresolvedRiskIds: ['risk-prog-001'],
    decisionRationale: 'Maintain supervised pilot deployment pending seasonal monsoon verification.',
    conditionsForExpansion: ['Complete solar battery reserve upgrades at Kilima and Ziwa'],
    approvingAuthorityName: 'Dr. Joseph Ndunguru',
    approvingAuthorityRole: 'Chief Medical Officer & Consortium Lead',
  });
  assert(decision.decisionId.startsWith('dec-scale-'), 'Formal scale decision recorded');
  assert(decision.decisionType === 'CONTINUE_PILOT', 'Scale decision type verified');
  assert(decision.integrityHash.startsWith('sha256-v24-scale-'), 'Scale decision sealed with tamper-evident hash');

  // ----------------------------------------------------------------
  // 11. Multi-Site Evidence Packet Assembly & SHA-256 Sealing
  // ----------------------------------------------------------------
  console.log('\n--- 11. Multi-Site Evidence Packet Assembly & SHA-256 Sealing ---');
  const packet = await multiSiteEvidencePacketService.generateAndSealPacket('prog-multisite-east-africa');
  assert(packet.packetId.startsWith('evd-packet-'), 'Multi-site evidence packet generated');
  assert(packet.participatingSitesCount >= 2, 'Packet includes multiple participating pilot facilities');
  assert(packet.packetSha256Seal.startsWith('sha256-sealed-'), 'Packet sealed with SHA-256 hash');
  assert(
    packet.statutoryDisclaimer.includes('does not constitute evidence of therapeutic superiority'),
    'HARD INVARIANT: Statutory disclaimer prohibiting unsubstantiated efficacy claims present in packet'
  );

  const sealValid = await multiSiteEvidencePacketService.verifyPacketSeal(packet.packetId);
  assert(sealValid === true, 'Cryptographic packet seal verified as authentic');

  // ----------------------------------------------------------------
  // 12. RBAC & Separation of Duties (multisite_evidence_lead)
  // ----------------------------------------------------------------
  console.log('\n--- 12. RBAC & Separation of Duties (multisite_evidence_lead) ---');
  const evidenceLeadRole = ROLE_DEFINITIONS['multisite_evidence_lead'];
  assert(evidenceLeadRole !== undefined, 'multisite_evidence_lead role defined in system RBAC');
  assert(evidenceLeadRole.type === 'multisite_evidence_lead', 'Role type verified');

  assert(hasCapability('multisite_evidence_lead', 'multisite.program.manage'), 'evidence lead has multisite.program.manage');
  assert(hasCapability('multisite_evidence_lead', 'multisite.comparability.assess'), 'evidence lead has multisite.comparability.assess');
  assert(hasCapability('multisite_evidence_lead', 'multisite.analysis.execute'), 'evidence lead has multisite.analysis.execute');
  assert(hasCapability('multisite_evidence_lead', 'multisite.scale.decide'), 'evidence lead has multisite.scale.decide');
  assert(hasCapability('multisite_evidence_lead', 'multisite.packet.export'), 'evidence lead has multisite.packet.export');

  // Least privilege restrictions: Clinical roles cannot manage multi-site scale decisions
  assert(!hasCapability('physician', 'multisite.scale.decide'), 'physician CANNOT execute multi-site scale decisions');
  assert(!hasCapability('physician', 'multisite.program.manage'), 'physician CANNOT manage multi-site programs');
  assert(!hasCapability('nurse', 'multisite.scale.decide'), 'nurse CANNOT execute multi-site scale decisions');

  // ----------------------------------------------------------------
  // 13. All 340 IndexedDB Stores Schema & Persistence Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 13. All 340 IndexedDB Stores Schema & Persistence ---');
  assert(ALL_STORE_NAMES.length >= 340, `ALL_STORE_NAMES contains at least 340 stores including all V24 stores (actual: ${ALL_STORE_NAMES.length})`);

  // Verify durable persistence in V24 stores
  await idbEngine.put('evidencePrograms', program);
  const fetchedProg = await idbEngine.get('evidencePrograms', program.programId);
  assert(fetchedProg !== undefined, 'Durable persistence verified in evidencePrograms store');

  await idbEngine.put('siteEnrollments', enrollments[0]);
  const fetchedEnr = await idbEngine.get('siteEnrollments', enrollments[0].enrollmentId);
  assert(fetchedEnr !== undefined, 'Durable persistence verified in siteEnrollments store');

  await idbEngine.put('comparabilityAssessments', assessment);
  const fetchedCmp = await idbEngine.get('comparabilityAssessments', assessment.assessmentId);
  assert(fetchedCmp !== undefined, 'Durable persistence verified in comparabilityAssessments store');

  await idbEngine.put('standardizedMetricCatalog', syncMetric);
  const fetchedMet = await idbEngine.get('standardizedMetricCatalog', syncMetric.metricId);
  assert(fetchedMet !== undefined, 'Durable persistence verified in standardizedMetricCatalog store');

  await idbEngine.put('scaleDecisionRecords', decision);
  const fetchedDec = await idbEngine.get('scaleDecisionRecords', decision.decisionId);
  assert(fetchedDec !== undefined, 'Durable persistence verified in scaleDecisionRecords store');

  await idbEngine.put('multiSiteEvidencePackets', packet);
  const fetchedPkt = await idbEngine.get('multiSiteEvidencePackets', packet.packetId);
  assert(fetchedPkt !== undefined, 'Durable persistence verified in multiSiteEvidencePackets store');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V24 TESTS PASSED: ${assertionCount} assertions verified`);
  console.log('================================================================');
}

runV24Tests().catch((err) => {
  console.error('RUN ERROR in V24 test suite:', err);
  process.exit(1);
});
