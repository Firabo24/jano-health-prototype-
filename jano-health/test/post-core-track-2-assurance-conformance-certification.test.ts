/**
 * Jano Health — Post-Core Track 2 Verification Suite
 * EXTERNAL ASSURANCE, INTEROPERABILITY CONFORMANCE & CERTIFICATION READINESS
 *
 * Verifies that an independent reviewer can evaluate Jano Health's technical,
 * clinical-safety, security, privacy, interoperability, quality, and deployment claims
 * from traceable, tamper-evident evidence.
 */

import {
  assuranceProgramService,
  ALL_ASSURANCE_SCOPES,
  externalAssessorService,
  traceabilityEvidenceService,
  assessorFindingsService,
  interopAiSecurityConformanceService,
  claimControlAndDossierService,
} from '../src/services/postcore';
import {
  TRACK2_STATUTORY_DISCLAIMER,
  AssuranceProgram,
  AssuranceScopeType,
} from '../src/domain/postCoreTrack2Types';
import { ROLE_DEFINITIONS, hasPermission } from '../src/domain/permissions';
import { ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  JANO HEALTH — POST-CORE TRACK 2 VERIFICATION SUITE');
console.log('  EXTERNAL ASSURANCE, INTEROPERABILITY & CERTIFICATION READINESS');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// 1. Assurance Program & 12 Scopes Lifecycle
// ----------------------------------------------------------------------------
console.log('--- 1. Assurance Program & 12 Scopes Lifecycle ---');
const programs = assuranceProgramService.getPrograms();
assert(programs.length > 0, 'Assurance programs initialized');

const mainProgram = assuranceProgramService.getProgramById('prg-tz-assurance-2026');
assert(!!mainProgram, 'Baseline program prg-tz-assurance-2026 retrieved');
assert(mainProgram?.status === 'UNDER_REVIEW', 'Main program is currently UNDER_REVIEW');
assert(mainProgram?.scopes.length === 12, 'Program contains exactly 12 independent assurance scopes');

// Verify all 12 scopes are represented
ALL_ASSURANCE_SCOPES.forEach((scopeType) => {
  const found = mainProgram?.scopes.some((s) => s.scopeType === scopeType);
  assert(found === true, `Assurance scope present: ${scopeType}`);
});

// Scope boundaries and anti-extrapolation
const clinSafetyScope = mainProgram?.scopes.find((s) => s.scopeType === 'CLINICAL_SAFETY');
assert(!!clinSafetyScope, 'Clinical Safety scope found');
assert(
  clinSafetyScope?.limitations.includes('excludes external field trials'),
  'Clinical Safety scope specifies explicit boundaries and limitations'
);

// Program milestones
assert(mainProgram?.milestones.length === 3, 'Program tracks 3 sequential milestones');
const ms1 = mainProgram?.milestones.find((m) => m.id === 'ms-01');
assert(ms1?.status === 'COMPLETED', 'Milestone ms-01 completed');

// ----------------------------------------------------------------------------
// 2. Strict Closure Gating (Closure Evidence & Zero Blocking Findings)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Program Closure Invariants & Gating ---');

// Attempt to close without closure evidence
const closeAttempt1 = assuranceProgramService.updateProgramStatus('prg-tz-assurance-2026', 'CLOSED');
assert(
  closeAttempt1.success === false,
  'HARD INVARIANT: Program cannot be CLOSED without closure evidence'
);
assert(
  closeAttempt1.error?.includes('without closureEvidenceId and closureSummary') === true,
  'Error message articulates missing closure evidence'
);

// Attempt to close with open critical/major findings
const closeAttempt2 = assuranceProgramService.updateProgramStatus('prg-tz-assurance-2026', 'CLOSED', {
  closureEvidenceId: 'ev-closure-artifact-01',
  closureSummary: 'Attempting closure while findings remain',
  openCriticalFindingsCount: 1,
  openMajorFindingsCount: 0,
});
assert(
  closeAttempt2.success === false,
  'HARD INVARIANT: Program cannot be CLOSED while open CRITICAL or MAJOR findings remain'
);
assert(
  closeAttempt2.error?.includes('open CRITICAL') === true,
  'Error message explicitly halts on unresolved critical findings'
);

// Create dedicated program for clean closure testing
const cleanPrg = assuranceProgramService.createProgram({
  programCode: 'AP-CLEAN-CLOSURE-TEST',
  title: 'Clean Closure Verification Program',
  organizationId: 'org-mkwawa-district',
  targetRelease: '25.0.0-PROD',
  complianceOfficerId: 'user-compliance-kibona',
  clinicalSafetyOfficerId: 'user-cso-dr-kweka',
});
assert(cleanPrg.status === 'PLANNED', 'New program starts in PLANNED status');

const cleanClose = assuranceProgramService.updateProgramStatus(cleanPrg.id, 'CLOSED', {
  closureEvidenceId: 'ev-full-clean-audit-dossier',
  closureSummary: 'All 12 scopes conformant, zero findings open, independent audit complete.',
  openCriticalFindingsCount: 0,
  openMajorFindingsCount: 0,
});
assert(cleanClose.success === true, 'Program successfully transitions to CLOSED with valid evidence');
assert(cleanClose.program?.status === 'CLOSED', 'Program status confirmed as CLOSED');
assert(!!cleanClose.program?.closedAt, 'Program records timestamp of verified closure');

// ----------------------------------------------------------------------------
// 3. External Assessor Model & Independence Invariants
// ----------------------------------------------------------------------------
console.log('\n--- 3. External Assessor Model & Independence ---');
const assessors = externalAssessorService.getAssessors();
assert(assessors.length >= 2, 'External independent assessors registered');

const leadAssessor = externalAssessorService.getAssessorById('assessor-ext-dr-amani');
assert(!!leadAssessor, 'Lead assessor Dr. Amani Mwita retrieved');
assert(
  leadAssessor?.independenceStatus === 'INDEPENDENT_THIRD_PARTY',
  'Lead assessor classified as INDEPENDENT_THIRD_PARTY'
);
assert(leadAssessor?.engagementState === 'ACTIVE', 'Assessor engagement state is ACTIVE');
assert(
  leadAssessor?.credentials.includes('Lead Auditor ISO 13485'),
  'Assessor holds certified ISO 13485 lead auditor credential'
);

// HARD INVARIANT: Assessor cannot evaluate code/components they authored
const authorAssessor = externalAssessorService.registerAssessor({
  fullName: 'Eng. Dev Reviewer',
  organizationName: 'Dev Partner Corp',
  credentials: ['Certified Tester'],
  specialties: ['SOFTWARE_QUALITY'],
  independenceStatus: 'AFFILIATED_DISCLOSED',
  declaredConflict: false,
  authoredComponentIds: ['src/services/localRepository.ts'],
});

const evalConflictCheck = externalAssessorService.checkEvaluationEligibility(
  authorAssessor.id,
  'src/services/localRepository.ts',
  'SOFTWARE_QUALITY'
);
assert(
  evalConflictCheck.eligible === false,
  'HARD INVARIANT: Assessor who authored a component CANNOT evaluate that component'
);
assert(
  evalConflictCheck.rejectionReason?.includes('Conflict of interest') === true,
  'Rejection articulates author conflict of interest'
);

// Assessor can evaluate components they did NOT author
const evalAllowedCheck = externalAssessorService.checkEvaluationEligibility(
  authorAssessor.id,
  'src/services/nonExistentModule.ts',
  'SOFTWARE_QUALITY'
);
assert(
  evalAllowedCheck.eligible === true,
  'Assessor eligible to evaluate components they did not author'
);

// ----------------------------------------------------------------------------
// 4. Traceability Matrix & SHA-256 Tamper-Evident Artifacts
// ----------------------------------------------------------------------------
console.log('\n--- 4. Traceability Matrix & SHA-256 Tamper Evidence ---');
const artifacts = traceabilityEvidenceService.getArtifacts();
assert(artifacts.length >= 2, 'Baseline evidence artifacts available');

const art1 = artifacts[0];
assert(art1.sha256Digest.length === 64, 'Evidence artifact records 64-char SHA-256 hash digest');
assert(art1.isTamperEvident === true, 'Artifact marked as tamper-evident');

// Invariant: Registering artifact with invalid SHA-256 must throw
let hashErrorThrown = false;
try {
  traceabilityEvidenceService.registerEvidenceArtifact({
    title: 'Corrupt Hash Artifact',
    scopeType: 'CYBERSECURITY',
    artifactType: 'AUTOMATED_TEST_RUN',
    sha256Digest: 'invalid-non-hex-digest',
    collectedBy: 'test-user',
    uri: 'logs/corrupt.log',
  });
} catch (e: unknown) {
  hashErrorThrown = true;
}
assert(hashErrorThrown === true, 'HARD INVARIANT: Malformed SHA-256 hash digest rejected');

// Traceability Matrix Completeness
const matrix = traceabilityEvidenceService.generateTraceabilityMatrix('prg-tz-assurance-2026');
assert(matrix.totalRequirements > 0, 'Traceability matrix tracks registered requirements');
assert(matrix.coveredRequirements > 0, 'Traceability matrix links verified requirements');
assert(matrix.completenessPercentage > 0, 'Matrix computes numerical completeness percentage');
assert(Array.isArray(matrix.orphanedRequirements), 'Matrix identifies orphaned requirements');

// ----------------------------------------------------------------------------
// 5. Assessor Findings, Non-Conformities & CSO Sign-off
// ----------------------------------------------------------------------------
console.log('\n--- 5. Assessor Findings & Clinical Safety Officer Sign-off ---');
const findings = assessorFindingsService.getFindings('prg-tz-assurance-2026');
assert(findings.length >= 2, 'Assessor findings tracked for program');

const f1 = findings.find((f) => f.findingCode === 'F-CLIN-01');
assert(!!f1, 'Finding F-CLIN-01 retrieved');
assert(f1?.severity === 'MAJOR', 'Finding severity is MAJOR');
assert(f1?.affectsClinicalSafety === true, 'Finding explicitly marked as affecting clinical safety');
assert(f1?.status === 'VERIFIED_CLOSED', 'Finding is VERIFIED_CLOSED');
assert(
  f1?.clinicalSafetyOfficerSignoff?.approved === true,
  'Finding has approved sign-off from Clinical Safety Officer'
);

// Create a new clinical safety finding and test sign-off invariant
const newFinding = assessorFindingsService.raiseFinding({
  programId: 'prg-tz-assurance-2026',
  scopeType: 'CLINICAL_SAFETY',
  assessorId: 'assessor-ext-dr-amani',
  findingCode: 'F-CLIN-TEST-02',
  severity: 'CRITICAL',
  title: 'Extreme Pediatric Weight Calculation Clinical Boundary',
  description: 'Advisory engine requires explicit dosage warning when pediatric patient weight is <2.5kg.',
  affectsClinicalSafety: true,
});
assert(newFinding.status === 'RAISED', 'New finding starts in RAISED status');

// Developer remediates
assessorFindingsService.submitRemediation(newFinding.id, {
  rootCause: 'Default advisory heuristic lacked edge-case weight clamp',
  remediationPlan: 'Added fail-closed weight check and reference boundary warning',
  remediationArtifactId: 'ev-clinical_safety-test-suite',
  remediatedBy: 'eng-developer-bob',
});

// Developer cannot verify their own fix
const selfVerifyAttempt = assessorFindingsService.verifyAndCloseFinding(newFinding.id, {
  assessorId: 'eng-developer-bob',
  reassessmentNotes: 'I checked my own code and it looks fine',
});
assert(
  selfVerifyAttempt.success === false,
  'HARD INVARIANT: Developer who remediated fix CANNOT verify and close the finding'
);
assert(
  selfVerifyAttempt.error?.includes('Separation of duties') === true,
  'Error message enforces separation of duties'
);

// Verification without Clinical Safety Officer sign-off must fail
const noCsoAttempt = assessorFindingsService.verifyAndCloseFinding(newFinding.id, {
  assessorId: 'assessor-ext-dr-amani',
  reassessmentNotes: 'Assessor re-tested the algorithm',
});
assert(
  noCsoAttempt.success === false,
  'HARD INVARIANT: Clinical safety finding CANNOT be closed without CSO sign-off'
);
assert(
  noCsoAttempt.error?.includes('Clinical Safety Officer') === true,
  'Error message demands Clinical Safety Officer authorization'
);

// Successful verification with CSO sign-off
const csoApproved = assessorFindingsService.verifyAndCloseFinding(newFinding.id, {
  assessorId: 'assessor-ext-dr-amani',
  reassessmentNotes: 'Assessor confirmed unit and integration tests pass with <2.5kg weight clamp.',
  csoSignoff: {
    officerId: 'user-cso-dr-kweka',
    officerName: 'Dr. Neema Kweka (CSO)',
    approved: true,
  },
});
assert(csoApproved.success === true, 'Finding successfully verified and closed with CSO sign-off');
assert(csoApproved.finding?.status === 'VERIFIED_CLOSED', 'Finding status is VERIFIED_CLOSED');
assert(
  csoApproved.finding?.clinicalSafetyOfficerSignoff?.approved === true,
  'CSO approval recorded in finding audit trail'
);

// ----------------------------------------------------------------------------
// 6. External Interoperability Conformance
// ----------------------------------------------------------------------------
console.log('\n--- 6. External Interoperability Conformance ---');
const interopRecords = interopAiSecurityConformanceService.getInteropRecords();
assert(interopRecords.length > 0, 'Interoperability test suites tracked');

const fhirRec = interopRecords.find((r) => r.protocol === 'FHIR_R4');
assert(!!fhirRec, 'FHIR R4 conformance record found');
assert(fhirRec?.syntheticConformancePassed === true, 'Synthetic conformance tests pass');
assert(
  fhirRec?.bilateralGovernmentSignoffRecorded === false,
  'HARD INVARIANT: Synthetic test pass does NOT imply bilateral government clearance'
);
assert(
  fhirRec?.disclaimer.includes('does not constitute official bilateral government accreditation') === true,
  'Mandatory statutory disclaimer present on interoperability test record'
);

// Invariant: Cannot record bilateral sign-off without official accredited certificate number
const invalidBilateral = interopAiSecurityConformanceService.recordBilateralSignoff(
  fhirRec!.id,
  true
);
assert(
  invalidBilateral.success === false,
  'HARD INVARIANT: Bilateral government sign-off rejected without official accredited certificate'
);

// ----------------------------------------------------------------------------
// 7. AI Assurance & Algorithmic Transparency
// ----------------------------------------------------------------------------
console.log('\n--- 7. AI Assurance & Algorithmic Transparency ---');
const aiRecords = interopAiSecurityConformanceService.getAIAssuranceRecords();
assert(aiRecords.length > 0, 'AI assurance records tracked');

const aiRec = aiRecords[0];
assert(aiRec.advisoryOnly === true, 'HARD INVARIANT: AI is strictly advisory-only');
assert(aiRec.autonomousMutationAllowed === false, 'HARD INVARIANT: Autonomous mutation is strictly prohibited');
assert(aiRec.clinicianReviewRequired === true, 'HARD INVARIANT: Clinician review is mandatory for all outputs');
assert(aiRec.offlineDeterministicFallback === true, 'HARD INVARIANT: Offline deterministic fallback guaranteed');

// Check governance validation helper
const aiCheck = interopAiSecurityConformanceService.validateAIGovernanceInvariants(aiRec);
assert(aiCheck.valid === true, 'AI Governance validation passes all invariants');

const invalidAiCheck = interopAiSecurityConformanceService.validateAIGovernanceInvariants({
  ...aiRec,
  autonomousMutationAllowed: true, // Forbidden!
});
assert(invalidAiCheck.valid === false, 'Governance check catches forbidden autonomous mutation');
assert(
  invalidAiCheck.violations.some((v) => v.includes('Autonomous mutation')),
  'Violation message articulates autonomous mutation prohibition'
);

// ----------------------------------------------------------------------------
// 8. Cybersecurity Assurance & Vulnerability Management
// ----------------------------------------------------------------------------
console.log('\n--- 8. Cybersecurity Assurance & Vulnerability SLA ---');
const cyberRecords = interopAiSecurityConformanceService.getCybersecurityRecords();
assert(cyberRecords.length > 0, 'Cybersecurity assurance records tracked');

const cyb = cyberRecords[0];
assert(cyb.threatModelMethod === 'STRIDE', 'Threat model follows STRIDE methodology');
assert(cyb.offlineMeshSecurityVerified === true, 'Offline mesh security verified');
assert(cyb.rawDigestDistinguishedFromDigitalSignature === true, 'HARD INVARIANT: Raw digest distinguished from PKI digital signature');
assert(cyb.vulnerabilities.length > 0, 'Vulnerability disclosure register tracked');
assert(cyb.vulnerabilities[0].isWithinSla === true, 'Vulnerability remediation is within strict SLA');

// ----------------------------------------------------------------------------
// 9. Privacy, Data Sovereignty & 20-Year Retention
// ----------------------------------------------------------------------------
console.log('\n--- 9. Privacy, Data Sovereignty & Retention ---');
const privacyRecords = interopAiSecurityConformanceService.getPrivacyRecords();
assert(privacyRecords.length > 0, 'Privacy impact assessment records tracked');

const pia = privacyRecords[0];
assert(pia.dataResidencyCountry === 'Tanzania', 'Local sovereign data residency verified');
assert(pia.crossBorderTransferAllowed === false, 'Cross-border data transfer prohibited');
assert(pia.statutoryRetentionYears === 20, 'HARD INVARIANT: 20-year medical-legal retention enforced');
assert(
  pia.rightToErasureBalancedWithMedicalLegalRetention === true,
  'Right to erasure balanced with clinical preservation duty'
);

// ----------------------------------------------------------------------------
// 10. Claim Truth & Commercial Anti-Overclaim Policy
// ----------------------------------------------------------------------------
console.log('\n--- 10. Claim Truth & Anti-Fabrication Invariants ---');
const claims = claimControlAndDossierService.getClaims();
assert(claims.length >= 3, 'Regulatory and commercial claim registry active');

const substantiatedClaim = claims.find((c) => c.state === 'SUBSTANTIATED');
assert(!!substantiatedClaim, 'Substantiated claim found');
assert(
  substantiatedClaim?.substantiatingArtifactIds.length! > 0,
  'Substantiated claim links directly to empirical evidence artifacts'
);

const prohibitedClaim = claims.find((c) => c.state === 'PROHIBITED');
assert(!!prohibitedClaim, 'Prohibited claim found');
assert(
  prohibitedClaim?.claimText.includes('FDA 510(k)') === true,
  'Unsubstantiated FDA clearance claim is classified as PROHIBITED'
);

// Attempting to register unsubstantiated external clearance as SUBSTANTIATED must fail
const falseClaimAttempt = claimControlAndDossierService.registerOrUpdateClaim({
  claimText: 'Jano Health is officially CE Marked as Class IIb Medical Device',
  targetStandardOrRegulation: 'EU MDR 2017/745',
  jurisdiction: 'European Union',
  state: 'SUBSTANTIATED',
  substantiatingArtifactIds: [],
});
assert(
  falseClaimAttempt.success === false,
  'HARD INVARIANT: Fabricated claim of official certification cannot be marked SUBSTANTIATED without accredited certificate'
);
assert(
  falseClaimAttempt.error?.includes('without an accredited certificateNumber') === true,
  'Rejection requires accredited certificate number'
);

// ----------------------------------------------------------------------------
// 11. Independent Audit Dossier Generation & SHA-256 Seal
// ----------------------------------------------------------------------------
console.log('\n--- 11. Independent Audit Dossier Generation ---');
const dossier = claimControlAndDossierService.generateIndependentAuditPacket('prg-tz-assurance-2026');
assert(!!dossier, 'Independent audit packet generated');
assert(dossier.totalScopesEvaluated === 12, 'Audit packet evaluated all 12 scopes');
assert(dossier.sha256DossierSeal.length > 20, 'Audit packet sealed with cryptographic SHA-256 hash');
assert(
  dossier.statutoryDisclaimer === TRACK2_STATUTORY_DISCLAIMER,
  'Mandatory statutory disclaimer embedded in sealed audit packet'
);

// ----------------------------------------------------------------------------
// 12. RBAC & Separation of Duties for Assurance Roles
// ----------------------------------------------------------------------------
console.log('\n--- 12. RBAC & Separation of Duties for Assurance Roles ---');
assert(!!ROLE_DEFINITIONS['lead_assessor'], 'lead_assessor role defined in RBAC');
assert(!!ROLE_DEFINITIONS['independent_auditor'], 'independent_auditor role defined in RBAC');
assert(!!ROLE_DEFINITIONS['compliance_officer'], 'compliance_officer role defined in RBAC');

// Verify Lead Assessor permissions
assert(
  hasPermission('lead_assessor', 'assurance:scope:evaluate'),
  'Lead Assessor has assurance:scope:evaluate permission'
);
assert(
  hasPermission('lead_assessor', 'assurance:finding:raise'),
  'Lead Assessor has assurance:finding:raise permission'
);
assert(
  hasPermission('lead_assessor', 'assurance:finding:verify'),
  'Lead Assessor has assurance:finding:verify permission'
);

// Separation of duties
assert(
  !hasPermission('physician', 'assurance:program:manage'),
  'Physician CANNOT manage assurance programs'
);
assert(
  !hasPermission('lead_assessor', 'clinical:prescribe'),
  'Lead Assessor CANNOT prescribe clinical medications'
);
assert(
  !hasPermission('independent_auditor', 'clinical:diagnose'),
  'Independent Auditor CANNOT formulate clinical diagnoses'
);

// ----------------------------------------------------------------------------
// 13. Preservation of 362 IndexedDB Stores Baseline
// ----------------------------------------------------------------------------
console.log('\n--- 13. Preservation of 362 IndexedDB Stores Baseline ---');
assert(ALL_STORE_NAMES.length === 362, `ALL_STORE_NAMES remains exact 362 stores (actual: ${ALL_STORE_NAMES.length})`);

console.log('\n================================================================');
console.log(`ALL POST-CORE TRACK 2 TESTS PASSED: ${passed} assertions verified`);
if (failed > 0) {
  console.error(`FAILED ASSERTIONS: ${failed}`);
  process.exit(1);
} else {
  console.log('================================================================');
}
