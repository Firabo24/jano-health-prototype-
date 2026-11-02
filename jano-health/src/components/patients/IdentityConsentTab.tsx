import React, { useState, useEffect } from 'react';
import {
  Shield,
  FileCheck,
  AlertTriangle,
  Building,
  CheckCircle2,
  Clock,
  Ban,
  Lock,
} from 'lucide-react';
import { LongitudinalIdentity } from '../../domain/identityTypes';
import { PatientConsent, EmergencyAccessRequest, ConsentAuditEntry } from '../../domain/consentTypes';
import { longitudinalIdentityService } from '../../services/identity/longitudinalIdentityService';
import { consentPolicyEngine } from '../../services/consent/consentPolicyEngine';
import { useAuth } from '../../services/security/authContext';

interface IdentityConsentTabProps {
  patientId: string;
}

export const IdentityConsentTab: React.FC<IdentityConsentTabProps> = ({ patientId }) => {
  const { currentUser, currentFacility } = useAuth();
  const [identity, setIdentity] = useState<LongitudinalIdentity | null>(null);
  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [auditHistory, setAuditHistory] = useState<ConsentAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakGlassReason, setBreakGlassReason] = useState('');
  const [showBreakGlassModal, setShowBreakGlassModal] = useState(false);
  const [emergencyAccess, setEmergencyAccess] = useState<EmergencyAccessRequest | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [patientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const id = await longitudinalIdentityService.getIdentityForPatient(patientId);
      if (id) setIdentity(id);

      const cList = await consentPolicyEngine.getConsentsForPatient(patientId);
      setConsents(cList);

      const audits = await consentPolicyEngine.getConsentAuditHistory(patientId);
      setAuditHistory(audits);
    } catch (err) {
      console.error('Failed to load identity/consent data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGrantDefaultConsent = async () => {
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      await consentPolicyEngine.grantConsent({
        patientId,
        purposes: ['DIRECT_CARE', 'REFERRAL', 'DIAGNOSTIC_SERVICE', 'CARE_COORDINATION'],
        scope: {
          facilities: identity?.linkedFacilities || [currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default'],
          resourceCategories: ['PATIENT_DEMOGRAPHICS', 'ENCOUNTERS', 'CLINICAL_NOTES', 'DIAGNOSES', 'MEDICATIONS', 'LABORATORY', 'RADIOLOGY'],
        },
        effectivePeriod: {
          start: now.toISOString(),
          end: end.toISOString(),
        },
        status: 'ACTIVE',
        grantedAt: now.toISOString(),
        provenance: {
          grantedFacilityId: currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default',
          grantedByActorId: currentUser?.id || 'usr-default',
          grantedByActorRole: (currentUser as any)?.role || 'physician',
          systemVersion: 'v15.0',
        },
        verificationMetadata: {
          signatureType: 'WRITTEN',
          verifiedAt: now.toISOString(),
        },
      });
      setActionMessage('Active Clinical Care & Referral consent granted successfully.');
      await loadData();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleRevokeConsent = async (consentId: string) => {
    try {
      await consentPolicyEngine.revokeConsent(
        consentId,
        'Patient requested formal revocation',
        currentUser?.id || 'usr-default',
        (currentUser as any)?.role || 'physician',
        currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default'
      );
      setActionMessage(`Consent ${consentId} has been revoked.`);
      await loadData();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleTriggerBreakGlass = async () => {
    if (!breakGlassReason.trim()) return;
    try {
      const emg = await consentPolicyEngine.requestEmergencyAccess({
        actorId: currentUser?.id || 'usr-physician',
        actorRole: (currentUser as any)?.role || 'physician',
        actorName: (currentUser as any)?.fullName || (currentUser as any)?.name || 'Physician',
        facilityId: currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default',
        patientId,
        emergencyReason: breakGlassReason,
        durationMinutes: 60,
      });
      setEmergencyAccess(emg);
      setShowBreakGlassModal(false);
      setBreakGlassReason('');
      setActionMessage(`Emergency Break-Glass authorized until ${new Date(emg.expiresAt).toLocaleTimeString()}`);
    } catch (err: any) {
      setActionMessage(`Break-glass error: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading Longitudinal Identity and Consent records...</div>;
  }

  return (
    <div className="space-y-6 p-1">
      {actionMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* 1. Longitudinal Identity Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Longitudinal Identity Profile</h3>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            identity?.identityStatus === 'VERIFIED'
              ? 'bg-emerald-100 text-emerald-800'
              : identity?.identityStatus === 'REVIEW_REQUIRED'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-indigo-100 text-indigo-800'
          }`}>
            {identity?.identityStatus || 'PROVISIONAL'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs">
          <div>
            <span className="text-slate-500 block">Identity ID</span>
            <span className="font-mono text-slate-800 font-medium">{identity?.identityId}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Verification Level</span>
            <span className="text-slate-800 font-medium">{identity?.verificationLevel}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Confidence Score</span>
            <span className="text-slate-800 font-medium">{Math.round((identity?.confidence || 0) * 100)}%</span>
          </div>
          <div>
            <span className="text-slate-500 block">Version / Hash</span>
            <span className="font-mono text-slate-600 truncate block">v{identity?.version} ({identity?.integrityHash.substring(0, 8)}...)</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Building className="w-3.5 h-3.5 text-slate-500" /> Linked Facilities
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(identity?.linkedFacilities || []).map((fac) => (
                <span key={fac} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-2xs font-mono">
                  {fac}
                </span>
              ))}
            </div>
          </div>
          <div>
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <FileCheck className="w-3.5 h-3.5 text-slate-500" /> External System Links
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(identity?.linkedExternalSystems || []).length > 0 ? (
                identity?.linkedExternalSystems.map((ext) => (
                  <span key={ext.systemCode + ext.externalId} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-2xs font-mono">
                    {ext.systemName}: {ext.externalId}
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic">No external systems linked</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Consent Directives Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Patient Consent Directives & Purpose Scopes</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBreakGlassModal(true)}
              className="text-xs px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-medium flex items-center gap-1 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Emergency Break-Glass
            </button>
            <button
              onClick={handleGrantDefaultConsent}
              className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium flex items-center gap-1 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Grant Clinical Consent
            </button>
          </div>
        </div>

        {emergencyAccess && (
          <div className="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 flex items-center justify-between">
            <div>
              <span className="font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-rose-600" /> Active Emergency Access Granted
              </span>
              <p className="mt-0.5 text-2xs text-rose-700">Reason: {emergencyAccess.emergencyReason}</p>
            </div>
            <span className="font-mono text-2xs bg-rose-200 text-rose-900 px-2 py-0.5 rounded">
              Expires: {new Date(emergencyAccess.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {consents.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              No consent directives documented for this patient. Care operations strictly fail closed without authorized consent.
            </div>
          ) : (
            consents.map((c) => (
              <div
                key={c.consentId}
                className={`p-3.5 rounded-lg border text-xs ${
                  c.status === 'ACTIVE'
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-slate-800">{c.consentId}</span>
                    <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                      c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                  {c.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleRevokeConsent(c.consentId)}
                      className="text-rose-600 hover:text-rose-800 text-2xs font-medium flex items-center gap-1"
                    >
                      <Ban className="w-3 h-3" /> Revoke
                    </button>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-2xs text-slate-600">
                  <div>
                    <span className="text-slate-400 block">Authorized Purposes</span>
                    <span className="font-medium text-slate-800">{c.purposes.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Effective Window</span>
                    <span>{new Date(c.effectivePeriod.start).toLocaleDateString()} — {c.effectivePeriod.end ? new Date(c.effectivePeriod.end).toLocaleDateString() : 'Permanent'}</span>
                  </div>
                </div>

                {c.scope.facilities && (
                  <div className="mt-1.5 text-2xs text-slate-500">
                    <span className="text-slate-400">Scoped Facilities: </span>
                    {c.scope.facilities.join(', ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Data Sharing & Consent Audit History */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Data Sharing Transparency & Audit History</h3>
          </div>
          <span className="text-2xs text-slate-500 font-mono">{auditHistory.length} Recorded Events</span>
        </div>

        <div className="mt-4 space-y-2 max-h-56 overflow-y-auto">
          {auditHistory.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              No inter-facility data sharing or consent state mutations recorded for this patient.
            </div>
          ) : (
            auditHistory.map((entry) => (
              <div
                key={entry.id}
                className="p-3 border border-slate-100 rounded-lg bg-slate-50/70 text-xs flex justify-between items-start"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{entry.action}</span>
                    <span className={`px-2 py-0.5 rounded text-3xs font-semibold ${
                      entry.category === 'CONSENT_STATE_CHANGED'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {entry.category}
                    </span>
                    <span className="text-2xs text-slate-500">Facility: {entry.facilityId}</span>
                  </div>
                  <p className="text-2xs text-slate-600 mt-1">{entry.details}</p>
                  <span className="text-3xs text-slate-400 font-mono mt-0.5 block">Audit Hash: {entry.auditHash.substring(0, 16)}...</span>
                </div>
                <span className="text-3xs text-slate-400 font-mono">{new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Break Glass Modal */}
      {showBreakGlassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-rose-200">
            <div className="flex items-center gap-2 text-rose-600 font-semibold text-sm">
              <AlertTriangle className="w-5 h-5" />
              Emergency Access Override (Break-Glass)
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Emergency break-glass access temporarily bypasses standard consent constraints for life-threatening or urgent trauma clinical care. This action is permanently audited and reported to clinical supervision.
            </p>
            <div>
              <label className="text-2xs font-semibold text-slate-700 block mb-1">
                Document Clinical Emergency Justification *
              </label>
              <textarea
                value={breakGlassReason}
                onChange={(e) => setBreakGlassReason(e.target.value)}
                placeholder="e.g., Unconscious trauma arrival requiring immediate surgical intervention..."
                className="w-full text-xs border border-slate-300 rounded-lg p-2.5 h-20 focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowBreakGlassModal(false)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                disabled={!breakGlassReason.trim()}
                onClick={handleTriggerBreakGlass}
                className="text-xs px-3.5 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Break-Glass (1 Hour)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
