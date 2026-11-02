import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Activity,
  Layers,
  Scale,
  GitBranch,
  Brain,
  WifiOff,
  RefreshCw,
  Lock,
  Unlock,
  ChevronRight,
  TrendingUp,
  Award,
  Sparkles,
} from 'lucide-react';
import {
  evidenceProgramService,
  siteComparabilityService,
  standardizedMetricCatalogService,
  comparativeAnalysisService,
  siteImplementationMaturityService,
  crossSiteRiskService,
  multiSiteAIEvaluationService,
  offlineConditionAnalysisService,
  pilotLearningLoopService,
  scaleDecisionService,
  multiSiteEvidencePacketService,
} from '../../services/multisite';
import {
  EvidenceProgram,
  SiteEnrollment,
  ComparabilityAssessment,
  StandardizedPilotMetric,
  ComparativeAnalysis,
  SiteImplementationMaturity,
  ProgramRiskRegisterEntry,
  CrossSiteIncidentCorrelation,
  MultiSiteConfigurationDrift,
  MultiSiteAIEvaluation,
  OfflineConditionAnalysis,
  PilotLearningRecord,
  DomainReadinessScorecard,
  ExpansionGateEvaluation,
  ScaleDecisionRecord,
  MultiSiteEvidencePacket,
} from '../../domain/v24MultiSiteEvidenceTypes';

export const MultiSiteEvidenceScalePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    | 'program'
    | 'comparability'
    | 'metrics'
    | 'comparative'
    | 'maturity'
    | 'risks'
    | 'ai_eval'
    | 'offline'
    | 'learning'
    | 'decision_packet'
  >('program');

  const [program, setProgram] = useState<EvidenceProgram | null>(null);
  const [enrollments, setEnrollments] = useState<SiteEnrollment[]>([]);
  const [assessments, setAssessments] = useState<ComparabilityAssessment[]>([]);
  const [metrics, setMetrics] = useState<StandardizedPilotMetric[]>([]);
  const [analyses, setAnalyses] = useState<ComparativeAnalysis[]>([]);
  const [maturities, setMaturities] = useState<SiteImplementationMaturity[]>([]);
  const [risks, setRisks] = useState<ProgramRiskRegisterEntry[]>([]);
  const [correlations, setCorrelations] = useState<CrossSiteIncidentCorrelation[]>([]);
  const [drifts, setDrifts] = useState<MultiSiteConfigurationDrift[]>([]);
  const [aiEvaluations, setAiEvaluations] = useState<MultiSiteAIEvaluation[]>([]);
  const [offlineAnalyses, setOfflineAnalyses] = useState<OfflineConditionAnalysis[]>([]);
  const [learnings, setLearnings] = useState<PilotLearningRecord[]>([]);
  const [scorecard, setScorecard] = useState<DomainReadinessScorecard | null>(null);
  const [gates, setGates] = useState<ExpansionGateEvaluation[]>([]);
  const [decisions, setDecisions] = useState<ScaleDecisionRecord[]>([]);
  const [packets, setPackets] = useState<MultiSiteEvidencePacket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const prog = await evidenceProgramService.getProgram('prog-multisite-east-africa');
      setProgram(prog);

      if (prog) {
        const enrs = await evidenceProgramService.listSiteEnrollments(prog.programId);
        setEnrollments(enrs);

        const mList = await standardizedMetricCatalogService.listMetrics();
        setMetrics(mList);

        const anlList = await comparativeAnalysisService.listAnalyses(prog.programId);
        setAnalyses(anlList);

        const matList = await siteImplementationMaturityService.listMaturities();
        setMaturities(matList);

        const rList = await crossSiteRiskService.listRisks(prog.programId);
        setRisks(rList);

        const corrList = await crossSiteRiskService.listCorrelations(prog.programId);
        setCorrelations(corrList);

        const drList = await crossSiteRiskService.listDrifts(prog.programId);
        setDrifts(drList);

        const aiList = await multiSiteAIEvaluationService.listEvaluations(prog.programId);
        setAiEvaluations(aiList);

        const offList = await offlineConditionAnalysisService.listAnalyses();
        setOfflineAnalyses(offList);

        const lrnList = await pilotLearningLoopService.listLearningRecords(prog.programId);
        setLearnings(lrnList);

        const sc = await scaleDecisionService.evaluateScorecard(prog.programId);
        setScorecard(sc);

        const gList = await scaleDecisionService.listGates(prog.programId);
        setGates(gList);

        const decList = await scaleDecisionService.listDecisions(prog.programId);
        setDecisions(decList);

        const pktList = await multiSiteEvidencePacketService.listPackets(prog.programId);
        setPackets(pktList);

        // Load baseline comparability assessment
        const cmp = await siteComparabilityService.getAssessment('site-amani-01', 'site-kilima-02');
        if (cmp) setAssessments([cmp]);
      }
    } catch (err: any) {
      console.error('Error loading V24 Multi-Site Data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleSuspendSite = async (siteId: string, currentlySuspended: boolean) => {
    try {
      if (currentlySuspended) {
        await evidenceProgramService.resumeSite(siteId);
        setActionMessage(`Site ${siteId} resumed into active operations.`);
      } else {
        await evidenceProgramService.suspendSite(siteId, 'Governed supervisor operational pause');
        setActionMessage(`Site ${siteId} paused under federated governance.`);
      }
      await loadData();
    } catch (err: any) {
      setActionMessage(`Action error: ${err.message}`);
    }
  };

  const handleRunComparativeAnalysis = async () => {
    try {
      const fresh = await comparativeAnalysisService.executeComparativeAnalysis(
        'prog-multisite-east-africa',
        'METRIC_SYNC_RELIABILITY',
        'SITE_A_VS_SITE_B',
        'site-amani-01',
        'site-kilima-02',
        99.0,
        92.6,
        295,
        'usr-coord-dr-elimu'
      );
      setActionMessage(`Comparative Analysis executed: ${fresh.analysisId} (${fresh.interpretation})`);
      await loadData();
    } catch (err: any) {
      setActionMessage(`Analysis error: ${err.message}`);
    }
  };

  const handleGeneratePacket = async () => {
    try {
      const pkt = await multiSiteEvidencePacketService.generateAndSealPacket('prog-multisite-east-africa');
      setActionMessage(`Multi-Site Evidence Packet sealed: ${pkt.packetId} with SHA-256 seal.`);
      await loadData();
    } catch (err: any) {
      setActionMessage(`Packet generation error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
        <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Loading Multi-Site Evidence & Scale Subsystem...
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs text-slate-300">
      {/* Top Banner / Program Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                CLINICAL CORE V24
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                340 IDB STORES ACTIVE
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-950 text-amber-400 border border-amber-800/40">
                INDEPENDENT FEDERATED
              </span>
            </div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              {program ? program.name : 'Multi-Site Digital Health Evidence Program'}
            </h2>
            <p className="text-slate-400 text-[11px]">
              Protocol: <span className="font-mono text-slate-300">{program?.protocolNumber}</span> (v{program?.protocolVersion}) • Sponsor: {program?.sponsor}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGeneratePacket}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors"
            >
              <Award className="w-4 h-4" />
              Compile & Seal Evidence Packet
            </button>
            <button
              onClick={loadData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
              title="Refresh Telemetry & Stores"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Message feedback */}
        {actionMessage && (
          <div className="p-2.5 bg-indigo-950/60 border border-indigo-800/50 rounded text-indigo-200 text-xs flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-indigo-400 hover:text-white ml-2 text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Mandatory Statutory Non-Causal Disclaimer */}
        <div className="p-3 bg-slate-950 border border-amber-900/30 rounded text-amber-300/80 text-[11px] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300 uppercase">Statutory Evidence Caveat:</span> This multi-site operational control plane records prospective technical, usability, and workflow metrics across real-world pilot facilities. Observed variances between sites or periods reflect multifactorial local conditions and do NOT constitute clinical efficacy or therapeutic superiority claims.
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-800 pt-3 text-[11px]">
          {[
            { id: 'program', label: 'Sites & Cohorts', icon: Layers },
            { id: 'comparability', label: 'Site Comparability', icon: GitBranch },
            { id: 'metrics', label: 'Metric Catalog', icon: FileText },
            { id: 'comparative', label: 'Comparative Engine', icon: TrendingUp },
            { id: 'maturity', label: 'Site Maturity (L0-5)', icon: Award },
            { id: 'risks', label: 'Risks & Drift', icon: AlertTriangle },
            { id: 'ai_eval', label: 'AI Advisory Governance', icon: Brain },
            { id: 'offline', label: 'Offline Resilience', icon: WifiOff },
            { id: 'learning', label: 'Learning Loop', icon: RefreshCw },
            { id: 'decision_packet', label: 'Scale Decision & Packets', icon: Scale },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2.5 py-1.5 rounded flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Sites & Cohorts */}
      {activeTab === 'program' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Independent Federated Site Enrollments ({enrollments.length})
            </h3>
            <p className="text-slate-400 text-xs">
              Each facility maintains local data sovereignty and autonomous operational control. Site suspension does not cascade to other network participants.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {enrollments.map((enr) => (
                <div
                  key={enr.enrollmentId}
                  className={`p-3.5 rounded border transition-all ${
                    enr.isSuspended
                      ? 'bg-rose-950/20 border-rose-800/50 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm text-white">{enr.facilityName}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                        enr.isSuspended
                          ? 'bg-rose-900 text-rose-200'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                      }`}
                    >
                      {enr.phase}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-400">
                    <div>Site ID: <span className="font-mono text-slate-300">{enr.siteId}</span></div>
                    <div>Local Governance: <span className="font-mono text-teal-300">{enr.governanceLeadId}</span></div>
                    <div>
                      Enabled Modules:{' '}
                      <span className="text-slate-300 font-mono text-[10px]">
                        {enr.enabledModules.join(', ')}
                      </span>
                    </div>
                    {enr.isSuspended && (
                      <div className="text-rose-400 text-[10px] pt-1">
                        Reason: {enr.suspensionReason}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {enr.isLocallyGoverned ? '✓ Federated Sovereignty' : 'Centralized'}
                    </span>
                    <button
                      onClick={() => handleToggleSuspendSite(enr.siteId, enr.isSuspended)}
                      className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 ${
                        enr.isSuspended
                          ? 'bg-emerald-800 hover:bg-emerald-700 text-white'
                          : 'bg-rose-900/60 hover:bg-rose-800 text-rose-200'
                      }`}
                    >
                      {enr.isSuspended ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {enr.isSuspended ? 'Resume Site' : 'Pause Site'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Site Comparability */}
      {activeTab === 'comparability' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-teal-400" />
              Objective Site Comparability Framework
            </h3>
            <p className="text-slate-400 text-xs">
              Prevents comparing fundamentally mismatched health facilities. Evaluates 4 dimensions: Software (35%), Clinical Environment (25%), Infrastructure (20%), and Operational Conditions (20%).
            </p>

            {assessments.length === 0 ? (
              <div className="p-6 bg-slate-950 border border-slate-800 rounded text-center text-slate-400">
                No active comparisons loaded.
              </div>
            ) : (
              assessments.map((a) => (
                <div key={a.assessmentId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                      <span className="font-mono text-indigo-300">{a.baseSiteId}</span>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                      <span className="font-mono text-indigo-300">{a.targetSiteId}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        a.status === 'COMPARABLE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                          : a.status === 'CONDITIONALLY_COMPARABLE'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                          : 'bg-rose-950 text-rose-300 border border-rose-800/40'
                      }`}
                    >
                      {a.status} • Score: {a.overallSimilarityScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Software Match</div>
                      <div className="font-bold text-white text-sm">{a.softwareSimilarity}%</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Clinical Match</div>
                      <div className="font-bold text-white text-sm">{a.clinicalSimilarity}%</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Infrastructure Match</div>
                      <div className="font-bold text-white text-sm">{a.infrastructureSimilarity}%</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Operations Match</div>
                      <div className="font-bold text-white text-sm">{a.operationalSimilarity}%</div>
                    </div>
                  </div>

                  {a.incompatibilityReasons.length > 0 && (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded text-amber-200/90 text-xs space-y-1">
                      <div className="font-semibold text-amber-300">Identified Comparability Divergences:</div>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        {a.incompatibilityReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {a.conditionalityNotes && (
                    <div className="text-slate-400 text-[11px] italic">
                      Note: {a.conditionalityNotes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Metric Catalog */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              Standardized Version-Locked Pilot Metric Catalog ({metrics.length})
            </h3>
            <p className="text-slate-400 text-xs">
              Every metric has an immutable version number, explicit formula, inclusion/exclusion criteria, and known limitations. Modifying a version-locked definition retroactively is forbidden.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {metrics.map((m) => (
                <div key={m.metricId} className="p-3.5 bg-slate-950 border border-slate-800 rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-300">{m.metricId}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      v{m.version} {m.isVersionLocked && '🔒 Locked'}
                    </span>
                  </div>
                  <div className="font-semibold text-white text-xs">{m.name}</div>
                  <p className="text-slate-400 text-[11px]">{m.definition}</p>
                  <div className="p-2 bg-slate-900 rounded font-mono text-[10px] text-teal-300">
                    Formula: {m.formula} ({m.unit})
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <div>Category: <span className="font-semibold text-slate-300">{m.category}</span></div>
                    <div>Source Stores: <span className="font-mono text-slate-400">{m.sourceStores.join(', ')}</span></div>
                    <div>Limitations: <span className="text-slate-400 italic">{m.knownLimitations.join('; ')}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Comparative Engine */}
      {activeTab === 'comparative' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Deterministic Comparative Analyses ({analyses.length})
                </h3>
                <p className="text-slate-400 text-xs">
                  Raw observations are strictly separated from derived normalized metrics. Comparative interpretation strictly uses non-causal language.
                </p>
              </div>
              <button
                onClick={handleRunComparativeAnalysis}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-xs flex items-center gap-1.5 self-start"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run On-Demand Comparison
              </button>
            </div>

            <div className="space-y-3">
              {analyses.map((anl) => (
                <div key={anl.analysisId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">{anl.metricId}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      Interpretation: <strong className="text-white">{anl.interpretation}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] pt-1">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Base ({anl.baseEntityId})</div>
                      <div className="font-bold text-white text-sm">{anl.baseValue}</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Comparison ({anl.comparisonEntityId})</div>
                      <div className="font-bold text-white text-sm">{anl.comparisonValue}</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Absolute Delta</div>
                      <div className="font-bold text-teal-300 text-sm">{anl.absoluteDifference}</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Trend / Rel Delta</div>
                      <div className="font-bold text-indigo-300 text-sm">
                        {anl.trend} ({anl.relativeDifferencePercent}%)
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900 rounded border border-slate-800 text-[11px] text-slate-300">
                    <span className="text-amber-400 font-semibold">Non-Causal Disclaimer: </span>
                    {anl.nonCausalDisclaimer}
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1">
                    <span>Sample Size: {anl.sampleSize}</span>
                    <span>Hash: {anl.integrityHash.substring(0, 32)}...</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Site Maturity */}
      {activeTab === 'maturity' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              Site Implementation Maturity Gating (Levels 0–5)
            </h3>
            <p className="text-slate-400 text-xs">
              Levels reflect operational stability, not mere transaction volume. Promotion to Level 5 Scale Candidate strictly requires Safety Adherence ≥ 95%, Workflow ≥ 85%, and Data Quality ≥ 85%.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {maturities.map((m) => (
                <div key={m.maturityId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{m.siteId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                      {m.currentLevel}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Safety Adherence:</span>
                      <span className="font-bold text-emerald-400">{m.safetyAdherenceScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Workflow Adoption:</span>
                      <span className="font-bold text-teal-300">{m.workflowAdoptionScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Technical Stability:</span>
                      <span className="font-bold text-blue-300">{m.technicalStabilityScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Data Quality:</span>
                      <span className="font-bold text-indigo-300">{m.dataQualityScore}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Training Maturity:</span>
                      <span className="font-bold text-purple-300">{m.trainingMaturityScore}%</span>
                    </div>
                  </div>

                  {m.gapsIdentified.length > 0 && (
                    <div className="text-[10px] text-amber-300 bg-amber-950/20 p-2 rounded border border-amber-900/30">
                      Gaps: {m.gapsIdentified.join('; ')}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                    Next Milestone: {m.nextMilestonePrerequisites.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Risks & Drift */}
      {activeTab === 'risks' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Program Risk Register & Cross-Site Incident Correlation
            </h3>
            <p className="text-slate-400 text-xs">
              Detects systemic hazards affecting multiple sites, correlates hardware/workflow failure modes, and flags configuration drift against golden baselines.
            </p>

            <div className="space-y-3">
              <div className="font-semibold text-white text-xs">Program Risk Register:</div>
              {risks.map((r) => (
                <div key={r.riskId} className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{r.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800/40">
                      {r.severity} • {r.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{r.description}</p>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Affected Sites: <strong className="text-indigo-300">{r.affectedSiteIds.join(', ')}</strong></span>
                    <span>Systemic: {r.isSystemic ? '✓ YES' : 'NO'}</span>
                  </div>
                </div>
              ))}

              <div className="font-semibold text-white text-xs pt-2">Cross-Site Incident Correlations:</div>
              {correlations.map((c) => (
                <div key={c.correlationId} className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-indigo-300 font-bold">{c.correlationId} ({c.patternDimension})</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800/40">
                      {c.status}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{c.investigationSummary}</p>
                  <div className="text-[10px] text-slate-400">
                    Affected Sites: {c.affectedSiteIds.join(', ')} • Evidence: {c.confirmedLinkEvidence}
                  </div>
                </div>
              ))}

              <div className="font-semibold text-white text-xs pt-2">Multi-Site Configuration Drift:</div>
              {drifts.map((d) => (
                <div key={d.driftId} className="p-3 bg-slate-950 border border-slate-800 rounded space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">{d.siteId} • {d.component}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {d.classification}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{d.driftDescription}</p>
                  <div className="text-[10px] font-mono text-slate-400">
                    Golden: {d.goldenBaselineVersion} vs Site: {d.siteConfigVersion}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: AI Multi-Site Governance */}
      {activeTab === 'ai_eval' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Multi-Site AI Advisory Governance
            </h3>
            <p className="text-slate-400 text-xs">
              Enforces hard clinical safety invariants across all pilot facilities: clinician review is always mandatory, and autonomous clinical mutation is strictly prohibited.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiEvaluations.map((e) => (
                <div key={e.evaluationId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{e.siteId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                      ✓ ADVISORY ONLY
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Model Version:</span>
                      <span className="font-mono text-slate-200">{e.modelVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Advisory Invocations:</span>
                      <span className="font-bold text-white">{e.totalAdvisoryInvocations}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Grounded Advisories:</span>
                      <span className="font-bold text-emerald-400">{e.groundedAdvisoriesCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Clinician Accepted:</span>
                      <span className="font-bold text-teal-300">{e.clinicianAcceptedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Clinician Rejected:</span>
                      <span className="font-bold text-amber-300">{e.clinicianRejectedCount}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 italic">
                    {e.acceptanceRateNote}
                  </div>

                  <div className="p-2 bg-indigo-950/30 rounded border border-indigo-900/40 text-[10px] space-y-0.5">
                    <div className="text-emerald-300 font-semibold">✓ clinicianReviewRequired: TRUE</div>
                    <div className="text-emerald-300 font-semibold">✓ isAutonomousMutationAllowed: FALSE</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Offline Resilience */}
      {activeTab === 'offline' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-cyan-400" />
              Real-World Offline Resilience & Disconnected Operation
            </h3>
            <p className="text-slate-400 text-xs">
              Analyzes multi-site performance under real-world rural electrical and network disconnects, queue pressure, and conflict resolution.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {offlineAnalyses.map((o) => (
                <div key={o.analysisId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{o.siteId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                      Resilience Score: {o.softwareResilienceScore}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Total Offline Hours</div>
                      <div className="font-bold text-white text-sm">{o.totalOfflineHours} hrs</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Max Offline Session</div>
                      <div className="font-bold text-white text-sm">{(o.longestOfflineSessionMinutes / 60).toFixed(1)} hrs</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Offline Tx Count</div>
                      <div className="font-bold text-teal-300 text-sm">{o.offlineTransactionCount}</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <div className="text-slate-400">Failed Sync Batches</div>
                      <div className="font-bold text-emerald-400 text-sm">{o.failedSyncBatchesCount}</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex justify-between pt-1">
                    <span>Avg Sync Latency: {o.syncLatencyAverageMinutes} min</span>
                    <span>Max Queue Depth: {o.maxSyncQueueDepth}</span>
                    <span>Conflicts Resolved: {o.conflictResolutionCount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: Learning Loop */}
      {activeTab === 'learning' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400" />
              Pilot Learning Loop (OBSERVE → REVALIDATE → MEASURE)
            </h3>
            <p className="text-slate-400 text-xs">
              Formal improvement cycle preventing unverified code or workflow changes from impacting live healthcare operations without formal revalidation.
            </p>

            <div className="space-y-3">
              {learnings.map((l) => (
                <div key={l.learningId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-indigo-300 font-bold">{l.learningId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                      Phase: {l.phase} • Revalidation: {l.revalidationStatus}
                    </span>
                  </div>

                  <div className="text-white text-xs font-semibold">{l.observedProblem}</div>
                  <p className="text-slate-400 text-[11px]">{l.analysisFindings}</p>

                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px] space-y-1">
                    <div><span className="text-slate-400">Proposed Change: </span>{l.proposedChangeDescription}</div>
                    <div><span className="text-slate-400">Revalidation Protocol: </span>{l.revalidationProtocol}</div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                    <span>Responsible Lead: {l.responsibleLeadId}</span>
                    <span>Updated: {new Date(l.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 10: Scale Decision & Packets */}
      {activeTab === 'decision_packet' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              Multi-Domain Scale Readiness Scorecard & Sealed Evidence Packets
            </h3>
            <p className="text-slate-400 text-xs">
              Evaluates full multi-domain readiness (Technical, Clinical Workflow, User Adoption, Data Quality, AI Governance, Operations). Any BLOCKING category strictly prevents scale authorization.
            </p>

            {scorecard && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <div className="font-bold text-white text-xs">Program Readiness Scorecard:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <div className="text-slate-400">Technical</div>
                    <div className="font-bold text-emerald-400 text-sm">{scorecard.technical}</div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <div className="text-slate-400">Clinical Workflow</div>
                    <div className="font-bold text-emerald-400 text-sm">{scorecard.clinicalWorkflow}</div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <div className="text-slate-400">AI Governance</div>
                    <div className="font-bold text-emerald-400 text-sm">{scorecard.aiGovernance}</div>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <div className="text-slate-400">Operations</div>
                    <div className="font-bold text-emerald-400 text-sm">{scorecard.operations}</div>
                  </div>
                </div>

                {scorecard.blockingReasons.length > 0 && (
                  <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded text-rose-300 text-xs">
                    Blocking Conditions: {scorecard.blockingReasons.join('; ')}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 pt-2">
              <div className="font-semibold text-white text-xs">Expansion Gate Evaluations:</div>
              {gates.map((g) => (
                <div key={g.gateId} className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-xs">{g.scope}</span>
                    <div className="text-[10px] text-slate-400">Evaluated by {g.evaluatedBy} on {new Date(g.evaluatedAt).toLocaleDateString()}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                    {g.status}
                  </span>
                </div>
              ))}

              <div className="font-semibold text-white text-xs pt-2">Scale Decision Records:</div>
              {decisions.map((d) => (
                <div key={d.decisionId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{d.decisionType}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Authority: {d.approvingAuthorityName} ({d.approvingAuthorityRole})
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{d.decisionRationale}</p>
                  <div className="text-[10px] font-mono text-indigo-300">
                    Seal Hash: {d.integrityHash}
                  </div>
                </div>
              ))}

              <div className="font-semibold text-white text-xs pt-2">Sealed Evidence Packets ({packets.length}):</div>
              {packets.map((pkt) => (
                <div key={pkt.packetId} className="p-4 bg-slate-950 border border-indigo-900/40 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-400" />
                      <span className="font-mono text-xs font-bold text-white">{pkt.packetId}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Sites: {pkt.participatingSitesCount} • Generated: {new Date(pkt.generatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-300">
                    <div><strong>Raw Observations: </strong>{pkt.evidenceDistinctions.rawObservedSummary}</div>
                    <div><strong>Derived Metrics: </strong>{pkt.evidenceDistinctions.derivedMetricsSummary}</div>
                    <div><strong>Comparative Findings: </strong>{pkt.evidenceDistinctions.analyzedFindingsSummary}</div>
                  </div>

                  <div className="p-2 bg-slate-900 rounded font-mono text-[10px] text-emerald-300">
                    SHA-256 Cryptographic Seal: {pkt.packetSha256Seal}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
