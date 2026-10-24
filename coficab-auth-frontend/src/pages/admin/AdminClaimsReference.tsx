import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { fixMojibake } from '../../utils/textEncoding';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { defectLabel } from '../../utils/defectLabel';

const PAGE_SIZE = 12;
const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200';
const selectCls =
  'px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

const STATUS_KEY: Record<string, string> = {
  DRAFT: 'draft', OUVERTE: 'open', ASSIGNED: 'assigned', EN_ANALYSE: 'inAnalysis',
  PENDING_VALIDATION: 'pendingValidation', CLOTUREE: 'closed', CLOSED: 'closed', VALIDATED: 'validated', REJECTED: 'rejected',
};

const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every claim with its permanent reference (REC-year-number), searchable and exportable. */
export default function AdminClaimsReference() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await qualityAnalysisService.getClaims(undefined, accessToken);
      setClaims((data || []) as Claim[]);
    } catch {
      setError(t('claimRef.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const refOf = (c: Claim) => String((c as any).reference || '—');
  const statusOf = (c: Claim) => resolveClaimStatus(c);
  const statusLabel = (code: string) => (STATUS_KEY[code] ? t(`claimStatus.${STATUS_KEY[code]}`) : code);

  const statuses = useMemo(() => Array.from(new Set(claims.map(statusOf))).sort(), [claims]);

  const filtered = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return claims
      .filter((c) => status === 'all' || statusOf(c) === status)
      .filter((c) => {
        if (words.length === 0) return true;
        const hay = fold([refOf(c), c.title, c.clientId, (c as any).defectType, (c as any).lotNumber, (c as any).assignedToName].join(' '));
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => refOf(b).localeCompare(refOf(a)));
  }, [claims, q, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const exportPdf = () => {
    exportCapaPdf({
      title: t('claimRef.title'),
      subtitle: t('claimRef.subtitle'),
      filename: 'claims-reference',
      meta: [`${t('claimRef.total')}: ${claims.length}`, `${t('claimRef.shown')}: ${filtered.length}`],
      columns: [
        { key: 'ref', label: t('claimRef.colRef') },
        { key: 'title', label: t('claimRef.colTitle') },
        { key: 'client', label: t('claimRef.colClient') },
        { key: 'defect', label: t('claimRef.colDefect') },
        { key: 'status', label: t('claimRef.colStatus') },
        { key: 'assignee', label: t('claimRef.colAssignee') },
      ],
      rows: filtered.map((c) => ({
        ref: refOf(c),
        title: fixMojibake(c.title || ''),
        client: c.clientId || '—',
        defect: defectLabel((c as any).defectType) || '—',
        status: statusLabel(statusOf(c)),
        assignee: (c as any).assignedToName || t('claimRef.unassigned'),
      })),
    });
  };

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
          <p className="text-xs font-semibold uppercase tracking-wider text-[#000168] mb-1">{t('claimRef.eyebrow')}</p>
          <h1 className="text-2xl font-bold text-[#000168]">{t('claimRef.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('claimRef.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className={btn}>{t('dashboard.refresh')}</button>
          <button type="button" onClick={exportPdf} className={btn}>{t('claimRef.exportPdf')}</button>
          <button type="button" onClick={() => navigate('/admin/audit-logs?module=quality')} className={btn}>{t('claimRef.history')}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('claimRef.total')}</div>
          <div className="text-2xl font-bold tabular-nums text-[#000168] mt-1">{claims.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('claimRef.shown')}</div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{filtered.length}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t('claimRef.search')} className={selectCls} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={selectCls}>
            <option value="all">{t('claimRef.allStatuses')}</option>
            {statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">{t('claimRef.colRef')}</th>
                <th className="px-4 py-3 font-semibold">{t('claimRef.colTitle')}</th>
                <th className="px-4 py-3 font-semibold">{t('claimRef.colClient')}</th>
                <th className="px-4 py-3 font-semibold">{t('claimRef.colStatus')}</th>
                <th className="px-4 py-3 font-semibold">{t('claimRef.colAssignee')}</th>
                <th className="px-4 py-3 font-semibold text-right">{t('claimRef.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('claimRef.empty')}</td></tr>
              ) : pageRows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <code className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-[#000168]">{refOf(c)}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 max-w-[260px] truncate">{fixMojibake(c.title || '')}</div>
                    <div className="text-[11px] text-slate-400">{defectLabel((c as any).defectType) || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{c.clientId || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{statusLabel(statusOf(c))}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{(c as any).assignedToName || t('claimRef.unassigned')}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      <button type="button" className={btn} onClick={() => navigate(`/admin/claims/list?claimId=${c.id}&view=all`)}>{t('claimRef.open')}</button>
                    </div>
                  </td>
                </tr>
              ))}
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
