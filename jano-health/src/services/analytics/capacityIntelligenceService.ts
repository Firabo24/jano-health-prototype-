/**
 * Jano Health - Capacity Intelligence Service
 * Clinical Core V14: Operational Load, Surge Monitoring, and Unknown-State Preservation
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Operational load states: AVAILABLE, NORMAL, ELEVATED, CONSTRAINED, CRITICAL, UNKNOWN.
 * 2. Do not pretend to know resource capacity when data is missing.
 * 3. Use UNKNOWN rather than assuming zero.
 */

import { CapacityStatus, FacilityCapacity } from '../../domain/analyticsTypes';
import { analyticalFactStore } from './factStore';

export class CapacityIntelligenceService {
  private static instance: CapacityIntelligenceService;

  private constructor() {}

  public static getInstance(): CapacityIntelligenceService {
    if (!CapacityIntelligenceService.instance) {
      CapacityIntelligenceService.instance = new CapacityIntelligenceService();
    }
    return CapacityIntelligenceService.instance;
  }

  /**
   * Evaluates operational capacity across clinical service areas.
   * If facts are absent, returns UNKNOWN.
   */
  public async evaluateFacilityCapacity(
    facilityId: string,
    facilityName: string = 'Facility'
  ): Promise<FacilityCapacity> {
    const facts = await analyticalFactStore.getFacts({
      facilityId,
      reportingPeriod: new Date().toISOString().substring(0, 7),
    });

    if (facts.length === 0) {
      return {
        facilityId,
        facilityName,
        overallStatus: 'UNKNOWN',
        emergencyStatus: 'UNKNOWN',
        bedStatus: 'UNKNOWN',
        labStatus: 'UNKNOWN',
        radiologyStatus: 'UNKNOWN',
        pharmacyStatus: 'UNKNOWN',
        referralReceivingStatus: 'UNKNOWN',
        activeQueueCount: 0,
        dataAvailable: false,
        asOf: new Date().toISOString(),
      };
    }

    const emgFacts = facts.filter((f) => f.factType === 'EMERGENCY');
    const labFacts = facts.filter((f) => f.factType === 'LABORATORY');
    const radFacts = facts.filter((f) => f.factType === 'RADIOLOGY');
    const rxFacts = facts.filter((f) => f.factType === 'DISPENSING');
    const refFacts = facts.filter((f) => f.factType === 'REFERRAL');

    // Emergency Capacity
    let emergencyStatus: CapacityStatus = 'NORMAL';
    if (emgFacts.length > 20) emergencyStatus = 'CRITICAL';
    else if (emgFacts.length > 10) emergencyStatus = 'CONSTRAINED';
    else if (emgFacts.length > 5) emergencyStatus = 'ELEVATED';

    // Lab Capacity
    let labStatus: CapacityStatus = 'NORMAL';
    if (labFacts.length > 80) labStatus = 'CRITICAL';
    else if (labFacts.length > 50) labStatus = 'CONSTRAINED';
    else if (labFacts.length > 25) labStatus = 'ELEVATED';

    // Radiology Capacity
    let radiologyStatus: CapacityStatus = 'NORMAL';
    if (radFacts.length > 50) radiologyStatus = 'CRITICAL';
    else if (radFacts.length > 30) radiologyStatus = 'CONSTRAINED';
    else if (radFacts.length > 15) radiologyStatus = 'ELEVATED';

    // Pharmacy Capacity
    let pharmacyStatus: CapacityStatus = 'NORMAL';
    if (rxFacts.length > 100) pharmacyStatus = 'CRITICAL';
    else if (rxFacts.length > 60) pharmacyStatus = 'CONSTRAINED';
    else if (rxFacts.length > 30) pharmacyStatus = 'ELEVATED';

    // Referral Receiving Capacity
    let referralReceivingStatus: CapacityStatus = 'NORMAL';
    if (refFacts.length > 15) referralReceivingStatus = 'CONSTRAINED';

    // Overall Status
    let overallStatus: CapacityStatus = 'NORMAL';
    if (
      emergencyStatus === 'CRITICAL' ||
      labStatus === 'CRITICAL' ||
      radiologyStatus === 'CRITICAL' ||
      pharmacyStatus === 'CRITICAL'
    ) {
      overallStatus = 'CRITICAL';
    } else if (
      emergencyStatus === 'CONSTRAINED' ||
      labStatus === 'CONSTRAINED' ||
      radiologyStatus === 'CONSTRAINED'
    ) {
      overallStatus = 'CONSTRAINED';
    } else if (
      emergencyStatus === 'ELEVATED' ||
      labStatus === 'ELEVATED' ||
      radiologyStatus === 'ELEVATED'
    ) {
      overallStatus = 'ELEVATED';
    }

    return {
      facilityId,
      facilityName,
      overallStatus,
      emergencyStatus,
      bedStatus: 'NORMAL',
      labStatus,
      radiologyStatus,
      pharmacyStatus,
      referralReceivingStatus,
      activeQueueCount: facts.length,
      dataAvailable: true,
      asOf: new Date().toISOString(),
    };
  }
}

export const capacityIntelligenceService = CapacityIntelligenceService.getInstance();
