import { parseProgress, toUiStatus } from '../admin/capaAnalytics';
import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getActionPlanById,
  getAssignedActionPlanById,
  getArchivedActionPlans,
  getActionPlans,
  getPlanActions,
  uploadPlanActionDocument,
  getUsersForAssignment,
} from '../../services/actionPlanService';
import {
  ArrowLeft, Calendar, Building2, Tag, User,
  Clock, CheckCircle2, AlertCircle, TrendingUp, History,
} from 'lucide-react';
import { computeIatfSla, slaToneStyles } from '../../utils/iatfSla';
import { PlanActionHistoryModal } from '../../components/PlanActionHistoryModal';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ActionPlanDto {
  id: string;
  title: string;
  description?: string;
  type: number;
  status: number;
  ownerId?: string;
  ownerName?: string;
  createdByName?: string;
  departmentId?: string;
  departmentName?: string;
  createdAt: string;
  createdBy?: string;
  deadline?: string;
  progress?: number;
  claimId?: string;
  proofCount?: number;
  lastRejectedAt?: string;
  lastRejectComment?: string;
}

interface PlanActionDto {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority: number;
  progress: number;
  assignedToId?: string;
  assignedToName?: string;
  status: number;
  documentCount?: number;
}

// ── Envelope unwrappers ───────────────────────────────────────────────────────
function unwrapOne<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // AxiosResponse → dig into .data
  if (r['data'] !== undefined && r['status'] !== undefined && r['headers'] !== undefined) {
    return unwrapOne<T>(r['data']);
  }
  if (typeof r['id'] === 'string' || typeof r['Id'] === 'string') return raw as T;
  for (const key of ['data', 'result', 'value']) {
    if (r[key] !== undefined) {
      const inner = unwrapOne<T>(r[key]);
      if (inner) return inner;
    }
  }
  return null;
}

function pickClaimId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const c = r.claimId ?? r.ClaimId;
  if (c == null || c === '') return undefined;
  const s = String(c).trim();
  if (!s || /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(s)) return undefined;
  return s;
}

function unwrapArray<T>(raw: unknown): T[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'value', 'list', 'records', 'content']) {
    if (Array.isArray(r[key])) return r[key] as T[];
  }
  // double-wrapped: { data: { data: [] } }
  if (r['data'] && typeof r['data'] === 'object' && !Array.isArray(r['data'])) {
    const nested = unwrapArray<T>(r['data']);
    if (nested.length > 0) return nested;
  }
  return [];
}

// ── Lookup tables ─────────────────────────────────────────────────────────────
// Aligned with backend enum: Created=1, Ongoing=2, Closed=3, Archived=4
// Values are i18n keys.
const STATUS_LABELS: Record<number, string> = {
  1: 'planDetailFront.statusAwaitingAssignment',
  2: 'status.ongoing',
  3: 'planDetail.validated',
  4: 'status.archived',
};

const getStatusLabel = (plan: ActionPlanDto): string => {
  if (plan.status === 2 && (plan.progress ?? 0) >= 100)
    return i18n.t('plansAdmin.statusPending');
  const key = STATUS_LABELS[plan.status];
  return key ? i18n.t(key) : i18n.t('planDetailFront.statusN', { n: plan.status });
};

const STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  2: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
  3: { bg: '#eff6ff', text: '#1d4ed8', border: '#93c5fd' },
  4: { bg: '#fdf2f8', text: '#9d174d', border: '#f9a8d4' },
};

/** i18n keys */
const TYPE_LABELS: Record<number, string> = {
  0: 'planView.typeCorrective', 1: 'planView.typePreventive', 2: 'planView.typeImprovement',
};
const TYPE_COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: '#fef2f2', text: '#dc2626' },
  1: { bg: '#eff6ff', text: '#1d4ed8' },
  2: { bg: '#f0fdf4', text: '#15803d' },
};
/** i18n keys */
const PRIORITY_LABELS: Record<number, string> = {
  0: 'planView.priorityLow', 1: 'planView.priorityHigh', 2: 'planView.priorityMedium', 3: 'planView.priorityLow',
};
const PRIORITY_COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: '#f0fdf4', text: '#15803d' },
  1: { bg: '#fef2f2', text: '#dc2626' },
  2: { bg: '#fefce8', text: '#a16207' },
  3: { bg: '#f0fdf4', text: '#15803d' },
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s?: string) => !!s && UUID_RE.test(s);
const labelOrId = (name?: string, id?: string) => {
  if (name && !isUuid(name)) return name;
  if (id) return id.slice(0, 8).toUpperCase();
  return '—';
};
const fmt = (d: string) =>
  new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

// ── Component ─────────────────────────────────────────────────────────────────
export default function FrontActionPlanDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [plan, setPlan]       = useState<ActionPlanDto | null>(null);
  const [actions, setActions] = useState<PlanActionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (id && accessToken) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [id, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    getUsersForAssignment(accessToken)
      .then((res: any) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        const map: Record<string, string> = {};
        list.forEach((u: any) => {
          const uid = String(u.id || u.Id || '');
          if (!uid) return;
          map[uid] =
            u.fullName ||
            u.FullName ||
            `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
            u.email ||
            uid;
        });
        setNameById(map);
      })
      .catch(() => undefined);
  }, [accessToken]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let planData: ActionPlanDto | null = null;
      let lastError = '';

      const planAttempts: Array<() => Promise<unknown>> = [
        () => getActionPlanById(accessToken!, id!),
        () => getAssignedActionPlanById(accessToken!, id!),
        async () => {
          const res = await getActionPlans(accessToken!);
          const list = unwrapArray<ActionPlanDto>(res);
          const found = list.find(p => p.id === id);
          if (!found) throw new Error('Not found in plans list');
          return found;
        },
        async () => {
          const res = await getArchivedActionPlans(accessToken!);
          const list = unwrapArray<ActionPlanDto>(res);
          const found = list.find(p => p.id === id);
          if (!found) throw new Error('Not found in archived list');
          return found;
        },
      ];

      for (const attempt of planAttempts) {
        try {
          const res = await attempt();
          const parsed = unwrapOne<ActionPlanDto>(res);
          if (parsed?.id) { planData = parsed; break; }
        } catch (e: any) {
          lastError = e?.response?.data?.message
            || e?.response?.data?.error
            || e?.message
            || t('planDetailFront.unknownError');
        }
      }

      if (!planData) {
        throw new Error(lastError || t('planDetailFront.notFoundOrDenied'));
      }
      const claimId = pickClaimId(planData);
      // the server sends the status by name ("Ongoing") to admins and by number to employees: read both
      const statusNumber = { created: 1, ongoing: 2, closed: 3, archived: 4 }[toUiStatus((planData as any).status ?? (planData as any).Status)];
      setPlan({
        ...planData,
        id: String((planData as any).id ?? (planData as any).Id ?? id),
        claimId,
        status: statusNumber as any,
        progress: statusNumber === 3 || statusNumber === 4 ? 100 : planData.progress,
      });

      try {
        const res = await getPlanActions(accessToken!, id!);
        const list = unwrapArray<PlanActionDto>((res as any)?.data ?? res);
        setActions(list.map((a: any) => ({
          ...a,
          id: String(a.id || a.Id),
          title: a.title || a.Title || '',
          description: a.description || a.Description,
          deadline: a.deadline || a.Deadline,
          priority: typeof a.priority === 'number' ? a.priority : Number(a.Priority ?? 2),
          // the progress of an action arrives by name ("Hundred", "Fifty"): 0-100
          progress: parseProgress(a.progress ?? a.Progress),
          assignedToId: a.assignedToId || a.AssignedToId,
          assignedToName: a.assignedToName || a.AssignedToName,
          status: { created: 1, ongoing: 2, closed: 3, archived: 4 }[toUiStatus(a.status ?? a.Status)],
          documentCount: Number(a.documentCount ?? a.DocumentCount ?? 0),
        })));
      } catch {
        setActions([]);
      }

    } catch (err: any) {
      setError(err.message || t('planDetailFront.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const completedActions = actions.filter(a => a.progress === 100 || a.status === 3).length;
  const computedProgress = actions.length > 0
    ? Math.round(actions.reduce((s, a) => s + (a.progress ?? 0), 0) / actions.length)
    : null;
  const displayProgress  = computedProgress ?? plan?.progress ?? 0;

  if (loading) return (
    <div style={{ padding: '100px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
      {t('planDetailFront.loading')}
    </div>
  );

  if (error || !plan) return (
    <div style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <h3 style={{ color: '#64748b', marginBottom: 8, fontSize: 18, fontWeight: 700 }}>
        {t('planDetailFront.notFound')}
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 14, maxWidth: 400, margin: '0 auto 24px', lineHeight: 1.6 }}>
        {error || t('planDetailFront.notFoundHelp')}
      </p>
      <button
        onClick={() => navigate('/pages/front/action-plans')}
        style={{
          padding: '12px 24px', background: '#000168', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {t('planDetailFront.backToPlans')}
      </button>
    </div>
  );

  const statusLabel = getStatusLabel(plan);
  const statusColor = STATUS_COLORS[plan.status] ?? STATUS_COLORS[1];
  const typeColor   = TYPE_COLORS[plan.type]     ?? TYPE_COLORS[0];
  const isArchived  = plan.status === 4;
  const isClosed    = plan.status === 3;
  const sla = computeIatfSla(plan.createdAt, { progress: displayProgress, status: isClosed ? 'closed' : undefined });
  const slaStyle = slaToneStyles(sla.tone);
  const proofTotal = (plan.proofCount ?? 0) || actions.reduce((s, a) => s + (a.documentCount ?? 0), 0);

  const onUploadProof = async (actionId: string, file: File | null) => {
    if (!file || !accessToken) return;
    setUploadingId(actionId);
    try {
      await uploadPlanActionDocument(accessToken, actionId, file);
      await loadData();
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.error || t('planDetailFront.uploadFailed'));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="front-ap-detail">
      <style>{`
        .front-ap-detail { animation: fadeIn 0.35s ease; font-family: 'Inter', sans-serif; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }

        .cofi-apd-wrap { max-width: 1100px; margin: 0 auto; padding: 32px; }

        .cofi-apd-back {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 18px; background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 10px; font-size: 13px; font-weight: 600; color: #64748b;
          cursor: pointer; margin-bottom: 28px; transition: all .18s; font-family: inherit;
        }
        .cofi-apd-back:hover { background: #f1f5f9; color: #0f172a; border-color: #cbd5e1; }

        .cofi-apd-archived-banner {
          display: flex; align-items: center; gap: 12px;
          background: #fdf2f8; border: 1px solid #f9a8d4; border-radius: 12px;
          padding: 14px 20px; margin-bottom: 20px;
          font-size: 13px; font-weight: 600; color: #9d174d;
        }

        .cofi-apd-closed-banner {
          display: flex; align-items: center; gap: 12px;
          background: #eff6ff; border: 1px solid #93c5fd; border-radius: 12px;
          padding: 14px 20px; margin-bottom: 20px;
          font-size: 13px; font-weight: 600; color: #1d4ed8;
        }

        .cofi-apd-header {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 20px;
          padding: 36px 40px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,.04);
        }
        .cofi-apd-header.archived { border-color: #f9a8d4; background: #fdf9fc; }
        .cofi-apd-header.closed { border-color: #93c5fd; background: #f8faff; }

        .cofi-apd-badges { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .cofi-apd-badge {
          padding: 5px 14px; border-radius: 100px;
          font-size: 11px; font-weight: 700; letter-spacing: .5px; border: 1px solid transparent;
        }
        .cofi-apd-title {
          font-size: 30px; font-weight: 800; color: #0f172a;
          margin-bottom: 12px; line-height: 1.25; letter-spacing: -.4px;
        }
        .cofi-apd-title.archived { color: #9d174d; }
        .cofi-apd-title.closed { color: #1d4ed8; }
        .cofi-apd-desc {
          font-size: 15px; color: #64748b; line-height: 1.7;
          margin-bottom: 24px; max-width: 680px;
        }
        .cofi-apd-dossier-cta {
          display: inline-flex; align-items: center; gap: 8px;
          margin: 0 0 20px; padding: 11px 18px; border-radius: 10px;
          background: #000168; color: #fff !important; font-size: 13px; font-weight: 700;
          text-decoration: none; border: none; box-shadow: 0 2px 8px rgba(0,1,104,.2);
        }
        .cofi-apd-dossier-cta:hover { background: #00009e; color: #fff !important; }
        .cofi-apd-dossier-btn {
          font-size: 11px; font-weight: 700; padding: 6px 10px; border-radius: 8px;
          background: #eef2ff; color: #000168; text-decoration: none; border: 1px solid #c7d2fe;
        }
        .cofi-apd-dossier-badge {
          background: #eef2ff !important; color: #000168 !important; border-color: #c7d2fe !important;
          text-decoration: none; cursor: pointer;
        }
        .cofi-apd-meta {
          display: flex; flex-wrap: wrap; gap: 20px;
          padding-top: 20px; border-top: 1px solid #f1f5f9;
        }
        .cofi-apd-meta-item {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #475569; font-weight: 500;
        }
        .cofi-apd-meta-item svg { color: #94a3b8; flex-shrink: 0; }

        .cofi-apd-progress {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 20px;
          padding: 28px 32px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,.04);
        }
        .cofi-apd-progress-header {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;
        }
        .cofi-apd-progress-header h3 {
          font-size: 16px; font-weight: 700; color: #0f172a;
          display: flex; align-items: center; gap: 10px; margin: 0;
        }
        .cofi-apd-progress-val { font-size: 32px; font-weight: 800; color: #000168; }
        .cofi-apd-progress-track { background: #f1f5f9; border-radius: 8px; height: 10px; overflow: hidden; }
        .cofi-apd-progress-fill {
          height: 100%; border-radius: 8px; transition: width .6s ease;
          background: linear-gradient(90deg, #000168, #3b4abb);
        }
        .cofi-apd-progress-fill.archived { background: linear-gradient(90deg, #9d174d, #db2777); }
        .cofi-apd-progress-fill.closed { background: linear-gradient(90deg, #1d4ed8, #60a5fa); }
        .cofi-apd-progress-stats {
          display: flex; gap: 28px; margin-top: 18px;
          padding-top: 18px; border-top: 1px solid #f1f5f9; flex-wrap: wrap;
        }
        .cofi-apd-progress-stat {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #64748b; font-weight: 500;
        }

        .cofi-apd-actions {
          background: #fff; border: 1px solid #e2e8f0; border-radius: 20px;
          padding: 28px 32px; box-shadow: 0 4px 20px rgba(0,0,0,.04);
        }
        .cofi-apd-actions-head {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
        }
        .cofi-apd-actions-head h3 {
          font-size: 16px; font-weight: 700; color: #0f172a;
          display: flex; align-items: center; gap: 10px; margin: 0;
        }
        .cofi-apd-count-pill {
          background: #f1f5f9; color: #64748b; border-radius: 20px;
          padding: 4px 12px; font-size: 12px; font-weight: 700;
        }
        .cofi-apd-no-actions {
          text-align: center; padding: 48px; color: #94a3b8;
          font-size: 13px; background: #f8fafc; border-radius: 14px;
          border: 1.5px dashed #e2e8f0;
        }
        .cofi-apd-no-actions p { margin: 8px 0 0; }

        .cofi-apd-action-card {
          padding: 20px 24px; border: 1.5px solid #f1f5f9;
          border-radius: 14px; margin-bottom: 12px; transition: all .18s;
        }
        .cofi-apd-action-card:hover { border-color: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,.05); }
        .cofi-apd-action-card:last-child { margin-bottom: 0; }
        .cofi-apd-action-card.done { border-color: #bbf7d0; background: #f0fdf4; }

        .cofi-apd-action-top {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
        }
        .cofi-apd-action-name { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
        .cofi-apd-action-card.done .cofi-apd-action-name { color: #15803d; }
        .cofi-apd-action-desc-text { font-size: 13px; color: #64748b; line-height: 1.5; }
        .cofi-apd-priority-pill {
          padding: 4px 12px; border-radius: 100px;
          font-size: 10px; font-weight: 700; letter-spacing: .5px; white-space: nowrap; flex-shrink: 0;
        }
        .cofi-apd-action-foot {
          display: flex; align-items: center; gap: 16px;
          margin-top: 14px; padding-top: 14px; border-top: 1px solid #f1f5f9; flex-wrap: wrap;
        }
        .cofi-apd-action-foot-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; color: #94a3b8; font-weight: 500;
        }
        .cofi-apd-action-prog { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .cofi-apd-action-prog-track {
          width: 90px; height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden;
        }
        .cofi-apd-action-prog-fill {
          height: 100%; background: #000168; border-radius: 4px; transition: width .4s;
        }
        .cofi-apd-action-card.done .cofi-apd-action-prog-fill { background: #16a34a; }
        .cofi-apd-action-prog-label {
          font-size: 12px; font-weight: 700; color: #000168; min-width: 34px; text-align: right;
        }
        .cofi-apd-action-card.done .cofi-apd-action-prog-label { color: #15803d; }

        @media (max-width: 768px) {
          .cofi-apd-wrap { padding: 16px; }
          .cofi-apd-header { padding: 24px; }
          .cofi-apd-title { font-size: 22px; }
          .cofi-apd-progress, .cofi-apd-actions { padding: 20px; }
          .cofi-apd-progress-stats { flex-direction: column; gap: 10px; }
          .cofi-apd-action-prog { margin-left: 0; width: 100%; }
        }
      `}</style>

      <div className="cofi-apd-wrap">
        <button className="cofi-apd-back" onClick={() => navigate('/pages/front/action-plans')}>
          <ArrowLeft size={15} /> {t('planDetailFront.backToPlans')}
        </button>

        {isArchived && (
          <div className="cofi-apd-archived-banner">
            🗄️ {t('planDetailFront.archivedBanner')}
          </div>
        )}

        {isClosed && (
          <div className="cofi-apd-closed-banner">
            ⏳ {t('planDetailFront.closedBanner')}
          </div>
        )}

        {plan.lastRejectComment && !isClosed && (
          <div className="cofi-apd-archived-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#b45309' }}>
            {t('planDetailFront.returned')} : {plan.lastRejectComment}
          </div>
        )}

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
            background: slaStyle.bg, color: slaStyle.color, border: `1px solid ${slaStyle.border}`,
          }}>
            SLA {sla.label} · {sla.message}
            {sla.dueDate ? ` · ${t('planDetailFront.due')} ${fmt(sla.dueDate.toISOString())}` : ''}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
            background: proofTotal > 0 ? '#ecfdf5' : '#fef2f2',
            color: proofTotal > 0 ? '#047857' : '#b91c1c',
            border: `1px solid ${proofTotal > 0 ? '#a7f3d0' : '#fecaca'}`,
          }}>
            {t('planDetailFront.iatfProofs')} : {proofTotal}
          </span>
          {plan.claimId && (
            <Link
              to={`/pages/front/quality-analyses/8d/${encodeURIComponent(String(plan.claimId))}`}
              className="cofi-apd-dossier-btn"
            >
              {t('planDetailFront.viewQualityFile')}
            </Link>
          )}
        </div>

        {/* ── Header ── */}
        <div className={`cofi-apd-header${isArchived ? ' archived' : ''}${isClosed ? ' closed' : ''}`}>
          <div className="cofi-apd-badges">
            <span className="cofi-apd-badge"
              style={{ background: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
              {statusLabel}
            </span>
            <span className="cofi-apd-badge"
              style={{ background: typeColor.bg, color: typeColor.text }}>
              {TYPE_LABELS[plan.type] ? t(TYPE_LABELS[plan.type]) : `Type ${plan.type}`}
            </span>
            {plan.claimId && (
              <Link
                to={`/pages/front/quality-analyses/8d/${encodeURIComponent(String(plan.claimId))}`}
                className="cofi-apd-badge cofi-apd-dossier-badge"
              >
                {t('planDetailFront.linkedFile')} →
              </Link>
            )}
          </div>

          <h1 className={`cofi-apd-title${isArchived ? ' archived' : ''}${isClosed ? ' closed' : ''}`}>{plan.title}</h1>
          <p className="cofi-apd-desc">{plan.description?.trim() || t('planDetailFront.noDescription')}</p>

          {plan.claimId && (
            <Link
              to={`/pages/front/quality-analyses/8d/${encodeURIComponent(String(plan.claimId))}`}
              className="cofi-apd-dossier-cta"
            >
              {t('planDetailFront.openEightD')}
            </Link>
          )}

          <div className="cofi-apd-meta">
            <div className="cofi-apd-meta-item"><Tag size={15} />{plan.id.slice(0, 8).toUpperCase()}</div>
            <div className="cofi-apd-meta-item">
              <Building2 size={15} />{labelOrId(plan.departmentName, plan.departmentId)}
            </div>
            <div className="cofi-apd-meta-item">
              <Calendar size={15} />{t('planDetailFront.createdOn')} {fmt(plan.createdAt)}
            </div>
            {plan.deadline && (
              <div
                className="cofi-apd-meta-item"
                style={
                  !isArchived && !isClosed && new Date(plan.deadline).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)
                    ? { color: '#b91c1c', fontWeight: 700 }
                    : undefined
                }
              >
                <Clock size={15} />
                {t('dashboard.colDeadline')} : {fmt(plan.deadline)}
                {!isArchived && !isClosed && new Date(plan.deadline).setHours(0,0,0,0) < new Date().setHours(0,0,0,0)
                  ? ` · ${t('planDetailFront.lateLower')}`
                  : ''}
              </div>
            )}
            <div className="cofi-apd-meta-item">
              <User size={15} />{labelOrId(plan.createdByName ?? plan.ownerName, plan.ownerId)}
            </div>
          </div>
        </div>

        {/* ── Progress ── */}
        <div className="cofi-apd-progress">
          <div className="cofi-apd-progress-header">
            <h3><TrendingUp size={18} /> {t('planDetail.globalProgress')}</h3>
            <span className="cofi-apd-progress-val">{displayProgress}%</span>
          </div>
          <div className="cofi-apd-progress-track">
            <div
              className={`cofi-apd-progress-fill${isArchived ? ' archived' : ''}${isClosed ? ' closed' : ''}`}
              style={{ width: `${displayProgress}%` }}
            />
          </div>
          <div className="cofi-apd-progress-stats">
            <div className="cofi-apd-progress-stat">
              <CheckCircle2 size={16} color="#16a34a" />
              {t('planDetailFront.actionsDone', { count: completedActions })}
            </div>
            <div className="cofi-apd-progress-stat">
              <AlertCircle size={16} color="#94a3b8" />
              {t('planDetailFront.actionsTotal', { count: actions.length })}
            </div>
            <div className="cofi-apd-progress-stat">
              <Clock size={16} color="#94a3b8" />
              {statusLabel}
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="cofi-apd-actions">
          <div className="cofi-apd-actions-head">
            <h3><CheckCircle2 size={18} /> {t('planDetailFront.planActions')}</h3>
            {actions.length > 0 && (
              <span className="cofi-apd-count-pill">
                {completedActions}/{actions.length} {t('planDetailFront.doneShort', { count: completedActions })}
              </span>
            )}
          </div>

          {actions.length === 0 ? (
            <div className="cofi-apd-no-actions">
              <CheckCircle2 size={36} color="#cbd5e1" />
              <p>{isArchived
                ? t('planDetailFront.noActionsArchived')
                : t('planDetailFront.noActions')}
              </p>
            </div>
          ) : (
            actions.map(action => {
              const pColor  = PRIORITY_COLORS[action.priority] ?? PRIORITY_COLORS[0];
              const progress = action.progress ?? 0;
              const isDone  = progress >= 100 || action.status === 3;
              const due = action.deadline ? new Date(action.deadline) : null;
              if (due) due.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isLate = !isDone && !!due && due.getTime() < today.getTime();
              return (
                <div
                  key={action.id}
                  className={`cofi-apd-action-card${isDone ? ' done' : ''}`}
                  style={isLate ? { borderColor: '#fecaca', background: '#fff5f5', borderLeft: '4px solid #dc2626' } : undefined}
                >
                  <div className="cofi-apd-action-top">
                    <div>
                      <div
                        className="cofi-apd-action-name"
                        style={isLate ? { color: '#b91c1c' } : undefined}
                      >
                        {isDone ? '✓ ' : ''}{action.title}
                        {isLate ? ` · ${t('planDetail.late')}` : ''}
                      </div>
                      {action.description?.trim() && (
                        <div className="cofi-apd-action-desc-text">{action.description}</div>
                      )}
                    </div>
                    <span className="cofi-apd-priority-pill"
                      style={{ background: pColor.bg, color: pColor.text }}>
                      {PRIORITY_LABELS[action.priority] ? t(PRIORITY_LABELS[action.priority]) : `P${action.priority}`}
                    </span>
                  </div>
                  <div className="cofi-apd-action-foot">
                    <div className="cofi-apd-action-foot-item">
                      <User size={13} />
                      {labelOrId(action.assignedToName, action.assignedToId) || t('claimDetail.unassigned')}
                    </div>
                    <div
                      className="cofi-apd-action-foot-item"
                      style={isLate ? { color: '#b91c1c', fontWeight: 700 } : undefined}
                    >
                      <Calendar size={13} />
                      {action.deadline ? fmt(action.deadline) : t('planDetailFront.noDeadline')}
                    </div>
                    <div className="cofi-apd-action-prog">
                      <div className="cofi-apd-action-prog-track">
                        <div className="cofi-apd-action-prog-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="cofi-apd-action-prog-label">{progress}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHistoryActionId(action.id)}
                      title={t('planDetailFront.assignmentHistory')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 700, color: '#334155',
                        border: '1px solid #e2e8f0', borderRadius: 8,
                        padding: '5px 10px', background: '#fff', cursor: 'pointer',
                      }}
                    >
                      <History size={12} /> {t('planView.tabHistory')}
                    </button>
                  </div>
                  {!isArchived && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                        {t('validationHub.proofs')} : {action.documentCount ?? 0}
                      </span>
                      <label style={{
                        fontSize: 11, fontWeight: 700, color: '#000168', cursor: 'pointer',
                        border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', background: '#fff',
                      }}>
                        {uploadingId === action.id ? t('fiveWhy.sending') : t('planDetail.attachProof')}
                        <input
                          type="file"
                          hidden
                          disabled={uploadingId === action.id}
                          onChange={(e) => void onUploadProof(action.id, e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {historyActionId && accessToken && (
        <PlanActionHistoryModal
          token={accessToken}
          planActionId={historyActionId}
          actionTitle={actions.find((a) => a.id === historyActionId)?.title}
          nameById={nameById}
          onClose={() => setHistoryActionId(null)}
          initialTab="assignments"
        />
      )}
    </div>
  );
}