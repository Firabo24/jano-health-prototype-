/**
 * Jano Health - Clinical Workflow Service (Hardened v1.1)
 * 
 * Orchestrates clinical mutations through the Atomic Clinical Transaction layer:
 * 
 * Clinical Command
 *   ↓
 * Validation
 *   ↓
 * Authorization (RBAC + Facility Boundary)
 *   ↓
 * Atomic Local Transaction
 *   ├── Clinical State (target store)
 *   ├── Domain Event (append-only hash chain)
 *   ├── Audit Event (tamper-evident audit ledger)
 *   └── Sync Queue (pending push queue)
 *   ↓
 * Sync Engine (non-blocking background sync if online)
 */

import {
  Allergy,
  Appointment,
  ClinicalNote,
  Diagnosis,
  EmergencyCase,
  EmergencyTriage,
  EmergencyReassessment,
  EmergencyAlert,
  TransportRequest,
  Encounter,
  LaboratoryOrder,
  LaboratorySpecimen,
  LaboratoryResult,
  Medication,
  Patient,
  RadiologyOrder,
  RadiologyResult,
  Referral,
  AIRequest,
  AICapability,
  RoleType,
} from '../../domain/types';
import {
  EmergencyAcuity,
  EmergencyCaseStatus,
  EmergencyDispositionType,
  EmergencyWorkflowPriority,
  VALID_EMERGENCY_TRANSITIONS,
} from '../../domain/emergencyTypes';
import { generateEmergencyNumber } from '../../domain/emergencyIdentifiers';
import { triageClassificationService, TriageEvaluationInput } from './triageClassificationService';
import { ReferralPriority, ReferralStatus } from '../../domain/referralTypes';
import { generateEntityId } from '../../domain/identifiers';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { localRepository } from '../storage/localRepository';
import { laboratoryWorkflowService } from './laboratoryWorkflowService';

export type { ClinicalActorContext };

export class ClinicalWorkflowService {
  private static instance: ClinicalWorkflowService;

  private constructor() {}

  public static getInstance(): ClinicalWorkflowService {
    if (!ClinicalWorkflowService.instance) {
      ClinicalWorkflowService.instance = new ClinicalWorkflowService();
    }
    return ClinicalWorkflowService.instance;
  }

  // ----------------------------------------------------
  // 1. PATIENT WORKFLOWS
  // ----------------------------------------------------

  public async registerPatient(
    patientData: Omit<Patient, 'id' | 'version' | 'createdAt' | 'updatedAt'>,
    context: ClinicalActorContext
  ): Promise<Patient> {
    return clinicalTransaction.execute<Patient>({
      actionName: 'REGISTER_PATIENT',
      resourceType: 'Patient',
      targetStore: 'patients',
      actor: context,
      requiredPermission: 'patient:create',
      validate: () => {
        if (!patientData.firstName || !patientData.lastName) {
          throw new Error('First name and last name are required for patient registration');
        }
        if (!patientData.mrn) {
          throw new Error('Medical Record Number (MRN) is required');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('pat');
        const now = new Date().toISOString();
        const patient: Patient = {
          ...patientData,
          id,
          version: 1,
          createdAt: now,
          updatedAt: now,
          primaryFacilityId: patientData.primaryFacilityId || context.facilityId,
        };

        return {
          entity: patient,
          eventType: 'PATIENT_CREATED',
          aggregateId: patient.id,
          aggregateType: 'Patient',
          version: 1,
          auditAction: 'PATIENT_REGISTRATION',
        };
      },
    });
  }

  public async updatePatient(
    patientId: string,
    updates: Partial<Patient>,
    context: ClinicalActorContext
  ): Promise<Patient> {
    return clinicalTransaction.execute<Patient>({
      actionName: 'UPDATE_PATIENT',
      resourceType: 'Patient',
      resourceId: patientId,
      targetStore: 'patients',
      actor: context,
      requiredPermission: 'patient:update',
      validate: async () => {
        if (!patientId) throw new Error('Patient ID is required');
        const existing = await localRepository.getPatient(patientId);
        if (!existing) throw new Error(`Patient with ID ${patientId} not found`);
      },
      buildEntity: async () => {
        const existing = (await localRepository.getPatient(patientId))!;
        const now = new Date().toISOString();
        const nextVersion = (existing.version || 1) + 1;
        const updated: Patient = {
          ...existing,
          ...updates,
          id: patientId,
          version: nextVersion,
          updatedAt: now,
        };

        return {
          entity: updated,
          eventType: 'PATIENT_UPDATED',
          aggregateId: patientId,
          aggregateType: 'Patient',
          version: nextVersion,
          auditAction: 'PATIENT_UPDATE',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 2. ENCOUNTER WORKFLOWS
  // ----------------------------------------------------

  public async createEncounter(
    encounterData: Omit<Encounter, 'id'>,
    context: ClinicalActorContext
  ): Promise<Encounter> {
    return clinicalTransaction.execute<Encounter>({
      actionName: 'CREATE_ENCOUNTER',
      resourceType: 'Encounter',
      targetStore: 'encounters',
      actor: context,
      requiredPermission: 'encounter:create',
      validate: () => {
        if (!encounterData.patientId) {
          throw new Error('Patient ID is required to begin an encounter');
        }
        if (!encounterData.chiefComplaint) {
          throw new Error('Chief complaint is required');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('enc');
        const now = new Date().toISOString();
        const encounter: Encounter = {
          ...encounterData,
          id,
          startedAt: encounterData.startedAt || now,
          facilityId: encounterData.facilityId || context.facilityId,
          clinicianId: encounterData.clinicianId || context.userId,
        };

        return {
          entity: encounter,
          eventType: 'ENCOUNTER_CREATED',
          aggregateId: encounter.id,
          aggregateType: 'Encounter',
          version: 1,
          auditAction: 'ENCOUNTER_START',
        };
      },
    });
  }

  public async updateEncounterStatus(
    encounterId: string,
    status: Encounter['status'],
    context: ClinicalActorContext
  ): Promise<Encounter> {
    return clinicalTransaction.execute<Encounter>({
      actionName: 'UPDATE_ENCOUNTER_STATUS',
      resourceType: 'Encounter',
      resourceId: encounterId,
      targetStore: 'encounters',
      actor: context,
      requiredPermission: 'encounter:create', // or clinical write
      validate: async () => {
        const existing = await localRepository.getEncounter(encounterId);
        if (!existing) throw new Error(`Encounter with ID ${encounterId} not found`);
      },
      buildEntity: async () => {
        const existing = (await localRepository.getEncounter(encounterId))!;
        const updated: Encounter = {
          ...existing,
          status,
          endedAt: status === 'completed' ? new Date().toISOString() : existing.endedAt,
        };

        return {
          entity: updated,
          eventType: 'ENCOUNTER_UPDATED',
          aggregateId: encounterId,
          aggregateType: 'Encounter',
          version: 2,
          auditAction: `ENCOUNTER_STATUS_${status.toUpperCase()}`,
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 3. VITALS WORKFLOW
  // ----------------------------------------------------

  public async recordVitalSign(
    vitalData: Omit<any, 'id'>,
    context: ClinicalActorContext
  ): Promise<any> {
    return clinicalTransaction.execute<any>({
      actionName: 'RECORD_VITALS',
      resourceType: 'VitalSign',
      targetStore: 'vitals',
      actor: context,
      requiredPermission: 'vitals:record',
      validate: () => {
        if (!vitalData.patientId) {
          throw new Error('Patient ID is required to record vitals');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('vit');
        const now = new Date().toISOString();
        const vital = {
          ...vitalData,
          id,
          recordedAt: vitalData.recordedAt || now,
          recordedById: context.userId,
          recordedByName: context.userName,
          facilityId: context.facilityId,
        };

        return {
          entity: vital,
          eventType: 'VITAL_SIGN_RECORDED',
          aggregateId: vital.id,
          aggregateType: 'VitalSign',
          version: 1,
          auditAction: 'VITAL_RECORDED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 4. CLINICAL NOTES (SOAP)
  // ----------------------------------------------------

  public async createClinicalNote(
    noteData: Omit<ClinicalNote, 'id' | 'recordedAt' | 'authorId'>,
    context: ClinicalActorContext
  ): Promise<ClinicalNote> {
    return clinicalTransaction.execute<ClinicalNote>({
      actionName: 'CREATE_CLINICAL_NOTE',
      resourceType: 'ClinicalNote',
      targetStore: 'clinicalNotes',
      actor: context,
      requiredPermission: 'clinical:notes_write',
      validate: () => {
        if (!noteData.patientId) {
          throw new Error('Patient ID is required for clinical notes');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('note');
        const now = new Date().toISOString();
        const note: ClinicalNote = {
          ...noteData,
          id,
          recordedAt: now,
          authorId: context.userId,
        };

        return {
          entity: note,
          eventType: 'CLINICAL_NOTE_CREATED',
          aggregateId: note.id,
          aggregateType: 'ClinicalNote',
          version: 1,
          auditAction: 'CLINICAL_NOTE_ENTRY',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 5. MEDICATION RECORDING & PRESCRIBING
  // ----------------------------------------------------

  public async prescribeMedication(
    medData: Omit<Medication, 'id'>,
    context: ClinicalActorContext
  ): Promise<Medication> {
    return clinicalTransaction.execute<Medication>({
      actionName: 'PRESCRIBE_MEDICATION',
      resourceType: 'Medication',
      targetStore: 'medications',
      actor: context,
      requiredPermission: 'clinical:prescribe',
      validate: () => {
        if (!medData.patientId) {
          throw new Error('Patient ID is required for prescription');
        }
        if (!medData.name) {
          throw new Error('Medication name is required');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('med');
        const now = new Date().toISOString();
        const medication: Medication = {
          ...medData,
          id,
          startDate: medData.startDate || now.split('T')[0],
          prescribedById: context.userId,
        };

        return {
          entity: medication,
          eventType: 'MEDICATION_RECORDED',
          aggregateId: medication.id,
          aggregateType: 'Medication',
          version: 1,
          auditAction: 'MEDICATION_PRESCRIBED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 6. DIAGNOSES
  // ----------------------------------------------------

  public async recordDiagnosis(
    diagnosisData: Omit<Diagnosis, 'id'>,
    context: ClinicalActorContext
  ): Promise<Diagnosis> {
    return clinicalTransaction.execute<Diagnosis>({
      actionName: 'RECORD_DIAGNOSIS',
      resourceType: 'Diagnosis',
      targetStore: 'diagnoses',
      actor: context,
      requiredPermission: 'clinical:diagnose',
      validate: () => {
        if (!diagnosisData.patientId) {
          throw new Error('Patient ID is required for diagnosis');
        }
        if (!diagnosisData.description) {
          throw new Error('Condition description is required');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('dx');
        const now = new Date().toISOString();
        const diagnosis: Diagnosis = {
          ...diagnosisData,
          id,
          recordedAt: diagnosisData.recordedAt || now,
          diagnosedById: context.userId,
        };

        return {
          entity: diagnosis,
          eventType: 'DIAGNOSIS_RECORDED',
          aggregateId: diagnosis.id,
          aggregateType: 'Diagnosis',
          version: 1,
          auditAction: 'DIAGNOSIS_RECORDED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 7. ALLERGIES
  // ----------------------------------------------------

  public async recordAllergy(
    allergyData: Omit<Allergy, 'id'>,
    context: ClinicalActorContext
  ): Promise<Allergy> {
    return clinicalTransaction.execute<Allergy>({
      actionName: 'RECORD_ALLERGY',
      resourceType: 'Allergy',
      targetStore: 'allergies',
      actor: context,
      requiredPermission: 'clinical:notes_write',
      validate: () => {
        if (!allergyData.patientId) throw new Error('Patient ID is required');
        if (!allergyData.allergen) throw new Error('Allergen is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('alg');
        const now = new Date().toISOString();
        const allergy: Allergy = {
          ...allergyData,
          id,
          diagnosedDate: allergyData.diagnosedDate || now.split('T')[0],
        };

        return {
          entity: allergy,
          eventType: 'ALLERGY_RECORDED',
          aggregateId: allergy.id,
          aggregateType: 'Allergy',
          version: 1,
          auditAction: 'ALLERGY_RECORDED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 8. LABORATORY WORKFLOWS
  // ----------------------------------------------------

  public async createLabOrder(
    orderData: Omit<LaboratoryOrder, 'id'>,
    context: ClinicalActorContext
  ): Promise<LaboratoryOrder> {
    return clinicalTransaction.execute<LaboratoryOrder>({
      actionName: 'CREATE_LAB_ORDER',
      resourceType: 'LaboratoryOrder',
      targetStore: 'labOrders',
      actor: context,
      requiredPermission: 'lab:order',
      validate: () => {
        if (!orderData.patientId) throw new Error('Patient ID is required');
        if (!orderData.testName) throw new Error('Test name is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('lab_ord');
        const now = new Date().toISOString();
        const order: LaboratoryOrder = {
          ...orderData,
          id,
          orderedAt: orderData.orderedAt || now,
          orderedById: context.userId,
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

  public async recordLabResult(
    resultData: Omit<LaboratoryResult, 'id'>,
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return clinicalTransaction.execute<LaboratoryResult>({
      actionName: 'RECORD_LAB_RESULT',
      resourceType: 'LaboratoryResult',
      targetStore: 'labResults',
      actor: context,
      requiredPermission: 'lab:result_entry',
      validate: () => {
        if (!resultData.patientId) throw new Error('Patient ID is required');
        if (!resultData.parameterName) throw new Error('Parameter name is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('lab_res');
        const now = new Date().toISOString();
        const result: LaboratoryResult = {
          ...resultData,
          id,
          completedAt: resultData.completedAt || now,
          analyzedById: context.userId,
        };

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

  public async cancelLabOrder(
    orderId: string,
    cancellationReason: string,
    context: ClinicalActorContext
  ): Promise<LaboratoryOrder> {
    return laboratoryWorkflowService.cancelLabOrder(orderId, cancellationReason, context);
  }

  public async collectSpecimen(
    params: {
      orderId: string;
      patientId: string;
      specimenType: any;
      collectionSite?: string;
      containerType?: string;
      volumeMl?: number;
      collectionNotes?: string;
    },
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return laboratoryWorkflowService.collectSpecimen(params, context);
  }

  public async receiveSpecimen(
    params: {
      specimenId: string;
      benchLocation?: string;
      condition?: 'ADEQUATE' | 'SUBOPTIMAL';
      temperatureCelsius?: number;
      notes?: string;
    },
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return laboratoryWorkflowService.receiveSpecimen(params, context);
  }

  public async rejectSpecimen(
    params: {
      specimenId: string;
      rejectionReason: any;
      rejectionNotes: string;
    },
    context: ClinicalActorContext
  ): Promise<LaboratorySpecimen> {
    return laboratoryWorkflowService.rejectSpecimen(params, context);
  }

  public async verifyLabResult(
    params: { resultId: string; verificationNotes?: string },
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return laboratoryWorkflowService.verifyResult(params, context);
  }

  public async correctLabResult(
    params: {
      resultId: string;
      newValue?: string;
      newNumericValue?: number;
      newTextValue?: string;
      newAbnormalFlag?: any;
      newCriticalFlag?: boolean;
      correctionReason: string;
    },
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    const val = params.newValue || params.newTextValue || (params.newNumericValue !== undefined ? String(params.newNumericValue) : '');
    return laboratoryWorkflowService.correctResult({
      ...params,
      newValue: val,
    }, context);
  }

  public async acknowledgeCriticalResult(
    params: { resultId: string; clinicalActionTaken: string; notes?: string },
    context: ClinicalActorContext
  ): Promise<LaboratoryResult> {
    return laboratoryWorkflowService.acknowledgeCriticalResult(params, context);
  }

  // ----------------------------------------------------
  // 9. RADIOLOGY WORKFLOWS
  // ----------------------------------------------------

  public async createRadiologyOrder(
    orderData: Omit<RadiologyOrder, 'id'>,
    context: ClinicalActorContext
  ): Promise<RadiologyOrder> {
    return clinicalTransaction.execute<RadiologyOrder>({
      actionName: 'CREATE_RADIOLOGY_ORDER',
      resourceType: 'RadiologyOrder',
      targetStore: 'radiologyOrders',
      actor: context,
      requiredPermission: 'radiology:order',
      validate: () => {
        if (!orderData.patientId) throw new Error('Patient ID is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('rad_ord');
        const now = new Date().toISOString();
        const order: RadiologyOrder = {
          ...orderData,
          id,
          orderedAt: orderData.orderedAt || now,
          orderedById: context.userId,
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

  public async recordRadiologyResult(
    resultData: Omit<RadiologyResult, 'id'>,
    context: ClinicalActorContext
  ): Promise<RadiologyResult> {
    return clinicalTransaction.execute<RadiologyResult>({
      actionName: 'RECORD_RADIOLOGY_RESULT',
      resourceType: 'RadiologyResult',
      targetStore: 'radiologyResults',
      actor: context,
      requiredPermission: 'radiology:result_entry',
      validate: () => {
        if (!resultData.patientId) throw new Error('Patient ID is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('rad_res');
        const now = new Date().toISOString();
        const result: RadiologyResult = {
          ...resultData,
          id,
          completedAt: resultData.completedAt || now,
          radiologistId: context.userId,
        };

        return {
          entity: result,
          eventType: 'RADIOLOGY_RESULT_RECORDED',
          aggregateId: result.id,
          aggregateType: 'RadiologyResult',
          version: 1,
          auditAction: 'RADIOLOGY_RESULT_RECORDED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 10. APPOINTMENTS & REFERRALS
  // ----------------------------------------------------

  public async createAppointment(
    apptData: Omit<Appointment, 'id'>,
    context: ClinicalActorContext
  ): Promise<Appointment> {
    return clinicalTransaction.execute<Appointment>({
      actionName: 'CREATE_APPOINTMENT',
      resourceType: 'Appointment',
      targetStore: 'appointments',
      actor: context,
      requiredPermission: 'appointments:manage',
      validate: () => {
        if (!apptData.patientId) throw new Error('Patient ID is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('apt');
        const appt: Appointment = {
          ...apptData,
          id,
          facilityId: apptData.facilityId || context.facilityId,
        };

        return {
          entity: appt,
          eventType: 'APPOINTMENT_CREATED',
          aggregateId: appt.id,
          aggregateType: 'Appointment',
          version: 1,
          auditAction: 'APPOINTMENT_CREATED',
        };
      },
    });
  }

  public async createReferral(
    referralData: Omit<Referral, 'id'>,
    context: ClinicalActorContext
  ): Promise<Referral> {
    return clinicalTransaction.execute<Referral>({
      actionName: 'CREATE_REFERRAL',
      resourceType: 'Referral',
      targetStore: 'referrals',
      actor: context,
      requiredPermission: 'referrals:manage',
      validate: () => {
        if (!referralData.patientId) throw new Error('Patient ID is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('ref');
        const referral: Referral = {
          ...referralData,
          id,
          patientId: (referralData.patientId as string) || '',
          clinicalSummary: (referralData.clinicalSummary as string) || (referralData.reasonForReferral as string) || '',
          priority: (referralData.priority as ReferralPriority) || 'ROUTINE',
          status: (referralData.status as ReferralStatus) || 'DRAFT',
          createdAt: (referralData.createdAt as string) || new Date().toISOString(),
          fromFacilityId: (referralData.fromFacilityId as string) || context.facilityId,
          referringClinicianId: context.userId,
        };

        return {
          entity: referral,
          eventType: 'REFERRAL_CREATED',
          aggregateId: referral.id,
          aggregateType: 'Referral',
          version: 1,
          auditAction: 'REFERRAL_CREATED',
        };
      },
    });
  }

  // ----------------------------------------------------
  // 11. EMERGENCY WORKFLOWS (Clinical Core V9)
  // ----------------------------------------------------

  /**
   * Registers an emergency arrival presentation aggregate.
   */
  public async createEmergencyCase(
    caseData: Partial<EmergencyCase>,
    context: ClinicalActorContext
  ): Promise<EmergencyCase> {
    return clinicalTransaction.execute<EmergencyCase>({
      actionName: 'CREATE_EMERGENCY_CASE',
      resourceType: 'EmergencyCase',
      targetStore: 'emergencyCases',
      actor: context,
      requiredPermission: 'emergency:create',
      validate: () => {
        if (!caseData.chiefComplaint?.trim()) {
          throw new Error('Chief complaint is required for emergency intake');
        }
      },
      buildEntity: async () => {
        const id = generateEntityId('emg');
        const now = new Date().toISOString();
        const facilityId = caseData.facilityId || context.facilityId;
        const emergencyNumber =
          caseData.emergencyNumber || generateEmergencyNumber(facilityId, context.deviceId);

        const emergencyCase: EmergencyCase = {
          id,
          emergencyNumber,
          facilityId,
          patientId: caseData.patientId,
          provisionalPatientName: caseData.provisionalPatientName,
          departmentId: caseData.departmentId,
          arrivalAt: caseData.arrivalAt || caseData.arrivalTime || now,
          arrivalTime: caseData.arrivalAt || caseData.arrivalTime || now,
          arrivalMode: caseData.arrivalMode || 'WALK_IN',
          chiefComplaint: caseData.chiefComplaint!.trim(),
          presentingProblem: caseData.presentingProblem,
          referralSource: caseData.referralSource,
          broughtBy: caseData.broughtBy,
          accompanyingPerson: caseData.accompanyingPerson,
          triageStatus: caseData.triageStatus || 'PENDING',
          acuity: caseData.acuity,
          status: caseData.status || 'PRESENTED',
          priority: caseData.priority || 'STANDARD',
          treatmentArea: caseData.treatmentArea,
          resuscitationFlag: caseData.resuscitationFlag ?? false,
          isActive: caseData.isActive ?? true,
          version: 1,
          provenance: {
            recordedById: context.userId,
            recordedByName: context.userName,
            recordedAt: now,
            facilityId,
            deviceId: context.deviceId,
            syncStatus: 'synced',
          },
          createdAt: now,
          updatedAt: now,
        };

        return {
          entity: emergencyCase,
          eventType: 'EMERGENCY_CASE_CREATED',
          aggregateId: emergencyCase.id,
          aggregateType: 'EmergencyCase',
          version: 1,
          auditAction: 'CREATE_EMERGENCY_CASE',
        };
      },
    });
  }

  /**
   * Records emergency triage with explicit rule provenance and operational acuity.
   */
  public async recordEmergencyTriage(
    emergencyData: Omit<EmergencyCase, 'id'>,
    context: ClinicalActorContext,
    evaluationInput?: TriageEvaluationInput
  ): Promise<EmergencyCase> {
    return clinicalTransaction.execute<EmergencyCase>({
      actionName: 'RECORD_EMERGENCY_TRIAGE',
      resourceType: 'EmergencyCase',
      targetStore: 'emergencyCases',
      actor: context,
      requiredPermission: 'emergency:triage',
      validate: () => {
        if (!emergencyData.chiefComplaint && !emergencyData.triageCategory) {
          throw new Error('Chief complaint or triage category is required');
        }
      },
      buildEntity: async (txContext) => {
        const id = generateEntityId('emg');
        const now = new Date().toISOString();
        const facilityId = emergencyData.facilityId || context.facilityId;
        const emergencyNumber =
          emergencyData.emergencyNumber || generateEmergencyNumber(facilityId, context.deviceId);

        // Run algorithmic classification if input provided or derived
        const evalInput: TriageEvaluationInput = evaluationInput || {
          chiefComplaint: emergencyData.chiefComplaint || '',
          airwayPatent: emergencyData.airwayBreathingCirculation?.airwayPatent ?? true,
          respiratoryDistress: emergencyData.airwayBreathingCirculation?.respiratoryDistress ?? false,
          shockSigns: emergencyData.airwayBreathingCirculation?.shockSigns ?? false,
          glasgowComaScale: emergencyData.airwayBreathingCirculation?.glasgowComaScale,
        };

        const classification = triageClassificationService.classify(evalInput);

        // Determine mapped acuity & legacy category
        let finalAcuity: EmergencyAcuity = emergencyData.acuity || classification.acuity;
        if (!emergencyData.acuity && emergencyData.triageCategory) {
          if (emergencyData.triageCategory === 'RED_RESUSCITATION') finalAcuity = 'RESUSCITATION_RED';
          else if (emergencyData.triageCategory === 'YELLOW_URGENT') finalAcuity = 'URGENT_YELLOW';
          else if (emergencyData.triageCategory === 'GREEN_DELAYED') finalAcuity = 'LESS_URGENT_GREEN';
          else if (emergencyData.triageCategory === 'BLACK_EXPECTANT') finalAcuity = 'EXPECTANT_BLACK';
        }

        const isResus = finalAcuity === 'RESUSCITATION_RED';
        const triageRecordId = generateEntityId('emt');

        // Create the distinct EmergencyTriage record
        const triageRecord: EmergencyTriage = {
          id: triageRecordId,
          emergencyCaseId: id,
          patientId: emergencyData.patientId,
          facilityId,
          assessedById: context.userId,
          assessedByName: context.userName,
          assessedAt: now,
          acuity: finalAcuity,
          chiefComplaint: emergencyData.chiefComplaint || '',
          immediateConcerns: classification.immediateConcerns,
          airwayPatent: evalInput.airwayPatent,
          respiratoryDistress: evalInput.respiratoryDistress,
          shockSigns: evalInput.shockSigns,
          glasgowComaScale: evalInput.glasgowComaScale,
          hasSignsOfLife: evalInput.hasSignsOfLife,
          triageSystem: classification.triageSystem,
          version: classification.targetTimePolicy.version,
          jurisdiction: classification.jurisdiction,
          sourceReference: classification.sourceReference,
          effectiveDate: classification.effectiveDate,
          ruleSetVersion: classification.ruleSetVersion,
          implementationType: classification.implementationType,
          policyScope: classification.policyScope,
          targetTimePolicy: classification.targetTimePolicy,
          ruleSetReference: classification.ruleSetReference,
          isSyntheticDemoRule: classification.isSyntheticDemoRule,
          provenance: classification.provenance,
        };

        // Persist distinct triage record
        await txContext.put('emergencyTriages', triageRecord);

        // If high acuity, raise operational alert
        if (finalAcuity === 'RESUSCITATION_RED' || finalAcuity === 'EMERGENT_ORANGE') {
          const alertId = generateEntityId('ema');
          const alert: EmergencyAlert = {
            id: alertId,
            emergencyCaseId: id,
            patientId: emergencyData.patientId,
            facilityId,
            type: 'HIGH_ACUITY_TRIAGE',
            severity: finalAcuity === 'RESUSCITATION_RED' ? 'LIFE_THREAT' : 'CRITICAL',
            title: `High Acuity Alert: ${triageClassificationService.getDisplay(finalAcuity).label}`,
            details: `Patient presenting with ${emergencyData.chiefComplaint || 'acute presentation'}. Immediate medical team attendance required.`,
            detectedAt: now,
          };
          await txContext.put('emergencyAlerts', alert);
        }

        // Map legacy category for backward compatibility
        let legacyCat: EmergencyCase['triageCategory'] = emergencyData.triageCategory;
        if (!legacyCat) {
          if (finalAcuity === 'RESUSCITATION_RED') legacyCat = 'RED_RESUSCITATION';
          else if (finalAcuity === 'EMERGENT_ORANGE' || finalAcuity === 'URGENT_YELLOW') legacyCat = 'YELLOW_URGENT';
          else if (finalAcuity === 'EXPECTANT_BLACK') legacyCat = 'BLACK_EXPECTANT';
          else legacyCat = 'GREEN_DELAYED';
        }

        const emergency: EmergencyCase = {
          ...emergencyData,
          id,
          emergencyNumber,
          facilityId,
          arrivalAt: emergencyData.arrivalAt || emergencyData.arrivalTime || now,
          arrivalTime: emergencyData.arrivalAt || emergencyData.arrivalTime || now,
          arrivalMode: emergencyData.arrivalMode || 'WALK_IN',
          triageStatus: 'TRIAGED',
          acuity: finalAcuity,
          triageCategory: legacyCat,
          triageCategorySource: classification.ruleSetReference,
          triageRuleVersion: classification.ruleSetVersion,
          emergencyTriageId: triageRecordId,
          triagedById: context.userId,
          triagedByName: context.userName,
          triagedAt: now,
          status: isResus ? 'STABILIZATION' : 'ASSESSMENT',
          priority: classification.workflowPriority,
          treatmentArea: emergencyData.treatmentArea || classification.recommendedBay,
          resuscitationFlag: isResus,
          assignedClinicianId: emergencyData.assignedClinicianId || context.userId,
          isActive: true,
          version: 1,
          provenance: {
            recordedById: context.userId,
            recordedByName: context.userName,
            recordedAt: now,
            facilityId,
            deviceId: context.deviceId,
            syncStatus: 'synced',
          },
          createdAt: now,
          updatedAt: now,
        };

        return {
          entity: emergency,
          eventType: 'EMERGENCY_CASE_TRIAGED',
          aggregateId: emergency.id,
          aggregateType: 'EmergencyCase',
          version: 1,
          auditAction: 'EMERGENCY_TRIAGE_LOGGED',
        };
      },
    });
  }

  /**
   * Records a longitudinal acute reassessment during emergency observation.
   */
  public async recordEmergencyReassessment(
    reassessmentData: Omit<EmergencyReassessment, 'id' | 'provenance'>,
    context: ClinicalActorContext
  ): Promise<EmergencyReassessment> {
    return clinicalTransaction.execute<EmergencyReassessment>({
      actionName: 'RECORD_EMERGENCY_REASSESSMENT',
      resourceType: 'EmergencyReassessment',
      targetStore: 'emergencyReassessments',
      actor: context,
      requiredPermission: 'emergency:reassess',
      validate: () => {
        if (!reassessmentData.emergencyCaseId) {
          throw new Error('Emergency case ID is required for reassessment');
        }
        if (!reassessmentData.clinicalChange?.trim()) {
          throw new Error('Clinical change description is required');
        }
      },
      buildEntity: async (txContext) => {
        const id = generateEntityId('emr');
        const now = new Date().toISOString();
        const facilityId = reassessmentData.facilityId || context.facilityId;

        const reassessment: EmergencyReassessment = {
          ...reassessmentData,
          id,
          facilityId,
          assessedById: context.userId,
          assessedByName: context.userName,
          assessedAt: reassessmentData.assessedAt || now,
          provenance: {
            recordedById: context.userId,
            recordedByName: context.userName,
            recordedAt: now,
            facilityId,
            deviceId: context.deviceId,
            syncStatus: 'synced',
          },
        };

        // Update emergencyCase status & timestamp
        const existingCase = await txContext.get<EmergencyCase>(
          'emergencyCases',
          reassessmentData.emergencyCaseId
        );
        if (existingCase) {
          const updatedCase: EmergencyCase = {
            ...existingCase,
            status: reassessmentData.currentStatus || existingCase.status,
            updatedAt: now,
            version: (existingCase.version || 1) + 1,
          };
          await txContext.put('emergencyCases', updatedCase);
          localRepository.updateCache('emergencyCases', updatedCase);
        }

        return {
          entity: reassessment,
          eventType: 'EMERGENCY_REASSESSMENT_RECORDED',
          aggregateId: reassessment.id,
          aggregateType: 'EmergencyReassessment',
          version: 1,
          auditAction: 'EMERGENCY_REASSESSMENT_LOGGED',
        };
      },
    });
  }

  /**
   * Finalizes an acute emergency case disposition (Discharge, Admission, Transfer, etc.)
   */
  public async recordEmergencyDisposition(
    caseId: string,
    dispositionData: {
      disposition: EmergencyDispositionType;
      notes?: string;
      destinationFacilityId?: string;
      destinationFacilityName?: string;
      instructions?: string;
    },
    context: ClinicalActorContext
  ): Promise<EmergencyCase> {
    return clinicalTransaction.execute<EmergencyCase>({
      actionName: 'RECORD_EMERGENCY_DISPOSITION',
      resourceType: 'EmergencyCase',
      targetStore: 'emergencyCases',
      actor: context,
      requiredPermission: 'emergency:disposition',
      validate: async () => {
        const c = await localRepository.getEmergencyCase(caseId);
        if (!c) throw new Error(`Emergency case not found: ${caseId}`);
        const validNext = VALID_EMERGENCY_TRANSITIONS[c.status] || [];
        const targetStatus: EmergencyCaseStatus =
          dispositionData.disposition === 'DISCHARGE'
            ? 'DISCHARGED'
            : dispositionData.disposition === 'ADMISSION'
            ? 'ADMITTED'
            : dispositionData.disposition === 'TRANSFER'
            ? 'TRANSFERRED'
            : dispositionData.disposition === 'DEATH'
            ? 'DECEASED'
            : 'DISPOSITION_PENDING';

        if (
          c.status !== 'DISPOSITION_PENDING' &&
          !validNext.includes(targetStatus) &&
          !validNext.includes('DISPOSITION_PENDING')
        ) {
          throw new Error(`Invalid disposition transition from status ${c.status} to ${targetStatus}`);
        }
      },
      buildEntity: async (txContext) => {
        const now = new Date().toISOString();
        const existingCase = await txContext.get<EmergencyCase>('emergencyCases', caseId);
        if (!existingCase) throw new Error(`Emergency case not found: ${caseId}`);

        let newStatus: EmergencyCaseStatus = 'DISCHARGED';
        if (dispositionData.disposition === 'ADMISSION') newStatus = 'ADMITTED';
        else if (dispositionData.disposition === 'TRANSFER') newStatus = 'TRANSFERRED';
        else if (dispositionData.disposition === 'DEATH') newStatus = 'DECEASED';
        else if (dispositionData.disposition === 'OBSERVATION') newStatus = 'OBSERVATION';

        // If transfer requested, create TransportRequest
        if (dispositionData.disposition === 'TRANSFER' && dispositionData.destinationFacilityId) {
          const transportId = generateEntityId('trp');
          const transport: TransportRequest = {
            id: transportId,
            emergencyCaseId: caseId,
            referralId: existingCase.transferReferralId || `ref-${caseId}`,
            status: 'REQUESTED',
            ambulanceRequired: true,
            oxygenRequired: existingCase.resuscitationFlag,
            infusionSupportRequired: false,
            clinicalEscortRequired: existingCase.acuity === 'RESUSCITATION_RED',
            originFacilityId: existingCase.facilityId,
            originFacilityName: context.facilityId,
            destinationFacilityId: dispositionData.destinationFacilityId,
            destinationFacilityName: dispositionData.destinationFacilityName || 'Referral Hospital',
            transportNotes: dispositionData.notes,
            createdAt: now,
            updatedAt: now,
          };
          await txContext.put('transportRequests', transport);
        }

        const updated: EmergencyCase = {
          ...existingCase,
          status: newStatus,
          disposition: dispositionData.disposition,
          dispositionAt: now,
          dispositionById: context.userId,
          dispositionByName: context.userName,
          dispositionNotes: dispositionData.notes,
          dischargeInstructions: dispositionData.instructions,
          isActive: false,
          version: (existingCase.version || 1) + 1,
          updatedAt: now,
        };

        return {
          entity: updated,
          eventType:
            dispositionData.disposition === 'DISCHARGE'
              ? 'EMERGENCY_CASE_DISCHARGED'
              : dispositionData.disposition === 'ADMISSION'
              ? 'EMERGENCY_CASE_ADMITTED'
              : dispositionData.disposition === 'TRANSFER'
              ? 'EMERGENCY_CASE_TRANSFERRED'
              : 'EMERGENCY_DISPOSITION_RECORDED',
          aggregateId: updated.id,
          aggregateType: 'EmergencyCase',
          version: updated.version,
          auditAction: `EMERGENCY_DISPOSITION_${dispositionData.disposition}`,
        };
      },
    });
  }

  // ----------------------------------------------------
  // 12. CLINICAL AI REQUEST
  // ----------------------------------------------------

  public async recordAIRequest(
    aiData: Partial<AIRequest> & { taskType: AICapability },
    context: ClinicalActorContext
  ): Promise<AIRequest> {
    return clinicalTransaction.execute<AIRequest>({
      actionName: 'RECORD_AI_REQUEST',
      resourceType: 'AIRequest',
      targetStore: 'aiRequests',
      actor: context,
      requiredPermission: 'ai.chart_summary' as any,
      validate: () => {
        if (!aiData.taskType) throw new Error('AI taskType is required');
      },
      buildEntity: async () => {
        const id = generateEntityId('air');
        const aiRequest: AIRequest = {
          id,
          requestId: aiData.requestId || id,
          actorId: context.userId,
          actorRole: context.userRole,
          actorName: context.userName || 'Clinician',
          facilityId: context.facilityId,
          patientId: aiData.patientId,
          encounterId: aiData.encounterId,
          taskType: aiData.taskType,
          model: aiData.model || 'gemini-3.8-flash',
          promptTemplateId: aiData.promptTemplateId || 'default',
          promptTemplateVersion: aiData.promptTemplateVersion || '1.0',
          contextReferences: aiData.contextReferences || [],
          contextFingerprint: aiData.contextFingerprint || '',
          createdAt: aiData.createdAt || new Date().toISOString(),
          status: aiData.status || 'COMPLETED',
          reviewStatus: aiData.reviewStatus || 'PENDING_REVIEW',
          provenance: aiData.provenance || {
            requestId: id,
            model: 'gemini-3.8-flash',
            modelVersion: '1.0',
            provider: 'gemini_cloud',
            promptTemplateId: 'default',
            promptTemplateVersion: '1.0',
            taskType: aiData.taskType,
            generatedAt: new Date().toISOString(),
            sourceRecordIds: [],
            knowledgeSourceIds: [],
            safetyPolicyVersion: '1.0',
            authorizationContextId: id,
            reviewStatus: 'PENDING_REVIEW',
            isDeterministicFallback: false,
          },
        };

        return {
          entity: aiRequest,
          eventType: 'AI_REQUEST_CREATED',
          aggregateId: aiRequest.id,
          aggregateType: 'AIRequest',
          version: 1,
          auditAction: 'AI_DECISION_SUPPORT_REQUEST',
        };
      },
    });
  }
}

export const clinicalWorkflowService = ClinicalWorkflowService.getInstance();
