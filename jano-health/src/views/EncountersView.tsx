/**
 * Jano Health - Encounters View
 * Clinical consultation sessions, mobile outreach visits, and inpatient rounds.
 */

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Encounter, Patient } from '../domain/types';
import { localDb } from '../services/storage/localDatabase';
import { syncEngine } from '../services/sync/syncEngine';
import { auditService } from '../services/audit/auditService';
import { useAuth } from '../services/security/authContext';

interface EncountersViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const EncountersView: React.FC<EncountersViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [encounters, setEncounters] = useState<Encounter[]>(() => localDb.getEncounters());
  const patients = localDb.getPatients();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showNewEncounter, setShowNewEncounter] = useState(false);

  // New encounter form state
  const [selectedPatientId, setSelectedPatientId] = useState(patients[0]?.id || '');
  const [encType, setEncType] = useState<Encounter['type']>('outpatient');
  const [chiefComplaint, setChiefComplaint] = useState('');

  const filtered = encounters.filter((e) => {
    const matchesType = typeFilter === 'all' || e.type === typeFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesType && matchesStatus;
  });

  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chiefComplaint.trim() || !selectedPatientId) return;

    const newEnc: Encounter = {
      id: 'enc-' + Date.now(),
      patientId: selectedPatientId,
      facilityId: currentFacility.id,
      clinicianId: currentUser.id,
      type: encType,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      chiefComplaint: chiefComplaint.trim(),
    };

    try {
      await localDb.saveEncounter(newEnc);
      syncEngine.enqueue('ENCOUNTER_CREATED', 'Encounter', newEnc.id, { encounter: newEnc });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'ENCOUNTER_INITIATED',
        'Encounter',
        newEnc.id,
        { patientId: selectedPatientId, type: encType }
      );

      setEncounters(localDb.getEncounters());
      setShowNewEncounter(false);
      setChiefComplaint('');
      onSelectPatient(selectedPatientId);
    } catch (err) {
      console.error('Failed to save encounter:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Clinical Encounters & Consultations</h1>
          <p className="text-xs text-slate-400">
            Active and archived clinical sessions across {currentFacility.name}
          </p>
        </div>

        {can('clinical:notes_write') && (
          <button
            onClick={() => setShowNewEncounter(!showNewEncounter)}
            className="px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Start New Consultation
          </button>
        )}
      </div>

      {/* New Encounter Form */}
      {showNewEncounter && (
        <form
          onSubmit={handleCreateEncounter}
          className="bg-slate-900 border border-teal-800/80 rounded-lg p-4 space-y-3 text-xs"
        >
          <h3 className="text-sm font-semibold text-teal-300">Initiate Clinical Encounter</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Select Patient *</label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Encounter Class</label>
              <select
                value={encType}
                onChange={(e) => setEncType(e.target.value as Encounter['type'])}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="outpatient">Outpatient Department (OPD)</option>
                <option value="emergency">Emergency / Acute Triage</option>
                <option value="inpatient">Inpatient Ward Round</option>
                <option value="mobile_outreach">Mobile Outreach Clinic</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Chief Complaint & Presenting Symptoms *</label>
            <input
              type="text"
              required
              placeholder="e.g. Acute high grade fever, rigors, headache for 3 days"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewEncounter(false)}
              className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
            >
              Open Consultation & Record Notes
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Class:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1"
          >
            <option value="all">All Types</option>
            <option value="outpatient">Outpatient</option>
            <option value="emergency">Emergency</option>
            <option value="mobile_outreach">Mobile Outreach</option>
            <option value="inpatient">Inpatient</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1"
          >
            <option value="all">All Statuses</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Encounter List */}
      <div className="space-y-3">
        {filtered.map((enc) => {
          const patient = patients.find((p) => p.id === enc.patientId);
          return (
            <div
              key={enc.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-750 transition-all text-xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {patient ? `${patient.firstName} ${patient.lastName}` : 'Unregistered Patient'}
                  </span>
                  <span className="text-teal-300 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800">
                    {patient?.mrn}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.2 rounded uppercase font-bold ${
                      enc.type === 'emergency'
                        ? 'bg-red-950 text-red-300 border border-red-800'
                        : enc.type === 'mobile_outreach'
                        ? 'bg-purple-950 text-purple-300 border border-purple-800'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {enc.type.replace('_', ' ')}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.2 rounded uppercase ${
                      enc.status === 'in_progress'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {enc.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-slate-300">
                  <strong className="text-slate-400 font-normal">Complaint:</strong> {enc.chiefComplaint}
                </p>

                <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
                  <span>Started: {new Date(enc.startedAt).toLocaleString()}</span>
                  <span>• Clinician: {enc.clinicianId}</span>
                </div>
              </div>

              {enc.patientId && (
                <button
                  onClick={() => onSelectPatient(enc.patientId)}
                  className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium self-start md:self-auto shrink-0"
                >
                  Open Patient Chart
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
