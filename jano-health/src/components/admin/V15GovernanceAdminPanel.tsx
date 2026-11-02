import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  CreditCard,
  AlertTriangle,
  Building,
  CheckCircle,
  FileText,
  RefreshCw,
  Search,
  Check,
  X,
  ExternalLink,
  History,
  Scale,
  Globe,
  Clock,
  Ban,
  UserCheck,
  Receipt,
  DollarSign,
  Layers,
} from 'lucide-react';
import {
  Payer,
  FinancingProgram,
  Claim,
  Invoice,
  Payment,
  Coverage,
  AuthorizationRequest,
  FinancialQuarantineRecord,
  FinancialReconciliationRecord,
} from '../../domain/financingTypes';
import {
  LongitudinalIdentity,
  IdentityResolutionDecision,
} from '../../domain/identityTypes';
import {
  PatientConsent,
  EmergencyAccessRequest,
  ConsentAuditEntry,
} from '../../domain/consentTypes';
import { financingService } from '../../services/finance/financingService';
import { longitudinalIdentityService } from '../../services/identity/longitudinalIdentityService';
import { consentPolicyEngine } from '../../services/consent/consentPolicyEngine';
import { financialReconciliationService } from '../../services/finance/financialReconciliationService';
import { useAuth } from '../../services/security/authContext';

type AdminSection = 'identity' | 'consent' | 'financing' | 'reconciliation' | 'quarantine' | 'integrations';

export const V15GovernanceAdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [activeSection, setActiveSection] = useState<AdminSection>('identity');

  // Identity state
  const [identities, setIdentities] = useState<LongitudinalIdentity[]>([]);
  const [decisions, setDecisions] = useState<IdentityResolutionDecision[]>([]);

  // Consent state
  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [emergencyAccesses, setEmergencyAccesses] = useState<EmergencyAccessRequest[]>([]);
  const [consentAudits, setConsentAudits] = useState<ConsentAuditEntry[]>([]);

  // Financing state
  const [payers, setPayers] = useState<Payer[]>([]);
  const [programs, setPrograms] = useState<FinancingProgram[]>([]);
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [authorizations, setAuthorizations] = useState<AuthorizationRequest[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Reconciliation & Quarantine state
  const [reconciliations, setReconciliations] = useState<FinancialReconciliationRecord[]>([]);
  const [quarantined, setQuarantined] = useState<FinancialQuarantineRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeSection]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeSection === 'identity') {
        const idList = longitudinalIdentityService.getAllIdentities();
        const decList = longitudinalIdentityService.getAllDecisions();
        setIdentities(idList);
        setDecisions(decList);
      } else if (activeSection === 'consent') {
        const cList = consentPolicyEngine.getAllConsents();
        const emgList = consentPolicyEngine.getAllEmergencyAccessRequests();
        const audList = consentPolicyEngine.getAllAuditEntries();
        setConsents(cList);
        setEmergencyAccesses(emgList);
        setConsentAudits(audList);
      } else if (activeSection === 'financing') {
        const pyrList = await financingService.getPayers();
        const prgList = await financingService.getPrograms();
        const covList = await financingService.getAllCoverages();
        const authList = await financingService.getAllAuthorizations();
        const clmList = await financingService.getAllClaims();
        const invList = await financingService.getAllInvoices();
        const pmtList = await financingService.getAllPayments();
        setPayers(pyrList);
        setPrograms(prgList);
        setCoverages(covList);
        setAuthorizations(authList);
        setClaims(clmList);
        setInvoices(invList);
        setPayments(pmtList);
      } else if (activeSection === 'reconciliation') {
        const recList = financialReconciliationService.getReconciliationRecords();
        setReconciliations(recList);
      } else if (activeSection === 'quarantine') {
        const qList = financingService.getQuarantinedRecords();
        setQuarantined(qList);
      }
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveQuarantine = async (quarantineId: string) => {
    try {
      await financingService.resolveQuarantine(
        quarantineId,
        'Manually cleared after supervisor validation',
        currentUser?.id || 'admin'
      );
      setStatusMessage(`Quarantined record ${quarantineId} resolved.`);
      await loadData();
    } catch (err: any) {
      setStatusMessage(`Resolution error: ${err.message}`);
    }
  };

  const handleVerifyLedger = () => {
    const result = financingService.verifyLedgerIntegrity();
    if (result.valid) {
      setStatusMessage(`Cryptographic audit verified: All ${result.totalEvents} financial ledger events have valid SHA-256 hash chains.`);
    } else {
      setStatusMessage(`Ledger verification failed at index ${result.brokenIndex}.`);
    }
  };

  const activeQuarantineCount = financingService.getQuarantinedRecords().filter((q) => q.status === 'ACTIVE').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Header & Sub-navigation */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            V15 Identity, Consent & Health Financing Governance
          </h2>
          <p className="text-2xs text-slate-500">
            Multi-facility identity reconciliation, purpose-scoped consent directives, and tamper-evident financial ledger
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-lg text-xs overflow-x-auto">
          <button
            onClick={() => setActiveSection('identity')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeSection === 'identity' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Identity
          </button>
          <button
            onClick={() => setActiveSection('consent')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeSection === 'consent' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Consent & Access
          </button>
          <button
            onClick={() => setActiveSection('financing')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeSection === 'financing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Financing
          </button>
          <button
            onClick={() => setActiveSection('reconciliation')}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              activeSection === 'reconciliation' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reconciliation
          </button>
          <button
            onClick={() => setActiveSection('quarantine')}
            className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
              activeSection === 'quarantine' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Quarantine
            {activeQuarantineCount > 0 && (
              <span className="bg-rose-500 text-white text-3xs px-1.5 py-0.2 rounded-full font-bold">
                {activeQuarantineCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSection('integrations')}
            className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
              activeSection === 'integrations' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3 h-3" /> Adapters
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-indigo-50 border-b border-indigo-100 text-indigo-900 text-xs px-4 py-2 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="font-bold text-slate-500 hover:text-slate-800">×</button>
        </div>
      )}

      {/* Main Body */}
      <div className="p-5">
        {/* 1. IDENTITY GOVERNANCE TAB */}
        {activeSection === 'identity' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">Longitudinal Identity & Reconciliation Oversight</span>
                <p className="text-2xs text-slate-500">Deterministic MPI resolution, multi-facility linking, and anti-auto-merge protections</p>
              </div>
              <span className="text-2xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded border border-slate-200">
                National Adapter: NOT CONFIGURED (Fail-Closed)
              </span>
            </div>

            {/* Anti-Auto-Merge Policy Callout */}
            <div className="border border-indigo-100 rounded-lg p-3 bg-indigo-50/40 text-xs flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-indigo-950">Deterministic Reconciliation Safety Invariants</span>
                <p className="text-2xs text-indigo-900/80 leading-relaxed mt-0.5">
                  Autonomous merging on ambiguous demographics is runtime-prohibited. Records in <strong>DECEASED</strong> or <strong>MERGED</strong> state require supervisor override and cannot be silently relinked.
                </p>
              </div>
            </div>

            {/* Reconciliation Decision History */}
            <div>
              <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" /> Identity Reconciliation Decision History ({decisions.length})
              </h4>
              {decisions.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                  No identity reconciliation decisions recorded yet.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {decisions.map((dec) => (
                    <div key={dec.decisionId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/40 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-900">{dec.decisionId}</span>
                          <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                            dec.decision === 'LINK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : dec.decision === 'REVIEW_REQUIRED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {dec.decision}
                          </span>
                          <span className="text-2xs text-slate-500 font-mono">Confidence: {Math.round(dec.confidence * 100)}%</span>
                        </div>
                        <p className="text-2xs text-slate-600 mt-1">Source: {dec.incomingIdentity.sourceSystem} (Ext ID: {dec.incomingIdentity.externalId})</p>
                        <p className="text-2xs text-slate-500 mt-0.5">Reason: {dec.reason}</p>
                      </div>
                      <span className="text-3xs text-slate-400 font-mono">{new Date(dec.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Longitudinal Identities */}
            <div>
              <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-500" /> Longitudinal Identities ({identities.length})
              </h4>
              {identities.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                  No longitudinal identities provisioned in memory.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {identities.map((id) => (
                    <div key={id.identityId} className="p-3 border border-slate-200 rounded-lg bg-white space-y-1.5 shadow-2xs">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-semibold text-slate-900">{id.identityId}</span>
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                          id.identityStatus === 'VERIFIED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : id.identityStatus === 'REVIEW_REQUIRED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {id.identityStatus}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-600">Patient: <span className="font-mono">{id.patientId}</span></p>
                      <p className="text-2xs text-slate-500">Verification Level: <strong>{id.verificationLevel}</strong> ({Math.round(id.confidence * 100)}%)</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {id.linkedFacilities.map((fac) => (
                          <span key={fac} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-3xs font-mono">
                            {fac}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. CONSENT & ACCESS TAB */}
        {activeSection === 'consent' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">Consent Governance, Directives & Emergency Overrides</span>
                <p className="text-2xs text-slate-500">Granular purpose scopes, revocation controls, and break-glass audit logs</p>
              </div>
              <span className="text-2xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-mono">
                Fail-Closed Server Authority
              </span>
            </div>

            {/* Emergency Access Overrides (Break-Glass) */}
            <div>
              <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Emergency Break-Glass Overrides ({emergencyAccesses.length})
              </h4>
              {emergencyAccesses.length === 0 ? (
                <div className="text-center py-5 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                  Zero active or historical emergency break-glass overrides recorded.
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  {emergencyAccesses.map((emg) => (
                    <div key={emg.requestId} className="p-3 border border-rose-200 bg-rose-50/40 rounded-lg flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-rose-950">{emg.requestId}</span>
                          <span className="bg-rose-200 text-rose-900 text-2xs px-2 py-0.5 rounded font-semibold">
                            {emg.decision}
                          </span>
                          <span className="text-2xs text-slate-500">Patient: {emg.patientId}</span>
                        </div>
                        <p className="text-2xs text-slate-700 mt-1">Reason: {emg.emergencyReason}</p>
                        <p className="text-2xs text-slate-500 mt-0.5">Requester: {emg.actorName} ({emg.actorRole}) at {emg.facilityId}</p>
                      </div>
                      <span className="text-3xs text-rose-800 font-mono">Expires: {new Date(emg.expiresAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active & Revoked Consents */}
            <div>
              <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" /> Patient Consent Directives ({consents.length})
              </h4>
              {consents.length === 0 ? (
                <div className="text-center py-5 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                  No patient consents registered yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {consents.map((c) => (
                    <div key={c.consentId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-medium text-slate-900">{c.consentId}</span>
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                          c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-600">Patient: <span className="font-mono">{c.patientId}</span></p>
                      <p className="text-2xs text-slate-500">Purposes: {c.purposes.join(', ')}</p>
                      <span className="text-3xs text-slate-400 block font-mono">Version v{c.version} (Hash: {c.integrityHash.substring(0, 10)}...)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Consent Audit Trail */}
            <div>
              <h4 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-500" /> Immutable Consent Audit Trail ({consentAudits.length})
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto border border-slate-100 rounded-lg p-2 bg-slate-50/40 text-xs">
                {consentAudits.length === 0 ? (
                  <span className="text-slate-400 text-2xs italic">No audit entries recorded</span>
                ) : (
                  consentAudits.slice(-10).reverse().map((aud) => (
                    <div key={aud.id} className="p-1.5 border-b border-slate-100 last:border-b-0 flex justify-between items-center text-2xs">
                      <div>
                        <span className="font-semibold text-slate-800">{aud.action}</span>
                        <span className="text-slate-500 ml-2">{aud.details}</span>
                      </div>
                      <span className="font-mono text-3xs text-slate-400">{new Date(aud.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3. FINANCING GOVERNANCE TAB */}
        {activeSection === 'financing' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">Health Financing Administration & Benefit Programs</span>
                <p className="text-2xs text-slate-500">Payer registry, versioned benefit packages, coverages, claims, and invoices</p>
              </div>
              <button
                onClick={handleVerifyLedger}
                className="px-2.5 py-1 text-2xs rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-medium flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3 text-indigo-600" /> Verify Ledger Integrity
              </button>
            </div>

            {/* Payers & Programs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-slate-500" /> Registered Payers ({payers.length})
                </h4>
                <div className="space-y-2 text-xs">
                  {payers.map((pyr) => (
                    <div key={pyr.payerId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-slate-900">{pyr.name}</span>
                        <span className="text-slate-500 text-2xs block font-mono">{pyr.payerId}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-3xs font-mono bg-slate-200 text-slate-800">
                        {pyr.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-500" /> Benefit Programs ({programs.length})
                </h4>
                <div className="space-y-2 text-xs">
                  {programs.map((prg) => (
                    <div key={prg.programId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-slate-900">{prg.name}</span>
                        <span className="text-slate-500 text-2xs block">Rules Version: {prg.eligibilityRulesReference.version}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-100 text-emerald-800">
                        {prg.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Claims & Invoices Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" /> Claims Submitted & Adjudicated ({claims.length})
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                  {claims.length === 0 ? (
                    <div className="text-slate-400 text-2xs italic py-4 text-center border border-slate-100 rounded">No claims on record</div>
                  ) : (
                    claims.map((clm) => (
                      <div key={clm.claimId} className="p-2.5 border border-slate-200 rounded bg-white text-2xs flex justify-between items-center shadow-2xs">
                        <div>
                          <span className="font-mono font-semibold">{clm.claimNumber}</span>
                          <p className="text-slate-500">TZS {clm.submittedAmount.toLocaleString()} (Patient share: TZS {clm.patientResponsibility.toLocaleString()})</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                          clm.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {clm.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-slate-500" /> Invoices & Settlement ({invoices.length})
                </h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                  {invoices.length === 0 ? (
                    <div className="text-slate-400 text-2xs italic py-4 text-center border border-slate-100 rounded">No invoices issued</div>
                  ) : (
                    invoices.map((inv) => (
                      <div key={inv.invoiceId} className="p-2.5 border border-slate-200 rounded bg-white text-2xs flex justify-between items-center shadow-2xs">
                        <div>
                          <span className="font-mono font-semibold">{inv.invoiceNumber}</span>
                          <p className="text-slate-500">Total: TZS {inv.totalAmount.toLocaleString()} (Patient due: TZS {inv.patientResponsibility.toLocaleString()})</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                          inv.status === 'SETTLED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. FINANCIAL RECONCILIATION TAB */}
        {activeSection === 'reconciliation' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">Financial Settlement & Multi-Entity Reconciliation</span>
                <p className="text-2xs text-slate-500">Invoice/payment matching, claim adjustments, and discrepancy audits</p>
              </div>
              <button
                onClick={loadData}
                className="px-2.5 py-1 text-2xs rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>

            {reconciliations.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                No reconciliation records generated yet. Run settlement matching on payments and invoices to populate.
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {reconciliations.map((rec) => (
                  <div key={rec.reconciliationId} className="p-3 border border-slate-200 rounded-lg bg-white shadow-2xs flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">{rec.reconciliationId}</span>
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                          rec.decision === 'MATCHED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.decision === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-800'
                            : rec.decision === 'REVERSED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {rec.decision}
                        </span>
                        <span className="text-2xs text-slate-500">Type: {rec.reconciliationType}</span>
                      </div>
                      <p className="text-2xs text-slate-700 mt-1">{rec.notes}</p>
                      <span className="text-3xs text-slate-400 font-mono block mt-0.5">Audit Hash: {rec.auditHash.substring(0, 16)}...</span>
                    </div>
                    <span className="text-3xs text-slate-400 font-mono">{new Date(rec.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. FINANCIAL QUARANTINE TAB */}
        {activeSection === 'quarantine' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">Financial Quarantine & Exception Processing</span>
                <p className="text-2xs text-slate-500">Billing anomalies, duplicate claims, and suspicious transactions held for supervisor review</p>
              </div>
              <span className="text-2xs text-slate-500 font-mono">{quarantined.length} Records Total</span>
            </div>

            {quarantined.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic border border-slate-100 rounded-lg">
                Zero quarantined financial records. All claims and coverages are structurally sound.
              </div>
            ) : (
              <div className="space-y-2.5 text-xs">
                {quarantined.map((q) => (
                  <div key={q.quarantineId} className="p-3.5 border border-amber-200 bg-amber-50/40 rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="font-semibold text-amber-950">{q.category}</span>
                        <span className="text-2xs font-mono text-slate-500">({q.entityId})</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                        q.status === 'ACTIVE' ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {q.status}
                      </span>
                    </div>
                    <p className="text-2xs text-slate-700">{q.reason}</p>
                    {q.status === 'ACTIVE' && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleResolveQuarantine(q.quarantineId)}
                          className="px-2.5 py-1 text-2xs rounded bg-white border border-amber-300 hover:bg-amber-100 font-medium text-amber-900 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Resolve & Release
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. EXTERNAL ADAPTERS TAB */}
        {activeSection === 'integrations' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-900 text-sm">External System Adapters & National Gateways</span>
                <p className="text-2xs text-slate-500">Verified status of external identity, national registry, and claims clearinghouse adapters</p>
              </div>
              <span className="text-2xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                Non-Fabrication Policy Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* National Identity Adapter */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-900">National Population Register Adapter</span>
                  <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-slate-200 text-slate-700">
                    NOT CONFIGURED
                  </span>
                </div>
                <p className="text-2xs text-slate-600">
                  Government citizen registry integration endpoint for national health ID verification.
                </p>
                <div className="pt-2 border-t border-slate-200/60 text-3xs text-slate-500 font-mono">
                  State: UNAVAILABLE | Status: NOT_CONFIGURED
                </div>
              </div>

              {/* National Coverage Registry */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-900">National Insurance Registry Adapter</span>
                  <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-slate-200 text-slate-700">
                    NOT CONFIGURED
                  </span>
                </div>
                <p className="text-2xs text-slate-600">
                  Centralized statutory health insurance coverage query and cross-jurisdictional verification.
                </p>
                <div className="pt-2 border-t border-slate-200/60 text-3xs text-slate-500 font-mono">
                  State: UNAVAILABLE | Status: NOT_CONFIGURED
                </div>
              </div>

              {/* National Claims Gateway */}
              <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-900">National Claims Clearinghouse</span>
                  <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-slate-200 text-slate-700">
                    NOT CONFIGURED
                  </span>
                </div>
                <p className="text-2xs text-slate-600">
                  Automated electronic claims transmission, batch adjudication, and remittance advice.
                </p>
                <div className="pt-2 border-t border-slate-200/60 text-3xs text-slate-500 font-mono">
                  State: UNAVAILABLE | Status: NOT_CONFIGURED
                </div>
              </div>

              {/* Local Sandbox Adapter */}
              <div className="p-4 border border-emerald-200 rounded-lg bg-emerald-50/30 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-emerald-950">Local Financing Exchange Sandbox</span>
                  <span className="px-2 py-0.5 rounded text-2xs font-mono font-bold bg-emerald-100 text-emerald-800">
                    SANDBOX ACTIVE
                  </span>
                </div>
                <p className="text-2xs text-emerald-900/80">
                  Isolated development & clinical demonstration harness for CHF eligibility checks and test claims.
                </p>
                <div className="pt-2 border-t border-emerald-200/60 text-3xs text-emerald-800 font-mono">
                  State: SANDBOX | Verification: MOCK_CHF_CLEARINGHOUSE
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
