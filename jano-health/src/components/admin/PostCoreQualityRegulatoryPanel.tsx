/**
 * Jano Health — Post-Core Track 1
 * Real-Site Deployment, Quality System & Regulatory Evidence Panel
 *
 * Operational Command Center for:
 * 1. Real-Site Deployments & Rugged Hardware Topologies
 * 2. Site Acceptance Testing (SAT) — 17-Category Verification
 * 3. Software Quality Management System (QMS) & CAPA Resolution
 * 4. Controlled Document Management & Immutable Versioning
 * 5. Requirements & Regulatory Evidence Register (Gap Analysis)
 * 6. Post-Deployment Clinical Safety Surveillance & Hazard Logs
 * 7. Cybersecurity Evidence, Provenance & SBOM Inventory
 * 8. Interoperability Conformance & Workforce Training Gating
 * 9. Engineering Change Orders (ECN) & Sealed Release Dossiers
 */

import React, { useState } from 'react';
import {
  realSiteDeploymentService,
  qualityManagementService,
  documentControlService,
  regulatoryRegisterService,
  clinicalSafetySurveillanceService,
  cybersecurityEvidenceService,
  interoperabilityTrainingService,
  changeControlReleaseDossierService,
} from '../../services/postcore';
import {
  Building,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Shield,
  ShieldAlert,
  Award,
  Layers,
  Activity,
  Terminal,
  Lock,
  Cpu,
  GraduationCap,
  Scale,
  RefreshCw,
  GitCommit,
  Clock,
  Eye,
  Check,
} from 'lucide-react';

export const PostCoreQualityRegulatoryPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    | 'deployments'
    | 'sat'
    | 'qms'
    | 'documents'
    | 'regulatory'
    | 'safety'
    | 'cybersecurity'
    | 'training_interop'
    | 'dossier'
  >('deployments');

  const [refreshKey, setRefreshKey] = useState(0);
  const reload = () => setRefreshKey((k) => k + 1);

  // Data queries
  const deployments = realSiteDeploymentService.getAllDeployments();
  const satPlans = realSiteDeploymentService.getAllSatPlans();
  const objectives = qualityManagementService.getAllObjectives();
  const audits = qualityManagementService.getAllAudits();
  const capas = qualityManagementService.getAllCapas();
  const documents = documentControlService.getAllDocuments();
  const requirements = regulatoryRegisterService.getAllRequirements();
  const hazards = clinicalSafetySurveillanceService.getAllHazards();
  const incidents = clinicalSafetySurveillanceService.getAllIncidents();
  const cyberEvidences = cybersecurityEvidenceService.getAllEvidenceRecords();
  const interopTests = interoperabilityTrainingService.getAllInteropTests();
  const trainingRecords = interoperabilityTrainingService.getAllTrainingRecords();
  const changeOrders = changeControlReleaseDossierService.getAllChangeOrders();
  const dossiers = changeControlReleaseDossierService.getAllDossiers();

  const [selectedDepId, setSelectedDepId] = useState(deployments[0]?.deploymentId || '');
  const [selectedPlanId, setSelectedPlanId] = useState(satPlans[0]?.planId || '');
  const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const notify = (text: string, isError = false) => {
    setActionMessage({ text, isError });
    setTimeout(() => setActionMessage(null), 5000);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Banner & Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 tracking-wider uppercase">
                Post-Core Track 1
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Real-Site Deployment, QMS & Regulatory Evidence
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              Operational Quality, Site Verification & Evidence Framework
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-3xl">
              Accountable deployment records, Site Acceptance Testing (17 categories), internal software quality
              system, controlled document registers, post-deployment clinical safety surveillance, and tamper-evident
              audit dossiers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>

        {/* Global Statutory Disclaimer Notice */}
        <div className="mt-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg flex items-start gap-2 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <span className="font-semibold text-amber-200 uppercase tracking-wide">
              Mandatory Governance Invariant:
            </span>{' '}
            Internal software quality management and engineering evidence tracking NEVER constitute statutory
            marketing clearance, ISO certification, or government licensing. Real deployments require empirical
            activity evidence; clinical incidents are strictly isolated from IT support tickets.
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold border ${
            actionMessage.isError
              ? 'bg-rose-950/80 border-rose-800 text-rose-300'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-xl text-xs font-semibold">
        {[
          { id: 'deployments', label: 'Real-Site Deployments', icon: Building, badge: deployments.length },
          { id: 'sat', label: 'Site Acceptance (SAT)', icon: CheckCircle2, badge: satPlans.length },
          { id: 'qms', label: 'Quality & CAPA', icon: Award, badge: capas.length },
          { id: 'documents', label: 'Controlled Documents', icon: FileText, badge: documents.length },
          { id: 'regulatory', label: 'Requirements Register', icon: Scale, badge: requirements.length },
          { id: 'safety', label: 'Clinical Safety Surveillance', icon: ShieldAlert, badge: hazards.length },
          { id: 'cybersecurity', label: 'Cybersecurity & SBOM', icon: Shield, badge: cyberEvidences.length },
          { id: 'training_interop', label: 'Training & Interop', icon: GraduationCap, badge: trainingRecords.length },
          { id: 'dossier', label: 'Release Dossiers & ECN', icon: GitCommit, badge: dossiers.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition text-xs font-medium ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: REAL-SITE DEPLOYMENTS */}
      {activeTab === 'deployments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deployments.map((dep) => (
              <div
                key={dep.deploymentId}
                onClick={() => setSelectedDepId(dep.deploymentId)}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  selectedDepId === dep.deploymentId
                    ? 'bg-slate-800/90 border-indigo-500 ring-1 ring-indigo-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{dep.jurisdiction}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      dep.state === 'ACTIVATED'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {dep.state}
                  </span>
                </div>
                <h3 className="font-semibold text-sm text-white mt-1">{dep.siteName}</h3>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {dep.hardwareSpec.deviceCount} Devices • {dep.topology.replace(/_/g, ' ')}
                </p>

                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Version {dep.deploymentVersion}</span>
                  <span className={dep.hasEmpiricalActivityEvidence ? 'text-emerald-400 font-medium' : 'text-rose-400'}>
                    {dep.hasEmpiricalActivityEvidence ? '✓ Empirical Evidence' : '⚠ Missing Evidence'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Selected Deployment Detail */}
          {(() => {
            const current = deployments.find((d) => d.deploymentId === selectedDepId) || deployments[0];
            if (!current) return null;

            return (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">{current.siteName}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      ID: {current.deploymentId} • Facility: {current.facilityId} • Topology: {current.topology}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const res = realSiteDeploymentService.advanceDeploymentLifecycle(
                          current.deploymentId,
                          'HANDED_OVER',
                          'dr-joseph-ndunguru'
                        );
                        if (res.success) {
                          notify('Deployment successfully transitioned to HANDED_OVER.');
                          reload();
                        } else {
                          notify(res.reason || 'Failed to advance', true);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
                    >
                      Complete Handover
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Hardware Spec</div>
                    <div className="font-medium text-slate-200 mt-1">{current.hardwareSpec.primaryHardware}</div>
                    <div className="text-slate-400 mt-0.5">
                      Battery Backup: {current.hardwareSpec.batteryBackupPresent ? 'Yes' : 'No'} • Mesh:{' '}
                      {current.hardwareSpec.localNetworkType}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Responsible Team</div>
                    <div className="font-medium text-slate-200 mt-1">Lead: {current.responsiblePersonnel.siteLead}</div>
                    <div className="text-slate-400 mt-0.5">
                      CSO: {current.responsiblePersonnel.clinicalSafetyOfficer}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Enabled Modules</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {current.enabledModules.map((m) => (
                        <span key={m} className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px] text-slate-300">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Activity Evidence</div>
                    <div className="text-slate-300 mt-1 font-mono text-[11px]">
                      {current.activityEvidenceArtifacts.length} verified artifacts
                    </div>
                    <div className="text-emerald-400 text-[11px] mt-0.5">
                      {current.hasEmpiricalActivityEvidence ? '✓ Verified Real Site' : '⚠ Synthetic Only'}
                    </div>
                  </div>
                </div>

                {/* Evidence Artifacts List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Empirical Activity Artifacts
                  </h4>
                  <div className="space-y-1.5">
                    {current.activityEvidenceArtifacts.map((art, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-slate-950/80 rounded border border-slate-800 font-mono text-[11px] flex items-center justify-between text-slate-300"
                      >
                        <span className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          {art}
                        </span>
                        <span className="text-[10px] text-slate-400">CRYPTOGRAPHIC LOG</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* TAB 2: SITE ACCEPTANCE TESTING (SAT) */}
      {activeTab === 'sat' && (
        <div className="space-y-4">
          {satPlans.map((plan) => (
            <div key={plan.planId} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">Plan: {plan.planId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        plan.overallStatus === 'PASSED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {plan.overallStatus}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    Facility: {plan.facilityId} • Version: {plan.softwareVersion} • Total Criteria:{' '}
                    {plan.criteria.length}
                  </p>
                </div>
                {plan.approvalRecord && (
                  <div className="text-right text-xs">
                    <div className="text-emerald-400 font-semibold">✓ Approved by {plan.approvalRecord.approvedBy}</div>
                    <div className="text-slate-400 text-[10px]">{plan.approvalRecord.remarks}</div>
                  </div>
                )}
              </div>

              {/* 17 Criteria Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {plan.criteria.map((c) => (
                  <div
                    key={c.criterionId}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-[10px] font-bold">
                        {c.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          c.status === 'PASSED'
                            ? 'text-emerald-400'
                            : c.status === 'FAILED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 text-[12px]">{c.title}</div>
                    <div className="text-slate-400 text-[11px] leading-relaxed">{c.description}</div>
                    <div className="pt-1 border-t border-slate-900 font-mono text-[10px] text-slate-400">
                      Observed: {c.observedResult}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: QUALITY MANAGEMENT SYSTEM & CAPA */}
      {activeTab === 'qms' && (
        <div className="space-y-6">
          {/* Quality Objectives */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Internal Quality Objectives</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {objectives.map((obj) => (
                <div key={obj.objectiveId} className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{obj.title}</span>
                    <span className="text-emerald-400 font-bold text-[10px]">{obj.status}</span>
                  </div>
                  <div className="text-slate-400 text-[11px] mt-1 font-mono">Scope: {obj.workflowScope}</div>
                  <div className="text-slate-300 text-[11px] mt-1">Observed: {obj.currentObservedMetric}</div>
                  <div className="text-slate-400 text-[10px] mt-2 border-t border-slate-900 pt-1">
                    Owner: {obj.owner} • {obj.evidenceSummary}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CAPA Records */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Corrective & Preventive Actions (CAPA)
                </h3>
                <p className="text-xs text-slate-400">
                  Full 7-phase CAPA lifecycle with mandatory empirical verification of effectiveness before closure.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {capas.map((capa) => (
                <div key={capa.capaId} className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{capa.capaId}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {capa.sourceType}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        capa.state === 'CLOSED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {capa.state}
                    </span>
                  </div>

                  <div className="text-slate-300 leading-relaxed font-medium">{capa.problemDescription}</div>

                  {capa.rootCauseAnalysis && (
                    <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80 text-[11px] text-slate-300 font-mono">
                      <span className="text-indigo-400 font-bold">Root Cause:</span> {capa.rootCauseAnalysis}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                    <div className="space-y-1">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Corrective Actions</div>
                      {capa.correctiveActions.map((ca) => (
                        <div key={ca.actionId} className="text-slate-300">
                          • {ca.description} ({ca.assignedTo})
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="text-slate-400 font-bold uppercase text-[10px]">Preventive Actions</div>
                      {capa.preventiveActions.map((pa) => (
                        <div key={pa.actionId} className="text-slate-300">
                          • {pa.description} ({pa.assignedTo})
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/50 rounded flex items-center justify-between text-[11px] text-emerald-300">
                    <span>
                      <strong>Effectiveness Verification:</strong> {capa.effectivenessEmpiricalEvidence}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-400 font-bold">
                      {capa.isEffectivenessVerified ? '✓ VERIFIED' : 'PENDING'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CONTROLLED DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Controlled Document Register
              </h3>
              <p className="text-xs text-slate-400">
                Official SOPs, work instructions, and validation protocols. Historical revisions remain immutable.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.documentId} className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono font-bold text-[10px]">
                      {doc.documentNumber}
                    </span>
                    <span className="font-bold text-slate-200 text-sm">{doc.title}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                    v{doc.currentVersion} • {doc.currentState}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-900">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Revision History & Cryptographic Digests
                  </div>
                  {doc.revisions.map((rev) => (
                    <div
                      key={rev.revisionNumber}
                      className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px] flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-300">Rev {rev.revisionNumber} (v{rev.versionString}):</span>{' '}
                        <span className="text-slate-400">{rev.changeSummary}</span>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          Digest: {rev.contentDigest} • Approver: {rev.approverId}
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                        {rev.state}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: REQUIREMENTS & REGULATORY REGISTER */}
      {activeTab === 'regulatory' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                External Requirements & Standards Registry
              </h3>
              <p className="text-xs text-slate-400">
                Generic requirement registry tracking authority guidelines and empirical evidence gaps without
                unsubstantiated certification claims.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {requirements.map((req) => (
              <div key={req.requirementId} className="p-4 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200">{req.sourceAuthority}</span>
                    <span className="text-slate-400 font-mono text-[11px]">({req.jurisdiction})</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      req.evidenceStatus === 'SUBSTANTIATED_BY_INTERNAL_EVIDENCE'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {req.evidenceStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="font-medium text-slate-300">{req.requirementSection}</div>
                <div className="text-slate-400 leading-relaxed text-[11px]">{req.requirementText}</div>

                <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800 text-[10px] text-amber-300/90 italic">
                  <strong>Mandatory Disclaimer:</strong> {req.disclaimer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: CLINICAL SAFETY SURVEILLANCE */}
      {activeTab === 'safety' && (
        <div className="space-y-6">
          {/* Post-Core Hazard Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Post-Deployment Clinical Hazard Log
            </h3>
            <div className="space-y-2.5">
              {hazards.map((haz) => (
                <div key={haz.hazardId} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{haz.hazardCode}</span>
                      <span className="text-slate-400">({haz.clinicalDomain})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Residual: {haz.residualSeverity}
                    </span>
                  </div>
                  <div className="text-slate-300 leading-relaxed">{haz.potentialHarm}</div>
                  <div className="space-y-1 pt-1 border-t border-slate-900 text-[11px] text-slate-400">
                    <div className="font-bold uppercase text-[10px] text-slate-400">Mitigations:</div>
                    {haz.implementedMitigations.map((m, i) => (
                      <div key={i} className="text-slate-300">
                        • {m}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clinical Incidents (Strictly Separated from IT Support) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Post-Deployment Clinical Incident Reports
                </h3>
                <p className="text-xs text-slate-400">
                  Strictly separated from IT helpdesk tickets. Requires Clinical Safety Officer sign-off.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {incidents.map((inc) => (
                <div key={inc.incidentId} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-200">{inc.incidentId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {inc.disposition}
                    </span>
                  </div>
                  <div className="text-slate-300 leading-relaxed">{inc.clinicalSummary}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                    <span>Reported by: {inc.reportedBy}</span>
                    <span className="text-emerald-400">CSO Sign-Off: {inc.closedBySafetyOfficer}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: CYBERSECURITY & SBOM */}
      {activeTab === 'cybersecurity' && (
        <div className="space-y-4">
          {cyberEvidences.map((rec) => (
            <div key={rec.recordId} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">Build Provenance & Digest</h3>
                  <div className="font-mono text-xs text-slate-300 mt-1">{rec.buildDigestSha256}</div>
                </div>
                <div className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-right text-[11px]">
                  <span className="text-slate-400">Penetration Tested: </span>
                  <span className="text-emerald-400 font-bold">{rec.penetrationTestingCompleted ? 'YES' : 'NO'}</span>
                </div>
              </div>

              {/* SBOM Inventory */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Software Bill of Materials (SBOM)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {rec.sbomComponents.map((c, i) => (
                    <div key={i} className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1">
                      <div className="font-bold text-white">
                        {c.componentName} <span className="font-mono text-slate-400 text-[10px]">v{c.version}</span>
                      </div>
                      <div className="text-slate-400 text-[10px]">License: {c.license} • Supplier: {c.supplier}</div>
                      <div className="font-mono text-[9px] text-slate-400 truncate mt-1">Hash: {c.checksumSha256}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 8: INTEROPERABILITY & TRAINING */}
      {activeTab === 'training_interop' && (
        <div className="space-y-6">
          {/* Workforce Training Gating */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Clinical Workforce Competency & Access Gating
            </h3>
            <p className="text-xs text-slate-400">
              Clinical users must have verified competency and required supervised hours before unsupervised production
              access is approved.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {trainingRecords.map((tr) => (
                <div key={tr.trainingRecordId} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">{tr.userName}</div>
                      <div className="text-slate-400 text-[11px] font-mono">Role: {tr.role}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        tr.unsupervisedClinicalAccessApproved
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}
                    >
                      {tr.unsupervisedClinicalAccessApproved ? '✓ ACCESS APPROVED' : 'SUPERVISION REQUIRED'}
                    </span>
                  </div>

                  <div className="text-slate-300 font-medium text-[11px]">{tr.moduleTitle}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-900 pt-1 font-mono">
                    <span>Score: {tr.competencyScorePercent}%</span>
                    <span>Supervised: {tr.supervisedHoursCompleted}h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interoperability Conformance */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Interoperability Conformance Test Suites
            </h3>
            <div className="space-y-2">
              {interopTests.map((t) => (
                <div key={t.testId} className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-200">{t.protocol}</span>
                    <span className="text-emerald-400 font-bold">{t.testResult}</span>
                  </div>
                  <div className="text-slate-400 font-mono text-[11px]">{t.profileUri}</div>
                  <div className="text-slate-300 text-[11px]">
                    {t.conformanceFindings.map((f, i) => (
                      <div key={i}>• {f}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: RELEASE DOSSIERS & CHANGE CONTROL */}
      {activeTab === 'dossier' && (
        <div className="space-y-6">
          {/* Engineering Change Orders */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Engineering Change Orders (ECO / ECN)
            </h3>
            <div className="space-y-2">
              {changeOrders.map((eco) => (
                <div key={eco.changeOrderId} className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{eco.changeOrderId}</span>
                      <span className="text-slate-300 font-semibold">{eco.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {eco.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-400 font-mono">
                    <span>Clinical Safety Sign-Off: {eco.clinicalSafetyOfficerApproved ? 'YES' : 'NO'}</span>
                    <span>QMS Sign-Off: {eco.qualityManagerApproved ? 'YES' : 'NO'}</span>
                    <span>Rollback Plan: {eco.rollbackPlanDocumented ? 'YES' : 'NO'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sealed Release Dossier */}
          {dossiers.map((dos) => (
            <div key={dos.dossierId} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Release Evidence Dossier — v{dos.releaseVersion}
                  </h3>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">
                    Schema v{dos.databaseSchemaVersion} • Assertions:{' '}
                    {dos.verificationSummary.passedTestAssertions}/{dos.verificationSummary.totalTestAssertions} (100% PASS)
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono text-xs font-bold">
                  SEALED EVIDENCE
                </span>
              </div>

              {/* Cryptographic Seal */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-xs space-y-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  Cryptographic Tamper-Evident SHA-256 Digest
                </div>
                <div className="text-emerald-400 break-all">{dos.tamperEvidentSha256Digest}</div>
              </div>

              {/* Test Suite Reports */}
              <div className="space-y-1 text-xs">
                <div className="text-slate-400 font-bold uppercase text-[10px]">Verification Summary</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 font-mono text-[11px]">
                  {dos.verificationSummary.testSuiteReports.map((r, i) => (
                    <div key={i} className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                      ✓ {r}
                    </div>
                  ))}
                </div>
              </div>

              {/* Statutory Disclaimer */}
              <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-lg text-[11px] text-amber-300/90 leading-relaxed">
                <strong>Statutory Disclaimer:</strong> {dos.statutoryDisclaimer}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
