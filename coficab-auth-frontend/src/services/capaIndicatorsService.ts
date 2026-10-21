import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export interface CapaFigure { current: number | null; previous: number | null }

export interface CapaIndicators {
  days: number;
  generatedAt: string;
  kpis: {
    openPlans: number;
    latePlans: number;
    lateActions: number;
    actionsToValidate: number;
    plansWithoutActions: number;
    opened: CapaFigure;
    closed: CapaFigure;
    onTimeRate: CapaFigure;
    avgClosureDays: CapaFigure;
  };
  aging: { under30: number; from30To90: number; over90: number };
  byType: { type: string; openPlans: number; latePlans: number; closedInPeriod: number; onTimeRate: number | null }[];
  byDepartment: { id: string; name: string; organization: string; openPlans: number; latePlans: number; closedInPeriod: number; onTimeRate: number | null }[];
  monthly: { month: string; opened: number; closed: number }[];
  owners: { name: string; openPlans: number; latePlans: number }[];
  detailedActions: number;
}

/** GET /api/dashboard/capa-indicators?days= : CAPA indicators computed on the plans (admins only). */
export async function fetchCapaIndicators(token: string, days: number, organizationIds?: string, departmentId?: string): Promise<CapaIndicators> {
  const res = await axios.get(`${API_BASE}/dashboard/capa-indicators`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, ...(organizationIds ? { organizationIds } : {}), ...(departmentId ? { departmentId } : {}) },
  });
  return (res.data?.data ?? res.data) as CapaIndicators;
}

export interface CapaWorkloadPlan { id: string; title: string; type: string; closed: boolean; deadline: string | null; lateDays: number; progress: number }

export interface CapaWorkloadPerson {
  userId: string;
  name: string;
  email: string;
  department: string;
  openPlans: number;
  latePlans: number;
  closedPlans: number;
  avgProgress: number | null;
  nextDeadline: string | null;
  plans: CapaWorkloadPlan[];
}

export interface CapaWorkload {
  generatedAt: string;
  summary: { people: number; averageOpen: number; overloaded: number; withoutOpenPlan: number };
  people: CapaWorkloadPerson[];
}

/** GET /api/dashboard/capa-workload : who carries the CAPA plans (admins only). */
export async function fetchCapaWorkload(token: string, organizationIds?: string): Promise<CapaWorkload> {
  const res = await axios.get(`${API_BASE}/dashboard/capa-workload`, {
    headers: { Authorization: `Bearer ${token}` },
    params: organizationIds ? { organizationIds } : undefined,
  });
  return (res.data?.data ?? res.data) as CapaWorkload;
}

export interface PlanPerson { userId: string | null; name: string }

export interface PlanDetail {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  organizationId: string;
  organizationName: string;
  departmentId: string;
  departmentName: string;
  responsible: PlanPerson;
  createdBy: PlanPerson;
  createdAt: string;
  deadline: string | null;
  completedAt: string | null;
  progress: number;
  health: { state: string; lateDays: number; openActions: number; lateActions: number; waitingValidation: number; proofCount: number };
  claim: { id: string; title: string; clientId: string; severity: string; statusCode: string } | null;
  actions: {
    id: string; title: string; description: string | null; priority: number; progress: number;
    state: 'open' | 'waitingValidation' | 'validated' | 'cancelled'; deadline: string | null; lateDays: number; responsible: PlanPerson;
  }[];
  history: { at: string; type: string; by: string; note: string | null; fromStatus: string | null; toStatus: string | null; fromAssignee: string | null; toAssignee: string | null }[];
  lastRejectedAt: string | null;
  lastRejectComment: string | null;
}

/** GET /api/actionplan/{id}/detail : the whole plan page in one call (quality admins). */
export async function fetchPlanDetail(token: string, id: string): Promise<PlanDetail> {
  const res = await axios.get(`${API_BASE}/actionplan/${id}/detail`, { headers: { Authorization: `Bearer ${token}` } });
  return (res.data?.data ?? res.data) as PlanDetail;
}
