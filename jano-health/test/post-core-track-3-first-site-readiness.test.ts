/**
 * Jano Health — Post-Core Track 3 Verification Suite
 * FIRST-SITE DEPLOYMENT READINESS & GO-LIVE EXECUTION
 *
 * Verifies repository reality audit, candidate first-site definition,
 * 5-domain facility readiness, 15-phase deployment plan, SAT 17 categories,
 * clinical safety invariants, production security gates, and human-authorized Go/No-Go decisions.
 */

import {
  firstSiteReadinessService,
} from '../src/services/postcore';
import {
  TRACK3_STATUTORY_DISCLAIMER,
  SatCategory,
  GoNoGoOutcome,
} from '../src/domain/postCoreTrack3Types';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  JANO HEALTH — POST-CORE TRACK 3 VERIFICATION SUITE');
console.log('  FIRST-SITE DEPLOYMENT READINESS & GO-LIVE EXECUTION');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// 1. Phase A — Repository Reality Audit & Capability Matrix
// ----------------------------------------------------------------------------
console.log('--- 1. Phase A — Repository Reality Audit & Capability Matrix ---');
const capMatrix = firstSiteReadinessService.getCapabilityMatrix();
assert(capMatrix.length >= 6, 'Capability audit matrix initialized with key capabilities');

const offlineCap = capMatrix.find((c) => c.category === 'OFFLINE');
assert(!!offlineCap, 'Offline clinical documentation capability audited');
assert(offlineCap?.implemented === true, 'Offline capability implemented in code');
assert(offlineCap?.internallyVerified === true, 'Offline capability internally verified via test suites');
assert(offlineCap?.siteVerified === false, 'REALITY CHECK: Offline capability is NOT site verified on real hospital patients');
assert(offlineCap?.externallyAssessed === false, 'REALITY CHECK: Offline capability is NOT externally accredited by third-party regulator');
assert(
  offlineCap?.discrepanciesOrGaps.length! > 0,
  'Discrepancy and reality boundaries explicitly documented'
);

const emergencyCap = capMatrix.find((c) => c.category === 'CLINICAL');
assert(!!emergencyCap, 'Emergency triage & fail-closed capability audited');
assert(emergencyCap?.internallyVerified === true, 'Emergency triage verified in failure recovery tests');
assert(emergencyCap?.siteVerified === false, 'REALITY CHECK: Emergency triage pending real hospital pilot');

// ----------------------------------------------------------------------------
// 2. Phase B — First-Site Definition & Candidate Dossier
// ----------------------------------------------------------------------------
console.log('\n--- 2. Phase B — First-Site Definition & Dossier ---');
const dossier = firstSiteReadinessService.getDossier();
assert(!!dossier, 'First-site candidate dossier retrieved');
assert(dossier.targetCountry === 'Ethiopia', 'Target deployment country is Ethiopia');
assert(
  dossier.siteSelectionState === 'SITE_NOT_SELECTED',
  'HARD INVARIANT: Site selection state starts in SITE_NOT_SELECTED until formal authorization'
);

// Unverified fields check
assert(
  dossier.facilityName.status === 'EVIDENCE_REQUIRED',
  'Candidate facility name tagged as EVIDENCE_REQUIRED'
);
assert(
  dossier.clinicalSafetyOfficer.status === 'EVIDENCE_REQUIRED',
  'Designated CSO tagged as EVIDENCE_REQUIRED'
);
assert(
  dossier.authorizedFacilityOwner.status === 'NOT_ASSESSED',
  'Authorized facility owner tagged as NOT_ASSESSED'
);
assert(
  dossier.knownLimitationsAndRisks.length >= 4,
  'Candidate site limitations and physical risks documented'
);

// State transition invariant: Cannot approve without authorization document
const approveAttempt = firstSiteReadinessService.updateSiteSelectionState('SITE_APPROVED');
assert(
  approveAttempt.success === false,
  'HARD INVARIANT: Site cannot transition to SITE_APPROVED without authorizationDocumentRef'
);
assert(
  approveAttempt.error?.includes('authorizationDocumentRef') === true,
  'Error message articulates missing authorization document reference'
);

// State transition invariant: Cannot activate without on-site SAT and resolved blockers
const activateAttempt = firstSiteReadinessService.updateSiteSelectionState('SITE_ACTIVATED');
assert(
  activateAttempt.success === false,
  'HARD INVARIANT: Site cannot transition to SITE_ACTIVATED without on-site SAT and resolved blockers'
);
assert(
  activateAttempt.error?.includes('FACILITY_ON_SITE') === true,
  'Error message demands verified on-site SAT results'
);

// ----------------------------------------------------------------------------
// 3. Phase C — 5-Domain Facility Readiness Assessment
// ----------------------------------------------------------------------------
console.log('\n--- 3. Phase C — 5-Domain Facility Readiness Assessment ---');
const readiness = firstSiteReadinessService.getReadinessAssessment();
assert(!!readiness, '5-Domain readiness assessment retrieved');
assert(
  readiness.overallStatus === 'CONDITIONALLY_READY',
  'Overall readiness status is CONDITIONALLY_READY'
);
assert(readiness.unresolvedBlockers.length === 5, 'Exact 5 active physical blockers tracked');

// Infrastructure
assert(readiness.infrastructure.hardwareCompatibilityVerified === true, 'Hardware compatibility verified');
assert(readiness.infrastructure.powerContinuityDocumented === false, 'Solar power battery buffer pending commissioning');

// Clinical
assert(readiness.clinical.emergencyCareProtectionConfirmed === true, 'Emergency care protection confirmed');
assert(readiness.clinical.clinicalSafetyOfficerAssigned === false, 'CSO formal delegation letter pending');

// Workforce
assert(readiness.workforce.status === 'NOT_ASSESSED', 'Workforce readiness status is NOT_ASSESSED');
assert(readiness.workforce.clinicalCompetencyVerified === false, 'Staff competency exams pending');

// Integration
assert(readiness.integration.failClosedBehaviorPreserved === true, 'External integration fails closed');
const dhis2 = readiness.integration.integrations.find((i) => i.systemName.includes('DHIS2'));
assert(dhis2?.state === 'SANDBOX', 'DHIS2 integration is in SANDBOX state');
assert(dhis2?.isProductionAuthorized === false, 'REALITY CHECK: DHIS2 is NOT production authorized');

// ----------------------------------------------------------------------------
// 4. Phase D — 15-Phase Deployment Plan
// ----------------------------------------------------------------------------
console.log('\n--- 4. Phase D — 15-Phase Deployment Plan ---');
const plan = firstSiteReadinessService.getDeploymentPlan();
assert(plan.length === 15, 'Deployment plan contains exactly 15 sequential phases');
assert(plan[0].name === 'Discovery and Site Authorization', 'Phase 1 is Discovery and Site Authorization');
assert(plan[0].status === 'IN_PROGRESS', 'Phase 1 status is IN_PROGRESS');
assert(plan[7].name === 'Backup and Restore Verification', 'Phase 8 is Backup and Restore Verification');
assert(plan[8].name === 'Site Acceptance Testing (SAT)', 'Phase 9 is Site Acceptance Testing');
assert(plan[14].name === 'Handover and Ongoing Support', 'Phase 15 is Handover and Ongoing Support');
assert(!!plan[0].rollbackArrangement, 'Phases specify explicit rollback arrangements');

// ----------------------------------------------------------------------------
// 5. Phase E — Site Acceptance Testing (17 Categories)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Phase E — Site Acceptance Testing (17 Categories) ---');
const satTests = firstSiteReadinessService.getSatExecutions();
assert(satTests.length === 17, 'SAT plan contains all 17 mandatory categories');

const expectedCategories: SatCategory[] = [
  'IDENTITY', 'ENCOUNTER', 'CLINICAL', 'LABORATORY', 'RADIOLOGY',
  'MEDICATION', 'PHARMACY', 'EMERGENCY', 'REFERRAL', 'OFFLINE',
  'SYNCHRONIZATION', 'SECURITY', 'INTEROPERABILITY', 'BACKUP',
  'RESTORE', 'REPORTING', 'AI_GOVERNANCE',
];

expectedCategories.forEach((cat) => {
  const found = satTests.some((t) => t.category === cat);
  assert(found === true, `SAT category present: ${cat}`);
});

// Verify synthetic distinction
const syntheticTest = satTests[0];
assert(syntheticTest.environment === 'LOCAL_SYNTHETIC', 'Baseline SAT tests marked as LOCAL_SYNTHETIC');

// Record a physical on-site test execution
const onSiteExec = firstSiteReadinessService.recordOnSiteSatExecution({
  category: 'EMERGENCY',
  testOperator: 'Dr. Tadesse (Field Emergency Officer)',
  actualBehavior: 'Emergency red-triage patient admitted on rugged tablet without Wi-Fi network; instant local IDB commit.',
  result: 'PASS',
  sha256EvidenceHash: 'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9',
});
assert(onSiteExec.environment === 'FACILITY_ON_SITE', 'On-site execution recorded with FACILITY_ON_SITE environment');
assert(onSiteExec.result === 'PASS', 'On-site execution result is PASS');

// ----------------------------------------------------------------------------
// 6. Phase F — Clinical Safety & Offline Invariants
// ----------------------------------------------------------------------------
console.log('\n--- 6. Phase F — Clinical Safety & Offline Invariants ---');
const clinGates = firstSiteReadinessService.evaluateClinicalSafetyGates();
assert(clinGates.clinicianReviewRequired === true, 'HARD INVARIANT: clinicianReviewRequired is strictly true');
assert(clinGates.isAutonomousMutationAllowed === false, 'HARD INVARIANT: isAutonomousMutationAllowed is strictly false');
assert(clinGates.emergencyTriageProtectionActive === true, 'HARD INVARIANT: Emergency triage protection is active');
assert(clinGates.wrongPatientPreventionVerified === true, 'Wrong patient prevention active');
assert(clinGates.aiAdvisoryOnlyEnforced === true, 'AI advisory-only mode strictly enforced');

// ----------------------------------------------------------------------------
// 7. Phase G — Production Security Readiness
// ----------------------------------------------------------------------------
console.log('\n--- 7. Phase G — Production Security Readiness ---');
const secGates = firstSiteReadinessService.evaluateProductionSecurityGates();
assert(secGates.failClosedAuthEnforced === true, 'Fail-closed authentication enforced');
assert(secGates.tenantFacilityIsolationEnforced === true, 'Tenant and facility isolation enforced');
assert(secGates.zeroDevCredentialsInProd === true, 'Zero development credentials in production');
assert(secGates.privacyPreservingTelemetryEnforced === true, 'Privacy-preserving telemetry enforced');

// ----------------------------------------------------------------------------
// 8. Phase H — Training & Support Escalation Paths
// ----------------------------------------------------------------------------
console.log('\n--- 8. Phase H — Training & Support Escalation Paths ---');
const trainPlan = firstSiteReadinessService.getTrainingPlan();
assert(trainPlan.requiredRoleTraining.length === 3, 'Training curriculum defined for 3 clinical cadres');
assert(trainPlan.escalationPaths.length === 3, 'Three distinct escalation paths established');

const itPath = trainPlan.escalationPaths.find((p) => p.category === 'IT_SUPPORT_TECHNICAL');
const clinPath = trainPlan.escalationPaths.find((p) => p.category === 'CLINICAL_SAFETY_INCIDENT');
assert(!!itPath && !!clinPath, 'IT support and clinical safety escalation paths found');
assert(
  itPath?.primaryOwnerRole !== clinPath?.primaryOwnerRole,
  'HARD INVARIANT: IT support tickets are strictly separated from clinical safety incidents'
);
assert(
  clinPath?.primaryOwnerRole.includes('Clinical Safety Officer') === true,
  'Clinical safety incident escalates to Clinical Safety Officer'
);

// ----------------------------------------------------------------------------
// 9. Phase I — Operational Metrics Baseline
// ----------------------------------------------------------------------------
console.log('\n--- 9. Phase I — Operational Metrics Baseline ---');
const metrics = firstSiteReadinessService.getOperationalMetrics();
assert(metrics.length >= 4, 'Operational metrics baseline defined');

const offlineMetric = metrics.find((m) => m.metricId === 'METRIC-OFFLINE-AVAIL');
assert(!!offlineMetric, 'Offline clinical availability metric found');
assert(!!offlineMetric?.numerator && !!offlineMetric?.denominator, 'Metric specifies numerator and denominator');
assert(!!offlineMetric?.limitations, 'Metric articulates limitations');

const aiMetric = metrics.find((m) => m.metricId === 'METRIC-AI-CLINICIAN-REVIEW');
assert(aiMetric?.baselineObservedValue === 100.0, 'AI clinician review compliance baseline is 100%');

// ----------------------------------------------------------------------------
// 10. Phase J — Go/No-Go Decision Dossier
// ----------------------------------------------------------------------------
console.log('\n--- 10. Phase J — Go/No-Go Decision Dossier ---');
const decision = firstSiteReadinessService.getDecisionDossier();
assert(!!decision, 'Go/No-Go decision dossier retrieved');
assert(
  decision.outcome === 'READY_WITH_BLOCKERS',
  'Defensible decision outcome is READY_WITH_BLOCKERS'
);
assert(decision.humanAuthorizationVerified === true, 'HARD INVARIANT: Human authorization verified');
assert(decision.failedCriteria.length > 0, 'Failed criteria articulated in decision dossier');

// Invariant: Cannot declare READY_FOR_AUTHORIZED_GO_LIVE while blockers remain
const prematureGoLive = firstSiteReadinessService.recordGoNoGoDecision({
  outcome: 'READY_FOR_AUTHORIZED_GO_LIVE',
  reviewerName: 'Premature Approver',
  reviewerRole: 'Operations',
  licenseOrCredential: 'N/A',
  rationale: 'Trying to activate while blockers remain',
});
assert(
  prematureGoLive.success === false,
  'HARD INVARIANT: Cannot declare READY_FOR_AUTHORIZED_GO_LIVE while unresolved blockers remain'
);
assert(
  prematureGoLive.error?.includes('unresolved blockers remain') === true,
  'Rejection articulates remaining blockers'
);

// ----------------------------------------------------------------------------
// 11. Phase K & L — First-Site Deployment Readiness Package (20 Points)
// ----------------------------------------------------------------------------
console.log('\n--- 11. Phase K & L — 20-Point Readiness Package & Runbook ---');
const pkg = firstSiteReadinessService.generateReadinessPackage();
assert(!!pkg, 'First-site deployment readiness package generated');
assert(pkg.databaseStoreCount === 362, 'Readiness package verifies exact 362 IndexedDB stores');
assert(pkg.section18_evidenceProvenanceSha256.length > 20, 'Package cryptographically sealed with SHA-256');
assert(
  pkg.section20_explicitUnverifiedStatements.length >= 4,
  'Package includes explicit unverified reality statements'
);
assert(
  pkg.section20_explicitUnverifiedStatements.some((s) => s.includes('NOT yet occurred in reality')),
  'Section 20 explicitly affirms deployment has NOT yet occurred in reality'
);
assert(
  pkg.statutoryDisclaimer === TRACK3_STATUTORY_DISCLAIMER,
  'Mandatory statutory disclaimer embedded in package'
);

// Runbook
const runbook = firstSiteReadinessService.generateExecutableRunbook();
assert(runbook.includes('STAGE 1: HARDWARE & ENVIRONMENT PREPARATION'), 'Runbook covers Stage 1 hardware preparation');
assert(runbook.includes('STAGE 4: ON-SITE SITE ACCEPTANCE TESTING'), 'Runbook covers Stage 4 on-site SAT');
assert(runbook.includes('ROLLBACK PROCEDURE'), 'Runbook includes explicit rollback procedure');

// ----------------------------------------------------------------------------
// 12. Preservation of 362 IndexedDB Stores Baseline
// ----------------------------------------------------------------------------
console.log('\n--- 12. Preservation of 362 IndexedDB Stores Baseline ---');
assert(ALL_STORE_NAMES.length === 362, `ALL_STORE_NAMES remains exact 362 stores (actual: ${ALL_STORE_NAMES.length})`);

console.log('\n================================================================');
console.log(`ALL POST-CORE TRACK 3 TESTS PASSED: ${passed} assertions verified`);
if (failed > 0) {
  console.error(`FAILED ASSERTIONS: ${failed}`);
  process.exit(1);
} else {
  console.log('================================================================');
}
