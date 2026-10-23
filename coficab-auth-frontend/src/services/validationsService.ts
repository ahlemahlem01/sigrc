import axios from 'axios';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';

const headers = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export interface FiveWhyQueueItem {
  analysisId: string;
  claimId: string;
  claimTitle: string;
  reference?: string | null;
  clientId?: string | null;
  defectType?: string | null;
  productionLine?: string | null;
  assignedToName?: string | null;
  rootCause?: string | null;
  since: string;
}

export interface DecisionResult {
  id: string;
  ok: boolean;
  error?: string | null;
}

/** The 5 Why waiting for a decision, oldest first (one request, whatever the number of claims). */
export async function getFiveWhyQueue(token: string): Promise<FiveWhyQueueItem[]> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/validations/five-why`, headers(token));
  return Array.isArray(data) ? data : [];
}

/** Approves or returns files waiting for validation. A return needs a reason; each file is decided on its own. */
export async function decideDossiers(token: string, claimIds: string[], approve: boolean, comment?: string): Promise<DecisionResult[]> {
  const { data } = await axios.post(`${ACTION_PLAN_API_URL}/validations/dossiers/decide`, { claimIds, approve, comment }, headers(token));
  return Array.isArray(data?.results) ? data.results : [];
}

/** Keeps the reason of a returned 5 Why in the claim's history and tells the people concerned. */
export async function notifyFiveWhyReturned(token: string, claimId: string, comment: string): Promise<void> {
  await axios.post(`${ACTION_PLAN_API_URL}/validations/five-why/returned`, { claimId, comment }, headers(token));
}

export interface AdminDeadlineRow {
  id: string;
  kind: 'claim' | 'plan' | 'action';
  title: string;
  reference?: string | null;
  subtitle?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  deadline: string;
  closed: boolean;
  statusCode?: string | null;
  planId?: string | null;
}

/** Every deadline the administrator follows, from one request (open items and the last 90 days of closed ones). */
export async function getAdminDeadlines(token: string, organizationIds?: string, departmentId?: string): Promise<AdminDeadlineRow[]> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/admin/deadlines`, {
    ...headers(token),
    params: { organizationIds: organizationIds || undefined, departmentId: departmentId || undefined },
    timeout: 60000,
  });
  return Array.isArray(data?.items) ? data.items : [];
}
