/**
 * Jano Health - Patient Merge & Record Reconciliation Tab
 * 
 * Implements authoritative record deduplication and merge:
 * - If current chart is already merged: displays merge history, retired state, and link to survivor.
 * - If current chart is active: allows authorized administrators to compare candidates,
 *   designate surviving vs retired records, provide clinical justification, and execute merge.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitMerge,
  Lock,
  Search,
  Shield,
  ShieldAlert,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { Patient } from '../../domain/types';
import { calculateAge } from '../../domain/clinicalUtils';
import { localDb } from '../../services/storage/localDatabase';
import { patientService } from '../../services/clinical/patientService';
import { useAuth } from '../../services/security/authContext';

interface PatientMergeTabProps {
  patient: Patient;
  onPatientUpdated: () => void;
  onSelectPatient: (patientId: string) => void;
  onDenyPermission: (capability: string, actionTitle: string, reason: string) => void;
}

export const PatientMergeTab: React.FC<PatientMergeTabProps> = ({
  patient,
  onPatientUpdated,
  onSelectPatient,
  onDenyPermission,
}) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [survivorChoice, setSurvivorChoice] = useState<'current' | 'candidate'>('current');
  const [mergeReason, setMergeReason] = useState<string>('');
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canMerge =
    can('patient:merge') ||
    can('patient.merge') ||
    currentUser.role === 'facility_administrator' ||
    currentUser.role === 'system_administrator';

  const isAlreadyMerged = patient.patientStatus === 'MERGED';

  // Find candidate patients excluding current
  const allPatients = localDb.getPatients();
  const candidatePatients = allPatients.filter(
    (p) =>
      p.id !== patient.id &&
      p.patientStatus !== 'MERGED' &&
      (!searchQuery ||
        p.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.phone && p.phone.includes(searchQuery)) ||
        (p.nationalId && p.nationalId.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const selectedCandidate = candidatePatients.find((p) => p.id === selectedCandidateId);

  // If already merged, retrieve survivor details
  const survivingPatient = isAlreadyMerged && patient.mergedIntoPatientId
    ? localDb.getPatientById(patient.mergedIntoPatientId)
    : null;

  const handleExecuteMerge = async () => {
    if (!canMerge) {
      onDenyPermission(
        'patient:merge',
        'Merge Patient Records',
        'Merging patient identities and reconciling clinical histories requires facility administrator or system administrator privileges.'
      );
      return;
    }

    if (!selectedCandidate) {
      setError('Please select a candidate patient to merge with this record.');
      return;
    }

    if (!mergeReason.trim()) {
      setError('A clinical and administrative justification is mandatory to perform a patient record merge.');
      return;
    }

    setIsMerging(true);
    setError(null);

    const survivingId = survivorChoice === 'current' ? patient.id : selectedCandidate.id;
    const duplicateId = survivorChoice === 'current' ? selectedCandidate.id : patient.id;

    try {
      const principal = {
        id: currentUser.id,
        fullName: currentUser.fullName,
        role: currentUser.role,
        facilityId: currentFacility.id,
      };

      const result = await patientService.mergePatients(
        principal,
        survivingId,
        duplicateId,
        mergeReason.trim()
      );

      if (!result.success) {
        setError(result.error || 'Failed to execute patient merge.');
        setIsMerging(false);
        return;
      }

      setSuccessMessage(
        `Successfully merged records! Surviving chart: ${result.survivingPatient?.mrn} (${result.survivingPatient?.firstName} ${result.survivingPatient?.lastName}). Duplicate record has been retired.`
      );
      onPatientUpdated();
    } catch (err: any) {
      setError(err.message || 'Error occurred while executing merge.');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      {/* CASE 1: Patient is already merged */}
      {isAlreadyMerged ? (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-lg p-5 space-y-4 text-slate-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-900/60 text-amber-300 shrink-0">
              <GitMerge className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-amber-200">Retired Duplicate Chart</h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-900 text-amber-200 font-bold border border-amber-700">
                  STATUS: MERGED
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-1">
                This patient record was merged into an authoritative surviving chart. All future clinical consultations, orders, and documentation must be performed on the surviving patient chart.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded bg-slate-950 border border-amber-900/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Surviving Target Record:</span>
              <span className="font-mono font-bold text-teal-400">
                {survivingPatient ? `${survivingPatient.firstName} ${survivingPatient.lastName} (${survivingPatient.mrn})` : patient.mergedIntoPatientId}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Merged Timestamp:</span>
              <span className="font-mono text-slate-300">
                {patient.mergedAt ? new Date(patient.mergedAt).toLocaleString() : 'Recorded in Audit Ledger'}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Authorized Executor:</span>
              <span className="text-slate-300 font-semibold">{patient.mergedBy || 'System Administrator'}</span>
            </div>

            <div className="pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400 block mb-0.5">Clinical Justification:</span>
              <p className="text-slate-200 italic">{patient.mergeReason || 'Duplicate master patient record resolved.'}</p>
            </div>
          </div>

          {survivingPatient && (
            <div className="flex justify-end">
              <button
                onClick={() => onSelectPatient(survivingPatient.id)}
                className="flex items-center gap-2 px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors shadow"
              >
                <span>Navigate to Surviving Chart ({survivingPatient.mrn})</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* CASE 2: Active Patient - Eligible for merge */
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Record Deduplication & Master Index Reconciliation</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Safely reconcile fragmented patient records into a single longitudinal timeline while preserving full audit history.
              </p>
            </div>

            {!canMerge && (
              <span className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                <Lock className="w-3.5 h-3.5" /> Requires Administrator Role
              </span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded bg-red-950/70 border border-red-800 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded bg-teal-950/60 border border-teal-800 text-teal-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-teal-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Step 1: Candidate Search */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              1. Select Candidate Patient Record to Merge
            </h4>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidates by name, MRN, phone, or national ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pt-1">
              {candidatePatients.slice(0, 6).map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCandidateId(c.id)}
                  className={`p-2.5 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                    selectedCandidateId === c.id
                      ? 'bg-teal-950/40 border-teal-500 text-white'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="font-bold">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="font-mono text-[10px] ml-2 text-teal-300">MRN: {c.mrn}</span>
                      <p className="text-[10px] text-slate-400">
                        DOB: {c.dateOfBirth} ({calculateAge(c.dateOfBirth, c.dateOfBirthPrecision)}) • Locality: {c.villageTown} • Phone: {c.phone || 'None'}
                      </p>
                    </div>
                  </div>

                  <input
                    type="radio"
                    checked={selectedCandidateId === c.id}
                    onChange={() => setSelectedCandidateId(c.id)}
                    className="text-teal-600 focus:ring-0"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Side-by-side Record Comparison */}
          {selectedCandidate && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
                2. Side-by-Side Demographic Comparison
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Current Chart */}
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Current Active Chart</span>
                    <span className="font-mono text-[10px] text-teal-400">{patient.mrn}</span>
                  </div>
                  <div className="text-xs space-y-1 text-slate-300">
                    <p>
                      <strong>Name:</strong> {patient.firstName} {patient.lastName}
                    </p>
                    <p>
                      <strong>DOB:</strong> {patient.dateOfBirth} ({calculateAge(patient.dateOfBirth, patient.dateOfBirthPrecision)})
                    </p>
                    <p>
                      <strong>Sex:</strong> {patient.gender.toUpperCase()}
                    </p>
                    <p>
                      <strong>Locality:</strong> {patient.villageTown}, {patient.district}
                    </p>
                    <p>
                      <strong>Phone:</strong> {patient.phone || 'None'}
                    </p>
                    <p>
                      <strong>Blood:</strong> {patient.bloodGroup || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Candidate Chart */}
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">Selected Candidate Chart</span>
                    <span className="font-mono text-[10px] text-teal-400">{selectedCandidate.mrn}</span>
                  </div>
                  <div className="text-xs space-y-1 text-slate-300">
                    <p>
                      <strong>Name:</strong> {selectedCandidate.firstName} {selectedCandidate.lastName}
                    </p>
                    <p>
                      <strong>DOB:</strong> {selectedCandidate.dateOfBirth} ({calculateAge(selectedCandidate.dateOfBirth, selectedCandidate.dateOfBirthPrecision)})
                    </p>
                    <p>
                      <strong>Sex:</strong> {selectedCandidate.gender.toUpperCase()}
                    </p>
                    <p>
                      <strong>Locality:</strong> {selectedCandidate.villageTown}, {selectedCandidate.district}
                    </p>
                    <p>
                      <strong>Phone:</strong> {selectedCandidate.phone || 'None'}
                    </p>
                    <p>
                      <strong>Blood:</strong> {selectedCandidate.bloodGroup || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Designate Survivor */}
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-semibold text-slate-200 block text-xs">
                  Designate Surviving Master Record:
                </span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800 flex-1">
                    <input
                      type="radio"
                      name="survivor"
                      checked={survivorChoice === 'current'}
                      onChange={() => setSurvivorChoice('current')}
                      className="text-teal-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">Keep Current Record (Surviving)</span>
                      <span className="text-[10px] text-slate-400">Retires candidate ({selectedCandidate.mrn})</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded bg-slate-900 border border-slate-800 flex-1">
                    <input
                      type="radio"
                      name="survivor"
                      checked={survivorChoice === 'candidate'}
                      onChange={() => setSurvivorChoice('candidate')}
                      className="text-teal-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-bold text-white block">Keep Candidate Record (Surviving)</span>
                      <span className="text-[10px] text-slate-400">Retires current ({patient.mrn})</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Justification Input */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Mandatory Clinical Justification for Record Merge *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Confirmed duplicate registration; patient registered under alternate spelling during outreach."
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-3 rounded bg-amber-950/30 border border-amber-900/60 text-[11px] text-amber-300 flex items-center gap-2 font-mono">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  Permanent Clinical Action: The retired record will be locked from future entries. Historical events and audit trail will remain linked.
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  disabled={isMerging || !canMerge}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded font-bold text-xs text-white shadow transition-all ${
                    isMerging || !canMerge
                      ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {isMerging ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Reconciling & Merging Records...</span>
                    </>
                  ) : (
                    <>
                      <GitMerge className="w-4 h-4" />
                      <span>Confirm & Execute Merge</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
