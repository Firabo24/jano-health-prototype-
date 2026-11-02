/**
 * Jano Health - Longitudinal Patient Timeline Tab
 * 
 * Aggregates immutable domain events, audit ledger records, and clinical entries
 * into a chronological timeline with cryptographic hash verification and actor provenance.
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  FlaskConical,
  GitMerge,
  HeartPulse,
  Lock,
  Pill,
  RefreshCw,
  Search,
  Shield,
  Stethoscope,
  User,
  UserCheck,
} from 'lucide-react';
import { patientTimelineService, PatientTimelineItem } from '../../services/clinical/patientTimeline';
import { Patient } from '../../domain/types';

interface PatientTimelineTabProps {
  patient: Patient;
}

type TimelineCategoryFilter = 'all' | 'clinical' | 'medication' | 'diagnostic' | 'lifecycle' | 'safety';

export const PatientTimelineTab: React.FC<PatientTimelineTabProps> = ({ patient }) => {
  const [items, setItems] = useState<PatientTimelineItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<TimelineCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const timeline = await patientTimelineService.getPatientTimeline(patient.id);
      setItems(timeline);
    } catch (err) {
      console.error('Failed to load patient timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, [patient.id]);

  const getCategoryIcon = (cat: PatientTimelineItem['category']) => {
    switch (cat) {
      case 'REGISTRATION':
        return <UserCheck className="w-4 h-4 text-teal-400" />;
      case 'DEMOGRAPHICS':
        return <User className="w-4 h-4 text-blue-400" />;
      case 'VITALS':
        return <HeartPulse className="w-4 h-4 text-rose-400" />;
      case 'ENCOUNTER':
        return <FileText className="w-4 h-4 text-indigo-400" />;
      case 'DIAGNOSIS':
        return <Stethoscope className="w-4 h-4 text-amber-400" />;
      case 'MEDICATION':
        return <Pill className="w-4 h-4 text-emerald-400" />;
      case 'INVESTIGATION':
        return <FlaskConical className="w-4 h-4 text-purple-400" />;
      case 'MERGE':
        return <GitMerge className="w-4 h-4 text-amber-400" />;
      case 'LIFECYCLE':
      default:
        return <Shield className="w-4 h-4 text-slate-400" />;
    }
  };

  const getCategoryBadgeClass = (cat: PatientTimelineItem['category']) => {
    switch (cat) {
      case 'REGISTRATION':
        return 'bg-teal-950 text-teal-300 border-teal-800';
      case 'VITALS':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'ENCOUNTER':
        return 'bg-indigo-950 text-indigo-300 border-indigo-800';
      case 'DIAGNOSIS':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'MEDICATION':
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'INVESTIGATION':
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'MERGE':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const filteredItems = items.filter((item) => {
    // Search query filter
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.actorName && item.actorName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.actorRole && item.actorRole.toLowerCase().includes(searchQuery.toLowerCase()));

    // Category filter
    let matchesCategory = true;
    if (categoryFilter === 'clinical') {
      matchesCategory = ['VITALS', 'ENCOUNTER', 'DIAGNOSIS'].includes(item.category);
    } else if (categoryFilter === 'medication') {
      matchesCategory = item.category === 'MEDICATION';
    } else if (categoryFilter === 'diagnostic') {
      matchesCategory = item.category === 'INVESTIGATION';
    } else if (categoryFilter === 'lifecycle') {
      matchesCategory = ['REGISTRATION', 'DEMOGRAPHICS', 'LIFECYCLE', 'MERGE'].includes(item.category);
    } else if (categoryFilter === 'safety') {
      matchesCategory = ['LIFECYCLE', 'MERGE'].includes(item.category);
    }

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4 text-xs">
      {/* Top Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search chronological events, actors, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TimelineCategoryFilter)}
              className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-teal-500"
            >
              <option value="all">All Domain Events ({items.length})</option>
              <option value="clinical">Clinical (Vitals, Notes, Dx)</option>
              <option value="medication">Medication Orders</option>
              <option value="diagnostic">Labs & Imaging</option>
              <option value="lifecycle">Identity & Lifecycle</option>
              <option value="safety">Security & Audit</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto text-slate-400 text-[11px] font-mono">
          <span className="flex items-center gap-1 text-teal-400">
            <Shield className="w-3.5 h-3.5" /> Immutable Event Stream
          </span>
          <button
            onClick={loadTimeline}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh Timeline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline Stream */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <Clock className="w-6 h-6 animate-spin text-teal-400" />
          <span>Reconstructing longitudinal patient timeline...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
          <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="font-semibold text-slate-300">No timeline events match the filter criteria.</p>
          <p className="text-[11px] text-slate-500 mt-1">Try resetting the search or category filter.</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
          {filteredItems.map((item, index) => (
            <div key={item.id || index} className="relative group">
              {/* Timeline Bullet Node */}
              <div className="absolute -left-6 top-1.5 w-5 h-5 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center shadow group-hover:border-teal-400 transition-colors">
                {getCategoryIcon(item.category)}
              </div>

              {/* Event Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2 hover:border-slate-700 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">{item.title}</span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase border font-semibold ${getCategoryBadgeClass(
                        item.category
                      )}`}
                    >
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <p className="text-slate-300 text-xs leading-relaxed">{item.summary}</p>

                {/* Metadata & Cryptographic Provenance Bar */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    {item.actorName && (
                      <span>
                        Actor: <strong className="text-slate-300">{item.actorName}</strong>
                        {item.actorRole && ` (${item.actorRole})`}
                      </span>
                    )}
                    {item.facilityId && (
                      <span className="text-slate-500">• Facility: {item.facilityId}</span>
                    )}
                  </div>

                  {item.eventHash && (
                    <div
                      className="flex items-center gap-1 text-teal-400/90 bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-900/60"
                      title={`SHA-256 Event Hash: ${item.eventHash}`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-teal-400" />
                      <span>Hash: {item.eventHash.substring(0, 8)}...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
