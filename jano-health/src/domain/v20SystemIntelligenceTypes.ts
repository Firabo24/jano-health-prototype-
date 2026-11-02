/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * 
 * Formal Domain Models & Type Specifications for System-Wide Intelligence,
 * Resilience Monitoring, Situational Awareness, Capacity Balancing,
 * and Policy-Governed Automation.
 * 
 * MASTER ARCHITECTURAL INVARIANTS:
 * 1. Prediction ≠ Decision
 * 2. Recommendation ≠ Authorization
 * 3. Authorization ≠ Execution
 * 4. AI Output ≠ Human Approval
 * 5. Automation ≠ Autonomy
 * 6. Technical Remediation ≠ Clinical Mutation
 * 7. Operational Optimization ≠ Clinical Decision
 * 8. Capacity Recommendation ≠ Patient Prioritization
 * 9. Supply Recommendation ≠ Purchase Authorization
 * 10. Network Healing ≠ Data Fabrication
 * 11. Policy Audit ≠ Policy Change
 * 12. Anomaly ≠ Incident Confirmation
 * 13. Incident ≠ Root Cause
 * 14. Forecast ≠ Fact
 * 15. Simulation ≠ Production Action
 * 16. Sandbox ≠ Production
 * 17. External Response ≠ Truth
 * 18. National Signal ≠ Government Decision
 * 19. Human Approval ≠ AI Approval
 * 20. Rollback ≠ Guaranteed Recovery
 * 21. SHA-256 Integrity ≠ Legal Digital Signature
 * 22. Derived Data ≠ Authoritative Data
 * 23. V20 Failure ≠ Clinical Failure
 * 24. Unknown ≠ Safe
 * 25. Unavailable ≠ Success
 * 26. One Approval ≠ Dual Control
 * 27. Old Queued Action ≠ Current Authorization
 */

import { sha256 } from './eventIntegrity';

export function computeSha256(data: any): string {
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  return sha256(serialized);
}

// ============================================================================
// 1. RISK CLASSIFICATION & ACTION MODEL
// ============================================================================

export type ActionRiskClassification =
  | 'LEVEL_0_OBSERVE'
  | 'LEVEL_1_TECHNICAL_SAFE'
  | 'LEVEL_2_OPERATIONAL_REVIEW'
  | 'LEVEL_3_HUMAN_AUTHORIZATION'
  | 'LEVEL_4_CLINICAL_PROHIBITED';

export type SystemHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN';

export type SystemRiskType =
  | 'CLINICAL_OPERATIONAL_RISK'
  | 'NETWORK_RISK'
  | 'DATA_RISK'
  | 'SECURITY_RISK'
  | 'SUPPLY_RISK'
  | 'WORKFORCE_RISK'
  | 'FINANCIAL_RISK'
  | 'RESEARCH_RISK'
  | 'INTEROPERABILITY_RISK'
  | 'INFRASTRUCTURE_RISK';

export type SystemRiskState =
  | 'WATCH'
  | 'ELEVATED'
  | 'HIGH'
  | 'CRITICAL'
  | 'RESOLVED';

export type OptimizationStatus =
  | 'DRAFT'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTED'
  | 'EXPIRED';

export type ApprovalDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export type AutomationExecutionMode =
  | 'OBSERVE'
  | 'SIMULATE'
  | 'RECOMMEND'
  | 'APPROVAL_REQUIRED'
  | 'AUTOMATED_SAFE';

export type AutomationExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'ROLLED_BACK'
  | 'ROLLBACK_FAILED';

export type GlobalKillSwitchState = 'ENABLED' | 'DISABLED';

export type DataClassification = 'AUTHORITATIVE' | 'DERIVED';

export type CapacityStateType =
  | 'AVAILABLE'
  | 'NORMAL'
  | 'ELEVATED'
  | 'CONSTRAINED'
  | 'CRITICAL'
  | 'UNKNOWN';

// ============================================================================
// 2. SYSTEM OBSERVATION & HEALTH SNAPSHOT
// ============================================================================

export interface SystemObservation {
  observationId: string;
  source: string; // 'syncEngine' | 'networkExchange' | 'fhirGateway' | 'nationalIntegrations' | 'databases' | 'queues' | 'aiGateway' | 'analytics' | 'workforce' | 'supply' | 'finance' | 'research'
  metric: string;
  value: number | string | boolean;
  unit?: string;
  timestamp: string;
  scope: {
    facilityId?: string;
    networkNodeId?: string;
    subsystem?: string;
  };
  quality: 'HIGH' | 'ESTIMATED' | 'UNCERTAIN';
  provenance: {
    collectorVersion: string;
    nodeId: string;
  };
}

export interface DomainHealthDetail {
  status: SystemHealthState;
  score?: number; // 0-100
  activeIssues: string[];
  metrics: Record<string, number | string>;
  lastObservedAt: string;
}

export interface SystemHealthSnapshot {
  snapshotId: string;
  timestamp: string;
  overallHealth: SystemHealthState;
  clinicalAvailability: DomainHealthDetail;
  localStorage: DomainHealthDetail;
  syncStatus: DomainHealthDetail;
  networkStatus: DomainHealthDetail;
  fhirStatus: DomainHealthDetail;
  externalIntegrations: DomainHealthDetail;
  queueHealth: DomainHealthDetail;
  aiAvailability: DomainHealthDetail;
  workforceOperations: DomainHealthDetail;
  supplyOperations: DomainHealthDetail;
  analytics: DomainHealthDetail;
  research: DomainHealthDetail;
  finance: DomainHealthDetail;
  supportingEvidence: string[];
}

// ============================================================================
// 3. CROSS-DOMAIN SIGNALS & INTELLIGENCE CORRELATION
// ============================================================================

export interface CrossDomainSignal {
  signalId: string;
  domains: string[]; // e.g. ['network', 'referral']
  title: string;
  description: string;
  severity: 'INFO' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  confidence: number; // 0.0 - 1.0
  detectedAt: string;
  evidence: string[];
  correlationKeys: string[];
}

export interface IntelligenceCorrelation {
  correlationId: string;
  sourceSignals: string[]; // signal IDs
  domains: string[];
  observedRelationship: string;
  confidence: number; // 0.0 - 1.0
  method: 'HEURISTIC' | 'STATISTICAL_CO_OCCURRENCE' | 'TEMPORAL_PRECEDENCE';
  generatedAt: string;
  isCausationClaimed: false; // INVARIANT: Correlation is NEVER labeled causation automatically
  provenance: {
    ruleVersion: string;
    engine: string;
  };
}

export interface IntelligenceEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  domain: string;
  payload: Record<string, any>;
  provenance: {
    source: string;
    version: string;
  };
  integrityHash: string;
}

// ============================================================================
// 4. SYSTEM RISK & DECISION CONTEXT
// ============================================================================

export interface SystemRisk {
  riskId: string;
  riskType: SystemRiskType;
  state: SystemRiskState;
  title: string;
  description: string;
  severityScore: number; // 0-100
  domains: string[];
  affectedFacilities: string[];
  affectedSystems: string[];
  evidence: string[];
  detectedAt: string;
  resolvedAt?: string;
  provenance: {
    detectorId: string;
    version: string;
  };
}

export interface DecisionEvidence {
  evidenceId: string;
  source: string;
  metric: string;
  observation: string;
  signal?: string;
  confidence: number;
  timestamp: string;
  dataQuality: 'VERIFIED' | 'ESTIMATED' | 'UNCERTAIN';
  modelOrRuleVersion: string;
}

export interface DecisionContext {
  contextId: string;
  decisionType: string;
  scope: {
    facilities: string[];
    networks?: string[];
    subsystems?: string[];
  };
  relevantObservations: string[];
  relevantSignals: string[];
  applicablePolicies: string[];
  affectedSystems: string[];
  affectedFacilities: string[];
  constraints: string[];
  riskClassification: ActionRiskClassification;
  timestamp: string;
}

// ============================================================================
// 5. OPTIMIZATION & HUMAN APPROVAL
// ============================================================================

export interface OptimizationRecommendation {
  recommendationId: string;
  domain: 'staffing' | 'capacity' | 'supply' | 'referrals' | 'network' | 'logistics' | 'queue' | 'technical' | 'national';
  title: string;
  description: string;
  status: OptimizationStatus;
  suggestedIntervention: string;
  projectedImpact: string;
  riskClassification: ActionRiskClassification;
  evidence: DecisionEvidence[];
  affectedScope: {
    facilityId?: string;
    departmentId?: string;
    systemId?: string;
  };
  decisionContextId: string;
  policyReference: string;
  createdBy: string; // 'system_intelligence_engine' or human
  createdAt: string;
  expiresAt: string;
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  rejectionReason?: string;
}

export interface AutomationRecommendation {
  recommendationId: string;
  ruleId: string;
  actionType: string;
  riskLevel: ActionRiskClassification;
  target: string;
  evidence: DecisionEvidence[];
  proposedAction: Record<string, any>;
  status: OptimizationStatus;
}

export interface HumanApproval {
  approvalId: string;
  recommendationOrActionId: string;
  approverId: string;
  approverRole: string;
  approverName: string;
  capability: string;
  scope: string[];
  decision: ApprovalDecision;
  justification: string;
  timestamp: string;
  expiration: string;
  isDualControlSecondApproval?: boolean;
  provenance: {
    systemVersion: string;
    clientIp?: string;
  };
  integrityHash: string;
}

// ============================================================================
// 6. AUTOMATION POLICY, RULES & GUARDS
// ============================================================================

export interface AutomationPolicy {
  policyId: string;
  name: string;
  actionType: string;
  riskLevel: ActionRiskClassification;
  allowedScope: {
    facilities: string[];
    networks: string[];
    systems: string[];
  };
  prerequisites: string[];
  approvalRequired: boolean;
  dualControlRequired: boolean;
  rollbackRequired: boolean;
  maxExecutionsPerHour: number;
  cooldownSeconds: number;
  effectiveFrom: string;
  effectiveTo: string;
  version: string;
  isClinicalProhibited: boolean;
  provenance: {
    authorId: string;
    approvedAt: string;
  };
  integrityHash: string;
}

export interface AutomationRule {
  ruleId: string;
  name: string;
  condition: string;
  evidenceRequirements: string[];
  actionType: string;
  riskClassification: ActionRiskClassification;
  policyReference: string;
  cooldownSeconds: number;
  maxFrequencyPerHour: number;
  enabled: boolean;
  version: string;
  provenance: {
    systemVersion: string;
  };
}

export interface AutomationAction {
  actionId: string;
  ruleId: string;
  policyId: string;
  riskLevel: ActionRiskClassification;
  target: string;
  requestedBy: string; // actor or 'system_intelligence_scheduler'
  executionMode: AutomationExecutionMode;
  payload: Record<string, any>;
  prerequisites: string[];
  rollbackPlan: {
    compensatingAction: string;
    expectedState: Record<string, any>;
    timeoutMs: number;
  };
  timeoutMs: number;
  status: 'PENDING' | 'GUARD_CHECKING' | 'EXECUTING' | 'COMPLETED' | 'BLOCKED';
  provenance: {
    timestamp: string;
  };
}

export interface AutomationGuard {
  guardId: string;
  actionId: string;
  checkedAt: string;
  result: 'PASS' | 'DENY';
  reason?: string;
  checks: {
    authenticatedCaller: boolean;
    policyMatched: boolean;
    riskPermitted: boolean;
    scopePermitted: boolean;
    prerequisitesMet: boolean;
    humanApprovalVerified: boolean;
    dualControlVerified: boolean;
    cooldownVerified: boolean;
    budgetVerified: boolean;
    rollbackAvailable: boolean;
    targetValid: boolean;
    killSwitchPermits: boolean;
    clinicalMutationBlocked: boolean;
  };
}

export interface AutomationExecution {
  executionId: string;
  actionId: string;
  policyId: string;
  policyVersion: string;
  riskLevel: ActionRiskClassification;
  startTime: string;
  endTime?: string;
  result: AutomationExecutionStatus;
  sideEffects: string[];
  logs: string[];
  rollbackId?: string;
  actorOrSystem: string;
  correlationId: string;
  provenance: {
    nodeId: string;
    systemVersion: string;
  };
  integrityHash: string;
}

export interface AutomationRollback {
  rollbackId: string;
  originalExecutionId: string;
  originalActionId: string;
  compensatingAction: string;
  expectedState: Record<string, any>;
  verification: {
    verified: boolean;
    message?: string;
  };
  timeoutMs: number;
  executedAt: string;
  result: 'SUCCEEDED' | 'FAILED';
  actorId: string;
}

export interface AutomationBudget {
  budgetId: string;
  period: 'HOURLY';
  maxExecutionsPerHour: number;
  currentExecutionCount: number;
  maxConcurrentActions: number;
  maxFacilities: number;
  status: 'NORMAL' | 'WARNING' | 'AUTOMATION_PAUSED';
  windowStart: string;
}

// ============================================================================
// 7. RESILIENCE & SELF-HEALING
// ============================================================================

export interface SyncHealingPlan {
  planId: string;
  detectedIssue: 'STUCK_QUEUE' | 'REPEATED_RETRY' | 'STALE_CURSOR' | 'FAILED_PULL' | 'FAILED_PUSH' | 'CONFLICT_STORM' | 'DUPLICATE_MESSAGES' | 'STORAGE_INCONSISTENCY';
  sourceQueue: string;
  failureCount: number;
  strategy: 'BOUNDED_RETRY' | 'BACKOFF' | 'WORKER_RESTART' | 'PROJECTION_REBUILD' | 'RETRY_QUARANTINE_ROUTING';
  status: 'PROPOSED' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  maxRetries: number;
  retryCount: number;
  requiresHumanReview: boolean;
  integrityVerified: boolean;
  idempotencyKey: string;
  createdAt: string;
}

export interface IntegrationRecoveryPlan {
  planId: string;
  integrationId: string;
  systemName: string;
  circuitState: 'OPEN' | 'HALF_OPEN' | 'CLOSED';
  recoverySteps: string[];
  status: 'PENDING' | 'RECOVERING' | 'VERIFIED' | 'FAILED';
  humanEscalationRequired: boolean;
  createdAt: string;
}

export interface QueueRecoveryPlan {
  planId: string;
  queueName: string;
  stuckCount: number;
  action: 'BACKOFF_RETRY' | 'REORDER_NON_CLINICAL' | 'DRAIN_TO_DLQ';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export interface DataRepairProposal {
  proposalId: string;
  targetStore: string;
  targetEntityId: string;
  classification: DataClassification;
  anomalyType: 'CONFLICTING_PROJECTION' | 'INCONSISTENT_AGGREGATE' | 'BROKEN_REFERENCE' | 'CORRUPTED_DERIVED_INDEX';
  proposedRepairAction: string;
  safeToAutoRebuild: boolean; // True ONLY if classification === 'DERIVED'
  status: 'DRAFT' | 'REVIEW_REQUIRED' | 'APPROVED' | 'EXECUTED' | 'REJECTED';
  humanReviewRequired: boolean;
  evidence: string[];
  createdAt: string;
  executedAt?: string;
}

export interface RecoveryExecution {
  recoveryExecutionId: string;
  planId: string;
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  actionsTaken: string[];
  logs: string[];
}

// ============================================================================
// 8. CAPACITY INTELLIGENCE & BALANCING
// ============================================================================

export interface CapacityState {
  stateId: string;
  domain: 'emergency' | 'laboratory' | 'radiology' | 'pharmacy' | 'referral' | 'workforce' | 'warehouse' | 'network' | 'infrastructure';
  facilityId: string;
  state: CapacityStateType;
  currentLoad: number;
  maxCapacity: number;
  utilizationPercent: number;
  measuredAt: string;
}

export interface CapacityConstraint {
  constraintId: string;
  domain: string;
  facilityId: string;
  period: string;
  currentLoad: number;
  capacity: number;
  bottleneckFactor: string;
  confidence: number;
  source: string;
  provenance: {
    updatedAt: string;
  };
}

export interface CapacityBalancingRecommendation {
  recommendationId: string;
  domain: string;
  facilityId: string;
  alternateFacilityId?: string;
  suggestedAction: string;
  rationale: string;
  confidence: number;
  constraintsRespected: string[];
  status: OptimizationStatus;
  emergencyRerouteProhibited: true; // INVARIANT: Emergency patients are NEVER automatically rerouted
  createdAt: string;
}

// ============================================================================
// 9. WORKFLOW ORCHESTRATION & CHECKPOINTS
// ============================================================================

export interface WorkflowAction {
  actionId: string;
  targetDomain: string;
  targetEntity: string;
  proposedOperation: string;
  preconditions: string[];
  status: 'PENDING' | 'EXECUTED' | 'FAILED' | 'COMPENSATED';
  compensationPlan?: string;
  policyReference?: string;
  actor?: string;
  provenance?: Record<string, any>;
}

export interface WorkflowCheckpoint {
  checkpointId: string;
  orchestrationId: string;
  stepIndex: number;
  stepName: string;
  stateSnapshot: Record<string, any>;
  completedAt: string;
  verified: boolean;
}

export interface WorkflowCompensation {
  compensationId: string;
  orchestrationId: string;
  actionId: string;
  compensationAction: string;
  executedAt?: string;
  result?: string;
  nonClinicalConfirmed: boolean; // INVARIANT: Never rewrites authoritative clinical history
}

export interface WorkflowOrchestration {
  orchestrationId: string;
  name: string;
  correlationId: string;
  status: 'INITIALIZED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'COMPENSATED';
  currentStepIndex: number;
  steps: WorkflowAction[];
  checkpoints: WorkflowCheckpoint[];
  compensations: WorkflowCompensation[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 10. INCIDENT MANAGEMENT, PLAYBOOKS & ROOT CAUSE
// ============================================================================

export interface SystemIncident {
  incidentId: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAt: string;
  resolvedAt?: string;
  affectedSystems: string[];
  scope: string;
  symptoms: string[];
  evidence: string[];
  responsePlaybookId?: string;
  status: 'DETECTED' | 'TRIAGED' | 'MITIGATING' | 'MONITORING' | 'RESOLVED' | 'CLOSED';
  resolutionNotes?: string;
  provenance: {
    reporter: string;
    version: string;
  };
}

export interface RootCauseHypothesis {
  hypothesis: string;
  confidence: number;
  evidence: string;
  confirmed: boolean;
}

export interface RootCauseAnalysis {
  analysisId: string;
  incidentId: string;
  contributingObservations: string[];
  hypotheses: RootCauseHypothesis[];
  reviewerId?: string;
  conclusion?: string;
  generatedAt: string;
  provenance: {
    analyzerVersion: string;
  };
}

export interface IncidentResponsePlaybook {
  playbookId: string;
  name: string;
  triggerCondition: string;
  category: string;
  safeAutomatedActions: string[];
  humanEscalationSteps: string[];
  rollbackSteps: string[];
  verificationSteps: string[];
}

export interface SecurityAutomationPolicy {
  policyId: string;
  name: string;
  triggerType: 'SUSPICIOUS_REPLAY' | 'EXCESSIVE_FAILURES' | 'RATE_LIMIT_EXCEEDED' | 'UNAUTHORIZED_PROBE';
  automatedAction: 'CIRCUIT_OPEN' | 'REQUEST_THROTTLE' | 'ENDPOINT_QUARANTINE' | 'BLOCK_REPLAY';
  targetScope: string;
  maxDurationMinutes: number;
}

// ============================================================================
// 11. TELEMETRY, SIMULATION & GOVERNANCE AUDIT
// ============================================================================

export interface SystemIntelligenceTelemetry {
  telemetryId: string;
  timestamp: string;
  metricName: string;
  metricValue: number;
  dimensions: Record<string, string>;
  aggregateOnly: boolean; // INVARIANT: Technical dashboards NEVER expose patient payloads
}

export interface SystemSimulationScenario {
  scenarioId: string;
  name: string;
  assumedChange: string;
  horizonHours: number;
  inputSnapshot: Record<string, any>;
  projectedEffects: Array<{
    domain: string;
    expectedImpact: string;
    confidence: number;
    risks: string[];
  }>;
  dependencies: string[];
  assumptions: string[];
  isSimulationOnly: true; // INVARIANT: Simulation never modifies production state
  createdAt: string;
}

export interface AutomationGovernancePolicy {
  policyId: string;
  name: string;
  version: string;
  dualControlRequiredFor: string[];
  cooldownRules: Record<string, number>;
  budgetLimits: {
    maxExecutionsPerHour: number;
    maxConcurrent: number;
  };
  effectiveDate: string;
}

export interface ActionRiskClassificationEntity {
  classificationId: string;
  actionType: string;
  riskLevel: ActionRiskClassification;
  description: string;
  permittedModes: AutomationExecutionMode[];
}

export interface AutomationPermission {
  permissionId: string;
  principalId: string;
  allowedActions: string[];
  allowedScopes: string[];
  validUntil: string;
}

export interface AutomationAuditEntry {
  auditId: string;
  actionId: string;
  actionType: string;
  riskLevel: ActionRiskClassification;
  actor: string;
  actorRole: string;
  reason: string;
  policyVersion: string;
  evidenceSummary: string;
  humanApprovalId?: string;
  executionResult: string;
  rollbackRecorded: boolean;
  timestamp: string;
  correlationId: string;
  integrityHash: string;
}

export interface AutomationPrincipal {
  principalId: string;
  name: string;
  systemIdentifier: string;
  authorizedRoles: string[];
  isHuman: false;
  isActive: boolean;
  capabilities: string[];
  validUntil: string;
}
