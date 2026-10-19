import { parseProgress } from '../admin/capaAnalytics';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getAssignedActionPlanById,
  getPlanActions,
  getUsersForAssignment,
} from '../../services/actionPlanService';
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
const IconClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;

// ── Types ──
interface ActionPlanDto {
  id: string;
  title: string;
  description?: string;
  type: number;
  status: number;
  ownerId: string;
  departmentId: string;
  departmentName: string;
  createdAt: string;
  createdBy?: string;
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

interface UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

// ── Constants ──
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: 'planView.statusDraft', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
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

// 1 PA (preventive), 2 PAC (corrective), 3 PAP (improvement): the numbering of the server
const TYPE_MAP: Record<number, string> = {
  1: 'planView.typePreventive',
  2: 'planView.typeCorrective',
  3: 'planView.typeImprovement',
};

const WORKFLOW_STEPS = [
  { key: 'detection', label: 'planView.wfDetection' },
  { key: 'analyse', label: 'planView.wfAnalysis' },
  { key: 'planification', label: 'planView.wfPlanning' },
  { key: 'execution', label: 'planView.wfExecution' },
  { key: 'verification', label: 'planView.wfVerification' },
  { key: 'cloture', label: 'planView.wfClosure' },
];

// ── Component ──
export default function ActionPlanSummary() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();

  const [plan, setPlan] = useState<ActionPlanDto | null>(null);
  const [actions, setActions] = useState<PlanActionDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'actions' | 'history'>('overview');

  useEffect(() => {
    if (!id || !accessToken) return;
    loadPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [id, accessToken]);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const planRes = await getAssignedActionPlanById(accessToken!, id!);
      setPlan(planRes.data);

      const actionsRes = await getPlanActions(accessToken!, id!);
      // the progress of an action arrives by name ("Hundred", "Fifty"): 0-100
      setActions((actionsRes.data ?? []).map((a: PlanActionDto) => ({ ...a, progress: parseProgress(a.progress) })));

      const usersRes = await getUsersForAssignment(accessToken!);
      setUsers(usersRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : userId;
  };

  const getDaysRemaining = (deadline: string) => {
    return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

  const getWorkflowPhase = (status: number) => {
    const map: Record<number, number> = { 0: 0, 1: 2, 2: 2, 3: 5, 4: 5 };
    return map[status] || 0;
  };

  const currentPhase = getWorkflowPhase(plan?.status || 0);
  const isClosed = plan?.status === 3 || plan?.status === 4;

  const completedActions = actions.filter(a => a.progress >= 100).length;
  const inProgressActions = actions.filter(a => a.progress > 0 && a.progress < 100).length;
  const notStartedActions = actions.filter(a => a.progress === 0).length;
  const globalProgress = actions.length > 0 ? Math.round(actions.reduce((sum, a) => sum + a.progress, 0) / actions.length) : 0;

const currentUserId = (user as any)?.sub || (user as any)?.id;
  const myActions = actions.filter(a => a.assignedToId === currentUserId);
  const upcomingDeadlines = [...actions]
    .filter(a => a.progress < 100)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);

  if (loading) return (
    <div className="aps-loading">
      <div className="aps-spinner" />
      <p>{t('planView.loading')}</p>
    </div>
  );

  if (error) return (
    <div className="aps-error">
      <IconAlert />
      <h2>{error}</h2>
      <button onClick={() => navigate('/dashboard')}>{t('planView.backToDashboard')}</button>
    </div>
  );

  if (!plan) return null;

  const status = STATUS_MAP[plan.status] || STATUS_MAP[0];

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

        .aps-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--muted); min-height: 100dvh; font-family: var(--font-body); }
        .aps-spinner { width: 40px; height: 40px; border: 3px solid var(--border); border-top-color: var(--navy); border-radius: 50%; animation: aps-spin 1s linear infinite; }
        @keyframes aps-spin { to { transform: rotate(360deg); } }

        .aps-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 100dvh; color: #b91c1c; font-family: var(--font-body); padding: 40px; text-align: center; }
        .aps-error h2 { font-size: 18px; font-weight: 600; margin: 0; }
        .aps-error button { padding: 10px 20px; border-radius: 8px; border: none; background: var(--navy); color: #fff; font-weight: 600; cursor: pointer; font-family: var(--font-head); }

        .aps-page { padding: 24px; font-family: var(--font-body); max-width: 1200px; margin: 0 auto; }

        /* Header */
        .aps-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px; }
        .aps-header-left { display: flex; flex-direction: column; gap: 8px; }
        .aps-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--white); color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: var(--font-body); margin-bottom: 4px; }
        .aps-back:hover { color: var(--navy); border-color: #93c5fd; background: var(--navy-light); }
        .aps-title { font-family: var(--font-head); font-size: 22px; font-weight: 700; color: var(--navy); margin: 0; line-height: 1.2; }
        .aps-id { font-size: 11px; color: var(--subtle); font-family: monospace; }
        .aps-status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: -0.01em; text-transform: none; width: fit-content; }
        .aps-status-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; }

        /* Summary Card */
        .aps-summary { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .aps-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .aps-summary-item { display: flex; flex-direction: column; gap: 4px; }
        .aps-summary-item.full-width { grid-column: 1 / -1; }
        .aps-summary-label { font-size: 10px; font-weight: 700; letter-spacing: -0.01em; text-transform: none; color: var(--subtle); }
        .aps-summary-value { font-size: 13px; font-weight: 600; color: var(--text); }
        .aps-summary-value.muted { color: var(--muted); font-weight: 400; }
        .aps-summary-desc { font-size: 13px; color: var(--text2); line-height: 1.6; }

        /* Progress Section */
        .aps-progress-card { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .aps-progress-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .aps-progress-header h3 { font-family: var(--font-head); font-size: 14px; font-weight: 700; color: var(--navy); margin: 0; }
        .aps-progress-pct { font-family: var(--font-head); font-size: 24px; font-weight: 700; color: var(--navy); }
        .aps-progress-bar { height: 8px; background: var(--border2); border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
        .aps-progress-fill { height: 100%; border-radius: 4px; background: var(--navy); transition: width .4s ease; }
        .aps-progress-stats { display: flex; gap: 24px; }
        .aps-stat { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text2); }
        .aps-stat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .aps-stat-dot.done { background: #16a34a; }
        .aps-stat-dot.progress { background: #1d4ed8; }
        .aps-stat-dot.todo { background: var(--subtle); }

        /* Workflow */
        .aps-workflow { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 24px; margin-bottom: 24px; }
        .aps-workflow h3 { font-family: var(--font-head); font-size: 14px; font-weight: 700; color: var(--navy); margin: 0 0 20px 0; }
        .aps-wf-steps { display: flex; align-items: center; justify-content: space-between; }
        .aps-wf-step { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; }
        .aps-wf-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all .3s; }
        .aps-wf-step.completed .aps-wf-icon { background: #f0fdf4; color: #16a34a; border: 2px solid #16a34a; }
        .aps-wf-step.active .aps-wf-icon { background: var(--navy-light); color: var(--navy); border: 2px solid var(--navy); box-shadow: 0 0 0 4px rgba(0,1,104,0.1); }
        .aps-wf-step.pending .aps-wf-icon { background: var(--bg); color: var(--subtle); border: 2px solid var(--border); }
        .aps-wf-label { font-size: 10px; font-weight: 600; color: var(--muted); text-align: center; white-space: nowrap; }
        .aps-wf-step.completed .aps-wf-label { color: #16a34a; }
        .aps-wf-step.active .aps-wf-label { color: var(--navy); font-weight: 700; }
        .aps-wf-connector { flex: 1; height: 2px; background: var(--border2); margin: 0 4px; margin-bottom: 24px; transition: background .3s; }
        .aps-wf-connector.done { background: #16a34a; }

        /* Tabs */
        .aps-tabs { display: flex; gap: 4px; background: var(--white); border: 1px solid var(--border); border-radius: 12px; padding: 4px; width: fit-content; margin-bottom: 20px; }
        .aps-tab { padding: 8px 18px; border-radius: 8px; border: none; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; font-family: var(--font-body); display: inline-flex; align-items: center; gap: 6px; }
        .aps-tab:hover { color: var(--navy); }
        .aps-tab.active { background: var(--navy); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.1); }

        /* Tab Panels */
        .aps-panel { animation: aps-fade-in .3s ease; }
        @keyframes aps-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        /* Overview */
        .aps-overview-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
        .aps-card { background: var(--white); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
        .aps-card h4 { font-family: var(--font-head); font-size: 13px; font-weight: 700; color: var(--navy); margin: 0 0 16px 0; display: flex; align-items: center; gap: 8px; }
        .aps-info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border2); font-size: 12px; }
        .aps-info-row:last-child { border-bottom: none; }
        .aps-info-row span:first-child { color: var(--muted); font-weight: 500; }
        .aps-info-row span:last-child { color: var(--text); font-weight: 600; }

        /* Deadlines */
        .aps-dl-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border2); }
        .aps-dl-item:last-child { border-bottom: none; }
        .aps-dl-urgency { width: 40px; height: 40px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
        .aps-dl-urgency span { font-size: 8px; font-weight: 600; text-transform: none; letter-spacing: -0.01em; }
        .aps-dl-info { flex: 1; min-width: 0; }
        .aps-dl-title { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aps-dl-date { font-size: 10px; color: var(--subtle); margin-top: 2px; }
        .aps-dl-pill { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; flex-shrink: 0; }

        /* Actions Table */
        .aps-table { width: 100%; border-collapse: collapse; }
        .aps-table thead th { padding: 12px 16px; text-align: left; font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; text-transform: none; color: var(--muted); background: #f8f9fc; border-bottom: 1px solid var(--border2); }
        .aps-table tbody td { padding: 14px 16px; border-bottom: 1px solid var(--border2); font-size: 12px; color: var(--text2); vertical-align: middle; }
        .aps-table tbody tr:last-child td { border-bottom: none; }
        .aps-table tbody tr:hover td { background: #fafbff; }
        .aps-act-title { font-weight: 600; color: var(--text); display: block; }
        .aps-act-sub { font-size: 11px; color: var(--subtle); display: block; margin-top: 2px; }
        .aps-priority-pill { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .aps-progress-pill { display: inline-flex; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
        .aps-progress-pill.done { background: #f0fdf4; color: #15803d; }
        .aps-progress-pill.in-progress { background: #dbeafe; color: #1d4ed8; }
        .aps-progress-pill.todo { background: #f1f5f9; color: #64748b; }

        /* History */
        .aps-timeline { position: relative; padding-left: 24px; }
        .aps-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: var(--border); }
        .aps-tl-item { position: relative; padding-bottom: 20px; }
        .aps-tl-dot { position: absolute; left: -24px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--white); border: 2px solid var(--navy); }
        .aps-tl-dot.completed { border-color: #16a34a; background: #f0fdf4; }
        .aps-tl-content { display: flex; flex-direction: column; gap: 2px; }
        .aps-tl-title { font-size: 12px; font-weight: 600; color: var(--text); }
        .aps-tl-meta { font-size: 11px; color: var(--subtle); }

        /* Access Notice */
        .aps-notice { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: #fefce8; border: 1px solid #fde047; border-radius: 10px; margin-bottom: 20px; font-size: 12px; color: #854d0e; }
        .aps-notice svg { flex-shrink: 0; }

        /* Empty */
        .aps-empty { padding: 40px; text-align: center; color: var(--muted); font-size: 13px; }
        .aps-empty svg { display: block; margin: 0 auto 8px; opacity: .4; }

        @media (max-width: 900px) {
          .aps-summary-grid { grid-template-columns: repeat(2, 1fr); }
          .aps-overview-grid { grid-template-columns: 1fr; }
          .aps-wf-label { font-size: 9px; }
        }
        @media (max-width: 600px) {
          .aps-summary-grid { grid-template-columns: 1fr; }
          .aps-wf-steps { overflow-x: auto; gap: 8px; }
          .aps-wf-connector { display: none; }
        }
      `}</style>

      <div className="aps-page">
        {/* ── HEADER ── */}
        <div className="aps-header">
          <div className="aps-header-left">
            <button className="aps-back" onClick={() => navigate(-1)}>
              <IconArrowLeft /> {t('planView.back')}
            </button>
            <span
              className="aps-status-pill"
              style={{
                background: status.bg,
                color: status.color,
                border: `1px solid ${status.border}`,
              }}
            >
              {t(status.label)}
            </span>
            <h1 className="aps-title">{plan.title}</h1>
            <span className="aps-id">{plan.id}</span>
          </div>
        </div>

        {/* ── SUMMARY CARD ── */}
        <div className="aps-summary">
          <div className="aps-summary-grid">
            <div className="aps-summary-item">
              <span className="aps-summary-label">{t('planView.type')}</span>
              <span className="aps-summary-value">{TYPE_MAP[plan.type] ? t(TYPE_MAP[plan.type]) : '—'}</span>
            </div>
            <div className="aps-summary-item">
              <span className="aps-summary-label">{t('planView.department')}</span>
              <span className="aps-summary-value">{plan.departmentName}</span>
            </div>
            <div className="aps-summary-item">
              <span className="aps-summary-label">{t('planView.owner')}</span>
              <span className="aps-summary-value">{getUserName(plan.ownerId)}</span>
            </div>
            <div className="aps-summary-item">
              <span className="aps-summary-label">{t('planView.createdOn')}</span>
              <span className="aps-summary-value">{fmtDate(plan.createdAt)}</span>
            </div>
            <div className="aps-summary-item full-width">
              <span className="aps-summary-label">{t('planView.description')}</span>
              <span className="aps-summary-desc">{plan.description || t('planView.noDescription')}</span>
            </div>
          </div>
        </div>

        {/* ── PROGRESS ── */}
        <div className="aps-progress-card">
          <div className="aps-progress-header">
            <h3>{t('planView.globalProgress')}</h3>
            <span className="aps-progress-pct">{globalProgress}%</span>
          </div>
          <div className="aps-progress-bar">
            <div className="aps-progress-fill" style={{ width: `${globalProgress}%` }} />
          </div>
          <div className="aps-progress-stats">
            <div className="aps-stat">
              <span className="aps-stat-dot done" />
              {t('planView.doneCount', { count: completedActions })}
            </div>
            <div className="aps-stat">
              <span className="aps-stat-dot progress" />
              {t('planView.ongoingCount', { count: inProgressActions })}
            </div>
            <div className="aps-stat">
              <span className="aps-stat-dot todo" />
              {t('planView.todoCount', { count: notStartedActions })}
            </div>
          </div>
        </div>

        {/* ── WORKFLOW ── */}
        <div className="aps-workflow">
          <h3>{t('planView.workflow')}</h3>
          <div className="aps-wf-steps">
            {WORKFLOW_STEPS.map((step, i) => {
              let state: 'pending' | 'active' | 'completed' = 'pending';
              if (isClosed) state = 'completed';
              else if (i < currentPhase) state = 'completed';
              else if (i === currentPhase) state = 'active';

              return (
                <React.Fragment key={step.key}>
                  <div className={`aps-wf-step ${state}`}>
                    <div className="aps-wf-icon">
                      {state === 'completed' && <IconCircleCheck />}
                      {state === 'active' && <IconCircleActive />}
                      {state === 'pending' && <IconCircle />}
                    </div>
                    <span className="aps-wf-label">{t(step.label)}</span>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className={`aps-wf-connector ${i < currentPhase || isClosed ? 'done' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="aps-tabs">
          <button className={`aps-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            <IconFile /> {t('planView.tabOverview')}
          </button>
          <button className={`aps-tab ${tab === 'actions' ? 'active' : ''}`} onClick={() => setTab('actions')}>
            <IconCheck /> {t('planView.tabMyActions', { count: myActions.length })}
          </button>
          <button className={`aps-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            <IconHistory /> {t('planView.tabHistory')}
          </button>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="aps-panel">
          {tab === 'overview' && (
            <div className="aps-overview-grid">
              {/* Info Card */}
              <div className="aps-card">
                <h4><IconFile /> {t('planView.information')}</h4>
                <div className="aps-info-row">
                  <span>{t('planView.planType')}</span>
                  <span>{TYPE_MAP[plan.type] ? t(TYPE_MAP[plan.type]) : '—'}</span>
                </div>
                <div className="aps-info-row">
                  <span>{t('planView.department')}</span>
                  <span>{plan.departmentName}</span>
                </div>
                <div className="aps-info-row">
                  <span>{t('planView.owner')}</span>
                  <span>{getUserName(plan.ownerId)}</span>
                </div>
                <div className="aps-info-row">
                  <span>{t('planView.createdBy')}</span>
                  <span>{plan.createdBy || '—'}</span>
                </div>
                <div className="aps-info-row">
                  <span>{t('planView.creationDate')}</span>
                  <span>{fmtDate(plan.createdAt)}</span>
                </div>
                <div className="aps-info-row">
                  <span>{t('planView.actionCount')}</span>
                  <span>{actions.length}</span>
                </div>
              </div>

              {/* Upcoming Deadlines */}
              <div className="aps-card">
                <h4><IconClock /> {t('planView.upcoming')}</h4>
                {upcomingDeadlines.length === 0 ? (
                  <div className="aps-empty">
                    <IconCheck />
                    {t('planView.noUrgent')}
                  </div>
                ) : (
                  upcomingDeadlines.map(task => {
                    const days = getDaysRemaining(task.deadline);
                    const isOverdue = days < 0;
                    const isCritical = days <= 3 && days >= 0;
                    return (
                      <div key={task.id} className="aps-dl-item">
                        <div className="aps-dl-urgency" style={{
                          background: isOverdue ? '#fef2f2' : isCritical ? '#fef3c7' : '#f0fdf4',
                          color: isOverdue ? '#dc2626' : isCritical ? '#f59e0b' : '#16a34a'
                        }}>
                          {Math.abs(days)}
                          <span>{isOverdue ? t('planView.lateShort') : t('planView.daysShort')}</span>
                        </div>
                        <div className="aps-dl-info">
                          <div className="aps-dl-title">{task.title}</div>
                          <div className="aps-dl-date">{fmtDate(task.deadline)}</div>
                        </div>
                        <span className="aps-dl-pill" style={{
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
            <div className="aps-card">
              {myActions.length === 0 ? (
                <div className="aps-empty">
                  <IconFile />
                  {t('planView.noMyActions')}
                </div>
              ) : (
                <table className="aps-table">
                  <thead>
                    <tr>
                      <th>{t('planView.colAction')}</th>
                      <th>{t('planView.colPriority')}</th>
                      <th>{t('planView.colDeadline')}</th>
                      <th>{t('planView.colProgress')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myActions.map(action => {
                      const priority = PRIORITY_MAP[action.priority] || PRIORITY_MAP[2];
                      return (
                        <tr key={action.id}>
                          <td>
                            <span className="aps-act-title">{action.title}</span>
                            <span className="aps-act-sub">{action.description}</span>
                          </td>
                          <td>
                            <span className="aps-priority-pill" style={{ background: priority.bg, color: priority.color }}>
                              {t(priority.label)}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: getDaysRemaining(action.deadline) < 0 ? '#dc2626' : 'inherit' }}>
                              {fmtDate(action.deadline)}
                            </span>
                          </td>
                          <td>
                            <span className={`aps-progress-pill ${
                              action.progress >= 100 ? 'done' : action.progress > 0 ? 'in-progress' : 'todo'
                            }`}>
                              {action.progress >= 100 ? t('planView.statusDone') : action.progress > 0 ? t('planView.statusOngoing') : t('planView.notStarted')}
                            </span>
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
            <div className="aps-card">
              <div className="aps-timeline">
                {actions.map(action => (
                  <div key={action.id} className="aps-tl-item">
                    <div className={`aps-tl-dot ${action.progress >= 100 ? 'completed' : ''}`} />
                    <div className="aps-tl-content">
                      <span className="aps-tl-title">{action.title}</span>
                      <span className="aps-tl-meta">
                        {action.progress >= 100 ? t('planView.statusDone') : action.progress > 0 ? t('planView.statusOngoing') : t('planView.notStarted')} · {t('planView.deadlineMeta', { date: fmtDate(action.deadline) })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}