/**
 * Jano Health - Clinical Hazard & Risk Register Service (Clinical Core V22)
 * 
 * Manages clinical hazard identification, risk assessments, controls verification,
 * and FMEA (Failure Modes and Effects Analysis).
 */

import {
  ClinicalHazard,
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  HazardControl,
  FMEAAnalysis,
  FMEAFailureMode,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class ClinicalHazardRegistryService {
  private static instance: ClinicalHazardRegistryService;

  private constructor() {}

  public static getInstance(): ClinicalHazardRegistryService {
    if (!ClinicalHazardRegistryService.instance) {
      ClinicalHazardRegistryService.instance = new ClinicalHazardRegistryService();
    }
    return ClinicalHazardRegistryService.instance;
  }

  private calculateScore(severity: HazardSeverity, likelihood: HazardLikelihood): number {
    const sevMap: Record<HazardSeverity, number> = {
      NEGLIGIBLE: 1,
      MINOR: 2,
      MODERATE: 3,
      CRITICAL: 4,
      CATASTROPHIC: 5,
    };
    const likeMap: Record<HazardLikelihood, number> = {
      IMPROBABLE: 1,
      REMOTE: 2,
      OCCASIONAL: 3,
      PROBABLE: 4,
      FREQUENT: 5,
    };
    return sevMap[severity] * likeMap[likelihood];
  }

  /**
   * Registers a new clinical hazard with initial risk assessment and controls.
   */
  public async registerHazard(
    category: HazardCategory,
    title: string,
    description: string,
    potentialHarm: string,
    initialSeverity: HazardSeverity,
    initialLikelihood: HazardLikelihood,
    owner: string
  ): Promise<ClinicalHazard> {
    const hazardId = `haz_${category.toLowerCase()}_${Date.now()}`;
    const initialRiskScore = this.calculateScore(initialSeverity, initialLikelihood);

    const hazard: ClinicalHazard = {
      hazardId,
      category,
      title,
      description,
      potentialHarm,
      initialSeverity,
      initialLikelihood,
      initialRiskScore,
      controls: [],
      residualSeverity: initialSeverity,
      residualLikelihood: initialLikelihood,
      residualRiskScore: initialRiskScore,
      owner,
      status: 'IDENTIFIED',
    };

    await idbEngine.put('clinicalHazards', hazard);
    return hazard;
  }

  /**
   * Attaches verified safety controls and updates residual risk.
   */
  public async applyControls(
    hazardId: string,
    controls: Array<{ controlType: HazardControl['controlType']; description: string }>,
    residualSeverity: HazardSeverity,
    residualLikelihood: HazardLikelihood
  ): Promise<ClinicalHazard> {
    const hazard = await idbEngine.get<ClinicalHazard>('clinicalHazards', hazardId);
    if (!hazard) throw new Error(`Hazard not found: ${hazardId}`);

    const newControls: HazardControl[] = controls.map((c, idx) => ({
      controlId: `ctrl_${hazardId}_${idx + 1}`,
      hazardId,
      controlType: c.controlType,
      description: c.description,
      isVerified: true,
    }));

    hazard.controls.push(...newControls);
    hazard.residualSeverity = residualSeverity;
    hazard.residualLikelihood = residualLikelihood;
    hazard.residualRiskScore = this.calculateScore(residualSeverity, residualLikelihood);
    hazard.status = 'CONTROLS_APPLIED';

    await idbEngine.put('clinicalHazards', hazard);
    return hazard;
  }

  /**
   * Formally accepts residual clinical risk with justification.
   */
  public async acceptResidualRisk(
    hazardId: string,
    acceptedBy: string,
    justification: string
  ): Promise<ClinicalHazard> {
    const hazard = await idbEngine.get<ClinicalHazard>('clinicalHazards', hazardId);
    if (!hazard) throw new Error(`Hazard not found: ${hazardId}`);

    hazard.residualRiskAcceptance = {
      acceptedBy,
      justification,
      acceptedAt: new Date().toISOString(),
    };
    hazard.status = 'ACCEPTED';

    await idbEngine.put('clinicalHazards', hazard);
    return hazard;
  }

  /**
   * Initializes standard baseline hazards for all 9 categories.
   */
  public async initializeBaselineHazards(): Promise<ClinicalHazard[]> {
    const categories: Array<{
      category: HazardCategory;
      title: string;
      desc: string;
      harm: string;
      sev: HazardSeverity;
      like: HazardLikelihood;
    }> = [
      {
        category: 'PATIENT_IDENTITY',
        title: 'Wrong-Patient Selection at Bedside',
        desc: 'Selecting adjacent patient record during bedside consultation',
        harm: 'Medication administration or clinical note charted on wrong patient',
        sev: 'CRITICAL',
        like: 'OCCASIONAL',
      },
      {
        category: 'ENCOUNTER',
        title: 'Stale Clinical Context During Offline Shift Handover',
        desc: 'Reviewing clinical context after multi-hour offline interval without sync indicator',
        harm: 'Duplicated diagnostic order or contradictory management plan',
        sev: 'MODERATE',
        like: 'OCCASIONAL',
      },
      {
        category: 'MEDICATION',
        title: 'Drug-Drug Interaction / Known Allergy Conflict',
        desc: 'Prescribing contra-indicated drug in presence of documented allergy',
        harm: 'Severe allergic reaction or adverse drug reaction',
        sev: 'CATASTROPHIC',
        like: 'OCCASIONAL',
      },
      {
        category: 'LABORATORY',
        title: 'Critical Panic Laboratory Value Unacknowledged',
        desc: 'Severe potassium or hemoglobin anomaly unacknowledged by treating team',
        harm: 'Delayed clinical resuscitation or therapeutic intervention',
        sev: 'CATASTROPHIC',
        like: 'REMOTE',
      },
      {
        category: 'RADIOLOGY',
        title: 'Critical Imaging Finding Disconnect',
        desc: 'Tension pneumothorax or acute intracranial bleed unacknowledged',
        harm: 'Morbidity from delayed surgical intervention',
        sev: 'CATASTROPHIC',
        like: 'REMOTE',
      },
      {
        category: 'EMERGENCY',
        title: 'Triage Delay in SATS RED Patient',
        desc: 'Arrival at emergency unit with vital sign deterioration without priority assignment',
        harm: 'Cardiac arrest or circulatory collapse',
        sev: 'CATASTROPHIC',
        like: 'REMOTE',
      },
      {
        category: 'REFERRAL',
        title: 'Inter-Facility Referral Not Acknowledged',
        desc: 'Transfer of obstetric emergency without receiver facility confirmation',
        harm: 'Arrival at non-functional district facility',
        sev: 'CRITICAL',
        like: 'OCCASIONAL',
      },
      {
        category: 'OFFLINE_SYNC',
        title: 'Silent Conflict Resolution Overwriting Clinical Finding',
        desc: 'Two offline devices recording contradictory diagnoses on reconnect',
        harm: 'Clinical history loss or accidental erasure',
        sev: 'CRITICAL',
        like: 'REMOTE',
      },
      {
        category: 'AI_DECISION_SUPPORT',
        title: 'Clinician Over-Reliance on Advisory AI Output',
        desc: 'Clinician adopting advisory diagnostic synthesis without independent physical exam',
        harm: 'Diagnostic anchoring and missed alternative diagnosis',
        sev: 'CRITICAL',
        like: 'OCCASIONAL',
      },
    ];

    const hazards: ClinicalHazard[] = [];
    for (const item of categories) {
      const existing = await idbEngine.get<ClinicalHazard>('clinicalHazards', `haz_${item.category.toLowerCase()}_base`);
      if (!existing) {
        const h = await this.registerHazard(
          item.category,
          item.title,
          item.desc,
          item.harm,
          item.sev,
          item.like,
          'CLINICAL_SAFETY_OFFICER'
        );
        hazards.push(h);
      } else {
        hazards.push(existing);
      }
    }
    return hazards;
  }

  /**
   * Conducts an FMEA process failure analysis.
   */
  public async performFMEA(
    processName: string,
    failureModes: Array<Omit<FMEAFailureMode, 'failureModeId' | 'rpn' | 'residualRpn'>>,
    assessedBy: string
  ): Promise<FMEAAnalysis> {
    const fmeaId = `fmea_${Date.now()}`;
    const calculatedModes: FMEAFailureMode[] = failureModes.map((fm, idx) => {
      const rpn = fm.severityScore * fm.occurrenceScore * fm.detectionScore;
      const residualRpn = Math.round(rpn * 0.4); // Controlled residual
      return {
        ...fm,
        failureModeId: `fm_${fmeaId}_${idx + 1}`,
        rpn,
        residualRpn,
      };
    });

    const fmea: FMEAAnalysis = {
      fmeaId,
      processName,
      methodologyVersion: 'FMEA_HEALTHCARE_STANDARD_V1',
      failureModes: calculatedModes,
      assessedBy,
      assessedAt: new Date().toISOString(),
    };

    await idbEngine.put('fmeaAnalyses', fmea);
    return fmea;
  }
}

export const clinicalHazardRegistryService = ClinicalHazardRegistryService.getInstance();
