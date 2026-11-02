/**
 * Jano Health - Jano Operations Center (Clinical Core V21)
 * 
 * Centralized production operations dashboard covering Platform Health,
 * Clinical Availability, Backup & Restore Verification, Disaster Recovery Drills,
 * Data Integrity Monitoring, Security Telemetry, Maintenance Windows, and Pilot Sites.
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Server,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Archive,
  Download,
  Activity,
  HardDrive,
  Users,
  Clock,
  Key,
  Layers,
  FileCheck,
} from 'lucide-react';
import {
  environmentConfigService,
  backupManager,
  restoreManager,
  disasterRecoveryService,
  dataIntegrityMonitorService,
  operationsMonitoringService,
  releaseManagementService,
} from '../../services/production';
import {
  DeploymentEnvironment,
  BackupArchive,
  DataIntegrityAudit,
  DisasterRecoveryPlan,
  MaintenanceWindow,
} from '../../domain/v21ProductionTypes';

export const ProductionOperationsCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'backups' | 'disaster' | 'integrity' | 'pilots' | 'maintenance'>('overview');
  const [environment, setEnvironment] = useState<DeploymentEnvironment>('PRODUCTION');
  const [lastBackup, setLastBackup] = useState<BackupArchive | null>(null);
  const [integrityAudit, setIntegrityAudit] = useState<DataIntegrityAudit | null>(null);
  const [drPlans, setDrPlans] = useState<DisasterRecoveryPlan[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setEnvironment(environmentConfigService.getEnvironment());
      const plans = await disasterRecoveryService.initializeBaselinePlans();
      setDrPlans(plans);
    } catch (e: any) {
      console.error('Error loading operations center:', e);
    }
  };

  const handleCreateBackup = async () => {
    setIsProcessing(true);
    setStatusMessage('Generating cryptographic SHA-256 backup across all 281 stores...');
    try {
      const bkp = await backupManager.createBackup(environment, 'GLOBAL', 'FULL', true);
      setLastBackup(bkp);
      setStatusMessage(`Backup ${bkp.backupId} successfully created and verified (${bkp.totalRecords} records).`);
    } catch (err: any) {
      setStatusMessage(`Backup failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyBackup = async () => {
    if (!lastBackup) return;
    setIsProcessing(true);
    setStatusMessage(`Verifying cryptographic checksum for ${lastBackup.backupId}...`);
    try {
      const result = await backupManager.verifyBackupIntegrity(lastBackup.backupId);
      setStatusMessage(`Backup verification: ${result.status} (${result.notes})`);
    } catch (err: any) {
      setStatusMessage(`Verification failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDryRunRestore = async () => {
    if (!lastBackup) return;
    setIsProcessing(true);
    setStatusMessage(`Executing dry-run restore simulation for ${lastBackup.backupId}...`);
    try {
      const result = await restoreManager.executeDryRun(lastBackup.backupId, environment, 'FACILITY_DEFAULT');
      setStatusMessage(`Dry-run restore: ${result.status} - ${result.validationResult?.details.join(' ')}`);
    } catch (err: any) {
      setStatusMessage(`Dry-run failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunIntegrityAudit = async () => {
    setIsProcessing(true);
    setStatusMessage('Scanning all stores for broken event chains, duplicate IDs, and orphans...');
    try {
      const audit = await dataIntegrityMonitorService.runIntegrityAudit();
      setIntegrityAudit(audit);
      setStatusMessage(`Data integrity audit complete: ${audit.status} (${audit.anomaliesFound} anomalies).`);
    } catch (err: any) {
      setStatusMessage(`Integrity audit failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateDiagnostics = async () => {
    setIsProcessing(true);
    setStatusMessage('Compiling privacy-preserving diagnostic bundle (zero PII)...');
    try {
      const bundle = await releaseManagementService.generateDiagnosticBundle('FACILITY_DEFAULT');
      setStatusMessage(`Diagnostic bundle ${bundle.bundleId} generated with audit hash ${bundle.auditHash.slice(0, 12)}...`);
    } catch (err: any) {
      setStatusMessage(`Diagnostics failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <Shield className="w-7 h-7 text-emerald-400" />
            <h2 className="text-xl font-bold tracking-tight text-white">Jano Operations Center</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
              V21 PILOT READY
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Production Hardening, Deployment Governance, Disaster Recovery & Operational Resilience
          </p>
        </div>

        {/* Environment Badge & Fail-Closed Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
            <Server className="w-4 h-4 text-sky-400" />
            <span className="text-slate-400">Environment:</span>
            <span className="font-bold text-white">{environment}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300">
            <Lock className="w-3.5 h-3.5" />
            <span>FAIL-CLOSED ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(
          [
            { id: 'overview', label: 'Platform Health', icon: Activity },
            { id: 'backups', label: 'Backup & Restore', icon: Archive },
            { id: 'disaster', label: 'Disaster Recovery (RPO/RTO)', icon: HardDrive },
            { id: 'integrity', label: 'Data Integrity Audit', icon: FileCheck },
            { id: 'pilots', label: 'Pilot Facilities', icon: Users },
            { id: 'maintenance', label: 'Maintenance Window', icon: Clock },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg text-xs text-slate-200 flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tab: Overview / Platform Health */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">IndexedDB Stores</div>
              <div className="text-2xl font-bold text-white mt-1">281 Stores</div>
              <div className="text-xs text-emerald-400 mt-1">✓ V1–V21 Schema Online</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">Clinical Availability</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">100% Offline Capable</div>
              <div className="text-xs text-slate-400 mt-1">Autonomous care preserved</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">External Interoperability</div>
              <div className="text-2xl font-bold text-sky-400 mt-1">FHIR R5 Gateway</div>
              <div className="text-xs text-slate-400 mt-1">Durable queue fail-closed</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/60 p-4 rounded-lg">
              <div className="text-xs text-slate-400 font-medium">Governed Automation</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">LEVEL 0–3 Active</div>
              <div className="text-xs text-red-400 mt-1">LEVEL 4 Clinical Mutations Blocked</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={handleGenerateDiagnostics}
              disabled={isProcessing}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" />
              Generate Diagnostic Bundle (Zero PII)
            </button>
            <button
              onClick={handleRunIntegrityAudit}
              disabled={isProcessing}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-2"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Run Data Integrity Scan
            </button>
          </div>
        </div>
      )}

      {/* Tab: Backup & Restore */}
      {activeTab === 'backups' && (
        <div className="space-y-4">
          <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-white text-sm">Cryptographic Backup & Safe Restore</h4>
                <p className="text-xs text-slate-400">
                  SHA-256 sealed archives across 281 stores with mandatory dry-run validation.
                </p>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold flex items-center gap-2"
              >
                <Archive className="w-3.5 h-3.5" />
                Create New Backup
              </button>
            </div>

            {lastBackup ? (
              <div className="bg-slate-900/80 p-3 rounded border border-slate-700/80 text-xs space-y-1.5 font-mono">
                <div className="text-emerald-400 font-bold">Latest Archive: {lastBackup.backupId}</div>
                <div className="text-slate-300">Timestamp: {lastBackup.timestamp}</div>
                <div className="text-slate-300">Total Records: {lastBackup.totalRecords} across {Object.keys(lastBackup.recordCounts).length} stores</div>
                <div className="text-slate-400 truncate">SHA-256 Checksum: {lastBackup.checksum}</div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleVerifyBackup}
                    disabled={isProcessing}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 border border-slate-600"
                  >
                    Verify Checksum
                  </button>
                  <button
                    onClick={handleDryRunRestore}
                    disabled={isProcessing}
                    className="px-2.5 py-1 bg-amber-900/60 hover:bg-amber-800/80 rounded text-amber-200 border border-amber-700"
                  >
                    Execute Dry-Run Restore
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No backup created in this active session yet.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Disaster Recovery */}
      {activeTab === 'disaster' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            Pre-configured disaster recovery playbooks with defined RPO (Recovery Point Objective) and RTO (Recovery Time Objective).
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {drPlans.map((plan) => (
              <div key={plan.planId} className="bg-slate-800/40 border border-slate-700/60 p-3.5 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{plan.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    plan.testStatus === 'PASSED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {plan.testStatus || 'UNTESTED'}
                  </span>
                </div>
                <div className="flex gap-4 text-slate-400">
                  <span>RPO: {plan.rpoTargetMinutes !== 'NOT_DEFINED' ? `${plan.rpoTargetMinutes} min` : 'NOT_DEFINED'}</span>
                  <span>RTO: {plan.rtoTargetMinutes !== 'NOT_DEFINED' ? `${plan.rtoTargetMinutes} min` : 'NOT_DEFINED'}</span>
                </div>
                <div className="text-slate-400 italic text-[11px]">{plan.procedureSteps[0]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Data Integrity */}
      {activeTab === 'integrity' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Scans event chains, foreign keys, and duplicate identifiers. Authoritative clinical data is NEVER auto-repaired.
            </p>
            <button
              onClick={handleRunIntegrityAudit}
              disabled={isProcessing}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold"
            >
              Scan Now
            </button>
          </div>

          {integrityAudit ? (
            <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Status:</span>
                <span className={`px-2 py-0.5 rounded font-bold ${
                  integrityAudit.status === 'CLEAN' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
                }`}>
                  {integrityAudit.status}
                </span>
                <span className="text-slate-400 ml-auto">Records Checked: {integrityAudit.totalRecordsChecked}</span>
              </div>
              <div>Anomalies Found: {integrityAudit.anomaliesFound}</div>
              {integrityAudit.criticalAlertCreated && (
                <div className="p-2.5 bg-red-950/80 border border-red-800 rounded text-red-200">
                  ⚠️ CRITICAL_DATA_INTEGRITY_ALERT active. Authoritative data auto-repair strictly blocked.
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No integrity scan performed yet.</div>
          )}
        </div>
      )}

      {/* Tab: Pilots */}
      {activeTab === 'pilots' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Pilot health facility supervision, connectivity profiles, and synthetic data segregation.
          </div>
          <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Uvinza Health Centre (Pilot 01)</span>
              <span className="px-2 py-0.5 bg-sky-950 text-sky-300 border border-sky-800 rounded text-[10px] font-bold">
                ACTIVE_SUPERVISED
              </span>
            </div>
            <div className="text-slate-400">Connectivity: INTERMITTENT (Offline-first operational)</div>
            <div className="text-slate-400">Modules: Inpatient, Outpatient, Lab, Pharmacy, Inventory, Workforce</div>
            <div className="text-slate-400">Hardware Class: Low-Resource Thin Client</div>
          </div>
        </div>
      )}

      {/* Tab: Maintenance Window */}
      {activeTab === 'maintenance' && (
        <div className="space-y-3 text-xs">
          <div className="bg-slate-800/40 border border-slate-700/60 p-4 rounded-lg space-y-3">
            <h4 className="font-semibold text-white">Maintenance Mode Governance</h4>
            <p className="text-slate-400">
              Allows operational service upgrades while maintaining the invariant that emergency care is never blocked.
            </p>
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-emerald-200">INVARIANT ENFORCED:</span>
                <span className="text-emerald-300 ml-1">
                  Emergency triage, resuscitations, and urgent consultations remain fully operational locally during all maintenance windows.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
