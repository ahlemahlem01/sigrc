import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

export interface PriorityCause {
  id: string;
  claimId: string;
  category?: string | null;
  causeText: string;
  source: 'manual' | 'pareto' | 'mining' | 'ishikawa';
  selectedById: string;
  selectedByName?: string | null;
  selectedAt: string;
  isCurrent: boolean;
  supersededAt?: string | null;
}

export interface PriorityCauseState {
  current: PriorityCause | null;
  history: PriorityCause[];
}

const headers = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const priorityCauseService = {
  async get(claimId: string, token: string): Promise<PriorityCauseState> {
    const response = await axios.get<PriorityCauseState>(`${API_BASE_URL}/priority-cause/${claimId}`, headers(token));
    return { current: response.data.current ?? null, history: response.data.history ?? [] };
  },

  async select(
    claimId: string,
    body: { text: string; category?: string; source?: PriorityCause['source'] },
    token: string,
  ): Promise<PriorityCauseState> {
    const response = await axios.post<PriorityCauseState>(`${API_BASE_URL}/priority-cause/${claimId}`, body, headers(token));
    return { current: response.data.current ?? null, history: response.data.history ?? [] };
  },
};
