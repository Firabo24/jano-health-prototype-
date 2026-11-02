/**
 * Jano Health - Clinical Diagnostic Laboratory Hub (Clinical Core V4)
 * 
 * Orchestrates the full clinical diagnostic laboratory lifecycle:
 * Order Requisition -> Specimen Collection & Barcode Accessioning ->
 * Bench Intake & Reception/Rejection -> Preliminary Result Entry ->
 * Senior Laboratory Verification -> Versioned Result Correction ->
 * Critical Panic Alert Escalation & Attested Clinician Acknowledgment.
 * 
 * Safety Governance Directive:
 * A laboratory result can inform clinical reasoning. It cannot automatically
 * become a diagnosis or treatment decision. Laboratory software may display
 * reference ranges, abnormal flags, and critical flags. It must NEVER silently
 * generate diagnoses, prescriptions, or treatments.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  FlaskConical,
  Plus,
  Search,
  ShieldAlert,
  FileText,
  Check,
  X,
  Lock,
  RefreshCw,
  User,
  Calendar,
  ArrowRight,
  FileEdit,
  PhoneCall,
  Ban,
  Activity,
  Tag,
} from 'lucide-react';
import {
  LaboratoryOrder,
  LaboratorySpecimen,
  LaboratoryResult,
  SpecimenRejectionReason,
  AbnormalFlag,
  LaboratoryOrderPriority,
} from '../domain/types';
import { localRepository } from '../services/storage/localRepository';
import { laboratoryWorkflowService } from '../services/clinical/laboratoryWorkflowService';
import { useAuth } from '../services/security/authContext';

interface LaboratoryViewProps {
  onSelectPatient: (patientId: string) => void;
}

type LabTab = 'orders' | 'specimens' | 'results' | 'critical';

export const LaboratoryView: React.FC<LaboratoryViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, can } = useAuth();

  // Primary Domain Aggregates
  const [orders, setOrders] = useState<LaboratoryOrder[]>([]);
  const [specimens, setSpecimens] = useState<LaboratorySpecimen[]>([]);
  const [results, setResults] = useState<LaboratoryResult[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<LabTab>('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals & Active Operation States
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderPatientId, setOrderPatientId] = useState('');
  const [orderTestName, setOrderTestName] = useState('');
  const [orderCategory, setOrderCategory] = useState<'hematology' | 'biochemistry' | 'microbiology' | 'parasitology' | 'rapid_diagnostic'>('parasitology');
  const [orderPriority, setOrderPriority] = useState<LaboratoryOrderPriority>('routine');
  const [orderClinicalIndication, setOrderClinicalIndication] = useState('');

  // Specimen Collection Modal
  const [collectTargetOrder, setCollectTargetOrder] = useState<LaboratoryOrder | null>(null);
  const [specimenTypeInput, setSpecimenTypeInput] = useState('WHOLE_BLOOD_EDTA');
  const [collectionSiteInput, setCollectionSiteInput] = useState('Left antecubital fossa');

  // Specimen Intake/Rejection Modal
  const [intakeTargetSpecimen, setIntakeTargetSpecimen] = useState<LaboratorySpecimen | null>(null);
  const [intakeCondition, setIntakeCondition] = useState('ADEQUATE');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<SpecimenRejectionReason>('HEMOLYZED');
  const [rejectionNotes, setRejectionNotes] = useState('');

  // Result Entry Modal
  const [resultTargetOrder, setResultTargetOrder] = useState<LaboratoryOrder | null>(null);
  const [resultValue, setResultValue] = useState('');
  const [resultNumericValue, setResultNumericValue] = useState<number | undefined>(undefined);
  const [resultUnit, setResultUnit] = useState('');
  const [resultRefRange, setResultRefRange] = useState('Negative / Normal');
  const [resultAbnormalFlag, setResultAbnormalFlag] = useState<AbnormalFlag>('NORMAL');
  const [resultCriticalFlag, setResultCriticalFlag] = useState(false);
  const [resultTechNotes, setResultTechNotes] = useState('');

  // Result Verification Modal
  const [verifyTargetResult, setVerifyTargetResult] = useState<LaboratoryResult | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');

  // Result Correction Modal
  const [correctTargetResult, setCorrectTargetResult] = useState<LaboratoryResult | null>(null);
  const [correctionNewValue, setCorrectionNewValue] = useState('');
  const [correctionNewNumeric, setCorrectionNewNumeric] = useState<number | undefined>(undefined);
  const [correctionNewFlag, setCorrectionNewFlag] = useState<AbnormalFlag>('NORMAL');
  const [correctionNewCritical, setCorrectionNewCritical] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');

  // Critical Alert Acknowledgment Modal
  const [ackTargetResult, setAckTargetResult] = useState<LaboratoryResult | null>(null);
  const [ackActionTaken, setAckActionTaken] = useState('');
  const [ackNotes, setAckNotes] = useState('');

  // Order Cancellation Modal
  const [cancelTargetOrder, setCancelTargetOrder] = useState<LaboratoryOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // Feedback/Error handling
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      const [ordList, specList, resList, patList] = await Promise.all([
        localRepository.getLabOrders(),
        localRepository.getLabSpecimens(),
        localRepository.getLabResults(),
        localRepository.getAllPatients(),
      ]);
      setOrders(ordList);
      setSpecimens(specList);
      setResults(resList);
      setPatients(patList);
    } catch (err: any) {
      console.error('Failed to load lab data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const actorContext = useMemo(
    () => ({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      facilityId: currentFacility.id,
      deviceId: 'client-node-1',
    }),
    [currentUser, currentFacility]
  );

  const showFeedback = (msg: string, isError = false) => {
    if (isError) {
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    } else {
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess(null), 4000);
    }
  };

  // Helper map for patient lookups
  const patientMap = useMemo(() => {
    const map = new Map<string, any>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);

  // Statistics
  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'completed' && o.status !== 'CANCELLED' && o.status !== 'cancelled').length;
    const pendingCollection = orders.filter((o) => o.status === 'PLACED' || o.status === 'ordered').length;
    const onBench = specimens.filter((s) => s.status === 'COLLECTED' || s.status === 'RECEIVED').length;
    const criticalUnacked = results.filter((r) => (r.criticalFlag || r.criticalAlert) && !r.criticalAcknowledged).length;
    return { active, pendingCollection, onBench, criticalUnacked };
  }, [orders, specimens, results]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      const pat = patientMap.get(ord.patientId);
      const patName = pat ? `${pat.firstName || pat.givenName} ${pat.lastName || pat.familyName}` : '';
      const matchesSearch =
        ord.testName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ord.orderNumber && ord.orderNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        patName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat = categoryFilter === 'ALL' || ord.category === categoryFilter;
      const matchesUrg = urgencyFilter === 'ALL' || (ord.priority || ord.urgency) === urgencyFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && (ord.status !== 'COMPLETED' && ord.status !== 'completed' && ord.status !== 'CANCELLED' && ord.status !== 'cancelled')) ||
        ord.status === statusFilter;

      return matchesSearch && matchesCat && matchesUrg && matchesStatus;
    });
  }, [orders, patientMap, searchTerm, categoryFilter, urgencyFilter, statusFilter]);

  // Handlers for Lab Workflows
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderPatientId || !orderTestName.trim()) {
      showFeedback('Please select a patient and provide test name.', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await laboratoryWorkflowService.orderLabTests(
        {
          patientId: orderPatientId,
          testName: orderTestName.trim(),
          category: orderCategory,
          priority: orderPriority,
          clinicalIndication: orderClinicalIndication.trim() || undefined,
        },
        actorContext
      );
      showFeedback(`Laboratory diagnostic requisition placed for ${orderTestName}`);
      setShowOrderModal(false);
      setOrderTestName('');
      setOrderClinicalIndication('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to order lab test', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCollectSpecimen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTargetOrder) return;
    setIsSubmitting(true);
    try {
      const spec = await laboratoryWorkflowService.collectSpecimen(
        {
          orderId: collectTargetOrder.id,
          patientId: collectTargetOrder.patientId,
          specimenType: specimenTypeInput,
          collectionSite: collectionSiteInput,
        },
        actorContext
      );
      showFeedback(`Specimen collected. Generated Accession Number: ${spec.accessionNumber}`);
      setCollectTargetOrder(null);
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to collect specimen', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIntakeSpecimen = async () => {
    if (!intakeTargetSpecimen) return;
    setIsSubmitting(true);
    try {
      if (isRejecting) {
        if (!rejectionNotes.trim()) {
          showFeedback('Mandatory rejection notes detailing reason must be provided.', true);
          setIsSubmitting(false);
          return;
        }
        await laboratoryWorkflowService.rejectSpecimen(
          {
            specimenId: intakeTargetSpecimen.id,
            rejectionReason,
            rejectionNotes: rejectionNotes.trim(),
          },
          actorContext
        );
        showFeedback(`Specimen ${intakeTargetSpecimen.accessionNumber} marked REJECTED (${rejectionReason})`);
      } else {
        await laboratoryWorkflowService.receiveSpecimen(
          {
            specimenId: intakeTargetSpecimen.id,
            condition: intakeCondition,
          },
          actorContext
        );
        showFeedback(`Specimen ${intakeTargetSpecimen.accessionNumber} received at diagnostic bench.`);
      }
      setIntakeTargetSpecimen(null);
      setIsRejecting(false);
      setRejectionNotes('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to update specimen intake status', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnterResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultTargetOrder || !resultValue.trim()) {
      showFeedback('Observed diagnostic finding or value is required.', true);
      return;
    }
    setIsSubmitting(true);
    try {
      const matchingSpecimen = specimens.find((s) => s.orderId === resultTargetOrder.id);
      await laboratoryWorkflowService.enterPreliminaryResult(
        {
          orderId: resultTargetOrder.id,
          patientId: resultTargetOrder.patientId,
          specimenId: matchingSpecimen?.id,
          testName: resultTargetOrder.testName || 'Diagnostic Test',
          value: resultValue.trim(),
          numericValue: resultNumericValue,
          unit: resultUnit.trim() || undefined,
          referenceRange: resultRefRange.trim() || 'Normal',
          abnormalFlag: resultAbnormalFlag,
          criticalFlag: resultCriticalFlag || resultAbnormalFlag === 'CRITICAL',
          technicianNotes: resultTechNotes.trim() || undefined,
        },
        actorContext
      );
      showFeedback(`Preliminary finding saved for ${resultTargetOrder.testName}. Awaiting verification.`);
      setResultTargetOrder(null);
      setResultValue('');
      setResultNumericValue(undefined);
      setResultTechNotes('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to enter laboratory result', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyResult = async () => {
    if (!verifyTargetResult) return;
    setIsSubmitting(true);
    try {
      await laboratoryWorkflowService.verifyResult(
        {
          resultId: verifyTargetResult.id,
          verificationNotes: verificationNotes.trim() || undefined,
        },
        actorContext
      );
      showFeedback(`Result ${verifyTargetResult.id} verified and finalized by senior scientist.`);
      setVerifyTargetResult(null);
      setVerificationNotes('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to verify laboratory result', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCorrectResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctTargetResult || !correctionNewValue.trim() || !correctionReason.trim()) {
      showFeedback('Amended value and mandatory clinical correction reason are required.', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await laboratoryWorkflowService.correctResult(
        {
          resultId: correctTargetResult.id,
          newValue: correctionNewValue.trim(),
          newNumericValue: correctionNewNumeric,
          newAbnormalFlag: correctionNewFlag,
          newCriticalFlag: correctionNewCritical,
          correctionReason: correctionReason.trim(),
        },
        actorContext
      );
      showFeedback(`Result amended with versioned audit history: ${correctionReason}`);
      setCorrectTargetResult(null);
      setCorrectionNewValue('');
      setCorrectionReason('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to amend laboratory result', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledgeCritical = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackTargetResult || !ackActionTaken.trim()) {
      showFeedback('Documented clinical action taken is mandatory to acknowledge panic values.', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await laboratoryWorkflowService.acknowledgeCriticalResult(
        {
          resultId: ackTargetResult.id,
          clinicalActionTaken: ackActionTaken.trim(),
          notes: ackNotes.trim() || undefined,
        },
        actorContext
      );
      showFeedback('Critical alert acknowledged. Clinical action logged in immutable audit chain.');
      setAckTargetResult(null);
      setAckActionTaken('');
      setAckNotes('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to acknowledge critical alert', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTargetOrder || !cancellationReason.trim()) {
      showFeedback('Structured clinical cancellation reason is mandatory.', true);
      return;
    }
    setIsSubmitting(true);
    try {
      await laboratoryWorkflowService.cancelLabOrder(
        cancelTargetOrder.id,
        cancellationReason.trim(),
        actorContext
      );
      showFeedback(`Order ${cancelTargetOrder.orderNumber || cancelTargetOrder.id} cancelled.`);
      setCancelTargetOrder(null);
      setCancellationReason('');
      await loadData();
    } catch (err: any) {
      showFeedback(err.message || 'Failed to cancel laboratory order', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Laboratory Diagnostic Hub
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800 font-semibold">
                  Core V4
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Authoritative requisition, barcode accessioning, specimen intake, diagnostic verification, and panic alert escalation
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadData}
            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh laboratory records"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>

          <button
            onClick={() => {
              if (can('lab:order')) {
                setShowOrderModal(true);
              } else {
                showFeedback('Ordering laboratory diagnostics requires physician or clinical officer authorization.', true);
              }
            }}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm ${
              can('lab:order')
                ? 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {!can('lab:order') && <Lock className="w-3.5 h-3.5 text-slate-400" />}
            <Plus className="w-3.5 h-3.5" /> New Requisition
          </button>
        </div>
      </div>

      {/* Safety Directive Governance Notice */}
      <div className="bg-blue-950/40 border border-blue-900/60 p-3 rounded-lg flex items-start gap-2.5 text-xs text-blue-200">
        <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-blue-300">Clinical Safety Directives Enforced:</span>
          <p className="text-blue-200/90 leading-relaxed text-[11px]">
            Laboratory results inform diagnostic and therapeutic reasoning; they never silently generate diagnoses, prescriptions, or treatments.
            Critical panic values demand explicit clinical attestation and documented escalation actions.
          </p>
        </div>
      </div>

      {/* Feedback Messages */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400 text-[11px]">Active Requisitions</div>
          <div className="text-xl font-bold text-slate-100 mt-1 font-mono">{stats.active}</div>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400 text-[11px]">Pending Collection</div>
          <div className="text-xl font-bold text-amber-400 mt-1 font-mono">{stats.pendingCollection}</div>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <div className="text-slate-400 text-[11px]">On Diagnostic Bench</div>
          <div className="text-xl font-bold text-purple-400 mt-1 font-mono">{stats.onBench}</div>
        </div>
        <div
          onClick={() => setActiveTab('critical')}
          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
            stats.criticalUnacked > 0
              ? 'bg-red-950/40 border-red-800/80 hover:bg-red-950/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-red-400 text-[11px] font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-400" /> Critical Alerts
            </span>
            {stats.criticalUnacked > 0 && (
              <span className="animate-pulse w-2 h-2 rounded-full bg-red-500" />
            )}
          </div>
          <div className="text-xl font-bold text-red-400 mt-1 font-mono">{stats.criticalUnacked} unacknowledged</div>
        </div>
      </div>

      {/* Workflow Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'orders'
              ? 'border-teal-500 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          Requisitions & Orders ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('specimens')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'specimens'
              ? 'border-teal-500 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          Specimen Accessioning & Bench ({specimens.length})
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'results'
              ? 'border-teal-500 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Results & Verification ({results.length})
        </button>
        <button
          onClick={() => setActiveTab('critical')}
          className={`px-3 py-2 border-b-2 font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'critical'
              ? 'border-red-500 text-red-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          Critical Panic Escalation ({stats.criticalUnacked})
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search test name, order number, or patient name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-300 text-xs"
          >
            <option value="ALL">All Categories</option>
            <option value="parasitology">Parasitology</option>
            <option value="hematology">Hematology</option>
            <option value="biochemistry">Biochemistry</option>
            <option value="microbiology">Microbiology</option>
            <option value="rapid_diagnostic">Rapid Diagnostic</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-300 text-xs"
          >
            <option value="ALL">All Urgencies</option>
            <option value="stat">STAT / Immediate</option>
            <option value="urgent">Urgent</option>
            <option value="routine">Routine</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded px-2.5 py-1.5 text-slate-300 text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active (Incomplete)</option>
            <option value="PLACED">Placed</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* TAB 1: REQUISITIONS & ORDERS QUEUE */}
      {activeTab === 'orders' && (
        <div className="space-y-2.5">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg text-xs">
              No laboratory requisitions match the selected filters.
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const pat = patientMap.get(ord.patientId);
              const patName = pat ? `${pat.firstName || pat.givenName} ${pat.lastName || pat.familyName}` : ord.patientId;
              const matchingSpec = specimens.find((s) => s.orderId === ord.id);
              const matchingRes = results.find((r) => r.orderId === ord.id);
              const isCompleted = ord.status === 'COMPLETED' || ord.status === 'completed';
              const isCancelled = ord.status === 'CANCELLED' || ord.status === 'cancelled';

              return (
                <div
                  key={ord.id}
                  className={`p-3.5 rounded-lg border transition-colors ${
                    isCancelled
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
                      : isCompleted
                      ? 'bg-slate-900/80 border-emerald-900/40'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{ord.testName}</span>
                        {ord.orderNumber && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700 font-bold">
                            {ord.orderNumber}
                          </span>
                        )}
                        <span
                          className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                            (ord.priority || ord.urgency) === 'stat'
                              ? 'bg-red-950 text-red-300 border-red-800'
                              : (ord.priority || ord.urgency) === 'urgent'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {ord.priority || ord.urgency || 'routine'}
                        </span>
                        <span
                          className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                            isCompleted
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : isCancelled
                              ? 'bg-red-950/50 text-red-400 border-red-900'
                              : 'bg-purple-950 text-purple-300 border-purple-800'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => onSelectPatient(ord.patientId)}
                          className="text-teal-400 hover:underline cursor-pointer font-medium"
                        >
                          Patient: {patName} ({pat?.mrn || ord.patientId})
                        </span>
                        <span>•</span>
                        <span>Category: {ord.category || 'general'}</span>
                        <span>•</span>
                        <span>Requisitioned: {new Date(ord.requestedAt || ord.orderedAt || '').toLocaleString()}</span>
                        {ord.orderingClinicianName && (
                          <>
                            <span>•</span>
                            <span>Clinician: {ord.orderingClinicianName}</span>
                          </>
                        )}
                      </div>

                      {ord.clinicalIndication && (
                        <div className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/80">
                          <strong className="text-slate-400">Indication:</strong> {ord.clinicalIndication}
                        </div>
                      )}

                      {ord.cancellationReason && (
                        <div className="text-[11px] text-red-300 bg-red-950/30 p-2 rounded border border-red-900/60">
                          <strong className="text-red-400">Cancelled:</strong> {ord.cancellationReason}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      {!isCompleted && !isCancelled && (
                        <>
                          {!matchingSpec && (
                            <button
                              onClick={() => {
                                if (can('lab:specimen_collect')) {
                                  setCollectTargetOrder(ord);
                                } else {
                                  showFeedback('Specimen collection requires licensed nurse or phlebotomist privileges.', true);
                                }
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                                can('lab:specimen_collect')
                                  ? 'bg-teal-700 hover:bg-teal-600 text-white'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {!can('lab:specimen_collect') && <Lock className="w-3 h-3 text-slate-400" />}
                              Collect Specimen
                            </button>
                          )}

                          {!matchingRes && (
                            <button
                              onClick={() => {
                                if (can('lab:result_entry')) {
                                  setResultTargetOrder(ord);
                                  setResultValue('');
                                  setResultRefRange('Normal / Negative');
                                  setResultAbnormalFlag('NORMAL');
                                  setResultCriticalFlag(false);
                                } else {
                                  showFeedback('Entering diagnostic results requires licensed laboratory technician privileges.', true);
                                }
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                                can('lab:result_entry')
                                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {!can('lab:result_entry') && <Lock className="w-3 h-3 text-slate-400" />}
                              Enter Findings
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (can('lab:order_cancel')) {
                                setCancelTargetOrder(ord);
                              } else {
                                showFeedback('Cancelling orders requires authorized clinician authorization.', true);
                              }
                            }}
                            className="px-2 py-1 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-slate-700 transition-colors"
                            title="Cancel Requisition"
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {matchingRes && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium">
                          Result Logged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: SPECIMEN ACCESSIONING & BENCH */}
      {activeTab === 'specimens' && (
        <div className="space-y-2.5">
          {specimens.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg text-xs">
              No specimens currently registered. Use the Requisitions tab to collect specimens for pending orders.
            </div>
          ) : (
            specimens.map((spec) => {
              const ord = orders.find((o) => o.id === spec.orderId);
              const pat = patientMap.get(spec.patientId);
              const patName = pat ? `${pat.firstName || pat.givenName} ${pat.lastName || pat.familyName}` : spec.patientId;

              return (
                <div
                  key={spec.id}
                  className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800">
                        {spec.accessionNumber}
                      </span>
                      <span className="font-semibold text-white">{spec.specimenType}</span>
                      <span
                        className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                          spec.status === 'RECEIVED'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : spec.status === 'REJECTED'
                            ? 'bg-red-950 text-red-300 border-red-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {spec.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Patient: <strong className="text-slate-200">{patName}</strong></span>
                      <span>•</span>
                      <span>Order: {ord?.testName || spec.orderId}</span>
                      <span>•</span>
                      <span>Condition: {spec.condition || 'ADEQUATE'}</span>
                      {spec.collectedAt && (
                        <>
                          <span>•</span>
                          <span>Collected: {new Date(spec.collectedAt).toLocaleTimeString()} by {spec.collectedByName}</span>
                        </>
                      )}
                    </div>

                    {spec.rejectionReason && (
                      <div className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded border border-red-800/80">
                        <strong>Rejected ({spec.rejectionReason}):</strong> {spec.rejectionNotes}
                      </div>
                    )}
                  </div>

                  {/* Intake Action */}
                  <div className="shrink-0 flex items-center gap-2">
                    {spec.status === 'COLLECTED' && (
                      <button
                        onClick={() => {
                          if (can('lab:specimen_receive')) {
                            setIntakeTargetSpecimen(spec);
                            setIsRejecting(false);
                          } else {
                            showFeedback('Receiving specimens at diagnostic bench requires laboratory scientist authorization.', true);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        Bench Intake
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: RESULTS & SENIOR VERIFICATION */}
      {activeTab === 'results' && (
        <div className="space-y-2.5">
          {results.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg text-xs">
              No diagnostic test results recorded yet.
            </div>
          ) : (
            results.map((res) => {
              const pat = patientMap.get(res.patientId);
              const patName = pat ? `${pat.firstName || pat.givenName} ${pat.lastName || pat.familyName}` : res.patientId;
              const isFinal = res.status === 'FINAL';
              const isCorrected = res.status === 'CORRECTED';
              const isCritical = res.criticalFlag || res.criticalAlert;

              return (
                <div
                  key={res.id}
                  className={`p-3.5 rounded-lg border text-xs space-y-2.5 ${
                    isCritical
                      ? 'bg-red-950/20 border-red-900/60'
                      : isFinal
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-slate-900/90 border-purple-900/50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">
                          {res.testName || res.parameterName}
                        </span>
                        <span
                          className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${
                            isFinal
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : isCorrected
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-purple-950 text-purple-300 border-purple-800'
                          }`}
                        >
                          {res.status || 'PRELIMINARY'}
                        </span>
                        {isCritical && (
                          <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-400" /> CRITICAL PANIC VALUE
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                        <span>Patient: <strong className="text-teal-400">{patName}</strong></span>
                        <span>•</span>
                        <span>Logged: {new Date(res.performedAt || res.completedAt || res.createdAt || '').toLocaleString()}</span>
                        {res.performerName && (
                          <>
                            <span>•</span>
                            <span>Performer: {res.performerName}</span>
                          </>
                        )}
                        {res.verifiedByName && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400">Verified by: {res.verifiedByName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Result Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                      {!isFinal && (
                        <button
                          onClick={() => {
                            if (can('lab:result_verify')) {
                              setVerifyTargetResult(res);
                            } else {
                              showFeedback('Final laboratory verification requires licensed senior scientist authorization.', true);
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                            can('lab:result_verify')
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {!can('lab:result_verify') && <Lock className="w-3 h-3 text-slate-400" />}
                          Verify & Finalize
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (can('lab:result_correct')) {
                            setCorrectTargetResult(res);
                            setCorrectionNewValue(res.value);
                            setCorrectionNewNumeric(res.numericValue);
                            setCorrectionNewFlag(res.abnormalFlag || 'NORMAL');
                            setCorrectionNewCritical(res.criticalFlag || false);
                          } else {
                            showFeedback('Correcting or amending laboratory results requires authorized laboratory privileges.', true);
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                          can('lab:result_correct')
                            ? 'border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
                            : 'bg-slate-900 text-slate-500 border-slate-800'
                        }`}
                      >
                        <FileEdit className="w-3 h-3" /> Amend
                      </button>
                    </div>
                  </div>

                  {/* Findings Box */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Analyte / Finding</div>
                      <div className="text-sm font-bold text-slate-100 mt-0.5">{res.value} {res.unit && res.unit !== 'N/A' ? res.unit : ''}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Reference Range</div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        {typeof res.referenceRange === 'string' ? res.referenceRange : (res.referenceRange as any)?.textDisplay || 'Normal'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Abnormal Flag</div>
                      <div className="text-xs font-semibold mt-0.5">
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            res.abnormalFlag === 'CRITICAL'
                              ? 'bg-red-950 text-red-300'
                              : res.abnormalFlag === 'HIGH' || res.abnormalFlag === 'LOW' || res.abnormalFlag === 'ABNORMAL'
                              ? 'bg-amber-950 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {res.abnormalFlag || (res.isAbnormal ? 'ABNORMAL' : 'NORMAL')}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-mono">Integrity Chain</div>
                      <div className="text-[10px] font-mono text-teal-400 mt-0.5">
                        v{res.version || 1} • {res.syncStatus || 'LOCAL_ONLY'}
                      </div>
                    </div>
                  </div>

                  {res.technicianNotes && (
                    <div className="text-[11px] text-slate-400 italic">
                      Technician Notes: {res.technicianNotes}
                    </div>
                  )}

                  {/* Versioned Correction Lineage */}
                  {res.correctionHistory && res.correctionHistory.length > 0 && (
                    <div className="p-2 bg-amber-950/20 border border-amber-900/40 rounded space-y-1 text-[11px]">
                      <div className="font-semibold text-amber-400 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Audit Correction Lineage:
                      </div>
                      {res.correctionHistory.map((ch, idx) => (
                        <div key={idx} className="text-amber-200/90 pl-4 border-l border-amber-800/80">
                          Amended on {new Date(ch.correctedAt).toLocaleString()} by {ch.correctedByName}: Previous Value: "{ch.previousValue}" • Reason: {ch.correctionReason}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: CRITICAL PANIC ESCALATION */}
      {activeTab === 'critical' && (
        <div className="space-y-3">
          <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-red-300">Mandatory Critical Value Escalation:</span>
              <p className="mt-0.5 text-red-200/90 leading-relaxed text-[11px]">
                Critical laboratory values represent life-threatening physiological states requiring immediate clinical intervention.
                Clinicians must attest and log concrete actions taken (e.g. blood transfusion ordered, ICU transfer, antimalarial regimen started).
              </p>
            </div>
          </div>

          {results.filter((r) => r.criticalFlag || r.criticalAlert).length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-lg text-xs">
              No critical panic laboratory values currently recorded.
            </div>
          ) : (
            results
              .filter((r) => r.criticalFlag || r.criticalAlert)
              .map((critRes) => {
                const pat = patientMap.get(critRes.patientId);
                const patName = pat ? `${pat.firstName || pat.givenName} ${pat.lastName || pat.familyName}` : critRes.patientId;
                const isAcked = critRes.criticalAcknowledged;

                return (
                  <div
                    key={critRes.id}
                    className={`p-4 rounded-lg border space-y-3 text-xs ${
                      isAcked
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-red-950/30 border-red-700/80 shadow-lg shadow-red-950/20'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">
                            {critRes.testName || critRes.parameterName}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-900 text-white uppercase tracking-wider">
                            CRITICAL VALUE
                          </span>
                          {isAcked ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                              ACKNOWLEDGED
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 animate-pulse">
                              UNACKNOWLEDGED
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-1">
                          Patient: <strong className="text-white">{patName}</strong> (MRN: {pat?.mrn}) • Logged at: {new Date(critRes.performedAt || critRes.completedAt || '').toLocaleString()}
                        </div>
                      </div>

                      {!isAcked && (
                        <button
                          onClick={() => {
                            if (can('lab:critical_acknowledge')) {
                              setAckTargetResult(critRes);
                            } else {
                              showFeedback('Acknowledging critical panic values requires licensed clinician authorization.', true);
                            }
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            can('lab:critical_acknowledge')
                              ? 'bg-red-600 hover:bg-red-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <PhoneCall className="w-3.5 h-3.5" /> Acknowledge & Document Action
                        </button>
                      )}
                    </div>

                    <div className="p-3 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 font-mono">Panic Diagnostic Finding</div>
                        <div className="text-base font-bold text-red-400 mt-0.5">{critRes.value}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-mono">Normal Reference Interval</div>
                        <div className="text-xs text-slate-300 mt-0.5">{typeof critRes.referenceRange === 'string' ? critRes.referenceRange : 'Normal'}</div>
                      </div>
                    </div>

                    {isAcked && (
                      <div className="p-2.5 bg-emerald-950/30 border border-emerald-800/60 rounded text-[11px] text-emerald-200 space-y-0.5">
                        <div className="font-semibold text-emerald-300">
                          Attested by {critRes.criticalAcknowledgedByName} on {new Date(critRes.criticalAcknowledgedAt || '').toLocaleString()}:
                        </div>
                        <div>Action Taken: {critRes.criticalAcknowledgementNotes}</div>
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* MODALS */}
      {/* ==================================================== */}

      {/* 1. New Requisition Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-teal-800 rounded-xl max-w-lg w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-teal-300 flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-teal-400" /> New Laboratory Diagnostic Requisition
              </h3>
              <button
                onClick={() => setShowOrderModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Select Patient *</label>
                <select
                  required
                  value={orderPatientId}
                  onChange={(e) => setOrderPatientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName || p.givenName} {p.lastName || p.familyName} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Diagnostic Test Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Malaria mRDT, CBC, Serum Creatinine"
                    value={orderTestName}
                    onChange={(e) => setOrderTestName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Laboratory Category</label>
                  <select
                    value={orderCategory}
                    onChange={(e) => setOrderCategory(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="parasitology">Parasitology (Malaria, Stool)</option>
                    <option value="rapid_diagnostic">Point-of-Care Rapid Test (mRDT)</option>
                    <option value="hematology">Hematology (CBC, ESR, Hemoglobin)</option>
                    <option value="biochemistry">Biochemistry (Electrolytes, Renal)</option>
                    <option value="microbiology">Microbiology (Culture, Gram Stain)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Clinical Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['routine', 'urgent', 'stat'] as LaboratoryOrderPriority[]).map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setOrderPriority(p)}
                      className={`py-1.5 px-2 rounded border uppercase font-bold text-[10px] cursor-pointer transition-colors ${
                        orderPriority === p
                          ? p === 'stat'
                            ? 'bg-red-950 text-red-300 border-red-700'
                            : p === 'urgent'
                            ? 'bg-amber-950 text-amber-300 border-amber-700'
                            : 'bg-teal-950 text-teal-300 border-teal-700'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Clinical Indication / Reason for Order</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Acute febrile illness with rigors, high suspicion for severe malaria."
                  value={orderClinicalIndication}
                  onChange={(e) => setOrderClinicalIndication(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1"
                >
                  {isSubmitting ? 'Submitting...' : 'Authorize Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Specimen Collection Modal */}
      {collectTargetOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-teal-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-teal-300 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-teal-400" /> Collect Specimen & Barcode Accessioning
              </h3>
              <button
                onClick={() => setCollectTargetOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
              <div><strong className="text-slate-400">Order:</strong> {collectTargetOrder.testName}</div>
              <div><strong className="text-slate-400">Requisition No:</strong> {collectTargetOrder.orderNumber || collectTargetOrder.id}</div>
            </div>

            <form onSubmit={handleCollectSpecimen} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Specimen Tube / Container Type *</label>
                <select
                  value={specimenTypeInput}
                  onChange={(e) => setSpecimenTypeInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="WHOLE_BLOOD_EDTA">Whole Blood (EDTA Lavender Top)</option>
                  <option value="SERUM_SST">Serum (SST Gold/Red Top)</option>
                  <option value="CAPILLARY_BLOOD">Capillary Fingerstick (Microtainer)</option>
                  <option value="URINE_MIDSTREAM">Urine (Clean Catch Sterile Cup)</option>
                  <option value="STOOL_CONTAINER">Stool (Sterile Container)</option>
                  <option value="SPUTUM_CONTAINER">Sputum (Sterile Cup)</option>
                  <option value="CSF_STERILE">Cerebrospinal Fluid (Sterile Tube)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Anatomical Collection Site</label>
                <input
                  type="text"
                  value={collectionSiteInput}
                  onChange={(e) => setCollectionSiteInput(e.target.value)}
                  placeholder="e.g. Left antecubital vein, fingertip"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCollectTargetOrder(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Accessioning...' : 'Confirm Collection & Accession'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Specimen Intake & Reception/Rejection Modal */}
      {intakeTargetSpecimen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-teal-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-teal-400" /> Specimen Bench Intake Station
              </h3>
              <button
                onClick={() => setIntakeTargetSpecimen(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-1">
              <div><strong className="text-slate-400">Accession No:</strong> <span className="font-mono text-teal-400">{intakeTargetSpecimen.accessionNumber}</span></div>
              <div><strong className="text-slate-400">Specimen Type:</strong> {intakeTargetSpecimen.specimenType}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRejecting(false)}
                className={`flex-1 py-1.5 rounded border font-semibold text-xs cursor-pointer ${
                  !isRejecting
                    ? 'bg-teal-950 text-teal-300 border-teal-700'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Receive on Bench
              </button>
              <button
                type="button"
                onClick={() => setIsRejecting(true)}
                className={`flex-1 py-1.5 rounded border font-semibold text-xs cursor-pointer ${
                  isRejecting
                    ? 'bg-red-950 text-red-300 border-red-700'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Reject Specimen
              </button>
            </div>

            {!isRejecting ? (
              <div>
                <label className="block text-slate-400 mb-1">Specimen Physical Condition</label>
                <select
                  value={intakeCondition}
                  onChange={(e) => setIntakeCondition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="ADEQUATE">Adequate / Optimal</option>
                  <option value="SUBOPTIMAL">Suboptimal (Acceptable with caveat)</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="block text-red-300 mb-1">Structured Rejection Reason *</label>
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value as any)}
                    className="w-full bg-slate-950 border border-red-800 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="HEMOLYZED">Sample Hemolyzed</option>
                    <option value="CLOTTED">Sample Clotted</option>
                    <option value="INSUFFICIENT_VOLUME">Insufficient Volume (QNS)</option>
                    <option value="WRONG_CONTAINER">Incorrect Specimen Container</option>
                    <option value="MISSING_LABEL">Missing or Illegible Label</option>
                    <option value="CONTAMINATED">Contaminated Specimen</option>
                    <option value="EXPIRED">Specimen Expired / Delayed Transit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-red-300 mb-1">Mandatory Rejection Notes *</label>
                  <textarea
                    rows={2}
                    placeholder="Document exact state of specimen failure and phlebotomy re-draw notification..."
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-red-800 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIntakeTargetSpecimen(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleIntakeSpecimen}
                disabled={isSubmitting}
                className={`px-4 py-1.5 rounded font-semibold text-white ${
                  isRejecting ? 'bg-red-600 hover:bg-red-500' : 'bg-teal-600 hover:bg-teal-500'
                }`}
              >
                {isSubmitting ? 'Processing...' : isRejecting ? 'Confirm Rejection' : 'Accept on Bench'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Result Entry Modal */}
      {resultTargetOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-800 rounded-xl max-w-lg w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-purple-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-purple-400" /> Enter Diagnostic Laboratory Finding
              </h3>
              <button
                onClick={() => setResultTargetOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-2.5 rounded border border-slate-800 space-y-0.5">
              <div className="text-slate-300 font-semibold">{resultTargetOrder.testName}</div>
              <div className="text-slate-500 text-[11px]">Requisition: {resultTargetOrder.orderNumber || resultTargetOrder.id}</div>
            </div>

            <form onSubmit={handleEnterResult} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Result / Value *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. POSITIVE (++++), 12.4, 4.2"
                    value={resultValue}
                    onChange={(e) => {
                      setResultValue(e.target.value);
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num)) {
                        setResultNumericValue(num);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Measurement Unit</label>
                  <input
                    type="text"
                    placeholder="e.g. g/dL, mmol/L, /uL, qualitative"
                    value={resultUnit}
                    onChange={(e) => setResultUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Reference Range Interval</label>
                  <input
                    type="text"
                    placeholder="e.g. 11.5 - 16.5, Negative"
                    value={resultRefRange}
                    onChange={(e) => setResultRefRange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Abnormal Flag</label>
                  <select
                    value={resultAbnormalFlag}
                    onChange={(e) => {
                      const flag = e.target.value as AbnormalFlag;
                      setResultAbnormalFlag(flag);
                      if (flag === 'CRITICAL') setResultCriticalFlag(true);
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                    <option value="HIGH">High</option>
                    <option value="ABNORMAL">Abnormal (General)</option>
                    <option value="CRITICAL">Critical / Panic Value</option>
                  </select>
                </div>
              </div>

              <div className="p-2.5 bg-red-950/20 border border-red-900/40 rounded flex items-center justify-between">
                <div>
                  <div className="text-red-300 font-semibold">Critical / Panic Value Flag</div>
                  <div className="text-red-400/80 text-[11px]">Triggers high-priority clinical escalation queue</div>
                </div>
                <input
                  type="checkbox"
                  checked={resultCriticalFlag}
                  onChange={(e) => {
                    setResultCriticalFlag(e.target.checked);
                    if (e.target.checked) setResultAbnormalFlag('CRITICAL');
                  }}
                  className="w-4 h-4 rounded text-red-600 bg-slate-950 border-slate-700"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Technician / Scientist Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Confirmed on duplicate read; ring forms visible on Giemsa smear."
                  value={resultTechNotes}
                  onChange={(e) => setResultTechNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResultTargetOrder(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Saving...' : 'Save Preliminary Finding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Senior Verification Modal */}
      {verifyTargetResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Senior Laboratory Verification
              </h3>
              <button
                onClick={() => setVerifyTargetResult(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
              <div><strong className="text-slate-400">Test:</strong> {verifyTargetResult.testName || verifyTargetResult.parameterName}</div>
              <div><strong className="text-slate-400">Finding:</strong> <span className="font-bold text-white">{verifyTargetResult.value} {verifyTargetResult.unit}</span></div>
              <div><strong className="text-slate-400">Analyzed By:</strong> {verifyTargetResult.performerName || verifyTargetResult.analyzedById}</div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Verification Attestation Notes</label>
              <textarea
                rows={2}
                placeholder="e.g. Quality controls validated; smear reviewed by senior scientist."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setVerifyTargetResult(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyResult}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {isSubmitting ? 'Attesting...' : 'Attest & Finalize Result'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Result Correction / Amendment Modal */}
      {correctTargetResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                <FileEdit className="w-4 h-4 text-amber-400" /> Amend Verified Result (Audit Trail)
              </h3>
              <button
                onClick={() => setCorrectTargetResult(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-slate-950 rounded border border-slate-800 space-y-0.5">
              <div className="text-slate-400">Current Value: <strong className="text-white">{correctTargetResult.value}</strong></div>
            </div>

            <form onSubmit={handleCorrectResult} className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Amended / Corrected Value *</label>
                <input
                  type="text"
                  required
                  value={correctionNewValue}
                  onChange={(e) => setCorrectionNewValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Abnormal Flag</label>
                <select
                  value={correctionNewFlag}
                  onChange={(e) => setCorrectionNewFlag(e.target.value as AbnormalFlag)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                  <option value="HIGH">High</option>
                  <option value="ABNORMAL">Abnormal</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-amber-300 mb-1">Mandatory Clinical Correction Reason *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Transcription error corrected after manual secondary review."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-800 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCorrectTargetResult(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Amending...' : 'Submit Versioned Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Critical Result Acknowledgment Modal */}
      {ackTargetResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Acknowledge Life-Threatening Critical Value
              </h3>
              <button
                onClick={() => setAckTargetResult(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-red-950/30 border border-red-900/60 rounded space-y-1">
              <div><strong className="text-red-300">Test:</strong> {ackTargetResult.testName || ackTargetResult.parameterName}</div>
              <div><strong className="text-red-300">Panic Value:</strong> <span className="font-bold text-white">{ackTargetResult.value}</span></div>
            </div>

            <form onSubmit={handleAcknowledgeCritical} className="space-y-3">
              <div>
                <label className="block text-red-300 mb-1">Clinical Action Taken *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. IV Artesunate initiated stat, intensive care bed requested, oxygen therapy started."
                  value={ackActionTaken}
                  onChange={(e) => setAckActionTaken(e.target.value)}
                  className="w-full bg-slate-950 border border-red-800 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Additional Communication Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Read-back verified over telephone by Sister Fatuma"
                  value={ackNotes}
                  onChange={(e) => setAckNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAckTargetResult(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Attesting...' : 'Attest Acknowledgment & Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Cancel Order Modal */}
      {cancelTargetOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800 rounded-xl max-w-md w-full p-4 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-red-300 flex items-center gap-1.5">
                <Ban className="w-4 h-4 text-red-400" /> Cancel Laboratory Requisition
              </h3>
              <button
                onClick={() => setCancelTargetOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-slate-950 rounded border border-slate-800 space-y-0.5">
              <div><strong className="text-slate-400">Order:</strong> {cancelTargetOrder.testName}</div>
              <div><strong className="text-slate-400">Requisition No:</strong> {cancelTargetOrder.orderNumber || cancelTargetOrder.id}</div>
            </div>

            <form onSubmit={handleCancelOrder} className="space-y-3">
              <div>
                <label className="block text-red-300 mb-1">Structured Clinical Cancellation Reason *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Duplicate order entered in error; clinician reassessed and substituted alternative test."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full bg-slate-950 border border-red-800 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancelTargetOrder(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold"
                >
                  {isSubmitting ? 'Cancelling...' : 'Confirm Order Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
