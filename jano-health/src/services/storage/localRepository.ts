/**
 * Jano Health - Local Clinical Repository
 * 
 * Implements the ILocalRepository persistence interface backed by IndexedDB.
 * Independent of React components, providing offline-first guarantees, indexing,
 * and facility-scoped queries for clinical teams in rural/low-resource settings.
 */

import {
  Allergy,
  Appointment,
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
  RadiologyStudy,
  RadiologyReport,
  CriticalRadiologyFinding,
  RadiologyResult,
  Referral,
  ReferralOutcome,
  ReferralCommunication,
  AIRequest,
  AIResponse,
  AIReview,
  AIReviewStatus,
} from '../../domain/types';
import {
  DispenseRecord,
  InventoryItem,
  InventoryBatch,
  InventoryTransaction,
  InventoryReceipt,
  InventoryTransfer,
  InventoryWastage,
  PharmacyReview,
} from '../../domain/pharmacyTypes';
import { ILocalRepository } from '../../domain/persistence';
import { idbEngine } from './indexedDbEngine';
import { localDb } from './localDatabase';
import {
  DEMO_ALLERGIES,
  DEMO_APPOINTMENTS,
  DEMO_CLINICAL_NOTES,
  DEMO_DIAGNOSES,
  DEMO_EMERGENCY_CASES,
  DEMO_ENCOUNTERS,
  DEMO_LAB_ORDERS,
  DEMO_LAB_RESULTS,
  DEMO_LAB_SPECIMENS,
  DEMO_MEDICATIONS,
  DEMO_PATIENTS,
  DEMO_RADIOLOGY_ORDERS,
  DEMO_RADIOLOGY_RESULTS,
  DEMO_REFERRALS,
  DEMO_VITALS,
} from '../../data/syntheticDemoData';
import { SYNTHETIC_MEDICATION_DEFINITIONS } from '../clinical/medicationTerminologyService';

export class LocalRepository implements ILocalRepository {
  private static instance: LocalRepository;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // In-memory read cache for instantaneous UI synchronization
  private cache: {
    patients: Map<string, Patient>;
    encounters: Map<string, Encounter>;
    clinicalNotes: Map<string, ClinicalNote>;
    vitals: Map<string, any>;
    allergies: Map<string, Allergy>;
    medications: Map<string, Medication>;
    medicationDefinitions: Map<string, MedicationDefinition>;
    medicationOrders: Map<string, MedicationOrder>;
    prescriptions: Map<string, Prescription>;
    dispenseRecords: Map<string, DispenseRecord>;
    inventoryItems: Map<string, InventoryItem>;
    inventoryBatches: Map<string, InventoryBatch>;
    inventoryTransactions: Map<string, InventoryTransaction>;
    inventoryReceipts: Map<string, InventoryReceipt>;
    inventoryTransfers: Map<string, InventoryTransfer>;
    inventoryWastage: Map<string, InventoryWastage>;
    pharmacyReviews: Map<string, PharmacyReview>;
    problems: Map<string, Problem>;
    diagnoses: Map<string, Diagnosis>;
    differentials: Map<string, DifferentialConsideration>;
    clinicalAssessments: Map<string, ClinicalAssessment>;
    labOrders: Map<string, LaboratoryOrder>;
    labSpecimens: Map<string, LaboratorySpecimen>;
    labResults: Map<string, LaboratoryResult>;
    radiologyOrders: Map<string, RadiologyOrder>;
    radiologyStudies: Map<string, RadiologyStudy>;
    radiologyReports: Map<string, RadiologyReport>;
    criticalRadiologyFindings: Map<string, CriticalRadiologyFinding>;
    radiologyResults: Map<string, RadiologyResult>;
    appointments: Map<string, Appointment>;
    referrals: Map<string, Referral>;
    referralOutcomes: Map<string, ReferralOutcome>;
    referralCommunications: Map<string, ReferralCommunication>;
    emergencyCases: Map<string, EmergencyCase>;
    emergencyTriages: Map<string, EmergencyTriage>;
    emergencyReassessments: Map<string, EmergencyReassessment>;
    emergencyAlerts: Map<string, EmergencyAlert>;
    transportRequests: Map<string, TransportRequest>;
    aiRequests: Map<string, AIRequest>;
    aiResponses: Map<string, AIResponse>;
    aiReviews: Map<string, AIReview>;
  } = {
    patients: new Map(),
    encounters: new Map(),
    clinicalNotes: new Map(),
    vitals: new Map(),
    allergies: new Map(),
    medications: new Map(),
    medicationDefinitions: new Map(),
    medicationOrders: new Map(),
    prescriptions: new Map(),
    dispenseRecords: new Map(),
    inventoryItems: new Map(),
    inventoryBatches: new Map(),
    inventoryTransactions: new Map(),
    inventoryReceipts: new Map(),
    inventoryTransfers: new Map(),
    inventoryWastage: new Map(),
    pharmacyReviews: new Map(),
    problems: new Map(),
    diagnoses: new Map(),
    differentials: new Map(),
    clinicalAssessments: new Map(),
    labOrders: new Map(),
    labSpecimens: new Map(),
    labResults: new Map(),
    radiologyOrders: new Map(),
    radiologyStudies: new Map(),
    radiologyReports: new Map(),
    criticalRadiologyFindings: new Map(),
    radiologyResults: new Map(),
    appointments: new Map(),
    referrals: new Map(),
    referralOutcomes: new Map(),
    referralCommunications: new Map(),
    emergencyCases: new Map(),
    emergencyTriages: new Map(),
    emergencyReassessments: new Map(),
    emergencyAlerts: new Map(),
    transportRequests: new Map(),
    aiRequests: new Map(),
    aiResponses: new Map(),
    aiReviews: new Map(),
  };

  private constructor() {
    this.ensureInitialized();
  }

  public static getInstance(): LocalRepository {
    if (!LocalRepository.instance) {
      LocalRepository.instance = new LocalRepository();
    }
    return LocalRepository.instance;
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initInternal();
    }
    return this.initPromise;
  }

  private async initInternal(): Promise<void> {
    try {
      // 1. Load existing records from IndexedDB into memory cache
      const patients = await idbEngine.getAll<Patient>('patients');
      if (patients.length === 0) {
        // Seed default demo data if clean slate
        await this.seedSyntheticDemoData();
      } else {
        patients.forEach((p) => this.cache.patients.set(p.id, p));

        const [
          encounters,
          vitals,
          notes,
          allergies,
          meds,
          probs,
          dxs,
          diffs,
          assessments,
          labOrders,
          labSpecimens,
          labResults,
          radOrders,
          radStudies,
          radReports,
          critRadFindings,
          radResults,
          appts,
          refs,
          refOutcomes,
          refComms,
          emergencies,
          emergencyTriages,
          emergencyReassessments,
          emergencyAlerts,
          transportRequests,
          aiReqs,
          aiResps,
          aiRevs,
        ] = await Promise.all([
          idbEngine.getAll<Encounter>('encounters'),
          idbEngine.getAll<any>('vitals'),
          idbEngine.getAll<ClinicalNote>('clinicalNotes'),
          idbEngine.getAll<Allergy>('allergies'),
          idbEngine.getAll<Medication>('medications'),
          idbEngine.getAll<Problem>('problems'),
          idbEngine.getAll<Diagnosis>('diagnoses'),
          idbEngine.getAll<DifferentialConsideration>('differentials'),
          idbEngine.getAll<ClinicalAssessment>('clinicalAssessments'),
          idbEngine.getAll<LaboratoryOrder>('labOrders'),
          idbEngine.getAll<LaboratorySpecimen>('labSpecimens'),
          idbEngine.getAll<LaboratoryResult>('labResults'),
          idbEngine.getAll<RadiologyOrder>('radiologyOrders'),
          idbEngine.getAll<RadiologyStudy>('radiologyStudies'),
          idbEngine.getAll<RadiologyReport>('radiologyReports'),
          idbEngine.getAll<CriticalRadiologyFinding>('criticalRadiologyFindings'),
          idbEngine.getAll<RadiologyResult>('radiologyResults'),
          idbEngine.getAll<Appointment>('appointments'),
          idbEngine.getAll<Referral>('referrals'),
          idbEngine.getAll<ReferralOutcome>('referralOutcomes'),
          idbEngine.getAll<ReferralCommunication>('referralCommunications'),
          idbEngine.getAll<EmergencyCase>('emergencyCases'),
          idbEngine.getAll<EmergencyTriage>('emergencyTriages'),
          idbEngine.getAll<EmergencyReassessment>('emergencyReassessments'),
          idbEngine.getAll<EmergencyAlert>('emergencyAlerts'),
          idbEngine.getAll<TransportRequest>('transportRequests'),
          idbEngine.getAll<AIRequest>('aiRequests'),
          idbEngine.getAll<AIResponse>('aiResponses'),
          idbEngine.getAll<AIReview>('aiReviews'),
        ]);

        encounters.forEach((e) => this.cache.encounters.set(e.id, e));
        vitals.forEach((v) => this.cache.vitals.set(v.id, v));
        notes.forEach((n) => this.cache.clinicalNotes.set(n.id, n));
        allergies.forEach((a) => this.cache.allergies.set(a.id, a));
        meds.forEach((m) => this.cache.medications.set(m.id, m));
        
        // Seed medication definitions if empty in store
        const currentDefs = (await idbEngine.getAll<MedicationDefinition>('medicationDefinitions')) || [];
        if (currentDefs.length === 0) {
          SYNTHETIC_MEDICATION_DEFINITIONS.forEach((d) => this.cache.medicationDefinitions.set(d.id, d));
          await idbEngine.putBatch('medicationDefinitions', SYNTHETIC_MEDICATION_DEFINITIONS);
        } else {
          currentDefs.forEach((d) => this.cache.medicationDefinitions.set(d.id, d));
        }

        const currentOrders = (await idbEngine.getAll<MedicationOrder>('medicationOrders')) || [];
        currentOrders.forEach((o) => this.cache.medicationOrders.set(o.id, o));

        const currentPrescriptions = (await idbEngine.getAll<Prescription>('prescriptions')) || [];
        currentPrescriptions.forEach((p) => this.cache.prescriptions.set(p.id, p));

        const currentDispenses = (await idbEngine.getAll<DispenseRecord>('dispenseRecords')) || [];
        currentDispenses.forEach((d) => this.cache.dispenseRecords.set(d.id, d));

        const currentInvItems = (await idbEngine.getAll<InventoryItem>('inventoryItems')) || [];
        currentInvItems.forEach((item) => this.cache.inventoryItems.set(item.id, item));

        const currentInvBatches = (await idbEngine.getAll<InventoryBatch>('inventoryBatches')) || [];
        currentInvBatches.forEach((batch) => this.cache.inventoryBatches.set(batch.id, batch));

        const currentInvTxns = (await idbEngine.getAll<InventoryTransaction>('inventoryTransactions')) || [];
        currentInvTxns.forEach((txn) => this.cache.inventoryTransactions.set(txn.id, txn));

        const currentInvReceipts = (await idbEngine.getAll<InventoryReceipt>('inventoryReceipts')) || [];
        currentInvReceipts.forEach((r) => this.cache.inventoryReceipts.set(r.id, r));

        const currentInvTransfers = (await idbEngine.getAll<InventoryTransfer>('inventoryTransfers')) || [];
        currentInvTransfers.forEach((t) => this.cache.inventoryTransfers.set(t.id, t));

        const currentInvWastages = (await idbEngine.getAll<InventoryWastage>('inventoryWastage')) || [];
        currentInvWastages.forEach((w) => this.cache.inventoryWastage.set(w.id, w));

        const currentPharmReviews = (await idbEngine.getAll<PharmacyReview>('pharmacyReviews')) || [];
        currentPharmReviews.forEach((pr) => this.cache.pharmacyReviews.set(pr.id, pr));

        probs.forEach((pr) => this.cache.problems.set(pr.id, pr));
        dxs.forEach((d) => this.cache.diagnoses.set(d.id, d));
        diffs.forEach((df) => this.cache.differentials.set(df.id, df));
        assessments.forEach((as) => this.cache.clinicalAssessments.set(as.id, as));
        labOrders.forEach((lo) => this.cache.labOrders.set(lo.id, lo));
        labSpecimens.forEach((ls) => this.cache.labSpecimens.set(ls.id, ls));
        labResults.forEach((lr) => this.cache.labResults.set(lr.id, lr));
        radOrders.forEach((ro) => this.cache.radiologyOrders.set(ro.id, ro));
        radStudies.forEach((rs) => this.cache.radiologyStudies.set(rs.id, rs));
        radReports.forEach((rr) => this.cache.radiologyReports.set(rr.id, rr));
        critRadFindings.forEach((crf) => this.cache.criticalRadiologyFindings.set(crf.id, crf));
        radResults.forEach((rr) => this.cache.radiologyResults.set(rr.id, rr));
        appts.forEach((ap) => this.cache.appointments.set(ap.id, ap));
        refs.forEach((r) => this.cache.referrals.set(r.id, r));
        refOutcomes.forEach((ro) => this.cache.referralOutcomes.set(ro.id, ro));
        refComms.forEach((rc) => this.cache.referralCommunications.set(rc.id, rc));
        emergencies.forEach((ec) => this.cache.emergencyCases.set(ec.id, ec));
        emergencyTriages.forEach((et) => this.cache.emergencyTriages.set(et.id, et));
        emergencyReassessments.forEach((er) => this.cache.emergencyReassessments.set(er.id, er));
        emergencyAlerts.forEach((ea) => this.cache.emergencyAlerts.set(ea.id, ea));
        transportRequests.forEach((tr) => this.cache.transportRequests.set(tr.id, tr));
        aiReqs.forEach((ai) => this.cache.aiRequests.set(ai.id, ai));
        aiResps.forEach((r) => this.cache.aiResponses.set(r.id, r));
        aiRevs.forEach((rv) => this.cache.aiReviews.set(rv.id, rv));
      }
      await localDb.hydrateFromIndexedDb();
      this.initialized = true;
    } catch (err: any) {
      this.initialized = false;
      this.initPromise = null;
      console.error('[LocalRepository] Storage initialization failed; cannot access authoritative IndexedDB:', err?.message || String(err));
      throw new Error(`[LocalRepository] Storage initialization failed: ${err?.message || String(err)}`);
    }
  }

  public async seedSyntheticDemoData(): Promise<void> {
    DEMO_PATIENTS.forEach((p) => this.cache.patients.set(p.id, p));
    DEMO_ENCOUNTERS.forEach((e) => this.cache.encounters.set(e.id, e));
    DEMO_VITALS.forEach((v) => this.cache.vitals.set(v.id, v));
    DEMO_CLINICAL_NOTES.forEach((n) => this.cache.clinicalNotes.set(n.id, n));
    DEMO_ALLERGIES.forEach((a) => this.cache.allergies.set(a.id, a));
    DEMO_MEDICATIONS.forEach((m) => this.cache.medications.set(m.id, m));
    SYNTHETIC_MEDICATION_DEFINITIONS.forEach((d) => this.cache.medicationDefinitions.set(d.id, d));
    DEMO_DIAGNOSES.forEach((d) => this.cache.diagnoses.set(d.id, d));
    DEMO_LAB_ORDERS.forEach((lo) => this.cache.labOrders.set(lo.id, lo));
    DEMO_LAB_SPECIMENS.forEach((ls) => this.cache.labSpecimens.set(ls.id, ls));
    DEMO_LAB_RESULTS.forEach((lr) => this.cache.labResults.set(lr.id, lr));
    DEMO_RADIOLOGY_ORDERS.forEach((ro) => this.cache.radiologyOrders.set(ro.id, ro));
    DEMO_RADIOLOGY_RESULTS.forEach((rr) => this.cache.radiologyResults.set(rr.id, rr));
    DEMO_APPOINTMENTS.forEach((ap) => this.cache.appointments.set(ap.id, ap));
    DEMO_REFERRALS.forEach((r) => this.cache.referrals.set(r.id, r));
    DEMO_EMERGENCY_CASES.forEach((ec) => this.cache.emergencyCases.set(ec.id, ec));

    // Persist batch into IndexedDB
    await Promise.all([
      idbEngine.putBatch('patients', DEMO_PATIENTS),
      idbEngine.putBatch('encounters', DEMO_ENCOUNTERS),
      idbEngine.putBatch('vitals', DEMO_VITALS),
      idbEngine.putBatch('clinicalNotes', DEMO_CLINICAL_NOTES),
      idbEngine.putBatch('allergies', DEMO_ALLERGIES),
      idbEngine.putBatch('medications', DEMO_MEDICATIONS),
      idbEngine.putBatch('medicationDefinitions', SYNTHETIC_MEDICATION_DEFINITIONS),
      idbEngine.putBatch('diagnoses', DEMO_DIAGNOSES),
      idbEngine.putBatch('labOrders', DEMO_LAB_ORDERS),
      idbEngine.putBatch('labSpecimens', DEMO_LAB_SPECIMENS),
      idbEngine.putBatch('labResults', DEMO_LAB_RESULTS),
      idbEngine.putBatch('radiologyOrders', DEMO_RADIOLOGY_ORDERS),
      idbEngine.putBatch('radiologyResults', DEMO_RADIOLOGY_RESULTS),
      idbEngine.putBatch('appointments', DEMO_APPOINTMENTS),
      idbEngine.putBatch('referrals', DEMO_REFERRALS),
      idbEngine.putBatch('emergencyCases', DEMO_EMERGENCY_CASES),
    ]);
    await localDb.hydrateFromIndexedDb();
  }

  public updateCache(store: string, entity: any): void {
    if (!entity || !entity.id) return;
    const cacheMap = (this.cache as any)[store];
    if (cacheMap && typeof cacheMap.set === 'function') {
      cacheMap.set(entity.id, entity);
    }
  }

  // --- Patients ---
  public async getPatient(id: string): Promise<Patient | undefined> {
    await this.ensureInitialized();
    return this.cache.patients.get(id);
  }

  public async getPatientById(id: string): Promise<Patient | undefined> {
    return this.getPatient(id);
  }

  public async getPatientByMrn(mrn: string): Promise<Patient | undefined> {
    await this.ensureInitialized();
    const clean = mrn.trim().toLowerCase();
    for (const p of this.cache.patients.values()) {
      if (p.mrn.toLowerCase() === clean) return p;
    }
    return undefined;
  }

  public async getAllPatients(facilityId?: string): Promise<Patient[]> {
    await this.ensureInitialized();
    const all = Array.from(this.cache.patients.values());
    if (!facilityId) return all;
    return all.filter((p) => p.primaryFacilityId === facilityId);
  }

  public async getPatients(facilityId?: string): Promise<Patient[]> {
    return this.getAllPatients(facilityId);
  }

  public async searchPatients(query: string, facilityId?: string): Promise<Patient[]> {
    await this.ensureInitialized();
    const q = query.trim().toLowerCase();
    let list = Array.from(this.cache.patients.values());
    if (facilityId) {
      list = list.filter((p) => p.primaryFacilityId === facilityId);
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        (p.nationalId && p.nationalId.toLowerCase().includes(q)) ||
        p.villageTown.toLowerCase().includes(q)
    );
  }

  public async savePatient(patient: Patient): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('patients', patient);
    this.cache.patients.set(patient.id, patient);
  }

  // --- Encounters ---
  public async getEncounter(id: string): Promise<Encounter | undefined> {
    await this.ensureInitialized();
    return this.cache.encounters.get(id);
  }

  public async getEncounters(patientId?: string, facilityId?: string): Promise<Encounter[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.encounters.values());
    if (patientId) list = list.filter((e) => e.patientId === patientId);
    if (facilityId) list = list.filter((e) => e.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  public async saveEncounter(encounter: Encounter): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('encounters', encounter);
    this.cache.encounters.set(encounter.id, encounter);
  }

  // --- Clinical Sub-records ---
  public async getClinicalNote(id: string): Promise<ClinicalNote | undefined> {
    await this.ensureInitialized();
    return this.cache.clinicalNotes.get(id);
  }

  public async getClinicalNotes(patientId?: string, encounterId?: string): Promise<ClinicalNote[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.clinicalNotes.values());
    if (patientId) list = list.filter((n) => n.patientId === patientId);
    if (encounterId) list = list.filter((n) => n.encounterId === encounterId);
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public async saveClinicalNote(note: ClinicalNote): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('clinicalNotes', note);
    this.cache.clinicalNotes.set(note.id, note);
  }

  public async getVitals(patientId?: string, encounterId?: string): Promise<any[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.vitals.values());
    if (patientId) list = list.filter((v) => v.patientId === patientId);
    if (encounterId) list = list.filter((v) => v.encounterId === encounterId);
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public async saveVital(vital: any): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('vitals', vital);
    this.cache.vitals.set(vital.id, vital);
  }

  public async saveVitals(vital: any): Promise<void> {
    return this.saveVital(vital);
  }

  public async getAllergies(patientId?: string): Promise<Allergy[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.allergies.values());
    if (patientId) list = list.filter((a) => a.patientId === patientId);
    return list;
  }

  public async saveAllergy(allergy: Allergy): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('allergies', allergy);
    this.cache.allergies.set(allergy.id, allergy);
  }

  public async getMedications(patientId?: string, encounterId?: string): Promise<Medication[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.medications.values());
    if (patientId) list = list.filter((m) => m.patientId === patientId);
    if (encounterId) list = list.filter((m) => m.encounterId === encounterId);
    return list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  public async saveMedication(medication: Medication): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('medications', medication);
    this.cache.medications.set(medication.id, medication);
  }

  // --- Clinical Core V6: Authoritative Medication Definitions, Orders & Prescriptions ---
  public async getMedicationDefinitions(): Promise<MedicationDefinition[]> {
    await this.ensureInitialized();
    return Array.from(this.cache.medicationDefinitions.values());
  }

  public async getMedicationDefinition(idOrCode: string): Promise<MedicationDefinition | undefined> {
    await this.ensureInitialized();
    const direct = this.cache.medicationDefinitions.get(idOrCode);
    if (direct) return direct;
    return Array.from(this.cache.medicationDefinitions.values()).find(
      (d) => d.code.toLowerCase() === idOrCode.toLowerCase() || d.id.toLowerCase() === idOrCode.toLowerCase()
    );
  }

  public async saveMedicationDefinition(definition: MedicationDefinition): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('medicationDefinitions', definition);
    this.cache.medicationDefinitions.set(definition.id, definition);
  }

  public async getMedicationOrders(patientId?: string, facilityId?: string): Promise<MedicationOrder[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.medicationOrders.values());
    if (patientId) list = list.filter((o) => o.patientId === patientId);
    if (facilityId) list = list.filter((o) => o.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
  }

  public async getMedicationOrder(id: string): Promise<MedicationOrder | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.medicationOrders.get(id) ||
      Array.from(this.cache.medicationOrders.values()).find((o) => o.orderNumber === id)
    );
  }

  public async saveMedicationOrder(order: MedicationOrder): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('medicationOrders', order);
    this.cache.medicationOrders.set(order.id, order);
  }

  public async getPrescriptions(patientId?: string, facilityId?: string): Promise<Prescription[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.prescriptions.values());
    if (patientId) list = list.filter((p) => p.patientId === patientId);
    if (facilityId) list = list.filter((p) => p.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }

  public async getPrescription(id: string): Promise<Prescription | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.prescriptions.get(id) ||
      Array.from(this.cache.prescriptions.values()).find(
        (p) => p.prescriptionNumber === id || p.medicationOrderId === id
      )
    );
  }

  public async savePrescription(prescription: Prescription): Promise<void> {
    await this.ensureInitialized();
    this.cache.prescriptions.set(prescription.id, prescription);
    await idbEngine.put('prescriptions', prescription);
  }

  public async getDispenseRecords(patientId?: string, prescriptionId?: string): Promise<DispenseRecord[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.dispenseRecords.values());
    if (patientId) list = list.filter((d) => d.patientId === patientId);
    if (prescriptionId) list = list.filter((d) => d.prescriptionId === prescriptionId);
    return list.sort((a, b) => new Date(b.dispensedAt).getTime() - new Date(a.dispensedAt).getTime());
  }

  public async getDispenseRecordsByPatient(patientId: string): Promise<DispenseRecord[]> {
    return this.getDispenseRecords(patientId);
  }

  public async getDispenseRecord(id: string): Promise<DispenseRecord | undefined> {
    await this.ensureInitialized();
    return this.cache.dispenseRecords.get(id);
  }

  public async saveDispenseRecord(record: DispenseRecord): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('dispenseRecords', record);
    this.cache.dispenseRecords.set(record.id, record);
  }

  // --- Pharmacy V7: Inventory Items, Batches, Ledger Transactions, Receipts, Transfers, Wastage & Reviews ---
  public async getInventoryItems(facilityId?: string): Promise<InventoryItem[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryItems.values());
    if (facilityId) list = list.filter((i) => i.facilityId === facilityId);
    return list.sort((a, b) => a.genericName.localeCompare(b.genericName));
  }

  public async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    await this.ensureInitialized();
    return this.cache.inventoryItems.get(id);
  }

  public async saveInventoryItem(item: InventoryItem): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryItems', item);
    this.cache.inventoryItems.set(item.id, item);
  }

  public async getInventoryBatches(inventoryItemId?: string, facilityId?: string): Promise<InventoryBatch[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryBatches.values());
    if (inventoryItemId) list = list.filter((b) => b.inventoryItemId === inventoryItemId);
    if (facilityId) list = list.filter((b) => b.facilityId === facilityId);
    // Sort by expiry date ascending (FEFO)
    return list.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }

  public async getInventoryBatch(id: string): Promise<InventoryBatch | undefined> {
    await this.ensureInitialized();
    return this.cache.inventoryBatches.get(id);
  }

  public async saveInventoryBatch(batch: InventoryBatch): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryBatches', batch);
    this.cache.inventoryBatches.set(batch.id, batch);
  }

  public async getInventoryTransactions(
    facilityId?: string,
    inventoryItemId?: string,
    batchId?: string
  ): Promise<InventoryTransaction[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryTransactions.values());
    if (facilityId) list = list.filter((t) => t.facilityId === facilityId);
    if (inventoryItemId) list = list.filter((t) => t.inventoryItemId === inventoryItemId);
    if (batchId) list = list.filter((t) => t.batchId === batchId);
    return list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  public async saveInventoryTransaction(txn: InventoryTransaction): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryTransactions', txn);
    this.cache.inventoryTransactions.set(txn.id, txn);
  }

  public async getInventoryReceipts(facilityId?: string): Promise<InventoryReceipt[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryReceipts.values());
    if (facilityId) list = list.filter((r) => r.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  public async getInventoryReceipt(id: string): Promise<InventoryReceipt | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.inventoryReceipts.get(id) ||
      Array.from(this.cache.inventoryReceipts.values()).find((r) => r.receiptNumber === id)
    );
  }

  public async saveInventoryReceipt(receipt: InventoryReceipt): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryReceipts', receipt);
    this.cache.inventoryReceipts.set(receipt.id, receipt);
  }

  public async getInventoryTransfers(facilityId?: string): Promise<InventoryTransfer[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryTransfers.values());
    if (facilityId) {
      list = list.filter((t) => t.sourceFacilityId === facilityId || t.destinationFacilityId === facilityId);
    }
    return list.sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime());
  }

  public async getInventoryTransfer(id: string): Promise<InventoryTransfer | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.inventoryTransfers.get(id) ||
      Array.from(this.cache.inventoryTransfers.values()).find((t) => t.transferNumber === id)
    );
  }

  public async saveInventoryTransfer(transfer: InventoryTransfer): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryTransfers', transfer);
    this.cache.inventoryTransfers.set(transfer.id, transfer);
  }

  public async getInventoryWastages(facilityId?: string): Promise<InventoryWastage[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.inventoryWastage.values());
    if (facilityId) list = list.filter((w) => w.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }

  public async getInventoryWastage(id: string): Promise<InventoryWastage | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.inventoryWastage.get(id) ||
      Array.from(this.cache.inventoryWastage.values()).find((w) => w.wastageNumber === id)
    );
  }

  public async saveInventoryWastage(wastage: InventoryWastage): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('inventoryWastage', wastage);
    this.cache.inventoryWastage.set(wastage.id, wastage);
  }

  public async getPharmacyReviews(prescriptionId?: string, patientId?: string): Promise<PharmacyReview[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.pharmacyReviews.values());
    if (prescriptionId) list = list.filter((r) => r.prescriptionId === prescriptionId);
    if (patientId) list = list.filter((r) => r.patientId === patientId);
    return list.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
  }

  public async getPharmacyReview(id: string): Promise<PharmacyReview | undefined> {
    await this.ensureInitialized();
    return this.cache.pharmacyReviews.get(id);
  }

  public async savePharmacyReview(review: PharmacyReview): Promise<void> {
    await this.ensureInitialized();
    await idbEngine.put('pharmacyReviews', review);
    this.cache.pharmacyReviews.set(review.id, review);
  }

  public async getDiagnosis(id: string): Promise<Diagnosis | undefined> {
    await this.ensureInitialized();
    return this.cache.diagnoses.get(id);
  }

  public async getDiagnoses(patientId?: string, encounterId?: string): Promise<Diagnosis[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.diagnoses.values());
    if (patientId) list = list.filter((d) => d.patientId === patientId);
    if (encounterId) list = list.filter((d) => d.encounterId === encounterId);
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public async saveDiagnosis(diagnosis: Diagnosis): Promise<void> {
    await this.ensureInitialized();
    this.cache.diagnoses.set(diagnosis.id, diagnosis);
    await idbEngine.put('diagnoses', diagnosis);
  }

  public async getProblem(id: string): Promise<Problem | undefined> {
    await this.ensureInitialized();
    return this.cache.problems.get(id);
  }

  public async getProblems(patientId?: string): Promise<Problem[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.problems.values());
    if (patientId) list = list.filter((p) => p.patientId === patientId);
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public async saveProblem(problem: Problem): Promise<void> {
    await this.ensureInitialized();
    this.cache.problems.set(problem.id, problem);
    await idbEngine.put('problems', problem);
  }

  public async getDifferentials(encounterId?: string, patientId?: string): Promise<DifferentialConsideration[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.differentials.values());
    if (encounterId) list = list.filter((d) => d.encounterId === encounterId);
    if (patientId) list = list.filter((d) => d.patientId === patientId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async saveDifferential(differential: DifferentialConsideration): Promise<void> {
    await this.ensureInitialized();
    this.cache.differentials.set(differential.id, differential);
    await idbEngine.put('differentials', differential);
  }

  public async getClinicalAssessments(encounterId?: string, patientId?: string): Promise<ClinicalAssessment[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.clinicalAssessments.values());
    if (encounterId) list = list.filter((a) => a.encounterId === encounterId);
    if (patientId) list = list.filter((a) => a.patientId === patientId);
    return list.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }

  public async saveClinicalAssessment(assessment: ClinicalAssessment): Promise<void> {
    await this.ensureInitialized();
    this.cache.clinicalAssessments.set(assessment.id, assessment);
    await idbEngine.put('clinicalAssessments', assessment);
  }

  // --- Diagnostic Orders & Results ---
  public async getLabOrders(patientId?: string, facilityId?: string): Promise<LaboratoryOrder[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.labOrders.values());
    if (patientId) list = list.filter((o) => o.patientId === patientId);
    return list.sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());
  }

  public async saveLabOrder(order: LaboratoryOrder): Promise<void> {
    await this.ensureInitialized();
    this.cache.labOrders.set(order.id, order);
    await idbEngine.put('labOrders', order);
  }

  public async getLabSpecimens(orderId?: string, patientId?: string): Promise<LaboratorySpecimen[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.labSpecimens.values());
    if (orderId) list = list.filter((s) => s.orderId === orderId);
    if (patientId) list = list.filter((s) => s.patientId === patientId);
    return list.sort((a, b) => new Date(b.collectedAt || b.createdAt).getTime() - new Date(a.collectedAt || a.createdAt).getTime());
  }

  public async getLabSpecimen(id: string): Promise<LaboratorySpecimen | undefined> {
    await this.ensureInitialized();
    return this.cache.labSpecimens.get(id) || Array.from(this.cache.labSpecimens.values()).find((s) => s.accessionNumber === id);
  }

  public async saveLabSpecimen(specimen: LaboratorySpecimen): Promise<void> {
    await this.ensureInitialized();
    this.cache.labSpecimens.set(specimen.id, specimen);
    await idbEngine.put('labSpecimens', specimen);
  }

  public async getLabResults(patientId?: string, orderId?: string): Promise<LaboratoryResult[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.labResults.values());
    if (patientId) list = list.filter((r) => r.patientId === patientId);
    if (orderId) list = list.filter((r) => r.orderId === orderId);
    return list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  public async saveLabResult(result: LaboratoryResult): Promise<void> {
    await this.ensureInitialized();
    this.cache.labResults.set(result.id, result);
    await idbEngine.put('labResults', result);
  }

  public async getRadiologyOrders(patientId?: string, facilityId?: string): Promise<RadiologyOrder[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.radiologyOrders.values());
    if (patientId) list = list.filter((o) => o.patientId === patientId);
    if (facilityId) list = list.filter((o) => (o.facilityId || (typeof o.provenance === 'object' && o.provenance?.sourceFacilityId)) === facilityId);
    return list.sort((a, b) => new Date(b.orderedAt || b.requestedAt || b.createdAt || 0).getTime() - new Date(a.orderedAt || a.requestedAt || a.createdAt || 0).getTime());
  }

  public async getRadiologyOrder(id: string): Promise<RadiologyOrder | undefined> {
    await this.ensureInitialized();
    return this.cache.radiologyOrders.get(id) || Array.from(this.cache.radiologyOrders.values()).find((o) => o.orderNumber === id);
  }

  public async saveRadiologyOrder(order: RadiologyOrder): Promise<void> {
    await this.ensureInitialized();
    this.cache.radiologyOrders.set(order.id, order);
    await idbEngine.put('radiologyOrders', order);
  }

  public async getRadiologyStudies(orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyStudy[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.radiologyStudies.values());
    if (orderId) list = list.filter((s) => s.orderId === orderId);
    if (patientId) list = list.filter((s) => s.patientId === patientId);
    if (facilityId) list = list.filter((s) => s.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.startedAt || b.createdAt).getTime() - new Date(a.startedAt || a.createdAt).getTime());
  }

  public async getRadiologyStudy(id: string): Promise<RadiologyStudy | undefined> {
    await this.ensureInitialized();
    return this.cache.radiologyStudies.get(id) || Array.from(this.cache.radiologyStudies.values()).find((s) => s.accessionNumber === id || s.studyNumber === id);
  }

  public async saveRadiologyStudy(study: RadiologyStudy): Promise<void> {
    await this.ensureInitialized();
    this.cache.radiologyStudies.set(study.id, study);
    await idbEngine.put('radiologyStudies', study);
  }

  public async getRadiologyReports(studyId?: string, orderId?: string, patientId?: string, facilityId?: string): Promise<RadiologyReport[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.radiologyReports.values());
    if (studyId) list = list.filter((r) => r.studyId === studyId);
    if (orderId) list = list.filter((r) => r.orderId === orderId);
    if (patientId) list = list.filter((r) => r.patientId === patientId);
    if (facilityId) list = list.filter((r) => r.facilityId === facilityId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getRadiologyReport(id: string): Promise<RadiologyReport | undefined> {
    await this.ensureInitialized();
    return this.cache.radiologyReports.get(id);
  }

  public async saveRadiologyReport(report: RadiologyReport): Promise<void> {
    await this.ensureInitialized();
    this.cache.radiologyReports.set(report.id, report);
    await idbEngine.put('radiologyReports', report);
  }

  public async getCriticalRadiologyFindings(facilityId?: string, patientId?: string): Promise<CriticalRadiologyFinding[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.criticalRadiologyFindings.values());
    if (facilityId) list = list.filter((f) => f.facilityId === facilityId);
    if (patientId) list = list.filter((f) => f.patientId === patientId);
    return list.sort((a, b) => new Date(b.escalatedAt).getTime() - new Date(a.escalatedAt).getTime());
  }

  public async getCriticalRadiologyFinding(id: string): Promise<CriticalRadiologyFinding | undefined> {
    await this.ensureInitialized();
    return this.cache.criticalRadiologyFindings.get(id);
  }

  public async saveCriticalRadiologyFinding(finding: CriticalRadiologyFinding): Promise<void> {
    await this.ensureInitialized();
    this.cache.criticalRadiologyFindings.set(finding.id, finding);
    await idbEngine.put('criticalRadiologyFindings', finding);
  }

  public async getRadiologyResults(patientId?: string, orderId?: string): Promise<RadiologyResult[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.radiologyResults.values());
    if (patientId) list = list.filter((r) => r.patientId === patientId);
    if (orderId) list = list.filter((r) => r.orderId === orderId);
    return list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  public async saveRadiologyResult(result: RadiologyResult): Promise<void> {
    await this.ensureInitialized();
    this.cache.radiologyResults.set(result.id, result);
    await idbEngine.put('radiologyResults', result);
  }

  // --- Operational ---
  public async getAppointments(facilityId?: string, patientId?: string): Promise<Appointment[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.appointments.values());
    if (facilityId) list = list.filter((a) => a.facilityId === facilityId);
    if (patientId) list = list.filter((a) => a.patientId === patientId);
    return list.sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  }

  public async saveAppointment(appointment: Appointment): Promise<void> {
    await this.ensureInitialized();
    this.cache.appointments.set(appointment.id, appointment);
    await idbEngine.put('appointments', appointment);
  }

  public async getReferrals(facilityId?: string, patientId?: string): Promise<Referral[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.referrals.values());
    if (facilityId) {
      list = list.filter(
        (r) =>
          r.sourceFacilityId === facilityId ||
          r.fromFacilityId === facilityId ||
          r.destinationFacilityId === facilityId ||
          r.toFacilityId === facilityId
      );
    }
    if (patientId) list = list.filter((r) => r.patientId === patientId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getReferral(id: string): Promise<Referral | undefined> {
    await this.ensureInitialized();
    const direct = this.cache.referrals.get(id);
    if (direct) return direct;
    return Array.from(this.cache.referrals.values()).find((r) => r.referralNumber === id);
  }

  public async getReferralById(id: string): Promise<Referral | undefined> {
    return this.getReferral(id);
  }

  public async saveReferral(referral: Referral): Promise<void> {
    await this.ensureInitialized();
    this.cache.referrals.set(referral.id, referral);
    await idbEngine.put('referrals', referral);
  }

  public async getReferralOutcomes(referralId?: string, patientId?: string): Promise<ReferralOutcome[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.referralOutcomes.values());
    if (referralId) list = list.filter((o) => o.referralId === referralId);
    if (patientId) list = list.filter((o) => o.patientId === patientId);
    return list.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }

  public async getReferralOutcome(id: string): Promise<ReferralOutcome | undefined> {
    await this.ensureInitialized();
    return this.cache.referralOutcomes.get(id);
  }

  public async saveReferralOutcome(outcome: ReferralOutcome): Promise<void> {
    await this.ensureInitialized();
    this.cache.referralOutcomes.set(outcome.id, outcome);
    await idbEngine.put('referralOutcomes', outcome);
  }

  public async getReferralCommunications(referralId?: string): Promise<ReferralCommunication[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.referralCommunications.values());
    if (referralId) list = list.filter((c) => c.referralId === referralId);
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async saveReferralCommunication(communication: ReferralCommunication): Promise<void> {
    await this.ensureInitialized();
    this.cache.referralCommunications.set(communication.id, communication);
    await idbEngine.put('referralCommunications', communication);
  }

  public async getEmergencyCases(facilityId?: string): Promise<EmergencyCase[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.emergencyCases.values());
    if (facilityId) list = list.filter((ec) => ec.facilityId === facilityId);
    return list.sort((a, b) => {
      const timeA = new Date(a.arrivalAt || a.arrivalTime || 0).getTime();
      const timeB = new Date(b.arrivalAt || b.arrivalTime || 0).getTime();
      return timeB - timeA;
    });
  }

  public async getEmergencyCase(id: string): Promise<EmergencyCase | undefined> {
    await this.ensureInitialized();
    return (
      this.cache.emergencyCases.get(id) ||
      Array.from(this.cache.emergencyCases.values()).find((ec) => ec.emergencyNumber === id)
    );
  }

  public async saveEmergencyCase(emergencyCase: EmergencyCase): Promise<void> {
    await this.ensureInitialized();
    this.cache.emergencyCases.set(emergencyCase.id, emergencyCase);
    await idbEngine.put('emergencyCases', emergencyCase);
  }

  public async getEmergencyTriages(emergencyCaseId?: string): Promise<EmergencyTriage[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.emergencyTriages.values());
    if (emergencyCaseId) list = list.filter((t) => t.emergencyCaseId === emergencyCaseId);
    return list.sort((a, b) => new Date(b.assessedAt).getTime() - new Date(a.assessedAt).getTime());
  }

  public async saveEmergencyTriage(triage: EmergencyTriage): Promise<void> {
    await this.ensureInitialized();
    this.cache.emergencyTriages.set(triage.id, triage);
    await idbEngine.put('emergencyTriages', triage);
  }

  public async getEmergencyReassessments(emergencyCaseId?: string): Promise<EmergencyReassessment[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.emergencyReassessments.values());
    if (emergencyCaseId) list = list.filter((r) => r.emergencyCaseId === emergencyCaseId);
    return list.sort((a, b) => new Date(b.assessedAt).getTime() - new Date(a.assessedAt).getTime());
  }

  public async saveEmergencyReassessment(reassessment: EmergencyReassessment): Promise<void> {
    await this.ensureInitialized();
    this.cache.emergencyReassessments.set(reassessment.id, reassessment);
    await idbEngine.put('emergencyReassessments', reassessment);
  }

  public async getEmergencyAlerts(emergencyCaseId?: string): Promise<EmergencyAlert[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.emergencyAlerts.values());
    if (emergencyCaseId) list = list.filter((a) => a.emergencyCaseId === emergencyCaseId);
    return list.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }

  public async saveEmergencyAlert(alert: EmergencyAlert): Promise<void> {
    await this.ensureInitialized();
    this.cache.emergencyAlerts.set(alert.id, alert);
    await idbEngine.put('emergencyAlerts', alert);
  }

  public async getTransportRequests(emergencyCaseId?: string): Promise<TransportRequest[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.transportRequests.values());
    if (emergencyCaseId) list = list.filter((t) => t.emergencyCaseId === emergencyCaseId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async saveTransportRequest(req: TransportRequest): Promise<void> {
    await this.ensureInitialized();
    this.cache.transportRequests.set(req.id, req);
    await idbEngine.put('transportRequests', req);
  }

  public async getAIRequests(patientId?: string): Promise<AIRequest[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.aiRequests.values());
    if (patientId) list = list.filter((ai) => ai.patientId === patientId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getAIRequestById(id: string): Promise<AIRequest | undefined> {
    await this.ensureInitialized();
    return this.cache.aiRequests.get(id);
  }

  public async saveAIRequest(request: AIRequest): Promise<void> {
    await this.ensureInitialized();
    this.cache.aiRequests.set(request.id, request);
    await idbEngine.put('aiRequests', request);
  }

  public async updateAIRequestReviewStatus(requestId: string, status: AIReviewStatus): Promise<void> {
    await this.ensureInitialized();
    const req = this.cache.aiRequests.get(requestId);
    if (req) {
      const updated = { ...req, reviewStatus: status };
      this.cache.aiRequests.set(requestId, updated);
      await idbEngine.put('aiRequests', updated);
    }
  }

  public async getAIResponses(requestId?: string): Promise<AIResponse[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.aiResponses.values());
    if (requestId) list = list.filter((r) => r.requestId === requestId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getAIResponseById(id: string): Promise<AIResponse | undefined> {
    await this.ensureInitialized();
    return this.cache.aiResponses.get(id);
  }

  public async getAIResponseByRequestId(requestId: string): Promise<AIResponse | undefined> {
    await this.ensureInitialized();
    return Array.from(this.cache.aiResponses.values()).find((r) => r.requestId === requestId);
  }

  public async saveAIResponse(response: AIResponse): Promise<void> {
    await this.ensureInitialized();
    this.cache.aiResponses.set(response.id, response);
    await idbEngine.put('aiResponses', response);
  }

  public async updateAIResponseApproval(
    responseId: string,
    approved: boolean,
    approvedById?: string,
    approvedByName?: string
  ): Promise<void> {
    await this.ensureInitialized();
    const resp = this.cache.aiResponses.get(responseId);
    if (resp) {
      const updated: AIResponse = {
        ...resp,
        clinicianApproved: approved,
        approvedById,
        approvedByName,
        approvedAt: approved ? new Date().toISOString() : undefined,
      };
      this.cache.aiResponses.set(responseId, updated);
      await idbEngine.put('aiResponses', updated);
    }
  }

  public async getAIReviews(requestId?: string): Promise<AIReview[]> {
    await this.ensureInitialized();
    let list = Array.from(this.cache.aiReviews.values());
    if (requestId) list = list.filter((r) => r.requestId === requestId);
    return list.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
  }

  public async saveAIReview(review: AIReview): Promise<void> {
    await this.ensureInitialized();
    this.cache.aiReviews.set(review.id, review);
    await idbEngine.put('aiReviews', review);
  }

  public async clear(): Promise<void> {
    Object.values(this.cache).forEach((map) => map.clear());
    await Promise.all([
      idbEngine.clearStore('patients'),
      idbEngine.clearStore('encounters'),
      idbEngine.clearStore('vitals'),
      idbEngine.clearStore('clinicalNotes'),
      idbEngine.clearStore('allergies'),
      idbEngine.clearStore('medications'),
      idbEngine.clearStore('problems'),
      idbEngine.clearStore('diagnoses'),
      idbEngine.clearStore('differentials'),
      idbEngine.clearStore('clinicalAssessments'),
      idbEngine.clearStore('labOrders'),
      idbEngine.clearStore('labSpecimens'),
      idbEngine.clearStore('labResults'),
      idbEngine.clearStore('radiologyOrders'),
      idbEngine.clearStore('radiologyStudies'),
      idbEngine.clearStore('radiologyReports'),
      idbEngine.clearStore('criticalRadiologyFindings'),
      idbEngine.clearStore('radiologyResults'),
      idbEngine.clearStore('appointments'),
      idbEngine.clearStore('referrals'),
      idbEngine.clearStore('referralOutcomes'),
      idbEngine.clearStore('referralCommunications'),
      idbEngine.clearStore('emergencyCases'),
      idbEngine.clearStore('emergencyTriages'),
      idbEngine.clearStore('emergencyReassessments'),
      idbEngine.clearStore('emergencyAlerts'),
      idbEngine.clearStore('transportRequests'),
      idbEngine.clearStore('aiRequests'),
      idbEngine.clearStore('aiResponses'),
      idbEngine.clearStore('aiReviews'),
    ]);
  }
}

export const localRepository = LocalRepository.getInstance();
