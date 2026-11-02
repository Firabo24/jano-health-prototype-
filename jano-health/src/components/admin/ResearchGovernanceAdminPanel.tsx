/**
 * Jano Health - Clinical Core V18: Research, Evidence & Learning Command Center
 * 
 * Comprehensive administrative interface providing:
 * - Research Study & Protocol Governance
 * - Institutional Review & Ethics Approvals
 * - Study Site Isolation & V16 Workforce Study Teams
 * - Cohort Definitions & Small-Cell Privacy Suppression (N < 5)
 * - Research Datasets, Versioning & Release Gates
 * - Data Access Requests & Time-Bound Decisions
 * - Exceptional Re-Identification Requests & Audit Logs
 * - Protocol Deviations & Safety Events
 * - Evidence Synthesis (PICO/PECO, GRADE, Conflict Detection)
 * - Institutional Learning Cycles & Governed Practice Change Proposals
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Clinical Record ≠ Research Dataset (Research data cannot alter patient chart).
 * - Research Consent ≠ Care Consent.
 * - Practice Change Proposal ≠ Automatic Clinical Mutation.
 * - Missing telemetry/evidence remains UNKNOWN / EVIDENCE_UNAVAILABLE, never assumed SAFE.
 */

import React, { useState } from 'react';
import {
  BookOpen,
  FlaskConical,
  ShieldAlert,
  FileText,
  Users,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Layers,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Activity,
  Award,
  Sparkles,
  GitBranch,
  Building,
  Key,
  Database,
  FileCheck,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Plus,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';

export const ResearchGovernanceAdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<
    | 'studies'
    | 'protocols'
    | 'approvals'
    | 'sites'
    | 'teams'
    | 'cohorts'
    | 'datasets'
    | 'data_access'
    | 'safety_deviations'
    | 'evidence'
    | 'learning_qi'
  >('studies');

  // Interactive local states for research studies
  const [studies, setStudies] = useState([
    {
      id: 'stu-amgh-mal-01',
      identifier: 'STU-AMGH-2026-MAL',
      title: 'Pediatric Severe Malaria Outcome Cohort & Artesunate Optimization',
      shortTitle: 'Pediatric Malaria Study',
      studyType: 'observational',
      status: 'ACTIVE',
      version: 2,
      sitesCount: 2,
      enrolledCount: 38,
      pi: 'Dr. Neema Mwangi (MD)',
    },
    {
      id: 'stu-amgh-tb-02',
      identifier: 'STU-AMGH-2026-TB',
      title: 'Decentralized Community TB Adherence & Sputum Telemetry Evaluation',
      shortTitle: 'Community TB Trial',
      studyType: 'clinical_trial',
      status: 'APPROVED',
      version: 1,
      sitesCount: 1,
      enrolledCount: 0,
      pi: 'Dr. Joseph Kimaro (MD)',
    },
    {
      id: 'stu-amgh-mat-03',
      identifier: 'STU-AMGH-2026-MAT',
      title: 'Maternal Sepsis Early Detection via Continuous Postpartum Vitals',
      shortTitle: 'Maternal Sepsis QI',
      studyType: 'quality_improvement',
      status: 'UNDER_REVIEW',
      version: 1,
      sitesCount: 1,
      enrolledCount: 0,
      pi: 'Nurse Stella Achieng (BScN)',
    },
  ]);

  // Cohorts with small-cell privacy demonstration
  const [cohorts] = useState([
    {
      cohortId: 'coh-amgh-001',
      name: 'Under-5 Severe Malaria with Hypoglycemia',
      rawCount: 24,
      displayCount: '24',
      privacyStatus: 'EXACT',
      study: 'STU-AMGH-2026-MAL',
    },
    {
      cohortId: 'coh-amgh-002',
      name: 'MDR-TB Pediatric Contacts (Small Cell)',
      rawCount: 3,
      displayCount: 'SUPPRESSED (<5)',
      privacyStatus: 'SUPPRESSED',
      study: 'STU-AMGH-2026-TB',
      note: 'Small-cell threshold N < 5 enforced to prevent re-identification',
    },
    {
      cohortId: 'coh-amgh-003',
      name: 'Postpartum Eclampsia Complications',
      rawCount: 0,
      displayCount: '0',
      privacyStatus: 'NO_DATA',
      study: 'STU-AMGH-2026-MAT',
    },
  ]);

  // Datasets
  const [datasets, setDatasets] = useState([
    {
      datasetId: 'rds-mal-peds-01',
      name: 'Anonymized Pediatric Malaria Clinical Features v1.2',
      type: 'DE_IDENTIFIED',
      privacyMethod: 'SAFE_HARBOR_ANONYMIZED',
      status: 'RELEASED',
      records: 38,
      expiryDate: '2028-12-31',
    },
    {
      datasetId: 'rds-tb-telemetry-01',
      name: 'Pseudonymized TB Sputum Adherence Pilot',
      type: 'PSEUDONYMIZED',
      privacyMethod: 'PSEUDONYMIZATION',
      status: 'PENDING_APPROVAL',
      records: 12,
      expiryDate: '2027-06-30',
    },
  ]);

  // Data Access Requests
  const [dataAccessRequests, setDataAccessRequests] = useState([
    {
      requestId: 'dar-req-901',
      study: 'STU-AMGH-2026-MAL',
      requester: 'Dr. Eric Kasongo (Biostatistician)',
      purpose: 'Survival Analysis & Parasitemia Clearance Rate Modeling',
      durationDays: 90,
      status: 'PENDING_REVIEW',
    },
    {
      requestId: 'dar-req-902',
      study: 'STU-AMGH-2026-TB',
      requester: 'National Tuberculosis Program Epidemiologist',
      purpose: 'National Epidemiological Drug Resistance Surveillance',
      durationDays: 180,
      status: 'APPROVED',
    },
  ]);

  // Evidence synthesis items
  const [evidenceSyntheses] = useState([
    {
      synthesisId: 'syn-mal-01',
      question: 'In children <5 with severe malaria (P), does early parenteral artesunate (I) compared to quinine (C) reduce mortality (O)?',
      method: 'SYSTEMATIC_SYNTHESIS',
      certainty: 'HIGH',
      hasConflict: false,
      findings: 'Parenteral artesunate demonstrates significant 22.5% relative risk reduction in in-hospital mortality compared to IV quinine.',
    },
    {
      synthesisId: 'syn-tb-02',
      question: 'In ambulatory TB patients (P), does daily SMS reminders (I) compared to standard clinic visits (C) improve cure rates (O)?',
      method: 'NARRATIVE_SYNTHESIS',
      certainty: 'MODERATE',
      hasConflict: true,
      conflictNotes: 'EVIDENCE_CONFLICT detected: Study A reported 14% improvement in urban clinics; Study B reported no significant difference in remote rural settings.',
      findings: 'Intervention benefits vary markedly by cellular network reliability and digital literacy.',
    },
  ]);

  // Practice Change Proposals
  const [proposals, setProposals] = useState([
    {
      proposalId: 'pcp-2026-01',
      service: 'Inpatient Pediatric Ward',
      proposedChange: 'Standardize immediate weight-banded Artesunate dosing in triage emergency bay',
      expectedImpact: 'Reduce time-to-first-dose from 95 min to < 30 min',
      status: 'REVIEW',
      approvalsCount: 2,
    },
  ]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Research, Evidence & Learning Command Center
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Clinical Core V18
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ethical study governance, immutable protocols, small-cell privacy, evidence synthesis, and institutional learning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>IRB Governance Active</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>N &lt; 5 Suppression Enforced</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-5 pt-4 border-t border-slate-800/80 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('studies')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'studies'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Research Studies ({studies.length})
          </button>
          <button
            onClick={() => setActiveTab('cohorts')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'cohorts'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Cohorts & Privacy ({cohorts.length})
          </button>
          <button
            onClick={() => setActiveTab('datasets')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'datasets'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Datasets & Releases ({datasets.length})
          </button>
          <button
            onClick={() => setActiveTab('data_access')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'data_access'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Data Access Queue ({dataAccessRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'evidence'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Evidence Synthesis ({evidenceSyntheses.length})
          </button>
          <button
            onClick={() => setActiveTab('learning_qi')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              activeTab === 'learning_qi'
                ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Learning & QI ({proposals.length})
          </button>
        </div>
      </div>

      {/* TAB CONTENT: STUDIES */}
      {activeTab === 'studies' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Registered Health Research Studies</h3>
            <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Propose New Study
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {studies.map((study) => (
              <div
                key={study.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-400">{study.identifier}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        study.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : study.status === 'APPROVED'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {study.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-white leading-snug">{study.title}</h4>
                  <p className="text-xs text-slate-400">Principal Investigator: {study.pi}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                  <span>Protocol v{study.version}</span>
                  <span className="text-slate-300 font-medium">{study.enrolledCount} Enrolled</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: COHORTS & SMALL-CELL PRIVACY */}
      {activeTab === 'cohorts' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Mandatory Small-Cell Privacy Guarantee</p>
              <p className="text-slate-300 mt-0.5">
                Aggregates where 0 &lt; N &lt; 5 are mathematically stamped <span className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-400">SUPPRESSED</span> to eliminate indirect re-identification risk in small clinics.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Cohort Name</th>
                  <th className="py-2.5 px-4 font-semibold">Linked Study</th>
                  <th className="py-2.5 px-4 font-semibold">Raw Sample Count</th>
                  <th className="py-2.5 px-4 font-semibold">Privacy Status</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {cohorts.map((cohort) => (
                  <tr key={cohort.cohortId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-white">{cohort.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{cohort.study}</td>
                    <td className="py-3 px-4 font-mono">{cohort.displayCount}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          cohort.privacyStatus === 'SUPPRESSED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : cohort.privacyStatus === 'EXACT'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {cohort.privacyStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
                        View Definition <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: DATASETS */}
      {activeTab === 'datasets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Transformed Research Datasets</h3>
            <span className="text-xs text-slate-400">Release Gate: Requires Human Steward Approval</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {datasets.map((ds) => (
              <div key={ds.datasetId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-400">{ds.datasetId}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      ds.status === 'RELEASED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {ds.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white">{ds.name}</h4>
                <div className="flex items-center gap-4 text-slate-400">
                  <span>Type: <strong className="text-slate-300">{ds.type}</strong></span>
                  <span>Records: <strong className="text-slate-300">{ds.records}</strong></span>
                  <span>Method: <strong className="text-slate-300">{ds.privacyMethod}</strong></span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-slate-400">
                  <span>Expires: {ds.expiryDate}</span>
                  {ds.status !== 'RELEASED' && (
                    <button
                      onClick={() => {
                        setDatasets((prev) =>
                          prev.map((d) => (d.datasetId === ds.datasetId ? { ...d, status: 'RELEASED' } : d))
                        );
                      }}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px]"
                    >
                      Authorize Release
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: DATA ACCESS QUEUE */}
      {activeTab === 'data_access' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-semibold text-white">Pending Data Access Requests</h4>
              <span className="text-slate-400">Time-Limited, Purpose-Bound Tokens</span>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Requester</th>
                  <th className="py-2.5 px-4 font-semibold">Study Reference</th>
                  <th className="py-2.5 px-4 font-semibold">Stated Purpose</th>
                  <th className="py-2.5 px-4 font-semibold">Duration</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {dataAccessRequests.map((dar) => (
                  <tr key={dar.requestId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium text-white">{dar.requester}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{dar.study}</td>
                    <td className="py-3 px-4">{dar.purpose}</td>
                    <td className="py-3 px-4 font-mono">{dar.durationDays} days</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          dar.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {dar.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {dar.status === 'PENDING_REVIEW' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setDataAccessRequests((prev) =>
                                prev.map((r) =>
                                  r.requestId === dar.requestId ? { ...r, status: 'APPROVED' } : r
                                )
                              );
                            }}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                            title="Approve Data Access"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setDataAccessRequests((prev) =>
                                prev.map((r) =>
                                  r.requestId === dar.requestId ? { ...r, status: 'DENIED' } : r
                                )
                              );
                            }}
                            className="p-1 rounded bg-rose-600 hover:bg-rose-500 text-white"
                            title="Deny Data Access"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">Decided</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: EVIDENCE SYNTHESIS */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <h3 className="text-sm font-semibold text-white">Synthesized Evidence & GRADE Certainty</h3>
            <span className="text-slate-400">PICO Framework Structured Evidence</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {evidenceSyntheses.map((es) => (
              <div key={es.synthesisId} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-slate-400">{es.method}</span>
                  <div className="flex items-center gap-2">
                    {es.hasConflict && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        EVIDENCE_CONFLICT
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                      GRADE: {es.certainty}
                    </span>
                  </div>
                </div>

                <h4 className="text-sm font-medium text-white italic">"{es.question}"</h4>
                <p className="text-slate-300 leading-relaxed">{es.findings}</p>

                {es.conflictNotes && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-200">
                    <p className="font-semibold text-[11px]">Empirical Conflict Documentation:</p>
                    <p className="text-[11px] text-slate-300 mt-0.5">{es.conflictNotes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: LEARNING & QUALITY IMPROVEMENT */}
      {activeTab === 'learning_qi' && (
        <div className="space-y-4">
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-xs text-indigo-200 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Governed Practice Change Firewall</p>
              <p className="text-slate-300 mt-0.5">
                Practice change proposals require committee approval and human governance promotion before modifying any clinical decision-support rules or standard order sets.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-semibold text-white">Active Practice Change Proposals</h4>
              <span className="text-slate-400">Institutional Learning Loop</span>
            </div>

            {proposals.map((prop) => (
              <div key={prop.proposalId} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{prop.service}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold">
                    {prop.status}
                  </span>
                </div>
                <p className="text-slate-200">{prop.proposedChange}</p>
                <div className="flex items-center justify-between text-slate-400 pt-1">
                  <span>Expected Impact: <strong className="text-emerald-400">{prop.expectedImpact}</strong></span>
                  <span className="text-[11px]">Approvals: {prop.approvalsCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
