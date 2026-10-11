import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

export type D4ToolKey = 'ishikawa' | 'pareto' | 'fiveWhy';

export interface D4ToolState {
  open: boolean;
  /** "d3" | "ishikawa" | "priorityCause": what must be done first. */
  reason?: string | null;
}

export interface D4ChainStatus {
  exempt: boolean;
  satisfied: boolean;
  priorityCause: boolean;
  rootInIshikawa: boolean;
  overridden: boolean;
  missing: string[];
  /** Order of the D4 tools. */
  tools?: Record<D4ToolKey, D4ToolState>;
}

const headers = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const d4ChainService = {
  async get(claimId: string, token: string): Promise<D4ChainStatus> {
    const response = await axios.get<D4ChainStatus>(`${API_BASE_URL}/d4-chain/${claimId}`, headers(token));
    return response.data;
  },

  /** Admin only: release a dossier from the chain rule, with a reason that is kept on record. */
  async release(claimId: string, reason: string, token: string): Promise<D4ChainStatus> {
    const response = await axios.post<D4ChainStatus>(`${API_BASE_URL}/d4-chain/${claimId}/override`, { reason }, headers(token));
    return response.data;
  },
};
