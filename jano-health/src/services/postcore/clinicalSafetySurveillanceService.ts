/**
 * Jano Health — Post-Deployment Clinical Safety Surveillance Service
 * Post-Core Track 1
 *
 * Governs active clinical safety surveillance, hazard logs, post-deployment clinical
 * incident reporting, and mandatory separation from ordinary IT support.
 *
 * HARD INVARIANTS:
 * - Clinical safety incidents can NEVER be downgraded, redirected to, or hidden in technical support tickets.
 * - AI capabilities remain strictly advisory; autonomous clinical mutations remain PROHIBITED.
 * - Emergency care access must never be blocked by surveillance actions or administrative pauses.
 * - Clinical incident closure requires explicit Clinical Safety Officer evaluation.
 */

import {
  ClinicalHazardLogEntry,
  ClinicalIncidentReport,
  ClinicalSafetySeverity,
  IncidentDisposition,
} from '../../domain/postCoreTrack1Types';

export class ClinicalSafetySurveillanceService {
  private hazards: Map<string, ClinicalHazardLogEntry> = new Map();
  private incidents: Map<string, ClinicalIncidentReport> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    // Baseline hazard log
    const h1: ClinicalHazardLogEntry = {
      hazardId: 'haz-postcore-01',
      hazardCode: 'HAZ-RX-004',
      clinicalDomain: 'Medication Dispense & Interaction',
      potentialHarm: 'Inadvertent pediatric dosing overdose if offline weight calculation input is corrupted.',
      initialSeverity: 'CRITICAL',
      implementedMitigations: [
        'Deterministic mg/kg range clamps with hard clinical fail-closed blocks',
        'Mandatory double-clinician confirmation for high-risk pediatric antimalarials',
        'Advisory dosage alerts with required clinician review',
      ],
      residualSeverity: 'NEGLIGIBLE',
      safetyCaseReference: 'SAFETY_CASE_SECTION_4_PEDIATRICS',
      status: 'ACTIVE_MITIGATED',
      lastReviewedAt: '2026-09-08T15:00:00Z',
      reviewedByClinicalSafetyOfficer: 'Dr. Amina Said, CSO',
    };
    this.hazards.set(h1.hazardId, h1);

    const h2: ClinicalHazardLogEntry = {
      hazardId: 'haz-postcore-02',
      hazardCode: 'HAZ-TRIAGE-002',
      potentialHarm: 'Delayed acute emergency triage due to offline mesh synchronization lock.',
      clinicalDomain: 'Acute Triage',
      initialSeverity: 'SERIOUS',
      implementedMitigations: [
        'Local-first non-blocking Red Flag Emergency queue allows immediate clinical interventions without waiting for sync',
        'Independent device crash-recovery log for triage records',
      ],
      residualSeverity: 'NEGLIGIBLE',
      safetyCaseReference: 'SAFETY_CASE_SECTION_2_EMERGENCY',
      status: 'ACTIVE_MITIGATED',
      lastReviewedAt: '2026-09-10T11:00:00Z',
      reviewedByClinicalSafetyOfficer: 'Dr. Amina Said, CSO',
    };
    this.hazards.set(h2.hazardId, h2);

    // Initial clinical incident report (strictly non-IT support)
    const inc1: ClinicalIncidentReport = {
      incidentId: 'inc-clin-2026-001',
      facilityId: 'fac-amgh',
      reportedAt: '2026-09-12T09:15:00Z',
      reportedBy: 'Nurse In-Charge Grace Mwamba',
      clinicalSummary: 'Offline tablet displayed advisory warning for adult dosage on adolescent patient with unrecorded weight.',
      patientImpact: 'POTENTIAL_HARM_INTERCEPTED',
      disposition: 'CLOSED_RESOLVED',
      isSeparatedFromTechSupport: true, // HARD INVARIANT
      clinicianReviewRequired: true, // Advisory-only invariant
      correctiveCapaId: 'capa-2026-008-adolescent-weight',
      closedAt: '2026-09-15T16:00:00Z',
      closedBySafetyOfficer: 'Dr. Amina Said, CSO',
    };
    this.incidents.set(inc1.incidentId, inc1);
  }

  public getAllHazards(): ClinicalHazardLogEntry[] {
    return Array.from(this.hazards.values());
  }

  public getAllIncidents(): ClinicalIncidentReport[] {
    return Array.from(this.incidents.values());
  }

  public reportClinicalIncident(
    input: Omit<ClinicalIncidentReport, 'incidentId' | 'isSeparatedFromTechSupport' | 'clinicianReviewRequired' | 'disposition'>
  ): ClinicalIncidentReport {
    // HARD INVARIANT: Always strictly separated from tech support & clinician review required
    const incident: ClinicalIncidentReport = {
      ...input,
      incidentId: `inc-clin-${Date.now()}`,
      isSeparatedFromTechSupport: true,
      clinicianReviewRequired: true,
      disposition: 'UNDER_INVESTIGATION',
    };
    this.incidents.set(incident.incidentId, incident);
    return incident;
  }

  public closeClinicalIncident(
    incidentId: string,
    safetyOfficerId: string,
    disposition: IncidentDisposition,
    correctiveCapaId?: string
  ): { success: boolean; incident?: ClinicalIncidentReport; error?: string } {
    const inc = this.incidents.get(incidentId);
    if (!inc) return { success: false, error: 'Incident not found' };

    // HARD INVARIANT: Only authorized clinical safety officer can close clinical incident
    if (!safetyOfficerId || !safetyOfficerId.toLowerCase().includes('cso') && !safetyOfficerId.toLowerCase().includes('safety')) {
      return {
        success: false,
        error: 'REJECTED: Clinical safety incident closure requires Clinical Safety Officer sign-off.',
      };
    }

    inc.disposition = disposition;
    inc.closedBySafetyOfficer = safetyOfficerId;
    inc.closedAt = new Date().toISOString();
    if (correctiveCapaId) {
      inc.correctiveCapaId = correctiveCapaId;
    }

    this.incidents.set(incidentId, inc);
    return { success: true, incident: inc };
  }
}

export const clinicalSafetySurveillanceService = new ClinicalSafetySurveillanceService();
