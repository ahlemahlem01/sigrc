import axios from 'axios';
import type { OverviewData } from '../types/dashboardOverview';
import { ACTION_PLAN_API_URL as API_BASE, ML_API_URL } from '../config/apiEnv';

/** GET /api/dashboard/overview?days= : the management overview (admins only). */
export async function fetchDashboardOverview(token: string, days: number): Promise<OverviewData> {
  const res = await axios.get(`${API_BASE}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days },
  });
  return (res.data?.data ?? res.data) as OverviewData;
}

export type ModelStatus = 'validated' | 'indicative' | 'unavailable';

/** Whether the recommendation model passed its statistical validation. Never throws: an unreachable service is "unavailable". */
export async function fetchModelStatus(): Promise<ModelStatus> {
  try {
    const res = await axios.get(`${ML_API_URL}/health`, { timeout: 4000 });
    if (!res.data?.modelLoaded) return 'unavailable';
    return res.data?.validated === true ? 'validated' : 'indicative';
  } catch {
    return 'unavailable';
  }
}
