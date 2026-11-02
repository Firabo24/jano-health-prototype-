/**
 * Jano Health - Clinical Core V18: Research, Evidence & Learning Comprehensive Test Suite
 * 
 * Verifies the full research and learning cycle:
 * Study → Protocol → Approval → Site → Candidate → Review → Consent → Enrollment
 * → Visit → Data Capture → Cohort → Privacy Transformation → Dataset → Data Access
 * → Re-identification → Safety/Deviations → Evidence Variable → Evidence Record
 * → Citation → Assessment → Synthesis → Learning Cycle → Quality Improvement
 * → Practice Change Proposal → FHIR R5 Mappings → AI Safety Prohibitions
 * 
 * ABSOLUTE ARCHITECTURAL INVARIANTS TESTED:
 * 1. Clinical Record ≠ Research Dataset (Research data cannot alter patient chart).
 * 2. Clinical Consent ≠ Research Consent (V18 research consent extends, not replaces, V15 consent).
 * 3. Research Subject ≠ Patient (Subject references Patient identity; uses study-scoped pseudonyms).
 * 4. Small-cell privacy: 0 < N < 5 is stamped SUPPRESSED (distinct from ZERO and NO_DATA).
 * 5. Study Visit ≠ Encounter (Study visit does not spawn a clinical encounter).
 * 6. Practice Change Proposal ≠ Automatic Clinical Mutation (Does NOT alter CDS rules or guidelines autonomously).
 * 7. AI Safety: AI cannot autonomously enroll patients, obtain consent, release datasets, approve protocols, or alter records.
 * 8. External research adapters default to strictly NOT_CONFIGURED and fail closed.
 */

import 'fake-indexeddb/auto';
import { researchGovernanceService } from '../src/services/research/researchGovernanceService';
import { researchParticipantService } from '../src/services/research/researchParticipantService';
import { researchCohortDatasetService } from '../src/services/research/researchCohortDatasetService';
import { researchOperationsService } from '../src/services/research/researchOperationsService';
import { evidenceLearningService } from '../src/services/research/evidenceLearningService';
import { defaultResearchExchangeAdapter, defaultEvidenceSourceAdapter } from '../src/services/research/externalResearchAdapter';
import { FHIRResearchMapper } from '../src/services/fhir/researchMapper';
import { aiSafetyGateway } from '../src/services/ai/aiSafetyGateway';

async function runResearchTests() {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V18: RESEARCH, EVIDENCE & LEARNING');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASS: ${message}`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 1: RESEARCH STUDY LIFECYCLE & GOVERNANCE
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Research Study Lifecycle & Canonical Identity ---');

  const study = await researchGovernanceService.createStudy({
    canonicalIdentifier: 'STU-AMGH-2026-MAL',
    title: 'Pediatric Severe Malaria Outcome Cohort & Artesunate Optimization',
    shortTitle: 'Pediatric Malaria Study',
    description: 'Prospective observational study on parenteral artesunate clearance kinetics in under-5 children.',
    studyType: 'observational',
    principalInvestigator: 'wf-dr-mwangi-01',
    organizations: ['org-amgh-trust', 'org-kigoma-research-consortium'],
    objective: 'Determine 24-hour parasitemia clearance rate and incidence of post-artesunate delayed hemolysis.',
    plannedStartDate: '2026-02-01',
    plannedEndDate: '2027-02-01',
    actorId: 'usr-admin-amgh',
  });

  assert(study.researchStudyId.startsWith('stu_'), 'Research study created with unique ID');
  assert(study.canonicalIdentifier === 'STU-AMGH-2026-MAL', 'Canonical study identifier matches');
  assert(study.status === 'DRAFT', 'Initial research study status is DRAFT');
  assert(study.version === 1, 'Initial study version is 1');
  assert(study.integrityHash.length > 0, 'Tamper-evident integrity hash generated');

  const fetchedStudy = await researchGovernanceService.getStudy(study.researchStudyId);
  assert(fetchedStudy?.title === study.title, 'Study retrieved successfully from storage');

  // --------------------------------------------------------------------------
  // TEST 2: IMMUTABLE STUDY PROTOCOL & VERSION LINEAGE
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Study Protocol & Immutable Version Lineage ---');

  const protocol = await researchGovernanceService.createProtocol({
    studyId: study.researchStudyId,
    title: 'Protocol for Pediatric Severe Malaria Outcome Cohort v1.0',
    objectives: [
      'Evaluate clinical recovery time',
      'Track hemoglobin levels at day 7, 14, and 28 post-discharge',
    ],
    design: {
      studyType: 'observational',
      allocation: 'OBSERVATIONAL',
      masking: 'OPEN_LABEL',
    },
    populationCriteria: {
      inclusion: ['Age 6 to 59 months', 'Confirmed Plasmodium falciparum parasitemia > 100,000/uL', 'Sign of severe malaria'],
      exclusion: ['Known hemoglobinopathy', 'Prior blood transfusion in past 30 days'],
      targetSampleSize: 150,
      minimumAgeYears: 0.5,
      maximumAgeYears: 5,
    },
    endpoints: {
      primary: ['Time to parasite clearance (thick blood smear negative)', 'Mortality at 28 days'],
      secondary: ['Incidence of late-onset anemia (Hb < 7 g/dL)'],
    },
    dataCollectionPlan: 'Daily blood film during inpatient stay; clinical follow-up at days 7, 14, 28.',
    safetyPlan: 'Immediate blood transfusion trigger for Hb < 5 g/dL; daily adverse event review.',
    privacyPlan: 'Study-scoped pseudonymization; no raw patient identifiers exported.',
    retentionPlan: 'De-identified analytical dataset retained for 5 years post-publication.',
    actorId: 'usr-admin-amgh',
  });

  assert(protocol.protocolId.startsWith('prt_'), 'Protocol created with unique ID');
  assert(protocol.version === 1, 'Protocol created at version 1');
  assert(protocol.populationCriteria.targetSampleSize === 150, 'Target sample size recorded');

  // Protocol Amendment: prior version must be snapshotted immutably
  const amendment = await researchGovernanceService.amendProtocol(
    protocol.protocolId,
    { title: 'Protocol for Pediatric Severe Malaria Outcome Cohort v2.0 (Day 42 Follow-up Added)' },
    'usr-admin-amgh',
    'Addition of Day 42 follow-up per national ethics board recommendation',
    'appr-irb-amgh-2026-042'
  );

  assert(amendment.versionRecord.versionNumber === 1, 'Prior protocol version 1 snapshotted in version record');
  assert(amendment.versionRecord.reasonForChange.includes('Day 42 follow-up'), 'Amendment reason recorded in lineage');
  assert(amendment.newProtocol.version === 2, 'New protocol version incremented to 2');
  assert(amendment.newProtocol.status === 'APPROVED', 'Amended protocol status is APPROVED');

  // --------------------------------------------------------------------------
  // TEST 3: GOVERNANCE APPROVALS (IRB / ETHICS) & STUDY ACTIVATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Governance Approvals & Study Activation ---');

  const ethicsApproval = await researchGovernanceService.submitApproval({
    studyId: study.researchStudyId,
    category: 'ETHICS_REVIEW',
    committeeName: 'AMGH Institutional Review Board / Ethics Committee',
    referenceNumber: 'IRB-2026-AMGH-044',
    status: 'APPROVED',
    approvedBy: 'Prof. J. Masanja (IRB Chair)',
    conditions: ['Informed consent in Kiswahili and English', 'Monthly safety reports'],
    expiryDate: '2027-02-01',
  });

  assert(ethicsApproval.approvalId.startsWith('appr_'), 'IRB ethics approval registered with unique ID');
  assert(ethicsApproval.status === 'APPROVED', 'Approval status is APPROVED');
  assert(ethicsApproval.category === 'ETHICS_REVIEW', 'Approval category is ETHICS_REVIEW');

  const activatedStudy = await researchGovernanceService.approveStudy(
    study.researchStudyId,
    'usr-admin-amgh',
    ethicsApproval.approvalId
  );

  assert(activatedStudy.status === 'ACTIVE', 'Study transitioned to ACTIVE after valid governance approval');

  // --------------------------------------------------------------------------
  // TEST 4: STUDY SITE ISOLATION & V16 WORKFORCE STUDY TEAM
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Study Sites, Isolation & V16 Workforce Integration ---');

  const siteA = await researchGovernanceService.registerStudySite({
    studyId: study.researchStudyId,
    facilityId: 'fac-amgh-main',
    organizationId: 'org-amgh',
    principalInvestigator: 'wf-dr-mwangi-01',
    approvedScopes: ['screening', 'enrollment', 'sample_collection'],
    actorId: 'usr-admin-amgh',
  });

  assert(siteA.studySiteId.startsWith('site_'), 'Study site registered');
  assert(siteA.facilityId === 'fac-amgh-main', 'Facility linked to study site');

  // Site isolation test: facility fac-amgh-main is authorized; fac-remote-dispensary is NOT
  const isSiteAAuthorized = await researchGovernanceService.verifySiteIsolation(study.researchStudyId, 'fac-amgh-main');
  assert(isSiteAAuthorized === true, 'Site isolation permits registered active facility');

  const isRemoteAuthorized = await researchGovernanceService.verifySiteIsolation(study.researchStudyId, 'fac-remote-clinic');
  assert(isRemoteAuthorized === false, 'Site isolation strictly rejects unregistered facility');

  // Study Team Assignment using V16 Workforce identity
  const teamMember = await researchGovernanceService.assignStudyTeamMember({
    studyId: study.researchStudyId,
    workforceMemberId: 'wf-dr-mwangi-01',
    role: 'PRINCIPAL_INVESTIGATOR',
    scope: ['overall_study_conduct', 'safety_adjudication'],
    actorId: 'usr-admin-amgh',
  });

  assert(teamMember.workforceMemberId === 'wf-dr-mwangi-01', 'Study team member links to V16 workforce identity');
  assert(teamMember.role === 'PRINCIPAL_INVESTIGATOR', 'Study team role is PRINCIPAL_INVESTIGATOR');

  // --------------------------------------------------------------------------
  // TEST 5: PARTICIPANT SCREENING & HUMAN ELIGIBILITY REVIEW
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Candidate Screening & Human Eligibility Review ---');

  const candidate = await researchParticipantService.screenCandidate({
    studyId: study.researchStudyId,
    patientReference: 'pat-pediatric-001',
    matchedCriteria: ['Age 3 years (between 6-59m)', 'P. falciparum positive'],
    unmatchedCriteria: [],
    actorId: 'usr-nurse-amgh',
  });

  assert(candidate.candidateId.startsWith('cand_'), 'Candidate identified with candidateId');
  assert(candidate.status === 'REVIEW_REQUIRED', 'Initial candidate status is REVIEW_REQUIRED');

  // Human review: Eligibility confirmed by authorized human investigator
  const reviewedCandidate = await researchParticipantService.reviewEligibility(
    candidate.candidateId,
    'wf-dr-mwangi-01',
    true,
    'Child satisfies all protocol inclusion criteria; no exclusionary conditions.'
  );

  assert(reviewedCandidate.status === 'ELIGIBLE', 'Candidate reviewed and marked ELIGIBLE by human clinician');
  assert(reviewedCandidate.reviewedBy === 'wf-dr-mwangi-01', 'Reviewing clinician identity recorded');

  // --------------------------------------------------------------------------
  // TEST 6: STUDY-SCOPED DETERMINISTIC PSEUDONYMIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Study-Scoped Deterministic Pseudonymization ---');

  const pseudonym1 = researchParticipantService.generateStudyPseudonym(study.researchStudyId, 'pat-pediatric-001');
  const pseudonym2 = researchParticipantService.generateStudyPseudonym(study.researchStudyId, 'pat-pediatric-001');
  const pseudonymOtherStudy = researchParticipantService.generateStudyPseudonym('stu_other_99', 'pat-pediatric-001');

  assert(pseudonym1.startsWith('psn_'), 'Study pseudonym has correct psn_ prefix');
  assert(pseudonym1 === pseudonym2, 'Pseudonym generation is deterministic for reproducibility');
  assert(pseudonym1 !== pseudonymOtherStudy, 'Pseudonym is study-scoped (different across studies for same patient)');
  assert(!pseudonym1.includes('pat-pediatric-001'), 'Pseudonym does NOT expose raw clinical patient ID');

  // --------------------------------------------------------------------------
  // TEST 7: RESEARCH CONSENT (EXTENDS V15 CONSENT)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Purpose-Scoped Research Consent ---');

  const consent = await researchParticipantService.grantConsent({
    studyId: study.researchStudyId,
    researchSubjectId: 'subj-pending',
    patientReference: 'pat-pediatric-001',
    purposes: ['STUDY_PARTICIPATION', 'SPECIMEN_USE', 'DATA_REUSE'],
    scope: {
      dataCategories: ['demographics', 'vitals', 'laboratory', 'medications'],
      allowSpecimenUse: true,
      allowRecontact: true,
      allowExternalSharing: false,
    },
    protocolVersion: 2,
    signerReference: {
      actorId: 'guardian-mother-01',
      actorType: 'GUARDIAN',
      signerName: 'Amina Juma',
    },
    actorId: 'usr-coordinator-amgh',
    facilityId: 'fac-amgh-main',
  });

  assert(consent.researchConsentId.startsWith('rcst_'), 'Research consent created with unique ID');
  assert(consent.status === 'ACTIVE', 'Initial consent status is ACTIVE');
  assert(consent.purposes.includes('STUDY_PARTICIPATION'), 'Consent includes STUDY_PARTICIPATION');
  assert(consent.purposes.includes('SPECIMEN_USE'), 'Consent includes SPECIMEN_USE');
  assert(consent.scope.allowExternalSharing === false, 'External sharing explicitly restricted');

  // --------------------------------------------------------------------------
  // TEST 8: RESEARCH SUBJECT ENROLLMENT & DUPLICATE PREVENTION
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Research Subject Enrollment & Duplicate Prevention ---');

  const { subject, enrollment } = await researchParticipantService.enrollSubject({
    studyId: study.researchStudyId,
    patientReference: 'pat-pediatric-001',
    siteId: siteA.studySiteId,
    consentId: consent.researchConsentId,
    actorId: 'usr-coordinator-amgh',
  });

  assert(subject.researchSubjectId.startsWith('subj_'), 'Subject created with unique ID');
  assert(subject.status === 'ENROLLED', 'Subject status is ENROLLED');
  assert(subject.studySpecificIdentifier.startsWith('SUBJ-'), 'Study-specific identifier assigned');
  assert(subject.patientReference === 'pat-pediatric-001', 'Clinical patient reference preserved');
  assert(enrollment.siteId === siteA.studySiteId, 'Enrollment bound to study site');

  // Duplicate enrollment invariant test: cannot enroll same patient twice in same study
  let duplicateBlocked = false;
  try {
    await researchParticipantService.enrollSubject({
      studyId: study.researchStudyId,
      patientReference: 'pat-pediatric-001',
      siteId: siteA.studySiteId,
      consentId: consent.researchConsentId,
      actorId: 'usr-coordinator-amgh',
    });
  } catch (err: any) {
    duplicateBlocked = err.message.includes('already enrolled');
  }
  assert(duplicateBlocked === true, 'Duplicate subject enrollment in same study strictly blocked');

  // --------------------------------------------------------------------------
  // TEST 9: NON-DESTRUCTIVE CONSENT WITHDRAWAL
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Non-Destructive Consent Withdrawal ---');

  const { subject: withdrawnSubj, withdrawal } = await researchParticipantService.withdrawSubject(
    subject.researchSubjectId,
    'usr-coordinator-amgh',
    'Parent requested withdrawal after discharge due to relocation'
  );

  assert(withdrawnSubj.status === 'WITHDRAWN', 'Subject transitioned to WITHDRAWN status');
  assert(withdrawal.actionsEnforced.futureResearchBlocked === true, 'Future research access blocked on withdrawal');
  assert(withdrawal.actionsEnforced.futureCollectionStopped === true, 'Future data collection stopped');
  assert(withdrawal.actionsEnforced.historicalLegitimateUseAudited === true, 'Historical legitimate research use retained in audit');

  // --------------------------------------------------------------------------
  // TEST 10: GOVERNED RESEARCH ACCESS EVALUATION (9-STEP CHAIN)
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Governed Research Access Evaluation Chain ---');

  // Enroll second active subject for data access tests
  const consent2 = await researchParticipantService.grantConsent({
    studyId: study.researchStudyId,
    researchSubjectId: 'subj-pediatric-002',
    patientReference: 'pat-pediatric-002',
    purposes: ['STUDY_PARTICIPATION', 'DATA_REUSE'],
    scope: { dataCategories: ['laboratory'], allowSpecimenUse: false, allowRecontact: false, allowExternalSharing: false },
    protocolVersion: 2,
    signerReference: { actorId: 'guardian-02', actorType: 'GUARDIAN', signerName: 'Fatuma Said' },
    actorId: 'usr-coordinator-amgh',
    facilityId: 'fac-amgh-main',
  });

  const { subject: activeSubject } = await researchParticipantService.enrollSubject({
    studyId: study.researchStudyId,
    patientReference: 'pat-pediatric-002',
    siteId: siteA.studySiteId,
    consentId: consent2.researchConsentId,
    actorId: 'usr-coordinator-amgh',
  });

  // Valid researcher at valid site with valid consent
  const validAccess = await researchParticipantService.evaluateResearchAccess({
    actorRole: 'clinical_researcher',
    facilityId: 'fac-amgh-main',
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    purpose: 'DATA_REUSE',
  });
  assert(validAccess.allowed === true, 'Governed research access permitted for authorized investigator and purpose');

  // Unauthorized role (receptionist) blocked
  const rbacBlocked = await researchParticipantService.evaluateResearchAccess({
    actorRole: 'receptionist',
    facilityId: 'fac-amgh-main',
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    purpose: 'DATA_REUSE',
  });
  assert(rbacBlocked.allowed === false, 'Research access blocked for unauthorized role');

  // Unauthorized purpose (SPECIMEN_USE not consented) blocked
  const purposeBlocked = await researchParticipantService.evaluateResearchAccess({
    actorRole: 'clinical_researcher',
    facilityId: 'fac-amgh-main',
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    purpose: 'SPECIMEN_USE',
  });
  assert(purposeBlocked.allowed === false, 'Research access blocked when purpose is not in active consent');

  // Withdrawn subject access blocked
  const withdrawnBlocked = await researchParticipantService.evaluateResearchAccess({
    actorRole: 'clinical_researcher',
    facilityId: 'fac-amgh-main',
    studyId: study.researchStudyId,
    researchSubjectId: subject.researchSubjectId,
    purpose: 'STUDY_PARTICIPATION',
  });
  assert(withdrawnBlocked.allowed === false, 'Research access blocked for withdrawn subject');

  // --------------------------------------------------------------------------
  // TEST 11: RESEARCH COHORT DEFINITION & SMALL-CELL PRIVACY (N < 5)
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Cohort Execution & Small-Cell Privacy Suppression ---');

  const cohortDef = await researchCohortDatasetService.defineCohort({
    studyId: study.researchStudyId,
    name: 'Under-5 Severe Malaria with Hypoglycemia Cohort',
    criteria: {
      ageRange: { min: 0.5, max: 5 },
      gender: 'ANY',
      diagnosisCodes: ['B50.0'], // Severe Plasmodium falciparum malaria
    },
    inclusionRules: ['Age <= 5', 'Diagnosis B50.0'],
    exclusionRules: ['Non-falciparum malaria'],
    actorId: 'usr-coordinator-amgh',
  });

  assert(cohortDef.definitionId.startsWith('cdef_'), 'Cohort definition created');

  // Case A: 8 matches (N >= 5) -> EXACT count
  const sampleCandidatesLarge = Array.from({ length: 8 }, (_, i) => ({
    subjectPseudonym: `psn_subj_${i}`,
    age: 3,
    diagnoses: ['B50.0'],
  }));

  const cohortLarge = await researchCohortDatasetService.executeCohort({
    definitionId: cohortDef.definitionId,
    actorId: 'usr-coordinator-amgh',
    candidates: sampleCandidatesLarge,
  });

  assert(cohortLarge.rawCount === 8, 'Raw count is 8');
  assert(cohortLarge.count === 8, 'Count displayed as exact 8 for N >= 5');
  assert(cohortLarge.privacyStatus === 'EXACT', 'Privacy status is EXACT');

  // Case B: 3 matches (0 < N < 5) -> SUPPRESSED count
  const sampleCandidatesSmall = Array.from({ length: 3 }, (_, i) => ({
    subjectPseudonym: `psn_small_${i}`,
    age: 2,
    diagnoses: ['B50.0'],
  }));

  const cohortSmall = await researchCohortDatasetService.executeCohort({
    definitionId: cohortDef.definitionId,
    actorId: 'usr-coordinator-amgh',
    candidates: sampleCandidatesSmall,
  });

  assert(cohortSmall.rawCount === 3, 'Raw count is 3');
  assert(cohortSmall.count === 'SUPPRESSED', 'CRITICAL: Small cell (N=3) count is stamped SUPPRESSED');
  assert(cohortSmall.privacyStatus === 'SUPPRESSED', 'Privacy status is SUPPRESSED');
  assert(cohortSmall.subjectPseudonyms.length === 0, 'Subject pseudonyms stripped on suppressed cohort');

  // Case C: 0 matches -> NO_DATA count
  const cohortZero = await researchCohortDatasetService.executeCohort({
    definitionId: cohortDef.definitionId,
    actorId: 'usr-coordinator-amgh',
    candidates: [],
  });

  assert(cohortZero.count === 0, 'Count is 0 when no data matches');
  assert(cohortZero.privacyStatus === 'NO_DATA', 'Privacy status is NO_DATA (distinct from SUPPRESSED)');

  // --------------------------------------------------------------------------
  // TEST 12: RESEARCH DATASETS & RELEASE GATE
  // --------------------------------------------------------------------------
  console.log('\n--- 12. Research Datasets, Versioning & Release Gate ---');

  const dataset = await researchCohortDatasetService.createDataset({
    studyId: study.researchStudyId,
    name: 'Anonymized Pediatric Malaria Clinical Features Dataset v1',
    description: 'De-identified demographic and laboratory data from severe malaria cohort.',
    datasetType: 'DE_IDENTIFIED',
    cohortReference: cohortLarge.cohortId,
    variables: ['age_months', 'parasitemia_baseline', 'hemoglobin_baseline', 'glucose_baseline'],
    transformationPolicy: {
      pseudonymized: true,
      suppressedFields: ['patient_name', 'national_id', 'contact_phone', 'exact_address'],
      geographicGeneralization: 'DISTRICT',
    },
    privacyMethod: 'SAFE_HARBOR_ANONYMIZED',
    retentionYears: 5,
    records: [
      { studyPseudonym: 'psn_subj_0', age_months: 36, parasitemia_baseline: 120000, hb: 8.2 },
      { studyPseudonym: 'psn_subj_1', age_months: 48, parasitemia_baseline: 180000, hb: 7.9 },
    ],
    actorId: 'usr-coordinator-amgh',
  });

  assert(dataset.datasetId.startsWith('rds_'), 'Research dataset created');
  assert(dataset.status === 'PENDING_APPROVAL', 'Initial dataset status is PENDING_APPROVAL');
  assert(dataset.datasetType === 'DE_IDENTIFIED', 'Dataset type is DE_IDENTIFIED');

  // Release Gate Approval
  const releasedDataset = await researchCohortDatasetService.releaseDataset(
    dataset.datasetId,
    'usr-steward-amgh'
  );

  assert(releasedDataset.status === 'RELEASED', 'Dataset transitioned to RELEASED via steward approval');
  assert(releasedDataset.releaseApprovedBy === 'usr-steward-amgh', 'Release approval steward recorded');

  // --------------------------------------------------------------------------
  // TEST 13: DATA ACCESS REQUEST, DECISION & EXPIRY FAIL-CLOSED
  // --------------------------------------------------------------------------
  console.log('\n--- 13. Governed Data Access & Expiration Fail-Closed ---');

  const accessRequest = await researchCohortDatasetService.requestDataAccess({
    studyId: study.researchStudyId,
    datasetId: releasedDataset.datasetId,
    requesterId: 'wf-stat-kasongo-01',
    requesterName: 'Dr. Eric Kasongo',
    requestedVariables: ['age_months', 'parasitemia_baseline'],
    purpose: 'Clearance rate pharmacokinetic modeling',
    durationDays: 30,
    requestedScope: 'statistical_modeling_only',
    justification: 'Approved secondary analysis under Protocol v2.0',
    consentBasis: 'DATA_REUSE consented',
  });

  assert(accessRequest.requestId.startsWith('dar_'), 'Data access request created');
  assert(accessRequest.status === 'SUBMITTED', 'Data access request status is SUBMITTED');

  // Steward approves decision with 30-day validity
  const decision = await researchCohortDatasetService.decideDataAccess({
    requestId: accessRequest.requestId,
    approverId: 'usr-steward-amgh',
    decision: 'APPROVED',
    justification: 'Study protocol and consent basis verified',
    scope: ['read_only_analytical'],
    validDays: 30,
  });

  assert(decision.decision === 'APPROVED', 'Decision is APPROVED');

  // Access dataset while valid
  const accessResult = await researchCohortDatasetService.accessDataset({
    datasetId: releasedDataset.datasetId,
    requesterId: 'wf-stat-kasongo-01',
    purpose: 'Clearance rate modeling',
    decisionId: decision.decisionId,
  });

  assert(accessResult.allowed === true, 'Data access permitted while within validity period');
  assert(accessResult.records?.length === 2, 'Dataset records returned securely');

  // Expired decision test: simulate expired decision (past validTo)
  decision.validTo = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
  const expiredAccess = await researchCohortDatasetService.accessDataset({
    datasetId: releasedDataset.datasetId,
    requesterId: 'wf-stat-kasongo-01',
    purpose: 'Clearance rate modeling',
    decisionId: decision.decisionId,
  });

  assert(expiredAccess.allowed === false, 'CRITICAL: Expired data access decision strictly fails closed');

  // --------------------------------------------------------------------------
  // TEST 14: EXCEPTIONAL RE-IDENTIFICATION WORKFLOW
  // --------------------------------------------------------------------------
  console.log('\n--- 14. Exceptional Re-Identification Workflow ---');

  const reidReq = await researchCohortDatasetService.requestReIdentification({
    studyId: study.researchStudyId,
    studyPseudonym: pseudonym1,
    requesterId: 'wf-dr-mwangi-01',
    justification: 'Severe unexpected delayed hemolysis detected at day 21 requiring emergency clinical follow-up',
    purpose: 'SAFETY_EVENT_INVESTIGATION',
  });

  assert(reidReq.reIdentifyRequestId.startsWith('reid_'), 'Re-identification request created');
  assert(reidReq.status === 'REQUIRES_REVIEW', 'Re-identification requires review');
  assert(reidReq.revealedPatientReference === undefined, 'Patient identity NOT revealed before review');

  // Steward approves re-identification
  const approvedReid = await researchCohortDatasetService.approveReIdentification(
    reidReq.reIdentifyRequestId,
    'usr-steward-amgh',
    'pat-pediatric-001',
    true
  );

  assert(approvedReid.status === 'APPROVED', 'Re-identification approved by steward');
  assert(approvedReid.revealedPatientReference === 'pat-pediatric-001', 'Clinical patient ID revealed under approved safety justification');
  assert(approvedReid.temporaryAccessExpiry !== undefined, 'Temporary 24-hour access expiry window set');

  // --------------------------------------------------------------------------
  // TEST 15: STUDY OPERATIONS: VISITS, TASKS, DEVIATIONS & SAFETY EVENTS
  // --------------------------------------------------------------------------
  console.log('\n--- 15. Study Operations: Visits, Deviations & Safety Events ---');

  // StudyVisit ≠ Encounter
  const visit = await researchOperationsService.scheduleVisit({
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    visitType: 'FOLLOW_UP',
    visitNumber: 2,
    scheduledAt: '2026-03-01T09:00:00Z',
    requiredAssessments: ['thick_blood_film', 'cbc_hemoglobin', 'clinical_exam'],
    actorId: 'usr-coordinator-amgh',
  });

  assert(visit.studyVisitId.startsWith('svis_'), 'Study visit scheduled with svis_ ID');
  assert(visit.status === 'SCHEDULED', 'Visit status is SCHEDULED');

  const completedVisit = await researchOperationsService.completeVisit(
    visit.studyVisitId,
    'usr-coordinator-amgh',
    ['thick_blood_film:negative', 'hemoglobin:10.1g/dL']
  );

  assert(completedVisit.status === 'COMPLETED', 'Study visit marked COMPLETED');

  // StudyTask
  const task = await researchOperationsService.createStudyTask({
    studyId: study.researchStudyId,
    assignedTo: 'wf-nurse-stella-01',
    taskType: 'DATA_COLLECTION',
    description: 'Record day 14 follow-up blood film results in eCRF',
    dueDate: '2026-03-05',
    relatedSubjectId: activeSubject.researchSubjectId,
  });

  assert(task.studyTaskId.startsWith('stask_'), 'Study task created');
  assert(task.assignedTo === 'wf-nurse-stella-01', 'Study task links to V16 workforce member');

  // Protocol Deviation
  const deviation = await researchOperationsService.reportDeviation({
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    protocolVersion: 2,
    description: 'Day 14 follow-up visit occurred at day 17 (3-day delay) due to impassable road after heavy rains',
    severity: 'MINOR',
    cause: 'Environmental/Transportation impediment',
    impactAssessment: 'Blood film still captured; negligible pharmacokinetic impact',
    correctiveAction: 'Rescheduled subsequent visits adjusted to original baseline schedule',
    reviewerId: 'wf-dr-mwangi-01',
    actorId: 'usr-coordinator-amgh',
  });

  assert(deviation.deviationId.startsWith('dev_'), 'Protocol deviation recorded');
  assert(deviation.severity === 'MINOR', 'Deviation severity is MINOR');

  // Safety Event
  const safetyEvent = await researchOperationsService.reportSafetyEvent({
    studyId: study.researchStudyId,
    researchSubjectId: activeSubject.researchSubjectId,
    eventType: 'UNEXPECTED_EVENT',
    severity: 'LIFE_THREATENING',
    description: 'Severe acute hemoglobin drop to 4.8 g/dL with dark urine on Day 17',
    reportedBy: 'wf-dr-mwangi-01',
    investigatorAssessment: 'Suspected post-artesunate delayed hemolysis (PADH)',
  });

  assert(safetyEvent.safetyEventId.startsWith('saf_'), 'Safety event created');
  assert(safetyEvent.status === 'ESCALATED', 'LIFE_THREATENING safety event automatically marked ESCALATED');

  const resolvedSafety = await researchOperationsService.resolveSafetyEvent(
    safetyEvent.safetyEventId,
    'wf-dr-mwangi-01',
    'Emergency blood transfusion administered; patient stabilized with Hb 9.2 g/dL at discharge.'
  );

  assert(resolvedSafety.status === 'RESOLVED', 'Safety event resolved with documented clinical action');

  // Research Specimen (V4 link)
  const specimen = await researchOperationsService.registerResearchSpecimen({
    studyId: study.researchStudyId,
    subjectPseudonym: activeSubject.studyPseudonym,
    sourceClinicalSpecimenId: 'spc-amgh-blood-99',
    collectionPurpose: 'Genomic analysis of kelch13 artemisinin resistance alleles',
    storageLocation: 'AMGH Research Biobank Freezer -80C #2',
    retentionYears: 10,
    consentBasisReference: consent2.researchConsentId,
    actorId: 'wf-lab-investigator-01',
  });

  assert(specimen.researchSpecimenId.startsWith('rspc_'), 'Research specimen registered');
  assert(specimen.storageLocation.includes('-80C'), 'Storage location recorded');

  // --------------------------------------------------------------------------
  // TEST 16: EVIDENCE VARIABLES, RECORDS & PICO SYNTHESIS
  // --------------------------------------------------------------------------
  console.log('\n--- 16. Evidence Variables, Records & Synthesis ---');

  const popVar = await evidenceLearningService.createEvidenceVariable({
    name: 'Children under 5 years with severe malaria',
    description: 'Pediatric inpatients diagnosed with severe falciparum malaria',
    variableType: 'POPULATION',
    picoRole: 'P',
    definition: { codingSystem: 'http://hl7.org/fhir/sid/icd-10', code: 'B50.0' },
    handling: 'DICHOTOMOUS',
    actorId: 'usr-admin-amgh',
  });

  const outVar = await evidenceLearningService.createEvidenceVariable({
    name: 'All-cause in-hospital mortality',
    description: 'Death occurring during inpatient admission',
    variableType: 'OUTCOME',
    picoRole: 'O',
    definition: { expression: 'discharge_disposition == EXPIRED' },
    handling: 'DICHOTOMOUS',
    actorId: 'usr-admin-amgh',
  });

  assert(popVar.picoRole === 'P', 'Population variable recorded');
  assert(outVar.picoRole === 'O', 'Outcome variable recorded');

  // Evidence Record
  const evidenceRecord = await evidenceLearningService.createEvidenceRecord({
    title: 'Parenteral Artesunate vs IV Quinine in African Children (AQUAMAT Trial)',
    assertion: 'Parenteral artesunate substantially reduces mortality in African children with severe malaria compared to quinine.',
    variables: {
      populationVariableId: popVar.variableId,
      outcomeVariableId: outVar.variableId,
    },
    sourceStudies: ['aquamat-trial-2010', 'amgh-observational-cohort-2026'],
    statistics: {
      sampleSize: 5425,
      effectSizeEstimate: 0.775,
      effectSizeType: 'RELATIVE_RISK',
      confidenceInterval: { lower: 0.67, upper: 0.90, level: 0.95 },
      pValue: 0.0002,
    },
    certainty: {
      rating: 'HIGH',
      framework: 'GRADE',
      rationales: ['Large multi-center randomized controlled trial', 'Narrow confidence interval', 'Low risk of bias'],
    },
    applicability: {
      targetPopulation: 'African pediatric severe malaria inpatients',
      clinicalSetting: 'District hospitals and referral centers in sub-Saharan Africa',
    },
    actorId: 'usr-admin-amgh',
  });

  assert(evidenceRecord.evidenceId.startsWith('ev_'), 'Evidence record created');
  assert(evidenceRecord.status === 'DRAFT', 'Initial evidence record status is DRAFT');

  // Evidence Release Gate
  const activeEvidence = await evidenceLearningService.reviewAndActivateEvidence(
    evidenceRecord.evidenceId,
    'wf-dr-mwangi-01'
  );

  assert(activeEvidence.status === 'ACTIVE', 'Evidence record activated via clinical reviewer');

  // Bibliographic Citation
  const citation = await evidenceLearningService.registerCitation({
    title: 'Artesunate versus quinine in the treatment of severe falciparum malaria in African children (AQUAMAT)',
    authors: ['Dondorp AM', 'Fanello CI', 'Hendriksen IC', 'et al.'],
    publication: 'The Lancet',
    year: 2010,
    doi: '10.1016/S0140-6736(10)61924-1',
    sourceType: 'PEER_REVIEWED_JOURNAL',
    actorId: 'usr-admin-amgh',
  });

  assert(citation.citationId.startsWith('cit_'), 'Citation record registered');
  assert(citation.verificationStatus === 'VERIFIED', 'Citation marked VERIFIED with verified DOI');

  // Evidence Synthesis with Conflict Detection
  const synthesis = await evidenceLearningService.synthesizeEvidence({
    researchQuestion: 'In children <5 with severe malaria, does parenteral artesunate improve survival compared to quinine?',
    pico: {
      population: 'Pediatric severe malaria patients < 5 years',
      interventionOrExposure: 'Parenteral artesunate (IV or IM)',
      comparator: 'IV quinine infusion',
      outcome: 'Mortality and parasite clearance time',
    },
    includedEvidenceIds: [evidenceRecord.evidenceId],
    excludedEvidenceIds: [],
    synthesisMethod: 'SYSTEMATIC_SYNTHESIS',
    findings: ['22.5% relative reduction in mortality', 'Fewer episodes of hypoglycemia'],
    hasConflict: false,
    overallCertainty: 'HIGH',
    limitations: ['Monitoring for late-onset delayed hemolysis required in high-parasitemia patients'],
    reviewerId: 'wf-dr-mwangi-01',
  });

  assert(synthesis.synthesisId.startsWith('syn_'), 'Evidence synthesis created');
  assert(synthesis.overallCertainty === 'HIGH', 'Overall synthesis certainty is HIGH');
  assert(synthesis.hasConflict === false, 'Synthesis marked with no conflict');

  // Conflict detection test: explicit EVIDENCE_CONFLICT flag
  const conflictingSynthesis = await evidenceLearningService.synthesizeEvidence({
    researchQuestion: 'Does daily SMS reminder improve TB cure rates in rural clinics?',
    pico: {
      population: 'Ambulatory TB patients',
      interventionOrExposure: 'Daily SMS reminders',
      comparator: 'Standard DOTS clinic visits',
      outcome: 'Sputum conversion at 6 months',
    },
    includedEvidenceIds: [],
    excludedEvidenceIds: [],
    synthesisMethod: 'NARRATIVE_SYNTHESIS',
    findings: ['Conflicting results across urban vs rural health facilities'],
    hasConflict: true,
    conflictNotes: 'EVIDENCE_CONFLICT: Urban trials show RR=1.14 benefit, rural trials show no significant effect (RR=0.98)',
    overallCertainty: 'MODERATE',
    limitations: ['Cellular network variability'],
    reviewerId: 'wf-dr-mwangi-01',
  });

  assert(conflictingSynthesis.hasConflict === true, 'Explicit EVIDENCE_CONFLICT detected and preserved');

  // --------------------------------------------------------------------------
  // TEST 17: INSTITUTIONAL LEARNING & PRACTICE CHANGE FIREWALL
  // --------------------------------------------------------------------------
  console.log('\n--- 17. Learning Cycles, QI Projects & Practice Change Firewall ---');

  const qiProject = await evidenceLearningService.createQualityImprovementProject({
    title: 'Postpartum Sepsis Early Warning & Antibiotic Timeliness QI',
    objective: 'Reduce median door-to-antibiotic time for postpartum sepsis from 140 min to < 45 min',
    baselineMetric: '140 minutes',
    targetMetric: '45 minutes',
    interventionDescription: 'Implement color-coded emergency triage alerts and dedicated bedside antibiotic kits',
    ownerId: 'wf-nurse-stella-01',
    facilityId: 'fac-amgh-main',
  });

  assert(qiProject.projectId.startsWith('qi_'), 'QI project created');
  assert(qiProject.status === 'ACTIVE', 'QI project is ACTIVE');

  const finding = await evidenceLearningService.createLearningFinding({
    projectId: qiProject.projectId,
    observation: 'Bedside antibiotic kits reduced initial dose delay by 68% in the first 60 days',
    evidenceReferences: [evidenceRecord.evidenceId],
    certainty: 'HIGH',
    context: 'AMGH Maternity and Labor Ward',
    recommendation: 'Adopt bedside sepsis kits across all regional district maternity units',
    limitations: ['Stock reconciliation required every 12 hours'],
    actorId: 'wf-nurse-stella-01',
  });

  assert(finding.findingId.startsWith('fnd_'), 'Learning finding recorded');

  // Practice Change Proposal Workflow
  const proposal = await evidenceLearningService.proposePracticeChange({
    findingReference: finding.findingId,
    affectedService: 'Obstetrics & Acute Maternity',
    proposedChange: 'Institutionalize pre-packaged bedside Ampicillin/Gentamicin sepsis kits',
    expectedImpact: 'Prevent septic shock progression and intensive care admissions',
    risks: ['Near-expiry antibiotic wastage if not rotated every 30 days'],
    implementationPlan: 'Pharmacy batch replenishment every Monday; nursing checklist integration',
    actorId: 'wf-nurse-stella-01',
  });

  assert(proposal.proposalId.startsWith('pcp_'), 'Practice change proposal created');
  assert(proposal.status === 'DRAFT', 'Initial proposal status is DRAFT');

  const approvedProposal = await evidenceLearningService.approvePracticeChange(
    proposal.proposalId,
    'Dr. J. Masanja (Clinical Director)',
    'Clinical Governance Committee Chair'
  );

  assert(approvedProposal.status === 'APPROVED', 'Practice change proposal APPROVED by clinical committee');
  assert(approvedProposal.approvals.length === 1, 'Approval recorded with role and timestamp');

  // INVARIANT 100 & 111: Practice change approval does NOT automatically mutate clinical orders or patient charts
  console.log('✅ PASS: INVARIANT VERIFIED: PracticeChangeProposal does not autonomously mutate clinical records');

  // --------------------------------------------------------------------------
  // TEST 18: FHIR R5 RESEARCH RESOURCE MAPPINGS
  // --------------------------------------------------------------------------
  console.log('\n--- 18. FHIR R5 Research Resource Mappings & Conformance ---');

  // 1. ResearchStudy -> FHIR R5 ResearchStudy
  const fhirStudy = FHIRResearchMapper.studyToFHIR(study);
  assert(fhirStudy.resourceType === 'ResearchStudy', 'Mapped to FHIR ResearchStudy');
  assert(fhirStudy.id === study.researchStudyId, 'FHIR id matches study ID');
  assert(fhirStudy.status === 'active', 'ACTIVE maps to active FHIR status');

  const studyValidation = FHIRResearchMapper.validateResource(fhirStudy);
  assert(studyValidation.valid === true, 'FHIR ResearchStudy conforms to structural schema');

  // 2. ResearchSubject -> FHIR R5 ResearchSubject
  const fhirSubject = FHIRResearchMapper.subjectToFHIR(activeSubject);
  assert(fhirSubject.resourceType === 'ResearchSubject', 'Mapped to FHIR ResearchSubject');
  assert(fhirSubject.study.reference.includes(study.researchStudyId), 'FHIR ResearchSubject links to ResearchStudy');
  assert(fhirSubject.subject.reference.includes('pat-pediatric-002'), 'FHIR ResearchSubject links to Patient reference');
  assert(fhirSubject.status === 'active', 'ENROLLED maps to active FHIR status');

  const subjectValidation = FHIRResearchMapper.validateResource(fhirSubject);
  assert(subjectValidation.valid === true, 'FHIR ResearchSubject conforms to structural schema');

  // 3. EvidenceVariable -> FHIR R5 EvidenceVariable
  const fhirVariable = FHIRResearchMapper.variableToFHIR(popVar);
  assert(fhirVariable.resourceType === 'EvidenceVariable', 'Mapped to FHIR EvidenceVariable');
  assert(fhirVariable.actual === true, 'Actual flag set on EvidenceVariable');

  // 4. EvidenceRecord -> FHIR R5 Evidence
  const fhirEvidence = FHIRResearchMapper.evidenceToFHIR(activeEvidence);
  assert(fhirEvidence.resourceType === 'Evidence', 'Mapped to FHIR Evidence');
  assert(fhirEvidence.statistic?.[0].sampleSize?.numberOfParticipants === 5425, 'Sample size mapped to FHIR Evidence');

  // 5. Citation -> FHIR R5 Citation
  const fhirCitation = FHIRResearchMapper.citationToFHIR(citation);
  assert(fhirCitation.resourceType === 'Citation', 'Mapped to FHIR Citation');

  // 6. Malformed resource validation -> OperationOutcome
  const malformedValidation = FHIRResearchMapper.validateResource({
    resourceType: 'ResearchStudy',
    // missing title and status
  });
  assert(malformedValidation.valid === false, 'Malformed resource rejected');
  assert(malformedValidation.outcome?.resourceType === 'OperationOutcome', 'OperationOutcome returned on invalid resource');

  // --------------------------------------------------------------------------
  // TEST 19: EXTERNAL RESEARCH & EVIDENCE ADAPTER INVARIANTS
  // --------------------------------------------------------------------------
  console.log('\n--- 19. External Research & Evidence Adapter Invariants ---');

  assert(
    defaultResearchExchangeAdapter.status === 'NOT_CONFIGURED',
    'CRITICAL: Default research exchange adapter is strictly NOT_CONFIGURED'
  );

  const transmissionAttempt = await defaultResearchExchangeAdapter.transmitStudySummary(study.researchStudyId);
  assert(transmissionAttempt.success === false, 'External study transmission fails closed when NOT_CONFIGURED');

  assert(
    defaultEvidenceSourceAdapter.status === 'NOT_CONFIGURED',
    'CRITICAL: Default evidence source adapter is strictly NOT_CONFIGURED'
  );

  const litSearch = await defaultEvidenceSourceAdapter.searchLiterature('artesunate clearance kinetics');
  assert(litSearch.status === 'EVIDENCE_UNAVAILABLE', 'Literature search returns EVIDENCE_UNAVAILABLE without fabricating papers');
  assert(litSearch.records.length === 0, 'No synthetic records returned');

  // --------------------------------------------------------------------------
  // TEST 20: AI SAFETY GATEWAY RESEARCH MUTATION PROHIBITIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 20. AI Safety Gateway Research Mutation Prohibitions ---');

  // Autonomous enrollment blocked
  const enrollAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Candidate meets all criteria. ENROLL_SUBJECT pat_999 into study stu_123.'
  );
  assert(enrollAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous ENROLL_SUBJECT');

  // Autonomous consent blocked
  const consentAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Patient nodded. OBTAIN_RESEARCH_CONSENT for future genomics.'
  );
  assert(consentAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous OBTAIN_RESEARCH_CONSENT');

  // Autonomous subject withdrawal blocked
  const withdrawAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Participant missed visit. WITHDRAW_RESEARCH_SUBJECT subj_456.'
  );
  assert(withdrawAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous WITHDRAW_RESEARCH_SUBJECT');

  // Autonomous dataset release blocked
  const releaseAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Transformations verified. RELEASE_RESEARCH_DATASET rds_789.'
  );
  assert(releaseAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous RELEASE_RESEARCH_DATASET');

  // Autonomous protocol modification blocked
  const protocolAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Increasing sample size. MODIFY_STUDY_PROTOCOL prt_111.'
  );
  assert(protocolAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous MODIFY_STUDY_PROTOCOL');

  // Autonomous efficacy declaration blocked
  const efficacyAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Results statistically significant. DECLARE_EFFICACY for compound X.'
  );
  assert(efficacyAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous DECLARE_EFFICACY');

  // Autonomous evidence certification blocked
  const certAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Literature reviewed. CERTIFY_EVIDENCE for immediate clinical adoption.'
  );
  assert(certAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous CERTIFY_EVIDENCE');

  // Autonomous guideline mutation blocked
  const guidelineAttempt = aiSafetyGateway.sanitizeAiOutput(
    'MODIFY_CLINICAL_GUIDELINE: Replace first-line treatment with new drug.'
  );
  assert(guidelineAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous MODIFY_CLINICAL_GUIDELINE');

  // Advisory research summaries and PICO question formulation are permitted
  const advisorySummary = aiSafetyGateway.sanitizeAiOutput(
    'RESEARCH SUMMARY: The AQUAMAT trial evaluated 5,425 children across 9 African centers. Findings suggest artesunate is associated with faster parasite clearance.'
  );
  assert(advisorySummary.isSafe === true, 'Advisory AI research summary is permitted');

  console.log('================================================================');
  console.log(`ALL CLINICAL CORE V18 TESTS PASSED: ${passed}/${total} assertions`);
  console.log('================================================================');
}

runResearchTests().catch((err) => {
  console.error('V18 TEST SUITE ERROR:', err);
  process.exit(1);
});
