/**
 * Jano Health - System Settings & Edge Device Configuration View
 * Local cache management, demo data replenishment, edge device telemetry.
 */

import React, { useState } from 'react';
import {
  Database,
  HardDrive,
  Key,
  RefreshCw,
  Server,
  ShieldAlert,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';

export const SettingsView: React.FC = () => {
  const { currentFacility } = useAuth();
  const [deviceId] = useState(localDb.getDeviceId());
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleResetData = async () => {
    if (isResetting) return;
    if (window.confirm('Reset all local storage to fresh synthetic demo data?')) {
      setIsResetting(true);
      setResetMessage('');
      setResetError('');
      try {
        await localDb.resetToSyntheticDemoData();
        setResetMessage('Local database successfully reset to standard synthetic clinic records.');
        setTimeout(() => setResetMessage(''), 4000);
      } catch (err: any) {
        console.error('[SettingsView] Reset to synthetic demo data failed:', err);
        setResetError(`Database reset failed: ${err?.message || String(err)}`);
        setTimeout(() => setResetError(''), 6000);
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">System Configuration & Edge Node</h1>
        <p className="text-xs text-slate-400">
          Local client persistence storage, synchronization mesh parameters, and device cryptographic keys
        </p>
      </div>

      {resetMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs rounded-lg">
          {resetMessage}
        </div>
      )}

      {resetError && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-lg">
          {resetError}
        </div>
      )}

      {/* Node Identity Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-teal-400" />
          Hardware & Edge Device Node Identity
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold">Device Node UUID:</span>
            <div className="font-mono text-teal-300 select-all">{deviceId}</div>
            <p className="text-[10px] text-slate-400">Unique cryptographic ID for multi-master mesh synchronization.</p>
          </div>

          <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-slate-400 font-semibold">Facility Node Affiliation:</span>
            <div className="font-mono text-white">{currentFacility.name} ({currentFacility.code})</div>
            <p className="text-[10px] text-slate-400">Default jurisdictional sync boundary.</p>
          </div>
        </div>
      </div>

      {/* Persistence Management */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-purple-400" />
          Local Storage & Synthetic Dataset Controls
        </h3>

        <p className="text-slate-300">
          Jano Health utilizes local client-side persistence for immediate offline clinical access. All records are
          synthetic and compliant with healthcare privacy regulations.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={handleResetData}
            disabled={isResetting}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-semibold flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 text-teal-400 ${isResetting ? 'animate-spin' : ''}`} />
            {isResetting ? 'Resetting Database...' : 'Reload Synthetic Clinic Cohort'}
          </button>
        </div>
      </div>

      {/* Backend Integration Telemetry */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-400" />
          Full-Stack Server & AI Proxy Endpoints
        </h3>

        <div className="space-y-2 font-mono text-[11px] text-slate-300">
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span>GET /api/health</span>
            <span className="text-emerald-400 font-bold">200 OK (Node.js/Express)</span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span>POST /api/ai/clinical-assist</span>
            <span className="text-teal-400">Server-Side Gemini 3.8 Proxy</span>
          </div>
          <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
            <span>POST /api/sync/push</span>
            <span className="text-blue-400">Batched Delta Sync Queue Ingress</span>
          </div>
        </div>
      </div>
    </div>
  );
};
