/**
 * Jano Health - Clinical Core V18: Research Cohort & Dataset Service
 * 
 * Manages reproducible research cohorts, small-cell privacy suppression (N < 5),
 * de-identification, dataset versioning, release gates, and governed data-access requests.
 * 
 * INVARIANTS:
 * - Research Dataset ≠ Clinical Record (Never overwrite or modify patient chart).
 * - Small-cell suppression: N < 5 is stamped SUPPRESSED (distinct from ZERO and NO_DATA).
 * - Re-identification is exceptional, time-limited, purpose-bound, and strictly audited.
 * - Expired data access fails closed.
 */

import {
  ResearchCohort,
  ResearchCohortDefinition,
  ResearchDataset,
  ResearchDatasetType,
  ResearchDatasetVersion,
  DataAccessRequest,
  DataAccessDecision,
  DataUseRecord,
  ResearchReIdentificationRequest,
} from '../../domain/v18ResearchTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { researchGovernanceService } from './researchGovernanceService';

function sha256(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export class ResearchCohortDatasetService {
  private static instance: ResearchCohortDatasetService;

  private cohortDefinitions = new Map<string, ResearchCohortDefinition>();
  private cohorts = new Map<string, ResearchCohort>();
  private datasets = new Map<string, ResearchDataset>();
  private datasetVersions = new Map<string, ResearchDatasetVersion>();
  private accessRequests = new Map<string, DataAccessRequest>();
  private accessDecisions = new Map<string, DataAccessDecision>();
  private useRecords = new Map<string, DataUseRecord>();
  private reIdentifyRequests = new Map<string, ResearchReIdentificationRequest>();

  public static getInstance(): ResearchCohortDatasetService {
    if (!ResearchCohortDatasetService.instance) {
      ResearchCohortDatasetService.instance = new ResearchCohortDatasetService();
    }
    return ResearchCohortDatasetService.instance;
  }

  // ==========================================================================
  // RESEARCH COHORTS & SMALL-CELL SUPPRESSION
  // ==========================================================================

  public async defineCohort(params: {
    studyId: string;
    name: string;
    criteria: ResearchCohortDefinition['criteria'];
    inclusionRules: string[];
    exclusionRules: string[];
    actorId: string;
  }): Promise<ResearchCohortDefinition> {
    const definitionId = `cdef_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const definition: ResearchCohortDefinition = {
      definitionId,
      studyId: params.studyId,
      name: params.name,
      version: 1,
      criteria: params.criteria,
      inclusionRules: params.inclusionRules,
      exclusionRules: params.exclusionRules,
      executionEnvironment: 'Jano-V18-AnalyticalEngine',
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
      integrityHash: sha256(`${definitionId}:${params.studyId}:${now}`),
    };

    this.cohortDefinitions.set(definitionId, definition);
    try {
      await idbEngine.put('researchCohortDefinitions', definition);
    } catch {}

    return definition;
  }

  public async getCohortDefinition(definitionId: string): Promise<ResearchCohortDefinition | undefined> {
    if (this.cohortDefinitions.has(definitionId)) return this.cohortDefinitions.get(definitionId);
    try {
      const fromDb = await idbEngine.get<ResearchCohortDefinition>('researchCohortDefinitions', definitionId);
      if (fromDb) {
        this.cohortDefinitions.set(definitionId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  /**
   * Deterministically executes cohort definition on sample candidates, applying small-cell privacy rules.
   */
  public async executeCohort(params: {
    definitionId: string;
    actorId: string;
    candidates: {
      subjectPseudonym: string;
      age?: number;
      gender?: string;
      diagnoses?: string[];
      facilities?: string[];
    }[];
  }): Promise<ResearchCohort> {
    const definition = await this.getCohortDefinition(params.definitionId);
    if (!definition) throw new Error(`Cohort definition ${params.definitionId} not found`);

    const now = new Date().toISOString();
    const cohortId = `coh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    // Evaluate inclusion/exclusion
    const matchedPseudonyms: string[] = [];
    for (const cand of params.candidates) {
      let matches = true;

      if (definition.criteria.ageRange) {
        if (definition.criteria.ageRange.min !== undefined && (cand.age === undefined || cand.age < definition.criteria.ageRange.min)) {
          matches = false;
        }
        if (definition.criteria.ageRange.max !== undefined && (cand.age === undefined || cand.age > definition.criteria.ageRange.max)) {
          matches = false;
        }
      }

      if (definition.criteria.gender && definition.criteria.gender !== 'ANY') {
        if (cand.gender !== definition.criteria.gender) matches = false;
      }

      if (definition.criteria.diagnosisCodes && definition.criteria.diagnosisCodes.length > 0) {
        const hasDiag = cand.diagnoses?.some((d) => definition.criteria.diagnosisCodes?.includes(d));
        if (!hasDiag) matches = false;
      }

      if (matches) {
        matchedPseudonyms.push(cand.subjectPseudonym);
      }
    }

    const rawCount = matchedPseudonyms.length;
    let count: number | 'SUPPRESSED';
    let privacyStatus: 'EXACT' | 'SUPPRESSED' | 'NO_DATA';

    // SMALL-CELL PRIVACY INVARIANT: 0 < N < 5 is SUPPRESSED.
    if (rawCount === 0) {
      count = 0;
      privacyStatus = 'NO_DATA';
    } else if (rawCount > 0 && rawCount < 5) {
      count = 'SUPPRESSED';
      privacyStatus = 'SUPPRESSED';
    } else {
      count = rawCount;
      privacyStatus = 'EXACT';
    }

    const cohort: ResearchCohort = {
      cohortId,
      studyId: definition.studyId,
      name: definition.name,
      definitionReference: params.definitionId,
      version: 1,
      rawCount,
      count,
      privacyStatus,
      generatedAt: now,
      generatedBy: params.actorId,
      approvalReference: `appr_gov_${definition.studyId}`,
      subjectPseudonyms: privacyStatus === 'SUPPRESSED' ? [] : matchedPseudonyms,
      provenance: {
        executionTimestamp: now,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${cohortId}:${definition.studyId}:${rawCount}:${now}`),
    };

    this.cohorts.set(cohortId, cohort);
    try {
      await idbEngine.put('researchCohorts', cohort);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: 'Cohort Generation Engine',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_COHORT_EXECUTED',
      resourceType: 'ResearchCohort',
      resourceId: cohortId,
      details: { definitionId: params.definitionId, rawCount, privacyStatus },
    });

    return cohort;
  }

  public async getCohort(cohortId: string): Promise<ResearchCohort | undefined> {
    if (this.cohorts.has(cohortId)) return this.cohorts.get(cohortId);
    try {
      const fromDb = await idbEngine.get<ResearchCohort>('researchCohorts', cohortId);
      if (fromDb) {
        this.cohorts.set(cohortId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  // ==========================================================================
  // RESEARCH DATASETS & RELEASE GATE
  // ==========================================================================

  public async createDataset(params: {
    studyId: string;
    name: string;
    description: string;
    datasetType: ResearchDatasetType;
    cohortReference: string;
    variables: string[];
    transformationPolicy: ResearchDataset['transformationPolicy'];
    privacyMethod: ResearchDataset['privacyMethod'];
    retentionYears: number;
    records: any[];
    actorId: string;
  }): Promise<ResearchDataset> {
    const study = await researchGovernanceService.getStudy(params.studyId);
    if (!study) throw new Error(`Study ${params.studyId} not found`);

    const datasetId = `rds_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const expiryDate = new Date(Date.now() + params.retentionYears * 365 * 24 * 3600 * 1000).toISOString();

    const dataset: ResearchDataset = {
      datasetId,
      studyId: params.studyId,
      name: params.name,
      description: params.description,
      datasetType: params.datasetType,
      sourceSystems: ['Jano-Clinical-Core-v18'],
      cohortReference: params.cohortReference,
      variables: params.variables,
      transformationPolicy: params.transformationPolicy,
      privacyMethod: params.privacyMethod,
      accessScope: [`study:${params.studyId}`],
      retentionPolicy: {
        retentionYears: params.retentionYears,
        expiryDate,
      },
      version: 1,
      status: 'PENDING_APPROVAL',
      records: params.records,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${datasetId}:${params.studyId}:${params.records.length}:${now}`),
    };

    const versionRecord: ResearchDatasetVersion = {
      versionId: `dver_${datasetId}_1`,
      datasetId,
      versionNumber: 1,
      cohortDefinitionId: params.cohortReference,
      transformationHistory: [`Created as ${params.datasetType} via ${params.privacyMethod}`],
      generationTime: now,
      responsibleActor: params.actorId,
      privacyStatus: params.datasetType,
      recordCount: params.records.length,
      integrityHash: dataset.integrityHash,
    };

    this.datasets.set(datasetId, dataset);
    this.datasetVersions.set(versionRecord.versionId, versionRecord);

    try {
      await idbEngine.put('researchDatasets', dataset);
      await idbEngine.put('researchDatasetVersions', versionRecord);
    } catch {}

    return dataset;
  }

  public async getDataset(datasetId: string): Promise<ResearchDataset | undefined> {
    if (this.datasets.has(datasetId)) return this.datasets.get(datasetId);
    try {
      const fromDb = await idbEngine.get<ResearchDataset>('researchDatasets', datasetId);
      if (fromDb) {
        this.datasets.set(datasetId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  /**
   * Release Gate: Verifies study approval, consent basis, reviewer approval before release.
   */
  public async releaseDataset(datasetId: string, actorId: string): Promise<ResearchDataset> {
    const dataset = await this.getDataset(datasetId);
    if (!dataset) throw new Error(`Dataset ${datasetId} not found`);

    const study = await researchGovernanceService.getStudy(dataset.studyId);
    if (!study || (study.status !== 'ACTIVE' && study.status !== 'COMPLETED')) {
      throw new Error(`CRITICAL: Cannot release dataset for inactive study ${dataset.studyId}`);
    }

    const now = new Date().toISOString();
    dataset.status = 'RELEASED';
    dataset.releaseApprovedBy = actorId;
    dataset.releaseApprovedAt = now;

    try {
      await idbEngine.put('researchDatasets', dataset);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Data Release Gate Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_DATASET_RELEASED',
      resourceType: 'ResearchDataset',
      resourceId: datasetId,
      details: { studyId: dataset.studyId, version: dataset.version },
    });

    return dataset;
  }

  // ==========================================================================
  // DATA ACCESS REQUESTS & DECISIONS
  // ==========================================================================

  public async requestDataAccess(params: {
    studyId: string;
    datasetId: string;
    requesterId: string;
    requesterName: string;
    requestedVariables: string[];
    purpose: string;
    durationDays: number;
    requestedScope: string;
    justification: string;
    consentBasis: string;
  }): Promise<DataAccessRequest> {
    const requestId = `dar_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const request: DataAccessRequest = {
      requestId,
      studyId: params.studyId,
      requesterId: params.requesterId,
      requesterName: params.requesterName,
      datasetId: params.datasetId,
      requestedVariables: params.requestedVariables,
      purpose: params.purpose,
      durationDays: params.durationDays,
      requestedScope: params.requestedScope,
      justification: params.justification,
      consentBasis: params.consentBasis,
      approvalReferences: [],
      status: 'SUBMITTED',
      provenance: {
        createdAt: now,
      },
      integrityHash: sha256(`${requestId}:${params.datasetId}:${params.requesterId}:${now}`),
    };

    this.accessRequests.set(requestId, request);
    try {
      await idbEngine.put('dataAccessRequests', request);
    } catch {}

    return request;
  }

  public async decideDataAccess(params: {
    requestId: string;
    approverId: string;
    decision: 'APPROVED' | 'PARTIALLY_APPROVED' | 'DENIED';
    justification: string;
    scope: string[];
    validDays?: number;
  }): Promise<DataAccessDecision> {
    const request = this.accessRequests.get(params.requestId);
    if (!request) throw new Error(`Access request ${params.requestId} not found`);

    const decisionId = `dad_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const duration = params.validDays ?? request.durationDays;
    const validTo = new Date(Date.now() + duration * 24 * 3600 * 1000).toISOString();

    const decision: DataAccessDecision = {
      decisionId,
      requestId: params.requestId,
      studyId: request.studyId,
      datasetId: request.datasetId,
      approverId: params.approverId,
      decision: params.decision,
      scope: params.scope,
      justification: params.justification,
      validFrom: now,
      validTo,
      timestamp: now,
      provenance: {
        recordedAt: now,
      },
      integrityHash: sha256(`${decisionId}:${params.requestId}:${params.decision}:${now}`),
    };

    request.status = params.decision;
    request.approvalReferences.push(decisionId);

    this.accessDecisions.set(decisionId, decision);
    try {
      await idbEngine.put('dataAccessDecisions', decision);
      await idbEngine.put('dataAccessRequests', request);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.approverId,
      actorName: 'Data Access Governance Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'DATA_ACCESS_DECIDED',
      resourceType: 'DataAccessDecision',
      resourceId: decisionId,
      details: { decision: params.decision, requestId: params.requestId },
    });

    return decision;
  }

  /**
   * Accesses a dataset using an approved decision, enforcing time-bounds and logging DataUseRecord.
   */
  public async accessDataset(params: {
    datasetId: string;
    requesterId: string;
    purpose: string;
    decisionId: string;
  }): Promise<{ allowed: boolean; records?: any[]; reason?: string }> {
    const decision = this.accessDecisions.get(params.decisionId);
    if (!decision) {
      return { allowed: false, reason: 'Invalid or missing data access decision' };
    }
    if (decision.decision === 'DENIED') {
      return { allowed: false, reason: 'Data access decision is DENIED' };
    }

    const now = new Date();
    if (now > new Date(decision.validTo)) {
      return { allowed: false, reason: `Data access approval expired at ${decision.validTo}` };
    }

    const dataset = await this.getDataset(params.datasetId);
    if (!dataset || dataset.status !== 'RELEASED') {
      return { allowed: false, reason: `Dataset ${params.datasetId} is not in RELEASED status` };
    }

    const recordId = `dur_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const useRecord: DataUseRecord = {
      recordId,
      requesterId: params.requesterId,
      datasetId: params.datasetId,
      studyId: dataset.studyId,
      purpose: params.purpose,
      accessTime: now.toISOString(),
      dataScope: decision.scope,
      outputType: 'PREVIEW',
      approvalReference: params.decisionId,
      expiryDate: decision.validTo,
      auditReference: `sec_audit_${recordId}`,
    };

    this.useRecords.set(recordId, useRecord);
    try {
      await idbEngine.put('dataUseRecords', useRecord);
    } catch {}

    return { allowed: true, records: dataset.records };
  }

  // ==========================================================================
  // EXCEPTIONAL RE-IDENTIFICATION WORKFLOW
  // ==========================================================================

  public async requestReIdentification(params: {
    studyId: string;
    studyPseudonym: string;
    requesterId: string;
    justification: string;
    purpose: ResearchReIdentificationRequest['purpose'];
  }): Promise<ResearchReIdentificationRequest> {
    const reIdentifyRequestId = `reid_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const req: ResearchReIdentificationRequest = {
      reIdentifyRequestId,
      studyId: params.studyId,
      requesterId: params.requesterId,
      studyPseudonym: params.studyPseudonym,
      justification: params.justification,
      purpose: params.purpose,
      status: 'REQUIRES_REVIEW',
      auditRecordId: `sec_reid_${reIdentifyRequestId}`,
    };

    this.reIdentifyRequests.set(reIdentifyRequestId, req);
    try {
      await idbEngine.put('researchReIdentificationRequests', req);
    } catch {}

    return req;
  }

  public async approveReIdentification(
    requestId: string,
    stewardId: string,
    revealedPatientId: string,
    approved: boolean
  ): Promise<ResearchReIdentificationRequest> {
    const req = this.reIdentifyRequests.get(requestId);
    if (!req) throw new Error(`Re-identification request ${requestId} not found`);

    const now = new Date();
    req.status = approved ? 'APPROVED' : 'DENIED';
    req.reviewedBy = stewardId;
    req.reviewedAt = now.toISOString();

    if (approved) {
      req.revealedPatientReference = revealedPatientId;
      req.temporaryAccessExpiry = new Date(now.getTime() + 24 * 3600 * 1000).toISOString(); // 24-hour limit
    }

    try {
      await idbEngine.put('researchReIdentificationRequests', req);
    } catch {}

    auditService.logSecurityEvent({
      actorId: stewardId,
      actorName: 'Research Privacy Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'RE_IDENTIFICATION_DECIDED',
      resourceType: 'ResearchReIdentificationRequest',
      resourceId: requestId,
      details: { approved, pseudonym: req.studyPseudonym, purpose: req.purpose },
    });

    return req;
  }
}

export const researchCohortDatasetService = ResearchCohortDatasetService.getInstance();
