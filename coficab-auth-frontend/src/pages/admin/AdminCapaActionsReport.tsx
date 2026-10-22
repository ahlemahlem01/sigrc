import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getUsersForAssignment } from '../../services/actionPlanService';
import { FlatAction, loadCapaDataset, UiType } from './capaAnalytics';
import { fixMojibake } from '../../utils/textEncoding';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { buildReportSummary, previousPeriod } from '../../utils/reportSummary';
import { CapaPageHeader, capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import { ListSkeleton } from '../../components/TableSkeleton';

const COFICAB = '#000168';

type GroupBy = 'responsible' | 'process' | 'nature' | 'status' | 'plan';
type StatusFilter = 'all' | 'open' | 'closed' | 'late';
type DateField = 'created' | 'deadline';

type Criteria = {
  from: string;
  to: string;
  groupBy: GroupBy;
  status: StatusFilter;
  dateField: DateField;
  process: string;
  nature: 'all' | UiType;
  responsible: string;
  q: string;
};

type GroupRow = {
  key: string;
  label: string;
  total: number;
  closed: number;
  late: number;
  open: number;
  rate: number;
  actions: FlatAction[];
};

type GeneratedReport = {
  generatedAt: string;
  criteria: Criteria;
  actions: FlatAction[];
  groups: GroupRow[];
  totals: { total: number; closed: number; late: number; open: number; groups: number; rate: number };
  /** the same filters over the period just before: for the comparison of the summary */
  previous?: { total: number; closed: number; late: number; open: number; groups: number; rate: number } | null;
};

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

function inRange(iso: string | undefined, from: string, to: string) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const start = new Date(from).setHours(0, 0, 0, 0);
  const end = new Date(to).setHours(23, 59, 59, 999);
  return t >= start && t <= end;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function defaultCriteria(): Criteria {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return {
    from: toDateInput(from),
    to: toDateInput(to),
    groupBy: 'responsible',
    status: 'all',
    dateField: 'created',
    process: 'all',
    nature: 'all',
    responsible: 'all',
    q: '',
  };
}

export default function AdminCapaActionsReport({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allActions, setAllActions] = useState<FlatAction[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<Criteria>(() => defaultCriteria());
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [data, users] = await Promise.all([
        loadCapaDataset(accessToken),
        getUsersForAssignment(accessToken).catch(() => []),
      ]);
      setAllActions(data.actions);
      const map: Record<string, string> = {};
      const userList = Array.isArray(users) ? users : [];
      for (const u of userList as any[]) {
        const id = String(u.id || '');
        if (!id) continue;
        map[id] = u.fullName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || id;
      }
      setNames(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('actionsReport.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const typeLabel = useCallback((ty: UiType) => (
    ty === 'preventif' ? t('dashboard.naturePreventive')
      : ty === 'correctif' ? t('dashboard.natureCorrective')
        : t('dashboard.natureImprovement')
  ), [t]);

  const statusLabel = useCallback((a: FlatAction) => (
    a.closed ? t('reportPlans.statusClosed')
      : a.late ? t('followUp.tabBelated')
        : t('reportPlans.statusOpened')
  ), [t]);

  const processes = useMemo(
    () => Array.from(new Set(allActions.map((a) => a.process).filter((p) => p && p !== '—'))).sort(),
    [allActions],
  );

  const responsibles = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allActions) {
      if (!a.assignedToId) continue;
      map.set(
        a.assignedToId,
        a.assignedToName || names[a.assignedToId] || a.assignedToId.slice(0, 8),
      );
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], i18n.language));
  }, [allActions, names, i18n.language]);

  const applyPreset = (preset: '7d' | '1m' | '3m' | '1y' | 'ytd') => {
    const to = new Date();
    const from = new Date();
    if (preset === '7d') from.setDate(from.getDate() - 7);
    else if (preset === '1m') from.setMonth(from.getMonth() - 1);
    else if (preset === '3m') from.setMonth(from.getMonth() - 3);
    else if (preset === '1y') from.setFullYear(from.getFullYear() - 1);
    else from.setMonth(0, 1);
    setDraft((c) => ({ ...c, from: toDateInput(from), to: toDateInput(to) }));
  };

  const buildReport = useCallback((criteria: Criteria, source: FlatAction[]): GeneratedReport => {
    const term = criteria.q.trim().toLowerCase();
    const filtered = source.filter((a) => {
      const dateIso = criteria.dateField === 'deadline' ? a.deadline : (a.createdAt || a.deadline);
      if (!inRange(dateIso, criteria.from, criteria.to)) return false;
      if (criteria.process !== 'all' && a.process !== criteria.process) return false;
      if (criteria.nature !== 'all' && a.type !== criteria.nature) return false;
      if (criteria.responsible !== 'all') {
        if (criteria.responsible === '__unassigned__') {
          if (a.assignedToId) return false;
        } else if (a.assignedToId !== criteria.responsible) return false;
      }
      if (criteria.status === 'open' && a.closed) return false;
      if (criteria.status === 'closed' && !a.closed) return false;
      if (criteria.status === 'late' && !a.late) return false;
      if (term) {
        const hay = `${a.title} ${a.planTitle} ${a.process} ${a.assignedToName || ''} ${a.planCode || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    const map = new Map<string, FlatAction[]>();
    for (const a of filtered) {
      let key = '—';
      if (criteria.groupBy === 'responsible') key = a.assignedToId || '__unassigned__';
      else if (criteria.groupBy === 'process') key = a.process || '—';
      else if (criteria.groupBy === 'nature') key = a.type;
      else if (criteria.groupBy === 'status') key = a.closed ? 'closed' : a.late ? 'late' : 'open';
      else key = a.planId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const groups: GroupRow[] = Array.from(map.entries()).map(([key, list]) => {
      const closed = list.filter((x) => x.closed).length;
      const late = list.filter((x) => x.late).length;
      let label = key;
      if (criteria.groupBy === 'responsible') {
        label = key === '__unassigned__'
          ? t('dashboard.unassigned')
          : (list[0]?.assignedToName || names[key] || key.slice(0, 8));
      } else if (criteria.groupBy === 'nature') {
        label = typeLabel(key as UiType);
      } else if (criteria.groupBy === 'status') {
        label = key === 'closed'
          ? t('reportPlans.statusClosed')
          : key === 'late'
            ? t('followUp.tabBelated')
            : t('reportPlans.statusOpened');
      } else if (criteria.groupBy === 'plan') {
        label = fixMojibake(list[0]?.planTitle || key.slice(0, 8));
      }
      return {
        key,
        label,
        total: list.length,
        closed,
        late,
        open: list.length - closed,
        rate: list.length ? Math.round((closed / list.length) * 100) : 0,
        actions: list,
      };
    }).sort((a, b) => b.total - a.total);

    const total = filtered.length;
    const closed = filtered.filter((a) => a.closed).length;
    const late = filtered.filter((a) => a.late).length;
    return {
      generatedAt: new Date().toISOString(),
      criteria: { ...criteria },
      actions: filtered,
      groups,
      totals: {
        total,
        closed,
        late,
        open: total - closed,
        groups: groups.length,
        rate: total ? Math.round((closed / total) * 100) : 0,
      },
    };
  }, [names, t, typeLabel]);

  const generate = () => {
    if (draft.from > draft.to) {
      setError(t('actionsReport.invalidRange'));
      return;
    }
    setError(null);
    setGenerating(true);
    setExpanded(null);
    // slight defer so UI shows generating state
    window.setTimeout(() => {
      const prev = previousPeriod(draft.from, draft.to);
      setReport({ ...buildReport(draft, allActions), previous: buildReport({ ...draft, from: prev.from, to: prev.to }, allActions).totals });
      setGenerating(false);
    }, 180);
  };

  const resetForm = () => {
    setDraft(defaultCriteria());
    setReport(null);
    setExpanded(null);
    setError(null);
  };

  const exportCsv = () => {
    if (!report) return;
    const header = ['group', 'action', 'plan', 'code', 'process', 'nature', 'progress', 'deadline', 'responsible', 'status'];
    const rows: string[][] = [];
    for (const g of report.groups) {
      for (const a of g.actions) {
        rows.push([
          g.label,
          a.title,
          a.planTitle,
          a.planCode || '',
          a.process,
          typeLabel(a.type),
          String(a.progress),
          a.deadline || '',
          a.assignedToId ? (names[a.assignedToId] || a.assignedToName || a.assignedToId) : (a.assignedToName || ''),
          a.closed ? 'closed' : a.late ? 'late' : 'open',
        ]);
      }
    }
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header.join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `actions-report-${report.criteria.from}_${report.criteria.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryOf = (r: GeneratedReport) =>
    buildReportSummary(t, t('reportSummary.nounActions'), r.totals, r.previous, r.groups.map((g) => ({ label: g.label, total: g.total, late: g.late, rate: g.rate })));

  const exportPdf = () => {
    if (!report) return;
    const c = report.criteria;
    exportCapaPdf({
      title: t('actionsReport.title'),
      subtitle: t('actionsReport.generatedSubtitle'),
      filename: `actions-report-${c.from}_${c.to}`,
      meta: [
        `${t('actionsReport.generatedAt')}: ${new Date(report.generatedAt).toLocaleString(i18n.language)}`,
        `${t('actionsReport.from')}: ${c.from} → ${t('actionsReport.to')}: ${c.to} (${t('actionsReport.dateField')}: ${c.dateField === 'deadline' ? t('actionsReport.dateDeadline') : t('actionsReport.dateCreated')})`,
        `${t('actionsReport.groupBy')}: ${t(`actionsReport.by.${c.groupBy}`)} · ${t('actionsReport.status')}: ${t(`actionsReport.statusOpt.${c.status}`)}`,
        [
          c.process !== 'all' ? `${t('planDetail.department')}: ${c.process}` : '',
          c.nature !== 'all' ? `${t('dashboard.colNature')}: ${typeLabel(c.nature)}` : '',
          c.responsible !== 'all' ? `${t('dashboard.colResponsible')}: ${c.responsible === '__unassigned__' ? t('dashboard.unassigned') : (names[c.responsible] || c.responsible)}` : '',
          c.q ? `${t('actionsReport.search')}: ${c.q}` : '',
        ].filter(Boolean).join(' · '),
        `${t('actionsReport.kpiActions')}: ${report.totals.total} · ${t('actionsReport.kpiClosed')}: ${report.totals.closed} · ${t('actionsReport.kpiLate')}: ${report.totals.late} · ${t('indicators.kpiRate')}: ${report.totals.rate}%`,
      ].filter(Boolean),
      summary: [
        ...summaryOf(report),
        '',
        ...report.groups.map((g) => `${g.label}: ${g.total} (${t('actionsReport.kpiClosed').toLowerCase()} ${g.closed}, ${t('actionsReport.kpiLate').toLowerCase()} ${g.late}, ${g.rate}%)`),
      ].join('\n'),
      columns: [
        { key: 'group', label: t('actionsReport.colGroup') },
        { key: 'action', label: t('associatedActions.colAction') },
        { key: 'plan', label: t('associatedActions.colPlan') },
        { key: 'process', label: t('dashboard.colProcess') },
        { key: 'nature', label: t('dashboard.colNature') },
        { key: 'progress', label: t('reportPlans.colProgress') },
        { key: 'deadline', label: t('dashboard.colDeadline') },
        { key: 'responsible', label: t('dashboard.colResponsible') },
        { key: 'status', label: t('dashboard.colStatus') },
      ],
      rows: report.groups.flatMap((g) => g.actions.map((a) => ({
        group: g.label,
        action: fixMojibake(a.title),
        plan: fixMojibake(a.planTitle),
        process: a.process,
        nature: typeLabel(a.type),
        progress: `${a.progress}%`,
        deadline: formatDate(a.deadline),
        responsible: a.assignedToId
          ? (names[a.assignedToId] || a.assignedToName || a.assignedToId)
          : (a.assignedToName || t('dashboard.unassigned')),
        status: statusLabel(a),
      }))),
    });
  };

  const summaryLines = report ? summaryOf(report) : [];

  const selectCls =
    'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading) {
    return (
      <div className="text-slate-900">
        {!embedded && (
          <CapaPageHeader
            eyebrow={t('actionsReport.eyebrow')}
            title={t('actionsReport.title')}
            subtitle={t('actionsReport.subtitle')}
          />
        )}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <ListSkeleton rows={8} />
        </div>
      </div>
    );
  }

  const headerButtons = (
    <>
            <button type="button" onClick={() => void load()} className={capaBtnSecondary}>
              {t('dashboard.refresh')}
            </button>
            <button
              type="button"
              disabled={!report}
              onClick={exportCsv}
              className={`${capaBtnSecondary} disabled:opacity-40`}
            >
              {t('actionsReport.exportCsv')}
            </button>
            <button
              type="button"
              disabled={!report}
              onClick={exportPdf}
              className={`${capaBtnSecondary} disabled:opacity-40`}
            >
              {t('common.exportPdf')}
            </button>
          </>
  );

  return (
    <div className={embedded ? 'text-slate-900' : 'text-slate-900 max-w-7xl mx-auto'}>
      {embedded ? (
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#000168] m-0">{t('actionsReport.sectionTitle')}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-0">{t('actionsReport.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">{headerButtons}</div>
        </div>
      ) : (
        <CapaPageHeader
          eyebrow={t('actionsReport.eyebrow')}
          title={t('actionsReport.title')}
          subtitle={t('actionsReport.subtitle')}
          actions={headerButtons}
        />
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* On-demand criteria panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t('actionsReport.criteriaTitle')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('actionsReport.criteriaHint')}</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200">
            {(['7d', '1m', '3m', '1y', 'ytd'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-slate-600 hover:bg-white hover:text-[#000168]"
              >
                {t(`actionsReport.preset.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('actionsReport.from')}
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((c) => ({ ...c, from: e.target.value }))}
              className={`${selectCls} mt-1 w-full`}
            />
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('actionsReport.to')}
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((c) => ({ ...c, to: e.target.value }))}
              className={`${selectCls} mt-1 w-full`}
            />
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('actionsReport.dateField')}
            <select
              value={draft.dateField}
              onChange={(e) => setDraft((c) => ({ ...c, dateField: e.target.value as DateField }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="created">{t('actionsReport.dateCreated')}</option>
              <option value="deadline">{t('actionsReport.dateDeadline')}</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('actionsReport.groupBy')}
            <select
              value={draft.groupBy}
              onChange={(e) => setDraft((c) => ({ ...c, groupBy: e.target.value as GroupBy }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="responsible">{t('actionsReport.by.responsible')}</option>
              <option value="process">{t('actionsReport.by.process')}</option>
              <option value="nature">{t('actionsReport.by.nature')}</option>
              <option value="status">{t('actionsReport.by.status')}</option>
              <option value="plan">{t('actionsReport.by.plan')}</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('actionsReport.status')}
            <select
              value={draft.status}
              onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value as StatusFilter }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="all">{t('actionsReport.statusOpt.all')}</option>
              <option value="open">{t('actionsReport.statusOpt.open')}</option>
              <option value="closed">{t('actionsReport.statusOpt.closed')}</option>
              <option value="late">{t('actionsReport.statusOpt.late')}</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('planDetail.department')}
            <select
              value={draft.process}
              onChange={(e) => setDraft((c) => ({ ...c, process: e.target.value }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="all">{t('audit.allDepartments')}</option>
              {processes.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('dashboard.colNature')}
            <select
              value={draft.nature}
              onChange={(e) => setDraft((c) => ({ ...c, nature: e.target.value as Criteria['nature'] }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="all">{t('dashboard.allNatures')}</option>
              <option value="preventif">{t('dashboard.naturePreventive')}</option>
              <option value="correctif">{t('dashboard.natureCorrective')}</option>
              <option value="amelioration">{t('dashboard.natureImprovement')}</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {t('dashboard.colResponsible')}
            <select
              value={draft.responsible}
              onChange={(e) => setDraft((c) => ({ ...c, responsible: e.target.value }))}
              className={`${selectCls} mt-1 w-full`}
            >
              <option value="all">{t('dashboard.allResponsibles')}</option>
              <option value="__unassigned__">{t('dashboard.unassigned')}</option>
              {responsibles.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide sm:col-span-2 lg:col-span-4">
            {t('actionsReport.search')}
            <input
              value={draft.q}
              onChange={(e) => setDraft((c) => ({ ...c, q: e.target.value }))}
              placeholder={t('actionsReport.searchPh')}
              className={`${selectCls} mt-1 w-full`}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={generate}
            disabled={generating || allActions.length === 0}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ background: COFICAB }}
          >
            {generating ? t('actionsReport.generating') : t('actionsReport.generate')}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            {t('common.reset')}
          </button>
          <span className="text-xs text-slate-400 ml-auto">
            {t('actionsReport.sourceCount', { count: allActions.length })}
          </span>
        </div>
      </div>

      {!report && !generating && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">{t('actionsReport.awaitTitle')}</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{t('actionsReport.awaitHint')}</p>
        </div>
      )}

      {generating && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-600">{t('actionsReport.generating')}</div>
        </div>
      )}

      {report && !generating && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-xs text-slate-500">
              {t('actionsReport.generatedAt')}:{' '}
              <span className="font-semibold text-slate-700">
                {new Date(report.generatedAt).toLocaleString()}
              </span>
              {' · '}
              {report.criteria.from} → {report.criteria.to}
              {' · '}
              {t(`actionsReport.by.${report.criteria.groupBy}`)}
            </div>
            <button
              type="button"
              onClick={generate}
              className="text-xs font-semibold text-[#000168] hover:underline"
            >
              {t('actionsReport.regenerate')}
            </button>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#000168] mb-1.5">{t('reportSummary.title')}</div>
            <ul className="m-0 pl-4 space-y-1 text-sm text-slate-700">
              {summaryLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {report.previous && <p className="text-[11px] text-slate-500 mt-2 mb-0">{t('reportSummary.comparedWith', { from: previousPeriod(report.criteria.from, report.criteria.to).from, to: previousPeriod(report.criteria.from, report.criteria.to).to })}</p>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-5">
            {[
              { label: t('actionsReport.kpiActions'), value: report.totals.total },
              { label: t('actionsReport.kpiClosed'), value: report.totals.closed },
              { label: t('actionsReport.kpiLate'), value: report.totals.late },
              { label: t('actionsReport.kpiOpen'), value: report.totals.open },
              { label: t('indicators.kpiRate'), value: `${report.totals.rate}%` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-3 text-white" style={{ background: COFICAB }}>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                {t('actionsReport.resultTitle')} · {report.totals.groups} {t('actionsReport.kpiGroups').toLowerCase()}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.colGroup')}</th>
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.kpiActions')}</th>
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.kpiClosed')}</th>
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.kpiLate')}</th>
                    <th className="px-4 py-3 font-semibold">{t('indicators.kpiRate')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('dashboard.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('actionsReport.empty')}</td>
                    </tr>
                  ) : (
                    report.groups.map((g) => (
                      <React.Fragment key={g.key}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-900">{g.label}</td>
                          <td className="px-4 py-3 tabular-nums">{g.total}</td>
                          <td className="px-4 py-3 tabular-nums text-emerald-700">{g.closed}</td>
                          <td className="px-4 py-3 tabular-nums text-rose-600">{g.late}</td>
                          <td className="px-4 py-3 min-w-[120px]">
                            <div className="text-xs text-slate-500 mb-1 tabular-nums">{g.rate}%</div>
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${g.rate}%`, background: COFICAB }} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="text-xs font-semibold text-[#000168] hover:underline"
                              onClick={() => setExpanded(expanded === g.key ? null : g.key)}
                            >
                              {expanded === g.key ? t('actionsReport.hide') : t('actionsReport.details')}
                            </button>
                          </td>
                        </tr>
                        {expanded === g.key && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="space-y-2">
                                {g.actions.map((a) => (
                                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-slate-900 truncate">{fixMojibake(a.title)}</div>
                                      <div className="text-[11px] text-slate-500 truncate">
                                        {fixMojibake(a.planTitle)}
                                        {a.planCode ? ` · ${a.planCode}` : ''}
                                        {' · '}{a.process}
                                        {' · '}{typeLabel(a.type)}
                                        {' · '}{formatDate(a.deadline)}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[11px] tabular-nums text-slate-500">{a.progress}%</span>
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                        a.closed ? 'bg-emerald-50 text-emerald-700'
                                          : a.late ? 'bg-rose-50 text-rose-700'
                                            : 'bg-blue-50 text-blue-700'
                                      }`}>
                                        {statusLabel(a)}
                                      </span>
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-[#000168] hover:underline"
                                        onClick={() => navigate(`/admin/action-plans/${a.planId}`)}
                                      >
                                        {t('dashboard.openPlan')}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
