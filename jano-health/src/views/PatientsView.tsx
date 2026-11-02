/**
 * Jano Health - Patients Master Index View
 * Advanced patient lookup, triage categorization, filtering, and registration.
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Filter,
  GitMerge,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import { Patient, PatientStatus } from '../domain/types';
import { calculateAge } from '../domain/clinicalUtils';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';
import { RegisterPatientModal } from '../components/patients/RegisterPatientModal';

interface PatientsViewProps {
  onSelectPatient: (patientId: string) => void;
  externalSearchQuery?: string;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  onSelectPatient,
  externalSearchQuery = '',
}) => {
  const { currentFacility, can } = useAuth();
  const [searchQuery, setSearchQuery] = useState(externalSearchQuery);
  const [triageFilter, setTriageFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>(() => localDb.getPatients());

  const refreshList = () => {
    setPatients(localDb.getPatients());
  };

  const filteredPatients = patients.filter((patient) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !query ||
      patient.firstName.toLowerCase().includes(query) ||
      patient.lastName.toLowerCase().includes(query) ||
      (patient.givenName && patient.givenName.toLowerCase().includes(query)) ||
      (patient.familyName && patient.familyName.toLowerCase().includes(query)) ||
      patient.mrn.toLowerCase().includes(query) ||
      (patient.nationalId && patient.nationalId.toLowerCase().includes(query)) ||
      (patient.nationalIdentifier && patient.nationalIdentifier.toLowerCase().includes(query)) ||
      (patient.phone && patient.phone.includes(query)) ||
      (patient.villageTown && patient.villageTown.toLowerCase().includes(query));

    const matchesTriage =
      triageFilter === 'all' || patient.triageUrgency === triageFilter;

    const matchesStatus =
      statusFilter === 'all' || (patient.patientStatus || 'ACTIVE') === statusFilter;

    return matchesQuery && matchesTriage && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Top Header & Registration Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Master Patient Index</h1>
          <p className="text-xs text-slate-400">
            Registered longitudinal records across {currentFacility.name} and clinical mesh nodes
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={refreshList}
            className="p-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh Patient List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {(can('patient.create') || can('patient:create')) && (
            <button
              onClick={() => setIsRegisterOpen(true)}
              className="px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Register New Patient
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by MRN, Name, National ID, Phone, or Village..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={triageFilter}
            onChange={(e) => setTriageFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Triage Levels</option>
            <option value="emergency">Emergency (Immediate)</option>
            <option value="urgent">Urgent Priority</option>
            <option value="routine">Routine Ambulatory</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Lifecycle Statuses</option>
            <option value="ACTIVE">Active Records</option>
            <option value="MERGED">Merged / Retired Charts</option>
            <option value="DECEASED">Deceased</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {/* Patient Cards Grid / Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPatients.map((patient) => {
          const calculatedAge = calculateAge(patient.dateOfBirth, patient.dateOfBirthPrecision);
          const isMerged = patient.patientStatus === 'MERGED';

          return (
            <div
              key={patient.id}
              onClick={() => onSelectPatient(patient.id)}
              className={`bg-slate-900 border rounded-lg p-4 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                isMerged
                  ? 'border-amber-900/60 hover:border-amber-700 bg-amber-950/10'
                  : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-white text-sm">
                        {patient.firstName} {patient.lastName}
                      </h3>
                      {isMerged && (
                        <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                          <GitMerge className="w-2.5 h-2.5" /> MERGED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-teal-300 mt-0.5">
                      <span>MRN: {patient.mrn}</span>
                      {patient.bloodGroup && (
                        <span className="px-1 rounded bg-slate-800 text-slate-300">
                          {patient.bloodGroup}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                        patient.triageUrgency === 'emergency'
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : patient.triageUrgency === 'urgent'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {patient.triageUrgency}
                    </span>

                    {patient.syncStatus === 'LOCAL_ONLY' && (
                      <span className="flex items-center gap-1 text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-amber-400 border border-slate-700">
                        <WifiOff className="w-2.5 h-2.5" /> Offline local
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1 mt-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {calculatedAge} • DOB: {patient.dateOfBirth} ({patient.gender.toUpperCase()})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {patient.villageTown}, {patient.district}
                    </span>
                  </div>
                  {patient.phone && (
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{patient.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Allergies / Clinical Tag Footer */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 truncate max-w-[180px]">
                  {patient.allergiesSummary && patient.allergiesSummary.length > 0
                    ? `Allergies: ${patient.allergiesSummary[0]}`
                    : 'No known allergies'}
                </span>

                <span className="text-teal-400 font-semibold hover:underline">
                  Open Chart →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPatients.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-12 text-center text-slate-400">
          <User className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          <p className="text-sm">No patient records found matching your search criteria.</p>
        </div>
      )}

      {/* Registration Modal */}
      <RegisterPatientModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onPatientRegistered={(newPat) => {
          refreshList();
          onSelectPatient(newPat.id);
        }}
        onOpenExistingPatient={(existingId) => {
          setIsRegisterOpen(false);
          onSelectPatient(existingId);
        }}
      />
    </div>
  );
};
