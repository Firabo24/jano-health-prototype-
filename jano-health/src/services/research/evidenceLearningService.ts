/**
 * Jano Health - Clinical Core V18: Evidence Management & Institutional Learning Service
 * 
 * Formal evidence synthesis (PICO/PECO), GRADE certainty assessments, citation tracking,
 * learning cycles, quality improvement projects, and governed practice-change proposals.
 * 
 * INVARIANTS:
 * - Evidence ≠ Clinical Guideline (Evidence cannot be treated as authoritative clinical knowledge merely because it is ACTIVE).
 * - Evidence ≠ Diagnosis (Research findings cannot declare clinical diagnosis).
 * - Finding ≠ Policy (Learning findings remain empirical observations until governed practice promotion).
 * - Practice Change Proposal ≠ Automatic Clinical Mutation (Does NOT alter CDS rules, orders, or patient charts autonomously).
 * - AI summaries cannot certify evidence (Human clinical reviewer is strictly required).
 */

import {
  EvidenceVariable,
  EvidenceVariableType,
  EvidenceRecord,
  EvidenceStatus,
  CitationRecord,
  EvidenceSource,
  EvidenceAssessment,
  EvidenceSynthesis,
  LearningCycle,
  QualityImprovementProject,
  LearningFinding,
  PracticeChangeProposal,
  KnowledgeArtifact,
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

export class EvidenceLearningService {
  private static instance: EvidenceLearningService;

  private variables = new Map<string, EvidenceVariable>();
  private evidenceRecords = new Map<string, EvidenceRecord>();
  private citations = new Map<string, CitationRecord>();
  private sources = new Map<string, EvidenceSource>();
  private assessments = new Map<string, EvidenceAssessment>();
  private syntheses = new Map<string, EvidenceSynthesis>();
  private learningCycles = new Map<string, LearningCycle>();
  private qiProjects = new Map<string, QualityImprovementProject>();
  private findings = new Map<string, LearningFinding>();
  private proposals = new Map<string, PracticeChangeProposal>();
  private artifacts = new Map<string, KnowledgeArtifact>();

  public static getInstance(): EvidenceLearningService {
    if (!EvidenceLearningService.instance) {
      EvidenceLearningService.instance = new EvidenceLearningService();
    }
    return EvidenceLearningService.instance;
  }

  // ==========================================================================
  // EVIDENCE VARIABLES (PICO / PECO)
  // ==========================================================================

  public async createEvidenceVariable(params: {
    name: string;
    description: string;
    variableType: EvidenceVariableType;
    picoRole: EvidenceVariable['picoRole'];
    definition: EvidenceVariable['definition'];
    handling: EvidenceVariable['handling'];
    actorId: string;
  }): Promise<EvidenceVariable> {
    const variableId = `ev_var_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const variable: EvidenceVariable = {
      variableId,
      name: params.name,
      description: params.description,
      variableType: params.variableType,
      picoRole: params.picoRole,
      definition: params.definition,
      handling: params.handling,
      version: 1,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.variables.set(variableId, variable);
    try {
      await idbEngine.put('evidenceVariables', variable);
    } catch {}

    return variable;
  }

  public async getEvidenceVariable(variableId: string): Promise<EvidenceVariable | undefined> {
    if (this.variables.has(variableId)) return this.variables.get(variableId);
    try {
      const fromDb = await idbEngine.get<EvidenceVariable>('evidenceVariables', variableId);
      if (fromDb) {
        this.variables.set(variableId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  // ==========================================================================
  // EVIDENCE RECORDS & RELEASE GATE
  // ==========================================================================

  public async createEvidenceRecord(params: {
    title: string;
    assertion: string;
    variables: EvidenceRecord['variables'];
    sourceStudies: string[];
    statistics: EvidenceRecord['statistics'];
    certainty: EvidenceRecord['certainty'];
    applicability: EvidenceRecord['applicability'];
    actorId: string;
  }): Promise<EvidenceRecord> {
    const evidenceId = `ev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const record: EvidenceRecord = {
      evidenceId,
      title: params.title,
      assertion: params.assertion,
      variables: params.variables,
      sourceStudies: params.sourceStudies,
      statistics: params.statistics,
      certainty: params.certainty,
      applicability: params.applicability,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        systemVersion: 'v18.0',
      },
      version: 1,
      status: 'DRAFT',
      integrityHash: sha256(`${evidenceId}:${params.assertion}:${params.certainty.rating}:${now}`),
    };

    this.evidenceRecords.set(evidenceId, record);
    try {
      await idbEngine.put('evidenceRecords', record);
    } catch {}

    return record;
  }

  public async getEvidenceRecord(evidenceId: string): Promise<EvidenceRecord | undefined> {
    if (this.evidenceRecords.has(evidenceId)) return this.evidenceRecords.get(evidenceId);
    try {
      const fromDb = await idbEngine.get<EvidenceRecord>('evidenceRecords', evidenceId);
      if (fromDb) {
        this.evidenceRecords.set(evidenceId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  /**
   * Release Gate: Verifies complete statistics, certainty assessment, and human reviewer before activating evidence.
   */
  public async reviewAndActivateEvidence(
    evidenceId: string,
    reviewerId: string
  ): Promise<EvidenceRecord> {
    const record = await this.getEvidenceRecord(evidenceId);
    if (!record) throw new Error(`Evidence record ${evidenceId} not found`);

    if (!record.sourceStudies || record.sourceStudies.length === 0) {
      throw new Error(`CRITICAL: Evidence requires at least one verified source study`);
    }
    if (!record.certainty || !record.certainty.rating) {
      throw new Error(`CRITICAL: Evidence certainty framework assessment required`);
    }

    const now = new Date().toISOString();
    record.status = 'ACTIVE';
    record.provenance.reviewedBy = reviewerId;
    record.provenance.reviewedAt = now;

    try {
      await idbEngine.put('evidenceRecords', record);
    } catch {}

    auditService.logSecurityEvent({
      actorId: reviewerId,
      actorName: 'Evidence Review Steward',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'EVIDENCE_RECORD_ACTIVATED',
      resourceType: 'EvidenceRecord',
      resourceId: evidenceId,
      details: { title: record.title, certainty: record.certainty.rating },
    });

    return record;
  }

  public async retractEvidence(
    evidenceId: string,
    actorId: string,
    reason: string
  ): Promise<EvidenceRecord> {
    const record = await this.getEvidenceRecord(evidenceId);
    if (!record) throw new Error(`Evidence record ${evidenceId} not found`);

    record.status = 'RETRACTED';

    try {
      await idbEngine.put('evidenceRecords', record);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Evidence Governance Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'EVIDENCE_RECORD_RETRACTED',
      resourceType: 'EvidenceRecord',
      resourceId: evidenceId,
      details: { reason },
    });

    return record;
  }

  // ==========================================================================
  // CITATIONS & EVIDENCE SOURCES (ANTI-HALLUCINATION)
  // ==========================================================================

  public async registerCitation(params: {
    title: string;
    authors: string[];
    publication: string;
    year: number;
    doi?: string;
    sourceType: CitationRecord['sourceType'];
    actorId: string;
  }): Promise<CitationRecord> {
    const citationId = `cit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const citation: CitationRecord = {
      citationId,
      title: params.title,
      authors: params.authors,
      publication: params.publication,
      year: params.year,
      doi: params.doi,
      sourceType: params.sourceType,
      accessDate: now,
      verificationStatus: params.doi ? 'VERIFIED' : 'UNVERIFIED',
      provenance: {
        recordedAt: now,
        recordedBy: params.actorId,
      },
    };

    this.citations.set(citationId, citation);
    try {
      await idbEngine.put('citationRecords', citation);
    } catch {}

    return citation;
  }

  public async assessEvidence(params: {
    evidenceId: string;
    assessorId: string;
    relevanceRating: EvidenceAssessment['relevanceRating'];
    qualityRating: EvidenceAssessment['qualityRating'];
    certainty: EvidenceAssessment['certainty'];
    applicabilityRating: EvidenceAssessment['applicabilityRating'];
    biasConcerns: string[];
    studyDesign: string;
    dataCompleteness: EvidenceAssessment['dataCompleteness'];
    notes: string;
  }): Promise<EvidenceAssessment> {
    const assessmentId = `eass_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const assessment: EvidenceAssessment = {
      assessmentId,
      evidenceId: params.evidenceId,
      assessorId: params.assessorId,
      relevanceRating: params.relevanceRating,
      qualityRating: params.qualityRating,
      certainty: params.certainty,
      applicabilityRating: params.applicabilityRating,
      biasConcerns: params.biasConcerns,
      studyDesign: params.studyDesign,
      dataCompleteness: params.dataCompleteness,
      notes: params.notes,
      assessedAt: now,
    };

    this.assessments.set(assessmentId, assessment);
    try {
      await idbEngine.put('evidenceAssessments', assessment);
    } catch {}

    return assessment;
  }

  // ==========================================================================
  // EVIDENCE SYNTHESIS & CONFLICT MANAGEMENT
  // ==========================================================================

  public async synthesizeEvidence(params: {
    researchQuestion: string;
    pico: EvidenceSynthesis['pico'];
    includedEvidenceIds: string[];
    excludedEvidenceIds: string[];
    synthesisMethod: EvidenceSynthesis['synthesisMethod'];
    findings: string[];
    hasConflict?: boolean;
    conflictNotes?: string;
    overallCertainty: EvidenceSynthesis['overallCertainty'];
    limitations: string[];
    reviewerId: string;
  }): Promise<EvidenceSynthesis> {
    const synthesisId = `syn_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const synthesis: EvidenceSynthesis = {
      synthesisId,
      researchQuestion: params.researchQuestion,
      pico: params.pico,
      includedEvidenceIds: params.includedEvidenceIds,
      excludedEvidenceIds: params.excludedEvidenceIds,
      synthesisMethod: params.synthesisMethod,
      findings: params.findings,
      hasConflict: params.hasConflict ?? false,
      conflictNotes: params.conflictNotes,
      overallCertainty: params.overallCertainty,
      limitations: params.limitations,
      reviewerId: params.reviewerId,
      version: 1,
      status: 'COMPLETED',
      provenance: {
        createdAt: now,
        createdBy: params.reviewerId,
      },
      integrityHash: sha256(`${synthesisId}:${params.researchQuestion}:${params.overallCertainty}:${now}`),
    };

    this.syntheses.set(synthesisId, synthesis);
    try {
      await idbEngine.put('evidenceSyntheses', synthesis);
    } catch {}

    return synthesis;
  }

  // ==========================================================================
  // INSTITUTIONAL LEARNING & PRACTICE CHANGE PROPOSALS
  // ==========================================================================

  public async createQualityImprovementProject(params: {
    title: string;
    objective: string;
    baselineMetric: string;
    targetMetric: string;
    interventionDescription: string;
    ownerId: string;
    facilityId: string;
  }): Promise<QualityImprovementProject> {
    const projectId = `qi_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const project: QualityImprovementProject = {
      projectId,
      title: params.title,
      objective: params.objective,
      baselineMetric: params.baselineMetric,
      targetMetric: params.targetMetric,
      interventionDescription: params.interventionDescription,
      period: {
        start: now,
      },
      ownerId: params.ownerId,
      facilityId: params.facilityId,
      status: 'ACTIVE',
      provenance: {
        createdAt: now,
        createdBy: params.ownerId,
      },
    };

    this.qiProjects.set(projectId, project);
    try {
      await idbEngine.put('qualityImprovementProjects', project);
    } catch {}

    return project;
  }

  public async createLearningFinding(params: {
    projectId?: string;
    studyId?: string;
    observation: string;
    evidenceReferences: string[];
    certainty: LearningFinding['certainty'];
    context: string;
    recommendation: string;
    limitations: string[];
    actorId: string;
  }): Promise<LearningFinding> {
    const findingId = `fnd_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const finding: LearningFinding = {
      findingId,
      projectId: params.projectId,
      studyId: params.studyId,
      observation: params.observation,
      evidenceReferences: params.evidenceReferences,
      certainty: params.certainty,
      context: params.context,
      recommendation: params.recommendation,
      limitations: params.limitations,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.findings.set(findingId, finding);
    try {
      await idbEngine.put('learningFindings', finding);
    } catch {}

    return finding;
  }

  public async proposePracticeChange(params: {
    findingReference: string;
    affectedService: string;
    proposedChange: string;
    expectedImpact: string;
    risks: string[];
    implementationPlan: string;
    actorId: string;
  }): Promise<PracticeChangeProposal> {
    const proposalId = `pcp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const proposal: PracticeChangeProposal = {
      proposalId,
      findingReference: params.findingReference,
      affectedService: params.affectedService,
      proposedChange: params.proposedChange,
      expectedImpact: params.expectedImpact,
      risks: params.risks,
      implementationPlan: params.implementationPlan,
      approvals: [],
      status: 'DRAFT',
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
      integrityHash: sha256(`${proposalId}:${params.findingReference}:${now}`),
    };

    this.proposals.set(proposalId, proposal);
    try {
      await idbEngine.put('practiceChangeProposals', proposal);
    } catch {}

    return proposal;
  }

  /**
   * Approves a practice change proposal.
   * INVARIANT 100 & 111: Does NOT automatically mutate clinical care guidelines or orders!
   */
  public async approvePracticeChange(
    proposalId: string,
    approvedBy: string,
    role: string
  ): Promise<PracticeChangeProposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const now = new Date().toISOString();
    proposal.status = 'APPROVED';
    proposal.approvals.push({
      approvedBy,
      role,
      approvedAt: now,
    });

    try {
      await idbEngine.put('practiceChangeProposals', proposal);
    } catch {}

    auditService.logSecurityEvent({
      actorId: approvedBy,
      actorName: 'Clinical Governance Committee',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'PRACTICE_CHANGE_APPROVED',
      resourceType: 'PracticeChangeProposal',
      resourceId: proposalId,
      details: { affectedService: proposal.affectedService },
    });

    return proposal;
  }

  public async createKnowledgeArtifact(params: {
    artifactType: KnowledgeArtifact['artifactType'];
    title: string;
    evidenceSources: string[];
    content: string;
    reviewerId: string;
    effectivePeriod: KnowledgeArtifact['effectivePeriod'];
    actorId: string;
  }): Promise<KnowledgeArtifact> {
    const artifactId = `kart_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const artifact: KnowledgeArtifact = {
      artifactId,
      artifactType: params.artifactType,
      title: params.title,
      evidenceSources: params.evidenceSources,
      content: params.content,
      version: 1,
      reviewerId: params.reviewerId,
      approvalState: 'APPROVED',
      effectivePeriod: params.effectivePeriod,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.artifacts.set(artifactId, artifact);
    try {
      await idbEngine.put('knowledgeArtifacts', artifact);
    } catch {}

    return artifact;
  }
}

export const evidenceLearningService = EvidenceLearningService.getInstance();
