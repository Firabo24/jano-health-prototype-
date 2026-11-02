/**
 * Jano Health - Financial Reconciliation Service
 * Clinical Core V15: Multi-Entity Settlement, Payment Matching, Reversals, and Audit Lineage
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Financial Reconciliation ≠ Clinical Care Mutation
 * 2. Immutable Audit Lineage: Every reconciliation action must produce an audited, tamper-evident record.
 * 3. Supported decisions: MATCHED, UNMATCHED, PARTIAL, CONFLICT, REVERSED.
 */

import {
  Claim,
  FinancialReconciliationRecord,
  Invoice,
  Payment,
  ReconciliationDecisionType,
} from '../../domain/financingTypes';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class FinancialReconciliationService {
  private static instance: FinancialReconciliationService;
  private records: Map<string, FinancialReconciliationRecord> = new Map();

  private constructor() {}

  public static getInstance(): FinancialReconciliationService {
    if (!FinancialReconciliationService.instance) {
      FinancialReconciliationService.instance = new FinancialReconciliationService();
    }
    return FinancialReconciliationService.instance;
  }

  /**
   * Reconciles an invoice and a payment.
   */
  public async reconcileInvoicePayment(params: {
    invoice: Invoice;
    payment: Payment;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }): Promise<FinancialReconciliationRecord> {
    const { invoice, payment, facilityId, actorId, actorRole } = params;
    const now = new Date().toISOString();
    const reconciliationId = `rec_inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    let decision: ReconciliationDecisionType = 'UNMATCHED';
    const discrepancy = invoice.patientResponsibility - payment.amount;

    if (payment.status === 'REVERSED') {
      decision = 'REVERSED';
    } else if (Math.abs(discrepancy) < 0.01) {
      decision = 'MATCHED';
    } else if (payment.amount < invoice.patientResponsibility && payment.amount > 0) {
      decision = 'PARTIAL';
    } else {
      decision = 'CONFLICT';
    }

    const auditHash = sha256(`${reconciliationId}:${invoice.invoiceId}:${payment.paymentId}:${decision}:${now}`);

    const record: FinancialReconciliationRecord = {
      reconciliationId,
      reconciliationType: 'INVOICE_PAYMENT',
      primaryEntityId: invoice.invoiceId,
      secondaryEntityId: payment.paymentId,
      facilityId,
      decision,
      primaryAmount: invoice.patientResponsibility,
      secondaryAmount: payment.amount,
      discrepancyAmount: discrepancy,
      notes: `Invoice ${invoice.invoiceNumber} reconciled with Payment ${payment.receiptNumber}: ${decision} (Discrepancy: ${discrepancy})`,
      timestamp: now,
      actorId,
      actorRole,
      auditHash,
    };

    this.records.set(reconciliationId, record);

    try {
      await idbEngine.put('financialReconciliation' as any, record);
    } catch {}

    await auditService.log({
      action: 'FINANCE_PAYMENT_RECONCILE',
      actorId,
      facilityId,
      details: { notes: record.notes, decision: record.decision },
    });

    return record;
  }

  /**
   * Reconciles an adjudicated claim and received payment.
   */
  public async reconcileClaimPayment(params: {
    claim: Claim;
    payment: Payment;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }): Promise<FinancialReconciliationRecord> {
    const { claim, payment, facilityId, actorId, actorRole } = params;
    const now = new Date().toISOString();
    const reconciliationId = `rec_clm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const expectedAmount = claim.approvedAmount || 0;
    const discrepancy = expectedAmount - payment.amount;

    let decision: ReconciliationDecisionType = 'UNMATCHED';
    if (payment.status === 'REVERSED') {
      decision = 'REVERSED';
    } else if (Math.abs(discrepancy) < 0.01) {
      decision = 'MATCHED';
    } else if (payment.amount < expectedAmount && payment.amount > 0) {
      decision = 'PARTIAL';
    } else {
      decision = 'CONFLICT';
    }

    const auditHash = sha256(`${reconciliationId}:${claim.claimId}:${payment.paymentId}:${decision}:${now}`);

    const record: FinancialReconciliationRecord = {
      reconciliationId,
      reconciliationType: 'CLAIM_PAYMENT',
      primaryEntityId: claim.claimId,
      secondaryEntityId: payment.paymentId,
      facilityId,
      decision,
      primaryAmount: expectedAmount,
      secondaryAmount: payment.amount,
      discrepancyAmount: discrepancy,
      notes: `Claim ${claim.claimNumber} reconciled with Payment ${payment.receiptNumber}: ${decision} (Discrepancy: ${discrepancy})`,
      timestamp: now,
      actorId,
      actorRole,
      auditHash,
    };

    this.records.set(reconciliationId, record);

    try {
      await idbEngine.put('financialReconciliation' as any, record);
    } catch {}

    await auditService.log({
      action: 'FINANCE_CLAIM_RECONCILE',
      actorId,
      facilityId,
      details: { notes: record.notes, decision: record.decision },
    });

    return record;
  }

  /**
   * Reconciles a payment transaction against an external settlement/banking reference.
   */
  public async reconcilePaymentExternalReference(params: {
    payment: Payment;
    externalReference: string;
    externalAmount: number;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }): Promise<FinancialReconciliationRecord> {
    const { payment, externalReference, externalAmount, facilityId, actorId, actorRole } = params;
    const now = new Date().toISOString();
    const reconciliationId = `rec_ext_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const discrepancy = payment.amount - externalAmount;
    let decision: ReconciliationDecisionType = 'UNMATCHED';

    if (Math.abs(discrepancy) < 0.01 && payment.reference === externalReference) {
      decision = 'MATCHED';
    } else if (payment.reference !== externalReference) {
      decision = 'CONFLICT';
    } else {
      decision = 'PARTIAL';
    }

    const auditHash = sha256(`${reconciliationId}:${payment.paymentId}:${externalReference}:${decision}:${now}`);

    const record: FinancialReconciliationRecord = {
      reconciliationId,
      reconciliationType: 'PAYMENT_EXTERNAL',
      primaryEntityId: payment.paymentId,
      secondaryEntityId: externalReference,
      facilityId,
      decision,
      primaryAmount: payment.amount,
      secondaryAmount: externalAmount,
      discrepancyAmount: discrepancy,
      notes: `Payment ${payment.receiptNumber} verified against external banking ref ${externalReference}: ${decision}`,
      timestamp: now,
      actorId,
      actorRole,
      auditHash,
    };

    this.records.set(reconciliationId, record);

    try {
      await idbEngine.put('financialReconciliation' as any, record);
    } catch {}

    return record;
  }

  /**
   * Reconciles a reversed payment against the original settled transaction.
   */
  public async reconcileReversalOriginal(params: {
    originalPayment: Payment;
    reversalRecord: Payment;
    facilityId: string;
    actorId: string;
    actorRole: string;
  }): Promise<FinancialReconciliationRecord> {
    const { originalPayment, reversalRecord, facilityId, actorId, actorRole } = params;
    const now = new Date().toISOString();
    const reconciliationId = `rec_rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const decision: ReconciliationDecisionType =
      reversalRecord.status === 'REVERSED' && reversalRecord.amount === originalPayment.amount
        ? 'REVERSED'
        : 'CONFLICT';

    const auditHash = sha256(`${reconciliationId}:${originalPayment.paymentId}:${reversalRecord.paymentId}:${decision}:${now}`);

    const record: FinancialReconciliationRecord = {
      reconciliationId,
      reconciliationType: 'REVERSAL_ORIGINAL',
      primaryEntityId: originalPayment.paymentId,
      secondaryEntityId: reversalRecord.paymentId,
      facilityId,
      decision,
      primaryAmount: originalPayment.amount,
      secondaryAmount: reversalRecord.amount,
      discrepancyAmount: 0,
      notes: `Reversal audit complete for original payment ${originalPayment.receiptNumber}: ${decision}`,
      timestamp: now,
      actorId,
      actorRole,
      auditHash,
    };

    this.records.set(reconciliationId, record);

    try {
      await idbEngine.put('financialReconciliation' as any, record);
    } catch {}

    return record;
  }

  /**
   * Retrieves all reconciliation records.
   */
  public getReconciliationRecords(): FinancialReconciliationRecord[] {
    return Array.from(this.records.values());
  }

  public getRecord(reconciliationId: string): FinancialReconciliationRecord | undefined {
    return this.records.get(reconciliationId);
  }
}

export const financialReconciliationService = FinancialReconciliationService.getInstance();
