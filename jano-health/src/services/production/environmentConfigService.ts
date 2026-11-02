/**
 * Jano Health - Environment Configuration & Secret Management Services
 * 
 * Enforces strict environment separation (DEVELOPMENT, TEST, STAGING, PRODUCTION),
 * fail-closed production validation, secret reference management without raw secrets in code,
 * secret rotation, and configuration drift detection.
 */

import {
  DeploymentEnvironment,
  EnvironmentConfig,
  SecretReference,
  ConfigurationSnapshot,
  FeatureFlag,
  V21_INVARIANTS,
} from '../../domain/v21ProductionTypes';
import { idbEngine } from '../storage/indexedDbEngine';

// Cryptographic hash helper (Web Crypto or fallback)
export async function computeSha256(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Simple deterministic fallback for non-crypto node environments
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export class EnvironmentConfigService {
  private static instance: EnvironmentConfigService;
  private currentEnvironment: DeploymentEnvironment = 'PRODUCTION';
  private runningConfig: EnvironmentConfig;

  private constructor() {
    this.runningConfig = {
      environment: 'PRODUCTION',
      facilityScope: 'FACILITY_DEFAULT',
      externalEndpoints: {
        nationalRegistry: 'https://national-registry.moh.gov/v1',
        fhirGateway: 'https://fhir.janohealth.org/r5',
        insuranceExchange: 'https://insurance.claims.health/v1',
        surveillanceHub: 'https://surveillance.epidemiology.gov/v1',
      },
      failClosed: true,
      allowDevelopmentFallback: false,
      telemetryLevel: 'STANDARD',
      featureFlagDefaults: {
        enableNationalSync: true,
        enableOfflineEncryption: true,
        enableGovernedAutomation: true,
      },
      authenticationMode: 'SECURE_STRICT',
      secretProvider: 'vault://jano-vault.internal',
      databaseName: 'JanoHealth_Clinical_v1',
      version: '21.0.0',
    };
  }

  public static getInstance(): EnvironmentConfigService {
    if (!EnvironmentConfigService.instance) {
      EnvironmentConfigService.instance = new EnvironmentConfigService();
    }
    return EnvironmentConfigService.instance;
  }

  public getEnvironment(): DeploymentEnvironment {
    return this.currentEnvironment;
  }

  public setEnvironment(env: DeploymentEnvironment): void {
    this.currentEnvironment = env;
    this.runningConfig.environment = env;
    if (env === 'PRODUCTION') {
      this.runningConfig.allowDevelopmentFallback = false;
      this.runningConfig.failClosed = true;
      this.runningConfig.authenticationMode = 'SECURE_STRICT';
    }
  }

  public getConfig(): EnvironmentConfig {
    return { ...this.runningConfig };
  }

  /**
   * Validates production configuration. If invalid, FAILS STARTUP SAFELY.
   */
  public validateProductionConfiguration(config: EnvironmentConfig): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Production Invariant Check: Never allow development fallback in production
    if (config.environment === 'PRODUCTION') {
      if (config.allowDevelopmentFallback) {
        errors.push('PROD_CONFIG_ERROR: Production must never allow development fallback.');
      }
      if (!config.failClosed) {
        errors.push('PROD_CONFIG_ERROR: Production must fail-closed on external integrations.');
      }
      if (config.authenticationMode !== 'SECURE_STRICT') {
        errors.push('PROD_CONFIG_ERROR: Production requires SECURE_STRICT authentication.');
      }
      if (!config.secretProvider || config.secretProvider.startsWith('mock://')) {
        errors.push('PROD_CONFIG_ERROR: Production requires a secure secret provider reference.');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Captures a configuration snapshot and detects configuration drift.
   */
  public async captureSnapshot(actor: string, approvedBy: string): Promise<ConfigurationSnapshot> {
    const serialized = JSON.stringify(this.runningConfig);
    const configHash = await computeSha256(serialized);

    // Retrieve previous snapshot to detect drift
    const prevSnapshots = await idbEngine.getAll<ConfigurationSnapshot>('configurationSnapshots');
    const lastSnapshot = prevSnapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

    const driftDetected = !!lastSnapshot && lastSnapshot.configHash !== configHash;
    const driftDetails: string[] = [];
    if (driftDetected) {
      driftDetails.push(`Configuration hash modified from ${lastSnapshot.configHash.slice(0, 8)} to ${configHash.slice(0, 8)}`);
    }

    const snapshot: ConfigurationSnapshot = {
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      environment: this.currentEnvironment,
      version: this.runningConfig.version,
      timestamp: new Date().toISOString(),
      configHash,
      actor,
      approvedBy,
      driftDetected,
      driftDetails: driftDetails.length ? driftDetails : undefined,
      runningConfig: { ...this.runningConfig },
    };

    await idbEngine.put('configurationSnapshots', snapshot);
    return snapshot;
  }
}

export class SecretManagementService {
  private static instance: SecretManagementService;

  private constructor() {}

  public static getInstance(): SecretManagementService {
    if (!SecretManagementService.instance) {
      SecretManagementService.instance = new SecretManagementService();
    }
    return SecretManagementService.instance;
  }

  /**
   * Registers a secret reference (never stores raw secrets in code or persistent state).
   */
  public async registerSecret(
    name: string,
    providerRef: string,
    version: string,
    allowedRoles: string[],
    expiresAt?: string
  ): Promise<SecretReference> {
    if (providerRef.includes('password=') || providerRef.includes('key=secret_')) {
      throw new Error('SECURITY_VIOLATION: Raw secrets must never be embedded in provider references.');
    }

    const secret: SecretReference = {
      secretId: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      providerRef,
      version,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      expiresAt,
      allowedRoles,
    };

    await idbEngine.put('secretReferences', secret);
    return secret;
  }

  /**
   * Rotates a secret reference safely.
   */
  public async rotateSecret(
    secretId: string,
    newProviderRef: string,
    newVersion: string
  ): Promise<SecretReference> {
    const secret = await idbEngine.get<SecretReference>('secretReferences', secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    const updated: SecretReference = {
      ...secret,
      providerRef: newProviderRef,
      version: newVersion,
      status: 'ACTIVE',
      lastRotatedAt: new Date().toISOString(),
    };

    await idbEngine.put('secretReferences', updated);
    return updated;
  }

  /**
   * Validates if a secret reference is usable. Fails safely on expired or revoked secrets.
   */
  public async validateSecretUsable(secretId: string, role: string): Promise<{
    isUsable: boolean;
    reason?: string;
  }> {
    const secret = await idbEngine.get<SecretReference>('secretReferences', secretId);
    if (!secret) {
      return { isUsable: false, reason: 'SECRET_NOT_FOUND' };
    }

    if (secret.status === 'REVOKED') {
      return { isUsable: false, reason: 'SECRET_REVOKED' };
    }

    if (secret.status === 'EXPIRED') {
      return { isUsable: false, reason: 'SECRET_EXPIRED' };
    }

    if (secret.expiresAt && new Date(secret.expiresAt).getTime() < Date.now()) {
      secret.status = 'EXPIRED';
      await idbEngine.put('secretReferences', secret);
      return { isUsable: false, reason: 'SECRET_EXPIRED' };
    }

    if (!secret.allowedRoles.includes(role) && !secret.allowedRoles.includes('*')) {
      return { isUsable: false, reason: 'ROLE_UNAUTHORIZED_FOR_SECRET' };
    }

    return { isUsable: true };
  }
}

export class FeatureFlagService {
  private static instance: FeatureFlagService;

  private constructor() {}

  public static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService();
    }
    return FeatureFlagService.instance;
  }

  public async setFeatureFlag(flag: Omit<FeatureFlag, 'flagId' | 'version' | 'provenance'>): Promise<FeatureFlag> {
    const record: FeatureFlag = {
      ...flag,
      flagId: `flag_${flag.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      version: 1,
      provenance: `GOVERNED_ROLLOUT_OWNED_BY_${flag.owner.toUpperCase()}`,
    };
    await idbEngine.put('featureFlags', record);
    return record;
  }

  /**
   * Evaluates feature flag.
   * INVARIANT: FeatureFlag DOES NOT BYPASS RBAC!
   */
  public async isFeatureActive(
    flagId: string,
    facilityId: string,
    hasPermission: boolean
  ): Promise<boolean> {
    const flag = await idbEngine.get<FeatureFlag>('featureFlags', flagId);
    if (!flag) return false;

    let flagEnabled = false;
    if (flag.status === 'GLOBAL') {
      flagEnabled = true;
    } else if (flag.status === 'FACILITY_PILOT' && flag.scope.includes(facilityId)) {
      flagEnabled = true;
    } else if (flag.status === 'TESTING') {
      flagEnabled = true;
    }

    // Hard Invariant Check: A feature being enabled DOES NOT grant permission.
    return V21_INVARIANTS.assertFeatureFlagDoesNotBypassRBAC(flagEnabled, hasPermission);
  }
}

export const environmentConfigService = EnvironmentConfigService.getInstance();
export const secretManagementService = SecretManagementService.getInstance();
export const featureFlagService = FeatureFlagService.getInstance();
