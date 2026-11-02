/**
 * Jano Health - FHIR R5 Financial & Consent Mapper
 * Clinical Core V15: Mapping internal Consent and Health Financing entities to FHIR R5
 */

import { PatientConsent } from '../../domain/consentTypes';
import { Claim, Coverage, Invoice, Payment } from '../../domain/financingTypes';
import {
  FHIRAccount,
  FHIRClaim,
  FHIRClaimResponse,
  FHIRConsent,
  FHIRCoverage,
  FHIRExplanationOfBenefit,
  FHIRInvoice,
  FHIROperationOutcome,
  FHIRPaymentNotice,
} from './types';

export class FHIRFinancialMapper {
  /**
   * Maps internal PatientConsent to FHIR R5 Consent.
   */
  public static toFHIRConsent(consent: PatientConsent): FHIRConsent {
    return {
      resourceType: 'Consent',
      id: consent.consentId,
      status: consent.status === 'ACTIVE' ? 'active' : consent.status === 'REVOKED' ? 'inactive' : 'draft',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
              code: 'INFA',
              display: 'Information Access',
            },
          ],
        },
      ],
      subject: {
        reference: `Patient/${consent.patientId}`,
      },
      date: consent.grantedAt,
      period: {
        start: consent.effectivePeriod.start,
        end: consent.effectivePeriod.end,
      },
      decision: consent.status === 'ACTIVE' ? 'permit' : 'deny',
      provision: {
        period: {
          start: consent.effectivePeriod.start,
          end: consent.effectivePeriod.end,
        },
        purpose: consent.purposes.map((p) => ({
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
          code: p,
          display: p.replace('_', ' '),
        })),
        action: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/consentaction',
                code: 'access',
                display: 'Access',
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Maps internal Coverage to FHIR R5 Coverage.
   */
  public static toFHIRCoverage(coverage: Coverage): FHIRCoverage {
    return {
      resourceType: 'Coverage',
      id: coverage.coverageId,
      status: coverage.status === 'ACTIVE' ? 'active' : 'draft',
      kind: 'insurance',
      beneficiary: {
        reference: `Patient/${coverage.patientId}`,
      },
      period: {
        start: coverage.effectiveFrom,
        end: coverage.effectiveTo,
      },
      insurer: {
        reference: `Organization/${coverage.payerId}`,
      },
      class: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/coverage-class',
                code: 'plan',
                display: coverage.coverageClass,
              },
            ],
          },
          value: {
            value: coverage.memberReference,
          },
          name: coverage.benefitReference.planName,
        },
      ],
    };
  }

  /**
   * Maps internal Claim to FHIR R5 Claim.
   */
  public static toFHIRClaim(claim: Claim): FHIRClaim {
    return {
      resourceType: 'Claim',
      id: claim.claimId,
      identifier: [
        {
          system: 'urn:jano:claim-number',
          value: claim.claimNumber,
        },
      ],
      status: claim.status === 'VOIDED' ? 'cancelled' : 'active',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'institutional',
            display: 'Institutional',
          },
        ],
      },
      use: 'claim',
      patient: {
        reference: `Patient/${claim.patientId}`,
      },
      created: claim.createdAt,
      insurer: {
        reference: `Organization/${claim.payerId}`,
      },
      provider: {
        reference: `Organization/${claim.facilityId}`,
      },
      insurance: [
        {
          sequence: 1,
          focal: true,
          coverage: {
            reference: `Coverage/${claim.coverageId}`,
          },
        },
      ],
      item: claim.claimLines.map((line) => ({
        sequence: line.lineNumber,
        productOrService: {
          coding: [
            {
              system: 'urn:jano:service-code',
              code: line.serviceCode,
              display: line.serviceDescription,
            },
          ],
        },
        unitPrice: {
          value: line.unitAmount,
          currency: 'TZS',
        },
        net: {
          value: line.submittedAmount,
          currency: 'TZS',
        },
      })),
      total: {
        value: claim.submittedAmount,
        currency: 'TZS',
      },
    };
  }

  /**
   * Maps internal Invoice to FHIR R5 Invoice.
   */
  public static toFHIRInvoice(invoice: Invoice): FHIRInvoice {
    return {
      resourceType: 'Invoice',
      id: invoice.invoiceId,
      identifier: [
        {
          system: 'urn:jano:invoice-number',
          value: invoice.invoiceNumber,
        },
      ],
      status: invoice.status === 'SETTLED' ? 'balanced' : invoice.status === 'VOIDED' ? 'cancelled' : 'issued',
      subject: {
        reference: `Patient/${invoice.patientId}`,
      },
      date: invoice.issuedAt,
      totalNet: {
        value: invoice.totalAmount,
        currency: 'TZS',
      },
      totalGross: {
        value: invoice.totalAmount,
        currency: 'TZS',
      },
      lineItem: invoice.lineItems.map((item, idx) => ({
        sequence: idx + 1,
        chargeItemCodeableConcept: {
          text: item.description,
        },
        priceComponent: [
          {
            amount: {
              value: item.totalPrice,
              currency: 'TZS',
            },
          },
        ],
      })),
    };
  }

  /**
   * Maps internal Claim adjudication to FHIR R5 ClaimResponse.
   */
  public static toFHIRClaimResponse(claim: Claim): FHIRClaimResponse {
    const outcome =
      claim.status === 'PAID'
        ? 'complete'
        : claim.status === 'PARTIALLY_PAID'
        ? 'partial'
        : claim.status === 'DENIED'
        ? 'error'
        : 'queued';

    return {
      resourceType: 'ClaimResponse',
      id: `resp_${claim.claimId}`,
      identifier: [
        {
          system: 'urn:jano:claim-response-id',
          value: `RESP-${claim.claimNumber}`,
        },
      ],
      status: 'active',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'institutional',
            display: 'Institutional',
          },
        ],
      },
      use: 'claim',
      patient: {
        reference: `Patient/${claim.patientId}`,
      },
      created: claim.updatedAt || claim.createdAt,
      insurer: {
        reference: `Organization/${claim.payerId}`,
      },
      outcome,
      adjudication: [
        {
          category: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/adjudication',
                code: 'benefit',
                display: 'Benefit Amount',
              },
            ],
          },
          amount: {
            value: claim.approvedAmount || 0,
            currency: 'TZS',
          },
        },
        {
          category: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/adjudication',
                code: 'copay',
                display: 'Patient Copay Responsibility',
              },
            ],
          },
          amount: {
            value: claim.patientResponsibility,
            currency: 'TZS',
          },
        },
      ],
    };
  }

  /**
   * Maps internal Payment to FHIR R5 PaymentNotice.
   */
  public static toFHIRPaymentNotice(payment: Payment): FHIRPaymentNotice {
    return {
      resourceType: 'PaymentNotice',
      id: payment.paymentId,
      identifier: [
        {
          system: 'urn:jano:receipt-number',
          value: payment.receiptNumber,
        },
      ],
      status: payment.status === 'RECEIVED' ? 'active' : payment.status === 'REVERSED' ? 'cancelled' : 'draft',
      created: payment.timestamp,
      recipient: {
        reference: `Organization/${payment.provenance.facilityId}`,
      },
      amount: {
        value: payment.amount,
        currency: payment.currency || 'TZS',
      },
      paymentStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/paymentstatus',
            code: payment.status === 'RECEIVED' ? 'paid' : payment.status.toLowerCase(),
            display: payment.status,
          },
        ],
      },
    };
  }

  /**
   * Maps patient coverage/balance to FHIR R5 Account.
   */
  public static toFHIRAccount(patientId: string, coverage?: Coverage, balance: number = 0): FHIRAccount {
    return {
      resourceType: 'Account',
      id: `acc_${patientId}`,
      status: 'active',
      name: `Patient Financial Account for ${patientId}`,
      subject: [
        {
          reference: `Patient/${patientId}`,
        },
      ],
      coverage: coverage
        ? [
            {
              coverage: {
                reference: `Coverage/${coverage.coverageId}`,
              },
              priority: 1,
            },
          ]
        : [],
      balance: [
        {
          aggregate: {
            value: balance,
            currency: 'TZS',
          },
          term: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/account-balance-term',
                code: 'current',
                display: 'Current Balance',
              },
            ],
          },
        },
      ],
    };
  }

  /**
   * Maps claim and coverage to FHIR R5 ExplanationOfBenefit.
   */
  public static toFHIRExplanationOfBenefit(claim: Claim, coverage?: Coverage): FHIRExplanationOfBenefit {
    return {
      resourceType: 'ExplanationOfBenefit',
      id: `eob_${claim.claimId}`,
      identifier: [
        {
          system: 'urn:jano:eob-id',
          value: `EOB-${claim.claimNumber}`,
        },
      ],
      status: 'active',
      type: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/claim-type',
            code: 'institutional',
            display: 'Institutional',
          },
        ],
      },
      use: 'claim',
      patient: {
        reference: `Patient/${claim.patientId}`,
      },
      created: claim.updatedAt || claim.createdAt,
      insurer: {
        reference: `Organization/${claim.payerId}`,
      },
      provider: {
        reference: `Organization/${claim.facilityId}`,
      },
      outcome: claim.status === 'PAID' ? 'complete' : claim.status === 'DENIED' ? 'error' : 'partial',
      claim: {
        reference: `Claim/${claim.claimId}`,
      },
      insurance: [
        {
          focal: true,
          coverage: {
            reference: `Coverage/${claim.coverageId}`,
          },
        },
      ],
      total: [
        {
          category: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/adjudication',
                code: 'submitted',
                display: 'Submitted Amount',
              },
            ],
          },
          amount: {
            value: claim.submittedAmount,
            currency: 'TZS',
          },
        },
        {
          category: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/adjudication',
                code: 'benefit',
                display: 'Benefit Payable',
              },
            ],
          },
          amount: {
            value: claim.approvedAmount || 0,
            currency: 'TZS',
          },
        },
      ],
    };
  }

  /**
   * Validates a FHIR financial resource, producing OperationOutcome if non-conforming.
   */
  public static validateFinancialResource(resource: any): { valid: boolean; outcome?: FHIROperationOutcome } {
    if (!resource || !resource.resourceType) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Resource missing required resourceType property.',
            },
          ],
        },
      };
    }

    const supportedFinancialTypes = [
      'Consent',
      'Coverage',
      'Claim',
      'ClaimResponse',
      'Invoice',
      'PaymentNotice',
      'Account',
      'ExplanationOfBenefit',
    ];

    if (!supportedFinancialTypes.includes(resource.resourceType)) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'not-supported',
              diagnostics: `Resource type '${resource.resourceType}' is not supported in V15 financial mapper.`,
            },
          ],
        },
      };
    }

    if (!resource.id) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: `Missing required logical id on FHIR ${resource.resourceType}.`,
            },
          ],
        },
      };
    }

    return { valid: true };
  }
}
