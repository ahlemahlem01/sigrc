import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

interface Props {
  profile: any;
  badges: any[];
  timeline: any[];
  documents: any[];
  quickStats: any;
  plans?: any[];
  isAdmin?: boolean;
  onAssignBadge?: () => void;
  onAddDocument?: () => void;
  onAddTimelineEvent?: (event: any) => void;
  onAddPlan?: () => void;
  focusActivePlans?: boolean;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d: string) => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase();

/** label = i18n key */
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: 'planView.statusDraft', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  1: { label: 'activity.active',     color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  2: { label: 'employeeOverview.paused',  color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  3: { label: 'employeeOverview.finished',   color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  4: { label: 'status.archived',   color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
};

const WORKFLOW_STEPS = [
  { key: 'detection',     label: 'employeeOverview.wfDetection' },
  { key: 'analyse',       label: 'employeeOverview.wfAnalysis' },
  { key: 'planification', label: 'employeeOverview.wfPlanning' },
  { key: 'execution',     label: 'employeeOverview.wfExecution' },
  { key: 'verification',  label: 'employeeOverview.wfVerification' },
  { key: 'cloture',       label: 'employeeOverview.wfClosure' },
];

const getWorkflowPhase = (status: number) =>
  ({ 0: 0, 1: 2, 2: 2, 3: 5, 4: 5 } as Record<number, number>)[status] ?? 0;

const getDaysRemaining = (deadline: string) =>
  Math.ceil((new Date(deadline).getTime() - new Date().getTime()) / 86_400_000);

function computeSkills(plans: any[]) {
  if (!plans || plans.length === 0) return [];
  const total = plans.length;
  const completed = plans.filter((p: any) => p.status === 3).length;
  const active = plans.filter((p: any) => p.status === 1 || p.status === 2).length;
  const notStarted = plans.filter((p: any) => p.status === 0).length;
  const avgProgress = Math.round(plans.reduce((sum: number, p: any) => sum + (p.progress ?? 0), 0) / total);
  const completionRate = Math.round((completed / total) * 100);

  return [
    { name: i18n.t('employeeOverview.skillProject'),     level: Math.min(100, avgProgress + (completed > 0 ? 10 : 0)), plansCompleted: completed },
    { name: i18n.t('employeeOverview.skillAnalysis'),  level: Math.min(100, Math.round(((total - notStarted) / Math.max(total, 1)) * 100)), plansCompleted: total - notStarted },
    { name: i18n.t('employeeOverview.skillExecution'),     level: Math.min(100, avgProgress), plansCompleted: active },
    { name: i18n.t('employeeOverview.skillClosure'),   level: Math.min(100, completionRate + (completed >= 3 ? 15 : 0)), plansCompleted: completed },
  ].sort((a, b) => b.level - a.level);
}

export default function EmployeeOverview({
  profile, badges, timeline, documents, quickStats, plans = [],
  isAdmin = false, onAssignBadge, onAddDocument, onAddTimelineEvent,   onAddPlan,
  focusActivePlans = false,
}: Props) {
  const { t } = useTranslation();
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [timelineForm, setTimelineForm] = useState({ title: '', description: '', type: 'assignment' });

  const displayedTimeline = showAllTimeline ? timeline : timeline.slice(0, 4);
  const displayedBadges = showAllBadges ? badges : badges.slice(0, 4);
  const planPool = focusActivePlans
    ? plans.filter((p: any) => p.status !== 3 && p.status !== 4)
    : plans;
  const displayedPlans = (focusActivePlans || showAllPlans) ? planPool : planPool.slice(0, 5);

  const hireDate = profile?.hireDate ? new Date(profile.hireDate) : new Date('2023-06-15');
  const tenureYears = Math.floor((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
  const tenureMonths = Math.floor(((Date.now() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365) - tenureYears) * 12);

  // ── Derived plan metrics (mirrors UserDashboard) ──
  const avgProgress = plans.length > 0
    ? Math.round(plans.reduce((sum: number, p: any) => sum + (p.progress ?? 0), 0) / plans.length)
    : 0;
  const skills = computeSkills(plans);
  const lowestSkill = [...skills].sort((a, b) => a.level - b.level)[0];
  const upcomingDeadlines = [...plans]
    .filter((p: any) => p.status !== 3 && p.deadline)
    .sort((a: any, b: any) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);
  const allClosed = plans.length > 0 && plans.every((p: any) => p.status === 3 || p.status === 4);
  const maxPhase = plans.length > 0 ? Math.max(...plans.map((p: any) => getWorkflowPhase(p.status))) : 0;

  return (
    <>
      {/* Identity Card */}
      <div className="dashboard-card">
        <div className="dashboard-card-body">
          <div className="identity-section">
            <div className="identity-avatar">
              {profile?.name?.split(' ').map((n: string) => n[0]).join('') || initials(profile?.fullName || 'U')}
            </div>
            <div className="identity-info">
              <h1 className="identity-name">{profile?.name || profile?.fullName || t('employeesAdmin.roleUser')}</h1>
              <p className="identity-role">
                {profile?.poste || profile?.role || t('employeeOverview.employee')} • {profile?.department || '—'} • {t('orgChart.team')} : <strong>{profile?.equipe || '—'}</strong>
              </p>
              <div className="identity-meta">
                <span className="identity-meta-item"><span className="identity-status" />{profile?.status || t('activity.active')}</span>
                <span className="identity-meta-item">📅 {fmtDate(profile?.hireDate || '2023-06-15')}</span>
                <span className="identity-meta-item">⏱️ {t('employeeOverview.tenure', { y: tenureYears, m: tenureMonths })}</span>
                <span className="identity-meta-item">✉️ {profile?.email || 'employee@coficab.com'}</span>
                {profile?.telephone && <span className="identity-meta-item">📞 {profile.telephone}</span>}
                {profile?.ligneProduction && <span className="identity-meta-item">🏭 {profile.ligneProduction}</span>}
                <span className="identity-meta-item">👤 {t('employeeProfile.manager')} : <strong>{profile?.managerName || '—'}</strong></span>
              </div>
            </div>
            {isAdmin && (
              <div className="identity-actions">
                <button className="btn-primary">✏️ {t('common.edit')}</button>
                <button className="btn-secondary">📞 {t('employeeProfile.manager')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="quick-stats">
        {[
          { value: quickStats?.totalPlans || 0, label: t('assignmentsList.kpiPlans'), accent: '#1b1f6b' },
          { value: quickStats?.completed || 0, label: t('employeeOverview.completed'), accent: '#16a34a' },
          { value: `${quickStats?.onTimeRate || 0}%`, label: t('employeeOverview.onTimeRate'), sub: t('employeeOverview.onDeadline'), accent: '#3b82f6' },
          { value: quickStats?.overduePlans || 0, label: t('planDetail.late'), sub: t('reportPlans.colPlans'), accent: '#dc2626' },
          { value: badges.length, label: t('employeesAdmin.tabBadges'), accent: '#8b5cf6' },
        ].map((s, i) => (
          <div key={i} className="quick-stat" style={{ '--accent': s.accent } as React.CSSProperties}>
            <div className="quick-stat-value">{s.value}</div>
            <div className="quick-stat-label">{s.label}</div>
            {s.sub && <div className="quick-stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Workflow global */}
      {plans.length > 0 && (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2><span className="icon">🔄</span> {t('employeeOverview.workflow')}</h2>
          </div>
          <div className="dashboard-card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {WORKFLOW_STEPS.map((step, i) => {
                let state: 'pending' | 'active' | 'completed' = 'pending';
                if (allClosed) state = 'completed';
                else if (i < maxPhase) state = 'completed';
                else if (i === maxPhase) state = 'active';

                const iconColor = state === 'completed' ? '#16a34a' : state === 'active' ? '#1b1f6b' : '#94a3b8';
                const iconBg = state === 'completed' ? '#f0fdf4' : state === 'active' ? '#eef2ff' : '#f4f6fb';
                const iconBorder = state === 'completed' ? '#16a34a' : state === 'active' ? '#1b1f6b' : '#e4e8f2';

                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < WORKFLOW_STEPS.length - 1 ? 1 : 'unset' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', background: iconBg, color: iconColor,
                        border: `2px solid ${iconBorder}`, fontSize: 16, flexShrink: 0,
                      }}>
                        {state === 'completed' ? '✓' : state === 'active' ? '●' : '○'}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: state === 'active' ? 700 : 600,
                        color: state === 'completed' ? '#16a34a' : state === 'active' ? '#1b1f6b' : '#64748b',
                        whiteSpace: 'nowrap',
                      }}>{t(step.label)}</span>
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div style={{
                        flex: 1, height: 2, margin: '0 4px 20px',
                        background: (i < maxPhase || allClosed) ? '#16a34a' : '#f0f2f8',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Plans list */}
      <div className="dashboard-card" id="employee-plans">
        <div className="dashboard-card-header">
          <h2><span className="icon">📋</span> {focusActivePlans ? t('comparator.activeFiles') : t('nav.actionPlans')}</h2>
          {isAdmin && onAddPlan && (
            <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onAddPlan}>
              + {t('employeeAdminView.add')}
            </button>
          )}
        </div>
        <div className="dashboard-card-body">
          {displayedPlans.length === 0 ? (
            <div className="dashboard-empty">
              {focusActivePlans ? t('employeeOverview.noActiveFiles') : t('employeeOverview.noPlans')}
            </div>
          ) : (
            displayedPlans.map((plan: any) => {
              const status = STATUS_MAP[plan.status] ?? STATUS_MAP[0];
              return (
                <div key={plan.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
                  borderBottom: '1px solid #f0f2f8',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: '#eef2ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16,
                  }}>📄</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1340', marginBottom: 2 }}>{plan.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
                        borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                        background: status.bg, color: status.color, border: `1px solid ${status.border}`,
                      }}>{t(status.label)}</span>
                      {plan.deadline && ` · ${t('dashboard.colDeadline')} ${fmtDate(plan.deadline)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 100 }}>
                    <div style={{ flex: 1, height: 6, background: '#f0f2f8', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#1b1f6b', borderRadius: 3, width: `${plan.progress ?? 0}%` }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1b1f6b', minWidth: 32, textAlign: 'right' }}>
                      {plan.progress ?? 0}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {plans.length > 5 && !focusActivePlans && (
          <div className="dashboard-card-footer">
            <button className="view-all-btn" onClick={() => setShowAllPlans(!showAllPlans)}>
              {showAllPlans ? `${t('employeeOverview.seeLess')} ↑` : `${t('employeeOverview.seeAll')} →`}
            </button>
          </div>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2><span className="icon">🧠</span> {t('skills.radarName')}</h2>
          </div>
          <div className="dashboard-card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                {skills.map(s => (
                  <div key={s.name} style={{ padding: '12px 0', borderBottom: '1px solid #f0f2f8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0d1340' }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1b1f6b' }}>{s.level}%</span>
                    </div>
                    <div style={{ height: 6, background: '#f0f2f8', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', background: '#1b1f6b', borderRadius: 3, width: `${s.level}%` }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {t('employeeOverview.plansConcerned', { count: s.plansCompleted })}
                    </div>
                  </div>
                ))}
                {lowestSkill && (
                  <div style={{
                    marginTop: 14, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10,
                    borderLeft: '3px solid #16a34a',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>💡 {t('employeeOverview.recommendation')}</div>
                    <div style={{ fontSize: 11, color: '#166534', lineHeight: 1.5 }}>
                      {t('employeeOverview.strengthen')} <strong>{lowestSkill.name}</strong> — {t('employeeOverview.currentLevel', { level: lowestSkill.level })}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0d1340', marginBottom: 12 }}>📈 {t('employeeOverview.ranking')}</div>
                {[...skills].sort((a, b) => b.level - a.level).map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f2f8' }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      background: i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f8' : '#f8f9fc',
                      color: i === 0 ? '#f59e0b' : i === 1 ? '#6b7280' : '#9ca3af',
                    }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#0d1340' }}>{s.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1b1f6b' }}>{s.level}%</span>
                      </div>
                      <div style={{ height: 5, background: '#f0f2f8', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: '#1b1f6b', opacity: 0.7, borderRadius: 3, width: `${s.level}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global progress */}
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">📊</span> {t('planDetail.globalProgress')}</h2>
        </div>
        <div className="dashboard-card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>{t('employeeOverview.avgProgress')}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#1b1f6b' }}>{avgProgress}%</span>
          </div>
          <div style={{ height: 10, background: '#f0f2f8', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#1b1f6b', borderRadius: 5, width: `${avgProgress}%` }} />
          </div>
        </div>
      </div>

      {/* Timeline + Badges */}
      <div className="dashboard-grid-2">
        {/* Timeline */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2><span className="icon">📅</span> {t('employeeOverview.recentActivity')}</h2>
            {isAdmin && onAddTimelineEvent && (
              <button
                className="btn-primary"
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => setShowTimelineModal(true)}
              >
                + {t('employeeAdminView.add')}
              </button>
            )}
          </div>
          <div className="dashboard-card-body">
            <div className="timeline">
              {displayedTimeline.length === 0 ? (
                <div className="dashboard-empty">{t('employeeOverview.noActivity')}</div>
              ) : (
                displayedTimeline.map((e: any) => (
                  <div key={e.id} className="timeline-item">
                    <div className="timeline-dot" style={{ '--dot-color': e.type === 'completion' ? '#16a34a' : e.type === 'assignment' ? '#3b82f6' : e.type === 'comment' ? '#8b5cf6' : e.type === 'badge' ? '#f59e0b' : '#6b7280' } as React.CSSProperties}>
                      {e.type === 'completion' ? '✅' : e.type === 'assignment' ? '📋' : e.type === 'comment' ? '💬' : e.type === 'badge' ? '🏅' : '📢'}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-title">{e.title}</div>
                      <div className="timeline-desc">{e.description || e.desc}</div>
                      <div className="timeline-time">{fmtDateTime(e.timestamp || e.time)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {timeline.length > 4 && (
            <div className="dashboard-card-footer">
              <button className="view-all-btn" onClick={() => setShowAllTimeline(!showAllTimeline)}>
                {showAllTimeline ? `${t('employeeOverview.seeLess')} ↑` : `${t('employeeOverview.seeAll')} →`}
              </button>
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <h2><span className="icon">🏅</span> {t('employeeOverview.recentBadges')}</h2>
            {isAdmin && onAssignBadge && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={onAssignBadge}>
                + {t('recognition.award')}
              </button>
            )}
          </div>
          <div className="dashboard-card-body">
            <div className="badges-grid">
              {displayedBadges.length === 0 ? (
                <div className="dashboard-empty">{t('employeeOverview.noBadge')}</div>
              ) : (
                displayedBadges.map((b: any) => (
                  <div key={b.id} className="badge-card" style={{ '--badge-color': b.color || '#3b82f6' } as React.CSSProperties}>
                    <div className="badge-glow" style={{ background: b.color || '#3b82f6' }} />
                    <div className="badge-name">{b.name}</div>
                    <div className="badge-date">{fmtDate(b.earnedAt)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
          {badges.length > 4 && (
            <div className="dashboard-card-footer">
              <button className="view-all-btn" onClick={() => setShowAllBadges(!showAllBadges)}>
                {showAllBadges ? `${t('employeeOverview.seeLess')} ↑` : `${t('employeeOverview.seeAll')} →`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming deadlines */}
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">⏰</span> {t('employeeOverview.upcoming')}</h2>
        </div>
        <div className="dashboard-card-body">
          {upcomingDeadlines.length === 0 ? (
            <div className="dashboard-empty">{t('employeeOverview.noUrgent')}</div>
          ) : (
            upcomingDeadlines.map((plan: any) => {
              const days = getDaysRemaining(plan.deadline);
              const isOverdue = days < 0;
              const isCritical = days >= 0 && days <= 3;
              return (
                <div key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f2f8' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0,
                    background: isOverdue ? '#fef2f2' : isCritical ? '#fef3c7' : '#f0fdf4',
                    color: isOverdue ? '#dc2626' : isCritical ? '#f59e0b' : '#16a34a',
                  }}>
                    {Math.abs(days)}
                    <span style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>{isOverdue ? t('employeeOverview.lateShort') : t('employeeOverview.daysShort')}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0d1340', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {plan.title}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{fmtDate(plan.deadline)}</div>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, flexShrink: 0,
                    background: isOverdue ? '#fee2e2' : isCritical ? '#fef3c7' : '#dcfce7',
                    color: isOverdue ? '#dc2626' : isCritical ? '#b45309' : '#16a34a',
                  }}>
                    {isOverdue ? t('employeeOverview.urgent') : isCritical ? t('employeeOverview.critical') : t('employeeOverview.normal')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Documents */}
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">📁</span> {t('employeesAdmin.tabDocuments')}</h2>
          {isAdmin && onAddDocument && (
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={onAddDocument}
            >
              + {t('employeeAdminView.add')}
            </button>
          )}
        </div>
        <div className="dashboard-card-body">
          <div className="docs-grid">
            {documents.length === 0 ? (
              <div className="dashboard-empty">{t('employeeFile.noDocs')}</div>
            ) : (
              documents.map((d: any) => (
                <div key={d.id} className="doc-card">
                  <div className="doc-icon">📄</div>
                  <div className="doc-info">
                    <div className="doc-name">{d.name}</div>
                    <div className="doc-meta">{d.type} • {fmtDate(d.viewedAt || d.viewed)}</div>
                  </div>
                  <span className="doc-fav">{d.isFavorite || d.fav ? '⭐' : '☆'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Timeline Modal */}
      {showTimelineModal && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowTimelineModal(false)}>
          <div className="ad-modal" style={{ width: 480 }}>
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('employeeOverview.addEvent')}</span>
              <button className="ad-mclose" onClick={() => setShowTimelineModal(false)} aria-label={t('fiveWhy.close')}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <div className="ad-fg">
                <label className="ad-lbl">{t('dashboard.colTitle')}</label>
                <input
                  className="ad-inp"
                  value={timelineForm.title}
                  onChange={e => setTimelineForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('employeeOverview.eventTitlePh')}
                />
              </div>
              <div className="ad-fg">
                <label className="ad-lbl">{t('claimDetail.description')}</label>
                <textarea
                  className="ad-inp"
                  rows={3}
                  value={timelineForm.description}
                  onChange={e => setTimelineForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('planActionsMgmt.descriptionPh')}
                />
              </div>
              <div className="ad-fg">
                <label className="ad-lbl">{t('planDetail.type')}</label>
                <select
                  className="ad-sel"
                  value={timelineForm.type}
                  onChange={e => setTimelineForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="assignment">{t('audit.action.assigned')}</option>
                  <option value="completion">{t('employeeOverview.evCompletion')}</option>
                  <option value="badge">{t('employeeFile.badge')}</option>
                  <option value="comment">{t('recognition.comment')}</option>
                  <option value="other">{t('orgChart.others')}</option>
                </select>
              </div>
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowTimelineModal(false)}>{t('common.cancel')}</button>
              <button
                className="ad-btn btn-primary"
                onClick={() => {
                  onAddTimelineEvent?.({
                    title: timelineForm.title,
                    description: timelineForm.description,
                    type: timelineForm.type,
                    timestamp: new Date().toISOString(),
                  });
                  setTimelineForm({ title: '', description: '', type: 'assignment' });
                  setShowTimelineModal(false);
                }}
              >
                {t('employeeAdminView.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}