/**
 * Jano Health - Server Authentication & Authorization Middleware
 * 
 * Strict enterprise security boundary:
 * - Production: Verifies Firebase ID tokens, fails closed, rejects development identities.
 * - Development: Accepts authenticated development principals with explicit tokens.
 * - Zero trust for raw, arbitrary client-supplied x-user-id headers.
 * - Server-authoritative facility verification (facility ID is context, not authorization).
 */

import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, App, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { serverLedger, isAuthorizedForLedgerRecovery } from './serverLedger';
import { registerServerAuthenticatedPrincipal } from './trustedPrincipal';
import { getAuthorizationDirectory } from './authorizationDirectory';

export interface AuthenticatedPrincipal {
  userId: string;
  provider: 'local_development' | 'firebase_auth';
  roles: string[];
  facilityIds: string[];
  email?: string;
  tenantId?: string;
  accountStatus?: 'active' | 'suspended' | 'revoked';
  syncCapabilities?: string[];
}

declare global {
  namespace Express {
    interface Request {
      authenticatedPrincipal?: AuthenticatedPrincipal;
    }
  }
}

// ---------------------------------------------------------------------------
// Production Firebase Admin Verifier Initialization & Lifecycle Management
// ---------------------------------------------------------------------------
let firebaseAdminApp: App | null = null;
let firebaseInitAttempted = false;
let firebaseInitError: string | null = null;

export function getFirebaseAdminApp(): App | null {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }
  if (firebaseInitAttempted) {
    return firebaseAdminApp;
  }
  firebaseInitAttempted = true;

  try {
    const existingApps = getApps();
    if (existingApps && existingApps.length > 0) {
      firebaseAdminApp = existingApps[0]!;
      return firebaseAdminApp;
    }

    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    const configEnv = process.env.FIREBASE_CONFIG;
    const gCredsEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (saEnv) {
      try {
        const parsed = JSON.parse(saEnv);
        firebaseAdminApp = initializeApp({
          credential: cert(parsed),
          projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID,
        });
        return firebaseAdminApp;
      } catch (parseErr: any) {
        console.error('[Firebase Admin] Failed parsing FIREBASE_SERVICE_ACCOUNT JSON:', parseErr?.message);
        firebaseInitError = `Malformed FIREBASE_SERVICE_ACCOUNT: ${parseErr?.message}`;
        return null;
      }
    } else if (configEnv) {
      try {
        const parsed = JSON.parse(configEnv);
        firebaseAdminApp = initializeApp({
          credential: applicationDefault(),
          projectId: parsed.projectId || parsed.project_id || process.env.FIREBASE_PROJECT_ID,
        });
        return firebaseAdminApp;
      } catch (parseErr: any) {
        console.error('[Firebase Admin] Failed parsing FIREBASE_CONFIG JSON:', parseErr?.message);
        firebaseInitError = `Malformed FIREBASE_CONFIG: ${parseErr?.message}`;
        return null;
      }
    } else if (gCredsEnv || process.env.FIREBASE_PROJECT_ID) {
      try {
        firebaseAdminApp = initializeApp({
          credential: applicationDefault(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        return firebaseAdminApp;
      } catch (appErr: any) {
        console.error('[Firebase Admin] Failed initializeApp with applicationDefault:', appErr?.message);
        firebaseInitError = appErr?.message;
        return null;
      }
    } else {
      firebaseInitError = 'No Firebase credentials found in environment (FIREBASE_SERVICE_ACCOUNT, FIREBASE_CONFIG, or GOOGLE_APPLICATION_CREDENTIALS).';
      return null;
    }
  } catch (err: any) {
    console.error('[Firebase Admin] Initialization failed:', err?.message);
    firebaseInitError = err?.message;
    return null;
  }
}

export function resetFirebaseAdminForTesting(): void {
  firebaseAdminApp = null;
  firebaseInitAttempted = false;
  firebaseInitError = null;
}

/**
 * Explicit development principals for offline simulation, unit testing, and clinical demos.
 * These are strictly disabled when running in production mode.
 */
export const DEVELOPMENT_PRINCIPALS: Record<string, AuthenticatedPrincipal> = {
  // Canonical Multi-Role Test Users
  'usr-sysadmin-amanuel': {
    userId: 'usr-sysadmin-amanuel',
    provider: 'local_development',
    roles: ['system_administrator', 'admin', 'supervisor'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02', 'fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
    email: 'amanuel.tesfaye@janohealth.org',
  },
  'usr-facadmin-meron': {
    userId: 'usr-facadmin-meron',
    provider: 'local_development',
    roles: ['facility_administrator'],
    facilityIds: ['fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-rural-dispensary-01'],
    email: 'meron.bekele@janohealth.org',
  },
  'usr-physician-sarah': {
    userId: 'usr-physician-sarah',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-uvinza-hc', 'fac-kigoma-dh', 'fac-district-hospital-01'],
    email: 'sarah.alemu@janohealth.org',
  },
  'usr-nurse-hana': {
    userId: 'usr-nurse-hana',
    provider: 'local_development',
    roles: ['nurse'],
    facilityIds: ['fac-uvinza-hc', 'fac-rural-dispensary-01'],
    email: 'hana.worku@janohealth.org',
  },
  'usr-pharm-daniel': {
    userId: 'usr-pharm-daniel',
    provider: 'local_development',
    roles: ['pharmacist'],
    facilityIds: ['fac-uvinza-hc'],
    email: 'daniel.gebre@janohealth.org',
  },
  'usr-lab-bethlehem': {
    userId: 'usr-lab-bethlehem',
    provider: 'local_development',
    roles: ['laboratory_staff'],
    facilityIds: ['fac-uvinza-hc'],
    email: 'bethlehem.tadesse@janohealth.org',
  },
  'usr-rad-yonatan': {
    userId: 'usr-rad-yonatan',
    provider: 'local_development',
    roles: ['radiology_staff'],
    facilityIds: ['fac-kigoma-dh', 'fac-district-hospital-01'],
    email: 'yonatan.abebe@janohealth.org',
  },
  'usr-rec-rahel': {
    userId: 'usr-rec-rahel',
    provider: 'local_development',
    roles: ['receptionist'],
    facilityIds: ['fac-nguruka-clinic', 'fac-uvinza-hc', 'fac-rural-dispensary-01'],
    email: 'rahel.mekonnen@janohealth.org',
  },
  'usr-ho-dawit': {
    userId: 'usr-ho-dawit',
    provider: 'local_development',
    roles: ['health_officer', 'physician'],
    facilityIds: ['fac-mobile-unit-02', 'fac-nguruka-clinic', 'fac-uvinza-hc', 'fac-mobile-outreach-01'],
    email: 'dawit.girma@janohealth.org',
  },
  'usr-sup-elias': {
    userId: 'usr-sup-elias',
    provider: 'local_development',
    roles: ['clinical_supervisor', 'physician', 'supervisor'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02', 'fac-district-hospital-01'],
    email: 'elias.kebede@janohealth.org',
  },
  'usr-fin-abinet': {
    userId: 'usr-fin-abinet',
    provider: 'local_development',
    roles: ['facility_administrator'],
    facilityIds: ['fac-uvinza-hc', 'fac-kigoma-dh', 'fac-nguruka-clinic', 'fac-rural-dispensary-01', 'fac-district-hospital-01'],
    email: 'abinet.shiferaw@janohealth.org',
  },
  'usr-interopadmin-kalkidan': {
    userId: 'usr-interopadmin-kalkidan',
    provider: 'local_development',
    roles: ['system_interoperability_admin', 'admin'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02', 'fac-rural-dispensary-01', 'fac-district-hospital-01'],
    email: 'kalkidan.desta@janohealth.org',
  },
  'usr-netadmin-tariq': {
    userId: 'usr-netadmin-tariq',
    provider: 'local_development',
    roles: ['network_administrator', 'admin'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02'],
    email: 'tariq.mansoor@janohealth.org',
  },
  'usr-termadmin-nebil': {
    userId: 'usr-termadmin-nebil',
    provider: 'local_development',
    roles: ['terminology_administrator'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc'],
    email: 'nebil.kemal@janohealth.org',
  },
  'usr-facinterop-salma': {
    userId: 'usr-facinterop-salma',
    provider: 'local_development',
    roles: ['facility_interoperability_admin'],
    facilityIds: ['fac-uvinza-hc', 'fac-nguruka-clinic'],
    email: 'salma.juma@janohealth.org',
  },
  'usr-facilityintel-fatma': {
    userId: 'usr-facilityintel-fatma',
    provider: 'local_development',
    roles: ['facility_intelligence_user'],
    facilityIds: ['fac-uvinza-hc', 'fac-nguruka-clinic'],
    email: 'fatma.juma@janohealth.org',
  },
  'usr-netintel-samuel': {
    userId: 'usr-netintel-samuel',
    provider: 'local_development',
    roles: ['network_intelligence_user'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02'],
    email: 'samuel.mwita@janohealth.org',
  },
  'usr-publichealth-aminata': {
    userId: 'usr-publichealth-aminata',
    provider: 'local_development',
    roles: ['public_health_intelligence_user'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02', 'fac-rural-dispensary-01', 'fac-district-hospital-01'],
    email: 'aminata.diallo@janohealth.org',
  },
  'usr-sysintel-neema': {
    userId: 'usr-sysintel-neema',
    provider: 'local_development',
    roles: ['system_intelligence_admin'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic', 'fac-mobile-unit-02', 'fac-rural-dispensary-01', 'fac-district-hospital-01'],
    email: 'neema.kilonzo@janohealth.org',
  },
  'usr-interop-abinet': {
    userId: 'usr-interop-abinet',
    provider: 'local_development',
    roles: ['national_interoperability_officer'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-rural-dispensary-01'],
    email: 'abinet.alemu@janohealth.org',
  },
  'usr-steward-genet': {
    userId: 'usr-steward-genet',
    provider: 'local_development',
    roles: ['ecosystem_data_steward'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-rural-dispensary-01'],
    email: 'genet.asfaw@janohealth.org',
  },
  'usr-governor-tadesse': {
    userId: 'usr-governor-tadesse',
    provider: 'local_development',
    roles: ['system_intelligence_governor'],
    facilityIds: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-rural-dispensary-01'],
    email: 'tadesse.worku@janohealth.org',
  },

  // Legacy Test Suite Identifiers (Fully Retained)
  'usr-admin-01': {
    userId: 'usr-admin-01',
    provider: 'local_development',
    roles: ['system_administrator', 'admin', 'supervisor'],
    facilityIds: ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
    email: 'admin@dispensary.moh.tz',
  },
  'usr-doctor-01': {
    userId: 'usr-doctor-01',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-rural-dispensary-01', 'fac-district-hospital-01'],
    email: 'amani.mwanga@health.tz',
  },
  'usr-nurse-01': {
    userId: 'usr-nurse-01',
    provider: 'local_development',
    roles: ['nurse'],
    facilityIds: ['fac-rural-dispensary-01'],
    email: 'rehema.k@health.tz',
  },
  'usr-clinician-dr-amin': {
    userId: 'usr-clinician-dr-amin',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-rural-dispensary-01'],
    email: 'dr.amin@dispensary.tz',
  },
  'usr-amani-dr': {
    userId: 'usr-amani-dr',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-uvinza-hc', 'fac-kigoma-dh'],
    email: 'amani.mwanga@janohealth.org',
  },
  'usr-fatima-rn': {
    userId: 'usr-fatima-rn',
    provider: 'local_development',
    roles: ['nurse'],
    facilityIds: ['fac-uvinza-hc'],
    email: 'fatima.juma@janohealth.org',
  },
  'usr-system': {
    userId: 'usr-system',
    provider: 'local_development',
    roles: ['system_administrator', 'admin'],
    facilityIds: ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'],
    email: 'system@jano.local',
    tenantId: 'tenant-prod-ea-moh',
    accountStatus: 'active',
    syncCapabilities: ['sync:facility', 'sync:cross_facility', 'sync:delegation', 'sync:manage'],
  },

  // Targeted Test Principals for Security & Tenant Boundary Verification
  'usr-suspended-test': {
    userId: 'usr-suspended-test',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-rural-dispensary-01'],
    email: 'suspended@jano.test',
    tenantId: 'tenant-prod-ea-moh',
    accountStatus: 'suspended',
    syncCapabilities: ['sync:facility'],
  },
  'usr-revoked-test': {
    userId: 'usr-revoked-test',
    provider: 'local_development',
    roles: ['nurse'],
    facilityIds: ['fac-rural-dispensary-01'],
    email: 'revoked@jano.test',
    tenantId: 'tenant-prod-ea-moh',
    accountStatus: 'revoked',
    syncCapabilities: ['sync:facility'],
  },
  'usr-tz-cross-tenant': {
    userId: 'usr-tz-cross-tenant',
    provider: 'local_development',
    roles: ['physician'],
    facilityIds: ['fac-mwanza-regional-01'],
    email: 'mwanza@tzhealth.test',
    tenantId: 'tenant-prod-tz-health',
    accountStatus: 'active',
    syncCapabilities: ['sync:facility', 'sync:cross_facility'],
  },
};

// Register all canonical development principals in the server-trusted principal registry
for (const p of Object.values(DEVELOPMENT_PRINCIPALS)) {
  registerServerAuthenticatedPrincipal(p);
}

export function isProductionMode(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VITE_AUTH_MODE === 'production';
}

/**
 * Authentication Middleware
 * Validates request credentials and binds an AuthenticatedPrincipal to req.
 * Rejects unauthenticated requests and refuses to blindly trust client headers like x-user-id.
 */
export async function authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'] || '';
  const devTokenHeader = (req.headers['x-dev-token'] as string) || '';
  const isProd = isProductionMode();

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (devTokenHeader) {
    token = devTokenHeader.trim();
  }

  // In production mode: Firebase authentication is MANDATORY and MUST fail closed
  if (isProd) {
    if (!token) {
      res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Production authentication required: missing Bearer authorization token.',
      });
      return;
    }

    // Explicitly reject development tokens in production mode
    if (token.startsWith('dev-offline-token-') || token in DEVELOPMENT_PRINCIPALS) {
      res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Development tokens are strictly forbidden in production mode.',
      });
      return;
    }

    // In production environment: initialize and execute Firebase Admin ID token verification
    const app = getFirebaseAdminApp();
    if (!app) {
      res.status(401).json({
        error: 'PRODUCTION_AUTH_FAIL_CLOSED',
        message: 'Firebase Authentication is unconfigured in production environment. Privileged access denied.',
      });
      return;
    }

    try {
      const decodedToken = await getAuth(app).verifyIdToken(token, true);
      const uid = decodedToken.uid;
      const email = decodedToken.email || '';

      // Server-authoritative resolution via persistent Firestore Authorization Directory
      const authDir = getAuthorizationDirectory();
      const explicitTenantId =
        (req.headers['x-tenant-id'] as string) ||
        (decodedToken.tenantId as string) ||
        (decodedToken.tenant_id as string) ||
        undefined;

      const tenantContext = await authDir.resolveActiveTenantContext(uid, explicitTenantId);
      if (!tenantContext.authorized) {
        res.status(403).json({
          error: tenantContext.code || 'UNAUTHORIZED_PRINCIPAL',
          message: tenantContext.message || 'Authorization directory validation failed.',
        });
        return;
      }

      const permittedFacilities = await authDir.resolvePermittedFacilityIds(uid, tenantContext.tenantId!);

      req.authenticatedPrincipal = registerServerAuthenticatedPrincipal({
        userId: uid,
        provider: 'firebase_auth',
        roles: tenantContext.tenantMembership?.roles && tenantContext.tenantMembership.roles.length > 0
          ? tenantContext.tenantMembership.roles
          : ['clinician'],
        facilityIds: permittedFacilities,
        email,
        tenantId: tenantContext.tenantId!,
        accountStatus: tenantContext.account?.accountStatus || 'active',
        syncCapabilities: tenantContext.tenantMembership?.capabilities || ['sync:facility'],
      });

      next();
      return;
    } catch (verifyErr: any) {
      const errMsg = String(verifyErr?.message || '');
      const errCode = String(verifyErr?.code || '');

      if (errCode === 'auth/id-token-expired') {
        res.status(401).json({
          error: 'TOKEN_EXPIRED',
          message: 'Firebase ID token has expired. Please refresh credentials.',
        });
        return;
      }

      if (errCode === 'auth/id-token-revoked') {
        res.status(401).json({
          error: 'TOKEN_REVOKED',
          message: 'Firebase ID token has been revoked.',
        });
        return;
      }

      res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: `Invalid Firebase ID token: ${errMsg}`,
      });
      return;
    }
  }

  // In development mode: Validate development session / token
  // If no token is provided, check if valid dev token pattern or fallback to default test identity
  let resolvedPrincipal: AuthenticatedPrincipal | undefined;

  if (token.startsWith('dev-offline-token-')) {
    const userId = token.replace('dev-offline-token-', '');
    resolvedPrincipal = DEVELOPMENT_PRINCIPALS[userId];
  } else if (token in DEVELOPMENT_PRINCIPALS) {
    resolvedPrincipal = DEVELOPMENT_PRINCIPALS[token];
  }

  // Never trust x-user-id header alone without valid authentication token
  if (!resolvedPrincipal) {
    res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Missing or invalid authentication credentials. Please sign in.',
    });
    return;
  }

  req.authenticatedPrincipal = registerServerAuthenticatedPrincipal({
    ...resolvedPrincipal,
    tenantId: resolvedPrincipal.tenantId || serverLedger.getUserTenant(resolvedPrincipal.userId),
    accountStatus: resolvedPrincipal.accountStatus || serverLedger.getUserAccountStatus(resolvedPrincipal.userId),
    syncCapabilities: resolvedPrincipal.syncCapabilities || serverLedger.getUserSyncCapabilities(resolvedPrincipal.userId),
  });
  next();
}

/**
 * Synchronization Authorization Middleware
 * Authorizes sync requests with server-controlled tenant, facility, account status,
 * and capability checks. Rejects unauthorized multi-facility scope and actor spoofing.
 */
export function requireSyncAuthorization(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication required before synchronization authorization check.',
    });
    return;
  }

  // 1. Account Lifecycle Check (Active, Suspended, Revoked)
  if (principal.accountStatus === 'suspended') {
    res.status(403).json({
      error: 'ACCOUNT_SUSPENDED',
      message: `Access denied: Principal '${principal.userId}' account is suspended. Synchronization operations are disabled.`,
    });
    return;
  }
  if (principal.accountStatus === 'revoked') {
    res.status(403).json({
      error: 'ACCOUNT_REVOKED',
      message: `Access denied: Principal '${principal.userId}' account has been revoked.`,
    });
    return;
  }

  // 2. Facility Association Check
  if (!principal.facilityIds || principal.facilityIds.length === 0) {
    res.status(403).json({
      error: 'NO_AUTHORIZED_FACILITIES',
      message: `Principal '${principal.userId}' is not associated with any healthcare facility.`,
    });
    return;
  }

  const tenantId = principal.tenantId || (isProductionMode() ? undefined : serverLedger.getUserTenant(principal.userId));
  if (!tenantId) {
    res.status(403).json({
      error: 'TENANT_IDENTITY_MISSING',
      message: `Principal '${principal.userId}' has no valid tenant assignment.`,
    });
    return;
  }
  const hasCrossFacility = (principal.syncCapabilities && principal.syncCapabilities.includes('sync:cross_facility'))
    || (!isProductionMode() && serverLedger.hasCrossFacilitySyncCapability(principal.userId));

  // 3. GET /api/sync/pull Authorization
  if (req.method === 'GET') {
    const rawFacility = req.query.facilityId as string | undefined;

    // Wildcard / multi-facility request ('all' or '*')
    if (rawFacility === 'all' || rawFacility === '*') {
      if (!hasCrossFacility) {
        res.status(403).json({
          error: 'CROSS_FACILITY_ACCESS_DENIED',
          message: `Access denied: Principal '${principal.userId}' lacks explicit cross-facility synchronization capability.`,
        });
        return;
      }
      next();
      return;
    }

    // Specific facility requested
    if (rawFacility) {
      // Tenant boundary verification
      const targetTenant = serverLedger.getFacilityTenant(rawFacility);
      if (targetTenant !== tenantId) {
        res.status(403).json({
          error: 'TENANT_ISOLATION_VIOLATION',
          message: `Access denied: Facility '${rawFacility}' belongs to tenant '${targetTenant}', not caller tenant '${tenantId}'.`,
        });
        return;
      }

      // Facility membership check
      const isAuthorized = principal.facilityIds.includes(rawFacility)
        || (hasCrossFacility && targetTenant === tenantId);
      if (!isAuthorized) {
        res.status(403).json({
          error: 'FACILITY_ACCESS_FORBIDDEN',
          message: `Access denied: Principal '${principal.userId}' is not authorized to pull events from facility '${rawFacility}'.`,
        });
        return;
      }

      next();
      return;
    }

    // Missing facilityId: will default safely to principal.facilityIds[0] in route handler
    next();
    return;
  }

  // 4. POST /api/sync/push Authorization
  if (req.method === 'POST') {
    const { deviceId, events } = req.body || {};
    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Sync push request must include a valid deviceId string.',
      });
      return;
    }

    const eventList = Array.isArray(events) ? events : [];
    if (eventList.length === 0) {
      next();
      return;
    }

    const isSystemDelegation = (principal.roles && principal.roles.includes('system_administrator'))
      || (principal.syncCapabilities && principal.syncCapabilities.includes('sync:delegation'))
      || principal.userId === 'usr-system';

    // Validate each event before processing
    for (const ev of eventList) {
      if (!ev || typeof ev !== 'object') {
        res.status(400).json({
          error: 'MALFORMED_EVENT_BATCH',
          message: 'All items in sync batch must be valid event objects.',
        });
        return;
      }

      const targetFacility = ev.facilityId;
      if (!targetFacility || typeof targetFacility !== 'string') {
        res.status(400).json({
          error: 'MALFORMED_EVENT_BATCH',
          message: `Event '${ev.eventId || 'unknown'}' is missing required facilityId string.`,
        });
        return;
      }

      // Tenant boundary check
      const eventTenant = serverLedger.getFacilityTenant(targetFacility);
      if (eventTenant !== tenantId) {
        res.status(403).json({
          error: 'TENANT_ISOLATION_VIOLATION',
          message: `Access denied: Target facility '${targetFacility}' belongs to tenant '${eventTenant}', not caller tenant '${tenantId}'.`,
        });
        return;
      }

      // Facility authorization check
      const isFacilityAuthorized = principal.facilityIds.includes(targetFacility)
        || (hasCrossFacility && eventTenant === tenantId);
      if (!isFacilityAuthorized) {
        res.status(403).json({
          error: 'FACILITY_ACCESS_FORBIDDEN',
          message: `Access denied: Principal '${principal.userId}' is not authorized to write events for facility '${targetFacility}'.`,
        });
        return;
      }

      // Actor attribution verification (Anti-Spoofing)
      const assertedActor = ev.actorId || ev.metadata?.actorId;
      if (assertedActor && assertedActor !== principal.userId && !isSystemDelegation) {
        res.status(403).json({
          error: 'ACTOR_ATTRIBUTION_FORBIDDEN',
          message: `Access denied: Actor attribution spoofing detected. Event asserted actor '${assertedActor}', but authenticated principal is '${principal.userId}'.`,
        });
        return;
      }
    }

    next();
    return;
  }

  next();
}

/**
 * Facility Authorization Middleware
 * Never trusts client-supplied facilityId as proof of authority.
 * Independently validates that the authenticated principal has permission for the facility.
 */
export function requireFacilityAuthorization(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication required before facility authorization check.',
    });
    return;
  }

  if (principal.accountStatus === 'suspended') {
    res.status(403).json({
      error: 'ACCOUNT_SUSPENDED',
      message: `Principal '${principal.userId}' account is suspended.`,
    });
    return;
  }

  if (principal.accountStatus === 'revoked') {
    res.status(403).json({
      error: 'ACCOUNT_REVOKED',
      message: `Principal '${principal.userId}' account has been revoked.`,
    });
    return;
  }

  // Extract requested facility context from query or body (do not trust arbitrary caller headers)
  const requestedFacilityId = (req.query.facilityId as string) || req.body?.facilityId;

  // If no specific facility requested, verify principal has at least one active facility
  if (!requestedFacilityId) {
    if (!principal.facilityIds || principal.facilityIds.length === 0) {
      res.status(403).json({
        error: 'FACILITY_AUTHORIZATION_DENIED',
        message: `Principal '${principal.userId}' is not associated with any healthcare facility.`,
      });
      return;
    }
    next();
    return;
  }

  // If 'all' is requested, require explicit cross-facility capability
  if (requestedFacilityId === 'all' || requestedFacilityId === '*') {
    const hasCrossFacility = (principal.syncCapabilities && principal.syncCapabilities.includes('sync:cross_facility'))
      || serverLedger.hasCrossFacilitySyncCapability(principal.userId);
    if (!hasCrossFacility) {
      res.status(403).json({
        error: 'CROSS_FACILITY_ACCESS_DENIED',
        message: `Principal '${principal.userId}' lacks explicit cross-facility authorization.`,
      });
      return;
    }
    next();
    return;
  }

  const isAuthorized = serverLedger.verifyFacilityAccess(principal.userId, requestedFacilityId, principal.tenantId);
  if (!isAuthorized) {
    res.status(403).json({
      error: 'FACILITY_ACCESS_FORBIDDEN',
      message: `Access denied: Principal '${principal.userId}' is not authorized to access or mutate facility '${requestedFacilityId}'.`,
    });
    return;
  }

  next();
}

/**
 * Privileged Role Middleware (for admin/system actions)
 */
export function requireAdminOrSystem(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  if (principal.accountStatus === 'suspended' || principal.accountStatus === 'revoked') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account is not active.' });
    return;
  }

  const hasPrivilege = principal.roles.some((r) => ['admin', 'supervisor', 'system_administrator'].includes(r));
  if (!hasPrivilege) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Administrative or system privileges required.',
    });
    return;
  }

  next();
}

/**
 * Synchronization Administrative Middleware (for diagnostics and reset)
 */
export function requireSyncManagementAuth(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  if (principal.accountStatus === 'suspended' || principal.accountStatus === 'revoked') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account is not active.' });
    return;
  }

  const hasSyncManage = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'admin'].includes(r)
  ) || (principal.syncCapabilities && principal.syncCapabilities.includes('sync:manage'));

  if (!hasSyncManage) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Sync management privileges required.',
    });
    return;
  }

  next();
}

/**
 * Ledger Recovery & Reconciliation Authorization Middleware
 * Strictly enforces global system authority for multi-tenant ledger recovery.
 * Rejects facility-scoped administrators, clinicians, and unauthenticated callers.
 */
export function requireLedgerRecoveryAuth(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required for ledger recovery.' });
    return;
  }

  if (principal.accountStatus === 'suspended' || principal.accountStatus === 'revoked') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: 'Account is not active.' });
    return;
  }

  if (!isAuthorizedForLedgerRecovery(principal)) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Global system administrator authority required for ledger recovery and reconciliation. Local or facility-scoped roles are denied.',
    });
    return;
  }

  next();
}

/**
 * Directory Administration Authorization Middleware
 * Authorizes operations on the persistent Firestore directory.
 * Fails closed in production if local development principals are used.
 * Requires system_administrator, tenant_administrator, facility_administrator, or directory:provision capability.
 */
export function requireDirectoryAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required for directory administration.' });
    return;
  }

  if (principal.accountStatus === 'suspended' || principal.accountStatus === 'revoked') {
    res.status(403).json({ error: 'ACCOUNT_SUSPENDED', message: `Principal account '${principal.userId}' is suspended or revoked.` });
    return;
  }

  if (isProductionMode() && principal.provider === 'local_development') {
    res.status(403).json({
      error: 'DEVELOPMENT_PRINCIPALS_FORBIDDEN_IN_PRODUCTION',
      message: 'Development principal credentials cannot perform directory administration in production mode.',
    });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'tenant_administrator', 'facility_administrator'].includes(r)
  ) || (principal.syncCapabilities && (principal.syncCapabilities.includes('directory:provision') || principal.syncCapabilities.includes('directory:admin')));

  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Administrative directory authority required for this operation.',
    });
    return;
  }

  next();
}


/**
 * Interoperability System Administrator Middleware
 */
export function requireSystemInteropAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    ['system_interoperability_admin', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'System Interoperability Administrator authority required for this operation.',
    });
    return;
  }

  next();
}

/**
 * Network Administrator Middleware (Node trust, lifecycle, registration, policies)
 */
export function requireNetworkAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    ['network_administrator', 'system_interoperability_admin', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Network Administrator authority required for node governance.',
    });
    return;
  }

  next();
}

/**
 * Interoperability Quarantine Reviewer Middleware
 */
export function requireQuarantineReviewer(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    [
      'system_interoperability_admin',
      'network_administrator',
      'terminology_administrator',
      'facility_interoperability_admin',
      'system_administrator',
    ].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Interoperability Quarantine Reviewer authority required.',
    });
    return;
  }

  next();
}

/**
 * Population Analytics View Middleware
 */
export function requirePopulationAnalytics(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    [
      'facility_intelligence_user',
      'network_intelligence_user',
      'public_health_intelligence_user',
      'system_intelligence_admin',
      'system_administrator',
      'facility_administrator',
      'clinical_supervisor',
    ].includes(r)
  );

  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Population analytics view authority required.',
    });
    return;
  }

  next();
}

/**
 * Public Health Intelligence Officer Middleware
 */
export function requirePublicHealthOfficer(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    [
      'public_health_intelligence_user',
      'system_intelligence_admin',
      'system_administrator',
    ].includes(r)
  );

  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Public Health Intelligence Officer authority required.',
    });
    return;
  }

  next();
}

/**
 * System Intelligence Administrator Middleware
 */
export function requireSystemIntelligenceAdmin(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    [
      'system_intelligence_admin',
      'system_administrator',
    ].includes(r)
  );

  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'System Intelligence Administrator authority required.',
    });
    return;
  }

  next();
}

/**
 * Surveillance Signal Reviewer Middleware
 */
export function requireSignalReviewer(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }

  const isAuthorized = principal.roles.some((r) =>
    [
      'public_health_intelligence_user',
      'network_intelligence_user',
      'system_intelligence_admin',
      'system_administrator',
      'clinical_supervisor',
    ].includes(r)
  );

  if (!isAuthorized) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Signal Reviewer authority required.',
    });
    return;
  }

  next();
}

/**
 * V16 Workforce View Middleware
 */
export function requireWorkforceView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    [
      'system_administrator',
      'facility_administrator',
      'clinical_supervisor',
      'physician',
      'nurse',
      'health_officer',
      'pharmacist',
    ].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Workforce viewing authority required.' });
    return;
  }
  next();
}

/**
 * V16 Workforce Directory & Assignment Management Middleware
 */
export function requireWorkforceDirectoryManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Workforce directory management authority required.' });
    return;
  }
  next();
}

/**
 * V16 Workforce Credential Verification Middleware
 */
export function requireWorkforceCredentialVerify(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Workforce credential verification authority required.' });
    return;
  }
  next();
}

/**
 * V16 Roster Approval & Publication Middleware
 */
export function requireWorkforceRosterApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Roster approval & publication authority required.' });
    return;
  }
  next();
}

/**
 * V16 Shift & Handover Action Middleware
 */
export function requireWorkforceShiftManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Shift management authority required.' });
    return;
  }
  next();
}

/**
 * V16 Task Action Middleware
 */
export function requireWorkforceTaskManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    [
      'system_administrator',
      'facility_administrator',
      'clinical_supervisor',
      'physician',
      'nurse',
      'health_officer',
      'pharmacist',
    ].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Task management authority required.' });
    return;
  }
  next();
}

/**
 * V16 Workforce Intelligence View Middleware
 */
export function requireWorkforceIntelligenceView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    [
      'system_administrator',
      'facility_administrator',
      'clinical_supervisor',
      'facility_intelligence_user',
      'network_intelligence_user',
      'public_health_intelligence_user',
      'system_intelligence_admin',
    ].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Workforce intelligence viewing authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Catalog View Middleware
 */
export function requireSupplyCatalogView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Catalog Manage Middleware
 */
export function requireSupplyCatalogManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Supply catalog management authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Demand View Middleware
 */
export function requireSupplyDemandView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Demand Create Middleware
 */
export function requireSupplyDemandCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Requisition Create Middleware
 */
export function requireProcurementRequisitionCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'physician', 'pharmacist', 'nurse', 'clinical_supervisor', 'laboratory_staff', 'radiology_staff'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requisition creation authority required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Requisition Approve Middleware
 */
export function requireProcurementRequisitionApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Requisition approval authority required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Supplier View Middleware
 */
export function requireProcurementSupplierView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Supplier Manage Middleware
 */
export function requireProcurementSupplierManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Supplier management authority required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Purchase Order Create Middleware
 */
export function requireProcurementPOCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Purchase order creation authority required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Purchase Order Approve Middleware
 */
export function requireProcurementPOApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Purchase order approval authority required.' });
    return;
  }
  next();
}

/**
 * V17 Procurement Purchase Order Send Middleware
 */
export function requireProcurementPOSend(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Purchase order dispatch authority required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Shipment View Middleware
 */
export function requireLogisticsShipmentView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Receiving Create Middleware
 */
export function requireLogisticsReceivingCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist', 'laboratory_staff', 'nurse'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Goods receiving authority required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Receiving Finalize Middleware
 */
export function requireLogisticsReceivingFinalize(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Goods receipt finalization authority required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Transfer Create Middleware
 */
export function requireLogisticsTransferCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Stock transfer request authority required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Transfer Approve Middleware
 */
export function requireLogisticsTransferApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Stock transfer approval authority required.' });
    return;
  }
  next();
}

/**
 * V17 Logistics Transfer Receive Middleware
 */
export function requireLogisticsTransferReceive(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist', 'nurse'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Stock transfer receiving authority required.' });
    return;
  }
  next();
}

/**
 * V17 Cold Chain View Middleware
 */
export function requireColdChainView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Cold Chain Record Middleware
 */
export function requireColdChainRecord(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Cold Chain Review Middleware
 */
export function requireColdChainReview(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Cold chain excursion review authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Quality View Middleware
 */
export function requireSupplyQualityView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Quality Hold Middleware
 */
export function requireSupplyQualityHold(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist', 'laboratory_staff', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Batch quality hold authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Quality Release Middleware
 */
export function requireSupplyQualityRelease(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist', 'clinical_supervisor'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Quality release authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Recall Manage Middleware
 */
export function requireSupplyRecallManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'pharmacist'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Recall management authority required.' });
    return;
  }
  next();
}

/**
 * V17 Supply Intelligence View Middleware
 */
export function requireSupplyIntelligenceView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * V18 Research Study View Middleware
 */
export function requireResearchStudyView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'facility_administrator', 'clinical_researcher', 'research_coordinator', 'data_access_steward', 'physician'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research study viewing authority required.' });
    return;
  }
  next();
}

/**
 * V18 Research Study Manage Middleware
 */
export function requireResearchStudyManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'clinical_researcher', 'data_access_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research study management authority required.' });
    return;
  }
  next();
}

/**
 * V18 Research Study Approve Middleware
 */
export function requireResearchStudyApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'data_access_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research study approval authority required.' });
    return;
  }
  next();
}

/**
 * V18 Research Subject Enroll Middleware
 */
export function requireResearchSubjectEnroll(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'clinical_researcher', 'research_coordinator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research enrollment authority required.' });
    return;
  }
  next();
}

/**
 * V18 Research Dataset Release Middleware
 */
export function requireResearchDatasetRelease(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'data_access_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research dataset release authority required.' });
    return;
  }
  next();
}

/**
 * V18 Research Governance Manage Middleware
 */
export function requireResearchGovernanceManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'data_access_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Research governance administration authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem System View Middleware
 */
export function requireEcosystemSystemView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer', 'ecosystem_data_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Ecosystem system view authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem System Manage Middleware
 */
export function requireEcosystemSystemManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Ecosystem system management authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem Integration Approve Middleware
 */
export function requireEcosystemIntegrationApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'National integration approval authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem MFR Reconcile Middleware
 */
export function requireEcosystemMFRReconcile(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer', 'ecosystem_data_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Master Facility Registry reconciliation authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem Terminology Approve Middleware
 */
export function requireEcosystemTerminologyApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer', 'ecosystem_data_steward', 'terminology_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Terminology mapping approval authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem Reporting Submit Middleware
 */
export function requireEcosystemReportingSubmit(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer', 'ecosystem_data_steward'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'National reporting submission authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem Surveillance Approve Middleware
 */
export function requireEcosystemSurveillanceApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer', 'public_health_intelligence_user'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Disease surveillance report approval authority required.' });
    return;
  }
  next();
}

/**
 * V19 Ecosystem Governance Manage Middleware
 */
export function requireEcosystemGovernanceManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_administrator', 'national_interoperability_officer'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Ecosystem governance management authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Intelligence View Middleware
 */
export function requireSystemIntelligenceView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'System intelligence viewing authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Intelligence Manage Middleware
 */
export function requireSystemIntelligenceManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'System intelligence governance authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Automation Approve Middleware
 */
export function requireSystemAutomationApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Automation approval authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Automation Execute Middleware
 */
export function requireSystemAutomationExecute(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Automation execution authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Incident Manage Middleware
 */
export function requireSystemIncidentManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Incident management authority required.' });
    return;
  }
  next();
}

/**
 * V20 System Simulation Run Middleware
 */
export function requireSystemSimulationRun(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['system_intelligence_governor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'System simulation execution authority required.' });
    return;
  }
  next();
}

/**
 * V21 Deployment View Middleware
 */
export function requireDeploymentView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['deployment_engineer', 'pilot_operations_director', 'system_administrator', 'facility_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Deployment inspection authority required.' });
    return;
  }
  next();
}

/**
 * V21 Deployment Manage Middleware
 */
export function requireDeploymentManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['deployment_engineer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Deployment management authority required.' });
    return;
  }
  next();
}

/**
 * V21 Backup Create & Restore Middlewares
 */
export function requireBackupCreate(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['deployment_engineer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Backup creation authority required.' });
    return;
  }
  next();
}

export function requireBackupRestore(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['deployment_engineer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Database restoration authority required.' });
    return;
  }
  next();
}

/**
 * V21 Maintenance Mode & Pilot Manage Middlewares
 */
export function requireMaintenanceManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['deployment_engineer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Maintenance management authority required.' });
    return;
  }
  next();
}

export function requirePilotManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['pilot_operations_director', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Pilot facility management authority required.' });
    return;
  }
  next();
}

/**
 * V22 Clinical Safety View Middleware
 */
export function requireClinicalSafetyView(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['clinical_safety_officer', 'clinical_quality_reviewer', 'physician', 'clinical_supervisor', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Clinical safety inspection authority required.' });
    return;
  }
  next();
}

/**
 * V22 Clinical Safety Manage Middleware
 */
export function requireClinicalSafetyManage(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['clinical_safety_officer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Clinical safety management authority required.' });
    return;
  }
  next();
}

/**
 * V22 Clinical Safety Approve Middleware
 */
export function requireClinicalSafetyApprove(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['clinical_safety_officer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Clinical safety approval authority required.' });
    return;
  }
  next();
}

/**
 * V22 Clinical Validation Review Middleware
 */
export function requireClinicalValidationReview(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['clinical_quality_reviewer', 'clinical_safety_officer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Clinical quality review authority required.' });
    return;
  }
  next();
}

/**
 * V22 Clinical Incident Close Middleware
 */
export function requireClinicalIncidentClose(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['clinical_safety_officer', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Clinical safety incident closure authority required.' });
    return;
  }
  next();
}

/**
 * V24 Multi-Site Evidence Lead Middleware
 */
export function requireMultiSiteEvidenceLead(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    return;
  }
  const isAuthorized = principal.roles.some((r) =>
    ['multisite_evidence_lead', 'pilot_operations_director', 'system_administrator'].includes(r)
  );
  if (!isAuthorized) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Multi-site evidence lead authority required.' });
    return;
  }
  next();
}

/**
 * Clinical AI Endpoint Authorization Middleware (POST /api/ai/clinical-assist)
 * Strictly enforces:
 * 1. User must be authenticated (req.authenticatedPrincipal present).
 * 2. User must possess a qualified clinical or supervisor role authorized for decision support.
 * 3. User must have an active facility association.
 * 4. Fails closed with 403 FORBIDDEN if unauthorized.
 */
export const CLINICAL_AI_AUTHORIZED_ROLES = [
  'physician',
  'health_officer',
  'nurse',
  'clinical_supervisor',
  'pharmacist',
  'laboratory_staff',
  'radiology_staff',
  'radiologist',
  'clinical_safety_officer',
  'clinical_quality_reviewer',
  'system_administrator',
];

export function requireClinicalAIAuth(req: Request, res: Response, next: NextFunction): void {
  const principal = req.authenticatedPrincipal;
  if (!principal) {
    res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication required to access clinical AI decision support.',
    });
    return;
  }

  // Authorization check: clinical or oversight roles only
  const hasAuthorizedRole = principal.roles.some((r) => CLINICAL_AI_AUTHORIZED_ROLES.includes(r));
  if (!hasAuthorizedRole) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: `Access denied: Role(s) [${principal.roles.join(', ')}] are not authorized to invoke clinical AI decision support.`,
    });
    return;
  }

  // Facility check: Principal must be associated with at least one facility, or be a system superuser
  const isSystem = principal.roles.includes('system_administrator');
  if (!isSystem && (!principal.facilityIds || principal.facilityIds.length === 0)) {
    res.status(403).json({
      error: 'FACILITY_AUTHORIZATION_DENIED',
      message: `Access denied: Principal '${principal.userId}' has no active facility membership.`,
    });
    return;
  }

  // If request specifies a facilityId (via body, header, or query), verify principal has authority for it
  const targetFacilityId = req.body?.facilityId || (req.headers['x-facility-id'] as string) || (req.query?.facilityId as string);
  if (targetFacilityId && targetFacilityId !== 'all' && !isSystem) {
    const isAuthorizedForTarget = principal.facilityIds.includes(targetFacilityId) || serverLedger.verifyFacilityAccess(principal.userId, targetFacilityId);
    if (!isAuthorizedForTarget) {
      res.status(403).json({
        error: 'FACILITY_ACCESS_FORBIDDEN',
        message: `Access denied: Principal '${principal.userId}' is not authorized for facility '${targetFacilityId}'.`,
      });
      return;
    }
  }

  next();
}






