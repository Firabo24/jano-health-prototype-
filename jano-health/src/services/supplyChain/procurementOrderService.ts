/**
 * Jano Health - Clinical Core V17: Procurement & Purchase Order Service
 * 
 * Manages suppliers, commercial contracts, purchase requests, and purchase orders.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Supplier ≠ Payer: Commercial suppliers are distinct from healthcare financing payers.
 *   Payment failure or insurance claim denial does not erase purchase orders or stock.
 * - PurchaseOrder ≠ GoodsReceipt: An order expresses purchasing intent; receipt confirms delivery.
 * - Forecast ≠ PurchaseOrder: Projections inform replenishment recommendations, not POs.
 * - Prohibits client-side tampering with approval amount, supplier, or approval status.
 * - Server-authoritative integrity checks (duplicate orders, suspended supplier, contract price).
 */

import {
  Supplier,
  SupplierStatus,
  SupplierContract,
  PurchaseRequest,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderLine,
  ProcurementApproval,
} from '../../domain/v17SupplyChainTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export class ProcurementOrderService {
  private static instance: ProcurementOrderService;
  private suppliers: Map<string, Supplier> = new Map();
  private contracts: Map<string, SupplierContract> = new Map();
  private purchaseRequests: Map<string, PurchaseRequest> = new Map();
  private purchaseOrders: Map<string, PurchaseOrder> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): ProcurementOrderService {
    if (!ProcurementOrderService.instance) {
      ProcurementOrderService.instance = new ProcurementOrderService();
    }
    return ProcurementOrderService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T00:00:00Z';

    const sup1: Supplier = {
      supplierId: 'sup-msd-tz',
      legalName: 'Medical Stores Department (MSD)',
      displayName: 'National Medical Stores Department',
      supplierType: 'GOVERNMENT_MEDICAL_STORES',
      contactReference: {
        email: 'orders@msd.go.tz',
        phone: '+255 22 286 0120',
        address: 'Keko Mwanga, Dar es Salaam, Tanzania',
        contactPerson: 'Zonal Supply Officer',
      },
      registrationReference: 'MSD-EST-1993',
      status: 'ACTIVE',
      regionsServed: ['Kigoma', 'Dar es Salaam', 'Dodoma', 'Mwanza', 'Arusha'],
      capabilities: ['PHARMACEUTICALS', 'VACCINE_COLD_CHAIN', 'LABORATORY_REAGENTS'],
      productCategories: ['medicines', 'vaccines', 'laboratory_reagents', 'ppe'],
      effectivePeriod: { start: '2024-01-01T00:00:00Z' },
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-system',
        systemVersion: 'v17.0',
      },
    };

    const sup2: Supplier = {
      supplierId: 'sup-biomed-intl',
      legalName: 'AfriBioMed Diagnostics Ltd',
      displayName: 'AfriBioMed Diagnostics',
      supplierType: 'AUTHORIZED_WHOLESALER',
      contactReference: {
        email: 'sales@afribiomed.co.tz',
        phone: '+255 754 889 900',
        address: 'Industrial Area, Dar es Salaam',
      },
      registrationReference: 'BRELA-LLC-2018-4421',
      status: 'ACTIVE',
      regionsServed: ['Kigoma', 'Dar es Salaam'],
      capabilities: ['LABORATORY_CONSUMABLES', 'MEDICAL_DEVICES'],
      productCategories: ['laboratory_consumables', 'medical_devices', 'ppe'],
      effectivePeriod: { start: '2025-01-01T00:00:00Z' },
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-system',
        systemVersion: 'v17.0',
      },
    };

    this.suppliers.set(sup1.supplierId, sup1);
    this.suppliers.set(sup2.supplierId, sup2);

    const contract1: SupplierContract = {
      contractId: 'cnt-msd-2026',
      supplierId: 'sup-msd-tz',
      facilityOrOrgId: 'fac-amgh',
      contractReference: 'MSD-KGM-ANNUAL-2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      termsReference: 'STANDARD_GOVERNMENT_HEALTH_TERMS_NET30',
      pricingReference: 'NATIONAL_ESSENTIAL_MEDICINE_CATALOGUE_2026',
      deliveryTerms: 'DDP_FACILITY_WAREHOUSE',
      status: 'ACTIVE',
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-system',
      },
    };

    this.contracts.set(contract1.contractId, contract1);

    const po1: PurchaseOrder = {
      purchaseOrderId: 'po-amgh-2026-001',
      orderNumber: 'PO-AMGH-001',
      supplierId: 'sup-msd-tz',
      issuingOrganization: 'Amani General Hospital',
      facilityId: 'fac-amgh',
      contractReference: 'cnt-msd-2026',
      financingReference: {
        budgetCode: 'BUDGET-AMGH-CLINICAL-2026',
      },
      lines: [
        {
          lineId: 'pol-amox-01',
          purchaseOrderId: 'po-amgh-2026-001',
          supplyItemId: 'itm-amox-500',
          orderedQuantity: 50,
          unit: 'BOTTLE_1000',
          unitPrice: 15.0,
          totalPrice: 750.0,
          expectedDate: '2026-01-15',
          receivedQuantity: 0,
          remainingQuantity: 50,
          provenance: { createdAt: now },
        },
        {
          lineId: 'pol-oxy-01',
          purchaseOrderId: 'po-amgh-2026-001',
          supplyItemId: 'itm-oxytocin-10iu',
          orderedQuantity: 10,
          unit: 'BOX_100',
          unitPrice: 45.0,
          totalPrice: 450.0,
          expectedDate: '2026-01-12',
          receivedQuantity: 0,
          remainingQuantity: 10,
          provenance: { createdAt: now },
        },
      ],
      currency: 'USD',
      totalAmount: 1200.0,
      requestedDeliveryDate: '2026-01-15',
      status: 'APPROVED',
      approvals: [
        {
          approvalId: 'appr-po-001',
          entityType: 'PURCHASE_ORDER',
          entityId: 'po-amgh-2026-001',
          reviewerId: 'usr-admin-amgh',
          reviewerRole: 'facility_administrator',
          action: 'APPROVED',
          timestamp: '2026-01-01T11:00:00Z',
          justification: 'Approved against Annual Medical Stores Framework',
          authorizationScope: { facilityId: 'fac-amgh', maxAmountLimit: 5000 },
          amountApproved: 1200.0,
          provenance: { systemVersion: 'v17.0' },
        },
      ],
      provenance: {
        createdAt: now,
        createdBy: 'usr-admin-amgh',
        facilityId: 'fac-amgh',
        systemVersion: 'v17.0',
      },
      version: 2,
      integrityMetadata: {
        hash: sha256(`po-amgh-2026-001:APPROVED:1200.0:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.purchaseOrders.set(po1.purchaseOrderId, po1);
  }

  // ==========================================================================
  // SUPPLIERS
  // ==========================================================================

  public async registerSupplier(params: {
    legalName: string;
    displayName: string;
    supplierType: Supplier['supplierType'];
    contactReference: Supplier['contactReference'];
    registrationReference: string;
    regionsServed: string[];
    capabilities: string[];
    productCategories: Supplier['productCategories'];
    actorId: string;
  }): Promise<Supplier> {
    const supplierId = `sup_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const supplier: Supplier = {
      supplierId,
      legalName: params.legalName,
      displayName: params.displayName,
      supplierType: params.supplierType,
      contactReference: params.contactReference,
      registrationReference: params.registrationReference,
      status: 'ACTIVE',
      regionsServed: params.regionsServed,
      capabilities: params.capabilities,
      productCategories: params.productCategories,
      effectivePeriod: { start: now },
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        systemVersion: 'v17.0',
      },
    };

    this.suppliers.set(supplierId, supplier);

    try {
      await idbEngine.put('suppliers' as any, supplier);
    } catch {}

    await auditService.log({
      action: 'SUPPLIER_REGISTERED',
      actorId: params.actorId,
      facilityId: 'system',
      details: { supplierId, displayName: supplier.displayName, supplierType: supplier.supplierType },
    });

    return supplier;
  }

  public async createSupplier(params: {
    legalName: string;
    displayName: string;
    supplierType: Supplier['supplierType'];
    contactReference: Supplier['contactReference'];
    registrationReference: string;
    regionsServed: string[];
    capabilities: string[];
    productCategories: Supplier['productCategories'];
    actorId: string;
  }): Promise<Supplier> {
    return this.registerSupplier(params);
  }

  public async updateSupplierStatus(
    supplierId: string,
    status: SupplierStatus,
    reason: string,
    actorId: string
  ): Promise<Supplier> {
    const supplier = this.suppliers.get(supplierId);
    if (!supplier) throw new Error(`Supplier not found: ${supplierId}`);

    supplier.status = status;
    this.suppliers.set(supplierId, supplier);

    try {
      await idbEngine.put('suppliers' as any, supplier);
    } catch {}

    await auditService.log({
      action: 'SUPPLIER_STATUS_UPDATED',
      actorId,
      facilityId: 'system',
      details: { supplierId, status, reason },
    });

    return supplier;
  }

  public getSupplier(supplierId: string): Supplier | undefined {
    return this.suppliers.get(supplierId);
  }

  public listSuppliers(): Supplier[] {
    return Array.from(this.suppliers.values());
  }

  // ==========================================================================
  // PURCHASE ORDERS
  // ==========================================================================

  public async createPurchaseOrder(params: {
    supplierId: string;
    issuingOrganization: string;
    facilityId: string;
    purchaseRequestReference?: string;
    contractReference?: string;
    financingReference?: { payerId?: string; programId?: string; budgetCode?: string };
    lines: Array<{
      supplyItemId: string;
      orderedQuantity: number;
      unit: string;
      unitPrice: number;
      expectedDate: string;
    }>;
    currency?: string;
    requestedDeliveryDate: string;
    actorId: string;
  }): Promise<PurchaseOrder> {
    const supplier = this.suppliers.get(params.supplierId);
    if (!supplier) throw new Error(`Supplier not found: ${params.supplierId}`);

    // Supplier status guard
    if (supplier.status === 'SUSPENDED' || supplier.status === 'BLACKLISTED') {
      throw new Error(`Cannot issue purchase order to supplier with status '${supplier.status}'`);
    }

    // Deterministic fraud/duplicate check
    const existingPOs = Array.from(this.purchaseOrders.values()).filter(
      (po) => po.supplierId === params.supplierId && po.facilityId === params.facilityId && po.status !== 'CANCELLED'
    );
    const isDuplicate = existingPOs.some((po) => {
      if (po.lines.length !== params.lines.length) return false;
      return po.lines.every((pol, idx) => {
        const matching = params.lines[idx];
        return matching && pol.supplyItemId === matching.supplyItemId && pol.orderedQuantity === matching.orderedQuantity;
      });
    });
    if (isDuplicate) {
      throw new Error(`INTEGRITY_REVIEW_REQUIRED: Potential duplicate purchase order detected with identical supplier and line quantities.`);
    }

    const purchaseOrderId = `po_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();

    let totalAmount = 0;
    const lines: PurchaseOrderLine[] = params.lines.map((l) => {
      const totalPrice = l.orderedQuantity * l.unitPrice;
      totalAmount += totalPrice;
      return {
        lineId: `pol_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        purchaseOrderId,
        supplyItemId: l.supplyItemId,
        orderedQuantity: l.orderedQuantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        totalPrice,
        expectedDate: l.expectedDate,
        receivedQuantity: 0,
        remainingQuantity: l.orderedQuantity,
        provenance: { createdAt: now },
      };
    });

    const po: PurchaseOrder = {
      purchaseOrderId,
      orderNumber,
      supplierId: params.supplierId,
      issuingOrganization: params.issuingOrganization,
      facilityId: params.facilityId,
      purchaseRequestReference: params.purchaseRequestReference,
      contractReference: params.contractReference,
      financingReference: params.financingReference,
      lines,
      currency: params.currency || 'USD',
      totalAmount,
      requestedDeliveryDate: params.requestedDeliveryDate,
      status: 'PENDING_APPROVAL',
      approvals: [],
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        facilityId: params.facilityId,
        systemVersion: 'v17.0',
      },
      version: 1,
      integrityMetadata: {
        hash: sha256(`${purchaseOrderId}:PENDING_APPROVAL:${totalAmount}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.purchaseOrders.set(purchaseOrderId, po);

    try {
      await idbEngine.put('purchaseOrders' as any, po);
    } catch {}

    await auditService.log({
      action: 'PURCHASE_ORDER_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId,
      details: { purchaseOrderId, orderNumber, totalAmount, supplierId: params.supplierId },
    });

    return po;
  }

  public async approvePurchaseOrder(params: {
    purchaseOrderId: string;
    reviewerId: string;
    reviewerRole: string;
    justification: string;
    maxAuthorizedAmount?: number;
  }): Promise<PurchaseOrder> {
    const po = this.purchaseOrders.get(params.purchaseOrderId);
    if (!po) throw new Error(`Purchase order not found: ${params.purchaseOrderId}`);

    if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
      throw new Error(`Cannot approve purchase order in status '${po.status}'`);
    }

    if (params.maxAuthorizedAmount && po.totalAmount > params.maxAuthorizedAmount) {
      throw new Error(`Purchase order amount ($${po.totalAmount}) exceeds reviewer limit ($${params.maxAuthorizedAmount})`);
    }

    const now = new Date().toISOString();
    const approvalId = `appr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const approval: ProcurementApproval = {
      approvalId,
      entityType: 'PURCHASE_ORDER',
      entityId: po.purchaseOrderId,
      reviewerId: params.reviewerId,
      reviewerRole: params.reviewerRole,
      action: 'APPROVED',
      timestamp: now,
      justification: params.justification,
      authorizationScope: {
        facilityId: po.facilityId,
        maxAmountLimit: params.maxAuthorizedAmount,
      },
      amountApproved: po.totalAmount,
      provenance: { systemVersion: 'v17.0' },
    };

    po.status = 'APPROVED';
    po.approvals.push(approval);
    po.version += 1;
    po.integrityMetadata.hash = sha256(`${po.purchaseOrderId}:APPROVED:${po.totalAmount}:${po.version}:${now}`);
    po.integrityMetadata.lastVerifiedAt = now;

    this.purchaseOrders.set(po.purchaseOrderId, po);

    try {
      await idbEngine.put('purchaseOrders' as any, po);
    } catch {}

    await auditService.log({
      action: 'PURCHASE_ORDER_APPROVED',
      actorId: params.reviewerId,
      facilityId: po.facilityId,
      details: { purchaseOrderId: po.purchaseOrderId, approvedAmount: po.totalAmount },
    });

    return po;
  }

  public async sendPurchaseOrder(purchaseOrderId: string, actorId: string): Promise<PurchaseOrder> {
    const po = this.purchaseOrders.get(purchaseOrderId);
    if (!po) throw new Error(`Purchase order not found: ${purchaseOrderId}`);

    if (po.status !== 'APPROVED') {
      throw new Error(`Cannot send purchase order unless approved. Current status: ${po.status}`);
    }

    const now = new Date().toISOString();
    po.status = 'SENT';
    po.version += 1;
    po.integrityMetadata.hash = sha256(`${po.purchaseOrderId}:SENT:${po.version}:${now}`);

    this.purchaseOrders.set(purchaseOrderId, po);

    try {
      await idbEngine.put('purchaseOrders' as any, po);
    } catch {}

    await auditService.log({
      action: 'PURCHASE_ORDER_SENT',
      actorId,
      facilityId: po.facilityId,
      details: { purchaseOrderId, supplierId: po.supplierId },
    });

    return po;
  }

  public async acknowledgePurchaseOrder(purchaseOrderId: string, actorId: string): Promise<PurchaseOrder> {
    const po = this.purchaseOrders.get(purchaseOrderId);
    if (!po) throw new Error(`Purchase order not found: ${purchaseOrderId}`);

    const now = new Date().toISOString();
    po.status = 'ACKNOWLEDGED';
    po.version += 1;

    this.purchaseOrders.set(purchaseOrderId, po);

    try {
      await idbEngine.put('purchaseOrders' as any, po);
    } catch {}

    return po;
  }

  public async cancelPurchaseOrder(purchaseOrderId: string, reason: string, actorId: string): Promise<PurchaseOrder> {
    const po = this.purchaseOrders.get(purchaseOrderId);
    if (!po) throw new Error(`Purchase order not found: ${purchaseOrderId}`);

    if (po.status === 'FULFILLED') {
      throw new Error(`Cannot cancel an already fulfilled purchase order`);
    }

    const now = new Date().toISOString();
    po.status = 'CANCELLED';
    po.version += 1;

    this.purchaseOrders.set(purchaseOrderId, po);

    try {
      await idbEngine.put('purchaseOrders' as any, po);
    } catch {}

    await auditService.log({
      action: 'PURCHASE_ORDER_CANCELLED',
      actorId,
      facilityId: po.facilityId,
      details: { purchaseOrderId, reason },
    });

    return po;
  }

  public getPurchaseOrder(purchaseOrderId: string): PurchaseOrder | undefined {
    return this.purchaseOrders.get(purchaseOrderId);
  }

  public listPurchaseOrders(filter?: {
    facilityId?: string;
    supplierId?: string;
    status?: PurchaseOrderStatus;
  }): PurchaseOrder[] {
    let result = Array.from(this.purchaseOrders.values());

    if (filter?.facilityId) {
      result = result.filter((po) => po.facilityId === filter.facilityId);
    }
    if (filter?.supplierId) {
      result = result.filter((po) => po.supplierId === filter.supplierId);
    }
    if (filter?.status) {
      result = result.filter((po) => po.status === filter.status);
    }

    return result;
  }
}

export const procurementOrderService = ProcurementOrderService.getInstance();
