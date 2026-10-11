import React, { useCallback, useEffect, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Filter,
  GitFork,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import {
  ClaimsHistoryQuery,
  ClaimsHistoryRow,
} from '../../types/qualityAnalysis';
import {
  getEightDStatusMeta,
  getFiveWhyStatusMeta,
  getSeverityStyle,
  getStatusBadge,
  resolveClaimStatus,
} from '../../utils/Claimutils';
import { ClaimDateSortSelect } from '../../components/ClaimDateSortSelect';
import {
  ClaimDateSort,
} from '../../utils/claimDateSort';
import './ClaimsListPage.styles.css';
import './QualityClaimsHistoryPage.styles.css';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

const DEFAULT_FILTERS: ClaimsHistoryQuery = {
  page: 1,
  pageSize: 25,
  sort: 'detectionDate',
  dir: 'desc',
};

function dateSortToHistory(sort: ClaimDateSort): Pick<ClaimsHistoryQuery, 'sort' | 'dir'> {
  if (sort === 'detection-asc') return { sort: 'detectionDate', dir: 'asc' };
  if (sort === 'created-desc') return { sort: 'createdAt', dir: 'desc' };
  if (sort === 'created-asc') return { sort: 'createdAt', dir: 'asc' };
  return { sort: 'detectionDate', dir: 'desc' };
}

function historyToDateSort(sort?: string, dir?: string): ClaimDateSort {
  const d = (dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const s = (sort || 'detectionDate').toLowerCase();
  if (s.includes('creat')) return d === 'asc' ? 'created-asc' : 'created-desc';
  return d === 'asc' ? 'detection-asc' : 'detection-desc';
}

function fmtDate(value?: string | null, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString(dateLocale()) : d.toLocaleDateString(dateLocale());
}

function ppm(row: ClaimsHistoryRow) {
  const prod = row.producedQuantity;
  const def = row.defectiveQuantity;
  if (!prod || prod <= 0 || def == null) return '—';
  return Math.round((def / prod) * 1_000_000).toLocaleString(dateLocale());
}

function capaLabel(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'CREATED' || s === '1') return i18n.t('qualityHistory.capaCreated');
  if (s === 'ONGOING' || s === '2') return i18n.t('status.ongoing');
  if (s === 'CLOSED' || s === '3') return i18n.t('status.closed');
  if (s === 'ARCHIVED' || s === '4') return i18n.t('status.archived');
  return status || '—';
}

function shortId(id: string) {
  return String(id).slice(0, 8).toUpperCase();
}

function csvEscape(value: unknown) {
  const text = value == null ? '' : String(value).replace(/\r?\n/g, ' ');
  if (/[",;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const QualityClaimsHistoryPage: React.FC<{ preset?: Partial<ClaimsHistoryQuery> }> = ({ preset }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<ClaimsHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ClaimsHistoryQuery>({ ...DEFAULT_FILTERS, ...preset });
  const [searchInput, setSearchInput] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async (next: ClaimsHistoryQuery) => {
    if (!accessToken) {
      setError(i18n.t('qualityHistory.sessionExpired'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await qualityAnalysisService.getClaimsHistory(next, accessToken);
      setRows(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || i18n.t('qualityHistory.loadFailed'));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => {
        const nextSearch = searchInput.trim();
        if ((prev.search || '') === nextSearch) return prev;
        const next = { ...prev, search: nextSearch || undefined, page: 1 };
        void load(next);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput, load]);

  const applyFilters = (patch: Partial<ClaimsHistoryQuery>, resetPage = true) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch, page: resetPage ? 1 : (patch.page ?? prev.page) };
      void load(next);
      return next;
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters(DEFAULT_FILTERS);
    void load(DEFAULT_FILTERS);
  };

  const hasFilters = Boolean(
    filters.search || filters.claimStatus || filters.eightDStep || filters.updatedFrom || filters.updatedTo
  );

  const exportCsv = () => {
    const header = String(t('qualityHistory.csvHeader')).split('|');
    const yes = t('qualityHistory.yes');
    const no = t('qualityHistory.no');
    const lines = rows.map((r) => [
      r.id, r.title, r.clientId, r.defectType, r.severity, r.lotNumber, r.serialNumber,
      r.productionLine, r.shift, resolveClaimStatus(r),
      getFiveWhyStatusMeta(r.fiveWhyStatus).label,
      r.rootCauseOccurrence, r.rootCauseDetection,
      getEightDStatusMeta(r.eightDStatus, r.eightDStep).label, r.eightDStep,
      r.containmentVerified ? yes : no, r.championName,
      r.ishikawaStatus || '', r.capaTitle, capaLabel(r.capaStatus), r.capaProgress,
      r.producedQuantity, r.defectiveQuantity, ppm(r),
      fmtDate(r.detectionDate), fmtDate(r.createdAt, true), fmtDate(r.updatedAt || r.createdAt, true),
      fmtDate(r.completedAt, true),
      r.isOnTime == null ? '' : r.isOnTime ? yes : no,
      r.createdBy,
    ].map(csvEscape).join(';'));
    const blob = new Blob(['\uFEFF' + [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('qualityHistory.csvFile')}-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortBy = (field: string) => {
    const dir = filters.sort === field && filters.dir === 'desc' ? 'asc' : 'desc';
    applyFilters({ sort: field, dir }, false);
  };

  const sortMark = (field: string) => {
    if (filters.sort !== field) return null;
    return <span className="qh-sort-mark">{filters.dir === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="pfe-container qh-page">
      <div className="pfe-header">
        <div className="pfe-title-box">
          <div>
            <h1>{t('qualityHistory.title')}</h1>
            <p>{t('qualityHistory.subtitle')}</p>
            <div className="qh-header-meta">
              <span className="qh-stat-chip">
                {t('qualityHistory.filesCount', { count: total, formatted: total.toLocaleString(dateLocale()) })}
              </span>
              {filters.claimStatus && (
                <span className="qh-stat-chip">
                  {t('common.status')} <strong>{filters.claimStatus}</strong>
                </span>
              )}
              {hasFilters && (
                <span className="qh-stat-chip">{t('qualityHistory.activeFilters')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="pfe-header-buttons">
          <button type="button" className="pfe-btn-secondary" onClick={exportCsv} disabled={loading || rows.length === 0}>
            <Download size={15} /> {t('qualityHistory.exportCsv')}
          </button>
          <button type="button" className="pfe-btn-secondary" onClick={() => void load(filters)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'pfe-spin' : undefined} /> {t('qualityHistory.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="pfe-alert-error">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div className="qh-toolbar">
        <div className="qh-filter-group">
          <label>{t('common.search')}</label>
          <div className="pfe-search-input qh-search">
            <Search size={14} className="pfe-search-icon" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('qualityHistory.searchPlaceholder')}
            />
          </div>
        </div>

        <div className="qh-filter-group">
          <label>{t('common.status')}</label>
          <select
            className="qh-select"
            value={filters.claimStatus || ''}
            onChange={(e) => {
              const claimStatus = e.target.value || undefined;
              applyFilters({
                claimStatus,
                eightDStep: claimStatus === 'EN_ANALYSE' ? filters.eightDStep : undefined,
              });
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="OUVERTE">{t('claimStatus.open')}</option>
            <option value="ASSIGNED">{t('claimStatus.assigned')}</option>
            <option value="EN_ANALYSE">{t('claimStatus.inAnalysis')}</option>
            <option value="PENDING_VALIDATION">{t('claimStatus.pendingValidation')}</option>
            <option value="VALIDATED">{t('claimStatus.validated')}</option>
            <option value="REJECTED">{t('claimStatus.rejected')}</option>
            <option value="CLOTUREE">{t('claimStatus.closed')}</option>
          </select>
        </div>

        {filters.claimStatus === 'EN_ANALYSE' && (
          <div className="qh-filter-group">
            <label>{t('qualityHistory.eightDStep')}</label>
            <select
              className="qh-select"
              value={filters.eightDStep || ''}
              onChange={(e) => applyFilters({ eightDStep: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">{t('qualityHistory.allSteps')}</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>D{n}</option>
              ))}
            </select>
          </div>
        )}

        <div className="qh-filter-group">
          <label>{t('qualityHistory.sortByDate')}</label>
          <ClaimDateSortSelect
            className="qh-select"
            value={historyToDateSort(filters.sort, filters.dir)}
            onChange={(next) => applyFilters(dateSortToHistory(next), false)}
          />
        </div>

        <div className="qh-filter-group">
          <label>{t('qualityHistory.period')}</label>
          <div className="qh-dates">
            <input
              type="date"
              className="qh-input"
              value={filters.updatedFrom || ''}
              onChange={(e) => applyFilters({ updatedFrom: e.target.value || undefined })}
              title={t('qualityHistory.from')}
            />
            <span className="qh-date-sep">→</span>
            <input
              type="date"
              className="qh-input"
              value={filters.updatedTo || ''}
              onChange={(e) => applyFilters({ updatedTo: e.target.value || undefined })}
              title={t('qualityHistory.to')}
            />
          </div>
        </div>

        <div className="qh-toolbar-actions">
          <div className="qh-filter-group">
            <label>{t('qualityHistory.page')}</label>
            <select
              className="qh-select"
              value={pageSize}
              onChange={(e) => applyFilters({ pageSize: Number(e.target.value), page: 1 }, false)}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>{t('qualityHistory.perPage', { n })}</option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button type="button" className="pfe-btn-secondary" onClick={resetFilters} style={{ height: 36, marginTop: 16 }}>
              <X size={14} /> {t('common.reset')}
            </button>
          )}
        </div>
      </div>

      <div className="qh-table-wrap">
        {loading && rows.length === 0 ? (
          <ListSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <div className="pfe-empty">
            <Filter size={18} /> {t('qualityHistory.empty')}
          </div>
        ) : (
          <table className="qh-table">
            <thead>
              <tr>
                <th style={{ width: 44 }} />
                <th className="qh-sortable" onClick={() => sortBy('title')}>{t('qualityHistory.colClaim')}{sortMark('title')}</th>
                <th className="qh-sortable" onClick={() => sortBy('clientId')}>{t('qualityHistory.colClientLot')}{sortMark('clientId')}</th>
                <th className="qh-sortable" onClick={() => sortBy('severity')}>{t('closedArchive.colDefect')}{sortMark('severity')}</th>
                <th className="qh-sortable" onClick={() => sortBy('statusCode')}>{t('common.status')}{sortMark('statusCode')}</th>
                <th>5 Why</th>
                <th>8D</th>
                <th>CAPA</th>
                <th className="qh-sortable" onClick={() => sortBy('updatedAt')}>{t('qualityHistory.colDates')}{sortMark('updatedAt')}</th>
                <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((claim) => {
                const st = resolveClaimStatus(claim);
                const badge = getStatusBadge(st);
                const Icon = badge.icon;
                const fw = getFiveWhyStatusMeta(claim.fiveWhyStatus);
                const e8 = getEightDStatusMeta(claim.eightDStatus, claim.eightDStep);
                const sev = getSeverityStyle(claim.severity);
                const open = expandedId === claim.id;
                return (
                  <React.Fragment key={claim.id}>
                    <tr className={open ? 'qh-row-open' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="qh-expand"
                          onClick={() => setExpandedId(open ? null : claim.id)}
                          aria-expanded={open}
                          title={t('qualityHistory.detail')}
                        >
                          <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                        </button>
                      </td>
                      <td>
                        <div className="qh-title">{claim.title || t('closedArchive.untitled')}</div>
                        <div className="qh-sub">#{shortId(claim.id)}{claim.productionLine ? ` · ${claim.productionLine}` : ''}{claim.shift ? ` · ${claim.shift}` : ''}</div>
                      </td>
                      <td>
                        <div>{claim.clientId || '—'}</div>
                        <div className="qh-sub">{t('closedArchive.lot', { lot: claim.lotNumber || '—' })}{claim.serialNumber ? ` · SN ${claim.serialNumber}` : ''}</div>
                      </td>
                      <td>
                        <div>{claim.defectType || '—'}</div>
                        <span className="pfe-badge" style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, padding: '2px 7px', fontSize: 10, marginTop: 4, display: 'inline-flex' }}>
                          {sev.label}
                        </span>
                      </td>
                      <td>
                        <span className="pfe-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, padding: '3px 8px', fontSize: 11 }}>
                          <Icon size={11} /> {badge.label}
                        </span>
                      </td>
                      <td>
                        <span
                          className="qh-fw"
                          title={fw.hint}
                          style={{ color: fw.color, background: fw.bg, borderColor: fw.border }}
                        >
                          {fw.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ color: e8.color, fontWeight: 700, fontSize: 12 }}>{e8.label}</div>
                        {claim.containmentVerified && <div className="qh-sub">{t('qualityHistory.containmentOk')}</div>}
                      </td>
                      <td>
                        {claim.capaTitle ? (
                          <>
                            <div className="qh-capa">{claim.capaTitle}</div>
                            <div className="qh-sub">{capaLabel(claim.capaStatus)} · {claim.capaProgress || 0}%{claim.capaCount && claim.capaCount > 1 ? ` · ${t('qualityHistory.plansCount', { count: claim.capaCount })}` : ''}</div>
                          </>
                        ) : (
                          <span className="qh-sub">{t('createClaim.none')}</span>
                        )}
                      </td>
                      <td>
                        <div className="qh-sub">{t('qualityHistory.detectedShort', { date: fmtDate(claim.detectionDate) })}</div>
                        <div className="qh-sub">{t('qualityHistory.updatedShort', { date: fmtDate(claim.updatedAt || claim.createdAt, true) })}</div>
                        {claim.completedAt && (
                          <div className="qh-sub" style={{ color: '#0f766e', fontWeight: 600 }}>
                            {t('qualityHistory.closedShort', { date: fmtDate(claim.completedAt, true) })}
                            {claim.isOnTime === true ? ` · ${t('claimSidebar.onTime')}` : claim.isOnTime === false ? ` · ${t('claimSidebar.late')}` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="qh-actions">
                          <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses?claimId=${encodeURIComponent(claim.id)}`)}>
                            {t('qualityHistory.open')}
                          </button>
                          <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/8d/${claim.id}`)}>
                            8D
                          </button>
                          <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/5why/${claim.id}`)}>
                            <GitFork size={12} /> 5 Why
                          </button>
                          {claim.capaId && (
                            <button type="button" className="pfe-btn-primary qh-btn" style={{ background: '#059669' }} onClick={() => navigate(`/pages/front/action-plans/${claim.capaId}`)}>
                              <ExternalLink size={12} /> CAPA
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="qh-detail">
                        <td colSpan={10}>
                          <div className="qh-detail-grid">
                            <div>
                              <h4>{t('qualityHistory.colClaim')}</h4>
                              <p>{claim.descriptionPreview || t('qualityHistory.noDescription')}</p>
                              <p className="qh-sub">
                                {t('qualityHistory.authorCreated', { author: claim.createdBy || '—', date: fmtDate(claim.createdAt, true) })}
                                {claim.completedAt
                                  ? ` · ${t('qualityHistory.closedShort', { date: fmtDate(claim.completedAt, true) })}${
                                      claim.isOnTime === true
                                        ? ` (${t('claimSidebar.onTime')})`
                                        : claim.isOnTime === false
                                          ? ` (${t('claimSidebar.late')})`
                                          : ''
                                    }`
                                  : ''}
                                {claim.producedQuantity != null ? ` · ${t('qualityHistory.qtyPpm', { nok: claim.defectiveQuantity ?? 0, produced: claim.producedQuantity, ppm: ppm(claim) })}` : ''}
                              </p>
                            </div>
                            <div>
                              <h4>5 Why</h4>
                              <p title={fw.hint}><strong>{fw.label}</strong></p>
                              {claim.problemStatement && <p>{claim.problemStatement}</p>}
                              {claim.rootCauseOccurrence && <p>{t('qualityHistory.occurrence', { value: claim.rootCauseOccurrence })}</p>}
                              {claim.rootCauseDetection && <p>{t('qualityHistory.detection', { value: claim.rootCauseDetection })}</p>}
                              {claim.fiveWhyValidatedBy && (
                                <p className="qh-sub">{t('qualityHistory.validatedBy', { name: claim.fiveWhyValidatedBy, date: fmtDate(claim.fiveWhyValidatedAt, true) })}</p>
                              )}
                              {!claim.fiveWhyId && <p className="qh-sub">{t('qualityHistory.noFiveWhy')}</p>}
                            </div>
                            <div>
                              <h4>{t('qualityHistory.eightDPath')}</h4>
                              <p><strong>{e8.label}</strong></p>
                              {claim.championName && <p>{t('qualityHistory.champion', { name: claim.championName })}</p>}
                              <p className="qh-sub">
                                {claim.containmentVerified ? t('qualityHistory.containmentVerified') : t('qualityHistory.containmentNotVerified')}
                                {claim.eightDSubmittedAt ? ` · ${t('qualityHistory.submittedShort', { date: fmtDate(claim.eightDSubmittedAt, true) })}` : ''}
                                {claim.eightDValidatedAt ? ` · ${t('qualityHistory.validatedShort', { date: fmtDate(claim.eightDValidatedAt, true) })}` : ''}
                                {claim.eightDClosedAt ? ` · ${t('qualityHistory.closedShort', { date: fmtDate(claim.eightDClosedAt, true) })}` : ''}
                              </p>
                              <p className="qh-sub">{t('qualityHistory.ishikawa', { status: claim.ishikawaStatus ? getFiveWhyStatusMeta(claim.ishikawaStatus).label : t('qualityHistory.notStarted') })}</p>
                              <div className="qh-detail-actions">
                                <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/8d/${claim.id}`)}>{t('analysisTools.eightD')}</button>
                                <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/parcours/${claim.id}`)}>{t('analysisTools.guide')}</button>
                                <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/ishikawa/${claim.id}`)}>Ishikawa</button>
                                <button type="button" className="pfe-btn-secondary qh-btn" onClick={() => navigate(`/pages/front/quality-analyses/pareto/${claim.id}`)}>Pareto</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="qh-pager">
        <span>
          {total === 0 ? '0' : `${((page - 1) * pageSize) + 1}–${Math.min(page * pageSize, total)}`}
          {' / '}{t('qualityHistory.filesCount', { count: total, formatted: total.toLocaleString(dateLocale()) })}
        </span>
        <div className="qh-pager-btns">
          <button type="button" className="pfe-btn-secondary qh-btn" disabled={page <= 1 || loading} onClick={() => applyFilters({ page: page - 1 }, false)}>
            <ChevronLeft size={14} /> {t('qualityHistory.previous')}
          </button>
          <span>{t('qualityHistory.pageOf', { page, count: pageCount })}</span>
          <button type="button" className="pfe-btn-secondary qh-btn" disabled={page >= pageCount || loading} onClick={() => applyFilters({ page: page + 1 }, false)}>
            {t('qualityHistory.next')} <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default QualityClaimsHistoryPage;
