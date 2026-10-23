import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  getPlanActions,
  getUserActionPlans,
} from '../../services/actionPlanService';
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
  // finished work is never "overdue": a plan at 100 % only waits for its validation
  if (plan.status === 3 || plan.status === 4 || plan.progress >= 100) {
    return { label: t('myActionPlans.statusDone'), cls: 'done' };
  }
  if (plan.isOverdue) {
    return { label: t('myActionPlans.statusLate'), cls: 'late' };
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

          const planOpen = plan.status !== 3 && plan.status !== 4 && progress < 100;
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
                        <div className="map-metaline">
                          {SEVERITY_LABEL_KEYS[plan.severity] ? (
                            <span className={`map-sev ${sevCls}`}>{t(SEVERITY_LABEL_KEYS[plan.severity])}</span>
                          ) : null}
                          {plan.totalActions > 0 ? (
                            <span className="map-actions" title={t('myActionPlans.colOpenActions')}>
                              {t('myActionPlans.actionsShort', { open: plan.openActions, total: plan.totalActions })}
                            </span>
                          ) : null}
                          {plan.assigneeLabel && plan.assigneeLabel !== displayName && !/^[0-9a-f]{8}$/i.test(plan.assigneeLabel) ? (
                            <span className="map-assignee">{plan.assigneeLabel}</span>
                          ) : null}
                          {plan.claimId ? (
                            <Link
                              className="map-dossier-link"
                              to={`/pages/front/quality-analyses/8d/${encodeURIComponent(plan.claimId)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t('myActionPlans.viewDossier')}
                            </Link>
                          ) : null}
                        </div>
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

    </div>
  );
}
