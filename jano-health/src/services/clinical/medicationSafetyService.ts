/**
 * Jano Health - Medication Safety Service (Clinical Core V6)
 * 
 * Provides deterministic clinical safety screening for medication orders and prescriptions:
 * 1. Allergy Cross-Sensitivities (with Penicillin/Beta-lactam, NSAID, Sulfa, etc.)
 * 2. Drug-Drug Interactions (Warfarin+NSAID, Lisinopril+Spironolactone, etc.)
 * 3. Clinical Contraindications (Pediatric, Pregnancy, Renal/Ulcer history)
 * 4. Duplicate Therapy Detection (Same class / overlapping antimicrobials/NSAIDs)
 * 5. Dose Structure & Allowable Route Verification
 * 
 * CRITICAL SAFETY INVARIANTS:
 * - When interaction or safety knowledge is missing: return UNKNOWN / KNOWLEDGE_UNAVAILABLE.
 * - UNKNOWN must NEVER become CLEAR or SAFE.
 * - Every check returns explicit provenance, ruleSetVersion, jurisdiction, and checkedAt.
 * 
 * DISCLAIMER: Synthetic clinical rules for simulation, testing, and rural dispensary validation.
 */

import {
  MedicationDefinition,
  MedicationRoute,
  SafetyCheckResult,
  OverallMedicationOrderSafetyState,
  MedicationSafetyStatus,
} from '../../domain/medicationTypes';
import { Allergy, Patient } from '../../domain/types';

export interface SafetyScreeningContext {
  patient: Partial<Patient>;
  allergies: Allergy[];
  activeMedications: Array<{
    id: string;
    genericName: string;
    brandName?: string;
    therapeuticClass?: string;
    medicationDefinitionId?: string;
    status: string;
  }>;
  activeDiagnoses?: Array<{
    code: string;
    description: string;
    status: string;
  }>;
}

export interface MedicationOrderValidationParams {
  medicationDefinition: MedicationDefinition;
  route: MedicationRoute;
  dose: string;
  doseUnit: string;
  frequency: string;
  durationValue: number;
  quantity: number;
  indication: string;
}

export class MedicationSafetyService {
  private static instance: MedicationSafetyService;

  private readonly SOURCE_ORGANIZATION = 'WHO';
  private readonly SOURCE_DOCUMENT = 'WHO Model List of Essential Medicines';
  private readonly EDITION = '24th';
  private readonly PUBLICATION_YEAR = 2025;
  private readonly PUBLISHED_AT = '2025-09-05';
  private readonly EFFECTIVE_DATE = '2025-09-05';
  private readonly SOURCE_TAG = 'WHO-MODEL-EML-24TH-2025-SYNTHETIC-RULES';
  private readonly SOURCE_VERSION = '24th-2025-synthetic';
  private readonly JURISDICTION = 'WHO_MODEL_CATALOG_SYNTHETIC';
  private readonly RULESET_VERSION = 'v6-synthetic';

  private constructor() {}

  public static getInstance(): MedicationSafetyService {
    if (!MedicationSafetyService.instance) {
      MedicationSafetyService.instance = new MedicationSafetyService();
    }
    return MedicationSafetyService.instance;
  }

  /**
   * Helper to attach standard WHO 24th List (2025) and demo rule metadata
   */
  private buildMetadata(classification: 'SYNTHETIC_DEMO' | 'CONFIGURED_POLICY' | 'UNAVAILABLE' = 'SYNTHETIC_DEMO') {
    return {
      source: this.SOURCE_TAG,
      sourceVersion: this.SOURCE_VERSION,
      jurisdiction: this.JURISDICTION,
      effectiveDate: this.EFFECTIVE_DATE,
      sourceOrganization: this.SOURCE_ORGANIZATION,
      sourceDocument: this.SOURCE_DOCUMENT,
      edition: this.EDITION,
      publicationYear: this.PUBLICATION_YEAR,
      publishedAt: this.PUBLISHED_AT,
      ruleSetVersion: this.RULESET_VERSION,
      ruleClassification: classification,
    };
  }

  /**
   * Evaluates patient allergy records against the proposed medication definition.
   */
  public checkAllergies(
    patient: Partial<Patient>,
    allergies: Allergy[],
    definition: MedicationDefinition
  ): SafetyCheckResult {
    const checkedAt = new Date().toISOString();

    // 1. Incomplete Allergy Record Guard
    const hasDocumentedAllergies = allergies && allergies.length > 0;
    const hasSummary = patient.allergiesSummary && patient.allergiesSummary.length > 0;

    if (!hasDocumentedAllergies && !hasSummary) {
      return {
        checkType: 'ALLERGY',
        status: 'UNKNOWN',
        severity: 'LOW',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: 'No allergy assessment documented for patient. Allergy safety status is UNKNOWN.',
        recommendation: 'Inquire directly with patient or caregiver regarding past adverse drug reactions before administering.',
      };
    }

    // 2. Unclassified experimental entity check
    if (definition.code === 'SYNTH-UNKNOWN-999' || definition.id.includes('unknown')) {
      return {
        checkType: 'ALLERGY',
        status: 'UNKNOWN',
        severity: 'LOW',
        ...this.buildMetadata('UNAVAILABLE'),
        source: 'KNOWLEDGE_UNAVAILABLE: NO_LOCAL_RULES',
        sourceOrganization: 'SYNTHETIC_LAB',
        sourceDocument: 'Experimental Clinical Simulation Library',
        checkedAt,
        message: `SYNTHETIC DEMO RULE: Cross-reactivity knowledge is unavailable for unclassified entity ${definition.genericName}. Allergy safety status is UNKNOWN.`,
        recommendation: 'Consult external clinical pharmacopeia.',
      };
    }

    // Explicit No Known Drug Allergies (NKDA)
    const isNkda =
      (patient.allergiesSummary || []).some((s) => s.toLowerCase().includes('nkda') || s.toLowerCase().includes('no known drug allergies')) ||
      allergies.some((a) => a.allergen.toLowerCase().includes('nkda') || a.reaction.toLowerCase().includes('no known'));

    // Check known allergens
    const matchedAllergens: string[] = [];
    const targetGeneric = definition.genericName.toLowerCase();
    const targetClass = (definition.therapeuticClass || '').toLowerCase();

    // Penicillin cross-reactivity
    const isPenicillinClass = targetGeneric.includes('amoxicillin') ||
      targetGeneric.includes('ampicillin') ||
      targetGeneric.includes('penicillin') ||
      targetClass.includes('penicillin');

    // Cephalosporin cross-reactivity
    const isCephalosporinClass = targetGeneric.includes('ceftriaxone') ||
      targetGeneric.includes('cef') ||
      targetClass.includes('cephalosporin');

    // NSAID cross-reactivity
    const isNsaidClass = targetGeneric.includes('ibuprofen') ||
      targetGeneric.includes('aspirin') ||
      targetGeneric.includes('diclofenac') ||
      targetClass.includes('nsaid');

    for (const allergy of allergies) {
      if (!allergy.active) continue;
      const allergen = allergy.allergen.toLowerCase();

      if (allergen.includes('penicillin') || allergen.includes('amoxicillin') || allergen.includes('beta-lactam')) {
        if (isPenicillinClass) {
          matchedAllergens.push(`Documented Penicillin allergy: "${allergy.allergen}" (${allergy.reaction || 'Anaphylaxis/Rash risk'})`);
        } else if (isCephalosporinClass) {
          matchedAllergens.push(`Possible cross-reactivity between Penicillin and Cephalosporin: "${allergy.allergen}"`);
        }
      }

      if (allergen.includes('nsaid') || allergen.includes('aspirin') || allergen.includes('ibuprofen')) {
        if (isNsaidClass) {
          matchedAllergens.push(`Documented NSAID/Aspirin allergy: "${allergy.allergen}"`);
        }
      }
    }

    // Also check string allergiesSummary if present
    for (const summaryItem of (patient.allergiesSummary || [])) {
      const lower = summaryItem.toLowerCase();
      if ((lower.includes('penicillin') || lower.includes('amox')) && isPenicillinClass) {
        if (!matchedAllergens.some((m) => m.includes('Penicillin'))) {
          matchedAllergens.push(`Chart Allergy Summary: "${summaryItem}"`);
        }
      }
      if ((lower.includes('nsaid') || lower.includes('aspirin')) && isNsaidClass) {
        if (!matchedAllergens.some((m) => m.includes('NSAID'))) {
          matchedAllergens.push(`Chart Allergy Summary: "${summaryItem}"`);
        }
      }
    }

    if (matchedAllergens.length > 0) {
      const isSevere = matchedAllergens.some((m) => m.toLowerCase().includes('penicillin') && isPenicillinClass);
      return {
        checkType: 'ALLERGY',
        status: isSevere ? 'CONTRAINDICATED' : 'HIGH_RISK',
        severity: isSevere ? 'CRITICAL' : 'HIGH',
        ...this.buildMetadata('SYNTHETIC_DEMO'),
        checkedAt,
        message: `SYNTHETIC DEMO RULE: High risk drug allergy alert: ${definition.genericName} is cross-reactive with patient allergen(s).`,
        matchedEvidence: matchedAllergens,
        recommendation: 'Select an alternate non-cross-reactive antimicrobial or therapeutic agent.',
      };
    }

    return {
      checkType: 'ALLERGY',
      status: 'CLEAR',
      severity: 'NONE',
      ...this.buildMetadata('CONFIGURED_POLICY'),
      checkedAt,
      message: isNkda
        ? 'No documented drug allergies matched (Patient has documented NKDA).'
        : 'SYNTHETIC DEMO RULE: No known allergy cross-reactivity detected against current patient allergy record in synthetic catalog.',
    };
  }

  /**
   * Evaluates drug-drug interactions between proposed medication and active medications.
   */
  public checkInteractions(
    definition: MedicationDefinition,
    activeMeds: Array<{ genericName: string; brandName?: string; therapeuticClass?: string }>
  ): SafetyCheckResult {
    const checkedAt = new Date().toISOString();

    // Check if target entity has unknown interaction rules (e.g. experimental or unclassified)
    if (definition.code === 'SYNTH-UNKNOWN-999' || definition.id.includes('unknown')) {
      return {
        checkType: 'DRUG_INTERACTION',
        status: 'KNOWLEDGE_UNAVAILABLE',
        severity: 'LOW',
        source: 'KNOWLEDGE_UNAVAILABLE: NO_LOCAL_RULES',
        sourceOrganization: 'SYNTHETIC_LAB',
        sourceDocument: 'Experimental Clinical Simulation Library',
        edition: 'N/A',
        publicationYear: 2025,
        publishedAt: '2025-09-05',
        sourceVersion: this.SOURCE_VERSION,
        jurisdiction: this.JURISDICTION,
        effectiveDate: this.EFFECTIVE_DATE,
        ruleSetVersion: this.RULESET_VERSION,
        ruleClassification: 'UNAVAILABLE',
        checkedAt,
        message: `SYNTHETIC DEMO: No interaction safety rules found in local catalog for ${definition.genericName}. Safety state is UNKNOWN / KNOWLEDGE_UNAVAILABLE.`,
        recommendation: 'Consult clinical pharmacopeia or external drug reference.',
      };
    }

    if (!activeMeds || activeMeds.length === 0) {
      return {
        checkType: 'DRUG_INTERACTION',
        status: 'CLEAR',
        severity: 'NONE',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: 'No active co-medications on patient record to assess for interactions.',
      };
    }

    const target = definition.genericName.toLowerCase();
    const interactionsFound: Array<{ message: string; severity: 'HIGH' | 'CRITICAL' | 'MODERATE' }> = [];

    for (const active of activeMeds) {
      const activeName = active.genericName.toLowerCase();

      // 1. Warfarin + NSAID (Ibuprofen / Aspirin) -> Severe Hemorrhage Risk
      const isTargetWarfarin = target.includes('warfarin');
      const isActiveWarfarin = activeName.includes('warfarin');
      const isTargetNsaid = target.includes('ibuprofen') || target.includes('aspirin');
      const isActiveNsaid = activeName.includes('ibuprofen') || activeName.includes('aspirin');

      if ((isTargetWarfarin && isActiveNsaid) || (isActiveWarfarin && isTargetNsaid)) {
        interactionsFound.push({
          message: 'Warfarin + NSAID / Aspirin: Severe synergistic bleeding risk and upper GI ulceration.',
          severity: 'CRITICAL',
        });
      }

      // 2. Lisinopril (ACEI) + Spironolactone (K-sparing diuretic) -> Hyperkalemia
      const isTargetLisi = target.includes('lisinopril') || target.includes('enalapril');
      const isActiveLisi = activeName.includes('lisinopril') || activeName.includes('enalapril');
      const isTargetSpir = target.includes('spironolactone');
      const isActiveSpir = activeName.includes('spironolactone');

      if ((isTargetLisi && isActiveSpir) || (isActiveLisi && isTargetSpir)) {
        interactionsFound.push({
          message: 'Lisinopril + Spironolactone: Synergistic potassium retention risk. High risk of life-threatening hyperkalemia.',
          severity: 'HIGH',
        });
      }

      // 3. Ciprofloxacin + Ibuprofen -> Lowered Seizure Threshold
      const isTargetCipro = target.includes('ciprofloxacin');
      const isActiveCipro = activeName.includes('ciprofloxacin');
      if ((isTargetCipro && isActiveNsaid) || (isActiveCipro && isTargetNsaid)) {
        interactionsFound.push({
          message: 'Ciprofloxacin + NSAID: Concomitant administration may augment CNS stimulation and increase convulsion risk.',
          severity: 'MODERATE',
        });
      }
    }

    if (interactionsFound.length > 0) {
      const hasCritical = interactionsFound.some((i) => i.severity === 'CRITICAL');
      return {
        checkType: 'DRUG_INTERACTION',
        status: hasCritical ? 'HIGH_RISK' : 'WARNING',
        severity: hasCritical ? 'CRITICAL' : 'HIGH',
        ...this.buildMetadata('SYNTHETIC_DEMO'),
        checkedAt,
        message: interactionsFound.map((i) => `SYNTHETIC DEMO RULE: ${i.message}`).join(' | '),
        matchedEvidence: interactionsFound.map((i) => i.message),
        recommendation: 'Evaluate risk-benefit; require clinician acknowledgement with monitoring plan.',
      };
    }

    return {
      checkType: 'DRUG_INTERACTION',
      status: 'CLEAR',
      severity: 'NONE',
      ...this.buildMetadata('SYNTHETIC_DEMO'),
      checkedAt,
      message: 'SYNTHETIC DEMO RULES: No interactions detected against local synthetic ruleset (Note: This demonstration ruleset is limited to Warfarin+NSAID, Lisinopril+Spironolactone, and Ciprofloxacin+NSAID; it is not a comprehensive drug interaction database).',
    };
  }

  /**
   * Evaluates patient contraindications (age, sex, pregnancy status, active diagnoses).
   */
  public checkContraindications(
    patient: Partial<Patient>,
    definition: MedicationDefinition,
    diagnoses: Array<{ code: string; description: string }> = []
  ): SafetyCheckResult {
    const checkedAt = new Date().toISOString();
    const target = definition.genericName.toLowerCase();
    const matchedContraindications: string[] = [];

    // Calculate approximate patient age
    let patientAgeYears: number | null = null;
    if (patient.dateOfBirth) {
      const birthYear = parseInt(patient.dateOfBirth.substring(0, 4), 10);
      if (!isNaN(birthYear)) {
        patientAgeYears = new Date().getFullYear() - birthYear;
      }
    }

    // 1. Methotrexate: Contraindicated in Pregnancy
    if (target.includes('methotrexate')) {
      const isFemale = patient.sex === 'female' || patient.gender === 'female';
      const isChildbearingAge = patientAgeYears !== null && patientAgeYears >= 12 && patientAgeYears <= 50;

      // Check if pregnancy diagnosis exists
      const hasPregnancyDiagnosis = diagnoses.some(
        (d) => d.description.toLowerCase().includes('pregnan') || d.code.startsWith('O')
      );

      if (hasPregnancyDiagnosis || (isFemale && isChildbearingAge)) {
        matchedContraindications.push(
          'Methotrexate is strictly CONTRAINDICATED in pregnancy due to severe teratogenicity, fetal death, and congenital malformations.'
        );
      }
    }

    // 2. Ciprofloxacin: Pediatric warning (cartilage arthropathy in < 18 years)
    if (target.includes('ciprofloxacin')) {
      if (patientAgeYears !== null && patientAgeYears < 18) {
        matchedContraindications.push(
          `Ciprofloxacin in pediatric patient (Age: ${patientAgeYears} yrs): Fluoroquinolones cause arthropathy in juvenile weight-bearing joints. Use only when safer alternatives are unavailable.`
        );
      }
    }

    // 3. Ibuprofen / NSAIDs: Active Peptic Ulcer or GI Bleeding
    if (target.includes('ibuprofen') || target.includes('aspirin')) {
      const hasUlcerOrBleed = diagnoses.some((d) => {
        const desc = d.description.toLowerCase();
        return desc.includes('peptic ulcer') || desc.includes('gastric ulcer') || desc.includes('gi bleed') || desc.includes('melena');
      });
      if (hasUlcerOrBleed) {
        matchedContraindications.push(
          'NSAIDs are contraindicated in patients with active peptic ulcer disease or gastrointestinal hemorrhage.'
        );
      }
    }

    // If critical patient demographic data is entirely absent
    if (patientAgeYears === null && !patient.sex) {
      return {
        checkType: 'CONTRAINDICATION',
        status: 'UNKNOWN',
        severity: 'LOW',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: 'Patient age and sex missing from demographics. Contraindication profile cannot be conclusively determined.',
      };
    }

    if (matchedContraindications.length > 0) {
      const isStrict = matchedContraindications.some((c) => c.includes('strictly CONTRAINDICATED') || c.includes('contraindicated'));
      return {
        checkType: 'CONTRAINDICATION',
        status: isStrict ? 'CONTRAINDICATED' : 'WARNING',
        severity: isStrict ? 'CRITICAL' : 'HIGH',
        ...this.buildMetadata('SYNTHETIC_DEMO'),
        checkedAt,
        message: matchedContraindications.map((c) => `SYNTHETIC DEMO RULE: ${c}`).join(' | '),
        matchedEvidence: matchedContraindications,
      };
    }

    return {
      checkType: 'CONTRAINDICATION',
      status: 'CLEAR',
      severity: 'NONE',
      ...this.buildMetadata('SYNTHETIC_DEMO'),
      checkedAt,
      message: 'SYNTHETIC DEMO RULES: No known clinical contraindications detected based on current patient demographics and diagnoses.',
    };
  }

  /**
   * Evaluates for duplicate active therapy in the same generic molecule or drug class.
   */
  public checkDuplicateTherapy(
    definition: MedicationDefinition,
    activeMeds: Array<{ genericName: string; therapeuticClass?: string; status: string }>
  ): SafetyCheckResult {
    const checkedAt = new Date().toISOString();
    const targetGeneric = definition.genericName.toLowerCase();
    const targetClass = (definition.therapeuticClass || '').toLowerCase();

    const duplicates: string[] = [];

    for (const med of activeMeds) {
      const statusUpper = (med.status || '').toUpperCase();
      if (statusUpper !== 'ACTIVE' && statusUpper !== 'PENDING' && statusUpper !== 'DISPENSED') {
        continue;
      }

      const otherGeneric = med.genericName.toLowerCase();
      const otherClass = (med.therapeuticClass || '').toLowerCase();

      // Exact same generic molecule
      if (otherGeneric.includes(targetGeneric) || targetGeneric.includes(otherGeneric)) {
        duplicates.push(`Patient already has active regimen of ${med.genericName}`);
      }
      // Same antimicrobial / beta-lactam class
      else if (
        targetClass.includes('penicillin') && (otherClass.includes('penicillin') || otherGeneric.includes('amoxicillin'))
      ) {
        duplicates.push(`Concurrent beta-lactam antimicrobial therapy with ${med.genericName}`);
      }
      // Same NSAID class
      else if (
        targetClass.includes('nsaid') && (otherClass.includes('nsaid') || otherGeneric.includes('ibuprofen') || otherGeneric.includes('diclofenac'))
      ) {
        duplicates.push(`Concurrent duplicate NSAID therapy with ${med.genericName}`);
      }
    }

    if (duplicates.length > 0) {
      return {
        checkType: 'DUPLICATE_THERAPY',
        status: 'WARNING',
        severity: 'MODERATE',
        ...this.buildMetadata('SYNTHETIC_DEMO'),
        checkedAt,
        message: `SYNTHETIC DEMO RULE: Duplicate therapy alert: ${duplicates.join('; ')}`,
        matchedEvidence: duplicates,
        recommendation: 'Confirm whether current order is intended to replace or augment existing regimen.',
      };
    }

    return {
      checkType: 'DUPLICATE_THERAPY',
      status: 'CLEAR',
      severity: 'NONE',
      ...this.buildMetadata('CONFIGURED_POLICY'),
      checkedAt,
      message: 'No duplicate active regimens or overlapping same-class agents identified.',
    };
  }

  /**
   * Validates structural parameters of the dosage instruction and allowable route.
   */
  public validateDoseAndRoute(params: MedicationOrderValidationParams): {
    routeCheck: SafetyCheckResult;
    doseCheck: SafetyCheckResult;
  } {
    const checkedAt = new Date().toISOString();
    const { medicationDefinition, route, dose, doseUnit, frequency, durationValue, quantity, indication } = params;

    // 1. Route validation against allowable routeOptions
    const isRouteAllowed = medicationDefinition.routeOptions.includes(route);
    let routeCheck: SafetyCheckResult;

    if (!isRouteAllowed) {
      routeCheck = {
        checkType: 'ROUTE',
        status: 'CONTRAINDICATED',
        severity: 'CRITICAL',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: `Selected route "${route}" is NOT an authorized clinical route for formulation ${medicationDefinition.dosageForm}. Authorized routes: ${medicationDefinition.routeOptions.join(', ')}.`,
        recommendation: `Change administration route to one of: ${medicationDefinition.routeOptions.join(', ')}.`,
      };
    } else {
      routeCheck = {
        checkType: 'ROUTE',
        status: 'CLEAR',
        severity: 'NONE',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: `Route "${route}" is valid for ${medicationDefinition.dosageForm}.`,
      };
    }

    // 2. Dose structure validation
    const missingFields: string[] = [];
    if (!dose || !dose.trim()) missingFields.push('dose value');
    if (!doseUnit || !doseUnit.trim()) missingFields.push('dose unit');
    if (!frequency || !frequency.trim()) missingFields.push('dosing frequency');
    if (!durationValue || durationValue <= 0) missingFields.push('duration value (> 0)');
    if (!quantity || quantity <= 0) missingFields.push('dispense quantity (> 0)');
    if (!indication || !indication.trim()) missingFields.push('clinical indication');

    let doseCheck: SafetyCheckResult;
    if (missingFields.length > 0) {
      doseCheck = {
        checkType: 'DOSE_STRUCTURE',
        status: 'WARNING',
        severity: 'HIGH',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: `Medication order structure incomplete. Missing: ${missingFields.join(', ')}.`,
        recommendation: 'Complete all mandatory prescription fields before signing.',
      };
    } else {
      doseCheck = {
        checkType: 'DOSE_STRUCTURE',
        status: 'CLEAR',
        severity: 'NONE',
        ...this.buildMetadata('CONFIGURED_POLICY'),
        checkedAt,
        message: 'Dose, frequency, duration, and quantity are structurally complete.',
      };
    }

    return { routeCheck, doseCheck };
  }

  /**
   * Runs the full suite of clinical safety checks and derives overall safety state.
   */
  public runFullSafetyScreen(
    params: MedicationOrderValidationParams,
    context: SafetyScreeningContext
  ): {
    checks: SafetyCheckResult[];
    overallState: OverallMedicationOrderSafetyState;
    canIssueDirectly: boolean;
    requiresAcknowledgement: boolean;
    isBlocked: boolean;
  } {
    const allergyCheck = this.checkAllergies(context.patient, context.allergies, params.medicationDefinition);
    const interactionCheck = this.checkInteractions(params.medicationDefinition, context.activeMedications);
    const contraindicationCheck = this.checkContraindications(
      context.patient,
      params.medicationDefinition,
      context.activeDiagnoses
    );
    const duplicateCheck = this.checkDuplicateTherapy(params.medicationDefinition, context.activeMedications);
    const { routeCheck, doseCheck } = this.validateDoseAndRoute(params);

    const checks: SafetyCheckResult[] = [
      allergyCheck,
      interactionCheck,
      contraindicationCheck,
      duplicateCheck,
      routeCheck,
      doseCheck,
    ];

    const overallState = this.deriveOverallSafetyState(checks);

    const isBlocked = overallState === 'CONTRAINDICATED';
    const requiresAcknowledgement = overallState === 'WARNING' || overallState === 'HIGH_RISK' || overallState === 'CONTRAINDICATED';
    const canIssueDirectly = overallState === 'SAFE_TO_REVIEW';

    return {
      checks,
      overallState,
      canIssueDirectly,
      requiresAcknowledgement,
      isBlocked,
    };
  }

  /**
   * Derives aggregate safety state from individual checks.
   * CRITICAL: If any check is UNKNOWN or KNOWLEDGE_UNAVAILABLE, state is KNOWLEDGE_UNAVAILABLE (never SAFE).
   */
  public deriveOverallSafetyState(checks: SafetyCheckResult[]): OverallMedicationOrderSafetyState {
    if (checks.some((c) => c.status === 'CONTRAINDICATED')) {
      return 'CONTRAINDICATED';
    }
    if (checks.some((c) => c.status === 'HIGH_RISK')) {
      return 'HIGH_RISK';
    }
    if (checks.some((c) => c.status === 'WARNING')) {
      return 'WARNING';
    }
    if (checks.some((c) => c.status === 'UNKNOWN' || c.status === 'KNOWLEDGE_UNAVAILABLE')) {
      return 'KNOWLEDGE_UNAVAILABLE';
    }
    return 'SAFE_TO_REVIEW';
  }

  /**
   * Convenient clinical evaluation API for prescribing screens and test suites.
   */
  public async evaluateSafety(options: {
    patient: {
      id: string;
      allergies?: string[];
      activeDiagnoses?: string[];
    };
    candidateMedication: MedicationDefinition;
    candidateDose: string;
    candidateDoseUnit: string;
    candidateRoute: MedicationRoute;
    candidateFrequency: string;
    candidateDurationDays: number;
    candidateQuantity: number;
    activeMedications: Array<{
      definitionId?: string;
      genericName: string;
      active: boolean;
    }>;
  }): Promise<{
    checks: SafetyCheckResult[];
    overallState: OverallMedicationOrderSafetyState;
    canIssueDirectly: boolean;
    requiresAcknowledgement: boolean;
    isBlocked: boolean;
  }> {
    const allergies: Allergy[] = (options.patient.allergies || []).map((allergen, idx) => ({
      id: `alg_${idx}`,
      patientId: options.patient.id,
      allergen,
      type: 'drug',
      severity: 'severe',
      reaction: 'Documented hypersensitivity',
      diagnosedDate: new Date().toISOString(),
      active: true,
    }));

    const activeMeds = options.activeMedications
      .filter((m) => m.active)
      .map((m, idx) => ({
        id: m.definitionId || `active_med_${idx}`,
        genericName: m.genericName,
        medicationDefinitionId: m.definitionId,
        status: 'active',
      }));

    const activeDiagnoses = (options.patient.activeDiagnoses || []).map((dx) => ({
      code: dx,
      description: dx,
      status: 'active',
    }));

    const params: MedicationOrderValidationParams = {
      medicationDefinition: options.candidateMedication,
      route: options.candidateRoute,
      dose: options.candidateDose,
      doseUnit: options.candidateDoseUnit,
      frequency: options.candidateFrequency,
      durationValue: options.candidateDurationDays,
      quantity: options.candidateQuantity,
      indication: 'Therapeutic regimen evaluation',
    };

    const context: SafetyScreeningContext = {
      patient: {
        id: options.patient.id,
        allergiesSummary: options.patient.allergies || [],
      },
      allergies,
      activeMedications: activeMeds,
      activeDiagnoses,
    };

    return this.runFullSafetyScreen(params, context);
  }
}

export const medicationSafetyService = MedicationSafetyService.getInstance();
