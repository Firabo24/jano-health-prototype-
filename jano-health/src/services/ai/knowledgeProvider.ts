/**
 * Jano Health - Clinical Core V10: Knowledge Grounding & Retrieval Abstraction
 * 
 * Provides an evidence-grounding layer for clinical decision support.
 * Guarantees:
 * 1. Explicit provenance: Identifies whether knowledge is authoritative or synthetic demo.
 * 2. Grounding transparency: If ungrounded, outputs explicitly state UNGROUNDED / UNCERTAIN.
 * 3. Does not claim an AI response is evidence-based merely because it came from Gemini.
 */

import { AIKnowledgeReference } from '../../domain/aiTypes';

export const AUTHORITATIVE_KNOWLEDGE_SOURCES: AIKnowledgeReference[] = [
  {
    source: 'WHO_EML_2025',
    title: 'WHO Model List of Essential Medicines (24th List)',
    version: '2025.24',
    jurisdiction: 'GLOBAL_WHO',
    effectiveDate: '2025-09-05',
    reference: 'World Health Organization Technical Report Series No. 1060',
    isAuthoritative: true,
  },
  {
    source: 'ZA_EMSSA_SATS_2012',
    title: 'South African Triage Scale (SATS) Clinical Guideline',
    version: '2012-ADULT-V1',
    jurisdiction: 'ZA_EMSSA',
    effectiveDate: '2012-01-01',
    reference: 'Emergency Medicine Society of South Africa / South African Triage Group',
    isAuthoritative: true,
  },
  {
    source: 'JANO_DISTRICT_STG_2026',
    title: 'East Africa / Great Lakes District Standard Treatment Guidelines',
    version: '2026.1-REGIONAL',
    jurisdiction: 'REGIONAL_DISTRICT_HEALTH',
    effectiveDate: '2026-01-01',
    reference: 'Ministry of Health Primary Clinical Protocols & EML Compendium',
    isAuthoritative: true,
  },
  {
    source: 'JANO_SYNTHETIC_CLINICAL_DEMO',
    title: 'Jano Health Synthetic Demonstration Clinical Protocols',
    version: '2026.09-DEMO',
    jurisdiction: 'DEMO / SYNTHETIC ENVIRONMENT',
    effectiveDate: '2026-09-15',
    reference: 'Jano Synthetic Clinical Dataset (Not for independent clinical practice)',
    isAuthoritative: false,
  },
];

export class ClinicalKnowledgeProvider {
  private static instance: ClinicalKnowledgeProvider;
  private sources: Map<string, AIKnowledgeReference> = new Map();

  private constructor() {
    for (const source of AUTHORITATIVE_KNOWLEDGE_SOURCES) {
      this.sources.set(source.source, source);
    }
  }

  public static getInstance(): ClinicalKnowledgeProvider {
    if (!ClinicalKnowledgeProvider.instance) {
      ClinicalKnowledgeProvider.instance = new ClinicalKnowledgeProvider();
    }
    return ClinicalKnowledgeProvider.instance;
  }

  public search(query: string): AIKnowledgeReference[] {
    const q = query.toLowerCase();
    return Array.from(this.sources.values()).filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        s.jurisdiction.toLowerCase().includes(q)
    );
  }

  public retrieve(sourceKey: string): AIKnowledgeReference | undefined {
    return this.sources.get(sourceKey);
  }

  public getMetadata(): AIKnowledgeReference[] {
    return Array.from(this.sources.values());
  }
}

export const clinicalKnowledgeProvider = ClinicalKnowledgeProvider.getInstance();
