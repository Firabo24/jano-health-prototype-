/**
 * Jano Health - Enterprise Tenancy & Organization Hierarchy Service (V25)
 * Enforces multi-tenant isolation, facility hierarchies, departments, and units.
 * 
 * HARD INVARIANTS:
 * - Cross-tenant access is DENIED BY DEFAULT.
 * - Tenancy identities are strictly separated from clinical patient/practitioner identities.
 * - Every facility is explicitly scoped to an organization and tenant.
 */

import { idbEngine } from '../storage/indexedDbEngine';
import {
  Tenant,
  Organization,
  OrganizationGroup,
  FacilityHierarchy,
  DeviceGroup,
} from '../../domain/v25ScaleOperationsTypes';

export class TenancyManagementService {
  private tenants: Map<string, Tenant> = new Map();
  private groups: Map<string, OrganizationGroup> = new Map();
  private organizations: Map<string, Organization> = new Map();
  private facilities: Map<string, FacilityHierarchy> = new Map();
  private deviceGroups: Map<string, DeviceGroup> = new Map();

  constructor() {
    this.seedBaselines();
  }

  private seedBaselines(): void {
    // 1. Primary East Africa Healthcare Tenant
    const t1: Tenant = {
      tenantId: 'tenant-prod-ea-moh',
      name: 'East Africa Ministry of Health Production',
      slug: 'ea-moh-prod',
      region: 'EAST_AFRICA',
      isolationMode: 'STRICT_LOGICAL',
      isActive: true,
      createdAt: '2026-01-15T08:00:00Z',
      updatedAt: '2026-06-01T08:00:00Z',
    };
    this.tenants.set(t1.tenantId, t1);

    // 2. Organization Group
    const g1: OrganizationGroup = {
      groupId: 'org-grp-rift-valley',
      tenantId: t1.tenantId,
      name: 'Rift Valley Regional Health Network',
      description: 'Regional consortium of primary care clinics and referral facilities',
      createdAt: '2026-01-20T09:00:00Z',
    };
    this.groups.set(g1.groupId, g1);

    // 3. Organization
    const org1: Organization = {
      organizationId: 'org-turkana-health-trust',
      tenantId: t1.tenantId,
      groupId: g1.groupId,
      name: 'Turkana Healthcare County Trust',
      jurisdiction: 'Turkana County, Kenya',
      region: 'RURAL_NORTH',
      customerAccountId: 'cust-act-turkana-001',
      isActive: true,
      createdAt: '2026-02-01T10:00:00Z',
      updatedAt: '2026-07-01T10:00:00Z',
    };
    this.organizations.set(org1.organizationId, org1);

    // 4. Facility Hierarchies
    const fac1: FacilityHierarchy = {
      facilityId: 'fac-amani-primary-clinic',
      organizationId: org1.organizationId,
      tenantId: t1.tenantId,
      name: 'Amani Primary Health Center',
      facilityType: 'PRIMARY_CARE_CLINIC',
      region: 'Turkana North',
      isProvisioned: true,
      activeDeploymentId: 'dep-amani-v25-prod-01',
      createdAt: '2026-02-10T11:00:00Z',
      departments: [
        {
          departmentId: 'dept-opd',
          facilityId: 'fac-amani-primary-clinic',
          name: 'Outpatient Department',
          units: [
            { unitId: 'unit-triage-1', departmentId: 'dept-opd', name: 'Rapid Triage' },
            { unitId: 'unit-consult-1', departmentId: 'dept-opd', name: 'Consultation Room 1' },
          ],
        },
        {
          departmentId: 'dept-mch',
          facilityId: 'fac-amani-primary-clinic',
          name: 'Maternal & Child Health',
          units: [
            { unitId: 'unit-antenatal', departmentId: 'dept-mch', name: 'Antenatal Care' },
            { unitId: 'unit-postnatal', departmentId: 'dept-mch', name: 'Postnatal Ward', bedCapacity: 6 },
          ],
        },
      ],
    };
    this.facilities.set(fac1.facilityId, fac1);

    const fac2: FacilityHierarchy = {
      facilityId: 'fac-kilima-subcounty-hospital',
      organizationId: org1.organizationId,
      tenantId: t1.tenantId,
      name: 'Kilima Sub-County Hospital',
      facilityType: 'DISTRICT_HOSPITAL',
      region: 'Turkana Central',
      isProvisioned: true,
      activeDeploymentId: 'dep-kilima-v25-prod-02',
      createdAt: '2026-02-12T11:00:00Z',
      departments: [
        {
          departmentId: 'dept-emergency',
          facilityId: 'fac-kilima-subcounty-hospital',
          name: 'Emergency & Trauma Care',
          units: [
            { unitId: 'unit-resus', departmentId: 'dept-emergency', name: 'Resuscitation Bay', bedCapacity: 4 },
          ],
        },
      ],
    };
    this.facilities.set(fac2.facilityId, fac2);

    // 5. Secondary isolated tenant for tenant-boundary verification
    const t2: Tenant = {
      tenantId: 'tenant-prod-tz-health',
      name: 'Tanzania Lake Zone Health Initiative',
      slug: 'tz-lake-prod',
      region: 'LAKE_ZONE',
      isolationMode: 'STRICT_LOGICAL',
      isActive: true,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-06-01T08:00:00Z',
    };
    this.tenants.set(t2.tenantId, t2);
  }

  // Tenant Operations
  public async getTenant(tenantId: string): Promise<Tenant | null> {
    return this.tenants.get(tenantId) || null;
  }

  public async listTenants(): Promise<Tenant[]> {
    return Array.from(this.tenants.values());
  }

  public async registerTenant(tenant: Tenant): Promise<Tenant> {
    this.tenants.set(tenant.tenantId, tenant);
    await idbEngine.put('tenants', tenant);
    return tenant;
  }

  // Organization Operations
  public async getOrganization(organizationId: string): Promise<Organization | null> {
    return this.organizations.get(organizationId) || null;
  }

  public async listOrganizations(tenantId: string): Promise<Organization[]> {
    return Array.from(this.organizations.values()).filter((o) => o.tenantId === tenantId);
  }

  public async registerOrganization(org: Organization): Promise<Organization> {
    const tenant = this.tenants.get(org.tenantId);
    if (!tenant) {
      throw new Error(`Cannot register organization: Tenant ${org.tenantId} not found`);
    }
    this.organizations.set(org.organizationId, org);
    await idbEngine.put('organizations', org);
    return org;
  }

  // Facility Hierarchy Operations
  public async getFacility(facilityId: string): Promise<FacilityHierarchy | null> {
    return this.facilities.get(facilityId) || null;
  }

  public async listFacilities(organizationId: string): Promise<FacilityHierarchy[]> {
    return Array.from(this.facilities.values()).filter((f) => f.organizationId === organizationId);
  }

  public async registerFacility(facility: FacilityHierarchy): Promise<FacilityHierarchy> {
    const org = this.organizations.get(facility.organizationId);
    if (!org) {
      throw new Error(`Cannot register facility: Organization ${facility.organizationId} not found`);
    }
    if (org.tenantId !== facility.tenantId) {
      throw new Error(`Tenant mismatch: Facility tenant ${facility.tenantId} does not match organization tenant ${org.tenantId}`);
    }
    this.facilities.set(facility.facilityId, facility);
    await idbEngine.put('organizationFacilities', facility);
    return facility;
  }

  /**
   * Enforces Tenant Isolation (Deny-by-default)
   */
  public verifyTenantAccess(requestingTenantId: string, targetTenantId: string): boolean {
    if (!requestingTenantId || !targetTenantId) return false;
    return requestingTenantId === targetTenantId;
  }

  public verifyFacilityScope(facilityId: string, allowedTenantId: string): boolean {
    const facility = this.facilities.get(facilityId);
    if (!facility) return false;
    return facility.tenantId === allowedTenantId;
  }
}

export const tenancyManagementService = new TenancyManagementService();
