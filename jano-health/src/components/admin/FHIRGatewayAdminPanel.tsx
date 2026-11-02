/**
 * Jano Health - FHIR Gateway & External Systems Administration Panel
 * Clinical Core V12: Administrative oversight for External Systems, Trust Status,
 * Exchange Logs, Import Review Queue, and Interoperability Telemetry.
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Activity,
  Server,
  Globe,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Eye,
  Key,
  Database,
  Search,
  Filter,
  Layers,
  FileText,
} from 'lucide-react';
import { externalSystemRegistryService } from '../../services/fhir/externalSystems';
import { fhirExchangeGateway } from '../../services/fhir/exchangeGateway';
import { gatewayObservability } from '../../services/fhir/observability';
import { fhirExchangeLogStore } from '../../services/fhir/exchangeLogStore';
import { fhirImportReviewStore } from '../../services/fhir/importReviewStore';
import { fhirOutboundClient } from '../../services/fhir/outboundClient';
import { ExternalSystem, FHIRExchangeLogEntry, ImportReviewItem, GatewayMetrics } from '../../services/fhir/gatewayTypes';
import { useAuth } from '../../services/security/authContext';

export const FHIRGatewayAdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'systems' | 'logs' | 'review' | 'queue' | 'metrics'>('systems');
  const [systems, setSystems] = useState<ExternalSystem[]>([]);
  const [logs, setLogs] = useState<FHIRExchangeLogEntry[]>([]);
  const [reviewItems, setReviewItems] = useState<ImportReviewItem[]>([]);
  const [metrics, setMetrics] = useState<GatewayMetrics>(gatewayObservability.getMetrics());
  const [selectedReviewItem, setSelectedReviewItem] = useState<ImportReviewItem | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'INBOUND' | 'OUTBOUND'>('ALL');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    setSystems(externalSystemRegistryService.getAllSystems());
    setLogs(fhirExchangeLogStore.getLogs());
    setReviewItems(fhirImportReviewStore.getItems());
    setMetrics(gatewayObservability.getMetrics());
  }, [refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleToggleTrust = (systemId: string) => {
    const sys = externalSystemRegistryService.getSystem(systemId);
    if (!sys) return;
    const nextStatus = sys.trustStatus === 'TRUSTED' ? 'SUSPENDED' : 'TRUSTED';
    const nextLevel = nextStatus === 'TRUSTED' ? 'LIMITED' : 'UNTRUSTED';
    externalSystemRegistryService.updateTrust(systemId, nextStatus, nextLevel, currentUser.id);
    handleRefresh();
  };

  const handleResolveReview = (action: 'ACCEPT' | 'REJECT') => {
    if (!selectedReviewItem) return;
    fhirImportReviewStore.resolveReview(
      selectedReviewItem.id,
      action,
      currentUser.id,
      currentUser.fullName || 'Clinician Reviewer',
      reviewFeedback || `Clinician reviewed and marked as ${action}`
    );
    setSelectedReviewItem(null);
    setReviewFeedback('');
    handleRefresh();
  };

  const filteredLogs = logs.filter((l) => {
    if (filterDirection === 'ALL') return true;
    return l.direction === filterDirection;
  });

  return (
    <div className="space-y-6">
      {/* Header with quick stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-teal-400" />
            <h2 className="text-base font-bold text-white">FHIR R5 Interoperability & Gateway Governance</h2>
          </div>
          <p className="text-xs text-slate-400">
            Authoritative external system registry, cryptographic access enforcement, trust lifecycle, and audit lineage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveSubTab('systems')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
            activeSubTab === 'systems'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          External Systems ({systems.length})
        </button>

        <button
          onClick={() => setActiveSubTab('review')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
            activeSubTab === 'review'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          Import Review Queue ({reviewItems.filter((r) => r.status === 'PENDING_IMPORT_REVIEW').length})
        </button>

        <button
          onClick={() => setActiveSubTab('logs')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
            activeSubTab === 'logs'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Exchange Logs ({logs.length})
        </button>

        <button
          onClick={() => setActiveSubTab('metrics')}
          className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
            activeSubTab === 'metrics'
              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          Observability & Metrics
        </button>
      </div>

      {/* VIEW: External Systems */}
      {activeSubTab === 'systems' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systems.map((sys) => {
              const isTrusted = sys.trustStatus === 'TRUSTED';
              return (
                <div
                  key={sys.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm">{sys.organizationName}</h4>
                        <span className="font-mono text-[10px] text-slate-400">{sys.systemIdentifier}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${
                          isTrusted
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                            : sys.trustStatus === 'PENDING'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-rose-950/80 text-rose-300 border-rose-800'
                        }`}
                      >
                        {sys.trustStatus} ({sys.trustLevel})
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-300 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Endpoint:</span>
                        <span className="font-mono text-teal-300 break-all">{sys.endpoint}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Auth Method:</span>
                        <span className="font-mono text-slate-200">{sys.authenticationMethod}</span>
                        <span className="text-slate-500 ml-2">Rate Limit:</span>
                        <span className="font-mono text-slate-200">{sys.rateLimitPerMinute} req/min</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Directions:</span>
                        <span className="font-mono text-slate-300">{sys.allowedDirections.join(', ')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">Facility Scope:</span>
                        <span className="font-mono text-slate-300">
                          {sys.allowedFacilities.includes('*') ? 'All Facilities (*)' : sys.allowedFacilities.join(', ')}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="text-[10px] text-slate-500 block mb-1">Permitted FHIR Resources:</span>
                      <div className="flex flex-wrap gap-1">
                        {sys.allowedResources.map((res) => (
                          <span
                            key={res}
                            className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-teal-400"
                          >
                            {res}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 truncate max-w-[240px]">
                      {sys.provenance}
                    </span>
                    <button
                      onClick={() => handleToggleTrust(sys.id)}
                      className={`px-3 py-1 rounded text-[11px] font-semibold border transition-colors ${
                        isTrusted
                          ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border-rose-800'
                          : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800'
                      }`}
                    >
                      {isTrusted ? 'Suspend Trust' : 'Authorize & Trust'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: Import Review Queue */}
      {activeSubTab === 'review' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Human-in-the-Loop Clinical Import Quarantine
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Inbound patient demographic conflicts, unmapped terminology, or ambiguous identities are safely quarantined
              here. Autonomous merging of ambiguous patient identities is strictly prohibited by clinical policy.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="py-2 px-3">Review ID</th>
                    <th className="py-2 px-3">Source Partner</th>
                    <th className="py-2 px-3">Resource</th>
                    <th className="py-2 px-3">Patient Match Status</th>
                    <th className="py-2 px-3">Terminology</th>
                    <th className="py-2 px-3">Quarantine Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 text-[11px]">
                  {reviewItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-850/40">
                      <td className="py-2.5 px-3 font-mono text-teal-300">{item.id}</td>
                      <td className="py-2.5 px-3">{item.sourceSystemName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{item.resourceType}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            item.patientMatchStatus === 'MATCH_CONFIRMED'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {item.patientMatchStatus} ({Math.round((item.reconciliationConfidence || 0) * 100)}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            item.terminologyStatus === 'EXACT'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-rose-950 text-rose-300'
                          }`}
                        >
                          {item.terminologyStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'PENDING_IMPORT_REVIEW'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : item.status === 'ACCEPTED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setSelectedReviewItem(item)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold text-[11px]"
                        >
                          Inspect & Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal / Panel for resolving review item */}
          {selectedReviewItem && (
            <div className="bg-slate-900 border border-teal-500/40 rounded-lg p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-teal-400" />
                  <h4 className="font-bold text-white text-sm">
                    Reconciliation Review: {selectedReviewItem.resourceType} ({selectedReviewItem.sourceResourceId})
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedReviewItem(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold"
                >
                  ✕ Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1.5">
                  <span className="font-bold text-slate-300 block">Conflict / Reconciliation Reasons:</span>
                  <ul className="list-disc pl-4 text-amber-300 space-y-1">
                    {selectedReviewItem.reconciliationReasons?.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    )) || <li>No conflict flags reported.</li>}
                  </ul>
                  {selectedReviewItem.unmappedCodes.length > 0 && (
                    <div className="pt-2">
                      <span className="font-bold text-slate-300 block">Unmapped Clinical Codes:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedReviewItem.unmappedCodes.map((c) => (
                          <span key={c} className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-mono text-[10px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1.5">
                  <span className="font-bold text-slate-300 block">Raw Inbound FHIR Payload:</span>
                  <pre className="text-[10px] font-mono text-slate-300 max-h-36 overflow-y-auto bg-slate-900 p-2 rounded">
                    {JSON.stringify(selectedReviewItem.rawPayload, null, 2)}
                  </pre>
                </div>
              </div>

              {selectedReviewItem.status === 'PENDING_IMPORT_REVIEW' && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Clinician Review Notes / Justification:</label>
                    <input
                      type="text"
                      value={reviewFeedback}
                      onChange={(e) => setReviewFeedback(e.target.value)}
                      placeholder="e.g. Identity manually verified against national registry. Proceed with ingestion."
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleResolveReview('ACCEPT')}
                      className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                    >
                      Accept & Merge Inbound Data
                    </button>
                    <button
                      onClick={() => handleResolveReview('REJECT')}
                      className="px-4 py-2 rounded bg-rose-700 hover:bg-rose-600 text-white font-semibold text-xs transition-colors"
                    >
                      Reject & Quarantine Payload
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW: Exchange Logs */}
      {activeSubTab === 'logs' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              FHIR Exchange Audit Log & Telemetry
            </h3>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Direction:</span>
              {(['ALL', 'INBOUND', 'OUTBOUND'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setFilterDirection(dir)}
                  className={`px-2 py-0.5 rounded text-[10px] ${
                    filterDirection === dir
                      ? 'bg-teal-500 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {dir}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 px-3">Timestamp</th>
                  <th className="py-2 px-3">Exchange ID</th>
                  <th className="py-2 px-3">Direction</th>
                  <th className="py-2 px-3">Interaction</th>
                  <th className="py-2 px-3">Resource</th>
                  <th className="py-2 px-3">Partner System</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredLogs.map((log) => (
                  <tr key={log.exchangeId} className="hover:bg-slate-850/40">
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(log.responseTimestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 text-teal-300 font-semibold">{log.exchangeId}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.direction === 'INBOUND'
                            ? 'bg-blue-950 text-blue-300'
                            : 'bg-purple-950 text-purple-300'
                        }`}
                      >
                        {log.direction}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-semibold text-white">{log.interaction}</td>
                    <td className="py-2 px-3 text-slate-200">{log.resourceType}</td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-[160px] font-sans">
                      {log.externalSystemName}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.success
                            ? 'bg-emerald-950 text-emerald-300'
                            : 'bg-rose-950 text-rose-300'
                        }`}
                      >
                        {log.responseStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{log.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: Observability & Metrics */}
      {activeSubTab === 'metrics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium">Total Gateway Requests</span>
              <div className="text-2xl font-bold text-white font-mono">{metrics.requestCount}</div>
              <span className="text-[10px] text-emerald-400 font-mono">
                {metrics.successCount} Successful ({metrics.requestCount > 0 ? Math.round((metrics.successCount / metrics.requestCount) * 100) : 100}%)
              </span>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium">Average Gateway Latency</span>
              <div className="text-2xl font-bold text-teal-300 font-mono">{metrics.averageLatencyMs} ms</div>
              <span className="text-[10px] text-slate-400 font-mono">Total: {metrics.totalLatencyMs}ms</span>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium">Rate Limit Throttles (429)</span>
              <div className="text-2xl font-bold text-amber-400 font-mono">{metrics.rateLimitExceededCount}</div>
              <span className="text-[10px] text-slate-400">Tokens/Sec Guarantees</span>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-medium">Identity Reconciliations</span>
              <div className="text-2xl font-bold text-purple-400 font-mono">{metrics.identityReconciliationCount}</div>
              <span className="text-[10px] text-slate-400">Zero Autonomous Overwrites</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3 text-xs">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              <Server className="w-4 h-4 text-teal-400" />
              REST API Endpoint & Specification Matrix
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px] text-slate-300">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span>GET /fhir/metadata</span>
                <span className="text-emerald-400">CapabilityStatement R5 (5.0.0)</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span>GET /fhir/health</span>
                <span className="text-teal-400">Gateway Health & Telemetry</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span>GET /fhir/Patient/:id/$everything</span>
                <span className="text-blue-400">Patient-Scoped Export</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span>POST /fhir (Bundle)</span>
                <span className="text-purple-400">Atomic Transaction Ingress</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
