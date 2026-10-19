import { PageSkeleton } from '../../components/TableSkeleton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { loadCapaDataset, PlanRow, UiType } from './capaAnalytics';
import { CapaPageHeader } from '../../components/capa/CapaAdminUi';
import { ExportSplit } from '../../components/ExportSplit';

const COFICAB = '#000168';
const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200';
const btnPrimary =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white border border-[#000168] hover:bg-[#00009e]';

type HelpId = 'plans' | 'correctif' | 'preventif' | 'amelioration';

export default function AdminCapaReportOfPlans() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [openHelp, setOpenHelp] = useState<HelpId | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadCapaDataset(accessToken);
      setPlans(data.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('reportPlans.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => {
    const byType = (type: UiType) => {
      const list = plans.filter((p) => p.type === type);
      const actions = list.flatMap((p) => p.actions);
      const closedA = actions.filter((a) => a.closed).length;
      return {
        plans: list.length,
        opened: list.filter((p) => p.status !== 'closed').length,
        closed: list.filter((p) => p.status === 'closed').length,
        actions: actions.length,
        actionsClosed: closedA,
        actionsOpened: actions.length - closedA,
        rate: actions.length ? Math.round((closedA / actions.length) * 100) : 0,
      };
    };
    return {
      total: plans.length,
      corrective: byType('correctif'),
      preventive: byType('preventif'),
      improvement: byType('amelioration'),
      proposed: plans.filter((p) => p.status === 'created').length,
      planRate: plans.length
        ? Math.round((plans.filter((p) => p.status === 'closed').length / plans.length) * 100)
        : 0,
    };
  }, [plans]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, { plans: number; actions: number; closed: number; late: number }>();
    for (const plan of plans) {
      const name = plan.process && plan.process !== '—' ? plan.process : t('reportPlans.noDepartment');
      const row = map.get(name) ?? { plans: 0, actions: 0, closed: 0, late: 0 };
      row.plans += 1;
      row.actions += plan.actions.length;
      row.closed += plan.actions.filter((a) => a.closed).length;
      row.late += plan.actions.filter((a) => a.late).length;
      map.set(name, row);
    }
    return Array.from(map.entries())
      .map(([name, row]) => ({
        name,
        ...row,
        rate: row.actions ? Math.round((row.closed / row.actions) * 100) : 0,
      }))
      .sort((a, b) => b.late - a.late || a.rate - b.rate);
  }, [plans, t]);

  const attention = useMemo(() => {
    const items: { key: string; label: string; plans: number; late: number; rate: number }[] = [];
    for (const dept of byDepartment) {
      if (dept.plans > 0 && dept.rate < 50) {
        items.push({ key: `dept-${dept.name}`, label: dept.name, plans: dept.plans, late: dept.late, rate: dept.rate });
      }
    }
    const types: { type: UiType; label: string; rate: number; late: number; plans: number }[] = [
      {
        type: 'correctif',
        label: t('reportPlans.cardCorrective'),
        rate: stats.corrective.rate,
        late: plans.filter((p) => p.type === 'correctif').flatMap((p) => p.actions).filter((a) => a.late).length,
        plans: plans.filter((p) => p.type === 'correctif').length,
      },
      {
        type: 'preventif',
        label: t('reportPlans.cardPreventive'),
        rate: stats.preventive.rate,
        late: plans.filter((p) => p.type === 'preventif').flatMap((p) => p.actions).filter((a) => a.late).length,
        plans: plans.filter((p) => p.type === 'preventif').length,
      },
      {
        type: 'amelioration',
        label: t('reportPlans.cardImprovement'),
        rate: stats.improvement.rate,
        late: plans.filter((p) => p.type === 'amelioration').flatMap((p) => p.actions).filter((a) => a.late).length,
        plans: plans.filter((p) => p.type === 'amelioration').length,
      },
    ];
    for (const kind of types) {
      if (kind.plans > 0 && kind.rate < 50) {
        items.push({ key: `type-${kind.type}`, label: kind.label, plans: kind.plans, late: kind.late, rate: kind.rate });
      }
    }
    return items.sort((a, b) => a.rate - b.rate || b.late - a.late);
  }, [byDepartment, plans, stats, t]);

  const explanations: Record<HelpId, string> = {
    plans: t('reportPlans.helpPlans'),
    correctif: t('reportPlans.helpCorrective'),
    preventif: t('reportPlans.helpPreventive'),
    amelioration: t('reportPlans.helpImprovement'),
  };

  if (loading) return <PageSkeleton figures={4} panels={2} />;

  return (
    <div className="text-slate-900 max-w-7xl mx-auto">
      <CapaPageHeader
        eyebrow={t('reportPlans.eyebrow')}
        title={t('reportPlans.title')}
        subtitle={t('reportPlans.subtitle')}
        actions={
          <>
            <ExportSplit
              className={btn}
              label={t('reportPlans.export')}
              filename="report-plans"
              getTable={() => ({
                columns: [t('planDetail.department'), t('reportPlans.colPlans'), t('common.actions'), t('reportPlans.colClosed'), t('reportPlans.colLate'), t('reportPlans.colRate')],
                rows: byDepartment.map((d) => [d.name, String(d.plans), String(d.actions), String(d.closed), String(d.late), `${d.rate}%`]),
              })}
            />
            <button
              type="button"
              onClick={() => navigate('/admin/action-plans/create')}
              className={btnPrimary}
            >
              + {t('admin.newPlan')}
            </button>
          </>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          {
            title: t('reportPlans.cardPlans'),
            value: stats.total,
            closed: plans.filter((p) => p.status === 'closed').length,
            opened: plans.filter((p) => p.status === 'ongoing').length,
            proposed: stats.proposed,
          },
          {
            title: t('reportPlans.cardCorrective'),
            value: stats.corrective.actions,
            closed: stats.corrective.actionsClosed,
            opened: stats.corrective.actionsOpened,
            proposed: 0,
          },
          {
            title: t('reportPlans.cardPreventive'),
            value: stats.preventive.actions,
            closed: stats.preventive.actionsClosed,
            opened: stats.preventive.actionsOpened,
            proposed: 0,
          },
          {
            title: t('reportPlans.cardImprovement'),
            value: stats.improvement.actions,
            closed: stats.improvement.actionsClosed,
            opened: stats.improvement.actionsOpened,
            proposed: 0,
          },
        ].map((c) => (
          <div key={c.title} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.title}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{c.value}</div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                {c.closed} {t('reportPlans.statusClosed')}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">
                {c.opened} {t('reportPlans.statusOpened')}
              </span>
              {c.proposed > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700">
                  {c.proposed} {t('reportPlans.statusProposed')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{t('reportPlans.closureRate')}</h2>
          <span className="text-[11px] text-emerald-600 font-medium">{t('reportPlans.live')}</span>
        </div>
        {[
          { id: 'plans' as HelpId, label: t('reportPlans.cardPlans'), rate: stats.planRate, color: '#3b82f6', frac: `${plans.filter((p) => p.status === 'closed').length}/${plans.length}` },
          { id: 'correctif' as HelpId, label: t('reportPlans.cardCorrective'), rate: stats.corrective.rate, color: '#f43f5e', frac: `${stats.corrective.actionsClosed}/${stats.corrective.actions}` },
          { id: 'preventif' as HelpId, label: t('reportPlans.cardPreventive'), rate: stats.preventive.rate, color: '#10b981', frac: `${stats.preventive.actionsClosed}/${stats.preventive.actions}` },
          { id: 'amelioration' as HelpId, label: t('reportPlans.cardImprovement'), rate: stats.improvement.rate, color: '#8b5cf6', frac: `${stats.improvement.actionsClosed}/${stats.improvement.actions}` },
        ].map((r) => (
          <div key={r.id} className="mb-3 last:mb-0">
            <div className="flex justify-between items-center gap-2 text-xs mb-1">
              <button
                type="button"
                className="font-medium text-slate-700 hover:text-[#000168]"
                onClick={() => setOpenHelp(openHelp === r.id ? null : r.id)}
              >
                {r.label}
              </button>
              <span className="tabular-nums text-slate-600">{r.rate}% · {r.frac}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${r.rate}%`, background: r.color }} />
            </div>
            {openHelp === r.id && (
              <p className="mt-2 text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {explanations[r.id]}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{t('reportPlans.byDeptTitle')}</h2>
          <p className="text-xs text-slate-500 mt-1">{t('reportPlans.byDeptSub')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">{t('planDetail.department')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colPlans')}</th>
                <th className="px-4 py-3 font-semibold">{t('common.actions')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colClosed')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colLate')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colRate')}</th>
              </tr>
            </thead>
            <tbody>
              {byDepartment.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('reportPlans.empty')}</td>
                </tr>
              ) : (
                byDepartment.map((d) => (
                  <tr key={d.name} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{d.plans}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{d.actions}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-700">{d.closed}</td>
                    <td className="px-4 py-3 tabular-nums text-rose-700">{d.late}</td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="text-xs text-slate-500 mb-1 tabular-nums">{d.rate}%</div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${d.rate}%`, background: COFICAB }} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mt-6">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 text-left"
          onClick={() => attention.length > 4 && setAttentionOpen((open) => !open)}
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t('reportPlans.attentionTitle')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('reportPlans.attentionSub')}</p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">{attention.length}</span>
        </button>
        {(attention.length <= 4 || attentionOpen) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {attention.length === 0 ? (
              <p className="text-sm text-slate-400 sm:col-span-2">{t('reportPlans.attentionEmpty')}</p>
            ) : (
              attention.map((item) => (
                <div key={item.key} className="border border-rose-200 bg-rose-50/60 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate" title={item.label}>{item.label}</div>
                  <div className="text-3xl font-bold text-rose-800 mt-1 tabular-nums">{item.rate}%</div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-slate-700">{t('reportPlans.plansCount', { count: item.plans })}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-rose-700">{t('reportPlans.lateCount', { count: item.late })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {attention.length > 4 && (
          <button
            type="button"
            className="mt-3 text-xs font-semibold text-[#000168] hover:underline"
            onClick={() => setAttentionOpen((open) => !open)}
          >
            {attentionOpen ? t('reportPlans.collapse') : t('reportPlans.showAll', { count: attention.length })}
          </button>
        )}
      </div>
    </div>
  );
}
