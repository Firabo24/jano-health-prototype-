/**
 * Jano Health - MedicationPrescriptionTab (Clinical Core V6)
 * 
 * Comprehensive clinical prescribing, safety screening, order lifecycle,
 * and dispense tracking interface.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Lock,
  Plus,
  Pill,
  RefreshCw,
  XCircle,
  PauseCircle,
  FileSignature,
  Info,
  ShieldAlert,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  MedicationOrder,
  Prescription,
  MedicationDefinition,
  MedicationRoute,
  SafetyCheckResult,
  WarningAcknowledgement,
  DerivedMedicationHistoryItem,
} from '../../domain/medicationTypes';
import { Patient, RoleType } from '../../domain/types';
import { useAuth } from '../../services/security/authContext';
import { medicationService, CreateMedicationOrderDTO } from '../../services/clinical/medicationService';
import { medicationTerminologyService } from '../../services/clinical/medicationTerminologyService';
import { localRepository } from '../../services/storage/localRepository';

interface MedicationPrescriptionTabProps {
  patient: Patient;
  encounters?: any[];
  onRefresh?: () => void;
  onDeny?: (capability: string, actionTitle: string, reason: string) => void;
}

export const MedicationPrescriptionTab: React.FC<MedicationPrescriptionTabProps> = ({
  patient,
  encounters = [],
  onRefresh,
  onDeny,
}) => {
  const { currentUser, currentFacility, can } = useAuth();

  // State
  const [orders, setOrders] = useState<MedicationOrder[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [historyItems, setHistoryItems] = useState<DerivedMedicationHistoryItem[]>([]);
  const [concepts, setConcepts] = useState<MedicationDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'orders' | 'history'>('orders');

  // New Order / Prescription Form State
  const [showForm, setShowForm] = useState(false);
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [route, setRoute] = useState<MedicationRoute>('oral');
  const [dose, setDose] = useState('500');
  const [doseUnit, setDoseUnit] = useState('mg');
  const [frequency, setFrequency] = useState('TID (Three times daily)');
  const [durationValue, setDurationValue] = useState(5);
  const [quantity, setQuantity] = useState(15);
  const [indication, setIndication] = useState('');
  const [instructions, setInstructions] = useState('');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Safety Screen State
  const [safetyEvaluation, setSafetyEvaluation] = useState<{
    overallState: 'SAFE' | 'WARNING' | 'HIGH_RISK' | 'CONTRAINDICATED' | 'KNOWLEDGE_UNAVAILABLE';
    checks: SafetyCheckResult[];
    requiresAcknowledgement: boolean;
  } | null>(null);
  const [evaluatingSafety, setEvaluatingSafety] = useState(false);

  // Action Modals State
  const [selectedOrderForAction, setSelectedOrderForAction] = useState<MedicationOrder | null>(null);
  const [actionType, setActionType] = useState<'hold' | 'discontinue' | null>(null);
  const [actionReason, setActionReason] = useState('');

  // Expandable row details
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const [allDefs, ords, rxs, hist] = await Promise.all([
        localRepository.getMedicationDefinitions(),
        localRepository.getMedicationOrders(patient.id),
        localRepository.getPrescriptions(patient.id),
        medicationService.getMedicationHistory(patient.id),
      ]);

      const activeDefs = allDefs.length > 0 ? allDefs : medicationTerminologyService.getAllActiveConcepts();
      setConcepts(activeDefs);
      setOrders(ords);
      setPrescriptions(rxs);
      setHistoryItems(hist);
    } catch (err) {
      console.error('Failed to load medication data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [patient.id]);

  // When concept is selected, pre-fill defaults
  const handleConceptChange = (conceptId: string) => {
    setSelectedConceptId(conceptId);
    const found = concepts.find((c) => c.id === conceptId);
    if (found) {
      setDose(found.strength || '500');
      setDoseUnit(found.strengthUnit || 'mg');
      if (found.allowedRoutes && found.allowedRoutes.length > 0) {
        setRoute(found.allowedRoutes[0]);
      }
      setInstructions(`Take ${found.strength} ${found.strengthUnit} by ${found.allowedRoutes?.[0] || 'oral'} route.`);
      if (found.standardIndications && found.standardIndications.length > 0) {
        setIndication(found.standardIndications[0]);
      }
    }
  };

  // Run Real-time Safety Screen when form parameters change
  useEffect(() => {
    if (!selectedConceptId || !showForm) {
      setSafetyEvaluation(null);
      return;
    }

    let isMounted = true;
    const runSafetyScreen = async () => {
      setEvaluatingSafety(true);
      try {
        const result = await medicationService.performSafetyScreen({
          patientId: patient.id,
          medicationDefinitionId: selectedConceptId,
          route,
          dose,
          doseUnit,
          frequency,
          durationValue: Number(durationValue) || 1,
          quantity: Number(quantity) || 1,
          indication: indication.trim() || 'General clinical indication',
        });
        if (isMounted) {
          setSafetyEvaluation(result);
        }
      } catch (err: any) {
        console.warn('Safety screen error:', err);
      } finally {
        if (isMounted) setEvaluatingSafety(false);
      }
    };

    const timer = setTimeout(runSafetyScreen, 200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [selectedConceptId, route, dose, doseUnit, frequency, durationValue, quantity, indication, showForm]);

  const handleOpenPrescribe = () => {
    if (!can('medication.prescribe')) {
      onDeny?.(
        'medication.prescribe',
        'Prescribe Medication Regimen',
        'Prescribing medication orders and issuing legal prescriptions requires licensed physician or authorized clinical health officer credentials.'
      );
      return;
    }
    if (concepts.length > 0 && !selectedConceptId) {
      handleConceptChange(concepts[0].id);
    }
    setActionError(null);
    setShowForm(true);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (!selectedConceptId) {
      setActionError('Please select a medication from the formulary.');
      return;
    }

    if (!indication.trim()) {
      setActionError('Clinical indication is mandatory for prescription orders.');
      return;
    }

    // Safety checks validation
    if (safetyEvaluation?.overallState === 'CONTRAINDICATED') {
      setActionError('Cannot place order: This medication regimen has an absolute contraindication for this patient.');
      return;
    }

    if (safetyEvaluation?.requiresAcknowledgement) {
      if (!justification.trim() || justification.trim().length < 6) {
        setActionError('Please provide a documented clinical justification for proceeding despite flagged safety warnings.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const acks: WarningAcknowledgement[] = safetyEvaluation?.requiresAcknowledgement
        ? [
            {
              checkType: 'SAFETY_SCREEN_FLAG',
              warningMessage: safetyEvaluation.checks
                .filter((c) => c.status === 'WARNING' || c.status === 'HIGH_RISK')
                .map((c) => c.message)
                .join('; '),
              justification: justification.trim(),
              clinicianId: currentUser.id,
              clinicianName: currentUser.fullName,
              clinicianRole: currentUser.role,
              response: 'ACKNOWLEDGE_AND_CONTINUE',
              timestamp: new Date().toISOString(),
            },
          ]
        : [];

      const dto: CreateMedicationOrderDTO = {
        patientId: patient.id,
        encounterId: encounters[0]?.id,
        facilityId: currentFacility.id,
        medicationDefinitionId: selectedConceptId,
        route,
        dose,
        doseUnit,
        frequency,
        durationValue: Number(durationValue),
        quantity: Number(quantity),
        indication: indication.trim(),
        instructions: instructions.trim(),
        acknowledgedWarnings: acks,
      };

      await medicationService.createOrderAndIssuePrescription(
        dto,
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        },
        {
          validityDays: 30,
          refills: 0,
        }
      );

      setShowForm(false);
      setJustification('');
      await loadData();
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit medication order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteOrderAction = async () => {
    if (!selectedOrderForAction || !actionType) return;
    if (!actionReason.trim()) {
      setActionError('Please document a clinical reason.');
      return;
    }

    try {
      const actor = {
        userId: currentUser.id,
        userName: currentUser.fullName,
        userRole: currentUser.role,
        facilityId: currentFacility.id,
        deviceId: 'client-node-1',
      };

      if (actionType === 'hold') {
        await medicationService.holdMedicationOrder(selectedOrderForAction.id, actionReason.trim(), actor);
      } else if (actionType === 'discontinue') {
        await medicationService.discontinueMedicationOrder(selectedOrderForAction.id, actionReason.trim(), actor);
      }

      setSelectedOrderForAction(null);
      setActionType(null);
      setActionReason('');
      await loadData();
      onRefresh?.();
    } catch (err: any) {
      setActionError(err.message || 'Failed to execute order action.');
    }
  };

  const handleDispense = async (prescriptionId: string) => {
    if (!can('medication.dispense')) {
      onDeny?.(
        'medication.dispense',
        'Dispense Medication',
        'Dispensing medications and updating pharmacy stock requires licensed pharmacist or pharmacy technician authorization.'
      );
      return;
    }

    try {
      await medicationService.dispensePrescription(
        {
          prescriptionId,
          quantityDispensed: 1,
        },
        {
          userId: currentUser.id,
          userName: currentUser.fullName,
          userRole: currentUser.role,
          facilityId: currentFacility.id,
          deviceId: 'client-node-1',
        }
      );
      await loadData();
      onRefresh?.();
    } catch (err: any) {
      alert(err.message || 'Failed to record dispense.');
    }
  };

  const selectedConcept = useMemo(
    () => concepts.find((c) => c.id === selectedConceptId),
    [concepts, selectedConceptId]
  );

  return (
    <div className="space-y-4 text-xs">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Pill className="w-4 h-4 text-teal-400" />
            Clinical Core V6 Prescribing & Medication Sheet
          </h3>
          <p className="text-slate-400 text-[11px]">
            Formulary-backed orders, multi-factor safety screening, tamper-evident digital seals, and dispense verification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('orders')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                viewMode === 'orders' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Orders & Prescriptions ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('history')}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                viewMode === 'history' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Reconciled History ({historyItems.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleOpenPrescribe}
            className={`px-3 py-1.5 rounded font-semibold text-white flex items-center gap-1.5 shadow-sm transition ${
              can('medication.prescribe')
                ? 'bg-teal-600 hover:bg-teal-500'
                : 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
            }`}
          >
            {!can('medication.prescribe') && <Lock className="w-3.5 h-3.5" />}
            <Plus className="w-3.5 h-3.5" />
            New Medication Order
          </button>
        </div>
      </div>

      {/* Patient Allergy Warning Banner */}
      {patient.allergiesSummary && patient.allergiesSummary.some((a) => !a.includes('NKDA')) && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg flex items-start gap-2.5 text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-amber-300">Documented Patient Allergies:</span>{' '}
            <span className="font-mono">{patient.allergiesSummary.join(', ')}</span>
            <p className="text-[11px] text-amber-400/80 mt-0.5">
              All prospective orders are screened against these documented allergens and active pharmacological cross-reactivities.
            </p>
          </div>
        </div>
      )}

      {/* Prescribe / Order Form Modal / Accordion */}
      {showForm && (
        <div className="bg-slate-900 border border-teal-600/60 rounded-lg p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="font-bold text-teal-300 text-sm flex items-center gap-2">
              <FileSignature className="w-4 h-4" />
              Prescribe Medication Regimen (Clinical Core V6)
            </h4>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-white text-xs font-mono"
            >
              ✕ Close
            </button>
          </div>

          {actionError && (
            <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded text-rose-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitOrder} className="space-y-4">
            {/* Row 1: Concept Picker */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">
                  Formulary Concept / Generic Name *
                </label>
                <select
                  value={selectedConceptId}
                  onChange={(e) => handleConceptChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:border-teal-500 focus:outline-none"
                  required
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.genericName} {c.brandName ? `(${c.brandName})` : ''} - {c.strength} {c.strengthUnit} [{c.dosageForm}]
                    </option>
                  ))}
                </select>
                {selectedConcept && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Class: <span className="text-teal-400">{selectedConcept.pharmacologicalClass}</span> • Code: <span className="font-mono">{selectedConcept.code}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Administration Route *</label>
                <select
                  value={route}
                  onChange={(e) => setRoute(e.target.value as MedicationRoute)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:border-teal-500 focus:outline-none"
                >
                  <option value="oral">Oral (PO)</option>
                  <option value="intravenous">Intravenous (IV)</option>
                  <option value="intramuscular">Intramuscular (IM)</option>
                  <option value="subcutaneous">Subcutaneous (SC)</option>
                  <option value="topical">Topical</option>
                  <option value="inhalation">Inhalation</option>
                  <option value="sublingual">Sublingual</option>
                  <option value="rectal">Rectal</option>
                </select>
              </div>
            </div>

            {/* Row 2: Dose, Frequency, Duration, Quantity */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Dose & Unit *</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    required
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    className="w-2/3 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                    placeholder="e.g. 500"
                  />
                  <input
                    type="text"
                    required
                    value={doseUnit}
                    onChange={(e) => setDoseUnit(e.target.value)}
                    className="w-1/3 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                    placeholder="mg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Frequency *</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                >
                  <option value="Once daily">Once daily (QD)</option>
                  <option value="BID (Every 12h)">BID (Twice daily)</option>
                  <option value="TID (Three times daily)">TID (Three times daily)</option>
                  <option value="QID (Four times daily)">QID (Four times daily)</option>
                  <option value="PRN (As needed)">PRN (As needed)</option>
                  <option value="STAT (Immediately)">STAT (Immediately)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Duration (Days) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={durationValue}
                  onChange={(e) => setDurationValue(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Dispense Quantity *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
                />
              </div>
            </div>

            {/* Row 3: Indication & Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Clinical Indication *</label>
                <input
                  type="text"
                  required
                  value={indication}
                  onChange={(e) => setIndication(e.target.value)}
                  placeholder="e.g. Acute bacterial pneumonia, uncomplicated falciparum malaria"
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Patient Instructions / Counseling</label>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Take with food. Complete the full antibiotic course."
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
                />
              </div>
            </div>

            {/* Safety Screening Status Card */}
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  Clinical Safety Screening Engine:
                </span>
                {evaluatingSafety ? (
                  <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Evaluating...
                  </span>
                ) : safetyEvaluation ? (
                  <span
                    className={`font-mono uppercase font-bold px-2 py-0.5 rounded text-[10px] ${
                      safetyEvaluation.overallState === 'SAFE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : safetyEvaluation.overallState === 'CONTRAINDICATED'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800 animate-pulse'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {safetyEvaluation.overallState}
                  </span>
                ) : null}
              </div>

              {safetyEvaluation?.checks && (
                <div className="space-y-1.5 pt-1">
                  {safetyEvaluation.checks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded flex items-start gap-2 text-[11px] ${
                        check.status === 'CONTRAINDICATED'
                          ? 'bg-rose-950/50 border border-rose-800/80 text-rose-200'
                          : check.status === 'WARNING' || check.status === 'HIGH_RISK'
                          ? 'bg-amber-950/40 border border-amber-800/70 text-amber-200'
                          : 'bg-slate-900/60 border border-slate-800 text-slate-300'
                      }`}
                    >
                      {check.status === 'SAFE' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : check.status === 'CONTRAINDICATED' ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span>{check.checkType.replace('_', ' ')}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({check.source})</span>
                        </div>
                        <p className="mt-0.5 text-slate-300">{check.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Justification input if Warning or High Risk */}
              {safetyEvaluation?.requiresAcknowledgement && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <label className="block text-amber-300 font-semibold">
                    Clinician Override Justification (Mandatory) *
                  </label>
                  <input
                    type="text"
                    required
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Document clinical rationale for proceeding despite warnings (e.g., benefits outweigh risks; close renal monitoring scheduled)"
                    className="w-full bg-slate-900 border border-amber-600/70 rounded px-2.5 py-1.5 text-slate-100 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Prescriber Legal Attestation */}
            <div className="p-2.5 bg-slate-950/80 rounded border border-slate-800 text-slate-400 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSignature className="w-4 h-4 text-teal-400" />
                <span>
                  Prescriber: <strong className="text-slate-200">{currentUser.fullName}</strong> ({currentUser.role})
                  • SHA-256 digital attestation seal will be generated.
                </span>
              </div>
              <span className="font-mono text-teal-400">Offline-Guaranteed</span>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || safetyEvaluation?.overallState === 'CONTRAINDICATED'}
                className={`px-4 py-1.5 rounded font-bold text-white flex items-center gap-1.5 shadow-md ${
                  safetyEvaluation?.overallState === 'CONTRAINDICATED'
                    ? 'bg-slate-700 cursor-not-allowed opacity-50'
                    : 'bg-teal-600 hover:bg-teal-500'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <FileSignature className="w-3.5 h-3.5" /> Sign & Issue Prescription
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Orders List View */}
      {viewMode === 'orders' && (
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-teal-400" /> Loading authoritative medication records...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 bg-slate-900/50 rounded-lg border border-slate-800 text-center space-y-2">
              <Pill className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-semibold">No active medication orders recorded</p>
              <p className="text-slate-500 text-[11px]">Click "New Medication Order" to prescribe formulary medications.</p>
            </div>
          ) : (
            orders.map((order) => {
              const rx = prescriptions.find((p) => p.medicationOrderId === order.id);
              const isExpanded = expandedRowId === order.id;

              return (
                <div
                  key={order.id}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2.5 transition hover:border-slate-700"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">
                          {order.brandName || order.genericName}
                        </span>
                        {order.brandName && (
                          <span className="text-slate-400 font-mono text-[11px]">({order.genericName})</span>
                        )}
                        <span className="font-mono text-teal-400 text-[10px] bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/60">
                          {order.orderNumber}
                        </span>
                        {rx && (
                          <span className="font-mono text-indigo-400 text-[10px] bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/60">
                            {rx.prescriptionNumber}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.2 rounded font-bold ${
                            order.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : order.status === 'HELD'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="font-semibold text-teal-300">
                          {order.dose} {order.doseUnit}
                        </span>
                        <span>• Route: {order.route.toUpperCase()}</span>
                        <span>• Frequency: {order.frequency}</span>
                        <span>• Duration: {order.durationValue} {order.durationUnit}</span>
                      </div>

                      <p className="text-slate-400 text-[11px]">
                        Indication: <span className="text-slate-200 font-medium">{order.indication}</span>
                        {order.instructions && <span> • Instructions: {order.instructions}</span>}
                      </p>
                    </div>

                    {/* Order Action Buttons */}
                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                      {rx && rx.status !== 'DISPENSED' && can('medication.dispense') && (
                        <button
                          type="button"
                          onClick={() => handleDispense(rx.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Dispense
                        </button>
                      )}

                      {rx && rx.status === 'DISPENSED' && (
                        <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                          <ShieldCheck className="w-3.5 h-3.5" /> Dispensed
                        </span>
                      )}

                      {order.status === 'ACTIVE' && can('medication.prescribe') && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderForAction(order);
                              setActionType('hold');
                              setActionReason('');
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1"
                          >
                            <PauseCircle className="w-3 h-3" /> Hold
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrderForAction(order);
                              setActionType('discontinue');
                              setActionReason('');
                            }}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Discontinue
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setExpandedRowId(isExpanded ? null : order.id)}
                        className="p-1 text-slate-400 hover:text-white rounded bg-slate-800/80"
                        title="Toggle Provenance & Details"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Digital Seal & Provenance Drawer */}
                  {isExpanded && (
                    <div className="pt-2.5 mt-2 border-t border-slate-800/80 space-y-2 text-[11px]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                        <div>
                          <span className="text-slate-500 block">Ordered By:</span>
                          <span className="text-slate-200">
                            {order.orderedByName} ({order.orderedByRole}) at {new Date(order.orderedAt).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Facility & Provenance:</span>
                          <span className="text-slate-200 font-mono">
                            {order.facilityId} • {order.provenance}
                          </span>
                        </div>
                      </div>

                      {rx && (
                        <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] space-y-1">
                          <div className="flex items-center justify-between text-teal-400 font-bold">
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> Digital Prescriber Seal (SHA-256)
                            </span>
                            <span className="text-slate-400">v{rx.version}</span>
                          </div>
                          <p className="text-slate-400 break-all">{rx.signatureHash}</p>
                          <p className="text-slate-500 italic text-[9px] pt-0.5">
                            "{rx.prescriberAttestation.statement}" - {rx.prescriberAttestation.attestedByName}
                          </p>
                        </div>
                      )}

                      {order.acknowledgedWarnings && order.acknowledgedWarnings.length > 0 && (
                        <div className="p-2 bg-amber-950/30 border border-amber-800/50 rounded text-amber-200">
                          <span className="font-bold block">Documented Safety Justification:</span>
                          <p className="mt-0.5 text-slate-300 italic">
                            "{order.acknowledgedWarnings[0].justification}" - {order.acknowledgedWarnings[0].acknowledgedByName}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Reconciled Medication History View */}
      {viewMode === 'history' && (
        <div className="space-y-3">
          <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-[11px]">
            Comprehensive historical reconciliation merging authoritative orders, digital prescriptions, and legacy clinical records with provenance attribution.
          </div>

          <div className="space-y-2">
            {historyItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{item.brandName || item.genericName}</span>
                    {item.brandName && (
                      <span className="text-slate-400 font-mono text-[11px]">({item.genericName})</span>
                    )}
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.2 rounded font-bold ${
                        item.category === 'ACTIVE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : item.category === 'HELD'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.category}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">[{item.source}]</span>
                  </div>

                  <p className="text-slate-300">
                    {item.dose} • Route: {item.route.toUpperCase()} • Frequency: {item.frequency} • Duration: {item.durationText}
                  </p>

                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    {item.prescriberName && <span>Prescriber: {item.prescriberName}</span>}
                    {item.prescribedAt && <span>Date: {new Date(item.prescribedAt).toLocaleDateString()}</span>}
                    {item.discontinuedReason && (
                      <span className="text-rose-400">Discontinued Reason: {item.discontinuedReason}</span>
                    )}
                  </div>
                </div>

                {item.prescriptionNumber && (
                  <span className="font-mono text-teal-400 text-[11px] bg-teal-950/60 px-2 py-1 rounded border border-teal-800">
                    {item.prescriptionNumber}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Dialog (Hold / Discontinue) */}
      {selectedOrderForAction && actionType && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full p-4 space-y-3 shadow-2xl">
            <h4 className="font-bold text-white text-sm flex items-center gap-2">
              {actionType === 'hold' ? (
                <>
                  <PauseCircle className="w-4 h-4 text-amber-400" /> Hold Medication Order
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-400" /> Discontinue Medication Order
                </>
              )}
            </h4>
            <p className="text-slate-300 text-xs">
              Order: <strong className="text-white">{selectedOrderForAction.genericName}</strong> ({selectedOrderForAction.orderNumber})
            </p>

            <div>
              <label className="block text-slate-400 mb-1">Document Clinical Rationale *</label>
              <textarea
                rows={3}
                required
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={
                  actionType === 'hold'
                    ? 'e.g. Hold pending renal function laboratory results'
                    : 'e.g. Completed clinical course, or adverse reaction observed'
                }
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-100 text-xs focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedOrderForAction(null);
                  setActionType(null);
                }}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteOrderAction}
                className={`px-3 py-1.5 rounded font-bold text-white ${
                  actionType === 'hold' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                Confirm {actionType === 'hold' ? 'Hold' : 'Discontinuation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
