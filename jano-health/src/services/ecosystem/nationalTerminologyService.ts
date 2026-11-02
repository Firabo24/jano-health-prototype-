/**
 * Jano Health - Clinical Core V19: National Terminology Service
 * 
 * Manages standard terminology maps, value sets, national code translation,
 * ambiguity quarantine, and version safety.
 * 
 * INVARIANTS:
 * - Default adapter is strictly NOT_CONFIGURED.
 * - Ambiguous mappings (1 local -> multiple targets) route to QUARANTINED (never guess).
 * - Terminology mapping ≠ Clinical diagnosis.
 * - Historical records retain the terminology version under which they were captured;
 *   national updates NEVER rewrite historical facts.
 */

import {
  INationalTerminologyAdapter,
  TerminologySystem,
  TerminologyMap,
  TerminologyVersion,
  TerminologyConflict,
  NationalIntegrationStatus,
} from '../../domain/v19NationalEcosystemTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class DefaultNationalTerminologyAdapter implements INationalTerminologyAdapter {
  public readonly adapterName = 'default_unconfigured_terminology_adapter';
  public readonly status: NationalIntegrationStatus = 'NOT_CONFIGURED';

  public async lookupConcept(_system: string, _code: string): Promise<{ found: boolean; display?: string; definition?: string }> {
    return { found: false };
  }

  public async validateCode(_system: string, _code: string): Promise<{ valid: boolean; display?: string }> {
    return { valid: false };
  }

  public async translateCode(_sourceSystem: string, _sourceCode: string, _targetSystem: string): Promise<TerminologyMap[]> {
    return [];
  }

  public async expandValueSet(_valueSetUri: string): Promise<Array<{ system: string; code: string; display: string }>> {
    return [];
  }
}

export class SandboxTerminologyAdapter implements INationalTerminologyAdapter {
  public readonly adapterName = 'sandbox_terminology_adapter';
  public readonly status: NationalIntegrationStatus = 'ACTIVE';

  private dictionary: Array<{
    system: string;
    code: string;
    display: string;
    targetSystem: string;
    targetCode: string;
    targetDisplay: string;
    equivalence: TerminologyMap['equivalence'];
  }> = [
    {
      system: 'urn:oid:jano:clinical-terms',
      code: 'JANO-DX-MALARIA-FALCIPARUM',
      display: 'Plasmodium falciparum malaria',
      targetSystem: 'http://hl7.org/fhir/sid/icd-10',
      targetCode: 'B50.9',
      targetDisplay: 'Plasmodium falciparum malaria, unspecified',
      equivalence: 'equivalent',
    },
    {
      system: 'urn:oid:jano:clinical-terms',
      code: 'JANO-DX-CHOLERA',
      display: 'Vibrio cholerae acute infection',
      targetSystem: 'http://hl7.org/fhir/sid/icd-10',
      targetCode: 'A00.9',
      targetDisplay: 'Cholera, unspecified',
      equivalence: 'equal',
    },
    {
      system: 'urn:oid:jano:clinical-terms',
      code: 'JANO-DX-PNEUMONIA-COMMUNITY',
      display: 'Community-acquired acute pneumonia',
      targetSystem: 'http://hl7.org/fhir/sid/icd-10',
      targetCode: 'J18.9',
      targetDisplay: 'Pneumonia, unspecified organism',
      equivalence: 'wider',
    },
  ];

  public async lookupConcept(system: string, code: string): Promise<{ found: boolean; display?: string; definition?: string }> {
    const entry = this.dictionary.find((d) => d.system === system && d.code === code);
    if (entry) {
      return { found: true, display: entry.display };
    }
    return { found: false };
  }

  public async validateCode(system: string, code: string): Promise<{ valid: boolean; display?: string }> {
    const entry = this.dictionary.find((d) => (d.system === system && d.code === code) || (d.targetSystem === system && d.targetCode === code));
    return { valid: !!entry, display: entry?.display || entry?.targetDisplay };
  }

  public async translateCode(sourceSystem: string, sourceCode: string, targetSystem: string): Promise<TerminologyMap[]> {
    const matches = this.dictionary.filter(
      (d) => d.system === sourceSystem && d.code === sourceCode && d.targetSystem === targetSystem
    );
    const now = new Date().toISOString();

    return matches.map((m, idx) => ({
      mapId: `tmap_sbx_${idx}_${Date.now()}`,
      localSystem: m.system,
      localCode: m.code,
      localDisplay: m.display,
      targetSystem: m.targetSystem,
      targetCode: m.targetCode,
      targetDisplay: m.targetDisplay,
      mappingType: matches.length > 1 ? 'AMBIGUOUS' : (m.equivalence === 'equal' ? 'EXACT' : 'EQUIVALENT'),
      equivalence: m.equivalence,
      confidence: matches.length > 1 ? 0.5 : 1.0,
      terminologyVersion: 'ICD10-2019-NATIONAL',
      mappingVersion: 'v1.0',
      effectivePeriod: { start: now },
      status: matches.length > 1 ? 'QUARANTINED' : 'VERIFIED',
      provenance: {
        mappedAt: now,
        mappedBy: 'sandbox_terminology_adapter',
      },
    }));
  }

  public async expandValueSet(_valueSetUri: string): Promise<Array<{ system: string; code: string; display: string }>> {
    return this.dictionary.map((d) => ({
      system: d.targetSystem,
      code: d.targetCode,
      display: d.targetDisplay,
    }));
  }
}

export class NationalTerminologyService {
  private static instance: NationalTerminologyService;
  private adapter: INationalTerminologyAdapter;

  private constructor() {
    this.adapter = new DefaultNationalTerminologyAdapter();
  }

  public static getInstance(): NationalTerminologyService {
    if (!NationalTerminologyService.instance) {
      NationalTerminologyService.instance = new NationalTerminologyService();
    }
    return NationalTerminologyService.instance;
  }

  public setAdapter(adapter: INationalTerminologyAdapter): void {
    this.adapter = adapter;
  }

  public getAdapterStatus(): NationalIntegrationStatus {
    return this.adapter.status;
  }

  // ----------------------------------------------------
  // Mapping Creation & Ambiguity Quarantine Gate
  // ----------------------------------------------------

  public async mapConcept(params: {
    localSystem: string;
    localCode: string;
    localDisplay?: string;
    targetSystem: string;
    potentialTargetCodes: Array<{ code: string; display?: string; equivalence?: TerminologyMap['equivalence'] }>;
    actorId: string;
    terminologyVersion?: string;
  }): Promise<TerminologyMap> {
    const now = new Date().toISOString();
    const mapId = `tmap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const termVersion = params.terminologyVersion || 'ETH_NATIONAL_TERMINOLOGY_v2026';

    // Invariant: Ambiguity check. If 1 local code maps to multiple candidate target codes,
    // it MUST route to QUARANTINED and require human review. It must NEVER guess!
    const isAmbiguous = params.potentialTargetCodes.length > 1;

    if (isAmbiguous) {
      const quarantinedMap: TerminologyMap = {
        mapId,
        localSystem: params.localSystem,
        localCode: params.localCode,
        localDisplay: params.localDisplay,
        targetSystem: params.targetSystem,
        targetCode: params.potentialTargetCodes[0].code,
        targetDisplay: params.potentialTargetCodes[0].display,
        mappingType: 'AMBIGUOUS',
        equivalence: 'inexact',
        confidence: 0.4,
        terminologyVersion: termVersion,
        mappingVersion: '1.0',
        effectivePeriod: { start: now },
        status: 'QUARANTINED',
        provenance: {
          mappedAt: now,
          mappedBy: params.actorId,
        },
      };

      await idbEngine.put('terminologyMaps', quarantinedMap);

      // Record quarantine item
      const quarantineId = `qitem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await idbEngine.put('ecosystemQuarantineItems', {
        quarantineId,
        category: 'TERMINOLOGY',
        sourceSystem: params.localSystem,
        payload: {
          localCode: params.localCode,
          candidateCodes: params.potentialTargetCodes,
        },
        failureReason: `Ambiguous terminology mapping: 1 local code maps to ${params.potentialTargetCodes.length} potential national concepts. Requires human terminologist review.`,
        quarantinedAt: now,
        status: 'QUARANTINED',
      });

      return quarantinedMap;
    }

    const singleTarget = params.potentialTargetCodes[0] || { code: 'UNKNOWN', display: 'Unknown' };
    const equivalence = singleTarget.equivalence || 'equivalent';
    const mappingType = equivalence === 'equal' ? 'EXACT' : 'EQUIVALENT';

    const map: TerminologyMap = {
      mapId,
      localSystem: params.localSystem,
      localCode: params.localCode,
      localDisplay: params.localDisplay,
      targetSystem: params.targetSystem,
      targetCode: singleTarget.code,
      targetDisplay: singleTarget.display,
      mappingType,
      equivalence,
      confidence: 1.0,
      terminologyVersion: termVersion,
      mappingVersion: '1.0',
      effectivePeriod: { start: now },
      status: 'VERIFIED',
      reviewer: params.actorId,
      reviewedAt: now,
      provenance: {
        mappedAt: now,
        mappedBy: params.actorId,
      },
    };

    await idbEngine.put('terminologyMaps', map);
    return map;
  }

  public async approveMapping(mapId: string, reviewerId: string, finalTargetCode: string): Promise<TerminologyMap> {
    const map = await idbEngine.get<TerminologyMap>('terminologyMaps', mapId);
    if (!map) {
      throw new Error(`Terminology map ${mapId} not found`);
    }

    const now = new Date().toISOString();
    map.targetCode = finalTargetCode;
    map.status = 'VERIFIED';
    map.reviewer = reviewerId;
    map.reviewedAt = now;
    map.mappingType = 'EQUIVALENT';
    map.confidence = 1.0;

    await idbEngine.put('terminologyMaps', map);
    return map;
  }

  public async getMapping(localSystem: string, localCode: string): Promise<TerminologyMap | null> {
    const maps = await idbEngine.getAll<TerminologyMap>('terminologyMaps');
    const matched = maps.find((m) => m.localSystem === localSystem && m.localCode === localCode && m.status === 'VERIFIED');
    return matched || null;
  }

  public async listMaps(): Promise<TerminologyMap[]> {
    return await idbEngine.getAll<TerminologyMap>('terminologyMaps');
  }
}

export const nationalTerminologyService = NationalTerminologyService.getInstance();
