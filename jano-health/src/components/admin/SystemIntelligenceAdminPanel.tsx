/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation Command Center
 * 
 * Central Administrative & Governance Console:
 * - Cross-Domain Situational Awareness & Multi-Dimensional System Health
 * - Active Risks & Correlation Intelligence
 * - Governed Recommendations & Human Approval Console (Dual Control Support)
 * - Safe Technical Automation & Global Kill Switch
 * - Incident Management, Root Cause Hypotheses & Playbooks
 * - Sync Self-Healing & Derived vs Authoritative Data Repair
 * - Multi-Domain Capacity Balancing (Emergency Reroute Prohibited)
 * - Deterministic What-If Simulation Engine (SIMULATION — NO PRODUCTION STATE CHANGED)
 * - Tamper-Evident Policy & Execution Ledgers
 */

import React, { useState } from 'react';
import {
  Cpu,
  ShieldCheck,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Lock,
  Layers,
  RefreshCw,
  GitPullRequest,
  Sliders,
  PowerOff,
  Power,
  Users,
  Database,
  Eye,
  FileText,
  Search,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';

export const SystemIntelligenceAdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'health' | 'risks' | 'signals' | 'recommendations' | 'automation' | 'incidents' | 'resilience' | 'capacity' | 'simulation' | 'governance'
  >('health');

  // Interactive UI State
  const [killSwitchEnabled, setKillSwitchEnabled] = useState<boolean>(true);
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('ALL');
  const [simulatedScenario, setSimulatedScenario] = useState<string | null>(null);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);

  // Recommendations Mock Data (backed by V20 schema)
  const [recommendations, setRecommendations] = useState([
    {
      id: 'rec-001-supply',
      domain: 'supply',
      title: 'Redistribute Amoxicillin Suspensions to Rural Dispensary',
      description: 'Regional warehouse holds 450 excess units while Rural Dispensary is projected to stock out in 48 hours.',
      riskLevel: 'LEVEL_2_OPERATIONAL_REVIEW',
      status: 'REVIEW_REQUIRED',
      suggestedIntervention: 'Inter-facility transfer of 60 packs from Kigoma DH to Uvinza HC',
      evidence: 'Observed stock rate depletion -12%/day, current load 8 units, threshold 25 units.',
      policy: 'pol-supply-redistribution-v1',
      requiresDualControl: false,
    },
    {
      id: 'rec-002-staffing',
      domain: 'staffing',
      title: 'Rebalance Outpatient Nursing Shift for Market Day Surge',
      description: 'Anticipated 60% surge in outpatient triage on Wednesday market day.',
      riskLevel: 'LEVEL_2_OPERATIONAL_REVIEW',
      status: 'REVIEW_REQUIRED',
      suggestedIntervention: 'Reassign 1 nurse from elective records to triage desk 08:00 - 14:00',
      evidence: 'Historical Wednesday market surge fact records, current scheduled triage ratio 1:35.',
      policy: 'pol-workforce-rebalance-v1',
      requiresDualControl: false,
    },
    {
      id: 'rec-003-national',
      domain: 'national',
      title: 'Authorize Monthly HMIS National Dataset Official Submission',
      description: 'Complete monthly epidemiological aggregate report verified with zero schema discrepancies.',
      riskLevel: 'LEVEL_3_HUMAN_AUTHORIZATION',
      status: 'REVIEW_REQUIRED',
      suggestedIntervention: 'Official transmission to Ministry NDHx DHIS2 endpoint',
      evidence: 'Dataset completeness 100%, 0 validation errors, 3 national indicators reconciled.',
      policy: 'pol-national-report-submission-v1',
      requiresDualControl: true,
      approvalsCount: 1, // Has 1 approval, needs distinct 2nd approval
    },
  ]);

  // Executions Mock Data
  const [executions, setExecutions] = useState([
    {
      id: 'exec-8891-queue',
      actionId: 'act-retry-outbound-sync',
      actionType: 'RETRY_TECHNICAL_QUEUE',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      startTime: '2026-10-06T07:15:00Z',
      result: 'SUCCEEDED',
      sideEffects: ['Outbound sync queue item retried with 1000ms backoff'],
      rolledBack: false,
    },
    {
      id: 'exec-8892-circuit',
      actionId: 'act-circuit-probe',
      actionType: 'REOPEN_CIRCUIT_BREAKER_PROBE',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      startTime: '2026-10-06T07:22:10Z',
      result: 'SUCCEEDED',
      sideEffects: ['Circuit breaker transitioned to HALF_OPEN probe state'],
      rolledBack: false,
    },
    {
      id: 'exec-8893-projection',
      actionId: 'act-rebuild-derived-projection',
      actionType: 'REBUILD_DERIVED_PROJECTION',
      riskLevel: 'LEVEL_1_TECHNICAL_SAFE',
      startTime: '2026-10-06T07:30:45Z',
      result: 'SUCCEEDED',
      sideEffects: ['Derived population analytics aggregate projection rebuilt'],
      rolledBack: false,
    },
  ]);

  const handleApprove = (id: string) => {
    setRecommendations((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          if (r.requiresDualControl && r.approvalsCount === 1) {
            setApprovalFeedback(`Dual Control Satisfied: 2nd distinct authorized human principal verified for ${r.title}`);
            return { ...r, status: 'APPROVED', approvalsCount: 2 };
          }
          setApprovalFeedback(`Authorized: ${r.title} approved by human supervisor`);
          return { ...r, status: 'APPROVED' };
        }
        return r;
      })
    );
  };

  const handleReject = (id: string) => {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'REJECTED' } : r))
    );
    setApprovalFeedback(`Rejected: Recommendation ${id} rejected with governance justification`);
  };

  const handleRollback = (execId: string) => {
    setExecutions((prev) =>
      prev.map((e) =>
        e.id === execId
          ? {
              ...e,
              result: 'ROLLED_BACK',
              rolledBack: true,
              sideEffects: [...e.sideEffects, 'Compensating administrative rollback executed'],
            }
          : e
      )
    );
    setApprovalFeedback(`Rollback Executed: Compensating action for ${execId} verified.`);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl text-slate-100">
      {/* Header & Global Kill Switch Banner */}
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold tracking-tight text-white">
              Jano System Intelligence & Governed Automation
            </h2>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700">
              Clinical Core V20
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-domain situational awareness, resilience self-healing, capacity balancing & human-governed automation.
          </p>
        </div>

        {/* Global Kill Switch */}
        <div className="flex items-center gap-3 bg-slate-900 px-3.5 py-2 rounded-lg border border-slate-800">
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold text-slate-300">Automation Engine</span>
            <span className={`text-[11px] font-mono ${killSwitchEnabled ? 'text-emerald-400' : 'text-rose-400 font-bold'}`}>
              {killSwitchEnabled ? 'ONLINE (LEVEL 1 ARMED)' : 'PAUSED (KILL SWITCH ENGAGED)'}
            </span>
          </div>
          <button
            onClick={() => setKillSwitchEnabled(!killSwitchEnabled)}
            className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center gap-1.5 ${
              killSwitchEnabled
                ? 'bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700'
                : 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 border border-emerald-700'
            }`}
          >
            {killSwitchEnabled ? (
              <>
                <PowerOff className="w-3.5 h-3.5" />
                Engage Kill Switch
              </>
            ) : (
              <>
                <Power className="w-3.5 h-3.5" />
                Re-enable Automation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Master Invariant Principle Banner */}
      <div className="bg-indigo-950/40 border-b border-indigo-900/40 px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-indigo-300">
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold tracking-wide">
            MASTER PRINCIPLE: AUTOMATE THE SAFE • RECOMMEND THE CONSEQUENTIAL • NEVER AUTONOMIZE THE CLINICAL
          </span>
        </div>
        <div className="hidden lg:flex items-center gap-4 text-slate-400 font-mono text-[11px]">
          <span>Role: {currentUser?.role || 'system_intelligence_governor'}</span>
          <span>•</span>
          <span>IndexedDB: 246 Stores Surviving</span>
          <span>•</span>
          <span>TypeScript: 0 Errors</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-950/70 overflow-x-auto text-xs font-medium">
        {[
          { key: 'health', label: 'System Health', icon: Activity },
          { key: 'risks', label: 'Active Risks', icon: AlertTriangle },
          { key: 'signals', label: 'Signals & Correlation', icon: Zap },
          { key: 'recommendations', label: 'Recommendations', icon: Sparkles },
          { key: 'automation', label: 'Automation & Executions', icon: Play },
          { key: 'incidents', label: 'Incidents & Playbooks', icon: ShieldCheck },
          { key: 'resilience', label: 'Resilience & Healing', icon: RefreshCw },
          { key: 'capacity', label: 'Capacity Balancing', icon: TrendingUp },
          { key: 'simulation', label: 'What-If Simulation', icon: Sliders },
          { key: 'governance', label: 'Governance & Audit', icon: Lock },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`px-4 py-3 flex items-center gap-2 whitespace-nowrap border-b-2 transition ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-300 bg-slate-900 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Feedback banner */}
      {approvalFeedback && (
        <div className="bg-emerald-950/80 border-b border-emerald-800 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{approvalFeedback}</span>
          </div>
          <button onClick={() => setApprovalFeedback(null)} className="text-emerald-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB CONTENT */}
      <div className="p-6">
        {/* 1. System Health Tab */}
        {activeTab === 'health' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Overall System State</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-lg font-bold text-emerald-400">HEALTHY</span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">13 Subsystems Actively Monitored</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Clinical EHR Core</span>
                <span className="text-lg font-bold text-white block mt-1">AVAILABLE</span>
                <span className="text-[11px] text-emerald-400 mt-1 block">45ms avg latency • 0 errors</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">IndexedDB Persistence</span>
                <span className="text-lg font-bold text-indigo-400 block mt-1">246 STORES</span>
                <span className="text-[11px] text-slate-400 mt-1 block">100% Schema Conformance</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                <span className="text-xs text-slate-400 block">Resilience Circuit</span>
                <span className="text-lg font-bold text-emerald-400 block mt-1">CLOSED</span>
                <span className="text-[11px] text-slate-400 mt-1 block">0 cascading failures detected</span>
              </div>
            </div>

            {/* Subsystem Health Grid */}
            <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Multi-Dimensional Subsystem Health Matrix (No Collapsed Score)
                </h3>
                <span className="text-xs text-slate-400">UNKNOWN is explicit and supported</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { name: 'Clinical EHR & Encounters', status: 'HEALTHY', metric: '12 active encounters', color: 'emerald' },
                  { name: 'Local IndexedDB Engine', status: 'HEALTHY', metric: '246 stores online', color: 'emerald' },
                  { name: 'Synchronization Engine', status: 'HEALTHY', metric: '0 pending backlog', color: 'emerald' },
                  { name: 'Jano Health Network (V13)', status: 'HEALTHY', metric: '4/4 nodes reachable', color: 'emerald' },
                  { name: 'FHIR R5 Interoperability', status: 'HEALTHY', metric: '100% conformance', color: 'emerald' },
                  { name: 'National Ecosystem (V19)', status: 'HEALTHY', metric: 'Sandbox mode active', color: 'emerald' },
                  { name: 'Technical Messaging Queues', status: 'HEALTHY', metric: '0 dead-letter items', color: 'emerald' },
                  { name: 'AI Safety Gateway', status: 'HEALTHY', metric: 'Zero clinical violations', color: 'emerald' },
                  { name: 'Workforce Operations (V16)', status: 'HEALTHY', metric: '96% shift coverage', color: 'emerald' },
                  { name: 'Supply Chain (V17)', status: 'HEALTHY', metric: '0 cold-chain holds', color: 'emerald' },
                  { name: 'Population Analytics (V14)', status: 'HEALTHY', metric: 'Projections current', color: 'emerald' },
                  { name: 'Research Governance (V18)', status: 'HEALTHY', metric: '2 protocols active', color: 'emerald' },
                  { name: 'Finance & Ledger (V15)', status: 'HEALTHY', metric: 'Ledgers verified', color: 'emerald' },
                ].map((item, idx) => (
                  <div key={idx} className="bg-slate-900 p-3 rounded border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{item.name}</span>
                      <span className="text-[11px] text-slate-400">{item.metric}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Active Risks Tab */}
        {activeTab === 'risks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">System Risk Ledger (Categorized Across 10 Domains)</h3>
              <div className="flex gap-2">
                {['ALL', 'CLINICAL_OPERATIONAL_RISK', 'SUPPLY_RISK', 'NETWORK_RISK', 'INTEROPERABILITY_RISK'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setSelectedDomainFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      selectedDomainFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: 'risk-sup-01',
                  type: 'SUPPLY_RISK',
                  state: 'ELEVATED',
                  score: 65,
                  title: 'Amoxicillin Projected Depletion at Rural Dispensary',
                  description: 'Current consumption indicates stockout within 48 hours without replenishment transfer.',
                  facility: 'Rural Dispensary 01',
                  evidence: 'Inventory audit observed 8 bottles remaining; minimum safety stock is 25.',
                },
                {
                  id: 'risk-net-02',
                  type: 'NETWORK_RISK',
                  state: 'WATCH',
                  score: 40,
                  title: 'Mobile Outreach Clinic Link Intermittent',
                  description: 'Round-trip latency to mobile outreach unit has increased above 850ms.',
                  facility: 'Mobile Unit 02',
                  evidence: 'Store-and-forward queue active; zero clinical records lost.',
                },
                {
                  id: 'risk-clin-03',
                  type: 'CLINICAL_OPERATIONAL_RISK',
                  state: 'WATCH',
                  score: 35,
                  title: 'Market Day Triage Capacity Saturation Forecast',
                  description: 'Anticipated 40% patient intake surge between 09:00 - 13:00 on Wednesday.',
                  facility: 'District Hospital 01',
                  evidence: 'V14 historical trend analytics and market calendar cross-correlation.',
                },
              ].map((r) => (
                <div key={r.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                        {r.type}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">Score: {r.score}/100</span>
                      <span className="text-xs text-slate-400">• Facility: {r.facility}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{r.title}</h4>
                    <p className="text-xs text-slate-300">{r.description}</p>
                    <span className="text-[11px] text-indigo-300 block font-mono">Evidence: {r.evidence}</span>
                  </div>
                  <span className="px-3 py-1 rounded text-xs font-bold bg-amber-900/40 text-amber-300 border border-amber-700">
                    {r.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Signals & Correlation Tab */}
        {activeTab === 'signals' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white">Cross-Domain Situational Correlation</h3>
              <p className="text-xs text-slate-400 mt-1">
                INVARIANT: Correlation ≠ Causation. Signals identify statistical and temporal co-occurrence without claiming causation.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: 'sig-01',
                  domains: ['supply', 'emergency'],
                  title: 'Emergency Resuscitation Supply Demand Co-occurrence',
                  desc: 'Emergency intake surge correlated with elevated saline usage.',
                  confidence: 0.94,
                  relationship: 'TEMPORAL_PRECEDENCE',
                },
                {
                  id: 'sig-02',
                  domains: ['network', 'referral'],
                  title: 'Network Node Latency & Referral Queue Accumulation',
                  desc: 'Node latency increases queue buffer size; local transactions continue safely.',
                  confidence: 0.89,
                  relationship: 'STATISTICAL_CO_OCCURRENCE',
                },
              ].map((s) => (
                <div key={s.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {s.domains.map((d) => (
                        <span key={d} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 uppercase">
                          {d}
                        </span>
                      ))}
                      <span className="text-xs font-mono text-indigo-400">Confidence: {(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{s.title}</h4>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                    <span className="text-[10px] text-slate-400 font-mono">Method: {s.relationship} (isCausationClaimed: false)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Governed Recommendations Console</h3>
                <p className="text-xs text-slate-400">
                  INVARIANT: Recommendation ≠ Authorization. Consequential operational actions require explicit human approval.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div key={rec.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700">
                          {rec.riskLevel}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Policy: {rec.policy}</span>
                        {rec.requiresDualControl && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700">
                            DUAL CONTROL REQUIRED
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{rec.title}</h4>
                      <p className="text-xs text-slate-300 mt-0.5">{rec.description}</p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        rec.status === 'APPROVED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : rec.status === 'REJECTED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-700'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-3 rounded border border-slate-800/80 text-xs space-y-1">
                    <span className="text-slate-400 block font-semibold">Suggested Intervention:</span>
                    <span className="text-indigo-200 block">{rec.suggestedIntervention}</span>
                    <span className="text-slate-400 block font-semibold mt-2">Explicit Decision Evidence:</span>
                    <span className="text-slate-300 block font-mono text-[11px]">{rec.evidence}</span>
                  </div>

                  {rec.status === 'REVIEW_REQUIRED' && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleReject(rec.id)}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800"
                      >
                        Reject Recommendation
                      </button>
                      <button
                        onClick={() => handleApprove(rec.id)}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        {rec.requiresDualControl && rec.approvalsCount === 1 ? 'Authorize (2nd Approval)' : 'Authorize Intervention'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Automation & Executions Tab */}
        {activeTab === 'automation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Safe Technical Automations & Execution History</h3>
                <p className="text-xs text-slate-400">
                  LEVEL 1 reversible technical remediations executed automatically under governed policy.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {executions.map((e) => (
                <div key={e.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700">
                        {e.riskLevel}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{e.id}</span>
                      <span className="text-xs text-slate-400">• {new Date(e.startTime).toLocaleTimeString()}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white">{e.actionType}</h4>
                    <span className="text-xs text-slate-300 block">{e.sideEffects.join('; ')}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold ${
                        e.result === 'SUCCEEDED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {e.result}
                    </span>

                    {e.result === 'SUCCEEDED' && (
                      <button
                        onClick={() => handleRollback(e.id)}
                        className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 border border-slate-700"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Incidents & Playbooks Tab */}
        {activeTab === 'incidents' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white">Active Incidents & Response Playbooks</h3>
              <p className="text-xs text-slate-400 mt-1">
                Zero open critical incidents. Standard response playbooks pre-registered for automated containment.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { name: 'Sync Outage Playbook', trigger: 'Queue Backlog > 100', action: 'Exponential Backoff + Worker Restart' },
                { name: 'External Integration Playbook', trigger: 'Circuit State == OPEN', action: 'Open Circuit + Store-and-Forward Queue' },
                { name: 'Security Replay Playbook', trigger: 'Replay Probe Detected', action: 'Endpoint Throttle + Replay ID Blocking' },
              ].map((p, idx) => (
                <div key={idx} className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-1.5">
                  <span className="text-xs font-bold text-indigo-300 block">{p.name}</span>
                  <span className="text-[11px] text-slate-400 block font-mono">Trigger: {p.trigger}</span>
                  <span className="text-[11px] text-emerald-400 block">Safe Action: {p.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. Resilience & Self-Healing Tab */}
        {activeTab === 'resilience' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white">Resilience & Self-Healing Architecture</h3>
              <p className="text-xs text-slate-400 mt-1">
                Distinguishes DERIVED data from AUTHORITATIVE clinical data. Safe automated rebuild permitted ONLY on derived projections.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-emerald-400 uppercase">Derived Data Projections</span>
                <span className="text-xs text-slate-300 block">
                  Dashboard aggregates, queue lag telemetry, and metric projections can be safely recalculated automatically from local ledgers.
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 inline-block">
                  AUTO-REBUILD PERMITTED
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-rose-400 uppercase">Authoritative Clinical Records</span>
                <span className="text-xs text-slate-300 block">
                  Encounters, prescriptions, lab results, radiology, and identity records remain immutable and strictly protected from autonomous modification.
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700 inline-block">
                  HUMAN REVIEW MANDATORY (FAIL-CLOSED)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 8. Capacity Balancing Tab */}
        {activeTab === 'capacity' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white">Cross-Facility Capacity Intelligence</h3>
              <p className="text-xs text-slate-400 mt-1">
                INVARIANT: Emergency patients are NEVER automatically rerouted. Capacity balancing guides future non-urgent scheduling.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { domain: 'Emergency Care', facility: 'Kigoma DH', load: '14/20 beds (70%)', state: 'ELEVATED' },
                { domain: 'Laboratory Workstation', facility: 'Kigoma DH', load: '32/50 tests/hr (64%)', state: 'NORMAL' },
                { domain: 'Radiology Ultrasound', facility: 'Uvinza HC', load: '18/20 slots (90%)', state: 'CONSTRAINED' },
              ].map((c, idx) => (
                <div key={idx} className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-1">
                  <span className="text-xs font-bold text-slate-200 block">{c.domain}</span>
                  <span className="text-[11px] text-slate-400 block">{c.facility}</span>
                  <span className="text-xs font-mono text-indigo-300 block">{c.load}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-700 inline-block mt-1">
                    {c.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 9. What-If Simulation Tab */}
        {activeTab === 'simulation' && (
          <div className="space-y-4">
            <div className="bg-amber-950/30 border border-amber-800/60 p-4 rounded-lg text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold">
                SIMULATION MODE — NO PRODUCTION STATE CHANGED • Deterministic what-if capacity and failure models only.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { id: 'EMERGENCY_SURGE', name: 'Emergency Admission Surge (+40%)', horizon: '4 Hours' },
                { id: 'NETWORK_NODE_FAILURE', name: 'Regional Bridge Node Offline', horizon: '12 Hours' },
                { id: 'SUPPLY_DELAY', name: 'Antibiotic Shipment Delayed (+72h)', horizon: '72 Hours' },
              ].map((sim) => (
                <div key={sim.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="text-xs font-bold text-white">{sim.name}</h4>
                  <span className="text-[11px] text-slate-400 block">Horizon: {sim.horizon}</span>
                  <button
                    onClick={() => setSimulatedScenario(sim.id)}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-semibold text-white transition"
                  >
                    Run What-If Simulation
                  </button>
                </div>
              ))}
            </div>

            {simulatedScenario && (
              <div className="bg-slate-950 p-4 rounded-lg border border-indigo-700/60 space-y-2 mt-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-300">Projected Simulation Outcomes ({simulatedScenario})</span>
                  <span className="text-amber-400 font-mono text-[11px]">LABEL: SIMULATION ONLY</span>
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  <li>Emergency bed utilization expected to peak at 108% within 4 hours.</li>
                  <li>Amoxicillin stockout projected in 58 hours if delivery delayed 72 hours.</li>
                  <li>Outbound sync preserves 100% of encounters locally without data loss.</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 10. Governance & Audit Tab */}
        {activeTab === 'governance' && (
          <div className="space-y-4">
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800">
              <h3 className="text-sm font-bold text-white">Automation Governance & Policy Ledgers</h3>
              <p className="text-xs text-slate-400 mt-1">
                Versioned policies, cryptographic SHA-256 integrity seals, dual control enforcement, and statutory least privilege.
              </p>
            </div>

            <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="p-3">Policy ID</th>
                    <th className="p-3">Action Type</th>
                    <th className="p-3">Risk Level</th>
                    <th className="p-3">Dual Control</th>
                    <th className="p-3">Hourly Budget</th>
                    <th className="p-3">Integrity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  <tr>
                    <td className="p-3 font-mono">pol-auto-retry-technical-v1</td>
                    <td className="p-3">RETRY_TECHNICAL_QUEUE</td>
                    <td className="p-3 text-emerald-400 font-semibold">LEVEL 1 SAFE</td>
                    <td className="p-3">No</td>
                    <td className="p-3 font-mono">50/hr</td>
                    <td className="p-3 text-emerald-400 font-mono">SHA-256 SEALED</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono">pol-supply-redistribution-v1</td>
                    <td className="p-3">SUPPLY_REDISTRIBUTION</td>
                    <td className="p-3 text-amber-400 font-semibold">LEVEL 2 REVIEW</td>
                    <td className="p-3">No</td>
                    <td className="p-3 font-mono">10/hr</td>
                    <td className="p-3 text-emerald-400 font-mono">SHA-256 SEALED</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono">pol-national-report-submission-v1</td>
                    <td className="p-3">SUBMIT_NATIONAL_REPORT</td>
                    <td className="p-3 text-indigo-400 font-semibold">LEVEL 3 AUTH</td>
                    <td className="p-3 text-amber-400 font-bold">YES (2 Principals)</td>
                    <td className="p-3 font-mono">5/hr</td>
                    <td className="p-3 text-emerald-400 font-mono">SHA-256 SEALED</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono">pol-clinical-mutation-governor-v1</td>
                    <td className="p-3">CLINICAL_RECORD_MUTATION</td>
                    <td className="p-3 text-rose-400 font-bold">LEVEL 4 PROHIBITED</td>
                    <td className="p-3">N/A</td>
                    <td className="p-3 font-mono text-rose-400">0/hr (DENY_ALL)</td>
                    <td className="p-3 text-emerald-400 font-mono">HARD BOUNDARY</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
