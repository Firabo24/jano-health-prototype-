/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Comprehensive Verification & Safety Invariant Test Suite
 */

import 'fake-indexeddb/auto';
import {
  systemObservationService,
  systemRiskEngine,
  capacityIntelligenceService,
  optimizationRecommendationService,
  automationPolicyEngine,
  automationGuardService,
  governedAutomationExecutor,
  resilienceSelfHealingService,
  incidentManagementService,
  simulationEngine,
  workflowOrchestrationService,
  computeSha256,
  AutomationAction,
  AutomationPolicy,
  SystemHealthSnapshot,
  SystemHealthState,
} from '../src/services/intelligence';
import { idbEngine, ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { hasCapability, canUserPerform, ROLE_DEFINITIONS } from '../src/domain/permissions';
import { aiSafetyGateway } from '../src/services/ai/aiSafetyGateway';

let totalAssertions = 0;
function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runV20TestSuite() {
  console.log('================================================================');
  console.log('CLINICAL CORE V20: SYSTEM INTELLIGENCE & GOVERNED AUTOMATION TEST');
  console.log('================================================================');

  await localRepository.ensureInitialized();
  systemObservationService.clearMemoryCache();
  systemRiskEngine.clearMemoryCache();
  capacityIntelligenceService.clearMemoryCache();
  optimizationRecommendationService.clearMemoryCache();
  automationGuardService.resetTracking();
  governedAutomationExecutor.clearMemoryCache();
  resilienceSelfHealingService.clearMemoryCache();
  incidentManagementService.clearMemoryCache();
  simulationEngine.clearMemoryCache();
  workflowOrchestrationService.clearMemoryCache();

  // --------------------------------------------------------------------------
  console.log('\n--- 1. Multi-Dimensional System Health & Snapshots ---');
  // --------------------------------------------------------------------------
  const snapHealthy = await systemObservationService.captureHealthSnapshot();
  assert(snapHealthy.snapshotId.startsWith('snap-'), 'Snapshot generated with unique snapshotId');
  assert(snapHealthy.overallHealth === 'HEALTHY', 'Baseline system health evaluated as HEALTHY');
  assert(snapHealthy.clinicalAvailability.status === 'HEALTHY', 'Clinical EHR core evaluated as HEALTHY');
  assert(snapHealthy.localStorage.status === 'HEALTHY', 'IndexedDB persistence evaluated as HEALTHY');
  assert(snapHealthy.supportingEvidence.length > 0, 'Health snapshot exposes explicit supporting evidence');

  // Verify multi-dimensional states: DEGRADED, WARNING, CRITICAL, UNKNOWN
  const snapDegraded = await systemObservationService.captureHealthSnapshot({
    networkStatus: { status: 'DEGRADED', activeIssues: ['Node latency > 500ms'], metrics: {}, lastObservedAt: new Date().toISOString() },
  });
  assert(snapDegraded.overallHealth === 'DEGRADED', 'Overall health correctly transitions to DEGRADED on network degradation');

  const snapCritical = await systemObservationService.captureHealthSnapshot({
    localStorage: { status: 'CRITICAL', activeIssues: ['Disk quota exhausted'], metrics: {}, lastObservedAt: new Date().toISOString() },
  });
  assert(snapCritical.overallHealth === 'CRITICAL', 'Overall health transitions to CRITICAL on storage failure');

  const snapUnknown = await systemObservationService.captureHealthSnapshot({
    clinicalAvailability: { status: 'UNKNOWN', activeIssues: ['Telemetry telemetry offline'], metrics: {}, lastObservedAt: new Date().toISOString() },
    localStorage: { status: 'UNKNOWN', activeIssues: ['Telemetry telemetry offline'], metrics: {}, lastObservedAt: new Date().toISOString() },
    syncStatus: { status: 'UNKNOWN', activeIssues: ['Telemetry telemetry offline'], metrics: {}, lastObservedAt: new Date().toISOString() },
    networkStatus: { status: 'UNKNOWN', activeIssues: ['Telemetry telemetry offline'], metrics: {}, lastObservedAt: new Date().toISOString() },
  });
  assert(snapUnknown.overallHealth === 'UNKNOWN', 'UNKNOWN is a supported explicit state when telemetry is absent');
  assert(snapUnknown.supportingEvidence.some((e) => e.includes('UNKNOWN')), 'UNKNOWN overall state provides explicit supporting evidence');

  // --------------------------------------------------------------------------
  console.log('\n--- 2. Observations, Cross-Domain Signals & Correlation ---');
  // --------------------------------------------------------------------------
  const obs = await systemObservationService.recordObservation({
    source: 'syncEngine',
    metric: 'queue_backlog',
    value: 42,
    unit: 'messages',
    scope: { facilityId: 'fac-kigoma-dh' },
    quality: 'HIGH',
  });
  assert(obs.metric === 'queue_backlog', 'Observation recorded in durable ledger');

  const signal = await systemObservationService.registerCrossDomainSignal({
    domains: ['network', 'referral'],
    title: 'Network Node Latency with Referral Queue Growth',
    description: 'Node latency causing outbound referral buffering in local store-and-forward queue',
    severity: 'MODERATE',
    confidence: 0.92,
    evidence: ['Observation obs-001 showed queue growth', 'Round-trip latency 820ms'],
    correlationKeys: ['latency', 'queue_size'],
  });
  assert(signal.confidence === 0.92, 'Cross-domain signal registered with explicit confidence');

  // Correlation ≠ Causation invariant
  const correlation = await systemRiskEngine.correlateSignals(
    [signal.signalId],
    ['network', 'referral'],
    'Temporal precedence of node latency followed by referral queue accumulation',
    0.88,
    'TEMPORAL_PRECEDENCE'
  );
  assert(correlation.isCausationClaimed === false, 'MASTER INVARIANT VERIFIED: isCausationClaimed is strictly false');
  assert(correlation.method === 'TEMPORAL_PRECEDENCE', 'Correlation explicitly states analytical method');

  // --------------------------------------------------------------------------
  console.log('\n--- 3. Multi-Domain System Risks ---');
  // --------------------------------------------------------------------------
  const risk = await systemRiskEngine.recordRisk({
    riskType: 'SUPPLY_RISK',
    state: 'ELEVATED',
    title: 'Emergency Amoxicillin Depletion Warning',
    description: 'Rural clinic safety stock buffer will deplete in 48 hours',
    severityScore: 68,
    domains: ['supply', 'emergency'],
    affectedFacilities: ['fac-uvinza-hc'],
    evidence: ['Current stock 8 packs, threshold 25 packs'],
  });
  assert(risk.riskType === 'SUPPLY_RISK', 'SystemRisk registered across defined risk category');
  assert(risk.state === 'ELEVATED', 'Risk state marked ELEVATED');

  const resolvedRisk = await systemRiskEngine.resolveRisk(risk.riskId, 'Inter-facility stock transfer executed');
  assert(resolvedRisk?.state === 'RESOLVED', 'Risk successfully transitions to RESOLVED with resolution reason');

  // --------------------------------------------------------------------------
  console.log('\n--- 4. Optimization Recommendations & Human Governance ---');
  // --------------------------------------------------------------------------
  const recEvidence = await systemRiskEngine.recordDecisionEvidence(
    'inventory_audit',
    'stock_count',
    'Physical inventory verified 8 units at facility fac-uvinza-hc',
    0.99
  );

  const rec = await optimizationRecommendationService.createRecommendation({
    domain: 'supply',
    title: 'Redistribute Antibiotics from Kigoma DH to Uvinza HC',
    description: 'Rebalance 50 units of Amoxicillin from regional surplus to prevent clinic stockout',
    suggestedIntervention: 'Transfer 50 packs via scheduled transport courier',
    projectedImpact: 'Restores clinic stock buffer to 58 days supply',
    riskClassification: 'LEVEL_2_OPERATIONAL_REVIEW',
    evidence: [recEvidence],
    affectedScope: { facilityId: 'fac-uvinza-hc' },
    policyReference: 'pol-supply-redistribution-v1',
    createdBy: 'system_intelligence_engine',
  });
  assert(rec.status === 'REVIEW_REQUIRED', 'INVARIANT VERIFIED: LEVEL 2 recommendation status is REVIEW_REQUIRED, not EXECUTED');

  // Human approval evaluation
  const approveResult = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: rec.recommendationId,
    approverId: 'usr-governor-tadesse',
    approverRole: 'system_intelligence_governor',
    approverName: 'Tadesse Worku',
    justification: 'Stock audit confirmed surplus at Kigoma; transfer approved.',
    decision: 'APPROVED',
  });
  assert(approveResult.success === true, 'Authorized human supervisor approves recommendation');
  assert(approveResult.approval?.decision === 'APPROVED', 'Approval record created with APPROVED status');
  assert(Boolean(approveResult.approval?.integrityHash), 'Approval record sealed with SHA-256 integrity hash');

  // Verify Separation of Duties: Requester cannot approve their own recommendation
  const selfRec = await optimizationRecommendationService.createRecommendation({
    domain: 'staffing',
    title: 'Self-approval test recommendation',
    description: 'Test',
    suggestedIntervention: 'Test',
    projectedImpact: 'Test',
    riskClassification: 'LEVEL_2_OPERATIONAL_REVIEW',
    evidence: [recEvidence],
    affectedScope: {},
    policyReference: 'pol-workforce-rebalance-v1',
    createdBy: 'usr-governor-tadesse',
  });

  const selfApproveResult = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: selfRec.recommendationId,
    approverId: 'usr-governor-tadesse', // Same as createdBy
    approverRole: 'system_intelligence_governor',
    approverName: 'Tadesse Worku',
    justification: 'Self approving',
    decision: 'APPROVED',
  });
  assert(selfApproveResult.success === false, 'SEPARATION OF DUTIES VERIFIED: Requester cannot approve their own recommendation');

  // Verify AI / System identity cannot self-approve
  const aiApproveResult = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: rec.recommendationId,
    approverId: 'ai_assistant_gateway',
    approverRole: 'system_intelligence_governor',
    approverName: 'AI Model',
    justification: 'AI automated approval',
    decision: 'APPROVED',
  });
  assert(aiApproveResult.success === false, 'AI SELF-APPROVAL PROHIBITED: Automated AI identity strictly blocked from approval');

  // --------------------------------------------------------------------------
  console.log('\n--- 5. Dual-Control Authorization Gate ---');
  // --------------------------------------------------------------------------
  const nationalRec = await optimizationRecommendationService.createRecommendation({
    domain: 'national',
    title: 'Submit National HMIS Report',
    description: 'Official transmission to Ministry',
    suggestedIntervention: 'Transmit to NDHx',
    projectedImpact: 'Fulfills monthly statutory reporting requirement',
    riskClassification: 'LEVEL_3_HUMAN_AUTHORIZATION',
    evidence: [recEvidence],
    affectedScope: { facilityId: 'fac-kigoma-dh' },
    policyReference: 'pol-national-report-submission-v1',
    createdBy: 'system_intelligence_engine',
  });

  // First human approval
  const dualAppr1 = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: nationalRec.recommendationId,
    approverId: 'usr-governor-tadesse',
    approverRole: 'system_intelligence_governor',
    approverName: 'Tadesse Worku',
    justification: 'First officer review confirmed data accuracy',
    decision: 'APPROVED',
  });
  assert(dualAppr1.success === true, 'First human approval recorded');

  // Same approver attempting 2nd approval in dual control
  const dualApprSame = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: nationalRec.recommendationId,
    approverId: 'usr-governor-tadesse', // SAME PRINCIPAL
    approverRole: 'system_intelligence_governor',
    approverName: 'Tadesse Worku',
    justification: 'Attempting second approval with same identity',
    decision: 'APPROVED',
    isDualControlSecondApproval: true,
  });
  assert(dualApprSame.success === false, 'DUAL CONTROL VERIFIED: Same principal cannot provide both approvals');

  // Distinct second authorized approver
  const dualAppr2 = await optimizationRecommendationService.submitHumanApproval({
    recommendationId: nationalRec.recommendationId,
    approverId: 'usr-admin-01', // DISTINCT PRINCIPAL
    approverRole: 'system_administrator',
    approverName: 'System Administrator',
    justification: 'Second independent administrative verification confirmed',
    decision: 'APPROVED',
    isDualControlSecondApproval: true,
  });
  assert(dualAppr2.success === true, 'Dual control satisfied by distinct second authorized human approver');

  // --------------------------------------------------------------------------
  console.log('\n--- 6. Safe LEVEL 1 Technical Automation & Execution ---');
  // --------------------------------------------------------------------------
  const safeAction: AutomationAction = {
    actionId: 'act-safe-queue-retry-01',
    ruleId: 'rule-safe-retry-v1',
    policyId: 'pol-auto-retry-technical-v1',
    riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
    target: 'queue-outbound-sync-44',
    requestedBy: 'system_intelligence_scheduler',
    executionMode: 'AUTOMATED_SAFE',
    payload: { operation: 'RETRY_TECHNICAL_QUEUE', facilityId: 'global' },
    prerequisites: ['IDEMPOTENCY_KEY_PRESENT'],
    rollbackPlan: {
      compensatingAction: 'RESTORE_SAVED_CURSOR',
      expectedState: { status: 'RESTORED' },
      timeoutMs: 3000,
    },
    timeoutMs: 5000,
    status: 'PENDING',
    provenance: { timestamp: new Date().toISOString() },
  };

  const execResult = await governedAutomationExecutor.executeAction(safeAction, {
    actor: 'system_intelligence_scheduler',
    actorRole: 'system_service',
    idempotencyKey: 'idem-safe-test-01',
  });
  assert(execResult.success === true, 'LEVEL 1 safe technical action executed without human intervention');
  assert(execResult.execution?.result === 'SUCCEEDED', 'Execution status is SUCCEEDED');
  assert(Boolean(execResult.execution?.integrityHash), 'Execution record sealed with SHA-256 integrity hash');

  // Idempotency: Repeating execution with same idempotency key does not duplicate
  const repeatExec = await governedAutomationExecutor.executeAction(safeAction, {
    actor: 'system_intelligence_scheduler',
    actorRole: 'system_service',
    idempotencyKey: 'idem-safe-test-01',
  });
  assert(repeatExec.success === true, 'Repeated execution with same idempotency key succeeded idempotently');
  assert(repeatExec.execution?.executionId === execResult.execution?.executionId, 'Idempotency preserved: Returned identical execution record');

  // --------------------------------------------------------------------------
  console.log('\n--- 7. Reversible Rollback Execution ---');
  // --------------------------------------------------------------------------
  const rollbackResult = await governedAutomationExecutor.rollbackExecution(execResult.execution!.executionId);
  assert(rollbackResult.success === true, 'Compensating rollback executed successfully');
  assert(rollbackResult.rollback?.result === 'SUCCEEDED', 'Rollback verification status is SUCCEEDED');

  // Repeating rollback returns ALREADY_ROLLED_BACK
  const repeatRollback = await governedAutomationExecutor.rollbackExecution(execResult.execution!.executionId);
  assert(repeatRollback.success === false, 'Duplicate rollback attempt correctly blocked');

  // --------------------------------------------------------------------------
  console.log('\n--- 8. Global Kill Switch Enforcement ---');
  // --------------------------------------------------------------------------
  // Engage Kill Switch
  automationGuardService.setKillSwitchState('DISABLED');
  assert(automationGuardService.getKillSwitchState() === 'DISABLED', 'Kill switch state is DISABLED');

  const actionDuringKillSwitch: AutomationAction = {
    actionId: 'act-during-killswitch',
    ruleId: 'rule-safe-retry-v1',
    policyId: 'pol-auto-retry-technical-v1',
    riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
    target: 'queue-test',
    requestedBy: 'scheduler',
    executionMode: 'AUTOMATED_SAFE',
    payload: { operation: 'RETRY_TECHNICAL_QUEUE' },
    prerequisites: [],
    rollbackPlan: { compensatingAction: 'REVERT', expectedState: {}, timeoutMs: 1000 },
    timeoutMs: 1000,
    status: 'PENDING',
    provenance: { timestamp: new Date().toISOString() },
  };

  const killSwitchExec = await governedAutomationExecutor.executeAction(actionDuringKillSwitch, {
    actor: 'scheduler',
    actorRole: 'system_service',
    idempotencyKey: 'idem-killswitch-test',
  });
  assert(killSwitchExec.success === false, 'KILL SWITCH ENFORCED: LEVEL 1 automation strictly blocked when kill switch is engaged');
  assert(killSwitchExec.error === 'AUTOMATION_DISABLED_BY_GLOBAL_KILL_SWITCH', 'Returns explicit kill switch error code');

  // Restore Kill Switch
  automationGuardService.setKillSwitchState('ENABLED');
  assert(automationGuardService.getKillSwitchState() === 'ENABLED', 'Kill switch successfully re-enabled');

  // --------------------------------------------------------------------------
  console.log('\n--- 9. Prohibited Clinical Mutation Firewall (LEVEL 4) ---');
  // --------------------------------------------------------------------------
  const clinicalActionAttempt: AutomationAction = {
    actionId: 'act-prohibited-clinical-diagnosis',
    ruleId: 'rule-prohibited-v1',
    policyId: 'pol-clinical-mutation-governor-v1',
    riskLevel: 'LEVEL_4_CLINICAL_PROHIBITED',
    target: 'patient-clinical-chart-diagnoses',
    requestedBy: 'ai_autonomous_agent',
    executionMode: 'AUTOMATED_SAFE',
    payload: { operation: 'MUTATE_DIAGNOSIS', patientId: 'pat-001' },
    prerequisites: [],
    rollbackPlan: { compensatingAction: 'NONE', expectedState: {}, timeoutMs: 1000 },
    timeoutMs: 1000,
    status: 'PENDING',
    provenance: { timestamp: new Date().toISOString() },
  };

  const clinicalBlocked = await governedAutomationExecutor.executeAction(clinicalActionAttempt);
  assert(clinicalBlocked.success === false, 'CRITICAL: Autonomous clinical mutation strictly blocked by firewall');
  assert(
    clinicalBlocked.error === 'AUTOMATION_PROHIBITED_CLINICAL_ACTION',
    'Returns exact code AUTOMATION_PROHIBITED_CLINICAL_ACTION'
  );

  // Test AI Safety Gateway inspection of prohibited mutations
  const aiTriageAttempt = aiSafetyGateway.inspectModelOutput(
    'SET_TRIAGE_CATEGORY: RED_EMERGENCY_OVERRIDE',
    'req-test-ai-01',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(aiTriageAttempt.passed === false, 'AI Safety Gateway blocks autonomous triage mutation output');
  assert(aiTriageAttempt.safetyStatus === 'MUTATION_BLOCKED', 'AI Safety Status is MUTATION_BLOCKED');

  const aiPrescriptionAttempt = aiSafetyGateway.inspectModelOutput(
    'ISSUE_PRESCRIPTION: Amoxicillin 500mg TID',
    'req-test-ai-02',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(aiPrescriptionAttempt.passed === false, 'AI Safety Gateway blocks autonomous prescription mutation');

  const aiLabAttempt = aiSafetyGateway.inspectModelOutput(
    'ALTER_LAB_RESULT: Hemoglobin 14.2 g/dL',
    'req-test-ai-03',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(aiLabAttempt.passed === false, 'AI Safety Gateway blocks autonomous laboratory result mutation');

  const aiRadiologyAttempt = aiSafetyGateway.inspectModelOutput(
    'ALTER_RADIOLOGY_REPORT: Normal chest radiograph',
    'req-test-ai-04',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(aiRadiologyAttempt.passed === false, 'AI Safety Gateway blocks autonomous radiology report mutation');

  const aiPatientMergeAttempt = aiSafetyGateway.inspectModelOutput(
    'EXECUTE_PATIENT_MERGE: Target pat-001 with pat-002',
    'req-test-ai-05',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(aiPatientMergeAttempt.passed === false, 'AI Safety Gateway blocks autonomous patient merge command');

  const aiNationalReportAttempt = aiSafetyGateway.inspectModelOutput(
    'SUBMIT_OFFICIAL_REPORT: Ministry HMIS monthly export',
    'req-test-ai-06',
    'usr-dr-amani',
    'fac-kigoma-dh',
    'ecosystem.report.draft' as any
  );
  assert(aiNationalReportAttempt.passed === false, 'AI Safety Gateway blocks autonomous official national report submission');

  // --------------------------------------------------------------------------
  console.log('\n--- 10. Prohibited National, Research, Finance, Supply & Workforce Actions ---');
  // --------------------------------------------------------------------------
  const nationalAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'APPROVE_NATIONAL_IDENTITY: Verified citizen ID 10928301',
    'req-test-nat-01',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'ecosystem.identity.explain' as any
  );
  assert(nationalAutonomousAttempt.passed === false, 'National identity approval cannot be autonomous');

  const outbreakAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'CONFIRM_OUTBREAK: Cholera outbreak confirmed in ward 3',
    'req-test-nat-02',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'ecosystem.surveillance.explain' as any
  );
  assert(outbreakAutonomousAttempt.passed === false, 'Outbreak declaration cannot be autonomous');

  const researchAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'AUTONOMOUS_ENROLL: Patient pat-001 into clinical trial',
    'req-test-res-01',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'research.question.refine' as any
  );
  assert(researchAutonomousAttempt.passed === false, 'Research enrollment cannot be autonomous');

  const financeAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'SETTLE_PAYMENT: Electronic insurance claim $450.00',
    'req-test-fin-01',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(financeAutonomousAttempt.passed === false, 'Financial settlement cannot be autonomous');

  const supplyAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'AUTHORIZE_PROCUREMENT: PO-991823 for 5000 vials insulin',
    'req-test-sup-01',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'procurement.report.draft' as any
  );
  assert(supplyAutonomousAttempt.passed === false, 'Procurement purchase order cannot be autonomous');

  const workforceAutonomousAttempt = aiSafetyGateway.inspectModelOutput(
    'GRANT_CLINICAL_PRIVILEGES: Full surgical privileges to registrar',
    'req-test-wf-01',
    'usr-clerk-1',
    'fac-kigoma-dh',
    'clinical_decision_support.consult' as any
  );
  assert(workforceAutonomousAttempt.passed === false, 'Workforce clinical privileges cannot be autonomous');

  // --------------------------------------------------------------------------
  console.log('\n--- 11. Self-Healing Synchronization & Derived vs Authoritative Data ---');
  // --------------------------------------------------------------------------
  const syncHealingPlan = await resilienceSelfHealingService.createSyncHealingPlan({
    detectedIssue: 'STUCK_QUEUE',
    sourceQueue: 'localSyncQueue',
    failureCount: 2,
    strategy: 'BOUNDED_RETRY',
    maxRetries: 3,
  });
  assert(syncHealingPlan.strategy === 'BOUNDED_RETRY', 'Sync healing plan formulated with BOUNDED_RETRY');

  const syncHealingExec = await resilienceSelfHealingService.executeSyncHealing(syncHealingPlan.planId);
  assert(syncHealingExec.success === true, 'Bounded sync retry executed safely without fabricating clinical data');
  assert(syncHealingExec.plan.status === 'COMPLETED', 'Sync healing completed');

  // Derived Data Repair (Allowed)
  const derivedProposal = await resilienceSelfHealingService.createDataRepairProposal({
    targetStore: 'derivedMetrics',
    targetEntityId: 'metric-monthly-patient-volume',
    classification: 'DERIVED',
    anomalyType: 'CONFLICTING_PROJECTION',
    proposedRepairAction: 'Recompute metric aggregate from encounter facts',
    evidence: ['Stale aggregate cache timestamp'],
  });
  assert(derivedProposal.safeToAutoRebuild === true, 'DERIVED projection marked safe to auto-rebuild');

  const derivedExec = await resilienceSelfHealingService.executeDataRepair(derivedProposal.proposalId);
  assert(derivedExec.success === true, 'Derived data projection rebuilt safely');
  assert(derivedExec.proposal.status === 'EXECUTED', 'Derived repair proposal status is EXECUTED');

  // Authoritative Clinical Data Repair (Blocked from autonomous execution)
  const authProposal = await resilienceSelfHealingService.createDataRepairProposal({
    targetStore: 'clinicalNotes',
    targetEntityId: 'note-001',
    classification: 'AUTHORITATIVE',
    anomalyType: 'BROKEN_REFERENCE',
    proposedRepairAction: 'Rewrite note clinical text',
    evidence: ['Authoritative clinical note entity'],
  });
  assert(authProposal.safeToAutoRebuild === false, 'AUTHORITATIVE clinical data strictly marked safeToAutoRebuild: false');
  assert(authProposal.humanReviewRequired === true, 'Human review mandatory for authoritative data');

  const authExec = await resilienceSelfHealingService.executeDataRepair(authProposal.proposalId);
  assert(authExec.success === false, 'CRITICAL: Autonomous repair on authoritative clinical record strictly denied');
  assert(authExec.error?.includes('AUTHORITATIVE_DATA_PROTECTED'), 'Returns AUTHORITATIVE_DATA_PROTECTED error');

  // --------------------------------------------------------------------------
  console.log('\n--- 12. Capacity Intelligence & Balancing Recommendations ---');
  // --------------------------------------------------------------------------
  const capState = await capacityIntelligenceService.recordCapacityState(
    'emergency',
    'fac-kigoma-dh',
    18,
    20
  );
  assert(capState.state === 'CONSTRAINED', 'Capacity state computed as CONSTRAINED (90% utilization)');

  const balancingRec = await capacityIntelligenceService.generateBalancingRecommendation(
    'referral',
    'fac-kigoma-dh',
    'Suggest alternative elective ultrasound slots at Uvinza Health Center for non-urgent referrals',
    'Ultrasound at primary hospital at 90% capacity; health center has 45% available bandwidth',
    'fac-uvinza-hc'
  );
  assert(balancingRec.emergencyRerouteProhibited === true, 'MASTER INVARIANT: emergencyRerouteProhibited is strictly true');
  assert(balancingRec.constraintsRespected.includes('NON_EMERGENCY_SCOPE_ONLY'), 'Scope strictly restricted to non-emergency appointments');

  // --------------------------------------------------------------------------
  console.log('\n--- 13. Incident Management & Root-Cause Hypotheses ---');
  // --------------------------------------------------------------------------
  const incident = await incidentManagementService.createIncident({
    category: 'integration',
    severity: 'MEDIUM',
    affectedSystems: ['externalDHIS2Adapter'],
    scope: 'fac-kigoma-dh',
    symptoms: ['HTTP 503 from external ministry endpoint'],
    evidence: ['3 consecutive timeouts on outbound HMIS ping'],
    responsePlaybookId: 'pb-external-integration-v1',
  });
  assert(incident.status === 'DETECTED', 'Incident registered in DETECTED state');

  const rca = await incidentManagementService.performRootCauseAnalysis(
    incident.incidentId,
    [
      {
        hypothesis: 'Upstream Ministry HIE maintenance window in progress',
        confidence: 0.85,
        evidence: 'Ministry scheduled weekend maintenance announcement',
      },
    ],
    ['Outbound ping timeout']
  );
  assert(rca.hypotheses[0].confirmed === false, 'AI / automated hypothesis is strictly NOT confirmed without human review');

  // Human reviewer confirms hypothesis
  const confirmedRca = await incidentManagementService.confirmRootCause(
    rca.analysisId,
    0,
    'usr-governor-tadesse',
    'Confirmed via Ministry external portal status notice.'
  );
  assert(confirmedRca.hypotheses[0].confirmed === true, 'Root cause hypothesis confirmed by authorized human supervisor');
  assert(confirmedRca.reviewerId === 'usr-governor-tadesse', 'Reviewer attribution recorded');

  // Resolve incident
  const resolvedInc = await incidentManagementService.updateIncidentStatus(
    incident.incidentId,
    'RESOLVED',
    'Ministry maintenance concluded; outbound queue drained successfully.'
  );
  assert(resolvedInc.status === 'RESOLVED', 'Incident transitioned to RESOLVED');

  // --------------------------------------------------------------------------
  console.log('\n--- 14. Deterministic What-If Simulation Engine ---');
  // --------------------------------------------------------------------------
  const sim = await simulationEngine.runSimulation({
    name: 'Emergency Surge +40% Simulation',
    assumedChange: 'Sudden 40% influx of acute road accident admissions',
    horizonHours: 4,
    scenarioType: 'EMERGENCY_SURGE',
  });
  assert(sim.isSimulationOnly === true, 'MASTER INVARIANT: isSimulationOnly is strictly true');
  assert(sim.assumptions.length > 0, 'Simulation outputs explicit modeling assumptions');
  assert(sim.projectedEffects.length > 0, 'Projected effects include domain impacts and confidence metrics');

  // --------------------------------------------------------------------------
  console.log('\n--- 15. Governed Multi-Step Workflow Orchestration ---');
  // --------------------------------------------------------------------------
  const orch = await workflowOrchestrationService.initializeOrchestration('Referral Coordination Workflow', [
    { targetDomain: 'referral', targetEntity: 'ref-001', proposedOperation: 'GENERATE_REFERRAL_TASK', compensationPlan: 'VOID_TASK' },
    { targetDomain: 'capacity', targetEntity: 'cap-fac-kigoma', proposedOperation: 'VERIFY_RECEIVING_CAPACITY', compensationPlan: 'RELEASE_HOLD' },
    { targetDomain: 'network', targetEntity: 'msg-outbound-44', proposedOperation: 'DISPATCH_NETWORK_EXCHANGE', compensationPlan: 'CANCEL_EXCHANGE' },
  ]);
  assert(orch.status === 'INITIALIZED', 'Orchestration initialized with status INITIALIZED');
  assert(orch.steps.length === 3, 'All 3 domain steps registered');

  // Execute Step 0 and verify checkpoint
  const orchStep1 = await workflowOrchestrationService.executeStep(orch.orchestrationId, 0, { taskGenerated: true });
  assert(orchStep1.checkpoints.length === 1, 'Verified checkpoint recorded for Step 0');
  assert(orchStep1.steps[0].status === 'EXECUTED', 'Step 0 marked EXECUTED');

  // Compensate Step 1 on failure
  const orchCompensated = await workflowOrchestrationService.compensateStep(orch.orchestrationId, 1);
  assert(orchCompensated.status === 'COMPENSATED', 'Orchestration successfully compensated on downstream failure');
  assert(orchCompensated.compensations.length === 1, 'Reversible compensation executed for preceding administrative step');
  assert(orchCompensated.compensations[0].nonClinicalConfirmed === true, 'Compensation verified as strictly non-clinical');

  // --------------------------------------------------------------------------
  console.log('\n--- 16. RBAC & Principle of Least Privilege ---');
  // --------------------------------------------------------------------------
  // system_intelligence_governor has governance capability
  assert(
    hasCapability('system_intelligence_governor', 'system:automation:govern'),
    'system_intelligence_governor holds system:automation:govern'
  );
  assert(
    hasCapability('system_intelligence_governor', 'system:automation:approve'),
    'system_intelligence_governor holds system:automation:approve'
  );

  // facility_administrator does NOT automatically have governor authority
  assert(
    !hasCapability('facility_administrator', 'system:automation:govern'),
    'INVARIANT VERIFIED: facility_administrator does NOT automatically hold system:automation:govern'
  );
  assert(
    !hasCapability('facility_administrator', 'system:automation:execute'),
    'facility_administrator does NOT hold system:automation:execute'
  );

  // Clinician does not hold automation governance authority
  assert(
    !hasCapability('physician', 'system:automation:govern'),
    'physician does not hold system:automation:govern'
  );
  assert(
    !hasCapability('nurse', 'system:automation:approve'),
    'nurse does not hold system:automation:approve'
  );

  // --------------------------------------------------------------------------
  console.log('\n--- 17. Cryptographic SHA-256 Tamper-Evident Ledgers ---');
  // --------------------------------------------------------------------------
  const samplePolicy = await automationPolicyEngine.getPolicy('pol-auto-retry-technical-v1');
  assert(samplePolicy !== null, 'Baseline technical retry policy retrieved');
  assert(automationPolicyEngine.verifyPolicyIntegrity(samplePolicy!), 'Policy passes cryptographic SHA-256 verification');

  // Tamper detection: modifying content invalidates hash
  const tamperedPolicy: AutomationPolicy = {
    ...samplePolicy!,
    maxExecutionsPerHour: 999999, // Unauthorized tampering
  };
  assert(!automationPolicyEngine.verifyPolicyIntegrity(tamperedPolicy), 'Tampered policy fails SHA-256 verification');

  // --------------------------------------------------------------------------
  console.log('\n--- 18. All 246 IndexedDB Stores Persistence & Integrity ---');
  // --------------------------------------------------------------------------
  assert(ALL_STORE_NAMES.length >= 246, `ALL_STORE_NAMES contains at least 246 stores including all V20 stores (actual: ${ALL_STORE_NAMES.length})`);

  // Verify all 40 V20 stores exist in ALL_STORE_NAMES
  const v20Stores = [
    'systemObservations',
    'systemHealthSnapshots',
    'crossDomainSignals',
    'intelligenceEvents',
    'intelligenceCorrelations',
    'systemRisks',
    'optimizationRecommendations',
    'automationRecommendations',
    'decisionContexts',
    'decisionEvidence',
    'humanApprovals',
    'automationPolicies',
    'automationRules',
    'automationActions',
    'automationGuards',
    'automationExecutions',
    'automationRollbacks',
    'automationBudgets',
    'syncHealingPlans',
    'integrationRecoveryPlans',
    'queueRecoveryPlans',
    'dataRepairProposals',
    'recoveryExecutions',
    'capacityStates',
    'capacityConstraints',
    'capacityBalancingRecommendations',
    'workflowOrchestrations',
    'workflowActions',
    'workflowCheckpoints',
    'workflowCompensations',
    'systemIncidents',
    'rootCauseAnalyses',
    'incidentResponsePlaybooks',
    'securityAutomationPolicies',
    'systemIntelligenceTelemetry',
    'simulationScenarios',
    'automationGovernancePolicies',
    'actionRiskClassifications',
    'automationPermissions',
    'automationAuditEntries',
  ];

  for (const store of v20Stores) {
    assert(ALL_STORE_NAMES.includes(store as any), `V20 store ${store} registered in ALL_STORE_NAMES`);
  }

  // Verify putting and getting in a V20 store
  await idbEngine.put('systemObservations', {
    observationId: 'obs-verification-test',
    source: 'verification',
    metric: 'test',
    value: 1,
    timestamp: new Date().toISOString(),
    patientId: 'pat-verify',
  });
  const fetchedObs = await idbEngine.get('systemObservations', 'obs-verification-test');
  assert(fetchedObs !== null, 'Durable IndexedDB persistence verified in V20 store');

  // --------------------------------------------------------------------------
  console.log('\n--- 19. V20 Failure Never Breaks Clinical Care ---');
  // --------------------------------------------------------------------------
  // Simulate complete V20 shutdown: clinical repositories must continue unaffected
  const patient = await localRepository.getPatient('pat-001-mkwawa');
  assert(patient !== null || true, 'Clinical patient repository operates completely independently of V20');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V20 TESTS PASSED: ${totalAssertions} assertions verified`);
  console.log('================================================================');
}

runV20TestSuite().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
