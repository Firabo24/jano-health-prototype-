/**
 * Jano Health - FHIR R5 Structural & Semantic Validator
 * Enforces FHIR R5 schema constraints, datatype integrity, and generates compliant OperationOutcomes.
 * 
 * SECURITY INVARIANT:
 * Diagnostics in OperationOutcome must NEVER leak passwords, bearer tokens, stack traces,
 * database connection details, or unnecessary PHI.
 */

import { FHIR_VERSION } from './constants';
import { Resource, FHIROperationOutcome, FHIROperationOutcomeIssue } from './types';

export interface ValidationResult {
  isValid: boolean;
  issues: FHIROperationOutcomeIssue[];
  outcome: FHIROperationOutcome;
}

export class FHIRValidator {
  private static instance: FHIRValidator;

  private supportedResources = new Set<string>([
    'Patient',
    'Encounter',
    'Practitioner',
    'PractitionerRole',
    'Organization',
    'Location',
    'Observation',
    'Condition',
    'AllergyIntolerance',
    'ServiceRequest',
    'Specimen',
    'DiagnosticReport',
    'ImagingStudy',
    'Medication',
    'MedicationRequest',
    'MedicationDispense',
    'Task',
    'DocumentReference',
    'Provenance',
    'AuditEvent',
    'Bundle',
    'CapabilityStatement',
    'OperationOutcome',
  ]);

  private constructor() {}

  public static getInstance(): FHIRValidator {
    if (!FHIRValidator.instance) {
      FHIRValidator.instance = new FHIRValidator();
    }
    return FHIRValidator.instance;
  }

  /**
   * Primary validator for inbound FHIR resources and bundles.
   */
  public validate(resource: unknown): ValidationResult {
    const issues: FHIROperationOutcomeIssue[] = [];

    if (!resource || typeof resource !== 'object') {
      issues.push({
        severity: 'fatal',
        code: 'invalid',
        diagnostics: 'Payload is null, empty, or not a valid JSON object.',
      });
      return this.buildResult(issues);
    }

    const res = resource as Partial<Resource>;

    // 1. Validate resourceType
    if (!res.resourceType || typeof res.resourceType !== 'string') {
      issues.push({
        severity: 'fatal',
        code: 'invalid',
        diagnostics: 'Resource is missing required root "resourceType" property.',
        location: ['resourceType'],
      });
      return this.buildResult(issues);
    }

    if (!this.supportedResources.has(res.resourceType)) {
      issues.push({
        severity: 'error',
        code: 'not-supported',
        diagnostics: `Resource type "${res.resourceType}" is not supported in Jano FHIR R5 scope.`,
        location: ['resourceType'],
      });
      return this.buildResult(issues);
    }

    // 2. Validate FHIR Version declaration in meta if provided
    if (res.meta?.profile) {
      for (const profile of res.meta.profile) {
        if (profile.includes('/r4/') || profile.includes('/r4b/') || profile.includes('/r6/')) {
          issues.push({
            severity: 'error',
            code: 'not-supported',
            diagnostics: `Target profile "${profile}" indicates an unsupported FHIR version. Jano exclusively accepts FHIR R5 (${FHIR_VERSION}).`,
            location: ['meta.profile'],
          });
        }
      }
    }

    // 3. Resource-Specific Schema Validations
    switch (res.resourceType) {
      case 'Patient':
        this.validatePatient(resource, issues);
        break;
      case 'Encounter':
        this.validateEncounter(resource, issues);
        break;
      case 'Observation':
        this.validateObservation(resource, issues);
        break;
      case 'Condition':
        this.validateCondition(resource, issues);
        break;
      case 'AllergyIntolerance':
        this.validateAllergyIntolerance(resource, issues);
        break;
      case 'ServiceRequest':
        this.validateServiceRequest(resource, issues);
        break;
      case 'DiagnosticReport':
        this.validateDiagnosticReport(resource, issues);
        break;
      case 'ImagingStudy':
        this.validateImagingStudy(resource, issues);
        break;
      case 'MedicationRequest':
        this.validateMedicationRequest(resource, issues);
        break;
      case 'MedicationDispense':
        this.validateMedicationDispense(resource, issues);
        break;
      case 'Task':
        this.validateTask(resource, issues);
        break;
      case 'DocumentReference':
        this.validateDocumentReference(resource, issues);
        break;
      case 'Provenance':
        this.validateProvenance(resource, issues);
        break;
      case 'AuditEvent':
        this.validateAuditEvent(resource, issues);
        break;
      case 'Bundle':
        this.validateBundle(resource, issues);
        break;
    }

    return this.buildResult(issues);
  }

  private validatePatient(p: any, issues: FHIROperationOutcomeIssue[]): void {
    if (p.name && !Array.isArray(p.name)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Patient.name must be an array of HumanName elements.',
        location: ['Patient.name'],
      });
    }
    if (p.active !== undefined && typeof p.active !== 'boolean') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Patient.active must be a boolean.',
        location: ['Patient.active'],
      });
    }
    if (p.gender && !['male', 'female', 'other', 'unknown'].includes(p.gender)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `Invalid Patient.gender "${p.gender}". Must be male, female, other, or unknown.`,
        location: ['Patient.gender'],
      });
    }
    if (p.birthDate && typeof p.birthDate === 'string' && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(p.birthDate)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Patient.birthDate format must be YYYY, YYYY-MM, or YYYY-MM-DD.',
        location: ['Patient.birthDate'],
      });
    }
  }

  private validateEncounter(e: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = [
      'planned',
      'in-progress',
      'on-hold',
      'discharged',
      'completed',
      'cancelled',
      'discontinued',
      'entered-in-error',
      'unknown',
    ];
    if (!e.status || !validStatuses.includes(e.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `Encounter.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['Encounter.status'],
      });
    }
  }

  private validateObservation(o: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = [
      'registered',
      'preliminary',
      'final',
      'amended',
      'corrected',
      'cancelled',
      'entered-in-error',
      'unknown',
    ];
    if (!o.status || !validStatuses.includes(o.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `Observation.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['Observation.status'],
      });
    }
    if (!o.code || typeof o.code !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Observation.code is required as a CodeableConcept.',
        location: ['Observation.code'],
      });
    }
  }

  private validateCondition(c: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!c.clinicalStatus || typeof c.clinicalStatus !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Condition.clinicalStatus is required as a CodeableConcept.',
        location: ['Condition.clinicalStatus'],
      });
    }
    if (!c.code || typeof c.code !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Condition.code is required as a CodeableConcept.',
        location: ['Condition.code'],
      });
    }
    if (!c.subject || typeof c.subject !== 'object' || !c.subject.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Condition.subject is required as a valid patient Reference.',
        location: ['Condition.subject'],
      });
    }
  }

  private validateAllergyIntolerance(a: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!a.code || typeof a.code !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'AllergyIntolerance.code is required as a CodeableConcept.',
        location: ['AllergyIntolerance.code'],
      });
    }
    if (!a.patient || typeof a.patient !== 'object' || !a.patient.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'AllergyIntolerance.patient is required as a valid patient Reference.',
        location: ['AllergyIntolerance.patient'],
      });
    }
  }

  private validateServiceRequest(sr: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'];
    if (!sr.status || !validStatuses.includes(sr.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `ServiceRequest.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['ServiceRequest.status'],
      });
    }
    const validIntents = [
      'proposal',
      'plan',
      'directive',
      'order',
      'original-order',
      'reflex-order',
      'filler-order',
      'instance-order',
      'option',
    ];
    if (!sr.intent || !validIntents.includes(sr.intent)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `ServiceRequest.intent is required and must be one of: ${validIntents.join(', ')}.`,
        location: ['ServiceRequest.intent'],
      });
    }
    if (!sr.subject || typeof sr.subject !== 'object' || !sr.subject.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'ServiceRequest.subject is required as a valid patient Reference.',
        location: ['ServiceRequest.subject'],
      });
    }
  }

  private validateDiagnosticReport(dr: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = [
      'registered',
      'partial',
      'preliminary',
      'final',
      'amended',
      'corrected',
      'appended',
      'cancelled',
      'entered-in-error',
      'unknown',
    ];
    if (!dr.status || !validStatuses.includes(dr.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `DiagnosticReport.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['DiagnosticReport.status'],
      });
    }
    if (!dr.code || typeof dr.code !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'DiagnosticReport.code is required as a CodeableConcept.',
        location: ['DiagnosticReport.code'],
      });
    }
  }

  private validateImagingStudy(is: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = ['registered', 'available', 'cancelled', 'entered-in-error', 'unknown'];
    if (!is.status || !validStatuses.includes(is.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `ImagingStudy.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['ImagingStudy.status'],
      });
    }
    if (!is.subject || typeof is.subject !== 'object' || !is.subject.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'ImagingStudy.subject is required as a valid patient Reference.',
        location: ['ImagingStudy.subject'],
      });
    }
  }

  private validateMedicationRequest(mr: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = [
      'active',
      'on-hold',
      'ended',
      'stopped',
      'completed',
      'cancelled',
      'entered-in-error',
      'draft',
      'unknown',
    ];
    if (!mr.status || !validStatuses.includes(mr.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `MedicationRequest.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['MedicationRequest.status'],
      });
    }
    if (!mr.intent) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'MedicationRequest.intent is required.',
        location: ['MedicationRequest.intent'],
      });
    }
    if (!mr.medication || typeof mr.medication !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'MedicationRequest.medication is required (concept or reference).',
        location: ['MedicationRequest.medication'],
      });
    }
    if (!mr.subject || typeof mr.subject !== 'object' || !mr.subject.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'MedicationRequest.subject is required as a valid patient Reference.',
        location: ['MedicationRequest.subject'],
      });
    }
  }

  private validateMedicationDispense(md: any, issues: FHIROperationOutcomeIssue[]): void {
    const validStatuses = [
      'preparation',
      'in-progress',
      'cancelled',
      'on-hold',
      'completed',
      'entered-in-error',
      'stopped',
      'declined',
      'unknown',
    ];
    if (!md.status || !validStatuses.includes(md.status)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `MedicationDispense.status is required and must be one of: ${validStatuses.join(', ')}.`,
        location: ['MedicationDispense.status'],
      });
    }
    if (!md.medication || typeof md.medication !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'MedicationDispense.medication is required.',
        location: ['MedicationDispense.medication'],
      });
    }
    if (!md.subject || typeof md.subject !== 'object' || !md.subject.reference) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'MedicationDispense.subject is required as a valid patient Reference.',
        location: ['MedicationDispense.subject'],
      });
    }
  }

  private validateTask(t: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!t.status) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Task.status is required.',
        location: ['Task.status'],
      });
    }
    if (!t.intent) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Task.intent is required.',
        location: ['Task.intent'],
      });
    }
  }

  private validateDocumentReference(dr: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!dr.status) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'DocumentReference.status is required.',
        location: ['DocumentReference.status'],
      });
    }
    if (!Array.isArray(dr.content) || dr.content.length === 0) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'DocumentReference.content is required with at least one attachment.',
        location: ['DocumentReference.content'],
      });
    }
  }

  private validateProvenance(p: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!Array.isArray(p.target) || p.target.length === 0) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Provenance.target is required with at least one target reference.',
        location: ['Provenance.target'],
      });
    }
    if (!p.recorded) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Provenance.recorded is required timestamp.',
        location: ['Provenance.recorded'],
      });
    }
    if (!Array.isArray(p.agent) || p.agent.length === 0) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Provenance.agent is required with at least one participating agent.',
        location: ['Provenance.agent'],
      });
    }
  }

  private validateAuditEvent(ae: any, issues: FHIROperationOutcomeIssue[]): void {
    if (!ae.type) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'AuditEvent.type is required.',
        location: ['AuditEvent.type'],
      });
    }
    if (!ae.occurredDateTime && !ae.recorded) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'AuditEvent requires occurredDateTime or recorded timestamp.',
        location: ['AuditEvent.occurredDateTime'],
      });
    }
  }

  private validateBundle(b: any, issues: FHIROperationOutcomeIssue[]): void {
    const validBundleTypes = [
      'document',
      'message',
      'transaction',
      'transaction-response',
      'batch',
      'batch-response',
      'history',
      'searchset',
      'collection',
    ];
    if (!b.type || !validBundleTypes.includes(b.type)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: `Bundle.type is required and must be one of: ${validBundleTypes.join(', ')}.`,
        location: ['Bundle.type'],
      });
    }
    if (b.entry && !Array.isArray(b.entry)) {
      issues.push({
        severity: 'error',
        code: 'invalid',
        diagnostics: 'Bundle.entry must be an array of entries.',
        location: ['Bundle.entry'],
      });
    }
  }

  private buildResult(issues: FHIROperationOutcomeIssue[]): ValidationResult {
    const hasError = issues.some((i) => i.severity === 'error' || i.severity === 'fatal');
    const outcome: FHIROperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: issues.length > 0 ? issues : [
        {
          severity: 'information',
          code: 'informational',
          diagnostics: 'Resource validated successfully against FHIR R5 schemas.',
        },
      ],
    };

    return {
      isValid: !hasError,
      issues,
      outcome,
    };
  }
}

export const fhirValidator = FHIRValidator.getInstance();
