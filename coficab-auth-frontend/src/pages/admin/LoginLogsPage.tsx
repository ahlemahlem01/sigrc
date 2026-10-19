import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { AUTH_API_URL as AUTH_API } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { withScope } from '../../services/organizationScopeStore';
const PAGE_SIZE = 25;

type LoginEvent = {
  id: string;
  actor: string;
  target: string;
  action: string;
  detail: string;
  timestamp: string;
};

/** label = i18n key */
const ACTION_META: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  LOGIN: { label: 'audit.action.LOGIN', bg: '#eef2ff', color: '#000168', icon: 'ti-login' },
  LOCK: { label: 'audit.action.LOCK', bg: '#fff1f2', color: '#be123c', icon: 'ti-lock' },
  LOCKOUT: { label: 'audit.action.LOCKOUT', bg: '#fff1f2', color: '#be123c', icon: 'ti-lock-access' },
  UNLOCK: { label: 'audit.action.UNLOCK', bg: '#ecfdf5', color: '#047857', icon: 'ti-lock-open' },
  RESET_PASSWORD: { label: 'audit.action.RESET_PASSWORD', bg: '#fffbeb', color: '#b45309', icon: 'ti-key' },
};

const LOGIN_ACTIONS = new Set(['LOGIN', 'LOCK', 'LOCKOUT', 'UNLOCK', 'RESET_PASSWORD']);

function emailLocalPart(email: string) {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/** Détail lisible même si l’API a enregistré Detail = null (anciens LOGIN). */
function resolveDetail(
  action: string,
  actorEmail: string,
  targetEmail: string,
  raw: unknown,
): string {
  const fromApi = String(raw ?? '').trim();
  if (fromApi) return fromApi;

  const who = emailLocalPart(targetEmail) || targetEmail || emailLocalPart(actorEmail) || actorEmail || i18n.t('loginLogs.account');
  switch (action) {
    case 'LOGIN':
      return i18n.t('audit.detailLogin', { target: who });
    case 'LOCK':
      return i18n.t('audit.detailLock', { target: who });
    case 'LOCKOUT':
      return i18n.t('audit.detailLockout', { target: who });
    case 'UNLOCK':
      return i18n.t('audit.detailUnlock', { target: who });
    case 'RESET_PASSWORD':
      return i18n.t('audit.detailReset', { target: who });
    default:
      return '—';
  }
}

function actionMeta(action: string) {
  const meta = ACTION_META[action.toUpperCase()];
  return meta
    ? { ...meta, label: i18n.t(meta.label) }
    : { label: action, bg: '#f1f5f9', color: '#475569', icon: 'ti-activity' };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LoginLogsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('LOGIN');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    const started = Date.now();
    const MIN_VISIBLE_MS = 700;
    try {
      const res = await fetch(withScope(`${AUTH_API}/api/admin/audit-logs?page=1&pageSize=1000`), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const logs: any[] = data.logs ?? data ?? [];
      const mapped: LoginEvent[] = logs
        .filter((l) => LOGIN_ACTIONS.has(String(l.action || '').toUpperCase()))
        .map((l) => {
          const action = String(l.action || l.Action || '').toUpperCase();
          const actorEmail = String(l.actorEmail ?? l.ActorEmail ?? '');
          const targetEmail = String(l.targetEmail ?? l.TargetEmail ?? '');
          return {
            id: `login-${l.id ?? l.Id}`,
            action,
            actor: emailLocalPart(actorEmail) || actorEmail || '—',
            target: emailLocalPart(targetEmail) || targetEmail || '—',
            detail: resolveDetail(action, actorEmail, targetEmail, l.detail ?? l.Detail),
            timestamp: String(l.timestamp ?? l.Timestamp ?? ''),
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(mapped);
    } catch {
      setError(i18n.t('loginLogs.loadFailed'));
      setEvents([]);
    } finally {
      const elapsed = Date.now() - started;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return events.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      const ts = new Date(e.timestamp).getTime();
      if (Number.isNaN(ts)) return false;
      if (fromTs != null && !Number.isNaN(fromTs) && ts < fromTs) return false;
      if (toTs != null && !Number.isNaN(toTs) && ts > toTs) return false;
      if (!q) return true;
      return (
        e.actor.toLowerCase().includes(q)
        || e.target.toLowerCase().includes(q)
        || e.detail.toLowerCase().includes(q)
        || e.action.toLowerCase().includes(q)
      );
    });
  }, [events, search, filterAction, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const kpis = useMemo(() => {
    const logins = events.filter((e) => e.action === 'LOGIN').length;
    const locks = events.filter((e) => e.action === 'LOCK' || e.action === 'LOCKOUT').length;
    const unlocks = events.filter((e) => e.action === 'UNLOCK').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = events.filter(
      (e) => e.action === 'LOGIN' && new Date(e.timestamp).getTime() >= today.getTime(),
    ).length;
    return [
      { key: 'today', label: t('loginLogs.kpiToday'), value: todayCount },
      { key: 'login', label: t('loginLogs.kpiTotal'), value: logins },
      { key: 'lock', label: t('loginLogs.kpiLocks'), value: locks },
      { key: 'unlock', label: t('loginLogs.kpiUnlocks'), value: unlocks },
    ];
  }, [events, t]);

  const exportPdf = () => {
    exportCapaPdf({
      title: t('loginLogs.title'),
      subtitle: t('loginLogs.pdfSubtitle'),
      filename: `logs-connexion-${new Date().toISOString().slice(0, 10)}`,
      meta: [
        `${t('loginLogs.events')} : ${filtered.length}`,
        `${t('audit.colAction')} : ${filterAction ? actionMeta(filterAction).label : t('audit.allActions')}`,
        dateFrom || dateTo ? `${t('hrReports.period')} : ${dateFrom || '…'} → ${dateTo || '…'}` : '',
      ].filter(Boolean),
      columns: [
        { key: 'date', label: t('audit.colDate') },
        { key: 'action', label: t('audit.colAction') },
        { key: 'actor', label: t('audit.colActor') },
        { key: 'target', label: t('audit.colTarget') },
        { key: 'detail', label: t('audit.colDetail') },
      ],
      rows: filtered.map((e) => ({
        date: fmtDate(e.timestamp),
        action: actionMeta(e.action).label,
        actor: e.actor,
        target: e.target,
        detail: e.detail,
      })),
    });
  };

  return (
    <div className="llg">
      <style>{`
        .llg { max-width: 1120px; color: #0d1340; }
        .llg-eyebrow { margin:0 0 4px; font-size:10px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:#000168; }
        .llg-title { margin:0; font-size:22px; font-weight:700; color:#000168; }
        .llg-sub { margin:6px 0 16px; font-size:13px; color:#64748b; }
        .llg-kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
        .llg-kpi { background:#fff; border:1px solid #e4e8f2; border-radius:12px; padding:14px 16px; border-top:3px solid #000168; }
        .llg-kpi-val { font-size:24px; font-weight:700; color:#000168; }
        .llg-kpi-lbl { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:#64748b; margin-top:4px; font-weight:600; }
        .llg-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; align-items:center; }
        .llg-srch { display:flex; align-items:center; gap:6px; background:#fff; border:1px solid #e4e8f2; border-radius:8px; padding:8px 12px; flex:1; min-width:200px; }
        .llg-srch input { border:none; outline:none; font:inherit; font-size:13px; width:100%; background:none; }
        .llg-sel, .llg-date {
          height:36px; border:1px solid #e4e8f2; border-radius:8px; padding:0 10px;
          font:inherit; font-size:12.5px; background:#fff; color:#0d1340;
        }
        .llg-btn {
          display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px;
          border-radius:8px; border:1px solid #e4e8f2; background:#fff; color:#000168;
          font:inherit; font-size:12.5px; font-weight:600; cursor:pointer;
        }
        .llg-btn:hover { background:#eef2ff; }
        .llg-btn.primary { background:#000168; border-color:#000168; color:#fff; }
        .llg-btn.primary:hover { background:#00009e; }
        .llg-card { background:#fff; border:1px solid #e4e8f2; border-radius:12px; overflow:hidden; }
        .llg-card table { width:100%; border-collapse:collapse; font-size:13px; }
        .llg-card th {
          text-align:left; padding:10px 14px; background:#f8f9fc; color:#64748b;
          font-size:11px; text-transform:uppercase; letter-spacing:.4px; font-weight:700;
          border-bottom:1px solid #e4e8f2;
        }
        .llg-card td { padding:11px 14px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
        .llg-card tr:hover td { background:#fafbff; }
        .llg-pill {
          display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px;
          font-size:11px; font-weight:700;
        }
        .llg-empty { padding:40px 16px; text-align:center; color:#94a3b8; font-size:13px; }
        .llg-err { margin-bottom:12px; padding:10px 12px; border-radius:8px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; font-size:13px; }
        .llg-foot { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-top:1px solid #e4e8f2; font-size:12px; color:#64748b; }
        .llg-pg { display:flex; gap:4px; }
        .llg-pg button {
          padding:5px 10px; border-radius:6px; border:1px solid #e4e8f2; background:#f8f9fc;
          font:inherit; font-size:12px; cursor:pointer; color:#374151;
        }
        .llg-pg button.active { background:#000168; color:#fff; border-color:#000168; }
        .llg-pg button:disabled { opacity:.4; cursor:not-allowed; }
        .llg-link { color:#000168; font-weight:600; text-decoration:none; font-size:12.5px; }
        .llg-link:hover { text-decoration:underline; }
        .llg-sk-wrap { padding: 4px 0 8px; }
        .llg-sk-row {
          display:grid; grid-template-columns: 140px 120px 1fr 1fr 1.4fr; gap:12px;
          align-items:center; padding:12px 14px; border-bottom:1px solid #f1f5f9;
        }
        .llg-sk {
          height:12px; border-radius:6px;
          background: linear-gradient(90deg, #f1f5f9 25%, #e8ecf5 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: llg-shimmer 1.2s ease-in-out infinite;
        }
        .llg-sk.lg { height: 22px; width: 88px; border-radius: 999px; }
        .llg-sk.md { width: 70%; }
        .llg-sk.sm { width: 45%; }
        .llg-loading-head {
          display:flex; align-items:center; gap:10px; padding:14px 16px 6px;
          font-size:12.5px; color:#64748b; font-weight:500;
        }
        .llg-spin {
          width:16px; height:16px; border-radius:50%;
          border:2px solid #e4e8f2; border-top-color:#000168;
          animation: llg-rot .7s linear infinite; flex-shrink:0;
        }
        .llg-btn .ti-loader-2 { animation: llg-rot .7s linear infinite; }
        @keyframes llg-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @keyframes llg-rot { to { transform: rotate(360deg); } }
        @media (max-width:900px) {
          .llg-kpis { grid-template-columns:1fr 1fr; }
          .llg-sk-row { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <p className="llg-eyebrow">{t('admin.audit')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="llg-title">{t('loginLogs.title')}</h1>
          <p className="llg-sub">
            {t('loginLogs.subtitle')}
          </p>
        </div>
        <Link to="/admin/audit-logs" className="llg-link">
          {t('loginLogs.fullTrail')} →
        </Link>
      </div>

      {error ? <div className="llg-err">{error}</div> : null}

      <div className="llg-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="llg-kpi">
            <div className="llg-kpi-val">{k.value}</div>
            <div className="llg-kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="llg-toolbar">
        <div className="llg-srch">
          <i className="ti ti-search" style={{ color: '#94a3b8' }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('loginLogs.searchPh')}
          />
        </div>
        <select
          className="llg-sel"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
        >
          <option value="">{t('audit.allActions')}</option>
          {Object.keys(ACTION_META).map((key) => (
            <option key={key} value={key}>{actionMeta(key).label}</option>
          ))}
        </select>
        <input
          type="date"
          className="llg-date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          title={t('qualityHistory.from')}
        />
        <input
          type="date"
          className="llg-date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          title={t('qualityHistory.to')}
        />
        <button type="button" className="llg-btn" onClick={exportPdf} disabled={loading || filtered.length === 0}>
          <i className="ti ti-file-type-pdf" /> PDF
        </button>
        <button
          type="button"
          className="llg-btn primary"
          onClick={() => void fetchLogs()}
          disabled={loading}
        >
          <i className={`ti ${loading ? 'ti-loader-2' : 'ti-refresh'}`} />
          {loading ? t('common.loading') : t('dashboard.refresh')}
        </button>
      </div>

      <div className="llg-card" aria-busy={loading}>
        {loading ? (
          <div className="llg-sk-wrap">
            <div className="llg-loading-head">
              <div className="llg-spin" />
              {t('loginLogs.loading')}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="llg-sk-row">
                <div className="llg-sk sm" />
                <div className="llg-sk lg" />
                <div className="llg-sk md" />
                <div className="llg-sk md" />
                <div className="llg-sk" style={{ width: '85%' }} />
              </div>
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="llg-empty">{t('loginLogs.empty')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('audit.colDate')}</th>
                <th>{t('audit.colAction')}</th>
                <th>{t('audit.colActor')}</th>
                <th>{t('audit.colTarget')}</th>
                <th>{t('audit.colDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e) => {
                const meta = actionMeta(e.action);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12.5 }}>
                      {fmtDate(e.timestamp)}
                    </td>
                    <td>
                      <span className="llg-pill" style={{ background: meta.bg, color: meta.color }}>
                        <i className={`ti ${meta.icon}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{e.actor}</td>
                    <td>{e.target}</td>
                    <td style={{ color: '#64748b', maxWidth: 320 }}>{e.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length > 0 && (
          <div className="llg-foot">
            <span>
              {t('audit.events', { count: filtered.length })} · {t('loginLogs.page')} {pageSafe}/{totalPages}
            </span>
            <div className="llg-pg">
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>
                {t('loginLogs.prev')}
              </button>
              <button type="button" className="active">{pageSafe}</button>
              <button
                type="button"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('loginLogs.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
