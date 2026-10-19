import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export interface CapaFigure { current: number | null; previous: number | null }

export interface CapaIndicators {
  days: number;
  generatedAt: string;
  kpis: {
    openPlans: number;
    latePlans: number;
    opened: CapaFigure;
    closed: CapaFigure;
    onTimeRate: CapaFigure;
    avgClosureDays: CapaFigure;
  };
  aging: { under30: number; from30To90: number; over90: number };
  byType: { type: string; openPlans: number; latePlans: number; closedInPeriod: number; onTimeRate: number | null }[];
  byDepartment: { name: string; organization: string; openPlans: number; latePlans: number; closedInPeriod: number; onTimeRate: number | null }[];
  monthly: { month: string; opened: number; closed: number }[];
  owners: { name: string; openPlans: number; latePlans: number }[];
  detailedActions: number;
}

/** GET /api/dashboard/capa-indicators?days= : CAPA indicators computed on the plans (admins only). */
export async function fetchCapaIndicators(token: string, days: number, organizationIds?: string): Promise<CapaIndicators> {
  const res = await axios.get(`${API_BASE}/dashboard/capa-indicators`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, ...(organizationIds ? { organizationIds } : {}) },
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
