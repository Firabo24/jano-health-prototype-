/**
 * Jano Health - Facility Deployment, Onboarding & Pilot Readiness Engine
 * 
 * Manages 10-stage facility onboarding workflows, strict Go-Live gates,
 * pilot site supervision, synthetic data segregation, and import quarantine.
 */

import {
  FacilityDeploymentProfile,
  FacilityOnboardingWorkflow,
  OnboardingStage,
  PilotFacility,
  SyntheticDataRecord,
  DataImportJob,
  ImportQuarantineRecord,
  ImportDomain,
  V21_INVARIANTS,
} from '../../domain/v21ProductionTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { computeSha256 } from './environmentConfigService';

export class FacilityDeploymentService {
  private static instance: FacilityDeploymentService;

  private constructor() {}

  public static getInstance(): FacilityDeploymentService {
    if (!FacilityDeploymentService.instance) {
      FacilityDeploymentService.instance = new FacilityDeploymentService();
    }
    return FacilityDeploymentService.instance;
  }

  /**
   * Registers a facility deployment profile.
   */
  public async createProfile(profile: FacilityDeploymentProfile): Promise<FacilityDeploymentProfile> {
    await idbEngine.put('facilityDeploymentProfiles', profile);
    return profile;
  }

  /**
   * Initiates an onboarding workflow for a facility.
   */
  public async initiateOnboarding(facilityId: string, targetGoLiveDate: string): Promise<FacilityOnboardingWorkflow> {
    const workflow: FacilityOnboardingWorkflow = {
      workflowId: `wf_${facilityId}_${Date.now()}`,
      facilityId,
      currentStage: 'DISCOVERED',
      stageHistory: [
        {
          stage: 'DISCOVERED',
          completedAt: new Date().toISOString(),
          completedBy: 'DEPLOYMENT_ENGINEER',
          signOffNotes: 'Facility discovered and initial profile registered.',
        },
      ],
      goLiveGatePassed: false,
      targetGoLiveDate,
    };

    await idbEngine.put('facilityOnboardingWorkflows', workflow);
    return workflow;
  }

  /**
   * Advances an onboarding workflow stage.
   * Enforces GO-LIVE GATE: Cannot enter LIVE unless all prerequisites pass.
   */
  public async advanceStage(
    workflowId: string,
    targetStage: OnboardingStage,
    actor: string,
    signOffNotes: string,
    gatePrerequisites?: {
      authWorking: boolean;
      backupVerified: boolean;
      restoreDrillPassed: boolean;
      offlineModePassed: boolean;
      trainingComplete: boolean;
    }
  ): Promise<FacilityOnboardingWorkflow> {
    const workflow = await idbEngine.get<FacilityOnboardingWorkflow>('facilityOnboardingWorkflows', workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Go-Live Gate check
    if (targetStage === 'LIVE') {
      if (!gatePrerequisites) {
        throw new Error('GO_LIVE_GATE_FAILED: Cannot transition to LIVE without explicit gate prerequisite evaluation.');
      }
      const { authWorking, backupVerified, restoreDrillPassed, offlineModePassed, trainingComplete } = gatePrerequisites;
      if (!authWorking || !backupVerified || !restoreDrillPassed || !offlineModePassed || !trainingComplete) {
        throw new Error(
          `GO_LIVE_GATE_FAILED: All gates must pass. (auth: ${authWorking}, backup: ${backupVerified}, restore: ${restoreDrillPassed}, offline: ${offlineModePassed}, training: ${trainingComplete})`
        );
      }
      workflow.goLiveGatePassed = true;
    }

    workflow.currentStage = targetStage;
    workflow.stageHistory.push({
      stage: targetStage,
      completedAt: new Date().toISOString(),
      completedBy: actor,
      signOffNotes,
    });

    await idbEngine.put('facilityOnboardingWorkflows', workflow);
    return workflow;
  }

  /**
   * Creates a pilot facility record.
   */
  public async registerPilotFacility(pilot: PilotFacility): Promise<PilotFacility> {
    await idbEngine.put('pilotFacilities', pilot);
    return pilot;
  }

  /**
   * Ingests synthetic data with strict segregation invariant.
   */
  public async recordSyntheticEntity(
    entityType: string,
    facilityScope: string,
    syntheticId: string,
    payload: Record<string, any>
  ): Promise<SyntheticDataRecord> {
    // Hard Invariant Check: Must be visibly segregated with synth_ prefix
    V21_INVARIANTS.assertSyntheticDataSegregated(true, syntheticId);

    const record: SyntheticDataRecord = {
      syntheticRecordId: syntheticId,
      entityType,
      facilityScope,
      isSynthetic: true,
      label: 'SYNTHETIC DATA',
      generatedAt: new Date().toISOString(),
      payload,
    };

    await idbEngine.put('syntheticDataRecords', record);
    return record;
  }

  /**
   * Imports data with provenance and quarantine for ambiguous/malformed items.
   */
  public async processDataImport(
    domain: ImportDomain,
    facilityId: string,
    sourceSystem: string,
    records: Array<{ identifier: string; isValid: boolean; payload: Record<string, any>; rejectionReason?: string }>
  ): Promise<DataImportJob> {
    const jobId = `imp_${Date.now()}`;
    const provenanceHash = await computeSha256(JSON.stringify(records));

    let importedCount = 0;
    let quarantinedCount = 0;

    for (const item of records) {
      if (item.isValid) {
        importedCount++;
      } else {
        quarantinedCount++;
        const quarantineItem: ImportQuarantineRecord = {
          quarantineId: `quar_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          jobId,
          domain,
          recordIdentifier: item.identifier,
          rejectionReason: item.rejectionReason || 'MALFORMED_OR_AMBIGUOUS_RECORD',
          rawPayload: item.payload,
          quarantinedAt: new Date().toISOString(),
          resolutionStatus: 'QUARANTINED',
        };
        await idbEngine.put('importQuarantineRecords', quarantineItem);
      }
    }

    const job: DataImportJob = {
      jobId,
      domain,
      facilityId,
      sourceSystem,
      totalRecords: records.length,
      importedCount,
      quarantinedCount,
      status: quarantinedCount > 0 ? 'QUARANTINED_ITEMS_PRESENT' : 'COMPLETED',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      provenanceHash,
    };

    await idbEngine.put('dataImportJobs', job);
    return job;
  }
}

export const facilityDeploymentService = FacilityDeploymentService.getInstance();
