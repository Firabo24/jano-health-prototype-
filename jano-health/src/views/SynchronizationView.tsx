/**
 * Jano Health - Synchronization Engine Console View
 * Offline-first transaction ledger, outgoing/incoming queue monitoring,
 * conflict resolution manager, and rural network simulation.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  RefreshCw,
  Server,
  Shield,
  Smartphone,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { SyncEvent } from '../domain/types';
import { localDb } from '../services/storage/localDatabase';
import { syncEngine, SyncStats } from '../services/sync/syncEngine';
import { useAuth } from '../services/security/authContext';

export const SynchronizationView: React.FC = () => {
  const { currentFacility } = useAuth();
  const [syncStats, setSyncStats] = useState<SyncStats>(syncEngine.getStats());
  const [queue, setQueue] = useState<SyncEvent[]>(() => localDb.getSyncQueue());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeConflict, setActiveConflict] = useState<SyncEvent | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  useEffect(() => {
    return syncEngine.subscribe((stats) => {
      setSyncStats(stats);
      setQueue(localDb.getSyncQueue());
    });
  }, []);

  const handleManualSync = async () => {
    await syncEngine.triggerSync();
    setQueue(localDb.getSyncQueue());
  };

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(!syncStats.simulatedOffline);
  };

  const handleClearSynced = async () => {
    if (isClearing) return;
    setIsClearing(true);
    setClearError('');
    try {
      await localDb.clearSyncedEvents();
      setQueue(localDb.getSyncQueue());
    } catch (err: any) {
      console.error('[SynchronizationView] Failed to clear synced events:', err);
      setClearError(`Failed to clear synced events: ${err?.message || String(err)}`);
      setQueue(localDb.getSyncQueue());
      setTimeout(() => setClearError(''), 6000);
    } finally {
      setIsClearing(false);
    }
  };

  const handleResolveConflict = (eventId: string, strategy: 'client_wins' | 'server_wins') => {
    syncEngine.resolveConflict(eventId, strategy);
    setActiveConflict(null);
    setQueue(localDb.getSyncQueue());
  };

  const filteredQueue = queue.filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {clearError && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-lg">
          {clearError}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">
              Synchronization & Offline Ledger
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
              Delta Sync Engine
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Decentralized event ledger, conflict arbitration, and multi-facility store-and-forward routing
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleToggleOffline}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              syncStats.simulatedOffline
                ? 'bg-amber-950 border-amber-700 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750'
            }`}
          >
            {syncStats.simulatedOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" /> Simulated Offline Mode: ACTIVE
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" /> Simulate Offline Round
              </>
            )}
          </button>

          <button
            onClick={handleManualSync}
            disabled={!syncStats.isOnline || syncStats.simulatedOffline || syncStats.state === 'OFFLINE' || syncStats.state === 'SYNCING'}
            className="px-4 py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncStats.state === 'SYNCING' || (syncStats.state as any) === 'syncing' ? 'animate-spin' : ''}`} />
            Push & Pull Sync
          </button>
        </div>
      </div>

      {/* 4 Status Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>Pending Outgoing</span>
            <ArrowUpCircle className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-teal-300">{syncStats.queuedCount}</div>
          <p className="text-[10px] text-slate-400">Events waiting for uplink</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>Synchronized</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white">{syncStats.syncedCount}</div>
          <p className="text-[10px] text-slate-400">Acknowledged by central node</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>Version Conflicts</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">{syncStats.conflictCount}</div>
          <p className="text-[10px] text-slate-400">Awaiting clinical arbitration</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span>Node Identity</span>
            <Smartphone className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-sm font-bold font-mono text-slate-200 truncate">
            {localDb.getDeviceId()}
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            Facility: {currentFacility.code}
          </p>
        </div>
      </div>

      {/* Conflict Resolution Modal */}
      {activeConflict && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-800 rounded-lg max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Clinical Data Conflict Detected</h3>
              </div>
              <button
                onClick={() => setActiveConflict(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-300">
              The record for <strong>{activeConflict.entityName}:{activeConflict.entityId}</strong> was
              modified concurrently by another provider at the central node while this node was offline.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <span className="font-semibold text-teal-300">Local Mobile Version:</span>
                <p className="text-[11px] text-slate-400">
                  Modified: {new Date(activeConflict.clientTimestamp).toLocaleTimeString()}
                </p>
                <div className="text-[10px] font-mono text-slate-300">
                  {JSON.stringify(activeConflict.payload, null, 1).substring(0, 150)}...
                </div>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <span className="font-semibold text-amber-400">Server Node Version:</span>
                <p className="text-[11px] text-slate-400">
                  Conflict: {activeConflict.conflictDetails?.reason || 'Concurrent write'}
                </p>
                <div className="text-[10px] font-mono text-slate-300">
                  Server revision: v{(activeConflict.conflictDetails?.serverVersion as number) || 2}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => handleResolveConflict(activeConflict.id, 'server_wins')}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium"
              >
                Accept Central Server (Discard Local)
              </button>
              <button
                onClick={() => handleResolveConflict(activeConflict.id, 'client_wins')}
                className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
              >
                Keep Local Clinician Version (Client Wins)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Queue Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Store-and-Forward Event Log</h3>
            <p className="text-slate-400 text-[11px]">
              Every clinical write is recorded as an immutable domain event before transmission
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs"
            >
              <option value="all">All Events ({queue.length})</option>
              <option value="queued">Queued / Pending</option>
              <option value="conflict">Conflicts Only</option>
              <option value="synced">Synced Only</option>
            </select>

            <button
              onClick={handleClearSynced}
              disabled={isClearing}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-300 text-xs flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              title="Clear acknowledged synced events from local buffer"
            >
              <Trash2 className={`w-3.5 h-3.5 ${isClearing ? 'animate-spin' : ''}`} />
              {isClearing ? 'Pruning...' : 'Prune Synced'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Event ID</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Entity</th>
                <th className="py-2.5 px-3">Entity ID</th>
                <th className="py-2.5 px-3">Local Timestamp</th>
                <th className="py-2.5 px-3">Retries</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {filteredQueue.map((item) => (
                <tr key={item.id} className="hover:bg-slate-850/50">
                  <td className="py-2 px-3 text-slate-400">{item.id}</td>
                  <td className="py-2 px-3 font-semibold text-teal-300">{item.eventType}</td>
                  <td className="py-2 px-3">{item.entityName}</td>
                  <td className="py-2 px-3 text-slate-400 truncate max-w-[120px]">{item.entityId}</td>
                  <td className="py-2 px-3 text-slate-400">
                    {new Date(item.clientTimestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="py-2 px-3">{item.retryCount || 0}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                        item.status === 'synced'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : item.status === 'conflict'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-teal-950 text-teal-300 border border-teal-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-sans">
                    {item.status === 'conflict' && (
                      <button
                        onClick={() => setActiveConflict(item)}
                        className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px]"
                      >
                        Resolve
                      </button>
                    )}
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
