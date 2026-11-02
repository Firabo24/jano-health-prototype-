/**
 * Jano Health - Clinical Core V2: Authoritative Vital Signs Service
 * 
 * Manages bedside physiological measurements with domain-level validation,
 * physiological safety warnings, and immutable event ledger integration.
 */

import { RoleType, VitalSign } from '../../domain/types';
import { generateEntityId } from '../../domain/identifiers';
import { canUserPerform } from '../../domain/permissions';
import { localDb } from '../storage/localDatabase';
import { localRepository } from '../storage/localRepository';
import { clinicalTransaction, ClinicalActorContext } from './clinicalTransaction';
import { AuthenticatedPrincipal } from './patientService';

export class VitalValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VitalValidationException';
  }
}

export interface RecordVitalSignsInput {
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weightKg?: number;
  heightCm?: number;
  painScore?: number;
  bloodGlucoseMgDl?: number;
  recordedAt?: string;
}

export class VitalsService {
  private static instance: VitalsService;

  private constructor() {}

  public static getInstance(): VitalsService {
    if (!VitalsService.instance) {
      VitalsService.instance = new VitalsService();
    }
    return VitalsService.instance;
  }

  /**
   * Validates physiological plausibility and returns clinical warning flags.
   */
  public evaluateVitals(input: RecordVitalSignsInput): { warnings: string[] } {
    const warnings: string[] = [];

    // 1. Blood Pressure Validation
    if (input.systolicBp !== undefined) {
      if (input.systolicBp < 30 || input.systolicBp > 300) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Systolic blood pressure (${input.systolicBp} mmHg) is outside physiological plausibility range [30 - 300 mmHg].`
        );
      }
      if (input.systolicBp >= 180) {
        warnings.push('CRITICAL_HYPERTENSION_STAGE_3: Systolic BP >= 180 mmHg');
      } else if (input.systolicBp < 90) {
        warnings.push('HYPOTENSION_WARNING: Systolic BP < 90 mmHg');
      }
    }

    if (input.diastolicBp !== undefined) {
      if (input.diastolicBp < 20 || input.diastolicBp > 200) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Diastolic blood pressure (${input.diastolicBp} mmHg) is outside physiological plausibility range [20 - 200 mmHg].`
        );
      }
      if (input.diastolicBp >= 120) {
        warnings.push('HYPERTENSIVE_CRISIS: Diastolic BP >= 120 mmHg');
      }
    }

    if (input.systolicBp !== undefined && input.diastolicBp !== undefined) {
      if (input.systolicBp <= input.diastolicBp) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Systolic BP (${input.systolicBp}) must be strictly greater than diastolic BP (${input.diastolicBp}).`
        );
      }
    }

    // 2. Heart Rate Validation
    if (input.heartRate !== undefined) {
      if (input.heartRate < 20 || input.heartRate > 300) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Pulse rate (${input.heartRate} bpm) is outside plausible human range [20 - 300 bpm].`
        );
      }
      if (input.heartRate > 130) {
        warnings.push('SEVERE_TACHYCARDIA: Heart rate > 130 bpm');
      } else if (input.heartRate < 50) {
        warnings.push('BRADYCARDIA_ALERT: Heart rate < 50 bpm');
      }
    }

    // 3. Temperature Validation (Assuming Celsius, standard clinical norm)
    if (input.temperature !== undefined) {
      // If entered in Fahrenheit (e.g. > 50), normalize to Celsius for range check or check standard C
      const tempC = input.temperature > 50 ? ((input.temperature - 32) * 5) / 9 : input.temperature;
      if (tempC < 25 || tempC > 45) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Core temperature (${input.temperature}) is outside plausible range [25°C - 45°C].`
        );
      }
      if (tempC >= 39.0) {
        warnings.push('HIGH_FEVER_ALERT: Core temperature >= 39.0°C');
      } else if (tempC < 35.0) {
        warnings.push('HYPOTHERMIA_ALERT: Core temperature < 35.0°C');
      }
    }

    // 4. Respiratory Rate Validation
    if (input.respiratoryRate !== undefined) {
      if (input.respiratoryRate < 4 || input.respiratoryRate > 100) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Respiratory rate (${input.respiratoryRate} bpm) is outside plausible range [4 - 100 bpm].`
        );
      }
      if (input.respiratoryRate >= 30) {
        warnings.push('TACHYPNEA_ALERT: Respiratory rate >= 30 bpm');
      } else if (input.respiratoryRate < 10) {
        warnings.push('BRADYPNEA_ALERT: Respiratory rate < 10 bpm');
      }
    }

    // 5. Oxygen Saturation (SpO2) Validation
    if (input.oxygenSaturation !== undefined) {
      if (input.oxygenSaturation < 15 || input.oxygenSaturation > 100) {
        throw new VitalValidationException(
          `Physiological Validation Failed: SpO2 (${input.oxygenSaturation}%) is invalid. Value must be between 15% and 100%.`
        );
      }
      if (input.oxygenSaturation < 90) {
        warnings.push('SEVERE_HYPOXEMIA: SpO2 < 90% (Urgent oxygen supplementation recommended)');
      } else if (input.oxygenSaturation < 94) {
        warnings.push('HYPOXEMIA_WARNING: SpO2 between 90% and 94%');
      }
    }

    // 6. Blood Glucose Validation
    if (input.bloodGlucoseMgDl !== undefined) {
      if (input.bloodGlucoseMgDl < 10 || input.bloodGlucoseMgDl > 1500) {
        throw new VitalValidationException(
          `Physiological Validation Failed: Blood glucose (${input.bloodGlucoseMgDl} mg/dL) is outside clinical measurement range.`
        );
      }
      if (input.bloodGlucoseMgDl < 60) {
        warnings.push('HYPOGLYCEMIA_ALERT: Blood glucose < 60 mg/dL');
      } else if (input.bloodGlucoseMgDl >= 300) {
        warnings.push('SEVERE_HYPERGLYCEMIA_ALERT: Blood glucose >= 300 mg/dL');
      }
    }

    // 7. Pain Score Validation
    if (input.painScore !== undefined) {
      if (input.painScore < 0 || input.painScore > 10) {
        throw new VitalValidationException(
          `Validation Failed: Pain score (${input.painScore}) must be on a 0-10 numeric rating scale.`
        );
      }
    }

    // 8. Weight & Height Validation
    if (input.weightKg !== undefined && (input.weightKg <= 0 || input.weightKg > 600)) {
      throw new VitalValidationException(
        `Validation Failed: Weight (${input.weightKg} kg) is outside plausible range [0.1 - 600 kg].`
      );
    }
    if (input.heightCm !== undefined && (input.heightCm <= 0 || input.heightCm > 280)) {
      throw new VitalValidationException(
        `Validation Failed: Height (${input.heightCm} cm) is outside plausible range [10 - 280 cm].`
      );
    }

    return { warnings };
  }

  /**
   * Records bedside physiological vital signs through the atomic transaction pipeline.
   */
  public async recordVitalSigns(
    input: RecordVitalSignsInput,
    principal: AuthenticatedPrincipal
  ): Promise<VitalSign> {
    // 1. Authorization: Role check
    if (
      !canUserPerform(
        { role: principal.role },
        'vitals.write'
      ) &&
      !canUserPerform(
        { role: principal.role },
        'vitals:record'
      )
    ) {
      throw new Error(
        `Security Exception: Role [${principal.role}] is not authorized to record patient vitals.`
      );
    }

    // 2. Patient check
    const patient =
      localDb.getPatientById(input.patientId) ||
      (await localRepository.getPatient(input.patientId));
    if (!patient) {
      throw new Error(`Patient with ID [${input.patientId}] does not exist.`);
    }

    // 3. Physiological Range Validation & Warning Detection
    const { warnings } = this.evaluateVitals(input);

    const vitalId = generateEntityId('vit');
    const nowIso = new Date().toISOString();
    const facilityId = input.facilityId || principal.facilityId;
    const deviceId =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('jano_device_id_v2') || 'client-node-1'
        : 'client-node-1';

    const vital: VitalSign = {
      id: vitalId,
      patientId: input.patientId,
      encounterId: input.encounterId,
      facilityId,
      recordedById: principal.id,
      recordedByName: principal.fullName,
      recordedByRole: principal.role,
      recordedAt: input.recordedAt || nowIso,
      systolicBp: input.systolicBp,
      diastolicBp: input.diastolicBp,
      heartRate: input.heartRate,
      temperature: input.temperature,
      respiratoryRate: input.respiratoryRate,
      oxygenSaturation: input.oxygenSaturation,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      painScore: input.painScore,
      bloodGlucoseMgDl: input.bloodGlucoseMgDl,
      clinicalWarnings: warnings.length > 0 ? warnings : undefined,
      version: 1,
      syncStatus: 'LOCAL_ONLY',
    };

    const actorContext: ClinicalActorContext = {
      userId: principal.id,
      userName: principal.fullName,
      userRole: principal.role,
      facilityId: principal.facilityId,
      deviceId,
    };

    const committed = await clinicalTransaction.execute<VitalSign>({
      actionName: 'RECORD_VITAL_SIGNS',
      resourceType: 'VitalSign',
      resourceId: vital.id,
      targetStore: 'vitals',
      actor: actorContext,
      validate: () => {},
      buildEntity: async () => ({
        entity: vital,
        eventType: 'VitalSignsRecorded',
        aggregateId: vital.id,
        aggregateType: 'VitalSign',
        version: 1,
        auditAction: 'VITAL_SIGNS_RECORDED',
      }),
    });

    await localDb.saveVital(committed);
    return committed;
  }

  /**
   * Retrieves all vital signs for a given patient.
   */
  public async getPatientVitals(patientId: string, encounterId?: string): Promise<VitalSign[]> {
    let list = localDb.getVitals(patientId);
    if (encounterId) {
      list = list.filter((v) => v.encounterId === encounterId);
    }
    // Sort descending by recordedAt
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }
}

export const vitalsService = VitalsService.getInstance();
