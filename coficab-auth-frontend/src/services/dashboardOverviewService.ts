import axios from 'axios';
import type { OverviewData } from '../types/dashboardOverview';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

/** GET /api/dashboard/overview?days= : the management overview (admins only). */
export async function fetchDashboardOverview(token: string, days: number, organizationId?: string): Promise<OverviewData> {
  const res = await axios.get(`${API_BASE}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, ...(organizationId ? { organizationId } : {}) },
  });
  return (res.data?.data ?? res.data) as OverviewData;
}
