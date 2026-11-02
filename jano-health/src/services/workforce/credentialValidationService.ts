/**
 * Jano Health - Clinical Core V16: Credential Validation Service
 * 
 * Manages workforce licensing, certifications, specialty scopes, and facility credentials.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - Never fabricate licensing information.
 * - Credential expiry or revocation updates operational standing, BUT DOES NOT destroy
 *   or retroactively invalidate historical clinical documentation or encounters.
 * - Credential ≠ RBAC Authorization: A valid license does not bypass authenticated RBAC.
 */

import {
  WorkforceCredential,
  CredentialVerificationStatus,
  CredentialScope,
} from '../../domain/v16WorkforceTypes';
import { workforceService } from './workforceService';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export interface CredentialValidationResult {
  valid: boolean;
  status: CredentialVerificationStatus;
  reasons: string[];
  daysUntilExpiry?: number;
}

export class CredentialValidationService {
  private static instance: CredentialValidationService;
  private credentials: Map<string, WorkforceCredential> = new Map();

  private constructor() {
    this.seedInitialCredentials();
  }

  public static getInstance(): CredentialValidationService {
    if (!CredentialValidationService.instance) {
      CredentialValidationService.instance = new CredentialValidationService();
    }
    return CredentialValidationService.instance;
  }

  private seedInitialCredentials() {
    // Seed initial Dr. Amani and Nurse Zawadi credentials from workforceService
    const drAmani = workforceService.getMember('wfm-dr-amani');
    if (drAmani?.credentials) {
      for (const cred of drAmani.credentials) {
        this.credentials.set(cred.credentialId, cred);
      }
    }
    const nurseZawadi = workforceService.getMember('wfm-nurse-zawadi');
    if (nurseZawadi?.credentials) {
      for (const cred of nurseZawadi.credentials) {
        this.credentials.set(cred.credentialId, cred);
      }
    }
  }

  public async registerCredential(params: {
    workforceMemberId: string;
    credentialType: WorkforceCredential['credentialType'];
    issuingAuthority: string;
    credentialReference: string;
    effectiveFrom: string;
    expiresAt: string;
    scope?: CredentialScope;
    verificationStatus?: CredentialVerificationStatus;
    actorId: string;
    facilityId: string;
  }): Promise<WorkforceCredential> {
    const member = workforceService.getMember(params.workforceMemberId);
    if (!member) {
      throw new Error(`Workforce member not found: ${params.workforceMemberId}`);
    }

    const credentialId = `crd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const cred: WorkforceCredential = {
      credentialId,
      workforceMemberId: params.workforceMemberId,
      credentialType: params.credentialType,
      issuingAuthority: params.issuingAuthority,
      credentialReference: params.credentialReference,
      effectiveFrom: params.effectiveFrom,
      expiresAt: params.expiresAt,
      verificationStatus: params.verificationStatus || 'PENDING',
      scope: params.scope || {},
      provenance: {
        verifiedBy: params.verificationStatus === 'VERIFIED' ? params.actorId : undefined,
        verifiedAt: params.verificationStatus === 'VERIFIED' ? new Date().toISOString() : undefined,
        source: 'FACILITY_ADMIN_REGISTRATION',
      },
    };

    this.credentials.set(credentialId, cred);

    // Link into member record
    member.credentials = [
      ...member.credentials.filter((c) => c.credentialId !== credentialId),
      cred,
    ];

    try {
      await idbEngine.put('workforceCredentials' as any, cred);
      await idbEngine.put('workforceMembers' as any, member);
    } catch {}

    await auditService.log({
      action: 'WORKFORCE_CREDENTIAL_REGISTERED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        credentialId,
        workforceMemberId: params.workforceMemberId,
        type: cred.credentialType,
        authority: cred.issuingAuthority,
        reference: cred.credentialReference,
      },
    });

    return cred;
  }

  public async verifyCredential(params: {
    credentialId: string;
    actorId: string;
    facilityId: string;
    source?: string;
  }): Promise<WorkforceCredential> {
    const cred = this.credentials.get(params.credentialId);
    if (!cred) {
      throw new Error(`Credential not found: ${params.credentialId}`);
    }

    cred.verificationStatus = 'VERIFIED';
    cred.provenance = {
      verifiedBy: params.actorId,
      verifiedAt: new Date().toISOString(),
      source: params.source || 'OFFICIAL_REGISTRY_VERIFICATION',
    };

    this.credentials.set(cred.credentialId, cred);

    // Update in member record
    const member = workforceService.getMember(cred.workforceMemberId);
    if (member) {
      member.credentials = member.credentials.map((c) =>
        c.credentialId === cred.credentialId ? cred : c
      );
      try {
        await idbEngine.put('workforceMembers' as any, member);
      } catch {}
    }

    try {
      await idbEngine.put('workforceCredentials' as any, cred);
    } catch {}

    await auditService.log({
      action: 'CREDENTIAL_VERIFIED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        credentialId: cred.credentialId,
        workforceMemberId: cred.workforceMemberId,
        verificationStatus: 'VERIFIED',
      },
    });

    return cred;
  }

  public async revokeCredential(params: {
    credentialId: string;
    reason: string;
    actorId: string;
    facilityId: string;
  }): Promise<WorkforceCredential> {
    const cred = this.credentials.get(params.credentialId);
    if (!cred) {
      throw new Error(`Credential not found: ${params.credentialId}`);
    }

    cred.verificationStatus = 'REVOKED';
    this.credentials.set(cred.credentialId, cred);

    // Update in member record
    const member = workforceService.getMember(cred.workforceMemberId);
    if (member) {
      member.credentials = member.credentials.map((c) =>
        c.credentialId === cred.credentialId ? cred : c
      );
      try {
        await idbEngine.put('workforceMembers' as any, member);
      } catch {}
    }

    try {
      await idbEngine.put('workforceCredentials' as any, cred);
    } catch {}

    await auditService.log({
      action: 'CREDENTIAL_REVOKED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        credentialId: cred.credentialId,
        workforceMemberId: cred.workforceMemberId,
        reason: params.reason,
      },
    });

    return cred;
  }

  public async suspendCredential(params: {
    credentialId: string;
    reason: string;
    actorId: string;
    facilityId: string;
  }): Promise<WorkforceCredential> {
    const cred = this.credentials.get(params.credentialId);
    if (!cred) {
      throw new Error(`Credential not found: ${params.credentialId}`);
    }

    cred.verificationStatus = 'SUSPENDED';
    this.credentials.set(cred.credentialId, cred);

    const member = workforceService.getMember(cred.workforceMemberId);
    if (member) {
      member.credentials = member.credentials.map((c) =>
        c.credentialId === cred.credentialId ? cred : c
      );
      try {
        await idbEngine.put('workforceMembers' as any, member);
      } catch {}
    }

    try {
      await idbEngine.put('workforceCredentials' as any, cred);
    } catch {}

    await auditService.log({
      action: 'CREDENTIAL_SUSPENDED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: {
        credentialId: cred.credentialId,
        workforceMemberId: cred.workforceMemberId,
        reason: params.reason,
      },
    });

    return cred;
  }

  public validateCredential(
    credentialId: string,
    context?: {
      facilityId?: string;
      department?: string;
      specialty?: string;
      asOfDate?: string;
    }
  ): CredentialValidationResult {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return {
        valid: false,
        status: 'UNVERIFIED',
        reasons: [`Credential not found: ${credentialId}`],
      };
    }

    const reasons: string[] = [];
    const checkDate = context?.asOfDate ? new Date(context.asOfDate) : new Date();

    // 1. Status check
    if (cred.verificationStatus !== 'VERIFIED') {
      reasons.push(`Credential verification status is ${cred.verificationStatus}`);
    }

    // 2. Expiry check
    const expiresAt = new Date(cred.expiresAt);
    const effectiveFrom = new Date(cred.effectiveFrom);
    if (checkDate > expiresAt) {
      reasons.push(`Credential expired on ${cred.expiresAt}`);
    }
    if (checkDate < effectiveFrom) {
      reasons.push(`Credential not yet effective (starts ${cred.effectiveFrom})`);
    }

    // 3. Facility Scope check
    if (context?.facilityId && cred.scope.facilityIds && cred.scope.facilityIds.length > 0) {
      if (!cred.scope.facilityIds.includes(context.facilityId)) {
        reasons.push(`Facility ${context.facilityId} is outside authorized facility scope`);
      }
    }

    // 4. Department Scope check
    if (context?.department && cred.scope.departments && cred.scope.departments.length > 0) {
      const match = cred.scope.departments.some(
        (d) => d.toLowerCase() === context.department!.toLowerCase()
      );
      if (!match) {
        reasons.push(`Department ${context.department} is outside authorized scope`);
      }
    }

    // 5. Specialty Scope check
    if (context?.specialty && cred.scope.specialties && cred.scope.specialties.length > 0) {
      const match = cred.scope.specialties.some(
        (s) => s.toLowerCase() === context.specialty!.toLowerCase()
      );
      if (!match) {
        reasons.push(`Specialty ${context.specialty} is outside authorized scope`);
      }
    }

    const diffMs = expiresAt.getTime() - checkDate.getTime();
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      valid: reasons.length === 0,
      status: reasons.some((r) => r.includes('expired')) ? 'EXPIRED' : cred.verificationStatus,
      reasons,
      daysUntilExpiry,
    };
  }

  public getCredentialsForMember(workforceMemberId: string): WorkforceCredential[] {
    return Array.from(this.credentials.values()).filter(
      (c) => c.workforceMemberId === workforceMemberId
    );
  }

  public listExpiringCredentials(withinDays: number = 30): Array<{
    credential: WorkforceCredential;
    daysRemaining: number;
  }> {
    const now = new Date();
    const result: Array<{ credential: WorkforceCredential; daysRemaining: number }> = [];

    for (const cred of this.credentials.values()) {
      const expiresAt = new Date(cred.expiresAt);
      const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= withinDays) {
        result.push({ credential: cred, daysRemaining: diffDays });
      }
    }

    return result.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  public getCredential(credentialId: string): WorkforceCredential | undefined {
    return this.credentials.get(credentialId);
  }
}

export const credentialValidationService = CredentialValidationService.getInstance();
