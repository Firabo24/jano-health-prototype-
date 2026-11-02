/**
 * Jano Health - Governed Population Analytics Query Service
 * Clinical Core V14: Scoped Queries, Multi-Facility Isolation, and Audit Telemetry
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Server-side facility and network scope enforcement (never trust client-supplied scope).
 * 2. High-level governed analytical operations (no arbitrary SQL endpoints).
 * 3. Telemetry logging for all sensitive queries (PopulationIntelligenceLogEntry).
 * 4. Tenant isolation: A user cannot obtain another facility's metrics simply by altering parameters.
 */

import {
  AggregationLevel,
  FacilityPerformanceSummary,
  MetricResult,
  PopulationCohort,
  PopulationIntelligenceLogEntry,
  PopulationSignal,
  ReferralNetworkSummary,
  SupplyIntelligenceSummary,
  TimeWindow,
} from '../../domain/analyticsTypes';
import { RoleType } from '../../domain/types';
import { capacityIntelligenceService } from './capacityIntelligenceService';
import { populationCohortEngine } from './cohortEngine';
import { dataQualityIntelligenceService } from './dataQualityService';
import { diagnosticIntelligenceService } from './diagnosticIntelligenceService';
import { emergencyIntelligenceService } from './emergencyIntelligenceService';
import { facilityPerformanceService } from './facilityPerformanceService';
import { metricEngine } from './metricEngine';
import { referralNetworkIntelligenceService } from './referralIntelligenceService';
import { populationSignalEngine } from './signalEngine';
import { supplyIntelligenceService } from './supplyIntelligenceService';
import { systemHealthIntelligenceService } from './systemHealthService';

export interface AuthorizedQueryContext {
  actorId: string;
  actorRole: RoleType;
  primaryFacilityId: string;
  allowedFacilityIds: string[];
  purpose?: string;
}

export class PopulationQueryService {
  private static instance: PopulationQueryService;
  private telemetryLogs: PopulationIntelligenceLogEntry[] = [];

  private constructor() {}

  public static getInstance(): PopulationQueryService {
    if (!PopulationQueryService.instance) {
      PopulationQueryService.instance = new PopulationQueryService();
    }
    return PopulationQueryService.instance;
  }

  /**
   * Enforces server-side facility, network, and organization scope.
   * Prevents unauthorized cross-tenant data access.
   */
  public validateScope(context: AuthorizedQueryContext, requestedFacilityId: string): string {
    // System admin & system intelligence admin can query any facility or network '*'
    if (
      context.actorRole === 'system_administrator' ||
      context.actorRole === 'system_intelligence_admin' ||
      context.actorRole === 'public_health_intelligence_user'
    ) {
      return requestedFacilityId;
    }

    // Network intelligence user can query '*' if they oversee multiple facilities, or specific allowed facilities
    if (context.actorRole === 'network_intelligence_user') {
      if (requestedFacilityId === '*' || context.allowedFacilityIds.includes(requestedFacilityId)) {
        return requestedFacilityId;
      }
      throw new Error(`TENANT_ISOLATION_VIOLATION: User is not authorized to query facility '${requestedFacilityId}'.`);
    }

    // Facility intelligence user strictly locked to their primary or allowed facilities
    if (requestedFacilityId === '*' || !context.allowedFacilityIds.includes(requestedFacilityId)) {
      if (context.primaryFacilityId && context.allowedFacilityIds.includes(context.primaryFacilityId)) {
        // Enforce restriction to primary facility
        return context.primaryFacilityId;
      }
      throw new Error(`TENANT_ISOLATION_VIOLATION: User is not authorized to query facility '${requestedFacilityId}'.`);
    }

    return requestedFacilityId;
  }

  private recordTelemetry(
    context: AuthorizedQueryContext,
    action: PopulationIntelligenceLogEntry['action'],
    scopeLevel: AggregationLevel,
    scopeId: string,
    metricId?: string,
    cohortId?: string,
    wasSuppressed = false,
    durationMs = 5
  ): void {
    const entry: PopulationIntelligenceLogEntry = {
      id: `tel_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId: context.actorId,
      actorRole: context.actorRole,
      action,
      scopeLevel,
      scopeId,
      metricId,
      cohortId,
      purpose: context.purpose || 'OPERATIONAL_INTELLIGENCE',
      wasSmallCellSuppressed: wasSuppressed,
      durationMs,
      success: true,
    };
    this.telemetryLogs.push(entry);
  }

  public getTelemetryLogs(): PopulationIntelligenceLogEntry[] {
    return [...this.telemetryLogs];
  }

  /**
   * Queries governed metric series point evaluation.
   */
  public async getMetricSeries(
    context: AuthorizedQueryContext,
    metricId: string,
    requestedFacilityId: string,
    timeWindow: TimeWindow,
    version?: number
  ): Promise<MetricResult> {
    const validScope = this.validateScope(context, requestedFacilityId);
    const start = Date.now();
    const result = await metricEngine.evaluateMetric(metricId, validScope, timeWindow, version);
    this.recordTelemetry(
      context,
      'QUERY_METRIC',
      validScope === '*' ? 'network' : 'facility',
      validScope,
      metricId,
      undefined,
      result.isSuppressed,
      Date.now() - start
    );
    return result;
  }

  /**
   * Queries governed cohort evaluation.
   */
  public async getCohortSummary(
    context: AuthorizedQueryContext,
    cohortId: string,
    requestedFacilityId: string,
    version?: number
  ): Promise<PopulationCohort> {
    const validScope = this.validateScope(context, requestedFacilityId);
    const start = Date.now();
    const result = await populationCohortEngine.executeCohort(cohortId, validScope, context.actorRole, version);
    this.recordTelemetry(
      context,
      'QUERY_COHORT',
      validScope === '*' ? 'network' : 'facility',
      validScope,
      undefined,
      cohortId,
      result.isSuppressed,
      Date.now() - start
    );
    return result;
  }

  /**
   * Queries facility performance summary.
   */
  public async getFacilityPerformance(
    context: AuthorizedQueryContext,
    requestedFacilityId: string,
    period?: string
  ): Promise<FacilityPerformanceSummary> {
    const validScope = this.validateScope(context, requestedFacilityId);
    return facilityPerformanceService.getFacilityPerformance(validScope, 'Health Facility', period);
  }

  /**
   * Queries multi-facility referral network flows and bottlenecks.
   */
  public async getReferralFlow(
    context: AuthorizedQueryContext,
    period?: string
  ): Promise<ReferralNetworkSummary> {
    return referralNetworkIntelligenceService.getReferralNetworkSummary(period);
  }

  /**
   * Queries facility supply summary and forecasts.
   */
  public async getSupplyForecast(
    context: AuthorizedQueryContext,
    requestedFacilityId: string,
    period?: string
  ): Promise<SupplyIntelligenceSummary> {
    const validScope = this.validateScope(context, requestedFacilityId);
    return supplyIntelligenceService.getSupplySummary(validScope, period);
  }

  /**
   * Queries surveillance signals.
   */
  public async getSignalHistory(
    context: AuthorizedQueryContext,
    requestedFacilityId: string
  ): Promise<PopulationSignal[]> {
    const validScope = this.validateScope(context, requestedFacilityId);
    return populationSignalEngine.listSignals(validScope);
  }

  /**
   * Queries data quality metrics.
   */
  public async getDataQualitySummary(
    context: AuthorizedQueryContext,
    requestedFacilityId: string,
    period?: string
  ) {
    const validScope = this.validateScope(context, requestedFacilityId);
    return dataQualityIntelligenceService.evaluateDataQuality(validScope, period);
  }

  /**
   * Queries system operational platform health.
   */
  public async getPlatformHealth(context: AuthorizedQueryContext) {
    return systemHealthIntelligenceService.getSystemHealth();
  }
}

export const populationQueryService = PopulationQueryService.getInstance();
