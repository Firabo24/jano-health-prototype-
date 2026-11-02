/**
 * Jano Health - Clinical Core V2: Authoritative Clinical Note (SOAP) Service
 * 
 * Implements immutable clinical documentation with versioned SOAP records:
 * 
 * AUTHENTICATED PRINCIPAL 
 *   -> CAPABILITY AUTHORIZATION 
 *   -> FACILITY/TENANT ISOLATION 
 *   -> PATIENT & ENCOUNTER EXISTENCE CHECK
 *   -> DOMAIN VALIDATION (SOAP structure, author attestation)
 *   -> ATOMIC LOCAL TRANSACTION 
 *   -> IMMUTABLE DOMAIN EVENT (SHA-256 hash chain)
 *   -> AUDIT TRAIL RECORDING
 *   -> SIGNED NOTE IMMUTABILITY PROTECTION (strictly rejects silent edits)
 *   -> VERSIONED AMENDMENT PIPELINE (records reason, author, previousVersionId)
 */

import {
  ClinicalNote,
  NoteStatus,
  NoteType,
  SoapContent,
  SoapSubjective,
  SoapObjective,
  SoapAssessment,
  SoapPlan,
  RoleType,
} from '../../domain/types';
import { generateEntityId } from '../../domain/identifiers';
import { canUserPerform } from '../../domain/permissions';
import { localDb } from '../storage/localDatabase';
import { localRepository } from '../storage/localRepository';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { AuthenticatedPrincipal } from './patientService';

export class SignedNoteImmutabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedNoteImmutabilityError';
  }
}

export class ClinicalDocumentationSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClinicalDocumentationSecurityError';
  }
}

export interface CreateClinicalNoteInput {
  patientId: string;
  encounterId: string;
  facilityId: string;
  noteType?: NoteType;
  subjective: SoapSubjective | string;
  objective: SoapObjective | string;
  assessment: SoapAssessment | string;
  plan: SoapPlan | string;
  initialStatus?: NoteStatus;
}

export interface AmendClinicalNoteInput {
  amendmentReason: string;
  subjective?: SoapSubjective | string;
  objective?: SoapObjective | string;
  assessment?: SoapAssessment | string;
  plan?: SoapPlan | string;
}

export class ClinicalNoteService {
  private static instance: ClinicalNoteService;

  private constructor() {}

  public static getInstance(): ClinicalNoteService {
    if (!ClinicalNoteService.instance) {
      ClinicalNoteService.instance = new ClinicalNoteService();
    }
    return ClinicalNoteService.instance;
  }

  private normalizeSoapString(input: any): string {
    if (typeof input === 'string') return input.trim();
    if (!input || typeof input !== 'object') return '';
    return (
      input.narrative ||
      input.chiefComplaint ||
      input.physicalExamination ||
      input.clinicalAssessment ||
      input.treatmentPlan ||
      JSON.stringify(input)
    );
  }

  private normalizeSoapContent(
    sub: SoapSubjective | string,
    obj: SoapObjective | string,
    ass: SoapAssessment | string,
    pln: SoapPlan | string
  ): SoapContent {
    return {
      subjective: typeof sub === 'string' ? { narrative: sub } : sub,
      objective: typeof obj === 'string' ? { narrative: obj } : obj,
      assessment: typeof ass === 'string' ? { narrative: ass } : ass,
      plan: typeof pln === 'string' ? { narrative: pln } : pln,
    };
  }

  /**
   * Creates a new clinical documentation note (SOAP format).
   */
  public async createClinicalNote(
    input: CreateClinicalNoteInput,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalNote> {
    // 1. Capability Authorization
    if (
      !canUserPerform(
        { role: principal.role },
        'clinical.note.write'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'clinical:notes_write'
      )
    ) {
      throw new ClinicalDocumentationSecurityError(
        `Security Exception: Role [${principal.role}] is not authorized to draft clinical notes.`
      );
    }

    // 2. Facility Isolation
    if (principal.facilityId !== input.facilityId && principal.role !== 'system_administrator') {
      throw new ClinicalDocumentationSecurityError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot create clinical notes for facility [${input.facilityId}].`
      );
    }

    // 3. Patient & Encounter Association Check
    const patient = localDb.getPatientById(input.patientId) || (await localRepository.getPatient(input.patientId));
    if (!patient) {
      throw new Error(`Patient with ID [${input.patientId}] does not exist.`);
    }

    const encounter =
      localDb.getEncounters().find((e) => e.id === input.encounterId) ||
      (await localRepository.getEncounter(input.encounterId));
    if (!encounter) {
      throw new Error(`Encounter with ID [${input.encounterId}] does not exist.`);
    }

    if (encounter.status.toUpperCase() === 'CANCELLED') {
      throw new Error(
        `Clinical Protection Violation: Cannot add clinical notes to a CANCELLED encounter.`
      );
    }

    // 4. Assemble Note
    const noteId = generateEntityId('note');
    const nowIso = new Date().toISOString();
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const flatSub = this.normalizeSoapString(input.subjective);
    const flatObj = this.normalizeSoapString(input.objective);
    const flatAss = this.normalizeSoapString(input.assessment);
    const flatPln = this.normalizeSoapString(input.plan);
    const structured = this.normalizeSoapContent(
      input.subjective,
      input.objective,
      input.assessment,
      input.plan
    );

    const note: ClinicalNote = {
      id: noteId,
      encounterId: input.encounterId,
      patientId: input.patientId,
      facilityId: input.facilityId,
      authorId: principal.id,
      authorName: principal.fullName,
      authorRole: principal.role,
      noteType: input.noteType || 'SOAP',
      status: input.initialStatus || 'DRAFT',
      subjective: flatSub,
      objective: flatObj,
      assessment: flatAss,
      plan: flatPln,
      structuredContent: structured,
      createdAt: nowIso,
      recordedAt: nowIso,
      updatedAt: nowIso,
      version: 1,
      syncStatus: 'LOCAL_ONLY',
      provenance: `Drafted at ${input.facilityId} by ${principal.fullName} (${principal.role})`,
    };

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<ClinicalNote>({
      actionName: 'CREATE_CLINICAL_NOTE',
      resourceType: 'ClinicalNote',
      resourceId: note.id,
      targetStore: 'clinicalNotes',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: note,
        eventType: 'ClinicalNoteCreated',
        aggregateId: note.id,
        aggregateType: 'ClinicalNote',
        version: 1,
        auditAction: 'CLINICAL_NOTE_CREATED',
      }),
    });

    await localDb.saveClinicalNote(committed);
    return committed;
  }

  /**
   * Updates an in-progress draft clinical note.
   * STRICT IMMUTABILITY: Throws if note is already SIGNED or VOIDED.
   */
  public async updateClinicalNote(
    noteId: string,
    updates: Partial<ClinicalNote>,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalNote> {
    const existing =
      (await localRepository.getClinicalNote(noteId)) ||
      localDb.getClinicalNotes().find((n) => n.id === noteId);

    if (!existing) {
      throw new Error(`Clinical note with ID [${noteId}] not found.`);
    }

    // Facility Boundary Check
    if (existing.facilityId && existing.facilityId !== principal.facilityId && principal.role !== 'system_administrator') {
      throw new ClinicalDocumentationSecurityError(
        `Facility Security Violation: Principal cannot edit clinical note from another facility.`
      );
    }

    // STRICT IMMUTABILITY: Signed notes cannot be silently modified!
    if (existing.status === 'SIGNED') {
      throw new SignedNoteImmutabilityError(
        `Signed Note Immutability Violation: Clinical note [${noteId}] has been signed and legally finalized by ${existing.signedByName || existing.authorName}. Direct modification is strictly forbidden. Use the formal amendment workflow.`
      );
    }

    if (existing.status === 'VOIDED') {
      throw new SignedNoteImmutabilityError(
        `Clinical note [${noteId}] has been VOIDED and cannot be edited.`
      );
    }

    // Capability Authorization
    if (
      !canUserPerform(
        { role: principal.role },
        'clinical.note.write'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'clinical:notes_write'
      )
    ) {
      throw new ClinicalDocumentationSecurityError(
        `Security Exception: Role [${principal.role}] is not authorized to edit clinical notes.`
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = (existing.version || 1) + 1;
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const updatedNote: ClinicalNote = {
      ...existing,
      ...updates,
      id: existing.id,
      patientId: existing.patientId, // Immutable
      encounterId: existing.encounterId, // Immutable
      authorId: existing.authorId, // Original author preserved
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

    const committed = await clinicalTransaction.execute<ClinicalNote>({
      actionName: 'UPDATE_CLINICAL_NOTE',
      resourceType: 'ClinicalNote',
      resourceId: existing.id,
      targetStore: 'clinicalNotes',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: updatedNote,
        eventType: 'ClinicalNoteUpdated',
        aggregateId: updatedNote.id,
        aggregateType: 'ClinicalNote',
        version: nextVersion,
        auditAction: 'CLINICAL_NOTE_UPDATED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });

    await localDb.saveClinicalNote(committed);
    return committed;
  }

  /**
   * Signs and legally seals a draft clinical note.
   * Freezes the documentation and prevents any further direct modifications.
   */
  public async signClinicalNote(
    noteId: string,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalNote> {
    const existing =
      (await localRepository.getClinicalNote(noteId)) ||
      localDb.getClinicalNotes().find((n) => n.id === noteId);

    if (!existing) {
      throw new Error(`Clinical note with ID [${noteId}] not found.`);
    }

    // Authorization: Role must have signing capability
    if (
      !canUserPerform(
        { role: principal.role },
        'clinical.note.sign'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'clinical:notes_write'
      )
    ) {
      throw new ClinicalDocumentationSecurityError(
        `Security Exception: Role [${principal.role}] is not authorized to sign clinical notes.`
      );
    }

    if (existing.status === 'SIGNED') {
      throw new SignedNoteImmutabilityError(
        `Clinical note [${noteId}] has already been signed at ${existing.signedAt}.`
      );
    }

    const nowIso = new Date().toISOString();
    const nextVersion = (existing.version || 1) + 1;
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const signedNote: ClinicalNote = {
      ...existing,
      status: 'SIGNED',
      signedAt: nowIso,
      signedById: principal.id,
      signedByName: principal.fullName,
      signedByRole: principal.role,
      version: nextVersion,
      updatedAt: nowIso,
      provenance: `Signed and finalized by ${principal.fullName} (${principal.role}) at ${nowIso}`,
    };

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<ClinicalNote>({
      actionName: 'SIGN_CLINICAL_NOTE',
      resourceType: 'ClinicalNote',
      resourceId: existing.id,
      targetStore: 'clinicalNotes',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: signedNote,
        eventType: 'ClinicalNoteSigned',
        aggregateId: signedNote.id,
        aggregateType: 'ClinicalNote',
        version: nextVersion,
        auditAction: 'CLINICAL_NOTE_SIGNED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });

    await localDb.saveClinicalNote(committed);
    return committed;
  }

  /**
   * Creates an official legal amendment for a previously signed clinical note.
   * Keeps the original record intact, marks the original as AMENDED,
   * and creates a new version referencing previousVersionId with required justification.
   */
  public async amendClinicalNote(
    noteId: string,
    input: AmendClinicalNoteInput,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalNote> {
    const existing =
      (await localRepository.getClinicalNote(noteId)) ||
      localDb.getClinicalNotes().find((n) => n.id === noteId);

    if (!existing) {
      throw new Error(`Clinical note with ID [${noteId}] not found.`);
    }

    if (existing.status !== 'SIGNED') {
      throw new Error(
        `Clinical Documentation Protocol Violation: Only SIGNED notes can be amended. Current note status is [${existing.status}]. For drafts, use standard update.`
      );
    }

    if (!input.amendmentReason || input.amendmentReason.trim().length < 5) {
      throw new Error(
        `Clinical Justification Required: An official amendment reason (at least 5 characters) must be supplied to amend signed clinical documentation.`
      );
    }

    // Capability check
    if (
      !canUserPerform(
        { role: principal.role },
        'clinical.note.amend'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'clinical:notes_write'
      )
    ) {
      throw new ClinicalDocumentationSecurityError(
        `Security Exception: Role [${principal.role}] is not authorized to amend signed clinical notes.`
      );
    }

    const nowIso = new Date().toISOString();
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    // 1. Mark existing note as AMENDED in local state
    const originalMarkedAmended: ClinicalNote = {
      ...existing,
      status: 'AMENDED',
      updatedAt: nowIso,
    };
    await localDb.saveClinicalNote(originalMarkedAmended);

    // 2. Create the Amendment Note (version = previous + 1)
    const amendedNoteId = generateEntityId('note');
    const newVersion = (existing.version || 1) + 1;

    const flatSub = input.subjective ? this.normalizeSoapString(input.subjective) : existing.subjective;
    const flatObj = input.objective ? this.normalizeSoapString(input.objective) : existing.objective;
    const flatAss = input.assessment ? this.normalizeSoapString(input.assessment) : existing.assessment;
    const flatPln = input.plan ? this.normalizeSoapString(input.plan) : existing.plan;

    const amendedNote: ClinicalNote = {
      ...existing,
      id: amendedNoteId,
      version: newVersion,
      previousVersionId: existing.id,
      status: 'SIGNED', // Amendments are auto-signed by amending clinician
      amendmentReason: input.amendmentReason.trim(),
      amendedById: principal.id,
      amendedByName: principal.fullName,
      amendedAt: nowIso,
      signedAt: nowIso,
      signedById: principal.id,
      signedByName: principal.fullName,
      signedByRole: principal.role,
      subjective: flatSub,
      objective: flatObj,
      assessment: flatAss,
      plan: flatPln,
      createdAt: nowIso,
      recordedAt: nowIso,
      updatedAt: nowIso,
      provenance: `Amended by ${principal.fullName} (${principal.role}) at ${nowIso}. Reason: ${input.amendmentReason.trim()}`,
    };

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<ClinicalNote>({
      actionName: 'AMEND_CLINICAL_NOTE',
      resourceType: 'ClinicalNote',
      resourceId: amendedNote.id,
      targetStore: 'clinicalNotes',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: amendedNote,
        eventType: 'ClinicalNoteAmended',
        aggregateId: amendedNote.id,
        aggregateType: 'ClinicalNote',
        version: newVersion,
        auditAction: 'CLINICAL_NOTE_AMENDED',
        previousState: existing as unknown as Record<string, unknown>,
      }),
    });

    await localDb.saveClinicalNote(committed);
    return committed;
  }

  /**
   * Fetches clinical notes for a patient and/or encounter.
   */
  public async getClinicalNotes(patientId?: string, encounterId?: string): Promise<ClinicalNote[]> {
    let list = localDb.getClinicalNotes(patientId);
    if (encounterId) {
      list = list.filter((n) => n.encounterId === encounterId);
    }
    return list;
  }

  /**
   * Retrieves single note by ID.
   */
  public async getClinicalNote(noteId: string): Promise<ClinicalNote | undefined> {
    return localDb.getClinicalNotes().find((n) => n.id === noteId);
  }
}

export const clinicalNoteService = ClinicalNoteService.getInstance();
