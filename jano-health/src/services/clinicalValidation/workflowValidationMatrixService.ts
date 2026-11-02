/**
 * Jano Health - Clinical Workflow Validation Matrix Service (Clinical Core V22)
 * 
 * Formal validation matrices for every clinical workflow lifecycle.
 * Defines preconditions, expected state transitions, forbidden transitions,
 * safety controls, audit event requirements, and validation evidence links.
 * 
 * Hard Invariant:
 * Strictly preserves the South African Triage Scale (SATS) 5-tier model:
 * RED, ORANGE, YELLOW, GREEN, BLUE. Never introduces BLACK into SATS.
 */

import {
  ClinicalWorkflowMatrix,
  V22_INVARIANTS,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class WorkflowValidationMatrixService {
  private static instance: WorkflowValidationMatrixService;

  private constructor() {}

  public static getInstance(): WorkflowValidationMatrixService {
    if (!WorkflowValidationMatrixService.instance) {
      WorkflowValidationMatrixService.instance = new WorkflowValidationMatrixService();
    }
    return WorkflowValidationMatrixService.instance;
  }

  /**
   * Initializes baseline validation matrices for all core clinical lifecycles.
   */
  public async initializeBaselineMatrices(): Promise<ClinicalWorkflowMatrix[]> {
    const baselineMatrices: ClinicalWorkflowMatrix[] = [
      {
        workflowId: 'wf_encounter_lifecycle',
        name: 'Encounter Consultation Lifecycle',
        lifecycleStates: ['PLANNED', 'ARRIVED', 'TRIAGED', 'IN_PROGRESS', 'COMPLETED', 'SIGNED'],
        preconditions: ['Patient MRN verified', 'Facility active context confirmed'],
        expectedTransitions: [
          { from: 'PLANNED', to: 'ARRIVED' },
          { from: 'ARRIVED', to: 'TRIAGED' },
          { from: 'TRIAGED', to: 'IN_PROGRESS' },
          { from: 'IN_PROGRESS', to: 'COMPLETED' },
          { from: 'COMPLETED', to: 'SIGNED' },
        ],
        forbiddenTransitions: [
          { from: 'PLANNED', to: 'SIGNED', rationale: 'Cannot sign encounter without consultation documentation' },
          { from: 'SIGNED', to: 'IN_PROGRESS', rationale: 'Signed encounter is immutable; requires formal addendum' },
        ],
        safetyControls: ['Cryptographic signature block', 'Clinician license verification'],
        auditEventRequired: 'ENCOUNTER_SIGNED',
        validationEvidenceIds: ['ev_enc_audit_01'],
        validationStatus: 'VALIDATED',
      },
      {
        workflowId: 'wf_emergency_sats',
        name: 'Emergency SATS Triage & Escalation',
        lifecycleStates: ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'],
        preconditions: ['Patient arrived at emergency facility', 'Vital signs assessed'],
        expectedTransitions: [
          { from: 'RED', to: 'RESUSCITATION' },
          { from: 'ORANGE', to: 'EMERGENCY_CARE' },
          { from: 'YELLOW', to: 'URGENT_QUEUE' },
          { from: 'GREEN', to: 'STANDARD_QUEUE' },
          { from: 'BLUE', to: 'NON_URGENT' },
        ],
        forbiddenTransitions: [
          { from: 'RED', to: 'STANDARD_QUEUE', rationale: 'RED triage patient must never be routed to standard queue' },
        ],
        safetyControls: ['Emergency override protection', 'Mandatory 15-minute reassessment timer for RED'],
        auditEventRequired: 'EMERGENCY_TRIAGED',
        validationEvidenceIds: ['ev_sats_audit_01'],
        validationStatus: 'VALIDATED',
      },
      {
        workflowId: 'wf_medication_dispense',
        name: 'Medication Safety & Pharmacy Dispensation',
        lifecycleStates: ['ORDERED', 'SAFETY_CHECKED', 'PHARMACY_REVIEWED', 'DISPENSED'],
        preconditions: ['Prescriber role verified', 'Allergy ledger queried', 'Formulary stock verified'],
        expectedTransitions: [
          { from: 'ORDERED', to: 'SAFETY_CHECKED' },
          { from: 'SAFETY_CHECKED', to: 'PHARMACY_REVIEWED' },
          { from: 'PHARMACY_REVIEWED', to: 'DISPENSED' },
        ],
        forbiddenTransitions: [
          { from: 'ORDERED', to: 'DISPENSED', rationale: 'Bypassing allergy & drug interaction safety check is forbidden' },
        ],
        safetyControls: ['Allergy interaction firewall', 'Dual-pharmacist high-alert verification'],
        auditEventRequired: 'MEDICATION_DISPENSED',
        validationEvidenceIds: ['ev_med_safety_01'],
        validationStatus: 'VALIDATED',
      },
      {
        workflowId: 'wf_critical_lab_ack',
        name: 'Laboratory Critical Panic Value Flow',
        lifecycleStates: ['SPECIMEN_COLLECTED', 'ANALYZED', 'CRITICAL_DETECTED', 'ACKNOWLEDGED', 'FINALIZED'],
        preconditions: ['Specimen custody chain intact', 'Reference range defined'],
        expectedTransitions: [
          { from: 'SPECIMEN_COLLECTED', to: 'ANALYZED' },
          { from: 'ANALYZED', to: 'CRITICAL_DETECTED' },
          { from: 'CRITICAL_DETECTED', to: 'ACKNOWLEDGED' },
          { from: 'ACKNOWLEDGED', to: 'FINALIZED' },
        ],
        forbiddenTransitions: [
          { from: 'CRITICAL_DETECTED', to: 'FINALIZED', rationale: 'Critical lab value cannot be closed without clinician acknowledgement' },
        ],
        safetyControls: ['Panic value visual banner', 'Escalation alert to shift supervisor'],
        auditEventRequired: 'CRITICAL_LAB_ACKNOWLEDGED',
        validationEvidenceIds: ['ev_lab_critical_01'],
        validationStatus: 'VALIDATED',
      },
    ];

    for (const matrix of baselineMatrices) {
      await idbEngine.put('workflowValidationMatrices', matrix);
    }

    return baselineMatrices;
  }

  /**
   * Validates a candidate state transition against a workflow matrix.
   */
  public async validateTransition(
    workflowId: string,
    fromState: string,
    toState: string
  ): Promise<{ allowed: boolean; violationReason?: string }> {
    const matrix = await idbEngine.get<ClinicalWorkflowMatrix>('workflowValidationMatrices', workflowId);
    if (!matrix) {
      return { allowed: true }; // Unrestricted if not registered
    }

    // Check forbidden transition
    const forbidden = matrix.forbiddenTransitions.find((ft) => ft.from === fromState && ft.to === toState);
    if (forbidden) {
      return {
        allowed: false,
        violationReason: `FORBIDDEN_TRANSITION: ${forbidden.rationale}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Asserts emergency triage compliance with SATS.
   */
  public verifySatsTier(tier: string): boolean {
    V22_INVARIANTS.assertSatsEmergencyTriagePreserved(tier);
    return true;
  }
}

export const workflowValidationMatrixService = WorkflowValidationMatrixService.getInstance();
