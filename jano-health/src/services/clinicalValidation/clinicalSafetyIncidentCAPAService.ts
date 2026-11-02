/**
 * Jano Health - Clinical Safety Incident, Near-Miss & CAPA Service (Clinical Core V22)
 * 
 * Manages clinical safety incident reporting, near-misses, root-cause analyses,
 * and corrective & preventive actions (CAPA).
 * 
 * Invariant: Strict separation between technical incidents and clinical safety incidents.
 * Technical incident does not automatically imply patient harm.
 */

import {
  ClinicalSafetyIncident,
  ClinicalIncidentType,
} from '../../domain/v22ClinicalValidationTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class ClinicalSafetyIncidentCAPAService {
  private static instance: ClinicalSafetyIncidentCAPAService;

  private constructor() {}

  public static getInstance(): ClinicalSafetyIncidentCAPAService {
    if (!ClinicalSafetyIncidentCAPAService.instance) {
      ClinicalSafetyIncidentCAPAService.instance = new ClinicalSafetyIncidentCAPAService();
    }
    return ClinicalSafetyIncidentCAPAService.instance;
  }

  /**
   * Reports a clinical safety incident or near-miss.
   */
  public async reportIncident(
    incidentType: ClinicalIncidentType,
    facilityId: string,
    severity: ClinicalSafetyIncident['severity'],
    patientHarmOccurred: boolean,
    clinicalSummary: string
  ): Promise<ClinicalSafetyIncident> {
    const incidentId = `csi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const incident: ClinicalSafetyIncident = {
      incidentId,
      incidentType,
      facilityId,
      reportedAt: new Date().toISOString(),
      severity,
      patientHarmOccurred,
      clinicalSummary,
      correctiveActions: [],
      preventiveActions: [],
      status: 'REPORTED',
    };

    await idbEngine.put('clinicalSafetyIncidents', incident);
    return incident;
  }

  /**
   * Records a Root Cause Analysis and links CAPA actions.
   */
  public async attachRCAAndCAPA(
    incidentId: string,
    rootCauseAnalysis: string,
    correctiveActions: string[],
    preventiveActions: string[]
  ): Promise<ClinicalSafetyIncident> {
    const incident = await idbEngine.get<ClinicalSafetyIncident>('clinicalSafetyIncidents', incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);

    incident.rootCauseAnalysis = rootCauseAnalysis;
    incident.correctiveActions.push(...correctiveActions);
    incident.preventiveActions.push(...preventiveActions);
    incident.status = 'CAPA_PENDING';

    await idbEngine.put('clinicalSafetyIncidents', incident);
    await idbEngine.put('clinicalCAPARecords', {
      capaId: `capa_${incidentId}`,
      incidentId,
      rootCauseAnalysis,
      correctiveActions,
      preventiveActions,
      status: 'PENDING_VERIFICATION',
      recordedAt: new Date().toISOString(),
    });

    return incident;
  }

  /**
   * Formally closes an incident after CAPA verification.
   */
  public async closeIncident(
    incidentId: string,
    closedBy: string
  ): Promise<ClinicalSafetyIncident> {
    const incident = await idbEngine.get<ClinicalSafetyIncident>('clinicalSafetyIncidents', incidentId);
    if (!incident) throw new Error(`Incident not found: ${incidentId}`);

    if (incident.correctiveActions.length === 0) {
      throw new Error('CAPA_VIOLATION: Incident cannot be closed without at least one corrective action documented.');
    }

    incident.status = 'CLOSED';
    incident.closedBy = closedBy;
    incident.closedAt = new Date().toISOString();

    await idbEngine.put('clinicalSafetyIncidents', incident);
    return incident;
  }
}

export const clinicalSafetyIncidentCAPAService = ClinicalSafetyIncidentCAPAService.getInstance();
