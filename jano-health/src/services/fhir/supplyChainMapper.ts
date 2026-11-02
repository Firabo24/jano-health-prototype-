/**
 * Jano Health - Clinical Core V17: FHIR R5 Supply Chain Mapper
 * 
 * Maps internal requisitions, purchase orders, shipments, and goods receipts
 * to HL7 FHIR R5 resources (SupplyRequest, SupplyDelivery, Location).
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - FHIR Resource ≠ Internal Domain Model: Decoupled translation boundaries.
 * - Conformance validation returns FHIROperationOutcome on malformed resources.
 * - Does NOT claim full FHIR conformance without verifiable structural validation.
 */

import {
  FHIRSupplyRequest,
  FHIRSupplyDelivery,
  FHIRLocation,
  FHIROperationOutcome,
} from './types';
import {
  Requisition,
  PurchaseOrder,
  Shipment,
  GoodsReceipt,
  Warehouse,
} from '../../domain/v17SupplyChainTypes';

export class FHIRSupplyChainMapper {
  /**
   * Maps a Requisition to a FHIR R5 SupplyRequest resource.
   */
  public static requisitionToFHIR(requisition: Requisition): FHIRSupplyRequest {
    let status: FHIRSupplyRequest['status'] = 'draft';
    if (requisition.status === 'APPROVED') status = 'active';
    else if (requisition.status === 'CANCELLED' || requisition.status === 'REJECTED') status = 'cancelled';
    else if (requisition.status === 'FULFILLED' || requisition.status === 'CLOSED') status = 'completed';

    const totalQty = requisition.lines.reduce((acc, l) => acc + l.quantityRequested, 0);

    return {
      resourceType: 'SupplyRequest',
      id: requisition.requisitionId,
      identifier: [
        {
          system: 'https://janohealth.org/supply/requisitions',
          value: requisition.requisitionId,
        },
      ],
      status,
      priority: requisition.priority === 'CRITICAL' ? 'stat' : requisition.priority === 'HIGH' ? 'urgent' : 'routine',
      quantity: {
        value: totalQty,
        unit: requisition.lines[0]?.unit || 'ITEMS',
      },
      authoredOn: requisition.requestedAt,
      requester: {
        reference: `Practitioner/${requisition.requesterId}`,
      },
      deliverTo: {
        reference: `Location/${requisition.facilityId}`,
      },
    };
  }

  /**
   * Maps a PurchaseOrder to a FHIR R5 SupplyRequest resource.
   */
  public static purchaseOrderToFHIR(po: PurchaseOrder): FHIRSupplyRequest {
    let status: FHIRSupplyRequest['status'] = 'active';
    if (po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL') status = 'draft';
    else if (po.status === 'CANCELLED') status = 'cancelled';
    else if (po.status === 'FULFILLED' || po.status === 'CLOSED') status = 'completed';

    const totalQty = po.lines.reduce((acc, l) => acc + l.orderedQuantity, 0);

    return {
      resourceType: 'SupplyRequest',
      id: po.purchaseOrderId,
      identifier: [
        {
          system: 'https://janohealth.org/procurement/orders',
          value: po.orderNumber,
        },
      ],
      status,
      quantity: {
        value: totalQty,
        unit: po.lines[0]?.unit || 'ITEMS',
      },
      authoredOn: po.provenance.createdAt,
      supplier: [
        {
          reference: `Organization/${po.supplierId}`,
        },
      ],
      deliverTo: {
        reference: `Location/${po.facilityId}`,
      },
    };
  }

  /**
   * Maps a Shipment to a FHIR R5 SupplyDelivery resource.
   */
  public static shipmentToFHIR(shipment: Shipment): FHIRSupplyDelivery {
    let status: FHIRSupplyDelivery['status'] = 'in-progress';
    if (shipment.status === 'RECEIVED') status = 'completed';
    else if (shipment.status === 'REJECTED' || shipment.status === 'LOST') status = 'abandoned';

    const totalQty = shipment.lines.reduce((acc, l) => acc + l.quantity, 0);

    return {
      resourceType: 'SupplyDelivery',
      id: shipment.shipmentId,
      identifier: [
        {
          system: 'https://janohealth.org/logistics/shipments',
          value: shipment.shipmentId,
        },
      ],
      basedOn: [
        {
          reference: `SupplyRequest/${shipment.purchaseOrderReference}`,
        },
      ],
      status,
      suppliedItem: {
        quantity: {
          value: totalQty,
          unit: shipment.lines[0]?.unit || 'ITEMS',
        },
      },
      occurrenceDateTime: shipment.dispatchAt,
      destination: {
        reference: `Location/${shipment.destinationFacilityId}`,
      },
    };
  }

  /**
   * Maps a GoodsReceipt to a FHIR R5 SupplyDelivery resource.
   */
  public static goodsReceiptToFHIR(receipt: GoodsReceipt): FHIRSupplyDelivery {
    let status: FHIRSupplyDelivery['status'] = 'completed';
    if (receipt.status === 'REJECTED') status = 'abandoned';

    const totalAccepted = receipt.lines.reduce((acc, l) => acc + l.acceptedQuantity, 0);

    return {
      resourceType: 'SupplyDelivery',
      id: receipt.goodsReceiptId,
      identifier: [
        {
          system: 'https://janohealth.org/logistics/receipts',
          value: receipt.receiptNumber,
        },
      ],
      basedOn: [
        {
          reference: `SupplyRequest/${receipt.purchaseOrderReference}`,
        },
      ],
      status,
      suppliedItem: {
        quantity: {
          value: totalAccepted,
        },
      },
      occurrenceDateTime: receipt.receivedAt,
      destination: {
        reference: `Location/${receipt.warehouseId}`,
      },
      receiver: [
        {
          reference: `Practitioner/${receipt.receivedBy}`,
        },
      ],
    };
  }

  /**
   * Maps a Warehouse to a FHIR R5 Location resource.
   */
  public static warehouseToFHIR(warehouse: Warehouse): FHIRLocation {
    return {
      resourceType: 'Location',
      id: warehouse.warehouseId,
      identifier: [
        {
          system: 'https://janohealth.org/warehouses',
          value: warehouse.warehouseId,
        },
      ],
      status: warehouse.status === 'ACTIVE' ? 'active' : 'suspended',
      name: warehouse.name,
      managingOrganization: {
        reference: `Organization/${warehouse.facilityId}`,
      },
    };
  }

  /**
   * Validates structural conformance of a supply-chain FHIR resource.
   */
  public static validateResource(resource: any): {
    valid: boolean;
    outcome?: FHIROperationOutcome;
  } {
    if (!resource || typeof resource !== 'object') {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: 'Resource is null or not an object.',
            },
          ],
        },
      };
    }

    const validTypes = ['SupplyRequest', 'SupplyDelivery', 'Location'];
    if (!validTypes.includes(resource.resourceType)) {
      return {
        valid: false,
        outcome: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              severity: 'error',
              code: 'invalid',
              diagnostics: `Unsupported resourceType '${resource.resourceType}'. Expected one of: ${validTypes.join(', ')}.`,
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

  public static validateSupplyResource(resource: any): {
    valid: boolean;
    outcome?: FHIROperationOutcome;
  } {
    return this.validateResource(resource);
  }
}
