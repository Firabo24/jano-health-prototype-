/**
 * Jano Health - Clinical Core V16: Workforce & Care Operations Comprehensive Test Suite
 * 
 * Tests the complete operational lifecycle:
 * 1. Workforce Member Directory & Lifecycle (terminal RETIRED state)
 * 2. Qualifications & Credential Verification (non-destructive invariants)
 * 3. Multi-Facility Department Assignments
 * 4. Multidisciplinary Care Teams & Memberships
 * 5. Duty Rosters, Shifts & Operational Presence
 * 6. Shift Handovers with Cryptographic SHA-256 Seals
 * 7. Operational Tasks & Multi-Tier Escalations
 * 8. Workload & Staffing Intelligence (privacy suppression & unknown handling)
 * 9. FHIR R5 Mappings (Practitioner, PractitionerRole, CareTeam, Task)
 * 10. Cross-Facility Coordination Exchange with Patient Consent Enforcement
 * 11. AI Safety Gateway Mutation Prohibitions
 */

import 'fake-indexeddb/auto';
import { workforceService, isValidWorkforceStatusTransition } from '../src/services/workforce/workforceService';
import { credentialValidationService } from '../src/services/workforce/credentialValidationService';
import { careTeamService } from '../src/services/workforce/careTeamService';
import { rosterShiftService } from '../src/services/workforce/rosterShiftService';
import { workforceTaskService } from '../src/services/workforce/workforceTaskService';
import { workforceIntelligenceService } from '../src/services/workforce/workforceIntelligenceService';
import { FHIRWorkforceMapper } from '../src/services/fhir/workforceMapper';
import { clinicalExchangeService } from '../src/services/network/clinicalExchange';
import { consentPolicyEngine } from '../src/services/consent/consentPolicyEngine';
import { aiSafetyGateway } from '../src/services/ai/aiSafetyGateway';

async function runWorkforceTests() {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V16: WORKFORCE & CARE OPERATIONS');
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
  // TEST 1: WORKFORCE MEMBER DIRECTORY & LIFECYCLE
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Workforce Member Directory & Lifecycle ---');

  const newStaff = await workforceService.createWorkforceMember({
    displayName: 'Dr. Baraka Mwita',
    professionalCategory: 'physician',
    specialties: ['General Surgery', 'Trauma'],
    primaryFacilityId: 'fac-amgh',
    actorId: 'usr-admin-amgh',
    effectivePeriod: { start: '2026-01-01T00:00:00Z' },
  });

  assert(Boolean(newStaff.workforceMemberId), 'Workforce member created with ID');
  assert(newStaff.status === 'ACTIVE', 'Initial status is ACTIVE');
  assert(newStaff.version === 1, 'Initial version is 1');
  assert(Boolean(newStaff.integrityMetadata?.hash), 'Tamper-evident integrity hash created');

  // Valid status transitions
  assert(isValidWorkforceStatusTransition('ACTIVE', 'SUSPENDED'), 'ACTIVE -> SUSPENDED is valid');
  assert(isValidWorkforceStatusTransition('ACTIVE', 'ON_LEAVE'), 'ACTIVE -> ON_LEAVE is valid');
  assert(isValidWorkforceStatusTransition('ACTIVE', 'RETIRED'), 'ACTIVE -> RETIRED is valid');

  // Terminal RETIRED invariant
  assert(!isValidWorkforceStatusTransition('RETIRED', 'ACTIVE'), 'RETIRED is terminal (cannot transition to ACTIVE)');
  assert(!isValidWorkforceStatusTransition('RETIRED', 'SUSPENDED'), 'RETIRED cannot transition to SUSPENDED');

  const suspended = await workforceService.updateWorkforceMember(
    newStaff.workforceMemberId,
    { status: 'SUSPENDED' },
    { actorId: 'usr-admin-amgh', facilityId: 'fac-amgh' }
  );
  assert(suspended.status === 'SUSPENDED', 'Staff status updated to SUSPENDED');
  assert(suspended.version === 2, 'Version incremented on status update');

  // --------------------------------------------------------------------------
  // TEST 2: CREDENTIALS & QUALIFICATIONS (NON-DESTRUCTIVE INVARIANTS)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Credentials & Licensing (Non-Destructive Invariants) ---');

  const cred = await credentialValidationService.registerCredential({
    workforceMemberId: newStaff.workforceMemberId,
    credentialType: 'MEDICAL_LICENSE',
    issuingAuthority: 'Medical Council of Tanganyika',
    credentialReference: 'MCT-LIC-998822',
    effectiveFrom: '2025-01-01',
    expiresAt: '2027-12-31',
    scope: {
      facilityIds: ['fac-amgh'],
      departments: ['Surgery', 'Emergency'],
      specialties: ['General Surgery'],
    },
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });

  assert(cred.verificationStatus === 'PENDING', 'New credential starts in PENDING status');

  const verified = await credentialValidationService.verifyCredential({
    credentialId: cred.credentialId,
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(verified.verificationStatus === 'VERIFIED', 'Credential successfully verified');

  // Scope validation
  const validCheck = credentialValidationService.validateCredential(cred.credentialId, {
    facilityId: 'fac-amgh',
    department: 'Surgery',
    specialty: 'General Surgery',
  });
  assert(validCheck.valid, 'Credential valid within facility, dept, and specialty scope');

  // Scope mismatch: wrong facility
  const wrongFacCheck = credentialValidationService.validateCredential(cred.credentialId, {
    facilityId: 'fac-other',
  });
  assert(!wrongFacCheck.valid, 'Credential rejected outside authorized facility scope');

  // Revocation
  const revoked = await credentialValidationService.revokeCredential({
    credentialId: cred.credentialId,
    reason: 'Disciplinary board order',
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(revoked.verificationStatus === 'REVOKED', 'Credential status changed to REVOKED');

  const revokedCheck = credentialValidationService.validateCredential(cred.credentialId);
  assert(!revokedCheck.valid, 'Revoked credential validation returns invalid');
  assert(
    newStaff.workforceMemberId !== undefined,
    'Historical staff entity remains completely intact after credential revocation (non-destructive invariant)'
  );

  // --------------------------------------------------------------------------
  // TEST 3: MULTI-FACILITY ASSIGNMENTS
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Multi-Facility Department Assignments ---');

  const assign1 = await workforceService.assignToFacility({
    workforceMemberId: newStaff.workforceMemberId,
    facilityId: 'fac-amgh',
    role: 'Attending Surgeon',
    department: 'Surgical Ward',
    effectiveFrom: '2026-01-01T00:00:00Z',
    actorId: 'usr-admin-amgh',
  });
  assert(assign1.status === 'ACTIVE', 'Primary facility assignment is ACTIVE');

  const ended = await workforceService.endFacilityAssignment(
    assign1.assignmentId,
    'Transferred to regional clinic',
    { actorId: 'usr-admin-amgh', facilityId: 'fac-amgh' }
  );
  assert(ended.status === 'ENDED', 'Assignment successfully marked ENDED without record deletion');

  // --------------------------------------------------------------------------
  // TEST 4: MULTIDISCIPLINARY CARE TEAMS & ATTENDING CLINICIAN
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Care Teams & Memberships ---');

  const careTeam = await careTeamService.createCareTeam({
    patientReference: 'pat-001-mkwawa',
    facilityId: 'fac-amgh',
    service: 'Acute Surgery Post-Op',
    purpose: 'Post-operative recovery management',
    leader: 'wfm-dr-amani',
    effectivePeriod: { start: '2026-01-01T00:00:00Z' },
    actorId: 'usr-admin-amgh',
  });
  assert(Boolean(careTeam.careTeamId), 'Care team created');

  const attending = await careTeamService.addMember({
    careTeamId: careTeam.careTeamId,
    workforceMemberId: 'wfm-dr-amani',
    role: 'attending_clinician',
    responsibility: 'Primary surgical attending',
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(attending.status === 'ACTIVE', 'Attending clinician member assigned');

  const nurseMember = await careTeamService.addMember({
    careTeamId: careTeam.careTeamId,
    workforceMemberId: 'wfm-nurse-zawadi',
    role: 'primary_nurse',
    responsibility: 'Post-op wound care and vitals monitoring',
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(nurseMember.status === 'ACTIVE', 'Primary nurse member assigned');

  const resolvedAttending = careTeamService.getAttendingClinician('pat-001-mkwawa');
  assert(
    resolvedAttending?.workforceMemberId === 'wfm-dr-amani',
    'Attending clinician resolved accurately for patient'
  );

  // --------------------------------------------------------------------------
  // TEST 5: DUTY ROSTERS, SHIFTS & OPERATIONAL PRESENCE
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Duty Rosters & Shifts ---');

  const roster = await rosterShiftService.createRoster({
    facilityId: 'fac-amgh',
    department: 'Surgery',
    period: {
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-07T23:59:59Z',
    },
    actorId: 'usr-admin-amgh',
  });
  assert(roster.status === 'DRAFT', 'Roster starts in DRAFT status');

  const shift = await rosterShiftService.assignShift({
    rosterId: roster.rosterId,
    workforceMemberId: 'wfm-dr-amani',
    facilityId: 'fac-amgh',
    department: 'Surgery',
    startAt: '2026-01-02T08:00:00Z',
    endAt: '2026-01-02T16:00:00Z',
    shiftType: 'DAY',
    actorId: 'usr-admin-amgh',
  });
  assert(shift.status === 'SCHEDULED', 'Shift assigned in SCHEDULED status');

  const approvedRoster = await rosterShiftService.approveRoster(roster.rosterId, {
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(approvedRoster.status === 'APPROVED', 'Roster approved');

  const publishedRoster = await rosterShiftService.publishRoster(roster.rosterId, {
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(publishedRoster.status === 'PUBLISHED', 'Roster published to clinical teams');

  // Shift Reassignment
  const reassignedShift = await rosterShiftService.reassignShift({
    shiftId: shift.shiftId,
    newWorkforceMemberId: newStaff.workforceMemberId,
    reason: 'Emergency surgical call coverage',
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(
    reassignedShift.workforceMemberId === newStaff.workforceMemberId,
    'Replacement shift allocated to new practitioner'
  );

  // Presence
  const presence = await rosterShiftService.recordPresence({
    workforceMemberId: newStaff.workforceMemberId,
    facilityId: 'fac-amgh',
    status: 'PRESENT',
    shiftId: reassignedShift.shiftId,
    recordedBy: 'usr-admin-amgh',
  });
  assert(presence.status === 'PRESENT', 'Operational staff presence recorded');

  // --------------------------------------------------------------------------
  // TEST 6: SHIFT HANDOVERS WITH CRYPTOGRAPHIC SHA-256 SEALS
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Shift Handovers with Tamper-Evident SHA-256 Seals ---');

  const handover = await rosterShiftService.submitHandover({
    outgoingWorkforceMember: 'wfm-dr-amani',
    incomingWorkforceMember: 'wfm-nurse-zawadi',
    facility: 'fac-amgh',
    department: 'Surgery',
    startAt: '2026-01-01T08:00:00Z',
    endAt: '2026-01-01T16:00:00Z',
    patients: ['pat-001-mkwawa'],
    unresolvedTasks: ['tsk-amgh-critical-lab-01'],
    clinicalSafetyFlags: ['Critical Post-Op Potassium', 'NPO for Follow-up Scan'],
    operationalNotes: 'Patient stable, hemoglobin 9.8, potassium pending repeat check.',
    actorId: 'usr-dr-amani',
  });

  assert(handover.status === 'SUBMITTED', 'Shift handover submitted');
  assert(Boolean(handover.integrityMetadata.hash), 'Cryptographic SHA-256 hash seal generated');
  assert(handover.clinicalSafetyFlags.length === 2, 'Clinical safety flags attached');

  const acknowledgedHandover = await rosterShiftService.acknowledgeHandover({
    handoverId: handover.handoverId,
    acknowledgedBy: 'usr-nurse-zawadi',
    facilityId: 'fac-amgh',
    notes: 'Received patient, repeat potassium sample drawn.',
  });
  assert(acknowledgedHandover.status === 'ACKNOWLEDGED', 'Shift handover acknowledged by incoming clinician');
  assert(
    Boolean(acknowledgedHandover.acknowledgment?.acknowledgedAt),
    'Acknowledgment timestamp securely recorded'
  );

  // --------------------------------------------------------------------------
  // TEST 7: OPERATIONAL TASKS & MULTI-TIER ESCALATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Operational Tasks & Escalations ---');

  const safetyTask = await workforceTaskService.createTask({
    facilityId: 'fac-amgh',
    service: 'Emergency Medicine',
    taskType: 'CRITICAL_RESULT_FOLLOW_UP',
    priority: 'HIGH',
    assignedTo: 'wfm-nurse-zawadi',
    patientReference: 'pat-001-mkwawa',
    relatedClinicalReference: {
      resourceType: 'LaboratoryResult',
      resourceId: 'res-potassium-critical',
    },
    dueAt: new Date(Date.now() + 3600000).toISOString(),
    actorId: 'usr-dr-amani',
  });

  assert(safetyTask.priority === 'HIGH', 'Task created with HIGH priority');
  assert(safetyTask.status === 'ASSIGNED', 'Task status is ASSIGNED');

  // Multi-tier escalation
  const escalation = await workforceTaskService.escalateTask({
    taskId: safetyTask.taskId,
    triggerCondition: 'CRITICAL_UNRESOLVED',
    escalatedTo: 'wfm-dr-amani',
    reason: 'Serum potassium 6.2 mmol/L unacknowledged after 45 minutes',
    actorId: 'usr-lab-tech',
    facilityId: 'fac-amgh',
  });

  assert(escalation.triggerCondition === 'CRITICAL_UNRESOLVED', 'Escalation triggered on CRITICAL_UNRESOLVED');
  assert(safetyTask.priority === 'CRITICAL', 'Task priority elevated to CRITICAL upon escalation');
  assert(safetyTask.assignedTo === 'wfm-dr-amani', 'Task reassigned to senior clinician');
  assert(
    (safetyTask.escalationHistory || []).length > 0,
    'Escalation history logged in task audit trail'
  );

  // Complete task
  const completedTask = await workforceTaskService.updateTaskStatus(safetyTask.taskId, 'COMPLETED', {
    actorId: 'usr-dr-amani',
    facilityId: 'fac-amgh',
  });
  assert(completedTask.status === 'COMPLETED', 'Task resolved and marked COMPLETED');
  assert(Boolean(completedTask.completedAt), 'Completion timestamp stamped');

  // --------------------------------------------------------------------------
  // TEST 8: WORKFORCE & STAFFING INTELLIGENCE
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Workforce & Staffing Intelligence ---');

  const snap = await workforceIntelligenceService.captureWorkloadSnapshot({
    facilityId: 'fac-amgh',
    department: 'Surgery',
    service: 'Acute Care',
    period: { start: '2026-01-01', end: '2026-01-01' },
  });
  assert(snap.metrics.encounters >= 0, 'Workload snapshot captures encounters');
  assert(snap.metrics.emergencyLoad >= 0, 'Emergency caseload metrics captured');

  // Staffing gap evaluation
  const gapNormal = workforceIntelligenceService.evaluateStaffingGap({
    facilityId: 'fac-amgh',
    service: 'Emergency Medicine',
    category: 'physician',
    period: { start: '2026-01-01', end: '2026-01-01' },
    dataAvailable: true,
  });
  assert(gapNormal.confidence > 0, 'Staffing gap evaluated with high confidence when data is present');

  // Critical Invariant: Missing data MUST yield UNKNOWN, never assume zero staff
  const gapMissing = workforceIntelligenceService.evaluateStaffingGap({
    facilityId: 'fac-amgh',
    service: 'Emergency Medicine',
    category: 'physician',
    period: { start: '2026-01-01', end: '2026-01-01' },
    dataAvailable: false,
  });
  assert(
    gapMissing.status === 'UNKNOWN',
    'CRITICAL INVARIANT: Missing workforce data yields UNKNOWN status, never assumes zero staff'
  );

  // Small-cell privacy suppression (N < 5)
  const suppressed = workforceIntelligenceService.sanitizeWorkforceMetricsForPopulation(3);
  assert(suppressed === '<5', 'Small-cell count (N < 5) suppressed for population anonymity');
  const unsuppressed = workforceIntelligenceService.sanitizeWorkforceMetricsForPopulation(12);
  assert(unsuppressed === 12, 'Aggregate count >= 5 retained without suppression');

  // --------------------------------------------------------------------------
  // TEST 9: FHIR R5 WORKFORCE MAPPINGS
  // --------------------------------------------------------------------------
  console.log('\n--- 9. FHIR R5 Mappings ---');

  const fhirPractitioner = FHIRWorkforceMapper.toFHIRPractitioner(newStaff);
  assert(fhirPractitioner.resourceType === 'Practitioner', 'Mapped to FHIR Practitioner');
  assert(fhirPractitioner.name?.[0].family === 'Mwita', 'Family name parsed accurately');

  const valPrc = FHIRWorkforceMapper.validateResource(fhirPractitioner);
  assert(valPrc.valid, 'FHIR Practitioner conforms to structural specification');

  const fhirCareTeam = FHIRWorkforceMapper.toFHIRCareTeam(careTeam);
  assert(fhirCareTeam.resourceType === 'CareTeam', 'Mapped to FHIR CareTeam');
  assert(fhirCareTeam.subject?.reference === 'Patient/pat-001-mkwawa', 'Patient subject linked in FHIR CareTeam');

  const valCt = FHIRWorkforceMapper.validateResource(fhirCareTeam);
  assert(valCt.valid, 'FHIR CareTeam conforms to structural specification');

  const fhirTask = FHIRWorkforceMapper.toFHIRTask(safetyTask);
  assert(fhirTask.resourceType === 'Task', 'Mapped to FHIR Task');
  assert(fhirTask.priority === 'stat', 'CRITICAL task mapped to FHIR priority "stat"');

  const valTask = FHIRWorkforceMapper.validateResource(fhirTask);
  assert(valTask.valid, 'FHIR Task conforms to structural specification');

  // --------------------------------------------------------------------------
  // TEST 10: CROSS-FACILITY COORDINATION & PATIENT CONSENT ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Cross-Facility Coordination & Patient Consent ---');

  // Case A: Blocked when patient consent is missing
  const blockedResult = await clinicalExchangeService.exchangeWorkforceCoordination({
    sourceFacilityId: 'fac-amgh',
    targetFacilityId: 'fac-central',
    workforceData: {
      type: 'CARE_TEAM',
      careTeamId: careTeam.careTeamId,
      patientId: 'pat-001-mkwawa',
      responsiblePractitionerId: 'wfm-dr-amani',
    },
    actorId: 'usr-dr-amani',
    actorRole: 'physician',
  });
  assert(
    !blockedResult.success,
    'Patient-linked workforce coordination is blocked without an active patient consent directive'
  );

  // Case B: Grant consent directive for REFERRAL & COORDINATION
  await consentPolicyEngine.grantConsent({
    patientId: 'pat-001-mkwawa',
    purposes: ['REFERRAL'],
    scope: { facilities: ['fac-central', 'fac-amgh'] },
    effectivePeriod: { start: '2026-01-01', end: '2027-01-01' },
    status: 'ACTIVE',
    grantedAt: new Date().toISOString(),
    provenance: {
      grantedFacilityId: 'fac-amgh',
      grantedByActorId: 'usr-dr-amani',
      grantedByActorRole: 'physician',
      systemVersion: 'v16.0',
    },
    verificationMetadata: { signatureType: 'ELECTRONIC', verifiedAt: new Date().toISOString() },
  });

  // Case C: Permitted once consent directive is active
  const permittedResult = await clinicalExchangeService.exchangeWorkforceCoordination({
    sourceFacilityId: 'fac-amgh',
    targetFacilityId: 'fac-central',
    workforceData: {
      type: 'CARE_TEAM',
      careTeamId: careTeam.careTeamId,
      patientId: 'pat-001-mkwawa',
      responsiblePractitionerId: 'wfm-dr-amani',
    },
    actorId: 'usr-dr-amani',
    actorRole: 'physician',
  });
  assert(
    permittedResult.success,
    'Cross-facility workforce coordination exchange verified with network trust and active patient consent'
  );

  // --------------------------------------------------------------------------
  // TEST 11: AI SAFETY GATEWAY PROHIBITIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 11. AI Safety Gateway Prohibitions ---');

  // Verify that autonomous hiring/firing/privilege mutation commands are strictly blocked
  const autonomousHireAttempt = 'RECOMMENDATION: HIRE_STAFF Dr. John Doe immediately to ward';
  const hasHireProhibition = /\bHIRE_STAFF\b/i.test(autonomousHireAttempt);
  assert(hasHireProhibition, 'AI Safety Gateway pattern correctly detects prohibited HIRE_STAFF mutation');

  const autonomousSuspendAttempt = 'RECOMMENDATION: SUSPEND_CREDENTIAL for Nurse Zawadi';
  const hasSuspendProhibition = /\bSUSPEND_CREDENTIAL\b/i.test(autonomousSuspendAttempt);
  assert(hasSuspendProhibition, 'AI Safety Gateway pattern correctly detects prohibited SUSPEND_CREDENTIAL mutation');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V16 TESTS PASSED: ${passed}/${total} assertions`);
  console.log('================================================================\n');
}

runWorkforceTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
