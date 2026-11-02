/**
 * Jano Health - Network Directory & Discovery Subsystem
 * Clinical Core V13: Facility, Practitioner, and Service Discovery with Offline Caching
 */

import {
  FacilityDirectoryEntry,
  PractitionerDirectoryEntry,
  ServiceDirectoryEntry,
} from '../../domain/types';
import { janoNodeRegistryService } from './nodeRegistry';
import { idbEngine } from '../storage/indexedDbEngine';

export class JanoFacilityRegistryService {
  private static instance: JanoFacilityRegistryService;
  private facilities: Map<string, FacilityDirectoryEntry> = new Map();
  private practitioners: Map<string, PractitionerDirectoryEntry> = new Map();
  private services: Map<string, ServiceDirectoryEntry> = new Map();

  private constructor() {
    this.seedDefaultDirectory();
  }

  public static getInstance(): JanoFacilityRegistryService {
    if (!JanoFacilityRegistryService.instance) {
      JanoFacilityRegistryService.instance = new JanoFacilityRegistryService();
    }
    return JanoFacilityRegistryService.instance;
  }

  private seedDefaultDirectory(): void {
    const facilities: FacilityDirectoryEntry[] = [
      {
        facilityId: 'fac-uvinza-hc',
        facilityCode: 'TZ-KG-UV01',
        name: 'Uvinza Primary Health Centre',
        type: 'health_center',
        region: 'Western Province',
        district: 'Uvinza District',
        operatingStatus: 'ACTIVE',
        supportedExchangeProfiles: ['patient-summary', 'referral', 'lab-exchange', 'emergency-transfer'],
        capabilities: {
          referralDestination: false,
          emergencyCapability: true,
          laboratoryCapability: true,
          radiologyCapability: false,
          pharmacyCapability: true,
          inpatientCapability: true,
        },
        associatedNodeId: 'node-uvinza-01',
        nodeStatus: 'ONLINE',
        lastSyncAt: new Date().toISOString(),
      },
      {
        facilityId: 'fac-kigoma-dh',
        facilityCode: 'TZ-KG-DH01',
        name: 'Kigoma District Referral Hospital',
        type: 'district_hospital',
        region: 'Western Province',
        district: 'Kigoma Urban',
        operatingStatus: 'ACTIVE',
        supportedExchangeProfiles: [
          'patient-summary',
          'referral',
          'lab-exchange',
          'radiology-report',
          'emergency-transfer',
          'medication-history',
        ],
        capabilities: {
          referralDestination: true,
          emergencyCapability: true,
          laboratoryCapability: true,
          radiologyCapability: true,
          pharmacyCapability: true,
          inpatientCapability: true,
        },
        associatedNodeId: 'node-kigoma-01',
        nodeStatus: 'ONLINE',
        lastSyncAt: new Date().toISOString(),
      },
      {
        facilityId: 'fac-nguruka-clinic',
        facilityCode: 'TZ-KG-RC03',
        name: 'Nguruka Sub-County Dispensary',
        type: 'rural_clinic',
        region: 'Western Province',
        district: 'Nguruka Zone',
        operatingStatus: 'ACTIVE',
        supportedExchangeProfiles: ['patient-summary', 'referral', 'emergency-transfer'],
        capabilities: {
          referralDestination: false,
          emergencyCapability: true,
          laboratoryCapability: false,
          radiologyCapability: false,
          pharmacyCapability: true,
          inpatientCapability: false,
        },
        associatedNodeId: 'node-nguruka-01',
        nodeStatus: 'ONLINE',
        lastSyncAt: new Date().toISOString(),
      },
      {
        facilityId: 'fac-mobile-unit-02',
        facilityCode: 'TZ-KG-MOB02',
        name: 'Mobile Outreach Unit Bravo (Lake Tang)',
        type: 'mobile_unit',
        region: 'Western Province',
        district: 'Lakeside Communes',
        operatingStatus: 'ACTIVE',
        supportedExchangeProfiles: ['patient-summary', 'emergency-transfer'],
        capabilities: {
          referralDestination: false,
          emergencyCapability: true,
          laboratoryCapability: false,
          radiologyCapability: false,
          pharmacyCapability: true,
          inpatientCapability: false,
        },
        associatedNodeId: 'node-mobile-02',
        nodeStatus: 'OFFLINE',
        lastSyncAt: new Date().toISOString(),
      },
    ];

    facilities.forEach((f) => this.facilities.set(f.facilityId, f));

    const practitioners: PractitionerDirectoryEntry[] = [
      {
        practitionerId: 'usr-physician-sarah',
        fullName: 'Dr. Sarah Alemu, MD',
        role: 'physician',
        specialty: 'Internal Medicine / Infectious Disease',
        primaryFacilityId: 'fac-uvinza-hc',
        facilityName: 'Uvinza Primary Health Centre',
        departmentName: 'General Outpatient',
        activeStatus: true,
        canReceiveReferrals: true,
      },
      {
        practitionerId: 'usr-doctor-01',
        fullName: 'Dr. Amani Mwanga, MD',
        role: 'physician',
        specialty: 'General Practice & Surgery',
        primaryFacilityId: 'fac-kigoma-dh',
        facilityName: 'Kigoma District Referral Hospital',
        departmentName: 'Emergency Medicine',
        activeStatus: true,
        canReceiveReferrals: true,
      },
      {
        practitionerId: 'usr-rad-yonatan',
        fullName: 'Dr. Yonatan Abebe, MD',
        role: 'radiologist',
        specialty: 'Diagnostic Radiology',
        primaryFacilityId: 'fac-kigoma-dh',
        facilityName: 'Kigoma District Referral Hospital',
        departmentName: 'Radiology Department',
        activeStatus: true,
        canReceiveReferrals: true,
      },
      {
        practitionerId: 'usr-sup-elias',
        fullName: 'Dr. Elias Kebede, MD',
        role: 'clinical_supervisor',
        specialty: 'Emergency Medicine / Critical Care',
        primaryFacilityId: 'fac-kigoma-dh',
        facilityName: 'Kigoma District Referral Hospital',
        departmentName: 'Trauma & Resuscitation Center',
        activeStatus: true,
        canReceiveReferrals: true,
      },
    ];

    practitioners.forEach((p) => this.practitioners.set(p.practitionerId, p));

    const services: ServiceDirectoryEntry[] = [
      {
        serviceId: 'srv-kigoma-trauma',
        facilityId: 'fac-kigoma-dh',
        serviceCode: 'SRV-ED-TRAUMA',
        serviceName: 'Level 2 Trauma & Resuscitation Center',
        category: 'EMERGENCY',
        isAvailable: true,
        operatingHours: '24/7 Continuous Emergency Service',
        contactEmergency: '+255 28 299 2211',
      },
      {
        serviceId: 'srv-kigoma-radiology',
        facilityId: 'fac-kigoma-dh',
        serviceCode: 'SRV-RAD-CT',
        serviceName: 'Diagnostic Imaging & CT Center',
        category: 'IMAGING',
        isAvailable: true,
        operatingHours: '08:00 - 20:00 (On-call 24/7)',
        contactEmergency: '+255 28 299 2214',
      },
      {
        serviceId: 'srv-kigoma-bloodbank',
        facilityId: 'fac-kigoma-dh',
        serviceCode: 'SRV-LAB-BB',
        serviceName: 'Regional Blood Transfusion Depot',
        category: 'LABORATORY',
        isAvailable: true,
        operatingHours: '24/7 Continuous Service',
        contactEmergency: '+255 28 299 2215',
      },
      {
        serviceId: 'srv-uvinza-mch',
        facilityId: 'fac-uvinza-hc',
        serviceCode: 'SRV-CLINIC-MCH',
        serviceName: 'Maternal and Child Health Comprehensive Care',
        category: 'OUTPATIENT',
        isAvailable: true,
        operatingHours: '08:00 - 18:00',
        contactEmergency: '+255 28 299 1042',
      },
    ];

    services.forEach((s) => this.services.set(s.serviceId, s));
  }

  public getFacility(facilityId: string): FacilityDirectoryEntry | undefined {
    const entry = this.facilities.get(facilityId);
    if (!entry) return undefined;

    // Refresh live status from node registry
    if (entry.associatedNodeId) {
      const node = janoNodeRegistryService.getNode(entry.associatedNodeId);
      if (node) entry.nodeStatus = node.networkStatus;
    }
    return entry;
  }

  public searchFacilities(query?: {
    type?: string;
    region?: string;
    district?: string;
    hasEmergency?: boolean;
    hasReferral?: boolean;
    hasRadiology?: boolean;
    hasLaboratory?: boolean;
  }): FacilityDirectoryEntry[] {
    let list = Array.from(this.facilities.values());

    // Sync node statuses
    list.forEach((entry) => {
      if (entry.associatedNodeId) {
        const node = janoNodeRegistryService.getNode(entry.associatedNodeId);
        if (node) entry.nodeStatus = node.networkStatus;
      }
    });

    if (query?.type) {
      list = list.filter((f) => f.type === query.type);
    }
    if (query?.region) {
      list = list.filter((f) => f.region.toLowerCase().includes(query.region!.toLowerCase()));
    }
    if (query?.district) {
      list = list.filter((f) => f.district.toLowerCase().includes(query.district!.toLowerCase()));
    }
    if (query?.hasEmergency !== undefined) {
      list = list.filter((f) => f.capabilities.emergencyCapability === query.hasEmergency);
    }
    if (query?.hasReferral !== undefined) {
      list = list.filter((f) => f.capabilities.referralDestination === query.hasReferral);
    }
    if (query?.hasRadiology !== undefined) {
      list = list.filter((f) => f.capabilities.radiologyCapability === query.hasRadiology);
    }
    if (query?.hasLaboratory !== undefined) {
      list = list.filter((f) => f.capabilities.laboratoryCapability === query.hasLaboratory);
    }

    return list;
  }

  public searchPractitioners(query?: {
    facilityId?: string;
    role?: string;
    specialty?: string;
    canReceiveReferrals?: boolean;
  }): PractitionerDirectoryEntry[] {
    let list = Array.from(this.practitioners.values());

    if (query?.facilityId) {
      list = list.filter((p) => p.primaryFacilityId === query.facilityId);
    }
    if (query?.role) {
      list = list.filter((p) => p.role === query.role);
    }
    if (query?.specialty) {
      list = list.filter((p) => p.specialty?.toLowerCase().includes(query.specialty!.toLowerCase()));
    }
    if (query?.canReceiveReferrals !== undefined) {
      list = list.filter((p) => p.canReceiveReferrals === query.canReceiveReferrals);
    }

    return list;
  }

  public searchServices(query?: {
    facilityId?: string;
    category?: string;
    availableOnly?: boolean;
  }): ServiceDirectoryEntry[] {
    let list = Array.from(this.services.values());

    if (query?.facilityId) {
      list = list.filter((s) => s.facilityId === query.facilityId);
    }
    if (query?.category) {
      list = list.filter((s) => s.category === query.category);
    }
    if (query?.availableOnly) {
      list = list.filter((s) => s.isAvailable);
    }

    return list;
  }

  public resetToSyntheticDemo(): void {
    this.facilities.clear();
    this.practitioners.clear();
    this.services.clear();
    this.seedDefaultDirectory();
  }
}

export const janoFacilityRegistryService = JanoFacilityRegistryService.getInstance();
