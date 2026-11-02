/**
 * Jano Health - Clinical Core V2: Authoritative Encounter Service
 * 
 * Manages the canonical clinical transaction lifecycle:
 * AUTHENTICATED PRINCIPAL 
 *   -> CAPABILITY AUTHORIZATION 
 *   -> FACILITY/TENANT ISOLATION 
 *   -> PATIENT STATUS VERIFICATION (protects deceased/merged charts)
 *   -> DOMAIN & ENCOUNTER NUMBER GENERATION (offline-safe deterministic)
 *   -> ATOMIC LOCAL TRANSACTION 
 *   -> IMMUTABLE DOMAIN EVENT (with SHA-256 tamper-evident integrity)
 *   -> AUDIT LEDGER RECORDING
 *   -> LOCAL STATE REPOSITORY PERSISTENCE
 *   -> OFFLINE QUEUE DISPATCH (never marks SYNCED locally without server ack)
 */

import {
  Encounter,
  EncounterPriority,
  EncounterStatus,
  EncounterType,
  RoleType,
} from '../../domain/types';
import { generateEntityId, generateEncounterNumber } from '../../domain/identifiers';
import { canUserPerform } from '../../domain/permissions';
import { localDb } from '../storage/localDatabase';
import { localRepository } from '../storage/localRepository';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { AuthenticatedPrincipal } from './patientService';

export class EncounterLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncounterLifecycleError';
  }
}

export class PatientStatusViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatientStatusViolationError';
  }
}

export class FacilitySecurityViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacilitySecurityViolationError';
  }
}

export interface CreateEncounterInput {
  patientId: string;
  facilityId: string;
  encounterType: EncounterType;
  chiefComplaint: string;
  priority?: EncounterPriority;
  departmentId?: string;
  servicePoint?: string;
  roomWard?: string;
  reasonForVisit?: string;
  historySummary?: string;
  clinicalContext?: string;
  appointmentId?: string;
  referralId?: string;
  attendingClinicianId?: string;
  initialStatus?: EncounterStatus;
}

export class EncounterService {
  private static instance: EncounterService;

  private constructor() {}

  public static getInstance(): EncounterService {
    if (!EncounterService.instance) {
      EncounterService.instance = new EncounterService();
    }
    return EncounterService.instance;
  }

  /**
   * Evaluates whether an encounter status transition is clinically valid.
   */
  public isValidTransition(currentStatus: EncounterStatus, nextStatus: EncounterStatus): boolean {
    const current = currentStatus.toUpperCase() as EncounterStatus;
    const next = nextStatus.toUpperCase() as EncounterStatus;

    if (current === next) return true;

    // Terminal states cannot transition further
    if (current === 'SIGNED' || current === 'CANCELLED') {
      return false;
    }

    const transitions: Record<string, string[]> = {
      PLANNED: ['CHECKED_IN', 'IN_PROGRESS', 'CANCELLED'],
      CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['SIGNED', 'IN_PROGRESS', 'CANCELLED'],
    };

    const allowed = transitions[current] || [];
    return allowed.includes(next);
  }

  /**
   * Creates a new clinical encounter under the authoritative pipeline.
   */
  public async createEncounter(
    input: CreateEncounterInput,
    principal: AuthenticatedPrincipal
  ): Promise<Encounter> {
    // 1. Authorization: Capability check
    if (
      !canUserPerform(
        { role: principal.role },
        'encounter.create'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'encounter:create'
      )
    ) {
      throw new Error(
        `Security Exception: Role [${principal.role}] is not authorized to create encounters.`
      );
    }

    // 2. Facility Boundary Check
    if (principal.facilityId !== input.facilityId && principal.role !== 'system_administrator') {
      throw new FacilitySecurityViolationError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot create encounter for facility [${input.facilityId}].`
      );
    }

    // 3. Patient Existence & Status Protection
    const patient = localDb.getPatientById(input.patientId) || (await localRepository.getPatient(input.patientId));
    if (!patient) {
      throw new Error(`Patient with ID [${input.patientId}] does not exist.`);
    }

    if (patient.patientStatus === 'DECEASED') {
      throw new PatientStatusViolationError(
        `Clinical Protection Violation: Cannot initiate encounter for deceased patient [${patient.mrn}].`
      );
    }

    if (patient.patientStatus === 'MERGED') {
      throw new PatientStatusViolationError(
        `Clinical Protection Violation: Patient record [${patient.mrn}] has been merged into survivor chart [${patient.mergedIntoPatientId || 'unknown'}]. Open encounter on surviving chart.`
      );
    }

    // 4. Domain Validation
    if (!input.chiefComplaint || input.chiefComplaint.trim().length === 0) {
      throw new Error('Chief complaint is required to open a clinical encounter.');
    }

    // 5. Offline-Safe Deterministic Encounter Number
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';
    const encounterNumber = generateEncounterNumber(input.facilityId, deviceId);
    const encounterId = generateEntityId('enc');
    const nowIso = new Date().toISOString();

    const status = input.initialStatus || 'IN_PROGRESS';
    const attendingClinicianId = input.attendingClinicianId || principal.id;

    // 6. Assemble Aggregate
    const encounter: Encounter = {
      id: encounterId,
      encounterNumber,
      patientId: input.patientId,
      facilityId: input.facilityId,
      encounterType: input.encounterType,
      type: input.encounterType,
      status,
      priority: input.priority || 'routine',
      attendingClinicianId,
      attendingClinicianName: principal.fullName,
      attendingClinicianRole: principal.role,
      clinicianId: attendingClinicianId,
      departmentId: input.departmentId,
      servicePoint: input.servicePoint,
      roomWard: input.roomWard,
      chiefComplaint: input.chiefComplaint.trim(),
      reasonForVisit: input.reasonForVisit?.trim(),
      historySummary: input.historySummary?.trim(),
      clinicalContext: input.clinicalContext?.trim(),
      appointmentId: input.appointmentId,
      referralId: input.referralId,
      source: 'clinical_workspace',
      provenance: `Initiated at ${input.facilityId} by ${principal.fullName} (${principal.role})`,
      createdAt: nowIso,
      startedAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      syncStatus: 'LOCAL_ONLY', // Never SYNCED locally without server confirmation
    };

    // 7. Execute Atomic Local Transaction
    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<Encounter>({
      actionName: 'CREATE_ENCOUNTER',
      resourceType: 'Encounter',
      resourceId: encounter.id,
      targetStore: 'encounters',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: encounter,
        eventType: 'EncounterCreated',
        aggregateId: encounter.id,
        aggregateType: 'Encounter',
        version: 1,
        auditAction: 'ENCOUNTER_CREATED',
      }),
    });

    // Also synchronize local storage snapshot
    await localDb.saveEncounter(committed);
    return committed;
  }

  /**
   * Transitions an encounter's lifecycle status with state machine enforcement.
   */
  public async transitionEncounterStatus(
    encounterId: string,
    nextStatus: EncounterStatus,
    reason: string | undefined,
    principal: AuthenticatedPrincipal
  ): Promise<Encounter> {
    const encounter = (await localRepository.getEncounter(encounterId)) || localDb.getEncounters().find((e) => e.id === encounterId);
    if (!encounter) {
      throw new Error(`Encounter with ID [${encounterId}] not found.`);
    }

    // Facility Boundary Check
    if (principal.facilityId !== encounter.facilityId && principal.role !== 'system_administrator') {
      throw new FacilitySecurityViolationError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot modify encounter belonging to facility [${encounter.facilityId}].`
      );
    }

    // Terminal Status Protection
    const currentUpper = encounter.status.toUpperCase();
    if (currentUpper === 'SIGNED' || currentUpper === 'CANCELLED') {
      throw new EncounterLifecycleError(
        `Encounter [${encounter.encounterNumber || encounter.id}] is in terminal state [${encounter.status}] and cannot be modified or transitioned.`
      );
    }

    // State machine transition validation
    if (!this.isValidTransition(encounter.status, nextStatus)) {
      throw new EncounterLifecycleError(
        `Illegal State Transition: Cannot transition encounter from [${encounter.status}] to [${nextStatus}].`
      );
    }

    // Role checks for specific transitions
    if (nextStatus.toUpperCase() === 'SIGNED') {
      // Signing requires physician, health officer, or supervisor capability
      if (
        !canUserPerform(
          { role: principal.role },
          'encounter.sign'
        ) &&
        !canUserPerform(
          { role: principal.role },
          'clinical:notes_write'
        )
      ) {
        throw new Error(
          `Security Exception: Role [${principal.role}] is not authorized to finalize and sign clinical encounters.`
        );
      }
    }

    if (nextStatus.toUpperCase() === 'CANCELLED') {
      if (!reason || reason.trim().length < 3) {
        throw new Error('Clinical cancellation reason is required to cancel an encounter.');
      }
    }

    const nowIso = new Date().toISOString();
    const nextVersion = (encounter.version || 1) + 1;
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const updatedEncounter: Encounter = {
      ...encounter,
      status: nextStatus,
      version: nextVersion,
      updatedAt: nowIso,
      completedAt: nextStatus.toUpperCase() === 'COMPLETED' ? nowIso : encounter.completedAt,
      endedAt: nextStatus.toUpperCase() === 'COMPLETED' ? nowIso : encounter.endedAt,
      signedAt: nextStatus.toUpperCase() === 'SIGNED' ? nowIso : encounter.signedAt,
      signedById: nextStatus.toUpperCase() === 'SIGNED' ? principal.id : encounter.signedById,
      signedByName: nextStatus.toUpperCase() === 'SIGNED' ? principal.fullName : encounter.signedByName,
      signedByRole: nextStatus.toUpperCase() === 'SIGNED' ? principal.role : encounter.signedByRole,
      cancelledAt: nextStatus.toUpperCase() === 'CANCELLED' ? nowIso : encounter.cancelledAt,
      cancellationReason: nextStatus.toUpperCase() === 'CANCELLED' ? reason?.trim() : encounter.cancellationReason,
      cancelledById: nextStatus.toUpperCase() === 'CANCELLED' ? principal.id : encounter.cancelledById,
    };

    let domainEventType: any = 'EncounterUpdated';
    let auditAction = `ENCOUNTER_STATUS_${nextStatus.toUpperCase()}`;

    if (nextStatus.toUpperCase() === 'IN_PROGRESS') {
      domainEventType = 'EncounterStarted';
    } else if (nextStatus.toUpperCase() === 'COMPLETED') {
      domainEventType = 'EncounterCompleted';
    } else if (nextStatus.toUpperCase() === 'SIGNED') {
      domainEventType = 'EncounterSigned';
    } else if (nextStatus.toUpperCase() === 'CANCELLED') {
      domainEventType = 'EncounterCancelled';
    }

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<Encounter>({
      actionName: `TRANSITION_ENCOUNTER_${nextStatus.toUpperCase()}`,
      resourceType: 'Encounter',
      resourceId: encounter.id,
      targetStore: 'encounters',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: updatedEncounter,
        eventType: domainEventType,
        aggregateId: updatedEncounter.id,
        aggregateType: 'Encounter',
        version: nextVersion,
        auditAction,
        previousState: encounter as unknown as Record<string, unknown>,
      }),
    });

    await localDb.saveEncounter(committed);
    return committed;
  }

  /**
   * Updates clinical context or details of an active encounter with optimistic locking.
   */
  public async updateEncounter(
    encounterId: string,
    updates: Partial<Encounter>,
    principal: AuthenticatedPrincipal
  ): Promise<Encounter> {
    const encounter = (await localRepository.getEncounter(encounterId)) || localDb.getEncounters().find((e) => e.id === encounterId);
    if (!encounter) {
      throw new Error(`Encounter with ID [${encounterId}] not found.`);
    }

    if (principal.facilityId !== encounter.facilityId && principal.role !== 'system_administrator') {
      throw new FacilitySecurityViolationError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot modify encounter belonging to facility [${encounter.facilityId}].`
      );
    }

    const currentUpper = encounter.status.toUpperCase();
    if (currentUpper === 'SIGNED' || currentUpper === 'CANCELLED') {
      throw new EncounterLifecycleError(
        `Encounter [${encounter.encounterNumber || encounter.id}] is locked in status [${encounter.status}] and cannot be modified.`
      );
    }

    // Optimistic concurrency check if version passed
    if (updates.version !== undefined && updates.version !== encounter.version) {
      throw new Error(
        `Concurrency Conflict: Expected version [${encounter.version}], but got [${updates.version}]. Reload latest encounter record.`
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = (encounter.version || 1) + 1;
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const updatedEncounter: Encounter = {
      ...encounter,
      ...updates,
      id: encounter.id,
      patientId: encounter.patientId, // Immutable
      facilityId: encounter.facilityId, // Immutable
      encounterNumber: encounter.encounterNumber, // Immutable
      version: nextVersion,
      updatedAt: nowIso,
    };

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<Encounter>({
      actionName: 'UPDATE_ENCOUNTER',
      resourceType: 'Encounter',
      resourceId: encounter.id,
      targetStore: 'encounters',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: updatedEncounter,
        eventType: 'EncounterUpdated',
        aggregateId: updatedEncounter.id,
        aggregateType: 'Encounter',
        version: nextVersion,
        auditAction: 'ENCOUNTER_UPDATED',
        previousState: encounter as unknown as Record<string, unknown>,
      }),
    });

    await localDb.saveEncounter(committed);
    return committed;
  }

  /**
   * Queries encounters for a patient.
   */
  public async getPatientEncounters(patientId: string, facilityId?: string): Promise<Encounter[]> {
    const list = localDb.getEncounters(patientId);
    if (facilityId) {
      return list.filter((e) => e.facilityId === facilityId);
    }
    return list;
  }

  /**
   * Retrieves single encounter by ID or encounter number.
   */
  public async getEncounter(idOrNumber: string): Promise<Encounter | undefined> {
    const all = localDb.getEncounters();
    return all.find(
      (e) =>
        e.id === idOrNumber ||
        (e.encounterNumber && e.encounterNumber.toLowerCase() === idOrNumber.toLowerCase())
    );
  }
}

export const encounterService = EncounterService.getInstance();
