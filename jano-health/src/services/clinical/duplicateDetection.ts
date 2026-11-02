/**
 * Jano Health - Deterministic Local Duplicate Detection Engine
 * 
 * Implements multi-tiered duplicate scoring for master patient indexing:
 * - Strong Signals: Exact National ID, Exact MRN, Exact Phone + DOB
 * - Medium Signals: Normalized Name + DOB, Normalized Name + Phone
 * - Weak Signals: Approximate Fuzzy Name similarity with shared demographic attributes
 * 
 * Clinical Rule:
 * Never automatically merge patients. Candidates are presented to authorized staff
 * for explicit human-in-the-loop review and decision.
 */

import { Patient, Sex, DateOfBirthPrecision } from '../../domain/types';
import {
  normalizePatientName,
  normalizePhoneNumber,
  normalizeIdentifier,
} from '../../domain/clinicalUtils';

export type DuplicateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DuplicateSignal {
  type:
    | 'EXACT_MRN'
    | 'EXACT_NATIONAL_ID'
    | 'EXACT_PHONE_DOB'
    | 'NORMALIZED_NAME_DOB'
    | 'NORMALIZED_NAME_PHONE'
    | 'NORMALIZED_NAME_LOCATION'
    | 'FUZZY_NAME_MATCH';
  weight: number;
  confidence: DuplicateConfidence;
  description: string;
}

export interface DuplicateCandidate {
  patient: Patient;
  overallScore: number; // 0 to 100
  confidence: DuplicateConfidence;
  signals: DuplicateSignal[];
  reasons: string[];
}

export interface DuplicateCheckInput {
  firstName?: string;
  lastName?: string;
  givenName?: string;
  familyName?: string;
  middleName?: string;
  dateOfBirth: string;
  dateOfBirthPrecision?: DateOfBirthPrecision;
  gender?: Sex;
  sex?: Sex;
  nationalId?: string;
  phone?: string;
  villageTown?: string;
  district?: string;
  primaryFacilityId?: string;
  excludePatientId?: string;
}

/**
 * Calculates Levenshtein edit distance between two normalized strings.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

/**
 * Computes string similarity ratio between 0.0 and 1.0 based on Levenshtein distance.
 */
function calculateNameSimilarity(nameA: string, nameB: string): number {
  if (!nameA || !nameB) return 0;
  if (nameA === nameB) return 1.0;
  const maxLength = Math.max(nameA.length, nameB.length);
  if (maxLength === 0) return 1.0;
  const distance = levenshteinDistance(nameA, nameB);
  return Math.max(0, 1.0 - distance / maxLength);
}

/**
 * Evaluates duplicate candidate records against local patient database.
 * Returns sorted candidates with match signals and confidence levels.
 */
export function evaluateDuplicates(
  input: DuplicateCheckInput,
  existingPatients: Patient[],
  threshold = 40
): DuplicateCandidate[] {
  const normInputGiven = normalizePatientName(input.givenName || input.firstName);
  const normInputFamily = normalizePatientName(input.familyName || input.lastName);
  const normInputFullName = `${normInputGiven} ${normInputFamily}`.trim();

  const normInputPhone = normalizePhoneNumber(input.phone);
  const normInputNatId = normalizeIdentifier(input.nationalId);
  const inputDob = input.dateOfBirth ? input.dateOfBirth.trim() : '';

  const candidates: DuplicateCandidate[] = [];

  for (const patient of existingPatients) {
    // Skip self when updating
    if (input.excludePatientId && patient.id === input.excludePatientId) {
      continue;
    }

    // Skip retired merged records unless specifically looking for merge targets
    if (patient.patientStatus === 'MERGED') {
      continue;
    }

    const signals: DuplicateSignal[] = [];

    const patGiven = normalizePatientName(patient.givenName || patient.firstName);
    const patFamily = normalizePatientName(patient.familyName || patient.lastName);
    const patFullName = `${patGiven} ${patFamily}`.trim();
    const patPhone = normalizePhoneNumber(patient.phone);
    const patNatId = normalizeIdentifier(patient.nationalId || patient.nationalIdentifier);
    const patDob = patient.dateOfBirth ? patient.dateOfBirth.trim() : '';

    // 1. Strong Signal: Exact National Identifier match
    if (normInputNatId && patNatId && normInputNatId === patNatId) {
      signals.push({
        type: 'EXACT_NATIONAL_ID',
        weight: 100,
        confidence: 'HIGH',
        description: `Exact National ID match: ${patient.nationalId || patient.nationalIdentifier}`,
      });
    }

    // 2. Strong Signal: Exact Phone + Exact DOB match
    if (normInputPhone && patPhone && normInputPhone === patPhone && inputDob && patDob && inputDob === patDob) {
      signals.push({
        type: 'EXACT_PHONE_DOB',
        weight: 95,
        confidence: 'HIGH',
        description: `Exact Phone (${patient.phone}) and Date of Birth (${patient.dateOfBirth}) match`,
      });
    }

    // 3. Medium Signal: Normalized Name + Exact DOB match
    const isExactName = normInputFullName && patFullName && normInputFullName === patFullName;
    const isExactDob = inputDob && patDob && inputDob === patDob;
    if (isExactName && isExactDob) {
      signals.push({
        type: 'NORMALIZED_NAME_DOB',
        weight: 85,
        confidence: 'HIGH',
        description: `Full Name (${patient.firstName} ${patient.lastName}) and Date of Birth (${patient.dateOfBirth}) match`,
      });
    }

    // 4. Medium Signal: Normalized Name + Exact Phone match
    const isExactPhone = normInputPhone && patPhone && normInputPhone === patPhone;
    if (isExactName && isExactPhone && !isExactDob) {
      signals.push({
        type: 'NORMALIZED_NAME_PHONE',
        weight: 75,
        confidence: 'MEDIUM',
        description: `Full Name and Phone Number (${patient.phone}) match`,
      });
    }

    // 5. Medium Signal: Normalized Name + same location/village
    const normInputLoc = normalizePatientName(input.villageTown || '');
    const patLoc = normalizePatientName(patient.villageTown || '');
    if (isExactName && !isExactDob && !isExactPhone && normInputLoc && patLoc && normInputLoc === patLoc) {
      signals.push({
        type: 'NORMALIZED_NAME_LOCATION',
        weight: 60,
        confidence: 'MEDIUM',
        description: `Identical Full Name in the same locality (${patient.villageTown})`,
      });
    }

    // 6. Weak / Fuzzy Signal: High Name Similarity with same DOB or location
    if (!isExactName && normInputFullName && patFullName) {
      const sim = calculateNameSimilarity(normInputFullName, patFullName);
      if (sim >= 0.82) {
        let fuzzyWeight = Math.round(sim * 50);
        let desc = `Phonetically similar name (${patient.firstName} ${patient.lastName}, ${(sim * 100).toFixed(0)}% match)`;
        
        if (isExactDob) {
          fuzzyWeight += 25;
          desc += ` with identical Date of Birth (${patient.dateOfBirth})`;
        } else if (isExactPhone) {
          fuzzyWeight += 20;
          desc += ` with identical Phone (${patient.phone})`;
        }

        signals.push({
          type: 'FUZZY_NAME_MATCH',
          weight: Math.min(fuzzyWeight, 80),
          confidence: fuzzyWeight >= 70 ? 'MEDIUM' : 'LOW',
          description: desc,
        });
      }
    }

    if (signals.length > 0) {
      // Calculate composite score (capped at 100)
      const maxSignalWeight = Math.max(...signals.map((s) => s.weight));
      const overallScore = maxSignalWeight;

      let confidence: DuplicateConfidence = 'LOW';
      if (overallScore >= 85) confidence = 'HIGH';
      else if (overallScore >= 65) confidence = 'MEDIUM';

      if (overallScore >= threshold) {
        candidates.push({
          patient,
          overallScore,
          confidence,
          signals,
          reasons: signals.map((s) => s.description),
        });
      }
    }
  }

  // Sort descending by score
  return candidates.sort((a, b) => b.overallScore - a.overallScore);
}
