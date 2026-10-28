import { domainOf, inDomain } from '../../utils/planDomain';
import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getActionPlans, getUsersForAssignment } from '../../services/actionPlanService';
import { getDepartments } from '../../services/adminService';
import { fixMojibake } from '../../utils/textEncoding';
import { CapaPageHeader } from '../../components/capa/CapaAdminUi';
import { ListSkeleton } from '../../components/TableSkeleton';

const COFICAB = '#000168';
const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200';
const btnPrimary =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white border border-[#000168] hover:bg-[#00009e]';

type FollowStatus = 'inProgress' | 'belated' | 'realized' | 'validated' | 'cancelled';
type TabKey = 'all' | FollowStatus | 'watch';
type ViewMode = 'monitoring' | 'realization';
type MonitorLevel = 'onTrack' | 'watch' | 'belated' | 'done' | 'cancelled';

type ActionRow = {
  domain: string;
  id: string;
  actionPlanId: string;
  planTitle: string;
  title: string;
  responsibleId?: string;
  responsibleName: string;
  process: string;
  dateFrom?: string;
  dateTo?: string;
  progress: number;
  followStatus: FollowStatus | 'notStarted';
  monitoring: MonitorLevel;
  planOpen: boolean;
};

function unwrapList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

function parseProgress(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const named: Record<string, number> = {
    notstarted: 0, twentyfive: 25, thirtythree: 33, fifty: 50,
    sixtysix: 66, seventyfive: 75, hundred: 100, validated: 101, cancelled: 102, canceled: 102,
  };
  if (s in named) return named[s];
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function classify(progress: number, deadline?: string): { follow: FollowStatus | 'notStarted'; monitor: MonitorLevel } {
  if (progress === 102) return { follow: 'cancelled', monitor: 'cancelled' };
  if (progress === 101) return { follow: 'validated', monitor: 'done' };
  if (progress === 100) return { follow: 'realized', monitor: 'done' };

  const now = Date.now();
  const dl = deadline ? new Date(deadline).getTime() : NaN;
  const overdue = Number.isFinite(dl) && dl < now;

  if (overdue) return { follow: 'belated', monitor: 'belated' };

  if (progress <= 0) {
    if (Number.isFinite(dl)) {
      const daysLeft = (dl - now) / 86400000;
      if (daysLeft <= 3) return { follow: 'notStarted', monitor: 'watch' };
    }
    return { follow: 'notStarted', monitor: 'onTrack' };
  }

  if (Number.isFinite(dl)) {
    const daysLeft = (dl - now) / 86400000;
    if (daysLeft <= 3) return { follow: 'inProgress', monitor: 'watch' };
  }
  return { follow: 'inProgress', monitor: 'onTrack' };
}

function isRawCode(value: string): boolean {
  const v = value.trim();
  return v.length >= 2 && v.length <= 12 && !v.includes(' ') && /^[a-z0-9_-]+$/i.test(v);
}

function departmentLabel(raw: string, departmentId: string | undefined, departments: any[]): string {
  const byId = departmentId
    ? departments.find((d) => String(d.id ?? d.Id ?? '').toLowerCase() === departmentId.toLowerCase())
    : undefined;
  const key = (raw || byId?.code || byId?.Code || '').trim().toLowerCase();
  const byCode = departments.find((d) => {
    const code = String(d.code ?? d.Code ?? '').trim().toLowerCase();
    const name = String(d.name ?? d.Name ?? '').trim();
    return code && code === key && !isRawCode(name);
  });
  if (byCode) return String(byCode.name ?? byCode.Name);
  const idName = String(byId?.name ?? byId?.Name ?? '').trim();
  if (idName && !isRawCode(idName)) return idName;
  const description = String(byId?.description ?? byId?.Description ?? '').trim();
  if (description.includes(' ')) return description;
  if (raw && !isRawCode(raw)) return raw;
  return idName || raw || '—';
}

function dayStamp(value?: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const STATUS_BADGE: Record<FollowStatus | 'notStarted', { bg: string; color: string; border: string }> = {
  notStarted: { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' },
  inProgress: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  belated: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  realized: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  validated: { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' },
  cancelled: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
};

const MONITOR_BADGE: Record<MonitorLevel, { bg: string; color: string }> = {
  onTrack: { bg: '#ecfdf5', color: '#059669' },
  watch: { bg: '#fffbeb', color: '#d97706' },
  belated: { bg: '#fef2f2', color: '#dc2626' },
  done: { bg: '#eef2ff', color: '#4f46e5' },
  cancelled: { bg: '#f1f5f9', color: '#64748b' },
};

export default function ActionFollowUpPage({ embedded = false, focus, domain }: { embedded?: boolean; focus?: 'belated' | 'realized'; domain?: string }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [view, setView] = useState<ViewMode>('monitoring');
  const [tab, setTab] = useState<TabKey>(embedded && focus ? focus : 'all');
  const [q, setQ] = useState('');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('all');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [plansRes, usersRes, departments] = await Promise.all([
        getActionPlans(accessToken, true),
        getUsersForAssignment(accessToken).catch(() => ({ data: [] })),
        getDepartments(accessToken).catch(() => [] as any[]),
      ]);
      const plans = unwrapList(plansRes.data?.data ?? plansRes.data);
      const deptList = Array.isArray(departments) ? departments : unwrapList((departments as any)?.data ?? departments);

      const userMap: Record<string, string> = {};
      const userPayload = (usersRes as any)?.data ?? usersRes;
      const userList = unwrapList(userPayload);
      for (const u of userList as any[]) {
        const id = String(u.id || u.Id || '').trim().toLowerCase();
        const name = u.fullName || u.FullName || `${u.firstName ?? u.FirstName ?? ''} ${u.lastName ?? u.LastName ?? ''}`.trim() || u.email || u.Email;
        if (!id || !name || /^[0-9a-f-]{8,}$/i.test(String(name))) continue;
        userMap[id] = name;
      }

      const mapped: ActionRow[] = [];
      for (const p of plans) {
        const planId = String(p.id || p.Id || '');
        const planStatus = String(p.status ?? p.Status ?? '').toLowerCase();
        if (planStatus === '4' || planStatus === 'archived') continue;

        const planTitle = fixMojibake(p.title || p.Title) || t('followUp.untitledPlan');
        const deptId = String(p.departmentId || p.DepartmentId || '');
        const process = departmentLabel(
          fixMojibake(p.departmentName || p.DepartmentName || p.department?.name || ''),
          deptId,
          deptList,
        );
        const actions = unwrapList(p.planActions ?? p.PlanActions);

        for (const a of actions) {
          if (a.isArchived || a.IsArchived) continue;
          const progress = parseProgress(a.progress ?? a.Progress);
          const dateTo = a.deadline || a.Deadline;
          const dateFrom = a.createdAt || a.CreatedAt || p.createdAt || p.CreatedAt;
          const { follow, monitor } = classify(progress, dateTo);
          const assignee = a.assignedToId || a.AssignedToId || p.assignedToId || p.AssignedToId;
          const apiName = a.assignedToName || a.AssignedToName || p.assignedToName || p.AssignedToName;
          const actionProcess = departmentLabel(
            fixMojibake(a.departmentName || a.DepartmentName || ''),
            deptId,
            deptList,
          ) || process;

          mapped.push({
            domain: domainOf({ domain: p.domain ?? p.Domain }),
            id: String(a.id || a.Id),
            actionPlanId: planId,
            planTitle,
            title: fixMojibake(a.title || a.Title) || t('followUp.untitled'),
            responsibleId: assignee ? String(assignee) : undefined,
            responsibleName: (() => {
              const explicit = apiName ? fixMojibake(String(apiName)) : '';
              if (explicit && !/^[0-9a-f-]{8,}$/i.test(explicit)) return explicit;
              const key = String(assignee ?? '').trim().toLowerCase();
              return (key && userMap[key]) || t('followUp.unassigned');
            })(),
            process: actionProcess,
            dateFrom,
            dateTo,
            progress: progress === 101 ? 100 : progress === 102 ? 0 : Math.max(0, Math.min(100, progress)),
            followStatus: follow,
            monitoring: monitor,
            planOpen: planStatus !== 'closed' && planStatus !== '3',
          });
        }
      }

      mapped.sort((a, b) => {
        const order: Record<string, number> = {
          belated: 0, inProgress: 1, notStarted: 2, realized: 3, validated: 4, cancelled: 5,
        };
        const d = (order[a.followStatus] ?? 9) - (order[b.followStatus] ?? 9);
        if (d !== 0) return d;
        return a.title.localeCompare(b.title);
      });
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('followUp.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  // "To handle": late actions, finished ones waiting for validation, and those due within 3 days
  const isTodo = (r: ActionRow) => r.planOpen && (r.followStatus === 'belated' || r.followStatus === 'realized' || r.monitoring === 'watch');
  const base = useMemo(() => inDomain(embedded ? rows.filter(isTodo) : rows, domain ?? 'all'), [rows, embedded, domain]);
  const todoCounts = useMemo(() => ({
    all: base.length,
    belated: base.filter((r) => r.followStatus === 'belated').length,
    realized: base.filter((r) => r.followStatus === 'realized').length,
    watch: base.filter((r) => r.followStatus !== 'belated' && r.followStatus !== 'realized' && r.monitoring === 'watch').length,
  }), [base]);
  useEffect(() => {
    if (embedded) return;
    if (view === 'realization') setTab('realized');
    else setTab('all');
  }, [view, embedded]);

  const tabs: { key: TabKey; label: string }[] = useMemo(() => embedded ? [
    { key: 'all', label: 'À traiter' },
    { key: 'belated', label: t('followUp.tabBelated') },
    { key: 'realized', label: 'À valider' },
    { key: 'watch', label: 'Échéance proche' },
  ] : [
    { key: 'all', label: t('followUp.tabAll') },
    { key: 'inProgress', label: t('followUp.tabInProgress') },
    { key: 'belated', label: t('followUp.tabBelated') },
    { key: 'realized', label: t('followUp.tabRealized') },
    { key: 'validated', label: t('followUp.tabValidated') },
    { key: 'cancelled', label: t('followUp.tabCancelled') },
  ], [t, embedded]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: rows.length, inProgress: 0, belated: 0, realized: 0, validated: 0, cancelled: 0, watch: 0,
    };
    for (const r of rows) {
      if (r.followStatus === 'notStarted') {
        // counted in All only; also surface under In Progress in monitoring
        continue;
      }
      c[r.followStatus as FollowStatus] += 1;
    }
    c.inProgress += rows.filter((r) => r.followStatus === 'notStarted').length;
    return c;
  }, [rows]);

  const processes = useMemo(
    () => Array.from(new Set(base.map((r) => r.process).filter((p) => p && p !== '—'))).sort(),
    [base]
  );
  const responsibles = useMemo(() => {
    const m = new Map<string, string>();
    base.forEach((r) => { if (r.responsibleId) m.set(r.responsibleId, r.responsibleName); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [base]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return base.filter((r) => {
      if (tab === 'watch') {
        if (r.followStatus === 'belated' || r.followStatus === 'realized' || r.monitoring !== 'watch') return false;
      } else if (tab === 'inProgress') {
        if (r.followStatus !== 'inProgress' && r.followStatus !== 'notStarted') return false;
      } else if (tab !== 'all' && r.followStatus !== tab) return false;

      if (filterProcess !== 'all' && r.process !== filterProcess) return false;
      if (filterFrom || filterTo) {
        const due = dayStamp(r.dateTo);
        const from = dayStamp(filterFrom);
        const to = dayStamp(filterTo);
        if (due == null) return false;
        if (from != null && due < from) return false;
        if (to != null && due > to) return false;
      }
      if (filterResponsible !== 'all' && r.responsibleId !== filterResponsible) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.planTitle.toLowerCase().includes(term) ||
        r.process.toLowerCase().includes(term) ||
        r.responsibleName.toLowerCase().includes(term)
      );
    });
  }, [base, tab, q, filterProcess, filterFrom, filterTo, filterResponsible]);
  const paged = usePagedList(filtered, 25);

  const statusLabel = (s: FollowStatus | 'notStarted') => {
    if (s === 'notStarted') return t('followUp.statusNotStarted');
    if (s === 'inProgress') return t('followUp.tabInProgress');
    if (s === 'belated') return t('followUp.tabBelated');
    if (s === 'realized') return t('followUp.tabRealized');
    if (s === 'validated') return t('followUp.tabValidated');
    return t('followUp.tabCancelled');
  };

  const monitorLabel = (m: MonitorLevel) => t(`followUp.monitor.${m}`);

  const selectCls =
    'px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading) {
    return (
      <div className="min-h-[40vh] px-2 py-4">
        <ListSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div id="capa-focus-list" className="text-slate-900">
      <div className="max-w-7xl mx-auto">
        {!embedded && (
        <CapaPageHeader
          eyebrow={t('followUp.eyebrow')}
          title={t('followUp.title')}
          subtitle={t('followUp.subtitle')}
          actions={
            <>
              <button type="button" onClick={() => void load()} className={btn}>
                {t('dashboard.refresh')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/action-plans/dashboard')}
                className={btn}
              >
                {t('nav.capaDashboard')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/action-plans/create')}
                className={btnPrimary}
              >
                {t('admin.newPlan')}
              </button>
            </>
          }
        />
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {!embedded && <div className="inline-flex p-0.5 rounded-lg bg-white border border-slate-200 mb-3">
          {(['monitoring', 'realization'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors hover:bg-slate-50"
              style={
                view === mode
                  ? { background: COFICAB, color: '#fff' }
                  : { background: 'transparent', color: '#475569' }
              }
            >
              {mode === 'monitoring' ? t('followUp.viewMonitoring') : t('followUp.viewRealization')}
            </button>
          ))}
        </div>}

        {embedded && tab !== 'all' && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-slate-500">Filtre :</span>
            <button type="button" onClick={() => setTab('all')} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border" style={{ background: COFICAB, color: '#fff', borderColor: COFICAB }}>
              {tabs.find((x) => x.key === tab)?.label} <span aria-hidden>×</span>
            </button>
          </div>
        )}

        <div className={embedded ? 'hidden' : 'flex flex-wrap gap-1.5 mb-3'}>
          {tabs.map((tb) => {
            const badgeCount = (() => {
              if (embedded) return todoCounts[tb.key as 'all' | 'belated' | 'realized' | 'watch'];
              if (tb.key === 'all') return rows.length;
              if (tb.key === 'inProgress') return counts.inProgress;
              return counts[tb.key as FollowStatus];
            })();
            const active = tab === tb.key;
            return (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors hover:border-indigo-200 hover:bg-slate-50"
                style={
                  active
                    ? { background: COFICAB, color: '#fff', borderColor: COFICAB }
                    : { background: '#fff', color: '#475569', borderColor: '#e2e8f0' }
                }
              >
                {tb.label}
                <span
                  className="text-[10px] px-1 py-0 rounded-full tabular-nums"
                  style={
                    active
                      ? { background: 'rgba(255,255,255,0.2)' }
                      : { background: '#f1f5f9', color: '#64748b' }
                  }
                >
                  {badgeCount}
                </span>
              </button>
            );
          })}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className={`px-4 py-2.5 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 ${embedded ? '' : 'lg:grid-cols-5'} gap-2`}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('followUp.searchPlaceholder')}
              className={selectCls}
            />
            <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className={embedded ? 'hidden' : selectCls} aria-label={t('planDetail.department')}>
              <option value="all">{t('audit.allDepartments')}</option>
              {processes.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)} className={selectCls}>
              <option value="all">{t('dashboard.allResponsibles')}</option>
              {responsibles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              aria-label={t('capaDash.dueFrom')}
              title={t('capaDash.dueFrom')}
              className={embedded ? 'hidden' : selectCls}
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              aria-label={t('capaDash.dueTo')}
              title={t('capaDash.dueTo')}
              className={embedded ? 'hidden' : selectCls}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">{t('followUp.colTitle')}</th>
                  <th className="px-4 py-3 font-semibold">{t('followUp.colResponsible')}</th>
                  <th className={embedded ? 'hidden' : 'px-4 py-3 font-semibold'}>{t('followUp.colProcess')}</th>
                  <th className={embedded ? 'hidden' : 'px-4 py-3 font-semibold'}>{t('followUp.colFrom')}</th>
                  <th className="px-4 py-3 font-semibold">{t('followUp.colTo')}</th>
                  <th className="px-4 py-3 font-semibold">{t('followUp.colStatus')}</th>
                  <th className={embedded ? 'hidden' : 'px-4 py-3 font-semibold'}>{t('followUp.colMonitoring')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('dashboard.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={embedded ? 5 : 8} className="px-4 py-14 text-center text-slate-400">
                      {t('followUp.empty')}
                    </td>
                  </tr>
                ) : (
                  paged.rows.map((r) => {
                    const st = STATUS_BADGE[r.followStatus];
                    const mon = MONITOR_BADGE[r.monitoring];
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 max-w-[240px] truncate" title={r.title}>
                            {r.title}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[240px]" title={r.planTitle}>
                            {r.planTitle}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.responsibleName}</td>
                        <td className={embedded ? 'hidden' : 'px-4 py-3 whitespace-nowrap text-slate-700'}>{r.process}</td>
                        <td className={embedded ? 'hidden' : 'px-4 py-3 whitespace-nowrap text-slate-600'}>{formatDate(r.dateFrom)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={r.followStatus === 'belated' ? 'text-red-700 font-medium' : 'text-slate-700'}>
                            {formatDate(r.dateTo)}
                          </span>
                          {embedded && r.followStatus === 'belated' && r.dateTo && (
                            <div className="text-[11px] text-red-600 font-semibold">{Math.max(0, Math.floor((Date.now() - new Date(r.dateTo).getTime()) / 86400000))} j de retard</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ background: st.bg, color: st.color, borderColor: st.border }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.color }} />
                            {statusLabel(r.followStatus)}
                            {r.progress > 0 && r.progress < 100 && (
                              <span className="opacity-70 tabular-nums">{r.progress}%</span>
                            )}
                          </span>
                        </td>
                        <td className={embedded ? 'hidden' : 'px-4 py-3'}>
                          <span
                            className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold"
                            style={{ background: mon.bg, color: mon.color }}
                          >
                            {monitorLabel(r.monitoring)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#000168] hover:underline"
                            onClick={() => navigate(`/pages/front/action-plans/${r.actionPlanId}/actions`)}
                          >
                            {t('followUp.open')}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > paged.pageSize && (
            <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={false} />
          )}
        </div>
      </div>
    </div>
  );
}
