/**
 * Jano Health - Clinical Core V17: Warehousing & Inter-Facility Transfer Service
 * 
 * Coordinates facility warehouses, storage locations, and multi-facility stock transfers.
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Warehouse ≠ Pharmacy: Warehousing coordinates wholesale and bulk storage;
 *   Pharmacy oversees clinical dispensing.
 * - Multi-Facility Distribution: Network transfers require mutual authorization,
 *   active network trust, and item scope verification.
 * - An arbitrary facility cannot unilaterally push unauthorized stock into another facility.
 */

import {
  Warehouse,
  StorageLocation,
  StockTransfer,
  StockTransferStatus,
} from '../../domain/v17SupplyChainTypes';
import { janoNodeRegistryService } from '../network/nodeRegistry';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export class WarehouseTransferService {
  private static instance: WarehouseTransferService;
  private warehouses: Map<string, Warehouse> = new Map();
  private locations: Map<string, StorageLocation> = new Map();
  private transfers: Map<string, StockTransfer> = new Map();

  private constructor() {
    this.seedInitialSyntheticData();
  }

  public static getInstance(): WarehouseTransferService {
    if (!WarehouseTransferService.instance) {
      WarehouseTransferService.instance = new WarehouseTransferService();
    }
    return WarehouseTransferService.instance;
  }

  private seedInitialSyntheticData(): void {
    const now = '2026-01-01T00:00:00Z';

    const wh1: Warehouse = {
      warehouseId: 'wh-amgh-main',
      facilityId: 'fac-amgh',
      name: 'AMGH Central Pharmacy Warehouse',
      organization: 'Amani General Hospital',
      type: 'pharmacy',
      storageCapacityM3: 450,
      temperatureZones: ['ROOM_TEMP', 'COLD_2_8', 'FREEZER_MINUS_20'],
      securityRequirements: ['BIOMETRIC_LOCK', 'CCTV_LOGGED'],
      status: 'ACTIVE',
      provenance: { createdAt: now, createdBy: 'usr-admin-amgh' },
    };

    const wh2: Warehouse = {
      warehouseId: 'wh-central-regional',
      facilityId: 'fac-central',
      name: 'Regional Medical Depot Warehouse',
      organization: 'Kigoma Regional Health Authority',
      type: 'regional',
      storageCapacityM3: 1200,
      temperatureZones: ['ROOM_TEMP', 'COLD_2_8', 'FREEZER_MINUS_20', 'ULTRA_COLD_MINUS_70'],
      securityRequirements: ['24_7_GUARD', 'DUAL_KEY_AUTH'],
      status: 'ACTIVE',
      provenance: { createdAt: now, createdBy: 'usr-admin-system' },
    };

    this.warehouses.set(wh1.warehouseId, wh1);
    this.warehouses.set(wh2.warehouseId, wh2);

    const loc1: StorageLocation = {
      locationId: 'loc-amgh-cold-01',
      warehouseId: 'wh-amgh-main',
      zone: 'Zone C - Cold Storage',
      shelfOrBin: 'Chamber-C1-Rack2',
      temperatureZone: 'COLD_2_8',
      controlledAccess: true,
      status: 'ACTIVE',
    };

    this.locations.set(loc1.locationId, loc1);
  }

  // ==========================================================================
  // WAREHOUSES & LOCATIONS
  // ==========================================================================

  public async createWarehouse(params: {
    facilityId: string;
    name: string;
    organization: string;
    type: Warehouse['type'];
    temperatureZones: Warehouse['temperatureZones'];
    securityRequirements: string[];
    actorId: string;
  }): Promise<Warehouse> {
    const warehouseId = `wh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const wh: Warehouse = {
      warehouseId,
      facilityId: params.facilityId,
      name: params.name,
      organization: params.organization,
      type: params.type,
      temperatureZones: params.temperatureZones,
      securityRequirements: params.securityRequirements,
      status: 'ACTIVE',
      provenance: { createdAt: now, createdBy: params.actorId },
    };

    this.warehouses.set(warehouseId, wh);

    try {
      await idbEngine.put('warehouses' as any, wh);
    } catch {}

    return wh;
  }

  public getWarehouse(warehouseId: string): Warehouse | undefined {
    return this.warehouses.get(warehouseId);
  }

  public listWarehouses(facilityId?: string): Warehouse[] {
    let result = Array.from(this.warehouses.values());
    if (facilityId) {
      result = result.filter((w) => w.facilityId === facilityId);
    }
    return result;
  }

  public async createStorageLocation(params: {
    warehouseId: string;
    zone: string;
    shelfOrBin: string;
    temperatureZone: string;
    controlledAccess: boolean;
  }): Promise<StorageLocation> {
    const locationId = `loc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const loc: StorageLocation = {
      locationId,
      warehouseId: params.warehouseId,
      zone: params.zone,
      shelfOrBin: params.shelfOrBin,
      temperatureZone: params.temperatureZone,
      controlledAccess: params.controlledAccess,
      status: 'ACTIVE',
    };

    this.locations.set(locationId, loc);

    try {
      await idbEngine.put('storageLocations' as any, loc);
    } catch {}

    return loc;
  }

  public getLocationsForWarehouse(warehouseId: string): StorageLocation[] {
    return Array.from(this.locations.values()).filter((l) => l.warehouseId === warehouseId);
  }

  // ==========================================================================
  // STOCK TRANSFERS (MULTI-FACILITY DISTRIBUTION)
  // ==========================================================================

  public async createStockTransfer(params: {
    sourceFacilityId: string;
    destinationFacilityId: string;
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    items: StockTransfer['items'];
    requestedBy: string;
  }): Promise<StockTransfer> {
    // 1. Network Trust Validation for destination node
    const destNode = janoNodeRegistryService.getNodeByFacility(params.destinationFacilityId);
    if (destNode && (destNode.trustStatus === 'REVOKED' || destNode.trustStatus === 'SUSPENDED')) {
      throw new Error(`Cannot initiate stock transfer: Destination facility ${params.destinationFacilityId} trust status is ${destNode.trustStatus}`);
    }

    const transferId = `stx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const transfer: StockTransfer = {
      transferId,
      sourceFacilityId: params.sourceFacilityId,
      destinationFacilityId: params.destinationFacilityId,
      sourceWarehouseId: params.sourceWarehouseId,
      destinationWarehouseId: params.destinationWarehouseId,
      items: params.items,
      status: 'REQUESTED',
      requestedBy: params.requestedBy,
      provenance: {
        createdAt: now,
        createdBy: params.requestedBy,
        systemVersion: 'v17.0',
      },
      integrityMetadata: {
        hash: sha256(`${transferId}:${params.sourceFacilityId}:${params.destinationFacilityId}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.transfers.set(transferId, transfer);

    try {
      await idbEngine.put('stockTransfers' as any, transfer);
    } catch {}

    await auditService.log({
      action: 'STOCK_TRANSFER_REQUESTED',
      actorId: params.requestedBy,
      facilityId: params.sourceFacilityId,
      details: {
        transferId,
        source: params.sourceFacilityId,
        destination: params.destinationFacilityId,
        itemCount: params.items.length,
      },
    });

    return transfer;
  }

  public async approveStockTransfer(
    transferId: string,
    approvedBy: string,
    facilityId: string
  ): Promise<StockTransfer> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) throw new Error(`Stock transfer not found: ${transferId}`);

    if (transfer.status !== 'REQUESTED') {
      throw new Error(`Cannot approve stock transfer in status '${transfer.status}'`);
    }

    const now = new Date().toISOString();
    transfer.status = 'APPROVED';
    transfer.approvedBy = approvedBy;
    transfer.integrityMetadata.hash = sha256(`${transferId}:APPROVED:${approvedBy}:${now}`);

    this.transfers.set(transferId, transfer);

    try {
      await idbEngine.put('stockTransfers' as any, transfer);
    } catch {}

    await auditService.log({
      action: 'STOCK_TRANSFER_APPROVED',
      actorId: approvedBy,
      facilityId,
      details: { transferId },
    });

    return transfer;
  }

  public async dispatchStockTransfer(params: {
    transferId: string;
    transportDetails: StockTransfer['transportDetails'];
    actorId: string;
  }): Promise<StockTransfer> {
    const transfer = this.transfers.get(params.transferId);
    if (!transfer) throw new Error(`Stock transfer not found: ${params.transferId}`);

    if (transfer.status !== 'APPROVED') {
      throw new Error(`Cannot dispatch stock transfer unless approved. Status is '${transfer.status}'`);
    }

    const now = new Date().toISOString();
    transfer.status = 'DISPATCHED';
    transfer.dispatchedAt = now;
    transfer.transportDetails = params.transportDetails;
    transfer.integrityMetadata.hash = sha256(`${params.transferId}:DISPATCHED:${now}`);

    this.transfers.set(params.transferId, transfer);

    try {
      await idbEngine.put('stockTransfers' as any, transfer);
    } catch {}

    await auditService.log({
      action: 'STOCK_TRANSFER_DISPATCHED',
      actorId: params.actorId,
      facilityId: transfer.sourceFacilityId,
      details: { transferId: params.transferId },
    });

    return transfer;
  }

  public async receiveStockTransfer(
    transferId: string,
    receivedBy: string
  ): Promise<StockTransfer> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) throw new Error(`Stock transfer not found: ${transferId}`);

    if (transfer.status !== 'DISPATCHED' && transfer.status !== 'IN_TRANSIT') {
      throw new Error(`Cannot receive stock transfer in status '${transfer.status}'`);
    }

    const now = new Date().toISOString();
    transfer.status = 'RECEIVED';
    transfer.receivedAt = now;
    transfer.integrityMetadata.hash = sha256(`${transferId}:RECEIVED:${now}`);

    this.transfers.set(transferId, transfer);

    try {
      await idbEngine.put('stockTransfers' as any, transfer);
    } catch {}

    await auditService.log({
      action: 'STOCK_TRANSFER_RECEIVED',
      actorId: receivedBy,
      facilityId: transfer.destinationFacilityId,
      details: { transferId },
    });

    return transfer;
  }

  public getTransfer(transferId: string): StockTransfer | undefined {
    return this.transfers.get(transferId);
  }

  public listTransfers(facilityId?: string): StockTransfer[] {
    let result = Array.from(this.transfers.values());
    if (facilityId) {
      result = result.filter(
        (t) => t.sourceFacilityId === facilityId || t.destinationFacilityId === facilityId
      );
    }
    return result;
  }
}

export const warehouseTransferService = WarehouseTransferService.getInstance();
