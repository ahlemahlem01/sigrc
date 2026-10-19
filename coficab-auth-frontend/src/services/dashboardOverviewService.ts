import axios from 'axios';
import type { OverviewData, OverviewTargets } from '../types/dashboardOverview';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

/** GET /api/dashboard/overview?days= : the management overview (admins only). */
export async function fetchDashboardOverview(token: string, days: number, organizationIds?: string): Promise<OverviewData> {
  const res = await axios.get(`${API_BASE}/dashboard/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, ...(organizationIds ? { organizationIds } : {}) },
  });
  return (res.data?.data ?? res.data) as OverviewData;
}

/** Saves the targets of the traffic lights (superadmin only). A 400 carries the name of the invalid field. */
export async function saveOverviewTargets(token: string, targets: OverviewTargets): Promise<OverviewTargets> {
  const res = await axios.put(`${API_BASE}/dashboard/overview/targets`, targets, { headers: { Authorization: `Bearer ${token}` } });
  return res.data as OverviewTargets;
}

/** Back to the default targets (superadmin only). */
export async function resetOverviewTargets(token: string): Promise<OverviewTargets> {
  const res = await axios.delete(`${API_BASE}/dashboard/overview/targets`, { headers: { Authorization: `Bearer ${token}` } });
  return res.data as OverviewTargets;
}
