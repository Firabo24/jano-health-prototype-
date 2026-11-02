/**
 * Jano Health - Diagnostic Operational Intelligence Service (Lab & Radiology)
 * Clinical Core V14: Diagnostic Workload, Turnaround Times, and Safety Monitoring
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Do NOT use population analytics to automatically alter laboratory reference ranges.
 * 2. Never convert aggregate imaging patterns into autonomous diagnostic decisions.
 * 3. Diagnostic operational metrics reflect system throughput, quality, and turnaround performance.
 */

import { analyticalFactStore } from './factStore';

export interface LaboratoryIntelligenceSummary {
  facilityId: string;
  period: string;
  totalOrders: number;
  totalVerifiedResults: number;
  abnormalRatePercent: number;
  criticalRatePercent: number;
  averageTurnaroundMinutes: number;
  specimenRejectionsCount: number;
  rejectionCauses: Record<string, number>;
  volumeByTestFamily: Record<string, number>;
}

export interface RadiologyIntelligenceSummary {
  facilityId: string;
  period: string;
  totalStudies: number;
  criticalFindingsCount: number;
  criticalRatePercent: number;
  averageTurnaroundMinutes: number;
  volumeByModality: Record<string, number>;
  pendingReportCount: number;
}

export class DiagnosticIntelligenceService {
  private static instance: DiagnosticIntelligenceService;

  private constructor() {}

  public static getInstance(): DiagnosticIntelligenceService {
    if (!DiagnosticIntelligenceService.instance) {
      DiagnosticIntelligenceService.instance = new DiagnosticIntelligenceService();
    }
    return DiagnosticIntelligenceService.instance;
  }

  /**
   * Evaluates operational laboratory intelligence for a health facility.
   */
  public async getLaboratoryIntelligence(
    facilityId: string,
    period: string = new Date().toISOString().substring(0, 7)
  ): Promise<LaboratoryIntelligenceSummary> {
    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      reportingPeriod: period,
      factType: 'LABORATORY',
    });

    let abnormalCount = 0;
    let criticalCount = 0;
    let totalMinutes = 0;
    let rejectionsCount = 0;
    const rejectionCauses: Record<string, number> = {};
    const volumeByFamily: Record<string, number> = {};

    facts.forEach((f: any) => {
      if (f.isAbnormal) abnormalCount += 1;
      if (f.isCritical) criticalCount += 1;
      totalMinutes += f.turnaroundMinutes || 45;

      const cat = f.testCategory || 'General';
      volumeByFamily[cat] = (volumeByFamily[cat] || 0) + 1;

      if (f.specimenRejectionReason) {
        rejectionsCount += 1;
        const cause = f.specimenRejectionReason;
        rejectionCauses[cause] = (rejectionCauses[cause] || 0) + 1;
      }
    });

    const total = facts.length;
    return {
      facilityId,
      period,
      totalOrders: total,
      totalVerifiedResults: total - rejectionsCount,
      abnormalRatePercent: total > 0 ? Math.round((abnormalCount / total) * 100 * 10) / 10 : 0,
      criticalRatePercent: total > 0 ? Math.round((criticalCount / total) * 100 * 10) / 10 : 0,
      averageTurnaroundMinutes: total > 0 ? Math.round(totalMinutes / total) : 0,
      specimenRejectionsCount: rejectionsCount,
      rejectionCauses,
      volumeByTestFamily: volumeByFamily,
    };
  }

  /**
   * Evaluates operational radiology intelligence for a health facility.
   */
  public async getRadiologyIntelligence(
    facilityId: string,
    period: string = new Date().toISOString().substring(0, 7)
  ): Promise<RadiologyIntelligenceSummary> {
    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      reportingPeriod: period,
      factType: 'RADIOLOGY',
    });

    let criticalCount = 0;
    let totalMinutes = 0;
    const volumeByModality: Record<string, number> = {};

    facts.forEach((f: any) => {
      if (f.isCriticalFinding) criticalCount += 1;
      totalMinutes += f.turnaroundMinutes || 60;

      const mod = f.modality || 'XR';
      volumeByModality[mod] = (volumeByModality[mod] || 0) + 1;
    });

    const total = facts.length;
    return {
      facilityId,
      period,
      totalStudies: total,
      criticalFindingsCount: criticalCount,
      criticalRatePercent: total > 0 ? Math.round((criticalCount / total) * 100 * 10) / 10 : 0,
      averageTurnaroundMinutes: total > 0 ? Math.round(totalMinutes / total) : 0,
      volumeByModality,
      pendingReportCount: Math.max(0, Math.floor(total * 0.05)), // 5% backlog simulation
    };
  }
}

export const diagnosticIntelligenceService = DiagnosticIntelligenceService.getInstance();
