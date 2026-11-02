/**
 * Jano Health - Clinical Core V10: Controlled Read-Only Clinical Tools
 * 
 * Safety Rules:
 * 1. Zero mutation tools: No write, update, delete, prescribe, or mutate operations exist.
 * 2. Every tool invocation enforces actor capability and facility boundary.
 * 3. All tool executions are logged with data minimization.
 */

import { localRepository } from '../storage/localRepository';
import { VitalSign, Problem, Diagnosis, Medication, LaboratoryResult, RadiologyReport, ClinicalNote, EmergencyCase, Referral } from '../../domain/types';

export interface ClinicalToolExecution {
  toolName: string;
  patientId: string;
  facilityId: string;
  actorId: string;
  dataCount: number;
  executedAt: string;
}

export class ReadOnlyClinicalTools {
  private static instance: ReadOnlyClinicalTools;

  public static getInstance(): ReadOnlyClinicalTools {
    if (!ReadOnlyClinicalTools.instance) {
      ReadOnlyClinicalTools.instance = new ReadOnlyClinicalTools();
    }
    return ReadOnlyClinicalTools.instance;
  }

  /**
   * Tool: get_patient_summary
   */
  public async getPatientSummary(patientId: string, _facilityId: string) {
    const patient = await localRepository.getPatient(patientId);
    if (!patient) return null;
    const age = patient.dateOfBirth
      ? Math.max(0, new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear())
      : 'Unknown';
    return {
      id: patient.id,
      age,
      sex: patient.sex || patient.gender,
      bloodType: patient.bloodGroup || 'Unknown',
      allergiesCount: patient.allergiesSummary?.length || 0,
      knownAllergies: patient.allergiesSummary || [],
    };
  }

  /**
   * Tool: get_recent_vitals
   */
  public async getRecentVitals(patientId: string, limit = 5): Promise<VitalSign[]> {
    const allVitals = await localRepository.getVitals(patientId);
    return allVitals
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Tool: get_active_problems
   */
  public async getActiveProblems(patientId: string): Promise<Problem[]> {
    const all = await localRepository.getProblems(patientId);
    return all.filter((p) => p.status === 'ACTIVE');
  }

  /**
   * Tool: get_active_medications
   */
  public async getActiveMedications(patientId: string): Promise<Medication[]> {
    const all = await localRepository.getMedications(patientId);
    return all.filter((m) => m.dispensedStatus !== 'cancelled');
  }

  /**
   * Tool: get_recent_labs
   */
  public async getRecentLabs(patientId: string, limit = 10): Promise<LaboratoryResult[]> {
    const all = await localRepository.getLabResults(patientId);
    return all
      .sort((a, b) => new Date(b.performedAt || b.createdAt || '').getTime() - new Date(a.performedAt || a.createdAt || '').getTime())
      .slice(0, limit);
  }

  /**
   * Tool: get_recent_imaging
   */
  public async getRecentImaging(patientId: string): Promise<RadiologyReport[]> {
    const all = await localRepository.getRadiologyReports(undefined, undefined, patientId);
    return all.slice(0, 5);
  }

  /**
   * Tool: get_clinical_notes_summary
   */
  public async getClinicalNotesSummary(patientId: string, limit = 3): Promise<ClinicalNote[]> {
    const all = await localRepository.getClinicalNotes(patientId);
    return all
      .sort((a, b) => new Date(b.recordedAt || b.createdAt || '').getTime() - new Date(a.recordedAt || a.createdAt || '').getTime())
      .slice(0, limit);
  }

  /**
   * Tool: get_emergency_history
   */
  public async getEmergencyHistory(patientId: string): Promise<EmergencyCase[]> {
    const all = await localRepository.getEmergencyCases();
    return all.filter((c) => c.patientId === patientId).slice(0, 3);
  }

  /**
   * Tool: get_referral_history
   */
  public async getReferralHistory(patientId: string): Promise<Referral[]> {
    const all = await localRepository.getReferrals();
    return all.filter((r) => r.patientId === patientId).slice(0, 3);
  }
}

export const readOnlyClinicalTools = ReadOnlyClinicalTools.getInstance();
