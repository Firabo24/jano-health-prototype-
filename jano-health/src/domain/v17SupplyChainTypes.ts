/**
 * Jano Health - Clinical Core V17: Supply Chain, Procurement & Logistics Intelligence
 * 
 * Domain Model & Type Definitions.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * 1. MedicationDefinition ≠ SupplyItem (Procurement identity is separate)
 * 2. Prescription ≠ Requisition (Prescriptions are clinical; Requisitions are operational)
 * 3. Prescription ≠ PurchaseOrder
 * 4. DispenseRecord ≠ Shipment
 * 5. InventoryTransaction ≠ PurchaseOrder
 * 6. Inventory ≠ Procurement
 * 7. Inventory ≠ Warehouse (Warehousing is upstream storage; Inventory is operational stock)
 * 8. PurchaseOrder ≠ GoodsReceipt
 * 9. Shipment ≠ GoodsReceipt
 * 10. Forecast ≠ PurchaseOrder
 * 11. Supplier ≠ Payer (Financial entities are distinct)
 * 12. Supplier ≠ Facility
 * 13. StockLevel ≠ DemandForecast
 * 14. ColdChainLog ≠ InventoryTransaction
 * 15. Procurement ≠ Clinical Decision
 * 16. AI Recommendation ≠ Procurement Authorization
 * 17. Unknown ≠ Safe (Missing temperature or stock telemetry is UNKNOWN, not compliant)
 */

// ============================================================================
// 1. SUPPLY CATALOGUE
// ============================================================================

export type SupplyCategory =
  | 'medicines'
  | 'vaccines'
  | 'laboratory_reagents'
  | 'laboratory_consumables'
  | 'radiology_consumables'
  | 'medical_devices'
  | 'ppe'
  | 'oxygen_related'
  | 'surgical_supplies'
  | 'general_clinical_consumables'
  | 'facility_supplies'
  | 'other';

export type ProcurementClassification = 'VITAL' | 'ESSENTIAL' | 'NON_ESSENTIAL' | 'SCHEDULED_NARCOTIC';

export interface SupplyItemStorageRequirements {
  temperatureZone: 'ROOM_TEMPERATURE' | 'CONTROLLED_ROOM' | 'COLD_CHAIN_2_8' | 'FREEZER_MINUS_20' | 'ULTRA_COLD_MINUS_70';
  minCelsius?: number;
  maxCelsius?: number;
  lightSensitive?: boolean;
  humiditySensitive?: boolean;
  securityRestricted?: boolean;
}

export interface SupplyItem {
  supplyItemId: string;
  code: string;
  name: string;
  genericName?: string;
  category: SupplyCategory;
  unitOfMeasure: string;
  packagingUnit: string;
  procurementClassification: ProcurementClassification;
  storageRequirements: SupplyItemStorageRequirements;
  temperatureRequirements?: {
    min: number;
    max: number;
    unit: 'CELSIUS';
  };
  expiryRequired: boolean;
  batchTrackingRequired: boolean;
  controlledItemFlag: boolean;
  medicationReferenceId?: string; // Optional cross-reference to MedicationDefinition (V7)
  active: boolean;
  provenance: {
    createdAt: string;
    createdBy: string;
    facilityId?: string;
    systemVersion: string;
  };
  version: number;
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

export interface SupplyAssetReference {
  assetReferenceId: string;
  supplyItemId: string;
  serialNumber?: string;
  installationDate?: string;
  warrantyExpiry?: string;
  maintenanceStatus?: 'OPERATIONAL' | 'NEEDS_MAINTENANCE' | 'OUT_OF_SERVICE';
}

// ============================================================================
// 2. DEMAND & REQUISITION
// ============================================================================

export type DemandSignalSource =
  | 'OBSERVED_CONSUMPTION'
  | 'MINIMUM_STOCK_THRESHOLD'
  | 'FORECAST'
  | 'EMERGENCY_DEMAND'
  | 'RECURRING_SERVICE'
  | 'MANUAL_REQUEST'
  | 'REDISTRIBUTION_NEED'
  | 'CAMPAIGN_PROGRAM'
  | 'COLD_CHAIN_CAPACITY'
  | 'FACILITY_EXPANSION';

export interface DemandSignal {
  demandSignalId: string;
  facilityId: string;
  supplyItemId: string;
  quantity: number;
  unit: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
  source: DemandSignalSource;
  reportingPeriod: {
    start: string;
    end: string;
  };
  confidence: number; // 0.0 - 1.0
  createdAt: string;
  provenance: {
    generatedBy: string;
    systemVersion: string;
  };
}

export type RequisitionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FULFILLED'
  | 'CLOSED';

export interface RequisitionLine {
  requisitionLineId: string;
  supplyItemId: string;
  quantityRequested: number;
  quantityApproved?: number;
  unit: string;
  justification: string;
  requiredDate: string;
  sourceDemandSignalId?: string;
  estimatedUnitCost?: number;
  status: 'PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
  provenance: {
    createdAt: string;
  };
}

export type ProcurementApprovalAction = 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED' | 'RETURNED';

export interface ProcurementApproval {
  approvalId: string;
  entityType: 'REQUISITION' | 'PURCHASE_ORDER' | 'STOCK_TRANSFER';
  entityId: string;
  reviewerId: string;
  reviewerRole: string;
  action: ProcurementApprovalAction;
  timestamp: string;
  justification: string;
  authorizationScope: {
    facilityId: string;
    department?: string;
    maxAmountLimit?: number;
  };
  amountApproved?: number;
  provenance: {
    systemVersion: string;
  };
}

export interface Requisition {
  requisitionId: string;
  facilityId: string;
  requestingDepartment: string;
  requesterId: string;
  purpose: string;
  lines: RequisitionLine[];
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
  requestedAt: string;
  neededBy: string;
  status: RequisitionStatus;
  approvalHistory: ProcurementApproval[];
  provenance: {
    createdAt: string;
    createdBy: string;
    facilityId: string;
    systemVersion: string;
  };
  version: number;
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

export interface PurchaseRequest {
  purchaseRequestId: string;
  facilityId: string;
  aggregatedRequisitionIds: string[];
  lines: Array<{
    supplyItemId: string;
    quantity: number;
    unit: string;
    estimatedCost: number;
  }>;
  requestedAt: string;
  status: 'DRAFT' | 'APPROVED' | 'PO_CREATED' | 'CANCELLED';
  provenance: {
    createdBy: string;
    systemVersion: string;
  };
}

// ============================================================================
// 3. SUPPLIER & CONTRACTS
// ============================================================================

export type SupplierType =
  | 'GOVERNMENT_MEDICAL_STORES'
  | 'AUTHORIZED_WHOLESALER'
  | 'MANUFACTURER'
  | 'DONOR_AGENCY'
  | 'LOCAL_DISTRIBUTOR'
  | 'SPECIALTY_IMPORTER';

export type SupplierStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'BLACKLISTED';

export interface Supplier {
  supplierId: string;
  legalName: string;
  displayName: string;
  supplierType: SupplierType;
  contactReference: {
    email?: string;
    phone?: string;
    address?: string;
    contactPerson?: string;
  };
  registrationReference: string;
  taxIdentificationNumber?: string;
  status: SupplierStatus;
  regionsServed: string[];
  capabilities: string[];
  productCategories: SupplyCategory[];
  effectivePeriod: {
    start: string;
    end?: string;
  };
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
}

export interface SupplierContract {
  contractId: string;
  supplierId: string;
  facilityOrOrgId: string;
  contractReference: string;
  startDate: string;
  endDate: string;
  termsReference: string;
  pricingReference: string;
  deliveryTerms: string;
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'PENDING';
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

// ============================================================================
// 4. PURCHASE ORDER
// ============================================================================

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'CLOSED';

export interface PurchaseOrderLine {
  lineId: string;
  purchaseOrderId: string;
  supplyItemId: string;
  orderedQuantity: number;
  unit: string;
  unitPrice: number;
  taxOrAdjustment?: number;
  totalPrice: number;
  expectedDate: string;
  receivedQuantity: number;
  remainingQuantity: number;
  provenance: {
    createdAt: string;
  };
}

export interface PurchaseOrder {
  purchaseOrderId: string;
  orderNumber: string;
  supplierId: string;
  issuingOrganization: string;
  facilityId: string;
  purchaseRequestReference?: string;
  contractReference?: string;
  financingReference?: {
    payerId?: string;
    programId?: string;
    budgetCode?: string;
  };
  lines: PurchaseOrderLine[];
  currency: string;
  totalAmount: number;
  requestedDeliveryDate: string;
  status: PurchaseOrderStatus;
  approvals: ProcurementApproval[];
  provenance: {
    createdAt: string;
    createdBy: string;
    facilityId: string;
    systemVersion: string;
  };
  version: number;
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

// ============================================================================
// 5. SHIPMENT & LOGISTICS
// ============================================================================

export type ShipmentStatus =
  | 'PLANNED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'AT_DESTINATION'
  | 'RECEIVED'
  | 'PARTIALLY_RECEIVED'
  | 'REJECTED'
  | 'LOST'
  | 'CANCELLED';

export interface ShipmentLine {
  lineId: string;
  supplyItemId: string;
  batchOrLotNumber: string;
  quantity: number;
  unit: string;
  manufacturingDate?: string;
  expiryDate?: string;
  serialNumber?: string;
  coldChainRequired: boolean;
  temperatureRequirements?: {
    min: number;
    max: number;
  };
}

export interface DeliveryCheckpoint {
  checkpointId: string;
  legId: string;
  location: string;
  timestamp: string;
  responsibleActor: string;
  transportCondition: 'NORMAL' | 'TEMPERATURE_WARNING' | 'DAMAGE_DETECTED' | 'DELAYED';
  status: 'ARRIVED' | 'INSPECTED' | 'DISPATCHED';
  exceptionNotes?: string;
  evidenceReference?: string;
}

export interface TransportLeg {
  legId: string;
  shipmentId: string;
  origin: string;
  destination: string;
  carrier: string;
  dispatchAt?: string;
  arrivalAt?: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  checkpoints: DeliveryCheckpoint[];
  provenance?: {
    createdAt: string;
  };
}

export interface Shipment {
  shipmentId: string;
  purchaseOrderReference: string;
  supplierId: string;
  origin: string;
  destination: string;
  destinationFacilityId: string;
  carrierReference: string;
  dispatchAt: string;
  estimatedArrival: string;
  actualArrival?: string;
  status: ShipmentStatus;
  temperatureMonitoringRequired: boolean;
  lines: ShipmentLine[];
  legs: TransportLeg[];
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

// ============================================================================
// 6. GOODS RECEIPT & MATCHING
// ============================================================================

export type GoodsReceiptStatus = 'DRAFT' | 'RECEIVED' | 'PARTIALLY_ACCEPTED' | 'REJECTED' | 'FINALIZED';

export interface GoodsReceiptLine {
  lineId: string;
  supplyItemId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  lotNumber: string;
  expiryDate?: string;
  serialNumber?: string;
  damageDescription?: string;
  discrepancyReason?: string;
  qualityPassed: boolean;
}

export interface GoodsReceipt {
  goodsReceiptId: string;
  receiptNumber: string;
  shipmentId: string;
  purchaseOrderReference: string;
  facilityId: string;
  warehouseId: string;
  receivedBy: string;
  receivedAt: string;
  lines: GoodsReceiptLine[];
  inspectionStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
  discrepancyStatus: 'NONE' | 'MINOR' | 'CRITICAL';
  status: GoodsReceiptStatus;
  inventoryIntegrated: boolean;
  inventoryTransactionIds?: string[];
  provenance: {
    createdAt: string;
    createdBy: string;
    facilityId: string;
    systemVersion: string;
  };
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

export type MatchStatus = 'MATCHED' | 'PARTIAL' | 'MISMATCH' | 'REQUIRES_REVIEW';

export interface ThreeWayMatchResult {
  purchaseOrderId: string;
  goodsReceiptId: string;
  invoiceId?: string;
  matchStatus: MatchStatus;
  quantityMatch: boolean;
  priceMatch: boolean;
  supplierMatch: boolean;
  discrepancies: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  settlementPermitted: boolean;
}

export interface FourWayMatchResult extends ThreeWayMatchResult {
  qualityInspectionPassed: boolean;
  batchHoldActive: boolean;
}

// ============================================================================
// 7. WAREHOUSING & STOCK TRANSFERS
// ============================================================================

export type WarehouseType =
  | 'central'
  | 'regional'
  | 'facility'
  | 'pharmacy'
  | 'laboratory'
  | 'emergency'
  | 'mobile'
  | 'other';

export interface Warehouse {
  warehouseId: string;
  facilityId: string;
  name: string;
  organization: string;
  type: WarehouseType;
  storageCapacityM3?: number;
  temperatureZones: Array<'ROOM_TEMP' | 'COLD_2_8' | 'FREEZER_MINUS_20' | 'ULTRA_COLD_MINUS_70'>;
  securityRequirements: string[];
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  provenance: {
    createdAt: string;
    createdBy: string;
  };
}

export interface StorageLocation {
  locationId: string;
  warehouseId: string;
  zone: string;
  shelfOrBin: string;
  temperatureZone: string;
  controlledAccess: boolean;
  capacityUnits?: number;
  status: 'ACTIVE' | 'OCCUPIED' | 'MAINTENANCE';
}

export type StockTransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'PARTIALLY_RECEIVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface StockTransfer {
  transferId: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{
    supplyItemId: string;
    quantity: number;
    lotNumber?: string;
    expiryDate?: string;
  }>;
  status: StockTransferStatus;
  requestedBy: string;
  approvedBy?: string;
  dispatchedAt?: string;
  receivedAt?: string;
  transportDetails?: {
    carrier?: string;
    vehiclePlate?: string;
    courierName?: string;
  };
  provenance: {
    createdAt: string;
    createdBy: string;
    systemVersion: string;
  };
  integrityMetadata: {
    hash: string;
    lastVerifiedAt: string;
  };
}

// ============================================================================
// 8. COLD CHAIN
// ============================================================================

export type TemperatureReadingStatus = 'WITHIN_RANGE' | 'WARNING' | 'EXCURSION' | 'UNKNOWN';

export interface TemperatureLog {
  logId: string;
  shipmentId?: string;
  storageLocationId?: string;
  requiredRange: {
    min: number;
    max: number;
  };
  observedTemperature: number;
  status: TemperatureReadingStatus;
  timestamp: string;
  sensorReference?: string;
  location: string;
  durationMinutes?: number;
  actorOrSystem: string;
  provenance: {
    recordedAt: string;
  };
}

export type ExcursionSeverity = 'LOW' | 'MEDIUM' | 'CRITICAL';
export type ExcursionReviewStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLEARED' | 'QUARANTINED' | 'REJECTED';

export interface TemperatureExcursion {
  excursionId: string;
  shipmentId?: string;
  storageLocationId?: string;
  startAt: string;
  endAt: string;
  minimumTemperature: number;
  maximumTemperature: number;
  requiredRange: {
    min: number;
    max: number;
  };
  affectedBatches: string[];
  severity: ExcursionSeverity;
  status: ExcursionReviewStatus;
  reviewDecision?: string;
  reviewerId?: string;
  reviewedAt?: string;
  provenance: {
    detectedAt: string;
  };
}

// ============================================================================
// 9. QUALITY & RECALL MANAGEMENT
// ============================================================================

export type QualityHoldReason =
  | 'TEMPERATURE_EXCURSION'
  | 'PHYSICAL_DAMAGE'
  | 'CONTAMINATION_CONCERN'
  | 'SUSPECTED_COUNTERFEIT'
  | 'DOCUMENTATION_MISMATCH'
  | 'RECALL'
  | 'EXPIRY_DISCREPANCY'
  | 'QUALITY_INVESTIGATION';

export type QualityHoldStatus = 'ACTIVE' | 'RELEASED' | 'DISPOSED';

export interface BatchQualityHold {
  holdId: string;
  supplyItemId: string;
  batchNumber: string;
  facilityId: string;
  warehouseId: string;
  reason: QualityHoldReason;
  holdStatus: QualityHoldStatus;
  quantityHeld: number;
  placedBy: string;
  placedAt: string;
  releaseDecision?: string;
  releasedBy?: string;
  releasedAt?: string;
  provenance: {
    createdAt: string;
    systemVersion: string;
  };
}

export type RecallSeverity = 'CLASS_I' | 'CLASS_II' | 'CLASS_III';
export type RecallActionType = 'QUARANTINE_IMMEDIATELY' | 'RETURN_TO_SUPPLIER' | 'DESTROY_ON_SITE' | 'SUSPEND_DISPENSING';
export type RecallStatus = 'ISSUED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface RecallNotice {
  recallId: string;
  recallNumber: string;
  affectedItemIds: string[];
  manufacturer: string;
  batchNumbers: string[];
  affectedLocations: string[];
  notificationDate: string;
  severity: RecallSeverity;
  actionRequired: RecallActionType;
  status: RecallStatus;
  instructions: string;
  provenance: {
    issuedBy: string;
    issuedAt: string;
  };
}

export interface RecallAction {
  actionId: string;
  recallId: string;
  facilityId: string;
  actionType: RecallActionType;
  quantityAffected: number;
  quantityQuarantined: number;
  quantityReturned: number;
  status: 'PENDING' | 'EXECUTED';
  executedBy: string;
  executedAt: string;
  evidenceNotes: string;
}

export type SupplierQualityEventType =
  | 'DELIVERY_DISCREPANCY'
  | 'REJECTED_SHIPMENT'
  | 'TEMPERATURE_EXCURSION'
  | 'COUNTERFEIT_SUSPICION'
  | 'DAMAGED_GOODS'
  | 'RECURRING_SHORTAGES'
  | 'LATE_DELIVERY'
  | 'QUALITY_ISSUE';

export interface SupplierQualityEvent {
  eventId: string;
  supplierId: string;
  eventType: SupplierQualityEventType;
  severity: 'MINOR' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  description: string;
  purchaseOrderId?: string;
  shipmentId?: string;
  recordedBy: string;
  recordedAt: string;
  humanResolutionNotes?: string;
}

// ============================================================================
// 10. PLANNING & FORECASTING
// ============================================================================

export type ForecastMethod = 'MOVING_AVERAGE' | 'WEIGHTED_CONSUMPTION' | 'DEMAND_SPIKE_ADJUSTED';

export interface ProcurementForecast {
  forecastId: string;
  supplyItemId: string;
  facilityId: string;
  warehouseId?: string;
  historicalWindowDays: number;
  forecastHorizonDays: number;
  method: ForecastMethod;
  expectedDemand: number;
  uncertaintyConfidence: number; // 0.0 - 1.0
  dataCompleteness: number; // 0.0 - 1.0
  generatedAt: string;
  modelVersion: string;
}

export type ReplenishmentUrgency = 'NORMAL' | 'ELEVATED' | 'CRITICAL';
export type ReplenishmentReviewStatus = 'DRAFT' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED' | 'ORDERED';

export interface ReplenishmentRecommendation {
  recommendationId: string;
  supplyItemId: string;
  locationId: string;
  facilityId: string;
  currentAvailableQuantity: number;
  reservedQuantity: number;
  averageConsumptionDaily: number;
  forecastDemand: number;
  leadTimeDays: number;
  safetyStock: number;
  recommendedQuantity: number;
  urgency: ReplenishmentUrgency;
  rationale: string;
  generatedAt: string;
  reviewStatus: ReplenishmentReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

export type SupplyRiskType =
  | 'STOCKOUT_RISK'
  | 'EXPIRY_RISK'
  | 'LEAD_TIME_RISK'
  | 'SUPPLIER_RISK'
  | 'COLD_CHAIN_RISK'
  | 'DEMAND_SURGE'
  | 'DISTRIBUTION_RISK'
  | 'DATA_QUALITY_RISK';

export type SupplyRiskSeverity = 'NORMAL' | 'WATCH' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'RESOLVED';

export interface SupplyRisk {
  riskId: string;
  supplyItemId: string;
  facilityId: string;
  riskType: SupplyRiskType;
  severity: SupplyRiskSeverity;
  evidence: string;
  daysRemaining?: number;
  detectedAt: string;
  resolvedAt?: string;
}

// ============================================================================
// 11. GOVERNANCE & POLICIES
// ============================================================================

export interface SupplyChainPolicy {
  policyId: string;
  facilityId: string;
  autoReorderEnabled: boolean;
  minLeadTimeDays: number;
  defaultSafetyStockDays: number;
  requireFourWayMatch: boolean;
  coldChainStrictHold: boolean;
  maxApprovalThresholds: Record<string, number>; // role -> max amount
  version: number;
}
