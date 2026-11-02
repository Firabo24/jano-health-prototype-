/**
 * Jano Health - Longitudinal Patient Timeline Service
 * 
 * Aggregates and reconstructs the immutable chronological event stream for a patient:
 * - Registration, demographic revisions, and lifecycle transitions
 * - Consultations, bedside vitals, diagnoses, medications, and investigations
 * - Cryptographic verification hashes and audit provenance
 */

import { DomainEvent } from '../../domain/persistence';
import { eventStore } from '../events/eventStore';
import { localDb } from '../storage/localDatabase';

export interface TimelineEntry {
  id: string;
  timestamp: string;
  category: 'REGISTRATION' | 'DEMOGRAPHICS' | 'ENCOUNTER' | 'CLINICAL_NOTE' | 'VITALS' | 'DIAGNOSIS' | 'MEDICATION' | 'INVESTIGATION' | 'LIFECYCLE' | 'MERGE';
  title: string;
  summary: string;
  actorName: string;
  actorRole: string;
  facilityId: string;
  eventHash?: string;
  rawEvent?: DomainEvent;
}

export type PatientTimelineItem = TimelineEntry;

export class PatientTimelineService {
  private static instance: PatientTimelineService;

  private constructor() {}

  public static getInstance(): PatientTimelineService {
    if (!PatientTimelineService.instance) {
      PatientTimelineService.instance = new PatientTimelineService();
    }
    return PatientTimelineService.instance;
  }

  /**
   * Builds a comprehensive chronological timeline for a patient by querying
   * immutable domain events and local clinical records.
   */
  public async getPatientTimeline(patientId: string): Promise<TimelineEntry[]> {
    const entries: TimelineEntry[] = [];

    // 1. Fetch domain events for this patient
    const domainEvents = await eventStore.getEventsForAggregate('Patient', patientId);

    for (const ev of domainEvents) {
      const p = ev.payload || {};
      const meta = ev.metadata || ({} as any);

      switch (ev.eventType) {
        case 'PatientRegistered':
        case 'PATIENT_REGISTERED':
        case 'PATIENT_CREATED':
          entries.push({
            id: ev.eventId,
            timestamp: ev.timestamp,
            category: 'REGISTRATION',
            title: 'Patient Master Registration',
            summary: `Initial registration at facility ${ev.facilityId}. Assigned MRN: ${p.mrn || 'N/A'}.`,
            actorName: meta.userName || 'Clinical Registrar',
            actorRole: meta.userRole || 'receptionist',
            facilityId: ev.facilityId,
            eventHash: ev.eventHash,
            rawEvent: ev,
          });
          break;

        case 'PatientDemographicsUpdated':
        case 'PATIENT_DEMOGRAPHICS_UPDATED':
        case 'PATIENT_UPDATED':
          entries.push({
            id: ev.eventId,
            timestamp: ev.timestamp,
            category: 'DEMOGRAPHICS',
            title: 'Demographics Updated',
            summary: `Updated fields: ${(p.updatedFields || []).join(', ') || 'Contact/Personal Details'}.`,
            actorName: meta.userName || 'Registrar',
            actorRole: meta.userRole || 'receptionist',
            facilityId: ev.facilityId,
            eventHash: ev.eventHash,
            rawEvent: ev,
          });
          break;

        case 'PatientStatusChanged':
        case 'PATIENT_STATUS_CHANGED':
          entries.push({
            id: ev.eventId,
            timestamp: ev.timestamp,
            category: 'LIFECYCLE',
            title: `Status Changed to ${p.newStatus}`,
            summary: p.reason ? `Reason: ${p.reason}` : `Patient lifecycle changed from ${p.previousStatus} to ${p.newStatus}.`,
            actorName: meta.userName || 'Administrator',
            actorRole: meta.userRole || 'facility_administrator',
            facilityId: ev.facilityId,
            eventHash: ev.eventHash,
            rawEvent: ev,
          });
          break;

        case 'PatientMerged':
        case 'PATIENT_MERGED':
          entries.push({
            id: ev.eventId,
            timestamp: ev.timestamp,
            category: 'MERGE',
            title: 'Duplicate Record Merged',
            summary: `Reconciled duplicate chart (${p.duplicateMRN}) into surviving chart (${p.survivorMRN}). Reason: ${p.reason || 'Duplicate resolution'}`,
            actorName: meta.userName || 'Facility Administrator',
            actorRole: meta.userRole || 'facility_administrator',
            facilityId: ev.facilityId,
            eventHash: ev.eventHash,
            rawEvent: ev,
          });
          break;
      }
    }

    // 2. Fetch Encounters
    const encounters = localDb.getEncounters(patientId);
    for (const enc of encounters) {
      const typeStr = (enc.encounterType || enc.type || 'OUTPATIENT').toUpperCase();
      const statusStr = enc.status.toUpperCase();
      const encNum = enc.encounterNumber ? `[${enc.encounterNumber}] ` : '';
      entries.push({
        id: enc.id,
        timestamp: enc.startedAt,
        category: 'ENCOUNTER',
        title: `${typeStr} Encounter ${encNum}`,
        summary: `Chief complaint: ${enc.chiefComplaint}. Status: ${statusStr}. Attending: ${enc.attendingClinicianName || enc.clinicianId || 'Staff'}.`,
        actorName: enc.attendingClinicianName || enc.clinicianId || 'Attending Clinician',
        actorRole: (enc.attendingClinicianRole as string) || 'physician',
        facilityId: enc.facilityId,
      });
    }

    // 3. Fetch Clinical Notes
    const notes = localDb.getClinicalNotes(patientId);
    for (const note of notes) {
      const statusBadge = note.status ? `[${note.status}] ` : '';
      const versionBadge = note.version ? `v${note.version} ` : '';
      const author = note.authorName || note.authorId || 'Clinician';
      const signer = note.signedByName ? ` Signed by ${note.signedByName} (${note.signedByRole || 'physician'}).` : '';
      const amendment = note.amendmentReason ? ` Amendment: ${note.amendmentReason}` : '';

      entries.push({
        id: note.id,
        timestamp: note.recordedAt || note.createdAt || new Date().toISOString(),
        category: 'CLINICAL_NOTE',
        title: `${statusBadge}${versionBadge}SOAP Documentation`,
        summary: `Assessment: ${note.assessment || 'Under evaluation'}. Plan: ${note.plan || 'Care plan active'}.${signer}${amendment}`,
        actorName: author,
        actorRole: (note.authorRole as string) || 'physician',
        facilityId: note.facilityId || 'Primary Facility',
      });
    }

    // 4. Fetch Bedside Vitals
    const vitals = localDb.getVitals(patientId);
    for (const v of vitals) {
      const bp = v.systolicBp && v.diastolicBp ? `${v.systolicBp}/${v.diastolicBp} mmHg` : '';
      const hr = v.heartRate ? `${v.heartRate} bpm` : '';
      const temp = v.temperature ? `${v.temperature}°C` : '';
      const spo2 = v.oxygenSaturation ? `${v.oxygenSaturation}% SpO2` : '';
      const alerts = v.clinicalWarnings && v.clinicalWarnings.length > 0 ? ` [⚠️ ${v.clinicalWarnings.length} alert(s)]` : '';
      const vitalsText = [bp, hr, temp, spo2].filter(Boolean).join(', ');

      entries.push({
        id: v.id,
        timestamp: v.recordedAt,
        category: 'VITALS',
        title: 'Bedside Vital Signs Recorded',
        summary: `${vitalsText || 'Physiological measurements logged.'}${alerts}`,
        actorName: v.recordedByName || v.recordedById || 'Staff Nurse',
        actorRole: (v.recordedByRole as string) || 'nurse',
        facilityId: v.facilityId || 'Primary Facility',
      });
    }

    // 4. Fetch Diagnoses
    const diagnoses = localDb.getDiagnoses ? localDb.getDiagnoses(patientId) : [];
    for (const dx of diagnoses) {
      entries.push({
        id: dx.id,
        timestamp: dx.recordedAt,
        category: 'DIAGNOSIS',
        title: `Diagnosis: ${dx.description}`,
        summary: `${dx.status.toUpperCase()} (${dx.type}) - Code: ${dx.code || 'N/A'}.`,
        actorName: dx.diagnosedById || 'Physician',
        actorRole: 'physician',
        facilityId: 'Primary Facility',
      });
    }

    // 5. Fetch Lab Orders
    const labOrders = localDb.getLabOrders ? localDb.getLabOrders(patientId) : [];
    for (const lo of labOrders) {
      entries.push({
        id: lo.id,
        timestamp: lo.orderedAt,
        category: 'INVESTIGATION',
        title: `Lab Order: ${lo.testName}`,
        summary: `Category: ${lo.category.toUpperCase()} - Urgency: ${lo.urgency.toUpperCase()} - Status: ${lo.status.toUpperCase()}.`,
        actorName: lo.orderedById || 'Ordering Provider',
        actorRole: 'physician',
        facilityId: 'Primary Facility',
      });
    }

    // Sort entries reverse chronologically (newest first)
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Builds timeline and computes a SHA-256 cryptographic integrity hash across
   * the timeline's entry stream for audit and tamper detection.
   */
  public async buildTimeline(patientId: string): Promise<{ entries: TimelineEntry[]; integrityHash: string }> {
    const entries = await this.getPatientTimeline(patientId);
    const content = entries.map((e) => `${e.id}:${e.timestamp}:${e.category}:${e.actorName}`).join('|');
    
    // Compute SHA-256 in Node.js or browser
    let hash = '';
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      hash = Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      // Fallback Node crypto
      const nodeCrypto = await import('crypto');
      hash = nodeCrypto.createHash('sha256').update(content).digest('hex');
    }

    return { entries, integrityHash: hash };
  }
}

export const patientTimelineService = PatientTimelineService.getInstance();
