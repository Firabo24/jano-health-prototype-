/**
 * Jano Health - Population Privacy & Small-Cell Protection Engine
 * Clinical Core V14: Minimum-Necessary Disclosure and Small-Cell Suppression
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Population datasets must NEVER expose patient names, phone numbers,
 *    national IDs, addresses, or MRNs in general dashboards.
 * 2. Small-cell suppression: If an analytical group contains fewer than the
 *    configured threshold (minimumPopulationCount), it MUST be suppressed,
 *    aggregated upward, or marked unavailable.
 * 3. Patient-level drill-down is heavily restricted, requires explicit
 *    authorization, and ALWAYS produces a security audit event.
 */

import {
  MetricResult,
  MetricSeriesPoint,
  PopulationCohort,
  PrivacyProtectionStrategy,
  PrivacySuppressionRule,
} from '../../domain/analyticsTypes';
import { auditService } from '../audit/auditService';

export const DEFAULT_PRIVACY_RULE: PrivacySuppressionRule = {
  minimumPopulationCount: 5,
  strategy: 'SUPPRESSION',
  logAuditOnSuppression: true,
};

export class SmallCellPrivacyEngine implements PrivacyProtectionStrategy {
  public readonly name = 'SmallCellPrivacyEngine';
  private static instance: SmallCellPrivacyEngine;
  private currentRule: PrivacySuppressionRule = { ...DEFAULT_PRIVACY_RULE };

  private constructor() {}

  public static getInstance(): SmallCellPrivacyEngine {
    if (!SmallCellPrivacyEngine.instance) {
      SmallCellPrivacyEngine.instance = new SmallCellPrivacyEngine();
    }
    return SmallCellPrivacyEngine.instance;
  }

  public getRule(): PrivacySuppressionRule {
    return { ...this.currentRule };
  }

  public updateRule(newRule: Partial<PrivacySuppressionRule>): void {
    if (newRule.minimumPopulationCount !== undefined && newRule.minimumPopulationCount < 1) {
      throw new Error('INVALID_PRIVACY_RULE: minimumPopulationCount must be at least 1.');
    }
    this.currentRule = { ...this.currentRule, ...newRule };
  }

  /**
   * Applies small-cell privacy protection to a population cohort.
   * If aggregateCount < minimumPopulationCount, suppresses breakdowns and marks as suppressed.
   */
  public protectCohort(
    cohort: PopulationCohort,
    minCount: number = this.currentRule.minimumPopulationCount
  ): PopulationCohort {
    if (cohort.aggregateCount > 0 && cohort.aggregateCount < minCount) {
      return {
        ...cohort,
        isSuppressed: true,
        breakdowns: {
          byAgeGroup: { '[SUPPRESSED]': cohort.aggregateCount },
          byGender: { '[SUPPRESSED]': cohort.aggregateCount },
          byFacility: { '[SUPPRESSED]': cohort.aggregateCount },
        },
      };
    }

    // Filter small cells within breakdowns
    const sanitizeBreakdown = (map: Record<string, number>): Record<string, number> => {
      const sanitized: Record<string, number> = {};
      let suppressedTotal = 0;
      for (const [key, val] of Object.entries(map)) {
        if (val > 0 && val < minCount) {
          suppressedTotal += val;
        } else {
          sanitized[key] = val;
        }
      }
      if (suppressedTotal > 0) {
        sanitized['[OTHER_OR_SUPPRESSED]'] = (sanitized['[OTHER_OR_SUPPRESSED]'] || 0) + suppressedTotal;
      }
      return sanitized;
    };

    return {
      ...cohort,
      isSuppressed: false,
      breakdowns: {
        byAgeGroup: sanitizeBreakdown(cohort.breakdowns.byAgeGroup),
        byGender: sanitizeBreakdown(cohort.breakdowns.byGender),
        byFacility: sanitizeBreakdown(cohort.breakdowns.byFacility),
      },
    };
  }

  /**
   * Applies privacy protection to a metric calculation series.
   */
  public protectMetricResult(
    result: MetricResult,
    minCount: number = this.currentRule.minimumPopulationCount
  ): MetricResult {
    const isOverallSuppressed = result.summaryValue > 0 && result.summaryValue < minCount;

    const protectedPoints: MetricSeriesPoint[] = result.points.map((pt) => {
      if (pt.value > 0 && pt.value < minCount) {
        return {
          ...pt,
          value: -1, // -1 denotes suppressed value in metric series
          isSuppressed: true,
        };
      }
      return {
        ...pt,
        isSuppressed: false,
      };
    });

    return {
      ...result,
      isSuppressed: isOverallSuppressed,
      points: protectedPoints,
    };
  }

  /**
   * Authorizes and audits sensitive patient-level drill-down from an aggregate metric.
   * Fails closed if the actor does not possess authorized purpose.
   */
  public async authorizeDrillDown(params: {
    actorId: string;
    actorRole: string;
    facilityId: string;
    purpose: string;
    cohortId?: string;
    metricId?: string;
    reason: string;
  }): Promise<{ allowed: boolean; auditId: string }> {
    if (!params.purpose || !params.reason) {
      throw new Error('DRILL_DOWN_DENIED: Purpose and clinical/investigative justification are strictly required.');
    }

    const authorizedRoles = [
      'system_intelligence_admin',
      'public_health_intelligence_user',
      'clinical_supervisor',
      'system_administrator',
    ];

    const isAuthorized = authorizedRoles.includes(params.actorRole);
    if (!isAuthorized) {
      await auditService.log({
        action: 'ACCESS_DENIED',
        resourceType: 'PatientDrillDown',
        resourceId: params.cohortId || params.metricId || 'aggregate',
        actorId: params.actorId,
        facilityId: params.facilityId,
        details: {
          attempt: 'PATIENT_LEVEL_DRILL_DOWN',
          reason: params.reason,
          deniedRole: params.actorRole,
        },
      });
      throw new Error(`DRILL_DOWN_DENIED: Role '${params.actorRole}' is not authorized for patient-level aggregate drill-down.`);
    }

    const auditEntry = await auditService.log({
      action: 'EXPORT',
      resourceType: 'PatientDrillDown',
      resourceId: params.cohortId || params.metricId || 'aggregate',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        authorizationBasis: 'APPROVED_INVESTIGATION',
        purpose: params.purpose,
        reason: params.reason,
      },
    });

    return { allowed: true, auditId: auditEntry.id };
  }
}

export const smallCellPrivacyEngine = SmallCellPrivacyEngine.getInstance();
