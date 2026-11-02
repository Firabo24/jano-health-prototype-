/**
 * Jano Health - Network Exchange Policy Engine
 * Clinical Core V13: Deny-by-Default Policy Authorization for Multi-Facility Exchange
 */

import {
  NetworkExchangePolicy,
  ExchangeResourceType,
} from '../../domain/types';
import {
  PolicyEvaluationContext,
  PolicyEvaluationResult,
} from './types';
import { sha256 } from '../../domain/eventIntegrity';
import { janoNodeRegistryService } from './nodeRegistry';
import { idbEngine } from '../storage/indexedDbEngine';

export class NetworkExchangePolicyEngine {
  private static instance: NetworkExchangePolicyEngine;
  private policies: Map<string, NetworkExchangePolicy> = new Map();
  private rateLimitWindow: Map<string, { count: number; windowStart: number }> = new Map();

  private constructor() {
    this.seedDefaultPolicies();
  }

  public static getInstance(): NetworkExchangePolicyEngine {
    if (!NetworkExchangePolicyEngine.instance) {
      NetworkExchangePolicyEngine.instance = new NetworkExchangePolicyEngine();
    }
    return NetworkExchangePolicyEngine.instance;
  }

  private seedDefaultPolicies(): void {
    const defaultPolicies: NetworkExchangePolicy[] = [
      // 1. District Closed-Loop Referral Policy
      {
        policyId: 'pol-district-referrals-v1',
        name: 'District Cross-Facility Closed-Loop Referrals',
        sourceNodeId: '*',
        destinationNodeId: '*',
        sourceFacilityId: '*',
        destinationFacilityId: '*',
        purpose: 'REFERRAL',
        resourceTypes: ['Referral', 'Patient', 'DocumentReference'],
        direction: 'BIDIRECTIONAL',
        operations: ['CREATE', 'UPDATE', 'NOTIFY', 'READ'],
        priority: 'ROUTINE',
        maxPayloadSizeBytes: 5 * 1024 * 1024, // 5MB
        rateLimitPerMinute: 60,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2030-01-01T00:00:00Z',
        offlineQueueAllowed: true,
        ackRequired: true,
        quarantineOnAmbiguity: true,
        isActive: true,
        version: 1,
        integrityHash: sha256('pol-district-referrals-v1|REFERRAL|ACTIVE'),
      },
      // 2. High-Acuity Emergency Transfer Policy
      {
        policyId: 'pol-emergency-transfers-v1',
        name: 'High-Acuity Emergency Transfer & Resuscitation Handover',
        sourceNodeId: '*',
        destinationNodeId: '*',
        sourceFacilityId: '*',
        destinationFacilityId: '*',
        purpose: 'EMERGENCY',
        resourceTypes: ['EmergencyTransfer', 'Patient', 'Observation', 'Condition', 'Medication'],
        direction: 'BIDIRECTIONAL',
        operations: ['CREATE', 'UPDATE', 'NOTIFY'],
        priority: 'EMERGENCY',
        maxPayloadSizeBytes: 10 * 1024 * 1024, // 10MB
        rateLimitPerMinute: 120,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2030-01-01T00:00:00Z',
        offlineQueueAllowed: true,
        ackRequired: true,
        quarantineOnAmbiguity: true,
        isActive: true,
        version: 1,
        integrityHash: sha256('pol-emergency-transfers-v1|EMERGENCY|ACTIVE'),
      },
      // 3. Diagnostic & Laboratory Exchange Policy
      {
        policyId: 'pol-diagnostic-lab-v1',
        name: 'Inter-Facility Laboratory Order & Diagnostic Result Exchange',
        sourceNodeId: '*',
        destinationNodeId: '*',
        sourceFacilityId: '*',
        destinationFacilityId: '*',
        purpose: 'DIAGNOSTIC_REPORT',
        resourceTypes: ['ServiceRequest', 'Specimen', 'Observation', 'DiagnosticReport'],
        direction: 'BIDIRECTIONAL',
        operations: ['CREATE', 'UPDATE', 'READ'],
        priority: 'ROUTINE',
        maxPayloadSizeBytes: 8 * 1024 * 1024,
        rateLimitPerMinute: 80,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2030-01-01T00:00:00Z',
        offlineQueueAllowed: true,
        ackRequired: true,
        quarantineOnAmbiguity: true,
        isActive: true,
        version: 1,
        integrityHash: sha256('pol-diagnostic-lab-v1|DIAGNOSTIC_REPORT|ACTIVE'),
      },
      // 4. Radiology Study & Reporting Policy
      {
        policyId: 'pol-radiology-exchange-v1',
        name: 'Inter-Facility Radiology Consultation & Report Tele-Radiology',
        sourceNodeId: '*',
        destinationNodeId: '*',
        sourceFacilityId: '*',
        destinationFacilityId: '*',
        purpose: 'DIAGNOSTIC_REPORT',
        resourceTypes: ['ImagingStudy', 'DiagnosticReport', 'ServiceRequest'],
        direction: 'BIDIRECTIONAL',
        operations: ['CREATE', 'UPDATE', 'READ'],
        priority: 'ROUTINE',
        maxPayloadSizeBytes: 20 * 1024 * 1024,
        rateLimitPerMinute: 30,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2030-01-01T00:00:00Z',
        offlineQueueAllowed: true,
        ackRequired: true,
        quarantineOnAmbiguity: true,
        isActive: true,
        version: 1,
        integrityHash: sha256('pol-radiology-exchange-v1|RADIOLOGY|ACTIVE'),
      },
      // 5. Longitudinal Medication History Exchange Policy
      {
        policyId: 'pol-medication-history-v1',
        name: 'Authorized Clinical Medication History & Safety Reconciliation',
        sourceNodeId: '*',
        destinationNodeId: '*',
        sourceFacilityId: '*',
        destinationFacilityId: '*',
        purpose: 'TREATMENT',
        resourceTypes: ['Medication', 'MedicationRequest', 'MedicationDispense'],
        direction: 'BIDIRECTIONAL',
        operations: ['READ', 'QUERY', 'NOTIFY'],
        priority: 'ROUTINE',
        maxPayloadSizeBytes: 3 * 1024 * 1024,
        rateLimitPerMinute: 50,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2030-01-01T00:00:00Z',
        offlineQueueAllowed: true,
        ackRequired: true,
        quarantineOnAmbiguity: true,
        isActive: true,
        version: 1,
        integrityHash: sha256('pol-medication-history-v1|TREATMENT|ACTIVE'),
      },
    ];

    defaultPolicies.forEach((p) => this.policies.set(p.policyId, p));
  }

  public evaluatePolicy(context: PolicyEvaluationContext): PolicyEvaluationResult {
    // 1. Evaluate Source Node Trust
    const sourceNode = janoNodeRegistryService.getNode(context.sourceNodeId);
    if (!sourceNode) {
      return {
        allowed: false,
        reason: `SOURCE_NODE_UNKNOWN: Source node '${context.sourceNodeId}' is not registered in the network directory.`,
      };
    }
    if (sourceNode.trustStatus !== 'TRUSTED') {
      return {
        allowed: false,
        reason: `SOURCE_TRUST_FAILURE: Source node '${context.sourceNodeId}' trust status is '${sourceNode.trustStatus}'. Exchanges are prohibited.`,
      };
    }

    // 2. Evaluate Destination Node Trust
    const destNode = janoNodeRegistryService.getNode(context.destinationNodeId);
    if (!destNode) {
      return {
        allowed: false,
        reason: `DESTINATION_NODE_UNKNOWN: Destination node '${context.destinationNodeId}' is not registered in the network directory.`,
      };
    }
    if (destNode.trustStatus !== 'TRUSTED') {
      return {
        allowed: false,
        reason: `DESTINATION_TRUST_FAILURE: Destination node '${context.destinationNodeId}' trust status is '${destNode.trustStatus}'. Exchanges are prohibited.`,
      };
    }

    // 3. Search Active Matching Policy (Deny-by-default)
    const now = new Date().toISOString();
    const activePolicies = Array.from(this.policies.values()).filter((p) => p.isActive);

    const matchingPolicy = activePolicies.find((p) => {
      // Time validity
      if (p.validFrom > now || p.validTo < now) return false;

      // Source Node
      if (p.sourceNodeId !== '*' && p.sourceNodeId !== context.sourceNodeId) return false;

      // Destination Node
      if (p.destinationNodeId !== '*' && p.destinationNodeId !== context.destinationNodeId) return false;

      // Source Facility
      if (p.sourceFacilityId !== '*' && p.sourceFacilityId !== context.sourceFacilityId) return false;

      // Destination Facility
      if (p.destinationFacilityId !== '*' && p.destinationFacilityId !== context.destinationFacilityId) return false;

      // Purpose
      if (p.purpose !== context.purpose) return false;

      // Resource Type
      if (!p.resourceTypes.includes(context.resourceType)) return false;

      // Direction
      if (p.direction !== 'BIDIRECTIONAL') {
        if (context.direction !== p.direction) return false;
      }

      // Operation
      if (!p.operations.includes(context.operation)) return false;

      return true;
    });

    if (!matchingPolicy) {
      return {
        allowed: false,
        reason: `POLICY_DENIAL_BY_DEFAULT: No active exchange policy authorizes ${context.direction} ${context.operation} of '${context.resourceType}' for purpose '${context.purpose}' between nodes '${context.sourceNodeId}' and '${context.destinationNodeId}'.`,
      };
    }

    // 4. Payload size check
    if (context.payloadSizeBytes > matchingPolicy.maxPayloadSizeBytes) {
      return {
        allowed: false,
        matchedPolicyId: matchingPolicy.policyId,
        reason: `PAYLOAD_SIZE_EXCEEDED: Payload of ${context.payloadSizeBytes} bytes exceeds policy limit of ${matchingPolicy.maxPayloadSizeBytes} bytes.`,
      };
    }

    // 5. Rate limiting check
    const rateLimitKey = `${context.sourceNodeId}:${matchingPolicy.policyId}`;
    const windowStart = Math.floor(Date.now() / 60000) * 60000;
    const currentRate = this.rateLimitWindow.get(rateLimitKey);

    if (!currentRate || currentRate.windowStart !== windowStart) {
      this.rateLimitWindow.set(rateLimitKey, { count: 1, windowStart });
    } else {
      if (currentRate.count >= matchingPolicy.rateLimitPerMinute) {
        return {
          allowed: false,
          matchedPolicyId: matchingPolicy.policyId,
          rateLimitExceeded: true,
          reason: `RATE_LIMIT_EXCEEDED: Source node '${context.sourceNodeId}' exceeded policy rate limit (${matchingPolicy.rateLimitPerMinute} msgs/min).`,
        };
      }
      currentRate.count += 1;
    }

    return {
      allowed: true,
      matchedPolicyId: matchingPolicy.policyId,
      requiresQuarantineOnAmbiguity: matchingPolicy.quarantineOnAmbiguity,
    };
  }

  public async createPolicy(policy: Omit<NetworkExchangePolicy, 'version' | 'integrityHash'>): Promise<NetworkExchangePolicy> {
    const fullPolicy: NetworkExchangePolicy = {
      ...policy,
      version: 1,
      integrityHash: sha256(`${policy.policyId}|${policy.name}|${policy.purpose}|${policy.validFrom}`),
    };
    this.policies.set(fullPolicy.policyId, fullPolicy);
    try {
      await idbEngine.put('networkPolicies', fullPolicy);
    } catch {
      // Memory fallback
    }
    return fullPolicy;
  }

  public async updatePolicy(policyId: string, updates: Partial<NetworkExchangePolicy>): Promise<NetworkExchangePolicy> {
    const existing = this.policies.get(policyId);
    if (!existing) {
      throw new Error(`POLICY_NOT_FOUND: Exchange policy '${policyId}' not found.`);
    }

    const updated: NetworkExchangePolicy = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      integrityHash: sha256(`${policyId}|${updates.name || existing.name}|${existing.version + 1}`),
    };
    this.policies.set(policyId, updated);
    try {
      await idbEngine.put('networkPolicies', updated);
    } catch {
      // Memory fallback
    }
    return updated;
  }

  public listPolicies(): NetworkExchangePolicy[] {
    return Array.from(this.policies.values());
  }

  public getPolicy(policyId: string): NetworkExchangePolicy | undefined {
    return this.policies.get(policyId);
  }

  public resetToSyntheticDemo(): void {
    this.policies.clear();
    this.rateLimitWindow.clear();
    this.seedDefaultPolicies();
  }
}

export const networkExchangePolicyEngine = NetworkExchangePolicyEngine.getInstance();
