/**
 * Jano Health - Clinical Core V10: AI Safety Gateway & Autonomous Mutation Guard
 * 
 * Critical Responsibilities:
 * 1. Pre-execution authorization: Authenticated principal + AI capability + role policy + facility scope.
 * 2. Prompt injection defense: Scans untrusted narrative text for control-hijacking tokens.
 * 3. Rate limiting & resource quota enforcement per user and facility.
 * 4. Runtime Autonomous Mutation Guard: Detects and blocks any attempted clinical record mutation in model outputs.
 * 5. Structured response validation and compliance enforcement.
 */

import {
  AICapability,
  AIClinicalResponse,
  AISafetyStatus,
  AITaskPolicy,
} from '../../domain/aiTypes';
import { RoleType } from '../../domain/types';
import { auditService } from '../audit/auditService';

/**
 * Task policies defining authorized roles and boundaries for all 9 initial capabilities.
 * INVARIANT: mutationAllowed is strictly false across all clinical AI capabilities.
 */
export const AI_TASK_POLICIES: Record<AICapability, AITaskPolicy> = {
  'ai.chart_summary': {
    taskType: 'ai.chart_summary',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'clinical_supervisor'],
    allowedCapabilities: ['ai.chart_summary'],
    allowedDataSources: ['patients', 'encounters', 'problems', 'diagnoses', 'medications', 'labResults', 'radiologyResults', 'allergies'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.encounter_summary': {
    taskType: 'ai.encounter_summary',
    requiresPatientContext: true,
    requiresEncounterContext: true,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'clinical_supervisor'],
    allowedCapabilities: ['ai.encounter_summary'],
    allowedDataSources: ['encounters', 'vitals', 'clinicalNotes', 'clinicalAssessments'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.clinical_documentation': {
    taskType: 'ai.clinical_documentation',
    requiresPatientContext: true,
    requiresEncounterContext: true,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'radiologist', 'clinical_supervisor'],
    allowedCapabilities: ['ai.clinical_documentation'],
    allowedDataSources: ['encounters', 'vitals', 'problems', 'diagnoses', 'clinicalNotes'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.differential_support': {
    taskType: 'ai.differential_support',
    requiresPatientContext: true,
    requiresEncounterContext: true,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor'],
    allowedCapabilities: ['ai.differential_support'],
    allowedDataSources: ['encounters', 'vitals', 'problems', 'diagnoses', 'labResults'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.clinical_question': {
    taskType: 'ai.clinical_question',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'pharmacist', 'laboratory_staff', 'radiologist', 'clinical_supervisor'],
    allowedCapabilities: ['ai.clinical_question'],
    allowedDataSources: ['knowledgeBase', 'guidelines'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.missing_information': {
    taskType: 'ai.missing_information',
    requiresPatientContext: true,
    requiresEncounterContext: true,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'pharmacist', 'clinical_supervisor'],
    allowedCapabilities: ['ai.missing_information'],
    allowedDataSources: ['encounters', 'vitals', 'allergies', 'medications', 'labOrders'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.referral_summary': {
    taskType: 'ai.referral_summary',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'clinical_supervisor'],
    allowedCapabilities: ['ai.referral_summary'],
    allowedDataSources: ['referrals', 'patients', 'diagnoses', 'medications', 'labResults', 'clinicalNotes'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.medication_safety_support': {
    taskType: 'ai.medication_safety_support',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'pharmacist', 'clinical_supervisor'],
    allowedCapabilities: ['ai.medication_safety_support'],
    allowedDataSources: ['medications', 'allergies', 'problems', 'labResults'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ai.patient_education': {
    taskType: 'ai.patient_education',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'nurse', 'pharmacist', 'clinical_supervisor'],
    allowedCapabilities: ['ai.patient_education'],
    allowedDataSources: ['guidelines', 'patientTopics'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'population.summary': {
    taskType: 'population.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'public_health_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['population.summary'],
    allowedDataSources: ['analyticalFacts', 'metrics'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'population.signal.explain': {
    taskType: 'population.signal.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'public_health_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['population.signal.explain'],
    allowedDataSources: ['populationSignals', 'analyticalFacts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'population.trend.interpret': {
    taskType: 'population.trend.interpret',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'public_health_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['population.trend.interpret'],
    allowedDataSources: ['metrics', 'cohorts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'facility.performance.summary': {
    taskType: 'facility.performance.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['facility.performance.summary'],
    allowedDataSources: ['analyticalFacts', 'encounters'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'referral.network.summary': {
    taskType: 'referral.network.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'network_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['referral.network.summary'],
    allowedDataSources: ['referrals', 'analyticalFacts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'supply.forecast.explain': {
    taskType: 'supply.forecast.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'pharmacist', 'clinical_supervisor', 'facility_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['supply.forecast.explain'],
    allowedDataSources: ['inventoryBatches', 'demandForecasts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'data.quality.explain': {
    taskType: 'data.quality.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'public_health_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['data.quality.explain'],
    allowedDataSources: ['dataQualityIssues', 'analyticalFacts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'public.health.brief': {
    taskType: 'public.health.brief',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_intelligence_user', 'public_health_intelligence_user', 'system_intelligence_admin'],
    allowedCapabilities: ['public.health.brief'],
    allowedDataSources: ['publicHealthReports', 'analyticalFacts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'identity.reconciliation.explain': {
    taskType: 'identity.reconciliation.explain',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['identity.reconciliation.explain'],
    allowedDataSources: ['longitudinalIdentities', 'identityEvidence'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'consent.summary': {
    taskType: 'consent.summary',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'nurse', 'health_officer', 'clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['consent.summary'],
    allowedDataSources: ['patientConsents', 'consentAuditEntries'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'consent.audit.summary': {
    taskType: 'consent.audit.summary',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['consent.audit.summary'],
    allowedDataSources: ['consentAuditEntries', 'patientConsents', 'emergencyAccessRequests'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'coverage.summary': {
    taskType: 'coverage.summary',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'health_officer', 'receptionist', 'clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['coverage.summary'],
    allowedDataSources: ['coverages', 'eligibilityRequests'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'claim.validation.explain': {
    taskType: 'claim.validation.explain',
    requiresPatientContext: true,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['claim.validation.explain'],
    allowedDataSources: ['claims', 'claimLines', 'financialQuarantine'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'financial.exception.summary': {
    taskType: 'financial.exception.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'system_administrator'],
    allowedCapabilities: ['financial.exception.summary'],
    allowedDataSources: ['financialQuarantine', 'claims', 'payments'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'financing.report.draft': {
    taskType: 'financing.report.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'system_administrator'],
    allowedCapabilities: ['financing.report.draft'],
    allowedDataSources: ['claims', 'invoices', 'payments', 'financialEvents'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'workforce.summary': {
    taskType: 'workforce.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'clinical_supervisor', 'system_administrator'],
    allowedCapabilities: ['workforce.summary'],
    allowedDataSources: ['workforceMembers', 'workforceFacilityAssignments'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'workforce.workload.explain': {
    taskType: 'workforce.workload.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'clinical_supervisor', 'system_administrator'],
    allowedCapabilities: ['workforce.workload.explain'],
    allowedDataSources: ['workloadSnapshots', 'workforceTasks', 'encounters'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'handover.summary': {
    taskType: 'handover.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'nurse', 'clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['handover.summary'],
    allowedDataSources: ['shiftHandovers', 'workforceTasks'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'task.priority.suggest': {
    taskType: 'task.priority.suggest',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['physician', 'nurse', 'clinical_supervisor', 'facility_administrator', 'system_administrator'],
    allowedCapabilities: ['task.priority.suggest'],
    allowedDataSources: ['workforceTasks'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'staffing.gap.explain': {
    taskType: 'staffing.gap.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'clinical_supervisor', 'system_administrator'],
    allowedCapabilities: ['staffing.gap.explain'],
    allowedDataSources: ['staffingGaps', 'staffingRequirements', 'dutyRosters'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'roster.recommend': {
    taskType: 'roster.recommend',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'clinical_supervisor', 'system_administrator'],
    allowedCapabilities: ['roster.recommend'],
    allowedDataSources: ['dutyRosters', 'shiftAssignments', 'workforceAvailability'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'procurement.summary': {
    taskType: 'procurement.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'system_administrator'],
    allowedCapabilities: ['procurement.summary'],
    allowedDataSources: ['purchaseOrders', 'requisitions'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'supply.risk.explain': {
    taskType: 'supply.risk.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'laboratory_staff', 'clinical_supervisor', 'system_administrator'],
    allowedCapabilities: ['supply.risk.explain'],
    allowedDataSources: ['supplyRisks', 'supplyItems'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'replenishment.explain': {
    taskType: 'replenishment.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'system_administrator'],
    allowedCapabilities: ['replenishment.explain'],
    allowedDataSources: ['replenishmentRecommendations', 'procurementForecasts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'supplier.performance.summary': {
    taskType: 'supplier.performance.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'system_administrator'],
    allowedCapabilities: ['supplier.performance.summary'],
    allowedDataSources: ['suppliers', 'supplierQualityEvents', 'shipments'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'shipment.delay.explain': {
    taskType: 'shipment.delay.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'system_administrator'],
    allowedCapabilities: ['shipment.delay.explain'],
    allowedDataSources: ['shipments', 'transportLegs'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'cold_chain.exception.summary': {
    taskType: 'cold_chain.exception.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'laboratory_staff', 'system_administrator'],
    allowedCapabilities: ['cold_chain.exception.summary'],
    allowedDataSources: ['temperatureExcursions', 'temperatureLogs'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'procurement.report.draft': {
    taskType: 'procurement.report.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'system_administrator'],
    allowedCapabilities: ['procurement.report.draft'],
    allowedDataSources: ['purchaseOrders', 'goodsReceipts', 'requisitions'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'demand_forecast.explain': {
    taskType: 'demand_forecast.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['facility_administrator', 'pharmacist', 'system_administrator'],
    allowedCapabilities: ['demand_forecast.explain'],
    allowedDataSources: ['procurementForecasts', 'demandSignals'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'research.question.refine': {
    taskType: 'research.question.refine',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'physician'],
    allowedCapabilities: ['research.question.refine'],
    allowedDataSources: ['studyProtocols', 'evidenceVariables'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'research.cohort.explain': {
    taskType: 'research.cohort.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'data_access_steward'],
    allowedCapabilities: ['research.cohort.explain'],
    allowedDataSources: ['researchCohorts', 'researchCohortDefinitions'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'research.dataset.summary': {
    taskType: 'research.dataset.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'data_access_steward'],
    allowedCapabilities: ['research.dataset.summary'],
    allowedDataSources: ['researchDatasets', 'researchDatasetVersions'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'research.data_quality.explain': {
    taskType: 'research.data_quality.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'data_access_steward'],
    allowedCapabilities: ['research.data_quality.explain'],
    allowedDataSources: ['studyMonitoringRecords', 'researchDatasets'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'evidence.summary': {
    taskType: 'evidence.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'physician', 'pharmacist'],
    allowedCapabilities: ['evidence.summary'],
    allowedDataSources: ['evidenceRecords', 'citationRecords'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'evidence.compare': {
    taskType: 'evidence.compare',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'physician'],
    allowedCapabilities: ['evidence.compare'],
    allowedDataSources: ['evidenceRecords', 'evidenceAssessments'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'evidence.synthesis.draft': {
    taskType: 'evidence.synthesis.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator'],
    allowedCapabilities: ['evidence.synthesis.draft'],
    allowedDataSources: ['evidenceRecords', 'evidenceSyntheses'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'literature.citation.check': {
    taskType: 'literature.citation.check',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator'],
    allowedCapabilities: ['literature.citation.check'],
    allowedDataSources: ['citationRecords', 'evidenceSources'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'study_protocol.summary': {
    taskType: 'study_protocol.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'research_coordinator'],
    allowedCapabilities: ['study_protocol.summary'],
    allowedDataSources: ['studyProtocols', 'researchStudies'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'quality_improvement.summary': {
    taskType: 'quality_improvement.summary',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'facility_administrator'],
    allowedCapabilities: ['quality_improvement.summary'],
    allowedDataSources: ['qualityImprovementProjects', 'learningFindings'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'learning_report.draft': {
    taskType: 'learning_report.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['clinical_researcher', 'system_administrator', 'facility_administrator'],
    allowedCapabilities: ['learning_report.draft'],
    allowedDataSources: ['learningCycles', 'practiceChangeProposals', 'knowledgeArtifacts'],
    offlineAllowed: false,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.report.validate': {
    taskType: 'ecosystem.report.validate',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['ecosystem_data_steward', 'national_interoperability_officer', 'system_administrator'],
    allowedCapabilities: ['ecosystem.report.validate'],
    allowedDataSources: ['reportingDatasets', 'nationalReportingProfiles'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.report.draft': {
    taskType: 'ecosystem.report.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['ecosystem_data_steward', 'national_interoperability_officer', 'system_administrator'],
    allowedCapabilities: ['ecosystem.report.draft'],
    allowedDataSources: ['reportingDatasets', 'nationalReportingProfiles'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.mapping.explain': {
    taskType: 'ecosystem.mapping.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['ecosystem_data_steward', 'national_interoperability_officer', 'system_administrator'],
    allowedCapabilities: ['ecosystem.mapping.explain'],
    allowedDataSources: ['terminologyMaps', 'terminologySystems'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.identity.explain': {
    taskType: 'ecosystem.identity.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['ecosystem_data_steward', 'national_interoperability_officer', 'system_administrator'],
    allowedCapabilities: ['ecosystem.identity.explain'],
    allowedDataSources: ['nationalIdentityReferences', 'identityVerificationRequests'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.facility_match.explain': {
    taskType: 'ecosystem.facility_match.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['ecosystem_data_steward', 'national_interoperability_officer', 'system_administrator'],
    allowedCapabilities: ['ecosystem.facility_match.explain'],
    allowedDataSources: ['facilityRegistryReferences', 'facilityRegistryMappings'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'ecosystem.surveillance.explain': {
    taskType: 'ecosystem.surveillance.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['national_interoperability_officer', 'system_administrator', 'public_health_intelligence_user'],
    allowedCapabilities: ['ecosystem.surveillance.explain'],
    allowedDataSources: ['surveillanceSignals', 'surveillanceReports'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.health.explain': {
    taskType: 'system.health.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator', 'facility_administrator'],
    allowedCapabilities: ['system.health.explain'],
    allowedDataSources: ['systemObservations', 'systemHealthSnapshots'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.risk.explain': {
    taskType: 'system.risk.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator'],
    allowedCapabilities: ['system.risk.explain'],
    allowedDataSources: ['systemRisks', 'crossDomainSignals'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.incident.summarize': {
    taskType: 'system.incident.summarize',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator'],
    allowedCapabilities: ['system.incident.summarize'],
    allowedDataSources: ['systemIncidents', 'rootCauseAnalyses'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.playbook.draft': {
    taskType: 'system.playbook.draft',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator'],
    allowedCapabilities: ['system.playbook.draft'],
    allowedDataSources: ['incidentResponsePlaybooks'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.optimization.propose': {
    taskType: 'system.optimization.propose',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator'],
    allowedCapabilities: ['system.optimization.propose'],
    allowedDataSources: ['capacityStates', 'optimizationRecommendations'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
  'system.simulation.explain': {
    taskType: 'system.simulation.explain',
    requiresPatientContext: false,
    requiresEncounterContext: false,
    allowedRoles: ['system_intelligence_governor', 'system_administrator'],
    allowedCapabilities: ['system.simulation.explain'],
    allowedDataSources: ['simulationScenarios'],
    offlineAllowed: true,
    modelPolicy: 'PRIMARY_WITH_TRANSIENT_FALLBACK',
    reviewRequired: true,
    mutationAllowed: false,
  },
};

/**
 * Patterns of prohibited autonomous clinical mutation commands.
 */
const PROHIBITED_MUTATION_PATTERNS = [
  /\bCREATE_DIAGNOSIS\b/i,
  /\bMUTATE_DIAGNOSIS\b/i,
  /\bSET_DIAGNOSIS\b/i,
  /\bISSUE_PRESCRIPTION\b/i,
  /\bCHANGE_PRESCRIPTION\b/i,
  /\bALTER_PRESCRIPTION\b/i,
  /\bPRESCRIBE_DRUG\b/i,
  /\bDISCONTINUE_MEDICATION\b/i,
  /\bMUTATE_MEDICATION\b/i,
  /\bDISPENSE_STOCK\b/i,
  /\bSIGN_CLINICAL_NOTE\b/i,
  /\bALTER_CLINICAL_NOTE\b/i,
  /\bSET_TRIAGE_CATEGORY\b/i,
  /\bCHANGE_TRIAGE\b/i,
  /\bMUTATE_TRIAGE\b/i,
  /\bSET_EMERGENCY_DISPOSITION\b/i,
  /\bCHANGE_EMERGENCY_DISPOSITION\b/i,
  /\bDISCHARGE_EMERGENCY_PATIENT\b/i,
  /\bREROUTE_EMERGENCY_PATIENT\b/i,
  /\bVERIFY_LAB_RESULT\b/i,
  /\bALTER_LAB_RESULT\b/i,
  /\bMUTATE_LAB_RESULT\b/i,
  /\bFINALIZE_RADIOLOGY_REPORT\b/i,
  /\bALTER_RADIOLOGY_REPORT\b/i,
  /\bMUTATE_RADIOLOGY_REPORT\b/i,
  /\bACCEPT_REFERRAL\b/i,
  /\bREJECT_REFERRAL\b/i,
  /\bHIRE_STAFF\b/i,
  /\bTERMINATE_STAFF\b/i,
  /\bSUSPEND_CREDENTIAL\b/i,
  /\bCHANGE_WORKFORCE_CREDENTIALS\b/i,
  /\bASSIGN_CLINICAL_PRIVILEGE\b/i,
  /\bGRANT_CLINICAL_PRIVILEGES\b/i,
  /\bAPPROVE_COMPETENCY\b/i,
  /\bREMOVE_STAFF_FROM_DUTY\b/i,
  /\bALTER_PROFESSIONAL_LICENSE\b/i,
  /\bAPPROVE_PURCHASE_ORDER\b/i,
  /\bAUTHORIZE_PROCUREMENT\b/i,
  /\bBLACKLIST_SUPPLIER\b/i,
  /\bBLACKLIST_SUPPLIERS\b/i,
  /\bDISPOSE_STOCK\b/i,
  /\bRELEASE_QUALITY_HOLD\b/i,
  /\bRELEASE_QUARANTINED_STOCK\b/i,
  /\bALTER_INVENTORY_STOCK\b/i,
  /\bAUTHORIZE_PAYMENT\b/i,
  /\bAPPROVE_PAYMENT\b/i,
  /\bAUTHORIZE_STOCK_TRANSFER\b/i,
  /\bMUTATE_SUPPLY_CATALOG\b/i,
  /\bOVERRIDE_COLD_CHAIN_HOLD\b/i,
  /\bCREATE_SUPPLIER_CONTRACT\b/i,
  /\bCLOSE_REFERRAL\b/i,
  /\bALTER_INVENTORY\b/i,
  /\bEXECUTE_ORDER\b/i,
  /\bAUTO_MERGE_PATIENT\b/i,
  /\bMERGE_PATIENTS\b/i,
  /\bEXECUTE_PATIENT_MERGE\b/i,
  /\bALTER_CONSENT\b/i,
  /\bREVOKE_RESEARCH_CONSENT\b/i,
  /\bAPPROVE_CLAIM\b/i,
  /\bSETTLE_PAYMENT\b/i,
  /\bSETTLE_CLAIM\b/i,
  /\bCANCEL_CLINICAL_ORDER\b/i,
  /\bENROLL_SUBJECT\b/i,
  /\bAUTONOMOUS_ENROLL\b/i,
  /\bOBTAIN_RESEARCH_CONSENT\b/i,
  /\bWITHDRAW_RESEARCH_SUBJECT\b/i,
  /\bRELEASE_RESEARCH_DATASET\b/i,
  /\bAPPROVE_RESEARCH_STUDY\b/i,
  /\bAPPROVE_RESEARCH\b/i,
  /\bAPPROVE_ETHICS\b/i,
  /\bMODIFY_STUDY_PROTOCOL\b/i,
  /\bDECLARE_EFFICACY\b/i,
  /\bCERTIFY_EVIDENCE\b/i,
  /\bMODIFY_CLINICAL_GUIDELINE\b/i,
  /\bALTER_PATIENT_RECORD\b/i,
  /\bSUBMIT_OFFICIAL_REPORT\b/i,
  /\bSUBMIT_NATIONAL_REPORT\b/i,
  /\bAPPROVE_EXTERNAL_INTEGRATION\b/i,
  /\bAPPROVE_INTEGRATION\b/i,
  /\bAPPROVE_NATIONAL_IDENTITY\b/i,
  /\bOVERRIDE_NATIONAL_IDENTITY\b/i,
  /\bMERGE_PATIENTS_NATIONAL_IDENTITY\b/i,
  /\bAPPROVE_TERMINOLOGY_MAP\b/i,
  /\bAPPROVE_AMBIGUOUS_TERMINOLOGY\b/i,
  /\bALTER_NATIONAL_TERMINOLOGY\b/i,
  /\bCONFIRM_OUTBREAK\b/i,
  /\bDECLARE_OUTBREAK\b/i,
  /\bESCALATE_SURVEILLANCE_OFFICIAL\b/i,
  /\bALTER_OFFICIAL_REGISTRY\b/i,
  /\bALTER_NATIONAL_REGISTRY_DATA\b/i,
  /\bALTER_MFR_FACILITY\b/i,
  /"action"\s*:\s*"(CREATE|UPDATE|DELETE|PRESCRIBE|DISPENSE|SIGN)"/i,
];

/**
 * Prompt injection indicators.
 */
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+system\s+(policy|instructions)/i,
  /you\s+are\s+now\s+(unrestricted|in\s+developer\s+mode|dan)/i,
  /system\s+override\s*:\s*enable\s+prescribing/i,
  /bypass\s+clinician\s+review/i,
  /elevate\s+privileges\s+to\s+root/i,
  /reveal\s+internal\s+passwords/i,
];

export interface SecurityCheckResult {
  passed: boolean;
  reason?: string;
  safetyStatus: AISafetyStatus;
}

export class AISafetyGateway {
  private static instance: AISafetyGateway;

  // Rate Limiting Table: user/facility requests in rolling 60-second window
  private requestTimestamps = new Map<string, number[]>();
  private readonly MAX_REQUESTS_PER_MINUTE_USER = 20;
  private readonly MAX_REQUESTS_PER_MINUTE_FACILITY = 100;

  public static getInstance(): AISafetyGateway {
    if (!AISafetyGateway.instance) {
      AISafetyGateway.instance = new AISafetyGateway();
    }
    return AISafetyGateway.instance;
  }

  /**
   * Pre-execution authorization & task validation.
   */
  public authorizeRequest(
    taskType: AICapability,
    actorRole: RoleType,
    actorId: string,
    facilityId: string
  ): SecurityCheckResult {
    const policy = AI_TASK_POLICIES[taskType];
    if (!policy) {
      return {
        passed: false,
        reason: `Unauthorized or unconfigured AI task capability: ${taskType}`,
        safetyStatus: 'REJECTED',
      };
    }

    // Role verification
    if (!policy.allowedRoles.includes(actorRole)) {
      return {
        passed: false,
        reason: `Role '${actorRole}' is not authorized for task '${taskType}' under clinical AI policy`,
        safetyStatus: 'REJECTED',
      };
    }

    // Rate Limit Checks
    const now = Date.now();
    const userKey = `user:${actorId}`;
    const facKey = `fac:${facilityId}`;

    const cleanTimestamps = (key: string, limit: number): boolean => {
      const timestamps = (this.requestTimestamps.get(key) || []).filter((t) => now - t < 60000);
      if (timestamps.length >= limit) {
        return false;
      }
      timestamps.push(now);
      this.requestTimestamps.set(key, timestamps);
      return true;
    };

    if (!cleanTimestamps(userKey, this.MAX_REQUESTS_PER_MINUTE_USER)) {
      return {
        passed: false,
        reason: `Rate limit exceeded for user ${actorId}. Max ${this.MAX_REQUESTS_PER_MINUTE_USER} requests/minute.`,
        safetyStatus: 'REJECTED',
      };
    }

    if (!cleanTimestamps(facKey, this.MAX_REQUESTS_PER_MINUTE_FACILITY)) {
      return {
        passed: false,
        reason: `Rate limit exceeded for facility ${facilityId}. Max ${this.MAX_REQUESTS_PER_MINUTE_FACILITY} requests/minute.`,
        safetyStatus: 'REJECTED',
      };
    }

    return {
      passed: true,
      safetyStatus: 'PASSED',
    };
  }

  /**
   * Scans untrusted input for prompt injection attempts.
   */
  public screenUntrustedContent(content: string): SecurityCheckResult {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        return {
          passed: false,
          reason: 'Untrusted content contains prohibited control-override tokens (prompt injection detected).',
          safetyStatus: 'PROMPT_INJECTION_DETECTED',
        };
      }
    }
    return {
      passed: true,
      safetyStatus: 'PASSED',
    };
  }

  /**
   * Runtime Autonomous Mutation Guard:
   * Scans model output for prohibited clinical mutation commands.
   */
  public inspectModelOutput(
    rawText: string,
    requestId: string,
    actorId: string,
    facilityId: string,
    taskType: AICapability
  ): SecurityCheckResult {
    for (const pattern of PROHIBITED_MUTATION_PATTERNS) {
      if (pattern.test(rawText)) {
        // Emit critical security event
        auditService.logSecurityEvent({
          actorId,
          actorName: 'Jano AI Autonomous Mutation Guard',
          actorRole: 'system_administrator',
          facilityId,
          action: 'AI_AUTONOMOUS_MUTATION_BLOCKED',
          resourceType: 'AIRequest',
          resourceId: requestId,
          details: {
            taskType,
            attemptedPattern: pattern.toString(),
            blockedAt: new Date().toISOString(),
          },
        });

        return {
          passed: false,
          reason: 'Model output attempted unauthorized autonomous clinical mutation. Output rejected by safety gateway.',
          safetyStatus: 'MUTATION_BLOCKED',
        };
      }
    }

    return {
      passed: true,
      safetyStatus: 'PASSED',
    };
  }

  /**
   * Validates structured response conformance to base clinical schema.
   */
  public validateStructuredResponse(response: Partial<AIClinicalResponse>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!response.requestId) errors.push('Missing requestId');
    if (!response.taskType) errors.push('Missing taskType');
    if (!response.model) errors.push('Missing model identifier');
    if (!response.summary || typeof response.summary !== 'string') errors.push('Missing or invalid summary');
    if (!Array.isArray(response.findings)) errors.push('findings must be an array');
    if (!Array.isArray(response.considerations)) errors.push('considerations must be an array');
    if (!Array.isArray(response.redFlags)) errors.push('redFlags must be an array');
    if (!Array.isArray(response.missingInformation)) errors.push('missingInformation must be an array');
    if (!Array.isArray(response.uncertainty)) errors.push('uncertainty must be an array');
    if (!Array.isArray(response.suggestedNextSteps)) errors.push('suggestedNextSteps must be an array');
    if (!Array.isArray(response.sourceReferences)) errors.push('sourceReferences must be an array');
    if (!response.provenance) errors.push('Missing provenance record');

    // Structural invariant validation
    if (response.isAutonomousMutationAllowed !== false) {
      errors.push('CRITICAL: isAutonomousMutationAllowed must be strictly false');
    }
    if (response.clinicianReviewRequired !== true) {
      errors.push('CRITICAL: clinicianReviewRequired must be strictly true');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitizes and verifies AI output against prompt injection and prohibited autonomous mutations.
   */
  public sanitizeAiOutput(output: string): { isSafe: boolean; reason?: string; sanitizedText?: string } {
    for (const pattern of PROHIBITED_MUTATION_PATTERNS) {
      if (pattern.test(output)) {
        return {
          isSafe: false,
          reason: `Autonomous clinical/supply chain mutation prohibited: ${pattern.toString()}`,
        };
      }
    }
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(output)) {
        return {
          isSafe: false,
          reason: `Prompt injection token detected in output: ${pattern.toString()}`,
        };
      }
    }
    return {
      isSafe: true,
      sanitizedText: output,
    };
  }
}

export const aiSafetyGateway = AISafetyGateway.getInstance();
