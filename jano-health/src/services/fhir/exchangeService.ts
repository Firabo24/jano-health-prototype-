/**
 * Jano Health - FHIR R5 Exchange Service (Interoperability Engine Facade)
 * Coordinates high-level FHIR RESTful interactions, bundle batch/transaction processing,
 * rate limiting, and tenant boundary enforcement.
 */

import { FHIR_VERSION } from './constants';
import { Resource, FHIRBundle, FHIROperationOutcome, FHIRCapabilityStatement } from './types';
import { fhirImportService, ImportOperationResult } from './importService';
import { fhirExportService, ExportResult, ExportPatientOptions } from './exportService';
import { getCapabilityStatement } from './capabilityStatement';
import { FHIRSerializer } from './serializer';
import { fhirValidator } from './validation';

export class FHIRExchangeService {
  private static instance: FHIRExchangeService;

  private constructor() {}

  public static getInstance(): FHIRExchangeService {
    if (!FHIRExchangeService.instance) {
      FHIRExchangeService.instance = new FHIRExchangeService();
    }
    return FHIRExchangeService.instance;
  }

  /**
   * Returns authoritative FHIR R5 CapabilityStatement for GET /fhir/metadata.
   */
  public getMetadata(): FHIRCapabilityStatement {
    return getCapabilityStatement();
  }

  /**
   * Executes a Patient $export operation.
   */
  public async exportPatient(options: ExportPatientOptions): Promise<ExportResult> {
    return fhirExportService.exportPatientEverything(options);
  }

  /**
   * Reads a single resource by Type and ID.
   */
  public async getResource(
    resourceType: string,
    id: string,
    userId: string,
    userRole: string,
    facilityId: string
  ): Promise<ExportResult> {
    return fhirExportService.readResource(resourceType, id, userId, userRole, facilityId);
  }

  /**
   * Searches resources by query parameters.
   */
  public async searchResources(
    resourceType: string,
    query: Record<string, string | undefined>,
    userId: string,
    userRole: string,
    facilityId: string
  ): Promise<ExportResult> {
    return fhirExportService.searchResources(resourceType, query, userId, userRole, facilityId);
  }

  /**
   * Ingests an inbound resource or transaction bundle.
   */
  public async processInbound(
    payload: unknown,
    sourceSystemId: string,
    facilityId: string,
    userId: string,
    userRole: string
  ): Promise<ImportOperationResult> {
    return fhirImportService.importPayload(payload, {
      sourceSystemId,
      receivingFacilityId: facilityId,
      importingUserId: userId,
      importingUserRole: userRole,
    });
  }

  /**
   * Serializes any FHIR resource or outcome to standard JSON string.
   */
  public serialize(resource: Resource, pretty = false): string {
    return FHIRSerializer.serialize(resource, pretty);
  }

  /**
   * Deserializes JSON string to typed resource with validation.
   */
  public deserialize<T extends Resource = Resource>(rawJson: string) {
    return FHIRSerializer.deserialize<T>(rawJson);
  }

  /**
   * Validates a resource or bundle against FHIR R5 constraints.
   */
  public validate(resource: unknown) {
    return fhirValidator.validate(resource);
  }
}

export const fhirExchangeService = FHIRExchangeService.getInstance();
