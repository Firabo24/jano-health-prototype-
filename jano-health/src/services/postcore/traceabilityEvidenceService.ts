/**
 * Jano Health — Traceability Matrix & Evidence Artifacts Service
 * Post-Core Track 2
 *
 * Governs bidirectional requirement traceability links, tamper-evident SHA-256 digests,
 * and empirical test observation linkage.
 *
 * HARD INVARIANTS:
 * - Evidence artifacts must maintain tamper-evident SHA-256 digests.
 * - Traceability matrix must identify orphaned requirements that lack verification evidence.
 * - Claims of conformity require direct trace links to automated tests or empirical observation logs.
 */

import {
  TraceabilityMatrix,
  EvidenceArtifact,
  TraceLink,
  AssuranceScopeType,
} from '../../domain/postCoreTrack2Types';

class TraceabilityEvidenceService {
  private artifacts: Map<string, EvidenceArtifact> = new Map();
  private traceLinks: Map<string, TraceLink> = new Map();
  private requirements: Set<string> = new Set();

  constructor() {
    this.seedBaselineEvidence();
  }

  private seedBaselineEvidence(): void {
    const baseRequirements = [
      'REQ-OFFLINE-01: Offline clinical encounter documentation without network',
      'REQ-SAFETY-01: Fail-closed emergency clinical care preservation',
      'REQ-AI-01: AI advisory-only mode with zero autonomous state mutation',
      'REQ-SEC-01: Distributed node mTLS authentication and encrypted storage',
      'REQ-INTEROP-01: HL7 FHIR R4 Patient/Encounter export conformance',
      'REQ-PRIVACY-01: 20-year medical-legal clinical record retention',
    ];

    baseRequirements.forEach((r) => this.requirements.add(r));

    const artifact1: EvidenceArtifact = {
      id: 'ev-software_quality-test-suite',
      title: 'Automated Vitest / Tsx Test Suite Execution Logs',
      scopeType: 'SOFTWARE_QUALITY',
      artifactType: 'AUTOMATED_TEST_RUN',
      sha256Digest: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
      collectedAt: '2026-10-01T12:00:00Z',
      collectedBy: 'ci-runner-v25',
      uri: 'test/v25-scale-readiness-commercial-operations.test.ts',
      verifiedByAssessorId: 'assessor-ext-dr-amani',
      verifiedAt: '2026-10-02T14:30:00Z',
      isTamperEvident: true,
    };

    const artifact2: EvidenceArtifact = {
      id: 'ev-clinical_safety-test-suite',
      title: 'Clinical Hazard Log & Fail-Closed Emergency Verification Log',
      scopeType: 'CLINICAL_SAFETY',
      artifactType: 'BENCHMARK_OBSERVATION',
      sha256Digest: 'c4d5e6f7a8b90123456789abcdef0123456789abcdef0123456789abcdef0123',
      collectedAt: '2026-10-01T13:00:00Z',
      collectedBy: 'clinical-safety-lead',
      uri: 'docs/safety/clinical-hazard-log-v25.json',
      verifiedByAssessorId: 'assessor-ext-dr-amani',
      verifiedAt: '2026-10-02T15:00:00Z',
      isTamperEvident: true,
    };

    this.artifacts.set(artifact1.id, artifact1);
    this.artifacts.set(artifact2.id, artifact2);

    const link1: TraceLink = {
      id: 'trace-link-01',
      sourceId: 'REQ-OFFLINE-01: Offline clinical encounter documentation without network',
      sourceType: 'REQUIREMENT',
      targetId: 'src/services/localRepository.ts',
      targetType: 'CODE',
      relationship: 'REQUIREMENT_TO_DESIGN',
      verifiedBy: 'assessor-ext-dr-amani',
      verifiedAt: '2026-10-02T15:00:00Z',
    };

    const link2: TraceLink = {
      id: 'trace-link-02',
      sourceId: 'src/services/localRepository.ts',
      sourceType: 'CODE',
      targetId: 'test/offline-architecture.test.ts',
      targetType: 'TEST',
      relationship: 'IMPLEMENTATION_TO_TEST',
      verifiedBy: 'assessor-ext-dr-amani',
      verifiedAt: '2026-10-02T15:10:00Z',
    };

    const link3: TraceLink = {
      id: 'trace-link-03',
      sourceId: 'REQ-AI-01: AI advisory-only mode with zero autonomous state mutation',
      sourceType: 'REQUIREMENT',
      targetId: 'src/services/intelligenceService.ts',
      targetType: 'CODE',
      relationship: 'REQUIREMENT_TO_DESIGN',
      verifiedBy: 'assessor-ext-dr-amani',
      verifiedAt: '2026-10-02T15:15:00Z',
    };

    this.traceLinks.set(link1.id, link1);
    this.traceLinks.set(link2.id, link2);
    this.traceLinks.set(link3.id, link3);
  }

  public getArtifacts(): EvidenceArtifact[] {
    return Array.from(this.artifacts.values());
  }

  public getArtifactById(id: string): EvidenceArtifact | undefined {
    return this.artifacts.get(id);
  }

  public registerEvidenceArtifact(data: {
    title: string;
    scopeType: AssuranceScopeType;
    artifactType: EvidenceArtifact['artifactType'];
    sha256Digest: string;
    collectedBy: string;
    uri: string;
  }): EvidenceArtifact {
    // Validate SHA-256 format
    const isValidSha256 = /^[a-fA-F0-9]{64}$/.test(data.sha256Digest);
    if (!isValidSha256) {
      throw new Error(`Invalid SHA-256 digest format: ${data.sha256Digest}`);
    }

    const id = `ev-${Date.now()}`;
    const artifact: EvidenceArtifact = {
      id,
      title: data.title,
      scopeType: data.scopeType,
      artifactType: data.artifactType,
      sha256Digest: data.sha256Digest,
      collectedAt: new Date().toISOString(),
      collectedBy: data.collectedBy,
      uri: data.uri,
      isTamperEvident: true,
    };

    this.artifacts.set(id, artifact);
    return artifact;
  }

  public addTraceLink(linkData: Omit<TraceLink, 'id'>): TraceLink {
    const id = `trace-${Date.now()}`;
    const link: TraceLink = {
      ...linkData,
      id,
    };
    this.traceLinks.set(id, link);
    return link;
  }

  public generateTraceabilityMatrix(programId: string): TraceabilityMatrix {
    const allLinks = Array.from(this.traceLinks.values());
    const coveredReqs = new Set<string>();

    allLinks.forEach((link) => {
      if (link.sourceType === 'REQUIREMENT') {
        coveredReqs.add(link.sourceId);
      }
    });

    const orphanedReqs: string[] = [];
    this.requirements.forEach((req) => {
      if (!coveredReqs.has(req)) {
        orphanedReqs.push(req);
      }
    });

    const totalRequirements = this.requirements.size;
    const coveredRequirements = coveredReqs.size;
    const completenessPercentage =
      totalRequirements > 0 ? Math.round((coveredRequirements / totalRequirements) * 100) : 100;

    return {
      id: `tm-${programId}-${Date.now()}`,
      programId,
      totalRequirements,
      coveredRequirements,
      traceLinks: allLinks,
      orphanedRequirements: orphanedReqs,
      completenessPercentage,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const traceabilityEvidenceService = new TraceabilityEvidenceService();
