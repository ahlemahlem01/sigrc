import axios from 'axios';
import { scopeParams } from './organizationScopeStore';

import { ACTION_PLAN_API_URL } from '../config/apiEnv';

const API_URL = `${ACTION_PLAN_API_URL}/admin/employees`;

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.items))       return raw.items;
  return [];
};

export type EmployeeActivityStatus = 'Active' | 'LowActivity' | 'Inactive';

export type EmployeeActivityItem = {
  userId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  activityStatus: EmployeeActivityStatus;
  lastActivityAt?: string | null;
  lastLoginAt?: string | null;
  lastBusinessActivityAt?: string | null;
  activityStatusComputedAt?: string | null;
  recentActionCount: number;
};

export type EmployeeActivitySummary = {
  total: number;
  active: number;
  lowActivity: number;
  inactive: number;
  computedAt?: string | null;
  items: EmployeeActivityItem[];
};

const mapActivityItem = (raw: any): EmployeeActivityItem => ({
  userId: String(raw?.userId ?? raw?.UserId ?? ''),
  name: String(raw?.name ?? raw?.Name ?? '—'),
  email: String(raw?.email ?? raw?.Email ?? ''),
  department: String(raw?.department ?? raw?.Department ?? ''),
  role: String(raw?.role ?? raw?.Role ?? ''),
  activityStatus: (raw?.activityStatus ?? raw?.ActivityStatus ?? 'Inactive') as EmployeeActivityStatus,
  lastActivityAt: raw?.lastActivityAt ?? raw?.LastActivityAt ?? null,
  lastLoginAt: raw?.lastLoginAt ?? raw?.LastLoginAt ?? null,
  lastBusinessActivityAt: raw?.lastBusinessActivityAt ?? raw?.LastBusinessActivityAt ?? null,
  activityStatusComputedAt: raw?.activityStatusComputedAt ?? raw?.ActivityStatusComputedAt ?? null,
  recentActionCount: Number(raw?.recentActionCount ?? raw?.RecentActionCount ?? 0),
});

const mapActivitySummary = (raw: any): EmployeeActivitySummary => ({
  total: Number(raw?.total ?? raw?.Total ?? 0),
  active: Number(raw?.active ?? raw?.Active ?? 0),
  lowActivity: Number(raw?.lowActivity ?? raw?.LowActivity ?? 0),
  inactive: Number(raw?.inactive ?? raw?.Inactive ?? 0),
  computedAt: raw?.computedAt ?? raw?.ComputedAt ?? null,
  items: unwrap(raw?.items ?? raw?.Items).map(mapActivityItem),
});

export const adminEmployeeService = {
  getAllProfiles: (token: string) =>
    axios.get(`${API_URL}/profiles`, { ...h(token), params: scopeParams() }).then(r => unwrap(r.data)),

  getActivitySummary: (token: string, force = false) =>
    axios
      .get(`${API_URL}/activity`, { ...h(token), params: { ...(force ? { force: true } : {}), ...scopeParams() } })
      .then(r => mapActivitySummary(r.data)),

  recalculateActivity: (token: string) =>
    axios.post(`${API_URL}/activity/recalculate`, null, h(token)).then(r => mapActivitySummary(r.data)),

  getProfile: (token: string, userId: string) =>
    axios.get(`${API_URL}/profiles/${userId}`, h(token)).then(r => r.data),

  /** Org chart drag-and-drop: the employee's department in the profile (the account is updated through adminService.updateUser). */
  moveToDepartment: (token: string, userId: string, departmentId: string) =>
    axios.put(`${API_URL}/profiles/${userId}/department`, { departmentId }, h(token)).then(r => r.data),

  updateProfile: (token: string, userId: string, data: any) =>
    axios.put(`${API_URL}/profiles/${userId}`, data, h(token)).then(r => r.data),

  awardBadge: (token: string, data: any) =>
    axios.post(`${API_URL}/badges`, data, h(token)).then(r => r.data),

  notifyPodium: (token: string, data: {
    monthLabel: string;
    recipients: { userId: string; place: number; fullName: string; score: number }[];
  }) =>
    axios.post(`${API_URL}/recognition/notify-podium`, data, h(token)).then(r => r.data),

  /** Gives everyone the automatic badges their closed claims already earned (never removes any). */
  recalculateBadges: (token: string): Promise<{ awarded: number; employees: number }> =>
    axios.post(`${API_URL}/badges/recalculate`, null, h(token)).then(r => r.data),

  removeBadge: (token: string, id: string) =>
    axios.delete(`${API_URL}/badges/${id}`, h(token)),

  addTimelineEvent: (token: string, data: any) =>
    axios.post(`${API_URL}/timeline`, data, h(token)).then(r => r.data),

  // ── Aggregation : 1 requête SQL au lieu de N requêtes HTTP ──────────

  getAllBadges: (token: string) =>
    axios.get(`${API_URL}/badges`, { ...h(token), params: scopeParams() }).then(r => unwrap(r.data)),

  getUserBadges: (token: string, userId: string) =>
    axios.get(`${API_URL}/badges/${userId}`, h(token)).then(r => unwrap(r.data)),

  getAllBadgesForEmployees: async (token: string, employees: { id: string }[]) => {
    const lists = await Promise.all(
      employees.map(async (employee) => {
        try {
          const badges = await axios.get(`${API_URL}/badges/${employee.id}`, h(token));
          return unwrap(badges.data).map((badge) => ({ ...badge, __ownerId: employee.id }));
        } catch {
          return [];
        }
      }),
    );
    return lists.flat();
  },

  getAllTimeline: (token: string) =>
    axios.get(`${API_URL}/timeline`, { ...h(token), params: scopeParams() }).then(r =>
      unwrap(r.data).sort((a: any, b: any) =>
        new Date(b.timestamp ?? b.createdAt ?? 0).getTime() -
        new Date(a.timestamp ?? a.createdAt ?? 0).getTime()
      )
    ),

  getAllDocuments: (token: string) =>
    axios.get(`${API_URL}/documents`, { ...h(token), params: scopeParams() }).then(r => unwrap(r.data)),

  getUserDocuments: (token: string, userId: string) =>
    axios.get(`${API_URL}/documents/${encodeURIComponent(userId)}`, h(token)).then(r => unwrap(r.data)),

  uploadDocument: (token: string, formData: FormData) =>
    axios.post(`${API_URL}/documents/upload`, formData, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data),
};