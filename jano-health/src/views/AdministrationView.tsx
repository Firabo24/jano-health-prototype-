/**
 * Jano Health - Administration & RBAC Configuration View
 * Multi-facility boundaries, role-based access control matrix, and clinical staff registry.
 */

import React, { useState } from 'react';
import {
  Building2,
  Check,
  Globe,
  Layers,
  Lock,
  Network,
  Plus,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../services/security/authContext';
import { ROLE_DEFINITIONS } from '../domain/permissions';
import { RoleType } from '../domain/types';
import { FHIRGatewayAdminPanel } from '../components/admin/FHIRGatewayAdminPanel';
import { JanoNetworkAdminPanel } from '../components/admin/JanoNetworkAdminPanel';
import { V15GovernanceAdminPanel } from '../components/admin/V15GovernanceAdminPanel';
import { WorkforceAdminPanel } from '../components/admin/WorkforceAdminPanel';
import { SupplyChainLogisticsPanel } from '../components/admin/SupplyChainLogisticsPanel';
import { ResearchGovernanceAdminPanel } from '../components/admin/ResearchGovernanceAdminPanel';
import { NationalEcosystemAdminPanel } from '../components/admin/NationalEcosystemAdminPanel';
import { SystemIntelligenceAdminPanel } from '../components/admin/SystemIntelligenceAdminPanel';
import { ProductionOperationsCenter } from '../components/admin/ProductionOperationsCenter';
import { ClinicalSafetyValidationPanel } from '../components/admin/ClinicalSafetyValidationPanel';
import { ControlledPilotOperationsPanel } from '../components/admin/ControlledPilotOperationsPanel';
import { MultiSiteEvidenceScalePanel } from '../components/admin/MultiSiteEvidenceScalePanel';
import { V25ProductionOperationsCenter } from '../components/admin/V25ProductionOperationsCenter';
import { PostCoreQualityRegulatoryPanel } from '../components/admin/PostCoreQualityRegulatoryPanel';
import { PostCoreTrack2AssurancePanel } from '../components/admin/PostCoreTrack2AssurancePanel';
import { PostCoreTrack3DeploymentReadinessPanel } from '../components/admin/PostCoreTrack3DeploymentReadinessPanel';
import { PostCoreTrack4MobilizationPanel } from '../components/admin/PostCoreTrack4MobilizationPanel';
import { Truck, FlaskConical, Globe2, Cpu, ShieldCheck, Stethoscope, Rocket, Scale, Award, CheckSquare, FileCheck2, Compass, Zap } from 'lucide-react';

export const AdministrationView: React.FC = () => {
  const { availableFacilities, availableUsers, currentUser } = useAuth();
  const [adminTab, setAdminTab] = useState<'rbac' | 'fhir_gateway' | 'jano_network' | 'v15_governance' | 'v16_workforce' | 'v17_supply' | 'v18_research' | 'v19_ecosystem' | 'v20_intelligence' | 'v21_operations' | 'v22_safety' | 'v23_pilot' | 'v24_scale' | 'v25_operations' | 'postcore_quality_regulatory' | 'postcore_track2_assurance' | 'postcore_track3_readiness' | 'postcore_track4_mobilization'>('postcore_track4_mobilization');

  const allRoles = Object.keys(ROLE_DEFINITIONS) as RoleType[];

  const keyPermissions = [
    { key: 'patients:register', label: 'Register Patients' },
    { key: 'clinical:notes_write', label: 'Write SOAP Notes' },
    { key: 'clinical:diagnose', label: 'Formulate Diagnoses' },
    { key: 'clinical:prescribe', label: 'Prescribe Medications' },
    { key: 'pharmacy:dispense', label: 'Dispense Prescriptions' },
    { key: 'lab:enter_results', label: 'Verify Lab Results' },
    { key: 'radiology:report', label: 'Report Imaging Studies' },
    { key: 'emergency:triage', label: 'Acute Triage' },
    { key: 'referrals:create', label: 'Issue Referrals' },
    { key: 'admin:manage_facility', label: 'Manage Facility' },
    { key: 'audit:view', label: 'Inspect Audit Logs' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Facility & Security Administration</h1>
          <p className="text-xs text-slate-400">
            Decentralized facility boundaries, staff directory, role-based access control (RBAC), and external FHIR gateways
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setAdminTab('rbac')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'rbac'
                ? 'bg-slate-800 text-teal-300 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Internal Facilities & RBAC
          </button>
          <button
            onClick={() => setAdminTab('fhir_gateway')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'fhir_gateway'
                ? 'bg-slate-800 text-teal-300 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            FHIR Gateway & External Systems
          </button>
          <button
            onClick={() => setAdminTab('jano_network')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'jano_network'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            Jano Health Network (V13)
          </button>
          <button
            onClick={() => setAdminTab('v15_governance')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v15_governance'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Identity, Consent & Financing (V15)
          </button>
          <button
            onClick={() => setAdminTab('v16_workforce')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v16_workforce'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Workforce & Operations (V16)
          </button>
          <button
            onClick={() => setAdminTab('v17_supply')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v17_supply'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Supply Chain & Logistics (V17)
          </button>
          <button
            onClick={() => setAdminTab('v18_research')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v18_research'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Research, Evidence & Learning (V18)
          </button>
          <button
            onClick={() => setAdminTab('v19_ecosystem')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v19_ecosystem'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            National Ecosystem (V19)
          </button>
          <button
            onClick={() => setAdminTab('v20_intelligence')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v20_intelligence'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            System Intelligence (V20)
          </button>
          <button
            onClick={() => setAdminTab('v21_operations')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v21_operations'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Operations Center (V21)
          </button>
          <button
            onClick={() => setAdminTab('v22_safety')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v22_safety'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            Safety & Validation (V22)
          </button>
          <button
            onClick={() => setAdminTab('v23_pilot')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v23_pilot'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Rocket className="w-3.5 h-3.5" />
            Controlled Pilot (V23)
          </button>
          <button
            onClick={() => setAdminTab('v24_scale')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v24_scale'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Multi-Site Scale (V24)
          </button>
          <button
            onClick={() => setAdminTab('v25_operations')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'v25_operations'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Operations & Scale (V25)
          </button>
          <button
            onClick={() => setAdminTab('postcore_quality_regulatory')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'postcore_quality_regulatory'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-emerald-400 hover:text-white'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Track 1: Real-Site & QMS
          </button>
          <button
            onClick={() => setAdminTab('postcore_track2_assurance')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'postcore_track2_assurance'
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-amber-400 hover:text-white'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            Track 2: Assurance
          </button>
          <button
            onClick={() => setAdminTab('postcore_track3_readiness')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'postcore_track3_readiness'
                ? 'bg-emerald-400 text-slate-950 font-bold shadow-sm'
                : 'text-emerald-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Track 3: Go-Live Plan
          </button>
          <button
            onClick={() => setAdminTab('postcore_track4_mobilization')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              adminTab === 'postcore_track4_mobilization'
                ? 'bg-cyan-400 text-slate-950 font-bold shadow-sm'
                : 'text-cyan-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Track 4: Mobilization
          </button>
        </div>
      </div>

      {adminTab === 'postcore_track4_mobilization' ? (
        <PostCoreTrack4MobilizationPanel />
      ) : adminTab === 'postcore_track3_readiness' ? (
        <PostCoreTrack3DeploymentReadinessPanel />
      ) : adminTab === 'postcore_track2_assurance' ? (
        <PostCoreTrack2AssurancePanel />
      ) : adminTab === 'postcore_quality_regulatory' ? (
        <PostCoreQualityRegulatoryPanel />
      ) : adminTab === 'v25_operations' ? (
        <V25ProductionOperationsCenter />
      ) : adminTab === 'v24_scale' ? (
        <MultiSiteEvidenceScalePanel />
      ) : adminTab === 'v23_pilot' ? (
        <ControlledPilotOperationsPanel />
      ) : adminTab === 'v22_safety' ? (
        <ClinicalSafetyValidationPanel />
      ) : adminTab === 'v21_operations' ? (
        <ProductionOperationsCenter />
      ) : adminTab === 'v20_intelligence' ? (
        <SystemIntelligenceAdminPanel />
      ) : adminTab === 'v19_ecosystem' ? (
        <NationalEcosystemAdminPanel />
      ) : adminTab === 'v18_research' ? (
        <ResearchGovernanceAdminPanel />
      ) : adminTab === 'v17_supply' ? (
        <SupplyChainLogisticsPanel />
      ) : adminTab === 'v16_workforce' ? (
        <WorkforceAdminPanel />
      ) : adminTab === 'v15_governance' ? (
        <V15GovernanceAdminPanel />
      ) : adminTab === 'jano_network' ? (
        <JanoNetworkAdminPanel />
      ) : adminTab === 'fhir_gateway' ? (
        <FHIRGatewayAdminPanel />
      ) : (
        <>
          {/* Facilities Registry */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-400" />
              Health Facility Network Nodes
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {availableFacilities.map((fac) => (
                <div key={fac.id} className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{fac.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-teal-300">
                      {fac.code}
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    {fac.region} • {fac.district}
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 uppercase">
                    Type: {fac.type.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Staff User Registry */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Clinical Staff & Practitioner Directory
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-3">Full Name</th>
                    <th className="py-2 px-3">Username / ID</th>
                    <th className="py-2 px-3">Role Designation</th>
                    <th className="py-2 px-3">Assigned Facility</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {availableUsers.map((u) => {
                    const fac = availableFacilities.find((f) => f.id === u.facilityId);
                    return (
                      <tr key={u.id} className="hover:bg-slate-850/40 font-sans">
                        <td className="py-2 px-3 font-semibold text-white">{u.fullName}</td>
                        <td className="py-2 px-3 font-mono text-slate-400">{u.email}</td>
                        <td className="py-2 px-3 font-mono text-teal-300">
                          {ROLE_DEFINITIONS[u.role]?.title}
                        </td>
                        <td className="py-2 px-3 text-slate-400">{fac?.name || u.facilityId}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] font-mono uppercase">
                            Active
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RBAC Permission Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-teal-400" />
              Decoupled Role & Permission Security Matrix
            </h3>

            <p className="text-slate-400 text-[11px]">
              Permissions are evaluated granularly for every transaction to uphold least-privilege principles.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[10px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-2">Permission</th>
                    {allRoles.map((role) => (
                      <th key={role} className="py-2 px-1 text-center font-normal">
                        {ROLE_DEFINITIONS[role].title.split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {keyPermissions.map((perm) => (
                    <tr key={perm.key} className="hover:bg-slate-850/40">
                      <td className="py-2 px-2 font-sans font-medium text-slate-200">{perm.label}</td>
                      {allRoles.map((role) => {
                        const hasPerm = ROLE_DEFINITIONS[role].permissions.includes(perm.key as any);
                        return (
                          <td key={role} className="py-2 px-1 text-center">
                            {hasPerm ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
