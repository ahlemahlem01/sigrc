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
import { severityKey, type SeverityKey } from '../../utils/overviewSeverity';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../../components/ConfirmDialog';
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
  PENDING_VALIDATION: { label: 'claimStatus.pendingValidation', color: 'bg-amber-50 text-amber-700' },
  VALIDATED: { label: 'claimStatus.validated', color: 'bg-teal-50 text-teal-700' },
  REJECTED: { label: 'claimStatus.rejected', color: 'bg-rose-50 text-rose-700' },
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
  // ?status= and ?severity= preselect the filters (dashboard KPI tiles); ?q= pre-fills the search (defects, customers).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filterStatus, setFilterStatus] = useState<string | 'all'>(searchParams.get('status') || 'all');
  const [filterSeverity, setFilterSeverity] = useState((searchParams.get('severity') || 'all').toLowerCase());
  // ?deadline=late|none preselects the deadline filter (dashboard tiles)
  const [filterDeadline, setFilterDeadline] = useState<'all' | 'late' | 'none'>(
    searchParams.get('deadline') === 'late' ? 'late' : searchParams.get('deadline') === 'none' ? 'none' : 'all',
  );
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  // ?focus=noFiveWhy: only the open claims without any 5 Why (the figure of the analyses report)
  const [focus, setFocus] = useState<string | null>(searchParams.get('focus') === 'noFiveWhy' ? 'noFiveWhy' : null);
  const [focusIds, setFocusIds] = useState<Set<string> | null>(null);
  const [ask, setAsk] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await qualityAnalysisService.getClaims(undefined, accessToken, undefined, showArchived ? { archived: true } : undefined);
      setClaims(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || i18n.t('claimsDir.loadFailed'));
      setClaims([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  useEffect(() => { void load(); }, [accessToken, showArchived]);

  useEffect(() => {
    if (!accessToken || !focus) { setFocusIds(null); return; }
    let cancel = false;
    (async () => {
      const ids = new Set<string>();
      for (let page = 1; page <= 20; page += 1) {
        const res = await qualityAnalysisService.getClaimsHistory({ page, pageSize: 100, scope: 'open', focus, sort: 'detectionDate', dir: 'desc' }, accessToken);
        (res.items || []).forEach((r) => ids.add(r.id));
        if (ids.size >= (res.total || 0) || (res.items || []).length === 0) break;
      }
      if (!cancel) setFocusIds(ids);
    })().catch(() => { if (!cancel) setFocusIds(new Set()); });
    return () => { cancel = true; };
  }, [accessToken, focus]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return claims.filter((claim) => {
      if (focus && focusIds && !focusIds.has(claim.id)) return false;
      const status = resolveClaimStatus(claim);
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterSeverity !== 'all' && severityKey(claim.severity) !== filterSeverity) return false;
      if (filterDeadline !== 'all') {
        const open = status !== 'CLOTUREE' && status !== 'VALIDATED' && status !== 'ARCHIVED' && status !== 'DRAFT';
        const deadline = dayStamp(claim.deadline);
        if (filterDeadline === 'none' && !(open && deadline == null)) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (filterDeadline === 'late' && !(open && deadline != null && deadline < today.getTime())) return false;
      }
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
  }, [claims, search, filterStatus, filterSeverity, filterDeadline, filterFrom, filterTo, focus, focusIds]);

  const failure = (e: any) =>
    setNotice({ ok: false, text: e?.response?.data?.message || e?.message || t('adminLists.archiveFailed') });

  const archive = async (claim: Claim) => {
    if (!accessToken) return;
    setBusy(true);
    setNotice(null);
    try {
      await qualityAnalysisService.archiveClaim(claim.id, accessToken);
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
      setNotice({ ok: true, text: t('adminLists.archiveDone', { title: claim.title || t('closedArchive.untitled') }) });
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const restore = async (claim: Claim) => {
    if (!accessToken) return;
    setBusy(true);
    setNotice(null);
    try {
      await qualityAnalysisService.restoreClaim(claim.id, accessToken);
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
      setNotice({ ok: true, text: t('adminLists.restoreDone', { title: claim.title || t('closedArchive.untitled') }) });
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const shimmer = 'ap-shimmer rounded-md';
  const severities: { key: SeverityKey; label: string }[] = [
    { key: 'critical', label: t('claimStatus.severityCritical') },
    { key: 'high', label: t('claimStatus.severityHigh') },
    { key: 'medium', label: t('claimStatus.severityMedium') },
    { key: 'low', label: t('claimStatus.severityLow') },
  ];

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
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 text-xs" role="group" aria-label={t('adminLists.viewLabel')}>
              {([[false, t('adminLists.viewActive')], [true, t('adminLists.viewArchived')]] as [boolean, string][]).map(([v, label]) => (
                <button key={String(v)} type="button" aria-pressed={showArchived === v} onClick={() => { setShowArchived(v); setPage(1); setNotice(null); }} className="px-2.5 py-1 rounded-md font-semibold" style={showArchived === v ? { background: '#fff', color: '#000168', boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : { color: '#64748b' }}>{label}</button>
              ))}
            </div>
            <button type="button" className={btnSecondary} onClick={() => void load()}>{t('dashboard.refresh')}</button>
            <button type="button" className={btnPrimary} onClick={() => navigate('/admin/claims/create')}>+ {t('adminNav.newClaim')}</button>
          </>
        }
      />
      {error ? <CapaErrorBanner message={error} /> : null}
      {notice && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}
      {ask && (
        <ConfirmDialog
          title={t('adminLists.archiveTitle')}
          text={t('adminLists.archiveText', { title: ask.title || t('closedArchive.untitled') })}
          confirmLabel={t('adminLists.archive')}
          danger
          busy={busy}
          onConfirm={() => void archive(ask)}
          onCancel={() => setAsk(null)}
        />
      )}
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
      {focus && (
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800">
          {t('adminLists.focusNoFiveWhy')}
          <button type="button" aria-label={t('common.reset')} className="text-blue-700 hover:text-blue-900" onClick={() => { setFocus(null); setPage(1); }}>×</button>
        </div>
      )}
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
              {severities.map((sev) => <option key={sev.key} value={sev.key}>{sev.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('dashboard.colDeadline')}</span>
            <select className={capaSelectCls} value={filterDeadline} onChange={(e) => { setFilterDeadline(e.target.value as 'all' | 'late' | 'none'); setPage(1); }}>
              <option value="all">{t('activity.all')}</option>
              <option value="late">{t('adminDashboard.claims.late')}</option>
              <option value="none">{t('adminDashboard.claims.noDeadline')}</option>
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
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">{showArchived ? t('adminLists.noArchived') : t('adminLists.noClaims')}</td></tr>
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
                    <td className="px-4 py-3.5 text-slate-600">
                  {claim.deadline ? formatDate(claim.deadline) : <span className="inline-block rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-semibold">{t('adminDashboard.claims.noDeadline')}</span>}
                </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex gap-1.5">
                        <button type="button" className={btnPrimary} title={t('adminLists.openFolder')} onClick={() => navigate(`/pages/front/quality-analyses?claimId=${claim.id}`)}>{t('qualityHistory.open')}</button>
                        {showArchived ? (
                          <button type="button" className={btnSecondary} disabled={busy} onClick={() => void restore(claim)}>{t('adminLists.restore')}</button>
                        ) : (
                          <button type="button" className={`${btnSecondary} !text-red-600`} onClick={() => setAsk(claim)}>{t('adminLists.archive')}</button>
                        )}
                      </div>
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
