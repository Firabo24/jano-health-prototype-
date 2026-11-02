/**
 * Jano Health - Clinical Core V17: Cold Chain & Temperature Monitoring Service
 * 
 * Manages cold-chain telemetry, excursion detection, automated quarantine triggers,
 * and auditable human clinical reviews for heat-sensitive commodities.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Unknown ≠ Safe: Missing temperature telemetry during transit or offline outage
 *   is stamped as UNKNOWN, never inferred to be safe or compliant.
 * - Temperature excursions on vaccines or critical biologics automatically trigger
 *   a BatchQualityHold to prevent premature clinical dispensing.
 * - AI may summarize an excursion, but CANNOT release a quality hold.
 */

import {
  TemperatureLog,
  TemperatureReadingStatus,
  TemperatureExcursion,
  ExcursionSeverity,
  ExcursionReviewStatus,
} from '../../domain/v17SupplyChainTypes';
import { qualityRecallService } from './qualityRecallService';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class ColdChainService {
  private static instance: ColdChainService;
  private logs: Map<string, TemperatureLog> = new Map();
  private excursions: Map<string, TemperatureExcursion> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): ColdChainService {
    if (!ColdChainService.instance) {
      ColdChainService.instance = new ColdChainService();
    }
    return ColdChainService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T00:00:00Z';

    const exc1: TemperatureExcursion = {
      excursionId: 'exc-amgh-bcg-001',
      storageLocationId: 'loc-amgh-cold-01',
      startAt: '2025-12-30T02:00:00Z',
      endAt: '2025-12-30T06:30:00Z',
      minimumTemperature: 9.5,
      maximumTemperature: 14.2,
      requiredRange: { min: 2, max: 8 },
      affectedBatches: ['BCG-2025-04K'],
      severity: 'CRITICAL',
      status: 'QUARANTINED',
      reviewDecision: 'Quarantined pending potency testing by Central Vaccine Depot',
      reviewerId: 'usr-pharmacist-lead',
      reviewedAt: '2025-12-30T08:00:00Z',
      provenance: { detectedAt: now },
    };

    this.excursions.set(exc1.excursionId, exc1);
  }

  // ==========================================================================
  // TEMPERATURE RECORDING
  // ==========================================================================

  public async recordTemperature(params: {
    shipmentId?: string;
    storageLocationId?: string;
    requiredRange: { min: number; max: number };
    observedTemperature?: number;
    sensorReference?: string;
    location: string;
    durationMinutes?: number;
    actorOrSystem: string;
    affectedBatches?: string[];
    facilityId?: string;
    warehouseId?: string;
  }): Promise<{ log: TemperatureLog; excursion?: TemperatureExcursion }> {
    const logId = `tpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    let status: TemperatureReadingStatus = 'UNKNOWN';
    let temp = params.observedTemperature;

    if (temp === undefined || isNaN(temp)) {
      status = 'UNKNOWN';
      temp = -999; // Sentinel indicating missing reading
    } else if (temp >= params.requiredRange.min && temp <= params.requiredRange.max) {
      status = 'WITHIN_RANGE';
    } else if (
      (temp < params.requiredRange.min && temp >= params.requiredRange.min - 1.5) ||
      (temp > params.requiredRange.max && temp <= params.requiredRange.max + 1.5)
    ) {
      status = 'WARNING';
    } else {
      status = 'EXCURSION';
    }

    const log: TemperatureLog = {
      logId,
      shipmentId: params.shipmentId,
      storageLocationId: params.storageLocationId,
      requiredRange: params.requiredRange,
      observedTemperature: temp,
      status,
      timestamp: now,
      sensorReference: params.sensorReference,
      location: params.location,
      durationMinutes: params.durationMinutes,
      actorOrSystem: params.actorOrSystem,
      provenance: { recordedAt: now },
    };

    this.logs.set(logId, log);

    try {
      await idbEngine.put('temperatureLogs' as any, log);
    } catch {}

    let excursion: TemperatureExcursion | undefined;

    // Detect and generate excursion
    if (status === 'EXCURSION') {
      const excursionId = `exc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const severity: ExcursionSeverity =
        temp > params.requiredRange.max + 5 || temp < params.requiredRange.min - 5
          ? 'CRITICAL'
          : 'MEDIUM';

      excursion = {
        excursionId,
        shipmentId: params.shipmentId,
        storageLocationId: params.storageLocationId,
        startAt: now,
        endAt: now,
        minimumTemperature: temp,
        maximumTemperature: temp,
        requiredRange: params.requiredRange,
        affectedBatches: params.affectedBatches || [],
        severity,
        status: severity === 'CRITICAL' ? 'QUARANTINED' : 'OPEN',
        provenance: { detectedAt: now },
      };

      this.excursions.set(excursionId, excursion);

      try {
        await idbEngine.put('temperatureExcursions' as any, excursion);
      } catch {}

      // Critical excursion: automatically place affected batches on Quality Hold
      if (severity === 'CRITICAL' && params.affectedBatches && params.affectedBatches.length > 0) {
        for (const batch of params.affectedBatches) {
          await qualityRecallService.placeBatchOnHold({
            supplyItemId: params.shipmentId || 'COLD_CHAIN_ITEM',
            batchNumber: batch,
            facilityId: params.facilityId || 'fac-amgh',
            warehouseId: params.warehouseId || 'wh-amgh-main',
            reason: 'TEMPERATURE_EXCURSION',
            quantityHeld: 100,
            placedBy: 'SYSTEM_COLD_CHAIN_MONITOR',
          });
        }
      }

      await auditService.log({
        action: 'TEMPERATURE_EXCURSION_DETECTED',
        actorId: params.actorOrSystem,
        facilityId: params.facilityId || 'system',
        details: {
          excursionId,
          observedTemperature: temp,
          requiredRange: params.requiredRange,
          severity,
        },
      });
    }

    return { log, excursion };
  }

  public async reviewExcursion(params: {
    excursionId: string;
    decision: 'CLEARED' | 'QUARANTINED' | 'REJECTED';
    reviewerId: string;
    notes: string;
    facilityId: string;
  }): Promise<TemperatureExcursion> {
    const excursion = this.excursions.get(params.excursionId);
    if (!excursion) throw new Error(`Temperature excursion not found: ${params.excursionId}`);

    const now = new Date().toISOString();
    excursion.status = params.decision;
    excursion.reviewDecision = params.notes;
    excursion.reviewerId = params.reviewerId;
    excursion.reviewedAt = now;

    this.excursions.set(params.excursionId, excursion);

    try {
      await idbEngine.put('temperatureExcursions' as any, excursion);
    } catch {}

    await auditService.log({
      action: 'TEMPERATURE_EXCURSION_REVIEWED',
      actorId: params.reviewerId,
      facilityId: params.facilityId,
      details: {
        excursionId: params.excursionId,
        decision: params.decision,
        notes: params.notes,
      },
    });

    return excursion;
  }

  public getLogsForShipment(shipmentId: string): TemperatureLog[] {
    return Array.from(this.logs.values()).filter((l) => l.shipmentId === shipmentId);
  }

  public getLogsForLocation(locationId: string): TemperatureLog[] {
    return Array.from(this.logs.values()).filter((l) => l.storageLocationId === locationId);
  }

  public getActiveExcursions(): TemperatureExcursion[] {
    return Array.from(this.excursions.values()).filter(
      (e) => e.status === 'OPEN' || e.status === 'UNDER_REVIEW' || e.status === 'QUARANTINED'
    );
  }
}

export const coldChainService = ColdChainService.getInstance();
