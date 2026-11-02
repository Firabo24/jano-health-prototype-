/**
 * Jano Health - Analytical Fact Store & Event-Derived Ingestion Pipeline
 * Clinical Core V14: Plane C Aggregation and Source Provenance
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Analytics layer must NEVER mutate the clinical source of truth.
 * 2. Population intelligence is read-derived from append-only events.
 * 3. Analytical facts preserve source event and aggregate IDs for lineage.
 * 4. Corrections and amendments create versioned facts, not silent overwrites.
 * 5. Facts contain measures, dimensions, and SHA-256 integrity hashes.
 */

import {
  AnalyticalFact,
  ClinicalFact,
  DispensingFact,
  EmergencyFact,
  EncounterFact,
  FactDataQualityStatus,
  FactDomain,
  FacilityFact,
  InventoryFact,
  LaboratoryFact,
  MedicationFact,
  RadiologyFact,
  ReferralFact,
  ServiceFact,
} from '../../domain/analyticsTypes';
import { DomainEvent } from '../../domain/persistence';
import { sha256 } from '../../domain/eventIntegrity';
import { idbEngine } from '../storage/indexedDbEngine';

export interface FactFilter {
  domain?: FactDomain;
  factType?: string;
  facilityId?: string;
  reportingPeriod?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  dataQualityStatus?: FactDataQualityStatus;
}

export class AnalyticalFactStore {
  private static instance: AnalyticalFactStore;
  private memoryCache: Map<string, AnalyticalFact> = new Map();
  private initialized = false;
  private initPromise?: Promise<void>;

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): AnalyticalFactStore {
    if (!AnalyticalFactStore.instance) {
      AnalyticalFactStore.instance = new AnalyticalFactStore();
    }
    return AnalyticalFactStore.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          const stored = await idbEngine.getAll<AnalyticalFact>('analyticalFacts');
          stored.forEach((f) => this.memoryCache.set(f.factId, f));
        } catch (err) {
          console.warn('[AnalyticalFactStore] Init warning, running in memory:', err);
        }
        this.initialized = true;
      })();
    }
    return this.initPromise;
  }

  /**
   * Derives and ingests an analytical fact from an append-only domain event.
   */
  public async ingestDomainEvent(event: DomainEvent): Promise<AnalyticalFact | null> {
    await this.ensureInitialized();

    const timestamp = event.timestamp || new Date().toISOString();
    const reportingPeriod = timestamp.substring(0, 7); // YYYY-MM
    const baseId = `fact_${event.eventType}_${event.eventId}`;

    // Check if fact for this event already exists (idempotency)
    const existing = this.memoryCache.get(baseId);
    if (existing) {
      return existing;
    }

    const payload = event.payload || {};
    const facilityId = event.facilityId || payload.facilityId || 'fac_unknown';

    let derivedFact: AnalyticalFact | null = null;
    const eventName = String(event.eventType).toUpperCase();

    // 1. ENCOUNTER
    if (eventName.includes('ENCOUNTER')) {
      const fact: EncounterFact = {
        factId: baseId,
        factType: 'ENCOUNTER',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        encounterType: payload.type || payload.encounterType || 'outpatient',
        disposition: payload.disposition || 'completed',
        durationMinutes: payload.durationMinutes || 20,
        ageYears: payload.patientAge || payload.age,
        gender: payload.patientGender || payload.gender,
        dimensions: {
          encounterType: payload.type || payload.encounterType || 'outpatient',
          status: payload.status || 'completed',
          clinicianRole: payload.clinicianRole || event.actorId,
        },
        measures: {
          count: 1,
          durationMinutes: payload.durationMinutes || 20,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 2. DIAGNOSIS / CLINICAL
    else if (eventName.includes('DIAGNOSIS') || eventName.includes('PROBLEM') || eventName.includes('ASSESSMENT')) {
      const fact: ClinicalFact = {
        factId: baseId,
        factType: 'CLINICAL',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        diagnosisCode: payload.diagnosisCode || payload.code,
        codingSystem: payload.codingSystem || 'ICD-10',
        certainty: payload.certainty || 'CONFIRMED',
        isChronic: Boolean(payload.isChronic || payload.status === 'chronic'),
        dimensions: {
          diagnosisCode: payload.diagnosisCode || payload.code || 'UNKNOWN',
          codingSystem: payload.codingSystem || 'ICD-10',
          status: payload.status || 'CONFIRMED',
        },
        measures: {
          count: 1,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: payload.diagnosisCode ? 'VALID' : 'WARNING',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 3. LABORATORY
    else if (eventName.includes('LAB') || eventName.includes('SPECIMEN')) {
      const isAbnormal = Boolean(payload.isAbnormal || payload.abnormalFlag === 'ABNORMAL' || payload.abnormalFlag === 'HIGH' || payload.abnormalFlag === 'LOW');
      const isCritical = Boolean(payload.criticalFlag || payload.isCritical);
      const fact: LaboratoryFact = {
        factId: baseId,
        factType: 'LABORATORY',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        testCode: payload.testCode || 'TEST_GEN',
        testCategory: payload.testCategory || payload.category || 'hematology',
        isAbnormal,
        isCritical,
        turnaroundMinutes: payload.turnaroundMinutes || 45,
        specimenRejectionReason: payload.rejectionReason,
        dimensions: {
          testCode: payload.testCode || 'TEST_GEN',
          testName: payload.testName || 'Investigation',
          status: payload.status || 'FINAL',
          abnormalFlag: isAbnormal ? 'ABNORMAL' : 'NORMAL',
        },
        measures: {
          count: 1,
          abnormalCount: isAbnormal ? 1 : 0,
          criticalCount: isCritical ? 1 : 0,
          turnaroundMinutes: payload.turnaroundMinutes || 45,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: payload.testCode ? 'VALID' : 'WARNING',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 4. RADIOLOGY
    else if (eventName.includes('RADIOLOGY') || eventName.includes('IMAGING')) {
      const isCritical = Boolean(payload.criticalFinding || payload.isCriticalFinding);
      const fact: RadiologyFact = {
        factId: baseId,
        factType: 'RADIOLOGY',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        modality: payload.modality || 'XR',
        bodySite: payload.bodySite || 'Chest',
        isCriticalFinding: isCritical,
        turnaroundMinutes: payload.turnaroundMinutes || 60,
        dimensions: {
          modality: payload.modality || 'XR',
          bodySite: payload.bodySite || 'Chest',
          status: payload.status || 'FINAL',
        },
        measures: {
          count: 1,
          criticalCount: isCritical ? 1 : 0,
          turnaroundMinutes: payload.turnaroundMinutes || 60,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 5. MEDICATION / PRESCRIPTION
    else if (eventName.includes('MEDICATION') || eventName.includes('PRESCRIPTION')) {
      const qty = Number(payload.quantity || payload.quantityPrescribed || 1);
      const fact: MedicationFact = {
        factId: baseId,
        factType: 'MEDICATION',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        medicationCode: payload.medicationCode || payload.code || 'MED-GEN',
        genericName: payload.genericName || payload.medicationName || 'Medication',
        route: payload.route || 'oral',
        quantityPrescribed: qty,
        dimensions: {
          medicationCode: payload.medicationCode || payload.code || 'MED-GEN',
          genericName: payload.genericName || payload.medicationName || 'Medication',
          status: payload.status || 'ACTIVE',
        },
        measures: {
          count: 1,
          quantity: qty,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 6. PHARMACY DISPENSING
    else if (eventName.includes('DISPENSE')) {
      const qty = Number(payload.quantityDispensed || payload.quantity || 1);
      const fact: DispensingFact = {
        factId: baseId,
        factType: 'DISPENSING',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        medicationCode: payload.medicationCode || 'MED-GEN',
        quantityDispensed: qty,
        wasStockAvailable: payload.status !== 'HELD' && payload.status !== 'CANCELLED',
        dimensions: {
          medicationCode: payload.medicationCode || 'MED-GEN',
          status: payload.status || 'DISPENSED',
        },
        measures: {
          count: 1,
          quantity: qty,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 7. INVENTORY
    else if (eventName.includes('INVENTORY')) {
      const stock = Number(payload.stockLevel ?? payload.quantity ?? 100);
      const isStockout = stock <= 0 || Boolean(payload.isStockout);
      const fact: InventoryFact = {
        factId: baseId,
        factType: 'INVENTORY',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        itemId: payload.itemId || payload.inventoryItemId || 'item-gen',
        stockLevel: stock,
        daysOfSupply: payload.daysOfSupply || Math.max(0, Math.floor(stock / 5)),
        isStockout,
        nearExpiryUnits: payload.nearExpiryUnits || 0,
        wastedUnits: payload.wastedUnits || 0,
        dimensions: {
          itemId: payload.itemId || 'item-gen',
          isStockout,
        },
        measures: {
          stockLevel: stock,
          daysOfSupply: payload.daysOfSupply || Math.max(0, Math.floor(stock / 5)),
          stockoutCount: isStockout ? 1 : 0,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 8. REFERRAL
    else if (eventName.includes('REFERRAL')) {
      const hasOutcome = Boolean(payload.hasOutcome || payload.outcome || payload.status === 'completed' || payload.status === 'COMPLETED');
      const fact: ReferralFact = {
        factId: baseId,
        factType: 'REFERRAL',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        destinationFacilityId: payload.destinationFacilityId || payload.toFacilityId || 'fac_unknown',
        specialty: payload.specialty || 'General Practice',
        urgency: payload.urgency || payload.priority || 'routine',
        status: payload.status || 'SUBMITTED',
        acceptanceDurationHours: payload.acceptanceDurationHours || 4,
        transitHours: payload.transitHours || 2,
        hasOutcome,
        dimensions: {
          destinationFacilityId: payload.destinationFacilityId || payload.toFacilityId || 'fac_unknown',
          specialty: payload.specialty || 'General Practice',
          urgency: payload.urgency || payload.priority || 'routine',
          status: payload.status || 'SUBMITTED',
        },
        measures: {
          count: 1,
          completedCount: hasOutcome ? 1 : 0,
          acceptanceDurationHours: payload.acceptanceDurationHours || 4,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    // 9. EMERGENCY
    else if (eventName.includes('EMERGENCY')) {
      const triageLevel = payload.triageLevel || payload.currentTriageLevel || 'SATS_YELLOW';
      const isTransferred = Boolean(payload.isTransferred || payload.status === 'TRANSFERRED' || payload.status === 'TRANSFER_REQUESTED');
      const fact: EmergencyFact = {
        factId: baseId,
        factType: 'EMERGENCY',
        sourceEventId: event.eventId,
        sourceAggregateId: event.aggregateId,
        sourceFacilityId: facilityId,
        sourceNodeId: event.deviceId,
        eventTimestamp: timestamp,
        ingestionTimestamp: new Date().toISOString(),
        reportingPeriod,
        triageLevel,
        arrivalMode: payload.arrivalMode || 'WALK_IN',
        waitTimeMinutes: payload.waitTimeMinutes || 15,
        disposition: payload.disposition || 'DISCHARGE',
        isTransferred,
        dimensions: {
          triageLevel,
          arrivalMode: payload.arrivalMode || 'WALK_IN',
          disposition: payload.disposition || 'DISCHARGE',
        },
        measures: {
          count: 1,
          waitTimeMinutes: payload.waitTimeMinutes || 15,
          isTransferredCount: isTransferred ? 1 : 0,
        },
        provenance: {
          actorId: event.actorId,
          actorRole: event.metadata?.userRole,
          systemVersion: 'V14.0',
          sourceType: 'DOMAIN_EVENT',
        },
        dataQualityStatus: 'VALID',
        correctionVersion: event.version || 1,
        integrityHash: '',
      };
      fact.integrityHash = sha256(JSON.stringify({ ...fact, integrityHash: '' }));
      derivedFact = fact;
    }

    if (derivedFact) {
      await this.saveFact(derivedFact);
    }

    return derivedFact;
  }

  /**
   * Directly saves an analytical fact into storage and cache.
   */
  public async saveFact(fact: AnalyticalFact): Promise<void> {
    await this.ensureInitialized();
    this.memoryCache.set(fact.factId, fact);
    try {
      await idbEngine.put('analyticalFacts', fact);
    } catch {
      // Memory fallback
    }
  }

  /**
   * Ingests a batch of domain events.
   */
  public async ingestBatch(events: DomainEvent[]): Promise<number> {
    let count = 0;
    for (const evt of events) {
      const res = await this.ingestDomainEvent(evt);
      if (res) count++;
    }
    return count;
  }

  /**
   * Queries stored facts with optional filtering.
   */
  public async getFacts(filter?: FactFilter): Promise<AnalyticalFact[]> {
    await this.ensureInitialized();
    let list = Array.from(this.memoryCache.values());

    if (!filter) return list;

    if (filter.factType) {
      list = list.filter((f) => f.factType === filter.factType);
    }
    if (filter.facilityId && filter.facilityId !== '*') {
      list = list.filter((f) => f.sourceFacilityId === filter.facilityId);
    }
    if (filter.reportingPeriod) {
      list = list.filter((f) => f.reportingPeriod === filter.reportingPeriod);
    }
    if (filter.fromTimestamp) {
      list = list.filter((f) => f.eventTimestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      list = list.filter((f) => f.eventTimestamp <= filter.toTimestamp!);
    }
    if (filter.dataQualityStatus) {
      list = list.filter((f) => f.dataQualityStatus === filter.dataQualityStatus);
    }

    return list.sort((a, b) => new Date(a.eventTimestamp).getTime() - new Date(b.eventTimestamp).getTime());
  }

  public async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await idbEngine.clear('analyticalFacts');
    } catch {
      // Memory fallback
    }
  }
}

export const analyticalFactStore = AnalyticalFactStore.getInstance();
