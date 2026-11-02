/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Automation Policy & Rule Governance Engine
 * 
 * INVARIANTS:
 * - Policies must be versioned. Never use hard-coded automation behavior scattered across application code.
 * - Rules must be deterministic and inspectable. Do not hide critical automation logic inside prompts.
 * - Clinical Mutation Policy is hard-coded default DENY_ALL.
 * - SHA-256 tamper-evident integrity for all policies.
 */

import {
  AutomationPolicy,
  AutomationRule,
  ActionRiskClassification,
  computeSha256,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class AutomationPolicyEngine {
  private static instance: AutomationPolicyEngine;

  private policiesCache = new Map<string, AutomationPolicy>();
  private rulesCache = new Map<string, AutomationRule>();

  private constructor() {
    this.seedBaselinePolicies();
  }

  public static getInstance(): AutomationPolicyEngine {
    if (!AutomationPolicyEngine.instance) {
      AutomationPolicyEngine.instance = new AutomationPolicyEngine();
    }
    return AutomationPolicyEngine.instance;
  }

  private seedBaselinePolicies(): void {
    // 1. Safe Technical Retry Policy (LEVEL 1)
    const p1Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-auto-retry-technical-v1',
      name: 'Safe Technical Queue Bounded Retry Policy',
      actionType: 'RETRY_TECHNICAL_QUEUE',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      allowedScope: {
        facilities: ['*'],
        networks: ['*'],
        systems: ['syncQueue', 'outboundExchangeQueue'],
      },
      prerequisites: ['IDEMPOTENCY_KEY_PRESENT', 'NON_EXPIRED_MESSAGE', 'NON_CLINICAL_QUEUE'],
      approvalRequired: false,
      dualControlRequired: false,
      rollbackRequired: true,
      maxExecutionsPerHour: 50,
      cooldownSeconds: 30,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2028-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: false,
      provenance: {
        authorId: 'system_intelligence_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p1: AutomationPolicy = { ...p1Core, integrityHash: computeSha256(p1Core) };
    this.policiesCache.set(p1.policyId, p1);

    // 2. Circuit Breaker Half-Open Probing Policy (LEVEL 1)
    const p2Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-circuit-test-probe-v1',
      name: 'Circuit Breaker Recovery Probe Policy',
      actionType: 'REOPEN_CIRCUIT_BREAKER_PROBE',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      allowedScope: {
        facilities: ['*'],
        networks: ['*'],
        systems: ['integrationCircuitBreakers'],
      },
      prerequisites: ['COOLDOWN_ELAPSED', 'CIRCUIT_STATE_OPEN'],
      approvalRequired: false,
      dualControlRequired: false,
      rollbackRequired: true,
      maxExecutionsPerHour: 20,
      cooldownSeconds: 60,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2028-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: false,
      provenance: {
        authorId: 'system_intelligence_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p2: AutomationPolicy = { ...p2Core, integrityHash: computeSha256(p2Core) };
    this.policiesCache.set(p2.policyId, p2);

    // 3. Derived Analytics Projection Rebuild Policy (LEVEL 1)
    const p3Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-derived-projection-rebuild-v1',
      name: 'Derived Analytics Projection Rebuild Policy',
      actionType: 'REBUILD_DERIVED_PROJECTION',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      allowedScope: {
        facilities: ['*'],
        networks: ['*'],
        systems: ['analyticsProjections', 'derivedMetrics'],
      },
      prerequisites: ['TARGET_IS_DERIVED_DATA', 'AUTHORITATIVE_SOURCE_AVAILABLE'],
      approvalRequired: false,
      dualControlRequired: false,
      rollbackRequired: true,
      maxExecutionsPerHour: 10,
      cooldownSeconds: 120,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2028-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: false,
      provenance: {
        authorId: 'system_intelligence_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p3: AutomationPolicy = { ...p3Core, integrityHash: computeSha256(p3Core) };
    this.policiesCache.set(p3.policyId, p3);

    // 4. Clinical Mutation Hard Boundary Policy (LEVEL 4 - PROHIBITED)
    const p4Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-clinical-mutation-governor-v1',
      name: 'Clinical Mutation Autonomous Prohibition Policy (DENY_ALL)',
      actionType: 'CLINICAL_RECORD_MUTATION',
      riskLevel: 'LEVEL_4_CLINICAL_PROHIBITED',
      allowedScope: {
        facilities: [],
        networks: [],
        systems: [],
      },
      prerequisites: ['NEVER_SATISFIABLE'],
      approvalRequired: true,
      dualControlRequired: true,
      rollbackRequired: true,
      maxExecutionsPerHour: 0,
      cooldownSeconds: 999999,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2099-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: true, // MASTER SAFEGUARD
      provenance: {
        authorId: 'statutory_clinical_safety_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p4: AutomationPolicy = { ...p4Core, integrityHash: computeSha256(p4Core) };
    this.policiesCache.set(p4.policyId, p4);

    // 5. Supply Redistribution Recommendation Policy (LEVEL 2)
    const p5Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-supply-redistribution-v1',
      name: 'Supply Chain Redistribution Recommendation Policy',
      actionType: 'SUPPLY_REDISTRIBUTION_RECOMMENDATION',
      riskLevel: 'LEVEL_2_OPERATIONAL_REVIEW',
      allowedScope: {
        facilities: ['*'],
        networks: ['*'],
        systems: ['supplyChain'],
      },
      prerequisites: ['HUMAN_APPROVAL_RECORDED', 'CONTROLLED_SUBSTANCE_CHECK'],
      approvalRequired: true,
      dualControlRequired: false,
      rollbackRequired: true,
      maxExecutionsPerHour: 10,
      cooldownSeconds: 300,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2028-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: false,
      provenance: {
        authorId: 'system_intelligence_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p5: AutomationPolicy = { ...p5Core, integrityHash: computeSha256(p5Core) };
    this.policiesCache.set(p5.policyId, p5);

    // 6. National Report Submission Policy (LEVEL 3 - DUAL CONTROL)
    const p6Core: Omit<AutomationPolicy, 'integrityHash'> = {
      policyId: 'pol-national-report-submission-v1',
      name: 'National Report Official Submission Governance Policy',
      actionType: 'SUBMIT_NATIONAL_REPORT',
      riskLevel: 'LEVEL_3_HUMAN_AUTHORIZATION',
      allowedScope: {
        facilities: ['*'],
        networks: ['*'],
        systems: ['nationalReporting'],
      },
      prerequisites: ['HUMAN_APPROVAL_RECORDED', 'DUAL_CONTROL_VERIFIED', 'DATASET_VALIDATED'],
      approvalRequired: true,
      dualControlRequired: true, // Requires two distinct authorized principals
      rollbackRequired: true,
      maxExecutionsPerHour: 5,
      cooldownSeconds: 600,
      effectiveFrom: '2026-01-01T00:00:00Z',
      effectiveTo: '2028-12-31T23:59:59Z',
      version: '1.0.0',
      isClinicalProhibited: false,
      provenance: {
        authorId: 'system_intelligence_governor',
        approvedAt: '2026-01-01T00:00:00Z',
      },
    };
    const p6: AutomationPolicy = { ...p6Core, integrityHash: computeSha256(p6Core) };
    this.policiesCache.set(p6.policyId, p6);
  }

  public async registerPolicy(policy: Omit<AutomationPolicy, 'integrityHash'>): Promise<AutomationPolicy> {
    const integrityHash = computeSha256(policy);
    const fullPolicy: AutomationPolicy = {
      ...policy,
      integrityHash,
    };

    this.policiesCache.set(fullPolicy.policyId, fullPolicy);
    await idbEngine.put('automationPolicies', fullPolicy);
    return fullPolicy;
  }

  public async getPolicy(policyId: string): Promise<AutomationPolicy | null> {
    if (this.policiesCache.has(policyId)) {
      return this.policiesCache.get(policyId)!;
    }
    try {
      const stored = await idbEngine.get<AutomationPolicy>('automationPolicies', policyId);
      if (stored) {
        this.policiesCache.set(policyId, stored);
        return stored;
      }
    } catch {
      // fallback
    }
    return null;
  }

  public async getPolicies(): Promise<AutomationPolicy[]> {
    try {
      const stored = await idbEngine.getAll<AutomationPolicy>('automationPolicies');
      if (stored && stored.length > 0) return stored;
    } catch {
      // fallback
    }
    return Array.from(this.policiesCache.values());
  }

  public async registerRule(rule: AutomationRule): Promise<AutomationRule> {
    this.rulesCache.set(rule.ruleId, rule);
    await idbEngine.put('automationRules', rule);
    return rule;
  }

  public async getRules(): Promise<AutomationRule[]> {
    try {
      const stored = await idbEngine.getAll<AutomationRule>('automationRules');
      if (stored && stored.length > 0) return stored;
    } catch {
      // fallback
    }
    return Array.from(this.rulesCache.values());
  }

  /**
   * Verifies policy tamper-evident integrity hash.
   */
  public verifyPolicyIntegrity(policy: AutomationPolicy): boolean {
    const { integrityHash, ...rest } = policy;
    const computed = computeSha256(rest);
    return computed === integrityHash;
  }
}

export const automationPolicyEngine = AutomationPolicyEngine.getInstance();
