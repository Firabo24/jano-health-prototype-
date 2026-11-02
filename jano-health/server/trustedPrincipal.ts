/**
 * Jano Health - Trusted Principal Registry & Provenance Verification
 * 
 * Cryptographically sound / reference-bound provenance tracking:
 * - Genuine authenticated principals are minted and registered exclusively by server authentication middleware.
 * - Stored in a private server-side WeakMap to ensure reference identity.
 * - Caller-supplied object literals, shallow clones ({ ...p }), JSON serialized copies,
 *   or forged request bodies NEVER match the registry.
 * - Principals and their security-relevant fields are frozen to prevent tampering.
 */

export interface ValidatedPrincipalData {
  readonly userId: string;
  readonly provider: 'local_development' | 'firebase_auth';
  readonly roles: readonly string[];
  readonly facilityIds: readonly string[];
  readonly email?: string;
  readonly tenantId?: string;
  readonly accountStatus?: 'active' | 'suspended' | 'revoked';
  readonly syncCapabilities?: readonly string[];
  readonly authenticatedAt: string;
}

// Private server-side registry. Not exported outside this module.
const TRUSTED_PRINCIPAL_REGISTRY = new WeakMap<object, ValidatedPrincipalData>();

/**
 * Register a server-authenticated principal after successful credential validation.
 * Deep-freezes security-critical fields and records validated snapshot in WeakMap.
 */
export function registerServerAuthenticatedPrincipal<T extends object>(
  principal: T,
  overrides?: Partial<ValidatedPrincipalData>
): T {
  if (!principal || typeof principal !== 'object') {
    throw new Error('PRINCIPAL_INVALID: Principal must be a non-null object');
  }

  const p = principal as any;
  const userId = typeof p.userId === 'string' ? p.userId.trim() : '';
  if (!userId) {
    throw new Error('PRINCIPAL_INVALID: Principal must have a valid non-empty userId');
  }

  const rawRoles: string[] = Array.isArray(p.roles)
    ? p.roles.filter((r: unknown) => typeof r === 'string')
    : [];

  const rawFacilities: string[] = Array.isArray(p.facilityIds)
    ? p.facilityIds.filter((f: unknown) => typeof f === 'string')
    : [];

  const rawCapabilities: string[] | undefined = Array.isArray(p.syncCapabilities)
    ? p.syncCapabilities.filter((c: unknown) => typeof c === 'string')
    : undefined;

  const provider: 'local_development' | 'firebase_auth' =
    p.provider === 'firebase_auth' ? 'firebase_auth' : 'local_development';

  const validatedData: ValidatedPrincipalData = {
    userId,
    provider: overrides?.provider || provider,
    roles: Object.freeze(overrides?.roles ? [...overrides.roles] : [...rawRoles]),
    facilityIds: Object.freeze(overrides?.facilityIds ? [...overrides.facilityIds] : [...rawFacilities]),
    email: overrides?.email !== undefined ? overrides.email : (typeof p.email === 'string' ? p.email : undefined),
    tenantId: overrides?.tenantId !== undefined ? overrides.tenantId : (typeof p.tenantId === 'string' ? p.tenantId : undefined),
    accountStatus: overrides?.accountStatus !== undefined ? overrides.accountStatus : (p.accountStatus || 'active'),
    syncCapabilities: overrides?.syncCapabilities ? Object.freeze([...overrides.syncCapabilities]) : (rawCapabilities ? Object.freeze([...rawCapabilities]) : undefined),
    authenticatedAt: overrides?.authenticatedAt || new Date().toISOString(),
  };

  // Deep-freeze the principal's security-critical fields to prevent mutation
  try {
    Object.freeze(p.roles);
  } catch {}
  try {
    Object.freeze(p.facilityIds);
  } catch {}
  if (p.syncCapabilities) {
    try {
      Object.freeze(p.syncCapabilities);
    } catch {}
  }
  try {
    Object.freeze(principal);
  } catch {}

  TRUSTED_PRINCIPAL_REGISTRY.set(principal, validatedData);
  return principal;
}

/**
 * Retrieve verified principal data if the candidate is in the trusted registry.
 * Returns null if the candidate is untrusted, forged, cloned, or serialized.
 */
export function getTrustedPrincipalData(candidate: unknown): ValidatedPrincipalData | null {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  return TRUSTED_PRINCIPAL_REGISTRY.get(candidate as object) || null;
}

/**
 * Check if a candidate object is a genuine server-authenticated principal.
 */
export function isServerAuthenticatedPrincipal(candidate: unknown): boolean {
  return getTrustedPrincipalData(candidate) !== null;
}
