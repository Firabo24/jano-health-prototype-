/**
 * Jano Health - Security & Operational Audit Log View
 * Immutable, tamper-evident audit trail for regulatory compliance & forensic verification.
 */

import React, { useState } from 'react';
import {
  Download,
  Filter,
  History,
  Search,
  Shield,
  UserCheck,
} from 'lucide-react';
import { AuditEvent } from '../domain/types';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';

export const AuditLogView: React.FC = () => {
  const { currentFacility } = useAuth();
  const [logs] = useState<AuditEvent[]>(() => localDb.getAuditLogs());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditEvent | null>(null);

  const filteredLogs = logs.filter((l) => {
    const q = searchTerm.toLowerCase();
    return (
      !q ||
      l.action.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.resourceType.toLowerCase().includes(q) ||
      l.resourceId.toLowerCase().includes(q)
    );
  });

  const exportAuditCSV = () => {
    const header = 'ID,Timestamp,Actor,Role,Action,Resource,ResourceId,Facility,Device,SyncStatus\n';
    const rows = filteredLogs
      .map(
        (l) =>
          `"${l.id}","${l.timestamp}","${l.actorName}","${l.actorRole}","${l.action}","${l.resourceType}","${l.resourceId}","${l.facilityId}","${l.deviceId}","${l.syncStatus}"`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jano_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Security & Clinical Audit Trail</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
              HIPAA / MOH Compliant
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Append-only chronological record of every clinical access, modification, and AI consultation
          </p>
        </div>

        <button
          onClick={exportAuditCSV}
          className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" /> Export Verifiable CSV
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by action, actor name, resource type or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* Audit Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-xl w-full p-5 space-y-4 text-xs font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-teal-300 text-sm">{selectedLog.action}</span>
              <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="space-y-2 text-slate-300">
              <div>Log Identifier: {selectedLog.id}</div>
              <div>Actor: {selectedLog.actorName} ({selectedLog.actorRole})</div>
              <div>Timestamp: {selectedLog.timestamp}</div>
              <div>Resource Target: {selectedLog.resourceType} ({selectedLog.resourceId})</div>
              <div>Device ID: {selectedLog.deviceId}</div>
              <div>Facility ID: {selectedLog.facilityId}</div>
              {selectedLog.resultingState && (
                <div className="mt-2 p-2 bg-slate-950 rounded border border-slate-800">
                  <div className="text-slate-400 mb-1 font-sans">Resulting State Snapshot:</div>
                  <pre className="text-[10px] text-teal-300 overflow-x-auto">
                    {JSON.stringify(selectedLog.resultingState, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Actor & Role</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Resource Target</th>
                <th className="py-2.5 px-3">Device Node</th>
                <th className="py-2.5 px-3">Ledger Status</th>
                <th className="py-2.5 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-850/50">
                  <td className="py-2.5 px-3 text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-semibold text-slate-200">{log.actorName}</span>
                    <span className="text-teal-400 text-[10px] block">[{log.actorRole}]</span>
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-white">{log.action}</td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {log.resourceType}:{log.resourceId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 truncate max-w-[100px]">{log.deviceId}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                        log.syncStatus === 'synced'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-amber-950 text-amber-300'
                      }`}
                    >
                      {log.syncStatus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-teal-400 hover:underline font-semibold"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
