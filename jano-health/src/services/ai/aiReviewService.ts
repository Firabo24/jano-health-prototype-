/**
 * Jano Health - Clinical Core V10: AI Clinician Review & Draft Handoff Service
 * 
 * Invariants:
 * 1. AI output is strictly decision support and defaults to PENDING_REVIEW.
 * 2. Every clinician action (ACCEPT, REJECT, INSERT_INTO_DRAFT) creates an immutable AIReview entity.
 * 3. Handoff to documentation drafts marks the text as unverified draft until signed by the clinician.
 * 4. Context staleness detection alerts the clinician if patient data changed after AI generated output.
 */

import { AIRequest, AIResponse, AIReview, AIReviewStatus } from '../../domain/aiTypes';
import { RoleType } from '../../domain/types';
import { auditService } from '../audit/auditService';
import { localRepository } from '../storage/localRepository';

export interface RecordReviewParams {
  requestId: string;
  responseId: string;
  actorId: string;
  actorName: string;
  actorRole: RoleType;
  facilityId: string;
  action: 'ACCEPT' | 'REJECT' | 'EDIT' | 'INSERT_INTO_DRAFT';
  clinicianNotes?: string;
  draftTarget?: string;
  resultingDraftText?: string;
}

export class AIReviewService {
  private static instance: AIReviewService;

  public static getInstance(): AIReviewService {
    if (!AIReviewService.instance) {
      AIReviewService.instance = new AIReviewService();
    }
    return AIReviewService.instance;
  }

  /**
   * Records a clinician review event and updates the AIRequest/Response review lifecycle.
   */
  public async recordReview(params: RecordReviewParams): Promise<AIReview> {
    const reviewId = `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const reviewedAt = new Date().toISOString();

    const review: AIReview = {
      id: reviewId,
      requestId: params.requestId,
      responseId: params.responseId,
      reviewedById: params.actorId,
      reviewedByName: params.actorName,
      reviewedByRole: params.actorRole,
      facilityId: params.facilityId,
      reviewedAt,
      action: params.action,
      clinicianNotes: params.clinicianNotes,
      draftTarget: params.draftTarget,
      resultingDraftText: params.resultingDraftText,
    };

    // Determine target review state
    let targetStatus: AIReviewStatus = 'REVIEWED';
    if (params.action === 'ACCEPT') targetStatus = 'ACCEPTED';
    if (params.action === 'REJECT') targetStatus = 'REJECTED';
    if (params.action === 'INSERT_INTO_DRAFT') targetStatus = 'INSERTED_INTO_DRAFT';

    // Persist review entity
    await localRepository.saveAIReview(review);

    // Update AIRequest and AIResponse review statuses
    await localRepository.updateAIRequestReviewStatus(params.requestId, targetStatus);
    await localRepository.updateAIResponseApproval(params.responseId, params.action === 'ACCEPT' || params.action === 'INSERT_INTO_DRAFT', params.actorId, params.actorName);

    // Audit Logging
    const auditAction =
      params.action === 'ACCEPT'
        ? 'AI_RESPONSE_ACCEPTED'
        : params.action === 'REJECT'
        ? 'AI_RESPONSE_REJECTED'
        : params.action === 'INSERT_INTO_DRAFT'
        ? 'AI_CONTENT_INSERTED_INTO_DRAFT'
        : 'AI_RESPONSE_REVIEWED';

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      facilityId: params.facilityId,
      action: auditAction,
      resourceType: 'AIReview',
      resourceId: reviewId,
      details: {
        requestId: params.requestId,
        responseId: params.responseId,
        action: params.action,
        draftTarget: params.draftTarget,
      },
    });

    return review;
  }

  /**
   * Checks if context is stale compared to active patient records.
   */
  public async checkContextStaleness(
    patientId: string,
    contextAssembledAt: string
  ): Promise<{ isStale: boolean; reason?: string }> {
    const assembledTime = new Date(contextAssembledAt).getTime();

    // Check recent vitals
    const vitals = await localRepository.getVitals(patientId);
    const newerVital = vitals.find((v) => new Date(v.recordedAt).getTime() > assembledTime);
    if (newerVital) {
      return {
        isStale: true,
        reason: `Newer vital sign recorded at ${newerVital.recordedAt} after AI context assembly.`,
      };
    }

    // Check recent clinical notes
    const notes = await localRepository.getClinicalNotes(patientId);
    const newerNote = notes.find((n) => new Date(n.recordedAt || n.createdAt || '').getTime() > assembledTime);
    if (newerNote) {
      return {
        isStale: true,
        reason: `Newer clinical note authored at ${newerNote.recordedAt || newerNote.createdAt} after AI context assembly.`,
      };
    }

    return { isStale: false };
  }
}

export const aiReviewService = AIReviewService.getInstance();
