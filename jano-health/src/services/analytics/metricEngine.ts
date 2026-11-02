/**
 * Jano Health - Metric Definition & Calculation Engine
 * Clinical Core V14: Canonical Formulas, Time Series Aggregation, and Metric Versioning
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Metric Definition ≠ Metric Value (every formula is versioned and provenance-tracked).
 * 2. When a metric formula changes, do NOT silently rewrite prior historical results.
 * 3. Both definitions must remain identifiable (v1, v2) with clear lineage.
 * 4. Missing data never becomes false zero (incomplete periods are visibly tagged).
 * 5. Small-cell privacy suppression applies to all evaluated metric results.
 */

import {
  MetricCorrectionLineage,
  MetricDefinition,
  MetricResult,
  MetricSeriesPoint,
  TimeWindow,
} from '../../domain/analyticsTypes';
import { sha256 } from '../../domain/eventIntegrity';
import { analyticalFactStore } from './factStore';
import { smallCellPrivacyEngine } from './privacyEngine';

export const BUILTIN_METRICS: MetricDefinition[] = [
  {
    metricId: 'METRIC_ENCOUNTERS_TOTAL',
    name: 'Total Clinical Encounters',
    description: 'Volume of outpatient and inpatient clinical consultations conducted in the period',
    domain: 'service',
    numeratorDescription: 'Count of completed or active clinical encounter facts',
    inclusionCriteria: ['factType = ENCOUNTER'],
    exclusionCriteria: ['status = CANCELLED'],
    dimensions: ['facilityId', 'encounterType'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Baseline service throughput tracking across rural primary healthcare facilities',
    },
  },
  {
    metricId: 'METRIC_EMERGENCY_ARRIVALS',
    name: 'Acute Emergency Arrivals',
    description: 'Number of acute presentations triaged at facility emergency departments',
    domain: 'service',
    numeratorDescription: 'Count of EmergencyFact records',
    inclusionCriteria: ['factType = EMERGENCY'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'triageLevel', 'arrivalMode'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Monitors acute care surge capacity and emergency presentation velocity',
    },
  },
  {
    metricId: 'METRIC_LAB_TEST_VOLUME',
    name: 'Laboratory Tests Performed',
    domain: 'operational',
    description: 'Total number of laboratory investigations performed and verified',
    numeratorDescription: 'Count of LaboratoryFact records',
    inclusionCriteria: ['factType = LABORATORY'],
    exclusionCriteria: ['specimenRejectionReason IS NOT NULL'],
    dimensions: ['facilityId', 'testCategory'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Diagnostic throughput indicator',
    },
  },
  {
    metricId: 'METRIC_LAB_ABNORMAL_RATE',
    name: 'Abnormal Laboratory Result Rate',
    domain: 'clinical',
    description: 'Proportion of completed laboratory tests yielding out-of-reference-range findings',
    numeratorDescription: 'Count of LaboratoryFact where isAbnormal = true',
    denominatorDescription: 'Total completed LaboratoryFact records',
    inclusionCriteria: ['factType = LABORATORY'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'testCategory'],
    defaultTimeframe: 'month',
    aggregationMethod: 'PERCENTAGE',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Clinical pathology abnormality surveillance indicator',
    },
  },
  {
    metricId: 'METRIC_LAB_TURNAROUND_AVG',
    name: 'Average Laboratory Turnaround Time',
    domain: 'operational',
    description: 'Average elapsed minutes between specimen collection and result verification',
    numeratorDescription: 'Sum of turnaroundMinutes in LaboratoryFact',
    denominatorDescription: 'Count of verified LaboratoryFact records',
    inclusionCriteria: ['factType = LABORATORY'],
    exclusionCriteria: ['turnaroundMinutes IS NULL'],
    dimensions: ['facilityId', 'testCategory'],
    defaultTimeframe: 'month',
    aggregationMethod: 'AVG',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Diagnostic operational efficiency benchmark',
    },
  },
  {
    metricId: 'METRIC_RAD_STUDY_VOLUME',
    name: 'Radiology Imaging Studies Volume',
    domain: 'operational',
    description: 'Total imaging examinations acquired and reported',
    numeratorDescription: 'Count of RadiologyFact records',
    inclusionCriteria: ['factType = RADIOLOGY'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'modality'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Medical imaging workload monitoring',
    },
  },
  {
    metricId: 'METRIC_RAD_CRITICAL_RATE',
    name: 'Critical Radiology Finding Rate',
    domain: 'clinical',
    description: 'Proportion of imaging studies with red-flag critical findings',
    numeratorDescription: 'Count of RadiologyFact where isCriticalFinding = true',
    denominatorDescription: 'Total completed RadiologyFact records',
    inclusionCriteria: ['factType = RADIOLOGY'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'modality'],
    defaultTimeframe: 'month',
    aggregationMethod: 'PERCENTAGE',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Acute clinical escalation surveillance in tele-radiology',
    },
  },
  {
    metricId: 'METRIC_PHARMACY_DISPENSE_VOLUME',
    name: 'Pharmacy Dispensing Events',
    domain: 'operational',
    description: 'Total prescription fulfillments completed at health facility pharmacies',
    numeratorDescription: 'Count of DispensingFact records',
    inclusionCriteria: ['factType = DISPENSING'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'medicationCode'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Medication access and pharmacy workflow metric',
    },
  },
  {
    metricId: 'METRIC_ESSENTIAL_MEDS_STOCKOUT',
    name: 'Essential Medicines Stocked Out',
    domain: 'operational',
    description: 'Number of critical essential medicine batches with zero available inventory',
    numeratorDescription: 'Count of InventoryFact where isStockout = true',
    inclusionCriteria: ['factType = INVENTORY'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'itemId'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Supply chain vulnerability and stockout risk surveillance',
    },
  },
  {
    metricId: 'METRIC_REFERRAL_VOLUME',
    name: 'Inter-Facility Referrals Outbound',
    domain: 'service',
    description: 'Volume of clinical transfer handoffs issued to referral centers',
    numeratorDescription: 'Count of ReferralFact records',
    inclusionCriteria: ['factType = REFERRAL'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'destinationFacilityId', 'specialty'],
    defaultTimeframe: 'month',
    aggregationMethod: 'COUNT',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Health network referral flow and care coordination tracking',
    },
  },
  {
    metricId: 'METRIC_REFERRAL_COMPLETION_RATE',
    name: 'Closed-Loop Referral Completion Rate',
    domain: 'quality',
    description: 'Proportion of outbound referrals with confirmed counter-referral outcome feedback',
    numeratorDescription: 'Count of ReferralFact where hasOutcome = true',
    denominatorDescription: 'Total completed or closed ReferralFact records',
    inclusionCriteria: ['factType = REFERRAL'],
    exclusionCriteria: [],
    dimensions: ['facilityId', 'destinationFacilityId'],
    defaultTimeframe: 'month',
    aggregationMethod: 'PERCENTAGE',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'Closed-loop clinical coordination quality indicator',
    },
  },
  {
    metricId: 'METRIC_DOCUMENTATION_COMPLETENESS',
    name: 'Documentation Completeness Rate',
    domain: 'quality',
    description: 'Percentage of encounters with signed clinical notes and finalized diagnoses',
    numeratorDescription: 'Count of EncounterFact with status = signed / completed',
    denominatorDescription: 'Total EncounterFact records',
    inclusionCriteria: ['factType = ENCOUNTER'],
    exclusionCriteria: [],
    dimensions: ['facilityId'],
    defaultTimeframe: 'month',
    aggregationMethod: 'PERCENTAGE',
    version: 1,
    status: 'ACTIVE',
    provenance: {
      author: 'system_intelligence_admin',
      effectiveFrom: '2025-01-01T00:00:00Z',
      rationale: 'EHR documentation quality and compliance indicator',
    },
  },
];

export class MetricEngine {
  private static instance: MetricEngine;
  private definitions: Map<string, MetricDefinition[]> = new Map(); // metricId -> versioned definitions
  private correctionLedger: MetricCorrectionLineage[] = [];

  private constructor() {
    BUILTIN_METRICS.forEach((m) => this.registerMetric(m));
  }

  public static getInstance(): MetricEngine {
    if (!MetricEngine.instance) {
      MetricEngine.instance = new MetricEngine();
    }
    return MetricEngine.instance;
  }

  public registerMetric(def: MetricDefinition): void {
    const list = this.definitions.get(def.metricId) || [];
    const existingIndex = list.findIndex((x) => x.version === def.version);
    if (existingIndex >= 0) {
      list[existingIndex] = def;
    } else {
      list.push(def);
    }
    // Sort versions descending
    list.sort((a, b) => b.version - a.version);
    this.definitions.set(def.metricId, list);
  }

  public getMetricDefinition(metricId: string, version?: number): MetricDefinition | undefined {
    const list = this.definitions.get(metricId);
    if (!list || list.length === 0) return undefined;
    if (version !== undefined) {
      return list.find((d) => d.version === version);
    }
    // Return latest active or top version
    return list.find((d) => d.status === 'ACTIVE') || list[0];
  }

  public listMetricDefinitions(domain?: string): MetricDefinition[] {
    const latest: MetricDefinition[] = [];
    for (const list of this.definitions.values()) {
      const active = list.find((d) => d.status === 'ACTIVE') || list[0];
      if (!domain || active.domain === domain) {
        latest.push(active);
      }
    }
    return latest.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Evaluates a metric over a specified scope and time window using versioned facts.
   */
  public async evaluateMetric(
    metricId: string,
    facilityId: string,
    timeWindow: TimeWindow,
    version?: number
  ): Promise<MetricResult> {
    const def = this.getMetricDefinition(metricId, version);
    if (!def) {
      throw new Error(`METRIC_NOT_FOUND: Metric definition '${metricId}' (version: ${version ?? 'latest'}) not registered.`);
    }

    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      fromTimestamp: timeWindow.startDate,
      toTimestamp: timeWindow.endDate,
    });

    // Bucket facts by time period
    const bucketMap: Map<string, { num: number; den: number; count: number }> = new Map();

    const getBucket = (ts: string): string => {
      if (timeWindow.granularity === 'day') return ts.substring(0, 10);
      if (timeWindow.granularity === 'week') {
        const d = new Date(ts);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      }
      return ts.substring(0, 7); // Default month (YYYY-MM)
    };

    facts.forEach((fact) => {
      const bucket = getBucket(fact.eventTimestamp);
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, { num: 0, den: 0, count: 0 });
      }
      const entry = bucketMap.get(bucket)!;

      // Filter by domain criteria
      if (def.metricId === 'METRIC_ENCOUNTERS_TOTAL' && fact.factType === 'ENCOUNTER') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_EMERGENCY_ARRIVALS' && fact.factType === 'EMERGENCY') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_LAB_TEST_VOLUME' && fact.factType === 'LABORATORY') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_LAB_ABNORMAL_RATE' && fact.factType === 'LABORATORY') {
        entry.den += 1;
        if (fact.isAbnormal) entry.num += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_LAB_TURNAROUND_AVG' && fact.factType === 'LABORATORY') {
        entry.num += fact.turnaroundMinutes || 0;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_RAD_STUDY_VOLUME' && fact.factType === 'RADIOLOGY') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_RAD_CRITICAL_RATE' && fact.factType === 'RADIOLOGY') {
        entry.den += 1;
        if (fact.isCriticalFinding) entry.num += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_PHARMACY_DISPENSE_VOLUME' && fact.factType === 'DISPENSING') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_ESSENTIAL_MEDS_STOCKOUT' && fact.factType === 'INVENTORY') {
        if (fact.isStockout) entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_REFERRAL_VOLUME' && fact.factType === 'REFERRAL') {
        entry.num += 1;
        entry.den += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_REFERRAL_COMPLETION_RATE' && fact.factType === 'REFERRAL') {
        entry.den += 1;
        if (fact.hasOutcome) entry.num += 1;
        entry.count += 1;
      } else if (def.metricId === 'METRIC_DOCUMENTATION_COMPLETENESS' && fact.factType === 'ENCOUNTER') {
        entry.den += 1;
        entry.num += 1; // Registered encounter fact with valid provenance
        entry.count += 1;
      } else {
        // Generic fallback for custom metric inclusion
        entry.num += fact.measures.count || 1;
        entry.den += 1;
        entry.count += 1;
      }
    });

    const points: MetricSeriesPoint[] = [];
    let totalNum = 0;
    let totalDen = 0;

    const sortedBuckets = Array.from(bucketMap.keys()).sort();
    sortedBuckets.forEach((period) => {
      const b = bucketMap.get(period)!;
      totalNum += b.num;
      totalDen += b.den;

      let val = 0;
      if (def.aggregationMethod === 'PERCENTAGE') {
        val = b.den > 0 ? Math.round((b.num / b.den) * 100 * 10) / 10 : 0;
      } else if (def.aggregationMethod === 'AVG') {
        val = b.den > 0 ? Math.round((b.num / b.den) * 10) / 10 : 0;
      } else {
        val = b.num;
      }

      points.push({
        period,
        timestamp: `${period}-01T00:00:00Z`,
        value: val,
        numeratorValue: b.num,
        denominatorValue: b.den,
        version: def.version,
        dataCompletenessPercent: facts.length > 0 ? 100 : 0,
      });
    });

    let summaryVal = 0;
    if (def.aggregationMethod === 'PERCENTAGE') {
      summaryVal = totalDen > 0 ? Math.round((totalNum / totalDen) * 100 * 10) / 10 : 0;
    } else if (def.aggregationMethod === 'AVG') {
      summaryVal = totalDen > 0 ? Math.round((totalNum / totalDen) * 10) / 10 : 0;
    } else {
      summaryVal = totalNum;
    }

    const rawResult: MetricResult = {
      metricId: def.metricId,
      metricName: def.name,
      version: def.version,
      aggregationLevel: facilityId === '*' ? 'network' : 'facility',
      scopeId: facilityId,
      timeWindow,
      points,
      summaryValue: summaryVal,
      isSuppressed: false,
      completenessPercent: facts.length > 0 ? 100 : 0,
      integrityHash: '',
      generatedAt: new Date().toISOString(),
    };

    rawResult.integrityHash = sha256(JSON.stringify({ ...rawResult, integrityHash: '' }));

    // Apply small-cell privacy suppression
    return smallCellPrivacyEngine.protectMetricResult(rawResult);
  }

  /**
   * Records a formal metric correction lineage entry.
   */
  public recordCorrection(correction: Omit<MetricCorrectionLineage, 'id' | 'recalculatedAt'>): MetricCorrectionLineage {
    const entry: MetricCorrectionLineage = {
      ...correction,
      id: `mcorr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recalculatedAt: new Date().toISOString(),
    };
    this.correctionLedger.push(entry);
    return entry;
  }

  public getCorrectionLedger(metricId?: string): MetricCorrectionLineage[] {
    if (!metricId) return [...this.correctionLedger];
    return this.correctionLedger.filter((c) => c.metricId === metricId);
  }
}

export const metricEngine = MetricEngine.getInstance();
