/**
 * Jano Health - Clinical Human-in-the-Loop Import Review Store
 * Clinical Core V12: Safe Quarantine for Ambiguous Inbound Data
 */

import { ImportReviewItem, ImportReviewStatus } from './gatewayTypes';

export class FHIRImportReviewStore {
  private static instance: FHIRImportReviewStore;
  private items = new Map<string, ImportReviewItem>();

  private constructor() {
    this.seedInitialReviewItems();
  }

  public static getInstance(): FHIRImportReviewStore {
    if (!FHIRImportReviewStore.instance) {
      FHIRImportReviewStore.instance = new FHIRImportReviewStore();
    }
    return FHIRImportReviewStore.instance;
  }

  private seedInitialReviewItems(): void {
    const item1: ImportReviewItem = {
      id: 'rev-001',
      exchangeId: 'exc-init-001',
      sourceSystemId: 'sys-tz-moh-hie',
      sourceSystemName: 'Ministry of Health - National Health Information Exchange',
      resourceType: 'Patient',
      sourceResourceId: 'pat-ext-tz-9812',
      sourceVersion: '1',
      facilityId: 'fac-uvinza-hc',
      receivedAt: '2026-09-18T06:00:00Z',
      status: 'PENDING_IMPORT_REVIEW',
      patientMatchStatus: 'AMBIGUOUS',
      matchedLocalPatientId: 'pat-001',
      reconciliationConfidence: 0.65,
      reconciliationReasons: ['Matching DOB and Family Name but conflicting national ID suffix'],
      terminologyStatus: 'EXACT',
      unmappedCodes: [],
      rawPayload: {
        resourceType: 'Patient',
        id: 'pat-ext-tz-9812',
        name: [{ family: 'Mwemba', given: ['Amina'] }],
        birthDate: '1988-04-12',
      },
    };

    const item2: ImportReviewItem = {
      id: 'rev-002',
      exchangeId: 'exc-init-002',
      sourceSystemId: 'sys-kigoma-referral-node',
      sourceSystemName: 'Kigoma Regional Referral Hospital Node',
      resourceType: 'Condition',
      sourceResourceId: 'cond-ext-kig-312',
      facilityId: 'fac-uvinza-hc',
      receivedAt: '2026-09-18T06:15:00Z',
      status: 'PENDING_IMPORT_REVIEW',
      patientMatchStatus: 'MATCH_CONFIRMED',
      matchedLocalPatientId: 'pat-002',
      reconciliationConfidence: 1.0,
      terminologyStatus: 'UNMAPPED',
      unmappedCodes: ['LOCAL-KIG-TROPICAL-FEVER-09'],
      rawPayload: {
        resourceType: 'Condition',
        id: 'cond-ext-kig-312',
        code: { text: 'Unspecified endemic febrile syndrome' },
        subject: { reference: 'Patient/pat-002' },
      },
    };

    this.items.set(item1.id, item1);
    this.items.set(item2.id, item2);
  }

  public addItem(item: ImportReviewItem): void {
    this.items.set(item.id, item);
  }

  public getItem(id: string): ImportReviewItem | undefined {
    return this.items.get(id);
  }

  public getItems(status?: ImportReviewStatus): ImportReviewItem[] {
    const all = Array.from(this.items.values());
    if (!status) return all;
    return all.filter((i) => i.status === status);
  }

  public resolveReview(
    id: string,
    action: 'ACCEPT' | 'REJECT',
    reviewerId: string,
    reviewerName: string,
    notes?: string
  ): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    item.status = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    item.reviewedById = reviewerId;
    item.reviewedByName = reviewerName;
    item.reviewedAt = new Date().toISOString();
    item.reviewNotes = notes;
    return true;
  }
}

export const fhirImportReviewStore = FHIRImportReviewStore.getInstance();
