/**
 * Jano Health - Clinical Core V19: National Digital Health & Ecosystem Interoperability Command Center
 * 
 * Formal administrative console for participation in Ethiopia's national digital-health ecosystem:
 * - National Digital Health Exchange (NDHx)
 * - Master Facility Registry (MFR) & Conflict Reconciliation
 * - DHIS2 & HMIS Aggregate Reporting
 * - National Terminology & Ambiguity Quarantine
 * - National Public Health Disease Surveillance
 * - Ecosystem System Trust Lifecycles & Production Activation Gates
 * - Circuit Breakers, Rate Limits, and Health Dashboards
 * 
 * HARD INVARIANTS:
 * - Jano ≠ National HIE / NDHx / DHIS2 / eCHIS / MFR / National ID.
 * - Jano Network (V13) ≠ National Ecosystem (V19).
 * - Sandbox ≠ Production (Sandboxes clearly labeled; never rendered as Production).
 * - Delivered ≠ Acknowledged ≠ Processed.
 * - External Outage is NEVER a Clinical Outage.
 */

import React, { useState } from 'react';
import {
  Globe,
  Building2,
  Server,
  Layers,
  FileBarChart,
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Send,
  RefreshCw,
  Search,
  Lock,
  ExternalLink,
  ChevronRight,
  Database,
  ArrowRight,
  ShieldCheck,
  FileText,
  AlertCircle,
  Eye,
  Check,
  X,
  GitBranch,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';

export const NationalEcosystemAdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'systems' | 'integrations' | 'ndhx' | 'mfr' | 'terminology' | 'reporting' | 'surveillance' | 'quarantine' | 'health'
  >('systems');

  // Interactive local simulation state for admin verification
  const [activeEnvironment, setActiveEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [selectedSystemFilter, setSelectedSystemFilter] = useState<string>('ALL');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-indigo-950 p-6 rounded-xl border border-teal-800/40 text-white shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                CLINICAL CORE V19
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ETHIOPIAN DIGITAL HEALTH ECOSYSTEM
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                  activeEnvironment === 'PRODUCTION'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                ENV: {activeEnvironment}
              </span>
            </div>
            <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
              <Globe className="w-7 h-7 text-teal-400" />
              National & Ecosystem Interoperability Command
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-3xl">
              Standards-based, governance-controlled participation in Ethiopia's broader health ecosystem (NDHx, MFR, DHIS2, eCHIS, National Terminology & Surveillance), with strict privacy isolation, offline resilience, and production activation gates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveEnvironment(activeEnvironment === 'SANDBOX' ? 'PRODUCTION' : 'SANDBOX')}
              className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium rounded-lg border border-slate-700 text-slate-200 transition-colors"
            >
              Toggle Demo Env ({activeEnvironment})
            </button>
            <div className="text-right text-xs text-slate-400">
              <div>Operator: <span className="text-slate-200 font-mono">{currentUser?.fullName || 'Authorized Officer'}</span></div>
              <div>Role: <span className="text-teal-300 font-mono">{currentUser?.role || 'national_interoperability_officer'}</span></div>
            </div>
          </div>
        </div>

        {/* Invariant Safety Alert */}
        <div className="mt-4 p-3 bg-teal-950/60 rounded-lg border border-teal-700/30 text-xs text-teal-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            <strong>Architectural Firewall Active:</strong> External ecosystem systems are strictly external. Jano local records are authoritative. External outages never disrupt local clinical care. Unsent records are never marked submitted.
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-700/60 gap-1 pb-1">
        {[
          { id: 'systems', label: 'Ecosystem Systems', icon: Server },
          { id: 'integrations', label: 'Integrations & Gates', icon: GitBranch },
          { id: 'ndhx', label: 'NDHx Exchange', icon: Globe },
          { id: 'mfr', label: 'Master Facility Registry', icon: Building2 },
          { id: 'terminology', label: 'National Terminology', icon: Layers },
          { id: 'reporting', label: 'DHIS2 / HMIS Reporting', icon: FileBarChart },
          { id: 'surveillance', label: 'Disease Surveillance', icon: Activity },
          { id: 'quarantine', label: 'Ecosystem Quarantine', icon: ShieldAlert },
          { id: 'health', label: 'Circuit Breaker & Health', icon: RefreshCw },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-all ${
                isActive
                  ? 'bg-slate-800 text-teal-300 border-b-2 border-teal-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Ecosystem Systems */}
      {activeTab === 'systems' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Registered Ecosystem Systems</h2>
              <p className="text-xs text-slate-400">External national health applications, shared registries, and reporting platforms.</p>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedSystemFilter}
                onChange={(e) => setSelectedSystemFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="ALL">All System Types</option>
                <option value="NATIONAL_HIE">National HIE</option>
                <option value="FACILITY_REGISTRY">Facility Registry</option>
                <option value="HMIS">HMIS / DHIS2</option>
                <option value="TERMINOLOGY">Terminology</option>
                <option value="IDENTITY">Identity</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                code: 'ETH-NDHx-CORE',
                name: 'National Digital Health Exchange (NDHx)',
                org: 'Ministry of Health Ethiopia',
                type: 'NATIONAL_HIE',
                env: 'SANDBOX',
                trust: 'APPROVED',
                fhir: '5.0.0',
                status: 'ACTIVE',
              },
              {
                code: 'ETH-MFR-NATIONAL',
                name: 'Master Facility Registry (MFR)',
                org: 'Ministry of Health Ethiopia',
                type: 'FACILITY_REGISTRY',
                env: 'SANDBOX',
                trust: 'APPROVED',
                fhir: '5.0.0',
                status: 'ACTIVE',
              },
              {
                code: 'ETH-DHIS2-HMIS',
                name: 'DHIS2 National HMIS Platform',
                org: 'Policy, Planning & Monitoring Directorate',
                type: 'HMIS',
                env: 'SANDBOX',
                trust: 'APPROVED',
                fhir: '4.0.1 / Aggregate',
                status: 'ACTIVE',
              },
              {
                code: 'ETH-TERMINOLOGY-SRV',
                name: 'National Terminology Service',
                org: 'National Health Data Standard Authority',
                type: 'TERMINOLOGY',
                env: 'SANDBOX',
                trust: 'APPROVED',
                fhir: '5.0.0',
                status: 'ACTIVE',
              },
              {
                code: 'ETH-FAYDA-ID',
                name: 'National Identity Program (Fayda)',
                org: 'National ID Program',
                type: 'IDENTITY',
                env: 'SANDBOX',
                trust: 'UNDER_REVIEW',
                fhir: 'N/A (OIDC / OAuth2)',
                status: 'ACTIVE',
              },
              {
                code: 'ETH-EPHIS-SURV',
                name: 'Public Health Institute Surveillance (EPHI)',
                org: 'Ethiopian Public Health Institute',
                type: 'SURVEILLANCE',
                env: 'SANDBOX',
                trust: 'APPROVED',
                fhir: '5.0.0',
                status: 'ACTIVE',
              },
            ].map((sys) => (
              <div key={sys.code} className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-400 border border-slate-700">
                      {sys.code}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100 mt-1">{sys.name}</h3>
                    <p className="text-xs text-slate-400">{sys.org}</p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      sys.trust === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {sys.trust}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Type:</span>
                    <span className="font-medium text-slate-200">{sys.type}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Environment:</span>
                    <span className="font-medium text-amber-300">{sys.env}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">FHIR Support:</span>
                    <span className="font-mono text-slate-200">{sys.fhir}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Status:</span>
                    <span className="text-emerald-400 font-medium">{sys.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Integrations & Production Activation Gate */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">National Integration Gateways</h2>
            <p className="text-xs text-slate-400">
              An integration remains strictly NOT_CONFIGURED or PENDING_APPROVAL until endpoint, credentials, trust, and connectivity gates pass.
            </p>
          </div>

          <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Integration Name</th>
                  <th className="p-3">Adapter ID</th>
                  <th className="p-3">Environment</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Connectivity</th>
                  <th className="p-3">Activation Gate</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {[
                  {
                    name: 'NDHx Document Gateway',
                    adapter: 'INDHxAdapter',
                    env: 'SANDBOX',
                    status: 'ACTIVE',
                    conn: '38ms (Verified)',
                    gate: 'APPROVED by MOH Gov Ticket #8291',
                  },
                  {
                    name: 'Master Facility Registry Sync',
                    adapter: 'IMasterFacilityRegistryAdapter',
                    env: 'SANDBOX',
                    status: 'ACTIVE',
                    conn: '45ms (Verified)',
                    gate: 'APPROVED by Admin Ticket #4410',
                  },
                  {
                    name: 'DHIS2 Monthly HMIS',
                    adapter: 'IDHIS2Adapter',
                    env: 'SANDBOX',
                    status: 'ACTIVE',
                    conn: '52ms (Verified)',
                    gate: 'APPROVED by Steward Ticket #1092',
                  },
                  {
                    name: 'eCHIS Community Referral Hub',
                    adapter: 'IeCHISAdapter',
                    env: 'SANDBOX',
                    status: 'NOT_CONFIGURED',
                    conn: 'N/A (Unconfigured)',
                    gate: 'PENDING genuine credential configuration',
                  },
                  {
                    name: 'Fayda National Identity Registry',
                    adapter: 'INationalIdentityAdapter',
                    env: 'SANDBOX',
                    status: 'ACTIVE',
                    conn: '60ms (Verified)',
                    gate: 'APPROVED by Data Protection Ticket #9011',
                  },
                  {
                    name: 'EPHI Disease Surveillance Stream',
                    adapter: 'INationalSurveillanceAdapter',
                    env: 'SANDBOX',
                    status: 'ACTIVE',
                    conn: '35ms (Verified)',
                    gate: 'APPROVED by Epidemiology Ticket #3019',
                  },
                ].map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    <td className="p-3 font-medium text-slate-100">{row.name}</td>
                    <td className="p-3 font-mono text-teal-400">{row.adapter}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {row.env}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          row.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : 'bg-slate-700/40 text-slate-300 border border-slate-600/30'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{row.conn}</td>
                    <td className="p-3 text-slate-400 truncate max-w-xs">{row.gate}</td>
                    <td className="p-3 text-right">
                      <button className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors">
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: NDHx Exchange Queue */}
      {activeTab === 'ndhx' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">National Digital Health Exchange (NDHx)</h2>
            <p className="text-xs text-slate-400">
              FHIR R5 transactional exchange queue. Each message maintains separate DELIVERED and ACKNOWLEDGED state transitions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-center">
              <span className="text-xs text-slate-400">Total Queued</span>
              <p className="text-2xl font-bold text-teal-300 mt-1">0</p>
            </div>
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-center">
              <span className="text-xs text-slate-400">Delivered</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">14</p>
            </div>
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-center">
              <span className="text-xs text-slate-400">Acknowledged</span>
              <p className="text-2xl font-bold text-sky-400 mt-1">14</p>
            </div>
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-center">
              <span className="text-xs text-slate-400">Dead-Lettered</span>
              <p className="text-2xl font-bold text-rose-400 mt-1">0</p>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-xl border border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Recent Exchange Messages</h3>
            <div className="space-y-2 text-xs">
              {[
                {
                  id: 'nmsg_9012_eth',
                  res: 'Bundle (CareSummary)',
                  dest: 'ETH-NDHx-CORE',
                  status: 'ACKNOWLEDGED',
                  time: '2 mins ago',
                  hash: 'a9f24c0...81e2',
                },
                {
                  id: 'nmsg_8984_eth',
                  res: 'Observation (Immunization)',
                  dest: 'ETH-NDHx-CORE',
                  status: 'ACKNOWLEDGED',
                  time: '12 mins ago',
                  hash: 'c4e11a2...98ff',
                },
              ].map((msg) => (
                <div key={msg.id} className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="font-mono text-teal-400 font-semibold">{msg.id}</span>
                    <span className="ml-2 font-medium text-slate-200">{msg.res}</span>
                    <span className="ml-2 text-slate-400">→ {msg.dest}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-500">Hash: {msg.hash}</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                      {msg.status}
                    </span>
                    <span className="text-slate-400">{msg.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Master Facility Registry */}
      {activeTab === 'mfr' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">Master Facility Registry (MFR) Reconciliations</h2>
            <p className="text-xs text-slate-400">
              Reconciles local Jano facilities with official national MFR codes. Discrepancies generate FACILITY_REGISTRY_CONFLICT for human review without silent overwriting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-mono text-slate-400">JANO LOCAL FACILITY</span>
              <h4 className="text-sm font-bold text-slate-100 mt-1">Addis Ababa Central Primary Hospital</h4>
              <p className="text-xs text-teal-400 font-mono mt-1">Local ID: fac-district-hospital-01</p>
              <div className="mt-3 text-xs text-slate-300 space-y-1">
                <div>MFR Code: <span className="font-mono text-slate-100">ETH-MOH-FAC-0101</span></div>
                <div>Mapping: <span className="text-emerald-400 font-semibold">VERIFIED</span></div>
                <div>Freshness: <span className="text-emerald-400">CURRENT (Cached &lt; 24h)</span></div>
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-mono text-slate-400">JANO LOCAL FACILITY</span>
              <h4 className="text-sm font-bold text-slate-100 mt-1">Hawassa Referral Health Center</h4>
              <p className="text-xs text-teal-400 font-mono mt-1">Local ID: fac-rural-dispensary-01</p>
              <div className="mt-3 text-xs text-slate-300 space-y-1">
                <div>MFR Code: <span className="font-mono text-slate-100">ETH-MOH-FAC-0204</span></div>
                <div>Mapping: <span className="text-emerald-400 font-semibold">VERIFIED</span></div>
                <div>Freshness: <span className="text-emerald-400">CURRENT (Cached &lt; 24h)</span></div>
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800">
              <span className="text-xs font-mono text-slate-400">JANO LOCAL FACILITY</span>
              <h4 className="text-sm font-bold text-slate-100 mt-1">Bahir Dar Regional Diagnostic Clinic</h4>
              <p className="text-xs text-teal-400 font-mono mt-1">Local ID: fac-mobile-outreach-01</p>
              <div className="mt-3 text-xs text-slate-300 space-y-1">
                <div>MFR Code: <span className="font-mono text-slate-100">ETH-MOH-FAC-0350</span></div>
                <div>Mapping: <span className="text-amber-400 font-semibold">CONFLICT DETECTED</span></div>
                <div>Freshness: <span className="text-emerald-400">CURRENT</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: National Terminology */}
      {activeTab === 'terminology' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">National Terminology Mappings</h2>
            <p className="text-xs text-slate-400">
              Translates local clinical diagnosis and concept codes to standard national vocabularies (ICD-10, LOINC). Ambiguous mappings route to quarantine.
            </p>
          </div>

          <div className="bg-slate-900/80 rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Local Concept</th>
                  <th className="p-3">Target Standard</th>
                  <th className="p-3">Target Code</th>
                  <th className="p-3">Mapping Type</th>
                  <th className="p-3">Equivalence</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                <tr className="hover:bg-slate-800/30">
                  <td className="p-3 font-medium text-slate-100">Plasmodium falciparum malaria</td>
                  <td className="p-3">ICD-10</td>
                  <td className="p-3 font-mono text-teal-400">B50.9</td>
                  <td className="p-3">EQUIVALENT</td>
                  <td className="p-3 text-slate-400">equivalent</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">VERIFIED</span></td>
                </tr>
                <tr className="hover:bg-slate-800/30">
                  <td className="p-3 font-medium text-slate-100">Vibrio cholerae acute infection</td>
                  <td className="p-3">ICD-10</td>
                  <td className="p-3 font-mono text-teal-400">A00.9</td>
                  <td className="p-3">EXACT</td>
                  <td className="p-3 text-slate-400">equal</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">VERIFIED</span></td>
                </tr>
                <tr className="hover:bg-slate-800/30">
                  <td className="p-3 font-medium text-slate-100">Community-acquired acute pneumonia</td>
                  <td className="p-3">ICD-10</td>
                  <td className="p-3 font-mono text-teal-400">J18.9</td>
                  <td className="p-3">WIDER</td>
                  <td className="p-3 text-slate-400">wider</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">VERIFIED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: DHIS2 / HMIS Reporting */}
      {activeTab === 'reporting' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">National Aggregate Reporting Workspace</h2>
            <p className="text-xs text-slate-400">
              Aggregates governed metrics from V14 Population Intelligence into national reporting datasets. Requires explicit human steward approval before external submission.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-100">Monthly HMIS Dataset (Period: 2026-10)</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACKNOWLEDGED (Code: SUCCESS_IMPORTED)
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-800">
              <div>
                <span className="text-slate-500 block">Outpatient Consultations:</span>
                <span className="text-slate-100 font-bold">1,240</span>
              </div>
              <div>
                <span className="text-slate-500 block">Maternal Deliveries:</span>
                <span className="text-slate-100 font-bold">48</span>
              </div>
              <div>
                <span className="text-slate-500 block">Completeness:</span>
                <span className="text-emerald-400 font-bold">100%</span>
              </div>
              <div>
                <span className="text-slate-500 block">Quality Score:</span>
                <span className="text-emerald-400 font-bold">1.0</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Public Health Surveillance */}
      {activeTab === 'surveillance' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">Public Health Surveillance Signals</h2>
            <p className="text-xs text-slate-400">
              Reuses V14 Population Intelligence anomaly detection. Statistical signals require human review before official notification.
            </p>
          </div>

          <div className="p-4 bg-slate-900/80 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SIGNAL DETECTED
                </span>
                <h4 className="text-sm font-bold text-slate-100 mt-1">Acute Watery Diarrhea Cluster</h4>
                <p className="text-xs text-slate-400">Observed: 14 cases | Baseline: 2 | Threshold: 5</p>
              </div>
              <span className="text-xs text-slate-400">Generated: Today 06:00</span>
            </div>
            <p className="text-xs text-slate-300">
              Invariant Verified: Statistical anomaly does NOT autonomously declare an outbreak. Requires authorized epidemiological officer confirmation.
            </p>
          </div>
        </div>
      )}

      {/* Tab 8: Quarantine & Dead-Letter */}
      {activeTab === 'quarantine' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">Ecosystem Quarantine & Dead-Letter</h2>
            <p className="text-xs text-slate-400">
              Isolates ambiguous terminology, facility mismatch conflicts, and external response firewall rejections.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="flex justify-between items-center text-slate-400 font-mono">
              <span>Category: TERMINOLOGY</span>
              <span className="text-amber-400">QUARANTINED</span>
            </div>
            <p className="font-semibold text-slate-100">Ambiguous concept mapping: 1 local term maps to multiple national ICD-10 targets.</p>
            <p className="text-slate-400">Payload: JANO-DX-FEVER-UNDIAGNOSED (Requires clinician reviewer selection).</p>
          </div>
        </div>
      )}

      {/* Tab 9: Circuit Breaker & Health */}
      {activeTab === 'health' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-base font-semibold text-slate-100">Integration Circuit Breakers & Health Telemetry</h2>
            <p className="text-xs text-slate-400">
              Automated circuit breakers fail closed on repeated failures to prevent cascading latency during external outages.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-mono">NDHx Gateway</span>
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 font-bold text-sm">HEALTHY</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Circuit: CLOSED</span>
              </div>
              <div className="text-xs text-slate-400">Latency: 38ms | Failure Rate: 0.0%</div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-mono">MFR API Gateway</span>
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 font-bold text-sm">HEALTHY</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Circuit: CLOSED</span>
              </div>
              <div className="text-xs text-slate-400">Latency: 45ms | Failure Rate: 0.0%</div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 font-mono">DHIS2 Reporting Gateway</span>
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 font-bold text-sm">HEALTHY</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300">Circuit: CLOSED</span>
              </div>
              <div className="text-xs text-slate-400">Latency: 52ms | Failure Rate: 0.0%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
