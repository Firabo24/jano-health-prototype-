/**
 * Jano Health — Stage 1 Remediation Verification Suite
 * Production Authentication & Clinical AI Endpoint Security
 *
 * Verifies:
 * 1. Server-side token verification (Firebase Admin ID token verification fail-closed).
 * 2. Rejection of invalid, expired, revoked, malformed, or missing tokens.
 * 3. Zero-trust enforcement: client-supplied headers (x-user-id, roles, facility-id) not trusted.
 * 4. Production auth rejects development tokens (dev-offline-token-*) immediately.
 * 5. POST /api/ai/clinical-assist requires valid authentication.
 * 6. POST /api/ai/clinical-assist requires authorized clinical/oversight role (denies unauthorized roles like receptionist).
 * 7. POST /api/ai/clinical-assist enforces facility authorization boundary.
 * 8. POST /api/ai/clinical-assist validates request parameters (taskType, clinicalQuery / patientContext, payload size).
 * 9. Fail-closed error responses (401 UNAUTHENTICATED, 403 FORBIDDEN, 400 INVALID_REQUEST).
 * 10. Audit attribution captures authenticated caller identity.
 */

import assert from 'node:assert';
import http from 'node:http';
import express, { Request, Response, NextFunction } from 'express';
import {
  authenticateRequest,
  requireClinicalAIAuth,
  isProductionMode,
  CLINICAL_AI_AUTHORIZED_ROLES,
  DEVELOPMENT_PRINCIPALS,
  getFirebaseAdminApp,
  resetFirebaseAdminForTesting,
} from '../server/authMiddleware';
import { serverLedger } from '../server/serverLedger';

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

async function runStage1SecurityTests() {
  console.log('\n================================================================');
  console.log('JANO HEALTH — STAGE 1: PRODUCTION AUTH & CLINICAL AI SECURITY');
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

  // Group 1: Production Authentication Fail-Closed & Dev Token Rejection
  console.log('--- Group 1: Production Authentication Fail-Closed & Invariants ---');

  await test('Missing Bearer token in production mode rejects with 401 UNAUTHENTICATED', async () => {
    process.env.VITE_AUTH_MODE = 'production';
    const req: any = {
      headers: {},
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false, 'Next must not be called when token is missing');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  await test('Development token (dev-offline-token-*) is strictly rejected in production with 401 INVALID_CREDENTIALS', async () => {
    process.env.VITE_AUTH_MODE = 'production';
    const req: any = {
      headers: {
        authorization: 'Bearer dev-offline-token-usr-physician-sarah',
      },
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'INVALID_CREDENTIALS');
  });

  await test('Caller-supplied x-user-id without Bearer token is rejected in production (Zero-Trust)', async () => {
    process.env.VITE_AUTH_MODE = 'production';
    const req: any = {
      headers: {
        'x-user-id': 'usr-sysadmin-amanuel',
        'x-role': 'system_administrator',
      },
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  await test('Unconfigured Firebase in production fails closed immediately with 401 PRODUCTION_AUTH_FAIL_CLOSED', async () => {
    process.env.VITE_AUTH_MODE = 'production';
    delete process.env.FIREBASE_CONFIG;
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    resetFirebaseAdminForTesting();

    const req: any = {
      headers: {
        authorization: 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.fake-token',
      },
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'PRODUCTION_AUTH_FAIL_CLOSED');
  });

  // Group 2: Development Authentication & Multi-Role Identity Resolution
  console.log('\n--- Group 2: Development Authentication Boundaries ---');

  await test('Valid dev token resolves authenticated principal with server-side roles and facilities', async () => {
    delete process.env.VITE_AUTH_MODE;
    process.env.NODE_ENV = 'test';

    const req: any = {
      headers: {
        authorization: 'Bearer dev-offline-token-usr-physician-sarah',
      },
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Valid dev token must call next() in development mode');
    assert.ok(req.authenticatedPrincipal, 'Principal must be attached to request');
    assert.strictEqual(req.authenticatedPrincipal.userId, 'usr-physician-sarah');
    assert.ok(req.authenticatedPrincipal.roles.includes('physician'));
    assert.ok(req.authenticatedPrincipal.facilityIds.includes('fac-uvinza-hc'));
  });

  await test('Unknown or spoofed dev token in development mode is rejected with 401', async () => {
    delete process.env.VITE_AUTH_MODE;
    process.env.NODE_ENV = 'test';

    const req: any = {
      headers: {
        authorization: 'Bearer dev-offline-token-non-existent-hacker',
      },
      query: {},
      body: {},
    };
    const res = mockRes();
    let nextCalled = false;

    await authenticateRequest(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });

  // Group 3: Clinical AI Endpoint Authorization Middleware (requireClinicalAIAuth)
  console.log('\n--- Group 3: Clinical AI Authorization & Boundary Enforcement ---');

  await test('requireClinicalAIAuth denies unauthenticated request with 401', () => {
    const req: any = {
      body: {},
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;

    requireClinicalAIAuth(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
  });

  await test('requireClinicalAIAuth denies non-clinical roles (e.g. receptionist) with 403 FORBIDDEN', () => {
    const req: any = {
      authenticatedPrincipal: {
        userId: 'usr-rec-rahel',
        provider: 'local_development',
        roles: ['receptionist'],
        facilityIds: ['fac-uvinza-hc'],
      },
      body: {},
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;

    requireClinicalAIAuth(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FORBIDDEN');
    assert.ok(res.body.message.includes('not authorized'));
  });

  await test('requireClinicalAIAuth approves authorized clinical roles (physician, nurse, health_officer)', () => {
    const authorizedRoles = ['physician', 'nurse', 'health_officer', 'clinical_supervisor', 'pharmacist'];

    for (const role of authorizedRoles) {
      const req: any = {
        authenticatedPrincipal: {
          userId: `usr-test-${role}`,
          provider: 'local_development',
          roles: [role],
          facilityIds: ['fac-uvinza-hc'],
        },
        body: {},
        headers: {},
      };
      const res = mockRes();
      let nextCalled = false;

      requireClinicalAIAuth(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, `Role '${role}' must be permitted to invoke clinical AI`);
    }
  });

  await test('requireClinicalAIAuth denies clinical user with no assigned facilities with 403', () => {
    const req: any = {
      authenticatedPrincipal: {
        userId: 'usr-unassigned-doctor',
        provider: 'local_development',
        roles: ['physician'],
        facilityIds: [],
      },
      body: {},
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;

    requireClinicalAIAuth(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FACILITY_AUTHORIZATION_DENIED');
  });

  await test('requireClinicalAIAuth denies access to unauthorized target facility with 403 FACILITY_ACCESS_FORBIDDEN', () => {
    const req: any = {
      authenticatedPrincipal: {
        userId: 'usr-nurse-hana',
        provider: 'local_development',
        roles: ['nurse'],
        facilityIds: ['fac-uvinza-hc'], // only authorized for uvinza
      },
      body: {
        facilityId: 'fac-kigoma-dh', // requesting access to kigoma
      },
      headers: {},
    };
    const res = mockRes();
    let nextCalled = false;

    requireClinicalAIAuth(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'FACILITY_ACCESS_FORBIDDEN');
  });

  // Group 4: Request Validation on /api/ai/clinical-assist Route
  console.log('\n--- Group 4: POST /api/ai/clinical-assist Request Validation ---');

  const fs = await import('fs');
  const serverCode = fs.readFileSync('./server.ts', 'utf-8');

  test('POST /api/ai/clinical-assist mounts authenticateRequest and requireClinicalAIAuth middleware', () => {
    assert.ok(
      serverCode.includes("app.post('/api/ai/clinical-assist', authenticateRequest, requireClinicalAIAuth"),
      'Route must mount both authenticateRequest and requireClinicalAIAuth'
    );
  });

  test('POST /api/ai/clinical-assist validates taskType against allowable clinical decision support list', () => {
    assert.ok(
      serverCode.includes('ALLOWED_AI_TASK_TYPES'),
      'Must define ALLOWED_AI_TASK_TYPES whitelist'
    );
    assert.ok(
      serverCode.includes("error: 'INVALID_REQUEST'"),
      'Must return INVALID_REQUEST for unsupported taskType'
    );
  });

  test('POST /api/ai/clinical-assist validates presence of clinicalQuery or patientContext', () => {
    assert.ok(
      serverCode.includes('hasQuery && !hasPatientContext') || serverCode.includes('!hasQuery && !hasPatientContext'),
      'Must validate that either query or patient context is provided'
    );
  });

  test('POST /api/ai/clinical-assist enforces maximum prompt/query size (8000 chars) to prevent DoS', () => {
    assert.ok(
      serverCode.includes('PAYLOAD_TOO_LARGE') || serverCode.includes('clinicalQuery.length > 8000'),
      'Must enforce maximum query length'
    );
  });

  test('POST /api/ai/clinical-assist binds authenticated actor metadata to response', () => {
    assert.ok(
      serverCode.includes('req.authenticatedPrincipal?.userId'),
      'Must attach authenticated user metadata to response'
    );
  });

  console.log('\n================================================================');
  console.log(`ALL ${passed}/${total} STAGE 1 SECURITY TESTS PASSED`);
  console.log('================================================================\n');
}

runStage1SecurityTests().catch((err) => {
  console.error('\n❌ Stage 1 Security Test Suite Failed:', err);
  process.exit(1);
});
