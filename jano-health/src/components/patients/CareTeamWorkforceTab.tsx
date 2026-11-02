import React, { useState, useEffect } from 'react';
import { Users, UserCheck, AlertCircle, Plus, CheckCircle, Clock, ShieldCheck, Flag } from 'lucide-react';
import { CareTeam, CareTeamMembership, WorkforceTask, ShiftHandover } from '../../domain/v16WorkforceTypes';
import { careTeamService } from '../../services/workforce/careTeamService';
import { workforceTaskService } from '../../services/workforce/workforceTaskService';
import { rosterShiftService } from '../../services/workforce/rosterShiftService';
import { workforceService } from '../../services/workforce/workforceService';
import { useAuth } from '../../services/security/authContext';

interface CareTeamWorkforceTabProps {
  patientId: string;
  facilityId: string;
}

export const CareTeamWorkforceTab: React.FC<CareTeamWorkforceTabProps> = ({ patientId, facilityId }) => {
  const { currentUser, can } = useAuth();
  const [teams, setTeams] = useState<CareTeam[]>([]);
  const [tasks, setTasks] = useState<WorkforceTask[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newRole, setNewRole] = useState('attending_clinician');
  const [newResponsibility, setNewResponsibility] = useState('');

  const loadData = () => {
    const patientTeams = careTeamService.getCareTeamsForPatient(patientId);
    setTeams(patientTeams);

    const patientTasks = workforceTaskService.getTasksForPatient(patientId);
    setTasks(patientTasks);

    const facilityHandovers = rosterShiftService
      .getHandoversForFacility(facilityId)
      .filter((h) => h.patients && h.patients.includes(patientId));
    setHandovers(facilityHandovers);
  };

  useEffect(() => {
    loadData();
  }, [patientId, facilityId]);

  const attendingClinician = careTeamService.getAttendingClinician(patientId);
  const allMembers = workforceService.listMembers({ facilityId });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberId || !newResponsibility) return;

    let targetTeam = teams[0];
    if (!targetTeam) {
      targetTeam = await careTeamService.createCareTeam({
        patientReference: patientId,
        facilityId,
        service: 'Inpatient Medicine',
        purpose: 'Direct Patient Care Continuity',
        effectivePeriod: { start: new Date().toISOString() },
        actorId: currentUser?.id || 'usr-system',
      });
    }

    await careTeamService.addMember({
      careTeamId: targetTeam.careTeamId,
      workforceMemberId: newMemberId,
      role: newRole as any,
      responsibility: newResponsibility,
      actorId: currentUser?.id || 'usr-system',
      facilityId,
    });

    setIsAssignModalOpen(false);
    setNewMemberId('');
    setNewResponsibility('');
    loadData();
  };

  const handleCompleteTask = async (taskId: string) => {
    await workforceTaskService.updateTaskStatus(taskId, 'COMPLETED', {
      actorId: currentUser?.id || 'usr-system',
      facilityId,
    });
    loadData();
  };

  return (
    <div className="p-4 space-y-6">
      {/* Header section with Summary Badges */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              Multidisciplinary Care Team & Operations
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Active clinicians, primary bedside nurse, operational handovers, and linked safety tasks for Patient MRN: <span className="font-mono text-slate-200">{patientId}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAssignModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Assign Member
            </button>
          </div>
        </div>

        {/* Primary Roles Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded p-3 flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-teal-400 mt-0.5" />
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-teal-400 uppercase">Primary Attending Clinician</div>
              {attendingClinician ? (
                <>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">
                    {workforceService.getMember(attendingClinician.workforceMemberId)?.displayName || attendingClinician.workforceMemberId}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{attendingClinician.responsibility}</div>
                </>
              ) : (
                <div className="text-xs text-amber-400 mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No attending clinician assigned yet
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded p-3 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 mt-0.5" />
            <div>
              <div className="text-[10px] font-semibold tracking-wider text-indigo-400 uppercase">Primary Bedside Nurse</div>
              {teams[0]?.members.find((m) => m.role === 'primary_nurse' && m.status === 'ACTIVE') ? (
                (() => {
                  const nurseMember = teams[0].members.find((m) => m.role === 'primary_nurse' && m.status === 'ACTIVE')!;
                  return (
                    <>
                      <div className="text-sm font-semibold text-slate-100 mt-0.5">
                        {workforceService.getMember(nurseMember.workforceMemberId)?.displayName || nurseMember.workforceMemberId}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{nurseMember.responsibility}</div>
                    </>
                  );
                })()
              ) : (
                <div className="text-xs text-slate-400 mt-0.5">Assigned via shift roster rotation</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Care Team Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Care Team Roster</h4>
        {teams.length === 0 || teams.every((t) => t.members.length === 0) ? (
          <div className="text-xs text-slate-400 py-3 text-center">No care team members registered.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2 px-3">Name</th>
                  <th className="py-2 px-3">Role</th>
                  <th className="py-2 px-3">Responsibility</th>
                  <th className="py-2 px-3">Assigned Since</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {teams.flatMap((t) => t.members).map((m) => {
                  const member = workforceService.getMember(m.workforceMemberId);
                  return (
                    <tr key={m.membershipId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-slate-100">
                        {member?.displayName || m.workforceMemberId}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-teal-300 border border-slate-700">
                          {m.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{m.responsibility}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                        {new Date(m.startAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operational Tasks & Clinical Safety Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Coordination Tasks */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Patient Coordination Tasks ({tasks.length})
            </h4>
          </div>

          {tasks.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center">No active operational tasks for this patient.</div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => {
                const isOverdue = new Date(task.dueAt) < new Date() && task.status !== 'COMPLETED';
                return (
                  <div
                    key={task.taskId}
                    className="p-2.5 rounded bg-slate-800/50 border border-slate-700/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold ${
                            task.priority === 'CRITICAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/40'
                              : task.priority === 'HIGH'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {task.priority}
                        </span>
                        <span className="font-medium text-slate-200">{task.taskType.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Assigned: {task.assignedTo ? workforceService.getMember(task.assignedTo)?.displayName || task.assignedTo : 'Unassigned'}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Due: {new Date(task.dueAt).toLocaleTimeString()} {isOverdue && <span className="text-rose-400 font-bold">(OVERDUE)</span>}
                      </div>
                    </div>

                    {task.status !== 'COMPLETED' ? (
                      <button
                        onClick={() => handleCompleteTask(task.taskId)}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition"
                        title="Mark Complete"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-mono font-medium">DONE</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Handover Continuity & Safety Flags */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-3">
            <Flag className="w-3.5 h-3.5 text-rose-400" />
            Shift Handover Continuity & Safety Flags
          </h4>

          {handovers.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center">
              No recent shift handovers flagging this patient.
            </div>
          ) : (
            <div className="space-y-2">
              {handovers.map((h) => (
                <div key={h.handoverId} className="p-2.5 rounded bg-slate-800/50 border border-slate-700/60 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] font-mono">
                    <span>Handover: {new Date(h.provenance.submittedAt).toLocaleString()}</span>
                    <span className="text-emerald-400">{h.status}</span>
                  </div>
                  {h.clinicalSafetyFlags && h.clinicalSafetyFlags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {h.clinicalSafetyFlags.map((flag, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/40 text-[10px] font-mono">
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-slate-300 text-xs mt-1.5 line-clamp-2">{h.operationalNotes}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assign Member Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-md">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Assign Care Team Member</h3>
            <form onSubmit={handleAddMember} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Workforce Practitioner</label>
                <select
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                >
                  <option value="">Select staff member...</option>
                  {allMembers.map((m) => (
                    <option key={m.workforceMemberId} value={m.workforceMemberId}>
                      {m.displayName} ({m.professionalCategory})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Team Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="attending_clinician">Attending Clinician</option>
                  <option value="primary_nurse">Primary Nurse</option>
                  <option value="care_coordinator">Care Coordinator</option>
                  <option value="pharmacist">Pharmacist</option>
                  <option value="consultant">Consultant</option>
                  <option value="supervisor">Clinical Supervisor</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Clinical Responsibility</label>
                <input
                  type="text"
                  value={newResponsibility}
                  onChange={(e) => setNewResponsibility(e.target.value)}
                  placeholder="e.g. Primary attending physician during inpatient stay"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
