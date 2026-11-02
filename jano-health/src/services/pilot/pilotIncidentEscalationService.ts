/**
 * Jano Health - Pilot Incident & Escalation Operations Service (Clinical Core V23)
 * 
 * Governs:
 * - Real-world operational and clinical incidents (P0_CRITICAL to P3_LOW)
 * - Domains: TECHNICAL, CLINICAL, SECURITY, PRIVACY, AI
 * - Formal escalation workflows across leadership tiers
 * - HARD INVARIANT: Clinical safety incidents can NEVER be auto-closed.
 *   They require containment, investigation, CAPA verification, and authorized Safety Officer signoff.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  PilotSafetyIncident,
  PilotEscalation,
  PilotIncidentSeverity,
  PilotIncidentType,
} from '../../domain/v23ControlledPilotTypes';

export class PilotIncidentEscalationService {
  private static instance: PilotIncidentEscalationService;

  private constructor() {}

  public static getInstance(): PilotIncidentEscalationService {
    if (!PilotIncidentEscalationService.instance) {
      PilotIncidentEscalationService.instance = new PilotIncidentEscalationService();
    }
    return PilotIncidentEscalationService.instance;
  }

  /**
   * Logs a pilot operational or clinical incident
   */
  public async logIncident(
    siteId: string,
    severity: PilotIncidentSeverity,
    type: PilotIncidentType,
    title: string,
    description: string,
    potentialHarm: string,
    reportedBy: string,
    affectedWorkflow?: string
  ): Promise<PilotSafetyIncident> {
    const incidentId = `inc-${siteId}-${Date.now()}`;

    const incident: PilotSafetyIncident = {
      incidentId,
      siteId,
      severity,
      type,
      title,
      description,
      status: 'LOGGED',
      affectedWorkflow,
      potentialHarm,
      reportedBy,
      noPatientHarmConfirmed: false,
      createdAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSafetyIncidents', incident);
    return incident;
  }

  /**
   * Escalates an incident to higher governance tiers
   */
  public async escalateIncident(
    incidentId: string,
    level: PilotEscalation['level'],
    escalatedBy: string,
    reason: string
  ): Promise<PilotEscalation> {
    const incident = await idbEngine.get<PilotSafetyIncident>('pilotSafetyIncidents', incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    const escalationId = `esc-${incidentId}-${Date.now()}`;
    const escalation: PilotEscalation = {
      escalationId,
      incidentId,
      siteId: incident.siteId,
      level,
      escalatedAt: new Date().toISOString(),
      escalatedBy,
      reason,
    };

    const updatedIncident: PilotSafetyIncident = {
      ...incident,
      status: 'UNDER_INVESTIGATION',
    };

    await idbEngine.put('pilotEscalations', escalation);
    await idbEngine.put('pilotSafetyIncidents', updatedIncident);

    return escalation;
  }

  /**
   * Applies containment actions and links CAPA
   */
  public async applyContainmentAndCAPA(
    incidentId: string,
    containmentAction: string,
    capaReference: string,
    investigator: string
  ): Promise<PilotSafetyIncident> {
    const incident = await idbEngine.get<PilotSafetyIncident>('pilotSafetyIncidents', incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    const updated: PilotSafetyIncident = {
      ...incident,
      containmentAction,
      capaReference,
      assignedInvestigator: investigator,
      status: 'CAPA_PENDING',
    };

    await idbEngine.put('pilotSafetyIncidents', updated);
    return updated;
  }

  /**
   * Formally closes an incident.
   * HARD INVARIANT: If incident type is CLINICAL or AI, requires safety officer signoff
   * and confirmation that no patient harm occurred.
   */
  public async closeIncident(
    incidentId: string,
    safetyOfficerSignoff: string,
    noPatientHarmConfirmed: boolean
  ): Promise<PilotSafetyIncident> {
    const incident = await idbEngine.get<PilotSafetyIncident>('pilotSafetyIncidents', incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found.`);

    if ((incident.type === 'CLINICAL' || incident.type === 'AI') && !noPatientHarmConfirmed) {
      throw new Error('SAFETY INVARIANT VIOLATION: Clinical/AI incidents cannot be closed without confirmed absence of patient harm or formal adverse event outcome verification.');
    }

    if (!safetyOfficerSignoff || safetyOfficerSignoff.trim().length === 0) {
      throw new Error('GOVERNANCE INVARIANT: Clinical Safety Officer signoff is required to close pilot safety incidents.');
    }

    const updated: PilotSafetyIncident = {
      ...incident,
      status: 'CLOSED',
      clinicalSafetyOfficerSignoff: safetyOfficerSignoff,
      noPatientHarmConfirmed,
      closedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSafetyIncidents', updated);
    return updated;
  }

  /**
   * Lists unresolved incidents for a site
   */
  public async listOpenIncidents(siteId?: string): Promise<PilotSafetyIncident[]> {
    const all = await idbEngine.list<PilotSafetyIncident>('pilotSafetyIncidents');
    return all.filter((i) => {
      const siteMatches = !siteId || i.siteId === siteId;
      const isOpen = i.status !== 'CLOSED' && i.status !== 'RESOLVED';
      return siteMatches && isOpen;
    });
  }
}

export const pilotIncidentEscalationService = PilotIncidentEscalationService.getInstance();
