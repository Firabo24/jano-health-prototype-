/**
 * Jano Health - External Health Intelligence & Reporting Adapters
 * Clinical Core V14: DHIS2, HMIS, and Terminology Governance Boundaries
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Jano is NOT a replacement for DHIS2.
 * 2. External reporting remains a separate boundary; default status: UNAVAILABLE or SANDBOX.
 * 3. Never silently push data into a live DHIS2/HMIS instance.
 * 4. Never fabricate an HMIS or external reporting transmission success.
 */

import {
  ExternalAdapterStatus,
  IDHIS2ExchangeAdapter,
  IHMISExchangeAdapter,
  PublicHealthReportPackage,
  TerminologyGovernanceAdapter,
} from '../../domain/analyticsTypes';

export class DHIS2ExchangeAdapter implements IDHIS2ExchangeAdapter {
  public readonly status: ExternalAdapterStatus = 'SANDBOX';

  public generateDataValueSet(report: PublicHealthReportPackage): Record<string, any> {
    const dataValues = Object.entries(report.indicatorValues).map(([code, value]) => ({
      dataElement: `de_${code}`,
      period: report.reportingPeriod.replace('-', ''),
      orgUnit: `ou_${report.geographicScope.scopeId}`,
      value: String(value),
      storedBy: report.provenance.generatedBy,
    }));

    return {
      dataSet: 'JANO_PRIMARY_HEALTH_MONTHLY',
      completeDate: report.approvedAt || new Date().toISOString(),
      period: report.reportingPeriod.replace('-', ''),
      orgUnit: `ou_${report.geographicScope.scopeId}`,
      dataValues,
    };
  }

  public async submitDataValueSet(payload: any): Promise<{ success: boolean; message: string; statusCode: number }> {
    // Invariant: Never fabricate live transmission without configured endpoint and credentials
    return {
      success: false,
      statusCode: 503,
      message: 'DHIS2_INTEGRATION_UNAVAILABLE: External live DHIS2 endpoint is unconfigured. Sandbox payload assembled successfully.',
    };
  }
}

export class HMISExchangeAdapter implements IHMISExchangeAdapter {
  public readonly status: ExternalAdapterStatus = 'SANDBOX';

  public generateMonthlyReport(report: PublicHealthReportPackage): Record<string, any> {
    return {
      formCode: 'MOH_HMIS_105',
      reportingPeriod: report.reportingPeriod,
      facilityScope: report.geographicScope.scopeId,
      indicators: report.indicatorValues,
      compiledAt: new Date().toISOString(),
      signatureSeal: report.integrityHash,
    };
  }

  public async submitMonthlyReport(payload: any): Promise<{ success: boolean; message: string; statusCode: number }> {
    return {
      success: false,
      statusCode: 503,
      message: 'HMIS_ENDPOINT_UNAVAILABLE: National HMIS gateway is not configured for automatic upload. Manual export payload generated.',
    };
  }
}

export class TerminologyGovernanceAdapterImpl implements TerminologyGovernanceAdapter {
  public readonly status: ExternalAdapterStatus = 'CONFIGURED';

  public mapInternalMetricToIndicator(metricId: string): { externalCode: string; scheme: string; mapped: boolean } {
    const mappingTable: Record<string, { externalCode: string; scheme: string }> = {
      METRIC_ENCOUNTERS_TOTAL: { externalCode: 'MOH.OPD.TOTAL_ATTENDANCE', scheme: 'NATIONAL_INDICATOR_REGISTRY' },
      METRIC_EMERGENCY_ARRIVALS: { externalCode: 'MOH.EMG.ACUTE_ADMISSIONS', scheme: 'NATIONAL_INDICATOR_REGISTRY' },
      METRIC_LAB_TEST_VOLUME: { externalCode: 'MOH.LAB.SPECIMENS_TESTED', scheme: 'NATIONAL_INDICATOR_REGISTRY' },
      METRIC_REFERRAL_VOLUME: { externalCode: 'MOH.REF.OUTBOUND_CASES', scheme: 'NATIONAL_INDICATOR_REGISTRY' },
      METRIC_ESSENTIAL_MEDS_STOCKOUT: { externalCode: 'MOH.SUP.STOCKOUT_INCIDENTS', scheme: 'NATIONAL_INDICATOR_REGISTRY' },
    };

    const match = mappingTable[metricId];
    if (match) {
      return { ...match, mapped: true };
    }
    return {
      externalCode: metricId,
      scheme: 'INTERNAL_JANO_INDICATOR',
      mapped: false,
    };
  }
}

export const defaultDHIS2Adapter = new DHIS2ExchangeAdapter();
export const defaultHMISAdapter = new HMISExchangeAdapter();
export const defaultTerminologyAdapter = new TerminologyGovernanceAdapterImpl();
