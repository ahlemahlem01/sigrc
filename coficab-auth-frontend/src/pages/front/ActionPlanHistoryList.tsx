import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ACTION_PLAN_API_URL, AUTH_API_URL } from '../../config/apiEnv';
import './ActionPlanHistoryList.styles.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { withScope } from '../../services/organizationScopeStore';

interface FieldChange {
  field: string;
  old: string | null;
  new: string | null;
}

interface ActionPlanHistoryItem {
  id: string;
  actionPlanId: string;
  actionPlan?: { title: string; code?: string };
  changedBy: string;
  changedByName?: string;
  actionType: string;
  oldStatus?: number;
  newStatus?: number;
  changesJson?: string;
  oldAssignedToId?: string;
  newAssignedToId?: string;
  oldAssignedToName?: string;
  newAssignedToName?: string;
  note?: string;
  createdAt: string;
}

/** Values are i18n keys. */
const ACTION_LABELS: Record<string, string> = {
  created: 'audit.action.created',
  status_changed: 'audit.action.status_changed',
  fields_updated: 'audit.action.fields_updated',
  assigned: 'audit.action.assigned',
  unassigned: 'audit.action.unassigned',
  archived: 'status.archived',
  restored: 'capaHistory.restored',
  progress_updated: 'audit.action.progress_updated',
  marked_completed: 'capaHistory.markedCompleted',
  warning_sent: 'capaHistory.warningSent',
};

/** Values are i18n keys. */
const STATUS_LABELS: Record<number, string> = {
  1: 'capaHistory.statusWaiting',
  2: 'status.ongoing',
  3: 'planView.statusDone',
  4: 'status.archived',
};

/** Values are i18n keys. */
const FIELD_LABELS: Record<string, string> = {
  title: 'dashboard.colTitle',
  description: 'claimDetail.description',
  deadline: 'myActionPlans.deadline',
  departmentId: 'planDetail.department',
  organizationId: 'usersAdmin.organization',
  type: 'planDetail.type',
  status: 'common.status',
  assignedToId: 'claimDetail.assignedTo',
};

const DOT_COLORS: Record<string, string> = {
  created: '#059669',
  restored: '#059669',
  marked_completed: '#059669',
  status_changed: '#ea580c',
  fields_updated: '#2563eb',
  progress_updated: '#1d4ed8',
  assigned: '#7c3aed',
  unassigned: '#dc2626',
  archived: '#dc2626',
  warning_sent: '#d97706',
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTimestamp(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isSameDay(d, now)) return `${i18n.t('common.today')} · ${time}`;
  if (isSameDay(d, yesterday)) return `${i18n.t('common.yesterday')} · ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${time}`;
}

function parseChangesJson(json?: string): FieldChange[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function isUUID(s?: string) {
  return !!s && /^[0-9a-f-]{36}$/i.test(s);
}

function actionLabel(type: string) {
  return ACTION_LABELS[type] ? i18n.t(ACTION_LABELS[type]) : type.replace(/_/g, ' ');
}

function EventRow({
  item,
  userNames,
}: {
  item: ActionPlanHistoryItem;
  userNames: Record<string, string>;
}) {
  const { t } = useTranslation();
  const changes = parseChangesJson(item.changesJson);
  const actor =
    (!isUUID(item.changedByName) && item.changedByName) ||
    userNames[item.changedBy] ||
    item.changedBy ||
    '—';
  const type = item.actionType || 'unknown';
  const dot = DOT_COLORS[type] || '#94a3b8';

  return (
    <li className="aph-row">
      <span className="aph-dot" style={{ background: dot }} aria-hidden />
      <div className="aph-body">
        <div className="aph-title-line">
          <span className={`aph-badge ${type}`}>{actionLabel(type)}</span>
        </div>

        {type === 'status_changed' &&
          item.oldStatus !== undefined &&
          item.newStatus !== undefined && (
            <div className="aph-delta">
              <span className="aph-pill old">{STATUS_LABELS[item.oldStatus] ? t(STATUS_LABELS[item.oldStatus]) : item.oldStatus}</span>
              <span className="aph-arrow">→</span>
              <span className="aph-pill new">{STATUS_LABELS[item.newStatus] ? t(STATUS_LABELS[item.newStatus]) : item.newStatus}</span>
            </div>
          )}

        {type === 'fields_updated' && changes.length > 0 && (
          <div className="aph-delta" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            {changes.map((c, i) => (
              <div key={i} className="aph-delta">
                <span style={{ color: '#64748b', minWidth: 72 }}>{FIELD_LABELS[c.field] ? t(FIELD_LABELS[c.field]) : c.field}</span>
                <span className="aph-pill old">{c.old || '—'}</span>
                <span className="aph-arrow">→</span>
                <span className="aph-pill new">{c.new || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {(type === 'assigned' || type === 'unassigned') && (
          <div className="aph-delta">
            {item.oldAssignedToName && <span className="aph-pill old">{item.oldAssignedToName}</span>}
            {item.oldAssignedToName && item.newAssignedToName && <span className="aph-arrow">→</span>}
            {item.newAssignedToName && <span className="aph-pill new">{item.newAssignedToName}</span>}
          </div>
        )}

        {item.note && (
          <p className="aph-note">{item.note}</p>
        )}

        <p className="aph-actor">{t('capaHistory.by')} {actor}</p>
      </div>
      <time className="aph-when" dateTime={item.createdAt}>
        {formatTimestamp(item.createdAt)}
      </time>
    </li>
  );
}

export default function ActionPlanHistoryList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [history, setHistory] = useState<ActionPlanHistoryItem[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [openPlans, setOpenPlans] = useState<Record<string, boolean>>({});

  const resolveUserNames = useCallback(
    async (ids: string[]) => {
      if (!accessToken || ids.length === 0) return;
      try {
        const res = await fetch(`${AUTH_API_URL}/api/admin/users`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const users = Array.isArray(data) ? data : data.data ?? [];
        const map: Record<string, string> = {};
        for (const u of users) {
          const id = u.id;
          if (!id) continue;
          map[id] =
            u.fullName ||
            `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
            u.email ||
            id;
        }
        setUserNames(map);
      } catch {
        /* ignore */
      }
    },
    [accessToken]
  );

  const fetchHistory = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(withScope(`${ACTION_PLAN_API_URL}/actionplan/history`), {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: ActionPlanHistoryItem[] = await res.json();
      const sorted = data.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHistory(sorted);
      const ids = Array.from(new Set(sorted.map((h) => h.changedBy).filter(Boolean)));
      await resolveUserNames(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t('capaHistory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, resolveUserNames]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const filtered = useMemo(() => {
    return history.filter((item) => {
      const matchType = filterType === 'all' || item.actionType === filterType;
      const title = item.actionPlan?.title || item.actionPlan?.code || '';
      const matchPlan =
        !filterPlan || title.toLowerCase().includes(filterPlan.toLowerCase());
      const itemDate = new Date(item.createdAt);
      const matchDateFrom =
        !filterDateFrom || itemDate >= new Date(`${filterDateFrom}T00:00:00`);
      const matchDateTo =
        !filterDateTo || itemDate <= new Date(`${filterDateTo}T23:59:59`);
      return matchType && matchPlan && matchDateFrom && matchDateTo;
    });
  }, [history, filterType, filterPlan, filterDateFrom, filterDateTo]);

  const groups = useMemo(() => {
    const acc: Record<string, { title: string; events: ActionPlanHistoryItem[] }> = {};
    for (const item of filtered) {
      if (!acc[item.actionPlanId]) {
        acc[item.actionPlanId] = {
          title: item.actionPlan?.title || item.actionPlan?.code || t('capaHistory.untitledPlan'),
          events: [],
        };
      }
      acc[item.actionPlanId].events.push(item);
    }
    return acc;
  }, [filtered, t]);

  const groupEntries = useMemo(() => Object.entries(groups), [groups]);
  const paged = usePagedList(groupEntries, 10);

  const uniqueTypes = useMemo(
    () => Array.from(new Set(history.map((h) => h.actionType).filter(Boolean))),
    [history]
  );

  const isOpen = (planId: string) => openPlans[planId] !== false;

  const togglePlan = (planId: string) => {
    setOpenPlans((prev) => ({ ...prev, [planId]: !isOpen(planId) }));
  };

  return (
    <div className="aph-page">
      <div className="aph-inner">
        <div className="aph-top">
          <div>
            <h1>{t('capaHistory.title')}</h1>
            <p>{t('capaHistory.subtitle')}</p>
          </div>
          <button type="button" className="aph-btn" disabled={loading} onClick={() => void fetchHistory()}>
            {t('dashboard.refresh')}
          </button>
        </div>

        {error && (
          <div className="aph-error" role="alert">
            {error}
          </div>
        )}

        <div className="aph-stats">
          <div className="aph-stat">
            <span>{t('loginLogs.events')}</span>
            <strong>{filtered.length}</strong>
          </div>
          <div className="aph-stat">
            <span>{t('reportPlans.colPlans')}</span>
            <strong>{groupEntries.length}</strong>
          </div>
          <div className="aph-stat">
            <span>{t('capaHistory.totalLoaded')}</span>
            <strong>{history.length}</strong>
          </div>
        </div>

        <div className="aph-toolbar">
          <input
            className="aph-search"
            type="search"
            placeholder={t('capaHistory.searchPh')}
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
          />
          <input
            className="aph-date"
            type="date"
            value={filterDateFrom}
            max={filterDateTo || undefined}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            aria-label={t('qualityHistory.from')}
          />
          <input
            className="aph-date"
            type="date"
            value={filterDateTo}
            min={filterDateFrom || undefined}
            onChange={(e) => setFilterDateTo(e.target.value)}
            aria-label={t('qualityHistory.to')}
          />
          {(filterDateFrom || filterDateTo) && (
            <button
              type="button"
              className="aph-btn"
              onClick={() => {
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
            >
              {t('capaHistory.clearDates')}
            </button>
          )}
        </div>

        <div className="aph-filters" role="group" aria-label={t('capaHistory.eventType')}>
          <button
            type="button"
            className={`aph-chip${filterType === 'all' ? ' on' : ''}`}
            onClick={() => setFilterType('all')}
          >
            {t('capaHistory.all')}
          </button>
          {uniqueTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`aph-chip${filterType === type ? ' on' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {actionLabel(type)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="aph-panel" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aph-skel" />
            ))}
          </div>
        ) : groupEntries.length === 0 ? (
          <div className="aph-panel">
            <div className="aph-empty">{t('capaHistory.empty')}</div>
          </div>
        ) : (
          <div className="aph-panel">
            {paged.rows.map(([planId, { title, events }]) => (
              <div key={planId} className="aph-plan">
                <div className="aph-plan-head" role="button" tabIndex={0} onClick={() => togglePlan(planId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      togglePlan(planId);
                    }
                  }}
                >
                  <span className="aph-plan-title">{title}</span>
                  <span className="aph-plan-meta">
                    {t('audit.events', { count: events.length })}
                    {isOpen(planId) ? ' · ▾' : ' · ▸'}
                  </span>
                  <button
                    type="button"
                    className="aph-plan-open"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/pages/front/action-plans/${planId}`);
                    }}
                  >
                    {t('capaHistory.viewPlan')}
                  </button>
                </div>
                {isOpen(planId) && (
                  <ul className="aph-list">
                    {events.map((item) => (
                      <EventRow key={item.id} item={item} userNames={userNames} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {groupEntries.length > paged.pageSize && (
              <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={false} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
