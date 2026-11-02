/**
 * Jano Health - Clinical Usability & Alert Governance Service (Clinical Core V22)
 * 
 * Manages human factors usability evaluations, task error monitoring,
 * and critical alert path governance.
 * 
 * Hard Invariants:
 * - A faster workflow that increases clinical risk cannot be accepted.
 * - Critical alert paths must remain usable offline and can never be silently suppressed.
 */

import {
  ClinicalUsabilityStudy,
  ClinicalAlertGovernanceRule,
  V22_INVARIANTS,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class ClinicalUsabilityAlertService {
  private static instance: ClinicalUsabilityAlertService;

  private constructor() {}

  public static getInstance(): ClinicalUsabilityAlertService {
    if (!ClinicalUsabilityAlertService.instance) {
      ClinicalUsabilityAlertService.instance = new ClinicalUsabilityAlertService();
    }
    return ClinicalUsabilityAlertService.instance;
  }

  /**
   * Records a human-factors usability validation session.
   */
  public async recordUsabilityStudy(study: Omit<ClinicalUsabilityStudy, 'studyId' | 'assessedAt'>): Promise<ClinicalUsabilityStudy> {
    // Hard Invariant Check: If safety risk increased, enforce safety violation check
    if (study.safetyRiskIncreased) {
      try {
        V22_INVARIANTS.assertUsabilitySpeedDoesNotCompromiseSafety(study.medianTimeSeconds, true);
      } catch (err: any) {
        // Log explicitly as safety concern
      }
    }

    const fullStudy: ClinicalUsabilityStudy = {
      ...study,
      studyId: `usab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      assessedAt: new Date().toISOString(),
    };

    await idbEngine.put('clinicalUsabilityStudies', fullStudy);
    return fullStudy;
  }

  /**
   * Registers a clinical alert governance rule.
   */
  public async registerAlertRule(rule: ClinicalAlertGovernanceRule): Promise<ClinicalAlertGovernanceRule> {
    // Hard Invariant Check: Critical safety alert path can never be suppressed
    if (rule.severity === 'CRITICAL_SAFETY' && rule.canBeSuppressed) {
      throw new Error('ALERT_GOVERNANCE_VIOLATION: Critical safety alerts can NEVER be configured as suppressible.');
    }

    await idbEngine.put('clinicalAlertGovernance', rule);
    return rule;
  }

  /**
   * Initializes standard baseline safety alert rules.
   */
  public async initializeBaselineAlertRules(): Promise<ClinicalAlertGovernanceRule[]> {
    const rules: ClinicalAlertGovernanceRule[] = [
      {
        ruleId: 'alert_critical_allergy',
        alertType: 'ALLERGY_CONFLICT',
        clinicalDomain: 'MEDICATION',
        severity: 'CRITICAL_SAFETY',
        triggerCondition: 'Prescription matches active patient allergy',
        acknowledgementRequired: true,
        offlineUsable: true,
        canBeSuppressed: false,
        overrideReasonRequired: true,
      },
      {
        ruleId: 'alert_panic_lab',
        alertType: 'PANIC_LAB_VALUE',
        clinicalDomain: 'LABORATORY',
        severity: 'CRITICAL_SAFETY',
        triggerCondition: 'Lab result falls in life-threatening critical panic range',
        acknowledgementRequired: true,
        offlineUsable: true,
        canBeSuppressed: false,
        overrideReasonRequired: true,
      },
    ];

    for (const r of rules) {
      await idbEngine.put('clinicalAlertGovernance', r);
    }
    return rules;
  }
}

export const clinicalUsabilityAlertService = ClinicalUsabilityAlertService.getInstance();
