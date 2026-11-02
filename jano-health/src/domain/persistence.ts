/**
 * Jano Health - Persistence & Event Sourcing Domain Abstractions
 * 
 * Defines clean architectural boundaries independent of any framework or UI library.
 * Supports offline-first clinical operations, append-only immutable domain events,
 * multi-facility context, idempotency, and explicit conflict arbitration.
 */

import {
  Allergy,
  Appointment,
  AuditEvent,
  ClinicalAssessment,
  ClinicalNote,
  Diagnosis,
  DifferentialConsideration,
  EmergencyCase,
  EmergencyTriage,
  EmergencyReassessment,
  EmergencyAlert,
  TransportRequest,
  Encounter,
  Facility,
  LaboratoryOrder,
  LaboratorySpecimen,
  LaboratoryResult,
  Medication,
  MedicationDefinition,
  MedicationOrder,
  Prescription,
  Patient,
  Problem,
  RadiologyOrder,
  RadiologyStudy,
  RadiologyReport,
  CriticalRadiologyFinding,
  RadiologyResult,
  Referral,
  ReferralOutcome,
  ReferralCommunication,
  AIRequest,
  RoleType,
} from './types';
import {
  DispenseRecord,
  InventoryItem,
  InventoryBatch,
  InventoryTransaction,
  InventoryReceipt,
  InventoryTransfer,
  InventoryWastage,
  PharmacyReview,
} from './pharmacyTypes';

export type AggregateType =
  | 'Patient'
  | 'Encounter'
  | 'VitalSign'
  | 'ClinicalNote'
  | 'Problem'
  | 'Diagnosis'
  | 'DifferentialConsideration'
  | 'ClinicalAssessment'
  | 'Medication'
  | 'MedicationDefinition'
  | 'MedicationOrder'
  | 'Prescription'
  | 'DispenseRecord'
  | 'InventoryItem'
  | 'InventoryBatch'
  | 'InventoryTransaction'
  | 'InventoryReceipt'
  | 'InventoryTransfer'
  | 'InventoryWastage'
  | 'PharmacyReview'
  | 'Allergy'
  | 'LaboratoryOrder'
  | 'LaboratorySpecimen'
  | 'LaboratoryResult'
  | 'RadiologyOrder'
  | 'RadiologyStudy'
  | 'RadiologyReport'
  | 'CriticalRadiologyFinding'
  | 'RadiologyResult'
  | 'Appointment'
  | 'Referral'
  | 'ReferralOutcome'
  | 'ReferralCommunication'
  | 'EmergencyCase'
  | 'EmergencyTriage'
  | 'EmergencyReassessment'
  | 'EmergencyAlert'
  | 'TransportRequest'
  | 'AIRequest'
  | 'AIResponse'
  | 'AIReview';

export type DomainEventName =
  | 'PATIENT_CREATED'
  | 'PatientRegistered'
  | 'PATIENT_REGISTERED'
  | 'PATIENT_UPDATED'
  | 'PatientDemographicsUpdated'
  | 'PATIENT_DEMOGRAPHICS_UPDATED'
  | 'PatientContactUpdated'
  | 'PATIENT_CONTACT_UPDATED'
  | 'PatientEmergencyContactUpdated'
  | 'PatientStatusChanged'
  | 'PATIENT_STATUS_CHANGED'
  | 'PatientMerged'
  | 'PATIENT_MERGED'
  | 'EncounterCreated'
  | 'ENCOUNTER_CREATED'
  | 'EncounterStarted'
  | 'ENCOUNTER_STARTED'
  | 'EncounterCompleted'
  | 'ENCOUNTER_COMPLETED'
  | 'EncounterSigned'
  | 'ENCOUNTER_SIGNED'
  | 'EncounterCancelled'
  | 'ENCOUNTER_CANCELLED'
  | 'EncounterUpdated'
  | 'ENCOUNTER_UPDATED'
  | 'ClinicalNoteCreated'
  | 'CLINICAL_NOTE_CREATED'
  | 'ClinicalNoteUpdated'
  | 'CLINICAL_NOTE_UPDATED'
  | 'ClinicalNoteSigned'
  | 'CLINICAL_NOTE_SIGNED'
  | 'ClinicalNoteAmended'
  | 'CLINICAL_NOTE_AMENDED'
  | 'VitalSignsRecorded'
  | 'VITAL_SIGNS_RECORDED'
  | 'VITAL_SIGN_RECORDED'
  | 'VitalSignsAmended'
  | 'VITAL_SIGNS_AMENDED'
  | 'ProblemCreated'
  | 'PROBLEM_CREATED'
  | 'ProblemUpdated'
  | 'PROBLEM_UPDATED'
  | 'ProblemResolved'
  | 'PROBLEM_RESOLVED'
  | 'ProblemEnteredInError'
  | 'PROBLEM_ENTERED_IN_ERROR'
  | 'DiagnosisRecorded'
  | 'DIAGNOSIS_RECORDED'
  | 'DiagnosisConfirmed'
  | 'DIAGNOSIS_CONFIRMED'
  | 'DiagnosisResolved'
  | 'DIAGNOSIS_RESOLVED'
  | 'DiagnosisCorrected'
  | 'DIAGNOSIS_CORRECTED'
  | 'DiagnosisEnteredInError'
  | 'DIAGNOSIS_ENTERED_IN_ERROR'
  | 'DifferentialCreated'
  | 'DIFFERENTIAL_CREATED'
  | 'DifferentialUpdated'
  | 'DIFFERENTIAL_UPDATED'
  | 'DifferentialDeprioritized'
  | 'DIFFERENTIAL_DEPRIORITIZED'
  | 'DifferentialStatusChanged'
  | 'DIFFERENTIAL_STATUS_CHANGED'
  | 'ClinicalAssessmentCreated'
  | 'CLINICAL_ASSESSMENT_CREATED'
  | 'ClinicalAssessmentUpdated'
  | 'CLINICAL_ASSESSMENT_UPDATED'
  | 'ClinicalAssessmentSigned'
  | 'CLINICAL_ASSESSMENT_SIGNED'
  | 'ClinicalAssessmentAmended'
  | 'CLINICAL_ASSESSMENT_AMENDED'
  | 'MEDICATION_RECORDED'
  | 'MEDICATION_ORDER_CREATED'
  | 'MedicationOrderCreated'
  | 'MEDICATION_ORDER_UPDATED'
  | 'MedicationOrderUpdated'
  | 'MEDICATION_ORDER_HELD'
  | 'MedicationOrderHeld'
  | 'MEDICATION_ORDER_DISCONTINUED'
  | 'MedicationOrderDiscontinued'
  | 'MEDICATION_ORDER_CANCELLED'
  | 'MedicationOrderCancelled'
  | 'PRESCRIPTION_CREATED'
  | 'PrescriptionCreated'
  | 'PRESCRIPTION_ISSUED'
  | 'PrescriptionIssued'
  | 'PRESCRIPTION_HELD'
  | 'PrescriptionHeld'
  | 'PRESCRIPTION_CANCELLED'
  | 'PrescriptionCancelled'
  | 'PRESCRIPTION_AMENDED'
  | 'PrescriptionAmended'
  | 'PRESCRIPTION_DISPENSED'
  | 'PrescriptionDispensed'
  | 'PHARMACY_PRESCRIPTION_REVIEWED'
  | 'PHARMACY_REVIEW_STARTED'
  | 'PHARMACY_REVIEW_COMPLETED'
  | 'PRESCRIPTION_REVIEWED'
  | 'DISPENSE_RECORD_CREATED'
  | 'DISPENSE_RECORD_UPDATED'
  | 'DISPENSE_PARTIAL'
  | 'DISPENSE_PARTIALLY_COMPLETED'
  | 'DISPENSE_COMPLETED'
  | 'DISPENSE_HELD'
  | 'DISPENSE_REVERSED'
  | 'PRESCRIPTION_DISPENSE_STATUS_UPDATED'
  | 'SUBSTITUTION_RECORDED'
  | 'INVENTORY_ITEM_CREATED'
  | 'INVENTORY_BATCH_CREATED'
  | 'INVENTORY_RECEIVED'
  | 'INVENTORY_TRANSFERRED_OUT'
  | 'INVENTORY_TRANSFERRED_IN'
  | 'INVENTORY_TRANSFERRED'
  | 'INVENTORY_DISPENSED'
  | 'INVENTORY_ADJUSTED'
  | 'INVENTORY_WASTED'
  | 'INVENTORY_EXPIRED'
  | 'INVENTORY_REVERSED'
  | 'INVENTORY_QUARANTINED'
  | 'INVENTORY_RELEASED'
  | 'INVENTORY_CONFLICT'
  | 'MEDICATION_SAFETY_CHECK_PERFORMED'
  | 'MEDICATION_WARNING_ACKNOWLEDGED'
  | 'ALLERGY_RECORDED'
  | 'LAB_ORDER_CREATED'
  | 'LABORATORY_ORDER_CREATED'
  | 'LABORATORY_ORDER_CANCELLED'
  | 'LAB_ORDER_CANCELLED'
  | 'SPECIMEN_COLLECTION_RECORDED'
  | 'SPECIMEN_COLLECTED'
  | 'SPECIMEN_RECEIVED'
  | 'SPECIMEN_REJECTED'
  | 'LAB_RESULT_RECORDED'
  | 'LAB_RESULT_VERIFIED'
  | 'LAB_RESULT_CORRECTED'
  | 'CRITICAL_RESULT_CREATED'
  | 'CRITICAL_RESULT_ACKNOWLEDGED'
  | 'RADIOLOGY_ORDER_CREATED'
  | 'RADIOLOGY_ORDER_CANCELLED'
  | 'RADIOLOGY_STUDY_CREATED'
  | 'RADIOLOGY_STUDY_STARTED'
  | 'RADIOLOGY_STUDY_COMPLETED'
  | 'RADIOLOGY_REPORT_CREATED'
  | 'RADIOLOGY_REPORT_PRELIMINARY'
  | 'RADIOLOGY_REPORT_FINALIZED'
  | 'RADIOLOGY_REPORT_AMENDED'
  | 'CRITICAL_RADIOLOGY_FINDING_CREATED'
  | 'CRITICAL_RADIOLOGY_FINDING_ACKNOWLEDGED'
  | 'UNAUTHORIZED_ACTION_ATTEMPTED'
  | 'RADIOLOGY_RESULT_RECORDED'
  | 'APPOINTMENT_CREATED'
  | 'REFERRAL_CREATED'
  | 'REFERRAL_UPDATED'
  | 'REFERRAL_SUBMITTED'
  | 'REFERRAL_SENT'
  | 'REFERRAL_RECEIVED'
  | 'REFERRAL_UNDER_REVIEW'
  | 'REFERRAL_ACCEPTED'
  | 'REFERRAL_REJECTED'
  | 'REFERRAL_REQUESTED_INFORMATION'
  | 'REFERRAL_SCHEDULED'
  | 'REFERRAL_STARTED'
  | 'REFERRAL_COMPLETED'
  | 'REFERRAL_CLOSED'
  | 'REFERRAL_CANCELLED'
  | 'REFERRAL_OUTCOME_CREATED'
  | 'REFERRAL_OUTCOME_UPDATED'
  | 'REFERRAL_COMMUNICATION_CREATED'
  | 'EMERGENCY_CASE_CREATED'
  | 'EMERGENCY_CASE_TRIAGED'
  | 'EMERGENCY_TRIAGE_RECORDED'
  | 'EMERGENCY_ASSESSMENT_RECORDED'
  | 'EMERGENCY_REASSESSMENT_RECORDED'
  | 'EMERGENCY_STATUS_CHANGED'
  | 'EMERGENCY_DISPOSITION_RECORDED'
  | 'EMERGENCY_DISCHARGE_RECORDED'
  | 'EMERGENCY_CASE_DISCHARGED'
  | 'EMERGENCY_ADMISSION_RECORDED'
  | 'EMERGENCY_CASE_ADMITTED'
  | 'EMERGENCY_TRANSFER_RECORDED'
  | 'EMERGENCY_CASE_TRANSFERRED'
  | 'EMERGENCY_DEATH_RECORDED'
  | 'EMERGENCY_TRANSPORT_REQUESTED'
  | 'EMERGENCY_ALERT_RAISED'
  | 'EMERGENCY_ALERT_ACKNOWLEDGED'
  | 'AI_REQUEST_CREATED'
  | 'AI_REQUEST_AUTHORIZED'
  | 'AI_CONTEXT_ASSEMBLED'
  | 'AI_MODEL_REQUESTED'
  | 'AI_MODEL_FALLBACK_USED'
  | 'AI_RESPONSE_RECEIVED'
  | 'AI_RESPONSE_VALIDATION_FAILED'
  | 'AI_RESPONSE_REVIEWED'
  | 'AI_RESPONSE_ACCEPTED'
  | 'AI_RESPONSE_REJECTED'
  | 'AI_CONTENT_INSERTED_INTO_DRAFT'
  | 'AI_AUTONOMOUS_MUTATION_BLOCKED'
  | 'AI_RESPONSE_RECORDED';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CONFLICT';

export type ConflictResolutionStatus =
  | 'PENDING'
  | 'RESOLVED_LOCAL'
  | 'RESOLVED_REMOTE'
  | 'RESOLVED_MERGED';

export interface EventMetadata {
  deviceId?: string;
  appVersion?: string;
  offlineGenerated?: boolean;
  userRole?: RoleType;
  userName?: string;
  clientIp?: string;
  correlationId?: string;
  actorId?: string;
  actorRole?: RoleType;
  facilityId?: string;
  occurredAt?: string;
}

/**
 * Append-only immutable domain event.
 * Historical events must NEVER be mutated.
 */
export interface DomainEvent<T = any> {
  readonly eventId: string;
  readonly eventType: DomainEventName;
  readonly aggregateType: AggregateType;
  readonly aggregateId: string;
  readonly facilityId: string;
  readonly actorId: string;
  readonly deviceId: string;
  readonly timestamp: string; // ISO 8601 UTC (client recording time)
  readonly sequence: number;  // Monotonically increasing sequence per aggregate
  readonly version: number;   // Aggregate version after applying this event
  readonly payload: T;
  readonly metadata: EventMetadata;
  readonly previousEventHash?: string | null;
  readonly eventHash?: string;
  readonly hashVersion?: number;
  readonly clientCreatedAt?: string;
  readonly clientUpdatedAt?: string;
  readonly serverReceivedAt?: string;
  readonly serverCommittedAt?: string;
  syncStatus: SyncStatus;
  retryCount?: number;
  lastAttemptAt?: string;
  syncError?: string;
}

/**
 * Explicit representation of a clinical data conflict between two nodes/clients.
 */
export interface ClinicalConflict {
  readonly conflictId: string;
  readonly aggregateType: AggregateType;
  readonly aggregateId: string;
  readonly localVersion: number;
  readonly remoteVersion: number;
  readonly localEvent: DomainEvent;
  readonly remoteEvent: Record<string, unknown>;
  readonly detectedAt: string;
  readonly originatingDevice?: string;
  readonly facilityId?: string;
  resolutionStatus: ConflictResolutionStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  mergedPayload?: Record<string, unknown>;
}

export interface SyncQueueStats {
  pendingCount: number;
  syncingCount: number;
  syncedCount: number;
  failedCount: number;
  conflictCount: number;
  totalEvents: number;
  lastAttemptTime: string | null;
  lastSuccessfulSyncTime: string | null;
  activeState: 'IDLE' | 'SYNCING' | 'OFFLINE' | 'ERROR' | 'CONFLICT';
}

/**
 * Clinical Local Repository Interface
 * Provides durable local storage query & mutation methods across all core clinical records.
 */
export interface ILocalRepository {
  // Patients
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientById?(id: string): Promise<Patient | undefined>;
  getPatientByMrn(mrn: string): Promise<Patient | undefined>;
  getAllPatients(facilityId?: string): Promise<Patient[]>;
  searchPatients(query: string, facilityId?: string): Promise<Patient[]>;
  savePatient(patient: Patient): Promise<void>;

  // Encounters
  getEncounter(id: string): Promise<Encounter | undefined>;
  getEncounters(patientId?: string, facilityId?: string): Promise<Encounter[]>;
  saveEncounter(encounter: Encounter): Promise<void>;

  // Clinical Sub-records
  getClinicalNote(id: string): Promise<ClinicalNote | undefined>;
  getClinicalNotes(patientId?: string, encounterId?: string): Promise<ClinicalNote[]>;
  saveClinicalNote(note: ClinicalNote): Promise<void>;

  getVitals(patientId?: string, encounterId?: string): Promise<any[]>;
  saveVital(vital: any): Promise<void>;

  getAllergies(patientId?: string): Promise<Allergy[]>;
  saveAllergy(allergy: Allergy): Promise<void>;

  getMedications(patientId?: string, encounterId?: string): Promise<Medication[]>;
  saveMedication(medication: Medication): Promise<void>;

  // Clinical Core V6: Medication Definitions, Orders, Prescriptions
  getMedicationDefinitions?(): Promise<MedicationDefinition[]>;
  getMedicationDefinition?(idOrCode: string): Promise<MedicationDefinition | undefined>;
  saveMedicationDefinition?(definition: MedicationDefinition): Promise<void>;

  getMedicationOrders?(patientId?: string, facilityId?: string): Promise<MedicationOrder[]>;
  getMedicationOrder?(id: string): Promise<MedicationOrder | undefined>;
  saveMedicationOrder?(order: MedicationOrder): Promise<void>;

  getPrescriptions?(patientId?: string, facilityId?: string): Promise<Prescription[]>;
  getPrescription?(id: string): Promise<Prescription | undefined>;
  savePrescription?(prescription: Prescription): Promise<void>;

  // Pharmacy & Dispensing Core (Clinical Core V7)
  getDispenseRecords?(patientId?: string, prescriptionId?: string): Promise<DispenseRecord[]>;
  getDispenseRecord?(id: string): Promise<DispenseRecord | undefined>;
  saveDispenseRecord?(record: DispenseRecord): Promise<void>;

  getInventoryItems?(facilityId?: string): Promise<InventoryItem[]>;
  getInventoryItem?(id: string): Promise<InventoryItem | undefined>;
  saveInventoryItem?(item: InventoryItem): Promise<void>;

  getInventoryBatches?(inventoryItemId?: string, facilityId?: string): Promise<InventoryBatch[]>;
  getInventoryBatch?(id: string): Promise<InventoryBatch | undefined>;
  saveInventoryBatch?(batch: InventoryBatch): Promise<void>;

  getInventoryTransactions?(facilityId?: string, inventoryItemId?: string, batchId?: string): Promise<InventoryTransaction[]>;
  saveInventoryTransaction?(txn: InventoryTransaction): Promise<void>;

  getInventoryReceipts?(facilityId?: string): Promise<InventoryReceipt[]>;
  getInventoryReceipt?(id: string): Promise<InventoryReceipt | undefined>;
  saveInventoryReceipt?(receipt: InventoryReceipt): Promise<void>;

  getInventoryTransfers?(facilityId?: string): Promise<InventoryTransfer[]>;
  getInventoryTransfer?(id: string): Promise<InventoryTransfer | undefined>;
  saveInventoryTransfer?(transfer: InventoryTransfer): Promise<void>;

  getInventoryWastages?(facilityId?: string): Promise<InventoryWastage[]>;
  getInventoryWastage?(id: string): Promise<InventoryWastage | undefined>;
  saveInventoryWastage?(wastage: InventoryWastage): Promise<void>;

  getPharmacyReviews?(prescriptionId?: string, patientId?: string): Promise<PharmacyReview[]>;
  getPharmacyReview?(id: string): Promise<PharmacyReview | undefined>;
  savePharmacyReview?(review: PharmacyReview): Promise<void>;

  getDiagnosis?(id: string): Promise<Diagnosis | undefined>;
  getDiagnoses(patientId?: string, encounterId?: string): Promise<Diagnosis[]>;
  saveDiagnosis(diagnosis: Diagnosis): Promise<void>;

  getProblem?(id: string): Promise<Problem | undefined>;
  getProblems(patientId?: string): Promise<Problem[]>;
  saveProblem(problem: Problem): Promise<void>;

  getDifferentials(encounterId?: string, patientId?: string): Promise<DifferentialConsideration[]>;
  saveDifferential(differential: DifferentialConsideration): Promise<void>;

  getClinicalAssessments(encounterId?: string, patientId?: string): Promise<ClinicalAssessment[]>;
  saveClinicalAssessment(assessment: ClinicalAssessment): Promise<void>;

  // Diagnostic Orders, Specimens & Results
  getLabOrders(patientId?: string, facilityId?: string): Promise<LaboratoryOrder[]>;
  saveLabOrder(order: LaboratoryOrder): Promise<void>;

  getLabSpecimens(orderId?: string, patientId?: string): Promise<LaboratorySpecimen[]>;
  getLabSpecimen(id: string): Promise<LaboratorySpecimen | undefined>;
  saveLabSpecimen(specimen: LaboratorySpecimen): Promise<void>;

  getLabResults(patientId?: string, orderId?: string): Promise<LaboratoryResult[]>;
  saveLabResult(result: LaboratoryResult): Promise<void>;

  getRadiologyOrders(patientId?: string, facilityId?: string): Promise<RadiologyOrder[]>;
  getRadiologyOrder?(id: string): Promise<RadiologyOrder | undefined>;
  saveRadiologyOrder(order: RadiologyOrder): Promise<void>;

  getRadiologyStudies?(orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyStudy[]>;
  getRadiologyStudy?(id: string): Promise<RadiologyStudy | undefined>;
  saveRadiologyStudy?(study: RadiologyStudy): Promise<void>;

  getRadiologyReports?(studyId?: string, orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyReport[]>;
  getRadiologyReport?(id: string): Promise<RadiologyReport | undefined>;
  saveRadiologyReport?(report: RadiologyReport): Promise<void>;

  getCriticalRadiologyFindings?(facilityId?: string, patientId?: string): Promise<CriticalRadiologyFinding[]>;
  getCriticalRadiologyFinding?(id: string): Promise<CriticalRadiologyFinding | undefined>;
  saveCriticalRadiologyFinding?(finding: CriticalRadiologyFinding): Promise<void>;

  getRadiologyResults(patientId?: string, orderId?: string): Promise<RadiologyResult[]>;
  saveRadiologyResult(result: RadiologyResult): Promise<void>;

  // Operational
  getAppointments(facilityId?: string, patientId?: string): Promise<Appointment[]>;
  saveAppointment(appointment: Appointment): Promise<void>;

  getReferrals(facilityId?: string, patientId?: string): Promise<Referral[]>;
  getReferral?(id: string): Promise<Referral | undefined>;
  saveReferral(referral: Referral): Promise<void>;

  getReferralOutcomes?(referralId?: string, patientId?: string): Promise<ReferralOutcome[]>;
  getReferralOutcome?(id: string): Promise<ReferralOutcome | undefined>;
  saveReferralOutcome?(outcome: ReferralOutcome): Promise<void>;

  getReferralCommunications?(referralId?: string): Promise<ReferralCommunication[]>;
  saveReferralCommunication?(communication: ReferralCommunication): Promise<void>;

  getEmergencyCases(facilityId?: string): Promise<EmergencyCase[]>;
  saveEmergencyCase(emergencyCase: EmergencyCase): Promise<void>;

  getEmergencyTriages?(emergencyCaseId?: string): Promise<EmergencyTriage[]>;
  saveEmergencyTriage?(triage: EmergencyTriage): Promise<void>;

  getEmergencyReassessments?(emergencyCaseId?: string): Promise<EmergencyReassessment[]>;
  saveEmergencyReassessment?(reassessment: EmergencyReassessment): Promise<void>;

  getEmergencyAlerts?(emergencyCaseId?: string): Promise<EmergencyAlert[]>;
  saveEmergencyAlert?(alert: EmergencyAlert): Promise<void>;

  getTransportRequests?(emergencyCaseId?: string): Promise<TransportRequest[]>;
  saveTransportRequest?(req: TransportRequest): Promise<void>;

  getAIRequests(patientId?: string): Promise<AIRequest[]>;
  saveAIRequest(request: AIRequest): Promise<void>;

  // Maintenance
  clear(): Promise<void>;
  seedSyntheticDemoData(): Promise<void>;
}

/**
 * Append-Only Event Store Interface
 */
export interface IEventStore {
  appendEvent(event: DomainEvent): Promise<void>;
  prepareEvent?(event: DomainEvent): Promise<DomainEvent>;
  registerCommittedEvent?(event: DomainEvent): void;
  getEventsForAggregate(aggregateType: AggregateType, aggregateId: string): Promise<DomainEvent[]>;
  getAllEvents(limit?: number): Promise<DomainEvent[]>;
  getEventsByStatus(status: SyncStatus): Promise<DomainEvent[]>;
  updateEventStatus(eventId: string, status: SyncStatus, error?: string): Promise<void>;
  getNextSequence(aggregateType: AggregateType, aggregateId: string): Promise<number>;
  subscribe(listener: (event: DomainEvent) => void): () => void;
}

/**
 * Outgoing Synchronization Queue Interface
 */
export interface ISyncQueue {
  enqueue(event: DomainEvent): Promise<void>;
  peekPending(batchSize?: number): Promise<DomainEvent[]>;
  markSyncing(eventIds: string[]): Promise<void>;
  markSuccess(eventIds: string[]): Promise<void>;
  markFailed(eventId: string, error: string, retryCount: number): Promise<void>;
  markConflict(eventId: string, details: string): Promise<void>;
  getStats(): Promise<SyncQueueStats>;
  clearCompleted(): Promise<void>;
  subscribe(listener: (stats: SyncQueueStats) => void): () => void;
}

/**
 * Clinical Conflict Arbitration Interface
 */
export interface IConflictResolver {
  detectConflict(localEvent: DomainEvent, remoteState: Record<string, unknown>): Promise<ClinicalConflict | null>;
  recordConflict(conflict: ClinicalConflict): Promise<void>;
  getPendingConflicts(): Promise<ClinicalConflict[]>;
  getConflictById(conflictId: string): Promise<ClinicalConflict | undefined>;
  resolveConflict(
    conflictId: string,
    resolution: ConflictResolutionStatus,
    mergedPayload?: Record<string, unknown>,
    resolverUserId?: string,
    notes?: string
  ): Promise<void>;
  subscribe(listener: (conflicts: ClinicalConflict[]) => void): () => void;
}

/**
 * Audit Trail Repository Interface
 */
export interface IAuditRepository {
  record(event: AuditEvent): Promise<void>;
  query(filters?: {
    resourceId?: string;
    resourceType?: string;
    actorId?: string;
    facilityId?: string;
    syncStatus?: 'synced' | 'pending' | 'offline_retained';
    limit?: number;
  }): Promise<AuditEvent[]>;
  getPendingSync(): Promise<AuditEvent[]>;
  markSynced(auditIds: string[]): Promise<void>;
  subscribe(listener: (event: AuditEvent) => void): () => void;
}

/**
 * Cloud Repository Interface (Firebase / Backend Sync Server)
 */
export interface CloudSyncPushRequest {
  deviceId: string;
  batchTimestamp: string;
  events: DomainEvent[];
}

export interface CloudSyncPushResponse {
  status: 'acknowledged' | 'partial' | 'rejected';
  receivedAt: string;
  processedCount: number;
  acknowledgedEventIds: string[];
  conflicts: Array<{
    eventId: string;
    aggregateType: AggregateType;
    aggregateId: string;
    serverVersion: number;
    serverState: Record<string, unknown>;
    reason: string;
  }>;
  duplicateEventIds?: string[];
}

export interface CloudSyncPullResponse {
  facilityId: string;
  serverTimestamp: string;
  since: string | null;
  cursor?: string;
  deltas: DomainEvent[];
}

export interface ICloudRepository {
  pushEvents(request: CloudSyncPushRequest): Promise<CloudSyncPushResponse>;
  pullEvents(sinceTimestamp: string, facilityId?: string): Promise<CloudSyncPullResponse>;
  checkHealth(): Promise<{ online: boolean; latencyMs?: number; serverTime?: string }>;
}
