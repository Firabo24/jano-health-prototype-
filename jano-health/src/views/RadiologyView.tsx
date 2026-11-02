/**
 * Jano Health - Clinical Diagnostic Radiology & Imaging Hub (Clinical Core V5)
 * 
 * Orchestrates the full clinical diagnostic imaging lifecycle:
 * Order Requisition -> Study Scheduling & Accessioning ->
 * Image Acquisition & Technologist Attribution -> Diagnostic Interpretation ->
 * Senior Radiologist Finalization & Cryptographic Sealing (SHA-256) ->
 * Versioned Immutable Report Amendment -> Critical Imaging Alert Escalation & Attested Clinician Acknowledgment.
 * 
 * Safety Governance Directive:
 * An imaging study produces observational evidence and a diagnostic report.
 * An authorized clinician synthesizes this evidence with clinical findings to determine diagnoses.
 * Radiology Order ≠ Radiology Study ≠ Radiology Report ≠ Diagnosis.
 * Imaging software may display flags and abnormal findings, but must NEVER silently
 * generate diagnoses, treatments, or prescriptions.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  FileText,
  Plus,
  Search,
  ShieldAlert,
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
  Layers,
  Film,
  ShieldCheck,
  History,
  Radio,
  Eye,
} from 'lucide-react';
import {
  RadiologyOrder,
  RadiologyStudy,
  RadiologyReport,
  CriticalRadiologyFinding,
  RadiologyModality,
  RadiologyOrderPriority,
  RadiologyLaterality,
  Patient,
} from '../domain/types';
import { localRepository } from '../services/storage/localRepository';
import { radiologyWorkflowService } from '../services/clinical/radiologyWorkflowService';
import { useAuth } from '../services/security/authContext';
import { ClinicalActorContext } from '../services/clinical/clinicalTransaction';

interface RadiologyViewProps {
  onSelectPatient: (patientId: string) => void;
}

type RadTab = 'orders' | 'studies' | 'reports' | 'critical';

export const RadiologyView: React.FC<RadiologyViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, can } = useAuth();

  // Primary Domain Aggregates
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [studies, setStudies] = useState<RadiologyStudy[]>([]);
  const [reports, setReports] = useState<RadiologyReport[]>([]);
  const [criticalFindings, setCriticalFindings] = useState<CriticalRadiologyFinding[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<RadTab>('orders');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalityFilter, setModalityFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals & Active Operation States
  // 1. Order Modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderPatientId, setOrderPatientId] = useState('');
  const [orderModality, setOrderModality] = useState<RadiologyModality>('XR');
  const [orderBodySite, setOrderBodySite] = useState('');
  const [orderLaterality, setOrderLaterality] = useState<RadiologyLaterality>('NOT_APPLICABLE');
  const [orderPriority, setOrderPriority] = useState<RadiologyOrderPriority>('routine');
  const [orderIndication, setOrderIndication] = useState('');
  const [orderClinicalQuestion, setOrderClinicalQuestion] = useState('');
  const [orderStudyType, setOrderStudyType] = useState('');
  const [orderContrast, setOrderContrast] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');

  // 2. Cancellation Modal
  const [cancellingOrder, setCancellingOrder] = useState<RadiologyOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // 3. Scheduling Modal
  const [schedulingOrder, setSchedulingOrder] = useState<RadiologyOrder | null>(null);
  const [scheduledTime, setScheduledTime] = useState(new Date().toISOString().slice(0, 16));
  const [studyDescriptionInput, setStudyDescriptionInput] = useState('');

  // 4. Study Acquisition Complete Modal
  const [completingStudy, setCompletingStudy] = useState<RadiologyStudy | null>(null);
  const [seriesDescription, setSeriesDescription] = useState('Standard Views');
  const [instanceCountInput, setInstanceCountInput] = useState('2');

  // 5. Report Draft/Finalize Modal
  const [reportingStudy, setReportingStudy] = useState<RadiologyStudy | null>(null);
  const [existingReport, setExistingReport] = useState<RadiologyReport | null>(null);
  const [reportTechnique, setReportTechnique] = useState('');
  const [reportFindings, setReportFindings] = useState('');
  const [reportImpression, setReportImpression] = useState('');
  const [reportRecommendations, setReportRecommendations] = useState('');
  const [reportComparison, setReportComparison] = useState('');
  const [reportIsCritical, setReportIsCritical] = useState(false);
  const [criticalDescription, setCriticalDescription] = useState('');
  const [reportMode, setReportMode] = useState<'DRAFT' | 'FINAL'>('FINAL');

  // 6. Amendment Modal
  const [amendingReport, setAmendingReport] = useState<RadiologyReport | null>(null);
  const [amendedFindings, setAmendedFindings] = useState('');
  const [amendedImpression, setAmendedImpression] = useState('');
  const [amendedReason, setAmendedReason] = useState('');
  const [amendedRecommendations, setAmendedRecommendations] = useState('');

  // 7. Critical Finding Acknowledgment Modal
  const [acknowledgingFinding, setAcknowledgingFinding] = useState<CriticalRadiologyFinding | null>(null);
  const [actionTakenInput, setActionTakenInput] = useState('');
  const [communicationMethodInput, setCommunicationMethodInput] = useState('DIRECT_PHONE_CALL');
  const [ackNotesInput, setAckNotesInput] = useState('');

  // Status & Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const actorContext: ClinicalActorContext = useMemo(
    () => ({
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.role,
      facilityId: currentFacility.id,
      deviceId: 'web-workstation-01',
    }),
    [currentUser, currentFacility]
  );

  const reloadData = async () => {
    try {
      setIsLoading(true);
      const [ordList, stdList, repList, critList, patList] = await Promise.all([
        localRepository.getRadiologyOrders(undefined, currentFacility.id),
        localRepository.getRadiologyStudies(undefined, undefined, currentFacility.id),
        localRepository.getRadiologyReports(undefined, undefined, undefined, currentFacility.id),
        localRepository.getCriticalRadiologyFindings(currentFacility.id),
        localRepository.getAllPatients(),
      ]);
      setOrders(ordList);
      setStudies(stdList);
      setReports(repList);
      setCriticalFindings(critList);
      setPatients(patList);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading radiology data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    reloadData();
  }, [currentFacility.id]);

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);

  const unacknowledgedCount = useMemo(() => {
    return criticalFindings.filter((f) => !f.acknowledged).length;
  }, [criticalFindings]);

  // Handle New Order Requisition
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.orderRadiology(
        {
          patientId: orderPatientId,
          modality: orderModality,
          bodySite: orderBodySite,
          laterality: orderLaterality,
          priority: orderPriority,
          clinicalIndication: orderIndication,
          clinicalQuestion: orderClinicalQuestion,
          requestedStudyType: orderStudyType || `${orderModality} ${orderBodySite}`,
          contrastRequested: orderContrast,
          notes: orderNotes,
        },
        actorContext
      );
      setSuccessMsg('Radiology requisition submitted successfully.');
      setShowOrderModal(false);
      resetOrderForm();
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const resetOrderForm = () => {
    setOrderPatientId('');
    setOrderModality('XR');
    setOrderBodySite('');
    setOrderLaterality('NOT_APPLICABLE');
    setOrderPriority('routine');
    setOrderIndication('');
    setOrderClinicalQuestion('');
    setOrderStudyType('');
    setOrderContrast(false);
    setOrderNotes('');
  };

  // Handle Cancel Order
  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder || !cancellationReason.trim()) return;
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.cancelRadiologyOrder(
        {
          orderId: cancellingOrder.id,
          cancellationReason: cancellationReason.trim(),
        },
        actorContext
      );
      setSuccessMsg('Radiology order cancelled.');
      setCancellingOrder(null);
      setCancellationReason('');
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Schedule Study
  const handleScheduleStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingOrder) return;
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.scheduleRadiologyStudy(
        {
          orderId: schedulingOrder.id,
          studyDescription: studyDescriptionInput || `${schedulingOrder.modality} ${schedulingOrder.bodySite}`,
          scheduledTime,
        },
        actorContext
      );
      setSuccessMsg('Imaging study scheduled with unique accession barcode.');
      setSchedulingOrder(null);
      setStudyDescriptionInput('');
      await reloadData();
      setActiveTab('studies');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Start Acquisition
  const handleStartAcquisition = async (study: RadiologyStudy) => {
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.startAcquisition(
        {
          studyId: study.id,
          technologistId: currentUser.id,
          technologistName: currentUser.fullName,
        },
        actorContext
      );
      setSuccessMsg(`Acquisition initiated for ${study.accessionNumber}.`);
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Complete Study
  const handleCompleteStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingStudy) return;
    setErrorMsg(null);
    try {
      const count = parseInt(instanceCountInput, 10) || 1;
      const now = new Date().toISOString();
      const series = [
        {
          id: `ser-${Date.now()}-1`,
          studyId: completingStudy.id,
          seriesNumber: 1,
          modality: completingStudy.modality,
          seriesDescription,
          bodySite: completingStudy.bodySite,
          instanceCount: count,
          instances: Array.from({ length: count }, (_, i) => ({
            id: `inst-${Date.now()}-${i + 1}`,
            seriesId: `ser-${Date.now()}-1`,
            instanceNumber: i + 1,
            sopClassUid: '1.2.840.10008.5.1.4.1.1.1',
            sopInstanceUid: `1.2.840.113619.2.1.${Date.now()}.${i + 1}`,
            createdAt: now,
          })),
          createdAt: now,
        },
      ];

      await radiologyWorkflowService.completeStudy(
        {
          studyId: completingStudy.id,
          series,
          studyDescription: completingStudy.studyDescription,
        },
        actorContext
      );
      setSuccessMsg(`Imaging acquisition completed. ${count} image instance(s) ready for interpretation.`);
      setCompletingStudy(null);
      setSeriesDescription('Standard Views');
      setInstanceCountInput('2');
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Open Report Modal
  const handleOpenReportModal = (study: RadiologyStudy) => {
    const matchedReport = reports.find((r) => r.studyId === study.id);
    setReportingStudy(study);
    setExistingReport(matchedReport || null);
    if (matchedReport) {
      setReportTechnique(matchedReport.technique || '');
      setReportFindings(matchedReport.findings);
      setReportImpression(matchedReport.impression);
      setReportRecommendations(matchedReport.recommendations || '');
      setReportComparison(matchedReport.comparisonText || '');
      setReportIsCritical(matchedReport.criticalFinding ?? false);
    } else {
      setReportTechnique(`Standard protocol ${study.modality} examination.`);
      setReportFindings('');
      setReportImpression('');
      setReportRecommendations('');
      setReportComparison('No prior studies available for comparison.');
      setReportIsCritical(false);
    }
    setCriticalDescription('');
    setReportMode('FINAL');
  };

  // Handle Save / Sign Report
  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingStudy) return;
    setErrorMsg(null);
    try {
      if (reportMode === 'DRAFT') {
        await radiologyWorkflowService.draftReport(
          {
            studyId: reportingStudy.id,
            orderId: reportingStudy.orderId,
            patientId: reportingStudy.patientId,
            encounterId: reportingStudy.encounterId,
            findings: reportFindings,
            impression: reportImpression,
            technique: reportTechnique,
            comparisonText: reportComparison,
            recommendations: reportRecommendations,
            criticalFinding: reportIsCritical,
          },
          actorContext
        );
        setSuccessMsg('Preliminary draft report saved.');
      } else {
        await radiologyWorkflowService.finalizeReport(
          {
            reportId: existingReport?.id,
            studyId: reportingStudy.id,
            orderId: reportingStudy.orderId,
            patientId: reportingStudy.patientId,
            encounterId: reportingStudy.encounterId,
            findings: reportFindings,
            impression: reportImpression,
            technique: reportTechnique,
            comparisonText: reportComparison,
            recommendations: reportRecommendations,
            criticalFinding: reportIsCritical,
            criticalFindingDescription: criticalDescription || reportImpression,
          },
          actorContext
        );
        setSuccessMsg('Diagnostic imaging report digitally signed, sealed with SHA-256 integrity hash, and released.');
      }
      setReportingStudy(null);
      setExistingReport(null);
      await reloadData();
      setActiveTab('reports');
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Open Amendment Modal
  const handleOpenAmendmentModal = (report: RadiologyReport) => {
    setAmendingReport(report);
    setAmendedFindings(report.findings);
    setAmendedImpression(report.impression);
    setAmendedReason('');
    setAmendedRecommendations(report.recommendations || '');
  };

  // Handle Submit Amendment
  const handleSubmitAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingReport || !amendedReason.trim()) return;
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.amendReport(
        {
          reportId: amendingReport.id,
          newFindings: amendedFindings,
          newImpression: amendedImpression,
          amendmentReason: amendedReason.trim(),
          newRecommendations: amendedRecommendations,
        },
        actorContext
      );
      setSuccessMsg('Report formally amended with immutable historical lineage.');
      setAmendingReport(null);
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle Acknowledge Critical Finding
  const handleAcknowledgeCriticalFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acknowledgingFinding || !actionTakenInput.trim()) return;
    setErrorMsg(null);
    try {
      await radiologyWorkflowService.acknowledgeCriticalFinding(
        {
          findingId: acknowledgingFinding.id,
          actionTaken: actionTakenInput.trim(),
          communicationMethod: communicationMethodInput,
          notes: ackNotesInput.trim() || undefined,
        },
        actorContext
      );
      setSuccessMsg('Critical alert formally acknowledged with attested clinical action.');
      setAcknowledgingFinding(null);
      setActionTakenInput('');
      setAckNotesInput('');
      await reloadData();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (modalityFilter !== 'ALL' && o.modality !== modalityFilter) return false;
      if (priorityFilter !== 'ALL' && o.priority !== priorityFilter) return false;
      if (statusFilter !== 'ALL' && o.status.toUpperCase() !== statusFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const p = patientMap.get(o.patientId);
        const nameMatch = p ? `${p.givenName} ${p.familyName}`.toLowerCase().includes(term) : false;
        const mrnMatch = p?.mrn.toLowerCase().includes(term) ?? false;
        const numMatch = o.orderNumber?.toLowerCase().includes(term) ?? false;
        const siteMatch = o.bodySite.toLowerCase().includes(term);
        return nameMatch || mrnMatch || numMatch || siteMatch;
      }
      return true;
    });
  }, [orders, modalityFilter, priorityFilter, statusFilter, searchTerm, patientMap]);

  // Filtered Studies
  const filteredStudies = useMemo(() => {
    return studies.filter((s) => {
      if (modalityFilter !== 'ALL' && s.modality !== modalityFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const p = patientMap.get(s.patientId);
        const nameMatch = p ? `${p.givenName} ${p.familyName}`.toLowerCase().includes(term) : false;
        const accMatch = s.accessionNumber.toLowerCase().includes(term);
        const stdMatch = s.studyNumber.toLowerCase().includes(term);
        const descMatch = s.studyDescription.toLowerCase().includes(term);
        return nameMatch || accMatch || stdMatch || descMatch;
      }
      return true;
    });
  }, [studies, modalityFilter, statusFilter, searchTerm, patientMap]);

  // Filtered Reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const p = patientMap.get(r.patientId);
        const nameMatch = p ? `${p.givenName} ${p.familyName}`.toLowerCase().includes(term) : false;
        const impMatch = r.impression.toLowerCase().includes(term);
        const findMatch = r.findings.toLowerCase().includes(term);
        return nameMatch || impMatch || findMatch;
      }
      return true;
    });
  }, [reports, searchTerm, patientMap]);

  return (
    <div className="space-y-4">
      {/* Header & Clinical Safety Directive Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-indigo-950/80 border border-indigo-700/50 text-indigo-400">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Diagnostic Radiology & Imaging Hub
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono font-bold">
                    CORE V5
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Plain Radiography (XR), CT, MRI, Diagnostic Ultrasound, and Point-of-Care Echocardiography
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={reloadData}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {can('radiology:order') && (
              <button
                onClick={() => setShowOrderModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> New Requisition
              </button>
            )}
          </div>
        </div>

        {/* Safety Governance Directive Banner */}
        <div className="mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-200">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300">Clinical Safety & Architectural Invariant:</span>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              <strong>Radiology Order ≠ Radiology Study ≠ Radiology Report ≠ Diagnosis.</strong> An imaging study produces observational evidence and diagnostic reports. An authorized clinician synthesizes this evidence with clinical examination to determine diagnoses. Software must never silently generate diagnoses, prescriptions, or treatments.
            </p>
          </div>
        </div>
      </div>

      {/* Alert Notices */}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 flex items-center justify-between text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 rounded-lg bg-teal-950/80 border border-teal-800 flex items-center justify-between text-xs text-teal-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-teal-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-3.5 py-2 rounded-t-lg text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'orders'
              ? 'bg-slate-900 border-t border-x border-slate-700 text-indigo-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Requisition Orders ({orders.length})
        </button>

        <button
          onClick={() => setActiveTab('studies')}
          className={`px-3.5 py-2 rounded-t-lg text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'studies'
              ? 'bg-slate-900 border-t border-x border-slate-700 text-indigo-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Film className="w-3.5 h-3.5" /> Acquisition Worklist ({studies.length})
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3.5 py-2 rounded-t-lg text-xs font-bold flex items-center gap-2 transition-colors ${
            activeTab === 'reports'
              ? 'bg-slate-900 border-t border-x border-slate-700 text-indigo-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileEdit className="w-3.5 h-3.5" /> Diagnostic Reports ({reports.length})
        </button>

        <button
          onClick={() => setActiveTab('critical')}
          className={`px-3.5 py-2 rounded-t-lg text-xs font-bold flex items-center gap-2 transition-colors relative ${
            activeTab === 'critical'
              ? 'bg-slate-900 border-t border-x border-slate-700 text-rose-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          Critical Alerts
          {unacknowledgedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-mono text-[10px] animate-pulse">
              {unacknowledgedCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient, MRN, order #, or accession..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-slate-400">
            <Filter className="w-3 h-3" />
            <span>Modality:</span>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
            >
              <option value="ALL">All Modalities</option>
              <option value="XR">XR (X-Ray)</option>
              <option value="CT">CT Scan</option>
              <option value="MRI">MRI</option>
              <option value="ULTRASOUND">Ultrasound / POCUS</option>
              <option value="MAMMOGRAPHY">Mammography</option>
              <option value="FLUOROSCOPY">Fluoroscopy</option>
            </select>
          </div>

          <div className="flex items-center gap-1 text-slate-400">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="PLACED">PLACED</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
      </div>

      {/* TAB 1: ORDERS WORKLIST */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOrders.length === 0 ? (
            <div className="col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
              No radiology requisitions found matching current filters.
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const pat = patientMap.get(ord.patientId);
              const relatedStudy = studies.find((s) => s.orderId === ord.id);
              const relatedReport = reports.find((r) => r.orderId === ord.id);

              return (
                <div
                  key={ord.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors rounded-lg p-4 space-y-3 text-xs shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {ord.modality} — {ord.bodySite}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.2 rounded font-bold uppercase border ${
                            ord.priority === 'emergency' || ord.priority === 'stat'
                              ? 'bg-rose-950 text-rose-300 border-rose-800'
                              : ord.priority === 'urgent'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {ord.priority}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
                          {ord.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Order #: <span className="font-mono text-slate-300 font-semibold">{ord.orderNumber}</span>
                      </div>
                    </div>

                    {pat && (
                      <button
                        onClick={() => onSelectPatient(pat.id)}
                        className="text-teal-400 hover:text-teal-300 font-semibold text-xs flex items-center gap-1"
                      >
                        Chart <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                    <div>
                      <span className="text-slate-500">Patient:</span>{' '}
                      <span className="text-slate-200 font-semibold">
                        {pat ? `${pat.givenName} ${pat.familyName}` : ord.patientId}
                      </span>
                      {pat && <span className="text-slate-400 font-mono text-[10px]"> ({pat.mrn})</span>}
                    </div>
                    <div>
                      <span className="text-slate-500">Laterality:</span>{' '}
                      <span className="text-slate-200">{ord.laterality || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Ordering Clinician:</span>{' '}
                      <span className="text-slate-200">{ord.orderingClinicianName || ord.orderingClinicianId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Requisition Date:</span>{' '}
                      <span className="text-slate-200">
                        {new Date(ord.requestedAt || ord.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {ord.indication && (
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                        Clinical Justification & Indication:
                      </span>
                      <p className="text-slate-200 text-xs">{ord.indication}</p>
                    </div>
                  )}

                  {ord.clinicalQuestion && (
                    <div className="p-2 rounded bg-indigo-950/30 border border-indigo-900/40 text-[11px] text-indigo-300">
                      <strong>Specific Clinical Question:</strong> {ord.clinicalQuestion}
                    </div>
                  )}

                  {/* Actions & Next Steps */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {ord.status === 'PLACED' && can('radiology:order_cancel') && (
                        <button
                          onClick={() => {
                            setCancellingOrder(ord);
                            setCancellationReason('');
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 text-xs flex items-center gap-1 transition-colors"
                        >
                          <Ban className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {ord.status === 'PLACED' && can('radiology:study_schedule') && (
                        <button
                          onClick={() => {
                            setSchedulingOrder(ord);
                            setStudyDescriptionInput(`${ord.modality} ${ord.bodySite}`);
                          }}
                          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5" /> Schedule & Accession
                        </button>
                      )}

                      {relatedStudy && (
                        <button
                          onClick={() => setActiveTab('studies')}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1"
                        >
                          <Film className="w-3 h-3" /> View Study ({relatedStudy.status})
                        </button>
                      )}

                      {relatedReport && (
                        <button
                          onClick={() => setActiveTab('reports')}
                          className="px-2.5 py-1 rounded bg-teal-950 border border-teal-800 text-teal-300 font-semibold text-xs flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3 h-3" /> View Report
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: STUDIES (ACQUISITION WORKLIST) */}
      {activeTab === 'studies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStudies.length === 0 ? (
            <div className="col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
              No scheduled or active imaging studies found.
            </div>
          ) : (
            filteredStudies.map((std) => {
              const pat = patientMap.get(std.patientId);
              const relatedReport = reports.find((r) => r.studyId === std.id);

              return (
                <div
                  key={std.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{std.studyDescription}</span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
                          {std.status}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Accession: <span className="font-mono text-amber-300 font-bold">{std.accessionNumber}</span>
                        <span className="mx-2 text-slate-600">|</span>
                        Study: <span className="font-mono text-slate-300">{std.studyNumber}</span>
                      </div>
                    </div>

                    {pat && (
                      <button
                        onClick={() => onSelectPatient(pat.id)}
                        className="text-teal-400 hover:text-teal-300 font-semibold text-xs"
                      >
                        Chart
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px]">
                    <div>
                      <span className="text-slate-500">Patient:</span>{' '}
                      <span className="text-slate-200 font-semibold">
                        {pat ? `${pat.givenName} ${pat.familyName}` : std.patientId}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Modality:</span>{' '}
                      <span className="text-slate-200">{std.modality}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Series / Images:</span>{' '}
                      <span className="text-slate-200 font-mono">
                        {std.seriesCount} series ({std.instanceCount} instances)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Technologist:</span>{' '}
                      <span className="text-slate-200">
                        {std.performingTechnologistName || 'Awaiting assignment'}
                      </span>
                    </div>
                  </div>

                  {/* Acquisition Controls */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-slate-500 text-[10px] font-mono">
                      {std.completedAt ? `Completed: ${new Date(std.completedAt).toLocaleTimeString()}` : ''}
                    </div>

                    <div className="flex items-center gap-2">
                      {std.status === 'SCHEDULED' && can('radiology:study_perform') && (
                        <button
                          onClick={() => handleStartAcquisition(std)}
                          className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1 transition-colors"
                        >
                          <Activity className="w-3.5 h-3.5" /> Start Acquisition
                        </button>
                      )}

                      {std.status === 'IN_PROGRESS' && can('radiology:study_complete') && (
                        <button
                          onClick={() => {
                            setCompletingStudy(std);
                            setSeriesDescription(`${std.modality} Standard Series`);
                            setInstanceCountInput('2');
                          }}
                          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Complete Image Capture
                        </button>
                      )}

                      {std.status === 'COMPLETED' && can('radiology:report_write') && !relatedReport && (
                        <button
                          onClick={() => handleOpenReportModal(std)}
                          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <FileEdit className="w-3.5 h-3.5" /> Interpret & Report
                        </button>
                      )}

                      {relatedReport && (
                        <button
                          onClick={() => setActiveTab('reports')}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3 h-3 text-teal-400" /> View Report ({relatedReport.status})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: DIAGNOSTIC REPORTS WORKLIST */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {filteredReports.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs">
              No diagnostic reports found.
            </div>
          ) : (
            filteredReports.map((rep) => {
              const pat = patientMap.get(rep.patientId);
              const relatedStudy = studies.find((s) => s.id === rep.studyId);

              return (
                <div
                  key={rep.id}
                  className={`bg-slate-900 border rounded-lg p-4 space-y-3 text-xs shadow-sm ${
                    rep.criticalFinding
                      ? 'border-rose-800/80 bg-gradient-to-r from-slate-900 to-rose-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          Diagnostic Interpretation — {relatedStudy?.modality || 'Imaging'}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.2 rounded font-bold uppercase border ${
                            rep.status === 'FINAL'
                              ? 'bg-teal-950 text-teal-300 border-teal-800'
                              : rep.status === 'AMENDED'
                              ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {rep.status} (v{rep.version})
                        </span>
                        {rep.criticalFinding && (
                          <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 font-bold animate-pulse flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> CRITICAL FINDING
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Patient: <span className="text-slate-200 font-semibold">{pat ? `${pat.givenName} ${pat.familyName}` : rep.patientId}</span> ({pat?.mrn})
                        <span className="mx-2 text-slate-600">|</span>
                        Interpreting Radiologist: <span className="text-slate-300">{rep.radiologistName || rep.radiologistId}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {pat && (
                        <button
                          onClick={() => onSelectPatient(pat.id)}
                          className="text-teal-400 hover:text-teal-300 font-semibold text-xs"
                        >
                          Chart
                        </button>
                      )}
                      {(rep.status === 'FINAL' || rep.status === 'AMENDED') && can('radiology:report_amend') && (
                        <button
                          onClick={() => handleOpenAmendmentModal(rep)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold flex items-center gap-1"
                        >
                          <FileEdit className="w-3 h-3" /> Amend
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Clinical Narrative Content */}
                  <div className="space-y-2">
                    {rep.technique && (
                      <div className="text-slate-400 text-[11px]">
                        <strong className="text-slate-300">Technique:</strong> {rep.technique}
                      </div>
                    )}

                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">
                        Observational Findings:
                      </span>
                      <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{rep.findings}</p>
                    </div>

                    <div className="p-3 rounded bg-indigo-950/20 border border-indigo-900/40 space-y-1">
                      <span className="text-indigo-400 font-bold text-[10px] uppercase tracking-wider">
                        Diagnostic Impression:
                      </span>
                      <p className="text-slate-100 font-semibold text-xs leading-relaxed whitespace-pre-wrap">
                        {rep.impression}
                      </p>
                    </div>

                    {rep.recommendations && (
                      <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
                        <strong className="text-amber-400">Recommendations:</strong> {rep.recommendations}
                      </div>
                    )}
                  </div>

                  {/* Cryptographic Seal & Audit Trail Info */}
                  <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                    <div className="flex items-center gap-1 text-teal-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>SHA-256 Seal: {rep.integrityHash ? `${rep.integrityHash.slice(0, 16)}...` : 'Pending finalization'}</span>
                    </div>

                    <div>
                      Signed: {rep.signedAt ? new Date(rep.signedAt).toLocaleString() : 'Draft'}
                    </div>
                  </div>

                  {/* Amendment History Viewer */}
                  {rep.amendmentHistory && rep.amendmentHistory.length > 0 && (
                    <div className="mt-2 p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-[10px]">
                        <History className="w-3 h-3" />
                        <span>Amendment Audit Lineage ({rep.amendmentHistory.length} revision(s)):</span>
                      </div>
                      {rep.amendmentHistory.map((h, i) => (
                        <div key={i} className="pl-3 border-l-2 border-indigo-800 text-[10px] text-slate-400 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-300">v{h.version} amended by {h.amendedByName}</span>
                            <span className="text-slate-500 font-mono">{new Date(h.amendedAt).toLocaleString()}</span>
                          </div>
                          <div className="italic text-indigo-300">Reason: "{h.reason}"</div>
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

      {/* TAB 4: CRITICAL IMAGING ALERTS */}
      {activeTab === 'critical' && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-rose-300">Critical Panic Alerting Protocol:</span>
              <p className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed">
                Critical imaging findings (such as acute intracranial hemorrhage, tension pneumothorax, visceral perforation, or active cavitary lesions) require direct clinical communication and attested acknowledgment with documented immediate actions taken.
              </p>
            </div>
          </div>

          {criticalFindings.length === 0 ? (
            <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-xs">
              No critical imaging alerts recorded for this facility.
            </div>
          ) : (
            <div className="space-y-3">
              {criticalFindings.map((crit) => {
                const pat = patientMap.get(crit.patientId);

                return (
                  <div
                    key={crit.id}
                    className={`bg-slate-900 border rounded-lg p-4 space-y-3 text-xs shadow-sm ${
                      crit.acknowledged
                        ? 'border-slate-800 opacity-90'
                        : 'border-rose-700 bg-rose-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm flex items-center gap-1.5">
                            <AlertTriangle className={`w-4 h-4 ${crit.acknowledged ? 'text-slate-400' : 'text-rose-400 animate-pulse'}`} />
                            Critical Alert: {pat ? `${pat.givenName} ${pat.familyName}` : crit.patientId}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.2 rounded font-bold uppercase border ${
                              crit.acknowledged
                                ? 'bg-teal-950 text-teal-300 border-teal-800'
                                : 'bg-rose-950 text-rose-300 border-rose-800 animate-pulse'
                            }`}
                          >
                            {crit.acknowledged ? 'ACKNOWLEDGED' : 'ACTION REQUIRED'}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Escalated by: <span className="text-slate-300">{crit.escalatedByName || crit.escalatedById}</span> at{' '}
                          <span className="font-mono text-slate-300">{new Date(crit.escalatedAt).toLocaleString()}</span>
                        </div>
                      </div>

                      {pat && (
                        <button
                          onClick={() => onSelectPatient(pat.id)}
                          className="text-teal-400 hover:text-teal-300 font-semibold text-xs"
                        >
                          Open Chart
                        </button>
                      )}
                    </div>

                    <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-rose-400 font-bold text-[10px] uppercase tracking-wider">
                        Critical Finding Description:
                      </span>
                      <p className="text-slate-200 font-semibold text-xs leading-relaxed">
                        {crit.findingDescription}
                      </p>
                    </div>

                    {crit.acknowledged ? (
                      <div className="p-3 rounded bg-teal-950/40 border border-teal-800/60 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between text-teal-300 font-bold">
                          <span>Attested Clinician Acknowledgment</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {crit.acknowledgedAt ? new Date(crit.acknowledgedAt).toLocaleString() : ''}
                          </span>
                        </div>
                        <p className="text-slate-200">
                          <strong>Action Taken:</strong> {crit.actionTaken}
                        </p>
                        <p className="text-slate-400">
                          Attested By: {crit.acknowledgedByName || crit.acknowledgedById} ({crit.acknowledgedByRole})
                          {crit.communicationMethod && ` via ${crit.communicationMethod}`}
                        </p>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-800 flex justify-end">
                        {can('radiology:critical_acknowledge') && (
                          <button
                            onClick={() => {
                              setAcknowledgingFinding(crit);
                              setActionTakenInput('');
                              setAckNotesInput('');
                            }}
                            className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5" /> Acknowledge Alert & Record Action
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}

      {/* 1. ORDER REQUISITION MODAL */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateOrder}
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-xl w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">New Radiology Requisition</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Patient *</label>
                <select
                  required
                  value={orderPatientId}
                  onChange={(e) => setOrderPatientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                >
                  <option value="">-- Choose Patient --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.givenName} {p.familyName} (MRN: {p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Modality *</label>
                  <select
                    value={orderModality}
                    onChange={(e) => setOrderModality(e.target.value as RadiologyModality)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  >
                    <option value="XR">XR (Plain X-Ray)</option>
                    <option value="CT">CT (Computed Tomography)</option>
                    <option value="MRI">MRI (Magnetic Resonance)</option>
                    <option value="ULTRASOUND">Ultrasound / POCUS</option>
                    <option value="MAMMOGRAPHY">Mammography</option>
                    <option value="FLUOROSCOPY">Fluoroscopy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority *</label>
                  <select
                    value={orderPriority}
                    onChange={(e) => setOrderPriority(e.target.value as RadiologyOrderPriority)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Anatomical Body Site *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chest, Abdomen, Left Knee, Pelvis"
                    value={orderBodySite}
                    onChange={(e) => setOrderBodySite(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Laterality</label>
                  <select
                    value={orderLaterality}
                    onChange={(e) => setOrderLaterality(e.target.value as RadiologyLaterality)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  >
                    <option value="NOT_APPLICABLE">Not Applicable (Midline/Axial)</option>
                    <option value="LEFT">Left</option>
                    <option value="RIGHT">Right</option>
                    <option value="BILATERAL">Bilateral</option>
                    <option value="UNILATERAL">Unilateral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Structured Clinical Indication & Justification *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Persistent cough for 3 weeks with hemoptysis, weight loss, night sweats. Rule out pulmonary tuberculosis."
                  value={orderIndication}
                  onChange={(e) => setOrderIndication(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Specific Clinical Question for Radiologist
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cavitation or apical infiltrates present? Pleural effusion?"
                  value={orderClinicalQuestion}
                  onChange={(e) => setOrderClinicalQuestion(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="orderContrast"
                  checked={orderContrast}
                  onChange={(e) => setOrderContrast(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-indigo-600"
                />
                <label htmlFor="orderContrast" className="text-slate-300">
                  IV or Oral Contrast Required (Check renal function eGFR prior)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Place Requisition
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. ORDER CANCELLATION MODAL */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCancelOrder}
            className="bg-slate-900 border border-rose-800 rounded-xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-rose-400">
                <Ban className="w-4 h-4" />
                <h3 className="text-sm font-bold">Cancel Radiology Order</h3>
              </div>
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-300">
              Order <span className="font-mono text-white font-bold">{cancellingOrder.orderNumber}</span> ({cancellingOrder.modality} {cancellingOrder.bodySite}) will be cancelled.
            </p>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Mandatory Clinical Cancellation Reason *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Clinical improvement, patient transferred, or duplicate requisition entered in error."
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCancellingOrder(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Abort
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1"
              >
                Confirm Cancellation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. SCHEDULE STUDY MODAL */}
      {schedulingOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleScheduleStudy}
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <Calendar className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Schedule Imaging Study</h3>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300 space-y-1">
              <div>Order #: <span className="font-mono text-white">{schedulingOrder.orderNumber}</span></div>
              <div>Modality: <span className="text-white font-semibold">{schedulingOrder.modality}</span></div>
              <div>Body Site: <span className="text-white">{schedulingOrder.bodySite}</span></div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Study Description</label>
              <input
                type="text"
                value={studyDescriptionInput}
                onChange={(e) => setStudyDescriptionInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Scheduled Time</label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="p-2 rounded bg-indigo-950/30 border border-indigo-900/40 text-[11px] text-indigo-300">
              Generating this study automatically computes an offline-safe, Luhn-checksummed Accession Number (RAD-ACC-...) for PACS barcode routing.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSchedulingOrder(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Schedule & Generate Accession
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. COMPLETE STUDY MODAL */}
      {completingStudy && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCompleteStudy}
            className="bg-slate-900 border border-emerald-700 rounded-xl max-w-md w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <Film className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Complete Image Acquisition</h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletingStudy(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300 space-y-1">
              <div>Accession: <span className="font-mono text-amber-300 font-bold">{completingStudy.accessionNumber}</span></div>
              <div>Study: <span className="text-white">{completingStudy.studyDescription}</span></div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Series Description</label>
              <input
                type="text"
                value={seriesDescription}
                onChange={(e) => setSeriesDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Images Acquired (Instance Count)</label>
              <input
                type="number"
                min="1"
                max="500"
                value={instanceCountInput}
                onChange={(e) => setInstanceCountInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setCompletingStudy(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Mark Acquisition Complete
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. REPORT DRAFT / FINALIZE MODAL */}
      {reportingStudy && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveReport}
            className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-5 space-y-4 text-xs shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-indigo-400" />
                  Diagnostic Radiology Interpretation & Reporting
                </h3>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Accession: <span className="font-mono text-amber-300 font-bold">{reportingStudy.accessionNumber}</span> — {reportingStudy.studyDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportingStudy(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Technique & Views</label>
                  <input
                    type="text"
                    value={reportTechnique}
                    onChange={(e) => setReportTechnique(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Comparison Study</label>
                  <input
                    type="text"
                    value={reportComparison}
                    onChange={(e) => setReportComparison(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Detailed Observational Findings *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe lung fields, cardiomediastinal silhouette, bones, pleural spaces, soft tissues..."
                  value={reportFindings}
                  onChange={(e) => setReportFindings(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 leading-relaxed font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Radiological Diagnostic Impression / Conclusion *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Synthesized conclusion and diagnostic differential..."
                  value={reportImpression}
                  onChange={(e) => setReportImpression(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Recommendations & Follow-up</label>
                <input
                  type="text"
                  placeholder="e.g. Recommend sputum AFB/GeneXpert, follow-up film in 6 weeks."
                  value={reportRecommendations}
                  onChange={(e) => setReportRecommendations(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                />
              </div>

              {/* Critical Finding Flag */}
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="criticalFindingCheck"
                    checked={reportIsCritical}
                    onChange={(e) => setReportIsCritical(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-rose-600 focus:ring-rose-500"
                  />
                  <label htmlFor="criticalFindingCheck" className="text-rose-300 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    Flag as Critical / Panic Finding
                  </label>
                </div>

                {reportIsCritical && (
                  <div className="space-y-1 pl-6">
                    <label className="block text-rose-200 font-semibold text-[11px]">
                      Critical Finding Summary Description *
                    </label>
                    <input
                      type="text"
                      required={reportIsCritical}
                      placeholder="e.g. Active cavitary lung lesion with airborne transmission risk"
                      value={criticalDescription}
                      onChange={(e) => setCriticalDescription(e.target.value)}
                      className="w-full bg-slate-900 border border-rose-800 rounded p-2 text-slate-100"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <label className="text-slate-400">Action Mode:</label>
                <button
                  type="button"
                  onClick={() => setReportMode('DRAFT')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    reportMode === 'DRAFT' ? 'bg-slate-700 text-white' : 'text-slate-400'
                  }`}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => setReportMode('FINAL')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    reportMode === 'FINAL' ? 'bg-teal-900 text-teal-200 border border-teal-700' : 'text-slate-400'
                  }`}
                >
                  Sign & Finalize
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportingStudy(null)}
                  className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 rounded font-semibold flex items-center gap-1.5 shadow-sm text-white ${
                    reportMode === 'FINAL' ? 'bg-teal-600 hover:bg-teal-500' : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {reportMode === 'FINAL' ? (
                    <>
                      <ShieldCheck className="w-4 h-4" /> Sign & Seal Report (SHA-256)
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Save Preliminary Draft
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 6. AMENDMENT MODAL */}
      {amendingReport && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitAmendment}
            className="bg-slate-900 border border-indigo-700 rounded-xl max-w-xl w-full p-5 space-y-4 text-xs shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-indigo-400">
                <FileEdit className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Amend Finalized Radiology Report</h3>
              </div>
              <button
                type="button"
                onClick={() => setAmendingReport(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 rounded bg-indigo-950/40 border border-indigo-800/60 text-[11px] text-indigo-200">
              Modifying a signed report increments its revision version (v{amendingReport.version} → v{(amendingReport.version || 1) + 1}) and writes an immutable audit record preserving previous findings.
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Mandatory Clinical Amendment Reason *
              </label>
              <textarea
                required
                rows={2}
                placeholder="e.g. Secondary expert re-read after comparison with remote archive films."
                value={amendedReason}
                onChange={(e) => setAmendedReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Amended Observational Findings *</label>
              <textarea
                rows={4}
                required
                value={amendedFindings}
                onChange={(e) => setAmendedFindings(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Amended Diagnostic Impression *</label>
              <textarea
                rows={3}
                required
                value={amendedImpression}
                onChange={(e) => setAmendedImpression(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAmendingReport(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Release Amended Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. CRITICAL FINDING ACKNOWLEDGMENT MODAL */}
      {acknowledgingFinding && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleAcknowledgeCriticalFinding}
            className="bg-slate-900 border border-rose-700 rounded-xl max-w-lg w-full p-5 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-rose-400">
                <PhoneCall className="w-4 h-4" />
                <h3 className="text-sm font-bold text-white">Acknowledge Critical Imaging Alert</h3>
              </div>
              <button
                type="button"
                onClick={() => setAcknowledgingFinding(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded bg-rose-950/40 border border-rose-800 text-rose-200 space-y-1">
              <span className="font-bold text-rose-300">Escalated Finding:</span>
              <p className="text-xs">{acknowledgingFinding.findingDescription}</p>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Document Immediate Clinical Action Taken *
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Patient placed in airborne isolation room 4; urgent sputum GeneXpert ordered; notified Dr. Antwi."
                value={actionTakenInput}
                onChange={(e) => setActionTakenInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Communication Channel</label>
                <select
                  value={communicationMethodInput}
                  onChange={(e) => setCommunicationMethodInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
                >
                  <option value="DIRECT_PHONE_CALL">Direct Phone Call</option>
                  <option value="DIRECT_IN_PERSON">In-Person Handover</option>
                  <option value="EMERGENCY_OVERBED_CONSOLE">Emergency Console</option>
                  <option value="SECURE_MESSAGING">Secure Clinical Messenger</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Attesting Clinician</label>
                <input
                  type="text"
                  disabled
                  value={`${currentUser.fullName} (${currentUser.role})`}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Additional Clinical Notes</label>
              <input
                type="text"
                placeholder="Optional escalation context..."
                value={ackNotesInput}
                onChange={(e) => setAckNotesInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAcknowledgingFinding(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> Sign & Submit Acknowledgment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
