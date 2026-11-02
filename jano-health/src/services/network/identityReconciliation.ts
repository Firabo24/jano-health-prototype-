/**
 * Jano Health - Multi-Facility Patient Identity & Reconciliation Subsystem
 * Clinical Core V13: Deterministic Cross-Facility MPI Linking and Anti-Auto-Merge Safeguards
 */

import { ExternalPatientIdentity, Patient } from '../../domain/types';
import { sha256 } from '../../domain/eventIntegrity';
import { localRepository } from '../storage/localRepository';
import { idbEngine } from '../storage/indexedDbEngine';

export interface DemographicMatchCandidate {
  patientId: string;
  mrn: string;
  name: string;
  dob: string;
  score: number;
  matchReasons: string[];
}

export interface ReconcilePatientResult {
  status: 'EXACT_MATCH' | 'AMBIGUOUS_MATCH' | 'NO_MATCH';
  patientId?: string;
  externalIdentity?: ExternalPatientIdentity;
  candidates?: DemographicMatchCandidate[];
  reason: string;
}

export class MultiFacilityIdentityReconciler {
  private static instance: MultiFacilityIdentityReconciler;
  private externalIdentities: Map<string, ExternalPatientIdentity> = new Map();

  private constructor() {}

  public static getInstance(): MultiFacilityIdentityReconciler {
    if (!MultiFacilityIdentityReconciler.instance) {
      MultiFacilityIdentityReconciler.instance = new MultiFacilityIdentityReconciler();
    }
    return MultiFacilityIdentityReconciler.instance;
  }

  public async reconcileIncomingPatient(params: {
    externalIdentifier: string;
    identifierSystem?: string;
    sourceSystem?: string;
    sourceNodeId: string;
    sourceFacilityId: string;
    nationalId?: string;
    mrn?: string;
    firstName: string;
    lastName: string;
    dob: string;
    gender: 'male' | 'female' | 'other' | 'unknown';
    recordedBy: string;
  }): Promise<ReconcilePatientResult> {
    const system = params.identifierSystem || `urn:jano:facility:${params.sourceFacilityId}:mrn`;
    const identityKey = `${params.sourceNodeId}:${params.externalIdentifier}`;

    // 1. Check existing cached ExternalPatientIdentity
    const existing = this.externalIdentities.get(identityKey);
    if (existing && existing.verificationStatus !== 'REJECTED' && existing.verificationStatus !== 'CONFLICT') {
      const localPat = await localRepository.getPatientById(existing.patientId);
      if (localPat) {
        existing.lastVerifiedAt = new Date().toISOString();
        return {
          status: 'EXACT_MATCH',
          patientId: existing.patientId,
          externalIdentity: existing,
          reason: `Previously verified link for external identifier '${params.externalIdentifier}' from node '${params.sourceNodeId}'.`,
        };
      }
    }

    // 2. Query all local patients for deterministic MPI evaluation
    const allPatients = await localRepository.getAllPatients();
    const candidates: DemographicMatchCandidate[] = [];

    const normExternalFirst = params.firstName.trim().toLowerCase();
    const normExternalLast = params.lastName.trim().toLowerCase();
    const normExternalDOB = params.dob.trim();

    for (const pat of allPatients) {
      const normLocalFirst = (pat.firstName || '').trim().toLowerCase();
      const normLocalLast = (pat.lastName || '').trim().toLowerCase();
      const normLocalDOB = (pat.dateOfBirth || '').trim();

      // Check National ID exact match
      if (params.nationalId && pat.nationalId && pat.nationalId.trim() === params.nationalId.trim()) {
        candidates.push({
          patientId: pat.id,
          mrn: pat.mrn,
          name: `${pat.firstName} ${pat.lastName}`,
          dob: pat.dateOfBirth,
          score: 1.0,
          matchReasons: ['Exact National ID match'],
        });
        continue;
      }

      // Check MRN exact match (when facility contexts align)
      if (params.mrn && pat.mrn && pat.mrn.trim().toLowerCase() === params.mrn.trim().toLowerCase()) {
        candidates.push({
          patientId: pat.id,
          mrn: pat.mrn,
          name: `${pat.firstName} ${pat.lastName}`,
          dob: pat.dateOfBirth,
          score: 0.98,
          matchReasons: ['Exact MRN match'],
        });
        continue;
      }

      // Check Full Name + DOB + Gender match
      const nameMatch = normLocalFirst === normExternalFirst && normLocalLast === normExternalLast;
      const dobMatch = normLocalDOB === normExternalDOB;
      const genderMatch = pat.gender === params.gender || pat.sex === params.gender;

      if (nameMatch && dobMatch && genderMatch) {
        candidates.push({
          patientId: pat.id,
          mrn: pat.mrn,
          name: `${pat.firstName} ${pat.lastName}`,
          dob: pat.dateOfBirth,
          score: 0.95,
          matchReasons: ['Exact first name, last name, date of birth, and gender match'],
        });
        continue;
      }

      // Check Ambiguous match scenarios
      const reasons: string[] = [];
      let score = 0;

      if (normLocalLast === normExternalLast && dobMatch) {
        reasons.push('Same surname and date of birth');
        score += 0.55;
      } else if (nameMatch && !dobMatch) {
        reasons.push('Identical full name but discordant date of birth');
        score += 0.45;
      } else if (normLocalLast === normExternalLast && (normLocalFirst.includes(normExternalFirst) || normExternalFirst.includes(normLocalFirst))) {
        reasons.push('Matching surname with partial given name');
        score += 0.40;
      }

      if (score >= 0.40) {
        candidates.push({
          patientId: pat.id,
          mrn: pat.mrn,
          name: `${pat.firstName} ${pat.lastName}`,
          dob: pat.dateOfBirth,
          score,
          matchReasons: reasons,
        });
      }
    }

    // 3. Process Evaluation Results
    const highConfidenceMatches = candidates.filter((c) => c.score >= 0.90);

    // EXACT HIGH-CONFIDENCE MATCH
    if (highConfidenceMatches.length === 1 && candidates.length === 1) {
      const match = highConfidenceMatches[0];
      const targetPatient = await localRepository.getPatientById(match.patientId);

      // Handle merged patient protections
      const effectivePatientId = targetPatient?.mergedIntoPatientId || match.patientId;

      const extIdentity: ExternalPatientIdentity = {
        id: `ext-id-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        patientId: effectivePatientId,
        sourceSystem: params.sourceSystem || `node:${params.sourceNodeId}`,
        sourceNodeId: params.sourceNodeId,
        sourceFacilityId: params.sourceFacilityId,
        externalIdentifier: params.externalIdentifier,
        identifierSystem: system,
        identifierValueHash: sha256(params.externalIdentifier),
        verificationStatus: 'VERIFIED',
        firstSeenAt: new Date().toISOString(),
        lastVerifiedAt: new Date().toISOString(),
        provenance: {
          recordedBy: params.recordedBy,
          timestamp: new Date().toISOString(),
          notes: `Deterministic match with score ${match.score}: ${match.matchReasons.join('; ')}`,
        },
      };

      this.externalIdentities.set(identityKey, extIdentity);
      try {
        await idbEngine.put('externalPatientIdentities', extIdentity);
      } catch {
        // Memory fallback
      }

      return {
        status: 'EXACT_MATCH',
        patientId: effectivePatientId,
        externalIdentity: extIdentity,
        reason: `Reconciled to patient ${effectivePatientId} (${match.name}) via ${match.matchReasons[0]}.`,
      };
    }

    // AMBIGUOUS MULTI-MATCH -> Anti-Auto-Merge Guard
    if (candidates.length > 0) {
      return {
        status: 'AMBIGUOUS_MATCH',
        candidates: candidates.sort((a, b) => b.score - a.score),
        reason: `IDENTITY_CONFLICT: Multiple demographic candidates (${candidates.length}) detected. Anti-auto-merge guard active.`,
      };
    }

    // NO MATCH
    return {
      status: 'NO_MATCH',
      reason: `No matching patient record found in local master patient index for '${params.firstName} ${params.lastName}'.`,
    };
  }

  public async linkExternalIdentity(
    localPatientId: string,
    params: {
      externalIdentifier: string;
      identifierSystem?: string;
      sourceSystem?: string;
      sourceNodeId: string;
      sourceFacilityId: string;
      recordedBy: string;
      notes?: string;
    }
  ): Promise<ExternalPatientIdentity> {
    const extIdentity: ExternalPatientIdentity = {
      id: `ext-id-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      patientId: localPatientId,
      sourceSystem: params.sourceSystem || `node:${params.sourceNodeId}`,
      sourceNodeId: params.sourceNodeId,
      sourceFacilityId: params.sourceFacilityId,
      externalIdentifier: params.externalIdentifier,
      identifierSystem: params.identifierSystem || `urn:jano:facility:${params.sourceFacilityId}:mrn`,
      identifierValueHash: sha256(params.externalIdentifier),
      verificationStatus: 'RECONCILED',
      firstSeenAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      provenance: {
        recordedBy: params.recordedBy,
        timestamp: new Date().toISOString(),
        notes: params.notes || 'Manually verified and reconciled by clinician reviewer',
      },
    };

    const identityKey = `${params.sourceNodeId}:${params.externalIdentifier}`;
    this.externalIdentities.set(identityKey, extIdentity);

    try {
      await idbEngine.put('externalPatientIdentities', extIdentity);
    } catch {
      // Memory fallback
    }

    return extIdentity;
  }

  public getLinkedIdentities(patientId: string): ExternalPatientIdentity[] {
    return Array.from(this.externalIdentities.values()).filter((e) => e.patientId === patientId);
  }

  public resetToSyntheticDemo(): void {
    this.externalIdentities.clear();
  }
}

export const multiFacilityIdentityReconciler = MultiFacilityIdentityReconciler.getInstance();
