/**
 * Jano Health - Facility Provisioning Service (V25)
 * Governs facility baseline configuration, role sets, sync topologies,
 * and audited deviations from approved templates.
 * 
 * HARD INVARIANTS:
 * - Every deviation from an approved baseline template must be recorded explicitly.
 * - PII redaction in telemetry is strictly enforced during provisioning.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import { FacilityProvisioningRecord } from '../../domain/v25ScaleOperationsTypes';

export class FacilityProvisioningService {
  private records: Map<string, FacilityProvisioningRecord> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    const prov1: FacilityProvisioningRecord = {
      provisioningId: 'prov-amani-001',
      tenantId: 'tenant-prod-ea-moh',
      organizationId: 'org-turkana-health-trust',
      facilityId: 'fac-amani-primary-clinic',
      templateId: 'tpl-standard-primary-clinic-v25',
      approvedRoles: ['physician', 'nurse', 'health_officer', 'facility_administrator'],
      approvedModules: ['PATIENT_MASTER', 'ENCOUNTERS', 'OFFLINE_SYNC', 'TRIAGE', 'MEDICATIONS', 'LABORATORY'],
      terminologyCatalogVersion: 'ICD-11-2026.03-WHO-AFRO',
      medicationKnowledgeVersion: 'EDL-KENYA-2025.2',
      syncTopologyRole: 'FACILITY_NODE',
      deviceProfile: 'PROFILE_RUGGED_TABLET_LOW_BANDWIDTH',
      backupConfig: {
        schedule: '0 2 * * *',
        retentionDays: 90,
        destination: 'LOCAL_ATTACHED_AND_REGIONAL_S3',
      },
      telemetryConfig: {
        piiRedactionEnforced: true,
        samplingRatePct: 100,
      },
      supportRoutingQueue: 'QUEUE_RURAL_PRIMARY_SUPPORT',
      externalIntegrationIds: ['ext-int-national-dhis2'],
      deviationsFromBaseline: ['SOLAR_INVERTER_DELAYED_SYNC_WINDOW'],
      provisionedAt: '2026-06-08T10:00:00Z',
      status: 'ACTIVE',
    };
    this.records.set(prov1.facilityId, prov1);
  }

  public async getProvisioning(facilityId: string): Promise<FacilityProvisioningRecord | null> {
    return this.records.get(facilityId) || null;
  }

  public async listProvisionings(): Promise<FacilityProvisioningRecord[]> {
    return Array.from(this.records.values());
  }

  public async provisionFacility(
    record: Omit<FacilityProvisioningRecord, 'provisioningId' | 'provisionedAt' | 'status'>
  ): Promise<FacilityProvisioningRecord> {
    const provisioningId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const fullRecord: FacilityProvisioningRecord = {
      ...record,
      provisioningId,
      provisionedAt: new Date().toISOString(),
      status: 'ACTIVE',
      telemetryConfig: {
        piiRedactionEnforced: true, // Permanent invariant
        samplingRatePct: record.telemetryConfig?.samplingRatePct ?? 100,
      },
    };

    this.records.set(fullRecord.facilityId, fullRecord);
    await idbEngine.put('organizationFacilities', fullRecord);
    return fullRecord;
  }

  public async recordDeviation(facilityId: string, deviationDescription: string): Promise<FacilityProvisioningRecord> {
    const prov = this.records.get(facilityId);
    if (!prov) throw new Error(`Facility provisioning for ${facilityId} not found`);

    if (!prov.deviationsFromBaseline.includes(deviationDescription)) {
      prov.deviationsFromBaseline.push(deviationDescription);
    }

    this.records.set(facilityId, prov);
    await idbEngine.put('organizationFacilities', prov);
    return prov;
  }
}

export const facilityProvisioningService = new FacilityProvisioningService();
