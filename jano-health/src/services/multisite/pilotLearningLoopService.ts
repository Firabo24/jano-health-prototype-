/**
 * Jano Health - Pilot Learning Loop Service (V24)
 * Governs the evidence-based improvement cycle across pilot sites:
 * OBSERVE -> ANALYZE -> REVIEW -> DECIDE -> CHANGE -> REVALIDATE -> MEASURE
 * Prevents unverified changes from impacting clinical safety.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  PilotLearningRecord,
  LearningLoopPhase,
} from '../../domain/v24MultiSiteEvidenceTypes';

export class PilotLearningLoopService {
  private records: Map<string, PilotLearningRecord> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const l1: PilotLearningRecord = {
      learningId: 'lrn-001',
      programId: 'prog-multisite-east-africa',
      siteId: 'site-kilima-02',
      phase: 'REVALIDATE',
      observedProblem: 'Night-shift triage documentation delay due to slow barcode reader sleep wake-up.',
      evidenceReferenceIds: ['obs-sync-kilima-02', 'inc-v23-kilima-004'],
      analysisFindings: 'Barcode scanner sleep interval was set to 60s, requiring 4s wake-up latency.',
      decisionRationale: 'Adjust scanner sleep profile to 10 minutes when device is connected to auxiliary power.',
      proposedChangeDescription: 'Update hardware peripheral configuration profile on nurse triage workstations.',
      revalidationProtocol: 'Protocol LRN-REV-001: 48-hour shadow triage time audit with dual observation.',
      revalidationStatus: 'VALIDATED',
      postChangeMeasurementId: 'meas-kilima-post-change-01',
      responsibleLeadId: 'usr-coord-dr-elimu',
      createdAt: '2026-02-10T08:00:00.000Z',
      updatedAt: '2026-02-25T14:00:00.000Z',
    };

    const l2: PilotLearningRecord = {
      learningId: 'lrn-002',
      programId: 'prog-multisite-east-africa',
      phase: 'ANALYZE',
      observedProblem: 'Cross-site variance in antibiotic formulary substitutions during intermittent stockouts.',
      evidenceReferenceIds: ['corr-001'],
      analysisFindings: 'Dispensary clinics lack standardized second-line amoxicillin-clavulanate guidance.',
      decisionRationale: 'Pending multi-site pharmacy committee review before initiating formulary rule update.',
      proposedChangeDescription: 'Standardize clinical decision advisory rule for pediatric respiratory formulary substitution.',
      revalidationProtocol: 'Protocol LRN-REV-002: Clinical pharmacology simulation drill.',
      revalidationStatus: 'PENDING',
      responsibleLeadId: 'usr-safety-dr-faraji',
      createdAt: '2026-02-28T09:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    };

    this.records.set(l1.learningId, l1);
    this.records.set(l2.learningId, l2);
  }

  public async getLearningRecord(learningId: string): Promise<PilotLearningRecord | null> {
    return this.records.get(learningId) || null;
  }

  public async listLearningRecords(programId: string): Promise<PilotLearningRecord[]> {
    return Array.from(this.records.values()).filter((r) => r.programId === programId);
  }

  public async createLearningRecord(
    params: Omit<PilotLearningRecord, 'learningId' | 'createdAt' | 'updatedAt'>
  ): Promise<PilotLearningRecord> {
    const now = new Date().toISOString();
    const record: PilotLearningRecord = {
      ...params,
      learningId: `lrn-${Date.now().toString(16)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.learningId, record);
    await idbEngine.put('pilotLearningRecords', record);
    return record;
  }

  public async advancePhase(
    learningId: string,
    nextPhase: LearningLoopPhase,
    actorId: string,
    updates: Partial<PilotLearningRecord> = {}
  ): Promise<PilotLearningRecord> {
    const existing = await this.getLearningRecord(learningId);
    if (!existing) {
      throw new Error(`Learning record ${learningId} not found`);
    }

    // Safety constraint: Cannot jump to MEASURE without REVALIDATE being VALIDATED
    if (nextPhase === 'MEASURE' && existing.revalidationStatus !== 'VALIDATED') {
      throw new Error('Cannot advance to MEASURE phase: Revalidation must be completed and marked VALIDATED.');
    }

    const updated: PilotLearningRecord = {
      ...existing,
      ...updates,
      phase: nextPhase,
      responsibleLeadId: actorId,
      updatedAt: new Date().toISOString(),
    };

    this.records.set(updated.learningId, updated);
    await idbEngine.put('pilotLearningRecords', updated);
    return updated;
  }
}

export const pilotLearningLoopService = new PilotLearningLoopService();
