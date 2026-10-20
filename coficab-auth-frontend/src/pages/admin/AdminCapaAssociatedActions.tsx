import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { FlatAction, loadCapaDataset, PlanRow, UiType } from './capaAnalytics';
import { fixMojibake } from '../../utils/textEncoding';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { CapaPageHeader } from '../../components/capa/CapaAdminUi';
import { ListSkeleton } from '../../components/TableSkeleton';

const COFICAB = '#000168';
const PAGE_SIZE = 8;

const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200 disabled:opacity-40';
const btnPrimary =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white hover:bg-[#00009e]';

type PlanGroup = {
  plan: PlanRow;
  actions: FlatAction[];
  late: number;
  open: number;
  closed: number;
  toValidate: number;
  daysLate: number;
};

const DAY = 86400000;
const daysSince = (iso?: string) => {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / DAY));
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function AdminCapaAssociatedActions({ embedded = false, focus }: { embedded?: boolean; focus?: 'late' | 'noActions' }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [actions, setActions] = useState<FlatAction[]>([]);
  const [q, setQ] = useState('');
  const [filterProcess, setFilterProcess] = useState('all');
  const [filterPlan, setFilterPlan] = useState(searchParams.get('planId') || 'all');
  const [lateOnly, setLateOnly] = useState(focus === 'late');
  const [noActionsOnly, setNoActionsOnly] = useState(focus === 'noActions');
  const [expanded, setExpanded] = useState<string | null>(searchParams.get('planId'));
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadCapaDataset(accessToken);
      setPlans(data.plans);
      setActions(data.actions);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('associatedActions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const typeLabel = (ty: UiType) =>
    ty === 'preventif' ? t('dashboard.naturePreventive')
      : ty === 'correctif' ? t('dashboard.natureCorrective')
        : t('dashboard.natureImprovement');

  const processes = useMemo(
    () => Array.from(new Set(actions.map((a) => a.process).filter((p) => p && p !== '—'))).sort(),
    [actions],
  );

  const filteredActions = useMemo(() => {
    const term = q.trim().toLowerCase();
    return actions.filter((a) => {
      if (filterPlan !== 'all' && a.planId !== filterPlan) return false;
      if (filterProcess !== 'all' && a.process !== filterProcess) return false;
      if (lateOnly && !a.late) return false;
      if (!term) return true;
      return (
        a.title.toLowerCase().includes(term) ||
        a.planTitle.toLowerCase().includes(term) ||
        (a.planCode || '').toLowerCase().includes(term) ||
        a.process.toLowerCase().includes(term) ||
        (a.assignedToName || '').toLowerCase().includes(term) ||
        (a.claimId || '').toLowerCase().includes(term)
      );
    });
  }, [actions, q, filterPlan, filterProcess, lateOnly]);

  const groups = useMemo((): PlanGroup[] => {
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const byPlan = new Map<string, FlatAction[]>();
    for (const a of filteredActions) {
      if (!byPlan.has(a.planId)) byPlan.set(a.planId, []);
      byPlan.get(a.planId)!.push(a);
    }
    const rows: PlanGroup[] = [];
    // A plan without any detailed action is still a plan to follow: its delay is the plan's own deadline.
    const term = q.trim().toLowerCase();
    const now = Date.now();
    plans.forEach((p) => {
      if (byPlan.has(p.id) || p.archived || p.status === 'closed') return;
      if (filterPlan !== 'all' && p.id !== filterPlan) return;
      if (filterProcess !== 'all' && p.process !== filterProcess) return;
      const planLate = !!p.deadline && new Date(p.deadline).getTime() < now;
      if (lateOnly && !planLate) return;
      if (term && ![p.title, p.code, p.process, p.claimId, p.assignedToName].some((v) => (v || '').toLowerCase().includes(term))) return;
      rows.push({ plan: p, actions: [], late: planLate ? 1 : 0, open: 0, closed: 0, toValidate: 0, daysLate: planLate ? daysSince(p.deadline) : 0 });
    });
    Array.from(byPlan.entries()).forEach(([planId, list]) => {
      const plan = planMap.get(planId) || {
        id: planId,
        title: list[0]?.planTitle || '—',
        type: list[0]?.type || 'preventif',
        status: 'ongoing' as const,
        progress: 0,
        process: list[0]?.process || '—',
        code: list[0]?.planCode,
        claimId: list[0]?.claimId,
        actions: list,
      };
      const lateList = list.filter((x: FlatAction) => x.late);
      const planLate = !!plan.deadline && plan.status !== 'closed' && new Date(plan.deadline).getTime() < now;
      rows.push({
        plan,
        actions: list,
        late: lateList.length,
        open: list.filter((x: FlatAction) => !x.closed).length,
        closed: list.filter((x: FlatAction) => x.closed).length,
        toValidate: list.filter((x: FlatAction) => x.progressKind === 'closed').length,
        daysLate: Math.max(planLate ? daysSince(plan.deadline) : 0, ...lateList.map((x: FlatAction) => daysSince(x.deadline))),
      });
    });
    // "To handle": open plans that are late, have an action to validate, or have no detailed action
    return rows
      .filter((g) => !noActionsOnly || g.actions.length === 0)
      .filter((g) => !g.plan.archived && g.plan.status !== 'closed' && (g.late > 0 || g.toValidate > 0 || g.actions.length === 0))
      .sort((a, b) => b.daysLate - a.daysLate || b.toValidate - a.toValidate);
  }, [filteredActions, plans, q, filterPlan, filterProcess, lateOnly, noActionsOnly]);

  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageGroups = groups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totals = useMemo(() => ({
    plans: groups.length,
    actions: filteredActions.length,
    late: filteredActions.filter((a) => a.late).length,
    open: filteredActions.filter((a) => !a.closed).length,
  }), [groups, filteredActions]);

  const onPlanFilter = (planId: string) => {
    setPage(1);
    setFilterPlan(planId);
    setExpanded(planId === 'all' ? null : planId);
    const next = new URLSearchParams(searchParams);
    if (planId === 'all') next.delete('planId');
    else next.set('planId', planId);
    setSearchParams(next, { replace: true });
  };

  const exportPdf = () => {
    exportCapaPdf({
      title: t('associatedActions.title'),
      subtitle: t('associatedActions.subtitle'),
      filename: 'capa-associated-actions',
      meta: [
        `${t('associatedActions.kpiPlans')}: ${totals.plans}`,
        `${t('associatedActions.kpiActions')}: ${totals.actions}`,
        `${t('associatedActions.kpiLate')}: ${totals.late}`,
      ],
      columns: [
        { key: 'plan', label: t('associatedActions.colPlan') },
        { key: 'code', label: t('associatedActions.colCode') },
        { key: 'action', label: t('associatedActions.colAction') },
        { key: 'process', label: t('dashboard.colProcess') },
        { key: 'nature', label: t('dashboard.colNature') },
        { key: 'responsible', label: t('dashboard.colResponsible') },
        { key: 'deadline', label: t('dashboard.colDeadline') },
        { key: 'status', label: t('dashboard.colStatus') },
      ],
      rows: filteredActions.map((a) => ({
        plan: fixMojibake(a.planTitle),
        code: a.planCode || '—',
        action: fixMojibake(a.title),
        process: a.process,
        nature: typeLabel(a.type),
        responsible: a.assignedToName || t('dashboard.unassigned'),
        deadline: formatDate(a.deadline),
        status: a.closed ? t('reportPlans.statusClosed') : a.late ? t('followUp.tabBelated') : t('reportPlans.statusOpened'),
      })),
    });
  };

  const selectCls =
    'mt-1 w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading) {
    return (
      <div className="min-h-[40vh] px-2 py-4">
        <ListSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div id="capa-focus-list" className="text-slate-900 w-full min-w-0 max-w-full">
      {embedded ? (
        <div className="flex justify-end mb-3">
          <button type="button" onClick={exportPdf} className={btn}>{t('common.exportPdf')}</button>
        </div>
      ) : (
      <CapaPageHeader
        eyebrow={t('associatedActions.eyebrow')}
        title={t('associatedActions.title')}
        subtitle={t('associatedActions.subtitle')}
        actions={
          <>
            <button type="button" onClick={() => void load()} className={btn}>
              {t('dashboard.refresh')}
            </button>
            <button type="button" onClick={exportPdf} className={btn}>
              {t('common.exportPdf')}
            </button>
          </>
        }
      />
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {!embedded && <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
        {[
          { label: t('associatedActions.kpiPlans'), value: totals.plans },
          { label: t('associatedActions.kpiActions'), value: totals.actions },
          { label: t('associatedActions.kpiOpen'), value: totals.open },
          { label: t('associatedActions.kpiLate'), value: totals.late },
        ].map((s) => (
          <div key={s.label} className="rounded-xl px-3 py-3 text-white" style={{ background: COFICAB }}>
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>}

      <div className="bg-white border border-slate-200 rounded-2xl px-3 py-2.5 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide lg:col-span-2">
          {t('associatedActions.search')}
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('associatedActions.searchPh')} className={selectCls} />
        </label>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide min-w-0">
          {t('associatedActions.filterPlan')}
          <select value={filterPlan} onChange={(e) => onPlanFilter(e.target.value)} className={selectCls}>
            <option value="all">{t('associatedActions.allPlans')}</option>
            {plans.map((p) => {
              const label = fixMojibake(p.title);
              return (
                <option key={p.id} value={p.id} title={label}>
                  {label.length > 42 ? `${label.slice(0, 42)}…` : label}
                </option>
              );
            })}
          </select>
        </label>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide min-w-0">
          {t('dashboard.colDepartment')}
          <select value={filterProcess} onChange={(e) => { setFilterProcess(e.target.value); setPage(1); }} className={selectCls}>
            <option value="all">{t('dashboard.allDepartments')}</option>
            {processes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700 pb-1 cursor-pointer select-none">
          <input type="checkbox" checked={lateOnly} onChange={(e) => { setLateOnly(e.target.checked); setPage(1); }} className="rounded border-slate-300" />
          {t('associatedActions.lateOnly')}
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700 pb-1 cursor-pointer select-none">
          <input type="checkbox" checked={noActionsOnly} onChange={(e) => { setNoActionsOnly(e.target.checked); setPage(1); }} className="rounded border-slate-300" />
          Sans action détaillée
        </label>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Plans à traiter</h2>
          <span className="text-sm text-slate-500">{groups.length} {groups.length > 1 ? 'plans' : 'plan'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Département</th>
                <th className="px-4 py-3 font-semibold">Responsable</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
                <th className="px-4 py-3 font-semibold">En retard</th>
                <th className="px-4 py-3 font-semibold">À valider</th>
                <th className="px-4 py-3 font-semibold">Retard</th>
                <th className="px-4 py-3 font-semibold text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">{t('associatedActions.empty')}</td>
                </tr>
              ) : (
                pageGroups.map((g) => (
                  <React.Fragment key={g.plan.id}>
                    <tr className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 truncate" title={fixMojibake(g.plan.title)}>
                          {fixMojibake(g.plan.title)}
                        </div>
                        <div className="mt-1 h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, g.plan.progress || 0))}%`, background: COFICAB }} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                          {typeLabel(g.plan.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{g.plan.process}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{g.plan.assignedToName || g.plan.ownerName || <span className="text-slate-400">Non assigné</span>}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex min-w-[28px] justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-slate-100 text-slate-700">{g.actions.length}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex min-w-[28px] justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-rose-50 text-rose-700">{g.late}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex min-w-[28px] justify-center px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-amber-50 text-amber-700">{g.toValidate}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold tabular-nums text-rose-700">{g.daysLate > 0 ? `${g.daysLate} j` : '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            className={btn}
                            onClick={() => setExpanded(expanded === g.plan.id ? null : g.plan.id)}
                          >
                            {expanded === g.plan.id ? t('associatedActions.hideActions') : t('associatedActions.showActions')}
                          </button>
                          <button
                            type="button"
                            className={btnPrimary}
                            onClick={() => navigate(`/admin/action-plans/${g.plan.id}`)}
                          >
                            Ouvrir
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === g.plan.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={9} className="px-4 py-3">
                          <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <thead>
                              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                                <th className="px-3 py-2 font-semibold">Action</th>
                                <th className="px-3 py-2 font-semibold">Responsable</th>
                                <th className="px-3 py-2 font-semibold">Échéance</th>
                                <th className="px-3 py-2 font-semibold">Avancement</th>
                                <th className="px-3 py-2 font-semibold">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.actions.length === 0 && (
                                <tr><td colSpan={5} className="px-3 py-3 text-slate-500">Aucune action détaillée : le retard est celui du plan.</td></tr>
                              )}
                              {g.actions.map((a) => (
                                <tr key={a.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2 font-medium text-slate-900 max-w-[240px] truncate">{fixMojibake(a.title)}</td>
                                  <td className="px-3 py-2 text-slate-600">{a.assignedToName || t('dashboard.unassigned')}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(a.deadline)}</td>
                                  <td className="px-3 py-2 w-36">
                                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, a.progress))}%`, background: COFICAB }} />
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{Math.round(a.progress)}%</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                      a.closed ? 'bg-emerald-50 text-emerald-700'
                                        : a.late ? 'bg-rose-50 text-rose-700'
                                          : 'bg-blue-50 text-blue-700'
                                    }`}>
                                      {a.closed ? 'Clôturée' : a.late ? 'En retard' : 'Ouverte'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {groups.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, groups.length)} sur {groups.length}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
            <span className="tabular-nums text-xs">{currentPage} / {pageCount}</span>
            <button type="button" className={btn} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</button>
          </div>
        </div>
      </div>
    </div>
  );
}
