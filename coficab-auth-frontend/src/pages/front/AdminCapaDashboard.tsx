import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  getSteeringPlans,
  getUsersForAssignment,
} from '../../services/actionPlanService';
import { fixMojibake } from '../../utils/textEncoding';
import UserAvatar from '../../components/UserAvatar';
import { ListSkeleton } from '../../components/TableSkeleton';
import type { ActionPlanType, PlanActionPriority } from './action-plan.types';

const COFICAB = '#000168';
const PAGE_SIZE = 8;

type KpiKey = 'delayed' | 'pending' | 'inProgress' | 'realized';

type Row = {
  id: string;
  actionPlanId: string;
  claimId?: string;
  claimTitle?: string;
  title: string;
  urgency: PlanActionPriority;
  nature: ActionPlanType;
  process: string;
  responsibleId?: string;
  responsibleName: string;
  statusLabel: string;
  progress: number;
  deadline?: string;
  daysLate: number;
  /** delayed = overdue open; pending = not started; inProgress = started open; realized = done */
  bucket: KpiKey;
};

function statusTone(bucket: KpiKey): { bg: string; color: string } {
  if (bucket === 'delayed') return { bg: '#fef2f2', color: '#b91c1c' };
  if (bucket === 'pending') return { bg: '#fffbeb', color: '#b45309' };
  if (bucket === 'realized') return { bg: '#ecfdf5', color: '#047857' };
  return { bg: '#eff6ff', color: '#1d4ed8' };
}

function unwrapList(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as any;
  if (Array.isArray(p?.data)) return p.data;
  if (Array.isArray(p?.items)) return p.items;
  return [];
}

function toUiType(raw: unknown): ActionPlanType {
  if (typeof raw === 'number') {
    return ({ 1: 'preventif', 2: 'correctif', 3: 'amelioration' } as const)[raw as 1 | 2 | 3] ?? 'preventif';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'pa' || s === 'preventif' || s === 'preventive') return 'preventif';
  if (s === '2' || s === 'pac' || s === 'correctif' || s === 'corrective') return 'correctif';
  if (s === '3' || s === 'pap' || s === 'amelioration' || s === 'improvement') return 'amelioration';
  return 'preventif';
}

function toUiPriority(raw: unknown): PlanActionPriority {
  if (typeof raw === 'number') {
    if (raw === 1) return 'high';
    if (raw === 2) return 'medium';
    return 'low';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'high' || s === '1') return 'high';
  if (s === 'medium' || s === '2') return 'medium';
  return 'low';
}

function toUiStatus(raw: unknown): string {
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

function parseProgress(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === 101) return 100;
    if (raw === 102) return 0;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const named: Record<string, number> = {
    notstarted: 0, twentyfive: 25, fifty: 50, seventyfive: 75,
    hundred: 100, validated: 100, cancelled: 0,
  };
  if (s in named) return named[s];
  const n = Number(s);
  return Number.isFinite(n) ? parseProgress(n) : 0;
}

function isPastDue(deadline?: string): boolean {
  if (!deadline) return false;
  const due = new Date(deadline);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function daysOverdue(deadline?: string): number {
  if (!isPastDue(deadline)) return 0;
  const due = new Date(deadline as string);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
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

const URGENCY_STYLE: Record<PlanActionPriority, { bg: string; color: string }> = {
  high: { bg: '#fef2f2', color: '#b91c1c' },
  medium: { bg: '#fffbeb', color: '#b45309' },
  low: { bg: '#f1f5f9', color: '#475569' },
};

const NATURE_STYLE: Record<ActionPlanType, { bg: string; color: string }> = {
  preventif: { bg: '#f5f3ff', color: '#6d28d9' },
  correctif: { bg: '#fff1f2', color: '#be123c' },
  amelioration: { bg: '#f0fdfa', color: '#0f766e' },
};

/** `embedded`: inside the tracking page, which already shows the title, the figures and the buttons. */
export default function AdminCapaDashboard({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState({ delayed: 0, pending: 0, inProgress: 0, realized: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [activeKpi, setActiveKpi] = useState<KpiKey | 'all'>('all');

  const [q, setQ] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<'all' | PlanActionPriority>('all');
  const [filterNature, setFilterNature] = useState<'all' | ActionPlanType>('all');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [plansRes, users] = await Promise.all([
        getSteeringPlans(accessToken),
        getUsersForAssignment(accessToken).catch(() => []),
      ]);

      const plans = unwrapList(plansRes.data?.data ?? plansRes.data);
      const overdue: any[] = [];

      const userMap: Record<string, string> = {};
      const userPayload = (users as any)?.data ?? users;
      const userList = unwrapList(userPayload);
      for (const u of userList as any[]) {
        const id = String(u.id || u.Id || '').trim().toLowerCase();
        if (!id) continue;
        userMap[id] =
          u.fullName ||
          u.FullName ||
          `${u.firstName ?? u.FirstName ?? ''} ${u.lastName ?? u.LastName ?? ''}`.trim() ||
          u.email ||
          u.Email ||
          id;
      }

      const personName = (id?: string, explicit?: string) => {
        const named = explicit ? fixMojibake(explicit) : '';
        if (named && !/^[0-9a-f-]{8,}$/i.test(named)) return named;
        const key = String(id ?? '').trim().toLowerCase();
        if (key && userMap[key]) return userMap[key];
        return t('dashboard.unassigned');
      };

      const overdueIds = new Set(
        overdue.map((a) => String(a.id || a.Id || '')).filter(Boolean),
      );
      const seen = new Set<string>();

      const mapped: Row[] = [];
      for (const p of plans) {
        const planStatus = toUiStatus(p.status ?? p.Status);
        if (planStatus === 'archived') continue;
        const planId = String(p.id || p.Id || '');
        const nature = toUiType(p.type ?? p.Type);
        const process = fixMojibake(
          p.departmentName || p.DepartmentName || p.department?.name,
        ) || '—';
        const planDeadline = p.deadline || p.Deadline;
        const planIsLate = planStatus !== 'closed' && isPastDue(planDeadline);
        const actions = unwrapList(p.planActions ?? p.PlanActions);
        let delayedActionCount = 0;

        for (const a of actions) {
          if (a.isArchived || a.IsArchived) continue;
          const progressRaw = typeof (a.progress ?? a.Progress) === 'number'
            ? Number(a.progress ?? a.Progress)
            : parseProgress(a.progress ?? a.Progress);
          const progress = parseProgress(progressRaw);
          const isCancelled = progressRaw === 102 || String(a.progress ?? '').toLowerCase() === 'cancelled';
          const isValidated = progressRaw === 101 || progress >= 100;
          const deadline = a.deadline || a.Deadline;
          const actionId = String(a.id || a.Id || '');
          const late = !isValidated && !isCancelled && planStatus !== 'closed' && (
            overdueIds.has(actionId) || isPastDue(deadline) || planIsLate
          );

          let bucket: KpiKey;
          let statusLabel: string;
          if (isCancelled) {
            continue;
          }
          if (isValidated || planStatus === 'closed') {
            bucket = 'realized';
            statusLabel = t('dashboard.statusDone');
          } else if (late) {
            bucket = 'delayed';
            statusLabel = t('dashboard.statusBelated');
            delayedActionCount += 1;
          } else if (progress <= 0) {
            bucket = 'pending';
            statusLabel = t('dashboard.statusNotStarted');
          } else {
            bucket = 'inProgress';
            statusLabel = t('dashboard.statusInProgress');
          }

          const assignee = a.assignedToId || a.AssignedToId || p.assignedToId || p.AssignedToId;
          const apiName = a.assignedToName || a.AssignedToName || p.assignedToName || p.AssignedToName;
          const claimRaw = p.claimId || p.ClaimId;
          const claimTitle = fixMojibake(p.claimTitle || p.ClaimTitle || '');
          const lateDays = Math.max(daysOverdue(deadline), planIsLate ? daysOverdue(planDeadline) : 0);

          if (actionId) seen.add(actionId);
          mapped.push({
            id: actionId,
            actionPlanId: planId,
            claimId: claimRaw ? String(claimRaw) : undefined,
            claimTitle: claimTitle || undefined,
            title: fixMojibake(a.title || a.Title) || t('dashboard.untitled'),
            urgency: toUiPriority(a.priority ?? a.Priority),
            nature: toUiType(a.planType ?? a.PlanType ?? p.type ?? p.Type) || nature,
            process: fixMojibake(a.departmentName || a.DepartmentName) || process,
            responsibleId: assignee ? String(assignee) : undefined,
            responsibleName: personName(assignee, apiName),
            statusLabel,
            progress,
            deadline: deadline || (planIsLate ? planDeadline : undefined),
            daysLate: lateDays,
            bucket,
          });
        }

        if (planIsLate && delayedActionCount === 0) {
          const assignee = p.assignedToId || p.AssignedToId;
          const apiName = p.assignedToName || p.AssignedToName;
          const claimRaw = p.claimId || p.ClaimId;
          const claimTitle = fixMojibake(p.claimTitle || p.ClaimTitle || '');
          mapped.push({
            id: planId,
            actionPlanId: planId,
            claimId: claimRaw ? String(claimRaw) : undefined,
            claimTitle: claimTitle || undefined,
            title: fixMojibake(p.title || p.Title) || t('dashboard.untitled'),
            urgency: 'high',
            nature,
            process,
            responsibleId: assignee ? String(assignee) : undefined,
            responsibleName: personName(assignee, apiName),
            statusLabel: t('dashboard.statusBelated'),
            progress: Number(p.progress ?? p.Progress ?? 0) || 0,
            deadline: planDeadline,
            daysLate: daysOverdue(planDeadline),
            bucket: 'delayed',
          });
        }
      }

      for (const a of overdue) {
        const actionId = String(a.id || a.Id || '');
        if (!actionId || seen.has(actionId)) continue;
        const planId = String(a.actionPlanId || a.ActionPlanId || '');
        const parent = plans.find((p) => String(p.id || p.Id || '') === planId);
        if (!parent) continue;
        const planStatus = toUiStatus(parent.status ?? parent.Status);
        if (planStatus === 'archived' || planStatus === 'closed') continue;
        const deadline = a.deadline || a.Deadline;
        const assignee = a.assignedToId || a.AssignedToId || parent?.assignedToId || parent?.AssignedToId;
        const apiName = parent?.assignedToName || parent?.AssignedToName;
        mapped.push({
          id: actionId,
          actionPlanId: planId,
          claimId: parent?.claimId || parent?.ClaimId ? String(parent.claimId || parent.ClaimId) : undefined,
          title: fixMojibake(a.title || a.Title) || t('dashboard.untitled'),
          urgency: toUiPriority(a.priority ?? a.Priority),
          nature: toUiType(parent?.type ?? parent?.Type),
          process: fixMojibake(parent?.departmentName || parent?.DepartmentName) || '—',
          responsibleId: assignee ? String(assignee) : undefined,
          responsibleName: personName(assignee, apiName),
          statusLabel: t('dashboard.statusBelated'),
          progress: parseProgress(a.progress ?? a.Progress),
          deadline,
          daysLate: daysOverdue(deadline),
          bucket: 'delayed',
        });
      }

      setKpis({
        delayed: mapped.filter((r) => r.bucket === 'delayed').length,
        pending: mapped.filter((r) => r.bucket === 'pending').length,
        inProgress: mapped.filter((r) => r.bucket === 'inProgress').length,
        realized: mapped.filter((r) => r.bucket === 'realized').length,
      });

      mapped.sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title, 'fr'));
      setRows(mapped);
      setActiveKpi((current) => {
        if (current !== 'all') return current;
        return mapped.some((r) => r.bucket === 'delayed') ? 'delayed' : 'all';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const processes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.process).filter((p) => p && p !== '—'))).sort((a, b) => a.localeCompare(b, i18n.language)),
    [rows, i18n.language]
  );

  const responsibles = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.responsibleId) map.set(r.responsibleId, r.responsibleName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [rows]);

  const tableTitle = useMemo(() => {
    if (activeKpi === 'delayed') return t('dashboard.tableDelayed');
    if (activeKpi === 'pending') return t('dashboard.tablePending');
    if (activeKpi === 'inProgress') return t('dashboard.tableInProgress');
    if (activeKpi === 'realized') return t('dashboard.tableRealized');
    return t('dashboard.belatedOpenedTitle');
  }, [activeKpi, t]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeKpi === 'all') {
        // Belated / Opened = everything still open (not realized)
        if (r.bucket === 'realized') return false;
      } else if (r.bucket !== activeKpi) {
        return false;
      }
      if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
      if (filterNature !== 'all' && r.nature !== filterNature) return false;
      if (filterProcess !== 'all' && r.process !== filterProcess) return false;
      if (filterFrom || filterTo) {
        const due = dayStamp(r.deadline);
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
        r.process.toLowerCase().includes(term) ||
        r.responsibleName.toLowerCase().includes(term) ||
        r.statusLabel.toLowerCase().includes(term)
      );
    }).sort((a, b) => b.daysLate - a.daysLate || a.title.localeCompare(b.title, 'fr'));
  }, [rows, q, activeKpi, filterUrgency, filterNature, filterProcess, filterFrom, filterTo, filterResponsible]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [q, activeKpi, filterUrgency, filterNature, filterProcess, filterFrom, filterTo, filterResponsible]);

  const cardDefs: { key: KpiKey; label: string; value: number; accent: string; tint: string }[] = [
    { key: 'delayed', label: t('dashboard.delayed'), value: kpis.delayed, accent: '#dc2626', tint: '#fef2f2' },
    { key: 'pending', label: t('dashboard.pending'), value: kpis.pending, accent: '#d97706', tint: '#fffbeb' },
    { key: 'inProgress', label: t('dashboard.inProgress'), value: kpis.inProgress, accent: '#2563eb', tint: '#eff6ff' },
    { key: 'realized', label: t('dashboard.realized'), value: kpis.realized, accent: '#059669', tint: '#ecfdf5' },
  ];

  const selectCls =
    'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading && rows.length === 0 && !error) {
    return (
      <div className="min-h-[40vh] px-1 py-2">
        <ListSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="text-slate-900 w-full min-w-0 max-w-full">
      <style>{`
        .acd-card{border:1px solid #e2e8f0;border-top:3px solid var(--acd-accent,#cbd5e1);background:#fff;transition:border-color .15s,box-shadow .15s,transform .15s}
        .acd-card:hover{border-color:#c7d2fe;border-top-color:var(--acd-accent,#cbd5e1);box-shadow:0 2px 10px rgba(0,1,104,.08);transform:translateY(-1px)}
        .acd-card.active{border-color:#000168;border-top-color:var(--acd-accent,#000168);background:#f8fafc;box-shadow:0 0 0 1px #000168 inset}
        .acd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:20px}
        .acd-top{display:flex;flex-wrap:wrap;align-items:stretch;gap:12px;margin-bottom:16px}
        .acd-alert{flex:1 1 320px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid #fecdd3;border-left:4px solid #e11d48;background:#fff1f2;border-radius:12px;padding:10px 14px}
        .acd-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-left:auto}
        .acd-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
        .acd-filters input,.acd-filters select{min-width:0;width:100%}
        .acd-btn{padding:4px 10px;font-size:12px;line-height:1.25;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#334155;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
        .acd-btn:hover{background:#f8fafc;border-color:#c7d2fe;box-shadow:0 1px 4px rgba(0,1,104,.12)}
        .acd-btn-primary{background:#000168;color:#fff;border-color:#000168}
        .acd-btn-primary:hover{background:#00009e;border-color:#00009e}
      `}</style>

      <div className="w-full min-w-0">
        <div className="acd-top">
        {!embedded && kpis.delayed > 0 && (
          <div className="acd-alert">
            <div>
              <div className="text-sm font-semibold text-rose-800">
                {t('capaAlerts.bannerTitle', { count: kpis.delayed })}
              </div>
              <div className="text-xs text-rose-700/80 mt-0.5">{t('capaAlerts.bannerHint')}</div>
            </div>
            <button
              type="button"
              onClick={() => setActiveKpi('delayed')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700"
            >
              {t('capaAlerts.bannerCta')}
            </button>
          </div>
        )}

          {!embedded && <div className="acd-actions">
            <button type="button" onClick={() => void load()} className="acd-btn">
              {t('dashboard.refresh')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/action-plans/tracking?tab=follow-up')}
              className="acd-btn"
            >
              {t('nav.actionFollowUp')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/action-plans/create')}
              className="acd-btn acd-btn-primary"
            >
              + {t('admin.newPlan')}
            </button>
          </div>}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {embedded ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {cardDefs.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setActiveKpi((prev) => (prev === c.key ? 'all' : c.key))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                style={activeKpi === c.key ? { background: c.accent, borderColor: c.accent, color: '#fff' } : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}
              >
                {c.label} · <span className="tabular-nums">{c.value}</span>
              </button>
            ))}
          </div>
        ) : (
        <div className="acd-kpis">
          {cardDefs.map((c) => (
            <button
              key={c.key}
              type="button"
              style={{ ['--acd-accent' as string]: c.accent }}
              className={`acd-card text-left rounded-xl px-4 py-3 ${activeKpi === c.key ? 'active' : ''}`}
              onClick={() => {
                setActiveKpi((prev) => (prev === c.key ? 'all' : c.key));
                document.getElementById('acd-overdue-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: c.accent }}>{c.value}</div>
              <p className="text-xs mt-1 text-slate-500 leading-snug">
                {c.key === 'delayed' && t('dashboard.hintOverdue')}
                {c.key === 'pending' && t('dashboard.hintPending')}
                {c.key === 'inProgress' && t('dashboard.hintActive')}
                {c.key === 'realized' && t('dashboard.hintCompleted')}
              </p>
            </button>
          ))}
        </div>
        )}

        <div id="acd-overdue-table" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-semibold text-slate-900">{tableTitle}</h2>
                <span className="text-sm font-medium text-slate-500">
                  {t('capaDash.items', { count: filtered.length })}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t('dashboard.tableHint')}</p>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 acd-filters">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              className={`${selectCls} lg:col-span-1`}
            />
            <select value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value as any)} className={selectCls}>
              <option value="all">{t('dashboard.allUrgencies')}</option>
              <option value="high">{t('dashboard.urgencyHigh')}</option>
              <option value="medium">{t('dashboard.urgencyMedium')}</option>
              <option value="low">{t('dashboard.urgencyLow')}</option>
            </select>
            <select value={filterNature} onChange={(e) => setFilterNature(e.target.value as any)} className={selectCls}>
              <option value="all">{t('dashboard.allNatures')}</option>
              <option value="preventif">{t('dashboard.naturePreventive')}</option>
              <option value="correctif">{t('dashboard.natureCorrective')}</option>
              <option value="amelioration">{t('dashboard.natureImprovement')}</option>
            </select>
            <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className={selectCls}>
              <option value="all">{t('dashboard.allDepartments')}</option>
              {processes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              aria-label={t('capaDash.dueFrom')}
              title={t('capaDash.dueFrom')}
              className={selectCls}
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              aria-label={t('capaDash.dueTo')}
              title={t('capaDash.dueTo')}
              className={selectCls}
            />
            <select value={filterResponsible} onChange={(e) => setFilterResponsible(e.target.value)} className={selectCls}>
              <option value="all">{t('dashboard.allResponsibles')}</option>
              {responsibles.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-sm" style={{ minWidth: 1080 }}>
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3 font-semibold w-10">#</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colUrgency')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colTitle')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colClaim')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colNature')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colDepartment')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colResponsible')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colStatus')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colDays')}</th>
                  <th className="px-4 py-3 font-semibold">{t('dashboard.colDeadline')}</th>
                  <th className="px-4 py-3 font-semibold text-right">{t('dashboard.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      {t('dashboard.emptyTable')}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r, idx) => {
                    const urg = URGENCY_STYLE[r.urgency];
                    const nat = NATURE_STYLE[r.nature];
                    const tone = statusTone(r.bucket);
                    return (
                      <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-3 py-3 text-slate-400 tabular-nums text-xs">{rangeStart + idx}</td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold"
                            style={{ background: urg.bg, color: urg.color }}
                          >
                            {r.urgency === 'high'
                              ? t('dashboard.urgencyHigh')
                              : r.urgency === 'medium'
                                ? t('dashboard.urgencyMedium')
                                : t('dashboard.urgencyLow')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 max-w-[220px] truncate" title={r.title}>
                            {r.title}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {r.claimId && r.claimTitle ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-[#000168] hover:underline max-w-[160px] truncate text-left"
                              title={r.claimTitle}
                              onClick={() => navigate(`/pages/front/quality-analyses?focus=${r.claimId}`)}
                            >
                              {r.claimTitle}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ background: nat.bg, color: nat.color }}
                          >
                            {r.nature === 'preventif'
                              ? t('dashboard.naturePreventive')
                              : r.nature === 'correctif'
                                ? t('dashboard.natureCorrective')
                                : t('dashboard.natureImprovement')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{r.process}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-[150px]">
                            <UserAvatar name={r.responsibleName} size={28} />
                            <span className="text-slate-700 truncate">{r.responsibleName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-[120px]">
                            <span
                              className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold"
                              style={{ background: tone.bg, color: tone.color }}
                            >
                              {r.statusLabel}
                            </span>
                            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, r.progress))}%`, background: COFICAB }}
                              />
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{Math.round(r.progress)}%</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums font-semibold text-red-700">
                          {r.daysLate > 0 ? r.daysLate : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-red-700 font-medium">{formatDate(r.deadline)}</span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="acd-btn"
                            onClick={() => navigate(`/pages/front/action-plans/${r.actionPlanId}`)}
                          >
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>{rangeStart}–{rangeEnd} sur {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="tabular-nums">{currentPage} / {pageCount}</span>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
