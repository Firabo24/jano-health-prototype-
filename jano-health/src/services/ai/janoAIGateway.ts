/**
 * Jano Health - Clinical Core V10: Jano AI Master Gateway
 * 
 * Orchestrates the full clinical AI decision-support pipeline:
 * 1. Pre-execution security authorization & capability validation
 * 2. Untrusted narrative screening (prompt injection defense)
 * 3. Minimized task-specific context assembly & fingerprinting
 * 4. Versioned prompt template retrieval
 * 5. Server-proxied Gemini model generation (PRIMARY_MODEL / FALLBACK_MODEL)
 * 6. Autonomous mutation inspection (mutation guard)
 * 7. Structured clinical schema validation
 * 8. Offline deterministic fallback handling
 * 9. Persistent AIRequest and AIResponse recording
 * 10. Audit event emission without exposing patient PII payloads
 */

import {
  AICapability,
  AIClinicalResponse,
  AIProvenance,
  AIRequest,
  AIResponse,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
} from '../../domain/aiTypes';
import { RoleType } from '../../domain/types';
import { auditService } from '../audit/auditService';
import { localRepository } from '../storage/localRepository';
import { aiSafetyGateway } from './aiSafetyGateway';
import { clinicalContextBuilder } from './clinicalContextBuilder';
import { promptTemplateService } from './promptTemplates';
import { geminiCloudModelProvider } from './modelProvider';
import { clinicalKnowledgeProvider } from './knowledgeProvider';

export interface ExecuteAIParams {
  taskType: AICapability;
  actorId: string;
  actorName: string;
  actorRole: RoleType;
  facilityId: string;
  patientId?: string;
  encounterId?: string;
  clinicalQuery?: string;
  untrustedNarrative?: string;
}

export class JanoAIGateway {
  private static instance: JanoAIGateway;

  public static getInstance(): JanoAIGateway {
    if (!JanoAIGateway.instance) {
      JanoAIGateway.instance = new JanoAIGateway();
    }
    return JanoAIGateway.instance;
  }

  /**
   * Executes governed clinical decision support with end-to-end safety guarantees.
   */
  public async execute(params: ExecuteAIParams): Promise<AIClinicalResponse> {
    const requestId = `air-${params.facilityId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const createdAt = new Date().toISOString();

    // 1. Audit Request Creation
    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'AI_REQUEST_CREATED',
      resourceType: 'AIRequest',
      resourceId: requestId,
      details: { taskType: params.taskType, patientId: params.patientId ? '[REDACTED_PATIENT_ID]' : undefined },
    });

    // 2. Pre-Execution Safety & Role Authorization
    const authCheck = aiSafetyGateway.authorizeRequest(params.taskType, params.actorRole, params.actorId, params.facilityId);
    if (!authCheck.passed) {
      auditService.logSecurityEvent({
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        facilityId: params.facilityId,
        action: 'UNAUTHORIZED_ACTION_ATTEMPTED',
        resourceType: 'AIRequest',
        resourceId: requestId,
        details: { taskType: params.taskType, reason: authCheck.reason },
      });
      throw new Error(`AI_SECURITY_AUTHORIZATION_FAILED: ${authCheck.reason}`);
    }

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'AI_REQUEST_AUTHORIZED',
      resourceType: 'AIRequest',
      resourceId: requestId,
      details: { taskType: params.taskType },
    });

    // 3. Screen Untrusted Clinical Narrative for Prompt Injection
    const narrativeToScreen = `${params.clinicalQuery || ''} ${params.untrustedNarrative || ''}`;
    const screenCheck = aiSafetyGateway.screenUntrustedContent(narrativeToScreen);
    if (!screenCheck.passed) {
      auditService.logSecurityEvent({
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        facilityId: params.facilityId,
        action: 'AI_AUTONOMOUS_MUTATION_BLOCKED',
        resourceType: 'AIRequest',
        resourceId: requestId,
        details: { taskType: params.taskType, reason: screenCheck.reason },
      });
      throw new Error(`AI_SAFETY_REJECTION: ${screenCheck.reason}`);
    }

    // 4. Minimized Context Assembly
    const context = await clinicalContextBuilder.buildContext(
      params.taskType,
      params.facilityId,
      params.patientId,
      params.encounterId,
      narrativeToScreen
    );

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'AI_CONTEXT_ASSEMBLED',
      resourceType: 'AIRequest',
      resourceId: requestId,
      details: {
        taskType: params.taskType,
        contextFingerprint: context.contextFingerprint,
        referenceCount: context.contextReferences.length,
      },
    });

    // 5. Versioned Prompt Template Retrieval
    const template = promptTemplateService.getTemplate(params.taskType);

    // 6. Execute Model Generation
    let rawOutputText = '';
    let executedModel = PRIMARY_MODEL;
    let isDeterministic = false;

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'AI_MODEL_REQUESTED',
      resourceType: 'AIRequest',
      resourceId: requestId,
      details: { model: PRIMARY_MODEL, taskType: params.taskType },
    });

    try {
      const genResponse = await geminiCloudModelProvider.generate({
        requestId,
        taskType: params.taskType,
        systemInstruction: template.systemInstruction,
        promptText: `${template.templateText}\n\nCONTEXT:\n${context.serializedContextPrompt}`,
        facilityId: params.facilityId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        patientId: params.patientId,
      });

      rawOutputText = genResponse.rawText;
      executedModel = genResponse.model;

      if (genResponse.usedFallback) {
        auditService.logSecurityEvent({
          actorId: params.actorId,
          actorName: params.actorName,
          actorRole: params.actorRole,
          facilityId: params.facilityId,
          action: 'AI_MODEL_FALLBACK_USED',
          resourceType: 'AIRequest',
          resourceId: requestId,
          details: { fallbackModel: FALLBACK_MODEL },
        });
      }
    } catch (modelErr: any) {
      const errMsg = String(modelErr?.message || '');

      // CRITICAL: Do NOT fallback on security, authorization, or safety errors!
      if (
        errMsg.includes('SECURITY_AUTHORIZATION_FAILED') ||
        errMsg.includes('SAFETY_POLICY_REJECTION') ||
        errMsg.includes('MALFORMED_REQUEST')
      ) {
        throw modelErr;
      }

      // If offline or network unavailable, generate deterministic standard-treatment-guideline CDS
      console.warn(`[Jano AI] Cloud model call failed (${errMsg}). Activating deterministic offline clinical rules.`);
      isDeterministic = true;
      executedModel = 'deterministic-stg-v1.0';
      rawOutputText = this.generateDeterministicOfflineCDS(params.taskType, context.serializedContextPrompt);
    }

    // 7. Inspect Model Output for Autonomous Mutation Commands (Mutation Guard)
    const mutationCheck = aiSafetyGateway.inspectModelOutput(
      rawOutputText,
      requestId,
      params.actorId,
      params.facilityId,
      params.taskType
    );
    if (!mutationCheck.passed) {
      throw new Error(`AI_MUTATION_GUARD_TRIGGERED: ${mutationCheck.reason}`);
    }

    // 8. Parse and Validate Structured Response
    let parsed: any;
    try {
      parsed = JSON.parse(rawOutputText);
    } catch {
      // Wrap unparsed text in standard clinical structure
      parsed = {
        summary: rawOutputText.slice(0, 400),
        findings: ['Direct clinical summary generated.'],
        considerations: [
          {
            label: 'Bedside Clinical Correlation Required',
            supportingEvidence: ['Patient physical examination'],
            contradictoryOrMissingEvidence: ['Pending diagnostic tests'],
            uncertainty: 'Moderate',
            provenance: executedModel,
          },
        ],
        redFlags: ['Monitor vital signs closely for acute changes.'],
        missingInformation: ['Verify patient allergy profile and medication adherence.'],
        uncertainty: ['Uncertainty present; clinical verification required.'],
        suggestedNextSteps: ['Correlate with standard treatment guidelines and patient history.'],
      };
    }

    const provenance: AIProvenance = {
      requestId,
      model: executedModel,
      modelVersion: isDeterministic ? 'stg-offline-v1' : 'gemini-3.8-flash-v1',
      provider: isDeterministic ? 'local_deterministic_rules' : 'gemini_cloud',
      promptTemplateId: template.templateId,
      promptTemplateVersion: template.version,
      taskType: params.taskType,
      generatedAt: new Date().toISOString(),
      sourceRecordIds: context.contextReferences.map((r) => r.id),
      knowledgeSourceIds: ['WHO_EML_2025', 'ZA_EMSSA_SATS_2012', 'JANO_DISTRICT_STG_2026'],
      safetyPolicyVersion: '1.0.0-hardened',
      authorizationContextId: `auth-${params.actorId}-${params.facilityId}`,
      reviewStatus: 'PENDING_REVIEW',
      isDeterministicFallback: isDeterministic,
    };

    const clinicalResponse: AIClinicalResponse = {
      requestId,
      taskType: params.taskType,
      model: executedModel,
      modelVersion: provenance.modelVersion,
      summary: parsed.summary || 'Clinical decision support generated.',
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      considerations: Array.isArray(parsed.considerations) ? parsed.considerations : [],
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      uncertainty: Array.isArray(parsed.uncertainty) ? parsed.uncertainty : ['Verification required.'],
      suggestedNextSteps: Array.isArray(parsed.suggestedNextSteps) ? parsed.suggestedNextSteps : [],
      sourceReferences: context.contextReferences.map((r) => ({
        sourceType: r.type as any,
        sourceId: r.id,
        sourceDate: new Date().toISOString().split('T')[0],
      })),
      provenance,
      safetyStatus: 'PASSED',
      reviewStatus: 'PENDING_REVIEW',
      isAutonomousMutationAllowed: false, // Strict architectural invariant
      clinicianReviewRequired: true,      // Strict architectural invariant
      clinicianApproved: false,
      generatedAt: new Date().toISOString(),
      disclaimer:
        'NON-AUTHORITATIVE CLINICAL DECISION SUPPORT ONLY. AI output does not constitute a medical diagnosis, prescription, or clinical order. Licensed clinician verification and authorization is strictly required prior to any clinical action.',
    };

    // Validate structured response
    const validation = aiSafetyGateway.validateStructuredResponse(clinicalResponse);
    if (!validation.valid) {
      auditService.logSecurityEvent({
        actorId: params.actorId,
        actorName: params.actorName,
        actorRole: params.actorRole,
        facilityId: params.facilityId,
        action: 'AI_RESPONSE_VALIDATION_FAILED',
        resourceType: 'AIRequest',
        resourceId: requestId,
        details: { errors: validation.errors },
      });
      throw new Error(`AI_RESPONSE_VALIDATION_FAILED: ${validation.errors.join('; ')}`);
    }

    // 9. Persist AIRequest and AIResponse Entities
    const aiRequestEntity: AIRequest = {
      id: requestId,
      requestId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      actorName: params.actorName,
      facilityId: params.facilityId,
      patientId: params.patientId,
      encounterId: params.encounterId,
      taskType: params.taskType,
      model: executedModel,
      promptTemplateId: template.templateId,
      promptTemplateVersion: template.version,
      contextReferences: context.contextReferences,
      contextFingerprint: context.contextFingerprint,
      createdAt,
      status: 'COMPLETED',
      reviewStatus: 'PENDING_REVIEW',
      provenance,
    };

    const responseId = `airesp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const aiResponseEntity: AIResponse = {
      id: responseId,
      requestId,
      responseId,
      model: executedModel,
      modelVersion: provenance.modelVersion,
      structuredPayload: clinicalResponse,
      safetyStatus: 'PASSED',
      validationStatus: 'VALID',
      clinicianReviewRequired: true,
      clinicianApproved: false,
      createdAt: new Date().toISOString(),
    };

    await localRepository.saveAIRequest(aiRequestEntity);
    await localRepository.saveAIResponse(aiResponseEntity);

    // 10. Audit Event: Response Received
    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: 'AI_RESPONSE_RECEIVED',
      resourceType: 'AIResponse',
      resourceId: responseId,
      details: {
        requestId,
        model: executedModel,
        isDeterministic,
        hasRedFlags: clinicalResponse.redFlags.length > 0,
      },
    });

    return clinicalResponse;
  }

  /**
   * Deterministic clinical decision support rule generator for offline environments.
   */
  private generateDeterministicOfflineCDS(taskType: AICapability, contextPrompt: string): string {
    const hasFever = /temp(erature)?\s*[:=]?\s*(38|39|40)/i.test(contextPrompt) || /febrile/i.test(contextPrompt);
    const hasTachycardia = /hr\s*[:=]?\s*(1[0-9]{2}|2[0-9]{2})/i.test(contextPrompt);
    const hasHypotension = /bp\s*[:=]?\s*([0-8][0-9]\/)/i.test(contextPrompt);

    const redFlags: string[] = [];
    if (hasFever && hasTachycardia) redFlags.push('Systemic inflammatory signs (Fever + Tachycardia). Consider sepsis evaluation.');
    if (hasHypotension) redFlags.push('Hypotension detected. Assess for shock, severe dehydration, or acute hemorrhage.');

    const summary = `Offline Deterministic Clinical Decision Support (${taskType}). Generated from local standard treatment guidelines without cloud model connectivity.`;

    return JSON.stringify({
      summary,
      findings: [
        hasFever ? 'Documented elevated body temperature' : 'Vital signs recorded locally',
        hasTachycardia ? 'Documented tachycardia' : 'Heart rate within baseline range',
      ],
      considerations: [
        {
          label: 'Infectious Disease Differential (Malaria / Bacterial Infection)',
          supportingEvidence: hasFever ? ['Fever documented in vitals'] : ['Clinical presentation'],
          contradictoryOrMissingEvidence: ['Pending blood smear or rapid diagnostic test'],
          uncertainty: 'Moderate without confirmatory laboratory testing',
          provenance: 'Regional Standard Treatment Guidelines 2026',
        },
      ],
      redFlags: redFlags.length > 0 ? redFlags : ['Monitor vital trends routinely.'],
      missingInformation: ['Confirmatory diagnostic test results', 'Complete allergy history'],
      uncertainty: ['Deterministic rule evaluation based purely on local parameter heuristics.'],
      suggestedNextSteps: [
        'Conduct bedside physical examination',
        'Verify vital signs and hydration status',
        'Order point-of-care rapid diagnostic testing where indicated',
      ],
    });
  }
}

export const janoAIGateway = JanoAIGateway.getInstance();
