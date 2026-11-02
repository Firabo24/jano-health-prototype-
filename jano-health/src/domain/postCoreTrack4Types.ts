/**
 * Jano Health — Post-Core Execution Track 4
 * FIRST-SITE MOBILIZATION & BLOCKER CLOSURE
 *
 * Types, models, lifecycles, and invariants for:
 * 1. Platform baseline freeze & 362 IndexedDB store protection
 * 2. Readiness dossier reconciliation & unearned claim elimination:
 *    - PLANNED vs DOCUMENTED vs APPROVED vs PHYSICALLY_VERIFIED vs SITE_ACCEPTED vs NOT_VERIFIED
 *    - Retention requirements source attribution (SOURCE_REQUIRED / UNDER_REVIEW / SOURCE_VERIFIED)
 * 3. 5-Blocker Closure Lifecycle:
 *    - BLOCKER 1: Facility Selection & Regional Health Bureau Authorization
 *    - BLOCKER 2: Clinical Safety Officer Formal Appointment & Hazard Governance
 *    - BLOCKER 3: Physical Infrastructure & Solar/LAN Environmental Commissioning
 *    - BLOCKER 4: Workforce Training, Competency Verification & User Provisioning
 *    - BLOCKER 5: Physical On-Site Site Acceptance Testing (17 Categories)
 * 4. Dual Human-Authorized Go/No-Go Mobilization Gate
 * 5. Sealed First-Site Mobilization Dossier & Truth-in-Advertising Disclaimers
 */

import { SatCategory } from './postCoreTrack3Types';

export const TRACK4_STATUTORY_DISCLAIMER =
  'Jano Health First-Site Mobilization & Blocker Closure Dossier: ' +
  'Prepared for Regional Health Bureau, Facility Governance, and Clinical Safety Leadership. ' +
  'Deployment is restricted to authorized offline district health centers. ' +
  'No clinical live cutover may occur without all 5 operational blockers verified closed, ' +
  'physical on-site SAT completed across all 17 categories, and dual sign-off from ' +
  'the designated Clinical Safety Officer and Facility Authorizing Official.';

// ============================================================================
// 1. EVIDENCE & VERIFICATION CLASSIFICATIONS
// ============================================================================

export type EvidenceVerificationLevel =
  | 'PLANNED'
  | 'DOCUMENTED'
  | 'APPROVED'
  | 'PHYSICALLY_VERIFIED'
  | 'SITE_ACCEPTED'
  | 'NOT_VERIFIED';

export type StatutoryRetentionSourceStatus =
  | 'SOURCE_REQUIRED'
  | 'UNDER_REVIEW'
  | 'SOURCE_APPROVED'
  | 'SOURCE_VERIFIED';

export interface ReconciledDossierItem {
  id: string;
  claimTopic: string;
  previousStatement: string;
  reconciledStatus: EvidenceVerificationLevel;
  authoritativeSourceOrDocRef?: string;
  justificationNotes: string;
  isExternallyMandatedStandard: boolean;
}

// ============================================================================
// 2. 5 BLOCKER DEFINITION & LIFECYCLE
// ============================================================================

export type BlockerId =
  | 'BLOCKER_1_FACILITY_AUTHORIZATION'
  | 'BLOCKER_2_CSO_APPOINTMENT'
  | 'BLOCKER_3_PHYSICAL_INFRASTRUCTURE'
  | 'BLOCKER_4_WORKFORCE_COMPETENCY'
  | 'BLOCKER_5_PHYSICAL_ONSITE_SAT';

export type BlockerLifecycleStatus =
  | 'OPEN'
  | 'IN_REMEDIATION'
  | 'EVIDENCE_SUBMITTED'
  | 'VERIFIED_CLOSED';

export interface BlockerEvidenceArtifact {
  id: string;
  title: string;
  documentReference: string;
  sha256Digest: string;
  submittedBy: string;
  submittedAt: string;
  verificationLevel: EvidenceVerificationLevel;
}

export interface BlockerClosureRecord {
  id: BlockerId;
  name: string;
  category: 'GOVERNANCE' | 'CLINICAL_SAFETY' | 'INFRASTRUCTURE' | 'WORKFORCE' | 'TESTING';
  status: BlockerLifecycleStatus;
  description: string;
  mandatoryVerificationCriteria: string[];
  evidenceArtifacts: BlockerEvidenceArtifact[];
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNotes?: string;
}

// ============================================================================
// 3. SPECIFIC BLOCKER CLOSURE EVIDENCE MODELS
// ============================================================================

/**
 * BLOCKER 1 Evidence: Facility Authorization
 */
export interface FacilityAuthorizationEvidence {
  facilityId: string;
  facilityName: string;
  facilityType: 'PRIMARY_HOSPITAL' | 'HEALTH_CENTER' | 'DISTRICT_CLINIC';
  region: string;
  zone: string;
  woreda: string;
  kebele: string;
  regionalHealthBureauMoARef: string;
  woredaHealthOfficePermitRef: string;
  authorizingOfficialName: string;
  authorizingOfficialTitle: string;
  authorizedDate: string;
  targetGoLiveWindow: {
    startDate: string;
    endDate: string;
  };
}

/**
 * BLOCKER 2 Evidence: Clinical Safety Officer Appointment
 */
export interface CsoAppointmentEvidence {
  csoName: string;
  qualification: string;
  licenseNumber: string;
  appointmentLetterRef: string;
  signedTermsOfReferenceRef: string;
  hazardLogReviewDate: string;
  clinicalSafetyCaseApprovalRef: string;
  appointedByTitle: string;
  effectiveDate: string;
}

/**
 * BLOCKER 3 Evidence: Physical Infrastructure Commissioning
 */
export interface InfrastructureCommissioningEvidence {
  commissioningDate: string;
  commissioningEngineer: string;
  solarInverterModel: string;
  solarInverterCapacityWatts: number;
  batteryModel: string;
  batteryCapacityKWh: number;
  measuredOffGridAutonomyHours: number;
  localHubDeviceSerial: string;
  localHubOsVersion: string;
  localNetworkSsid: string;
  wpa3SecurityConfirmed: boolean;
  isolatedClinicalVlanTag: number;
  enrolledTabletSerials: string[];
  powerFailureCutoverTestPassed: boolean;
  commissioningSignOffRef: string;
}

/**
 * BLOCKER 4 Evidence: Workforce Training & User Provisioning
 */
export interface StaffTrainingRecord {
  staffId: string;
  fullName: string;
  clinicalCadre: 'PHYSICIAN' | 'HEALTH_OFFICER' | 'NURSE' | 'PHARMACIST' | 'LAB_TECHNICIAN';
  trainingCompletionDate: string;
  competencyExamScorePercentage: number;
  passedCompetencyExam: boolean; // Must be >= 85%
  supervisedPracticeHoursLogged: number;
  rbacUsernameProvisioned: string;
  accountRoleAssigned: string;
}

export interface WorkforceReadinessEvidence {
  trainingProgramRef: string;
  totalClinicalStaffEnrolled: number;
  totalPassingCompetency: number;
  averageScorePercentage: number;
  staffRecords: StaffTrainingRecord[];
  allAccountsProvisionedWithRBAC: boolean;
  trainingDirectorSignoffRef: string;
}

/**
 * BLOCKER 5 Evidence: Physical On-Site SAT Execution (17 Categories)
 */
export interface OnSiteSatVerificationRecord {
  category: SatCategory;
  testCaseId: string;
  executionTimestamp: string;
  physicalTabletId: string;
  fieldTesterName: string;
  testResult: 'PASS' | 'FAIL' | 'BLOCKED';
  actualObservedBehavior: string;
  offlinePersistenceVerified: boolean;
  sha256ProofHash: string;
}

export interface PhysicalOnSiteSatEvidence {
  testingStartDate: string;
  testingEndDate: string;
  facilityLocation: string;
  leadAssessorName: string;
  all17CategoriesPassed: boolean;
  totalCategoryResults: OnSiteSatVerificationRecord[];
  satCompletionCertificateRef: string;
}

// ============================================================================
// 4. GO/NO-GO MOBILIZATION BOARD DECISION
// ============================================================================

export type MobilizationOutcome =
  | 'READY_WITH_BLOCKERS'
  | 'AUTHORIZED_FOR_LIMITED_GO_LIVE'
  | 'REJECTED_HALT_DEPLOYMENT';

export interface MobilizationBoardDecision {
  decisionId: string;
  evaluatedAt: string;
  outcome: MobilizationOutcome;
  allBlockersClosed: boolean;
  blockerSummary: {
    totalBlockers: 5;
    closedCount: number;
    openBlockerIds: BlockerId[];
  };
  reconciliationAuditConfirmed: boolean;
  clinicalSafetyOfficerSignoff: {
    signed: boolean;
    csoName: string;
    timestamp?: string;
    comments: string;
  };
  facilityAuthorizingOfficialSignoff: {
    signed: boolean;
    officialName: string;
    timestamp?: string;
    comments: string;
  };
  sealedDossierHash?: string;
  statutoryDisclaimer: string;
}

// ============================================================================
// 5. SEALED FIRST-SITE MOBILIZATION DOSSIER PACKAGE
// ============================================================================

export interface FirstSiteMobilizationDossierPackage {
  dossierId: string;
  generatedAt: string;
  databaseStoreCount: 362;
  baselineFrozen: true;
  facilityAuthorization: FacilityAuthorizationEvidence | null;
  csoAppointment: CsoAppointmentEvidence | null;
  infrastructureCommissioning: InfrastructureCommissioningEvidence | null;
  workforceReadiness: WorkforceReadinessEvidence | null;
  onSiteSatSummary: PhysicalOnSiteSatEvidence | null;
  reconciledReadinessAudit: ReconciledDossierItem[];
  blockerClosureRecords: BlockerClosureRecord[];
  boardDecision: MobilizationBoardDecision;
  cryptographicDossierSha256: string;
  explicitRealityAffirmations: string[];
  statutoryDisclaimer: string;
}
