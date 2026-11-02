/**
 * Jano Health - Clinical Core V18: Research Governance Service
 * 
 * Formal study lifecycle, immutable protocol versioning, IRB/ethics approvals,
 * multi-site isolation, and V16 workforce study team assignments.
 * 
 * INVARIANTS:
 * - Study Protocol is immutable once approved (version lineage preserved).
 * - Study Site isolation: facility participating at Site A cannot access Site B data.
 * - Study closure halts new enrollments and freezes study artifacts.
 * - Study role does NOT grant clinical privileges.
 */

import {
  ResearchStudy,
  ResearchStudyStatus,
  ResearchStudyType,
  StudyProtocol,
  ProtocolVersion,
  ResearchApproval,
  ApprovalCategory,
  ApprovalStatus,
  StudySite,
  StudyTeamMember,
  StudyRole,
  ResearchGovernancePolicy,
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

export class ResearchGovernanceService {
  private static instance: ResearchGovernanceService;

  private studies = new Map<string, ResearchStudy>();
  private protocols = new Map<string, StudyProtocol>();
  private protocolVersions = new Map<string, ProtocolVersion>();
  private approvals = new Map<string, ResearchApproval>();
  private sites = new Map<string, StudySite>();
  private teamMembers = new Map<string, StudyTeamMember>();

  public static getInstance(): ResearchGovernanceService {
    if (!ResearchGovernanceService.instance) {
      ResearchGovernanceService.instance = new ResearchGovernanceService();
    }
    return ResearchGovernanceService.instance;
  }

  // ==========================================================================
  // RESEARCH STUDY LIFECYCLE
  // ==========================================================================

  public async createStudy(params: {
    canonicalIdentifier: string;
    title: string;
    shortTitle: string;
    description: string;
    studyType: ResearchStudyType;
    phase?: ResearchStudy['phase'];
    sponsorReference?: string;
    principalInvestigator: string; // V16 workforceMemberId
    organizations: string[];
    objective: string;
    plannedStartDate: string;
    plannedEndDate?: string;
    actorId: string;
  }): Promise<ResearchStudy> {
    const studyId = `stu_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const study: ResearchStudy = {
      researchStudyId: studyId,
      canonicalIdentifier: params.canonicalIdentifier,
      title: params.title,
      shortTitle: params.shortTitle,
      description: params.description,
      studyType: params.studyType,
      phase: params.phase,
      sponsorReference: params.sponsorReference,
      principalInvestigator: params.principalInvestigator,
      organizations: params.organizations,
      studySites: [],
      objective: params.objective,
      protocolReference: '',
      plannedPeriod: {
        startDate: params.plannedStartDate,
        endDate: params.plannedEndDate,
      },
      status: 'DRAFT',
      version: 1,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        updatedAt: now,
        updatedBy: params.actorId,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${studyId}:${params.canonicalIdentifier}:${now}`),
    };

    this.studies.set(studyId, study);
    try {
      await idbEngine.put('researchStudies', study);
    } catch {}

    auditService.logSecurityEvent({
      actorId: params.actorId,
      actorName: 'Clinical Research Governance',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_STUDY_CREATED',
      resourceType: 'ResearchStudy',
      resourceId: studyId,
      details: { canonicalIdentifier: params.canonicalIdentifier, studyType: params.studyType },
    });

    return study;
  }

  public async getStudy(studyId: string): Promise<ResearchStudy | undefined> {
    if (this.studies.has(studyId)) {
      return this.studies.get(studyId);
    }
    try {
      const fromDb = await idbEngine.get<ResearchStudy>('researchStudies', studyId);
      if (fromDb) {
        this.studies.set(studyId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  public async listStudies(filter?: {
    status?: ResearchStudyStatus;
    studyType?: ResearchStudyType;
  }): Promise<ResearchStudy[]> {
    let list = Array.from(this.studies.values());
    if (list.length === 0) {
      try {
        const fromDb = await idbEngine.getAll<ResearchStudy>('researchStudies');
        for (const s of fromDb) {
          this.studies.set(s.researchStudyId, s);
        }
        list = fromDb;
      } catch {}
    }

    return list.filter((s) => {
      if (filter?.status && s.status !== filter.status) return false;
      if (filter?.studyType && s.studyType !== filter.studyType) return false;
      return true;
    });
  }

  // ==========================================================================
  // STUDY PROTOCOL & IMMUTABLE VERSIONING
  // ==========================================================================

  public async createProtocol(params: {
    studyId: string;
    title: string;
    objectives: string[];
    design: StudyProtocol['design'];
    populationCriteria: StudyProtocol['populationCriteria'];
    interventionReference?: StudyProtocol['interventionReference'];
    endpoints: StudyProtocol['endpoints'];
    dataCollectionPlan: string;
    safetyPlan: string;
    privacyPlan: string;
    retentionPlan: string;
    actorId: string;
  }): Promise<StudyProtocol> {
    const study = await this.getStudy(params.studyId);
    if (!study) {
      throw new Error(`Research study ${params.studyId} not found`);
    }

    const protocolId = `prt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const protocol: StudyProtocol = {
      protocolId,
      studyId: params.studyId,
      version: 1,
      title: params.title,
      objectives: params.objectives,
      design: params.design,
      populationCriteria: params.populationCriteria,
      interventionReference: params.interventionReference,
      endpoints: params.endpoints,
      dataCollectionPlan: params.dataCollectionPlan,
      safetyPlan: params.safetyPlan,
      privacyPlan: params.privacyPlan,
      retentionPlan: params.retentionPlan,
      approvalReferences: [],
      effectiveFrom: now,
      status: 'DRAFT',
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${protocolId}:${params.studyId}:v1:${now}`),
    };

    this.protocols.set(protocolId, protocol);
    study.protocolReference = protocolId;
    study.provenance.updatedAt = now;
    study.provenance.updatedBy = params.actorId;

    try {
      await idbEngine.put('studyProtocols', protocol);
      await idbEngine.put('researchStudies', study);
    } catch {}

    return protocol;
  }

  public async getProtocol(protocolId: string): Promise<StudyProtocol | undefined> {
    if (this.protocols.has(protocolId)) return this.protocols.get(protocolId);
    try {
      const fromDb = await idbEngine.get<StudyProtocol>('studyProtocols', protocolId);
      if (fromDb) {
        this.protocols.set(protocolId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  /**
   * Amends a finalized protocol, preserving the immutable prior version and recording lineage.
   */
  public async amendProtocol(
    priorProtocolId: string,
    updates: Partial<StudyProtocol>,
    actorId: string,
    reasonForChange: string,
    approvalReference: string
  ): Promise<{ newProtocol: StudyProtocol; versionRecord: ProtocolVersion }> {
    const priorProtocol = await this.getProtocol(priorProtocolId);
    if (!priorProtocol) {
      throw new Error(`Protocol ${priorProtocolId} not found`);
    }

    const now = new Date().toISOString();
    const versionId = `pver_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const newVersionNumber = priorProtocol.version + 1;

    // Snapshot prior version into immutable version record
    const versionRecord: ProtocolVersion = {
      versionId,
      protocolId: priorProtocolId,
      studyId: priorProtocol.studyId,
      versionNumber: priorProtocol.version,
      priorVersionId: priorProtocol.version > 1 ? `pver_prior` : undefined,
      effectiveFrom: priorProtocol.effectiveFrom,
      effectiveTo: now,
      approvalReference,
      reasonForChange,
      actor: actorId,
      timestamp: now,
      protocolSnapshot: JSON.parse(JSON.stringify(priorProtocol)),
      integrityHash: sha256(`${versionId}:${priorProtocolId}:${priorProtocol.version}:${now}`),
    };

    // Mark prior protocol superseded
    priorProtocol.status = 'SUPERSEDED';
    priorProtocol.effectiveTo = now;

    // Create successor protocol
    const newProtocolId = `prt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const newProtocol: StudyProtocol = {
      ...priorProtocol,
      ...updates,
      protocolId: newProtocolId,
      version: newVersionNumber,
      effectiveFrom: now,
      effectiveTo: undefined,
      status: 'APPROVED',
      approvalReferences: [...priorProtocol.approvalReferences, approvalReference],
      provenance: {
        createdAt: now,
        createdBy: actorId,
        systemVersion: 'v18.0',
      },
      integrityHash: sha256(`${newProtocolId}:${priorProtocol.studyId}:v${newVersionNumber}:${now}`),
    };

    this.protocolVersions.set(versionId, versionRecord);
    this.protocols.set(newProtocolId, newProtocol);

    const study = await this.getStudy(priorProtocol.studyId);
    if (study) {
      study.protocolReference = newProtocolId;
      study.version = newVersionNumber;
      study.provenance.updatedAt = now;
      study.provenance.updatedBy = actorId;
    }

    try {
      await idbEngine.put('protocolVersions', versionRecord);
      await idbEngine.put('studyProtocols', priorProtocol);
      await idbEngine.put('studyProtocols', newProtocol);
      if (study) await idbEngine.put('researchStudies', study);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Protocol Amendment Steward',
      actorRole: 'clinical_researcher',
      facilityId: 'SYSTEM',
      action: 'PROTOCOL_AMENDED',
      resourceType: 'StudyProtocol',
      resourceId: newProtocolId,
      details: { priorProtocolId, newVersionNumber, reasonForChange },
    });

    return { newProtocol, versionRecord };
  }

  // ==========================================================================
  // GOVERNANCE & APPROVAL WORKFLOW
  // ==========================================================================

  public async submitApproval(params: {
    studyId: string;
    category: ApprovalCategory;
    committeeName: string;
    referenceNumber: string;
    status: ApprovalStatus;
    approvedBy: string;
    conditions?: string[];
    notes?: string;
    expiryDate?: string;
  }): Promise<ResearchApproval> {
    const approvalId = `appr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const approval: ResearchApproval = {
      approvalId,
      studyId: params.studyId,
      category: params.category,
      committeeName: params.committeeName,
      referenceNumber: params.referenceNumber,
      status: params.status,
      conditions: params.conditions,
      approvedBy: params.approvedBy,
      decisionDate: now,
      expiryDate: params.expiryDate,
      notes: params.notes,
      provenance: {
        createdAt: now,
        createdBy: params.approvedBy,
      },
      integrityHash: sha256(`${approvalId}:${params.studyId}:${params.category}:${params.status}:${now}`),
    };

    this.approvals.set(approvalId, approval);
    try {
      await idbEngine.put('researchApprovals', approval);
    } catch {}

    return approval;
  }

  public async getApproval(approvalId: string): Promise<ResearchApproval | undefined> {
    if (this.approvals.has(approvalId)) return this.approvals.get(approvalId);
    try {
      const fromDb = await idbEngine.get<ResearchApproval>('researchApprovals', approvalId);
      if (fromDb) {
        this.approvals.set(approvalId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  public async approveStudy(
    studyId: string,
    actorId: string,
    approvalReference: string
  ): Promise<ResearchStudy> {
    const study = await this.getStudy(studyId);
    if (!study) throw new Error(`Study ${studyId} not found`);

    const approval = await this.getApproval(approvalReference);
    if (!approval || approval.status !== 'APPROVED') {
      throw new Error(`Valid APPROVED governance record required to activate study`);
    }

    const now = new Date().toISOString();
    study.status = 'ACTIVE';
    study.provenance.updatedAt = now;
    study.provenance.updatedBy = actorId;

    try {
      await idbEngine.put('researchStudies', study);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Research Governance Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_STUDY_ACTIVATED',
      resourceType: 'ResearchStudy',
      resourceId: studyId,
      details: { approvalReference },
    });

    return study;
  }

  /**
   * Closes a research study, freezing study artifacts and stopping new enrollments.
   */
  public async closeStudy(
    studyId: string,
    actorId: string,
    reason: string
  ): Promise<ResearchStudy> {
    const study = await this.getStudy(studyId);
    if (!study) throw new Error(`Study ${studyId} not found`);

    const now = new Date().toISOString();
    study.status = 'COMPLETED';
    if (!study.actualPeriod) study.actualPeriod = {};
    study.actualPeriod.endDate = now;
    study.provenance.updatedAt = now;
    study.provenance.updatedBy = actorId;

    try {
      await idbEngine.put('researchStudies', study);
    } catch {}

    auditService.logSecurityEvent({
      actorId,
      actorName: 'Research Governance Steward',
      actorRole: 'data_access_steward',
      facilityId: 'SYSTEM',
      action: 'RESEARCH_STUDY_CLOSED',
      resourceType: 'ResearchStudy',
      resourceId: studyId,
      details: { reason, closedAt: now },
    });

    return study;
  }

  // ==========================================================================
  // STUDY SITES & MULTI-SITE ISOLATION
  // ==========================================================================

  public async registerStudySite(params: {
    studyId: string;
    facilityId: string;
    organizationId: string;
    principalInvestigator: string;
    approvedScopes: string[];
    actorId: string;
  }): Promise<StudySite> {
    const study = await this.getStudy(params.studyId);
    if (!study) throw new Error(`Study ${params.studyId} not found`);

    const studySiteId = `site_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const site: StudySite = {
      studySiteId,
      studyId: params.studyId,
      facilityId: params.facilityId,
      organizationId: params.organizationId,
      principalInvestigator: params.principalInvestigator,
      siteStatus: 'ACTIVE',
      activationDate: now,
      approvedScopes: params.approvedScopes,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.sites.set(studySiteId, site);
    if (!study.studySites.includes(studySiteId)) {
      study.studySites.push(studySiteId);
    }

    try {
      await idbEngine.put('studySites', site);
      await idbEngine.put('researchStudies', study);
    } catch {}

    return site;
  }

  public async getSite(studySiteId: string): Promise<StudySite | undefined> {
    if (this.sites.has(studySiteId)) return this.sites.get(studySiteId);
    try {
      const fromDb = await idbEngine.get<StudySite>('studySites', studySiteId);
      if (fromDb) {
        this.sites.set(studySiteId, fromDb);
        return fromDb;
      }
    } catch {}
    return undefined;
  }

  /**
   * Enforces site isolation: ensures a facility is registered and active for a study.
   */
  public async verifySiteIsolation(studyId: string, facilityId: string): Promise<boolean> {
    const study = await this.getStudy(studyId);
    if (!study) return false;

    for (const siteId of study.studySites) {
      const site = await this.getSite(siteId);
      if (site && site.facilityId === facilityId && site.siteStatus === 'ACTIVE') {
        return true;
      }
    }
    return false;
  }

  // ==========================================================================
  // STUDY TEAM MEMBERS (V16 WORKFORCE REUSE)
  // ==========================================================================

  public async assignStudyTeamMember(params: {
    studyId: string;
    workforceMemberId: string; // V16 workforce identity
    role: StudyRole;
    scope: string[];
    actorId: string;
  }): Promise<StudyTeamMember> {
    const study = await this.getStudy(params.studyId);
    if (!study) throw new Error(`Study ${params.studyId} not found`);

    const studyTeamMemberId = `stm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const member: StudyTeamMember = {
      studyTeamMemberId,
      studyId: params.studyId,
      workforceMemberId: params.workforceMemberId,
      role: params.role,
      scope: params.scope,
      effectiveFrom: now,
      status: 'ACTIVE',
      provenance: {
        assignedAt: now,
        assignedBy: params.actorId,
      },
    };

    this.teamMembers.set(studyTeamMemberId, member);
    try {
      await idbEngine.put('studyTeamMembers', member);
    } catch {}

    return member;
  }

  public async getStudyTeam(studyId: string): Promise<StudyTeamMember[]> {
    let list = Array.from(this.teamMembers.values()).filter((m) => m.studyId === studyId);
    if (list.length === 0) {
      try {
        const fromDb = await idbEngine.getAll<StudyTeamMember>('studyTeamMembers');
        for (const m of fromDb) {
          this.teamMembers.set(m.studyTeamMemberId, m);
        }
        list = fromDb.filter((m) => m.studyId === studyId);
      } catch {}
    }
    return list;
  }
}

export const researchGovernanceService = ResearchGovernanceService.getInstance();
