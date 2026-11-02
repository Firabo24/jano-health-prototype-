/**
 * Jano Health - Development / Demo Authentication & Identity Gateway
 * 
 * Provides:
 * 1. Standard credentials login form (email/password)
 * 2. Clearly labeled "Development / Demo Accounts" directory with one-click
 *    authentication for all 10 canonical healthcare roles.
 * 3. Role category filtering (Clinical, Nursing, Diagnostic/Pharmacy, Administrative)
 * 4. Search by name, role title, specialization, or facility.
 * 5. Full transparency of capabilities, facility scope, and medical profile.
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  Shield,
  Building2,
  Search,
  LogIn,
  KeyRound,
  Stethoscope,
  HeartPulse,
  FlaskConical,
  Radio,
  Pill,
  UserCheck,
  ClipboardCheck,
  Layers,
  Sparkles,
  Lock,
  ArrowRight,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';
import { CANONICAL_DEMO_USERS, DemoUser, DEMO_FACILITY_REGISTRY } from '../../config/demoUsers';
import { ROLE_DEFINITIONS } from '../../domain/permissions';
import { RoleType } from '../../domain/types';
import { getAuthAdapter } from '../../services/security/authAdapter';

interface LoginPageProps {
  onSuccess?: () => void;
}

type RoleCategoryFilter = 'all' | 'clinical' | 'nursing' | 'diagnostic' | 'administrative';

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { setCurrentUser, setCurrentFacility, authMode } = useAuth();

  // Standard login form state
  const [email, setEmail] = useState('sarah.alemu@janohealth.org');
  const [password, setPassword] = useState('demo123');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Demo user directory state
  const [categoryFilter, setCategoryFilter] = useState<RoleCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRolePreview, setSelectedRolePreview] = useState<DemoUser | null>(null);

  // Filtered demo users
  const filteredUsers = useMemo(() => {
    return CANONICAL_DEMO_USERS.filter((user) => {
      // Category filter
      if (categoryFilter === 'clinical') {
        if (!['physician', 'health_officer', 'clinical_supervisor'].includes(user.role)) return false;
      } else if (categoryFilter === 'nursing') {
        if (!['nurse'].includes(user.role)) return false;
      } else if (categoryFilter === 'diagnostic') {
        if (!['pharmacist', 'laboratory_staff', 'radiology_staff'].includes(user.role)) return false;
      } else if (categoryFilter === 'administrative') {
        if (!['system_administrator', 'facility_administrator', 'receptionist'].includes(user.role)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const roleDef = ROLE_DEFINITIONS[user.role];
        const matchName = user.fullName.toLowerCase().includes(q);
        const matchRole = roleDef?.title.toLowerCase().includes(q) || user.role.toLowerCase().includes(q);
        const matchDept = user.departmentName?.toLowerCase().includes(q) || false;
        const matchDesc = user.description?.toLowerCase().includes(q) || false;
        const matchFacility = user.facilityName.toLowerCase().includes(q);
        return matchName || matchRole || matchDept || matchDesc || matchFacility;
      }

      return true;
    });
  }, [categoryFilter, searchQuery]);

  const handleSelectDemoUser = (user: DemoUser) => {
    setCurrentUser(user);
    if (user.facilityId && DEMO_FACILITY_REGISTRY[user.facilityId]) {
      setCurrentFacility(DEMO_FACILITY_REGISTRY[user.facilityId]);
    }
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    const isProd = authMode === 'production';
    if (isProd) {
      try {
        const adapter = getAuthAdapter();
        await adapter.signIn({ email: email.trim(), password });
        if (onSuccess) {
          onSuccess();
        }
      } catch (err: any) {
        setAuthError(err?.message || 'Production authentication failed. Privileged access denied.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setTimeout(() => {
      setIsSubmitting(false);
      const matched = CANONICAL_DEMO_USERS.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );

      if (matched) {
        handleSelectDemoUser(matched);
      } else {
        setAuthError('Invalid credentials. In development mode, please select an account from the Demo Accounts directory below.');
      }
    }, 250);
  };

  const getRoleBadgeStyle = (role: RoleType) => {
    switch (role) {
      case 'physician':
        return 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300';
      case 'clinical_supervisor':
        return 'bg-teal-950/80 border-teal-700/60 text-teal-300';
      case 'health_officer':
        return 'bg-cyan-950/80 border-cyan-700/60 text-cyan-300';
      case 'nurse':
        return 'bg-sky-950/80 border-sky-700/60 text-sky-300';
      case 'pharmacist':
        return 'bg-purple-950/80 border-purple-700/60 text-purple-300';
      case 'laboratory_staff':
        return 'bg-amber-950/80 border-amber-700/60 text-amber-300';
      case 'radiology_staff':
        return 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300';
      case 'system_administrator':
        return 'bg-rose-950/80 border-rose-700/60 text-rose-300';
      case 'facility_administrator':
        return 'bg-orange-950/80 border-orange-700/60 text-orange-300';
      case 'receptionist':
        return 'bg-blue-950/80 border-blue-700/60 text-blue-300';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  const getRoleIcon = (role: RoleType) => {
    switch (role) {
      case 'physician':
      case 'health_officer':
        return Stethoscope;
      case 'clinical_supervisor':
        return ClipboardCheck;
      case 'nurse':
        return HeartPulse;
      case 'pharmacist':
        return Pill;
      case 'laboratory_staff':
        return FlaskConical;
      case 'radiology_staff':
        return Radio;
      case 'receptionist':
        return UserCheck;
      case 'system_administrator':
      case 'facility_administrator':
        return Layers;
      default:
        return Shield;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-4 sm:p-6 lg:p-8">
      {/* Brand Header */}
      <div className="w-full max-w-6xl flex flex-col items-center text-center mt-4 mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center font-bold text-white shadow-lg shadow-teal-900/30">
            <Activity className="w-7 h-7 text-white" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
                Jano Health
              </h1>
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-teal-900/70 text-teal-300 border border-teal-700/60">
                EHR Foundation
              </span>
            </div>
            <p className="text-xs text-slate-400">Offline-First Clinical Decision Support & Health Information System</p>
          </div>
        </div>

        {/* Environment Banner */}
        {authMode === 'production' ? (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold uppercase tracking-wider font-mono">Production Environment (Firebase Auth Fail-Closed)</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">Strict Cryptographic ID Token Verification Enforced</span>
          </div>
        ) : (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold uppercase tracking-wider font-mono">Development & Multi-Role Demo Environment</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">10 Realistic Synthetic Clinical Identities Configured</span>
          </div>
        )}
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Standard Credentials Login (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-400" />
              Standard Clinician Login
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Sign in with your clinical credentials or test against existing accounts.
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleStandardSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Clinician Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="clinician@janohealth.org"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Access Passcode / Key</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 shadow-md transition-colors disabled:opacity-60 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {isSubmitting ? 'Authenticating...' : 'Sign In to Clinical Workstation'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              <span>Security & Audit Boundary</span>
            </div>
            <p className="leading-relaxed">
              Every authenticated clinical session is bound to an immutable local event ledger. Role capabilities and facility boundaries are strictly enforced.
            </p>
          </div>
        </div>

        {/* Right Column: Development / Demo Accounts Directory (8 Cols) */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Development / Demo Accounts
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Click any synthetic healthcare identity to authenticate and test role-specific workflows instantly.
              </p>
            </div>

            {/* Role Category Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs overflow-x-auto">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'all' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({CANONICAL_DEMO_USERS.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('clinical')}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'clinical' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Clinical (3)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('nursing')}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'nursing' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Nursing (1)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('diagnostic')}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'diagnostic' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Diagnostic & Rx (3)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('administrative')}
                className={`px-2.5 py-1 rounded font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  categoryFilter === 'administrative' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Admin & Ops (3)
              </button>
            </div>
          </div>

          {/* Search Filter */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search synthetic users by name, clinical role, specialization, or facility..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
            />
          </div>

          {/* Demo User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[560px] overflow-y-auto pr-1 scrollbar-thin">
            {filteredUsers.map((user) => {
              const RoleIcon = getRoleIcon(user.role);
              const roleTitle = ROLE_DEFINITIONS[user.role]?.title || user.role;
              const badgeStyle = getRoleBadgeStyle(user.role);

              return (
                <div
                  key={user.id}
                  className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-teal-500/50 transition-all flex flex-col justify-between group"
                >
                  <div className="space-y-2">
                    {/* Header: Name and Role Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">
                          {user.fullName}
                        </h3>
                        <p className="text-[11px] text-slate-400">{user.email}</p>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase shrink-0 ${badgeStyle}`}>
                        {user.role}
                      </span>
                    </div>

                    {/* Department & Specialization */}
                    <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                      <RoleIcon className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      <span className="font-medium text-slate-200">{roleTitle}</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 truncate">{user.specialization}</span>
                    </div>

                    {/* Primary Facility */}
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{user.facilityName}</span>
                    </div>

                    {/* Profile Summary */}
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed pt-1 border-t border-slate-800/80">
                      {user.profileSummary}
                    </p>

                    {/* Key Responsibilities / Permissions Tags */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {user.keyResponsibilities.slice(0, 3).map((resp, i) => (
                        <span
                          key={i}
                          className="text-[9px] bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded font-mono border border-slate-700/60"
                        >
                          {resp}
                        </span>
                      ))}
                      {user.keyResponsibilities.length > 3 && (
                        <span className="text-[9px] text-slate-500 px-1 py-0.5 font-mono">
                          +{user.keyResponsibilities.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Authenticate Button */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">ID: {user.id}</span>
                    {authMode === 'production' ? (
                      <span className="text-[10px] text-amber-400 font-mono">Demo login disabled in production</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSelectDemoUser(user)}
                        className="bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 hover:border-teal-500 text-xs font-semibold px-3 py-1 rounded transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <span>Login as {user.fullName.split(' ')[0]}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredUsers.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No demo accounts match your filter criteria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
