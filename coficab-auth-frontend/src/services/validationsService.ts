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
  rootCauseOccurrence?: string | null;
  rootCauseDetection?: string | null;
  /** Second step of the validation thread: where the action plan stands (none, inProgress, toValidate, validated). */
  planStep?: string | null;
  planProgress?: number | null;
  since: string;
}

export interface PlanToApprove {
  planId: string;
  reference?: string | null;
  title: string;
  description?: string | null;
  type: number;
  /** 1 not started, 2 in progress, 3 closed. */
  status: number;
  progress: number;
  deadline?: string | null;
  claimId: string;
  claimTitle: string;
  claimReference?: string | null;
  assignedToName?: string | null;
  since: string;
  actions: Array<{ title: string; description?: string | null; deadline?: string | null }>;
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

export type MyValidationKind = 'fiveWhy' | 'capa' | 'eightD';

export interface MyValidationItem {
  kind: MyValidationKind;
  id: string;
  claimId?: string | null;
  reference?: string | null;
  title: string;
  since: string;
  linkPath: string;
  lastReminderAt?: string | null;
  reminderCount: number;
  /** For a plan: approved | pending (waiting for the administrator's approval) | returned (sent back with a reason). */
  approval?: 'approved' | 'pending' | 'returned' | null;
  approvalComment?: string | null;
  /** Progress of a plan, in percent (a plan can be decided once it reaches 100). */
  progress?: number | null;
  /** False for a plan whose actions are not all done: it is listed, but nobody can decide on it yet. */
  ready: boolean;
  canRemind: boolean;
  nextReminderAt?: string | null;
}

/** What the signed-in employee sent and that still waits for an administrator's decision, oldest first. */
export async function getMyValidations(token: string): Promise<MyValidationItem[]> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/my-validations`, headers(token));
  return Array.isArray(data) ? data : [];
}

/** Reminds the validators of one item (one reminder a day per item). */
export async function remindValidators(token: string, kind: MyValidationKind, targetId: string): Promise<{ sentAt: string; nextReminderAt: string }> {
  const { data } = await axios.post(`${ACTION_PLAN_API_URL}/my-validations/remind`, { kind, targetId }, headers(token));
  return data;
}

/** The plans built from a 5 Why that wait for the administrator's approval, oldest first. */
export async function getPlansToApprove(token: string): Promise<PlanToApprove[]> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/validations/plans/approval`, headers(token));
  return Array.isArray(data) ? data : [];
}

/** Approves a plan: its actions can then be carried out. */
export async function approvePlan(token: string, planId: string, comment?: string): Promise<void> {
  await axios.post(`${ACTION_PLAN_API_URL}/validations/plans/${planId}/approve`, { comment }, headers(token));
}

/** Sends a plan back to its author: the reason is required. */
export async function returnPlan(token: string, planId: string, comment: string): Promise<void> {
  await axios.post(`${ACTION_PLAN_API_URL}/validations/plans/${planId}/return`, { comment }, headers(token));
}

/** The author corrected a returned plan and submits it again. */
export async function resubmitPlan(token: string, planId: string): Promise<void> {
  await axios.post(`${ACTION_PLAN_API_URL}/my-validations/plans/${planId}/resubmit`, null, headers(token));
}
