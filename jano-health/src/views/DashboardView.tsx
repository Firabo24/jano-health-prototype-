/**
 * Jano Health - Clinical Dashboard View
 * Executive and bedside operations overview for district healthcare facilities.
 */

import React from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  FlaskConical,
  Radio,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { localDb } from '../services/storage/localDatabase';
import { syncEngine, SyncStats } from '../services/sync/syncEngine';
import { useAuth } from '../services/security/authContext';
import { ActiveNavTab } from '../components/layout/Sidebar';
import { RoleWorkspaceSection } from '../components/dashboard/RoleWorkspaceSection';

interface DashboardViewProps {
  onNavigate: (tab: ActiveNavTab) => void;
  onSelectPatient: (patientId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onSelectPatient }) => {
  const { currentFacility } = useAuth();
  const [syncStats, setSyncStats] = React.useState<SyncStats>(syncEngine.getStats());

  React.useEffect(() => {
    return syncEngine.subscribe((stats) => {
      setSyncStats(stats);
    });
  }, []);

  const patients = localDb.getPatients();
  const encounters = localDb.getEncounters();
  const activeEncounters = encounters.filter((e) => e.status === 'in_progress');
  const appointments = localDb.getAppointments();
  const labOrders = localDb.getLabOrders();
  const pendingLabs = labOrders.filter((l) => l.status === 'ordered' || l.status === 'processing');
  const radOrders = localDb.getRadiologyOrders();
  const pendingRads = radOrders.filter((r) => r.status === 'ordered' || r.status === 'scheduled');
  const emergencyCases = localDb.getEmergencyCases().filter((e) => e.isActive);
  const auditLogs = localDb.getAuditLogs().slice(0, 6);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Facility Context & Demo Data Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">{currentFacility.name}</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
              {currentFacility.code}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Region: {currentFacility.region} • {currentFacility.district} • Facility Type: {currentFacility.type.replace('_', ' ').toUpperCase()}
          </p>
        </div>

        {/* Demo Notice & Quick Status */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-2.5 py-1 rounded bg-amber-950/60 border border-amber-800/80 text-amber-300 text-[11px] font-mono font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            SYNTHETIC DEMO DATA • CLINICAL SIMULATION
          </div>

          <button
            onClick={() => syncEngine.triggerSync()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStats.state === 'syncing' ? 'animate-spin' : ''}`} />
            Sync Now
          </button>
        </div>
      </div>

      {/* Role-Specific Workstation / Command Center */}
      <RoleWorkspaceSection onNavigate={onNavigate} onSelectPatient={onSelectPatient} />

      {/* Primary Clinical Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Patients */}
        <div
          onClick={() => onNavigate('patients')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 cursor-pointer transition-all hover:bg-slate-850"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Total Patients</span>
            <Users className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-white">{patients.length}</div>
          <p className="text-[10px] text-slate-400 mt-1">Master Patient Index</p>
        </div>

        {/* Today's Appointments */}
        <div
          onClick={() => onNavigate('appointments')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Appointments</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">{appointments.length}</div>
          <p className="text-[10px] text-slate-400 mt-1">Scheduled for today</p>
        </div>

        {/* Active Encounters */}
        <div
          onClick={() => onNavigate('encounters')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Active Encounters</span>
            <Stethoscope className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{activeEncounters.length}</div>
          <p className="text-[10px] text-emerald-400 mt-1 font-medium">In consultation</p>
        </div>

        {/* Pending Labs */}
        <div
          onClick={() => onNavigate('laboratory')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Pending Labs</span>
            <FlaskConical className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">{pendingLabs.length}</div>
          <p className="text-[10px] text-slate-400 mt-1">Orders in queue</p>
        </div>

        {/* Pending Radiology */}
        <div
          onClick={() => onNavigate('radiology')}
          className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium">Radiology Orders</span>
            <Radio className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{pendingRads.length}</div>
          <p className="text-[10px] text-slate-400 mt-1">X-ray & POCUS</p>
        </div>

        {/* Emergency Triage Cases */}
        <div
          onClick={() => onNavigate('emergency')}
          className={`border rounded-lg p-3.5 cursor-pointer transition-all ${
            emergencyCases.length > 0
              ? 'bg-red-950/40 border-red-800/80 hover:bg-red-950/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-red-400 mb-1">
            <span className="text-xs font-medium">Emergency Triage</span>
            <ShieldAlert className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-white">{emergencyCases.length}</div>
          <p className="text-[10px] text-red-300 mt-1 font-medium">Red/Yellow priority</p>
        </div>
      </div>

      {/* Main Grid: Sync & Clinical Operations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Clinical Activity & Active Emergency Cases */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Emergency Alert Card (if any) */}
          {emergencyCases.length > 0 && (
            <div className="bg-red-950/30 border border-red-800/60 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <h3 className="text-sm font-semibold text-red-200">Active High-Priority Clinical Emergencies</h3>
                </div>
                <button
                  onClick={() => onNavigate('emergency')}
                  className="text-xs text-red-300 hover:text-red-100 flex items-center gap-1 font-medium"
                >
                  View Triage Console <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                {emergencyCases.map((emg) => (
                  <div
                    key={emg.id}
                    className="bg-slate-900/90 border border-red-900/60 rounded p-3 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-red-600 text-white">
                          {emg.triageCategory}
                        </span>
                        <span className="font-semibold text-slate-200">
                          {emg.patientId ? patients.find((p) => p.id === emg.patientId)?.firstName + ' ' + patients.find((p) => p.id === emg.patientId)?.lastName : 'Unidentified Patient'}
                        </span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          Arrival: {new Date(emg.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-300">{emg.chiefComplaint}</p>
                    </div>

                    {emg.patientId && (
                      <button
                        onClick={() => onSelectPatient(emg.patientId!)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-medium shrink-0"
                      >
                        Open Chart
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Clinical Encounters */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Active Patient Encounters</h3>
                <p className="text-xs text-slate-400">Current clinic consultations and triage queues</p>
              </div>
              <button
                onClick={() => onNavigate('encounters')}
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
              >
                View all encounters <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-800">
              {encounters.slice(0, 4).map((enc) => {
                const pat = patients.find((p) => p.id === enc.patientId);
                return (
                  <div key={enc.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 truncate">
                          {pat ? `${pat.firstName} ${pat.lastName}` : 'Unknown Patient'}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {pat?.mrn}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-mono uppercase ${
                            enc.status === 'in_progress'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {enc.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-400 truncate max-w-xl">{enc.chiefComplaint}</p>
                    </div>

                    <button
                      onClick={() => onSelectPatient(enc.patientId)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium shrink-0 text-xs"
                    >
                      Patient Chart
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit Stream Snippet */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Recent Immutable Audit Trail</h3>
                <p className="text-xs text-slate-400">Cryptographically verifiable clinical action logs</p>
              </div>
              <button
                onClick={() => onNavigate('audit_log')}
                className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
              >
                Full Audit Log <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 font-mono text-[11px]">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2 rounded bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-slate-300"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-teal-400 font-semibold">{log.action}</span>
                    <span className="text-slate-400">by {log.actorName} ({log.actorRole})</span>
                    <span className="text-slate-400 hidden sm:inline">• {log.resourceType}:{log.resourceId}</span>
                  </div>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: System & Synchronization Health, AI Assistant Hub */}
        <div className="space-y-6">
          {/* Synchronization Status Widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-teal-400" />
                Offline-First Ledger
              </h3>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                  syncStats.state === 'offline'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}
              >
                {syncStats.state.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">Client Node ID:</span>
                <span className="font-mono text-slate-200">{localDb.getDeviceId()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">Outgoing Pending Queue:</span>
                <span className="font-mono text-teal-300 font-bold">{syncStats.queuedCount} items</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800 text-slate-300">
                <span className="text-slate-400">Conflicts Detected:</span>
                <span className="font-mono text-amber-400">{syncStats.conflictCount}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-300">
                <span className="text-slate-400">Network Interface:</span>
                <span className="font-mono">
                  {syncStats.simulatedOffline ? 'Simulated Offline (Test Mode)' : navigator.onLine ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('synchronization')}
              className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium transition-colors"
            >
              Open Synchronization Console
            </button>
          </div>

          {/* Jano AI Assistant Snapshot Card */}
          <div className="bg-slate-900 border border-teal-900/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-semibold text-white">Jano AI Decision Support</h3>
              </div>
              <span className="text-[10px] font-mono bg-teal-950 text-teal-300 px-1.5 py-0.5 rounded border border-teal-800">
                Active
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Server-side Gemini 3.8 Flash integrated with offline clinical rule engine fallback for disconnected rural rounds.
            </p>

            <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div className="text-slate-400 font-medium">Available AI Capabilities:</div>
              <div className="grid grid-cols-2 gap-1 text-slate-400">
                <div>• Chart Summaries</div>
                <div>• Risk Flagging</div>
                <div>• Differentials</div>
                <div>• Patient Education</div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('ai_assistant')}
              className="w-full py-1.5 rounded bg-teal-600/30 hover:bg-teal-600/40 border border-teal-500/50 text-teal-200 text-xs font-medium transition-colors"
            >
              Launch AI Clinical Console
            </button>
          </div>

          {/* Facility Epidemiological Alert */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <Bell className="w-4 h-4" />
              <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Epidemiological Surveillance
              </h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Seasonal malaria spike noted in Malagarasi River Basin. Rapid Diagnostic Tests (mRDT) and Artemether-Lumefantrine stock replenished at Uvinza depot.
            </p>
            <div className="text-[10px] text-slate-400 font-mono">Ministry of Health Sentinel Bulletin #36</div>
          </div>
        </div>
      </div>
    </div>
  );
};
