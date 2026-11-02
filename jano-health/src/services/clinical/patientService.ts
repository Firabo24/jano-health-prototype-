/**
 * Jano Health - Clinical Patient Service & Lifecycle Pipeline
 * 
 * Implements the authoritative clinical pipeline for Clinical Core V1:
 * AUTHENTICATED PRINCIPAL 
 *   -> CAPABILITY AUTHORIZATION 
 *   -> FACILITY/TENANT AUTHORIZATION 
 *   -> DOMAIN VALIDATION 
 *   -> DUPLICATE DETECTION CHECK
 *   -> ATOMIC LOCAL TRANSACTION 
 *   -> DOMAIN EVENT (PatientRegistered / PatientDemographicsUpdated / PatientMerged)
 *   -> AUDIT EVENT (PATIENT_REGISTERED, PATIENT_VIEWED, PATIENT_MERGED, etc.)
 *   -> LOCAL STATE PERSISTENCE (LocalRepository + LocalDatabase)
 *   -> SYNC QUEUE DISPATCH (SyncEngine)
 *   -> CLIENT-SIDE OPTIMISTIC ACKNOWLEDGMENT
 */

import {
  DateOfBirthPrecision,
  EmergencyContact,
  Patient,
  PatientStatus,
  PatientSyncStatus,
  RoleType,
  Sex,
  User,
} from '../../domain/types';
import { generateEntityId, generateMRN } from '../../domain/identifiers';
import { canUserPerform, isFacilityAdmin } from '../../domain/permissions';
import { validateDateOfBirth, normalizePhoneNumber } from '../../domain/clinicalUtils';
import { evaluateDuplicates, DuplicateCandidate } from './duplicateDetection';
import { localDb } from '../storage/localDatabase';
import { localRepository } from '../storage/localRepository';
import { eventStore } from '../events/eventStore';
import { syncEngine } from '../sync/syncEngine';
import { auditService } from '../audit/auditService';

export interface AuthenticatedPrincipal {
  id: string;
  fullName: string;
  role: RoleType;
  facilityId: string;
}

export interface RegisterPatientInput {
  givenName: string;
  middleName?: string;
  familyName: string;
  preferredName?: string;
  dateOfBirth: string;
  dateOfBirthPrecision?: DateOfBirthPrecision;
  sex: Sex;
  genderIdentity?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'other';
  nationalId?: string;
  facilityPatientNumber?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  villageTown: string;
  city?: string;
  district: string;
  region?: string;
  country?: string;
  registrationFacilityId: string;
  primaryFacilityId?: string;
  emergencyContact?: EmergencyContact;
  bloodGroup?: Patient['bloodGroup'];
  pregnancyStatus?: Patient['pregnancyStatus'];
  allergiesSummary?: string[];
  activeDiagnosesSummary?: string[];
  triageUrgency?: Patient['triageUrgency'];
  preferredLanguage?: string;
  occupation?: string;
}

export interface PatientRegistrationResult {
  success: boolean;
  patient?: Patient;
  duplicateDetected?: boolean;
  requiresOverride?: boolean;
  duplicateCandidates?: DuplicateCandidate[];
  duplicates?: DuplicateCandidate[];
  error?: string;
}

export interface PatientMergeResult {
  success: boolean;
  survivingPatient?: Patient;
  retiredPatient?: Patient;
  error?: string;
}

export class PatientService {
  private static instance: PatientService;

  private constructor() {}

  public static getInstance(): PatientService {
    if (!PatientService.instance) {
      PatientService.instance = new PatientService();
    }
    return PatientService.instance;
  }

  /**
   * Registers a new canonical Patient aggregate through the complete clinical pipeline.
   */
  public async registerPatient(
    principal: AuthenticatedPrincipal,
    input: RegisterPatientInput,
    options?: { allowDuplicateOverride?: boolean; duplicateOverrideReason?: string }
  ): Promise<PatientRegistrationResult> {
    // 1. Authenticated Principal check
    if (!principal || !principal.id || !principal.role) {
      this.recordUnauthorized(principal, 'patient:create', 'Unauthenticated or anonymous principal');
      return { success: false, error: 'Authentication required to register patients.' };
    }

    // 2. Capability Authorization check
    if (!canUserPerform(principal, 'patient.create') && !canUserPerform(principal, 'patient:create')) {
      this.recordUnauthorized(principal, 'patient:create', `Role [${principal.role}] lacks patient registration capability`);
      return { success: false, error: `Access Denied: Role [${principal.role}] cannot register patients.` };
    }

    // 3. Facility / Tenant Scope check
    const regFacility = input.registrationFacilityId || principal.facilityId;
    if (principal.role !== 'system_administrator' && principal.facilityId !== regFacility) {
      this.recordUnauthorized(principal, 'patient:create', `Cross-facility registration denied: user=${principal.facilityId}, target=${regFacility}`);
      return { success: false, error: 'Cannot register patients outside your assigned facility.' };
    }

    // 4. Domain Validation
    const givenName = input.givenName?.trim();
    const familyName = input.familyName?.trim();
    if (!givenName || !familyName) {
      return { success: false, error: 'Given name and family name are mandatory for patient master indexing.' };
    }

    const dobValidation = validateDateOfBirth(input.dateOfBirth, input.dateOfBirthPrecision || 'EXACT');
    if (!dobValidation.valid) {
      return { success: false, error: dobValidation.error || 'Invalid date of birth' };
    }

    if (input.phone) {
      const normalized = normalizePhoneNumber(input.phone);
      if (normalized.length < 8) {
        return { success: false, error: 'Phone number format is invalid' };
      }
    }

    // 5. Deterministic Duplicate Detection Check
    const existingPatients = localDb.getPatients();
    const duplicateCandidates = evaluateDuplicates(
      {
        firstName: givenName,
        lastName: familyName,
        givenName,
        familyName,
        middleName: input.middleName,
        dateOfBirth: input.dateOfBirth,
        dateOfBirthPrecision: input.dateOfBirthPrecision || 'EXACT',
        gender: input.sex,
        sex: input.sex,
        nationalId: input.nationalId,
        phone: input.phone,
        villageTown: input.villageTown,
        district: input.district,
        primaryFacilityId: regFacility,
      },
      existingPatients
    );

    // If strong/high duplicates are detected
    if (duplicateCandidates.length > 0) {
      const highestScore = duplicateCandidates[0].overallScore;
      if (highestScore >= 65) {
        if (!options?.allowDuplicateOverride) {
          return {
            success: false,
            duplicateDetected: true,
            requiresOverride: true,
            duplicateCandidates,
            duplicates: duplicateCandidates,
            error: 'Possible duplicate patient record detected. Please review existing matching records.',
          };
        } else if (!options.duplicateOverrideReason || options.duplicateOverrideReason.trim().length < 3) {
          return {
            success: false,
            duplicateDetected: true,
            requiresOverride: true,
            duplicateCandidates,
            duplicates: duplicateCandidates,
            error: 'Clinical justification reason is required to override duplicate record warning.',
          };
        }
      }
    }

    // 6. Generate collision-resistant MRN and unique Patient ID
    const deviceId = typeof localStorage !== 'undefined' ? localStorage.getItem('jano_device_id_v2') || 'dev-01' : 'dev-01';
    const mrn = generateMRN(regFacility, deviceId);
    const patientId = generateEntityId('pat');
    const nowIso = new Date().toISOString();
    const isOnline = syncEngine.isEffectivelyOnline();
    const initialSyncStatus: PatientSyncStatus = isOnline ? 'PENDING_SYNC' : 'LOCAL_ONLY';

    // 7. Assemble Canonical Patient Aggregate
    const newPatient: Patient = {
      id: patientId,
      mrn,
      nationalId: input.nationalId?.trim() || undefined,
      nationalIdentifier: input.nationalId?.trim() || undefined,
      facilityPatientNumber: input.facilityPatientNumber?.trim() || undefined,
      
      // Demographics
      firstName: givenName,
      lastName: familyName,
      givenName,
      middleName: input.middleName?.trim() || undefined,
      familyName,
      preferredName: input.preferredName?.trim() || undefined,
      dateOfBirth: input.dateOfBirth,
      dateOfBirthPrecision: input.dateOfBirthPrecision || 'EXACT',
      gender: input.sex,
      sex: input.sex,
      genderIdentity: input.genderIdentity || undefined,
      maritalStatus: input.maritalStatus,

      // Contact
      phone: input.phone?.trim() || undefined,
      alternatePhone: input.alternatePhone?.trim() || undefined,
      email: input.email?.trim() || undefined,
      address: input.address?.trim() || undefined,
      villageTown: input.villageTown?.trim() || 'Unspecified Village',
      city: input.city?.trim() || undefined,
      district: input.district?.trim() || 'District Center',
      region: input.region?.trim() || 'Region 1',
      country: input.country?.trim() || 'Ethiopia',

      // Emergency Contact
      emergencyContact: input.emergencyContact,

      // Administrative
      registrationFacilityId: regFacility,
      primaryFacilityId: input.primaryFacilityId || regFacility,
      registrationDate: nowIso,
      patientStatus: 'ACTIVE',
      preferredLanguage: input.preferredLanguage || 'Amharic',
      occupation: input.occupation || undefined,

      // Clinical Identity Summaries (references only)
      bloodGroup: input.bloodGroup,
      pregnancyStatus: input.pregnancyStatus,
      allergiesSummary: input.allergiesSummary?.length
        ? input.allergiesSummary
        : ['No known drug allergies (NKDA)'],
      activeDiagnosesSummary: input.activeDiagnosesSummary || [],
      triageUrgency: input.triageUrgency || 'routine',

      // Metadata
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdById: principal.id,
      updatedById: principal.id,
      source: 'registration_form',
      provenance: `Registered at ${regFacility} by ${principal.fullName} (${principal.role})`,

      // Synchronization State
      syncStatus: initialSyncStatus,
    };

    // 8. Atomic Local Transaction (save to local database & in-memory repository)
    await localDb.savePatient(newPatient);
    localRepository.updateCache('patients', newPatient);

    // 9. Dispatch Canonical Domain Event (PatientRegistered)
    // PHI minimized payload: minimal identifiers required for distributed replication
    const eventPayload = {
      patientId: newPatient.id,
      mrn: newPatient.mrn,
      givenName: newPatient.givenName,
      familyName: newPatient.familyName,
      dateOfBirth: newPatient.dateOfBirth,
      dateOfBirthPrecision: newPatient.dateOfBirthPrecision,
      sex: newPatient.sex,
      registrationFacilityId: newPatient.registrationFacilityId,
      primaryFacilityId: newPatient.primaryFacilityId,
      triageUrgency: newPatient.triageUrgency,
      overrideReason: options?.duplicateOverrideReason,
    };

    await syncEngine.enqueue(
      'PatientRegistered',
      'Patient',
      newPatient.id,
      {
        ...eventPayload,
        registeredBy: principal.id,
        facilityId: regFacility,
      }
    );

    // 10. Record Security Audit Event (PHI Minimized)
    auditService.record(
      {
        actorId: principal.id,
        actorName: principal.fullName,
        actorRole: principal.role,
        facilityId: regFacility,
      },
      'PATIENT_REGISTERED',
      'Patient',
      newPatient.id,
      {
        mrn: newPatient.mrn,
        registrationFacilityId: regFacility,
        duplicateOverride: !!options?.allowDuplicateOverride,
      }
    );

    return {
      success: true,
      patient: newPatient,
    };
  }

  /**
   * Updates demographic or contact fields for an existing patient record.
   */
  public async updatePatientDemographics(
    principal: AuthenticatedPrincipal,
    patientId: string,
    updates: Partial<Patient>
  ): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    // 1. Authorization check
    if (!principal || !canUserPerform(principal, 'patient.update')) {
      this.recordUnauthorized(principal, 'patient:update', `Role [${principal?.role}] lacks update permission`);
      return { success: false, error: 'Access Denied: Demographics update unauthorized.' };
    }

    const patient = localDb.getPatientById(patientId);
    if (!patient) {
      return { success: false, error: `Patient not found: ${patientId}` };
    }

    if (patient.patientStatus === 'MERGED') {
      return { success: false, error: 'Cannot modify a retired merged patient record.' };
    }

    // Facility check
    if (principal.role !== 'system_administrator' && principal.facilityId !== patient.primaryFacilityId) {
      this.recordUnauthorized(principal, 'patient:update', 'Cross-facility update denied');
      return { success: false, error: 'Cannot update patients registered to other facilities.' };
    }

    const nowIso = new Date().toISOString();
    const updatedPatient: Patient = {
      ...patient,
      ...updates,
      id: patient.id, // prevent ID overwrite
      mrn: patient.mrn, // MRN is immutable
      version: (patient.version || 1) + 1,
      updatedAt: nowIso,
      updatedById: principal.id,
      syncStatus: syncEngine.isEffectivelyOnline() ? 'PENDING_SYNC' : 'LOCAL_ONLY',
    };

    // Ensure backwards compatibility aliases stay in sync
    if (updates.givenName) updatedPatient.firstName = updates.givenName;
    if (updates.familyName) updatedPatient.lastName = updates.familyName;
    if (updates.sex) updatedPatient.gender = updates.sex;

    await localDb.savePatient(updatedPatient);
    localRepository.updateCache('patients', updatedPatient);

    // Emits domain event
    await syncEngine.enqueue('PatientDemographicsUpdated', 'Patient', patient.id, {
      patientId: patient.id,
      updatedFields: Object.keys(updates),
      updatedBy: principal.id,
      facilityId: principal.facilityId,
    });

    // Record audit event
    auditService.record(
      {
        actorId: principal.id,
        actorName: principal.fullName,
        actorRole: principal.role,
        facilityId: principal.facilityId,
      },
      'PATIENT_DEMOGRAPHICS_UPDATED',
      'Patient',
      patient.id,
      { mrn: patient.mrn, updatedFieldCount: Object.keys(updates).length }
    );

    return { success: true, patient: updatedPatient };
  }

  /**
   * Updates patient status (ACTIVE, INACTIVE, DECEASED).
   */
  public async changePatientStatus(
    principal: AuthenticatedPrincipal,
    patientId: string,
    status: PatientStatus,
    reason?: string,
    deceasedAt?: string
  ): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    if (!principal || !canUserPerform(principal, 'patient.update')) {
      this.recordUnauthorized(principal, 'patient:update', 'Status change unauthorized');
      return { success: false, error: 'Unauthorized to change patient lifecycle status.' };
    }

    const patient = localDb.getPatientById(patientId);
    if (!patient) return { success: false, error: 'Patient not found' };

    if (patient.patientStatus === 'MERGED') {
      return { success: false, error: 'Cannot change status of a merged patient.' };
    }

    const nowIso = new Date().toISOString();
    const updated: Patient = {
      ...patient,
      patientStatus: status,
      deceasedAt: status === 'DECEASED' ? deceasedAt || nowIso : undefined,
      version: (patient.version || 1) + 1,
      updatedAt: nowIso,
      updatedById: principal.id,
      syncStatus: syncEngine.isEffectivelyOnline() ? 'PENDING_SYNC' : 'LOCAL_ONLY',
    };

    await localDb.savePatient(updated);
    localRepository.updateCache('patients', updated);

    await syncEngine.enqueue('PatientStatusChanged', 'Patient', patient.id, {
      patientId: patient.id,
      previousStatus: patient.patientStatus || 'ACTIVE',
      newStatus: status,
      reason,
      updatedBy: principal.id,
      facilityId: principal.facilityId,
    });

    auditService.record(
      {
        actorId: principal.id,
        actorName: principal.fullName,
        actorRole: principal.role,
        facilityId: principal.facilityId,
      },
      'PATIENT_STATUS_CHANGED',
      'Patient',
      patient.id,
      { mrn: patient.mrn, newStatus: status, reason }
    );

    return { success: true, patient: updated };
  }

  /**
   * Performs an authoritative merge of a duplicate patient chart into a surviving chart.
   * Preserves both records in history; marks duplicate as MERGED with pointer to survivor.
   */
  public async mergePatients(
    principal: AuthenticatedPrincipal,
    survivorId: string,
    duplicateId: string,
    reason: string
  ): Promise<PatientMergeResult> {
    // 1. Authorization: patient:merge or facility/system admin
    const canMerge =
      canUserPerform(principal, 'patient.merge') ||
      canUserPerform(principal, 'patient:merge') ||
      isFacilityAdmin(principal.role);

    if (!canMerge) {
      this.recordUnauthorized(principal, 'patient:merge', `Role [${principal.role}] lacks merge authority`);
      return { success: false, error: 'Unauthorized: Patient merge requires administrative authority.' };
    }

    if (survivorId === duplicateId) {
      return { success: false, error: 'Cannot merge a patient record with itself.' };
    }

    const survivor = localDb.getPatientById(survivorId);
    const duplicate = localDb.getPatientById(duplicateId);

    if (!survivor || !duplicate) {
      return { success: false, error: 'One or both patient records could not be found.' };
    }

    if (duplicate.patientStatus === 'MERGED') {
      return { success: false, error: 'The secondary patient is already retired as merged.' };
    }

    if (survivor.patientStatus === 'MERGED') {
      return { success: false, error: 'Cannot merge into an already-merged surviving record.' };
    }

    const nowIso = new Date().toISOString();

    // Update duplicate to MERGED
    const retiredDuplicate: Patient = {
      ...duplicate,
      patientStatus: 'MERGED',
      mergedIntoPatientId: survivor.id,
      mergeReason: reason,
      mergedAt: nowIso,
      mergedById: principal.id,
      version: (duplicate.version || 1) + 1,
      updatedAt: nowIso,
      updatedById: principal.id,
      syncStatus: syncEngine.isEffectivelyOnline() ? 'PENDING_SYNC' : 'LOCAL_ONLY',
    };

    // Update survivor record provenance notes
    const updatedSurvivor: Patient = {
      ...survivor,
      version: (survivor.version || 1) + 1,
      updatedAt: nowIso,
      updatedById: principal.id,
      syncStatus: syncEngine.isEffectivelyOnline() ? 'PENDING_SYNC' : 'LOCAL_ONLY',
    };

    await localDb.savePatient(retiredDuplicate);
    await localDb.savePatient(updatedSurvivor);
    localRepository.updateCache('patients', retiredDuplicate);
    localRepository.updateCache('patients', updatedSurvivor);

    // Emit PatientMerged domain event
    await syncEngine.enqueue('PatientMerged', 'Patient', survivor.id, {
      survivorPatientId: survivor.id,
      duplicatePatientId: duplicate.id,
      survivorMRN: survivor.mrn,
      duplicateMRN: duplicate.mrn,
      reason,
      mergedBy: principal.id,
      facilityId: principal.facilityId,
    });

    // Record Security Audit Event
    auditService.record(
      {
        actorId: principal.id,
        actorName: principal.fullName,
        actorRole: principal.role,
        facilityId: principal.facilityId,
      },
      'PATIENT_MERGED',
      'Patient',
      survivor.id,
      {
        survivorMRN: survivor.mrn,
        duplicateId: duplicate.id,
        duplicateMRN: duplicate.mrn,
        reason,
      }
    );

    return {
      success: true,
      survivingPatient: updatedSurvivor,
      retiredPatient: retiredDuplicate,
    };
  }

  /**
   * Search patients with role and facility context.
   */
  public async searchPatients(
    principal: AuthenticatedPrincipal,
    query: string,
    filterToFacility?: boolean
  ): Promise<Patient[]> {
    if (!principal || !canUserPerform(principal, 'patient.read')) {
      this.recordUnauthorized(principal, 'patient:read', 'Patient search unauthorized');
      return [];
    }

    const q = query.trim().toLowerCase();
    const all = localDb.getPatients();

    const facilityFilter = filterToFacility && principal.role !== 'system_administrator' ? principal.facilityId : null;

    const filtered = all.filter((p) => {
      if (facilityFilter && p.primaryFacilityId !== facilityFilter) {
        return false;
      }
      if (!q) return true;

      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
      const givenName = (p.givenName || '').toLowerCase();
      const familyName = (p.familyName || '').toLowerCase();
      const mrn = p.mrn.toLowerCase();
      const natId = (p.nationalId || p.nationalIdentifier || '').toLowerCase();
      const phone = (p.phone || '').toLowerCase();
      const village = (p.villageTown || '').toLowerCase();
      const dob = (p.dateOfBirth || '').toLowerCase();

      return (
        fullName.includes(q) ||
        givenName.includes(q) ||
        familyName.includes(q) ||
        mrn.includes(q) ||
        natId.includes(q) ||
        phone.includes(q) ||
        village.includes(q) ||
        dob.includes(q)
      );
    });

    // Audit search operation (minimized criteria, no PHI result logging)
    if (q.length >= 2) {
      auditService.record(
        {
          actorId: principal.id,
          actorName: principal.fullName,
          actorRole: principal.role,
          facilityId: principal.facilityId,
        },
        'PATIENT_SEARCHED',
        'Patient',
        'query_search',
        { queryLength: q.length, matchCount: filtered.length }
      );
    }

    return filtered;
  }

  /**
   * Authoritative lookup of a single patient record with security gating and audit trail.
   */
  public async getPatientById(
    principal: AuthenticatedPrincipal,
    patientId: string,
    options: { recordAudit?: boolean } = { recordAudit: true }
  ): Promise<Patient | null> {
    if (!principal || !canUserPerform(principal, 'patient.read')) {
      this.recordUnauthorized(principal, 'patient:read', `Role [${principal?.role}] cannot view patient charts`);
      return null;
    }

    const patient = localDb.getPatientById(patientId);
    if (!patient) return null;

    // Record access audit (PATIENT_VIEWED)
    if (options.recordAudit) {
      auditService.record(
        {
          actorId: principal.id,
          actorName: principal.fullName,
          actorRole: principal.role,
          facilityId: principal.facilityId,
        },
        'PATIENT_VIEWED',
        'Patient',
        patient.id,
        { mrn: patient.mrn, patientStatus: patient.patientStatus }
      );
    }

    return patient;
  }

  private recordUnauthorized(principal: AuthenticatedPrincipal, capability: string, reason: string): void {
    auditService.record(
      {
        actorId: principal?.id || 'anonymous',
        actorName: principal?.fullName || 'Anonymous User',
        actorRole: principal?.role || 'receptionist',
        facilityId: principal?.facilityId || 'unassigned',
      },
      'UNAUTHORIZED_ACTION_ATTEMPTED',
      'Patient',
      'security_gate',
      { attemptedAction: capability, failureReason: reason }
    );
  }
}

export const patientService = PatientService.getInstance();
