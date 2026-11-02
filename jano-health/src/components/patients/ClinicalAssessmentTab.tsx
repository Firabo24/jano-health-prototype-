/**
 * Jano Health - Clinical Core V3: Clinical Assessment, Diagnoses & Problems Workspace
 * 
 * Provides an integrated workspace for clinicians to manage:
 * 1. Longitudinal Problem Lists (Active, Resolved, Entered-in-Error)
 * 2. Formally Attested Diagnoses with Offline ICD-10 Search
 * 3. Differential Diagnostic Reasoning & Candidate Rule-Outs
 * 4. Holistic Clinical Assessment Synthesis with Cryptographic Signing & Amendments
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileCheck,
  FileEdit,
  Filter,
  HelpCircle,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  ClinicalAssessment,
  Diagnosis,
  DiagnosisCertainty,
  DiagnosisStatus,
  DiagnosisType,
  DifferentialConsideration,
  DifferentialStatus,
  Encounter,
  Patient,
  Problem,
  ProblemPriority,
} from '../../domain/types';
import { useAuth } from '../../services/security/authContext';
import { clinicalAssessmentService } from '../../services/clinical/clinicalAssessmentService';
import { clinicalTerminologyService, ClinicalTerm } from '../../services/terminology/clinicalTerminologyService';
import { localDb } from '../../services/storage/localDatabase';

interface ClinicalAssessmentTabProps {
  patient: Patient;
  encounters: Encounter[];
  onRefresh: () => void;
  onDeny: (capability: string, actionTitle: string, reason: string) => void;
}

type SubSection = 'diagnoses' | 'problems' | 'differentials' | 'assessment';

export const ClinicalAssessmentTab: React.FC<ClinicalAssessmentTabProps> = ({
  patient,
  encounters,
  onRefresh,
  onDeny,
}) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [activeSection, setActiveSection] = useState<SubSection>('diagnoses');

  // Data states
  const [problems, setProblems] = useState<Problem[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [differentials, setDifferentials] = useState<DifferentialConsideration[]>([]);
  const [assessments, setAssessments] = useState<ClinicalAssessment[]>([]);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>(
    encounters.length > 0 ? encounters[0].id : ''
  );

  // Terminology search state
  const [termQuery, setTermQuery] = useState('');
  const [termResults, setTermResults] = useState<ClinicalTerm[]>([]);
  const [showTermResults, setShowTermResults] = useState(false);

  // Form states
  const [showAddDiagnosis, setShowAddDiagnosis] = useState(false);
  const [diagnosisForm, setDiagnosisForm] = useState({
    diagnosisText: '',
    diagnosisCode: '',
    codingSystem: 'ICD-10',
    diagnosisType: 'PRIMARY' as DiagnosisType,
    certainty: 'PROVISIONAL' as DiagnosisCertainty,
    onsetContext: '',
  });

  const [showAddProblem, setShowAddProblem] = useState(false);
  const [problemForm, setProblemForm] = useState({
    description: '',
    clinicalDescription: '',
    priority: 'medium' as ProblemPriority,
    onsetDate: new Date().toISOString().split('T')[0],
  });

  const [showAddDifferential, setShowAddDifferential] = useState(false);
  const [differentialForm, setDifferentialForm] = useState({
    diagnosisText: '',
    diagnosisCode: '',
    rationale: '',
    supportingFinding: '',
    supportingFindings: [] as string[],
    contradictoryFinding: '',
    contradictoryFindings: [] as string[],
    confidenceLevel: 'moderate' as 'low' | 'moderate' | 'high',
  });

  // Action Dialog states (Resolve, Error, Amend, Correct)
  const [activeDialog, setActiveDialog] = useState<{
    type: 'resolve_problem' | 'error_problem' | 'correct_dx' | 'error_dx' | 'deprioritize_diff' | 'rule_out_diff' | 'amend_assmt';
    targetId: string;
    title: string;
    textValue: string;
    secondaryValue?: string;
  } | null>(null);

  // Assessment edit state
  const [assessmentDraft, setAssessmentDraft] = useState({
    overallClinicalImpression: '',
    clinicalReasoning: '',
    uncertaintyComments: '',
    severityPriority: 'routine' as 'routine' | 'urgent' | 'emergency',
  });
  const [isAssessmentSubmitting, setIsAssessmentSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Load data
  const loadData = async () => {
    try {
      const [probs, dxs, diffs, assmts] = await Promise.all([
        clinicalAssessmentService.getProblems(patient.id),
        clinicalAssessmentService.getDiagnoses(patient.id),
        clinicalAssessmentService.getDifferentials(selectedEncounterId, patient.id),
        localDb.getClinicalAssessments(selectedEncounterId, patient.id),
      ]);
      setProblems(probs);
      setDiagnoses(dxs);
      setDifferentials(diffs);
      setAssessments(assmts);

      if (assmts.length > 0) {
        const latest = assmts[0];
        setAssessmentDraft({
          overallClinicalImpression: latest.overallClinicalImpression || '',
          clinicalReasoning: latest.clinicalReasoning || '',
          uncertaintyComments: latest.uncertaintyComments || '',
          severityPriority: latest.severityPriority || 'routine',
        });
      } else {
        setAssessmentDraft({
          overallClinicalImpression: '',
          clinicalReasoning: '',
          uncertaintyComments: '',
          severityPriority: 'routine',
        });
      }
    } catch (e: any) {
      console.error('Error loading clinical assessment data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [patient.id, selectedEncounterId]);

  // Terminology search effect
  useEffect(() => {
    if (termQuery.trim().length >= 2) {
      const matches = clinicalTerminologyService.search(termQuery, 8);
      setTermResults(matches);
      setShowTermResults(true);
    } else {
      setTermResults([]);
      setShowTermResults(false);
    }
  }, [termQuery]);

  const selectTerm = (term: ClinicalTerm) => {
    setDiagnosisForm((prev) => ({
      ...prev,
      diagnosisText: term.display,
      diagnosisCode: term.code,
      codingSystem: term.system,
    }));
    setShowTermResults(false);
    setTermQuery('');
  };

  const getPrincipal = () => ({
    id: currentUser.id,
    fullName: currentUser.fullName,
    role: currentUser.role,
    facilityId: currentFacility.id,
  });

  // --- Handlers: Diagnoses ---
  const handleCreateDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('diagnosis.write')) {
      onDeny('diagnosis.write', 'Record Clinical Diagnosis', 'Recording formal diagnoses requires authorized clinician credentials.');
      return;
    }
    if (!diagnosisForm.diagnosisText.trim()) return;

    try {
      await clinicalAssessmentService.recordDiagnosis(
        {
          patientId: patient.id,
          encounterId: selectedEncounterId || undefined,
          facilityId: currentFacility.id,
          diagnosisText: diagnosisForm.diagnosisText,
          diagnosisCode: diagnosisForm.diagnosisCode || undefined,
          codingSystem: diagnosisForm.codingSystem,
          diagnosisType: diagnosisForm.diagnosisType,
          certainty: diagnosisForm.certainty,
          onsetContext: diagnosisForm.onsetContext || undefined,
          clinicianAttested: true,
        },
        getPrincipal()
      );
      setShowAddDiagnosis(false);
      setDiagnosisForm({
        diagnosisText: '',
        diagnosisCode: '',
        codingSystem: 'ICD-10',
        diagnosisType: 'PRIMARY',
        certainty: 'PROVISIONAL',
        onsetContext: '',
      });
      setStatusMessage({ text: 'Diagnosis successfully recorded with clinician attestation.' });
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to record diagnosis', isError: true });
    }
  };

  const handleConfirmDiagnosis = async (dxId: string) => {
    if (!can('diagnosis.confirm')) {
      onDeny('diagnosis.confirm', 'Confirm Clinical Diagnosis', 'Confirming a clinical diagnosis requires licensed physician credentials.');
      return;
    }
    try {
      await clinicalAssessmentService.confirmDiagnosis(dxId, getPrincipal());
      setStatusMessage({ text: 'Diagnosis confirmed.' });
      setTimeout(() => setStatusMessage(null), 3000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to confirm diagnosis', isError: true });
    }
  };

  // --- Handlers: Problems ---
  const handleCreateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('problem.write')) {
      onDeny('problem.write', 'Add Longitudinal Problem', 'Adding to the patient problem list requires physician or clinical supervisor authorization.');
      return;
    }
    if (!problemForm.description.trim()) return;

    try {
      await clinicalAssessmentService.createProblem(
        {
          patientId: patient.id,
          facilityId: currentFacility.id,
          description: problemForm.description,
          clinicalDescription: problemForm.clinicalDescription || undefined,
          priority: problemForm.priority,
          onsetDate: problemForm.onsetDate,
          sourceEncounterId: selectedEncounterId || undefined,
        },
        getPrincipal()
      );
      setShowAddProblem(false);
      setProblemForm({
        description: '',
        clinicalDescription: '',
        priority: 'medium',
        onsetDate: new Date().toISOString().split('T')[0],
      });
      setStatusMessage({ text: 'Problem added to master problem list.' });
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to add problem', isError: true });
    }
  };

  // --- Handlers: Differentials ---
  const handleCreateDifferential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('diagnosis.write')) {
      onDeny('diagnosis.write', 'Add Differential Consideration', 'Recording differential diagnostic considerations requires clinician credentials.');
      return;
    }
    if (!differentialForm.diagnosisText.trim()) return;

    try {
      await clinicalAssessmentService.createDifferential(
        {
          encounterId: selectedEncounterId || 'enc-general',
          patientId: patient.id,
          facilityId: currentFacility.id,
          diagnosisText: differentialForm.diagnosisText,
          diagnosisCode: differentialForm.diagnosisCode || undefined,
          rationale: differentialForm.rationale || undefined,
          supportingFindings: differentialForm.supportingFindings,
          contradictoryFindings: differentialForm.contradictoryFindings,
          confidenceLevel: differentialForm.confidenceLevel,
        },
        getPrincipal()
      );
      setShowAddDifferential(false);
      setDifferentialForm({
        diagnosisText: '',
        diagnosisCode: '',
        rationale: '',
        supportingFinding: '',
        supportingFindings: [],
        contradictoryFinding: '',
        contradictoryFindings: [],
        confidenceLevel: 'moderate',
      });
      setStatusMessage({ text: 'Differential consideration recorded.' });
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to record differential', isError: true });
    }
  };

  const handlePromoteDifferential = async (diffId: string, certainty: DiagnosisCertainty) => {
    if (!can('diagnosis.write')) {
      onDeny('diagnosis.write', 'Promote Differential', 'Promoting a differential to formal diagnosis requires licensed clinician credentials.');
      return;
    }
    try {
      await clinicalAssessmentService.promoteDifferentialToDiagnosis(
        diffId,
        { certainty, diagnosisType: 'PRIMARY' },
        getPrincipal()
      );
      setStatusMessage({ text: `Differential promoted to ${certainty} diagnosis.` });
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Promotion failed', isError: true });
    }
  };

  // --- Handlers: Holistic Assessment ---
  const handleSaveAssessment = async () => {
    if (!can('clinical.assessment.write')) {
      onDeny('clinical.assessment.write', 'Save Clinical Assessment', 'Clinical assessment drafting requires clinician credentials.');
      return;
    }
    if (!assessmentDraft.overallClinicalImpression.trim()) {
      setStatusMessage({ text: 'Overall clinical impression cannot be empty.', isError: true });
      return;
    }

    setIsAssessmentSubmitting(true);
    try {
      const activeProbIds = problems.filter((p) => p.status === 'ACTIVE').map((p) => p.id);
      const primDx = diagnoses.find((d) => d.status !== 'ENTERED_IN_ERROR');
      const diffIds = differentials.filter((d) => d.status === 'CONSIDERED').map((d) => d.id);

      await clinicalAssessmentService.draftClinicalAssessment(
        {
          encounterId: selectedEncounterId || 'enc-current',
          patientId: patient.id,
          facilityId: currentFacility.id,
          overallClinicalImpression: assessmentDraft.overallClinicalImpression,
          clinicalReasoning: assessmentDraft.clinicalReasoning || undefined,
          uncertaintyComments: assessmentDraft.uncertaintyComments || undefined,
          severityPriority: assessmentDraft.severityPriority,
          activeProblemIds: activeProbIds,
          primaryDiagnosisId: primDx?.id,
          differentialConsiderationIds: diffIds,
        },
        getPrincipal()
      );
      setStatusMessage({ text: 'Clinical assessment draft saved.' });
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to save assessment', isError: true });
    } finally {
      setIsAssessmentSubmitting(false);
    }
  };

  const handleSignAssessment = async (assessmentId: string) => {
    if (!can('clinical.assessment.sign')) {
      onDeny('clinical.assessment.sign', 'Sign Clinical Assessment', 'Cryptographic signing of clinical assessments is restricted to licensed physicians and clinical supervisors.');
      return;
    }
    try {
      await clinicalAssessmentService.signClinicalAssessment(assessmentId, getPrincipal());
      setStatusMessage({ text: 'Assessment cryptographically signed and sealed with SHA-256 integrity protection.' });
      setTimeout(() => setStatusMessage(null), 5000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Signing failed', isError: true });
    }
  };

  // --- Generic Dialog Confirm ---
  const handleDialogSubmit = async () => {
    if (!activeDialog) return;
    const principal = getPrincipal();

    try {
      if (activeDialog.type === 'resolve_problem') {
        if (!activeDialog.textValue.trim()) throw new Error('Resolution reason is required.');
        await clinicalAssessmentService.resolveProblem(
          activeDialog.targetId,
          { resolutionReason: activeDialog.textValue },
          principal
        );
        setStatusMessage({ text: 'Problem resolved.' });
      } else if (activeDialog.type === 'error_problem') {
        if (!activeDialog.textValue.trim()) throw new Error('Clinical error reason is required.');
        await clinicalAssessmentService.markProblemEnteredInError(
          activeDialog.targetId,
          { errorReason: activeDialog.textValue },
          principal
        );
        setStatusMessage({ text: 'Problem marked as entered in error.' });
      } else if (activeDialog.type === 'correct_dx') {
        if (!activeDialog.textValue.trim()) throw new Error('Corrected diagnosis text is required.');
        if (!activeDialog.secondaryValue?.trim()) throw new Error('Amendment reason is required.');
        await clinicalAssessmentService.correctDiagnosis(
          activeDialog.targetId,
          {
            diagnosisText: activeDialog.textValue,
            amendmentReason: activeDialog.secondaryValue,
          },
          principal
        );
        setStatusMessage({ text: 'Diagnosis corrected with audit trail.' });
      } else if (activeDialog.type === 'error_dx') {
        if (!activeDialog.textValue.trim()) throw new Error('Void reason is required.');
        await clinicalAssessmentService.markDiagnosisEnteredInError(
          activeDialog.targetId,
          { errorReason: activeDialog.textValue },
          principal
        );
        setStatusMessage({ text: 'Diagnosis marked as entered in error.' });
      } else if (activeDialog.type === 'deprioritize_diff') {
        if (!activeDialog.textValue.trim()) throw new Error('Clinical reason is required.');
        await clinicalAssessmentService.deprioritizeDifferential(
          activeDialog.targetId,
          { deprioritizedReason: activeDialog.textValue },
          principal
        );
        setStatusMessage({ text: 'Differential deprioritized.' });
      } else if (activeDialog.type === 'rule_out_diff') {
        if (!activeDialog.textValue.trim()) throw new Error('Rule out rationale is required.');
        await clinicalAssessmentService.ruleOutDifferential(
          activeDialog.targetId,
          activeDialog.textValue,
          principal
        );
        setStatusMessage({ text: 'Differential ruled out.' });
      } else if (activeDialog.type === 'amend_assmt') {
        if (!activeDialog.textValue.trim()) throw new Error('Amendment reason is required.');
        await clinicalAssessmentService.amendClinicalAssessment(
          activeDialog.targetId,
          {
            amendmentReason: activeDialog.textValue,
            overallClinicalImpression: activeDialog.secondaryValue || undefined,
          },
          principal
        );
        setStatusMessage({ text: 'Clinical assessment amended.' });
      }

      setActiveDialog(null);
      setTimeout(() => setStatusMessage(null), 4000);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Operation failed', isError: true });
    }
  };

  const activeAssessment = assessments.length > 0 ? assessments[0] : null;

  return (
    <div id="clinical-assessment-workspace" className="space-y-6">
      {/* Safety Protocol Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-900">
        <ShieldCheck className="h-5 w-5 flex-shrink-0 text-sky-700 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold">Clinical Assessment & Diagnostic Attestation:</span>
          <p className="mt-0.5 text-xs text-sky-800 leading-relaxed">
            All documented diagnoses, problem list entries, and holistic clinical impressions are cryptographically signed,
            event-sourced, and require explicit authenticated clinician attestation. Inferred AI suggestions are never auto-committed.
          </p>
        </div>
      </div>

      {/* Status Feedback Notification */}
      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
            statusMessage.isError
              ? 'border border-rose-200 bg-rose-50 text-rose-800'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {statusMessage.isError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Top Header: Encounter Selector & Segmented Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Encounter:</span>
          <select
            value={selectedEncounterId}
            onChange={(e) => setSelectedEncounterId(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none"
          >
            {encounters.map((enc) => (
              <option key={enc.id} value={enc.id}>
                {new Date(enc.startedAt).toLocaleDateString()} — {enc.type || 'Clinical Encounter'} ({enc.status})
              </option>
            ))}
            {encounters.length === 0 && <option value="">No Active Encounters</option>}
          </select>
        </div>

        {/* Section Tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveSection('diagnoses')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSection === 'diagnoses'
                ? 'bg-white text-sky-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Diagnoses ({diagnoses.filter((d) => d.status !== 'ENTERED_IN_ERROR').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('problems')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSection === 'problems'
                ? 'bg-white text-sky-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Problem List ({problems.filter((p) => p.status === 'ACTIVE').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('differentials')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSection === 'differentials'
                ? 'bg-white text-sky-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Differentials ({differentials.filter((d) => d.status === 'CONSIDERED').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('assessment')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeSection === 'assessment'
                ? 'bg-white text-sky-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="h-3.5 w-3.5" />
            <span>Assessment & Plan</span>
            {activeAssessment?.status === 'SIGNED' && (
              <span className="ml-1 inline-flex items-center rounded bg-emerald-100 px-1 py-0.2 text-[10px] text-emerald-800">
                SIGNED
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 1: DIAGNOSES */}
      {/* ===================================================================== */}
      {activeSection === 'diagnoses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Formally Attested Diagnoses</h3>
              <p className="text-xs text-slate-500">
                Standardized diagnostic descriptions with offline ICD-10 codification.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddDiagnosis(!showAddDiagnosis)}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Record Diagnosis</span>
            </button>
          </div>

          {/* Add Diagnosis Form */}
          {showAddDiagnosis && (
            <form onSubmit={handleCreateDiagnosis} className="rounded-lg border border-sky-100 bg-sky-50/50 p-4 space-y-4">
              <div className="font-medium text-sm text-slate-800">Record New Clinical Diagnosis</div>

              {/* Terminology Auto-complete Search Bar */}
              <div className="relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Offline ICD-10 Search & Terminology Lookup:
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={termQuery}
                    onChange={(e) => setTermQuery(e.target.value)}
                    placeholder="Type code or term (e.g., 'Malaria', 'A09', 'Hypertension', 'Diabetes', 'Pneumonia')..."
                    className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>

                {showTermResults && termResults.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                    {termResults.map((t) => (
                      <div
                        key={t.code}
                        onClick={() => selectTerm(t)}
                        className="cursor-pointer rounded px-3 py-2 text-sm hover:bg-sky-50 transition flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">{t.display}</div>
                          <div className="text-xs text-slate-500">
                            {t.category} {t.synonyms?.length ? `• ${t.synonyms.join(', ')}` : ''}
                          </div>
                        </div>
                        <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                          {t.code}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Diagnosis Narrative / Description: *
                  </label>
                  <input
                    type="text"
                    required
                    value={diagnosisForm.diagnosisText}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosisText: e.target.value })}
                    placeholder="e.g., Severe Malaria with cerebral complications"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">ICD-10 Code:</label>
                    <input
                      type="text"
                      value={diagnosisForm.diagnosisCode}
                      onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosisCode: e.target.value })}
                      placeholder="e.g., B50.0"
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Coding System:</label>
                    <input
                      type="text"
                      value={diagnosisForm.codingSystem}
                      onChange={(e) => setDiagnosisForm({ ...diagnosisForm, codingSystem: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-slate-50 text-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnosis Role:</label>
                  <select
                    value={diagnosisForm.diagnosisType}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosisType: e.target.value as DiagnosisType })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value="PRIMARY">PRIMARY (Main condition under care)</option>
                    <option value="SECONDARY">SECONDARY (Comorbid condition)</option>
                    <option value="WORKING">WORKING (Provisional clinical lead)</option>
                    <option value="ADMISSION">ADMISSION (Admitting impression)</option>
                    <option value="DISCHARGE">DISCHARGE (Final discharge diagnosis)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnostic Certainty:</label>
                  <select
                    value={diagnosisForm.certainty}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, certainty: e.target.value as DiagnosisCertainty })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value="CONFIRMED">CONFIRMED (Definitive clinical confirmation)</option>
                    <option value="PROVISIONAL">PROVISIONAL (High clinical probability)</option>
                    <option value="SUSPECTED">SUSPECTED (Investigation ongoing)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Context / Onset:</label>
                  <input
                    type="text"
                    value={diagnosisForm.onsetContext}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, onsetContext: e.target.value })}
                    placeholder="e.g., Acute 3-day fever following travel"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDiagnosis(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
                >
                  Confirm & Attest Diagnosis
                </button>
              </div>
            </form>
          )}

          {/* Diagnoses List */}
          <div className="space-y-2">
            {diagnoses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No diagnoses recorded for this patient. Click "Record Diagnosis" to document with ICD-10.
              </div>
            ) : (
              diagnoses.map((dx) => {
                const isEnteredInError = dx.status === 'ENTERED_IN_ERROR';
                const isConfirmed = dx.certainty === 'CONFIRMED' || dx.status === 'CONFIRMED';

                return (
                  <div
                    key={dx.id}
                    className={`rounded-lg border p-4 transition ${
                      isEnteredInError
                        ? 'border-slate-200 bg-slate-50/70 opacity-60'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              isEnteredInError ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            {dx.diagnosisText || dx.description}
                          </span>
                          {(dx.diagnosisCode || dx.code) && (
                            <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-mono font-semibold text-sky-700 border border-sky-200">
                              {dx.diagnosisCode || dx.code} ({dx.codingSystem || 'ICD-10'})
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                              isConfirmed
                                ? 'bg-emerald-100 text-emerald-800'
                                : isEnteredInError
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isEnteredInError ? 'ENTERED IN ERROR' : dx.certainty || dx.status}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {dx.diagnosisType || dx.type || 'PRIMARY'}
                          </span>
                        </div>

                        {dx.onsetContext && (
                          <div className="text-xs text-slate-600">Context: {dx.onsetContext}</div>
                        )}

                        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                          <span className="flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            {dx.clinicianName || 'Attested Clinician'} ({dx.clinicianRole || 'Clinician'})
                          </span>
                          <span>•</span>
                          <span>{new Date(dx.recordedAt).toLocaleString()}</span>
                          {dx.amendmentReason && (
                            <span className="text-amber-600 font-medium">
                              (Amended: {dx.amendmentReason})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {!isEnteredInError && (
                        <div className="flex items-center gap-2">
                          {!isConfirmed && (
                            <button
                              type="button"
                              onClick={() => handleConfirmDiagnosis(dx.id)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                              title="Confirm provisional diagnosis"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDialog({
                                type: 'correct_dx',
                                targetId: dx.id,
                                title: 'Correct Diagnosis Record',
                                textValue: dx.diagnosisText || dx.description || '',
                                secondaryValue: '',
                              })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            title="Correct / Amend diagnosis"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDialog({
                                type: 'error_dx',
                                targetId: dx.id,
                                title: 'Void Diagnosis (Entered in Error)',
                                textValue: '',
                              })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Mark as entered in error"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 2: LONGITUDINAL PROBLEM LIST */}
      {/* ===================================================================== */}
      {activeSection === 'problems' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Master Problem List</h3>
              <p className="text-xs text-slate-500">
                Longitudinal tracking of patient chronic and acute health issues across encounters.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddProblem(!showAddProblem)}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Problem</span>
            </button>
          </div>

          {/* Add Problem Form */}
          {showAddProblem && (
            <form onSubmit={handleCreateProblem} className="rounded-lg border border-sky-100 bg-sky-50/50 p-4 space-y-4">
              <div className="font-medium text-sm text-slate-800">Add to Longitudinal Problem List</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Problem Description: *</label>
                  <input
                    type="text"
                    required
                    value={problemForm.description}
                    onChange={(e) => setProblemForm({ ...problemForm, description: e.target.value })}
                    placeholder="e.g., Essential Hypertension, Stage 2"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority / Clinical Acuity:</label>
                  <select
                    value={problemForm.priority}
                    onChange={(e) => setProblemForm({ ...problemForm, priority: e.target.value as ProblemPriority })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value="routine">Routine</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Details / Notes:</label>
                  <input
                    type="text"
                    value={problemForm.clinicalDescription}
                    onChange={(e) => setProblemForm({ ...problemForm, clinicalDescription: e.target.value })}
                    placeholder="e.g., Target organ evaluation pending"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Onset Date:</label>
                  <input
                    type="date"
                    value={problemForm.onsetDate}
                    onChange={(e) => setProblemForm({ ...problemForm, onsetDate: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProblem(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
                >
                  Record Problem
                </button>
              </div>
            </form>
          )}

          {/* Problem List */}
          <div className="space-y-2">
            {problems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No problems recorded on master problem list.
              </div>
            ) : (
              problems.map((prob) => {
                const isResolved = prob.status === 'RESOLVED';
                const isError = prob.status === 'ENTERED_IN_ERROR';

                return (
                  <div
                    key={prob.id}
                    className={`rounded-lg border p-4 transition ${
                      isError
                        ? 'border-slate-200 bg-slate-50 opacity-60'
                        : isResolved
                        ? 'border-slate-200 bg-slate-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              isError ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {prob.description}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                              prob.status === 'ACTIVE'
                                ? 'bg-sky-100 text-sky-800'
                                : isResolved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {prob.status}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {prob.priority} priority
                          </span>
                        </div>

                        {prob.clinicalDescription && (
                          <div className="text-xs text-slate-600">{prob.clinicalDescription}</div>
                        )}

                        {isResolved && prob.resolutionReason && (
                          <div className="text-xs text-emerald-700 font-medium">
                            Resolved: {prob.resolutionReason} ({new Date(prob.resolvedAt!).toLocaleDateString()})
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                          <span>Recorded by {prob.recordedByName}</span>
                          <span>•</span>
                          <span>Onset: {prob.onsetDate || 'Unknown'}</span>
                          <span>•</span>
                          <span>Added {new Date(prob.recordedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      {prob.status === 'ACTIVE' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDialog({
                                type: 'resolve_problem',
                                targetId: prob.id,
                                title: 'Resolve Problem',
                                textValue: '',
                              })
                            }
                            className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDialog({
                                type: 'error_problem',
                                targetId: prob.id,
                                title: 'Void Problem (Entered in Error)',
                                textValue: '',
                              })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                            title="Mark as entered in error"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: DIFFERENTIAL DIAGNOSES */}
      {/* ===================================================================== */}
      {activeSection === 'differentials' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Differential Considerations</h3>
              <p className="text-xs text-slate-500">
                Hypotheses evaluated during clinical diagnostic workup, with supporting and contradictory evidence.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddDifferential(!showAddDifferential)}
              className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Consideration</span>
            </button>
          </div>

          {/* Add Differential Form */}
          {showAddDifferential && (
            <form onSubmit={handleCreateDifferential} className="rounded-lg border border-sky-100 bg-sky-50/50 p-4 space-y-4">
              <div className="font-medium text-sm text-slate-800">New Differential Diagnostic Hypothesis</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnostic Hypothesis: *</label>
                  <input
                    type="text"
                    required
                    value={differentialForm.diagnosisText}
                    onChange={(e) => setDifferentialForm({ ...differentialForm, diagnosisText: e.target.value })}
                    placeholder="e.g., Bacterial Meningitis vs Viral Encephalitis"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Confidence Level:</label>
                  <select
                    value={differentialForm.confidenceLevel}
                    onChange={(e) => setDifferentialForm({ ...differentialForm, confidenceLevel: e.target.value as any })}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  >
                    <option value="low">Low Confidence</option>
                    <option value="moderate">Moderate Confidence</option>
                    <option value="high">High Clinical Suspicion</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Clinical Rationale:</label>
                <textarea
                  rows={2}
                  value={differentialForm.rationale}
                  onChange={(e) => setDifferentialForm({ ...differentialForm, rationale: e.target.value })}
                  placeholder="Explain why this differential is being actively considered..."
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none bg-white"
                />
              </div>

              {/* Supporting Findings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-emerald-800 mb-1">Supporting Findings:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={differentialForm.supportingFinding}
                      onChange={(e) => setDifferentialForm({ ...differentialForm, supportingFinding: e.target.value })}
                      placeholder="e.g., Nuchal rigidity, Kernig positive"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (differentialForm.supportingFinding.trim()) {
                          setDifferentialForm({
                            ...differentialForm,
                            supportingFindings: [...differentialForm.supportingFindings, differentialForm.supportingFinding.trim()],
                            supportingFinding: '',
                          });
                        }
                      }}
                      className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {differentialForm.supportingFindings.map((f, i) => (
                      <span key={i} className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Contradictory Findings */}
                <div>
                  <label className="block text-xs font-semibold text-rose-800 mb-1">Contradictory / Disproving Findings:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={differentialForm.contradictoryFinding}
                      onChange={(e) => setDifferentialForm({ ...differentialForm, contradictoryFinding: e.target.value })}
                      placeholder="e.g., Normal CSF protein, no focal signs"
                      className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-sm bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (differentialForm.contradictoryFinding.trim()) {
                          setDifferentialForm({
                            ...differentialForm,
                            contradictoryFindings: [...differentialForm.contradictoryFindings, differentialForm.contradictoryFinding.trim()],
                            contradictoryFinding: '',
                          });
                        }
                      }}
                      className="rounded bg-rose-600 px-3 py-1 text-xs text-white"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {differentialForm.contradictoryFindings.map((f, i) => (
                      <span key={i} className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDifferential(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
                >
                  Save Differential
                </button>
              </div>
            </form>
          )}

          {/* Differential List */}
          <div className="space-y-3">
            {differentials.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No active differential diagnostic considerations documented for this encounter.
              </div>
            ) : (
              differentials.map((diff) => {
                const isPromoted = diff.status.startsWith('PROMOTED');
                const isRuledOut = diff.status === 'RULED_OUT';
                const isDeprioritized = diff.status === 'DEPRIORITIZED';

                return (
                  <div
                    key={diff.id}
                    className={`rounded-lg border p-4 transition ${
                      isRuledOut
                        ? 'border-slate-200 bg-slate-50/70 opacity-60'
                        : isPromoted
                        ? 'border-emerald-200 bg-emerald-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-semibold text-sm ${
                              isRuledOut ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            {diff.diagnosisText}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                              isPromoted
                                ? 'bg-emerald-100 text-emerald-800'
                                : isRuledOut
                                ? 'bg-rose-100 text-rose-800'
                                : isDeprioritized
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {diff.status}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                            {diff.confidenceLevel} confidence
                          </span>
                        </div>

                        {diff.rationale && (
                          <p className="text-xs text-slate-600 leading-relaxed">{diff.rationale}</p>
                        )}

                        {/* Evidence Chips */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {diff.supportingFindings && diff.supportingFindings.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold text-emerald-800">Supporting:</span>
                              {diff.supportingFindings.map((f, i) => (
                                <span key={i} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 border border-emerald-200">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                          {diff.contradictoryFindings && diff.contradictoryFindings.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-semibold text-rose-800">Contradictory:</span>
                              {diff.contradictoryFindings.map((f, i) => (
                                <span key={i} className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-700 border border-rose-200">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {diff.deprioritizedReason && (
                          <div className="text-xs text-slate-500 font-medium italic">
                            Status note: {diff.deprioritizedReason}
                          </div>
                        )}
                      </div>

                      {/* Promotion / Rule out actions */}
                      {diff.status === 'CONSIDERED' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePromoteDifferential(diff.id, 'CONFIRMED')}
                            className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                            title="Promote to confirmed diagnosis"
                          >
                            Promote to Confirmed
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePromoteDifferential(diff.id, 'PROVISIONAL')}
                            className="rounded border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition"
                            title="Promote to provisional diagnosis"
                          >
                            Promote to Working
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveDialog({
                                type: 'rule_out_diff',
                                targetId: diff.id,
                                title: 'Rule Out Differential',
                                textValue: '',
                              })
                            }
                            className="rounded border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
                            title="Rule out differential"
                          >
                            Rule Out
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: CLINICAL ASSESSMENT & PLAN SYNTHESIS */}
      {/* ===================================================================== */}
      {activeSection === 'assessment' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Holistic Clinical Assessment & Synthesis</h3>
              <p className="text-xs text-slate-500">
                Unified clinical synthesis, reasoning, diagnostic certainty, and cryptographically sealed attestation.
              </p>
            </div>
            {activeAssessment?.status === 'SIGNED' ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Cryptographically Signed ({activeAssessment.integrityHash})</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setActiveDialog({
                      type: 'amend_assmt',
                      targetId: activeAssessment.id,
                      title: 'Amend Signed Clinical Assessment',
                      textValue: '',
                      secondaryValue: activeAssessment.overallClinicalImpression,
                    })
                  }
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                >
                  Create Versioned Amendment
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isAssessmentSubmitting}
                  onClick={handleSaveAssessment}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Save Draft
                </button>
                {activeAssessment && (
                  <button
                    type="button"
                    onClick={() => handleSignAssessment(activeAssessment.id)}
                    className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Sign Assessment</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Assessment Editor / Viewer */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Overall Clinical Impression: *
              </label>
              <textarea
                rows={3}
                disabled={activeAssessment?.status === 'SIGNED'}
                value={assessmentDraft.overallClinicalImpression}
                onChange={(e) =>
                  setAssessmentDraft({ ...assessmentDraft, overallClinicalImpression: e.target.value })
                }
                placeholder="Synthesize the patient's acute presentation, underlying pathology, and clinical trajectories..."
                className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Diagnostic Reasoning:
                </label>
                <textarea
                  rows={3}
                  disabled={activeAssessment?.status === 'SIGNED'}
                  value={assessmentDraft.clinicalReasoning}
                  onChange={(e) =>
                    setAssessmentDraft({ ...assessmentDraft, clinicalReasoning: e.target.value })
                  }
                  placeholder="Rationale supporting the primary diagnosis over alternatives..."
                  className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Uncertainty & Key Unknowns:
                </label>
                <textarea
                  rows={3}
                  disabled={activeAssessment?.status === 'SIGNED'}
                  value={assessmentDraft.uncertaintyComments}
                  onChange={(e) =>
                    setAssessmentDraft({ ...assessmentDraft, uncertaintyComments: e.target.value })
                  }
                  placeholder="Diagnostic ambiguities, pending culture results, or red flags to monitor..."
                  className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
              <div className="flex items-center gap-4">
                <span>
                  Linked Problems: <strong>{problems.filter((p) => p.status === 'ACTIVE').length} active</strong>
                </span>
                <span>
                  Linked Differentials: <strong>{differentials.filter((d) => d.status === 'CONSIDERED').length} active</strong>
                </span>
              </div>
              {activeAssessment && (
                <div>
                  Version: <strong>v{activeAssessment.version}</strong> • Status:{' '}
                  <strong>{activeAssessment.status}</strong>
                  {activeAssessment.signedByName && (
                    <span className="ml-2 text-emerald-700 font-semibold">
                      (Signed by {activeAssessment.signedByName})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL DIALOG: Reasons / Amendments / Corrections */}
      {/* ===================================================================== */}
      {activeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-semibold text-slate-900">{activeDialog.title}</h4>
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {activeDialog.type === 'correct_dx' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Corrected Diagnosis Text: *
                  </label>
                  <input
                    type="text"
                    required
                    value={activeDialog.textValue}
                    onChange={(e) => setActiveDialog({ ...activeDialog, textValue: e.target.value })}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinical Amendment Reason: *
                  </label>
                  <input
                    type="text"
                    required
                    value={activeDialog.secondaryValue || ''}
                    onChange={(e) => setActiveDialog({ ...activeDialog, secondaryValue: e.target.value })}
                    placeholder="e.g., Blood culture confirmed Klebsiella pneumoniae"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            ) : activeDialog.type === 'amend_assmt' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinical Reason for Amendment: *
                  </label>
                  <input
                    type="text"
                    required
                    value={activeDialog.textValue}
                    onChange={(e) => setActiveDialog({ ...activeDialog, textValue: e.target.value })}
                    placeholder="e.g., Deteriorating respiratory mechanics post-lumbar puncture"
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amended Overall Impression:
                  </label>
                  <textarea
                    rows={3}
                    value={activeDialog.secondaryValue || ''}
                    onChange={(e) => setActiveDialog({ ...activeDialog, secondaryValue: e.target.value })}
                    className="w-full rounded-md border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Required Clinical Reason / Rationale: *
                </label>
                <textarea
                  rows={3}
                  required
                  value={activeDialog.textValue}
                  onChange={(e) => setActiveDialog({ ...activeDialog, textValue: e.target.value })}
                  placeholder="Explain why this action is being taken for audit compliance..."
                  className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveDialog(null)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDialogSubmit}
                className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
              >
                Confirm & Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
