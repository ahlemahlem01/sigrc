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
import {
  decideDossiers,
  getFiveWhyQueue,
  notifyFiveWhyReturned,
  type FiveWhyQueueItem,
} from '../../services/validationsService';
import { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { computeIatfSla, slaToneStyles } from '../../utils/iatfSla';
import DecisionDialog from '../../components/DecisionDialog';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

type TabId = 'dossiers' | 'capa' | 'rejected' | 'fivewhy';
type SortKey = 'oldest' | 'newest' | 'severity' | 'line';

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

/** What the decision box is about: one or several files, or a single 5 Why / CAPA plan. */
type Pending =
  | { kind: 'dossiers'; ids: string[]; approve: boolean }
  | { kind: 'fivewhy'; item: FiveWhyQueueItem; approve: boolean }
  | { kind: 'capa'; plan: PendingCapa; approve: boolean };

const SEVERITY_RANK: Record<string, number> = { critical: 0, critique: 0, high: 1, elevee: 1, élevée: 1, medium: 2, moyenne: 2, low: 3, faible: 3 };

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

/** Since when a file waits for its validation: its last change, else its creation. */
function waitingSince(claim: Claim): number {
  const raw = claim.updatedAt || claim.createdAt;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

function waitDays(since: number): number {
  return Math.max(0, Math.floor((Date.now() - since) / 86_400_000));
}

function waitTone(days: number): 'ok' | 'warn' | 'late' {
  return days > 14 ? 'late' : days > 7 ? 'warn' : 'ok';
}

export const AdminValidationHub: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const tab: TabId =
    tabParam === 'capa' ? 'capa' :
    tabParam === 'rejected' ? 'rejected' :
    tabParam === 'fivewhy' ? 'fivewhy' :
    'dossiers';

  const [dossiers, setDossiers] = useState<Claim[]>([]);
  const [sort, setSort] = useState<SortKey>('oldest');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [capa, setCapa] = useState<PendingCapa[]>([]);
  const [rejected, setRejected] = useState<PendingCapa[]>([]);
  const [fiveWhyQueue, setFiveWhyQueue] = useState<FiveWhyQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const setTab = (next: TabId) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
    setSelected(new Set());
  };

  const loadDossiers = useCallback(async () => {
    if (!accessToken) return;
    let rows: Claim[] = [];
    try {
      rows = await qualityAnalysisService.getClaims('PENDING_VALIDATION', accessToken);
    } catch {
      rows = [];
    }
    if (!rows?.length) {
      const all = await qualityAnalysisService.getClaims(undefined, accessToken);
      rows = (all || []).filter(isPendingDossier);
    } else {
      rows = rows.filter(isPendingDossier);
    }
    setDossiers(rows);
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
    try {
      setFiveWhyQueue(await getFiveWhyQueue(accessToken));
    } catch {
      setFiveWhyQueue([]);
    }
  }, [accessToken]);

  const loadAll = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDossiers(), loadCapa(), loadRejected(), loadFiveWhy()]);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || i18n.t('validationHub.loadFailed'));
    } finally {
      setLoading(false);
    }
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

  const sortedDossiers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? dossiers.filter((c) =>
          [c.title, c.reference, c.clientId, c.defectType, c.productionLine, c.lotNumber, c.assignedToName]
            .some((v) => String(v || '').toLowerCase().includes(q)))
      : dossiers;
    const sev = (c: Claim) => SEVERITY_RANK[String(c.severity || '').toLowerCase()] ?? 4;
    return [...rows].sort((a, b) => {
      if (sort === 'newest') return waitingSince(b) - waitingSince(a);
      if (sort === 'severity') return sev(a) - sev(b) || waitingSince(a) - waitingSince(b);
      if (sort === 'line') return String(a.productionLine || '~').localeCompare(String(b.productionLine || '~')) || waitingSince(a) - waitingSince(b);
      return waitingSince(a) - waitingSince(b);
    });
  }, [dossiers, sort, search]);

  const sortedFiveWhy = useMemo(
    () => [...fiveWhyQueue].sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime()),
    [fiveWhyQueue]
  );

  const visibleIds = useMemo(() => sortedDossiers.map((c) => c.id), [sortedDossiers]);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id)); else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const openDialog = (p: Pending) => { setDialogError(null); setPending(p); };
  const closeDialog = useCallback(() => { if (!dialogBusy) setPending(null); }, [dialogBusy]);

  const confirmDialog = async (reason: string) => {
    if (!accessToken || !pending) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (pending.kind === 'dossiers') {
        const results = await decideDossiers(accessToken, pending.ids, pending.approve, reason);
        const done = new Set(results.filter((r) => r.ok).map((r) => r.id));
        const failed = results.filter((r) => !r.ok);
        setDossiers((prev) => prev.filter((c) => !done.has(c.id)));
        setSelected((prev) => new Set(Array.from(prev).filter((id) => !done.has(id))));
        setNotice(
          failed.length === 0
            ? t(pending.approve ? 'validationHub.noticeApproved' : 'validationHub.noticeReturned', { count: done.size })
            : t('validationHub.noticePartial', { done: done.size, failed: failed.length, reason: failed[0].error || '' })
        );
      } else if (pending.kind === 'fivewhy') {
        const { item, approve } = pending;
        await qualityAnalysisService.validateFiveWhy(
          {
            analysisId: item.analysisId,
            claimId: item.claimId,
            isApproved: approve,
            validatedBy: '',
            statusCode: approve ? 'VALIDATED' : 'DRAFT',
          } as any,
          accessToken
        );
        if (!approve) await notifyFiveWhyReturned(accessToken, item.claimId, reason).catch(() => undefined);
        setFiveWhyQueue((prev) => prev.filter((x) => x.analysisId !== item.analysisId));
        setNotice(t(approve ? 'validationHub.noticeApproved' : 'validationHub.noticeReturned', { count: 1 }));
      } else {
        const { plan, approve } = pending;
        if (approve) {
          await closeActionPlan(accessToken, plan.id);
        } else {
          await rejectActionPlan(accessToken, plan.id, reason);
          await loadRejected();
        }
        setCapa((prev) => prev.filter((x) => x.id !== plan.id));
        setNotice(t(approve ? 'validationHub.noticeApproved' : 'validationHub.noticeReturned', { count: 1 }));
      }
      setPending(null);
    } catch (e: any) {
      console.error(e);
      setDialogError(
        workflowMessage(e) ??
        e?.response?.data?.error ??
        e?.response?.data?.message ??
        t('validationHub.decisionFailed')
      );
    } finally {
      setDialogBusy(false);
    }
  };

  const askCapa = (p: PendingCapa, approve: boolean) => {
    if (approve && (p.proofCount ?? 0) <= 0) {
      setNotice(t('validationHub.proofRequired'));
      return;
    }
    openDialog({ kind: 'capa', plan: p, approve });
  };

  const dialogTitle = !pending ? '' : pending.approve ? t('validationHub.dialogApproveTitle') : t('validationHub.dialogReturnTitle');
  const dialogCount = pending?.kind === 'dossiers' ? pending.ids.length : 1;
  const dialogMessage = !pending
    ? undefined
    : pending.kind === 'dossiers'
      ? t(pending.approve ? 'validationHub.dialogApproveDossiers' : 'validationHub.dialogReturnDossiers', { count: dialogCount })
      : pending.kind === 'fivewhy'
        ? t(pending.approve ? 'validationHub.confirmApproveFiveWhy' : 'validationHub.confirmReturnFiveWhy')
        : t(pending.approve ? 'validationHub.confirmValidateCapa' : 'validationHub.returnReasonPrompt');

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
              <button type="button" className="avh-ko" onClick={() => askCapa(p, false)}>
                {t('validationHub.return')}
              </button>
              <button type="button" className="avh-ok" onClick={() => askCapa(p, true)}>
                {t('validationHub.validateD5')}
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
        .avh-tab .n {
          display:inline-flex; min-width:18px; height:18px; padding:0 5px; margin-left:6px;
          align-items:center; justify-content:center; border-radius:999px; font-size:10px;
          background:rgba(255,255,255,.2);
        }
        .avh-tab:not(.on) .n { background:#eef2ff; color:var(--navy); }
        .avh-tools { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin:0 0 12px; }
        .avh-search { flex:1; min-width:200px; height:34px; border:1px solid var(--line); border-radius:8px; background:#fff; padding:0 12px; font:inherit; font-size:13px; }
        .avh-select { height:34px; border:1px solid var(--line); border-radius:8px; background:#fff; padding:0 10px; font:inherit; font-size:12.5px; color:#334155; }
        .avh-checkall { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:600; color:#334155; cursor:pointer; }
        .avh-bulk {
          position:sticky; top:62px; z-index:20; display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          background:var(--navy); color:#fff; border-radius:12px; padding:10px 14px; margin-bottom:12px; box-shadow:0 6px 18px rgba(0,1,104,.25);
        }
        .avh-bulk strong { font-size:13px; margin-right:auto; }
        .avh-bulk button { height:32px; padding:0 14px; border-radius:8px; border:none; font:inherit; font-size:12.5px; font-weight:700; cursor:pointer; }
        .avh-bulk .ok { background:#059669; color:#fff; }
        .avh-bulk .ko { background:#fff; color:#b91c1c; }
        .avh-bulk .clr { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.4); }
        .avh-card {
          background:#fff; border:1px solid var(--line); border-radius:14px; padding:14px 16px;
          display:flex; gap:14px; align-items:center; justify-content:space-between; flex-wrap:wrap;
        }
        .avh-card.sel { border-color:var(--navy); box-shadow:0 0 0 1px var(--navy) inset; }
        .avh-cb { width:18px; height:18px; accent-color:var(--navy); cursor:pointer; flex-shrink:0; }
        .avh-ref { font-family:'JetBrains Mono', ui-monospace, monospace; font-size:11px; color:#64748b; margin-right:8px; }
        .avh-list { display:flex; flex-direction:column; gap:10px; }
        .avh-title-sm { margin:0; font-size:14px; font-weight:700; color:var(--ink); }
        .avh-meta { margin-top:4px; font-size:12px; color:#94a3b8; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .avh-pill {
          font-size:10px; font-weight:700; padding:3px 8px; border-radius:6px;
          background:#fffbeb; color:#b45309;
        }
        .avh-wait { font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:6px; }
        .avh-wait.ok { background:#ecfdf5; color:#047857; }
        .avh-wait.warn { background:#fffbeb; color:#b45309; }
        .avh-wait.late { background:#fef2f2; color:#b91c1c; }
        .avh-acts { display:flex; gap:8px; flex-wrap:wrap; }
        .avh-ok { background:#059669; color:#fff; border:none; border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
        .avh-ko { background:#fff; color:#b91c1c; border:1px solid #fecaca; border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
        .avh-ghost { background:#fff; color:var(--navy); border:1px solid var(--line); border-radius:8px; height:32px; padding:0 12px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; text-decoration:none; display:inline-flex; align-items:center; }
        .avh-empty, .avh-loading { padding:48px 20px; text-align:center; color:var(--muted); background:#fff; border:1px dashed var(--line); border-radius:14px; }
        .avh-error { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:13px; }
        .avh-notice { background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; border-radius:10px; padding:10px 12px; margin-bottom:12px; font-size:13px; display:flex; justify-content:space-between; gap:10px; }
        .avh-notice button { border:none; background:none; color:inherit; cursor:pointer; font-size:16px; line-height:1; }
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
        </div>

        {error && <div className="avh-error">{error}</div>}
        {notice && (
          <div className="avh-notice" role="status">
            <span>{notice}</span>
            <button type="button" aria-label={t('decisionDialog.cancel')} onClick={() => setNotice(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className="avh-loading">{t('validationHub.loading')}</div>
        ) : tab === 'dossiers' ? (
          dossiers.length === 0 ? (
            <div className="avh-empty">{t('validationHub.emptyDossiers')}</div>
          ) : (
            <>
              <div className="avh-tools">
                <label className="avh-checkall">
                  <input type="checkbox" className="avh-cb" checked={allVisibleSelected} onChange={toggleAllVisible} />
                  {t('validationHub.selectAll', { count: visibleIds.length })}
                </label>
                <input
                  className="avh-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('validationHub.searchPlaceholder')}
                  aria-label={t('validationHub.searchPlaceholder')}
                />
                <select className="avh-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t('validationHub.sortLabel')}>
                  <option value="oldest">{t('validationHub.sortOldest')}</option>
                  <option value="newest">{t('validationHub.sortNewest')}</option>
                  <option value="severity">{t('validationHub.sortSeverity')}</option>
                  <option value="line">{t('validationHub.sortLine')}</option>
                </select>
              </div>

              {selectedVisible.length > 0 && (
                <div className="avh-bulk" role="toolbar">
                  <strong>{t('validationHub.selectedCount', { count: selectedVisible.length })}</strong>
                  <button type="button" className="ok" onClick={() => openDialog({ kind: 'dossiers', ids: selectedVisible, approve: true })}>
                    {t('validationHub.approveSelection')}
                  </button>
                  <button type="button" className="ko" onClick={() => openDialog({ kind: 'dossiers', ids: selectedVisible, approve: false })}>
                    {t('validationHub.returnSelection')}
                  </button>
                  <button type="button" className="clr" onClick={() => setSelected(new Set())}>{t('validationHub.clearSelection')}</button>
                </div>
              )}

              {sortedDossiers.length === 0 ? (
                <div className="avh-empty">{t('validationHub.noMatch')}</div>
              ) : (
                <div className="avh-list">
                  {sortedDossiers.map((claim) => {
                    const days = waitDays(waitingSince(claim));
                    return (
                      <div key={claim.id} className={`avh-card${selected.has(claim.id) ? ' sel' : ''}`}>
                        <input
                          type="checkbox"
                          className="avh-cb"
                          checked={selected.has(claim.id)}
                          onChange={() => toggleOne(claim.id)}
                          aria-label={t('validationHub.selectOne', { title: claim.title || '' })}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 className="avh-title-sm">
                            {claim.reference && <span className="avh-ref">{claim.reference}</span>}
                            {claim.title || t('validationHub.untitledDossier')}
                          </h3>
                          <div className="avh-meta">
                            <span className={`avh-wait ${waitTone(days)}`}>{t('validationHub.waitingFor', { count: days })}</span>
                            <span>{claim.clientId || '—'}</span>
                            <span>{claim.defectType || '—'}</span>
                            <span>{claim.severity || '—'}</span>
                            {claim.productionLine && <span>{claim.productionLine}</span>}
                            {claim.lotNumber && <span>{t('closedArchive.lot', { lot: claim.lotNumber })}</span>}
                            {claim.assignedToName && <span>{claim.assignedToName}</span>}
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
                          <button type="button" className="avh-ko" onClick={() => openDialog({ kind: 'dossiers', ids: [claim.id], approve: false })}>
                            {t('validationHub.return')}
                          </button>
                          <button type="button" className="avh-ok" onClick={() => openDialog({ kind: 'dossiers', ids: [claim.id], approve: true })}>
                            {t('validationHub.approve')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
            {sortedFiveWhy.map((item) => {
              const days = waitDays(new Date(item.since).getTime());
              return (
                <div key={item.analysisId} className="avh-card">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="avh-title-sm">
                      {item.reference && <span className="avh-ref">{item.reference}</span>}
                      {item.claimTitle || t('analysisTools.claim')}
                    </h3>
                    <div className="avh-meta">
                      <span className="avh-pill">{t('validationHub.pillFiveWhy')}</span>
                      <span className={`avh-wait ${waitTone(days)}`}>{t('validationHub.waitingFor', { count: days })}</span>
                      <span>{item.clientId || '—'}</span>
                      <span>{item.defectType || '—'}</span>
                      {item.assignedToName && <span>{item.assignedToName}</span>}
                    </div>
                    {item.rootCause && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#334155' }}>
                        {t('validationHub.rootCause')} : {item.rootCause.slice(0, 160)}
                        {item.rootCause.length > 160 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div className="avh-acts">
                    <button
                      type="button"
                      className="avh-ghost"
                      onClick={() => navigate(`/pages/front/quality-analyses/5why/${item.claimId}`)}
                    >
                      {t('qualityHistory.open')}
                    </button>
                    <button type="button" className="avh-ko" onClick={() => openDialog({ kind: 'fivewhy', item, approve: false })}>
                      {t('validationHub.return')}
                    </button>
                    <button type="button" className="avh-ok" onClick={() => openDialog({ kind: 'fivewhy', item, approve: true })}>
                      {t('validationHub.approve')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DecisionDialog
        open={pending !== null}
        title={dialogTitle}
        message={dialogMessage}
        reason={pending ? !pending.approve : false}
        confirmLabel={pending?.approve ? t('validationHub.approve') : t('validationHub.return')}
        tone={pending?.approve ? 'ok' : 'danger'}
        busy={dialogBusy}
        error={dialogError}
        onCancel={closeDialog}
        onConfirm={(reason) => void confirmDialog(reason)}
      />
    </div>
  );
};

export default AdminValidationHub;
