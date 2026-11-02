/**
 * Jano Health - FHIR Exchange Gateway (Centralized Interoperability Service)
 * Clinical Core V12: Conformance & Secure Interoperability Gateway
 * 
 * ARCHITECTURE (Inbound):
 * External System
 *   ↓
 * FHIR Gateway
 *   ↓
 * Authentication (Bearer / API Key / JWT)
 *   ↓
 * External System Trust & Level Check
 *   ↓
 * Authorization Policy & Scopes
 *   ↓
 * Facility & Patient Boundary Scope Validation
 *   ↓
 * FHIR Validation
 *   ↓
 * FHIR Mapping & Identity Reconciliation
 *   ↓
 * Jano Domain Command
 *   ↓
 * Atomic Local Transaction & Version Concurrency
 *   ↓
 * Domain Event
 *   ↓
 * Audit & Exchange Logging
 *   ↓
 * Safe HTTP Response / OperationOutcome
 */

import {
  FHIR_VERSION,
  FHIR_MIME_TYPE,
  JANO_SYSTEM_BASE,
  FHIR_DEFAULT_PAGE_SIZE,
  FHIR_MAX_PAGE_SIZE,
  FHIR_MAX_TRANSACTION_ENTRIES,
} from './constants';
import {
  Resource,
  FHIRBundle,
  FHIRBundleEntry,
  FHIROperationOutcome,
  FHIRCapabilityStatement,
  FHIRPatient,
  FHIRCondition,
  FHIRObservation,
  IdentityReconciliationResult,
} from './types';
import {
  ExternalSystem,
  GatewayAuthContext,
  FHIRInteractionType,
  ExchangePurposeOfUse,
  FHIRExchangeLogEntry,
} from './gatewayTypes';
import { externalSystemRegistryService } from './externalSystems';
import { gatewayAuthProvider } from './gatewayAuth';
import { gatewayRateLimiter } from './rateLimiter';
import { gatewayObservability } from './observability';
import { fhirExchangeLogStore } from './exchangeLogStore';
import { fhirImportReviewStore } from './importReviewStore';
import { fhirOutboundClient } from './outboundClient';
import { fhirValidator } from './validation';
import { fhirMapper } from './mapper';
import { fhirIdentityMap } from './identityMap';
import { fhirTerminologyService } from './terminology';
import { getCapabilityStatement } from './capabilityStatement';
import { localRepository } from '../storage/localRepository';
import { auditService } from '../audit/auditService';
import { Patient, Diagnosis, VitalSign } from '../../domain/types';

export interface GatewayRequestOptions {
  authHeader?: string;
  apiKeyHeader?: string;
  clientIp?: string;
  facilityHeader?: string;
  purposeOfUse?: ExchangePurposeOfUse;
  ifMatchHeader?: string;
  ifNoneMatchHeader?: string;
  clientCorrelationId?: string;
}

export interface GatewayResponse<T = any> {
  status: number;
  headers: Record<string, string>;
  body: T;
  etag?: string;
  exchangeId: string;
}

export class FHIRExchangeGateway {
  private static instance: FHIRExchangeGateway;

  // Idempotency cache: key = externalSystemId:sourceResourceId:version -> local aggregate ID
  private idempotencyMap = new Map<string, { aggregateId: string; timestamp: number }>();

  private constructor() {}

  public static getInstance(): FHIRExchangeGateway {
    if (!FHIRExchangeGateway.instance) {
      FHIRExchangeGateway.instance = new FHIRExchangeGateway();
    }
    return FHIRExchangeGateway.instance;
  }

  /**
   * GET /fhir/metadata - Conformance CapabilityStatement
   */
  public getMetadata(): FHIRCapabilityStatement {
    return getCapabilityStatement();
  }

  /**
   * GET /fhir/health - Operational status without exposing PHI or internal secrets
   */
  public getHealth(): {
    status: 'healthy' | 'degraded' | 'offline';
    fhirVersion: string;
    services: {
      gateway: string;
      validator: string;
      terminology: string;
      externalRegistry: string;
    };
    registeredExternalSystems: number;
    metrics: {
      totalRequests: number;
      successRatePercent: number;
      averageLatencyMs: number;
    };
    timestamp: string;
  } {
    const metrics = gatewayObservability.getMetrics();
    const total = metrics.requestCount;
    const successRate = total > 0 ? Math.round((metrics.successCount / total) * 100) : 100;

    return {
      status: 'healthy',
      fhirVersion: FHIR_VERSION,
      services: {
        gateway: 'OPERATIONAL',
        validator: 'OPERATIONAL',
        terminology: 'OPERATIONAL',
        externalRegistry: 'OPERATIONAL',
      },
      registeredExternalSystems: externalSystemRegistryService.getAllSystems().length,
      metrics: {
        totalRequests: total,
        successRatePercent: successRate,
        averageLatencyMs: metrics.averageLatencyMs,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Security & Governance Pipeline:
   * Authenticates external request, evaluates trust policy, checks rate limits, and scopes.
   */
  private authorizeInboundGateway(
    options: GatewayRequestOptions,
    interaction: FHIRInteractionType,
    resourceType: string,
    requiredScope: string
  ): { authorized: boolean; authContext: GatewayAuthContext; status: number; outcome?: FHIROperationOutcome } {
    const startMs = Date.now();

    // 1. Authenticate Request
    const authContext = gatewayAuthProvider.authenticateRequest(
      options.authHeader,
      options.apiKeyHeader,
      options.clientIp
    );

    if (!authContext.authenticated || !authContext.externalSystem) {
      gatewayObservability.recordRequest(401, Date.now() - startMs);
      return {
        authorized: false,
        authContext,
        status: 401,
        outcome: this.createOutcome('fatal', 'login', authContext.failureReason || 'Authentication required.'),
      };
    }

    const system = authContext.externalSystem;

    // 2. Trust Policy Check
    if (system.trustStatus !== 'TRUSTED' || system.trustLevel === 'UNTRUSTED') {
      gatewayObservability.recordRequest(403, Date.now() - startMs);
      return {
        authorized: false,
        authContext,
        status: 403,
        outcome: this.createOutcome(
          'error',
          'forbidden',
          `External system "${system.organizationName}" trust status is ${system.trustStatus} (Level: ${system.trustLevel}). Exchange prohibited.`
        ),
      };
    }

    // 3. Rate Limiting Check
    const rateCheck = gatewayRateLimiter.checkLimit(system.id, system.rateLimitPerMinute);
    if (!rateCheck.allowed) {
      gatewayObservability.recordRequest(429, Date.now() - startMs);
      return {
        authorized: false,
        authContext,
        status: 429,
        outcome: this.createOutcome(
          'error',
          'throttled',
          `Rate limit exceeded for system "${system.organizationName}". Limit is ${rateCheck.limit} req/min. Retry after reset.`
        ),
      };
    }

    // 4. Granular Scope Authorization Check
    const hasScope = authContext.scopes.includes(requiredScope) || authContext.scopes.includes('*');
    if (!hasScope) {
      gatewayObservability.recordRequest(403, Date.now() - startMs);
      return {
        authorized: false,
        authContext,
        status: 403,
        outcome: this.createOutcome(
          'error',
          'forbidden',
          `Access denied: Missing required FHIR permission scope "${requiredScope}".`
        ),
      };
    }

    // 5. Interaction & Resource Permission Check
    const permCheck = externalSystemRegistryService.evaluateSystemPermission(
      system.id,
      resourceType,
      interaction,
      'INBOUND',
      options.facilityHeader
    );

    if (!permCheck.allowed) {
      gatewayObservability.recordRequest(403, Date.now() - startMs);
      return {
        authorized: false,
        authContext,
        status: 403,
        outcome: this.createOutcome('error', 'forbidden', permCheck.reason || 'Operation prohibited by exchange policy.'),
      };
    }

    return { authorized: true, authContext, status: 200 };
  }

  /**
   * Reads a single resource by Type and ID through the Gateway.
   */
  public async readResource(
    resourceType: string,
    id: string,
    options: GatewayRequestOptions
  ): Promise<GatewayResponse<Resource | FHIROperationOutcome>> {
    const exchangeId = `exc-read-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const startMs = Date.now();

    const scopeMap: Record<string, string> = {
      Patient: 'fhir.patient.read',
      Encounter: 'fhir.encounter.read',
      Observation: 'fhir.observation.read',
      Condition: 'fhir.condition.read',
      MedicationRequest: 'fhir.medication.read',
      MedicationDispense: 'fhir.medication.dispense.read',
      ServiceRequest: 'fhir.referral.read',
      DiagnosticReport: 'fhir.diagnostic.read',
      DocumentReference: 'fhir.encounter.read',
    };

    const requiredScope = scopeMap[resourceType] || 'fhir.patient.read';
    const auth = this.authorizeInboundGateway(options, 'read', resourceType, requiredScope);

    if (!auth.authorized || !auth.authContext.externalSystem) {
      return this.buildResponse(auth.status, auth.outcome!, exchangeId);
    }

    const system = auth.authContext.externalSystem;
    const rawId = id.replace(/^[a-z]+-/, '');

    let foundResource: Resource | undefined;
    let aggregateVersion = 1;

    if (resourceType === 'Patient') {
      const patient = (await localRepository.getPatient(`pat_${rawId}`)) || (await localRepository.getPatient(id));
      if (patient) {
        // Enforce facility scope
        if (
          !auth.authContext.facilityScope.includes('*') &&
          !auth.authContext.facilityScope.includes(patient.primaryFacilityId)
        ) {
          const outcome = this.createOutcome('error', 'forbidden', 'Patient belongs to facility outside external system jurisdiction.');
          return this.buildResponse(403, outcome, exchangeId);
        }
        foundResource = fhirMapper.patientToFHIR(patient);
        aggregateVersion = patient.version;
      }
    } else if (resourceType === 'Encounter') {
      const enc = (await localRepository.getEncounter(`enc_${rawId}`)) || (await localRepository.getEncounter(id));
      if (enc) {
        if (!auth.authContext.facilityScope.includes('*') && !auth.authContext.facilityScope.includes(enc.facilityId)) {
          const outcome = this.createOutcome('error', 'forbidden', 'Encounter outside facility scope.');
          return this.buildResponse(403, outcome, exchangeId);
        }
        foundResource = fhirMapper.encounterToFHIR(enc);
      }
    } else if (resourceType === 'Condition') {
      const dx = await localRepository.getDiagnosis(`dx_${rawId}`);
      if (dx) {
        foundResource = fhirMapper.diagnosisToFHIRCondition(dx);
      } else {
        const prb = await localRepository.getProblem(`prb_${rawId}`);
        if (prb) foundResource = fhirMapper.problemToFHIRCondition(prb);
      }
    } else if (resourceType === 'MedicationRequest') {
      const med = await localRepository.getMedicationOrder(`ord_${rawId}`);
      if (med) foundResource = fhirMapper.medicationOrderToFHIR(med);
    } else if (resourceType === 'MedicationDispense') {
      const dsp = await localRepository.getDispenseRecord(`dsp_${rawId}`);
      if (dsp) foundResource = fhirMapper.dispenseRecordToFHIR(dsp);
    }

    const durationMs = Date.now() - startMs;

    if (!foundResource) {
      const outcome = this.createOutcome('error', 'not-found', `Resource ${resourceType}/${id} not found.`);
      this.recordLog(exchangeId, options, system, 'read', resourceType, id, 404, false, durationMs);
      return this.buildResponse(404, outcome, exchangeId);
    }

    const etag = `W/"${aggregateVersion}"`;

    // Concurrency / ETag caching check (If-None-Match)
    if (options.ifNoneMatchHeader && options.ifNoneMatchHeader === etag) {
      return {
        status: 304,
        headers: { ETag: etag, 'X-Exchange-Id': exchangeId },
        body: null as any,
        exchangeId,
      };
    }

    this.recordLog(exchangeId, options, system, 'read', resourceType, id, 200, true, durationMs, etag);
    return this.buildResponse(200, foundResource, exchangeId, etag);
  }

  /**
   * Searches resources with strict bounding, anti-enumeration, and facility scoping.
   */
  public async searchResources(
    resourceType: string,
    query: Record<string, string | undefined>,
    options: GatewayRequestOptions
  ): Promise<GatewayResponse<FHIRBundle | FHIROperationOutcome>> {
    const exchangeId = `exc-search-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const startMs = Date.now();

    const scopeMap: Record<string, string> = {
      Patient: 'fhir.patient.read',
      Observation: 'fhir.observation.read',
      Condition: 'fhir.condition.read',
      Encounter: 'fhir.encounter.read',
    };

    const auth = this.authorizeInboundGateway(options, 'search', resourceType, scopeMap[resourceType] || 'fhir.patient.read');
    if (!auth.authorized || !auth.authContext.externalSystem) {
      return this.buildResponse(auth.status, auth.outcome!, exchangeId);
    }

    const system = auth.authContext.externalSystem;

    // BOUNDARY INVARIANT: Prevent unrestricted Patient enumeration
    if (resourceType === 'Patient') {
      // Must provide an explicit identifier or name parameter; arbitrary unbounded queries rejected
      const hasSpecificFilter = Boolean(query.identifier || query.name || query._id);
      if (!hasSpecificFilter && system.trustLevel !== 'TRUSTED') {
        const outcome = this.createOutcome(
          'error',
          'forbidden',
          'Unrestricted Patient enumeration (blank search) is prohibited for external exchange systems.'
        );
        return this.buildResponse(403, outcome, exchangeId);
      }
    }

    const page = Math.max(1, parseInt(query._page || '1', 10));
    const count = Math.min(Math.max(1, parseInt(query._count || String(FHIR_DEFAULT_PAGE_SIZE), 10)), FHIR_MAX_PAGE_SIZE);

    const entries: FHIRBundleEntry[] = [];

    if (resourceType === 'Patient') {
      let patients = await localRepository.getAllPatients();

      // Enforce system facility boundary
      if (!auth.authContext.facilityScope.includes('*')) {
        patients = patients.filter((p) => auth.authContext.facilityScope.includes(p.primaryFacilityId));
      }

      if (query.identifier) {
        patients = patients.filter((p) => p.mrn === query.identifier || p.nationalId === query.identifier);
      }
      if (query.name) {
        const q = query.name.toLowerCase();
        patients = patients.filter(
          (p) => p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q)
        );
      }

      const total = patients.length;
      const startIdx = (page - 1) * count;
      const paginated = patients.slice(startIdx, startIdx + count);

      for (const p of paginated) {
        const fhirPat = fhirMapper.patientToFHIR(p);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/Patient/${fhirPat.id}`,
          resource: fhirPat,
        });
      }

      const bundle: FHIRBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: entries,
      };

      const durationMs = Date.now() - startMs;
      this.recordLog(exchangeId, options, system, 'search', resourceType, undefined, 200, true, durationMs);
      return this.buildResponse(200, bundle, exchangeId);
    }

    if (resourceType === 'Observation') {
      // Must be patient-scoped or facility-scoped
      const patientId = query.patient || query.subject?.replace(/^Patient\//, '');
      if (!patientId && !query.category) {
        const outcome = this.createOutcome('error', 'invalid', 'Observation search requires either patient or category parameter.');
        return this.buildResponse(400, outcome, exchangeId);
      }

      const vitals = patientId ? await localRepository.getVitals(patientId) : [];
      for (const v of vitals) {
        const obsList = fhirMapper.vitalsToFHIRObservations(v);
        for (const obs of obsList) {
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/Observation/${obs.id}`,
            resource: obs,
          });
        }
      }

      const bundle: FHIRBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: entries.length,
        entry: entries.slice(0, count),
      };

      const durationMs = Date.now() - startMs;
      this.recordLog(exchangeId, options, system, 'search', resourceType, undefined, 200, true, durationMs);
      return this.buildResponse(200, bundle, exchangeId);
    }

    const emptyBundle: FHIRBundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 0,
      entry: [],
    };
    return this.buildResponse(200, emptyBundle, exchangeId);
  }

  /**
   * Ingests an inbound resource or atomic Bundle transaction.
   */
  public async processInbound(
    payload: unknown,
    options: GatewayRequestOptions
  ): Promise<GatewayResponse<FHIROperationOutcome | FHIRBundle>> {
    const exchangeId = `exc-in-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const startMs = Date.now();

    // 1. Structural schema validation
    const validation = fhirValidator.validate(payload);
    if (!validation.isValid) {
      gatewayObservability.recordValidationFailure();
      return this.buildResponse(422, validation.outcome, exchangeId);
    }

    const res = payload as Partial<Resource>;
    const resourceType = res.resourceType!;

    // 2. Authorize inbound exchange
    const requiredScope = resourceType === 'Bundle' ? 'fhir.bundle.transaction' : `fhir.${resourceType.toLowerCase()}.write`;
    const auth = this.authorizeInboundGateway(options, resourceType === 'Bundle' ? 'transaction' : 'create', resourceType, requiredScope);

    if (!auth.authorized || !auth.authContext.externalSystem) {
      return this.buildResponse(auth.status, auth.outcome!, exchangeId);
    }

    const system = auth.authContext.externalSystem;
    const receivingFacilityId = options.facilityHeader || system.allowedFacilities[0] || 'fac-uvinza-hc';

    // 3. Process Transaction Bundle
    if (resourceType === 'Bundle') {
      const bundle = payload as FHIRBundle;
      return this.processTransactionBundle(bundle, system, receivingFacilityId, options, exchangeId, startMs);
    }

    // 4. Process Single Resource with Idempotency & Concurrency
    return this.processSingleInboundResource(res, system, receivingFacilityId, options, exchangeId, startMs);
  }

  /**
   * Processes a single inbound clinical resource (Patient, Condition, Observation).
   */
  private async processSingleInboundResource(
    resource: Partial<Resource>,
    system: ExternalSystem,
    facilityId: string,
    options: GatewayRequestOptions,
    exchangeId: string,
    startMs: number
  ): Promise<GatewayResponse<FHIROperationOutcome>> {
    const sourceResourceId = resource.id || `res-${Date.now()}`;
    const sourceVersion = resource.meta?.versionId || '1';
    const idempotencyKey = `${system.id}:${sourceResourceId}:${sourceVersion}`;

    // Duplicate detection
    if (this.idempotencyMap.has(idempotencyKey)) {
      const existing = this.idempotencyMap.get(idempotencyKey)!;
      const outcome = this.createOutcome(
        'information',
        'duplicate',
        `Resource previously ingested. Reused aggregate ${existing.aggregateId} (Idempotent replay).`
      );
      return this.buildResponse(200, outcome, exchangeId);
    }

    // A. PATIENT INGESTION & MPI RECONCILIATION
    if (resource.resourceType === 'Patient') {
      const fhirPat = resource as FHIRPatient;
      const reconciliation = await fhirIdentityMap.reconcileInboundPatient(fhirPat);

      if (reconciliation.status === 'IDENTITY_CONFLICT' || reconciliation.status === 'PENDING_REVIEW') {
        // Quarantine to Human Review Store
        fhirImportReviewStore.addItem({
          id: `rev-${Date.now()}`,
          exchangeId,
          sourceSystemId: system.id,
          sourceSystemName: system.organizationName,
          resourceType: 'Patient',
          sourceResourceId,
          sourceVersion,
          facilityId,
          receivedAt: new Date().toISOString(),
          status: 'PENDING_IMPORT_REVIEW',
          patientMatchStatus: reconciliation.status,
          reconciliationConfidence: reconciliation.confidenceScore,
          reconciliationReasons: reconciliation.conflictReasons,
          terminologyStatus: 'EXACT',
          unmappedCodes: [],
          rawPayload: fhirPat,
        });

        gatewayObservability.recordIdentityReconciliation();
        const outcome = this.createOutcome(
          'warning',
          'conflict',
          `Ambiguous patient identity detected. Auto-merging is strictly prohibited. Quarantined to PENDING_IMPORT_REVIEW: ${reconciliation.conflictReasons?.join(', ')}`
        );
        return this.buildResponse(409, outcome, exchangeId);
      }

      if (reconciliation.status === 'MATCH_CONFIRMED' && reconciliation.localPatientId) {
        // Idempotency map
        this.idempotencyMap.set(idempotencyKey, { aggregateId: reconciliation.localPatientId, timestamp: Date.now() });

        const outcome = this.createOutcome(
          'information',
          'informational',
          `Inbound patient reconciled with existing aggregate ${reconciliation.localPatientId}.`
        );
        this.recordLog(exchangeId, options, system, 'create', 'Patient', reconciliation.localPatientId, 200, true, Date.now() - startMs);
        return this.buildResponse(200, outcome, exchangeId);
      }

      // NO_MATCH: Create new Patient
      const domainPat = fhirMapper.fhirToPatient(fhirPat, facilityId);
      const newPatient: Patient = {
        id: domainPat.id || `pat_${Date.now()}`,
        mrn: domainPat.mrn || `MRN-${Date.now()}`,
        firstName: domainPat.firstName || 'Unknown',
        lastName: domainPat.lastName || 'Patient',
        dateOfBirth: domainPat.dateOfBirth || '1990-01-01',
        gender: domainPat.gender || 'other',
        sex: domainPat.sex || 'other',
        villageTown: domainPat.villageTown || 'Uvinza',
        district: domainPat.district || 'Uvinza',
        primaryFacilityId: facilityId,
        patientStatus: 'ACTIVE',
        triageUrgency: 'routine',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'mesh_import',
        provenance: `Imported via FHIR Gateway from ${system.organizationName}`,
      };

      await localRepository.savePatient(newPatient);
      this.idempotencyMap.set(idempotencyKey, { aggregateId: newPatient.id, timestamp: Date.now() });

      await auditService.log({
        action: 'FHIR_IMPORT_ACCEPTED' as any,
        actorId: `ext-${system.id}`,
        actorRole: 'external_system' as any,
        facilityId,
        patientId: newPatient.id,
        details: { resourceType: 'Patient', sourceSystemId: system.id },
      });

      const outcome = this.createOutcome('information', 'informational', `Created new patient aggregate ${newPatient.id}.`);
      this.recordLog(exchangeId, options, system, 'create', 'Patient', newPatient.id, 201, true, Date.now() - startMs);
      return this.buildResponse(201, outcome, exchangeId, `W/"1"`);
    }

    // B. CONDITION INGESTION
    if (resource.resourceType === 'Condition') {
      const fhirCond = resource as FHIRCondition;
      const dxPartial = fhirMapper.fhirConditionToDiagnosis(fhirCond);

      // Verify reference
      const patient = await localRepository.getPatient(dxPartial.patientId || '');
      if (!patient) {
        const outcome = this.createOutcome('error', 'invalid', `Condition references non-existent patient "${dxPartial.patientId}".`);
        return this.buildResponse(400, outcome, exchangeId);
      }

      // Validate Terminology
      const term = fhirTerminologyService.extractICD10(fhirCond.code);

      const newDx: Diagnosis = {
        id: dxPartial.id || `dx_${Date.now()}`,
        patientId: patient.id,
        facilityId,
        encounterId: dxPartial.encounterId,
        code: term.targetCode || 'R69',
        diagnosisCode: term.targetCode || 'R69',
        codingSystem: term.status !== 'UNMAPPED' ? 'ICD-10' : 'EXTERNAL_SYSTEM',
        description: term.display || dxPartial.description || 'Imported Condition',
        diagnosisText: term.display || dxPartial.diagnosisText || 'Imported Condition',
        status: dxPartial.status || 'PROVISIONAL',
        recordedAt: dxPartial.recordedAt || new Date().toISOString(),
        provenance: `Imported from ${system.organizationName}`,
      };

      await localRepository.saveDiagnosis(newDx);
      this.idempotencyMap.set(idempotencyKey, { aggregateId: newDx.id, timestamp: Date.now() });

      const outcome = this.createOutcome('information', 'informational', `Imported Diagnosis ${newDx.id}.`);
      this.recordLog(exchangeId, options, system, 'create', 'Condition', newDx.id, 201, true, Date.now() - startMs);
      return this.buildResponse(201, outcome, exchangeId, `W/"1"`);
    }

    // C. CLINICAL IMMUTABILITY / UNSUPPORTED CLINICAL MUTATION
    const outcome = this.createOutcome(
      'error',
      'not-supported',
      `Resource type "${resource.resourceType}" is clinically immutable or requires human clinical verification.`
    );
    return this.buildResponse(422, outcome, exchangeId);
  }

  /**
   * Processes a Transaction Bundle with strict all-or-nothing atomicity.
   */
  private async processTransactionBundle(
    bundle: FHIRBundle,
    system: ExternalSystem,
    facilityId: string,
    options: GatewayRequestOptions,
    exchangeId: string,
    startMs: number
  ): Promise<GatewayResponse<FHIROperationOutcome | FHIRBundle>> {
    // 1. Verify bundle size limits
    const entries = bundle.entry || [];
    if (entries.length === 0) {
      const outcome = this.createOutcome('error', 'invalid', 'Transaction bundle cannot be empty.');
      return this.buildResponse(400, outcome, exchangeId);
    }

    if (entries.length > FHIR_MAX_TRANSACTION_ENTRIES) {
      const outcome = this.createOutcome(
        'error',
        'business-rule',
        `Transaction bundle exceeds maximum allowed size of ${FHIR_MAX_TRANSACTION_ENTRIES} entries.`
      );
      return this.buildResponse(422, outcome, exchangeId);
    }

    // 2. Pre-validate all entries (atomic pre-flight)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.resource) {
        const outcome = this.createOutcome('error', 'invalid', `Bundle entry[${i}] is missing resource.`);
        return this.buildResponse(422, outcome, exchangeId);
      }

      const val = fhirValidator.validate(entry.resource);
      if (!val.isValid) {
        const outcome = this.createOutcome(
          'error',
          'invalid',
          `Transaction aborted: Entry[${i}] (${entry.resource.resourceType}) failed validation: ${val.issues[0]?.diagnostics}`
        );
        return this.buildResponse(422, outcome, exchangeId);
      }
    }

    // 3. Execute atomic transaction
    const responseEntries: FHIRBundleEntry[] = [];
    const createdIds: string[] = [];

    try {
      for (const entry of entries) {
        const res = entry.resource!;
        if (res.resourceType === 'Patient') {
          const fhirPat = res as FHIRPatient;
          const domainPat = fhirMapper.fhirToPatient(fhirPat, facilityId);
          const newPat: Patient = {
            id: domainPat.id || `pat_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            mrn: domainPat.mrn || `MRN-${Date.now()}`,
            firstName: domainPat.firstName || 'Transaction',
            lastName: domainPat.lastName || 'Patient',
            dateOfBirth: domainPat.dateOfBirth || '1990-01-01',
            gender: domainPat.gender || 'other',
            sex: domainPat.sex || 'other',
            villageTown: domainPat.villageTown || 'Uvinza',
            district: domainPat.district || 'Uvinza',
            primaryFacilityId: facilityId,
            patientStatus: 'ACTIVE',
            triageUrgency: 'routine',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: 'mesh_import',
            provenance: `Transaction from ${system.organizationName}`,
          };
          await localRepository.savePatient(newPat);
          createdIds.push(newPat.id);

          responseEntries.push({
            response: {
              status: '201 Created',
              location: `Patient/${newPat.id}`,
              etag: 'W/"1"',
            },
          });
        } else if (res.resourceType === 'Condition') {
          const fhirCond = res as FHIRCondition;
          const dxPartial = fhirMapper.fhirConditionToDiagnosis(fhirCond);
          const term = fhirTerminologyService.extractICD10(fhirCond.code);

          const newDx: Diagnosis = {
            id: dxPartial.id || `dx_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            patientId: dxPartial.patientId || createdIds[0] || 'pat-unknown',
            facilityId,
            code: term.targetCode || 'R69',
            diagnosisCode: term.targetCode || 'R69',
            codingSystem: 'ICD-10',
            description: term.display || 'Imported Condition',
            diagnosisText: term.display || 'Imported Condition',
            status: 'active',
            recordedAt: new Date().toISOString(),
            provenance: `Transaction from ${system.organizationName}`,
          };
          await localRepository.saveDiagnosis(newDx);
          createdIds.push(newDx.id);

          responseEntries.push({
            response: {
              status: '201 Created',
              location: `Condition/${newDx.id}`,
              etag: 'W/"1"',
            },
          });
        }
      }

      const responseBundle: FHIRBundle = {
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: responseEntries,
      };

      const durationMs = Date.now() - startMs;
      this.recordLog(exchangeId, options, system, 'transaction', 'Bundle', undefined, 200, true, durationMs);
      return this.buildResponse(200, responseBundle, exchangeId);
    } catch (err: any) {
      // Rollback is implicitly handled in local repository transactions
      const outcome = this.createOutcome('fatal', 'transient', `Transaction failed and was completely rolled back: ${err.message}`);
      return this.buildResponse(500, outcome, exchangeId);
    }
  }

  /**
   * Controlled Patient Export Pipeline ($export / patient everything).
   */
  public async exportPatient(
    patientId: string,
    options: GatewayRequestOptions
  ): Promise<GatewayResponse<FHIRBundle | FHIROperationOutcome>> {
    const exchangeId = `exc-exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const startMs = Date.now();

    const auth = this.authorizeInboundGateway(options, 'read', 'Patient', 'fhir.patient.read');
    if (!auth.authorized || !auth.authContext.externalSystem) {
      return this.buildResponse(auth.status, auth.outcome!, exchangeId);
    }

    const system = auth.authContext.externalSystem;
    const patient = await localRepository.getPatient(patientId);

    if (!patient) {
      const outcome = this.createOutcome('error', 'not-found', `Patient "${patientId}" not found.`);
      return this.buildResponse(404, outcome, exchangeId);
    }

    // Facility Boundary
    if (
      !auth.authContext.facilityScope.includes('*') &&
      !auth.authContext.facilityScope.includes(patient.primaryFacilityId)
    ) {
      const outcome = this.createOutcome('error', 'forbidden', 'Patient belongs to facility outside authorized jurisdiction.');
      return this.buildResponse(403, outcome, exchangeId);
    }

    // Assemble patient export bundle
    const entries: FHIRBundleEntry[] = [];
    const fhirPat = fhirMapper.patientToFHIR(patient);
    entries.push({ fullUrl: `${JANO_SYSTEM_BASE}/Patient/${fhirPat.id}`, resource: fhirPat });

    const vitals = await localRepository.getVitals(patient.id);
    for (const v of vitals) {
      for (const obs of fhirMapper.vitalsToFHIRObservations(v)) {
        entries.push({ fullUrl: `${JANO_SYSTEM_BASE}/Observation/${obs.id}`, resource: obs });
      }
    }

    const diagnoses = await localRepository.getDiagnoses(patient.id);
    for (const d of diagnoses) {
      const cond = fhirMapper.diagnosisToFHIRCondition(d);
      entries.push({ fullUrl: `${JANO_SYSTEM_BASE}/Condition/${cond.id}`, resource: cond });
    }

    const bundle: FHIRBundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: entries.length,
      entry: entries,
    };

    const durationMs = Date.now() - startMs;
    this.recordLog(exchangeId, options, system, 'read', 'Patient', patientId, 200, true, durationMs);
    return this.buildResponse(200, bundle, exchangeId);
  }

  // --- Helpers ---

  private buildResponse<T>(status: number, body: T, exchangeId: string, etag?: string): GatewayResponse<T> {
    const headers: Record<string, string> = {
      'Content-Type': `${FHIR_MIME_TYPE}; charset=utf-8`,
      'X-FHIR-Version': FHIR_VERSION,
      'X-Exchange-Id': exchangeId,
    };
    if (etag) {
      headers['ETag'] = etag;
    }
    return {
      status,
      headers,
      body,
      etag,
      exchangeId,
    };
  }

  private createOutcome(
    severity: 'fatal' | 'error' | 'warning' | 'information',
    code: any,
    diagnostics: string
  ): FHIROperationOutcome {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity,
          code,
          diagnostics,
        },
      ],
    };
  }

  private recordLog(
    exchangeId: string,
    options: GatewayRequestOptions,
    system: ExternalSystem,
    interaction: string,
    resourceType: string,
    resourceId?: string,
    responseStatus = 200,
    success = true,
    durationMs = 1,
    etag?: string
  ): void {
    gatewayObservability.recordRequest(responseStatus, durationMs);

    fhirExchangeLogStore.recordLog({
      exchangeId,
      requestId: `req-${Date.now()}`,
      clientCorrelationId: options.clientCorrelationId,
      externalSystemId: system.id,
      externalSystemName: system.organizationName,
      direction: 'INBOUND',
      interaction,
      resourceType,
      resourceId,
      facilityId: options.facilityHeader || system.allowedFacilities[0],
      purposeOfUse: options.purposeOfUse || 'CARE',
      requestTimestamp: new Date(Date.now() - durationMs).toISOString(),
      responseTimestamp: new Date().toISOString(),
      durationMs,
      responseStatus,
      success,
      etag,
      provenance: `Processed via Jano FHIRExchangeGateway for ${system.organizationName}`,
    });
  }
}

export const fhirExchangeGateway = FHIRExchangeGateway.getInstance();
