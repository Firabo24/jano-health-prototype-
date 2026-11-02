/**
 * Jano Health - Clinical Core V7: Pharmacy Operations, Inventory & Dispensing Domain Types
 * 
 * Architectural Boundaries:
 * Prescription ≠ DispenseRecord ≠ InventoryTransaction ≠ MedicationAdministration
 * 
 * Authoritative Principles:
 * 1. The authoritative dispensing state comes from DispenseRecord (not Prescription.status alone).
 * 2. The authoritative stock state comes from the append-only InventoryTransaction ledger.
 * 3. Clinical prescribing (Physician/Health Officer) and Pharmacy dispensing (Pharmacist) are strictly separated.
 * 4. Dispensing atomically links prescription validation, batch availability, ledger movements, and audit.
 */

import { RoleType } from './types';

export interface EntityProvenance {
  source: string;
  version?: string;
  recordedBy?: string;
  recordedAt?: string;
  facilityId: string;
  actorId?: string;
  deviceId?: string;
  createdAt?: string;
  integrityHash?: string;
}

export type SyncStatus =
  | 'PENDING'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED'
  | 'CONFLICT'
  | 'offline_retained'
  | 'synced'
  | 'pending'
  | 'conflict_detected'
  | 'reconciled';

export type DispenseStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PARTIALLY_DISPENSED'
  | 'DISPENSED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'REVERSED';

export type BatchStatus =
  | 'AVAILABLE'
  | 'QUARANTINED'
  | 'EXPIRED'
  | 'RECALLED'
  | 'DEPLETED';

export type InventoryTransactionType =
  | 'RECEIPT'
  | 'DISPENSE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'WASTAGE'
  | 'EXPIRY'
  | 'RETURN'
  | 'REVERSAL';

export type WastageReason =
  | 'EXPIRED'
  | 'DAMAGED'
  | 'SPILLAGE'
  | 'BREAKAGE'
  | 'TEMPERATURE_EXCURSION'
  | 'OTHER';

export type StockSelectionStrategy = 'FEFO' | 'FIFO' | 'MANUAL';

export interface StorageRequirementsMetadata {
  type: 'ROOM_TEMPERATURE' | 'REFRIGERATED' | 'COLD_CHAIN' | 'PROTECTED_FROM_LIGHT' | 'CONTROLLED_SUBSTANCE' | 'STANDARD';
  minTemperatureCelsius?: number;
  maxTemperatureCelsius?: number;
  lightSensitive?: boolean;
  humidityControlled?: boolean;
  notes?: string;
  source?: string;
  version?: string;
}

/**
 * Facility-level stockable inventory item definition.
 * Distinct from MedicationDefinition (which is the universal drug concept/formulary).
 */
export interface InventoryItem {
  id: string; // e.g., inv_item_<UUIDv7>
  facilityId: string;
  medicationDefinitionId: string;
  medicationCode: string;
  genericName: string;
  formulation: string;
  strength: string;
  unit: string;
  storageRequirements: StorageRequirementsMetadata;
  reorderPoint: number;
  minimumStock: number;
  maximumStock: number;
  active: boolean;
  provenance: EntityProvenance;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Physical batch/lot of stock for an inventory item.
 */
export interface InventoryBatch {
  id: string; // e.g., batch_<UUIDv7>
  inventoryItemId: string;
  facilityId: string;
  batchNumber: string;
  lotNumber?: string;
  manufactureDate?: string;
  expiryDate: string; // ISO 8601 string YYYY-MM-DD or full timestamp
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number; // quantityOnHand - reservedQuantity
  supplierId?: string;
  supplierName?: string;
  receivedAt: string;
  receivedById: string;
  receivedByName?: string;
  status: BatchStatus;
  quarantineReason?: string;
  quarantinedAt?: string;
  quarantinedById?: string;
  recallNotice?: string;
  recalledAt?: string;
  recalledById?: string;
  provenance: EntityProvenance;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Immutable append-only inventory ledger movement.
 */
export interface InventoryTransaction {
  id: string; // txn_<UUIDv7>
  facilityId: string;
  inventoryItemId: string;
  batchId: string;
  transactionType: InventoryTransactionType;
  quantity: number; // Magnitude of change (delta applied based on transactionType)
  unit: string;
  referenceType: 'DISPENSE_RECORD' | 'RECEIPT' | 'TRANSFER' | 'WASTAGE' | 'MANUAL_ADJUSTMENT' | 'EXPIRY' | 'RETURN' | 'REVERSAL';
  referenceId: string;
  actorId: string;
  actorName?: string;
  actorRole?: RoleType;
  occurredAt: string;
  reason?: string;
  source: string;
  version: number;
  eventId: string;
}

/**
 * Authoritative Dispense Record aggregate representing the physical act of dispensing.
 */
export interface DispenseRecord {
  // Identity:
  id: string; // disp_<UUIDv7>
  dispenseNumber: string; // DSP-<FAC>-<YYYYMMDD>-<DEV>-<SEQ><Luhn36>
  prescriptionId: string;
  medicationOrderId: string;
  patientId: string;
  encounterId?: string;
  facilityId: string;

  // Pharmacy:
  pharmacyId?: string;
  dispensingPharmacistId: string;
  dispensingPharmacistRole: RoleType;
  dispensingPharmacistName?: string;
  dispensedAt: string;

  // Medication:
  medicationDefinitionId: string;
  medicationCode: string;
  genericName: string;
  formulation: string;
  strength: string;
  route: string;

  // Quantity:
  quantityPrescribed: number;
  quantityDispensed: number;
  quantityRemaining: number;
  quantityUnit: string;

  // Stock:
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  lotNumber?: string;
  expiryDate: string;

  // Clinical / operational:
  counselingNotes?: string;
  counselingProvided?: boolean;
  counselorId?: string;
  counseledAt?: string;
  substitutionUsed?: boolean;
  substitutionReason?: string;
  originalMedicationCode?: string;
  originalMedicationName?: string;
  partialDispense?: boolean;
  notes?: string;

  // Lifecycle:
  status: DispenseStatus;
  version: number;
  reversalReason?: string;
  reversedAt?: string;
  reversedById?: string;
  reversedByName?: string;

  // Backwards compatibility aliases
  dispensedById?: string;

  // Provenance:
  source: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;

  // Synchronization:
  syncStatus: SyncStatus;
  syncedAt?: string;
}

/**
 * Verification checklist for pharmacist clinical review of an issued prescription.
 */
export interface PharmacyVerificationChecklist {
  patientVerified: boolean;
  prescriptionValid: boolean;
  prescriberVerified: boolean;
  medicationMatch: boolean;
  doseRouteFrequencyVerified: boolean;
  safetyWarningsChecked: boolean;
  inventoryAvailable: boolean;
}

/**
 * Formal clinical pharmacy review document.
 */
export interface PharmacyReview {
  id: string; // rx_rev_<UUIDv7>
  prescriptionId: string;
  medicationOrderId: string;
  patientId: string;
  facilityId: string;
  pharmacistId: string;
  pharmacistName: string;
  pharmacistRole: RoleType;
  reviewedAt: string;
  decision: 'APPROVED' | 'REJECTED' | 'CLARIFICATION_NEEDED';
  verificationChecklist: PharmacyVerificationChecklist;
  notes?: string;
  version: number;
  createdAt: string;
}

export interface InventoryReceiptItem {
  inventoryItemId: string;
  medicationCode: string;
  genericName: string;
  batchNumber: string;
  lotNumber?: string;
  expiryDate: string;
  quantity: number;
  unit: string;
  storageCondition?: string;
}

export interface InventoryReceipt {
  id: string; // rcv_<UUIDv7>
  receiptNumber: string;
  facilityId: string;
  supplierId?: string;
  supplierName: string;
  referenceDocument?: string;
  receivedBy: string;
  receivedById: string;
  receivedAt: string;
  items: InventoryReceiptItem[];
  status: 'PENDING' | 'RECEIVED' | 'VERIFIED' | 'CANCELLED';
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransfer {
  id: string; // trf_<UUIDv7>
  transferNumber: string;
  sourceFacilityId: string;
  destinationFacilityId: string;
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unit: string;
  status: 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';
  initiatedById: string;
  initiatedByName?: string;
  initiatedAt: string;
  receivedById?: string;
  receivedByName?: string;
  receivedAt?: string;
  referenceNotes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryWastage {
  id: string; // wst_<UUIDv7>
  wastageNumber: string;
  facilityId: string;
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unit: string;
  reason: WastageReason;
  actorId: string;
  actorName: string;
  occurredAt: string;
  notes?: string;
  version: number;
  createdAt: string;
}

/**
 * Materialized stock calculation for rapid UI presentation.
 */
export interface StockProjection {
  inventoryItemId: string;
  facilityId: string;
  medicationCode: string;
  genericName: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  batches: Array<{
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    quantityOnHand: number;
    availableQuantity: number;
    status: BatchStatus;
  }>;
  calculatedAt: string;
}

/**
 * Temperature monitoring foundation abstraction (without regulatory claims).
 */
export interface TemperatureLog {
  id: string;
  facilityId: string;
  storageUnitId: string;
  temperatureCelsius: number;
  humidityPercentage?: number;
  recordedAt: string;
  recordedById?: string;
  isExcursion: boolean;
  notes?: string;
}

export interface ColdChainEvent {
  id: string;
  facilityId: string;
  storageUnitId: string;
  eventType: 'EXCURSION_DETECTED' | 'UNIT_RESTOCKED' | 'POWER_OUTAGE' | 'RESTORED' | 'MAINTENANCE';
  occurredAt: string;
  description: string;
  actionTaken?: string;
  reportedById: string;
}
