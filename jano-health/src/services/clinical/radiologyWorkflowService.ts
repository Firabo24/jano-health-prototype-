/**
 * Jano Health - Radiology Workflow Service (Clinical Core V5)
 * 
 * Orchestrates the full clinical diagnostic imaging lifecycle:
 * Order Requisition -> Study Scheduling -> Image Acquisition ->
 * Diagnostic Interpretation & Preliminary Reporting -> Senior Radiologist Finalization & Signing ->
 * Versioned Immutable Report Amendment -> Critical Finding Escalation & Attested Clinical Acknowledgment.
 * 
 * Safety & Architectural Directives Enforced:
 * 1. Radiology Order ≠ Radiology Study ≠ Radiology Report ≠ Diagnosis.
 * 2. An imaging study produces observational evidence and a diagnostic report.
 *    An authorized clinician synthesizes this evidence to determine clinical assessments/diagnoses.
 * 3. Software must NEVER silently generate diagnoses, treatments, or prescriptions from imaging findings.
 * 4. No autonomous AI image diagnosis without human clinical review in this milestone.
 * 5. All mutations execute via atomic clinical transactions with SHA-256 tamper-evident integrity hashes,
 *    immutable event chains, audit trail records, and offline-first queueing.
 */

import {
  RadiologyOrder,
  RadiologyStudy,
  ImagingSeries,
  RadiologyReport,
  CriticalRadiologyFinding,
  RadiologyResult,
  RadiologyModality,
  RadiologyOrderPriority,
  RadiologyLaterality,
  RadiologyProvenance,
  RadiologyReportAmendment,
} from '../../domain/types';
import {
  generateEntityId,
  generateRadiologyOrderNumber,
  generateRadiologyStudyNumber,
  generateRadiologyAccessionNumber,
} from '../../domain/identifiers';
import { sha256, canonicalJson } from '../../domain/eventIntegrity';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { localRepository } from '../storage/localRepository';

export interface CreateRadiologyOrderParams {
  patientId: string;
  encounterId?: string;
  modality: RadiologyModality;
  bodySite: string;
  laterality?: RadiologyLaterality;
  priority?: RadiologyOrderPriority;
  clinicalIndication?: string;
  clinicalQuestion?: string;
  requestedStudyType?: string;
  contrastRequested?: boolean;
  notes?: string;
}

export interface CancelRadiologyOrderParams {
  orderId: string;
  cancellationReason: string;
}

export interface ScheduleRadiologyStudyParams {
  orderId: string;
  modality?: RadiologyModality;
  bodySite?: string;
  laterality?: RadiologyLaterality;
  studyDescription?: string;
  scheduledTime?: string;
  appointmentId?: string;
}

export interface StartAcquisitionParams {
  studyId: string;
  technologistId?: string;
  technologistName?: string;
}

export interface CompleteStudyParams {
  studyId: string;
  series: ImagingSeries[];
  studyDescription?: string;
}

export interface DraftRadiologyReportParams {
  studyId: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  findings: string;
  impression: string;
  technique?: string;
  comparisonText?: string;
  clinicalHistoryReference?: string;
  recommendations?: string;
  criticalFinding?: boolean;
}

export interface FinalizeRadiologyReportParams {
  reportId?: string;
  studyId: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  findings: string;
  impression: string;
  technique?: string;
  comparisonText?: string;
  clinicalHistoryReference?: string;
  recommendations?: string;
  criticalFinding?: boolean;
  criticalFindingDescription?: string;
}

export interface AmendRadiologyReportParams {
  reportId: string;
  newFindings: string;
  newImpression: string;
  amendmentReason: string;
  newRecommendations?: string;
  newCriticalFinding?: boolean;
  newCriticalFindingDescription?: string;
}

export interface AcknowledgeCriticalFindingParams {
  findingId: string;
  actionTaken: string;
  communicationMethod?: string;
  notes?: string;
}

export class RadiologyWorkflowService {
  private static instance: RadiologyWorkflowService;

  private constructor() {}

  public static getInstance(): RadiologyWorkflowService {
    if (!RadiologyWorkflowService.instance) {
      RadiologyWorkflowService.instance = new RadiologyWorkflowService();
    }
    return RadiologyWorkflowService.instance;
  }

  // ====================================================
  // 1. RADIOLOGY ORDER REQUISITION & LIFECYCLE
  // ====================================================

  public async orderRadiology(
    params: CreateRadiologyOrderParams,
    context: ClinicalActorContext
  ): Promise<RadiologyOrder> {
    return clinicalTransaction.execute<RadiologyOrder>({
      actionName: 'ORDER_RADIOLOGY',
      resourceType: 'RadiologyOrder',
      targetStore: 'radiologyOrders',
      actor: context,
      requiredPermission: 'radiology:order',
      validate: async () => {
        if (!params.patientId) throw new Error('Patient ID is required to place a radiology requisition');
        if (!params.modality) throw new Error('Modality (e.g., XR, CT, MRI, ULTRASOUND) is required');
        if (!params.bodySite || !params.bodySite.trim()) {
          throw new Error('Anatomical body site is required for imaging');
        }
        if (!params.clinicalIndication && !params.clinicalQuestion) {
          throw new Error('A structured clinical indication or question is required for radiology justification');
        }

        const patient = await localRepository.getPatient(params.patientId);
        if (!patient) {
          throw new Error(`Patient not found with ID: ${params.patientId}`);
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('rad_ord');
        const now = new Date().toISOString();
        const orderNumber = generateRadiologyOrderNumber(context.facilityId, context.deviceId, new Date());
        const priority = params.priority || 'routine';

        const provenance: RadiologyProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const order: RadiologyOrder = {
          id,
          orderNumber,
          patientId: params.patientId,
          encounterId: params.encounterId,
          facilityId: context.facilityId,
          orderingClinicianId: context.userId,
          orderingClinicianName: context.userName,
          orderingClinicianRole: context.userRole,
          requestedAt: now,
          priority,
          modality: params.modality,
          bodySite: params.bodySite.trim(),
          laterality: params.laterality || 'NOT_APPLICABLE',
          indication: params.clinicalIndication || params.clinicalQuestion,
          clinicalQuestion: params.clinicalQuestion,
          requestedStudyType: params.requestedStudyType || `${params.modality} ${params.bodySite.trim()}`,
          contrastRequested: params.contrastRequested ?? false,
          notes: params.notes,
          status: 'PLACED',
          version: 1,
          provenance,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',

          // Backwards compatibility aliases
          orderedById: context.userId,
          orderedAt: now,
          urgency: priority,
          clinicalIndication: params.clinicalIndication || params.clinicalQuestion,
        };

        return {
          entity: order,
          eventType: 'RADIOLOGY_ORDER_CREATED',
          aggregateId: order.id,
          aggregateType: 'RadiologyOrder',
          version: 1,
          auditAction: 'RADIOLOGY_ORDER_CREATED',
        };
      },
    });
  }

  public async cancelRadiologyOrder(
    params: CancelRadiologyOrderParams,
    context: ClinicalActorContext
  ): Promise<RadiologyOrder> {
    return clinicalTransaction.execute<RadiologyOrder>({
      actionName: 'CANCEL_RADIOLOGY_ORDER',
      resourceType: 'RadiologyOrder',
      resourceId: params.orderId,
      targetStore: 'radiologyOrders',
      actor: context,
      requiredPermission: 'radiology:order_cancel',
      validate: async () => {
        if (!params.orderId) throw new Error('Order ID is required to cancel a radiology requisition');
        if (!params.cancellationReason || !params.cancellationReason.trim()) {
          throw new Error('A structured clinical reason is mandatory to cancel an active radiology order');
        }

        const order = await localRepository.getRadiologyOrder(params.orderId);
        if (!order) {
          throw new Error(`Radiology order not found: ${params.orderId}`);
        }
        if (order.status === 'COMPLETED' || order.status === 'reported') {
          throw new Error('Cannot cancel a radiology order that is already completed or reported');
        }
        if (order.status === 'CANCELLED') {
          throw new Error('Radiology order is already cancelled');
        }
      },
      buildEntity: async () => {
        const order = (await localRepository.getRadiologyOrder(params.orderId))!;
        const previousState = { ...order };
        const now = new Date().toISOString();

        const updatedOrder: RadiologyOrder = {
          ...order,
          status: 'CANCELLED',
          notes: params.cancellationReason
            ? `${order.notes ? order.notes + ' | ' : ''}Cancelled: ${params.cancellationReason}`
            : order.notes,
          updatedAt: now,
          version: (order.version || 1) + 1,
        };

        return {
          entity: updatedOrder,
          eventType: 'RADIOLOGY_ORDER_CANCELLED',
          aggregateId: updatedOrder.id,
          aggregateType: 'RadiologyOrder',
          version: updatedOrder.version || 2,
          auditAction: 'RADIOLOGY_ORDER_CANCELLED',
          previousState,
        };
      },
    });
  }

  // ====================================================
  // 2. STUDY SCHEDULING & IMAGING ACQUISITION
  // ====================================================

  public async scheduleRadiologyStudy(
    params: ScheduleRadiologyStudyParams,
    context: ClinicalActorContext
  ): Promise<RadiologyStudy> {
    return clinicalTransaction.execute<RadiologyStudy>({
      actionName: 'SCHEDULE_RADIOLOGY_STUDY',
      resourceType: 'RadiologyStudy',
      targetStore: 'radiologyStudies',
      actor: context,
      requiredPermission: 'radiology:study_schedule',
      validate: async () => {
        if (!params.orderId) throw new Error('Parent Order ID is required to schedule an imaging study');

        const order = await localRepository.getRadiologyOrder(params.orderId);
        if (!order) {
          throw new Error(`Radiology order not found: ${params.orderId}`);
        }
        if (order.status === 'CANCELLED') {
          throw new Error('Cannot schedule an imaging study for a cancelled order');
        }
      },
      buildEntity: async () => {
        const order = (await localRepository.getRadiologyOrder(params.orderId))!;
        const id = generateEntityId('rad_std');
        const now = new Date().toISOString();
        const studyNumber = generateRadiologyStudyNumber(context.facilityId, context.deviceId, new Date());
        const accessionNumber = generateRadiologyAccessionNumber(context.facilityId, context.deviceId, new Date());

        const modality = params.modality || order.modality;
        const bodySite = params.bodySite || order.bodySite;
        const laterality = params.laterality || order.laterality || 'NOT_APPLICABLE';
        const studyDescription = params.studyDescription || `${modality} ${bodySite} (${laterality})`;

        const provenance: RadiologyProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const study: RadiologyStudy = {
          id,
          studyNumber,
          accessionNumber,
          orderId: order.id,
          patientId: order.patientId,
          encounterId: order.encounterId,
          facilityId: context.facilityId,
          modality,
          bodySite,
          laterality,
          studyDescription,
          status: 'SCHEDULED',
          seriesCount: 0,
          instanceCount: 0,
          series: [],
          provenance,
          version: 1,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',
        };

        // Advance parent order status to SCHEDULED
        if (order.status === 'PLACED' || order.status === 'ordered') {
          await localRepository.saveRadiologyOrder({
            ...order,
            status: 'SCHEDULED',
            appointmentId: params.appointmentId || order.appointmentId,
            updatedAt: now,
            version: (order.version || 1) + 1,
          });
        }

        return {
          entity: study,
          eventType: 'RADIOLOGY_STUDY_CREATED',
          aggregateId: study.id,
          aggregateType: 'RadiologyStudy',
          version: 1,
          auditAction: 'RADIOLOGY_STUDY_SCHEDULED',
        };
      },
    });
  }

  public async startAcquisition(
    params: StartAcquisitionParams,
    context: ClinicalActorContext
  ): Promise<RadiologyStudy> {
    return clinicalTransaction.execute<RadiologyStudy>({
      actionName: 'START_RADIOLOGY_ACQUISITION',
      resourceType: 'RadiologyStudy',
      resourceId: params.studyId,
      targetStore: 'radiologyStudies',
      actor: context,
      requiredPermission: 'radiology:study_perform',
      validate: async () => {
        if (!params.studyId) throw new Error('Study ID is required to start imaging acquisition');
        const study = await localRepository.getRadiologyStudy(params.studyId);
        if (!study) {
          throw new Error(`Radiology study not found: ${params.studyId}`);
        }
        if (study.status === 'CANCELLED' || study.status === 'REJECTED') {
          throw new Error(`Cannot start acquisition on a study with status: ${study.status}`);
        }
      },
      buildEntity: async () => {
        const study = (await localRepository.getRadiologyStudy(params.studyId))!;
        const previousState = { ...study };
        const now = new Date().toISOString();

        const updatedStudy: RadiologyStudy = {
          ...study,
          status: 'IN_PROGRESS',
          startedAt: now,
          performingTechnologistId: params.technologistId || context.userId,
          performingTechnologistName: params.technologistName || context.userName,
          performingTechnologistRole: context.userRole,
          updatedAt: now,
          version: (study.version || 1) + 1,
        };

        // Also update the related order status to IN_PROGRESS
        const order = await localRepository.getRadiologyOrder(study.orderId);
        if (order && order.status !== 'IN_PROGRESS' && order.status !== 'COMPLETED') {
          await localRepository.saveRadiologyOrder({
            ...order,
            status: 'IN_PROGRESS',
            updatedAt: now,
          });
        }

        return {
          entity: updatedStudy,
          eventType: 'RADIOLOGY_STUDY_STARTED',
          aggregateId: updatedStudy.id,
          aggregateType: 'RadiologyStudy',
          version: updatedStudy.version || 2,
          auditAction: 'RADIOLOGY_STUDY_STARTED',
          previousState,
        };
      },
    });
  }

  public async completeStudy(
    params: CompleteStudyParams,
    context: ClinicalActorContext
  ): Promise<RadiologyStudy> {
    return clinicalTransaction.execute<RadiologyStudy>({
      actionName: 'COMPLETE_RADIOLOGY_STUDY',
      resourceType: 'RadiologyStudy',
      resourceId: params.studyId,
      targetStore: 'radiologyStudies',
      actor: context,
      requiredPermission: 'radiology:study_complete',
      validate: async () => {
        if (!params.studyId) throw new Error('Study ID is required to complete study');
        const study = await localRepository.getRadiologyStudy(params.studyId);
        if (!study) {
          throw new Error(`Radiology study not found: ${params.studyId}`);
        }
        if (!params.series || params.series.length === 0) {
          throw new Error('At least one imaging series with captured instances is required to complete study');
        }
      },
      buildEntity: async () => {
        const study = (await localRepository.getRadiologyStudy(params.studyId))!;
        const previousState = { ...study };
        const now = new Date().toISOString();

        const seriesCount = params.series.length;
        const instanceCount = params.series.reduce((sum, s) => sum + (s.instanceCount || (s.instances?.length ?? 0)), 0);

        const updatedStudy: RadiologyStudy = {
          ...study,
          status: 'COMPLETED',
          completedAt: now,
          studyDescription: params.studyDescription || study.studyDescription,
          series: params.series,
          seriesCount,
          instanceCount,
          updatedAt: now,
          version: (study.version || 1) + 1,
        };

        // Mark parent order ready for reporting
        const order = await localRepository.getRadiologyOrder(study.orderId);
        if (order) {
          await localRepository.saveRadiologyOrder({
            ...order,
            status: 'COMPLETED',
            updatedAt: now,
          });
        }

        return {
          entity: updatedStudy,
          eventType: 'RADIOLOGY_STUDY_COMPLETED',
          aggregateId: updatedStudy.id,
          aggregateType: 'RadiologyStudy',
          version: updatedStudy.version || 2,
          auditAction: 'RADIOLOGY_STUDY_COMPLETED',
          previousState,
        };
      },
    });
  }

  // ====================================================
  // 3. DIAGNOSTIC INTERPRETATION & REPORTING
  // ====================================================

  public async draftReport(
    params: DraftRadiologyReportParams,
    context: ClinicalActorContext
  ): Promise<RadiologyReport> {
    return clinicalTransaction.execute<RadiologyReport>({
      actionName: 'DRAFT_RADIOLOGY_REPORT',
      resourceType: 'RadiologyReport',
      targetStore: 'radiologyReports',
      actor: context,
      requiredPermission: 'radiology:report_write',
      validate: async () => {
        if (!params.studyId) throw new Error('Study ID is required to draft a report');
        if (!params.findings && !params.impression) {
          throw new Error('Report requires preliminary findings or impression text');
        }
        const study = await localRepository.getRadiologyStudy(params.studyId);
        if (!study) {
          throw new Error(`Radiology study not found: ${params.studyId}`);
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('rad_rep');
        const now = new Date().toISOString();

        const provenance: RadiologyProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const report: RadiologyReport = {
          id,
          studyId: params.studyId,
          orderId: params.orderId,
          patientId: params.patientId,
          encounterId: params.encounterId,
          facilityId: context.facilityId,
          radiologistId: context.userId,
          radiologistName: context.userName,
          radiologistRole: context.userRole,
          findings: params.findings,
          impression: params.impression,
          technique: params.technique,
          comparisonText: params.comparisonText,
          clinicalHistoryReference: params.clinicalHistoryReference,
          recommendations: params.recommendations,
          criticalFinding: params.criticalFinding ?? false,
          status: 'DRAFT',
          version: 1,
          provenance,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',
        };

        return {
          entity: report,
          eventType: 'RADIOLOGY_REPORT_CREATED',
          aggregateId: report.id,
          aggregateType: 'RadiologyReport',
          version: 1,
          auditAction: 'RADIOLOGY_REPORT_DRAFTED',
        };
      },
    });
  }

  public async finalizeReport(
    params: FinalizeRadiologyReportParams,
    context: ClinicalActorContext
  ): Promise<{ report: RadiologyReport; criticalFinding?: CriticalRadiologyFinding }> {
    let generatedFinding: CriticalRadiologyFinding | undefined;

    const report = await clinicalTransaction.execute<RadiologyReport>({
      actionName: 'FINALIZE_RADIOLOGY_REPORT',
      resourceType: 'RadiologyReport',
      resourceId: params.reportId,
      targetStore: 'radiologyReports',
      actor: context,
      requiredPermission: 'radiology:report_finalize',
      validate: async () => {
        if (!params.studyId) throw new Error('Study ID is required to finalize radiology report');
        if (!params.findings || !params.findings.trim()) {
          throw new Error('Detailed observational anatomical findings are required to finalize report');
        }
        if (!params.impression || !params.impression.trim()) {
          throw new Error('Radiologist diagnostic impression is required to sign and finalize report');
        }
        if (params.criticalFinding && (!params.criticalFindingDescription || !params.criticalFindingDescription.trim())) {
          throw new Error('A structured description of the critical finding is required when marking report as critical');
        }

        const study = await localRepository.getRadiologyStudy(params.studyId);
        if (!study) {
          throw new Error(`Radiology study not found: ${params.studyId}`);
        }
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        let existingReport: RadiologyReport | undefined;

        if (params.reportId) {
          existingReport = await localRepository.getRadiologyReport(params.reportId);
        }

        const id = existingReport ? existingReport.id : generateEntityId('rad_rep');
        const previousState = existingReport ? { ...existingReport } : undefined;

        // Compute deterministic SHA-256 integrity hash across key clinical diagnostic payload fields
        const payloadToHash = {
          reportId: id,
          studyId: params.studyId,
          orderId: params.orderId,
          patientId: params.patientId,
          radiologistId: context.userId,
          findings: params.findings.trim(),
          impression: params.impression.trim(),
          criticalFinding: params.criticalFinding ?? false,
          signedAt: now,
        };
        const integrityHash = sha256(canonicalJson(payloadToHash));

        const provenance: RadiologyProvenance = existingReport?.provenance || {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const finalizedReport: RadiologyReport = {
          id,
          studyId: params.studyId,
          orderId: params.orderId,
          patientId: params.patientId,
          encounterId: params.encounterId || existingReport?.encounterId,
          facilityId: context.facilityId,
          radiologistId: context.userId,
          radiologistName: context.userName,
          radiologistRole: context.userRole,
          findings: params.findings.trim(),
          impression: params.impression.trim(),
          technique: params.technique || existingReport?.technique,
          comparisonText: params.comparisonText || existingReport?.comparisonText,
          clinicalHistoryReference: params.clinicalHistoryReference || existingReport?.clinicalHistoryReference,
          recommendations: params.recommendations || existingReport?.recommendations,
          criticalFinding: params.criticalFinding ?? false,
          status: 'FINAL',
          signedAt: now,
          verifiedAt: now,
          integrityHash,
          version: existingReport ? (existingReport.version || 1) + 1 : 1,
          provenance,
          createdAt: existingReport ? existingReport.createdAt : now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',
        };

        // Dual-write to radiologyResults for backwards compatibility with clinical chart views
        const radResult: RadiologyResult = {
          id: generateEntityId('rad_res'),
          orderId: params.orderId,
          patientId: params.patientId,
          radiologistId: context.userId,
          findings: finalizedReport.findings,
          impression: finalizedReport.impression,
          completedAt: now,
          urgencyFlags: finalizedReport.criticalFinding ? 'CRITICAL_ALERT' : undefined,
          reportId: finalizedReport.id,
          criticalFinding: finalizedReport.criticalFinding,
        };
        await localRepository.saveRadiologyResult(radResult);

        // Update the study status to COMPLETED
        const study = await localRepository.getRadiologyStudy(params.studyId);
        if (study) {
          await localRepository.saveRadiologyStudy({
            ...study,
            status: 'COMPLETED',
            updatedAt: now,
          });
        }

        // Update the order status to COMPLETED / reported
        const order = await localRepository.getRadiologyOrder(params.orderId);
        if (order) {
          await localRepository.saveRadiologyOrder({
            ...order,
            status: 'COMPLETED',
            updatedAt: now,
          });
        }

        return {
          entity: finalizedReport,
          eventType: 'RADIOLOGY_REPORT_FINALIZED',
          aggregateId: finalizedReport.id,
          aggregateType: 'RadiologyReport',
          version: finalizedReport.version,
          auditAction: 'RADIOLOGY_REPORT_FINALIZED',
          previousState,
        };
      },
    });

    // Handle Critical Finding Escalation if flagged
    if (params.criticalFinding) {
      generatedFinding = await this.createCriticalFindingRecord(
        {
          reportId: report.id,
          studyId: report.studyId,
          orderId: report.orderId,
          patientId: report.patientId,
          encounterId: report.encounterId,
          facilityId: report.facilityId,
          description: params.criticalFindingDescription || report.impression,
        },
        context
      );
    }

    return { report, criticalFinding: generatedFinding };
  }

  // ====================================================
  // 4. IMMUTABLE REPORT AMENDMENT
  // ====================================================

  public async amendReport(
    params: AmendRadiologyReportParams,
    context: ClinicalActorContext
  ): Promise<RadiologyReport> {
    return clinicalTransaction.execute<RadiologyReport>({
      actionName: 'AMEND_RADIOLOGY_REPORT',
      resourceType: 'RadiologyReport',
      resourceId: params.reportId,
      targetStore: 'radiologyReports',
      actor: context,
      requiredPermission: 'radiology:report_amend',
      validate: async () => {
        if (!params.reportId) throw new Error('Report ID is required to amend');
        if (!params.amendmentReason || !params.amendmentReason.trim()) {
          throw new Error('A structured clinical amendment reason is mandatory for legal and audit compliance');
        }
        if (!params.newFindings || !params.newFindings.trim()) {
          throw new Error('Amended findings cannot be empty');
        }
        if (!params.newImpression || !params.newImpression.trim()) {
          throw new Error('Amended diagnostic impression cannot be empty');
        }

        const existing = await localRepository.getRadiologyReport(params.reportId);
        if (!existing) {
          throw new Error(`Radiology report not found: ${params.reportId}`);
        }
        if (existing.status !== 'FINAL' && existing.status !== 'AMENDED') {
          throw new Error('Only finalized or previously amended reports can be formally amended');
        }
      },
      buildEntity: async () => {
        const existing = (await localRepository.getRadiologyReport(params.reportId))!;
        const previousState = { ...existing };
        const now = new Date().toISOString();
        const nextVersion = (existing.version || 1) + 1;

        // Create immutable amendment entry
        const amendmentRecord: RadiologyReportAmendment = {
          version: existing.version || 1,
          amendedAt: now,
          amendedById: context.userId,
          amendedByName: context.userName,
          amendedByRole: context.userRole,
          reason: params.amendmentReason.trim(),
          previousFindings: existing.findings,
          previousImpression: existing.impression,
        };

        const existingHistory = existing.amendmentHistory || [];
        const amendmentHistory = [...existingHistory, amendmentRecord];

        // Recalculate SHA-256 integrity hash for amended report
        const isCritical = params.newCriticalFinding ?? existing.criticalFinding;
        const payloadToHash = {
          reportId: existing.id,
          studyId: existing.studyId,
          orderId: existing.orderId,
          patientId: existing.patientId,
          version: nextVersion,
          findings: params.newFindings.trim(),
          impression: params.newImpression.trim(),
          criticalFinding: isCritical,
          amendedAt: now,
          amendedById: context.userId,
        };
        const integrityHash = sha256(canonicalJson(payloadToHash));

        const amendedReport: RadiologyReport = {
          ...existing,
          findings: params.newFindings.trim(),
          impression: params.newImpression.trim(),
          recommendations: params.newRecommendations || existing.recommendations,
          criticalFinding: isCritical,
          status: 'AMENDED',
          version: nextVersion,
          previousVersionId: `${existing.id}_v${existing.version}`,
          amendmentReason: params.amendmentReason.trim(),
          amendmentHistory,
          integrityHash,
          updatedAt: now,
        };

        // If newly flagged as critical, trigger critical finding escalation
        if (params.newCriticalFinding && !existing.criticalFinding) {
          await this.createCriticalFindingRecord(
            {
              reportId: amendedReport.id,
              studyId: amendedReport.studyId,
              orderId: amendedReport.orderId,
              patientId: amendedReport.patientId,
              encounterId: amendedReport.encounterId,
              facilityId: amendedReport.facilityId,
              description: params.newCriticalFindingDescription || amendedReport.impression,
            },
            context
          );
        }

        return {
          entity: amendedReport,
          eventType: 'RADIOLOGY_REPORT_AMENDED',
          aggregateId: amendedReport.id,
          aggregateType: 'RadiologyReport',
          version: nextVersion,
          auditAction: 'RADIOLOGY_REPORT_AMENDED',
          previousState,
        };
      },
    });
  }

  // ====================================================
  // 5. CRITICAL FINDING ESCALATION & CLINICAL ACKNOWLEDGMENT
  // ====================================================

  private async createCriticalFindingRecord(
    params: {
      reportId: string;
      studyId: string;
      orderId: string;
      patientId: string;
      encounterId?: string;
      facilityId: string;
      description: string;
    },
    context: ClinicalActorContext
  ): Promise<CriticalRadiologyFinding> {
    return clinicalTransaction.execute<CriticalRadiologyFinding>({
      actionName: 'ESCALATE_CRITICAL_RADIOLOGY_FINDING',
      resourceType: 'CriticalRadiologyFinding',
      targetStore: 'criticalRadiologyFindings',
      actor: context,
      requiredPermission: 'radiology:report_finalize',
      validate: () => {},
      buildEntity: async () => {
        const id = generateEntityId('rad_crit');
        const now = new Date().toISOString();

        const finding: CriticalRadiologyFinding = {
          id,
          reportId: params.reportId,
          studyId: params.studyId,
          orderId: params.orderId,
          patientId: params.patientId,
          encounterId: params.encounterId,
          facilityId: params.facilityId,
          findingDescription: params.description,
          escalatedAt: now,
          escalatedById: context.userId,
          escalatedByName: context.userName,
          acknowledged: false,
        };

        return {
          entity: finding,
          eventType: 'CRITICAL_RADIOLOGY_FINDING_CREATED',
          aggregateId: finding.id,
          aggregateType: 'CriticalRadiologyFinding',
          version: 1,
          auditAction: 'CRITICAL_RADIOLOGY_FINDING_ESCALATED',
        };
      },
    });
  }

  public async acknowledgeCriticalFinding(
    params: AcknowledgeCriticalFindingParams,
    context: ClinicalActorContext
  ): Promise<CriticalRadiologyFinding> {
    return clinicalTransaction.execute<CriticalRadiologyFinding>({
      actionName: 'ACKNOWLEDGE_CRITICAL_RADIOLOGY_FINDING',
      resourceType: 'CriticalRadiologyFinding',
      resourceId: params.findingId,
      targetStore: 'criticalRadiologyFindings',
      actor: context,
      requiredPermission: 'radiology:critical_acknowledge',
      validate: async () => {
        if (!params.findingId) throw new Error('Critical Finding ID is required');
        if (!params.actionTaken || !params.actionTaken.trim()) {
          throw new Error('Documenting immediate clinical action taken is mandatory when acknowledging a critical imaging alert');
        }

        const finding = await localRepository.getCriticalRadiologyFinding(params.findingId);
        if (!finding) {
          throw new Error(`Critical radiology finding not found: ${params.findingId}`);
        }
        if (finding.acknowledged) {
          throw new Error('This critical finding has already been acknowledged');
        }
      },
      buildEntity: async () => {
        const finding = (await localRepository.getCriticalRadiologyFinding(params.findingId))!;
        const previousState = { ...finding };
        const now = new Date().toISOString();

        const acknowledgedFinding: CriticalRadiologyFinding = {
          ...finding,
          acknowledged: true,
          acknowledgedAt: now,
          acknowledgedById: context.userId,
          acknowledgedByName: context.userName,
          acknowledgedByRole: context.userRole,
          actionTaken: params.actionTaken.trim(),
          communicationMethod: params.communicationMethod || 'DIRECT_IN_PERSON',
          notes: params.notes,
        };

        return {
          entity: acknowledgedFinding,
          eventType: 'CRITICAL_RADIOLOGY_FINDING_ACKNOWLEDGED',
          aggregateId: acknowledgedFinding.id,
          aggregateType: 'CriticalRadiologyFinding',
          version: 2,
          auditAction: 'CRITICAL_RADIOLOGY_FINDING_ACKNOWLEDGED',
          previousState,
        };
      },
    });
  }

  // ====================================================
  // 6. QUERY & RETRIEVAL HELPERS
  // ====================================================

  public async getOrders(patientId?: string, facilityId?: string): Promise<RadiologyOrder[]> {
    return localRepository.getRadiologyOrders(patientId, facilityId);
  }

  public async getOrder(orderId: string): Promise<RadiologyOrder | undefined> {
    return localRepository.getRadiologyOrder(orderId);
  }

  public async getStudies(orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyStudy[]> {
    return localRepository.getRadiologyStudies(orderId, patientId, facilityId);
  }

  public async getStudy(studyId: string): Promise<RadiologyStudy | undefined> {
    return localRepository.getRadiologyStudy(studyId);
  }

  public async getReports(studyId?: string, orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyReport[]> {
    return localRepository.getRadiologyReports(studyId, orderId, patientId, facilityId);
  }

  public async getReport(reportId: string): Promise<RadiologyReport | undefined> {
    return localRepository.getRadiologyReport(reportId);
  }

  public async getCriticalFindings(facilityId?: string, patientId?: string): Promise<CriticalRadiologyFinding[]> {
    return localRepository.getCriticalRadiologyFindings(facilityId, patientId);
  }

  public async getUnacknowledgedCriticalFindings(facilityId?: string): Promise<CriticalRadiologyFinding[]> {
    const list = await localRepository.getCriticalRadiologyFindings(facilityId);
    return list.filter((f) => !f.acknowledged);
  }
}

export const radiologyWorkflowService = RadiologyWorkflowService.getInstance();
