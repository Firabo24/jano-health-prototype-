/**
 * Jano Health - Commercial Operations & Entitlements Service (V25)
 * Governs enterprise customer lifecycles, commercial product editions, contracts, and implementation projects.
 * 
 * HARD INVARIANTS:
 * - ABSOLUTE SEPARATION: V15 clinical patient finance (claims, coverage, patient financing)
 *   is never mixed or merged with V25 commercial software subscriptions.
 * - Commercial accounts contain ZERO patient clinical data (containsPatientData = false).
 * - Commercial entitlements NEVER disable safety controls, bypass RBAC, bypass audit,
 *   weaken offline care, or alter clinical source-of-truth semantics.
 * - Software-stored contract metadata is strictly operational metadata and not legal advice.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  CustomerAccountRecord,
  CommercialEntitlementRecord,
  CommercialSubscriptionRecord,
  CommercialContractRecord,
  ImplementationProjectRecord,
  ProductEdition,
} from '../../domain/v25ScaleOperationsTypes';

export class CommercialOperationsService {
  private accounts: Map<string, CustomerAccountRecord> = new Map();
  private entitlements: Map<string, CommercialEntitlementRecord> = new Map();
  private subscriptions: Map<string, CommercialSubscriptionRecord> = new Map();
  private contracts: Map<string, CommercialContractRecord> = new Map();
  private projects: Map<string, ImplementationProjectRecord> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    // 1. Customer Account
    const acc1: CustomerAccountRecord = {
      accountId: 'cust-act-turkana-001',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      companyName: 'Turkana Healthcare County Trust',
      lifecycleState: 'ACTIVE',
      primaryContact: {
        name: 'Dr. Elizabeth Lokidor',
        email: 'elokidor@turkanahealth.org',
        phone: '+254-712-345678',
        role: 'County Health Operations Director',
      },
      commercialNotes: 'Regional public health deployment supporting 12 clinics and 2 sub-county hospitals.',
      containsPatientData: false, // Strict invariant
      onboardedAt: '2026-02-01T10:00:00Z',
      createdAt: '2026-01-20T08:00:00Z',
    };
    this.accounts.set(acc1.accountId, acc1);

    // 2. Commercial Entitlement
    const ent1: CommercialEntitlementRecord = {
      entitlementId: 'ent-turkana-network-v25',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      edition: 'NETWORK',
      allowedModules: ['PATIENT_MASTER', 'ENCOUNTERS', 'OFFLINE_SYNC', 'TRIAGE', 'MEDICATIONS', 'LABORATORY', 'POPULATION_HEALTH'],
      allowedFeatures: ['FEDERATED_SYNC', 'EDGE_CACHE', 'DISTRICT_DASHBOARD', 'AUDIT_EXPORT'],
      aiEntitlement: {
        tier: 'STANDARD_ADVISORY',
        monthlyQuotaEncounters: 50000,
      },
      facilityLimit: 25,
      deviceLimit: 150,
      userLimit: 500,
      validUntil: '2027-12-31T23:59:59Z',
      neverOverridesSafetyControls: true, // Permanent invariant
      neverBypassesRbac: true, // Permanent invariant
      neverWeakensOfflineCare: true, // Permanent invariant
      neverAltersClinicalSourceOfTruth: true, // Permanent invariant
    };
    this.entitlements.set(ent1.organizationId, ent1);

    // 3. Commercial Subscription (Strictly separated from V15 patient finance)
    const sub1: CommercialSubscriptionRecord = {
      subscriptionId: 'sub-turkana-enterprise-2026',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      edition: 'NETWORK',
      billingCycle: 'ANNUAL',
      status: 'ACTIVE',
      currentTermEnd: '2027-02-01T00:00:00Z',
      isClinicalPayerLedger: false, // Strict separation invariant
    };
    this.subscriptions.set(sub1.subscriptionId, sub1);

    // 4. Contract Metadata (Operational only)
    const c1: CommercialContractRecord = {
      contractId: 'cnt-jano-ea-2026-044',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      contractNumber: 'JANO-KEN-2026-044-NET',
      version: '1.2',
      servicePackage: 'Enterprise Support Tier 1 with 24/7 P1 Escalation',
      deploymentScopeFacilitiesCount: 14,
      effectiveDate: '2026-02-01T00:00:00Z',
      expirationDate: '2027-01-31T23:59:59Z',
      isLegalAdviceSubstitute: false,
      disclaimer: 'Operational contract metadata only. Not legal advice or substitute for governed legal documents.',
    };
    this.contracts.set(c1.contractId, c1);

    // 5. Implementation Project
    const proj1: ImplementationProjectRecord = {
      projectId: 'proj-turkana-rollout-phase1',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityIds: ['fac-amani-primary-clinic', 'fac-kilima-subcounty-hospital'],
      currentPhase: 'STABILIZATION',
      progressPct: 92,
      milestones: [
        { name: 'Infrastructure Readiness & Tablet Provisioning', phase: 'CONFIGURATION', isCompleted: true, dueDate: '2026-03-01' },
        { name: 'Clinical Staff Core EHR Training', phase: 'TRAINING', isCompleted: true, dueDate: '2026-04-15' },
        { name: 'Controlled Pilot Go-Live', phase: 'PILOT', isCompleted: true, dueDate: '2026-05-01' },
        { name: 'Full Production Go-Live', phase: 'GO_LIVE', isCompleted: true, dueDate: '2026-06-10' },
        { name: 'Post-Rollout Operational Stabilization', phase: 'STABILIZATION', isCompleted: false, dueDate: '2026-07-31' },
      ],
      openRisksCount: 1,
      handoverSignoffBy: 'usr-dir-ops-01',
      targetGoLiveDate: '2026-06-10',
      createdAt: '2026-02-01T10:00:00Z',
    };
    this.projects.set(proj1.projectId, proj1);
  }

  // Customer Accounts
  public async getAccount(accountId: string): Promise<CustomerAccountRecord | null> {
    return this.accounts.get(accountId) || null;
  }

  public async listAccounts(): Promise<CustomerAccountRecord[]> {
    return Array.from(this.accounts.values());
  }

  public async registerAccount(account: CustomerAccountRecord): Promise<CustomerAccountRecord> {
    // ENFORCE INVARIANT: Commercial accounts must NEVER hold patient clinical records
    if (account.containsPatientData !== false) {
      throw new Error('VIOLATION: Commercial customer records cannot store patient clinical data');
    }
    this.accounts.set(account.accountId, account);
    await idbEngine.put('customerAccounts', account);
    return account;
  }

  // Commercial Entitlements
  public async getEntitlements(organizationId: string): Promise<CommercialEntitlementRecord | null> {
    return this.entitlements.get(organizationId) || null;
  }

  public async setEntitlements(entitlement: CommercialEntitlementRecord): Promise<CommercialEntitlementRecord> {
    this.entitlements.set(entitlement.organizationId, entitlement);
    await idbEngine.put('commercialEntitlements', entitlement);
    return entitlement;
  }

  // Verify feature entitlement without weakening safety
  public verifyFeatureAccess(organizationId: string, featureName: string): boolean {
    const ent = this.entitlements.get(organizationId);
    if (!ent) return false;
    return ent.allowedFeatures.includes(featureName);
  }

  // Contracts
  public async getContract(contractId: string): Promise<CommercialContractRecord | null> {
    return this.contracts.get(contractId) || null;
  }

  public async listContracts(): Promise<CommercialContractRecord[]> {
    return Array.from(this.contracts.values());
  }

  // Implementation Projects
  public async getProject(projectId: string): Promise<ImplementationProjectRecord | null> {
    return this.projects.get(projectId) || null;
  }

  public async listProjects(): Promise<ImplementationProjectRecord[]> {
    return Array.from(this.projects.values());
  }
}

export const commercialOperationsService = new CommercialOperationsService();
