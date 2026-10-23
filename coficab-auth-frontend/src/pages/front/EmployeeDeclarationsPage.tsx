import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useMyDeclarations } from '../../hooks/useMyDeclarations';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { claimPath, shortDate, StatusPill } from '../../components/employee/WorkspaceExtras';
import './FrontWorkspaceHome.styles.css';

type Tab = 'all' | 'draft' | 'running' | 'closed';
const CLOSED = new Set(['CLOTUREE', 'VALIDATED', 'ARCHIVED']);

function tabOf(status: string): Exclude<Tab, 'all'> {
  if (status === 'DRAFT') return 'draft';
  return CLOSED.has(status) ? 'closed' : 'running';
}

/** "My declarations": every claim I created, whatever its status, with a filter by stage. */
export default function EmployeeDeclarationsPage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const { claims, loading, failed, reload } = useMyDeclarations(accessToken);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : i18n.language?.startsWith('it') ? 'it-IT' : 'fr-FR';

  const counts = useMemo(() => {
    const c = { all: claims.length, draft: 0, running: 0, closed: 0 };
    for (const claim of claims) c[tabOf(resolveClaimStatus(claim))]++;
    return c;
  }, [claims]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter((c) => {
      if (tab !== 'all' && tabOf(resolveClaimStatus(c)) !== tab) return false;
      if (!q) return true;
      return [c.title, c.reference, c.defectType, c.productionLine, c.assignedToName]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [claims, tab, query]);

  const tabs: Tab[] = ['all', 'draft', 'running', 'closed'];

  return (
    <div className="fwh-page">
      <div className="fwh-inner">
        <header className="fwh-top">
          <div className="fwh-welcome">
            <p className="fwh-kicker">{t('employeeWorkspace.kicker')}</p>
            <h1>{t('employeeWorkspace.declPageTitle')}</h1>
            <p className="fwh-sub">{t('employeeWorkspace.declPageSub')}</p>
          </div>
          <div className="fwh-top-actions">
            <button type="button" className="fwh-refresh primary" onClick={() => navigate('/pages/front/quality-analyses/new')}>
              + {t('employeeWorkspace.newClaim')}
            </button>
            <button type="button" className="fwh-refresh" onClick={() => void reload()} disabled={loading}>
              {t('employeeWorkspace.refresh')}
            </button>
          </div>
        </header>

        <section className="fwh-card">
          <div className="fwh-decl-bar">
            <div className="fwh-decl-tabs" role="tablist">
              {tabs.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {t(`employeeWorkspace.declTab.${k}`)} <span>{counts[k]}</span>
                </button>
              ))}
            </div>
            <input
              className="fwh-decl-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('employeeWorkspace.declSearch')}
              aria-label={t('employeeWorkspace.declSearch')}
            />
          </div>

          {loading ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : failed ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.declFailed')}</div>
          ) : rows.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.declEmpty')}</div>
          ) : (
            <ul className="fwh-rows">
              {rows.map((c) => (
                <li key={c.id}>
                  <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate(claimPath(c))}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(claimPath(c)); }}>
                    <span className="fwh-row-main">
                      <span className="fwh-todo-title">{c.reference && <span className="fwh-ref">{c.reference}</span>}{c.title || t('employeeWorkspace.draftUntitled')}</span>
                      <span className="fwh-todo-meta">
                        {[shortDate(c.createdAt, locale), c.defectType, c.productionLine, c.assignedToName].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <StatusPill claim={c} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
