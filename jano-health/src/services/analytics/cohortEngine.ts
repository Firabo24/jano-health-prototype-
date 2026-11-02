/**
 * Jano Health - Population Cohort Definition & Execution Engine
 * Clinical Core V14: Reproducible Cohort Criteria and Anonymized Aggregation
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Cohorts are reproducible, versioned, and auditable.
 * 2. Never allow arbitrary SQL-like unrestricted patient queries from the UI.
 * 3. Cohort outputs contain ONLY anonymized aggregates and breakdown counts.
 * 4. Small-cell privacy suppression applies to all evaluated cohort results.
 */

import {
  CohortDefinition,
  PopulationCohort,
} from '../../domain/analyticsTypes';
import { RoleType } from '../../domain/types';
import { sha256 } from '../../domain/eventIntegrity';
import { analyticalFactStore } from './factStore';
import { smallCellPrivacyEngine } from './privacyEngine';

export const BUILTIN_COHORTS: CohortDefinition[] = [
  {
    cohortId: 'COHORT_UNDER_5_FEBRILE',
    name: 'Under-5 Pediatric Febrile Illness',
    description: 'Children aged under 5 presenting with fever or acute infectious syndrome',
    criteria: {
      ageMax: 5,
      diagnosisCategories: ['A00-B99', 'J00-J22'],
    },
    version: 1,
    authorId: 'usr-sysintel-neema',
    authorRole: 'system_intelligence_admin',
    authorizedRoles: ['system_intelligence_admin', 'public_health_intelligence_user', 'facility_intelligence_user', 'clinical_supervisor'],
    status: 'ACTIVE',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    cohortId: 'COHORT_MATERNAL_CARE',
    name: 'Maternal & Antenatal Care',
    description: 'Female patients aged 15-49 accessing antenatal, delivery, or obstetric care',
    criteria: {
      sex: 'female',
      ageMin: 15,
      ageMax: 49,
      diagnosisCategories: ['O00-O9A'],
    },
    version: 1,
    authorId: 'usr-sysintel-neema',
    authorRole: 'system_intelligence_admin',
    authorizedRoles: ['system_intelligence_admin', 'public_health_intelligence_user', 'facility_intelligence_user', 'clinical_supervisor'],
    status: 'ACTIVE',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    cohortId: 'COHORT_CHRONIC_NCD',
    name: 'Chronic Non-Communicable Diseases (NCDs)',
    description: 'Patients managed for hypertension, diabetes, or cardiovascular conditions',
    criteria: {
      diagnosisCategories: ['I10-I16', 'E10-E14'],
    },
    version: 1,
    authorId: 'usr-sysintel-neema',
    authorRole: 'system_intelligence_admin',
    authorizedRoles: ['system_intelligence_admin', 'public_health_intelligence_user', 'facility_intelligence_user', 'clinical_supervisor'],
    status: 'ACTIVE',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

export class PopulationCohortEngine {
  private static instance: PopulationCohortEngine;
  private definitions: Map<string, CohortDefinition[]> = new Map();

  private constructor() {
    BUILTIN_COHORTS.forEach((c) => this.registerCohort(c));
  }

  public static getInstance(): PopulationCohortEngine {
    if (!PopulationCohortEngine.instance) {
      PopulationCohortEngine.instance = new PopulationCohortEngine();
    }
    return PopulationCohortEngine.instance;
  }

  public registerCohort(def: CohortDefinition): void {
    const list = this.definitions.get(def.cohortId) || [];
    const idx = list.findIndex((c) => c.version === def.version);
    if (idx >= 0) {
      list[idx] = def;
    } else {
      list.push(def);
    }
    list.sort((a, b) => b.version - a.version);
    this.definitions.set(def.cohortId, list);
  }

  public getCohortDefinition(cohortId: string, version?: number): CohortDefinition | undefined {
    const list = this.definitions.get(cohortId);
    if (!list || list.length === 0) return undefined;
    if (version !== undefined) {
      return list.find((c) => c.version === version);
    }
    return list.find((c) => c.status === 'ACTIVE') || list[0];
  }

  public listCohortDefinitions(userRole?: RoleType): CohortDefinition[] {
    const activeList: CohortDefinition[] = [];
    for (const list of this.definitions.values()) {
      const active = list.find((c) => c.status === 'ACTIVE') || list[0];
      if (!userRole || active.authorizedRoles.includes(userRole)) {
        activeList.push(active);
      }
    }
    return activeList.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Executes a population cohort definition against the analytical fact store.
   * Produces an anonymized aggregate breakdown with small-cell suppression.
   */
  public async executeCohort(
    cohortId: string,
    facilityId: string,
    userRole: RoleType,
    version?: number
  ): Promise<PopulationCohort> {
    const def = this.getCohortDefinition(cohortId, version);
    if (!def) {
      throw new Error(`COHORT_NOT_FOUND: Cohort definition '${cohortId}' (version: ${version ?? 'latest'}) does not exist.`);
    }

    if (!def.authorizedRoles.includes(userRole) && userRole !== 'system_administrator') {
      throw new Error(`COHORT_ACCESS_DENIED: Role '${userRole}' is not authorized to execute cohort '${cohortId}'.`);
    }

    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
    });

    const byAgeGroup: Record<string, number> = {
      '0-4': 0,
      '5-14': 0,
      '15-49': 0,
      '50+': 0,
    };
    const byGender: Record<string, number> = {
      female: 0,
      male: 0,
      other: 0,
    };
    const byFacility: Record<string, number> = {};

    let aggregateCount = 0;

    facts.forEach((fact) => {
      // Evaluate cohort criteria
      const crit = def.criteria;

      // Filter facility if specified in criteria
      if (crit.facilityIds && crit.facilityIds.length > 0) {
        if (!crit.facilityIds.includes(fact.sourceFacilityId)) return;
      }

      // Check age criteria if fact has age
      const factAge = (fact as any).ageYears ?? (fact.dimensions?.age as number | undefined);
      if (factAge !== undefined) {
        if (crit.ageMin !== undefined && factAge < crit.ageMin) return;
        if (crit.ageMax !== undefined && factAge > crit.ageMax) return;
      }

      // Check sex criteria if fact has gender
      const factGender = (fact as any).gender ?? (fact.dimensions?.gender as string | undefined);
      if (crit.sex && crit.sex !== 'all') {
        if (factGender && factGender.toLowerCase() !== crit.sex.toLowerCase()) return;
      }

      aggregateCount += 1;

      // Assign to age bucket
      if (factAge !== undefined) {
        if (factAge < 5) byAgeGroup['0-4'] += 1;
        else if (factAge < 15) byAgeGroup['5-14'] += 1;
        else if (factAge < 50) byAgeGroup['15-49'] += 1;
        else byAgeGroup['50+'] += 1;
      } else {
        byAgeGroup['15-49'] += 1; // Default middle bracket
      }

      // Assign to gender bucket
      const g = (factGender || 'female').toLowerCase();
      if (g === 'female') byGender.female += 1;
      else if (g === 'male') byGender.male += 1;
      else byGender.other += 1;

      // Assign to facility bucket
      const fId = fact.sourceFacilityId || 'fac_unknown';
      byFacility[fId] = (byFacility[fId] || 0) + 1;
    });

    const rawCohort: PopulationCohort = {
      cohortId: def.cohortId,
      cohortName: def.name,
      definitionVersion: def.version,
      scopeId: facilityId,
      aggregationLevel: facilityId === '*' ? 'network' : 'facility',
      reportingPeriod: new Date().toISOString().substring(0, 7),
      aggregateCount,
      isSuppressed: false,
      breakdowns: {
        byAgeGroup,
        byGender,
        byFacility,
      },
      generatedAt: new Date().toISOString(),
      integrityHash: '',
    };

    rawCohort.integrityHash = sha256(JSON.stringify({ ...rawCohort, integrityHash: '' }));

    // Apply small-cell privacy protection
    return smallCellPrivacyEngine.protectCohort(rawCohort);
  }
}

export const populationCohortEngine = PopulationCohortEngine.getInstance();
