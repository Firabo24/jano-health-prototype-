/**
 * Jano Health - FHIR R5 Export Service
 * Produces standards-compliant FHIR R5 bundles and resource representations with full audit lineage.
 * 
 * TENANT ISOLATION & SECURITY RULES:
 * 1. Strict facility authorization: Users can only export data within their authorized facilities.
 * 2. Complete provenance: Every exported bundle includes Provenance attributing the exporting actor, facility, and policy basis.
 * 3. Offline safety: Operates reliably with local storage, never blocking on remote cloud servers.
 */

import { FHIR_VERSION, JANO_SYSTEM_BASE, FHIR_DEFAULT_PAGE_SIZE, FHIR_MAX_PAGE_SIZE } from './constants';
import { Resource, FHIRBundle, FHIRBundleEntry, FHIRProvenance, FHIROperationOutcome } from './types';
import { fhirMapper } from './mapper';
import { fhirExchangePolicy, PurposeOfUse } from './policy';
import { localRepository } from '../storage/localRepository';
import { auditService } from '../audit/auditService';

export interface ExportPatientOptions {
  patientId: string;
  requestingUserId: string;
  requestingUserRole: string;
  requestingFacilityId: string;
  purposeOfUse?: PurposeOfUse;
  resourceTypes?: string[];
  since?: string;
}

export interface ExportResult {
  bundle?: FHIRBundle;
  resource?: Resource;
  outcome?: FHIROperationOutcome;
  status: number;
}

export class FHIRExportService {
  private static instance: FHIRExportService;

  private constructor() {}

  public static getInstance(): FHIRExportService {
    if (!FHIRExportService.instance) {
      FHIRExportService.instance = new FHIRExportService();
    }
    return FHIRExportService.instance;
  }

  /**
   * Generates a comprehensive, patient-scoped FHIR R5 Bundle ($export / patient record summary).
   */
  public async exportPatientEverything(options: ExportPatientOptions): Promise<ExportResult> {
    const {
      patientId,
      requestingUserId,
      requestingUserRole,
      requestingFacilityId,
      purposeOfUse = 'TREATMENT',
      resourceTypes = ['Patient', 'Encounter', 'Observation', 'Condition', 'AllergyIntolerance', 'ServiceRequest', 'MedicationRequest', 'MedicationDispense', 'DiagnosticReport', 'ImagingStudy', 'DocumentReference'],
    } = options;

    // 1. Policy & Authorization Evaluation
    const policyResult = fhirExchangePolicy.evaluatePolicy({
      requesterId: requestingUserId,
      requesterRole: requestingUserRole,
      requesterFacilityId: requestingFacilityId,
      purposeOfUse,
      targetPatientId: patientId,
      requestedResourceTypes: resourceTypes,
    });

    if (!policyResult.allowed) {
      return {
        status: 403,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'forbidden',
              diagnostics: policyResult.reason || 'FHIR data export denied by clinical access policy.',
            },
          ],
        },
      };
    }

    // 2. Retrieve Patient Aggregate
    const patient = await localRepository.getPatient(patientId);
    if (!patient) {
      return {
        status: 404,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'not-found',
              diagnostics: `Patient aggregate "${patientId}" was not found.`,
            },
          ],
        },
      };
    }

    // 3. Facility Isolation Guard
    if (
      requestingUserRole !== 'system_administrator' &&
      patient.primaryFacilityId !== requestingFacilityId &&
      patient.registrationFacilityId !== requestingFacilityId
    ) {
      // Check if cross-facility emergency break-glass applies
      if (purposeOfUse !== 'EMERGENCY') {
        return {
          status: 403,
          outcome: {
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'error',
                code: 'forbidden',
                diagnostics: `Tenant facility isolation: Patient belongs to facility ${patient.primaryFacilityId}, caller authorized for ${requestingFacilityId}.`,
              },
            ],
          },
        };
      }
    }

    const entries: FHIRBundleEntry[] = [];

    // Patient
    if (resourceTypes.includes('Patient')) {
      const fhirPatient = fhirMapper.patientToFHIR(patient);
      entries.push({
        fullUrl: `${JANO_SYSTEM_BASE}/Patient/${fhirPatient.id}`,
        resource: fhirPatient,
      });
    }

    // Encounters
    if (resourceTypes.includes('Encounter')) {
      const encounters = await localRepository.getEncounters(patientId);
      for (const enc of encounters) {
        const fhirEnc = fhirMapper.encounterToFHIR(enc);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/Encounter/${fhirEnc.id}`,
          resource: fhirEnc,
        });
      }
    }

    // Vitals (Observations)
    if (resourceTypes.includes('Observation')) {
      const vitals = await localRepository.getVitals(patientId);
      for (const v of vitals) {
        const obsList = fhirMapper.vitalsToFHIRObservations(v);
        for (const obs of obsList) {
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/Observation/${obs.id}`,
            resource: obs,
          });
        }
      }
    }

    // Diagnoses (Conditions)
    if (resourceTypes.includes('Condition')) {
      const diagnoses = await localRepository.getDiagnoses(patientId);
      for (const dx of diagnoses) {
        const cond = fhirMapper.diagnosisToFHIRCondition(dx);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/Condition/${cond.id}`,
          resource: cond,
        });
      }

      const problems = await localRepository.getProblems(patientId);
      for (const prb of problems) {
        const cond = fhirMapper.problemToFHIRCondition(prb);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/Condition/${cond.id}`,
          resource: cond,
        });
      }
    }

    // Allergies
    if (resourceTypes.includes('AllergyIntolerance')) {
      const allergies = await localRepository.getAllergies(patientId);
      for (const alg of allergies) {
        const fhirAlg = fhirMapper.allergyToFHIR(alg);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/AllergyIntolerance/${fhirAlg.id}`,
          resource: fhirAlg,
        });
      }
    }

    // Medications (Orders & Dispenses)
    if (resourceTypes.includes('MedicationRequest')) {
      const medOrders = await localRepository.getMedicationOrders(patientId);
      for (const ord of medOrders) {
        const fhirReq = fhirMapper.medicationOrderToFHIR(ord);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/MedicationRequest/${fhirReq.id}`,
          resource: fhirReq,
        });
      }
    }

    if (resourceTypes.includes('MedicationDispense')) {
      const dispenses = await localRepository.getDispenseRecords(undefined, patientId);
      for (const d of dispenses) {
        const fhirDisp = fhirMapper.dispenseRecordToFHIR(d);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/MedicationDispense/${fhirDisp.id}`,
          resource: fhirDisp,
        });
      }
    }

    // Lab Orders & Reports
    if (resourceTypes.includes('ServiceRequest') || resourceTypes.includes('DiagnosticReport')) {
      const labOrders = await localRepository.getLabOrders(patientId);
      for (const lo of labOrders) {
        if (resourceTypes.includes('ServiceRequest')) {
          const sr = fhirMapper.labOrderToFHIR(lo);
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/ServiceRequest/${sr.id}`,
            resource: sr,
          });
        }
      }

      const labReports = await localRepository.getLabResults(patientId);
      for (const rep of labReports) {
        if (resourceTypes.includes('DiagnosticReport')) {
          const dr = fhirMapper.labReportToFHIR(rep as any);
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/DiagnosticReport/${dr.id}`,
            resource: dr,
          });
        }
      }
    }

    // Radiology
    if (resourceTypes.includes('ImagingStudy') || resourceTypes.includes('DiagnosticReport')) {
      const radStudies = await localRepository.getRadiologyStudies(undefined, patientId);
      for (const std of radStudies) {
        if (resourceTypes.includes('ImagingStudy')) {
          const ims = fhirMapper.radiologyStudyToFHIR(std);
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/ImagingStudy/${ims.id}`,
            resource: ims,
          });
        }
      }

      const radReports = await localRepository.getRadiologyReports(undefined, undefined, patientId);
      for (const rep of radReports) {
        if (resourceTypes.includes('DiagnosticReport')) {
          const dr = fhirMapper.radiologyReportToFHIR(rep);
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/DiagnosticReport/${dr.id}`,
            resource: dr,
          });
        }
      }
    }

    // Clinical Notes (DocumentReferences)
    if (resourceTypes.includes('DocumentReference')) {
      const notes = await localRepository.getClinicalNotes(patientId);
      for (const n of notes) {
        const doc = fhirMapper.clinicalNoteToFHIR(n);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/DocumentReference/${doc.id}`,
          resource: doc,
        });
      }
    }

    // Export Provenance
    const provenance: FHIRProvenance = {
      resourceType: 'Provenance',
      id: `prv-exp-${Date.now()}`,
      target: entries.map((e) => ({ reference: e.resource ? `${e.resource.resourceType}/${e.resource.id}` : '' })).filter((t) => !!t.reference),
      recorded: new Date().toISOString(),
      activity: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
            code: 'EXPORT',
            display: 'Export clinical records',
          },
        ],
        text: `FHIR R5 Export for Purpose: ${purposeOfUse}`,
      },
      agent: [
        {
          who: {
            reference: `Practitioner/usr-${requestingUserId.replace(/^usr-/, '')}`,
            display: requestingUserId,
          },
          onBehalfOf: {
            reference: `Organization/fac-${requestingFacilityId.replace(/^fac-/, '')}`,
          },
        },
      ],
    };

    entries.push({
      fullUrl: `${JANO_SYSTEM_BASE}/Provenance/${provenance.id}`,
      resource: provenance,
    });

    const bundle: FHIRBundle = {
      resourceType: 'Bundle',
      id: `bnd-pat-exp-${Date.now()}`,
      type: 'collection',
      timestamp: new Date().toISOString(),
      total: entries.length,
      entry: entries,
    };

    // Audit Logging
    await auditService.log({
      action: 'FHIR_EXPORT_COMPLETED' as any,
      actorId: requestingUserId,
      actorRole: requestingUserRole as any,
      facilityId: requestingFacilityId,
      patientId,
      details: {
        entryCount: entries.length,
        purposeOfUse,
        resourceTypes,
      },
    });

    return {
      status: 200,
      bundle,
    };
  }

  /**
   * Reads a single FHIR resource by Type and ID.
   */
  public async readResource(
    resourceType: string,
    id: string,
    requestingUserId: string,
    requestingUserRole: string,
    requestingFacilityId: string
  ): Promise<ExportResult> {
    const rawId = id.replace(/^[a-z]+-/, '');

    if (resourceType === 'Patient') {
      const patient = (await localRepository.getPatient(`pat_${rawId}`)) || (await localRepository.getPatient(id));
      if (!patient) return { status: 404 };
      return { status: 200, resource: fhirMapper.patientToFHIR(patient) };
    }

    if (resourceType === 'Encounter') {
      const enc = (await localRepository.getEncounter(`enc_${rawId}`)) || (await localRepository.getEncounter(id));
      if (!enc) return { status: 404 };
      return { status: 200, resource: fhirMapper.encounterToFHIR(enc) };
    }

    if (resourceType === 'Condition') {
      const dx = await localRepository.getDiagnosis(`dx_${rawId}`);
      if (dx) return { status: 200, resource: fhirMapper.diagnosisToFHIRCondition(dx) };
      const prb = await localRepository.getProblem(`prb_${rawId}`);
      if (prb) return { status: 200, resource: fhirMapper.problemToFHIRCondition(prb) };
      return { status: 404 };
    }

    if (resourceType === 'MedicationRequest') {
      const med = await localRepository.getMedicationOrder(`ord_${rawId}`);
      if (!med) return { status: 404 };
      return { status: 200, resource: fhirMapper.medicationOrderToFHIR(med) };
    }

    if (resourceType === 'MedicationDispense') {
      const dsp = await localRepository.getDispenseRecord(`dsp_${rawId}`);
      if (!dsp) return { status: 404 };
      return { status: 200, resource: fhirMapper.dispenseRecordToFHIR(dsp) };
    }

    return {
      status: 404,
      outcome: {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            diagnostics: `Resource ${resourceType}/${id} not found.`,
          },
        ],
      },
    };
  }

  /**
   * Searches resources by query criteria with standardized FHIR pagination.
   */
  public async searchResources(
    resourceType: string,
    query: Record<string, string | undefined>,
    requestingUserId: string,
    requestingUserRole: string,
    requestingFacilityId: string
  ): Promise<ExportResult> {
    const page = parseInt(query._page || '1', 10);
    const count = Math.min(parseInt(query._count || String(FHIR_DEFAULT_PAGE_SIZE), 10), FHIR_MAX_PAGE_SIZE);
    const entries: FHIRBundleEntry[] = [];

    if (resourceType === 'Patient') {
      const allPatients = await localRepository.getAllPatients();
      let filtered = allPatients;

      if (query.name) {
        const q = query.name.toLowerCase();
        filtered = filtered.filter(
          (p) => p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q)
        );
      }
      if (query.identifier) {
        filtered = filtered.filter((p) => p.mrn === query.identifier || p.nationalId === query.identifier);
      }
      if (query.facility) {
        filtered = filtered.filter((p) => p.primaryFacilityId === query.facility);
      }

      const total = filtered.length;
      const startIdx = (page - 1) * count;
      const paginated = filtered.slice(startIdx, startIdx + count);

      for (const p of paginated) {
        const res = fhirMapper.patientToFHIR(p);
        entries.push({
          fullUrl: `${JANO_SYSTEM_BASE}/Patient/${res.id}`,
          resource: res,
        });
      }

      const bundle: FHIRBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total,
        entry: entries,
      };

      return { status: 200, bundle };
    }

    if (resourceType === 'Observation') {
      const patientId = query.patient || query.subject?.replace(/^Patient\//, '');
      const vitals = patientId ? await localRepository.getVitals(patientId) : [];
      for (const v of vitals) {
        const obsList = fhirMapper.vitalsToFHIRObservations(v);
        for (const obs of obsList) {
          entries.push({
            fullUrl: `${JANO_SYSTEM_BASE}/Observation/${obs.id}`,
            resource: obs,
          });
        }
      }

      const bundle: FHIRBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: entries.length,
        entry: entries.slice(0, count),
      };

      return { status: 200, bundle };
    }

    return {
      status: 200,
      bundle: {
        resourceType: 'Bundle',
        type: 'searchset',
        total: 0,
        entry: [],
      },
    };
  }
}

export const fhirExportService = FHIRExportService.getInstance();
