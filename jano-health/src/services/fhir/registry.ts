/**
 * Jano Health - External Partner System Registry & Anti-SSRF Guard
 * Strictly governs external health organizations, national registries, and regional health information exchanges.
 * 
 * SECURITY INVARIANT:
 * Never dispatch network requests to unauthorized external destinations or internal private IP addresses (SSRF prevention).
 */

export type ExternalPartnerTrustStatus = 'VERIFIED' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED';
export type ExchangeDirection = 'INBOUND' | 'OUTBOUND';
export type PartnerAuthType = 'MUTUAL_TLS' | 'OAUTH2_SMART' | 'API_KEY' | 'SHARED_SECRET';

export interface ExternalPartnerSystem {
  systemId: string;
  organizationName: string;
  endpointUrl: string;
  fhirVersion: string;
  trustStatus: ExternalPartnerTrustStatus;
  allowedResources: string[];
  allowedDirections: ExchangeDirection[];
  facilityScopes: string[];
  authenticationType: PartnerAuthType;
  jurisdiction: string;
  active: boolean;
  registeredAt: string;
  lastContactAt?: string;
}

export class ExternalSystemRegistry {
  private static instance: ExternalSystemRegistry;
  private partners = new Map<string, ExternalPartnerSystem>();

  private constructor() {
    this.seedDefaultPartners();
  }

  public static getInstance(): ExternalSystemRegistry {
    if (!ExternalSystemRegistry.instance) {
      ExternalSystemRegistry.instance = new ExternalSystemRegistry();
    }
    return ExternalSystemRegistry.instance;
  }

  private seedDefaultPartners(): void {
    // 1. National Health Information Exchange (Tanzania / MOH HIE)
    this.registerPartner({
      systemId: 'sys-tz-moh-hie',
      organizationName: 'Ministry of Health - National Health Information Exchange',
      endpointUrl: 'https://hie.moh.go.tz/fhir/r5',
      fhirVersion: '5.0.0',
      trustStatus: 'VERIFIED',
      allowedResources: ['Patient', 'Encounter', 'Condition', 'Observation', 'ServiceRequest', 'MedicationRequest', 'Bundle'],
      allowedDirections: ['INBOUND', 'OUTBOUND'],
      facilityScopes: ['*'],
      authenticationType: 'OAUTH2_SMART',
      jurisdiction: 'Tanzania',
      active: true,
      registeredAt: '2026-01-01T00:00:00Z',
    });

    // 2. Kigoma Regional Referral Hospital Partner Node
    this.registerPartner({
      systemId: 'sys-kigoma-referral-node',
      organizationName: 'Kigoma Regional Referral Hospital',
      endpointUrl: 'https://kigoma-rr-hosp.org/fhir',
      fhirVersion: '5.0.0',
      trustStatus: 'VERIFIED',
      allowedResources: ['Patient', 'Encounter', 'ServiceRequest', 'Task', 'DiagnosticReport', 'ImagingStudy'],
      allowedDirections: ['INBOUND', 'OUTBOUND'],
      facilityScopes: ['fac-kigoma-dh', 'fac-uvinza-hc', 'fac-nguruka-clinic'],
      authenticationType: 'MUTUAL_TLS',
      jurisdiction: 'Kigoma',
      active: true,
      registeredAt: '2026-02-15T00:00:00Z',
    });

    // 3. National Disease Surveillance / Epidemic Monitor (WHO/CDC Africa)
    this.registerPartner({
      systemId: 'sys-africa-cdc-surveillance',
      organizationName: 'Africa CDC Integrated Disease Surveillance System',
      endpointUrl: 'https://surveillance.africacdc.org/fhir/r5',
      fhirVersion: '5.0.0',
      trustStatus: 'VERIFIED',
      allowedResources: ['Observation', 'Condition', 'Bundle'],
      allowedDirections: ['OUTBOUND'],
      facilityScopes: ['*'],
      authenticationType: 'API_KEY',
      jurisdiction: 'Pan-African',
      active: true,
      registeredAt: '2026-03-01T00:00:00Z',
    });
  }

  public registerPartner(partner: ExternalPartnerSystem): void {
    this.partners.set(partner.systemId, partner);
  }

  public getPartner(systemId: string): ExternalPartnerSystem | undefined {
    return this.partners.get(systemId);
  }

  public getAllPartners(): ExternalPartnerSystem[] {
    return Array.from(this.partners.values());
  }

  public isAuthorized(
    systemId: string,
    resourceType: string,
    direction: ExchangeDirection,
    facilityId?: string
  ): { authorized: boolean; reason?: string } {
    const partner = this.partners.get(systemId);
    if (!partner) {
      return { authorized: false, reason: `Partner system "${systemId}" is not registered.` };
    }

    if (!partner.active || partner.trustStatus !== 'VERIFIED') {
      return { authorized: false, reason: `Partner system "${systemId}" trust status is ${partner.trustStatus} (inactive/unverified).` };
    }

    if (!partner.allowedDirections.includes(direction)) {
      return { authorized: false, reason: `Direction "${direction}" is not authorized for partner "${systemId}".` };
    }

    if (!partner.allowedResources.includes('*') && !partner.allowedResources.includes(resourceType)) {
      return { authorized: false, reason: `Resource type "${resourceType}" is not permitted for partner "${systemId}".` };
    }

    if (facilityId && !partner.facilityScopes.includes('*') && !partner.facilityScopes.includes(facilityId)) {
      return { authorized: false, reason: `Facility scope "${facilityId}" is outside authorized jurisdiction for partner "${systemId}".` };
    }

    return { authorized: true };
  }

  /**
   * SSRF Prevention Guard:
   * Validates URLs to prevent SSRF attacks targeting cloud metadata endpoints or loopback/private subnets.
   */
  public validateDestinationUrl(targetUrl: string): { safe: boolean; error?: string } {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { safe: false, error: 'Protocol must be HTTP or HTTPS.' };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Block AWS/GCP/Azure link-local metadata IP
      if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
        return { safe: false, error: 'Access to cloud instance metadata service is strictly blocked.' };
      }

      // Block local/loopback in non-test production
      if (process.env.NODE_ENV === 'production') {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
          return { safe: false, error: 'Destination resolves to private or loopback subnet in production mode.' };
        }
      }

      return { safe: true };
    } catch {
      return { safe: false, error: 'Malformed destination URL.' };
    }
  }
}

export const externalSystemRegistry = ExternalSystemRegistry.getInstance();
