/**
 * Jano Health - Clinical Core V16: FHIR R5 Workforce Mapper
 * 
 * Maps internal workforce members, facility roles, care teams, and tasks
 * to HL7 FHIR R5 resources (Practitioner, PractitionerRole, CareTeam, Task).
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - FHIR Resource ≠ Internal Domain Model: Decoupled translation boundaries.
 * - Strictly validates logical IDs, resourceType, and mandatory conformance elements.
 * - Fails cleanly with FHIROperationOutcome on malformed input.
 */

import {
  FHIRPractitioner,
  FHIRPractitionerRole,
  FHIRCareTeam,
  FHIRTask,
  FHIROperationOutcome,
} from './types';
import {
  WorkforceMember,
  WorkforceFacilityAssignment,
  CareTeam,
  WorkforceTask,
} from '../../domain/v16WorkforceTypes';

export class FHIRWorkforceMapper {
  /**
   * Maps an internal WorkforceMember to a FHIR R5 Practitioner resource.
   */
  public static toFHIRPractitioner(member: WorkforceMember): FHIRPractitioner {
    const parts = member.displayName.split(' ');
    const family = parts.length > 1 ? parts[parts.length - 1] : member.displayName;
    const given = parts.length > 1 ? parts.slice(0, parts.length - 1) : [];

    return {
      resourceType: 'Practitioner',
      id: member.workforceMemberId,
      identifier: [
        {
          system: 'https://janohealth.org/workforce/members',
          value: member.workforceMemberId,
        },
      ],
      active: member.status === 'ACTIVE',
      name: [
        {
          use: 'official',
          text: member.displayName,
          family,
          given,
        },
      ],
      telecom: member.contactReference?.phone
        ? [
            {
              system: 'phone',
              value: member.contactReference.phone,
              use: 'work',
            },
          ]
        : undefined,
    };
  }

  /**
   * Maps a WorkforceFacilityAssignment to a FHIR R5 PractitionerRole resource.
   */
  public static toFHIRPractitionerRole(
    member: WorkforceMember,
    assignment: WorkforceFacilityAssignment
  ): FHIRPractitionerRole {
    return {
      resourceType: 'PractitionerRole',
      id: assignment.assignmentId,
      identifier: [
        {
          system: 'https://janohealth.org/workforce/assignments',
          value: assignment.assignmentId,
        },
      ],
      active: assignment.status === 'ACTIVE',
      practitioner: {
        reference: `Practitioner/${member.workforceMemberId}`,
        display: member.displayName,
      },
      organization: {
        reference: `Organization/${assignment.facilityId}`,
      },
      code: [
        {
          coding: [
            {
              system: 'https://janohealth.org/workforce/roles',
              code: assignment.role.toLowerCase().replace(/\s+/g, '-'),
              display: assignment.role,
            },
          ],
          text: assignment.role,
        },
      ],
      specialty: member.specialties.map((s) => ({
        coding: [
          {
            system: 'https://janohealth.org/workforce/specialties',
            code: s.toLowerCase().replace(/\s+/g, '-'),
            display: s,
          },
        ],
        text: s,
      })),
    };
  }

  /**
   * Maps an internal CareTeam to a FHIR R5 CareTeam resource.
   */
  public static toFHIRCareTeam(careTeam: CareTeam): FHIRCareTeam {
    let fhirStatus: FHIRCareTeam['status'] = 'active';
    if (careTeam.status === 'INACTIVE' || careTeam.status === 'CONCLUDED') {
      fhirStatus = 'inactive';
    } else if (careTeam.status === 'SUSPENDED') {
      fhirStatus = 'suspended';
    }

    return {
      resourceType: 'CareTeam',
      id: careTeam.careTeamId,
      identifier: [
        {
          system: 'https://janohealth.org/workforce/care-teams',
          value: careTeam.careTeamId,
        },
      ],
      status: fhirStatus,
      name: careTeam.service,
      subject: careTeam.patientReference
        ? {
            reference: `Patient/${careTeam.patientReference}`,
          }
        : undefined,
      period: {
        start: careTeam.effectivePeriod.start,
        end: careTeam.effectivePeriod.end,
      },
      managingOrganization: [
        {
          reference: `Organization/${careTeam.facilityId}`,
        },
      ],
      participant: careTeam.members.map((m) => ({
        role: [
          {
            coding: [
              {
                system: 'https://janohealth.org/workforce/care-team-roles',
                code: m.role,
                display: m.role,
              },
            ],
            text: m.responsibility,
          },
        ],
        member: {
          reference: `Practitioner/${m.workforceMemberId}`,
        },
        period: {
          start: m.startAt,
          end: m.endAt,
        },
      })),
    };
  }

  /**
   * Maps an internal WorkforceTask to a FHIR R5 Task resource.
   */
  public static toFHIRTask(task: WorkforceTask): FHIRTask {
    let status: FHIRTask['status'] = 'requested';
    if (task.status === 'IN_PROGRESS') status = 'in-progress';
    else if (task.status === 'COMPLETED') status = 'completed';
    else if (task.status === 'CANCELLED') status = 'cancelled';
    else if (task.status === 'BLOCKED') status = 'on-hold';
    else if (task.status === 'EXPIRED') status = 'failed';

    let priority: FHIRTask['priority'] = 'routine';
    if (task.priority === 'HIGH') priority = 'urgent';
    else if (task.priority === 'URGENT') priority = 'asap';
    else if (task.priority === 'CRITICAL') priority = 'stat';

    return {
      resourceType: 'Task',
      id: task.taskId,
      identifier: [
        {
          system: 'https://janohealth.org/workforce/tasks',
          value: task.taskId,
        },
      ],
      status,
      intent: 'order',
      priority,
      code: {
        coding: [
          {
            system: 'https://janohealth.org/workforce/task-types',
            code: task.taskType,
            display: task.taskType,
          },
        ],
        text: task.taskType,
      },
      authoredOn: task.createdAt,
      requester: {
        reference: `Practitioner/${task.creator}`,
      },
      owner: task.assignedTo
        ? {
            reference: `Practitioner/${task.assignedTo}`,
          }
        : undefined,
      for: task.patientReference
        ? {
            reference: `Patient/${task.patientReference}`,
          }
        : undefined,
      focus: task.relatedClinicalReference
        ? {
            reference: `${task.relatedClinicalReference.resourceType}/${task.relatedClinicalReference.resourceId}`,
          }
        : undefined,
    };
  }

  /**
   * Validates structural conformance of a workforce FHIR resource.
   */
  public static validateResource(resource: any): {
    valid: boolean;
    outcome?: FHIROperationOutcome;
  } {
    if (!resource || typeof resource !== 'object') {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Resource is null or not an object.',
            },
          ],
        },
      };
    }

    const validTypes = ['Practitioner', 'PractitionerRole', 'CareTeam', 'Task'];
    if (!validTypes.includes(resource.resourceType)) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: `Unsupported resourceType '${resource.resourceType}'. Expected one of: ${validTypes.join(', ')}.`,
            },
          ],
        },
      };
    }

    if (!resource.id) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: `Missing required logical id on FHIR ${resource.resourceType}.`,
            },
          ],
        },
      };
    }

    return { valid: true };
  }
}
