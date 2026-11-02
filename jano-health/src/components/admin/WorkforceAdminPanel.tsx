/**
 * Jano Health - Clinical Core V16: Workforce & Care Operations Admin Panel
 * 
 * Centralized command center for workforce directory, credential verification,
 * multi-facility assignments, multidisciplinary care teams, duty rosters & shifts,
 * tamper-evident handovers, task escalations, and workforce capacity intelligence.
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  Award,
  Building2,
  Calendar,
  Clock,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  AlertCircle,
  BarChart3,
  ShieldAlert,
  ChevronRight,
  Flag,
} from 'lucide-react';
import {
  WorkforceMember,
  WorkforceMemberStatus,
  ProfessionalCategory,
  WorkforceCredential,
  WorkforceFacilityAssignment,
  CareTeam,
  DutyRoster,
  ShiftAssignment,
  ShiftHandover,
  WorkforceTask,
  StaffingGap,
  WorkloadSnapshot,
} from '../../domain/v16WorkforceTypes';
import { workforceService } from '../../services/workforce/workforceService';
import { credentialValidationService } from '../../services/workforce/credentialValidationService';
import { careTeamService } from '../../services/workforce/careTeamService';
import { rosterShiftService } from '../../services/workforce/rosterShiftService';
import { workforceTaskService } from '../../services/workforce/workforceTaskService';
import { workforceIntelligenceService } from '../../services/workforce/workforceIntelligenceService';
import { useAuth } from '../../services/security/authContext';

type WorkforcePanelTab =
  | 'directory'
  | 'credentials'
  | 'assignments'
  | 'care_teams'
  | 'rosters'
  | 'handovers'
  | 'tasks'
  | 'intelligence';

export const WorkforceAdminPanel: React.FC = () => {
  const { currentUser, currentFacility, can } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkforcePanelTab>('directory');
  const facilityId = currentFacility?.id || 'fac-amgh';

  // State
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<WorkforceMember | null>(null);
  const [credentials, setCredentials] = useState<WorkforceCredential[]>([]);
  const [assignments, setAssignments] = useState<WorkforceFacilityAssignment[]>([]);
  const [teams, setTeams] = useState<CareTeam[]>([]);
  const [rosters, setRosters] = useState<DutyRoster[]>([]);
  const [shifts, setShifts] = useState<ShiftAssignment[]>([]);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [tasks, setTasks] = useState<WorkforceTask[]>([]);
  const [gaps, setGaps] = useState<StaffingGap[]>([]);
  const [snapshot, setSnapshot] = useState<WorkloadSnapshot | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [isSubmitHandoverOpen, setIsSubmitHandoverOpen] = useState(false);
  const [activeTaskForEscalation, setActiveTaskForEscalation] = useState<string | null>(null);

  // Form states
  const [newMemberForm, setNewMemberForm] = useState({
    displayName: '',
    professionalCategory: 'physician' as ProfessionalCategory,
    specialties: '',
    email: '',
    phone: '',
  });

  const [escalateForm, setEscalateForm] = useState({
    triggerCondition: 'OVERDUE' as const,
    escalatedTo: '',
    reason: '',
  });

  const [handoverForm, setHandoverForm] = useState({
    department: 'Emergency',
    operationalNotes: '',
    clinicalSafetyFlags: '',
    patients: '',
    unresolvedTasks: '',
  });

  const loadAllData = async () => {
    const mems = workforceService.listMembers();
    setMembers(mems);

    const allCreds = mems.flatMap((m) => credentialValidationService.getCredentialsForMember(m.workforceMemberId));
    setCredentials(allCreds);

    const assigns = workforceService.getAssignmentsForFacility(facilityId);
    setAssignments(assigns);

    const facTeams = careTeamService.getCareTeamsForFacility(facilityId);
    setTeams(facTeams);

    const facRosters = rosterShiftService.getRostersForFacility(facilityId);
    setRosters(facRosters);

    const facShifts = rosterShiftService.getShiftsForFacility(facilityId);
    setShifts(facShifts);

    const facHandovers = rosterShiftService.getHandoversForFacility(facilityId);
    setHandovers(facHandovers);

    const facTasks = workforceTaskService.getTasksForFacility(facilityId);
    setTasks(facTasks);

    const now = new Date().toISOString();
    const period = { start: now, end: now };
    const snap = await workforceIntelligenceService.captureWorkloadSnapshot({
      facilityId,
      department: 'Emergency & General',
      service: 'Emergency Medicine',
      period,
    });
    setSnapshot(snap);

    const mdGap = workforceIntelligenceService.evaluateStaffingGap({
      facilityId,
      service: 'Emergency Medicine',
      category: 'physician',
      period,
    });
    const rnGap = workforceIntelligenceService.evaluateStaffingGap({
      facilityId,
      service: 'Emergency Medicine',
      category: 'nurse',
      period,
    });
    setGaps([mdGap, rnGap]);
  };

  useEffect(() => {
    loadAllData();
  }, [facilityId]);

  // Actions
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberForm.displayName) return;

    await workforceService.createWorkforceMember({
      displayName: newMemberForm.displayName,
      professionalCategory: newMemberForm.professionalCategory,
      specialties: newMemberForm.specialties.split(',').map((s) => s.trim()).filter(Boolean),
      contactReference: {
        email: newMemberForm.email || undefined,
        phone: newMemberForm.phone || undefined,
      },
      effectivePeriod: { start: new Date().toISOString() },
      primaryFacilityId: facilityId,
      actorId: currentUser?.id || 'usr-admin',
    });

    setIsAddMemberOpen(false);
    setNewMemberForm({
      displayName: '',
      professionalCategory: 'physician',
      specialties: '',
      email: '',
      phone: '',
    });
    loadAllData();
  };

  const handleVerifyCredential = async (credentialId: string) => {
    await credentialValidationService.verifyCredential({
      credentialId,
      actorId: currentUser?.id || 'usr-admin',
      facilityId,
      source: 'DIRECT_AUTHORITY_VERIFICATION',
    });
    loadAllData();
  };

  const handlePublishRoster = async (rosterId: string) => {
    await rosterShiftService.publishRoster(rosterId, {
      actorId: currentUser?.id || 'usr-admin',
      facilityId,
    });
    loadAllData();
  };

  const handleEscalateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskForEscalation || !escalateForm.escalatedTo || !escalateForm.reason) return;

    await workforceTaskService.escalateTask({
      taskId: activeTaskForEscalation,
      triggerCondition: escalateForm.triggerCondition,
      escalatedTo: escalateForm.escalatedTo,
      reason: escalateForm.reason,
      actorId: currentUser?.id || 'usr-admin',
      facilityId,
    });

    setIsEscalateModalOpen(false);
    setActiveTaskForEscalation(null);
    setEscalateForm({ triggerCondition: 'OVERDUE', escalatedTo: '', reason: '' });
    loadAllData();
  };

  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverForm.operationalNotes) return;

    await rosterShiftService.submitHandover({
      outgoingWorkforceMember: currentUser?.id || 'wfm-dr-amani',
      facility: facilityId,
      department: handoverForm.department,
      startAt: new Date(Date.now() - 8 * 3600000).toISOString(),
      endAt: new Date().toISOString(),
      patients: handoverForm.patients.split(',').map((p) => p.trim()).filter(Boolean),
      unresolvedTasks: handoverForm.unresolvedTasks.split(',').map((t) => t.trim()).filter(Boolean),
      clinicalSafetyFlags: handoverForm.clinicalSafetyFlags.split(',').map((f) => f.trim()).filter(Boolean),
      operationalNotes: handoverForm.operationalNotes,
      actorId: currentUser?.id || 'usr-admin',
    });

    setIsSubmitHandoverOpen(false);
    setHandoverForm({
      department: 'Emergency',
      operationalNotes: '',
      clinicalSafetyFlags: '',
      patients: '',
      unresolvedTasks: '',
    });
    loadAllData();
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.workforceMemberId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = !categoryFilter || m.professionalCategory === categoryFilter;
    const matchesStat = !statusFilter || m.status === statusFilter;
    return matchesSearch && matchesCat && matchesStat;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Workforce Directory</span>
            <Users className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{members.length}</div>
          <div className="text-[10px] text-teal-400 mt-0.5">Active clinical & operational staff</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Active Shifts</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {shifts.filter((s) => s.status === 'ACTIVE').length} / {shifts.length}
          </div>
          <div className="text-[10px] text-indigo-400 mt-0.5">Currently on duty rotation</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Open Tasks</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {tasks.filter((t) => t.status !== 'COMPLETED').length}
          </div>
          <div className="text-[10px] text-amber-400 mt-0.5">
            {tasks.filter((t) => t.priority === 'CRITICAL').length} critical safety items
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Staffing Status</span>
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">
            {gaps.some((g) => g.status === 'DEFICIT') ? 'DEFICIT' : 'SUFFICIENT'}
          </div>
          <div className="text-[10px] text-emerald-400 mt-0.5">Facility coverage capacity</div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-lg overflow-x-auto text-xs font-medium">
        {[
          { id: 'directory', label: 'Workforce Directory', icon: Users },
          { id: 'credentials', label: 'Credentials Queue', icon: Award, count: credentials.filter((c) => c.verificationStatus === 'PENDING').length },
          { id: 'assignments', label: 'Facility Assignments', icon: Building2 },
          { id: 'care_teams', label: 'Care Teams', icon: Users, count: teams.length },
          { id: 'rosters', label: 'Rosters & Shifts', icon: Calendar },
          { id: 'handovers', label: 'Shift Handovers', icon: ArrowRightLeft, count: handovers.length },
          { id: 'tasks', label: 'Tasks & Escalations', icon: Clock, count: tasks.filter((t) => t.status !== 'COMPLETED').length },
          { id: 'intelligence', label: 'Workforce Intelligence', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as WorkforcePanelTab)}
              className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shrink-0 ${
                isActive
                  ? 'bg-teal-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-teal-800 text-white' : 'bg-slate-800 text-teal-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: WORKFORCE DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'directory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search staff by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-300"
              >
                <option value="">All Categories</option>
                <option value="physician">Physician</option>
                <option value="nurse">Nurse</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="health_officer">Health Officer</option>
                <option value="allied_health_professional">Allied Health</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-300"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="RETIRED">Retired</option>
              </select>

              <button
                onClick={() => setIsAddMemberOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Staff
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Practitioner</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Specialties</th>
                  <th className="py-2.5 px-3">Facility Assignments</th>
                  <th className="py-2.5 px-3">Availability</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredMembers.map((m) => (
                  <tr key={m.workforceMemberId} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-100">{m.displayName}</div>
                      <div className="text-[10px] font-mono text-slate-500">{m.workforceMemberId}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-teal-300 border border-slate-700">
                        {m.professionalCategory}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {m.specialties.join(', ') || 'General'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {m.facilityAssignments.map((a) => (
                        <div key={a.assignmentId} className="text-[11px]">
                          <span className="font-mono text-indigo-300">{a.facilityId}</span>: {a.role}
                        </div>
                      ))}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {m.availability}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          m.status === 'ACTIVE'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                            : 'bg-amber-950 text-amber-300'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setSelectedMember(m)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 text-[11px]"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CREDENTIALS REVIEW QUEUE */}
      {/* ========================================================================= */}
      {activeTab === 'credentials' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">License & Credential Verification Queue</h3>
              <p className="text-xs text-slate-400">Enforces board licensure, scope of practice, and expiration monitoring</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Staff Member</th>
                  <th className="py-2.5 px-3">Credential Type</th>
                  <th className="py-2.5 px-3">Issuing Authority</th>
                  <th className="py-2.5 px-3">Reference #</th>
                  <th className="py-2.5 px-3">Valid Until</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {credentials.map((c) => {
                  const member = workforceService.getMember(c.workforceMemberId);
                  const isExpired = new Date(c.expiresAt) < new Date();
                  return (
                    <tr key={c.credentialId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {member?.displayName || c.workforceMemberId}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-indigo-300 border border-slate-700">
                          {c.credentialType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{c.issuingAuthority}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{c.credentialReference}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {c.expiresAt} {isExpired && <span className="text-rose-400 font-bold ml-1">(EXPIRED)</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            c.verificationStatus === 'VERIFIED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {c.verificationStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {c.verificationStatus !== 'VERIFIED' ? (
                          <button
                            onClick={() => handleVerifyCredential(c.credentialId)}
                            className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-medium"
                          >
                            Verify
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500">VERIFIED</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FACILITY & DEPARTMENT ASSIGNMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'assignments' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Facility Department Deployments</h3>
              <p className="text-xs text-slate-400">Multi-facility clinical roles and service scopes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {assignments.map((a) => {
              const member = workforceService.getMember(a.workforceMemberId);
              return (
                <div key={a.assignmentId} className="bg-slate-800/50 border border-slate-700/60 rounded p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{member?.displayName || a.workforceMemberId}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300">
                      {a.status}
                    </span>
                  </div>
                  <div className="text-slate-400">Role: <span className="text-slate-200">{a.role}</span></div>
                  <div className="text-slate-400">Department: <span className="text-teal-300">{a.department}</span></div>
                  <div className="text-[10px] font-mono text-slate-500">Effective: {new Date(a.effectiveFrom).toLocaleDateString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CARE TEAMS */}
      {/* ========================================================================= */}
      {activeTab === 'care_teams' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Multidisciplinary Care Teams</h3>
              <p className="text-xs text-slate-400">Patient-specific and specialized service teams</p>
            </div>
          </div>

          <div className="space-y-3">
            {teams.map((t) => (
              <div key={t.careTeamId} className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{t.service}</div>
                    <div className="text-xs text-slate-400">{t.purpose}</div>
                    {t.patientReference && (
                      <div className="text-[11px] font-mono text-teal-400 mt-0.5">
                        Patient Link: {t.patientReference}
                      </div>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                    {t.status}
                  </span>
                </div>

                <div className="mt-3 border-t border-slate-700/60 pt-3">
                  <div className="text-[11px] font-medium text-slate-300 mb-2">Assigned Practitioners:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {t.members.map((m) => {
                      const staff = workforceService.getMember(m.workforceMemberId);
                      return (
                        <div key={m.membershipId} className="bg-slate-900/60 p-2 rounded border border-slate-800">
                          <div className="font-semibold text-slate-200">{staff?.displayName || m.workforceMemberId}</div>
                          <div className="text-[10px] text-teal-400 font-mono">{m.role.replace(/_/g, ' ')}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{m.responsibility}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ROSTERS & SHIFTS */}
      {/* ========================================================================= */}
      {activeTab === 'rosters' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Duty Rosters & Shift Deployments</h3>
              <p className="text-xs text-slate-400">Weekly shift schedules, approvals, and duty presence</p>
            </div>
          </div>

          {rosters.map((r) => (
            <div key={r.rosterId} className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 text-xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-sm font-semibold text-slate-100">{r.department} Schedule</span>
                  <div className="text-[11px] font-mono text-slate-400">
                    {new Date(r.period.start).toLocaleDateString()} - {new Date(r.period.end).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                    {r.status}
                  </span>
                  {r.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => handlePublishRoster(r.rosterId)}
                      className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                    >
                      Publish Roster
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/60 text-slate-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-2.5">Staff</th>
                      <th className="py-2 px-2.5">Shift Type</th>
                      <th className="py-2 px-2.5">Start</th>
                      <th className="py-2 px-2.5">End</th>
                      <th className="py-2 px-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {r.assignments.map((s) => {
                      const staff = workforceService.getMember(s.workforceMemberId);
                      return (
                        <tr key={s.shiftId}>
                          <td className="py-2 px-2.5 font-medium text-slate-200">
                            {staff?.displayName || s.workforceMemberId}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-teal-400">{s.shiftType}</td>
                          <td className="py-2 px-2.5 font-mono text-slate-400">{new Date(s.startAt).toLocaleTimeString()}</td>
                          <td className="py-2 px-2.5 font-mono text-slate-400">{new Date(s.endAt).toLocaleTimeString()}</td>
                          <td className="py-2 px-2.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-emerald-400">
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: SHIFT HANDOVERS */}
      {/* ========================================================================= */}
      {activeTab === 'handovers' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Shift Handovers & Clinical Safety Flags</h3>
              <p className="text-xs text-slate-400">Coordination artifacts sealed with cryptographic SHA-256 integrity</p>
            </div>
            <button
              onClick={() => setIsSubmitHandoverOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              New Handover
            </button>
          </div>

          <div className="space-y-3">
            {handovers.map((h) => (
              <div key={h.handoverId} className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 text-xs space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{h.department} Shift Handover</span>
                    <span className="text-[10px] font-mono text-slate-500">ID: {h.handoverId}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300">
                    {h.status}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-4">
                  <span>Outgoing: <strong className="text-slate-200">{h.outgoingWorkforceMember}</strong></span>
                  <span>Submitted: <strong className="text-slate-200">{new Date(h.provenance.submittedAt).toLocaleTimeString()}</strong></span>
                </div>

                {h.clinicalSafetyFlags && h.clinicalSafetyFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {h.clinicalSafetyFlags.map((flag, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40 text-[10px] font-mono flex items-center gap-1">
                        <Flag className="w-3 h-3" />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-slate-300 text-xs bg-slate-900/60 p-2.5 rounded border border-slate-800">
                  {h.operationalNotes}
                </p>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                  <span>Patients Referenced: {h.patients.length}</span>
                  <span>SHA-256: {h.integrityMetadata.hash.substring(0, 16)}...</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: TASKS & ESCALATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Operational Tasks & Patient Safety Coordination</h3>
              <p className="text-xs text-slate-400">Specimen collection, critical lab review, and multi-tier escalations</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/60 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Task Type</th>
                  <th className="py-2.5 px-3">Assigned Staff</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Due Time</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tasks.map((t) => {
                  const isOverdue = new Date(t.dueAt) < new Date() && t.status !== 'COMPLETED';
                  const staff = t.assignedTo ? workforceService.getMember(t.assignedTo) : null;
                  return (
                    <tr key={t.taskId} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            t.priority === 'CRITICAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/40'
                              : t.priority === 'HIGH'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-200">
                        {t.taskType.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {staff?.displayName || t.assignedTo || 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-teal-400">
                        {t.patientReference || 'Facility-wide'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        {new Date(t.dueAt).toLocaleTimeString()} {isOverdue && <span className="text-rose-400 font-bold ml-1">(OVERDUE)</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {t.status !== 'COMPLETED' && (
                          <button
                            onClick={() => {
                              setActiveTaskForEscalation(t.taskId);
                              setIsEscalateModalOpen(true);
                            }}
                            className="px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[11px] font-medium"
                          >
                            Escalate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: WORKFORCE INTELLIGENCE */}
      {/* ========================================================================= */}
      {activeTab === 'intelligence' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Workforce Workload & Staffing Intelligence</h3>
            <p className="text-xs text-slate-400">
              Aggregated demand vs clinical staffing capacity. Governed by small-cell privacy protection.
            </p>
          </div>

          {/* Operational Load Metrics */}
          {snapshot && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/60">
                <span className="text-slate-400 text-xs">Active Tasks</span>
                <div className="text-xl font-bold text-white mt-1">{snapshot.metrics.activeTasks}</div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/60">
                <span className="text-slate-400 text-xs">Emergency Caseload</span>
                <div className="text-xl font-bold text-teal-400 mt-1">{snapshot.metrics.emergencyLoad}</div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/60">
                <span className="text-slate-400 text-xs">Lab Specimen Workload</span>
                <div className="text-xl font-bold text-indigo-400 mt-1">{snapshot.metrics.labWorkload}</div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded border border-slate-700/60">
                <span className="text-slate-400 text-xs">Overdue Items</span>
                <div className="text-xl font-bold text-rose-400 mt-1">{snapshot.metrics.overdueTasks}</div>
              </div>
            </div>
          )}

          {/* Staffing Gap Matrix */}
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3">Service Staffing Capacity</h4>
            <div className="space-y-3">
              {gaps.map((g) => (
                <div key={g.gapId} className="bg-slate-800/50 border border-slate-700/60 p-3 rounded flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-100">{g.service} - {g.category.toUpperCase()}</span>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      Required: <strong className="text-slate-200">{g.requiredCount}</strong> | Scheduled: <strong className="text-slate-200">{g.scheduledCount}</strong> | Available: <strong className="text-slate-200">{g.availableCount}</strong>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                      g.status === 'DEFICIT'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800/40'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                    }`}
                  >
                    {g.status} (GAP: {g.gap})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Member Modal */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-md">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Register New Workforce Member</h3>
            <form onSubmit={handleCreateMember} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newMemberForm.displayName}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, displayName: e.target.value })}
                  placeholder="e.g. Dr. Jane Doe"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Professional Category</label>
                <select
                  value={newMemberForm.professionalCategory}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, professionalCategory: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="physician">Physician / Medical Officer</option>
                  <option value="nurse">Nurse</option>
                  <option value="pharmacist">Pharmacist</option>
                  <option value="health_officer">Health Officer</option>
                  <option value="allied_health_professional">Allied Health</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Specialties (comma-separated)</label>
                <input
                  type="text"
                  value={newMemberForm.specialties}
                  onChange={(e) => setNewMemberForm({ ...newMemberForm, specialties: e.target.value })}
                  placeholder="e.g. Emergency Care, Pediatrics"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate Task Modal */}
      {isEscalateModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-md">
            <h3 className="text-sm font-semibold text-rose-300 mb-4 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Escalate Clinical Safety Task
            </h3>
            <form onSubmit={handleEscalateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Trigger Condition</label>
                <select
                  value={escalateForm.triggerCondition}
                  onChange={(e) => setEscalateForm({ ...escalateForm, triggerCondition: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="OVERDUE">Overdue Execution</option>
                  <option value="CRITICAL_UNRESOLVED">Critical Result Unresolved</option>
                  <option value="UNAVAILABLE_ASSIGNEE">Unavailable Assignee</option>
                  <option value="SHIFT_ENDING">Shift Ending Imminently</option>
                  <option value="FAILED_HANDOVER">Failed Handover Coordination</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Escalate To Staff</label>
                <select
                  value={escalateForm.escalatedTo}
                  onChange={(e) => setEscalateForm({ ...escalateForm, escalatedTo: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                >
                  <option value="">Select senior clinician...</option>
                  {members.map((m) => (
                    <option key={m.workforceMemberId} value={m.workforceMemberId}>
                      {m.displayName} ({m.professionalCategory})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Escalation Reason</label>
                <textarea
                  value={escalateForm.reason}
                  onChange={(e) => setEscalateForm({ ...escalateForm, reason: e.target.value })}
                  placeholder="Clinical safety rationale for escalation..."
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 h-20"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEscalateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
                >
                  Confirm Escalation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Handover Modal */}
      {isSubmitHandoverOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 w-full max-w-lg">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">Submit Shift Handover</h3>
            <form onSubmit={handleSubmitHandover} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Department</label>
                <input
                  type="text"
                  value={handoverForm.department}
                  onChange={(e) => setHandoverForm({ ...handoverForm, department: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Clinical Safety Flags (comma-separated)</label>
                <input
                  type="text"
                  value={handoverForm.clinicalSafetyFlags}
                  onChange={(e) => setHandoverForm({ ...handoverForm, clinicalSafetyFlags: e.target.value })}
                  placeholder="e.g. Critical Potassium, Fasting for Ultrasound"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Patient References (comma-separated)</label>
                <input
                  type="text"
                  value={handoverForm.patients}
                  onChange={(e) => setHandoverForm({ ...handoverForm, patients: e.target.value })}
                  placeholder="e.g. pat-001-mkwawa"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Operational & Clinical Continuity Notes</label>
                <textarea
                  value={handoverForm.operationalNotes}
                  onChange={(e) => setHandoverForm({ ...handoverForm, operationalNotes: e.target.value })}
                  placeholder="Detail critical patient states, pending labs, and resuscitation protocols..."
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 h-24"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitHandoverOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                >
                  Seal & Submit Handover
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
