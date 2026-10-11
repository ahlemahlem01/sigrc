import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const WORKFLOW_ROLES = ['user', 'admin', 'superadmin'] as const;
export type WorkflowRole = (typeof WORKFLOW_ROLES)[number];

export interface WorkflowStatus {
  code: string;
  label: string;
  sortOrder: number;
  isFinal: boolean;
  isActive: boolean;
}

export interface WorkflowTransition {
  from: string;
  to: string;
  roles: string[];
  isActive: boolean;
}

export interface WorkflowConfig {
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
}

/** Configurable claim workflow: statuses and the transitions each role may make. Nothing is ever deleted (switch off instead). */
export const workflowService = {
  get: async (token: string): Promise<WorkflowConfig> =>
    (await axios.get<WorkflowConfig>(`${API_BASE_URL}/workflow/claims`, authHeaders(token))).data,

  save: async (config: WorkflowConfig, token: string): Promise<WorkflowConfig> =>
    (await axios.put<WorkflowConfig>(`${API_BASE_URL}/workflow/claims`, config, authHeaders(token))).data,
};
