import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import React, { useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { isAdminUser } from '../../utils/roles';
import './ClosedClaimsArchivePage.styles.css';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { defectLabel } from '../../utils/defectLabel';

const isClosedStatus = (claim: Claim) => {
  const s = resolveClaimStatus(claim);
  return s === 'CLOTUREE' || s === 'CLOSED';
};

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(dateLocale());
};

const closureDate = (claim: Claim) =>
  claim.completedAt || (claim as any).CompletedAt || claim.updatedAt || claim.detectionDate || claim.createdAt;

const yearOf = (claim: Claim) => {
  const d = new Date(closureDate(claim));
  return Number.isNaN(d.getTime()) ? '' : String(d.getFullYear());
};

export default function ClosedClaimsArchivePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const isAdmin = isAdminUser(user);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [timingFilter, setTimingFilter] = useState<'all' | 'on-time' | 'late'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken) {
        setError(i18n.t('closedArchive.sessionExpired'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await qualityAnalysisService.getClaims(
          undefined,
          accessToken,
          undefined,
          isAdmin ? undefined : { relatedTo: 'me' }
        );
        if (cancelled) return;
        const closed = (data || [])
          .filter(isClosedStatus)
          .sort((a, b) => +new Date(closureDate(b)) - +new Date(closureDate(a)));
        setClaims(closed);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || i18n.t('closedArchive.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isAdmin]);

  const years = useMemo(() => {
    const set = new Set(claims.map(yearOf).filter(Boolean));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [claims]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (yearFilter !== 'all' && yearOf(c) !== yearFilter) return false;
      const onTime = c.isOnTime ?? (c as any).IsOnTime;
      if (timingFilter === 'on-time' && onTime !== true) return false;
      if (timingFilter === 'late' && onTime !== false) return false;
      if (!q) return true;
      const hay = [c.title, c.clientId, c.defectType, c.lotNumber, c.serialNumber, c.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [claims, query, yearFilter, timingFilter]);
  const paged = usePagedList(filtered, 25);

  const onTimeCount = claims.filter((c) => c.isOnTime === true || (c as any).IsOnTime === true).length;
  const lateCount = claims.filter((c) => c.isOnTime === false || (c as any).IsOnTime === false).length;

  const openInList = (claim: Claim) => {
    const createdBy = String(
      (claim as any).createdById || (claim as any).CreatedById || claim.createdById || ''
    ).toLowerCase();
    const myId = String((user as any)?.id || (user as any)?.sub || '').toLowerCase();
    const mine = myId && createdBy === myId;
    const params = new URLSearchParams();
    params.set('view', 'closed');
    params.set('claimId', String(claim.id));
    if (!isAdmin) {
      params.set('scope', mine ? 'created' : 'assigned');
    }
    const path =
      !isAdmin && !mine
        ? '/pages/front/my-claims'
        : '/pages/front/quality-analyses';
    navigate(`${path}?${params.toString()}`);
  };

  return (
    <div className="cc-page">
      <div className="cc-header">
        <div>
          <h1>{t('closedArchive.title')}</h1>
          <p>{t('closedArchive.subtitle')}</p>
        </div>
        <div className="cc-header-actions">
          <Link to="/pages/front/quality-analyses" className="cc-btn">
            <ArrowLeft size={13} /> {t('closedArchive.backToClaims')}
          </Link>
        </div>
      </div>

      <div className="cc-stats">
        <span className="cc-stat">
          {t('closedArchive.total')} <strong>{claims.length}</strong>
        </span>
        <span className="cc-stat">
          {t('claimDetail.onTime')} <strong>{onTimeCount}</strong>
        </span>
        <span className="cc-stat">
          {t('claimDetail.late')} <strong>{lateCount}</strong>
        </span>
      </div>

      <div className="cc-toolbar">
        <label className="cc-search">
          <Search size={15} />
          <input
            type="search"
            placeholder={t('closedArchive.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label={t('closedArchive.year')}>
          <option value="all">{t('closedArchive.allYears')}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={timingFilter}
          onChange={(e) => setTimingFilter(e.target.value as 'all' | 'on-time' | 'late')}
          aria-label={t('closedArchive.timing')}
        >
          <option value="all">{t('closedArchive.allTimings')}</option>
          <option value="on-time">{t('claimDetail.onTime')}</option>
          <option value="late">{t('claimDetail.late')}</option>
        </select>
      </div>

      <div className="cc-table-wrap">
        {loading && (
          <ListSkeleton rows={8} />
        )}
        {!loading && error && <div className="cc-state error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="cc-state">{t('closedArchive.empty')}</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table className="cc-table">
            <thead>
              <tr>
                <th>{t('closedArchive.colFile')}</th>
                <th>{t('closedArchive.colClient')}</th>
                <th>{t('closedArchive.colDefect')}</th>
                <th>{t('closedArchive.colClosedOn')}</th>
                <th>{t('closedArchive.timing')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((claim) => {
                const onTime = claim.isOnTime ?? (claim as any).IsOnTime;
                return (
                  <tr key={claim.id} onClick={() => openInList(claim)}>
                    <td>
                      <p className="cc-title">{claim.title || t('closedArchive.untitled')}</p>
                      <p className="cc-sub">{claim.lotNumber ? t('closedArchive.lot', { lot: claim.lotNumber }) : claim.id.slice(0, 8)}</p>
                    </td>
                    <td>{claim.clientId || '—'}</td>
                    <td>{defectLabel(claim.defectType) || '—'}</td>
                    <td>{fmtDate(closureDate(claim))}</td>
                    <td>
                      {onTime === true && (
                        <span className="cc-badge ok">
                          <CheckCircle2 size={11} /> {t('claimDetail.onTime')}
                        </span>
                      )}
                      {onTime === false && (
                        <span className="cc-badge late">
                          <Clock size={11} /> {t('claimDetail.late')}
                        </span>
                      )}
                      {onTime == null && <span className="cc-badge neutral">—</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="cc-actions">
                        <button
                          type="button"
                          className="cc-btn primary"
                          onClick={() => openInList(claim)}
                        >
                          <ExternalLink size={12} /> {t('closedArchive.view')}
                        </button>
                        <button
                          type="button"
                          className="cc-btn"
                          onClick={() => navigate(`/pages/front/quality-analyses/8d/${claim.id}`)}
                        >
                          <ShieldCheck size={12} /> 8D
                        </button>
                        <button
                          type="button"
                          className="cc-btn"
                          onClick={() => navigate(`/pages/front/quality-analyses/parcours/${claim.id}`)}
                        >
                          <BookOpen size={12} /> {t('closedArchive.guide')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > paged.pageSize && (
          <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={false} />
        )}
      </div>
    </div>
  );
}
