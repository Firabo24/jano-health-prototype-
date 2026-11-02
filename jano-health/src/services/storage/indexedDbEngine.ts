/**
 * Jano Health - IndexedDB Persistence Engine
 * 
 * Provides true browser-supported persistent database storage for core clinical entities,
 * append-only domain event ledgers, synchronization queues, conflicts, and audit trails.
 * Includes schema indexing for frequent clinical lookups (MRN, patient name, encounter date,
 * facility context, sync status, and event timestamps).
 */

import { DomainEvent } from '../../domain/persistence';
import { computeEventHash, deepFreeze, findAuthoritativeChainHead, validateEventChainIntegrity } from '../../domain/eventIntegrity';

const DB_NAME = 'JanoHealth_Clinical_v1';
const DB_VERSION = 25;

export type StoreName =
  | 'patients'
  | 'encounters'
  | 'vitals'
  | 'clinicalNotes'
  | 'problems'
  | 'diagnoses'
  | 'differentials'
  | 'clinicalAssessments'
  | 'medications'
  | 'medicationDefinitions'
  | 'medicationOrders'
  | 'prescriptions'
  | 'dispenseRecords'
  | 'inventoryItems'
  | 'inventoryBatches'
  | 'inventoryTransactions'
  | 'inventoryReceipts'
  | 'inventoryTransfers'
  | 'inventoryWastage'
  | 'pharmacyReviews'
  | 'medicationSafetyChecks'
  | 'allergies'
  | 'labOrders'
  | 'labSpecimens'
  | 'labResults'
  | 'radiologyOrders'
  | 'radiologyStudies'
  | 'radiologyReports'
  | 'criticalRadiologyFindings'
  | 'radiologyResults'
  | 'appointments'
  | 'referrals'
  | 'referralOutcomes'
  | 'referralCommunications'
  | 'emergencyCases'
  | 'emergencyTriages'
  | 'emergencyReassessments'
  | 'emergencyAlerts'
  | 'transportRequests'
  | 'aiRequests'
  | 'aiResponses'
  | 'aiReviews'
  | 'domainEvents'
  | 'syncQueue'
  | 'conflicts'
  | 'auditLog'
  | 'networkNodes'
  | 'networkPolicies'
  | 'networkMessages'
  | 'networkQuarantine'
  | 'networkDirectoryCache'
  | 'externalPatientIdentities'
  | 'networkTelemetry'
  | 'analyticalFacts'
  | 'metricDefinitions'
  | 'cohortDefinitions'
  | 'populationCohorts'
  | 'populationSignals'
  | 'demandForecasts'
  | 'dataQualityIssues'
  | 'publicHealthReports'
  | 'intelligenceReports'
  | 'populationTelemetry'
  | 'longitudinalIdentities'
  | 'identityEvidence'
  | 'identityResolutionDecisions'
  | 'patientConsents'
  | 'consentAuditEntries'
  | 'emergencyAccessRequests'
  | 'payers'
  | 'financingPrograms'
  | 'coverages'
  | 'eligibilityRequests'
  | 'authorizationRequests'
  | 'claims'
  | 'claimLines'
  | 'invoices'
  | 'payments'
  | 'financialEvents'
  | 'financialQuarantine'
  | 'workforceMembers'
  | 'workforceCredentials'
  | 'qualifications'
  | 'workforceFacilityAssignments'
  | 'careTeams'
  | 'careTeamMemberships'
  | 'dutyRosters'
  | 'shiftAssignments'
  | 'workforcePresence'
  | 'shiftHandovers'
  | 'workforceTasks'
  | 'taskEscalations'
  | 'workforceAvailability'
  | 'workforceLeave'
  | 'supervisionAssignments'
  | 'trainingRecords'
  | 'competencyRecords'
  | 'staffingRequirements'
  | 'staffingGaps'
  | 'supplyItems'
  | 'demandSignals'
  | 'requisitions'
  | 'requisitionLines'
  | 'purchaseRequests'
  | 'suppliers'
  | 'supplierContracts'
  | 'procurementApprovals'
  | 'purchaseOrders'
  | 'purchaseOrderLines'
  | 'shipments'
  | 'shipmentLines'
  | 'transportLegs'
  | 'deliveryCheckpoints'
  | 'goodsReceipts'
  | 'goodsReceiptLines'
  | 'warehouses'
  | 'storageLocations'
  | 'stockTransfers'
  | 'coldChainShipments'
  | 'temperatureLogs'
  | 'temperatureExcursions'
  | 'batchQualityHolds'
  | 'supplierQualityEvents'
  | 'recallNotices'
  | 'recallActions'
  | 'procurementForecasts'
  | 'replenishmentRecommendations'
  | 'supplyRisks'
  | 'supplyChainEvents'
  | 'researchStudies'
  | 'studyProtocols'
  | 'protocolVersions'
  | 'researchApprovals'
  | 'studySites'
  | 'studyTeamMembers'
  | 'researchSubjects'
  | 'researchEnrollments'
  | 'researchConsents'
  | 'researchWithdrawals'
  | 'researchMilestones'
  | 'researchCohorts'
  | 'researchCohortDefinitions'
  | 'researchDatasets'
  | 'researchDatasetVersions'
  | 'dataAccessRequests'
  | 'dataAccessDecisions'
  | 'dataUseRecords'
  | 'researchReIdentificationRequests'
  | 'studyVisits'
  | 'studyTasks'
  | 'researchEvents'
  | 'studyDeviations'
  | 'studySafetyEvents'
  | 'researchSpecimens'
  | 'studyMonitoringRecords'
  | 'statisticalAnalysisPlans'
  | 'studyOutcomeDefinitions'
  | 'evidenceVariables'
  | 'evidenceRecords'
  | 'citationRecords'
  | 'evidenceSources'
  | 'evidenceAssessments'
  | 'evidenceSyntheses'
  | 'learningCycles'
  | 'qualityImprovementProjects'
  | 'learningFindings'
  | 'practiceChangeProposals'
  | 'knowledgeArtifacts'
  | 'researchRetentionPolicies'
  | 'researchQuarantineItems'
  | 'researchOutputs'
  | 'studyEligibilityCandidates'
  | 'ecosystemSystems'
  | 'ecosystemServices'
  | 'ecosystemEndpoints'
  | 'ecosystemCapabilities'
  | 'ecosystemTrustProfiles'
  | 'nationalIntegrations'
  | 'nationalIntegrationProfiles'
  | 'nationalExchangePolicies'
  | 'nationalExchangeMessages'
  | 'nationalExchangeAttempts'
  | 'nationalExchangeAcknowledgements'
  | 'facilityRegistryReferences'
  | 'facilityRegistrySyncs'
  | 'facilityRegistryMappings'
  | 'facilityRegistryConflicts'
  | 'terminologySystems'
  | 'terminologyBindings'
  | 'terminologyMaps'
  | 'terminologyVersions'
  | 'terminologyConflicts'
  | 'nationalReportingProfiles'
  | 'reportingDatasets'
  | 'reportingSubmissions'
  | 'reportingResponses'
  | 'reportingCorrections'
  | 'nationalIdentityReferences'
  | 'identityVerificationRequests'
  | 'identityVerificationResponses'
  | 'surveillanceSignals'
  | 'surveillanceReports'
  | 'surveillanceSubmissions'
  | 'nationalIntegrationApprovals'
  | 'integrationCredentialReferences'
  | 'ecosystemQuarantineItems'
  | 'systemObservations'
  | 'systemHealthSnapshots'
  | 'crossDomainSignals'
  | 'intelligenceEvents'
  | 'intelligenceCorrelations'
  | 'systemRisks'
  | 'optimizationRecommendations'
  | 'automationRecommendations'
  | 'decisionContexts'
  | 'decisionEvidence'
  | 'humanApprovals'
  | 'automationPolicies'
  | 'automationRules'
  | 'automationActions'
  | 'automationGuards'
  | 'automationExecutions'
  | 'automationRollbacks'
  | 'automationBudgets'
  | 'syncHealingPlans'
  | 'integrationRecoveryPlans'
  | 'queueRecoveryPlans'
  | 'dataRepairProposals'
  | 'recoveryExecutions'
  | 'capacityStates'
  | 'capacityConstraints'
  | 'capacityBalancingRecommendations'
  | 'workflowOrchestrations'
  | 'workflowActions'
  | 'workflowCheckpoints'
  | 'workflowCompensations'
  | 'systemIncidents'
  | 'rootCauseAnalyses'
  | 'incidentResponsePlaybooks'
  | 'securityAutomationPolicies'
  | 'systemIntelligenceTelemetry'
  | 'simulationScenarios'
  | 'automationGovernancePolicies'
  | 'actionRiskClassifications'
  | 'automationPermissions'
  | 'automationAuditEntries'
  | 'deploymentEnvironments'
  | 'secretReferences'
  | 'configurationSnapshots'
  | 'featureFlags'
  | 'backupArchives'
  | 'backupVerifications'
  | 'restoreExecutions'
  | 'recoveryPoints'
  | 'disasterRecoveryPlans'
  | 'disasterRecoveryTests'
  | 'dataIntegrityAudits'
  | 'schemaMigrations'
  | 'deviceHealthRecords'
  | 'facilityDeploymentProfiles'
  | 'facilityOnboardingWorkflows'
  | 'pilotFacilities'
  | 'syntheticDataRecords'
  | 'dataImportJobs'
  | 'importQuarantineRecords'
  | 'operationalSupportCases'
  | 'operationalAlerts'
  | 'securityIncidents'
  | 'auditRetentionArchives'
  | 'maintenanceWindows'
  | 'trainingReadinessRecords'
  | 'pilotMetrics'
  | 'userFeedbackEntries'
  | 'changeRequests'
  | 'releaseRecords'
  | 'releaseArtifacts'
  | 'dependencySecurityReports'
  | 'incidentForensicTimelines'
  | 'supportDiagnosticBundles'
  | 'pilotGoLiveReports'
  | 'pilotReviews'
  | 'clinicalSafetyCases'
  | 'clinicalSafetyClaims'
  | 'clinicalSafetyEvidence'
  | 'clinicalHazards'
  | 'hazardRiskAssessments'
  | 'fmeaAnalyses'
  | 'workflowValidationMatrices'
  | 'clinicalSafetyScenarios'
  | 'aiValidationStudies'
  | 'aiEvaluationCases'
  | 'aiEvaluationResults'
  | 'clinicalEvidenceProvenance'
  | 'clinicalUsabilityStudies'
  | 'clinicalAlertGovernance'
  | 'clinicalSafetyIncidents'
  | 'clinicalCAPARecords'
  | 'clinicalValidationGates'
  | 'clinicalLimitations'
  | 'clinicalCompetencyRecords'
  | 'pilotValidationPackets'
  | 'pilotPrograms'
  | 'pilotSites'
  | 'pilotSiteAssessments'
  | 'pilotConfigurations'
  | 'pilotGoLiveGates'
  | 'pilotOperationalTelemetry'
  | 'pilotWorkflowMetrics'
  | 'pilotEvidenceArtifacts'
  | 'pilotSafetyIncidents'
  | 'pilotEscalations'
  | 'pilotKillSwitchEvents'
  | 'pilotAIGovernanceRecords'
  | 'pilotReleaseDeployments'
  | 'pilotChangeRequests'
  | 'pilotSupportCases'
  | 'pilotDataQualityAudits'
  | 'pilotTrainingRecords'
  | 'pilotUserFeedback'
  | 'pilotSiteReports'
  | 'evidencePrograms'
  | 'pilotSiteGroups'
  | 'siteEnrollments'
  | 'comparabilityAssessments'
  | 'standardizedMetricCatalog'
  | 'pilotMetricObservations'
  | 'normalizedMetricMeasurements'
  | 'comparativeAnalyses'
  | 'siteImplementationMaturities'
  | 'programRiskRegisters'
  | 'crossSiteIncidentCorrelations'
  | 'multiSiteConfigurationDrifts'
  | 'multiSiteAIEvaluations'
  | 'offlineConditionAnalyses'
  | 'pilotLearningRecords'
  | 'evidenceQualityRatings'
  | 'scaleDecisionRecords'
  | 'expansionGateEvaluations'
  | 'multiSiteEvidencePackets'
  | 'multiSiteUserFeedback'
  | 'tenants'
  | 'organizations'
  | 'organizationFacilities'
  | 'deploymentsMaster'
  | 'deploymentTemplates'
  | 'rolloutWaves'
  | 'edgeDevices'
  | 'topologyNodes'
  | 'capacityMetrics'
  | 'serviceHealthObservations'
  | 'supportCases'
  | 'customerAccounts'
  | 'commercialContracts'
  | 'commercialEntitlements'
  | 'implementationProjects'
  | 'migrationPackages'
  | 'externalSystemIntegrations'
  | 'securityOperations'
  | 'dataGovernancePolicies'
  | 'businessContinuityDrills'
  | 'operationalEconomics'
  | 'scaleReadinessPackets';

export const ALL_STORE_NAMES: StoreName[] = [
  'patients',
  'encounters',
  'vitals',
  'clinicalNotes',
  'problems',
  'diagnoses',
  'differentials',
  'clinicalAssessments',
  'medications',
  'medicationDefinitions',
  'medicationOrders',
  'prescriptions',
  'dispenseRecords',
  'inventoryItems',
  'inventoryBatches',
  'inventoryTransactions',
  'inventoryReceipts',
  'inventoryTransfers',
  'inventoryWastage',
  'pharmacyReviews',
  'medicationSafetyChecks',
  'allergies',
  'labOrders',
  'labSpecimens',
  'labResults',
  'radiologyOrders',
  'radiologyStudies',
  'radiologyReports',
  'criticalRadiologyFindings',
  'radiologyResults',
  'appointments',
  'referrals',
  'referralOutcomes',
  'referralCommunications',
  'emergencyCases',
  'emergencyTriages',
  'emergencyReassessments',
  'emergencyAlerts',
  'transportRequests',
  'aiRequests',
  'aiResponses',
  'aiReviews',
  'domainEvents',
  'syncQueue',
  'conflicts',
  'auditLog',
  'networkNodes',
  'networkPolicies',
  'networkMessages',
  'networkQuarantine',
  'networkDirectoryCache',
  'externalPatientIdentities',
  'networkTelemetry',
  'analyticalFacts',
  'metricDefinitions',
  'cohortDefinitions',
  'populationCohorts',
  'populationSignals',
  'demandForecasts',
  'dataQualityIssues',
  'publicHealthReports',
  'intelligenceReports',
  'populationTelemetry',
  'longitudinalIdentities',
  'identityEvidence',
  'identityResolutionDecisions',
  'patientConsents',
  'consentAuditEntries',
  'emergencyAccessRequests',
  'payers',
  'financingPrograms',
  'coverages',
  'eligibilityRequests',
  'authorizationRequests',
  'claims',
  'claimLines',
  'invoices',
  'payments',
  'financialEvents',
  'financialQuarantine',
  'workforceMembers',
  'workforceCredentials',
  'qualifications',
  'workforceFacilityAssignments',
  'careTeams',
  'careTeamMemberships',
  'dutyRosters',
  'shiftAssignments',
  'workforcePresence',
  'shiftHandovers',
  'workforceTasks',
  'taskEscalations',
  'workforceAvailability',
  'workforceLeave',
  'supervisionAssignments',
  'trainingRecords',
  'competencyRecords',
  'staffingRequirements',
  'staffingGaps',
  'supplyItems',
  'demandSignals',
  'requisitions',
  'requisitionLines',
  'purchaseRequests',
  'suppliers',
  'supplierContracts',
  'procurementApprovals',
  'purchaseOrders',
  'purchaseOrderLines',
  'shipments',
  'shipmentLines',
  'transportLegs',
  'deliveryCheckpoints',
  'goodsReceipts',
  'goodsReceiptLines',
  'warehouses',
  'storageLocations',
  'stockTransfers',
  'coldChainShipments',
  'temperatureLogs',
  'temperatureExcursions',
  'batchQualityHolds',
  'supplierQualityEvents',
  'recallNotices',
  'recallActions',
  'procurementForecasts',
  'replenishmentRecommendations',
  'supplyRisks',
  'supplyChainEvents',
  'researchStudies',
  'studyProtocols',
  'protocolVersions',
  'researchApprovals',
  'studySites',
  'studyTeamMembers',
  'researchSubjects',
  'researchEnrollments',
  'researchConsents',
  'researchWithdrawals',
  'researchMilestones',
  'researchCohorts',
  'researchCohortDefinitions',
  'researchDatasets',
  'researchDatasetVersions',
  'dataAccessRequests',
  'dataAccessDecisions',
  'dataUseRecords',
  'researchReIdentificationRequests',
  'studyVisits',
  'studyTasks',
  'researchEvents',
  'studyDeviations',
  'studySafetyEvents',
  'researchSpecimens',
  'studyMonitoringRecords',
  'statisticalAnalysisPlans',
  'studyOutcomeDefinitions',
  'evidenceVariables',
  'evidenceRecords',
  'citationRecords',
  'evidenceSources',
  'evidenceAssessments',
  'evidenceSyntheses',
  'learningCycles',
  'qualityImprovementProjects',
  'learningFindings',
  'practiceChangeProposals',
  'knowledgeArtifacts',
  'researchRetentionPolicies',
  'researchQuarantineItems',
  'researchOutputs',
  'studyEligibilityCandidates',
  'ecosystemSystems',
  'ecosystemServices',
  'ecosystemEndpoints',
  'ecosystemCapabilities',
  'ecosystemTrustProfiles',
  'nationalIntegrations',
  'nationalIntegrationProfiles',
  'nationalExchangePolicies',
  'nationalExchangeMessages',
  'nationalExchangeAttempts',
  'nationalExchangeAcknowledgements',
  'facilityRegistryReferences',
  'facilityRegistrySyncs',
  'facilityRegistryMappings',
  'facilityRegistryConflicts',
  'terminologySystems',
  'terminologyBindings',
  'terminologyMaps',
  'terminologyVersions',
  'terminologyConflicts',
  'nationalReportingProfiles',
  'reportingDatasets',
  'reportingSubmissions',
  'reportingResponses',
  'reportingCorrections',
  'nationalIdentityReferences',
  'identityVerificationRequests',
  'identityVerificationResponses',
  'surveillanceSignals',
  'surveillanceReports',
  'surveillanceSubmissions',
  'nationalIntegrationApprovals',
  'integrationCredentialReferences',
  'ecosystemQuarantineItems',
  'systemObservations',
  'systemHealthSnapshots',
  'crossDomainSignals',
  'intelligenceEvents',
  'intelligenceCorrelations',
  'systemRisks',
  'optimizationRecommendations',
  'automationRecommendations',
  'decisionContexts',
  'decisionEvidence',
  'humanApprovals',
  'automationPolicies',
  'automationRules',
  'automationActions',
  'automationGuards',
  'automationExecutions',
  'automationRollbacks',
  'automationBudgets',
  'syncHealingPlans',
  'integrationRecoveryPlans',
  'queueRecoveryPlans',
  'dataRepairProposals',
  'recoveryExecutions',
  'capacityStates',
  'capacityConstraints',
  'capacityBalancingRecommendations',
  'workflowOrchestrations',
  'workflowActions',
  'workflowCheckpoints',
  'workflowCompensations',
  'systemIncidents',
  'rootCauseAnalyses',
  'incidentResponsePlaybooks',
  'securityAutomationPolicies',
  'systemIntelligenceTelemetry',
  'simulationScenarios',
  'automationGovernancePolicies',
  'actionRiskClassifications',
  'automationPermissions',
  'automationAuditEntries',
  'deploymentEnvironments',
  'secretReferences',
  'configurationSnapshots',
  'featureFlags',
  'backupArchives',
  'backupVerifications',
  'restoreExecutions',
  'recoveryPoints',
  'disasterRecoveryPlans',
  'disasterRecoveryTests',
  'dataIntegrityAudits',
  'schemaMigrations',
  'deviceHealthRecords',
  'facilityDeploymentProfiles',
  'facilityOnboardingWorkflows',
  'pilotFacilities',
  'syntheticDataRecords',
  'dataImportJobs',
  'importQuarantineRecords',
  'operationalSupportCases',
  'operationalAlerts',
  'securityIncidents',
  'auditRetentionArchives',
  'maintenanceWindows',
  'trainingReadinessRecords',
  'pilotMetrics',
  'userFeedbackEntries',
  'changeRequests',
  'releaseRecords',
  'releaseArtifacts',
  'dependencySecurityReports',
  'incidentForensicTimelines',
  'supportDiagnosticBundles',
  'pilotGoLiveReports',
  'pilotReviews',
  'clinicalSafetyCases',
  'clinicalSafetyClaims',
  'clinicalSafetyEvidence',
  'clinicalHazards',
  'hazardRiskAssessments',
  'fmeaAnalyses',
  'workflowValidationMatrices',
  'clinicalSafetyScenarios',
  'aiValidationStudies',
  'aiEvaluationCases',
  'aiEvaluationResults',
  'clinicalEvidenceProvenance',
  'clinicalUsabilityStudies',
  'clinicalAlertGovernance',
  'clinicalSafetyIncidents',
  'clinicalCAPARecords',
  'clinicalValidationGates',
  'clinicalLimitations',
  'clinicalCompetencyRecords',
  'pilotValidationPackets',
  'pilotPrograms',
  'pilotSites',
  'pilotSiteAssessments',
  'pilotConfigurations',
  'pilotGoLiveGates',
  'pilotOperationalTelemetry',
  'pilotWorkflowMetrics',
  'pilotEvidenceArtifacts',
  'pilotSafetyIncidents',
  'pilotEscalations',
  'pilotKillSwitchEvents',
  'pilotAIGovernanceRecords',
  'pilotReleaseDeployments',
  'pilotChangeRequests',
  'pilotSupportCases',
  'pilotDataQualityAudits',
  'pilotTrainingRecords',
  'pilotUserFeedback',
  'pilotSiteReports',
  'evidencePrograms',
  'pilotSiteGroups',
  'siteEnrollments',
  'comparabilityAssessments',
  'standardizedMetricCatalog',
  'pilotMetricObservations',
  'normalizedMetricMeasurements',
  'comparativeAnalyses',
  'siteImplementationMaturities',
  'programRiskRegisters',
  'crossSiteIncidentCorrelations',
  'multiSiteConfigurationDrifts',
  'multiSiteAIEvaluations',
  'offlineConditionAnalyses',
  'pilotLearningRecords',
  'evidenceQualityRatings',
  'scaleDecisionRecords',
  'expansionGateEvaluations',
  'multiSiteEvidencePackets',
  'multiSiteUserFeedback',
  'tenants',
  'organizations',
  'organizationFacilities',
  'deploymentsMaster',
  'deploymentTemplates',
  'rolloutWaves',
  'edgeDevices',
  'topologyNodes',
  'capacityMetrics',
  'serviceHealthObservations',
  'supportCases',
  'customerAccounts',
  'commercialContracts',
  'commercialEntitlements',
  'implementationProjects',
  'migrationPackages',
  'externalSystemIntegrations',
  'securityOperations',
  'dataGovernancePolicies',
  'businessContinuityDrills',
  'operationalEconomics',
  'scaleReadinessPackets',
];

/**
 * Checks if a value is a valid non-empty IndexedDB key.
 */
export function isValidIdbKey(val: any): boolean {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'string' && val.trim().length > 0) return true;
  if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return true;
  if (val instanceof Date && !isNaN(val.getTime())) return true;
  if (Array.isArray(val)) return val.length > 0 && val.every(isValidIdbKey);
  return false;
}

// Canonical primary key candidate fields mapped by store name
export const STORE_PRIMARY_KEYS: Record<string, string[]> = {
  patients: ['id', 'patientId', 'mrn'],
  encounters: ['id', 'encounterId'],
  vitals: ['id', 'vitalId'],
  clinicalNotes: ['id', 'noteId'],
  problems: ['id', 'problemId'],
  diagnoses: ['id', 'diagnosisId'],
  differentials: ['id', 'differentialId'],
  clinicalAssessments: ['id', 'assessmentId'],
  medications: ['id', 'medicationId'],
  medicationDefinitions: ['id', 'definitionId', 'code'],
  medicationOrders: ['id', 'orderId', 'orderNumber'],
  prescriptions: ['id', 'prescriptionId', 'prescriptionNumber'],
  dispenseRecords: ['id', 'dispenseId', 'dispenseNumber'],
  inventoryItems: ['id', 'itemId', 'medicationCode'],
  inventoryBatches: ['id', 'batchId', 'batchNumber'],
  inventoryTransactions: ['id', 'transactionId'],
  inventoryReceipts: ['id', 'receiptId', 'receiptNumber'],
  inventoryTransfers: ['id', 'transferId', 'transferNumber'],
  inventoryWastage: ['id', 'wastageId'],
  pharmacyReviews: ['id', 'reviewId'],
  medicationSafetyChecks: ['id', 'checkId'],
  allergies: ['id', 'allergyId'],
  labOrders: ['id', 'orderId'],
  labSpecimens: ['id', 'specimenId', 'accessionNumber'],
  labResults: ['id', 'resultId'],
  radiologyOrders: ['id', 'orderId', 'orderNumber'],
  radiologyStudies: ['id', 'studyId', 'accessionNumber', 'studyNumber'],
  radiologyReports: ['id', 'reportId'],
  criticalRadiologyFindings: ['id', 'findingId'],
  radiologyResults: ['id', 'resultId'],
  appointments: ['id', 'appointmentId'],
  referrals: ['id', 'referralId'],
  referralOutcomes: ['id', 'outcomeId'],
  referralCommunications: ['id', 'communicationId'],
  emergencyCases: ['id', 'caseId', 'emergencyCaseId'],
  emergencyTriages: ['id', 'triageId'],
  emergencyReassessments: ['id', 'reassessmentId'],
  emergencyAlerts: ['id', 'alertId'],
  transportRequests: ['id', 'requestId'],
  aiRequests: ['id', 'requestId'],
  aiResponses: ['id', 'responseId'],
  aiReviews: ['id', 'reviewId'],
  domainEvents: ['eventId', 'id'],
  syncQueue: ['id', 'eventId'],
  conflicts: ['conflictId', 'id'],
  auditLog: ['id', 'auditId', 'eventId'],
  networkNodes: ['nodeId', 'id'],
  networkPolicies: ['policyId', 'id'],
  networkMessages: ['messageId', 'id'],
  networkQuarantine: ['id', 'quarantineId'],
  networkDirectoryCache: ['facilityId', 'id'],
  externalPatientIdentities: ['id', 'externalIdentityId'],
  networkTelemetry: ['id', 'telemetryId'],
  analyticalFacts: ['factId', 'id'],
  metricDefinitions: ['metricId', 'id'],
  cohortDefinitions: ['cohortId', 'id'],
  populationCohorts: ['cohortId', 'id'],
  populationSignals: ['signalId', 'id'],
  demandForecasts: ['forecastId', 'id'],
  dataQualityIssues: ['issueId', 'id'],
  publicHealthReports: ['packageId', 'id'],
  intelligenceReports: ['reportId', 'id'],
  populationTelemetry: ['id', 'telemetryId'],
  longitudinalIdentities: ['patientId', 'identityId', 'id'],
  identityEvidence: ['evidenceId', 'id'],
  identityResolutionDecisions: ['decisionId', 'id'],
  patientConsents: ['consentId', 'id'],
  consentAuditEntries: ['id', 'consentId'],
  emergencyAccessRequests: ['requestId', 'id'],
  payers: ['payerId', 'id'],
  financingPrograms: ['programId', 'id'],
  coverages: ['coverageId', 'id'],
  eligibilityRequests: ['checkId', 'id'],
  authorizationRequests: ['authorizationId', 'id'],
  claims: ['claimId', 'id'],
  claimLines: ['lineId', 'id'],
  invoices: ['invoiceId', 'id'],
  payments: ['paymentId', 'id'],
  financialEvents: ['eventId', 'id', 'patientId'],
  financialQuarantine: ['quarantineId', 'id', 'patientId'],
  workforceMembers: ['workforceMemberId', 'id', 'patientId'],
  workforceCredentials: ['credentialId', 'id', 'patientId'],
  qualifications: ['qualificationId', 'id', 'patientId'],
  workforceFacilityAssignments: ['assignmentId', 'id', 'patientId'],
  careTeams: ['careTeamId', 'id', 'patientId'],
  careTeamMemberships: ['membershipId', 'id', 'patientId'],
  dutyRosters: ['rosterId', 'id', 'patientId'],
  shiftAssignments: ['shiftId', 'id', 'patientId'],
  workforcePresence: ['presenceId', 'id', 'patientId'],
  shiftHandovers: ['handoverId', 'id', 'patientId'],
  workforceTasks: ['taskId', 'id', 'patientId'],
  taskEscalations: ['escalationId', 'id', 'patientId'],
  workforceAvailability: ['availabilityId', 'id', 'patientId'],
  workforceLeave: ['leaveId', 'id', 'patientId'],
  supervisionAssignments: ['supervisionId', 'id', 'patientId'],
  trainingRecords: ['trainingId', 'id', 'patientId'],
  competencyRecords: ['competencyId', 'id', 'patientId'],
  staffingRequirements: ['requirementId', 'id', 'patientId'],
  staffingGaps: ['gapId', 'id', 'patientId'],
  supplyItems: ['supplyItemId', 'id', 'patientId'],
  demandSignals: ['demandSignalId', 'id', 'patientId'],
  requisitions: ['requisitionId', 'id', 'patientId'],
  requisitionLines: ['requisitionLineId', 'lineId', 'id', 'patientId'],
  purchaseRequests: ['purchaseRequestId', 'id', 'patientId'],
  suppliers: ['supplierId', 'id', 'patientId'],
  supplierContracts: ['contractId', 'id', 'patientId'],
  procurementApprovals: ['approvalId', 'id', 'patientId'],
  purchaseOrders: ['purchaseOrderId', 'id', 'patientId'],
  purchaseOrderLines: ['lineId', 'id', 'patientId'],
  shipments: ['shipmentId', 'id', 'patientId'],
  shipmentLines: ['lineId', 'id', 'patientId'],
  transportLegs: ['legId', 'id', 'patientId'],
  deliveryCheckpoints: ['checkpointId', 'id', 'patientId'],
  goodsReceipts: ['goodsReceiptId', 'id', 'patientId'],
  goodsReceiptLines: ['lineId', 'id', 'patientId'],
  warehouses: ['warehouseId', 'id', 'patientId'],
  storageLocations: ['locationId', 'id', 'patientId'],
  stockTransfers: ['transferId', 'id', 'patientId'],
  coldChainShipments: ['shipmentId', 'id', 'patientId'],
  temperatureLogs: ['logId', 'id', 'patientId'],
  temperatureExcursions: ['excursionId', 'id', 'patientId'],
  batchQualityHolds: ['holdId', 'id', 'patientId'],
  supplierQualityEvents: ['eventId', 'id', 'patientId'],
  recallNotices: ['recallId', 'id', 'patientId'],
  recallActions: ['actionId', 'id', 'patientId'],
  procurementForecasts: ['forecastId', 'id', 'patientId'],
  replenishmentRecommendations: ['recommendationId', 'id', 'patientId'],
  supplyRisks: ['riskId', 'id', 'patientId'],
  supplyChainEvents: ['eventId', 'id', 'patientId'],
  researchStudies: ['researchStudyId', 'id', 'patientId'],
  studyProtocols: ['protocolId', 'id', 'patientId'],
  protocolVersions: ['versionId', 'id', 'patientId'],
  researchApprovals: ['approvalId', 'id', 'patientId'],
  studySites: ['studySiteId', 'id', 'patientId'],
  studyTeamMembers: ['studyTeamMemberId', 'id', 'patientId'],
  researchSubjects: ['researchSubjectId', 'id', 'patientId'],
  researchEnrollments: ['enrollmentId', 'id', 'patientId'],
  researchConsents: ['researchConsentId', 'id', 'patientId'],
  researchWithdrawals: ['withdrawalId', 'id', 'patientId'],
  researchMilestones: ['milestoneId', 'id', 'patientId'],
  researchCohorts: ['cohortId', 'id', 'patientId'],
  researchCohortDefinitions: ['definitionId', 'id', 'patientId'],
  researchDatasets: ['datasetId', 'id', 'patientId'],
  researchDatasetVersions: ['versionId', 'id', 'patientId'],
  dataAccessRequests: ['requestId', 'id', 'patientId'],
  dataAccessDecisions: ['decisionId', 'id', 'patientId'],
  dataUseRecords: ['recordId', 'id', 'patientId'],
  researchReIdentificationRequests: ['reIdentifyRequestId', 'id', 'patientId'],
  studyVisits: ['studyVisitId', 'id', 'patientId'],
  studyTasks: ['studyTaskId', 'id', 'patientId'],
  researchEvents: ['eventId', 'id', 'patientId'],
  studyDeviations: ['deviationId', 'id', 'patientId'],
  studySafetyEvents: ['safetyEventId', 'id', 'patientId'],
  researchSpecimens: ['researchSpecimenId', 'id', 'patientId'],
  studyMonitoringRecords: ['monitoringId', 'id', 'patientId'],
  statisticalAnalysisPlans: ['planId', 'id', 'patientId'],
  studyOutcomeDefinitions: ['outcomeId', 'id', 'patientId'],
  evidenceVariables: ['variableId', 'id', 'patientId'],
  evidenceRecords: ['evidenceId', 'id', 'patientId'],
  citationRecords: ['citationId', 'id', 'patientId'],
  evidenceSources: ['sourceId', 'id', 'patientId'],
  evidenceAssessments: ['assessmentId', 'id', 'patientId'],
  evidenceSyntheses: ['synthesisId', 'id', 'patientId'],
  learningCycles: ['cycleId', 'id', 'patientId'],
  qualityImprovementProjects: ['projectId', 'id', 'patientId'],
  learningFindings: ['findingId', 'id', 'patientId'],
  practiceChangeProposals: ['proposalId', 'id', 'patientId'],
  knowledgeArtifacts: ['artifactId', 'id', 'patientId'],
  researchRetentionPolicies: ['policyId', 'id', 'patientId'],
  researchQuarantineItems: ['quarantineId', 'id', 'patientId'],
  researchOutputs: ['outputId', 'id', 'patientId'],
  studyEligibilityCandidates: ['candidateId', 'id', 'patientId'],
  ecosystemSystems: ['systemId', 'id', 'patientId'],
  ecosystemServices: ['serviceId', 'id', 'patientId'],
  ecosystemEndpoints: ['endpointId', 'id', 'patientId'],
  ecosystemCapabilities: ['capabilityId', 'id', 'patientId'],
  ecosystemTrustProfiles: ['profileId', 'id', 'patientId'],
  nationalIntegrations: ['integrationId', 'id', 'patientId'],
  nationalIntegrationProfiles: ['profileId', 'id', 'patientId'],
  nationalExchangePolicies: ['policyId', 'id', 'patientId'],
  nationalExchangeMessages: ['messageId', 'id', 'patientId'],
  nationalExchangeAttempts: ['attemptId', 'id', 'patientId'],
  nationalExchangeAcknowledgements: ['acknowledgementId', 'id', 'patientId'],
  facilityRegistryReferences: ['referenceId', 'mfrFacilityId', 'id', 'patientId'],
  facilityRegistrySyncs: ['syncId', 'id', 'patientId'],
  facilityRegistryMappings: ['mappingId', 'id', 'patientId'],
  facilityRegistryConflicts: ['conflictId', 'id', 'patientId'],
  terminologySystems: ['systemId', 'id', 'patientId'],
  terminologyBindings: ['bindingId', 'id', 'patientId'],
  terminologyMaps: ['mapId', 'id', 'patientId'],
  terminologyVersions: ['versionId', 'id', 'patientId'],
  terminologyConflicts: ['conflictId', 'id', 'patientId'],
  nationalReportingProfiles: ['profileId', 'id', 'patientId'],
  reportingDatasets: ['datasetId', 'id', 'patientId'],
  reportingSubmissions: ['submissionId', 'id', 'patientId'],
  reportingResponses: ['responseId', 'id', 'patientId'],
  reportingCorrections: ['correctionId', 'id', 'patientId'],
  nationalIdentityReferences: ['referenceId', 'id', 'patientId'],
  identityVerificationRequests: ['requestId', 'id', 'patientId'],
  identityVerificationResponses: ['responseId', 'id', 'patientId'],
  surveillanceSignals: ['signalId', 'id', 'patientId'],
  surveillanceReports: ['reportId', 'id', 'patientId'],
  surveillanceSubmissions: ['submissionId', 'id', 'patientId'],
  nationalIntegrationApprovals: ['approvalId', 'id', 'patientId'],
  integrationCredentialReferences: ['credentialId', 'id', 'patientId'],
  ecosystemQuarantineItems: ['quarantineId', 'id', 'patientId'],
  systemObservations: ['observationId', 'id', 'patientId'],
  systemHealthSnapshots: ['snapshotId', 'id', 'patientId'],
  crossDomainSignals: ['signalId', 'id', 'patientId'],
  intelligenceEvents: ['eventId', 'id', 'patientId'],
  intelligenceCorrelations: ['correlationId', 'id', 'patientId'],
  systemRisks: ['riskId', 'id', 'patientId'],
  optimizationRecommendations: ['recommendationId', 'id', 'patientId'],
  automationRecommendations: ['recommendationId', 'id', 'patientId'],
  decisionContexts: ['contextId', 'id', 'patientId'],
  decisionEvidence: ['evidenceId', 'id', 'patientId'],
  humanApprovals: ['approvalId', 'id', 'patientId'],
  automationPolicies: ['policyId', 'id', 'patientId'],
  automationRules: ['ruleId', 'id', 'patientId'],
  automationActions: ['actionId', 'id', 'patientId'],
  automationGuards: ['guardId', 'id', 'patientId'],
  automationExecutions: ['executionId', 'id', 'patientId'],
  automationRollbacks: ['rollbackId', 'id', 'patientId'],
  automationBudgets: ['budgetId', 'id', 'patientId'],
  syncHealingPlans: ['planId', 'id', 'patientId'],
  integrationRecoveryPlans: ['planId', 'id', 'patientId'],
  queueRecoveryPlans: ['planId', 'id', 'patientId'],
  dataRepairProposals: ['proposalId', 'id', 'patientId'],
  recoveryExecutions: ['recoveryExecutionId', 'id', 'patientId'],
  capacityStates: ['stateId', 'id', 'patientId'],
  capacityConstraints: ['constraintId', 'id', 'patientId'],
  capacityBalancingRecommendations: ['recommendationId', 'id', 'patientId'],
  workflowOrchestrations: ['orchestrationId', 'id', 'patientId'],
  workflowActions: ['actionId', 'id', 'patientId'],
  workflowCheckpoints: ['checkpointId', 'id', 'patientId'],
  workflowCompensations: ['compensationId', 'id', 'patientId'],
  systemIncidents: ['incidentId', 'id', 'patientId'],
  rootCauseAnalyses: ['analysisId', 'id', 'patientId'],
  incidentResponsePlaybooks: ['playbookId', 'id', 'patientId'],
  securityAutomationPolicies: ['policyId', 'id', 'patientId'],
  systemIntelligenceTelemetry: ['telemetryId', 'id', 'patientId'],
  simulationScenarios: ['scenarioId', 'id', 'patientId'],
  automationGovernancePolicies: ['policyId', 'id', 'patientId'],
  actionRiskClassifications: ['classificationId', 'id', 'patientId'],
  automationPermissions: ['permissionId', 'id', 'patientId'],
  automationAuditEntries: ['auditId', 'id', 'patientId'],
  deploymentEnvironments: ['environment', 'id', 'patientId'],
  secretReferences: ['secretId', 'id', 'patientId'],
  configurationSnapshots: ['snapshotId', 'id', 'patientId'],
  featureFlags: ['flagId', 'id', 'patientId'],
  backupArchives: ['backupId', 'id', 'patientId'],
  backupVerifications: ['verificationId', 'id', 'patientId'],
  restoreExecutions: ['restoreId', 'id', 'patientId'],
  recoveryPoints: ['pointId', 'id', 'patientId'],
  disasterRecoveryPlans: ['planId', 'id', 'patientId'],
  disasterRecoveryTests: ['testId', 'id', 'patientId'],
  dataIntegrityAudits: ['auditId', 'id', 'patientId'],
  schemaMigrations: ['migrationId', 'id', 'patientId'],
  deviceHealthRecords: ['deviceId', 'id', 'patientId'],
  facilityDeploymentProfiles: ['facilityId', 'id', 'patientId'],
  facilityOnboardingWorkflows: ['workflowId', 'id', 'patientId'],
  pilotFacilities: ['pilotId', 'id', 'patientId'],
  syntheticDataRecords: ['syntheticRecordId', 'id', 'patientId'],
  dataImportJobs: ['jobId', 'id', 'patientId'],
  importQuarantineRecords: ['quarantineId', 'id', 'patientId'],
  operationalSupportCases: ['caseId', 'id', 'patientId'],
  operationalAlerts: ['alertId', 'id', 'patientId'],
  securityIncidents: ['incidentId', 'id', 'patientId'],
  auditRetentionArchives: ['archiveId', 'id', 'patientId'],
  maintenanceWindows: ['windowId', 'id', 'patientId'],
  trainingReadinessRecords: ['trainingId', 'id', 'patientId'],
  pilotMetrics: ['metricId', 'id', 'patientId'],
  userFeedbackEntries: ['feedbackId', 'id', 'patientId'],
  changeRequests: ['requestId', 'id', 'patientId'],
  releaseRecords: ['releaseId', 'id', 'patientId'],
  releaseArtifacts: ['artifactId', 'id', 'patientId'],
  dependencySecurityReports: ['reportId', 'id', 'patientId'],
  incidentForensicTimelines: ['eventId', 'id', 'patientId'],
  supportDiagnosticBundles: ['bundleId', 'id', 'patientId'],
  pilotGoLiveReports: ['reportId', 'id', 'patientId'],
  pilotReviews: ['reviewId', 'id', 'patientId'],
  clinicalSafetyCases: ['caseId', 'id', 'patientId'],
  clinicalSafetyClaims: ['claimId', 'id', 'patientId'],
  clinicalSafetyEvidence: ['evidenceId', 'id', 'patientId'],
  clinicalHazards: ['hazardId', 'id', 'patientId'],
  hazardRiskAssessments: ['assessmentId', 'id', 'patientId'],
  fmeaAnalyses: ['fmeaId', 'id', 'patientId'],
  workflowValidationMatrices: ['workflowId', 'id', 'patientId'],
  clinicalSafetyScenarios: ['scenarioId', 'id', 'patientId'],
  aiValidationStudies: ['studyId', 'id', 'patientId'],
  aiEvaluationCases: ['caseId', 'id', 'patientId'],
  aiEvaluationResults: ['resultId', 'id', 'patientId'],
  clinicalEvidenceProvenance: ['evidenceId', 'id', 'patientId'],
  clinicalUsabilityStudies: ['studyId', 'id', 'patientId'],
  clinicalAlertGovernance: ['ruleId', 'id', 'patientId'],
  clinicalSafetyIncidents: ['incidentId', 'id', 'patientId'],
  clinicalCAPARecords: ['capaId', 'id', 'patientId'],
  clinicalValidationGates: ['gateId', 'id', 'patientId'],
  clinicalLimitations: ['limitationId', 'id', 'patientId'],
  clinicalCompetencyRecords: ['recordId', 'id', 'patientId'],
  pilotValidationPackets: ['packetId', 'id', 'patientId'],
  pilotPrograms: ['programId', 'id', 'patientId'],
  pilotSites: ['siteId', 'id', 'patientId'],
  pilotSiteAssessments: ['assessmentId', 'id', 'patientId'],
  pilotConfigurations: ['configId', 'id', 'patientId'],
  pilotGoLiveGates: ['gateId', 'id', 'patientId'],
  pilotOperationalTelemetry: ['telemetryId', 'id', 'patientId'],
  pilotWorkflowMetrics: ['metricId', 'id', 'patientId'],
  pilotEvidenceArtifacts: ['artifactId', 'id', 'patientId'],
  pilotSafetyIncidents: ['incidentId', 'id', 'patientId'],
  pilotEscalations: ['escalationId', 'id', 'patientId'],
  pilotKillSwitchEvents: ['eventId', 'id', 'patientId'],
  pilotAIGovernanceRecords: ['recordId', 'id', 'patientId'],
  pilotReleaseDeployments: ['deploymentId', 'id', 'patientId'],
  pilotChangeRequests: ['requestId', 'id', 'patientId'],
  pilotSupportCases: ['caseId', 'id', 'patientId'],
  pilotDataQualityAudits: ['auditId', 'id', 'patientId'],
  pilotTrainingRecords: ['trainingId', 'id', 'patientId'],
  pilotUserFeedback: ['feedbackId', 'id', 'patientId'],
  pilotSiteReports: ['reportId', 'id', 'patientId'],
  evidencePrograms: ['programId', 'id', 'patientId'],
  pilotSiteGroups: ['groupId', 'id', 'patientId'],
  siteEnrollments: ['enrollmentId', 'id', 'patientId'],
  comparabilityAssessments: ['assessmentId', 'id', 'patientId'],
  standardizedMetricCatalog: ['metricId', 'id', 'patientId'],
  pilotMetricObservations: ['observationId', 'id', 'patientId'],
  normalizedMetricMeasurements: ['measurementId', 'id', 'patientId'],
  comparativeAnalyses: ['analysisId', 'id', 'patientId'],
  siteImplementationMaturities: ['maturityId', 'id', 'patientId'],
  programRiskRegisters: ['riskId', 'id', 'patientId'],
  crossSiteIncidentCorrelations: ['correlationId', 'id', 'patientId'],
  multiSiteConfigurationDrifts: ['driftId', 'id', 'patientId'],
  multiSiteAIEvaluations: ['evaluationId', 'id', 'patientId'],
  offlineConditionAnalyses: ['analysisId', 'id', 'patientId'],
  pilotLearningRecords: ['learningId', 'id', 'patientId'],
  evidenceQualityRatings: ['ratingId', 'id', 'patientId'],
  scaleDecisionRecords: ['decisionId', 'id', 'patientId'],
  expansionGateEvaluations: ['gateId', 'id', 'patientId'],
  multiSiteEvidencePackets: ['packetId', 'id', 'patientId'],
  multiSiteUserFeedback: ['feedbackId', 'id', 'patientId'],
  tenants: ['tenantId', 'id'],
  organizations: ['organizationId', 'id'],
  organizationFacilities: ['facilityId', 'id'],
  deploymentsMaster: ['deploymentId', 'id'],
  deploymentTemplates: ['templateId', 'id'],
  rolloutWaves: ['waveId', 'id'],
  edgeDevices: ['deviceId', 'id'],
  topologyNodes: ['nodeId', 'id'],
  capacityMetrics: ['observationId', 'id'],
  serviceHealthObservations: ['healthId', 'id'],
  supportCases: ['caseId', 'id'],
  customerAccounts: ['accountId', 'id'],
  commercialContracts: ['contractId', 'id'],
  commercialEntitlements: ['entitlementId', 'id'],
  implementationProjects: ['projectId', 'id'],
  migrationPackages: ['migrationId', 'id'],
  externalSystemIntegrations: ['integrationId', 'id'],
  securityOperations: ['findingId', 'id'],
  dataGovernancePolicies: ['policyId', 'id'],
  businessContinuityDrills: ['drillId', 'id'],
  operationalEconomics: ['costId', 'id'],
  scaleReadinessPackets: ['packetId', 'id'],
};

/**
 * Extracts a candidate primary key from an entity, prioritizing store-specific keys,
 * then standard identity fields, and falling back to a deterministic or random key.
 */
export function extractItemKey(item: any, storeName?: string): string {
  if (!item || typeof item !== 'object') {
    return storeName ? `${storeName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` : `id_${Date.now()}`;
  }

  // 1. Check store-specific candidates
  if (storeName && STORE_PRIMARY_KEYS[storeName]) {
    for (const field of STORE_PRIMARY_KEYS[storeName]) {
      if (isValidIdbKey(item[field])) {
        return String(item[field]);
      }
    }
  }

  // 2. Check standard entity ID fields
  const standardFields = [
    'id',
    'eventId',
    'patientId',
    'claimId',
    'invoiceId',
    'paymentId',
    'quarantineId',
    'consentId',
    'requestId',
    'coverageId',
    'authorizationId',
    'evidenceId',
    'decisionId',
    'conflictId',
    'nodeId',
    'policyId',
    'messageId',
    'orderId',
    'studyId',
    'factId',
    'metricId',
    'cohortId',
    'signalId',
    'forecastId',
    'issueId',
    'packageId',
    'reportId',
    'telemetryId',
    'mrn',
    'observationId',
    'snapshotId',
    'contextId',
    'guardId',
    'executionId',
    'rollbackId',
    'budgetId',
    'planId',
    'proposalId',
    'recoveryExecutionId',
    'stateId',
    'constraintId',
    'orchestrationId',
    'actionId',
    'checkpointId',
    'compensationId',
    'incidentId',
    'analysisId',
    'playbookId',
    'scenarioId',
    'classificationId',
    'permissionId',
    'auditId',
  ];

  for (const field of standardFields) {
    if (isValidIdbKey(item[field])) {
      return String(item[field]);
    }
  }

  return storeName
    ? `${storeName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    : `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Normalizes an entity before saving to IndexedDB so that whatever keyPath
 * the object store expects in the browser (e.g. 'id', 'eventId', 'patientId', 'claimId', compound, etc.)
 * is unconditionally populated with a valid key.
 *
 * This completely prevents the IndexedDB DOMException:
 * "Failed to execute 'put' on 'IDBObjectStore': Evaluating the object store's key path did not yield a value."
 */
export function normalizeItemForStore<T extends Record<string, any>>(
  store: IDBObjectStore,
  item: T,
  storeName?: string
): T {
  if (!item || typeof item !== 'object') return item;

  // Always create a shallow clone to avoid mutating caller object or failing on frozen/sealed objects
  const target: any = { ...item };
  const key = extractItemKey(item, storeName);

  // 1. Always ensure 'id' is populated with a valid key
  if (!isValidIdbKey(target.id)) {
    target.id = key;
  }

  // 2. Populate all known primary key aliases for this store
  if (storeName && STORE_PRIMARY_KEYS[storeName]) {
    for (const field of STORE_PRIMARY_KEYS[storeName]) {
      if (!isValidIdbKey(target[field])) {
        target[field] = key;
      }
    }
  }

  // 3. Populate whatever store.keyPath the actual object store expects
  const keyPath = store.keyPath;
  if (typeof keyPath === 'string' && keyPath.length > 0) {
    if (keyPath.includes('.')) {
      // Dotted path: e.g. "metadata.id"
      const parts = keyPath.split('.');
      let cur = target;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
          cur[parts[i]] = {};
        }
        cur = cur[parts[i]];
      }
      const last = parts[parts.length - 1];
      if (!isValidIdbKey(cur[last])) {
        cur[last] = key;
      }
    } else {
      if (!isValidIdbKey(target[keyPath])) {
        target[keyPath] = key;
      }
    }
  } else if (keyPath && (Array.isArray(keyPath) || (typeof keyPath === 'object' && 'length' in (keyPath as any)))) {
    // Compound keyPath
    for (let i = 0; i < (keyPath as any).length; i++) {
      const kp = (keyPath as any)[i];
      if (typeof kp === 'string' && kp.length > 0) {
        if (!isValidIdbKey(target[kp])) {
          target[kp] = `${key}_${i}`;
        }
      }
    }
  }

  return target as T;
}

export interface TransactionPrecondition {
  store: StoreName;
  key: string;
  expectedVersion?: number;
  predicate?: (currentRecord: any) => boolean;
  errorMessage?: string;
}

export interface ITransactionContext {
  put<T extends Record<string, any>>(storeName: StoreName, item: T): Promise<void>;
  get<T>(storeName: StoreName, key: string): Promise<T | undefined>;
  delete(storeName: StoreName, key: string): Promise<void>;
  assertPrecondition(precondition: TransactionPrecondition): void;
}

export type DomainEventCommitListener = (event: DomainEvent) => void;
const domainEventCommitListeners = new Set<DomainEventCommitListener>();

export function registerDomainEventCommitListener(listener: DomainEventCommitListener): () => void {
  domainEventCommitListeners.add(listener);
  return () => domainEventCommitListeners.delete(listener);
}

function notifyDomainEventCommitted(event: DomainEvent): void {
  domainEventCommitListeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.error('[IndexedDbEngine] Domain event commit listener error:', err);
    }
  });
}

function getIndexedDbFactory(): IDBFactory | null {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) {
    return (globalThis as any).indexedDB;
  }
  if (typeof indexedDB !== 'undefined') {
    return indexedDB;
  }
  return null;
}

let nodeFakeIndexedDbPromise: Promise<IDBFactory | null> | null = null;

async function resolveIndexedDbFactory(): Promise<IDBFactory | null> {
  const existing = getIndexedDbFactory();
  if (existing) return existing;

  if (typeof window === 'undefined') {
    if (!nodeFakeIndexedDbPromise) {
      nodeFakeIndexedDbPromise = (async () => {
        try {
          const fakeMod = await import('fake-indexeddb');
          if (fakeMod && fakeMod.indexedDB) {
            (globalThis as any).indexedDB = fakeMod.indexedDB;
            if (fakeMod.IDBKeyRange && !(globalThis as any).IDBKeyRange) {
              (globalThis as any).IDBKeyRange = fakeMod.IDBKeyRange;
            }
            return fakeMod.indexedDB;
          }
        } catch {
          // fake-indexeddb not available
        }
        return null;
      })();
    }
    return nodeFakeIndexedDbPromise;
  }
  return null;
}

export function canonicalizeForComparison(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeForComparison);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    if (obj[k] !== undefined) {
      result[k] = canonicalizeForComparison(obj[k]);
    }
  }
  return result;
}

export function areRecordsStructurallyEquivalent(a: any, b: any): boolean {
  try {
    return JSON.stringify(canonicalizeForComparison(a)) === JSON.stringify(canonicalizeForComparison(b));
  } catch {
    return false;
  }
}

export const LEGACY_MIGRATION_LOCK_NAME = 'jano_health_legacy_migration_lock';

export class IndexedDbEngine {
  private static instance: IndexedDbEngine;
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryFallback: Map<StoreName, Map<string, any>> = new Map();
  private simulatedFailure: 'request_error' | 'transaction_abort' | 'unavailable' | 'none' = 'none';
  private activeMigrationPromise: Promise<{
    migratedCount: number;
    clearedKeys: string[];
    unmigratedKeys: string[];
    retainedKeys?: string[];
    errors: string[];
    insertedCount?: number;
    alreadyEquivalentCount?: number;
    conflictedCount?: number;
    malformedCount?: number;
    unresolvedCount?: number;
    hasUnresolvedConflict?: boolean;
    lockStatus?: 'acquired' | 'unavailable' | 'failed';
  }> | null = null;

  private constructor() {
    // Initialize empty volatile in-memory cache for all registered stores.
    // Plaintext localStorage fallback loading is strictly eliminated.
    ALL_STORE_NAMES.forEach((s) => this.memoryFallback.set(s, new Map()));
  }

  /**
   * Safe One-Time Migration:
   * Migrates any legacy records stranded in browser localStorage (from earlier versions)
   * into authoritative IndexedDB object stores.
   *
   * Race-safe & fail-closed invariants:
   * - Web Locks API coordinates migration and cleanup across cooperating browser tabs.
   * - Native IDB readwrite transaction coordinates serialization with application writers.
   * - Conditional insert-if-absent (store.add) inside transaction eliminates check-then-write race.
   * - Conservative conflict policy: never overwrites newer or differing authoritative destination records.
   * - Post-commit verification validates actual content equivalence, not just key presence.
   * - Pre-cleanup source verification validates that raw source payload did not mutate concurrently.
   * - In-process and cross-tab locks coordinate concurrent migration callers.
   * - Legacy source key is preserved if any conflict, malformed record, concurrent change,
   *   missing Web Locks support, or error occurs (zero data loss).
   */
  public async migrateLegacyFallbackData(): Promise<{
    migratedCount: number;
    clearedKeys: string[];
    unmigratedKeys: string[];
    retainedKeys?: string[];
    errors: string[];
    insertedCount?: number;
    alreadyEquivalentCount?: number;
    conflictedCount?: number;
    malformedCount?: number;
    unresolvedCount?: number;
    hasUnresolvedConflict?: boolean;
    lockStatus?: 'acquired' | 'unavailable' | 'failed';
  }> {
    if (this.activeMigrationPromise) {
      return this.activeMigrationPromise;
    }

    const run = (async () => {
      const hasWebLocks =
        typeof navigator !== 'undefined' &&
        Boolean((navigator as any).locks && typeof (navigator as any).locks.request === 'function');

      if (!hasWebLocks) {
        // Web Locks unsupported in this environment: proceed with destination migration
        // but strictly preserve all source keys (lockAcquired = false).
        return this.executeMigrationInternal(false, 'unavailable');
      }

      try {
        return await (navigator as any).locks.request(
          LEGACY_MIGRATION_LOCK_NAME,
          { mode: 'exclusive' },
          async () => {
            return this.executeMigrationInternal(true, 'acquired');
          }
        );
      } catch (lockErr: any) {
        // Lock acquisition failed: fail closed and do not perform cleanup
        const failResult = await this.executeMigrationInternal(false, 'failed');
        failResult.errors.push(`[IndexedDbEngine] Web Locks acquisition failed: ${lockErr?.message || String(lockErr)}`);
        return failResult;
      }
    })();

    this.activeMigrationPromise = run;
    try {
      return await run;
    } finally {
      if (this.activeMigrationPromise === run) {
        this.activeMigrationPromise = null;
      }
    }
  }

  private async executeMigrationInternal(
    lockAcquired: boolean = true,
    lockStatus: 'acquired' | 'unavailable' | 'failed' = 'acquired'
  ): Promise<{
    migratedCount: number;
    clearedKeys: string[];
    unmigratedKeys: string[];
    retainedKeys?: string[];
    errors: string[];
    insertedCount?: number;
    alreadyEquivalentCount?: number;
    conflictedCount?: number;
    malformedCount?: number;
    unresolvedCount?: number;
    hasUnresolvedConflict?: boolean;
    lockStatus?: 'acquired' | 'unavailable' | 'failed';
  }> {
    const result = {
      migratedCount: 0,
      clearedKeys: [] as string[],
      unmigratedKeys: [] as string[],
      retainedKeys: [] as string[],
      errors: [] as string[],
      insertedCount: 0,
      alreadyEquivalentCount: 0,
      conflictedCount: 0,
      malformedCount: 0,
      unresolvedCount: 0,
      hasUnresolvedConflict: false,
      lockStatus,
    };

    if (typeof localStorage === 'undefined') {
      return result;
    }

    if (this.simulatedFailure === 'unavailable') {
      result.errors.push('[IndexedDbEngine] IndexedDB is unavailable; legacy fallback migration deferred');
      return result;
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (err: any) {
      result.errors.push(`[IndexedDbEngine] Database open failure during legacy migration: ${err?.message || String(err)}`);
      return result;
    }

    if (!db) {
      result.errors.push('[IndexedDbEngine] IndexedDB is unavailable; legacy fallback migration deferred');
      return result;
    }

    const legacyKeyStoreMap: Record<string, StoreName> = {
      patients: 'patients',
      encounters: 'encounters',
      clinicalNotes: 'clinicalNotes',
      vitals: 'vitals',
      allergies: 'allergies',
      medications: 'medications',
      medicationDefinitions: 'medicationDefinitions',
      medicationOrders: 'medicationOrders',
      prescriptions: 'prescriptions',
      problems: 'problems',
      diagnoses: 'diagnoses',
      differentials: 'differentials',
      clinicalAssessments: 'clinicalAssessments',
      labOrders: 'labOrders',
      labSpecimens: 'labSpecimens',
      labResults: 'labResults',
      radiologyOrders: 'radiologyOrders',
      radiologyResults: 'radiologyResults',
      appointments: 'appointments',
      referrals: 'referrals',
      emergencyCases: 'emergencyCases',
      syncQueue: 'syncQueue',
      auditLog: 'auditLog',
    };

    const keysToProcess: Array<{ storageKey: string; storeName: StoreName }> = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;

        if (k.startsWith('jano_idb_fallback_')) {
          const sName = k.replace('jano_idb_fallback_', '') as StoreName;
          if (ALL_STORE_NAMES.includes(sName)) {
            keysToProcess.push({ storageKey: k, storeName: sName });
          }
        } else if (k.startsWith('jano_health_db_v1_')) {
          const colName = k.replace('jano_health_db_v1_', '');
          const sName = legacyKeyStoreMap[colName];
          if (sName && ALL_STORE_NAMES.includes(sName)) {
            keysToProcess.push({ storageKey: k, storeName: sName });
          }
        }
      }
    } catch (enumErr: any) {
      result.errors.push(`[IndexedDbEngine] Failed to enumerate localStorage keys: ${enumErr?.message || String(enumErr)}`);
      return result;
    }

    for (const { storageKey, storeName } of keysToProcess) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
          localStorage.removeItem(storageKey);
          result.clearedKeys.push(storageKey);
          continue;
        }

        let items: any[];
        try {
          items = JSON.parse(raw);
          if (!Array.isArray(items)) {
            result.unmigratedKeys.push(storageKey);
            result.malformedCount++;
            result.unresolvedCount++;
            result.errors.push(`[IndexedDbEngine] Invalid format in ${storageKey}: expected array`);
            continue;
          }
        } catch (parseErr: any) {
          result.unmigratedKeys.push(storageKey);
          result.malformedCount++;
          result.unresolvedCount++;
          result.errors.push(`[IndexedDbEngine] Parse error in ${storageKey}: ${parseErr.message}`);
          continue;
        }

        if (items.length === 0) {
          localStorage.removeItem(storageKey);
          result.clearedKeys.push(storageKey);
          continue;
        }

        // Validate each item has an extractable primary key and detect internal conflicts
        let hasMalformedItem = false;
        const parsedEntries: Array<{ key: string; item: any }> = [];
        const sourceKeysSeen = new Map<string, any>();
        let hasInternalDuplicateConflict = false;

        for (const it of items) {
          if (!it || typeof it !== 'object') {
            hasMalformedItem = true;
            break;
          }
          const key = extractItemKey(it, storeName);
          if (!key) {
            hasMalformedItem = true;
            break;
          }
          if (sourceKeysSeen.has(key)) {
            const prior = sourceKeysSeen.get(key);
            if (!areRecordsStructurallyEquivalent(prior, it)) {
              hasInternalDuplicateConflict = true;
              break;
            }
          } else {
            sourceKeysSeen.set(key, it);
            parsedEntries.push({ key, item: it });
          }
        }

        if (hasMalformedItem) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.malformedCount++;
          result.unresolvedCount++;
          result.errors.push(`[IndexedDbEngine] Malformed records with missing primary key in ${storageKey}`);
          continue;
        }

        if (hasInternalDuplicateConflict) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.conflictedCount++;
          result.unresolvedCount++;
          result.errors.push(`[IndexedDbEngine] Conflicting duplicate records within source ${storageKey}`);
          continue;
        }

        // Execute transaction-safe conditional insertion inside native readwrite transaction
        const stagedForInsert: Array<{ key: string; item: any }> = [];
        let hasUnresolvedConflict = false;

        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          throw new Error(`[IndexedDbEngine] Transaction aborted migrating ${storageKey}`);
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          throw new Error(`[IndexedDbEngine] Simulated request error migrating ${storageKey}`);
        }

        await new Promise<void>((resolve, reject) => {
          let remaining = parsedEntries.length;
          if (remaining === 0) {
            resolve();
            return;
          }

          const completeOne = () => {
            remaining--;
            if (remaining === 0) {
              resolve();
            }
          };

          for (const entry of parsedEntries) {
            const normalizedItem = normalizeItemForStore(store, entry.item, storeName);
            const getReq = store.get(entry.key);
            getReq.onsuccess = () => {
              const liveRecord = getReq.result;
              if (liveRecord === undefined) {
                // Key absent in destination: insert atomically using add()
                try {
                  const addReq = store.add(normalizedItem);
                  addReq.onsuccess = () => {
                    stagedForInsert.push({ key: entry.key, item: normalizedItem });
                    completeOne();
                  };
                  addReq.onerror = (e) => {
                    e.preventDefault();
                    (e as any).stopPropagation?.();
                    hasUnresolvedConflict = true;
                    completeOne();
                  };
                } catch {
                  hasUnresolvedConflict = true;
                  completeOne();
                }
              } else {
                // Key already exists in destination
                if (areRecordsStructurallyEquivalent(liveRecord, normalizedItem)) {
                  result.alreadyEquivalentCount++;
                  completeOne();
                } else {
                  // Conflict: destination has differing content.
                  // Conservative policy: NEVER overwrite authoritative destination.
                  result.conflictedCount++;
                  hasUnresolvedConflict = true;
                  completeOne();
                }
              }
            };
            getReq.onerror = () => {
              hasUnresolvedConflict = true;
              completeOne();
            };
          }
        });

        // Await native transaction completion
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error(`Transaction error migrating ${storageKey}`));
          tx.onabort = () => reject(new Error(`Transaction aborted migrating ${storageKey}`));
        });

        // Post-commit content verification (not just key presence)
        let contentVerificationPassed = true;
        for (const staged of stagedForInsert) {
          const liveCheck = await this.get<any>(storeName, staged.key);
          if (!liveCheck || !areRecordsStructurallyEquivalent(liveCheck, staged.item)) {
            contentVerificationPassed = false;
            result.errors.push(`[IndexedDbEngine] Post-commit content verification failed for key [${staged.key}] in ${storageKey}`);
            break;
          }
        }

        if (!contentVerificationPassed) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.unresolvedCount += stagedForInsert.length;
          continue;
        }

        result.insertedCount += stagedForInsert.length;
        result.migratedCount += stagedForInsert.length;

        // Delete source key ONLY if all items were resolved cleanly without conflicts
        if (hasUnresolvedConflict) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.unresolvedCount++;
          result.errors.push(`[IndexedDbEngine] Preserving source key ${storageKey} due to destination conflicts or concurrent records`);
          continue;
        }

        // Web Locks exclusivity guard: do not perform cleanup if cross-tab exclusivity was not established
        if (!lockAcquired) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.unresolvedCount++;
          result.errors.push(
            `[IndexedDbEngine] Web Locks synchronization unavailable (${lockStatus}); preserving legacy source key ${storageKey} to prevent unsafe cross-tab deletion`
          );
          continue;
        }

        // Pre-cleanup check: verify that the source payload has not been modified since it was read.
        // Architectural note: While getItem() + removeItem() is not an atomic operation in multi-tab
        // environments without native CAS, coordinating via Web Locks serializes cooperating tabs,
        // and verifying payload identity before removal prevents data loss by failing closed
        // and preserving the modified source key.
        const currentRaw = localStorage.getItem(storageKey);
        if (currentRaw !== raw) {
          result.unmigratedKeys.push(storageKey);
          result.retainedKeys.push(storageKey);
          result.unresolvedCount++;
          result.errors.push(`[IndexedDbEngine] Source key ${storageKey} was modified concurrently during migration; preserving source key.`);
          continue;
        }

        localStorage.removeItem(storageKey);
        result.clearedKeys.push(storageKey);
      } catch (itemErr: any) {
        result.unmigratedKeys.push(storageKey);
        result.retainedKeys.push(storageKey);
        result.unresolvedCount++;
        result.errors.push(`[IndexedDbEngine] Migration error on ${storageKey}: ${itemErr?.message || String(itemErr)}`);
      }
    }

    result.hasUnresolvedConflict = result.conflictedCount > 0 || result.unresolvedCount > 0;
    return result;
  }

  public static getInstance(): IndexedDbEngine {
    if (!IndexedDbEngine.instance) {
      IndexedDbEngine.instance = new IndexedDbEngine();
    }
    return IndexedDbEngine.instance;
  }

  public setSimulatedFailure(failure: 'request_error' | 'transaction_abort' | 'unavailable' | 'none' | boolean): void {
    if (failure === true) {
      this.simulatedFailure = 'request_error';
    } else if (failure === false || failure === 'none') {
      this.simulatedFailure = 'none';
    } else {
      this.simulatedFailure = failure;
    }
  }

  public getSimulatedFailure(): string {
    return this.simulatedFailure;
  }

  public resetDatabaseConnection(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => {
        try { db?.close(); } catch {}
      }).catch(() => {});
      this.dbPromise = null;
    }
  }

  public async getDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    const factory = await resolveIndexedDbFactory();
    if (!factory) {
      return null;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          this.dbPromise = null;
          reject(err);
        }
      };

      try {
        const req = factory.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
          const db = (e.target as IDBOpenDBRequest).result;

          // Helper to safely create store with indexes
          const ensureStore = (
            name: StoreName,
            keyPath: string,
            indexes: Array<{ name: string; keyPath: string; unique?: boolean }>
          ) => {
            let store: IDBObjectStore;
            if (!db.objectStoreNames.contains(name)) {
              store = db.createObjectStore(name, { keyPath });
            } else {
              store = req.transaction!.objectStore(name);
            }
            indexes.forEach((idx) => {
              if (!store.indexNames.contains(idx.name)) {
                store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false });
              }
            });
          };

          // 1. Patients Store
          ensureStore('patients', 'id', [
            { name: 'mrn', keyPath: 'mrn', unique: true },
            { name: 'firstName', keyPath: 'firstName' },
            { name: 'lastName', keyPath: 'lastName' },
            { name: 'primaryFacilityId', keyPath: 'primaryFacilityId' },
            { name: 'updatedAt', keyPath: 'updatedAt' },
          ]);

          // 2. Encounters Store
          ensureStore('encounters', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'startedAt', keyPath: 'startedAt' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 3. Vitals Store
          ensureStore('vitals', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'encounterId', keyPath: 'encounterId' },
            { name: 'recordedAt', keyPath: 'recordedAt' },
          ]);

          // 4. Clinical Notes Store
          ensureStore('clinicalNotes', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'encounterId', keyPath: 'encounterId' },
            { name: 'createdAt', keyPath: 'createdAt' },
          ]);

          // 5. Problems Store
          ensureStore('problems', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6. Diagnoses Store
          ensureStore('diagnoses', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 7. Differentials Store
          ensureStore('differentials', 'id', [
            { name: 'encounterId', keyPath: 'encounterId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 8. Clinical Assessments Store
          ensureStore('clinicalAssessments', 'id', [
            { name: 'encounterId', keyPath: 'encounterId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6. Medications Store
          ensureStore('medications', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'dispensedStatus', keyPath: 'dispensedStatus' },
          ]);

          // 6b. Medication Definitions Store (Clinical Core V6)
          ensureStore('medicationDefinitions', 'id', [
            { name: 'code', keyPath: 'code', unique: true },
            { name: 'genericName', keyPath: 'genericName' },
            { name: 'active', keyPath: 'active' },
          ]);

          // 6c. Medication Orders Store (Clinical Core V6)
          ensureStore('medicationOrders', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'encounterId', keyPath: 'encounterId' },
            { name: 'status', keyPath: 'status' },
            { name: 'orderNumber', keyPath: 'orderNumber', unique: true },
            { name: 'orderedAt', keyPath: 'orderedAt' },
          ]);

          // 6d. Prescriptions Store (Clinical Core V6)
          ensureStore('prescriptions', 'id', [
            { name: 'medicationOrderId', keyPath: 'medicationOrderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'prescriptionNumber', keyPath: 'prescriptionNumber', unique: true },
            { name: 'issuedAt', keyPath: 'issuedAt' },
          ]);

          // 6e. Dispense Records Store (Clinical Core V7)
          ensureStore('dispenseRecords', 'id', [
            { name: 'prescriptionId', keyPath: 'prescriptionId' },
            { name: 'medicationOrderId', keyPath: 'medicationOrderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'batchId', keyPath: 'batchId' },
            { name: 'dispenseNumber', keyPath: 'dispenseNumber', unique: true },
            { name: 'dispensedAt', keyPath: 'dispensedAt' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6f. Inventory Items Store (Clinical Core V7)
          ensureStore('inventoryItems', 'id', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'medicationCode', keyPath: 'medicationCode' },
            { name: 'medicationDefinitionId', keyPath: 'medicationDefinitionId' },
            { name: 'active', keyPath: 'active' },
          ]);

          // 6g. Inventory Batches Store (Clinical Core V7)
          ensureStore('inventoryBatches', 'id', [
            { name: 'inventoryItemId', keyPath: 'inventoryItemId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'batchNumber', keyPath: 'batchNumber' },
            { name: 'expiryDate', keyPath: 'expiryDate' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6h. Inventory Transactions Ledger Store (Clinical Core V7)
          ensureStore('inventoryTransactions', 'id', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'inventoryItemId', keyPath: 'inventoryItemId' },
            { name: 'batchId', keyPath: 'batchId' },
            { name: 'transactionType', keyPath: 'transactionType' },
            { name: 'referenceId', keyPath: 'referenceId' },
            { name: 'occurredAt', keyPath: 'occurredAt' },
          ]);

          // 6i. Inventory Receipts Store (Clinical Core V7)
          ensureStore('inventoryReceipts', 'id', [
            { name: 'receiptNumber', keyPath: 'receiptNumber', unique: true },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'receivedAt', keyPath: 'receivedAt' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6j. Inventory Transfers Store (Clinical Core V7)
          ensureStore('inventoryTransfers', 'id', [
            { name: 'transferNumber', keyPath: 'transferNumber', unique: true },
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 6k. Inventory Wastage Store (Clinical Core V7)
          ensureStore('inventoryWastage', 'id', [
            { name: 'wastageNumber', keyPath: 'wastageNumber', unique: true },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'inventoryItemId', keyPath: 'inventoryItemId' },
            { name: 'batchId', keyPath: 'batchId' },
            { name: 'occurredAt', keyPath: 'occurredAt' },
          ]);

          // 6l. Pharmacy Reviews Store (Clinical Core V7)
          ensureStore('pharmacyReviews', 'id', [
            { name: 'prescriptionId', keyPath: 'prescriptionId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'reviewedAt', keyPath: 'reviewedAt' },
            { name: 'decision', keyPath: 'decision' },
          ]);

          // 6m. Medication Safety Checks Store (Clinical Core V6)
          ensureStore('medicationSafetyChecks', 'id', [
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'checkedAt', keyPath: 'checkedAt' },
          ]);

          // 7. Allergies Store
          ensureStore('allergies', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
          ]);

          // 8. Laboratory Orders Store
          ensureStore('labOrders', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
            { name: 'orderedAt', keyPath: 'orderedAt' },
          ]);

          // 8b. Laboratory Specimens Store
          ensureStore('labSpecimens', 'id', [
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'accessionNumber', keyPath: 'accessionNumber', unique: true },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 9. Laboratory Results Store
          ensureStore('labResults', 'id', [
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'completedAt', keyPath: 'completedAt' },
          ]);

          // 10. Radiology Orders Store
          ensureStore('radiologyOrders', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'orderNumber', keyPath: 'orderNumber' },
          ]);

          // 10b. Radiology Studies Store
          ensureStore('radiologyStudies', 'id', [
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'accessionNumber', keyPath: 'accessionNumber', unique: true },
            { name: 'status', keyPath: 'status' },
            { name: 'studyNumber', keyPath: 'studyNumber' },
          ]);

          // 10c. Radiology Reports Store
          ensureStore('radiologyReports', 'id', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'radiologistId', keyPath: 'radiologistId' },
          ]);

          // 10d. Critical Radiology Findings Store
          ensureStore('criticalRadiologyFindings', 'id', [
            { name: 'reportId', keyPath: 'reportId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'acknowledged', keyPath: 'acknowledged' },
          ]);

          // 11. Radiology Results Store
          ensureStore('radiologyResults', 'id', [
            { name: 'orderId', keyPath: 'orderId' },
            { name: 'patientId', keyPath: 'patientId' },
          ]);

          // 12. Appointments Store
          ensureStore('appointments', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'scheduledTime', keyPath: 'scheduledTime' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 13. Referrals Store
          ensureStore('referrals', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'fromFacilityId', keyPath: 'fromFacilityId' },
            { name: 'toFacilityId', keyPath: 'toFacilityId' },
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'referralNumber', keyPath: 'referralNumber' },
          ]);

          // 13b. Referral Outcomes Store
          ensureStore('referralOutcomes', 'id', [
            { name: 'referralId', keyPath: 'referralId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'receivingFacilityId', keyPath: 'receivingFacilityId' },
          ]);

          // 13c. Referral Communications Store
          ensureStore('referralCommunications', 'id', [
            { name: 'referralId', keyPath: 'referralId' },
            { name: 'senderId', keyPath: 'senderId' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 14. Emergency Cases Store
          ensureStore('emergencyCases', 'id', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'emergencyNumber', keyPath: 'emergencyNumber' },
            { name: 'currentTriageLevel', keyPath: 'currentTriageLevel' },
            { name: 'status', keyPath: 'status' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'isActive', keyPath: 'isActive' },
          ]);

          // 14b. Emergency Triages Store
          ensureStore('emergencyTriages', 'id', [
            { name: 'emergencyCaseId', keyPath: 'emergencyCaseId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'triageLevel', keyPath: 'triageLevel' },
            { name: 'triagedAt', keyPath: 'triagedAt' },
          ]);

          // 14c. Emergency Reassessments Store
          ensureStore('emergencyReassessments', 'id', [
            { name: 'emergencyCaseId', keyPath: 'emergencyCaseId' },
            { name: 'recordedAt', keyPath: 'recordedAt' },
          ]);

          // 14d. Emergency Alerts Store
          ensureStore('emergencyAlerts', 'id', [
            { name: 'emergencyCaseId', keyPath: 'emergencyCaseId' },
            { name: 'severity', keyPath: 'severity' },
            { name: 'acknowledged', keyPath: 'acknowledged' },
          ]);

          // 14e. Transport Requests Store
          ensureStore('transportRequests', 'id', [
            { name: 'emergencyCaseId', keyPath: 'emergencyCaseId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 15. AI Requests Store
          ensureStore('aiRequests', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'requestedAt', keyPath: 'requestedAt' },
          ]);

          // 15b. AI Responses Store
          ensureStore('aiResponses', 'id', [
            { name: 'requestId', keyPath: 'requestId' },
            { name: 'createdAt', keyPath: 'createdAt' },
          ]);

          // 15c. AI Reviews Store
          ensureStore('aiReviews', 'id', [
            { name: 'requestId', keyPath: 'requestId' },
            { name: 'responseId', keyPath: 'responseId' },
            { name: 'reviewedAt', keyPath: 'reviewedAt' },
          ]);

          // 16. Domain Event Store (Append-Only)
          ensureStore('domainEvents', 'eventId', [
            { name: 'aggregateId', keyPath: 'aggregateId' },
            { name: 'aggregateType', keyPath: 'aggregateType' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'syncStatus', keyPath: 'syncStatus' },
          ]);

          // 17. Synchronization Queue
          ensureStore('syncQueue', 'id', [
            { name: 'status', keyPath: 'status' },
            { name: 'clientTimestamp', keyPath: 'clientTimestamp' },
            { name: 'retryCount', keyPath: 'retryCount' },
          ]);

          // 18. Clinical Conflicts Store
          ensureStore('conflicts', 'conflictId', [
            { name: 'aggregateId', keyPath: 'aggregateId' },
            { name: 'resolutionStatus', keyPath: 'resolutionStatus' },
          ]);

          // 19. Audit Log Store
          ensureStore('auditLog', 'id', [
            { name: 'resourceId', keyPath: 'resourceId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'actorId', keyPath: 'actorId' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'syncStatus', keyPath: 'syncStatus' },
          ]);

          // 20. V13 Jano Network Nodes Store
          ensureStore('networkNodes', 'nodeId', [
            { name: 'nodeCode', keyPath: 'nodeCode', unique: true },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'networkStatus', keyPath: 'networkStatus' },
            { name: 'trustStatus', keyPath: 'trustStatus' },
            { name: 'lastSeenAt', keyPath: 'lastSeenAt' },
          ]);

          // 21. V13 Network Exchange Policies Store
          ensureStore('networkPolicies', 'policyId', [
            { name: 'sourceNodeId', keyPath: 'sourceNodeId' },
            { name: 'destinationNodeId', keyPath: 'destinationNodeId' },
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'purpose', keyPath: 'purpose' },
            { name: 'isActive', keyPath: 'isActive' },
          ]);

          // 22. V13 Network Exchange Messages Store
          ensureStore('networkMessages', 'messageId', [
            { name: 'exchangeId', keyPath: 'exchangeId' },
            { name: 'sourceNodeId', keyPath: 'sourceNodeId' },
            { name: 'destinationNodeId', keyPath: 'destinationNodeId' },
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'currentState', keyPath: 'currentState' },
            { name: 'idempotencyKey', keyPath: 'idempotencyKey', unique: true },
            { name: 'correlationId', keyPath: 'correlationId' },
            { name: 'payloadHash', keyPath: 'payloadHash' },
            { name: 'createdAt', keyPath: 'createdAt' },
          ]);

          // 23. V13 Network Quarantine Store
          ensureStore('networkQuarantine', 'id', [
            { name: 'messageId', keyPath: 'messageId' },
            { name: 'category', keyPath: 'category' },
            { name: 'sourceNodeId', keyPath: 'sourceNodeId' },
            { name: 'status', keyPath: 'status' },
            { name: 'quarantinedAt', keyPath: 'quarantinedAt' },
          ]);

          // 24. V13 Network Directory Cache Store
          ensureStore('networkDirectoryCache', 'facilityId', [
            { name: 'facilityCode', keyPath: 'facilityCode' },
            { name: 'operatingStatus', keyPath: 'operatingStatus' },
          ]);

          // 25. V13 External Patient Identities Store
          ensureStore('externalPatientIdentities', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'sourceSystem', keyPath: 'sourceSystem' },
            { name: 'sourceNodeId', keyPath: 'sourceNodeId' },
            { name: 'externalIdentifier', keyPath: 'externalIdentifier' },
            { name: 'identifierSystem', keyPath: 'identifierSystem' },
            { name: 'verificationStatus', keyPath: 'verificationStatus' },
          ]);

          // 26. V13 Network Telemetry Store
          ensureStore('networkTelemetry', 'id', [
            { name: 'exchangeId', keyPath: 'exchangeId' },
            { name: 'sourceNodeId', keyPath: 'sourceNodeId' },
            { name: 'destinationNodeId', keyPath: 'destinationNodeId' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'state', keyPath: 'state' },
          ]);

          // 27. V14 Analytical Facts Store
          ensureStore('analyticalFacts', 'factId', [
            { name: 'factType', keyPath: 'factType' },
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'reportingPeriod', keyPath: 'reportingPeriod' },
            { name: 'eventTimestamp', keyPath: 'eventTimestamp' },
            { name: 'dataQualityStatus', keyPath: 'dataQualityStatus' },
          ]);

          // 28. V14 Metric Definitions Store
          ensureStore('metricDefinitions', 'metricId', [
            { name: 'domain', keyPath: 'domain' },
            { name: 'version', keyPath: 'version' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 29. V14 Cohort Definitions Store
          ensureStore('cohortDefinitions', 'cohortId', [
            { name: 'status', keyPath: 'status' },
            { name: 'version', keyPath: 'version' },
          ]);

          // 30. V14 Population Cohorts Store
          ensureStore('populationCohorts', 'cohortId', [
            { name: 'reportingPeriod', keyPath: 'reportingPeriod' },
            { name: 'scopeId', keyPath: 'scopeId' },
          ]);

          // 31. V14 Population Signals Store
          ensureStore('populationSignals', 'signalId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'signalType', keyPath: 'signalType' },
            { name: 'status', keyPath: 'status' },
            { name: 'generatedAt', keyPath: 'generatedAt' },
          ]);

          // 32. V14 Demand Forecasts Store
          ensureStore('demandForecasts', 'forecastId', [
            { name: 'itemId', keyPath: 'itemId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'generatedAt', keyPath: 'generatedAt' },
          ]);

          // 33. V14 Data Quality Issues Store
          ensureStore('dataQualityIssues', 'issueId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'domain', keyPath: 'domain' },
            { name: 'status', keyPath: 'status' },
            { name: 'severity', keyPath: 'severity' },
          ]);

          // 34. V14 Public Health Reports Store
          ensureStore('publicHealthReports', 'packageId', [
            { name: 'reportingPeriod', keyPath: 'reportingPeriod' },
            { name: 'approvalStatus', keyPath: 'approvalStatus' },
          ]);

          // 35. V14 Intelligence Reports Store
          ensureStore('intelligenceReports', 'reportId', [
            { name: 'reportingPeriod', keyPath: 'reportingPeriod' },
            { name: 'approvalStatus', keyPath: 'approvalStatus' },
          ]);

          // 36. V14 Population Telemetry Store
          ensureStore('populationTelemetry', 'id', [
            { name: 'action', keyPath: 'action' },
            { name: 'scopeId', keyPath: 'scopeId' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 37. V15 Longitudinal Identities Store
          ensureStore('longitudinalIdentities', 'patientId', [
            { name: 'identityId', keyPath: 'identityId', unique: true },
            { name: 'identityStatus', keyPath: 'identityStatus' },
          ]);

          // 38. V15 Identity Evidence Store
          ensureStore('identityEvidence', 'evidenceId', [
            { name: 'identityId', keyPath: 'identityId' },
            { name: 'patientId', keyPath: 'patientId' },
          ]);

          // 39. V15 Identity Resolution Decisions Store
          ensureStore('identityResolutionDecisions', 'decisionId', [
            { name: 'decision', keyPath: 'decision' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 40. V15 Patient Consents Store
          ensureStore('patientConsents', 'consentId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 41. V15 Consent Audit Entries Store
          ensureStore('consentAuditEntries', 'id', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'action', keyPath: 'action' },
          ]);

          // 42. V15 Emergency Access Requests Store
          ensureStore('emergencyAccessRequests', 'requestId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'actorId', keyPath: 'actorId' },
          ]);

          // 43. V15 Payers Store
          ensureStore('payers', 'payerId', [
            { name: 'name', keyPath: 'name' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 44. V15 Financing Programs Store
          ensureStore('financingPrograms', 'programId', [
            { name: 'payerId', keyPath: 'payerId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 45. V15 Coverages Store
          ensureStore('coverages', 'coverageId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'payerId', keyPath: 'payerId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 46. V15 Eligibility Requests Store
          ensureStore('eligibilityRequests', 'checkId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'coverageId', keyPath: 'coverageId' },
          ]);

          // 47. V15 Authorization Requests Store
          ensureStore('authorizationRequests', 'authorizationId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 48. V15 Claims Store
          ensureStore('claims', 'claimId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'payerId', keyPath: 'payerId' },
            { name: 'claimNumber', keyPath: 'claimNumber', unique: true },
            { name: 'status', keyPath: 'status' },
          ]);

          // 49. V15 Claim Lines Store
          ensureStore('claimLines', 'lineId', [
            { name: 'claimId', keyPath: 'claimId' },
          ]);

          // 50. V15 Invoices Store
          ensureStore('invoices', 'invoiceId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'invoiceNumber', keyPath: 'invoiceNumber', unique: true },
            { name: 'status', keyPath: 'status' },
          ]);

          // 51. V15 Payments Store
          ensureStore('payments', 'paymentId', [
            { name: 'invoiceId', keyPath: 'invoiceId' },
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'receiptNumber', keyPath: 'receiptNumber', unique: true },
          ]);

          // 52. V15 Financial Events Store
          ensureStore('financialEvents', 'eventId', [
            { name: 'aggregateId', keyPath: 'aggregateId' },
            { name: 'eventType', keyPath: 'eventType' },
            { name: 'facilityId', keyPath: 'facilityId' },
          ]);

          // 53. V15 Financial Quarantine Store
          ensureStore('financialQuarantine', 'quarantineId', [
            { name: 'category', keyPath: 'category' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 54. V16 Workforce Members Store
          ensureStore('workforceMembers', 'workforceMemberId', [
            { name: 'status', keyPath: 'status' },
            { name: 'professionalCategory', keyPath: 'professionalCategory' },
            { name: 'displayName', keyPath: 'displayName' },
          ]);

          // 55. V16 Workforce Credentials Store
          ensureStore('workforceCredentials', 'credentialId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'verificationStatus', keyPath: 'verificationStatus' },
            { name: 'expiresAt', keyPath: 'expiresAt' },
          ]);

          // 56. V16 Qualifications Store
          ensureStore('qualifications', 'qualificationId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'verificationStatus', keyPath: 'verificationStatus' },
          ]);

          // 57. V16 Facility Assignments Store
          ensureStore('workforceFacilityAssignments', 'assignmentId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 58. V16 Care Teams Store
          ensureStore('careTeams', 'careTeamId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'patientReference', keyPath: 'patientReference' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 59. V16 Care Team Memberships Store
          ensureStore('careTeamMemberships', 'membershipId', [
            { name: 'careTeamId', keyPath: 'careTeamId' },
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 60. V16 Duty Rosters Store
          ensureStore('dutyRosters', 'rosterId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'department', keyPath: 'department' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 61. V16 Shift Assignments Store
          ensureStore('shiftAssignments', 'shiftId', [
            { name: 'rosterId', keyPath: 'rosterId' },
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'startAt', keyPath: 'startAt' },
          ]);

          // 62. V16 Workforce Presence Store
          ensureStore('workforcePresence', 'presenceId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 63. V16 Shift Handovers Store
          ensureStore('shiftHandovers', 'handoverId', [
            { name: 'facility', keyPath: 'facility' },
            { name: 'status', keyPath: 'status' },
            { name: 'outgoingWorkforceMember', keyPath: 'outgoingWorkforceMember' },
          ]);

          // 64. V16 Workforce Tasks Store
          ensureStore('workforceTasks', 'taskId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'assignedTo', keyPath: 'assignedTo' },
            { name: 'status', keyPath: 'status' },
            { name: 'priority', keyPath: 'priority' },
            { name: 'dueAt', keyPath: 'dueAt' },
          ]);

          // 65. V16 Task Escalations Store
          ensureStore('taskEscalations', 'escalationId', [
            { name: 'taskId', keyPath: 'taskId' },
            { name: 'escalatedTo', keyPath: 'escalatedTo' },
          ]);

          // 66. V16 Workforce Availability Store
          ensureStore('workforceAvailability', 'availabilityId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 67. V16 Workforce Leave Store
          ensureStore('workforceLeave', 'leaveId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'approvalStatus', keyPath: 'approvalStatus' },
          ]);

          // 68. V16 Supervision Assignments Store
          ensureStore('supervisionAssignments', 'supervisionId', [
            { name: 'supervisorId', keyPath: 'supervisorId' },
            { name: 'superviseeId', keyPath: 'superviseeId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 69. V16 Training Records Store
          ensureStore('trainingRecords', 'trainingId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 70. V16 Competency Records Store
          ensureStore('competencyRecords', 'competencyId', [
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 71. V16 Staffing Requirements Store
          ensureStore('staffingRequirements', 'requirementId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'service', keyPath: 'service' },
          ]);

          // 72. V16 Staffing Gaps Store
          ensureStore('staffingGaps', 'gapId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'service', keyPath: 'service' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 73. V17 Supply Items Store
          ensureStore('supplyItems', 'supplyItemId', [
            { name: 'code', keyPath: 'code' },
            { name: 'category', keyPath: 'category' },
            { name: 'procurementClassification', keyPath: 'procurementClassification' },
            { name: 'active', keyPath: 'active' },
          ]);

          // 74. V17 Demand Signals Store
          ensureStore('demandSignals', 'demandSignalId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'source', keyPath: 'source' },
            { name: 'priority', keyPath: 'priority' },
          ]);

          // 75. V17 Requisitions Store
          ensureStore('requisitions', 'requisitionId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
            { name: 'requesterId', keyPath: 'requesterId' },
            { name: 'requestingDepartment', keyPath: 'requestingDepartment' },
          ]);

          // 76. V17 Requisition Lines Store
          ensureStore('requisitionLines', 'requisitionLineId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 77. V17 Purchase Requests Store
          ensureStore('purchaseRequests', 'purchaseRequestId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 78. V17 Suppliers Store
          ensureStore('suppliers', 'supplierId', [
            { name: 'legalName', keyPath: 'legalName' },
            { name: 'status', keyPath: 'status' },
            { name: 'supplierType', keyPath: 'supplierType' },
          ]);

          // 79. V17 Supplier Contracts Store
          ensureStore('supplierContracts', 'contractId', [
            { name: 'supplierId', keyPath: 'supplierId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 80. V17 Procurement Approvals Store
          ensureStore('procurementApprovals', 'approvalId', [
            { name: 'entityId', keyPath: 'entityId' },
            { name: 'reviewerId', keyPath: 'reviewerId' },
            { name: 'action', keyPath: 'action' },
          ]);

          // 81. V17 Purchase Orders Store
          ensureStore('purchaseOrders', 'purchaseOrderId', [
            { name: 'orderNumber', keyPath: 'orderNumber' },
            { name: 'supplierId', keyPath: 'supplierId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 82. V17 Purchase Order Lines Store
          ensureStore('purchaseOrderLines', 'lineId', [
            { name: 'purchaseOrderId', keyPath: 'purchaseOrderId' },
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
          ]);

          // 83. V17 Shipments Store
          ensureStore('shipments', 'shipmentId', [
            { name: 'purchaseOrderReference', keyPath: 'purchaseOrderReference' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 84. V17 Shipment Lines Store
          ensureStore('shipmentLines', 'lineId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'batchOrLotNumber', keyPath: 'batchOrLotNumber' },
          ]);

          // 85. V17 Transport Legs Store
          ensureStore('transportLegs', 'legId', [
            { name: 'shipmentId', keyPath: 'shipmentId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 86. V17 Delivery Checkpoints Store
          ensureStore('deliveryCheckpoints', 'checkpointId', [
            { name: 'legId', keyPath: 'legId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 87. V17 Goods Receipts Store
          ensureStore('goodsReceipts', 'goodsReceiptId', [
            { name: 'receiptNumber', keyPath: 'receiptNumber' },
            { name: 'shipmentId', keyPath: 'shipmentId' },
            { name: 'purchaseOrderReference', keyPath: 'purchaseOrderReference' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 88. V17 Goods Receipt Lines Store
          ensureStore('goodsReceiptLines', 'lineId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'lotNumber', keyPath: 'lotNumber' },
          ]);

          // 89. V17 Warehouses Store
          ensureStore('warehouses', 'warehouseId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'type', keyPath: 'type' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 90. V17 Storage Locations Store
          ensureStore('storageLocations', 'locationId', [
            { name: 'warehouseId', keyPath: 'warehouseId' },
            { name: 'temperatureZone', keyPath: 'temperatureZone' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 91. V17 Stock Transfers Store
          ensureStore('stockTransfers', 'transferId', [
            { name: 'sourceFacilityId', keyPath: 'sourceFacilityId' },
            { name: 'destinationFacilityId', keyPath: 'destinationFacilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 92. V17 Cold Chain Shipments Store
          ensureStore('coldChainShipments', 'shipmentId', [
            { name: 'status', keyPath: 'status' },
          ]);

          // 93. V17 Temperature Logs Store
          ensureStore('temperatureLogs', 'logId', [
            { name: 'shipmentId', keyPath: 'shipmentId' },
            { name: 'storageLocationId', keyPath: 'storageLocationId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 94. V17 Temperature Excursions Store
          ensureStore('temperatureExcursions', 'excursionId', [
            { name: 'shipmentId', keyPath: 'shipmentId' },
            { name: 'storageLocationId', keyPath: 'storageLocationId' },
            { name: 'status', keyPath: 'status' },
            { name: 'severity', keyPath: 'severity' },
          ]);

          // 95. V17 Batch Quality Holds Store
          ensureStore('batchQualityHolds', 'holdId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'batchNumber', keyPath: 'batchNumber' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'holdStatus', keyPath: 'holdStatus' },
          ]);

          // 96. V17 Supplier Quality Events Store
          ensureStore('supplierQualityEvents', 'eventId', [
            { name: 'supplierId', keyPath: 'supplierId' },
            { name: 'eventType', keyPath: 'eventType' },
            { name: 'severity', keyPath: 'severity' },
          ]);

          // 97. V17 Recall Notices Store
          ensureStore('recallNotices', 'recallId', [
            { name: 'recallNumber', keyPath: 'recallNumber' },
            { name: 'status', keyPath: 'status' },
            { name: 'severity', keyPath: 'severity' },
          ]);

          // 98. V17 Recall Actions Store
          ensureStore('recallActions', 'actionId', [
            { name: 'recallId', keyPath: 'recallId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 99. V17 Procurement Forecasts Store
          ensureStore('procurementForecasts', 'forecastId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'facilityId', keyPath: 'facilityId' },
          ]);

          // 100. V17 Replenishment Recommendations Store
          ensureStore('replenishmentRecommendations', 'recommendationId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'urgency', keyPath: 'urgency' },
            { name: 'reviewStatus', keyPath: 'reviewStatus' },
          ]);

          // 101. V17 Supply Risks Store
          ensureStore('supplyRisks', 'riskId', [
            { name: 'supplyItemId', keyPath: 'supplyItemId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'riskType', keyPath: 'riskType' },
            { name: 'severity', keyPath: 'severity' },
          ]);

          // 102. V17 Supply Chain Events Store
          ensureStore('supplyChainEvents', 'eventId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'eventType', keyPath: 'eventType' },
          ]);

          // 103. V18 Research Studies Store
          ensureStore('researchStudies', 'researchStudyId', [
            { name: 'canonicalIdentifier', keyPath: 'canonicalIdentifier' },
            { name: 'studyType', keyPath: 'studyType' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 104. V18 Study Protocols Store
          ensureStore('studyProtocols', 'protocolId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'version', keyPath: 'version' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 105. V18 Protocol Versions Store
          ensureStore('protocolVersions', 'versionId', [
            { name: 'protocolId', keyPath: 'protocolId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'versionNumber', keyPath: 'versionNumber' },
          ]);

          // 106. V18 Research Approvals Store
          ensureStore('researchApprovals', 'approvalId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'category', keyPath: 'category' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 107. V18 Study Sites Store
          ensureStore('studySites', 'studySiteId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'siteStatus', keyPath: 'siteStatus' },
          ]);

          // 108. V18 Study Team Members Store
          ensureStore('studyTeamMembers', 'studyTeamMemberId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'workforceMemberId', keyPath: 'workforceMemberId' },
            { name: 'role', keyPath: 'role' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 109. V18 Research Subjects Store
          ensureStore('researchSubjects', 'researchSubjectId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'patientReference', keyPath: 'patientReference' },
            { name: 'studySpecificIdentifier', keyPath: 'studySpecificIdentifier' },
            { name: 'studyPseudonym', keyPath: 'studyPseudonym' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 110. V18 Research Enrollments Store
          ensureStore('researchEnrollments', 'enrollmentId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'researchSubjectId', keyPath: 'researchSubjectId' },
            { name: 'siteId', keyPath: 'siteId' },
          ]);

          // 111. V18 Research Consents Store
          ensureStore('researchConsents', 'researchConsentId', [
            { name: 'researchSubjectId', keyPath: 'researchSubjectId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'patientReference', keyPath: 'patientReference' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 112. V18 Research Withdrawals Store
          ensureStore('researchWithdrawals', 'withdrawalId', [
            { name: 'researchSubjectId', keyPath: 'researchSubjectId' },
            { name: 'studyId', keyPath: 'studyId' },
          ]);

          // 113. V18 Research Milestones Store
          ensureStore('researchMilestones', 'milestoneId', [
            { name: 'researchSubjectId', keyPath: 'researchSubjectId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 114. V18 Research Cohorts Store
          ensureStore('researchCohorts', 'cohortId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'definitionReference', keyPath: 'definitionReference' },
          ]);

          // 115. V18 Research Cohort Definitions Store
          ensureStore('researchCohortDefinitions', 'definitionId', [
            { name: 'studyId', keyPath: 'studyId' },
          ]);

          // 116. V18 Research Datasets Store
          ensureStore('researchDatasets', 'datasetId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'datasetType', keyPath: 'datasetType' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 117. V18 Research Dataset Versions Store
          ensureStore('researchDatasetVersions', 'versionId', [
            { name: 'datasetId', keyPath: 'datasetId' },
            { name: 'versionNumber', keyPath: 'versionNumber' },
          ]);

          // 118. V18 Data Access Requests Store
          ensureStore('dataAccessRequests', 'requestId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'datasetId', keyPath: 'datasetId' },
            { name: 'requesterId', keyPath: 'requesterId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 119. V18 Data Access Decisions Store
          ensureStore('dataAccessDecisions', 'decisionId', [
            { name: 'requestId', keyPath: 'requestId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'datasetId', keyPath: 'datasetId' },
          ]);

          // 120. V18 Data Use Records Store
          ensureStore('dataUseRecords', 'recordId', [
            { name: 'requesterId', keyPath: 'requesterId' },
            { name: 'datasetId', keyPath: 'datasetId' },
            { name: 'studyId', keyPath: 'studyId' },
          ]);

          // 121. V18 Research Re-Identification Requests Store
          ensureStore('researchReIdentificationRequests', 'reIdentifyRequestId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'studyPseudonym', keyPath: 'studyPseudonym' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 122. V18 Study Visits Store
          ensureStore('studyVisits', 'studyVisitId', [
            { name: 'researchSubjectId', keyPath: 'researchSubjectId' },
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 123. V18 Study Tasks Store
          ensureStore('studyTasks', 'studyTaskId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'assignedTo', keyPath: 'assignedTo' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 124. V18 Research Events Store
          ensureStore('researchEvents', 'eventId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'eventType', keyPath: 'eventType' },
          ]);

          // 125. V18 Study Deviations Store
          ensureStore('studyDeviations', 'deviationId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'severity', keyPath: 'severity' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 126. V18 Study Safety Events Store
          ensureStore('studySafetyEvents', 'safetyEventId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'severity', keyPath: 'severity' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 127. V18 Research Specimens Store
          ensureStore('researchSpecimens', 'researchSpecimenId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'subjectPseudonym', keyPath: 'subjectPseudonym' },
            { name: 'processingStatus', keyPath: 'processingStatus' },
          ]);

          // 128. V18 Study Monitoring Records Store
          ensureStore('studyMonitoringRecords', 'monitoringId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'siteId', keyPath: 'siteId' },
          ]);

          // 129. V18 Statistical Analysis Plans Store
          ensureStore('statisticalAnalysisPlans', 'planId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'version', keyPath: 'version' },
          ]);

          // 130. V18 Study Outcome Definitions Store
          ensureStore('studyOutcomeDefinitions', 'outcomeId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'type', keyPath: 'type' },
          ]);

          // 131. V18 Evidence Variables Store
          ensureStore('evidenceVariables', 'variableId', [
            { name: 'variableType', keyPath: 'variableType' },
            { name: 'picoRole', keyPath: 'picoRole' },
          ]);

          // 132. V18 Evidence Records Store
          ensureStore('evidenceRecords', 'evidenceId', [
            { name: 'status', keyPath: 'status' },
            { name: 'version', keyPath: 'version' },
          ]);

          // 133. V18 Citation Records Store
          ensureStore('citationRecords', 'citationId', [
            { name: 'verificationStatus', keyPath: 'verificationStatus' },
          ]);

          // 134. V18 Evidence Sources Store
          ensureStore('evidenceSources', 'sourceId', [
            { name: 'sourceType', keyPath: 'sourceType' },
            { name: 'accessStatus', keyPath: 'accessStatus' },
          ]);

          // 135. V18 Evidence Assessments Store
          ensureStore('evidenceAssessments', 'assessmentId', [
            { name: 'evidenceId', keyPath: 'evidenceId' },
            { name: 'assessorId', keyPath: 'assessorId' },
          ]);

          // 136. V18 Evidence Syntheses Store
          ensureStore('evidenceSyntheses', 'synthesisId', [
            { name: 'status', keyPath: 'status' },
          ]);

          // 137. V18 Learning Cycles Store
          ensureStore('learningCycles', 'cycleId', [
            { name: 'status', keyPath: 'status' },
          ]);

          // 138. V18 Quality Improvement Projects Store
          ensureStore('qualityImprovementProjects', 'projectId', [
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 139. V18 Learning Findings Store
          ensureStore('learningFindings', 'findingId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'projectId', keyPath: 'projectId' },
          ]);

          // 140. V18 Practice Change Proposals Store
          ensureStore('practiceChangeProposals', 'proposalId', [
            { name: 'status', keyPath: 'status' },
          ]);

          // 141. V18 Knowledge Artifacts Store
          ensureStore('knowledgeArtifacts', 'artifactId', [
            { name: 'artifactType', keyPath: 'artifactType' },
            { name: 'approvalState', keyPath: 'approvalState' },
          ]);

          // 142. V18 Research Retention Policies Store
          ensureStore('researchRetentionPolicies', 'policyId', [
            { name: 'studyId', keyPath: 'studyId' },
          ]);

          // 143. V18 Research Quarantine Items Store
          ensureStore('researchQuarantineItems', 'quarantineId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'resourceType', keyPath: 'resourceType' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 144. V18 Research Outputs Store
          ensureStore('researchOutputs', 'outputId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 145. V18 Study Eligibility Candidates Store
          ensureStore('studyEligibilityCandidates', 'candidateId', [
            { name: 'studyId', keyPath: 'studyId' },
            { name: 'patientReference', keyPath: 'patientReference' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 146. V19 Ecosystem Systems Store
          ensureStore('ecosystemSystems', 'systemId', [
            { name: 'systemCode', keyPath: 'systemCode' },
            { name: 'systemType', keyPath: 'systemType' },
            { name: 'environment', keyPath: 'environment' },
            { name: 'trustLevel', keyPath: 'trustLevel' },
          ]);

          // 147. V19 Ecosystem Services Store
          ensureStore('ecosystemServices', 'serviceId', [
            { name: 'systemId', keyPath: 'systemId' },
            { name: 'serviceType', keyPath: 'serviceType' },
          ]);

          // 148. V19 Ecosystem Endpoints Store
          ensureStore('ecosystemEndpoints', 'endpointId', [
            { name: 'systemId', keyPath: 'systemId' },
            { name: 'environment', keyPath: 'environment' },
            { name: 'healthStatus', keyPath: 'healthStatus' },
          ]);

          // 149. V19 Ecosystem Capabilities Store
          ensureStore('ecosystemCapabilities', 'capabilityId', [
            { name: 'systemId', keyPath: 'systemId' },
          ]);

          // 150. V19 Ecosystem Trust Profiles Store
          ensureStore('ecosystemTrustProfiles', 'profileId', [
            { name: 'systemId', keyPath: 'systemId' },
            { name: 'trustLevel', keyPath: 'trustLevel' },
          ]);

          // 151. V19 National Integrations Store
          ensureStore('nationalIntegrations', 'integrationId', [
            { name: 'systemId', keyPath: 'systemId' },
            { name: 'status', keyPath: 'status' },
            { name: 'environment', keyPath: 'environment' },
          ]);

          // 152. V19 National Integration Profiles Store
          ensureStore('nationalIntegrationProfiles', 'profileId', [
            { name: 'integrationId', keyPath: 'integrationId' },
          ]);

          // 153. V19 National Exchange Policies Store
          ensureStore('nationalExchangePolicies', 'policyId', [
            { name: 'integrationId', keyPath: 'integrationId' },
            { name: 'purpose', keyPath: 'purpose' },
          ]);

          // 154. V19 National Exchange Messages Store
          ensureStore('nationalExchangeMessages', 'messageId', [
            { name: 'integrationId', keyPath: 'integrationId' },
            { name: 'state', keyPath: 'state' },
            { name: 'correlationId', keyPath: 'correlationId' },
            { name: 'idempotencyKey', keyPath: 'idempotencyKey' },
          ]);

          // 155. V19 National Exchange Attempts Store
          ensureStore('nationalExchangeAttempts', 'attemptId', [
            { name: 'messageId', keyPath: 'messageId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 156. V19 National Exchange Acknowledgements Store
          ensureStore('nationalExchangeAcknowledgements', 'acknowledgementId', [
            { name: 'messageId', keyPath: 'messageId' },
            { name: 'ackType', keyPath: 'ackType' },
          ]);

          // 157. V19 Facility Registry References Store
          ensureStore('facilityRegistryReferences', 'referenceId', [
            { name: 'mfrFacilityId', keyPath: 'mfrFacilityId' },
            { name: 'region', keyPath: 'region' },
            { name: 'freshness', keyPath: 'freshness' },
          ]);

          // 158. V19 Facility Registry Syncs Store
          ensureStore('facilityRegistrySyncs', 'syncId', [
            { name: 'status', keyPath: 'status' },
          ]);

          // 159. V19 Facility Registry Mappings Store
          ensureStore('facilityRegistryMappings', 'mappingId', [
            { name: 'localFacilityId', keyPath: 'localFacilityId' },
            { name: 'externalFacilityId', keyPath: 'externalFacilityId' },
            { name: 'mappingStatus', keyPath: 'mappingStatus' },
          ]);

          // 160. V19 Facility Registry Conflicts Store
          ensureStore('facilityRegistryConflicts', 'conflictId', [
            { name: 'localFacilityId', keyPath: 'localFacilityId' },
            { name: 'mfrFacilityId', keyPath: 'mfrFacilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 161. V19 Terminology Systems Store
          ensureStore('terminologySystems', 'systemId', [
            { name: 'uri', keyPath: 'uri' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 162. V19 Terminology Bindings Store
          ensureStore('terminologyBindings', 'bindingId', [
            { name: 'context', keyPath: 'context' },
          ]);

          // 163. V19 Terminology Maps Store
          ensureStore('terminologyMaps', 'mapId', [
            { name: 'localCode', keyPath: 'localCode' },
            { name: 'targetCode', keyPath: 'targetCode' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 164. V19 Terminology Versions Store
          ensureStore('terminologyVersions', 'versionId', [
            { name: 'systemId', keyPath: 'systemId' },
            { name: 'isCurrent', keyPath: 'isCurrent' },
          ]);

          // 165. V19 Terminology Conflicts Store
          ensureStore('terminologyConflicts', 'conflictId', [
            { name: 'localCode', keyPath: 'localCode' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 166. V19 National Reporting Profiles Store
          ensureStore('nationalReportingProfiles', 'profileId', [
            { name: 'reportingSystem', keyPath: 'reportingSystem' },
          ]);

          // 167. V19 Reporting Datasets Store
          ensureStore('reportingDatasets', 'datasetId', [
            { name: 'profileId', keyPath: 'profileId' },
            { name: 'reportingPeriod', keyPath: 'reportingPeriod' },
            { name: 'facilityId', keyPath: 'facilityId' },
          ]);

          // 168. V19 Reporting Submissions Store
          ensureStore('reportingSubmissions', 'submissionId', [
            { name: 'datasetId', keyPath: 'datasetId' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'state', keyPath: 'state' },
          ]);

          // 169. V19 Reporting Responses Store
          ensureStore('reportingResponses', 'responseId', [
            { name: 'submissionId', keyPath: 'submissionId' },
          ]);

          // 170. V19 Reporting Corrections Store
          ensureStore('reportingCorrections', 'correctionId', [
            { name: 'originalSubmissionId', keyPath: 'originalSubmissionId' },
          ]);

          // 171. V19 National Identity References Store
          ensureStore('nationalIdentityReferences', 'referenceId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'verificationState', keyPath: 'verificationState' },
          ]);

          // 172. V19 Identity Verification Requests Store
          ensureStore('identityVerificationRequests', 'requestId', [
            { name: 'patientId', keyPath: 'patientId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 173. V19 Identity Verification Responses Store
          ensureStore('identityVerificationResponses', 'responseId', [
            { name: 'requestId', keyPath: 'requestId' },
          ]);

          // 174. V19 Surveillance Signals Store
          ensureStore('surveillanceSignals', 'signalId', [
            { name: 'indicator', keyPath: 'indicator' },
            { name: 'state', keyPath: 'state' },
          ]);

          // 175. V19 Surveillance Reports Store
          ensureStore('surveillanceReports', 'reportId', [
            { name: 'signalId', keyPath: 'signalId' },
            { name: 'reportingFacilityId', keyPath: 'reportingFacilityId' },
          ]);

          // 176. V19 Surveillance Submissions Store
          ensureStore('surveillanceSubmissions', 'submissionId', [
            { name: 'reportId', keyPath: 'reportId' },
            { name: 'state', keyPath: 'state' },
          ]);

          // 177. V19 National Integration Approvals Store
          ensureStore('nationalIntegrationApprovals', 'approvalId', [
            { name: 'integrationId', keyPath: 'integrationId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 178. V19 Integration Credential References Store
          ensureStore('integrationCredentialReferences', 'credentialId', [
            { name: 'integrationId', keyPath: 'integrationId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 179. V19 Ecosystem Quarantine Items Store
          ensureStore('ecosystemQuarantineItems', 'quarantineId', [
            { name: 'category', keyPath: 'category' },
            { name: 'status', keyPath: 'status' },
            { name: 'sourceSystem', keyPath: 'sourceSystem' },
          ]);

          // 180. V20 System Observations Store
          ensureStore('systemObservations', 'observationId', [
            { name: 'source', keyPath: 'source' },
            { name: 'metric', keyPath: 'metric' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'quality', keyPath: 'quality' },
          ]);

          // 181. V20 System Health Snapshots Store
          ensureStore('systemHealthSnapshots', 'snapshotId', [
            { name: 'overallHealth', keyPath: 'overallHealth' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 182. V20 Cross-Domain Signals Store
          ensureStore('crossDomainSignals', 'signalId', [
            { name: 'severity', keyPath: 'severity' },
            { name: 'detectedAt', keyPath: 'detectedAt' },
          ]);

          // 183. V20 Intelligence Events Store
          ensureStore('intelligenceEvents', 'eventId', [
            { name: 'eventType', keyPath: 'eventType' },
            { name: 'domain', keyPath: 'domain' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 184. V20 Intelligence Correlations Store
          ensureStore('intelligenceCorrelations', 'correlationId', [
            { name: 'confidence', keyPath: 'confidence' },
            { name: 'generatedAt', keyPath: 'generatedAt' },
          ]);

          // 185. V20 System Risks Store
          ensureStore('systemRisks', 'riskId', [
            { name: 'riskType', keyPath: 'riskType' },
            { name: 'state', keyPath: 'state' },
            { name: 'detectedAt', keyPath: 'detectedAt' },
          ]);

          // 186. V20 Optimization Recommendations Store
          ensureStore('optimizationRecommendations', 'recommendationId', [
            { name: 'domain', keyPath: 'domain' },
            { name: 'status', keyPath: 'status' },
            { name: 'createdAt', keyPath: 'createdAt' },
          ]);

          // 187. V20 Automation Recommendations Store
          ensureStore('automationRecommendations', 'recommendationId', [
            { name: 'ruleId', keyPath: 'ruleId' },
            { name: 'status', keyPath: 'status' },
            { name: 'riskLevel', keyPath: 'riskLevel' },
          ]);

          // 188. V20 Decision Contexts Store
          ensureStore('decisionContexts', 'contextId', [
            { name: 'decisionType', keyPath: 'decisionType' },
            { name: 'riskClassification', keyPath: 'riskClassification' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 189. V20 Decision Evidence Store
          ensureStore('decisionEvidence', 'evidenceId', [
            { name: 'source', keyPath: 'source' },
            { name: 'metric', keyPath: 'metric' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 190. V20 Human Approvals Store
          ensureStore('humanApprovals', 'approvalId', [
            { name: 'recommendationOrActionId', keyPath: 'recommendationOrActionId' },
            { name: 'decision', keyPath: 'decision' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 191. V20 Automation Policies Store
          ensureStore('automationPolicies', 'policyId', [
            { name: 'actionType', keyPath: 'actionType' },
            { name: 'riskLevel', keyPath: 'riskLevel' },
            { name: 'version', keyPath: 'version' },
          ]);

          // 192. V20 Automation Rules Store
          ensureStore('automationRules', 'ruleId', [
            { name: 'actionType', keyPath: 'actionType' },
            { name: 'enabled', keyPath: 'enabled' },
            { name: 'version', keyPath: 'version' },
          ]);

          // 193. V20 Automation Actions Store
          ensureStore('automationActions', 'actionId', [
            { name: 'ruleId', keyPath: 'ruleId' },
            { name: 'policyId', keyPath: 'policyId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 194. V20 Automation Guards Store
          ensureStore('automationGuards', 'guardId', [
            { name: 'actionId', keyPath: 'actionId' },
            { name: 'result', keyPath: 'result' },
            { name: 'checkedAt', keyPath: 'checkedAt' },
          ]);

          // 195. V20 Automation Executions Store
          ensureStore('automationExecutions', 'executionId', [
            { name: 'actionId', keyPath: 'actionId' },
            { name: 'policyId', keyPath: 'policyId' },
            { name: 'result', keyPath: 'result' },
            { name: 'startTime', keyPath: 'startTime' },
          ]);

          // 196. V20 Automation Rollbacks Store
          ensureStore('automationRollbacks', 'rollbackId', [
            { name: 'originalExecutionId', keyPath: 'originalExecutionId' },
            { name: 'result', keyPath: 'result' },
            { name: 'executedAt', keyPath: 'executedAt' },
          ]);

          // 197. V20 Automation Budgets Store
          ensureStore('automationBudgets', 'budgetId', [
            { name: 'period', keyPath: 'period' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 198. V20 Sync Healing Plans Store
          ensureStore('syncHealingPlans', 'planId', [
            { name: 'detectedIssue', keyPath: 'detectedIssue' },
            { name: 'status', keyPath: 'status' },
            { name: 'sourceQueue', keyPath: 'sourceQueue' },
          ]);

          // 199. V20 Integration Recovery Plans Store
          ensureStore('integrationRecoveryPlans', 'planId', [
            { name: 'integrationId', keyPath: 'integrationId' },
            { name: 'circuitState', keyPath: 'circuitState' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 200. V20 Queue Recovery Plans Store
          ensureStore('queueRecoveryPlans', 'planId', [
            { name: 'queueName', keyPath: 'queueName' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 201. V20 Data Repair Proposals Store
          ensureStore('dataRepairProposals', 'proposalId', [
            { name: 'targetStore', keyPath: 'targetStore' },
            { name: 'classification', keyPath: 'classification' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 202. V20 Recovery Executions Store
          ensureStore('recoveryExecutions', 'recoveryExecutionId', [
            { name: 'planId', keyPath: 'planId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 203. V20 Capacity States Store
          ensureStore('capacityStates', 'stateId', [
            { name: 'domain', keyPath: 'domain' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'state', keyPath: 'state' },
          ]);

          // 204. V20 Capacity Constraints Store
          ensureStore('capacityConstraints', 'constraintId', [
            { name: 'domain', keyPath: 'domain' },
            { name: 'facilityId', keyPath: 'facilityId' },
          ]);

          // 205. V20 Capacity Balancing Recommendations Store
          ensureStore('capacityBalancingRecommendations', 'recommendationId', [
            { name: 'domain', keyPath: 'domain' },
            { name: 'facilityId', keyPath: 'facilityId' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 206. V20 Workflow Orchestrations Store
          ensureStore('workflowOrchestrations', 'orchestrationId', [
            { name: 'name', keyPath: 'name' },
            { name: 'status', keyPath: 'status' },
            { name: 'correlationId', keyPath: 'correlationId' },
          ]);

          // 207. V20 Workflow Actions Store
          ensureStore('workflowActions', 'actionId', [
            { name: 'targetDomain', keyPath: 'targetDomain' },
            { name: 'status', keyPath: 'status' },
          ]);

          // 208. V20 Workflow Checkpoints Store
          ensureStore('workflowCheckpoints', 'checkpointId', [
            { name: 'orchestrationId', keyPath: 'orchestrationId' },
            { name: 'stepIndex', keyPath: 'stepIndex' },
          ]);

          // 209. V20 Workflow Compensations Store
          ensureStore('workflowCompensations', 'compensationId', [
            { name: 'orchestrationId', keyPath: 'orchestrationId' },
            { name: 'actionId', keyPath: 'actionId' },
          ]);

          // 210. V20 System Incidents Store
          ensureStore('systemIncidents', 'incidentId', [
            { name: 'category', keyPath: 'category' },
            { name: 'severity', keyPath: 'severity' },
            { name: 'status', keyPath: 'status' },
            { name: 'detectedAt', keyPath: 'detectedAt' },
          ]);

          // 211. V20 Root Cause Analyses Store
          ensureStore('rootCauseAnalyses', 'analysisId', [
            { name: 'incidentId', keyPath: 'incidentId' },
            { name: 'generatedAt', keyPath: 'generatedAt' },
          ]);

          // 212. V20 Incident Response Playbooks Store
          ensureStore('incidentResponsePlaybooks', 'playbookId', [
            { name: 'category', keyPath: 'category' },
          ]);

          // 213. V20 Security Automation Policies Store
          ensureStore('securityAutomationPolicies', 'policyId', [
            { name: 'triggerType', keyPath: 'triggerType' },
            { name: 'automatedAction', keyPath: 'automatedAction' },
          ]);

          // 214. V20 System Intelligence Telemetry Store
          ensureStore('systemIntelligenceTelemetry', 'telemetryId', [
            { name: 'metricName', keyPath: 'metricName' },
            { name: 'timestamp', keyPath: 'timestamp' },
          ]);

          // 215. V20 Simulation Scenarios Store
          ensureStore('simulationScenarios', 'scenarioId', [
            { name: 'name', keyPath: 'name' },
            { name: 'createdAt', keyPath: 'createdAt' },
          ]);

          // 216. V20 Automation Governance Policies Store
          ensureStore('automationGovernancePolicies', 'policyId', [
            { name: 'version', keyPath: 'version' },
          ]);

          // 217. V20 Action Risk Classifications Store
          ensureStore('actionRiskClassifications', 'classificationId', [
            { name: 'actionType', keyPath: 'actionType' },
            { name: 'riskLevel', keyPath: 'riskLevel' },
          ]);

          // 218. V20 Automation Permissions Store
          ensureStore('automationPermissions', 'permissionId', [
            { name: 'principalId', keyPath: 'principalId' },
            { name: 'validUntil', keyPath: 'validUntil' },
          ]);

          // 219. V20 Automation Audit Entries Store
          ensureStore('automationAuditEntries', 'auditId', [
            { name: 'actionId', keyPath: 'actionId' },
            { name: 'riskLevel', keyPath: 'riskLevel' },
            { name: 'timestamp', keyPath: 'timestamp' },
            { name: 'correlationId', keyPath: 'correlationId' },
          ]);

          // 220-254. V21 Production Hardening & Disaster Recovery Stores
          ensureStore('deploymentEnvironments', 'environment', [{ name: 'version', keyPath: 'version' }]);
          ensureStore('secretReferences', 'secretId', [{ name: 'name', keyPath: 'name' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('configurationSnapshots', 'snapshotId', [{ name: 'environment', keyPath: 'environment' }, { name: 'timestamp', keyPath: 'timestamp' }]);
          ensureStore('featureFlags', 'flagId', [{ name: 'status', keyPath: 'status' }, { name: 'environment', keyPath: 'environment' }]);
          ensureStore('backupArchives', 'backupId', [{ name: 'environment', keyPath: 'environment' }, { name: 'timestamp', keyPath: 'timestamp' }, { name: 'integrityStatus', keyPath: 'integrityStatus' }]);
          ensureStore('backupVerifications', 'verificationId', [{ name: 'backupId', keyPath: 'backupId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('restoreExecutions', 'restoreId', [{ name: 'backupId', keyPath: 'backupId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('recoveryPoints', 'pointId', [{ name: 'timestamp', keyPath: 'timestamp' }, { name: 'integrityState', keyPath: 'integrityState' }]);
          ensureStore('disasterRecoveryPlans', 'planId', [{ name: 'category', keyPath: 'category' }]);
          ensureStore('disasterRecoveryTests', 'testId', [{ name: 'planId', keyPath: 'planId' }, { name: 'result', keyPath: 'result' }]);
          ensureStore('dataIntegrityAudits', 'auditId', [{ name: 'timestamp', keyPath: 'timestamp' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('schemaMigrations', 'migrationId', [{ name: 'sourceVersion', keyPath: 'sourceVersion' }, { name: 'targetVersion', keyPath: 'targetVersion' }]);
          ensureStore('deviceHealthRecords', 'deviceId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'indexedDbStatus', keyPath: 'indexedDbStatus' }]);
          ensureStore('facilityDeploymentProfiles', 'facilityId', [{ name: 'status', keyPath: 'status' }]);
          ensureStore('facilityOnboardingWorkflows', 'workflowId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'currentStage', keyPath: 'currentStage' }]);
          ensureStore('pilotFacilities', 'pilotId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'supportStatus', keyPath: 'supportStatus' }]);
          ensureStore('syntheticDataRecords', 'syntheticRecordId', [{ name: 'entityType', keyPath: 'entityType' }, { name: 'facilityScope', keyPath: 'facilityScope' }]);
          ensureStore('dataImportJobs', 'jobId', [{ name: 'domain', keyPath: 'domain' }, { name: 'facilityId', keyPath: 'facilityId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('importQuarantineRecords', 'quarantineId', [{ name: 'jobId', keyPath: 'jobId' }, { name: 'domain', keyPath: 'domain' }]);
          ensureStore('operationalSupportCases', 'caseId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'severity', keyPath: 'severity' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('operationalAlerts', 'alertId', [{ name: 'alertType', keyPath: 'alertType' }, { name: 'severity', keyPath: 'severity' }, { name: 'facilityId', keyPath: 'facilityId' }]);
          ensureStore('securityIncidents', 'incidentId', [{ name: 'threatType', keyPath: 'threatType' }, { name: 'timestamp', keyPath: 'timestamp' }]);
          ensureStore('auditRetentionArchives', 'archiveId', [{ name: 'exportFormat', keyPath: 'exportFormat' }]);
          ensureStore('maintenanceWindows', 'windowId', [{ name: 'isActive', keyPath: 'isActive' }, { name: 'scope', keyPath: 'scope' }]);
          ensureStore('trainingReadinessRecords', 'trainingId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'role', keyPath: 'role' }]);
          ensureStore('pilotMetrics', 'metricId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'category', keyPath: 'category' }]);
          ensureStore('userFeedbackEntries', 'feedbackId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'category', keyPath: 'category' }]);
          ensureStore('changeRequests', 'requestId', [{ name: 'status', keyPath: 'status' }, { name: 'riskLevel', keyPath: 'riskLevel' }]);
          ensureStore('releaseRecords', 'releaseId', [{ name: 'version', keyPath: 'version' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('releaseArtifacts', 'artifactId', [{ name: 'version', keyPath: 'version' }, { name: 'buildStatus', keyPath: 'buildStatus' }]);
          ensureStore('dependencySecurityReports', 'reportId', [{ name: 'approvalStatus', keyPath: 'approvalStatus' }]);
          ensureStore('incidentForensicTimelines', 'eventId', [{ name: 'incidentId', keyPath: 'incidentId' }]);
          ensureStore('supportDiagnosticBundles', 'bundleId', [{ name: 'facilityId', keyPath: 'facilityId' }]);
          ensureStore('pilotGoLiveReports', 'reportId', [{ name: 'pilotId', keyPath: 'pilotId' }, { name: 'facilityId', keyPath: 'facilityId' }]);
          ensureStore('pilotReviews', 'reviewId', [{ name: 'pilotId', keyPath: 'pilotId' }, { name: 'status', keyPath: 'status' }]);

          // 255-274. V22 Clinical Validation, Quality & Safety Assurance Stores
          ensureStore('clinicalSafetyCases', 'caseId', [{ name: 'status', keyPath: 'status' }, { name: 'systemVersion', keyPath: 'systemVersion' }]);
          ensureStore('clinicalSafetyClaims', 'claimId', [{ name: 'caseId', keyPath: 'caseId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('clinicalSafetyEvidence', 'evidenceId', [{ name: 'evidenceType', keyPath: 'evidenceType' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('clinicalHazards', 'hazardId', [{ name: 'category', keyPath: 'category' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('hazardRiskAssessments', 'assessmentId', [{ name: 'hazardId', keyPath: 'hazardId' }]);
          ensureStore('fmeaAnalyses', 'fmeaId', [{ name: 'processName', keyPath: 'processName' }]);
          ensureStore('workflowValidationMatrices', 'workflowId', [{ name: 'validationStatus', keyPath: 'validationStatus' }]);
          ensureStore('clinicalSafetyScenarios', 'scenarioId', [{ name: 'workflowId', keyPath: 'workflowId' }]);
          ensureStore('aiValidationStudies', 'studyId', [{ name: 'capability', keyPath: 'capability' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('aiEvaluationCases', 'caseId', [{ name: 'studyId', keyPath: 'studyId' }, { name: 'outcome', keyPath: 'outcome' }]);
          ensureStore('aiEvaluationResults', 'resultId', [{ name: 'caseId', keyPath: 'caseId' }]);
          ensureStore('clinicalEvidenceProvenance', 'evidenceId', [{ name: 'sourceType', keyPath: 'sourceType' }]);
          ensureStore('clinicalUsabilityStudies', 'studyId', [{ name: 'participantRole', keyPath: 'participantRole' }]);
          ensureStore('clinicalAlertGovernance', 'ruleId', [{ name: 'alertType', keyPath: 'alertType' }, { name: 'clinicalDomain', keyPath: 'clinicalDomain' }]);
          ensureStore('clinicalSafetyIncidents', 'incidentId', [{ name: 'incidentType', keyPath: 'incidentType' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('clinicalCAPARecords', 'capaId', [{ name: 'incidentId', keyPath: 'incidentId' }]);
          ensureStore('clinicalValidationGates', 'gateId', [{ name: 'domain', keyPath: 'domain' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('clinicalLimitations', 'limitationId', [{ name: 'affectedWorkflow', keyPath: 'affectedWorkflow' }]);
          ensureStore('clinicalCompetencyRecords', 'recordId', [{ name: 'userId', keyPath: 'userId' }, { name: 'role', keyPath: 'role' }]);
          ensureStore('pilotValidationPackets', 'packetId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'systemVersion', keyPath: 'systemVersion' }]);

          // 275-293. V23 Controlled Pilot Deployment, Operations & Real-World Evidence Stores
          ensureStore('pilotPrograms', 'programId', [{ name: 'status', keyPath: 'status' }]);
          ensureStore('pilotSites', 'siteId', [{ name: 'programId', keyPath: 'programId' }, { name: 'currentPhase', keyPath: 'currentPhase' }]);
          ensureStore('pilotSiteAssessments', 'assessmentId', [{ name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('pilotConfigurations', 'configId', [{ name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('pilotGoLiveGates', 'gateId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('pilotOperationalTelemetry', 'telemetryId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'deviceId', keyPath: 'deviceId' }]);
          ensureStore('pilotWorkflowMetrics', 'metricId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'workflowType', keyPath: 'workflowType' }]);
          ensureStore('pilotEvidenceArtifacts', 'artifactId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'category', keyPath: 'category' }]);
          ensureStore('pilotSafetyIncidents', 'incidentId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'severity', keyPath: 'severity' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('pilotEscalations', 'escalationId', [{ name: 'incidentId', keyPath: 'incidentId' }, { name: 'level', keyPath: 'level' }]);
          ensureStore('pilotKillSwitchEvents', 'eventId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'action', keyPath: 'action' }]);
          ensureStore('pilotAIGovernanceRecords', 'recordId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'capability', keyPath: 'capability' }]);
          ensureStore('pilotReleaseDeployments', 'deploymentId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('pilotChangeRequests', 'requestId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('pilotSupportCases', 'caseId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('pilotDataQualityAudits', 'auditId', [{ name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('pilotTrainingRecords', 'trainingId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'userId', keyPath: 'userId' }]);
          ensureStore('pilotUserFeedback', 'feedbackId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'priority', keyPath: 'priority' }]);
          ensureStore('pilotSiteReports', 'reportId', [{ name: 'siteId', keyPath: 'siteId' }]);

          // 294-313. V24 Multi-Site Pilot, Comparative Evidence & Scale Decision Stores
          ensureStore('evidencePrograms', 'programId', [{ name: 'status', keyPath: 'status' }]);
          ensureStore('pilotSiteGroups', 'groupId', [{ name: 'programId', keyPath: 'programId' }]);
          ensureStore('siteEnrollments', 'enrollmentId', [{ name: 'programId', keyPath: 'programId' }, { name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('comparabilityAssessments', 'assessmentId', [{ name: 'programId', keyPath: 'programId' }, { name: 'baseSiteId', keyPath: 'baseSiteId' }]);
          ensureStore('standardizedMetricCatalog', 'metricId', [{ name: 'category', keyPath: 'category' }, { name: 'version', keyPath: 'version' }]);
          ensureStore('pilotMetricObservations', 'observationId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'metricId', keyPath: 'metricId' }]);
          ensureStore('normalizedMetricMeasurements', 'measurementId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'metricId', keyPath: 'metricId' }]);
          ensureStore('comparativeAnalyses', 'analysisId', [{ name: 'programId', keyPath: 'programId' }, { name: 'metricId', keyPath: 'metricId' }]);
          ensureStore('siteImplementationMaturities', 'maturityId', [{ name: 'siteId', keyPath: 'siteId' }, { name: 'currentLevel', keyPath: 'currentLevel' }]);
          ensureStore('programRiskRegisters', 'riskId', [{ name: 'programId', keyPath: 'programId' }, { name: 'severity', keyPath: 'severity' }]);
          ensureStore('crossSiteIncidentCorrelations', 'correlationId', [{ name: 'programId', keyPath: 'programId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('multiSiteConfigurationDrifts', 'driftId', [{ name: 'programId', keyPath: 'programId' }, { name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('multiSiteAIEvaluations', 'evaluationId', [{ name: 'programId', keyPath: 'programId' }, { name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('offlineConditionAnalyses', 'analysisId', [{ name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('pilotLearningRecords', 'learningId', [{ name: 'programId', keyPath: 'programId' }, { name: 'phase', keyPath: 'phase' }]);
          ensureStore('evidenceQualityRatings', 'ratingId', [{ name: 'targetEntityId', keyPath: 'targetEntityId' }, { name: 'level', keyPath: 'level' }]);
          ensureStore('scaleDecisionRecords', 'decisionId', [{ name: 'programId', keyPath: 'programId' }, { name: 'decisionType', keyPath: 'decisionType' }]);
          ensureStore('expansionGateEvaluations', 'gateId', [{ name: 'programId', keyPath: 'programId' }, { name: 'scope', keyPath: 'scope' }]);
          ensureStore('multiSiteEvidencePackets', 'packetId', [{ name: 'programId', keyPath: 'programId' }]);
          ensureStore('multiSiteUserFeedback', 'feedbackId', [{ name: 'programId', keyPath: 'programId' }, { name: 'siteId', keyPath: 'siteId' }]);
          ensureStore('tenants', 'tenantId', [{ name: 'name', keyPath: 'name' }]);
          ensureStore('organizations', 'organizationId', [{ name: 'tenantId', keyPath: 'tenantId' }]);
          ensureStore('organizationFacilities', 'facilityId', [{ name: 'organizationId', keyPath: 'organizationId' }, { name: 'tenantId', keyPath: 'tenantId' }]);
          ensureStore('deploymentsMaster', 'deploymentId', [{ name: 'tenantId', keyPath: 'tenantId' }, { name: 'facilityId', keyPath: 'facilityId' }]);
          ensureStore('deploymentTemplates', 'templateId', [{ name: 'environment', keyPath: 'environment' }]);
          ensureStore('rolloutWaves', 'waveId', [{ name: 'releaseId', keyPath: 'releaseId' }, { name: 'stage', keyPath: 'stage' }]);
          ensureStore('edgeDevices', 'deviceId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'lifecycleState', keyPath: 'lifecycleState' }]);
          ensureStore('topologyNodes', 'nodeId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'topologyRole', keyPath: 'topologyRole' }]);
          ensureStore('capacityMetrics', 'observationId', [{ name: 'tenantId', keyPath: 'tenantId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('serviceHealthObservations', 'healthId', [{ name: 'tenantId', keyPath: 'tenantId' }, { name: 'serviceName', keyPath: 'serviceName' }]);
          ensureStore('supportCases', 'caseId', [{ name: 'organizationId', keyPath: 'organizationId' }, { name: 'status', keyPath: 'status' }]);
          ensureStore('customerAccounts', 'accountId', [{ name: 'tenantId', keyPath: 'tenantId' }, { name: 'lifecycleState', keyPath: 'lifecycleState' }]);
          ensureStore('commercialContracts', 'contractId', [{ name: 'organizationId', keyPath: 'organizationId' }]);
          ensureStore('commercialEntitlements', 'entitlementId', [{ name: 'organizationId', keyPath: 'organizationId' }]);
          ensureStore('implementationProjects', 'projectId', [{ name: 'organizationId', keyPath: 'organizationId' }, { name: 'currentPhase', keyPath: 'currentPhase' }]);
          ensureStore('migrationPackages', 'migrationId', [{ name: 'facilityId', keyPath: 'facilityId' }]);
          ensureStore('externalSystemIntegrations', 'integrationId', [{ name: 'organizationId', keyPath: 'organizationId' }, { name: 'currentState', keyPath: 'currentState' }]);
          ensureStore('securityOperations', 'findingId', [{ name: 'tenantId', keyPath: 'tenantId' }, { name: 'severity', keyPath: 'severity' }]);
          ensureStore('dataGovernancePolicies', 'policyId', [{ name: 'tenantId', keyPath: 'tenantId' }]);
          ensureStore('businessContinuityDrills', 'drillId', [{ name: 'facilityId', keyPath: 'facilityId' }, { name: 'scenario', keyPath: 'scenario' }]);
          ensureStore('operationalEconomics', 'costId', [{ name: 'organizationId', keyPath: 'organizationId' }, { name: 'classification', keyPath: 'classification' }]);
          ensureStore('scaleReadinessPackets', 'packetId', [{ name: 'organizationId', keyPath: 'organizationId' }]);
        };

        req.onsuccess = () => {
          if (!settled) {
            settled = true;
            const db = req.result;
            db.onclose = () => {
              this.dbPromise = null;
            };
            db.onversionchange = () => {
              try { db.close(); } catch {}
              this.dbPromise = null;
            };
            resolve(db);
          }
        };

        req.onerror = () => {
          safeReject(req.error || new Error('[IndexedDbEngine] Failed to open IndexedDB database'));
        };

        req.onblocked = () => {
          safeReject(new Error('[IndexedDbEngine] IndexedDB open blocked by another connection'));
        };
      } catch (syncErr) {
        safeReject(syncErr);
      }
    });

    return this.dbPromise;
  }

  /**
   * Put an entity into a store
   * Enforces true IndexedDB transaction durability: resolves ONLY when tx.oncomplete fires.
   * If request or transaction errors, aborts, or database is unavailable, rejects and leaves
   * in-memory fallback completely untouched.
   */
  public async put<T extends Record<string, any>>(storeName: StoreName, item: T): Promise<void> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably commit write');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot durably commit write to ${storeName}`);
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const target = normalizeItemForStore(store, item, storeName);
        const targetKey = extractItemKey(target, storeName);

        // Durability contract: commit acknowledgement happens ONLY upon transaction completion
        tx.oncomplete = () => {
          if (targetKey) {
            this.memoryFallback.get(storeName)?.set(targetKey, target);
          }
          safeResolve();
        };

        tx.onerror = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Transaction failed on store ${storeName}`));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Transaction aborted on store ${storeName}`));
        };

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          return;
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          safeReject(new Error(`[IndexedDbEngine] Write request failed on store ${storeName}: simulated request error`));
          return;
        }

        let req: IDBRequest;
        try {
          if (store.keyPath === null || store.keyPath === undefined) {
            req = store.put(target, targetKey);
          } else {
            req = store.put(target);
          }
        } catch (innerErr) {
          try {
            if (typeof store.keyPath === 'string' && store.keyPath) {
              (target as any)[store.keyPath] = targetKey;
            }
            (target as any).id = targetKey;
            req = store.keyPath === null ? store.put(target, targetKey) : store.put(target);
          } catch (writeErr) {
            try { tx.abort(); } catch {}
            safeReject(writeErr);
            return;
          }
        }

        req.onsuccess = () => {
          // Request processed, waiting for transaction commit
        };

        req.onerror = () => {
          const err = req.error || new Error(`[IndexedDbEngine] Write request failed on store ${storeName}`);
          try { tx.abort(); } catch {}
          safeReject(err);
        };
      } catch (syncErr) {
        safeReject(syncErr);
      }
    });
  }

  /**
   * Bulk put entities in a transaction
   * Durability contract: resolves ONLY when tx.oncomplete fires.
   * If any error occurs or the transaction aborts, rejects and leaves in-memory fallback untouched.
   */
  public async putBatch<T extends Record<string, any>>(storeName: StoreName, items: T[]): Promise<void> {
    if (items.length === 0) return;

    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably commit write');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot durably commit write to ${storeName}`);
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const stagedItems: Array<{ key: string; item: any }> = [];

        tx.oncomplete = () => {
          stagedItems.forEach(({ key, item }) => {
            if (key) {
              this.memoryFallback.get(storeName)?.set(key, item);
            }
          });
          safeResolve();
        };

        tx.onerror = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] putBatch transaction failed on ${storeName}`));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] putBatch transaction aborted on ${storeName}`));
        };

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          return;
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          safeReject(new Error(`[IndexedDbEngine] Put request failed in batch on ${storeName}: simulated request error`));
          return;
        }

        for (const item of items) {
          try {
            const target = normalizeItemForStore(store, item, storeName);
            const targetKey = extractItemKey(target, storeName);
            if (targetKey) {
              stagedItems.push({ key: targetKey, item: target });
            }

            let req: IDBRequest;
            if (store.keyPath === null || store.keyPath === undefined) {
              req = store.put(target, targetKey);
            } else {
              req = store.put(target);
            }

            req.onerror = () => {
              const err = req.error || new Error(`[IndexedDbEngine] Put request failed in batch on ${storeName}`);
              try { tx.abort(); } catch {}
              safeReject(err);
            };
          } catch (writeErr) {
            try { tx.abort(); } catch {}
            safeReject(writeErr);
            return;
          }
        }
      } catch (syncErr) {
        safeReject(syncErr);
      }
    });
  }

  /**
   * Execute an atomic transaction across multiple stores.
   * If any step fails, all operations within the transaction are rolled back.
   */
  public async executeTransaction<R>(
    storeNames: StoreName[],
    operation: (txContext: ITransactionContext) => Promise<R>,
    preconditions?: TransactionPrecondition[]
  ): Promise<R> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably execute transaction');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error('[IndexedDbEngine] Cannot execute transaction: IndexedDB unavailable');
    }

    const stagedChanges: Array<{ store: StoreName; action: 'put' | 'delete'; key: string; item?: any }> = [];
    const stagedPreconditions: TransactionPrecondition[] = preconditions ? [...preconditions] : [];
    const localStaged = new Map<StoreName, Map<string, any>>();
    storeNames.forEach((s) => localStaged.set(s, new Map()));

    const txContext: ITransactionContext = {
      put: async <T extends Record<string, any>>(storeName: StoreName, item: T): Promise<void> => {
        const key = extractItemKey(item, storeName);
        if (key) {
          stagedChanges.push({ store: storeName, action: 'put', key, item });
          localStaged.get(storeName)?.set(key, item);
        }
      },
      get: async <T>(storeName: StoreName, key: string): Promise<T | undefined> => {
        const stagedVal = localStaged.get(storeName)?.get(key);
        if (stagedVal !== undefined) return stagedVal as T;
        return this.get<T>(storeName, key);
      },
      delete: async (storeName: StoreName, key: string): Promise<void> => {
        stagedChanges.push({ store: storeName, action: 'delete', key });
        localStaged.get(storeName)?.delete(key);
      },
      assertPrecondition: (precondition: TransactionPrecondition): void => {
        stagedPreconditions.push(precondition);
      },
    };

    // 1. Run the business operation to completion (validations, hash chains, etc.)
    const operationResult = await operation(txContext);

    // 2. If nothing was staged, return early
    if (stagedChanges.length === 0) {
      return operationResult;
    }

    // 3. Atomically commit all staged changes in a single IndexedDB transaction
    return new Promise<R>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = (val: R) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      try {
        const allStores = Array.from(new Set([
          ...storeNames,
          ...stagedChanges.map((c) => c.store),
          ...stagedPreconditions.map((p) => p.store),
        ]));
        const tx = db!.transaction(allStores, 'readwrite');

        tx.oncomplete = () => {
          // Transaction committed successfully: update memory cache
          stagedChanges.forEach((ch) => {
            if (ch.action === 'put' && ch.item) {
              this.memoryFallback.get(ch.store)?.set(ch.key, ch.item);
              if (ch.store === 'domainEvents') {
                notifyDomainEventCommitted(ch.item as DomainEvent);
              }
            } else if (ch.action === 'delete') {
              this.memoryFallback.get(ch.store)?.delete(ch.key);
            }
          });
          safeResolve(operationResult);
        };

        tx.onerror = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] Multi-store transaction failed and aborted'));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] Multi-store transaction aborted'));
        };

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          return;
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          safeReject(new Error('[IndexedDbEngine] Multi-store transaction failed: simulated request error'));
          return;
        }

        const executeWrites = () => {
          for (const change of stagedChanges) {
            const store = tx.objectStore(change.store);
            if (change.action === 'put' && change.item) {
              const target = normalizeItemForStore(store, change.item, change.store);
              const key = extractItemKey(target, change.store);
              let req: IDBRequest;
              if (store.keyPath === null || store.keyPath === undefined) {
                req = store.put(target, key);
              } else {
                req = store.put(target);
              }
              req.onerror = () => {
                const err = req.error || new Error(`[IndexedDbEngine] Put failed in transaction on ${change.store}`);
                try { tx.abort(); } catch {}
                safeReject(err);
              };
            } else if (change.action === 'delete') {
              const req = store.delete(change.key);
              req.onerror = () => {
                const err = req.error || new Error(`[IndexedDbEngine] Delete failed in transaction on ${change.store}`);
                try { tx.abort(); } catch {}
                safeReject(err);
              };
            }
          }
        };

        const proceedToWrites = () => {
          const domainEventChanges = stagedChanges.filter(
            (c) => c.store === 'domainEvents' && c.action === 'put' && c.item
          );

          const shouldValidateDomainEvents =
            domainEventChanges.length > 0 ||
            (storeNames as string[]).includes('domainEvents');

          if (!shouldValidateDomainEvents) {
            executeWrites();
            return;
          }

          // Authoritatively finalize domain events under the exclusive transaction lock
          const evStore = tx.objectStore('domainEvents');
          const getAllReq = evStore.getAll();

          getAllReq.onerror = () => {
            try { tx.abort(); } catch {}
            safeReject(getAllReq.error || new Error('[IndexedDbEngine] Failed to read domainEvents for transaction finalization'));
          };

          getAllReq.onsuccess = () => {
            const existingEvents = (getAllReq.result || []) as DomainEvent[];

            // 1. Authoritative chain validation across all existing domain events
            const chainValidation = validateEventChainIntegrity(existingEvents);
            if (!chainValidation.valid) {
              try { tx.abort(); } catch {}
              safeReject(
                new Error(
                  `[IndexedDbEngine] Authoritative event chain integrity violation: ${chainValidation.error}`
                )
              );
              return;
            }

            // 2. Check duplicate eventId across all staged events (immutability violation)
            const stagedEventIds = new Set<string>();
            for (const ch of domainEventChanges) {
              const eventId = ch.item.eventId;
              if (existingEvents.some((e) => e.eventId === eventId) || stagedEventIds.has(eventId)) {
                try { tx.abort(); } catch {}
                safeReject(new Error(`[EventStore] Duplicate eventId detected: ${eventId}. Immutability violation.`));
                return;
              }
              stagedEventIds.add(eventId);
            }

            // 3. Authoritatively finalize each staged event in transaction order
            let currentHead = chainValidation.head;
            const workingEvents = [...chainValidation.sortedEvents];

            for (const ch of domainEventChanges) {
              const rawEvent = ch.item as DomainEvent;

              // Aggregate sequence: max existing sequence for this aggregate + 1
              const matchingAggEvents = workingEvents.filter(
                (e) => e.aggregateType === rawEvent.aggregateType && e.aggregateId === rawEvent.aggregateId
              );
              const maxSeq = matchingAggEvents.reduce((m, e) => Math.max(m, e.sequence || 0), 0);
              const finalSequence = maxSeq + 1;

              // Predecessor hash: currentHead's eventHash or null if genesis root
              const prevHash = currentHead ? (currentHead.eventHash || null) : null;
              const targetHashVersion = rawEvent.hashVersion ?? 2;

              // Deterministic SHA-256 hash binding all immutable identity and provenance fields
              const finalEventHash = computeEventHash(
                {
                  hashVersion: targetHashVersion,
                  eventId: rawEvent.eventId,
                  eventType: rawEvent.eventType,
                  aggregateType: rawEvent.aggregateType,
                  aggregateId: rawEvent.aggregateId,
                  facilityId: rawEvent.facilityId,
                  actorId: rawEvent.actorId,
                  deviceId: rawEvent.deviceId,
                  timestamp: rawEvent.timestamp,
                  sequence: finalSequence,
                  version: rawEvent.version,
                  payload: rawEvent.payload,
                  metadata: rawEvent.metadata,
                  clientCreatedAt: rawEvent.clientCreatedAt,
                  clientUpdatedAt: rawEvent.clientUpdatedAt,
                },
                prevHash
              );

              const finalizedEvent: DomainEvent = deepFreeze({
                ...rawEvent,
                id: rawEvent.eventId,
                sequence: finalSequence,
                previousEventHash: prevHash,
                eventHash: finalEventHash,
                hashVersion: targetHashVersion,
              });

              ch.item = finalizedEvent;
              currentHead = finalizedEvent;
              workingEvents.push(finalizedEvent);
            }

            executeWrites();
          };
        };

        if (stagedPreconditions.length === 0) {
          proceedToWrites();
        } else {
          // Authoritative conditional commit verification under the exclusive transaction lock
          let checkedCount = 0;
          let hasFailed = false;

          for (const cond of stagedPreconditions) {
            const store = tx.objectStore(cond.store);
            const req = store.get(cond.key);

            req.onerror = () => {
              if (hasFailed) return;
              hasFailed = true;
              try { tx.abort(); } catch {}
              safeReject(req.error || new Error(`[IndexedDbEngine] Precondition read failed on ${cond.store}`));
            };

            req.onsuccess = () => {
              if (hasFailed) return;
              const live = req.result;

              if (cond.expectedVersion !== undefined) {
                const liveVersion = live ? (live as any).version : undefined;
                if (liveVersion !== cond.expectedVersion) {
                  hasFailed = true;
                  const msg = cond.errorMessage || `[IndexedDbEngine] Precondition failed: Version mismatch on ${cond.store} (expected ${cond.expectedVersion}, got ${liveVersion})`;
                  try { tx.abort(); } catch {}
                  safeReject(new Error(msg));
                  return;
                }
              }

              if (cond.predicate) {
                let ok = false;
                try {
                  ok = Boolean(cond.predicate(live));
                } catch (predErr: any) {
                  hasFailed = true;
                  try { tx.abort(); } catch {}
                  safeReject(predErr);
                  return;
                }
                if (!ok) {
                  hasFailed = true;
                  const msg = cond.errorMessage || `[IndexedDbEngine] Precondition unsatisfied on ${cond.store}`;
                  try { tx.abort(); } catch {}
                  safeReject(new Error(msg));
                  return;
                }
              }

              checkedCount++;
              if (checkedCount === stagedPreconditions.length && !hasFailed) {
                proceedToWrites();
              }
            };
          }
        }
      } catch (err) {
        safeReject(err);
      }
    });
  }

  /**
   * Get an entity by primary key
   */
  /**
   * Get an entity by primary key from authoritative IndexedDB.
   * Fails closed: rejects if database is unavailable or read fails, preventing
   * errors from being masked as genuinely absent records.
   */
  public async get<T>(storeName: StoreName, key: string): Promise<T | undefined> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot read '${key}' from store '${storeName}'`);
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot read '${key}' from store '${storeName}'`);
    }

    return new Promise<T | undefined>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          if (req.result !== undefined && req.result !== null) {
            const result = req.result as T;
            this.memoryFallback.get(storeName)?.set(key, result);
            resolve(result);
          } else {
            // Record is confirmed genuinely absent from durable storage
            resolve(undefined);
          }
        };

        req.onerror = () => {
          reject(req.error || new Error(`[IndexedDbEngine] Read request failed for '${key}' on store '${storeName}'`));
        };

        tx.onerror = () => {
          reject(tx.error || new Error(`[IndexedDbEngine] Read transaction failed for '${key}' on store '${storeName}'`));
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  }

  /**
   * Get all entities in a store from authoritative IndexedDB.
   * Fails closed: rejects if database is unavailable or read fails, preventing
   * errors from being masked as empty arrays or stale fallbacks.
   */
  public async getAll<T>(storeName: StoreName): Promise<T[]> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot read from store '${storeName}'`);
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot read from store '${storeName}'`);
    }

    return new Promise<T[]>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = (req.result || []) as T[];
          results.forEach((item: any) => {
            const key = extractItemKey(item, storeName);
            if (key) this.memoryFallback.get(storeName)?.set(key, item);
          });
          resolve(results);
        };

        req.onerror = () => {
          reject(req.error || new Error(`[IndexedDbEngine] getAll request failed on store '${storeName}'`));
        };

        tx.onerror = () => {
          reject(tx.error || new Error(`[IndexedDbEngine] getAll transaction failed on store '${storeName}'`));
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  }

  /**
   * Alias for getAll to list entities in a store
   */
  public async list<T>(storeName: StoreName): Promise<T[]> {
    return this.getAll<T>(storeName);
  }

  /**
   * Query a store by indexed field from authoritative IndexedDB.
   * Fails closed: rejects if database is unavailable or query fails.
   */
  public async queryByIndex<T>(storeName: StoreName, indexName: string, queryValue: IDBValidKey): Promise<T[]> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot query index on store '${storeName}'`);
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot query index on store '${storeName}'`);
    }

    return new Promise<T[]>((resolve, reject) => {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        if (!store.indexNames.contains(indexName)) {
          const req = store.getAll();
          req.onsuccess = () => {
            const all = (req.result || []) as any[];
            resolve(all.filter((item) => item[indexName] === queryValue) as T[]);
          };
          req.onerror = () => {
            reject(req.error || new Error(`[IndexedDbEngine] queryByIndex failed on store '${storeName}'`));
          };
          return;
        }

        const index = store.index(indexName);
        const req = index.getAll(queryValue);
        req.onsuccess = () => resolve((req.result || []) as T[]);
        req.onerror = () => {
          reject(req.error || new Error(`[IndexedDbEngine] Index query '${indexName}' failed on store '${storeName}'`));
        };
        tx.onerror = () => {
          reject(tx.error || new Error(`[IndexedDbEngine] Index query transaction failed on store '${storeName}'`));
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  }

  /**
   * Delete an entity by key
   * Durability contract: resolves ONLY on tx.oncomplete.
   * If error or abort occurs, rejects and does NOT delete from memoryFallback.
   */
  public async delete(storeName: StoreName, key: string): Promise<void> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably delete');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot durably delete from ${storeName}`);
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        tx.oncomplete = () => {
          this.memoryFallback.get(storeName)?.delete(key);
          safeResolve();
        };

        tx.onerror = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Delete transaction failed on ${storeName}`));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Delete transaction aborted on ${storeName}`));
        };

        const req = store.delete(key);
        req.onerror = () => {
          const err = req.error || new Error(`[IndexedDbEngine] Delete request failed on ${storeName}`);
          try { tx.abort(); } catch {}
          safeReject(err);
        };
      } catch (syncErr) {
        safeReject(syncErr);
      }
    });
  }

  /**
   * Clear an entire store
   * Durability contract: resolves ONLY on tx.oncomplete.
   * If error or abort occurs, rejects and does NOT clear memoryFallback.
   */
  public async clearStore(storeName: StoreName): Promise<void> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably clear');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error(`[IndexedDbEngine] Database unavailable: cannot durably clear ${storeName}`);
    }

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        tx.oncomplete = () => {
          this.memoryFallback.get(storeName)?.clear();
          safeResolve();
        };

        tx.onerror = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Clear transaction failed on ${storeName}`));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error(`[IndexedDbEngine] Clear transaction aborted on ${storeName}`));
        };

        const req = store.clear();
        req.onerror = () => {
          const err = req.error || new Error(`[IndexedDbEngine] Clear request failed on ${storeName}`);
          try { tx.abort(); } catch {}
          safeReject(err);
        };
      } catch (syncErr) {
        safeReject(syncErr);
      }
    });
  }

  public async clear(storeName: StoreName): Promise<void> {
    return this.clearStore(storeName);
  }

  /**
   * Atomically prune syncQueue records in a single native IndexedDB readwrite transaction.
   * Reads authoritative records inside the transaction, identifies eligible records via predicate,
   * deletes eligible records in the same transaction, and preserves ineligible/unsynced records.
   * Rejects honestly on transaction abort or request error without partial mutation.
   */
  public async pruneSyncQueue(
    predicate: (event: any) => boolean = (e) => e?.status === 'synced'
  ): Promise<{
    prunedCount: number;
    prunedIds: string[];
    remaining: any[];
  }> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot prune syncQueue');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error('[IndexedDbEngine] Cannot prune syncQueue: IndexedDB unavailable');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = (val: { prunedCount: number; prunedIds: string[]; remaining: any[] }) => {
        if (!settled) {
          settled = true;
          resolve(val);
        }
      };

      try {
        const tx = db!.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const toDelete: any[] = [];
        const remaining: any[] = [];

        tx.onerror = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] syncQueue prune transaction failed'));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] syncQueue prune transaction aborted'));
        };

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          return;
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          safeReject(new Error('[IndexedDbEngine] syncQueue pruning failed: simulated request error'));
          return;
        }

        const getAllReq = store.getAll();
        getAllReq.onerror = () => {
          try { tx.abort(); } catch {}
          safeReject(getAllReq.error || new Error('[IndexedDbEngine] Failed to read syncQueue for pruning'));
        };

        getAllReq.onsuccess = () => {
          const records = (getAllReq.result || []) as any[];
          for (const rec of records) {
            // Defense-in-depth safety invariant:
            // A record MUST authoritatively have status === 'synced' in addition to satisfying
            // any caller-supplied predicate to be eligible for pruning.
            // This prevents accidental deletion of pending, queued, or failed records even if
            // a caller passes an arbitrary matching predicate (e.g., candidate ID matching).
            const isAuthoritativelySynced = rec?.status === 'synced';
            if (isAuthoritativelySynced && predicate(rec)) {
              toDelete.push(rec);
            } else {
              remaining.push(rec);
            }
          }

          if (toDelete.length === 0) {
            return;
          }

          for (const rec of toDelete) {
            const key = rec.id || extractItemKey(rec, 'syncQueue');
            if (key) {
              const delReq = store.delete(key);
              delReq.onerror = () => {
                const err = delReq.error || new Error(`[IndexedDbEngine] Delete failed in prune transaction: ${key}`);
                try { tx.abort(); } catch {}
                safeReject(err);
              };
            }
          }
        };

        tx.oncomplete = () => {
          // Native transaction committed atomically
          const mem = this.memoryFallback.get('syncQueue');
          if (mem) {
            for (const rec of toDelete) {
              const key = rec.id || extractItemKey(rec, 'syncQueue');
              if (key) mem.delete(key);
            }
          }
          safeResolve({
            prunedCount: toDelete.length,
            prunedIds: toDelete.map((d) => d.id || extractItemKey(d, 'syncQueue')).filter(Boolean),
            remaining,
          });
        };
      } catch (err: any) {
        safeReject(err);
      }
    });
  }

  /**
   * Atomically reset multiple stores in a single native multi-store readwrite transaction.
   * For all stores in batches:
   * - Clears each store
   * - Inserts each replacement item
   * If any clear/put operation fails or the transaction aborts,
   * IndexedDB automatically rolls back the entire transaction across all stores.
   * Volatile in-memory fallback stores are updated ONLY upon tx.oncomplete.
   */
  public async resetStoresAtomic(
    batches: Array<{ store: StoreName; items: any[] }>
  ): Promise<void> {
    if (this.simulatedFailure === 'unavailable') {
      throw new Error('[IndexedDbEngine] Database unavailable: cannot durably reset stores');
    }

    let db: IDBDatabase | null = null;
    try {
      db = await this.getDb();
    } catch (dbErr) {
      throw new Error(`[IndexedDbEngine] Database open failure: ${(dbErr as Error)?.message || String(dbErr)}`);
    }

    if (!db) {
      throw new Error('[IndexedDbEngine] Cannot reset stores: IndexedDB unavailable');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const safeReject = (err: any) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      const safeResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      try {
        const storeNames = Array.from(new Set(batches.map((b) => b.store)));
        const tx = db!.transaction(storeNames, 'readwrite');

        tx.onerror = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] Multi-store reset transaction failed and aborted'));
        };

        tx.onabort = () => {
          safeReject(tx.error || new Error('[IndexedDbEngine] Multi-store reset transaction aborted'));
        };

        if (this.simulatedFailure === 'transaction_abort') {
          try { tx.abort(); } catch {}
          return;
        }

        if (this.simulatedFailure === 'request_error') {
          try { tx.abort(); } catch {}
          safeReject(new Error('[IndexedDbEngine] Multi-store reset failed: simulated request error'));
          return;
        }

        for (const batch of batches) {
          const store = tx.objectStore(batch.store);
          const clearReq = store.clear();
          clearReq.onerror = () => {
            const err = clearReq.error || new Error(`[IndexedDbEngine] Clear failed on store ${batch.store}`);
            try { tx.abort(); } catch {}
            safeReject(err);
          };

          for (const item of batch.items) {
            const target = normalizeItemForStore(store, item, batch.store);
            const targetKey = extractItemKey(target, batch.store);
            let req: IDBRequest;
            if (store.keyPath === null || store.keyPath === undefined) {
              req = store.put(target, targetKey);
            } else {
              req = store.put(target);
            }
            req.onerror = () => {
              const err = req.error || new Error(`[IndexedDbEngine] Put failed during reset on store ${batch.store}`);
              try { tx.abort(); } catch {}
              safeReject(err);
            };
          }
        }

        tx.oncomplete = () => {
          // Native multi-store transaction committed successfully!
          for (const batch of batches) {
            const memStore = this.memoryFallback.get(batch.store);
            if (memStore) {
              memStore.clear();
              for (const item of batch.items) {
                const targetKey = extractItemKey(item, batch.store);
                if (targetKey) {
                  memStore.set(targetKey, item);
                }
              }
            }
          }
          safeResolve();
        };
      } catch (err: any) {
        safeReject(err);
      }
    });
  }

  private persistFallback(_storeName: StoreName): void {
    // Plaintext localStorage persistence is strictly eliminated for clinical privacy.
    // In-memory volatile caches advance on tx.oncomplete without localStorage mirroring.
  }
}

export const idbEngine = IndexedDbEngine.getInstance();
