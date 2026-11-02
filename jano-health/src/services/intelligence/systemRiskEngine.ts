/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * System Risk & Intelligence Correlation Engine
 * 
 * INVARIANTS:
 * - Correlation ≠ Causation.
 * - Anomaly ≠ Incident Confirmation.
 * - Incident ≠ Root Cause.
 * - Every risk must expose explicit evidence and affected domains.
 * - Forecast ≠ Fact.
 */

import {
  SystemRisk,
  SystemRiskType,
  SystemRiskState,
  IntelligenceCorrelation,
  DecisionContext,
  DecisionEvidence,
  ActionRiskClassification,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class SystemRiskEngine {
  private static instance: SystemRiskEngine;

  private risksCache = new Map<string, SystemRisk>();
  private correlationsCache = new Map<string, IntelligenceCorrelation>();
  private contextsCache = new Map<string, DecisionContext>();
  private evidenceCache = new Map<string, DecisionEvidence>();

  private constructor() {}

  public static getInstance(): SystemRiskEngine {
    if (!SystemRiskEngine.instance) {
      SystemRiskEngine.instance = new SystemRiskEngine();
    }
    return SystemRiskEngine.instance;
  }

  /**
   * Evaluates or updates a cross-domain SystemRisk.
   */
  public async recordRisk(
    input: Omit<SystemRisk, 'riskId' | 'detectedAt' | 'provenance' | 'affectedSystems'> & {
      riskId?: string;
      detectedAt?: string;
      provenance?: SystemRisk['provenance'];
      affectedSystems?: string[];
    }
  ): Promise<SystemRisk> {
    const riskId = input.riskId || `risk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const detectedAt = input.detectedAt || new Date().toISOString();

    const risk: SystemRisk = {
      riskId,
      riskType: input.riskType,
      state: input.state,
      title: input.title,
      description: input.description,
      severityScore: Math.max(0, Math.min(100, input.severityScore)),
      domains: input.domains,
      affectedFacilities: input.affectedFacilities || [],
      affectedSystems: input.affectedSystems || [],
      evidence: input.evidence || [],
      detectedAt,
      resolvedAt: input.resolvedAt,
      provenance: input.provenance || {
        detectorId: 'system_risk_engine_v20',
        version: 'v20.0',
      },
    };

    this.risksCache.set(riskId, risk);
    await idbEngine.put('systemRisks', risk);
    return risk;
  }

  /**
   * Retrieves active system risks.
   */
  public async getRisks(filter?: {
    riskType?: SystemRiskType;
    state?: SystemRiskState;
    facilityId?: string;
  }): Promise<SystemRisk[]> {
    let list: SystemRisk[] = [];
    try {
      const stored = await idbEngine.getAll<SystemRisk>('systemRisks');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.risksCache.values());
    } catch {
      list = Array.from(this.risksCache.values());
    }

    if (filter) {
      if (filter.riskType) list = list.filter((r) => r.riskType === filter.riskType);
      if (filter.state) list = list.filter((r) => r.state === filter.state);
      if (filter.facilityId) list = list.filter((r) => r.affectedFacilities.includes(filter.facilityId!));
    }

    list.sort((a, b) => b.severityScore - a.severityScore);
    return list;
  }

  /**
   * Resolves an existing risk.
   */
  public async resolveRisk(riskId: string, resolutionReason: string): Promise<SystemRisk | null> {
    const risks = await this.getRisks();
    const existing = risks.find((r) => r.riskId === riskId) || this.risksCache.get(riskId);
    if (!existing) return null;

    const resolved: SystemRisk = {
      ...existing,
      state: 'RESOLVED',
      resolvedAt: new Date().toISOString(),
      evidence: [...existing.evidence, `Resolved: ${resolutionReason}`],
    };

    this.risksCache.set(riskId, resolved);
    await idbEngine.put('systemRisks', resolved);
    return resolved;
  }

  /**
   * Generates an IntelligenceCorrelation across multiple observed signals.
   * INVARIANT: Never label correlation as causation automatically.
   */
  public async correlateSignals(
    sourceSignals: string[],
    domains: string[],
    observedRelationship: string,
    confidence: number,
    method: 'HEURISTIC' | 'STATISTICAL_CO_OCCURRENCE' | 'TEMPORAL_PRECEDENCE' = 'HEURISTIC'
  ): Promise<IntelligenceCorrelation> {
    const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const correlation: IntelligenceCorrelation = {
      correlationId,
      sourceSignals,
      domains,
      observedRelationship,
      confidence: Math.max(0, Math.min(1, confidence)),
      method,
      generatedAt: new Date().toISOString(),
      isCausationClaimed: false, // ABSOLUTE INVARIANT: Correlation is NEVER labeled causation automatically
      provenance: {
        ruleVersion: 'v20.0-rules',
        engine: 'system_correlation_engine',
      },
    };

    this.correlationsCache.set(correlationId, correlation);
    await idbEngine.put('intelligenceCorrelations', correlation);
    return correlation;
  }

  public async getCorrelations(): Promise<IntelligenceCorrelation[]> {
    try {
      const stored = await idbEngine.getAll<IntelligenceCorrelation>('intelligenceCorrelations');
      if (stored && stored.length > 0) return stored;
    } catch {
      // fallback
    }
    return Array.from(this.correlationsCache.values());
  }

  /**
   * Creates an auditable DecisionContext.
   */
  public async createDecisionContext(
    decisionType: string,
    scope: { facilities: string[]; networks?: string[]; subsystems?: string[] },
    relevantObservations: string[],
    relevantSignals: string[],
    applicablePolicies: string[],
    constraints: string[],
    riskClassification: ActionRiskClassification
  ): Promise<DecisionContext> {
    const contextId = `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const context: DecisionContext = {
      contextId,
      decisionType,
      scope,
      relevantObservations,
      relevantSignals,
      applicablePolicies,
      affectedSystems: scope.subsystems || [],
      affectedFacilities: scope.facilities,
      constraints,
      riskClassification,
      timestamp: new Date().toISOString(),
    };

    this.contextsCache.set(contextId, context);
    await idbEngine.put('decisionContexts', context);
    return context;
  }

  /**
   * Records atomic DecisionEvidence for recommendations or audits.
   */
  public async recordDecisionEvidence(
    source: string,
    metric: string,
    observation: string,
    confidence: number,
    dataQuality: 'VERIFIED' | 'ESTIMATED' | 'UNCERTAIN' = 'VERIFIED',
    signal?: string
  ): Promise<DecisionEvidence> {
    const evidenceId = `evi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const evidence: DecisionEvidence = {
      evidenceId,
      source,
      metric,
      observation,
      signal,
      confidence: Math.max(0, Math.min(1, confidence)),
      timestamp: new Date().toISOString(),
      dataQuality,
      modelOrRuleVersion: 'v20.0-rule',
    };

    this.evidenceCache.set(evidenceId, evidence);
    await idbEngine.put('decisionEvidence', evidence);
    return evidence;
  }

  public clearMemoryCache(): void {
    this.risksCache.clear();
    this.correlationsCache.clear();
    this.contextsCache.clear();
    this.evidenceCache.clear();
  }
}

export const systemRiskEngine = SystemRiskEngine.getInstance();
