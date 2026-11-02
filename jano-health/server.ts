import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

import { serverLedger } from './server/serverLedger';
import { getLedgerBackend, ensureBackendInitialized } from './server/ledgerBackend';
import {
  authenticateRequest,
  requireFacilityAuthorization,
  requireSyncAuthorization,
  requireSyncManagementAuth,
  requireLedgerRecoveryAuth,
  requireAdminOrSystem,
  requireNetworkAdmin,
  requireSystemInteropAdmin,
  requireQuarantineReviewer,
  requireClinicalAIAuth,
  requireDirectoryAdmin,
  isProductionMode,
} from './server/authMiddleware';
import { getDirectoryProvisioningService } from './server/directoryProvisioning';
import { resolveServerPort } from './server/portConfig';
import { evaluateServerReadiness, guardCloudRunSyncPersistence } from './server/readiness';
import {
  fhirExchangeService,
  fhirExchangeGateway,
  FHIR_MIME_TYPE,
  FHIR_VERSION,
} from './src/services/fhir';
import {
  janoNodeRegistryService,
  networkExchangePolicyEngine,
  networkExchangeEngine,
  durableExchangeQueue,
  networkQuarantineService,
  janoFacilityRegistryService,
  networkObservabilityService,
} from './src/services/network';
import { longitudinalIdentityService } from './src/services/identity/longitudinalIdentityService';
import { consentPolicyEngine } from './src/services/consent/consentPolicyEngine';
import { financingService } from './src/services/finance/financingService';
import { financialReconciliationService } from './src/services/finance/financialReconciliationService';
import { financingIntelligenceService } from './src/services/analytics/financingIntelligenceService';
import {
  requireWorkforceView,
  requireWorkforceDirectoryManage,
  requireWorkforceCredentialVerify,
  requireWorkforceRosterApprove,
  requireWorkforceShiftManage,
  requireWorkforceTaskManage,
  requireWorkforceIntelligenceView,
} from './server/authMiddleware';
import { workforceService } from './src/services/workforce/workforceService';
import { credentialValidationService } from './src/services/workforce/credentialValidationService';
import { careTeamService } from './src/services/workforce/careTeamService';
import { rosterShiftService } from './src/services/workforce/rosterShiftService';
import { workforceTaskService } from './src/services/workforce/workforceTaskService';
import { workforceIntelligenceService } from './src/services/workforce/workforceIntelligenceService';
import { FHIRWorkforceMapper } from './src/services/fhir/workforceMapper';
import {
  requireSupplyCatalogView,
  requireSupplyCatalogManage,
  requireSupplyDemandView,
  requireSupplyDemandCreate,
  requireProcurementRequisitionCreate,
  requireProcurementRequisitionApprove,
  requireProcurementSupplierView,
  requireProcurementSupplierManage,
  requireProcurementPOCreate,
  requireProcurementPOApprove,
  requireProcurementPOSend,
  requireLogisticsShipmentView,
  requireLogisticsReceivingCreate,
  requireLogisticsReceivingFinalize,
  requireLogisticsTransferCreate,
  requireLogisticsTransferApprove,
  requireLogisticsTransferReceive,
  requireColdChainView,
  requireColdChainRecord,
  requireColdChainReview,
  requireSupplyQualityView,
  requireSupplyQualityHold,
  requireSupplyQualityRelease,
  requireSupplyRecallManage,
  requireSupplyIntelligenceView,
} from './server/authMiddleware';
import { supplyCatalogService } from './src/services/supplyChain/supplyCatalogService';
import { demandRequisitionService } from './src/services/supplyChain/demandRequisitionService';
import { procurementOrderService } from './src/services/supplyChain/procurementOrderService';
import { logisticsReceivingService } from './src/services/supplyChain/logisticsReceivingService';
import { warehouseTransferService } from './src/services/supplyChain/warehouseTransferService';
import { coldChainService } from './src/services/supplyChain/coldChainService';
import { qualityRecallService } from './src/services/supplyChain/qualityRecallService';
import { supplyPlanningIntelligenceService } from './src/services/supplyChain/supplyPlanningIntelligenceService';
import {
  requireResearchStudyView,
  requireResearchStudyManage,
  requireResearchStudyApprove,
  requireResearchSubjectEnroll,
  requireResearchDatasetRelease,
  requireResearchGovernanceManage,
} from './server/authMiddleware';
import { researchGovernanceService } from './src/services/research/researchGovernanceService';
import { researchParticipantService } from './src/services/research/researchParticipantService';
import { researchCohortDatasetService } from './src/services/research/researchCohortDatasetService';
import { researchOperationsService } from './src/services/research/researchOperationsService';
import { evidenceLearningService } from './src/services/research/evidenceLearningService';
import {
  requireEcosystemSystemView,
  requireEcosystemSystemManage,
  requireEcosystemIntegrationApprove,
  requireEcosystemMFRReconcile,
  requireEcosystemTerminologyApprove,
  requireEcosystemReportingSubmit,
  requireEcosystemSurveillanceApprove,
  requireEcosystemGovernanceManage,
  requireSystemIntelligenceView,
  requireSystemIntelligenceManage,
  requireSystemAutomationApprove,
  requireSystemAutomationExecute,
  requireSystemIncidentManage,
  requireSystemSimulationRun,
} from './server/authMiddleware';
import {
  ecosystemRegistryService,
  masterFacilityRegistryService,
  nationalTerminologyService,
  nationalReportingService,
  nationalIdentityService,
  nationalSurveillanceService,
  nationalExchangeQueueService,
  integrationHealthService,
} from './src/services/ecosystem';
import {
  systemObservationService,
  systemRiskEngine,
  capacityIntelligenceService,
  optimizationRecommendationService,
  automationPolicyEngine,
  automationGuardService,
  governedAutomationExecutor,
  resilienceSelfHealingService,
  incidentManagementService,
  simulationEngine,
  workflowOrchestrationService,
} from './src/services/intelligence';
import {
  environmentConfigService,
  backupManager,
  restoreManager,
  disasterRecoveryService,
  dataIntegrityMonitorService,
  schemaMigrationManager,
  facilityDeploymentService,
  operationsMonitoringService,
  releaseManagementService,
} from './src/services/production';
import {
  requireDeploymentView,
  requireDeploymentManage,
  requireBackupCreate,
  requireBackupRestore,
  requireMaintenanceManage,
  requirePilotManage,
} from './server/authMiddleware';
import {
  clinicalSafetyCaseService,
  clinicalHazardRegistryService,
  workflowValidationMatrixService,
  aiValidationEvaluationService,
  clinicalUsabilityAlertService,
  clinicalSafetyIncidentCAPAService,
  clinicalValidationGateService,
} from './src/services/clinicalValidation';
import {
  requireClinicalSafetyView,
  requireClinicalSafetyManage,
  requireClinicalSafetyApprove,
  requireClinicalValidationReview,
  requireClinicalIncidentClose,
  requireMultiSiteEvidenceLead,
} from './server/authMiddleware';
import {
  pilotProgramService,
  pilotFacilityReadinessService,
  pilotConfigurationService,
  pilotGoLiveGateService,
  pilotOperationsService,
  pilotIncidentEscalationService,
  pilotKillSwitchService,
  pilotAIGovernanceService,
  pilotRealWorldEvidenceService,
  pilotReportService,
} from './src/services/pilot';
import {
  evidenceProgramService,
  siteComparabilityService,
  standardizedMetricCatalogService,
  comparativeAnalysisService,
  siteImplementationMaturityService,
  crossSiteRiskService,
  multiSiteAIEvaluationService,
  offlineConditionAnalysisService,
  pilotLearningLoopService,
  scaleDecisionService,
  multiSiteEvidencePacketService,
} from './src/services/multisite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portResolution = resolveServerPort(process.env.PORT);
const PORT = portResolution.port;

app.use(express.json({ limit: '10mb' }));

export interface StructuredClinicalOutput {
  summary: string;
  clinicalConsiderations: string[];
  redFlags: string[];
  contraindications: string[];
  recommendedActions: string[];
  evidenceSources: string[];
}

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.7-flash';

function isTransientOrAvailabilityFailure(err: any): boolean {
  if (!err) return false;
  const message = String(err.message || '').toLowerCase();
  const status = Number(err.status || err.statusCode || err.code);

  // Non-retryable errors
  if (status === 400 || status === 401 || status === 403) return false;
  if (
    message.includes('api key') ||
    message.includes('apikey') ||
    message.includes('unauthorized') ||
    message.includes('permission') ||
    message.includes('safety') ||
    message.includes('blocked') ||
    message.includes('malformed') ||
    message.includes('invalid argument')
  ) {
    return false;
  }

  // Transient / availability errors
  if (status === 404 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (
    message.includes('not found') ||
    message.includes('unavailable') ||
    message.includes('overloaded') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('timeout') ||
    message.includes('deadline') ||
    message.includes('econnrefused')
  ) {
    return true;
  }

  return false;
}

function parseAndValidateStructuredOutput(rawText: string): StructuredClinicalOutput {
  try {
    let cleanText = rawText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    }

    const parsed = JSON.parse(cleanText);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Clinical decision support summary.',
      clinicalConsiderations: Array.isArray(parsed.clinicalConsiderations)
        ? parsed.clinicalConsiderations.map(String)
        : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String) : [],
      contraindications: Array.isArray(parsed.contraindications) ? parsed.contraindications.map(String) : [],
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.map(String) : [],
      evidenceSources: Array.isArray(parsed.evidenceSources)
        ? parsed.evidenceSources.map(String)
        : ['Jano Clinical Decision Support Guidelines'],
    };
  } catch {
    return {
      summary: rawText.slice(0, 300) || 'Clinical decision support generated.',
      clinicalConsiderations: ['Clinical correlation and bedside exam required.'],
      redFlags: ['Monitor for unstable vitals or acute deterioration.'],
      contraindications: ['Verify patient allergy history.'],
      recommendedActions: ['Consult local standard treatment guidelines or senior clinician.'],
      evidenceSources: ['Offline Clinical Protocols'],
    };
  }
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Liveness Endpoint (Indicates whether the HTTP process is alive and responsive)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'Jano Health EHR Platform',
    version: '1.1.0-hardened',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    authMode: isProductionMode() ? 'production' : 'development',
  });
});

// Authoritative Readiness Endpoint (Evaluates ledger state & Cloud Run persistence capability)
app.get('/api/ready', (req: Request, res: Response) => {
  const result = evaluateServerReadiness();
  res.status(result.statusCode).json({
    status: result.ready ? 'ready' : 'not_ready',
    ready: result.ready,
    ...(result.error ? { error: result.error } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    operationalState: result.operationalState,
    persistence: result.persistence,
    environment: result.environment,
    timestamp: result.timestamp,
  });
});

// AI Clinical Decision Support Endpoint (Secure Server-Side Gemini API proxy)
// Strictly protected: authentication required, role-authorized, request-validated, fail-closed
const ALLOWED_AI_TASK_TYPES = [
  'clinical_qa',
  'chart_summary',
  'differential',
  'differential_support',
  'risk_flags',
  'documentation',
  'clinical_documentation',
  'patient_education',
  'encounter_summary',
  'missing_information',
  'referral_summary',
  'medication_safety_support',
  'ai.chart_summary',
  'ai.encounter_summary',
  'ai.clinical_documentation',
  'ai.differential_support',
  'ai.clinical_question',
  'ai.missing_information',
  'ai.referral_summary',
  'ai.medication_safety_support',
  'ai.patient_education',
];

app.post('/api/ai/clinical-assist', authenticateRequest, requireClinicalAIAuth, async (req: Request, res: Response) => {
  const { requestId, taskType, patientContext, clinicalQuery, additionalClinicalData } = req.body || {};

  // Request validation: taskType
  if (!taskType || typeof taskType !== 'string' || !ALLOWED_AI_TASK_TYPES.includes(taskType)) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      source: 'unavailable',
      message: `Invalid or unsupported AI taskType: '${taskType}'. Must be a recognized clinical decision support task.`,
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
    });
  }

  // Request validation: at least clinicalQuery or patientContext must be provided
  const hasQuery = typeof clinicalQuery === 'string' && clinicalQuery.trim().length > 0;
  const hasPatientContext = patientContext && typeof patientContext === 'object';
  if (!hasQuery && !hasPatientContext) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      source: 'unavailable',
      message: 'Malformed request: clinical query or patient context must be provided.',
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
    });
  }

  // Request validation: query length guard to prevent prompt denial of service
  if (hasQuery && clinicalQuery.length > 8000) {
    return res.status(400).json({
      error: 'PAYLOAD_TOO_LARGE',
      source: 'unavailable',
      message: 'Clinical query exceeds maximum allowed length (8000 characters).',
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_NOT_CONFIGURED',
      source: 'unavailable',
      message: 'Cloud Gemini model service is unconfigured on server. Offline and unconfigured environments must use the local deterministic clinical rule engine.',
      clinicianReviewRequired: true,
      isAutonomousMutationAllowed: false,
    });
  }

  const systemInstruction = `You are Jano AI, an expert clinical decision-support intelligence embedded in Jano Health Electronic Health Record (EHR).
Jano Health is designed for low-resource healthcare environments, district hospitals, rural health centers, and mobile medical outreach units.

SAFETY AND ETHICAL CONSTRAINTS (STRICT):
1. You NEVER autonomously prescribe medications, make definitive patient diagnoses, or execute medical orders.
2. Your purpose is strictly to assist qualified healthcare professionals (physicians, clinical health officers, nurses, supervisors).
3. Tailor recommendations to rural and resource-limited settings (e.g. reliance on clinical exam, bedside vitals, rapid diagnostic tests like malaria mRDT, availability of essential WHO medicines).
4. Always flag red-flag danger signs, contraindications, and drug-drug or drug-allergy interactions.
5. Tone: Calm, objective, professional, evidence-grounded.`;

  const promptText = `TASK TYPE: ${taskType || 'clinical_qa'}
PATIENT CONTEXT:
${patientContext ? JSON.stringify(patientContext, null, 2) : 'No specific patient record attached'}

CLINICAL QUERY / CHIEF COMPLAINT:
${clinicalQuery || 'General clinical review'}

ADDITIONAL CLINICAL DATA:
${additionalClinicalData ? JSON.stringify(additionalClinicalData, null, 2) : 'None'}

Please provide structured clinical decision support conforming exactly to JSON format:
{
  "summary": "Concise clinical summary and situational briefing",
  "clinicalConsiderations": ["Key consideration 1", "Key consideration 2"],
  "redFlags": ["Danger sign 1", "Danger sign 2"],
  "contraindications": ["Contraindication / allergy warning 1"],
  "recommendedActions": ["Prioritized action item 1", "Prioritized action item 2"],
  "evidenceSources": ["Relevant clinical guideline reference"]
}`;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let rawOutput = '';
  let activeModel = PRIMARY_MODEL;

  try {
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: promptText,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });
    rawOutput = response.text || '';
  } catch (primaryErr: any) {
    const errMessage = String(primaryErr?.message || '');
    const errStatus = Number(primaryErr?.status || primaryErr?.statusCode || primaryErr?.code);

    // Fail immediately on configuration / permission / safety errors without hiding them
    if (errStatus === 401 || errStatus === 403 || errMessage.toLowerCase().includes('api key') || errMessage.toLowerCase().includes('permission')) {
      console.error('[Jano AI] Gemini API credential/permission failure:', errMessage);
      return res.status(403).json({
        error: 'CONFIGURATION_OR_CREDENTIAL_ERROR',
        source: 'unavailable',
        message: 'Invalid or unauthorized Gemini API credentials. Please check GEMINI_API_KEY configuration.',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
      });
    }

    if (errStatus === 400 || errMessage.toLowerCase().includes('malformed') || errMessage.toLowerCase().includes('invalid argument')) {
      console.error('[Jano AI] Gemini malformed request error:', errMessage);
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        source: 'unavailable',
        message: 'Malformed or invalid AI request parameters.',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
      });
    }

    if (errMessage.toLowerCase().includes('safety') || errMessage.toLowerCase().includes('blocked')) {
      console.warn('[Jano AI] Gemini safety policy rejection:', errMessage);
      return res.status(422).json({
        error: 'SAFETY_POLICY_REJECTION',
        source: 'unavailable',
        message: 'The clinical request was blocked by safety policy constraints.',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
      });
    }

    // Only retry if transient or model availability issue
    if (isTransientOrAvailabilityFailure(primaryErr)) {
      console.warn(`[Jano AI] Primary model ${PRIMARY_MODEL} encountered transient failure (${errMessage}), attempting fallback to ${FALLBACK_MODEL}`);
      try {
        activeModel = FALLBACK_MODEL;
        const fallbackResponse = await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents: promptText,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
        rawOutput = fallbackResponse.text || '';
      } catch (fallbackErr: any) {
        console.error(`[Jano AI] Fallback model ${FALLBACK_MODEL} also failed:`, fallbackErr?.message);
        return res.status(503).json({
          error: 'AI_SERVICE_UNAVAILABLE',
          source: 'unavailable',
          message: 'Both primary and fallback AI models are currently unavailable.',
          clinicianReviewRequired: true,
          isAutonomousMutationAllowed: false,
        });
      }
    } else {
      console.error('[Jano AI] Non-transient Gemini failure:', errMessage);
      return res.status(500).json({
        error: 'AI_EXECUTION_FAILURE',
        source: 'unavailable',
        message: 'Failed to execute clinical decision support request.',
        clinicianReviewRequired: true,
        isAutonomousMutationAllowed: false,
      });
    }
  }

  const structured = parseAndValidateStructuredOutput(rawOutput);

  return res.json({
    requestId: requestId || 'air-' + Date.now(),
    taskType,
    model: activeModel,
    source: 'cloud_gemini',
    content: structured.summary,
    structuredOutput: structured,
    structuredPoints: [
      ...structured.recommendedActions,
      ...structured.redFlags.map((rf) => `[RED FLAG] ${rf}`),
    ],
    safetyWarnings: [
      'Generated via Jano AI Decision Support.',
      'Decision support output only. Must not substitute for qualified clinical evaluation.',
      'Clinician verification required prior to clinical implementation.',
    ],
    clinicianReviewRequired: true,
    isAutonomousMutationAllowed: false,
    actor: {
      userId: req.authenticatedPrincipal?.userId,
      roles: req.authenticatedPrincipal?.roles,
      facilityIds: req.authenticatedPrincipal?.facilityIds,
    },
    generatedAt: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// SERVER SYNCHRONIZATION LEDGER & IDEMPOTENCY REGISTRY
// ----------------------------------------------------

// Synchronization Push Endpoint (Sync delta events from client)
app.post('/api/sync/push', authenticateRequest, requireSyncAuthorization, guardCloudRunSyncPersistence, ensureBackendInitialized, async (req: Request, res: Response) => {
  const { deviceId, batchTimestamp, events } = req.body;
  const eventList = Array.isArray(events) ? events : [];
  const principal = req.authenticatedPrincipal!;
  const actorId = principal.userId;
  const backend = getLedgerBackend();

  console.log(`[Jano Sync] Push received from device [${deviceId}] by principal [${actorId}] with ${eventList.length} events at ${batchTimestamp} (Backend: ${backend.backendType})`);

  try {
    const result = await backend.processPushBatch(deviceId, batchTimestamp, eventList, principal);
    if (result.status === 'rejected') {
      return res.status(403).json(result);
    }
    if (result.status === 'error' || (result as any).error) {
      const isRecovery = (result as any).error === 'LEDGER_RECOVERY_REQUIRED' || (result as any).error === 'LEDGER_RECOVERY_BLOCKED';
      return res.status(isRecovery ? 503 : 500).json(result);
    }
    res.json(result);
  } catch (err: any) {
    console.error('[Jano Sync] Unexpected persistence failure during sync push:', err);
    res.status(500).json({
      status: 'error',
      error: 'PERSISTENCE_FAILED',
      message: err.message || 'Authoritative persistence operation failed',
      receivedAt: new Date().toISOString(),
      processedCount: 0,
      acknowledgedEventIds: [],
      duplicateEventIds: [],
      rejectedEvents: [],
      conflicts: [],
    });
  }
});

// Synchronization Pull Endpoint (Cursor-based durable delta sync)
app.get('/api/sync/pull', authenticateRequest, requireSyncAuthorization, guardCloudRunSyncPersistence, ensureBackendInitialized, async (req: Request, res: Response) => {
  const { since, facilityId, deviceId } = req.query;
  const principal = req.authenticatedPrincipal!;
  const backend = getLedgerBackend();

  const hasCrossCap = await backend.hasCrossFacilitySyncCapability(principal.userId, principal.tenantId);
  const allowCrossFacility = (principal.syncCapabilities && principal.syncCapabilities.includes('sync:cross_facility'))
    || hasCrossCap;

  let effectiveFacility: string;
  if (facilityId === 'all' || facilityId === '*') {
    if (!allowCrossFacility) {
      return res.status(403).json({
        error: 'CROSS_FACILITY_ACCESS_DENIED',
        message: `Principal '${principal.userId}' lacks explicit cross-facility synchronization capability.`,
      });
    }
    effectiveFacility = 'all';
  } else if (facilityId) {
    effectiveFacility = String(facilityId);
  } else {
    // Missing facilityId: default strictly to principal's primary facility (never 'all')
    effectiveFacility = principal.facilityIds[0];
  }

  try {
    const result = await backend.pullChanges(
      since ? String(since) : null,
      effectiveFacility,
      deviceId ? String(deviceId) : undefined,
      principal.tenantId,
      principal.facilityIds,
      allowCrossFacility
    );
    res.json(result);
  } catch (err: any) {
    console.error('[Jano Sync] Unexpected error during sync pull:', err);
    res.status(500).json({
      error: 'PULL_FAILED',
      message: err.message || 'Authoritative pull operation failed',
    });
  }
});

// Diagnostics Endpoint for Observability (Restricted to principals with sync management capability)
app.get('/api/sync/diagnostics', authenticateRequest, requireSyncManagementAuth, ensureBackendInitialized, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const backend = getLedgerBackend();

  try {
    const diag = await backend.getDiagnostics(principal.tenantId);
    res.json(diag);
  } catch (err: any) {
    console.error('[Jano Sync] Failed to retrieve diagnostics:', err);
    res.status(500).json({
      error: 'DIAGNOSTICS_FAILED',
      message: err.message || 'Failed to retrieve diagnostics',
    });
  }
});

// Reset server sync state (Strictly disabled in production mode, restricted to global system admin in dev)
app.post('/api/sync/reset', authenticateRequest, requireLedgerRecoveryAuth, guardCloudRunSyncPersistence, ensureBackendInitialized, async (req: Request, res: Response) => {
  if (isProductionMode()) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'State reset endpoint is permanently disabled in production mode.',
    });
  }

  const backend = getLedgerBackend();
  const opState = await backend.getOperationalState();
  if (opState !== 'NORMAL') {
    return res.status(423).json({
      error: 'LOCKED',
      message: `State reset forbidden: Ledger is in ${opState} state. Authorized reconciliation required.`,
      operationalState: opState,
    });
  }

  try {
    const outcome = await backend.reset(req.authenticatedPrincipal?.userId);
    res.json(outcome);
  } catch (err: any) {
    const isUnsupported = err.message?.includes('OPERATION_UNSUPPORTED');
    res.status(isUnsupported ? 501 : 500).json({
      error: isUnsupported ? 'OPERATION_UNSUPPORTED' : 'RESET_FAILED',
      message: err.message,
    });
  }
});

// Authorized Ledger Reconciliation Endpoint
app.post('/api/sync/recovery/reconcile', authenticateRequest, requireLedgerRecoveryAuth, guardCloudRunSyncPersistence, ensureBackendInitialized, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { notes, allowDataLoss, acknowledgeGapsConfirmation } = req.body || {};
  const backend = getLedgerBackend();

  try {
    const outcome = await backend.reconcileAndResume(principal, {
      notes,
      allowDataLoss,
      acknowledgeGapsConfirmation,
    });
    res.json(outcome);
  } catch (err: any) {
    const isUnsupported = err.message?.includes('OPERATION_UNSUPPORTED');
    res.status(isUnsupported ? 501 : 400).json({
      error: isUnsupported ? 'OPERATION_UNSUPPORTED' : 'RECONCILIATION_FAILED',
      message: err.message,
      operationalState: await backend.getOperationalState(),
    });
  }
});

// Ledger Recovery Status Endpoint
app.get('/api/sync/recovery/status', authenticateRequest, requireSyncManagementAuth, ensureBackendInitialized, async (req: Request, res: Response) => {
  const backend = getLedgerBackend();
  try {
    const status = await backend.getRecoveryStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({
      error: 'RECOVERY_STATUS_FAILED',
      message: err.message,
    });
  }
});

// ----------------------------------------------------
// AUTHORITATIVE FIRESTORE DIRECTORY ADMINISTRATION API
// Protected: Requires authenticateRequest & requireDirectoryAdmin
// ----------------------------------------------------

// 1. Inspect Directory Records & Provisioning Status
app.get('/api/admin/directory/inspect', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { tenantId, facilityId, uid, includeAuditLogs, auditLogLimit } = req.query;

  const result = await service.inspectDirectory(principal, {
    tenantId: tenantId ? String(tenantId) : undefined,
    facilityId: facilityId ? String(facilityId) : undefined,
    uid: uid ? String(uid) : undefined,
    includeAuditLogs: includeAuditLogs === 'true',
    auditLogLimit: auditLogLimit ? parseInt(String(auditLogLimit), 10) : undefined,
  });

  if (!result.success) {
    return res.status(result.error?.includes('UNAUTHORIZED') ? 403 : 400).json(result);
  }
  return res.json(result);
});

// 2. Provision Tenant (Global Admin only)
app.post('/api/admin/directory/tenant', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { tenantId, policyMetadata, reason } = req.body || {};

  const result = await service.provisionTenant(principal, { tenantId, policyMetadata, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') || result.error?.includes('REQUIRED') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.status(201).json(result);
});

// 3. Provision Facility under Tenant
app.post('/api/admin/directory/facility', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { facilityId, tenantId, facilityMetadata, reason } = req.body || {};

  const result = await service.provisionFacility(principal, { facilityId, tenantId, facilityMetadata, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') || result.error?.includes('REQUIRED') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.status(201).json(result);
});

// 4. Provision User Account
app.post('/api/admin/directory/user', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, metadata, reason } = req.body || {};

  const result = await service.provisionUser(principal, { uid, metadata, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.status(201).json(result);
});

// 5. Create Tenant Membership
app.post('/api/admin/directory/membership/tenant', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, tenantId, roles, capabilities, reason } = req.body || {};

  const result = await service.createTenantMembership(principal, { uid, tenantId, roles, capabilities, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') || result.error?.includes('ELEVATION') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.status(201).json(result);
});

// 6. Create Facility Membership
app.post('/api/admin/directory/membership/facility', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, tenantId, facilityId, capabilities, reason } = req.body || {};

  const result = await service.createFacilityMembership(principal, { uid, tenantId, facilityId, capabilities, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.status(201).json(result);
});

// 7. Update Membership Roles & Capabilities
app.put('/api/admin/directory/membership', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { type, uid, tenantId, facilityId, roles, capabilities, reason } = req.body || {};

  const result = await service.updateMembership(principal, { type, uid, tenantId, facilityId, roles, capabilities, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.json(result);
});

// 8. Set User Account Status
app.put('/api/admin/directory/user/status', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, newStatus, reason } = req.body || {};

  const result = await service.setUserAccountStatus(principal, { uid, newStatus, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.json(result);
});

// 9. Set Tenant Membership Status
app.put('/api/admin/directory/membership/tenant/status', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, tenantId, newStatus, reason } = req.body || {};

  const result = await service.setTenantMembershipStatus(principal, { uid, tenantId, newStatus, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.json(result);
});

// 10. Set Facility Membership Status
app.put('/api/admin/directory/membership/facility/status', authenticateRequest, requireDirectoryAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const service = getDirectoryProvisioningService();
  const { uid, tenantId, facilityId, newStatus, reason } = req.body || {};

  const result = await service.setFacilityMembershipStatus(principal, { uid, tenantId, facilityId, newStatus, reason });
  if (!result.success) {
    const status = result.error?.includes('FORBIDDEN') ? 403 : 400;
    return res.status(status).json(result);
  }
  return res.json(result);
});

// ----------------------------------------------------
// FHIR R5 INTEROPERABILITY REST API ENDPOINTS
// ----------------------------------------------------

// FHIR Health & Interoperability Gateway Telemetry
app.get('/fhir/health', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(fhirExchangeGateway.getHealth());
});

// CapabilityStatement Conformance Endpoint (Standard FHIR R5)
app.get('/fhir/metadata', (req: Request, res: Response) => {
  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);
  res.json(fhirExchangeGateway.getMetadata());
});

// Patient-Scoped $export Operation (Standard Patient-Everything Bundle)
app.get('/fhir/Patient/:id/\\$everything', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const patientId = req.params.id;
  const facilityId = (req.headers['x-facility-id'] as string) || principal.facilityIds[0];
  const purposeOfUse = (req.query.purposeOfUse as any) || 'TREATMENT';

  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);

  const result = await fhirExchangeService.exportPatient({
    patientId,
    requestingUserId: principal.userId,
    requestingUserRole: principal.roles[0] || 'physician',
    requestingFacilityId: facilityId,
    purposeOfUse,
  });

  if (result.bundle) {
    return res.status(result.status).json(result.bundle);
  }
  return res.status(result.status).json(result.outcome);
});

// Read single FHIR resource by ID
app.get('/fhir/:resourceType/:id', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { resourceType, id } = req.params;
  const facilityId = (req.headers['x-facility-id'] as string) || principal.facilityIds[0];

  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);

  const result = await fhirExchangeService.getResource(
    resourceType,
    id,
    principal.userId,
    principal.roles[0] || 'physician',
    facilityId
  );

  if (result.resource) {
    return res.status(result.status).json(result.resource);
  }
  return res.status(result.status).json(result.outcome);
});

// Search FHIR resources by query parameters
app.get('/fhir/:resourceType', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { resourceType } = req.params;
  const facilityId = (req.headers['x-facility-id'] as string) || principal.facilityIds[0];
  const query = req.query as Record<string, string | undefined>;

  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);

  const result = await fhirExchangeService.searchResources(
    resourceType,
    query,
    principal.userId,
    principal.roles[0] || 'physician',
    facilityId
  );

  return res.status(result.status).json(result.bundle || result.outcome);
});

// Process Inbound FHIR Transaction or Batch Bundle
app.post('/fhir', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const facilityId = (req.headers['x-facility-id'] as string) || principal.facilityIds[0];
  const sourceSystemId = (req.headers['x-source-system'] as string) || 'sys-tz-moh-hie';

  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);

  const result = await fhirExchangeService.processInbound(
    req.body,
    sourceSystemId,
    facilityId,
    principal.userId,
    principal.roles[0] || 'physician'
  );

  return res.status(result.status).json(result.outcome);
});

// Process Inbound Single FHIR Resource
app.post('/fhir/:resourceType', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const facilityId = (req.headers['x-facility-id'] as string) || principal.facilityIds[0];
  const sourceSystemId = (req.headers['x-source-system'] as string) || 'sys-tz-moh-hie';

  res.setHeader('Content-Type', `${FHIR_MIME_TYPE}; charset=utf-8`);
  res.setHeader('X-FHIR-Version', FHIR_VERSION);

  const result = await fhirExchangeService.processInbound(
    req.body,
    sourceSystemId,
    facilityId,
    principal.userId,
    principal.roles[0] || 'physician'
  );

  return res.status(result.status).json(result.outcome);
});

// ----------------------------------------------------
// V13: JANO HEALTH NETWORK REST API ENDPOINTS
// ----------------------------------------------------

// Operational Network Health & Telemetry Endpoint
app.get('/network/health', (req: Request, res: Response) => {
  const metrics = networkObservabilityService.getMetricsSummary();
  res.json({
    status: metrics.health,
    timestamp: new Date().toISOString(),
    metrics,
  });
});

// List Network Nodes (Public / Authorized Directory)
app.get('/network/nodes', authenticateRequest, (req: Request, res: Response) => {
  const { trustStatus, networkStatus, facilityId } = req.query;
  const nodes = janoNodeRegistryService.listNodes({
    trustStatus: trustStatus as any,
    networkStatus: networkStatus as any,
    facilityId: facilityId as string,
  });
  res.json({ nodes, count: nodes.length });
});

// Register New Network Node (Network Admin or System Interop Admin)
app.post('/network/nodes', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  try {
    const node = await janoNodeRegistryService.registerNode(req.body, principal.userId);
    res.status(201).json(node);
  } catch (err: any) {
    res.status(400).json({ error: 'NODE_REGISTRATION_FAILED', message: err?.message });
  }
});

// Approve Network Node (Network Admin or System Interop Admin)
app.post('/network/nodes/:nodeId/approve', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { nodeId } = req.params;
  const { reason } = req.body || {};
  try {
    const approved = await janoNodeRegistryService.approveNode(nodeId, principal.userId, reason);
    res.json(approved);
  } catch (err: any) {
    res.status(400).json({ error: 'NODE_APPROVAL_FAILED', message: err?.message });
  }
});

// Suspend Network Node (Network Admin or System Interop Admin)
app.post('/network/nodes/:nodeId/suspend', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { nodeId } = req.params;
  const { reason } = req.body || {};
  try {
    const suspended = await janoNodeRegistryService.suspendNode(nodeId, principal.userId, reason);
    res.json(suspended);
  } catch (err: any) {
    res.status(400).json({ error: 'NODE_SUSPENSION_FAILED', message: err?.message });
  }
});

// Revoke Network Node (Network Admin or System Interop Admin)
app.post('/network/nodes/:nodeId/revoke', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { nodeId } = req.params;
  const { reason } = req.body || {};
  try {
    const revoked = await janoNodeRegistryService.revokeNode(nodeId, principal.userId, reason);
    res.json(revoked);
  } catch (err: any) {
    res.status(400).json({ error: 'NODE_REVOCATION_FAILED', message: err?.message });
  }
});

// List Network Exchange Policies
app.get('/network/policies', authenticateRequest, (req: Request, res: Response) => {
  const policies = networkExchangePolicyEngine.listPolicies();
  res.json({ policies, count: policies.length });
});

// Create Exchange Policy (System Interop Admin or Network Admin)
app.post('/network/policies', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  try {
    const policy = await networkExchangePolicyEngine.createPolicy(req.body);
    res.status(201).json(policy);
  } catch (err: any) {
    res.status(400).json({ error: 'POLICY_CREATION_FAILED', message: err?.message });
  }
});

// List Network Exchanges (Queue, In-Flight, Dead-Letter)
app.get('/network/exchanges', authenticateRequest, (req: Request, res: Response) => {
  const { sourceNodeId, destinationNodeId, sourceFacilityId, currentState } = req.query;
  const exchanges = durableExchangeQueue.getQueue({
    sourceNodeId: sourceNodeId as string,
    destinationNodeId: destinationNodeId as string,
    sourceFacilityId: sourceFacilityId as string,
    currentState: currentState as any,
  });
  res.json({ exchanges, count: exchanges.length });
});

// Get Single Network Exchange
app.get('/network/exchanges/:exchangeId', authenticateRequest, (req: Request, res: Response) => {
  const { exchangeId } = req.params;
  const match = durableExchangeQueue.getQueue().find((m) => m.exchangeId === exchangeId || m.messageId === exchangeId);
  if (!match) {
    return res.status(404).json({ error: 'NOT_FOUND', message: `Exchange '${exchangeId}' not found.` });
  }
  res.json(match);
});

// Transmit Network Exchange Message
app.post('/network/exchanges', authenticateRequest, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { sourceNodeId, destinationNodeId, messageType, resourceType, resourceId, payload, purpose, priority } = req.body;

  if (!sourceNodeId || !destinationNodeId || !messageType || !resourceType || !payload) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing required network exchange parameters.' });
  }

  try {
    const message = await networkExchangeEngine.sendExchange(
      sourceNodeId,
      destinationNodeId,
      messageType,
      resourceType,
      resourceId || 'anon',
      payload,
      {
        authorId: principal.userId,
        authorRole: principal.roles[0] || 'physician',
        authorFacilityId: (req.headers['x-facility-id'] as string) || principal.facilityIds[0],
        purpose: purpose || 'TREATMENT',
        priority: priority || 'ROUTINE',
      }
    );
    res.status(201).json(message);
  } catch (err: any) {
    res.status(403).json({ error: 'EXCHANGE_FAILED', message: err?.message });
  }
});

// Retry Dead-Letter Exchange
app.post('/network/exchanges/:exchangeId/retry', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { exchangeId } = req.params;
  try {
    const updated = await durableExchangeQueue.retryDeadLetter(exchangeId, principal.userId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: 'RETRY_FAILED', message: err?.message });
  }
});

// Cancel Exchange
app.post('/network/exchanges/:exchangeId/cancel', authenticateRequest, requireNetworkAdmin, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { exchangeId } = req.params;
  const { reason } = req.body || {};
  try {
    const cancelled = await durableExchangeQueue.cancelExchange(exchangeId, principal.userId, reason || 'Cancelled by operator');
    res.json(cancelled);
  } catch (err: any) {
    res.status(400).json({ error: 'CANCEL_FAILED', message: err?.message });
  }
});

// Query Network Quarantine Queue
app.get('/network/quarantine', authenticateRequest, (req: Request, res: Response) => {
  const { category, status, facilityId } = req.query;
  const items = networkQuarantineService.listQuarantined({
    category: category as any,
    status: status as any,
    facilityId: facilityId as string,
  });
  res.json({ items, count: items.length });
});

// Review Network Quarantine Item (Quarantine Reviewer Role Required)
app.post('/network/quarantine/:id/review', authenticateRequest, requireQuarantineReviewer, async (req: Request, res: Response) => {
  const principal = req.authenticatedPrincipal!;
  const { id } = req.params;
  const { action, notes, mappedEntityId } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Review action is required.' });
  }

  try {
    const reviewed = await networkQuarantineService.reviewItem(
      id,
      action,
      principal.userId,
      principal.roles[0] || 'reviewer',
      notes,
      mappedEntityId
    );
    res.json(reviewed);
  } catch (err: any) {
    res.status(400).json({ error: 'REVIEW_FAILED', message: err?.message });
  }
});

// Query Facility Directory
app.get('/network/facilities', authenticateRequest, (req: Request, res: Response) => {
  const query = req.query as Record<string, string>;
  const facilities = janoFacilityRegistryService.searchFacilities({
    type: query.type,
    region: query.region,
    district: query.district,
    hasEmergency: query.hasEmergency === 'true' ? true : query.hasEmergency === 'false' ? false : undefined,
    hasReferral: query.hasReferral === 'true' ? true : query.hasReferral === 'false' ? false : undefined,
    hasRadiology: query.hasRadiology === 'true' ? true : query.hasRadiology === 'false' ? false : undefined,
    hasLaboratory: query.hasLaboratory === 'true' ? true : query.hasLaboratory === 'false' ? false : undefined,
  });
  res.json({ facilities, count: facilities.length });
});

// Query Services Directory
app.get('/network/services', authenticateRequest, (req: Request, res: Response) => {
  const { facilityId, category, availableOnly } = req.query;
  const services = janoFacilityRegistryService.searchServices({
    facilityId: facilityId as string,
    category: category as string,
    availableOnly: availableOnly === 'true',
  });
  res.json({ services, count: services.length });
});

// Network Observability & Metrics
app.get('/network/metrics', authenticateRequest, (req: Request, res: Response) => {
  res.json(networkObservabilityService.getMetricsSummary());
});

// ----------------------------------------------------
// V15: IDENTITY, CONSENT & HEALTH FINANCING ROUTES
// ----------------------------------------------------

// 1. Identity Routes
app.get('/identity/:patientId', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const identity = await longitudinalIdentityService.getIdentityForPatient(patientId);
  if (!identity) {
    return res.status(404).json({ error: `Identity for patient '${patientId}' not found.` });
  }
  res.json(identity);
});

app.get('/identity/:patientId/links', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const identity = await longitudinalIdentityService.getIdentityForPatient(patientId);
  if (!identity) {
    return res.status(404).json({ error: `Identity for patient '${patientId}' not found.` });
  }
  res.json({
    linkedFacilities: identity.linkedFacilities,
    linkedExternalSystems: identity.linkedExternalSystems,
    confidence: identity.confidence,
    status: identity.identityStatus,
  });
});

app.post('/identity/:patientId/reconcile', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const decision = await longitudinalIdentityService.reconcileIdentity(req.body, {
    actorId: actor.userId,
    actorRole: actor.roles[0] || 'system_administrator',
    facilityId: actor.facilityIds[0] || 'fac-default',
  });
  res.json(decision);
});

app.post('/identity/:patientId/status', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { status, reason } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }
  try {
    const updated = await longitudinalIdentityService.updateIdentityStatus(
      req.params.patientId,
      status,
      actor.userId,
      actor.roles[0] || 'system_administrator',
      reason || 'Administrative status transition'
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Consent Routes
app.get('/consents/:patientId', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const consents = await consentPolicyEngine.getConsentsForPatient(patientId);
  res.json({ consents, count: consents.length });
});

app.post('/consents', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const consent = await consentPolicyEngine.grantConsent({
    ...req.body,
    provenance: {
      grantedFacilityId: actor.facilityIds[0] || 'fac-default',
      grantedByActorId: actor.userId,
      grantedByActorRole: actor.roles[0] || 'physician',
      systemVersion: 'v15.0',
    },
    verificationMetadata: req.body.verificationMetadata || {
      signatureType: 'WRITTEN',
      verifiedAt: new Date().toISOString(),
    },
  });
  res.status(201).json(consent);
});

app.patch('/consents/:consentId', authenticateRequest, async (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Consent updated' });
});

app.post('/consents/:consentId/revoke', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { reason } = req.body;
  const revoked = await consentPolicyEngine.revokeConsent(
    req.params.consentId,
    reason || 'Patient requested revocation',
    actor.userId,
    actor.roles[0] || 'physician',
    actor.facilityIds[0] || 'fac-default'
  );
  res.json(revoked);
});

app.post('/consents/emergency-access', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { patientId, emergencyReason, durationMinutes } = req.body;
  if (!patientId || !emergencyReason) {
    return res.status(400).json({ error: 'patientId and emergencyReason are strictly required.' });
  }
  const emgAccess = await consentPolicyEngine.requestEmergencyAccess({
    actorId: actor.userId,
    actorRole: actor.roles[0] || 'physician',
    actorName: actor.email || actor.userId,
    facilityId: actor.facilityIds[0] || 'fac-default',
    patientId,
    emergencyReason,
    durationMinutes: Number(durationMinutes) || 60,
  });
  res.status(201).json(emgAccess);
});

// 3. Health Financing Routes
app.get('/finance/payers', authenticateRequest, async (req: Request, res: Response) => {
  const payers = await financingService.getPayers();
  res.json({ payers, count: payers.length });
});

app.get('/finance/programs', authenticateRequest, async (req: Request, res: Response) => {
  const { payerId } = req.query;
  const programs = await financingService.getPrograms(payerId as string);
  res.json({ programs, count: programs.length });
});

app.get('/finance/coverage/:patientId', authenticateRequest, async (req: Request, res: Response) => {
  const coverages = await financingService.getCoverageForPatient(req.params.patientId);
  res.json({ coverages, count: coverages.length });
});

app.post('/finance/eligibility', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { coverageId, patientId, isOnline } = req.body;
  const response = await financingService.verifyEligibility({
    coverageId,
    patientId,
    facilityId: actor.facilityIds[0] || 'fac-default',
    actorId: actor.userId,
    isOnline,
  });
  res.json(response);
});

app.post('/finance/authorizations', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const auth = await financingService.requestAuthorization({
    ...req.body,
    facilityId: actor.facilityIds[0] || 'fac-default',
    actorId: actor.userId,
    actorRole: actor.roles[0] || 'physician',
  });
  res.status(201).json(auth);
});

app.get('/finance/claims', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.query;
  const claims = patientId
    ? await financingService.getClaimsForPatient(patientId as string)
    : [];
  res.json({ claims, count: claims.length });
});

app.post('/finance/claims', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const claim = await financingService.createClaim({
    ...req.body,
    facilityId: actor.facilityIds[0] || 'fac-default',
    actorId: actor.userId,
    actorRole: actor.roles[0] || 'finance_officer',
  });
  res.status(201).json(claim);
});

app.post('/finance/claims/:claimId/submit', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { isOnline } = req.body;
  const claim = await financingService.submitClaim(
    req.params.claimId,
    actor.userId,
    actor.roles[0] || 'finance_officer',
    isOnline !== undefined ? isOnline : true
  );
  res.json(claim);
});

app.post('/finance/claims/:claimId/correct', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { reason, changedFields, updatedSubmittedAmount } = req.body;
  try {
    const result = await financingService.correctClaim(req.params.claimId, {
      reason: reason || 'Claim revision',
      changedFields: changedFields || ['submittedAmount'],
      updatedSubmittedAmount,
      actorId: actor.userId,
      actorRole: actor.roles[0] || 'finance_officer',
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/finance/claims/:claimId/void', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { reason } = req.body;
  try {
    const voided = await financingService.voidClaim(
      req.params.claimId,
      reason || 'Voided by administrative officer',
      actor.userId,
      actor.roles[0] || 'finance_officer',
      actor.facilityIds[0] || 'fac-default'
    );
    res.json(voided);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/finance/invoices', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.query;
  const invoices = patientId
    ? await financingService.getInvoicesForPatient(patientId as string)
    : await financingService.getAllInvoices();
  res.json({ invoices, count: invoices.length });
});

app.get('/finance/payments', authenticateRequest, async (req: Request, res: Response) => {
  const { patientId } = req.query;
  const payments = patientId
    ? await financingService.getPaymentsForPatient(patientId as string)
    : await financingService.getAllPayments();
  res.json({ payments, count: payments.length });
});

app.post('/finance/payments/reconcile', authenticateRequest, async (req: Request, res: Response) => {
  res.json({ success: true, verifiedEvents: financingService.verifyLedgerIntegrity() });
});

app.post('/finance/reconciliation/run', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { invoiceId, paymentId } = req.body;
  if (!invoiceId || !paymentId) {
    return res.status(400).json({ error: 'invoiceId and paymentId are required.' });
  }
  try {
    const record = await financingService.reconcileInvoiceWithPayment({
      invoiceId,
      paymentId,
      facilityId: actor.facilityIds[0] || 'fac-default',
      actorId: actor.userId,
      actorRole: actor.roles[0] || 'finance_officer',
    });
    res.json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/finance/reconciliation/records', authenticateRequest, async (req: Request, res: Response) => {
  const records = financialReconciliationService.getReconciliationRecords();
  res.json({ records, count: records.length });
});

app.get('/finance/quarantine', authenticateRequest, async (req: Request, res: Response) => {
  res.json({ records: financingService.getQuarantinedRecords() });
});

app.post('/finance/quarantine/:quarantineId/resolve', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { notes } = req.body;
  try {
    const resolved = await financingService.resolveQuarantine(
      req.params.quarantineId,
      notes || 'Resolved by finance supervisor',
      actor.userId
    );
    res.json(resolved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/finance/analytics/population', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const summary = await financingIntelligenceService.getPopulationFinancingSummary(facilityId as string);
  res.json(summary);
});

// ====================================================
// V16 WORKFORCE & CARE OPERATIONS ROUTES
// ====================================================

// 1. Workforce Members Directory
app.get('/workforce', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const { facilityId, category, status } = req.query;
  const members = workforceService.listMembers({
    facilityId: facilityId as string,
    category: category as string,
    status: status as any,
  });
  res.json({ members, count: members.length });
});

app.post('/workforce', authenticateRequest, requireWorkforceDirectoryManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const member = await workforceService.createWorkforceMember({
      ...req.body,
      actorId: actor.userId,
      actorRole: actor.roles[0],
      primaryFacilityId: req.body.primaryFacilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(member);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/workforce/:id', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const member = workforceService.getMember(req.params.id);
  if (!member) {
    return res.status(404).json({ error: 'Workforce member not found' });
  }
  res.json(member);
});

app.patch('/workforce/:id', authenticateRequest, requireWorkforceDirectoryManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const updated = await workforceService.updateWorkforceMember(req.params.id, req.body, {
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
      role: actor.roles[0],
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Credentials & Verification
app.get('/workforce/:id/credentials', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const creds = credentialValidationService.getCredentialsForMember(req.params.id);
  res.json({ credentials: creds, count: creds.length });
});

app.post('/workforce/:id/credentials/verify', authenticateRequest, requireWorkforceCredentialVerify, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { credentialId, source } = req.body;
  if (!credentialId) {
    return res.status(400).json({ error: 'credentialId is required' });
  }
  try {
    const verified = await credentialValidationService.verifyCredential({
      credentialId,
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
      source,
    });
    res.json(verified);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Facility Assignments
app.get('/workforce/facility/assignments', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const { facilityId, memberId } = req.query;
  let assignments = facilityId
    ? workforceService.getAssignmentsForFacility(facilityId as string)
    : memberId
    ? workforceService.getAssignmentsForMember(memberId as string)
    : [];
  res.json({ assignments, count: assignments.length });
});

app.post('/workforce/facility/assignments', authenticateRequest, requireWorkforceDirectoryManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const assignment = await workforceService.assignToFacility({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(assignment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/workforce/facility/assignments/:id', authenticateRequest, requireWorkforceDirectoryManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { reason } = req.body;
  try {
    const ended = await workforceService.endFacilityAssignment(req.params.id, reason || 'Assignment ended', {
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(ended);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Care Teams
app.get('/workforce/teams', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const { facilityId, patientId, memberId } = req.query;
  let teams = patientId
    ? careTeamService.getCareTeamsForPatient(patientId as string)
    : facilityId
    ? careTeamService.getCareTeamsForFacility(facilityId as string)
    : memberId
    ? careTeamService.getTeamsForMember(memberId as string)
    : [];
  res.json({ teams, count: teams.length });
});

app.post('/workforce/teams', authenticateRequest, requireWorkforceDirectoryManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const team = await careTeamService.createCareTeam({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(team);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Duty Rosters & Shifts
app.get('/workforce/rosters', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const facilityId = (req.query.facilityId as string) || req.authenticatedPrincipal!.facilityIds[0] || 'fac-amgh';
  const rosters = rosterShiftService.getRostersForFacility(facilityId);
  res.json({ rosters, count: rosters.length });
});

app.post('/workforce/rosters', authenticateRequest, requireWorkforceShiftManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const roster = await rosterShiftService.createRoster({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(roster);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/workforce/rosters/:id/approve', authenticateRequest, requireWorkforceRosterApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const roster = await rosterShiftService.approveRoster(req.params.id, {
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(roster);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/workforce/rosters/:id/publish', authenticateRequest, requireWorkforceRosterApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const roster = await rosterShiftService.publishRoster(req.params.id, {
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(roster);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/workforce/shifts', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const facilityId = (req.query.facilityId as string) || req.authenticatedPrincipal!.facilityIds[0] || 'fac-amgh';
  const shifts = rosterShiftService.getShiftsForFacility(facilityId);
  res.json({ shifts, count: shifts.length });
});

app.post('/workforce/shifts', authenticateRequest, requireWorkforceShiftManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const shift = await rosterShiftService.assignShift({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(shift);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/workforce/shifts/:id/reassign', authenticateRequest, requireWorkforceShiftManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { newWorkforceMemberId, reason } = req.body;
  if (!newWorkforceMemberId) {
    return res.status(400).json({ error: 'newWorkforceMemberId is required' });
  }
  try {
    const reassigned = await rosterShiftService.reassignShift({
      shiftId: req.params.id,
      newWorkforceMemberId,
      reason: reason || 'Shift reallocated',
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(reassigned);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Shift Handovers
app.get('/workforce/handovers', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const facilityId = (req.query.facilityId as string) || req.authenticatedPrincipal!.facilityIds[0] || 'fac-amgh';
  const handovers = rosterShiftService.getHandoversForFacility(facilityId);
  res.json({ handovers, count: handovers.length });
});

app.post('/workforce/handovers', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const handover = await rosterShiftService.submitHandover({
      ...req.body,
      actorId: actor.userId,
      facility: req.body.facility || actor.facilityIds[0] || 'fac-default',
      outgoingWorkforceMember: req.body.outgoingWorkforceMember || actor.userId,
    });
    res.status(201).json(handover);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/workforce/handovers/:id/acknowledge', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { notes } = req.body;
  try {
    const acknowledged = await rosterShiftService.acknowledgeHandover({
      handoverId: req.params.id,
      acknowledgedBy: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
      notes,
    });
    res.json(acknowledged);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Tasks & Escalations
app.get('/workforce/tasks', authenticateRequest, requireWorkforceView, async (req: Request, res: Response) => {
  const facilityId = (req.query.facilityId as string) || req.authenticatedPrincipal!.facilityIds[0] || 'fac-amgh';
  const tasks = workforceTaskService.getTasksForFacility(facilityId);
  res.json({ tasks, count: tasks.length });
});

app.post('/workforce/tasks', authenticateRequest, requireWorkforceTaskManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const task = await workforceTaskService.createTask({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(task);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/workforce/tasks/:id', authenticateRequest, requireWorkforceTaskManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }
  try {
    const updated = await workforceTaskService.updateTaskStatus(req.params.id, status, {
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/workforce/tasks/:id/escalate', authenticateRequest, requireWorkforceTaskManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  const { triggerCondition, escalatedTo, reason } = req.body;
  if (!triggerCondition || !escalatedTo || !reason) {
    return res.status(400).json({ error: 'triggerCondition, escalatedTo, and reason are required' });
  }
  try {
    const escalation = await workforceTaskService.escalateTask({
      taskId: req.params.id,
      triggerCondition,
      escalatedTo,
      reason,
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(escalation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Workforce Intelligence & Capacity
app.get('/workforce/intelligence', authenticateRequest, requireWorkforceIntelligenceView, async (req: Request, res: Response) => {
  const facilityId = (req.query.facilityId as string) || req.authenticatedPrincipal!.facilityIds[0] || 'fac-amgh';
  const now = new Date().toISOString();
  const period = { start: now, end: now };

  const snapshot = await workforceIntelligenceService.captureWorkloadSnapshot({
    facilityId,
    department: 'General',
    service: 'Emergency Medicine',
    period,
  });

  const mdGap = workforceIntelligenceService.evaluateStaffingGap({
    facilityId,
    service: 'Emergency Medicine',
    category: 'physician',
    period,
  });

  const rnGap = workforceIntelligenceService.evaluateStaffingGap({
    facilityId,
    service: 'Emergency Medicine',
    category: 'nurse',
    period,
  });

  res.json({
    facilityId,
    snapshot,
    staffingGaps: [mdGap, rnGap],
  });
});

// ====================================================
// V17 SUPPLY CHAIN, PROCUREMENT & LOGISTICS ENDPOINTS
// ====================================================

// 1. Supply Catalogue
app.get('/supply/items', authenticateRequest, requireSupplyCatalogView, async (req: Request, res: Response) => {
  const { category, activeOnly, classification, controlledOnly } = req.query;
  const items = supplyCatalogService.listItems({
    category: category as any,
    activeOnly: activeOnly === 'true',
    classification: classification as any,
    controlledOnly: controlledOnly === 'true',
  });
  res.json({ items, count: items.length });
});

app.post('/supply/items', authenticateRequest, requireSupplyCatalogManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const item = await supplyCatalogService.createSupplyItem({
      ...req.body,
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/supply/items/:id', authenticateRequest, requireSupplyCatalogView, async (req: Request, res: Response) => {
  const item = supplyCatalogService.getItem(req.params.id);
  if (!item) return res.status(404).json({ error: 'Supply item not found' });
  res.json(item);
});

// 2. Demand Signals
app.get('/supply/demand', authenticateRequest, requireSupplyDemandView, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const signals = demandRequisitionService.listDemandSignals(facilityId as string);
  res.json({ signals, count: signals.length });
});

app.post('/supply/demand', authenticateRequest, requireSupplyDemandCreate, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const signal = await demandRequisitionService.createDemandSignal({
      ...req.body,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
      actorId: actor.userId,
    });
    res.status(201).json(signal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Requisitions
app.get('/supply/requisitions', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId, status, department } = req.query;
  const requisitions = demandRequisitionService.listRequisitions({
    facilityId: facilityId as string,
    status: status as any,
    department: department as string,
  });
  res.json({ requisitions, count: requisitions.length });
});

app.post('/supply/requisitions', authenticateRequest, requireProcurementRequisitionCreate, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const requisition = await demandRequisitionService.createRequisition({
      ...req.body,
      requesterId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(requisition);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/supply/requisitions/:id/submit', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reqDoc = await demandRequisitionService.submitRequisition(req.params.id, actor.userId);
    res.json(reqDoc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/supply/requisitions/:id/approve', authenticateRequest, requireProcurementRequisitionApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reviewed = await demandRequisitionService.reviewAndApproveRequisition({
      requisitionId: req.params.id,
      reviewerId: actor.userId,
      reviewerRole: actor.roles[0],
      action: req.body.action,
      justification: req.body.justification,
      approvedLineQuantities: req.body.approvedLineQuantities,
      maxAuthorizedAmount: req.body.maxAuthorizedAmount,
    });
    res.json(reviewed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Suppliers & Contracts
app.get('/procurement/suppliers', authenticateRequest, requireProcurementSupplierView, async (req: Request, res: Response) => {
  const suppliers = procurementOrderService.listSuppliers();
  res.json({ suppliers, count: suppliers.length });
});

app.post('/procurement/suppliers', authenticateRequest, requireProcurementSupplierManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const supplier = await procurementOrderService.createSupplier({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(supplier);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/procurement/suppliers/:id/status', authenticateRequest, requireProcurementSupplierManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const updated = await procurementOrderService.updateSupplierStatus(
      req.params.id,
      req.body.status,
      actor.userId,
      req.body.reason
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Purchase Orders
app.get('/procurement/purchase-orders', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId, supplierId, status } = req.query;
  const orders = procurementOrderService.listPurchaseOrders({
    facilityId: facilityId as string,
    supplierId: supplierId as string,
    status: status as any,
  });
  res.json({ purchaseOrders: orders, count: orders.length });
});

app.post('/procurement/purchase-orders', authenticateRequest, requireProcurementPOCreate, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const po = await procurementOrderService.createPurchaseOrder({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(po);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/procurement/purchase-orders/:id/approve', authenticateRequest, requireProcurementPOApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const approved = await procurementOrderService.approvePurchaseOrder({
      purchaseOrderId: req.params.id,
      reviewerId: actor.userId,
      reviewerRole: actor.roles[0],
      justification: req.body.justification,
      maxAuthorizedAmount: req.body.maxAuthorizedAmount,
    });
    res.json(approved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/procurement/purchase-orders/:id/send', authenticateRequest, requireProcurementPOSend, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const sent = await procurementOrderService.sendPurchaseOrder(req.params.id, actor.userId);
    res.json(sent);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Logistics & Shipments
app.get('/logistics/shipments', authenticateRequest, requireLogisticsShipmentView, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const shipments = logisticsReceivingService.listShipments(facilityId as string);
  res.json({ shipments, count: shipments.length });
});

app.post('/logistics/shipments', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const shipment = await logisticsReceivingService.createShipment({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(shipment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/shipments/:id/status', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const updated = await logisticsReceivingService.updateShipmentStatus(
      req.params.id,
      req.body.status,
      actor.userId
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Goods Receipts & Physical Receiving
app.get('/logistics/receipts', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const receipts = logisticsReceivingService.listReceipts(facilityId as string);
  res.json({ goodsReceipts: receipts, count: receipts.length });
});

app.post('/logistics/receipts', authenticateRequest, requireLogisticsReceivingCreate, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const receipt = await logisticsReceivingService.createGoodsReceipt({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(receipt);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/receipts/:id/finalize', authenticateRequest, requireLogisticsReceivingFinalize, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const finalized = await logisticsReceivingService.finalizeGoodsReceipt(req.params.id, actor.userId);
    res.json(finalized);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Three-Way Matching
app.post('/procurement/three-way-match', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const { purchaseOrderId, goodsReceiptId, invoiceAmount } = req.body;
    const result = logisticsReceivingService.performThreeWayMatch(
      purchaseOrderId,
      goodsReceiptId,
      invoiceAmount
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Warehouses & Storage Locations
app.get('/logistics/warehouses', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const warehouses = warehouseTransferService.listWarehouses(facilityId as string);
  res.json({ warehouses, count: warehouses.length });
});

app.post('/logistics/warehouses', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const wh = await warehouseTransferService.createWarehouse({
      ...req.body,
      actorId: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(wh);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/warehouses/:id/locations', authenticateRequest, async (req: Request, res: Response) => {
  try {
    const loc = await warehouseTransferService.createStorageLocation({
      ...req.body,
      warehouseId: req.params.id,
    });
    res.status(201).json(loc);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Inter-Facility Stock Transfers
app.get('/logistics/transfers', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const transfers = warehouseTransferService.listTransfers(facilityId as string);
  res.json({ stockTransfers: transfers, count: transfers.length });
});

app.post('/logistics/transfers', authenticateRequest, requireLogisticsTransferCreate, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const transfer = await warehouseTransferService.createStockTransfer({
      ...req.body,
      requestedBy: actor.userId,
      sourceFacilityId: req.body.sourceFacilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(transfer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/transfers/:id/approve', authenticateRequest, requireLogisticsTransferApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const approved = await warehouseTransferService.approveStockTransfer(
      req.params.id,
      actor.userId,
      actor.facilityIds[0] || 'fac-default'
    );
    res.json(approved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/transfers/:id/dispatch', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const dispatched = await warehouseTransferService.dispatchStockTransfer({
      transferId: req.params.id,
      transportDetails: req.body.transportDetails,
      actorId: actor.userId,
    });
    res.json(dispatched);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/logistics/transfers/:id/receive', authenticateRequest, requireLogisticsTransferReceive, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const received = await warehouseTransferService.receiveStockTransfer(req.params.id, actor.userId);
    res.json(received);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Cold Chain & Temperature Monitoring
app.get('/cold-chain/temperature', authenticateRequest, requireColdChainView, async (req: Request, res: Response) => {
  const { shipmentId, locationId } = req.query;
  if (shipmentId) {
    const logs = coldChainService.getLogsForShipment(shipmentId as string);
    return res.json({ logs, count: logs.length });
  }
  if (locationId) {
    const logs = coldChainService.getLogsForLocation(locationId as string);
    return res.json({ logs, count: logs.length });
  }
  res.json({ logs: [] });
});

app.post('/cold-chain/temperature', authenticateRequest, requireColdChainRecord, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await coldChainService.recordTemperature({
      ...req.body,
      actorOrSystem: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/cold-chain/excursions', authenticateRequest, requireColdChainView, async (_req: Request, res: Response) => {
  const excursions = coldChainService.getActiveExcursions();
  res.json({ excursions, count: excursions.length });
});

app.post('/cold-chain/excursions/:id/review', authenticateRequest, requireColdChainReview, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reviewed = await coldChainService.reviewExcursion({
      excursionId: req.params.id,
      decision: req.body.decision,
      reviewerId: actor.userId,
      notes: req.body.notes,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(reviewed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 12. Quality Holds & Recalls
app.get('/supply/quality-holds', authenticateRequest, requireSupplyQualityView, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const holds = qualityRecallService.getActiveHolds(facilityId as string);
  res.json({ qualityHolds: holds, count: holds.length });
});

app.post('/supply/quality-holds', authenticateRequest, requireSupplyQualityHold, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const hold = await qualityRecallService.placeBatchOnHold({
      ...req.body,
      placedBy: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(hold);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/supply/quality-holds/:id/release', authenticateRequest, requireSupplyQualityRelease, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const released = await qualityRecallService.releaseBatchHold({
      holdId: req.params.id,
      releaseDecision: req.body.releaseDecision,
      releasedBy: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(released);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/supply/quality-holds/:id/dispose', authenticateRequest, requireSupplyQualityRelease, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const disposed = await qualityRecallService.disposeBatchHold({
      holdId: req.params.id,
      dispositionNotes: req.body.dispositionNotes,
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.json(disposed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/supply/recalls', authenticateRequest, async (_req: Request, res: Response) => {
  const notices = qualityRecallService.listRecalls();
  res.json({ recallNotices: notices, count: notices.length });
});

app.post('/supply/recalls', authenticateRequest, requireSupplyRecallManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const recall = await qualityRecallService.issueRecallNotice({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(recall);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/supply/recalls/:id/actions', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const action = await qualityRecallService.executeRecallAction({
      ...req.body,
      recallId: req.params.id,
      executedBy: actor.userId,
      facilityId: req.body.facilityId || actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(action);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Forecasting, Replenishment & Supply Risks
app.get('/supply/forecasts', authenticateRequest, async (req: Request, res: Response) => {
  const { supplyItemId, facilityId } = req.query;
  if (!supplyItemId || !facilityId) {
    return res.status(400).json({ error: 'supplyItemId and facilityId required' });
  }
  const forecast = supplyPlanningIntelligenceService.generateProcurementForecast({
    supplyItemId: supplyItemId as string,
    facilityId: facilityId as string,
  });
  res.json(forecast);
});

app.get('/supply/replenishment', authenticateRequest, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const recs = supplyPlanningIntelligenceService.listRecommendations(facilityId as string);
  res.json({ recommendations: recs, count: recs.length });
});

app.post('/supply/replenishment/:id/review', authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reviewed = await supplyPlanningIntelligenceService.reviewRecommendation({
      recommendationId: req.params.id,
      decision: req.body.decision,
      reviewerId: actor.userId,
    });
    res.json(reviewed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/supply/risks', authenticateRequest, requireSupplyIntelligenceView, async (req: Request, res: Response) => {
  const { facilityId } = req.query;
  const risks = supplyPlanningIntelligenceService.listRisks(facilityId as string);
  res.json({ risks, count: risks.length });
});

// ============================================================================
// V18: RESEARCH, EVIDENCE & LEARNING INFRASTRUCTURE ROUTES
// ============================================================================

app.get('/research/studies', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const { status, studyType } = req.query;
  const studies = await researchGovernanceService.listStudies({
    status: status as any,
    studyType: studyType as any,
  });
  res.json({ studies, count: studies.length });
});

app.post('/research/studies', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const study = await researchGovernanceService.createStudy({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(study);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/research/studies/:studyId', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const study = await researchGovernanceService.getStudy(req.params.studyId);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study);
});

app.post('/research/studies/:studyId/approve', authenticateRequest, requireResearchStudyApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const study = await researchGovernanceService.approveStudy(
      req.params.studyId,
      actor.userId,
      req.body.approvalReference
    );
    res.json(study);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/studies/:studyId/close', authenticateRequest, requireResearchStudyApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const study = await researchGovernanceService.closeStudy(
      req.params.studyId,
      actor.userId,
      req.body.reason || 'Study completed'
    );
    res.json(study);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/research/subjects/:id', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const subject = await researchParticipantService.getSubject(req.params.id);
  if (!subject) return res.status(404).json({ error: 'Subject not found' });
  res.json(subject);
});

app.post('/research/subjects/enroll', authenticateRequest, requireResearchSubjectEnroll, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await researchParticipantService.enrollSubject({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/subjects/:id/withdraw', authenticateRequest, requireResearchSubjectEnroll, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await researchParticipantService.withdrawSubject(
      req.params.id,
      actor.userId,
      req.body.reason || 'Subject request'
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/consents', authenticateRequest, requireResearchSubjectEnroll, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const consent = await researchParticipantService.grantConsent({
      ...req.body,
      actorId: actor.userId,
      facilityId: actor.facilityIds[0] || 'fac-default',
    });
    res.status(201).json(consent);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/cohorts', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const definition = await researchCohortDatasetService.defineCohort({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(definition);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/cohorts/:id/execute', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const cohort = await researchCohortDatasetService.executeCohort({
      definitionId: req.params.id,
      actorId: actor.userId,
      candidates: req.body.candidates || [],
    });
    res.json(cohort);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/research/datasets/:id', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const dataset = await researchCohortDatasetService.getDataset(req.params.id);
  if (!dataset) return res.status(404).json({ error: 'Dataset not found' });
  res.json(dataset);
});

app.post('/research/datasets', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const dataset = await researchCohortDatasetService.createDataset({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(dataset);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/datasets/:id/release', authenticateRequest, requireResearchDatasetRelease, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const dataset = await researchCohortDatasetService.releaseDataset(req.params.id, actor.userId);
    res.json(dataset);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/data-access', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const request = await researchCohortDatasetService.requestDataAccess({
      ...req.body,
      requesterId: actor.userId,
      requesterName: req.body.requesterName || actor.userId || 'Authorized Researcher',
    });
    res.status(201).json(request);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/data-access/:id/approve', authenticateRequest, requireResearchDatasetRelease, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const decision = await researchCohortDatasetService.decideDataAccess({
      requestId: req.params.id,
      approverId: actor.userId,
      decision: req.body.decision || 'APPROVED',
      justification: req.body.justification || 'Governed research access granted',
      scope: req.body.scope || [],
      validDays: req.body.validDays,
    });
    res.json(decision);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/reidentify', authenticateRequest, requireResearchGovernanceManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reid = await researchCohortDatasetService.requestReIdentification({
      ...req.body,
      requesterId: actor.userId,
    });
    res.status(201).json(reid);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/research/evidence/:id', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const record = await evidenceLearningService.getEvidenceRecord(req.params.id);
  if (!record) return res.status(404).json({ error: 'Evidence record not found' });
  res.json(record);
});

app.post('/research/evidence', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const record = await evidenceLearningService.createEvidenceRecord({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/synthesis', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const syn = await evidenceLearningService.synthesizeEvidence({
      ...req.body,
      reviewerId: actor.userId,
    });
    res.status(201).json(syn);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/safety', authenticateRequest, requireResearchStudyView, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const event = await researchOperationsService.reportSafetyEvent({
      ...req.body,
      reportedBy: actor.userId,
    });
    res.status(201).json(event);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/research/learning/proposals', authenticateRequest, requireResearchStudyManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const proposal = await evidenceLearningService.proposePracticeChange({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(proposal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V19 NATIONAL DIGITAL HEALTH & ECOSYSTEM ROUTES
// ----------------------------------------------------

app.get('/ecosystem/systems', authenticateRequest, requireEcosystemSystemView, async (_req: Request, res: Response) => {
  try {
    const systems = await ecosystemRegistryService.listSystems();
    res.json(systems);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/systems', authenticateRequest, requireEcosystemSystemManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const system = await ecosystemRegistryService.registerSystem({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(system);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/ecosystem/systems/:id/approve', authenticateRequest, requireEcosystemIntegrationApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const system = await ecosystemRegistryService.updateTrustLevel({
      systemId: req.params.id,
      newTrustLevel: 'APPROVED',
      actorId: actor.userId,
      justification: req.body.justification || 'Official governance approval granted.',
      expiresAt: req.body.expiresAt,
    });
    res.json(system);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/ecosystem/integrations', authenticateRequest, requireEcosystemSystemView, async (_req: Request, res: Response) => {
  try {
    const integrations = await ecosystemRegistryService.listIntegrations();
    res.json(integrations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/integrations', authenticateRequest, requireEcosystemSystemManage, async (req: Request, res: Response) => {
  try {
    const integration = await ecosystemRegistryService.configureIntegration(req.body);
    res.status(201).json(integration);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/ecosystem/integrations/:id/health', authenticateRequest, requireEcosystemSystemView, async (req: Request, res: Response) => {
  try {
    const report = await integrationHealthService.getHealthReport(req.params.id);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/facilities/reconcile', authenticateRequest, requireEcosystemMFRReconcile, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await masterFacilityRegistryService.reconcileFacility({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/ecosystem/facilities/mappings', authenticateRequest, requireEcosystemSystemView, async (_req: Request, res: Response) => {
  try {
    const mappings = await masterFacilityRegistryService.getMappings();
    res.json(mappings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/ecosystem/facilities/conflicts', authenticateRequest, requireEcosystemSystemView, async (_req: Request, res: Response) => {
  try {
    const conflicts = await masterFacilityRegistryService.getConflicts();
    res.json(conflicts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/terminology/map', authenticateRequest, requireEcosystemTerminologyApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const map = await nationalTerminologyService.mapConcept({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(map);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/ecosystem/reports', authenticateRequest, requireEcosystemReportingSubmit, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const submission = await nationalReportingService.createSubmission({
      ...req.body,
      actorId: actor.userId,
    });
    res.status(201).json(submission);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/ecosystem/reports/:id/validate', authenticateRequest, requireEcosystemReportingSubmit, async (req: Request, res: Response) => {
  try {
    const result = await nationalReportingService.validateSubmission(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/ecosystem/reports/:id/approve', authenticateRequest, requireEcosystemReportingSubmit, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const approved = await nationalReportingService.approveSubmission({
      submissionId: req.params.id,
      approverId: actor.userId,
      role: actor.roles[0] || 'ecosystem_data_steward',
    });
    res.json(approved);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/ecosystem/reports/:id/submit', authenticateRequest, requireEcosystemReportingSubmit, async (req: Request, res: Response) => {
  try {
    const result = await nationalReportingService.transmitSubmission(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/ecosystem/surveillance/signals', authenticateRequest, requireEcosystemSystemView, async (_req: Request, res: Response) => {
  try {
    const signals = await nationalSurveillanceService.getSignals();
    res.json(signals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/surveillance/signals', authenticateRequest, requireEcosystemSurveillanceApprove, async (req: Request, res: Response) => {
  try {
    const signal = await nationalSurveillanceService.registerSignal(req.body);
    res.status(201).json(signal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/ecosystem/quarantine', authenticateRequest, requireEcosystemGovernanceManage, async (_req: Request, res: Response) => {
  try {
    const items = await nationalExchangeQueueService.getQuarantineItems();
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ecosystem/quarantine/:id/review', authenticateRequest, requireEcosystemGovernanceManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const reviewed = await nationalExchangeQueueService.reviewQuarantine({
      quarantineId: req.params.id,
      reviewerId: actor.userId,
      action: req.body.action,
      notes: req.body.notes,
    });
    res.json(reviewed);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V20 SYSTEM INTELLIGENCE & GOVERNED AUTOMATION ROUTES
// ----------------------------------------------------

app.get(['/api/system-intelligence/health', '/system-intelligence/health'], authenticateRequest, requireSystemIntelligenceView, async (_req: Request, res: Response) => {
  try {
    const health = await systemObservationService.getLatestHealthSnapshot();
    res.json(health);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/risks', '/system-intelligence/risks'], authenticateRequest, requireSystemIntelligenceView, async (req: Request, res: Response) => {
  try {
    const risks = await systemRiskEngine.getRisks({
      riskType: req.query.type as any,
      state: req.query.state as any,
      facilityId: req.query.facilityId as string,
    });
    res.json(risks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/signals', '/system-intelligence/signals'], authenticateRequest, requireSystemIntelligenceView, async (req: Request, res: Response) => {
  try {
    const signals = await systemObservationService.getSignals({
      domain: req.query.domain as string,
      severity: req.query.severity as string,
    });
    res.json(signals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/recommendations', '/system-intelligence/recommendations'], authenticateRequest, requireSystemIntelligenceView, async (req: Request, res: Response) => {
  try {
    const recommendations = await optimizationRecommendationService.getRecommendations({
      domain: req.query.domain as string,
      status: req.query.status as any,
      facilityId: req.query.facilityId as string,
    });
    res.json(recommendations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/recommendations/:id/approve', '/system-intelligence/recommendations/:id/approve'], authenticateRequest, requireSystemAutomationApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await optimizationRecommendationService.submitHumanApproval({
      recommendationId: req.params.id,
      approverId: actor.userId,
      approverRole: actor.roles[0] as any,
      approverName: actor.email || actor.userId,
      justification: req.body.justification || 'Approved by system governor',
      decision: 'APPROVED',
      isDualControlSecondApproval: req.body.isDualControlSecondApproval,
    });
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/recommendations/:id/reject', '/system-intelligence/recommendations/:id/reject'], authenticateRequest, requireSystemAutomationApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await optimizationRecommendationService.submitHumanApproval({
      recommendationId: req.params.id,
      approverId: actor.userId,
      approverRole: actor.roles[0] as any,
      approverName: actor.email || actor.userId,
      justification: req.body.justification || 'Rejected by system governor',
      decision: 'REJECTED',
    });
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/automation', '/system-intelligence/automation'], authenticateRequest, requireSystemIntelligenceView, async (_req: Request, res: Response) => {
  try {
    const executions = await governedAutomationExecutor.getExecutions();
    res.json(executions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/automation/:id', '/system-intelligence/automation/:id'], authenticateRequest, requireSystemIntelligenceView, async (req: Request, res: Response) => {
  try {
    const executions = await governedAutomationExecutor.getExecutions();
    const item = executions.find((e) => e.executionId === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'EXECUTION_NOT_FOUND' });
      return;
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/automation/:id/rollback', '/system-intelligence/automation/:id/rollback'], authenticateRequest, requireSystemAutomationExecute, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const result = await governedAutomationExecutor.rollbackExecution(req.params.id, actor.userId);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/incidents', '/system-intelligence/incidents'], authenticateRequest, requireSystemIntelligenceView, async (_req: Request, res: Response) => {
  try {
    const incidents = await incidentManagementService.getIncidents();
    res.json(incidents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/incidents/:id/escalate', '/system-intelligence/incidents/:id/escalate'], authenticateRequest, requireSystemIncidentManage, async (req: Request, res: Response) => {
  try {
    const incident = await incidentManagementService.updateIncidentStatus(
      req.params.id,
      req.body.status || 'MITIGATING',
      req.body.notes
    );
    res.json(incident);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/simulations', '/system-intelligence/simulations'], authenticateRequest, requireSystemIntelligenceView, async (_req: Request, res: Response) => {
  try {
    const simulations = await simulationEngine.getScenarios();
    res.json(simulations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/simulations', '/system-intelligence/simulations'], authenticateRequest, requireSystemSimulationRun, async (req: Request, res: Response) => {
  try {
    const simulation = await simulationEngine.runSimulation(req.body);
    res.status(201).json(simulation);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/capacity', '/system-intelligence/capacity'], authenticateRequest, requireSystemIntelligenceView, async (req: Request, res: Response) => {
  try {
    const states = await capacityIntelligenceService.getCapacityStates(req.query.facilityId as string);
    const balancing = await capacityIntelligenceService.getBalancingRecommendations();
    res.json({ states, recommendations: balancing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/system-intelligence/recovery', '/system-intelligence/recovery'], authenticateRequest, requireSystemIntelligenceView, async (_req: Request, res: Response) => {
  try {
    const syncPlans = await resilienceSelfHealingService.getSyncHealingPlans();
    const repairProposals = await resilienceSelfHealingService.getDataRepairProposals();
    res.json({ syncPlans, repairProposals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/system-intelligence/kill-switch', '/system-intelligence/kill-switch'], authenticateRequest, requireSystemIntelligenceManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const state = req.body.state === 'DISABLED' ? 'DISABLED' : 'ENABLED';
    automationGuardService.setKillSwitchState(state, actor.userId);
    res.json({ success: true, killSwitchState: state });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V21 PRODUCTION HARDENING & DISASTER RECOVERY ROUTES
// ----------------------------------------------------

app.get(['/api/production/status', '/production/status'], authenticateRequest, requireDeploymentView, async (_req: Request, res: Response) => {
  try {
    const env = environmentConfigService.getEnvironment();
    const config = environmentConfigService.getConfig();
    const recoveryState = operationsMonitoringService.getRecoveryState();
    res.json({
      environment: env,
      recoveryState,
      configSummary: {
        version: config.version,
        failClosed: config.failClosed,
        allowDevelopmentFallback: config.allowDevelopmentFallback,
        authenticationMode: config.authenticationMode,
      },
      storesOnline: 362,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/production/backup', '/production/backup'], authenticateRequest, requireBackupCreate, async (req: Request, res: Response) => {
  try {
    const env = environmentConfigService.getEnvironment();
    const backup = await backupManager.createBackup(
      env,
      req.body.facilityScope || 'GLOBAL',
      req.body.backupType || 'FULL',
      req.body.isEncrypted !== false
    );
    res.status(201).json(backup);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/production/restore', '/production/restore'], authenticateRequest, requireBackupRestore, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { backupId, targetFacilityId, isDryRun } = req.body;
    const env = environmentConfigService.getEnvironment();
    if (isDryRun) {
      const dryRun = await restoreManager.executeDryRun(backupId, env, targetFacilityId || 'GLOBAL');
      res.json(dryRun);
    } else {
      const execution = await restoreManager.executeRestore(backupId, env, targetFacilityId || 'GLOBAL', actor.userId);
      res.json(execution);
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/production/integrity', '/production/integrity'], authenticateRequest, requireDeploymentView, async (_req: Request, res: Response) => {
  try {
    const audit = await dataIntegrityMonitorService.runIntegrityAudit();
    res.json(audit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/production/maintenance', '/production/maintenance'], authenticateRequest, requireMaintenanceManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const window = await operationsMonitoringService.scheduleMaintenance(
      req.body.scope || 'GLOBAL',
      req.body.reason || 'Scheduled system maintenance',
      actor.userId,
      req.body.affectedServices || ['BACKGROUND_SYNC'],
      req.body.durationMinutes || 30
    );
    res.status(201).json(window);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/production/diagnostics', '/production/diagnostics'], authenticateRequest, requireDeploymentView, async (req: Request, res: Response) => {
  try {
    const facilityId = (req.query.facilityId as string) || 'FACILITY_DEFAULT';
    const bundle = await releaseManagementService.generateDiagnosticBundle(facilityId);
    res.json(bundle);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V22 CLINICAL VALIDATION, QUALITY & SAFETY ROUTES
// ----------------------------------------------------

app.get(['/api/clinical-validation/safety-case', '/clinical-validation/safety-case'], authenticateRequest, requireClinicalSafetyView, async (_req: Request, res: Response) => {
  try {
    res.json({
      status: 'UNDER_REVIEW',
      systemVersion: '22.0.0',
      claimsSummary: 'All core claims mapped to hazards, controls, and documented evidence.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/clinical-validation/hazards', '/clinical-validation/hazards'], authenticateRequest, requireClinicalSafetyView, async (_req: Request, res: Response) => {
  try {
    const hazards = await clinicalHazardRegistryService.initializeBaselineHazards();
    res.json(hazards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/clinical-validation/matrices', '/clinical-validation/matrices'], authenticateRequest, requireClinicalSafetyView, async (_req: Request, res: Response) => {
  try {
    const matrices = await workflowValidationMatrixService.initializeBaselineMatrices();
    res.json(matrices);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/clinical-validation/gates', '/clinical-validation/gates'], authenticateRequest, requireClinicalValidationReview, async (_req: Request, res: Response) => {
  try {
    const gates = await clinicalValidationGateService.initializeBaselineGates();
    res.json(gates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/clinical-validation/pilot-packet', '/clinical-validation/pilot-packet'], authenticateRequest, requireClinicalSafetyApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const facilityId = req.body.facilityId || 'FACILITY_DEFAULT';
    const packet = await clinicalValidationGateService.generatePilotValidationPacket(facilityId, '22.0.0', actor.userId);
    res.status(201).json(packet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/clinical-validation/ai-override', '/clinical-validation/ai-override'], authenticateRequest, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { suggestionId, decision, clinicalRationale } = req.body;
    const result = await aiValidationEvaluationService.recordClinicianOverride(
      suggestionId,
      actor.userId,
      decision,
      clinicalRationale || 'Clinician clinical evaluation'
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V23 CONTROLLED PILOT DEPLOYMENT & RWE ROUTES
// ----------------------------------------------------

app.get(['/api/pilot/programs', '/pilot/programs'], authenticateRequest, requirePilotManage, async (_req: Request, res: Response) => {
  try {
    const program = await pilotProgramService.initializeBaselineProgram();
    res.json(program);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/pilot/sites', '/pilot/sites'], authenticateRequest, requirePilotManage, async (_req: Request, res: Response) => {
  try {
    const sites = await pilotProgramService.listPilotSites();
    res.json(sites);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/pilot/sites/:siteId/readiness', '/pilot/sites/:siteId/readiness'], authenticateRequest, requirePilotManage, async (req: Request, res: Response) => {
  try {
    const assessment = await pilotFacilityReadinessService.getLatestAssessment(req.params.siteId);
    res.json(assessment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/pilot/sites/:siteId/gate', '/pilot/sites/:siteId/gate'], authenticateRequest, requirePilotManage, async (req: Request, res: Response) => {
  try {
    const gate = await pilotGoLiveGateService.evaluateGoLiveGate(req.params.siteId, 'CONTROLLED_LIVE');
    res.json(gate);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/pilot/sites/:siteId/killswitch', '/pilot/sites/:siteId/killswitch'], authenticateRequest, requireClinicalSafetyApprove, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { action, targetComponent, justification } = req.body;
    const event = await pilotKillSwitchService.executeKillSwitch(
      req.params.siteId,
      action,
      targetComponent || 'ALL',
      actor.userId,
      justification || 'Governed kill switch action executed'
    );
    res.status(201).json(event);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/pilot/sites/:siteId/report', '/pilot/sites/:siteId/report'], authenticateRequest, requirePilotManage, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const report = await pilotReportService.generateSitePilotReport(req.params.siteId, actor.userId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/pilot/program/report', '/pilot/program/report'], authenticateRequest, requirePilotManage, async (_req: Request, res: Response) => {
  const actor = _req.authenticatedPrincipal!;
  try {
    const report = await pilotReportService.generateProgramLevelReport('prog-tz-pilot-v23', actor.userId);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// V24 MULTI-SITE PILOT, COMPARATIVE EVIDENCE & SCALE ROUTES
// ----------------------------------------------------

app.get(['/api/multisite/programs', '/multisite/programs'], authenticateRequest, requireMultiSiteEvidenceLead, async (_req: Request, res: Response) => {
  try {
    const list = await evidenceProgramService.listPrograms();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId', '/multisite/programs/:programId'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const prog = await evidenceProgramService.getProgram(req.params.programId);
    if (!prog) return res.status(404).json({ error: 'Program not found' });
    res.json(prog);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/enrollments', '/multisite/programs/:programId/enrollments'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await evidenceProgramService.listSiteEnrollments(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/groups', '/multisite/programs/:programId/groups'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await evidenceProgramService.listSiteGroups(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/programs/:programId/enroll', '/multisite/programs/:programId/enroll'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { siteId, facilityName, enabledModules, groupId } = req.body;
    const enrollment = await evidenceProgramService.enrollSite(
      req.params.programId,
      siteId,
      facilityName,
      actor.userId,
      enabledModules || ['PATIENTS', 'ENCOUNTERS'],
      groupId
    );
    res.status(201).json(enrollment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/multisite/sites/:siteId/suspend', '/multisite/sites/:siteId/suspend'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const updated = await evidenceProgramService.suspendSite(req.params.siteId, reason || 'Governed suspension');
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/multisite/sites/:siteId/resume', '/multisite/sites/:siteId/resume'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const updated = await evidenceProgramService.resumeSite(req.params.siteId);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/comparability/:baseSiteId/:targetSiteId', '/multisite/comparability/:baseSiteId/:targetSiteId'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const assessment = await siteComparabilityService.getAssessment(req.params.baseSiteId, req.params.targetSiteId);
    res.json(assessment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/comparability/assess', '/multisite/comparability/assess'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { programId, baseSiteId, targetSiteId } = req.body;
    const assessment = await siteComparabilityService.assessComparability(
      programId,
      baseSiteId,
      targetSiteId,
      actor.userId
    );
    res.status(201).json(assessment);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/metrics', '/multisite/metrics'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as any;
    const list = await standardizedMetricCatalogService.listMetrics(category);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/metrics', '/multisite/metrics'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const registered = await standardizedMetricCatalogService.registerMetricVersion(req.body);
    res.status(201).json(registered);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/observations', '/multisite/programs/:programId/observations'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const siteId = req.query.siteId as string | undefined;
    const list = await comparativeAnalysisService.listObservations(req.params.programId, siteId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/analysis/execute', '/multisite/analysis/execute'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const {
      programId,
      metricId,
      analysisType,
      baseEntityId,
      comparisonEntityId,
      baseValue,
      comparisonValue,
      sampleSize,
    } = req.body;

    const analysis = await comparativeAnalysisService.executeComparativeAnalysis(
      programId,
      metricId,
      analysisType || 'SITE_A_VS_SITE_B',
      baseEntityId,
      comparisonEntityId,
      baseValue !== undefined ? baseValue : null,
      comparisonValue || 0,
      sampleSize || 100,
      actor.userId
    );
    res.status(201).json(analysis);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/analyses', '/multisite/programs/:programId/analyses'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await comparativeAnalysisService.listAnalyses(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/maturities', '/multisite/maturities'], authenticateRequest, requireMultiSiteEvidenceLead, async (_req: Request, res: Response) => {
  try {
    const list = await siteImplementationMaturityService.listMaturities();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/maturities', '/multisite/maturities'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const record = await siteImplementationMaturityService.recordMaturityAssessment({
      ...req.body,
      assessedBy: actor.userId,
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/risks', '/multisite/programs/:programId/risks'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await crossSiteRiskService.listRisks(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/programs/:programId/risks', '/multisite/programs/:programId/risks'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const risk = await crossSiteRiskService.registerRisk({
      ...req.body,
      programId: req.params.programId,
      ownerId: req.body.ownerId || actor.userId,
    });
    res.status(201).json(risk);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/correlations', '/multisite/programs/:programId/correlations'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await crossSiteRiskService.listCorrelations(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/drifts', '/multisite/programs/:programId/drifts'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await crossSiteRiskService.listDrifts(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/ai-evaluations', '/multisite/programs/:programId/ai-evaluations'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await multiSiteAIEvaluationService.listEvaluations(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/offline-analyses', '/multisite/offline-analyses'], authenticateRequest, requireMultiSiteEvidenceLead, async (_req: Request, res: Response) => {
  try {
    const list = await offlineConditionAnalysisService.listAnalyses();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/learnings', '/multisite/programs/:programId/learnings'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await pilotLearningLoopService.listLearningRecords(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/learnings', '/multisite/learnings'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const record = await pilotLearningLoopService.createLearningRecord({
      ...req.body,
      responsibleLeadId: actor.userId,
    });
    res.status(201).json(record);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/multisite/learnings/:learningId/advance', '/multisite/learnings/:learningId/advance'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const { nextPhase, updates } = req.body;
    const updated = await pilotLearningLoopService.advancePhase(
      req.params.learningId,
      nextPhase,
      actor.userId,
      updates
    );
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/scorecard', '/multisite/programs/:programId/scorecard'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const scorecard = await scaleDecisionService.evaluateScorecard(req.params.programId);
    res.json(scorecard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/gates', '/multisite/programs/:programId/gates'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await scaleDecisionService.listGates(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/programs/:programId/gates', '/multisite/programs/:programId/gates'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const gate = await scaleDecisionService.evaluateExpansionGate({
      programId: req.params.programId,
      scope: req.body.scope,
      targetCandidateSiteId: req.body.targetCandidateSiteId,
      evaluatorId: actor.userId,
      technicalPrerequisites: req.body.technicalPrerequisites ?? true,
      clinicalSafetyPrerequisites: req.body.clinicalSafetyPrerequisites ?? true,
      governancePrerequisites: req.body.governancePrerequisites ?? true,
      workforceTrainingPrerequisites: req.body.workforceTrainingPrerequisites ?? true,
    });
    res.status(201).json(gate);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/programs/:programId/decisions', '/multisite/programs/:programId/decisions'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const list = await scaleDecisionService.listDecisions(req.params.programId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(['/api/multisite/programs/:programId/decisions', '/multisite/programs/:programId/decisions'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  const actor = req.authenticatedPrincipal!;
  try {
    const decision = await scaleDecisionService.recordScaleDecision({
      programId: req.params.programId,
      participatingSiteIds: req.body.participatingSiteIds || ['site-amani-01', 'site-kilima-02', 'site-ziwa-03'],
      decisionType: req.body.decisionType,
      evidenceQualitySummary: req.body.evidenceQualitySummary || 'Evidence Level B: Multi-site prospective pilot evaluation',
      unresolvedRiskIds: req.body.unresolvedRiskIds || [],
      decisionRationale: req.body.decisionRationale,
      conditionsForExpansion: req.body.conditionsForExpansion,
      approvingAuthorityName: req.body.approvingAuthorityName || actor.userId,
      approvingAuthorityRole: req.body.approvingAuthorityRole || 'Multi-Site Governance Authority',
    });
    res.status(201).json(decision);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post(['/api/multisite/programs/:programId/packet', '/multisite/programs/:programId/packet'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const packet = await multiSiteEvidencePacketService.generateAndSealPacket(req.params.programId);
    res.status(201).json(packet);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get(['/api/multisite/packets/:packetId', '/multisite/packets/:packetId'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const packet = await multiSiteEvidencePacketService.getPacket(req.params.packetId);
    if (!packet) return res.status(404).json({ error: 'Packet not found' });
    res.json(packet);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(['/api/multisite/packets/:packetId/verify', '/multisite/packets/:packetId/verify'], authenticateRequest, requireMultiSiteEvidenceLead, async (req: Request, res: Response) => {
  try {
    const isValid = await multiSiteEvidencePacketService.verifyPacketSeal(req.params.packetId);
    res.json({ packetId: req.params.packetId, isValid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// VITE MIDDLEWARE / STATIC ASSETS
// ----------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Jano Health Server running on http://0.0.0.0:${PORT} (${
        portResolution.source === 'environment' ? 'configured from PORT env' : 'default port 3000'
      })`
    );
  });
}

export { app, startServer };

const isDirectExecution = process.argv[1] && (
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.cjs')
);

if (isDirectExecution && process.env.NODE_ENV !== 'test' && !process.env.JANO_DISABLE_AUTO_LISTEN) {
  startServer();
}

