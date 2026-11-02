/**
 * Jano Health - Jano AI Clinical Decision-Support Console
 * Dedicated decision-support center with cloud Gemini & local offline heuristic execution.
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  HelpCircle,
  History,
  Send,
  Shield,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import { AIClinicalResponse, janoAI } from '../services/ai/janoAIService';
import { localDb } from '../services/storage/localDatabase';
import { auditService } from '../services/audit/auditService';
import { useAuth } from '../services/security/authContext';
import { Patient } from '../domain/types';

interface AIAssistantViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility } = useAuth();
  const patients = localDb.getPatients();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id || '');
  const [taskType, setTaskType] = useState<
    'chart_summary' | 'differential' | 'risk_flags' | 'documentation' | 'patient_education' | 'clinical_qa'
  >('differential');
  const [clinicalQuery, setClinicalQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIClinicalResponse | null>(null);
  const [disposition, setDisposition] = useState<'accepted' | 'modified' | 'rejected' | null>(null);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const handleRunAI = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setDisposition(null);

    const vitals = selectedPatient ? localDb.getVitals(selectedPatient.id)[0] : undefined;
    const meds = selectedPatient ? localDb.getMedications(selectedPatient.id).map((m) => m.name) : [];
    const diagnoses = selectedPatient ? localDb.getDiagnoses(selectedPatient.id).map((d) => d.description) : [];

    try {
      const res = await janoAI.requestDecisionSupport(
        taskType,
        selectedPatient,
        clinicalQuery || 'Formulate structured clinical differential and triage considerations.',
        { vitals, meds, diagnoses }
      );
      setResponse(res);
    } catch (err) {
      console.error('Failed to run Jano AI', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordDisposition = (action: 'accepted' | 'modified' | 'rejected') => {
    setDisposition(action);
    if (response) {
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'AI_DECISION_SUPPORT_REVIEWED',
        'AIRequest',
        response.requestId,
        {
          action,
          taskType: response.taskType,
          clinicianNotes: `Reviewed and marked as ${action} by ${currentUser.fullName}`,
        }
      );
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Jano AI Decision-Support Console</h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 font-bold">
              CDS v1.0
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Augmenting bedside clinical judgment with evidence-grounded differential support and danger sign alerts
          </p>
        </div>
      </div>

      {/* Mandatory Safety Notice */}
      <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/80 text-amber-200 flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <h4 className="font-bold uppercase tracking-wider text-amber-300">
            Clinical Decision Support (CDS) Operational Boundary
          </h4>
          <p className="leading-relaxed text-amber-200/90">
            Jano AI is designed solely as decision support for qualified healthcare practitioners. Jano AI cannot
            autonomously diagnose, prescribe medications, or replace medical examination. The licensed clinician
            assumes full clinical responsibility for verifying and applying recommendations.
          </p>
        </div>
      </div>

      {/* Query Formulation Form */}
      <form onSubmit={handleRunAI} className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          Clinical Inquiry & Context Grounding
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Attach Patient Clinical Context (Optional)</label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option value="">-- No Specific Patient Context --</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} (MRN: {p.mrn}) • Triage: {p.triageUrgency}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Decision Support Mode</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as typeof taskType)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option value="differential">Differential Considerations (Acute febrile, respiratory, pediatric)</option>
              <option value="risk_flags">Clinical Risk & Allergy Flagging</option>
              <option value="chart_summary">Patient Chart Briefing & Synthesis</option>
              <option value="documentation">SOAP Clinical Documentation Assistant</option>
              <option value="patient_education">Patient & Caregiver Counseling (Plain Language)</option>
              <option value="clinical_qa">Clinical Practice & Standard Treatment Guidelines Query</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">
            Clinical Question, Presenting Symptoms, or Case Details
          </label>
          <textarea
            rows={3}
            placeholder="e.g. 8-year-old child presenting with fever of 39.2°C, lethargy, respiratory rate 38, positive mRDT for P. falciparum, hemoglobin 6.8 g/dL. What are the key danger signs and WHO severe malaria triage priorities?"
            value={clinicalQuery}
            onChange={(e) => setClinicalQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-slate-100 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-400 font-mono">
            Grounding Engine: Dual-Tier (Gemini 3.8 Flash + District Offline Clinical Heuristics)
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <Activity className="w-4 h-4 animate-spin" /> Analyzing Clinical Case...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Generate Decision Support
              </>
            )}
          </button>
        </div>
      </form>

      {/* AI Response Card */}
      {response && (
        <div className="bg-slate-900 border border-teal-800 rounded-lg p-6 space-y-4 shadow-xl text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-bold text-white">Clinical Decision-Support Guidance</h2>
              {response.source === 'cloud_gemini' ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Cloud Gemini Generative AI ({response.model})
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700 font-semibold flex items-center gap-1">
                  <Shield className="w-3 h-3 text-purple-400" />
                  Deterministic Clinical Rule Engine (Offline Protocols)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                response.source === 'cloud_gemini'
                  ? 'bg-slate-800 text-teal-300 border border-slate-700'
                  : 'bg-slate-800 text-amber-300 border border-slate-700'
              }`}>
                Provenance: {response.source === 'cloud_gemini' ? 'Online Cloud Model' : 'Local Deterministic Rules'}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                Req #{response.requestId.slice(-6)}
              </span>
            </div>
          </div>

          {/* Formatted Content */}
          <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed whitespace-pre-wrap">
            {response.content}
          </div>

          {/* Structured Points */}
          {response.structuredPoints && response.structuredPoints.length > 0 && (
            <div className="p-4 bg-slate-950/80 rounded-md border border-slate-800 space-y-2">
              <div className="font-semibold text-teal-300">
                Prioritized Action Items & Danger Signs to Monitor:
              </div>
              <ul className="space-y-1.5">
                {response.structuredPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300">
                    <span className="text-teal-400 font-bold">•</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Safety Warnings */}
          <div className="p-3 rounded bg-slate-950 border border-amber-900/60 text-[11px] text-amber-300/90 space-y-1 font-mono">
            {response.safetyWarnings.map((w, i) => (
              <div key={i}>⚠️ {w}</div>
            ))}
          </div>

          {/* Clinician Review & Disposition Controls */}
          <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Attending Clinician Disposition:</span>
              {disposition ? (
                <span
                  className={`px-2.5 py-0.5 rounded font-mono font-bold uppercase ${
                    disposition === 'accepted'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : disposition === 'modified'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {disposition} by {currentUser.fullName}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                  Pending Verification
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRecordDisposition('accepted')}
                className="px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium flex items-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Accept Suggestion
              </button>
              <button
                onClick={() => handleRecordDisposition('modified')}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium"
              >
                Modify Recommendation
              </button>
              <button
                onClick={() => handleRecordDisposition('rejected')}
                className="px-3 py-1.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-medium"
              >
                Dismiss / Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
