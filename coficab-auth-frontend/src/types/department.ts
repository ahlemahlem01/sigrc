// Matches Coficab.ActionPlan.Application.DTOs.Department on the backend

export interface Department {
  id: string; // Guid
  name: string;
  code: string;
  description?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  regionId?: string | null;
  regionName?: string | null;
  organizationId: string;
  organizationName?: string | null;
  functionsCount?: number;
  actionPlansCount?: number;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
}

export interface CreateDepartmentDto {
  name: string;
  code: string;
  description?: string | null;
  siteId?: string | null;
  regionId?: string | null;
  organizationId: string;
}

export interface UpdateDepartmentDto {
  name: string;
  code: string;
  description?: string | null;
}

export interface Organization {
  id: string;
  name: string;
}