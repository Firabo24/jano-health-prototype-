/**
 * Jano Health - Medication Application Service (Clinical Core V6)
 * 
 * Orchestrates the complete clinical medication order and prescription lifecycle:
 * - Terminology concept lookup and dosage validation
 * - Clinical Safety Screening (Allergies, Interactions, Contraindications, Route, Duplicates)
 * - Warning acknowledgement & clinical justification enforcement
 * - AI Prescribing prohibition enforcement (Jano AI cannot create or issue prescriptions)
 * - Atomic execution via ClinicalTransactionManager (Domain Event, Audit Trail, Sync Queue)
 * - Legal clinical prescriber attestation and SHA-256 tamper-evident digital sealing
 * - Dispense record tracking and pharmacy lifecycle transition
 * - Bi-directional synchronization with legacy Medication projection for backwards compatibility
 */

import {
  MedicationOrder,
  Prescription,
  MedicationDefinition,
  MedicationRoute,
  MedicationOrderPriority,
  WarningAcknowledgement,
  DerivedMedicationHistoryItem,
  PrescriptionAmendmentRecord,
  DispenseRecord,
} from '../../domain/medicationTypes';
import { Medication, RoleType } from '../../domain/types';
import { canUserPerform, AuthorizationError } from '../../domain/permissions';
import {
  generateMedicationOrderId,
  generateMedicationOrderNumber,
  generatePrescriptionId,
  generatePrescriptionNumber,
} from '../../domain/medicationIdentifiers';
import {
  generateDispenseNumber,
} from '../../domain/pharmacyIdentifiers';
import {
  PharmacyReview,
  PharmacyVerificationChecklist,
} from '../../domain/pharmacyTypes';
import { inventoryService } from '../pharmacy/inventoryService';
import { generateUUIDv7 } from '../../domain/identifiers';
import { canonicalJson, sha256 } from '../../domain/eventIntegrity';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { StoreName, TransactionPrecondition } from '../storage/indexedDbEngine';
import { medicationTerminologyService } from './medicationTerminologyService';
import { medicationSafetyService, SafetyScreeningContext } from './medicationSafetyService';
import { localRepository } from '../storage/localRepository';
import { localDb } from '../storage/localDatabase';

export interface CreateMedicationOrderDTO {
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  medicationDefinitionId: string;
  route: MedicationRoute;
  dose: string;
  doseUnit: string;
  frequency: string;
  frequencyText?: string;
  durationValue: number;
  durationUnit?: 'days' | 'weeks' | 'months' | 'doses';
  quantity: number;
  quantityUnit?: string;
  indication: string;
  instructions?: string;
  priority?: MedicationOrderPriority;
  notes?: string;
  acknowledgedWarnings?: WarningAcknowledgement[];
}

export interface IssuePrescriptionDTO {
  medicationOrderId: string;
  validityDays?: number;
  refills?: number;
  instructions?: string;
  attestationStatement?: string;
}

export interface DispensePrescriptionDTO {
  prescriptionId: string;
  quantityDispensed: number;
  quantityUnit?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  inventoryItemId?: string;
  counselingNotes?: string;
  counselingProvided?: boolean;
  substitutionUsed?: boolean;
  substitutionReason?: string;
  isPartial?: boolean;
  notes?: string;
}

export interface AmendPrescriptionDTO {
  prescriptionId: string;
  amendmentReason: string;
  newInstructions?: string;
  newQuantity?: number;
  newRefills?: number;
}

export class MedicationService {
  private static instance: MedicationService;
  private activeReversals = new Map<string, Promise<DispenseRecord>>();

  private constructor() {}

  public static getInstance(): MedicationService {
    if (!MedicationService.instance) {
      MedicationService.instance = new MedicationService();
    }
    return MedicationService.instance;
  }

  /**
   * Enforces strict non-AI prescribing policy.
   * Jano AI or any automated agent is strictly forbidden from creating or issuing prescriptions.
   */
  private verifyHumanPrescriberGuard(actor: ClinicalActorContext): void {
    const isAiRole = (actor.userRole as string) === 'ai_assistant';
    const isAiUser = actor.userId.toLowerCase().includes('ai') || actor.userName.toLowerCase().includes('ai');
    if (isAiRole || isAiUser) {
      throw new AuthorizationError(
        'medication.prescribe',
        actor.userRole,
        'Jano AI is strictly prohibited from creating or issuing medication prescriptions. Prescriptions must be initiated by an authorized human clinician.'
      );
    }
  }

  /**
   * Helper to build safety screening context for a patient.
   */
  public async buildScreeningContext(patientId: string): Promise<SafetyScreeningContext> {
    if (!patientId) {
      throw new Error('Patient ID is required to build safety screening context');
    }
    const [patient, allergies, existingOrders, legacyMeds, diagnoses] = await Promise.all([
      localRepository.getPatient(patientId),
      localRepository.getAllergies(patientId),
      localRepository.getMedicationOrders(patientId),
      localRepository.getMedications(patientId),
      localRepository.getDiagnoses(patientId),
    ]);

    // Active medications from authoritative orders + legacy records
    const activeMedications: SafetyScreeningContext['activeMedications'] = [];

    existingOrders.forEach((o) => {
      if (o.status === 'ACTIVE') {
        activeMedications.push({
          id: o.id,
          genericName: o.genericName,
          brandName: o.brandName,
          medicationDefinitionId: o.medicationDefinitionId,
          status: o.status,
        });
      }
    });

    legacyMeds.forEach((m) => {
      if (m.dispensedStatus !== 'cancelled' && !activeMedications.some((a) => a.genericName.toLowerCase() === m.genericName.toLowerCase())) {
        activeMedications.push({
          id: m.id,
          genericName: m.genericName || m.name,
          brandName: m.name,
          status: m.dispensedStatus,
        });
      }
    });

    return {
      patient: patient || { id: patientId },
      allergies: allergies || [],
      activeMedications,
      activeDiagnoses: (diagnoses || []).map((d) => ({
        code: d.code,
        description: d.description,
        status: d.status,
      })),
    };
  }

  /**
   * Screens a prospective medication order against safety rules without committing state.
   */
  public async performSafetyScreen(
    dto: CreateMedicationOrderDTO,
    context?: SafetyScreeningContext
  ) {
    const definition = medicationTerminologyService.getConcept(dto.medicationDefinitionId);
    if (!definition) {
      throw new Error(`Medication definition concept not found: ${dto.medicationDefinitionId}`);
    }

    const screeningCtx = context || (await this.buildScreeningContext(dto.patientId));

    return medicationSafetyService.runFullSafetyScreen(
      {
        medicationDefinition: definition,
        route: dto.route,
        dose: dto.dose,
        doseUnit: dto.doseUnit,
        frequency: dto.frequency,
        durationValue: dto.durationValue,
        quantity: dto.quantity,
        indication: dto.indication,
      },
      screeningCtx
    );
  }

  /**
   * Creates a new authoritative MedicationOrder.
   * Runs safety check, validates clinician warnings, and commits atomically.
   */
  public async createMedicationOrder(
    dto: CreateMedicationOrderDTO,
    actor: ClinicalActorContext,
    customScreeningContext?: SafetyScreeningContext
  ): Promise<MedicationOrder> {
    // 1. Prescriber Guards
    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'medication.prescribe');
    if (!authorized) {
      throw new AuthorizationError('medication.prescribe', actor.userRole, 'create medication order');
    }

    // 2. Fetch definition
    const definition = medicationTerminologyService.getConcept(dto.medicationDefinitionId);
    if (!definition) {
      throw new Error(`Invalid medication definition: ${dto.medicationDefinitionId}`);
    }

    // 3. Clinical Safety Screen
    const screeningCtx = customScreeningContext || (await this.buildScreeningContext(dto.patientId));
    const safetyResult = medicationSafetyService.runFullSafetyScreen(
      {
        medicationDefinition: definition,
        route: dto.route,
        dose: dto.dose,
        doseUnit: dto.doseUnit,
        frequency: dto.frequency,
        durationValue: dto.durationValue,
        quantity: dto.quantity,
        indication: dto.indication,
      },
      screeningCtx
    );

    // Strict safety invariant: blocked if contraindicated unless licensed clinician provides explicit clinical override justification
    if (safetyResult.overallState === 'CONTRAINDICATED') {
      const hasOverride = (dto.acknowledgedWarnings || []).some(
        (w) =>
          (w.checkType === 'ALLERGY' || w.checkType === 'CONTRAINDICATION') &&
          w.response === 'ACKNOWLEDGE_AND_CONTINUE' &&
          w.justification &&
          w.justification.trim().length >= 10
      );
      if (!hasOverride) {
        const blockedReasons = safetyResult.checks
          .filter((c) => c.status === 'CONTRAINDICATED')
          .map((c) => c.message)
          .join('; ');
        throw new Error(`Medication Order Blocked - Absolute Contraindication: ${blockedReasons}`);
      }
    }

    // Warning / High Risk justification enforcement
    if (safetyResult.requiresAcknowledgement) {
      const hasValidAck =
        dto.acknowledgedWarnings &&
        dto.acknowledgedWarnings.length > 0 &&
        dto.acknowledgedWarnings.every((a) => a.justification && a.justification.trim().length >= 5);

      if (!hasValidAck) {
        throw new Error(
          'Medication order requires clinician acknowledgement and written clinical justification for flagged safety warnings before submission.'
        );
      }
    }

    const facilityId = dto.facilityId || actor.facilityId;
    const now = new Date().toISOString();
    const orderId = generateMedicationOrderId();
    const orderNumber = generateMedicationOrderNumber(facilityId, actor.deviceId);

    const medicationOrder: MedicationOrder = {
      id: orderId,
      orderNumber,
      patientId: dto.patientId,
      encounterId: dto.encounterId,
      facilityId,
      orderedById: actor.userId,
      orderedByName: actor.userName,
      orderedByRole: actor.userRole,
      orderedAt: now,
      medicationDefinitionId: definition.id,
      medicationCode: definition.code,
      genericName: definition.genericName,
      brandName: definition.brandName,
      formulation: definition.dosageForm,
      strength: definition.strength,
      strengthUnit: definition.strengthUnit,
      route: dto.route,
      dose: dto.dose,
      doseUnit: dto.doseUnit,
      frequency: dto.frequency,
      frequencyText: dto.frequencyText || dto.frequency,
      durationValue: dto.durationValue,
      durationUnit: dto.durationUnit || 'days',
      quantity: dto.quantity,
      quantityUnit: dto.quantityUnit || definition.strengthUnit || 'units',
      indication: dto.indication,
      instructions: dto.instructions || `${dto.dose} ${dto.doseUnit} ${dto.route} ${dto.frequency}`,
      priority: dto.priority || 'routine',
      notes: dto.notes,
      safetyReviewState: safetyResult.overallState,
      safetyChecks: safetyResult.checks,
      acknowledgedWarnings: dto.acknowledgedWarnings || [],
      status: 'ACTIVE',
      version: 1,
      source: 'LOCAL_PRESCRIPTION',
      provenance: 'Jano Health Clinical Core V6 - Authoritative Prescribing',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'PENDING_SYNC',
    };

    // 4. Atomic Execution via ClinicalTransactionManager
    const committedOrder = await clinicalTransaction.execute({
      actionName: 'CREATE_MEDICATION_ORDER',
      resourceType: 'MedicationOrder',
      resourceId: orderId,
      targetStore: 'medicationOrders',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: medicationOrder,
        eventType: 'MedicationOrderCreated',
        aggregateId: dto.patientId,
        aggregateType: 'Patient',
        version: 1,
        auditAction: 'MEDICATION_ORDER_CREATED',
      }),
    });

    // 5. Backwards Compatibility: Sync legacy Medication view projection
    const legacyMed: Medication = {
      id: orderId,
      patientId: dto.patientId,
      encounterId: dto.encounterId,
      name: definition.brandName || definition.genericName,
      genericName: definition.genericName,
      dosage: `${dto.dose} ${dto.doseUnit}`,
      route: (['oral', 'intravenous', 'intramuscular', 'subcutaneous', 'topical', 'inhalation'].includes(dto.route)
        ? dto.route
        : 'oral') as any,
      frequency: dto.frequency,
      durationDays: dto.durationValue,
      startDate: now.split('T')[0],
      prescribedById: actor.userId,
      dispensedStatus: 'pending',
      instructions: dto.instructions || `${dto.dose} ${dto.doseUnit} ${dto.route} ${dto.frequency}`,
    };
    await localRepository.saveMedication(legacyMed).catch(() => {});
    await localDb.saveMedication(legacyMed);

    return committedOrder;
  }

  /**
   * Issues an official legal Prescription for an active MedicationOrder.
   * Creates a tamper-evident SHA-256 digital signature seal.
   */
  public async issuePrescription(
    dto: IssuePrescriptionDTO,
    actor: ClinicalActorContext
  ): Promise<Prescription> {
    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'prescription.issue');
    if (!authorized) {
      throw new AuthorizationError('prescription.issue', actor.userRole, 'issue prescription');
    }

    const order = await localRepository.getMedicationOrder(dto.medicationOrderId);
    if (!order) {
      throw new Error(`Medication order not found: ${dto.medicationOrderId}`);
    }

    if (order.status !== 'ACTIVE') {
      throw new Error(`Cannot issue prescription for order in status: ${order.status}`);
    }

    if (order.safetyReviewState === 'CONTRAINDICATED') {
      const hasOverride = (order.acknowledgedWarnings || []).some(
        (w) =>
          (w.checkType === 'ALLERGY' || w.checkType === 'CONTRAINDICATION') &&
          w.response === 'ACKNOWLEDGE_AND_CONTINUE' &&
          w.justification &&
          w.justification.trim().length >= 10
      );
      if (!hasOverride) {
        throw new Error('Cannot issue prescription for an order marked CONTRAINDICATED.');
      }
    }

    const facilityId = order.facilityId || actor.facilityId;
    const now = new Date().toISOString();
    const prescriptionId = generatePrescriptionId();
    const prescriptionNumber = generatePrescriptionNumber(facilityId, actor.deviceId);

    const validityStart = now;
    const validityEndDate = new Date();
    validityEndDate.setDate(validityEndDate.getDate() + (dto.validityDays || 30));
    const validityEnd = validityEndDate.toISOString();

    const attestationStatement =
      dto.attestationStatement ||
      'I certify that I have conducted a clinical evaluation of the patient, performed medication safety review, and authorize dispensing of this therapeutic regimen.';

    // Generate Tamper-Evident SHA-256 Signature Seal
    const signaturePayload = {
      prescriptionId,
      prescriptionNumber,
      medicationOrderId: order.id,
      patientId: order.patientId,
      prescriberId: actor.userId,
      genericName: order.genericName,
      strength: `${order.strength} ${order.strengthUnit}`,
      dose: `${order.dose} ${order.doseUnit}`,
      route: order.route,
      frequency: order.frequency,
      quantity: order.quantity,
      issuedAt: now,
      attestation: attestationStatement,
    };
    const signatureHash = sha256(canonicalJson(signaturePayload));

    const prescription: Prescription = {
      id: prescriptionId,
      prescriptionNumber,
      medicationOrderId: order.id,
      patientId: order.patientId,
      encounterId: order.encounterId,
      facilityId,
      prescriberId: actor.userId,
      prescriberName: actor.userName,
      prescriberRole: actor.userRole,
      issuedAt: now,
      medicationDefinitionId: order.medicationDefinitionId,
      genericName: order.genericName,
      brandName: order.brandName,
      formulation: order.formulation,
      strength: order.strength,
      strengthUnit: order.strengthUnit,
      dose: order.dose,
      doseUnit: order.doseUnit,
      route: order.route,
      frequency: order.frequency,
      durationValue: order.durationValue,
      durationUnit: order.durationUnit,
      validityStart,
      validityEnd,
      quantity: order.quantity,
      quantityUnit: order.quantityUnit,
      refills: dto.refills ?? 0,
      instructions: dto.instructions || order.instructions,
      safetyReviewState: order.safetyReviewState,
      acknowledgedWarnings: order.acknowledgedWarnings,
      prescriberAttestation: {
        attestedAt: now,
        attestedById: actor.userId,
        attestedByName: actor.userName,
        statement: attestationStatement,
      },
      signatureHash,
      status: 'ISSUED',
      version: 1,
      source: 'LOCAL_PRESCRIPTION',
      provenance: 'Jano Health Clinical Core V6 - Authoritative Prescription Seal',
      syncStatus: 'PENDING_SYNC',
    };

    return clinicalTransaction.execute({
      actionName: 'ISSUE_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: prescriptionId,
      targetStore: 'prescriptions',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: prescription,
        eventType: 'PRESCRIPTION_ISSUED',
        aggregateId: prescriptionId,
        aggregateType: 'Prescription',
        version: 1,
        auditAction: 'PRESCRIPTION_ISSUED',
      }),
    });
  }

  /**
   * Combined Clinical Action: Places medication order and issues prescription in a single clinical encounter step.
   */
  public async createOrderAndIssuePrescription(
    dto: CreateMedicationOrderDTO,
    actor: ClinicalActorContext,
    prescriptionOptions?: { validityDays?: number; refills?: number; instructions?: string; attestationStatement?: string }
  ): Promise<{ order: MedicationOrder; prescription: Prescription }> {
    const order = await this.createMedicationOrder(dto, actor);
    const prescription = await this.issuePrescription(
      {
        medicationOrderId: order.id,
        validityDays: prescriptionOptions?.validityDays,
        refills: prescriptionOptions?.refills,
        instructions: prescriptionOptions?.instructions || order.instructions,
        attestationStatement: prescriptionOptions?.attestationStatement,
      },
      actor
    );

    return { order, prescription };
  }

  /**
   * Discontinues an active medication order with clinical attribution.
   */
  public async discontinueMedicationOrder(
    orderId: string,
    reason: string,
    actor: ClinicalActorContext
  ): Promise<MedicationOrder> {
    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'medication.discontinue');
    if (!authorized) {
      throw new AuthorizationError('medication.discontinue', actor.userRole, 'discontinue medication order');
    }

    const existing = await localRepository.getMedicationOrder(orderId);
    if (!existing) {
      throw new Error(`Medication order not found: ${orderId}`);
    }

    const now = new Date().toISOString();
    const updated: MedicationOrder = {
      ...existing,
      status: 'DISCONTINUED',
      discontinuedAt: now,
      discontinuedReason: reason,
      discontinuedById: actor.userId,
      discontinuedByName: actor.userName,
      version: existing.version + 1,
      updatedAt: now,
    };

    const committed = await clinicalTransaction.execute({
      actionName: 'DISCONTINUE_MEDICATION_ORDER',
      resourceType: 'MedicationOrder',
      resourceId: orderId,
      targetStore: 'medicationOrders',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'MEDICATION_ORDER_DISCONTINUED',
        aggregateId: orderId,
        aggregateType: 'MedicationOrder',
        version: updated.version,
        auditAction: 'MEDICATION_ORDER_DISCONTINUED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });

    // Also cancel any open prescriptions linked to this order
    const openPrescriptions = (await localRepository.getPrescriptions(existing.patientId)).filter(
      (p) => p.medicationOrderId === orderId && (p.status === 'ISSUED' || p.status === 'ON_HOLD')
    );
    for (const rx of openPrescriptions) {
      await this.cancelPrescription(rx.id, `Medication order discontinued: ${reason}`, actor).catch(() => {});
    }

    return committed;
  }

  /**
   * Places an active medication order on temporary hold.
   */
  public async holdMedicationOrder(
    orderId: string,
    reason: string,
    actor: ClinicalActorContext
  ): Promise<MedicationOrder> {
    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'medication.prescribe');
    if (!authorized) {
      throw new AuthorizationError('medication.prescribe', actor.userRole, 'hold medication order');
    }

    const existing = await localRepository.getMedicationOrder(orderId);
    if (!existing) throw new Error(`Medication order not found: ${orderId}`);

    const now = new Date().toISOString();
    const updated: MedicationOrder = {
      ...existing,
      status: 'HELD',
      heldAt: now,
      heldReason: reason,
      heldById: actor.userId,
      version: existing.version + 1,
      updatedAt: now,
    };

    return clinicalTransaction.execute({
      actionName: 'HOLD_MEDICATION_ORDER',
      resourceType: 'MedicationOrder',
      resourceId: orderId,
      targetStore: 'medicationOrders',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'MEDICATION_ORDER_HELD',
        aggregateId: orderId,
        aggregateType: 'MedicationOrder',
        version: updated.version,
        auditAction: 'MEDICATION_ORDER_HELD',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });
  }

  /**
   * Cancels a prescription with clinical justification.
   */
  public async cancelPrescription(
    prescriptionId: string,
    reason: string,
    actor: ClinicalActorContext
  ): Promise<Prescription> {
    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'prescription.cancel');
    if (!authorized) {
      throw new AuthorizationError('prescription.cancel', actor.userRole, 'cancel prescription');
    }

    const existing = await localRepository.getPrescription(prescriptionId);
    if (!existing) throw new Error(`Prescription not found: ${prescriptionId}`);

    const now = new Date().toISOString();
    const updated: Prescription = {
      ...existing,
      status: 'CANCELLED',
      cancelledAt: now,
      cancellationReason: reason,
      cancelledById: actor.userId,
      version: existing.version + 1,
    };

    return clinicalTransaction.execute({
      actionName: 'CANCEL_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: prescriptionId,
      targetStore: 'prescriptions',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'PRESCRIPTION_CANCELLED',
        aggregateId: prescriptionId,
        aggregateType: 'Prescription',
        version: updated.version,
        auditAction: 'PRESCRIPTION_CANCELLED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });
  }

  /**
   * Amends an issued prescription while preserving tamper-evident version audit history.
   */
  public async amendPrescription(
    dtoOrId: AmendPrescriptionDTO | string,
    actorOrUpdates: ClinicalActorContext | Partial<{ instructions: string; quantity: number; refills: number; durationValue: number }>,
    reasonArg?: string,
    actorArg?: ClinicalActorContext
  ): Promise<Prescription> {
    let dto: AmendPrescriptionDTO;
    let actor: ClinicalActorContext;

    if (typeof dtoOrId === 'string') {
      const updates = actorOrUpdates as Partial<{ instructions: string; quantity: number; refills: number; durationValue: number }>;
      dto = {
        prescriptionId: dtoOrId,
        amendmentReason: reasonArg || 'Prescription amended by clinician',
        newInstructions: updates?.instructions,
        newQuantity: updates?.quantity,
        newRefills: updates?.refills,
      };
      actor = actorArg!;
    } else {
      dto = dtoOrId;
      actor = actorOrUpdates as ClinicalActorContext;
    }

    this.verifyHumanPrescriberGuard(actor);

    const authorized = canUserPerform({ role: actor.userRole }, 'prescription.amend');
    if (!authorized) {
      throw new AuthorizationError('prescription.amend', actor.userRole, 'amend prescription');
    }

    const existing = await localRepository.getPrescription(dto.prescriptionId);
    if (!existing) throw new Error(`Prescription not found: ${dto.prescriptionId}`);

    if (existing.status !== 'ISSUED' && existing.status !== 'ON_HOLD') {
      throw new Error(`Cannot amend prescription in status: ${existing.status}`);
    }

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const amendmentRecord: PrescriptionAmendmentRecord = {
      version: existing.version,
      amendedAt: now,
      amendedById: actor.userId,
      amendedByName: actor.userName,
      amendmentReason: dto.amendmentReason,
      previousSignatureHash: existing.signatureHash,
      snapshot: { ...existing },
    };

    const newSignaturePayload = {
      prescriptionId: existing.id,
      prescriptionNumber: existing.prescriptionNumber,
      version: newVersion,
      quantity: dto.newQuantity ?? existing.quantity,
      refills: dto.newRefills ?? existing.refills,
      instructions: dto.newInstructions ?? existing.instructions,
      amendedAt: now,
      amendedBy: actor.userId,
      reason: dto.amendmentReason,
    };
    const newSignatureHash = sha256(canonicalJson(newSignaturePayload));

    const updated: Prescription = {
      ...existing,
      quantity: dto.newQuantity ?? existing.quantity,
      refills: dto.newRefills ?? existing.refills,
      instructions: dto.newInstructions ?? existing.instructions,
      version: newVersion,
      amendedAt: now,
      amendedById: actor.userId,
      amendmentReason: dto.amendmentReason,
      signatureHash: newSignatureHash,
      amendmentHistory: [...(existing.amendmentHistory || []), amendmentRecord],
    };

    return clinicalTransaction.execute({
      actionName: 'AMEND_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: existing.id,
      targetStore: 'prescriptions',
      actor,
      requiredPermission: 'clinical:prescribe',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'PRESCRIPTION_AMENDED',
        aggregateId: existing.id,
        aggregateType: 'Prescription',
        version: newVersion,
        auditAction: 'PRESCRIPTION_AMENDED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });
  }

  /**
   * Pharmacy Review Handoff: Reviews and validates an issued prescription prior to dispensing.
   * Conceptually enforces the clinical handoff pipeline: Prescription -> Pharmacy Review -> DispenseRecord.
   */
  public async reviewPrescription(
    prescriptionId: string,
    decision: 'APPROVED' | 'REJECTED' | 'CLARIFICATION_NEEDED',
    reviewNotes: string,
    actor: ClinicalActorContext,
    verificationChecklist?: Partial<PharmacyVerificationChecklist>
  ): Promise<Prescription> {
    const authorized = canUserPerform({ role: actor.userRole }, 'pharmacy.review');
    if (!authorized) {
      throw new AuthorizationError('pharmacy.review', actor.userRole, 'review prescription');
    }

    const prescription = await localRepository.getPrescription(prescriptionId);
    if (!prescription) {
      throw new Error(`Prescription not found: ${prescriptionId}`);
    }

    if (prescription.status !== 'ISSUED' && prescription.status !== 'ON_HOLD') {
      throw new Error(`Cannot review prescription in status: ${prescription.status}`);
    }

    const now = new Date().toISOString();
    const reviewId = `rx_rev_${generateUUIDv7()}`;

    // Formal clinical pharmacy review document
    const fullChecklist: PharmacyVerificationChecklist = {
      patientVerified: verificationChecklist?.patientVerified ?? true,
      prescriptionValid: verificationChecklist?.prescriptionValid ?? true,
      prescriberVerified: verificationChecklist?.prescriberVerified ?? true,
      medicationMatch: verificationChecklist?.medicationMatch ?? true,
      doseRouteFrequencyVerified: verificationChecklist?.doseRouteFrequencyVerified ?? true,
      safetyWarningsChecked: verificationChecklist?.safetyWarningsChecked ?? true,
      inventoryAvailable: verificationChecklist?.inventoryAvailable ?? true,
    };

    const reviewDoc: PharmacyReview = {
      id: reviewId,
      prescriptionId: prescription.id,
      medicationOrderId: prescription.medicationOrderId,
      patientId: prescription.patientId,
      facilityId: prescription.facilityId,
      pharmacistId: actor.userId,
      pharmacistName: actor.userName,
      pharmacistRole: actor.userRole,
      reviewedAt: now,
      decision,
      verificationChecklist: fullChecklist,
      notes: reviewNotes,
      version: 1,
      createdAt: now,
    };

    if (localRepository.savePharmacyReview) {
      await localRepository.savePharmacyReview(reviewDoc);
    }

    const updated: Prescription = {
      ...prescription,
      pharmacyReviewStatus: decision,
      pharmacyReviewedAt: now,
      pharmacyReviewedById: actor.userId,
      pharmacyReviewedByName: actor.userName,
      pharmacyReviewNotes: reviewNotes,
      version: prescription.version + 1,
    };

    return clinicalTransaction.execute({
      actionName: 'PHARMACY_REVIEW_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: prescription.id,
      targetStore: 'prescriptions',
      actor,
      requiredPermission: 'pharmacy:review',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'PHARMACY_PRESCRIPTION_REVIEWED',
        aggregateId: prescription.id,
        aggregateType: 'Prescription',
        version: updated.version,
        auditAction: 'PHARMACY_PRESCRIPTION_REVIEWED',
        previousState: prescription as unknown as Record<string, unknown>,
      }),
    });
  }

  /**
   * Records dispensing of a prescription by pharmacy personnel.
   * Atomically integrates with the Inventory Ledger, deduces batch stock, and creates an authoritative DispenseRecord.
   */
  public async dispensePrescription(
    dto: DispensePrescriptionDTO,
    actor: ClinicalActorContext
  ): Promise<Prescription> {
    const isAiRole = (actor.userRole as string) === 'ai_assistant';
    const isAiUser = actor.userId.toLowerCase().includes('ai') || actor.userName.toLowerCase().includes('ai');
    if (isAiRole || isAiUser) {
      throw new AuthorizationError(
        'pharmacy.dispense',
        actor.userRole,
        'Jano AI is strictly prohibited from dispensing medications. Physical dispensing must be executed by a human pharmacist.'
      );
    }

    const authorized = canUserPerform({ role: actor.userRole }, 'pharmacy.dispense');
    if (!authorized) {
      throw new AuthorizationError('pharmacy.dispense', actor.userRole, 'dispense prescription');
    }

    const prescription = await localRepository.getPrescription(dto.prescriptionId);
    if (!prescription) {
      throw new Error(`Prescription not found: ${dto.prescriptionId}`);
    }

    if (prescription.status !== 'ISSUED' && prescription.status !== 'PARTIALLY_DISPENSED') {
      throw new Error(`Cannot dispense prescription in status: ${prescription.status}`);
    }

    if (prescription.pharmacyReviewStatus === 'REJECTED') {
      throw new Error(
        `Safety Invariant: Prescription ${prescription.prescriptionNumber} was REJECTED during pharmacy review and cannot be dispensed.`
      );
    }

    const now = new Date().toISOString();
    const dispenseRecordId = `disp_${generateUUIDv7()}`;
    const dispenseNumber = generateDispenseNumber(prescription.facilityId, actor.deviceId);

    // 1. Inventory Batch & Ledger Integration
    let selectedBatchId = dto.batchId;
    let selectedBatchNumber = dto.batchNumber || 'BATCH-STD-001';
    let selectedExpiry = dto.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let matchedInventoryItemId = dto.inventoryItemId || `inv_item_${prescription.medicationDefinitionId}`;

    // Resolve inventory item and batch if available
    const invItems = await inventoryService.getInventoryItems(prescription.facilityId);
    const matchedItem = invItems.find(
      (i) =>
        i.medicationDefinitionId === prescription.medicationDefinitionId ||
        i.medicationCode === prescription.medicationCode
    );

    if (matchedItem) {
      matchedInventoryItemId = matchedItem.id;
      if (!selectedBatchId) {
        // Use FEFO to find first available batch
        const fefoBatches = await inventoryService.getAvailableBatchesFEFO(matchedItem.id, prescription.facilityId);
        if (fefoBatches.length > 0) {
          selectedBatchId = fefoBatches[0].id;
          selectedBatchNumber = fefoBatches[0].batchNumber;
          selectedExpiry = fefoBatches[0].expiryDate;
        }
      } else {
        const specificBatch = await inventoryService.getBatch(selectedBatchId);
        if (specificBatch) {
          selectedBatchNumber = specificBatch.batchNumber;
          selectedExpiry = specificBatch.expiryDate;
        }
      }

      // Deduct from physical inventory ledger if batch was matched
      if (selectedBatchId) {
        await inventoryService.deductStockForDispense(
          {
            facilityId: prescription.facilityId,
            inventoryItemId: matchedItem.id,
            batchId: selectedBatchId,
            quantity: dto.quantityDispensed,
            dispenseNumber,
            dispenseRecordId,
          },
          actor
        );
      }
    }

    // 2. Compute Dispense Quantities & Remaining Balance
    const priorDispensed = prescription.dispensedQuantity || 0;
    const totalDispensedSoFar = priorDispensed + dto.quantityDispensed;
    const quantityRemaining = Math.max(0, prescription.quantity - totalDispensedSoFar);
    const isFullyDispensed = quantityRemaining === 0;

    // 3. Authoritative DispenseRecord Aggregate (Clinical Core V7)
    const dispenseRecord: DispenseRecord = {
      id: dispenseRecordId,
      dispenseNumber,
      prescriptionId: prescription.id,
      medicationOrderId: prescription.medicationOrderId,
      patientId: prescription.patientId,
      encounterId: prescription.encounterId,
      facilityId: prescription.facilityId,

      dispensingPharmacistId: actor.userId,
      dispensingPharmacistRole: actor.userRole,
      dispensingPharmacistName: actor.userName,
      dispensedAt: now,

      medicationDefinitionId: prescription.medicationDefinitionId,
      medicationCode: prescription.medicationCode || prescription.medicationDefinitionId,
      genericName: prescription.genericName,
      formulation: prescription.formulation,
      strength: prescription.strength,
      route: prescription.route,

      quantityPrescribed: prescription.quantity,
      quantityDispensed: dto.quantityDispensed,
      quantityRemaining,
      quantityUnit: prescription.quantityUnit,

      inventoryItemId: matchedInventoryItemId,
      batchId: selectedBatchId || 'batch_untracked',
      batchNumber: selectedBatchNumber,
      expiryDate: selectedExpiry,

      counselingNotes: dto.counselingNotes,
      counselingProvided: dto.counselingProvided ?? true,
      substitutionUsed: dto.substitutionUsed ?? false,
      substitutionReason: dto.substitutionReason,
      partialDispense: dto.isPartial ?? !isFullyDispensed,
      notes: dto.notes,

      status: 'DISPENSED',
      version: 1,

      dispensedById: actor.userId, // Backwards compatibility alias
      source: 'JANO_CLINICAL_CORE_V7',
      deviceId: actor.deviceId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'offline_retained',
    };

    if (localRepository.saveDispenseRecord) {
      await localRepository.saveDispenseRecord(dispenseRecord);
    }

    // 4. Updated Prescription projection
    const updatedPrescriptionStatus = isFullyDispensed ? 'DISPENSED' : 'PARTIALLY_DISPENSED';
    const updated: Prescription = {
      ...prescription,
      status: updatedPrescriptionStatus,
      version: prescription.version + 1,
      dispenseRecordId,
      batchNumber: selectedBatchNumber,
      dispensedQuantity: totalDispensedSoFar,
      dispensedAt: now,
      dispensedById: actor.userId,
      dispensedByName: actor.userName,
      dispenseNotes: dto.notes,
    };

    const committed = await clinicalTransaction.execute({
      actionName: 'DISPENSE_PRESCRIPTION',
      resourceType: 'Prescription',
      resourceId: prescription.id,
      targetStore: 'prescriptions',
      actor,
      requiredPermission: 'pharmacy:dispense',
      validate: () => {},
      buildEntity: async () => ({
        entity: updated,
        eventType: 'DISPENSE_RECORD_CREATED',
        aggregateId: dispenseRecordId,
        aggregateType: 'DispenseRecord',
        version: 1,
        auditAction: 'PRESCRIPTION_DISPENSED',
        previousState: prescription as unknown as Record<string, unknown>,
      }),
    });

    // Update legacy Medication record if present
    const legacyMeds = await localRepository.getMedications(prescription.patientId);
    const matchedLegacy = legacyMeds.find((m) => m.id === prescription.medicationOrderId);
    if (matchedLegacy) {
      matchedLegacy.dispensedStatus = isFullyDispensed ? 'dispensed' : 'pending';
      await localRepository.saveMedication(matchedLegacy).catch(() => {});
      await localDb.saveMedication(matchedLegacy);
    }

    return committed;
  }

  /**
   * Reverses a previous dispense operation, restoring inventory stock and updating the dispense record.
   * Commits all affected entities (dispense record, inventory batch, inventory transaction,
   * prescription, domain event, audit log, and sync queue) atomically in a single IndexedDB transaction.
   */
  /**
   * Reverses a previous dispense operation, restoring inventory stock and updating the dispense record.
   * Commits all affected entities (dispense record, inventory batch, inventory transaction,
   * prescription, domain event, audit log, and sync queue) atomically in a single IndexedDB transaction.
   *
   * Enforces intra-process serialization and authoritative atomic in-transaction commit guards
   * to guarantee zero duplicate restorations under concurrent invocation (CONC-PHARM-01).
   */
  public async reverseDispense(
    dispenseRecordId: string,
    reason: string,
    actor: ClinicalActorContext
  ): Promise<DispenseRecord> {
    const existing = this.activeReversals.get(dispenseRecordId);
    if (existing) {
      await existing.catch(() => {});
    }

    const task = this.executeReverseDispense(dispenseRecordId, reason, actor);
    this.activeReversals.set(dispenseRecordId, task);
    try {
      return await task;
    } finally {
      if (this.activeReversals.get(dispenseRecordId) === task) {
        this.activeReversals.delete(dispenseRecordId);
      }
    }
  }

  private async executeReverseDispense(
    dispenseRecordId: string,
    reason: string,
    actor: ClinicalActorContext
  ): Promise<DispenseRecord> {
    const authorized = canUserPerform({ role: actor.userRole }, 'pharmacy.dispense');
    if (!authorized) {
      throw new AuthorizationError('pharmacy.dispense', actor.userRole, 'reverse dispense');
    }

    const dispenseRecord = await localRepository.getDispenseRecord
      ? await localRepository.getDispenseRecord(dispenseRecordId)
      : undefined;

    if (!dispenseRecord) {
      throw new Error(`DispenseRecord not found: ${dispenseRecordId}`);
    }

    if (dispenseRecord.status === 'REVERSED') {
      throw new Error(`DispenseRecord ${dispenseRecordId} has already been reversed.`);
    }

    const now = new Date().toISOString();

    // 1. Prepare inventory reversal if batch was tracked
    let updatedBatch: any = undefined;
    let reversalTxn: any = undefined;
    let initialBatchVersion: number | undefined;

    if (dispenseRecord.batchId && dispenseRecord.batchId !== 'batch_untracked') {
      const batch = await inventoryService.getBatch(dispenseRecord.batchId);
      if (!batch) {
        throw new Error(`Batch not found: ${dispenseRecord.batchId}`);
      }
      initialBatchVersion = batch.version;
      const stockPrepared = await inventoryService.prepareReverseDispenseStock(
        {
          facilityId: dispenseRecord.facilityId,
          inventoryItemId: dispenseRecord.inventoryItemId,
          batchId: dispenseRecord.batchId,
          quantity: dispenseRecord.quantityDispensed,
          dispenseNumber: dispenseRecord.dispenseNumber,
          reason,
        },
        actor
      );
      updatedBatch = stockPrepared.updatedBatch;
      reversalTxn = stockPrepared.txn;
    }

    // 2. Prepare reversed DispenseRecord
    const reversedRecord: DispenseRecord = {
      ...dispenseRecord,
      status: 'REVERSED',
      reversalReason: reason,
      reversedAt: now,
      reversedById: actor.userId,
      reversedByName: actor.userName,
      version: dispenseRecord.version + 1,
      updatedAt: now,
    };

    // 3. Prepare reverted Prescription status
    let revertedPrescription: Prescription | undefined;
    const prescription = await localRepository.getPrescription(dispenseRecord.prescriptionId);
    if (prescription) {
      const remainingDispensed = Math.max(0, (prescription.dispensedQuantity || 0) - dispenseRecord.quantityDispensed);
      revertedPrescription = {
        ...prescription,
        status: remainingDispensed > 0 ? 'PARTIALLY_DISPENSED' : 'ISSUED',
        dispensedQuantity: remainingDispensed,
        version: prescription.version + 1,
      };
    }

    // 4. Atomic Multi-Store Clinical Transaction with Commit Precondition Guards
    const additionalStores: StoreName[] = ['inventoryBatches', 'inventoryTransactions', 'prescriptions'];
    const additionalEntities: Array<{ store: StoreName; entity: any }> = [];

    if (updatedBatch) {
      additionalEntities.push({ store: 'inventoryBatches', entity: updatedBatch });
    }
    if (reversalTxn) {
      additionalEntities.push({ store: 'inventoryTransactions', entity: reversalTxn });
    }
    if (revertedPrescription) {
      additionalEntities.push({ store: 'prescriptions', entity: revertedPrescription });
    }

    const preconditions: TransactionPrecondition[] = [
      {
        store: 'dispenseRecords',
        key: dispenseRecord.id,
        expectedVersion: dispenseRecord.version,
        predicate: (live) => live && live.status !== 'REVERSED' && live.version === dispenseRecord.version,
        errorMessage: `DispenseRecord ${dispenseRecord.id} has already been reversed.`,
      },
    ];

    if (dispenseRecord.batchId && dispenseRecord.batchId !== 'batch_untracked' && initialBatchVersion !== undefined) {
      preconditions.push({
        store: 'inventoryBatches',
        key: dispenseRecord.batchId,
        expectedVersion: initialBatchVersion,
        predicate: (live) => live && live.version === initialBatchVersion,
        errorMessage: `Concurrency conflict on inventory batch ${dispenseRecord.batchId}: batch was concurrently modified.`,
      });
    }

    if (prescription) {
      preconditions.push({
        store: 'prescriptions',
        key: prescription.id,
        expectedVersion: prescription.version,
        predicate: (live) => live && live.version === prescription.version,
        errorMessage: `Concurrency conflict on prescription ${prescription.id}: prescription was concurrently modified.`,
      });
    }

    const committed = await clinicalTransaction.execute<DispenseRecord>({
      actionName: 'REVERSE_DISPENSE',
      resourceType: 'DispenseRecord',
      resourceId: dispenseRecord.id,
      targetStore: 'dispenseRecords',
      additionalStores,
      actor,
      requiredPermission: 'pharmacy:dispense',
      preconditions,
      validate: () => {},
      buildEntity: async (txContext) => {
        // Authoritative in-transaction verification
        const liveDispense = await txContext.get<DispenseRecord>('dispenseRecords', dispenseRecord.id);
        if (liveDispense && liveDispense.status === 'REVERSED') {
          throw new Error(`DispenseRecord ${dispenseRecord.id} has already been reversed.`);
        }
        if (liveDispense && liveDispense.version !== dispenseRecord.version) {
          throw new Error(`Concurrency conflict: DispenseRecord ${dispenseRecord.id} version changed.`);
        }

        return {
          entity: reversedRecord,
          eventType: 'DISPENSE_REVERSED',
          aggregateId: dispenseRecord.id,
          aggregateType: 'DispenseRecord',
          version: reversedRecord.version,
          auditAction: 'DISPENSE_REVERSED',
          previousState: dispenseRecord as unknown as Record<string, unknown>,
          additionalEntities,
        };
      },
    });

    return committed;
  }

  /**
   * Retrieves all dispense records linked to a specific prescription.
   */
  public async getDispenseRecordsForPrescription(prescriptionId: string): Promise<DispenseRecord[]> {
    return localRepository.getDispenseRecords(undefined, prescriptionId);
  }

  /**
   * Computes a unified, reconciled view of medication history for a patient.
   * Merges authoritative orders, prescriptions, and historical records with explicit provenance.
   */
  public async getMedicationHistory(patientId: string): Promise<DerivedMedicationHistoryItem[]> {
    const [orders, prescriptions, legacyMeds] = await Promise.all([
      localRepository.getMedicationOrders(patientId),
      localRepository.getPrescriptions(patientId),
      localRepository.getMedications(patientId),
    ]);

    const items: DerivedMedicationHistoryItem[] = [];
    const processedOrderIds = new Set<string>();

    // 1. Authoritative Medication Orders
    for (const order of orders) {
      processedOrderIds.add(order.id);
      const rx = prescriptions.find((p) => p.medicationOrderId === order.id);

      let category: DerivedMedicationHistoryItem['category'] = 'ACTIVE';
      if (order.status === 'DISCONTINUED') category = 'DISCONTINUED';
      else if (order.status === 'HELD') category = 'HELD';
      else if (order.status === 'CANCELLED') category = 'DISCONTINUED';
      else if (rx && rx.status === 'DISPENSED') category = 'ACTIVE';

      items.push({
        id: order.id,
        orderNumber: order.orderNumber,
        prescriptionNumber: rx?.prescriptionNumber,
        patientId: order.patientId,
        genericName: order.genericName,
        brandName: order.brandName,
        formulation: order.formulation,
        strength: order.strength,
        strengthUnit: order.strengthUnit,
        route: order.route,
        dose: `${order.dose} ${order.doseUnit}`,
        frequency: order.frequency,
        durationText: `${order.durationValue} ${order.durationUnit}`,
        category,
        source: order.source || 'LOCAL_PRESCRIPTION',
        prescriberName: order.orderedByName,
        prescribedAt: order.orderedAt,
        discontinuedAt: order.discontinuedAt,
        discontinuedReason: order.discontinuedReason,
        facilityId: order.facilityId,
        status: order.status,
      });
    }

    // 2. Legacy Medications not covered by authoritative orders
    for (const leg of legacyMeds) {
      if (!processedOrderIds.has(leg.id)) {
        let category: DerivedMedicationHistoryItem['category'] = 'ACTIVE';
        if (leg.dispensedStatus === 'cancelled') category = 'DISCONTINUED';
        else if (leg.endDate && new Date(leg.endDate) < new Date()) category = 'COMPLETED';

        items.push({
          id: leg.id,
          patientId: leg.patientId,
          genericName: leg.genericName || leg.name,
          brandName: leg.name !== leg.genericName ? leg.name : undefined,
          formulation: 'Tablet',
          strength: leg.dosage,
          strengthUnit: '',
          route: leg.route,
          dose: leg.dosage,
          frequency: leg.frequency,
          durationText: `${leg.durationDays} days`,
          category,
          source: 'LOCAL_PRESCRIPTION',
          prescribedAt: leg.startDate,
          status: leg.dispensedStatus,
        });
      }
    }

    // Sort: ACTIVE first, then by date descending
    return items.sort((a, b) => {
      if (a.category === 'ACTIVE' && b.category !== 'ACTIVE') return -1;
      if (b.category === 'ACTIVE' && a.category !== 'ACTIVE') return 1;
      return new Date(b.prescribedAt || 0).getTime() - new Date(a.prescribedAt || 0).getTime();
    });
  }

  /**
   * Migrates legacy Medication records to authoritative MedicationOrder + Prescription records.
   * Ensures historical medications gain explicit provenance, checksummed identifiers, and lifecycle state.
   */
  public async migrateLegacyMedications(patientId?: string): Promise<{ migratedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let migratedCount = 0;

    const legacyMeds = patientId
      ? await localRepository.getMedications(patientId)
      : localDb.getMedications();

    for (const leg of legacyMeds) {
      try {
        const existingOrder = await localRepository.getMedicationOrder(leg.id);
        if (existingOrder) continue;

        const concepts = medicationTerminologyService.search(leg.genericName || leg.name);
        const concept = concepts.length > 0
          ? concepts[0]
          : (medicationTerminologyService.getConcept('WHO-EML-PARA-500-TAB') || medicationTerminologyService.getAllActiveConcepts()[0]);

        const orderId = leg.id;
        const now = leg.startDate || new Date().toISOString();
        const orderNumber = generateMedicationOrderNumber('MIGRATION', 'legacy');

        const order: MedicationOrder = {
          id: orderId,
          orderNumber,
          patientId: leg.patientId,
          encounterId: leg.encounterId,
          facilityId: 'LEGACY_MIGRATION',
          orderedById: leg.prescribedById || 'system_migration',
          orderedByName: 'Historical Prescriber',
          orderedByRole: 'physician',
          orderedAt: now,
          medicationDefinitionId: concept.id,
          medicationCode: concept.code,
          genericName: leg.genericName || leg.name,
          brandName: leg.name,
          formulation: 'Tablet',
          strength: leg.dosage,
          strengthUnit: 'units',
          route: (['oral', 'intravenous', 'intramuscular', 'subcutaneous', 'topical', 'inhalation'].includes(leg.route)
            ? leg.route
            : 'oral') as any,
          dose: leg.dosage,
          doseUnit: 'units',
          frequency: leg.frequency,
          frequencyText: leg.frequency,
          durationValue: leg.durationDays || 7,
          durationUnit: 'days',
          quantity: (leg.durationDays || 7) * 2,
          quantityUnit: 'tablets',
          indication: 'Historical therapy',
          instructions: leg.instructions || `${leg.dosage} ${leg.route} ${leg.frequency}`,
          priority: 'routine',
          safetyReviewState: 'SAFE_TO_REVIEW',
          safetyChecks: [],
          status: leg.dispensedStatus === 'cancelled' ? 'DISCONTINUED' : 'ACTIVE',
          version: 1,
          source: 'EXTERNAL',
          provenance: 'Migrated from legacy Medication record model',
          createdAt: now,
          updatedAt: now,
          syncStatus: 'SYNCED',
        };

        await localRepository.saveMedicationOrder(order);
        await localDb.saveMedicationOrder(order);
        migratedCount++;
      } catch (err: any) {
        errors.push(`Failed to migrate legacy med ${leg.id}: ${err.message}`);
      }
    }

    return { migratedCount, errors };
  }
}

export const medicationService = MedicationService.getInstance();

/**
 * Verifies the cryptographic SHA-256 seal of a Prescription.
 */
export function verifyPrescriptionSeal(prescription: Prescription): boolean {
  if (!prescription.signatureHash) return false;

  if (prescription.version === 1) {
    const signaturePayload = {
      prescriptionId: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      medicationOrderId: prescription.medicationOrderId,
      patientId: prescription.patientId,
      prescriberId: prescription.prescriberId,
      genericName: prescription.genericName,
      strength: `${prescription.strength} ${prescription.strengthUnit}`,
      dose: `${prescription.dose} ${prescription.doseUnit}`,
      route: prescription.route,
      frequency: prescription.frequency,
      quantity: prescription.quantity,
      issuedAt: prescription.issuedAt,
      attestation: prescription.prescriberAttestation?.statement,
    };
    const expected = sha256(canonicalJson(signaturePayload));
    return expected === prescription.signatureHash;
  } else {
    // For amended prescriptions (version > 1)
    const payload = {
      prescriptionId: prescription.id,
      prescriptionNumber: prescription.prescriptionNumber,
      version: prescription.version,
      quantity: prescription.quantity,
      refills: prescription.refills,
      instructions: prescription.instructions,
      amendedAt: prescription.amendedAt,
      amendedBy: prescription.amendedById,
      reason: prescription.amendmentReason,
    };
    const expected = sha256(canonicalJson(payload));
    return expected === prescription.signatureHash;
  }
}
