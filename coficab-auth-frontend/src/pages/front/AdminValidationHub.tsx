import { workflowMessage } from '../../utils/apiError';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  closeActionPlan,
  getPendingValidation,
  getRejectedActionPlans,
  rejectActionPlan,
} from '../../services/actionPlanService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim, FiveWhyDetails } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import {
  ClaimDateSort,
  DEFAULT_CLAIM_DATE_SORT,
  sortClaimsByDate,
} from '../../utils/claimDateSort';
import { ClaimDateSortSelect } from '../../components/ClaimDateSortSelect';
import { computeIatfSla, slaToneStyles } from '../../utils/iatfSla';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

type TabId = 'dossiers' | 'capa' | 'rejected' | 'fivewhy';

type PendingCapa = {
  id: string;
  title: string;
  description?: string;
  progress?: number;
  deadline?: string;
  assignedToId?: string;
  claimId?: string;
  proofCount?: number;
  createdAt?: string;
  lastRejectedAt?: string;
  lastRejectComment?: string;
};

type PendingFiveWhy = {
  claim: Claim;
  fiveWhy: FiveWhyDetails;
};

function pct(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(100, Math.round(raw)));
  const s = String(raw ?? '').toLowerCase();
  const map: Record<string, number> = {
    notstarted: 0, twentyfive: 25, fifty: 50, seventyfive: 75, hundred: 100, validated: 100,
  };
  if (s in map) return map[s];
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function mapCapa(p: any): PendingCapa {
  return {
    id: String(p.id || p.Id),
    title: p.title || p.name || p.Title || i18n.t('closedArchive.untitled'),
    description: p.description || p.Description,
    progress: pct(p.progress ?? p.Progress),
    deadline: p.deadline || p.Deadline,
    assignedToId: p.assignedToId || p.AssignedToId,
    claimId: p.claimId || p.ClaimId,
    proofCount: Number(p.proofCount ?? p.ProofCount ?? 0),
    createdAt: p.createdAt || p.CreatedAt,
    lastRejectedAt: p.lastRejectedAt || p.LastRejectedAt,
    lastRejectComment: p.lastRejectComment || p.LastRejectComment,
  };
}

function isPendingDossier(claim: Claim): boolean {
  const resolved = resolveClaimStatus(claim);
  if (resolved === 'PENDING_VALIDATION') return true;
  const raw = String(claim.statusCode || '').toUpperCase();
  return raw === 'PENDING_VALIDATION' || raw === 'PENDING' || raw === 'SUBMITTED' || raw.includes('ATTENTE');
}

export const AdminValidationHub: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId =
    tabParam === 'capa' ? 'capa' :
    tabParam === 'rejected' ? 'rejected' :
    tabParam === 'fivewhy' ? 'fivewhy' :
    'dossiers';

  const [dossiers, setDossiers] = useState<Claim[]>([]);
  const [dateSort, setDateSort] = useState<ClaimDateSort>(DEFAULT_CLAIM_DATE_SORT);
  const [capa, setCapa] = useState<PendingCapa[]>([]);
  const [rejected, setRejected] = useState<PendingCapa[]>([]);
  const [fiveWhyQueue, setFiveWhyQueue] = useState<PendingFiveWhy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };

  const loadDossiers = useCallback(async () => {
    if (!accessToken) return;
    let pending: Claim[] = [];
    try {
      pending = await qualityAnalysisService.getClaims('PENDING_VALIDATION', accessToken);
    } catch {
      pending = [];
    }
    if (!pending?.length) {
      const all = await qualityAnalysisService.getClaims(undefined, accessToken);
      pending = (all || []).filter(isPendingDossier);
    } else {
      pending = pending.filter(isPendingDossier);
    }
    setDossiers(pending);
  }, [accessToken]);

  const loadCapa = useCallback(async () => {
    if (!accessToken) return;
    const res = await getPendingValidation(accessToken);
    const list = (res.data?.data ?? res.data ?? []) as any[];
    setCapa((Array.isArray(list) ? list : []).map(mapCapa));
  }, [accessToken]);

  const loadRejected = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await getRejectedActionPlans(accessToken);
      const list = (res.data?.data ?? res.data ?? []) as any[];
      setRejected((Array.isArray(list) ? list : []).map(mapCapa));
    } catch {
      setRejected([]);
    }
  }, [accessToken]);

  const loadFiveWhy = useCallback(async () => {
    if (!accessToken) return;
    const claims = await qualityAnalysisService.getClaims(undefined, accessToken);
    const candidates = (claims || []).filter((c) => {
      const s = String(c.statusCode || '').toUpperCase();
      return s !== 'DRAFT' && s !== 'VALIDATED' && s !== 'CLOSED' && s !== 'REJETEE' && s !== 'REJECTED';
    });

    const results: PendingFiveWhy[] = [];
    const chunk = 6;
    for (let i = 0; i < candidates.length; i += chunk) {
      const slice = candidates.slice(i, i + chunk);
      const settled = await Promise.allSettled(
        slice.map(async (claim) => {
          const fw = await qualityAnalysisService.getFiveWhy(claim.id, accessToken);
          return { claim, fiveWhy: fw };
        })
      );
      for (const r of settled) {
        if (r.status !== 'fulfilled' || !r.value?.fiveWhy) continue;
        const code = String(r.value.fiveWhy.statusCode || '').toUpperCase();
        if (code === 'PENDING_VALIDATION' || code === 'PENDING') {
          results.push(r.value);
        }
      }
    }
    setFiveWhyQueue(results);
  }, [accessToken]);

  const loadAll = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDossiers(), loadCapa(), loadRejected()]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || i18n.t('validationHub.loadFailed'));
    } finally {
      setLoading(false);
    }
    void loadFiveWhy().catch((e) => console.error(e));
  }, [accessToken, loadDossiers, loadCapa, loadRejected, loadFiveWhy]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const counts = useMemo(
    () => ({
      dossiers: dossiers.length,
      capa: capa.length,
      rejected: rejected.length,
      fivewhy: fiveWhyQueue.length,
    }),
    [dossiers.length, capa.length, rejected.length, fiveWhyQueue.length]
  );

  const sortedDossiers = useMemo(
    () => sortClaimsByDate(dossiers, dateSort),
    [dossiers, dateSort]
  );

  const sortedFiveWhy = useMemo(() => {
    const orderedIds = sortClaimsByDate(
      fiveWhyQueue.map((x) => x.claim),
      dateSort
    ).map((c) => c.id);
    const rank = new Map(orderedIds.map((id, i) => [id, i]));
    return [...fiveWhyQueue].sort(
      (a, b) => (rank.get(a.claim.id) ?? 0) - (rank.get(b.claim.id) ?? 0)
    );
  }, [fiveWhyQueue, dateSort]);

  const userId = String((user as any)?.id || (user as any)?.sub || '');

  const decideDossier = async (claim: Claim, approve: boolean) => {
    if (!accessToken || busyId) return;
    const label = approve
      ? t('validationHub.confirmApproveDossier')
      : t('validationHub.confirmReturnDossier');
    if (!window.confirm(label)) return;
    setBusyId(claim.id);
    try {
      await qualityAnalysisService.updateClaim(
        claim.id,
        {
          id: claim.id,
          updatedById: userId || claim.updatedById || claim.createdById || claim.id,
          statusCode: approve ? 'OUVERTE' : 'DRAFT',
        },
        accessToken
      );
      setDossiers((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (e) {
      console.error(e);
      alert(workflowMessage(e) ?? (approve ? t('validationHub.approveDossierFailed') : t('validationHub.returnDossierFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const validateCapa = async (p: PendingCapa) => {
    if (!accessToken || busyId) return;
    if ((p.proofCount ?? 0) <= 0) {
      alert(t('validationHub.proofRequired'));
      return;
    }
    if (!window.confirm(t('validationHub.confirmValidateCapa'))) return;
    setBusyId(p.id);
    try {
      await closeActionPlan(accessToken, p.id);
      setCapa((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      console.error(e);
      const msg = e?.response?.data?.error || t('validationHub.validateCapaFailed');
      alert(msg);
    } finally {
      setBusyId(null);
    }
  };

  const rejectCapa = async (p: PendingCapa) => {
    if (!accessToken || busyId) return;
    const comment = window.prompt(t('validationHub.returnReasonPrompt'), '') ?? '';
    if (!comment.trim()) {
      alert(t('validationHub.returnReasonRequired'));
      return;
    }
    setBusyId(p.id);
    try {
      await rejectActionPlan(accessToken, p.id, comment.trim());
      setCapa((prev) => prev.filter((x) => x.id !== p.id));
      await loadRejected();
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.error || t('validationHub.returnCapaFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const decideFiveWhy = async (item: PendingFiveWhy, approve: boolean) => {
    if (!accessToken || busyId) return;
    const label = approve ? t('validationHub.confirmApproveFiveWhy') : t('validationHub.confirmReturnFiveWhy');
    if (!window.confirm(label)) return;
    setBusyId(item.fiveWhy.id);
    try {
      const validatedBy =
        (user as any)?.email || (user as any)?.name || (user as any)?.fullName || 'admin';
      await qualityAnalysisService.validateFiveWhy(
        {
          analysisId: item.fiveWhy.id,
          claimId: item.claim.id,
          isApproved: approve,
          validatedBy,
          statusCode: approve ? 'VALIDATED' : 'DRAFT',
        } as any,
        accessToken
      );
      setFiveWhyQueue((prev) => prev.filter((x) => x.fiveWhy.id !== item.fiveWhy.id));
    } catch (e) {
      console.error(e);
      alert(approve ? t('validationHub.approveFiveWhyFailed') : t('validationHub.returnFiveWhyFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const renderCapaCard = (p: PendingCapa, mode: 'pending' | 'rejected') => {
    const sla = computeIatfSla(p.createdAt || p.deadline, { progress: p.progress, gate: 'D5' });
    const tone = slaToneStyles(sla.tone);
    const proofsOk = (p.proofCount ?? 0) > 0;
    return (
      <div key={p.id} className="avh-card">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="avh-title-sm">{p.title}</h3>
          <div className="avh-meta">
            <span className="avh-pill">{mode === 'pending' ? t('validationHub.pendingD5') : t('validationHub.returned')}</span>
            <span>{t('validationHub.progress')} {p.progress ?? 0}%</span>
            {p.deadline && <span>{t('validationHub.dueShort')} {new Date(p.deadline).toLocaleDateString(dateLocale())}</span>}
            {p.claimId && (
              <Link to={`/pages/front/quality-analyses?focus=${p.claimId}`} style={{ color: '#000168', fontWeight: 700 }}>
                {t('validationHub.eightDFile')}
              </Link>
            )}
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
            }}>
              SLA {sla.label} · {sla.message}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
              background: proofsOk ? '#ecfdf5' : '#fef2f2',
              color: proofsOk ? '#047857' : '#b91c1c',
            }}>
              {t('validationHub.proofs')} {p.proofCount ?? 0}
            </span>
          </div>
          {p.lastRejectComment && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b45309' }}>
              {t('validationHub.reason')} : {p.lastRejectComment}
            </p>
          )}
          {p.description && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
              {p.description.slice(0, 140)}{p.description.length > 140 ? '…' : ''}
            </p>
          )}
        </div>
        <div className="avh-acts">
          <Link className="avh-ghost" to={`/pages/front/action-plans/${p.id}`}>{t('qualityHistory.open')}</Link>
          {mode === 'pending' && (
            <>
              <button type="button" className="avh-ko" disabled={busyId === p.id} onClick={() => void rejectCapa(p)}>
                {t('validationHub.return')}
              </button>
              <button type="button" className="avh-ok" disabled={busyId === p.id} onClick={() => void validateCapa(p)}>
                {busyId === p.id ? '…' : t('validationHub.validateD5')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="avh-page">
      <style>{`
        .fl-nav { background:#000168 !important; height:56px !important; }
        .fl-main { padding-top:56px !important; }
        .avh-page {
          --navy:#000168; --ink:#0f172a; --muted:#64748b; --line:#e8edf5;
          font-family:'Inter', system-ui, -apple-system, sans-serif; /* same typeface as the rest of the front office */
          min-height:calc(100dvh - 56px);
          background:linear-gradient(180deg,#eef2f9 0%,#f7f8fc 120px,#f7f8fc 100%);
          padding:20px 24px 48px;
        }
        .avh-shell { max-width:1100px; margin:0 auto; }
        .avh-head { display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:flex-end; margin-bottom:18px; }
        .avh-kicker { font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#64748b; }
        .avh-title { margin:4px 0 0; font-family:inherit; font-size:24px; font-weight:800; color:var(--navy); }
        .avh-sub { margin:6px 0 0; font-size:13px; color:var(--muted); }
        .avh-btn {
          height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--line); background:#fff;
          font-size:12px; font-weight:650; cursor:pointer; font-family:inherit; color:#334155;
        }
        .avh-tabs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px; align-items:center; }
        .avh-tab {
          border:1px solid var(--line); background:#fff; border-radius:999px; padding:8px 14px;
          font-size:12px; font-weight:700; color:#64748b; cursor:pointer; font-family:inherit;
        }
        .avh-tab.on { background:var(--navy); color:#fff; border-color:var(--navy); }
        .avh-date-sort {
          margin-left:auto; height:34px; border:1px solid var(--line); border-radius:8px;
          background:#fff; padding:0 10px; font-size:12px; color:#334155; min-width:190px;
        }
        .avh-tab .n {
          display:inline-flex; min-width:18px; height:18px; padding:0 5px; margin-left:6px;
          align-items:center; justify-content:center; border-radius:999px; font-size:10px;
          background:rgba(255,255,255,.2);
        }
        .avh-tab:not(.on) .n { background:#eef2ff; color:var(--navy); }
        .avh-card {
          background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px;
          display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap;
        }
        .avh-list { display:flex; flex-direction:column; gap:10px; }
        .avh-title-sm { margin:0; font-size:14px; font-weight:700; color:var(--ink); }
        .avh-meta { margin-top:4px; font-size:12px; color:#94a3b8; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .avh-pill {
          font-size:10px; font-weight:700; padding:3px 8px; border-radius:6px;
          background:#fffbeb; color:#b45309;
        }
        .avh-acts { display:flex; gap:8px; flex-wrap:wrap; }
        .avh-ok { background:#059669; color:#fff; border:none; border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
        .avh-ko { background:#fff; color:#b91c1c; border:1px solid #fecaca; border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
        .avh-ghost { background:#fff; color:var(--navy); border:1px solid var(--line); border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; text-decoration:none; display:inline-flex; align-items:center; }
        .avh-empty, .avh-loading { padding:48px 20px; text-align:center; color:var(--muted); background:#fff; border:1px dashed var(--line); border-radius:14px; }
        .avh-error { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:13px; }
      `}</style>

      <div className="avh-shell">
        <div className="avh-head">
          <div>
            <div className="avh-kicker">{t('validationHub.kicker')}</div>
            <h1 className="avh-title">{t('validationHub.title')}</h1>
            <p className="avh-sub">
              {t('validationHub.subtitle')}
            </p>
          </div>
          <button type="button" className="avh-btn" onClick={() => void loadAll()}>{t('dashboard.refresh')}</button>
        </div>

        <div className="avh-tabs">
          <button type="button" className={`avh-tab${tab === 'dossiers' ? ' on' : ''}`} onClick={() => setTab('dossiers')}>
            {t('validationHub.tabDossiers')} <span className="n">{counts.dossiers}</span>
          </button>
          <button type="button" className={`avh-tab${tab === 'fivewhy' ? ' on' : ''}`} onClick={() => setTab('fivewhy')}>
            {t('validationHub.tabFiveWhy')} <span className="n">{counts.fivewhy}</span>
          </button>
          <button type="button" className={`avh-tab${tab === 'capa' ? ' on' : ''}`} onClick={() => setTab('capa')}>
            CAPA · D5 <span className="n">{counts.capa}</span>
          </button>
          <button type="button" className={`avh-tab${tab === 'rejected' ? ' on' : ''}`} onClick={() => setTab('rejected')}>
            {t('validationHub.tabReturned')} <span className="n">{counts.rejected}</span>
          </button>
          {(tab === 'dossiers' || tab === 'fivewhy') && (
            <ClaimDateSortSelect
              className="avh-date-sort"
              value={dateSort}
              onChange={setDateSort}
            />
          )}
        </div>

        {error && <div className="avh-error">{error}</div>}

        {loading ? (
          <div className="avh-loading">{t('validationHub.loading')}</div>
        ) : tab === 'dossiers' ? (
          dossiers.length === 0 ? (
            <div className="avh-empty">{t('validationHub.emptyDossiers')}</div>
          ) : (
            <div className="avh-list">
              {sortedDossiers.map((claim) => (
                <div key={claim.id} className="avh-card">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="avh-title-sm">{claim.title || t('validationHub.untitledDossier')}</h3>
                    <div className="avh-meta">
                      <span className="avh-pill">{t('validationHub.pillDossier')}</span>
                      <span>{claim.clientId || '—'}</span>
                      <span>{claim.defectType || '—'}</span>
                      <span>{claim.severity || '—'}</span>
                      {claim.lotNumber && <span>{t('closedArchive.lot', { lot: claim.lotNumber })}</span>}
                      {claim.createdAt && (
                        <span>{t('validationHub.submitted')} {new Date(claim.createdAt).toLocaleDateString(dateLocale())}</span>
                      )}
                    </div>
                    {claim.description && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                        {claim.description.slice(0, 160)}{claim.description.length > 160 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div className="avh-acts">
                    <button
                      type="button"
                      className="avh-ghost"
                      onClick={() => navigate(`/pages/front/quality-analyses?focus=${claim.id}`)}
                    >
                      {t('qualityHistory.open')}
                    </button>
                    <button
                      type="button"
                      className="avh-ko"
                      disabled={busyId === claim.id}
                      onClick={() => void decideDossier(claim, false)}
                    >
                      {t('validationHub.return')}
                    </button>
                    <button
                      type="button"
                      className="avh-ok"
                      disabled={busyId === claim.id}
                      onClick={() => void decideDossier(claim, true)}
                    >
                      {busyId === claim.id ? '…' : t('validationHub.approve')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'capa' ? (
          capa.length === 0 ? (
            <div className="avh-empty">{t('validationHub.emptyCapa')}</div>
          ) : (
            <div className="avh-list">{capa.map((p) => renderCapaCard(p, 'pending'))}</div>
          )
        ) : tab === 'rejected' ? (
          rejected.length === 0 ? (
            <div className="avh-empty">{t('validationHub.emptyReturned')}</div>
          ) : (
            <div className="avh-list">{rejected.map((p) => renderCapaCard(p, 'rejected'))}</div>
          )
        ) : fiveWhyQueue.length === 0 ? (
          <div className="avh-empty">{t('validationHub.emptyFiveWhy')}</div>
        ) : (
          <div className="avh-list">
            {sortedFiveWhy.map((item) => (
              <div key={item.fiveWhy.id} className="avh-card">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="avh-title-sm">{item.claim.title || t('analysisTools.claim')}</h3>
                  <div className="avh-meta">
                    <span className="avh-pill">{t('validationHub.pillFiveWhy')}</span>
                    <span>{item.claim.clientId || '—'}</span>
                    <span>{item.claim.defectType || '—'}</span>
                  </div>
                  {item.fiveWhy.rootCause && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#334155' }}>
                      {t('validationHub.rootCause')} : {item.fiveWhy.rootCause.slice(0, 160)}
                      {item.fiveWhy.rootCause.length > 160 ? '…' : ''}
                    </p>
                  )}
                </div>
                <div className="avh-acts">
                  <button
                    type="button"
                    className="avh-ghost"
                    onClick={() => navigate(`/pages/front/quality-analyses/5why/${item.claim.id}`)}
                  >
                    {t('qualityHistory.open')}
                  </button>
                  <button
                    type="button"
                    className="avh-ko"
                    disabled={busyId === item.fiveWhy.id}
                    onClick={() => void decideFiveWhy(item, false)}
                  >
                    {t('validationHub.return')}
                  </button>
                  <button
                    type="button"
                    className="avh-ok"
                    disabled={busyId === item.fiveWhy.id}
                    onClick={() => void decideFiveWhy(item, true)}
                  >
                    {busyId === item.fiveWhy.id ? '…' : t('validationHub.approve')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminValidationHub;
