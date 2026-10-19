import type {
    CreateDepartmentDto,
    Department,
    UpdateDepartmentDto,
} from "../types/department";

import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { getScopeParam } from './organizationScopeStore';

const BASE_URL = `${ACTION_PLAN_API_URL}/department`;

async function request<T>(url: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(message || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const departmentService = {
  getAll: (token: string | null) => {
    const scope = getScopeParam();
    return request<Department[]>(scope ? `${BASE_URL}?organizationIds=${scope}` : BASE_URL, token);
  },

  getById: (id: string, token: string | null) => request<Department>(`${BASE_URL}/${id}`, token),

  getByOrganization: (organizationId: string, token: string | null) =>
    request<Department[]>(`${BASE_URL}/by-organization/${organizationId}`, token),

  create: (dto: CreateDepartmentDto, token: string | null) =>
    request<Department>(BASE_URL, token, {
      method: "POST",
      body: JSON.stringify(dto),
    }),

  update: (id: string, dto: UpdateDepartmentDto, token: string | null) =>
    request<Department>(`${BASE_URL}/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(dto),
    }),

  archive: (id: string, token: string | null) =>
    request<void>(`${BASE_URL}/${id}`, token, {
      method: "DELETE",
    }),
};