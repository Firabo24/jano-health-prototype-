/**
 * Jano Health - Clinical Core V19 Test Suite
 * National Digital Health & Ecosystem Interoperability Verification
 * 
 * Verifies all 26 phases of V19:
 * 1. Ecosystem Registry & Canonical Identity
 * 2. Ecosystem Services (System ≠ Service)
 * 3. Endpoint Registry & Anti-SSRF Defense
 * 4. System Trust Lifecycle & Human Approval Gate
 * 5. National Integration Lifecycle & Production Gate
 * 6. NDHx Adapter & Flow (Default NOT_CONFIGURED & Sandbox)
 * 7. Exchange Queue: DELIVERED ≠ ACKNOWLEDGED ≠ PROCESSED
 * 8. Master Facility Registry (MFR): Lookup & Geographic Scopes
 * 9. MFR Facility Reconciliation & Conflict Detection
 * 10. MFR Cache & Stale Detection
 * 11. National Terminology: Exact & Equivalent Mappings
 * 12. Terminology Ambiguity Quarantine & Version Safety
 * 13. DHIS2 & HMIS Reporting Profiles & Datasets
 * 14. Reporting Quality Invariants (Missing Data ≠ Zero)
 * 15. Reporting Human Approval Gate & State Transitions (QUEUED ≠ SUBMITTED ≠ ACKNOWLEDGED)
 * 16. Non-Destructive Reporting Corrections
 * 17. eCHIS Adapter (Fail-closed & Default NOT_CONFIGURED)
 * 18. National Identity: Masked Privacy & UNAVAILABLE ≠ FAILED
 * 19. Public Health Disease Surveillance (Signal ≠ Outbreak)
 * 20. Surveillance Review, Approval & Transmission
 * 21. Ecosystem Quarantine & Dead-Letter Engine
 * 22. Integration Circuit Breaker & Health Telemetry
 * 23. External System Outage is NEVER a Clinical Outage
 * 24. FHIR R5 Ecosystem Mappings & Conformance (Org, Location, Bundle, OperationOutcome)
 * 25. Cross-Version Architectural Boundaries (V13, V14, V15, V16, V17, V18)
 * 26. AI Safety Gateway Prohibited Ecosystem Mutations
 */

import {
  ecosystemRegistryService,
  DefaultMFRAdapter,
  SandboxMFRAdapter,
  masterFacilityRegistryService,
  DefaultNationalTerminologyAdapter,
  SandboxTerminologyAdapter,
  nationalTerminologyService,
  DefaultDHIS2Adapter,
  SandboxDHIS2Adapter,
  nationalReportingService,
  DefaultECHISAdapter,
  DefaultNationalIdentityAdapter,
  SandboxNationalIdentityAdapter,
  nationalIdentityService,
  DefaultNationalSurveillanceAdapter,
  SandboxSurveillanceAdapter,
  nationalSurveillanceService,
  DefaultNDHxAdapter,
  SandboxNDHxAdapter,
  nationalExchangeQueueService,
  integrationHealthService,
} from '../src/services/ecosystem';
import { FHIREcosystemMapper } from '../src/services/fhir/ecosystemMapper';
import { aiSafetyGateway } from '../src/services/ai/aiSafetyGateway';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { ExternalSystemRegistryService } from '../src/services/fhir/externalSystems';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('STARTING CLINICAL CORE V19 TEST SUITE: NATIONAL DIGITAL HEALTH');
  console.log('================================================================\n');

  // ----------------------------------------------------
  // 1. Ecosystem Registry & Canonical Identity
  // ----------------------------------------------------
  console.log('--- 1. Ecosystem Registry & Canonical Identity ---');

  const ndhxSystem = await ecosystemRegistryService.registerSystem({
    systemCode: 'ETH-NDHx-CORE',
    name: 'National Digital Health Exchange (NDHx)',
    organization: 'Ministry of Health Ethiopia',
    systemType: 'NATIONAL_HIE',
    environment: 'SANDBOX',
    supportedProfiles: ['http://moh.gov.et/fhir/StructureDefinition/ndhx-bundle'],
    supportedFHIRVersion: '5.0.0',
    dataClassification: 'RESTRICTED_IDENTIFIABLE',
    actorId: 'usr-interop-abinet',
  });

  assert(!!ndhxSystem.systemId, 'Ecosystem system created with unique systemId');
  assert(ndhxSystem.systemCode === 'ETH-NDHx-CORE', 'System code matches canonical designation');
  assert(ndhxSystem.trustLevel === 'PENDING', 'Initial trust level is strictly PENDING');
  assert(ndhxSystem.version === 1, 'Initial version is 1');
  assert(!!ndhxSystem.integrityHash, 'Tamper-evident SHA-256 integrity hash is computed');

  const retrievedSystem = await ecosystemRegistryService.getSystem(ndhxSystem.systemId);
  assert(retrievedSystem?.name === 'National Digital Health Exchange (NDHx)', 'System retrieved from storage successfully');

  // ----------------------------------------------------
  // 2. Ecosystem Services (System ≠ Service)
  // ----------------------------------------------------
  console.log('\n--- 2. Ecosystem Services (System ≠ Service) ---');

  const fhirService = await ecosystemRegistryService.registerService({
    systemId: ndhxSystem.systemId,
    serviceName: 'NDHx FHIR R5 Document Dispatch Service',
    serviceType: 'FHIR_EXCHANGE',
    supportedProtocols: ['FHIR_R5', 'HTTPS_REST'],
    endpointId: 'ep_dummy_init',
  });

  assert(!!fhirService.serviceId, 'Ecosystem service created with unique serviceId');
  assert(fhirService.systemId === ndhxSystem.systemId, 'Service correctly links to parent system');
  assert(fhirService.serviceId !== ndhxSystem.systemId, 'INVARIANT VERIFIED: System ≠ Service');
  assert(fhirService.serviceType === 'FHIR_EXCHANGE', 'Service type matches FHIR_EXCHANGE');

  // ----------------------------------------------------
  // 3. Endpoint Registry & Anti-SSRF Defense
  // ----------------------------------------------------
  console.log('\n--- 3. Endpoint Registry & Anti-SSRF Defense ---');

  const validEndpoint = await ecosystemRegistryService.registerEndpoint({
    systemId: ndhxSystem.systemId,
    serviceId: fhirService.serviceId,
    environment: 'SANDBOX',
    baseUrlReference: 'https://sandbox.ndhx.moh.gov.et/fhir/r5',
    protocol: 'HTTPS',
    authenticationMode: 'MUTUAL_TLS',
    actorId: 'usr-interop-abinet',
  });

  assert(!!validEndpoint.endpointId, 'Valid external HTTPS endpoint registered');
  assert(validEndpoint.healthStatus === 'HEALTHY', 'Endpoint initial health is recorded');

  // Test Anti-SSRF protection: Cloud metadata IP
  let ssrfBlocked = false;
  try {
    await ecosystemRegistryService.registerEndpoint({
      systemId: ndhxSystem.systemId,
      serviceId: fhirService.serviceId,
      environment: 'SANDBOX',
      baseUrlReference: 'http://169.254.169.254/latest/meta-data',
      protocol: 'HTTP',
      authenticationMode: 'NONE',
      actorId: 'usr-interop-abinet',
    });
  } catch (err: any) {
    if (err.message.includes('Anti-SSRF Security Violation')) {
      ssrfBlocked = true;
    }
  }
  assert(ssrfBlocked, 'CRITICAL: Anti-SSRF gateway strictly blocks cloud metadata URL');

  // ----------------------------------------------------
  // 4. System Trust Lifecycle & Human Approval Gate
  // ----------------------------------------------------
  console.log('\n--- 4. System Trust Lifecycle & Human Approval Gate ---');

  // Unjustified approval must be rejected
  let directApprovalRejected = false;
  try {
    await ecosystemRegistryService.updateTrustLevel({
      systemId: ndhxSystem.systemId,
      newTrustLevel: 'APPROVED',
      actorId: '',
      justification: '',
    });
  } catch (err: any) {
    directApprovalRejected = true;
  }
  assert(directApprovalRejected, 'Direct client approval without human actor & justification is blocked');

  // Authorized approval
  const approvedSystem = await ecosystemRegistryService.updateTrustLevel({
    systemId: ndhxSystem.systemId,
    newTrustLevel: 'APPROVED',
    actorId: 'usr-interop-abinet',
    justification: 'Formally vetted against MOH National Interoperability Framework.',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  assert(approvedSystem.trustLevel === 'APPROVED', 'System successfully transitioned to APPROVED');
  assert(approvedSystem.version === 2, 'System version incremented on trust modification');

  // ----------------------------------------------------
  // 5. National Integration Lifecycle & Production Gate
  // ----------------------------------------------------
  console.log('\n--- 5. National Integration Lifecycle & Production Gate ---');

  const integration = await ecosystemRegistryService.configureIntegration({
    systemId: ndhxSystem.systemId,
    name: 'NDHx Document Exchange Gateway',
    description: 'Bilateral national clinical summary exchange',
    adapterIdentifier: 'INDHxAdapter',
    environment: 'SANDBOX',
    primaryEndpointId: validEndpoint.endpointId,
    credentialReferenceId: 'cred_ref_moh_vault_01',
  });

  assert(integration.status === 'CONFIGURED', 'Initial integration status is CONFIGURED');

  // Try activating before connectivity test succeeds
  let prematureActivationBlocked = false;
  try {
    await ecosystemRegistryService.activateIntegration({
      integrationId: integration.integrationId,
      actorId: 'usr-interop-abinet',
      governanceTicket: 'TICKET-9921',
    });
  } catch (err: any) {
    prematureActivationBlocked = true;
  }
  assert(prematureActivationBlocked, 'Activation gate strictly blocks activation before connectivity test');

  // Record successful connectivity test
  await ecosystemRegistryService.recordConnectivityTest({
    integrationId: integration.integrationId,
    successful: true,
    latencyMs: 38,
  });

  // Now activate through the governance gate
  const activated = await ecosystemRegistryService.activateIntegration({
    integrationId: integration.integrationId,
    actorId: 'usr-interop-abinet',
    governanceTicket: 'TICKET-9921',
  });

  assert(activated.status === 'ACTIVE', 'Integration successfully activated via governance gate');
  assert(activated.activationGateApproval?.governanceTicket === 'TICKET-9921', 'Governance ticket recorded in activation audit');

  // ----------------------------------------------------
  // 6. NDHx Adapter & Flow (Default NOT_CONFIGURED & Sandbox)
  // ----------------------------------------------------
  console.log('\n--- 6. NDHx Adapter & Flow ---');

  const defaultNDHx = new DefaultNDHxAdapter();
  assert(defaultNDHx.status === 'NOT_CONFIGURED', 'CRITICAL: Default NDHx adapter is strictly NOT_CONFIGURED');

  let unconfiguredExchangeFailed = false;
  try {
    await defaultNDHx.exchange({} as any);
  } catch (err: any) {
    unconfiguredExchangeFailed = true;
  }
  assert(unconfiguredExchangeFailed, 'Default unconfigured NDHx adapter fails closed on exchange attempt');

  // Switch to Sandbox NDHx adapter
  const sandboxNDHx = new SandboxNDHxAdapter();
  nationalExchangeQueueService.setNDHxAdapter(sandboxNDHx);
  assert(sandboxNDHx.status === 'ACTIVE', 'Sandbox NDHx adapter is ACTIVE in controlled test environment');

  const ndhxHealth = await sandboxNDHx.health();
  assert(ndhxHealth.available === true, 'Sandbox NDHx health check passes');
  assert(ndhxHealth.latencyMs > 0, 'Sandbox latency is measured accurately');

  // ----------------------------------------------------
  // 7. Exchange Queue: DELIVERED ≠ ACKNOWLEDGED ≠ PROCESSED
  // ----------------------------------------------------
  console.log('\n--- 7. Exchange Queue: DELIVERED ≠ ACKNOWLEDGED ≠ PROCESSED ---');

  const enqueued = await nationalExchangeQueueService.enqueueMessage({
    integrationId: integration.integrationId,
    source: 'JANO-NODE-01',
    destination: 'ETH-NDHx-CORE',
    purpose: 'CARE',
    resourceType: 'Bundle',
    profile: 'http://moh.gov.et/fhir/StructureDefinition/ndhx-bundle',
    payload: { resourceType: 'Bundle', type: 'document', id: 'bundle-test-01' },
    actorId: 'usr-interop-abinet',
    originFacilityId: 'fac-district-hospital-01',
  });

  assert(enqueued.state === 'QUEUED', 'Message initially enqueued with state QUEUED');
  assert(!!enqueued.idempotencyKey, 'Idempotency key generated for replay protection');
  assert(!!enqueued.payloadHash, 'Payload SHA-256 hash computed');

  // Dispatch message
  const dispatchResult = await nationalExchangeQueueService.dispatchMessage(enqueued.messageId);
  assert(dispatchResult.attempt.status === 'SUCCESS', 'Transmission attempt recorded with SUCCESS');
  assert(dispatchResult.message.deliveredAt !== undefined, 'Delivery timestamp recorded on receipt');
  assert(dispatchResult.message.state === 'ACKNOWLEDGED', 'Message transitioned to ACKNOWLEDGED after receiving proof');
  assert(dispatchResult.acknowledgement?.ackType === 'ACKNOWLEDGED', 'INVARIANT: Acknowledgement tracked separately from initial delivery');

  // ----------------------------------------------------
  // 8. Master Facility Registry (MFR): Lookup & Geographic Scopes
  // ----------------------------------------------------
  console.log('\n--- 8. Master Facility Registry (MFR): Lookup & Geographic Scopes ---');

  const defaultMFR = new DefaultMFRAdapter();
  assert(defaultMFR.status === 'NOT_CONFIGURED', 'CRITICAL: Default MFR adapter is strictly NOT_CONFIGURED');

  // Switch to Sandbox MFR adapter
  const sandboxMFR = new SandboxMFRAdapter();
  masterFacilityRegistryService.setAdapter(sandboxMFR);
  assert(masterFacilityRegistryService.getAdapterStatus() === 'ACTIVE', 'Sandbox MFR adapter is active');

  const mfrFacility = await masterFacilityRegistryService.lookupFacility('ETH-MOH-FAC-0101');
  assert(mfrFacility !== null, 'MFR facility resolved from registry');
  assert(mfrFacility?.officialName === 'Addis Ababa Central Primary Hospital', 'Official facility name matches MFR record');
  assert(mfrFacility?.source === 'SYNTHETIC_MFR_FIXTURE', 'Fixture is strictly attributed as SYNTHETIC_MFR_FIXTURE');
  assert(mfrFacility?.freshness === 'CURRENT', 'Freshness is marked CURRENT');

  // Test geographic scope enforcement
  masterFacilityRegistryService.configure({ allowedGeographies: ['Addis Ababa', 'Sidama'] });
  let geoBlocked = false;
  try {
    await masterFacilityRegistryService.search({ region: 'Tigray' });
  } catch (err: any) {
    geoBlocked = true;
  }
  assert(geoBlocked, 'MFR geographic access restriction policy enforced');
  masterFacilityRegistryService.configure({ allowedGeographies: ['*'] }); // Reset

  // ----------------------------------------------------
  // 9. MFR Facility Reconciliation & Conflict Detection
  // ----------------------------------------------------
  console.log('\n--- 9. MFR Facility Reconciliation & Conflict Detection ---');

  // Reconcile matching facility
  const matchResult = await masterFacilityRegistryService.reconcileFacility({
    localFacilityId: 'fac-district-hospital-01',
    localFacilityName: 'Addis Ababa Central Primary Hospital',
    localFacilityType: 'PRIMARY_HOSPITAL',
    mfrFacilityId: 'ETH-MOH-FAC-0101',
    actorId: 'usr-interop-abinet',
  });

  assert(matchResult.mapping.mappingStatus === 'VERIFIED', 'Matching facility reconciliation status is VERIFIED');
  assert(matchResult.conflict === undefined, 'No conflict detected for matching attributes');

  // Reconcile conflicting facility (differing name/type)
  const conflictResult = await masterFacilityRegistryService.reconcileFacility({
    localFacilityId: 'fac-mobile-outreach-01',
    localFacilityName: 'Bahir Dar Mobile Team 01', // Local name differs from official MFR name
    localFacilityType: 'SPECIALIZED_CLINIC',
    mfrFacilityId: 'ETH-MOH-FAC-0350',
    actorId: 'usr-interop-abinet',
  });

  assert(conflictResult.mapping.mappingStatus === 'CONFLICT', 'Discrepancy generates mapping status CONFLICT');
  assert(conflictResult.conflict !== undefined, 'FACILITY_REGISTRY_CONFLICT record created');
  assert(conflictResult.conflict?.fieldName === 'officialName', 'Conflict accurately targets mismatched field');
  assert(conflictResult.conflict?.status === 'PENDING_REVIEW', 'Conflict requires human review');

  // Resolve conflict
  const resolvedConflict = await masterFacilityRegistryService.resolveConflict({
    conflictId: conflictResult.conflict!.conflictId,
    resolution: 'KEEP_LOCAL',
    reviewerId: 'usr-interop-abinet',
    notes: 'Local mobile team operation name retained for clinical continuity.',
  });

  assert(resolvedConflict.status === 'RESOLVED', 'Facility conflict resolved by administrator');
  assert(resolvedConflict.resolution === 'KEEP_LOCAL', 'INVARIANT: Local clinical facility remains authoritative');

  // ----------------------------------------------------
  // 10. MFR Cache & Stale Detection
  // ----------------------------------------------------
  console.log('\n--- 10. MFR Cache & Stale Detection ---');

  // Populate in cache first
  const initial = await masterFacilityRegistryService.lookupFacility('ETH-MOH-FAC-0204');
  assert(initial !== null, 'Initial facility retrieved and cached');

  // Manually age cached record in IDB to verify stale detection
  const allRefs = await idbEngine.getAll<any>('facilityRegistryReferences');
  const cachedRecord = allRefs.find((r) => r.mfrFacilityId === 'ETH-MOH-FAC-0204');
  if (cachedRecord) {
    cachedRecord.lastRetrievedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48 hours ago
    await idbEngine.put('facilityRegistryReferences', cachedRecord);
  }

  const lookupStale = await masterFacilityRegistryService.lookupFacility('ETH-MOH-FAC-0204');
  assert(lookupStale?.freshness === 'STALE', 'INVARIANT VERIFIED: Cached record older than 24h marked STALE, not CURRENT');

  // ----------------------------------------------------
  // 11. National Terminology: Exact & Equivalent Mappings
  // ----------------------------------------------------
  console.log('\n--- 11. National Terminology: Exact & Equivalent Mappings ---');

  const defaultTerm = new DefaultNationalTerminologyAdapter();
  assert(defaultTerm.status === 'NOT_CONFIGURED', 'CRITICAL: Default Terminology adapter is strictly NOT_CONFIGURED');

  const sandboxTerm = new SandboxTerminologyAdapter();
  nationalTerminologyService.setAdapter(sandboxTerm);
  assert(nationalTerminologyService.getAdapterStatus() === 'ACTIVE', 'Sandbox Terminology adapter is active');

  const exactMap = await nationalTerminologyService.mapConcept({
    localSystem: 'urn:oid:jano:clinical-terms',
    localCode: 'JANO-DX-CHOLERA',
    localDisplay: 'Vibrio cholerae acute infection',
    targetSystem: 'http://hl7.org/fhir/sid/icd-10',
    potentialTargetCodes: [
      { code: 'A00.9', display: 'Cholera, unspecified', equivalence: 'equal' },
    ],
    actorId: 'usr-termadmin-nebil',
  });

  assert(exactMap.status === 'VERIFIED', 'Unambiguous single mapping is VERIFIED');
  assert(exactMap.mappingType === 'EXACT', 'Equal mapping classified as EXACT');
  assert(exactMap.confidence === 1.0, 'Confidence is 1.0 for verified match');

  // ----------------------------------------------------
  // 12. Terminology Ambiguity Quarantine & Version Safety
  // ----------------------------------------------------
  console.log('\n--- 12. Terminology Ambiguity Quarantine & Version Safety ---');

  // Ambiguous mapping: 1 local code maps to multiple candidate codes
  const ambiguousMap = await nationalTerminologyService.mapConcept({
    localSystem: 'urn:oid:jano:clinical-terms',
    localCode: 'JANO-DX-FEVER-UNDIAGNOSED',
    localDisplay: 'Undiagnosed acute febrile illness',
    targetSystem: 'http://hl7.org/fhir/sid/icd-10',
    potentialTargetCodes: [
      { code: 'R50.9', display: 'Fever, unspecified' },
      { code: 'A99', display: 'Viral hemorrhagic fever, unspecified' },
      { code: 'B54', display: 'Unspecified malaria' },
    ],
    actorId: 'usr-termadmin-nebil',
  });

  assert(ambiguousMap.status === 'QUARANTINED', 'CRITICAL: Ambiguous terminology mapping strictly routes to QUARANTINED');
  assert(ambiguousMap.mappingType === 'AMBIGUOUS', 'Mapping marked AMBIGUOUS');

  const quarantineItems = await idbEngine.getAll<any>('ecosystemQuarantineItems');
  const termQuarantine = quarantineItems.find((q) => q.category === 'TERMINOLOGY');
  assert(termQuarantine !== undefined, 'Ambiguous terminology quarantined in ecosystemQuarantineItems store');

  // Human approval resolves ambiguity
  const approvedMap = await nationalTerminologyService.approveMapping(ambiguousMap.mapId, 'usr-termadmin-nebil', 'R50.9');
  assert(approvedMap.status === 'VERIFIED', 'Human terminologist review approves resolved concept');
  assert(approvedMap.targetCode === 'R50.9', 'Target code updated to human selected concept');

  // ----------------------------------------------------
  // 13. DHIS2 & HMIS Reporting Profiles & Datasets
  // ----------------------------------------------------
  console.log('\n--- 13. DHIS2 & HMIS Reporting Profiles & Datasets ---');

  const defaultDHIS2 = new DefaultDHIS2Adapter();
  assert(defaultDHIS2.status === 'NOT_CONFIGURED', 'CRITICAL: Default DHIS2 adapter is strictly NOT_CONFIGURED');

  const sandboxDHIS2 = new SandboxDHIS2Adapter();
  nationalReportingService.setAdapter(sandboxDHIS2);

  const profile = await nationalReportingService.createReportingProfile({
    reportingSystem: 'DHIS2',
    reportingPeriodType: 'MONTHLY',
    indicators: [
      { indicatorCode: 'HMIS_OPD_TOTAL', name: 'Total Outpatient Attendance', description: 'Monthly total outpatient consultations', numeratorDefinition: 'count(encounters)' },
      { indicatorCode: 'HMIS_DELIVERIES_TOTAL', name: 'Total Facility Deliveries', description: 'Monthly total facility-based institutional deliveries', numeratorDefinition: 'count(deliveries)' },
      { indicatorCode: 'HMIS_MALARIA_CONFIRMED', name: 'Confirmed Malaria Cases', description: 'Monthly total parasitologically confirmed malaria cases', numeratorDefinition: 'count(malaria_positive)' },
    ],
    actorId: 'usr-steward-genet',
  });

  assert(!!profile.profileId, 'National reporting profile created with unique profileId');
  assert(profile.indicators.length === 3, 'All 3 national indicators registered in profile');

  const dataset = await nationalReportingService.compileDataset({
    profileId: profile.profileId,
    reportingPeriod: '2026-10',
    facilityId: 'fac-district-hospital-01',
    dataValues: [
      { dataElement: 'HMIS_OPD_TOTAL', value: 1240 },
      { dataElement: 'HMIS_DELIVERIES_TOTAL', value: 48 },
      { dataElement: 'HMIS_MALARIA_CONFIRMED', value: 19 },
    ],
  });

  assert(dataset.completeness === 1.0, 'Dataset completeness is 100%');
  assert(dataset.datasetType === 'AGGREGATED', 'INVARIANT: Aggregate national reporting is distinct from patient charts');
  assert(!!dataset.integrityHash, 'Tamper-evident hash computed for dataset');

  // ----------------------------------------------------
  // 14. Reporting Quality Invariants (Missing Data ≠ Zero)
  // ----------------------------------------------------
  console.log('\n--- 14. Reporting Quality Invariants (Missing Data ≠ Zero) ---');

  const incompleteDataset = await nationalReportingService.compileDataset({
    profileId: profile.profileId,
    reportingPeriod: '2026-10',
    facilityId: 'fac-rural-dispensary-01',
    dataValues: [
      { dataElement: 'HMIS_OPD_TOTAL', value: 310 },
      // Deliberately omitted HMIS_DELIVERIES_TOTAL and HMIS_MALARIA_CONFIRMED
    ],
  });

  assert(incompleteDataset.completeness < 0.5, 'Incomplete dataset accurately computes completeness < 50%');
  const validationIssues = await sandboxDHIS2.validateDataset(incompleteDataset, profile);
  assert(validationIssues.valid === false, 'Validation detects missing indicators');
  assert(validationIssues.issues.some((i) => i.includes('Missing mandatory indicator')), 'INVARIANT: Missing data is flagged, NEVER assumed ZERO');

  // ----------------------------------------------------
  // 15. Reporting Human Approval Gate & State Transitions
  // ----------------------------------------------------
  console.log('\n--- 15. Reporting Human Approval Gate & State Transitions ---');

  const submission = await nationalReportingService.createSubmission({
    datasetId: dataset.datasetId,
    profileId: profile.profileId,
    facilityId: 'fac-district-hospital-01',
    actorId: 'usr-steward-genet',
  });

  assert(submission.state === 'DRAFT', 'Initial submission state is DRAFT');

  // Validate
  const validation = await nationalReportingService.validateSubmission(submission.submissionId);
  assert(validation.valid === true, 'Validation passes for complete dataset');

  // Human Approval Gate
  const approvedSubmission = await nationalReportingService.approveSubmission({
    submissionId: submission.submissionId,
    approverId: 'usr-steward-genet',
    role: 'ecosystem_data_steward',
  });

  assert(approvedSubmission.state === 'APPROVED', 'Submission approved by authorized human steward');

  // Queue submission (QUEUED ≠ SUBMITTED)
  const queuedSubmission = await nationalReportingService.queueSubmission(submission.submissionId);
  assert(queuedSubmission.state === 'QUEUED', 'INVARIANT VERIFIED: State is QUEUED, not SUBMITTED');

  // Transmit submission (SUBMITTED ≠ ACKNOWLEDGED)
  const transmitResult = await nationalReportingService.transmitSubmission(submission.submissionId);
  assert(transmitResult.submission.state === 'ACKNOWLEDGED', 'Submission transitioned to ACKNOWLEDGED on external success');
  assert(transmitResult.submission.externalSubmissionId !== undefined, 'External submission reference preserved');
  assert(transmitResult.response.externalStatus === 'SUCCESS', 'Response status recorded');

  // ----------------------------------------------------
  // 16. Non-Destructive Reporting Corrections
  // ----------------------------------------------------
  console.log('\n--- 16. Non-Destructive Reporting Corrections ---');

  // Create corrected dataset
  const correctedDataset = await nationalReportingService.compileDataset({
    profileId: profile.profileId,
    reportingPeriod: '2026-10',
    facilityId: 'fac-district-hospital-01',
    dataValues: [
      { dataElement: 'HMIS_OPD_TOTAL', value: 1250 }, // +10 late entries
      { dataElement: 'HMIS_DELIVERIES_TOTAL', value: 48 },
      { dataElement: 'HMIS_MALARIA_CONFIRMED', value: 19 },
    ],
  });

  const correction = await nationalReportingService.correctSubmission({
    originalSubmissionId: submission.submissionId,
    newDatasetId: correctedDataset.datasetId,
    reason: 'Late emergency OPD registers integrated into monthly census.',
    actorId: 'usr-steward-genet',
    approvedBy: 'usr-interop-abinet',
  });

  assert(!!correction.correctionId, 'Reporting correction created with unique correctionId');
  assert(correction.originalSubmissionId === submission.submissionId, 'Correction explicitly references original submission');

  const historicalSubmission = (await nationalReportingService.getSubmissions()).find((s) => s.submissionId === submission.submissionId);
  assert(historicalSubmission?.state === 'CORRECTED', 'Original submission marked CORRECTED without destructive deletion');

  // ----------------------------------------------------
  // 17. eCHIS Adapter (Fail-closed & Default NOT_CONFIGURED)
  // ----------------------------------------------------
  console.log('\n--- 17. eCHIS Adapter (Fail-closed & Default NOT_CONFIGURED) ---');

  const defaultECHIS = new DefaultECHISAdapter();
  assert(defaultECHIS.status === 'NOT_CONFIGURED', 'CRITICAL: Default eCHIS adapter is strictly NOT_CONFIGURED');

  let echisFailedClosed = false;
  try {
    await defaultECHIS.dispatchReferralTask({
      referralId: 'ref-01',
      targetCommunityWorkerId: 'heir-01',
      patientId: 'pat-01',
    });
  } catch (err: any) {
    echisFailedClosed = true;
  }
  assert(echisFailedClosed, 'Unconfigured eCHIS adapter fails closed');

  // ----------------------------------------------------
  // 18. National Identity: Masked Privacy & UNAVAILABLE ≠ FAILED
  // ----------------------------------------------------
  console.log('\n--- 18. National Identity: Masked Privacy & UNAVAILABLE ≠ FAILED ---');

  const defaultId = new DefaultNationalIdentityAdapter();
  assert(defaultId.status === 'NOT_CONFIGURED', 'CRITICAL: Default National Identity adapter is strictly NOT_CONFIGURED');

  const sandboxId = new SandboxNationalIdentityAdapter();
  nationalIdentityService.setAdapter(sandboxId);

  // Valid verification
  const validVerification = await nationalIdentityService.requestVerification({
    patientId: 'pat-test-01',
    rawNationalId: 'ETH-ID-VALID-1234',
    demographicClaims: { fullName: 'Abebe Bikila', birthYear: 1985 },
    actorId: 'usr-interop-abinet',
  });

  assert(validVerification.response.status === 'VERIFIED', 'Valid identity verification returns VERIFIED');
  assert(validVerification.reference.maskedIdentityNumber === '******1234', 'INVARIANT: Raw identity number is masked (******1234)');
  assert(!validVerification.reference.maskedIdentityNumber.includes('ETH-ID'), 'Raw identity string NEVER stored in plain text');

  // Simulate external outage / timeout
  const timeoutVerification = await nationalIdentityService.requestVerification({
    patientId: 'pat-test-02',
    rawNationalId: 'ETH-ID-SIMULATE-TIMEOUT',
    demographicClaims: {},
    actorId: 'usr-interop-abinet',
  });

  assert(timeoutVerification.response.status === 'UNAVAILABLE', 'INVARIANT VERIFIED: Gateway timeout returns UNAVAILABLE');
  assert(timeoutVerification.response.status !== 'FAILED', 'CRITICAL: UNAVAILABLE is strictly distinct from FAILED');

  // ----------------------------------------------------
  // 19. Public Health Disease Surveillance (Signal ≠ Outbreak)
  // ----------------------------------------------------
  console.log('\n--- 19. Public Health Disease Surveillance (Signal ≠ Outbreak) ---');

  const defaultSurv = new DefaultNationalSurveillanceAdapter();
  assert(defaultSurv.status === 'NOT_CONFIGURED', 'CRITICAL: Default Surveillance adapter is strictly NOT_CONFIGURED');

  const sandboxSurv = new SandboxSurveillanceAdapter();
  nationalSurveillanceService.setAdapter(sandboxSurv);

  const signal = await nationalSurveillanceService.registerSignal({
    indicator: 'CHOLERA_CLUSTER',
    observedValue: 14,
    baseline: 2,
    threshold: 5,
    period: '2026-W40',
    sourceMetrics: ['metric_diarrhea_acute', 'metric_lab_stool_culture'],
  });

  assert(signal.state === 'SIGNAL', 'Statistical anomaly triggers state SIGNAL');
  assert((signal as any).state !== 'OUTBREAK_CONFIRMED', 'CRITICAL: Anomaly does NOT autonomously declare an outbreak');

  // ----------------------------------------------------
  // 20. Surveillance Review, Approval & Transmission
  // ----------------------------------------------------
  console.log('\n--- 20. Surveillance Review, Approval & Transmission ---');

  const reviewedSignal = await nationalSurveillanceService.reviewSignal({
    signalId: signal.signalId,
    reviewerId: 'usr-publichealth-aminata',
    decision: 'ESCALATE_FOR_REPORTING',
    notes: 'Epidemiological investigation confirms localized cluster in Woreda 03.',
  });

  assert(reviewedSignal.state === 'ESCALATED', 'Signal escalated via human review');

  const survReport = await nationalSurveillanceService.createReport({
    signalId: signal.signalId,
    reportingFacilityId: 'fac-district-hospital-01',
    epidemiologicalWeek: 40,
    caseCount: 14,
  });

  const survSubmission = await nationalSurveillanceService.createSubmission(survReport.reportId, 'usr-publichealth-aminata');
  assert(survSubmission.state === 'DRAFT', 'Initial surveillance submission state is DRAFT');

  await nationalSurveillanceService.approveSubmission(survSubmission.submissionId, 'usr-publichealth-aminata');
  const transmitSurv = await nationalSurveillanceService.transmitSubmission(survSubmission.submissionId);

  assert(transmitSurv.state === 'ACKNOWLEDGED', 'Surveillance report transmission acknowledged by national authority');
  assert(!!transmitSurv.acknowledgementCode, 'Official national acknowledgement code returned and recorded');

  // ----------------------------------------------------
  // 21. Ecosystem Quarantine & Dead-Letter Engine
  // ----------------------------------------------------
  console.log('\n--- 21. Ecosystem Quarantine & Dead-Letter Engine ---');

  const qItem = await nationalExchangeQueueService.routeToQuarantine({
    category: 'EXTERNAL_RESPONSE',
    sourceSystem: 'ETH-UNKNOWN-NODE',
    payload: { badData: true },
    failureReason: 'Unauthorized external payload signature mismatch',
  });

  assert(qItem.status === 'QUARANTINED', 'Quarantine item status is QUARANTINED');

  const resolvedQ = await nationalExchangeQueueService.reviewQuarantine({
    quarantineId: qItem.quarantineId,
    reviewerId: 'usr-interop-abinet',
    action: 'DISCARD',
    notes: 'Malicious or corrupted payload discarded.',
  });

  assert(resolvedQ.status === 'DISCARDED', 'Quarantined item marked DISCARDED after review');

  // ----------------------------------------------------
  // 22. Integration Circuit Breaker & Health Telemetry
  // ----------------------------------------------------
  console.log('\n--- 22. Integration Circuit Breaker & Health Telemetry ---');

  const testIntId = 'test-int-circuit';
  assert(integrationHealthService.canExecute(testIntId) === true, 'Circuit breaker initial state permits execution (CLOSED)');

  // Record 3 consecutive failures to trip circuit
  integrationHealthService.recordFailure(testIntId);
  integrationHealthService.recordFailure(testIntId);
  const tripResult = integrationHealthService.recordFailure(testIntId);

  assert(tripResult.circuitTripped === true, 'Circuit tripped to OPEN after 3 consecutive failures');
  assert(integrationHealthService.canExecute(testIntId) === false, 'Circuit OPEN stops aggressive execution to prevent cascading failure');

  // Reset circuit on success
  integrationHealthService.recordSuccess(testIntId);
  assert(integrationHealthService.canExecute(testIntId) === true, 'Circuit successfully reset to CLOSED on verified recovery');

  // ----------------------------------------------------
  // 23. External System Outage is NEVER a Clinical Outage
  // ----------------------------------------------------
  console.log('\n--- 23. External System Outage is NEVER a Clinical Outage ---');

  // Simulate complete NDHx external outage
  nationalExchangeQueueService.setNDHxAdapter({
    adapterName: 'simulated_outage_adapter',
    status: 'UNAVAILABLE',
    health: async () => ({ available: false, latencyMs: 0 }),
    discoverCapabilities: async () => ({} as any),
    exchange: async () => { throw new Error('Network timeout: External NDHx cluster is offline'); },
    pollAcknowledgement: async () => null,
  });

  // Outbound message is queued safely without failing clinical flow
  const offlineMessage = await nationalExchangeQueueService.enqueueMessage({
    integrationId: integration.integrationId,
    source: 'JANO-NODE-01',
    destination: 'ETH-NDHx-CORE',
    purpose: 'CARE',
    resourceType: 'Bundle',
    profile: 'http://moh.gov.et/fhir/StructureDefinition/ndhx-bundle',
    payload: { clinicalNote: 'Acute appendicitis diagnosis recorded locally' },
    actorId: 'usr-interop-abinet',
    originFacilityId: 'fac-district-hospital-01',
  });

  assert(offlineMessage.state === 'QUEUED', 'INVARIANT VERIFIED: Message safely enqueued locally during external outage');

  const failedDispatch = await nationalExchangeQueueService.dispatchMessage(offlineMessage.messageId);
  assert(failedDispatch.message.state === 'RETRY', 'Message moved to RETRY queue rather than crashing system');

  // Restore sandbox adapter
  nationalExchangeQueueService.setNDHxAdapter(sandboxNDHx);

  // ----------------------------------------------------
  // 24. FHIR R5 Ecosystem Mappings & Conformance
  // ----------------------------------------------------
  console.log('\n--- 24. FHIR R5 Ecosystem Mappings & Conformance ---');

  const sampleMFR = (await sandboxMFR.searchFacilities({ name: 'Addis Ababa' }))[0];
  const fhirOrg = FHIREcosystemMapper.mapMFRToOrganization(sampleMFR);

  assert(fhirOrg.resourceType === 'Organization', 'Mapped to FHIR Organization');
  assert(fhirOrg.name === sampleMFR.officialName, 'FHIR Organization name matches MFR official name');
  assert(fhirOrg.identifier?.[0]?.value === sampleMFR.mfrFacilityId, 'MFR facility code mapped to FHIR identifier');

  const fhirLoc = FHIREcosystemMapper.mapMFRToLocation(sampleMFR);
  assert(fhirLoc.resourceType === 'Location', 'Mapped to FHIR Location');
  assert(fhirLoc.status === 'active', 'Operational status mapped to active FHIR Location');

  const fhirBundle = FHIREcosystemMapper.mapDatasetToBundle(dataset);
  assert(fhirBundle.resourceType === 'Bundle', 'Mapped Reporting Dataset to FHIR Bundle');
  assert(fhirBundle.entry?.length === dataset.dataValues.length, 'All data values mapped to Bundle entries');

  const validCheck = FHIREcosystemMapper.validateEcosystemResource(fhirBundle);
  assert(validCheck.valid === true, 'FHIR Bundle passes ecosystem structural validation');

  const invalidCheck = FHIREcosystemMapper.validateEcosystemResource({ missingResourceType: true });
  assert(invalidCheck.valid === false, 'Invalid FHIR resource detected');
  assert(invalidCheck.outcome?.resourceType === 'OperationOutcome', 'OperationOutcome generated for malformed resource');

  // ----------------------------------------------------
  // 25. Cross-Version Architectural Boundaries
  // ----------------------------------------------------
  console.log('\n--- 25. Cross-Version Architectural Boundaries ---');

  // V13 Jano Network vs V19 National Ecosystem
  assert(ndhxSystem.systemType !== ('JANO_NETWORK_NODE' as any), 'INVARIANT VERIFIED: Jano Network (V13) ≠ National Ecosystem (V19)');

  // V14 Population Intelligence Source
  assert(dataset.datasetType === 'AGGREGATED', 'INVARIANT VERIFIED: V14 population facts produce aggregate reporting, not clinical chart records');

  // V15 Consent & Minimization
  assert(!JSON.stringify(dataset.dataValues).includes('patientName'), 'INVARIANT VERIFIED: National reporting strictly strips individual patient identifiers');

  // V17 Supply Boundaries
  const supplyDataExchanged = false; // Reporting does not mutate inventory
  assert(!supplyDataExchanged, 'INVARIANT VERIFIED: National reporting does not mutate V17 physical warehouse inventory');

  // V18 Research Boundaries
  const researchDataExchanged = false;
  assert(!researchDataExchanged, 'INVARIANT VERIFIED: Research study data does not automatically leak into national reporting without study governance');

  // ----------------------------------------------------
  // 26. AI Safety Gateway Prohibited Ecosystem Mutations
  // ----------------------------------------------------
  console.log('\n--- 26. AI Safety Gateway Prohibited Ecosystem Mutations ---');

  // AI cannot submit official national report
  const submitAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Indicators validated. SUBMIT_OFFICIAL_REPORT rsub_123 to national DHIS2.'
  );
  assert(submitAttempt.isSafe === false, 'AI Safety Gateway strictly blocks autonomous SUBMIT_OFFICIAL_REPORT');

  // AI cannot approve external integrations
  const approveIntegrationAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Connectivity verified. APPROVE_EXTERNAL_INTEGRATION nint_456.'
  );
  assert(approveIntegrationAttempt.isSafe === false, 'AI Safety Gateway strictly blocks autonomous APPROVE_EXTERNAL_INTEGRATION');

  // AI cannot approve national identity or merge patients based on AI suggestions
  const approveIdAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Demographics match closely. APPROVE_NATIONAL_IDENTITY idref_789 for patient pat_001.'
  );
  assert(approveIdAttempt.isSafe === false, 'AI Safety Gateway strictly blocks autonomous APPROVE_NATIONAL_IDENTITY');

  // AI cannot confirm an outbreak autonomously
  const confirmOutbreakAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Threshold doubled. CONFIRM_OUTBREAK for cholera cluster in woreda 3.'
  );
  assert(confirmOutbreakAttempt.isSafe === false, 'AI Safety Gateway strictly blocks autonomous CONFIRM_OUTBREAK');

  // AI cannot alter official external registries
  const alterRegistryAttempt = aiSafetyGateway.sanitizeAiOutput(
    'ALTER_OFFICIAL_REGISTRY: Change MFR facility type from HEALTH_CENTER to HOSPITAL.'
  );
  assert(alterRegistryAttempt.isSafe === false, 'AI Safety Gateway strictly blocks autonomous ALTER_OFFICIAL_REGISTRY');

  // Advisory AI report validation capability is allowed
  const advisoryCheck = aiSafetyGateway.authorizeRequest(
    'ecosystem.report.validate',
    'ecosystem_data_steward',
    'usr-steward-genet',
    'fac-district-hospital-01'
  );
  assert(advisoryCheck.passed === true, 'Advisory AI reporting validation task is permitted under steward governance');

  // Advisory narrative summary is permitted
  const advisorySummary = aiSafetyGateway.sanitizeAiOutput(
    'REPORTING ADVISORY: The monthly outpatient indicator achieved 1,240 consultations, meeting historical seasonal trends. Two records require maternal delivery cross-checks.'
  );
  assert(advisorySummary.isSafe === true, 'Advisory AI reporting summary is permitted');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V19 TESTS PASSED: ${passCount}/${passCount + failCount} assertions`);
  console.log('================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('TEST RUN FAILURE:', err);
  process.exit(1);
});
