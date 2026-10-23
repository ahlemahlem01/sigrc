import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  createActionPlan,
  createPlanAction,
  getPlanActions,
  getUserActionPlans,
} from '../../services/actionPlanService';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import './MyActionPlans.styles.css';

interface AssignedPlan {
  id: string;
  reference?: string | null;
  title: string;
  description?: string;
  status: number;
  type?: number;
  progress: number;
  permissions?: { view: boolean; edit: boolean; delete: boolean };
  createdAt?: string;
  deadline?: string;
  assignedToId?: string;
  assignedToName?: string;
  claimId?: string;
}

interface PlanActionItem {
  id: string;
  deadline?: string;
  progress?: number | string;
  actionPlanId: string;
  priority?: number | string;
  assignedToId?: string;
}

interface EnrichedPlan extends AssignedPlan {
  progress: number;
  nearestDeadline: string | null;
  totalActions: number;
  openActions: number;
  isOverdue: boolean;
  overdueDays: number;
  /** 3 = haute, 2 = moyenne, 1 = faible, 0 = inconnue */
  severity: number;
  assigneeLabel: string;
  claimId?: string;
}

type FilterTab = 'all' | 'active' | 'done' | 'late';
type SortField = 'date' | 'severity' | 'assignee' | 'progress';
type SortDir = 'asc' | 'desc';

const SEVERITY_LABEL_KEYS: Record<number, string> = {
  3: 'myActionPlans.severityHigh',
  2: 'myActionPlans.severityMedium',
  1: 'myActionPlans.severityLow',
  0: '',
};
type PlanType = 'preventif' | 'correctif' | 'amelioration';
type Priority = 'low' | 'medium' | 'high';

interface OrgItem {
  id: string;
  name: string;
}

interface DeptItem {
  id: string;
  name: string;
  organizationId?: string;
}

interface DraftAction {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  deadline: string;
}

const TYPE_OPTION_IDS: PlanType[] = ['preventif', 'correctif', 'amelioration'];

const TYPE_TO_NUM: Record<PlanType, number> = {
  preventif: 1,
  correctif: 2,
  amelioration: 3,
};

const PRIORITY_TO_NUM: Record<Priority, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const PRIORITY_LABEL_KEYS: Record<Priority, string> = {
  low: 'myActionPlans.priorityLow',
  medium: 'myActionPlans.priorityMedium',
  high: 'myActionPlans.priorityHigh',
};

function fixMojibake(text?: string): string {
  if (!text || !/[\u00C3\u00C2\u00E2]/.test(text)) return text ?? '';
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'value', 'list']) {
      if (Array.isArray(o[key])) return o[key] as T[];
      if (o[key] && typeof o[key] === 'object') {
        const nested = unwrapList<T>(o[key]);
        if (nested.length) return nested;
      }
    }
  }
  return [];
}

function toProgress(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    const map: Record<string, number> = {
      NotStarted: 0,
      TwentyFive: 25,
      ThirtyThree: 33,
      Fifty: 50,
      SixtySix: 66,
      SeventyFive: 75,
      Hundred: 100,
      Validated: 101,
      Cancelled: 102,
    };
    if (map[raw] != null) return map[raw];
  }
  return 0;
}

function isActionOpen(progress: unknown): boolean {
  return toProgress(progress) < 100;
}

const formatDate = (dateStr: string | null | undefined, locale: string) =>
  dateStr
    ? new Date(dateStr).toLocaleDateString(locale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const daysUntil = (dateStr: string) => {
  const due = new Date(dateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

const earliestDate = (dates: string[]): string | null => {
  if (dates.length === 0) return null;
  return [...dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
};

function planKey(id: string, reference?: string | null): string {
  if (reference) return reference;
  return `CAPA-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function statusMeta(
  plan: EnrichedPlan,
  t: (key: string) => string
): { label: string; cls: string } {
  if (plan.isOverdue && plan.status !== 3 && plan.status !== 4) {
    return { label: t('myActionPlans.statusLate'), cls: 'late' };
  }
  if (plan.status === 3 || plan.status === 4 || plan.progress >= 100) {
    return { label: t('myActionPlans.statusDone'), cls: 'done' };
  }
  if (plan.status === 2 || plan.progress > 0) {
    return { label: t('myActionPlans.statusDoing'), cls: 'doing' };
  }
  return { label: t('myActionPlans.statusTodo'), cls: 'todo' };
}

function isPlanDone(plan: EnrichedPlan): boolean {
  return plan.status === 3 || plan.status === 4 || plan.progress >= 100;
}

function deadlineTs(plan: EnrichedPlan): number {
  if (!plan.nearestDeadline) return Number.POSITIVE_INFINITY;
  const t = new Date(plan.nearestDeadline).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

/** Normalize priority → severity score (3 high … 1 low). Frontend stores high=3; backend comment sometimes says high=1. */
function toSeverityScore(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'high' || s === 'haute' || s === '3') return 3;
    if (s === 'medium' || s === 'moyenne' || s === '2') return 2;
    if (s === 'low' || s === 'faible' || s === '1') return 1;
    const n = Number(raw);
    if (Number.isFinite(n)) return toSeverityScore(n);
    return 0;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === 1 || raw === 2 || raw === 3) return raw; // frontend convention
    return 0;
  }
  return 0;
}

function typeSeverity(type?: number): number {
  // correctif=2 → haute, preventif=1 → moyenne, amelioration=3 → faible
  if (type === 2) return 3;
  if (type === 1) return 2;
  if (type === 3) return 1;
  return 0;
}

function comparePlans(
  a: EnrichedPlan,
  b: EnrichedPlan,
  field: SortField,
  dir: SortDir
): number {
  let cmp = 0;
  if (field === 'date') {
    const da = a.nearestDeadline ? deadlineTs(a) : null;
    const db = b.nearestDeadline ? deadlineTs(b) : null;
    if (da == null && db == null) cmp = 0;
    else if (da == null) cmp = 1;
    else if (db == null) cmp = -1;
    else cmp = da - db;
  } else if (field === 'severity') {
    cmp = a.severity - b.severity;
  } else if (field === 'progress') {
    cmp = (a.progress || 0) - (b.progress || 0);
  } else {
    cmp = (a.assigneeLabel || '').localeCompare(b.assigneeLabel || '', 'fr', {
      sensitivity: 'base',
    });
  }
  if (cmp === 0) {
    cmp = (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
  }
  return dir === 'asc' ? cmp : -cmp;
}

function resolveUserId(user: Record<string, unknown> | null | undefined): string {
  if (!user) return '';
  for (const key of ['sub', 'id', 'userId', 'Id']) {
    const v = user[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

export default function MyActionPlans() {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dateLocale = i18n.language?.startsWith('en')
    ? 'en-GB'
    : i18n.language?.startsWith('it')
      ? 'it-IT'
      : 'fr-FR';

  const typeLabel = (id: PlanType) =>
    id === 'preventif'
      ? t('myActionPlans.typePreventive')
      : id === 'correctif'
        ? t('myActionPlans.typeCorrective')
        : t('myActionPlans.typeImprovement');

  const [plans, setPlans] = useState<EnrichedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [severityFilter, setSeverityFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [isSeverityOpen, setIsSeverityOpen] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrgItem[]>([]);
  const [filteredDepts, setFilteredDepts] = useState<DeptItem[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'preventif' as PlanType,
    organizationId: '',
    departmentId: '',
    deadline: '',
    claimId: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [draftActions, setDraftActions] = useState<DraftAction[]>([]);
  const [newAction, setNewAction] = useState({
    title: '',
    description: '',
    priority: 'medium' as Priority,
    deadline: '',
  });
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const currentUserId = resolveUserId(user as Record<string, unknown> | null);
  const displayName =
    (user as any)?.fullName ||
    (user as any)?.name ||
    (user as any)?.email ||
    t('myActionPlans.you');

  useEffect(() => {
    if (!accessToken) return;
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [accessToken]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUserActionPlans(accessToken!);
      const assigned = unwrapList<AssignedPlan>(res.data);

      const enriched = await Promise.all(
        assigned.map(async (raw) => {
          const plan: AssignedPlan = {
            ...raw,
            id: String((raw as any).id ?? (raw as any).Id ?? ''),
            title: (raw as any).title ?? (raw as any).Title ?? '',
            description: (raw as any).description ?? (raw as any).Description,
            status: Number((raw as any).status ?? (raw as any).Status ?? 0),
            type: (raw as any).type ?? (raw as any).Type,
            progress: toProgress((raw as any).progress ?? (raw as any).Progress),
            createdAt: (raw as any).createdAt ?? (raw as any).CreatedAt,
            deadline: (raw as any).deadline ?? (raw as any).Deadline,
            assignedToId: String(
              (raw as any).assignedToId ?? (raw as any).AssignedToId ?? ''
            ).trim() || undefined,
            assignedToName:
              (raw as any).assignedToName ?? (raw as any).AssignedToName,
            claimId: (() => {
              const c = (raw as any).claimId ?? (raw as any).ClaimId;
              return c ? String(c) : undefined;
            })(),
          };

          let actions: PlanActionItem[] = [];
          try {
            const actionsRes = await getPlanActions(accessToken!, plan.id);
            actions = unwrapList<any>(actionsRes.data).map((a: any) => ({
              id: String(a.id ?? a.Id),
              deadline: a.deadline ?? a.Deadline,
              progress: a.progress ?? a.Progress,
              actionPlanId: String(a.actionPlanId ?? a.ActionPlanId ?? plan.id),
              priority: a.priority ?? a.Priority,
              assignedToId: a.assignedToId ?? a.AssignedToId,
            }));
          } catch {
            actions = [];
          }

          const progress =
            plan.status === 3 || plan.status === 4
              ? 100
              : actions.length > 0
                ? Math.round(
                    actions.reduce((sum, a) => {
                      const p = toProgress(a.progress);
                      return sum + (p > 100 ? 100 : p);
                    }, 0) / actions.length
                  )
                : toProgress(plan.progress);

          const openActions = actions.filter((a) => isActionOpen(a.progress));
          const openDeadlines = openActions
            .filter((a) => a.deadline)
            .map((a) => a.deadline as string);

          const planOpen = plan.status !== 3 && plan.status !== 4;
          const candidates = [
            ...openDeadlines,
            ...(planOpen && plan.deadline ? [plan.deadline] : []),
          ];
          const nearestDeadline = earliestDate(candidates);

          let overdueDays = 0;
          if (planOpen && nearestDeadline) {
            const d = daysUntil(nearestDeadline);
            if (d < 0) overdueDays = Math.abs(d);
          }

          const maxActionSev = actions.reduce(
            (max, a) => Math.max(max, toSeverityScore(a.priority)),
            0
          );
          const severity = maxActionSev || typeSeverity(Number(plan.type));

          const assigneeId = plan.assignedToId || '';
          const isSelf =
            assigneeId &&
            currentUserId &&
            assigneeId.toLowerCase() === currentUserId.toLowerCase();
          const assigneeLabel = isSelf
            ? displayName
            : plan.assignedToName ||
              (assigneeId ? assigneeId.slice(0, 8) : t('myActionPlans.unassigned'));

          return {
            ...plan,
            title: fixMojibake(plan.title || '') || plan.title,
            description: plan.description
              ? fixMojibake(plan.description) || plan.description
              : plan.description,
            progress: Number.isFinite(progress) ? progress : 0,
            totalActions: actions.length,
            openActions: openActions.length,
            nearestDeadline,
            isOverdue: overdueDays > 0,
            overdueDays,
            severity,
            assigneeLabel,
            claimId: plan.claimId,
          } as EnrichedPlan;
        })
      );

      setPlans(enriched);
    } catch (e) {
      console.error(e);
      setError(t('myActionPlans.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const loadOrgs = async () => {
    if (!accessToken) return;
    try {
      const r = await axios.get(`${ACTION_PLAN_API_URL}/organization`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const list = unwrapList<any>(r.data).map((o: any) => ({
        id: String(o.id ?? o.Id),
        name: String(o.name ?? o.Name ?? ''),
      }));
      setOrganizations(list.filter((o) => o.id));
    } catch {
      setOrganizations([]);
    }
  };

  const loadDeptsForOrg = async (orgId: string) => {
    if (!accessToken || !orgId) {
      setFilteredDepts([]);
      return;
    }
    try {
      const r = await axios.get(
        `${ACTION_PLAN_API_URL}/department/by-organization/${orgId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const list = unwrapList<any>(r.data).map((d: any) => ({
        id: String(d.id ?? d.Id),
        name: String(d.name ?? d.Name ?? ''),
        organizationId: String(d.organizationId ?? d.OrganizationId ?? orgId),
      }));
      setFilteredDepts(list.filter((d) => d.id));
    } catch {
      setFilteredDepts([]);
    }
  };

  const resetCreateForm = () => {
    const orgId = String((user as any)?.organizationId || '').trim();
    const deptId = String(
      (user as any)?.departmentId || (user as any)?.DepartmentId || ''
    ).trim();
    setFormData({
      title: '',
      description: '',
      type: 'preventif',
      organizationId: orgId,
      departmentId: deptId,
      deadline: '',
      claimId: '',
    });
    setFormErrors({});
    setDraftActions([]);
    setNewAction({ title: '', description: '', priority: 'medium', deadline: '' });
    setActionErrors({});
    setCreateError(null);
    if (orgId) void loadDeptsForOrg(orgId);
    else setFilteredDepts([]);
  };

  const openCreateModal = async () => {
    resetCreateForm();
    setShowCreate(true);
    await loadOrgs();
    const orgId = String((user as any)?.organizationId || '').trim();
    if (orgId) await loadDeptsForOrg(orgId);
  };

  const handleOrgChange = (orgId: string) => {
    setFormData((p) => ({ ...p, organizationId: orgId, departmentId: '' }));
    void loadDeptsForOrg(orgId);
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!formData.title.trim()) e.title = t('myActionPlans.titleRequired');
    if (!formData.organizationId) e.organizationId = t('myActionPlans.orgRequired');
    if (!formData.departmentId) e.departmentId = t('myActionPlans.deptRequired');
    if (!currentUserId) e.assigned = t('myActionPlans.userUnknown');
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateAction = () => {
    const e: Record<string, string> = {};
    if (!newAction.title.trim()) e.title = t('myActionPlans.titleRequired');
    if (!newAction.deadline) e.deadline = t('myActionPlans.dateTo');
    setActionErrors(e);
    return Object.keys(e).length === 0;
  };

  const addDraftAction = () => {
    if (!validateAction()) return;
    setDraftActions((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        title: newAction.title.trim(),
        description: newAction.description.trim(),
        priority: newAction.priority,
        deadline: newAction.deadline,
      },
    ]);
    setNewAction({ title: '', description: '', priority: 'medium', deadline: '' });
    setActionErrors({});
  };

  const handleCreate = async () => {
    if (!validateForm() || !accessToken || !currentUserId) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await createActionPlan(accessToken, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        type: TYPE_TO_NUM[formData.type],
        departmentId: formData.departmentId,
        organizationId: formData.organizationId,
        assignedToId: currentUserId,
        deadline: formData.deadline || undefined,
        claimId: formData.claimId.trim() || undefined,
      });
      const id = String(res.data?.id ?? res.data?.Id ?? '');

      if (draftActions.length && id) {
        await Promise.all(
          draftActions.map((pa) =>
            createPlanAction(accessToken, {
              title: pa.title,
              description: pa.description || undefined,
              deadline: new Date(pa.deadline).toISOString(),
              priority: PRIORITY_TO_NUM[pa.priority],
              assignedToId: currentUserId,
              actionPlanId: id,
            })
          )
        );
      }

      setShowCreate(false);
      resetCreateForm();
      await load();
    } catch (e: any) {
      console.error(e);
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.title ||
        e?.message ||
        t('myActionPlans.createFailed');
      setCreateError(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const counts = useMemo(() => {
    const active = plans.filter((p) => !isPlanDone(p)).length;
    const done = plans.filter((p) => isPlanDone(p)).length;
    const late = plans.filter((p) => p.isOverdue && !isPlanDone(p)).length;
    return { all: plans.length, active, done, late };
  }, [plans]);

  const filtered = useMemo(() => {
    let list = plans;
    if (tab === 'active') list = list.filter((p) => !isPlanDone(p));
    if (tab === 'done') list = list.filter((p) => isPlanDone(p));
    if (tab === 'late') list = list.filter((p) => p.isOverdue && !isPlanDone(p));
    if (severityFilter !== 'all') {
      list = list.filter((p) => p.severity === severityFilter);
    }
    if (filterDateFrom || filterDateTo) {
      list = list.filter((p) => {
        if (!p.nearestDeadline) return false;
        const d = new Date(p.nearestDeadline);
        if (Number.isNaN(d.getTime())) return false;
        if (filterDateFrom && d < new Date(`${filterDateFrom}T00:00:00`)) return false;
        if (filterDateTo && d > new Date(`${filterDateTo}T23:59:59`)) return false;
        return true;
      });
    }
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(term) ||
          planKey(p.id, p.reference).toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => comparePlans(a, b, sortField, sortDir));
  }, [plans, tab, search, sortField, sortDir, severityFilter, filterDateFrom, filterDateTo]);

  const hasDateFilter = !!(filterDateFrom || filterDateTo);
  const severityLabel =
    severityFilter === 'all'
      ? t('myActionPlans.allSeverities')
      : SEVERITY_LABEL_KEYS[severityFilter]
        ? t(SEVERITY_LABEL_KEYS[severityFilter])
        : t('myActionPlans.colSeverity');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'severity' ? 'desc' : 'asc');
    }
  };

  const SortTh = ({ field, label, hide }: { field: SortField; label: string; hide?: boolean }) => (
    <th className={hide ? 'map-hide' : undefined}>
      <button
        type="button"
        className={`map-th-sort${sortField === field ? ' on' : ''}`}
        onClick={() => toggleSort(field)}
        aria-label={`Trier par ${label}`}
      >
        {label}
        <span className="map-th-arrows" aria-hidden>
          <i className={sortField === field && sortDir === 'asc' ? 'on' : ''} />
          <i className={sortField === field && sortDir === 'desc' ? 'on' : ''} />
        </span>
      </button>
    </th>
  );

  const openPlan = (plan: EnrichedPlan) => {
    const isFrontOffice = location.pathname.startsWith('/pages/front');
    navigate(
      isFrontOffice
        ? `/pages/front/my-action-plans/${plan.id}`
        : `/action-plans/${plan.id}`
    );
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="map-page">
      <div className="map-inner">
        <div className="map-header">
          <div>
            <h1>{t('myActionPlans.title')}</h1>
            <p>{t('myActionPlans.subtitle')}</p>
          </div>
          <div className="map-header-actions">
            <label className="map-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('myActionPlans.searchPlaceholder')}
                aria-label={t('myActionPlans.search')}
              />
            </label>
            <button
              type="button"
              className="map-create-btn"
              onClick={() => void openCreateModal()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              {t('myActionPlans.create')}
            </button>
            <button
              type="button"
              className={`map-icon-btn${loading ? ' is-loading' : ''}`}
              title={t('myActionPlans.refresh')}
              onClick={() => void load()}
              aria-label={t('myActionPlans.refresh')}
              disabled={loading}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 12a8 8 0 0 1 14.3-4.9M20 12a8 8 0 0 1-14.3 4.9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path d="M18 3v5h-5M6 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="map-toolbar">
          <div className="map-phase" role="tablist" aria-label={t('myActionPlans.filterAria')}>
            {(
              [
                ['all', t('myActionPlans.tabAll'), counts.all],
                ['active', t('myActionPlans.tabActive'), counts.active],
                ['late', t('myActionPlans.tabLate'), counts.late],
                ['done', t('myActionPlans.tabDone'), counts.done],
              ] as Array<[FilterTab, string, number]>
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'on' : ''}
                onClick={() => setTab(id)}
              >
                {label}
                <span className="n">{n}</span>
              </button>
            ))}
          </div>
          <div className="map-filters">
            <div className="map-filter-dd">
              <button
                type="button"
                className="map-filter-btn"
                onClick={() => setIsSeverityOpen((o) => !o)}
                aria-expanded={isSeverityOpen}
              >
                {severityLabel}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d={isSeverityOpen ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isSeverityOpen && (
                <>
                  <button
                    type="button"
                    className="map-filter-scrim"
                    aria-label={t('myActionPlans.close')}
                    onClick={() => setIsSeverityOpen(false)}
                  />
                  <div className="map-filter-menu" role="listbox">
                    {(
                      [
                        ['all', t('myActionPlans.allSeverities')],
                        [3, t('myActionPlans.severityHigh')],
                        [2, t('myActionPlans.severityMedium')],
                        [1, t('myActionPlans.severityLow')],
                      ] as Array<['all' | 1 | 2 | 3, string]>
                    ).map(([id, label]) => (
                      <button
                        key={String(id)}
                        type="button"
                        role="option"
                        aria-selected={severityFilter === id}
                        className={severityFilter === id ? 'on' : ''}
                        onClick={() => {
                          setSeverityFilter(id);
                          setIsSeverityOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="map-filter-dates">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                max={filterDateTo || undefined}
                aria-label={t('myActionPlans.dateFrom')}
              />
              <span>→</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                min={filterDateFrom || undefined}
                aria-label={t('myActionPlans.dateTo')}
              />
              {hasDateFilter && (
                <button
                  type="button"
                  className="map-filter-clear"
                  title={t('myActionPlans.resetDates')}
                  aria-label={t('myActionPlans.resetDates')}
                  onClick={() => {
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                >
                  ×
                </button>
              )}
            </div>

            <div className="map-hint">
              {loading ? (
                <span className="map-skel" aria-hidden />
              ) : (
                t('myActionPlans.plansCount', { count: filtered.length })
              )}
            </div>
          </div>
        </div>

        {error && <div className="map-error">{error}</div>}

        {loading ? (
          <>
            <div className="map-skel-banner" role="status">
              <span className="map-pulse" aria-hidden />
              {t('myActionPlans.loading')}
            </div>
            <div className="map-table-wrap" aria-busy="true">
              <table className="map-table">
                <thead>
                  <tr>
                    <th>{t('myActionPlans.colKey')}</th>
                    <th>{t('myActionPlans.colSummary')}</th>
                    <SortTh field="progress" label={t('myActionPlans.colProgress')} />
                    <th>{t('myActionPlans.colStatus')}</th>
                    <SortTh field="date" label={t('myActionPlans.colDate')} />
                    <SortTh field="severity" label={t('myActionPlans.colSeverity')} />
                    <SortTh field="assignee" label={t('myActionPlans.colAssignee')} hide />
                    <th className="map-hide">{t('myActionPlans.colOpenActions')}</th>
                    <th aria-hidden style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }, (_, i) => (
                    <tr key={`skel-${i}`} className="map-skel-row">
                      <td><span className="map-skel key" /></td>
                      <td>
                        <span className="map-skel title" style={{ width: `${58 + (i % 4) * 8}%` }} />
                        <span className="map-skel sub" style={{ width: `${36 + (i % 3) * 10}%` }} />
                      </td>
                      <td>
                        <div className="map-progress">
                          <span className="map-skel bar" />
                          <span className="map-skel pct" />
                        </div>
                      </td>
                      <td><span className="map-skel st" /></td>
                      <td><span className="map-skel due" /></td>
                      <td><span className="map-skel st" /></td>
                      <td className="map-hide"><span className="map-skel due" /></td>
                      <td className="map-hide"><span className="map-skel act" /></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="map-empty">
            {t('myActionPlans.emptyFilter')}
            <button type="button" className="map-empty-create" onClick={() => void openCreateModal()}>
              {t('myActionPlans.createFirst')}
            </button>
          </div>
        ) : (
          <div className="map-table-wrap">
            <table className="map-table">
              <thead>
                <tr>
                  <th>{t('myActionPlans.colKey')}</th>
                  <th>{t('myActionPlans.colSummary')}</th>
                  <SortTh field="progress" label={t('myActionPlans.colProgress')} />
                  <th>{t('myActionPlans.colStatus')}</th>
                  <SortTh field="date" label={t('myActionPlans.colDate')} />
                  <SortTh field="severity" label={t('myActionPlans.colSeverity')} />
                  <SortTh field="assignee" label={t('myActionPlans.colAssignee')} hide />
                  <th className="map-hide">{t('myActionPlans.colOpenActions')}</th>
                  <th aria-hidden style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan) => {
                  const st = statusMeta(plan, t);
                  const days = plan.nearestDeadline ? daysUntil(plan.nearestDeadline) : null;
                  const dueCls =
                    days == null || isPlanDone(plan)
                      ? ''
                      : days < 0
                        ? 'late'
                        : days <= 3
                          ? 'warn'
                          : '';
                  const pct = Math.max(0, Math.min(100, Math.round(Number(plan.progress) || 0)));
                  const sevCls =
                    plan.severity === 3 ? 'hi' : plan.severity === 2 ? 'mid' : plan.severity === 1 ? 'lo' : '';
                  const progressLate = plan.isOverdue && !isPlanDone(plan);
                  return (
                    <tr
                      key={plan.id}
                      className={progressLate ? 'late' : ''}
                      onClick={() => openPlan(plan)}
                    >
                      <td>
                        <span className="map-key">{planKey(plan.id, plan.reference)}</span>
                      </td>
                      <td>
                        <p className="map-title">{plan.title}</p>
                        {plan.description ? <p className="map-sub">{plan.description}</p> : null}
                        {plan.claimId ? (
                          <Link
                            className="map-dossier-link"
                            to={`/pages/front/quality-analyses/8d/${encodeURIComponent(plan.claimId)}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t('myActionPlans.viewDossier')}
                          </Link>
                        ) : null}
                      </td>
                      <td>
                        <div
                          className={`map-progress${progressLate ? ' is-late' : ''}`}
                          title={`${pct} %`}
                          aria-label={`${t('myActionPlans.colProgress')} ${pct} %`}
                        >
                          <div className="map-progress-bar">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                          <span className="map-progress-pct">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`map-st ${st.cls}`}>{st.label}</span>
                      </td>
                      <td>
                        <span className={`map-due ${dueCls}`}>
                          {plan.nearestDeadline ? formatDate(plan.nearestDeadline, dateLocale) : '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`map-sev ${sevCls}`}>
                          {SEVERITY_LABEL_KEYS[plan.severity]
                            ? t(SEVERITY_LABEL_KEYS[plan.severity])
                            : '—'}
                        </span>
                      </td>
                      <td className="map-hide">
                        <span className="map-assignee">{plan.assigneeLabel}</span>
                      </td>
                      <td className="map-hide">
                        <span className="map-actions">
                          {plan.openActions}/{plan.totalActions}
                        </span>
                      </td>
                      <td>
                        <svg className="map-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div
          className="map-modal-backdrop"
          role="presentation"
          onClick={() => !submitting && setShowCreate(false)}
        >
          <div
            className="map-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="map-modal-head">
              <div>
                <h2 id="map-create-title">{t('myActionPlans.createTitle')}</h2>
                <p>{t('myActionPlans.createSub')}</p>
              </div>
              <button
                type="button"
                className="map-modal-close"
                onClick={() => !submitting && setShowCreate(false)}
                aria-label={t('myActionPlans.close')}
              >
                ×
              </button>
            </div>

            <div className="map-modal-body">
              {createError && <div className="map-error">{createError}</div>}
              {formErrors.assigned && <div className="map-error">{formErrors.assigned}</div>}

              <label className="map-field">
                <span>{t('myActionPlans.fieldTitle')} <em>*</em></span>
                <input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={t('myActionPlans.titlePh')}
                  className={formErrors.title ? 'is-invalid' : ''}
                />
                {formErrors.title && <small>{formErrors.title}</small>}
              </label>

              <label className="map-field">
                <span>{t('myActionPlans.fieldDesc')}</span>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('myActionPlans.descPh')}
                />
              </label>

              <div className="map-field">
                <span>{t('myActionPlans.fieldType')} <em>*</em></span>
                <div className="map-type-row">
                  {TYPE_OPTION_IDS.map((typeId) => (
                    <button
                      key={typeId}
                      type="button"
                      className={`map-type-btn${formData.type === typeId ? ' on' : ''}`}
                      onClick={() => setFormData({ ...formData, type: typeId })}
                    >
                      {typeLabel(typeId)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="map-field-grid">
                <label className="map-field">
                  <span>{t('myActionPlans.fieldOrg')} <em>*</em></span>
                  <select
                    value={formData.organizationId}
                    onChange={(e) => handleOrgChange(e.target.value)}
                    className={formErrors.organizationId ? 'is-invalid' : ''}
                  >
                    <option value="">{t('myActionPlans.select')}</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  {formErrors.organizationId && <small>{formErrors.organizationId}</small>}
                </label>
                <label className="map-field">
                  <span>{t('myActionPlans.fieldDept')} <em>*</em></span>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    disabled={!formData.organizationId}
                    className={formErrors.departmentId ? 'is-invalid' : ''}
                  >
                    <option value="">
                      {!formData.organizationId
                        ? t('myActionPlans.chooseOrg')
                        : filteredDepts.length === 0
                          ? t('myActionPlans.noDept')
                          : t('myActionPlans.select')}
                    </option>
                    {filteredDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {formErrors.departmentId && <small>{formErrors.departmentId}</small>}
                </label>
              </div>

              <div className="map-field-grid">
                <div className="map-field">
                  <span>{t('myActionPlans.fieldAssignee')}</span>
                  <div className="map-self-assign">
                    <span className="map-self-dot" aria-hidden />
                    {displayName}
                    <em>{t('myActionPlans.you')}</em>
                  </div>
                </div>
                <label className="map-field">
                  <span>{t('myActionPlans.deadline')}</span>
                  <input
                    type="date"
                    min={today}
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  />
                </label>
              </div>

              <label className="map-field">
                <span>{t('myActionPlans.linkedClaim')}</span>
                <input
                  value={formData.claimId}
                  onChange={(e) => setFormData({ ...formData, claimId: e.target.value })}
                  placeholder={t('myActionPlans.claimIdPh')}
                />
              </label>

              <div className="map-actions-block">
                <div className="map-actions-head">
                  <span>{t('myActionPlans.subActions')}</span>
                  <em>{draftActions.length}</em>
                </div>

                {draftActions.length > 0 && (
                  <ul className="map-draft-list">
                    {draftActions.map((pa, idx) => (
                      <li key={pa.id}>
                        <div>
                          <strong>{pa.title}</strong>
                          <span>
                            {t(PRIORITY_LABEL_KEYS[pa.priority])}
                            {pa.deadline ? ` · ${formatDate(pa.deadline, dateLocale)}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={t('myActionPlans.remove')}
                          onClick={() =>
                            setDraftActions((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="map-draft-add">
                  <p>{t('myActionPlans.addSubAction')}</p>
                  <input
                    value={newAction.title}
                    onChange={(e) => setNewAction({ ...newAction, title: e.target.value })}
                    placeholder={`${t('myActionPlans.fieldTitle')} *`}
                    className={actionErrors.title ? 'is-invalid' : ''}
                  />
                  <textarea
                    rows={2}
                    value={newAction.description}
                    onChange={(e) => setNewAction({ ...newAction, description: e.target.value })}
                    placeholder={t('myActionPlans.descriptionPh')}
                  />
                  <div className="map-field-grid map-field-grid-2">
                    <select
                      value={newAction.priority}
                      onChange={(e) =>
                        setNewAction({ ...newAction, priority: e.target.value as Priority })
                      }
                    >
                      <option value="low">{t('myActionPlans.priorityLow')}</option>
                      <option value="medium">{t('myActionPlans.priorityMedium')}</option>
                      <option value="high">{t('myActionPlans.priorityHigh')}</option>
                    </select>
                    <input
                      type="date"
                      min={today}
                      value={newAction.deadline}
                      onChange={(e) => setNewAction({ ...newAction, deadline: e.target.value })}
                      className={actionErrors.deadline ? 'is-invalid' : ''}
                    />
                  </div>
                  {(actionErrors.title || actionErrors.deadline) && (
                    <small className="map-inline-err">
                      {actionErrors.title || actionErrors.deadline}
                    </small>
                  )}
                  <button type="button" className="map-add-action" onClick={addDraftAction}>
                    + {t('ishikawa.add')}
                  </button>
                </div>
              </div>
            </div>

            <div className="map-modal-foot">
              <button
                type="button"
                className="map-btn-ghost"
                disabled={submitting}
                onClick={() => setShowCreate(false)}
              >
                {t('myActionPlans.cancel')}
              </button>
              <button
                type="button"
                className="map-btn-primary"
                disabled={submitting}
                onClick={() => void handleCreate()}
              >
                {submitting ? t('employeeProfile.saving') : t('myActionPlans.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
