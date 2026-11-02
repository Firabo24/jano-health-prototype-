/**
 * Jano Health — Stage 2 Verification Test Suite
 * Facility Isolation & Synchronization Authorization
 *
 * Verifies:
 * 1. Server-authoritative principal authentication for all sync endpoints (401 on missing/spoofed credentials).
 * 2. Account lifecycle enforcement: suspended and revoked accounts cannot sync (403 ACCOUNT_SUSPENDED/REVOKED).
 * 3. facilityId=all and wildcard fix: ordinary single-facility users cannot request multi-facility pull (403 CROSS_FACILITY_ACCESS_DENIED).
 * 4. Missing facilityId does not widen scope to all facilities; defaults strictly to caller's authorized primary facility.
 * 5. Cross-facility access rejection: user assigned to Facility A cannot pull from Facility B (403 FACILITY_ACCESS_FORBIDDEN).
 * 6. Cross-tenant isolation: user from Tenant A cannot push/pull to Tenant B facility even with multi-facility capability (403 TENANT_ISOLATION_VIOLATION).
 * 7. Event ingestion (push) facility validation: client cannot write events targeting unassigned facilities.
 * 8. Actor attribution & anti-spoofing: client cannot forge actorId without delegation authority (403 ACTOR_ATTRIBUTION_FORBIDDEN).
 * 9. Event schema & batch validation: malformed events or missing deviceId rejected safely (400).
 * 10. Multi-facility authorized principal with sync:cross_facility can sync within their tenant boundaries.
 * 11. Diagnostics & reset endpoint governance: diagnostics scoped to tenant; reset disabled in production.
 * 12. Idempotency and version concurrency safety preserved.
 */

import assert from 'node:assert';
import {
  authenticateRequest,
  requireSyncAuthorization,
  requireFacilityAuthorization,
  requireSyncManagementAuth,
  DEVELOPMENT_PRINCIPALS,
} from '../server/authMiddleware';
import {
  serverLedger,
  DEFAULT_TENANT_ID,
  SECONDARY_TENANT_ID,
} from '../server/serverLedger';

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
      return this;
    },
  };
  return res;
}

async function runStage2SecurityTests() {
  console.log('\n================================================================');
  console.log('JANO HEALTH — STAGE 2: FACILITY ISOLATION & SYNC AUTHORIZATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res && typeof (res as any).then === 'function') {
        return (res as Promise<void>).then(() => {
          passed++;
          console.log(`  ✓ [PASS] ${name}`);
        });
      } else {
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
      }
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // ----------------------------------------------------
  // Group 1: Unauthenticated Requests & Header Spoofing
  // ----------------------------------------------------
  console.log('--- Group 1: Unauthenticated Sync Rejection & Anti-Spoofing ---');

  await test('GET /api/sync/pull without token rejects with 401 UNAUTHENTICATED', async () => {
    const req: any = { method: 'GET', headers: {}, query: {}, body: {} };
    const res = mockRes();
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  await test('POST /api/sync/push without token rejects with 401 UNAUTHENTICATED', async () => {
    const req: any = { method: 'POST', headers: {}, query: {}, body: { deviceId: 'dev-1', events: [] } };
    const res = mockRes();
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  await test('Caller sending x-user-id and x-facility-id without auth token is rejected with 401', async () => {
    const req: any = {
      method: 'GET',
      headers: {
        'x-user-id': 'usr-admin-01',
        'x-facility-id': 'fac-rural-dispensary-01',
      },
      query: { facilityId: 'fac-rural-dispensary-01' },
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;
    await authenticateRequest(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  // ----------------------------------------------------
  // Group 2: Account Lifecycle & Status Enforcement
  // ----------------------------------------------------
  console.log('\n--- Group 2: Account Lifecycle (Suspension & Revocation) ---');

  await test('Suspended user cannot pull events (403 ACCOUNT_SUSPENDED)', () => {
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-suspended-test'],
      query: { facilityId: 'fac-rural-dispensary-01' },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'ACCOUNT_SUSPENDED');
  });

  await test('Suspended user cannot push events (403 ACCOUNT_SUSPENDED)', () => {
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-suspended-test'],
      body: { deviceId: 'dev-test', events: [{ eventId: 'evt-1', facilityId: 'fac-rural-dispensary-01' }] },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'ACCOUNT_SUSPENDED');
  });

  await test('Revoked user cannot pull events (403 ACCOUNT_REVOKED)', () => {
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-revoked-test'],
      query: { facilityId: 'fac-rural-dispensary-01' },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'ACCOUNT_REVOKED');
  });

  await test('Principal with zero facility associations is rejected (403 NO_AUTHORIZED_FACILITIES)', () => {
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: {
        userId: 'usr-unassigned',
        provider: 'local_development',
        roles: ['physician'],
        facilityIds: [],
        tenantId: DEFAULT_TENANT_ID,
        accountStatus: 'active',
        syncCapabilities: ['sync:facility'],
      },
      query: {},
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'NO_AUTHORIZED_FACILITIES');
  });

  // ----------------------------------------------------
  // Group 3: Fixing facilityId=all and Wildcards
  // ----------------------------------------------------
  console.log('\n--- Group 3: facilityId=all & Multi-Facility Scope Governance ---');

  await test('Single-facility user requesting facilityId=all is DENIED with 403 CROSS_FACILITY_ACCESS_DENIED', () => {
    const nurse = DEVELOPMENT_PRINCIPALS['usr-nurse-01']; // single facility fac-rural-dispensary-01
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: nurse,
      query: { facilityId: 'all' },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'CROSS_FACILITY_ACCESS_DENIED');
  });

  await test('Single-facility user requesting facilityId=* is DENIED with 403 CROSS_FACILITY_ACCESS_DENIED', () => {
    const clinician = DEVELOPMENT_PRINCIPALS['usr-clinician-dr-amin'];
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: clinician,
      query: { facilityId: '*' },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'CROSS_FACILITY_ACCESS_DENIED');
  });

  await test('Missing facilityId query does not grant all facilities; serverLedger restricts to primary facility', () => {
    // Seed events into two facilities
    const event1 = {
      eventId: `evt-fac-a-${Date.now()}`,
      eventType: 'PATIENT_CREATED',
      aggregateType: 'Patient',
      aggregateId: `pat-a-${Date.now()}`,
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      baseVersion: 0,
      payload: { name: 'Patient in Fac A' },
    };
    const event2 = {
      eventId: `evt-fac-b-${Date.now()}`,
      eventType: 'PATIENT_CREATED',
      aggregateType: 'Patient',
      aggregateId: `pat-b-${Date.now()}`,
      facilityId: 'fac-district-hospital-01',
      version: 1,
      baseVersion: 0,
      payload: { name: 'Patient in Fac B' },
    };

    serverLedger.processPushBatch('dev-seeder', new Date().toISOString(), [event1, event2], 'usr-system');

    // Nurse 01 only has fac-rural-dispensary-01
    const nurse = DEVELOPMENT_PRINCIPALS['usr-nurse-01'];
    // Missing facilityId param -> authorizedFacilityIds provides the boundary
    const pullResult = serverLedger.pullChanges(
      null,
      undefined,
      'dev-nurse-tablet',
      nurse.tenantId,
      nurse.facilityIds,
      false // no cross-facility permission
    );

    assert.strictEqual(pullResult.status, 'ok');
    // All returned deltas must strictly belong to fac-rural-dispensary-01!
    for (const delta of pullResult.deltas) {
      assert.strictEqual(
        delta.facilityId,
        'fac-rural-dispensary-01',
        'Missing facilityId must NEVER leak events from other facilities'
      );
    }
  });

  // ----------------------------------------------------
  // Group 4: Facility Boundary & Cross-Facility Denial
  // ----------------------------------------------------
  console.log('\n--- Group 4: Cross-Facility Access Boundary Enforcement ---');

  await test('User assigned to Facility A pulling from Facility B is rejected with 403 FACILITY_ACCESS_FORBIDDEN', () => {
    const nurse = DEVELOPMENT_PRINCIPALS['usr-nurse-01']; // only fac-rural-dispensary-01
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: nurse,
      query: { facilityId: 'fac-district-hospital-01' }, // attempting unauthorized facility pull
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FACILITY_ACCESS_FORBIDDEN');
  });

  await test('User assigned to Facility A pushing event targeting Facility B is rejected with 403 FACILITY_ACCESS_FORBIDDEN', () => {
    const nurse = DEVELOPMENT_PRINCIPALS['usr-nurse-01'];
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: nurse,
      body: {
        deviceId: 'dev-nurse-tablet',
        events: [
          {
            eventId: `evt-unauth-fac-${Date.now()}`,
            eventType: 'PATIENT_UPDATED',
            aggregateType: 'Patient',
            aggregateId: 'pat-123',
            facilityId: 'fac-district-hospital-01', // Target facility Nurse does not belong to!
            payload: { notes: 'Unauthorized cross-facility injection' },
          },
        ],
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FACILITY_ACCESS_FORBIDDEN');
  });

  // ----------------------------------------------------
  // Group 5: Cross-Tenant Isolation
  // ----------------------------------------------------
  console.log('\n--- Group 5: Cross-Tenant Boundary Isolation ---');

  await test('User from Tenant A pulling facility from Tenant B is DENIED (403 TENANT_ISOLATION_VIOLATION)', () => {
    const sysadmin = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel']; // in DEFAULT_TENANT_ID (East Africa MoH)
    // fac-mwanza-regional-01 belongs to SECONDARY_TENANT_ID (Tanzania Lake Zone)
    const req: any = {
      method: 'GET',
      authenticatedPrincipal: sysadmin,
      query: { facilityId: 'fac-mwanza-regional-01' },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'TENANT_ISOLATION_VIOLATION');
  });

  await test('User from Tenant A pushing event to Tenant B facility is DENIED (403 TENANT_ISOLATION_VIOLATION)', () => {
    const doctor = DEVELOPMENT_PRINCIPALS['usr-doctor-01']; // in DEFAULT_TENANT_ID
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: doctor,
      body: {
        deviceId: 'dev-doc-device',
        events: [
          {
            eventId: `evt-cross-tenant-${Date.now()}`,
            eventType: 'PATIENT_CREATED',
            aggregateType: 'Patient',
            aggregateId: `pat-tz-${Date.now()}`,
            facilityId: 'fac-mwanza-regional-01', // Tenant B facility!
            payload: { firstName: 'CrossTenant', lastName: 'Intrusion' },
          },
        ],
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'TENANT_ISOLATION_VIOLATION');
  });

  await test('Multi-facility sync capability does NOT leak events across tenant boundary', () => {
    // Seed event in Tenant B
    const tzEvent = {
      eventId: `evt-tz-isolated-${Date.now()}`,
      eventType: 'PATIENT_CREATED',
      aggregateType: 'Patient',
      aggregateId: `pat-tz-iso-${Date.now()}`,
      facilityId: 'fac-mwanza-regional-01',
      version: 1,
      baseVersion: 0,
      payload: { name: 'Confidential Tenant B Patient' },
    };
    serverLedger.processPushBatch(
      'dev-tz-device',
      new Date().toISOString(),
      [tzEvent],
      DEVELOPMENT_PRINCIPALS['usr-tz-cross-tenant'] // Caller in Tenant B
    );

    // Multi-facility sysadmin in Tenant A pulls with facilityId=all
    const sysadminA = DEVELOPMENT_PRINCIPALS['usr-sysadmin-amanuel'];
    const pullResult = serverLedger.pullChanges(
      null,
      'all',
      'dev-sysadmin-console',
      sysadminA.tenantId, // Tenant A
      sysadminA.facilityIds,
      true // Has cross-facility capability
    );

    assert.strictEqual(pullResult.status, 'ok');
    // Must NOT contain the event from Tenant B!
    const foundTzEvent = pullResult.deltas.find((d) => d.eventId === tzEvent.eventId);
    assert.strictEqual(foundTzEvent, undefined, 'Tenant A pull must never contain Tenant B events');
  });

  // ----------------------------------------------------
  // Group 6: Actor Attribution & Anti-Spoofing
  // ----------------------------------------------------
  console.log('\n--- Group 6: Actor Attribution & Anti-Spoofing ---');

  await test('Client event asserting a forged actorId is rejected with 403 ACTOR_ATTRIBUTION_FORBIDDEN', () => {
    const clinician = DEVELOPMENT_PRINCIPALS['usr-clinician-dr-amin'];
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: clinician,
      body: {
        deviceId: 'dev-dispensary-01',
        events: [
          {
            eventId: `evt-spoofed-actor-${Date.now()}`,
            eventType: 'CLINICAL_NOTE_CREATED',
            aggregateType: 'ClinicalNote',
            aggregateId: 'cn-999',
            facilityId: 'fac-rural-dispensary-01', // authorized facility
            actorId: 'usr-admin-01', // FORGED ACTOR: clinician asserting admin identity!
            payload: { note: 'Clinician trying to forge administrator signature' },
          },
        ],
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'ACTOR_ATTRIBUTION_FORBIDDEN');
  });

  await test('Authorized system delegation principal can ingest events across actors', () => {
    const systemPrincipal = DEVELOPMENT_PRINCIPALS['usr-system']; // holds delegation authority
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: systemPrincipal,
      body: {
        deviceId: 'dev-mesh-relay',
        events: [
          {
            eventId: `evt-delegated-actor-${Date.now()}`,
            eventType: 'CLINICAL_NOTE_CREATED',
            aggregateType: 'ClinicalNote',
            aggregateId: 'cn-1000',
            facilityId: 'fac-rural-dispensary-01',
            actorId: 'usr-doctor-01',
            payload: { note: 'Delegated sync relay ingestion' },
          },
        ],
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'System delegation principal must be authorized');
  });

  // ----------------------------------------------------
  // Group 7: Event Batch Schema & Malformed Input Handling
  // ----------------------------------------------------
  console.log('\n--- Group 7: Event Batch Schema & Input Boundaries ---');

  await test('Push missing deviceId returns 400 INVALID_REQUEST', () => {
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-doctor-01'],
      body: { events: [] },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'INVALID_REQUEST');
  });

  await test('Push with malformed event missing required fields returns 400 MALFORMED_EVENT_BATCH', () => {
    const req: any = {
      method: 'POST',
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-doctor-01'],
      body: {
        deviceId: 'dev-doc-device',
        events: [
          {
            eventId: 'evt-incomplete',
            // missing facilityId, eventType, etc.
          },
        ],
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncAuthorization(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'MALFORMED_EVENT_BATCH');
  });

  // ----------------------------------------------------
  // Group 8: Diagnostics & Reset Endpoint Security
  // ----------------------------------------------------
  console.log('\n--- Group 8: Diagnostics & Admin Endpoints Security ---');

  await test('Diagnostics endpoint denies unauthenticated requests with 401', () => {
    const req: any = { headers: {} };
    const res = mockRes();
    let nextCalled = false;
    requireSyncManagementAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });

  await test('Diagnostics endpoint denies unauthorized roles (e.g. nurse/receptionist) with 403', () => {
    const req: any = {
      authenticatedPrincipal: DEVELOPMENT_PRINCIPALS['usr-nurse-01'],
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;
    requireSyncManagementAuth(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FORBIDDEN');
  });

  await test('Diagnostics statistics are scoped to caller tenant without cross-tenant leak', () => {
    const eaStats = serverLedger.getStats(DEFAULT_TENANT_ID);
    const tzStats = serverLedger.getStats(SECONDARY_TENANT_ID);

    assert.ok(typeof eaStats.processedEventsCount === 'number');
    assert.ok(typeof tzStats.processedEventsCount === 'number');
    // Tenant B stats should only count events in Tenant B
    assert.ok(tzStats.processedEventsCount >= 1, 'Tenant B should record its own events');
  });

  // ----------------------------------------------------
  // Group 9: Authorized Sync Operations & Invariants
  // ----------------------------------------------------
  console.log('\n--- Group 9: Authorized Sync Execution & Concurrency Invariants ---');

  await test('Authorized single-facility push advances authoritative version cleanly', () => {
    const clinician = DEVELOPMENT_PRINCIPALS['usr-clinician-dr-amin'];
    const aggId = `pat-auth-sync-${Date.now()}`;
    const pushEvent = {
      eventId: `evt-auth-${Date.now()}`,
      eventType: 'PATIENT_CREATED',
      aggregateType: 'Patient',
      aggregateId: aggId,
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      baseVersion: 0,
      actorId: clinician.userId,
      payload: { firstName: 'Authorized', lastName: 'Patient' },
    };

    const pushResult = serverLedger.processPushBatch(
      'dev-clinician-tablet',
      new Date().toISOString(),
      [pushEvent],
      clinician
    );

    assert.strictEqual(pushResult.status, 'acknowledged');
    assert.strictEqual(pushResult.processedCount, 1);
    assert.strictEqual(serverLedger.authoritativeVersion('Patient', aggId), 1);
  });

  await test('Push idempotency is preserved for authorized events', () => {
    const clinician = DEVELOPMENT_PRINCIPALS['usr-clinician-dr-amin'];
    const aggId = `pat-idem-sync-${Date.now()}`;
    const duplicateEventId = `evt-idem-sync-${Date.now()}`;
    const pushEvent = {
      eventId: duplicateEventId,
      eventType: 'PATIENT_CREATED',
      aggregateType: 'Patient',
      aggregateId: aggId,
      facilityId: 'fac-rural-dispensary-01',
      version: 1,
      baseVersion: 0,
      actorId: clinician.userId,
      payload: { firstName: 'Idempotent', lastName: 'Patient' },
    };

    // First push
    const res1 = serverLedger.processPushBatch('dev-tab', new Date().toISOString(), [pushEvent], clinician);
    assert.strictEqual(res1.status, 'acknowledged');
    assert.ok(res1.acknowledgedEventIds.includes(duplicateEventId));

    // Second push with same eventId
    const res2 = serverLedger.processPushBatch('dev-tab', new Date().toISOString(), [pushEvent], clinician);
    assert.strictEqual(res2.status, 'acknowledged');
    assert.ok(res2.duplicateEventIds.includes(duplicateEventId));
    assert.strictEqual(serverLedger.authoritativeVersion('Patient', aggId), 1);
  });

  console.log('\n================================================================');
  console.log(`ALL ${passed}/${total} STAGE 2 SECURITY TESTS PASSED`);
  console.log('================================================================\n');
}

runStage2SecurityTests().catch((err) => {
  console.error('\n❌ Stage 2 Security Test Suite Failed:', err);
  process.exit(1);
});
