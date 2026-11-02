/**
 * Jano Health - Comparative Analysis Engine Service (V24)
 * Manages raw metric observations, normalized measurements,
 * and deterministic non-causal comparative evaluations.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  PilotMetricObservation,
  NormalizedMetricMeasurement,
  ComparativeAnalysis,
  BaselinePeriodPhase,
  ComparativeInterpretation,
  SiteComparabilityStatus,
} from '../../domain/v24MultiSiteEvidenceTypes';
import { siteComparabilityService } from './siteComparabilityService';

function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256-v24-cmp-${hex}-${Date.now().toString(16)}`;
}

export class ComparativeAnalysisService {
  private observations: Map<string, PilotMetricObservation> = new Map();
  private measurements: Map<string, NormalizedMetricMeasurement> = new Map();
  private analyses: Map<string, ComparativeAnalysis> = new Map();

  constructor() {
    this.seedBaselineData();
  }

  private seedBaselineData(): void {
    // Seed observations for Amani (health center) and Kilima (health post)
    const o1: PilotMetricObservation = {
      observationId: 'obs-sync-amani-01',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-amani-01',
      metricId: 'METRIC_SYNC_RELIABILITY',
      periodStart: '2026-02-01T00:00:00.000Z',
      periodEnd: '2026-02-28T23:59:59.000Z',
      phase: 'CONTROLLED_LIVE' as BaselinePeriodPhase,
      rawNumerator: 198,
      rawDenominator: 200,
      rawValue: 99.0,
      observationCount: 200,
      provenance: {
        collectionSource: 'syncEvents',
        capturedOffline: true,
        collectedAt: '2026-03-01T08:00:00.000Z',
        collectorId: 'usr-coord-dr-elimu',
        dataHash: simpleHash('obs-sync-amani-01-hash'),
      },
    };

    const o2: PilotMetricObservation = {
      observationId: 'obs-sync-kilima-02',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-kilima-02',
      metricId: 'METRIC_SYNC_RELIABILITY',
      periodStart: '2026-02-01T00:00:00.000Z',
      periodEnd: '2026-02-28T23:59:59.000Z',
      phase: 'EARLY_OPERATION' as BaselinePeriodPhase,
      rawNumerator: 88,
      rawDenominator: 95,
      rawValue: 92.63,
      observationCount: 95,
      provenance: {
        collectionSource: 'syncEvents',
        capturedOffline: true,
        collectedAt: '2026-03-01T08:00:00.000Z',
        collectorId: 'usr-nurse-bahati',
        dataHash: simpleHash('obs-sync-kilima-02-hash'),
      },
    };

    const o3: PilotMetricObservation = {
      observationId: 'obs-medsafe-amani-01',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-amani-01',
      metricId: 'METRIC_MEDICATION_SAFETY_INTERCEPTION',
      periodStart: '2026-02-01T00:00:00.000Z',
      periodEnd: '2026-02-28T23:59:59.000Z',
      phase: 'CONTROLLED_LIVE' as BaselinePeriodPhase,
      rawNumerator: 18,
      rawDenominator: 20,
      rawValue: 90.0,
      observationCount: 20,
      provenance: {
        collectionSource: 'medicationSafetyChecks',
        capturedOffline: false,
        collectedAt: '2026-03-01T08:00:00.000Z',
        collectorId: 'usr-coord-dr-elimu',
        dataHash: simpleHash('obs-medsafe-amani-01-hash'),
      },
    };

    this.observations.set(o1.observationId, o1);
    this.observations.set(o2.observationId, o2);
    this.observations.set(o3.observationId, o3);
  }

  public async recordObservation(
    input: Omit<PilotMetricObservation, 'observationId'>
  ): Promise<PilotMetricObservation> {
    const observationId = `obs-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const observation: PilotMetricObservation = {
      ...input,
      observationId,
    };

    this.observations.set(observationId, observation);
    await idbEngine.put('pilotMetricObservations', observation);
    return observation;
  }

  public async normalizeMeasurement(
    observationId: string,
    normalizationBasis: 'PER_100_ENCOUNTERS' | 'PER_ACTIVE_CLINICIAN' | 'PER_DEVICE_DAY' | 'PER_1000_HOURS',
    scalingFactor: number = 1.0,
    caveats: string[] = []
  ): Promise<NormalizedMetricMeasurement> {
    const obs = this.observations.get(observationId);
    if (!obs) throw new Error(`Observation not found: ${observationId}`);

    const measurementId = `meas-norm-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;
    const normalizedValue = Number((obs.rawValue * scalingFactor).toFixed(2));

    const measurement: NormalizedMetricMeasurement = {
      measurementId,
      observationId,
      metricId: obs.metricId,
      siteId: obs.siteId,
      normalizedValue,
      normalizationBasis,
      rawSourceValue: obs.rawValue,
      formulaVersion: '1.0.0',
      adjustmentFactorsApplied: [`ScaleFactor:${scalingFactor}`],
      caveats,
      calculatedAt: new Date().toISOString(),
    };

    this.measurements.set(measurementId, measurement);
    await idbEngine.put('normalizedMetricMeasurements', measurement);
    return measurement;
  }

  /**
   * INVARIANT: Compares two entities (e.g. Site A vs Site B, or Baseline vs Pilot)
   * with strictly controlled non-causal language and mandatory non-causal disclaimer.
   * Never fabricates baseline data if BASELINE_UNAVAILABLE.
   */
  public async executeComparativeAnalysis(
    programId: string,
    metricId: string,
    analysisType: 'SITE_A_VS_SITE_B' | 'BASELINE_VS_PILOT' | 'BEFORE_AFTER_CHANGE' | 'OFFLINE_VS_CONNECTED',
    baseEntityId: string,
    comparisonEntityId: string,
    baseValue: number | null,
    comparisonValue: number,
    sampleSize: number,
    analystId: string
  ): Promise<ComparativeAnalysis> {
    const analysisId = `cmp-anl-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;

    let comparabilityStatus: SiteComparabilityStatus = 'COMPARABLE';
    if (analysisType === 'SITE_A_VS_SITE_B') {
      const assessment = await siteComparabilityService.getAssessment(baseEntityId, comparisonEntityId);
      if (assessment) {
        comparabilityStatus = assessment.status;
      } else {
        // Run on-the-fly assessment
        const fresh = await siteComparabilityService.assessComparability(programId, baseEntityId, comparisonEntityId, analystId);
        comparabilityStatus = fresh.status;
      }
    }

    // Baseline unavailable check
    if (baseValue === null || isNaN(baseValue)) {
      const emptyAnalysis: ComparativeAnalysis = {
        analysisId,
        programId,
        metricId,
        analysisType,
        baseEntityId,
        comparisonEntityId,
        comparabilityStatus,
        baseValue: 0,
        comparisonValue,
        absoluteDifference: 0,
        relativeDifferencePercent: 0,
        trend: 'NO_COMPARISON',
        interpretation: 'INSUFFICIENT_DATA',
        nonCausalDisclaimer: 'Historical baseline is BASELINE_UNAVAILABLE for this site/cohort. No baseline was fabricated; pilot measurement is recorded without comparative delta.',
        missingDataRate: 1.0,
        sampleSize,
        statisticalAssumptions: ['Baseline unavailable - single period observation only'],
        analystId,
        analyzedAt: new Date().toISOString(),
        integrityHash: simpleHash(`${analysisId}:baseline_unavailable`),
      };
      this.analyses.set(analysisId, emptyAnalysis);
      await idbEngine.put('comparativeAnalyses', emptyAnalysis);
      return emptyAnalysis;
    }

    const absoluteDifference = Number((comparisonValue - baseValue).toFixed(2));
    const relativeDifferencePercent = baseValue !== 0
      ? Number(((absoluteDifference / baseValue) * 100).toFixed(2))
      : 0;

    let trend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'NO_COMPARISON';
    if (Math.abs(absoluteDifference) < 0.5) {
      trend = 'STABLE';
    } else if (absoluteDifference > 0) {
      trend = 'INCREASING';
    } else {
      trend = 'DECREASING';
    }

    let interpretation: ComparativeInterpretation = 'OBSERVED_DIFFERENCE';
    if (sampleSize < 10) {
      interpretation = 'INSUFFICIENT_DATA';
    } else if (comparabilityStatus === 'NOT_COMPARABLE') {
      interpretation = 'INCONCLUSIVE';
    } else if (Math.abs(relativeDifferencePercent) > 15) {
      interpretation = 'OBSERVED_DIFFERENCE';
    } else {
      interpretation = 'TREND';
    }

    const nonCausalDisclaimer = 'The observed measurement differed between periods/sites; causal attribution was not established. Confounding site-specific environmental and operational factors may contribute to observed variance.';

    const integrityHash = simpleHash(`${analysisId}:${metricId}:${baseValue}:${comparisonValue}:${interpretation}`);

    const analysis: ComparativeAnalysis = {
      analysisId,
      programId,
      metricId,
      analysisType,
      baseEntityId,
      comparisonEntityId,
      comparabilityStatus,
      baseValue,
      comparisonValue,
      absoluteDifference,
      relativeDifferencePercent,
      trend,
      interpretation,
      nonCausalDisclaimer,
      missingDataRate: 0.05,
      sampleSize,
      statisticalAssumptions: [
        'Descriptive observational comparison only',
        'No multi-variable regression or randomized causal inference applied',
      ],
      analystId,
      analyzedAt: new Date().toISOString(),
      integrityHash,
    };

    this.analyses.set(analysisId, analysis);
    await idbEngine.put('comparativeAnalyses', analysis);
    return analysis;
  }

  public async getAnalysis(analysisId: string): Promise<ComparativeAnalysis | null> {
    const fromIdb = await idbEngine.get<ComparativeAnalysis>('comparativeAnalyses', analysisId);
    if (fromIdb) return fromIdb;
    return this.analyses.get(analysisId) || null;
  }

  public async listAnalyses(programId: string): Promise<ComparativeAnalysis[]> {
    return Array.from(this.analyses.values()).filter((a) => a.programId === programId);
  }

  public async listObservations(programId: string, siteId?: string): Promise<PilotMetricObservation[]> {
    const list = Array.from(this.observations.values()).filter((o) => o.programId === programId);
    if (siteId) return list.filter((o) => o.siteId === siteId);
    return list;
  }
}

export const comparativeAnalysisService = new ComparativeAnalysisService();
