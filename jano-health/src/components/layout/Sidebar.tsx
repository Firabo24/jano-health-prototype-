/**
 * Jano Health - Sidebar Navigation Component
 * Structured clinical navigation shell supporting high-density EHR workflows.
 */

import React from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  ClipboardList,
  Cpu,
  FileCheck2,
  FileText,
  FlaskConical,
  HeartPulse,
  History,
  LayoutDashboard,
  Layers,
  Pill,
  Radio,
  RefreshCw,
  SendHorizontal,
  Settings,
  ShieldAlert,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';

export type ActiveNavTab =
  | 'dashboard'
  | 'patients'
  | 'encounters'
  | 'appointments'
  | 'clinical'
  | 'laboratory'
  | 'radiology'
  | 'pharmacy'
  | 'referrals'
  | 'emergency'
  | 'ai_assistant'
  | 'synchronization'
  | 'reports'
  | 'administration'
  | 'audit_log'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  emergencyCount?: number;
  pendingSyncCount?: number;
}

interface NavItem {
  id: ActiveNavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
  requiredCapabilities?: (string)[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  emergencyCount = 2,
  pendingSyncCount = 0,
}) => {
  const { currentUser, can } = useAuth();

  const groups: NavGroup[] = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      ],
    },
    {
      title: 'CLINICAL CARE',
      items: [
        { id: 'patients', label: 'Patients', icon: Users, requiredCapabilities: ['patient.read'] },
        { id: 'encounters', label: 'Encounters', icon: ClipboardList, requiredCapabilities: ['encounter.read'] },
        { id: 'appointments', label: 'Appointments', icon: Calendar, requiredCapabilities: ['appointments.manage'] },
        { id: 'clinical', label: 'Clinical Workspace', icon: Stethoscope, requiredCapabilities: ['encounter.write', 'vitals.write', 'clinical:notes_write', 'clinical:diagnose'] },
      ],
    },
    {
      title: 'DIAGNOSTICS & RX',
      items: [
        { id: 'laboratory', label: 'Laboratory', icon: FlaskConical, requiredCapabilities: ['laboratory.order', 'laboratory.result.write'] },
        { id: 'radiology', label: 'Radiology', icon: Radio, requiredCapabilities: ['radiology.order', 'radiology.result.write'] },
        { id: 'pharmacy', label: 'Pharmacy', icon: Pill, requiredCapabilities: ['medication.dispense', 'medication.prescribe'] },
      ],
    },
    {
      title: 'ACUTE & TRANSFERS',
      items: [
        {
          id: 'emergency',
          label: 'Emergency / Triage',
          icon: ShieldAlert,
          badge: emergencyCount > 0 ? emergencyCount : undefined,
          badgeColor: 'bg-red-500 text-white',
          requiredCapabilities: ['emergency.manage'],
        },
        { id: 'referrals', label: 'Referrals', icon: SendHorizontal, requiredCapabilities: ['referral.create'] },
      ],
    },
    {
      title: 'INTELLIGENCE & DATA',
      items: [
        {
          id: 'ai_assistant',
          label: 'Jano AI Assistant',
          icon: Cpu,
          badge: 'CDS',
          badgeColor: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
          requiredCapabilities: ['ai.use'],
        },
        {
          id: 'synchronization',
          label: 'Synchronization',
          icon: RefreshCw,
          badge: pendingSyncCount > 0 ? `${pendingSyncCount}` : undefined,
          badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
        },
      ],
    },
    {
      title: 'GOVERNANCE & AUDIT',
      items: [
        { id: 'reports', label: 'Reports & Stats', icon: BarChart3 },
        { id: 'administration', label: 'Administration', icon: Layers, requiredCapabilities: ['users.manage', 'facility.manage'] },
        { id: 'audit_log', label: 'Audit Log', icon: History, requiredCapabilities: ['audit.read'] },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  // Dynamically filter items by current user capabilities
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.requiredCapabilities || item.requiredCapabilities.length === 0) {
          return true;
        }
        return item.requiredCapabilities.some((cap) => can(cap));
      }),
    }))
    .filter((group) => group.items.length > 0);

  // If activeTab is forbidden for the current role, automatically fall back to dashboard
  React.useEffect(() => {
    const isAllowed = filteredGroups.some((g) => g.items.some((i) => i.id === activeTab));
    if (!isAllowed && activeTab !== 'dashboard') {
      onTabChange('dashboard');
    }
  }, [currentUser.role, activeTab, filteredGroups, onTabChange]);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none">
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4 text-slate-300 scrollbar-thin">
        {filteredGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <h3 className="text-[10px] font-semibold text-slate-400 px-3 tracking-wider font-mono">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all group ${
                      isActive
                        ? 'bg-teal-600/20 text-teal-300 font-semibold border-l-2 border-teal-500 pl-2.5'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                          item.badgeColor || 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer System Status Banner */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400 space-y-1 font-mono">
        <div className="flex items-center justify-between">
          <span>Security Ledger</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            ACTIVE
          </span>
        </div>
        <p className="text-[10px] text-slate-400">Node: District-Mesh v1.0</p>
      </div>
    </aside>
  );
};
