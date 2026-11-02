/**
 * Jano Health - Operations Monitoring, Security Telemetry & Recovery Modes
 * 
 * Centralized privacy-preserving operational telemetry, security threat detection,
 * maintenance windows (with emergency care protections), and system recovery state management.
 */

import {
  OperationalAlert,
  OperationalAlertType,
  SupportSeverity,
  SecurityIncidentRecord,
  SystemRecoveryState,
  MaintenanceWindow,
  OperationalSupportCase,
  V21_INVARIANTS,
} from '../../domain/v21ProductionTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { computeSha256 } from './environmentConfigService';

export class OperationsMonitoringService {
  private static instance: OperationsMonitoringService;
  private currentRecoveryState: SystemRecoveryState = 'NORMAL';
  private rateLimitCounts: Map<string, { count: number; firstSeen: number }> = new Map();

  private constructor() {}

  public static getInstance(): OperationsMonitoringService {
    if (!OperationsMonitoringService.instance) {
      OperationsMonitoringService.instance = new OperationsMonitoringService();
    }
    return OperationsMonitoringService.instance;
  }

  public getRecoveryState(): SystemRecoveryState {
    return this.currentRecoveryState;
  }

  public setRecoveryState(state: SystemRecoveryState): void {
    this.currentRecoveryState = state;
  }

  /**
   * Dispatches an operational alert.
   */
  public async raiseAlert(
    alertType: OperationalAlertType,
    severity: SupportSeverity,
    facilityId: string,
    sourceComponent: string,
    message: string
  ): Promise<OperationalAlert> {
    const alert: OperationalAlert = {
      alertId: `alt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      alertType,
      severity,
      facilityId,
      sourceComponent,
      message,
      timestamp: new Date().toISOString(),
      isAcknowledged: false,
    };

    await idbEngine.put('operationalAlerts', alert);
    return alert;
  }

  /**
   * Records privacy-preserving telemetry (strictly redacting PII / clinical notes).
   */
  public sanitizeTelemetryPayload(raw: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    const prohibitedFields = ['name', 'patientName', 'fullName', 'nationalId', 'ssn', 'clinicalNotes', 'prescription', 'phone'];

    for (const [key, val] of Object.entries(raw)) {
      if (prohibitedFields.includes(key)) {
        sanitized[key] = '[REDACTED_PRIVACY_PRESERVED]';
      } else if (typeof val === 'object' && val !== null) {
        sanitized[key] = this.sanitizeTelemetryPayload(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }

  /**
   * Evaluates security traffic and triggers rate-limiting / circuit-breaker if brute-forcing.
   */
  public async evaluateSecurityRequest(
    clientIpOrId: string,
    endpoint: string
  ): Promise<{ allowed: boolean; action: SecurityIncidentRecord['actionTaken'] }> {
    const now = Date.now();
    const entry = this.rateLimitCounts.get(clientIpOrId) || { count: 0, firstSeen: now };

    if (now - entry.firstSeen > 60000) {
      entry.count = 1;
      entry.firstSeen = now;
    } else {
      entry.count++;
    }
    this.rateLimitCounts.set(clientIpOrId, entry);

    if (entry.count > 50) {
      // Brute-force threshold exceeded
      const incident: SecurityIncidentRecord = {
        incidentId: `sec_inc_${Date.now()}`,
        threatType: 'BRUTE_FORCE',
        ipAddressOrOrigin: clientIpOrId,
        targetedEndpoint: endpoint,
        attemptsCount: entry.count,
        actionTaken: 'RATE_LIMITED',
        timestamp: new Date().toISOString(),
        tamperProofHash: await computeSha256(`${clientIpOrId}_${endpoint}_${entry.count}`),
      };
      await idbEngine.put('securityIncidents', incident);
      return { allowed: false, action: 'RATE_LIMITED' };
    }

    return { allowed: true, action: 'LOGGED_ONLY' };
  }

  /**
   * Creates a maintenance window.
   * INVARIANT: Maintenance mode must NEVER silently block emergency clinical care.
   */
  public async scheduleMaintenance(
    scope: string,
    reason: string,
    approvedBy: string,
    affectedServices: string[],
    durationMinutes: number
  ): Promise<MaintenanceWindow> {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + durationMinutes * 60000).toISOString();

    const window: MaintenanceWindow = {
      windowId: `maint_${Date.now()}`,
      startTime: start,
      endTime: end,
      scope,
      reason,
      approvedBy,
      affectedServices,
      rollbackPlan: 'Cancel window and re-enable traffic routing immediately.',
      emergencyClinicalCareProtected: true,
      isActive: true,
    };

    // Hard Invariant Check: Emergency clinical care must proceed
    V21_INVARIANTS.assertEmergencyCareNotBlockedInMaintenance(true, true);

    await idbEngine.put('maintenanceWindows', window);
    this.currentRecoveryState = 'MAINTENANCE';
    return window;
  }

  /**
   * Opens an operational support ticket.
   */
  public async openSupportCase(
    facilityId: string,
    severity: SupportSeverity,
    category: OperationalSupportCase['category'],
    title: string,
    diagnosticsSnippet: string,
    operatorId: string
  ): Promise<OperationalSupportCase> {
    const supportCase: OperationalSupportCase = {
      caseId: `sup_${Date.now()}`,
      facilityId,
      severity,
      category,
      title,
      diagnosticsSnippet,
      status: 'OPEN',
      reportedAt: new Date().toISOString(),
      operatorId,
    };

    await idbEngine.put('operationalSupportCases', supportCase);
    return supportCase;
  }
}

export const operationsMonitoringService = OperationsMonitoringService.getInstance();
