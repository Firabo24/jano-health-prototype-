/**
 * Jano Health - Clinical Core V19: National Identity Service
 * 
 * Manages external national identity verification (e.g. Fayda Ethiopia / National ID Registry)
 * with strict privacy controls, fail-closed boundaries, and offline resilience.
 * 
 * INVARIANTS:
 * - Default adapter is strictly NOT_CONFIGURED.
 * - National Identity ≠ Jano Patient Identity. National ID is strictly OPTIONAL; Jano operates fully without it.
 * - Invariant: UNAVAILABLE ≠ FAILED. An unreachable identity service is NOT proof of identity failure.
 * - Privacy: Raw identity numbers are NEVER stored in plaintext in local databases; only masked references and verification state.
 * - AI cannot approve national identity, override external identity, or merge patients based on AI suggestions.
 */

import {
  INationalIdentityAdapter,
  NationalIdentityReference,
  IdentityVerificationRequest,
  IdentityVerificationResponse,
  NationalIdentityVerificationState,
  NationalIntegrationStatus,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class DefaultNationalIdentityAdapter implements INationalIdentityAdapter {
  public readonly adapterName = 'default_unconfigured_identity_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async verifyIdentity(_query: { nationalId: string; demographicClaims?: Record<string, any> }): Promise<{
    state: NationalIdentityVerificationState;
    matchScore: number;
    maskedIdentity: string;
    error?: string;
  }> {
    return {
      state: 'NOT_CONFIGURED',
      matchScore: 0,
      maskedIdentity: 'UNKNOWN',
      error: 'National Identity Adapter is strictly NOT_CONFIGURED.',
    };
  }
}

export class SandboxNationalIdentityAdapter implements INationalIdentityAdapter {
  public readonly adapterName = 'sandbox_identity_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  public async verifyIdentity(query: { nationalId: string; demographicClaims?: Record<string, any> }): Promise<{
    state: NationalIdentityVerificationState;
    matchScore: number;
    maskedIdentity: string;
    error?: string;
  }> {
    const raw = query.nationalId.trim();
    const masked = raw.length > 4 ? `******${raw.slice(-4)}` : '******';

    if (raw === 'ETH-ID-VALID-1234') {
      return {
        state: 'VERIFIED',
        matchScore: 0.98,
        maskedIdentity: masked,
      };
    }

    if (raw === 'ETH-ID-EXPIRED-9999') {
      return {
        state: 'EXPIRED',
        matchScore: 0.95,
        maskedIdentity: masked,
        error: 'National identity credential has expired.',
      };
    }

    if (raw === 'ETH-ID-SIMULATE-TIMEOUT') {
      // Invariant: Simulating external timeout / outage returns UNAVAILABLE, NOT FAILED!
      return {
        state: 'UNAVAILABLE',
        matchScore: 0,
        maskedIdentity: masked,
        error: 'External identity gateway timeout (UNAVAILABLE ≠ FAILED).',
      };
    }

    return {
      state: 'FAILED',
      matchScore: 0.1,
      maskedIdentity: masked,
      error: 'Demographic claims do not match registry records.',
    };
  }
}

export class NationalIdentityService {
  private static instance: NationalIdentityService;
  private adapter: INationalIdentityAdapter;

  private constructor() {
    this.adapter = new DefaultNationalIdentityAdapter();
  }

  public static getInstance(): NationalIdentityService {
    if (!NationalIdentityService.instance) {
      NationalIdentityService.instance = new NationalIdentityService();
    }
    return NationalIdentityService.instance;
  }

  public setAdapter(adapter: INationalIdentityAdapter): void {
    this.adapter = adapter;
  }

  public getAdapterStatus(): NationalIntegrationStatus {
    return this.adapter.status;
  }

  // ----------------------------------------------------
  // Verification Workflow
  // ----------------------------------------------------

  public async requestVerification(params: {
    patientId: string;
    rawNationalId: string;
    demographicClaims?: Record<string, any>;
    actorId: string;
  }): Promise<{
    request: IdentityVerificationRequest;
    response: IdentityVerificationResponse;
    reference: NationalIdentityReference;
  }> {
    const now = new Date().toISOString();
    const requestId = `idreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const request: IdentityVerificationRequest = {
      requestId,
      patientId: params.patientId,
      requestedFields: Object.keys(params.demographicClaims || {}),
      requestedAt: now,
      status: 'PENDING',
    };
    await idbEngine.put('identityVerificationRequests', request);

    // Call external adapter
    const adapterResult = await this.adapter.verifyIdentity({
      nationalId: params.rawNationalId,
      demographicClaims: params.demographicClaims,
    });

    request.status = adapterResult.state === 'VERIFIED' ? 'COMPLETED' : 'FAILED';
    await idbEngine.put('identityVerificationRequests', request);

    const responseId = `idresp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const response: IdentityVerificationResponse = {
      responseId,
      requestId,
      status: adapterResult.state,
      externalMatchScore: adapterResult.matchScore,
      timestamp: now,
      provenance: {
        systemResponseCode: adapterResult.error || 'OK',
      },
    };
    await idbEngine.put('identityVerificationResponses', response);

    // Save identity reference with masked ID (privacy-preserving)
    const referenceId = `idref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const reference: NationalIdentityReference = {
      referenceId,
      patientId: params.patientId,
      identitySystem: 'FAYDA_ETHIOPIA',
      maskedIdentityNumber: adapterResult.maskedIdentity,
      verificationState: adapterResult.state,
      verifiedAt: adapterResult.state === 'VERIFIED' ? now : undefined,
      expiresAt: adapterResult.state === 'VERIFIED' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : undefined,
      source: this.adapter.adapterName,
      freshness: 'CURRENT',
      provenance: {
        verifiedBy: params.actorId,
        verificationMethod: 'ONLINE_API',
        timestamp: now,
      },
    };
    await idbEngine.put('nationalIdentityReferences', reference);

    return { request, response, reference };
  }

  public async getIdentityReference(patientId: string): Promise<NationalIdentityReference | null> {
    const all = await idbEngine.getAll<NationalIdentityReference>('nationalIdentityReferences');
    const matched = all.find((r) => r.patientId === patientId);
    return matched || null;
  }
}

export const nationalIdentityService = NationalIdentityService.getInstance();
