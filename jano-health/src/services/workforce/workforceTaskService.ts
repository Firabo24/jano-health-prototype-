/**
 * Jano Health - Clinical Core V16: Workforce Task & Escalation Service
 * 
 * Coordinates operational tasks, clinical safety follow-ups, and multi-tier escalations.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - Operational Task ≠ Clinical Decision: Tasks coordinate workflow execution.
 *   They do NOT change clinical diagnoses, prescriptions, lab results, or triage categories.
 * - Tasks link to source clinical records via references; they do not duplicate medical records.
 * - Task escalation is fully auditable and tamper-evident.
 */

import {
  WorkforceTask,
  WorkforceTaskStatus,
  WorkforceTaskType,
  WorkforceTaskPriority,
  TaskEscalation,
  EscalationTriggerCondition,
} from '../../domain/v16WorkforceTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';

export class WorkforceTaskService {
  private static instance: WorkforceTaskService;
  private tasks: Map<string, WorkforceTask> = new Map();
  private escalations: Map<string, TaskEscalation> = new Map();

  private constructor() {
    this.seedInitialSyntheticTasks();
  }

  public static getInstance(): WorkforceTaskService {
    if (!WorkforceTaskService.instance) {
      WorkforceTaskService.instance = new WorkforceTaskService();
    }
    return WorkforceTaskService.instance;
  }

  private seedInitialSyntheticTasks() {
    const now = '2026-01-01T08:00:00Z';
    const due = '2026-01-01T12:00:00Z';

    const t1: WorkforceTask = {
      taskId: 'tsk-amgh-critical-lab-01',
      facilityId: 'fac-amgh',
      service: 'Emergency Medicine',
      assignedTo: 'wfm-dr-amani',
      creator: 'usr-lab-tech',
      taskType: 'CRITICAL_RESULT_FOLLOW_UP',
      priority: 'CRITICAL',
      patientReference: 'pat-001-mkwawa',
      relatedClinicalReference: {
        resourceType: 'LaboratoryResult',
        resourceId: 'res-malaria-smear-01',
      },
      dueAt: due,
      createdAt: now,
      status: 'ASSIGNED',
      escalationHistory: [],
      provenance: {
        createdAt: now,
        createdBy: 'usr-lab-tech',
      },
    };

    const t2: WorkforceTask = {
      taskId: 'tsk-amgh-specimen-01',
      facilityId: 'fac-amgh',
      service: 'Emergency Medicine',
      assignedTo: 'wfm-nurse-zawadi',
      creator: 'usr-dr-amani',
      taskType: 'SPECIMEN_COLLECTION',
      priority: 'HIGH',
      patientReference: 'pat-001-mkwawa',
      relatedClinicalReference: {
        resourceType: 'LaboratoryOrder',
        resourceId: 'ord-cbc-01',
      },
      dueAt: due,
      createdAt: now,
      status: 'IN_PROGRESS',
      escalationHistory: [],
      provenance: {
        createdAt: now,
        createdBy: 'usr-dr-amani',
      },
    };

    this.tasks.set(t1.taskId, t1);
    this.tasks.set(t2.taskId, t2);
  }

  public async createTask(params: {
    facilityId: string;
    service: string;
    taskType: WorkforceTaskType;
    priority: WorkforceTaskPriority;
    assignedTo?: string;
    assignedTeam?: string;
    patientReference?: string;
    relatedClinicalReference?: { resourceType: string; resourceId: string };
    dueAt: string;
    actorId: string;
  }): Promise<WorkforceTask> {
    const taskId = `tsk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const task: WorkforceTask = {
      taskId,
      facilityId: params.facilityId,
      service: params.service,
      taskType: params.taskType,
      priority: params.priority,
      assignedTo: params.assignedTo,
      assignedTeam: params.assignedTeam,
      creator: params.actorId,
      patientReference: params.patientReference,
      relatedClinicalReference: params.relatedClinicalReference,
      dueAt: params.dueAt,
      createdAt: now,
      status: params.assignedTo || params.assignedTeam ? 'ASSIGNED' : 'OPEN',
      escalationHistory: [],
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
      },
    };

    this.tasks.set(taskId, task);
    try {
      await idbEngine.put('workforceTasks' as any, task);
    } catch {}

    await auditService.log({
      action: 'TASK_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      patientId: params.patientReference,
      details: {
        taskId,
        taskType: params.taskType,
        priority: params.priority,
        assignedTo: params.assignedTo,
      },
    });

    return task;
  }

  public async assignTask(
    taskId: string,
    assignedTo: string | undefined,
    assignedTeam: string | undefined,
    actor: { actorId: string; facilityId: string }
  ): Promise<WorkforceTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.assignedTo = assignedTo;
    task.assignedTeam = assignedTeam;
    task.status = 'ASSIGNED';

    this.tasks.set(taskId, task);
    try {
      await idbEngine.put('workforceTasks' as any, task);
    } catch {}

    await auditService.log({
      action: 'TASK_ASSIGNED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      patientId: task.patientReference,
      details: { taskId, assignedTo, assignedTeam },
    });

    return task;
  }

  public async updateTaskStatus(
    taskId: string,
    status: WorkforceTaskStatus,
    actor: { actorId: string; facilityId: string }
  ): Promise<WorkforceTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = status;
    if (status === 'COMPLETED') {
      task.completedAt = new Date().toISOString();
    }

    this.tasks.set(taskId, task);
    try {
      await idbEngine.put('workforceTasks' as any, task);
    } catch {}

    await auditService.log({
      action: 'TASK_STATUS_CHANGED',
      actorId: actor.actorId,
      facilityId: actor.facilityId,
      patientId: task.patientReference,
      details: { taskId, status },
    });

    return task;
  }

  public async escalateTask(params: {
    taskId: string;
    triggerCondition: EscalationTriggerCondition;
    escalatedTo: string;
    reason: string;
    actorId: string;
    facilityId: string;
  }): Promise<TaskEscalation> {
    const task = this.tasks.get(params.taskId);
    if (!task) throw new Error(`Task not found: ${params.taskId}`);

    const escalationId = `esc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const escalation: TaskEscalation = {
      escalationId,
      taskId: params.taskId,
      triggerCondition: params.triggerCondition,
      escalatedBy: params.actorId,
      escalatedTo: params.escalatedTo,
      timestamp: now,
      reason: params.reason,
      status: 'ACTIVE',
    };

    this.escalations.set(escalationId, escalation);

    task.assignedTo = params.escalatedTo;
    task.priority = 'CRITICAL';
    task.escalationHistory = [...(task.escalationHistory || []), escalation];

    this.tasks.set(task.taskId, task);

    try {
      await idbEngine.put('taskEscalations' as any, escalation);
      await idbEngine.put('workforceTasks' as any, task);
    } catch {}

    await auditService.log({
      action: 'TASK_ESCALATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      patientId: task.patientReference,
      details: {
        taskId: params.taskId,
        escalationId,
        trigger: params.triggerCondition,
        escalatedTo: params.escalatedTo,
        reason: params.reason,
      },
    });

    return escalation;
  }

  public getTasksForMember(workforceMemberId: string): WorkforceTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.assignedTo === workforceMemberId && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    );
  }

  public getTasksForTeam(careTeamId: string): WorkforceTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.assignedTeam === careTeamId && t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
    );
  }

  public getTasksForPatient(patientId: string): WorkforceTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.patientReference === patientId
    );
  }

  public getTasksForFacility(facilityId: string): WorkforceTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.facilityId === facilityId);
  }

  public getTask(taskId: string): WorkforceTask | undefined {
    return this.tasks.get(taskId);
  }

  public listOverdueTasks(facilityId: string): WorkforceTask[] {
    const now = new Date();
    return Array.from(this.tasks.values()).filter(
      (t) =>
        t.facilityId === facilityId &&
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        new Date(t.dueAt) < now
    );
  }
}

export const workforceTaskService = WorkforceTaskService.getInstance();
