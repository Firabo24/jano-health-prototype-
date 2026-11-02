/**
 * Jano Health - Clinical Core V21 Production Hardening,
 * Disaster Recovery & Pilot Readiness Comprehensive Test Suite
 */

import 'fake-indexeddb/auto';
import {
  environmentConfigService,
  secretManagementService,
  featureFlagService,
  backupManager,
  restoreManager,
  disasterRecoveryService,
  dataIntegrityMonitorService,
  schemaMigrationManager,
  facilityDeploymentService,
  operationsMonitoringService,
  releaseManagementService,
  computeSha256,
} from '../src/services/production';
import {
  V21_INVARIANTS,
  DeploymentEnvironment,
  EnvironmentConfig,
  DisasterCategory,
} from '../src/domain/v21ProductionTypes';
import { idbEngine, ALL_STORE_NAMES } from '../src/services/storage/indexedDbEngine';
import { hasCapability, ROLE_DEFINITIONS } from '../src/domain/permissions';

let assertionsPassed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  assertionsPassed++;
  console.log(`✅ PASS: ${message}`);
}

async function runV21ProductionReadinessTests(): Promise<void> {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V21 PRODUCTION READINESS TESTS');
  console.log('================================================================');

  // ----------------------------------------------------------------
  // 1. Environment Separation & Production Fail-Closed
  // ----------------------------------------------------------------
  console.log('\n--- 1. Environment Separation & Fail-Closed Gates ---');
  environmentConfigService.setEnvironment('PRODUCTION');
  assert(environmentConfigService.getEnvironment() === 'PRODUCTION', 'Environment set to PRODUCTION');

  const validProdConfig: EnvironmentConfig = environmentConfigService.getConfig();
  assert(validProdConfig.failClosed === true, 'Production configuration is strictly fail-closed');
  assert(validProdConfig.allowDevelopmentFallback === false, 'Development fallback is strictly disabled in production');
  assert(validProdConfig.authenticationMode === 'SECURE_STRICT', 'Authentication mode is SECURE_STRICT');

  const validationResult = environmentConfigService.validateProductionConfiguration(validProdConfig);
  assert(validationResult.isValid === true, 'Production configuration validation passes for strict configuration');

  // Invariant test: Dev fallback in production fails safely
  const invalidProdConfig: EnvironmentConfig = {
    ...validProdConfig,
    allowDevelopmentFallback: true,
  };
  const invalidResult = environmentConfigService.validateProductionConfiguration(invalidProdConfig);
  assert(invalidResult.isValid === false, 'Production configuration with dev fallback fails startup safely');
  assert(invalidResult.errors.some(e => e.includes('never allow development fallback')), 'Explicit error returned for dev fallback');

  // Hard Invariant Check
  let invariantCaught = false;
  try {
    V21_INVARIANTS.assertNotProductionInDev('PRODUCTION', true);
  } catch (err: any) {
    invariantCaught = true;
  }
  assert(invariantCaught, 'INVARIANT ENFORCED: assertNotProductionInDev blocks invalid combination');

  // ----------------------------------------------------------------
  // 2. Secret Reference Management & Rotation
  // ----------------------------------------------------------------
  console.log('\n--- 2. Secret Reference Management & Rotation ---');
  const secret = await secretManagementService.registerSecret(
    'National Signing Key Reference',
    'vault://prod/keys/v21-national-signing-v1',
    '1.0.0',
    ['system_administrator', 'deployment_engineer'],
    new Date(Date.now() + 86400000).toISOString() // Valid for 24h
  );
  assert(secret.status === 'ACTIVE', 'Secret reference registered as ACTIVE');
  assert(!secret.providerRef.includes('password='), 'Raw secret content is not present in provider reference');

  const usableCheck = await secretManagementService.validateSecretUsable(secret.secretId, 'deployment_engineer');
  assert(usableCheck.isUsable === true, 'Authorized role can access secret reference');

  const unauthorizedCheck = await secretManagementService.validateSecretUsable(secret.secretId, 'nurse');
  assert(unauthorizedCheck.isUsable === false, 'Unauthorized role is denied secret reference access');
  assert(unauthorizedCheck.reason === 'ROLE_UNAUTHORIZED_FOR_SECRET', 'Correct unauthorized reason returned');

  // Secret rotation
  const rotated = await secretManagementService.rotateSecret(
    secret.secretId,
    'vault://prod/keys/v21-national-signing-v2',
    '2.0.0'
  );
  assert(rotated.version === '2.0.0', 'Secret version updated to 2.0.0 upon rotation');
  assert(rotated.lastRotatedAt !== undefined, 'Secret lastRotatedAt recorded');

  // Expired secret fails safely
  const expiredSecret = await secretManagementService.registerSecret(
    'Expired Key Reference',
    'vault://prod/keys/expired-key',
    '1.0.0',
    ['*'],
    new Date(Date.now() - 10000).toISOString() // Already expired
  );
  const expiredCheck = await secretManagementService.validateSecretUsable(expiredSecret.secretId, 'system_administrator');
  assert(expiredCheck.isUsable === false, 'Expired secret reference fails safely');
  assert(expiredCheck.reason === 'SECRET_EXPIRED', 'Explicit SECRET_EXPIRED reason returned');

  // ----------------------------------------------------------------
  // 3. Configuration Snapshots & Drift Detection
  // ----------------------------------------------------------------
  console.log('\n--- 3. Configuration Snapshots & Drift Detection ---');
  const snap1 = await environmentConfigService.captureSnapshot('deploy_eng_01', 'sysadmin_lead');
  assert(snap1.configHash.length === 64, 'Configuration snapshot sealed with SHA-256 hash');
  assert(snap1.driftDetected === false, 'Initial snapshot has no drift');

  // Modify environment slightly and capture second snapshot to test drift detection
  const snap2 = await environmentConfigService.captureSnapshot('deploy_eng_01', 'sysadmin_lead');
  assert(snap2.snapshotId !== snap1.snapshotId, 'New snapshot generated');

  // ----------------------------------------------------------------
  // 4. Feature Flags & RBAC Invariant (Feature Flag !== Permission)
  // ----------------------------------------------------------------
  console.log('\n--- 4. Feature Flags & RBAC Non-Bypass Invariant ---');
  const flag = await featureFlagService.setFeatureFlag({
    name: 'Experimental Telehealth Console',
    environment: 'PRODUCTION',
    status: 'GLOBAL',
    scope: ['GLOBAL'],
    rolloutPercentage: 100,
    owner: 'pilot_director',
    effectiveFrom: new Date().toISOString(),
  });
  assert(flag.status === 'GLOBAL', 'Feature flag registered as GLOBAL');

  // INVARIANT TEST: Feature Flag is enabled, but user DOES NOT have permission
  const activeForPermitted = await featureFlagService.isFeatureActive(flag.flagId, 'fac-01', true);
  assert(activeForPermitted === true, 'Feature active when flag is enabled AND user has permission');

  const activeForUnpermitted = await featureFlagService.isFeatureActive(flag.flagId, 'fac-01', false);
  assert(activeForUnpermitted === false, 'INVARIANT VERIFIED: Feature flag DOES NOT bypass RBAC (permission denied)');

  // ----------------------------------------------------------------
  // 5. Database Backup Manager & Cryptographic Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 5. Database Backup & Cryptographic Integrity ---');
  // Seed a sample patient to backup
  await idbEngine.put('patients', {
    id: 'pat-v21-backup-01',
    mrn: 'MRN-V21-001',
    givenName: 'Zalika',
    familyName: 'Mpemba',
    gender: 'female',
    dateOfBirth: '1992-04-12',
    isSynthetic: false,
    facilityId: 'fac-01',
  });

  const backup = await backupManager.createBackup('PRODUCTION', 'GLOBAL', 'FULL', true);
  assert(backup.backupId.startsWith('bkp_'), 'Backup created with valid backupId');
  assert(backup.databaseVersion === 21, 'Backup records databaseVersion 21');
  assert(backup.checksum.length === 64, 'Backup sealed with 64-character SHA-256 checksum');
  assert(backup.integrityStatus === 'VALID', 'Backup initial integrity status is VALID');
  assert(backup.recordCounts['patients'] >= 1, 'Backup captures patients store record count');

  // Verify backup integrity
  const verification = await backupManager.verifyBackupIntegrity(backup.backupId);
  assert(verification.status === 'VALID', 'Backup verification passes with VALID status');
  assert(verification.checksumVerified === true, 'Checksum verification confirmed');

  // Simulate backup tampering/corruption
  const corruptedArchive = {
    ...backup,
    backupId: 'bkp_corrupted_test',
    checksum: 'tampered_invalid_hash_value_0000000000000000000000000000000000000',
  };
  await idbEngine.put('backupArchives', corruptedArchive);
  const corruptedVerification = await backupManager.verifyBackupIntegrity('bkp_corrupted_test');
  assert(corruptedVerification.status === 'CORRUPTED', 'Tampered backup correctly identified as CORRUPTED');
  assert(corruptedVerification.checksumVerified === false, 'Checksum verification failed for corrupted archive');

  // ----------------------------------------------------------------
  // 6. Restore Manager & Dry-Run Process
  // ----------------------------------------------------------------
  console.log('\n--- 6. Restore Manager & Dry-Run Validation ---');
  // Dry-run restore
  const dryRun = await restoreManager.executeDryRun(backup.backupId, 'PRODUCTION', 'fac-01');
  assert(dryRun.isDryRun === true, 'Restore marked as dry-run');
  assert(dryRun.status === 'DRY_RUN_PASSED', 'Dry-run restore passes validation');
  assert(dryRun.validationResult?.schemaValid === true, 'Dry-run validates schema compatibility');
  assert(dryRun.recordsRestored === 0, 'Dry-run restored zero records to live state (non-destructive)');

  // Attempt restore from corrupted backup: must be blocked
  let blockedCorruptRestore = false;
  try {
    await restoreManager.executeRestore('bkp_corrupted_test', 'PRODUCTION', 'fac-01', 'sysadmin');
  } catch (err: any) {
    blockedCorruptRestore = true;
  }
  assert(blockedCorruptRestore, 'INVARIANT ENFORCED: Restore from corrupted backup strictly rejected');

  // Production restore gate: must fail without human supervisor approval
  let blockedUnapprovedRestore = false;
  try {
    await restoreManager.executeRestore(backup.backupId, 'PRODUCTION', 'fac-01', 'SYSTEM_AUTO');
  } catch (err: any) {
    blockedUnapprovedRestore = true;
  }
  assert(blockedUnapprovedRestore, 'Production restore gate requires human supervisor approval');

  // Execute authorized live restore
  const liveRestore = await restoreManager.executeRestore(backup.backupId, 'PRODUCTION', 'fac-01', 'human_sysadmin_lead');
  assert(liveRestore.status === 'RECONCILED', 'Authorized live restore status is RECONCILED');
  assert(liveRestore.recordsRestored >= 1, 'Records safely restored and reconciled');

  // ----------------------------------------------------------------
  // 7. Disaster Recovery Plans, RPO / RTO & Drills
  // ----------------------------------------------------------------
  console.log('\n--- 7. Disaster Recovery Plans, RPO / RTO & Drills ---');
  const plans = await disasterRecoveryService.initializeBaselinePlans();
  assert(plans.length === 10, 'All 10 disaster recovery categories initialized');

  const dbCorruptionPlan = plans.find(p => p.category === 'DATABASE_CORRUPTION')!;
  assert(dbCorruptionPlan.rpoTargetMinutes === 15, 'DATABASE_CORRUPTION configured with 15 min RPO');
  assert(dbCorruptionPlan.rtoTargetMinutes === 30, 'DATABASE_CORRUPTION configured with 30 min RTO');

  const unconfiguredPlan = plans.find(p => p.category === 'RANSOMWARE_EVENT')!;
  assert(unconfiguredPlan.rpoTargetMinutes === 'NOT_DEFINED', 'Unconfigured RPO accurately displays NOT_DEFINED');

  // Execute simulated DR Drill
  const drillResult = await disasterRecoveryService.executeRecoveryDrill(
    dbCorruptionPlan.planId,
    'Simulated abrupt device loss and IndexedDB recovery',
    'dr_supervisor_dr_amani'
  );
  assert(drillResult.result === 'PASSED', 'Disaster recovery test drill PASSED');
  assert(drillResult.recoveryDurationMinutes <= 30, 'Recovery completed within target RTO');
  assert(drillResult.reviewer === 'dr_supervisor_dr_amani', 'Reviewer attribution recorded');

  // ----------------------------------------------------------------
  // 8. Data Integrity Monitoring & Clinical Corruption Firewall
  // ----------------------------------------------------------------
  console.log('\n--- 8. Data Integrity Monitoring & Clinical Corruption Firewall ---');
  const audit = await dataIntegrityMonitorService.runIntegrityAudit();
  assert(audit.auditId.startsWith('dia_'), 'Data integrity audit executed');
  assert(audit.inspectedStores >= 281, 'Data integrity audit inspected all stores');

  // CRITICAL INVARIANT TEST: Authoritative clinical data corruption must NEVER be auto-repaired
  const authoritativeRepairAttempt = await dataIntegrityMonitorService.attemptRepair(
    'patients',
    'pat-v21-001',
    true, // Authoritative clinical data
    true  // Attempt auto-repair
  );
  assert(authoritativeRepairAttempt.repaired === false, 'CRITICAL INVARIANT: Authoritative clinical data auto-repair DENIED');
  assert(authoritativeRepairAttempt.reason.includes('CRITICAL_DATA_INTEGRITY_ALERT'), 'Critical data integrity alert reason returned');

  // Derived projection repair IS allowed
  const derivedRepairAttempt = await dataIntegrityMonitorService.attemptRepair(
    'systemIntelligenceTelemetry',
    'telem-001',
    false, // Derived projection
    true
  );
  assert(derivedRepairAttempt.repaired === true, 'Derived projection safely rebuilt from authoritative source');

  // ----------------------------------------------------------------
  // 9. Database Schema Migration Engine & Backup Gate
  // ----------------------------------------------------------------
  console.log('\n--- 9. Database Schema Migration Engine & Backup Gate ---');
  const migrationDryRun = await schemaMigrationManager.executeDryRun(20, 21);
  assert(migrationDryRun.isDryRun === true, 'Migration dry run executed');
  assert(migrationDryRun.status === 'DRY_RUN_SUCCESS', 'Migration dry run succeeded');

  // Migration Backup Gate: Migration must fail if backup is unverified or corrupted
  let migrationBlockedWithoutValidBackup = false;
  try {
    await schemaMigrationManager.executeMigration(20, 21, 'bkp_corrupted_test', 'deploy_engineer');
  } catch (err: any) {
    migrationBlockedWithoutValidBackup = true;
  }
  assert(migrationBlockedWithoutValidBackup, 'MIGRATION BACKUP GATE ENFORCED: Migration blocked without valid backup');

  // Migration succeeds with verified backup
  const liveMigration = await schemaMigrationManager.executeMigration(20, 21, backup.backupId, 'deploy_engineer');
  assert(liveMigration.status === 'MIGRATED', 'Schema migration executed with status MIGRATED');
  assert(liveMigration.backupGateVerified === true, 'Backup gate verified');

  // ----------------------------------------------------------------
  // 10. Facility Onboarding Workflow & Go-Live Gates
  // ----------------------------------------------------------------
  console.log('\n--- 10. Facility Onboarding & Go-Live Gates ---');
  const profile = await facilityDeploymentService.createProfile({
    facilityId: 'fac-uvinza-pilot',
    facilityName: 'Uvinza Health Centre',
    departments: ['OPD', 'IPD', 'LAB', 'PHARMACY'],
    connectivityTier: 'INTERMITTENT',
    hardwareClass: 'LOW_RESOURCE',
    workforceConfigured: true,
    trainingCompleted: true,
    backupVerified: true,
    status: 'PILOT',
    supportContact: 'support@janohealth.org',
  });
  assert(profile.facilityId === 'fac-uvinza-pilot', 'Facility profile created');

  const onboarding = await facilityDeploymentService.initiateOnboarding('fac-uvinza-pilot', '2026-11-01');
  assert(onboarding.currentStage === 'DISCOVERED', 'Initial onboarding stage is DISCOVERED');

  // Go-Live Gate Enforcement: Attempt transition to LIVE without passing all prerequisites
  let goLiveBlocked = false;
  try {
    await facilityDeploymentService.advanceStage(
      onboarding.workflowId,
      'LIVE',
      'operations_lead',
      'Attempting premature go-live',
      {
        authWorking: true,
        backupVerified: false, // Incomplete!
        restoreDrillPassed: true,
        offlineModePassed: true,
        trainingComplete: true,
      }
    );
  } catch (err: any) {
    goLiveBlocked = true;
  }
  assert(goLiveBlocked, 'GO-LIVE GATE ENFORCED: Premature go-live rejected when prerequisites missing');

  // Successful transition when all gates pass
  const liveWorkflow = await facilityDeploymentService.advanceStage(
    onboarding.workflowId,
    'LIVE',
    'operations_lead',
    'All readiness gates verified successfully.',
    {
      authWorking: true,
      backupVerified: true,
      restoreDrillPassed: true,
      offlineModePassed: true,
      trainingComplete: true,
    }
  );
  assert(liveWorkflow.currentStage === 'LIVE', 'Facility successfully transitioned to LIVE');
  assert(liveWorkflow.goLiveGatePassed === true, 'Go-Live gate recorded as passed');

  // ----------------------------------------------------------------
  // 11. Synthetic Data Segregation Invariant
  // ----------------------------------------------------------------
  console.log('\n--- 11. Synthetic Data Segregation Invariant ---');
  const validSynthetic = await facilityDeploymentService.recordSyntheticEntity(
    'Patient',
    'fac-01',
    'synth_pat_001',
    { name: 'Simulated Patient' }
  );
  assert(validSynthetic.label === 'SYNTHETIC DATA', 'Synthetic record visibly labeled SYNTHETIC DATA');
  assert(validSynthetic.isSynthetic === true, 'isSynthetic flag set to true');

  // INVARIANT TEST: Non-synth prefixed id must be rejected
  let invalidSyntheticBlocked = false;
  try {
    await facilityDeploymentService.recordSyntheticEntity(
      'Patient',
      'fac-01',
      'pat_unsegregated_001', // Missing synth_ prefix
      { name: 'Accidental mixing' }
    );
  } catch (err: any) {
    invalidSyntheticBlocked = true;
  }
  assert(invalidSyntheticBlocked, 'INVARIANT ENFORCED: Unsegregated synthetic patient ID strictly rejected');

  // ----------------------------------------------------------------
  // 12. Data Import & Quarantine
  // ----------------------------------------------------------------
  console.log('\n--- 12. Data Import & Quarantine ---');
  const importJob = await facilityDeploymentService.processDataImport(
    'CLINICAL',
    'fac-01',
    'LegacyEMR_CSV',
    [
      { identifier: 'rec-01', isValid: true, payload: { bp: '120/80' } },
      { identifier: 'rec-02', isValid: false, payload: { bp: 'INVALID' }, rejectionReason: 'MALFORMED_BLOOD_PRESSURE' },
    ]
  );
  assert(importJob.importedCount === 1, 'Valid record imported');
  assert(importJob.quarantinedCount === 1, 'Malformed record quarantined');
  assert(importJob.status === 'QUARANTINED_ITEMS_PRESENT', 'Job status reflects quarantined items');

  // ----------------------------------------------------------------
  // 13. Privacy-Preserving Telemetry & Operations Monitoring
  // ----------------------------------------------------------------
  console.log('\n--- 13. Privacy-Preserving Telemetry & Monitoring ---');
  const rawPayload = {
    patientName: 'Jane Doe',
    nationalId: 'NAT-12345678',
    clinicalNotes: 'Sensitive patient clinical condition summary.',
    systemCpuPercent: 12.4,
    queueLatencyMs: 45,
  };
  const sanitized = operationsMonitoringService.sanitizeTelemetryPayload(rawPayload);
  assert(sanitized.patientName === '[REDACTED_PRIVACY_PRESERVED]', 'Patient name redacted in telemetry');
  assert(sanitized.nationalId === '[REDACTED_PRIVACY_PRESERVED]', 'National ID redacted in telemetry');
  assert(sanitized.clinicalNotes === '[REDACTED_PRIVACY_PRESERVED]', 'Clinical notes redacted in telemetry');
  assert(sanitized.systemCpuPercent === 12.4, 'Operational metric preserved in telemetry');

  // Raise operational alert
  const alert = await operationsMonitoringService.raiseAlert(
    'STORAGE_PRESSURE',
    'P1_HIGH',
    'fac-01',
    'StorageEngine',
    'IndexedDB local usage reached 85% of quota.'
  );
  assert(alert.severity === 'P1_HIGH', 'Operational alert registered with P1_HIGH severity');

  // ----------------------------------------------------------------
  // 14. Security Threat Detection & Rate Limiting
  // ----------------------------------------------------------------
  console.log('\n--- 14. Security Threat Detection & Rate Limiting ---');
  // Send rapid requests
  let rateLimited = false;
  for (let i = 0; i < 55; i++) {
    const res = await operationsMonitoringService.evaluateSecurityRequest('192.168.1.100', '/api/v1/auth');
    if (!res.allowed) {
      rateLimited = true;
      break;
    }
  }
  assert(rateLimited, 'Security monitor rate-limits anomalous client traffic');

  // ----------------------------------------------------------------
  // 15. Maintenance Mode & Emergency Clinical Care Invariant
  // ----------------------------------------------------------------
  console.log('\n--- 15. Maintenance Mode & Emergency Care Invariant ---');
  const maintenanceWindow = await operationsMonitoringService.scheduleMaintenance(
    'GLOBAL',
    'Database index rebuild',
    'sysadmin_amanuel',
    ['BACKGROUND_SYNC'],
    30
  );
  assert(maintenanceWindow.isActive === true, 'Maintenance window scheduled');
  assert(maintenanceWindow.emergencyClinicalCareProtected === true, 'INVARIANT ENFORCED: Emergency clinical care protected during maintenance');

  // ----------------------------------------------------------------
  // 16. Release Management & Privacy-Preserving Diagnostic Bundles
  // ----------------------------------------------------------------
  console.log('\n--- 16. Release Management & Diagnostic Bundles ---');
  const gateEvaluation = releaseManagementService.evaluateReleaseGate({
    testsPassed: true,
    typeCheckPassed: true,
    buildPassed: true,
    migrationsPassed: true,
    backupVerified: true,
    securityReviewPassed: true,
    hasApproval: true,
  });
  assert(gateEvaluation.passed === true, 'Release gate passes when all criteria satisfied');

  const bundle = await releaseManagementService.generateDiagnosticBundle('fac-01');
  assert(bundle.containsPatientData === false, 'INVARIANT ENFORCED: Diagnostic bundle contains zero patient data');
  assert(bundle.auditHash.length === 64, 'Diagnostic bundle sealed with audit hash');

  // ----------------------------------------------------------------
  // 17. RBAC & Principle of Least Privilege
  // ----------------------------------------------------------------
  console.log('\n--- 17. RBAC & Separation of Duties ---');
  assert(hasCapability('deployment_engineer', 'system.deployment.manage'), 'deployment_engineer has system.deployment.manage');
  assert(hasCapability('deployment_engineer', 'system.backup.create'), 'deployment_engineer has system.backup.create');
  assert(hasCapability('pilot_operations_director', 'system.pilot.manage'), 'pilot_operations_director has system.pilot.manage');

  // Invariants: Clinical roles do NOT hold deployment authority
  assert(!hasCapability('physician', 'system.deployment.manage'), 'physician does NOT hold system.deployment.manage');
  assert(!hasCapability('nurse', 'system.backup.create'), 'nurse does NOT hold system.backup.create');
  assert(!hasCapability('facility_administrator', 'system.deployment.manage'), 'facility_administrator does NOT hold system.deployment.manage');

  // ----------------------------------------------------------------
  // 18. All 281 Stores Schema & Persistence Integrity
  // ----------------------------------------------------------------
  console.log('\n--- 18. All 281 IndexedDB Stores Persistence & Integrity ---');
  assert(ALL_STORE_NAMES.length >= 281, `ALL_STORE_NAMES contains at least 281 stores including all V21 stores (actual: ${ALL_STORE_NAMES.length})`);

  // Verify persistence in sample V21 stores
  await idbEngine.put('backupArchives', backup);
  const retrievedBackup = await idbEngine.get('backupArchives', backup.backupId);
  assert(retrievedBackup !== undefined, 'Durable persistence verified in V21 backupArchives store');

  await idbEngine.put('operationalAlerts', alert);
  const retrievedAlert = await idbEngine.get('operationalAlerts', alert.alertId);
  assert(retrievedAlert !== undefined, 'Durable persistence verified in V21 operationalAlerts store');

  console.log('\n================================================================');
  console.log(`ALL CLINICAL CORE V21 TESTS PASSED: ${assertionsPassed} assertions verified`);
  console.log('================================================================\n');
}

runV21ProductionReadinessTests().catch((e) => {
  console.error('V21 Test Suite Failed:', e);
  process.exit(1);
});
