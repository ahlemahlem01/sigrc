import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getActionPlans,
  getOverduePlanActions,
  getPlanActions,
  getUserActionPlans,
} from '../../services/actionPlanService';
import { getUsers, type UserDto } from '../../services/adminService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import type { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { isAdminUser } from '../../utils/roles';
import './DeadlinesAgendaPage.styles.css';

type DeadlineKind = 'claim' | 'plan' | 'action';
type TabKey = 'upcoming' | 'past';
type KindFilter = 'all' | DeadlineKind;
type Urgency = 'late' | 'today' | 'soon' | 'ok' | 'past';

interface DeadlineItem {
  id: string;
  kind: DeadlineKind;
  title: string;
  subtitle?: string;
  assigneeId?: string;
  assigneeName?: string;
  deadline: string;
  statusLabel: string;
  href: string;
  closed: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  items: DeadlineItem[];
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.result)) return o.result as T[];
  }
  return [];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDeadline(raw?: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysUntil(dateStr: string): number {
  const parsed = parseDeadline(dateStr);
  if (!parsed) return 0;
  const due = startOfDay(parsed);
  const now = startOfDay(new Date());
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function dayKey(dateStr: string): string {
  const d = parseDeadline(dateStr);
  if (!d) return 'invalid';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isPlanClosed(status: number, progress: number): boolean {
  return status === 3 || status === 4 || progress >= 100;
}

function isActionDone(progress: number): boolean {
  return progress >= 100 || progress === 3;
}

function isClaimClosed(claim: Claim): boolean {
  const s = resolveClaimStatus(claim);
  return s === 'CLOTUREE' || s === 'ARCHIVED';
}

function urgencyOf(dateStr: string, closed: boolean): Urgency {
  const d = daysUntil(dateStr);
  if (d < 0) return closed ? 'past' : 'late';
  if (d === 0) return 'today';
  if (d <= 7) return 'soon';
  return 'ok';
}

function userName(map: Map<string, string>, id?: string | null) {
  if (!id) return '';
  return map.get(String(id)) || '';
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const cur = items[idx++];
      results.push(await worker(cur));
    }
  });
  await Promise.all(runners);
  return results;
}

export default function DeadlinesAgendaPage() {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminUser(user);
  const locale = (i18n.language || 'fr').startsWith('en')
    ? 'en-GB'
    : (i18n.language || 'fr').startsWith('it')
      ? 'it-IT'
      : 'fr-FR';

  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const names = new Map<string, string>();
      if (isAdmin) {
        const users = await getUsers(accessToken).catch(() => [] as UserDto[]);
        for (const u of users) {
          names.set(String(u.id), u.fullName || u.email || u.id);
        }
      }

      const [plansRes, claimsRows, overdueRes] = await Promise.all([
        (isAdmin ? getActionPlans(accessToken) : getUserActionPlans(accessToken)).catch(() => ({
          data: [],
        })),
        (isAdmin
          ? qualityAnalysisService.getClaims(undefined, accessToken)
          : qualityAnalysisService.getMyAssignedClaims(accessToken)
        ).catch(() => [] as Claim[]),
        isAdmin
          ? getOverduePlanActions(accessToken).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);

      const planList = unwrapList<Record<string, unknown>>(plansRes.data)
        .map((p) => ({
          id: String(p.id ?? p.Id ?? ''),
          title: String(p.title ?? p.Title ?? t('deadlines.untitledPlan')),
          status: Number(p.status ?? p.Status ?? 0),
          progress: Number(p.progress ?? p.Progress ?? 0),
          deadline: (p.deadline ?? p.Deadline) as string | undefined,
          assignedToId: String(p.assignedToId ?? p.AssignedToId ?? '').trim() || undefined,
          ownerId: String(p.ownerId ?? p.OwnerId ?? '').trim() || undefined,
        }))
        .filter((p) => p.id);

      const planTitleById = new Map(planList.map((p) => [p.id, p.title]));
      const claimList = Array.isArray(claimsRows) ? claimsRows : [];
      const collected: DeadlineItem[] = [];

      const claimHref = (id: string) =>
        isAdmin
          ? `/pages/front/quality-analyses/8d/${encodeURIComponent(id)}`
          : `/pages/front/my-claims?claimId=${encodeURIComponent(id)}`;

      const planHref = (id: string) =>
        isAdmin ? `/pages/front/action-plans/${id}` : `/pages/front/my-action-plans/${id}`;

      for (const c of claimList) {
        const dl = c.deadline ?? (c as Claim & { Deadline?: string }).Deadline;
        if (!dl || !parseDeadline(dl)) continue;
        const id = String(c.id);
        const closed = isClaimClosed(c);
        const assigneeId = String(c.assignedToId || (c as any).AssignedToId || '').trim() || undefined;
        collected.push({
          id: `claim-${id}`,
          kind: 'claim',
          title: c.title || t('employeeWorkspace.claimFallback', { id: id.slice(0, 8) }),
          subtitle: c.defectType || undefined,
          assigneeId,
          assigneeName:
            c.assignedToName ||
            (c as any).AssignedToName ||
            userName(names, assigneeId) ||
            undefined,
          deadline: String(dl),
          statusLabel: closed
            ? t('employeeWorkspace.deadlinesStatusClosed')
            : resolveClaimStatus(c) || t('employeeWorkspace.deadlinesStatusOpen'),
          href: claimHref(id),
          closed,
        });
      }

      for (const p of planList) {
        if (!p.deadline || !parseDeadline(p.deadline)) continue;
        const closed = isPlanClosed(p.status, p.progress);
        const assigneeId = p.assignedToId || p.ownerId;
        collected.push({
          id: `plan-${p.id}`,
          kind: 'plan',
          title: p.title,
          subtitle: undefined,
          assigneeId,
          assigneeName: userName(names, assigneeId) || undefined,
          deadline: String(p.deadline),
          statusLabel: closed
            ? t('employeeWorkspace.deadlinesStatusClosed')
            : t('employeeWorkspace.deadlinesStatusOpen'),
          href: planHref(p.id),
          closed: closed || p.status === 3 || p.status === 4,
        });
      }

      // Actions: employee = per-plan (capped); admin = overdue endpoint + sample of open plans
      if (isAdmin) {
        const overdueActions = unwrapList<Record<string, unknown>>(
          (overdueRes as any)?.data ?? overdueRes
        );
        for (const a of overdueActions) {
          const id = String(a.id ?? a.Id ?? '');
          const deadline = (a.deadline ?? a.Deadline) as string | undefined;
          if (!id || !deadline || !parseDeadline(deadline)) continue;
          const progress = Number(a.progress ?? a.Progress ?? 0);
          const closed = isActionDone(progress);
          const planId = String(a.actionPlanId ?? a.ActionPlanId ?? '');
          const assigneeId =
            String(a.assignedToId ?? a.AssignedToId ?? '').trim() || undefined;
          collected.push({
            id: `action-${id}`,
            kind: 'action',
            title: String(a.title ?? a.Title ?? t('employeeWorkspace.deadlinesKindAction')),
            subtitle: planTitleById.get(planId),
            assigneeId,
            assigneeName: userName(names, assigneeId) || undefined,
            deadline: String(deadline),
            statusLabel: closed
              ? t('employeeWorkspace.deadlinesStatusClosed')
              : t('employeeWorkspace.deadlinesStatusOpen'),
            href: planHref(planId || id),
            closed,
          });
        }

        const openPlans = planList
          .filter((p) => !isPlanClosed(p.status, p.progress))
          .slice(0, 80);

        const actionBatches = await mapPool(openPlans, 6, async (plan) => {
          try {
            const res = await getPlanActions(accessToken, plan.id);
            return unwrapList<Record<string, unknown>>(res.data).map((a) => ({
              id: String(a.id ?? a.Id ?? ''),
              title: String(a.title ?? a.Title ?? ''),
              deadline: (a.deadline ?? a.Deadline) as string | undefined,
              progress: Number(a.progress ?? a.Progress ?? 0),
              planId: plan.id,
              planTitle: plan.title,
              assignedToId:
                String(a.assignedToId ?? a.AssignedToId ?? '').trim() || undefined,
            }));
          } catch {
            return [];
          }
        });

        for (const a of actionBatches.flat()) {
          if (!a.id || !a.deadline || !parseDeadline(a.deadline)) continue;
          // Skip past open already covered by overdue endpoint when possible
          const closed = isActionDone(a.progress);
          collected.push({
            id: `action-${a.id}`,
            kind: 'action',
            title: a.title || t('employeeWorkspace.deadlinesKindAction'),
            subtitle: a.planTitle,
            assigneeId: a.assignedToId,
            assigneeName: userName(names, a.assignedToId) || undefined,
            deadline: String(a.deadline),
            statusLabel: closed
              ? t('employeeWorkspace.deadlinesStatusClosed')
              : t('employeeWorkspace.deadlinesStatusOpen'),
            href: planHref(a.planId),
            closed,
          });
        }
      } else {
        const actionLists = await Promise.all(
          planList.slice(0, 50).map(async (plan) => {
            try {
              const res = await getPlanActions(accessToken, plan.id);
              return unwrapList<Record<string, unknown>>(res.data).map((a) => ({
                id: String(a.id ?? a.Id ?? ''),
                title: String(a.title ?? a.Title ?? ''),
                deadline: (a.deadline ?? a.Deadline) as string | undefined,
                progress: Number(a.progress ?? a.Progress ?? 0),
                planId: plan.id,
                planTitle: plan.title,
              }));
            } catch {
              return [];
            }
          })
        );

        for (const a of actionLists.flat()) {
          if (!a.id || !a.deadline || !parseDeadline(a.deadline)) continue;
          const closed = isActionDone(a.progress);
          collected.push({
            id: `action-${a.id}`,
            kind: 'action',
            title: a.title || t('employeeWorkspace.deadlinesKindAction'),
            subtitle: a.planTitle,
            deadline: String(a.deadline),
            statusLabel: closed
              ? t('employeeWorkspace.deadlinesStatusClosed')
              : t('employeeWorkspace.deadlinesStatusOpen'),
            href: planHref(a.planId),
            closed,
          });
        }
      }

      const byId = new Map<string, DeadlineItem>();
      for (const row of collected) byId.set(row.id, row);
      setItems(Array.from(byId.values()));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('employeeWorkspace.deadlinesLoadError');
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAdmin, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const scoped = useMemo(() => {
    let rows = items;
    if (openOnly) rows = rows.filter((r) => !r.closed);
    if (assigneeFilter !== 'all') {
      rows = rows.filter((r) => (r.assigneeId || '') === assigneeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.subtitle || '').toLowerCase().includes(q) ||
          (r.assigneeName || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [items, openOnly, assigneeFilter, search]);

  const upcoming = useMemo(
    () =>
      scoped
        .filter((i) => daysUntil(i.deadline) >= 0)
        .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()),
    [scoped]
  );

  const past = useMemo(
    () =>
      scoped
        .filter((i) => daysUntil(i.deadline) < 0)
        .sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime()),
    [scoped]
  );

  const activeRows = useMemo(() => {
    const base = tab === 'upcoming' ? upcoming : past;
    if (kindFilter === 'all') return base;
    return base.filter((r) => r.kind === kindFilter);
  }, [tab, upcoming, past, kindFilter]);

  const groups = useMemo((): DayGroup[] => {
    const map = new Map<string, DeadlineItem[]>();
    for (const row of activeRows) {
      const key = dayKey(row.deadline);
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const d = parseDeadline(rows[0].deadline)!;
      const label = d.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      return { key, label, items: rows };
    });
  }, [activeRows, locale]);

  const kpis = useMemo(() => {
    const open = items.filter((i) => !i.closed);
    const late = open.filter((i) => daysUntil(i.deadline) < 0).length;
    const today = open.filter((i) => daysUntil(i.deadline) === 0).length;
    const week = open.filter((i) => {
      const d = daysUntil(i.deadline);
      return d >= 1 && d <= 7;
    }).length;
    const later = open.filter((i) => daysUntil(i.deadline) > 7).length;
    return { late, today, week, later, total: open.length };
  }, [items]);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.assigneeId && i.assigneeName) map.set(i.assigneeId, i.assigneeName);
      else if (i.assigneeId) map.set(i.assigneeId, i.assigneeId.slice(0, 8));
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const kindLabel = (kind: DeadlineKind) => {
    if (kind === 'claim') return t('employeeWorkspace.deadlinesKindClaim');
    if (kind === 'action') return t('employeeWorkspace.deadlinesKindAction');
    return t('employeeWorkspace.deadlinesKindPlan');
  };

  const flagLabel = (iso: string, urg: Urgency) => {
    const d = daysUntil(iso);
    if (urg === 'late') return t('employeeWorkspace.overdueDays', { count: Math.abs(d) });
    if (urg === 'past') return t('employeeWorkspace.agoDays', { count: Math.abs(d) });
    if (urg === 'today') return t('employeeWorkspace.today');
    if (d === 1) return t('employeeWorkspace.tomorrow');
    if (urg === 'soon') return t('employeeWorkspace.inDaysShort', { count: d });
    return t('employeeWorkspace.inDaysShort', { count: d });
  };

  const dateParts = (iso: string) => {
    const d = parseDeadline(iso)!;
    return {
      day: d.getDate(),
      month: d.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, ''),
    };
  };

  const metaLine = (row: DeadlineItem) => {
    const parts = [row.statusLabel];
    if (row.assigneeName) parts.push(row.assigneeName);
    if (row.subtitle) parts.push(row.subtitle);
    return parts.join(' · ');
  };

  return (
    <div className={`dl-page${isAdmin ? ' admin' : ''}`}>
      <div className="dl-inner">
        <div className="dl-top">
          <div>
            <h1>{t('employeeWorkspace.frontDeadlines')}</h1>
            <p>
              {isAdmin
                ? t('employeeWorkspace.deadlinesIntroAdmin')
                : t('employeeWorkspace.deadlinesIntro')}
            </p>
          </div>
          <div className="dl-top-actions">
            <Link className="dl-btn" to="/pages/front/action-plans/calendar">
              {t('employeeWorkspace.frontCalendar')}
            </Link>
            <button type="button" className="dl-btn" disabled={loading} onClick={() => void load()}>
              {t('employeeWorkspace.deadlinesRefresh')}
            </button>
          </div>
        </div>

        {error && (
          <div className="dl-banner" role="alert">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {isAdmin && (
          <div className="dl-kpis">
            <div className="dl-kpi late">
              <span>{t('employeeWorkspace.deadlinesKpiLate')}</span>
              <strong>{kpis.late}</strong>
            </div>
            <div className="dl-kpi today">
              <span>{t('employeeWorkspace.deadlinesKpiToday')}</span>
              <strong>{kpis.today}</strong>
            </div>
            <div className="dl-kpi week">
              <span>{t('employeeWorkspace.deadlinesKpiWeek')}</span>
              <strong>{kpis.week}</strong>
            </div>
            <div className="dl-kpi">
              <span>{t('employeeWorkspace.deadlinesKpiOpen')}</span>
              <strong>{kpis.total}</strong>
            </div>
          </div>
        )}

        <div className="dl-tabs" role="tablist" aria-label={t('employeeWorkspace.frontDeadlines')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upcoming'}
            className={`dl-tab${tab === 'upcoming' ? ' on' : ''}`}
            onClick={() => setTab('upcoming')}
          >
            {t('employeeWorkspace.deadlinesUpcoming')}
            <span className="dl-tab-n">{upcoming.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'past'}
            className={`dl-tab past${tab === 'past' ? ' on' : ''}`}
            onClick={() => setTab('past')}
          >
            {t('employeeWorkspace.deadlinesPast')}
            <span className="dl-tab-n">{past.length}</span>
          </button>
        </div>

        <div className="dl-toolbar">
          <div className="dl-filters" role="group" aria-label={t('employeeWorkspace.deadlinesFilter')}>
            {(
              [
                ['all', t('employeeWorkspace.deadlinesFilterAll')],
                ['claim', t('employeeWorkspace.deadlinesKindClaim')],
                ['plan', t('employeeWorkspace.deadlinesKindPlan')],
                ['action', t('employeeWorkspace.deadlinesKindAction')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`dl-chip${kindFilter === key ? ' on' : ''}`}
                onClick={() => setKindFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <div className="dl-admin-filters">
              <input
                className="dl-search"
                type="search"
                placeholder={t('employeeWorkspace.deadlinesSearch')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="dl-select"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                aria-label={t('employeeWorkspace.deadlinesAssignee')}
              >
                <option value="all">{t('employeeWorkspace.deadlinesAssigneeAll')}</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <label className="dl-check">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                />
                {t('employeeWorkspace.deadlinesOpenOnly')}
              </label>
            </div>
          )}
        </div>

        <div className="dl-panel">
          {loading ? (
            <div className="dl-skel" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="dl-skel-row" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="dl-empty">{t('employeeWorkspace.deadlinesEmptySection')}</div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="dl-day-group">
                <div className="dl-day-label">
                  <strong>{group.label}</strong>
                  <span>
                    {group.items.length}{' '}
                    {group.items.length > 1
                      ? t('employeeWorkspace.deadlinesCountPlural')
                      : t('employeeWorkspace.deadlinesCountSingular')}
                  </span>
                </div>
                <ul className="dl-list">
                  {group.items.map((row) => {
                    const urg = urgencyOf(row.deadline, row.closed);
                    const parts = dateParts(row.deadline);
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={`dl-row ${urg}${row.closed ? ' closed' : ''}`}
                          onClick={() => navigate(row.href)}
                        >
                          <span className="dl-datebox" aria-hidden>
                            <span className="d">{parts.day}</span>
                            <span className="m">{parts.month}</span>
                          </span>
                          <span className="dl-body">
                            <span className="dl-title-line">
                              <span className="dl-title">{row.title}</span>
                              <span className={`dl-badge ${row.kind}`}>{kindLabel(row.kind)}</span>
                            </span>
                            <span className="dl-meta">{metaLine(row)}</span>
                          </span>
                          <span className={`dl-flag ${urg}`}>{flagLabel(row.deadline, urg)}</span>
                          <span className="dl-chev" aria-hidden>
                            ›
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
