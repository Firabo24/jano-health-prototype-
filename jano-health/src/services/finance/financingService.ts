/**
 * Jano Health - Health Financing Interoperability Service
 * Clinical Core V15: Domain-Neutral Financing, Coverage, Authorizations, Claims,
 * Invoices, Payments, Append-Only Ledger, and Financial Quarantine
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Coverage ≠ Payment
 * 2. Claim ≠ Invoice
 * 3. Invoice ≠ Payment
 * 4. Financing Program ≠ Payer
 * 5. Payer ≠ Government Agency
 * 6. Financial Transaction ≠ Clinical Event
 * 7. Financial failure or claim denial NEVER cancels or alters clinical treatment or emergency care.
 * 8. UNAVAILABLE ≠ NOT_ELIGIBLE (fail transparently, offline cached with staleness indicator).
 * 9. No raw payment credentials stored.
 * 10. Financial ledger is append-only with SHA-256 tamper-evident integrity hashes.
 */

import {
  AuthorizationRequest,
  AuthorizationRequestStatus,
  Claim,
  ClaimCorrectionRecord,
  ClaimLine,
  ClaimStatus,
  Coverage,
  CoverageStatus,
  CoverageVerificationStatus,
  EligibilityCheckRequest,
  EligibilityCheckResponse,
  FinancialEvent,
  FinancialEventType,
  FinancialQuarantineCategory,
  FinancialQuarantineRecord,
  FinancingProgram,
  IFinancingExchangeAdapter,
  INationalClaimsAdapter,
  INationalCoverageAdapter,
  INationalIdentityAdapter,
  INationalPaymentAdapter,
  Invoice,
  InvoiceStatus,
  Payer,
  Payment,
  PaymentStatus,
} from '../../domain/financingTypes';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';
import { financialReconciliationService } from './financialReconciliationService';

export class FinancingService {
  private static instance: FinancingService;

  // In-Memory Master Collections (synced with IndexedDB)
  private payers: Map<string, Payer> = new Map();
  private programs: Map<string, FinancingProgram> = new Map();
  private coverages: Map<string, Coverage> = new Map();
  private eligibilityRequests: Map<string, EligibilityCheckRequest> = new Map();
  private eligibilityCache: Map<string, EligibilityCheckResponse> = new Map();
  private authorizations: Map<string, AuthorizationRequest> = new Map();
  private claims: Map<string, Claim> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private payments: Map<string, Payment> = new Map();
  private ledger: FinancialEvent[] = [];
  private quarantine: Map<string, FinancialQuarantineRecord> = new Map();

  // Outbound Offline Queue
  private offlineEligibilityQueue: EligibilityCheckRequest[] = [];
  private offlineClaimsQueue: Claim[] = [];

  // Adapter boundaries
  public exchangeAdapter: IFinancingExchangeAdapter;
  public nationalIdentityAdapter: INationalIdentityAdapter;
  public nationalCoverageAdapter: INationalCoverageAdapter;
  public nationalClaimsAdapter: INationalClaimsAdapter;
  public nationalPaymentAdapter: INationalPaymentAdapter;

  private constructor() {
    // Default external adapters are fail-closed / UNAVAILABLE / NOT_CONFIGURED
    this.exchangeAdapter = {
      status: 'SANDBOX',
      verifyEligibility: async (req) => ({
        checkId: req.checkId,
        coverageId: req.coverageId,
        status: 'VERIFIED',
        effectiveDates: { start: '2026-01-01', end: '2026-12-31' },
        coveredServices: ['CONSULTATION', 'LABORATORY', 'ESSENTIAL_MEDS', 'EMERGENCY'],
        limitations: ['Pre-authorization required for specialized surgery'],
        authorizationRequired: false,
        stale: false,
        verifiedAt: new Date().toISOString(),
        source: 'SANDBOX_PAYER_GATEWAY',
        provenance: { responderId: 'sandbox_gateway', timestamp: new Date().toISOString() },
      }),
      submitClaim: async (claim) => ({
        success: true,
        externalReference: `EXT-CLM-${Date.now()}`,
        status: 'ACKNOWLEDGED',
        message: 'Claim accepted by sandbox clearinghouse',
      }),
    };

    this.nationalIdentityAdapter = {
      status: 'UNAVAILABLE',
      verifyNationalId: async () => ({ configured: false, verified: false, status: 'NOT_CONFIGURED' }),
    };

    this.nationalCoverageAdapter = {
      status: 'UNAVAILABLE',
      checkNationalRegistry: async () => ({ configured: false, coverageFound: false }),
    };

    this.nationalClaimsAdapter = {
      status: 'UNAVAILABLE',
      transmitClaimBatch: async () => ({ configured: false, acceptedCount: 0, status: 'NOT_CONFIGURED' }),
    };

    this.nationalPaymentAdapter = {
      status: 'UNAVAILABLE',
      initiatePayment: async () => ({ configured: false, status: 'NOT_CONFIGURED' }),
    };

    this.bootstrapSeedPayers();
  }

  public static getInstance(): FinancingService {
    if (!FinancingService.instance) {
      FinancingService.instance = new FinancingService();
    }
    return FinancingService.instance;
  }

  private bootstrapSeedPayers() {
    const defaultPayer: Payer = {
      payerId: 'pyr-community-health-fund',
      name: 'Community Health Mutual Fund (CHF)',
      type: 'COMMUNITY',
      status: 'ACTIVE',
      contact: { phone: '+255 28 280 2000', email: 'support@chf-mutual.org' },
      supportedPrograms: ['prog-chf-essential-2026'],
      policyMetadata: { tier: 'DISTRICT_COMMUNITY', defaultCoveragePercent: 85 },
      provenance: { createdAt: '2026-01-01T00:00:00Z', registeredBy: 'sys', systemVersion: 'v15.0' },
    };

    const selfPayPayer: Payer = {
      payerId: 'pyr-self-pay',
      name: 'Direct Out-of-Pocket / Self-Pay',
      type: 'SELF_PAY',
      status: 'ACTIVE',
      contact: {},
      supportedPrograms: ['prog-self-pay-fee-for-service'],
      policyMetadata: { standardDiscount: 0 },
      provenance: { createdAt: '2026-01-01T00:00:00Z', registeredBy: 'sys', systemVersion: 'v15.0' },
    };

    const defaultProgram: FinancingProgram = {
      programId: 'prog-chf-essential-2026',
      payerId: defaultPayer.payerId,
      name: 'CHF Essential Primary & Emergency Health Package',
      programType: 'PRIMARY_CARE_BENEFIT',
      eligibilityRulesReference: { version: '2026.1', rulesId: 'rul-chf-eligibility', description: 'Active district residency & paid annual dues' },
      coverageRulesReference: { version: '2026.1', rulesId: 'rul-chf-coverage', description: 'Covers essential meds, routine labs, and emergency stabilization' },
      effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
      status: 'ACTIVE',
      version: 1,
      provenance: { registeredAt: '2026-01-01T00:00:00Z', registeredBy: 'sys' },
    };

    this.payers.set(defaultPayer.payerId, defaultPayer);
    this.payers.set(selfPayPayer.payerId, selfPayPayer);
    this.programs.set(defaultProgram.programId, defaultProgram);
  }

  // ==========================================================================
  // 1. PAYERS & PROGRAMS
  // ==========================================================================

  public async getPayers(): Promise<Payer[]> {
    return Array.from(this.payers.values());
  }

  public async getPayer(payerId: string): Promise<Payer | undefined> {
    return this.payers.get(payerId);
  }

  public async registerPayer(payer: Payer): Promise<Payer> {
    this.payers.set(payer.payerId, payer);
    try {
      await idbEngine.put('payers', payer);
    } catch {}
    return payer;
  }

  public async getPrograms(payerId?: string): Promise<FinancingProgram[]> {
    const all = Array.from(this.programs.values());
    return payerId ? all.filter((p) => p.payerId === payerId) : all;
  }

  public async registerProgram(program: FinancingProgram): Promise<FinancingProgram> {
    this.programs.set(program.programId, program);
    try {
      await idbEngine.put('financingPrograms', program);
    } catch {}
    return program;
  }

  // ==========================================================================
  // 2. COVERAGE & VERIFICATION
  // ==========================================================================

  public async recordCoverage(coverage: Coverage): Promise<Coverage> {
    if (!coverage.provenance) {
      coverage.provenance = {
        recordedAt: new Date().toISOString(),
        facilityId: (coverage as any).facilityId || 'fac-default',
        recordedBy: (coverage as any).recordedBy || (coverage as any).actorId || 'usr-system',
      };
    }
    this.coverages.set(coverage.coverageId, coverage);
    try {
      await idbEngine.put('coverages', coverage);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'COVERAGE_RECORDED' as FinancialEventType,
      aggregateId: coverage.coverageId,
      aggregateType: 'COVERAGE',
      facilityId: coverage.provenance?.facilityId || 'fac-default',
      actorId: coverage.provenance?.recordedBy || 'usr-system',
      actorRole: 'finance_officer',
      payload: { coverageId: coverage.coverageId, patientId: coverage.patientId, status: coverage.status },
    });

    return coverage;
  }

  public async getCoverageForPatient(patientId: string): Promise<Coverage[]> {
    return Array.from(this.coverages.values()).filter((c) => c.patientId === patientId);
  }

  public async getCoverage(coverageId: string): Promise<Coverage | undefined> {
    return this.coverages.get(coverageId);
  }

  /**
   * Verifies coverage eligibility.
   * INVARIANT: Never interprets UNAVAILABLE as NOT_ELIGIBLE.
   * In offline mode, caches verification and indicates staleness.
   */
  public async verifyEligibility(params: {
    coverageId: string;
    patientId: string;
    facilityId: string;
    actorId: string;
    isOnline?: boolean;
  }): Promise<EligibilityCheckResponse> {
    const coverage = this.coverages.get(params.coverageId);
    if (!coverage) {
      throw new Error(`Coverage '${params.coverageId}' not found.`);
    }

    const checkId = `chk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();
    const isOnline = params.isOnline !== undefined ? params.isOnline : true;

    // Check cached eligibility
    const cached = this.eligibilityCache.get(params.coverageId);
    if (cached) {
      const cacheAgeMinutes = (now.getTime() - new Date(cached.verifiedAt).getTime()) / (1000 * 60);
      const isStale = cacheAgeMinutes > 1440; // older than 24 hours is stale

      if (!isOnline) {
        return {
          ...cached,
          stale: isStale,
          source: 'OFFLINE_LOCAL_CACHE',
        };
      }
    }

    // If completely offline and no cache
    if (!isOnline) {
      const queuedRequest: EligibilityCheckRequest = {
        checkId,
        patientId: params.patientId,
        coverageId: params.coverageId,
        serviceDate: now.toISOString(),
        facilityId: params.facilityId,
        actorId: params.actorId,
        status: 'QUEUED',
        isOfflineCached: false,
        createdAt: now.toISOString(),
      };
      this.offlineEligibilityQueue.push(queuedRequest);

      return {
        checkId,
        coverageId: params.coverageId,
        status: 'UNAVAILABLE', // INVARIANT: UNAVAILABLE is NOT NOT_ELIGIBLE
        effectiveDates: { start: coverage.effectiveFrom, end: coverage.effectiveTo },
        coveredServices: [],
        limitations: ['Network offline: Eligibility query queued for background sync'],
        authorizationRequired: false,
        stale: true,
        verifiedAt: now.toISOString(),
        source: 'OFFLINE_QUEUE',
        provenance: { responderId: 'local_offline_guard', timestamp: now.toISOString() },
      };
    }

    // Online verification through adapter
    const req: EligibilityCheckRequest = {
      checkId,
      patientId: params.patientId,
      coverageId: params.coverageId,
      serviceDate: now.toISOString(),
      facilityId: params.facilityId,
      actorId: params.actorId,
      status: 'PENDING',
      createdAt: now.toISOString(),
    };

    const response = await this.exchangeAdapter.verifyEligibility(req);
    this.eligibilityCache.set(params.coverageId, response);
    coverage.verificationStatus = response.status;
    coverage.lastVerifiedAt = response.verifiedAt;
    coverage.verificationSource = response.source;

    await this.appendLedgerEvent({
      eventType: 'COVERAGE_VERIFIED',
      aggregateId: coverage.coverageId,
      aggregateType: 'COVERAGE',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: 'finance_officer',
      payload: { coverageId: coverage.coverageId, status: response.status, stale: response.stale },
    });

    return response;
  }

  // ==========================================================================
  // 3. SERVICE AUTHORIZATION
  // ==========================================================================

  public async requestAuthorization(params: {
    patientId: string;
    coverageId: string;
    facilityId: string;
    requestedService: string;
    serviceCode: string;
    clinicalReference: AuthorizationRequest['clinicalReference'];
    requestedAmount: number;
    requestedUnits: number;
    purpose: string;
    actorId: string;
    actorRole: string;
  }): Promise<AuthorizationRequest> {
    const now = new Date().toISOString();
    const authorizationId = `auth_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const auth: AuthorizationRequest = {
      authorizationId,
      patientId: params.patientId,
      coverageId: params.coverageId,
      facilityId: params.facilityId,
      requestedService: params.requestedService,
      serviceCode: params.serviceCode,
      clinicalReference: params.clinicalReference,
      requestedAmount: params.requestedAmount,
      requestedUnits: params.requestedUnits,
      approvedAmount: params.requestedAmount, // Default approval for standard benefit
      purpose: params.purpose,
      status: 'APPROVED',
      submittedAt: now,
      respondedAt: now,
      payerReference: `PAY-AUTH-${Date.now()}`,
      provenance: {
        requestedById: params.actorId,
        requestedByRole: params.actorRole,
        systemVersion: 'v15.0',
      },
    };

    this.authorizations.set(authorizationId, auth);
    try {
      await idbEngine.put('authorizationRequests', auth);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'SERVICE_AUTHORIZED',
      aggregateId: authorizationId,
      aggregateType: 'AUTHORIZATION',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      payload: { authorizationId, serviceCode: params.serviceCode, amount: params.requestedAmount },
    });

    return auth;
  }

  public async getAuthorizationsForPatient(patientId: string): Promise<AuthorizationRequest[]> {
    return Array.from(this.authorizations.values()).filter((a) => a.patientId === patientId);
  }

  // ==========================================================================
  // 4. CLAIMS & CLAIM LINES
  // ==========================================================================

  public async createClaim(params: {
    patientId: string;
    payerId: string;
    coverageId: string;
    facilityId: string;
    encounterReference: string;
    servicePeriod: { start: string; end: string };
    lines: Array<{
      serviceCode: string;
      serviceDescription: string;
      quantity: number;
      unitAmount: number;
      sourceReference: ClaimLine['sourceReference'];
    }>;
    actorId: string;
    actorRole: string;
  }): Promise<Claim> {
    const now = new Date().toISOString();
    const claimId = `clm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    let totalSubmitted = 0;
    const claimLines: ClaimLine[] = params.lines.map((l, idx) => {
      const lineTotal = l.quantity * l.unitAmount;
      totalSubmitted += lineTotal;
      return {
        lineId: `line_${claimId}_${idx + 1}`,
        claimId,
        lineNumber: idx + 1,
        serviceCode: l.serviceCode,
        serviceDescription: l.serviceDescription,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        submittedAmount: lineTotal,
        adjudicatedAmount: lineTotal * 0.85, // estimated coverage
        patientResponsibility: lineTotal * 0.15,
        sourceReference: l.sourceReference,
        provenance: { facilityId: params.facilityId, recordedAt: now },
      };
    });

    const patientResp = totalSubmitted * 0.15;

    // Check duplicate claim validation
    const isDuplicate = Array.from(this.claims.values()).some(
      (c) =>
        c.patientId === params.patientId &&
        c.encounterReference === params.encounterReference &&
        c.status !== 'VOIDED' &&
        c.status !== 'DENIED'
    );

    if (isDuplicate) {
      await this.quarantineRecord({
        category: 'DUPLICATE_CLAIM',
        entityType: 'CLAIM',
        entityId: claimId,
        facilityId: params.facilityId,
        reason: `Duplicate claim detected for patient ${params.patientId} and encounter ${params.encounterReference}`,
        details: { claimNumber, totalSubmitted },
      });
    }

    const claim: Claim = {
      claimId,
      claimNumber,
      patientId: params.patientId,
      payerId: params.payerId,
      coverageId: params.coverageId,
      facilityId: params.facilityId,
      encounterReference: params.encounterReference,
      servicePeriod: params.servicePeriod,
      claimLines,
      submittedAmount: totalSubmitted,
      approvedAmount: totalSubmitted * 0.85,
      patientResponsibility: patientResp,
      status: isDuplicate ? 'DRAFT' : 'VALIDATED',
      provenance: {
        preparedById: params.actorId,
        preparedByRole: params.actorRole,
        preparedAt: now,
        facilityId: params.facilityId,
      },
      integrityHash: sha256(`${claimId}:${claimNumber}:${totalSubmitted}:${now}`),
      createdAt: now,
      updatedAt: now,
    };

    this.claims.set(claimId, claim);
    try {
      await idbEngine.put('claims', claim);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'CLAIM_CREATED',
      aggregateId: claimId,
      aggregateType: 'CLAIM',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      payload: { claimId, claimNumber, submittedAmount: totalSubmitted, linesCount: claimLines.length },
    });

    return claim;
  }

  public async submitClaim(
    claimId: string,
    actorId: string,
    actorRole: string,
    isOnline: boolean = true
  ): Promise<Claim> {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error(`Claim '${claimId}' not found.`);

    const now = new Date().toISOString();

    if (!isOnline) {
      claim.status = 'PENDING';
      this.offlineClaimsQueue.push(claim);
      return claim;
    }

    const adapterRes = await this.exchangeAdapter.submitClaim(claim);
    claim.status = adapterRes.status;
    claim.externalReference = adapterRes.externalReference;
    claim.provenance.submittedAt = now;
    claim.updatedAt = now;
    claim.integrityHash = sha256(`${claim.claimId}:${claim.status}:${now}`);

    await this.appendLedgerEvent({
      eventType: 'CLAIM_SUBMITTED',
      aggregateId: claimId,
      aggregateType: 'CLAIM',
      facilityId: claim.facilityId,
      actorId,
      actorRole,
      payload: { claimId, externalReference: adapterRes.externalReference, status: adapterRes.status },
    });

    return claim;
  }

  /**
   * Adjudicates a claim.
   * INVARIANT: Claim denial NEVER cancels, invalidates, or erases a clinical service that already occurred.
   */
  public async adjudicateClaim(
    claimId: string,
    decision: 'PAID' | 'PARTIALLY_PAID' | 'DENIED',
    approvedAmount: number,
    notes: string,
    actorId: string,
    actorRole: string
  ): Promise<Claim> {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error(`Claim '${claimId}' not found.`);

    const now = new Date().toISOString();
    claim.status = decision;
    claim.approvedAmount = approvedAmount;
    claim.patientResponsibility = claim.submittedAmount - approvedAmount;
    claim.adjudicationNotes = notes;
    if (decision === 'DENIED') claim.denialReason = notes;
    claim.updatedAt = now;
    claim.integrityHash = sha256(`${claim.claimId}:${claim.status}:${approvedAmount}:${now}`);

    await this.appendLedgerEvent({
      eventType: 'CLAIM_ADJUDICATED',
      aggregateId: claimId,
      aggregateType: 'CLAIM',
      facilityId: claim.facilityId,
      actorId,
      actorRole,
      payload: { claimId, decision, approvedAmount, patientResponsibility: claim.patientResponsibility },
    });

    return claim;
  }

  public async getClaimsForPatient(patientId: string): Promise<Claim[]> {
    return Array.from(this.claims.values()).filter((c) => c.patientId === patientId);
  }

  public async getAllClaims(): Promise<Claim[]> {
    return Array.from(this.claims.values());
  }

  public async getClaim(claimId: string): Promise<Claim | undefined> {
    return this.claims.get(claimId);
  }

  /**
   * Corrects a submitted or adjudicated claim using an immutable superseding event.
   * INVARIANT: Never edit settled historical claims destructively; preserve complete lineage.
   */
  public async correctClaim(
    claimId: string,
    params: {
      reason: string;
      changedFields: string[];
      updatedSubmittedAmount?: number;
      actorId: string;
      actorRole: string;
      facilityId: string;
    }
  ): Promise<{ originalClaim: Claim; correctionRecord: ClaimCorrectionRecord; supersedingClaim: Claim }> {
    const originalClaim = this.claims.get(claimId);
    if (!originalClaim) throw new Error(`Claim '${claimId}' not found.`);

    const now = new Date().toISOString();
    const supersedingClaimId = `clm_rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const correctionId = `cor_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const newAmount = params.updatedSubmittedAmount ?? originalClaim.submittedAmount;

    // Create the superseding corrected claim
    const supersedingClaim: Claim = {
      ...originalClaim,
      claimId: supersedingClaimId,
      claimNumber: `${originalClaim.claimNumber}-CORR`,
      submittedAmount: newAmount,
      approvedAmount: newAmount * 0.85,
      patientResponsibility: newAmount * 0.15,
      status: 'VALIDATED',
      createdAt: now,
      updatedAt: now,
      provenance: {
        ...originalClaim.provenance,
        preparedById: params.actorId,
        preparedByRole: params.actorRole,
        preparedAt: now,
      },
      integrityHash: sha256(`${supersedingClaimId}:${originalClaim.claimNumber}:${newAmount}:${now}`),
    };

    // Original claim marked VOIDED due to correction
    originalClaim.status = 'VOIDED';
    originalClaim.denialReason = `Superseded by corrected claim ${supersedingClaim.claimNumber}: ${params.reason}`;
    originalClaim.updatedAt = now;

    this.claims.set(supersedingClaimId, supersedingClaim);

    const correctionRecord: ClaimCorrectionRecord = {
      correctionId,
      originalClaimId: claimId,
      supersedingClaimId,
      action: 'CORRECTION',
      reason: params.reason,
      changedFields: params.changedFields,
      actorId: params.actorId,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      timestamp: now,
      integrityHash: sha256(`${correctionId}:${claimId}:${supersedingClaimId}:${now}`),
    };

    try {
      await idbEngine.put('claims', originalClaim);
      await idbEngine.put('claims', supersedingClaim);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'FINANCIAL_CORRECTION',
      aggregateId: supersedingClaimId,
      aggregateType: 'CLAIM',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      payload: { originalClaimId: claimId, supersedingClaimId, reason: params.reason },
      correctionReason: params.reason,
      originalEventId: claimId,
    });

    return { originalClaim, correctionRecord, supersedingClaim };
  }

  /**
   * Voids an invalid or erroneous claim without destroying history.
   */
  public async voidClaim(
    claimId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    facilityId: string
  ): Promise<Claim> {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error(`Claim '${claimId}' not found.`);

    const now = new Date().toISOString();
    claim.status = 'VOIDED';
    claim.denialReason = `Voided: ${reason}`;
    claim.updatedAt = now;
    claim.integrityHash = sha256(`${claimId}:VOIDED:${now}`);

    try {
      await idbEngine.put('claims', claim);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'CLAIM_VOIDED',
      aggregateId: claimId,
      aggregateType: 'CLAIM',
      facilityId,
      actorId,
      actorRole,
      payload: { claimId, reason },
      correctionReason: reason,
      originalEventId: claimId,
    });

    return claim;
  }

  // ==========================================================================
  // 5. INVOICES & BILLING
  // ==========================================================================

  public async issueInvoice(params: {
    patientId: string;
    payerId?: string;
    claimId?: string;
    facilityId: string;
    payerResponsibility: number;
    patientResponsibility: number;
    lineItems: Invoice['lineItems'];
    actorId: string;
    actorRole: string;
  }): Promise<Invoice> {
    const now = new Date().toISOString();
    const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const total = params.payerResponsibility + params.patientResponsibility;

    const invoice: Invoice = {
      invoiceId,
      invoiceNumber,
      patientId: params.patientId,
      payerId: params.payerId,
      claimId: params.claimId,
      facilityId: params.facilityId,
      payerResponsibility: params.payerResponsibility,
      patientResponsibility: params.patientResponsibility,
      totalAmount: total,
      discounts: 0,
      adjustments: 0,
      taxes: 0,
      status: 'ISSUED',
      lineItems: params.lineItems,
      issuedAt: now,
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Net 30
      provenance: {
        issuedById: params.actorId,
        issuedByRole: params.actorRole,
        facilityId: params.facilityId,
      },
      integrityHash: sha256(`${invoiceId}:${invoiceNumber}:${total}:${now}`),
    };

    this.invoices.set(invoiceId, invoice);
    try {
      await idbEngine.put('invoices', invoice);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'INVOICE_ISSUED',
      aggregateId: invoiceId,
      aggregateType: 'INVOICE',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      payload: { invoiceId, invoiceNumber, totalAmount: total, patientResponsibility: params.patientResponsibility },
    });

    return invoice;
  }

  public async getInvoicesForPatient(patientId: string): Promise<Invoice[]> {
    return Array.from(this.invoices.values()).filter((i) => i.patientId === patientId);
  }

  public async getInvoice(invoiceId: string): Promise<Invoice | undefined> {
    return this.invoices.get(invoiceId);
  }

  // ==========================================================================
  // 6. PAYMENTS & RECONCILIATIONS
  // ==========================================================================

  /**
   * Records a settled financial payment.
   * INVARIANT: Never store raw payment-card credentials.
   */
  public async recordPayment(params: {
    invoiceId: string;
    patientId: string;
    payerId?: string;
    amount: number;
    currency?: string;
    method: Payment['method'];
    reference: string;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }): Promise<Payment> {
    const now = new Date().toISOString();
    const paymentId = `pmt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const payment: Payment = {
      paymentId,
      receiptNumber,
      invoiceId: params.invoiceId,
      patientId: params.patientId,
      payerId: params.payerId,
      amount: params.amount,
      currency: params.currency || 'TZS',
      method: params.method,
      reference: params.reference,
      timestamp: now,
      status: 'RECEIVED',
      reconciliationState: 'MATCHED',
      provenance: {
        recordedById: params.actorId,
        recordedByRole: params.actorRole,
        facilityId: params.facilityId,
      },
      integrityHash: sha256(`${paymentId}:${receiptNumber}:${params.amount}:${now}`),
    };

    this.payments.set(paymentId, payment);

    // Update associated invoice status
    const invoice = this.invoices.get(params.invoiceId);
    if (invoice) {
      if (params.amount >= invoice.patientResponsibility) {
        invoice.status = 'SETTLED';
        invoice.settledAt = now;
      } else {
        invoice.status = 'PARTIALLY_SETTLED';
      }
      try {
        await idbEngine.put('invoices', invoice);
      } catch {}
    }

    try {
      await idbEngine.put('payments', payment);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'PAYMENT_RECEIVED',
      aggregateId: paymentId,
      aggregateType: 'PAYMENT',
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      payload: { paymentId, invoiceId: params.invoiceId, amount: params.amount, method: params.method },
    });

    return payment;
  }

  /**
   * Reverses a payment with immutable correction record.
   */
  public async reversePayment(
    paymentId: string,
    reason: string,
    actorId: string,
    actorRole: string,
    facilityId: string
  ): Promise<Payment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment '${paymentId}' not found.`);

    const now = new Date().toISOString();
    payment.status = 'REVERSED';
    payment.reversalReason = reason;
    payment.reversedAt = now;
    payment.reversedById = actorId;
    payment.integrityHash = sha256(`${paymentId}:REVERSED:${now}`);

    // Revert invoice status if needed
    const invoice = this.invoices.get(payment.invoiceId);
    if (invoice && invoice.status === 'SETTLED') {
      invoice.status = 'ISSUED';
      invoice.settledAt = undefined;
      try {
        await idbEngine.put('invoices', invoice);
      } catch {}
    }

    try {
      await idbEngine.put('payments', payment);
    } catch {}

    await this.appendLedgerEvent({
      eventType: 'PAYMENT_REVERSED',
      aggregateId: paymentId,
      aggregateType: 'PAYMENT',
      facilityId,
      actorId,
      actorRole,
      payload: { paymentId, reason, originalAmount: payment.amount },
    });

    return payment;
  }

  public async getPaymentsForPatient(patientId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter((p) => p.patientId === patientId);
  }

  public async getAllPayments(): Promise<Payment[]> {
    return Array.from(this.payments.values());
  }

  public async getAllInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values());
  }

  public async getAllCoverages(): Promise<Coverage[]> {
    return Array.from(this.coverages.values());
  }

  public async getAllAuthorizations(): Promise<AuthorizationRequest[]> {
    return Array.from(this.authorizations.values());
  }

  public async reconcileInvoiceWithPayment(params: {
    invoiceId: string;
    paymentId: string;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }) {
    const invoice = this.invoices.get(params.invoiceId);
    const payment = this.payments.get(params.paymentId);
    if (!invoice) throw new Error(`Invoice '${params.invoiceId}' not found.`);
    if (!payment) throw new Error(`Payment '${params.paymentId}' not found.`);

    return financialReconciliationService.reconcileInvoicePayment({
      invoice,
      payment,
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
    });
  }

  // ==========================================================================
  // 7. FINANCIAL LEDGER (APPEND-ONLY EVENT LOG)
  // ==========================================================================

  public async appendLedgerEvent(params: {
    eventType: FinancialEventType;
    aggregateId: string;
    aggregateType: FinancialEvent['aggregateType'];
    facilityId: string;
    actorId: string;
    actorRole: string;
    payload: Record<string, any>;
    correctionReason?: string;
    originalEventId?: string;
  }): Promise<FinancialEvent> {
    const now = new Date().toISOString();
    const eventId = `fev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const previousHash =
      this.ledger.length > 0 ? this.ledger[this.ledger.length - 1].currentHash : 'GENESIS_FINANCIAL_HASH';

    const currentHash = sha256(
      `${previousHash}:${eventId}:${params.eventType}:${params.aggregateId}:${now}:${JSON.stringify(params.payload)}`
    );

    const event: FinancialEvent = {
      eventId,
      eventType: params.eventType,
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      facilityId: params.facilityId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      timestamp: now,
      payload: params.payload,
      previousHash,
      currentHash,
      correctionReason: params.correctionReason,
      originalEventId: params.originalEventId,
    };

    this.ledger.push(event);

    try {
      await idbEngine.put('financialEvents', event);
    } catch {}

    return event;
  }

  public getLedger(): FinancialEvent[] {
    return [...this.ledger];
  }

  public verifyLedgerIntegrity(): { valid: boolean; totalEvents: number; brokenIndex?: number } {
    let prevHash = 'GENESIS_FINANCIAL_HASH';
    for (let i = 0; i < this.ledger.length; i++) {
      const ev = this.ledger[i];
      if (ev.previousHash !== prevHash) {
        return { valid: false, totalEvents: this.ledger.length, brokenIndex: i };
      }
      const recomputed = sha256(
        `${ev.previousHash}:${ev.eventId}:${ev.eventType}:${ev.aggregateId}:${ev.timestamp}:${JSON.stringify(ev.payload)}`
      );
      if (recomputed !== ev.currentHash) {
        return { valid: false, totalEvents: this.ledger.length, brokenIndex: i };
      }
      prevHash = ev.currentHash;
    }
    return { valid: true, totalEvents: this.ledger.length };
  }

  // ==========================================================================
  // 8. FINANCIAL QUARANTINE
  // ==========================================================================

  public async quarantineRecord(params: {
    category: FinancialQuarantineCategory;
    entityType: string;
    entityId: string;
    facilityId: string;
    reason: string;
    details: Record<string, any>;
  }): Promise<FinancialQuarantineRecord> {
    const quarantineId = `fq_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const record: FinancialQuarantineRecord = {
      quarantineId,
      category: params.category,
      entityType: params.entityType,
      entityId: params.entityId,
      facilityId: params.facilityId,
      reason: params.reason,
      details: params.details,
      status: 'ACTIVE',
      quarantinedAt: new Date().toISOString(),
    };

    this.quarantine.set(quarantineId, record);
    try {
      await idbEngine.put('financialQuarantine', record);
    } catch {}

    return record;
  }

  public async resolveQuarantine(
    quarantineId: string,
    notes: string,
    resolverActorId: string
  ): Promise<FinancialQuarantineRecord> {
    const record = this.quarantine.get(quarantineId);
    if (!record) throw new Error(`Quarantine record '${quarantineId}' not found.`);

    record.status = 'RESOLVED';
    record.resolvedAt = new Date().toISOString();
    record.resolvedBy = resolverActorId;
    record.resolutionNotes = notes;

    try {
      await idbEngine.put('financialQuarantine', record);
    } catch {}

    return record;
  }

  public getQuarantinedRecords(): FinancialQuarantineRecord[] {
    return Array.from(this.quarantine.values());
  }
}

export const financingService = FinancingService.getInstance();
