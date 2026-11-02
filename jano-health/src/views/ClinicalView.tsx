/**
 * Jano Health - Unified Clinical Workspace View
 * Rapid clinical triage, vital sign recording, problem lists, and SOAP documentation.
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  HeartPulse,
  Plus,
  Stethoscope,
  Users,
} from 'lucide-react';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';

interface ClinicalViewProps {
  onSelectPatient: (patientId: string) => void;
}

export const ClinicalView: React.FC<ClinicalViewProps> = ({ onSelectPatient }) => {
  const { currentFacility } = useAuth();
  const patients = localDb.getPatients();
  const clinicalNotes = localDb.getClinicalNotes();
  const vitals = localDb.getVitals();
  const diagnoses = localDb.getDiagnoses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Clinical Workstation</h1>
        <p className="text-xs text-slate-400">
          Bedside vital sign logs, active problem registries, and clinical SOAP documentation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Recent Clinical Notes & Vitals Stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* Latest SOAP Progress Notes */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-teal-400" />
                Recent Clinical SOAP Progress Notes
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {clinicalNotes.length} recorded entries
              </span>
            </div>

            <div className="space-y-3">
              {clinicalNotes.map((n) => {
                const pat = patients.find((p) => p.id === n.patientId);
                return (
                  <div
                    key={n.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          {pat ? `${pat.firstName} ${pat.lastName}` : 'Patient'}
                        </span>
                        <span className="text-teal-300 font-mono text-[11px]">({pat?.mrn})</span>
                      </div>
                      <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                        <span>{new Date(n.recordedAt).toLocaleString()}</span>
                        <button
                          onClick={() => pat && onSelectPatient(pat.id)}
                          className="text-teal-400 hover:underline font-semibold"
                        >
                          Open Chart
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-400">Assessment:</span>
                        <p className="mt-0.5 text-slate-200">{n.assessment}</p>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-400">Plan:</span>
                        <p className="mt-0.5 text-slate-200">{n.plan}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Physiological Vitals Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              Recent Physiological Vitals Registry
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-2">Patient</th>
                    <th className="py-2 px-2">BP (mmHg)</th>
                    <th className="py-2 px-2">Pulse (BPM)</th>
                    <th className="py-2 px-2">Temp (°C)</th>
                    <th className="py-2 px-2">Resp (/min)</th>
                    <th className="py-2 px-2">SpO2 (%)</th>
                    <th className="py-2 px-2">Recorded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {vitals.map((v) => {
                    const pat = patients.find((p) => p.id === v.patientId);
                    return (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-2 font-sans font-medium text-slate-100">
                          {pat ? `${pat.firstName} ${pat.lastName}` : v.patientId}
                        </td>
                        <td className="py-2 px-2">
                          {v.systolicBp}/{v.diastolicBp}
                        </td>
                        <td className="py-2 px-2 text-emerald-400">{v.heartRate}</td>
                        <td
                          className={`py-2 px-2 ${
                            (v.temperature || 0) >= 38.5 ? 'text-rose-400 font-bold' : ''
                          }`}
                        >
                          {v.temperature}
                        </td>
                        <td className="py-2 px-2">{v.respiratoryRate}</td>
                        <td className="py-2 px-2 text-teal-300">{v.oxygenSaturation}%</td>
                        <td className="py-2 px-2 text-slate-400 text-[10px]">
                          {new Date(v.recordedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Column: Active Diagnoses Registry & Quick Patient Action */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-teal-400" />
              Active Morbidity Problem Registry
            </h3>

            <div className="space-y-2">
              {diagnoses.map((dx) => {
                const pat = patients.find((p) => p.id === dx.patientId);
                return (
                  <div
                    key={dx.id}
                    className="p-2.5 rounded bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{dx.description}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Patient: {pat ? `${pat.firstName} ${pat.lastName}` : dx.patientId}
                      </div>
                      <div className="text-[10px] font-mono text-teal-300 mt-0.5">ICD: {dx.code}</div>
                    </div>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                      {dx.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Select Patient for Bedside Rounding
            </h3>
            <div className="space-y-1">
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectPatient(p.id)}
                  className="w-full text-left p-2 rounded hover:bg-slate-800 flex items-center justify-between text-slate-300 group"
                >
                  <div>
                    <span className="font-semibold text-white group-hover:text-teal-300">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px] block">{p.mrn}</span>
                  </div>
                  <span className="text-teal-400 text-[11px]">Open Chart →</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
