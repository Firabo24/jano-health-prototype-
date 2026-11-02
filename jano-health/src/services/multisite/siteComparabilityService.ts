/**
 * Jano Health - Site Comparability Framework Service (V24)
 * Evaluates whether sites can legitimately be compared across
 * Infrastructure, Clinical Environment, Software, and Operational conditions.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  SiteProfileDimensions,
  ComparabilityAssessment,
  SiteComparabilityStatus,
} from '../../domain/v24MultiSiteEvidenceTypes';

export class SiteComparabilityService {
  private profiles: Map<string, SiteProfileDimensions> = new Map();
  private assessments: Map<string, ComparabilityAssessment> = new Map();

  constructor() {
    this.seedProfiles();
  }

  private seedProfiles(): void {
    const p1: SiteProfileDimensions = {
      siteId: 'site-amani-01',
      infrastructure: {
        hardwareClass: 'STANDARD_CLINIC',
        ramStorageClass: '4GB_ADEQUATE',
        networkTopology: 'LOCAL_MESH',
        powerReliability: 'PARTIAL_BACKUP_SOLAR',
        internetAvailability: 'INTERMITTENT_WINDOW',
        deviceCount: 6,
      },
      clinicalEnvironment: {
        facilityType: 'HEALTH_CENTER',
        patientVolumePerDay: 45,
        departments: ['OPD', 'MATERNITY', 'LAB', 'PHARMACY', 'EMERGENCY'],
        staffingFTE: 8,
        workflowMaturity: 'HYBRID',
      },
      software: {
        janoVersion: '24.0.0',
        databaseVersion: 24,
        enabledModules: ['PATIENTS', 'ENCOUNTERS', 'LAB', 'PHARMACY', 'EMERGENCY'],
        aiCapabilities: ['CLINICAL_DECISION_SUPPORT'],
        terminologyVersion: 'ICD11_V2',
        configurationVersion: '1.2.0',
      },
      operationalConditions: {
        trainingMaturityScore: 85,
        supportCoverageHours: 12,
        changeFrequency: 'STABLE',
        downtimeMinutesMonthly: 15,
        implementationPhase: 'CONTROLLED_LIVE',
      },
    };

    const p2: SiteProfileDimensions = {
      siteId: 'site-kilima-02',
      infrastructure: {
        hardwareClass: 'LOW_RESOURCE',
        ramStorageClass: '2GB_LIMITED',
        networkTopology: 'STANDALONE_OFFLINE',
        powerReliability: 'UNSTABLE_DAILY_OUTAGE',
        internetAvailability: 'OFFLINE_90_PERCENT',
        deviceCount: 2,
      },
      clinicalEnvironment: {
        facilityType: 'DISPENSARY',
        patientVolumePerDay: 20,
        departments: ['OPD', 'PHARMACY'],
        staffingFTE: 3,
        workflowMaturity: 'BASIC_PAPER_TRANSITION',
      },
      software: {
        janoVersion: '24.0.0',
        databaseVersion: 24,
        enabledModules: ['PATIENTS', 'ENCOUNTERS', 'PHARMACY'],
        aiCapabilities: ['CLINICAL_DECISION_SUPPORT'],
        terminologyVersion: 'ICD11_V2',
        configurationVersion: '1.2.0',
      },
      operationalConditions: {
        trainingMaturityScore: 70,
        supportCoverageHours: 8,
        changeFrequency: 'STABLE',
        downtimeMinutesMonthly: 40,
        implementationPhase: 'LIMITED_GO_LIVE',
      },
    };

    const p3: SiteProfileDimensions = {
      siteId: 'site-ziwa-03',
      infrastructure: {
        hardwareClass: 'ROBUST_SERVER',
        ramStorageClass: '8GB_PLUS',
        networkTopology: 'HYBRID_WAN',
        powerReliability: 'STABLE_GRID',
        internetAvailability: 'CONTINUOUS_BROADBAND',
        deviceCount: 25,
      },
      clinicalEnvironment: {
        facilityType: 'DISTRICT_HOSPITAL',
        patientVolumePerDay: 250,
        departments: ['OPD', 'INPATIENT', 'SURGERY', 'LAB', 'RADIOLOGY', 'PHARMACY', 'EMERGENCY'],
        staffingFTE: 45,
        workflowMaturity: 'EXPERIENCED_DIGITAL',
      },
      software: {
        janoVersion: '23.0.0', // Different version for testing drift / incompatibility
        databaseVersion: 23,
        enabledModules: ['PATIENTS', 'ENCOUNTERS', 'LAB', 'RADIOLOGY', 'PHARMACY', 'EMERGENCY'],
        aiCapabilities: ['CLINICAL_DECISION_SUPPORT', 'RADIOLOGY_ASSIST'],
        terminologyVersion: 'ICD11_V1',
        configurationVersion: '1.0.0',
      },
      operationalConditions: {
        trainingMaturityScore: 90,
        supportCoverageHours: 24,
        changeFrequency: 'MODERATE',
        downtimeMinutesMonthly: 5,
        implementationPhase: 'TRAINING',
      },
    };

    this.profiles.set(p1.siteId, p1);
    this.profiles.set(p2.siteId, p2);
    this.profiles.set(p3.siteId, p3);
  }

  public registerProfile(profile: SiteProfileDimensions): void {
    this.profiles.set(profile.siteId, profile);
  }

  public getProfile(siteId: string): SiteProfileDimensions | null {
    return this.profiles.get(siteId) || null;
  }

  /**
   * Evaluates comparability between base site and target site.
   */
  public async assessComparability(
    programId: string,
    baseSiteId: string,
    targetSiteId: string,
    assessorId: string
  ): Promise<ComparabilityAssessment> {
    const base = this.profiles.get(baseSiteId);
    const target = this.profiles.get(targetSiteId);

    if (!base || !target) {
      const assessment: ComparabilityAssessment = {
        assessmentId: `cmp-${baseSiteId}-${targetSiteId}`,
        programId,
        baseSiteId,
        targetSiteId,
        status: 'INSUFFICIENT_DATA',
        overallSimilarityScore: 0,
        infrastructureSimilarity: 0,
        clinicalSimilarity: 0,
        softwareSimilarity: 0,
        operationalSimilarity: 0,
        incompatibilityReasons: ['Profile missing for one or both sites; comparability evaluation cannot proceed'],
        assessedBy: assessorId,
        assessedAt: new Date().toISOString(),
        methodologyVersion: '24.1.0-STANDARDIZED',
      };
      await idbEngine.put('comparabilityAssessments', assessment);
      return assessment;
    }

    const reasons: string[] = [];

    // 1. Software comparability (strict)
    let softwareScore = 100;
    if (base.software.janoVersion !== target.software.janoVersion) {
      softwareScore -= 40;
      reasons.push(`Software version mismatch: ${base.siteId} (${base.software.janoVersion}) vs ${target.siteId} (${target.software.janoVersion})`);
    }
    if (base.software.databaseVersion !== target.software.databaseVersion) {
      softwareScore -= 30;
      reasons.push(`Database schema version mismatch: ${base.software.databaseVersion} vs ${target.software.databaseVersion}`);
    }

    // Module intersection
    const sharedModules = base.software.enabledModules.filter((m) => target.software.enabledModules.includes(m));
    const moduleCoverage = (sharedModules.length * 2) / (base.software.enabledModules.length + target.software.enabledModules.length);
    softwareScore = Math.max(0, Math.round(softwareScore * moduleCoverage));
    if (moduleCoverage < 0.6) {
      reasons.push(`Material discrepancy in enabled modules: shared ${sharedModules.length} of combined set`);
    }

    // 2. Clinical environment comparability
    let clinicalScore = 100;
    const volRatio = Math.max(base.clinicalEnvironment.patientVolumePerDay, target.clinicalEnvironment.patientVolumePerDay) /
      Math.max(1, Math.min(base.clinicalEnvironment.patientVolumePerDay, target.clinicalEnvironment.patientVolumePerDay));
    if (volRatio > 5) {
      clinicalScore -= 50;
      reasons.push(`Severe patient volume disparity (>5x ratio: ${base.clinicalEnvironment.patientVolumePerDay} vs ${target.clinicalEnvironment.patientVolumePerDay} pts/day)`);
    } else if (volRatio > 2) {
      clinicalScore -= 20;
    }
    if (base.clinicalEnvironment.facilityType !== target.clinicalEnvironment.facilityType) {
      clinicalScore -= 25;
      reasons.push(`Facility tier difference: ${base.clinicalEnvironment.facilityType} vs ${target.clinicalEnvironment.facilityType}`);
    }

    // 3. Infrastructure comparability
    let infraScore = 100;
    if (base.infrastructure.hardwareClass !== target.infrastructure.hardwareClass) {
      infraScore -= 20;
    }
    if (base.infrastructure.internetAvailability !== target.infrastructure.internetAvailability) {
      infraScore -= 30;
      reasons.push(`Connectivity exposure divergence: ${base.infrastructure.internetAvailability} vs ${target.infrastructure.internetAvailability}`);
    }

    // 4. Operational conditions comparability
    const trainingDiff = Math.abs(base.operationalConditions.trainingMaturityScore - target.operationalConditions.trainingMaturityScore);
    const opScore = Math.max(0, 100 - trainingDiff * 1.5);
    if (trainingDiff > 25) {
      reasons.push(`Training maturity divergence exceeds 25 points (${base.operationalConditions.trainingMaturityScore} vs ${target.operationalConditions.trainingMaturityScore})`);
    }

    const overall = Math.round((softwareScore * 0.35) + (clinicalScore * 0.25) + (infraScore * 0.2) + (opScore * 0.2));

    let status: SiteComparabilityStatus;
    if (softwareScore < 50 || clinicalScore < 40) {
      status = 'NOT_COMPARABLE';
    } else if (overall >= 80 && reasons.length === 0) {
      status = 'COMPARABLE';
    } else if (overall >= 55) {
      status = 'CONDITIONALLY_COMPARABLE';
    } else {
      status = 'NOT_COMPARABLE';
    }

    const assessment: ComparabilityAssessment = {
      assessmentId: `cmp-${baseSiteId}-${targetSiteId}`,
      programId,
      baseSiteId,
      targetSiteId,
      status,
      overallSimilarityScore: overall,
      infrastructureSimilarity: Math.max(0, infraScore),
      clinicalSimilarity: Math.max(0, clinicalScore),
      softwareSimilarity: Math.max(0, softwareScore),
      operationalSimilarity: Math.max(0, opScore),
      incompatibilityReasons: reasons,
      conditionalityNotes: status === 'CONDITIONALLY_COMPARABLE'
        ? 'Sites can be compared only when normalizing for volume and connectivity exposure; direct raw comparison is invalid.'
        : undefined,
      assessedBy: assessorId,
      assessedAt: new Date().toISOString(),
      methodologyVersion: '24.1.0-STANDARDIZED',
    };

    this.assessments.set(assessment.assessmentId, assessment);
    await idbEngine.put('comparabilityAssessments', assessment);
    return assessment;
  }

  public async getAssessment(baseSiteId: string, targetSiteId: string): Promise<ComparabilityAssessment | null> {
    const id = `cmp-${baseSiteId}-${targetSiteId}`;
    return this.assessments.get(id) || null;
  }
}

export const siteComparabilityService = new SiteComparabilityService();
