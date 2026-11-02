/**
 * Jano Health - Header Component
 * Clinical workstation top navigation bar with facility switcher,
 * user identity / role controller, and real-time synchronization state.
 */

import React from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';
import { syncEngine, SyncStats } from '../../services/sync/syncEngine';
import { RoleType } from '../../domain/types';
import { ROLE_DEFINITIONS } from '../../domain/permissions';

interface HeaderProps {
  onSearchPatient?: (query: string) => void;
  onOpenPatient?: (patientId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ onSearchPatient }) => {
  const {
    currentUser,
    currentFacility,
    availableFacilities,
    availableUsers,
    setCurrentFacility,
    switchUserById,
    openLoginPortal,
    logout,
    authMode,
  } = useAuth();
  const [syncStats, setSyncStats] = React.useState<SyncStats>(syncEngine.getStats());
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => {
    return syncEngine.subscribe((stats) => {
      setSyncStats(stats);
    });
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchPatient && searchQuery.trim()) {
      onSearchPatient(searchQuery.trim());
    }
  };

  const toggleSimulatedOffline = () => {
    syncEngine.setSimulatedOffline(!syncStats.simulatedOffline);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Brand & Facility Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white shadow-sm">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-white">Jano Health</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-teal-900/60 text-teal-300 border border-teal-700/50">
                EHR Foundation
              </span>
              {authMode === 'development' && (
                <span
                  className="hidden xl:inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30"
                  title="Running in local development simulation environment with synthetic identities"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Dev / Demo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Offline-First Clinical Decision Support</p>
          </div>
        </div>

        {/* Facility Selector */}
        <div className="hidden lg:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-800">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            value={currentFacility.id}
            onChange={(e) => {
              const fac = availableFacilities.find((f) => f.id === e.target.value);
              if (fac) setCurrentFacility(fac);
            }}
            className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1 focus:outline-none focus:border-teal-500 cursor-pointer max-w-[210px] truncate"
            title="Switch Active Facility Boundary"
          >
            {availableFacilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Center Search Input */}
      <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:block">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search patient by MRN, Name, National ID, Phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/70 border border-slate-800 focus:border-teal-500 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors"
          />
        </div>
      </form>

      {/* Right Controls: Connectivity, Queue Badge, Demo User Switcher */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Offline / Online Status Indicator & Simulator */}
        <div className="flex items-center gap-1.5">
          {(() => {
            const isOffline = syncStats.simulatedOffline || syncStats.isSimulatedOffline || syncStats.state === 'OFFLINE' || (syncStats.state as any) === 'offline' || !syncStats.isOnline;
            const isSyncing = syncStats.state === 'SYNCING' || (syncStats.state as any) === 'syncing';
            const queued = syncStats.queuedCount ?? syncStats.pendingCount ?? 0;

            return (
              <>
                <button
                  onClick={toggleSimulatedOffline}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors ${
                    syncStats.simulatedOffline || syncStats.isSimulatedOffline
                      ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                      : isOffline
                      ? 'bg-red-950/60 border-red-800/80 text-red-300'
                      : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                  }`}
                  title="Click to toggle simulated offline mode (for rural connectivity testing)"
                >
                  {isOffline ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-medium text-[11px]">
                        {syncStats.simulatedOffline || syncStats.isSimulatedOffline ? 'Simulated Offline' : 'Offline Mode'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-medium text-[11px]">Online</span>
                    </>
                  )}
                </button>

                {/* Sync Queue State Indicator */}
                <button
                  onClick={() => syncEngine.triggerSync()}
                  disabled={isOffline}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 disabled:opacity-50"
                  title={`Sync Queue: ${queued} pending delta events`}
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-teal-400' : ''}`} />
                  <span className="text-[11px] font-mono font-medium">
                    {queued > 0 ? `${queued} Queued` : 'Synced'}
                  </span>
                </button>
              </>
            );
          })()}
        </div>

        {/* User Identity & Multi-Role Demo Switcher */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-200 leading-tight">{currentUser.fullName}</p>
            <div className="flex items-center justify-end gap-1">
              <Shield className="w-2.5 h-2.5 text-teal-400" />
              <span className="text-[10px] text-teal-300 uppercase tracking-wider font-mono">
                {ROLE_DEFINITIONS[currentUser.role]?.title || currentUser.role}
              </span>
            </div>
          </div>

          <div className="relative group">
            <select
              value={currentUser.id}
              onChange={(e) => switchUserById(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs border border-teal-500/40 hover:border-teal-400 rounded px-2 py-1 font-medium focus:outline-none focus:border-teal-400 cursor-pointer max-w-[180px] sm:max-w-[210px] truncate"
              title="Switch Synthetic Demo Identity (Multi-Role Testing)"
            >
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({ROLE_DEFINITIONS[u.role]?.title || u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Open Demo Accounts Directory */}
          <button
            onClick={openLoginPortal}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-colors cursor-pointer"
            title="Open Full Development / Demo Accounts Directory"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline text-[11px] font-medium">Demo Directory</span>
          </button>

          {/* Sign Out Action */}
          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            title="Sign Out / Switch Identity"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
