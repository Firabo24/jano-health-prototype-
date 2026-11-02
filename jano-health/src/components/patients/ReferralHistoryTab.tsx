/**
 * Jano Health - Patient Chart: Referrals & Care Coordination History Tab
 * 
 * Displays the complete longitudinal history of inter-facility referrals,
 * closed-loop consultations, tertiary escalations, and counter-referral outcomes
 * for a specific patient.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Ambulance,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck,
  FileText,
  Hospital,
  Layers,
  MessageSquare,
  Plus,
  Send,
  Shield,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Referral,
  ReferralOutcome,
  ReferralCommunication,
  ReferralPriority,
  ReferralStatus,
} from '../../domain/referralTypes';
import { Patient, Encounter } from '../../domain/types';
import { useAuth } from '../../services/security/authContext';
import { referralService } from '../../services/clinical/referralService';
import { localDb } from '../../services/storage/localDatabase';
import { localRepository } from '../../services/storage/localRepository';

interface ReferralHistoryTabProps {
  patient: Patient;
  encounters?: Encounter[];
  onRefresh?: () => void;
}

export const ReferralHistoryTab: React.FC<ReferralHistoryTabProps> = ({
  patient,
  encounters = [],
  onRefresh,
}) => {
  const { currentUser, currentFacility, availableFacilities, can } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, ReferralOutcome | undefined>>({});
  const [communications, setCommunications] = useState<Record<string, ReferralCommunication[]>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Referral Form state
  const [newRef, setNewRef] = useState({
    destinationFacilityId: availableFacilities.find((f) => f.id !== currentFacility.id)?.id || 'fac-kigoma-dh',
    destinationDepartment: 'General Surgery / Emergency',
    priority: 'URGENT' as ReferralPriority,
    referralType: 'EMERGENCY_TRANSFER' as const,
    primaryReason: '',
    clinicalSummary: '',
    provisionalDiagnosis: '',
    icdCode: '',
    transportationNeed: 'AMBULANCE' as const,
    oxygenRequired: false,
    ivAccessRequired: false,
    attendantRequired: false,
    immediateSubmission: true,
  });

  const loadReferrals = async () => {
    // Read directly from repository and fallback to localDb
    let allRefs: Referral[] = [];
    if (localRepository.getReferrals) {
      allRefs = await localRepository.getReferrals(patient.id);
    }
    if (!allRefs || allRefs.length === 0) {
      allRefs = localDb.getReferrals().filter((r) => r.patientId === patient.id);
    }
    setReferrals(allRefs);

    // Load outcomes and communications for each referral
    const outcomeMap: Record<string, ReferralOutcome | undefined> = {};
    const commMap: Record<string, ReferralCommunication[]> = {};

    for (const ref of allRefs) {
      const outcome = await referralService.getReferralOutcome(ref.id);
      if (outcome) {
        outcomeMap[ref.id] = outcome;
      }
      const comms = await referralService.getReferralCommunications(ref.id);
      commMap[ref.id] = comms;
    }

    setOutcomes(outcomeMap);
    setCommunications(commMap);
  };

  useEffect(() => {
    loadReferrals();
  }, [patient.id]);

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRef.primaryReason.trim()) {
      setFeedback({ type: 'error', message: 'Primary reason for referral is required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);
      const destFac = availableFacilities.find((f) => f.id === newRef.destinationFacilityId);

      await referralService.createReferral(
        {
          patientId: patient.id,
          destinationFacilityId: newRef.destinationFacilityId,
          destinationFacilityName: destFac?.name || 'Tertiary Referral Center',
          destinationDepartment: newRef.destinationDepartment,
          priority: newRef.priority,
          referralType: newRef.referralType,
          primaryReason: newRef.primaryReason.trim(),
          clinicalSummary: newRef.clinicalSummary.trim() || newRef.primaryReason.trim(),
          provisionalDiagnosis: newRef.provisionalDiagnosis.trim() || undefined,
          icdCode: newRef.icdCode.trim() || undefined,
          transportationNeed: newRef.transportationNeed,
          oxygenRequired: newRef.oxygenRequired,
          ivAccessRequired: newRef.ivAccessRequired,
          attendantRequired: newRef.attendantRequired,
          immediateSubmission: newRef.immediateSubmission,
        },
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        }
      );

      setFeedback({ type: 'success', message: 'Referral handoff order initiated successfully!' });
      setShowCreateModal(false);
      setNewRef({
        destinationFacilityId: availableFacilities.find((f) => f.id !== currentFacility.id)?.id || 'fac-kigoma-dh',
        destinationDepartment: 'General Surgery / Emergency',
        priority: 'URGENT',
        referralType: 'EMERGENCY_TRANSFER',
        primaryReason: '',
        clinicalSummary: '',
        provisionalDiagnosis: '',
        icdCode: '',
        transportationNeed: 'AMBULANCE',
        oxygenRequired: false,
        ivAccessRequired: false,
        attendantRequired: false,
        immediateSubmission: true,
      });

      await loadReferrals();
      onRefresh?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create referral.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferral || !newMessage.trim()) return;

    try {
      setIsSubmitting(true);
      await referralService.addCommunication(
        selectedReferral.id,
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        },
        newMessage.trim()
      );

      setNewMessage('');
      setShowMsgModal(false);
      await loadReferrals();
      setFeedback({ type: 'success', message: 'Message sent across facility coordination channel.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to send message.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredReferrals = referrals.filter((r) => {
    if (filterStatus === 'ALL') return true;
    const isCompleted = r.status === 'COMPLETED' || r.status === 'CLOSED' || r.status === 'completed' || r.status === 'closed';
    if (filterStatus === 'COMPLETED') return isCompleted;
    if (filterStatus === 'ACTIVE') return !isCompleted && r.status !== 'CANCELLED' && r.status !== 'cancelled';
    return true;
  });

  return (
    <div className="space-y-4 text-slate-200">
      {/* Header with Stats & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Hospital className="w-4 h-4 text-teal-400" />
            Inter-Facility Referral & Closed-Loop Handoff History
          </h2>
          <p className="text-[11px] text-slate-400">
            Longitudinal care continuity, tertiary transfer requests, and counter-referral outcomes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700 text-xs">
            {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterStatus(mode)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  filterStatus === mode
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode === 'ALL' ? `All (${referrals.length})` : mode}
              </button>
            ))}
          </div>

          {(can('referral:create') || can('referrals:manage')) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Referral
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-md text-xs flex items-center justify-between gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-red-950/70 border-red-800 text-red-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Referrals List */}
      {filteredReferrals.length === 0 ? (
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-8 text-center space-y-2">
          <Hospital className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400">No referral records found matching current criteria.</p>
          {(can('referral:create') || can('referrals:manage')) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-teal-400 hover:text-teal-300 text-xs font-medium inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Initiate an inter-facility referral
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReferrals.map((r) => {
            const outcome = outcomes[r.id];
            const comms = communications[r.id] || [];
            const fromFac = availableFacilities.find((f) => f.id === (r.fromFacilityId || r.sourceFacilityId));
            const toFac = availableFacilities.find((f) => f.id === (r.toFacilityId || r.destinationFacilityId));
            const isCompleted = r.status === 'COMPLETED' || r.status === 'CLOSED' || r.status === 'completed';

            return (
              <div
                key={r.id}
                className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg p-4 space-y-3 transition-colors"
              >
                {/* Referral Title Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-teal-300 text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-700 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-teal-400" />
                      {r.referralNumber || r.id}
                    </span>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                        r.priority === 'critical_emergency' || r.priority === 'EMERGENCY'
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : r.priority === 'urgent' || r.priority === 'URGENT'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {String(r.priority).replace('_', ' ')}
                    </span>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                        isCompleted
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : r.status === 'ACCEPTED' || r.status === 'accepted'
                          ? 'bg-teal-950 text-teal-300 border border-teal-800'
                          : r.status === 'IN_CARE' || r.status === 'IN_PROGRESS'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {r.status}
                    </span>

                    {r.transportMode === 'ambulance' || r.transportationNeed === 'AMBULANCE' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1">
                        <Ambulance className="w-3 h-3" /> Ambulance Required
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono">
                    Initiated: {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Transfer Pathway */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/50 p-2.5 rounded border border-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Originating Facility</span>
                    <span className="font-semibold text-slate-200">
                      {fromFac?.name || r.sourceFacilityId || r.fromFacilityId || 'Current Facility'}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Ref: {r.requestingClinicianName || r.referringProviderName || 'Attending Clinician'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Destination Facility</span>
                    <span className="font-semibold text-teal-300 flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 text-teal-400 shrink-0" />
                      {toFac?.name || r.destinationFacilityName || r.destinationFacilityId || r.toFacilityId}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Dept: {r.destinationDepartment || r.receivingSpecialty || 'Specialist Services'}
                    </span>
                  </div>
                </div>

                {/* Clinical Handoff Indication */}
                <div className="space-y-1 text-xs">
                  <p className="text-slate-200">
                    <strong className="text-slate-400">Clinical Reason:</strong>{' '}
                    {r.primaryReason || r.reasonForReferral}
                  </p>
                  {r.clinicalSummary && (
                    <p className="text-slate-300 text-[11px] bg-slate-900 p-2 rounded border border-slate-800/80">
                      <strong className="text-slate-400 block mb-0.5">Clinical Summary:</strong>
                      {r.clinicalSummary}
                    </p>
                  )}
                  {r.provisionalDiagnosis && (
                    <p className="text-[11px] text-teal-300">
                      <strong>Provisional Diagnosis:</strong> {r.provisionalDiagnosis}{' '}
                      {r.icdCode && <span className="text-slate-400 font-mono">({r.icdCode})</span>}
                    </p>
                  )}
                </div>

                {/* Closed-Loop Outcome Section (if documented) */}
                {outcome && (
                  <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-emerald-300 font-bold border-b border-emerald-800/40 pb-1">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Counter-Referral Outcome Documented
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {new Date(outcome.completedAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-400/80 block font-mono text-[10px]">Attending Specialist</span>
                        <span className="font-semibold text-slate-100">
                          {outcome.receivingClinicianName || outcome.consultantName || 'Specialist Consultant'} (
                          {outcome.receivingClinicianRole || outcome.consultantRole || 'Consultant'})
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-400/80 block font-mono text-[10px]">Clinical Disposition</span>
                        <span className="font-semibold text-emerald-300 uppercase">
                          {outcome.disposition || outcome.outcomeType || 'Discharged with Care Plan'}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-200">
                      <strong className="text-slate-400">Findings & Interventions:</strong>{' '}
                      {outcome.findingsSummary || outcome.findings || outcome.treatmentSummary}
                    </div>

                    {outcome.recommendations && (
                      <div className="text-[11px] text-teal-300 bg-slate-900/60 p-2 rounded border border-teal-900/40">
                        <strong className="text-slate-400 block mb-0.5">Counter-Referral Recommendations:</strong>
                        {outcome.recommendations}
                      </div>
                    )}
                  </div>
                )}

                {/* Audit and Communication Footer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-3 text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Version: {r.version || 1}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-teal-400" />
                      Messages: {comms.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedReferral(r);
                        setShowMsgModal(true);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 border border-slate-700"
                    >
                      <MessageSquare className="w-3 h-3 text-teal-400" />
                      Message Receiving Team
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Initiate Referral Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-teal-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Hospital className="w-4 h-4 text-teal-400" />
                Initiate Inter-Facility Clinical Referral Order
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReferral} className="p-4 overflow-y-auto space-y-3.5 text-xs">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Patient</span>
                  <span className="font-bold text-white text-sm">
                    {patient.firstName} {patient.lastName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">MRN / NIDA</span>
                  <span className="font-mono text-teal-300 font-bold">{patient.mrn}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Destination Facility *</label>
                  <select
                    value={newRef.destinationFacilityId}
                    onChange={(e) => setNewRef({ ...newRef, destinationFacilityId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    {availableFacilities
                      .filter((f) => f.id !== currentFacility.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.district})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Receiving Department / Specialty</label>
                  <input
                    type="text"
                    value={newRef.destinationDepartment}
                    onChange={(e) => setNewRef({ ...newRef, destinationDepartment: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                    placeholder="e.g. Inpatient Pediatrics / Intensive Care"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Clinical Priority *</label>
                  <select
                    value={newRef.priority}
                    onChange={(e) => setNewRef({ ...newRef, priority: e.target.value as ReferralPriority })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-medium"
                  >
                    <option value="EMERGENCY">Emergency (Immediate life/limb threat, urgent ambulance)</option>
                    <option value="URGENT">Urgent (Within 4-6 hours, acute decompensation)</option>
                    <option value="ROUTINE">Routine Specialist Review (Within 7-14 days)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Transport Requirement</label>
                  <select
                    value={newRef.transportationNeed}
                    onChange={(e) =>
                      setNewRef({
                        ...newRef,
                        transportationNeed: e.target.value as any,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="AMBULANCE">Emergency District Ambulance</option>
                    <option value="ROUTINE_TRANSPORT">Mobile Health Unit Transfer</option>
                    <option value="PATIENT_ARRANGED">Patient / Family Arranged</option>
                    <option value="NONE">No Transport Support Required</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Primary Reason for Referral *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acute abdomen with suspected peritonitis requiring emergency laparotomy"
                  value={newRef.primaryReason}
                  onChange={(e) => setNewRef({ ...newRef, primaryReason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Clinical Summary & Treatment Rendered</label>
                <textarea
                  rows={3}
                  placeholder="Summary of presentation, vitals, IV fluids given, antibiotics administered, and clinical question..."
                  value={newRef.clinicalSummary}
                  onChange={(e) => setNewRef({ ...newRef, clinicalSummary: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Provisional Diagnosis</label>
                  <input
                    type="text"
                    placeholder="e.g. Ruptured appendicitis"
                    value={newRef.provisionalDiagnosis}
                    onChange={(e) => setNewRef({ ...newRef, provisionalDiagnosis: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">ICD-10 Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. K35.2"
                    value={newRef.icdCode}
                    onChange={(e) => setNewRef({ ...newRef, icdCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <span className="block text-[11px] font-semibold text-teal-300">En-Route Clinical Support</span>
                <div className="flex flex-wrap gap-4 text-slate-300 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRef.oxygenRequired}
                      onChange={(e) => setNewRef({ ...newRef, oxygenRequired: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-teal-600"
                    />
                    Continuous Oxygen Required
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRef.ivAccessRequired}
                      onChange={(e) => setNewRef({ ...newRef, ivAccessRequired: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-teal-600"
                    />
                    IV Access / Infusion Running
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRef.attendantRequired}
                      onChange={(e) => setNewRef({ ...newRef, attendantRequired: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-teal-600"
                    />
                    Clinical Attendant / Escort
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Submitting...' : 'Dispatch Referral Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMsgModal && selectedReferral && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-400" />
                Inter-Facility Coordination Message
              </h3>
              <button onClick={() => setShowMsgModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="p-4 space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-slate-300">
                <span>Referral: {selectedReferral.referralNumber || selectedReferral.id}</span>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Communication Content *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type clinical query, bed coordination update, or ETA..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMsgModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Sending...' : 'Post Communication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
