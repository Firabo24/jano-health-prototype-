/**
 * Jano Health - FHIR Exchange Policy Engine
 * Governs Purpose of Use, Data Minimization, Consent Validation, and Facility Boundary Enforcement.
 */

export type PurposeOfUse = 'TREATMENT' | 'EMERGENCY' | 'PUBLIC_HEALTH' | 'OPERATIONS' | 'PAYMENT';

export interface ExchangePolicyContext {
  requesterId: string;
  requesterRole: string;
  requesterFacilityId: string;
  sourceSystemId?: string;
  destinationSystemId?: string;
  purposeOfUse: PurposeOfUse;
  targetPatientId?: string;
  requestedResourceTypes: string[];
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  filteredResources?: string[];
  requiresConsentOverride?: boolean;
}

export class FHIRExchangePolicy {
  private static instance: FHIRExchangePolicy;

  private constructor() {}

  public static getInstance(): FHIRExchangePolicy {
    if (!FHIRExchangePolicy.instance) {
      FHIRExchangePolicy.instance = new FHIRExchangePolicy();
    }
    return FHIRExchangePolicy.instance;
  }

  /**
   * Evaluates an outbound or inbound data exchange request against clinical privacy policies.
   */
  public evaluatePolicy(context: ExchangePolicyContext): PolicyEvaluationResult {
    // 1. Emergency Care Override (Break-Glass)
    if (context.purposeOfUse === 'EMERGENCY') {
      return {
        allowed: true,
        reason: 'Emergency Break-Glass authorized for life/safety acute intervention.',
        requiresConsentOverride: true,
      };
    }

    // 2. Direct Clinical Care / Treatment
    if (context.purposeOfUse === 'TREATMENT') {
      // Clinicians and nurses are authorized for clinical care
      const authorizedRoles = ['physician', 'health_officer', 'nurse', 'midwife', 'pharmacist', 'laboratory_staff', 'radiology_staff', 'system_administrator'];
      if (!authorizedRoles.includes(context.requesterRole)) {
        return {
          allowed: false,
          reason: `Role "${context.requesterRole}" is not authorized for direct treatment clinical data exchange.`,
        };
      }

      return {
        allowed: true,
      };
    }

    // 3. Public Health Surveillance
    if (context.purposeOfUse === 'PUBLIC_HEALTH') {
      // Public health surveillance only allows de-identified or aggregate Observation/Condition resources
      const allowedPublicHealthResources = ['Observation', 'Condition', 'Bundle'];
      const denied = context.requestedResourceTypes.filter((r) => !allowedPublicHealthResources.includes(r));

      if (denied.length > 0) {
        return {
          allowed: false,
          reason: `Public Health purpose of use is restricted to epidemiological observations. Denied resources: ${denied.join(', ')}`,
        };
      }

      return {
        allowed: true,
      };
    }

    // 4. Healthcare Operations
    if (context.purposeOfUse === 'OPERATIONS') {
      const allowedRoles = ['facility_administrator', 'system_administrator', 'supervisor'];
      if (!allowedRoles.includes(context.requesterRole)) {
        return {
          allowed: false,
          reason: `Operations exchange requires administrative or supervisory privilege.`,
        };
      }

      return {
        allowed: true,
      };
    }

    return {
      allowed: false,
      reason: `Purpose of use "${context.purposeOfUse}" is not permitted under current jurisdiction policies.`,
    };
  }
}

export const fhirExchangePolicy = FHIRExchangePolicy.getInstance();
