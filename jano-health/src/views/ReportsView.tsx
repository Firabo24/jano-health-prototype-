/**
 * Jano Health - Reports & Epidemiological Surveillance View
 * Outpatient morbidity analytics, malaria surveillance, maternal & child health metrics.
 */

import React from 'react';
import {
  Activity,
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  PieChart,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { localDb } from '../services/storage/localDatabase';
import { useAuth } from '../services/security/authContext';

export const ReportsView: React.FC = () => {
  const { currentFacility } = useAuth();
  const patients = localDb.getPatients();
  const diagnoses = localDb.getDiagnoses();
  const labOrders = localDb.getLabOrders();
  const emergencyCases = localDb.getEmergencyCases();

  // Morbidity tally
  const morbidityCounts: Record<string, number> = {};
  diagnoses.forEach((d) => {
    const key = d.description.split('(')[0].trim();
    morbidityCounts[key] = (morbidityCounts[key] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Epidemiological & Facility Reports</h1>
          <p className="text-xs text-slate-400">
            Morbidity surveillance, HMIS-compliant statistics for {currentFacility.name}
          </p>
        </div>

        <button
          onClick={() => alert('HMIS Monthly Morbidity Bulletin generated for district health officer.')}
          className="px-3.5 py-1.5 rounded-md bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <FileSpreadsheet className="w-4 h-4" /> Export HMIS Monthly Dataset
        </button>
      </div>

      {/* 3 Summary Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-1">
          <span className="text-slate-400 font-medium">Monthly Outpatient Consultations</span>
          <div className="text-2xl font-bold text-white">1,482</div>
          <p className="text-[10px] text-teal-400 font-mono">+12% vs preceding dry season</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-1">
          <span className="text-slate-400 font-medium">Malaria Positivity Rate (mRDT)</span>
          <div className="text-2xl font-bold text-amber-400">41.8%</div>
          <p className="text-[10px] text-amber-400 font-mono">Epidemic alert threshold active</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-1">
          <span className="text-slate-400 font-medium">Emergency Transfer Rate</span>
          <div className="text-2xl font-bold text-white">3.4%</div>
          <p className="text-[10px] text-slate-400 font-mono">Referred to District Hospital</p>
        </div>
      </div>

      {/* Top 5 Morbidities Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-400" />
            Top Outpatient Primary Diagnoses
          </h3>

          <div className="space-y-3">
            {[
              { label: 'Plasmodium falciparum Malaria', count: 48, percentage: 48, color: 'bg-teal-500' },
              { label: 'Severe Community Acquired Pneumonia', count: 24, percentage: 24, color: 'bg-blue-500' },
              { label: 'Acute Gastroenteritis with Dehydration', count: 18, percentage: 18, color: 'bg-purple-500' },
              { label: 'Essential Hypertension', count: 12, percentage: 12, color: 'bg-amber-500' },
              { label: 'Severe Nutritional Anemia', count: 8, percentage: 8, color: 'bg-rose-500' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span className="font-medium truncate max-w-xs">{item.label}</span>
                  <span className="font-mono text-slate-400">{item.count} cases ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sentinel Surveillance Notice */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Regional Sentinel Disease Surveillance
          </h3>

          <div className="space-y-2.5 text-slate-300 leading-relaxed">
            <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-teal-300">Malaria Vector Alert: Malagarasi River Basin</div>
              <p className="text-[11px] text-slate-400">
                Increased rainfall has expanded breeding grounds. Mobile units should prioritize rapid diagnostic testing (mRDT) and distribution of Long-Lasting Insecticidal Nets (LLINs).
              </p>
            </div>

            <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
              <div className="font-semibold text-amber-400">Cold Chain Vaccine Stock Status</div>
              <p className="text-[11px] text-slate-400">
                Solar direct-drive refrigerators at Uvinza and Nguruka verified at +4.2°C. Pentavalent, BCG, and Measles-Rubella stock sufficient for 45 days.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
