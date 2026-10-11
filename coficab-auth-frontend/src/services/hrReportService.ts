import axios from 'axios';

import { ACTION_PLAN_API_URL } from '../config/apiEnv';

const API = `${ACTION_PLAN_API_URL}/hr-reports`;

export type HrReportEmployeePayload = {
  userId: string;
  fullName: string;
  email: string;
  department: string;
  role: string;
  activityStatus: string;
  activeDossiers: number;
  remainingCapacity: number;
  closureRate: number;
  overdueCount: number;
  avgDelayDays: number;
  workload: string;
  recentActionCount: number;
  competencyLevels: Record<string, string>;
  badges: string[];
  timelineHighlights: string[];
};

export type GenerateHrReportRequest = {
  periodStart?: string | null;
  periodEnd?: string | null;
  department?: string | null;
  employees: HrReportEmployeePayload[];
};

export type GenerateHrReportResponse = {
  summary: string;
  generatedAt: string;
  employeeCount: number;
};

export async function generateHrReport(
  token: string,
  body: GenerateHrReportRequest,
): Promise<GenerateHrReportResponse> {
  const { data } = await axios.post(`${API}/generate`, body, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120_000,
  });
  return {
    summary: String(data?.summary ?? data?.Summary ?? ''),
    generatedAt: String(data?.generatedAt ?? data?.GeneratedAt ?? new Date().toISOString()),
    employeeCount: Number(data?.employeeCount ?? data?.EmployeeCount ?? body.employees.length),
  };
}
