// PM module TypeScript types — mirrors the Phase 2 database schema

// Values enforced by CHECK constraints on management_company_users.
export type PMRole = 'senior_pm' | 'pm_staff' | 'readonly';
export type PMUserStatus = 'active' | 'invited' | 'suspended' | 'removed';
export type PMTaskStatus = 'open' | 'in_progress' | 'completed' | 'overdue';
export type PMTaskCategory = 'maintenance' | 'inspection' | 'compliance' | 'financial' | 'communication' | 'other';
export type PMLogCategory = 'maintenance' | 'inspection' | 'incident' | 'vendor' | 'communication' | 'financial' | 'compliance' | 'general';

export interface ManagementCompany {
  id: string;
  name: string;
  slug: string;
  status: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  created_at: string;
}

export interface ManagementCompanyUser {
  id: string;
  management_company_id: string;
  user_id: string;
  role: PMRole;
  status: PMUserStatus;
  name: string;
  email: string;
  created_at: string;
}

export interface ManagementCompanyTenant {
  id: string;
  management_company_id: string;
  tenant_id: string;
  added_at: string;
  tenant?: {
    id: string;
    name: string;
    address: Record<string, string> | null;
    total_units: number;
  };
}

export interface ManagementCompanyAssignment {
  id: string;
  management_company_id: string;
  tenant_id: string;
  management_company_user_id: string;
  self_assigned: boolean;
  created_at: string;
}

export interface PMTask {
  id: string;
  company_id: string;
  tenant_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  category: PMTaskCategory;
  status: PMTaskStatus;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PMLogEntry {
  id: string;
  company_id: string;
  tenant_id: string | null;
  category: PMLogCategory;
  title: string;
  body: string | null;
  logged_by: string;
  logged_at: string;
}

export interface PMBuildingScore {
  id: string;
  company_id: string;
  tenant_id: string;
  period: string;
  overall_score: number;
  compliance_score: number | null;
  maintenance_score: number | null;
  financial_score: number | null;
  communication_score: number | null;
  notes: string | null;
  scored_by: string;
  created_at: string;
}

export interface PMPortfolioBuilding {
  tenantId: string;
  name: string;
  address: Record<string, string> | null;
  totalUnits: number;
}

export interface PMUserContext {
  company: ManagementCompany;
  companyUser: ManagementCompanyUser;
  buildings: PMPortfolioBuilding[];
  accessibleTenantIds: string[];
  activeBuildingId: string | null;
  setActiveBuildingId: (id: string | null) => void;
}
