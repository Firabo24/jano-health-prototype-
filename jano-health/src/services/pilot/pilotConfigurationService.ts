/**
 * Jano Health - Governed Pilot Site Configuration & Change Control Service (Clinical Core V23)
 * 
 * Invariants:
 * - Configuration changes create explicit, versioned change records (never silent).
 * - criticalAlertSuppressionAllowed is strictly false (safety alerts cannot be silenced).
 * - AI capabilities enforce clinicianReviewRequired = true and isAutonomousMutationAllowed = false.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  PilotConfiguration,
  PilotChangeRequest,
  PilotAICapabilityConfig,
} from '../../domain/v23ControlledPilotTypes';

export class PilotConfigurationService {
  private static instance: PilotConfigurationService;

  private constructor() {}

  public static getInstance(): PilotConfigurationService {
    if (!PilotConfigurationService.instance) {
      PilotConfigurationService.instance = new PilotConfigurationService();
    }
    return PilotConfigurationService.instance;
  }

  /**
   * Initializes or retrieves the active configuration for a pilot site
   */
  public async getOrCreateSiteConfiguration(siteId: string): Promise<PilotConfiguration> {
    const existing = await idbEngine.get<PilotConfiguration>('pilotConfigurations', `config-${siteId}`);
    if (existing) return existing;

    const baselineAI: PilotAICapabilityConfig[] = [
      {
        capabilityId: 'ai-clinical-soap-summary',
        modelId: 'gemini-3.8-flash-clinical-tuned',
        version: '1.2.0',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
        enabled: true,
      },
      {
        capabilityId: 'ai-interaction-advisory',
        modelId: 'rules-hybrid-safety-model',
        version: '2.0.0',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
        enabled: true,
      },
    ];

    const config: PilotConfiguration = {
      configId: `config-${siteId}`,
      siteId,
      version: '1.0.0',
      enabledModules: [
        'PATIENT_MANAGEMENT',
        'CLINICAL_ENCOUNTERS',
        'LABORATORY',
        'PHARMACY',
        'EMERGENCY_SATS',
        'OFFLINE_SYNC',
      ],
      enabledAICapabilities: baselineAI,
      authorizedRoles: [
        'physician',
        'nurse',
        'pharmacist',
        'laboratory_staff',
        'facility_administrator',
        'pilot_operations_director',
        'clinical_safety_officer',
      ],
      syncPeers: ['peer-local-lan-hub', 'peer-reg-cloud-sync'],
      networkMode: 'HYBRID_SYNC',
      terminologyPackageVersion: 'ICD11-TZ-NATIONAL-V2',
      medicationKnowledgeVersion: 'EML-TZ-ED4-2026',
      criticalAlertSuppressionAllowed: false, // HARD INVARIANT
      maintenanceWindows: [
        { windowId: 'mw-sun-night', start: '2026-10-11T23:00:00Z', end: '2026-10-12T01:00:00Z' },
      ],
      supportContacts: ['tech-support@janohealth.org', '+255-700-112233'],
      escalationPolicyId: 'esc-policy-tz-lake-zone',
      lastUpdatedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotConfigurations', config);
    return config;
  }

  /**
   * Submits and records an auditable change request for a pilot site
   */
  public async requestConfigurationChange(
    siteId: string,
    changeType: PilotChangeRequest['changeType'],
    description: string,
    rationale: string,
    proposedBy: string,
    revalidationRequired: boolean = false
  ): Promise<PilotChangeRequest> {
    const requestId = `cr-${siteId}-${Date.now()}`;

    const changeRequest: PilotChangeRequest = {
      requestId,
      siteId,
      changeType,
      description,
      rationale,
      riskAssessment: revalidationRequired
        ? 'High clinical/technical impact - Requires safety review and revalidation'
        : 'Controlled configuration adjustment within approved boundaries',
      revalidationRequired,
      status: 'PROPOSED',
      proposedBy,
    };

    await idbEngine.put('pilotChangeRequests', changeRequest);
    return changeRequest;
  }

  /**
   * Approves and executes a configuration change
   */
  public async approveAndApplyConfigurationChange(
    requestId: string,
    approver: string,
    updates: Partial<PilotConfiguration>
  ): Promise<PilotConfiguration> {
    const changeReq = await idbEngine.get<PilotChangeRequest>('pilotChangeRequests', requestId);
    if (!changeReq) throw new Error(`Change request ${requestId} not found.`);

    const currentConfig = await this.getOrCreateSiteConfiguration(changeReq.siteId);

    // Enforce critical invariants
    if ((updates as any).criticalAlertSuppressionAllowed === true) {
      throw new Error('CRITICAL SAFETY INVARIANT VIOLATION: Clinical alert suppression is strictly prohibited.');
    }

    // Check AI invariants if AI modified
    if (updates.enabledAICapabilities) {
      for (const ai of updates.enabledAICapabilities) {
        if (ai.isAutonomousMutationAllowed !== false || ai.clinicianReviewRequired !== true) {
          throw new Error('AI GOVERNANCE VIOLATION: AI must strictly require clinician review and forbid autonomous mutations.');
        }
      }
    }

    const versionParts = currentConfig.version.split('.').map(Number);
    const newVersion = `${versionParts[0]}.${versionParts[1] + 1}.0`;

    const updatedConfig: PilotConfiguration = {
      ...currentConfig,
      ...updates,
      configId: currentConfig.configId,
      siteId: currentConfig.siteId,
      version: newVersion,
      criticalAlertSuppressionAllowed: false,
      lastUpdatedAt: new Date().toISOString(),
      changeRequestId: requestId,
    };

    const updatedReq: PilotChangeRequest = {
      ...changeReq,
      status: 'APPROVED',
      approvedBy: approver,
      implementedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotConfigurations', updatedConfig);
    await idbEngine.put('pilotChangeRequests', updatedReq);

    return updatedConfig;
  }
}

export const pilotConfigurationService = PilotConfigurationService.getInstance();
