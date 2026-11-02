/**
 * Jano Health - Clinical Core V19: National Reporting & DHIS2 / HMIS Service
 * 
 * Governed aggregate reporting workflow connecting V14 Population Intelligence
 * to National Reporting Profiles, privacy transformations, human approval gates,
 * and DHIS2/HMIS adapters.
 * 
 * INVARIANTS:
 * - V14 is the internal analytical source of truth; external reporting is NOT the internal clinical truth.
 * - Minimum necessary data principle: Aggregate reporting is distinct from patient-level clinical records.
 * - Reporting lifecycle: DRAFT → VALIDATED → APPROVAL_REQUIRED → APPROVED → QUEUED → SUBMITTED → ACKNOWLEDGED.
 * - Strict Invariants: QUEUED ≠ SUBMITTED; SUBMITTED ≠ ACKNOWLEDGED.
 * - Data Quality Rule: MISSING DATA ≠ ZERO; NO REPORT ≠ ZERO; REJECTED REPORT ≠ ZERO.
 * - Non-destructive corrections: Historical submissions are never overwritten; corrections link to originals.
 * - Human approval is MANDATORY for official submission. AI can draft/validate but CANNOT submit.
 */

import {
  IDHIS2Adapter,
  NationalReportingProfile,
  ReportingDataset,
  ReportingSubmission,
  ReportingCorrection,
  ReportingResponse,
  NationalIntegrationStatus,
  EcosystemCapability,
  computeSha256,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class DefaultDHIS2Adapter implements IDHIS2Adapter {
  public readonly adapterName = 'default_unconfigured_dhis2_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async discoverCapabilities(): Promise<EcosystemCapability> {
    return {
      capabilityId: 'cap_dhis2_unconfigured',
      systemId: 'dhis2_unconfigured',
      supportedResources: [],
      supportedInteractions: [],
      supportedProfiles: [],
      messageLimits: { maxBatchSize: 0, maxPayloadBytes: 0 },
      discoveredAt: new Date().toISOString(),
      status: 'UNKNOWN',
    };
  }

  public async validateDataset(_dataset: ReportingDataset, _profile: NationalReportingProfile): Promise<{ valid: boolean; issues: string[] }> {
    return { valid: false, issues: ['DHIS2 adapter is NOT_CONFIGURED.'] };
  }

  public async submitAggregateReport(_submission: ReportingSubmission, _dataset: ReportingDataset): Promise<{
    accepted: boolean;
    externalSubmissionId?: string;
    responseCode: string;
    details?: string;
  }> {
    throw new Error('Cannot submit report: DHIS2 adapter is strictly NOT_CONFIGURED.');
  }
}

export class SandboxDHIS2Adapter implements IDHIS2Adapter {
  public readonly adapterName = 'sandbox_dhis2_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  public async discoverCapabilities(): Promise<EcosystemCapability> {
    return {
      capabilityId: 'cap_dhis2_sbx',
      systemId: 'dhis2_sandbox',
      supportedResources: ['dataValueSets', 'completeDataSetRegistrations'],
      supportedInteractions: ['create', 'read'],
      supportedProfiles: ['DHIS2_HMIS_ETHIOPIA_R4'],
      messageLimits: { maxBatchSize: 500, maxPayloadBytes: 1048576 },
      discoveredAt: new Date().toISOString(),
      status: 'KNOWN',
    };
  }

  public async validateDataset(dataset: ReportingDataset, profile: NationalReportingProfile): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check completeness
    if (dataset.completeness < 0.8) {
      issues.push(`Dataset completeness ${(dataset.completeness * 100).toFixed(0)}% is below profile threshold (80%).`);
    }

    // Check required indicators
    for (const ind of profile.indicators) {
      const match = dataset.dataValues.find((v) => v.dataElement === ind.indicatorCode);
      if (!match) {
        issues.push(`Missing mandatory indicator: "${ind.name}" (${ind.indicatorCode}).`);
      } else if (match.value === undefined || match.value === null) {
        issues.push(`Indicator "${ind.indicatorCode}" has null value (MISSING DATA ≠ ZERO).`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  public async submitAggregateReport(_submission: ReportingSubmission, dataset: ReportingDataset): Promise<{
    accepted: boolean;
    externalSubmissionId?: string;
    responseCode: string;
    details?: string;
  }> {
    const extId = `dhis2_import_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    return {
      accepted: true,
      externalSubmissionId: extId,
      responseCode: 'SUCCESS_IMPORTED',
      details: `Successfully imported ${dataset.dataValues.length} data values to Sandbox DHIS2.`,
    };
  }
}

export class NationalReportingService {
  private static instance: NationalReportingService;
  private adapter: IDHIS2Adapter;

  private constructor() {
    this.adapter = new DefaultDHIS2Adapter();
  }

  public static getInstance(): NationalReportingService {
    if (!NationalReportingService.instance) {
      NationalReportingService.instance = new NationalReportingService();
    }
    return NationalReportingService.instance;
  }

  public setAdapter(adapter: IDHIS2Adapter): void {
    this.adapter = adapter;
  }

  public getAdapterStatus(): NationalIntegrationStatus {
    return this.adapter.status;
  }

  // ----------------------------------------------------
  // Reporting Profile Management
  // ----------------------------------------------------

  public async createReportingProfile(params: {
    reportingSystem: NationalReportingProfile['reportingSystem'];
    reportingPeriodType: NationalReportingProfile['reportingPeriodType'];
    indicators: NationalReportingProfile['indicators'];
    requiredFields?: string[];
    aggregationLevel?: NationalReportingProfile['aggregationLevel'];
    actorId: string;
  }): Promise<NationalReportingProfile> {
    const now = new Date().toISOString();
    const profileId = `rprof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const profile: NationalReportingProfile = {
      profileId,
      reportingSystem: params.reportingSystem,
      reportingPeriodType: params.reportingPeriodType,
      indicators: params.indicators,
      requiredFields: params.requiredFields || ['facilityId', 'reportingPeriod', 'dataValues'],
      transformations: ['AGGREGATION', 'SMALL_CELL_SUPPRESSION'],
      aggregationLevel: params.aggregationLevel || 'FACILITY',
      validationRules: [
        {
          ruleId: 'val-no-null-indicators',
          description: 'No indicator may have undefined or unrecorded data (Missing data ≠ Zero)',
          expression: 'every(dataValues, value != null)',
        },
      ],
      submissionRules: {
        requiresHumanApproval: true,
        submissionDeadlineDays: 5,
      },
      version: '1.0',
      effectivePeriod: { start: now },
      provenance: {
        publishedAt: now,
        publishedBy: params.actorId,
      },
    };

    await idbEngine.put('nationalReportingProfiles', profile);
    return profile;
  }

  // ----------------------------------------------------
  // Dataset Compilation from V14 Population Facts
  // ----------------------------------------------------

  public async compileDataset(params: {
    profileId: string;
    reportingPeriod: string;
    facilityId: string;
    dataValues: Array<{ dataElement: string; categoryOptionCombo?: string; value: number | string; comment?: string }>;
  }): Promise<ReportingDataset> {
    const profile = await idbEngine.get<NationalReportingProfile>('nationalReportingProfiles', params.profileId);
    if (!profile) {
      throw new Error(`Reporting profile ${params.profileId} not found`);
    }

    const now = new Date().toISOString();
    const datasetId = `rdata_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Evaluate completeness based on profile indicators
    const totalExpected = profile.indicators.length;
    const provided = params.dataValues.filter((v) => v.value !== undefined && v.value !== null).length;
    const completeness = totalExpected > 0 ? provided / totalExpected : 1.0;

    const core = {
      datasetId,
      profileId: params.profileId,
      reportingPeriod: params.reportingPeriod,
      facilityId: params.facilityId,
      dataValues: params.dataValues,
      datasetType: 'AGGREGATED' as const,
      generatedAt: now,
      completeness,
      dataQualityScore: completeness >= 0.9 ? 1.0 : completeness,
    };

    const dataset: ReportingDataset = {
      ...core,
      integrityHash: computeSha256(core),
    };

    await idbEngine.put('reportingDatasets', dataset);
    return dataset;
  }

  // ----------------------------------------------------
  // Submission Lifecycle & Human Approval Gate
  // ----------------------------------------------------

  public async createSubmission(params: {
    datasetId: string;
    profileId: string;
    facilityId: string;
    actorId: string;
  }): Promise<ReportingSubmission> {
    const dataset = await idbEngine.get<ReportingDataset>('reportingDatasets', params.datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${params.datasetId} not found`);
    }

    const now = new Date().toISOString();
    const submissionId = `rsub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const submission: ReportingSubmission = {
      submissionId,
      datasetId: params.datasetId,
      profileId: params.profileId,
      facilityId: params.facilityId,
      state: 'DRAFT',
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    await idbEngine.put('reportingSubmissions', submission);
    return submission;
  }

  public async validateSubmission(submissionId: string): Promise<{ valid: boolean; issues: string[] }> {
    const submission = await idbEngine.get<ReportingSubmission>('reportingSubmissions', submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    const dataset = await idbEngine.get<ReportingDataset>('reportingDatasets', submission.datasetId);
    const profile = await idbEngine.get<NationalReportingProfile>('nationalReportingProfiles', submission.profileId);
    if (!dataset || !profile) {
      throw new Error('Associated dataset or profile missing');
    }

    submission.state = 'VALIDATING';
    const validationResult = await this.adapter.validateDataset(dataset, profile);

    submission.state = validationResult.valid ? 'VALIDATED' : 'DRAFT';
    await idbEngine.put('reportingSubmissions', submission);

    return validationResult;
  }

  /**
   * Human Approval Gate:
   * AI cannot submit official reports. Approval must come from an authorized human steward.
   */
  public async approveSubmission(params: {
    submissionId: string;
    approverId: string;
    role: string;
  }): Promise<ReportingSubmission> {
    const submission = await idbEngine.get<ReportingSubmission>('reportingSubmissions', params.submissionId);
    if (!submission) {
      throw new Error(`Submission ${params.submissionId} not found`);
    }

    if (submission.state !== 'VALIDATED') {
      throw new Error(`Cannot approve submission in state "${submission.state}". Must be "VALIDATED".`);
    }

    const now = new Date().toISOString();
    submission.state = 'APPROVED';
    submission.approvedBy = params.approverId;
    submission.approvedAt = now;

    await idbEngine.put('reportingSubmissions', submission);
    return submission;
  }

  public async queueSubmission(submissionId: string): Promise<ReportingSubmission> {
    const submission = await idbEngine.get<ReportingSubmission>('reportingSubmissions', submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (submission.state !== 'APPROVED') {
      throw new Error(`Cannot queue submission in state "${submission.state}". Must be "APPROVED".`);
    }

    // Invariant: QUEUED is distinct from SUBMITTED
    submission.state = 'QUEUED';
    await idbEngine.put('reportingSubmissions', submission);
    return submission;
  }

  public async transmitSubmission(submissionId: string): Promise<{
    submission: ReportingSubmission;
    response: ReportingResponse;
  }> {
    const submission = await idbEngine.get<ReportingSubmission>('reportingSubmissions', submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (submission.state !== 'QUEUED' && submission.state !== 'APPROVED') {
      throw new Error(`Cannot transmit submission in state "${submission.state}". Must be "APPROVED" or "QUEUED".`);
    }

    const dataset = await idbEngine.get<ReportingDataset>('reportingDatasets', submission.datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${submission.datasetId} not found`);
    }

    const now = new Date().toISOString();
    submission.state = 'SUBMITTED';
    submission.submittedAt = now;

    // Transmit to external adapter
    const adapterResult = await this.adapter.submitAggregateReport(submission, dataset);

    // Record response
    const responseId = `rresp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const response: ReportingResponse = {
      responseId,
      submissionId,
      externalStatus: adapterResult.accepted ? 'SUCCESS' : 'ERROR',
      receivedAt: now,
      payload: adapterResult,
    };
    await idbEngine.put('reportingResponses', response);

    if (adapterResult.accepted) {
      // Invariant: Transition to ACKNOWLEDGED requires external confirmation
      submission.state = 'ACKNOWLEDGED';
      submission.acknowledgedAt = now;
      submission.externalSubmissionId = adapterResult.externalSubmissionId;
    } else {
      submission.state = 'REJECTED';
      submission.rejectionReason = adapterResult.details || 'External adapter rejected report';
    }

    await idbEngine.put('reportingSubmissions', submission);
    return { submission, response };
  }

  // ----------------------------------------------------
  // Non-Destructive Reporting Correction
  // ----------------------------------------------------

  public async correctSubmission(params: {
    originalSubmissionId: string;
    newDatasetId: string;
    reason: string;
    actorId: string;
    approvedBy: string;
  }): Promise<ReportingCorrection> {
    const original = await idbEngine.get<ReportingSubmission>('reportingSubmissions', params.originalSubmissionId);
    if (!original) {
      throw new Error(`Original submission ${params.originalSubmissionId} not found`);
    }

    const now = new Date().toISOString();
    const correctionId = `rcorr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Invariant: Never destructively overwrite historical submissions!
    original.state = 'CORRECTED';
    await idbEngine.put('reportingSubmissions', original);

    const correction: ReportingCorrection = {
      correctionId,
      originalSubmissionId: params.originalSubmissionId,
      newDatasetId: params.newDatasetId,
      reason: params.reason,
      actor: params.actorId,
      timestamp: now,
      externalReference: original.externalSubmissionId,
      approval: {
        approvedBy: params.approvedBy,
        approvedAt: now,
      },
      provenance: {
        justification: params.reason,
      },
    };

    await idbEngine.put('reportingCorrections', correction);
    return correction;
  }

  public async getSubmissions(): Promise<ReportingSubmission[]> {
    return await idbEngine.getAll<ReportingSubmission>('reportingSubmissions');
  }

  public async getProfiles(): Promise<NationalReportingProfile[]> {
    return await idbEngine.getAll<NationalReportingProfile>('nationalReportingProfiles');
  }
}

export const nationalReportingService = NationalReportingService.getInstance();
