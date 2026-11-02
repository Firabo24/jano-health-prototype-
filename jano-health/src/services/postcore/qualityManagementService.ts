/**
 * Jano Health — Quality Management System (QMS) & CAPA Service
 * Post-Core Track 1
 *
 * Governs internal software quality objectives, audits, findings,
 * and the complete Corrective and Preventive Action (CAPA) lifecycle:
 * INITIATED -> INVESTIGATION -> ROOT_CAUSE_IDENTIFIED -> ACTION_PLAN_APPROVED -> IMPLEMENTING -> EFFECTIVENESS_VERIFICATION -> CLOSED
 *
 * HARD INVARIANTS:
 * - Quality management records strictly separated from regulatory certification.
 *   The existence of a quality record NEVER implies certification or statutory clearance.
 * - CAPA cannot transition to CLOSED without empirical evidence of verified effectiveness.
 */

import {
  QualityObjective,
  QualityAudit,
  QualityFinding,
  CapaRecord,
  CapaState,
} from '../../domain/postCoreTrack1Types';

export class QualityManagementService {
  private objectives: Map<string, QualityObjective> = new Map();
  private audits: Map<string, QualityAudit> = new Map();
  private capas: Map<string, CapaRecord> = new Map();

  constructor() {
    this.seedBaseline();
  }

  private seedBaseline() {
    // Quality Objective
    const obj1: QualityObjective = {
      objectiveId: 'qobj-01-offline-integrity',
      title: 'Zero Data Loss During Prolonged Offline Clinic Shifts',
      workflowScope: 'Offline Triage & Medication Dispense',
      targetMetric: '100% durable local persistence across power cycles',
      currentObservedMetric: '100% verified across 48-hour offline stress tests',
      status: 'ACHIEVED',
      owner: 'David Mrosso, QMS Lead',
      reviewDate: '2026-09-20T10:00:00Z',
      evidenceSummary: 'All IndexedDB write transactions committed with auto-increment sequence integrity.',
    };
    this.objectives.set(obj1.objectiveId, obj1);

    // Quality Audit
    const audit1: QualityAudit = {
      auditId: 'qaud-2026-03-deploy',
      title: 'Q3 Internal Software Quality & Offline Architecture Review',
      auditScope: 'Rugged device deployment procedures & offline-first sync consistency',
      scheduledDate: '2026-08-15T09:00:00Z',
      completedDate: '2026-08-18T16:00:00Z',
      auditorId: 'auditor-internal-peer-01',
      auditorType: 'INTERNAL_QUALITY_TEAM',
      status: 'COMPLETED',
      regulatoryCertificationClaimed: false, // Mandatory invariant
      findings: [
        {
          findingId: 'fnd-2026-03-01',
          auditId: 'qaud-2026-03-deploy',
          severity: 'MINOR_NONCONFORMANCE',
          description: 'Local device clock drift detected on 2 rugged tablets after 72h offline standby.',
          affectedProcess: 'Time synchronization & order timestamps',
          identifiedBy: 'auditor-internal-peer-01',
          identifiedAt: '2026-08-16T11:30:00Z',
          assignedCapaId: 'capa-2026-004-clock-drift',
          status: 'VERIFIED',
        },
      ],
      summaryReport: 'Internal audit confirmed strong compliance with fail-closed rules and offline persistence.',
    };
    this.audits.set(audit1.auditId, audit1);

    // Initial CAPA
    const capa1: CapaRecord = {
      capaId: 'capa-2026-004-clock-drift',
      sourceType: 'QUALITY_AUDIT',
      sourceReferenceId: 'fnd-2026-03-01',
      problemDescription: 'Hardware RTC clock drift causing slight timestamp skew during long offline periods.',
      rootCauseAnalysis: 'Power management mode puts hardware RTC into low-frequency oscillator state without NTP mesh beacon.',
      correctiveActions: [
        {
          actionId: 'ca-01',
          description: 'Implement local BLE mesh time-consensus protocol between co-located rugged tablets.',
          assignedTo: 'Eng. Sarah Kweka',
          dueDate: '2026-08-30T17:00:00Z',
          completedAt: '2026-08-28T14:00:00Z',
        },
      ],
      preventiveActions: [
        {
          actionId: 'pa-01',
          description: 'Add automated clock-drift sanity checks in device bootloader health diagnostics.',
          assignedTo: 'Firmware Team Lead',
          dueDate: '2026-09-05T17:00:00Z',
          completedAt: '2026-09-04T11:00:00Z',
        },
      ],
      state: 'CLOSED',
      effectivenessVerificationCriteria: 'Device clock variance across 10-device mesh remains under 250ms over 14 days offline.',
      effectivenessEmpiricalEvidence: 'Empirical mesh log HASH_7a9f verified clock delta variance <80ms over 14 continuous days.',
      isEffectivenessVerified: true,
      qualityManagerSignOff: 'David Mrosso, QMS Lead',
      closedAt: '2026-09-10T12:00:00Z',
    };
    this.capas.set(capa1.capaId, capa1);
  }

  // --- Quality Objectives & Audits ---

  public getAllObjectives(): QualityObjective[] {
    return Array.from(this.objectives.values());
  }

  public getAllAudits(): QualityAudit[] {
    return Array.from(this.audits.values());
  }

  public recordAudit(audit: QualityAudit): void {
    // Invariant: QMS records never claim external regulatory certification
    audit.regulatoryCertificationClaimed = false;
    this.audits.set(audit.auditId, audit);
  }

  // --- CAPA Lifecycle ---

  public getAllCapas(): CapaRecord[] {
    return Array.from(this.capas.values());
  }

  public getCapa(capaId: string): CapaRecord | undefined {
    return this.capas.get(capaId);
  }

  public createCapa(
    input: Omit<CapaRecord, 'state' | 'isEffectivenessVerified' | 'correctiveActions' | 'preventiveActions'>
  ): CapaRecord {
    const capa: CapaRecord = {
      ...input,
      correctiveActions: [],
      preventiveActions: [],
      state: 'INITIATED',
      isEffectivenessVerified: false,
    };
    this.capas.set(capa.capaId, capa);
    return capa;
  }

  public advanceCapaLifecycle(
    capaId: string,
    targetState: CapaState,
    actorRole: string,
    empiricalEvidence?: string
  ): { success: boolean; capa?: CapaRecord; reason?: string } {
    const capa = this.capas.get(capaId);
    if (!capa) return { success: false, reason: 'CAPA not found' };

    if (empiricalEvidence) {
      capa.effectivenessEmpiricalEvidence = empiricalEvidence;
      capa.isEffectivenessVerified = true;
    }

    // HARD INVARIANT: Cannot CLOSE without verified empirical evidence of effectiveness
    if (targetState === 'CLOSED') {
      if (!capa.isEffectivenessVerified || !capa.effectivenessEmpiricalEvidence) {
        return {
          success: false,
          reason: 'REJECTED: CAPA cannot be closed without empirical verification of effectiveness.',
        };
      }
      capa.closedAt = new Date().toISOString();
      capa.qualityManagerSignOff = actorRole;
    }

    capa.state = targetState;
    this.capas.set(capaId, capa);
    return { success: true, capa };
  }
}

export const qualityManagementService = new QualityManagementService();
