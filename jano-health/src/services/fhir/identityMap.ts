/**
 * Jano Health - FHIR Identity Mapping & MPI Reconciliation
 * Distinguishes authoritative Jano aggregate IDs from FHIR exchange resource IDs.
 * Implements strict patient identity reconciliation with anti-auto-merge safeguards.
 */

import { IdentityMatchStatus, IdentityReconciliationResult, FHIRPatient } from './types';
import { JANO_PATIENT_MRN_SYSTEM, JANO_PATIENT_NATIONAL_ID_SYSTEM, JANO_SYSTEM_BASE } from './constants';
import { localRepository } from '../storage/localRepository';

export interface IdentityMapEntry {
  janoId: string;
  fhirId: string;
  resourceType: string;
  sourceSystem: string;
  sourceIdentifier: string;
  jurisdiction?: string;
  confidence: number;
  status: IdentityMatchStatus;
  createdAt: string;
  updatedAt: string;
}

export class FHIRIdentityMap {
  private static instance: FHIRIdentityMap;
  // Key: `${resourceType}:${fhirId}` -> IdentityMapEntry
  private fhirToJanoMap = new Map<string, IdentityMapEntry>();
  // Key: `${resourceType}:${janoId}` -> IdentityMapEntry[]
  private janoToFhirMap = new Map<string, IdentityMapEntry[]>();
  // Key: `${sourceSystem}:${sourceIdentifier}` -> IdentityMapEntry
  private sourceToJanoMap = new Map<string, IdentityMapEntry>();

  private constructor() {}

  public static getInstance(): FHIRIdentityMap {
    if (!FHIRIdentityMap.instance) {
      FHIRIdentityMap.instance = new FHIRIdentityMap();
    }
    return FHIRIdentityMap.instance;
  }

  public registerMapping(entry: Omit<IdentityMapEntry, 'createdAt' | 'updatedAt'>): IdentityMapEntry {
    const now = new Date().toISOString();
    const fullEntry: IdentityMapEntry = {
      ...entry,
      createdAt: now,
      updatedAt: now,
    };

    const fhirKey = `${entry.resourceType}:${entry.fhirId}`;
    this.fhirToJanoMap.set(fhirKey, fullEntry);

    const janoKey = `${entry.resourceType}:${entry.janoId}`;
    const existing = this.janoToFhirMap.get(janoKey) || [];
    const filtered = existing.filter((e) => e.fhirId !== entry.fhirId);
    filtered.push(fullEntry);
    this.janoToFhirMap.set(janoKey, filtered);

    if (entry.sourceSystem && entry.sourceIdentifier) {
      const srcKey = `${entry.sourceSystem}:${entry.sourceIdentifier}`;
      this.sourceToJanoMap.set(srcKey, fullEntry);
    }

    return fullEntry;
  }

  public getJanoId(resourceType: string, fhirId: string): string | undefined {
    const entry = this.fhirToJanoMap.get(`${resourceType}:${fhirId}`);
    return entry?.janoId;
  }

  public getFhirId(resourceType: string, janoId: string, sourceSystem: string = JANO_SYSTEM_BASE): string | undefined {
    const entries = this.janoToFhirMap.get(`${resourceType}:${janoId}`) || [];
    const match = entries.find((e) => e.sourceSystem === sourceSystem) || entries[0];
    return match?.fhirId;
  }

  public getBySourceIdentifier(sourceSystem: string, sourceIdentifier: string): IdentityMapEntry | undefined {
    return this.sourceToJanoMap.get(`${sourceSystem}:${sourceIdentifier}`);
  }

  public getAllMappings(): IdentityMapEntry[] {
    return Array.from(this.fhirToJanoMap.values());
  }

  public clear(): void {
    this.fhirToJanoMap.clear();
    this.janoToFhirMap.clear();
    this.sourceToJanoMap.clear();
  }

  /**
   * Reconcile an inbound external FHIR Patient against Jano MPI records.
   * STRICT SAFETY RULE: Under no circumstances does this automatically merge ambiguous records.
   */
  public async reconcilePatient(fhirPatient: FHIRPatient, defaultFacilityId: string): Promise<IdentityReconciliationResult> {
    const identifiers = fhirPatient.identifier || [];

    // 1. Check for explicit Jano MRN identifier
    const janoMrnId = identifiers.find((id) => id.system === JANO_PATIENT_MRN_SYSTEM)?.value;
    if (janoMrnId) {
      const patient = await localRepository.getPatientByMrn(janoMrnId);
      if (patient) {
        return {
          status: 'MATCH_CONFIRMED',
          localPatientId: patient.id,
          confidenceScore: 1.0,
          matchedFields: ['MRN'],
          requiresManualReview: false,
          provenanceSource: 'JanoAuthoritativeMRN',
          autoMergeAllowed: true,
        };
      }
    }

    // 1b. Check for explicit National ID identifier
    const nationalIdVal = identifiers.find(
      (id) => id.system === JANO_PATIENT_NATIONAL_ID_SYSTEM || id.system?.includes('national-id')
    )?.value;
    if (nationalIdVal) {
      const allPatients = await localRepository.getAllPatients();
      const matchedByNid = allPatients.find(
        (p) => p.nationalId && p.nationalId.trim().toLowerCase() === nationalIdVal.trim().toLowerCase()
      );
      if (matchedByNid) {
        return {
          status: 'MATCH_CONFIRMED',
          localPatientId: matchedByNid.id,
          confidenceScore: 0.99,
          matchedFields: ['NationalID'],
          requiresManualReview: false,
          provenanceSource: 'NationalIDRegistry',
          autoMergeAllowed: true,
        };
      }
    }

    // 2. Check for registered external source system identifiers in the identity map
    for (const id of identifiers) {
      if (id.system && id.value) {
        const mapped = this.getBySourceIdentifier(id.system, id.value);
        if (mapped && mapped.status === 'MATCH_CONFIRMED') {
          const patient = await localRepository.getPatient(mapped.janoId);
          if (patient) {
            return {
              status: 'MATCH_CONFIRMED',
              localPatientId: patient.id,
              confidenceScore: 0.98,
              matchedFields: [`ExternalSystemIdentifier:${id.system}`],
              requiresManualReview: false,
              provenanceSource: id.system,
              autoMergeAllowed: true,
            };
          }
        }
      }
    }

    // 3. Demographics and MPI Candidate Matching
    const allPatients = await localRepository.getAllPatients();
    const facilityPatients = allPatients.filter((p) => p.primaryFacilityId === defaultFacilityId || !defaultFacilityId);

    const targetFamily = fhirPatient.name?.[0]?.family?.trim().toLowerCase() || '';
    const targetGiven = fhirPatient.name?.[0]?.given?.[0]?.trim().toLowerCase() || '';
    const targetBirthDate = fhirPatient.birthDate?.trim() || '';
    const targetPhone = fhirPatient.telecom?.find((t) => t.system === 'phone')?.value?.trim() || '';

    const candidateMatches: { patientId: string; score: number; matched: string[]; conflict?: string }[] = [];

    for (const patient of facilityPatients) {
      let score = 0;
      const matched: string[] = [];
      let conflict: string | undefined;

      const pFamily = patient.lastName.trim().toLowerCase();
      const pGiven = patient.firstName.trim().toLowerCase();
      const pBirthDate = patient.dateOfBirth?.trim() || '';
      const pPhone = patient.phone?.trim() || '';

      const nameMatch = targetFamily && pFamily === targetFamily && targetGiven && pGiven === targetGiven;
      const partialNameMatch = (targetFamily && pFamily === targetFamily) || (targetGiven && pGiven === targetGiven);

      if (nameMatch) {
        score += 0.5;
        matched.push('FullName');
      } else if (partialNameMatch) {
        score += 0.25;
        matched.push('PartialName');
      }

      if (targetBirthDate && pBirthDate) {
        if (targetBirthDate === pBirthDate) {
          score += 0.35;
          matched.push('DateOfBirth');
        } else {
          // Explicit birthdate mismatch with identical name indicates a conflict
          if (nameMatch) {
            conflict = `Conflicting birth dates: incoming ${targetBirthDate} vs local ${pBirthDate}`;
          }
        }
      }

      if (targetPhone && pPhone && targetPhone.replace(/\D/g, '') === pPhone.replace(/\D/g, '')) {
        score += 0.25;
        matched.push('Phone');
      }

      // Explicit National ID mismatch when demographics match indicates identity conflict
      const targetNid = fhirPatient.identifier?.find(
        (id) => id.system === JANO_PATIENT_NATIONAL_ID_SYSTEM || id.system?.includes('national-id')
      )?.value?.trim().toLowerCase();
      const pNid = patient.nationalId?.trim().toLowerCase();
      if (targetNid && pNid && targetNid !== pNid) {
        if (nameMatch || (targetBirthDate && targetBirthDate === pBirthDate)) {
          conflict = `Conflicting National Identifiers: incoming "${targetNid}" vs registered "${pNid}"`;
        }
      }

      if (conflict) {
        candidateMatches.push({ patientId: patient.id, score, matched, conflict });
      } else if (score >= 0.5) {
        candidateMatches.push({ patientId: patient.id, score, matched });
      }
    }

    // 4. Evaluate candidate matches
    if (candidateMatches.some((c) => c.conflict)) {
      return {
        status: 'IDENTITY_CONFLICT',
        confidenceScore: 0.3,
        matchedFields: candidateMatches[0].matched,
        conflictReasons: candidateMatches.filter((c) => c.conflict).map((c) => c.conflict!),
        requiresManualReview: true,
        provenanceSource: 'InboundFHIRPayload',
        autoMergeAllowed: false,
      };
    }

    if (candidateMatches.length === 0) {
      return {
        status: 'NO_MATCH',
        confidenceScore: 0.0,
        matchedFields: [],
        requiresManualReview: false,
        provenanceSource: 'InboundFHIRPayload',
        autoMergeAllowed: false,
      };
    }

    if (candidateMatches.length > 1) {
      // Multiple records matched! PENDING_IDENTITY_RECONCILIATION - strictly forbidden to auto-merge!
      return {
        status: 'PENDING_IDENTITY_RECONCILIATION',
        confidenceScore: Math.max(...candidateMatches.map((c) => c.score)),
        matchedFields: Array.from(new Set(candidateMatches.flatMap((c) => c.matched))),
        conflictReasons: [
          `Multiple candidate patient aggregates matched (${candidateMatches.length} candidates). Manual clinical verification required.`,
        ],
        requiresManualReview: true,
        provenanceSource: 'InboundFHIRPayload',
        autoMergeAllowed: false,
      };
    }

    // Exactly one candidate match
    const best = candidateMatches[0];
    if (best.score >= 0.8) {
      return {
        status: 'MATCH_CANDIDATE',
        localPatientId: best.patientId,
        confidenceScore: best.score,
        matchedFields: best.matched,
        requiresManualReview: true,
        provenanceSource: 'InboundFHIRPayload',
        autoMergeAllowed: false,
      };
    }

    return {
      status: 'PENDING_REVIEW',
      localPatientId: best.patientId,
      confidenceScore: best.score,
      matchedFields: best.matched,
      requiresManualReview: true,
      provenanceSource: 'InboundFHIRPayload',
      autoMergeAllowed: false,
    };
  }

  /**
   * Alias for reconcilePatient, defaulting facility context if omitted.
   */
  public async reconcileInboundPatient(fhirPatient: FHIRPatient, defaultFacilityId: string = ''): Promise<IdentityReconciliationResult> {
    return this.reconcilePatient(fhirPatient, defaultFacilityId);
  }
}

export const fhirIdentityMap = FHIRIdentityMap.getInstance();
