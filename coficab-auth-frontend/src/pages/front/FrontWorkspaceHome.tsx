import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useRealtimeOptional } from '../../context/RealtimeContext';
import { getAlerts, type QualityAlert } from '../../services/alertService';
import {
  getEmployeeWorkspace,
  type WorkspaceBadge,
  type WorkspaceDocument,
  type WorkspaceEightD,
} from '../../services/employeeWorkspaceService';
import type { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { Award } from 'lucide-react';
import BadgeEmblem from '../../components/BadgeEmblem';
import { BADGE_DEFINITIONS } from '../../utils/badges';
import './FrontWorkspaceHome.styles.css';

type TFunc = (key: string, options?: Record<string, unknown>) => string;

function dateLocale(lang: string): string {
  if (lang.startsWith('en')) return 'en-GB';
  if (lang.startsWith('it')) return 'it-IT';
  return 'fr-FR';
}

interface AssignedPlan {
  id: string;
  title: string;
  status?: number;
  progress?: number;
  deadline?: string;
  createdAt?: string;
  completedAt?: string;
}

interface PlanActionLite {
  id: string;
  planId: string;
  progress: number;
  deadline?: string;
}

interface TrendPoint {
  key: string;
  label: string;
  rate: number | null;
}

interface KpiCard {
  key: string;
  label: string;
  value: string | number;
  hint: string;
  tone: 'navy' | 'danger' | 'warn' | 'ok' | 'info';
  path?: string;
}

type TodoKind = 'claim' | 'plan' | 'alert';

interface TodoItem {
  id: string;
  kind: TodoKind;
  title: string;
  meta: string;
  urgency: 'late' | 'today' | 'soon';
  path: string;
}

interface NextAction {
  id: string;
  title: string;
  actionType: string;
  deadline?: string;
  deadlineLabel: string;
  sortDays: number;
  path: string;
  tone: 'danger' | 'warn' | 'navy';
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function isClaimOpen(claim: Claim): boolean {
  const s = resolveClaimStatus(claim);
  return s !== 'CLOTUREE' && s !== 'VALIDATED' && s !== 'ARCHIVED';
}

/** The claim's own deadline only: no fallback to the detection date. */
function claimDeadline(claim: Claim): string | undefined {
  const raw = (claim as any).deadline || (claim as any).Deadline || claim.deadline;
  return raw ? String(raw) : undefined;
}

function formatActionDeadline(
  dateStr: string | null | undefined,
  t: TFunc,
  locale: string
): {
  label: string;
  sortDays: number;
  tone: 'danger' | 'warn' | 'navy';
} {
  const d = daysUntil(dateStr);
  if (d == null || !dateStr) {
    return { label: t('employeeWorkspace.noDeadline'), sortDays: Number.POSITIVE_INFINITY, tone: 'navy' };
  }
  if (d < 0) {
    return {
      label: t('employeeWorkspace.overdueDays', { count: Math.abs(d) }),
      sortDays: d,
      tone: 'danger',
    };
  }
  if (d === 0) {
    return { label: t('employeeWorkspace.today'), sortDays: 0, tone: 'warn' };
  }
  if (d === 1) {
    return { label: t('employeeWorkspace.tomorrow'), sortDays: 1, tone: 'warn' };
  }
  const formatted = new Date(dateStr).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return {
    label: d <= 7 ? t('employeeWorkspace.inDays', { count: d, date: formatted }) : formatted,
    sortDays: d,
    tone: d <= 7 ? 'warn' : 'navy',
  };
}

/** Claim workflow codes (EN_ANALYSE, ASSIGNED…) shown to employees in their language. */
function claimStatusLabel(status: string, t: TFunc): string {
  return t(`employeeWorkspace.claimStatus.${status}`, { defaultValue: status });
}

function alertStatusLabel(status: string, t: TFunc): string {
  const key = String(status || '').toLowerCase();
  return t(`employeeWorkspace.alertStatus.${key}`, { defaultValue: status });
}

/** 8D step names come from the API in French; translate by step code. */
function eightDStepLabel(code: string, fallback: string, t: TFunc): string {
  return t(`employeeWorkspace.eightDStep.${code}`, { defaultValue: fallback });
}

function toProgress(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(100, value));
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  }
  return 0;
}

function claimActionLabel(status: string, t: TFunc): string {
  switch (status) {
    case 'DRAFT':
      return t('employeeWorkspace.actionClaimDraft');
    case 'ASSIGNED':
      return t('employeeWorkspace.actionClaimAssigned');
    case 'EN_ANALYSE':
      return t('employeeWorkspace.actionClaimAnalysis');
    case 'OUVERTE':
      return t('employeeWorkspace.actionClaimOpen');
    default:
      return t('employeeWorkspace.actionClaimOpen');
  }
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function isPlanClosed(plan: AssignedPlan): boolean {
  return plan.status === 3 || plan.status === 4 || (plan.progress ?? 0) >= 100;
}

export default function FrontWorkspaceHome() {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const realtime = useRealtimeOptional();
  const navigate = useNavigate();
  const locale = dateLocale(i18n.language || 'fr');

  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<WorkspaceDocument[]>([]);
  const [recentBadges, setRecentBadges] = useState<WorkspaceBadge[]>([]);
  const [actions, setActions] = useState<PlanActionLite[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [eightDByClaim, setEightDByClaim] = useState<Record<string, WorkspaceEightD>>({});
  const [rejectedPlans, setRejectedPlans] = useState<AssignedPlan[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<QualityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName =
    (user as any)?.fullName ||
    (user as any)?.name ||
    (user as any)?.email ||
    'Collaborateur';

  const load = useCallback(async (silent = false) => {
    if (!accessToken) return;
    if (!silent) setLoading(true);
    try {
      const [workspace, alertsRows] = await Promise.all([
        getEmployeeWorkspace(accessToken).catch(() => null),
        getAlerts(accessToken, 'pending_validation').catch(() => [] as QualityAlert[]),
      ]);
      if (!workspace) return;

      const toPlan = (p: any): AssignedPlan => ({
        id: String(p.id ?? p.Id ?? ''),
        title: String(p.title ?? p.Title ?? 'Plan'),
        status: Number(p.status ?? p.Status ?? 0),
        progress: toProgress(p.progress ?? p.Progress),
        deadline: p.deadline ?? p.Deadline,
        createdAt: p.createdAt ?? p.CreatedAt,
        completedAt: p.completedAt ?? p.CompletedAt,
      });
      const planList = workspace.plans.map(toPlan).filter((p) => p.id);
      setPlans(planList);
      setClaims(workspace.claims);
      setRejectedPlans(workspace.rejectedPlans.map(toPlan).filter((p) => p.id));
      setRecentDocuments(workspace.recentDocuments);
      setRecentBadges(workspace.recentBadges);

      setActiveAlerts(
        (Array.isArray(alertsRows) ? alertsRows : []).filter((a) => {
          const s = String(a.status || '').toLowerCase();
          return s === 'pending_validation' || s === 'pending' || s === 'active' || s === 'validated';
        }),
      );

      const eightDMap: Record<string, WorkspaceEightD> = {};
      for (const d of workspace.eightD) eightDMap[String(d.claimId)] = d;
      setEightDByClaim(eightDMap);

      setActions(
        workspace.planActions
          .map((a) => ({
            id: String(a.id),
            planId: String(a.actionPlanId),
            progress: toProgress(a.progress),
            deadline: a.deadline ?? undefined,
          }))
          .filter((a) => a.id),
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live refresh: notifications / alertes / statuts dossiers (sans recharger la page).
  useEffect(() => {
    if (!realtime) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(true), 400);
    };
    const unsubs = [
      realtime.subscribe('ReceiveNotification', schedule),
      realtime.subscribe('ReceiveAlertUpdated', schedule),
      realtime.subscribe('ReceiveDossierStatusChanged', schedule),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [realtime, load]);

  const openClaims = useMemo(() => claims.filter(isClaimOpen), [claims]);
  const closedClaims = useMemo(
    () =>
      claims.filter((c) => {
        const s = resolveClaimStatus(c);
        return s === 'CLOTUREE' || s === 'VALIDATED';
      }),
    [claims]
  );
  const activePlans = useMemo(
    () => plans.filter((p) => p.status !== 3 && p.status !== 4 && (p.progress ?? 0) < 100),
    [plans]
  );
  const closedPlans = useMemo(
    () => plans.filter((p) => p.status === 3 || p.status === 4 || (p.progress ?? 0) >= 100),
    [plans]
  );
  const openActions = useMemo(() => actions.filter((a) => a.progress < 100), [actions]);

  const stats = useMemo(() => {
    const overdueClaims = openClaims.filter((c) => {
      const d = daysUntil(claimDeadline(c));
      return d != null && d < 0;
    }).length;
    const overduePlans = activePlans.filter((p) => {
      const d = daysUntil(p.deadline);
      return d != null && d < 0;
    }).length;
    const enRetard = overdueClaims + overduePlans;

    const nearClaim = openClaims.filter((c) => {
      const d = daysUntil(claimDeadline(c));
      return d != null && d >= 0 && d <= 7;
    }).length;
    const nearPlan = activePlans.filter((p) => {
      const d = daysUntil(p.deadline);
      return d != null && d >= 0 && d <= 7;
    }).length;
    const nearAction = openActions.filter((a) => {
      const d = daysUntil(a.deadline);
      return d != null && d >= 0 && d <= 7;
    }).length;
    const echeancesProches = actions.length > 0 ? nearClaim + nearAction : nearClaim + nearPlan;

    const progressSamples =
      openActions.length > 0
        ? openActions.map((a) => a.progress)
        : activePlans.map((p) => p.progress ?? 0);
    const progressionMoy =
      progressSamples.length > 0
        ? Math.round(progressSamples.reduce((s, n) => s + n, 0) / progressSamples.length)
        : 0;

    const totalDone = closedClaims.length + closedPlans.length;
    const totalAll = claims.length + plans.length;
    const tauxCloture = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

    return {
      actionsOuvertes: openActions.length,
      reclamationsOuvertes: openClaims.length,
      plansActifs: activePlans.length,
      enRetard,
      echeancesProches,
      progressionMoy,
      tauxCloture,
      charge: openClaims.length + activePlans.length,
    };
  }, [
    openClaims,
    activePlans,
    openActions,
    actions.length,
    closedClaims,
    closedPlans,
    claims.length,
    plans.length,
  ]);

  const kpiCards = useMemo<KpiCard[]>(
    () => [
      {
        key: 'actions',
        label: t('employeeWorkspace.kpiActions'),
        value: stats.actionsOuvertes,
        hint: t('employeeWorkspace.kpiActionsHint'),
        tone: 'navy',
        path: '/action-plans',
      },
      {
        key: 'late',
        label: t('employeeWorkspace.kpiLate'),
        value: stats.enRetard,
        hint: t('employeeWorkspace.kpiLateHint'),
        tone: stats.enRetard > 0 ? 'danger' : 'ok',
        path: '/action-plans',
      },
      {
        key: 'claims',
        label: t('employeeWorkspace.kpiClaims'),
        value: stats.reclamationsOuvertes,
        hint: t('employeeWorkspace.kpiClaimsHint'),
        tone: 'info',
        path: '/pages/front/my-claims',
      },
      {
        key: 'plans',
        label: t('employeeWorkspace.kpiPlans'),
        value: stats.plansActifs,
        hint: t('employeeWorkspace.kpiPlansHint'),
        tone: 'navy',
        path: '/action-plans',
      },
      {
        key: 'progress',
        label: t('employeeWorkspace.kpiProgress'),
        value: `${stats.progressionMoy}%`,
        hint: t('employeeWorkspace.kpiProgressHint'),
        tone: stats.progressionMoy >= 70 ? 'ok' : stats.progressionMoy >= 35 ? 'warn' : 'navy',
        path: '/action-plans',
      },
      {
        key: 'due',
        label: t('employeeWorkspace.kpiDue'),
        value: stats.echeancesProches,
        hint: t('employeeWorkspace.kpiDueHint'),
        tone: stats.echeancesProches > 0 ? 'warn' : 'ok',
        path: '/pages/front/action-plans/calendar',
      },
    ],
    [stats, t]
  );

  const todos = useMemo(() => {
    const items: TodoItem[] = [];

    for (const c of openClaims) {
      const d = daysUntil(claimDeadline(c));
      if (d == null) continue;
      const claimTitle =
        c.title || t('employeeWorkspace.claimFallback', { id: String(c.id).slice(0, 8) });
      if (d < 0) {
        items.push({
          id: `claim-${c.id}`,
          kind: 'claim',
          title: claimTitle,
          meta: t('employeeWorkspace.todoMetaLateClaim', {
            count: Math.abs(d),
            status: claimStatusLabel(resolveClaimStatus(c), t),
          }),
          urgency: 'late',
          path: `/pages/front/quality-analyses/8d/${c.id}`,
        });
      } else if (d === 0) {
        items.push({
          id: `claim-${c.id}`,
          kind: 'claim',
          title: claimTitle,
          meta: t('employeeWorkspace.todoMetaTodayClaim', { status: claimStatusLabel(resolveClaimStatus(c), t) }),
          urgency: 'today',
          path: `/pages/front/quality-analyses/8d/${c.id}`,
        });
      } else if (d <= 2) {
        items.push({
          id: `claim-${c.id}`,
          kind: 'claim',
          title: claimTitle,
          meta: t('employeeWorkspace.todoMetaSoonClaim', {
            count: d,
            status: claimStatusLabel(resolveClaimStatus(c), t),
          }),
          urgency: 'soon',
          path: `/pages/front/quality-analyses/8d/${c.id}`,
        });
      }
    }

    for (const p of activePlans) {
      const d = daysUntil(p.deadline);
      if (d == null) continue;
      if (d < 0) {
        items.push({
          id: `plan-${p.id}`,
          kind: 'plan',
          title: p.title,
          meta: t('employeeWorkspace.todoMetaLatePlan', { count: Math.abs(d) }),
          urgency: 'late',
          path: `/action-plans/${p.id}`,
        });
      } else if (d === 0) {
        items.push({
          id: `plan-${p.id}`,
          kind: 'plan',
          title: p.title,
          meta: t('employeeWorkspace.todoMetaTodayPlan'),
          urgency: 'today',
          path: `/action-plans/${p.id}`,
        });
      } else if (d <= 2) {
        items.push({
          id: `plan-${p.id}`,
          kind: 'plan',
          title: p.title,
          meta: t('employeeWorkspace.todoMetaSoonPlan', { count: d }),
          urgency: 'soon',
          path: `/action-plans/${p.id}`,
        });
      }
    }

    for (const a of activeAlerts.slice(0, 5)) {
      items.push({
        id: `alert-${a.id}`,
        kind: 'alert',
        title: `${a.defectType} / ${a.productionLine}`,
        meta: t('employeeWorkspace.todoMetaActiveAlert', {
          status: alertStatusLabel(a.status, t),
          z: Number(a.zScore ?? 0).toFixed(1),
        }),
        urgency: 'today',
        path: '/alerts',
      });
    }

    const rank = { late: 0, today: 1, soon: 2 };
    return items.sort((a, b) => rank[a.urgency] - rank[b.urgency]).slice(0, 8);
  }, [openClaims, activePlans, activeAlerts, t]);

  const nextActions = useMemo(() => {
    const items: NextAction[] = [];
    // Claims already listed in "to do today" are not repeated here.
    const coveredClaims = new Set<string>(
      todos.filter((item) => item.kind === 'claim').map((item) => item.id.replace(/^claim-/, '')),
    );

    for (const claim of claims) {
      const claimId = String(claim.id);
      const status = resolveClaimStatus(claim);
      const eightD = eightDByClaim[claimId];
      const eightDStatus = String(eightD?.statusCode || '').toUpperCase();
      const title =
        claim.title ||
        eightD?.claimTitle ||
        t('employeeWorkspace.claimFallback', { id: claimId.slice(0, 8) });
      const deadline = claimDeadline(claim);
      const due = formatActionDeadline(deadline, t, locale);
      const path = `/pages/front/quality-analyses/8d/${claimId}`;
      if (coveredClaims.has(claimId)) continue;

      if (status === 'REJECTED' || eightDStatus === 'REJECTED') {
        items.push({
          id: `rejected-claim-${claimId}`,
          title,
          actionType: t('employeeWorkspace.actionRejected'),
          deadline,
          deadlineLabel: due.label,
          sortDays: due.sortDays,
          path,
          tone: 'danger',
        });
        coveredClaims.add(claimId);
        continue;
      }

      if (status === 'CLOTUREE' || status === 'VALIDATED' || status === 'ARCHIVED') continue;
      if (status === 'PENDING_VALIDATION' || eightDStatus === 'PENDING_VALIDATION') continue;
      if (eightDStatus === 'VALIDATED' || eightDStatus === 'CLOSED') continue;

      const pendingStep = eightD?.steps?.find((s) => s.unlocked && !s.complete);
      if (pendingStep) {
        const stepCode = pendingStep.code || `D${pendingStep.step}`;
        const stepName = eightDStepLabel(stepCode, pendingStep.label || '', t);
        const stepLabel = stepName ? ` · ${stepName}` : '';
        items.push({
          id: `eight-d-${claimId}-${pendingStep.step}`,
          title,
          actionType: t('employeeWorkspace.actionEightD', { step: `${stepCode}${stepLabel}` }),
          deadline,
          deadlineLabel: due.label,
          sortDays: due.sortDays,
          path,
          tone: due.tone,
        });
        coveredClaims.add(claimId);
        continue;
      }

      if (!coveredClaims.has(claimId) && isClaimOpen(claim)) {
        items.push({
          id: `claim-${claimId}`,
          title,
          actionType: claimActionLabel(status, t),
          deadline,
          deadlineLabel: due.label,
          sortDays: due.sortDays,
          path,
          tone: due.tone,
        });
        coveredClaims.add(claimId);
      }
    }

    for (const plan of rejectedPlans) {
      const due = formatActionDeadline(plan.deadline, t, locale);
      items.push({
        id: `rejected-plan-${plan.id}`,
        title: plan.title,
        actionType: t('employeeWorkspace.actionRejectedPlan'),
        deadline: plan.deadline,
        deadlineLabel: due.label,
        sortDays: due.sortDays,
        path: `/pages/front/my-action-plans/${plan.id}`,
        tone: 'danger',
      });
    }

    return items
      .sort((a, b) => {
        if (a.sortDays !== b.sortDays) return a.sortDays - b.sortDays;
        return a.title.localeCompare(b.title, i18n.language);
      })
      .slice(0, 12);
  }, [claims, eightDByClaim, rejectedPlans, todos, t, locale, i18n.language]);

  const firstName = useMemo(() => {
    const raw = String(displayName || '').trim();
    if (!raw) return 'Collaborateur';
    return raw.split(/[\s@._-]+/)[0] || 'Collaborateur';
  }, [displayName]);

  const welcomeSummary = useMemo(() => {
    if (loading) return t('employeeWorkspace.summaryLoading');

    const overdue = stats.enRetard;

    const rejectedReports =
      rejectedPlans.length +
      claims.filter((c) => {
        const s = resolveClaimStatus(c);
        const eightD = eightDByClaim[String(c.id)];
        const eightDStatus = String(eightD?.statusCode || '').toUpperCase();
        return s === 'REJECTED' || eightDStatus === 'REJECTED';
      }).length;

    const pendingReports = claims.filter((c) => {
      const s = resolveClaimStatus(c);
      const eightD = eightDByClaim[String(c.id)];
      const eightDStatus = String(eightD?.statusCode || '').toUpperCase();
      return s === 'PENDING_VALIDATION' || eightDStatus === 'PENDING_VALIDATION';
    }).length;

    const dueToday =
      openClaims.filter((c) => daysUntil(claimDeadline(c)) === 0).length +
      activePlans.filter((p) => daysUntil(p.deadline) === 0).length;

    const parts: string[] = [];
    if (overdue > 0) {
      parts.push(t('employeeWorkspace.overdue', { count: overdue }));
    }
    if (rejectedReports > 0) {
      parts.push(t('employeeWorkspace.rejected', { count: rejectedReports }));
    }
    if (pendingReports > 0) {
      parts.push(t('employeeWorkspace.pending', { count: pendingReports }));
    }
    if (dueToday > 0 && parts.length < 3) {
      parts.push(t('employeeWorkspace.dueToday', { count: dueToday }));
    }

    if (parts.length === 0) return t('employeeWorkspace.summaryClear');
    return parts.slice(0, 3).join(', ');
  }, [
    loading,
    stats.enRetard,
    openClaims,
    activePlans,
    rejectedPlans.length,
    claims,
    eightDByClaim,
    t,
  ]);

  const welcomeIsClear = welcomeSummary === t('employeeWorkspace.summaryClear');

  const closureTrend = useMemo(() => {
    type WorkItem = { created: Date; completed: Date | null };
    const items: WorkItem[] = [];

    for (const c of claims) {
      const created = parseDate(c.createdAt);
      if (!created) continue;
      const status = resolveClaimStatus(c);
      const closed = status === 'CLOTUREE' || status === 'VALIDATED';
      const completed = closed
        ? parseDate(c.completedAt || c.updatedAt || c.createdAt)
        : null;
      items.push({ created, completed });
    }

    for (const p of plans) {
      const created = parseDate(p.createdAt);
      if (!created) continue;
      const closed = isPlanClosed(p);
      const completed = closed ? parseDate(p.completedAt || p.createdAt) : null;
      items.push({ created, completed });
    }

    const thisWeek = startOfWeekMonday(new Date());
    const points: TrendPoint[] = [];

    for (let i = 7; i >= 0; i -= 1) {
      const weekStart = new Date(thisWeek);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const known = items.filter((it) => it.created.getTime() < weekEnd.getTime());
      let rate: number | null = null;
      if (known.length > 0) {
        const closedByThen = known.filter(
          (it) => it.completed != null && it.completed.getTime() < weekEnd.getTime()
        ).length;
        rate = Math.round((closedByThen / known.length) * 100);
      }

      points.push({
        key: weekStart.toISOString().slice(0, 10),
        label: weekStart.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        rate,
      });
    }

    return points;
  }, [claims, plans, locale]);

  const trendChartData = useMemo(
    () =>
      closureTrend.map((p) => ({
        ...p,
        rate: p.rate ?? 0,
        hasData: p.rate != null,
      })),
    [closureTrend]
  );

  const latestClosureRate = useMemo(() => {
    for (let i = closureTrend.length - 1; i >= 0; i -= 1) {
      if (closureTrend[i].rate != null) return closureTrend[i].rate as number;
    }
    return null;
  }, [closureTrend]);

  const closureDelta = useMemo(() => {
    const rates = closureTrend.map((p) => p.rate).filter((r): r is number => r != null);
    if (rates.length < 2) return null;
    return rates[rates.length - 1] - rates[rates.length - 2];
  }, [closureTrend]);

  const [deltaTipOpen, setDeltaTipOpen] = useState(false);

  const openTodo = (item: TodoItem) => navigate(item.path);

  return (
    <div className="fwh-page">
      <div className="fwh-inner">
        <header className="fwh-top">
          <div className="fwh-welcome">
            <p className="fwh-kicker">{t('employeeWorkspace.kicker')}</p>
            <h1>
              {t('employeeWorkspace.hello', { name: firstName })}
              <span className="fwh-welcome-sep"> — </span>
              <span className={`fwh-welcome-summary${welcomeIsClear ? ' ok' : ''}`}>
                {welcomeSummary}
              </span>
            </h1>
            <p className="fwh-sub">{t('employeeWorkspace.subtitle')}</p>
          </div>
          <button type="button" className="fwh-refresh" onClick={() => void load()} disabled={loading}>
            {t('employeeWorkspace.refresh')}
          </button>
        </header>

        <section className="fwh-trend" aria-label={t('employeeWorkspace.trendAria')}>
          <div className="fwh-trend-score">
            <span className="fwh-trend-label">{t('employeeWorkspace.closureRate')}</span>
            <div className="fwh-trend-score-row">
              <strong className="fwh-trend-value">
                {loading || latestClosureRate == null ? '—' : `${latestClosureRate}%`}
              </strong>
              {!loading && closureDelta != null && (
                <span className="fwh-trend-delta-wrap">
                  <span
                    className={`fwh-trend-delta${
                      closureDelta > 0 ? ' up' : closureDelta < 0 ? ' down' : ' flat'
                    }`}
                  >
                    {t('employeeWorkspace.deltaPts', {
                      value: `${closureDelta > 0 ? '+' : ''}${closureDelta}`,
                    })}
                  </span>
                  <button
                    type="button"
                    className={`fwh-trend-tip-btn${deltaTipOpen ? ' open' : ''}`}
                    aria-label={t('employeeWorkspace.deltaTipAria')}
                    aria-expanded={deltaTipOpen}
                    aria-controls="fwh-delta-tip"
                    onClick={() => setDeltaTipOpen((v) => !v)}
                    onBlur={() => setDeltaTipOpen(false)}
                  >
                    ?
                  </button>
                  {deltaTipOpen && (
                    <div id="fwh-delta-tip" className="fwh-trend-tip" role="tooltip">
                      {t('employeeWorkspace.deltaTip')}
                    </div>
                  )}
                </span>
              )}
            </div>
            <p className="fwh-trend-hint">{t('employeeWorkspace.trendHint')}</p>
          </div>

          <div className="fwh-trend-chart">
            {loading ? (
              <div className="fwh-trend-skel" aria-hidden />
            ) : (
              <ResponsiveContainer width="100%" height={88}>
                <LineChart data={trendChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <Tooltip
                    formatter={(value, _name, item) => {
                      const hasData = Boolean((item as { payload?: { hasData?: boolean } })?.payload?.hasData);
                      const num = typeof value === 'number' ? value : Number(value);
                      return [hasData && Number.isFinite(num) ? `${num}%` : '—', t('employeeWorkspace.closure')];
                    }}
                    labelFormatter={(label) => t('employeeWorkspace.weekOf', { label: String(label) })}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      boxShadow: 'none',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#000168"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#000168', strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: '#000168' }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <button
            type="button"
            className="fwh-trend-cta"
            onClick={() => navigate('/competences')}
          >
            {t('employeeWorkspace.seeDetail')}
          </button>
        </section>

        <section className="fwh-stats" aria-label={t('employeeWorkspace.kpisAria')}>
          {kpiCards.map((kpi) =>
            kpi.path ? (
              <button
                key={kpi.key}
                type="button"
                className={`fwh-stat is-link tone-${kpi.tone}`}
                onClick={() => navigate(kpi.path!)}
              >
                <span className="fwh-stat-label">{kpi.label}</span>
                <strong className="fwh-stat-value">{loading ? '—' : kpi.value}</strong>
                <span className="fwh-stat-hint">{kpi.hint}</span>
              </button>
            ) : (
              <article key={kpi.key} className={`fwh-stat tone-${kpi.tone}`}>
                <span className="fwh-stat-label">{kpi.label}</span>
                <strong className="fwh-stat-value">{loading ? '—' : kpi.value}</strong>
                <span className="fwh-stat-hint">{kpi.hint}</span>
              </article>
            )
          )}
        </section>

        <section className="fwh-banner" aria-labelledby="fwh-todo-title">
          <div className="fwh-banner-head">
            <div>
              <h2 id="fwh-todo-title">{t('employeeWorkspace.todoTitle')}</h2>
              <p>
                {loading
                  ? t('employeeWorkspace.todoLoading')
                  : todos.length === 0
                    ? t('employeeWorkspace.todoNone')
                    : t('employeeWorkspace.todoCount', { count: todos.length })}
              </p>
            </div>
            <div className="fwh-banner-tags">
              {stats.enRetard > 0 && (
                <span className="fwh-pill late">
                  {t('employeeWorkspace.late', {
                    count: stats.enRetard,
                  })}
                </span>
              )}
              {todos.filter((item) => item.urgency === 'today').length > 0 && (
                <span className="fwh-pill today">
                  {t('employeeWorkspace.todayCount', {
                    count: todos.filter((item) => item.urgency === 'today').length,
                  })}
                </span>
              )}
            </div>
          </div>

          {loading ? (
            <div className="fwh-todo-skel" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="fwh-skel-row" />
              ))}
            </div>
          ) : todos.length === 0 ? (
            <div className="fwh-empty">{t('employeeWorkspace.todoEmpty')}</div>
          ) : (
            <ul className="fwh-todo-list">
              {todos.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`fwh-todo ${item.urgency}`} onClick={() => openTodo(item)}>
                    <span className={`fwh-todo-badge ${item.kind}`}>
                      {item.kind === 'claim'
                        ? t('employeeWorkspace.kindClaim')
                        : item.kind === 'plan'
                          ? t('employeeWorkspace.kindPlan')
                          : t('employeeWorkspace.kindAlert')}
                    </span>
                    <span className="fwh-todo-body">
                      <span className="fwh-todo-title">{item.title}</span>
                      <span className="fwh-todo-meta">{item.meta}</span>
                    </span>
                    <span className={`fwh-todo-flag ${item.urgency}`}>
                      {item.urgency === 'late'
                        ? t('employeeWorkspace.flagLate')
                        : item.urgency === 'today'
                          ? t('employeeWorkspace.flagToday')
                          : t('employeeWorkspace.flagSoon')}
                    </span>
                    <span className="fwh-todo-chev" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="fwh-next" aria-labelledby="fwh-next-title">
          <div className="fwh-next-head">
            <div>
              <h2 id="fwh-next-title">{t('employeeWorkspace.nextTitle')}</h2>
              <p>{t('employeeWorkspace.nextSub')}</p>
            </div>
            {!loading && nextActions.length > 0 && (
              <span className="fwh-pill info">
                {t('employeeWorkspace.actionsCount', { count: nextActions.length })}
              </span>
            )}
          </div>

          {loading ? (
            <div className="fwh-todo-skel" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="fwh-skel-row" />
              ))}
            </div>
          ) : nextActions.length === 0 ? (
            <div className="fwh-empty soft">{t('employeeWorkspace.nextEmpty')}</div>
          ) : (
            <ul className="fwh-next-list">
              {nextActions.map((item) => (
                <li key={item.id} className={`fwh-next-row tone-${item.tone}`}>
                  <div className="fwh-next-main">
                    <span className="fwh-next-title">{item.title}</span>
                    <span className="fwh-next-type">{item.actionType}</span>
                  </div>
                  <span className={`fwh-next-due tone-${item.tone}`}>{item.deadlineLabel}</span>
                  <button type="button" className="fwh-next-open" onClick={() => navigate(item.path)}>
                    {t('employeeWorkspace.open')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="fwh-quick">
            <button type="button" onClick={() => navigate('/pages/front/my-claims')}>
              {t('employeeWorkspace.quickClaims')}
            </button>
            <button type="button" onClick={() => navigate('/action-plans')}>
              {t('employeeWorkspace.quickPlans')}
            </button>
            <button type="button" onClick={() => navigate('/competences')}>
              {t('employeeWorkspace.quickCompetences')}
            </button>
            <button type="button" onClick={() => navigate('/badges')}>
              {t('employeeWorkspace.quickBadges')}
            </button>
            <button type="button" onClick={() => navigate('/documents')}>
              {t('employeeWorkspace.quickDocuments')}
            </button>
            <button type="button" onClick={() => navigate('/pages/front/action-plans/calendar')}>
              {t('employeeWorkspace.quickCalendar')}
            </button>
          </div>
        </section>

        <section className="fwh-next fwh-recent" aria-labelledby="fwh-recent-title">
          <div className="fwh-next-head">
            <div>
              <h2 id="fwh-recent-title">{t('employeeWorkspace.recentTitle')}</h2>
              <p>{t('employeeWorkspace.recentSub')}</p>
            </div>
          </div>
          <div className="fwh-recent-grid">
            <div>
              <h3>{t('employeeWorkspace.recentDocuments')}</h3>
              {recentDocuments.length === 0 ? (
                <div className="fwh-empty soft">{t('employeeWorkspace.recentNoDocuments')}</div>
              ) : (
                <ul className="fwh-next-list">
                  {recentDocuments.map((d) => (
                    <li key={d.id} className="fwh-next-row tone-navy">
                      <div className="fwh-next-main">
                        <span className="fwh-next-title">{d.name}</span>
                        <span className="fwh-next-type">
                          {d.type} · {formatShortDate(d.createdAt, locale)}
                        </span>
                      </div>
                      <button type="button" className="fwh-next-open" onClick={() => navigate('/documents')}>
                        {t('employeeWorkspace.open')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>{t('employeeWorkspace.recentBadges')}</h3>
              {recentBadges.length === 0 ? (
                <div className="fwh-empty soft">{t('employeeWorkspace.recentNoBadges')}</div>
              ) : (
                <ul className="fwh-next-list">
                  {recentBadges.map((b) => (
                    <li key={b.id} className="fwh-next-row tone-navy">
                      <BadgeEmblem icon={badgeIcon(b)} size={30} />
                      <div className="fwh-next-main">
                        <span className="fwh-next-title">{b.name}</span>
                        <span className="fwh-next-type">{formatShortDate(b.earnedAt, locale)}</span>
                      </div>
                      <button type="button" className="fwh-next-open" onClick={() => navigate('/badges')}>
                        {t('employeeWorkspace.open')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Catalog icon for a stored badge (matched on category or name), the award icon otherwise. */
function badgeIcon(b: WorkspaceBadge) {
  const key = (v?: string) => String(v || '').toLowerCase();
  const def = BADGE_DEFINITIONS.find(
    (d) => key(d.id) === key(b.category) || key(d.name) === key(b.name),
  );
  return def?.icon ?? Award;
}

function formatShortDate(iso: string | undefined, locale: string): string {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}
