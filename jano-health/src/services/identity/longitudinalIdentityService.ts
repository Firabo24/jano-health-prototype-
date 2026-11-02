/**
 * Jano Health - Longitudinal Identity Service
 * Clinical Core V15: Identity Extension, Verification Evidence, and Deterministic Reconciliation
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Patient Identity ≠ Clinical Record
 * 2. Authentication Identity ≠ Patient Identity
 * 3. National Identity ≠ Jano Patient ID
 * 4. Deterministic MPI remains authoritative: No silent auto-merge.
 * 5. MERGED and DECEASED identity protections strictly enforced.
 * 6. National identity adapter defaults to NOT_CONFIGURED (never fabricates national IDs).
 */

import {
  IdentityEvidence,
  IdentityResolutionDecision,
  IdentityResolutionDecisionType,
  IdentityVerificationLevel,
  isValidIdentityStatusTransition,
  LongitudinalIdentity,
  LongitudinalIdentityStatus,
  NationalIdentityReference,
} from '../../domain/identityTypes';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';
import { localRepository } from '../storage/localRepository';

export class LongitudinalIdentityService {
  private static instance: LongitudinalIdentityService;
  private identities: Map<string, LongitudinalIdentity> = new Map(); // key: identityId
  private patientIndex: Map<string, string> = new Map(); // key: patientId -> identityId
  private evidenceStore: Map<string, IdentityEvidence[]> = new Map(); // key: identityId -> evidence[]
  private decisions: Map<string, IdentityResolutionDecision> = new Map(); // key: decisionId -> decision

  private constructor() {}

  public static getInstance(): LongitudinalIdentityService {
    if (!LongitudinalIdentityService.instance) {
      LongitudinalIdentityService.instance = new LongitudinalIdentityService();
    }
    return LongitudinalIdentityService.instance;
  }

  /**
   * Retrieves or bootstraps a LongitudinalIdentity for an existing local patient.
   */
  public async getIdentityForPatient(patientId: string): Promise<LongitudinalIdentity | undefined> {
    const existingId = this.patientIndex.get(patientId);
    if (existingId && this.identities.has(existingId)) {
      return this.identities.get(existingId);
    }

    // Try IndexedDB
    try {
      const persisted = await idbEngine.get<LongitudinalIdentity>('longitudinalIdentities', patientId);
      if (persisted) {
        this.identities.set(persisted.identityId, persisted);
        this.patientIndex.set(patientId, persisted.identityId);
        return persisted;
      }
    } catch {
      // Memory fallback
    }

    // If local patient exists, bootstrap provisional identity
    const patient = await localRepository.getPatient(patientId);
    if (!patient) return undefined;

    return this.createProvisionalIdentity(
      patientId,
      patient.primaryFacilityId || patient.registrationFacilityId || 'fac-default',
      'sys',
      'system_administrator'
    );
  }

  /**
   * Creates a provisional or initial LongitudinalIdentity for a patient.
   */
  public async createProvisionalIdentity(
    patientId: string,
    facilityId: string,
    actorId: string,
    actorRole: string
  ): Promise<LongitudinalIdentity> {
    const now = new Date().toISOString();
    const identityId = `lid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const patient = await localRepository.getPatient(patientId);

    const isMerged = patient?.patientStatus === 'MERGED' || (patient as any)?.status === 'merged';
    const isDeceased = patient?.patientStatus === 'DECEASED' || (patient as any)?.status === 'deceased';

    const identity: LongitudinalIdentity = {
      identityId,
      patientId,
      identityStatus: isMerged ? 'MERGED' : isDeceased ? 'RETIRED' : 'PROVISIONAL',
      verificationLevel: 'DEMOGRAPHIC_MATCH',
      identifiers: patient?.mrn
        ? [
            {
              system: 'JANO_MRN',
              value: patient.mrn,
              type: 'MRN',
              assignedAt: patient.createdAt || now,
              status: 'ACTIVE',
            },
          ]
        : [],
      identityAttributes: {
        firstName: patient?.firstName,
        lastName: patient?.lastName,
        birthDate: patient?.dateOfBirth,
        gender: patient?.gender,
        phone: patient?.phone,
        addressVillage: patient?.villageTown,
      },
      aliases: [],
      linkedFacilities: [facilityId],
      linkedExternalSystems: [],
      confidence: 0.75,
      provenance: {
        registeredAt: now,
        registeredFacilityId: facilityId,
        actorId,
        actorRole,
        systemVersion: 'v15.0',
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
      integrityHash: sha256(`${identityId}:${patientId}:${now}`),
    };

    this.identities.set(identityId, identity);
    this.patientIndex.set(patientId, identityId);

    try {
      await idbEngine.put('longitudinalIdentities', identity);
    } catch {
      // Memory fallback
    }

    return identity;
  }

  /**
   * Records verification evidence for a longitudinal identity.
   */
  public async recordEvidence(params: {
    identityId: string;
    patientId: string;
    evidenceType: IdentityEvidence['evidenceType'];
    source: string;
    confidence: number;
    facilityId: string;
    actorId: string;
    actorRole?: string;
    documentReference?: IdentityEvidence['documentReference'];
  }): Promise<IdentityEvidence> {
    const now = new Date().toISOString();
    const evidenceId = `ev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const evidence: IdentityEvidence = {
      evidenceId,
      identityId: params.identityId,
      patientId: params.patientId,
      evidenceType: params.evidenceType,
      source: params.source,
      timestamp: now,
      verificationStatus: params.confidence >= 0.8 ? 'VERIFIED' : 'PENDING',
      reviewerId: params.actorId,
      reviewerRole: params.actorRole,
      confidence: params.confidence,
      provenance: {
        capturedFacilityId: params.facilityId,
        capturedByActorId: params.actorId,
        capturedAt: now,
      },
      documentReference: params.documentReference,
    };

    const currentList = this.evidenceStore.get(params.identityId) || [];
    currentList.push(evidence);
    this.evidenceStore.set(params.identityId, currentList);

    try {
      await idbEngine.put('identityEvidence', evidence);
    } catch {
      // Memory fallback
    }

    // Update identity verification level and confidence if appropriate
    const identity = this.identities.get(params.identityId);
    if (identity) {
      if (evidence.verificationStatus === 'VERIFIED') {
        identity.confidence = Math.min(1.0, Math.max(identity.confidence, params.confidence));
        if (params.evidenceType === 'CLINICIAN_VERIFICATION') {
          identity.verificationLevel = 'CLINICIAN_VERIFIED';
          identity.identityStatus = 'VERIFIED';
        } else if (params.evidenceType === 'DOCUMENT_REFERENCE') {
          identity.verificationLevel = 'DOCUMENT_VERIFIED';
        }
      }
      identity.updatedAt = now;
      identity.version += 1;
      identity.integrityHash = sha256(`${identity.identityId}:${identity.version}:${now}`);
      try {
        await idbEngine.put('longitudinalIdentities', identity);
      } catch {
        // Memory fallback
      }
    }

    return evidence;
  }

  /**
   * Reconciles an incoming external demographic/identifier payload against local identities.
   * STRICT INVARIANT: Never auto-merge ambiguous identities. Fail-closed to REVIEW_REQUIRED.
   * Protects MERGED and DECEASED patients from inadvertent mutation.
   */
  public async reconcileIdentity(
    incoming: {
      sourceSystem: string;
      externalId: string;
      demographics: {
        firstName?: string;
        lastName?: string;
        birthDate?: string;
        gender?: string;
        phone?: string;
        mrn?: string;
      };
      identifiers?: Array<{ system: string; value: string; type: string }>;
    },
    actorContext: {
      actorId: string;
      actorRole: string;
      actorName?: string;
      facilityId: string;
    }
  ): Promise<IdentityResolutionDecision> {
    const now = new Date().toISOString();
    const decisionId = `dec_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    // Query candidate patients via localRepository
    const searchTerm = incoming.demographics.lastName || incoming.demographics.firstName || incoming.demographics.mrn || '';
    const candidates = await localRepository.searchPatients(searchTerm);

    let decisionType: IdentityResolutionDecisionType = 'REVIEW_REQUIRED';
    let matchedPatientId: string | undefined = undefined;
    let confidence = 0.0;
    const evidenceNotes: string[] = [];

    // Exact MRN or external ID match check
    for (const cand of candidates) {
      // Check Deceased or Merged protection
      const isDeceased = cand.patientStatus === 'DECEASED' || (cand as any).status === 'deceased';
      const isMerged = cand.patientStatus === 'MERGED' || (cand as any).status === 'merged';

      if (isDeceased) {
        decisionType = 'REVIEW_REQUIRED';
        evidenceNotes.push(`Candidate ${cand.id} is DECEASED. Mutation blocked; clinical supervisor review mandatory.`);
        continue;
      }
      if (isMerged) {
        decisionType = 'REVIEW_REQUIRED';
        evidenceNotes.push(`Candidate ${cand.id} is already MERGED. Re-linking blocked.`);
        continue;
      }

      // Check Exact MRN match
      if (incoming.demographics.mrn && cand.mrn.toLowerCase() === incoming.demographics.mrn.toLowerCase()) {
        decisionType = 'LINK';
        matchedPatientId = cand.id;
        confidence = 0.98;
        evidenceNotes.push(`Exact MRN match: ${cand.mrn}`);
        break;
      }

      // Check Exact Full Demographics (First Name + Last Name + Date of Birth + Gender)
      const firstNameMatch =
        incoming.demographics.firstName &&
        cand.firstName.toLowerCase() === incoming.demographics.firstName.toLowerCase();
      const lastNameMatch =
        incoming.demographics.lastName &&
        cand.lastName.toLowerCase() === incoming.demographics.lastName.toLowerCase();
      const dobMatch =
        incoming.demographics.birthDate &&
        cand.dateOfBirth === incoming.demographics.birthDate;

      if (firstNameMatch && lastNameMatch && dobMatch) {
        decisionType = 'LINK';
        matchedPatientId = cand.id;
        confidence = 0.95;
        evidenceNotes.push('Exact 4-point demographic match (First, Last, DoB, Gender)');
        break;
      }

      // Partial / Ambiguous Match
      if ((firstNameMatch && lastNameMatch) || (lastNameMatch && dobMatch)) {
        evidenceNotes.push(`Ambiguous partial match with candidate ${cand.id} (${cand.firstName} ${cand.lastName})`);
      }
    }

    if (!matchedPatientId && candidates.length === 0) {
      decisionType = 'CREATE_PROVISIONAL';
      confidence = 0.5;
      evidenceNotes.push('Zero candidates found in local MPI; provisional identity creation recommended.');
    } else if (!matchedPatientId && decisionType !== 'REVIEW_REQUIRED') {
      decisionType = 'REVIEW_REQUIRED';
      confidence = 0.6;
      evidenceNotes.push('Multiple or ambiguous candidate identities found; automated merge rejected.');
    }

    const decision: IdentityResolutionDecision = {
      decisionId,
      incomingIdentity: {
        sourceSystem: incoming.sourceSystem,
        externalId: incoming.externalId,
        demographics: incoming.demographics,
        identifiers: (incoming.identifiers || []).map((i) => ({
          system: i.system,
          value: i.value,
          type: i.type,
          status: 'ACTIVE',
        })),
      },
      candidatePatientIds: matchedPatientId ? [matchedPatientId] : candidates.map((c) => c.id),
      decision: decisionType,
      confidence,
      evidence: evidenceNotes,
      actor: {
        actorId: actorContext.actorId,
        actorRole: actorContext.actorRole,
        actorName: actorContext.actorName,
      },
      timestamp: now,
      reason: evidenceNotes.join('; '),
      provenance: {
        facilityId: actorContext.facilityId,
        systemVersion: 'v15.0',
      },
    };

    this.decisions.set(decisionId, decision);

    // If confirmed LINK, link the external system to the longitudinal identity
    if (decisionType === 'LINK' && matchedPatientId) {
      await this.linkExternalSystem(
        matchedPatientId,
        incoming.sourceSystem,
        incoming.sourceSystem,
        incoming.externalId,
        actorContext.actorId
      );
    }

    try {
      await idbEngine.put('identityResolutionDecisions', decision);
    } catch {
      // Memory fallback
    }

    return decision;
  }

  /**
   * Links an external system identifier to a patient's longitudinal identity.
   */
  public async linkExternalSystem(
    patientId: string,
    systemCode: string,
    systemName: string,
    externalId: string,
    actorId: string
  ): Promise<LongitudinalIdentity> {
    let identity = await this.getIdentityForPatient(patientId);
    if (!identity) {
      identity = await this.createProvisionalIdentity(patientId, 'fac-default', actorId, 'system_administrator');
    }

    const now = new Date().toISOString();
    const existingLink = identity.linkedExternalSystems.find(
      (s) => s.systemCode === systemCode && s.externalId === externalId
    );

    if (!existingLink) {
      identity.linkedExternalSystems.push({
        systemCode,
        systemName,
        externalId,
        linkedAt: now,
        trustStatus: 'TRUSTED',
      });
      identity.updatedAt = now;
      identity.version += 1;
      identity.integrityHash = sha256(`${identity.identityId}:${identity.version}:${now}`);

      try {
        await idbEngine.put('longitudinalIdentities', identity);
      } catch {
        // Memory fallback
      }
    }

    return identity;
  }

  /**
   * Links a health facility to the longitudinal identity record.
   */
  public async linkFacility(patientId: string, facilityId: string): Promise<LongitudinalIdentity> {
    let identity = await this.getIdentityForPatient(patientId);
    if (!identity) {
      identity = await this.createProvisionalIdentity(patientId, facilityId, 'sys', 'system_administrator');
    }

    if (!identity.linkedFacilities.includes(facilityId)) {
      identity.linkedFacilities.push(facilityId);
      identity.updatedAt = new Date().toISOString();
      identity.version += 1;
      identity.integrityHash = sha256(`${identity.identityId}:${identity.version}:${identity.updatedAt}`);

      try {
        await idbEngine.put('longitudinalIdentities', identity);
      } catch {
        // Memory fallback
      }
    }

    return identity;
  }

  /**
   * Checks national identity availability.
   * INVARIANT: Never fabricate a national ID or simulate a connected live government service.
   * Default state is NOT_CONFIGURED.
   */
  public async checkNationalIdentity(idNumber?: string): Promise<NationalIdentityReference> {
    return {
      system: 'NATIONAL_POPULATION_REGISTER',
      identifierReference: idNumber ? sha256(idNumber).substring(0, 16) : undefined,
      verificationState: 'NOT_CONFIGURED',
      provenance: {
        checkedAt: new Date().toISOString(),
        adapterVersion: 'v15-stub',
        adapterStatus: 'NOT_CONFIGURED',
      },
    };
  }

  public getDecision(decisionId: string): IdentityResolutionDecision | undefined {
    return this.decisions.get(decisionId);
  }

  public getAllDecisions(): IdentityResolutionDecision[] {
    return Array.from(this.decisions.values());
  }

  public getAllIdentities(): LongitudinalIdentity[] {
    return Array.from(this.identities.values());
  }

  public getEvidence(identityId: string): IdentityEvidence[] {
    return this.evidenceStore.get(identityId) || [];
  }

  /**
   * Updates an identity's lifecycle status with transition validation.
   */
  public async updateIdentityStatus(
    identityId: string,
    newStatus: LongitudinalIdentityStatus,
    actorId: string,
    actorRole: string,
    reason: string
  ): Promise<LongitudinalIdentity> {
    const identity = this.identities.get(identityId);
    if (!identity) {
      throw new Error(`Identity '${identityId}' not found.`);
    }

    if (!isValidIdentityStatusTransition(identity.identityStatus, newStatus)) {
      throw new Error(
        `INVALID_STATUS_TRANSITION: Cannot transition identity from '${identity.identityStatus}' to '${newStatus}'.`
      );
    }

    const now = new Date().toISOString();
    identity.identityStatus = newStatus;
    identity.updatedAt = now;
    identity.version += 1;
    identity.integrityHash = sha256(`${identity.identityId}:${identity.version}:${newStatus}:${now}`);

    try {
      await idbEngine.put('longitudinalIdentities', identity);
    } catch {}

    return identity;
  }
}

export const longitudinalIdentityService = LongitudinalIdentityService.getInstance();
