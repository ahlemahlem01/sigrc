// src/pages/front/action-plan.types.ts
// Lightweight frontend types — your real models are in .NET backend

export type ActionPlanStatus = 'created' | 'ongoing' | 'closed' | 'archived';
export type ActionPlanType = 'preventif' | 'correctif' | 'amelioration';
export type PlanActionPriority = 'low' | 'medium' | 'high';
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  department?: string;
  departmentId?: string;
  avatar?: string;
}
export interface Department {
  id: string;
  name: string;
  code: string;
  organizationId: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
}

export interface PlanAction {
  id: string;
  title: string;
  description?: string;
  progress?: number;        // 0-100, backend a ActionProgress enum
  deadline?: string;
  priority: PlanActionPriority;
  assignedToId?: string;
  assignedToName?: string;
  assignedTo?: User;
  /** Raw progress: 0-100, 101 validated, 102 cancelled. */
  progressRaw?: number;
  actionPlanId?: string;
  createdAt?: string;
  order?: number; 
  status?: ActionPlanStatus;
  documentCount?: number;
}

export interface ActionPlan {
  id: string;
  code: string;
  title: string;
  description?: string;
  type: ActionPlanType;
  /** Business domain code (reference list "domain"). */
  domain?: string;
  status: ActionPlanStatus;
  progress?: number;  
  departmentId: string;
  department?: Department;
  organizationId: string;
  organization?: Organization;
  assignedToId?: string;
  assignedTo?: User;
  createdById: string;
  createdBy?: User;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  claimId?: string;
  proofCount?: number;
  lastRejectedAt?: string;
  lastRejectComment?: string;
  planActions: PlanAction[];
}

export interface ActionPlanFilters {
  search?: string;
  departmentId?: string;
  status?: ActionPlanStatus | 'all';
  type?: ActionPlanType | 'all';
  domain?: string;
  assignedToId?: string;
  organizationId?: string;
  includeArchived?: boolean;
}

export interface CreateActionPlanDTO {
  title: string;
  description?: string;
  type: ActionPlanType;
  domain?: string;
  departmentId: string;
  organizationId: string;
  assignedToId?: string;
  deadline?: string;
  claimId?: string;
}

export interface UpdateActionPlanDTO extends Partial<CreateActionPlanDTO> {
  status?: ActionPlanStatus;
}

export interface CreatePlanActionDTO {
  title: string;
  description?: string;
  assignedToId?: string;
  deadline?: string;
   fullName?: string;      // AJOUTE ÇA pour l'API admin
  department?: string; 
   
}

export interface UpdatePlanActionDTO extends Partial<CreatePlanActionDTO> {
  status?: ActionPlanStatus;
  order?: number;
}