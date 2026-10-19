import axios from 'axios';
import { ACTION_PLAN_API_URL as ACTIONPLAN_API, AUTH_API_URL as AUTH_API } from '../config/apiEnv';
import { scopeParams } from './organizationScopeStore';

// Departments AND Organizations live on the Action Plan API, not the Auth API.

const authHeader = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` }
});

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  department: string;
  departmentId?: string | null;
  organizationId?: string;
  organizationName?: string;
  isLockedOut: boolean;
  lockoutEnd?: string | null;
  accessFailedCount?: number;
  roles: string[];
  permissions: string[];
  createdAt?: string | null;
}

export interface PermissionDto {
  id: number;
  name: string;
  displayName: string;
  appId: string;
}

export interface DepartmentDto {
  id: string;
  name: string;
  organizationId?: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  type?: string;
}

export const getUsers = async (token: string): Promise<UserDto[]> => {
  const res = await axios.get(`${AUTH_API}/api/admin/users`, { ...authHeader(token), params: scopeParams() });
  return res.data;
};

export const getPermissions = async (token: string): Promise<PermissionDto[]> => {
  const res = await axios.get(`${AUTH_API}/api/admin/permissions`, authHeader(token));
  return res.data;
};

export interface StoredPermission {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  appId: string;
  isDefault: boolean;
  isActive: boolean;
}

const readStoredPermission = (row: any): StoredPermission => ({
  id: String(row?.id ?? row?.Id ?? ''),
  name: String(row?.name ?? row?.Name ?? ''),
  displayName: String(row?.displayName ?? row?.DisplayName ?? ''),
  description: String(row?.description ?? row?.Description ?? ''),
  category: String(row?.category ?? row?.Category ?? ''),
  appId: String(row?.appId ?? row?.AppId ?? ''),
  isDefault: Boolean(row?.isDefault ?? row?.IsDefault),
  isActive: Boolean(row?.isActive ?? row?.IsActive ?? true),
});

export const listStoredPermissions = async (token: string): Promise<StoredPermission[]> => {
  const res = await axios.get(`${AUTH_API}/api/permissions`, authHeader(token));
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map(readStoredPermission);
};

export const createStoredPermission = async (token: string, data: {
  name: string;
  displayName: string;
  description: string;
  category: string;
}): Promise<void> => {
  await axios.post(`${AUTH_API}/api/permissions`, data, authHeader(token));
};

export const updateStoredPermission = async (token: string, id: string, data: {
  name: string;
  displayName: string;
  description: string;
  category: string;
}): Promise<void> => {
  await axios.put(`${AUTH_API}/api/permissions/${id}`, data, authHeader(token));
};

export const setStoredPermissionActive = async (token: string, id: string, isActive: boolean): Promise<void> => {
  await axios.patch(`${AUTH_API}/api/permissions/${id}/active`, { isActive }, authHeader(token));
};

export const assignStoredPermission = async (token: string, userId: string, permissionId: string): Promise<void> => {
  await axios.post(`${AUTH_API}/api/permissions/users/${userId}`, { permissionId }, authHeader(token));
};

export const revokeStoredPermission = async (token: string, userId: string, permissionId: string): Promise<void> => {
  await axios.delete(`${AUTH_API}/api/permissions/users/${userId}/${permissionId}`, authHeader(token));
};

export const getDepartments = async (token: string): Promise<DepartmentDto[]> => {
  const res = await axios.get(`${ACTIONPLAN_API}/department`, authHeader(token));
  return res.data;
};

export const getOrganizations = async (token: string): Promise<OrganizationDto[]> => {
  const res = await axios.get(`${ACTIONPLAN_API}/organization`, authHeader(token));
  return res.data;
};

// Password removed — backend generates it and emails it to the new user.
export const createUser = async (token: string, data: {
  email: string;
  fullName: string;
  department: string;
  organizationId?: string;
  role: string;
  permissions: string[];
}): Promise<void> => {
  await axios.post(`${AUTH_API}/api/admin/users`, data, authHeader(token));
};

export const importUsersCsv = async (token: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post<{
    created: number;
    users: { id: string; email: string; fullName: string; role: string; department: string; poste: string; equipe: string }[];
    errors: { line: number; message: string }[];
  }>(`${AUTH_API}/api/admin/users/import`, form, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const updateUser = async (token: string, id: string, data: {
  fullName: string;
  department: string;
  organizationId?: string;
  role: string;
  permissions: string[];
}): Promise<void> => {
  await axios.put(`${AUTH_API}/api/admin/users/${id}`, data, authHeader(token));
};

export const deleteUser = async (token: string, id: string): Promise<void> => {
  await axios.delete(`${AUTH_API}/api/admin/users/${id}`, authHeader(token));
};

export const resetUserPassword = async (token: string, id: string, newPassword: string): Promise<void> => {
  await axios.post(`${AUTH_API}/api/admin/users/${id}/reset-password`, { newPassword }, authHeader(token));
};

export const unlockUser = async (token: string, id: string): Promise<void> => {
  await axios.post(`${AUTH_API}/api/admin/users/${id}/unlock`, {}, authHeader(token));
};

export const lockUser = async (token: string, id: string): Promise<void> => {
  await axios.post(`${AUTH_API}/api/admin/users/${id}/lock`, {}, authHeader(token));
};