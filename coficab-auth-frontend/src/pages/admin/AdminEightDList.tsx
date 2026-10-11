import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  CapaErrorBanner,
  CapaPageHeader,
  CapaPageShell,
  CapaPanel,
  capaInputCls,
  capaSelectCls,
} from '../../components/capa/CapaAdminUi';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { ClaimsHistoryRow } from '../../types/qualityAnalysis';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const PAGE_SIZE = 12;
const btnSecondary =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200 disabled:opacity-40';

function champion(row: ClaimsHistoryRow): string {
  const name = row.championName || '';
  if (name && !/^[0-9a-f-]{8,}$/i.test(name)) return name;
  return '—';
}

function dayStamp(value?: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AdminEightDList() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClaimsHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStep, setFilterStep] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!accessToken) return;
    let cancel = false;
    setLoading(true);
    setError('');
    const load = async () => {
      const first = await qualityAnalysisService.getClaimsHistory(
        { page: 1, pageSize: 100, hasEightD: 'YES', sort: 'updatedAt', dir: 'desc' },
        accessToken,
      );
      const items = [...(first.items || [])];
      const total = first.total || items.length;
      for (let next = 2; items.length < total && next <= 5; next += 1) {
        const pageData = await qualityAnalysisService.getClaimsHistory(
          { page: next, pageSize: 100, hasEightD: 'YES', sort: 'updatedAt', dir: 'desc' },
          accessToken,
        );
        items.push(...(pageData.items || []));
      }
      return items;
    };
    load()
      .then((items) => { if (!cancel) setRows(items); })
      .catch((e: any) => { if (!cancel) setError(e?.response?.data?.message || i18n.t('adminLists.eightDLoadFailed')); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [accessToken]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((row) => (row.productionLine || '').trim()).filter(Boolean))).sort(),
    [rows],
  );
  const statuses = useMemo(
    () => Array.from(new Set(rows.map((row) => (row.eightDStatus || '').trim()).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = dayStamp(filterFrom);
    const to = dayStamp(filterTo);
    return rows.filter((row) => {
      if (filterDept !== 'all' && (row.productionLine || '') !== filterDept) return false;
      if (filterStep !== 'all' && String(row.eightDStep || '') !== filterStep) return false;
      if (filterStatus !== 'all' && (row.eightDStatus || '') !== filterStatus) return false;
      const stamp = dayStamp(row.updatedAt || row.createdAt);
      if ((from != null || to != null) && stamp == null) return false;
      if (from != null && stamp != null && stamp < from) return false;
      if (to != null && stamp != null && stamp > to) return false;
      if (!term) return true;
      return [row.title, row.productionLine, champion(row), row.defectType, row.clientId]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [rows, search, filterDept, filterStep, filterStatus, filterFrom, filterTo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const shimmer = 'e8-shimmer rounded-md';

  const reset = () => {
    setSearch('');
    setFilterDept('all');
    setFilterStep('all');
    setFilterStatus('all');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  };

  return (
    <CapaPageShell>
      <style>{`
        @keyframes e8-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .e8-shimmer {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
          background-size: 800px 100%;
          animation: e8-shimmer 1.2s ease-in-out infinite;
        }
      `}</style>
      <CapaPageHeader
        eyebrow={t('adminNav.qualityAnalyses')}
        title="8D"
        subtitle={t('adminLists.eightDSubtitle')}
      />
      {error ? <CapaErrorBanner message={error} /> : null}
      <CapaPanel
        className="mb-5"
        padding
        title={t('plansAdmin.filters')}
        meta={<span className="text-xs font-medium text-slate-500">{t('adminLists.results', { count: filtered.length })}</span>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('actionsReport.search')}</span>
            <input
              className={capaInputCls}
              placeholder={t('adminLists.eightDSearchPh')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('planDetail.department')}</span>
            <select className={capaSelectCls} value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}>
              <option value="all">{t('audit.allDepartments')}</option>
              {departments.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminLists.step')}</span>
            <select className={capaSelectCls} value={filterStep} onChange={(e) => { setFilterStep(e.target.value); setPage(1); }}>
              <option value="all">{t('adminLists.allSteps')}</option>
              {Array.from({ length: 8 }, (_, i) => String(i + 1)).map((step) => (
                <option key={step} value={step}>D{step}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminLists.eightDStatus')}</span>
            <select className={capaSelectCls} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="all">{t('activity.all')}</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminLists.updatedFrom')}</span>
            <input type="date" className={capaSelectCls} value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminLists.updatedTo')}</span>
            <input type="date" className={capaSelectCls} value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(1); }} />
          </label>
          <div className="flex items-end">
            <button type="button" className={btnSecondary} onClick={reset}>{t('common.reset')}</button>
          </div>
        </div>
      </CapaPanel>
      <CapaPanel padding={false} title={t('employeeNav.crumbs.eightD')} meta={<span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{filtered.length}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t('analysisTools.claim')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('planDetail.department')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('adminLists.champion')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('adminLists.step')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('adminLists.eightDStatus')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 6 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3.5"><div className={`${shimmer} h-4 w-24`} /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('adminLists.noEightD')}</td></tr>
              ) : pageRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 font-medium text-[#000168]">{row.title || t('closedArchive.untitled')}</td>
                  <td className="px-4 py-3.5 text-slate-700">{row.productionLine || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-700">{champion(row)}</td>
                  <td className="px-4 py-3.5 text-slate-700">{row.eightDStep ? `D${row.eightDStep}` : '—'}</td>
                  <td className="px-4 py-3.5 text-slate-700">{row.eightDStatus || '—'}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button type="button" className={btnSecondary} onClick={() => navigate(`/admin/claims/eight-d/${row.id}`)}>{t('qualityHistory.open')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{rangeStart}–{rangeEnd} {t('permMatrix.of')} {filtered.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" className={btnSecondary} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>{t('qualityHistory.previous')}</button>
            <span className="tabular-nums text-xs">{currentPage} / {pageCount}</span>
            <button type="button" className={btnSecondary} disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>{t('qualityHistory.next')}</button>
          </div>
        </div>
      </CapaPanel>
    </CapaPageShell>
  );
}
