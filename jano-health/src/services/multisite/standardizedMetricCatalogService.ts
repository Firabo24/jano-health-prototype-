/**
 * Jano Health - Standardized Pilot Metric Catalog Service (V24)
 * Versioned metric definitions across Technical, Offline, Clinical, Safety,
 * Usability, AI, Data Quality, Operations, Support, and Training.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  StandardizedPilotMetric,
  MetricCategory,
} from '../../domain/v24MultiSiteEvidenceTypes';

export class StandardizedMetricCatalogService {
  private metrics: Map<string, StandardizedPilotMetric> = new Map();

  constructor() {
    this.seedCatalog();
  }

  private seedCatalog(): void {
    const list: StandardizedPilotMetric[] = [
      {
        metricId: 'METRIC_SYNC_RELIABILITY',
        name: 'Deterministic Synchronization Reliability Rate',
        category: 'OFFLINE',
        definition: 'Proportion of offline event batches successfully synchronized without quarantine or irrecoverable failure.',
        formula: '(successful_sync_batches / total_sync_batches) * 100',
        unit: 'PERCENT',
        numeratorDefinition: 'Count of sync batches applied and acknowledged by peer/hub with status CONFIRMED',
        denominatorDefinition: 'Total sync batches initiated',
        inclusionCriteria: ['All background and user-triggered sync batches'],
        exclusionCriteria: ['Batches cancelled prior to transport initiation'],
        collectionMethod: 'AUTOMATED_TELEMETRY',
        sourceStores: ['syncEvents', 'pilotOperationalTelemetry'],
        version: '1.0.0',
        interpretationNotes: 'Evaluates peer-to-peer and hub transport resilience under intermittent connectivity.',
        knownLimitations: ['Does not measure network carrier packet drop outside the application boundary.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_OFFLINE_RESILIENCE_HOURS',
        name: 'Continuous Offline Operational Hours',
        category: 'OFFLINE',
        definition: 'Duration in decimal hours that a health post successfully operates without external network connection.',
        formula: 'sum(offline_session_duration_minutes) / 60',
        unit: 'HOURS',
        collectionMethod: 'AUTOMATED_TELEMETRY',
        sourceStores: ['pilotOperationalTelemetry'],
        version: '1.0.0',
        inclusionCriteria: ['Sessions where external network ping failed but local DB remained accessible'],
        exclusionCriteria: ['Planned device maintenance shutdowns'],
        interpretationNotes: 'Quantifies true disconnected utility in rural health outposts.',
        knownLimitations: ['Device sleep mode without user interaction is excluded.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_ENCOUNTER_COMPLETION_RATE',
        name: 'Clinical Encounter Completion Rate',
        category: 'CLINICAL_WORKFLOW',
        definition: 'Proportion of started clinical consultations that reached clinically signed and finalized status.',
        formula: '(signed_encounters / started_encounters) * 100',
        unit: 'PERCENT',
        numeratorDefinition: 'Encounters with status SIGNED or COMPLETED',
        denominatorDefinition: 'Encounters with status IN_PROGRESS, SIGNED, COMPLETED, or CANCELLED',
        inclusionCriteria: ['Outpatient and Emergency clinical encounters'],
        exclusionCriteria: ['Duplicate test encounters flagged in staging'],
        collectionMethod: 'WORKFLOW_AUDIT',
        sourceStores: ['encounters', 'pilotWorkflowMetrics'],
        version: '1.0.0',
        interpretationNotes: 'Low completion rates may reflect clinical workload bottlenecks or workflow friction.',
        knownLimitations: ['Clinicians who batch-sign notes post-shift may show delayed completion.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_MEDICATION_SAFETY_INTERCEPTION',
        name: 'Critical Medication Adverse Event Interception Rate',
        category: 'SAFETY',
        definition: 'Number of severe contraindication, allergy, or duplicate therapy alerts acknowledged and modified by prescriber.',
        formula: '(modified_prescriptions_after_alert / total_critical_alerts_triggered) * 100',
        unit: 'PERCENT',
        numeratorDefinition: 'Prescriptions altered or discontinued in direct response to a hard alert',
        denominatorDefinition: 'Hard safety alerts displayed to prescriber',
        inclusionCriteria: ['Severity MAJOR and CATASTROPHIC medication checks'],
        exclusionCriteria: ['Minor informational drug formulary notices'],
        collectionMethod: 'WORKFLOW_AUDIT',
        sourceStores: ['medicationSafetyChecks', 'pilotSafetyIncidents'],
        version: '1.0.0',
        interpretationNotes: 'Indicates successful clinical decision support intervention prior to dispensing.',
        knownLimitations: ['Does not track intentional off-label prescribing with documented override justifications.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_AI_GROUNDING_COMPLIANCE',
        name: 'AI Advisory Grounding Compliance Rate',
        category: 'AI',
        definition: 'Percentage of AI clinical recommendations verified as strictly grounded against patient clinical record.',
        formula: '(verified_grounded_responses / total_advisory_requests) * 100',
        unit: 'PERCENT',
        numeratorDefinition: 'AI responses passing grounding gate without hallucination or stale context',
        denominatorDefinition: 'Total clinical decision support queries processed by AI gateway',
        inclusionCriteria: ['All clinical advisory suggestions generated in consultation'],
        exclusionCriteria: ['Administrative documentation templates'],
        collectionMethod: 'SUPERVISED_REVIEW',
        sourceStores: ['pilotAIGovernanceRecords', 'aiValidationStudies'],
        version: '1.0.0',
        interpretationNotes: 'Reflects factual adherence to the local patient EHR record; clinician review required for all outputs.',
        knownLimitations: ['High compliance does not substitute for independent clinical judgment.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_DATA_QUALITY_COMPLETENESS',
        name: 'Demographic and Identity Completeness Index',
        category: 'DATA_QUALITY',
        definition: 'Completeness of mandatory longitudinal identity fields across registered charts.',
        formula: '(valid_records_with_all_mandatory_fields / total_registered_records) * 100',
        unit: 'PERCENT',
        numeratorDefinition: 'Patients with valid MRN, Name, DOB/Age, Gender, and Consent record',
        denominatorDefinition: 'Total registered patient entities in repository',
        inclusionCriteria: ['All active patient records'],
        exclusionCriteria: ['Synthetically segregated demo profiles'],
        collectionMethod: 'AUTOMATED_TELEMETRY',
        sourceStores: ['patients', 'pilotDataQualityAudits'],
        version: '1.0.0',
        interpretationNotes: 'Key foundation for patient safety, duplicate prevention, and longitudinal tracking.',
        knownLimitations: ['Age estimations in displaced populations may affect exact DOB completeness.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_SUPPORT_TICKET_BURDEN',
        name: 'Operational Support Ticket Rate per 100 Encounters',
        category: 'SUPPORT',
        definition: 'Rate of non-safety operational support requests filed per 100 completed clinical encounters.',
        formula: '(total_support_cases / total_encounters) * 100',
        unit: 'TICKETS_PER_100_ENCOUNTERS',
        collectionMethod: 'WORKFLOW_AUDIT',
        sourceStores: ['pilotSupportCases'],
        version: '1.0.0',
        inclusionCriteria: ['Hardware, sync, printer, login, and usability support tickets'],
        exclusionCriteria: ['Clinical safety incidents and adverse near misses (tracked separately in safety register)'],
        interpretationNotes: 'Measures operational friction and workforce usability stability.',
        knownLimitations: ['Informal verbal inquiries to on-site coordinators may be under-reported.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        metricId: 'METRIC_TRAINING_COMPETENCY_ACHIEVEMENT',
        name: 'Workforce Clinical Competency Attainment Rate',
        category: 'TRAINING',
        definition: 'Percentage of onboarded clinical personnel who passed independent competency verification.',
        formula: '(competent_staff_count / total_trained_staff_count) * 100',
        unit: 'PERCENT',
        collectionMethod: 'SUPERVISED_REVIEW',
        sourceStores: ['pilotTrainingRecords', 'clinicalCompetencyRecords'],
        version: '1.0.0',
        inclusionCriteria: ['Physicians, clinical officers, nurses, and pharmacy technicians'],
        exclusionCriteria: ['Administrative observers'],
        interpretationNotes: 'Hard prerequisite for clinical go-live and scale readiness.',
        knownLimitations: ['Staff rotation during pilot requires ongoing recurrent competency evaluations.'],
        isVersionLocked: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    list.forEach((m) => this.metrics.set(m.metricId, m));
  }

  public async getMetric(metricId: string): Promise<StandardizedPilotMetric | null> {
    const fromIdb = await idbEngine.get<StandardizedPilotMetric>('standardizedMetricCatalog', metricId);
    if (fromIdb) return fromIdb;
    return this.metrics.get(metricId) || null;
  }

  public async listMetrics(category?: MetricCategory): Promise<StandardizedPilotMetric[]> {
    const all = Array.from(this.metrics.values());
    if (category) return all.filter((m) => m.category === category);
    return all;
  }

  /**
   * INVARIANT: Changing a metric definition creates a new version;
   * it must never retroactively alter or overwrite locked historical versions.
   */
  public async registerMetricVersion(
    metric: StandardizedPilotMetric
  ): Promise<StandardizedPilotMetric> {
    const existing = this.metrics.get(metric.metricId);
    if (existing && existing.isVersionLocked && existing.version === metric.version) {
      throw new Error(`Metric ${metric.metricId} version ${metric.version} is locked. You must increment the version number to update.`);
    }

    this.metrics.set(metric.metricId, metric);
    await idbEngine.put('standardizedMetricCatalog', metric);
    return metric;
  }
}

export const standardizedMetricCatalogService = new StandardizedMetricCatalogService();
