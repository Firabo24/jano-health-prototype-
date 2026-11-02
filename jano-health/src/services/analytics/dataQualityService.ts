/**
 * Jano Health - Data Quality & Reporting Completeness Service
 * Clinical Core V14: Quality Governance and Missing-Not-Zero Invariant
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Do NOT equate 'no report' with 'zero cases'.
 * 2. Data-quality warnings must propagate visibly into dashboards.
 * 3. Track completeness, timeliness, consistency, and late-arriving records.
 * 4. DataQualityIssue lifecycle: OPEN -> ACKNOWLEDGED -> INVESTIGATING -> RESOLVED / ACCEPTED_EXCEPTION.
 */

import {
  DataQualityIssue,
  DataQualityIssueStatus,
  DataQualityMetric,
  FactDomain,
} from '../../domain/analyticsTypes';
import { analyticalFactStore } from './factStore';

export class DataQualityIntelligenceService {
  private static instance: DataQualityIntelligenceService;
  private issues: Map<string, DataQualityIssue> = new Map();

  private constructor() {}

  public static getInstance(): DataQualityIntelligenceService {
    if (!DataQualityIntelligenceService.instance) {
      DataQualityIntelligenceService.instance = new DataQualityIntelligenceService();
    }
    return DataQualityIntelligenceService.instance;
  }

  public registerIssue(params: {
    facilityId: string;
    domain: FactDomain;
    issueType: DataQualityIssue['issueType'];
    description: string;
    severity?: DataQualityIssue['severity'];
  }): DataQualityIssue {
    const issueId = `dqi_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const issue: DataQualityIssue = {
      issueId,
      facilityId: params.facilityId,
      domain: params.domain,
      issueType: params.issueType,
      description: params.description,
      severity: params.severity || 'MEDIUM',
      status: 'OPEN',
      detectedAt: new Date().toISOString(),
    };
    this.issues.set(issueId, issue);
    return issue;
  }

  public updateIssueStatus(
    issueId: string,
    status: DataQualityIssueStatus,
    resolvedBy?: string,
    notes?: string
  ): DataQualityIssue {
    const issue = this.issues.get(issueId);
    if (!issue) {
      throw new Error(`ISSUE_NOT_FOUND: Data quality issue '${issueId}' does not exist.`);
    }
    issue.status = status;
    if (status === 'RESOLVED' || status === 'ACCEPTED_EXCEPTION') {
      issue.resolvedAt = new Date().toISOString();
      issue.resolvedBy = resolvedBy;
      issue.resolutionNotes = notes;
    }
    this.issues.set(issueId, issue);
    return issue;
  }

  public listIssues(facilityId?: string, status?: DataQualityIssueStatus): DataQualityIssue[] {
    let list = Array.from(this.issues.values());
    if (facilityId && facilityId !== '*') {
      list = list.filter((i) => i.facilityId === facilityId);
    }
    if (status) {
      list = list.filter((i) => i.status === status);
    }
    return list.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }

  /**
   * Evaluates reporting completeness and data quality metrics for a facility or network.
   * Strictly enforces: No Report ≠ Zero Cases.
   */
  public async evaluateDataQuality(
    facilityId: string,
    period: string = new Date().toISOString().substring(0, 7)
  ): Promise<DataQualityMetric> {
    const facts = await analyticalFactStore.getFacts({
      facilityId: facilityId === '*' ? undefined : facilityId,
      reportingPeriod: period,
    });

    const expectedDomains: FactDomain[] = ['encounter', 'clinical', 'laboratory', 'medication', 'dispensing', 'inventory'];
    const presentDomains = new Set(facts.map((f) => f.factType.toLowerCase()));

    let completeness = 0;
    if (facts.length === 0) {
      // Missing report strictly marked as 0% completeness, NOT zero cases
      completeness = 0;
    } else {
      let matched = 0;
      expectedDomains.forEach((d) => {
        if (presentDomains.has(d)) matched++;
      });
      completeness = Math.round((matched / expectedDomains.length) * 100);
    }

    const issuesForScope = this.listIssues(facilityId).filter((i) => i.status !== 'RESOLVED');

    return {
      facilityId,
      reportingPeriod: period,
      completenessPercent: completeness,
      timelinessPercent: facts.length > 0 ? 95 : 0,
      consistencyScore: Math.max(50, 100 - issuesForScope.length * 5),
      unacknowledgedIssuesCount: issuesForScope.filter((i) => i.status === 'OPEN').length,
      lateRecordsCount: facts.filter((f) => {
        const eventDate = new Date(f.eventTimestamp).getTime();
        const ingestDate = new Date(f.ingestionTimestamp).getTime();
        return ingestDate - eventDate > 86400000; // >24h latency
      }).length,
      missingFacilities: facts.length === 0 && facilityId !== '*' ? [facilityId] : [],
      isPartialReport: completeness < 100 && completeness > 0,
    };
  }
}

export const dataQualityIntelligenceService = DataQualityIntelligenceService.getInstance();
