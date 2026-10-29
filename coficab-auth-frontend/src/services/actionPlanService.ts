// src/services/actionPlanService.ts
import axios from 'axios';
import { scopeParams } from './organizationScopeStore';
import { ACTION_PLAN_API_URL as BASE_URL, AUTH_API_URL as AUTH_API } from '../config/apiEnv';  

const getHeaders = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` }
});

// --- Action Plans ---
export const getActionPlans = (token: string, includeActions = false) =>
  axios.get(`${BASE_URL}/actionplan`, {
    ...getHeaders(token),
    params: { ...(includeActions ? { includeActions: true } : {}), ...scopeParams() },
  });

export const getSteeringPlans = (token: string) =>
  axios.get(`${BASE_URL}/actionplan/steering`, { ...getHeaders(token), params: scopeParams() });

/** Administrators: more time for a late CAPA plan. A reason is required; the old date and the reason are kept in the plan history. */
export const extendPlanDeadline = (token: string, id: string, newDeadline: string, reason: string) =>
  axios.post(`${BASE_URL}/actionplan/${id}/deadline-extension`, { newDeadline, reason }, getHeaders(token));

export const getActionPlanById = (token: string, id: string) =>
  axios.get(`${BASE_URL}/actionplan/${id}`, getHeaders(token));

export const createActionPlan = (token: string, data: {
  title: string;
  description?: string;
  type: number;
  departmentId: string;
  organizationId?: string;
  /** Business domain (reference list "domain"); empty = quality. */
  domain?: string;
  assignedToId?: string;
  deadline?: string;
  claimId?: string;
  alertId?: string;
}) => axios.post(`${BASE_URL}/actionplan`, data, getHeaders(token));

export const importActionPlansCsv = (token: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return axios.post<{ created: number; ids: string[]; errors: { line: number; message: string }[] }>(
    `${BASE_URL}/actionplan/import`,
    form,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
  );
};

export const updateActionPlan = (token: string, id: string, data: {
  title?: string;
  description?: string;
  status?: number;
  type?: number;
  domain?: string;
  departmentId?: string;
  organizationId?: string;
  assignedToId?: string;
  deadline?: string;
  claimId?: string;
}) => axios.put(`${BASE_URL}/actionplan/${id}`, data, getHeaders(token));

export const bulkAssignPlans = (token: string, planIds: string[], userId: string) =>
  axios.post<{ assigned: number; skipped: number }>(`${BASE_URL}/actionplan/bulk-assign`, { planIds, userId }, getHeaders(token));

export const archiveActionPlan = (token: string, id: string) =>
  axios.delete(`${BASE_URL}/actionplan/${id}`, getHeaders(token));

export const getActionPlansByDepartment = (token: string, departmentId: string) =>
  axios.get(`${BASE_URL}/actionplan/department/${departmentId}`, getHeaders(token));

// 🆕 NEW: Get archived action plans
export const getArchivedActionPlans = (token: string) =>
  axios.get(`${BASE_URL}/actionplan/archived`, getHeaders(token));

// 🆕 NEW: Restore archived action plan
export const restoreActionPlan = (token: string, id: string) =>
  axios.post(`${BASE_URL}/actionplan/${id}/restore`, {}, getHeaders(token));

// 🆕 NEW: Get action plans with filters
export const getActionPlansFiltered = (token: string, params: {
  search?: string;
  departmentId?: string;
  status?: string;
  type?: string;
  assignedToId?: string;
  organizationId?: string;
  includeArchived?: boolean;
}) => axios.get(`${BASE_URL}/actionplan`, {
  ...getHeaders(token),
  params
});

// --- Plan Actions ---
// NOTE: backend controller is [Route("api/[controller]")] on PlanActionController,
// which resolves to api/planaction (lowercase, no hyphen). BASE_URL already ends in
// /api, so every plan-action endpoint below is `${BASE_URL}/planaction/...` — never
// `${BASE_URL}/api/...` (that would double up /api) and never `plan-actions` (that
// route does not exist on the backend).

export const getPlanActions = (token: string, actionPlanId: string) =>
  axios.get(`${BASE_URL}/planaction/by-plan/${actionPlanId}`, getHeaders(token));

export const createPlanAction = (token: string, data: {
  title: string;
  description?: string;
  deadline?: string;
  priority?: number;
  assignedToId?: string;
  actionPlanId?: string;
  order?: number;                // 🆕 added
}) => axios.post(`${BASE_URL}/planaction`, data, getHeaders(token));

export const updatePlanAction = (token: string, id: string, data: {  // 🆕 NEW
  title?: string;
  description?: string;
  deadline?: string;
  priority?: number;
  assignedToId?: string;
  status?: number;
  order?: number;
}) => axios.put(`${BASE_URL}/planaction/${id}`, data, getHeaders(token));

// ✅ FIXED: was `${BASE_URL}/api/plan-actions/${id}/progress`
// → doubled /api AND used the wrong route segment (plan-actions instead of planaction).
// Correct backend route: PATCH api/planaction/{id}/progress
export const updateMyPlanActionProgress = async (
  token: string,
  planActionId: string,
  progress: number,
  note?: string
): Promise<void> => {
  await axios.patch(
    `${BASE_URL}/planaction/${planActionId}/progress`,
    { progress, note },
    getHeaders(token)
  );
};

export const archivePlanAction = (token: string, id: string) =>
  axios.delete(`${BASE_URL}/planaction/${id}`, getHeaders(token));

export const restorePlanAction = (token: string, id: string) =>
  axios.post(`${BASE_URL}/planaction/${id}/restore`, {}, getHeaders(token));

export const getOverduePlanActions = (token: string) =>
  axios.get(`${BASE_URL}/planaction/overdue`, getHeaders(token));

// 🆕 NEW: Reorder plan actions
export const reorderPlanActions = (token: string, actionPlanId: string, planActionIds: string[]) =>
  axios.post(`${BASE_URL}/planaction/reorder`, {
    actionPlanId,
    planActionIds
  }, getHeaders(token));

// --- Departments ---
export const getDepartments = (token: string) =>
  axios.get(`${BASE_URL}/department`, getHeaders(token));

export const getDepartmentById = (token: string, id: string) =>
  axios.get(`${BASE_URL}/department/${id}`, getHeaders(token));

export const createDepartment = (token: string, data: {
  name: string;
  code: string;
  description?: string;
  organizationId: string;
  siteId?: string;
  regionId?: string;
}) => axios.post(`${BASE_URL}/department`, data, getHeaders(token));

export const updateDepartment = (token: string, id: string, data: {
  name: string;
  code: string;
  description?: string;
}) => axios.put(`${BASE_URL}/department/${id}`, data, getHeaders(token));

export const archiveDepartment = (token: string, id: string) =>
  axios.delete(`${BASE_URL}/department/${id}`, getHeaders(token));

// 🆕 NEW: Organizations
export const getOrganizations = (token: string) =>
  axios.get(`${BASE_URL}/organization`, getHeaders(token));

// ============================================================
// 🆕 NOUVELLES FONCTIONS POUR L'ASSIGNATION DES ACTION PLANS
// ============================================================

export const assignActionPlanToUser = async (
  token: string,
  data: {
    userId: string;
    actionPlanId: string;
    permissions: {
      view: boolean;
      edit: boolean;
      delete: boolean;
    };
  }
) => {
  return await axios.post(`${BASE_URL}/actionplan/assign`, data, getHeaders(token));
};

export const getUserActionPlans = async (token: string) => {
  return await axios.get(`${BASE_URL}/actionplan/user/assigned`, getHeaders(token));
};

export const getUsersForAssignment = async (token: string) => {
  return await axios.get(`${AUTH_API}/api/admin/users`, getHeaders(token));
};

export const getAssignedActionPlanById = async (token: string, id: string) => {
  return await axios.get(`${BASE_URL}/actionplan/assigned/${id}`, getHeaders(token));
};

export const updateAssignedActionPlanPermissions = async (
  token: string,
  id: string,
  data: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
  }
) => {
  return await axios.patch(`${BASE_URL}/actionplan/assigned/${id}/permissions`, data, getHeaders(token));
};

export const unassignActionPlanFromUser = async (
  token: string,
  data: {
    userId: string;
    actionPlanId: string;
  }
) => {
  return await axios.delete(`${BASE_URL}/actionplan/assign`, {
    ...getHeaders(token),
    data: data
  });
};

// 🆕 Shape returned by GET api/actionplan/assignments (AssignedActionPlanDto, camelCase JSON).
// ⚠️ `id` is actually the ActionPlanId, not a unique per-assignment id — see
// ActionPlanService.cs: `Id = a.ActionPlanId.ToString()`. If the same plan is assigned
// to several employees, they all share the same `id`. Consumers should build a
// composite key (e.g. `${assignedToId}::${id}`) wherever uniqueness matters.
export interface RawAssignment {
  id: string;
  title: string;
  description?: string;
  status: number;
  progress: number;
  assignedToId: string;
  createdAt: string;
  permissions: { view: boolean; edit: boolean; delete: boolean };
  updatedBy?: string;
  assignedBy?: string;
  claimId?: string;
}

// ✅ FIXED: was returning the raw AxiosResponse (no `.data`), which broke any
// caller doing `raw.map(...)` — TS correctly flagged `Property 'map' does not
// exist on type 'AxiosResponse'`. Now returns the unwrapped, typed array.
export const getAllAssignments = async (token: string): Promise<RawAssignment[]> => {
  const res = await axios.get(`${BASE_URL}/actionplan/assignments`, getHeaders(token));
  return res.data;
};

// ✅ FIXED: was `${BASE_URL}/api/plan-actions/${id}/progress`
// → doubled /api AND used the wrong route segment. Correct backend route:
// PATCH api/planaction/{id}/progress (matches PlanActionController.UpdateProgress)
export const updatePlanActionProgress = async (
  token: string,
  planActionId: string,
  progress: number,
  note?: string
): Promise<void> => {
  await axios.patch(
    `${BASE_URL}/planaction/${planActionId}/progress`,
    { progress, note },
    getHeaders(token)
  );
};

/** Administrators: validates a sub-action finished at 100 % (it is then locked). */
export const validatePlanAction = (token: string, planActionId: string, note?: string) =>
  axios.post(`${BASE_URL}/planaction/${planActionId}/validate`, { note }, getHeaders(token));

/** Administrators: sends a finished sub-action back to its assignee, with the reason. */
export const rejectPlanAction = (token: string, planActionId: string, message: string) =>
  axios.post(`${BASE_URL}/planaction/${planActionId}/reject`, { message }, getHeaders(token));

/** Administrators: more time for a late, unfinished sub-action; the old date, the new one and the reason go to its history. */
export const extendPlanActionDeadline = (token: string, planActionId: string, newDeadline: string, reason: string) =>
  axios.post(`${BASE_URL}/planaction/${planActionId}/deadline-extension`, { newDeadline, reason }, getHeaders(token));

/** Administrators: gives one sub-action to another person (kept in its assignment history). */
export const reassignPlanAction = (token: string, planActionId: string, userId: string, note?: string) =>
  axios.post(`${BASE_URL}/planaction/${planActionId}/reassign`, { userId, note }, getHeaders(token));

/** Administrators: gives the whole plan (and its sub-actions not yet validated) to another person. */
export const reassignActionPlan = (token: string, planId: string, userId: string, note?: string) =>
  axios.post(`${BASE_URL}/actionplan/${planId}/reassign`, { userId, note }, getHeaders(token));

/** Administrators: warns the person in charge of a sub-action. */
export const warnPlanAction = (token: string, planActionId: string, message: string) =>
  axios.post(`${BASE_URL}/planaction/${planActionId}/warn`, { message }, getHeaders(token));

/** Administrators: warns one person about a plan; kept in the plan history. */
export const warnActionPlan = (token: string, planId: string, userId: string, message: string) =>
  axios.post(`${BASE_URL}/actionplan/${planId}/warn`, { userId, message }, getHeaders(token));

export const getPendingValidation = (token: string) =>
  axios.get(`${BASE_URL}/actionplan/pending-validation`, getHeaders(token));

export const getRejectedActionPlans = (token: string) =>
  axios.get(`${BASE_URL}/actionplan/rejected`, getHeaders(token));

/** Employee: puts a plan sent back by the admin into the validation queue again. */
export const resubmitActionPlan = (token: string, id: string) =>
  axios.post(`${BASE_URL}/actionplan/assigned/${id}/resubmit`, {}, getHeaders(token));

export const closeActionPlan = (token: string, id: string) =>
  axios.post(`${BASE_URL}/actionplan/${id}/close`, {}, getHeaders(token));

export const rejectActionPlan = (token: string, id: string, comment?: string) =>
  axios.post(`${BASE_URL}/actionplan/${id}/reject`, { comment: comment || '' }, getHeaders(token));

export const uploadPlanActionDocument = (token: string, planActionId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return axios.post(`${BASE_URL}/planaction/${planActionId}/documents`, form, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export interface PlanActionProof {
  id: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  uploadedByName?: string | null;
  createdAt: string;
}

export const getPlanActionDocuments = (token: string, planActionId: string) =>
  axios.get<PlanActionProof[]>(`${BASE_URL}/planaction/${planActionId}/documents`, getHeaders(token));

/** The bytes of a proof (the file is private: it needs the token, so it is fetched, then shown or saved from an object URL). */
export const downloadPlanActionProof = async (token: string, documentId: string): Promise<Blob> =>
  (await axios.get<Blob>(`${BASE_URL}/planaction/documents/${documentId}/file`, { ...getHeaders(token), responseType: 'blob' })).data;

export interface PlanComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'employee';
  body: string;
  createdAt: string;
  editedAt?: string | null;
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Comments on a plan, oldest first: administrators and the people who work on the plan (the others get a notification). */
export const getPlanComments = async (token: string, planId: string): Promise<PlanComment[]> =>
  (await axios.get<PlanComment[]>(`${BASE_URL}/actionplan/${planId}/comments`, getHeaders(token))).data;

export const addPlanComment = async (token: string, planId: string, body: string): Promise<PlanComment> =>
  (await axios.post<PlanComment>(`${BASE_URL}/actionplan/${planId}/comments`, { body }, getHeaders(token))).data;

export const editPlanComment = async (token: string, planId: string, commentId: string, body: string): Promise<PlanComment> =>
  (await axios.put<PlanComment>(`${BASE_URL}/actionplan/${planId}/comments/${commentId}`, { body }, getHeaders(token))).data;

/** Archives a comment (nothing is deleted). */
export const archivePlanComment = async (token: string, planId: string, commentId: string): Promise<void> => {
  await axios.delete(`${BASE_URL}/actionplan/${planId}/comments/${commentId}`, getHeaders(token));
};

export interface PlanTimelineEvent {
  id: string;
  actionType: string;
  changedBy: string;
  changedByName?: string | null;
  note?: string | null;
  oldStatus?: number | null;
  newStatus?: number | null;
  newAssignedToName?: string | null;
  createdAt: string;
}

/** The history of a plan the caller can see: the plan's own events and those of its sub-actions (progress, proofs, validation). */
export const getPlanTimeline = async (token: string, planId: string): Promise<PlanTimelineEvent[]> =>
  (await axios.get<PlanTimelineEvent[]>(`${BASE_URL}/actionplan/assigned/${planId}/history`, getHeaders(token))).data;

// ✅ FIXED: was `${BASE_URL}/api/plan-actions/${id}/history`
// → doubled /api AND used the wrong route segment. Correct backend route:
// GET api/planaction/{id}/history (matches PlanActionController.GetHistory)
export const getPlanActionHistory = async (
  token: string,
  planActionId: string
): Promise<Array<{
  id: string;
  planActionId: string;
  changedBy: string;
  oldProgress: number;
  newProgress: number;
  note?: string;
  createdAt: string;
}>> => {
  const response = await axios.get(
    `${BASE_URL}/planaction/${planActionId}/history`,
    getHeaders(token)
  );
  return response.data;
};

/** Rewrites the description of a sub-action; the old and the new text are kept in its history. */
export const updatePlanActionDescription = async (token: string, planActionId: string, description: string) =>
  (await axios.patch(`${BASE_URL}/planaction/${planActionId}/description`, { description }, getHeaders(token))).data;

export type PlanActionAssignmentHistoryItem = {
  id: string;
  planActionId: string;
  changedBy: string;
  changedByName?: string | null;
  actionType: string;
  oldAssignedToId?: string | null;
  newAssignedToId?: string | null;
  oldAssignedToName?: string | null;
  newAssignedToName?: string | null;
  note?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

/** GET api/planaction/{id}/assignment-history */
export const getPlanActionAssignmentHistory = async (
  token: string,
  planActionId: string
): Promise<PlanActionAssignmentHistoryItem[]> => {
  const response = await axios.get(
    `${BASE_URL}/planaction/${planActionId}/assignment-history`,
    getHeaders(token)
  );
  const raw = response.data;
  const list = Array.isArray(raw) ? raw : [];
  return list.map((h: any) => ({
    id: String(h.id ?? h.Id ?? ''),
    planActionId: String(h.planActionId ?? h.PlanActionId ?? planActionId),
    changedBy: String(h.changedBy ?? h.ChangedBy ?? h.createdBy ?? h.CreatedBy ?? ''),
    changedByName: h.changedByName ?? h.ChangedByName ?? null,
    actionType: String(h.actionType ?? h.ActionType ?? '').toLowerCase(),
    oldAssignedToId: h.oldAssignedToId ?? h.OldAssignedToId ?? null,
    newAssignedToId: h.newAssignedToId ?? h.NewAssignedToId ?? null,
    oldAssignedToName: h.oldAssignedToName ?? h.OldAssignedToName ?? null,
    newAssignedToName: h.newAssignedToName ?? h.NewAssignedToName ?? null,
    note: h.note ?? h.Note ?? null,
    createdAt: String(h.createdAt ?? h.CreatedAt ?? ''),
    createdBy: h.createdBy ?? h.CreatedBy ?? null,
  }));
};
export const updateAssignedPlanProgress = async (
  token: string,
  planId: string,
  progress: number
): Promise<void> => {
  await axios.patch(
    `${BASE_URL}/actionplan/assigned/${planId}/progress`,
    { progress },
    getHeaders(token)
  );
};