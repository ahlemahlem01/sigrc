import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export type StructureLevel = 'regions' | 'countries' | 'sites';

export interface StructureNode {
  id: string;
  name: string;
  code: string;
  /** Region of a country, country of a site. */
  parentId: string | null;
  departments: number;
}

export interface OrganizationStructure {
  organizationId: string;
  type: number;
  hasRegions: boolean;
  hasCountries: boolean;
  maxSites: number | null;
  regions: StructureNode[];
  countries: StructureNode[];
  sites: StructureNode[];
}

export interface StructureInput {
  name: string;
  code: string;
  parentId: string | null;
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });
const base = (organizationId: string) => `${API_BASE}/organization/${organizationId}/structure`;

/** The stable code of a refused change (`code_taken`, `node_in_use`, ...), or null when the error is something else. */
export function structureErrorCode(err: unknown): { code: string; count?: number; conflicts?: { code: string; count: number }[] } | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { code?: string; count?: number; conflicts?: { code: string; count: number }[] } | undefined;
  return data?.code ? { code: data.code, count: data.count, conflicts: data.conflicts } : null;
}

export async function fetchStructure(token: string, organizationId: string): Promise<OrganizationStructure> {
  return (await axios.get(base(organizationId), auth(token))).data as OrganizationStructure;
}

export async function createNode(token: string, organizationId: string, level: StructureLevel, input: StructureInput): Promise<StructureNode> {
  return (await axios.post(`${base(organizationId)}/${level}`, input, auth(token))).data as StructureNode;
}

export async function updateNode(token: string, organizationId: string, level: StructureLevel, id: string, input: StructureInput): Promise<StructureNode> {
  return (await axios.put(`${base(organizationId)}/${level}/${id}`, input, auth(token))).data as StructureNode;
}

/** Archives the node: the server refuses while departments, sites or countries still depend on it. */
export async function archiveNode(token: string, organizationId: string, level: StructureLevel, id: string): Promise<void> {
  await axios.delete(`${base(organizationId)}/${level}/${id}`, auth(token));
}
