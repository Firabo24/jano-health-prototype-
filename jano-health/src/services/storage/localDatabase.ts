/**
 * Jano Health - Local Clinical Persistence Layer
 * Provides an offline-first storage abstraction with atomic operations,
 * indexing, and change-event capture for low-resource environments.
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
  RadiologyResult,
  Referral,
  ReferralOutcome,
  ReferralCommunication,
  SyncEvent,
  VitalSign,
  AIRequest,
  AIResponse,
  AIReview,
} from '../../domain/types';
import {
  DEMO_ALLERGIES,
  DEMO_APPOINTMENTS,
  DEMO_AUDIT_EVENTS,
  DEMO_CLINICAL_NOTES,
  DEMO_DIAGNOSES,
  DEMO_EMERGENCY_CASES,
  DEMO_ENCOUNTERS,
  DEMO_LAB_ORDERS,
  DEMO_LAB_RESULTS,
  DEMO_MEDICATIONS,
  DEMO_PATIENTS,
  DEMO_RADIOLOGY_ORDERS,
  DEMO_RADIOLOGY_RESULTS,
  DEMO_REFERRALS,
  DEMO_SYNC_EVENTS,
  DEMO_VITALS,
} from '../../data/syntheticDemoData';
import { idbEngine, StoreName } from './indexedDbEngine';

const STORAGE_KEY_PREFIX = 'jano_health_db_v1_';

const inMemoryFallbackStore = new Map<string, string>();
export const safeStorage = {
  getItem: (key: string): string | null => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      return inMemoryFallbackStore.get(key) || null;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {}
    return inMemoryFallbackStore.get(key) || null;
  },
  setItem: (key: string, val: string): void => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      // Plaintext localStorage persistence is strictly prohibited for clinical collections.
      // Direct uncommitted writes through safeStorage are also blocked to prevent false-success reads.
      throw new Error(`[safeStorage] Direct mutation of clinical collection [${key}] via safeStorage is prohibited. Use durable LocalClinicalDatabase save methods.`);
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
        return;
      }
    } catch {}
    inMemoryFallbackStore.set(key, val);
  },
  removeItem: (key: string): void => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      inMemoryFallbackStore.delete(key);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch {}
    inMemoryFallbackStore.delete(key);
  },
};

export interface LocalStorageSnapshot {
  patients: Patient[];
  encounters: Encounter[];
  clinicalNotes: ClinicalNote[];
  vitals: VitalSign[];
  allergies: Allergy[];
  medications: Medication[];
  medicationDefinitions: MedicationDefinition[];
  medicationOrders: MedicationOrder[];
  prescriptions: Prescription[];
  problems: Problem[];
  diagnoses: Diagnosis[];
  differentials: DifferentialConsideration[];
  clinicalAssessments: ClinicalAssessment[];
  labOrders: LaboratoryOrder[];
  labSpecimens: LaboratorySpecimen[];
  labResults: LaboratoryResult[];
  radiologyOrders: RadiologyOrder[];
  radiologyResults: RadiologyResult[];
  appointments: Appointment[];
  referrals: Referral[];
  referralOutcomes: ReferralOutcome[];
  referralCommunications: ReferralCommunication[];
  emergencyCases: EmergencyCase[];
  emergencyTriages: EmergencyTriage[];
  emergencyReassessments: EmergencyReassessment[];
  emergencyAlerts: EmergencyAlert[];
  transportRequests: TransportRequest[];
  aiRequests: AIRequest[];
  aiResponses: AIResponse[];
  aiReviews: AIReview[];
  syncQueue: SyncEvent[];
  auditLog: AuditEvent[];
}

export class LocalClinicalDatabase {
  private static instance: LocalClinicalDatabase;
  private deviceId: string;

  private constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.initializeIfEmpty();
  }

  public static getInstance(): LocalClinicalDatabase {
    if (!LocalClinicalDatabase.instance) {
      LocalClinicalDatabase.instance = new LocalClinicalDatabase();
    }
    return LocalClinicalDatabase.instance;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  private getOrCreateDeviceId(): string {
    const key = 'jano_device_id';
    let id = safeStorage.getItem(key);
    if (!id) {
      id = 'dev-node-' + Math.random().toString(36).substring(2, 9);
      safeStorage.setItem(key, id);
    }
    return id;
  }

  private initializeIfEmpty(): void {
    if (!inMemoryFallbackStore.get(STORAGE_KEY_PREFIX + 'patients')) {
      this.populateInitialDemoMemory();
    }
  }

  public populateInitialDemoMemory(): void {
    this.publishCommittedCollection('patients', DEMO_PATIENTS);
    this.publishCommittedCollection('encounters', DEMO_ENCOUNTERS);
    this.publishCommittedCollection('clinicalNotes', DEMO_CLINICAL_NOTES);
    this.publishCommittedCollection('vitals', DEMO_VITALS);
    this.publishCommittedCollection('allergies', DEMO_ALLERGIES);
    this.publishCommittedCollection('medications', DEMO_MEDICATIONS);
    this.publishCommittedCollection('diagnoses', DEMO_DIAGNOSES);
    this.publishCommittedCollection('labOrders', DEMO_LAB_ORDERS);
    this.publishCommittedCollection('labResults', DEMO_LAB_RESULTS);
    this.publishCommittedCollection('radiologyOrders', DEMO_RADIOLOGY_ORDERS);
    this.publishCommittedCollection('radiologyResults', DEMO_RADIOLOGY_RESULTS);
    this.publishCommittedCollection('appointments', DEMO_APPOINTMENTS);
    this.publishCommittedCollection('referrals', DEMO_REFERRALS);
    this.publishCommittedCollection('emergencyCases', DEMO_EMERGENCY_CASES);
    this.publishCommittedCollection('syncQueue', DEMO_SYNC_EVENTS);
    this.publishCommittedCollection('auditLog', DEMO_AUDIT_EVENTS);
  }

  public async resetToSyntheticDemoData(): Promise<void> {
    const demoBatches: Array<{ store: StoreName; colName: keyof LocalStorageSnapshot; items: any[] }> = [
      { store: 'patients', colName: 'patients', items: DEMO_PATIENTS },
      { store: 'encounters', colName: 'encounters', items: DEMO_ENCOUNTERS },
      { store: 'clinicalNotes', colName: 'clinicalNotes', items: DEMO_CLINICAL_NOTES },
      { store: 'vitals', colName: 'vitals', items: DEMO_VITALS },
      { store: 'allergies', colName: 'allergies', items: DEMO_ALLERGIES },
      { store: 'medications', colName: 'medications', items: DEMO_MEDICATIONS },
      { store: 'diagnoses', colName: 'diagnoses', items: DEMO_DIAGNOSES },
      { store: 'labOrders', colName: 'labOrders', items: DEMO_LAB_ORDERS },
      { store: 'labResults', colName: 'labResults', items: DEMO_LAB_RESULTS },
      { store: 'radiologyOrders', colName: 'radiologyOrders', items: DEMO_RADIOLOGY_ORDERS },
      { store: 'radiologyResults', colName: 'radiologyResults', items: DEMO_RADIOLOGY_RESULTS },
      { store: 'appointments', colName: 'appointments', items: DEMO_APPOINTMENTS },
      { store: 'referrals', colName: 'referrals', items: DEMO_REFERRALS },
      { store: 'emergencyCases', colName: 'emergencyCases', items: DEMO_EMERGENCY_CASES },
      { store: 'syncQueue', colName: 'syncQueue', items: DEMO_SYNC_EVENTS },
      { store: 'auditLog', colName: 'auditLog', items: DEMO_AUDIT_EVENTS },
    ];

    // 1. Authoritative atomic reset: all 16 stores commit in ONE native IndexedDB transaction
    await idbEngine.resetStoresAtomic(demoBatches.map((b) => ({ store: b.store, items: b.items })));

    // 2. Publish in-memory collection mirrors ONLY after complete durable commit
    for (const b of demoBatches) {
      this.publishCommittedCollection(b.colName, b.items);
    }
  }

  public async hydrateFromIndexedDb(): Promise<void> {
    const storeMap: Record<string, string> = {
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
      aiRequests: 'aiRequests',
      aiResponses: 'aiResponses',
      aiReviews: 'aiReviews',
    };

    for (const [colName, storeName] of Object.entries(storeMap)) {
      try {
        const records = await idbEngine.getAll<any>(storeName as any);
        if (records && records.length > 0) {
          this.publishCommittedCollection(colName as any, records);
        }
      } catch (err) {
        // Fail closed without corrupting existing cache
      }
    }
  }

  private getCollection<T>(name: keyof LocalStorageSnapshot): T[] {
    try {
      const data = safeStorage.getItem(STORAGE_KEY_PREFIX + name);
      if (!data) return [];
      return JSON.parse(data) as T[];
    } catch {
      return [];
    }
  }

  private publishCommittedCollection<T>(name: keyof LocalStorageSnapshot, items: T[]): void {
    inMemoryFallbackStore.set(STORAGE_KEY_PREFIX + name, JSON.stringify(items));
  }

  private async saveCollection<T>(name: keyof LocalStorageSnapshot, items: T[]): Promise<void> {
    if (!Array.isArray(items)) {
      throw new Error(`[LocalClinicalDatabase] Invalid collection payload for [${name}]: must be an array`);
    }

    const storeMap: Record<string, any> = {
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
      aiRequests: 'aiRequests',
      aiResponses: 'aiResponses',
      aiReviews: 'aiReviews',
    };
    const targetStore = storeMap[name];
    if (targetStore) {
      // 1. Authoritative IndexedDB persistence: AWAIT COMMIT
      await idbEngine.putBatch(targetStore, items as any);
    }

    // 2. Publish to in-memory mirror ONLY after successful durable commit
    this.publishCommittedCollection(name, items);
  }

  // --- Patients ---
  public getPatients(): Patient[] {
    return this.getCollection<Patient>('patients');
  }

  public getPatientById(id: string): Patient | undefined {
    if (!id) return undefined;
    const target = id.toLowerCase();
    return this.getPatients().find((p) => p.id === id || (p.mrn && p.mrn.toLowerCase() === target));
  }

  public async savePatient(patient: Patient): Promise<void> {
    const list = [...this.getPatients()];
    const index = list.findIndex((p) => p.id === patient.id);
    if (index >= 0) {
      const currentVersion = list[index].version || 1;
      const targetVersion = patient.version && patient.version > currentVersion 
        ? patient.version 
        : currentVersion + 1;
      list[index] = { ...patient, updatedAt: new Date().toISOString(), version: targetVersion };
    } else {
      list.unshift({ ...patient, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: patient.version || 1 });
    }
    await this.saveCollection('patients', list);
  }

  // --- Encounters ---
  public getEncounters(patientId?: string): Encounter[] {
    const all = this.getCollection<Encounter>('encounters');
    return patientId ? all.filter((e) => e.patientId === patientId) : all;
  }

  public async saveEncounter(encounter: Encounter): Promise<void> {
    const list = [...this.getEncounters()];
    const index = list.findIndex((e) => e.id === encounter.id);
    if (index >= 0) list[index] = encounter;
    else list.unshift(encounter);
    await this.saveCollection('encounters', list);
  }

  // --- Clinical Notes ---
  public getClinicalNotes(patientId?: string): ClinicalNote[] {
    const all = this.getCollection<ClinicalNote>('clinicalNotes');
    return patientId ? all.filter((n) => n.patientId === patientId) : all;
  }

  public async saveClinicalNote(note: ClinicalNote): Promise<void> {
    const list = [...this.getClinicalNotes()];
    const index = list.findIndex((n) => n.id === note.id);
    if (index >= 0) list[index] = note;
    else list.unshift(note);
    await this.saveCollection('clinicalNotes', list);
  }

  // --- Vitals ---
  public getVitals(patientId?: string): VitalSign[] {
    const all = this.getCollection<VitalSign>('vitals');
    return patientId ? all.filter((v) => v.patientId === patientId) : all;
  }

  public async saveVital(vital: VitalSign): Promise<void> {
    const list = [...this.getVitals()];
    const index = list.findIndex((v) => v.id === vital.id);
    if (index >= 0) list[index] = vital;
    else list.unshift(vital);
    await this.saveCollection('vitals', list);
  }

  // --- Allergies ---
  public getAllergies(patientId?: string): Allergy[] {
    const all = this.getCollection<Allergy>('allergies');
    return patientId ? all.filter((a) => a.patientId === patientId) : all;
  }

  public async saveAllergy(allergy: Allergy): Promise<void> {
    const list = [...this.getAllergies()];
    list.unshift(allergy);
    await this.saveCollection('allergies', list);
  }

  // --- Medications ---
  public getMedications(patientId?: string): Medication[] {
    const all = this.getCollection<Medication>('medications');
    return patientId ? all.filter((m) => m.patientId === patientId) : all;
  }

  public async saveMedication(med: Medication): Promise<void> {
    const list = [...this.getMedications()];
    const index = list.findIndex((m) => m.id === med.id);
    if (index >= 0) list[index] = med;
    else list.unshift(med);
    await this.saveCollection('medications', list);
  }

  // --- Medication Definitions (Clinical Core V6) ---
  public getMedicationDefinitions(): MedicationDefinition[] {
    return this.getCollection<MedicationDefinition>('medicationDefinitions');
  }

  public async saveMedicationDefinition(def: MedicationDefinition): Promise<void> {
    const list = [...this.getMedicationDefinitions()];
    const index = list.findIndex((d) => d.id === def.id || d.code === def.code);
    if (index >= 0) list[index] = def;
    else list.unshift(def);
    await this.saveCollection('medicationDefinitions', list);
  }

  // --- Medication Orders (Clinical Core V6) ---
  public getMedicationOrders(patientId?: string, facilityId?: string): MedicationOrder[] {
    let all = this.getCollection<MedicationOrder>('medicationOrders');
    if (patientId) all = all.filter((o) => o.patientId === patientId);
    if (facilityId) all = all.filter((o) => o.facilityId === facilityId);
    return all.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
  }

  public getMedicationOrder(id: string): MedicationOrder | undefined {
    return this.getMedicationOrders().find((o) => o.id === id || o.orderNumber === id);
  }

  public async saveMedicationOrder(order: MedicationOrder): Promise<void> {
    const list = [...this.getMedicationOrders()];
    const index = list.findIndex((o) => o.id === order.id);
    if (index >= 0) list[index] = order;
    else list.unshift(order);
    await this.saveCollection('medicationOrders', list);
  }

  // --- Prescriptions (Clinical Core V6) ---
  public getPrescriptions(patientId?: string, facilityId?: string): Prescription[] {
    let all = this.getCollection<Prescription>('prescriptions');
    if (patientId) all = all.filter((p) => p.patientId === patientId);
    if (facilityId) all = all.filter((p) => p.facilityId === facilityId);
    return all.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  public getPrescription(id: string): Prescription | undefined {
    return this.getPrescriptions().find(
      (p) => p.id === id || p.prescriptionNumber === id || p.medicationOrderId === id
    );
  }

  public async savePrescription(prescription: Prescription): Promise<void> {
    const list = [...this.getPrescriptions()];
    const index = list.findIndex((p) => p.id === prescription.id);
    if (index >= 0) list[index] = prescription;
    else list.unshift(prescription);
    await this.saveCollection('prescriptions', list);
  }

  // --- Problems ---
  public getProblems(patientId?: string): Problem[] {
    const all = this.getCollection<Problem>('problems');
    return patientId ? all.filter((p) => p.patientId === patientId) : all;
  }

  public async saveProblem(problem: Problem): Promise<void> {
    const list = [...this.getProblems()];
    const index = list.findIndex((p) => p.id === problem.id);
    if (index >= 0) list[index] = problem;
    else list.unshift(problem);
    await this.saveCollection('problems', list);
  }

  // --- Diagnoses ---
  public getDiagnoses(patientId?: string, encounterId?: string): Diagnosis[] {
    let all = this.getCollection<Diagnosis>('diagnoses');
    if (patientId) all = all.filter((d) => d.patientId === patientId);
    if (encounterId) all = all.filter((d) => d.encounterId === encounterId);
    return all;
  }

  public async saveDiagnosis(dx: Diagnosis): Promise<void> {
    const list = [...this.getDiagnoses()];
    const index = list.findIndex((d) => d.id === dx.id);
    if (index >= 0) list[index] = dx;
    else list.unshift(dx);
    await this.saveCollection('diagnoses', list);
  }

  // --- Differentials ---
  public getDifferentials(encounterId?: string, patientId?: string): DifferentialConsideration[] {
    let all = this.getCollection<DifferentialConsideration>('differentials');
    if (encounterId) all = all.filter((d) => d.encounterId === encounterId);
    if (patientId) all = all.filter((d) => d.patientId === patientId);
    return all;
  }

  public async saveDifferential(diff: DifferentialConsideration): Promise<void> {
    const list = [...this.getDifferentials()];
    const index = list.findIndex((d) => d.id === diff.id);
    if (index >= 0) list[index] = diff;
    else list.unshift(diff);
    await this.saveCollection('differentials', list);
  }

  // --- Clinical Assessments ---
  public getClinicalAssessments(encounterId?: string, patientId?: string): ClinicalAssessment[] {
    let all = this.getCollection<ClinicalAssessment>('clinicalAssessments');
    if (encounterId) all = all.filter((a) => a.encounterId === encounterId);
    if (patientId) all = all.filter((a) => a.patientId === patientId);
    return all;
  }

  public async saveClinicalAssessment(assessment: ClinicalAssessment): Promise<void> {
    const list = [...this.getClinicalAssessments()];
    const index = list.findIndex((a) => a.id === assessment.id);
    if (index >= 0) list[index] = assessment;
    else list.unshift(assessment);
    await this.saveCollection('clinicalAssessments', list);
  }

  // --- Lab Orders, Specimens & Results ---
  public getLabOrders(patientId?: string, facilityId?: string): LaboratoryOrder[] {
    let all = this.getCollection<LaboratoryOrder>('labOrders');
    if (patientId) all = all.filter((o) => o.patientId === patientId);
    if (facilityId) all = all.filter((o) => !o.facilityId || o.facilityId === facilityId);
    return all;
  }

  public async saveLabOrder(order: LaboratoryOrder): Promise<void> {
    const list = [...this.getLabOrders()];
    const index = list.findIndex((o) => o.id === order.id);
    if (index >= 0) list[index] = order;
    else list.unshift(order);
    await this.saveCollection('labOrders', list);
  }

  public getLabSpecimens(orderId?: string, patientId?: string): LaboratorySpecimen[] {
    let all = this.getCollection<LaboratorySpecimen>('labSpecimens');
    if (orderId) all = all.filter((s) => s.orderId === orderId);
    if (patientId) all = all.filter((s) => s.patientId === patientId);
    return all;
  }

  public getLabSpecimen(id: string): LaboratorySpecimen | undefined {
    return this.getCollection<LaboratorySpecimen>('labSpecimens').find((s) => s.id === id || s.accessionNumber === id);
  }

  public async saveLabSpecimen(specimen: LaboratorySpecimen): Promise<void> {
    const list = [...this.getCollection<LaboratorySpecimen>('labSpecimens')];
    const index = list.findIndex((s) => s.id === specimen.id);
    if (index >= 0) list[index] = specimen;
    else list.unshift(specimen);
    await this.saveCollection('labSpecimens', list);
  }

  public getLabResults(patientId?: string, orderId?: string): LaboratoryResult[] {
    let all = this.getCollection<LaboratoryResult>('labResults');
    if (patientId) all = all.filter((r) => r.patientId === patientId);
    if (orderId) all = all.filter((r) => r.orderId === orderId);
    return all;
  }

  public async saveLabResult(result: LaboratoryResult): Promise<void> {
    const list = [...this.getLabResults()];
    const index = list.findIndex((r) => r.id === result.id);
    if (index >= 0) list[index] = result;
    else list.unshift(result);
    await this.saveCollection('labResults', list);
  }

  // --- Radiology Orders & Results ---
  public getRadiologyOrders(patientId?: string): RadiologyOrder[] {
    const all = this.getCollection<RadiologyOrder>('radiologyOrders');
    return patientId ? all.filter((o) => o.patientId === patientId) : all;
  }

  public async saveRadiologyOrder(order: RadiologyOrder): Promise<void> {
    const list = [...this.getRadiologyOrders()];
    const index = list.findIndex((o) => o.id === order.id);
    if (index >= 0) list[index] = order;
    else list.unshift(order);
    await this.saveCollection('radiologyOrders', list);
  }

  public getRadiologyResults(patientId?: string): RadiologyResult[] {
    const all = this.getCollection<RadiologyResult>('radiologyResults');
    return patientId ? all.filter((r) => r.patientId === patientId) : all;
  }

  public async saveRadiologyResult(result: RadiologyResult): Promise<void> {
    const list = [...this.getRadiologyResults()];
    list.unshift(result);
    await this.saveCollection('radiologyResults', list);
  }

  // --- Appointments ---
  public getAppointments(): Appointment[] {
    return this.getCollection<Appointment>('appointments');
  }

  public async saveAppointment(appointment: Appointment): Promise<void> {
    const list = [...this.getAppointments()];
    const index = list.findIndex((a) => a.id === appointment.id);
    if (index >= 0) list[index] = appointment;
    else list.unshift(appointment);
    await this.saveCollection('appointments', list);
  }

  // --- Referrals ---
  public getReferrals(): Referral[] {
    return this.getCollection<Referral>('referrals');
  }

  public getReferral(id: string): Referral | undefined {
    return this.getReferrals().find((r) => r.id === id || r.referralNumber === id);
  }

  public async saveReferral(referral: Referral): Promise<void> {
    const list = [...this.getReferrals()];
    const index = list.findIndex((r) => r.id === referral.id);
    if (index >= 0) list[index] = referral;
    else list.unshift(referral);
    await this.saveCollection('referrals', list);
  }

  // --- Referral Outcomes ---
  public getReferralOutcomes(referralId?: string, patientId?: string): ReferralOutcome[] {
    let list = this.getCollection<ReferralOutcome>('referralOutcomes');
    if (referralId) list = list.filter((o) => o.referralId === referralId);
    if (patientId) list = list.filter((o) => o.patientId === patientId);
    return list;
  }

  public getReferralOutcome(id: string): ReferralOutcome | undefined {
    return this.getReferralOutcomes().find((o) => o.id === id);
  }

  public async saveReferralOutcome(outcome: ReferralOutcome): Promise<void> {
    const list = [...this.getReferralOutcomes()];
    const index = list.findIndex((o) => o.id === outcome.id);
    if (index >= 0) list[index] = outcome;
    else list.unshift(outcome);
    await this.saveCollection('referralOutcomes', list);
  }

  // --- Referral Communications ---
  public getReferralCommunications(referralId?: string): ReferralCommunication[] {
    let list = this.getCollection<ReferralCommunication>('referralCommunications');
    if (referralId) list = list.filter((c) => c.referralId === referralId);
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async saveReferralCommunication(communication: ReferralCommunication): Promise<void> {
    const list = [...this.getReferralCommunications()];
    const index = list.findIndex((c) => c.id === communication.id);
    if (index >= 0) list[index] = communication;
    else list.push(communication);
    await this.saveCollection('referralCommunications', list);
  }

  // --- Emergency Cases ---
  public getEmergencyCases(): EmergencyCase[] {
    return this.getCollection<EmergencyCase>('emergencyCases');
  }

  public async saveEmergencyCase(emergencyCase: EmergencyCase): Promise<void> {
    const list = [...this.getEmergencyCases()];
    const index = list.findIndex((e) => e.id === emergencyCase.id);
    if (index >= 0) list[index] = emergencyCase;
    else list.unshift(emergencyCase);
    await this.saveCollection('emergencyCases', list);
  }

  // --- Emergency Triages ---
  public getEmergencyTriages(): EmergencyTriage[] {
    return this.getCollection<EmergencyTriage>('emergencyTriages');
  }

  public async saveEmergencyTriage(triage: EmergencyTriage): Promise<void> {
    const list = [...this.getEmergencyTriages()];
    const index = list.findIndex((t) => t.id === triage.id);
    if (index >= 0) list[index] = triage;
    else list.unshift(triage);
    await this.saveCollection('emergencyTriages', list);
  }

  // --- Emergency Reassessments ---
  public getEmergencyReassessments(): EmergencyReassessment[] {
    return this.getCollection<EmergencyReassessment>('emergencyReassessments');
  }

  public async saveEmergencyReassessment(reassessment: EmergencyReassessment): Promise<void> {
    const list = [...this.getEmergencyReassessments()];
    const index = list.findIndex((r) => r.id === reassessment.id);
    if (index >= 0) list[index] = reassessment;
    else list.unshift(reassessment);
    await this.saveCollection('emergencyReassessments', list);
  }

  // --- Emergency Alerts ---
  public getEmergencyAlerts(): EmergencyAlert[] {
    return this.getCollection<EmergencyAlert>('emergencyAlerts');
  }

  public async saveEmergencyAlert(alert: EmergencyAlert): Promise<void> {
    const list = [...this.getEmergencyAlerts()];
    const index = list.findIndex((a) => a.id === alert.id);
    if (index >= 0) list[index] = alert;
    else list.unshift(alert);
    await this.saveCollection('emergencyAlerts', list);
  }

  // --- Transport Requests ---
  public getTransportRequests(): TransportRequest[] {
    return this.getCollection<TransportRequest>('transportRequests');
  }

  public async saveTransportRequest(req: TransportRequest): Promise<void> {
    const list = [...this.getTransportRequests()];
    const index = list.findIndex((t) => t.id === req.id);
    if (index >= 0) list[index] = req;
    else list.unshift(req);
    await this.saveCollection('transportRequests', list);
  }

  // --- Sync Queue ---
  public getSyncQueue(): SyncEvent[] {
    return this.getCollection<SyncEvent>('syncQueue');
  }

  public async enqueueSyncEvent(event: SyncEvent): Promise<void> {
    // 1. Authoritative durable commit to IndexedDB
    await idbEngine.put('syncQueue', event);

    // 2. Commit to in-memory queue mirror after durable commit
    const queue = [...this.getSyncQueue()];
    const existingIndex = queue.findIndex((e) => e.id === event.id);
    if (existingIndex >= 0) {
      queue[existingIndex] = event;
    } else {
      queue.push(event);
    }
    this.publishCommittedCollection('syncQueue', queue);
  }

  public async updateSyncEvent(updated: SyncEvent): Promise<void> {
    // 1. Authoritative durable commit to IndexedDB
    await idbEngine.put('syncQueue', updated);

    // 2. Commit to in-memory queue mirror after durable commit
    const queue = [...this.getSyncQueue()];
    const index = queue.findIndex((e) => e.id === updated.id);
    if (index >= 0) {
      queue[index] = updated;
      this.publishCommittedCollection('syncQueue', queue);
    }
  }

  public async removeSyncEvent(id: string): Promise<void> {
    // 1. Authoritative durable deletion from IndexedDB
    await idbEngine.delete('syncQueue', id);

    // 2. Commit to in-memory queue mirror after durable commit
    const queue = this.getSyncQueue().filter((e) => e.id !== id);
    this.publishCommittedCollection('syncQueue', queue);
  }

  public async clearSyncedEvents(): Promise<void> {
    // 1. Execute single atomic native IndexedDB readwrite transaction covering syncQueue
    const pruneResult = await idbEngine.pruneSyncQueue((e) => e.status === 'synced');

    // 2. Reconcile in-memory queue view with committed authoritative state:
    // Filter out only the durably deleted IDs from the current memory snapshot,
    // preserving any concurrent enqueues that occurred while the transaction was executing.
    const currentQueue = this.getSyncQueue();
    const prunedSet = new Set(pruneResult.prunedIds);
    const reconciled = currentQueue.filter((e) => !prunedSet.has(e.id));
    this.publishCommittedCollection('syncQueue', reconciled);
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditEvent[] {
    return this.getCollection<AuditEvent>('auditLog');
  }

  public async recordAuditLog(event: AuditEvent): Promise<void> {
    const logs = [...this.getAuditLogs()];
    logs.unshift(event);
    // Keep last 500 logs locally
    if (logs.length > 500) logs.length = 500;
    await this.saveCollection('auditLog', logs);
  }

  // --- AI Persistence Stores ---
  public getAIRequests(): AIRequest[] {
    return this.getCollection<AIRequest>('aiRequests');
  }

  public async saveAIRequest(req: AIRequest): Promise<void> {
    const list = [...this.getAIRequests()];
    const idx = list.findIndex((r) => r.id === req.id);
    if (idx >= 0) list[idx] = req;
    else list.unshift(req);
    await this.saveCollection('aiRequests', list);
  }

  public getAIResponses(): AIResponse[] {
    return this.getCollection<AIResponse>('aiResponses');
  }

  public async saveAIResponse(res: AIResponse): Promise<void> {
    const list = [...this.getAIResponses()];
    const idx = list.findIndex((r) => r.id === res.id);
    if (idx >= 0) list[idx] = res;
    else list.unshift(res);
    await this.saveCollection('aiResponses', list);
  }

  public getAIReviews(): AIReview[] {
    return this.getCollection<AIReview>('aiReviews');
  }

  public async saveAIReview(rev: AIReview): Promise<void> {
    const list = [...this.getAIReviews()];
    const idx = list.findIndex((r) => r.id === rev.id);
    if (idx >= 0) list[idx] = rev;
    else list.unshift(rev);
    await this.saveCollection('aiReviews', list);
  }

  public clearAll(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keys = Object.keys(window.localStorage);
        for (const k of keys) {
          if (k.startsWith(STORAGE_KEY_PREFIX)) {
            window.localStorage.removeItem(k);
          }
        }
      } else if (typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage);
        for (const k of keys) {
          if (k.startsWith(STORAGE_KEY_PREFIX)) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {}
    inMemoryFallbackStore.clear();
  }
}

export const localDb = LocalClinicalDatabase.getInstance();
