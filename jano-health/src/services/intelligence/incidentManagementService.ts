/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Incident Management & Root Cause Analysis Service
 * 
 * INVARIANTS:
 * - Anomaly ≠ Incident Confirmation.
 * - Incident ≠ Root Cause.
 * - AI-generated hypotheses are NEVER presented as confirmed root causes without human review.
 * - During incidents, automation becomes more conservative. Never bypass governance during an incident.
 */

import {
  SystemIncident,
  RootCauseAnalysis,
  IncidentResponsePlaybook,
} from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class IncidentManagementService {
  private static instance: IncidentManagementService;

  private incidentsCache = new Map<string, SystemIncident>();
  private rootCauseCache = new Map<string, RootCauseAnalysis>();
  private playbooksCache = new Map<string, IncidentResponsePlaybook>();

  private constructor() {
    this.seedPlaybooks();
  }

  public static getInstance(): IncidentManagementService {
    if (!IncidentManagementService.instance) {
      IncidentManagementService.instance = new IncidentManagementService();
    }
    return IncidentManagementService.instance;
  }

  private seedPlaybooks(): void {
    const playbooks: IncidentResponsePlaybook[] = [
      {
        playbookId: 'pb-sync-outage-v1',
        name: 'Sync Outage & Queue Backlog Playbook',
        category: 'sync',
        triggerCondition: 'sync_backlog > 100 OR repeated_sync_failures >= 5',
        safeAutomatedActions: [
          'APPLY_EXPONENTIAL_BACKOFF',
          'RECHECK_IDEMPOTENCY_KEYS',
          'RESTART_LOCAL_SYNC_WORKER',
        ],
        humanEscalationSteps: [
          'Notify System Intelligence Governor',
          'Verify local database read/write availability',
          'Coordinate network connectivity with node admin',
        ],
        rollbackSteps: ['REVERT_WORKER_RESTART', 'RESTORE_SAVED_CURSOR'],
        verificationSteps: ['CONFIRM_QUEUE_DRAIN_PROGRESS', 'VERIFY_ZERO_MESSAGE_LOSS'],
      },
      {
        playbookId: 'pb-external-integration-v1',
        name: 'External Integration Outage Playbook',
        category: 'integration',
        triggerCondition: 'circuit_state == OPEN OR external_timeout_rate > 50%',
        safeAutomatedActions: [
          'OPEN_CIRCUIT_BREAKER_PREVENT_CASCADE',
          'ROUTE_OUTBOUND_TO_DURABLE_OFFLINE_QUEUE',
        ],
        humanEscalationSteps: [
          'Alert National Interoperability Officer',
          'Verify upstream ministry/HIE portal status',
          'Confirm local clinical care continues uninterrupted',
        ],
        rollbackSteps: ['RETRY_RECOVERY_PROBE'],
        verificationSteps: ['CONFIRM_HALF_OPEN_PROBE_SUCCESS', 'RESUME_QUEUED_EXCHANGE'],
      },
      {
        playbookId: 'pb-security-probe-v1',
        name: 'Security Probe & Suspicious Replay Playbook',
        category: 'security',
        triggerCondition: 'suspicious_replay_detected OR rate_limit_breach >= 3',
        safeAutomatedActions: [
          'THROTTLE_SOURCE_ENDPOINT',
          'BLOCK_REPLAY_MESSAGE_IDENTIFIERS',
        ],
        humanEscalationSteps: [
          'Notify Security Officer & Governor',
          'Audit affected endpoint access logs',
        ],
        rollbackSteps: ['LIFT_SOURCE_THROTTLE_ON_CLEARANCE'],
        verificationSteps: ['VERIFY_REPLAY_BLOCKED', 'CONFIRM_INTEGRITY_LOGS_INTACT'],
      },
    ];

    playbooks.forEach((p) => this.playbooksCache.set(p.playbookId, p));
  }

  /**
   * Records a confirmed system incident with severity and symptoms.
   */
  public async createIncident(input: {
    category: string;
    severity: SystemIncident['severity'];
    affectedSystems: string[];
    scope: string;
    symptoms: string[];
    evidence: string[];
    responsePlaybookId?: string;
  }): Promise<SystemIncident> {
    const incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const incident: SystemIncident = {
      incidentId,
      category: input.category,
      severity: input.severity,
      detectedAt: new Date().toISOString(),
      affectedSystems: input.affectedSystems,
      scope: input.scope,
      symptoms: input.symptoms,
      evidence: input.evidence,
      responsePlaybookId: input.responsePlaybookId,
      status: 'DETECTED',
      provenance: {
        reporter: 'incident_management_service',
        version: 'v20.0',
      },
    };

    this.incidentsCache.set(incidentId, incident);
    await idbEngine.put('systemIncidents', incident);
    return incident;
  }

  /**
   * Updates incident status (DETECTED -> TRIAGED -> MITIGATING -> MONITORING -> RESOLVED -> CLOSED).
   */
  public async updateIncidentStatus(
    incidentId: string,
    status: SystemIncident['status'],
    notes?: string
  ): Promise<SystemIncident> {
    const inc = this.incidentsCache.get(incidentId) || (await idbEngine.get<SystemIncident>('systemIncidents', incidentId));
    if (!inc) throw new Error('INCIDENT_NOT_FOUND');

    inc.status = status;
    if (notes) inc.resolutionNotes = notes;
    if (status === 'RESOLVED' || status === 'CLOSED') {
      inc.resolvedAt = new Date().toISOString();
    }

    this.incidentsCache.set(incidentId, inc);
    await idbEngine.put('systemIncidents', inc);
    return inc;
  }

  /**
   * Performs Root Cause Analysis: Generates hypotheses with explicit confidence and evidence.
   * INVARIANT: Hypotheses are marked confirmed: false until confirmed by human reviewer.
   */
  public async performRootCauseAnalysis(
    incidentId: string,
    hypotheses: Array<{ hypothesis: string; confidence: number; evidence: string }>,
    contributingObservations: string[]
  ): Promise<RootCauseAnalysis> {
    const analysisId = `rca-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const rca: RootCauseAnalysis = {
      analysisId,
      incidentId,
      contributingObservations,
      hypotheses: hypotheses.map((h) => ({
        ...h,
        confirmed: false, // INVARIANT: AI / automated hypothesis is NOT confirmed without review
      })),
      generatedAt: new Date().toISOString(),
      provenance: {
        analyzerVersion: 'v20.0-rca',
      },
    };

    this.rootCauseCache.set(analysisId, rca);
    await idbEngine.put('rootCauseAnalyses', rca);
    return rca;
  }

  /**
   * Confirms a root cause hypothesis by human reviewer.
   */
  public async confirmRootCause(
    analysisId: string,
    hypothesisIndex: number,
    reviewerId: string,
    conclusion: string
  ): Promise<RootCauseAnalysis> {
    const rca = this.rootCauseCache.get(analysisId) || (await idbEngine.get<RootCauseAnalysis>('rootCauseAnalyses', analysisId));
    if (!rca) throw new Error('RCA_NOT_FOUND');

    if (rca.hypotheses[hypothesisIndex]) {
      rca.hypotheses[hypothesisIndex].confirmed = true;
    }
    rca.reviewerId = reviewerId;
    rca.conclusion = conclusion;

    this.rootCauseCache.set(analysisId, rca);
    await idbEngine.put('rootCauseAnalyses', rca);
    return rca;
  }

  public async getIncidents(status?: SystemIncident['status']): Promise<SystemIncident[]> {
    let list: SystemIncident[] = [];
    try {
      const stored = await idbEngine.getAll<SystemIncident>('systemIncidents');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.incidentsCache.values());
    } catch {
      list = Array.from(this.incidentsCache.values());
    }

    if (status) list = list.filter((i) => i.status === status);
    list.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
    return list;
  }

  public async getPlaybooks(): Promise<IncidentResponsePlaybook[]> {
    return Array.from(this.playbooksCache.values());
  }

  public clearMemoryCache(): void {
    this.incidentsCache.clear();
    this.rootCauseCache.clear();
    this.playbooksCache.clear();
    this.seedPlaybooks();
  }
}

export const incidentManagementService = IncidentManagementService.getInstance();
