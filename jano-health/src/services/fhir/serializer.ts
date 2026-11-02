/**
 * Jano Health - FHIR R5 Serializer & Deserializer
 * Handles standards-compliant JSON encoding and parsing with version assertions.
 */

import { FHIR_VERSION } from './constants';
import { Resource, FHIROperationOutcome } from './types';
import { fhirValidator } from './validation';

export class FHIRSerializer {
  /**
   * Serializes a FHIR resource or Bundle into conformant JSON.
   */
  public static serialize(resource: Resource, pretty: boolean = false): string {
    return JSON.stringify(resource, null, pretty ? 2 : undefined);
  }

  /**
   * Deserializes raw JSON string into a validated FHIR resource.
   */
  public static deserialize<T extends Resource = Resource>(rawJson: string): {
    resource?: T;
    outcome?: FHIROperationOutcome;
    isValid: boolean;
  } {
    try {
      const parsed = JSON.parse(rawJson);
      const validation = fhirValidator.validate(parsed);

      if (!validation.isValid) {
        return {
          outcome: validation.outcome,
          isValid: false,
        };
      }

      return {
        resource: parsed as T,
        outcome: validation.outcome,
        isValid: true,
      };
    } catch (err: any) {
      const outcome: FHIROperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'fatal',
            code: 'invalid',
            diagnostics: `Malformed JSON payload: ${err?.message || 'Syntax error'}`,
          },
        ],
      };
      return {
        outcome,
        isValid: false,
      };
    }
  }

  /**
   * Returns standard FHIR R5 Content-Type header.
   */
  public static getContentTypeHeader(): string {
    return `application/fhir+json; fhirVersion=${FHIR_VERSION}`;
  }
}
