import { useMemo, useState } from 'react';
import UserAvatar from '../../../components/UserAvatar';
import TablePagination from '../../../components/TablePagination';
import TableSkeleton, { TableLoadingBanner } from '../../../components/TableSkeleton';
import type { EmployeePerformanceRow, WorkloadLevel } from '../../../services/employeePerformanceService';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

const PAGE_SIZE = 15;

type SortKey = 'fullName' | 'activeDossiers' | 'closureRate' | 'avgDelayDays' | 'overdueCount' | 'workload';
type SortDir = 'asc' | 'desc';

type Props = {
  rows: EmployeePerformanceRow[];
  loading?: boolean;
  onRowClick: (row: EmployeePerformanceRow) => void;
};

const WORKLOAD_META: Record<WorkloadLevel, { emoji: string; label: string; bg: string; color: string }> = {
  low:    { emoji: '🟢', label: 'performanceTable.loadLow', bg: '#f0fdfa', color: '#0f766e' },
  medium: { emoji: '🟡', label: 'performanceTable.loadMedium', bg: '#fffbeb', color: '#b45309' },
  high:   { emoji: '🔴', label: 'performanceTable.loadHigh', bg: '#fef2f2', color: '#b91c1c' },
};

const WORKLOAD_ORDER: Record<WorkloadLevel, number> = { low: 0, medium: 1, high: 2 };

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className={`ept-sortable${active ? ' active' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <i className={`ti ${active ? (dir === 'asc' ? 'ti-chevron-up' : 'ti-chevron-down') : 'ti-selector'}`} />
    </th>
  );
}

function ClosureBar({ rate }: { rate: number }) {
  const color = rate >= 75 ? COFICAB.ok : rate >= 50 ? '#b45309' : COFICAB.danger;
  return (
    <div className="ept-bar-wrap">
      <div className="ept-bar-track">
        <div className="ept-bar-fill" style={{ width: `${Math.min(100, rate)}%`, background: color }} />
      </div>
      <span className="ept-bar-val" style={{ color }}>{rate}%</span>
    </div>
  );
}

function TableSkeletonRows() {
  return <TableSkeleton cols={6} rows={8} />;
}

export default function EmployeePerformanceTable({ rows, loading, onRowClick }: Props) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>('closureRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'fullName' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const list = [...rows];
    const mul = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'fullName': cmp = a.fullName.localeCompare(b.fullName, i18n.language); break;
        case 'activeDossiers': cmp = a.activeDossiers - b.activeDossiers; break;
        case 'closureRate': cmp = a.closureRate - b.closureRate; break;
        case 'avgDelayDays': cmp = a.avgDelayDays - b.avgDelayDays; break;
        case 'overdueCount': cmp = a.overdueCount - b.overdueCount; break;
        case 'workload': cmp = WORKLOAD_ORDER[a.workload] - WORKLOAD_ORDER[b.workload]; break;
        default: break;
      }
      return cmp * mul;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!loading && sorted.length === 0) {
    return (
      <div className="ept-empty">
        <i className="ti ti-chart-radar" />
        <p>{t('performanceTable.empty')}</p>
      </div>
    );
  }

  return (
    <>
      {loading && <TableLoadingBanner label={t('performanceTable.loading')} />}

      <div className={`ept-table-wrap${loading ? ' is-loading' : ''}`}>
        <table className="ept-table">
          <thead>
            <tr>
              <SortHeader label={t('employeesAdmin.colEmployee')} sortKey="fullName" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label={t('employeeProfileAdmin.kpiActive')} sortKey="activeDossiers" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label={t('employeeProfileAdmin.kpiClosure')} sortKey="closureRate" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label={t('performanceTable.avgDelay')} sortKey="avgDelayDays" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label={t('employeesAdmin.perfLate')} sortKey="overdueCount" current={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label={t('employeesAdmin.perfLoad')} sortKey="workload" current={sortKey} dir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          {loading ? (
            <TableSkeletonRows />
          ) : (
            <tbody>
              {paged.map((row) => {
                const wl = WORKLOAD_META[row.workload];
                return (
                  <tr
                    key={row.userId}
                    className="ept-row"
                    onClick={() => onRowClick(row)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }}
                  >
                    <td>
                      <div className="ept-name">
                        <UserAvatar
                          user={{ id: row.userId, fullName: row.fullName, profilePictureUrl: row.profilePictureUrl }}
                          name={row.fullName}
                          size={28}
                          radius="lg"
                        />
                        <span>
                          {row.fullName}
                          {(row.poste || row.equipe) && (
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                              {[row.poste, row.equipe].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="ept-num">{row.activeDossiers}</td>
                    <td><ClosureBar rate={row.closureRate} /></td>
                    <td className="ept-num" title={t('performanceTable.avgDelayHint')}>
                      {row.avgDelayDays > 0 ? t('employeeProfileAdmin.days', { count: row.avgDelayDays }) : '—'}
                    </td>
                    <td className={`ept-num${row.overdueCount > 0 ? ' late' : ''}`}>
                      {row.overdueCount > 0 ? row.overdueCount : '—'}
                    </td>
                    <td>
                      <span className="ept-workload" style={{ background: wl.bg, color: wl.color }}>
                        {wl.emoji} {t(wl.label)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={loading ? 0 : sorted.length}
        onChange={setPage}
        loading={loading}
      />

      <style>{`
        .ept-table-wrap {
          overflow-x: auto; border: 1px solid ${COFICAB.line}; border-radius: 12px;
          transition: opacity .2s;
        }
        .ept-table-wrap.is-loading { opacity: .72; pointer-events: none; }
        .ept-table {
          width: 100%; border-collapse: collapse; font-size: 13px; min-width: 820px; table-layout: fixed;
        }
        .ept-table th {
          padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600;
          color: #94a3b8; text-transform: uppercase; letter-spacing: .5px;
          background: #f8f9fc; border-bottom: 1px solid ${COFICAB.line}; white-space: nowrap;
          user-select: none;
        }
        .ept-table th:nth-child(1) { width: 22%; }
        .ept-table th:nth-child(3) { width: 18%; }
        .ept-sortable { cursor: pointer; }
        .ept-sortable:hover { color: ${COFICAB.navy}; }
        .ept-sortable.active { color: ${COFICAB.navy}; }
        .ept-sortable i { font-size: 12px; margin-left: 4px; vertical-align: middle; opacity: .7; }
        .ept-table td {
          padding: 11px 14px; border-bottom: 1px solid #f0f2f8; color: #374151; vertical-align: middle;
        }
        .ept-row { cursor: pointer; transition: background .12s; }
        .ept-row:hover td { background: #fafbff; }
        .ept-name { display: flex; align-items: center; gap: 10px; font-weight: 600; color: ${COFICAB.ink}; }
        .ept-num { font-variant-numeric: tabular-nums; font-weight: 600; text-align: center; }
        .ept-num.late { color: ${COFICAB.danger}; }
        .ept-bar-wrap { display: flex; align-items: center; gap: 10px; }
        .ept-bar-track { flex: 1; height: 8px; background: #eef1f7; border-radius: 999px; overflow: hidden; }
        .ept-bar-fill { height: 100%; border-radius: 999px; }
        .ept-bar-val { font-size: 12px; font-weight: 700; min-width: 36px; text-align: right; }
        .ept-workload {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap;
        }
        .ept-empty { text-align: center; padding: 48px 24px; color: #94a3b8; }
        .ept-empty i { font-size: 40px; color: #dde3ef; display: block; margin-bottom: 12px; }
      `}</style>
    </>
  );
}
