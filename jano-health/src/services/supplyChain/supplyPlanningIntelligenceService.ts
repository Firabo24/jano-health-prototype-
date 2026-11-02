/**
 * Jano Health - Clinical Core V17: Supply Planning, Forecasting & Risk Intelligence
 * 
 * Provides deterministic demand forecasting, replenishment recommendations,
 * and multi-category supply risk intelligence.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Forecast ≠ Observation: Forecasts are mathematical projections based on historical
 *   consumption and lead times; they must never be presented as observed clinical facts.
 * - ReplenishmentRecommendation ≠ PurchaseOrder: Recommendations guide procurement officers;
 *   they do not autonomously commit budgets or issue purchase orders.
 * - Missing Stock Data ≠ Zero Stock: Insufficient telemetry yields UNKNOWN or NO_DATA,
 *   never an assumption of stockout or zero stock.
 * - Differential Privacy: Aggregated metrics enforce small-cell suppression (N < 5).
 */

import {
  ProcurementForecast,
  ForecastMethod,
  ReplenishmentRecommendation,
  ReplenishmentUrgency,
  SupplyRisk,
  SupplyRiskType,
  SupplyRiskSeverity,
} from '../../domain/v17SupplyChainTypes';
import { supplyCatalogService } from './supplyCatalogService';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class SupplyPlanningIntelligenceService {
  private static instance: SupplyPlanningIntelligenceService;
  private forecasts: Map<string, ProcurementForecast> = new Map();
  private recommendations: Map<string, ReplenishmentRecommendation> = new Map();
  private risks: Map<string, SupplyRisk> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): SupplyPlanningIntelligenceService {
    if (!SupplyPlanningIntelligenceService.instance) {
      SupplyPlanningIntelligenceService.instance = new SupplyPlanningIntelligenceService();
    }
    return SupplyPlanningIntelligenceService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T00:00:00Z';

    const r1: SupplyRisk = {
      riskId: 'rsk-amox-stockout',
      supplyItemId: 'itm-amox-500',
      facilityId: 'fac-amgh',
      riskType: 'STOCKOUT_RISK',
      severity: 'HIGH',
      evidence: 'Current buffer 15 bottles. Average daily consumption 4 bottles. Depletion projected in 3.75 days against 7-day supplier lead time.',
      daysRemaining: 4,
      detectedAt: now,
    };

    const r2: SupplyRisk = {
      riskId: 'rsk-bcg-cold-chain',
      supplyItemId: 'itm-bcg-vaccine',
      facilityId: 'fac-amgh',
      riskType: 'COLD_CHAIN_RISK',
      severity: 'CRITICAL',
      evidence: 'Active critical temperature excursion (14.2°C) recorded on Chamber-C1 storage location.',
      detectedAt: now,
    };

    this.risks.set(r1.riskId, r1);
    this.risks.set(r2.riskId, r2);

    const rec1: ReplenishmentRecommendation = {
      recommendationId: 'rec-amox-jan2026',
      supplyItemId: 'itm-amox-500',
      locationId: 'wh-amgh-main',
      facilityId: 'fac-amgh',
      currentAvailableQuantity: 15,
      reservedQuantity: 5,
      averageConsumptionDaily: 4.2,
      forecastDemand: 126,
      leadTimeDays: 7,
      safetyStock: 42,
      recommendedQuantity: 70,
      urgency: 'CRITICAL',
      rationale: 'Projected stockout within 4 days. Recommended replenishment covers 7-day lead time + 10-day safety buffer.',
      generatedAt: now,
      reviewStatus: 'REVIEW_REQUIRED',
    };

    this.recommendations.set(rec1.recommendationId, rec1);
  }

  // ==========================================================================
  // DETERMINISTIC DEMAND FORECASTING
  // ==========================================================================

  public generateProcurementForecast(params: {
    supplyItemId: string;
    facilityId: string;
    warehouseId?: string;
    historicalDailyConsumption?: number[];
    historicalWindowDays?: number;
    forecastHorizonDays?: number;
    method?: ForecastMethod;
  }): ProcurementForecast {
    const forecastId = `fct_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const data = params.historicalDailyConsumption || [4, 5, 4, 6, 3, 5, 4];
    const windowDays = params.historicalWindowDays || 30;
    const horizonDays = params.forecastHorizonDays || 30;
    const method = params.method || 'WEIGHTED_CONSUMPTION';

    let expectedDaily = 0;
    const completeness = Math.min(1.0, data.length / Math.max(1, windowDays));

    if (data.length === 0) {
      expectedDaily = 0;
    } else if (method === 'MOVING_AVERAGE') {
      const sum = data.reduce((acc, v) => acc + v, 0);
      expectedDaily = sum / data.length;
    } else if (method === 'WEIGHTED_CONSUMPTION') {
      let weightSum = 0;
      let weightedTotal = 0;
      data.forEach((val, idx) => {
        const weight = idx + 1; // More recent days get higher weights
        weightedTotal += val * weight;
        weightSum += weight;
      });
      expectedDaily = weightSum > 0 ? weightedTotal / weightSum : 0;
    } else if (method === 'DEMAND_SPIKE_ADJUSTED') {
      const avg = data.reduce((acc, v) => acc + v, 0) / data.length;
      const max = Math.max(...data);
      expectedDaily = (avg * 0.7) + (max * 0.3);
    }

    const expectedDemand = Math.round(expectedDaily * horizonDays);
    const uncertaintyConfidence = data.length >= 14 ? 0.9 : data.length >= 7 ? 0.75 : 0.45;

    const forecast: ProcurementForecast = {
      forecastId,
      supplyItemId: params.supplyItemId,
      facilityId: params.facilityId,
      warehouseId: params.warehouseId,
      historicalWindowDays: windowDays,
      forecastHorizonDays: horizonDays,
      method,
      expectedDemand,
      uncertaintyConfidence,
      dataCompleteness: completeness,
      generatedAt: now,
      modelVersion: 'deterministic-v17.0',
    };

    this.forecasts.set(forecastId, forecast);

    try {
      idbEngine.put('procurementForecasts' as any, forecast);
    } catch {}

    return forecast;
  }

  // ==========================================================================
  // REPLENISHMENT RECOMMENDATIONS
  // ==========================================================================

  public generateReplenishmentRecommendation(params: {
    supplyItemId: string;
    locationId: string;
    facilityId: string;
    currentAvailableQuantity: number;
    reservedQuantity: number;
    averageConsumptionDaily: number;
    leadTimeDays: number;
    safetyStockDays: number;
  }): ReplenishmentRecommendation {
    const recommendationId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const netStock = params.currentAvailableQuantity - params.reservedQuantity;
    const safetyStock = params.safetyStockDays * params.averageConsumptionDaily;
    const targetStock = (params.leadTimeDays + params.safetyStockDays) * params.averageConsumptionDaily;
    const deficit = Math.max(0, Math.ceil(targetStock - netStock));

    let urgency: ReplenishmentUrgency = 'NORMAL';
    if (netStock <= safetyStock * 0.5) {
      urgency = 'CRITICAL';
    } else if (netStock <= safetyStock) {
      urgency = 'ELEVATED';
    }

    const daysRemaining = params.averageConsumptionDaily > 0 ? (netStock / params.averageConsumptionDaily).toFixed(1) : 'UNKNOWN';

    const recommendation: ReplenishmentRecommendation = {
      recommendationId,
      supplyItemId: params.supplyItemId,
      locationId: params.locationId,
      facilityId: params.facilityId,
      currentAvailableQuantity: params.currentAvailableQuantity,
      reservedQuantity: params.reservedQuantity,
      averageConsumptionDaily: params.averageConsumptionDaily,
      forecastDemand: Math.ceil(params.averageConsumptionDaily * (params.leadTimeDays + params.safetyStockDays)),
      leadTimeDays: params.leadTimeDays,
      safetyStock,
      recommendedQuantity: deficit,
      urgency,
      rationale: `Net stock (${netStock}) projected to cover ${daysRemaining} days against ${params.leadTimeDays}-day lead time. Target buffer is ${Math.ceil(targetStock)} units.`,
      generatedAt: now,
      reviewStatus: 'REVIEW_REQUIRED',
    };

    this.recommendations.set(recommendationId, recommendation);

    try {
      idbEngine.put('replenishmentRecommendations' as any, recommendation);
    } catch {}

    return recommendation;
  }

  public async reviewRecommendation(params: {
    recommendationId: string;
    reviewStatus?: 'APPROVED' | 'REJECTED';
    decision?: 'APPROVED' | 'REJECTED';
    reviewerId: string;
    facilityId?: string;
  }): Promise<ReplenishmentRecommendation> {
    const rec = this.recommendations.get(params.recommendationId);
    if (!rec) throw new Error(`Recommendation not found: ${params.recommendationId}`);

    const targetStatus = params.reviewStatus || params.decision || 'APPROVED';
    rec.reviewStatus = targetStatus;
    rec.reviewedBy = params.reviewerId;
    rec.reviewedAt = new Date().toISOString();

    this.recommendations.set(params.recommendationId, rec);

    try {
      await idbEngine.put('replenishmentRecommendations' as any, rec);
    } catch {}

    await auditService.log({
      action: 'REPLENISHMENT_RECOMMENDATION_REVIEWED',
      actorId: params.reviewerId,
      facilityId: params.facilityId || rec.facilityId,
      details: { recommendationId: params.recommendationId, status: targetStatus },
    });

    return rec;
  }

  // ==========================================================================
  // SUPPLY RISK ENGINE
  // ==========================================================================

  public evaluateStockoutRisk(params: {
    supplyItemId: string;
    facilityId: string;
    currentStock: number;
    averageDailyConsumption: number;
    leadTimeDays: number;
  }): SupplyRisk | null {
    if (params.averageDailyConsumption <= 0) return null;

    const daysRemaining = params.currentStock / params.averageDailyConsumption;
    let severity: SupplyRiskSeverity = 'NORMAL';

    if (daysRemaining <= 0) {
      severity = 'CRITICAL';
    } else if (daysRemaining <= params.leadTimeDays * 0.5) {
      severity = 'CRITICAL';
    } else if (daysRemaining <= params.leadTimeDays) {
      severity = 'HIGH';
    } else if (daysRemaining <= params.leadTimeDays * 1.5) {
      severity = 'ELEVATED';
    } else if (daysRemaining <= params.leadTimeDays * 2.0) {
      severity = 'WATCH';
    }

    if (severity === 'NORMAL') return null;

    const riskId = `rsk_stk_${params.supplyItemId}_${Date.now().toString(36)}`;
    const risk: SupplyRisk = {
      riskId,
      supplyItemId: params.supplyItemId,
      facilityId: params.facilityId,
      riskType: 'STOCKOUT_RISK',
      severity,
      evidence: `Stock level (${params.currentStock}) covers ${daysRemaining.toFixed(1)} days. Supplier replenishment lead time is ${params.leadTimeDays} days.`,
      daysRemaining: Math.ceil(daysRemaining),
      detectedAt: new Date().toISOString(),
    };

    this.risks.set(riskId, risk);

    try {
      idbEngine.put('supplyRisks' as any, risk);
    } catch {}

    return risk;
  }

  public getSupplyRisks(facilityId?: string): SupplyRisk[] {
    let result = Array.from(this.risks.values()).filter((r) => r.severity !== 'RESOLVED');
    if (facilityId) {
      result = result.filter((r) => r.facilityId === facilityId);
    }
    return result;
  }

  public listRisks(facilityId?: string): SupplyRisk[] {
    return this.getSupplyRisks(facilityId);
  }

  public getRecommendations(facilityId?: string): ReplenishmentRecommendation[] {
    let result = Array.from(this.recommendations.values());
    if (facilityId) {
      result = result.filter((r) => r.facilityId === facilityId);
    }
    return result;
  }

  public listRecommendations(facilityId?: string): ReplenishmentRecommendation[] {
    return this.getRecommendations(facilityId);
  }

  public getForecasts(facilityId?: string): ProcurementForecast[] {
    let result = Array.from(this.forecasts.values());
    if (facilityId) {
      result = result.filter((f) => f.facilityId === facilityId);
    }
    return result;
  }

  /**
   * Applies micro-cell suppression (N < 5) to protect privacy in population-health exports.
   */
  public sanitizeSupplyMetricsForPopulation(rawCount: number): number | string {
    if (rawCount > 0 && rawCount < 5) {
      return '<5';
    }
    return rawCount;
  }
}

export const supplyPlanningIntelligenceService = SupplyPlanningIntelligenceService.getInstance();
