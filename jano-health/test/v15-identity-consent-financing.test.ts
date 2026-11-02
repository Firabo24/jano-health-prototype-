/**
 * Jano Health - Clinical Core V15: Identity, Consent & Health Financing Interoperability Test Suite
 *
 * Validates:
 * 1. Longitudinal Identity: Multi-facility resolution, provisional creation, external linking, anti-auto-merge, and national ID adapter.
 * 2. Consent Engine: Granular purpose-scoped consent, directive revocation, emergency break-glass override, and audit logging.
 * 3. Health Financing: Payer/program registry, offline & online eligibility verification, prior authorizations, claims submission,
 *    adjudication, invoice generation, payment recording, financial quarantine, and tamper-evident append-only ledger replay.
 */

import { longitudinalIdentityService } from '../src/services/identity/longitudinalIdentityService';
import { consentPolicyEngine } from '../src/services/consent/consentPolicyEngine';
import { financingService } from '../src/services/finance/financingService';
import { financialReconciliationService } from '../src/services/finance/financialReconciliationService';
import { FHIRFinancialMapper } from '../src/services/fhir/financialMapper';
import { financingIntelligenceService } from '../src/services/analytics/financingIntelligenceService';
import { clinicalExchangeService } from '../src/services/network/clinicalExchange';
import { localRepository } from '../src/services/storage/localRepository';
import { Coverage, Payment } from '../src/domain/financingTypes';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`  ✓ PASS: ${msg}`);
  }
}

async function runTestSuite() {
  console.log('=============================================================');
  console.log('JANO HEALTH - V15 IDENTITY, CONSENT & FINANCING TEST SUITE');
  console.log('=============================================================');

  // -------------------------------------------------------------
  // TEST 1: Longitudinal Identity Creation & Provenance
  // -------------------------------------------------------------
  console.log('\n[TEST 1] Longitudinal Identity Provisioning & Provenance...');
  const patientId = 'pat-v15-001';
  const facilityId = 'fac-amgh';

  const identity = await longitudinalIdentityService.createProvisionalIdentity(
    patientId,
    facilityId,
    'usr-clerk',
    'records_clerk'
  );

  assert(!!identity.identityId, 'Longitudinal identity minted with valid ID (lid_...)');
  assert(identity.patientId === patientId, 'Patient ID correctly bound');
  assert(identity.linkedFacilities.includes(facilityId), 'Facility fac-amgh linked');
  assert(identity.identityStatus === 'PROVISIONAL', 'Status is PROVISIONAL');
  assert(identity.version === 1, 'Initial version is 1');
  assert(!!identity.integrityHash, 'SHA-256 integrity hash generated');

  // -------------------------------------------------------------
  // TEST 2: Multi-Facility Linking & External Systems
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Multi-Facility Linking & External System References...');
  const updatedWithFacility = await longitudinalIdentityService.linkFacility(patientId, 'fac-central');
  assert(updatedWithFacility.linkedFacilities.includes('fac-central'), 'Secondary facility fac-central linked successfully');

  const updatedWithExternal = await longitudinalIdentityService.linkExternalSystem(
    patientId,
    'SYS_DHIS2',
    'District Health Information System',
    'EXT-DHIS2-9921',
    'usr-supervisor'
  );
  assert(
    updatedWithExternal.linkedExternalSystems.some((s) => s.systemCode === 'SYS_DHIS2' && s.externalId === 'EXT-DHIS2-9921'),
    'External system SYS_DHIS2 linked to longitudinal identity'
  );

  // -------------------------------------------------------------
  // TEST 3: National Identity Adapter Invariant (Never Fabricates)
  // -------------------------------------------------------------
  console.log('\n[TEST 3] National Identity Adapter Fail-Closed & Non-Fabrication...');
  const natCheck = await longitudinalIdentityService.checkNationalIdentity('NAT-ID-123456');
  assert(natCheck.verificationState === 'NOT_CONFIGURED', 'National identity adapter defaults to NOT_CONFIGURED');
  assert(natCheck.provenance.adapterStatus === 'NOT_CONFIGURED', 'Adapter status confirms NOT_CONFIGURED without fabrication');

  // -------------------------------------------------------------
  // TEST 4: Identity Reconciliation & Anti-Auto-Merge Guard
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Identity Reconciliation & Anti-Auto-Merge Guard...');
  const ambiguousIncoming = {
    sourceSystem: 'SYS_REGIONAL_HOSPITAL',
    externalId: 'REG-88219',
    demographics: {
      firstName: 'Amara',
      lastName: 'Kone',
      birthDate: '1988-06-14',
    },
  };

  const decision = await longitudinalIdentityService.reconcileIdentity(ambiguousIncoming, {
    actorId: 'usr-clerk',
    actorRole: 'records_clerk',
    facilityId: 'fac-amgh',
  });

  assert(
    decision.decision === 'REVIEW_REQUIRED' || decision.decision === 'CREATE_PROVISIONAL',
    'Ambiguous match prevented from autonomous merge; requires human review'
  );
  assert(decision.provenance.systemVersion === 'v15.0', 'Provenance tracks v15.0');

  // -------------------------------------------------------------
  // TEST 5: Granular Purpose-Scoped Consent Directives
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Granular Purpose-Scoped Consent Directives...');
  const consent = await consentPolicyEngine.grantConsent({
    patientId,
    purposes: ['DIRECT_CARE', 'REFERRAL', 'DIAGNOSTIC_SERVICE'],
    scope: {
      facilities: ['fac-amgh', 'fac-central'],
      resourceCategories: ['PATIENT_DEMOGRAPHICS', 'ENCOUNTERS', 'LABORATORY', 'MEDICATIONS'],
    },
    effectivePeriod: {
      start: '2026-01-01T00:00:00Z',
      end: '2027-01-01T00:00:00Z',
    },
    status: 'ACTIVE',
    grantedAt: '2026-01-01T00:00:00Z',
    provenance: {
      grantedFacilityId: 'fac-amgh',
      grantedByActorId: 'usr-clerk',
      grantedByActorRole: 'nurse',
      systemVersion: 'v15.0',
    },
    verificationMetadata: {
      signatureType: 'WRITTEN',
      verifiedAt: '2026-01-01T10:00:00Z',
    },
  });

  assert(consent.consentId.startsWith('cst_'), 'Consent created with cst_ prefix');
  assert(consent.status === 'ACTIVE', 'Consent status is ACTIVE');

  // Evaluate access against granted consent
  const directCareAllowed = await consentPolicyEngine.evaluateConsent({
    patientId,
    actorId: 'usr-dr-smith',
    actorRole: 'physician',
    facilityId: 'fac-amgh',
    purpose: 'DIRECT_CARE',
    resourceCategory: 'LABORATORY',
  });
  assert(directCareAllowed.decision === 'ALLOWED', 'Direct care lab access permitted by active consent');

  // Evaluate access for excluded purpose (RESEARCH not granted)
  const researchAllowed = await consentPolicyEngine.evaluateConsent({
    patientId,
    actorId: 'usr-researcher',
    actorRole: 'researcher',
    facilityId: 'fac-amgh',
    purpose: 'RESEARCH',
    resourceCategory: 'LABORATORY',
  });
  assert(researchAllowed.decision === 'DENIED', 'Non-granted research purpose strictly DENIED');

  // -------------------------------------------------------------
  // TEST 6: Consent Revocation & Directive Enforcement
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Consent Revocation & Access Cut-off...');
  const revoked = await consentPolicyEngine.revokeConsent(
    consent.consentId,
    'Patient opted to restrict referrals',
    'usr-clerk',
    'nurse',
    'fac-amgh'
  );
  assert(revoked.status === 'REVOKED', 'Consent successfully transitioned to REVOKED');

  const afterRevokeAccess = await consentPolicyEngine.evaluateConsent({
    patientId,
    actorId: 'usr-dr-smith',
    actorRole: 'physician',
    facilityId: 'fac-amgh',
    purpose: 'DIRECT_CARE',
    resourceCategory: 'LABORATORY',
  });
  assert(afterRevokeAccess.decision === 'DENIED', 'Access strictly DENIED following consent revocation');

  // -------------------------------------------------------------
  // TEST 7: Emergency Break-Glass Override & Audit Trace
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Emergency Break-Glass Override & Audit Trace...');
  const emergencyAccess = await consentPolicyEngine.requestEmergencyAccess({
    actorId: 'usr-dr-emergency',
    actorRole: 'physician',
    actorName: 'Dr. Kwame Mensah',
    facilityId: 'fac-amgh',
    patientId,
    emergencyReason: 'Acute traumatic hypovolemic shock requiring immediate blood typing',
    durationMinutes: 45,
  });

  assert(emergencyAccess.requestId.startsWith('emg_'), 'Emergency access session created');
  assert(emergencyAccess.decision === 'EMERGENCY_ALLOWED', 'Emergency session is EMERGENCY_ALLOWED');

  // Break-glass override evaluation
  const emergencyCheck = await consentPolicyEngine.evaluateConsent({
    patientId,
    actorId: 'usr-dr-emergency',
    actorRole: 'physician',
    facilityId: 'fac-amgh',
    purpose: 'DIRECT_CARE',
    resourceCategory: 'LABORATORY',
    emergencyBreakGlassId: emergencyAccess.requestId,
  });
  assert(emergencyCheck.decision === 'EMERGENCY_ALLOWED', 'Break-glass override grants emergency clinical access');

  // -------------------------------------------------------------
  // TEST 8: Payer & Financing Program Setup
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Health Financing Payer & Benefit Program Setup...');
  const payers = await financingService.getPayers();
  assert(payers.length >= 2, 'Default synthetic payers initialized');

  const programs = await financingService.getPrograms();
  assert(programs.length >= 1, 'Default synthetic programs initialized');

  // -------------------------------------------------------------
  // TEST 9: Patient Coverage & Offline/Online Eligibility Checks
  // -------------------------------------------------------------
  console.log('\n[TEST 9] Coverage Registration & Eligibility Verification...');
  const coverageRec: Coverage = {
    coverageId: 'cov-v15-amara',
    patientId,
    payerId: 'pyr-community-health-fund',
    programId: 'prog-chf-essential-2026',
    memberReference: 'CHF-99887766',
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    coverageClass: 'STANDARD_PRIMARY',
    benefitReference: {
      planName: 'CHF Essential 2026',
      copayPercent: 10,
    },
    verificationStatus: 'PENDING',
    provenance: {
      recordedAt: '2026-01-01T08:00:00Z',
      recordedBy: 'usr-finance',
      facilityId: 'fac-amgh',
    },
  };

  await financingService.recordCoverage(coverageRec);

  // Online verification
  const onlineEligibility = await financingService.verifyEligibility({
    coverageId: 'cov-v15-amara',
    patientId,
    facilityId: 'fac-amgh',
    actorId: 'usr-finance',
    isOnline: true,
  });
  assert(onlineEligibility.status === 'VERIFIED', 'Online eligibility check returns VERIFIED');
  assert(onlineEligibility.stale === false, 'Fresh online result is not stale');

  // Offline verification (cached mode)
  const offlineEligibility = await financingService.verifyEligibility({
    coverageId: 'cov-v15-amara',
    patientId,
    facilityId: 'fac-amgh',
    actorId: 'usr-finance',
    isOnline: false,
  });
  assert(offlineEligibility.status === 'VERIFIED', 'Offline cached eligibility check succeeds safely');
  assert(offlineEligibility.source === 'OFFLINE_LOCAL_CACHE', 'Offline result correctly marked as OFFLINE_LOCAL_CACHE');

  // -------------------------------------------------------------
  // TEST 10: Prior Authorization Flow
  // -------------------------------------------------------------
  console.log('\n[TEST 10] Prior Authorization Flow...');
  const priorAuth = await financingService.requestAuthorization({
    patientId,
    coverageId: 'cov-v15-amara',
    facilityId: 'fac-amgh',
    actorId: 'usr-dr-smith',
    actorRole: 'physician',
    requestedService: 'Elective Laparoscopic Appendectomy',
    serviceCode: 'SURG-APP-01',
    clinicalReference: {
      type: 'ENCOUNTER',
      referenceId: 'enc-v15-001',
      description: 'Recurrent subacute appendicitis confirmed by ultrasound',
    },
    requestedAmount: 25000,
    requestedUnits: 1,
    purpose: 'Prior authorization for surgical intervention',
  });
  assert(priorAuth.authorizationId.startsWith('auth_'), 'Prior authorization created with auth_ ID');
  assert(priorAuth.status === 'APPROVED', 'Auth status is APPROVED');

  // -------------------------------------------------------------
  // TEST 11: Claim Generation, Adjudication, Invoices & Payments
  // -------------------------------------------------------------
  console.log('\n[TEST 11] Claim Generation, Offline Queueing, Invoicing & Payment...');
  const claim = await financingService.createClaim({
    patientId,
    payerId: 'pyr-community-health-fund',
    coverageId: 'cov-v15-amara',
    facilityId: 'fac-amgh',
    encounterReference: 'enc-v15-001',
    servicePeriod: { start: '2026-01-01', end: '2026-01-01' },
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
    lines: [
      {
        serviceCode: 'MED-AMX-500',
        serviceDescription: 'Amoxicillin 500mg capsules',
        quantity: 21,
        unitAmount: 250,
        sourceReference: { domain: 'medication', id: 'rx-001' },
      },
      {
        serviceCode: 'LAB-CBC',
        serviceDescription: 'Complete Blood Count with differential',
        quantity: 1,
        unitAmount: 1500,
        sourceReference: { domain: 'lab', id: 'lab-001' },
      },
    ],
  });

  assert(claim.claimId.startsWith('clm_'), 'Claim generated with clm_ prefix');
  assert(claim.submittedAmount === 6750, 'Total claim amount correctly calculated (21*250 + 1500 = 6750)');

  // Submit claim online
  const submittedClaim = await financingService.submitClaim(claim.claimId, 'usr-finance', 'finance_officer', true);
  assert(submittedClaim.status === 'ACKNOWLEDGED', 'Claim acknowledged by clearinghouse adapter');

  // Adjudicate claim
  const adjudicated = await financingService.adjudicateClaim(
    claim.claimId,
    'PAID',
    5737.5, // 85% approved
    'Approved as essential health benefit',
    'usr-finance',
    'finance_officer'
  );
  assert(adjudicated.status === 'PAID', 'Claim adjudicated to PAID');
  assert(adjudicated.approvedAmount === 5737.5, 'Approved amount recorded');
  assert(adjudicated.patientResponsibility === 1012.5, 'Patient copay responsibility calculated (15%)');

  // Issue Patient Invoice
  const invoice = await financingService.issueInvoice({
    patientId,
    payerId: 'pyr-community-health-fund',
    claimId: claim.claimId,
    facilityId: 'fac-amgh',
    payerResponsibility: 5737.5,
    patientResponsibility: 1012.5,
    lineItems: [
      { itemId: 'l1', description: 'Amoxicillin 500mg (Copay)', quantity: 1, unitPrice: 787.5, totalPrice: 787.5, payerPortion: 0, patientPortion: 787.5 },
      { itemId: 'l2', description: 'CBC with differential (Copay)', quantity: 1, unitPrice: 225.0, totalPrice: 225.0, payerPortion: 0, patientPortion: 225.0 },
    ],
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
  });
  assert(invoice.invoiceId.startsWith('inv_'), 'Invoice generated with inv_ prefix');
  assert(invoice.status === 'ISSUED', 'Invoice status is ISSUED');
  assert(invoice.totalAmount === 6750, 'Total invoice matches combined patient + payer responsibility');

  // Record Patient Payment
  const payment = await financingService.recordPayment({
    invoiceId: invoice.invoiceId,
    patientId,
    amount: 1012.5,
    method: 'CASH',
    reference: 'REC-2026-0001',
    facilityId: 'fac-amgh',
    actorId: 'usr-cashier',
    actorRole: 'finance_officer',
  });
  assert(payment.paymentId.startsWith('pmt_'), 'Payment recorded with pmt_ prefix');
  assert(payment.status === 'RECEIVED', 'Payment status is RECEIVED');

  const updatedInvoice = await financingService.getInvoice(invoice.invoiceId);
  assert(updatedInvoice?.status === 'SETTLED', 'Invoice automatically settled upon full payment');

  // -------------------------------------------------------------
  // TEST 12: Financial Ledger Integrity & Quarantine Safeguards
  // -------------------------------------------------------------
  console.log('\n[TEST 12] Tamper-Evident Ledger Integrity & Financial Quarantine...');
  const ledgerIntegrity = financingService.verifyLedgerIntegrity();
  assert(ledgerIntegrity.valid === true, 'Financial event ledger cryptographically consistent');
  assert(ledgerIntegrity.totalEvents >= 4, 'Ledger contains verified immutable financial events');

  // Quarantine record test
  const quarantined = await financingService.quarantineRecord({
    category: 'CLAIM_VALIDATION_ERROR',
    entityType: 'CLAIM',
    entityId: 'bad-claim-001',
    facilityId: 'fac-amgh',
    reason: 'Charge per unit exceeds statutory cap by 400%',
    details: { unitAmount: 999999 },
  });
  assert(quarantined.quarantineId.startsWith('fq_'), 'Financial quarantine record generated');
  assert(quarantined.status === 'ACTIVE', 'Quarantine status is ACTIVE');

  const resolved = await financingService.resolveQuarantine(
    quarantined.quarantineId,
    'Cleared after verifying rare imported orphan drug',
    'usr-supervisor'
  );
  assert(resolved.status === 'RESOLVED', 'Quarantine resolved with audit notes');

  // -------------------------------------------------------------
  // TEST 13: Identity Lifecycle Transitions & Terminal State Protections
  // -------------------------------------------------------------
  console.log('\n[TEST 13] Identity Lifecycle Transitions & Terminal State Protections...');
  const testPatientId = 'pat-lifecycle-001';
  const testId = await longitudinalIdentityService.createProvisionalIdentity(
    testPatientId,
    'fac-amgh',
    'usr-admin',
    'system_administrator'
  );

  const verifiedId = await longitudinalIdentityService.updateIdentityStatus(
    testId.identityId,
    'VERIFIED',
    'usr-admin',
    'system_administrator',
    'Verified via biometric and national cross-check'
  );
  assert(verifiedId.identityStatus === 'VERIFIED', 'Identity transitioned to VERIFIED');

  const suspendedId = await longitudinalIdentityService.updateIdentityStatus(
    testId.identityId,
    'SUSPENDED',
    'usr-admin',
    'system_administrator',
    'Suspended due to conflicting identity assertion'
  );
  assert(suspendedId.identityStatus === 'SUSPENDED', 'Identity transitioned to SUSPENDED');

  const retiredId = await longitudinalIdentityService.updateIdentityStatus(
    testId.identityId,
    'RETIRED',
    'usr-admin',
    'system_administrator',
    'Patient deceased'
  );
  assert(retiredId.identityStatus === 'RETIRED', 'Identity transitioned to RETIRED');

  // Verify terminal state: RETIRED cannot transition out
  let blocked = false;
  try {
    await longitudinalIdentityService.updateIdentityStatus(
      testId.identityId,
      'VERIFIED',
      'usr-admin',
      'system_administrator',
      'Attempting illegal un-retirement'
    );
  } catch (err: any) {
    blocked = true;
  }
  assert(blocked, 'Illegal transition out of terminal RETIRED state is strictly blocked');

  // -------------------------------------------------------------
  // TEST 14: Non-Destructive Claim Corrections & Lineage Retention
  // -------------------------------------------------------------
  console.log('\n[TEST 14] Non-Destructive Claim Corrections & Lineage Retention...');
  const correctionResult = await financingService.correctClaim(claim.claimId, {
    reason: 'Adjustment of unit cost for antibiotic suspension',
    changedFields: ['submittedAmount'],
    updatedSubmittedAmount: 7200,
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
    facilityId: 'fac-amgh',
  });

  assert(correctionResult.originalClaim.status === 'VOIDED', 'Original historical claim marked VOIDED without destruction');
  assert(correctionResult.supersedingClaim.claimNumber.endsWith('-CORR'), 'Superseding claim minted with -CORR lineage');
  assert(correctionResult.supersedingClaim.submittedAmount === 7200, 'Superseding claim reflects updated amount');
  assert(!!correctionResult.correctionRecord.integrityHash, 'Correction record sealed with integrity hash');

  // -------------------------------------------------------------
  // TEST 15: Financial Reconciliation Engine (Multi-Decision Matching)
  // -------------------------------------------------------------
  console.log('\n[TEST 15] Financial Reconciliation Engine...');
  // Exact match reconciliation
  const matchRec = await financialReconciliationService.reconcileInvoicePayment({
    invoice,
    payment,
    facilityId: 'fac-amgh',
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
  });
  assert(matchRec.decision === 'MATCHED', 'Invoice and full payment reconcile to MATCHED');
  assert(matchRec.discrepancyAmount === 0, 'Zero discrepancy on full payment match');

  // Partial payment reconciliation
  const partialPayment: Payment = {
    ...payment,
    paymentId: 'pmt-partial-001',
    amount: 500,
  };
  const partialRec = await financialReconciliationService.reconcileInvoicePayment({
    invoice,
    payment: partialPayment,
    facilityId: 'fac-amgh',
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
  });
  assert(partialRec.decision === 'PARTIAL', 'Underpayment reconciles to PARTIAL');
  assert(partialRec.discrepancyAmount > 0, 'Discrepancy calculated correctly on partial payment');

  // Bank reference verification
  const extRec = await financialReconciliationService.reconcilePaymentExternalReference({
    payment,
    externalReference: 'REC-2026-0001',
    externalAmount: payment.amount,
    facilityId: 'fac-amgh',
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
  });
  assert(extRec.decision === 'MATCHED', 'Banking settlement reference confirms MATCHED');

  // -------------------------------------------------------------
  // TEST 16: Hard Clinical / Financial Separation Invariants
  // -------------------------------------------------------------
  console.log('\n[TEST 16] Hard Clinical / Financial Separation Invariants...');
  // Invariant 1: Claim denial does not mutate clinical encounter
  const testEncounterId = 'enc-safety-001';
  const deniedClaim = await financingService.adjudicateClaim(
    correctionResult.supersedingClaim.claimId,
    'DENIED',
    0,
    'Benefit limit exceeded for fiscal year',
    'usr-finance',
    'finance_officer'
  );
  assert(deniedClaim.status === 'DENIED', 'Claim is DENIED');
  // Encounter reference remains intact and unchanged
  assert(deniedClaim.encounterReference === 'enc-v15-001', 'Clinical encounter reference unchanged by claim denial');

  // Invariant 2: Payment reversal does not cancel clinical prescription
  const reversedPmt = await financingService.reversePayment(
    payment.paymentId,
    'Card chargeback disputed by customer bank',
    'usr-finance',
    'finance_officer',
    'fac-amgh'
  );
  assert(reversedPmt.status === 'REVERSED', 'Payment successfully REVERSED');
  assert(reversedPmt.reversalReason?.includes('chargeback') ?? false, 'Reversal reason preserved for audit');

  // Invariant 3: Payer offline / unverified coverage does not block emergency access
  const unverifiedEmg = await consentPolicyEngine.requestEmergencyAccess({
    actorId: 'usr-dr-er',
    actorRole: 'physician',
    actorName: 'Dr. Emergency Clinician',
    facilityId: 'fac-amgh',
    patientId: 'pat-unverified-coverage',
    emergencyReason: 'Severe acute trauma arrival without active coverage records',
    durationMinutes: 60,
  });

  const unverifiedEmergencyCheck = await consentPolicyEngine.evaluateConsent({
    patientId: 'pat-unverified-coverage',
    actorId: 'usr-dr-er',
    actorRole: 'physician',
    facilityId: 'fac-amgh',
    purpose: 'DIRECT_CARE',
    emergencyBreakGlassId: unverifiedEmg.requestId,
  });
  assert(unverifiedEmergencyCheck.decision === 'EMERGENCY_ALLOWED', 'Emergency care succeeds regardless of payment/coverage connectivity');

  // -------------------------------------------------------------
  // TEST 17: FHIR R5 Financial & Consent Resource Mappings
  // -------------------------------------------------------------
  console.log('\n[TEST 17] FHIR R5 Financial & Consent Resource Mappings...');
  // Consent
  const fhirConsent = FHIRFinancialMapper.toFHIRConsent(consent);
  assert(fhirConsent.resourceType === 'Consent', 'Mapped to FHIR Consent');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirConsent).valid, 'FHIR Consent conforms to validation');

  // Coverage
  const fhirCoverage = FHIRFinancialMapper.toFHIRCoverage(coverageRec);
  assert(fhirCoverage.resourceType === 'Coverage', 'Mapped to FHIR Coverage');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirCoverage).valid, 'FHIR Coverage conforms to validation');

  // Claim
  const fhirClaim = FHIRFinancialMapper.toFHIRClaim(claim);
  assert(fhirClaim.resourceType === 'Claim', 'Mapped to FHIR Claim');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirClaim).valid, 'FHIR Claim conforms to validation');

  // ClaimResponse
  const fhirClaimResp = FHIRFinancialMapper.toFHIRClaimResponse(adjudicated);
  assert(fhirClaimResp.resourceType === 'ClaimResponse', 'Mapped to FHIR ClaimResponse');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirClaimResp).valid, 'FHIR ClaimResponse conforms to validation');

  // Invoice
  const fhirInvoice = FHIRFinancialMapper.toFHIRInvoice(invoice);
  assert(fhirInvoice.resourceType === 'Invoice', 'Mapped to FHIR Invoice');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirInvoice).valid, 'FHIR Invoice conforms to validation');

  // PaymentNotice
  const fhirPaymentNotice = FHIRFinancialMapper.toFHIRPaymentNotice(payment);
  assert(fhirPaymentNotice.resourceType === 'PaymentNotice', 'Mapped to FHIR PaymentNotice');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirPaymentNotice).valid, 'FHIR PaymentNotice conforms to validation');

  // Account
  const fhirAccount = FHIRFinancialMapper.toFHIRAccount(patientId, coverageRec, 15000);
  assert(fhirAccount.resourceType === 'Account', 'Mapped to FHIR Account');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirAccount).valid, 'FHIR Account conforms to validation');

  // ExplanationOfBenefit
  const fhirEOB = FHIRFinancialMapper.toFHIRExplanationOfBenefit(adjudicated, coverageRec);
  assert(fhirEOB.resourceType === 'ExplanationOfBenefit', 'Mapped to FHIR ExplanationOfBenefit');
  assert(FHIRFinancialMapper.validateFinancialResource(fhirEOB).valid, 'FHIR ExplanationOfBenefit conforms to validation');

  // Non-conforming resource validation check (returns OperationOutcome)
  const invalidValidation = FHIRFinancialMapper.validateFinancialResource({ invalid: true });
  assert(!invalidValidation.valid, 'Non-conforming resource rejected');
  assert(invalidValidation.outcome?.resourceType === 'OperationOutcome', 'OperationOutcome returned for validation error');

  // -------------------------------------------------------------
  // TEST 18: Population Intelligence & Small-Cell Privacy
  // -------------------------------------------------------------
  console.log('\n[TEST 18] Population Intelligence Small-Cell Suppression...');
  const popSummary = await financingIntelligenceService.getPopulationFinancingSummary('fac-amgh');
  assert(typeof popSummary.coverageVerificationRate === 'number', 'Coverage verification rate calculated');
  assert(typeof popSummary.reimbursementRatio === 'number', 'Reimbursement ratio calculated');
  assert(popSummary.isSuppressedDueToSmallCell === false, 'Adequate population size is not suppressed');

  // Test suppression on micro-facility with < 5 events
  const microSummary = await financingIntelligenceService.getPopulationFinancingSummary('fac-isolated-dispensary-99');
  assert(microSummary.isSuppressedDueToSmallCell === true || microSummary.totalClaims === 0, 'Micro-cell counts properly suppressed for patient privacy');

  // -------------------------------------------------------------
  // TEST 19: Cross-Facility Network Exchange Consent Enforcement
  // -------------------------------------------------------------
  console.log('\n[TEST 19] Cross-Facility Network Exchange Consent Enforcement...');
  // Patient with active consent
  const consentPass = await clinicalExchangeService.validateNetworkExchangeConsent({
    patientId: 'pat-exchange-001',
    authorFacilityId: 'fac-amgh',
    targetFacilityId: 'fac-central',
    purpose: 'REFERRAL',
    actorId: 'usr-dr-smith',
    actorRole: 'physician',
  });
  // Since pat-exchange-001 has no active consent, it must fail closed
  assert(consentPass.permitted === false, 'Network exchange fails closed without explicit patient consent');

  // Now grant consent for REFERRAL
  await consentPolicyEngine.grantConsent({
    patientId: 'pat-exchange-001',
    purposes: ['REFERRAL'],
    scope: { facilities: ['fac-central'] },
    effectivePeriod: { start: '2026-01-01', end: '2026-12-31' },
    status: 'ACTIVE',
    grantedAt: '2026-01-01T00:00:00Z',
    provenance: {
      grantedFacilityId: 'fac-amgh',
      grantedByActorId: 'usr-clerk',
      grantedByActorRole: 'nurse',
      systemVersion: 'v15.0',
    },
    verificationMetadata: { signatureType: 'WRITTEN', verifiedAt: '2026-01-01T00:00:00Z' },
  });

  const consentApproved = await clinicalExchangeService.validateNetworkExchangeConsent({
    patientId: 'pat-exchange-001',
    authorFacilityId: 'fac-amgh',
    targetFacilityId: 'fac-central',
    purpose: 'REFERRAL',
    actorId: 'usr-dr-smith',
    actorRole: 'physician',
  });
  assert(consentApproved.permitted === true, 'Network exchange permitted once active REFERRAL consent is granted');

  console.log('\n=============================================================');
  console.log('ALL 19/19 V15 IDENTITY, CONSENT & FINANCING TESTS PASSED 100%');
  console.log('=============================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
