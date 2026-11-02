/**
 * Jano Health - South African Triage Scale (SATS) & Configurable Triage Classification Service
 * (Clinical Core V9 / V10)
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Triage classification is an operational workflow-prioritization tool, NOT a clinical diagnosis.
 * 2. Triage classification MUST NEVER automatically create diagnoses, prescriptions, lab orders,
 *    radiology orders, referrals, or treatment procedures.
 * 3. Standard SATS color set: RED, ORANGE, YELLOW, GREEN, BLUE.
 *    - BLUE represents dead-on-arrival / patients without signs of life in standard SATS descriptions.
 *    - BLACK is strictly NOT a standard SATS category.
 * 4. An expectant mass-casualty category belongs exclusively to MASS_CASUALTY_POLICY, not SATS.
 * 5. Explicit provenance is recorded on every triage record:
 *    triageSystem, version, jurisdiction, sourceReference, effectiveDate, ruleSetVersion, implementationType.
 * 6. SATS target times are represented as configurable policy metadata, NOT immutable medical law.
 * 7. Prehospital and pediatric scopes are explicitly separated and labeled as local adaptations.
 */

import {
  EmergencyAcuity,
  EmergencyWorkflowPriority,
  EmergencyTriage,
  TriageSystemType,
  TriagePolicyScope,
  TriageImplementationType,
  TriageTargetTimePolicy,
} from '../../domain/emergencyTypes';
import { ProvenanceRecord } from '../../domain/types';

export interface TriageEvaluationInput {
  chiefComplaint: string;
  airwayPatent: boolean;
  respiratoryDistress: boolean;
  shockSigns: boolean;
  glasgowComaScale?: number;
  temperature?: number;
  heartRate?: number;
  systolicBp?: number;
  oxygenSaturation?: number;
  immediateConcerns?: string[];
  hasSignsOfLife?: boolean; // false triggers SATS_BLUE (Dead on Arrival)
  ageInYears?: number;      // Pediatric discrimination
  isPrehospital?: boolean;  // Prehospital adaptation flag
  arrivalMode?: string;
  triageSystem?: TriageSystemType; // 'SATS' | 'MASS_CASUALTY_POLICY'
}

export interface TriageClassificationResult {
  triageSystem: TriageSystemType;
  acuity: EmergencyAcuity;
  workflowPriority: EmergencyWorkflowPriority;
  immediateConcerns: string[];
  recommendedBay: string;
  ruleSetReference: string;
  ruleSetVersion: string;
  jurisdiction: string;
  sourceReference: string;
  effectiveDate: string;
  implementationType: TriageImplementationType;
  policyScope: TriagePolicyScope;
  targetTimePolicy: TriageTargetTimePolicy;
  isSyntheticDemoRule: boolean;
  provenance: ProvenanceRecord;
}

export interface TriageRuleMetadata {
  triageSystem: TriageSystemType;
  classification: string;
  source: string;
  version: string;
  jurisdiction: string;
  effectiveDate: string;
  ruleSetVersion: string;
  implementationType: TriageImplementationType;
  isSynthetic: boolean;
  warningNotice: string;
}

export class TriageClassificationService {
  private static instance: TriageClassificationService;

  private satsRuleMetadata: TriageRuleMetadata = {
    triageSystem: 'SATS',
    classification: 'SOUTH_AFRICAN_TRIAGE_SCALE_LOCAL_ADAPTATION',
    source: 'South African Triage Group / Emergency Medicine Society of South Africa (EMSSA 2012)',
    version: '2012_ADULT_V1',
    jurisdiction: 'ZA_EMSSA / JANO_LOCAL_ADAPTATION',
    effectiveDate: '2012-01-01',
    ruleSetVersion: '1.2.0',
    implementationType: 'LOCAL_ADAPTATION',
    isSynthetic: true,
    warningNotice:
      'LOCAL SATS ADAPTATION / SYNTHETIC DEMO RULES. Operational queue prioritization only; does not formulate medical diagnosis or mandate therapy.',
  };

  private massCasualtyMetadata: TriageRuleMetadata = {
    triageSystem: 'MASS_CASUALTY_POLICY',
    classification: 'MASS_CASUALTY_DISASTER_TRIAGE_POLICY',
    source: 'Simple Triage and Rapid Treatment (START) Disaster Protocol Specification',
    version: 'MASS_CASUALTY_2026_V1',
    jurisdiction: 'DISASTER_POLICY_SPECIFICATION',
    effectiveDate: '2026-01-01',
    ruleSetVersion: '1.0.0',
    implementationType: 'LOCAL_ADAPTATION',
    isSynthetic: true,
    warningNotice:
      'MASS CASUALTY POLICY SPECIFICATION. Operational disaster triage only; separate from standard hospital SATS.',
  };

  public static getInstance(): TriageClassificationService {
    if (!TriageClassificationService.instance) {
      TriageClassificationService.instance = new TriageClassificationService();
    }
    return TriageClassificationService.instance;
  }

  public getRuleMetadata(system: TriageSystemType = 'SATS'): TriageRuleMetadata {
    return system === 'MASS_CASUALTY_POLICY'
      ? { ...this.massCasualtyMetadata }
      : { ...this.satsRuleMetadata };
  }

  /**
   * Classifies acute presentation parameters into an operational triage acuity.
   * STRICT SAFETY INVARIANTS:
   * 1. Output is workflow priority only; does NOT generate clinical orders or diagnosis.
   * 2. SATS classifier produces ONLY: RED, ORANGE, YELLOW, GREEN, BLUE.
   * 3. SATS does NOT produce EXPECTANT_BLACK.
   */
  public classify(input: TriageEvaluationInput): TriageClassificationResult {
    const triageSystem: TriageSystemType = input.triageSystem || 'SATS';
    const concerns: string[] = [...(input.immediateConcerns || [])];

    // Determine Policy Scope & Implementation Type
    let policyScope: TriagePolicyScope = 'ADULT_IN_HOSPITAL';
    let implementationType: TriageImplementationType = 'LOCAL_ADAPTATION';

    if (input.ageInYears !== undefined && input.ageInYears < 12) {
      policyScope = 'PEDIATRIC_IN_HOSPITAL';
      concerns.push('Pediatric patient presentation: pediatric triage adaptation applied');
    } else if (input.isPrehospital || input.arrivalMode === 'AMBULANCE') {
      policyScope = 'PREHOSPITAL_LOCAL_ADAPTATION';
      implementationType = 'LOCAL_ADAPTATION';
      concerns.push('Prehospital / mobile presentation: configured prehospital adaptation applied');
    }

    if (triageSystem === 'MASS_CASUALTY_POLICY') {
      return this.classifyMassCasualty(input, policyScope, concerns);
    }

    return this.classifySATS(input, policyScope, implementationType, concerns);
  }

  /**
   * Standard South African Triage Scale (SATS) classification.
   * SATS Color Set:
   * - RED: Resuscitation (Immediate life threat)
   * - ORANGE: Very Urgent (< 10 min)
   * - YELLOW: Urgent (< 60 min)
   * - GREEN: Routine / Non-urgent (< 240 min)
   * - BLUE: Dead on arrival / No signs of life in standard SATS
   *
   * NOTE: BLACK is NEVER produced by SATS.
   */
  private classifySATS(
    input: TriageEvaluationInput,
    policyScope: TriagePolicyScope,
    implementationType: TriageImplementationType,
    concerns: string[]
  ): TriageClassificationResult {
    let acuity: EmergencyAcuity = 'LESS_URGENT_GREEN';
    let priority: EmergencyWorkflowPriority = 'STANDARD';
    let recommendedBay = 'Ambulatory Consultation Clinic';
    let targetTimeMinutes = 240;

    // Check for Dead on Arrival / Absent signs of life (Standard SATS BLUE)
    const isDeadOnArrival =
      input.hasSignsOfLife === false ||
      (input.heartRate === 0 &&
        input.systolicBp === 0 &&
        !input.airwayPatent &&
        input.glasgowComaScale === 3);

    if (isDeadOnArrival) {
      acuity = 'DEAD_ON_ARRIVAL_BLUE';
      priority = 'LOW';
      recommendedBay = 'Designated Mortuary / Quiet Holding Room';
      targetTimeMinutes = 0;
      concerns.push('Patient without signs of life / Dead on Arrival (SATS Blue)');
    } else {
      // Evaluation based on physiological flags
      const isAirwayObstructed = !input.airwayPatent;
      const lowGcs = input.glasgowComaScale !== undefined && input.glasgowComaScale < 9;
      const profoundHypotension = input.systolicBp !== undefined && input.systolicBp < 80;
      const severeRespiratoryDistress = input.respiratoryDistress;
      const severeShock = input.shockSigns;
      const hypoxia = input.oxygenSaturation !== undefined && input.oxygenSaturation < 90;

      if (isAirwayObstructed || lowGcs || profoundHypotension) {
        acuity = 'RESUSCITATION_RED';
        priority = 'IMMEDIATE';
        recommendedBay = 'Resuscitation Bay 1 (Red Zone)';
        targetTimeMinutes = 0;
        if (isAirwayObstructed) concerns.push('Airway compromise: immediate clinical intervention required');
        if (lowGcs) concerns.push(`Severe neurological depression (GCS ${input.glasgowComaScale}/15)`);
        if (profoundHypotension) concerns.push(`Profound hemodynamic collapse (SBP ${input.systolicBp} mmHg)`);
      } else if (severeRespiratoryDistress || severeShock || hypoxia) {
        acuity = 'EMERGENT_ORANGE';
        priority = 'HIGH';
        recommendedBay = 'High-Dependency Acute Bed (Orange Zone)';
        targetTimeMinutes = 10;
        if (severeRespiratoryDistress) concerns.push('Severe respiratory distress');
        if (severeShock) concerns.push('Hypoperfusion / clinical signs of shock');
        if (hypoxia) concerns.push(`Severe hypoxia (SpO2 ${input.oxygenSaturation}%)`);
      } else if (
        (input.glasgowComaScale !== undefined && input.glasgowComaScale <= 13) ||
        (input.heartRate !== undefined && (input.heartRate > 130 || input.heartRate < 45)) ||
        (input.systolicBp !== undefined && input.systolicBp > 200) ||
        (input.temperature !== undefined && input.temperature > 39.5)
      ) {
        acuity = 'URGENT_YELLOW';
        priority = 'URGENT';
        recommendedBay = 'Acute Assessment Cubicle (Yellow Zone)';
        targetTimeMinutes = 60;
        if (input.heartRate && (input.heartRate > 130 || input.heartRate < 45)) {
          concerns.push(`Significant dysrhythmia / pulse anomaly (${input.heartRate} bpm)`);
        }
        if (input.temperature && input.temperature > 39.5) {
          concerns.push(`Severe hyperpyrexia (${input.temperature}°C)`);
        }
      } else {
        acuity = 'LESS_URGENT_GREEN';
        priority = 'STANDARD';
        recommendedBay = 'Ambulatory Consultation Clinic';
        targetTimeMinutes = 240;
      }
    }

    const targetTimePolicy: TriageTargetTimePolicy = {
      targetTime: targetTimeMinutes,
      targetTimeUnit: 'MINUTES',
      source: 'EMSSA South African Triage Scale Policy',
      version: this.satsRuleMetadata.version,
      policyScope,
      isImmutableMedicalLaw: false,
    };

    const provenance: ProvenanceRecord = {
      source: this.satsRuleMetadata.source,
      ruleId: this.satsRuleMetadata.classification,
      ruleVersion: this.satsRuleMetadata.ruleSetVersion,
      executedAt: new Date().toISOString(),
      evaluationContext: `SATS_TRIAGE_${policyScope}`,
    };

    return {
      triageSystem: 'SATS',
      acuity,
      workflowPriority: priority,
      immediateConcerns: Array.from(new Set(concerns)),
      recommendedBay,
      ruleSetReference: this.satsRuleMetadata.classification,
      ruleSetVersion: this.satsRuleMetadata.ruleSetVersion,
      jurisdiction: this.satsRuleMetadata.jurisdiction,
      sourceReference: this.satsRuleMetadata.source,
      effectiveDate: this.satsRuleMetadata.effectiveDate,
      implementationType,
      policyScope,
      targetTimePolicy,
      isSyntheticDemoRule: true,
      provenance,
    };
  }

  /**
   * Disaster / Mass Casualty Policy Classification (Separate from SATS).
   * Supports EXPECTANT_BLACK for mass-casualty triage.
   */
  private classifyMassCasualty(
    input: TriageEvaluationInput,
    policyScope: TriagePolicyScope,
    concerns: string[]
  ): TriageClassificationResult {
    let acuity: EmergencyAcuity = 'LESS_URGENT_GREEN';
    let priority: EmergencyWorkflowPriority = 'STANDARD';
    let recommendedBay = 'Mass Casualty Minor Treatment Station';
    let targetTimeMinutes = 240;

    if (input.hasSignsOfLife === false || (!input.airwayPatent && input.glasgowComaScale === 3)) {
      acuity = 'EXPECTANT_BLACK';
      priority = 'LOW';
      recommendedBay = 'MCI Expectant / Mortuary Area';
      targetTimeMinutes = 0;
      concerns.push('Mass casualty expectant / confirmed deceased category');
    } else if (!input.airwayPatent || (input.glasgowComaScale && input.glasgowComaScale < 9)) {
      acuity = 'RESUSCITATION_RED';
      priority = 'IMMEDIATE';
      recommendedBay = 'MCI Immediate Stabilization Area';
      targetTimeMinutes = 0;
      concerns.push('MCI Immediate red priority');
    } else if (input.shockSigns || input.respiratoryDistress) {
      acuity = 'URGENT_YELLOW';
      priority = 'URGENT';
      recommendedBay = 'MCI Delayed Treatment Area';
      targetTimeMinutes = 60;
      concerns.push('MCI Delayed yellow priority');
    }

    const targetTimePolicy: TriageTargetTimePolicy = {
      targetTime: targetTimeMinutes,
      targetTimeUnit: 'MINUTES',
      source: 'Disaster / Mass Casualty Triage Protocol',
      version: this.massCasualtyMetadata.version,
      policyScope,
      isImmutableMedicalLaw: false,
    };

    const provenance: ProvenanceRecord = {
      source: this.massCasualtyMetadata.source,
      ruleId: this.massCasualtyMetadata.classification,
      ruleVersion: this.massCasualtyMetadata.ruleSetVersion,
      executedAt: new Date().toISOString(),
      evaluationContext: 'MASS_CASUALTY_TRIAGE',
    };

    return {
      triageSystem: 'MASS_CASUALTY_POLICY',
      acuity,
      workflowPriority: priority,
      immediateConcerns: Array.from(new Set(concerns)),
      recommendedBay,
      ruleSetReference: this.massCasualtyMetadata.classification,
      ruleSetVersion: this.massCasualtyMetadata.ruleSetVersion,
      jurisdiction: this.massCasualtyMetadata.jurisdiction,
      sourceReference: this.massCasualtyMetadata.source,
      effectiveDate: this.massCasualtyMetadata.effectiveDate,
      implementationType: 'LOCAL_ADAPTATION',
      policyScope,
      targetTimePolicy,
      isSyntheticDemoRule: true,
      provenance,
    };
  }

  public validate(triage: Partial<EmergencyTriage>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!triage.emergencyCaseId) errors.push('Emergency case reference is required');
    if (!triage.facilityId) errors.push('Facility identifier is required');
    if (!triage.assessedById) errors.push('Triage clinician identifier is required');
    if (!triage.acuity) errors.push('Triage acuity classification is required');
    if (!triage.chiefComplaint || !triage.chiefComplaint.trim()) {
      errors.push('Chief complaint is mandatory for emergency triage');
    }
    if (triage.airwayPatent === undefined) errors.push('Airway patency assessment is mandatory');
    if (triage.respiratoryDistress === undefined) errors.push('Respiratory distress screening is mandatory');
    if (triage.shockSigns === undefined) errors.push('Shock sign screening is mandatory');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getDisplay(acuity: EmergencyAcuity): {
    label: string;
    colorBadge: string;
    targetTime: string;
    description: string;
    provenanceLabel: string;
  } {
    switch (acuity) {
      case 'RESUSCITATION_RED':
        return {
          label: 'RED - Resuscitation',
          colorBadge: 'bg-red-600 text-white border-red-700',
          targetTime: 'Immediate (0 min)',
          description: 'Immediate resuscitation / imminent life threat',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
      case 'EMERGENT_ORANGE':
        return {
          label: 'ORANGE - Emergent',
          colorBadge: 'bg-orange-500 text-white border-orange-600',
          targetTime: '< 10 mins',
          description: 'Very urgent, high clinical risk of rapid deterioration',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
      case 'URGENT_YELLOW':
        return {
          label: 'YELLOW - Urgent',
          colorBadge: 'bg-amber-500 text-slate-950 border-amber-600',
          targetTime: '< 60 mins',
          description: 'Potentially serious, stable vital signs requiring timely care',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
      case 'LESS_URGENT_GREEN':
        return {
          label: 'GREEN - Routine / Non-Urgent',
          colorBadge: 'bg-emerald-600 text-white border-emerald-700',
          targetTime: '< 240 mins',
          description: 'Routine acute ambulatory presentation',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
      case 'DEAD_ON_ARRIVAL_BLUE':
      case 'NON_URGENT_BLUE':
        return {
          label: 'BLUE - Dead on Arrival / No Signs of Life',
          colorBadge: 'bg-blue-600 text-white border-blue-700',
          targetTime: 'No active resuscitation / Palliative or mortuary care',
          description: 'Confirmed deceased or patient without signs of life upon presentation in SATS',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
      case 'EXPECTANT_BLACK':
        return {
          label: 'BLACK - Expectant / Deceased (MCI Policy Only)',
          colorBadge: 'bg-slate-800 text-slate-300 border-slate-700',
          targetTime: 'Palliative / Deceased',
          description: 'Disaster / mass casualty expectant category (NOT standard SATS)',
          provenanceLabel: 'MASS CASUALTY POLICY SPECIFICATION',
        };
      default:
        return {
          label: 'UNCLASSIFIED',
          colorBadge: 'bg-slate-700 text-slate-200 border-slate-600',
          targetTime: 'Pending triage',
          description: 'Awaiting formal clinical triage assessment',
          provenanceLabel: 'SATS LOCAL ADAPTATION',
        };
    }
  }
}

export const triageClassificationService = TriageClassificationService.getInstance();
