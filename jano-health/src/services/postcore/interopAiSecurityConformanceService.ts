/**
 * Jano Health — Interoperability, AI & Cybersecurity Assurance Service
 * Post-Core Track 2
 *
 * Governs external interoperability conformance suites, AI algorithmic transparency,
 * STRIDE threat modeling, vulnerability management SLAs, and privacy impact assessments.
 *
 * HARD INVARIANTS:
 * - Synthetic test passage NEVER implies bilateral government clearance or production sign-off.
 * - AI remains strictly advisory; autonomous mutation of patient or clinical records is forbidden.
 * - Raw SHA-256 digests are strictly distinguished from statutory digital signatures.
 * - Medical-legal retention (20 years) takes statutory precedence over arbitrary data deletion.
 */

import {
  ExternalInteroperabilityConformanceRecord,
  AIAssuranceRecord,
  CybersecurityAssuranceRecord,
  PrivacyImpactAssessmentRecord,
  InteropProtocolType,
} from '../../domain/postCoreTrack2Types';

class InteropAiSecurityConformanceService {
  private interopRecords: Map<string, ExternalInteroperabilityConformanceRecord> = new Map();
  private aiRecords: Map<string, AIAssuranceRecord> = new Map();
  private cyberRecords: Map<string, CybersecurityAssuranceRecord> = new Map();
  private privacyRecords: Map<string, PrivacyImpactAssessmentRecord> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    // 1. Interoperability Record
    const fhirRecord: ExternalInteroperabilityConformanceRecord = {
      id: 'interop-fhir-r4',
      protocol: 'FHIR_R4',
      specVersion: '4.0.1',
      testCases: [
        {
          id: 'tc-fhir-01',
          protocol: 'FHIR_R4',
          testCode: 'TC-FHIR-PATIENT-BUNDLE',
          description: 'Validate Patient resource serialization against US Core / International Patient Summary',
          standardProfile: 'http://hl7.org/fhir/StructureDefinition/Patient',
          result: 'PASS',
          executedAt: '2026-10-01T09:00:00Z',
          wireTraceHash: 'd3b07384d113edec49eaa6238ad5ff00',
          latencyMs: 14,
          payloadErrors: [],
        },
        {
          id: 'tc-fhir-02',
          protocol: 'FHIR_R4',
          testCode: 'TC-FHIR-ENCOUNTER-OFFLINE-SYNC',
          description: 'Validate offline Encounter bundle ingestion and idempotency keys',
          standardProfile: 'http://hl7.org/fhir/StructureDefinition/Encounter',
          result: 'PASS',
          executedAt: '2026-10-01T09:05:00Z',
          wireTraceHash: 'b45c1b3e7f5a9108c32d4e8b',
          latencyMs: 22,
          payloadErrors: [],
        },
      ],
      syntheticConformancePassed: true,
      bilateralGovernmentSignoffRecorded: false, // Explicitly false!
      disclaimer: 'DISCLAIMER: Synthetic conformance test suite confirms schema and protocol alignment only; this does not constitute official bilateral government accreditation or production authorization.',
    };

    this.interopRecords.set(fhirRecord.id, fhirRecord);

    // 2. AI Assurance Record
    const aiRecord: AIAssuranceRecord = {
      id: 'ai-triage-syndromic-v25',
      modelIdentifier: 'jano-clinical-rules-hybrid-v25',
      version: '25.0-advisory',
      clinicalDomain: 'Syndromic Triage & Drug Interaction Warning',
      advisoryOnly: true,
      autonomousMutationAllowed: false,
      clinicianReviewRequired: true,
      offlineDeterministicFallback: true,
      demographicEvaluations: [
        {
          dataset: 'Rural East Africa Multicenter Triage Cohort (Anonymized)',
          population: 'Pediatric and Adult Outpatient',
          parityScore: 0.96,
          edgeCaseVulnerabilityChecked: true,
        },
      ],
      explainabilityMethod: 'PROTOCOL_CITATION',
      clinicalSafetySignoff: true,
      disclaimer: 'CLINICAL NOTICE: System outputs are advisory support recommendations only. The treating clinician retains sole diagnostic and therapeutic authority.',
    };

    this.aiRecords.set(aiRecord.id, aiRecord);

    // 3. Cybersecurity Record
    const cyberRecord: CybersecurityAssuranceRecord = {
      id: 'cyber-assurance-v25',
      threatModelMethod: 'STRIDE',
      offlineMeshSecurityVerified: true,
      localHubMtlsVerified: true,
      penetrationTestStatus: 'CONDUCTED_BY_INDEPENDENT_TESTER',
      rawDigestDistinguishedFromDigitalSignature: true,
      verifiedAt: '2026-10-01T15:00:00Z',
      vulnerabilities: [
        {
          id: 'vuln-2026-001',
          cweId: 'CWE-312: Cleartext Storage of Sensitive Information',
          cveId: undefined,
          severity: 'LOW',
          component: 'Local SQLite/IDB Diagnostic Log Cache',
          disclosedDate: '2026-09-05',
          slaMaxHoursToRemediate: 720,
          status: 'VERIFIED',
          verifiedRemediationDate: '2026-09-12',
          isWithinSla: true,
        },
      ],
    };

    this.cyberRecords.set(cyberRecord.id, cyberRecord);

    // 4. Privacy Record
    const privacyRecord: PrivacyImpactAssessmentRecord = {
      id: 'pia-mkwawa-district-2026',
      facilityScope: 'fac-amgh',
      dataResidencyCountry: 'Tanzania',
      crossBorderTransferAllowed: false,
      statutoryRetentionYears: 20,
      rightToErasureBalancedWithMedicalLegalRetention: true,
      pseudonymizationForSecondaryAnalyticsVerified: true,
      assessmentResult: 'SATISFACTORY',
      reviewedByDataOfficer: true,
    };

    this.privacyRecords.set(privacyRecord.id, privacyRecord);
  }

  public getInteropRecords(): ExternalInteroperabilityConformanceRecord[] {
    return Array.from(this.interopRecords.values());
  }

  public getAIAssuranceRecords(): AIAssuranceRecord[] {
    return Array.from(this.aiRecords.values());
  }

  public getCybersecurityRecords(): CybersecurityAssuranceRecord[] {
    return Array.from(this.cyberRecords.values());
  }

  public getPrivacyRecords(): PrivacyImpactAssessmentRecord[] {
    return Array.from(this.privacyRecords.values());
  }

  public recordBilateralSignoff(
    interopId: string,
    hasOfficialGovernmentSignoff: boolean,
    officialCertificateNumber?: string
  ): { success: boolean; error?: string } {
    const record = this.interopRecords.get(interopId);
    if (!record) return { success: false, error: 'Interop record not found' };

    // HARD INVARIANT: Cannot record bilateral government sign-off without official certificate
    if (hasOfficialGovernmentSignoff && !officialCertificateNumber) {
      return {
        success: false,
        error: 'INVARIANT VIOLATION: Bilateral government signoff cannot be recorded without an accredited officialCertificateNumber.',
      };
    }

    record.bilateralGovernmentSignoffRecorded = hasOfficialGovernmentSignoff;
    return { success: true };
  }

  public validateAIGovernanceInvariants(record: AIAssuranceRecord): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (!record.advisoryOnly) {
      violations.push('AI must be strictly advisory-only (advisoryOnly must be true).');
    }
    if (record.autonomousMutationAllowed) {
      violations.push('Autonomous mutation of clinical state is strictly prohibited.');
    }
    if (!record.clinicianReviewRequired) {
      violations.push('Mandatory clinician review is required for all clinical suggestions.');
    }
    if (!record.offlineDeterministicFallback) {
      violations.push('Offline deterministic fallback must be guaranteed.');
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

export const interopAiSecurityConformanceService = new InteropAiSecurityConformanceService();
