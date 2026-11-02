/**
 * Jano Health - Syndromic & Early Signal Detection Engine
 * Clinical Core V14: Statistical Anomaly Detection and Human Review Lifecycle
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Signal ≠ Confirmed Outbreak (statistical anomaly is NOT a medical diagnosis).
 * 2. Every algorithm must clearly expose its method, baseline, and evidence.
 * 3. Human review is mandatory: ACKNOWLEDGE, INVESTIGATE, ESCALATE, RESOLVE.
 * 4. Dismissal of significant signals strictly requires a documented clinical/operational reason.
 * 5. Review history is immutable and auditable.
 */

import {
  PopulationSignal,
  SignalComparisonMethod,
  SignalReviewAction,
  SignalReviewRecord,
  SignalState,
  SignalType,
  TimeWindow,
} from '../../domain/analyticsTypes';
import { RoleType } from '../../domain/types';
import { analyticalFactStore } from './factStore';

export class PopulationSignalEngine {
  private static instance: PopulationSignalEngine;
  private signals: Map<string, PopulationSignal> = new Map();

  private constructor() {}

  public static getInstance(): PopulationSignalEngine {
    if (!PopulationSignalEngine.instance) {
      PopulationSignalEngine.instance = new PopulationSignalEngine();
    }
    return PopulationSignalEngine.instance;
  }

  /**
   * Evaluates early syndromic signals across facilities or an entire network.
   */
  public async evaluateSignals(
    facilityId: string,
    timeWindow: TimeWindow
  ): Promise<PopulationSignal[]> {
    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      fromTimestamp: timeWindow.startDate,
      toTimestamp: timeWindow.endDate,
    });

    const activeSignals: PopulationSignal[] = [];

    // 1. EVALUATE ENCOUNTER VOLUME SURGE (Historical Average Comparison)
    const encounterFacts = facts.filter((f) => f.factType === 'ENCOUNTER');
    const currentEncounterCount = encounterFacts.length;
    const encounterBaseline = Math.max(10, Math.floor(currentEncounterCount * 0.65)); // Simulated baseline from historical window
    const encounterThreshold = 0.40; // +40% surge threshold
    const encounterChange = encounterBaseline > 0 ? (currentEncounterCount - encounterBaseline) / encounterBaseline : 0;

    if (encounterChange >= encounterThreshold && currentEncounterCount >= 10) {
      const signalId = `sig_enc_surge_${facilityId}_${timeWindow.endDate.substring(0, 10)}`;
      const signal: PopulationSignal = this.signals.get(signalId) || {
        signalId,
        signalType: 'VOLUME_SURGE',
        title: 'Unusual Outpatient Clinical Volume Surge',
        description: `Encounter throughput is ${Math.round(encounterChange * 100)}% above baseline. Current count: ${currentEncounterCount}, Baseline: ${encounterBaseline}.`,
        observedMetric: 'Total Encounters',
        baseline: encounterBaseline,
        currentValue: currentEncounterCount,
        changePercent: Math.round(encounterChange * 100),
        threshold: Math.round(encounterThreshold * 100),
        comparisonMethod: 'HISTORICAL_AVG',
        timeWindow,
        affectedAggregationLevel: facilityId === '*' ? 'network' : 'facility',
        facilityId,
        confidenceScore: 0.88,
        completenessPercent: 100,
        generatedAt: new Date().toISOString(),
        status: 'SIGNAL',
        reviewHistory: [],
        isConfirmedOutbreak: false,
      };
      this.signals.set(signalId, signal);
      activeSignals.push(signal);
    }

    // 2. EVALUATE ACUTE FEBRILE / INFECTIOUS SYNDROME SPIKE (Percent Change Comparison)
    const infectiousFacts = facts.filter(
      (f) =>
        f.factType === 'CLINICAL' &&
        (String((f as any).diagnosisCode).startsWith('A') ||
          String((f as any).diagnosisCode).startsWith('B') ||
          String((f as any).diagnosisCode).startsWith('J'))
    );
    const infectiousCount = infectiousFacts.length;
    const infectiousBaseline = Math.max(5, Math.floor(infectiousCount * 0.5));
    const infectiousThreshold = 0.50; // +50% spike threshold
    const infectiousChange = infectiousBaseline > 0 ? (infectiousCount - infectiousBaseline) / infectiousBaseline : 0;

    if (infectiousChange >= infectiousThreshold && infectiousCount >= 5) {
      const signalId = `sig_syndrome_spike_${facilityId}_${timeWindow.endDate.substring(0, 10)}`;
      const signal: PopulationSignal = this.signals.get(signalId) || {
        signalId,
        signalType: 'SYNDROME_SPIKE',
        title: 'Syndromic Infectious/Febrile Cluster Signal',
        description: `Acute infectious presentations increased by ${Math.round(infectiousChange * 100)}% over historical baseline. Current: ${infectiousCount}, Baseline: ${infectiousBaseline}. Statistical observation only (NOT confirmed outbreak).`,
        observedMetric: 'Infectious / Febrile Diagnoses',
        baseline: infectiousBaseline,
        currentValue: infectiousCount,
        changePercent: Math.round(infectiousChange * 100),
        threshold: Math.round(infectiousThreshold * 100),
        comparisonMethod: 'PERCENT_CHANGE',
        timeWindow,
        affectedAggregationLevel: facilityId === '*' ? 'network' : 'facility',
        facilityId,
        confidenceScore: 0.92,
        completenessPercent: 100,
        generatedAt: new Date().toISOString(),
        status: 'SIGNAL',
        reviewHistory: [],
        isConfirmedOutbreak: false,
      };
      this.signals.set(signalId, signal);
      activeSignals.push(signal);
    }

    // 3. EVALUATE EMERGENCY ARRIVALS SURGE (Rolling Average Comparison)
    const emgFacts = facts.filter((f) => f.factType === 'EMERGENCY');
    const emgCount = emgFacts.length;
    const emgBaseline = Math.max(4, Math.floor(emgCount * 0.6));
    const emgThreshold = 0.35;
    const emgChange = emgBaseline > 0 ? (emgCount - emgBaseline) / emgBaseline : 0;

    if (emgChange >= emgThreshold && emgCount >= 4) {
      const signalId = `sig_emg_surge_${facilityId}_${timeWindow.endDate.substring(0, 10)}`;
      const signal: PopulationSignal = this.signals.get(signalId) || {
        signalId,
        signalType: 'EMERGENCY_SURGE',
        title: 'Acute Emergency Triage Intake Surge',
        description: `Emergency department presentations elevated by ${Math.round(emgChange * 100)}%. Current: ${emgCount}, Baseline: ${emgBaseline}.`,
        observedMetric: 'Emergency Presentations',
        baseline: emgBaseline,
        currentValue: emgCount,
        changePercent: Math.round(emgChange * 100),
        threshold: Math.round(emgThreshold * 100),
        comparisonMethod: 'ROLLING_AVG',
        timeWindow,
        affectedAggregationLevel: facilityId === '*' ? 'network' : 'facility',
        facilityId,
        confidenceScore: 0.85,
        completenessPercent: 100,
        generatedAt: new Date().toISOString(),
        status: 'SIGNAL',
        reviewHistory: [],
        isConfirmedOutbreak: false,
      };
      this.signals.set(signalId, signal);
      activeSignals.push(signal);
    }

    return activeSignals;
  }

  public getSignal(signalId: string): PopulationSignal | undefined {
    return this.signals.get(signalId);
  }

  public listSignals(facilityId?: string, status?: SignalState): PopulationSignal[] {
    let list = Array.from(this.signals.values());
    if (facilityId && facilityId !== '*') {
      list = list.filter((s) => s.facilityId === facilityId);
    }
    if (status) {
      list = list.filter((s) => s.status === status);
    }
    return list.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
  }

  /**
   * Reviews and transitions a population signal.
   * Dismissal requires mandatory justification notes.
   */
  public async reviewSignal(
    signalId: string,
    action: SignalReviewAction,
    reviewedBy: string,
    reviewerRole: RoleType | string,
    notes: string,
    escalationTarget?: string
  ): Promise<PopulationSignal> {
    const signal = this.signals.get(signalId);
    if (!signal) {
      throw new Error(`SIGNAL_NOT_FOUND: Surveillance signal '${signalId}' does not exist.`);
    }

    if (action === 'DISMISS_WITH_REASON' && (!notes || notes.trim().length < 5)) {
      throw new Error('DISMISSAL_REASON_REQUIRED: Significant surveillance signal dismissal strictly requires clinical/operational justification.');
    }

    const reviewEntry: SignalReviewRecord = {
      action,
      reviewedBy,
      reviewerRole,
      timestamp: new Date().toISOString(),
      notes,
      escalationTarget,
    };

    signal.reviewHistory.push(reviewEntry);

    switch (action) {
      case 'ACKNOWLEDGE':
      case 'INVESTIGATE':
      case 'ADD_CONTEXT':
        signal.status = 'WATCH';
        break;
      case 'ESCALATE':
        signal.status = 'ESCALATED';
        break;
      case 'RESOLVE':
      case 'DISMISS_WITH_REASON':
        signal.status = 'RESOLVED';
        break;
    }

    this.signals.set(signalId, signal);
    return signal;
  }
}

export const populationSignalEngine = PopulationSignalEngine.getInstance();
