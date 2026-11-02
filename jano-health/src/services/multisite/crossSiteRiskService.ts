/**
 * Jano Health - Cross-Site Risk, Incident Correlation & Configuration Drift Service (V24)
 * Aggregates program-level risks, correlates cross-site incident patterns,
 * and detects configuration drift against golden baselines.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  ProgramRiskRegisterEntry,
  CrossSiteIncidentCorrelation,
  MultiSiteConfigurationDrift,
  ConfigDriftClassification,
  CrossSitePatternStatus,
} from '../../domain/v24MultiSiteEvidenceTypes';

export class CrossSiteRiskService {
  private risks: Map<string, ProgramRiskRegisterEntry> = new Map();
  private correlations: Map<string, CrossSiteIncidentCorrelation> = new Map();
  private drifts: Map<string, MultiSiteConfigurationDrift> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const r1: ProgramRiskRegisterEntry = {
      riskId: 'risk-prog-001',
      programId: 'prog-multisite-east-africa',
      hazardDomain: 'INFRASTRUCTURE_POWER',
      title: 'Prolonged Rainy Season Solar Depletion',
      description: 'Multiple peripheral health outposts experience intermittent battery depletion exceeding 12 hours.',
      affectedSiteIds: ['site-kilima-02', 'site-ziwa-03'],
      isSystemic: true,
      systemicEvidenceNotes: 'Both sites report auxiliary battery discharge during heavy monsoon periods.',
      severity: 'MODERATE',
      likelihood: 'LIKELY',
      activeControls: ['Offline local storage buffer', 'Manual generator protocol', 'Safe shutdown alerts'],
      controlEffectiveness: 'HIGH',
      ownerId: 'usr-safety-dr-faraji',
      status: 'OPEN',
    };

    const r2: ProgramRiskRegisterEntry = {
      riskId: 'risk-prog-002',
      programId: 'prog-multisite-east-africa',
      hazardDomain: 'CLINICAL_WORKFORCE',
      title: 'Rotational Nurse Triage Data Variance',
      description: 'Variations in vital sign documentation completeness between day shift and night emergency coverage.',
      affectedSiteIds: ['site-amani-01', 'site-kilima-02'],
      isSystemic: true,
      systemicEvidenceNotes: 'Night shift documentation completeness is 12% lower across both facilities.',
      severity: 'MINOR',
      likelihood: 'POSSIBLE',
      activeControls: ['Mandatory minimum vital sign prompts', 'Shift handover checklist'],
      controlEffectiveness: 'HIGH',
      ownerId: 'usr-safety-dr-faraji',
      status: 'OPEN',
    };

    this.risks.set(r1.riskId, r1);
    this.risks.set(r2.riskId, r2);

    const c1: CrossSiteIncidentCorrelation = {
      correlationId: 'corr-001',
      programId: 'prog-multisite-east-africa',
      incidentIds: ['inc-v23-amani-001', 'inc-v23-kilima-004'],
      affectedSiteIds: ['site-amani-01', 'site-kilima-02'],
      patternDimension: 'DEVICE_CLASS',
      status: 'CONFIRMED_LINK' as CrossSitePatternStatus,
      investigationSummary: 'Thermal throttling on entry-level Android tablets when operating in unventilated outpatient rooms above 35°C.',
      confirmedLinkEvidence: 'Hardware telemetry recorded CPU throttling at both sites when ambient temperature exceeded 36°C.',
      investigatedBy: 'usr-safety-dr-faraji',
      updatedAt: '2026-03-01T12:00:00.000Z',
    };
    this.correlations.set(c1.correlationId, c1);

    const d1: MultiSiteConfigurationDrift = {
      driftId: 'drift-001',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-ziwa-03',
      component: 'TERMINOLOGY',
      goldenBaselineVersion: 'ICD11_V2',
      siteConfigVersion: 'ICD11_V1.9_OFFLINE',
      classification: 'APPROVED' as ConfigDriftClassification,
      driftDescription: 'Site running cached ICD11 v1.9 pending seasonal network sync window.',
      isSafetyRelevant: false,
      alertTriggered: false,
      reviewedBy: 'usr-coord-dr-elimu',
      reviewedAt: '2026-02-20T09:00:00.000Z',
    };
    this.drifts.set(d1.driftId, d1);
  }

  // --- Program Risks ---
  public async registerRisk(
    params: Omit<ProgramRiskRegisterEntry, 'riskId'>
  ): Promise<ProgramRiskRegisterEntry> {
    const risk: ProgramRiskRegisterEntry = {
      ...params,
      riskId: `risk-${Date.now().toString(16)}`,
    };
    this.risks.set(risk.riskId, risk);
    await idbEngine.put('programRiskRegisters', risk);
    return risk;
  }

  public async listRisks(programId: string): Promise<ProgramRiskRegisterEntry[]> {
    return Array.from(this.risks.values()).filter((r) => r.programId === programId);
  }

  // --- Cross-Site Incident Correlation ---
  public async correlateIncidents(
    params: Omit<CrossSiteIncidentCorrelation, 'correlationId' | 'updatedAt'>
  ): Promise<CrossSiteIncidentCorrelation> {
    const correlation: CrossSiteIncidentCorrelation = {
      ...params,
      correlationId: `corr-${Date.now().toString(16)}`,
      updatedAt: new Date().toISOString(),
    };
    this.correlations.set(correlation.correlationId, correlation);
    await idbEngine.put('crossSiteIncidentCorrelations', correlation);
    return correlation;
  }

  public async listCorrelations(programId: string): Promise<CrossSiteIncidentCorrelation[]> {
    return Array.from(this.correlations.values()).filter((c) => c.programId === programId);
  }

  // --- Configuration Drift ---
  public async recordConfigurationDrift(
    params: Omit<MultiSiteConfigurationDrift, 'driftId'>
  ): Promise<MultiSiteConfigurationDrift> {
    const drift: MultiSiteConfigurationDrift = {
      ...params,
      driftId: `drift-${Date.now().toString(16)}`,
    };
    this.drifts.set(drift.driftId, drift);
    await idbEngine.put('multiSiteConfigurationDrifts', drift);
    return drift;
  }

  public async listDrifts(programId: string): Promise<MultiSiteConfigurationDrift[]> {
    return Array.from(this.drifts.values()).filter((d) => d.programId === programId);
  }

  public async getUnresolvedSafetyRisks(programId: string): Promise<ProgramRiskRegisterEntry[]> {
    return Array.from(this.risks.values()).filter(
      (r) =>
        r.programId === programId &&
        (r.severity === 'MAJOR' || r.severity === 'CATASTROPHIC') &&
        r.status === 'OPEN'
    );
  }
}

export const crossSiteRiskService = new CrossSiteRiskService();
