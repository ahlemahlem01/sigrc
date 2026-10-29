import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ACTION_PLAN_ORIGIN } from '../../config/apiEnv';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  History,
  Loader2,
  Pencil,
  Building2,
  AlertTriangle,
  RefreshCw,
  Paperclip,
  FileText,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  updatePlanActionProgress,
  getAssignedActionPlanById,
  getPlanActions,
  getRejectedActionPlans,
  resubmitActionPlan,
  uploadPlanActionDocument,
} from '../../services/actionPlanService';
import { PlanActionHistoryModal } from '../../components/PlanActionHistoryModal';
import { updatePlanActionDescription } from '../../services/actionPlanService';
import axios from 'axios';
import './MyActionPlanDetail.styles.css';
import WorkflowStages from '../../components/capa/WorkflowStages';
import ActionProofs from '../../components/capa/ActionProofs';
import PlanTimeline from '../../components/capa/PlanTimeline';
import PlanComments from '../../components/capa/PlanComments';
import { domainLabel, domainOf } from '../../utils/planDomain';
import { workflowStageOf } from '../../utils/workflowStage';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

const API = ACTION_PLAN_ORIGIN;

interface ActionPlan {
  id: string;
  title: string;
  description?: string;
  status: number;
  type: number;
  domain?: string;
  assignedToId?: string;
  progress: number;
  departmentId?: string;
  departmentName?: string;
  createdAt?: string;
  deadline?: string;
  updatedBy?: string;
  claimId?: string;
  permissions?: { view: boolean; edit: boolean; delete: boolean };
}

interface PlanAction {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: number;
  progress: number;
  status?: number;
  actionPlanId: string;
  documentCount?: number;
}

const TYPE_LABEL: Record<number, string> = {
  1: 'PA',
  2: 'PAC',
  3: 'PAP',
};

/** i18n keys */
const PRIORITY_LABEL: Record<number, string> = {
  1: 'myActionPlans.priorityHigh',
  2: 'myActionPlans.priorityMedium',
  3: 'myActionPlans.priorityLow',
  0: 'myActionPlans.priorityLow',
};

/** Repair classic UTF-8 read as Latin-1 (e.g. SÃ©curisation → Sécurisation). */
function fixText(raw?: string | null): string {
  if (!raw) return '';
  if (!/[ÃÂ]/.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(Array.from(raw), (ch) => ch.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (decoded && !decoded.includes('\uFFFD')) return decoded;
  } catch {
    /* keep original */
  }
  return raw;
}

function unwrapData<T>(payload: unknown): T {
  if (payload == null) return payload as T;
  if (typeof payload === 'object' && payload !== null && 'data' in (payload as object)) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) return unwrapData<T>(inner);
  }
  return payload as T;
}

function toList<T>(payload: unknown): T[] {
  const data = unwrapData<unknown>(payload);
  return Array.isArray(data) ? (data as T[]) : [];
}

function toProgress(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    const map: Record<string, number> = {
      NotStarted: 0,
      TwentyFive: 25,
      ThirtyThree: 33,
      Fifty: 50,
      SixtySix: 66,
      SeventyFive: 75,
      Hundred: 100,
      Validated: 101,
      Cancelled: 102,
    };
    if (map[raw] != null) return map[raw];
  }
  return 0;
}

function safePct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const formatDate = (dateStr?: string) =>
  dateStr
    ? new Date(dateStr).toLocaleDateString(dateLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const daysLate = (deadline?: string) => {
  if (!deadline) return 0;
  const due = new Date(deadline);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
};

const isActionComplete = (progress: number) => progress >= 100 && progress < 102;

const derivePlanStatus = (
  plan: ActionPlan,
  hasActions: boolean,
  globalProgress: number,
  lateDays: number
): { label: string; cls: string } => {
  if (plan.status === 3) return { label: i18n.t('planDetail.statusDone'), cls: 'mpd-badge--done' };
  if (plan.status === 4) return { label: i18n.t('status.archived'), cls: 'mpd-badge--muted' };

  // Overdue open plans must never look "done" / green
  if (lateDays > 0) return { label: i18n.t('planDetail.late'), cls: 'mpd-badge--late' };

  const progress = hasActions ? globalProgress : safePct(plan.progress);
  if (progress === 0) return { label: i18n.t('planDetail.notStarted'), cls: 'mpd-badge--idle' };
  if (progress >= 100) return { label: i18n.t('alerts.statusPending'), cls: 'mpd-badge--wait' };
  return { label: i18n.t('status.ongoing'), cls: 'mpd-badge--live' };
};

export default function MyActionPlanDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [actions, setActions] = useState<PlanAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftProgress, setDraftProgress] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sliderError, setSliderError] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [directProgress, setDirectProgress] = useState(0);
  const [savingDirect, setSavingDirect] = useState(false);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  // rewriting the description of a sub-action (the old text stays in its history)
  const [descActionId, setDescActionId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState('');
  const [descSaving, setDescSaving] = useState(false);
  const [descVersion, setDescVersion] = useState(0);   // counts the rewrites: the history reloads after each one
  const [descError, setDescError] = useState<string | null>(null);
  // changes whenever the actions are reloaded: proofs and the plan history reload with them
  const historyTick = useMemo(() => actions.map((a) => `${a.id}:${a.progress}:${a.documentCount ?? 0}`).join('|') + `#${descVersion}`, [actions, descVersion]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [rejection, setRejection] = useState<{ comment: string; at?: string } | null>(null);
  const [resubmitting, setResubmitting] = useState(false);

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [accessToken, id]);

  useEffect(() => {
    if (plan) setDirectProgress(safePct(plan.progress));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [plan?.id, plan?.progress]);

  const load = async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [planRes, actionsRes, rejectedRes] = await Promise.all([
        getAssignedActionPlanById(accessToken, id),
        getPlanActions(accessToken, id),
        getRejectedActionPlans(accessToken).catch(() => null),
      ]);

      // Sent back by an admin and not resubmitted yet: show the reason and the resubmit button.
      const rejectedRow = toList<any>(rejectedRes?.data).find((r) => String(r.id ?? r.Id) === id);
      setRejection(
        rejectedRow
          ? {
              comment: fixText(rejectedRow.lastRejectComment ?? rejectedRow.LastRejectComment ?? ''),
              at: rejectedRow.lastRejectedAt ?? rejectedRow.LastRejectedAt,
            }
          : null,
      );

      const planRaw = unwrapData<any>(planRes.data);
      const mappedPlan: ActionPlan = {
        id: String(planRaw?.id ?? planRaw?.Id ?? id),
        title: fixText(planRaw?.title ?? planRaw?.Title ?? ''),
        description: fixText(planRaw?.description ?? planRaw?.Description ?? '') || undefined,
        status: Number(planRaw?.status ?? planRaw?.Status ?? 1),
        type: Number(planRaw?.type ?? planRaw?.Type ?? 0),
        progress: toProgress(planRaw?.progress ?? planRaw?.Progress),
        domain: domainOf({ domain: planRaw?.domain ?? planRaw?.Domain }),
        assignedToId: String(planRaw?.assignedToId ?? planRaw?.AssignedToId ?? '').trim() || undefined,
        departmentId: planRaw?.departmentId ?? planRaw?.DepartmentId,
        departmentName: fixText(planRaw?.departmentName ?? planRaw?.DepartmentName) || undefined,
        createdAt: planRaw?.createdAt ?? planRaw?.CreatedAt,
        deadline: planRaw?.deadline ?? planRaw?.Deadline,
        updatedBy: planRaw?.updatedBy ?? planRaw?.UpdatedBy,
        claimId: (() => {
          const c = planRaw?.claimId ?? planRaw?.ClaimId;
          return c ? String(c) : undefined;
        })(),
        permissions: planRaw?.permissions ?? planRaw?.Permissions,
      };

      const list = toList<any>(actionsRes.data).map((a) => ({
        id: String(a.id ?? a.Id),
        title: fixText(a.title ?? a.Title ?? ''),
        description: fixText(a.description ?? a.Description ?? '') || undefined,
        deadline: a.deadline ?? a.Deadline,
        priority: Number(a.priority ?? a.Priority ?? 2),
        progress: toProgress(a.progress ?? a.Progress),
        status: a.status ?? a.Status,
        actionPlanId: String(a.actionPlanId ?? a.ActionPlanId ?? id),
        documentCount: Number(a.documentCount ?? a.DocumentCount ?? 0),
      })) as PlanAction[];

      setPlan(mappedPlan);
      setActions(list);
    } catch (e) {
      console.error(e);
      setError(t('planDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const globalProgress = useMemo(() => {
    if (actions.length === 0) return 0;
    const sum = actions.reduce((acc, a) => {
      const p = toProgress(a.progress);
      return acc + (p > 100 ? 100 : p);
    }, 0);
    return safePct(sum / actions.length);
  }, [actions]);

  const displayProgress = useMemo(() => {
    if (actions.length > 0) return globalProgress;
    return safePct(plan?.progress ?? 0);
  }, [actions.length, globalProgress, plan?.progress]);

  const completedCount = useMemo(
    () => actions.filter((a) => isActionComplete(toProgress(a.progress))).length,
    [actions]
  );
  const inProgressCount = useMemo(
    () =>
      actions.filter((a) => {
        const p = toProgress(a.progress);
        return p > 0 && p < 100;
      }).length,
    [actions]
  );
  const notStartedCount = useMemo(
    () => actions.filter((a) => toProgress(a.progress) === 0).length,
    [actions]
  );

  const actionOverdueDays = useMemo(() => {
    if (!plan || plan.status === 3 || plan.status === 4) return 0;
    let maxLate = 0;
    for (const a of actions) {
      const p = toProgress(a.progress);
      if (p >= 100) continue;
      if (!a.deadline) continue;
      const late = daysLate(a.deadline);
      if (late > maxLate) maxLate = late;
    }
    return maxLate;
  }, [actions, plan]);

  const planDeadlineLate = plan?.deadline ? daysLate(plan.deadline) : 0;
  const lateDays = Math.max(
    plan && plan.status !== 3 && plan.status !== 4 ? planDeadlineLate : 0,
    actionOverdueDays
  );
  const planIsOverdue = lateDays > 0;

  const planStatusBadge = useMemo(() => {
    if (!plan) return { label: '—', cls: 'mpd-badge--muted' };
    if (rejection) return { label: t('planDetail.sentBack'), cls: 'mpd-badge--late' };
    return derivePlanStatus(plan, actions.length > 0, globalProgress, lateDays);
  }, [plan, actions.length, globalProgress, lateDays, rejection, t]);

  const allActionsDone = actions.every((a) => isActionComplete(toProgress(a.progress)));

  const onResubmit = async () => {
    if (!accessToken || !id || resubmitting) return;
    setResubmitting(true);
    setError(null);
    try {
      await resubmitActionPlan(accessToken, id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || t('planDetail.resubmitFailed'));
    } finally {
      setResubmitting(false);
    }
  };

  const canEditDirectProgress = useMemo(() => {
    if (!plan) return false;
    if (plan.status === 3 || plan.status === 4) return false;
    if (actions.length > 0) return false;
    return true;
  }, [plan, actions.length]);

  const editingAction = useMemo(
    () => actions.find((a) => a.id === editingId) ?? null,
    [actions, editingId]
  );

  const closeSlider = () => {
    setEditingId(null);
    setSliderError(null);
    setProofFile(null);
  };

  const saveDirectProgress = async () => {
    if (!accessToken || !id) return;
    setSavingDirect(true);
    setError(null);
    try {
      await axios.patch(
        `${API}/api/actionplan/assigned/${id}/progress`,
        { Progress: directProgress },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      await load();
    } catch (e: any) {
      const status = e?.response?.status;
      const apiMsg = e?.response?.data?.error || e?.response?.data?.message;
      if (status === 403) {
        setError(apiMsg || t('planDetail.noPermission'));
      } else if (status === 400) {
        setError(apiMsg || t('planDetail.updateRefused'));
      } else {
        setError(apiMsg || t('planDetail.updateError'));
      }
    } finally {
      setSavingDirect(false);
    }
  };

  const openDescription = (action: PlanAction) => {
    setDescActionId(action.id);
    setDescDraft(action.description ?? '');
    setDescError(null);
  };

  const closeDescription = () => {
    if (descSaving) return;
    setDescActionId(null);
    setDescError(null);
  };

  const saveDescription = async () => {
    if (!accessToken || !descActionId) return;
    const current = actions.find((a) => a.id === descActionId);
    const text = descDraft.trim();
    if (!text) {
      setDescError(t('planDetail.descriptionRequired'));
      return;
    }
    if (text === (current?.description ?? '').trim()) {
      setDescError(t('planDetail.descriptionUnchanged'));
      return;
    }
    setDescSaving(true);
    setDescError(null);
    try {
      await updatePlanActionDescription(accessToken, descActionId, text);
      setActions((prev) => prev.map((a) => (a.id === descActionId ? { ...a, description: text } : a)));
      setDescVersion((v) => v + 1);
      setDescActionId(null);
    } catch (e: any) {
      setDescError(e?.response?.data?.error || e?.response?.data?.message || t('planDetail.descriptionFailed'));
    } finally {
      setDescSaving(false);
    }
  };

  const openSlider = (action: PlanAction) => {
    const p = toProgress(action.progress);
    if (p >= 101) return;
    setEditingId(action.id);
    setDraftProgress(safePct(p));
    setSliderError(null);
    setProofFile(null);
  };

  const saveProgress = async (actionId: string) => {
    if (!accessToken) return;
    setSavingId(actionId);
    setSliderError(null);
    try {
      if (draftProgress >= 100 && !proofFile) {
        const existing = actions.find((a) => a.id === actionId)?.documentCount ?? 0;
        if (existing <= 0) {
          setSliderError(t('planDetail.proofRequired'));
          return;
        }
      }
      if (proofFile) {
        await uploadPlanActionDocument(accessToken, actionId, proofFile);
      }
      await updatePlanActionProgress(accessToken, actionId, draftProgress);
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId
            ? {
                ...a,
                progress: draftProgress,
                documentCount: (a.documentCount ?? 0) + (proofFile ? 1 : 0),
              }
            : a
        )
      );
      closeSlider();
    } catch (e: any) {
      console.error(e);
      setSliderError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          t('planDetail.progressFailed')
      );
    } finally {
      setSavingId(null);
    }
  };

  const quickComplete = async (actionId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    openSlider(action);
    setDraftProgress(100);
  };

  const onUploadProof = async (actionId: string, file: File | null) => {
    if (!accessToken || !file) return;
    setUploadingId(actionId);
    setError(null);
    try {
      await uploadPlanActionDocument(accessToken, actionId, file);
      setActions((prev) =>
        prev.map((a) =>
          a.id === actionId ? { ...a, documentCount: (a.documentCount ?? 0) + 1 } : a
        )
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || t('planDetail.uploadFailed'));
    } finally {
      setUploadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mpd-wrap">
        <div className="mpd-state">
          <Loader2 className="mpd-spin" size={20} />
          {t('planDetail.loading')}
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mpd-wrap">
        <div className="mpd-state">{t('planDetail.notFound')}</div>
      </div>
    );
  }

  return (
    <div className="mpd-wrap">
      <div className="mpd-head">
        <div className="mpd-head-left">
          <button
            type="button"
            className="mpd-back"
            onClick={() => navigate('/pages/front/my-action-plans')}
          >
            <ArrowLeft size={15} /> {t('planDetail.back')}
          </button>
          <div>
            <div className="mpd-kicker">{t('planDetail.kicker')}</div>
            <h1 className={`mpd-title${planIsOverdue ? ' is-overdue' : ''}`}>{plan.title || t('closedArchive.untitled')}</h1>
            {plan.description && <p className="mpd-desc">{plan.description}</p>}
            {plan.claimId && (
              <Link
                className="mpd-dossier-link"
                to={`/pages/front/quality-analyses/8d/${encodeURIComponent(plan.claimId)}`}
              >
                {t('planDetail.linkedDossier')}
              </Link>
            )}
          </div>
        </div>
        <div className="mpd-head-actions">
          <button type="button" className="mpd-btn-sec" onClick={() => void load()}>
            <RefreshCw size={14} /> {t('qualityHistory.refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mpd-alert" role="alert">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {planIsOverdue && (
        <div className="mpd-late-banner" role="status">
          <AlertTriangle size={15} />
          {t('planDetail.overdueBy', { count: lateDays })}
          {plan.deadline ? ` — ${formatDate(plan.deadline)}` : ''}.
        </div>
      )}

      {rejection && (
        <div className="mpd-reject-banner" role="status">
          <div>
            <strong>{rejection.at ? t('planDetail.sentBackOn', { date: formatDate(rejection.at) }) : t('planDetail.sentBackTitle')}</strong>
            {rejection.comment && <p>« {rejection.comment} »</p>}
            {!allActionsDone && <p>{t('planDetail.finishActionsFirst')}</p>}
          </div>
          <button
            type="button"
            className="mpd-btn-primary"
            disabled={!allActionsDone || resubmitting}
            onClick={() => void onResubmit()}
          >
            {resubmitting ? <Loader2 size={14} className="mpd-spin" /> : <Check size={14} />} {t('planDetail.resubmit')}
          </button>
        </div>
      )}

      <div style={{ margin: '0 0 14px' }}>
        <WorkflowStages current={workflowStageOf({ status: plan.status, assignedToId: plan.assignedToId }, actions.map((a) => ({ progress: toProgress(a.progress) })))} compact />
      </div>

      <section className={`mpd-summary${planIsOverdue ? ' is-overdue' : ''}`}>
        <div className="mpd-summary-main">
          <div className="mpd-badges">
            <span className={`mpd-badge ${planStatusBadge.cls}`}>{planStatusBadge.label}</span>
            {plan.type != null && (
              <span className="mpd-badge mpd-badge--type">{TYPE_LABEL[plan.type] ?? t('deadlines.untitledPlan')}</span>
            )}
            <span className="mpd-badge mpd-badge--type" title={t('planDomain.label')}>{domainLabel(plan.domain)}</span>
            {plan.departmentName && (
              <span className="mpd-chip">
                <Building2 size={12} /> {plan.departmentName}
              </span>
            )}
            {plan.deadline && (
              <span className={`mpd-chip${planIsOverdue ? ' is-late' : ''}`}>
                <Calendar size={12} />
                {planIsOverdue
                  ? t('planDetail.daysLate', { count: lateDays })
                  : t('planDetail.dueOn', { date: formatDate(plan.deadline) })}
              </span>
            )}
          </div>

          <div className="mpd-progress-block">
            <div className="mpd-progress-top">
              <span>{t('planDetail.globalProgress')}</span>
              <strong className={planIsOverdue ? 'late' : ''}>{displayProgress}%</strong>
            </div>
            <div className="mpd-progress-track">
              <div
                className={`mpd-progress-fill${planIsOverdue ? ' is-late' : ''}`}
                style={{ width: `${displayProgress}%` }}
              />
            </div>
          </div>

          <div className="mpd-kpis">
            <div className="mpd-kpi">
              <div className="mpd-kpi-val">{actions.length}</div>
              <div className="mpd-kpi-lbl">{t('closedArchive.total')}</div>
            </div>
            <div className="mpd-kpi">
              <div className="mpd-kpi-val" style={{ color: '#15803d' }}>{completedCount}</div>
              <div className="mpd-kpi-lbl">{t('planDetail.kpiDone')}</div>
            </div>
            <div className="mpd-kpi">
              <div className="mpd-kpi-val" style={{ color: '#1d4ed8' }}>{inProgressCount}</div>
              <div className="mpd-kpi-lbl">{t('status.ongoing')}</div>
            </div>
            <div className="mpd-kpi">
              <div className="mpd-kpi-val">{notStartedCount}</div>
              <div className="mpd-kpi-lbl">{t('planDetail.kpiNotStarted')}</div>
            </div>
          </div>

          <div className="mpd-dates">
            <span><Clock3 size={13} /> {t('planDetail.assignedOn', { date: formatDate(plan.createdAt) })}</span>
            {plan.deadline && (
              <span className={planIsOverdue ? 'late' : ''}>
                <Calendar size={13} /> {t('planDetail.dueLabel', { date: formatDate(plan.deadline) })}
              </span>
            )}
          </div>
        </div>
      </section>

      {canEditDirectProgress && (
        <section className="mpd-panel">
          <h2>{t('planDetail.yourProgress')}</h2>
          <p className="mpd-panel-sub">
            {t('planDetail.noActionsHint')}
          </p>
          <div className="mpd-slider-row">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={directProgress}
              onChange={(e) => setDirectProgress(Number(e.target.value))}
            />
            <strong>{directProgress}%</strong>
          </div>
          <div className="mpd-presets">
            {[0, 25, 50, 75, 100].map((v) => (
              <button type="button" key={v} onClick={() => setDirectProgress(v)}>
                {v}%
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mpd-btn-primary"
            onClick={() => void saveDirectProgress()}
            disabled={savingDirect}
          >
            {savingDirect ? t('common.saving') : t('planDetail.saveProgress')}
          </button>
        </section>
      )}

      {!rejection && plan.status === 2 && displayProgress >= 100 && !planIsOverdue && (
        <div className="mpd-wait-banner">
          <CheckCircle2 size={15} />
          {t('planDetail.awaitingAdmin')}
        </div>
      )}

      <div className="mpd-grid">
        <section className="mpd-panel">
          <div className="mpd-panel-head">
            <h2>{t('planDetail.mySubActions')}</h2>
            <span className="mpd-count">{actions.length}</span>
          </div>

          {actions.length === 0 ? (
            <div className="mpd-empty">
              <CircleDashed size={28} />
              <p>{t('planDetail.noSubActions')}</p>
            </div>
          ) : (
            <div className="mpd-action-list">
              {actions.map((action) => {
                const progress = toProgress(action.progress);
                const isDone = progress >= 100 && progress < 101;
                const isValidated = progress === 101;
                const isCancelled = progress === 102;
                const editable = !isValidated && !isCancelled && plan.status !== 3 && plan.status !== 4;
                const late = action.deadline ? daysLate(action.deadline) : 0;
                const isLate = late > 0 && !isActionComplete(progress);
                const isSaving = savingId === action.id;
                const barPct = safePct(progress > 100 ? 100 : progress);

                return (
                  <div
                    key={action.id}
                    className={[
                      'mpd-action',
                      isDone || isValidated ? 'is-done' : '',
                      isLate ? 'is-late' : '',
                      isCancelled ? 'is-cancelled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="mpd-action-status" aria-hidden>
                      {isValidated || isDone ? (
                        <Check size={14} />
                      ) : isLate ? (
                        <AlertTriangle size={13} />
                      ) : null}
                    </div>

                    <div className="mpd-action-body">
                      <div className="mpd-action-top">
                        <h3 className={isLate ? 'is-late-title' : undefined}>
                          {action.title || t('closedArchive.untitled')}
                        </h3>
                        <div className="mpd-action-tags">
                          {isLate && <span className="mpd-badge mpd-badge--late">{t('planDetail.late')}</span>}
                          <span className={`mpd-prio prio-${action.priority}`}>
                            {PRIORITY_LABEL[action.priority] ? t(PRIORITY_LABEL[action.priority]) : '—'}
                          </span>
                        </div>
                      </div>

                      {action.description && (
                        <p className="mpd-action-desc">{action.description}</p>
                      )}

                      {!isValidated && !isCancelled && (
                        <div className="mpd-mini-bar">
                          <div
                            className={isLate ? 'is-late' : ''}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      )}

                      <div className="mpd-action-foot">
                        <span className={isLate ? 'late' : ''}>
                          {isLate
                            ? t('planDetail.daysLate', { count: late })
                            : action.deadline
                              ? t('planDetail.dueOn', { date: formatDate(action.deadline) })
                              : t('planDetail.noDeadline')}
                        </span>
                        <span className="mpd-pct">
                          {isValidated ? t('planDetail.validated') : isCancelled ? t('planDetail.cancelled') : `${barPct}%`}
                        </span>
                      </div>

                      <div className="mpd-action-btns">
                        <button
                          type="button"
                          className="mpd-btn-sec"
                          onClick={() => setHistoryActionId(action.id)}
                        >
                          <History size={13} /> {t('frontNav.history')}
                        </button>

                        <label className="mpd-btn-sec mpd-file-btn">
                          <Paperclip size={13} />
                          {uploadingId === action.id ? t('fiveWhy.sending') : t('planDetail.attachProof')}
                          <input
                            type="file"
                            hidden
                            disabled={uploadingId === action.id || !editable}
                            onChange={(e) =>
                              void onUploadProof(action.id, e.target.files?.[0] || null)
                            }
                          />
                        </label>

                        {editable && (
                          <>
                            <button
                              type="button"
                              className="mpd-btn-sec"
                              onClick={() => openSlider(action)}
                            >
                              <Pencil size={13} /> {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              className="mpd-btn-sec"
                              onClick={() => openDescription(action)}
                            >
                              <FileText size={13} /> {t('planDetail.editDescription')}
                            </button>
                            {!isDone && (
                              <button
                                type="button"
                                className="mpd-btn-primary"
                                disabled={isSaving}
                                onClick={() => void quickComplete(action.id)}
                              >
                                {t('planDetail.finish')}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {accessToken && (
                        <ActionProofs token={accessToken} planActionId={action.id} count={action.documentCount ?? 0} refreshKey={historyTick} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start', minWidth: 0 }}>
        <aside className="mpd-panel mpd-aside" style={{ position: 'static' }}>
          <h2>{t('planDetail.details')}</h2>
          <dl className="mpd-dl">
            <div>
              <dt>{t('common.status')}</dt>
              <dd>
                <span className={`mpd-badge ${planStatusBadge.cls}`}>{planStatusBadge.label}</span>
              </dd>
            </div>
            <div>
              <dt>{t('planDetail.type')}</dt>
              <dd>{TYPE_LABEL[plan.type] ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('planDetail.department')}</dt>
              <dd>{plan.departmentName ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('planDetail.assignedOnLabel')}</dt>
              <dd>{formatDate(plan.createdAt)}</dd>
            </div>
            <div>
              <dt>{t('planDetail.deadline')}</dt>
              <dd className={planIsOverdue ? 'late' : ''}>{formatDate(plan.deadline)}</dd>
            </div>
            <div>
              <dt>{t('planDetail.progress')}</dt>
              <dd className={planIsOverdue ? 'late' : ''}>{displayProgress}%</dd>
            </div>
          </dl>
        </aside>
          {accessToken && id && <PlanComments token={accessToken} planId={id} />}
        </div>
      </div>

      <section className="mpd-panel" style={{ marginTop: 16 }}>
        <h2>{t('planTimeline.title')}</h2>
        {accessToken && id && <PlanTimeline token={accessToken} planId={id} refreshKey={historyTick} />}
      </section>

      {editingAction && (
        <div
          className="mpd-slider-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSlider();
          }}
        >
          <div
            className="mpd-slider-modal"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mpd-slider-header">
              <span>{t('planDetail.editProgress')}</span>
              <button type="button" className="mpd-icon-x" onClick={closeSlider} aria-label={t('fiveWhy.close')}>
                <X size={16} />
              </button>
            </div>
            <div className="mpd-slider-title">{editingAction.title}</div>

            <div className="mpd-slider-row">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={draftProgress}
                onChange={(e) => setDraftProgress(Number(e.target.value))}
              />
              <strong>{draftProgress}%</strong>
            </div>

            <div className="mpd-presets">
              {[0, 25, 50, 75, 100].map((v) => (
                <button type="button" key={v} onClick={() => setDraftProgress(v)}>
                  {v}%
                </button>
              ))}
            </div>

            {draftProgress >= 100 && (
              <label className="mpd-proof-field">
                <span>{t('planDetail.proofField')}</span>
                <input
                  type="file"
                  onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                />
                {proofFile && <em>{proofFile.name}</em>}
              </label>
            )}

            {sliderError && (
              <div className="mpd-slider-error">
                <AlertTriangle size={14} /> {sliderError}
              </div>
            )}

            <div className="mpd-edit-actions">
              <button type="button" className="mpd-btn-sec" onClick={closeSlider}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="mpd-btn-primary"
                disabled={savingId === editingAction.id}
                onClick={() => void saveProgress(editingAction.id)}
              >
                {savingId === editingAction.id ? t('common.saving') : t('fiveWhy.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {descActionId && (
        <div
          className="mpd-slider-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDescription();
          }}
        >
          <div className="mpd-slider-modal" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="mpd-slider-header">
              <span>{t('planDetail.editDescription')}</span>
              <button type="button" className="mpd-icon-x" onClick={closeDescription} aria-label={t('fiveWhy.close')}>
                <X size={16} />
              </button>
            </div>
            <div className="mpd-slider-title">{actions.find((a) => a.id === descActionId)?.title}</div>
            <textarea
              className="mpd-desc-input"
              rows={8}
              maxLength={4000}
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder={t('planDetail.descriptionPlaceholder')}
              autoFocus
            />
            <p className="mpd-desc-hint">{t('planDetail.descriptionHint')}</p>
            {descError && (
              <div className="mpd-slider-error">
                <AlertTriangle size={14} /> {descError}
              </div>
            )}
            <div className="mpd-edit-actions">
              <button type="button" className="mpd-btn-sec" onClick={closeDescription}>
                {t('common.cancel')}
              </button>
              <button type="button" className="mpd-btn-primary" disabled={descSaving} onClick={() => void saveDescription()}>
                {descSaving ? t('common.saving') : t('fiveWhy.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyActionId && accessToken && (
        <PlanActionHistoryModal
          token={accessToken}
          planActionId={historyActionId}
          actionTitle={actions.find((a) => a.id === historyActionId)?.title}
          onClose={() => setHistoryActionId(null)}
          initialTab="assignments"
        />
      )}
    </div>
  );
}
