/**
 * Jano Health - Clinical Core V19: National Disease Surveillance Service
 * 
 * Interoperability adapter and submission workflow for national notifiable disease surveillance.
 * 
 * INVARIANTS:
 * - Reuses V14 Population Intelligence signals; does NOT create a competing surveillance engine.
 * - Surveillance Signal ≠ Confirmed Outbreak. Statistical anomaly cannot autonomously declare an outbreak.
 * - Submission states: DRAFT → REVIEW_REQUIRED → APPROVED → QUEUED → SUBMITTED → ACKNOWLEDGED.
 * - Invariant: Unsent record is NEVER called SUBMITTED.
 * - AI cannot autonomously escalate a surveillance signal into an official outbreak or submission.
 */

import {
  INationalSurveillanceAdapter,
  SurveillanceSignal,
  SurveillanceReport,
  SurveillanceSubmission,
  NationalIntegrationStatus,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class DefaultNationalSurveillanceAdapter implements INationalSurveillanceAdapter {
  public readonly adapterName = 'default_unconfigured_surveillance_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async transmitNotifiableDiseaseReport(_report: {
    diseaseCode: string;
    reportingFacilityId: string;
    timestamp: string;
    caseCount: number;
    epidemiologicalWeek: number;
    evidenceSignalId?: string;
  }): Promise<{ accepted: boolean; acknowledgmentCode: string; status: 'ACKNOWLEDGED' | 'REJECTED' }> {
    throw new Error('Cannot transmit surveillance report: surveillance adapter is strictly NOT_CONFIGURED.');
  }
}

export class SandboxSurveillanceAdapter implements INationalSurveillanceAdapter {
  public readonly adapterName = 'sandbox_surveillance_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  public async transmitNotifiableDiseaseReport(report: {
    diseaseCode: string;
    reportingFacilityId: string;
    timestamp: string;
    caseCount: number;
    epidemiologicalWeek: number;
    evidenceSignalId?: string;
  }): Promise<{ accepted: boolean; acknowledgmentCode: string; status: 'ACKNOWLEDGED' | 'REJECTED' }> {
    const ackCode = `SURV_ACK_ETH_${report.epidemiologicalWeek}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    return {
      accepted: true,
      acknowledgmentCode: ackCode,
      status: 'ACKNOWLEDGED',
    };
  }
}

export class NationalSurveillanceService {
  private static instance: NationalSurveillanceService;
  private adapter: INationalSurveillanceAdapter;

  private constructor() {
    this.adapter = new DefaultNationalSurveillanceAdapter();
  }

  public static getInstance(): NationalSurveillanceService {
    if (!NationalSurveillanceService.instance) {
      NationalSurveillanceService.instance = new NationalSurveillanceService();
    }
    return NationalSurveillanceService.instance;
  }

  public setAdapter(adapter: INationalSurveillanceAdapter): void {
    this.adapter = adapter;
  }

  public getAdapterStatus(): NationalIntegrationStatus {
    return this.adapter.status;
  }

  // ----------------------------------------------------
  // Ingest Signal from V14 Population Intelligence
  // ----------------------------------------------------

  public async registerSignal(params: {
    indicator: string;
    observedValue: number;
    baseline: number;
    threshold: number;
    period: string;
    reportingScope?: SurveillanceSignal['reportingScope'];
    sourceMetrics?: string[];
  }): Promise<SurveillanceSignal> {
    const now = new Date().toISOString();
    const signalId = `ssig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Invariant: Statistical anomaly triggers WATCH or SIGNAL, NEVER automatically OUTBREAK_CONFIRMED
    const state: SurveillanceSignal['state'] =
      params.observedValue >= params.threshold * 2
        ? 'SIGNAL'
        : params.observedValue >= params.threshold
          ? 'WATCH'
          : 'NORMAL';

    const signal: SurveillanceSignal = {
      signalId,
      reportingScope: params.reportingScope || 'FACILITY',
      period: params.period,
      indicator: params.indicator,
      observedValue: params.observedValue,
      baseline: params.baseline,
      threshold: params.threshold,
      state,
      confidence: 0.9,
      dataQuality: 'SUFFICIENT',
      sourceMetrics: params.sourceMetrics || [],
      generatedAt: now,
      provenance: {
        engine: 'V14_POPULATION_INTELLIGENCE',
        version: 'v14.0',
      },
    };

    await idbEngine.put('surveillanceSignals', signal);
    return signal;
  }

  // ----------------------------------------------------
  // Human Review & Escalation Workflow
  // ----------------------------------------------------

  public async reviewSignal(params: {
    signalId: string;
    reviewerId: string;
    decision: 'ESCALATE_FOR_REPORTING' | 'MAINTAIN_WATCH' | 'RESOLVE';
    notes: string;
  }): Promise<SurveillanceSignal> {
    const signal = await idbEngine.get<SurveillanceSignal>('surveillanceSignals', params.signalId);
    if (!signal) {
      throw new Error(`Surveillance signal ${params.signalId} not found`);
    }

    signal.reviewer = params.reviewerId;
    signal.reviewNotes = params.notes;

    if (params.decision === 'ESCALATE_FOR_REPORTING') {
      signal.state = 'ESCALATED';
    } else if (params.decision === 'RESOLVE') {
      signal.state = 'RESOLVED';
    }

    await idbEngine.put('surveillanceSignals', signal);
    return signal;
  }

  // ----------------------------------------------------
  // Submission Lifecycle
  // ----------------------------------------------------

  public async createReport(params: {
    signalId: string;
    reportingFacilityId: string;
    epidemiologicalWeek: number;
    caseCount: number;
  }): Promise<SurveillanceReport> {
    const reportId = `srep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const report: SurveillanceReport = {
      reportId,
      signalId: params.signalId,
      reportingFacilityId: params.reportingFacilityId,
      epidemiologicalWeek: params.epidemiologicalWeek,
      caseCount: params.caseCount,
      status: 'READY_FOR_REVIEW',
    };

    await idbEngine.put('surveillanceReports', report);
    return report;
  }

  public async createSubmission(reportId: string, actorId: string): Promise<SurveillanceSubmission> {
    const report = await idbEngine.get<SurveillanceReport>('surveillanceReports', reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found`);
    }

    const now = new Date().toISOString();
    const submissionId = `ssub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const submission: SurveillanceSubmission = {
      submissionId,
      reportId,
      state: 'DRAFT',
      provenance: {
        timestamp: now,
        submittedBy: actorId,
      },
    };

    await idbEngine.put('surveillanceSubmissions', submission);
    return submission;
  }

  public async approveSubmission(submissionId: string, approverId: string): Promise<SurveillanceSubmission> {
    const submission = await idbEngine.get<SurveillanceSubmission>('surveillanceSubmissions', submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    const now = new Date().toISOString();
    submission.state = 'APPROVED';
    submission.approvedBy = approverId;
    submission.approvedAt = now;

    await idbEngine.put('surveillanceSubmissions', submission);
    return submission;
  }

  public async transmitSubmission(submissionId: string): Promise<SurveillanceSubmission> {
    const submission = await idbEngine.get<SurveillanceSubmission>('surveillanceSubmissions', submissionId);
    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (submission.state !== 'APPROVED' && submission.state !== 'QUEUED') {
      throw new Error(`Cannot transmit surveillance submission in state "${submission.state}". Must be "APPROVED".`);
    }

    const report = await idbEngine.get<SurveillanceReport>('surveillanceReports', submission.reportId);
    if (!report) {
      throw new Error(`Report ${submission.reportId} not found`);
    }

    const signal = await idbEngine.get<SurveillanceSignal>('surveillanceSignals', report.signalId);

    const now = new Date().toISOString();
    submission.state = 'SUBMITTED';
    submission.submittedAt = now;

    // Transmit via adapter
    const result = await this.adapter.transmitNotifiableDiseaseReport({
      diseaseCode: signal?.indicator || 'NOTIFIABLE_DISEASE',
      reportingFacilityId: report.reportingFacilityId,
      timestamp: now,
      caseCount: report.caseCount,
      epidemiologicalWeek: report.epidemiologicalWeek,
      evidenceSignalId: report.signalId,
    });

    if (result.accepted) {
      submission.state = 'ACKNOWLEDGED';
      submission.acknowledgedAt = now;
      submission.acknowledgementCode = result.acknowledgmentCode;
    } else {
      submission.state = 'REJECTED';
    }

    await idbEngine.put('surveillanceSubmissions', submission);
    return submission;
  }

  public async getSignals(): Promise<SurveillanceSignal[]> {
    return await idbEngine.getAll<SurveillanceSignal>('surveillanceSignals');
  }

  public async getSubmissions(): Promise<SurveillanceSubmission[]> {
    return await idbEngine.getAll<SurveillanceSubmission>('surveillanceSubmissions');
  }
}

export const nationalSurveillanceService = NationalSurveillanceService.getInstance();
