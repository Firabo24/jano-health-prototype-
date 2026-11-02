/**
 * Jano Health - Site Implementation Maturity Service (V24)
 * Tracks and evaluates multi-dimensional site maturity (Levels 0-5)
 * across workflow adoption, safety adherence, technical stability, data quality, and training.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  SiteImplementationMaturity,
  SiteImplementationMaturityLevel,
} from '../../domain/v24MultiSiteEvidenceTypes';

export class SiteImplementationMaturityService {
  private maturities: Map<string, SiteImplementationMaturity> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const s1: SiteImplementationMaturity = {
      maturityId: 'mat-site-amani-01',
      siteId: 'site-amani-01',
      currentLevel: 'LEVEL_4_VALIDATED',
      workflowAdoptionScore: 92,
      safetyAdherenceScore: 98,
      technicalStabilityScore: 95,
      dataQualityScore: 94,
      trainingMaturityScore: 90,
      gapsIdentified: ['Requires periodic solar inverter battery health checks'],
      assessedBy: 'usr-coord-dr-elimu',
      assessedAt: '2026-03-01T10:00:00.000Z',
      nextMilestonePrerequisites: ['Perform 60-day longitudinal data audit for scale readiness'],
    };

    const s2: SiteImplementationMaturity = {
      maturityId: 'mat-site-kilima-02',
      siteId: 'site-kilima-02',
      currentLevel: 'LEVEL_3_STABLE',
      workflowAdoptionScore: 84,
      safetyAdherenceScore: 95,
      technicalStabilityScore: 88,
      dataQualityScore: 89,
      trainingMaturityScore: 82,
      gapsIdentified: ['High nurse turnover requiring refresher onboarding for triage workflows'],
      assessedBy: 'usr-coord-dr-elimu',
      assessedAt: '2026-03-01T10:30:00.000Z',
      nextMilestonePrerequisites: ['Attain 90% workforce competency re-certification'],
    };

    const s3: SiteImplementationMaturity = {
      maturityId: 'mat-site-ziwa-03',
      siteId: 'site-ziwa-03',
      currentLevel: 'LEVEL_2_OPERATIONAL',
      workflowAdoptionScore: 72,
      safetyAdherenceScore: 91,
      technicalStabilityScore: 78,
      dataQualityScore: 80,
      trainingMaturityScore: 75,
      gapsIdentified: ['Synchronizations occasionally queued > 4 hours during stormy weather'],
      assessedBy: 'usr-coord-dr-elimu',
      assessedAt: '2026-03-01T11:00:00.000Z',
      nextMilestonePrerequisites: ['Stabilize peer-to-peer sync mesh transport'],
    };

    this.maturities.set(s1.siteId, s1);
    this.maturities.set(s2.siteId, s2);
    this.maturities.set(s3.siteId, s3);
  }

  public async getMaturity(siteId: string): Promise<SiteImplementationMaturity | null> {
    return this.maturities.get(siteId) || null;
  }

  public async listMaturities(): Promise<SiteImplementationMaturity[]> {
    return Array.from(this.maturities.values());
  }

  public async recordMaturityAssessment(
    params: Omit<SiteImplementationMaturity, 'maturityId' | 'assessedAt'>
  ): Promise<SiteImplementationMaturity> {
    const record: SiteImplementationMaturity = {
      ...params,
      maturityId: `mat-${params.siteId}-${Date.now().toString(16)}`,
      assessedAt: new Date().toISOString(),
    };

    // Validations: Fail-safe gating for level progression
    if (record.currentLevel === 'LEVEL_5_SCALE_CANDIDATE') {
      if (
        record.safetyAdherenceScore < 95 ||
        record.workflowAdoptionScore < 85 ||
        record.dataQualityScore < 85
      ) {
        throw new Error(
          'Cannot advance site to LEVEL_5_SCALE_CANDIDATE: Safety adherence must be >= 95%, workflow >= 85%, and data quality >= 85%.'
        );
      }
    }

    this.maturities.set(record.siteId, record);
    await idbEngine.put('siteImplementationMaturities', record);
    return record;
  }

  /**
   * Evaluates if a site is ready to progress to a target maturity level
   */
  public async evaluateMaturityProgression(
    siteId: string,
    targetLevel: SiteImplementationMaturityLevel
  ): Promise<{ eligible: boolean; score: number; blockers: string[] }> {
    const current = await this.getMaturity(siteId);
    if (!current) {
      return { eligible: false, score: 0, blockers: ['No existing maturity profile found for site'] };
    }

    const blockers: string[] = [];
    const avgScore =
      (current.workflowAdoptionScore +
        current.safetyAdherenceScore +
        current.technicalStabilityScore +
        current.dataQualityScore +
        current.trainingMaturityScore) /
      5;

    if (current.safetyAdherenceScore < 90) {
      blockers.push(`Safety adherence score (${current.safetyAdherenceScore}%) is below minimum threshold (90%)`);
    }

    if (targetLevel === 'LEVEL_4_VALIDATED' || targetLevel === 'LEVEL_5_SCALE_CANDIDATE') {
      if (current.technicalStabilityScore < 85) {
        blockers.push(`Technical stability score (${current.technicalStabilityScore}%) is below threshold (85%)`);
      }
      if (current.dataQualityScore < 85) {
        blockers.push(`Data quality score (${current.dataQualityScore}%) is below threshold (85%)`);
      }
    }

    if (targetLevel === 'LEVEL_5_SCALE_CANDIDATE' && current.currentLevel !== 'LEVEL_4_VALIDATED') {
      blockers.push('Site must achieve LEVEL_4_VALIDATED prior to applying for LEVEL_5_SCALE_CANDIDATE');
    }

    return {
      eligible: blockers.length === 0,
      score: Math.round(avgScore),
      blockers,
    };
  }
}

export const siteImplementationMaturityService = new SiteImplementationMaturityService();
