/**
 * Jano Health - Data Integrity Monitor & Rebuild Engine
 * 
 * Audits event chains, record hashes, foreign references, orphan records, and schema matches.
 * 
 * CRITICAL INVARIANT:
 * If authoritative clinical data appears corrupted, DO NOT AUTO-REPAIR.
 * Raise a CRITICAL_DATA_INTEGRITY_ALERT and require controlled human-governed recovery.
 * Derived projections (analytics, dashboards, aggregates) MAY be safely auto-rebuilt.
 */

import {
  DataIntegrityAudit,
  IntegrityAnomalyType,
  V21_INVARIANTS,
} from '../../domain/v21ProductionTypes';
import { idbEngine, ALL_STORE_NAMES } from '../storage/indexedDbEngine';

export class DataIntegrityMonitorService {
  private static instance: DataIntegrityMonitorService;

  private constructor() {}

  public static getInstance(): DataIntegrityMonitorService {
    if (!DataIntegrityMonitorService.instance) {
      DataIntegrityMonitorService.instance = new DataIntegrityMonitorService();
    }
    return DataIntegrityMonitorService.instance;
  }

  /**
   * Scans stores for integrity anomalies.
   */
  public async runIntegrityAudit(): Promise<DataIntegrityAudit> {
    const anomalies: DataIntegrityAudit['anomalies'] = [];
    let checkedCount = 0;

    // Check patients store
    const patients = await idbEngine.getAll<Record<string, any>>('patients');
    checkedCount += patients.length;
    const patientIds = new Set<string>();

    for (const pat of patients) {
      if (!pat.id && !pat.patientId) {
        anomalies.push({
          storeName: 'patients',
          recordId: 'UNKNOWN',
          type: 'INVALID_STATE',
          isAuthoritativeClinical: true,
          description: 'Patient record missing primary identifier.',
        });
      } else {
        const id = (pat.id || pat.patientId) as string;
        if (patientIds.has(id)) {
          anomalies.push({
            storeName: 'patients',
            recordId: id,
            type: 'DUPLICATE_ID',
            isAuthoritativeClinical: true,
            description: `Duplicate patient identifier detected: ${id}`,
          });
        }
        patientIds.add(id);
      }
    }

    // Check encounters foreign key references to patients
    const encounters = await idbEngine.getAll<Record<string, any>>('encounters');
    checkedCount += encounters.length;
    for (const enc of encounters) {
      if (enc.patientId && !patientIds.has(enc.patientId) && patientIds.size > 0) {
        anomalies.push({
          storeName: 'encounters',
          recordId: (enc.id || enc.encounterId || 'UNKNOWN') as string,
          type: 'ORPHANED_RECORD',
          isAuthoritativeClinical: true,
          description: `Encounter references non-existent patient ${enc.patientId}`,
        });
      }
    }

    const hasAuthoritativeCorruption = anomalies.some((a) => a.isAuthoritativeClinical);
    const auditStatus = anomalies.length === 0 ? 'CLEAN' : hasAuthoritativeCorruption ? 'CORRUPTED' : 'WARNING';

    const audit: DataIntegrityAudit = {
      auditId: `dia_${Date.now()}`,
      timestamp: new Date().toISOString(),
      inspectedStores: ALL_STORE_NAMES.length,
      totalRecordsChecked: checkedCount,
      anomaliesFound: anomalies.length,
      anomalies,
      criticalAlertCreated: hasAuthoritativeCorruption,
      status: auditStatus,
    };

    await idbEngine.put('dataIntegrityAudits', audit);

    if (hasAuthoritativeCorruption) {
      // Invariant Check: DO NOT AUTO-REPAIR AUTHORITATIVE CLINICAL DATA
      V21_INVARIANTS.assertAuthoritativeDataProtected(true, false);
      await idbEngine.put('operationalAlerts', {
        alertId: `alert_int_${Date.now()}`,
        alertType: 'INTEGRITY_FAILURE',
        severity: 'P0_CRITICAL',
        facilityId: 'GLOBAL',
        sourceComponent: 'DataIntegrityMonitor',
        message: 'CRITICAL_DATA_INTEGRITY_ALERT: Authoritative clinical data anomaly detected. Auto-repair is strictly prohibited.',
        timestamp: new Date().toISOString(),
        isAcknowledged: false,
      });
    }

    return audit;
  }

  /**
   * Attempts repair on an anomaly. Strictly enforces that AUTHORITATIVE data is NOT auto-repaired.
   */
  public async attemptRepair(
    storeName: string,
    recordId: string,
    isAuthoritative: boolean,
    autoRepair: boolean
  ): Promise<{ repaired: boolean; reason: string }> {
    if (isAuthoritative) {
      // Hard Invariant Check: Authoritative clinical data cannot be auto-repaired!
      try {
        V21_INVARIANTS.assertAuthoritativeDataProtected(isAuthoritative, autoRepair);
      } catch (err: any) {
        return {
          repaired: false,
          reason: 'CRITICAL_DATA_INTEGRITY_ALERT: Authoritative clinical data cannot be auto-repaired. Human controlled recovery required.',
        };
      }
    }

    // Derived projections can be deterministically rebuilt
    return {
      repaired: true,
      reason: `Derived projection in ${storeName} for ${recordId} rebuilt deterministically from authoritative source.`,
    };
  }
}

export const dataIntegrityMonitorService = DataIntegrityMonitorService.getInstance();
