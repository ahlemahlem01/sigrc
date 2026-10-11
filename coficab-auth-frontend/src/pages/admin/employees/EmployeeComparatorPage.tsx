import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { adminEmployeeService } from '../../../services/adminEmployeeService';
import { getUsers } from '../../../services/adminService';
import {
  fetchEmployeePerformance,
  EmployeePerformanceRow,
  WorkloadLevel,
} from '../../../services/employeePerformanceService';
import UserAvatar from '../../../components/UserAvatar';
import TableSkeleton, { TableLoadingBanner } from '../../../components/TableSkeleton';
import ComparisonRadar, { COMPARE_COLORS } from './ComparisonRadar';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

const MAX_SELECT = 3;
const MIN_COMPARE = 2;

const WORKLOAD_META: Record<WorkloadLevel, { emoji: string; label: string; order: number }> = {
  low:    { emoji: '🟢', label: 'performanceTable.loadLow', order: 0 },
  medium: { emoji: '🟡', label: 'performanceTable.loadMedium', order: 1 },
  high:   { emoji: '🔴', label: 'performanceTable.loadHigh', order: 2 },
};

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
};

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

function mergeProfiles(profilesRaw: any[], authUsers: any[]) {
  const byId = new Map(authUsers.map((u: any) => [String(u.id ?? u.Id).toLowerCase(), u]));
  const list = unwrap(profilesRaw);
  return list.map((p: any) => {
    const id = String(p.userId ?? p.UserId ?? p.id ?? p.Id ?? '');
    const auth = byId.get(id.toLowerCase());
    return {
      id,
      fullName: pick(p, 'fullName', 'FullName', 'name', 'Name')
        ?? pick(auth, 'fullName', 'FullName', 'userName', 'UserName')
        ?? '—',
      email: pick(p, 'email', 'Email') ?? pick(auth, 'email', 'Email') ?? '',
      profilePictureUrl: pick(p, 'profilePictureUrl', 'ProfilePictureUrl')
        ?? pick(auth, 'profilePictureUrl', 'ProfilePictureUrl'),
      poste: pick(p, 'poste', 'Poste'),
      equipe: pick(p, 'equipe', 'Equipe'),
      ligneProduction: pick(p, 'ligneProduction', 'LigneProduction'),
      telephone: pick(p, 'telephone', 'Telephone', 'phone', 'Phone'),
      department: pick(p, 'department', 'Department', 'departmentName', 'DepartmentName'),
    };
  }).filter((p: any) => p.id);
}

type MetricKey = 'activeDossiers' | 'closureRate' | 'avgDelayDays' | 'overdueCount' | 'workload';

type MetricDef = {
  key: MetricKey;
  /** i18n key */
  label: string;
  /** true = higher is better */
  higherBetter: boolean;
  format: (row: EmployeePerformanceRow) => string;
  numeric: (row: EmployeePerformanceRow) => number;
};

const METRICS: MetricDef[] = [
  {
    key: 'activeDossiers',
    label: 'comparator.activeFiles',
    higherBetter: false,
    format: (r) => String(r.activeDossiers),
    numeric: (r) => r.activeDossiers,
  },
  {
    key: 'closureRate',
    label: 'comparator.closureRate',
    higherBetter: true,
    format: (r) => `${r.closureRate}%`,
    numeric: (r) => r.closureRate,
  },
  {
    key: 'avgDelayDays',
    label: 'comparator.avgDelay',
    higherBetter: false,
    format: (r) => (r.avgDelayDays > 0 ? i18n.t('recognition.daysShort', { n: r.avgDelayDays }) : '—'),
    numeric: (r) => r.avgDelayDays,
  },
  {
    key: 'overdueCount',
    label: 'comparator.late',
    higherBetter: false,
    format: (r) => (r.overdueCount > 0 ? String(r.overdueCount) : '—'),
    numeric: (r) => r.overdueCount,
  },
  {
    key: 'workload',
    label: 'comparator.workload',
    higherBetter: false,
    format: (r) => {
      const m = WORKLOAD_META[r.workload];
      return `${m.emoji} ${i18n.t(m.label)}`;
    },
    numeric: (r) => WORKLOAD_META[r.workload].order,
  },
];

function bestIndices(rows: EmployeePerformanceRow[], metric: MetricDef): Set<number> {
  if (rows.length === 0) return new Set();
  const values = rows.map(metric.numeric);
  const target = metric.higherBetter ? Math.max(...values) : Math.min(...values);
  return new Set(values.map((v, i) => (v === target ? i : -1)).filter((i) => i >= 0));
}

export default function EmployeeComparatorPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<EmployeePerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [profilesRaw, usersRaw] = await Promise.all([
        adminEmployeeService.getAllProfiles(accessToken),
        getUsers(accessToken),
      ]);
      const profiles = mergeProfiles(profilesRaw, unwrap(usersRaw));
      const perf = await fetchEmployeePerformance(accessToken, profiles);
      setRows(perf);
    } catch (e) {
      console.error('Comparator load failed:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.poste ?? '').toLowerCase().includes(q) ||
        (r.equipe ?? '').toLowerCase().includes(q) ||
        (r.department ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const selectedRows = useMemo(
    () => selected.map((id) => rows.find((r) => r.userId === id)).filter(Boolean) as EmployeePerformanceRow[],
    [selected, rows],
  );

  const toggle = (userId: string) => {
    setSelected((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, userId];
    });
  };

  const canCompare = selected.length >= MIN_COMPARE;
  const atMax = selected.length >= MAX_SELECT;

  if (comparing && selectedRows.length >= MIN_COMPARE) {
    return (
      <div className="cmp-page">
        <div className="cmp-toolbar">
          <div>
            <div className="cmp-title">{t('comparator.title')}</div>
            <div className="cmp-sub">
              {t('comparator.sideBySide', { count: selectedRows.length })}
            </div>
          </div>
          <button type="button" className="cmp-btn cmp-btn-ghost" onClick={() => setComparing(false)}>
            <i className="ti ti-x" /> {t('fiveWhy.close')}
          </button>
        </div>

        <div className="cmp-headers">
          <div className="cmp-metric-col" />
          {selectedRows.map((emp, i) => (
            <div key={emp.userId} className="cmp-emp-head" style={{ borderTopColor: COMPARE_COLORS[i] }}>
              <UserAvatar
                user={{ id: emp.userId, fullName: emp.fullName, profilePictureUrl: emp.profilePictureUrl }}
                name={emp.fullName}
                size={40}
                radius="lg"
              />
              <div className="cmp-emp-meta">
                <div className="cmp-emp-name">{emp.fullName}</div>
                <div className="cmp-emp-email">{emp.email || '—'}</div>
                {(emp.poste || emp.equipe) && (
                  <div className="cmp-emp-role">{[emp.poste, emp.equipe].filter(Boolean).join(' · ')}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="cmp-grid-wrap">
          <table className="cmp-grid">
            <tbody>
              {METRICS.map((metric) => {
                const winners = bestIndices(selectedRows, metric);
                return (
                  <tr key={metric.key}>
                    <th>{t(metric.label)}</th>
                    {selectedRows.map((emp, i) => (
                      <td key={emp.userId} className={winners.has(i) ? 'is-best' : undefined}>
                        {metric.format(emp)}
                        {winners.has(i) && <span className="cmp-best-tag">{t('comparator.best')}</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="cmp-radar-card">
          <div className="cmp-radar-title">{t('skills.radarName')}</div>
          <div className="cmp-radar-sub">{t('comparator.radarSub')}</div>
          <ComparisonRadar employees={selectedRows} height={300} />
        </div>

        <style>{PAGE_CSS}</style>
      </div>
    );
  }

  return (
    <div className="cmp-page">
      <div className="cmp-toolbar">
        <div>
          <div className="cmp-title">{t('comparator.title')}</div>
          <div className="cmp-sub">
            {t('comparator.intro', { max: MAX_SELECT })}
          </div>
        </div>
        <button
          type="button"
          className="cmp-btn cmp-btn-primary"
          disabled={!canCompare}
          onClick={() => setComparing(true)}
          title={canCompare ? t('comparator.open') : t('comparator.selectAtLeast', { min: MIN_COMPARE })}
        >
          <i className="ti ti-arrows-diff" />
          {t('comparator.compare')}{selected.length > 0 ? ` (${selected.length})` : ''}
        </button>
      </div>

      <div className="cmp-select-bar">
        <div className="cmp-search">
          <i className="ti ti-search" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('comparator.searchPh')}
          />
        </div>
        <div className="cmp-hint">
          {selected.length === 0 && t('comparator.noSelection')}
          {selected.length === 1 && t('comparator.oneSelected')}
          {selected.length >= 2 && t('comparator.readyToCompare', { count: selected.length })}
          {atMax && ` ${t('comparator.maxReached')}`}
        </div>
        {selected.length > 0 && (
          <button type="button" className="cmp-btn cmp-btn-ghost cmp-btn-sm" onClick={() => setSelected([])}>
            {t('comparator.clearSelection')}
          </button>
        )}
      </div>

      {loading && <TableLoadingBanner label={t('performanceTable.loading')} />}

      <div className={`cmp-table-wrap${loading ? ' is-loading' : ''}`}>
        <table className="cmp-table">
          <thead>
            <tr>
              <th className="cmp-check-col" />
              <th>{t('employeesAdmin.colEmployee')}</th>
              <th>{t('comparator.activeFiles')}</th>
              <th>{t('comparator.closureRate')}</th>
              <th>{t('comparator.avgDelay')}</th>
              <th>{t('comparator.late')}</th>
              <th>{t('comparator.load')}</th>
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton cols={7} rows={8} />
          ) : filtered.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7} className="cmp-empty">{t('comparator.noneFound')}</td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {filtered.map((row) => {
                const checked = selected.includes(row.userId);
                const disabled = !checked && atMax;
                const wl = WORKLOAD_META[row.workload];
                return (
                  <tr
                    key={row.userId}
                    className={`cmp-row${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                    onClick={() => !disabled && toggle(row.userId)}
                  >
                    <td className="cmp-check-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(row.userId)}
                        aria-label={t('comparator.selectAria', { name: row.fullName })}
                      />
                    </td>
                    <td>
                      <div className="cmp-name">
                        <UserAvatar
                          user={{ id: row.userId, fullName: row.fullName, profilePictureUrl: row.profilePictureUrl }}
                          name={row.fullName}
                          size={28}
                          radius="lg"
                        />
                        <span>
                          {row.fullName}
                          {(row.poste || row.equipe) && (
                            <div className="cmp-name-sub">
                              {[row.poste, row.equipe].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="cmp-num">{row.activeDossiers}</td>
                    <td className="cmp-num">{row.closureRate}%</td>
                    <td className="cmp-num">{row.avgDelayDays > 0 ? t('recognition.daysShort', { n: row.avgDelayDays }) : '—'}</td>
                    <td className={`cmp-num${row.overdueCount > 0 ? ' late' : ''}`}>
                      {row.overdueCount > 0 ? row.overdueCount : '—'}
                    </td>
                    <td>
                      <span className="cmp-wl">
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

      <style>{PAGE_CSS}</style>
    </div>
  );
}

const PAGE_CSS = `
  @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');

  .cmp-page {
    padding: 20px 24px 32px;
    font-family: 'Inter', sans-serif;
    max-width: 1200px;
  }
  .cmp-toolbar {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 18px; flex-wrap: wrap;
  }
  .cmp-title {
    font-size: 20px; font-weight: 800; color: ${COFICAB.ink};
    letter-spacing: -0.02em;
  }
  .cmp-sub { font-size: 13px; color: ${COFICAB.muted}; margin-top: 4px; line-height: 1.45; }

  .cmp-btn {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 650;
    border: 1px solid transparent; cursor: pointer; font-family: inherit;
    transition: all .15s;
  }
  .cmp-btn i { font-size: 15px; }
  .cmp-btn-sm { padding: 6px 11px; font-size: 12px; }
  .cmp-btn-primary {
    background: ${COFICAB.navy}; color: #fff; border-color: ${COFICAB.navy};
  }
  .cmp-btn-primary:hover:not(:disabled) { background: ${COFICAB.mid}; }
  .cmp-btn-primary:disabled { opacity: .4; cursor: not-allowed; }
  .cmp-btn-ghost {
    background: #f3f5fa; color: #374151; border-color: ${COFICAB.line};
  }
  .cmp-btn-ghost:hover { background: #e8ecf6; color: ${COFICAB.navy}; }

  .cmp-select-bar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .cmp-search {
    display: flex; align-items: center; gap: 8px; background: #f8f9fc;
    border: 1px solid ${COFICAB.line}; border-radius: 10px; padding: 9px 12px;
    flex: 1; min-width: 220px; max-width: 360px;
  }
  .cmp-search:focus-within {
    border-color: ${COFICAB.navy}; background: #fff;
    box-shadow: 0 0 0 3px rgba(0,1,104,.06);
  }
  .cmp-search i { color: #94a3b8; font-size: 15px; }
  .cmp-search input {
    border: none; outline: none; background: transparent; width: 100%;
    font-size: 13px; color: ${COFICAB.ink}; font-family: inherit;
  }
  .cmp-hint { font-size: 12.5px; color: ${COFICAB.muted}; font-weight: 500; }

  .cmp-table-wrap {
    border: 1px solid ${COFICAB.line}; border-radius: 12px; overflow: hidden;
    background: #fff;
  }
  .cmp-table-wrap.is-loading { opacity: .85; }
  .cmp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cmp-table th {
    padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600;
    color: #94a3b8; text-transform: uppercase; letter-spacing: .5px;
    background: #f8f9fc; border-bottom: 1px solid ${COFICAB.line};
  }
  .cmp-table td {
    padding: 11px 14px; border-bottom: 1px solid #f0f2f8;
    color: #374151; vertical-align: middle;
  }
  .cmp-table tr:last-child td { border-bottom: none; }
  .cmp-check-col { width: 42px; text-align: center; }
  .cmp-check-col input {
    width: 16px; height: 16px; accent-color: #000168; cursor: pointer;
  }
  .cmp-row { cursor: pointer; transition: background .12s; }
  .cmp-row:hover td { background: #fafbff; }
  .cmp-row.is-selected td { background: #f0f4ff; }
  .cmp-row.is-disabled { opacity: .45; cursor: not-allowed; }
  .cmp-row.is-disabled:hover td { background: transparent; }
  .cmp-name { display: flex; align-items: center; gap: 10px; font-weight: 600; color: ${COFICAB.ink}; }
  .cmp-name-sub { font-size: 11px; color: #94a3b8; font-weight: 500; margin-top: 1px; }
  .cmp-num { font-variant-numeric: tabular-nums; font-weight: 600; }
  .cmp-num.late { color: ${COFICAB.danger}; }
  .cmp-wl { font-size: 12px; color: ${COFICAB.muted}; }
  .cmp-empty { text-align: center; padding: 40px !important; color: #94a3b8; }

  /* comparison view */
  .cmp-headers {
    display: grid;
    grid-template-columns: 180px repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px; margin-bottom: 14px;
  }
  .cmp-metric-col { min-height: 1px; }
  .cmp-emp-head {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; background: #fff;
    border: 1px solid ${COFICAB.line}; border-top: 3px solid;
    border-radius: 12px;
  }
  .cmp-emp-meta { min-width: 0; }
  .cmp-emp-name {
    font-size: 14px; font-weight: 700; color: ${COFICAB.ink};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmp-emp-email, .cmp-emp-role {
    font-size: 11.5px; color: ${COFICAB.muted};
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .cmp-emp-role { margin-top: 2px; }

  .cmp-grid-wrap {
    border: 1px solid ${COFICAB.line}; border-radius: 12px;
    overflow: hidden; background: #fff; margin-bottom: 16px;
  }
  .cmp-grid { width: 100%; border-collapse: collapse; font-size: 13px; }
  .cmp-grid th {
    width: 180px; text-align: left; padding: 14px 16px;
    font-size: 12.5px; font-weight: 650; color: ${COFICAB.muted};
    background: #f8f9fc; border-bottom: 1px solid #f0f2f8;
    border-right: 1px solid #f0f2f8;
  }
  .cmp-grid td {
    padding: 14px 16px; text-align: center; font-weight: 700;
    color: ${COFICAB.ink}; border-bottom: 1px solid #f0f2f8;
    position: relative;
  }
  .cmp-grid tr:last-child th,
  .cmp-grid tr:last-child td { border-bottom: none; }
  .cmp-grid td.is-best {
    background: ${COFICAB.okSoft};
    color: ${COFICAB.ok};
  }
  .cmp-best-tag {
    display: inline-block; margin-left: 8px;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .4px; padding: 2px 7px; border-radius: 999px;
    background: #ccfbf1; color: ${COFICAB.ok}; vertical-align: middle;
  }

  .cmp-radar-card {
    background: #fff; border: 1px solid ${COFICAB.line};
    border-radius: 12px; padding: 18px 20px 8px;
  }
  .cmp-radar-title {
    font-size: 14px; font-weight: 700; color: ${COFICAB.ink};
  }
  .cmp-radar-sub { font-size: 12px; color: ${COFICAB.muted}; margin: 4px 0 12px; }

  @media (max-width: 720px) {
    .cmp-headers { grid-template-columns: 1fr; }
    .cmp-metric-col { display: none; }
    .cmp-grid th { width: 120px; font-size: 11.5px; }
  }
`;
