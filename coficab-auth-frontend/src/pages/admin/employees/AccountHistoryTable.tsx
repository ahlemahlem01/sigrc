import { useEffect, useMemo, useState } from 'react';
import {
  AccountHistoryRow,
  AccountEventType,
  EVENT_LABELS,
  ModificationChange,
} from '../../../services/accountHistoryService';
import TablePagination from '../../../components/TablePagination';
import TableSkeleton, { TableLoadingBanner } from '../../../components/TableSkeleton';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../../i18n';

const PAGE_SIZE = 15;

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(dateLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const isValidEmail = (value?: string) => !!value && value.includes('@') && value !== '—';

const resolveDisplayName = (value?: string) => {
  if (!value || value === '—') return '';
  if (value.includes('@')) return value.split('@')[0];
  return value;
};

/** desc = i18n key */
const EVENT_STYLES: Record<AccountEventType, { bg: string; color: string; icon: string; desc: string }> = {
  creation:     { bg: '#f0fdf4', color: '#15803d', icon: 'ti-user-plus',  desc: 'accountHistory.descCreation' },
  assignment:   { bg: '#dbeafe', color: '#1d4ed8', icon: 'ti-user-check', desc: 'accountHistory.descAssignment' },
  modification: { bg: '#eff6ff', color: '#1e40af', icon: 'ti-pencil',     desc: 'accountHistory.descModification' },
  lock:         { bg: '#fff7ed', color: '#c2410c', icon: 'ti-lock',       desc: 'accountHistory.descLock' },
  unlock:       { bg: '#f0fdf4', color: '#15803d', icon: 'ti-lock-open',  desc: 'accountHistory.descUnlock' },
  role_change:  { bg: '#f5f3ff', color: '#6d28d9', icon: 'ti-shield',     desc: 'accountHistory.descRoleChange' },
};

const ALL_TYPES: AccountEventType[] = [
  'creation', 'assignment', 'modification', 'lock', 'unlock', 'role_change',
];

type PeriodKey = 'all' | '7d' | '30d' | '90d';

type Props = {
  rows: AccountHistoryRow[];
  loading?: boolean;
};

function ChangeList({ changes }: { changes: ModificationChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="aht-changes">
      {changes.map((c, i) => (
        <div key={`${c.field}-${i}`} className="aht-change-row">
          <span className="aht-change-field">{c.field}</span>
          <span className="aht-change-val aht-change-from">{c.from}</span>
          <i className="ti ti-arrow-right aht-change-arrow" />
          <span className="aht-change-val aht-change-to">{c.to}</span>
        </div>
      ))}
    </div>
  );
}

function DetailCell({ row }: { row: AccountHistoryRow }) {
  const isStructured =
    (row.eventType === 'modification' || row.eventType === 'role_change') &&
    (row.changes?.length ?? 0) > 0;

  if (isStructured) {
    return (
      <div className="aht-detail-cell">
        <div className="aht-detail-summary">{row.detail}</div>
        <ChangeList changes={row.changes!} />
      </div>
    );
  }

  return <span className="aht-detail-plain">{row.detail}</span>;
}

export default function AccountHistoryTable({ rows, loading }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountEventType | ''>('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, typeFilter, period]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const now = Date.now();
    const periodMs: Record<PeriodKey, number> = {
      all: 0,
      '7d': 7 * 86_400_000,
      '30d': 30 * 86_400_000,
      '90d': 90 * 86_400_000,
    };
    const cutoff = period === 'all' ? 0 : now - periodMs[period];

    return rows
      .filter((r) => {
        if (typeFilter && r.eventType !== typeFilter) return false;
        if (cutoff && new Date(r.date).getTime() < cutoff) return false;
        if (!q) return true;
        const changeHay = (r.changes ?? []).map((c) => `${c.field} ${c.from} ${c.to}`).join(' ');
        const hay = [r.employeeName, r.employeeEmail, r.detail, r.performedBy, changeHay, EVENT_LABELS[r.eventType]]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [rows, search, typeFilter, period]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {loading && <TableLoadingBanner label={t('accountHistory.loading')} />}

      <div className="aht-filters">
        <div className="aht-search">
          <i className="ti ti-search" />
          <input
            placeholder={t('accountHistory.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
          />
          {search && (
            <button type="button" className="aht-clear" onClick={() => setSearch('')} aria-label={t('accountHistory.clear')}>
              <i className="ti ti-x" />
            </button>
          )}
        </div>
        <select className="aht-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as AccountEventType | '')} disabled={loading}>
          <option value="">{t('accountHistory.allTypes')}</option>
          {ALL_TYPES.map((type) => (
            <option key={type} value={type}>{EVENT_LABELS[type]}</option>
          ))}
        </select>
        <select className="aht-select" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} disabled={loading}>
          <option value="all">{t('accountHistory.allPeriods')}</option>
          <option value="7d">{t('accountHistory.last7')}</option>
          <option value="30d">{t('accountHistory.last30')}</option>
          <option value="90d">{t('accountHistory.last90')}</option>
        </select>
      </div>

      <div className={`aht-table-wrap${loading ? ' is-loading' : ''}`}>
        <table className="aht-table">
          <thead>
            <tr>
              <th>{t('audit.colDate')}</th>
              <th>{t('employeesAdmin.colEmployee')}</th>
              <th>{t('accountHistory.colType')}</th>
              <th>{t('audit.colDetail')}</th>
              <th>{t('accountHistory.colBy')}</th>
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton cols={5} rows={8} />
          ) : paged.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={5} className="aht-empty-cell">
                  <i className="ti ti-history" />
                  {t('accountHistory.empty')}
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {paged.map((r) => {
                const style = EVENT_STYLES[r.eventType] ?? EVENT_STYLES.modification;
                const typeLabel = EVENT_LABELS[r.eventType] ?? t('calendar.event');
                const employeeLabel =
                  r.employeeName?.trim()
                  || resolveDisplayName(r.employeeEmail)
                  || t('accountHistory.unknownEmployee');
                return (
                  <tr key={r.id}>
                    <td className="aht-date">{fmt(r.date)}</td>
                    <td className="aht-emp">
                      <div className="aht-emp-name">{employeeLabel}</div>
                      {r.employeeEmail && isValidEmail(r.employeeEmail) && r.employeeName && (
                        <div className="aht-emp-email">{r.employeeEmail}</div>
                      )}
                    </td>
                    <td>
                      <span className="aht-badge" style={{ background: style.bg, color: style.color }} title={t(style.desc)}>
                        <i className={`ti ${style.icon}`} /> {typeLabel}
                      </span>
                    </td>
                    <td className="aht-detail"><DetailCell row={r} /></td>
                    <td className="aht-actor">{r.performedBy || t('audit.system')}</td>
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
        total={loading ? 0 : filtered.length}
        onChange={setPage}
        loading={loading}
      />

      <style>{`
        .aht-filters {
          display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px;
        }
        .aht-search {
          display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px; max-width: 320px;
          background: #f8f9fc; border: 1px solid ${COFICAB.line}; border-radius: 10px; padding: 8px 12px;
        }
        .aht-search:focus-within { border-color: ${COFICAB.navy}; background: #fff; }
        .aht-search i { color: #94a3b8; font-size: 15px; }
        .aht-search input {
          border: none; outline: none; background: transparent; width: 100%;
          font-size: 13px; font-family: 'Inter', sans-serif; color: ${COFICAB.ink};
        }
        .aht-clear { border: none; background: none; cursor: pointer; color: #94a3b8; padding: 0; }
        .aht-select {
          border: 1px solid ${COFICAB.line}; border-radius: 10px; padding: 8px 12px;
          font-size: 13px; font-family: 'Inter', sans-serif; color: #374151; background: #fff;
        }
        .aht-table-wrap {
          overflow-x: auto; border: 1px solid ${COFICAB.line}; border-radius: 12px;
          transition: opacity .2s;
        }
        .aht-table-wrap.is-loading { opacity: .72; pointer-events: none; }
        .aht-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 820px; }
        .aht-table th {
          padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 600;
          color: #94a3b8; text-transform: uppercase; letter-spacing: .5px;
          background: #f8f9fc; border-bottom: 1px solid ${COFICAB.line};
        }
        .aht-table td { padding: 11px 14px; border-bottom: 1px solid #f0f2f8; vertical-align: top; }
        .aht-table tr:hover td { background: #fafbff; }
        .aht-date { color: #94a3b8; font-size: 12px; white-space: nowrap; width: 140px; }
        .aht-emp-name { font-weight: 600; color: ${COFICAB.ink}; }
        .aht-emp-email { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .aht-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: .35px; padding: 4px 9px; border-radius: 999px; white-space: nowrap;
        }
        .aht-badge i { font-size: 12px; }
        .aht-detail { color: ${COFICAB.muted}; min-width: 280px; max-width: 420px; }
        .aht-detail-plain { display: block; line-height: 1.45; }
        .aht-detail-summary { font-size: 12px; color: #475569; margin-bottom: 8px; line-height: 1.45; }
        .aht-changes { display: flex; flex-direction: column; gap: 6px; }
        .aht-change-row {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
          padding: 6px 10px; background: #f8faff; border: 1px solid #e0e7ff; border-radius: 8px;
          font-size: 12px;
        }
        .aht-change-field {
          font-weight: 700; color: ${COFICAB.navy}; font-size: 11px;
          text-transform: uppercase; letter-spacing: .3px; min-width: 88px;
        }
        .aht-change-val {
          padding: 2px 8px; border-radius: 6px; font-weight: 600; max-width: 160px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .aht-change-from { background: #fef2f2; color: #b91c1c; text-decoration: line-through; }
        .aht-change-to { background: #f0fdf4; color: #15803d; }
        .aht-change-arrow { font-size: 12px; color: #94a3b8; }
        .aht-actor { color: ${COFICAB.muted}; font-size: 12px; white-space: nowrap; }
        .aht-empty-cell { text-align: center; padding: 40px; color: #94a3b8; }
        .aht-empty-cell i { display: block; font-size: 32px; margin-bottom: 8px; color: #dde3ef; }
      `}</style>
    </>
  );
}
