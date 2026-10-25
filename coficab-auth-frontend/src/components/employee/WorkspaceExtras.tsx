import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAlerts, type QualityAlert } from '../../services/alertService';
import { getEmployeeWorkload, type EmployeeWorkload } from '../../services/employeeWorkspaceService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { useMyDeclarations } from '../../hooks/useMyDeclarations';
import type { Pin } from '../../hooks/usePins';
import type { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import './WorkspaceExtras.styles.css';
import { defectLabel } from '../../utils/defectLabel';

const CLOSED = new Set(['CLOTUREE', 'VALIDATED', 'ARCHIVED']);
export const DRAFTS_PATH = '/pages/front/quality-analyses/drafts';

export function claimPath(claim: Claim): string {
  return resolveClaimStatus(claim) === 'DRAFT' ? DRAFTS_PATH : `/pages/front/quality-analyses/8d/${claim.id}`;
}

export function shortDate(iso: string | undefined | null, locale: string): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '';
}

export function StatusPill({ claim }: { claim: Claim }) {
  const { t } = useTranslation();
  const status = resolveClaimStatus(claim);
  const tone =
    status === 'REJECTED' ? 'bad'
      : CLOSED.has(status) ? 'ok'
        : status === 'DRAFT' ? 'muted'
          : status === 'PENDING_VALIDATION' ? 'info'
            : 'run';
  return <span className={`fwh-pill ${tone}`}>{t(`employeeWorkspace.claimStatus.${status}`, { defaultValue: status })}</span>;
}

interface StarProps {
  pin: Pin;
  pins: Pin[];
  onToggle: (pin: Pin) => void;
}

export function PinStar({ pin, pins, onToggle }: StarProps) {
  const { t } = useTranslation();
  const on = pins.some((p) => p.id === pin.id);
  return (
    <button
      type="button"
      className={`fwh-star${on ? ' on' : ''}`}
      aria-pressed={on}
      title={on ? t('employeeWorkspace.unpin') : t('employeeWorkspace.pin')}
      onClick={(e) => { e.stopPropagation(); onToggle(pin); }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

interface Props {
  accessToken: string;
  /** Claims assigned to me (already loaded by the dashboard): the most urgent one anchors the "similar files" search. */
  assigned: Claim[];
  pins: Pin[];
  onTogglePin: (pin: Pin) => void;
  locale: string;
}

export default function WorkspaceExtras({ accessToken, assigned, pins, onTogglePin, locale }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { claims: mine, loading: mineLoading } = useMyDeclarations(accessToken);
  const [alerts, setAlerts] = useState<QualityAlert[] | null>(null);
  const [workload, setWorkload] = useState<EmployeeWorkload | null>(null);
  const [similar, setSimilar] = useState<Claim[] | null>(null);

  useEffect(() => {
    getAlerts(accessToken).then((rows) => setAlerts(Array.isArray(rows) ? rows : [])).catch(() => setAlerts([]));
    getEmployeeWorkload(accessToken).then(setWorkload).catch(() => setWorkload(null));
  }, [accessToken]);

  const drafts = useMemo(() => mine.filter((c) => resolveClaimStatus(c) === 'DRAFT'), [mine]);
  const submitted = useMemo(() => mine.filter((c) => resolveClaimStatus(c) !== 'DRAFT'), [mine]);
  const myAlerts = useMemo(
    () =>
      (alerts ?? [])
        .filter((a) => {
          const s = String(a.status || '').toLowerCase();
          return s !== 'archived' && s !== 'resolved';
        })
        .sort((a, b) => b.zScore - a.zScore)
        .slice(0, 4),
    [alerts],
  );

  // The most urgent open claim of mine: earliest deadline first.
  const anchor = useMemo(() => {
    const open = assigned.filter((c) => !CLOSED.has(resolveClaimStatus(c)) && resolveClaimStatus(c) !== 'DRAFT');
    open.sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return da - db;
    });
    return open[0] ?? null;
  }, [assigned]);

  useEffect(() => {
    if (!anchor) { setSimilar([]); return; }
    let live = true;
    const query = [anchor.defectType, anchor.title].filter(Boolean).join(' ').slice(0, 200);
    qualityAnalysisService
      .semanticSearch(query, accessToken, 20)
      .then((res) => {
        if (!live) return;
        setSimilar(res.claims.filter((c) => c.id !== anchor.id && CLOSED.has(resolveClaimStatus(c))).slice(0, 3));
      })
      .catch(() => { if (live) setSimilar([]); });
    return () => { live = false; };
  }, [anchor, accessToken]);

  const pinFor = (c: Claim): Pin => ({
    id: `claim-${c.id}`, kind: 'claim', title: c.title || '', ref: c.reference || undefined, path: claimPath(c),
  });

  const stateKey = workload?.state ?? 'none';
  const maxBar = Math.max(1, workload?.mine ?? 0, workload?.teamAverage ?? 0);

  return (
    <>
      {pins.length > 0 && (
        <section className="fwh-card fwh-pins" aria-labelledby="fwh-pins-title">
          <div className="fwh-card-head">
            <h2 id="fwh-pins-title">{t('employeeWorkspace.pinsTitle')}</h2>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.pinsSub')}</p>
          <div className="fwh-pin-grid">
            {pins.map((p) => (
              <div key={p.id} className="fwh-pin" role="button" tabIndex={0} onClick={() => navigate(p.path)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(p.path); }}>
                <span className="fwh-pin-text">{p.ref && <span className="fwh-ref">{p.ref}</span>}{p.title}</span>
                <PinStar pin={p} pins={pins} onToggle={onTogglePin} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="fwh-duo">
        <section className="fwh-card" aria-labelledby="fwh-decl-title">
          <div className="fwh-card-head">
            <h2 id="fwh-decl-title">{t('employeeWorkspace.declTitle')}</h2>
            <button type="button" className="fwh-card-link" onClick={() => navigate('/declarations')}>
              {t('employeeWorkspace.declSeeAll', { count: mine.length })}
            </button>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.declSub')}</p>
          {mineLoading ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : submitted.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.declEmpty')}</div>
          ) : (
            <ul className="fwh-rows">
              {submitted.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate(claimPath(c))}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(claimPath(c)); }}>
                    <span className="fwh-row-main">
                      <span className="fwh-todo-title">{c.reference && <span className="fwh-ref">{c.reference}</span>}{c.title}</span>
                      <span className="fwh-todo-meta">{shortDate(c.createdAt, locale)}{c.assignedToName ? ` · ${c.assignedToName}` : ''}</span>
                    </span>
                    <StatusPill claim={c} />
                    <PinStar pin={pinFor(c)} pins={pins} onToggle={onTogglePin} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fwh-card" aria-labelledby="fwh-drafts-title">
          <div className="fwh-card-head">
            <h2 id="fwh-drafts-title">{t('employeeWorkspace.draftsTitle')}</h2>
            <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/quality-analyses/new')}>
              {t('employeeWorkspace.draftsNew')}
            </button>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.draftsSub')}</p>
          {mineLoading ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : drafts.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.draftsEmpty')}</div>
          ) : (
            <ul className="fwh-rows">
              {drafts.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <div className="fwh-row">
                    <span className="fwh-row-main">
                      <span className="fwh-todo-title">{c.title || t('employeeWorkspace.draftUntitled')}</span>
                      <span className="fwh-todo-meta">{t('employeeWorkspace.draftSince', { date: shortDate(c.createdAt, locale) })}</span>
                    </span>
                    <button type="button" className="fwh-next-open" onClick={() => navigate(DRAFTS_PATH)}>
                      {t('employeeWorkspace.draftContinue')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="fwh-duo">
        <section className="fwh-card" aria-labelledby="fwh-qa-title">
          <div className="fwh-card-head">
            <h2 id="fwh-qa-title">{t('employeeWorkspace.lineAlertsTitle')}</h2>
            <button type="button" className="fwh-card-link" onClick={() => navigate('/alerts')}>
              {t('employeeWorkspace.lineAlertsSeeAll')}
            </button>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.lineAlertsSub')}</p>
          {alerts === null ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : myAlerts.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.lineAlertsEmpty')}</div>
          ) : (
            <ul className="fwh-rows">
              {myAlerts.map((a) => (
                <li key={a.id}>
                  <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate('/alerts')}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate('/alerts'); }}>
                    <span className="fwh-row-main">
                      <span className="fwh-todo-title">{defectLabel(a.defectType)}</span>
                      <span className="fwh-todo-meta">{a.productionLine} · {shortDate(a.detectedAt, locale)}</span>
                    </span>
                    <span className={`fwh-pill ${a.zScore >= 3 ? 'bad' : 'run'}`}>z = {a.zScore.toFixed(1)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fwh-card" aria-labelledby="fwh-load-title">
          <div className="fwh-card-head">
            <h2 id="fwh-load-title">{t('employeeWorkspace.loadTitle')}</h2>
            <button type="button" className="fwh-card-link" onClick={() => navigate('/activity')}>
              {t('employeeWorkspace.loadDetail')}
            </button>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.loadSub')}</p>
          {!workload ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : workload.teamSize === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.loadEmpty')}</div>
          ) : (
            <div className="fwh-load">
              <div className="fwh-load-row">
                <span>{t('employeeWorkspace.loadMine')}</span>
                <span className="fwh-load-bar"><i className={stateKey} style={{ width: `${(workload.mine / maxBar) * 100}%` }} /></span>
                <strong>{workload.mine}</strong>
              </div>
              <div className="fwh-load-row">
                <span>{t('employeeWorkspace.loadTeam')}</span>
                <span className="fwh-load-bar"><i className="team" style={{ width: `${(workload.teamAverage / maxBar) * 100}%` }} /></span>
                <strong>{workload.teamAverage.toLocaleString(locale)}</strong>
              </div>
              <p className={`fwh-load-note ${stateKey}`}>
                {t(`employeeWorkspace.loadState.${stateKey}`, { mine: workload.mine, avg: workload.teamAverage.toLocaleString(locale) })}
                {workload.latePlans > 0 && ` ${t('employeeWorkspace.loadLate', { count: workload.latePlans })}`}
              </p>
            </div>
          )}
        </section>
      </div>

      {anchor && (
        <section className="fwh-card" aria-labelledby="fwh-sim-title">
          <div className="fwh-card-head">
            <h2 id="fwh-sim-title">{t('employeeWorkspace.similarTitle')}</h2>
          </div>
          <p className="fwh-card-sub">{t('employeeWorkspace.similarSub', { title: anchor.title })}</p>
          {similar === null ? (
            <div className="fwh-skel-row" aria-hidden />
          ) : similar.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.similarEmpty')}</div>
          ) : (
            <ul className="fwh-rows">
              {similar.map((c) => (
                <li key={c.id}>
                  <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate(`/pages/front/quality-analyses/8d/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/pages/front/quality-analyses/8d/${c.id}`); }}>
                    <span className="fwh-row-main">
                      <span className="fwh-todo-title">{c.reference && <span className="fwh-ref">{c.reference}</span>}{c.title}</span>
                      <span className="fwh-todo-meta">{[defectLabel(c.defectType), c.productionLine].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="fwh-pill ok">{t('employeeWorkspace.similarResolved')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
