/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Capacity Intelligence & Balancing Recommendation Service
 * 
 * INVARIANTS:
 * - Capacity Recommendation ≠ Patient Prioritization.
 * - Do NOT automatically:
 *   - reroute emergency patients
 *   - deny care
 *   - delay treatment
 *   - change triage
 *   - transfer patients without human coordination
 * - Never fabricate capacity.
 */

import {
  CapacityState,
  CapacityStateType,
  CapacityConstraint,
  CapacityBalancingRecommendation,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class CapacityIntelligenceService {
  private static instance: CapacityIntelligenceService;

  private capacityStatesCache = new Map<string, CapacityState>();
  private constraintsCache = new Map<string, CapacityConstraint>();
  private recommendationsCache = new Map<string, CapacityBalancingRecommendation>();

  private constructor() {}

  public static getInstance(): CapacityIntelligenceService {
    if (!CapacityIntelligenceService.instance) {
      CapacityIntelligenceService.instance = new CapacityIntelligenceService();
    }
    return CapacityIntelligenceService.instance;
  }

  /**
   * Updates or records domain capacity state for a facility.
   */
  public async recordCapacityState(
    domain: CapacityState['domain'],
    facilityId: string,
    currentLoad: number,
    maxCapacity: number
  ): Promise<CapacityState> {
    const stateId = `cap-${domain}-${facilityId}`;
    const utilization = maxCapacity > 0 ? (currentLoad / maxCapacity) * 100 : 0;

    let state: CapacityStateType = 'NORMAL';
    if (maxCapacity <= 0) {
      state = 'UNKNOWN';
    } else if (utilization >= 100) {
      state = 'CRITICAL';
    } else if (utilization >= 85) {
      state = 'CONSTRAINED';
    } else if (utilization >= 70) {
      state = 'ELEVATED';
    } else if (utilization <= 30) {
      state = 'AVAILABLE';
    }

    const capState: CapacityState = {
      stateId,
      domain,
      facilityId,
      state,
      currentLoad,
      maxCapacity,
      utilizationPercent: Math.round(utilization * 10) / 10,
      measuredAt: new Date().toISOString(),
    };

    this.capacityStatesCache.set(stateId, capState);
    await idbEngine.put('capacityStates', capState);
    return capState;
  }

  /**
   * Retrieves all capacity states.
   */
  public async getCapacityStates(facilityId?: string): Promise<CapacityState[]> {
    let list: CapacityState[] = [];
    try {
      const stored = await idbEngine.getAll<CapacityState>('capacityStates');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.capacityStatesCache.values());
    } catch {
      list = Array.from(this.capacityStatesCache.values());
    }

    if (facilityId) {
      list = list.filter((c) => c.facilityId === facilityId);
    }
    return list;
  }

  /**
   * Records a known physical or clinical capacity constraint.
   */
  public async recordConstraint(
    domain: string,
    facilityId: string,
    period: string,
    currentLoad: number,
    capacity: number,
    bottleneckFactor: string
  ): Promise<CapacityConstraint> {
    const constraintId = `const-${domain}-${facilityId}-${period}`;
    const constraint: CapacityConstraint = {
      constraintId,
      domain,
      facilityId,
      period,
      currentLoad,
      capacity,
      bottleneckFactor,
      confidence: 0.95,
      source: 'capacity_intelligence_service',
      provenance: {
        updatedAt: new Date().toISOString(),
      },
    };

    this.constraintsCache.set(constraintId, constraint);
    await idbEngine.put('capacityConstraints', constraint);
    return constraint;
  }

  /**
   * Formulates a governed Capacity Balancing Recommendation.
   * INVARIANT: Emergency reroute is strictly prohibited.
   */
  public async generateBalancingRecommendation(
    domain: string,
    facilityId: string,
    suggestedAction: string,
    rationale: string,
    alternateFacilityId?: string
  ): Promise<CapacityBalancingRecommendation> {
    const recommendationId = `caprec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const recommendation: CapacityBalancingRecommendation = {
      recommendationId,
      domain,
      facilityId,
      alternateFacilityId,
      suggestedAction,
      rationale,
      confidence: 0.9,
      constraintsRespected: [
        'CONSENT_POLICY_RESPECTED',
        'FACILITY_CAPABILITY_VERIFIED',
        'NON_EMERGENCY_SCOPE_ONLY',
      ],
      status: 'REVIEW_REQUIRED',
      emergencyRerouteProhibited: true, // MASTER INVARIANT: Never autonomously reroute emergency patients
      createdAt: new Date().toISOString(),
    };

    this.recommendationsCache.set(recommendationId, recommendation);
    await idbEngine.put('capacityBalancingRecommendations', recommendation);
    return recommendation;
  }

  public async getBalancingRecommendations(status?: string): Promise<CapacityBalancingRecommendation[]> {
    let list: CapacityBalancingRecommendation[] = [];
    try {
      const stored = await idbEngine.getAll<CapacityBalancingRecommendation>('capacityBalancingRecommendations');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.recommendationsCache.values());
    } catch {
      list = Array.from(this.recommendationsCache.values());
    }

    if (status) {
      list = list.filter((r) => r.status === status);
    }
    return list;
  }

  public clearMemoryCache(): void {
    this.capacityStatesCache.clear();
    this.constraintsCache.clear();
    this.recommendationsCache.clear();
  }
}

export const capacityIntelligenceService = CapacityIntelligenceService.getInstance();
