/**
 * Jano Health - Clinical Referral Service (Clinical Core V7)
 * 
 * Orchestrates cross-facility clinical referral workflows, closed-loop consultation tracking,
 * offline deterministic referral numbering, emergency transfer coordination, and authoritative
 * outcome documentation.
 * 
 * Clinical & Architectural Principles:
 * 1. Offline-First Determinism: Referral numbers and IDs are generated locally with Luhn-36 checksums
 *    without requiring cloud or central server connectivity.
 * 2. Closed-Loop Accountability: Every referral maintains complete lifecycle state transitions
 *    (Draft -> Submitted -> Sent -> Received -> Under Review -> Accepted/Rejected -> Scheduled -> In Progress -> Completed -> Closed).
 * 3. Bidirectional Care Collaboration: Encapsulates feedback loops (ReferralOutcome) and clinical dialogues
 *    (ReferralCommunication) between referring primary facilities and secondary/tertiary hospitals.
 * 4. Granular RBAC & Tamper-Evident Ledgers: All mutations execute inside atomic clinical transactions
 *    guaranteeing event sourcing, audit logging, and offline synchronization queues.
 */

import {
  Referral,
  ReferralStatus,
  ReferralPriority,
  ReferralOutcome,
  ReferralCommunication,
  ReferralStatusTransition,
  VALID_REFERRAL_TRANSITIONS,
} from '../../domain/referralTypes';
import {
  generateReferralId,
  generateReferralOutcomeId,
  generateReferralCommunicationId,
  generateReferralNumber,
} from '../../domain/referralIdentifiers';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { localRepository } from '../storage/localRepository';

export interface CreateReferralParams {
  patientId: string;
  encounterId?: string;
  destinationFacilityId: string;
  destinationFacilityName: string;
  destinationDepartment?: string;
  priority: ReferralPriority;
  referralType: 'OUTPATIENT_SPECIALIST' | 'EMERGENCY_TRANSFER' | 'INPATIENT_TRANSFER' | 'DIAGNOSTIC_EVALUATION' | 'SURGICAL_CONSULTATION' | 'OBSTETRIC_EMERGENCY' | 'COMMUNITY_FOLLOWUP';
  primaryReason: string;
  clinicalSummary: string;
  provisionalDiagnosis?: string;
  icdCode?: string;
  transportationNeed?: 'AMBULANCE' | 'ROUTINE_TRANSPORT' | 'PATIENT_ARRANGED' | 'AIR_AMBULANCE' | 'NONE';
  oxygenRequired?: boolean;
  ivAccessRequired?: boolean;
  attendantRequired?: boolean;
  notes?: string;
  immediateSubmission?: boolean;
}

export interface AcceptReferralParams {
  notes?: string;
  scheduledTime?: string;
  assignedProviderName?: string;
  department?: string;
}

export interface RecordReferralOutcomeParams {
  encounterId?: string;
  consultantId: string;
  consultantName: string;
  consultantRole: string;
  receivingFacilityId: string;
  receivingFacilityName: string;
  findings: string;
  treatmentSummary: string;
  finalDiagnosis?: string;
  icdCode?: string;
  disposition: 'ADMITTED' | 'DISCHARGED_HOME' | 'REFERRED_HIGHER_LEVEL' | 'RETURN_TO_REFERRING_FACILITY' | 'DECEASED' | 'LEFT_AGAINST_MEDICAL_ADVICE';
  followUpPlan: string;
  medicationsPrescribed?: Array<{
    name: string;
    dosage: string;
    route: string;
    frequency: string;
    duration: string;
  }>;
  closeLoopImmediately?: boolean;
}

export class ReferralService {
  private static instance: ReferralService;

  private constructor() {}

  public static getInstance(): ReferralService {
    if (!ReferralService.instance) {
      ReferralService.instance = new ReferralService();
    }
    return ReferralService.instance;
  }

  /**
   * Helper to validate state transitions according to canonical referral state machine.
   */
  private assertValidTransition(currentStatus: ReferralStatus, targetStatus: ReferralStatus): void {
    const allowed = VALID_REFERRAL_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new Error(
        `Invalid Referral State Transition: Cannot transition referral from [${currentStatus}] to [${targetStatus}]. Allowed: [${allowed.join(', ')}]`
      );
    }
  }

  /**
   * Initiates a new Clinical Referral.
   */
  public async createReferral(params: CreateReferralParams, actor: ClinicalActorContext): Promise<Referral> {
    const referralId = generateReferralId();
    const now = new Date().toISOString();
    const referralNumber = generateReferralNumber(actor.facilityId, actor.deviceId, new Date());
    const initialStatus: ReferralStatus = params.immediateSubmission ? 'SUBMITTED' : 'DRAFT';

    return clinicalTransaction.execute<Referral>({
      actionName: params.immediateSubmission ? 'SUBMIT_REFERRAL' : 'CREATE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: params.immediateSubmission ? 'referral:submit' : 'referral:create',
      validate: () => {
        if (!params.patientId) throw new Error('Referral requires a valid patient ID');
        if (!params.destinationFacilityId) throw new Error('Referral requires a destination facility');
        if (!params.primaryReason || params.primaryReason.trim().length === 0) {
          throw new Error('Referral requires a primary clinical reason');
        }
        if (params.destinationFacilityId === actor.facilityId) {
          throw new Error('Destination facility cannot be identical to referring facility');
        }
      },
      buildEntity: async () => {
        const transition: ReferralStatusTransition = {
          fromStatus: 'DRAFT',
          toStatus: initialStatus,
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: params.immediateSubmission ? 'Immediate clinical submission' : 'Draft initiated',
        };

        const referral: Referral = {
          id: referralId,
          referralNumber,
          patientId: params.patientId,
          encounterId: params.encounterId,
          sourceFacilityId: actor.facilityId,
          fromFacilityId: actor.facilityId,
          destinationFacilityId: params.destinationFacilityId,
          toFacilityId: params.destinationFacilityId,
          destinationFacilityName: params.destinationFacilityName,
          destinationDepartment: params.destinationDepartment,
          referringProviderId: actor.userId,
          referringProviderName: actor.userName,
          status: initialStatus,
          priority: params.priority,
          referralType: params.referralType,
          primaryReason: params.primaryReason,
          clinicalSummary: params.clinicalSummary,
          provisionalDiagnosis: params.provisionalDiagnosis,
          icdCode: params.icdCode,
          transportationNeed: params.transportationNeed || 'ROUTINE_TRANSPORT',
          oxygenRequired: params.oxygenRequired ?? false,
          ivAccessRequired: params.ivAccessRequired ?? false,
          attendantRequired: params.attendantRequired ?? false,
          notes: params.notes,
          statusHistory: [transition],
          submittedAt: params.immediateSubmission ? now : undefined,
          createdAt: now,
          updatedAt: now,
          version: 1,
        };

        return {
          entity: referral,
          eventType: params.immediateSubmission ? 'REFERRAL_SUBMITTED' : 'REFERRAL_CREATED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: 1,
          auditAction: params.immediateSubmission ? 'REFERRAL_SUBMITTED' : 'REFERRAL_CREATED',
        };
      },
    });
  }

  /**
   * Modifies an existing DRAFT referral.
   */
  public async updateReferral(referralId: string, updates: Partial<Referral>, actor: ClinicalActorContext): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) {
      throw new Error(`Referral [${referralId}] not found`);
    }
    if (existing.status !== 'DRAFT') {
      throw new Error(`Cannot update referral in [${existing.status}] status. Only DRAFT referrals can be edited.`);
    }

    return clinicalTransaction.execute<Referral>({
      actionName: 'UPDATE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:update',
      validate: () => {
        if (updates.primaryReason !== undefined && updates.primaryReason.trim().length === 0) {
          throw new Error('Primary reason cannot be blank');
        }
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const updated: Referral = {
          ...existing,
          ...updates,
          id: existing.id,
          referralNumber: existing.referralNumber,
          patientId: existing.patientId,
          sourceFacilityId: existing.sourceFacilityId,
          fromFacilityId: existing.fromFacilityId,
          destinationFacilityId: updates.destinationFacilityId || existing.destinationFacilityId,
          toFacilityId: updates.destinationFacilityId || existing.toFacilityId,
          destinationFacilityName: updates.destinationFacilityName || existing.destinationFacilityName,
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_UPDATED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_UPDATED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Submits a DRAFT referral into the formal referral queue.
   */
  public async submitReferral(referralId: string, actor: ClinicalActorContext, notes?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'SUBMITTED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'SUBMIT_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:submit',
      validate: () => {
        if (!existing.primaryReason) throw new Error('Referral missing primary clinical reason');
        if (!existing.clinicalSummary) throw new Error('Referral missing clinical summary');
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'SUBMITTED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || 'Submitted for inter-facility dispatch',
        };

        const updated: Referral = {
          ...existing,
          status: 'SUBMITTED',
          submittedAt: existing.submittedAt || now,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_SUBMITTED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_SUBMITTED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Marks a referral as SENT / Dispatched from the referring facility.
   */
  public async sendReferral(referralId: string, actor: ClinicalActorContext, notes?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'SENT');

    return clinicalTransaction.execute<Referral>({
      actionName: 'SEND_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:submit',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'SENT',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || 'Dispatched to destination facility',
        };

        const updated: Referral = {
          ...existing,
          status: 'SENT',
          dispatchedAt: now,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_SENT',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_SENT',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Acknowledges receipt of patient or record at the receiving facility.
   */
  public async receiveReferral(referralId: string, actor: ClinicalActorContext, notes?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'RECEIVED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'RECEIVE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:accept',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'RECEIVED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || 'Patient / requisition arrived at receiving facility',
        };

        const updated: Referral = {
          ...existing,
          status: 'RECEIVED',
          receivedAt: now,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_RECEIVED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_RECEIVED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Places referral UNDER_REVIEW by receiving triage or clinical specialist.
   */
  public async reviewReferral(referralId: string, actor: ClinicalActorContext, notes?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'UNDER_REVIEW');

    return clinicalTransaction.execute<Referral>({
      actionName: 'REVIEW_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:accept',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'UNDER_REVIEW',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || 'Clinical specialist review in progress',
        };

        const updated: Referral = {
          ...existing,
          status: 'UNDER_REVIEW',
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_UNDER_REVIEW',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_UNDER_REVIEW',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Accepts the referral at the destination facility.
   */
  public async acceptReferral(
    referralId: string,
    actor: ClinicalActorContext,
    params?: AcceptReferralParams
  ): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'ACCEPTED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'ACCEPT_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:accept',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'ACCEPTED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: params?.notes || 'Referral clinical acceptance granted',
        };

        const updated: Referral = {
          ...existing,
          status: 'ACCEPTED',
          acceptedAt: now,
          destinationDepartment: params?.department || existing.destinationDepartment,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_ACCEPTED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_ACCEPTED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Rejects the referral with mandatory clinical rationale.
   */
  public async rejectReferral(
    referralId: string,
    actor: ClinicalActorContext,
    rejectionReason: string,
    clinicalRationale: string
  ): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'REJECTED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'REJECT_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:reject',
      validate: () => {
        if (!rejectionReason || rejectionReason.trim().length === 0) {
          throw new Error('Referral rejection requires a documented reason');
        }
        if (!clinicalRationale || clinicalRationale.trim().length === 0) {
          throw new Error('Referral rejection requires documented clinical rationale');
        }
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'REJECTED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: `Rejection: ${rejectionReason}. Rationale: ${clinicalRationale}`,
        };

        const updated: Referral = {
          ...existing,
          status: 'REJECTED',
          rejectedAt: now,
          rejectionReason,
          rejectionNotes: clinicalRationale,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_REJECTED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_REJECTED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Requests additional clinical documentation from the referring facility.
   */
  public async requestInformation(
    referralId: string,
    actor: ClinicalActorContext,
    message: string
  ): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'INFORMATION_REQUESTED');

    // Create the ReferralCommunication first
    await this.addCommunication(referralId, actor, message, true, 'Information Requested by Receiving Team');

    return clinicalTransaction.execute<Referral>({
      actionName: 'REQUEST_REFERRAL_INFORMATION',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:request_information',
      validate: () => {
        if (!message || message.trim().length === 0) {
          throw new Error('Information request message cannot be empty');
        }
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'INFORMATION_REQUESTED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: `Information Requested: ${message}`,
        };

        const updated: Referral = {
          ...existing,
          status: 'INFORMATION_REQUESTED',
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_REQUESTED_INFORMATION',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_REQUESTED_INFORMATION',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Coordinates and schedules intake / appointment time for the referred patient.
   */
  public async scheduleReferral(
    referralId: string,
    actor: ClinicalActorContext,
    scheduledTime: string,
    department?: string,
    notes?: string
  ): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'SCHEDULED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'SCHEDULE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:schedule',
      validate: () => {
        if (!scheduledTime) throw new Error('Scheduled referral requires appointment date/time');
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'SCHEDULED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || `Scheduled for intake: ${scheduledTime}`,
        };

        const updated: Referral = {
          ...existing,
          status: 'SCHEDULED',
          scheduledTime,
          destinationDepartment: department || existing.destinationDepartment,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_SCHEDULED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_SCHEDULED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Transitions referral to IN_PROGRESS upon encounter intake.
   */
  public async startCare(referralId: string, actor: ClinicalActorContext, encounterId?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'IN_PROGRESS');

    return clinicalTransaction.execute<Referral>({
      actionName: 'START_REFERRAL_CARE',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:accept',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'IN_PROGRESS',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: 'Specialist consultation / emergency intake actively underway',
        };

        const updated: Referral = {
          ...existing,
          status: 'IN_PROGRESS',
          encounterId: encounterId || existing.encounterId,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_STARTED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_STARTED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Records authoritative referral outcome, closing the clinical feedback loop.
   */
  public async recordOutcome(
    referralId: string,
    params: RecordReferralOutcomeParams,
    actor: ClinicalActorContext
  ): Promise<{ referral: Referral; outcome: ReferralOutcome }> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'COMPLETED');

    const outcomeId = generateReferralOutcomeId();
    const now = new Date().toISOString();

    // 1. Create ReferralOutcome aggregate via clinical transaction
    const outcome = await clinicalTransaction.execute<ReferralOutcome>({
      actionName: 'RECORD_REFERRAL_OUTCOME',
      resourceType: 'ReferralOutcome',
      resourceId: outcomeId,
      targetStore: 'referralOutcomes',
      actor,
      requiredPermission: 'referral:outcome_write',
      validate: () => {
        if (!params.findings || params.findings.trim().length === 0) {
          throw new Error('Referral outcome requires documented clinical findings');
        }
        if (!params.treatmentSummary || params.treatmentSummary.trim().length === 0) {
          throw new Error('Referral outcome requires a treatment summary');
        }
        if (!params.followUpPlan || params.followUpPlan.trim().length === 0) {
          throw new Error('Referral outcome requires a clear follow-up plan');
        }
      },
      buildEntity: async () => {
        const entity: ReferralOutcome = {
          id: outcomeId,
          referralId,
          patientId: existing.patientId,
          encounterId: params.encounterId || existing.encounterId,
          consultantId: params.consultantId,
          consultantName: params.consultantName,
          consultantRole: params.consultantRole,
          receivingFacilityId: params.receivingFacilityId,
          receivingFacilityName: params.receivingFacilityName,
          completedAt: now,
          findings: params.findings,
          treatmentSummary: params.treatmentSummary,
          finalDiagnosis: params.finalDiagnosis,
          icdCode: params.icdCode,
          disposition: params.disposition,
          followUpPlan: params.followUpPlan,
          medicationsPrescribed: params.medicationsPrescribed,
          version: 1,
        };

        return {
          entity,
          eventType: 'REFERRAL_OUTCOME_CREATED',
          aggregateId: outcomeId,
          aggregateType: 'ReferralOutcome',
          version: 1,
          auditAction: 'REFERRAL_OUTCOME_RECORDED',
        };
      },
    });

    // 2. Transition referral to COMPLETED (or CLOSED if loop is immediately closed)
    const targetStatus: ReferralStatus = params.closeLoopImmediately ? 'CLOSED' : 'COMPLETED';

    const referral = await clinicalTransaction.execute<Referral>({
      actionName: params.closeLoopImmediately ? 'CLOSE_REFERRAL' : 'COMPLETE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: params.closeLoopImmediately ? 'referral:close' : 'referral:complete',
      validate: () => {},
      buildEntity: async () => {
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: targetStatus,
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: `Consultation documented by ${params.consultantName}. Disposition: ${params.disposition}`,
        };

        const updated: Referral = {
          ...existing,
          status: targetStatus,
          outcomeId,
          completedAt: now,
          closedAt: params.closeLoopImmediately ? now : undefined,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: params.closeLoopImmediately ? 'REFERRAL_CLOSED' : 'REFERRAL_COMPLETED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: params.closeLoopImmediately ? 'REFERRAL_CLOSED' : 'REFERRAL_COMPLETED',
          previousState: existing,
        };
      },
    });

    return { referral, outcome };
  }

  /**
   * Closes the referral loop after referring clinician reviews the outcome.
   */
  public async closeReferral(referralId: string, actor: ClinicalActorContext, notes?: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'CLOSED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'CLOSE_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:close',
      validate: () => {},
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'CLOSED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: notes || 'Closed-loop handoff finalized and verified by referring clinician',
        };

        const updated: Referral = {
          ...existing,
          status: 'CLOSED',
          closedAt: now,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_CLOSED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_CLOSED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Voids or cancels a referral.
   */
  public async cancelReferral(referralId: string, actor: ClinicalActorContext, reason: string): Promise<Referral> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);
    this.assertValidTransition(existing.status, 'CANCELLED');

    return clinicalTransaction.execute<Referral>({
      actionName: 'CANCEL_REFERRAL',
      resourceType: 'Referral',
      resourceId: referralId,
      targetStore: 'referrals',
      actor,
      requiredPermission: 'referral:cancel',
      validate: () => {
        if (!reason || reason.trim().length === 0) {
          throw new Error('Referral cancellation requires a documented clinical reason');
        }
      },
      buildEntity: async () => {
        const now = new Date().toISOString();
        const transition: ReferralStatusTransition = {
          fromStatus: existing.status,
          toStatus: 'CANCELLED',
          timestamp: now,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.userRole,
          facilityId: actor.facilityId,
          notes: `Cancelled: ${reason}`,
        };

        const updated: Referral = {
          ...existing,
          status: 'CANCELLED',
          notes: existing.notes ? `${existing.notes} [Cancelled: ${reason}]` : `Cancelled: ${reason}`,
          statusHistory: [...(existing.statusHistory || []), transition],
          updatedAt: now,
          version: (existing.version || 1) + 1,
        };

        return {
          entity: updated,
          eventType: 'REFERRAL_CANCELLED',
          aggregateId: referralId,
          aggregateType: 'Referral',
          version: updated.version,
          auditAction: 'REFERRAL_CANCELLED',
          previousState: existing,
        };
      },
    });
  }

  /**
   * Adds an inter-facility clinical dialogue communication message.
   */
  public async addCommunication(
    referralId: string,
    actor: ClinicalActorContext,
    message: string,
    urgent: boolean = false,
    subject?: string
  ): Promise<ReferralCommunication> {
    const existing = await localRepository.getReferral(referralId);
    if (!existing) throw new Error(`Referral [${referralId}] not found`);

    const commId = generateReferralCommunicationId();
    const now = new Date().toISOString();
    const recipientFacilityId =
      actor.facilityId === existing.sourceFacilityId
        ? existing.destinationFacilityId
        : existing.sourceFacilityId;

    return clinicalTransaction.execute<ReferralCommunication>({
      actionName: 'ADD_REFERRAL_COMMUNICATION',
      resourceType: 'ReferralCommunication',
      resourceId: commId,
      targetStore: 'referralCommunications',
      actor,
      requiredPermission: 'referral:update',
      validate: () => {
        if (!message || message.trim().length === 0) {
          throw new Error('Communication message cannot be empty');
        }
      },
      buildEntity: async () => {
        const entity: ReferralCommunication = {
          id: commId,
          referralId,
          senderId: actor.userId,
          senderName: actor.userName,
          senderFacilityId: actor.facilityId,
          recipientFacilityId,
          timestamp: now,
          message,
          urgent,
          subject,
        };

        return {
          entity,
          eventType: 'REFERRAL_COMMUNICATION_CREATED',
          aggregateId: commId,
          aggregateType: 'ReferralCommunication',
          version: 1,
          auditAction: 'REFERRAL_COMMUNICATION_POSTED',
        };
      },
    });
  }

  /**
   * Queries referrals by facility and optional patient ID.
   */
  public async getReferrals(facilityId?: string, patientId?: string): Promise<Referral[]> {
    return localRepository.getReferrals(facilityId, patientId);
  }

  /**
   * Queries referral by ID or deterministic referral number.
   */
  public async getReferralById(idOrNumber: string): Promise<Referral | undefined> {
    return localRepository.getReferral(idOrNumber);
  }

  /**
   * Queries referral outcome for a referral.
   */
  public async getReferralOutcome(referralId: string): Promise<ReferralOutcome | undefined> {
    if (localRepository.getReferralOutcomes) {
      const outcomes = await localRepository.getReferralOutcomes(referralId);
      return outcomes[0];
    }
    return undefined;
  }

  /**
   * Queries communications for a referral.
   */
  public async getReferralCommunications(referralId: string): Promise<ReferralCommunication[]> {
    if (localRepository.getReferralCommunications) {
      return localRepository.getReferralCommunications(referralId);
    }
    return [];
  }
}

export const referralService = ReferralService.getInstance();
