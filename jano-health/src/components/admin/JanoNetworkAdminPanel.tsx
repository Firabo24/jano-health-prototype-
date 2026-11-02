/**
 * Jano Health - Jano Network Administration Panel
 * Clinical Core V13: Multi-Facility Interoperability, Trust Lifecycle,
 * Exchange Monitor, Quarantine Governance, and Directory Discovery.
 */

import React, { useState, useEffect } from 'react';
import {
  Network,
  Shield,
  Activity,
  Server,
  Layers,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Search,
  Filter,
  Eye,
  Building2,
  Users,
  Compass,
  FileText,
  Radio,
  Lock,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  janoNodeRegistryService,
  networkExchangePolicyEngine,
  networkExchangeEngine,
  durableExchangeQueue,
  networkQuarantineService,
  janoFacilityRegistryService,
  networkObservabilityService,
  JanoNetworkNode,
  NetworkExchangePolicy,
  NetworkExchangeMessage,
  NetworkQuarantineItem,
  FacilityDirectoryEntry,
  NetworkMetricsSummary,
  QuarantineResolutionAction,
} from '../../services/network';
import { useAuth } from '../../services/security/authContext';

export const JanoNetworkAdminPanel: React.FC = () => {
  const { currentUser, currentFacility, can } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'nodes' | 'exchanges' | 'quarantine' | 'policies' | 'directory' | 'metrics'>('nodes');
  const [nodes, setNodes] = useState<JanoNetworkNode[]>([]);
  const [exchanges, setExchanges] = useState<NetworkExchangeMessage[]>([]);
  const [quarantineItems, setQuarantineItems] = useState<NetworkQuarantineItem[]>([]);
  const [policies, setPolicies] = useState<NetworkExchangePolicy[]>([]);
  const [facilities, setFacilities] = useState<FacilityDirectoryEntry[]>([]);
  const [metrics, setMetrics] = useState<NetworkMetricsSummary>(networkObservabilityService.getMetricsSummary());

  // Filter states
  const [exchangeStateFilter, setExchangeStateFilter] = useState<string>('ALL');
  const [quarantineCategoryFilter, setQuarantineCategoryFilter] = useState<string>('ALL');
  const [directorySearchQuery, setDirectorySearchQuery] = useState<string>('');

  // Modals & Selection
  const [selectedMessage, setSelectedMessage] = useState<NetworkExchangeMessage | null>(null);
  const [selectedQuarantineItem, setSelectedQuarantineItem] = useState<NetworkQuarantineItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [mappedEntityIdInput, setMappedEntityIdInput] = useState<string>('');
  const [isDrainingQueue, setIsDrainingQueue] = useState<boolean>(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // New Node Form State
  const [showNewNodeModal, setShowNewNodeModal] = useState<boolean>(false);
  const [newNodeCode, setNewNodeCode] = useState<string>('');
  const [newNodeDisplayName, setNewNodeDisplayName] = useState<string>('');
  const [newNodeFacilityId, setNewNodeFacilityId] = useState<string>('fac-uvinza-hc');

  const refreshData = () => {
    setNodes(janoNodeRegistryService.listNodes());
    setExchanges(durableExchangeQueue.getQueue());
    setQuarantineItems(networkQuarantineService.listQuarantined());
    setPolicies(networkExchangePolicyEngine.listPolicies());
    setFacilities(janoFacilityRegistryService.searchFacilities());
    setMetrics(networkObservabilityService.getMetricsSummary());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const showNotification = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  // Node Lifecycle Handlers
  const handleApproveNode = async (nodeId: string) => {
    try {
      await janoNodeRegistryService.approveNode(nodeId, currentUser.id, 'Approved via Jano Network Governance UI');
      showNotification(`Node '${nodeId}' trust status updated to TRUSTED.`);
      refreshData();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleSuspendNode = async (nodeId: string) => {
    try {
      await janoNodeRegistryService.suspendNode(nodeId, currentUser.id, 'Suspended by Network Administrator');
      showNotification(`Node '${nodeId}' trust suspended.`);
      refreshData();
    } catch (err: any) {
      alert(`Suspension failed: ${err.message}`);
    }
  };

  const handleRevokeNode = async (nodeId: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY REVOKE exchange trust for node '${nodeId}'? This cannot be undone.`)) {
      return;
    }
    try {
      await janoNodeRegistryService.revokeNode(nodeId, currentUser.id, 'Revoked by Network Administrator');
      showNotification(`Node '${nodeId}' trust permanently REVOKED.`);
      refreshData();
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    }
  };

  const handleRegisterNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeCode.trim() || !newNodeDisplayName.trim()) return;

    try {
      await janoNodeRegistryService.registerNode(
        {
          nodeCode: newNodeCode.trim(),
          displayName: newNodeDisplayName.trim(),
          facilityId: newNodeFacilityId,
          environment: 'development',
        },
        currentUser.id
      );
      showNotification(`Node '${newNodeCode}' registered successfully.`);
      setShowNewNodeModal(false);
      setNewNodeCode('');
      setNewNodeDisplayName('');
      refreshData();
    } catch (err: any) {
      alert(`Registration failed: ${err.message}`);
    }
  };

  // Queue & Dead-Letter Handlers
  const handleRetryExchange = async (messageId: string) => {
    try {
      await durableExchangeQueue.retryDeadLetter(messageId, currentUser.id);
      showNotification(`Exchange '${messageId}' requeued for transmission.`);
      refreshData();
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    }
  };

  const handleCancelExchange = async (messageId: string) => {
    try {
      await durableExchangeQueue.cancelExchange(messageId, currentUser.id, 'Cancelled via Network Admin');
      showNotification(`Exchange '${messageId}' marked as CANCELLED.`);
      refreshData();
    } catch (err: any) {
      alert(`Cancellation failed: ${err.message}`);
    }
  };

  const handleDrainQueue = async () => {
    setIsDrainingQueue(true);
    try {
      const result = await networkExchangeEngine.drainQueue();
      showNotification(`Queue drain complete: Attempted ${result.attempted}, Delivered ${result.delivered}, Dead-lettered ${result.deadLettered}.`);
      refreshData();
    } catch (err: any) {
      alert(`Queue drain encountered an error: ${err.message}`);
    } finally {
      setIsDrainingQueue(false);
    }
  };

  // Quarantine Review Handlers
  const handleResolveQuarantine = async (action: QuarantineResolutionAction) => {
    if (!selectedQuarantineItem) return;
    try {
      await networkQuarantineService.reviewItem(
        selectedQuarantineItem.id,
        action,
        currentUser.id,
        currentUser.role,
        reviewNotes || `Clinician disposition: ${action}`,
        mappedEntityIdInput || undefined
      );
      showNotification(`Quarantine item '${selectedQuarantineItem.id}' resolved as ${action}.`);
      setSelectedQuarantineItem(null);
      setReviewNotes('');
      setMappedEntityIdInput('');
      refreshData();
    } catch (err: any) {
      alert(`Quarantine resolution failed: ${err.message}`);
    }
  };

  // Filtered lists
  const filteredExchanges = exchanges.filter((e) => {
    if (exchangeStateFilter === 'ALL') return true;
    return e.currentState === exchangeStateFilter;
  });

  const filteredQuarantine = quarantineItems.filter((q) => {
    if (quarantineCategoryFilter === 'ALL') return true;
    return q.category === quarantineCategoryFilter;
  });

  const filteredFacilities = facilities.filter((f) => {
    if (!directorySearchQuery.trim()) return true;
    const q = directorySearchQuery.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.district.toLowerCase().includes(q) ||
      f.facilityCode.toLowerCase().includes(q) ||
      f.type.toLowerCase().includes(q)
    );
  });

  const canManageNetwork = can('interoperability.network.manage') || currentUser.role === 'network_administrator' || currentUser.role === 'system_interoperability_admin' || currentUser.role === 'system_administrator';
  const canReviewQuarantine = can('interoperability.quarantine.review') || currentUser.role === 'facility_interoperability_admin' || currentUser.role === 'system_interoperability_admin' || currentUser.role === 'terminology_administrator';

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Banner / Notification */}
      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-lg flex items-center gap-2.5 text-xs text-emerald-200 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Network Header & Quick Telemetry Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-teal-500/20 border border-indigo-500/30 rounded-lg text-indigo-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Jano Health Network</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Clinical Core V13
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    metrics.health === 'HEALTHY'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : metrics.health === 'DEGRADED'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {metrics.health}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Decentralized store-and-forward mesh, multi-node trust governance, and closed-loop cross-facility exchange
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDrainQueue}
              disabled={isDrainingQueue}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="Drain offline store-and-forward exchange queues"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isDrainingQueue ? 'animate-spin' : ''}`} />
              Drain Outbox
            </button>

            <button
              onClick={refreshData}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-xs"
              title="Refresh network state"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick KPI stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2 border-t border-slate-800 text-xs">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-slate-400">Total Exchanges</span>
            <div className="text-base font-bold text-white mt-0.5">{metrics.totalMessages}</div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-amber-400">In Outbox / Queue</span>
            <div className="text-base font-bold text-amber-300 mt-0.5">{metrics.queuedCount}</div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-emerald-400">Delivered & ACK</span>
            <div className="text-base font-bold text-emerald-300 mt-0.5">{metrics.acknowledgedCount}</div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-purple-400">Quarantine Items</span>
            <div className="text-base font-bold text-purple-300 mt-0.5">{metrics.quarantinedCount}</div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-rose-400">Dead-Letter</span>
            <div className="text-base font-bold text-rose-300 mt-0.5">{metrics.deadLetterCount}</div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-slate-400">Active / Trusted</span>
            <div className="text-base font-bold text-slate-200 mt-0.5">
              {metrics.activeNodesCount} / {metrics.trustedNodesCount}
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
            <span className="text-[11px] text-indigo-400">Avg Mesh Latency</span>
            <div className="text-base font-bold text-indigo-300 mt-0.5">{metrics.averageLatencyMs}ms</div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('nodes')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'nodes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Network Nodes ({nodes.length})
        </button>

        <button
          onClick={() => setActiveSubTab('exchanges')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'exchanges' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Exchange Monitor ({exchanges.length})
        </button>

        <button
          onClick={() => setActiveSubTab('quarantine')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'quarantine' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Quarantine Queue ({quarantineItems.filter((q) => q.status === 'PENDING_REVIEW').length})
        </button>

        <button
          onClick={() => setActiveSubTab('policies')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'policies' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Exchange Policies ({policies.length})
        </button>

        <button
          onClick={() => setActiveSubTab('directory')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'directory' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white bg-slate-900/60'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Facility & Service Directory ({facilities.length})
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. NETWORK NODES SUBTAB */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'nodes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Registered Jano Network Nodes</h3>
              <p className="text-xs text-slate-400">Participating clinics, hospitals, and mobile outreach units in this health district</p>
            </div>
            {canManageNetwork && (
              <button
                onClick={() => setShowNewNodeModal(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5"
              >
                <Server className="w-3.5 h-3.5" />
                Register Network Node
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {nodes.map((node) => {
              const isTrusted = node.trustStatus === 'TRUSTED';
              const isSuspended = node.trustStatus === 'SUSPENDED';
              const isRevoked = node.trustStatus === 'REVOKED';

              return (
                <div key={node.nodeId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{node.displayName}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {node.nodeCode}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Facility ID: {node.facilityId} • Env: {node.environment}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          node.networkStatus === 'ONLINE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {node.networkStatus}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          isTrusted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : isSuspended
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : isRevoked
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {node.trustStatus}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Transport Protocol:</span>
                      <span className="font-mono text-indigo-300">{node.endpointMetadata.protocol} ({node.endpointMetadata.authMethod})</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Supported Profiles:</span>
                      <span className="text-slate-200">{node.supportedExchangeProfiles.join(', ')}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Last Seen:</span>
                      <span className="text-slate-400">{new Date(node.lastSeenAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Actions for Network Administrators */}
                  {canManageNetwork && (
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60 text-xs">
                      {!isTrusted && !isRevoked && (
                        <button
                          onClick={() => handleApproveNode(node.nodeId)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                        >
                          Approve Node
                        </button>
                      )}
                      {isTrusted && (
                        <button
                          onClick={() => handleSuspendNode(node.nodeId)}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
                        >
                          Suspend
                        </button>
                      )}
                      {!isRevoked && (
                        <button
                          onClick={() => handleRevokeNode(node.nodeId)}
                          className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
                        >
                          Revoke Trust
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. EXCHANGE MONITOR SUBTAB */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'exchanges' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Network Exchange Monitor</h3>
              <p className="text-xs text-slate-400">Store-and-forward message transmission state, retries, and delivery acknowledgements</p>
            </div>

            {/* State filter buttons */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
              {['ALL', 'QUEUED', 'SENDING', 'DELIVERED', 'ACKNOWLEDGED', 'DEAD_LETTER'].map((st) => (
                <button
                  key={st}
                  onClick={() => setExchangeStateFilter(st)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    exchangeStateFilter === st ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-[11px]">
                  <th className="p-3 font-semibold">Message ID</th>
                  <th className="p-3 font-semibold">Route (Src → Dst)</th>
                  <th className="p-3 font-semibold">Type & Resource</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Retries</th>
                  <th className="p-3 font-semibold">Created / Ack</th>
                  <th className="p-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredExchanges.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      No network exchange messages match filter '{exchangeStateFilter}'.
                    </td>
                  </tr>
                ) : (
                  filteredExchanges.map((ex) => (
                    <tr key={ex.messageId} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-medium text-slate-200">
                        {ex.messageId.substring(0, 16)}...
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{ex.sourceFacilityId}</div>
                        <div className="text-[10px] text-slate-400">→ {ex.destinationFacilityId}</div>
                      </td>
                      <td className="p-3">
                        <span className="font-semibold text-indigo-300">{ex.messageType}</span>
                        <div className="text-[10px] text-slate-400">{ex.resourceType} ({ex.resourceId})</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            ex.currentState === 'ACKNOWLEDGED' || ex.currentState === 'APPLIED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : ex.currentState === 'QUEUED'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : ex.currentState === 'DEAD_LETTER'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {ex.currentState}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">
                        {ex.retryCount} / {ex.maxRetries}
                      </td>
                      <td className="p-3 text-[11px] text-slate-400">
                        <div>{new Date(ex.createdAt).toLocaleTimeString()}</div>
                        {ex.acknowledgedAt && <div className="text-emerald-400">Ack: {new Date(ex.acknowledgedAt).toLocaleTimeString()}</div>}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedMessage(ex)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Inspect exchange payload & attempt history"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {ex.currentState === 'DEAD_LETTER' && canManageNetwork && (
                            <button
                              onClick={() => handleRetryExchange(ex.messageId)}
                              className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold"
                            >
                              Retry
                            </button>
                          )}
                          {ex.currentState === 'QUEUED' && canManageNetwork && (
                            <button
                              onClick={() => handleCancelExchange(ex.messageId)}
                              className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-semibold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 3. QUARANTINE QUEUE SUBTAB */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'quarantine' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Network Interoperability Quarantine</h3>
              <p className="text-xs text-slate-400">
                Safeguard holding ambiguous identities, unmapped terminologies, and policy failures prior to chart entry
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
              {['ALL', 'IDENTITY_AMBIGUITY', 'TERMINOLOGY_AMBIGUITY', 'POLICY_FAILURE', 'REPLAY_DETECTED'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setQuarantineCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    quarantineCategoryFilter === cat ? 'bg-purple-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {filteredQuarantine.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
                Zero items currently in quarantine queue for category '{quarantineCategoryFilter}'.
              </div>
            ) : (
              filteredQuarantine.map((item) => (
                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{item.category}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            item.status === 'PENDING_REVIEW'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : item.status === 'APPROVED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p className="text-xs text-rose-300 font-medium">{item.quarantineReason}</p>
                    </div>

                    <div className="text-right text-[11px] text-slate-400">
                      <div>From: {item.sourceNodeId}</div>
                      <div>At: {new Date(item.quarantinedAt).toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Candidate identities if present */}
                  {item.identityCandidates && item.identityCandidates.length > 0 && (
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
                      <span className="font-semibold text-amber-300 text-[11px]">
                        Anti-Auto-Merge Guard: Ambiguous Candidate Matches ({item.identityCandidates.length})
                      </span>
                      <div className="space-y-1.5">
                        {item.identityCandidates.map((cand) => (
                          <div key={cand.patientId} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800/80">
                            <div>
                              <span className="font-bold text-slate-200">{cand.name}</span>
                              <span className="text-slate-400 text-[11px]"> (MRN: {cand.mrn}, DOB: {cand.dob})</span>
                              <div className="text-[10px] text-slate-400">{cand.matchReasons.join(', ')}</div>
                            </div>
                            <span className="text-[11px] font-mono text-amber-400 font-bold">
                              Score: {Math.round(cand.score * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60 text-xs">
                    <button
                      onClick={() => setSelectedQuarantineItem(item)}
                      className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
                    >
                      Inspect & Review
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 4. EXCHANGE POLICIES SUBTAB */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'policies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Network Exchange Policies</h3>
              <p className="text-xs text-slate-400">Explicit deny-by-default rules governing inter-facility data access and payload volumes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {policies.map((pol) => (
              <div key={pol.policyId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold text-white text-sm">{pol.name}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Purpose: <span className="text-indigo-300 font-semibold">{pol.purpose}</span> • Direction: {pol.direction}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      pol.isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {pol.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Resource Types:</span>
                    <span className="text-slate-200 font-medium">{pol.resourceTypes.join(', ')}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Operations:</span>
                    <span className="text-slate-200">{pol.operations.join(', ')}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Rate Limit:</span>
                    <span className="text-indigo-300 font-mono">{pol.rateLimitPerMinute} msgs/min (Max {(pol.maxPayloadSizeBytes / (1024 * 1024)).toFixed(1)}MB)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Quarantine Ambiguities:</span>
                    <span className={pol.quarantineOnAmbiguity ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                      {pol.quarantineOnAmbiguity ? 'Enforced' : 'Off'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. FACILITY & SERVICE DIRECTORY SUBTAB */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'directory' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Facility & Service Directory</h3>
              <p className="text-xs text-slate-400">Discover approved district healthcare facilities, referral destinations, and diagnostic capabilities</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search facility name, district..."
                value={directorySearchQuery}
                onChange={(e) => setDirectorySearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredFacilities.map((fac) => (
              <div key={fac.facilityId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-bold text-white text-sm">{fac.name}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fac.district}, {fac.region}</p>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                    {fac.facilityCode}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${fac.capabilities.referralDestination ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    Referrals: {fac.capabilities.referralDestination ? 'Yes' : 'No'}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${fac.capabilities.emergencyCapability ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    Emergency: {fac.capabilities.emergencyCapability ? 'Yes' : 'No'}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${fac.capabilities.laboratoryCapability ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    Laboratory: {fac.capabilities.laboratoryCapability ? 'Yes' : 'No'}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className={`w-1.5 h-1.5 rounded-full ${fac.capabilities.radiologyCapability ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    Radiology: {fac.capabilities.radiologyCapability ? 'Yes' : 'No'}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Node: {fac.associatedNodeId || 'None'}</span>
                  <span className={fac.nodeStatus === 'ONLINE' ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
                    ● {fac.nodeStatus || 'OFFLINE'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: REGISTER NEW NETWORK NODE */}
      {/* ---------------------------------------------------- */}
      {showNewNodeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                Register Jano Network Node
              </h3>
              <button onClick={() => setShowNewNodeModal(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRegisterNode} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Node Code (Deterministic)</label>
                <input
                  type="text"
                  placeholder="e.g. NODE-KASULU-HC"
                  value={newNodeCode}
                  onChange={(e) => setNewNodeCode(e.target.value)}
                  required
                  className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kasulu Sub-County Health Centre"
                  value={newNodeDisplayName}
                  onChange={(e) => setNewNodeDisplayName(e.target.value)}
                  required
                  className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Facility ID Context</label>
                <input
                  type="text"
                  placeholder="e.g. fac-kasulu-hc"
                  value={newNodeFacilityId}
                  onChange={(e) => setNewNodeFacilityId(e.target.value)}
                  required
                  className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewNodeModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: QUARANTINE HUMAN REVIEW */}
      {/* ---------------------------------------------------- */}
      {selectedQuarantineItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-xl w-full space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-purple-400" />
                Interoperability Quarantine Review
              </h3>
              <button onClick={() => setSelectedQuarantineItem(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-purple-950/40 border border-purple-500/30 rounded-lg space-y-1">
              <div className="flex justify-between font-bold text-purple-200">
                <span>Category: {selectedQuarantineItem.category}</span>
                <span>ID: {selectedQuarantineItem.id}</span>
              </div>
              <p className="text-slate-300">{selectedQuarantineItem.quarantineReason}</p>
            </div>

            {/* Candidate Identity Matches */}
            {selectedQuarantineItem.identityCandidates && (
              <div className="space-y-1.5">
                <span className="font-semibold text-slate-200">Anti-Auto-Merge Identity Candidates:</span>
                <div className="space-y-1">
                  {selectedQuarantineItem.identityCandidates.map((c) => (
                    <div key={c.patientId} className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-white">{c.name} (MRN: {c.mrn})</div>
                        <div className="text-[10px] text-slate-400">Match score: {Math.round(c.score * 100)}% • Reasons: {c.matchReasons.join(', ')}</div>
                      </div>
                      <button
                        onClick={() => setMappedEntityIdInput(c.patientId)}
                        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px]"
                      >
                        Select Match
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review Input */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Mapped Target ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Local Patient or Entity ID"
                  value={mappedEntityIdInput}
                  onChange={(e) => setMappedEntityIdInput(e.target.value)}
                  className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Clinician Review Notes</label>
                <textarea
                  placeholder="Clinical rationale for approval, identity mapping, or rejection..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="w-full p-2 rounded bg-slate-950 border border-slate-800 text-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedQuarantineItem(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white"
              >
                Close
              </button>
              <button
                onClick={() => handleResolveQuarantine('REJECT')}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                Reject Payload
              </button>
              <button
                onClick={() => handleResolveQuarantine(mappedEntityIdInput ? 'MAP_IDENTITY' : 'APPROVE')}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {mappedEntityIdInput ? 'Confirm Mapping & Approve' : 'Authorize & Ingest'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: MESSAGE DETAIL INSPECTION */}
      {/* ---------------------------------------------------- */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-xl w-full space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Network Exchange Envelope
              </h3>
              <button onClick={() => setSelectedMessage(null)} className="text-slate-400 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px]">
              <div>Message ID: <span className="text-indigo-300">{selectedMessage.messageId}</span></div>
              <div>Exchange ID: <span className="text-slate-200">{selectedMessage.exchangeId}</span></div>
              <div>Route: <span className="text-slate-200">{selectedMessage.sourceNodeId} → {selectedMessage.destinationNodeId}</span></div>
              <div>State: <span className="text-emerald-400">{selectedMessage.currentState}</span></div>
              <div>Idempotency Key: <span className="text-slate-400">{selectedMessage.idempotencyKey}</span></div>
              <div>Payload SHA-256: <span className="text-slate-400">{selectedMessage.payloadHash.substring(0, 24)}...</span></div>
            </div>

            {/* Attempt history */}
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-200">Attempt History ({selectedMessage.attemptHistory.length}):</span>
              {selectedMessage.attemptHistory.length === 0 ? (
                <div className="p-2 bg-slate-950 rounded text-slate-500 text-[11px]">Direct transmission succeeded without retries.</div>
              ) : (
                <div className="space-y-1">
                  {selectedMessage.attemptHistory.map((att, i) => (
                    <div key={i} className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between text-[11px]">
                      <span>Attempt #{att.attemptNumber} - {att.status}</span>
                      <span className="text-slate-400">{new Date(att.timestamp).toLocaleTimeString()} ({att.errorMessage || 'OK'})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
