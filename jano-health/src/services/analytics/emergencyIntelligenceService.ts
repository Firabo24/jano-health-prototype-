/**
 * Jano Health - Emergency Intelligence Service
 * Clinical Core V14: Acute Presentations, SATS Distribution, and Surge Monitoring
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Keep SATS classification intact: RED, ORANGE, YELLOW, GREEN, BLUE.
 * 2. Do NOT infer new triage categories from analytics.
 * 3. Do NOT change triage decisions automatically.
 */

import { analyticalFactStore } from './factStore';

export interface EmergencyIntelligenceSummary {
  facilityId: string;
  period: string;
  totalPresentations: number;
  triageDistribution: {
    RED_RESUSCITATION: number;
    ORANGE_VERY_URGENT: number;
    YELLOW_URGENT: number;
    GREEN_ROUTINE: number;
    BLUE_DEAD_ON_ARRIVAL: number;
  };
  averageWaitTimeMinutes: number;
  transfersOutCount: number;
  dispositionDistribution: Record<string, number>;
}

export class EmergencyIntelligenceService {
  private static instance: EmergencyIntelligenceService;

  private constructor() {}

  public static getInstance(): EmergencyIntelligenceService {
    if (!EmergencyIntelligenceService.instance) {
      EmergencyIntelligenceService.instance = new EmergencyIntelligenceService();
    }
    return EmergencyIntelligenceService.instance;
  }

  public async getEmergencyIntelligence(
    facilityId: string,
    period: string = new Date().toISOString().substring(0, 7)
  ): Promise<EmergencyIntelligenceSummary> {
    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      reportingPeriod: period,
      factType: 'EMERGENCY',
    });

    const triage = {
      RED_RESUSCITATION: 0,
      ORANGE_VERY_URGENT: 0,
      YELLOW_URGENT: 0,
      GREEN_ROUTINE: 0,
      BLUE_DEAD_ON_ARRIVAL: 0,
    };

    let totalWait = 0;
    let transfers = 0;
    const disps: Record<string, number> = {};

    facts.forEach((f: any) => {
      const lvl = String(f.triageLevel || '').toUpperCase();
      if (lvl.includes('RED')) triage.RED_RESUSCITATION += 1;
      else if (lvl.includes('ORANGE')) triage.ORANGE_VERY_URGENT += 1;
      else if (lvl.includes('YELLOW')) triage.YELLOW_URGENT += 1;
      else if (lvl.includes('BLUE')) triage.BLUE_DEAD_ON_ARRIVAL += 1;
      else triage.GREEN_ROUTINE += 1;

      totalWait += f.waitTimeMinutes || 15;
      if (f.isTransferred) transfers += 1;

      const disp = f.disposition || 'DISCHARGE';
      disps[disp] = (disps[disp] || 0) + 1;
    });

    const total = facts.length;
    return {
      facilityId,
      period,
      totalPresentations: total,
      triageDistribution: triage,
      averageWaitTimeMinutes: total > 0 ? Math.round(totalWait / total) : 0,
      transfersOutCount: transfers,
      dispositionDistribution: disps,
    };
  }
}

export const emergencyIntelligenceService = EmergencyIntelligenceService.getInstance();
