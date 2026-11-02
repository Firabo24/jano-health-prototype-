import 'fake-indexeddb/auto';
import { idbEngine, ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { longitudinalIdentityService } from '../src/services/identity/longitudinalIdentityService';
import { consentPolicyEngine } from '../src/services/consent/consentPolicyEngine';
import { financingService } from '../src/services/finance/financingService';
import { clinicalWorkflowService } from '../src/services/clinical/clinicalWorkflowService';
import { clinicalAssessmentService } from '../src/services/clinical/clinicalAssessmentService';
import { auditRepository } from '../src/services/audit/auditRepository';
import { syncQueue } from '../src/services/sync/syncQueue';
import { Coverage } from '../src/domain/financingTypes';
import { PatientConsent } from '../src/domain/consentTypes';

async function run() {
  console.log('--- Starting All-Flows IDB Test ---');
  await localRepository.ensureInitialized();
  console.log('1. localRepository initialized');

  const patientId = 'pat-001-mkwawa';

  // Flow 1: Register longitudinal identity
  const ident = await longitudinalIdentityService.createProvisionalIdentity(
    patientId,
    'fac-amgh',
    'usr-clerk-1',
    'nurse'
  );
  console.log('2. Longitudinal identity created:', ident.identityId);

  // Flow 2: Grant consent
  const consentInput: Omit<PatientConsent, 'consentId' | 'version' | 'integrityHash'> = {
    patientId,
    purposes: ['DIRECT_CARE'],
    scope: {
      facilities: ['fac-amgh'],
    },
    status: 'ACTIVE',
    effectivePeriod: {
      start: new Date().toISOString(),
      end: new Date(Date.now() + 86400000).toISOString(),
    },
    grantedAt: new Date().toISOString(),
    provenance: {
      grantedFacilityId: 'fac-amgh',
      grantedByActorId: 'usr-clerk-1',
      grantedByActorRole: 'nurse',
      systemVersion: 'v15.0',
    },
    verificationMetadata: {
      signatureType: 'ELECTRONIC',
      verifiedAt: new Date().toISOString(),
    },
  };
  const consent = await consentPolicyEngine.grantConsent(consentInput);
  console.log('3. Consent granted:', consent.consentId);

  // Flow 3: Financing coverage, claim, invoice, payment
  const coverageRec: Coverage = {
    coverageId: 'cov-v15-test',
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

  const claim = await financingService.createClaim({
    patientId,
    payerId: 'pyr-community-health-fund',
    coverageId: 'cov-v15-test',
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
    ],
  });
  console.log('4. Claim created:', claim.claimId);

  const invoice = await financingService.issueInvoice({
    patientId,
    payerId: 'pyr-community-health-fund',
    claimId: claim.claimId,
    facilityId: 'fac-amgh',
    payerResponsibility: 4500,
    patientResponsibility: 750,
    lineItems: [
      {
        itemId: 'l1',
        description: 'Amoxicillin 500mg (Copay)',
        quantity: 1,
        unitPrice: 5250,
        totalPrice: 5250,
        payerPortion: 4500,
        patientPortion: 750,
      },
    ],
    actorId: 'usr-finance',
    actorRole: 'finance_officer',
  });
  console.log('5. Invoice issued:', invoice.invoiceId);

  const payment = await financingService.recordPayment({
    invoiceId: invoice.invoiceId,
    patientId,
    amount: 750,
    method: 'CASH',
    reference: 'REC-2026-0001',
    facilityId: 'fac-amgh',
    actorId: 'usr-cashier',
    actorRole: 'finance_officer',
  });
  console.log('6. Financing payment recorded:', payment.paymentId);

  // Flow 4: Clinical encounter & triage
  const actor = {
    userId: 'usr-dr-amani',
    userName: 'Dr. Amani',
    userRole: 'physician' as any,
    facilityId: 'fac-amgh',
    deviceId: 'unit-01',
  };

  const enc = await clinicalWorkflowService.createEncounter(
    {
      patientId,
      facilityId: 'fac-amgh',
      clinicianId: 'usr-dr-amani',
      type: 'outpatient',
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      chiefComplaint: 'High fever and chills',
    },
    actor
  );
  console.log('7. Encounter created:', enc.id);

  const triage = await clinicalWorkflowService.recordEmergencyTriage(
    {
      emergencyTriageId: 'emg-001',
      facilityId: 'fac-amgh',
      triagedBy: 'usr-nurse-1',
      triageLevel: 'URGENT',
      vitalSigns: { hr: 110, temp: 39.2, bpSystolic: 120, bpDiastolic: 80, rr: 24, spo2: 96 } as any,
      chiefComplaint: 'High fever and chills',
    } as any,
    actor
  );
  console.log('8. Emergency triage recorded:', triage.id);

  // Flow 5: Problem & diagnosis
  const principal = {
    userId: 'usr-dr-amani',
    id: 'usr-dr-amani',
    name: 'Dr. Amani',
    userName: 'Dr. Amani',
    fullName: 'Dr. Amani',
    role: 'physician' as any,
    facilityId: 'fac-amgh',
    deviceId: 'unit-01',
  };

  const prob = await clinicalAssessmentService.createProblem(
    {
      patientId,
      facilityId: 'fac-amgh',
      description: 'Acute high fever, rigors and headaches',
    },
    principal
  );
  console.log('9. Problem recorded:', prob.id);

  // Flow 6: Audit & Sync queue
  await auditRepository.record({
    id: 'aud-test-999',
    actorId: 'usr-dr-amani',
    actorName: 'Dr. Amani',
    actorRole: 'physician',
    facilityId: 'fac-amgh',
    action: 'VIEW_PATIENT_CHART',
    resourceType: 'Patient',
    resourceId: patientId,
    timestamp: new Date().toISOString(),
    deviceId: 'unit-01',
    syncStatus: 'synced',
  });
  console.log('10. Audit recorded');

  await syncQueue.enqueue({
    eventId: 'evt-test-999',
    eventType: 'PATIENT_UPDATED',
    aggregateType: 'Patient',
    aggregateId: patientId,
    facilityId: 'fac-amgh',
    actorId: 'usr-dr-amani',
    deviceId: 'unit-01',
    metadata: {},
    timestamp: new Date().toISOString(),
    version: 1,
    sequence: 1,
    payload: { test: true },
    syncStatus: 'PENDING',
    retryCount: 0,
  });
  console.log('11. SyncQueue enqueued');

  // Verify all stores can accept objects without errors
  for (const storeName of ALL_STORE_NAMES) {
    await idbEngine.put(storeName, { test: 'value', patientId });
  }
  console.log(`12. All ${ALL_STORE_NAMES.length} (including baseline 53) stores put validated successfully`);

  console.log('--- ALL FLOWS COMPLETED SUCCESSFULLY WITH ZERO ERRORS ---');
}

run().catch((e) => {
  console.error('RUN ERROR:', e);
  process.exit(1);
});
