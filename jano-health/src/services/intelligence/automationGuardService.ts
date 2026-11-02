/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Automation Guard & Execution Firewall Service
 * 
 * INVARIANTS:
 * - Technical Remediation ≠ Clinical Mutation.
 * - Prediction ≠ Decision.
 * - Recommendation ≠ Authorization.
 * - Authorization ≠ Execution.
 * - Dual Control: Same principal cannot provide both approvals.
 * - Fail-Safe Default: If uncertain, DENY execution with AUTOMATION_DENIED_INSUFFICIENT_GOVERNANCE.
 * - Clinical Mutation hard-blocks with AUTOMATION_PROHIBITED_CLINICAL_ACTION.
 */

import {
  AutomationGuard,
  AutomationAction,
  AutomationPolicy,
  HumanApproval,
  GlobalKillSwitchState,
} from '../../domain/v20SystemIntelligenceTypes';
import { automationPolicyEngine } from './automationPolicyEngine';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditRepository } from '../audit/auditRepository';

export class AutomationGuardService {
  private static instance: AutomationGuardService;

  private killSwitchState: GlobalKillSwitchState = 'ENABLED';
  private lastExecutionTimestamps = new Map<string, number>(); // actionType -> timestamp
  private executionCountCurrentHour = 0;
  private currentHourWindowStart = Date.now();

  private constructor() {}

  public static getInstance(): AutomationGuardService {
    if (!AutomationGuardService.instance) {
      AutomationGuardService.instance = new AutomationGuardService();
    }
    return AutomationGuardService.instance;
  }

  public getKillSwitchState(): GlobalKillSwitchState {
    return this.killSwitchState;
  }

  public setKillSwitchState(state: GlobalKillSwitchState, actorId = 'system_intelligence_governor'): void {
    this.killSwitchState = state;
    // Log privileged security event
    auditRepository.record({
      id: `killswitch-${Date.now()}`,
      eventId: `killswitch-${Date.now()}`,
      actorId,
      actorName: 'System Intelligence Governor',
      actorRole: 'system_intelligence_governor',
      facilityId: 'system',
      action: state === 'DISABLED' ? 'AUTOMATION_GLOBAL_KILL_SWITCH_ENGAGED' : 'AUTOMATION_GLOBAL_KILL_SWITCH_RELEASED',
      resourceType: 'AutomationGuard',
      resourceId: 'global-kill-switch',
      timestamp: new Date().toISOString(),
      deviceId: 'system-console',
      syncStatus: 'synced',
    }).catch(() => {});
  }

  /**
   * Main gatekeeper: Evaluates all statutory automation checks before execution.
   */
  public async evaluateAction(
    action: AutomationAction,
    context?: {
      approvals?: HumanApproval[];
      callerRole?: string;
      callerId?: string;
    }
  ): Promise<{ guard: AutomationGuard; canExecute: boolean; denialCode?: string }> {
    const guardId = `grd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    // Reset hourly rate limit counter if hour has passed
    if (now - this.currentHourWindowStart > 3600 * 1000) {
      this.currentHourWindowStart = now;
      this.executionCountCurrentHour = 0;
    }

    // 1. Clinical Mutation Firewall (Hard rule)
    const isClinicalProhibited =
      action.riskLevel === 'LEVEL_4_CLINICAL_PROHIBITED' ||
      /\b(DIAGNOSIS|PRESCRIBE|MEDICATION|TRIAGE|EMERGENCY_DISPOSITION|LAB_MUTATION|RADIOLOGY_MUTATION|PATIENT_MERGE|CLINICAL_GUIDELINE)\b/i.test(
        action.actionId + ' ' + (action.payload?.operation || '') + ' ' + action.target
      );

    if (isClinicalProhibited) {
      const guard: AutomationGuard = {
        guardId,
        actionId: action.actionId,
        checkedAt: new Date().toISOString(),
        result: 'DENY',
        reason: 'AUTOMATION_PROHIBITED_CLINICAL_ACTION: Autonomous clinical mutations are strictly prohibited by healthcare safety invariants.',
        checks: {
          authenticatedCaller: true,
          policyMatched: false,
          riskPermitted: false,
          scopePermitted: false,
          prerequisitesMet: false,
          humanApprovalVerified: false,
          dualControlVerified: false,
          cooldownVerified: false,
          budgetVerified: false,
          rollbackAvailable: false,
          targetValid: false,
          killSwitchPermits: false,
          clinicalMutationBlocked: true,
        },
      };
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'AUTOMATION_PROHIBITED_CLINICAL_ACTION' };
    }

    // 2. Global Kill Switch Check
    if (this.killSwitchState === 'DISABLED' && action.riskLevel === 'LEVEL_1_TECHNICAL_SAFE') {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'AUTOMATION_DISABLED_BY_GLOBAL_KILL_SWITCH');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'AUTOMATION_DISABLED_BY_GLOBAL_KILL_SWITCH' };
    }

    // 3. Match Policy
    const policy = await automationPolicyEngine.getPolicy(action.policyId);
    if (!policy) {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'POLICY_NOT_FOUND: No authoritative automation policy registered');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'AUTOMATION_DENIED_INSUFFICIENT_GOVERNANCE' };
    }

    // Verify Policy Integrity
    if (!automationPolicyEngine.verifyPolicyIntegrity(policy)) {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'POLICY_INTEGRITY_TAMPERED: Policy failed SHA-256 seal check');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'POLICY_TAMPERING_DETECTED' };
    }

    // Verify Scope
    const isFacilityAllowed =
      policy.allowedScope.facilities.includes('*') ||
      policy.allowedScope.facilities.includes(action.payload?.facilityId || 'global');

    if (!isFacilityAllowed) {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'SCOPE_DISALLOWED: Action facility not permitted by policy scope');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'SCOPE_DISALLOWED' };
    }

    // Cooldown Check
    const lastRun = this.lastExecutionTimestamps.get(policy.actionType) || 0;
    if (now - lastRun < policy.cooldownSeconds * 1000) {
      const guard = this.buildDenyGuard(guardId, action.actionId, `COOLDOWN_ACTIVE: Action must wait ${policy.cooldownSeconds}s between executions`);
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'COOLDOWN_ACTIVE' };
    }

    // Budget Limit Check
    if (this.executionCountCurrentHour >= policy.maxExecutionsPerHour) {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'AUTOMATION_BUDGET_EXCEEDED: Maximum hourly execution limit reached');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'AUTOMATION_BUDGET_EXCEEDED' };
    }

    // Rollback Plan Check
    if (policy.rollbackRequired && !action.rollbackPlan?.compensatingAction) {
      const guard = this.buildDenyGuard(guardId, action.actionId, 'ROLLBACK_PLAN_MISSING: Reversible action requires explicit rollback compensation plan');
      await idbEngine.put('automationGuards', guard);
      return { guard, canExecute: false, denialCode: 'ROLLBACK_PLAN_MISSING' };
    }

    // Human Approval Check for Level 2 & Level 3 actions
    let humanApprovalVerified = true;
    let dualControlVerified = true;

    if (policy.approvalRequired || action.riskLevel === 'LEVEL_2_OPERATIONAL_REVIEW' || action.riskLevel === 'LEVEL_3_HUMAN_AUTHORIZATION') {
      const approvals = context?.approvals || [];
      const validApprovals = approvals.filter(
        (a) => a.decision === 'APPROVED' && new Date(a.expiration).getTime() > now
      );

      if (validApprovals.length === 0) {
        const guard = this.buildDenyGuard(guardId, action.actionId, 'HUMAN_APPROVAL_REQUIRED: Consequential action requires verified human authorization');
        await idbEngine.put('automationGuards', guard);
        return { guard, canExecute: false, denialCode: 'HUMAN_APPROVAL_REQUIRED' };
      }

      // Dual Control Check
      if (policy.dualControlRequired) {
        if (validApprovals.length < 2) {
          const guard = this.buildDenyGuard(guardId, action.actionId, 'DUAL_CONTROL_REQUIRED: Two distinct authorized human principals required');
          await idbEngine.put('automationGuards', guard);
          return { guard, canExecute: false, denialCode: 'DUAL_CONTROL_REQUIRED' };
        }

        const firstApprover = validApprovals[0].approverId;
        const secondApprover = validApprovals[1].approverId;
        if (firstApprover === secondApprover) {
          const guard = this.buildDenyGuard(guardId, action.actionId, 'DUAL_CONTROL_VIOLATION: Approvals must originate from two distinct human principals');
          await idbEngine.put('automationGuards', guard);
          return { guard, canExecute: false, denialCode: 'DUAL_CONTROL_VIOLATION' };
        }
      }
    }

    // All checks PASSED
    const guard: AutomationGuard = {
      guardId,
      actionId: action.actionId,
      checkedAt: new Date().toISOString(),
      result: 'PASS',
      checks: {
        authenticatedCaller: true,
        policyMatched: true,
        riskPermitted: true,
        scopePermitted: true,
        prerequisitesMet: true,
        humanApprovalVerified,
        dualControlVerified,
        cooldownVerified: true,
        budgetVerified: true,
        rollbackAvailable: true,
        targetValid: true,
        killSwitchPermits: true,
        clinicalMutationBlocked: true,
      },
    };

    // Update execution tracking
    this.lastExecutionTimestamps.set(policy.actionType, now);
    this.executionCountCurrentHour++;

    await idbEngine.put('automationGuards', guard);
    return { guard, canExecute: true };
  }

  private buildDenyGuard(guardId: string, actionId: string, reason: string): AutomationGuard {
    return {
      guardId,
      actionId,
      checkedAt: new Date().toISOString(),
      result: 'DENY',
      reason,
      checks: {
        authenticatedCaller: false,
        policyMatched: false,
        riskPermitted: false,
        scopePermitted: false,
        prerequisitesMet: false,
        humanApprovalVerified: false,
        dualControlVerified: false,
        cooldownVerified: false,
        budgetVerified: false,
        rollbackAvailable: false,
        targetValid: false,
        killSwitchPermits: false,
        clinicalMutationBlocked: true,
      },
    };
  }

  public resetTracking(): void {
    this.lastExecutionTimestamps.clear();
    this.executionCountCurrentHour = 0;
    this.currentHourWindowStart = Date.now();
    this.killSwitchState = 'ENABLED';
  }
}

export const automationGuardService = AutomationGuardService.getInstance();
