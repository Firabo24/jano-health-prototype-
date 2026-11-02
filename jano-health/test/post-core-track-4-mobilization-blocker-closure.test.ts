/**
 * Jano Health — Post-Core Track 4 Verification Suite
 * FIRST-SITE MOBILIZATION & BLOCKER CLOSURE
 *
 * Verifies platform baseline freeze (362 stores), readiness dossier reconciliation,
 * strict unearned-claim elimination, statutory retention source attribution,
 * formal 5-blocker closure lifecycle, dual human-authorized Go/No-Go mobilization gates,
 * and cryptographically sealed mobilization dossier export.
 */

import {
  FirstSiteMobilizationService,
} from '../src/services/postcore';
import {
  TRACK4_STATUTORY_DISCLAIMER,
  FacilityAuthorizationEvidence,
  CsoAppointmentEvidence,
  InfrastructureCommissioningEvidence,
  WorkforceReadinessEvidence,
  PhysicalOnSiteSatEvidence,
  OnSiteSatVerificationRecord,
} from '../src/domain/postCoreTrack4Types';
import { SatCategory } from '../src/domain/postCoreTrack3Types';
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
console.log('  JANO HEALTH — POST-CORE TRACK 4 VERIFICATION SUITE');
console.log('  FIRST-SITE MOBILIZATION & BLOCKER CLOSURE');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// 1. FREEZE THE PLATFORM BASELINE (Section 1)
// ----------------------------------------------------------------------------
console.log('--- 1. Freeze Platform Baseline (362 IndexedDB Stores) ---');
assert(ALL_STORE_NAMES.length === 362, `HARD INVARIANT: Platform baseline frozen at exactly 362 stores (actual: ${ALL_STORE_NAMES.length})`);
assert(ALL_STORE_NAMES.includes('patients'), 'Store "patients" present in baseline');
assert(ALL_STORE_NAMES.includes('encounters'), 'Store "encounters" present in baseline');
assert(ALL_STORE_NAMES.includes('medications'), 'Store "medications" present in baseline');
assert(ALL_STORE_NAMES.includes('auditLog'), 'Store "auditLog" present in baseline');

const service = new FirstSiteMobilizationService();

// ----------------------------------------------------------------------------
// 2. RECONCILE THE READINESS DOSSIER (Section 2)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Reconcile Readiness Dossier & Truth Audit ---');
const reconciled = service.getReconciledDossier();
assert(reconciled.length >= 5, 'Reconciled readiness dossier contains all 5 tracked topics');

const csoItem = reconciled.find((r) => r.id === 'rec-cso-appointment');
assert(!!csoItem, 'Reconciled CSO appointment item tracked');
assert(csoItem?.reconciledStatus === 'PLANNED', 'REALITY RIGOR: CSO starts as PLANNED until appointment letter executed');

const networkItem = reconciled.find((r) => r.id === 'rec-network-commissioning');
assert(!!networkItem, 'Reconciled network item tracked');
assert(networkItem?.reconciledStatus === 'DOCUMENTED', 'REALITY RIGOR: Network starts as DOCUMENTED, not PHYSICALLY_VERIFIED');

const hwItem = reconciled.find((r) => r.id === 'rec-hardware-solar-specs');
assert(!!hwItem, 'Reconciled hardware/solar specifications item tracked');
assert(hwItem?.reconciledStatus === 'PLANNED', 'REALITY RIGOR: Hardware & solar remain PLANNED until procurement & installation');

const metricsItem = reconciled.find((r) => r.id === 'rec-operational-metrics-targets');
assert(!!metricsItem, 'Reconciled operational metrics item tracked');
assert(metricsItem?.isExternallyMandatedStandard === false, 'REALITY RIGOR: Operational metrics flagged as internal SLOs, not external statutory standards');

// Statutory Retention Authority Tracking
const retentionBefore = service.getRetentionSourceStatus();
assert(retentionBefore.status === 'SOURCE_REQUIRED', 'REALITY RIGOR: Retention statutory authority starts as SOURCE_REQUIRED');

// Linking authoritative statutory source
service.linkAuthoritativeRetentionSource(
  'FDRE Ministry of Health Health Data Governance Directive No. 001/2020 Art. 14(2)',
  'Mandates 20-year retention for primary hospital inpatient and clinical encounter records.'
);
const retentionAfter = service.getRetentionSourceStatus();
assert(retentionAfter.status === 'SOURCE_VERIFIED', 'Retention source updated to SOURCE_VERIFIED after authoritative legal citation');
assert(!!retentionAfter.citationRef, 'Citation reference stored in retention audit record');

const retentionItem = service.getReconciledDossier().find((r) => r.id === 'rec-retention-statutory-source');
assert(retentionItem?.reconciledStatus === 'APPROVED', 'Reconciled retention status promoted to APPROVED upon legal citation');

// ----------------------------------------------------------------------------
// 3. 5 BLOCKERS DEFINITION & INITIAL STATE (Section 3)
// ----------------------------------------------------------------------------
console.log('\n--- 3. 5-Blocker Lifecycle & Initial Status ---');
const blockers = service.getBlockers();
assert(blockers.length === 5, 'Exact 5 operational blockers defined');

assert(blockers.some((b) => b.id === 'BLOCKER_1_FACILITY_AUTHORIZATION' && b.status === 'OPEN'), 'Blocker 1 (Facility Authorization) is OPEN');
assert(blockers.some((b) => b.id === 'BLOCKER_2_CSO_APPOINTMENT' && b.status === 'OPEN'), 'Blocker 2 (CSO Appointment) is OPEN');
assert(blockers.some((b) => b.id === 'BLOCKER_3_PHYSICAL_INFRASTRUCTURE' && b.status === 'OPEN'), 'Blocker 3 (Physical Infrastructure) is OPEN');
assert(blockers.some((b) => b.id === 'BLOCKER_4_WORKFORCE_COMPETENCY' && b.status === 'OPEN'), 'Blocker 4 (Workforce Competency) is OPEN');
assert(blockers.some((b) => b.id === 'BLOCKER_5_PHYSICAL_ONSITE_SAT' && b.status === 'OPEN'), 'Blocker 5 (Physical On-Site SAT) is OPEN');

// ----------------------------------------------------------------------------
// 4. BLOCKER 1: SELECT & AUTHORIZE REAL FACILITY
// ----------------------------------------------------------------------------
console.log('\n--- 4. Blocker 1 — Target Facility Selection & Authorization ---');
// Fail-closed test: missing MoA reference
let facFailClosed = false;
try {
  service.closeBlocker1FacilityAuthorization(
    {
      facilityId: 'fac-01',
      facilityName: 'Bishan Dimo Primary Hospital',
      facilityType: 'PRIMARY_HOSPITAL',
      region: 'Oromia',
      zone: 'East Shewa',
      woreda: 'Adama Rural',
      kebele: 'Kebele 03',
      regionalHealthBureauMoARef: '', // Missing!
      woredaHealthOfficePermitRef: 'PERMIT-123',
      authorizingOfficialName: 'Ato Gemechu Bekele',
      authorizingOfficialTitle: 'Head of Woreda Health Office',
      authorizedDate: '2026-10-09',
      targetGoLiveWindow: { startDate: '2026-10-20', endDate: '2026-11-20' },
    },
    'Governance Lead'
  );
} catch (e) {
  facFailClosed = true;
}
assert(facFailClosed, 'HARD INVARIANT: Blocker 1 fails closed without Regional Health Bureau MoA reference');

// Successful closure
const validFacEvidence: FacilityAuthorizationEvidence = {
  facilityId: 'fac-eth-001',
  facilityName: 'Bishan Dimo Primary Hospital',
  facilityType: 'PRIMARY_HOSPITAL',
  region: 'Oromia Regional State',
  zone: 'East Shewa Zone',
  woreda: 'Adama Rural Woreda',
  kebele: 'Kebele 03',
  regionalHealthBureauMoARef: 'ORHB/DP/MOA-2026-10-884',
  woredaHealthOfficePermitRef: 'E-SHEWA/HO/PERMIT-0492',
  authorizingOfficialName: 'Ato Gemechu Bekele',
  authorizingOfficialTitle: 'Head of Woreda Health Office',
  authorizedDate: '2026-10-09',
  targetGoLiveWindow: { startDate: '2026-10-20', endDate: '2026-11-20' },
};
service.closeBlocker1FacilityAuthorization(validFacEvidence, 'Operations Director');
const blk1 = service.getBlocker('BLOCKER_1_FACILITY_AUTHORIZATION');
assert(blk1?.status === 'VERIFIED_CLOSED', 'Blocker 1 status is VERIFIED_CLOSED');
assert(blk1?.evidenceArtifacts.length! > 0, 'Blocker 1 has verified evidence artifact attached');

// ----------------------------------------------------------------------------
// 5. BLOCKER 2: CLINICAL SAFETY OFFICER APPOINTMENT
// ----------------------------------------------------------------------------
console.log('\n--- 5. Blocker 2 — Clinical Safety Officer Appointment ---');
// Fail-closed test: missing license
let csoFailClosed = false;
try {
  service.closeBlocker2CsoAppointment(
    {
      csoName: 'Dr. Neema Kweka',
      qualification: 'Medical Doctor',
      licenseNumber: '', // Missing!
      appointmentLetterRef: 'RHB/HR/CSO-01',
      signedTermsOfReferenceRef: 'TOR-01',
      hazardLogReviewDate: '2026-10-09',
      clinicalSafetyCaseApprovalRef: 'SCC-01',
      appointedByTitle: 'Regional Director',
      effectiveDate: '2026-10-09',
    },
    'Secretary'
  );
} catch (e) {
  csoFailClosed = true;
}
assert(csoFailClosed, 'HARD INVARIANT: Blocker 2 fails closed without active medical license number');

// Successful closure
const validCsoEvidence: CsoAppointmentEvidence = {
  csoName: 'Dr. Neema Kweka, MD',
  qualification: 'Medical Doctor / Clinical Safety Specialist',
  licenseNumber: 'MED-ETH-2018-84729',
  appointmentLetterRef: 'RHB/HR/CSO-APPOINT-2026-09',
  signedTermsOfReferenceRef: 'TOR-CSO-JANO-2026-V2',
  hazardLogReviewDate: '2026-10-09',
  clinicalSafetyCaseApprovalRef: 'SCC-JANO-SITE01-REV3',
  appointedByTitle: 'Regional Health Bureau Director General',
  effectiveDate: '2026-10-09',
};
service.closeBlocker2CsoAppointment(validCsoEvidence, 'Governance Secretary');
const blk2 = service.getBlocker('BLOCKER_2_CSO_APPOINTMENT');
assert(blk2?.status === 'VERIFIED_CLOSED', 'Blocker 2 status is VERIFIED_CLOSED');
const recCso = service.getReconciledDossier().find((r) => r.id === 'rec-cso-appointment');
assert(recCso?.reconciledStatus === 'APPROVED', 'Reconciled CSO status promoted to APPROVED upon verified appointment letter');

// ----------------------------------------------------------------------------
// 6. BLOCKER 3: PHYSICAL SITE INFRASTRUCTURE COMMISSIONING
// ----------------------------------------------------------------------------
console.log('\n--- 6. Blocker 3 — Physical Site Infrastructure Commissioning ---');
// Fail-closed test: insufficient battery autonomy (< 8h)
let infraFailClosed = false;
try {
  service.closeBlocker3PhysicalInfrastructure(
    {
      commissioningDate: '2026-10-09',
      commissioningEngineer: 'Dawit Abebe',
      solarInverterModel: 'Victron MultiPlus-II',
      solarInverterCapacityWatts: 3000,
      batteryModel: 'Pylontech US3000C',
      batteryCapacityKWh: 3.5,
      measuredOffGridAutonomyHours: 4, // Insufficient!
      localHubDeviceSerial: 'RUGGED-PC-01',
      localHubOsVersion: 'Ubuntu 22.04 LTS',
      localNetworkSsid: 'JANO-VLAN40',
      wpa3SecurityConfirmed: true,
      isolatedClinicalVlanTag: 40,
      enrolledTabletSerials: ['TAB-01'],
      powerFailureCutoverTestPassed: true,
      commissioningSignOffRef: 'COMM-01',
    },
    'Chief Field Engineer'
  );
} catch (e) {
  infraFailClosed = true;
}
assert(infraFailClosed, 'HARD INVARIANT: Blocker 3 fails closed if off-grid autonomy is less than 8 hours');

// Successful closure
const validInfraEvidence: InfrastructureCommissioningEvidence = {
  commissioningDate: '2026-10-09',
  commissioningEngineer: 'Dawit Abebe (Field Systems Engineer)',
  solarInverterModel: 'Victron MultiPlus-II 48/3000/35-32',
  solarInverterCapacityWatts: 3000,
  batteryModel: 'Pylontech US3000C LiFePO4 (3.5kWh)',
  batteryCapacityKWh: 3.5,
  measuredOffGridAutonomyHours: 14,
  localHubDeviceSerial: 'RUGGED-PC-JANO-ETH-0042',
  localHubOsVersion: 'Ubuntu 22.04 LTS (Kernel 5.15-hardened)',
  localNetworkSsid: 'JANO-CLINICAL-VLAN40',
  wpa3SecurityConfirmed: true,
  isolatedClinicalVlanTag: 40,
  enrolledTabletSerials: ['TAB-ETH-001', 'TAB-ETH-002', 'TAB-ETH-003', 'TAB-ETH-004', 'TAB-ETH-005', 'TAB-ETH-006'],
  powerFailureCutoverTestPassed: true,
  commissioningSignOffRef: 'COMM-REPORT-SITE01-SIGN-2026',
};
service.closeBlocker3PhysicalInfrastructure(validInfraEvidence, 'Chief Field Engineer');
const blk3 = service.getBlocker('BLOCKER_3_PHYSICAL_INFRASTRUCTURE');
assert(blk3?.status === 'VERIFIED_CLOSED', 'Blocker 3 status is VERIFIED_CLOSED');
const recNet = service.getReconciledDossier().find((r) => r.id === 'rec-network-commissioning');
assert(recNet?.reconciledStatus === 'PHYSICALLY_VERIFIED', 'Reconciled network promoted to PHYSICALLY_VERIFIED upon on-site commissioning');

// ----------------------------------------------------------------------------
// 7. BLOCKER 4: WORKFORCE TRAINING & COMPETENCY
// ----------------------------------------------------------------------------
console.log('\n--- 7. Blocker 4 — Workforce Training & Competency Verification ---');
// Fail-closed test: staff member scored below 85%
let trainFailClosed = false;
try {
  service.closeBlocker4WorkforceCompetency(
    {
      trainingProgramRef: 'TP-01',
      totalClinicalStaffEnrolled: 2,
      totalPassingCompetency: 1,
      averageScorePercentage: 75,
      staffRecords: [
        {
          staffId: 's-1',
          fullName: 'Dr. A',
          clinicalCadre: 'PHYSICIAN',
          trainingCompletionDate: '2026-10-08',
          competencyExamScorePercentage: 90,
          passedCompetencyExam: true,
          supervisedPracticeHoursLogged: 20,
          rbacUsernameProvisioned: 'dr.a',
          accountRoleAssigned: 'physician',
        },
        {
          staffId: 's-2',
          fullName: 'Nurse B',
          clinicalCadre: 'NURSE',
          trainingCompletionDate: '2026-10-08',
          competencyExamScorePercentage: 70, // Below 85%!
          passedCompetencyExam: false,
          supervisedPracticeHoursLogged: 8,
          rbacUsernameProvisioned: 'nurse.b',
          accountRoleAssigned: 'nurse',
        },
      ],
      allAccountsProvisionedWithRBAC: true,
      trainingDirectorSignoffRef: 'SIGN-01',
    },
    'Training Lead'
  );
} catch (e) {
  trainFailClosed = true;
}
assert(trainFailClosed, 'HARD INVARIANT: Blocker 4 fails closed if any staff member scored < 85% on competency exam');

// Successful closure
const validWorkforceEvidence: WorkforceReadinessEvidence = {
  trainingProgramRef: 'TP-ETH-DISTRICT-2026-V1',
  totalClinicalStaffEnrolled: 4,
  totalPassingCompetency: 4,
  averageScorePercentage: 91.0,
  staffRecords: [
    {
      staffId: 'stf-01',
      fullName: 'Dr. Tadesse Bekele',
      clinicalCadre: 'PHYSICIAN',
      trainingCompletionDate: '2026-10-08',
      competencyExamScorePercentage: 94,
      passedCompetencyExam: true,
      supervisedPracticeHoursLogged: 20,
      rbacUsernameProvisioned: 'dr.tadesse',
      accountRoleAssigned: 'physician',
    },
    {
      staffId: 'stf-02',
      fullName: 'Sr. Almaz Haile',
      clinicalCadre: 'NURSE',
      trainingCompletionDate: '2026-10-08',
      competencyExamScorePercentage: 92,
      passedCompetencyExam: true,
      supervisedPracticeHoursLogged: 16,
      rbacUsernameProvisioned: 'sr.almaz',
      accountRoleAssigned: 'nurse',
    },
    {
      staffId: 'stf-03',
      fullName: 'Ato Yohannes Girma',
      clinicalCadre: 'PHARMACIST',
      trainingCompletionDate: '2026-10-08',
      competencyExamScorePercentage: 90,
      passedCompetencyExam: true,
      supervisedPracticeHoursLogged: 16,
      rbacUsernameProvisioned: 'pharm.yohannes',
      accountRoleAssigned: 'pharmacist',
    },
    {
      staffId: 'stf-04',
      fullName: 'Sr. Hiwot Tefera',
      clinicalCadre: 'LAB_TECHNICIAN',
      trainingCompletionDate: '2026-10-08',
      competencyExamScorePercentage: 88,
      passedCompetencyExam: true,
      supervisedPracticeHoursLogged: 14,
      rbacUsernameProvisioned: 'lab.hiwot',
      accountRoleAssigned: 'lab_technician',
    },
  ],
  allAccountsProvisionedWithRBAC: true,
  trainingDirectorSignoffRef: 'CERT-TRAIN-BISHAN-2026-10-A',
};
service.closeBlocker4WorkforceCompetency(validWorkforceEvidence, 'Training Director');
const blk4 = service.getBlocker('BLOCKER_4_WORKFORCE_COMPETENCY');
assert(blk4?.status === 'VERIFIED_CLOSED', 'Blocker 4 status is VERIFIED_CLOSED');

// ----------------------------------------------------------------------------
// 8. BLOCKER 5: PHYSICAL ON-SITE SAT (17 CATEGORIES)
// ----------------------------------------------------------------------------
console.log('\n--- 8. Blocker 5 — Physical On-Site SAT Execution ---');
const all17Categories: SatCategory[] = [
  'IDENTITY',
  'ENCOUNTER',
  'CLINICAL',
  'LABORATORY',
  'RADIOLOGY',
  'MEDICATION',
  'PHARMACY',
  'EMERGENCY',
  'REFERRAL',
  'OFFLINE',
  'SYNCHRONIZATION',
  'SECURITY',
  'INTEROPERABILITY',
  'BACKUP',
  'RESTORE',
  'REPORTING',
  'AI_GOVERNANCE',
];

// Fail-closed test: only 16 categories executed
let satFailClosed = false;
try {
  service.closeBlocker5PhysicalOnSiteSat(
    {
      testingStartDate: '2026-10-09',
      testingEndDate: '2026-10-09',
      facilityLocation: 'Bishan Dimo',
      leadAssessorName: 'Dr. Neema Kweka',
      all17CategoriesPassed: false,
      totalCategoryResults: all17Categories.slice(0, 16).map((cat, i) => ({
        category: cat,
        testCaseId: `TC-${i}`,
        executionTimestamp: '2026-10-09T10:00:00Z',
        physicalTabletId: 'TAB-01',
        fieldTesterName: 'Dr. Tadesse',
        testResult: 'PASS',
        actualObservedBehavior: 'Pass',
        offlinePersistenceVerified: true,
        sha256ProofHash: 'hash',
      })),
      satCompletionCertificateRef: 'CERT-01',
    },
    'Lead Assessor'
  );
} catch (e) {
  satFailClosed = true;
}
assert(satFailClosed, 'HARD INVARIANT: Blocker 5 fails closed if fewer than 17 categories executed');

// Successful closure: all 17 categories execute on-site and pass
const validSatRecords: OnSiteSatVerificationRecord[] = all17Categories.map((cat, idx) => ({
  category: cat,
  testCaseId: `SAT-FIELD-${String(idx + 1).padStart(2, '0')}-${cat}`,
  executionTimestamp: '2026-10-09T10:00:00Z',
  physicalTabletId: 'TAB-ETH-001',
  fieldTesterName: 'Dr. Tadesse Bekele & Dawit Abebe',
  testResult: 'PASS',
  actualObservedBehavior: `Field execution on physical rugged tablet: ${cat} executed offline with zero error.`,
  offlinePersistenceVerified: true,
  sha256ProofHash: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
}));

const validSatEvidence: PhysicalOnSiteSatEvidence = {
  testingStartDate: '2026-10-09',
  testingEndDate: '2026-10-09',
  facilityLocation: 'Bishan Dimo Primary Hospital, Adama Rural',
  leadAssessorName: 'Dr. Neema Kweka (CSO) & Lead Quality Assessor',
  all17CategoriesPassed: true,
  totalCategoryResults: validSatRecords,
  satCompletionCertificateRef: 'SAT-CERT-BISHAN-2026-17CAT-PASS',
};
service.closeBlocker5PhysicalOnSiteSat(validSatEvidence, 'Lead Assessor');
const blk5 = service.getBlocker('BLOCKER_5_PHYSICAL_ONSITE_SAT');
assert(blk5?.status === 'VERIFIED_CLOSED', 'Blocker 5 status is VERIFIED_CLOSED');
assert(blk5?.evidenceArtifacts[0].verificationLevel === 'SITE_ACCEPTED', 'Blocker 5 evidence verification level is SITE_ACCEPTED');

// ----------------------------------------------------------------------------
// 9. GO/NO-GO MOBILIZATION BOARD & DUAL HUMAN SIGN-OFF GATES
// ----------------------------------------------------------------------------
console.log('\n--- 9. Go/No-Go Decision Gating & Dual Human Sign-Off ---');
// Test 1: All 5 blockers closed, but NO signatures -> Outcome MUST be READY_WITH_BLOCKERS
const decisionUnsigned = service.evaluateGoNoGoMobilization();
assert(decisionUnsigned.allBlockersClosed === true, 'All 5 blockers are verified closed');
assert(decisionUnsigned.outcome === 'READY_WITH_BLOCKERS', 'HARD INVARIANT: Outcome is READY_WITH_BLOCKERS without dual human signatures');

// Test 2: CSO signed, but Facility Official unsigned -> Outcome MUST be READY_WITH_BLOCKERS
const decisionCsoOnly = service.evaluateGoNoGoMobilization(
  { signed: true, csoName: 'Dr. Neema Kweka', comments: 'Clinical safety verified.' },
  { signed: false, officialName: 'Ato Gemechu Bekele', comments: '' }
);
assert(decisionCsoOnly.outcome === 'READY_WITH_BLOCKERS', 'HARD INVARIANT: Outcome is READY_WITH_BLOCKERS without Facility Authorizing Official signature');

// Test 3: Dual sign-off provided (CSO + Facility Official) -> AUTHORIZED_FOR_LIMITED_GO_LIVE
const decisionDualSigned = service.evaluateGoNoGoMobilization(
  { signed: true, csoName: 'Dr. Neema Kweka', comments: 'Clinical Safety Case verified on site. Safe to proceed.' },
  { signed: true, officialName: 'Ato Gemechu Bekele', comments: 'Facility ready, MoA executed. Authorized for limited go-live.' }
);
assert(decisionDualSigned.outcome === 'AUTHORIZED_FOR_LIMITED_GO_LIVE', 'DECISION GATE: Dual human authorization promotes outcome to AUTHORIZED_FOR_LIMITED_GO_LIVE');
assert(decisionDualSigned.clinicalSafetyOfficerSignoff.signed === true, 'CSO signature confirmed on decision dossier');
assert(decisionDualSigned.facilityAuthorizingOfficialSignoff.signed === true, 'Facility official signature confirmed on decision dossier');

// ----------------------------------------------------------------------------
// 10. SEALED MOBILIZATION DOSSIER PACKAGE GENERATION
// ----------------------------------------------------------------------------
console.log('\n--- 10. Sealed Mobilization Dossier Export & Provenance ---');
const dossierPkg = service.generateMobilizationDossierPackage(decisionDualSigned);
assert(!!dossierPkg, 'Mobilization dossier package generated');
assert(dossierPkg.databaseStoreCount === 362, 'Dossier confirms exact 362 IndexedDB stores');
assert(dossierPkg.baselineFrozen === true, 'Dossier confirms baseline frozen');
assert(dossierPkg.cryptographicDossierSha256.startsWith('mob_sha256_'), 'Dossier sealed with cryptographic SHA-256 hash');
assert(dossierPkg.statutoryDisclaimer === TRACK4_STATUTORY_DISCLAIMER, 'Statutory disclaimer embedded in sealed dossier');
assert(dossierPkg.explicitRealityAffirmations.length >= 4, 'Explicit reality affirmations present in dossier');

// ----------------------------------------------------------------------------
// 11. PRESERVATION OF 362 INDEXEDDB STORES BASELINE
// ----------------------------------------------------------------------------
console.log('\n--- 11. Baseline Preservation Audit ---');
assert(ALL_STORE_NAMES.length === 362, `Final store count remains exact 362 stores (actual: ${ALL_STORE_NAMES.length})`);

console.log('\n================================================================');
if (failed === 0) {
  console.log(`ALL POST-CORE TRACK 4 TESTS PASSED: ${passed} assertions verified`);
  console.log('================================================================\n');
} else {
  console.error(`POST-CORE TRACK 4 TESTS FAILED: ${failed} failures, ${passed} passed`);
  console.log('================================================================\n');
  process.exit(1);
}
