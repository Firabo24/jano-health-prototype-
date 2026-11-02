/**
 * Jano Health - Production Observability Service (V25)
 * Collects privacy-preserving operational metrics, latency, error rates, and sync health.
 * 
 * HARD INVARIANTS:
 * - Telemetry is strictly privacy-preserving and purpose-limited.
 * - Zero patient identities, clinical diagnoses, or clinical notes are emitted in telemetry.
 * - All telemetry records enforce piiRedacted = true.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import { ServiceHealthObservation } from '../../domain/v25ScaleOperationsTypes';

export class ProductionObservabilityService {
  private healthObservations: Map<string, ServiceHealthObservation> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const s1: ServiceHealthObservation = {
      healthId: 'hlth-obs-sync-engine',
      tenantId: 'tenant-prod-ea-moh',
      facilityId: 'fac-amani-primary-clinic',
      serviceName: 'OfflineSyncEngine',
      status: 'HEALTHY',
      latencyP95Ms: 42,
      errorRatePct: 0.02,
      storagePressurePct: 14.5,
      queueDepth: 4,
      syncLagSec: 18,
      dependencyStatus: 'ALL_ONLINE',
      privacyPreserved: true,
      piiRedacted: true,
      observedAt: '2026-06-12T09:15:00Z',
    };
    this.healthObservations.set(s1.healthId, s1);

    const s2: ServiceHealthObservation = {
      healthId: 'hlth-obs-idb-persistence',
      tenantId: 'tenant-prod-ea-moh',
      facilityId: 'fac-amani-primary-clinic',
      serviceName: 'IndexedDbPersistence',
      status: 'HEALTHY',
      latencyP95Ms: 12,
      errorRatePct: 0.0,
      storagePressurePct: 18.2,
      queueDepth: 0,
      syncLagSec: 0,
      dependencyStatus: 'ALL_ONLINE',
      privacyPreserved: true,
      piiRedacted: true,
      observedAt: '2026-06-12T09:15:00Z',
    };
    this.healthObservations.set(s2.healthId, s2);
  }

  public async recordObservation(
    params: Omit<ServiceHealthObservation, 'healthId' | 'privacyPreserved' | 'piiRedacted'>
  ): Promise<ServiceHealthObservation> {
    const healthId = `hlth-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const obs: ServiceHealthObservation = {
      ...params,
      healthId,
      privacyPreserved: true, // Permanent invariant
      piiRedacted: true, // Permanent invariant
    };

    this.healthObservations.set(obs.healthId, obs);
    await idbEngine.put('serviceHealthObservations', obs);
    return obs;
  }

  public async getObservation(healthId: string): Promise<ServiceHealthObservation | null> {
    return this.healthObservations.get(healthId) || null;
  }

  public async listObservations(facilityId?: string): Promise<ServiceHealthObservation[]> {
    const all = Array.from(this.healthObservations.values());
    if (facilityId) return all.filter((o) => o.facilityId === facilityId);
    return all;
  }
}

export const productionObservabilityService = new ProductionObservabilityService();
