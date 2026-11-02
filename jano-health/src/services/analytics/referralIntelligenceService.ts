/**
 * Jano Health - Referral Network Intelligence Service
 * Clinical Core V14: Multi-Facility Flow Analysis, Closed-Loop Tracking, and Bottleneck Detection
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Referral intelligence identifies operational bottlenecks, NOT clinician judgments.
 * 2. Closed-loop tracking measures counter-referral outcome completion.
 * 3. Prolonged acceptance and transfer transit delays are tracked as system flow bottlenecks.
 */

import { analyticalFactStore } from './factStore';

export interface ReferralFlowEdge {
  sourceFacilityId: string;
  destinationFacilityId: string;
  referralCount: number;
  completedCount: number;
  averageAcceptanceDurationHours: number;
  isBottleneck: boolean;
}

export interface ReferralNetworkSummary {
  reportingPeriod: string;
  totalReferrals: number;
  totalCompleted: number;
  completionRatePercent: number;
  emergencyTransferCount: number;
  averageAcceptanceDurationHours: number;
  bottlenecksIdentified: Array<{
    sourceFacilityId: string;
    destinationFacilityId: string;
    type: 'PROLONGED_ACCEPTANCE' | 'HIGH_VOLUME_CONGESTION' | 'INCOMPLETE_OUTCOME';
    description: string;
  }>;
  flows: ReferralFlowEdge[];
}

export class ReferralNetworkIntelligenceService {
  private static instance: ReferralNetworkIntelligenceService;

  private constructor() {}

  public static getInstance(): ReferralNetworkIntelligenceService {
    if (!ReferralNetworkIntelligenceService.instance) {
      ReferralNetworkIntelligenceService.instance = new ReferralNetworkIntelligenceService();
    }
    return ReferralNetworkIntelligenceService.instance;
  }

  /**
   * Analyzes multi-facility referral network flows and detects systemic bottlenecks.
   */
  public async getReferralNetworkSummary(
    period: string = new Date().toISOString().substring(0, 7)
  ): Promise<ReferralNetworkSummary> {
    const facts = await analyticalFactStore.getFacts({
      reportingPeriod: period,
      factType: 'REFERRAL',
    });

    const flowMap: Map<string, { count: number; completed: number; totalHours: number }> = new Map();
    let totalCompleted = 0;
    let totalHours = 0;

    facts.forEach((f: any) => {
      const src = f.sourceFacilityId || 'fac_unknown';
      const dest = f.destinationFacilityId || 'fac_unknown';
      const key = `${src}->${dest}`;

      if (!flowMap.has(key)) {
        flowMap.set(key, { count: 0, completed: 0, totalHours: 0 });
      }
      const entry = flowMap.get(key)!;
      entry.count += 1;
      if (f.hasOutcome) {
        entry.completed += 1;
        totalCompleted += 1;
      }
      const dur = f.acceptanceDurationHours || 4;
      entry.totalHours += dur;
      totalHours += dur;
    });

    const flows: ReferralFlowEdge[] = [];
    const bottlenecks: ReferralNetworkSummary['bottlenecksIdentified'] = [];

    flowMap.forEach((val, key) => {
      const [src, dest] = key.split('->');
      const avgHours = val.count > 0 ? Math.round((val.totalHours / val.count) * 10) / 10 : 0;
      const isBottleneck = avgHours > 6 || (val.count >= 5 && val.completed / val.count < 0.5);

      flows.push({
        sourceFacilityId: src,
        destinationFacilityId: dest,
        referralCount: val.count,
        completedCount: val.completed,
        averageAcceptanceDurationHours: avgHours,
        isBottleneck,
      });

      if (avgHours > 6) {
        bottlenecks.push({
          sourceFacilityId: src,
          destinationFacilityId: dest,
          type: 'PROLONGED_ACCEPTANCE',
          description: `Average referral acceptance delay between ${src} and ${dest} is ${avgHours} hours (threshold: 6.0h).`,
        });
      }
      if (val.count >= 5 && val.completed / val.count < 0.5) {
        bottlenecks.push({
          sourceFacilityId: src,
          destinationFacilityId: dest,
          type: 'INCOMPLETE_OUTCOME',
          description: `Closed-loop counter-referral rate between ${src} and ${dest} is under 50% (${val.completed}/${val.count} completed).`,
        });
      }
    });

    const totalReferrals = facts.length;
    const completionRatePercent = totalReferrals > 0 ? Math.round((totalCompleted / totalReferrals) * 100 * 10) / 10 : 0;
    const avgOverallAcceptanceHours = totalReferrals > 0 ? Math.round((totalHours / totalReferrals) * 10) / 10 : 0;

    return {
      reportingPeriod: period,
      totalReferrals,
      totalCompleted,
      completionRatePercent,
      emergencyTransferCount: facts.filter((f: any) => f.urgency === 'emergency' || f.urgency === 'urgent').length,
      averageAcceptanceDurationHours: avgOverallAcceptanceHours,
      bottlenecksIdentified: bottlenecks,
      flows,
    };
  }
}

export const referralNetworkIntelligenceService = ReferralNetworkIntelligenceService.getInstance();
