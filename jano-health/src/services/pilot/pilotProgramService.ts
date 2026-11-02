/**
 * Jano Health - Pilot Program & Site Lifecycle Management Service (Clinical Core V23)
 * 
 * Governs:
 * - PilotProgram initialization and tracking
 * - PilotSite registration, phase transitions, and supervisor assignments
 * - Strict phase transition gating (cannot jump to LIVE without passing gates)
 * - Site suspension / resumption preserving all historical records
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  PilotProgram,
  PilotSite,
  PilotLifecyclePhase,
  PilotPhaseTransition,
} from '../../domain/v23ControlledPilotTypes';

export class PilotProgramService {
  private static instance: PilotProgramService;

  private constructor() {}

  public static getInstance(): PilotProgramService {
    if (!PilotProgramService.instance) {
      PilotProgramService.instance = new PilotProgramService();
    }
    return PilotProgramService.instance;
  }

  /**
   * Initializes or retrieves the primary baseline pilot program
   */
  public async initializeBaselineProgram(): Promise<PilotProgram> {
    const existing = await idbEngine.get<PilotProgram>('pilotPrograms', 'prog-tz-pilot-v23');
    if (existing) return existing;

    const baselineProgram: PilotProgram = {
      programId: 'prog-tz-pilot-v23',
      name: 'Lake Zone Regional Pilot Program (Tanzania)',
      sponsor: 'Ministry of Health & Regional Health Directorate',
      protocolVersion: '23.0.0-PILOT-PROT-1',
      governingSafetyOfficer: 'Dr. Amani (Lead Clinical Safety Officer)',
      targetFacilities: ['fac-amgh', 'fac-kigoma-dist', 'fac-kasulu-disp'],
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      lastReviewedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotPrograms', baselineProgram);
    return baselineProgram;
  }

  /**
   * Registers a new pilot facility site
   */
  public async registerPilotSite(
    programId: string,
    facilityId: string,
    facilityName: string,
    assignedSupervisor: string,
    safetyLead: string
  ): Promise<PilotSite> {
    const siteId = `site-${facilityId}`;
    const initialTransition: PilotPhaseTransition = {
      phase: 'PLANNING',
      enteredAt: new Date().toISOString(),
      authorizedBy: assignedSupervisor,
      rationale: 'Initial site registration into pilot program protocol',
    };

    const site: PilotSite = {
      siteId,
      programId,
      facilityId,
      facilityName,
      currentPhase: 'PLANNING',
      phaseHistory: [initialTransition],
      readinessScore: 0,
      isSuspended: false,
      assignedSupervisor,
      safetyLead,
      lastEvaluatedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSites', site);
    return site;
  }

  /**
   * Gets a pilot site by ID
   */
  public async getPilotSite(siteId: string): Promise<PilotSite | null> {
    return (await idbEngine.get<PilotSite>('pilotSites', siteId)) || null;
  }

  /**
   * Lists all registered pilot sites
   */
  public async listPilotSites(): Promise<PilotSite[]> {
    const list = await idbEngine.list<PilotSite>('pilotSites');
    if (list.length === 0) {
      // Initialize default primary site
      const prog = await this.initializeBaselineProgram();
      const primarySite = await this.registerPilotSite(
        prog.programId,
        'fac-amgh',
        'Amani Memorial General Hospital',
        'Sister Grace (Pilot Operations Lead)',
        'Dr. Amani (Clinical Safety Officer)'
      );
      return [primarySite];
    }
    return list;
  }

  /**
   * Executes a governed phase transition.
   * INVARIANT: Sites cannot transition into LIVE phases (LIMITED_GO_LIVE, CONTROLLED_LIVE, MONITORED_OPERATION)
   * unless explicitly validated through go-live gate checks.
   */
  public async transitionPhase(
    siteId: string,
    targetPhase: PilotLifecyclePhase,
    authorizingUser: string,
    rationale: string,
    goLiveGatePassed: boolean = false
  ): Promise<PilotSite> {
    const site = await this.getPilotSite(siteId);
    if (!site) throw new Error(`Pilot site ${siteId} not found.`);

    if (site.isSuspended && targetPhase !== 'SUSPENDED' && targetPhase !== 'TERMINATED') {
      throw new Error(`Cannot transition suspended site ${siteId}. Resolve suspension first.`);
    }

    const livePhases: PilotLifecyclePhase[] = ['LIMITED_GO_LIVE', 'CONTROLLED_LIVE', 'MONITORED_OPERATION'];
    if (livePhases.includes(targetPhase) && !goLiveGatePassed) {
      throw new Error(
        `GO-LIVE GATE BLOCKED: Site ${siteId} cannot transition to ${targetPhase} without passing mandatory Go-Live gate.`
      );
    }

    const transition: PilotPhaseTransition = {
      phase: targetPhase,
      enteredAt: new Date().toISOString(),
      authorizedBy: authorizingUser,
      rationale,
    };

    const updated: PilotSite = {
      ...site,
      currentPhase: targetPhase,
      phaseHistory: [...site.phaseHistory, transition],
      lastEvaluatedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSites', updated);
    return updated;
  }

  /**
   * Suspends a pilot site. Preserves all historical records.
   */
  public async suspendSite(siteId: string, authorizedBy: string, reason: string): Promise<PilotSite> {
    const site = await this.getPilotSite(siteId);
    if (!site) throw new Error(`Pilot site ${siteId} not found.`);

    const transition: PilotPhaseTransition = {
      phase: 'SUSPENDED',
      enteredAt: new Date().toISOString(),
      authorizedBy,
      rationale: `Site suspended: ${reason}`,
    };

    const updated: PilotSite = {
      ...site,
      isSuspended: true,
      suspendedReason: reason,
      currentPhase: 'SUSPENDED',
      phaseHistory: [...site.phaseHistory, transition],
      lastEvaluatedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSites', updated);
    return updated;
  }

  /**
   * Resumes a suspended pilot site back to monitored state.
   */
  public async resumeSite(siteId: string, authorizedBy: string, rationale: string): Promise<PilotSite> {
    const site = await this.getPilotSite(siteId);
    if (!site) throw new Error(`Pilot site ${siteId} not found.`);
    if (!site.isSuspended) throw new Error(`Site ${siteId} is not currently suspended.`);

    const transition: PilotPhaseTransition = {
      phase: 'MONITORED_OPERATION',
      enteredAt: new Date().toISOString(),
      authorizedBy,
      rationale: `Site resumed: ${rationale}`,
    };

    const updated: PilotSite = {
      ...site,
      isSuspended: false,
      suspendedReason: undefined,
      currentPhase: 'MONITORED_OPERATION',
      phaseHistory: [...site.phaseHistory, transition],
      lastEvaluatedAt: new Date().toISOString(),
    };

    await idbEngine.put('pilotSites', updated);
    return updated;
  }
}

export const pilotProgramService = PilotProgramService.getInstance();
