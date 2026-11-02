/**
 * Jano Health - Service Management & Production Support Service (V25)
 * Manages operational service levels, support requests, incidents, and problem records.
 * 
 * HARD INVARIANTS:
 * - Absolute separation of concern: A support ticket must NEVER hide or swallow a clinical safety event.
 * - If an issue involves clinical safety, it must be referred to the V22/V23 Clinical Safety Register.
 * - Configured SLA targets remain strictly distinguishable from empirically achieved performance metrics.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  ServiceLevelPolicy,
  SupportCaseRecord,
  SupportSeverity,
  SupportCaseType,
} from '../../domain/v25ScaleOperationsTypes';

export class ServiceManagementSupportService {
  private policies: Map<string, ServiceLevelPolicy> = new Map();
  private cases: Map<string, SupportCaseRecord> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    // 1. Rural Health Facility SLA Policy
    const p1: ServiceLevelPolicy = {
      policyId: 'sla-rural-primary-facility',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityProfile: 'RURAL_FACILITY',
      targets: {
        criticalAckMinutes: 15,
        criticalResponseMinutes: 60,
        criticalRecoveryMinutes: 240,
        highResponseMinutes: 120,
        mediumResponseHours: 24,
      },
      actualAchievedAverages: {
        criticalAckMinutes: 11,
        criticalResponseMinutes: 48,
        criticalRecoveryMinutes: 195,
      },
      note: 'Configured SLA targets are differentiated from actual empirically observed response averages.',
    };
    this.policies.set(p1.policyId, p1);

    // 2. Sample Support Request
    const c1: SupportCaseRecord = {
      caseId: 'case-sup-2026-081',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-amani-primary-clinic',
      caseType: 'SERVICE_REQUEST',
      severity: 'P3_MEDIUM',
      title: 'Barcode reader calibration on tablet unit 2',
      description: 'Peripheral barcode scanner intermittent read failure on laminated patient IDs',
      queue: 'HARDWARE_PERIPHERALS_TIER_1',
      status: 'RESOLVED',
      isClinicalSafetyIncident: false, // Strict invariant: non-clinical
      isSecurityIncident: false,
      isPrivacyIncident: false,
      escalationThresholdMinutes: 1440,
      createdAt: '2026-06-11T10:00:00Z',
      resolvedAt: '2026-06-11T14:30:00Z',
    };
    this.cases.set(c1.caseId, c1);
  }

  public async getPolicy(policyId: string): Promise<ServiceLevelPolicy | null> {
    return this.policies.get(policyId) || null;
  }

  public async listPolicies(): Promise<ServiceLevelPolicy[]> {
    return Array.from(this.policies.values());
  }

  public async registerPolicy(policy: ServiceLevelPolicy): Promise<ServiceLevelPolicy> {
    this.policies.set(policy.policyId, policy);
    return policy;
  }

  public async createSupportCase(
    params: Omit<SupportCaseRecord, 'caseId' | 'status' | 'createdAt' | 'isClinicalSafetyIncident'> & {
      isClinicalSafetyIncidentAttempt?: boolean;
    }
  ): Promise<SupportCaseRecord> {
    // HARD INVARIANT ENFORCEMENT: Never hide a clinical safety incident inside a support ticket
    if (params.isClinicalSafetyIncidentAttempt) {
      throw new Error(
        'REJECTED: Clinical safety events must be logged in the Clinical Safety Register (V22/V23), not hidden in commercial support tickets'
      );
    }

    const caseId = `case-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const record: SupportCaseRecord = {
      ...params,
      caseId,
      status: 'NEW',
      isClinicalSafetyIncident: false,
      createdAt: new Date().toISOString(),
    };

    this.cases.set(record.caseId, record);
    await idbEngine.put('supportCases', record);
    return record;
  }

  public async getCase(caseId: string): Promise<SupportCaseRecord | null> {
    return this.cases.get(caseId) || null;
  }

  public async listCases(facilityId?: string): Promise<SupportCaseRecord[]> {
    const all = Array.from(this.cases.values());
    if (facilityId) return all.filter((c) => c.facilityId === facilityId);
    return all;
  }

  public async resolveCase(caseId: string, engineerId: string): Promise<SupportCaseRecord> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error(`Case ${caseId} not found`);

    c.status = 'RESOLVED';
    c.assignedEngineerId = engineerId;
    c.resolvedAt = new Date().toISOString();

    this.cases.set(caseId, c);
    await idbEngine.put('supportCases', c);
    return c;
  }
}

export const serviceManagementSupportService = new ServiceManagementSupportService();
