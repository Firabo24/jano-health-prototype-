/**
 * Jano Health - National Exchange Adapter Boundary
 * Clinical Core V13: Standardized Interface Boundary for Future National Health Information Exchange
 * 
 * ARCHITECTURAL MANDATE:
 * Zero simulation of fake government endpoints, ministries, or credentials.
 * Returns explicit UNAVAILABLE or SANDBOX status until an authorized live integration is configured.
 */

import { NationalExchangeStatus } from '../../domain/types';

export interface NationalSubmissionEnvelope {
  submissionType: 'CASE_NOTIFICATION' | 'MORTALITY_REPORT' | 'EPIDEMIOLOGY_AGGREGATE' | 'IMMUNIZATION_REGISTRY';
  jurisdictionCode: string;
  sourceFacilityId: string;
  reportingPeriod: string;
  payload: any;
  hash: string;
}

export interface NationalAdapterResponse {
  status: NationalExchangeStatus;
  adapterConfigured: boolean;
  message: string;
  referenceId?: string;
  timestamp: string;
}

export interface INationalExchangeAdapter {
  readonly adapterName: string;
  getStatus(): NationalExchangeStatus;
  submitExchange(envelope: NationalSubmissionEnvelope): Promise<NationalAdapterResponse>;
  queryMasterFacilityRegistry(facilityCode: string): Promise<NationalAdapterResponse>;
  queryNationalTerminology(code: string, system: string): Promise<NationalAdapterResponse>;
}

/**
 * Standard implementation when no authorized live national HIE exists.
 * Fails transparently with explicit UNAVAILABLE status.
 */
export class DefaultNationalExchangeAdapter implements INationalExchangeAdapter {
  public readonly adapterName = 'jano_unconfigured_national_adapter';
  private mode: NationalExchangeStatus = 'UNAVAILABLE';

  constructor(initialMode: NationalExchangeStatus = 'UNAVAILABLE') {
    this.mode = initialMode;
  }

  public setMode(mode: NationalExchangeStatus): void {
    this.mode = mode;
  }

  public getStatus(): NationalExchangeStatus {
    return this.mode;
  }

  public async submitExchange(envelope: NationalSubmissionEnvelope): Promise<NationalAdapterResponse> {
    const timestamp = new Date().toISOString();

    if (this.mode === 'UNAVAILABLE') {
      return {
        status: 'UNAVAILABLE',
        adapterConfigured: false,
        message: 'NATIONAL_HIE_UNAVAILABLE: No national health information exchange endpoint or authorized credentials configured for this jurisdiction.',
        timestamp,
      };
    }

    if (this.mode === 'SANDBOX') {
      return {
        status: 'SANDBOX',
        adapterConfigured: true,
        message: 'NATIONAL_HIE_SANDBOX: Transmission simulated in offline developer test harness. Not submitted to real national infrastructure.',
        referenceId: `SBX-${Date.now().toString(36).toUpperCase()}`,
        timestamp,
      };
    }

    // Configured live adapter boundary (stubbed safely)
    return {
      status: 'CONFIGURED',
      adapterConfigured: true,
      message: 'NATIONAL_HIE_CONFIGURED: Ready for secure authenticated gateway handover.',
      referenceId: `REF-${Date.now().toString(36).toUpperCase()}`,
      timestamp,
    };
  }

  public async queryMasterFacilityRegistry(facilityCode: string): Promise<NationalAdapterResponse> {
    return {
      status: this.mode,
      adapterConfigured: this.mode === 'CONFIGURED',
      message: `MASTER_FACILITY_REGISTRY_${this.mode}: National master registry lookup for code '${facilityCode}' is currently unconfigured. Local cached registry remains authoritative.`,
      timestamp: new Date().toISOString(),
    };
  }

  public async queryNationalTerminology(code: string, system: string): Promise<NationalAdapterResponse> {
    return {
      status: this.mode,
      adapterConfigured: this.mode === 'CONFIGURED',
      message: `NATIONAL_TERMINOLOGY_${this.mode}: National terminology server for code '${code}' in system '${system}' is unconfigured. Internal verified terminologies remain authoritative.`,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Population Health Exchange Boundary
 * Explicitly isolates aggregate public health surveillance from patient-level clinical exchange.
 */
export class PopulationHealthExchange {
  private static instance: PopulationHealthExchange;

  private constructor() {}

  public static getInstance(): PopulationHealthExchange {
    if (!PopulationHealthExchange.instance) {
      PopulationHealthExchange.instance = new PopulationHealthExchange();
    }
    return PopulationHealthExchange.instance;
  }

  public prepareAggregateSurveillancePackage(params: {
    facilityId: string;
    indicatorCode: string;
    reportingPeriodStart: string;
    reportingPeriodEnd: string;
    aggregateCounts: Record<string, number>;
  }): NationalSubmissionEnvelope {
    const payload = {
      facilityId: params.facilityId,
      indicatorCode: params.indicatorCode,
      reportingPeriod: `${params.reportingPeriodStart}/${params.reportingPeriodEnd}`,
      data: params.aggregateCounts,
      assembledAt: new Date().toISOString(),
      governanceBoundary: 'POPULATION_HEALTH_AGGREGATE_ONLY',
    };

    return {
      submissionType: 'EPIDEMIOLOGY_AGGREGATE',
      jurisdictionCode: 'TZ-KG',
      sourceFacilityId: params.facilityId,
      reportingPeriod: payload.reportingPeriod,
      payload,
      hash: `hash_${Date.now()}`,
    };
  }
}

export const defaultNationalExchangeAdapter = new DefaultNationalExchangeAdapter();
export const populationHealthExchange = PopulationHealthExchange.getInstance();
