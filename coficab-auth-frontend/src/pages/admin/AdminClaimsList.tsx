import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  CapaErrorBanner,
  CapaKpiStrip,
  CapaPageHeader,
  CapaPageShell,
  CapaPanel,
  capaInputCls,
  capaSelectCls,
} from '../../components/capa/CapaAdminUi';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

const PAGE_SIZE = 12;
const btnSecondary =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200 disabled:opacity-40';
const btnPrimary =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white hover:bg-[#00009e]';

/** label = i18n key */
const STATUSES: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'claimStatus.draft', color: 'bg-slate-100 text-slate-600' },
  OUVERTE: { label: 'claimStatus.open', color: 'bg-sky-50 text-sky-700' },
  ASSIGNED: { label: 'claimStatus.assigned', color: 'bg-indigo-50 text-indigo-700' },
  EN_ANALYSE: { label: 'claimStatus.inAnalysis', color: 'bg-blue-50 text-blue-700' },
  CLOTUREE: { label: 'claimStatus.closed', color: 'bg-emerald-50 text-emerald-700' },
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(dateLocale());
}

function dayStamp(value?: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function person(claim: Claim): string {
  const name = claim.assignedToName || '';
  if (name && !/^[0-9a-f-]{8,}$/i.test(name)) return name;
  return i18n.t('claimDetail.unassigned');
}

export default function AdminClaimsList() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // ?status= and ?severity= preselect the filters (dashboard KPI tiles).
  const [searchParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string | 'all'>(searchParams.get('status') || 'all');
  const [filterSeverity, setFilterSeverity] = useState((searchParams.get('severity') || 'all').toLowerCase());
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await qualityAnalysisService.getClaims(undefined, accessToken);
      setClaims(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || i18n.t('claimsDir.loadFailed'));
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  useEffect(() => { void load(); }, [accessToken]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return claims.filter((claim) => {
      const status = resolveClaimStatus(claim);
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterSeverity !== 'all' && String(claim.severity || '').toLowerCase() !== filterSeverity) return false;
      const due = dayStamp(claim.deadline || claim.detectionDate);
      const from = dayStamp(filterFrom);
      const to = dayStamp(filterTo);
      if ((from != null || to != null) && due == null) return false;
      if (from != null && due != null && due < from) return false;
      if (to != null && due != null && due > to) return false;
      if (!term) return true;
      return [
        claim.title,
        claim.clientId,
        claim.defectType,
        claim.lotNumber,
        claim.productionLine,
        person(claim),
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [claims, search, filterStatus, filterSeverity, filterFrom, filterTo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const shimmer = 'ap-shimmer rounded-md';
  const severities = Array.from(new Set(claims.map((c) => String(c.severity || '').trim()).filter(Boolean)));

  return (
    <CapaPageShell>
      <style>{`
        @keyframes ap-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .ap-shimmer {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
          background-size: 800px 100%;
          animation: ap-shimmer 1.2s ease-in-out infinite;
        }
      `}</style>
      <CapaPageHeader
        eyebrow={t('adminDashboard.claims.title')}
        title={t('adminNav.allClaims')}
        subtitle={t('adminLists.claimsSubtitle')}
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={() => void load()}>{t('dashboard.refresh')}</button>
            <button type="button" className={btnPrimary} onClick={() => navigate('/admin/claims/create')}>+ {t('adminNav.newClaim')}</button>
          </>
        }
      />
      {error ? <CapaErrorBanner message={error} /> : null}
      <CapaKpiStrip
        variant="soft"
        items={Object.entries(STATUSES).map(([key, val]) => ({
          key,
          label: t(val.label),
          value: claims.filter((claim) => resolveClaimStatus(claim) === key).length,
          active: filterStatus === key,
          onClick: () => {
            setFilterStatus(filterStatus === key ? 'all' : key);
            setPage(1);
          },
        }))}
      />
      <CapaPanel
        className="mb-5"
        padding
        title={t('plansAdmin.filters')}
        meta={<span className="text-xs font-medium text-slate-500">{t('adminLists.results', { count: filtered.length })}</span>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('actionsReport.search')}</span>
            <input className={capaInputCls} placeholder={t('adminLists.claimsSearchPh')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('common.status')}</span>
            <select className={capaSelectCls} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="all">{t('activity.all')}</option>
              {Object.entries(STATUSES).map(([key, val]) => <option key={key} value={key}>{t(val.label)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('claimEdit.severity')}</span>
            <select className={capaSelectCls} value={filterSeverity} onChange={(e) => { setFilterSeverity(e.target.value); setPage(1); }}>
              <option value="all">{t('claimFilters.allSeverities')}</option>
              {severities.map((value) => <option key={value} value={value.toLowerCase()}>{value}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('qualityHistory.from')}</span>
            <input type="date" className={capaSelectCls} value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('qualityHistory.to')}</span>
            <input type="date" className={capaSelectCls} value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(1); }} />
          </label>
        </div>
      </CapaPanel>
      <CapaPanel padding={false} title={t('adminDashboard.claims.title')} meta={<span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{filtered.length}</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t('dashboard.colTitle')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('closedArchive.colDefect')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('planDetail.department')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('dashboard.colResponsible')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('common.status')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('dashboard.colDeadline')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 7 }).map((__, cell) => (
                      <td key={cell} className="px-4 py-3.5"><div className={`${shimmer} h-4 w-24`} /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">{t('adminLists.noClaims')}</td></tr>
              ) : pageRows.map((claim) => {
                const known = STATUSES[resolveClaimStatus(claim)];
                const status = known ? { ...known, label: t(known.label) } : { label: resolveClaimStatus(claim), color: 'bg-slate-100 text-slate-600' };
                return (
                  <tr key={claim.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3.5">
                      <button type="button" className="font-medium text-[#000168] hover:underline text-left" onClick={() => navigate(`/pages/front/quality-analyses?claimId=${claim.id}`)}>
                        {claim.title || t('closedArchive.untitled')}
                      </button>
                      <div className="text-[11px] text-slate-400">{claim.clientId || '—'} · {claim.lotNumber || t('adminLists.noLot')}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{claim.defectType || '—'}</td>
                    <td className="px-4 py-3.5 text-slate-700">{claim.productionLine || '—'}</td>
                    <td className="px-4 py-3.5 text-slate-700">{person(claim)}</td>
                    <td className="px-4 py-3.5"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${status.color}`}>{status.label}</span></td>
                    <td className="px-4 py-3.5 text-slate-600">{formatDate(claim.deadline)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button type="button" className={btnSecondary} onClick={() => navigate(`/admin/claims/eight-d/${claim.id}`)}>8D</button>
                    </td>
                  </tr>
                );
              })}
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
