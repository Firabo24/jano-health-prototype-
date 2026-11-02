/**
 * Jano Health - Pilot AI Governance & Supervision Service (Clinical Core V23)
 * 
 * Enforces:
 * - AI remains strictly advisory decision support.
 * - clinicianReviewRequired is strictly true.
 * - isAutonomousMutationAllowed is strictly false.
 * - Tracks clinician acceptance, rejection, and clinical rationale.
 * - Immediate disablement upon grounding failure or safety escalation.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import { PilotAIGovernanceRecord } from '../../domain/v23ControlledPilotTypes';
import { pilotKillSwitchService } from './pilotKillSwitchService';

export class PilotAIGovernanceService {
  private static instance: PilotAIGovernanceService;

  private constructor() {}

  public static getInstance(): PilotAIGovernanceService {
    if (!PilotAIGovernanceService.instance) {
      PilotAIGovernanceService.instance = new PilotAIGovernanceService();
    }
    return PilotAIGovernanceService.instance;
  }

  /**
   * Initializes or updates an AI governance monitoring record for a capability
   */
  public async getOrCreateRecord(
    siteId: string,
    capability: string,
    modelId: string = 'gemini-3.8-flash-clinical-tuned',
    modelVersion: string = '1.2.0'
  ): Promise<PilotAIGovernanceRecord> {
    const recordId = `ai-gov-${siteId}-${capability}`;
    const existing = await idbEngine.get<PilotAIGovernanceRecord>('pilotAIGovernanceRecords', recordId);
    if (existing) return existing;

    const record: PilotAIGovernanceRecord = {
      recordId,
      siteId,
      capability,
      modelId,
      modelVersion,
      knowledgeSourceVersion: 'EML-TZ-ED4-2026',
      clinicianReviewRequired: true,       // HARD INVARIANT
      isAutonomousMutationAllowed: false,   // HARD INVARIANT
      totalAdvisoriesIssued: 0,
      clinicianAcceptanceCount: 0,
      clinicianRejectionCount: 0,
      clinicianOverrideRationaleRecorded: 0,
      groundingFailureCount: 0,
      immediateDisableTriggered: false,
    };

    await idbEngine.put('pilotAIGovernanceRecords', record);
    return record;
  }

  /**
   * Records a clinician review decision on an AI advisory recommendation.
   * INVARIANT: Every AI output requires human clinician decision.
   */
  public async recordReviewDecision(
    siteId: string,
    capability: string,
    decision: 'ACCEPTED' | 'REJECTED' | 'OVERRIDDEN',
    clinicianId: string,
    clinicalRationale?: string
  ): Promise<PilotAIGovernanceRecord> {
    const record = await this.getOrCreateRecord(siteId, capability);

    const updated: PilotAIGovernanceRecord = {
      ...record,
      totalAdvisoriesIssued: record.totalAdvisoriesIssued + 1,
      clinicianAcceptanceCount: decision === 'ACCEPTED' ? record.clinicianAcceptanceCount + 1 : record.clinicianAcceptanceCount,
      clinicianRejectionCount: decision === 'REJECTED' ? record.clinicianRejectionCount + 1 : record.clinicianRejectionCount,
      clinicianOverrideRationaleRecorded: clinicalRationale ? record.clinicianOverrideRationaleRecorded + 1 : record.clinicianOverrideRationaleRecorded,
    };

    await idbEngine.put('pilotAIGovernanceRecords', updated);
    return updated;
  }

  /**
   * Flags an AI grounding failure or hallucination and triggers emergency safety disablement
   */
  public async flagGroundingFailureAndDisable(
    siteId: string,
    capability: string,
    detectedBy: string,
    reason: string
  ): Promise<PilotAIGovernanceRecord> {
    const record = await this.getOrCreateRecord(siteId, capability);

    const updated: PilotAIGovernanceRecord = {
      ...record,
      groundingFailureCount: record.groundingFailureCount + 1,
      immediateDisableTriggered: true,
      disableReason: `Grounding failure flagged by ${detectedBy}: ${reason}`,
    };

    await idbEngine.put('pilotAIGovernanceRecords', updated);

    // Execute kill switch to disable this AI capability across the site
    await pilotKillSwitchService.executeKillSwitch(
      siteId,
      'DISABLE_AI',
      capability,
      detectedBy,
      `Immediate disablement triggered due to grounding failure: ${reason}`
    );

    return updated;
  }
}

export const pilotAIGovernanceService = PilotAIGovernanceService.getInstance();
