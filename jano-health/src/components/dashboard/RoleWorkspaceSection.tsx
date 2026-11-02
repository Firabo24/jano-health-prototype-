/**
 * Jano Health - Role-Specific Operational & Clinical Workspaces
 * 
 * Provides dedicated, role-tailored workstation experiences for every supported healthcare role:
 * - Physician: Urgent diagnostic results, active consultations, high-risk triage alerts
 * - Nurse: Bedside vitals queue, pending triage, medication administration schedule
 * - Pharmacist: Prescription fulfillment queue, drug interactions, inventory stock alerts
 * - Laboratory Staff: Pending specimen orders, rapid diagnostic tests, critical values
 * - Radiology Staff: Imaging requisition queue, POCUS ultrasounds, scan uploads
 * - Receptionist: Patient check-in queue, daily registrations, missing demographic alerts
 * - Health Officer: Community outreach schedule, epidemic surveillance flags, field referrals
 * - Clinical Supervisor: Chart review audits, high-risk encounter reviews, prescription compliance
 * - System Administrator: Local node health, sync mesh, event ledgers, storage quotas
 * - Facility Administrator: Facility roster, bed occupancy, department queues, stock buffer
 */

import React from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  Layers,
  Network,
  Pill,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';
import { localDb } from '../../services/storage/localDatabase';
import { ROLE_DEFINITIONS } from '../../domain/permissions';
import { ActiveNavTab } from '../layout/Sidebar';

interface RoleWorkspaceSectionProps {
  onNavigate: (tab: ActiveNavTab) => void;
  onSelectPatient: (patientId: string) => void;
}

export const RoleWorkspaceSection: React.FC<RoleWorkspaceSectionProps> = ({
  onNavigate,
  onSelectPatient,
}) => {
  const { currentUser, currentFacility } = useAuth();
  const patients = localDb.getPatients();
  const labOrders = localDb.getLabOrders();
  const radOrders = localDb.getRadiologyOrders();
  const encounters = localDb.getEncounters();
  const emergencyCases = localDb.getEmergencyCases().filter((e) => e.isActive);
  const auditLogs = localDb.getAuditLogs();

  const roleDef = ROLE_DEFINITIONS[currentUser.role];

  return (
    <div className="bg-slate-900 border border-teal-500/30 rounded-xl p-5 shadow-xl space-y-4">
      {/* Workspace Header with Clinician Persona */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-600/20 border border-teal-500/40 flex items-center justify-center text-teal-300 font-bold">
            <Stethoscope className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                {currentUser.fullName}&apos;s Workspace
              </h2>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-700">
                {roleDef?.title || currentUser.role}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Assigned Facility: <strong className="text-slate-200 font-medium">{currentFacility.name}</strong> • Role-Specific Worklist
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            Node: JANO-LOCAL-EDGE-01
          </span>
        </div>
      </div>

      {/* 1. PHYSICIAN WORKSPACE */}
      {currentUser.role === 'physician' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Urgent Unreviewed Diagnostic Results */}
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-amber-400" />
                Urgent Diagnostic Results
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                2 Critical
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Specimen and imaging orders requiring clinician review and sign-off.</p>
            <div className="space-y-2 pt-1">
              <div
                onClick={() => onSelectPatient('pat-synthetic-001')}
                className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-amber-500/50 cursor-pointer transition-all"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">Amina Mwamba (Malaria mRDT)</span>
                  <span className="text-[10px] text-red-400 font-bold font-mono">POSITIVE (P. falc)</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Hgb: 6.8 g/dL • Severe Anemia Critical Alert</p>
              </div>
              <div
                onClick={() => onSelectPatient('pat-synthetic-002')}
                className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-teal-500/50 cursor-pointer transition-all"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">Juma Bakari (Chest X-Ray)</span>
                  <span className="text-[10px] text-teal-400 font-mono">RUL Infiltrate</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Radiologist preliminary impression ready</p>
              </div>
            </div>
          </div>

          {/* Active Consultations & SOAP Encounters */}
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-teal-400" />
                My Active Consultations
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                {encounters.length} Open Notes
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Patients currently awaiting SOAP assessment or prescription adjustments.</p>
            <div className="space-y-2 pt-1">
              {patients.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectPatient(p.id)}
                  className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-teal-500/50 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-200">{p.firstName} {p.lastName}</span>
                    <p className="text-[10px] text-slate-400 font-mono">MRN: {p.mrn} • Room 4 Consultation</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-teal-400" />
                </div>
              ))}
            </div>
          </div>

          {/* High-Risk Triage & Emergency Alerts */}
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                Emergency Triage Alerts
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                {emergencyCases.length} Active
              </span>
            </div>
            <p className="text-[11px] text-slate-400">High-acuity red triage arrivals requiring immediate physician evaluation.</p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => onNavigate('emergency')}
                className="w-full p-2.5 rounded bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/80 text-left transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-rose-200">View Resuscitation & Red Triage Queue</div>
                  <div className="text-[10px] text-rose-300 mt-0.5">2 cases with unstable vitals (SpO2 &lt; 90%, HR &gt; 130)</div>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. NURSE WORKSPACE */}
      {currentUser.role === 'nurse' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-sky-400" />
                Bedside Vitals Due Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                3 Pending
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Routine 4-hour vitals schedule and acute deterioration monitoring.</p>
            <div className="space-y-2 pt-1">
              {patients.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectPatient(p.id)}
                  className="p-2 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/50 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-200">{p.firstName} {p.lastName}</span>
                    <p className="text-[10px] text-slate-400 font-mono">Ward 2, Bed 04 • Last Vitals 4.5h ago</p>
                  </div>
                  <span className="text-[10px] text-sky-300 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800">
                    Record Now
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Pill className="w-4 h-4 text-amber-400" />
                Medication Administration Log
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Next Dose 14:00
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Scheduled intravenous and oral doses awaiting nursing administration.</p>
            <div className="space-y-2 pt-1 text-xs">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <div className="flex justify-between font-medium text-slate-200">
                  <span>IV Artesunate (120mg)</span>
                  <span className="text-teal-400 font-mono">Dose 2 of 3</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">Patient: Amina Mwamba (Bed 02) • Severe Malaria Protocol</p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Triage Observation Alerts
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                1 Flagged
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Clinical warning signs: tachypnea, rising temperature, or altered sensorium.</p>
            <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/60 text-xs text-rose-200 space-y-1">
              <div className="font-semibold">Pediatric Febrile Convulsion Watch</div>
              <p className="text-[10px] text-slate-300">Temp 39.4°C documented in Triage Area A. Paracetamol administered.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. PHARMACIST WORKSPACE */}
      {currentUser.role === 'pharmacist' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <Pill className="w-4 h-4 text-purple-400" />
                Prescription Fulfillment Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                4 Orders Pending
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Physician prescriptions awaiting pharmacist safety review and dispensation.</p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => onNavigate('pharmacy')}
                className="w-full p-2.5 rounded bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800 text-left transition-colors flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-purple-200">Open Dispensary Verification Queue</div>
                  <div className="text-[10px] text-purple-300 mt-0.5">Review dosage, frequency, and patient allergy profiles</div>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Drug Interaction Warnings
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                1 Warning
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Pharmacovigilance checks against recorded patient allergies and existing regimens.</p>
            <div className="p-2 rounded bg-amber-950/30 border border-amber-900/60 text-[11px] text-amber-300 space-y-1">
              <div className="font-semibold">Coartem + Ketoconazole Potential Interaction</div>
              <p className="text-[10px] text-slate-300">CYP3A4 inhibition risk flagged. Consider alternative antifungal.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-teal-400" />
                Pharmacy Stock & Reorder Alerts
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                3 Low Items
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Inventory levels at Kigoma Regional Central Pharmacy Depot.</p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-200">Artemether/Lumefantrine 20/120</span>
                <span className="text-amber-400 font-mono font-semibold">140 boxes (Reorder Point)</span>
              </div>
              <div className="flex justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
                <span className="text-slate-200">Amoxicillin 500mg Caps</span>
                <span className="text-teal-400 font-mono font-semibold">480 bottles (Sufficient)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. LABORATORY STAFF WORKSPACE */}
      {currentUser.role === 'laboratory_staff' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-purple-400" />
                Pending Specimen Orders
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                {labOrders.length} Requisitions
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Blood, stool, and sputum samples logged for diagnostic laboratory bench work.</p>
            <button
              onClick={() => onNavigate('laboratory')}
              className="w-full p-2.5 rounded bg-purple-950/40 hover:bg-purple-950/70 border border-purple-800 text-left transition-colors flex items-center justify-between cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-purple-200">Open Laboratory Workbench</div>
                <div className="text-[10px] text-purple-300 mt-0.5">Enter specimen results & attach technician sign-off</div>
              </div>
              <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Critical Value Panic Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                Urgent Read-back
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Values requiring immediate clinical notification per lab accreditation rules.</p>
            <div className="p-2 rounded bg-rose-950/30 border border-rose-900/60 text-[11px] text-rose-200 space-y-1">
              <div className="font-semibold">Hgb 6.8 g/dL (Critical Low)</div>
              <p className="text-[10px] text-slate-300">Patient: Amina Mwamba. Attending Dr. Sarah Alemu notified.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                Rapid Diagnostic Tests (mRDT)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                12 Completed Today
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Point-of-care rapid testing statistics: 75% Malaria positivity rate.</p>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              Quality control lot #MK-2026 verified this morning with valid control lines.
            </div>
          </div>
        </div>
      )}

      {/* 5. RADIOLOGY STAFF WORKSPACE */}
      {currentUser.role === 'radiology_staff' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-indigo-400" />
                Imaging Requisition Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                {radOrders.length} Scans Scheduled
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Plain radiographs, ultrasound examinations, and POCUS imaging requests.</p>
            <button
              onClick={() => onNavigate('radiology')}
              className="w-full p-2.5 rounded bg-indigo-950/40 hover:bg-indigo-950/70 border border-indigo-800 text-left transition-colors flex items-center justify-between cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-indigo-200">Open Radiology Imaging Viewer</div>
                <div className="text-[10px] text-indigo-300 mt-0.5">Attach ultrasound findings & technician notes</div>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-teal-400" />
                Point-of-Care Ultrasound (POCUS)
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                Emergency Bay 1
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Obstetric and FAST trauma ultrasound requests from triage.</p>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              Portable Sonosite unit battery: 94%. Calibrated and sanitized for next scan.
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-teal-400" />
                Local DICOM Edge Archive
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                PACS Online
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Offline store-and-forward PACS buffer with lossless compression.</p>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-mono">
              Indexed studies: 34 • Storage: 4.8 GB / 120 GB
            </div>
          </div>
        </div>
      )}

      {/* 6. RECEPTIONIST WORKSPACE */}
      {currentUser.role === 'receptionist' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-400" />
                Patient Check-in & Waiting Room
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                {patients.length} Registered
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Arrivals awaiting triage assessment and queue assignment.</p>
            <button
              onClick={() => onNavigate('patients')}
              className="w-full p-2.5 rounded bg-blue-950/40 hover:bg-blue-950/70 border border-blue-800 text-left transition-colors flex items-center justify-between cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-blue-200">Open Patient Registry & Check-in</div>
                <div className="text-[10px] text-blue-300 mt-0.5">Register new arrivals or search Master Patient Index</div>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-400 shrink-0" />
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Missing Demographics Alerts
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                2 Incomplete
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Charts missing emergency contact or national ID numbers.</p>
            <div className="p-2 rounded bg-amber-950/30 border border-amber-900/60 text-[11px] text-amber-300 space-y-1">
              <div className="font-semibold">Fatuma Ally (MRN-64720)</div>
              <p className="text-[10px] text-slate-300">Missing next-of-kin telephone contact. Update before discharge.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-400" />
                Scheduled Clinic Appointments
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                Today&apos;s Bookings
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Scheduled antenatal care and chronic disease follow-up slots.</p>
            <button
              onClick={() => onNavigate('appointments')}
              className="w-full text-xs text-teal-400 hover:underline text-left pt-1"
            >
              View Appointment Schedule →
            </button>
          </div>
        </div>
      )}

      {/* 7. HEALTH OFFICER WORKSPACE */}
      {currentUser.role === 'health_officer' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-cyan-400" />
                Epidemic Surveillance Flags
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                Malaria Alert
              </span>
            </div>
            <p className="text-[11px] text-slate-400">District disease surveillance cluster detection and outbreak monitoring.</p>
            <div className="p-2 rounded bg-cyan-950/30 border border-cyan-900/60 text-[11px] text-cyan-200 space-y-1">
              <div className="font-semibold">Uvinza Rural Malaria Spike (+38% vs 4-wk average)</div>
              <p className="text-[10px] text-slate-300">Rapid response LLIN net distribution recommended in Sub-ward 3.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-400" />
                Community Outreach Schedule
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                Mobile Unit #2
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Scheduled village health posts and maternal immunization days.</p>
            <div className="space-y-1 text-[11px]">
              <div className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
                Tomorrow: Ilagala Fishermen Community Post (EPI + Nutrition)
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Network className="w-4 h-4 text-amber-400" />
                Field Referral Transport Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                1 In Transit
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Patients transferred from rural health posts to Kigoma Regional Hospital.</p>
            <button
              onClick={() => onNavigate('referrals')}
              className="w-full text-xs text-teal-400 hover:underline text-left pt-1"
            >
              Manage Inter-Facility Referrals →
            </button>
          </div>
        </div>
      )}

      {/* 8. CLINICAL SUPERVISOR WORKSPACE */}
      {currentUser.role === 'clinical_supervisor' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-teal-400" />
                Chart Quality & Audit Queue
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                5 Pending Audits
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Randomized and high-acuity chart peer review for clinical governance.</p>
            <button
              onClick={() => onNavigate('clinical')}
              className="w-full p-2.5 rounded bg-teal-950/40 hover:bg-teal-950/70 border border-teal-800 text-left transition-colors flex items-center justify-between cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-teal-200">Open Clinical Audit Workbench</div>
                <div className="text-[10px] text-teal-300 mt-0.5">Audit SOAP notes, differential diagnoses, and danger signs</div>
              </div>
              <ArrowRight className="w-4 h-4 text-teal-400 shrink-0" />
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Antimicrobial Stewardship
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                92% Compliance
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Monitoring empirical antibiotic selections against national guidelines.</p>
            <div className="p-2 rounded bg-amber-950/30 border border-amber-900/60 text-[11px] text-amber-300 space-y-1">
              <div className="font-semibold">Ceftriaxone Empirical Usage Under Review</div>
              <p className="text-[10px] text-slate-300">Confirm positive blood culture or fever &gt; 48h before continuation.</p>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-400" />
                AI CDS Validation Stream
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                Auditing Jano AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Review clinician acceptance rate and safety flags on Jano AI recommendations.</p>
            <button
              onClick={() => onNavigate('ai_assistant')}
              className="w-full text-xs text-teal-400 hover:underline text-left pt-1"
            >
              Review AI Recommendations Ledger →
            </button>
          </div>
        </div>
      )}

      {/* 9. SYSTEM ADMINISTRATOR WORKSPACE */}
      {currentUser.role === 'system_administrator' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-rose-400" />
                Local Node & Mesh Sync Health
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                100% HEALTHY
              </span>
            </div>
            <p className="text-[11px] text-slate-400">State of offline event store, IndexedDB aggregate projections, and sync mesh.</p>
            <button
              onClick={() => onNavigate('synchronization')}
              className="w-full p-2.5 rounded bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800 text-left transition-colors flex items-center justify-between cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-rose-200">Open Sync Mesh Diagnostics</div>
                <div className="text-[10px] text-rose-300 mt-0.5">Inspect vector clocks, cursor commits, and push queues</div>
              </div>
              <ArrowRight className="w-4 h-4 text-rose-400 shrink-0" />
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-400" />
                Audit Trail & Event Ledger
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                {auditLogs.length} Events Logged
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Cryptographically verifiable SHA-256 tamper-evident event chain.</p>
            <button
              onClick={() => onNavigate('audit_log')}
              className="w-full text-xs text-teal-400 hover:underline text-left pt-1"
            >
              Audit Log Viewer & Forensic Inspection →
            </button>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-400" />
                Multi-Facility Management
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                4 Active Facilities
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Role assignments, facility partition boundaries, and security policies.</p>
            <button
              onClick={() => onNavigate('administration')}
              className="w-full text-xs text-teal-400 hover:underline text-left pt-1"
            >
              System Administration Panel →
            </button>
          </div>
        </div>
      )}

      {/* 10. FACILITY ADMINISTRATOR WORKSPACE */}
      {currentUser.role === 'facility_administrator' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-orange-400" />
                Facility Roster & Bed Occupancy
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-orange-950 text-orange-300 border border-orange-800">
                84% Capacity
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Real-time bed utilization across Emergency, Medical, Surgical, and Pediatric wards.</p>
            <div className="space-y-1 text-[11px] pt-1">
              <div className="flex justify-between p-1 rounded bg-slate-900">
                <span className="text-slate-300">Medical Ward A:</span>
                <span className="text-slate-100 font-mono">18 / 20 beds</span>
              </div>
              <div className="flex justify-between p-1 rounded bg-slate-900">
                <span className="text-slate-300">Pediatrics:</span>
                <span className="text-slate-100 font-mono">14 / 15 beds</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-teal-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-400" />
                Duty Roster & Department Queues
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-300 border border-teal-800">
                All Shifts Covered
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Active clinician, nursing, and technical staff currently on shift.</p>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
              Shift handover completed at 07:30. Laboratory and Pharmacy fully staffed.
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Facility Supply & Stock Alerts
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                1 Critical
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Medical oxygen cylinders, IV fluids, and blood bank reserve levels.</p>
            <div className="p-2 rounded bg-amber-950/30 border border-amber-900/60 text-[11px] text-amber-300 space-y-1">
              <div className="font-semibold">O-Negative Blood Units: 2 Remaining</div>
              <p className="text-[10px] text-slate-300">Emergency blood donor mobilization initiated with Red Cross Kigoma.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
