/**
 * Jano Health - Patient Chart & Central Clinical Workspace
 * Comprehensive EHR chart workspace displaying demographics, vital sign trends,
 * SOAP encounters, diagnoses, medications, lab orders, and Jano AI decision support.
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cpu,
  FilePlus,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  Lock,
  Pill,
  Plus,
  Radio,
  Send,
  Shield,
  Sparkles,
  Stethoscope,
  User,
  WifiOff,
  X,
  GitMerge,
  Hospital,
  CreditCard,
  Users,
} from 'lucide-react';
import {
  Allergy,
  ClinicalNote,
  Diagnosis,
  Encounter,
  LaboratoryOrder,
  LaboratoryResult,
  Medication,
  Patient,
  RadiologyOrder,
  RadiologyResult,
  VitalSign,
} from '../../domain/types';
import { calculateAge } from '../../domain/clinicalUtils';
import { localDb } from '../../services/storage/localDatabase';
import { syncEngine } from '../../services/sync/syncEngine';
import { auditService } from '../../services/audit/auditService';
import { laboratoryWorkflowService } from '../../services/clinical/laboratoryWorkflowService';
import { useAuth } from '../../services/security/authContext';
import { AIClinicalResponse, janoAI } from '../../services/ai/janoAIService';
import { PatientDemographicsTab } from './PatientDemographicsTab';
import { PatientTimelineTab } from './PatientTimelineTab';
import { PatientMergeTab } from './PatientMergeTab';
import { ClinicalAssessmentTab } from './ClinicalAssessmentTab';
import { MedicationPrescriptionTab } from './MedicationPrescriptionTab';
import { ReferralHistoryTab } from './ReferralHistoryTab';
import { IdentityConsentTab } from './IdentityConsentTab';
import { CoverageFinancingTab } from './CoverageFinancingTab';
import { CareTeamWorkforceTab } from './CareTeamWorkforceTab';

interface PatientChartModalProps {
  patientId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onPatientUpdated?: () => void;
  onSelectPatient?: (patientId: string) => void;
}

type ChartTab =
  | 'summary'
  | 'demographics'
  | 'timeline'
  | 'notes'
  | 'diagnoses'
  | 'medications'
  | 'investigations'
  | 'referrals'
  | 'merge'
  | 'identity_consent'
  | 'coverage_financing'
  | 'care_team'
  | 'ai_assistant';

export const PatientChartModal: React.FC<PatientChartModalProps> = ({
  patientId,
  isOpen,
  onClose,
  onPatientUpdated,
  onSelectPatient,
}) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [activeTab, setActiveTab] = useState<ChartTab>('summary');

  // RBAC Permission Denial Dialog State
  const [authDenial, setAuthDenial] = useState<{
    capability: string;
    actionTitle: string;
    reason: string;
  } | null>(null);

  const executeOrDeny = (
    capability: string,
    actionTitle: string,
    reason: string,
    onAuthorized: () => void
  ) => {
    const currentPatient = patientId ? localDb.getPatientById(patientId) : null;
    if (currentPatient?.patientStatus === 'MERGED') {
      setAuthDenial({
        capability,
        actionTitle,
        reason: 'This patient record has been merged into a surviving chart and retired. New clinical documentation must be recorded on the surviving patient chart.',
      });
      return;
    }

    if (can(capability)) {
      onAuthorized();
    } else {
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'UNAUTHORIZED_ACTION_ATTEMPTED',
        'PatientChart',
        patientId || 'unknown',
        {
          requiredCapability: capability,
          attemptedAction: actionTitle,
          userRole: currentUser.role,
          reason,
        }
      );

      setAuthDenial({
        capability,
        actionTitle,
        reason,
      });
    }
  };

  // Interactive Form States
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showPrescriptionForm, setShowPrescriptionForm] = useState(false);
  const [showDiagnosisForm, setShowDiagnosisForm] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);

  // Vitals Input state
  const [vitalsInput, setVitalsInput] = useState({
    systolicBp: '',
    diastolicBp: '',
    heartRate: '',
    temperature: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weightKg: '',
  });

  // Clinical Note Input state
  const [noteInput, setNoteInput] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  });

  // Prescription Input state
  const [medInput, setMedInput] = useState({
    name: '',
    genericName: '',
    dosage: '',
    route: 'oral' as Medication['route'],
    frequency: 'TID',
    durationDays: 5,
    instructions: '',
  });

  // Diagnosis Input state
  const [dxInput, setDxInput] = useState({
    code: '',
    description: '',
    type: 'working' as Diagnosis['type'],
    status: 'active' as Diagnosis['status'],
  });

  // Lab Order Input state
  const [labInput, setLabInput] = useState({
    testName: '',
    category: 'parasitology' as LaboratoryOrder['category'],
    urgency: 'urgent' as LaboratoryOrder['urgency'],
  });

  // Radiology Order Input state
  const [showRadForm, setShowRadForm] = useState(false);
  const [radInput, setRadInput] = useState({
    modality: 'xray' as RadiologyOrder['modality'],
    bodySite: 'Chest (PA/Lateral)',
    clinicalIndication: '',
    urgency: 'routine' as RadiologyOrder['urgency'],
  });

  // Lab Result entry inline state
  const [activeLabResultOrderId, setActiveLabResultOrderId] = useState<string | null>(null);
  const [labResultInput, setLabResultInput] = useState({
    parameterName: '',
    value: '',
    referenceRange: '',
    criticalAlert: false,
    technicianNotes: '',
  });

  // Radiology Result entry inline state
  const [activeRadResultOrderId, setActiveRadResultOrderId] = useState<string | null>(null);
  const [radResultInput, setRadResultInput] = useState({
    findings: '',
    impression: '',
  });

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIClinicalResponse | null>(null);
  const [aiTask, setAiTask] = useState<
    'chart_summary' | 'differential' | 'risk_flags' | 'documentation' | 'patient_education' | 'clinical_qa'
  >('chart_summary');
  const [aiCustomQuery, setAiCustomQuery] = useState('');
  const [clinicianReviewedAction, setClinicianReviewedAction] = useState<'accepted' | 'modified' | 'rejected' | null>(null);

  if (!isOpen || !patientId) return null;

  const patient = localDb.getPatientById(patientId);
  if (!patient) return null;

  const vitals = localDb.getVitals(patient.id);
  const latestVitals = vitals[0];
  const clinicalNotes = localDb.getClinicalNotes(patient.id);
  const diagnoses = localDb.getDiagnoses(patient.id);
  const medications = localDb.getMedications(patient.id);
  const labOrders = localDb.getLabOrders(patient.id);
  const labSpecimens = localDb.getLabSpecimens(undefined, patient.id);
  const labResults = localDb.getLabResults(patient.id);
  const radOrders = localDb.getRadiologyOrders(patient.id);
  const radResults = localDb.getRadiologyResults(patient.id);
  const allergies = localDb.getAllergies(patient.id);
  const encounters = localDb.getEncounters(patient.id);
  const patientReferrals = localDb.getReferrals().filter((r) => r.patientId === patient.id);

  // --- Handlers for Recording Data ---

  const handleRecordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('vitals.write')) {
      executeOrDeny(
        'vitals.write',
        'Record Bedside Vitals',
        'Bedside vital signs measurement must be conducted by triage personnel, nursing staff, or attending clinicians.',
        () => {}
      );
      return;
    }

    const newVital: VitalSign = {
      id: 'vit-' + Date.now(),
      patientId: patient.id,
      recordedById: currentUser.id,
      recordedAt: new Date().toISOString(),
      systolicBp: vitalsInput.systolicBp ? Number(vitalsInput.systolicBp) : undefined,
      diastolicBp: vitalsInput.diastolicBp ? Number(vitalsInput.diastolicBp) : undefined,
      heartRate: vitalsInput.heartRate ? Number(vitalsInput.heartRate) : undefined,
      temperature: vitalsInput.temperature ? Number(vitalsInput.temperature) : undefined,
      respiratoryRate: vitalsInput.respiratoryRate ? Number(vitalsInput.respiratoryRate) : undefined,
      oxygenSaturation: vitalsInput.oxygenSaturation ? Number(vitalsInput.oxygenSaturation) : undefined,
      weightKg: vitalsInput.weightKg ? Number(vitalsInput.weightKg) : undefined,
    };

    try {
      await localDb.saveVital(newVital);
      syncEngine.enqueue('VITAL_SIGN_RECORDED', 'VitalSign', newVital.id, { vital: newVital });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'VITAL_SIGN_RECORDED',
        'VitalSign',
        newVital.id,
        { bp: `${newVital.systolicBp}/${newVital.diastolicBp}`, hr: newVital.heartRate, temp: newVital.temperature }
      );

      setShowVitalsForm(false);
      setVitalsInput({ systolicBp: '', diastolicBp: '', heartRate: '', temperature: '', respiratoryRate: '', oxygenSaturation: '', weightKg: '' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save vital signs:', err);
    }
  };

  const handleRecordNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('encounter.write')) {
      executeOrDeny(
        'encounter.write',
        'Write Clinical SOAP Note',
        'Clinical SOAP progress note documentation requires attending clinician or nurse authorization.',
        () => {}
      );
      return;
    }
    if (!noteInput.assessment.trim()) return;

    const newNote: ClinicalNote = {
      id: 'note-' + Date.now(),
      encounterId: encounters[0]?.id || 'enc-walk-in',
      patientId: patient.id,
      authorId: currentUser.id,
      subjective: noteInput.subjective,
      objective: noteInput.objective,
      assessment: noteInput.assessment,
      plan: noteInput.plan,
      recordedAt: new Date().toISOString(),
    };

    try {
      await localDb.saveClinicalNote(newNote);
      syncEngine.enqueue('ENCOUNTER_UPDATED', 'ClinicalNote', newNote.id, { note: newNote });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'RECORDED_SOAP_NOTE',
        'ClinicalNote',
        newNote.id,
        { assessmentSnippet: newNote.assessment.substring(0, 50) }
      );

      setShowNoteForm(false);
      setNoteInput({ subjective: '', objective: '', assessment: '', plan: '' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save clinical note:', err);
    }
  };

  const handleRecordMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('medication.prescribe')) {
      executeOrDeny(
        'medication.prescribe',
        'Prescribe Medication Regimen',
        'Nurse, pharmacy, and administrative roles cannot independently prescribe medications. Prescriptions require physician or authorized clinical officer signature according to national clinical guidelines.',
        () => {}
      );
      return;
    }
    if (!medInput.name.trim()) return;

    const newMed: Medication = {
      id: 'med-' + Date.now(),
      patientId: patient.id,
      name: medInput.name.trim(),
      genericName: medInput.genericName.trim() || medInput.name.trim(),
      dosage: medInput.dosage.trim(),
      route: medInput.route,
      frequency: medInput.frequency.trim(),
      durationDays: Number(medInput.durationDays) || 5,
      startDate: new Date().toISOString().split('T')[0],
      prescribedById: currentUser.id,
      dispensedStatus: 'pending',
      instructions: medInput.instructions.trim(),
    };

    try {
      await localDb.saveMedication(newMed);
      syncEngine.enqueue('MEDICATION_RECORDED', 'Medication', newMed.id, { medication: newMed });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'PRESCRIBED_MEDICATION',
        'Medication',
        newMed.id,
        { drug: newMed.name, dose: newMed.dosage }
      );

      setShowPrescriptionForm(false);
      setMedInput({ name: '', genericName: '', dosage: '', route: 'oral', frequency: 'TID', durationDays: 5, instructions: '' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save medication:', err);
    }
  };

  const handleDispenseMedication = async (medId: string) => {
    if (!can('medication.dispense')) {
      executeOrDeny(
        'medication.dispense',
        'Dispense Prescription',
        'Dispensing medications and updating pharmacy inventory requires a licensed pharmacist or pharmacy technician.',
        () => {}
      );
      return;
    }

    const med = medications.find((m) => m.id === medId);
    if (!med) return;

    const updatedMed: Medication = { ...med, dispensedStatus: 'dispensed' };
    try {
      await localDb.saveMedication(updatedMed);
      syncEngine.enqueue('MEDICATION_RECORDED', 'Medication', updatedMed.id, { medication: updatedMed });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'DISPENSED_MEDICATION',
        'Medication',
        updatedMed.id,
        { drug: updatedMed.name }
      );
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to update dispensed medication:', err);
    }
  };

  const handleRecordDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('diagnosis.write')) {
      executeOrDeny(
        'diagnosis.write',
        'Record Clinical Diagnosis',
        'Clinical diagnosis and master problem list maintenance requires licensed physician or clinical supervisor authorization.',
        () => {}
      );
      return;
    }
    if (!dxInput.description.trim()) return;

    const newDx: Diagnosis = {
      id: 'dx-' + Date.now(),
      patientId: patient.id,
      code: dxInput.code.trim() || 'ICD-UNSPEC',
      description: dxInput.description.trim(),
      type: dxInput.type,
      status: dxInput.status,
      diagnosedById: currentUser.id,
      recordedAt: new Date().toISOString(),
    };

    try {
      await localDb.saveDiagnosis(newDx);
      syncEngine.enqueue('DIAGNOSIS_RECORDED', 'Diagnosis', newDx.id, { diagnosis: newDx });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'RECORDED_DIAGNOSIS',
        'Diagnosis',
        newDx.id,
        { code: newDx.code, description: newDx.description }
      );

      setShowDiagnosisForm(false);
      setDxInput({ code: '', description: '', type: 'working', status: 'active' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save diagnosis:', err);
    }
  };

  const handleOrderLab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('lab:order')) {
      executeOrDeny(
        'lab:order',
        'Order Laboratory Diagnostic Test',
        'Diagnostic laboratory requisitions must be requested by a physician or authorized health officer.',
        () => {}
      );
      return;
    }
    if (!labInput.testName.trim()) return;

    try {
      await laboratoryWorkflowService.orderLabTests(
        {
          patientId: patient.id,
          testName: labInput.testName.trim(),
          category: labInput.category,
          priority: (labInput.urgency as any) || 'routine',
        },
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        }
      );
      setShowLabForm(false);
      setLabInput({ testName: '', category: 'parasitology', urgency: 'urgent' });
      onPatientUpdated?.();
    } catch (err: any) {
      console.error('Failed to order lab:', err);
    }
  };

  const handleRecordLabResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('lab:result_entry')) {
      executeOrDeny(
        'lab:result_entry',
        'Enter Laboratory Findings',
        'Recording and validating laboratory test findings requires medical laboratory scientist or technician authorization.',
        () => {}
      );
      return;
    }
    if (!activeLabResultOrderId || !labResultInput.value.trim()) return;

    try {
      const activeOrd = labOrders.find((o) => o.id === activeLabResultOrderId);
      const activeSpec = labSpecimens.find((s) => s.orderId === activeLabResultOrderId);
      await laboratoryWorkflowService.enterPreliminaryResult(
        {
          orderId: activeLabResultOrderId,
          patientId: patient.id,
          specimenId: activeSpec?.id,
          testName: labResultInput.parameterName.trim() || activeOrd?.testName || 'Laboratory Finding',
          value: labResultInput.value.trim(),
          referenceRange: labResultInput.referenceRange.trim() || 'Normal',
          criticalFlag: labResultInput.criticalAlert,
          abnormalFlag: labResultInput.criticalAlert ? 'CRITICAL' : 'NORMAL',
          technicianNotes: labResultInput.technicianNotes.trim() || undefined,
        },
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        }
      );
      setActiveLabResultOrderId(null);
      setLabResultInput({ parameterName: '', value: '', referenceRange: '', criticalAlert: false, technicianNotes: '' });
      onPatientUpdated?.();
    } catch (err: any) {
      console.error('Failed to enter lab result:', err);
    }
  };

  const handleAcknowledgeCriticalLabResult = async (resultId: string) => {
    if (!can('lab:critical_acknowledge')) {
      executeOrDeny(
        'lab:critical_acknowledge',
        'Acknowledge Critical Panic Value',
        'Acknowledging life-threatening critical laboratory values requires licensed physician or authorized clinical health officer sign-off.',
        () => {}
      );
      return;
    }

    const action = window.prompt(
      'Document clinical escalation action taken for this critical panic value (e.g., IV Artesunate started, ICU admission requested):'
    );
    if (!action || !action.trim()) return;

    try {
      await laboratoryWorkflowService.acknowledgeCriticalResult(
        {
          resultId,
          clinicalActionTaken: action.trim(),
        },
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        }
      );
      onPatientUpdated?.();
    } catch (err: any) {
      console.error('Failed to acknowledge critical result:', err);
    }
  };

  const handleOrderRadiology = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('radiology.order')) {
      executeOrDeny(
        'radiology.order',
        'Order Imaging Study',
        'Ordering diagnostic imaging and ultrasound studies requires licensed physician or authorized clinical health officer authorization.',
        () => {}
      );
      return;
    }
    if (!radInput.clinicalIndication.trim()) return;

    const newRad: RadiologyOrder = {
      id: 'rad-ord-' + Date.now(),
      patientId: patient.id,
      orderedById: currentUser.id,
      modality: radInput.modality,
      bodySite: radInput.bodySite.trim(),
      clinicalIndication: radInput.clinicalIndication.trim(),
      urgency: radInput.urgency,
      orderedAt: new Date().toISOString(),
      status: 'ordered',
    };

    try {
      await localDb.saveRadiologyOrder(newRad);
      syncEngine.enqueue('RADIOLOGY_ORDER_CREATED', 'RadiologyOrder', newRad.id, { radiologyOrder: newRad });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'ORDERED_RADIOLOGY_STUDY',
        'RadiologyOrder',
        newRad.id,
        { modality: newRad.modality, bodySite: newRad.bodySite }
      );

      setShowRadForm(false);
      setRadInput({ modality: 'xray', bodySite: 'Chest (PA/Lateral)', clinicalIndication: '', urgency: 'routine' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save radiology order:', err);
    }
  };

  const handleRecordRadiologyResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can('radiology.result.write')) {
      executeOrDeny(
        'radiology.result.write',
        'Record Radiology Findings',
        'Filing and signing radiological interpretations requires licensed radiology staff.',
        () => {}
      );
      return;
    }
    if (!activeRadResultOrderId || !radResultInput.impression.trim()) return;

    const newResult: RadiologyResult = {
      id: 'rad-res-' + Date.now(),
      orderId: activeRadResultOrderId,
      patientId: patient.id,
      findings: radResultInput.findings.trim() || 'Imaging completed according to protocol.',
      impression: radResultInput.impression.trim(),
      radiologistId: currentUser.id,
      completedAt: new Date().toISOString(),
    };

    try {
      await localDb.saveRadiologyResult(newResult);
      const existingOrd = radOrders.find((o) => o.id === activeRadResultOrderId);
      if (existingOrd) {
        await localDb.saveRadiologyOrder({ ...existingOrd, status: 'reported' });
      }
      syncEngine.enqueue('RADIOLOGY_RESULT_RECORDED', 'RadiologyResult', newResult.id, { radiologyResult: newResult });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'RECORDED_RADIOLOGY_REPORT',
        'RadiologyResult',
        newResult.id,
        { impressionSnippet: newResult.impression.substring(0, 50) }
      );

      setActiveRadResultOrderId(null);
      setRadResultInput({ findings: '', impression: '' });
      onPatientUpdated?.();
    } catch (err) {
      console.error('Failed to save radiology result:', err);
    }
  };

  // --- Jano AI CDS Invocation ---
  const runJanoAI = async (overrideTask?: typeof aiTask) => {
    const task = overrideTask || aiTask;
    setAiLoading(true);
    setClinicianReviewedAction(null);

    try {
      const response = await janoAI.requestDecisionSupport(
        task,
        patient,
        aiCustomQuery || encounters[0]?.chiefComplaint || 'Comprehensive chart analysis',
        {
          recentVitals: latestVitals,
          activeMeds: medications.map((m) => m.name),
          allergies: allergies.map((a) => `${a.allergen} (${a.severity})`),
          diagnoses: diagnoses.map((d) => d.description),
        }
      );
      setAiResponse(response);
    } catch (err) {
      console.error('AI invocation error', err);
    } finally {
      setAiLoading(false);
    }
  };

  const recordClinicianAction = (action: 'accepted' | 'modified' | 'rejected') => {
    setClinicianReviewedAction(action);
    if (aiResponse) {
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'AI_DECISION_SUPPORT_REVIEWED',
        'AIRequest',
        aiResponse.requestId,
        { action, taskType: aiResponse.taskType }
      );
    }
  };

  const derivedAge = calculateAge(patient.dateOfBirth, patient.dateOfBirthPrecision);
  const isMerged = patient.patientStatus === 'MERGED';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-5xl h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Top Header / Master Banner */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-600/20 border border-teal-500/40 flex items-center justify-center font-bold text-teal-300">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-white">
                  {patient.givenName || patient.firstName} {patient.middleName ? patient.middleName + ' ' : ''}{patient.familyName || patient.lastName}
                  {patient.preferredName && (
                    <span className="text-slate-400 font-normal text-xs ml-1">("{patient.preferredName}")</span>
                  )}
                </h1>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                  MRN: {patient.mrn}
                </span>
                {patient.nationalId && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
                    NIDA: {patient.nationalId}
                  </span>
                )}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                    patient.triageUrgency === 'emergency'
                      ? 'bg-red-950 text-red-300 border border-red-800'
                      : patient.triageUrgency === 'urgent'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {patient.triageUrgency}
                </span>

                {isMerged ? (
                  <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                    <GitMerge className="w-3 h-3" /> MERGED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                    {patient.patientStatus || 'ACTIVE'}
                  </span>
                )}

                {patient.syncStatus === 'LOCAL_ONLY' && (
                  <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                    <WifiOff className="w-2.5 h-2.5" /> Local
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Age: <strong className="text-teal-400 font-mono">{derivedAge}</strong> (DOB: {patient.dateOfBirth} • {patient.dateOfBirthPrecision || 'EXACT'}) • {(patient.sex || patient.gender).toUpperCase()} • Blood: {patient.bloodGroup || 'Unknown'} • Locality: {patient.villageTown}, {patient.district}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Allergy Alert Banner in Header */}
            {patient.allergiesSummary && patient.allergiesSummary.length > 0 && (
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-950/50 border border-red-800/80 text-red-300 text-xs font-mono font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span>Allergies: {patient.allergiesSummary.join(', ')}</span>
              </div>
            )}

            {/* Pregnancy Status Badge */}
            {(patient.sex === 'female' || patient.gender === 'female') && patient.pregnancyStatus === 'pregnant' && (
              <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded bg-pink-950/60 border border-pink-800 text-pink-300 text-xs font-medium">
                <span>ANC: Pregnant</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Retired Duplicate Alert Banner */}
        {isMerged && (
          <div className="bg-amber-950/80 border-b border-amber-800/90 px-4 py-2 flex items-center justify-between gap-3 text-amber-200 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>RETIRED DUPLICATE RECORD:</strong> This chart was merged into surviving patient record{' '}
                <strong className="font-mono text-white">
                  {patient.mergedIntoPatientId}
                </strong>
                {patient.mergedAt && ` on ${new Date(patient.mergedAt).toLocaleDateString()}`}. New clinical documentation is locked.
              </span>
            </div>
            {patient.mergedIntoPatientId && onSelectPatient && (
              <button
                onClick={() => onSelectPatient(patient.mergedIntoPatientId!)}
                className="px-2.5 py-1 rounded bg-amber-800 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors shrink-0"
              >
                View Surviving Chart →
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none">
          {[
            { id: 'summary', label: 'Summary & Vitals', icon: Activity },
            { id: 'demographics', label: 'Demographics & IDs', icon: User },
            { id: 'timeline', label: 'Longitudinal Timeline', icon: History, badge: 'Audit' },
            { id: 'notes', label: 'Clinical Notes (SOAP)', icon: ClipboardList, count: clinicalNotes.length },
            { id: 'diagnoses', label: 'Diagnoses / Problems', icon: Stethoscope, count: diagnoses.length },
            { id: 'medications', label: 'Medications', icon: Pill, count: medications.length },
            { id: 'investigations', label: 'Labs & Imaging', icon: FlaskConical, count: labOrders.length + radOrders.length },
            { id: 'referrals', label: 'Referrals & Transfers', icon: Hospital, count: patientReferrals.length },
            { id: 'merge', label: 'Merge & Reconciliation', icon: GitMerge, badge: isMerged ? 'Merged' : undefined },
            { id: 'identity_consent', label: 'Identity & Consent', icon: Shield, badge: 'V15' },
            { id: 'coverage_financing', label: 'Coverage & Financing', icon: CreditCard },
            { id: 'care_team', label: 'Care Team & Operations', icon: Users, badge: 'V16' },
            { id: 'ai_assistant', label: 'Jano AI (CDS)', icon: Cpu, badge: 'AI Assist' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ChartTab)}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all shrink-0 ${
                  isActive
                    ? 'border-teal-500 text-teal-300 bg-teal-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 font-mono text-slate-300">
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-900 text-teal-300 font-mono font-semibold">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60">
          {/* TAB 1: SUMMARY & VITALS */}
          {activeTab === 'summary' && (
            <div className="space-y-6 text-xs">
              {/* Vitals Ribbon */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HeartPulse className="w-4 h-4 text-rose-400" />
                    <h3 className="text-sm font-semibold text-white">Latest Physiological Vitals</h3>
                    {latestVitals && (
                      <span className="text-slate-400 text-[11px] font-mono">
                        (Recorded {new Date(latestVitals.recordedAt).toLocaleString()})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      executeOrDeny(
                        'vitals:record',
                        'Record Bedside Vitals',
                        'Bedside vital signs measurement must be conducted by triage personnel, nursing staff, or attending clinicians.',
                        () => setShowVitalsForm(!showVitalsForm)
                      );
                    }}
                    className={`px-2.5 py-1 rounded text-white font-medium flex items-center gap-1.5 cursor-pointer ${
                      can('vitals:record')
                        ? 'bg-teal-600 hover:bg-teal-500'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {!can('vitals:record') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                    <Plus className="w-3.5 h-3.5" /> Record Vitals
                  </button>
                </div>

                {/* Vitals Form Inline */}
                {showVitalsForm && (
                  <form
                    onSubmit={handleRecordVitals}
                    className="mb-4 p-3 bg-slate-950 rounded border border-teal-800/60 space-y-3"
                  >
                    <h4 className="font-semibold text-teal-300">Record Bedside Vital Signs</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400">Systolic BP</label>
                        <input
                          type="number"
                          placeholder="120"
                          value={vitalsInput.systolicBp}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, systolicBp: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Diastolic BP</label>
                        <input
                          type="number"
                          placeholder="80"
                          value={vitalsInput.diastolicBp}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, diastolicBp: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Heart Rate (BPM)</label>
                        <input
                          type="number"
                          placeholder="72"
                          value={vitalsInput.heartRate}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, heartRate: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Temp (°C)</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="37.0"
                          value={vitalsInput.temperature}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, temperature: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Resp Rate (/min)</label>
                        <input
                          type="number"
                          placeholder="18"
                          value={vitalsInput.respiratoryRate}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, respiratoryRate: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">SpO2 (%)</label>
                        <input
                          type="number"
                          placeholder="98"
                          value={vitalsInput.oxygenSaturation}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, oxygenSaturation: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400">Weight (kg)</label>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="65"
                          value={vitalsInput.weightKg}
                          onChange={(e) => setVitalsInput({ ...vitalsInput, weightKg: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowVitalsForm(false)}
                        className="px-2.5 py-1 rounded text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                      >
                        Save Vitals
                      </button>
                    </div>
                  </form>
                )}

                {/* Vitals Display Grid */}
                {latestVitals ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Blood Pressure</span>
                      <div className="text-lg font-bold font-mono text-white mt-0.5">
                        {latestVitals.systolicBp}/{latestVitals.diastolicBp}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">mmHg</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Pulse / Heart Rate</span>
                      <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                        {latestVitals.heartRate}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">BPM</span>
                      </div>
                    </div>
                    <div
                      className={`p-2.5 rounded border ${
                        (latestVitals.temperature || 0) >= 38.5
                          ? 'bg-rose-950/30 border-rose-800/80 text-rose-300'
                          : 'bg-slate-950/80 border-slate-800 text-slate-100'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400">Core Temp</span>
                      <div className="text-lg font-bold font-mono mt-0.5">
                        {latestVitals.temperature}°C
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Resp Rate</span>
                      <div className="text-lg font-bold font-mono text-white mt-0.5">
                        {latestVitals.respiratoryRate}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">/min</span>
                      </div>
                    </div>
                    <div
                      className={`p-2.5 rounded border ${
                        (latestVitals.oxygenSaturation || 100) < 94
                          ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                          : 'bg-slate-950/80 border-slate-800 text-teal-300'
                      }`}
                    >
                      <span className="text-[11px] text-slate-400">Oxygen Saturation</span>
                      <div className="text-lg font-bold font-mono mt-0.5">
                        {latestVitals.oxygenSaturation}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Weight</span>
                      <div className="text-lg font-bold font-mono text-white mt-0.5">
                        {latestVitals.weightKg}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">kg</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 italic">No vital signs recorded yet for this patient.</p>
                )}
              </div>

              {/* 2-Column Clinical Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Active Problems / Diagnoses */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-teal-400" />
                      Active Diagnoses & Problems
                    </h3>
                    <button
                      onClick={() => setActiveTab('diagnoses')}
                      className="text-xs text-teal-400 hover:underline"
                    >
                      Manage
                    </button>
                  </div>

                  <div className="space-y-2">
                    {diagnoses.length > 0 ? (
                      diagnoses.map((dx) => (
                        <div
                          key={dx.id}
                          className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold text-slate-100">{dx.description}</span>
                            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                              Code: {dx.code} • Status: {dx.status.toUpperCase()} ({dx.type})
                            </div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 font-mono uppercase">
                            {dx.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic">No active diagnoses recorded.</p>
                    )}
                  </div>
                </div>

                {/* Active Medications */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Pill className="w-4 h-4 text-blue-400" />
                      Current Prescription Regimen
                    </h3>
                    <button
                      onClick={() => setActiveTab('medications')}
                      className="text-xs text-teal-400 hover:underline"
                    >
                      Manage
                    </button>
                  </div>

                  <div className="space-y-2">
                    {medications.length > 0 ? (
                      medications.map((m) => (
                        <div
                          key={m.id}
                          className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start justify-between gap-2"
                        >
                          <div>
                            <span className="font-semibold text-slate-100">{m.name}</span>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {m.dosage} • {m.frequency} ({m.route}) for {m.durationDays} days
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                              m.dispensedStatus === 'dispensed'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {m.dispensedStatus}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 italic">No active medications prescribed.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick AI Chart Review Callout */}
              <div className="p-4 rounded-lg bg-teal-950/30 border border-teal-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-teal-600/30 flex items-center justify-center text-teal-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-200">Jano AI Chart Synthesis Available</h4>
                    <p className="text-[11px] text-slate-400">
                      Generate structured clinical briefing, danger flags, and plain-language patient education.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    executeOrDeny(
                      'ai:consult',
                      'Consult Jano Clinical AI',
                      'AI clinical decision support is restricted to healthcare clinicians and clinical supervisors for diagnostic safety governance.',
                      () => {
                        setActiveTab('ai_assistant');
                        runJanoAI('chart_summary');
                      }
                    );
                  }}
                  className={`px-3 py-1.5 rounded text-white font-medium text-xs flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    can('ai:consult')
                      ? 'bg-teal-600 hover:bg-teal-500'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                  }`}
                >
                  {!can('ai:consult') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  <Cpu className="w-3.5 h-3.5" /> Synthesize Chart with AI
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CLINICAL NOTES (SOAP) */}
          {activeTab === 'notes' && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">SOAP Clinical Encounters & Progress Notes</h3>
                  <p className="text-slate-400 text-[11px]">Structured clinical history and physical findings</p>
                </div>

                <button
                  onClick={() => {
                    executeOrDeny(
                      'clinical:notes_write',
                      'Author Clinical SOAP Progress Note',
                      'Progress notes and official encounter documentation must be recorded by licensed physicians, health officers, or clinical supervisors.',
                      () => setShowNoteForm(!showNoteForm)
                    );
                  }}
                  className={`px-3 py-1.5 rounded text-white font-semibold flex items-center gap-1.5 cursor-pointer ${
                    can('clinical:notes_write')
                      ? 'bg-teal-600 hover:bg-teal-500'
                      : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                  }`}
                >
                  {!can('clinical:notes_write') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  <FilePlus className="w-3.5 h-3.5" /> Add New SOAP Note
                </button>
              </div>

              {/* Record SOAP Form */}
              {showNoteForm && (
                <form
                  onSubmit={handleRecordNote}
                  className="p-4 bg-slate-900 border border-teal-800/70 rounded-lg space-y-3"
                >
                  <h4 className="font-semibold text-teal-300 text-sm">New Encounter SOAP Documentation</h4>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">S - Subjective (History of Present Illness, Symptoms)</label>
                    <textarea
                      rows={2}
                      placeholder="Patient reports onset of..."
                      value={noteInput.subjective}
                      onChange={(e) => setNoteInput({ ...noteInput, subjective: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">O - Objective (Physical Exam, Vitals, Bedside Tests)</label>
                    <textarea
                      rows={2}
                      placeholder="On examination: Alert, febrile, chest clear..."
                      value={noteInput.objective}
                      onChange={(e) => setNoteInput({ ...noteInput, objective: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">A - Assessment (Primary Clinical Impression & Differentials) *</label>
                    <textarea
                      rows={2}
                      required
                      placeholder="1. Severe malaria with anemia..."
                      value={noteInput.assessment}
                      onChange={(e) => setNoteInput({ ...noteInput, assessment: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">P - Plan (Management, Medications, Investigations, Danger Signs)</label>
                    <textarea
                      rows={2}
                      placeholder="1. Initiate Coartem... 2. Recheck vitals..."
                      value={noteInput.plan}
                      onChange={(e) => setNoteInput({ ...noteInput, plan: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowNoteForm(false)}
                      className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                    >
                      Save Progress Note
                    </button>
                  </div>
                </form>
              )}

              {/* Notes Stream */}
              <div className="space-y-3">
                {clinicalNotes.map((note) => (
                  <div key={note.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[11px]">
                      <span className="font-semibold text-teal-300">
                        Recorded: {new Date(note.recordedAt).toLocaleString()}
                      </span>
                      <span className="text-slate-400 font-mono">Author: {note.authorId}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
                        <span className="font-bold text-teal-400 block mb-1">Subjective</span>
                        <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{note.subjective || 'None'}</p>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
                        <span className="font-bold text-teal-400 block mb-1">Objective</span>
                        <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{note.objective || 'None'}</p>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
                        <span className="font-bold text-amber-400 block mb-1">Assessment</span>
                        <p className="text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">{note.assessment}</p>
                      </div>
                      <div className="p-2.5 rounded bg-slate-950/70 border border-slate-800/80">
                        <span className="font-bold text-teal-400 block mb-1">Plan</span>
                        <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{note.plan || 'None'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CLINICAL ASSESSMENT & DIAGNOSES (V3) */}
          {activeTab === 'diagnoses' && (
            <div className="rounded-lg bg-white p-4 text-slate-800 shadow-inner">
              <ClinicalAssessmentTab
                patient={patient}
                encounters={encounters}
                onRefresh={() => {
                  onPatientUpdated?.();
                }}
                onDeny={(capability, actionTitle, reason) => {
                  executeOrDeny(capability, actionTitle, reason, () => {});
                }}
              />
            </div>
          )}

          {/* TAB 4: MEDICATIONS (CLINICAL CORE V6) */}
          {activeTab === 'medications' && (
            <MedicationPrescriptionTab
              patient={patient}
              encounters={encounters}
              onRefresh={() => {
                onPatientUpdated?.();
              }}
              onDeny={(capability, actionTitle, reason) => {
                executeOrDeny(capability as any, actionTitle, reason, () => {});
              }}
            />
          )}

          {/* TAB 5: INVESTIGATIONS (LAB & RADIOLOGY) */}
          {activeTab === 'investigations' && (
            <div className="space-y-6 text-xs">
              {/* Lab Orders & Results */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-purple-400" />
                    Laboratory Diagnostic Orders & Verifications
                  </h3>
                  <button
                    onClick={() => {
                      executeOrDeny(
                        'lab:order',
                        'Order Laboratory Diagnostic Test',
                        'Diagnostic laboratory requisitions must be requested by a physician or authorized health officer.',
                        () => setShowLabForm(!showLabForm)
                      );
                    }}
                    className={`px-2.5 py-1 rounded text-white font-medium flex items-center gap-1.5 cursor-pointer ${
                      can('lab:order')
                        ? 'bg-teal-600 hover:bg-teal-500'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {!can('lab:order') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                    <Plus className="w-3.5 h-3.5" /> Order Lab Test
                  </button>
                </div>

                {showLabForm && (
                  <form
                    onSubmit={handleOrderLab}
                    className="p-3 bg-slate-900 border border-teal-800 rounded-lg space-y-3"
                  >
                    <h4 className="font-semibold text-teal-300">Order Laboratory Test</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Test Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Malaria mRDT, Hemoglobin, HIV Rapid"
                          value={labInput.testName}
                          onChange={(e) => setLabInput({ ...labInput, testName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Category</label>
                        <select
                          value={labInput.category}
                          onChange={(e) => setLabInput({ ...labInput, category: e.target.value as LaboratoryOrder['category'] })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        >
                          <option value="parasitology">Parasitology (Malaria, Stool)</option>
                          <option value="rapid_diagnostic">Rapid Diagnostic Test (mRDT/RPR)</option>
                          <option value="hematology">Hematology (CBC, ESR)</option>
                          <option value="biochemistry">Biochemistry (Electrolytes, Renal)</option>
                          <option value="microbiology">Microbiology (Culture, Gram Stain)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Urgency</label>
                        <select
                          value={labInput.urgency}
                          onChange={(e) => setLabInput({ ...labInput, urgency: e.target.value as LaboratoryOrder['urgency'] })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT / Resuscitation</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLabForm(false)}
                        className="px-2.5 py-1 rounded text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                      >
                        Submit Order
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {labOrders.map((ord) => {
                    const result = labResults.find((r) => r.orderId === ord.id);
                    const specimen = labSpecimens.find((s) => s.orderId === ord.id);
                    const isEnteringResult = activeLabResultOrderId === ord.id;
                    const isCritical = result?.criticalAlert || result?.criticalFlag;
                    const isAcknowledged = result?.criticalAcknowledged;

                    return (
                      <div
                        key={ord.id}
                        className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-100">{ord.testName}</span>
                            {ord.orderNumber && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                                {ord.orderNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                                ord.status === 'completed' || ord.status === 'COMPLETED'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-purple-950 text-purple-300 border border-purple-800'
                              }`}
                            >
                              {ord.status}
                            </span>
                            {ord.status !== 'completed' && ord.status !== 'COMPLETED' && !result && (
                              <button
                                onClick={() => {
                                  executeOrDeny(
                                    'lab:result_entry',
                                    'Enter Laboratory Test Result',
                                    'Entering and signing off laboratory test results requires licensed laboratory personnel authorization.',
                                    () => {
                                      setActiveLabResultOrderId(ord.id);
                                      setLabResultInput({
                                        parameterName: ord.testName,
                                        value: '',
                                        referenceRange: 'Normal / Negative',
                                        criticalAlert: false,
                                        technicianNotes: '',
                                      });
                                    }
                                  );
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
                                  can('lab:result_entry')
                                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
                                }`}
                              >
                                {!can('lab:result_entry') && <Lock className="w-3 h-3 text-slate-400" />}
                                Enter Result
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 flex-wrap">
                          <span>Category: {ord.category}</span>
                          <span>•</span>
                          <span>Urgency: {(ord.priority || ord.urgency).toUpperCase()}</span>
                          <span>•</span>
                          <span>Ordered: {new Date(ord.requestedAt || ord.orderedAt).toLocaleString()}</span>
                        </div>

                        {specimen && (
                          <div className="p-1.5 bg-slate-950 rounded border border-slate-800 text-[11px] flex items-center gap-2 text-slate-300 font-mono">
                            <span className="text-teal-400 font-bold">Accession: {specimen.accessionNumber}</span>
                            <span>•</span>
                            <span>{specimen.specimenType}</span>
                            <span>•</span>
                            <span className="text-slate-400">Status: {specimen.status}</span>
                          </div>
                        )}

                        {/* Inline Lab Result Form */}
                        {isEnteringResult && (
                          <form
                            onSubmit={handleRecordLabResult}
                            className="mt-2 p-3 bg-slate-950 border border-purple-800/80 rounded-md space-y-2.5"
                          >
                            <h5 className="font-semibold text-purple-300 text-xs">Laboratory Finding Verification</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-slate-400 text-[10px] mb-0.5">Parameter / Analyte</label>
                                <input
                                  type="text"
                                  value={labResultInput.parameterName}
                                  onChange={(e) => setLabResultInput({ ...labResultInput, parameterName: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 text-[10px] mb-0.5">Value / Finding *</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. Positive (+++) or 11.2 g/dL"
                                  value={labResultInput.value}
                                  onChange={(e) => setLabResultInput({ ...labResultInput, value: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-slate-400 text-[10px] mb-0.5">Reference Range</label>
                                <input
                                  type="text"
                                  value={labResultInput.referenceRange}
                                  onChange={(e) => setLabResultInput({ ...labResultInput, referenceRange: e.target.value })}
                                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <label className="flex items-center gap-1.5 text-xs text-red-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={labResultInput.criticalAlert}
                                  onChange={(e) => setLabResultInput({ ...labResultInput, criticalAlert: e.target.checked })}
                                  className="rounded border-slate-700 bg-slate-900 text-red-500"
                                />
                                Critical Panic Value Flag
                              </label>
                            </div>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Technician / Scientist Notes</label>
                              <input
                                type="text"
                                placeholder="e.g. Verified on second capillary read"
                                value={labResultInput.technicianNotes}
                                onChange={(e) => setLabResultInput({ ...labResultInput, technicianNotes: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 text-xs"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setActiveLabResultOrderId(null)}
                                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                              >
                                Save Result & Complete
                              </button>
                            </div>
                          </form>
                        )}

                        {result && (
                          <div className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-bold text-teal-300">
                                  Result: {result.parameterName || result.testName} = {result.value} {result.unit && result.unit !== 'N/A' ? result.unit : ''}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Ref Range: {typeof result.referenceRange === 'string' ? result.referenceRange : 'Normal'} • Status: {result.status || 'FINAL'}
                                </div>
                                {result.technicianNotes && (
                                  <p className="text-[11px] text-slate-400 mt-1 italic">Note: {result.technicianNotes}</p>
                                )}
                              </div>
                              {isCritical && (
                                <span className="px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold font-mono text-[10px] flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> CRITICAL ALERT
                                </span>
                              )}
                            </div>

                            {/* Critical Value Acknowledgment Action */}
                            {isCritical && (
                              <div className="p-2 bg-red-950/30 border border-red-900/50 rounded flex items-center justify-between text-xs">
                                {isAcknowledged ? (
                                  <span className="text-emerald-300 text-[11px]">
                                    ✓ Acknowledged by {result.criticalAcknowledgedByName} ({result.criticalAcknowledgementNotes})
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-red-300 text-[11px] font-semibold">
                                      Unacknowledged Panic Value
                                    </span>
                                    <button
                                      onClick={() => handleAcknowledgeCriticalLabResult(result.id)}
                                      className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] cursor-pointer"
                                    >
                                      Acknowledge & Document Action
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Radiology Orders & Reports */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-amber-400" />
                    Radiology & Ultrasound Diagnostic Studies
                  </h3>
                  <button
                    onClick={() => {
                      executeOrDeny(
                        'radiology.order',
                        'Order Imaging Study',
                        'Diagnostic radiology and ultrasound study requisitions require physician or authorized health officer signature.',
                        () => setShowRadForm(!showRadForm)
                      );
                    }}
                    className={`px-2.5 py-1 rounded text-white font-medium flex items-center gap-1.5 cursor-pointer ${
                      can('radiology.order')
                        ? 'bg-amber-600 hover:bg-amber-500'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {!can('radiology.order') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                    <Plus className="w-3.5 h-3.5" /> Order Imaging Study
                  </button>
                </div>

                {showRadForm && (
                  <form
                    onSubmit={handleOrderRadiology}
                    className="p-3 bg-slate-900 border border-amber-800 rounded-lg space-y-3"
                  >
                    <h4 className="font-semibold text-amber-300">Order Radiology / Ultrasound Examination</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Modality</label>
                        <select
                          value={radInput.modality}
                          onChange={(e) => setRadInput({ ...radInput, modality: e.target.value as RadiologyOrder['modality'] })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        >
                          <option value="xray">Plain Radiography (X-Ray)</option>
                          <option value="ultrasound">Ultrasound (Diagnostic Sonography)</option>
                          <option value="ct">Computed Tomography (CT)</option>
                          <option value="mri">Magnetic Resonance Imaging (MRI)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Anatomical Body Site *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Chest (PA), Right Femur, Abdomen"
                          value={radInput.bodySite}
                          onChange={(e) => setRadInput({ ...radInput, bodySite: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Urgency</label>
                        <select
                          value={radInput.urgency}
                          onChange={(e) => setRadInput({ ...radInput, urgency: e.target.value as RadiologyOrder['urgency'] })}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                        >
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">STAT / Immediate Trauma</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Clinical Indication / Suspected Pathology *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Rule out lobar pneumonia, evaluate pleural effusion"
                        value={radInput.clinicalIndication}
                        onChange={(e) => setRadInput({ ...radInput, clinicalIndication: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRadForm(false)}
                        className="px-2.5 py-1 rounded text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                      >
                        Submit Study Order
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-2">
                  {radOrders.map((ro) => {
                    const res = radResults.find((r) => r.orderId === ro.id);
                    const isEnteringReport = activeRadResultOrderId === ro.id;
                    return (
                      <div key={ro.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-100">
                            {ro.modality.toUpperCase()} — {ro.bodySite}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 uppercase font-bold">
                              {ro.status}
                            </span>
                            {ro.status !== 'reported' && !res && (
                              <button
                                onClick={() => {
                                  executeOrDeny(
                                    'radiology.result.write',
                                    'Record Radiology Interpretation',
                                    'Entering diagnostic imaging reports requires licensed radiologist or imaging specialist authorization.',
                                    () => {
                                      setActiveRadResultOrderId(ro.id);
                                      setRadResultInput({ findings: '', impression: '' });
                                    }
                                  );
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
                                  can('radiology.result.write')
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
                                }`}
                              >
                                {!can('radiology.result.write') && <Lock className="w-3 h-3 text-slate-400" />}
                                Record Report
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-400 text-[11px]">Indication: {ro.clinicalIndication}</p>

                        {/* Inline Radiology Report Form */}
                        {isEnteringReport && (
                          <form
                            onSubmit={handleRecordRadiologyResult}
                            className="mt-2 p-3 bg-slate-950 border border-amber-800/80 rounded-md space-y-2.5"
                          >
                            <h5 className="font-semibold text-amber-300 text-xs">Imaging Report & Impression</h5>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Objective Findings</label>
                              <textarea
                                rows={2}
                                placeholder="Describe anatomical structures, consolidation, effusion, bone integrity..."
                                value={radResultInput.findings}
                                onChange={(e) => setRadResultInput({ ...radResultInput, findings: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-100 text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-400 text-[10px] mb-0.5">Radiological Impression / Conclusion *</label>
                              <textarea
                                rows={2}
                                required
                                placeholder="e.g. Right lower lobe pneumonia. No pleural effusion or pneumothorax."
                                value={radResultInput.impression}
                                onChange={(e) => setRadResultInput({ ...radResultInput, impression: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-100 text-xs"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setActiveRadResultOrderId(null)}
                                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="px-3 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                              >
                                Save & Sign Report
                              </button>
                            </div>
                          </form>
                        )}

                        {res && (
                          <div className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 space-y-1">
                            <div className="font-semibold text-slate-200">Radiological Impression:</div>
                            <p className="text-slate-300 text-xs">{res.impression}</p>
                            <div className="text-[10px] text-slate-400">Findings: {res.findings}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB: REFERRALS & CARE COORDINATION */}
          {activeTab === 'referrals' && (
            <ReferralHistoryTab
              patient={patient}
              encounters={encounters}
              onRefresh={() => {
                onPatientUpdated?.();
              }}
            />
          )}

          {/* TAB 6: JANO AI CLINICAL DECISION SUPPORT */}
          {activeTab === 'ai_assistant' && (
            <div className="space-y-4 text-xs">
              {/* Mandatory CDS Safety Banner */}
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/60 text-amber-200 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-[11px] uppercase tracking-wider">
                    Clinical Decision Support (CDS) Safety Boundary
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-200/90">
                    Outputs generated by Jano AI are advisory aids to assist clinicians in diagnostic reasoning,
                    differential formulation, risk stratification, and patient counseling. Jano AI cannot
                    autonomously prescribe, execute orders, or override clinician judgment.
                  </p>
                </div>
              </div>

              {/* CDS Task Selector & Query Input */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'chart_summary', label: 'Chart Synthesis' },
                    { id: 'differential', label: 'Differential Diagnoses' },
                    { id: 'risk_flags', label: 'Clinical Risk Stratification' },
                    { id: 'documentation', label: 'Documentation Assistant' },
                    { id: 'patient_education', label: 'Patient Counseling' },
                    { id: 'clinical_qa', label: 'Direct Clinical Query' },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => {
                        setAiTask(btn.id as typeof aiTask);
                        runJanoAI(btn.id as typeof aiTask);
                      }}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                        aiTask === btn.id
                          ? 'bg-teal-600 text-white font-semibold shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Specific clinical question or focus (e.g. 'Coartem dosage with high fever and vomiting', 'Second-line antibiotics')..."
                    value={aiCustomQuery}
                    onChange={(e) => setAiCustomQuery(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 text-xs"
                  />
                  <button
                    onClick={() => runJanoAI()}
                    disabled={aiLoading}
                    className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <span className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 animate-spin" /> Analyzing...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Send className="w-3.5 h-3.5" /> Consult Jano AI
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Response Display Card */}
              {aiResponse && (
                <div className="bg-slate-900 border border-teal-800/80 rounded-lg p-5 space-y-4 shadow-lg">
                  {/* Response Meta Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-teal-400" />
                      <span className="font-bold text-white text-sm">
                        Jano AI Decision Support Result
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                        {aiResponse.model}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400">
                      Generated: {new Date(aiResponse.generatedAt).toLocaleTimeString()} • Engine: {aiResponse.source}
                    </div>
                  </div>

                  {/* Primary Formatted Text */}
                  <div className="prose prose-invert max-w-none text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                    {aiResponse.content}
                  </div>

                  {/* Structured Points */}
                  {aiResponse.structuredPoints && aiResponse.structuredPoints.length > 0 && (
                    <div className="p-3 bg-slate-950/80 rounded-md border border-slate-800 space-y-1.5">
                      <div className="font-semibold text-teal-300 text-xs">
                        Prioritized Action Items & Danger Signs:
                      </div>
                      <ul className="space-y-1">
                        {aiResponse.structuredPoints.map((pt, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-300">
                            <span className="text-teal-400 font-bold">•</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Safety Warnings */}
                  <div className="p-2.5 rounded bg-slate-950 border border-amber-900/60 text-[11px] text-amber-300/90 space-y-1 font-mono">
                    {aiResponse.safetyWarnings.map((warn, i) => (
                      <div key={i}>⚠️ {warn}</div>
                    ))}
                  </div>

                  {/* Clinician Review & Disposition Controls */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium text-xs">Clinician Verification Status:</span>
                      {clinicianReviewedAction ? (
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-bold uppercase font-mono ${
                            clinicianReviewedAction === 'accepted'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : clinicianReviewedAction === 'modified'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {clinicianReviewedAction} by {currentUser.fullName}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                          Pending Clinician Sign-off
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => recordClinicianAction('accepted')}
                        className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Accept Suggestion
                      </button>
                      <button
                        onClick={() => recordClinicianAction('modified')}
                        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs"
                      >
                        Modify & Integrate
                      </button>
                      <button
                        onClick={() => recordClinicianAction('rejected')}
                        className="px-3 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-medium text-xs"
                      >
                        Dismiss / Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: DEMOGRAPHICS & MASTER INDEX */}
          {activeTab === 'demographics' && (
            <PatientDemographicsTab
              patient={patient}
              onPatientUpdated={() => onPatientUpdated?.()}
              onDenyPermission={(capability, actionTitle, reason) =>
                executeOrDeny(capability, actionTitle, reason, () => {})
              }
            />
          )}

          {/* TAB: LONGITUDINAL EVENT TIMELINE */}
          {activeTab === 'timeline' && (
            <PatientTimelineTab patient={patient} />
          )}

          {/* TAB: RECORD MERGE & DEDUPLICATION */}
          {activeTab === 'merge' && (
            <PatientMergeTab
              patient={patient}
              onPatientUpdated={() => onPatientUpdated?.()}
              onSelectPatient={(targetId) => onSelectPatient?.(targetId)}
              onDenyPermission={(capability, actionTitle, reason) =>
                executeOrDeny(capability, actionTitle, reason, () => {})
              }
            />
          )}

          {/* TAB: IDENTITY & CONSENT DIRECTIVES */}
          {activeTab === 'identity_consent' && (
            <IdentityConsentTab patientId={patient.id} />
          )}

          {/* TAB: HEALTH COVERAGE & FINANCING */}
          {activeTab === 'coverage_financing' && (
            <CoverageFinancingTab patientId={patient.id} />
          )}

          {/* TAB: CARE TEAM & OPERATIONS */}
          {activeTab === 'care_team' && (
            <CareTeamWorkforceTab patientId={patient.id} facilityId={currentFacility?.id || 'fac-amgh'} />
          )}
        </div>
      </div>

      {/* RBAC Permission Denial Modal Dialog */}
      {authDenial && (
        <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/60 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-950/90 border border-red-700/60 flex items-center justify-center text-red-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Action Denied by Security Policy</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 uppercase font-semibold">
                    RBAC Boundary
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-medium">{authDenial.actionTitle}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Current Authenticated Identity:</span>
                <span className="text-slate-200 font-semibold">{currentUser.fullName} ({currentUser.role})</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Required Clinical Capability:</span>
                <span className="font-mono text-teal-400 font-semibold">{authDenial.capability}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 text-slate-300 leading-relaxed">
                <p>{authDenial.reason}</p>
              </div>
            </div>

            <div className="p-2.5 rounded bg-amber-950/40 border border-amber-900/60 text-[11px] text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Audit Ledger: Unauthorized operation attempt recorded to immutable audit trail.</span>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setAuthDenial(null)}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Acknowledge & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
