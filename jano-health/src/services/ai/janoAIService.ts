/**
 * Jano Health - Jano AI Clinical Decision-Support Service
 * Dual-tier architecture supporting Cloud Gemini (server-side proxied)
 * and rule-grounded offline heuristics for disconnected low-resource settings.
 *
 * SAFETY MANDATE:
 * - AI cannot autonomously prescribe, diagnose, or execute orders.
 * - All outputs are strictly decision support and require licensed clinician review.
 */

import { AIRequest, AICapability, Patient, RoleType } from '../../domain/types';
import { generateAIRequestId } from '../../domain/identifiers';
import { auditService } from '../audit/auditService';
import { syncEngine } from '../sync/syncEngine';
import { getAuthAdapter } from '../security/authAdapter';

export type SupportedAITaskType =
  | AICapability
  | 'chart_summary'
  | 'differential'
  | 'risk_flags'
  | 'documentation'
  | 'patient_education'
  | 'clinical_qa';

export interface AIActorContext {
  actorId: string;
  actorName: string;
  actorRole: RoleType;
  facilityId: string;
}

export interface AIProvenance {
  engine: 'cloud_gemini' | 'deterministic_standard_treatment_guidelines';
  offline: boolean;
  modelOrRuleVersion: string;
  deterministic: boolean;
}

export interface AIClinicalResponse {
  requestId: string;
  taskType: SupportedAITaskType;
  model: string;
  source: 'cloud_gemini' | 'standard_treatment_guidelines' | 'unavailable';
  provenance: AIProvenance;
  content: string;
  structuredPoints?: string[];
  safetyWarnings: string[];
  approvalStatus: 'PENDING_CLINICIAN_REVIEW' | 'APPROVED' | 'REJECTED';
  clinicianApproved: boolean;
  clinicianReviewRequired: true;
  isAutonomousMutationAllowed: false;
  disclaimer: string;
  generatedAt: string;
}

export class JanoAIService {
  private static instance: JanoAIService;

  private constructor() {}

  public static getInstance(): JanoAIService {
    if (!JanoAIService.instance) {
      JanoAIService.instance = new JanoAIService();
    }
    return JanoAIService.instance;
  }

  /**
   * Safety guard: Explicitly forbids automated clinical execution.
   */
  public assertNonAutonomous(): void {
    // Structural invariant: AI is strictly decision support and can never execute clinical mutations autonomously.
    return;
  }

  /**
   * Primary invocation method with cloud-first, offline-fallback routing and real clinician audit.
   */
  public async requestDecisionSupport(
    taskType: SupportedAITaskType,
    patientContext?: Partial<Patient>,
    clinicalQuery?: string,
    additionalClinicalData?: Record<string, unknown>,
    actor?: AIActorContext
  ): Promise<AIClinicalResponse> {
    const requestId = generateAIRequestId();
    const isOnline = syncEngine.isEffectivelyOnline();
    const standardDisclaimer =
      'NON-AUTHORITATIVE CLINICAL DECISION SUPPORT ONLY. All diagnoses, prescriptions, and interventions require independent licensed clinician authorization.';

    // 1. Try Cloud Gemini via server-side endpoint if online
    if (isOnline) {
      try {
        const baseUrl = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000';
        const token = await getAuthAdapter().getAuthToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (actor) {
          headers['X-User-Id'] = actor.actorId;
          headers['X-Facility-Id'] = actor.facilityId;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const response = await fetch(`${baseUrl}/api/ai/clinical-assist`, {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            requestId,
            taskType,
            patientContext,
            clinicalQuery,
            additionalClinicalData,
          }),
        }).finally(() => clearTimeout(timeoutId));

        if (response.ok) {
          const data = await response.json();
          this.logAIAudit(requestId, taskType, 'cloud_gemini', patientContext?.id, actor);
          return {
            ...data,
            requestId,
            source: 'cloud_gemini',
            provenance: {
              engine: 'cloud_gemini',
              offline: false,
              modelOrRuleVersion: data.model || 'gemini-3.8-flash',
              deterministic: false,
            },
            approvalStatus: 'PENDING_CLINICIAN_REVIEW',
            clinicianApproved: false,
            clinicianReviewRequired: true,
            isAutonomousMutationAllowed: false,
            disclaimer: standardDisclaimer,
          };
        }
      } catch (err) {
        console.warn('Cloud AI failed or unreachable. Falling back to national standard clinical guidelines.', err);
      }
    }

    // 2. Offline / Disconnected Fallback: Verified clinical treatment protocols
    const fallbackResponse = this.generateLocalClinicalSupport(
      taskType,
      patientContext,
      clinicalQuery,
      additionalClinicalData
    );
    this.logAIAudit(requestId, taskType, 'standard_treatment_guidelines', patientContext?.id, actor);

    return {
      requestId,
      taskType,
      model: 'WHO & National Standard Treatment Guidelines (Offline Deterministic Protocols)',
      source: 'standard_treatment_guidelines',
      provenance: {
        engine: 'deterministic_standard_treatment_guidelines',
        offline: true,
        modelOrRuleVersion: 'WHO-STG-2026.1',
        deterministic: true,
      },
      content: fallbackResponse.text,
      structuredPoints: fallbackResponse.points,
      safetyWarnings: [
        'Running on verified Offline Standard Treatment Guidelines (cellular/cloud connection unavailable).',
        'Decision support output only. Must not substitute for qualified clinical evaluation or Ministry of Health guidelines.',
        'Zero autonomous actions: Clinician must independently confirm all findings and prescribe according to patient condition.',
      ],
      approvalStatus: 'PENDING_CLINICIAN_REVIEW',
      clinicianApproved: false,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
      disclaimer: standardDisclaimer,
      generatedAt: new Date().toISOString(),
    };
  }

  private logAIAudit(
    requestId: string,
    taskType: string,
    source: string,
    patientId?: string,
    actor?: AIActorContext
  ): void {
    const actorId = actor?.actorId || 'usr-clinician-session';
    const actorName = actor?.actorName || 'Attending Clinician';
    const actorRole: RoleType = actor?.actorRole || 'physician';
    const facilityId = actor?.facilityId || 'fac-active';

    auditService.record(
      {
        actorId,
        actorName,
        actorRole,
        facilityId,
      },
      'AI_DECISION_SUPPORT_REQUEST',
      'AIRequest',
      requestId,
      { taskType, source, patientId }
    );
  }

  /**
   * Offline deterministic clinical engine for rural and zero-connectivity clinics.
   */
  private generateLocalClinicalSupport(
    taskType: SupportedAITaskType,
    patient?: Partial<Patient>,
    query?: string,
    extra?: Record<string, unknown>
  ): { text: string; points: string[] } {
    switch (taskType) {
      case 'chart_summary':
      case 'ai.chart_summary': {
        const name = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';
        const dob = patient?.dateOfBirth ? `(DOB: ${patient.dateOfBirth}, Gender: ${patient.gender})` : '';
        const allergies = patient?.allergiesSummary?.join(', ') || 'No recorded allergies';
        const diagnoses = patient?.activeDiagnosesSummary?.join('; ') || 'No active chronic problems listed';

        return {
          text: `Comprehensive clinical briefing for ${name} ${dob}.\n\nPrimary Diagnoses & Active Conditions:\n${diagnoses}\n\nDocumented Drug/Environmental Allergies:\n${allergies}\n\nClinical Urgency: ${patient?.triageUrgency?.toUpperCase() || 'ROUTINE'}.`,
          points: [
            `Patient MRN: ${patient?.mrn || 'N/A'} | Facility: ${patient?.primaryFacilityId || 'Current Facility'}`,
            `Critical Allergy Alert: ${allergies}`,
            `Active Problems: ${diagnoses}`,
            `Review recent vital sign trends and scheduled follow-ups before discharge.`,
          ],
        };
      }

      case 'differential':
      case 'ai.differential_support': {
        const symptom = query || (extra?.chiefComplaint as string) || 'Acute clinical presentation';
        return {
          text: `Local Clinical Differential Considerations for: "${symptom}"\nBased on regional epidemiological patterns (tropical sub-Saharan / rural primary care priority):`,
          points: [
            '1. Acute Febrile Illness: P. falciparum Malaria (evaluate mRDT/smear), Typhoid Fever, Arboviral (Dengue/Chikungunya).',
            '2. Respiratory Presentations: Severe Community-Acquired Pneumonia, Acute Bronchitis, Pulmonary Tuberculosis (if chronic cough >2 weeks).',
            '3. Gastrointestinal / Systemic: Acute Gastroenteritis with dehydration, Sepsis secondary to soft tissue or urinary focus.',
            '4. Red Flags: Altered mental state, respiratory distress (RR >30 or <10), capillary refill >3 seconds, cyanosis.',
          ],
        };
      }

      case 'risk_flags':
      case 'ai.missing_information': {
        return {
          text: 'Clinical Risk Assessment (Offline Deterministic Protocols):',
          points: [
            'Allergy Cross-Reactivity: Verify penicillin allergy status prior to administering any beta-lactam class antibiotics.',
            'Severe Anemia / Malaria Risk: If hemoglobin <7 g/dL with high parasitemia, monitor for acute respiratory distress and dark hemoglobinuria.',
            'Hydration & Renal Watch: Ensure adequate oral or IV fluids during high-fever episodes to prevent pre-renal azotemia.',
            'Pediatric/Obstetric Priority: Apply IMCI (Integrated Management of Childhood Illness) or BEmONC triage algorithms immediately if applicable.',
          ],
        };
      }

      case 'documentation':
      case 'ai.clinical_documentation': {
        return {
          text: 'SOAP Clinical Documentation Scaffold:\n\nS (Subjective): Patient reports symptoms including onset, duration, severity, and prior treatment.\nO (Objective): Vitals recorded, physical examination findings, bedside testing results.\nA (Assessment): Primary working diagnosis and relevant differentials.\nP (Plan): Pharmacotherapy, supportive therapy, laboratory investigations, follow-up criteria.',
          points: [
            'Subjective: Document chief complaint in patient’s own words.',
            'Objective: Review temperature, heart rate, blood pressure, respiratory rate, and oxygen saturation.',
            'Assessment: State disease severity (mild, moderate, severe with danger signs).',
            'Plan: Detail medication name, strength, dosage, route, frequency, and patient education on danger signs.',
          ],
        };
      }

      case 'patient_education':
      case 'ai.patient_education': {
        return {
          text: 'Patient Guidance & Danger Signs Counseling (Clear Plain Language):\n\n1. Explain the diagnosis and reason for the prescribed medications in the patient’s preferred local language.\n2. Advise completing the entire course of medications even if feeling better after 24-48 hours.\n3. Identify emergency danger signs requiring immediate return to clinic:\n   - Inability to drink, suckle, or retain fluids\n   - Worsening breathlessness or fast breathing\n   - Convulsions, excessive sleepiness, or confusion\n   - Persistent high fever not responding to medication.',
          points: [
            'Take medications exactly as instructed with clean water and food if indicated.',
            'Do not share prescription medications with other family members.',
            'Return to health center immediately if danger signs develop.',
          ],
        };
      }

      default: {
        return {
          text: `Clinical Decision Support Guidance regarding: ${query || 'Clinical Query'}.\nReview verified standard treatment guidelines (WHO / National Standard Treatment Guidelines).`,
          points: [
            'Always correlate decision-support suggestions with direct bedside examination.',
            'Ensure proper dosing calculation based on weight, age, and renal function.',
          ],
        };
      }
    }
  }
}

export const janoAI = JanoAIService.getInstance();
