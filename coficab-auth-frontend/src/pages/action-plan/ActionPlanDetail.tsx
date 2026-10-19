import React, { useEffect, useState } from 'react';
import { parseProgress, toUiStatus, toUiType, type UiStatus, type UiType } from '../admin/capaAnalytics';
import { Link, useLocation, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getActionPlanById,
  getPlanActions,
  getDepartmentById,
} from '../../services/actionPlanService';
import { PlanActionHistoryModal } from '../../components/PlanActionHistoryModal';
import { AUTH_API_URL } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n';
// ── Inline Icons ──
const IconArrowLeft = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>;
const IconCheck = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconFile = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconHistory = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconAlert = () => <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
const IconCircle = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>;
const IconCircleCheck = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconCircleActive = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const IconLock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
const IconClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

// ── Types ──
interface ActionPlanDto {
  id: string;
  title: string;
  description?: string;
  /** preventif | correctif | amelioration (the server sends PA / PAC / PAP) */
  type: UiType;
  /** 1 created, 2 ongoing, 3 closed, 4 archived (the server sends the names) */
  status: number;
  ownerId: string;
  departmentId: string;
  createdAt: string;
  updatedAt?: string;
  departmentName?: string;
  createdByName?: string;
  createdBy?: string;
  completedAt?: string;
  claimId?: string | null;
}

interface PlanActionDto {
  id: string;
  title: string;
  description?: string;
  progress: number;
  deadline: string;
  priority: number;
  assignedToId: string;
  actionPlanId: string;
}

const STATUS_MAP: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'planView.statusCreated', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  2: { label: 'planView.statusOngoing', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  3: { label: 'planView.statusDone', color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  4: { label: 'planView.statusArchived', color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
};

const PRIORITY_MAP: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'planView.priorityHigh', color: '#dc2626', bg: '#fef2f2' },
  2: { label: 'planView.priorityMedium', color: '#f59e0b', bg: '#fef3c7' },
  3: { label: 'planView.priorityLow', color: '#16a34a', bg: '#f0fdf4' },
};

const TYPE_MAP: Record<UiType, string> = {
  correctif: 'planView.typeCorrective',
  preventif: 'planView.typePreventive',
  amelioration: 'planView.typeImprovement',
};

const STATUS_NUMBER: Record<UiStatus, number> = { created: 1, ongoing: 2, closed: 3, archived: 4 };

const WORKFLOW_STEPS = [
  { key: 'detection', label: 'planView.wfDetection' },
  { key: 'analyse', label: 'planView.wfAnalysis' },
  { key: 'planification', label: 'planView.wfPlanning' },
  { key: 'execution', label: 'planView.wfExecution' },
  { key: 'verification', label: 'planView.wfVerification' },
  { key: 'cloture', label: 'planView.wfClosure' },
];

export default function ActionPlanDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Same page serves /admin/action-plans/:id and /action-plans/:id; links stay in the current area.
  const inAdmin = useLocation().pathname.startsWith('/admin');
  const { accessToken } = useAuth();

  const [plan, setPlan] = useState<ActionPlanDto | null>(null);
  const [actions, setActions] = useState<PlanActionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'actions' | 'history'>('overview');
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken) return;
    loadPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [id, accessToken]);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const planRes = await getActionPlanById(accessToken!, id!);
      const planData = planRes.data?.data ?? planRes.data;
      // the server sends the status and the type by name ("Ongoing", "PA"): read them whatever the form
      planData.status = STATUS_NUMBER[toUiStatus(planData.status)];
      planData.type = toUiType(planData.type);

      if (planData.departmentId) {
        try {
          const depRes = await getDepartmentById(accessToken!, planData.departmentId);
          const depData = depRes.data?.data ?? depRes.data;
          planData.departmentName = depData?.name;
        } catch (depErr) {
          console.warn("Impossible de charger les détails du département:", depErr);
        }
      }

      if (planData.createdBy && !planData.createdByName) {
        try {
          const response = await fetch(`${AUTH_API_URL}/api/users/${planData.createdBy}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (response.ok) {
            const userData = await response.json();
            const user = userData.data ?? userData;
            planData.createdByName = user.fullName || user.userName || `${user.firstName} ${user.lastName}`;
          } else {
            planData.createdByName = t('planView.userFallback', { id: planData.createdBy.substring(0, 8) });
          }
        } catch (userErr) {
          planData.createdByName = t('planView.userFallback', { id: planData.createdBy.substring(0, 8) });
        }
      }

      setPlan(planData);

      const actionsRes = await getPlanActions(accessToken!, id!);
      const actionsData = actionsRes.data?.data ?? actionsRes.data ?? [];
      // the progress of an action also arrives by name ("Hundred", "Validated"): 0-100 for the bars
      setActions(Array.isArray(actionsData) ? actionsData.map((a: PlanActionDto) => ({ ...a, progress: parseProgress(a.progress) })) : []);
    } catch (err: any) {
      console.error('Load error:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (deadline: string) => {
    return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

  const getWorkflowPhase = (status: number) => {
    const map: Record<number, number> = { 1: 0, 2: 2, 3: 5, 4: 5 };
    return map[status] ?? 0;
  };

  if (loading) return (
    <div className="apd-loading">
      <div className="apd-spinner" />
      <p>{t('planView.loading')}</p>
    </div>
  );

  if (error) return (
    <div className="apd-error">
      <IconAlert />
      <h2>{error}</h2>
      <button onClick={() => navigate(inAdmin ? '/admin/action-plans' : '/action-plans')}>{t('planView.backToPlans')}</button>
    </div>
  );

  if (!plan) return null;

  const currentPhase = getWorkflowPhase(plan.status);
  const isClosed = plan.status === 3 || plan.status === 4;
  const isCompleted = plan.status === 3;

  // Extraction de la date de fin exacte (completedAt ou updatedAt comme fallback de sécurité)
  const exactCompletionDate = plan.completedAt || plan.updatedAt;

  const completedActions = actions.filter(a => (a.progress ?? 0) >= 100).length;
  const inProgressActions = actions.filter(a => (a.progress ?? 0) > 0 && (a.progress ?? 0) < 100).length;
  const notStartedActions = actions.filter(a => (a.progress ?? 0) === 0).length;
  const globalProgress = actions.length > 0
    ? Math.round(actions.reduce((sum, a) => sum + (a.progress ?? 0), 0) / actions.length)
    : 0;

  const upcomingDeadlines = [...actions]
    .filter(a => (a.progress ?? 0) < 100)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);

  const status = STATUS_MAP[plan.status] || STATUS_MAP[1];

  return (
    <>
      <style>{`

        :root {
          --navy: #000168; --navy-mid: #00009e; --navy-light: #eef2ff;
          --accent: #0066cc; --white: #ffffff; --bg: #f4f6fb;
          --border: #e4e8f2; --border2: #f0f2f8; --text: #0d1340;
          --text2: #374151; --muted: #64748b; --subtle: #94a3b8;
          --font-head: Inter, sans-serif; --font-body: 'Inter', sans-serif;
        }

        .apd-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--muted); min-height: 100dvh; font-family: var(--font-body); }
        .apd-spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--navy); border-radius: 50%; animation: apd-spin 1s linear infinite; }
        @keyframes apd-spin { to { transform: rotate(360deg); } }

        .apd-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 100dvh; color: #b91c1c; font-family: var(--font-body); padding: 40px; text-align: center; }
        .apd-error h2 { font-size: 18px; font-weight: 600; margin: 0; }
        .apd-error button { padding: 10px 20px; border-radius: 8px; border: none; background: var(--navy); color: #fff; font-weight: 600; cursor: pointer; font-family: var(--font-head); }

        .apd-page { padding: 24px; font-family: var(--font-body); max-width: 1200px; margin: 0 auto; }

        .apd-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .apd-header-left { display: flex; flex-direction: column; gap: 8px; }
        .apd-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--white); color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: var(--font-body); margin-bottom: 4px; }
        .apd-back:hover { color: var(--navy); border-color: #93c5fd; background: var(--navy-light); }
        .apd-claim-link { display: inline-block; margin-top: 4px; font-size: 13px; font-weight: 600; color: #1d4ed8; text-decoration: none; }
        .apd-claim-link:hover { text-decoration: underline; }
        .apd-title { font-family: var(--font-head); font-size: 22px; font-weight: 700; color: var(--navy); margin: 0; line-height: 1.2; }
        .apd-status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: -0.01em; text-transform: none; width: fit-content; }
        .apd-status-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; }

        .apd-summary { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .apd-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .apd-summary-item { display: flex; flex-direction: column; gap: 4px; }
        .apd-summary-item.full-width { grid-column: 1 / -1; }
        .apd-summary-label { font-size: 10px; font-weight: 700; letter-spacing: -0.01em; text-transform: none; color: var(--subtle); }
        .apd-summary-value { font-size: 13px; font-weight: 600; color: var(--text); }
        .apd-summary-value.completed { color: #15803d; }
        .apd-summary-desc { font-size: 13px; color: var(--text2); line-height: 1.6; }

        .apd-progress-card { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .apd-progress-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .apd-progress-card-header h3 { font-family: var(--font-head); font-size: 14px; font-weight: 700; color: var(--navy); margin: 0; }
        .apd-progress-pct { font-family: var(--font-head); font-size: 24px; font-weight: 700; color: var(--navy); }
        .apd-progress-bar { height: 8px; background: var(--border2); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
        .apd-progress-fill { height: 100%; border-radius: 4px; background: var(--navy); transition: width .4s ease; }
        .apd-progress-stats { display: flex; gap: 24px; }
        .apd-stat { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
        .apd-stat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .apd-stat-dot.done { background: #16a34a; }
        .apd-stat-dot.progress { background: #1d4ed8; }
        .apd-stat-dot.todo { background: var(--subtle); }

        .apd-workflow { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .apd-workflow h3 { font-family: var(--font-head); font-size: 14px; font-weight: 700; color: var(--navy); margin: 0 0 20px 0; }
        .apd-wf-steps { display: flex; align-items: center; justify-content: space-between; }
        .apd-wf-step { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; }
        .apd-wf-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all .3s; }
        .apd-wf-step.completed .apd-wf-icon { background: #f0fdf4; color: #16a34a; border: 2px solid #16a34a; }
        .apd-wf-step.active .apd-wf-icon { background: var(--navy-light); color: var(--navy); border: 2px solid var(--navy); box-shadow: 0 0 0 4px rgba(0,1,104,0.1); }
        .apd-wf-step.pending .apd-wf-icon { background: var(--bg); color: var(--subtle); border: 2px solid var(--border); }
        .apd-wf-label { font-size: 10px; font-weight: 600; color: var(--muted); text-align: center; white-space: nowrap; }
        .apd-wf-step.completed .apd-wf-label { color: #16a34a; }
        .apd-wf-step.active .apd-wf-label { color: var(--navy); font-weight: 700; }
        .apd-wf-connector { flex: 1; height: 2px; background: var(--border2); margin: 0 4px; margin-bottom: 24px; transition: background .3s; }
        .apd-wf-connector.done { background: #16a34a; }

        .apd-tabs { display: flex; gap: 4px; background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 4px; width: fit-content; margin-bottom: 20px; }
        .apd-tab { padding: 8px 18px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; font-family: var(--font-body); display: inline-flex; align-items: center; gap: 6px; }
        .apd-tab:hover { color: var(--navy); }
        .apd-tab.active { background: var(--navy); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

        .apd-panel { animation: apd-fade-in .3s ease; }
        @keyframes apd-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .apd-overview-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .apd-card { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
        .apd-card h4 { font-family: var(--font-head); font-size: 13px; font-weight: 700; color: var(--navy); margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px; }
        .apd-info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border2); font-size: 12px; }
        .apd-info-row:last-child { border-bottom: none; }
        .apd-info-row span:first-child { color: var(--muted); font-weight: 500; }
        .apd-info-row span:last-child { color: var(--text); font-weight: 600; }
        .apd-info-row span:last-child.completed { color: #15803d; }

        .apd-dl-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border2); }
        .apd-dl-item:last-child { border-bottom: none; }
        .apd-dl-urgency { width: 40px; height: 40px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
        .apd-dl-urgency span { font-size: 8px; font-weight: 600; text-transform: none; letter-spacing: -0.01em; }
        .apd-dl-info { flex: 1; min-width: 0; }
        .apd-dl-title { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .apd-dl-date { font-size: 10px; color: var(--subtle); margin-top: 2px; }
        .apd-dl-pill { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; flex-shrink: 0; }

        .apd-table { width: 100%; border-collapse: collapse; }
        .apd-table thead th { padding: 12px 16px; text-align: left; font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; text-transform: none; color: var(--muted); background: #f8f9fc; border-bottom: 1px solid var(--border2); }
        .apd-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--border2); font-size: 12px; color: var(--text2); vertical-align: middle; }
        .apd-table tbody tr:last-child td { border-bottom: none; }
        .apd-table tbody tr:hover td { background: #fafbff; }
        .apd-act-title { font-weight: 600; color: var(--text); display: block; }
        .apd-act-sub { font-size: 11px; color: var(--subtle); display: block; margin-top: 2px; }
        .apd-priority-pill { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .apd-progress-pill { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .apd-progress-pill.done { background: #f0fdf4; color: #15803d; }
        .apd-progress-pill.in-progress { background: #dbeafe; color: #1d4ed8; }
        .apd-progress-pill.todo { background: #f1f5f9; color: #64748b; }
        .apd-history-btn {
          border: 1px solid var(--border);
          background: #fff;
          color: var(--navy);
          font-size: 11px;
          font-weight: 700;
          padding: 5px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-family: var(--font-body);
        }
        .apd-history-btn:hover { background: var(--navy-light); }

        .apd-timeline { position: relative; padding-left: 24px; }
        .apd-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--border); }
        .apd-tl-item { position: relative; padding-bottom: 20px; }
        .apd-tl-dot { position: absolute; left: -24px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--white); border: 2px solid var(--navy); }
        .apd-tl-dot.completed { border-color: #16a34a; background: #f0fdf4; }
        .apd-tl-content { display: flex; flex-direction: column; gap: 2px; }
        .apd-tl-title { font-size: 12px; font-weight: 600; color: var(--text); }
        .apd-tl-meta { font-size: 11px; color: var(--subtle); }

        .apd-notice { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #fefce8; border: 1px solid #fde047; border-radius: 10px; margin-bottom: 20px; font-size: 12px; color: #854d0e; }
        .apd-notice svg { flex-shrink: 0; }

        .apd-empty { padding: 40px; text-align: center; color: var(--muted); font-size: 13px; }
        .apd-empty svg { display: block; margin: 0 auto 8px; opacity: .4; }
      `}</style>

      <div className="apd-page">
        {/* ── HEADER ── */}
        <div className="apd-header">
          <div className="apd-header-left">
            <button className="apd-back" onClick={() => navigate(-1)}>
              <IconArrowLeft /> {t('planView.back')}
            </button>
            <span
              className="apd-status-pill"
              style={{
                background: status.bg,
                color: status.color,
                border: `1px solid ${status.border}`,
              }}
            >
              {t(status.label)}
            </span>
            <h1 className="apd-title">{plan.title}</h1>
            {plan.claimId && (
              <Link
                className="apd-claim-link"
                to={inAdmin
                  ? `/admin/claims/eight-d/${encodeURIComponent(plan.claimId)}`
                  : `/pages/front/quality-analyses/8d/${encodeURIComponent(plan.claimId)}`}
              >
                {t('planView.originClaim')}
              </Link>
            )}
          </div>
        </div>

        {/* ── USER NOTICE (employee view only; admins see the full plan) ── */}
        {!inAdmin && (
          <div className="apd-notice">
            <IconLock />
            <span>{t('planView.limitedView')}</span>
          </div>
        )}

        {/* ── SUMMARY CARD ── */}
        <div className="apd-summary">
          <div className="apd-summary-grid">
            <div className="apd-summary-item">
              <span className="apd-summary-label">{t('planView.type')}</span>
              <span className="apd-summary-value">{t(TYPE_MAP[plan.type])}</span>
            </div>
            <div className="apd-summary-item">
              <span className="apd-summary-label">{t('planView.department')}</span>
              <span className="apd-summary-value">{plan.departmentName || '—'}</span>
            </div>
            <div className="apd-summary-item">
              <span className="apd-summary-label">{t('planView.assignedBy')}</span>
              <span className="apd-summary-value">{plan.createdByName || plan.createdBy || '—'}</span>
            </div>
            <div className="apd-summary-item">
              <span className="apd-summary-label">{t('planView.createdOn')}</span>
              <span className="apd-summary-value">{fmtDate(plan.createdAt)}</span>
            </div>
            
            {/* 🎯 Extraction dynamique de la date exacte depuis l'API payload */}
            {isCompleted && exactCompletionDate && (
              <div className="apd-summary-item">
                <span className="apd-summary-label">{t('planView.completedOn')}</span>
                <span className="apd-summary-value completed">
                  {fmtDate(exactCompletionDate)}
                </span>
              </div>
            )}

            <div className="apd-summary-item full-width">
              <span className="apd-summary-label">{t('planView.description')}</span>
              <span className="apd-summary-desc">{plan.description || t('planView.noDescription')}</span>
            </div>
          </div>
        </div>

        {/* ── PROGRESS ── */}
        <div className="apd-progress-card">
          <div className="apd-progress-card-header">
            <h3>{t('planView.globalProgress')}</h3>
            <span className="apd-progress-pct">{globalProgress}%</span>
          </div>
          <div className="apd-progress-bar">
            <div className="apd-progress-fill" style={{ width: `${globalProgress}%` }} />
          </div>
          <div className="apd-progress-stats">
            <div className="apd-stat">
              <span className="apd-stat-dot done" />
              {t('planView.doneCount', { count: completedActions })}
            </div>
            <div className="apd-stat">
              <span className="apd-stat-dot progress" />
              {t('planView.ongoingCount', { count: inProgressActions })}
            </div>
            <div className="apd-stat">
              <span className="apd-stat-dot todo" />
              {t('planView.todoCount', { count: notStartedActions })}
            </div>
          </div>
        </div>

        {/* ── WORKFLOW ── */}
        <div className="apd-workflow">
          <h3>{t('planView.workflow')}</h3>
          <div className="apd-wf-steps">
            {WORKFLOW_STEPS.map((step, i) => {
              let state: 'pending' | 'active' | 'completed' = 'pending';
              if (isClosed) state = 'completed';
              else if (i < currentPhase) state = 'completed';
              else if (i === currentPhase) state = 'active';

              return (
                <React.Fragment key={step.key}>
                  <div className={`apd-wf-step ${state}`}>
                    <div className="apd-wf-icon">
                      {state === 'completed' && <IconCircleCheck />}
                      {state === 'active' && <IconCircleActive />}
                      {state === 'pending' && <IconCircle />}
                    </div>
                    <span className="apd-wf-label">{t(step.label)}</span>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={`apd-wf-connector ${i < currentPhase || isClosed ? 'done' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="apd-tabs">
          <button className={`apd-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            <IconFile /> {t('planView.tabOverview')}
          </button>
          <button className={`apd-tab ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>
            <IconCheck /> {t('planView.tabActions', { count: actions.length })}
          </button>
          <button className={`apd-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <IconHistory /> {t('planView.tabHistory')}
          </button>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="apd-panel">
          {tab === 'overview' && (
            <div className="apd-overview-grid">
              <div className="apd-card">
                <h4><IconFile /> {t('planView.information')}</h4>
                <div className="apd-info-row">
                  <span>{t('planView.planType')}</span>
                  <span>{t(TYPE_MAP[plan.type])}</span>
                </div>
                <div className="apd-info-row">
                  <span>{t('planView.department')}</span>
                  <span>{plan.departmentName || '—'}</span>
                </div>
                <div className="apd-info-row">
                  <span>{t('planView.assignedBy')}</span>
                  <span>{plan.createdByName || plan.createdBy || '—'}</span>
                </div>
                <div className="apd-info-row">
                  <span>{t('planView.creationDate')}</span>
                  <span>{fmtDate(plan.createdAt)}</span>
                </div>
                
                {/* 🎯 Extraction dynamique également dans l'onglet des détails */}
                {isCompleted && exactCompletionDate && (
                  <div className="apd-info-row">
                    <span>{t('planView.completionDate')}</span>
                    <span className="completed">
                      {fmtDate(exactCompletionDate)}
                    </span>
                  </div>
                )}

                <div className="apd-info-row">
                  <span>{t('planView.actionCount')}</span>
                  <span>{actions.length}</span>
                </div>
              </div>

              <div className="apd-card">
                <h4><IconClock /> {t('planView.upcoming')}</h4>
                {upcomingDeadlines.length === 0 ? (
                  <div className="apd-empty">
                    <IconCheck />
                    {t('planView.noUrgent')}
                  </div>
                ) : (
                  upcomingDeadlines.map(task => {
                    const days = getDaysRemaining(task.deadline);
                    const isOverdue = days < 0;
                    const isCritical = days <= 3 && days >= 0;
                    return (
                      <div key={task.id} className="apd-dl-item">
                        <div className="apd-dl-urgency" style={{
                          background: isOverdue ? '#fef2f2' : isCritical ? '#fef3c7' : '#f0fdf4',
                          color: isOverdue ? '#dc2626' : isCritical ? '#f59e0b' : '#16a34a'
                        }}>
                          {Math.abs(days)}
                          <span>{isOverdue ? t('planView.lateShort') : t('planView.daysShort')}</span>
                        </div>
                        <div className="apd-dl-info">
                          <div className="apd-dl-title">{task.title}</div>
                          <div className="apd-dl-date">{fmtDate(task.deadline)}</div>
                        </div>
                        <span className="apd-dl-pill" style={{
                          background: isOverdue ? '#fee2e2' : isCritical ? '#fef3c7' : '#dcfce7',
                          color: isOverdue ? '#dc2626' : isCritical ? '#b45309' : '#16a34a'
                        }}>
                          {isOverdue ? t('planView.urgent') : isCritical ? t('planView.critical') : t('planView.normal')}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'actions' && (
            <div className="apd-card">
              {actions.length === 0 ? (
                <div className="apd-empty">
                  <IconFile />
                  {t('planView.noActions')}
                </div>
              ) : (
                <table className="apd-table">
                  <thead>
                    <tr>
                      <th>{t('planView.colAction')}</th>
                      <th>{t('planView.colPriority')}</th>
                      <th>{t('planView.colDeadline')}</th>
                      <th>{t('planView.colProgress')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map(action => {
                      const priority = PRIORITY_MAP[action.priority] || PRIORITY_MAP[2];
                      const progress = action.progress ?? 0;
                      return (
                        <tr key={action.id}>
                          <td>
                            <span className="apd-act-title">{action.title}</span>
                            <span className="apd-act-sub">{action.description}</span>
                          </td>
                          <td>
                            <span className="apd-priority-pill" style={{ background: priority.bg, color: priority.color }}>
                              {t(priority.label)}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: getDaysRemaining(action.deadline) < 0 ? '#dc2626' : 'inherit' }}>
                              {fmtDate(action.deadline)}
                            </span>
                          </td>
                          <td>
                            <span className={`apd-progress-pill ${
                              progress >= 100 ? 'done' : progress > 0 ? 'in-progress' : 'todo'
                            }`}>
                              {progress >= 100 ? t('planView.statusDone') : progress > 0 ? t('planView.statusOngoing') : t('planView.notStarted')}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="apd-history-btn"
                              onClick={() => setHistoryActionId(action.id)}
                            >
                              {t('planView.history')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="apd-card">
              <div className="apd-timeline">
                {actions.map(action => {
                  const progress = action.progress ?? 0;
                  return (
                    <div key={action.id} className="apd-tl-item">
                      <div className={`apd-tl-dot ${progress >= 100 ? 'completed' : ''}`} />
                      <div className="apd-tl-content">
                        <span className="apd-tl-title">{action.title}</span>
                        <span className="apd-tl-meta">
                          {progress >= 100 ? t('planView.statusDone') : progress > 0 ? t('planView.statusOngoing') : t('planView.notStarted')} · {t('planView.deadlineMeta', { date: fmtDate(action.deadline) })}
                        </span>
                        <button
                          type="button"
                          className="apd-history-btn"
                          style={{ marginTop: 6 }}
                          onClick={() => setHistoryActionId(action.id)}
                        >
                          {t('planView.viewAssignments')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {historyActionId && accessToken && (
        <PlanActionHistoryModal
          token={accessToken}
          planActionId={historyActionId}
          actionTitle={actions.find((a) => a.id === historyActionId)?.title}
          onClose={() => setHistoryActionId(null)}
          initialTab="assignments"
        />
      )}
    </>
  );
}