import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { loadCapaDataset, PlanRow, UiType } from './capaAnalytics';
import { fixMojibake } from '../../utils/textEncoding';
import { exportCapaPdf } from '../../utils/capaPdfExport';

const PAGE_SIZE = 12;
const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200';

const TYPE_BADGE: Record<UiType, { bg: string; color: string }> = {
  preventif: { bg: '#ecfdf5', color: '#047857' },
  correctif: { bg: '#fff1f2', color: '#be123c' },
  amelioration: { bg: '#f5f3ff', color: '#6d28d9' },
};

function fallbackCode(p: PlanRow): string {
  if (p.code) return p.code;
  const prefix = p.type === 'preventif' ? 'PA' : p.type === 'correctif' ? 'PAC' : 'PAP';
  const year = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
  return `${prefix}-${year}-${p.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export default function AdminCapaPlanReference() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState<'all' | UiType>('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadCapaDataset(accessToken);
      setPlans(data.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('planRef.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return plans.filter((p) => {
      if (filterType !== 'all' && p.type !== filterType) return false;
      if (!term) return true;
      const code = fallbackCode(p).toLowerCase();
      return (
        code.includes(term) ||
        fixMojibake(p.title).toLowerCase().includes(term) ||
        p.process.toLowerCase().includes(term) ||
        (p.assignedToName || '').toLowerCase().includes(term)
      );
    });
  }, [plans, q, filterType]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const typeLabel = (ty: UiType) =>
    ty === 'preventif' ? t('dashboard.naturePreventive')
      : ty === 'correctif' ? t('dashboard.natureCorrective')
        : t('dashboard.natureImprovement');

  const exportPdf = () => {
    exportCapaPdf({
      title: t('planRef.title'),
      subtitle: t('planRef.subtitle'),
      filename: 'capa-plan-reference',
      meta: [`${t('planRef.total')}: ${plans.length}`, `${t('planRef.shown')}: ${filtered.length}`],
      columns: [
        { key: 'code', label: t('planRef.colCode') },
        { key: 'title', label: t('reportPlans.colName') },
        { key: 'type', label: t('reportPlans.colType') },
        { key: 'process', label: t('dashboard.colProcess') },
        { key: 'responsible', label: t('dashboard.colResponsible') },
        { key: 'actions', label: t('associatedActions.kpiActions') },
        { key: 'progress', label: t('reportPlans.colProgress') },
      ],
      rows: filtered.map((p) => ({
        code: fallbackCode(p),
        title: fixMojibake(p.title),
        type: typeLabel(p.type),
        process: p.process,
        responsible: p.assignedToName || t('dashboard.unassigned'),
        actions: p.actions.length,
        progress: `${p.progress}%`,
      })),
    });
  };

  const selectCls =
    'px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="text-slate-900 w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#000168] mb-1">{t('planRef.eyebrow')}</p>
          <h1 className="text-2xl font-bold text-[#000168]">{t('planRef.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('planRef.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={btn}>
            {t('dashboard.refresh')}
          </button>
          <button type="button" onClick={exportPdf} className={btn}>
            Exporter PDF
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/audit-logs?module=capa')}
            className={btn}
          >
            {t('nav.capaHistory')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('planRef.total')}</div>
          <div className="text-2xl font-bold tabular-nums text-[#000168] mt-1">{plans.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('planRef.shown')}</div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{filtered.length}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('planRef.search')} className={selectCls} />
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value as UiType | 'all'); setPage(1); }} className={selectCls}>
            <option value="all">{t('reportPlans.allTypes')}</option>
            <option value="preventif">{t('dashboard.naturePreventive')}</option>
            <option value="correctif">{t('dashboard.natureCorrective')}</option>
            <option value="amelioration">{t('dashboard.natureImprovement')}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">{t('planRef.colCode')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colName')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportPlans.colType')}</th>
                <th className="px-4 py-3 font-semibold">{t('dashboard.colDepartment')}</th>
                <th className="px-4 py-3 font-semibold">{t('dashboard.colResponsible')}</th>
                <th className="px-4 py-3 font-semibold text-right">{t('dashboard.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('planRef.empty')}</td>
                </tr>
              ) : (
                pageRows.map((p) => {
                  const tb = TYPE_BADGE[p.type];
                  return (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <code className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-[#000168]">
                          {fallbackCode(p)}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 max-w-[240px] truncate">{fixMojibake(p.title)}</div>
                        <div className="text-[11px] text-slate-400">{t('planRef.actionsShort', { count: p.actions.length })} · {p.progress}%</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: tb.bg, color: tb.color }}>
                          {typeLabel(p.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{p.process}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {p.assignedToName || t('dashboard.unassigned')}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            className={btn}
                            onClick={() => navigate(`/admin/audit-logs?module=capa&planId=${p.id}`)}
                          >
                            {t('planRef.history')}
                          </button>
                          <button
                            type="button"
                            className={btn}
                            onClick={() => navigate(`/admin/action-plans/${p.id}`)}
                          >
                            Ouvrir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} {t('permMatrix.of')} {filtered.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('qualityHistory.previous')}</button>
            <span className="tabular-nums text-xs">{currentPage} / {pageCount}</span>
            <button type="button" className={btn} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('qualityHistory.next')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
