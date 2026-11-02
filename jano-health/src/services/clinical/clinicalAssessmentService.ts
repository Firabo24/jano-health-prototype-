/**
 * Jano Health - Clinical Core V3: Problems, Diagnoses & Clinical Assessment Service
 * 
 * Implements authoritative clinical assessment, diagnostic reasoning, problem lists,
 * differential considerations, and cryptographic attestation.
 * 
 * Strict Clinical Safety Rules:
 * 1. A diagnosis must NEVER appear merely because an algorithm, rule, or AI inferred it.
 *    Explicit authenticated clinician attestation is strictly mandatory.
 * 2. Never use fake production identities ("Default Clinician", "Current User").
 *    Use the verified AuthenticatedPrincipal.
 * 3. Atomic transactions: Domain validation -> RBAC check -> Facility boundary ->
 *    IndexedDB commit -> Event Store (SHA-256 hash chain) -> Audit trail -> Sync queue.
 * 4. Signed clinical assessments are immutable and require versioned amendments.
 */

import {
  ClinicalAssessment,
  ClinicalAssessmentStatus,
  Diagnosis,
  DiagnosisCertainty,
  DiagnosisStatus,
  DiagnosisType,
  DifferentialConsideration,
  DifferentialStatus,
  Problem,
  ProblemPriority,
  ProblemStatus,
  RoleType,
} from '../../domain/types';
import { generateEntityId } from '../../domain/identifiers';
import { canUserPerform, AuthorizationError } from '../../domain/permissions';
import { localDb } from '../storage/localDatabase';
import { localRepository } from '../storage/localRepository';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { AuthenticatedPrincipal } from './patientService';
import { clinicalTerminologyService } from '../terminology/clinicalTerminologyService';
import { sha256 } from '../../domain/eventIntegrity';

export class ClinicalAssessmentSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClinicalAssessmentSecurityError';
  }
}

export class ClinicalSafetyRuleViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClinicalSafetyRuleViolationError';
  }
}
export const ClinicalSafetyViolationError = ClinicalSafetyRuleViolationError;
export type ClinicalSafetyViolationError = ClinicalSafetyRuleViolationError;

export class SignedAssessmentImmutabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedAssessmentImmutabilityError';
  }
}

// ---------------------------------------------------------------------------
// Input Interfaces
// ---------------------------------------------------------------------------

export interface CreateProblemInput {
  patientId: string;
  facilityId: string;
  description: string;
  clinicalDescription?: string;
  priority?: ProblemPriority;
  onsetDate?: string;
  sourceEncounterId?: string;
}

export interface ResolveProblemInput {
  resolutionReason: string;
  resolvedAt?: string;
}

export interface ProblemEnteredInErrorInput {
  errorReason: string;
  replacementProblemId?: string;
}

export interface RecordDiagnosisInput {
  patientId: string;
  encounterId?: string;
  facilityId: string;
  diagnosisText: string;
  diagnosisCode?: string;
  codingSystem?: string;
  diagnosisType?: DiagnosisType;
  certainty?: DiagnosisCertainty;
  onsetContext?: string;
  isAiInferred?: boolean; // Flag to enforce safety rule
  clinicianAttested?: boolean;
}

export interface CorrectDiagnosisInput {
  diagnosisText: string;
  diagnosisCode?: string;
  amendmentReason: string;
}

export interface DiagnosisEnteredInErrorInput {
  errorReason: string;
  replacementDiagnosisId?: string;
}

export interface CreateDifferentialInput {
  encounterId: string;
  patientId: string;
  facilityId: string;
  diagnosisText: string;
  diagnosisCode?: string;
  codingSystem?: string;
  rationale?: string;
  supportingFindings?: string[];
  contradictoryFindings?: string[];
  confidenceLevel?: 'low' | 'moderate' | 'high';
}

export interface DeprioritizeDifferentialInput {
  deprioritizedReason: string;
}

export interface PromoteDifferentialInput {
  diagnosisType?: DiagnosisType;
  certainty?: DiagnosisCertainty;
}

export interface DraftClinicalAssessmentInput {
  id?: string;
  encounterId: string;
  patientId: string;
  facilityId: string;
  overallClinicalImpression: string;
  clinicalReasoning?: string;
  uncertaintyComments?: string;
  severityPriority?: 'routine' | 'urgent' | 'emergency';
  activeProblemIds?: string[];
  primaryDiagnosisId?: string;
  secondaryDiagnosisIds?: string[];
  differentialConsiderationIds?: string[];
}

export interface AmendClinicalAssessmentInput {
  amendmentReason: string;
  overallClinicalImpression?: string;
  clinicalReasoning?: string;
  uncertaintyComments?: string;
  severityPriority?: 'routine' | 'urgent' | 'emergency';
  activeProblemIds?: string[];
  primaryDiagnosisId?: string;
  secondaryDiagnosisIds?: string[];
  differentialConsiderationIds?: string[];
}

// ---------------------------------------------------------------------------
// Service Implementation
// ---------------------------------------------------------------------------

export class ClinicalAssessmentService {
  private static instance: ClinicalAssessmentService;

  private constructor() {}

  public static getInstance(): ClinicalAssessmentService {
    if (!ClinicalAssessmentService.instance) {
      ClinicalAssessmentService.instance = new ClinicalAssessmentService();
    }
    return ClinicalAssessmentService.instance;
  }

  // --- Helper: Convert Principal to ClinicalActorContext ---
  private toActor(principal: AuthenticatedPrincipal & { userId?: string; userName?: string; deviceId?: string }): ClinicalActorContext {
    const userId = principal.id || principal.userId;
    const userName = principal.fullName || principal.userName;
    if (!principal || !userId || !userName) {
      throw new ClinicalAssessmentSecurityError(
        'Invalid clinical identity: principal must have valid userId/id and userName/fullName.'
      );
    }
    // Disallow fake production identities
    const lowerName = userName.toLowerCase();
    if (
      lowerName === 'default clinician' ||
      lowerName === 'attending clinician' ||
      lowerName === 'current user'
    ) {
      throw new ClinicalAssessmentSecurityError(
        `Fake production identity detected [${userName}]. Authenticated user credentials required.`
      );
    }

    return {
      userId,
      userName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId: principal.deviceId || 'device-local-v3',
    };
  }

  // =========================================================================
  // 1. PROBLEMS (Longitudinal Problem List)
  // =========================================================================

  public async createProblem(
    input: CreateProblemInput,
    principal: AuthenticatedPrincipal
  ): Promise<Problem> {
    // 1. Capability Authorization
    if (
      !canUserPerform({ role: principal.role }, 'problem.write') &&
      !canUserPerform({ role: principal.role }, 'problem:write')
    ) {
      throw new AuthorizationError('problem.write', principal.role, 'create longitudinal problem');
    }

    // 2. Facility Boundary Check
    if (principal.facilityId !== input.facilityId && principal.role !== 'system_administrator') {
      throw new ClinicalAssessmentSecurityError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot create problems for facility [${input.facilityId}].`
      );
    }

    // 3. Validation
    if (!input.description || input.description.trim().length === 0) {
      throw new Error('Problem description is required and cannot be empty.');
    }
    if (!input.patientId) {
      throw new Error('Patient ID is required to create a problem.');
    }

    const patient = localDb.getPatientById(input.patientId) || (await localRepository.getPatient(input.patientId));
    if (!patient) {
      throw new Error(`Patient with ID [${input.patientId}] does not exist.`);
    }

    const problemId = generateEntityId('prob');
    const now = new Date().toISOString();
    const actor = this.toActor(principal);

    const newProblem: Problem = {
      id: problemId,
      patientId: input.patientId,
      facilityId: input.facilityId,
      description: input.description.trim(),
      clinicalDescription: input.clinicalDescription?.trim(),
      priority: input.priority || 'medium',
      status: 'ACTIVE',
      onsetDate: input.onsetDate || now,
      recordedAt: now,
      recordedById: actor.userId,
      recordedByName: actor.userName,
      recordedByRole: actor.userRole,
      sourceEncounterId: input.sourceEncounterId,
      version: 1,
      provenance: 'clinician_attested',
      syncStatus: 'PENDING_SYNC',
    };

    // 4. Atomic Execution
    const saved = await clinicalTransaction.execute<Problem>({
      actionName: 'CREATE_PROBLEM',
      resourceType: 'Problem',
      resourceId: problemId,
      targetStore: 'problems',
      actor,
      requiredPermission: 'problem:write',
      validate: () => {
        if (!newProblem.description) throw new Error('Validation: Problem description is empty');
      },
      buildEntity: async (tx) => {
        await tx.put('problems', newProblem);
        return {
          entity: newProblem,
          eventType: 'PROBLEM_CREATED',
          aggregateId: problemId,
          aggregateType: 'Problem',
          version: 1,
          auditAction: 'CREATE_PROBLEM',
        };
      },
    });

    // Update in-memory stores
    await localDb.saveProblem(saved);
    await localRepository.saveProblem(saved);

    return saved;
  }

  public async updateProblem(
    problemId: string,
    updates: { description?: string; clinicalDescription?: string; priority?: ProblemPriority },
    principal: AuthenticatedPrincipal
  ): Promise<Problem> {
    if (
      !canUserPerform({ role: principal.role }, 'problem.write') &&
      !canUserPerform({ role: principal.role }, 'problem:write')
    ) {
      throw new AuthorizationError('problem.write', principal.role, 'update problem');
    }

    const existing =
      localDb.getProblems().find((p) => p.id === problemId) ||
      (await localRepository.getProblems()).find((p) => p.id === problemId);

    if (!existing) {
      throw new Error(`Problem with ID [${problemId}] does not exist.`);
    }

    if (existing.status === 'ENTERED_IN_ERROR') {
      throw new Error(`Problem [${problemId}] is marked as entered in error and cannot be edited.`);
    }

    const actor = this.toActor(principal);
    const updated: Problem = {
      ...existing,
      description: updates.description !== undefined ? updates.description.trim() : existing.description,
      clinicalDescription: updates.clinicalDescription !== undefined ? updates.clinicalDescription.trim() : existing.clinicalDescription,
      priority: updates.priority || existing.priority,
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Problem>({
      actionName: 'UPDATE_PROBLEM',
      resourceType: 'Problem',
      resourceId: problemId,
      targetStore: 'problems',
      actor,
      requiredPermission: 'problem:write',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('problems', updated);
        return {
          entity: updated,
          eventType: 'PROBLEM_UPDATED',
          aggregateId: problemId,
          aggregateType: 'Problem',
          version: updated.version,
          auditAction: 'UPDATE_PROBLEM',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveProblem(saved);
    await localRepository.saveProblem(saved);
    return saved;
  }

  public async resolveProblem(
    problemId: string,
    input: ResolveProblemInput,
    principal: AuthenticatedPrincipal
  ): Promise<Problem> {
    if (
      !canUserPerform({ role: principal.role }, 'problem.resolve') &&
      !canUserPerform({ role: principal.role }, 'problem:resolve') &&
      !canUserPerform({ role: principal.role }, 'problem:write')
    ) {
      throw new AuthorizationError('problem.resolve', principal.role, 'resolve problem');
    }

    if (!input.resolutionReason || input.resolutionReason.trim().length === 0) {
      throw new Error('A valid resolution reason is required to resolve a clinical problem.');
    }

    const existing =
      localDb.getProblems().find((p) => p.id === problemId) ||
      (await localRepository.getProblems()).find((p) => p.id === problemId);

    if (!existing) {
      throw new Error(`Problem with ID [${problemId}] does not exist.`);
    }

    if (existing.status === 'ENTERED_IN_ERROR') {
      throw new Error(`Problem [${problemId}] is marked as entered in error and cannot be resolved.`);
    }

    const actor = this.toActor(principal);
    const now = new Date().toISOString();

    const resolved: Problem = {
      ...existing,
      status: 'RESOLVED',
      resolvedAt: input.resolvedAt || now,
      resolvedById: actor.userId,
      resolvedByName: actor.userName,
      resolutionReason: input.resolutionReason.trim(),
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Problem>({
      actionName: 'RESOLVE_PROBLEM',
      resourceType: 'Problem',
      resourceId: problemId,
      targetStore: 'problems',
      actor,
      requiredPermission: 'problem:resolve',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('problems', resolved);
        return {
          entity: resolved,
          eventType: 'PROBLEM_RESOLVED',
          aggregateId: problemId,
          aggregateType: 'Problem',
          version: resolved.version,
          auditAction: 'RESOLVE_PROBLEM',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveProblem(saved);
    await localRepository.saveProblem(saved);
    return saved;
  }

  public async markProblemEnteredInError(
    problemId: string,
    input: ProblemEnteredInErrorInput,
    principal: AuthenticatedPrincipal
  ): Promise<Problem> {
    if (
      !canUserPerform({ role: principal.role }, 'problem.correct') &&
      !canUserPerform({ role: principal.role }, 'problem:correct') &&
      !canUserPerform({ role: principal.role }, 'problem:write')
    ) {
      throw new AuthorizationError('problem.correct', principal.role, 'mark problem entered in error');
    }

    if (!input.errorReason || input.errorReason.trim().length === 0) {
      throw new Error('A valid clinical reason is required to mark a problem as entered in error.');
    }

    const existing =
      localDb.getProblems().find((p) => p.id === problemId) ||
      (await localRepository.getProblems()).find((p) => p.id === problemId);

    if (!existing) {
      throw new Error(`Problem with ID [${problemId}] does not exist.`);
    }

    const actor = this.toActor(principal);
    const now = new Date().toISOString();

    const errorRecord: Problem = {
      ...existing,
      status: 'ENTERED_IN_ERROR',
      enteredInError: true,
      errorReason: input.errorReason.trim(),
      errorRecordedById: actor.userId,
      errorRecordedAt: now,
      errorReplacementProblemId: input.replacementProblemId,
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Problem>({
      actionName: 'MARK_PROBLEM_ENTERED_IN_ERROR',
      resourceType: 'Problem',
      resourceId: problemId,
      targetStore: 'problems',
      actor,
      requiredPermission: 'problem:correct',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('problems', errorRecord);
        return {
          entity: errorRecord,
          eventType: 'PROBLEM_ENTERED_IN_ERROR',
          aggregateId: problemId,
          aggregateType: 'Problem',
          version: errorRecord.version,
          auditAction: 'MARK_PROBLEM_ENTERED_IN_ERROR',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveProblem(saved);
    await localRepository.saveProblem(saved);
    return saved;
  }

  public async getProblems(patientId: string, includeResolved = true): Promise<Problem[]> {
    await localRepository.ensureInitialized();
    let list = await localRepository.getProblems(patientId);
    if (list.length === 0) {
      list = localDb.getProblems(patientId);
    }
    if (!includeResolved) {
      list = list.filter((p) => p.status === 'ACTIVE');
    }
    return list;
  }

  // =========================================================================
  // 2. DIAGNOSES (Working, Primary, Confirmed, Historical)
  // =========================================================================

  public async recordDiagnosis(
    input: RecordDiagnosisInput,
    principal: AuthenticatedPrincipal
  ): Promise<Diagnosis> {
    // CLINICAL SAFETY MANDATE:
    // A diagnosis must never appear merely because an algorithm, rule, or AI inferred it.
    // Explicit human clinician attestation is mandatory.
    if (input.clinicianAttested === false || (input.isAiInferred && !input.clinicianAttested)) {
      throw new ClinicalSafetyRuleViolationError(
        'Clinical Safety Rule: AI/algorithmic inferences cannot be recorded as diagnoses without explicit clinician attestation.'
      );
    }

    // 1. Capability Authorization
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new ClinicalAssessmentSecurityError(
        `Security Exception: Role [${principal.role}] is not authorized to record clinical diagnoses.`
      );
    }

    // 2. Facility Boundary Check
    if (principal.facilityId !== input.facilityId && principal.role !== 'system_administrator') {
      throw new ClinicalAssessmentSecurityError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot record diagnoses for facility [${input.facilityId}].`
      );
    }

    // 3. Validation
    if (!input.diagnosisText || input.diagnosisText.trim().length === 0) {
      throw new Error('Diagnosis description/text is required and cannot be empty.');
    }
    if (!input.patientId) {
      throw new Error('Patient ID is required.');
    }

    const patient = localDb.getPatientById(input.patientId) || (await localRepository.getPatient(input.patientId));
    if (!patient) {
      throw new Error(`Patient with ID [${input.patientId}] does not exist.`);
    }

    // Terminology check
    let verifiedCode = input.diagnosisCode?.trim();
    let codingSystem = input.codingSystem || (verifiedCode ? 'ICD-10' : undefined);
    if (verifiedCode) {
      const term = clinicalTerminologyService.lookupByCode(verifiedCode);
      if (term) {
        codingSystem = term.system;
      }
    }

    const diagnosisId = generateEntityId('dx');
    const now = new Date().toISOString();
    const actor = this.toActor(principal);

    const certainty = input.certainty || 'PROVISIONAL';
    const initialStatus: DiagnosisStatus = certainty === 'CONFIRMED' ? 'CONFIRMED' : 'PROVISIONAL';

    const newDiagnosis: Diagnosis = {
      id: diagnosisId,
      patientId: input.patientId,
      encounterId: input.encounterId,
      facilityId: input.facilityId,
      clinicianId: actor.userId,
      clinicianName: actor.userName,
      clinicianRole: actor.userRole,
      diagnosisText: input.diagnosisText.trim(),
      description: input.diagnosisText.trim(), // backward-compat
      diagnosisCode: verifiedCode,
      code: verifiedCode, // backward-compat
      codingSystem,
      diagnosisType: input.diagnosisType || 'PRIMARY',
      type: input.diagnosisType || 'PRIMARY', // backward-compat
      certainty,
      status: initialStatus,
      onsetContext: input.onsetContext,
      recordedAt: now,
      version: 1,
      provenance: input.isAiInferred ? 'clinician_verified_ai_assist' : 'direct_clinical_entry',
      syncStatus: 'PENDING_SYNC',
    };

    // 4. Atomic Execution
    const saved = await clinicalTransaction.execute<Diagnosis>({
      actionName: 'RECORD_DIAGNOSIS',
      resourceType: 'Diagnosis',
      resourceId: diagnosisId,
      targetStore: 'diagnoses',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {
        if (!newDiagnosis.diagnosisText) throw new Error('Validation: Diagnosis text is empty');
      },
      buildEntity: async (tx) => {
        await tx.put('diagnoses', newDiagnosis);
        return {
          entity: newDiagnosis,
          eventType: 'DIAGNOSIS_RECORDED',
          aggregateId: diagnosisId,
          aggregateType: 'Diagnosis',
          version: 1,
          auditAction: 'RECORD_DIAGNOSIS',
        };
      },
    });

    await localDb.saveDiagnosis(saved);
    await localRepository.saveDiagnosis(saved);

    return saved;
  }

  public async confirmDiagnosis(
    diagnosisId: string,
    principal: AuthenticatedPrincipal
  ): Promise<Diagnosis> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.confirm') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.confirm', principal.role, 'confirm diagnosis');
    }

    const existing =
      localDb.getDiagnoses().find((d) => d.id === diagnosisId) ||
      (await localRepository.getDiagnoses()).find((d) => d.id === diagnosisId);

    if (!existing) {
      throw new Error(`Diagnosis with ID [${diagnosisId}] does not exist.`);
    }

    if (existing.status === 'ENTERED_IN_ERROR') {
      throw new Error(`Diagnosis [${diagnosisId}] is marked as entered in error and cannot be confirmed.`);
    }

    const actor = this.toActor(principal);
    const now = new Date().toISOString();

    const confirmed: Diagnosis = {
      ...existing,
      certainty: 'CONFIRMED',
      status: 'CONFIRMED',
      confirmedAt: now,
      confirmedById: actor.userId,
      confirmedByName: actor.userName,
      version: (existing.version || 1) + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Diagnosis>({
      actionName: 'CONFIRM_DIAGNOSIS',
      resourceType: 'Diagnosis',
      resourceId: diagnosisId,
      targetStore: 'diagnoses',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('diagnoses', confirmed);
        return {
          entity: confirmed,
          eventType: 'DIAGNOSIS_CONFIRMED',
          aggregateId: diagnosisId,
          aggregateType: 'Diagnosis',
          version: confirmed.version || 2,
          auditAction: 'CONFIRM_DIAGNOSIS',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDiagnosis(saved);
    await localRepository.saveDiagnosis(saved);
    return saved;
  }

  public async correctDiagnosis(
    diagnosisId: string,
    input: CorrectDiagnosisInput,
    principal: AuthenticatedPrincipal
  ): Promise<Diagnosis> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.correct') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.correct', principal.role, 'correct diagnosis');
    }

    if (!input.amendmentReason || input.amendmentReason.trim().length === 0) {
      throw new Error('A valid amendment reason is required to correct a documented diagnosis.');
    }

    const existing =
      localDb.getDiagnoses().find((d) => d.id === diagnosisId) ||
      (await localRepository.getDiagnoses()).find((d) => d.id === diagnosisId);

    if (!existing) {
      throw new Error(`Diagnosis with ID [${diagnosisId}] does not exist.`);
    }

    const actor = this.toActor(principal);
    const corrected: Diagnosis = {
      ...existing,
      diagnosisText: input.diagnosisText.trim(),
      description: input.diagnosisText.trim(),
      diagnosisCode: input.diagnosisCode?.trim() || existing.diagnosisCode,
      code: input.diagnosisCode?.trim() || existing.code,
      amendmentReason: input.amendmentReason.trim(),
      previousVersionId: diagnosisId,
      version: (existing.version || 1) + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Diagnosis>({
      actionName: 'CORRECT_DIAGNOSIS',
      resourceType: 'Diagnosis',
      resourceId: diagnosisId,
      targetStore: 'diagnoses',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('diagnoses', corrected);
        return {
          entity: corrected,
          eventType: 'DIAGNOSIS_CORRECTED',
          aggregateId: diagnosisId,
          aggregateType: 'Diagnosis',
          version: corrected.version || 2,
          auditAction: 'CORRECT_DIAGNOSIS',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDiagnosis(saved);
    await localRepository.saveDiagnosis(saved);
    return saved;
  }

  public async markDiagnosisEnteredInError(
    diagnosisId: string,
    input: DiagnosisEnteredInErrorInput,
    principal: AuthenticatedPrincipal
  ): Promise<Diagnosis> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.enter_in_error') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.enter_in_error', principal.role, 'mark diagnosis entered in error');
    }

    if (!input.errorReason || input.errorReason.trim().length === 0) {
      throw new Error('A valid error reason is required to void a diagnosis.');
    }

    const existing =
      localDb.getDiagnoses().find((d) => d.id === diagnosisId) ||
      (await localRepository.getDiagnoses()).find((d) => d.id === diagnosisId);

    if (!existing) {
      throw new Error(`Diagnosis with ID [${diagnosisId}] does not exist.`);
    }

    const actor = this.toActor(principal);
    const now = new Date().toISOString();

    const voided: Diagnosis = {
      ...existing,
      status: 'ENTERED_IN_ERROR',
      enteredInError: true,
      errorReason: input.errorReason.trim(),
      errorRecordedById: actor.userId,
      errorRecordedAt: now,
      replacementDiagnosisId: input.replacementDiagnosisId,
      version: (existing.version || 1) + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<Diagnosis>({
      actionName: 'MARK_DIAGNOSIS_ENTERED_IN_ERROR',
      resourceType: 'Diagnosis',
      resourceId: diagnosisId,
      targetStore: 'diagnoses',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('diagnoses', voided);
        return {
          entity: voided,
          eventType: 'DIAGNOSIS_ENTERED_IN_ERROR',
          aggregateId: diagnosisId,
          aggregateType: 'Diagnosis',
          version: voided.version || 2,
          auditAction: 'MARK_DIAGNOSIS_ENTERED_IN_ERROR',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDiagnosis(saved);
    await localRepository.saveDiagnosis(saved);
    return saved;
  }

  public async getDiagnoses(patientId: string, encounterId?: string): Promise<Diagnosis[]> {
    await localRepository.ensureInitialized();
    let list = await localRepository.getDiagnoses(patientId, encounterId);
    if (list.length === 0) {
      list = localDb.getDiagnoses(patientId, encounterId);
    }
    return list;
  }

  // =========================================================================
  // 3. DIFFERENTIAL CONSIDERATIONS
  // =========================================================================

  public async createDifferential(
    input: CreateDifferentialInput,
    principal: AuthenticatedPrincipal
  ): Promise<DifferentialConsideration> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.write', principal.role, 'record differential consideration');
    }

    if (!input.diagnosisText || input.diagnosisText.trim().length === 0) {
      throw new Error('Differential diagnosis text is required.');
    }

    const diffId = generateEntityId('diff');
    const now = new Date().toISOString();
    const actor = this.toActor(principal);

    const newDiff: DifferentialConsideration = {
      id: diffId,
      encounterId: input.encounterId,
      patientId: input.patientId,
      facilityId: input.facilityId,
      diagnosisText: input.diagnosisText.trim(),
      diagnosisCode: input.diagnosisCode?.trim(),
      codingSystem: input.codingSystem || (input.diagnosisCode ? 'ICD-10' : undefined),
      rationale: input.rationale?.trim(),
      supportingFindings: input.supportingFindings || [],
      contradictoryFindings: input.contradictoryFindings || [],
      confidenceLevel: input.confidenceLevel || 'moderate',
      status: 'CONSIDERED',
      createdById: actor.userId,
      createdByName: actor.userName,
      createdByRole: actor.userRole,
      createdAt: now,
      version: 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<DifferentialConsideration>({
      actionName: 'CREATE_DIFFERENTIAL',
      resourceType: 'DifferentialConsideration',
      resourceId: diffId,
      targetStore: 'differentials',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {
        if (!newDiff.diagnosisText) throw new Error('Validation: Differential text is empty');
      },
      buildEntity: async (tx) => {
        await tx.put('differentials', newDiff);
        return {
          entity: newDiff,
          eventType: 'DIFFERENTIAL_CREATED',
          aggregateId: diffId,
          aggregateType: 'DifferentialConsideration',
          version: 1,
          auditAction: 'CREATE_DIFFERENTIAL',
        };
      },
    });

    await localDb.saveDifferential(saved);
    await localRepository.saveDifferential(saved);
    return saved;
  }

  public async deprioritizeDifferential(
    differentialId: string,
    input: DeprioritizeDifferentialInput,
    principal: AuthenticatedPrincipal
  ): Promise<DifferentialConsideration> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.write', principal.role, 'deprioritize differential');
    }

    if (!input.deprioritizedReason || input.deprioritizedReason.trim().length === 0) {
      throw new Error('A valid clinical reason is required to deprioritize a differential.');
    }

    const existing =
      localDb.getDifferentials().find((d) => d.id === differentialId) ||
      (await localRepository.getDifferentials()).find((d) => d.id === differentialId);

    if (!existing) {
      throw new Error(`Differential with ID [${differentialId}] does not exist.`);
    }

    const actor = this.toActor(principal);
    const updated: DifferentialConsideration = {
      ...existing,
      status: 'DEPRIORITIZED',
      deprioritizedReason: input.deprioritizedReason.trim(),
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<DifferentialConsideration>({
      actionName: 'DEPRIORITIZE_DIFFERENTIAL',
      resourceType: 'DifferentialConsideration',
      resourceId: differentialId,
      targetStore: 'differentials',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('differentials', updated);
        return {
          entity: updated,
          eventType: 'DIFFERENTIAL_DEPRIORITIZED',
          aggregateId: differentialId,
          aggregateType: 'DifferentialConsideration',
          version: updated.version,
          auditAction: 'DEPRIORITIZE_DIFFERENTIAL',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDifferential(saved);
    await localRepository.saveDifferential(saved);
    return saved;
  }

  public async ruleOutDifferential(
    differentialId: string,
    rationale: string,
    principal: AuthenticatedPrincipal
  ): Promise<DifferentialConsideration> {
    if (
      !canUserPerform({ role: principal.role }, 'diagnosis.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:diagnose')
    ) {
      throw new AuthorizationError('diagnosis.write', principal.role, 'rule out differential');
    }

    const existing =
      localDb.getDifferentials().find((d) => d.id === differentialId) ||
      (await localRepository.getDifferentials()).find((d) => d.id === differentialId);

    if (!existing) {
      throw new Error(`Differential with ID [${differentialId}] does not exist.`);
    }

    const actor = this.toActor(principal);
    const updated: DifferentialConsideration = {
      ...existing,
      status: 'RULED_OUT',
      deprioritizedReason: rationale.trim(),
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<DifferentialConsideration>({
      actionName: 'RULE_OUT_DIFFERENTIAL',
      resourceType: 'DifferentialConsideration',
      resourceId: differentialId,
      targetStore: 'differentials',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('differentials', updated);
        return {
          entity: updated,
          eventType: 'DIFFERENTIAL_STATUS_CHANGED',
          aggregateId: differentialId,
          aggregateType: 'DifferentialConsideration',
          version: updated.version,
          auditAction: 'RULE_OUT_DIFFERENTIAL',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDifferential(saved);
    await localRepository.saveDifferential(saved);
    return saved;
  }

  public async promoteDifferentialToDiagnosis(
    differentialId: string,
    input: PromoteDifferentialInput,
    principal: AuthenticatedPrincipal
  ): Promise<{ diagnosis: Diagnosis; differential: DifferentialConsideration }> {
    const existing =
      localDb.getDifferentials().find((d) => d.id === differentialId) ||
      (await localRepository.getDifferentials()).find((d) => d.id === differentialId);

    if (!existing) {
      throw new Error(`Differential with ID [${differentialId}] does not exist.`);
    }

    const certainty = input.certainty || 'CONFIRMED';
    const diagnosisType = input.diagnosisType || 'PRIMARY';

    // 1. Record actual diagnosis
    const dx = await this.recordDiagnosis(
      {
        patientId: existing.patientId,
        encounterId: existing.encounterId,
        facilityId: existing.facilityId,
        diagnosisText: existing.diagnosisText,
        diagnosisCode: existing.diagnosisCode,
        codingSystem: existing.codingSystem,
        diagnosisType,
        certainty,
        onsetContext: existing.rationale,
      },
      principal
    );

    // 2. Update differential status
    const actor = this.toActor(principal);
    const newStatus: DifferentialStatus =
      certainty === 'CONFIRMED' ? 'PROMOTED_TO_CONFIRMED' : 'PROMOTED_TO_WORKING';

    const updatedDiff: DifferentialConsideration = {
      ...existing,
      status: newStatus,
      promotedDiagnosisId: dx.id,
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const savedDiff = await clinicalTransaction.execute<DifferentialConsideration>({
      actionName: 'PROMOTE_DIFFERENTIAL',
      resourceType: 'DifferentialConsideration',
      resourceId: differentialId,
      targetStore: 'differentials',
      actor,
      requiredPermission: 'clinical:diagnose',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('differentials', updatedDiff);
        return {
          entity: updatedDiff,
          eventType: 'DIFFERENTIAL_STATUS_CHANGED',
          aggregateId: differentialId,
          aggregateType: 'DifferentialConsideration',
          version: updatedDiff.version,
          auditAction: 'PROMOTE_DIFFERENTIAL',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveDifferential(savedDiff);
    await localRepository.saveDifferential(savedDiff);

    return { diagnosis: dx, differential: savedDiff };
  }

  public async getDifferentials(encounterId: string, patientId?: string): Promise<DifferentialConsideration[]> {
    await localRepository.ensureInitialized();
    let list = await localRepository.getDifferentials(encounterId, patientId);
    if (list.length === 0) {
      list = localDb.getDifferentials(encounterId, patientId);
    }
    return list;
  }

  // =========================================================================
  // 4. CLINICAL ASSESSMENT (Synthesis & Attestation)
  // =========================================================================

  public async draftClinicalAssessment(
    input: DraftClinicalAssessmentInput,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalAssessment> {
    // Facility Boundary Check
    if (principal.facilityId !== input.facilityId && principal.role !== 'system_administrator') {
      throw new ClinicalAssessmentSecurityError(
        `Facility Security Violation: Principal at [${principal.facilityId}] cannot draft assessments for facility [${input.facilityId}].`
      );
    }

    if (
      !canUserPerform({ role: principal.role }, 'clinical.assessment.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:assessment_write') &&
      !canUserPerform({ role: principal.role }, 'clinical:notes_write')
    ) {
      throw new AuthorizationError('clinical.assessment.write', principal.role, 'draft clinical assessment');
    }

    if (input.id) {
      const existing =
        localDb.getClinicalAssessments().find((a) => a.id === input.id) ||
        (await localRepository.getClinicalAssessments()).find((a) => a.id === input.id);
      if (existing && (existing.status === 'SIGNED' || existing.status === 'AMENDED')) {
        throw new SignedAssessmentImmutabilityError(
          `Signed Assessment Immutability: Clinical assessment [${input.id}] has been finalized and sealed. Direct edits are forbidden. Use formal amendment.`
        );
      }
    }

    if (!input.overallClinicalImpression || input.overallClinicalImpression.trim().length === 0) {
      throw new Error('Overall clinical impression is required and cannot be empty.');
    }

    const assessmentId = generateEntityId('assmt');
    const now = new Date().toISOString();
    const actor = this.toActor(principal);

    const assessment: ClinicalAssessment = {
      id: assessmentId,
      encounterId: input.encounterId,
      patientId: input.patientId,
      facilityId: input.facilityId,
      clinicianId: actor.userId,
      clinicianName: actor.userName,
      clinicianRole: actor.userRole,
      recordedAt: now,
      overallClinicalImpression: input.overallClinicalImpression.trim(),
      clinicalReasoning: input.clinicalReasoning?.trim(),
      uncertaintyComments: input.uncertaintyComments?.trim(),
      severityPriority: input.severityPriority || 'routine',
      activeProblemIds: input.activeProblemIds || [],
      primaryDiagnosisId: input.primaryDiagnosisId,
      secondaryDiagnosisIds: input.secondaryDiagnosisIds || [],
      differentialConsiderationIds: input.differentialConsiderationIds || [],
      status: 'DRAFT',
      version: 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<ClinicalAssessment>({
      actionName: 'DRAFT_CLINICAL_ASSESSMENT',
      resourceType: 'ClinicalAssessment',
      resourceId: assessmentId,
      targetStore: 'clinicalAssessments',
      actor,
      requiredPermission: 'clinical:assessment_write',
      validate: () => {
        if (!assessment.overallClinicalImpression) {
          throw new Error('Validation: Overall clinical impression is empty');
        }
      },
      buildEntity: async (tx) => {
        await tx.put('clinicalAssessments', assessment);
        return {
          entity: assessment,
          eventType: 'CLINICAL_ASSESSMENT_CREATED',
          aggregateId: assessmentId,
          aggregateType: 'ClinicalAssessment',
          version: 1,
          auditAction: 'DRAFT_CLINICAL_ASSESSMENT',
        };
      },
    });

    await localDb.saveClinicalAssessment(saved);
    await localRepository.saveClinicalAssessment(saved);
    return saved;
  }

  public async signClinicalAssessment(
    assessmentId: string,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalAssessment> {
    if (
      !canUserPerform({ role: principal.role }, 'clinical.assessment.sign') &&
      !canUserPerform({ role: principal.role }, 'clinical:assessment_sign')
    ) {
      throw new AuthorizationError('clinical.assessment.sign', principal.role, 'sign clinical assessment');
    }

    const existing =
      localDb.getClinicalAssessments().find((a) => a.id === assessmentId) ||
      (await localRepository.getClinicalAssessments()).find((a) => a.id === assessmentId);

    if (!existing) {
      throw new Error(`Clinical assessment with ID [${assessmentId}] does not exist.`);
    }

    if (existing.status === 'SIGNED') {
      throw new SignedAssessmentImmutabilityError(
        `Clinical Assessment [${assessmentId}] is already signed and cryptographically sealed.`
      );
    }

    const actor = this.toActor(principal);
    const now = new Date().toISOString();

    // Cryptographic Seal: deterministic SHA-256 hash
    const sealData = `${existing.id}|${existing.overallClinicalImpression}|${actor.userId}|${now}`;
    const integrityHash = sha256(sealData);

    const signed: ClinicalAssessment = {
      ...existing,
      status: 'SIGNED',
      signedAt: now,
      signedById: actor.userId,
      signedByName: actor.userName,
      signedByRole: actor.userRole,
      integrityHash,
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<ClinicalAssessment>({
      actionName: 'SIGN_CLINICAL_ASSESSMENT',
      resourceType: 'ClinicalAssessment',
      resourceId: assessmentId,
      targetStore: 'clinicalAssessments',
      actor,
      requiredPermission: 'clinical:assessment_sign',
      validate: () => {},
      buildEntity: async (tx) => {
        await tx.put('clinicalAssessments', signed);
        return {
          entity: signed,
          eventType: 'CLINICAL_ASSESSMENT_SIGNED',
          aggregateId: assessmentId,
          aggregateType: 'ClinicalAssessment',
          version: signed.version,
          auditAction: 'SIGN_CLINICAL_ASSESSMENT',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveClinicalAssessment(saved);
    await localRepository.saveClinicalAssessment(saved);
    return saved;
  }

  public async amendClinicalAssessment(
    assessmentId: string,
    input: AmendClinicalAssessmentInput,
    principal: AuthenticatedPrincipal
  ): Promise<ClinicalAssessment> {
    if (
      !canUserPerform({ role: principal.role }, 'clinical.assessment.write') &&
      !canUserPerform({ role: principal.role }, 'clinical:assessment_write') &&
      !canUserPerform({ role: principal.role }, 'clinical:notes_write')
    ) {
      throw new AuthorizationError('clinical.assessment.write', principal.role, 'amend clinical assessment');
    }

    if (!input.amendmentReason || input.amendmentReason.trim().length === 0) {
      throw new Error('A valid clinical reason is required to amend a clinical assessment.');
    }

    const existing =
      localDb.getClinicalAssessments().find((a) => a.id === assessmentId) ||
      (await localRepository.getClinicalAssessments()).find((a) => a.id === assessmentId);

    if (!existing) {
      throw new Error(`Clinical assessment with ID [${assessmentId}] does not exist.`);
    }

    const newId = generateEntityId('assmt');
    const now = new Date().toISOString();
    const actor = this.toActor(principal);

    const sealData = `${newId}|${input.overallClinicalImpression || existing.overallClinicalImpression}|${actor.userId}|${now}`;
    const integrityHash = sha256(sealData);

    const amended: ClinicalAssessment = {
      id: newId,
      encounterId: existing.encounterId,
      patientId: existing.patientId,
      facilityId: existing.facilityId,
      clinicianId: actor.userId,
      clinicianName: actor.userName,
      clinicianRole: actor.userRole,
      recordedAt: now,
      overallClinicalImpression: input.overallClinicalImpression !== undefined
        ? input.overallClinicalImpression.trim()
        : existing.overallClinicalImpression,
      clinicalReasoning: input.clinicalReasoning !== undefined
        ? input.clinicalReasoning?.trim()
        : existing.clinicalReasoning,
      uncertaintyComments: input.uncertaintyComments !== undefined
        ? input.uncertaintyComments?.trim()
        : existing.uncertaintyComments,
      severityPriority: input.severityPriority || existing.severityPriority,
      activeProblemIds: input.activeProblemIds || existing.activeProblemIds,
      primaryDiagnosisId: input.primaryDiagnosisId !== undefined
        ? input.primaryDiagnosisId
        : existing.primaryDiagnosisId,
      secondaryDiagnosisIds: input.secondaryDiagnosisIds || existing.secondaryDiagnosisIds,
      differentialConsiderationIds: input.differentialConsiderationIds || existing.differentialConsiderationIds,
      status: 'AMENDED',
      previousVersionId: assessmentId,
      amendmentReason: input.amendmentReason.trim(),
      integrityHash,
      version: existing.version + 1,
      syncStatus: 'PENDING_SYNC',
    };

    const saved = await clinicalTransaction.execute<ClinicalAssessment>({
      actionName: 'AMEND_CLINICAL_ASSESSMENT',
      resourceType: 'ClinicalAssessment',
      resourceId: newId,
      targetStore: 'clinicalAssessments',
      actor,
      requiredPermission: 'clinical:assessment_write',
      validate: () => {
        if (!amended.overallClinicalImpression) {
          throw new Error('Validation: Overall clinical impression is empty');
        }
      },
      buildEntity: async (tx) => {
        await tx.put('clinicalAssessments', amended);
        return {
          entity: amended,
          eventType: 'CLINICAL_ASSESSMENT_AMENDED',
          aggregateId: newId,
          aggregateType: 'ClinicalAssessment',
          version: amended.version,
          auditAction: 'AMEND_CLINICAL_ASSESSMENT',
          previousState: existing as unknown as Record<string, unknown>,
        };
      },
    });

    await localDb.saveClinicalAssessment(saved);
    await localRepository.saveClinicalAssessment(saved);
    return saved;
  }

  public async getClinicalAssessment(encounterId: string): Promise<ClinicalAssessment | undefined> {
    await localRepository.ensureInitialized();
    const list = await localRepository.getClinicalAssessments(encounterId);
    if (list.length > 0) {
      return list[0];
    }
    const fallback = localDb.getClinicalAssessments(encounterId);
    return fallback.length > 0 ? fallback[0] : undefined;
  }
}

export const clinicalAssessmentService = ClinicalAssessmentService.getInstance();
