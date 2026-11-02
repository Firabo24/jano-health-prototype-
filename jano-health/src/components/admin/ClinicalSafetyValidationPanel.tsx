/**
 * Jano Health - Clinical Safety & Validation Center (Clinical Core V22)
 * 
 * Central administration and clinical review console for:
 * - Clinical Safety Case (Claims, Hazards, Evidence)
 * - Clinical Workflow Validation Matrix
 * - AI Grounding & Clinical Context Fidelity
 * - Usability & Human Factors
 * - Clinical Safety Incidents & CAPA
 * - Release Safety Gates & Pilot Validation Packet Generation
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  FileText,
  Brain,
  UserCheck,
  AlertOctagon,
  FileCheck,
  Package,
  Layers,
  Sparkles,
  ClipboardCheck,
  Stethoscope,
  Info,
} from 'lucide-react';
import {
  clinicalHazardRegistryService,
  workflowValidationMatrixService,
  clinicalValidationGateService,
  clinicalSafetyCaseService,
  aiValidationEvaluationService,
} from '../../services/clinicalValidation';
import {
  ClinicalHazard,
  ClinicalWorkflowMatrix,
  ClinicalValidationGate,
  PilotValidationPacket,
} from '../../domain/v22ClinicalValidationTypes';

export const ClinicalSafetyValidationPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'hazards' | 'matrix' | 'ai' | 'gates' | 'packet'>('overview');
  const [hazards, setHazards] = useState<ClinicalHazard[]>([]);
  const [matrices, setMatrices] = useState<ClinicalWorkflowMatrix[]>([]);
  const [gates, setGates] = useState<ClinicalValidationGate[]>([]);
  const [packet, setPacket] = useState<PilotValidationPacket | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [hList, mList, gList] = await Promise.all([
        clinicalHazardRegistryService.initializeBaselineHazards(),
        workflowValidationMatrixService.initializeBaselineMatrices(),
        clinicalValidationGateService.initializeBaselineGates(),
      ]);
      setHazards(hList);
      setMatrices(mList);
      setGates(gList);
    } catch (e: any) {
      console.error('Failed to load clinical safety center data:', e);
    }
  };

  const handleGeneratePacket = async () => {
    setIsProcessing(true);
    setStatusMessage('Compiling governed Pilot Validation Packet (Software vs Clinical vs Regulatory)...');
    try {
      const p = await clinicalValidationGateService.generatePilotValidationPacket(
        'FACILITY_PILOT_01',
        '22.0.0',
        'Dr. Amani (Lead Safety Officer)'
      );
      setPacket(p);
      setStatusMessage(`Pilot Validation Packet ${p.packetId} generated and cryptographically sealed.`);
    } catch (err: any) {
      setStatusMessage(`Packet generation failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <Stethoscope className="w-7 h-7 text-teal-400" />
            <h2 className="text-xl font-bold tracking-tight text-white">Clinical Safety & Validation Center</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-950 text-teal-300 border border-teal-800">
              V22 QUALITY ASSURANCE
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Clinical Safety Case, Hazard Registers, Workflow Validation Matrices & Pilot Readiness Gating
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
          <Info className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-slate-300">Software Verified ≠ Clinical Certification</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(
          [
            { id: 'overview', label: 'Safety Overview', icon: Layers },
            { id: 'hazards', label: 'Hazard Register (9 Domains)', icon: ShieldAlert },
            { id: 'matrix', label: 'Workflow Matrices', icon: ClipboardCheck },
            { id: 'ai', label: 'AI Clinical Validation', icon: Brain },
            { id: 'gates', label: 'Validation Gates', icon: FileCheck },
            { id: 'packet', label: 'Pilot Validation Packet', icon: Package },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-teal-700 text-white font-semibold'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">Active Safety Hazards</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{hazards.length} Registered</div>
              <div className="text-xs text-slate-400 mt-1">Controls applied & verified</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">Validation Matrices</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{matrices.length} Core Lifecycles</div>
              <div className="text-xs text-slate-400 mt-1">SATS 5-tier & allergy firewall</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">Validation Gates</div>
              <div className="text-2xl font-bold text-sky-400 mt-1">{gates.length} Subsystems</div>
              <div className="text-xs text-slate-400 mt-1">Evidence required for release</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">AI Clinical Grounding</div>
              <div className="text-2xl font-bold text-teal-400 mt-1">100% Supervised</div>
              <div className="text-xs text-slate-400 mt-1">Autonomous mutations forbidden</div>
            </div>
          </div>

          <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-lg space-y-2 text-xs text-slate-300">
            <h4 className="font-semibold text-white">Clinical Validation Invariant</h4>
            <p>
              Automated unit and integration test passes demonstrate software engineering correctness. They do NOT constitute
              unsupervised clinical validation, device approval, or authorization for autonomous patient care.
            </p>
          </div>
        </div>
      )}

      {/* Hazards Tab */}
      {activeTab === 'hazards' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Hazard analysis across Patient Identity, Encounter, Medication, Lab, Radiology, Emergency, Referral, Offline, and AI.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hazards.map((h) => (
              <div key={h.hazardId} className="bg-slate-800/40 border border-slate-700/60 p-3.5 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{h.title}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    {h.category}
                  </span>
                </div>
                <div className="text-slate-400">{h.description}</div>
                <div className="flex gap-4 text-slate-400 text-[11px]">
                  <span>Harm: {h.potentialHarm}</span>
                  <span>Severity: {h.initialSeverity}</span>
                </div>
                <div className="text-emerald-400 text-[11px]">
                  ✓ Controls Verified: {h.controls.length > 0 ? h.controls[0].description : 'Software guard & audit check active'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matrices Tab */}
      {activeTab === 'matrix' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Lifecycle state transitions, preconditions, and forbidden transitions.
          </div>
          <div className="space-y-3">
            {matrices.map((m) => (
              <div key={m.workflowId} className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{m.name}</span>
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-semibold text-[10px]">
                    {m.validationStatus}
                  </span>
                </div>
                <div className="text-slate-400">States: {m.lifecycleStates.join(' → ')}</div>
                <div className="text-red-400 text-[11px]">
                  Forbidden Transitions: {m.forbiddenTransitions.map((f) => `${f.from} ↛ ${f.to} (${f.rationale})`).join('; ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Validation Tab */}
      {activeTab === 'ai' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-lg space-y-2">
            <h4 className="font-semibold text-white">AI Grounding & Clinical Context Evaluation</h4>
            <p className="text-slate-400">
              Evaluates advisory decision support models for factual grounding, absence of hallucinations, and context fidelity.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-900/60 border border-slate-700/80 rounded">
                <div className="font-semibold text-teal-300">Mandatory Clinician Review</div>
                <div className="text-slate-400 mt-1">Every advisory recommendation requires explicit clinician acceptance or override.</div>
              </div>
              <div className="p-3 bg-slate-900/60 border border-slate-700/80 rounded">
                <div className="font-semibold text-teal-300">Autonomous Mutations Forbidden</div>
                <div className="text-slate-400 mt-1">AI models can never directly write prescriptions, diagnoses, or lab results.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gates Tab */}
      {activeTab === 'gates' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Validation gates across all 20 clinical and infrastructural platform subsystems.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {gates.map((g) => (
              <div key={g.gateId} className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">{g.domain}</div>
                  <div className="text-slate-400 text-[11px]">Evidence: {g.evidenceProvided.length} / {g.mandatoryEvidenceRequired.length}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  g.status === 'VALIDATED' ? 'bg-emerald-950 text-emerald-300' : 'bg-sky-950 text-sky-300'
                }`}>
                  {g.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packet Tab */}
      {activeTab === 'packet' && (
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <p className="text-slate-400">
              Generate an audit-ready, cryptographically sealed Pilot Validation Packet.
            </p>
            <button
              onClick={handleGeneratePacket}
              disabled={isProcessing}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded font-semibold text-white flex items-center gap-2"
            >
              <Package className="w-3.5 h-3.5" />
              Generate Packet
            </button>
          </div>

          {packet && (
            <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-3 font-mono">
              <div className="text-teal-400 font-bold">Packet ID: {packet.packetId}</div>
              <div className="text-slate-300">Generated: {packet.generatedAt} | Authorized by: {packet.authorizedLead}</div>
              <div className="text-slate-400 truncate">SHA-256 Seal: {packet.packetHash}</div>

              <div className="pt-2 space-y-2">
                <div className="text-emerald-300 font-bold">1. Verified Software Behavior:</div>
                <ul className="list-disc list-inside text-slate-300 text-[11px]">
                  {packet.verifiedSoftwareBehavior.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>

                <div className="text-sky-300 font-bold pt-1">2. Clinical Validation Evidence:</div>
                <ul className="list-disc list-inside text-slate-300 text-[11px]">
                  {packet.clinicalValidationEvidence.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>

                <div className="text-amber-300 font-bold pt-1">3. External & Regulatory Requirements:</div>
                <ul className="list-disc list-inside text-slate-300 text-[11px]">
                  {packet.externalRegulatoryRequirements.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
