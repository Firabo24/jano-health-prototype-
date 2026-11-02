/**
 * Jano Health - External System Registry & Policy Engine
 * Clinical Core V12: Authoritative External System Registry
 * 
 * Invariants:
 * 1. Strictly stores and manages ExternalSystem records with trust levels: UNTRUSTED, LIMITED, TRUSTED.
 * 2. Trust status lifecycle: PENDING, TRUSTED, SUSPENDED, REVOKED.
 * 3. Enforces that external systems are NOT automatically internal Jano facilities.
 * 4. Provides safe SSRF URL validation and rate-limit configuration.
 */

import {
  ExternalSystem,
  ExternalSystemTrustLevel,
  ExternalSystemTrustStatus,
  FHIRInteractionType,
} from './gatewayTypes';
import { ExchangeDirection, PartnerAuthType } from './registry';

export class ExternalSystemRegistryService {
  private static instance: ExternalSystemRegistryService;
  private systems = new Map<string, ExternalSystem>();

  private constructor() {
    this.seedDefaultSystems();
  }

  public static getInstance(): ExternalSystemRegistryService {
    if (!ExternalSystemRegistryService.instance) {
      ExternalSystemRegistryService.instance = new ExternalSystemRegistryService();
    }
    return ExternalSystemRegistryService.instance;
  }

  private seedDefaultSystems(): void {
    const defaultSystems: ExternalSystem[] = [
      {
        id: 'sys-tz-moh-hie',
        systemIdentifier: 'TZ-MOH-HIE-001',
        organizationName: 'Ministry of Health - National Health Information Exchange',
        organizationId: 'org-tz-moh',
        endpoint: 'https://hie.moh.go.tz/fhir/r5',
        fhirVersion: '5.0.0',
        active: true,
        trustStatus: 'TRUSTED',
        trustLevel: 'TRUSTED',
        allowedResources: [
          'Patient',
          'Encounter',
          'Condition',
          'Observation',
          'ServiceRequest',
          'MedicationRequest',
          'MedicationDispense',
          'DiagnosticReport',
          'DocumentReference',
          'Bundle',
        ],
        allowedInteractions: ['read', 'search', 'create', 'update', 'transaction', 'batch'],
        allowedFacilities: ['*'],
        allowedDirections: ['INBOUND', 'OUTBOUND'],
        jurisdiction: 'Tanzania',
        authenticationMethod: 'OAUTH2_SMART',
        allowedScopes: [
          'fhir.patient.read',
          'fhir.patient.write',
          'fhir.encounter.read',
          'fhir.observation.read',
          'fhir.condition.read',
          'fhir.diagnostic.read',
          'fhir.medication.read',
          'fhir.medication.request',
          'fhir.medication.dispense.read',
          'fhir.referral.read',
          'fhir.referral.write',
          'fhir.bundle.transaction',
        ],
        rateLimitPerMinute: 300,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
        provenance: 'Registered via National Digital Health Authority protocol',
      },
      {
        id: 'sys-kigoma-referral-node',
        systemIdentifier: 'TZ-KIG-RRH-002',
        organizationName: 'Kigoma Regional Referral Hospital Node',
        organizationId: 'org-kigoma-rrh',
        endpoint: 'https://kigoma-rr-hosp.org/fhir/r5',
        fhirVersion: '5.0.0',
        active: true,
        trustStatus: 'TRUSTED',
        trustLevel: 'LIMITED',
        allowedResources: [
          'Patient',
          'Encounter',
          'Condition',
          'Observation',
          'ServiceRequest',
          'DiagnosticReport',
          'ImagingStudy',
          'DocumentReference',
        ],
        allowedInteractions: ['read', 'search', 'create', 'update'],
        allowedFacilities: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic'],
        allowedDirections: ['INBOUND', 'OUTBOUND'],
        jurisdiction: 'Kigoma Region',
        authenticationMethod: 'MUTUAL_TLS',
        allowedScopes: [
          'fhir.patient.read',
          'fhir.patient.write',
          'fhir.encounter.read',
          'fhir.observation.read',
          'fhir.condition.read',
          'fhir.diagnostic.read',
          'fhir.referral.read',
          'fhir.referral.write',
        ],
        rateLimitPerMinute: 120,
        createdAt: '2026-02-15T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
        provenance: 'Regional Referral Network Cooperation Agreement',
      },
      {
        id: 'sys-africa-cdc-surveillance',
        systemIdentifier: 'ACDC-EPI-003',
        organizationName: 'Africa CDC Integrated Disease Surveillance System',
        organizationId: 'org-africa-cdc',
        endpoint: 'https://surveillance.africacdc.org/fhir/r5',
        fhirVersion: '5.0.0',
        active: true,
        trustStatus: 'TRUSTED',
        trustLevel: 'LIMITED',
        allowedResources: ['Observation', 'Condition', 'Bundle'],
        allowedInteractions: ['create', 'batch'],
        allowedFacilities: ['*'],
        allowedDirections: ['OUTBOUND'],
        jurisdiction: 'Pan-African',
        authenticationMethod: 'API_KEY',
        allowedScopes: ['fhir.observation.read', 'fhir.condition.read'],
        rateLimitPerMinute: 60,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
        provenance: 'Epidemiological Outbreak Reporting Treaty',
      },
      {
        id: 'sys-unverified-clinic',
        systemIdentifier: 'UNVERIFIED-LAB-999',
        organizationName: 'External Private Testing Clinic',
        organizationId: 'org-private-clinic-99',
        endpoint: 'https://private-clinic-untrusted.example.org/fhir',
        fhirVersion: '5.0.0',
        active: false,
        trustStatus: 'PENDING',
        trustLevel: 'UNTRUSTED',
        allowedResources: ['Observation'],
        allowedInteractions: ['create'],
        allowedFacilities: ['fac-uvinza-hc'],
        allowedDirections: ['INBOUND'],
        jurisdiction: 'Local',
        authenticationMethod: 'API_KEY',
        allowedScopes: ['fhir.observation.read'],
        rateLimitPerMinute: 10,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-18T00:00:00Z',
        provenance: 'Self-submitted onboarding request awaiting verification',
      },
    ];

    for (const sys of defaultSystems) {
      this.systems.set(sys.id, sys);
    }
  }

  public registerSystem(system: ExternalSystem): void {
    system.updatedAt = new Date().toISOString();
    this.systems.set(system.id, system);
  }

  public getSystem(id: string): ExternalSystem | undefined {
    return this.systems.get(id);
  }

  public getAllSystems(): ExternalSystem[] {
    return Array.from(this.systems.values());
  }

  public updateTrust(
    id: string,
    trustStatus: ExternalSystemTrustStatus,
    trustLevel: ExternalSystemTrustLevel,
    actorId: string
  ): boolean {
    const sys = this.systems.get(id);
    if (!sys) return false;

    sys.trustStatus = trustStatus;
    sys.trustLevel = trustLevel;
    sys.active = trustStatus === 'TRUSTED';
    sys.updatedAt = new Date().toISOString();
    sys.provenance = `${sys.provenance} | Trust status modified to ${trustStatus} by ${actorId}`;
    return true;
  }

  /**
   * Evaluates trust and scope constraints for an external system.
   */
  public evaluateSystemPermission(
    systemId: string,
    resourceType: string,
    interaction: FHIRInteractionType,
    direction: ExchangeDirection,
    facilityId?: string
  ): { allowed: boolean; reason?: string; system?: ExternalSystem } {
    const system = this.systems.get(systemId);
    if (!system) {
      return { allowed: false, reason: `External system "${systemId}" is not registered in the external registry.` };
    }

    if (!system.active) {
      return { allowed: false, reason: `External system "${system.organizationName}" is deactivated.`, system };
    }

    if (system.trustStatus !== 'TRUSTED') {
      return {
        allowed: false,
        reason: `External system "${system.organizationName}" trust status is ${system.trustStatus} (must be TRUSTED).`,
        system,
      };
    }

    if (system.trustLevel === 'UNTRUSTED') {
      return {
        allowed: false,
        reason: `External system "${system.organizationName}" is categorized as UNTRUSTED by policy.`,
        system,
      };
    }

    if (!system.allowedDirections.includes(direction)) {
      return {
        allowed: false,
        reason: `Exchange direction "${direction}" is not authorized for external system "${system.organizationName}".`,
        system,
      };
    }

    if (!system.allowedInteractions.includes(interaction)) {
      return {
        allowed: false,
        reason: `FHIR interaction "${interaction}" is not permitted for external system "${system.organizationName}".`,
        system,
      };
    }

    if (!system.allowedResources.includes('*') && !system.allowedResources.includes(resourceType)) {
      return {
        allowed: false,
        reason: `Resource type "${resourceType}" is not permitted for external system "${system.organizationName}".`,
        system,
      };
    }

    if (facilityId && !system.allowedFacilities.includes('*') && !system.allowedFacilities.includes(facilityId)) {
      return {
        allowed: false,
        reason: `Facility scope "${facilityId}" is outside authorized boundary for external system "${system.organizationName}".`,
        system,
      };
    }

    return { allowed: true, system };
  }

  /**
   * Anti-SSRF Destination Validator
   */
  public validateDestinationUrl(targetUrl: string): { safe: boolean; error?: string } {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { safe: false, error: 'Protocol must be HTTP or HTTPS.' };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Block AWS/GCP/Azure link-local metadata IP
      if (
        hostname === '169.254.169.254' ||
        hostname === 'metadata.google.internal' ||
        hostname === '169.254.170.2'
      ) {
        return { safe: false, error: 'Access to cloud instance metadata service is strictly blocked.' };
      }

      // Block local/loopback in non-test production
      if (process.env.NODE_ENV === 'production') {
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.16.')
        ) {
          return { safe: false, error: 'Destination resolves to private or loopback subnet in production mode.' };
        }
      }

      return { safe: true };
    } catch {
      return { safe: false, error: 'Malformed destination URL.' };
    }
  }
}

export const externalSystemRegistryService = ExternalSystemRegistryService.getInstance();
