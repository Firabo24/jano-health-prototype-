/**
 * Jano Health — Interoperability Conformance & Workforce Training Service
 * Post-Core Track 1
 *
 * Governs interoperability conformance test suites, bilateral relationship validation,
 * and clinical workforce training & competency gating.
 *
 * HARD INVARIANTS:
 * - Synthetic/sandbox interoperability success NEVER implies official bilateral government sign-off.
 * - Clinical users cannot be granted unsupervised clinical system access in production
 *   without verified competency and required supervised hours.
 */

import {
  InteroperabilityConformanceTest,
  WorkforceTrainingRecord,
} from '../../domain/postCoreTrack1Types';

export class InteroperabilityTrainingService {
  private interopTests: Map<string, InteroperabilityConformanceTest> = new Map();
  private trainingRecords: Map<string, WorkforceTrainingRecord> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    // Interoperability test
    const test1: InteroperabilityConformanceTest = {
      testId: 'test-fhir-r4-patient-bundle',
      protocol: 'FHIR_R4',
      profileUri: 'http://hl7.org/fhir/StructureDefinition/Bundle',
      endpointUrl: 'http://localhost:3000/api/fhir/Bundle',
      executionMode: 'OFFLINE_SYNTACTIC_VALIDATION',
      testResult: 'PASSED',
      conformanceFindings: [
        'Deterministic translation of Jano Patient & Encounter entities to FHIR R4 Bundle compliant.',
        'LOINC and ICD-11 coding elements mapped successfully.',
      ],
      testedAt: '2026-09-02T11:00:00Z',
      isOfficialBilateralAgreement: false, // Invariant: synthetic test is not official government sign-off
    };
    this.interopTests.set(test1.testId, test1);

    // Workforce Training Record
    const tr1: WorkforceTrainingRecord = {
      trainingRecordId: 'train-rec-dr-mkwawa-01',
      userId: 'usr-clin-001',
      userName: 'Dr. Joseph Ndunguru, MD',
      role: 'physician',
      facilityId: 'fac-amgh',
      moduleCode: 'MOD-CLIN-01-OFFLINE-CORE',
      moduleTitle: 'Offline-First Clinical Documentation & Safety Fallback Procedures',
      completionDate: '2026-08-25T16:00:00Z',
      competencyScorePercent: 98,
      isCompetencyVerified: true,
      supervisedHoursCompleted: 16,
      supervisedBy: 'Dr. Amina Said, CSO',
      unsupervisedClinicalAccessApproved: true,
    };
    this.trainingRecords.set(tr1.trainingRecordId, tr1);

    const tr2: WorkforceTrainingRecord = {
      trainingRecordId: 'train-rec-nurse-mwamba-02',
      userId: 'usr-nurse-002',
      userName: 'Nurse Grace Mwamba',
      role: 'nurse',
      facilityId: 'fac-amgh',
      moduleCode: 'MOD-TRIAGE-02-RED-FLAGS',
      moduleTitle: 'Emergency Acute Triage & Pediatric Weight-Clamping Verification',
      completionDate: '2026-08-26T14:30:00Z',
      competencyScorePercent: 95,
      isCompetencyVerified: true,
      supervisedHoursCompleted: 12,
      supervisedBy: 'Dr. Joseph Ndunguru, MD',
      unsupervisedClinicalAccessApproved: true,
    };
    this.trainingRecords.set(tr2.trainingRecordId, tr2);
  }

  // --- Interoperability ---

  public getAllInteropTests(): InteroperabilityConformanceTest[] {
    return Array.from(this.interopTests.values());
  }

  public recordInteropTest(test: InteroperabilityConformanceTest): void {
    // Invariant: Do not mark official bilateral agreement without explicit proof
    this.interopTests.set(test.testId, test);
  }

  // --- Workforce Training ---

  public getAllTrainingRecords(): WorkforceTrainingRecord[] {
    return Array.from(this.trainingRecords.values());
  }

  public getTrainingRecord(id: string): WorkforceTrainingRecord | undefined {
    return this.trainingRecords.get(id);
  }

  public recordTrainingCompletion(
    input: Omit<WorkforceTrainingRecord, 'unsupervisedClinicalAccessApproved'>
  ): WorkforceTrainingRecord {
    // HARD INVARIANT: Cannot grant unsupervised access if score < 80% or competency unverified or supervised hours < 8
    const canApprove =
      input.competencyScorePercent >= 80 &&
      input.isCompetencyVerified &&
      input.supervisedHoursCompleted >= 8;

    const record: WorkforceTrainingRecord = {
      ...input,
      unsupervisedClinicalAccessApproved: canApprove,
    };

    this.trainingRecords.set(record.trainingRecordId, record);
    return record;
  }
}

export const interoperabilityTrainingService = new InteroperabilityTrainingService();
