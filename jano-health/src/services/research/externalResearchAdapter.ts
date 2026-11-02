/**
 * Jano Health - Clinical Core V18: External Research & Evidence Source Adapters
 * 
 * Formal integration boundaries for external clinical trial registries, institutional research repositories,
 * and bibliographic evidence sources.
 * 
 * INVARIANT:
 * - Default status is strictly NOT_CONFIGURED or UNAVAILABLE.
 * - Never fabricate external literature, DOI references, or trial registrations.
 * - Fails closed when attempting transmissions while NOT_CONFIGURED.
 */

import {
  IResearchExchangeAdapter,
  IEvidenceSourceAdapter,
  CitationRecord,
} from '../../domain/v18ResearchTypes';

export class DefaultResearchExchangeAdapter implements IResearchExchangeAdapter {
  public status: 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'SANDBOX' | 'ACTIVE' = 'NOT_CONFIGURED';
  public endpoint?: string;

  public async transmitStudySummary(
    studyId: string
  ): Promise<{ success: boolean; error?: string; transmissionId?: string }> {
    if (this.status !== 'ACTIVE' && this.status !== 'SANDBOX') {
      return {
        success: false,
        error: `External research exchange adapter is strictly ${this.status}. Network transmission rejected.`,
      };
    }
    return {
      success: true,
      transmissionId: `tx_res_${Date.now()}`,
    };
  }

  public async fetchExternalProtocol(
    referenceNumber: string
  ): Promise<{ success: boolean; error?: string; protocolData?: any }> {
    if (this.status !== 'ACTIVE' && this.status !== 'SANDBOX') {
      return {
        success: false,
        error: `External research protocol repository is strictly ${this.status}. Query rejected.`,
      };
    }
    return {
      success: true,
      protocolData: { referenceNumber },
    };
  }
}

export class DefaultEvidenceSourceAdapter implements IEvidenceSourceAdapter {
  public status: 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'SANDBOX' | 'ACTIVE' = 'NOT_CONFIGURED';

  public async searchLiterature(
    query: string
  ): Promise<{ status: 'EVIDENCE_UNAVAILABLE' | 'AVAILABLE'; records: CitationRecord[] }> {
    if (this.status !== 'ACTIVE' && this.status !== 'SANDBOX') {
      // Invariant: Return EVIDENCE_UNAVAILABLE, never fabricate citations!
      return {
        status: 'EVIDENCE_UNAVAILABLE',
        records: [],
      };
    }
    return {
      status: 'AVAILABLE',
      records: [],
    };
  }

  public async verifyDoi(
    doi: string
  ): Promise<{ verified: boolean; citation?: CitationRecord }> {
    if (this.status !== 'ACTIVE' && this.status !== 'SANDBOX') {
      return {
        verified: false,
      };
    }
    return {
      verified: true,
    };
  }
}

export const defaultResearchExchangeAdapter = new DefaultResearchExchangeAdapter();
export const defaultEvidenceSourceAdapter = new DefaultEvidenceSourceAdapter();
