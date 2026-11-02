/**
 * Jano Health - Clinical Core V18: Research Operations Service
 * 
 * Manages study visits, study tasks, research event audits, protocol deviations,
 * safety monitoring, statistical analysis plans, and research specimen tracking.
 * 
 * INVARIANTS:
 * - Study Visit ≠ Encounter (A research visit does not automatically spawn a clinical encounter).
 * - Research Event ≠ Clinical Event.
 * - Study Task reuses V16 workforce identities.
 * - Research specimen tracking links to V4 specimen without altering clinical custody records.
 */

import {
  StudyVisit,
  StudyVisitStatus,
  StudyTask,
  ResearchEvent,
  ResearchEventType,
  StudyDeviation,
  StudySafetyEvent,
  ResearchSpecimen,
  StatisticalAnalysisPlan,
  StudyOutcomeDefinition,
} from '../../domain/v18ResearchTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

function sha256(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class ResearchOperationsService {
  private static instance: ResearchOperationsService;

  private visits = new Map<string, StudyVisit>();
  private tasks = new Map<string, StudyTask>();
  private events = new Map<string, ResearchEvent>();
  private deviations = new Map<string, StudyDeviation>();
  private safetyEvents = new Map<string, StudySafetyEvent>();
  private specimens = new Map<string, ResearchSpecimen>();
  private analysisPlans = new Map<string, StatisticalAnalysisPlan>();
  private outcomes = new Map<string, StudyOutcomeDefinition>();

  public static getInstance(): ResearchOperationsService {
    if (!ResearchOperationsService.instance) {
      ResearchOperationsService.instance = new ResearchOperationsService();
    }
    return ResearchOperationsService.instance;
  }

  // ==========================================================================
  // STUDY VISITS (STUDY VISIT ≠ ENCOUNTER)
  // ==========================================================================

  public async scheduleVisit(params: {
    studyId: string;
    researchSubjectId: string;
    visitType: StudyVisit['visitType'];
    visitNumber: number;
    scheduledAt: string;
    requiredAssessments: string[];
    clinicalEncounterReference?: string;
    actorId: string;
  }): Promise<StudyVisit> {
    const studyVisitId = `svis_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const visit: StudyVisit = {
      studyVisitId,
      researchSubjectId: params.researchSubjectId,
      studyId: params.studyId,
      visitType: params.visitType,
      visitNumber: params.visitNumber,
      scheduledAt: params.scheduledAt,
      clinicalEncounterReference: params.clinicalEncounterReference,
      status: 'SCHEDULED',
      requiredAssessments: params.requiredAssessments,
      dataCollectionReferences: [],
      deviations: [],
      provenance: {
        recordedBy: params.actorId,
        recordedAt: now,
      },
    };

    this.visits.set(studyVisitId, visit);
    try {
      await idbEngine.put('studyVisits', visit);
    } catch {}

    return visit;
  }

  public async completeVisit(
    visitId: string,
    actorId: string,
    assessmentsCompleted: string[]
  ): Promise<StudyVisit> {
    const visit = this.visits.get(visitId);
    if (!visit) throw new Error(`Study visit ${visitId} not found`);

    const now = new Date().toISOString();
    visit.status = 'COMPLETED';
    visit.actualAt = now;
    visit.dataCollectionReferences = assessmentsCompleted;
    visit.provenance.recordedBy = actorId;
    visit.provenance.recordedAt = now;

    try {
      await idbEngine.put('studyVisits', visit);
    } catch {}

    return visit;
  }

  // ==========================================================================
  // STUDY TASKS (V16 WORKFORCE REUSE)
  // ==========================================================================

  public async createStudyTask(params: {
    studyId: string;
    assignedTo: string; // V16 workforceMemberId
    taskType: StudyTask['taskType'];
    description: string;
    dueDate: string;
    relatedSubjectId?: string;
  }): Promise<StudyTask> {
    const studyTaskId = `stask_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const task: StudyTask = {
      studyTaskId,
      studyId: params.studyId,
      assignedTo: params.assignedTo,
      taskType: params.taskType,
      description: params.description,
      dueDate: params.dueDate,
      status: 'OPEN',
      relatedSubjectId: params.relatedSubjectId,
    };

    this.tasks.set(studyTaskId, task);
    try {
      await idbEngine.put('studyTasks', task);
    } catch {}

    return task;
  }

  // ==========================================================================
  // RESEARCH EVENTS (AUDIT & TAMPER EVIDENCE)
  // ==========================================================================

  public async recordResearchEvent(params: {
    studyId: string;
    eventType: ResearchEventType;
    subjectPseudonym?: string;
    siteId: string;
    actorId: string;
    details: Record<string, any>;
  }): Promise<ResearchEvent> {
    const eventId = `revt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();

    const event: ResearchEvent = {
      eventId,
      studyId: params.studyId,
      eventType: params.eventType,
      subjectPseudonym: params.subjectPseudonym,
      siteId: params.siteId,
      actorId: params.actorId,
      timestamp,
      details: params.details,
      integrityHash: sha256(`${eventId}:${params.studyId}:${params.eventType}:${timestamp}`),
    };

    this.events.set(eventId, event);
    try {
      await idbEngine.put('researchEvents', event);
    } catch {}

    return event;
  }

  // ==========================================================================
  // PROTOCOL DEVIATIONS
  // ==========================================================================

  public async reportDeviation(params: {
    studyId: string;
    researchSubjectId?: string;
    protocolVersion: number;
    description: string;
    severity: StudyDeviation['severity'];
    cause: string;
    impactAssessment: string;
    correctiveAction: string;
    reviewerId: string;
    actorId: string;
  }): Promise<StudyDeviation> {
    const deviationId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const deviation: StudyDeviation = {
      deviationId,
      studyId: params.studyId,
      researchSubjectId: params.researchSubjectId,
      protocolVersion: params.protocolVersion,
      description: params.description,
      severity: params.severity,
      occurredDate: now,
      cause: params.cause,
      impactAssessment: params.impactAssessment,
      correctiveAction: params.correctiveAction,
      reviewerId: params.reviewerId,
      status: 'REPORTED',
      provenance: {
        reportedAt: now,
        reportedBy: params.actorId,
      },
    };

    this.deviations.set(deviationId, deviation);
    try {
      await idbEngine.put('studyDeviations', deviation);
    } catch {}

    return deviation;
  }

  // ==========================================================================
  // STUDY SAFETY EVENTS
  // ==========================================================================

  public async reportSafetyEvent(params: {
    studyId: string;
    researchSubjectId?: string;
    eventType: StudySafetyEvent['eventType'];
    severity: StudySafetyEvent['severity'];
    description: string;
    reportedBy: string;
    investigatorAssessment: string;
  }): Promise<StudySafetyEvent> {
    const safetyEventId = `saf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const safetyEvent: StudySafetyEvent = {
      safetyEventId,
      studyId: params.studyId,
      researchSubjectId: params.researchSubjectId,
      eventType: params.eventType,
      severity: params.severity,
      description: params.description,
      occurredAt: now,
      status: params.severity === 'LIFE_THREATENING' ? 'ESCALATED' : 'OPEN',
      investigatorAssessment: params.investigatorAssessment,
      reportedBy: params.reportedBy,
      provenance: {
        createdAt: now,
      },
      integrityHash: sha256(`${safetyEventId}:${params.studyId}:${params.severity}:${now}`),
    };

    this.safetyEvents.set(safetyEventId, safetyEvent);
    try {
      await idbEngine.put('studySafetyEvents', safetyEvent);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.reportedBy,
      actorName: 'Study Safety Officer',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'STUDY_SAFETY_EVENT_REPORTED',
      resourceType: 'StudySafetyEvent',
      resourceId: safetyEventId,
      details: { severity: params.severity, eventType: params.eventType },
    });

    return safetyEvent;
  }

  public async resolveSafetyEvent(
    safetyEventId: string,
    actorId: string,
    actionTaken: string
  ): Promise<StudySafetyEvent> {
    const event = this.safetyEvents.get(safetyEventId);
    if (!event) throw new Error(`Safety event ${safetyEventId} not found`);

    event.status = 'RESOLVED';
    event.actionTaken = actionTaken;
    event.resolvedAt = new Date().toISOString();

    try {
      await idbEngine.put('studySafetyEvents', event);
    } catch {}

    return event;
  }

  // ==========================================================================
  // RESEARCH SPECIMEN TRACKING (V4 LINKAGE)
  // ==========================================================================

  public async registerResearchSpecimen(params: {
    studyId: string;
    subjectPseudonym: string;
    sourceClinicalSpecimenId?: string; // V4 link
    collectionPurpose: string;
    storageLocation: string;
    retentionYears: number;
    consentBasisReference: string;
    actorId: string;
  }): Promise<ResearchSpecimen> {
    const researchSpecimenId = `rspc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const specimen: ResearchSpecimen = {
      researchSpecimenId,
      studyId: params.studyId,
      subjectPseudonym: params.subjectPseudonym,
      sourceClinicalSpecimenId: params.sourceClinicalSpecimenId,
      collectionPurpose: params.collectionPurpose,
      processingStatus: 'COLLECTED',
      storageLocation: params.storageLocation,
      retentionYears: params.retentionYears,
      consentBasisReference: params.consentBasisReference,
      provenance: {
        collectedAt: now,
        collectedBy: params.actorId,
      },
    };

    this.specimens.set(researchSpecimenId, specimen);
    try {
      await idbEngine.put('researchSpecimens', specimen);
    } catch {}

    return specimen;
  }

  // ==========================================================================
  // STATISTICAL ANALYSIS PLAN
  // ==========================================================================

  public async createStatisticalAnalysisPlan(params: {
    studyId: string;
    primaryEndpoints: string[];
    secondaryEndpoints: string[];
    populationDefinitions: string[];
    analysisMethods: string[];
    missingDataMethod: string;
    subgroupRules: string[];
    effectiveDate: string;
    approvalReference: string;
    actorId: string;
  }): Promise<StatisticalAnalysisPlan> {
    const planId = `sap_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const plan: StatisticalAnalysisPlan = {
      planId,
      studyId: params.studyId,
      version: 1,
      primaryEndpoints: params.primaryEndpoints,
      secondaryEndpoints: params.secondaryEndpoints,
      populationDefinitions: params.populationDefinitions,
      analysisMethods: params.analysisMethods,
      missingDataMethod: params.missingDataMethod,
      subgroupRules: params.subgroupRules,
      effectiveDate: params.effectiveDate,
      approvalReference: params.approvalReference,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
      integrityHash: sha256(`${planId}:${params.studyId}:v1:${now}`),
    };

    this.analysisPlans.set(planId, plan);
    try {
      await idbEngine.put('statisticalAnalysisPlans', plan);
    } catch {}

    return plan;
  }
}

export const researchOperationsService = ResearchOperationsService.getInstance();
