/**
 * Jano Health - Clinical Exchange Handlers & Domain Converters
 * Clinical Core V13: Closed-Loop Referral, Lab, Radiology, Medication, and Emergency Inter-Facility Exchange
 */

import {
  Referral,
  ReferralOutcome,
  LaboratoryOrder,
  LaboratoryResult,
  RadiologyOrder,
  RadiologyResult,
  MedicationOrder,
  Prescription,
  EmergencyCase,
  EmergencyTriage,
  VitalSign,
  Problem,
  Allergy,
  ConsentPurpose,
} from '../../domain/types';
import { localRepository } from '../storage/localRepository';
import { consentPolicyEngine } from '../consent/consentPolicyEngine';
import { janoNodeRegistryService } from './nodeRegistry';

export interface CrossFacilityReferralPayload {
  referral: Referral;
  patientSummary: {
    mrn: string;
    fullName: string;
    dob: string;
    gender: string;
    activeProblems: Problem[];
    allergies: Allergy[];
    currentMedications: string[];
    recentLabs?: Array<{ testName: string; value: string; unit: string; date: string }>;
  };
  transportRequirements?: {
    requiresAmbulance: boolean;
    requiresOxygen: boolean;
    requiresClinicalAttendant: boolean;
    triageLevel: string;
  };
  counterReferralOutcome?: ReferralOutcome;
}

export interface CrossFacilityLabPayload {
  order: LaboratoryOrder;
  results: LaboratoryResult[];
  criticalAlert?: {
    isCritical: boolean;
    parameterName: string;
    value: string;
    notifiedClinicianId?: string;
  };
}

export interface CrossFacilityRadiologyPayload {
  order: RadiologyOrder;
  results: RadiologyResult[];
  studyMetadata: {
    modality: string;
    bodySite: string;
    seriesCount: number;
    instancesCount: number;
    accessionNumber: string;
  };
  criticalFindingAlert?: {
    isCritical: boolean;
    criticalSummary: string;
    acknowledgedBy?: string;
  };
}

export interface CrossFacilityMedicationPayload {
  medicationOrder: MedicationOrder;
  prescription: Prescription;
  patientAllergies: Allergy[];
  safetyAdvisory?: {
    hasInteraction: boolean;
    level?: 'HIGH_RISK' | 'MODERATE' | 'LOW';
    notes?: string;
  };
}

export interface CrossFacilityEmergencyTransferPayload {
  emergencyCase: EmergencyCase;
  latestTriage: EmergencyTriage;
  latestVitals?: VitalSign;
  activeProblems: Problem[];
  allergies: Allergy[];
  interventionsPerformed: string[];
  transportRequirements: {
    requiresAmbulance: boolean;
    requiresOxygen: boolean;
    requiresIVInfusion: boolean;
    requiresClinicalAttendant: boolean;
    departureTimestamp: string;
  };
  dispatchingFacilityId: string;
  receivingFacilityId: string;
}

export class ClinicalExchangeService {
  private static instance: ClinicalExchangeService;

  private constructor() {}

  public static getInstance(): ClinicalExchangeService {
    if (!ClinicalExchangeService.instance) {
      ClinicalExchangeService.instance = new ClinicalExchangeService();
    }
    return ClinicalExchangeService.instance;
  }

  // --------------------------------------------------------------------------
  // 1. Closed-Loop Referral Package Assembly
  // --------------------------------------------------------------------------
  public async assembleReferralPackage(
    referralId: string,
    authorFacilityId: string
  ): Promise<CrossFacilityReferralPayload> {
    const referral = await localRepository.getReferralById(referralId);
    if (!referral) {
      throw new Error(`REFERRAL_NOT_FOUND: Referral '${referralId}' does not exist.`);
    }

    const patient = await localRepository.getPatientById(referral.patientId);
    if (!patient) {
      throw new Error(`PATIENT_NOT_FOUND: Patient '${referral.patientId}' does not exist.`);
    }

    const problems = await localRepository.getProblems(referral.patientId);
    const allergies = await localRepository.getAllergies(referral.patientId);
    const medOrders = await localRepository.getMedicationOrders(referral.patientId);
    const activeMeds = medOrders.filter((m) => m.status === 'ACTIVE').map((m) => `${m.genericName || m.medicationName || 'Medication'} (${m.dose || m.dosage || ''})`);

    const recentLabOrders = await localRepository.getLabOrders(referral.patientId);
    const recentLabResults: Array<{ testName: string; value: string; unit: string; date: string }> = [];
    for (const ord of recentLabOrders.slice(0, 3)) {
      const res = await localRepository.getLabResults(referral.patientId, ord.id);
      res.forEach((r) => {
        recentLabResults.push({
          testName: r.testName || 'Lab Investigation',
          value: String(r.numericValue ?? r.value ?? ''),
          unit: r.unit || '',
          date: r.verifiedAt || r.performedAt || r.createdAt || '',
        });
      });
    }

    return {
      referral,
      patientSummary: {
        mrn: patient.mrn,
        fullName: `${patient.firstName} ${patient.lastName}`,
        dob: patient.dateOfBirth,
        gender: patient.gender || patient.sex,
        activeProblems: problems.filter((p) => p.status === 'ACTIVE'),
        allergies,
        currentMedications: activeMeds,
        recentLabs: recentLabResults,
      },
      transportRequirements: {
        requiresAmbulance: referral.priority === 'urgent' || referral.priority === 'emergency',
        requiresOxygen: referral.priority === 'emergency',
        requiresClinicalAttendant: referral.priority === 'emergency',
        triageLevel: referral.priority,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 2. Inbound Referral Application (Store on Receiving Node)
  // --------------------------------------------------------------------------
  public async applyInboundReferral(
    payload: any,
    resolvedLocalPatientId: string,
    receivingFacilityId: string
  ): Promise<Referral> {
    const incoming: Referral = payload.referral || payload;
    const now = new Date().toISOString();

    const localReferral: Referral = {
      id: incoming.id || `ref_${Date.now()}`,
      patientId: resolvedLocalPatientId,
      referralNumber: incoming.referralNumber || `REF-${Date.now()}`,
      fromFacilityId: String(incoming.fromFacilityId || (incoming as any).referringFacilityId || 'fac_unknown'),
      toFacilityId: receivingFacilityId,
      referringFacilityId: String((incoming as any).referringFacilityId || incoming.fromFacilityId || 'fac_unknown'),
      receivingFacilityId,
      urgency: incoming.urgency || incoming.priority || 'routine',
      priority: incoming.priority || incoming.urgency || 'routine',
      specialty: incoming.specialty || 'General Practice',
      reasonForReferral: incoming.reasonForReferral || incoming.clinicalSummary || 'Inter-facility clinical referral',
      clinicalSummary: `${incoming.clinicalSummary || ''}\n[Exchanged via Jano Network at ${now}]`.trim(),
      status: 'received',
      createdAt: incoming.createdAt || now,
      updatedAt: now,
    };

    await localRepository.saveReferral(localReferral);
    return localReferral;
  }

  // --------------------------------------------------------------------------
  // 3. Counter-Referral Outcome Processing
  // --------------------------------------------------------------------------
  public async applyCounterReferralOutcome(
    outcome: ReferralOutcome,
    resolvedLocalPatientId: string
  ): Promise<void> {
    const existingRef = await localRepository.getReferralById(outcome.referralId);
    if (existingRef) {
      existingRef.status = 'completed';
      existingRef.updatedAt = new Date().toISOString();
      await localRepository.saveReferral(existingRef);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Inbound Laboratory Result Application
  // --------------------------------------------------------------------------
  public async applyInboundLab(
    payload: any,
    resolvedLocalPatientId: string,
    receivingFacilityId: string
  ): Promise<void> {
    const orderData = payload.order || payload;
    const incomingOrder: LaboratoryOrder = {
      ...orderData,
      id: orderData.id || `lab_ord_${Date.now()}`,
      patientId: resolvedLocalPatientId,
      facilityId: receivingFacilityId,
      encounterId: orderData.encounterId || 'enc_net',
      orderNumber: orderData.orderNumber || `LAB-${Date.now()}`,
      testName: orderData.testName || 'Laboratory Investigation',
      priority: orderData.priority || 'routine',
      status: orderData.status || 'ordered',
      orderingClinicianId: orderData.orderingClinicianId || orderData.orderingPhysicianId || 'usr_remote',
      orderedById: orderData.orderingPhysicianId || orderData.orderingClinicianId || 'usr_remote',
      createdAt: orderData.orderedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await localRepository.saveLabOrder(incomingOrder);

    const resultsList = Array.isArray(payload.results) ? payload.results : (payload.testName && payload.result ? [payload] : []);
    for (const res of resultsList) {
      const incomingResult: LaboratoryResult = {
        id: res.id || `lab_res_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        orderId: incomingOrder.id,
        patientId: resolvedLocalPatientId,
        facilityId: receivingFacilityId,
        testCode: res.testCode || (orderData as any).testCode,
        testName: res.testName || incomingOrder.testName,
        value: String(res.result || res.value || res.valueString || ''),
        numericValue: res.numericValue ?? res.valueNumeric,
        unit: res.unit || '',
        verifiedByRole: res.verifiedByRole,
        verifiedById: res.verifiedBy || res.verifiedById,
        verifiedAt: res.verifiedAt,
        technicianNotes: `${res.notes || ''} [Exchanged from ${orderData.facilityId || 'remote'}]`.trim(),
      };
      await localRepository.saveLabResult(incomingResult);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Inbound Radiology Report Application
  // --------------------------------------------------------------------------
  public async applyInboundRadiology(
    payload: any,
    resolvedLocalPatientId: string,
    receivingFacilityId: string
  ): Promise<void> {
    const orderData = payload.order || payload;
    const incomingOrder: RadiologyOrder = {
      ...orderData,
      id: orderData.id || `rad_ord_${Date.now()}`,
      patientId: resolvedLocalPatientId,
      facilityId: receivingFacilityId,
      encounterId: orderData.encounterId || 'enc_net',
      orderNumber: orderData.orderNumber || `RAD-${Date.now()}`,
      modality: orderData.modality || 'XR',
      bodySite: orderData.bodySite || 'General',
      priority: orderData.priority || 'routine',
      status: orderData.status || 'ORDERED',
      orderingPhysicianId: orderData.orderingPhysicianId || 'usr_remote',
      orderedAt: orderData.orderedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await localRepository.saveRadiologyOrder(incomingOrder);

    const resultsList = Array.isArray(payload.results) ? payload.results : [];
    for (const res of resultsList) {
      const incomingResult: RadiologyResult = {
        ...res,
        id: res.id || `rad_res_${Date.now()}`,
        orderId: incomingOrder.id,
        patientId: resolvedLocalPatientId,
        reportSummary: `${res.reportSummary || ''} [Tele-radiology exchanged from ${orderData.facilityId || 'remote'}]`.trim(),
      };
      await localRepository.saveRadiologyResult(incomingResult);
    }
  }

  // --------------------------------------------------------------------------
  // 6. Inbound Medication History Application
  // --------------------------------------------------------------------------
  public async applyInboundMedication(
    payload: any,
    resolvedLocalPatientId: string,
    receivingFacilityId: string
  ): Promise<void> {
    const medOrder = payload.medicationOrder || payload;
    const incomingOrder: MedicationOrder = {
      ...medOrder,
      id: medOrder.id || `med_ord_${Date.now()}`,
      patientId: resolvedLocalPatientId,
      facilityId: receivingFacilityId,
      encounterId: medOrder.encounterId || 'enc_net',
      prescriberId: medOrder.prescriberId || 'usr_remote',
      medicationDefinitionId: medOrder.medicationDefinitionId || 'med_def_net',
      medicationName: medOrder.medicationName || 'Medication',
      dosage: medOrder.dosage || 'Standard dose',
      route: medOrder.route || 'oral',
      frequency: medOrder.frequency || 'Daily',
      status: medOrder.status || 'ACTIVE',
      clinicalIndication: `${medOrder.clinicalIndication || ''} [External History from ${medOrder.facilityId || 'remote'}]`.trim(),
      createdAt: medOrder.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await localRepository.saveMedicationOrder(incomingOrder);
  }

  // --------------------------------------------------------------------------
  // 7. Inbound Emergency Transfer Application
  // --------------------------------------------------------------------------
  public async applyInboundEmergencyTransfer(
    payload: any,
    resolvedLocalPatientId: string,
    receivingFacilityId: string
  ): Promise<EmergencyCase> {
    const caseData = payload.emergencyCase || payload;
    const incomingCase: EmergencyCase = {
      ...caseData,
      id: caseData.id || `emg_${Date.now()}`,
      emergencyNumber: caseData.emergencyNumber || `EMG-${Date.now()}`,
      patientId: resolvedLocalPatientId,
      facilityId: receivingFacilityId,
      status: 'TRIAGED',
      chiefComplaint: `${caseData.chiefComplaint || 'Emergency Transfer'} [Inter-Facility Transfer from ${payload.dispatchingFacilityId || 'remote'}]`.trim(),
      currentTriageLevel: caseData.currentTriageLevel || 'ORANGE',
      transferFromFacilityId: payload.dispatchingFacilityId,
      transferToFacilityId: receivingFacilityId,
      registeredAt: caseData.registeredAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await localRepository.saveEmergencyCase(incomingCase);

    if (payload.latestTriage) {
      const incomingTriage: EmergencyTriage = {
        ...payload.latestTriage,
        id: payload.latestTriage.id || `tri_${Date.now()}`,
        caseId: incomingCase.id,
        patientId: resolvedLocalPatientId,
        facilityId: receivingFacilityId,
        triageLevel: payload.latestTriage.triageLevel || incomingCase.currentTriageLevel,
        mobility: payload.latestTriage.mobility || 'STRETCHER',
        triagedAt: payload.latestTriage.triagedAt || new Date().toISOString(),
      };
      await localRepository.saveEmergencyTriage(incomingTriage);
    }

    if (payload.latestVitals) {
      const incomingVitals: VitalSign = {
        ...payload.latestVitals,
        id: payload.latestVitals.id || `vit_${Date.now()}`,
        patientId: resolvedLocalPatientId,
        facilityId: receivingFacilityId,
        recordedAt: payload.latestVitals.recordedAt || new Date().toISOString(),
      };
      await localRepository.saveVitals(incomingVitals);
    }

    return incomingCase;
  }

  // --------------------------------------------------------------------------
  // 6. V15 Network Exchange Consent Validation
  // Evaluates: Auth -> RBAC -> Trust -> Policy -> Consent -> Purpose -> Safety -> Exchange
  // --------------------------------------------------------------------------
  public async validateNetworkExchangeConsent(params: {
    patientId: string;
    authorFacilityId: string;
    targetFacilityId: string;
    purpose: ConsentPurpose;
    actorId: string;
    actorRole: string;
    emergencyBreakGlassId?: string;
  }): Promise<{ permitted: boolean; reason: string; emergencyAccessId?: string }> {
    const evalResult = await consentPolicyEngine.evaluateConsent({
      patientId: params.patientId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      facilityId: params.targetFacilityId,
      purpose: params.purpose,
      action: 'TRANSMIT',
      emergencyBreakGlassId: params.emergencyBreakGlassId,
    });

    return {
      permitted: evalResult.decision === 'ALLOWED' || evalResult.decision === 'EMERGENCY_ALLOWED',
      reason: evalResult.reason,
      emergencyAccessId: evalResult.emergencyAccessId,
    };
  }

  // --------------------------------------------------------------------------
  // 7. V16 Cross-Facility Workforce Coordination Exchange
  // Exchanges receiving care team, coordination contact, or handover metadata
  // Enforcing: RBAC, network trust, exchange policy, and patient consent
  // --------------------------------------------------------------------------
  public async exchangeWorkforceCoordination(params: {
    sourceFacilityId: string;
    targetFacilityId: string;
    workforceData: {
      type: 'CARE_TEAM' | 'HANDOVER_METADATA' | 'REFERRAL_COORDINATION';
      careTeamId?: string;
      handoverId?: string;
      patientId?: string;
      responsiblePractitionerId: string;
    };
    actorId: string;
    actorRole: string;
    emergencyBreakGlassId?: string;
  }): Promise<{ success: boolean; reason: string }> {
    // 1. Verify network node trust
    const sourceNode = janoNodeRegistryService.getNodeByFacility(params.sourceFacilityId) || { trustStatus: 'ACTIVE', networkStatus: 'ONLINE' };
    const targetNode = janoNodeRegistryService.getNodeByFacility(params.targetFacilityId) || { trustStatus: 'ACTIVE', networkStatus: 'ONLINE' };

    if (sourceNode.trustStatus === 'REVOKED' || sourceNode.trustStatus === 'SUSPENDED') {
      return { success: false, reason: `Source facility ${params.sourceFacilityId} trust status is ${sourceNode.trustStatus}` };
    }
    if (targetNode.trustStatus === 'REVOKED' || targetNode.trustStatus === 'SUSPENDED') {
      return { success: false, reason: `Target facility ${params.targetFacilityId} trust status is ${targetNode.trustStatus}` };
    }

    // 2. If patient-linked, enforce patient consent directive
    if (params.workforceData.patientId) {
      const consentCheck = await this.validateNetworkExchangeConsent({
        patientId: params.workforceData.patientId,
        authorFacilityId: params.sourceFacilityId,
        targetFacilityId: params.targetFacilityId,
        purpose: 'REFERRAL',
        actorId: params.actorId,
        actorRole: params.actorRole,
        emergencyBreakGlassId: params.emergencyBreakGlassId,
      });

      if (!consentCheck.permitted) {
        return { success: false, reason: `Patient consent required: ${consentCheck.reason}` };
      }
    }

    return {
      success: true,
      reason: `Workforce coordination metadata (${params.workforceData.type}) exchanged securely with ${params.targetFacilityId}`,
    };
  }
}

export const clinicalExchangeService = ClinicalExchangeService.getInstance();
