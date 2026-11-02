/**
 * Jano Health - Clinical Core V17: Supply Catalogue Service
 * 
 * Manages the healthcare commodities, medicines, vaccines, and consumable catalogue.
 * 
 * CORE ARCHITECTURAL INVARIANTS:
 * - SupplyItem ≠ MedicationDefinition: Procurement commodity identity is separate
 *   from clinical medication definitions. A supply item may link to a medication definition
 *   via medicationReferenceId, but maintains its own commercial, packaging, and storage specs.
 * - Missing storage or temperature data is never assumed safe.
 */

import {
  SupplyItem,
  SupplyCategory,
  ProcurementClassification,
} from '../../domain/v17SupplyChainTypes';
import { idbEngine } from '../storage/indexedDbEngine';
import { auditService } from '../audit/auditService';
import { sha256 } from '../../domain/eventIntegrity';

export class SupplyCatalogService {
  private static instance: SupplyCatalogService;
  private items: Map<string, SupplyItem> = new Map();

  private constructor() {
    this.seedInitialSyntheticCatalog();
  }

  public static getInstance(): SupplyCatalogService {
    if (!SupplyCatalogService.instance) {
      SupplyCatalogService.instance = new SupplyCatalogService();
    }
    return SupplyCatalogService.instance;
  }

  private seedInitialSyntheticCatalog(): void {
    const now = '2026-01-01T00:00:00Z';

    const defaultItems: SupplyItem[] = [
      {
        supplyItemId: 'itm-amox-500',
        code: 'MED-AMOX-500MG',
        name: 'Amoxicillin 500mg Capsules (1000s)',
        genericName: 'Amoxicillin',
        category: 'medicines',
        unitOfMeasure: 'CAPSULE',
        packagingUnit: 'BOTTLE_1000',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'CONTROLLED_ROOM',
          minCelsius: 15,
          maxCelsius: 25,
          humiditySensitive: true,
        },
        expiryRequired: true,
        batchTrackingRequired: true,
        controlledItemFlag: false,
        medicationReferenceId: 'med-amox-500',
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-amox-500:MED-AMOX-500MG:${now}`),
          lastVerifiedAt: now,
        },
      },
      {
        supplyItemId: 'itm-al-20-120',
        code: 'MED-AL-20-120',
        name: 'Artemether 20mg / Lumefantrine 120mg Tablets (24s)',
        genericName: 'Artemether + Lumefantrine',
        category: 'medicines',
        unitOfMeasure: 'TABLET',
        packagingUnit: 'BLISTER_24',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'CONTROLLED_ROOM',
          minCelsius: 15,
          maxCelsius: 30,
        },
        expiryRequired: true,
        batchTrackingRequired: true,
        controlledItemFlag: false,
        medicationReferenceId: 'med-al-tab',
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-al-20-120:MED-AL-20-120:${now}`),
          lastVerifiedAt: now,
        },
      },
      {
        supplyItemId: 'itm-bcg-vaccine',
        code: 'VAC-BCG-10DOSE',
        name: 'BCG Vaccine for Tuberculosis (20-dose vial with diluent)',
        genericName: 'Bacillus Calmette-Guérin Vaccine',
        category: 'vaccines',
        unitOfMeasure: 'VIAL',
        packagingUnit: 'BOX_10_VIALS',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'COLD_CHAIN_2_8',
          minCelsius: 2,
          maxCelsius: 8,
          lightSensitive: true,
        },
        temperatureRequirements: {
          min: 2,
          max: 8,
          unit: 'CELSIUS',
        },
        expiryRequired: true,
        batchTrackingRequired: true,
        controlledItemFlag: true,
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-bcg-vaccine:VAC-BCG-10DOSE:${now}`),
          lastVerifiedAt: now,
        },
      },
      {
        supplyItemId: 'itm-oxytocin-10iu',
        code: 'MED-OXY-10IU',
        name: 'Oxytocin Injection 10 IU/ml (100 ampoules)',
        genericName: 'Oxytocin',
        category: 'medicines',
        unitOfMeasure: 'AMPOULE',
        packagingUnit: 'BOX_100',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'COLD_CHAIN_2_8',
          minCelsius: 2,
          maxCelsius: 8,
        },
        temperatureRequirements: {
          min: 2,
          max: 8,
          unit: 'CELSIUS',
        },
        expiryRequired: true,
        batchTrackingRequired: true,
        controlledItemFlag: true,
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-oxytocin-10iu:MED-OXY-10IU:${now}`),
          lastVerifiedAt: now,
        },
      },
      {
        supplyItemId: 'itm-rdt-malaria',
        code: 'LAB-MAL-RDT-25',
        name: 'Malaria Pf/Pv Rapid Diagnostic Test Kits (25 tests)',
        category: 'laboratory_reagents',
        unitOfMeasure: 'TEST',
        packagingUnit: 'KIT_25',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'CONTROLLED_ROOM',
          minCelsius: 4,
          maxCelsius: 30,
        },
        expiryRequired: true,
        batchTrackingRequired: true,
        controlledItemFlag: false,
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-rdt-malaria:LAB-MAL-RDT-25:${now}`),
          lastVerifiedAt: now,
        },
      },
      {
        supplyItemId: 'itm-oxygen-cyl-g',
        code: 'GAS-OXY-CYL-G',
        name: 'Medical Oxygen Compressed Gas Cylinder (Size G, 3400L)',
        category: 'oxygen_related',
        unitOfMeasure: 'CYLINDER',
        packagingUnit: 'CYLINDER',
        procurementClassification: 'VITAL',
        storageRequirements: {
          temperatureZone: 'ROOM_TEMPERATURE',
          securityRestricted: true,
        },
        expiryRequired: false,
        batchTrackingRequired: true,
        controlledItemFlag: true,
        active: true,
        provenance: {
          createdAt: now,
          createdBy: 'usr-admin-system',
          systemVersion: 'v17.0',
        },
        version: 1,
        integrityMetadata: {
          hash: sha256(`itm-oxygen-cyl-g:GAS-OXY-CYL-G:${now}`),
          lastVerifiedAt: now,
        },
      },
    ];

    for (const item of defaultItems) {
      this.items.set(item.supplyItemId, item);
    }
  }

  public async createSupplyItem(params: {
    code: string;
    name: string;
    genericName?: string;
    category: SupplyCategory;
    unitOfMeasure: string;
    packagingUnit: string;
    procurementClassification: ProcurementClassification;
    storageRequirements: SupplyItem['storageRequirements'];
    temperatureRequirements?: SupplyItem['temperatureRequirements'];
    expiryRequired: boolean;
    batchTrackingRequired: boolean;
    controlledItemFlag: boolean;
    medicationReferenceId?: string;
    actorId: string;
    facilityId?: string;
  }): Promise<SupplyItem> {
    const supplyItemId = `itm_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const item: SupplyItem = {
      supplyItemId,
      code: params.code,
      name: params.name,
      genericName: params.genericName,
      category: params.category,
      unitOfMeasure: params.unitOfMeasure,
      packagingUnit: params.packagingUnit,
      procurementClassification: params.procurementClassification,
      storageRequirements: params.storageRequirements,
      temperatureRequirements: params.temperatureRequirements,
      expiryRequired: params.expiryRequired,
      batchTrackingRequired: params.batchTrackingRequired,
      controlledItemFlag: params.controlledItemFlag,
      medicationReferenceId: params.medicationReferenceId,
      active: true,
      provenance: {
        createdAt: now,
        createdBy: params.actorId,
        facilityId: params.facilityId,
        systemVersion: 'v17.0',
      },
      version: 1,
      integrityMetadata: {
        hash: sha256(`${supplyItemId}:${params.code}:${now}`),
        lastVerifiedAt: now,
      },
    };

    this.items.set(supplyItemId, item);

    try {
      await idbEngine.put('supplyItems' as any, item);
    } catch {}

    await auditService.log({
      action: 'SUPPLY_ITEM_CREATED',
      actorId: params.actorId,
      facilityId: params.facilityId || 'system',
      details: {
        supplyItemId,
        code: item.code,
        name: item.name,
        category: item.category,
      },
    });

    return item;
  }

  public getItem(supplyItemId: string): SupplyItem | undefined {
    return this.items.get(supplyItemId);
  }

  public getItemByCode(code: string): SupplyItem | undefined {
    return Array.from(this.items.values()).find((i) => i.code.toLowerCase() === code.toLowerCase());
  }

  public listItems(filter?: {
    category?: SupplyCategory;
    activeOnly?: boolean;
    classification?: ProcurementClassification;
    controlledOnly?: boolean;
  }): SupplyItem[] {
    let result = Array.from(this.items.values());

    if (filter?.category) {
      result = result.filter((i) => i.category === filter.category);
    }
    if (filter?.activeOnly) {
      result = result.filter((i) => i.active);
    }
    if (filter?.classification) {
      result = result.filter((i) => i.procurementClassification === filter.classification);
    }
    if (filter?.controlledOnly) {
      result = result.filter((i) => i.controlledItemFlag);
    }

    return result;
  }
}

export const supplyCatalogService = SupplyCatalogService.getInstance();
