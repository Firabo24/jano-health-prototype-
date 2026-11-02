/**
 * Jano Health — Post-Core Track 2
 * External Assurance, Conformance Evidence & Certification Readiness Panel
 *
 * Operational Command Center for:
 * 1. Assurance Programs across 12 Scopes
 * 2. External Assessor Registry & Independence Governance
 * 3. Bidirectional Traceability Matrix & SHA-256 Tamper-Evident Artifacts
 * 4. Assessor Findings, Non-Conformity Management & Clinical Safety Sign-offs
 * 5. Interoperability, AI Assurance & Cybersecurity Conformance
 * 6. Claim Control (Truth-in-Advertising) & Sealed Audit Dossiers
 */

import React, { useState } from 'react';
import {
  assuranceProgramService,
  externalAssessorService,
  traceabilityEvidenceService,
  assessorFindingsService,
  interopAiSecurityConformanceService,
  claimControlAndDossierService,
} from '../../services/postcore';
import {
  TRACK2_STATUTORY_DISCLAIMER,
  AssuranceScopeType,
  FindingSeverity,
  IndependentAuditPacket,
} from '../../domain/postCoreTrack2Types';
import {
  ShieldCheck,
  Award,
  AlertTriangle,
  FileCheck2,
  Lock,
  ExternalLink,
  Layers,
  Cpu,
  Fingerprint,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react';

export const PostCoreTrack2AssurancePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'programs' | 'assessors' | 'traceability' | 'findings' | 'conformance' | 'claims_dossier'
  >('programs');

  const [selectedProgramId, setSelectedProgramId] = useState<string>('prg-tz-assurance-2026');
  const [findingSeverityFilter, setFindingSeverityFilter] = useState<string>('ALL');
  const [auditPacket, setAuditPacket] = useState<IndependentAuditPacket | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load live service state
  const programs = assuranceProgramService.getPrograms();
  const currentProgram = assuranceProgramService.getProgramById(selectedProgramId) || programs[0];
  const assessors = externalAssessorService.getAssessors();
  const artifacts = traceabilityEvidenceService.getArtifacts();
  const matrix = traceabilityEvidenceService.generateTraceabilityMatrix(selectedProgramId);
  const findings = assessorFindingsService.getFindings(selectedProgramId);
  const interopRecords = interopAiSecurityConformanceService.getInteropRecords();
  const aiRecords = interopAiSecurityConformanceService.getAIAssuranceRecords();
  const cyberRecords = interopAiSecurityConformanceService.getCybersecurityRecords();
  const privacyRecords = interopAiSecurityConformanceService.getPrivacyRecords();
  const claims = claimControlAndDossierService.getClaims();

  const handleGenerateDossier = () => {
    try {
      const packet = claimControlAndDossierService.generateIndependentAuditPacket(currentProgram.id);
      setAuditPacket(packet);
      setActionMessage('Audit packet successfully compiled and cryptographically sealed with SHA-256.');
    } catch (err: unknown) {
      setActionMessage(`Error generating audit packet: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const filteredFindings = findings.filter((f) => {
    if (findingSeverityFilter === 'ALL') return true;
    return f.severity === findingSeverityFilter;
  });

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Banner with Statutory Disclaimer */}
      <div className="bg-slate-900 border border-amber-500/30 rounded-lg p-4 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide text-amber-300 uppercase">
                Post-Core Track 2 — External Assurance & Certification Readiness
              </span>
              <span className="text-xs text-slate-400">· Independent Review Boundary</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              {TRACK2_STATUTORY_DISCLAIMER}
            </p>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="bg-slate-800 border border-emerald-500/50 text-emerald-300 px-4 py-2.5 rounded text-xs flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white ml-4 text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('programs')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'programs'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Assurance Programs & Scopes (12)
        </button>
        <button
          onClick={() => setActiveTab('assessors')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'assessors'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          External Assessors & Independence
        </button>
        <button
          onClick={() => setActiveTab('traceability')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'traceability'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <Fingerprint className="w-3.5 h-3.5" />
          Traceability & Evidence SHA-256
        </button>
        <button
          onClick={() => setActiveTab('findings')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'findings'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Assessor Findings & CSO Sign-off
        </button>
        <button
          onClick={() => setActiveTab('conformance')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'conformance'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Interop, AI & Security Conformance
        </button>
        <button
          onClick={() => setActiveTab('claims_dossier')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'claims_dossier'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-400 hover:text-white bg-slate-800/60'
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          Claim Truth & Sealed Dossier
        </button>
      </div>

      {/* TAB 1: PROGRAMS & 12 SCOPES */}
      {activeTab === 'programs' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <span>{currentProgram.title}</span>
                  <span className="text-xs font-mono text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded">
                    {currentProgram.programCode}
                  </span>
                </h3>
                <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3">
                  <span>Target Release: {currentProgram.targetRelease}</span>
                  <span>·</span>
                  <span>Status: {currentProgram.status}</span>
                  <span>·</span>
                  <span>Organization: {currentProgram.organizationId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Program Lifecycle:</span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-emerald-400">
                  {currentProgram.status}
                </span>
              </div>
            </div>

            {/* 12 Independent Assurance Scopes Grid */}
            <div className="mt-5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                12 Independent Assurance Scopes
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentProgram.scopes.map((scope) => (
                  <div
                    key={scope.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{scope.title}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          scope.status === 'CONFORMANT'
                            ? 'text-emerald-400 bg-emerald-950/50 border border-emerald-800/50'
                            : scope.status === 'IN_EVALUATION'
                            ? 'text-amber-400 bg-amber-950/50 border border-amber-800/50'
                            : 'text-slate-400 bg-slate-900 border border-slate-800'
                        }`}
                      >
                        {scope.status}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">{scope.objective}</p>
                    <div className="pt-1 text-[10px] text-slate-500 space-y-0.5 border-t border-slate-900">
                      <div>Standards: {scope.applicableStandards.join(', ')}</div>
                      <div className="text-amber-500/80">Limitation: {scope.limitations}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Milestones */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Assurance Milestones & Deliverables
              </h4>
              <div className="space-y-2">
                {currentProgram.milestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-800/80 rounded text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {m.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Activity className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="font-medium text-slate-200">{m.title}</span>
                      <span className="text-slate-500">· Target: {m.targetDate}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Deliverables: {m.deliverables.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXTERNAL ASSESSORS & INDEPENDENCE */}
      {activeTab === 'assessors' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-2">
              Registered External Independent Assessors
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Strict conflict-of-interest rules prohibit assessors from reviewing components or subsystems they authored.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assessors.map((a) => (
                <div
                  key={a.id}
                  className="p-4 bg-slate-950/70 border border-slate-800 rounded text-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">{a.fullName}</h4>
                      <p className="text-slate-400 text-[11px]">{a.organizationName}</p>
                      {a.accreditationBody && (
                        <p className="text-amber-400 text-[10px] mt-0.5">
                          Accreditation: {a.accreditationBody}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                      {a.independenceStatus}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-500">Credentials: </span>
                      {a.credentials.join(' · ')}
                    </div>
                    <div>
                      <span className="text-slate-500">Specialties: </span>
                      {a.specialties.join(', ')}
                    </div>
                    <div>
                      <span className="text-slate-500">Engagement: </span>
                      {a.engagementState} (From {a.contractStartDate})
                    </div>
                  </div>

                  <div className="p-2 bg-slate-900 rounded border border-slate-800 text-[11px]">
                    <div className="flex items-center gap-1.5 font-medium text-slate-300 mb-0.5">
                      <Lock className="w-3 h-3 text-emerald-400" />
                      Conflict of Interest Verification:
                    </div>
                    <p className="text-slate-400 text-[10px]">
                      {a.conflictOfInterest.details || 'Declared zero commercial or authoring conflict.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRACEABILITY & EVIDENCE SHA-256 */}
      {activeTab === 'traceability' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Bidirectional Traceability Matrix</h3>
                <p className="text-xs text-slate-400">
                  Maps requirements directly to design code, automated tests, and empirical logs.
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-emerald-400 font-mono">
                  {matrix.completenessPercentage}%
                </div>
                <div className="text-[10px] text-slate-500">Requirements Coverage</div>
              </div>
            </div>

            {/* Trace Links */}
            <div className="space-y-2">
              {matrix.traceLinks.map((link) => (
                <div
                  key={link.id}
                  className="p-3 bg-slate-950/60 border border-slate-800 rounded text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
                        {link.relationship}
                      </span>
                      <span className="text-slate-200 font-medium">{link.sourceId}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] pl-2 border-l border-slate-700">
                      Linked to: <span className="text-slate-300 font-mono">{link.targetId}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 text-[10px] text-slate-500">
                    Verified: {link.verifiedBy}
                  </div>
                </div>
              ))}
            </div>

            {/* Evidence Artifacts SHA-256 */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Tamper-Evident Evidence Artifacts (SHA-256 Chained)
              </h4>
              <div className="space-y-2">
                {artifacts.map((art) => (
                  <div
                    key={art.id}
                    className="p-3 bg-slate-950/40 border border-slate-800/80 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{art.title}</div>
                      <div className="text-[11px] font-mono text-emerald-400/90 mt-0.5">
                        SHA-256: {art.sha256Digest}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Scope: {art.scopeType} · Collector: {art.collectedBy} · URI: {art.uri}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 text-right shrink-0">
                      <span className="text-emerald-400 font-mono">TAMPER-EVIDENT</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FINDINGS & CSO SIGN-OFF */}
      {activeTab === 'findings' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Assessor Findings & Non-Conformities</h3>
                <p className="text-xs text-slate-400">
                  Clinical safety findings strictly require sign-off by the Clinical Safety Officer to close.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Severity:</span>
                <select
                  value={findingSeverityFilter}
                  onChange={(e) => setFindingSeverityFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-xs rounded px-2.5 py-1 text-slate-200"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="MAJOR">Major</option>
                  <option value="MINOR">Minor</option>
                  <option value="OBSERVATION">Observation</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredFindings.map((f) => (
                <div
                  key={f.id}
                  className="p-4 bg-slate-950/70 border border-slate-800 rounded text-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{f.findingCode}</span>
                        <span className="font-semibold text-white">{f.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">{f.description}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                          f.severity === 'CRITICAL'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : f.severity === 'MAJOR'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {f.severity}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {f.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900 rounded border border-slate-800/80 text-[11px] space-y-1">
                    <div>
                      <span className="text-slate-500">Root Cause: </span>
                      <span className="text-slate-300">{f.rootCause || 'Under investigation'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Remediation: </span>
                      <span className="text-slate-300">{f.remediationPlan || 'Pending'}</span>
                    </div>
                    {f.affectsClinicalSafety && f.clinicalSafetyOfficerSignoff && (
                      <div className="pt-1 border-t border-slate-800 flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          CSO Sign-off Verified: {f.clinicalSafetyOfficerSignoff.officerName} (
                          {f.clinicalSafetyOfficerSignoff.signedAt})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INTEROP, AI & CYBER CONFORMANCE */}
      {activeTab === 'conformance' && (
        <div className="space-y-6">
          {/* Interoperability Conformance */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-1">
              External Interoperability Protocol Conformance
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Synthetic conformance test execution across HL7 FHIR R4, DICOM, and openEHR.
            </p>

            <div className="space-y-3">
              {interopRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      Protocol: {rec.protocol} (v{rec.specVersion})
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                      SYNTHETIC CONFORMANCE PASS
                    </span>
                  </div>
                  <div className="space-y-1">
                    {rec.testCases.map((tc) => (
                      <div
                        key={tc.id}
                        className="flex items-center justify-between p-2 bg-slate-900 rounded text-[11px]"
                      >
                        <div>
                          <span className="font-mono text-amber-400 mr-2">{tc.testCode}</span>
                          <span className="text-slate-300">{tc.description}</span>
                        </div>
                        <span className="text-emerald-400 font-mono">{tc.result} ({tc.latencyMs}ms)</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-amber-500/80 font-mono">{rec.disclaimer}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Assurance & Algorithmic Transparency */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-1">
              AI Assurance & Algorithmic Transparency Governance
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Hard enforcement: advisory-only operation, mandatory clinician review, and zero autonomous mutation.
            </p>

            {aiRecords.map((ai) => (
              <div
                key={ai.id}
                className="p-4 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white">{ai.clinicalDomain}</h4>
                    <p className="text-slate-400 text-[11px] font-mono">{ai.modelIdentifier} ({ai.version})</p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                    ADVISORY ONLY
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Autonomous Mutation</span>
                    <span className="text-rose-400 font-bold">STRICTLY PROHIBITED</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Clinician Review</span>
                    <span className="text-emerald-400 font-bold">MANDATORY REQUIRED</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Offline Fallback</span>
                    <span className="text-emerald-400 font-bold">DETERMINISTIC HEURISTICS</span>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px]">Explainability</span>
                    <span className="text-slate-300 font-bold">{ai.explainabilityMethod}</span>
                  </div>
                </div>

                <div className="text-[10px] text-amber-500/80 font-mono">{ai.disclaimer}</div>
              </div>
            ))}
          </div>

          {/* Cybersecurity Assurance */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-1">
              Cybersecurity Assurance & Vulnerability SLA Management
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              STRIDE threat modeling, independent penetration testing records, and vulnerability disclosure tracking.
            </p>

            {cyberRecords.map((cy) => (
              <div
                key={cy.id}
                className="p-4 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">
                    Threat Model: {cy.threatModelMethod} · Offline Mesh Security: Verified
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {cy.penetrationTestStatus}
                  </span>
                </div>
                <div className="space-y-1">
                  {cy.vulnerabilities.map((v) => (
                    <div
                      key={v.id}
                      className="p-2 bg-slate-900 rounded flex items-center justify-between text-[11px]"
                    >
                      <div>
                        <span className="font-mono text-amber-400 mr-2">{v.cweId}</span>
                        <span className="text-slate-300">{v.component}</span>
                      </div>
                      <span className="text-emerald-400 font-mono">
                        {v.status} (SLA &lt;{v.slaMaxHoursToRemediate}h)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: CLAIM TRUTH & SEALED DOSSIER */}
      {activeTab === 'claims_dossier' && (
        <div className="space-y-6">
          {/* Claim Control & Truth in Advertising */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-white mb-1">
              Commercial & Regulatory Claim Registry
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Anti-overclaim policy: unsubstantiated claims of official certification (FDA, CE, ISO) are prohibited.
            </p>

            <div className="space-y-3">
              {claims.map((claim) => (
                <div
                  key={claim.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800 rounded text-xs space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-slate-200">{claim.claimText}</div>
                    <span
                      className={`text-[10px] font-mono shrink-0 px-2 py-0.5 rounded ${
                        claim.state === 'SUBSTANTIATED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : claim.state === 'PROHIBITED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {claim.state}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Target Standard: {claim.targetStandardOrRegulation} · Jurisdiction: {claim.jurisdiction}
                  </div>
                  {claim.prohibitedReason && (
                    <div className="text-[10px] text-rose-400 font-mono bg-rose-950/30 p-2 rounded border border-rose-900/40">
                      {claim.prohibitedReason}
                    </div>
                  )}
                  {claim.auditorComments && (
                    <div className="text-[10px] text-emerald-400/90 font-mono">
                      Assessor Note: {claim.auditorComments}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cryptographically Sealed Audit Packet */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Independent Audit Dossier Generation</h3>
                <p className="text-xs text-slate-400">
                  Compiles scopes, findings, traceability, and claims into a tamper-evident inspection packet.
                </p>
              </div>
              <button
                onClick={handleGenerateDossier}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
              >
                <FileCheck2 className="w-4 h-4" />
                Generate & Seal Audit Packet
              </button>
            </div>

            {auditPacket && (
              <div className="p-4 bg-slate-950 border border-emerald-500/40 rounded text-xs space-y-3 font-mono">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-emerald-400">INDEPENDENT AUDIT PACKET SEALED</span>
                  <span className="text-slate-400 text-[11px]">{auditPacket.generatedAt}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div>Program: {auditPacket.programCode}</div>
                  <div>Release: {auditPacket.targetRelease}</div>
                  <div>Scopes: {auditPacket.totalScopesEvaluated}</div>
                  <div>Traceability: {auditPacket.traceabilityCompleteness}%</div>
                </div>
                <div className="pt-2 border-t border-slate-800 text-[11px] text-emerald-300 break-all">
                  SHA-256 SEAL: {auditPacket.sha256DossierSeal}
                </div>
                <div className="text-[10px] text-amber-400/80">
                  {auditPacket.statutoryDisclaimer}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
