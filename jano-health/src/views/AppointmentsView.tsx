/**
 * Jano Health - Appointments & Outpatient Scheduling View
 * Clinic scheduling, booking, check-in, and follow-up management.
 */

import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  User,
} from 'lucide-react';
import { Appointment } from '../domain/types';
import { localDb } from '../services/storage/localDatabase';
import { syncEngine } from '../services/sync/syncEngine';
import { auditService } from '../services/audit/auditService';
import { useAuth } from '../services/security/authContext';

interface AppointmentsViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({ onSelectPatient }) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>(() => localDb.getAppointments());
  const patients = localDb.getPatients();
  const [showScheduleForm, setShowScheduleForm] = useState(false);

  const [newAppt, setNewAppt] = useState({
    patientId: patients[0]?.id || '',
    scheduledTime: new Date().toISOString().split('T')[0] + 'T09:00',
    reason: '',
    type: 'routine_follow_up' as Appointment['type'],
  });

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppt.reason.trim() || !newAppt.patientId) return;

    const created: Appointment = {
      id: 'apt-' + Date.now(),
      patientId: newAppt.patientId,
      facilityId: currentFacility.id,
      clinicianId: currentUser.id,
      scheduledTime: new Date(newAppt.scheduledTime).toISOString(),
      durationMinutes: 30,
      reason: newAppt.reason.trim(),
      type: newAppt.type,
      status: 'scheduled',
    };

    try {
      await localDb.saveAppointment(created);
      syncEngine.enqueue('APPOINTMENT_CREATED', 'Appointment', created.id, { appointment: created });
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'APPOINTMENT_SCHEDULED',
        'Appointment',
        created.id,
        { reason: created.reason, scheduledTime: created.scheduledTime }
      );

      setAppointments(localDb.getAppointments());
      setShowScheduleForm(false);
      setNewAppt({
        patientId: patients[0]?.id || '',
        scheduledTime: new Date().toISOString().split('T')[0] + 'T09:00',
        reason: '',
        type: 'routine_follow_up',
      });
    } catch (err) {
      console.error('Failed to save appointment:', err);
    }
  };

  const handleUpdateStatus = async (apt: Appointment, status: Appointment['status']) => {
    const updated = { ...apt, status };
    try {
      await localDb.saveAppointment(updated);
      setAppointments(localDb.getAppointments());
      syncEngine.enqueue('APPOINTMENT_CREATED', 'Appointment', updated.id, { appointment: updated });
    } catch (err) {
      console.error('Failed to update appointment status:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Appointments & Clinic Scheduling</h1>
          <p className="text-xs text-slate-400">
            Outpatient scheduling, chronic care follow-ups, and antenatal clinics
          </p>
        </div>

        {can('appointments:manage') && (
          <button
            onClick={() => setShowScheduleForm(!showScheduleForm)}
            className="px-3.5 py-2 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Book Appointment
          </button>
        )}
      </div>

      {showScheduleForm && (
        <form
          onSubmit={handleCreateAppointment}
          className="bg-slate-900 border border-teal-800 rounded-lg p-4 space-y-3 text-xs"
        >
          <h3 className="text-sm font-semibold text-teal-300">Book Patient Appointment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Patient *</label>
              <select
                value={newAppt.patientId}
                onChange={(e) => setNewAppt({ ...newAppt, patientId: e.target.value })}
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
              <label className="block text-slate-400 mb-1">Clinic Type</label>
              <select
                value={newAppt.type}
                onChange={(e) => setNewAppt({ ...newAppt, type: e.target.value as Appointment['type'] })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              >
                <option value="routine_follow_up">Routine Consultation / Follow-up</option>
                <option value="chronic_care">Chronic Care (NCD Clinic)</option>
                <option value="antenatal">Antenatal Care (ANC)</option>
                <option value="immunization">Childhood Immunization / EPI</option>
                <option value="specialist">Specialist Outreach</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={newAppt.scheduledTime}
                onChange={(e) => setNewAppt({ ...newAppt, scheduledTime: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Reason for Visit</label>
            <input
              type="text"
              required
              placeholder="e.g. 7-day post-malaria hematology recheck"
              value={newAppt.reason}
              onChange={(e) => setNewAppt({ ...newAppt, reason: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowScheduleForm(false)}
              className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold"
            >
              Confirm Appointment
            </button>
          </div>
        </form>
      )}

      {/* Appointment Cards */}
      <div className="space-y-3">
        {appointments.map((apt) => {
          const patient = patients.find((p) => p.id === apt.patientId);
          return (
            <div
              key={apt.id}
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}
                  </span>
                  <span className="text-teal-300 font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800">
                    {patient?.mrn}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.2 rounded bg-slate-800 text-slate-300">
                    {apt.type.replace('_', ' ')}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.2 rounded font-bold ${
                      apt.status === 'checked_in'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : apt.status === 'completed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {apt.status}
                  </span>
                </div>

                <p className="text-slate-300">{apt.reason}</p>
                <div className="text-slate-400 text-[11px] font-mono flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Scheduled: {new Date(apt.scheduledTime).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                {apt.status === 'scheduled' && (
                  <button
                    onClick={() => handleUpdateStatus(apt, 'checked_in')}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 font-medium"
                  >
                    Check In
                  </button>
                )}
                {apt.status === 'checked_in' && (
                  <button
                    onClick={() => handleUpdateStatus(apt, 'completed')}
                    className="px-2.5 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300 font-medium"
                  >
                    Mark Seen
                  </button>
                )}
                <button
                  onClick={() => onSelectPatient(apt.patientId)}
                  className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
                >
                  View Chart
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
