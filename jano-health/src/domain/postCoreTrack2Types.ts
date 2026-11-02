/**
 * Jano Health — Post-Core Track 2
 * EXTERNAL ASSURANCE, INTEROPERABILITY CONFORMANCE & CERTIFICATION READINESS
 *
 * Types, models, lifecycles, and invariants for:
 * 1. Assurance Program & Assurance Scope (12 distinct scopes)
 * 2. External Assessor Model & Independence Governance
 * 3. Traceability Matrix & Tamper-Evident Evidence Artifacts
 * 4. Assessor Findings, Non-Conformity Management & Verified Closure
 * 5. Interoperability Conformance Testing (FHIR R4, HL7 v2, DICOM, openEHR, DHIS2)
 * 6. AI Assurance, Algorithmic Transparency & Human-In-The-Loop Enforcement
 * 7. Cybersecurity Independent Assessment & Vulnerability Disclosure
 * 8. Privacy Impact Assessment, Data Sovereignty & Medical-Legal Retention
 * 9. Regulatory & Commercial Claim Truth Control (Anti-Fabrication)
 * 10. Cryptographically Sealed Independent Audit Dossier
 */

export const TRACK2_STATUTORY_DISCLAIMER =
  'Jano Health Technical and Clinical Evidence Register: Prepared for independent conformity assessment. ' +
  'No external clearance, CE mark, FDA clearance, ISO certification, or governmental authorization is claimed ' +
  'or implied without an officially executed and accredited third-party certificate.';

// ============================================================================
// 1. ASSURANCE PROGRAM & LIFECYCLE
// ============================================================================

export type AssuranceProgramStatus =
  | 'PLANNED'
  | 'SCOPED'
  | 'PREPARED'
  | 'EVIDENCE_COLLECTION'
  | 'READY_FOR_REVIEW'
  | 'UNDER_REVIEW'
  | 'FINDINGS_OPEN'
  | 'REMEDIATION'
  | 'REASSESSMENT'
  | 'CLOSED'
  | 'SUPERSEDED';

export type AssuranceScopeType =
  | 'SOFTWARE_QUALITY'
  | 'CLINICAL_SAFETY'
  | 'CYBERSECURITY'
  | 'PRIVACY'
  | 'INTEROPERABILITY'
  | 'AI_ASSURANCE'
  | 'DEPLOYMENT'
  | 'BUSINESS_CONTINUITY'
  | 'DATA_GOVERNANCE'
  | 'USABILITY'
  | 'INFRASTRUCTURE'
  | 'SUPPLY_CHAIN';

export interface AssuranceScope {
  id: string;
  scopeType: AssuranceScopeType;
  title: string;
  objective: string;
  boundaries: string[];
  applicableStandards: string[];
  exclusions: string[];
  evidenceIds: string[];
  assignedReviewerId?: string;
  status: 'PENDING' | 'IN_EVALUATION' | 'CONFORMANT' | 'NON_CONFORMANT' | 'CONDITIONALLY_CONFORMANT';
  limitations: string;
}

export interface AssuranceMilestone {
  id: string;
  title: string;
  targetDate: string;
  completionDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  deliverables: string[];
}

export interface AssuranceProgram {
  id: string;
  programCode: string;
  title: string;
  organizationId: string;
  targetRelease: string;
  status: AssuranceProgramStatus;
  leadAssessorId?: string;
  complianceOfficerId: string;
  clinicalSafetyOfficerId: string;
  scopes: AssuranceScope[];
  milestones: AssuranceMilestone[];
  createdAt: string;
  updatedAt: string;
  closureEvidenceId?: string;
  closureSummary?: string;
  closedAt?: string;
  disclaimer: string;
}

// ============================================================================
// 2. EXTERNAL ASSESSOR MODEL & INDEPENDENCE
// ============================================================================

export type AssessorIndependenceStatus =
  | 'INDEPENDENT_THIRD_PARTY'
  | 'AFFILIATED_DISCLOSED'
  | 'INTERNAL_QUALITY_PEER'
  | 'NON_INDEPENDENT_PROHIBITED';

export type EngagementState =
  | 'PLANNED'
  | 'CONTRACTED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'TERMINATED';

export interface ConflictOfInterest {
  declared: boolean;
  details?: string;
  mitigationPlan?: string;
  approvedByComplianceOfficer: boolean;
}

export interface ExternalAssessor {
  id: string;
  fullName: string;
  organizationName: string;
  accreditationBody?: string;
  credentials: string[];
  specialties: AssuranceScopeType[];
  independenceStatus: AssessorIndependenceStatus;
  conflictOfInterest: ConflictOfInterest;
  engagementState: EngagementState;
  contractStartDate: string;
  contractEndDate?: string;
  authoredComponentIds: string[]; // Track components authored by this person; must not evaluate own components!
}

// ============================================================================
// 3. EVIDENCE ARTIFACTS & TRACEABILITY MATRIX
// ============================================================================

export type TraceLinkType =
  | 'REQUIREMENT_TO_DESIGN'
  | 'DESIGN_TO_IMPLEMENTATION'
  | 'IMPLEMENTATION_TO_TEST'
  | 'TEST_TO_EMPIRICAL_LOG'
  | 'EMPIRICAL_LOG_TO_ASSESSOR_REVIEW';

export interface TraceLink {
  id: string;
  sourceId: string;
  sourceType: 'REQUIREMENT' | 'DESIGN' | 'CODE' | 'TEST' | 'EMPIRICAL_LOG';
  targetId: string;
  targetType: 'DESIGN' | 'CODE' | 'TEST' | 'EMPIRICAL_LOG' | 'ASSESSMENT';
  relationship: TraceLinkType;
  verifiedBy: string;
  verifiedAt: string;
}

export interface EvidenceArtifact {
  id: string;
  title: string;
  scopeType: AssuranceScopeType;
  artifactType: 'AUTOMATED_TEST_RUN' | 'BENCHMARK_OBSERVATION' | 'FORENSIC_EXPORT' | 'PROTOCOL_TRACE' | 'INSPECTION_RECORD';
  sha256Digest: string;
  collectedAt: string;
  collectedBy: string;
  uri: string;
  verifiedByAssessorId?: string;
  verifiedAt?: string;
  isTamperEvident: boolean;
}

export interface TraceabilityMatrix {
  id: string;
  programId: string;
  totalRequirements: number;
  coveredRequirements: number;
  traceLinks: TraceLink[];
  orphanedRequirements: string[];
  completenessPercentage: number;
  generatedAt: string;
}

// ============================================================================
// 4. ASSESSOR FINDINGS & NON-CONFORMITY REMEDIATION
// ============================================================================

export type FindingSeverity =
  | 'CRITICAL'
  | 'MAJOR'
  | 'MINOR'
  | 'OBSERVATION'
  | 'OPPORTUNITY_FOR_IMPROVEMENT';

export type FindingStatus =
  | 'RAISED'
  | 'ACKNOWLEDGED'
  | 'ROOT_CAUSE_ANALYZED'
  | 'REMEDIATION_PLANNED'
  | 'REMEDIATION_EXECUTED'
  | 'REASSESSED'
  | 'VERIFIED_CLOSED';

export interface AssessorFinding {
  id: string;
  programId: string;
  scopeType: AssuranceScopeType;
  assessorId: string;
  findingCode: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  standardClause?: string;
  affectsClinicalSafety: boolean;
  status: FindingStatus;
  raisedAt: string;
  rootCause?: string;
  remediationPlan?: string;
  remediationArtifactId?: string;
  remediatedBy?: string;
  remediatedAt?: string;
  reassessedByAssessorId?: string;
  reassessmentNotes?: string;
  clinicalSafetyOfficerSignoff?: {
    officerId: string;
    officerName: string;
    signedAt: string;
    approved: boolean;
  };
  closedAt?: string;
}

// ============================================================================
// 5. EXTERNAL INTEROPERABILITY CONFORMANCE
// ============================================================================

export type InteropProtocolType =
  | 'FHIR_R4'
  | 'HL7_V2'
  | 'DICOM_PS3'
  | 'OPEN_EHR'
  | 'DHIS2_ADX';

export interface ConformanceTestCase {
  id: string;
  protocol: InteropProtocolType;
  testCode: string;
  description: string;
  standardProfile: string;
  result: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  executedAt: string;
  wireTraceHash: string;
  latencyMs: number;
  payloadErrors: string[];
}

export interface ExternalInteroperabilityConformanceRecord {
  id: string;
  protocol: InteropProtocolType;
  specVersion: string;
  testCases: ConformanceTestCase[];
  syntheticConformancePassed: boolean;
  bilateralGovernmentSignoffRecorded: boolean; // MUST NEVER be true without actual verified bilateral agreement
  disclaimer: string;
}

// ============================================================================
// 6. AI ASSURANCE, TRANSPARENCY & HUMAN-IN-THE-LOOP
// ============================================================================

export interface AIAssuranceRecord {
  id: string;
  modelIdentifier: string;
  version: string;
  clinicalDomain: string;
  advisoryOnly: boolean; // MUST be true
  autonomousMutationAllowed: boolean; // MUST be false
  clinicianReviewRequired: boolean; // MUST be true
  offlineDeterministicFallback: boolean; // MUST be true
  demographicEvaluations: {
    dataset: string;
    population: string;
    parityScore: number;
    edgeCaseVulnerabilityChecked: boolean;
  }[];
  explainabilityMethod: 'PROTOCOL_CITATION' | 'RULE_PATH' | 'CONFIDENCE_BOUND';
  clinicalSafetySignoff: boolean;
  disclaimer: string;
}

// ============================================================================
// 7. CYBERSECURITY ASSURANCE & VULNERABILITY DISCLOSURE
// ============================================================================

export interface DisclosedVulnerability {
  id: string;
  cweId: string;
  cveId?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  component: string;
  disclosedDate: string;
  slaMaxHoursToRemediate: number;
  status: 'TRIAGED' | 'FIX_DEPLOYED' | 'VERIFIED' | 'FALSE_POSITIVE';
  verifiedRemediationDate?: string;
  isWithinSla: boolean;
}

export interface CybersecurityAssuranceRecord {
  id: string;
  threatModelMethod: 'STRIDE' | 'PASTA' | 'LINDDUN';
  offlineMeshSecurityVerified: boolean;
  localHubMtlsVerified: boolean;
  penetrationTestStatus: 'CONDUCTED_BY_INDEPENDENT_TESTER' | 'INTERNAL_SCAN_ONLY' | 'NOT_CONDUCTED';
  vulnerabilities: DisclosedVulnerability[];
  rawDigestDistinguishedFromDigitalSignature: boolean; // MUST be true
  verifiedAt: string;
}

// ============================================================================
// 8. PRIVACY, DATA SOVEREIGNTY & RETENTION
// ============================================================================

export interface PrivacyImpactAssessmentRecord {
  id: string;
  facilityScope: string;
  dataResidencyCountry: string;
  crossBorderTransferAllowed: boolean; // Generally false in sovereign health
  statutoryRetentionYears: number; // 20 years for clinical records
  rightToErasureBalancedWithMedicalLegalRetention: boolean;
  pseudonymizationForSecondaryAnalyticsVerified: boolean;
  assessmentResult: 'SATISFACTORY' | 'REMEDIATION_REQUIRED';
  reviewedByDataOfficer: boolean;
}

// ============================================================================
// 9. REGULATORY & COMMERCIAL CLAIM CONTROL
// ============================================================================

export type ClaimVerificationState =
  | 'SUBSTANTIATED'
  | 'PARTIALLY_SUBSTANTIATED'
  | 'ASPIRATIONAL_UNVERIFIED'
  | 'PROHIBITED';

export interface RegulatoryClaimRecord {
  id: string;
  claimText: string;
  targetStandardOrRegulation: string;
  jurisdiction: string;
  state: ClaimVerificationState;
  substantiatingArtifactIds: string[];
  auditorComments?: string;
  prohibitedReason?: string;
}

// ============================================================================
// 10. SEALED INDEPENDENT AUDIT PACKET
// ============================================================================

export interface IndependentAuditPacket {
  id: string;
  programId: string;
  programCode: string;
  generatedAt: string;
  targetRelease: string;
  totalScopesEvaluated: number;
  conformantScopesCount: number;
  openCriticalFindingsCount: number;
  openMajorFindingsCount: number;
  allFindingsResolved: boolean;
  traceabilityCompleteness: number;
  sha256DossierSeal: string;
  statutoryDisclaimer: string;
}
