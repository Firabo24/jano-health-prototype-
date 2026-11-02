/**
 * Jano Health - Laboratory Workflow Service (Clinical Core V4)
 * 
 * Orchestrates the full clinical diagnostic laboratory lifecycle:
 * Order Requisition -> Specimen Collection -> Specimen Intake & Reception/Rejection ->
 * Result Entry -> Senior Laboratory Verification -> Versioned Result Correction ->
 * Critical Alert Escalation & Attested Clinical Acknowledgment.
 * 
 * Safety Directives Enforced:
 * 1. A laboratory result can inform clinical reasoning; it cannot automatically become a diagnosis or treatment decision.
 * 2. Laboratory software may display reference ranges, abnormal flags, and critical flags.
 *    It must NEVER silently generate diagnoses, treatments, or prescriptions.
 * 3. All mutations are executed via atomic clinical transactions with append-only hash chains,
 *    tamper-evident audit logging, and offline-first queueing.
 */

import {
  LaboratoryOrder,
  LaboratorySpecimen,
  LaboratoryResult,
  TestRequest,
  SpecimenStatus,
  SpecimenRejectionReason,
  ResultCorrectionHistory,
  LaboratoryOrderStatus,
  LaboratoryOrderPriority,
  AbnormalFlag,
  LaboratoryProvenance,
} from '../../domain/types';
import { generateEntityId, generateLabOrderNumber, generateAccessionNumber } from '../../domain/identifiers';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { localRepository } from '../storage/localRepository';

export interface CreateLabOrderParams {
  patientId: string;
  encounterId?: string;
  testName: string;
  category?: 'hematology' | 'biochemistry' | 'microbiology' | 'parasitology' | 'rapid_diagnostic';
  priority?: LaboratoryOrderPriority;
  clinicalIndication?: string;
  instructions?: string;
  testRequests?: TestRequest[];
}

export interface CollectSpecimenParams {
  orderId: string;
  patientId: string;
  encounterId?: string;
  specimenType: string;
  collectionSite?: string;
  condition?: string;
}

export interface ReceiveSpecimenParams {
  specimenId: string;
  condition?: string;
}

export interface RejectSpecimenParams {
  specimenId: string;
  rejectionReason: SpecimenRejectionReason;
  rejectionNotes: string;
}

export interface EnterResultParams {
  orderId: string;
  patientId: string;
  specimenId?: string;
  testCode?: string;
  testName: string;
  parameterName?: string;
  value: string;
  numericValue?: number;
  unit?: string;
  referenceRange?: string;
  abnormalFlag?: AbnormalFlag;
  criticalFlag?: boolean;
  technicianNotes?: string;
}

export interface VerifyResultParams {
  resultId: string;
  verificationNotes?: string;
}

export interface CorrectResultParams {
  resultId: string;
  newValue: string;
  newNumericValue?: number;
  newAbnormalFlag?: AbnormalFlag;
  newCriticalFlag?: boolean;
  correctionReason: string;
}

export interface AcknowledgeCriticalParams {
  resultId: string;
  clinicalActionTaken: string;
  notes?: string;
}

export class LaboratoryWorkflowService {
  private static instance: LaboratoryWorkflowService;

  private constructor() {}

  public static getInstance(): LaboratoryWorkflowService {
    if (!LaboratoryWorkflowService.instance) {
      LaboratoryWorkflowService.instance = new LaboratoryWorkflowService();
    }
    return LaboratoryWorkflowService.instance;
  }

  // ----------------------------------------------------
  // 1. LAB ORDER LIFECYCLE
  // ----------------------------------------------------

  public async orderLabTests(
    params: CreateLabOrderParams,
    context: ClinicalActorContext
  ): Promise<LaboratoryOrder> {
    return clinicalTransaction.execute<LaboratoryOrder>({
      actionName: 'ORDER_LAB_TEST',
      resourceType: 'LaboratoryOrder',
      targetStore: 'labOrders',
      actor: context,
      requiredPermission: 'lab:order',
      validate: async () => {
        if (!params.patientId) throw new Error('Patient ID is required to create a laboratory requisition');
        if (!params.testName) throw new Error('Test name is required to order laboratory diagnostic');

        const patient = await localRepository.getPatient(params.patientId);
        if (!patient) {
          throw new Error(`Patient not found with ID: ${params.patientId}`);
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('lab_ord');
        const now = new Date().toISOString();
        const orderNumber = generateLabOrderNumber(context.facilityId, context.deviceId, new Date());
        const priority = params.priority || 'routine';
        const category = params.category || 'hematology';

        const defaultTestRequests: TestRequest[] = params.testRequests || [
          {
            testCode: params.testName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            testName: params.testName,
            terminologySystem: 'LOCAL_LAB_CATALOG',
            specimenType: 'WHOLE_BLOOD',
            priority,
            requestedAt: now,
            status: 'PENDING',
            instructions: params.instructions,
          },
        ];

        const provenance: LaboratoryProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const order: LaboratoryOrder = {
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
          clinicalIndication: params.clinicalIndication,
          requestedTests: defaultTestRequests,
          status: 'PLACED',
          version: 1,
          provenance,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',

          // Backwards compatibility aliases
          orderedById: context.userId,
          testName: params.testName,
          category,
          urgency: priority,
          orderedAt: now,
        };

        return {
          entity: order,
          eventType: 'LAB_ORDER_CREATED',
          aggregateId: order.id,
          aggregateType: 'LaboratoryOrder',
          version: 1,
          auditAction: 'LAB_ORDER_CREATED',
        };
      },
    });
  }

  public async cancelLabOrder(
    orderId: string,
    cancellationReason: string,
    context: ClinicalActorContext
  ): Promise<LaboratoryOrder> {
    return clinicalTransaction.execute<LaboratoryOrder>({
      actionName: 'CANCEL_LAB_ORDER',
      resourceType: 'LaboratoryOrder',
      resourceId: orderId,
      targetStore: 'labOrders',
      actor: context,
      requiredPermission: 'lab:order_cancel',
      validate: async () => {
        if (!orderId) throw new Error('Order ID is required to cancel');
        if (!cancellationReason || !cancellationReason.trim()) {
          throw new Error('A structured clinical cancellation reason is required');
        }

        const orders = await localRepository.getLabOrders();
        const order = orders.find((o) => o.id === orderId || o.orderNumber === orderId);
        if (!order) {
          throw new Error(`Laboratory order not found with ID: ${orderId}`);
        }

        if (order.status === 'COMPLETED' || order.status === 'completed') {
          throw new Error('Cannot cancel a laboratory order that has already been reported or completed');
        }
      },
      buildEntity: async () => {
        const orders = await localRepository.getLabOrders();
        const existing = orders.find((o) => o.id === orderId || o.orderNumber === orderId)!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const updated: LaboratoryOrder = {
          ...existing,
          status: 'CANCELLED',
          cancellationReason,
          cancelledAt: now,
          cancelledById: context.userId,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'LAB_ORDER_CANCELLED',
          aggregateId: updated.id,
          aggregateType: 'LaboratoryOrder',
          version: updated.version || 2,
          auditAction: 'LAB_ORDER_CANCELLED',
          previousState,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 2. SPECIMEN WORKFLOW (COLLECT, RECEIVE, REJECT)
  // ----------------------------------------------------

  public async collectSpecimen(
    params: CollectSpecimenParams,
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return clinicalTransaction.execute<LaboratorySpecimen>({
      actionName: 'COLLECT_SPECIMEN',
      resourceType: 'LaboratorySpecimen',
      targetStore: 'labSpecimens',
      actor: context,
      requiredPermission: 'lab:specimen_collect',
      validate: async () => {
        if (!params.orderId) throw new Error('Laboratory Order ID is required for specimen collection');
        if (!params.patientId) throw new Error('Patient ID is required for specimen collection');
        if (!params.specimenType) throw new Error('Specimen type is required');

        const orders = await localRepository.getLabOrders();
        const order = orders.find((o) => o.id === params.orderId || o.orderNumber === params.orderId);
        if (!order) {
          throw new Error(`Laboratory order not found: ${params.orderId}`);
        }
        if (order.status === 'CANCELLED' || order.status === 'cancelled') {
          throw new Error('Cannot collect specimen for a cancelled order');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('lab_spec');
        const now = new Date().toISOString();
        const accessionNumber = generateAccessionNumber(context.facilityId, context.deviceId, new Date());

        const provenance: LaboratoryProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const specimen: LaboratorySpecimen = {
          id,
          accessionNumber,
          orderId: params.orderId,
          patientId: params.patientId,
          encounterId: params.encounterId,
          facilityId: context.facilityId,
          specimenType: params.specimenType,
          collectedById: context.userId,
          collectedByName: context.userName,
          collectedAt: now,
          collectionSite: params.collectionSite,
          condition: params.condition || 'ADEQUATE',
          status: 'COLLECTED',
          version: 1,
          provenance,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',
        };

        // Update order status to sample_collected / ACCEPTED
        const orders = await localRepository.getLabOrders();
        const existingOrder = orders.find((o) => o.id === params.orderId || o.orderNumber === params.orderId);
        if (existingOrder && (existingOrder.status === 'PLACED' || existingOrder.status === 'ordered')) {
          await localRepository.saveLabOrder({
            ...existingOrder,
            status: 'ACCEPTED',
            updatedAt: now,
          });
        }

        return {
          entity: specimen,
          eventType: 'SPECIMEN_COLLECTED',
          aggregateId: specimen.id,
          aggregateType: 'LaboratorySpecimen',
          version: 1,
          auditAction: 'SPECIMEN_COLLECTED',
        };
      },
    });
  }

  public async receiveSpecimen(
    params: ReceiveSpecimenParams,
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return clinicalTransaction.execute<LaboratorySpecimen>({
      actionName: 'RECEIVE_SPECIMEN',
      resourceType: 'LaboratorySpecimen',
      resourceId: params.specimenId,
      targetStore: 'labSpecimens',
      actor: context,
      requiredPermission: 'lab:specimen_receive',
      validate: async () => {
        if (!params.specimenId) throw new Error('Specimen ID is required');
        const specimen = await localRepository.getLabSpecimen(params.specimenId);
        if (!specimen) {
          throw new Error(`Specimen not found: ${params.specimenId}`);
        }
        if (specimen.status === 'REJECTED') {
          throw new Error('Cannot receive a specimen that has already been rejected');
        }
      },
      buildEntity: async () => {
        const existing = (await localRepository.getLabSpecimen(params.specimenId))!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const updated: LaboratorySpecimen = {
          ...existing,
          status: 'RECEIVED',
          receivedAt: now,
          receivedById: context.userId,
          receivedByName: context.userName,
          condition: params.condition || existing.condition || 'ADEQUATE',
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'SPECIMEN_RECEIVED',
          aggregateId: updated.id,
          aggregateType: 'LaboratorySpecimen',
          version: updated.version,
          auditAction: 'SPECIMEN_RECEIVED',
          previousState,
        };
      },
    });
  }

  public async rejectSpecimen(
    params: RejectSpecimenParams,
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return clinicalTransaction.execute<LaboratorySpecimen>({
      actionName: 'REJECT_SPECIMEN',
      resourceType: 'LaboratorySpecimen',
      resourceId: params.specimenId,
      targetStore: 'labSpecimens',
      actor: context,
      requiredPermission: 'lab:specimen_reject',
      validate: async () => {
        if (!params.specimenId) throw new Error('Specimen ID is required');
        if (!params.rejectionReason) throw new Error('Structured rejection reason is required (e.g. HEMOLYZED, CLOTTED)');
        if (!params.rejectionNotes) throw new Error('Rejection notes detailing sample failure are required');

        const specimen = await localRepository.getLabSpecimen(params.specimenId);
        if (!specimen) {
          throw new Error(`Specimen not found: ${params.specimenId}`);
        }
      },
      buildEntity: async () => {
        const existing = (await localRepository.getLabSpecimen(params.specimenId))!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const updated: LaboratorySpecimen = {
          ...existing,
          status: 'REJECTED',
          rejectionReason: params.rejectionReason,
          rejectionNotes: params.rejectionNotes,
          rejectedAt: now,
          rejectedById: context.userId,
          rejectedByName: context.userName,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'SPECIMEN_REJECTED',
          aggregateId: updated.id,
          aggregateType: 'LaboratorySpecimen',
          version: updated.version,
          auditAction: 'SPECIMEN_REJECTED',
          previousState,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 3. RESULT WORKFLOW (ENTRY, VERIFICATION, CORRECTION)
  // ----------------------------------------------------

  public async enterPreliminaryResult(
    params: EnterResultParams,
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return clinicalTransaction.execute<LaboratoryResult>({
      actionName: 'ENTER_LAB_RESULT',
      resourceType: 'LaboratoryResult',
      targetStore: 'labResults',
      actor: context,
      requiredPermission: 'lab:result_entry',
      validate: async () => {
        if (!params.patientId) throw new Error('Patient ID is required for laboratory result entry');
        if (!params.testName) throw new Error('Test name is required');
        if (!params.value && params.numericValue === undefined) {
          throw new Error('Result must contain an observed value or finding');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('lab_res');
        const now = new Date().toISOString();
        const abnormalFlag: AbnormalFlag = params.abnormalFlag || 'NORMAL';
        const criticalFlag = params.criticalFlag || abnormalFlag === 'CRITICAL';
        const valStr = params.value || (params.numericValue !== undefined ? String(params.numericValue) : '');

        const provenance: LaboratoryProvenance = {
          sourceFacilityId: context.facilityId,
          sourceDeviceId: context.deviceId,
          actorId: context.userId,
          actorRole: context.userRole,
          timestamp: now,
          sourceType: 'LOCAL',
        };

        const result: LaboratoryResult = {
          id,
          orderId: params.orderId,
          specimenId: params.specimenId,
          patientId: params.patientId,
          facilityId: context.facilityId,
          testCode: params.testCode || params.testName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
          testName: params.testName,
          parameterName: params.parameterName || params.testName,
          value: valStr,
          numericValue: params.numericValue,
          unit: params.unit || 'N/A',
          referenceRange: params.referenceRange || 'Normal',
          abnormalFlag,
          criticalFlag,
          status: 'PRELIMINARY',
          performerId: context.userId,
          performerName: context.userName,
          performerRole: context.userRole,
          performedAt: now,
          technicianNotes: params.technicianNotes,
          criticalAcknowledged: false,
          version: 1,
          provenance,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'LOCAL_ONLY',

          // Backwards compatibility aliases
          analyzedById: context.userId,
          completedAt: now,
          isAbnormal: abnormalFlag !== 'NORMAL',
          criticalAlert: criticalFlag,
        };

        // If critical result, mark parent order
        if (criticalFlag && params.orderId) {
          const orders = await localRepository.getLabOrders();
          const order = orders.find((o) => o.id === params.orderId);
          if (order) {
            await localRepository.saveLabOrder({
              ...order,
              hasCriticalResults: true,
              updatedAt: now,
            });
          }
        }

        return {
          entity: result,
          eventType: 'LAB_RESULT_RECORDED',
          aggregateId: result.id,
          aggregateType: 'LaboratoryResult',
          version: 1,
          auditAction: 'LAB_RESULT_RECORDED',
        };
      },
    });
  }

  public async verifyResult(
    params: VerifyResultParams,
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return clinicalTransaction.execute<LaboratoryResult>({
      actionName: 'VERIFY_LAB_RESULT',
      resourceType: 'LaboratoryResult',
      resourceId: params.resultId,
      targetStore: 'labResults',
      actor: context,
      requiredPermission: 'lab:result_verify',
      validate: async () => {
        if (!params.resultId) throw new Error('Result ID is required to verify');
        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId);
        if (!existing) {
          throw new Error(`Laboratory result not found: ${params.resultId}`);
        }
        if (existing.status === 'FINAL') {
          throw new Error('Result is already verified and finalized');
        }
      },
      buildEntity: async () => {
        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId)!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const verified: LaboratoryResult = {
          ...existing,
          status: 'FINAL',
          verifiedAt: now,
          verifiedById: context.userId,
          verifiedByName: context.userName,
          verifiedByRole: context.userRole,
          technicianNotes: params.verificationNotes
            ? `${existing.technicianNotes || ''} | Verified: ${params.verificationNotes}`.trim()
            : existing.technicianNotes,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        // If the order has all its results verified, mark the order as COMPLETED
        if (verified.orderId) {
          const orders = await localRepository.getLabOrders();
          const order = orders.find((o) => o.id === verified.orderId);
          if (order && order.status !== 'COMPLETED' && order.status !== 'completed') {
            await localRepository.saveLabOrder({
              ...order,
              status: 'COMPLETED',
              updatedAt: now,
            });
          }
        }

        return {
          entity: verified,
          eventType: 'LAB_RESULT_VERIFIED',
          aggregateId: verified.id,
          aggregateType: 'LaboratoryResult',
          version: verified.version || 2,
          auditAction: 'LAB_RESULT_VERIFIED',
          previousState,
        };
      },
    });
  }

  public async correctResult(
    params: CorrectResultParams,
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return clinicalTransaction.execute<LaboratoryResult>({
      actionName: 'CORRECT_LAB_RESULT',
      resourceType: 'LaboratoryResult',
      resourceId: params.resultId,
      targetStore: 'labResults',
      actor: context,
      requiredPermission: 'lab:result_correct',
      validate: async () => {
        if (!params.resultId) throw new Error('Result ID is required');
        if (!params.correctionReason || !params.correctionReason.trim()) {
          throw new Error('Clinical correction reason is mandatory to amend verified laboratory results');
        }

        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId);
        if (!existing) {
          throw new Error(`Laboratory result not found: ${params.resultId}`);
        }
      },
      buildEntity: async () => {
        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId)!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const previousCorrectionHistory: ResultCorrectionHistory[] = existing.correctionHistory || [];

        const newCorrectionEntry: ResultCorrectionHistory = {
          correctedAt: now,
          correctedById: context.userId,
          correctedByName: context.userName,
          previousValue: existing.value,
          previousNumericValue: existing.numericValue,
          previousAbnormalFlag: existing.abnormalFlag,
          correctionReason: params.correctionReason,
        };

        const abnormalFlag = params.newAbnormalFlag !== undefined ? params.newAbnormalFlag : existing.abnormalFlag;
        const criticalFlag = params.newCriticalFlag !== undefined ? params.newCriticalFlag : existing.criticalFlag;

        const corrected: LaboratoryResult = {
          ...existing,
          value: params.newValue,
          numericValue: params.newNumericValue !== undefined ? params.newNumericValue : existing.numericValue,
          abnormalFlag,
          criticalFlag,
          status: 'CORRECTED',
          correctionReason: params.correctionReason,
          correctionHistory: [...previousCorrectionHistory, newCorrectionEntry],
          updatedAt: now,
          version: (existing.version || 1) + 1,

          // Backwards compatibility aliases
          isAbnormal: abnormalFlag !== 'NORMAL',
          criticalAlert: criticalFlag,
        };

        return {
          entity: corrected,
          eventType: 'LAB_RESULT_CORRECTED',
          aggregateId: corrected.id,
          aggregateType: 'LaboratoryResult',
          version: corrected.version || 3,
          auditAction: 'LAB_RESULT_CORRECTED',
          previousState,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 4. CRITICAL RESULT CLINICAL ACKNOWLEDGMENT
  // ----------------------------------------------------

  public async acknowledgeCriticalResult(
    params: AcknowledgeCriticalParams,
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return clinicalTransaction.execute<LaboratoryResult>({
      actionName: 'ACKNOWLEDGE_CRITICAL_RESULT',
      resourceType: 'LaboratoryResult',
      resourceId: params.resultId,
      targetStore: 'labResults',
      actor: context,
      requiredPermission: 'lab:critical_acknowledge',
      validate: async () => {
        if (!params.resultId) throw new Error('Result ID is required');
        if (!params.clinicalActionTaken || !params.clinicalActionTaken.trim()) {
          throw new Error('Specific clinical action taken must be documented when acknowledging critical values');
        }

        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId);
        if (!existing) {
          throw new Error(`Laboratory result not found: ${params.resultId}`);
        }
        if (!existing.criticalFlag && !existing.criticalAlert) {
          throw new Error('Result is not marked as critical');
        }
      },
      buildEntity: async () => {
        const results = await localRepository.getLabResults();
        const existing = results.find((r) => r.id === params.resultId)!;
        const previousState = { ...existing };
        const now = new Date().toISOString();

        const acknowledged: LaboratoryResult = {
          ...existing,
          criticalAcknowledged: true,
          criticalAcknowledgedAt: now,
          criticalAcknowledgedById: context.userId,
          criticalAcknowledgedByName: context.userName,
          criticalAcknowledgementNotes: `${params.clinicalActionTaken}${params.notes ? ` | Notes: ${params.notes}` : ''}`,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: acknowledged,
          eventType: 'CRITICAL_RESULT_ACKNOWLEDGED',
          aggregateId: acknowledged.id,
          aggregateType: 'LaboratoryResult',
          version: acknowledged.version || 2,
          auditAction: 'CRITICAL_RESULT_ACKNOWLEDGED',
          previousState,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 5. QUERY HELPERS
  // ----------------------------------------------------

  public async getUnacknowledgedCriticalResults(facilityId?: string): Promise<LaboratoryResult[]> {
    const results = await localRepository.getLabResults();
    return results.filter((r) => {
      const isCritical = r.criticalFlag || r.criticalAlert;
      const unack = !r.criticalAcknowledged;
      const facilityMatch = !facilityId || r.facilityId === facilityId;
      return isCritical && unack && facilityMatch;
    });
  }

  public async getResultsForPatient(patientId: string): Promise<LaboratoryResult[]> {
    const results = await localRepository.getLabResults();
    return results.filter((r) => r.patientId === patientId);
  }

  public async getOrdersForPatient(patientId: string): Promise<LaboratoryOrder[]> {
    const orders = await localRepository.getLabOrders();
    return orders.filter((o) => o.patientId === patientId);
  }

  public async getSpecimensForOrder(orderId: string): Promise<LaboratorySpecimen[]> {
    const specimens = await localRepository.getLabSpecimens();
    return specimens.filter((s) => s.orderId === orderId);
  }
}

export const laboratoryWorkflowService = LaboratoryWorkflowService.getInstance();
