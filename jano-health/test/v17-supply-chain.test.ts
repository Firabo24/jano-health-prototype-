/**
 * Jano Health - Clinical Core V17: Supply Chain, Procurement & Logistics Comprehensive Test Suite
 * 
 * Verifies the full upstream commodity lifecycle:
 * Demand → Requisition → Approval → Procurement → Purchase Order → Supplier → Shipment
 * → Receiving → Three-Way Matching → V7 Inventory Bridge → Cold Chain → Quality Holds
 * → Forecasting → Replenishment Recommendations → Supply Risks → FHIR R5 Mappings
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Prescription ≠ Requisition
 * - PurchaseOrder ≠ GoodsReceipt
 * - GoodsReceipt ≠ InventoryTransaction (V7 Inventory Bridge manages append-only ledger)
 * - AI Recommendations are ADVISORY ONLY: Prohibits autonomous consequential mutations
 * - Missing telemetry remains UNKNOWN, never assumed SAFE
 * - Supplier ≠ Payer
 */

import 'fake-indexeddb/auto';
import { supplyCatalogService } from '../src/services/supplyChain/supplyCatalogService';
import { demandRequisitionService } from '../src/services/supplyChain/demandRequisitionService';
import { procurementOrderService } from '../src/services/supplyChain/procurementOrderService';
import { logisticsReceivingService } from '../src/services/supplyChain/logisticsReceivingService';
import { warehouseTransferService } from '../src/services/supplyChain/warehouseTransferService';
import { coldChainService } from '../src/services/supplyChain/coldChainService';
import { qualityRecallService } from '../src/services/supplyChain/qualityRecallService';
import { supplyPlanningIntelligenceService } from '../src/services/supplyChain/supplyPlanningIntelligenceService';
import { inventoryBridgeService } from '../src/services/supplyChain/inventoryBridgeService';
import { defaultSupplyAdapter } from '../src/services/supplyChain/externalSupplyAdapter';
import { FHIRSupplyChainMapper } from '../src/services/fhir/supplyChainMapper';
import { aiSafetyGateway } from '../src/services/ai/aiSafetyGateway';
import { localRepository } from '../src/services/storage/localRepository';
import { GoodsReceipt } from '../src/domain/v17SupplyChainTypes';

async function runSupplyChainTests() {
  console.log('================================================================');
  console.log('JANO HEALTH — CLINICAL CORE V17: SUPPLY CHAIN & LOGISTICS');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, message: string) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASS: ${message}`);
    passed++;
  }

  // --------------------------------------------------------------------------
  // TEST 1: SUPPLY CATALOGUE & PACKAGING SPECIFICATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 1. Supply Catalogue & Commodity Specifications ---');

  const newItem = await supplyCatalogService.createSupplyItem({
    code: 'MED-CIPRO-500MG',
    name: 'Ciprofloxacin 500mg Tablets (500s)',
    genericName: 'Ciprofloxacin',
    category: 'medicines',
    unitOfMeasure: 'TABLET',
    packagingUnit: 'BOTTLE_500',
    procurementClassification: 'ESSENTIAL',
    storageRequirements: {
      temperatureZone: 'CONTROLLED_ROOM',
      minCelsius: 15,
      maxCelsius: 25,
      humiditySensitive: true,
    },
    expiryRequired: true,
    batchTrackingRequired: true,
    controlledItemFlag: false,
    actorId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });

  assert(Boolean(newItem.supplyItemId), 'Supply item created with unique ID');
  assert(newItem.code === 'MED-CIPRO-500MG', 'Supply item code matches');
  assert(newItem.active === true, 'Supply item is active');
  assert(newItem.version === 1, 'Initial supply item version is 1');
  assert(Boolean(newItem.integrityMetadata.hash), 'Tamper-evident integrity hash created');

  const retrieved = supplyCatalogService.getItem(newItem.supplyItemId);
  assert(retrieved?.name === 'Ciprofloxacin 500mg Tablets (500s)', 'Retrieved supply item from catalogue');

  const vitalItems = supplyCatalogService.listItems({ classification: 'VITAL' });
  assert(vitalItems.length > 0, 'Catalog filters commodities by procurement classification');

  // --------------------------------------------------------------------------
  // TEST 2: DEMAND SIGNALS (MULTI-SOURCE DEMAND)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Demand Signals (Multi-Source Demand Intelligence) ---');

  const signal1 = await demandRequisitionService.createDemandSignal({
    facilityId: 'fac-amgh',
    supplyItemId: newItem.supplyItemId,
    quantity: 20,
    unit: 'BOTTLE_500',
    priority: 'HIGH',
    source: 'MINIMUM_STOCK_THRESHOLD',
    reportingPeriod: { start: '2026-01-01', end: '2026-01-31' },
    confidence: 0.95,
    actorId: 'usr-pharmacist-lead',
  });

  assert(Boolean(signal1.demandSignalId), 'Demand signal created with unique ID');
  assert(signal1.source === 'MINIMUM_STOCK_THRESHOLD', 'Demand source recorded correctly');
  assert(signal1.confidence === 0.95, 'Demand signal confidence recorded');

  const emergencySignal = await demandRequisitionService.createDemandSignal({
    facilityId: 'fac-amgh',
    supplyItemId: 'itm-oxygen-cyl-g',
    quantity: 15,
    unit: 'CYLINDER',
    priority: 'CRITICAL',
    source: 'EMERGENCY_DEMAND',
    reportingPeriod: { start: '2026-01-01', end: '2026-01-02' },
    confidence: 1.0,
    actorId: 'usr-dr-amani',
  });

  assert(emergencySignal.priority === 'CRITICAL', 'Emergency demand signal created with CRITICAL priority');

  const facilitySignals = demandRequisitionService.getDemandSignals('fac-amgh');
  assert(facilitySignals.length >= 2, 'Facility demand signals aggregated accurately');

  // --------------------------------------------------------------------------
  // TEST 3: REQUISITIONS & MULTI-TIER APPROVAL WORKFLOW
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Requisitions & Multi-Tier Approval Workflows ---');

  const requisition = await demandRequisitionService.createRequisition({
    facilityId: 'fac-amgh',
    requestingDepartment: 'Inpatient Ward B',
    requesterId: 'usr-dr-baraka',
    purpose: 'Quarterly inpatient antimicrobial & fluid restocking',
    priority: 'HIGH',
    neededBy: '2026-01-15',
    lines: [
      {
        supplyItemId: newItem.supplyItemId,
        quantityRequested: 10,
        unit: 'BOTTLE_500',
        justification: 'Depletion buffer replenishment',
        requiredDate: '2026-01-15',
        estimatedUnitCost: 20.0,
      },
    ],
  });

  assert(requisition.status === 'DRAFT', 'New requisition starts in DRAFT status');
  assert(requisition.version === 1, 'Initial requisition version is 1');

  const submittedReq = await demandRequisitionService.submitRequisition(
    requisition.requisitionId,
    'usr-dr-baraka'
  );
  assert(submittedReq.status === 'SUBMITTED', 'Requisition successfully transitioned to SUBMITTED');
  assert(submittedReq.version === 2, 'Requisition version incremented on submission');

  // Authorization limit check: Reviewer with $100 limit cannot approve $200 requisition
  let approvalBlocked = false;
  try {
    await demandRequisitionService.reviewAndApproveRequisition({
      requisitionId: requisition.requisitionId,
      reviewerId: 'usr-junior-officer',
      reviewerRole: 'health_officer',
      action: 'APPROVED',
      justification: 'Attempting unauthorized approval',
      maxAuthorizedAmount: 100, // Requisition total is 10 * 20 = $200
    });
  } catch (err: any) {
    approvalBlocked = true;
  }
  assert(approvalBlocked, 'Requisition amount exceeding reviewer authorization limit is strictly blocked');

  // Authorized approval
  const approvedReq = await demandRequisitionService.reviewAndApproveRequisition({
    requisitionId: requisition.requisitionId,
    reviewerId: 'usr-admin-amgh',
    reviewerRole: 'facility_administrator',
    action: 'APPROVED',
    justification: 'Approved within department quarterly budget',
    maxAuthorizedAmount: 5000,
  });

  assert(approvedReq.status === 'APPROVED', 'Requisition approved by authorized administrator');
  assert(approvedReq.approvalHistory.length === 1, 'Procurement approval record appended to history');
  assert(approvedReq.approvalHistory[0].action === 'APPROVED', 'Approval action recorded');
  assert(approvedReq.approvalHistory[0].amountApproved === 200, 'Approved amount calculated server-side ($200)');

  // --------------------------------------------------------------------------
  // TEST 4: SUPPLIERS & COMMERCIAL CONTRACTS
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Suppliers & Commercial Governance ---');

  const supplier = await procurementOrderService.registerSupplier({
    legalName: 'Kigoma Pharma Wholesalers Ltd',
    displayName: 'Kigoma Pharma',
    supplierType: 'LOCAL_DISTRIBUTOR',
    contactReference: {
      email: 'orders@kigomapharma.co.tz',
      phone: '+255 28 280 2200',
      address: 'Lumumba Rd, Kigoma, Tanzania',
      contactPerson: 'Logistics Manager',
    },
    registrationReference: 'BRELA-KGM-2021-9981',
    regionsServed: ['Kigoma', 'Kasulu'],
    capabilities: ['PHARMACEUTICALS', 'CONSUMABLES'],
    productCategories: ['medicines', 'ppe', 'general_clinical_consumables'],
    actorId: 'usr-admin-amgh',
  });

  assert(Boolean(supplier.supplierId), 'Supplier registered with unique ID');
  assert(supplier.status === 'ACTIVE', 'Initial supplier status is ACTIVE');

  // Supplier suspension
  const suspended = await procurementOrderService.updateSupplierStatus(
    supplier.supplierId,
    'SUSPENDED',
    'Routine regulatory audit pending',
    'usr-admin-system'
  );
  assert(suspended.status === 'SUSPENDED', 'Supplier successfully transitioned to SUSPENDED');

  // Invariant: Purchase order cannot be issued to suspended supplier
  let poToSuspendedBlocked = false;
  try {
    await procurementOrderService.createPurchaseOrder({
      supplierId: supplier.supplierId,
      issuingOrganization: 'Amani General Hospital',
      facilityId: 'fac-amgh',
      lines: [
        {
          supplyItemId: newItem.supplyItemId,
          orderedQuantity: 5,
          unit: 'BOTTLE_500',
          unitPrice: 20.0,
          expectedDate: '2026-01-20',
        },
      ],
      requestedDeliveryDate: '2026-01-20',
      actorId: 'usr-admin-amgh',
    });
  } catch (err: any) {
    poToSuspendedBlocked = true;
  }
  assert(poToSuspendedBlocked, 'Issuing purchase order to SUSPENDED supplier is strictly rejected');

  // Reactivate supplier
  await procurementOrderService.updateSupplierStatus(
    supplier.supplierId,
    'ACTIVE',
    'Audit cleared successfully',
    'usr-admin-system'
  );

  // --------------------------------------------------------------------------
  // TEST 5: PURCHASE ORDERS & SERVER-AUTHORITATIVE FINANCIALS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Purchase Orders & Fraud/Duplicate Prevention ---');

  const purchaseOrder = await procurementOrderService.createPurchaseOrder({
    supplierId: supplier.supplierId,
    issuingOrganization: 'Amani General Hospital',
    facilityId: 'fac-amgh',
    lines: [
      {
        supplyItemId: newItem.supplyItemId,
        orderedQuantity: 5,
        unit: 'BOTTLE_500',
        unitPrice: 20.0, // 5 * 20 = $100
        expectedDate: '2026-01-20',
      },
    ],
    requestedDeliveryDate: '2026-01-20',
    actorId: 'usr-admin-amgh',
  });

  assert(Boolean(purchaseOrder.purchaseOrderId), 'Purchase order created with unique ID');
  assert(purchaseOrder.totalAmount === 100, 'Server-side financial calculation matches line sum ($100)');
  assert(purchaseOrder.status === 'PENDING_APPROVAL', 'Initial PO status is PENDING_APPROVAL');

  // Deterministic fraud/duplicate screening
  let duplicateBlocked = false;
  try {
    await procurementOrderService.createPurchaseOrder({
      supplierId: supplier.supplierId,
      issuingOrganization: 'Amani General Hospital',
      facilityId: 'fac-amgh',
      lines: [
        {
          supplyItemId: newItem.supplyItemId,
          orderedQuantity: 5,
          unit: 'BOTTLE_500',
          unitPrice: 20.0,
          expectedDate: '2026-01-20',
        },
      ],
      requestedDeliveryDate: '2026-01-20',
      actorId: 'usr-admin-amgh',
    });
  } catch (err: any) {
    duplicateBlocked = true;
  }
  assert(duplicateBlocked, 'INTEGRITY_REVIEW_REQUIRED: Duplicate identical purchase order blocked');

  // Approve and Dispatch Purchase Order
  const approvedPO = await procurementOrderService.approvePurchaseOrder({
    purchaseOrderId: purchaseOrder.purchaseOrderId,
    reviewerId: 'usr-admin-amgh',
    reviewerRole: 'facility_administrator',
    justification: 'Approved for regional antibiotic buffer',
    maxAuthorizedAmount: 5000,
  });
  assert(approvedPO.status === 'APPROVED', 'Purchase order status transitioned to APPROVED');

  const sentPO = await procurementOrderService.sendPurchaseOrder(purchaseOrder.purchaseOrderId, 'usr-admin-amgh');
  assert(sentPO.status === 'SENT', 'Purchase order status transitioned to SENT');

  // --------------------------------------------------------------------------
  // TEST 6: SHIPMENTS, MULTI-LEG LOGISTICS & RECEIVING
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Multi-Leg Logistics, Checkpoints & Receiving ---');

  const shipment = await logisticsReceivingService.createShipment({
    purchaseOrderReference: purchaseOrder.purchaseOrderId,
    supplierId: supplier.supplierId,
    origin: 'Kigoma Commercial Depot',
    destination: 'AMGH Central Pharmacy Warehouse',
    destinationFacilityId: 'fac-amgh',
    carrierReference: 'Kigoma Courier Express #44',
    dispatchAt: '2026-01-05T08:00:00Z',
    estimatedArrival: '2026-01-06T12:00:00Z',
    temperatureMonitoringRequired: false,
    lines: [
      {
        lineId: 'shl-test-01',
        supplyItemId: newItem.supplyItemId,
        batchOrLotNumber: 'CIP-2026-101',
        quantity: 5,
        unit: 'BOTTLE_500',
        manufacturingDate: '2025-11-01',
        expiryDate: '2027-11-01',
        coldChainRequired: false,
      },
    ],
    legs: [
      {
        legId: 'leg-kgm-hub',
        shipmentId: 'shp-pending',
        origin: 'Kigoma Commercial Depot',
        destination: 'AMGH Central Pharmacy Warehouse',
        carrier: 'Kigoma Courier Express #44',
        dispatchAt: '2026-01-05T08:00:00Z',
        status: 'IN_TRANSIT',
        checkpoints: [],
      },
    ],
    actorId: 'usr-admin-amgh',
  });

  assert(shipment.status === 'DISPATCHED', 'Shipment created in DISPATCHED status');

  // Add delivery checkpoint
  const checkpoint = await logisticsReceivingService.addDeliveryCheckpoint({
    legId: 'leg-kgm-hub',
    location: 'AMGH Receiving Gate 2',
    responsibleActor: 'Security Guard #8',
    transportCondition: 'NORMAL',
    status: 'ARRIVED',
  });
  assert(checkpoint.transportCondition === 'NORMAL', 'Delivery checkpoint registered condition NORMAL');

  // Physical Goods Receipt creation
  const grn = await logisticsReceivingService.createGoodsReceipt({
    shipmentId: shipment.shipmentId,
    purchaseOrderReference: purchaseOrder.purchaseOrderId,
    facilityId: 'fac-amgh',
    warehouseId: 'wh-amgh-main',
    lines: [
      {
        supplyItemId: newItem.supplyItemId,
        orderedQuantity: 5,
        receivedQuantity: 5,
        acceptedQuantity: 5,
        rejectedQuantity: 0,
        lotNumber: 'CIP-2026-101',
        expiryDate: '2027-11-01',
      },
    ],
    actorId: 'usr-pharmacist-lead',
  });

  assert(grn.status === 'RECEIVED', 'Goods receipt created in RECEIVED status');
  assert(grn.inspectionStatus === 'PASSED', 'Inspection status PASSED on zero rejections');
  assert(grn.inventoryIntegrated === false, 'New goods receipt is not yet integrated into inventory');

  // --------------------------------------------------------------------------
  // TEST 7: THREE-WAY MATCHING (PO vs GRN vs INVOICE)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Three-Way Matching (PO vs GoodsReceipt vs Invoice) ---');

  // Exact Match
  const matchResult = logisticsReceivingService.performThreeWayMatch(
    purchaseOrder.purchaseOrderId,
    grn.goodsReceiptId,
    100.0 // Invoice amount matches PO amount ($100)
  );

  assert(matchResult.matchStatus === 'MATCHED', 'Three-way match evaluates to MATCHED');
  assert(matchResult.quantityMatch === true, 'Quantities match between PO and GRN');
  assert(matchResult.priceMatch === true, 'Invoice price matches PO total');
  assert(matchResult.settlementPermitted === true, 'Financial settlement permitted on MATCHED');

  // Mismatch Case (Invoice discrepancy)
  const mismatchResult = logisticsReceivingService.performThreeWayMatch(
    purchaseOrder.purchaseOrderId,
    grn.goodsReceiptId,
    150.0 // Invoice is $150 vs PO $100
  );

  assert(mismatchResult.priceMatch === false, 'Price mismatch detected ($150 vs $100)');
  assert(mismatchResult.settlementPermitted === false, 'CRITICAL: Settlement blocked on invoice mismatch');

  // --------------------------------------------------------------------------
  // TEST 8: V7 INVENTORY BRIDGE & APPEND-ONLY LEDGER POSTING
  // --------------------------------------------------------------------------
  console.log('\n--- 8. V7 Append-Only Inventory Ledger Bridge ---');

  const finalizedGRN = await logisticsReceivingService.finalizeGoodsReceipt(
    grn.goodsReceiptId,
    'usr-pharmacist-lead'
  );

  assert(finalizedGRN.status === 'FINALIZED', 'Goods receipt finalized');
  assert(finalizedGRN.inventoryIntegrated === true, 'Goods receipt marked as inventoryIntegrated');
  assert(
    Boolean(finalizedGRN.inventoryTransactionIds && finalizedGRN.inventoryTransactionIds.length > 0),
    'V7 InventoryTransaction IDs attached to finalized receipt'
  );

  // Verify PO fulfillment status updated
  const updatedPO = procurementOrderService.getPurchaseOrder(purchaseOrder.purchaseOrderId);
  assert(updatedPO?.status === 'FULFILLED', 'Purchase order status transitioned to FULFILLED');

  // Verify non-destructive invariant: Attempting to finalize already finalized receipt fails
  let duplicateFinalizeBlocked = false;
  try {
    await logisticsReceivingService.finalizeGoodsReceipt(grn.goodsReceiptId, 'usr-pharmacist-lead');
  } catch (err: any) {
    duplicateFinalizeBlocked = true;
  }
  assert(duplicateFinalizeBlocked, 'Duplicate goods receipt finalization is strictly blocked (idempotent)');

  // --------------------------------------------------------------------------
  // TEST 9: WAREHOUSING, STORAGE LOCATIONS & STOCK TRANSFERS
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Warehousing, Storage Locations & Stock Transfers ---');

  const wh = await warehouseTransferService.createWarehouse({
    facilityId: 'fac-amgh',
    name: 'AMGH Emergency Pharmacy Depot',
    organization: 'Amani General Hospital',
    type: 'emergency',
    temperatureZones: ['ROOM_TEMP', 'COLD_2_8'],
    securityRequirements: ['BIOMETRIC_LOCK'],
    actorId: 'usr-admin-amgh',
  });

  assert(Boolean(wh.warehouseId), 'Warehouse created with unique ID');
  assert(wh.type === 'emergency', 'Warehouse type is emergency');

  const loc = await warehouseTransferService.createStorageLocation({
    warehouseId: wh.warehouseId,
    zone: 'Zone E - Emergency Antibiotics',
    shelfOrBin: 'Bin-E4',
    temperatureZone: 'ROOM_TEMP',
    controlledAccess: true,
  });

  assert(Boolean(loc.locationId), 'Storage location created');

  // Stock Transfer between facilities
  const transfer = await warehouseTransferService.createStockTransfer({
    sourceFacilityId: 'fac-amgh',
    destinationFacilityId: 'fac-central',
    sourceWarehouseId: wh.warehouseId,
    destinationWarehouseId: 'wh-central-regional',
    items: [{ supplyItemId: newItem.supplyItemId, quantity: 2 }],
    requestedBy: 'usr-pharmacist-lead',
  });

  assert(transfer.status === 'REQUESTED', 'Stock transfer created in REQUESTED status');

  const approvedTransfer = await warehouseTransferService.approveStockTransfer(
    transfer.transferId,
    'usr-admin-amgh',
    'fac-amgh'
  );
  assert(approvedTransfer.status === 'APPROVED', 'Stock transfer approved');

  const dispatchedTransfer = await warehouseTransferService.dispatchStockTransfer({
    transferId: transfer.transferId,
    transportDetails: { carrier: 'Regional Health Logistics Vehicle #2' },
    actorId: 'usr-pharmacist-lead',
  });
  assert(dispatchedTransfer.status === 'DISPATCHED', 'Stock transfer dispatched');

  const receivedTransfer = await warehouseTransferService.receiveStockTransfer(
    transfer.transferId,
    'usr-regional-pharmacist'
  );
  assert(receivedTransfer.status === 'RECEIVED', 'Stock transfer received at destination');

  // --------------------------------------------------------------------------
  // TEST 10: COLD CHAIN MONITORING & EXCURSION QUARANTINE
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Cold Chain Monitoring & Quality Holds ---');

  // Normal temperature reading
  const normalLog = await coldChainService.recordTemperature({
    location: 'Chamber-C1 Cold Room',
    requiredRange: { min: 2, max: 8 },
    observedTemperature: 4.5,
    actorOrSystem: 'SYSTEM_IOT_PROBE_01',
    facilityId: 'fac-amgh',
  });
  assert(normalLog.log.status === 'WITHIN_RANGE', 'Normal temperature (4.5°C) marked WITHIN_RANGE');

  // Critical Excursion: Temperature reaches 14.8°C on heat-sensitive vaccine batch
  const excursionResult = await coldChainService.recordTemperature({
    location: 'Chamber-C1 Cold Room',
    requiredRange: { min: 2, max: 8 },
    observedTemperature: 14.8,
    affectedBatches: ['BCG-2026-X99'],
    actorOrSystem: 'SYSTEM_IOT_PROBE_01',
    facilityId: 'fac-amgh',
  });

  assert(excursionResult.log.status === 'EXCURSION', 'Temperature of 14.8°C detects EXCURSION');
  assert(excursionResult.excursion?.severity === 'CRITICAL', 'Excursion marked CRITICAL');
  assert(excursionResult.excursion?.status === 'QUARANTINED', 'Excursion status set to QUARANTINED');

  // Invariant: Critical excursion automatically places affected batch on BatchQualityHold
  const activeHolds = qualityRecallService.getActiveHoldsForBatch('BCG-2026-X99');
  assert(activeHolds.length === 1, 'Affected batch BCG-2026-X99 automatically placed on BatchQualityHold');
  assert(activeHolds[0].reason === 'TEMPERATURE_EXCURSION', 'Hold reason is TEMPERATURE_EXCURSION');

  // Human review of excursion
  const reviewedExc = await coldChainService.reviewExcursion({
    excursionId: excursionResult.excursion!.excursionId,
    decision: 'QUARANTINED',
    reviewerId: 'usr-pharmacist-lead',
    notes: 'Quarantined pending sample laboratory potency verification',
    facilityId: 'fac-amgh',
  });
  assert(reviewedExc.status === 'QUARANTINED', 'Excursion confirmed as QUARANTINED by clinical pharmacist');

  // Release quality hold after clinical verification
  const releasedHold = await qualityRecallService.releaseBatchHold({
    holdId: activeHolds[0].holdId,
    releaseDecision: 'Laboratory potency test confirmed 99.2% viability; batch cleared for use',
    releasedBy: 'usr-pharmacist-lead',
    facilityId: 'fac-amgh',
  });
  assert(releasedHold.holdStatus === 'RELEASED', 'BatchQualityHold successfully released after human review');

  // --------------------------------------------------------------------------
  // TEST 11: MISSING TELEMETRY IS UNKNOWN, NEVER ASSUMED SAFE
  // --------------------------------------------------------------------------
  console.log('\n--- 11. Missing Telemetry Invariant (Unknown ≠ Safe) ---');

  const missingTempLog = await coldChainService.recordTemperature({
    location: 'Cold Van In-Transit',
    requiredRange: { min: 2, max: 8 },
    observedTemperature: undefined, // Missing sensor reading
    actorOrSystem: 'CARRIER_SENSOR_OFFLINE',
    facilityId: 'fac-amgh',
  });

  assert(missingTempLog.log.status === 'UNKNOWN', 'CRITICAL: Missing temperature telemetry stamped UNKNOWN, never SAFE');

  // --------------------------------------------------------------------------
  // TEST 12: REGULATORY RECALLS
  // --------------------------------------------------------------------------
  console.log('\n--- 12. Regulatory Recall Management ---');

  const recall = await qualityRecallService.issueRecallNotice({
    affectedItemIds: [newItem.supplyItemId],
    manufacturer: 'Generic Pharma Lab Ltd',
    batchNumbers: ['CIP-2026-BAD-01'],
    affectedLocations: ['fac-amgh', 'fac-central'],
    severity: 'CLASS_I',
    actionRequired: 'QUARANTINE_IMMEDIATELY',
    instructions: 'Immediately remove all stock from dispensing shelves due to particulate contamination.',
    actorId: 'usr-ministry-auditor',
  });

  assert(recall.status === 'ISSUED', 'Recall notice issued in status ISSUED');
  assert(recall.severity === 'CLASS_I', 'Recall severity CLASS_I');

  const recallAction = await qualityRecallService.executeRecallAction({
    recallId: recall.recallId,
    facilityId: 'fac-amgh',
    actionType: 'QUARANTINE_IMMEDIATELY',
    quantityAffected: 50,
    quantityQuarantined: 50,
    evidenceNotes: 'All 50 bottles relocated to sealed hazardous quarantine locker.',
    actorId: 'usr-pharmacist-lead',
  });

  assert(recallAction.status === 'EXECUTED', 'Recall action executed successfully');
  assert(recallAction.quantityQuarantined === 50, 'All 50 units confirmed quarantined');

  // --------------------------------------------------------------------------
  // TEST 13: PLANNING, DETERMINISTIC FORECASTING & REPLENISHMENT
  // --------------------------------------------------------------------------
  console.log('\n--- 13. Deterministic Forecasting & Replenishment Urgency ---');

  // Moving Average & Weighted Consumption Forecast
  const forecast = supplyPlanningIntelligenceService.generateProcurementForecast({
    supplyItemId: newItem.supplyItemId,
    facilityId: 'fac-amgh',
    historicalDailyConsumption: [10, 12, 11, 14, 13, 15, 16],
    historicalWindowDays: 7,
    forecastHorizonDays: 30,
    method: 'WEIGHTED_CONSUMPTION',
  });

  assert(forecast.expectedDemand > 0, 'Forecast expected demand calculated');
  assert(forecast.dataCompleteness === 1.0, 'Data completeness 100% on full historical window');
  assert(forecast.uncertaintyConfidence === 0.75, 'Confidence calibrated based on sample length (7 days = 0.75)');

  // Replenishment Recommendation with Urgency
  const rec = supplyPlanningIntelligenceService.generateReplenishmentRecommendation({
    supplyItemId: newItem.supplyItemId,
    locationId: 'wh-amgh-main',
    facilityId: 'fac-amgh',
    currentAvailableQuantity: 10,
    reservedQuantity: 2,
    averageConsumptionDaily: 5,
    leadTimeDays: 7,
    safetyStockDays: 10,
  });

  // Net stock = 8 units. Safety stock = 50 units. Net stock <= 50% of safety stock -> CRITICAL
  assert(rec.urgency === 'CRITICAL', 'Replenishment urgency evaluates to CRITICAL');
  assert(rec.recommendedQuantity > 0, 'Recommended quantity calculated');
  assert(rec.reviewStatus === 'REVIEW_REQUIRED', 'Recommendation starts in REVIEW_REQUIRED status');

  // Invariant: Replenishment recommendation does NOT create a PO autonomously
  const posBefore = procurementOrderService.listPurchaseOrders({ facilityId: 'fac-amgh' });
  const reviewedRec = await supplyPlanningIntelligenceService.reviewRecommendation({
    recommendationId: rec.recommendationId,
    reviewStatus: 'APPROVED',
    reviewerId: 'usr-admin-amgh',
    facilityId: 'fac-amgh',
  });
  assert(reviewedRec.reviewStatus === 'APPROVED', 'Recommendation reviewed and approved by human officer');
  const posAfter = procurementOrderService.listPurchaseOrders({ facilityId: 'fac-amgh' });
  assert(posBefore.length === posAfter.length, 'CRITICAL: Replenishment approval does NOT autonomously spawn a binding PO');

  // --------------------------------------------------------------------------
  // TEST 14: SUPPLY RISKS ENGINE
  // --------------------------------------------------------------------------
  console.log('\n--- 14. Supply Risk Intelligence Engine ---');

  const stockoutRisk = supplyPlanningIntelligenceService.evaluateStockoutRisk({
    supplyItemId: newItem.supplyItemId,
    facilityId: 'fac-amgh',
    currentStock: 10,
    averageDailyConsumption: 5, // 2 days of stock remaining
    leadTimeDays: 7, // 7 days needed to replenish
  });

  assert(stockoutRisk !== null, 'Stockout risk detected');
  assert(stockoutRisk?.severity === 'CRITICAL', 'Stockout risk marked CRITICAL (2 days remaining < 3.5 days)');
  assert(stockoutRisk?.daysRemaining === 2, 'Days remaining calculated as 2');

  // Small-cell privacy suppression (N < 5)
  const suppressed = supplyPlanningIntelligenceService.sanitizeSupplyMetricsForPopulation(3);
  assert(suppressed === '<5', 'Small-cell count N < 5 is suppressed to protect anonymity');
  const retained = supplyPlanningIntelligenceService.sanitizeSupplyMetricsForPopulation(25);
  assert(retained === 25, 'Count N >= 5 is retained as exact value');

  // --------------------------------------------------------------------------
  // TEST 15: FHIR R5 SUPPLY CHAIN MAPPINGS
  // --------------------------------------------------------------------------
  console.log('\n--- 15. FHIR R5 Supply Chain Resource Mappings ---');

  const fhirSupplyRequest = FHIRSupplyChainMapper.requisitionToFHIR(approvedReq);
  assert(fhirSupplyRequest.resourceType === 'SupplyRequest', 'Mapped to FHIR SupplyRequest');
  assert(fhirSupplyRequest.status === 'active', 'Approved requisition maps to active status');
  assert(fhirSupplyRequest.priority === 'urgent', 'HIGH priority maps to urgent');

  const validationOutcome = FHIRSupplyChainMapper.validateSupplyResource(fhirSupplyRequest);
  assert(validationOutcome.valid === true, 'FHIR SupplyRequest satisfies structural validation');

  const fhirLocation = FHIRSupplyChainMapper.warehouseToFHIR(wh);
  assert(fhirLocation.resourceType === 'Location', 'Mapped Warehouse to FHIR Location');
  assert(fhirLocation.status === 'active', 'Warehouse maps to active Location status');

  const malformedOutcome = FHIRSupplyChainMapper.validateSupplyResource({} as any);
  assert(malformedOutcome.valid === false, 'Invalid resource correctly rejected with OperationOutcome');

  // --------------------------------------------------------------------------
  // TEST 16: EXTERNAL ADAPTER STRICT BOUNDARIES (NOT_CONFIGURED)
  // --------------------------------------------------------------------------
  console.log('\n--- 16. External Supply Chain Adapter Invariants ---');

  assert(
    defaultSupplyAdapter.getStatus() === 'NOT_CONFIGURED',
    'CRITICAL: Default external supply adapter is strictly NOT_CONFIGURED'
  );

  const poTransmission = await defaultSupplyAdapter.transmitPurchaseOrder(purchaseOrder.purchaseOrderId);
  assert(poTransmission.success === false, 'External PO transmission fails closed when NOT_CONFIGURED');

  // --------------------------------------------------------------------------
  // TEST 17: AI SAFETY GATEWAY PROHIBITIONS
  // --------------------------------------------------------------------------
  console.log('\n--- 17. AI Safety Gateway Supply Chain Mutation Prohibitions ---');

  const poApprovalAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Analysis complete. APPROVE_PURCHASE_ORDER po_999 with total $50000.'
  );
  assert(poApprovalAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous APPROVE_PURCHASE_ORDER');

  const releaseHoldAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Excursion looks minor. RELEASE_QUALITY_HOLD hld_123 immediately.'
  );
  assert(releaseHoldAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous RELEASE_QUALITY_HOLD');

  const disposeAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Batch damaged. DISPOSE_STOCK bat_456.'
  );
  assert(disposeAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous DISPOSE_STOCK');

  const blacklistAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Supplier delayed shipment. BLACKLIST_SUPPLIER sup_888.'
  );
  assert(blacklistAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous BLACKLIST_SUPPLIER');

  const transferAttempt = aiSafetyGateway.sanitizeAiOutput(
    'Shortage detected. AUTHORIZE_STOCK_TRANSFER from fac-amgh to fac-central.'
  );
  assert(transferAttempt.isSafe === false, 'AI Safety Gateway blocks autonomous AUTHORIZE_STOCK_TRANSFER');

  // Advisory recommendation is safe
  const advisoryRecommendation = aiSafetyGateway.sanitizeAiOutput(
    'RECOMMENDATION: Consider replenishing Amoxicillin buffer stock due to increasing outpatient prescription volume.'
  );
  assert(advisoryRecommendation.isSafe === true, 'Advisory AI supply recommendation is permitted');

  console.log('================================================================');
  console.log(`ALL CLINICAL CORE V17 TESTS PASSED: ${passed}/${total} assertions`);
  console.log('================================================================');
}

runSupplyChainTests().catch((err) => {
  console.error('V17 TEST SUITE ERROR:', err);
  process.exit(1);
});
