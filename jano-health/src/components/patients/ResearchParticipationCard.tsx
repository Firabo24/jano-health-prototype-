/**
 * Jano Health - Clinical Core V18: Patient Chart Research Participation Card
 * 
 * Read-only clinical view displaying active research participation, study status,
 * consent purposes, and study visits for an individual patient.
 * 
 * INVARIANT:
 * - Patient chart remains clinically authoritative.
 * - Does NOT clutter the chart with internal IRB review, statistical plans, or data release queues.
 * - Visible only when user has research viewing authorization.
 */

import React from 'react';
import { FlaskConical, CheckCircle2, Calendar, ShieldCheck, XCircle } from 'lucide-react';
import { ResearchSubject, ResearchConsent, StudyVisit } from '../../domain/v18ResearchTypes';

interface ResearchParticipationCardProps {
  subjects: ResearchSubject[];
  consents: ResearchConsent[];
  visits: StudyVisit[];
}

export const ResearchParticipationCard: React.FC<ResearchParticipationCardProps> = ({
  subjects,
  consents,
  visits,
}) => {
  if (subjects.length === 0) {
    return null; // Do not clutter chart when patient is not in any research
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold">
          <FlaskConical className="w-4 h-4" />
          <span>Research Study Participation (V18)</span>
        </div>
        <span className="text-[10px] text-slate-400">Clinical Coordination Only</span>
      </div>

      <div className="space-y-3">
        {subjects.map((sub) => {
          const subConsents = consents.filter((c) => c.researchSubjectId === sub.researchSubjectId);
          const subVisits = visits.filter((v) => v.researchSubjectId === sub.researchSubjectId);

          return (
            <div key={sub.researchSubjectId} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-slate-300 font-medium">{sub.studySpecificIdentifier}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    sub.status === 'ENROLLED' || sub.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : sub.status === 'WITHDRAWN'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {sub.status}
                </span>
              </div>

              {subConsents.length > 0 && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>
                    Consented: {subConsents[0].purposes.join(', ')} ({subConsents[0].status})
                  </span>
                </div>
              )}

              {subVisits.length > 0 && (
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Next Visit: {subVisits[0].scheduledAt} ({subVisits[0].status})</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
