import { AUTH_API_URL as AUTH_API, ACTION_PLAN_API_URL as ACTION_API } from '../config/apiEnv';
import i18n from '../i18n';

export type AccountEventType =
  | 'creation'
  | 'assignment'
  | 'modification'
  | 'lock'
  | 'unlock'
  | 'role_change';

export interface ModificationChange {
  field: string;
  from: string;
  to: string;
}

export interface AccountHistoryRow {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  eventType: AccountEventType;
  detail: string;
  performedBy: string;
  changes?: ModificationChange[];
}

interface AuthAuditLog {
  id: number;
  actorEmail: string;
  targetEmail: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

interface WorkflowHistoryItem {
  id: string;
  actionType: string;
  changedBy: string;
  changedByName?: string;
  newAssignedToId?: string;
  newAssignedToName?: string;
  note?: string;
  createdAt: string;
  actionPlan?: { title?: string; code?: string };
}

/** Getters so labels follow the current UI language. */
const EVENT_LABELS: Record<AccountEventType, string> = {
  get creation() { return i18n.t('accountHistory.creation'); },
  get assignment() { return i18n.t('accountHistory.assignment'); },
  get modification() { return i18n.t('accountHistory.modification'); },
  get lock() { return i18n.t('accountHistory.lock'); },
  get unlock() { return i18n.t('accountHistory.unlock'); },
  get role_change() { return i18n.t('accountHistory.roleChange'); },
};

export { EVENT_LABELS };

const isAdminRole = (roles: string[] | undefined) =>
  (roles ?? []).some((r) => ['admin', 'superadmin'].includes(String(r).toLowerCase()));

const unwrap = (raw: unknown): any[] => {
  if (Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o?.['$values'])) return o['$values'] as any[];
  if (Array.isArray(o?.data)) return o.data as any[];
  if (Array.isArray(o?.items)) return o.items as any[];
  if (Array.isArray(o?.logs)) return o.logs as any[];
  return [];
};

function pickLog(log: any, ...keys: string[]): string {
  for (const k of keys) {
    const v = log?.[k];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
}

function isUuid(value?: string | null): boolean {
  return !!value && /^[0-9a-f-]{36}$/i.test(value.trim());
}

function emailLocalPart(email?: string | null): string {
  if (!email || !email.includes('@')) return email?.trim() ?? '';
  return email.split('@')[0] ?? '';
}

type UserIndex = {
  byId: Record<string, string>;
  byEmail: Record<string, string>;
};

function buildUserIndex(
  users: { id?: string; fullName?: string; name?: string; email?: string; userName?: string }[],
): UserIndex {
  const byId: Record<string, string> = {};
  const byEmail: Record<string, string> = {};

  for (const u of users) {
    const id = String(u.id ?? '').trim();
    const email = String(u.email ?? '').trim().toLowerCase();
    const fullName = String(u.fullName ?? u.name ?? '').trim();
    const userName = String(u.userName ?? '').trim();
    const label =
      fullName
      || (userName.includes('@') ? emailLocalPart(userName) : userName)
      || emailLocalPart(email)
      || email
      || id;
    if (!label) continue;
    if (id) byId[id.toLowerCase()] = label;
    if (email && email !== '—') byEmail[email] = label;
  }

  return { byId, byEmail };
}

function resolveUserLabel(raw: string | null | undefined, index: UserIndex): string {
  const value = String(raw ?? '').trim();
  if (!value || value.toLowerCase() === 'system') return i18n.t('audit.system');
  if (value.toLowerCase() === 'unknown') return i18n.t('audit.unknown');

  const lower = value.toLowerCase();
  if (index.byId[lower]) return index.byId[lower];
  if (index.byEmail[lower]) return index.byEmail[lower];

  if (value.includes('@')) return emailLocalPart(value) || value;
  if (isUuid(value)) return index.byId[lower] ?? i18n.t('accountHistory.userShort', { id: value.slice(0, 8) });
  return value;
}

function isValidEmployeeEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return !!e && e !== '—' && e.includes('@');
}

/** null = événement ignoré (ex. LOGIN — hors périmètre historique compte) */
function mapIamEventType(action: string, detail: string | null): AccountEventType | null {
  const a = action.toUpperCase().trim();
  const d = (detail ?? '').toLowerCase();
  if (a === 'LOGIN') return null;
  if (a === 'CREATE') return 'creation';
  if (a === 'LOCK' || a === 'LOCKOUT') return 'lock';
  if (a === 'UNLOCK') return 'unlock';
  if (a === 'DELETE') return null;
  if (a === 'UPDATE') {
    if (d.includes('role:') || d.includes('rôle')) return 'role_change';
    return 'modification';
  }
  if (a === 'RESET_PASSWORD') return 'modification';
  return null;
}

const FIELD_LABELS: Record<string, string> = {
  get FullName() { return i18n.t('employeesAdmin.fullName'); },
  get Department() { return i18n.t('planDetail.department'); },
  get Role() { return i18n.t('employeesAdmin.role'); },
  get Email() { return i18n.t('employeesAdmin.email'); },
  get OrganizationId() { return i18n.t('usersAdmin.organization'); },
  get Phone() { return i18n.t('employeesAdmin.phone'); },
  get Permissions() { return i18n.t('employeesAdmin.permissions'); },
};

function humanizeValue(raw: string): string {
  const v = raw.trim();
  if (!v || v === 'none' || v === 'null') return '—';
  if (v === 'user') return i18n.t('employeesAdmin.roleUser');
  if (v === 'admin') return i18n.t('portal.tagAdmin');
  if (v === 'superadmin') return i18n.t('employeeProfileAdmin.roleSuperadmin');
  return v;
}

export function parseModificationDetail(
  raw: string | null | undefined,
  action?: string,
): {
  detail: string;
  changes: ModificationChange[];
} {
  const text = (raw ?? '').trim();
  const actionKey = (action ?? '').toUpperCase();

  if (!text) {
    if (actionKey === 'RESET_PASSWORD') {
      return { detail: i18n.t('accountHistory.passwordReset'), changes: [] };
    }
    return { detail: i18n.t('accountHistory.profileUpdatedNoDetail'), changes: [] };
  }
  if (text.toLowerCase() === 'no field changes') {
    return { detail: i18n.t('accountHistory.savedNoChange'), changes: [] };
  }
  if (actionKey === 'RESET_PASSWORD' || /password reset/i.test(text)) {
    return { detail: i18n.t('accountHistory.passwordReset'), changes: [] };
  }

  const changes: ModificationChange[] = [];
  const segments = text.includes(';')
    ? text.split(';').map((s) => s.trim()).filter(Boolean)
    : text.split(',').map((s) => s.trim()).filter(Boolean);

  for (const part of segments) {
    const arrowMatch = part.match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/);
    if (arrowMatch) {
      const key = arrowMatch[1].trim();
      changes.push({
        field: FIELD_LABELS[key] ?? key,
        from: humanizeValue(arrowMatch[2]),
        to: humanizeValue(arrowMatch[3]),
      });
      continue;
    }
    const kvMatch = part.match(/^([^:]+):\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      changes.push({
        field: FIELD_LABELS[key] ?? key,
        from: '—',
        to: humanizeValue(kvMatch[2]),
      });
      continue;
    }
    if (/permission/i.test(part)) {
      changes.push({ field: i18n.t('employeesAdmin.permissions'), from: '—', to: part });
      continue;
    }
    changes.push({ field: i18n.t('accountHistory.information'), from: '—', to: part });
  }

  const detail =
    changes.length > 0
      ? changes.map((c) => `${c.field} : ${c.from} → ${c.to}`).join(' · ')
      : text;

  return { detail, changes };
}

function buildEventDetail(
  eventType: AccountEventType,
  rawDetail: string | null,
  action?: string,
): {
  detail: string;
  changes?: ModificationChange[];
} {
  if (eventType === 'modification' || eventType === 'role_change') {
    const parsed = parseModificationDetail(rawDetail, action);
    return { detail: parsed.detail, changes: parsed.changes };
  }
  if (eventType === 'creation') {
    return { detail: rawDetail?.trim() || i18n.t('accountHistory.createdDefault') };
  }
  if (eventType === 'lock') {
    return { detail: rawDetail?.trim() || i18n.t('accountHistory.lockedDefault') };
  }
  if (eventType === 'unlock') {
    return { detail: rawDetail?.trim() || i18n.t('accountHistory.unlockedDefault') };
  }
  return { detail: rawDetail?.trim() || EVENT_LABELS[eventType] };
}

export async function fetchAccountHistory(
  token: string,
  employees: { id: string; fullName?: string; name?: string; email?: string; roles?: string[] }[],
  authUsers: { id: string; fullName?: string; email?: string; roles?: string[] }[] = [],
): Promise<AccountHistoryRow[]> {
  const hdrs = { Authorization: `Bearer ${token}` };
  const employeeList = employees.filter((e) => !isAdminRole(e.roles));

  const userIndex = buildUserIndex([...authUsers, ...employeeList]);

  const byEmail: Record<string, { id: string; name: string; email: string }> = {};
  const byId: Record<string, { id: string; name: string; email: string }> = {};
  const employeeIds = new Set<string>();
  const employeeEmails = new Set<string>();

  const registerEmployee = (e: { id: string; fullName?: string; name?: string; email?: string }) => {
    const id = String(e.id ?? '').trim();
    if (!id) return;
    const email = String(e.email ?? '').trim();
    const name = resolveUserLabel(e.fullName ?? e.name ?? e.email ?? id, userIndex);
    const entry = { id, name, email };
    byId[id.toLowerCase()] = entry;
    employeeIds.add(id.toLowerCase());
    const emailKey = email.toLowerCase();
    if (isValidEmployeeEmail(emailKey)) {
      byEmail[emailKey] = entry;
      employeeEmails.add(emailKey);
    }
  };

  employeeList.forEach(registerEmployee);
  authUsers.filter((u) => !isAdminRole(u.roles)).forEach(registerEmployee);

  const [iamRes, wfRes] = await Promise.allSettled([
    fetch(`${AUTH_API}/api/admin/audit-logs?page=1&pageSize=1000`, { headers: hdrs }),
    fetch(`${ACTION_API}/actionplan/history`, { headers: hdrs }),
  ]);

  const rows: AccountHistoryRow[] = [];

  if (iamRes.status === 'fulfilled' && iamRes.value.ok) {
    const data = await iamRes.value.json();
    const logs: AuthAuditLog[] = unwrap(data) as AuthAuditLog[];
    logs.forEach((raw) => {
      const targetRaw = pickLog(raw, 'targetEmail', 'TargetEmail');
      const targetLower = targetRaw.toLowerCase();

      let emp = byEmail[targetLower];
      if (!emp && isUuid(targetRaw)) emp = byId[targetLower];
      if (!emp) return;

      const isEmployee =
        employeeEmails.has(targetLower)
        || (isUuid(targetRaw) && employeeIds.has(targetLower));
      if (!isEmployee) return;

      const action = pickLog(raw, 'action', 'Action');
      const rawDetail = pickLog(raw, 'detail', 'Detail') || null;
      const eventType = mapIamEventType(action, rawDetail);
      if (!eventType) return;

      const built = buildEventDetail(eventType, rawDetail, action);
      const actorRaw =
        pickLog(raw, 'actorEmail', 'ActorEmail')
        || pickLog(raw, 'actorId', 'ActorId');

      rows.push({
        id: `iam-${pickLog(raw, 'id', 'Id')}`,
        date: pickLog(raw, 'timestamp', 'Timestamp'),
        employeeId: emp.id,
        employeeName: emp.name,
        employeeEmail: emp.email || targetRaw,
        eventType,
        detail: built.detail,
        changes: built.changes,
        performedBy: resolveUserLabel(actorRaw, userIndex),
      });
    });
  }

  if (wfRes.status === 'fulfilled' && wfRes.value.ok) {
    const raw = await wfRes.value.json();
    const list: WorkflowHistoryItem[] = unwrap(raw) as WorkflowHistoryItem[];
    list.forEach((item) => {
      const type = pickLog(item, 'actionType', 'ActionType').toLowerCase();
      if (type !== 'assigned' && type !== 'assignment') return;

      const assigneeId = pickLog(item, 'newAssignedToId', 'NewAssignedToId');
      const assigneeName = pickLog(item, 'newAssignedToName', 'NewAssignedToName');

      let empEntry = assigneeId ? byId[assigneeId.toLowerCase()] : undefined;
      if (!empEntry && assigneeName) {
        const match = employeeList.find((e) => {
          const name = String(e.fullName ?? e.name ?? '').trim();
          const email = String(e.email ?? '').trim().toLowerCase();
          return (
            name === assigneeName
            || (email && assigneeName.toLowerCase().includes(email))
          );
        });
        if (match) {
          empEntry = byId[match.id.toLowerCase()] ?? {
            id: match.id,
            name: resolveUserLabel(match.fullName ?? match.name ?? match.email ?? match.id, userIndex),
            email: match.email ?? '',
          };
        }
      }
      if (!empEntry) return;

      const plan = item.actionPlan as Record<string, unknown> | undefined;
      const planTitle = pickLog(plan, 'title', 'Title');
      const changedByRaw =
        pickLog(item, 'changedByName', 'ChangedByName')
        || pickLog(item, 'changedBy', 'ChangedBy');

      rows.push({
        id: `wf-${pickLog(item, 'id', 'Id')}`,
        date: pickLog(item, 'createdAt', 'CreatedAt'),
        employeeId: empEntry.id,
        employeeName: empEntry.name,
        employeeEmail: empEntry.email,
        eventType: 'assignment',
        detail: planTitle
          ? i18n.t('accountHistory.capaPlan', { title: planTitle })
          : pickLog(item, 'note', 'Note') || i18n.t('accountHistory.newAssignment'),
        performedBy: resolveUserLabel(changedByRaw, userIndex),
      });
    });
  }

  return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
