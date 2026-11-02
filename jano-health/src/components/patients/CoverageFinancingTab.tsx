import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  PlusCircle,
  Receipt,
} from 'lucide-react';
import {
  Coverage,
  AuthorizationRequest,
  Claim,
  Invoice,
  Payment,
  EligibilityCheckResponse,
} from '../../domain/financingTypes';
import { financingService } from '../../services/finance/financingService';
import { useAuth } from '../../services/security/authContext';

interface CoverageFinancingTabProps {
  patientId: string;
}

export const CoverageFinancingTab: React.FC<CoverageFinancingTabProps> = ({ patientId }) => {
  const { currentUser, currentFacility } = useAuth();
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [authorizations, setAuthorizations] = useState<AuthorizationRequest[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<EligibilityCheckResponse | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    loadFinancingData();
  }, [patientId]);

  const loadFinancingData = async () => {
    setLoading(true);
    try {
      const cList = await financingService.getCoverageForPatient(patientId);
      setCoverages(cList);

      const authList = await financingService.getAuthorizationsForPatient(patientId);
      setAuthorizations(authList);

      const clmList = await financingService.getClaimsForPatient(patientId);
      setClaims(clmList);

      const invList = await financingService.getInvoicesForPatient(patientId);
      setInvoices(invList);

      const pmtList = await financingService.getPaymentsForPatient(patientId);
      setPayments(pmtList);
    } catch (err) {
      console.error('Failed to load financing records:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCoverage = async (coverageId: string) => {
    setVerifyingId(coverageId);
    try {
      const res = await financingService.verifyEligibility({
        coverageId,
        patientId,
        facilityId: currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default',
        actorId: currentUser?.id || 'usr-default',
        isOnline: true,
      });
      setVerificationResult(res);
      setActionMessage(`Eligibility verified: ${res.status} (${res.coveredServices.join(', ')})`);
      await loadFinancingData();
    } catch (err: any) {
      setActionMessage(`Verification failed: ${err.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleCreateDemoCoverage = async () => {
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      const covId = `cov_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      await financingService.recordCoverage({
        coverageId: covId,
        patientId,
        payerId: 'pyr-community-health-fund',
        programId: 'prog-chf-essential-2026',
        memberReference: `CHF-MEM-${Math.floor(100000 + Math.random() * 900000)}`,
        status: 'ACTIVE',
        effectiveFrom: now.toISOString().split('T')[0],
        effectiveTo: end.toISOString().split('T')[0],
        coverageClass: 'STANDARD_PRIMARY',
        benefitReference: {
          planName: 'Community Health Mutual Fund (CHF)',
          copayPercent: 15,
        },
        verificationStatus: 'PENDING',
        provenance: {
          recordedAt: now.toISOString(),
          recordedBy: currentUser?.id || 'usr-default',
          facilityId: currentFacility?.id || (currentUser as any)?.facilityId || 'fac-default',
        },
      });
      setActionMessage('CHF Active Coverage plan registered successfully.');
      await loadFinancingData();
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading Health Financing and Coverage profiles...</div>;
  }

  return (
    <div className="space-y-6 p-1">
      {actionMessage && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold ml-2">×</button>
        </div>
      )}

      {/* 1. Health Coverage Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-900 text-sm">Health Coverage & Financing Plans</h3>
          </div>
          <button
            onClick={handleCreateDemoCoverage}
            className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 font-medium flex items-center gap-1 transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Enroll in CHF Coverage
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {coverages.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs italic">
              No active financing coverage recorded. Clinical care continues under Direct Self-Pay protocol.
            </div>
          ) : (
            coverages.map((cov) => (
              <div
                key={cov.coverageId}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900">{cov.benefitReference.planName}</span>
                    <span className="text-slate-500 ml-2 font-mono text-2xs">({cov.memberReference})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                      cov.verificationStatus === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {cov.verificationStatus}
                    </span>
                    <button
                      disabled={verifyingId === cov.coverageId}
                      onClick={() => handleVerifyCoverage(cov.coverageId)}
                      className="px-2.5 py-1 text-2xs rounded bg-white border border-slate-300 hover:bg-slate-50 font-medium text-slate-700"
                    >
                      {verifyingId === cov.coverageId ? 'Checking...' : 'Verify Eligibility'}
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-2 text-2xs text-slate-600">
                  <div>
                    <span className="text-slate-400 block">Co-Pay Share</span>
                    <span className="font-medium text-slate-800">{cov.benefitReference.copayPercent || 0}% Patient Responsibility</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Effective Window</span>
                    <span>{cov.effectiveFrom} — {cov.effectiveTo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Class / Tier</span>
                    <span className="font-mono">{cov.coverageClass}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Last Verified</span>
                    <span>{cov.lastVerifiedAt ? new Date(cov.lastVerifiedAt).toLocaleDateString() : 'Never'}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. Prior Authorizations */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 font-semibold text-xs text-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-indigo-600" />
            Service Prior Authorizations ({authorizations.length})
          </div>
          <span className="text-2xs text-slate-500 font-mono">Administrative Verification</span>
        </div>
        <div className="mt-3 space-y-2">
          {authorizations.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-2xs italic">
              No prior authorizations requested for this patient.
            </div>
          ) : (
            authorizations.map((auth) => (
              <div key={auth.authorizationId} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 text-xs flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{auth.requestedService}</span>
                    <span className="font-mono text-2xs text-slate-500">({auth.serviceCode})</span>
                  </div>
                  <p className="text-2xs text-slate-600 mt-0.5">Clinical ref: {auth.clinicalReference.description}</p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                    auth.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {auth.status}
                  </span>
                  <span className="text-2xs text-slate-500 block font-mono mt-0.5">TZS {auth.requestedAmount.toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Billing & Claims Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Claims Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 font-semibold text-xs text-slate-800">
            <FileText className="w-4 h-4 text-slate-600" />
            Adjudicated Claims ({claims.length})
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto text-xs">
            {claims.length === 0 ? (
              <span className="text-slate-400 text-2xs italic">No claims generated yet</span>
            ) : (
              claims.map((clm) => (
                <div key={clm.claimId} className="p-2 border border-slate-100 rounded bg-slate-50/70 text-2xs flex justify-between items-center">
                  <div>
                    <span className="font-mono font-medium">{clm.claimNumber}</span>
                    <p className="text-slate-500">Submitted: TZS {clm.submittedAmount.toLocaleString()}</p>
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

        {/* Invoices & Payments Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 font-semibold text-xs text-slate-800">
            <Receipt className="w-4 h-4 text-slate-600" />
            Invoices & Settlement ({invoices.length})
          </div>
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto text-xs">
            {invoices.length === 0 ? (
              <span className="text-slate-400 text-2xs italic">No invoices issued</span>
            ) : (
              invoices.map((inv) => (
                <div key={inv.invoiceId} className="p-2 border border-slate-100 rounded bg-slate-50/70 text-2xs flex justify-between items-center">
                  <div>
                    <span className="font-mono font-medium">{inv.invoiceNumber}</span>
                    <p className="text-slate-500">Patient Due: TZS {inv.patientResponsibility.toLocaleString()}</p>
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
  );
};
