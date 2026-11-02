/**
 * Jano Health - Domain Types & Core Entity Definitions
 * Scalable EHR foundation for low-resource and disconnected clinical settings.
 */

export type RoleType =
  | 'system_administrator'
  | 'facility_administrator'
  | 'system_interoperability_admin'
  | 'network_administrator'
  | 'terminology_administrator'
  | 'facility_interoperability_admin'
  | 'physician'
  | 'nurse'
  | 'pharmacist'
  | 'laboratory_staff'
  | 'radiology_staff'
  | 'radiologist'
  | 'receptionist'
  | 'health_officer'
  | 'clinical_supervisor'
  | 'facility_intelligence_user'
  | 'network_intelligence_user'
  | 'public_health_intelligence_user'
  | 'system_intelligence_admin'
  | 'clinical_researcher'
  | 'research_coordinator'
  | 'data_access_steward'
  | 'national_interoperability_officer'
  | 'ecosystem_data_steward'
  | 'system_intelligence_governor'
  | 'deployment_engineer'
  | 'pilot_operations_director'
  | 'pilot_site_coordinator'
  | 'clinical_safety_officer'
  | 'clinical_quality_reviewer'
  | 'multisite_evidence_lead'
  | 'production_operations_director'
  | 'commercial_operations_lead'
  | 'scale_decision_authority'
  | 'data_governance_officer'
  | 'quality_manager'
  | 'regulatory_affairs_specialist'
  | 'lead_assessor'
  | 'independent_auditor'
  | 'compliance_officer';

export type Permission =
  | 'patient:read'
  | 'patient:create'
  | 'patient:update'
  | 'patient:delete'
  | 'patient:merge'
  | 'encounter:read'
  | 'encounter:create'
  | 'encounter:update'
  | 'clinical:notes_write'
  | 'clinical:diagnose'
  | 'clinical:prescribe'
  | 'vitals:record'
  | 'vitals:read'
  | 'problem:read'
  | 'problem:write'
  | 'problem:resolve'
  | 'problem:correct'
  | 'diagnosis:read'
  | 'diagnosis:write'
  | 'diagnosis:confirm'
  | 'diagnosis:correct'
  | 'diagnosis:enter_in_error'
  | 'clinical:assessment_read'
  | 'clinical:assessment_write'
  | 'clinical:assessment_sign'
  | 'lab:order'
  | 'lab:order_cancel'
  | 'lab:read'
  | 'lab:specimen_collect'
  | 'lab:specimen_receive'
  | 'lab:specimen_reject'
  | 'lab:result_entry'
  | 'lab:result_verify'
  | 'lab:result_correct'
  | 'lab:critical_acknowledge'
  | 'radiology:order'
  | 'radiology:order_cancel'
  | 'radiology:read'
  | 'radiology:result_entry'
  | 'radiology:study_schedule'
  | 'radiology:study_perform'
  | 'radiology:study_complete'
  | 'radiology:report_write'
  | 'radiology:report_finalize'
  | 'radiology:report_amend'
  | 'radiology:critical_read'
  | 'radiology:critical_acknowledge'
  | 'pharmacy:review'
  | 'pharmacy:dispense'
  | 'pharmacy:dispense_correct'
  | 'pharmacy:dispense_reverse'
  | 'inventory:read'
  | 'inventory:item_read'
  | 'inventory:adjust'
  | 'inventory:receive'
  | 'inventory:transfer'
  | 'inventory:expire'
  | 'inventory:wastage'
  | 'appointments:manage'
  | 'referrals:manage'
  | 'referral:read'
  | 'referral:create'
  | 'referral:update'
  | 'referral:submit'
  | 'referral:cancel'
  | 'referral:accept'
  | 'referral:reject'
  | 'referral:request_information'
  | 'referral:schedule'
  | 'referral:complete'
  | 'referral:close'
  | 'referral:outcome_write'
  | 'referral:outcome_read'
  | 'emergency:triage'
  | 'emergency:read'
  | 'emergency:create'
  | 'emergency:assess'
  | 'emergency:reassess'
  | 'emergency:disposition'
  | 'emergency:discharge'
  | 'emergency:admit'
  | 'emergency:transfer'
  | 'emergency:override'
  | 'ai:consult'
  | 'ai:access'
  | 'ai:chart_summary'
  | 'ai:encounter_summary'
  | 'ai:clinical_documentation'
  | 'ai:differential_support'
  | 'ai:clinical_question'
  | 'ai:missing_information'
  | 'ai:referral_summary'
  | 'ai:medication_safety_support'
  | 'ai:patient_education'
  | 'ai:review'
  | 'sync:manage'
  | 'audit:read'
  | 'admin:facilities'
  | 'admin:users'
  | 'interoperability:system:manage'
  | 'interoperability:network:manage'
  | 'interoperability:node:register'
  | 'interoperability:node:approve'
  | 'interoperability:node:suspend'
  | 'interoperability:node:revoke'
  | 'interoperability:policy:manage'
  | 'interoperability:terminology:manage'
  | 'interoperability:quarantine:review'
  | 'interoperability:exchange:monitor'
  | 'population:analytics:view'
  | 'population:analytics:manage'
  | 'population:cohort:create'
  | 'population:cohort:execute'
  | 'population:signal:review'
  | 'population:report:create'
  | 'population:report:approve'
  | 'population:publichealth:view'
  | 'population:facility:view'
  | 'population:network:view'
  | 'population:system:view'
  | 'population:metric:manage'
  | 'population:dataquality:view'
  | 'population:governance:manage'
  | 'identity:view'
  | 'identity:reconcile'
  | 'identity:manage'
  | 'identity:external_link:manage'
  | 'consent:view'
  | 'consent:create'
  | 'consent:modify'
  | 'consent:revoke'
  | 'consent:audit:view'
  | 'consent:break_glass'
  | 'finance:coverage:view'
  | 'finance:coverage:verify'
  | 'finance:authorization:create'
  | 'finance:authorization:review'
  | 'finance:claim:create'
  | 'finance:claim:submit'
  | 'finance:claim:review'
  | 'finance:invoice:manage'
  | 'finance:payment:record'
  | 'finance:payment:reconcile'
  | 'finance:quarantine:review'
  | 'finance:governance:manage'
  | 'workforce:view'
  | 'workforce:manage'
  | 'workforce:directory:manage'
  | 'workforce:assignment:manage'
  | 'workforce:credential:view'
  | 'workforce:credential:verify'
  | 'workforce:roster:create'
  | 'workforce:roster:approve'
  | 'workforce:roster:publish'
  | 'workforce:shift:manage'
  | 'workforce:handover:create'
  | 'workforce:handover:receive'
  | 'workforce:handover:audit'
  | 'workforce:task:create'
  | 'workforce:task:assign'
  | 'workforce:task:complete'
  | 'workforce:task:escalate'
  | 'workforce:supervision:manage'
  | 'workforce:training:manage'
  | 'workforce:competency:review'
  | 'workforce:intelligence:view'
  | 'workforce:governance:manage'
  | 'supply:catalog:view'
  | 'supply:catalog:manage'
  | 'supply:demand:view'
  | 'supply:demand:create'
  | 'supply:demand:manage'
  | 'procurement:supplier:view'
  | 'procurement:supplier:manage'
  | 'procurement:requisition:create'
  | 'procurement:requisition:approve'
  | 'procurement:purchase_order:create'
  | 'procurement:purchase_order:approve'
  | 'procurement:purchase_order:send'
  | 'procurement:governance:manage'
  | 'logistics:shipment:view'
  | 'logistics:shipment:manage'
  | 'logistics:receiving:create'
  | 'logistics:receiving:finalize'
  | 'logistics:transfer:create'
  | 'logistics:transfer:approve'
  | 'logistics:transfer:receive'
  | 'coldchain:view'
  | 'coldchain:record'
  | 'coldchain:review'
  | 'coldchain:release'
  | 'supply:quality:view'
  | 'supply:quality:hold'
  | 'supply:quality:release'
  | 'supply:recall:manage'
  | 'supply:intelligence:view'
  | 'supply:forecast:view'
  | 'supply:replenishment:review'
  | 'research:study:view'
  | 'research:study:create'
  | 'research:study:manage'
  | 'research:study:approve'
  | 'research:study:close'
  | 'research:subject:view'
  | 'research:subject:enroll'
  | 'research:subject:withdraw'
  | 'research:consent:view'
  | 'research:consent:create'
  | 'research:consent:withdraw'
  | 'research:consent:audit'
  | 'research:cohort:create'
  | 'research:cohort:execute'
  | 'research:dataset:create'
  | 'research:dataset:approve'
  | 'research:dataset:export'
  | 'research:data_access:request'
  | 'research:data_access:approve'
  | 'research:data_access:revoke'
  | 'research:reidentify:request'
  | 'research:reidentify:approve'
  | 'research:safety:view'
  | 'research:safety:review'
  | 'research:evidence:create'
  | 'research:evidence:review'
  | 'research:evidence:approve'
  | 'research:learning:create'
  | 'research:learning:review'
  | 'research:practice_change:approve'
  | 'research:governance:manage'
  | 'ecosystem:system:view'
  | 'ecosystem:system:manage'
  | 'ecosystem:integration:configure'
  | 'ecosystem:integration:test'
  | 'ecosystem:integration:approve'
  | 'ecosystem:integration:suspend'
  | 'ecosystem:integration:revoke'
  | 'ecosystem:mfr:view'
  | 'ecosystem:mfr:reconcile'
  | 'ecosystem:mfr:manage'
  | 'ecosystem:terminology:view'
  | 'ecosystem:terminology:map'
  | 'ecosystem:terminology:approve'
  | 'ecosystem:reporting:view'
  | 'ecosystem:reporting:create'
  | 'ecosystem:reporting:validate'
  | 'ecosystem:reporting:approve'
  | 'ecosystem:reporting:submit'
  | 'ecosystem:reporting:correct'
  | 'ecosystem:surveillance:view'
  | 'ecosystem:surveillance:review'
  | 'ecosystem:surveillance:approve'
  | 'ecosystem:surveillance:submit'
  | 'ecosystem:identity:verify'
  | 'ecosystem:identity:review'
  | 'ecosystem:governance:manage'
  | 'ecosystem.system.view'
  | 'ecosystem.system.manage'
  | 'ecosystem.integration.configure'
  | 'ecosystem.integration.test'
  | 'ecosystem.integration.approve'
  | 'ecosystem.integration.suspend'
  | 'ecosystem.integration.revoke'
  | 'ecosystem.mfr.view'
  | 'ecosystem.mfr.reconcile'
  | 'ecosystem.mfr.manage'
  | 'ecosystem.terminology.view'
  | 'ecosystem.terminology.map'
  | 'ecosystem.terminology.approve'
  | 'ecosystem.reporting.view'
  | 'ecosystem.reporting.create'
  | 'ecosystem.reporting.validate'
  | 'ecosystem.reporting.approve'
  | 'ecosystem.reporting.submit'
  | 'ecosystem.reporting.correct'
  | 'ecosystem.surveillance.view'
  | 'ecosystem.surveillance.review'
  | 'ecosystem.surveillance.approve'
  | 'ecosystem.surveillance.submit'
  | 'ecosystem.identity.verify'
  | 'ecosystem.identity.review'
  | 'ecosystem.governance.manage'
  | 'system:intelligence:view'
  | 'system:intelligence:manage'
  | 'system:risk:view'
  | 'system:recommendation:view'
  | 'system:recommendation:review'
  | 'system:automation:view'
  | 'system:automation:approve'
  | 'system:automation:execute'
  | 'system:automation:govern'
  | 'system:incident:view'
  | 'system:incident:manage'
  | 'system:recovery:approve'
  | 'system:simulation:run'
  | 'system:policy:simulate'
  | 'system:policy:manage'
  | 'system.intelligence.view'
  | 'system.intelligence.manage'
  | 'system.risk.view'
  | 'system.recommendation.view'
  | 'system.recommendation.review'
  | 'system.automation.view'
  | 'system.automation.approve'
  | 'system.automation.execute'
  | 'system.automation.govern'
  | 'system.incident.view'
  | 'system.incident.manage'
  | 'system.recovery.approve'
  | 'system.simulation.run'
  | 'system.policy.simulate'
  | 'system.policy.manage'
  | 'system:deployment:view'
  | 'system:deployment:manage'
  | 'system:backup:create'
  | 'system:backup:restore'
  | 'system:maintenance:manage'
  | 'system:pilot:manage'
  | 'system:integrity:view'
  | 'system:integrity:audit'
  | 'system:secrets:manage'
  | 'system:release:approve'
  | 'system.deployment.view'
  | 'system.deployment.manage'
  | 'system.backup.create'
  | 'system.backup.restore'
  | 'system.maintenance.manage'
  | 'system.pilot.manage'
  | 'system.integrity.view'
  | 'system.integrity.audit'
  | 'system.secrets.manage'
  | 'system.release.approve'
  | 'clinical:safety:view'
  | 'clinical:safety:manage'
  | 'clinical:safety:approve'
  | 'clinical:risk:accept'
  | 'clinical:validation:review'
  | 'clinical:validation:approve'
  | 'clinical:incident:close'
  | 'clinical:release:gate_approve'
  | 'clinical.safety.view'
  | 'clinical.safety.manage'
  | 'clinical.safety.approve'
  | 'clinical.risk.accept'
  | 'clinical.validation.review'
  | 'clinical.validation.approve'
  | 'clinical.incident.close'
  | 'clinical.release.gate_approve'
  | 'pilot:program:manage'
  | 'pilot:site:assess'
  | 'pilot:golive:approve'
  | 'pilot:killswitch:execute'
  | 'pilot:evidence:export'
  | 'pilot:report:generate'
  | 'pilot.program.manage'
  | 'pilot.site.assess'
  | 'pilot.golive.approve'
  | 'pilot.killswitch.execute'
  | 'pilot.evidence.export'
  | 'pilot.report.generate'
  | 'multisite:program:manage'
  | 'multisite:comparability:assess'
  | 'multisite:metrics:manage'
  | 'multisite:analysis:execute'
  | 'multisite:risk:aggregate'
  | 'multisite:learning:manage'
  | 'multisite:scale:decide'
  | 'multisite:packet:export'
  | 'multisite.program.manage'
  | 'multisite.comparability.assess'
  | 'multisite.metrics.manage'
  | 'multisite.analysis.execute'
  | 'multisite.risk.aggregate'
  | 'multisite.learning.manage'
  | 'multisite.scale.decide'
  | 'multisite.packet.export'
  | 'production:deployment:manage'
  | 'production:fleet:manage'
  | 'production:rollout:orchestrate'
  | 'production:support:manage'
  | 'production:commercial:manage'
  | 'production:scale:approve'
  | 'production:governance:manage'
  | 'production.deployment.manage'
  | 'production.fleet.manage'
  | 'production.rollout.orchestrate'
  | 'production.support.manage'
  | 'production.commercial.manage'
  | 'production.scale.approve'
  | 'production.governance.manage'
  | 'postcore:deployment:execute'
  | 'postcore:sat:evaluate'
  | 'postcore:qms:manage'
  | 'postcore:doc:control'
  | 'postcore:regulatory:register'
  | 'postcore:safety:surveil'
  | 'postcore:capa:close'
  | 'postcore:dossier:seal'
  | 'postcore.deployment.execute'
  | 'postcore.sat.evaluate'
  | 'postcore.qms.manage'
  | 'postcore.doc.control'
  | 'postcore.regulatory.register'
  | 'postcore.safety.surveil'
  | 'postcore.capa.close'
  | 'postcore.dossier.seal'
  | 'assurance:program:manage'
  | 'assurance:scope:evaluate'
  | 'assurance:assessor:engage'
  | 'assurance:finding:raise'
  | 'assurance:finding:remediate'
  | 'assurance:finding:verify'
  | 'assurance:dossier:generate'
  | 'assurance:claims:govern'
  | 'assurance.program.manage'
  | 'assurance.scope.evaluate'
  | 'assurance.assessor.engage'
  | 'assurance.finding.raise'
  | 'assurance.finding.remediate'
  | 'assurance.finding.verify'
  | 'assurance.dossier.generate'
  | 'assurance.claims.govern';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: RoleType;
  facilityId: string;
  departmentId?: string;
  licenseNumber?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface Facility {
  id: string;
  name: string;
  code: string;
  type: 'hospital' | 'health_center' | 'rural_clinic' | 'mobile_unit' | 'district_hospital';
  region: string;
  district: string;
  offlineCapable: boolean;
  contactNumber: string;
  departments: string[];
}

export interface Department {
  id: string;
  facilityId: string;
  name: string;
  code: string;
  headOfDepartment?: string;
}

export interface PatientIdentifier {
  type: 'MRN' | 'NATIONAL_ID' | 'PASSPORT' | 'COMMUNITY_ID';
  value: string;
  issuer: string;
  assignedDate: string;
}

export interface EmergencyContact {
  fullName: string;
  relationship: string;
  phone: string;
  address?: string;
}

export type PatientStatus = 'ACTIVE' | 'INACTIVE' | 'DECEASED' | 'MERGED';
export type DateOfBirthPrecision = 'EXACT' | 'MONTH_YEAR' | 'YEAR_ONLY' | 'UNKNOWN';
export type Sex = 'female' | 'male' | 'other';
export type PatientSyncStatus = 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';

export interface Patient {
  id: string;
  mrn: string; // Medical Record Number
  nationalId?: string;
  nationalIdentifier?: string;
  facilityPatientNumber?: string;
  
  // Demographics (givenName/familyName canonical with firstName/lastName backwards compatibility)
  firstName: string;
  lastName: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  preferredName?: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD, YYYY-MM, or YYYY
  dateOfBirthPrecision?: DateOfBirthPrecision;
  gender: Sex; // backwards compatibility alias for sex
  sex?: Sex;
  genderIdentity?: string;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'other';

  // Contact
  phone?: string;
  alternatePhone?: string;
  email?: string;
  address?: string;
  villageTown: string;
  city?: string;
  district: string;
  region?: string;
  country?: string;

  // Emergency / Next of Kin
  emergencyContact?: EmergencyContact;

  // Administrative
  registrationFacilityId?: string;
  primaryFacilityId: string;
  registrationDate?: string;
  patientStatus?: PatientStatus;
  deceasedAt?: string;
  preferredLanguage?: string;
  occupation?: string;

  // Clinical identity summaries (references, not full aggregates)
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
  pregnancyStatus?: 'not_pregnant' | 'pregnant' | 'postpartum' | 'unknown';
  allergiesSummary?: string[];
  activeDiagnosesSummary?: string[];
  problemListReference?: string[];
  triageUrgency: 'routine' | 'urgent' | 'emergency';

  // Metadata
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  updatedById?: string;
  source?: 'registration_form' | 'offline_sync' | 'mesh_import' | 'manual_entry' | 'synthetic_demo';
  provenance?: string;

  // Synchronization & Merge
  syncStatus?: PatientSyncStatus;
  syncedAt?: string;
  mergedIntoPatientId?: string;
  mergeReason?: string;
  mergedAt?: string;
  mergedById?: string;
}

export type EncounterType =
  | 'OUTPATIENT'
  | 'INPATIENT'
  | 'EMERGENCY'
  | 'FOLLOW_UP'
  | 'TELEMEDICINE'
  | 'COMMUNITY_OUTREACH'
  | 'REFERRAL'
  | 'OTHER'
  | 'outpatient'
  | 'inpatient'
  | 'emergency'
  | 'mobile_outreach'
  | 'teleconsultation';

export type EncounterStatus =
  | 'PLANNED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SIGNED'
  | 'CANCELLED'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'referred'
  | 'cancelled';

export type EncounterPriority = 'routine' | 'urgent' | 'emergency';

export interface CareTeamMember {
  userId: string;
  role: RoleType;
  fullName: string;
  assignedAt: string;
}

export interface Encounter {
  id: string;
  encounterNumber?: string;
  patientId: string;
  facilityId: string;
  encounterType?: EncounterType;
  type: EncounterType; // backwards compatibility alias for encounterType
  status: EncounterStatus;
  priority?: EncounterPriority;

  // Participants
  attendingClinicianId?: string;
  attendingClinicianName?: string;
  attendingClinicianRole?: RoleType;
  clinicianId: string; // backwards compatibility alias for attendingClinicianId
  careTeam?: CareTeamMember[];

  // Location
  departmentId?: string;
  servicePoint?: string;
  roomWard?: string;

  // Clinical Context
  chiefComplaint: string;
  reasonForVisit?: string;
  historySummary?: string;
  clinicalContext?: string;

  // Administrative & Provenance
  appointmentId?: string;
  referralId?: string;
  source?: string;
  provenance?: string;

  // Lifecycle Timestamps
  createdAt?: string;
  startedAt: string;
  completedAt?: string;
  endedAt?: string; // backwards compatibility alias for completedAt
  signedAt?: string;
  signedById?: string;
  signedByName?: string;
  signedByRole?: RoleType;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledById?: string;
  updatedAt?: string;
  version?: number;

  // Synchronization
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export type NoteType =
  | 'SOAP'
  | 'NURSING'
  | 'CONSULTATION'
  | 'DISCHARGE_SUMMARY'
  | 'PROCEDURE'
  | 'PROGRESS_NOTE';

export type NoteStatus = 'DRAFT' | 'SIGNED' | 'AMENDED' | 'VOIDED';

export interface SoapSubjective {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  relevantHistory?: string;
  symptoms?: string[];
  narrative?: string;
}

export interface SoapObjective {
  vitalSignsRef?: string;
  physicalExamination?: string;
  relevantObservations?: string;
  narrative?: string;
}

export interface SoapAssessment {
  clinicalAssessment?: string;
  differentialConsiderations?: string[];
  diagnosisReferences?: string[];
  narrative?: string;
}

export interface SoapPlan {
  treatmentPlan?: string;
  investigations?: string[];
  medications?: string[];
  referrals?: string[];
  followUp?: string;
  narrative?: string;
}

export interface SoapContent {
  subjective: SoapSubjective;
  objective: SoapObjective;
  assessment: SoapAssessment;
  plan: SoapPlan;
  narrative?: string;
}

export interface ClinicalNote {
  id: string;
  encounterId: string;
  patientId: string;
  authorId: string;
  authorName?: string;
  authorRole?: RoleType;
  facilityId?: string;
  noteType?: NoteType;
  status?: NoteStatus;

  // Flat string properties for backwards compatibility
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;

  // Structured SOAP content
  structuredContent?: SoapContent;

  createdAt?: string;
  recordedAt: string;
  updatedAt?: string;

  // Signing
  signedAt?: string;
  signedById?: string;
  signedByName?: string;
  signedByRole?: RoleType;

  // Versioning & Amendment
  version?: number;
  previousVersionId?: string;
  amendmentReason?: string;
  amendedById?: string;
  amendedByName?: string;
  amendedAt?: string;

  // Sync & Provenance
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  provenance?: string;
  isAddendum?: boolean;
}

export interface VitalSign {
  id: string;
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  recordedById: string;
  recordedByName?: string;
  recordedByRole?: RoleType;
  recordedAt: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  temperature?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weightKg?: number;
  heightCm?: number;
  painScore?: number;
  bloodGlucoseMgDl?: number;
  clinicalWarnings?: string[];
  version?: number;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  amended?: boolean;
  amendmentReason?: string;
  previousVitalId?: string;
}

export interface Allergy {
  id: string;
  patientId: string;
  allergen: string;
  type: 'drug' | 'food' | 'environmental' | 'other';
  severity: 'mild' | 'moderate' | 'severe' | 'life_threatening';
  reaction: string;
  diagnosedDate: string;
  active: boolean;
}

/**
 * Legacy Medication record.
 * In Clinical Core V6, MedicationOrder and Prescription are the authoritative clinical prescribing records.
 * This interface is retained for backwards compatibility with legacy UI consumers and historical exports.
 */
export interface Medication {
  id: string;
  patientId: string;
  encounterId?: string;
  name: string;
  genericName: string;
  dosage: string;
  route: 'oral' | 'intravenous' | 'intramuscular' | 'subcutaneous' | 'topical' | 'inhalation';
  frequency: string; // e.g. "BID", "TID", "Once daily"
  durationDays: number;
  startDate: string;
  endDate?: string;
  prescribedById: string;
  dispensedStatus: 'pending' | 'dispensed' | 'cancelled';
  instructions?: string;
}

export * from './medicationTypes';

export type ProblemStatus =
  | 'ACTIVE'
  | 'RESOLVED'
  | 'INACTIVE'
  | 'ENTERED_IN_ERROR'
  | 'active'
  | 'resolved'
  | 'chronic';

export type ProblemPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Problem {
  id: string;
  patientId: string;
  facilityId: string;
  onsetDate: string;
  recordedAt: string;
  recordedById: string;
  recordedByName?: string;
  recordedByRole?: RoleType;
  status: ProblemStatus;
  description: string;
  clinicalDescription?: string;
  priority: ProblemPriority;
  sourceEncounterId?: string;
  resolvedAt?: string;
  resolvedById?: string;
  resolvedByName?: string;
  resolutionReason?: string;
  version: number;
  provenance?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  enteredInError?: boolean;
  errorReason?: string;
  errorRecordedById?: string;
  errorRecordedAt?: string;
  errorReplacementProblemId?: string;
}

export type DiagnosisType =
  | 'PRIMARY'
  | 'SECONDARY'
  | 'WORKING'
  | 'HISTORICAL'
  | 'EXTERNAL'
  | 'working'
  | 'confirmed'
  | 'differential';

export type DiagnosisCertainty = 'CONFIRMED' | 'PROVISIONAL' | 'SUSPECTED' | 'RULED_OUT';

export type DiagnosisStatus =
  | 'PROVISIONAL'
  | 'CONFIRMED'
  | 'RESOLVED'
  | 'ENTERED_IN_ERROR'
  | 'active'
  | 'resolved'
  | 'chronic';

export interface Diagnosis {
  id: string;
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  clinicianId?: string;
  clinicianName?: string;
  clinicianRole?: RoleType;
  diagnosisCode?: string;
  code?: string; // backwards compatibility
  codingSystem?: string; // 'ICD-10', 'SNOMED-CT', 'SYNTHETIC_DEMO'
  diagnosisText?: string;
  description?: string; // backwards compatibility
  diagnosisType?: DiagnosisType;
  type?: DiagnosisType; // backwards compatibility
  certainty?: DiagnosisCertainty;
  status: DiagnosisStatus;
  onsetContext?: string;
  onsetYearMonth?: string; // backwards compatibility
  recordedAt: string;
  confirmedAt?: string;
  confirmedById?: string;
  confirmedByName?: string;
  resolvedAt?: string;
  resolvedById?: string;
  resolutionNotes?: string;
  version?: number;
  previousVersionId?: string;
  amendmentReason?: string;
  provenance?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  enteredInError?: boolean;
  errorReason?: string;
  errorRecordedById?: string;
  errorRecordedAt?: string;
  replacementDiagnosisId?: string;
  isSigned?: boolean;
  signedAt?: string;
  signedById?: string;
  signedByName?: string;
  diagnosedById?: string; // backwards compatibility
}

export type DifferentialStatus =
  | 'CONSIDERED'
  | 'DEPRIORITIZED'
  | 'RULED_OUT'
  | 'PROMOTED_TO_WORKING'
  | 'PROMOTED_TO_CONFIRMED';

export interface DifferentialConsideration {
  id: string;
  encounterId: string;
  patientId: string;
  facilityId: string;
  diagnosisText: string;
  diagnosisCode?: string;
  codingSystem?: string;
  rationale?: string;
  supportingFindings?: string[];
  contradictoryFindings?: string[];
  confidenceLevel?: 'low' | 'moderate' | 'high';
  status: DifferentialStatus;
  deprioritizedReason?: string;
  promotedDiagnosisId?: string;
  createdById: string;
  createdByName?: string;
  createdByRole?: RoleType;
  createdAt: string;
  updatedAt?: string;
  version: number;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export type ClinicalAssessmentStatus = 'DRAFT' | 'SIGNED' | 'AMENDED' | 'VOIDED';

export interface ClinicalAssessment {
  id: string;
  encounterId: string;
  patientId: string;
  facilityId: string;
  clinicianId: string;
  clinicianName?: string;
  clinicianRole: RoleType;
  recordedAt: string;
  updatedAt?: string;
  overallClinicalImpression: string;
  clinicalReasoning?: string;
  uncertaintyComments?: string;
  severityPriority?: 'routine' | 'urgent' | 'emergency';
  activeProblemIds?: string[];
  activeProblems?: string[]; // display / summary helper
  primaryDiagnosisId?: string;
  primaryDiagnosis?: string; // display / summary helper
  secondaryDiagnosisIds?: string[];
  secondaryDiagnoses?: string[]; // display / summary helper
  differentialConsiderationIds?: string[];
  differentialConsiderations?: string[]; // display / summary helper
  status: ClinicalAssessmentStatus;
  signedAt?: string;
  signedById?: string;
  signedByName?: string;
  signedByRole?: RoleType;
  integrityHash?: string;
  version: number;
  previousVersionId?: string;
  amendmentReason?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export interface Procedure {
  id: string;
  patientId: string;
  encounterId: string;
  name: string;
  code?: string;
  performedById: string;
  performedAt: string;
  notes?: string;
  outcome?: string;
}

// ====================================================
// CLINICAL CORE V4: LABORATORY ORDER, SPECIMEN, RESULT & REPORT
// ====================================================

export type LaboratoryOrderStatus = 'DRAFT' | 'PLACED' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED' | 'ordered' | 'sample_collected' | 'processing' | 'completed' | 'cancelled';
export type LaboratoryOrderPriority = 'routine' | 'urgent' | 'stat';

export interface TestRequest {
  testCode: string;
  testName: string;
  terminologySystem: string;
  specimenType: string;
  priority: LaboratoryOrderPriority;
  requestedAt: string;
  status: 'PENDING' | 'COLLECTED' | 'IN_PROCESS' | 'COMPLETED' | 'CANCELLED';
  instructions?: string;
}

export interface SpecimenRequirement {
  specimenType: string;
  minVolume?: string;
  containerType?: string;
  specialHandling?: string;
}

export interface LaboratoryProvenance {
  sourceFacilityId: string;
  sourceDeviceId: string;
  actorId: string;
  actorRole: RoleType;
  timestamp: string;
  terminologyVersion?: string;
  method?: string;
  sourceType: 'LOCAL' | 'EXTERNAL' | 'IMPORTED';
  externalSystemName?: string;
  externalReferenceId?: string;
}

export interface LaboratoryOrder {
  id: string;
  orderNumber?: string;
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  orderingClinicianId?: string;
  orderingClinicianName?: string;
  orderingClinicianRole?: RoleType;
  requestedAt?: string;
  priority?: LaboratoryOrderPriority;
  clinicalIndication?: string;
  requestedTests?: TestRequest[];
  status: LaboratoryOrderStatus;
  hasCriticalResults?: boolean;
  specimenRequirements?: SpecimenRequirement[];
  notes?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledById?: string;
  version?: number;
  provenance?: LaboratoryProvenance;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  integrityHash?: string;

  // Backwards-compatible aliases
  orderedById?: string;
  testName?: string;
  category?: 'hematology' | 'biochemistry' | 'microbiology' | 'parasitology' | 'rapid_diagnostic';
  urgency?: 'routine' | 'urgent' | 'stat';
  orderedAt?: string;
}

export type SpecimenStatus =
  | 'ORDERED'
  | 'COLLECTION_PENDING'
  | 'COLLECTED'
  | 'RECEIVED'
  | 'IN_PROCESS'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED';

export type SpecimenRejectionReason =
  | 'INSUFFICIENT_VOLUME'
  | 'WRONG_CONTAINER'
  | 'MISSING_LABEL'
  | 'HEMOLYZED'
  | 'CLOTTED'
  | 'CONTAMINATED'
  | 'EXPIRED'
  | 'UNACCEPTABLE_CONDITION'
  | 'OTHER';

export interface LaboratorySpecimen {
  id: string;
  accessionNumber: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;
  specimenType: string;
  collectedById?: string;
  collectedByName?: string;
  collectedAt?: string;
  collectionSite?: string;
  condition?: string;
  receivedAt?: string;
  receivedById?: string;
  receivedByName?: string;
  status: SpecimenStatus;
  rejectionReason?: SpecimenRejectionReason;
  rejectionNotes?: string;
  rejectedById?: string;
  rejectedByName?: string;
  rejectedAt?: string;
  version: number;
  provenance: LaboratoryProvenance;
  createdAt: string;
  updatedAt: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  integrityHash?: string;
}

export type LaboratoryResultStatus = 'PRELIMINARY' | 'FINAL' | 'CORRECTED' | 'CANCELLED';
export type AbnormalFlag = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL' | 'ABNORMAL' | 'UNKNOWN';

export interface ContextualReferenceRange {
  low?: number;
  high?: number;
  textDisplay: string;
  unit: string;
  ageMinYears?: number;
  ageMaxYears?: number;
  sex?: 'male' | 'female' | 'other' | 'all';
  pregnancyStatus?: string;
  specimenType?: string;
  method?: string;
  laboratoryId?: string;
  effectiveDate?: string;
  source: string;
  terminologyVersion: string;
}

export interface ResultCorrectionHistory {
  correctedAt: string;
  correctedById: string;
  correctedByName?: string;
  previousValue: string;
  previousNumericValue?: number;
  previousAbnormalFlag?: AbnormalFlag;
  previousInterpretation?: string;
  correctionReason: string;
}

export interface LaboratoryResult {
  id: string;
  orderId: string;
  specimenId?: string;
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  testCode?: string;
  testName?: string;
  value: string;
  numericValue?: number;
  unit?: string;
  referenceRange?: ContextualReferenceRange | string;
  interpretation?: string;
  abnormalFlag?: AbnormalFlag;
  criticalFlag?: boolean;
  status?: LaboratoryResultStatus;
  performerId?: string;
  performerName?: string;
  performerRole?: RoleType;
  performedAt?: string;
  verifiedById?: string;
  verifiedByName?: string;
  verifiedByRole?: RoleType;
  verifiedAt?: string;
  technicianNotes?: string;
  previousVersionId?: string;
  correctionReason?: string;
  correctionHistory?: ResultCorrectionHistory[];
  criticalAlertSent?: boolean;
  criticalAlertSentAt?: string;
  criticalAcknowledged?: boolean;
  criticalAcknowledgedAt?: string;
  criticalAcknowledgedById?: string;
  criticalAcknowledgedByName?: string;
  criticalAcknowledgedMethod?: string;
  criticalAcknowledgementNotes?: string;
  version?: number;
  provenance?: LaboratoryProvenance;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
  integrityHash?: string;

  // Backwards-compatible aliases
  analyzedById?: string;
  completedAt?: string;
  parameterName?: string;
  isAbnormal?: boolean;
  criticalAlert?: boolean;
}

export interface LaboratoryReport {
  id: string;
  orderId: string;
  orderNumber: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;
  orderingClinicianId?: string;
  orderingClinicianName?: string;
  specimens: LaboratorySpecimen[];
  results: LaboratoryResult[];
  status: 'PENDING' | 'PARTIAL' | 'FINAL' | 'CORRECTED';
  hasAbnormal: boolean;
  hasCritical: boolean;
  hasUnacknowledgedCritical: boolean;
  generatedAt: string;
  verifiedAt?: string;
  verifiedById?: string;
  integrityHash?: string;
}

// ====================================================
// CLINICAL CORE V5: RADIOLOGY ORDER, STUDY, SERIES, REPORT & ESCALATION
// ====================================================

export type RadiologyModality =
  | 'XR'
  | 'CT'
  | 'MRI'
  | 'ULTRASOUND'
  | 'MAMMOGRAPHY'
  | 'FLUOROSCOPY'
  | 'OTHER'
  | 'xray'
  | 'ultrasound'
  | 'ct'
  | 'point_of_care_echo';

export type RadiologyOrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ordered'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'performed'
  | 'reported'; // backward compatibility

export type RadiologyOrderPriority = 'routine' | 'urgent' | 'stat' | 'emergency';
export type RadiologyLaterality = 'LEFT' | 'RIGHT' | 'BILATERAL' | 'UNILATERAL' | 'NOT_APPLICABLE';

export interface RadiologyProvenance {
  sourceFacilityId: string;
  sourceDeviceId: string;
  actorId: string;
  actorRole: RoleType;
  timestamp: string;
  sourceType: 'LOCAL' | 'EXTERNAL' | 'IMPORTED';
  externalSystemName?: string;
}

export interface RadiologyOrder {
  id: string;
  orderNumber?: string;
  patientId: string;
  encounterId?: string;
  facilityId?: string;
  orderingClinicianId?: string;
  orderedById?: string; // backwards compatibility
  orderingClinicianName?: string;
  orderingClinicianRole?: RoleType;
  requestedAt?: string;
  orderedAt?: string; // backwards compatibility
  priority?: RadiologyOrderPriority;
  urgency?: RadiologyOrderPriority; // backwards compatibility
  indication?: string;
  clinicalIndication?: string; // backwards compatibility
  clinicalQuestion?: string;
  requestedStudyType?: string;
  modality: RadiologyModality;
  bodySite: string;
  laterality?: RadiologyLaterality;
  contrastRequested?: boolean;
  status: RadiologyOrderStatus;
  appointmentId?: string;
  notes?: string;
  version?: number;
  provenance?: RadiologyProvenance | string;
  createdAt?: string;
  updatedAt?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export type RadiologyStudyStatus =
  | 'SCHEDULED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'ACQUIRED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface RadiologyStudy {
  id: string;
  studyNumber: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;
  modality: RadiologyModality;
  bodySite: string;
  laterality?: RadiologyLaterality;
  performingTechnologistId?: string;
  performingTechnologistName?: string;
  performingTechnologistRole?: RoleType;
  startedAt?: string;
  completedAt?: string;
  status: RadiologyStudyStatus;
  accessionNumber: string;
  studyDescription: string;
  seriesCount: number;
  instanceCount: number;
  series?: ImagingSeries[];
  provenance: RadiologyProvenance;
  version: number;
  createdAt: string;
  updatedAt?: string;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export interface ImagingSeries {
  id: string;
  studyId: string;
  seriesNumber?: number;
  modality: RadiologyModality;
  seriesDescription: string;
  bodySite?: string;
  instanceCount: number;
  instances?: ImagingInstance[];
  createdAt: string;
  provenance?: RadiologyProvenance;
}

export interface ImagingInstance {
  id: string;
  seriesId: string;
  instanceNumber: number;
  sopClassUid: string;
  sopInstanceUid: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  provenance?: RadiologyProvenance;
}

export type RadiologyReportStatus =
  | 'DRAFT'
  | 'PRELIMINARY'
  | 'FINAL'
  | 'AMENDED'
  | 'CANCELLED';

export interface RadiologyReportAmendment {
  version: number;
  amendedAt: string;
  amendedById: string;
  amendedByName: string;
  amendedByRole: RoleType;
  reason: string;
  previousFindings: string;
  previousImpression: string;
}

export interface RadiologyReport {
  id: string;
  studyId: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;
  radiologistId: string;
  radiologistName?: string;
  radiologistRole?: RoleType;
  findings: string;
  impression: string;
  comparisonText?: string;
  clinicalHistoryReference?: string;
  indication?: string;
  technique?: string;
  recommendations?: string;
  criticalFinding: boolean;
  status: RadiologyReportStatus;
  createdAt: string;
  updatedAt?: string;
  signedAt?: string;
  verifiedAt?: string;
  integrityHash?: string;
  version: number;
  previousVersionId?: string;
  amendmentReason?: string;
  amendmentHistory?: RadiologyReportAmendment[];
  provenance: RadiologyProvenance;
  syncStatus?: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'SYNC_CONFLICT' | 'SYNC_FAILED';
  syncedAt?: string;
}

export interface CriticalRadiologyFinding {
  id: string;
  reportId: string;
  studyId: string;
  orderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;
  findingDescription: string;
  escalatedAt: string;
  escalatedById: string;
  escalatedByName?: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedById?: string;
  acknowledgedByName?: string;
  acknowledgedByRole?: RoleType;
  actionTaken?: string;
  communicationMethod?: string;
  notes?: string;
}

export interface RadiologyResult {
  id: string;
  orderId: string;
  patientId: string;
  radiologistId: string;
  findings: string;
  impression: string;
  completedAt: string;
  urgencyFlags?: string;
  reportId?: string;
  criticalFinding?: boolean;
}

export interface Appointment {
  id: string;
  patientId: string;
  clinicianId?: string;
  facilityId: string;
  scheduledTime: string;
  durationMinutes: number;
  reason: string;
  type: 'routine_follow_up' | 'antenatal' | 'immunization' | 'chronic_care' | 'specialist';
  status: 'scheduled' | 'checked_in' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
}

export interface ProvenanceRecord {
  recordedById?: string;
  recordedByName?: string;
  recordedAt?: string;
  facilityId?: string;
  deviceId?: string;
  syncStatus?: string;
  source?: string;
  ruleId?: string;
  ruleVersion?: string;
  executedAt?: string;
  evaluationContext?: string;
}

export * from './referralTypes';
export * from './emergencyTypes';
export * from './emergencyIdentifiers';
export * from './aiTypes';
export * from './identityTypes';
export * from './consentTypes';
export * from './financingTypes';

export type DomainEventType =
  | 'PATIENT_CREATED'
  | 'PATIENT_UPDATED'
  | 'ENCOUNTER_CREATED'
  | 'ENCOUNTER_UPDATED'
  | 'VITAL_SIGN_RECORDED'
  | 'DIAGNOSIS_RECORDED'
  | 'MEDICATION_RECORDED'
  | 'LAB_ORDER_CREATED'
  | 'LAB_RESULT_RECORDED'
  | 'RADIOLOGY_ORDER_CREATED'
  | 'RADIOLOGY_RESULT_RECORDED'
  | 'APPOINTMENT_CREATED'
  | 'REFERRAL_CREATED'
  | 'EMERGENCY_CASE_TRIAGED'
  | 'EMERGENCY_CASE_CREATED'
  | 'EMERGENCY_TRIAGE_RECORDED'
  | 'EMERGENCY_ASSESSMENT_RECORDED'
  | 'EMERGENCY_REASSESSMENT_RECORDED'
  | 'EMERGENCY_STATUS_CHANGED'
  | 'EMERGENCY_DISPOSITION_RECORDED'
  | 'EMERGENCY_DISCHARGE_RECORDED'
  | 'EMERGENCY_ADMISSION_RECORDED'
  | 'EMERGENCY_TRANSFER_RECORDED'
  | 'EMERGENCY_DEATH_RECORDED'
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
  | 'AI_RESPONSE_RECORDED'
  | 'IDENTITY_EVIDENCE_RECORDED'
  | 'IDENTITY_RECONCILED'
  | 'CONSENT_GRANTED'
  | 'CONSENT_REVOKED'
  | 'EMERGENCY_ACCESS_GRANTED'
  | 'COVERAGE_RECORDED'
  | 'COVERAGE_VERIFIED'
  | 'SERVICE_AUTHORIZED'
  | 'CLAIM_CREATED'
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_ADJUDICATED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_REVERSED'
  | 'FINANCIAL_QUARANTINED';

export interface AuditEvent {
  id: string;
  eventId?: string;
  actorId: string;
  actorName: string;
  actorRole: RoleType;
  facilityId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  deviceId: string;
  syncStatus: 'synced' | 'pending' | 'offline_retained';
  previousState?: Record<string, unknown>;
  resultingState?: Record<string, unknown>;
  ipAddress?: string;
  previousAuditHash?: string | null;
  auditHash?: string;
  isProvisional?: boolean;
  persistenceStatus?: 'provisional' | 'persisted' | 'failed';
  persistenceError?: string;
}

export interface SyncEvent {
  id: string;
  eventType: DomainEventType;
  entityName: string;
  entityId: string;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  deviceId: string;
  status: 'queued' | 'syncing' | 'synced' | 'conflict' | 'failed';
  retryCount: number;
  lastAttemptAt?: string;
  conflictDetails?: {
    serverVersion?: number;
    clientVersion?: number;
    resolution?: 'client_wins' | 'server_wins' | 'merged';
  };
}

// ----------------------------------------------------
// V13: JANO HEALTH NETWORK & MULTI-FACILITY DOMAIN ENTITIES
// ----------------------------------------------------

export type NetworkNodeStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN';
export type NetworkTrustStatus = 'PENDING' | 'TRUSTED' | 'SUSPENDED' | 'REVOKED';

export interface NetworkEndpointMetadata {
  url?: string;
  protocol: 'http' | 'https' | 'in_memory' | 'mesh';
  authMethod: 'mutual_tls' | 'bearer_token' | 'api_key' | 'internal';
  timeoutMs?: number;
}

export interface NodeProvenance {
  registeredBy: string;
  approvedBy?: string;
  suspendedBy?: string;
  revokedBy?: string;
  reason?: string;
  timestamp: string;
}

export interface JanoNetworkNode {
  nodeId: string;
  nodeCode: string;
  facilityId: string;
  organizationId: string;
  displayName: string;
  environment: 'production' | 'staging' | 'development' | 'sandbox';
  networkStatus: NetworkNodeStatus;
  trustStatus: NetworkTrustStatus;
  capabilities: string[];
  endpointMetadata: NetworkEndpointMetadata;
  supportedExchangeProfiles: string[];
  supportedFhirVersion: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  provenance: NodeProvenance;
  version: number;
  integrityHash: string;
}

export type ExchangeResourceType =
  | 'Patient'
  | 'Encounter'
  | 'Observation'
  | 'Condition'
  | 'AllergyIntolerance'
  | 'DiagnosticReport'
  | 'ServiceRequest'
  | 'Specimen'
  | 'ImagingStudy'
  | 'Medication'
  | 'MedicationRequest'
  | 'MedicationDispense'
  | 'Referral'
  | 'EmergencyTransfer'
  | 'DocumentReference'
  | 'Bundle';

export interface NetworkExchangePolicy {
  policyId: string;
  name: string;
  sourceNodeId: string; // or '*' for any trusted node
  destinationNodeId: string; // or '*' for any trusted node
  sourceFacilityId: string; // or '*'
  destinationFacilityId: string; // or '*'
  purpose: 'TREATMENT' | 'EMERGENCY' | 'REFERRAL' | 'TRANSFER' | 'DIAGNOSTIC_REPORT' | 'OPERATIONS';
  resourceTypes: ExchangeResourceType[];
  direction: 'INBOUND' | 'OUTBOUND' | 'BIDIRECTIONAL';
  operations: Array<'CREATE' | 'READ' | 'UPDATE' | 'NOTIFY' | 'QUERY'>;
  priority: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  maxPayloadSizeBytes: number;
  rateLimitPerMinute: number;
  validFrom: string;
  validTo: string;
  offlineQueueAllowed: boolean;
  ackRequired: boolean;
  quarantineOnAmbiguity: boolean;
  isActive: boolean;
  version: number;
  integrityHash: string;
}

export type ExchangeLifecycleState =
  | 'CREATED'
  | 'QUEUED'
  | 'SENDING'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'APPLIED'
  | 'FAILED'
  | 'RETRY'
  | 'DEAD_LETTER'
  | 'QUARANTINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface MessageAttempt {
  attemptNumber: number;
  timestamp: string;
  status: 'SUCCESS' | 'TRANSIENT_FAILURE' | 'PERMANENT_FAILURE' | 'QUARANTINED';
  statusCode?: number;
  errorMessage?: string;
  latencyMs?: number;
  transportType?: string;
}

export interface NetworkExchangeMessage {
  messageId: string;
  exchangeId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  messageType:
    | 'REFERRAL'
    | 'LAB_ORDER'
    | 'LAB_RESULT'
    | 'RADIOLOGY_ORDER'
    | 'RADIOLOGY_RESULT'
    | 'MEDICATION_HISTORY'
    | 'EMERGENCY_TRANSFER'
    | 'PATIENT_SUMMARY'
    | 'CLINICAL_DOCUMENT';
  resourceType: ExchangeResourceType;
  resourceId: string;
  payload: any;
  payloadHash: string;
  schemaProfile: string;
  correlationId: string;
  idempotencyKey: string;
  priority: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  currentState: ExchangeLifecycleState;
  createdAt: string;
  queuedAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  appliedAt?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  expiryAt: string;
  failureCode?: string;
  failureMessage?: string;
  attemptHistory: MessageAttempt[];
  provenance: {
    authorId: string;
    authorRole: string;
    authorFacilityId: string;
    timestamp: string;
    signatureSeal?: string;
  };
  integrityHash: string;
}

export type NetworkQuarantineCategory =
  | 'IDENTITY_AMBIGUITY'
  | 'TERMINOLOGY_AMBIGUITY'
  | 'TRUST_FAILURE'
  | 'POLICY_FAILURE'
  | 'VALIDATION_FAILURE'
  | 'INTEGRITY_FAILURE'
  | 'DUPLICATE'
  | 'REPLAY_DETECTED'
  | 'UNSUPPORTED_PROFILE';

export type QuarantineResolutionAction =
  | 'APPROVE'
  | 'REJECT'
  | 'REQUEST_REVIEW'
  | 'MAP_IDENTITY'
  | 'MAP_TERMINOLOGY'
  | 'RETRY'
  | 'RESOLVED'
  | 'ESCALATE';

export interface NetworkQuarantineItem {
  id: string;
  category: NetworkQuarantineCategory;
  messageId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  resourceType: string;
  resourceId: string;
  rawPayload: any;
  normalizedPreview?: any;
  quarantineReason: string;
  validationFindings: Array<{
    severity: 'error' | 'warning' | 'information';
    code: string;
    message: string;
    expression?: string;
  }>;
  identityCandidates?: Array<{
    patientId: string;
    mrn: string;
    name: string;
    dob: string;
    score: number;
    matchReasons: string[];
  }>;
  terminologyCandidates?: Array<{
    code: string;
    system: string;
    display: string;
    suggestedMapping?: string;
  }>;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
  quarantinedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  reviewerRole?: string;
  resolutionAction?: QuarantineResolutionAction;
  reviewerNotes?: string;
  mappedEntityId?: string;
  auditTrail: Array<{
    action: string;
    performedBy: string;
    timestamp: string;
    notes?: string;
  }>;
}

export interface ExternalPatientIdentity {
  id: string;
  patientId: string; // Internal authoritative Jano patient ID
  sourceSystem: string;
  sourceNodeId: string;
  sourceFacilityId: string;
  externalIdentifier: string;
  identifierSystem: string;
  identifierValueHash: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'RECONCILED' | 'CONFLICT' | 'REJECTED';
  firstSeenAt: string;
  lastVerifiedAt: string;
  provenance: {
    recordedBy: string;
    timestamp: string;
    notes?: string;
  };
}

/**
 * Optional future-compatible abstraction for National Identity Integration.
 * Intentionally nullable and unconfigured in V13 without a live authorized provider.
 */
export interface NationalIdentityReference {
  nationalSystemId: string | null;
  nationalIdentifierValue: string | null;
  verificationStatus: 'UNAVAILABLE' | 'SANDBOX' | 'VERIFIED' | 'UNVERIFIED';
  verifiedAt: string | null;
}

export interface FacilityDirectoryEntry {
  facilityId: string;
  facilityCode: string;
  name: string;
  type: 'hospital' | 'health_center' | 'rural_clinic' | 'mobile_unit' | 'district_hospital';
  region: string;
  district: string;
  operatingStatus: 'ACTIVE' | 'TEMPORARILY_CLOSED' | 'DECOMMISSIONED';
  supportedExchangeProfiles: string[];
  capabilities: {
    referralDestination: boolean;
    emergencyCapability: boolean;
    laboratoryCapability: boolean;
    radiologyCapability: boolean;
    pharmacyCapability: boolean;
    inpatientCapability: boolean;
  };
  associatedNodeId?: string;
  nodeStatus?: NetworkNodeStatus;
  lastSyncAt: string;
}

export interface PractitionerDirectoryEntry {
  practitionerId: string;
  fullName: string;
  role: RoleType;
  specialty?: string;
  primaryFacilityId: string;
  facilityName: string;
  departmentName?: string;
  activeStatus: boolean;
  canReceiveReferrals: boolean;
}

export interface ServiceDirectoryEntry {
  serviceId: string;
  facilityId: string;
  serviceCode: string;
  serviceName: string;
  category: 'OUTPATIENT' | 'INPATIENT' | 'EMERGENCY' | 'SURGERY' | 'LABORATORY' | 'IMAGING' | 'PHARMACY';
  isAvailable: boolean;
  operatingHours: string;
  contactEmergency?: string;
}

export interface NetworkExchangeLogEntry {
  id: string;
  timestamp: string;
  exchangeId: string;
  messageId: string;
  sourceNodeId: string;
  destinationNodeId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  messageType: string;
  state: ExchangeLifecycleState;
  statusCode?: number;
  durationMs: number;
  payloadSize: number;
  payloadHash: string;
  actorId: string;
  error?: string;
}

export type NationalExchangeStatus = 'UNAVAILABLE' | 'SANDBOX' | 'CONFIGURED';

