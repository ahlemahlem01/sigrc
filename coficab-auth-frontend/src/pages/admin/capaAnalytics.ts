import { getActionPlans, getArchivedActionPlans, getUsersForAssignment } from '../../services/actionPlanService';

export type UiType = 'preventif' | 'correctif' | 'amelioration';
export type UiStatus = 'created' | 'ongoing' | 'closed' | 'archived';
export type ProgressKind = 'open' | 'closed' | 'validated' | 'cancelled';

export type FlatAction = {
  id: string;
  title: string;
  planId: string;
  planTitle: string;
  planCode?: string;
  claimId?: string;
  type: UiType;
  process: string;
  /** Display progress 0–100 (Validated→100, Cancelled→0 for bars). */
  progress: number;
  /** Raw progress including 101/102 when available. */
  progressRaw: number;
  progressKind: ProgressKind;
  deadline?: string;
  createdAt?: string;
  assignedToId?: string;
  assignedToName?: string;
  priority?: number;
  late: boolean;
  /** Realized / validated (not cancelled). */
  closed: boolean;
  archived?: boolean;
  archivedAt?: string;
};

export type PlanRow = {
  id: string;
  code?: string;
  claimId?: string;
  title: string;
  type: UiType;
  status: UiStatus;
  progress: number;
  process: string;
  deadline?: string;
  createdAt?: string;
  assignedToId?: string;
  assignedToName?: string;
  ownerName?: string;
  archived?: boolean;
  archivedAt?: string;
  actions: FlatAction[];
};

export function unwrapList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

export function toUiType(raw: unknown): UiType {
  if (typeof raw === 'number') {
    return ({ 1: 'preventif', 2: 'correctif', 3: 'amelioration' } as const)[raw as 1 | 2 | 3] ?? 'preventif';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'pa' || s === 'preventif' || s === 'preventive') return 'preventif';
  if (s === '2' || s === 'pac' || s === 'correctif' || s === 'corrective') return 'correctif';
  if (s === '3' || s === 'pap' || s === 'amelioration' || s === 'improvement') return 'amelioration';
  return 'preventif';
}

export function toUiStatus(raw: unknown): UiStatus {
  if (typeof raw === 'number') {
    return ({ 1: 'created', 2: 'ongoing', 3: 'closed', 4: 'archived' } as const)[raw as 1 | 2 | 3 | 4] ?? 'created';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'created' || s === 'draft') return 'created';
  if (s === '2' || s === 'ongoing' || s === 'inprogress') return 'ongoing';
  if (s === '3' || s === 'closed' || s === 'validated') return 'closed';
  if (s === '4' || s === 'archived') return 'archived';
  return 'created';
}

/** Normalize ActionProgress enum / number / name → raw 0–102. */
export function parseProgressRaw(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const named: Record<string, number> = {
    notstarted: 0, twentyfive: 25, thirtythree: 33, fifty: 50, sixtysix: 66,
    seventyfive: 75, hundred: 100, validated: 101, cancelled: 102,
  };
  if (s in named) return named[s];
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function progressKindOf(raw: number): ProgressKind {
  if (raw === 102) return 'cancelled';
  if (raw === 101) return 'validated';
  if (raw >= 100) return 'closed';
  return 'open';
}

/** 0–100 for UI bars (validated counts as 100, cancelled as 0). */
export function parseProgress(raw: unknown): number {
  const n = parseProgressRaw(raw);
  if (n === 101) return 100;
  if (n === 102) return 0;
  return Math.max(0, Math.min(100, n));
}

export function periodStart(period: '7d' | '1m' | '3m' | '1y'): Date {
  const d = new Date();
  if (period === '7d') d.setDate(d.getDate() - 7);
  else if (period === '1m') d.setMonth(d.getMonth() - 1);
  else if (period === '3m') d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return d;
}

export async function resolveUserNames(token: string): Promise<Record<string, string>> {
  try {
    const res = await getUsersForAssignment(token);
    const users = unwrapList((res as any)?.data ?? res);
    const map: Record<string, string> = {};
    for (const u of users) {
      const id = String(u.id || '');
      if (!id) continue;
      map[id] = u.fullName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || id;
    }
    return map;
  } catch {
    return {};
  }
}

function pickName(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s) return s;
  }
  return undefined;
}

function mapRawPlans(
  raw: any[],
  mode: 'active' | 'archive' = 'active',
  nameFallback: Record<string, string> = {},
): { plans: PlanRow[]; actions: FlatAction[] } {
  const now = Date.now();
  const plans: PlanRow[] = [];
  const actions: FlatAction[] = [];

  for (const p of raw) {
    const status = toUiStatus(p.status ?? p.Status);
    const planArchived = !!(p.isArchived || p.IsArchived) || status === 'archived';
    if (mode === 'active' && planArchived) continue;

    const type = toUiType(p.type ?? p.Type ?? p.planType ?? p.PlanType);
    const planId = String(p.id || p.Id);
    const planTitle = String(p.title || p.Title || '');
    const planCode = p.reference || p.Reference || p.code || p.Code || undefined;
    const claimIdRaw = p.claimId || p.ClaimId;
    const claimId = claimIdRaw ? String(claimIdRaw) : undefined;
    const process = String(p.departmentName || p.DepartmentName || p.department?.name || '—');
    const planAssignedId = p.assignedToId || p.AssignedToId || undefined;
    const planAssignedName = pickName(
      p.assignedToName, p.AssignedToName,
      planAssignedId ? nameFallback[String(planAssignedId)] : undefined,
    );
    const planActions = unwrapList(p.planActions ?? p.PlanActions);
    const flat: FlatAction[] = [];

    for (const a of planActions) {
      const actionArchived = !!(a.isArchived || a.IsArchived);
      if (mode === 'active' && actionArchived) continue;
      if (mode === 'archive' && !planArchived && !actionArchived) continue;

      const progressRaw = parseProgressRaw(a.progress ?? a.Progress);
      const kind = progressKindOf(progressRaw);
      const progress = parseProgress(progressRaw);
      const deadline = a.deadline || a.Deadline;
      const closed = kind === 'closed' || kind === 'validated';
      const late = !closed && kind !== 'cancelled' && !!deadline && new Date(deadline).getTime() < now;
      const assignedToId = a.assignedToId || a.AssignedToId || planAssignedId;
      const assignedToName = pickName(
        a.assignedToName, a.AssignedToName,
        assignedToId ? nameFallback[String(assignedToId)] : undefined,
        planAssignedName,
      );
      const actionType = toUiType(a.planType ?? a.PlanType ?? p.type ?? p.Type);
      const actionProcess = String(
        a.departmentName || a.DepartmentName || process,
      );

      const item: FlatAction = {
        id: String(a.id || a.Id),
        title: String(a.title || a.Title || ''),
        planId,
        planTitle: String(a.planTitle || a.PlanTitle || planTitle),
        planCode,
        claimId,
        type: actionType,
        process: actionProcess,
        progress,
        progressRaw,
        progressKind: kind,
        deadline,
        createdAt: a.createdAt || a.CreatedAt || p.createdAt || p.CreatedAt,
        assignedToId: assignedToId ? String(assignedToId) : undefined,
        assignedToName,
        priority: typeof (a.priority ?? a.Priority) === 'number' ? (a.priority ?? a.Priority) : undefined,
        late,
        closed,
        archived: actionArchived || planArchived,
        archivedAt: a.archivedAt || a.ArchivedAt || p.archivedAt || p.ArchivedAt,
      };
      flat.push(item);
      if (mode === 'archive') {
        if (actionArchived || planArchived) actions.push(item);
      } else {
        actions.push(item);
      }
    }

    if (mode === 'archive' && !planArchived) continue;

    plans.push({
      id: planId,
      code: planCode,
      claimId,
      title: planTitle,
      type,
      status: planArchived ? 'archived' : status,
      progress: Number(p.progress ?? p.Progress ?? 0) || 0,
      process,
      deadline: p.deadline || p.Deadline,
      createdAt: p.createdAt || p.CreatedAt,
      assignedToId: planAssignedId ? String(planAssignedId) : undefined,
      assignedToName: planAssignedName,
      ownerName: pickName(p.ownerName, p.OwnerName),
      archived: planArchived,
      archivedAt: p.archivedAt || p.ArchivedAt,
      actions: flat,
    });
  }

  return { plans, actions };
}

export async function loadCapaDataset(token: string): Promise<{ plans: PlanRow[]; actions: FlatAction[] }> {
  const [res, names] = await Promise.all([
    getActionPlans(token, true),
    resolveUserNames(token),
  ]);
  const raw = unwrapList(res.data?.data ?? res.data);
  return mapRawPlans(raw, 'active', names);
}

export async function loadArchivedCapaDataset(token: string): Promise<{ plans: PlanRow[]; actions: FlatAction[] }> {
  const names = await resolveUserNames(token);
  try {
    const res = await getArchivedActionPlans(token);
    const raw = unwrapList(res.data?.data ?? res.data);
    if (raw.length) {
      const archived = mapRawPlans(raw, 'archive', names);
      const allRes = await getActionPlans(token, true);
      const allRaw = unwrapList(allRes.data?.data ?? allRes.data);
      const fromAll = mapRawPlans(allRaw, 'archive', names);
      const planIds = new Set(archived.plans.map((p) => p.id));
      const mergedPlans = [...archived.plans, ...fromAll.plans.filter((p) => !planIds.has(p.id))];
      const actionIds = new Set(archived.actions.map((a) => a.id));
      const mergedActions = [...archived.actions, ...fromAll.actions.filter((a) => !actionIds.has(a.id))];
      return { plans: mergedPlans, actions: mergedActions };
    }
  } catch {
    /* fallback */
  }
  const res = await getActionPlans(token, true);
  const raw = unwrapList(res.data?.data ?? res.data);
  return mapRawPlans(raw, 'archive', names);
}

export function monthKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

export function displayResponsible(row: { assignedToName?: string; assignedToId?: string }, fallback = '—'): string {
  if (row.assignedToName) return row.assignedToName;
  if (row.assignedToId) return row.assignedToId.slice(0, 8);
  return fallback;
}
