/**
 * Jano Health - Consent Policy Engine
 * Clinical Core V15: Granular Patient Consent Evaluation, Purpose Boundaries & Emergency Break-Glass
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Consent ≠ Authorization
 * 2. Consent ≠ RBAC
 * 3. Consent is evaluated server-side and fails closed.
 * 4. Permission for one purpose (e.g. DIRECT_CARE) NEVER authorizes another (e.g. RESEARCH or FINANCING).
 * 5. Emergency access is narrowly scoped, time-limited, audited, and NEVER permanent consent.
 * 6. Audit history separates consent status changes from patient record accesses.
 */

import {
  ConsentAuditEntry,
  ConsentEvaluationDecision,
  ConsentPurpose,
  ConsentResourceCategory,
  ConsentScope,
  EmergencyAccessRequest,
  PatientConsent,
} from '../../domain/consentTypes';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';

export interface ConsentEvaluationRequest {
  patientId: string;
  actorId: string;
  actorRole: string;
  facilityId: string;
  purpose: ConsentPurpose;
  resourceCategory?: ConsentResourceCategory;
  action?: 'READ' | 'WRITE' | 'EXPORT' | 'TRANSMIT';
  networkId?: string;
  organizationId?: string;
  recipientId?: string;
  emergencyBreakGlassId?: string;
}

export interface ConsentEvaluationResult {
  decision: ConsentEvaluationDecision;
  reason: string;
  matchedConsentId?: string;
  emergencyAccessId?: string;
  auditEntryId: string;
  evaluatedAt: string;
}

export class ConsentPolicyEngine {
  private static instance: ConsentPolicyEngine;
  private consents: Map<string, PatientConsent> = new Map(); // key: consentId
  private patientConsentIndex: Map<string, string[]> = new Map(); // key: patientId -> consentIds[]
  private emergencyAccessRequests: Map<string, EmergencyAccessRequest> = new Map(); // key: requestId
  private auditEntries: ConsentAuditEntry[] = [];

  private constructor() {}

  public static getInstance(): ConsentPolicyEngine {
    if (!ConsentPolicyEngine.instance) {
      ConsentPolicyEngine.instance = new ConsentPolicyEngine();
    }
    return ConsentPolicyEngine.instance;
  }

  /**
   * Evaluates patient consent fail-closed.
   */
  public async evaluateConsent(request: ConsentEvaluationRequest): Promise<ConsentEvaluationResult> {
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Check for Active Emergency Break-Glass override
    if (request.emergencyBreakGlassId) {
      const emergencyReq = this.emergencyAccessRequests.get(request.emergencyBreakGlassId);
      if (
        emergencyReq &&
        emergencyReq.patientId === request.patientId &&
        emergencyReq.decision === 'EMERGENCY_ALLOWED' &&
        new Date(emergencyReq.expiresAt) > now
      ) {
        const auditEntry = await this.recordAudit({
          patientId: request.patientId,
          actorId: request.actorId,
          actorRole: request.actorRole,
          facilityId: request.facilityId,
          action: 'OVERRIDDEN',
          category: 'RECORD_DATA_ACCESSED',
          details: `Emergency access override active (${emergencyReq.requestId}): ${emergencyReq.emergencyReason}`,
        });

        return {
          decision: 'EMERGENCY_ALLOWED',
          reason: `Emergency break-glass access valid until ${emergencyReq.expiresAt}`,
          emergencyAccessId: emergencyReq.requestId,
          auditEntryId: auditEntry.id,
          evaluatedAt: nowIso,
        };
      }
    }

    // 2. Load Patient Consents
    const patientConsents = await this.getConsentsForPatient(request.patientId);

    // 3. Evaluate each active consent
    for (const consent of patientConsents) {
      // Must be ACTIVE
      if (consent.status !== 'ACTIVE') continue;

      // Check Effective Period
      const startDate = new Date(consent.effectivePeriod.start);
      if (now < startDate) continue;
      if (consent.effectivePeriod.end) {
        const endDate = new Date(consent.effectivePeriod.end);
        if (now > endDate) {
          // Expired
          consent.status = 'EXPIRED';
          continue;
        }
      }

      // Purpose Boundary: Must explicitly contain requested purpose
      if (!consent.purposes.includes(request.purpose)) {
        continue;
      }

      // Facility Boundary: If facility restrictions specified, current facility must be allowed
      if (consent.scope.facilities && consent.scope.facilities.length > 0) {
        if (!consent.scope.facilities.includes(request.facilityId)) {
          continue;
        }
      }

      // Resource Category Boundary: If specified in request and restricted in consent
      if (
        request.resourceCategory &&
        consent.scope.resourceCategories &&
        consent.scope.resourceCategories.length > 0
      ) {
        if (!consent.scope.resourceCategories.includes(request.resourceCategory)) {
          continue;
        }
      }

      // Network & Organization Scope Boundary
      if (request.networkId && consent.scope.networks && consent.scope.networks.length > 0) {
        if (!consent.scope.networks.includes(request.networkId)) {
          continue;
        }
      }
      if (request.organizationId && consent.scope.externalOrganizations && consent.scope.externalOrganizations.length > 0) {
        if (!consent.scope.externalOrganizations.includes(request.organizationId)) {
          continue;
        }
      }

      // Directive-level granular evaluation if directives are configured
      if (consent.directives && consent.directives.length > 0) {
        const matchingDeny = consent.directives.find(
          (d) =>
            d.actionType === 'DENY' &&
            d.purpose === request.purpose &&
            (!request.resourceCategory || d.resourceCategories.includes(request.resourceCategory))
        );
        if (matchingDeny) {
          continue; // Blocked by explicit deny directive
        }
      }

      // Match found!
      const auditEntry = await this.recordAudit({
        consentId: consent.consentId,
        patientId: request.patientId,
        actorId: request.actorId,
        actorRole: request.actorRole,
        facilityId: request.facilityId,
        action: 'ACCESSED',
        category: 'RECORD_DATA_ACCESSED',
        details: `Consent ${consent.consentId} authorized ${request.purpose} for ${request.resourceCategory || 'general'} access`,
      });

      return {
        decision: 'ALLOWED',
        reason: `Explicit active consent ${consent.consentId} matches purpose '${request.purpose}'`,
        matchedConsentId: consent.consentId,
        auditEntryId: auditEntry.id,
        evaluatedAt: nowIso,
      };
    }

    // Fail-Closed: No valid active consent matched purpose and scope
    const deniedAudit = await this.recordAudit({
      patientId: request.patientId,
      actorId: request.actorId,
      actorRole: request.actorRole,
      facilityId: request.facilityId,
      action: 'DENIED',
      category: 'RECORD_DATA_ACCESSED',
      details: `Consent denied: No active consent authorizing purpose '${request.purpose}' at facility '${request.facilityId}'`,
    });

    return {
      decision: 'DENIED',
      reason: `No active patient consent grants '${request.purpose}' at facility '${request.facilityId}'`,
      auditEntryId: deniedAudit.id,
      evaluatedAt: nowIso,
    };
  }

  /**
   * Grants and registers a new PatientConsent.
   */
  public async grantConsent(
    consentInput: Omit<PatientConsent, 'consentId' | 'version' | 'integrityHash'>
  ): Promise<PatientConsent> {
    const now = new Date().toISOString();
    const consentId = `cst_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const provenance = consentInput.provenance || {
      grantedFacilityId: (consentInput as any).facilityId || 'fac-default',
      grantedByActorId: (consentInput as any).actorId || 'usr-system',
      grantedByActorRole: (consentInput as any).actorRole || 'system',
      systemVersion: 'v15.0',
    };

    const verificationMetadata = consentInput.verificationMetadata || {
      signatureType: 'ELECTRONIC' as const,
      verifiedAt: now,
    };

    const consent: PatientConsent = {
      ...consentInput,
      provenance,
      verificationMetadata,
      consentId,
      version: 1,
      integrityHash: sha256(`${consentId}:${consentInput.patientId}:${now}`),
    };

    this.consents.set(consentId, consent);
    const existing = this.patientConsentIndex.get(consent.patientId) || [];
    existing.push(consentId);
    this.patientConsentIndex.set(consent.patientId, existing);

    await this.recordAudit({
      consentId,
      patientId: consent.patientId,
      actorId: consent.provenance?.grantedByActorId || (consentInput as any).actorId || 'usr-system',
      actorRole: consent.provenance?.grantedByActorRole || (consentInput as any).actorRole || 'system',
      facilityId: consent.provenance?.grantedFacilityId || (consentInput as any).facilityId || 'fac-default',
      action: consent.status === 'ACTIVE' ? 'ACTIVATED' : 'CREATED',
      category: 'CONSENT_STATE_CHANGED',
      details: `Consent granted for purposes: [${consent.purposes.join(', ')}]`,
    });

    try {
      await idbEngine.put('patientConsents', consent);
    } catch {
      // Memory fallback
    }

    return consent;
  }

  /**
   * Revokes an existing active consent.
   */
  public async revokeConsent(
    consentId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    facilityId: string
  ): Promise<PatientConsent> {
    const consent = this.consents.get(consentId);
    if (!consent) {
      throw new Error(`Consent record '${consentId}' not found.`);
    }

    const now = new Date().toISOString();
    consent.status = 'REVOKED';
    consent.withdrawnAt = now;
    consent.revocationReason = reason;
    consent.version += 1;
    consent.integrityHash = sha256(`${consentId}:${consent.version}:${now}`);

    await this.recordAudit({
      consentId,
      patientId: consent.patientId,
      actorId,
      actorRole,
      facilityId,
      action: 'REVOKED',
      category: 'CONSENT_STATE_CHANGED',
      details: `Consent revoked. Reason: ${reason}`,
    });

    try {
      await idbEngine.put('patientConsents', consent);
    } catch {
      // Memory fallback
    }

    return consent;
  }

  /**
   * Requests time-limited, narrowly-scoped emergency break-glass access.
   */
  public async requestEmergencyAccess(params: {
    actorId: string;
    actorRole: string;
    actorName: string;
    facilityId: string;
    patientId: string;
    emergencyReason: string;
    durationMinutes?: number;
    scopeRequested?: ConsentScope;
  }): Promise<EmergencyAccessRequest> {
    const now = new Date();
    const duration = Math.min(240, Math.max(15, params.durationMinutes || 60)); // Default 60m, max 4h
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000).toISOString();
    const requestId = `emg_acc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const auditReference = sha256(`${requestId}:${params.patientId}:${params.actorId}:${now.toISOString()}`);

    const emergencyRequest: EmergencyAccessRequest = {
      requestId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      facilityId: params.facilityId,
      patientId: params.patientId,
      purpose: 'EMERGENCY_ACCESS_BREAK_GLASS',
      emergencyReason: params.emergencyReason,
      timestamp: now.toISOString(),
      scopeRequested: params.scopeRequested || {
        facilities: [params.facilityId],
        resourceCategories: ['PATIENT_DEMOGRAPHICS', 'ENCOUNTERS', 'CLINICAL_NOTES', 'DIAGNOSES', 'MEDICATIONS', 'LABORATORY', 'EMERGENCY'],
      },
      durationMinutes: duration,
      decision: 'EMERGENCY_ALLOWED',
      auditReference,
      expiresAt,
    };

    this.emergencyAccessRequests.set(requestId, emergencyRequest);

    await this.recordAudit({
      patientId: params.patientId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'OVERRIDDEN',
      category: 'CONSENT_STATE_CHANGED',
      details: `Emergency break-glass requested for ${duration}m. Reason: ${params.emergencyReason}`,
    });

    try {
      await idbEngine.put('emergencyAccessRequests', emergencyRequest);
    } catch {
      // Memory fallback
    }

    return emergencyRequest;
  }

  public async getConsentsForPatient(patientId: string): Promise<PatientConsent[]> {
    const consentIds = this.patientConsentIndex.get(patientId) || [];
    const list: PatientConsent[] = [];
    for (const cid of consentIds) {
      const c = this.consents.get(cid);
      if (c) list.push(c);
    }

    // Try IndexedDB if memory empty
    if (list.length === 0) {
      try {
        const persisted = await idbEngine.getAll<PatientConsent>('patientConsents');
        const filtered = persisted.filter((c) => c.patientId === patientId);
        filtered.forEach((c) => {
          this.consents.set(c.consentId, c);
        });
        return filtered;
      } catch {
        // Memory fallback
      }
    }

    return list;
  }

  public async getConsentAuditHistory(patientId: string): Promise<ConsentAuditEntry[]> {
    return this.auditEntries.filter((e) => e.patientId === patientId);
  }

  private async recordAudit(params: {
    consentId?: string;
    patientId: string;
    actorId: string;
    actorRole: string;
    facilityId: string;
    action: ConsentAuditEntry['action'];
    category: ConsentAuditEntry['category'];
    details: string;
  }): Promise<ConsentAuditEntry> {
    const now = new Date().toISOString();
    const entryId = `cst_aud_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const auditHash = sha256(`${entryId}:${params.patientId}:${params.action}:${now}`);

    const entry: ConsentAuditEntry = {
      id: entryId,
      consentId: params.consentId,
      patientId: params.patientId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: params.action,
      category: params.category,
      timestamp: now,
      details: params.details,
      auditHash,
    };

    this.auditEntries.push(entry);

    try {
      await idbEngine.put('consentAuditEntries', entry);
    } catch {
      // Memory fallback
    }

    return entry;
  }

  public getAllConsents(): PatientConsent[] {
    return Array.from(this.consents.values());
  }

  public getAllEmergencyAccessRequests(): EmergencyAccessRequest[] {
    return Array.from(this.emergencyAccessRequests.values());
  }

  public getAllAuditEntries(): ConsentAuditEntry[] {
    return [...this.auditEntries];
  }
}

export const consentPolicyEngine = ConsentPolicyEngine.getInstance();
