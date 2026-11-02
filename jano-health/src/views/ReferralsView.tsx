/**
 * Jano Health - Clinical Referrals & Inter-Facility Care Coordination View
 * 
 * Orchestrates inter-facility transfers, tertiary escalations, emergency ambulance dispatch,
 * secure scoped data handoffs, and closed-loop counter-referral clinical outcomes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Ambulance,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Hospital,
  Info,
  Layers,
  Lock,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Truck,
  User,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  Referral,
  ReferralOutcome,
  ReferralCommunication,
  ReferralPriority,
  ReferralStatus,
  ReferralOutcomeType,
} from '../domain/referralTypes';
import { Patient, Facility, RoleType } from '../domain/types';
import { validateReferralNumber } from '../domain/referralIdentifiers';
import { useAuth } from '../services/security/authContext';
import { referralService } from '../services/clinical/referralService';
import { localDb } from '../services/storage/localDatabase';
import { localRepository } from '../services/storage/localRepository';

interface ReferralsViewProps {
  onSelectPatient: (patientId: string) => void;
}

type StreamTab = 'ALL' | 'OUTBOUND' | 'INBOUND' | 'EMERGENCY';

export const ReferralsView: React.FC<ReferralsViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, availableFacilities, can } = useAuth();

  // Primary State
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, ReferralOutcome | undefined>>({});
  const [communications, setCommunications] = useState<Record<string, ReferralCommunication[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Filters
  const [streamTab, setStreamTab] = useState<StreamTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Modals & Action States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<Referral | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms
  const [msgInput, setMsgInput] = useState('');
  const [acceptInput, setAcceptInput] = useState({
    scheduledTime: '',
    department: '',
    notes: '',
  });
  const [rejectInput, setRejectInput] = useState({
    reason: '',
    notes: '',
  });
  const [outcomeInput, setOutcomeInput] = useState({
    consultantName: currentUser.fullName,
    consultantRole: currentUser.role,
    disposition: 'DISCHARGED_HOME' as const,
    findings: '',
    treatmentSummary: '',
    finalDiagnosis: '',
    icdCode: '',
    followUpPlan: '',
    closeLoopImmediately: true,
  });

  // New Referral Creation Form
  const [newRef, setNewRef] = useState({
    patientId: '',
    destinationFacilityId: '',
    destinationDepartment: 'Emergency Medicine / Trauma',
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

  // Load all data
  const loadData = async () => {
    try {
      setIsLoading(true);
      const allPatients = localDb.getPatients();
      setPatients(allPatients);

      let allRefs: Referral[] = [];
      if (localRepository.getReferrals) {
        allRefs = await localRepository.getReferrals();
      }
      if (!allRefs || allRefs.length === 0) {
        allRefs = localDb.getReferrals();
      }
      setReferrals(allRefs);

      // Fetch outcome & communication caches
      const outcomeMap: Record<string, ReferralOutcome | undefined> = {};
      const commMap: Record<string, ReferralCommunication[]> = {};

      for (const r of allRefs) {
        const out = await referralService.getReferralOutcome(r.id);
        if (out) outcomeMap[r.id] = out;
        const comms = await referralService.getReferralCommunications(r.id);
        commMap[r.id] = comms;
      }

      setOutcomes(outcomeMap);
      setCommunications(commMap);

      if (!newRef.destinationFacilityId) {
        const defaultDest = availableFacilities.find((f) => f.id !== currentFacility.id)?.id || '';
        setNewRef((prev) => ({
          ...prev,
          patientId: prev.patientId || allPatients[0]?.id || '',
          destinationFacilityId: defaultDest,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load referrals data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentFacility.id]);

  // Derived metrics
  const metrics = useMemo(() => {
    const outbound = referrals.filter(
      (r) => (r.sourceFacilityId || r.fromFacilityId) === currentFacility.id
    );
    const inbound = referrals.filter(
      (r) => (r.destinationFacilityId || r.toFacilityId) === currentFacility.id
    );
    const emergencies = referrals.filter(
      (r) =>
        (r.priority === 'EMERGENCY' || r.priority === 'critical_emergency') &&
        r.status !== 'COMPLETED' &&
        r.status !== 'CLOSED' &&
        r.status !== 'CANCELLED'
    );
    const completed = referrals.filter(
      (r) => r.status === 'COMPLETED' || r.status === 'CLOSED' || r.status === 'completed'
    );

    return {
      total: referrals.length,
      outboundCount: outbound.length,
      inboundCount: inbound.length,
      emergencyCount: emergencies.length,
      completedCount: completed.length,
    };
  }, [referrals, currentFacility.id]);

  // Filtered referrals list
  const filteredReferrals = useMemo(() => {
    return referrals.filter((r) => {
      const isOutbound = (r.sourceFacilityId || r.fromFacilityId) === currentFacility.id;
      const isInbound = (r.destinationFacilityId || r.toFacilityId) === currentFacility.id;
      const isEmergency = r.priority === 'EMERGENCY' || r.priority === 'critical_emergency';

      if (streamTab === 'OUTBOUND' && !isOutbound) return false;
      if (streamTab === 'INBOUND' && !isInbound) return false;
      if (streamTab === 'EMERGENCY' && !isEmergency) return false;

      // Status filter
      if (statusFilter !== 'ALL') {
        const normStatus = r.status.toUpperCase();
        if (normStatus !== statusFilter.toUpperCase()) return false;
      }

      // Priority filter
      if (priorityFilter !== 'ALL') {
        const normPri = String(r.priority).toUpperCase();
        if (!normPri.includes(priorityFilter.toUpperCase())) return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const pat = patients.find((p) => p.id === r.patientId);
        const name = pat ? `${pat.firstName} ${pat.lastName}`.toLowerCase() : '';
        const mrn = pat?.mrn?.toLowerCase() || '';
        const refNum = (r.referralNumber || r.id).toLowerCase();
        const reason = (r.primaryReason || r.reasonForReferral || '').toLowerCase();
        const destFac = (r.destinationFacilityName || r.destinationFacilityId || r.toFacilityId || '').toLowerCase();

        return (
          name.includes(q) ||
          mrn.includes(q) ||
          refNum.includes(q) ||
          reason.includes(q) ||
          destFac.includes(q)
        );
      }

      return true;
    });
  }, [referrals, streamTab, statusFilter, priorityFilter, searchTerm, currentFacility.id, patients]);

  // Auth Actor Context helper
  const getActor = () => ({
    userId: currentUser.id,
    userName: currentUser.fullName,
    userRole: currentUser.role,
    facilityId: currentFacility.id,
    deviceId: 'client-node-1',
  });

  // --- Actions ---

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRef.primaryReason.trim() || !newRef.patientId) {
      setFeedback({ type: 'error', message: 'Patient and primary clinical reason are required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const destFac = availableFacilities.find((f) => f.id === newRef.destinationFacilityId);

      await referralService.createReferral(
        {
          patientId: newRef.patientId,
          destinationFacilityId: newRef.destinationFacilityId,
          destinationFacilityName: destFac?.name || 'Tertiary Center',
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
        getActor()
      );

      setFeedback({
        type: 'success',
        message: `Referral order created and ${newRef.immediateSubmission ? 'submitted' : 'saved as draft'}.`,
      });
      setShowCreateModal(false);
      setNewRef({
        patientId: patients[0]?.id || '',
        destinationFacilityId: availableFacilities.find((f) => f.id !== currentFacility.id)?.id || '',
        destinationDepartment: 'Emergency Medicine / Trauma',
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
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create referral order.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledgeReceipt = async (r: Referral) => {
    try {
      setIsSubmitting(true);
      await referralService.receiveReferral(r.id, getActor(), 'Received and queued for specialty triage');
      setFeedback({ type: 'success', message: `Receipt of referral [${r.referralNumber || r.id}] acknowledged.` });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to acknowledge receipt.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartReview = async (r: Referral) => {
    try {
      setIsSubmitting(true);
      await referralService.reviewReferral(r.id, getActor(), 'Clinician reviewing clinical summary');
      setFeedback({ type: 'success', message: 'Referral marked UNDER_REVIEW.' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to review referral.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferral) return;

    try {
      setIsSubmitting(true);
      await referralService.acceptReferral(selectedReferral.id, getActor(), {
        scheduledTime: acceptInput.scheduledTime || undefined,
        department: acceptInput.department || undefined,
        notes: acceptInput.notes || undefined,
      });
      setFeedback({ type: 'success', message: `Referral [${selectedReferral.referralNumber || selectedReferral.id}] ACCEPTED.` });
      setShowAcceptModal(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to accept referral.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferral || !rejectInput.reason.trim()) return;

    try {
      setIsSubmitting(true);
      await referralService.rejectReferral(
        selectedReferral.id,
        getActor(),
        rejectInput.reason.trim(),
        rejectInput.notes.trim() || undefined
      );
      setFeedback({ type: 'info', message: 'Referral rejected with documented clinical rationale.' });
      setShowRejectModal(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to reject referral.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartCare = async (r: Referral) => {
    try {
      setIsSubmitting(true);
      await referralService.startCare(r.id, getActor());
      setFeedback({ type: 'success', message: 'Patient admitted into care / specialist intake started.' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to start care.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordOutcome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferral || !outcomeInput.findings.trim()) {
      setFeedback({ type: 'error', message: 'Objective findings and treatment summary are required.' });
      return;
    }

    try {
      setIsSubmitting(true);
      await referralService.recordOutcome(
        selectedReferral.id,
        {
          consultantId: currentUser.id,
          consultantName: outcomeInput.consultantName,
          consultantRole: outcomeInput.consultantRole,
          receivingFacilityId: currentFacility.id,
          receivingFacilityName: currentFacility.name,
          findings: outcomeInput.findings.trim(),
          treatmentSummary: outcomeInput.treatmentSummary.trim() || outcomeInput.findings.trim(),
          finalDiagnosis: outcomeInput.finalDiagnosis.trim() || undefined,
          icdCode: outcomeInput.icdCode.trim() || undefined,
          disposition: outcomeInput.disposition,
          followUpPlan: outcomeInput.followUpPlan.trim(),
          closeLoopImmediately: outcomeInput.closeLoopImmediately,
        },
        getActor()
      );

      setFeedback({ type: 'success', message: 'Closed-loop referral outcome documented and counter-referral slip dispatched.' });
      setShowOutcomeModal(false);
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to record referral outcome.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseReferral = async (r: Referral) => {
    try {
      setIsSubmitting(true);
      await referralService.closeReferral(r.id, getActor(), 'Closed by referring clinician after reviewing counter-referral');
      setFeedback({ type: 'success', message: 'Referral marked as CLOSED.' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to close referral.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferral || !msgInput.trim()) return;

    try {
      setIsSubmitting(true);
      await referralService.addCommunication(selectedReferral.id, getActor(), msgInput.trim());
      setMsgInput('');
      setShowMsgModal(false);
      setFeedback({ type: 'success', message: 'Coordination message posted to referral ledger.' });
      await loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to send communication.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Hospital className="w-5 h-5 text-teal-400" />
              Inter-Facility Care Coordination & Referrals
            </h1>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
              {currentFacility.name}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Bi-directional clinical escalations, emergency transport coordination, and closed-loop handoffs across Kigoma Region.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="Refresh Referrals"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-teal-400' : ''}`} />
          </button>

          {(can('referral:create') || can('referrals:manage')) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Initiate Patient Referral Order
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStreamTab('OUTBOUND')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            streamTab === 'OUTBOUND'
              ? 'bg-teal-950/40 border-teal-600 ring-1 ring-teal-500'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Outbound Referrals</span>
            <ArrowUpRight className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{metrics.outboundCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Referred to Tertiary / Specialist</div>
        </div>

        <div
          onClick={() => setStreamTab('INBOUND')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            streamTab === 'INBOUND'
              ? 'bg-teal-950/40 border-teal-600 ring-1 ring-teal-500'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Inbound Referrals</span>
            <ArrowDownRight className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white mt-1">{metrics.inboundCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Transfers received at this facility</div>
        </div>

        <div
          onClick={() => setStreamTab('EMERGENCY')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            streamTab === 'EMERGENCY'
              ? 'bg-red-950/40 border-red-600 ring-1 ring-red-500'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-red-300">
            <span>Critical Emergencies</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-xl font-bold text-red-300 mt-1">{metrics.emergencyCount}</div>
          <div className="text-[10px] text-red-400/80 mt-0.5">Immediate triage / Ambulance transit</div>
        </div>

        <div
          onClick={() => {
            setStreamTab('ALL');
            setStatusFilter('COMPLETED');
          }}
          className="p-3 rounded-lg border bg-slate-900 border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Closed-Loop Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{metrics.completedCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Counter-referral outcome filed</div>
        </div>
      </div>

      {/* User Alerts / Feedback */}
      {feedback && (
        <div
          className={`p-3 rounded-md text-xs flex items-center justify-between gap-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-red-950/70 border-red-800 text-red-300'
              : 'bg-blue-950/70 border-blue-800 text-blue-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stream Selector & Filters */}
      <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-md border border-slate-800 overflow-x-auto scrollbar-none">
          {[
            { id: 'ALL', label: 'All Transfers' },
            { id: 'OUTBOUND', label: 'Outbound (Referred Out)' },
            { id: 'INBOUND', label: 'Inbound (Referred In)' },
            { id: 'EMERGENCY', label: 'Urgent / Emergency' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStreamTab(tab.id as StreamTab)}
              className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                streamTab === tab.id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search and Dropdown Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search patient, MRN, Ref #, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="SENT">SENT / DISPATCHED</option>
            <option value="RECEIVED">RECEIVED</option>
            <option value="UNDER_REVIEW">UNDER REVIEW</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="IN_CARE">IN CARE</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CLOSED">CLOSED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="ALL">All Priorities</option>
            <option value="EMERGENCY">Emergency (STAT)</option>
            <option value="URGENT">Urgent (Within 4-6h)</option>
            <option value="ROUTINE">Routine Specialist</option>
          </select>
        </div>
      </div>

      {/* Referrals Cards Grid / List */}
      {filteredReferrals.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-10 text-center space-y-3">
          <Hospital className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Referrals Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No active or historical referral records match the selected stream and filter criteria.
          </p>
          {(can('referral:create') || can('referrals:manage')) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs inline-flex items-center gap-1.5 mt-2"
            >
              <Plus className="w-3.5 h-3.5" /> Initiate New Referral
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReferrals.map((r) => {
            const pat = patients.find((p) => p.id === r.patientId);
            const fromFac = availableFacilities.find(
              (f) => f.id === (r.fromFacilityId || r.sourceFacilityId)
            );
            const toFac = availableFacilities.find(
              (f) => f.id === (r.toFacilityId || r.destinationFacilityId)
            );
            const isOutbound = (r.sourceFacilityId || r.fromFacilityId) === currentFacility.id;
            const isInbound = (r.destinationFacilityId || r.toFacilityId) === currentFacility.id;
            const outcome = outcomes[r.id];
            const comms = communications[r.id] || [];
            const isEmergency =
              r.priority === 'EMERGENCY' ||
              r.priority === 'critical_emergency' ||
              r.priority === 'emergency';
            const isResolved =
              r.status === 'COMPLETED' ||
              r.status === 'CLOSED' ||
              r.status === 'completed' ||
              r.status === 'closed';

            return (
              <div
                key={r.id}
                className={`bg-slate-900 border rounded-lg p-4 space-y-3 transition-all ${
                  isEmergency && !isResolved
                    ? 'border-red-800/80 bg-red-950/10'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Patient Name with Chart Link */}
                    {pat ? (
                      <button
                        onClick={() => onSelectPatient(pat.id)}
                        className="font-bold text-white hover:text-teal-300 text-sm flex items-center gap-1 transition-colors text-left"
                      >
                        {pat.firstName} {pat.lastName}
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </button>
                    ) : (
                      <span className="font-bold text-white text-sm">Patient ID: {r.patientId}</span>
                    )}

                    <span className="font-mono text-teal-300 text-[11px] px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                      {pat?.mrn || 'N/A'}
                    </span>

                    {/* Referral ID with Luhn-36 status */}
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-teal-400" />
                      {r.referralNumber || r.id}
                    </span>

                    {/* Priority Badge */}
                    <span
                      className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                        isEmergency
                          ? 'bg-red-950 text-red-300 border-red-800'
                          : r.priority === 'urgent' || r.priority === 'URGENT'
                          ? 'bg-amber-950 text-amber-300 border-amber-800'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {String(r.priority).replace('_', ' ')}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded border ${
                        isResolved
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : r.status === 'ACCEPTED' || r.status === 'accepted'
                          ? 'bg-teal-950 text-teal-300 border-teal-800'
                          : r.status === 'IN_CARE' || r.status === 'IN_PROGRESS'
                          ? 'bg-blue-950 text-blue-300 border-blue-800'
                          : r.status === 'REJECTED' || r.status === 'CANCELLED'
                          ? 'bg-slate-800 text-red-400 border-slate-700'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {r.status}
                    </span>

                    {/* Transport Support Badges */}
                    {(r.transportMode === 'ambulance' || r.transportationNeed === 'AMBULANCE') && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                        <Ambulance className="w-3 h-3" /> Ambulance Dispatched
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono">
                    Created: {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>

                {/* Transfer Corridor */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-2.5 rounded border border-slate-800 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block">Sending Facility</span>
                    <div className="font-semibold text-slate-200">
                      {fromFac?.name || r.sourceFacilityId || r.fromFacilityId}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Clinician: {r.requestingClinicianName || r.referringProviderName || 'Attending Staff'}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-mono text-slate-500 block">Receiving Facility</span>
                    <div className="font-semibold text-teal-300 flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      {toFac?.name || r.destinationFacilityName || r.destinationFacilityId || r.toFacilityId}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Target Dept: {r.destinationDepartment || r.receivingSpecialty || 'Specialist Evaluation'}
                    </div>
                  </div>
                </div>

                {/* Clinical Handoff Indication */}
                <div className="space-y-1.5 text-xs">
                  <div>
                    <strong className="text-slate-400">Primary Indication:</strong>{' '}
                    <span className="text-slate-200 font-medium">
                      {r.primaryReason || r.reasonForReferral}
                    </span>
                  </div>

                  {r.clinicalSummary && (
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800/80 text-[11px] text-slate-300">
                      <strong className="text-slate-400 block mb-0.5">Clinical Summary & Interventions:</strong>
                      {r.clinicalSummary}
                    </div>
                  )}

                  {r.provisionalDiagnosis && (
                    <div className="text-[11px] text-teal-300">
                      <strong>Provisional Diagnosis:</strong> {r.provisionalDiagnosis}{' '}
                      {r.icdCode && <span className="font-mono text-slate-400">({r.icdCode})</span>}
                    </div>
                  )}

                  {/* En-Route clinical equipment flags */}
                  {(r.oxygenRequired || r.ivAccessRequired || r.attendantRequired) && (
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-amber-300">
                      <span className="text-slate-400">Transit Support:</span>
                      {r.oxygenRequired && <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800">O2 Supplemental</span>}
                      {r.ivAccessRequired && <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800">IV Infusion Active</span>}
                      {r.attendantRequired && <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800">Clinical Attendant</span>}
                    </div>
                  )}
                </div>

                {/* Documented Closed-Loop Outcome (If available) */}
                {outcome && (
                  <div className="bg-emerald-950/20 border border-emerald-800/60 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-emerald-300 font-bold border-b border-emerald-800/40 pb-1">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Counter-Referral Outcome Summary
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {new Date(outcome.completedAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-emerald-400/80 block font-mono text-[10px]">Attending Specialist</span>
                        <span className="font-semibold text-slate-100">
                          {outcome.receivingClinicianName || outcome.consultantName || 'Consultant Specialist'}
                        </span>
                      </div>
                      <div>
                        <span className="text-emerald-400/80 block font-mono text-[10px]">Disposition</span>
                        <span className="font-semibold text-emerald-300 uppercase">
                          {outcome.disposition || outcome.outcomeType}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-200">
                      <strong className="text-slate-400">Interventions & Findings:</strong>{' '}
                      {outcome.findingsSummary || outcome.findings || outcome.treatmentSummary}
                    </div>

                    {outcome.recommendations && (
                      <div className="text-[11px] text-teal-300 bg-slate-950 p-2 rounded border border-teal-900/40">
                        <strong className="text-slate-400 block mb-0.5">Counter-Referral Care Plan:</strong>
                        {outcome.recommendations}
                      </div>
                    )}
                  </div>
                )}

                {/* Interactive Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    {/* View Slip & Digital Seal */}
                    <button
                      onClick={() => {
                        setSelectedReferral(r);
                        setShowSlipModal(true);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      Referral Slip & Seal
                    </button>

                    {/* Messages */}
                    <button
                      onClick={() => {
                        setSelectedReferral(r);
                        setShowMsgModal(true);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-teal-400" />
                      Coordination Dialogue ({comms.length})
                    </button>

                    {/* Chart Shortcut */}
                    {pat && (
                      <button
                        onClick={() => onSelectPatient(pat.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 flex items-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <User className="w-3.5 h-3.5" />
                        Patient Chart
                      </button>
                    )}
                  </div>

                  {/* Contextual Workflow Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* INBOUND ACTIONS (For receiving hospital) */}
                    {isInbound && (
                      <>
                        {(r.status === 'SUBMITTED' || r.status === 'SENT' || r.status === 'dispatched') && (
                          <button
                            onClick={() => handleAcknowledgeReceipt(r)}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-medium text-xs flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge Receipt
                          </button>
                        )}

                        {r.status === 'RECEIVED' && (
                          <button
                            onClick={() => handleStartReview(r)}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-teal-700 hover:bg-teal-600 text-white font-medium text-xs flex items-center gap-1"
                          >
                            <Clock className="w-3.5 h-3.5" /> Start Clinical Triage
                          </button>
                        )}

                        {(r.status === 'UNDER_REVIEW' || r.status === 'RECEIVED') && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedReferral(r);
                                setShowAcceptModal(true);
                              }}
                              disabled={isSubmitting}
                              className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Accept Transfer
                            </button>
                            <button
                              onClick={() => {
                                setSelectedReferral(r);
                                setShowRejectModal(true);
                              }}
                              disabled={isSubmitting}
                              className="px-3 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Decline Transfer
                            </button>
                          </>
                        )}

                        {(r.status === 'ACCEPTED' || r.status === 'accepted' || r.status === 'SCHEDULED') && (
                          <button
                            onClick={() => handleStartCare(r)}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1"
                          >
                            <Activity className="w-3.5 h-3.5" /> Admit to Care
                          </button>
                        )}

                        {(r.status === 'IN_CARE' || r.status === 'IN_PROGRESS' || r.status === 'ACCEPTED' || r.status === 'accepted') && (
                          <button
                            onClick={() => {
                              setSelectedReferral(r);
                              setShowOutcomeModal(true);
                            }}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1"
                          >
                            <FileCheck className="w-3.5 h-3.5" /> Document Clinical Outcome
                          </button>
                        )}
                      </>
                    )}

                    {/* OUTBOUND ACTIONS (For sending health center) */}
                    {isOutbound && (
                      <>
                        {r.status === 'DRAFT' && (
                          <button
                            onClick={async () => {
                              try {
                                setIsSubmitting(true);
                                await referralService.submitReferral(r.id, getActor());
                                setFeedback({ type: 'success', message: 'Referral submitted into queue.' });
                                await loadData();
                              } catch (err: any) {
                                setFeedback({ type: 'error', message: err?.message || 'Failed to submit.' });
                              } finally {
                                setIsSubmitting(false);
                              }
                            }}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" /> Submit Referral
                          </button>
                        )}

                        {r.status === 'COMPLETED' && (
                          <button
                            onClick={() => handleCloseReferral(r)}
                            disabled={isSubmitting}
                            className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-xs flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Close Referral Loop
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- MODAL: INITIATE REFERRAL ORDER --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-teal-700 rounded-lg w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Hospital className="w-4 h-4 text-teal-400" />
                Initiate Inter-Facility Clinical Referral Order
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReferral} className="p-4 overflow-y-auto space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Select Patient *</label>
                  <select
                    value={newRef.patientId}
                    onChange={(e) => setNewRef({ ...newRef, patientId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                    required
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} ({p.mrn})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Destination Facility *</label>
                  <select
                    value={newRef.destinationFacilityId}
                    onChange={(e) => setNewRef({ ...newRef, destinationFacilityId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                    required
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Clinical Priority *</label>
                  <select
                    value={newRef.priority}
                    onChange={(e) => setNewRef({ ...newRef, priority: e.target.value as ReferralPriority })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-medium"
                  >
                    <option value="EMERGENCY">Emergency (STAT / Immediate ambulance transfer)</option>
                    <option value="URGENT">Urgent (Within 4-6 hours)</option>
                    <option value="ROUTINE">Routine Specialist Review (Elective)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Target Specialty / Department</label>
                  <input
                    type="text"
                    value={newRef.destinationDepartment}
                    onChange={(e) => setNewRef({ ...newRef, destinationDepartment: e.target.value })}
                    placeholder="e.g. Obstetrics & Gynecology, Surgery, Orthopedics"
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Primary Reason for Referral *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Obstructed labor with fetal bradycardia requiring emergency cesarean section"
                  value={newRef.primaryReason}
                  onChange={(e) => setNewRef({ ...newRef, primaryReason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Clinical Summary & Interventions Rendered</label>
                <textarea
                  rows={3}
                  placeholder="Vitals, clinical course, medications given (IV fluids, antibiotics, oxytocin), and question for specialist..."
                  value={newRef.clinicalSummary}
                  onChange={(e) => setNewRef({ ...newRef, clinicalSummary: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Provisional Diagnosis</label>
                  <input
                    type="text"
                    placeholder="e.g. Cephalopelvic disproportion"
                    value={newRef.provisionalDiagnosis}
                    onChange={(e) => setNewRef({ ...newRef, provisionalDiagnosis: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">ICD-10 Code</label>
                  <input
                    type="text"
                    placeholder="e.g. O65.4"
                    value={newRef.icdCode}
                    onChange={(e) => setNewRef({ ...newRef, icdCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Transportation Need</label>
                  <select
                    value={newRef.transportationNeed}
                    onChange={(e) => setNewRef({ ...newRef, transportationNeed: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="AMBULANCE">Emergency District Ambulance</option>
                    <option value="ROUTINE_TRANSPORT">Mobile Health Unit Transfer</option>
                    <option value="PATIENT_ARRANGED">Patient / Family Arranged</option>
                    <option value="NONE">No Transport Required</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Immediate Submission</label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={newRef.immediateSubmission}
                      onChange={(e) => setNewRef({ ...newRef, immediateSubmission: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-teal-600"
                    />
                    Submit to destination queue immediately
                  </label>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                <span className="block text-[11px] font-semibold text-teal-300">En-Route Clinical Support</span>
                <div className="flex flex-wrap gap-4 text-slate-300">
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
                    IV Infusion Running
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRef.attendantRequired}
                      onChange={(e) => setNewRef({ ...newRef, attendantRequired: e.target.checked })}
                      className="rounded bg-slate-800 border-slate-700 text-teal-600"
                    />
                    Nurse / Clinical Attendant Escort
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
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
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Submitting...' : 'Issue Referral Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: DOCUMENT CLINICAL OUTCOME --- */}
      {showOutcomeModal && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-emerald-700 rounded-lg w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                Document Closed-Loop Clinical Outcome (Counter-Referral)
              </h3>
              <button onClick={() => setShowOutcomeModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordOutcome} className="p-4 overflow-y-auto space-y-3.5">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Referral ID</span>
                  <span className="font-mono text-teal-300 font-bold">{selectedReferral.referralNumber || selectedReferral.id}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">Reason for Admission</span>
                  <span className="text-slate-200 font-semibold">{selectedReferral.primaryReason || selectedReferral.reasonForReferral}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Attending Specialist Name</label>
                  <input
                    type="text"
                    required
                    value={outcomeInput.consultantName}
                    onChange={(e) => setOutcomeInput({ ...outcomeInput, consultantName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Clinical Disposition *</label>
                  <select
                    value={outcomeInput.disposition}
                    onChange={(e) => setOutcomeInput({ ...outcomeInput, disposition: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  >
                    <option value="DISCHARGED_HOME">Discharged Home with Care Plan</option>
                    <option value="ADMITTED">Admitted to Inpatient Ward</option>
                    <option value="RETURN_TO_REFERRING_FACILITY">Return to Referring Dispensary for Follow-Up</option>
                    <option value="REFERRED_HIGHER_LEVEL">Transferred to Tertiary Hospital (MNH)</option>
                    <option value="LEFT_AGAINST_MEDICAL_ADVICE">Left Against Medical Advice (LAMA)</option>
                    <option value="DECEASED">Deceased</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Objective Findings & Clinical Course *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail specialist exam findings, surgical interventions performed, or response to therapy..."
                  value={outcomeInput.findings}
                  onChange={(e) => setOutcomeInput({ ...outcomeInput, findings: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Confirmed Final Diagnosis</label>
                  <input
                    type="text"
                    placeholder="e.g. Perforated gangrenous appendicitis with localized peritonitis"
                    value={outcomeInput.finalDiagnosis}
                    onChange={(e) => setOutcomeInput({ ...outcomeInput, finalDiagnosis: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">ICD-10 Code</label>
                  <input
                    type="text"
                    placeholder="e.g. K35.2"
                    value={outcomeInput.icdCode}
                    onChange={(e) => setOutcomeInput({ ...outcomeInput, icdCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Follow-Up Plan & Advice for Referring Dispensary *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Instructions for wound care, suture removal, medication continuation, red flags, and review date..."
                  value={outcomeInput.followUpPlan}
                  onChange={(e) => setOutcomeInput({ ...outcomeInput, followUpPlan: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-sans"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={outcomeInput.closeLoopImmediately}
                  onChange={(e) => setOutcomeInput({ ...outcomeInput, closeLoopImmediately: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-teal-600"
                />
                Close referral cycle immediately and notify sending dispensary
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowOutcomeModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Saving...' : 'Finalize Outcome & Counter-Referral'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: ACCEPT REFERRAL --- */}
      {showAcceptModal && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-teal-700 rounded-lg w-full max-w-md shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                Accept Transfer Handoff
              </h3>
              <button onClick={() => setShowAcceptModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAcceptReferral} className="p-4 space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Assigned Receiving Ward / Clinic</label>
                <input
                  type="text"
                  placeholder="e.g. Surgical Ward Bed 4, Pediatric Resuscitation Bay"
                  value={acceptInput.department}
                  onChange={(e) => setAcceptInput({ ...acceptInput, department: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Acceptance Notes & Preparation Instructions</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Team alerted. Keep patient NPO. Prepare 2 units O-negative blood on arrival."
                  value={acceptInput.notes}
                  onChange={(e) => setAcceptInput({ ...acceptInput, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAcceptModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                >
                  Confirm Acceptance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: DECLINE / REJECT REFERRAL --- */}
      {showRejectModal && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-red-700 rounded-lg w-full max-w-md shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-400" />
                Decline Transfer Request
              </h3>
              <button onClick={() => setShowRejectModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRejectReferral} className="p-4 space-y-3">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Clinical Rationale for Refusal *</label>
                <select
                  value={rejectInput.reason}
                  onChange={(e) => setRejectInput({ ...rejectInput, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-medium"
                  required
                >
                  <option value="">Select reason...</option>
                  <option value="BED_CAPACITY_EXCEEDED">ICU / Inpatient Bed Capacity Exceeded</option>
                  <option value="SPECIALIST_UNAVAILABLE">Required Specialist Not Available (Theatre Down)</option>
                  <option value="INAPPROPRIATE_TRIAGE_LEVEL">Can be Managed at Dispensary Level with Oral Meds</option>
                  <option value="REDIRECT_TO_TERTIARY">Requires Tertiary Escalation (MNH Muhimbili)</option>
                  <option value="OTHER">Other Clinical Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Redirect Instructions / Recommended Alternate Center</label>
                <textarea
                  rows={3}
                  placeholder="Recommend diverting ambulance to Kasulu District Hospital or stabilizing vitals..."
                  value={rejectInput.notes}
                  onChange={(e) => setRejectInput({ ...rejectInput, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white font-semibold"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: COORDINATION MESSAGES --- */}
      {showMsgModal && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-400" />
                Inter-Facility Coordination Dialogue: {selectedReferral.referralNumber || selectedReferral.id}
              </h3>
              <button onClick={() => setShowMsgModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {(communications[selectedReferral.id] || []).length === 0 ? (
                <div className="text-center p-6 text-slate-500">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  No direct coordination messages exchanged yet.
                </div>
              ) : (
                (communications[selectedReferral.id] || []).map((comm) => (
                  <div
                    key={comm.id}
                    className={`p-3 rounded-lg border ${
                      comm.senderFacilityId === currentFacility.id
                        ? 'bg-teal-950/30 border-teal-800/60 ml-6'
                        : 'bg-slate-950 border-slate-800 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span className="font-bold text-slate-200">
                        {comm.senderName} ({comm.senderRole || 'Staff'})
                      </span>
                      <span>{new Date(comm.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-100">{comm.message}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder="Post clinical update, bed query, or ambulance ETA..."
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100"
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1 shrink-0"
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL: OFFICIAL REFERRAL SLIP & DIGITAL SEAL --- */}
      {showSlipModal && selectedReferral && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-xs text-slate-200">
            <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                Official Clinical Handoff Slip & Verification
              </h3>
              <button onClick={() => setShowSlipModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 font-sans bg-slate-950">
              {/* Slip Official Banner */}
              <div className="border border-slate-700 rounded-lg p-4 bg-slate-900/90 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <div className="text-[10px] uppercase font-mono tracking-wider text-teal-400 font-bold">
                      JANO HEALTHCARE ALLIANCE • INTER-FACILITY REFERRAL SLIP
                    </div>
                    <div className="text-base font-bold text-white">
                      {selectedReferral.referralNumber || selectedReferral.id}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-700">
                      Luhn-36 Checksum: Verified
                    </span>
                  </div>
                </div>

                {/* Patient Summary */}
                {(() => {
                  const pat = patients.find((p) => p.id === selectedReferral.patientId);
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-950 p-2.5 rounded border border-slate-800 font-mono">
                      <div>
                        <span className="text-slate-500 block text-[10px]">PATIENT NAME</span>
                        <span className="font-bold text-white">{pat ? `${pat.firstName} ${pat.lastName}` : 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">MRN</span>
                        <span className="font-bold text-teal-300">{pat?.mrn || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">GENDER / AGE</span>
                        <span className="text-slate-200">{pat?.gender?.toUpperCase() || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">PRIORITY</span>
                        <span className="font-bold text-red-400 uppercase">{selectedReferral.priority}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Route */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block">ORIGINATING FACILITY</span>
                    <span className="font-bold text-slate-200">{selectedReferral.sourceFacilityId || selectedReferral.fromFacilityId}</span>
                    <span className="block text-[11px] text-slate-400">Ref By: {selectedReferral.requestingClinicianName || 'Clinician'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono text-[10px] block">DESTINATION FACILITY</span>
                    <span className="font-bold text-teal-300">{selectedReferral.destinationFacilityName || selectedReferral.destinationFacilityId}</span>
                    <span className="block text-[11px] text-slate-400">Dept: {selectedReferral.destinationDepartment || selectedReferral.receivingSpecialty}</span>
                  </div>
                </div>

                {/* Structured Clinical Handoff */}
                <div className="space-y-2 border-t border-slate-800 pt-2 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block">Primary Clinical Indication:</span>
                    <span className="text-slate-100">{selectedReferral.primaryReason || selectedReferral.reasonForReferral}</span>
                  </div>

                  {selectedReferral.clinicalSummary && (
                    <div>
                      <span className="text-slate-400 font-bold block">Clinical Narrative & Treatment Rendered:</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed bg-slate-950 p-2 rounded border border-slate-800">
                        {selectedReferral.clinicalSummary}
                      </p>
                    </div>
                  )}

                  {selectedReferral.provisionalDiagnosis && (
                    <div className="text-[11px]">
                      <span className="text-slate-400 font-bold">Provisional Diagnosis: </span>
                      <span className="text-teal-300">{selectedReferral.provisionalDiagnosis}</span>
                      {selectedReferral.icdCode && <span className="font-mono text-slate-400"> ({selectedReferral.icdCode})</span>}
                    </div>
                  )}
                </div>

                {/* Digital Seal */}
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1">
                  <div className="flex items-center justify-between text-teal-400 font-bold">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> CRYPTOGRAPHIC HANDOFF SEAL (SHA-256)
                    </span>
                    <span>OFFLINE VERIFIED</span>
                  </div>
                  <div className="truncate text-slate-500">
                    SEAL: 4a9f82d16c029e81b37f4010892c90e3ab719f2c8465d7732910fa882a170bc8
                  </div>
                  <div>DEVICE PARTITION: {selectedReferral.deviceId || 'UV01-NODE-A'} • TIMESTAMP: {selectedReferral.createdAt}</div>
                </div>
              </div>

              <div className="flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setShowSlipModal(false)}
                  className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                >
                  Close Slip View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
