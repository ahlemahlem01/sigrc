import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import TablePagination from '../../../components/TablePagination';
import TableSkeleton, { TableLoadingBanner } from '../../../components/TableSkeleton';
import {
  adminEmployeeService,
  type EmployeeActivityItem,
  type EmployeeActivitySummary,
} from '../../../services/adminEmployeeService';
import {
  ACTIVITY_STATUS_OPTIONS,
  activityStatusClass,
  activityStatusLabel,
  normalizeActivityStatus,
  type ActivityStatus,
} from '../../../utils/activityStatus';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../../i18n';

const PAGE_SIZE = 25;
const MIN_LOADING_MS = 650;

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type SortKey = 'name' | 'department' | 'activityStatus' | 'lastActivityAt' | 'lastLoginAt' | 'recentActionCount';

export default function EmployeeActivityTrackingPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<EmployeeActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ActivityStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recentActionCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const startedAt = Date.now();
    setLoading(true);
    setError('');
    try {
      const data = await adminEmployeeService.getActivitySummary(accessToken, true, 'plans');
      setSummary(data);
    } catch {
      setError(i18n.t('activityTracking.loadFailed'));
      setSummary(null);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sortKey, sortDir]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (summary?.items ?? []).filter((item) => {
      if (filter !== 'all' && normalizeActivityStatus(item.activityStatus) !== filter) return false;
      if (!q) return true;
      return [item.name, item.email, item.department, item.role].some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      );
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    const statusOrder: Record<ActivityStatus, number> = {
      Active: 0,
      LowActivity: 1,
      Inactive: 2,
    };

    list = [...list].sort((a, b) => {
      if (sortKey === 'recentActionCount') {
        return ((a.recentActionCount ?? 0) - (b.recentActionCount ?? 0)) * dir;
      }
      if (sortKey === 'activityStatus') {
        const byStatus =
          statusOrder[normalizeActivityStatus(a.activityStatus)] -
          statusOrder[normalizeActivityStatus(b.activityStatus)];
        if (byStatus !== 0) return byStatus * dir;
        return (b.recentActionCount ?? 0) - (a.recentActionCount ?? 0);
      }
      if (sortKey === 'lastActivityAt' || sortKey === 'lastLoginAt') {
        const ta = new Date(a[sortKey] ?? 0).getTime();
        const tb = new Date(b[sortKey] ?? 0).getTime();
        return (ta - tb) * dir;
      }
      return String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), 'fr') * dir;
    });

    return list;
  }, [summary, search, filter, sortKey, sortDir]);

  const pagedItems = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'department' ? 'asc' : 'desc');
    }
  };

  const openEmployee = (item: EmployeeActivityItem) => {
    navigate(`/admin/employees/${item.userId}`, {
      state: {
        employee: {
          id: item.userId,
          fullName: item.name,
          email: item.email,
          department: item.department,
          role: item.role,
          activityStatus: item.activityStatus,
        },
      },
    });
  };

  const cards = [
    { key: 'all' as const, label: t('closedArchive.total'), value: summary?.total ?? 0 },
    { key: 'Active' as const, label: t('activity.active'), value: summary?.active ?? 0 },
    { key: 'LowActivity' as const, label: t('activity.low'), value: summary?.lowActivity ?? 0 },
    { key: 'Inactive' as const, label: t('activity.inactive'), value: summary?.inactive ?? 0 },
  ];

  return (
    <div className="eat">
      <style>{`
        .eat { font-family: Inter, system-ui, sans-serif; color: #0d1340; }
        .eat-head {
          display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;
          justify-content: space-between; margin-bottom: 16px;
        }
        .eat-eyebrow {
          margin: 0 0 4px; font-size: 10px; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase; color: #000168;
        }
        .eat-title { margin: 0; font-size: 20px; font-weight: 700; }
        .eat-sub { margin: 6px 0 0; font-size: 13px; color: #64748b; max-width: 480px; line-height: 1.45; }
        .eat-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
          border-radius: 8px; border: 1px solid #e4e8f2; background: #fff; color: #000168;
          font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .eat-btn:hover:not(:disabled) { background: #eef2ff; }
        .eat-btn:disabled { opacity: .55; cursor: not-allowed; }
        @keyframes eat-spin { to { transform: rotate(360deg); } }
        .eat-spin { animation: eat-spin .8s linear infinite; display: inline-block; }

        .eat-cards {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px;
        }
        @media (max-width: 800px) { .eat-cards { grid-template-columns: 1fr 1fr; } }
        .eat-card {
          position: relative;
          background: #fff;
          border: 1px solid #e4e8f2;
          border-radius: 10px;
          padding: 12px 14px;
          text-align: left;
          cursor: pointer;
          font: inherit;
          overflow: hidden;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }
        .eat-card::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: #000168;
          opacity: .35;
          transition: opacity .18s ease, width .18s ease;
        }
        .eat-card:hover {
          transform: translateY(-2px);
          border-color: #c7d2fe;
          box-shadow: 0 6px 16px rgba(0,1,104,.07);
        }
        .eat-card:hover::before { opacity: 1; width: 3px; }
        .eat-card.is-on {
          border-color: #000168;
          background: #f8f9ff;
          box-shadow: 0 0 0 2px rgba(0,1,104,.08);
        }
        .eat-card.is-on::before { opacity: 1; }
        .eat-card-lbl {
          font-size: 11px; font-weight: 650; color: #64748b;
          text-transform: uppercase; letter-spacing: .04em;
        }
        .eat-card-val {
          margin-top: 4px; font-size: 24px; font-weight: 750;
          color: #000168; font-variant-numeric: tabular-nums;
        }

        .eat-panel {
          background: #fff; border: 1px solid #e4e8f2; border-radius: 12px; overflow: hidden;
        }
        .eat-toolbar {
          display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
          padding: 12px 14px; border-bottom: 1px solid #eef1f7;
        }
        .eat-search {
          display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;
          height: 36px; padding: 0 10px; border: 1px solid #e4e8f2; border-radius: 8px; background: #f8f9fc;
        }
        .eat-search input { border: none; background: transparent; outline: none; width: 100%; font: inherit; font-size: 13px; }
        .eat-select {
          height: 36px; border: 1px solid #e4e8f2; border-radius: 8px; background: #fff;
          padding: 0 10px; font: inherit; font-size: 12.5px; color: #0d1340;
        }
        .eat-count { font-size: 12px; color: #64748b; }

        .eat-table-wrap { overflow-x: auto; }
        .eat-table { width: 100%; border-collapse: collapse; }
        .eat-table th, .eat-table td {
          padding: 11px 14px; text-align: left; border-bottom: 1px solid #f0f2f8; font-size: 13px;
        }
        .eat-table th {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
          color: #64748b; background: #f8f9fc; cursor: pointer; user-select: none; white-space: nowrap;
        }
        .eat-table th:hover { color: #000168; }
        .eat-table tr:hover td { background: #fafbff; }
        .eat-name { font-weight: 650; }
        .eat-email { font-size: 12px; color: #64748b; margin-top: 2px; }
        .eat-status {
          display: inline-flex; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px;
        }
        .eat-status.act-active { background: #eef2ff; color: #000168; }
        .eat-status.act-low { background: #f1f5f9; color: #475569; }
        .eat-status.act-inactive { background: #f8fafc; color: #94a3b8; }

        .eat-btn-sm {
          display: inline-flex; align-items: center; gap: 6px;
          height: 30px; padding: 0 10px; border-radius: 7px;
          font: inherit; font-size: 12px; font-weight: 600;
          border: 1px solid transparent; cursor: pointer; transition: background .15s;
        }
        .eat-btn-sm i { font-size: 13px; }
        .eat-btn-view { background: #000168; color: #fff; border-color: #000168; }
        .eat-btn-view:hover { background: #00009e; border-color: #00009e; }

        .eat-foot { padding: 0 14px 12px; }
        .eat-empty, .eat-err { padding: 28px 16px; text-align: center; color: #64748b; font-size: 13px; }
        .eat-err { color: #b91c1c; }
        .eat-meta { font-size: 11px; color: #94a3b8; margin-top: 10px; }
      `}</style>

      <div className="eat-head">
        <div>
          <p className="eat-eyebrow">{t('frontNav.footerEmployees')}</p>
          <h1 className="eat-title">{t('activityTracking.title')}</h1>
          <p className="eat-sub">
            {t('activityTracking.subtitle')}
          </p>
        </div>
        <button type="button" className="eat-btn" onClick={() => void load()} disabled={loading}>
          <i className={`ti ${loading ? 'ti-loader-2 eat-spin' : 'ti-refresh'}`} />
          {t('qualityHistory.refresh')}
        </button>
      </div>

      <div className="eat-cards">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`eat-card${filter === c.key ? ' is-on' : ''}`}
            onClick={() => setFilter(c.key)}
          >
            <div className="eat-card-lbl">{c.label}</div>
            <div className="eat-card-val">{loading ? '—' : c.value}</div>
          </button>
        ))}
      </div>

      <div className="eat-panel">
        <div className="eat-toolbar">
          <div className="eat-search">
            <i className="ti ti-search" style={{ color: '#94a3b8' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('activityTracking.searchPh')}
            />
          </div>
          <select
            className="eat-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | ActivityStatus)}
            aria-label={t('activityTracking.filterAria')}
          >
            {ACTIVITY_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="eat-count">{loading ? '…' : `${items.length}`}</span>
        </div>

        {error && <div className="eat-err">{error}</div>}

        {!error && (
          <>
            <div className="eat-table-wrap">
              {loading && <TableLoadingBanner label={t('common.loading')} />}
              <table className="eat-table">
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('name')}>{t('employeesAdmin.colEmployee')}</th>
                    <th onClick={() => toggleSort('department')}>{t('planDetail.department')}</th>
                    <th onClick={() => toggleSort('recentActionCount')}>{t('activityTracking.volume')}</th>
                    <th onClick={() => toggleSort('activityStatus')}>{t('common.status')}</th>
                    <th onClick={() => toggleSort('lastLoginAt')}>{t('activityTracking.login')}</th>
                    <th onClick={() => toggleSort('lastActivityAt')}>{t('activityTracking.activity')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                {loading ? (
                  <TableSkeleton cols={7} rows={8} />
                ) : items.length === 0 ? (
                  <tbody>
                    <tr><td colSpan={7} className="eat-empty">{t('activityTracking.noResults')}</td></tr>
                  </tbody>
                ) : (
                  <tbody>
                    {pagedItems.map((item) => (
                      <tr key={item.userId}>
                        <td>
                          <div className="eat-name">{item.name}</div>
                          <div className="eat-email">{item.email || '—'}</div>
                        </td>
                        <td>{item.department || '—'}</td>
                        <td>{item.recentActionCount ?? 0}</td>
                        <td>
                          <span className={`eat-status act-${activityStatusClass(item.activityStatus)}`}>
                            {activityStatusLabel(item.activityStatus)}
                          </span>
                        </td>
                        <td>{fmtDate(item.lastLoginAt)}</td>
                        <td>{fmtDate(item.lastActivityAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="eat-btn-sm eat-btn-view"
                            title={t('employeesAdmin.viewProfile')}
                            onClick={() => openEmployee(item)}
                          >
                            <i className="ti ti-eye" />
                            {t('closedArchive.view')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>
            <div className="eat-foot">
              <TablePagination
                page={page}
                pageSize={PAGE_SIZE}
                total={items.length}
                onChange={setPage}
                loading={loading}
              />
            </div>
          </>
        )}
      </div>

      {summary?.computedAt && !loading && (
        <p className="eat-meta">Dernier calcul : {fmtDate(summary.computedAt)}</p>
      )}
    </div>
  );
}
