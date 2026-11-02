/**
 * Jano Health - Multi-Role Security & Identity Boundary Test Suite
 *
 * Verifies that:
 * 1. Production authentication fails closed (no synthetic demo identity without explicit dev config).
 * 2. Role capabilities are authoritatively derived from ROLE_DEFINITIONS via getRoleCapabilities.
 * 3. Strict separation of clinical, diagnostic, dispensary, and administrative duties.
 * 4. Development auth adapter cannot forge production credentials or bypass server authMiddleware.
 * 5. Role checking functions correctly support both dot and colon capability notations.
 */

import assert from 'node:assert';
import { CANONICAL_DEMO_USERS } from '../src/config/demoUsers';
import {
  ROLE_DEFINITIONS,
  getRoleCapabilities,
  hasCapability,
  canUserPerform,
  isPhysician,
  isNurse,
  isPharmacist,
  isLaboratoryScientist,
  isRadiographer,
  isFacilityAdmin,
} from '../src/domain/permissions';
import { authenticateRequest } from '../server/authMiddleware';
import { LocalDevelopmentAuthAdapter, FirebaseAuthAdapter } from '../src/services/security/authAdapter';

async function runMultiRoleSecurityTestSuite() {
  console.log('\n=============================================================');
  console.log('JANO HEALTH - MULTI-ROLE SECURITY & IDENTITY BOUNDARY TESTS');
  console.log('=============================================================\n');

  let passed = 0;

  // -------------------------------------------------------------------------
  // Test 1: Canonical Demo Users capabilities derived from getRoleCapabilities
  // -------------------------------------------------------------------------
  console.log('Test 1: Verifying canonical demo users match getRoleCapabilities...');
  for (const user of CANONICAL_DEMO_USERS) {
    const expectedCaps = getRoleCapabilities(user.role);
    assert.deepStrictEqual(
      new Set(user.capabilities),
      new Set(expectedCaps),
      `User ${user.fullName} (${user.role}) capabilities do not match getRoleCapabilities`
    );
  }
  passed++;
  console.log('  ✓ Passed Test 1: All demo users correctly inherit role capabilities.');

  // -------------------------------------------------------------------------
  // Test 2: Doctor (Clinical Officer / Physician) Authorization Boundary
  // -------------------------------------------------------------------------
  console.log('Test 2: Verifying Doctor clinical capabilities and boundaries...');
  const doctor = CANONICAL_DEMO_USERS.find((u) => u.role === 'physician')!;
  assert.ok(doctor, 'Doctor must exist in demo users');
  assert.ok(isPhysician(doctor.role), 'Doctor role check must pass');
  assert.ok(!isPharmacist(doctor.role), 'Doctor must not be flagged as pharmacist');

  // Doctor permissions
  assert.ok(canUserPerform(doctor, 'medication.prescribe'), 'Doctor must have medication.prescribe');
  assert.ok(canUserPerform(doctor, 'clinical:prescribe'), 'Doctor must have clinical:prescribe (colon notation)');
  assert.ok(canUserPerform(doctor, 'diagnosis.write'), 'Doctor must have diagnosis.write');
  assert.ok(canUserPerform(doctor, 'laboratory.order'), 'Doctor must have laboratory.order');
  assert.ok(canUserPerform(doctor, 'radiology.order'), 'Doctor must have radiology.order');
  assert.ok(canUserPerform(doctor, 'vitals.write'), 'Doctor must have vitals.write');
  assert.ok(canUserPerform(doctor, 'encounter.write'), 'Doctor must have encounter.write');

  // Boundaries: Doctor must NOT dispense medication, record lab results, or perform administrative overrides
  assert.ok(!canUserPerform(doctor, 'medication.dispense'), 'Doctor must NOT have medication.dispense');
  assert.ok(!canUserPerform(doctor, 'laboratory.result.write'), 'Doctor must NOT have laboratory.result.write');
  assert.ok(!canUserPerform(doctor, 'radiology.result.write'), 'Doctor must NOT have radiology.result.write');
  assert.ok(!canUserPerform(doctor, 'system.admin'), 'Doctor must NOT have system.admin');
  passed++;
  console.log('  ✓ Passed Test 2: Doctor clinical boundary verified.');

  // -------------------------------------------------------------------------
  // Test 3: Nurse Authorization Boundary
  // -------------------------------------------------------------------------
  console.log('Test 3: Verifying Nurse triage and bedside recording boundaries...');
  const nurse = CANONICAL_DEMO_USERS.find((u) => u.role === 'nurse')!;
  assert.ok(nurse, 'Nurse must exist');
  assert.ok(isNurse(nurse.role), 'Nurse role check must pass');

  // Nurse permissions
  assert.ok(canUserPerform(nurse, 'vitals.write'), 'Nurse must have vitals.write');
  assert.ok(canUserPerform(nurse, 'vitals:record'), 'Nurse must have vitals:record');
  assert.ok(canUserPerform(nurse, 'encounter.write'), 'Nurse must have encounter.write');
  assert.ok(canUserPerform(nurse, 'encounter.read'), 'Nurse must have encounter.read');

  // Boundaries: Nurse must NOT prescribe, diagnose, order radiology, or dispense
  assert.ok(!canUserPerform(nurse, 'medication.prescribe'), 'Nurse must NOT have medication.prescribe');
  assert.ok(!canUserPerform(nurse, 'clinical:prescribe'), 'Nurse must NOT have clinical:prescribe');
  assert.ok(!canUserPerform(nurse, 'diagnosis.write'), 'Nurse must NOT have diagnosis.write');
  assert.ok(!canUserPerform(nurse, 'radiology.order'), 'Nurse must NOT have radiology.order');
  assert.ok(!canUserPerform(nurse, 'medication.dispense'), 'Nurse must NOT have medication.dispense');
  assert.ok(!canUserPerform(nurse, 'system.admin'), 'Nurse must NOT have system.admin');
  passed++;
  console.log('  ✓ Passed Test 3: Nurse clinical boundary verified.');

  // -------------------------------------------------------------------------
  // Test 4: Pharmacist Authorization Boundary
  // -------------------------------------------------------------------------
  console.log('Test 4: Verifying Pharmacist dispensary boundary...');
  const pharmacist = CANONICAL_DEMO_USERS.find((u) => u.role === 'pharmacist')!;
  assert.ok(pharmacist, 'Pharmacist must exist');
  assert.ok(isPharmacist(pharmacist.role), 'Pharmacist role check must pass');

  // Pharmacist permissions
  assert.ok(canUserPerform(pharmacist, 'medication.dispense'), 'Pharmacist must have medication.dispense');
  assert.ok(canUserPerform(pharmacist, 'pharmacy:dispense'), 'Pharmacist must have pharmacy:dispense');

  // Boundaries: Pharmacist must NOT prescribe or write clinical SOAP notes
  assert.ok(!canUserPerform(pharmacist, 'medication.prescribe'), 'Pharmacist must NOT have medication.prescribe');
  assert.ok(!canUserPerform(pharmacist, 'encounter.write'), 'Pharmacist must NOT have encounter.write');
  assert.ok(!canUserPerform(pharmacist, 'diagnosis.write'), 'Pharmacist must NOT have diagnosis.write');
  passed++;
  console.log('  ✓ Passed Test 4: Pharmacist dispensary boundary verified.');

  // -------------------------------------------------------------------------
  // Test 5: Laboratory Technician Authorization Boundary
  // -------------------------------------------------------------------------
  console.log('Test 5: Verifying Laboratory Technician result entry boundary...');
  const labTech = CANONICAL_DEMO_USERS.find((u) => u.role === 'laboratory_staff')!;
  assert.ok(labTech, 'Lab tech must exist');
  assert.ok(isLaboratoryScientist(labTech.role), 'Lab scientist check must pass');

  // Lab tech permissions
  assert.ok(canUserPerform(labTech, 'laboratory.result.write'), 'Lab tech must have laboratory.result.write');
  assert.ok(canUserPerform(labTech, 'laboratory.result.read'), 'Lab tech must have laboratory.result.read');

  // Boundaries: Lab tech must NOT order lab tests, prescribe, or diagnose
  assert.ok(!canUserPerform(labTech, 'laboratory.order'), 'Lab tech must NOT order tests');
  assert.ok(!canUserPerform(labTech, 'medication.prescribe'), 'Lab tech must NOT prescribe');
  assert.ok(!canUserPerform(labTech, 'diagnosis.write'), 'Lab tech must NOT diagnose');
  passed++;
  console.log('  ✓ Passed Test 5: Laboratory technician boundary verified.');

  // -------------------------------------------------------------------------
  // Test 6: Radiographer Authorization Boundary
  // -------------------------------------------------------------------------
  console.log('Test 6: Verifying Radiographer reporting boundary...');
  const radiographer = CANONICAL_DEMO_USERS.find((u) => u.role === 'radiology_staff')!;
  assert.ok(radiographer, 'Radiologist must exist');
  assert.ok(isRadiographer(radiographer.role), 'Radiographer check must pass');

  // Radiographer permissions
  assert.ok(canUserPerform(radiographer, 'radiology.result.write'), 'Radiographer must have radiology.result.write');
  assert.ok(canUserPerform(radiographer, 'radiology.result.read'), 'Radiographer must have radiology.result.read');

  // Boundaries: Radiographer must NOT order imaging or prescribe medication
  assert.ok(!canUserPerform(radiographer, 'radiology.order'), 'Radiographer must NOT order imaging');
  assert.ok(!canUserPerform(radiographer, 'medication.prescribe'), 'Radiographer must NOT prescribe');
  passed++;
  console.log('  ✓ Passed Test 6: Radiographer boundary verified.');

  // -------------------------------------------------------------------------
  // Test 7: Facility Administrator Boundary
  // -------------------------------------------------------------------------
  console.log('Test 7: Verifying Facility Administrator governance boundary...');
  const admin = CANONICAL_DEMO_USERS.find((u) => u.role === 'facility_administrator')!;
  assert.ok(admin, 'Admin must exist');
  assert.ok(isFacilityAdmin(admin.role), 'Admin check must pass');

  // Admin permissions
  assert.ok(canUserPerform(admin, 'facility.manage'), 'Admin must have facility.manage');
  assert.ok(canUserPerform(admin, 'audit.read'), 'Admin must have audit.read');
  assert.ok(canUserPerform(admin, 'sync.manage'), 'Admin must have sync.manage');

  // Boundaries: Admin must NOT perform clinical care (prescribe, diagnose, enter lab results)
  assert.ok(!canUserPerform(admin, 'medication.prescribe'), 'Admin must NOT prescribe');
  assert.ok(!canUserPerform(admin, 'diagnosis.write'), 'Admin must NOT diagnose');
  assert.ok(!canUserPerform(admin, 'laboratory.result.write'), 'Admin must NOT record lab results');
  passed++;
  console.log('  ✓ Passed Test 7: Facility administrator boundary verified.');

  // -------------------------------------------------------------------------
  // Test 8: Dot and Colon capability normalization in canUserPerform
  // -------------------------------------------------------------------------
  console.log('Test 8: Verifying dual-notation normalization in canUserPerform...');
  assert.ok(canUserPerform(doctor, 'medication.prescribe'), 'Should match medication.prescribe');
  assert.ok(canUserPerform(doctor, 'medication:prescribe'), 'Should match medication:prescribe');
  assert.ok(canUserPerform(doctor, 'clinical:prescribe'), 'Should match clinical:prescribe');
  assert.ok(canUserPerform(doctor, 'clinical.prescribe'), 'Should match clinical.prescribe');
  assert.ok(canUserPerform(nurse, 'vitals.write'), 'Should match vitals.write');
  assert.ok(canUserPerform(nurse, 'vitals:record'), 'Should match vitals:record');
  passed++;
  console.log('  ✓ Passed Test 8: Capability normalization verified.');

  // -------------------------------------------------------------------------
  // Test 9: Production Auth fail-closed on unauthenticated requests
  // -------------------------------------------------------------------------
  console.log('Test 9: Verifying production auth fails closed on unauthorized requests...');
  process.env.NODE_ENV = 'production';
  const mockReq: any = {
    headers: {
      'x-user-id': 'usr-sarah-alemu',
      'x-facility-id': 'fac-arba-minch-general',
      authorization: 'Bearer dev-token-fake',
    },
    method: 'POST',
    path: '/api/v1/sync/push',
    query: {},
    body: {},
  };
  const mockRes: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  let nextInvoked = false;

  await authenticateRequest(mockReq, mockRes, () => {
    nextInvoked = true;
  });

  assert.strictEqual(nextInvoked, false, 'Next MUST NOT be called for unverified request in production');
  assert.strictEqual(mockRes.statusCode, 401, 'Dev tokens MUST be rejected with 401 in production');
  assert.ok(
    mockRes.body?.error === 'INVALID_CREDENTIALS' || mockRes.body?.error === 'PRODUCTION_AUTH_FAIL_CLOSED',
    'Must fail closed with invalid credentials or production auth fail-closed'
  );
  process.env.NODE_ENV = 'development';
  passed++;
  console.log('  ✓ Passed Test 9: Production auth rejects dev tokens fail-closed.');

  console.log('\n=============================================================');
  console.log(`ALL ${passed} MULTI-ROLE SECURITY TESTS PASSED PERFECTLY!`);
  console.log('=============================================================\n');
}

runMultiRoleSecurityTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
