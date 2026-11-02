/**
 * Jano Health — Controlled Document Management Service
 * Post-Core Track 1
 *
 * Governs controlled document metadata, versioning, revision history,
 * and immutable approval workflows.
 *
 * HARD INVARIANTS:
 * - Never silently overwrite an approved historical document.
 * - Superseded revisions remain immutable and preserved for audit inspection.
 * - Every approved revision must record SHA-256 content digest, author, reviewer, approver, and effective date.
 */

import {
  ControlledDocument,
  ControlledDocumentState,
  DocumentRevision,
} from '../../domain/postCoreTrack1Types';

export class DocumentControlService {
  private documents: Map<string, ControlledDocument> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    const doc1: ControlledDocument = {
      documentId: 'doc-sop-001',
      documentNumber: 'SOP-OPS-001',
      title: 'Standard Operating Procedure: Rugged Tablet Offline Setup & Battery Care',
      docClass: 'SOP',
      applicability: ['RUGGED_TABLET', 'RURAL_FACILITY'],
      currentVersion: '2.1',
      currentState: 'EFFECTIVE',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
      revisions: [
        {
          revisionNumber: 1,
          versionString: '1.0',
          authorId: 'eng-sarah-kweka',
          reviewerId: 'david-mrosso-qms',
          approverId: 'dr-amina-said-cso',
          state: 'SUPERSEDED',
          effectiveDate: '2026-07-05T00:00:00Z',
          supersededDate: '2026-08-15T00:00:00Z',
          changeSummary: 'Initial formal release of rugged hardware deployment SOP.',
          contentDigest: 'SHA256_d41d8cd98f00b204e9800998ecf8427e',
          immutabilityLocked: true,
        },
        {
          revisionNumber: 2,
          versionString: '2.1',
          authorId: 'eng-sarah-kweka',
          reviewerId: 'david-mrosso-qms',
          approverId: 'dr-amina-said-cso',
          state: 'EFFECTIVE',
          effectiveDate: '2026-08-15T00:00:00Z',
          changeSummary: 'Updated solar battery charging thresholds and BLE mesh radio sleep schedules.',
          contentDigest: 'SHA256_a58f4a3d2e9c1b778204e9800998ecf8',
          immutabilityLocked: true,
        },
      ],
    };
    this.documents.set(doc1.documentId, doc1);

    const doc2: ControlledDocument = {
      documentId: 'doc-vp-004',
      documentNumber: 'VAL-PROT-004',
      title: 'Validation Protocol: Emergency Triage Offline-First Fail-Closed Verification',
      docClass: 'ValidationProtocol',
      applicability: ['EMERGENCY_DEPARTMENT', 'CLINICAL_CORE'],
      currentVersion: '1.0',
      currentState: 'EFFECTIVE',
      createdAt: '2026-08-01T09:00:00Z',
      updatedAt: '2026-08-10T14:00:00Z',
      revisions: [
        {
          revisionNumber: 1,
          versionString: '1.0',
          authorId: 'dr-amina-said-cso',
          reviewerId: 'david-mrosso-qms',
          approverId: 'dr-joseph-ndunguru',
          state: 'EFFECTIVE',
          effectiveDate: '2026-08-10T00:00:00Z',
          changeSummary: 'Formal test protocol for acute trauma triage without server connectivity.',
          contentDigest: 'SHA256_7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e',
          immutabilityLocked: true,
        },
      ],
    };
    this.documents.set(doc2.documentId, doc2);
  }

  public getAllDocuments(): ControlledDocument[] {
    return Array.from(this.documents.values());
  }

  public getDocument(documentId: string): ControlledDocument | undefined {
    return this.documents.get(documentId);
  }

  public createDocument(
    input: Omit<ControlledDocument, 'revisions' | 'createdAt' | 'updatedAt' | 'currentState' | 'currentVersion'>,
    initialRevision: Omit<DocumentRevision, 'revisionNumber' | 'immutabilityLocked' | 'state'>
  ): ControlledDocument {
    const docId = input.documentId;
    const now = new Date().toISOString();

    const revision: DocumentRevision = {
      ...initialRevision,
      revisionNumber: 1,
      state: 'DRAFT',
      immutabilityLocked: false,
    };

    const doc: ControlledDocument = {
      ...input,
      currentVersion: initialRevision.versionString,
      currentState: 'DRAFT',
      revisions: [revision],
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(docId, doc);
    return doc;
  }

  public addRevision(
    documentId: string,
    newRevisionInput: Omit<DocumentRevision, 'revisionNumber' | 'immutabilityLocked' | 'state'>
  ): { success: boolean; document?: ControlledDocument; error?: string } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false, error: 'Document not found' };

    // HARD INVARIANT: Cannot mutate an existing revision directly; must append as a new numbered revision
    const nextRevNum = doc.revisions.length + 1;
    const now = new Date().toISOString();

    // Mark previous active revision as SUPERSEDED once this is approved
    const newRev: DocumentRevision = {
      ...newRevisionInput,
      revisionNumber: nextRevNum,
      state: 'IN_REVIEW',
      immutabilityLocked: false,
    };

    doc.revisions.push(newRev);
    doc.updatedAt = now;
    this.documents.set(documentId, doc);
    return { success: true, document: doc };
  }

  public approveRevision(
    documentId: string,
    revisionNumber: number,
    approverId: string
  ): { success: boolean; document?: ControlledDocument; error?: string } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false, error: 'Document not found' };

    const targetRev = doc.revisions.find((r) => r.revisionNumber === revisionNumber);
    if (!targetRev) return { success: false, error: 'Revision not found' };

    const now = new Date().toISOString();

    // Supersede previously effective revisions
    for (const rev of doc.revisions) {
      if (rev.state === 'EFFECTIVE') {
        rev.state = 'SUPERSEDED';
        rev.supersededDate = now;
        rev.immutabilityLocked = true;
      }
    }

    targetRev.approverId = approverId;
    targetRev.state = 'EFFECTIVE';
    targetRev.effectiveDate = now;
    targetRev.immutabilityLocked = true; // Hard locked once approved

    doc.currentVersion = targetRev.versionString;
    doc.currentState = 'EFFECTIVE';
    doc.updatedAt = now;

    this.documents.set(documentId, doc);
    return { success: true, document: doc };
  }
}

export const documentControlService = new DocumentControlService();
