import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getEmployeeWorkspace, type WorkspaceEightD } from '../../services/employeeWorkspaceService';
import { resolveClaimStatus } from '../../utils/Claimutils';
import type { Claim } from '../../types/qualityAnalysis';
import './EmployeeEightDPage.css';

type Tab = 'open' | 'closed' | 'all';

const CLOSED = new Set(['CLOTUREE', 'VALIDATED', 'ARCHIVED']);
const TOTAL_STEPS = 8;

type Row = {
  id: string;
  title: string;
  client: string;
  lot: string;
  status: string;
  closed: boolean;
  deadline?: string;
  daysLeft: number | null;
  stepCode?: string;
  stepLabel?: string;
  completed: number;
  pendingValidation: boolean;
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

/** "Mes dossiers 8D": the 8D dossiers of the claims assigned to the employee, with their current step. */
export default function EmployeeEightDPage() {
  const { accessToken } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [eightD, setEightD] = useState<Record<string, WorkspaceEightD>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError('');
    try {
      const ws = await getEmployeeWorkspace(accessToken);
      setClaims(ws.claims);
      setEightD(Object.fromEntries(ws.eightD.map((d) => [String(d.claimId), d])));
    } catch {
      setError(t('employeeEightD.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo<Row[]>(
    () =>
      claims.map((c) => {
        const id = String(c.id);
        const status = resolveClaimStatus(c);
        const dossier = eightD[id];
        const steps = dossier?.steps ?? [];
        const pending = steps.find((s) => s.unlocked && !s.complete);
        const deadline = (c as any).deadline || (c as any).Deadline || undefined;
        const closed = CLOSED.has(status) || ['CLOSED', 'VALIDATED'].includes(String(dossier?.statusCode || '').toUpperCase());
        return {
          id,
          title: c.title || dossier?.claimTitle || id.slice(0, 8),
          client: String((c as any).clientId || ''),
          lot: String((c as any).lotNumber || ''),
          status,
          closed,
          deadline,
          daysLeft: closed ? null : daysUntil(deadline),
          stepCode: pending?.code,
          stepLabel: pending ? t(`employeeWorkspace.eightDStep.${pending.code}`, { defaultValue: pending.label }) : undefined,
          completed: closed ? TOTAL_STEPS : steps.filter((s) => s.complete).length,
          pendingValidation:
            status === 'PENDING_VALIDATION' || String(dossier?.statusCode || '').toUpperCase() === 'PENDING_VALIDATION',
        };
      }),
    [claims, eightD, t],
  );

  const counts = useMemo(
    () => ({ open: rows.filter((r) => !r.closed).length, closed: rows.filter((r) => r.closed).length, all: rows.length }),
    [rows],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => tab === 'all' || (tab === 'open' ? !r.closed : r.closed))
      .filter((r) => !term || [r.title, r.client, r.lot].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY));
  }, [rows, tab, search]);

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(i18n.language || 'fr', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const dueLabel = (r: Row) => {
    if (r.closed) return { text: t('employeeEightD.closed'), tone: 'ok' };
    if (r.daysLeft == null) return { text: t('employeeEightD.noDeadline'), tone: 'muted' };
    if (r.daysLeft < 0) return { text: t('employeeEightD.late', { count: -r.daysLeft }), tone: 'late' };
    if (r.daysLeft === 0) return { text: t('employeeEightD.today'), tone: 'soon' };
    return { text: t('employeeEightD.dueOn', { date: formatDate(r.deadline) }), tone: r.daysLeft <= 7 ? 'soon' : 'muted' };
  };

  return (
    <div className="e8d-page">
      <div className="e8d-inner">
        <header className="e8d-header">
          <div>
            <p className="e8d-kicker">{t('employeeEightD.kicker')}</p>
            <h1>{t('employeeEightD.title')}</h1>
            <p className="e8d-sub">{t('employeeEightD.subtitle')}</p>
          </div>
          <button type="button" className="e8d-guide" onClick={() => navigate('/pages/front/quality-analyses/parcours')}>
            <BookOpen size={15} /> {t('employeeEightD.guide')}
          </button>
        </header>

        <div className="e8d-toolbar">
          <div className="e8d-tabs" role="tablist">
            {(['open', 'closed', 'all'] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {t(`employeeEightD.tab_${k}`)} <span>{counts[k]}</span>
              </button>
            ))}
          </div>
          <label className="e8d-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder={t('employeeEightD.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        {error && <div className="e8d-alert" role="alert">{error}</div>}

        <section className="e8d-panel" aria-live="polite">
          {loading ? (
            <ul className="e8d-list" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => <li key={i} className="e8d-skel" />)}
            </ul>
          ) : visible.length === 0 ? (
            <div className="e8d-empty">
              <strong>{rows.length === 0 ? t('employeeEightD.emptyTitle') : t('employeeEightD.noResults')}</strong>
              {rows.length === 0 && <p>{t('employeeEightD.emptyHint')}</p>}
            </div>
          ) : (
            <ul className="e8d-list">
              {visible.map((r) => {
                const due = dueLabel(r);
                const pct = Math.round((r.completed / TOTAL_STEPS) * 100);
                return (
                  <li key={r.id}>
                    <button type="button" className="e8d-row" onClick={() => navigate(`/pages/front/quality-analyses/8d/${r.id}`)}>
                      <span className={`e8d-step${r.closed ? ' done' : ''}`} aria-hidden>
                        {r.closed ? '8D' : r.stepCode || 'D1'}
                      </span>
                      <span className="e8d-main">
                        <span className="e8d-name">{r.title}</span>
                        <span className="e8d-meta">
                          {r.client && <span>{r.client}</span>}
                          {r.lot && <span>{t('employeeEightD.lot', { lot: r.lot })}</span>}
                          <span>
                            {r.closed
                              ? t('employeeEightD.allStepsDone')
                              : r.pendingValidation
                                ? t('employeeEightD.awaitingValidation')
                                : t('employeeEightD.currentStep', { step: `${r.stepCode ?? 'D1'} · ${r.stepLabel ?? ''}`.replace(/ · $/, '') })}
                          </span>
                        </span>
                      </span>
                      <span className="e8d-progress" title={t('employeeEightD.progress', { done: r.completed, total: TOTAL_STEPS })}>
                        <span className="e8d-bar"><span style={{ width: `${pct}%` }} /></span>
                        <small>{r.completed}/{TOTAL_STEPS}</small>
                      </span>
                      <span className={`e8d-due ${due.tone}`}>{due.text}</span>
                      <ChevronRight size={16} className="e8d-chev" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
