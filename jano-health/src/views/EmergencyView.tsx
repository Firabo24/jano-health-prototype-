/**
 * Jano Health - Acute Triage & Emergency Console View (Clinical Core V9)
 * 
 * Features:
 * 1. High-acuity resuscitation queue with South African Triage Scale (SATS) algorithmic prioritization.
 * 2. Strict separation of operational triage from clinical diagnosis.
 * 3. Immutable triage provenance logging with DEMO / SYNTHETIC TRIAGE RULE notices.
 * 4. Longitudinal acute patient reassessment tracking without overwriting historical evaluations.
 * 5. Disposition management (Discharge, Inpatient Admission, Referral Transfer with transport coordination).
 * 6. Deterministic collision-resistant emergency identifiers (EMR-[FACILITY]-[YYYYMMDD]-[DEV]-[SEQ][CHECK]).
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  Bed,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  Info,
  LogOut,
  Plus,
  ShieldAlert,
  Stethoscope,
  User,
  X,
} from 'lucide-react';
import {
  EmergencyCase,
  EmergencyTriage,
  EmergencyReassessment,
  EmergencyAcuity,
  EmergencyArrivalMode,
  EmergencyCaseStatus,
  EmergencyDispositionType,
  Patient,
} from '../domain/types';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';
import {
  clinicalWorkflowService,
  ClinicalActorContext,
} from '../services/clinical/clinicalWorkflowService';
import {
  triageClassificationService,
  TriageEvaluationInput,
} from '../services/clinical/triageClassificationService';

interface EmergencyViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const EmergencyView: React.FC<EmergencyViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, can } = useAuth();

  const actorContext: ClinicalActorContext = useMemo(
    () => ({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      facilityId: currentFacility.id,
      deviceId: 'client-emg-1',
    }),
    [currentUser, currentFacility]
  );

  const [emergencyCases, setEmergencyCases] = useState<EmergencyCase[]>(() =>
    localDb.getEmergencyCases()
  );
  const [triages, setTriages] = useState<EmergencyTriage[]>(() =>
    localDb.getEmergencyTriages()
  );
  const [reassessments, setReassessments] = useState<EmergencyReassessment[]>(() =>
    localDb.getEmergencyReassessments()
  );
  const patients = localDb.getPatients();

  const [filter, setFilter] = useState<'ALL_ACTIVE' | 'RESUSCITATION' | 'URGENT' | 'AMBULATORY' | 'RESOLVED'>('ALL_ACTIVE');
  const [showNewEmergency, setShowNewEmergency] = useState(false);
  const [activeCaseForReassess, setActiveCaseForReassess] = useState<EmergencyCase | null>(null);
  const [activeCaseForDisposition, setActiveCaseForDisposition] = useState<EmergencyCase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Intake Form State
  const [intakeForm, setIntakeForm] = useState<{
    patientId: string;
    provisionalPatientName: string;
    arrivalMode: EmergencyArrivalMode;
    chiefComplaint: string;
    airwayPatent: boolean;
    respiratoryDistress: boolean;
    shockSigns: boolean;
    glasgowComaScale: number;
    temperature: number;
    heartRate: number;
    systolicBp: number;
    oxygenSaturation: number;
    overrideAcuity: boolean;
    manualAcuity: EmergencyAcuity;
    overrideReason: string;
  }>({
    patientId: '',
    provisionalPatientName: '',
    arrivalMode: 'WALK_IN',
    chiefComplaint: '',
    airwayPatent: true,
    respiratoryDistress: false,
    shockSigns: false,
    glasgowComaScale: 15,
    temperature: 36.8,
    heartRate: 80,
    systolicBp: 120,
    oxygenSaturation: 98,
    overrideAcuity: false,
    manualAcuity: 'URGENT_YELLOW',
    overrideReason: '',
  });

  // Reassessment Form State
  const [reassessForm, setReassessForm] = useState({
    clinicalChange: '',
    responseOrObservation: '',
    currentStatus: 'OBSERVATION' as EmergencyCaseStatus,
  });

  // Disposition Form State
  const [dispositionForm, setDispositionForm] = useState({
    disposition: 'DISCHARGE' as EmergencyDispositionType,
    notes: '',
    destinationFacilityId: 'fac-kigoma-dh',
    destinationFacilityName: 'Kigoma Regional Referral Hospital',
    instructions: '',
  });

  // Real-time SATS Triage Classification Recommendation
  const liveEvaluationInput: TriageEvaluationInput = useMemo(
    () => ({
      chiefComplaint: intakeForm.chiefComplaint,
      airwayPatent: intakeForm.airwayPatent,
      respiratoryDistress: intakeForm.respiratoryDistress,
      shockSigns: intakeForm.shockSigns,
      glasgowComaScale: intakeForm.glasgowComaScale,
      temperature: intakeForm.temperature,
      heartRate: intakeForm.heartRate,
      systolicBp: intakeForm.systolicBp,
      oxygenSaturation: intakeForm.oxygenSaturation,
    }),
    [intakeForm]
  );

  const recommendedClassification = useMemo(() => {
    return triageClassificationService.classify(liveEvaluationInput);
  }, [liveEvaluationInput]);

  const effectiveAcuity: EmergencyAcuity = intakeForm.overrideAcuity
    ? intakeForm.manualAcuity
    : recommendedClassification.acuity;

  const refreshData = () => {
    setEmergencyCases(localDb.getEmergencyCases());
    setTriages(localDb.getEmergencyTriages());
    setReassessments(localDb.getEmergencyReassessments());
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intakeForm.chiefComplaint.trim()) {
      setErrorMsg('Chief complaint is required for acute intake');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await clinicalWorkflowService.recordEmergencyTriage(
        {
          facilityId: currentFacility.id,
          patientId: intakeForm.patientId || undefined,
          provisionalPatientName: !intakeForm.patientId
            ? intakeForm.provisionalPatientName || 'Unidentified Patient'
            : undefined,
          arrivalMode: intakeForm.arrivalMode,
          chiefComplaint: intakeForm.chiefComplaint.trim(),
          acuity: effectiveAcuity,
          airwayBreathingCirculation: {
            airwayPatent: intakeForm.airwayPatent,
            respiratoryDistress: intakeForm.respiratoryDistress,
            shockSigns: intakeForm.shockSigns,
            glasgowComaScale: intakeForm.glasgowComaScale,
          },
          treatmentArea: recommendedClassification.recommendedBay,
          resuscitationFlag: effectiveAcuity === 'RESUSCITATION_RED',
          status: effectiveAcuity === 'RESUSCITATION_RED' ? 'STABILIZATION' : 'ASSESSMENT',
          priority: recommendedClassification.workflowPriority,
          isActive: true,
          version: 1,
          provenance: {
            recordedById: currentUser.id,
            recordedByName: currentUser.fullName,
            recordedAt: new Date().toISOString(),
            facilityId: currentFacility.id,
            deviceId: 'client-emg-1',
            syncStatus: 'synced',
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
        actorContext,
        liveEvaluationInput
      );

      refreshData();
      setShowNewEmergency(false);
      setIntakeForm({
        patientId: '',
        provisionalPatientName: '',
        arrivalMode: 'WALK_IN',
        chiefComplaint: '',
        airwayPatent: true,
        respiratoryDistress: false,
        shockSigns: false,
        glasgowComaScale: 15,
        temperature: 36.8,
        heartRate: 80,
        systolicBp: 120,
        oxygenSaturation: 98,
        overrideAcuity: false,
        manualAcuity: 'URGENT_YELLOW',
        overrideReason: '',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record emergency triage');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReassessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCaseForReassess) return;
    if (!reassessForm.clinicalChange.trim()) {
      setErrorMsg('Documenting the clinical change is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await clinicalWorkflowService.recordEmergencyReassessment(
        {
          emergencyCaseId: activeCaseForReassess.id,
          patientId: activeCaseForReassess.patientId,
          facilityId: activeCaseForReassess.facilityId || currentFacility.id,
          assessedById: currentUser.id,
          assessedByName: currentUser.fullName,
          assessedAt: new Date().toISOString(),
          currentStatus: reassessForm.currentStatus,
          clinicalChange: reassessForm.clinicalChange.trim(),
          responseOrObservation: reassessForm.responseOrObservation.trim(),
        },
        actorContext
      );

      refreshData();
      setActiveCaseForReassess(null);
      setReassessForm({
        clinicalChange: '',
        responseOrObservation: '',
        currentStatus: 'OBSERVATION',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record emergency reassessment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispositionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCaseForDisposition) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await clinicalWorkflowService.recordEmergencyDisposition(
        activeCaseForDisposition.id,
        {
          disposition: dispositionForm.disposition,
          notes: dispositionForm.notes.trim(),
          destinationFacilityId:
            dispositionForm.disposition === 'TRANSFER'
              ? dispositionForm.destinationFacilityId
              : undefined,
          destinationFacilityName:
            dispositionForm.disposition === 'TRANSFER'
              ? dispositionForm.destinationFacilityName
              : undefined,
          instructions: dispositionForm.instructions.trim(),
        },
        actorContext
      );

      refreshData();
      setActiveCaseForDisposition(null);
      setDispositionForm({
        disposition: 'DISCHARGE',
        notes: '',
        destinationFacilityId: 'fac-kigoma-dh',
        destinationFacilityName: 'Kigoma Regional Referral Hospital',
        instructions: '',
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record emergency disposition');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCases = useMemo(() => {
    return emergencyCases.filter((c) => {
      if (filter === 'ALL_ACTIVE') return c.isActive;
      if (filter === 'RESUSCITATION') {
        return (
          c.isActive &&
          (c.acuity === 'RESUSCITATION_RED' || c.triageCategory === 'RED_RESUSCITATION')
        );
      }
      if (filter === 'URGENT') {
        return (
          c.isActive &&
          (c.acuity === 'EMERGENT_ORANGE' ||
            c.acuity === 'URGENT_YELLOW' ||
            c.triageCategory === 'YELLOW_URGENT')
        );
      }
      if (filter === 'AMBULATORY') {
        return (
          c.isActive &&
          (c.acuity === 'LESS_URGENT_GREEN' ||
            c.acuity === 'NON_URGENT_BLUE' ||
            c.triageCategory === 'GREEN_DELAYED')
        );
      }
      if (filter === 'RESOLVED') return !c.isActive;
      return true;
    });
  }, [emergencyCases, filter]);

  // Active High-Acuity cases count
  const resuscitationCount = emergencyCases.filter(
    (c) =>
      c.isActive &&
      (c.acuity === 'RESUSCITATION_RED' || c.triageCategory === 'RED_RESUSCITATION')
  ).length;

  return (
    <div className="space-y-5" id="emergency-console-root">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Acute Triage & Emergency Console</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-950 text-red-300 border border-red-800">
              Clinical Core V9
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Emergency department resuscitation board & South African Triage Scale (SATS) algorithmic priority queue
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can('emergency:create') && (
            <button
              id="btn-new-emergency-intake"
              onClick={() => setShowNewEmergency(!showNewEmergency)}
              className="px-3.5 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Log Emergency Intake
            </button>
          )}
        </div>
      </div>

      {/* Provenance & Safety Boundary Notice */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex items-start gap-3 text-xs text-slate-300">
        <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-teal-300">Operational Triage Invariant:</span> Triage categorization is a workflow-prioritization tool for resource queuing, NOT a clinical diagnosis. It does not formulate medical orders, mandates, or autonomous prescriptions.
          <span className="block text-[11px] text-slate-400 mt-0.5 font-mono">
            Rule provenance: {triageClassificationService.getRuleMetadata().source} ({triageClassificationService.getRuleMetadata().version})
          </span>
        </div>
      </div>

      {/* Critical High Acuity Alert Banner */}
      {resuscitationCount > 0 && (
        <div className="bg-red-950/70 border border-red-800 rounded-lg p-3 flex items-center justify-between gap-3 text-xs text-red-200 animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-bold">
              {resuscitationCount} Active Resuscitation (RED) Case{resuscitationCount > 1 ? 's' : ''} in Bay:
            </span>
            <span>Immediate resuscitation team required at acute beds.</span>
          </div>
          <button
            onClick={() => setFilter('RESUSCITATION')}
            className="px-2.5 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-medium text-[11px]"
          >
            Filter Red Bay
          </button>
        </div>
      )}

      {/* New Emergency Intake Modal / Panel */}
      {showNewEmergency && (
        <form
          id="form-emergency-intake"
          onSubmit={handleCreateCase}
          className="bg-slate-900 border border-red-800/80 rounded-lg p-5 space-y-4 text-xs shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> New Emergency Presentation & SATS Triage Assessment
            </h3>
            <button
              type="button"
              onClick={() => setShowNewEmergency(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-950/60 border border-red-700 rounded text-red-200">
              {errorMsg}
            </div>
          )}

          {/* Patient Identification & Logistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Patient Record (Optional if Unknown)</label>
              <select
                id="select-intake-patient"
                value={intakeForm.patientId}
                onChange={(e) => setIntakeForm({ ...intakeForm, patientId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100 focus:border-red-500 focus:outline-none"
              >
                <option value="">-- Unidentified / Trauma Unknown --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>

            {!intakeForm.patientId && (
              <div>
                <label className="block text-slate-400 mb-1">Provisional Identity / Wristband Descriptor</label>
                <input
                  id="input-provisional-name"
                  type="text"
                  placeholder="e.g. Unknown Male approx 40yo, Blue Jacket"
                  value={intakeForm.provisionalPatientName}
                  onChange={(e) => setIntakeForm({ ...intakeForm, provisionalPatientName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100 focus:border-red-500 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-400 mb-1">Arrival Mode</label>
              <select
                id="select-arrival-mode"
                value={intakeForm.arrivalMode}
                onChange={(e) => setIntakeForm({ ...intakeForm, arrivalMode: e.target.value as EmergencyArrivalMode })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-2 text-slate-100 focus:border-red-500 focus:outline-none"
              >
                <option value="WALK_IN">Walk-in Ambulatory</option>
                <option value="AMBULANCE">Emergency Ambulance</option>
                <option value="INTER_FACILITY_TRANSFER">Inter-Facility Transfer</option>
                <option value="COMMUNITY_REFERRAL">Community Health Worker Referral</option>
                <option value="POLICE_AUTHORITY">Police / Transport Authority</option>
                <option value="OTHER">Other Presentation</option>
              </select>
            </div>
          </div>

          {/* Chief Complaint */}
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Chief Complaint / Primary Presentation *</label>
            <input
              id="input-chief-complaint"
              type="text"
              required
              placeholder="e.g. Sudden onset acute severe respiratory distress, cyanosis, stridor"
              value={intakeForm.chiefComplaint}
              onChange={(e) => setIntakeForm({ ...intakeForm, chiefComplaint: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:border-red-500 focus:outline-none"
            />
          </div>

          {/* Physical Quick Indicators (Airway, Breathing, Shock) */}
          <div className="bg-slate-950/60 p-3.5 rounded border border-slate-800 space-y-3">
            <span className="font-semibold text-slate-300 block">Critical ABC & Physiological Danger Flags</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  id="chk-airway"
                  checked={intakeForm.airwayPatent}
                  onChange={(e) => setIntakeForm({ ...intakeForm, airwayPatent: e.target.checked })}
                  className="rounded text-teal-600 bg-slate-950 border-slate-700"
                />
                <span className={intakeForm.airwayPatent ? 'text-teal-300 font-medium' : 'text-red-400 font-bold'}>
                  Airway Patent {intakeForm.airwayPatent ? '(Clear)' : '(Obstructed!)'}
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  id="chk-respiratory-distress"
                  checked={intakeForm.respiratoryDistress}
                  onChange={(e) => setIntakeForm({ ...intakeForm, respiratoryDistress: e.target.checked })}
                  className="rounded text-red-600 bg-slate-950 border-slate-700"
                />
                <span className={intakeForm.respiratoryDistress ? 'text-red-400 font-bold' : 'text-slate-300'}>
                  Severe Respiratory Distress
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  id="chk-shock"
                  checked={intakeForm.shockSigns}
                  onChange={(e) => setIntakeForm({ ...intakeForm, shockSigns: e.target.checked })}
                  className="rounded text-amber-500 bg-slate-950 border-slate-700"
                />
                <span className={intakeForm.shockSigns ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  Clinical Signs of Shock
                </span>
              </label>
            </div>

            {/* Vital Signs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              <div>
                <label className="block text-slate-400 text-[11px] mb-1">GCS (3-15)</label>
                <input
                  type="number"
                  min={3}
                  max={15}
                  value={intakeForm.glasgowComaScale}
                  onChange={(e) => setIntakeForm({ ...intakeForm, glasgowComaScale: Number(e.target.value) || 15 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">SpO2 (%)</label>
                <input
                  type="number"
                  min={40}
                  max={100}
                  value={intakeForm.oxygenSaturation}
                  onChange={(e) => setIntakeForm({ ...intakeForm, oxygenSaturation: Number(e.target.value) || 98 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Systolic BP (mmHg)</label>
                <input
                  type="number"
                  min={40}
                  max={260}
                  value={intakeForm.systolicBp}
                  onChange={(e) => setIntakeForm({ ...intakeForm, systolicBp: Number(e.target.value) || 120 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Heart Rate (bpm)</label>
                <input
                  type="number"
                  min={20}
                  max={240}
                  value={intakeForm.heartRate}
                  onChange={(e) => setIntakeForm({ ...intakeForm, heartRate: Number(e.target.value) || 80 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[11px] mb-1">Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  min={30}
                  max={45}
                  value={intakeForm.temperature}
                  onChange={(e) => setIntakeForm({ ...intakeForm, temperature: Number(e.target.value) || 37 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* SATS Algorithmic Classification Preview Box */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-red-400" /> SATS Algorithmic Classification Recommendation
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {triageClassificationService.getRuleMetadata().classification}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`px-3 py-1 rounded-md font-bold text-xs border ${
                  triageClassificationService.getDisplay(recommendedClassification.acuity).colorBadge
                }`}
              >
                {triageClassificationService.getDisplay(recommendedClassification.acuity).label}
              </span>

              <span className="text-slate-300 font-medium">
                Target Response Time: {triageClassificationService.getDisplay(recommendedClassification.acuity).targetTime}
              </span>

              <span className="text-slate-400 font-mono">
                Bay: {recommendedClassification.recommendedBay}
              </span>
            </div>

            {recommendedClassification.immediateConcerns.length > 0 && (
              <div className="text-[11px] text-red-300 pt-1">
                <span className="font-semibold">Identified Clinical Concerns: </span>
                {recommendedClassification.immediateConcerns.join(', ')}
              </div>
            )}

            {/* Clinician Acuity Override */}
            {can('emergency:override') && (
              <div className="pt-2 border-t border-slate-800/80">
                <label className="flex items-center gap-2 cursor-pointer text-slate-400">
                  <input
                    type="checkbox"
                    checked={intakeForm.overrideAcuity}
                    onChange={(e) => setIntakeForm({ ...intakeForm, overrideAcuity: e.target.checked })}
                    className="rounded text-amber-500 bg-slate-900 border-slate-700"
                  />
                  <span>Clinical Judgment Override (Clinician Acuity Adjustment)</span>
                </label>

                {intakeForm.overrideAcuity && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Overridden Acuity</label>
                      <select
                        value={intakeForm.manualAcuity}
                        onChange={(e) => setIntakeForm({ ...intakeForm, manualAcuity: e.target.value as EmergencyAcuity })}
                        className="w-full bg-slate-900 border border-amber-700 rounded px-2.5 py-1.5 text-amber-300"
                      >
                        <option value="RESUSCITATION_RED">RED - Resuscitation (Immediate 0m)</option>
                        <option value="EMERGENT_ORANGE">ORANGE - Emergent (&lt;10m)</option>
                        <option value="URGENT_YELLOW">YELLOW - Urgent (&lt;60m)</option>
                        <option value="LESS_URGENT_GREEN">GREEN - Routine / Non-Urgent (&lt;240m)</option>
                        <option value="DEAD_ON_ARRIVAL_BLUE">BLUE - Dead on Arrival / No signs of life (SATS)</option>
                        <option value="EXPECTANT_BLACK">BLACK - Expectant / Deceased (MCI Disaster Policy Only)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Override Reason *</label>
                      <input
                        type="text"
                        required={intakeForm.overrideAcuity}
                        placeholder="Clinical rationale for acuity adjustment"
                        value={intakeForm.overrideReason}
                        onChange={(e) => setIntakeForm({ ...intakeForm, overrideReason: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewEmergency(false)}
              className="px-4 py-2 rounded text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Recording Triage...' : 'Commit Emergency Triage & Admit to Bay'}
            </button>
          </div>
        </form>
      )}

      {/* Reassessment Modal */}
      {activeCaseForReassess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <form
            onSubmit={handleReassessSubmit}
            className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-lg w-full space-y-3 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-teal-300 flex items-center gap-2">
                <Stethoscope className="w-4 h-4" /> Acute Reassessment Record
              </h3>
              <button
                type="button"
                onClick={() => setActiveCaseForReassess(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 font-mono">
              Case: {activeCaseForReassess.emergencyNumber} | {activeCaseForReassess.chiefComplaint}
            </p>

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Documented Clinical Change *</label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Oxygen saturation improved to 97% following 4L nasal cannula oxygen; stridor diminishing."
                value={reassessForm.clinicalChange}
                onChange={(e) => setReassessForm({ ...reassessForm, clinicalChange: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Response to Acute Interventions / Ongoing Observations</label>
              <input
                type="text"
                placeholder="e.g. Hemodynamically stable, alertness improved"
                value={reassessForm.responseOrObservation}
                onChange={(e) => setReassessForm({ ...reassessForm, responseOrObservation: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Updated Clinical Status</label>
              <select
                value={reassessForm.currentStatus}
                onChange={(e) => setReassessForm({ ...reassessForm, currentStatus: e.target.value as EmergencyCaseStatus })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="OBSERVATION">OBSERVATION - In-bay acute monitoring</option>
                <option value="STABILIZATION">STABILIZATION - Active resuscitation ongoing</option>
                <option value="ASSESSMENT">ASSESSMENT - Further physician workup</option>
                <option value="DISPOSITION_PENDING">DISPOSITION_PENDING - Ready for disposition decision</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveCaseForReassess(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Record Longitudinal Reassessment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disposition Modal */}
      {activeCaseForDisposition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <form
            onSubmit={handleDispositionSubmit}
            className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-lg w-full space-y-3 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <LogOut className="w-4 h-4" /> Emergency Case Disposition Decision
              </h3>
              <button
                type="button"
                onClick={() => setActiveCaseForDisposition(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 font-mono">
              Case: {activeCaseForDisposition.emergencyNumber} | {activeCaseForDisposition.chiefComplaint}
            </p>

            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Disposition Pathway *</label>
              <select
                value={dispositionForm.disposition}
                onChange={(e) => setDispositionForm({ ...dispositionForm, disposition: e.target.value as EmergencyDispositionType })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="DISCHARGE">DISCHARGE - Ambulatory Home Discharge</option>
                <option value="ADMISSION">ADMISSION - Inpatient Ward Admission</option>
                <option value="TRANSFER">TRANSFER - Inter-Facility Transfer (Specialist/Hospital)</option>
                <option value="OBSERVATION">OBSERVATION - Short-Stay Clinical Observation</option>
                <option value="DEATH">DEATH - Pronounced Deceased</option>
              </select>
            </div>

            {dispositionForm.disposition === 'TRANSFER' && (
              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" /> Referral Transfer & Transport Coordination
                </span>
                <div>
                  <label className="block text-slate-400 mb-0.5 text-[11px]">Destination Hospital</label>
                  <input
                    type="text"
                    value={dispositionForm.destinationFacilityName}
                    onChange={(e) => setDispositionForm({ ...dispositionForm, destinationFacilityName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px]"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Ambulance transport dispatch request will be automatically queued with referral linkage.
                </p>
              </div>
            )}

            {dispositionForm.disposition === 'DISCHARGE' && (
              <div>
                <label className="block text-slate-400 mb-1">Discharge Instructions to Patient/Family</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Return immediately if high fever recurs or breathing difficulty develops."
                  value={dispositionForm.instructions}
                  onChange={(e) => setDispositionForm({ ...dispositionForm, instructions: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-400 mb-1">Disposition Clinical Notes</label>
              <textarea
                rows={2}
                placeholder="Document clinical rationale for final disposition"
                value={dispositionForm.notes}
                onChange={(e) => setDispositionForm({ ...dispositionForm, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveCaseForDisposition(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold disabled:opacity-50"
              >
                {submitting ? 'Committing...' : 'Commit Disposition'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Queue Filter Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
            filter === 'ALL_ACTIVE' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Active Presentations ({emergencyCases.filter((c) => c.isActive).length})
        </button>

        <button
          onClick={() => setFilter('RESUSCITATION')}
          className={`px-3 py-1.5 rounded-md font-semibold text-xs flex items-center gap-1.5 transition-colors ${
            filter === 'RESUSCITATION'
              ? 'bg-red-600 text-white'
              : 'text-red-400 hover:bg-red-950/40'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
          Resuscitation (Red)
        </button>

        <button
          onClick={() => setFilter('URGENT')}
          className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
            filter === 'URGENT'
              ? 'bg-amber-500 text-slate-950 font-bold'
              : 'text-amber-400 hover:bg-amber-950/40'
          }`}
        >
          Urgent (Orange / Yellow)
        </button>

        <button
          onClick={() => setFilter('AMBULATORY')}
          className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
            filter === 'AMBULATORY'
              ? 'bg-emerald-600 text-white'
              : 'text-emerald-400 hover:bg-emerald-950/40'
          }`}
        >
          Ambulatory (Green / Blue)
        </button>

        <button
          onClick={() => setFilter('RESOLVED')}
          className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
            filter === 'RESOLVED' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Discharged / Completed ({emergencyCases.filter((c) => !c.isActive).length})
        </button>
      </div>

      {/* Emergency Cases List */}
      <div className="space-y-3">
        {filteredCases.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/50 border border-slate-800 rounded-lg text-slate-400 text-xs">
            No emergency cases matching this filter in the current facility queue.
          </div>
        ) : (
          filteredCases.map((c) => {
            const pat = patients.find((p) => p.id === c.patientId);
            const caseAcuity: EmergencyAcuity =
              c.acuity ||
              (c.triageCategory === 'RED_RESUSCITATION'
                ? 'RESUSCITATION_RED'
                : c.triageCategory === 'YELLOW_URGENT'
                ? 'URGENT_YELLOW'
                : 'LESS_URGENT_GREEN');

            const isRed = caseAcuity === 'RESUSCITATION_RED';
            const isOrange = caseAcuity === 'EMERGENT_ORANGE';
            const isYellow = caseAcuity === 'URGENT_YELLOW';
            const display = triageClassificationService.getDisplay(caseAcuity);

            const caseReassessments = reassessments.filter((r) => r.emergencyCaseId === c.id);

            return (
              <div
                key={c.id}
                id={`card-emergency-${c.id}`}
                className={`rounded-lg p-4 border text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all ${
                  c.isActive
                    ? isRed
                      ? 'bg-red-950/25 border-red-800/80 shadow-md ring-1 ring-red-700/50'
                      : isOrange
                      ? 'bg-orange-950/20 border-orange-800/80'
                      : isYellow
                      ? 'bg-amber-950/20 border-amber-800/80'
                      : 'bg-slate-900 border-slate-800'
                    : 'bg-slate-900/50 border-slate-800/60 opacity-60'
                }`}
              >
                <div className="space-y-2 max-w-3xl">
                  {/* Top line: Acuity Badge + Emergency Number + Patient */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded font-bold text-xs border ${
                        display.colorBadge
                      } ${isRed ? 'animate-pulse' : ''}`}
                    >
                      {display.label}
                    </span>

                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-teal-300 font-semibold tracking-wider">
                      {c.emergencyNumber || c.id}
                    </span>

                    <span className="font-bold text-white text-sm">
                      {pat ? `${pat.firstName} ${pat.lastName}` : c.provisionalPatientName || 'Unidentified Patient'}
                    </span>

                    {pat && <span className="text-teal-400 font-mono text-[11px]">({pat.mrn})</span>}

                    <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {new Date(c.arrivalAt || c.arrivalTime || 0).toLocaleTimeString()}
                    </span>

                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                      {c.status}
                    </span>
                  </div>

                  {/* Chief Complaint */}
                  <p className="text-slate-100 font-medium text-xs leading-relaxed">
                    {c.chiefComplaint}
                  </p>

                  {/* Physical ABC & Vitals Flags */}
                  {c.airwayBreathingCirculation && (
                    <div className="flex flex-wrap items-center gap-2 text-slate-300 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                        Airway: {c.airwayBreathingCirculation.airwayPatent ? 'Patent' : 'Obstructed'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                        Distress: {c.airwayBreathingCirculation.respiratoryDistress ? 'Present' : 'None'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                        Shock: {c.airwayBreathingCirculation.shockSigns ? 'Signs Detected' : 'None'}
                      </span>
                      {c.airwayBreathingCirculation.glasgowComaScale && (
                        <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-teal-300 font-semibold">
                          GCS: {c.airwayBreathingCirculation.glasgowComaScale}/15
                        </span>
                      )}
                      {c.treatmentArea && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                          Bay: {c.treatmentArea}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Longitudinal Reassessment summaries */}
                  {caseReassessments.length > 0 && (
                    <div className="text-[11px] text-teal-300 font-mono bg-slate-950/60 p-2 rounded border border-slate-800/80">
                      <span className="font-semibold text-teal-200">Latest Reassessment ({caseReassessments.length}): </span>
                      {caseReassessments[0].clinicalChange}
                    </div>
                  )}

                  {/* Disposition info if resolved */}
                  {!c.isActive && c.disposition && (
                    <div className="text-[11px] text-slate-400 font-mono">
                      Disposition: <span className="text-slate-200 font-semibold">{c.disposition}</span>
                      {c.dispositionNotes ? ` - ${c.dispositionNotes}` : ''}
                    </div>
                  )}
                </div>

                {/* Right Side Actions */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
                  {c.isActive ? (
                    <>
                      {can('emergency:reassess') && (
                        <button
                          id={`btn-reassess-${c.id}`}
                          onClick={() => setActiveCaseForReassess(c)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-medium text-xs flex items-center gap-1 transition-colors"
                        >
                          <Stethoscope className="w-3.5 h-3.5" /> Reassess
                        </button>
                      )}

                      {can('emergency:disposition') && (
                        <button
                          id={`btn-disposition-${c.id}`}
                          onClick={() => setActiveCaseForDisposition(c)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-medium text-xs flex items-center gap-1 transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Disposition
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      Case Completed
                    </span>
                  )}

                  {c.patientId && (
                    <button
                      id={`btn-chart-${c.id}`}
                      onClick={() => onSelectPatient(c.patientId!)}
                      className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-xs flex items-center gap-1 transition-colors"
                    >
                      <User className="w-3.5 h-3.5" /> Chart
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
