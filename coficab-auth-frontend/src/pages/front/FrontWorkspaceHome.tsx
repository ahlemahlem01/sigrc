import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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
import { STALE_DAYS } from '../../utils/workspaceStats';
import { useNotifications } from '../../hooks/useNotifications';
import { usePins } from '../../hooks/usePins';
import WorkspaceExtras, { PinStar } from '../../components/employee/WorkspaceExtras';

import { Award } from 'lucide-react';
import BadgeEmblem from '../../components/BadgeEmblem';
import { BADGE_DEFINITIONS } from '../../utils/badges';
import './FrontWorkspaceHome.styles.css';
import { defectLabel } from '../../utils/defectLabel';

/** Notifications that tell the employee about a decision taken on one of their files. */
const DECISION_TYPES = new Set([
  'plan_validated', 'plan_rejected', 'fivewhy_validated', 'fivewhy_rejected', 'eight_d_validated', 'eight_d_rejected',
  'action_validated', 'action_warning', 'alert_report_validated', 'alert_report_rejected', 'claim_assigned', 'claim_approved', 'claim_returned',
  'claim_deadline_extended', 'plan_deadline_extended',
]);
const PIPELINE_STEPS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'];

type TFunc = (key: string, options?: Record<string, unknown>) => string;

function dateLocale(lang: string): string {
  if (lang.startsWith('en')) return 'en-GB';
  if (lang.startsWith('it')) return 'it-IT';
  return 'fr-FR';
}

interface AssignedPlan {
  id: string;
  reference?: string;
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

interface KpiCard {
  key: string;
  label: string;
  value: string | number;
  hint: string;
  tone: 'navy' | 'danger' | 'warn' | 'ok' | 'info';
  path?: string;
}

const SHOWN_BY_DEFAULT = 6;

type Bucket = 'redo' | 'overdue' | 'today' | 'week' | 'later' | 'none' | 'validation' | 'stale';
type PriorityFilter = 'all' | 'overdue' | 'week' | 'validation' | 'stale';

const BUCKET_RANK: Record<Bucket, number> = { redo: 0, overdue: 1, today: 2, week: 3, none: 4, later: 5, validation: 6, stale: 7 };

/** One thing the employee has to deal with: a claim (with its next 8D step), a plan, a rejected report or an alert. */
interface Priority {
  id: string;
  kind: 'claim' | 'plan' | 'alert';
  title: string;
  ref?: string;
  action: string;
  due: string;
  days: number | null;
  bucket: Bucket;
  hasStep?: boolean;
  path: string;
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
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const { pins, toggle: togglePin } = usePins((user as any)?.id || (user as any)?.userId || (user as any)?.email);

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
        reference: p.reference ?? p.Reference ?? undefined,
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
      setUpdatedAt(new Date());
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
  const activePlans = useMemo(
    () => plans.filter((p) => p.status !== 3 && p.status !== 4 && (p.progress ?? 0) < 100),
    [plans]
  );

  const [filter, setFilter] = useState<PriorityFilter>('all');
  const [showAll, setShowAll] = useState(false);

  /** One merged list: each claim appears once (with its pending 8D step), then plans, rejected plans and alerts. */
  const priorities = useMemo(() => {
    const items: Priority[] = [];
    const bucketOf = (days: number | null): Bucket => {
      if (days == null) return 'none';
      if (days < -STALE_DAYS) return 'stale';
      if (days < 0) return 'overdue';
      if (days === 0) return 'today';
      if (days <= 7) return 'week';
      return 'later';
    };

    for (const claim of claims) {
      const claimId = String(claim.id);
      const status = resolveClaimStatus(claim);
      if (status === 'CLOTUREE' || status === 'VALIDATED' || status === 'ARCHIVED') continue;
      const eightD = eightDByClaim[claimId];
      const eightDStatus = String(eightD?.statusCode || '').toUpperCase();
      if (eightDStatus === 'VALIDATED' || eightDStatus === 'CLOSED') continue;

      const title =
        claim.title || eightD?.claimTitle || t('employeeWorkspace.claimFallback', { id: claimId.slice(0, 8) });
      const deadline = claimDeadline(claim);
      const days = daysUntil(deadline);
      const due = formatActionDeadline(deadline, t, locale);
      const path = `/pages/front/quality-analyses/8d/${claimId}`;
      const base = { id: `claim-${claimId}`, kind: 'claim' as const, title, ref: (claim as any).reference || undefined, due: due.label, days, path };

      if (status === 'REJECTED' || eightDStatus === 'REJECTED') {
        items.push({ ...base, action: t('employeeWorkspace.actionRejected'), bucket: 'redo' });
        continue;
      }
      if (status === 'PENDING_VALIDATION' || eightDStatus === 'PENDING_VALIDATION') {
        items.push({ ...base, action: t('employeeWorkspace.waitingValidation'), bucket: 'validation' });
        continue;
      }
      const pendingStep = eightD?.steps?.find((s) => s.unlocked && !s.complete);
      let action = claimActionLabel(status, t);
      if (pendingStep) {
        const stepCode = pendingStep.code || `D${pendingStep.step}`;
        const stepName = eightDStepLabel(stepCode, pendingStep.label || '', t);
        action = t('employeeWorkspace.actionEightD', { step: `${stepCode}${stepName ? ` · ${stepName}` : ''}` });
      } else if (status) {
        action = `${claimActionLabel(status, t)}`;
      }
      items.push({ ...base, action, bucket: bucketOf(days), hasStep: Boolean(pendingStep) });
    }

    for (const plan of activePlans) {
      if (!plan.deadline) continue;
      const days = daysUntil(plan.deadline);
      items.push({
        id: `plan-${plan.id}`,
        kind: 'plan',
        title: plan.title,
        ref: plan.reference,
        action: t('employeeWorkspace.planAction', { progress: Math.round(plan.progress ?? 0) }),
        due: formatActionDeadline(plan.deadline, t, locale).label,
        days,
        bucket: bucketOf(days),
        path: `/action-plans/${plan.id}`,
      });
    }

    for (const plan of rejectedPlans) {
      items.push({
        id: `rejected-plan-${plan.id}`,
        kind: 'plan',
        title: plan.title,
        ref: plan.reference,
        action: t('employeeWorkspace.actionRejectedPlan'),
        due: formatActionDeadline(plan.deadline, t, locale).label,
        days: daysUntil(plan.deadline),
        bucket: 'redo',
        path: `/pages/front/my-action-plans/${plan.id}`,
      });
    }

    for (const alert of activeAlerts.slice(0, 5)) {
      items.push({
        id: `alert-${alert.id}`,
        kind: 'alert',
        title: `${defectLabel(alert.defectType)} / ${alert.productionLine}`,
        action: t('employeeWorkspace.todoMetaActiveAlert', {
          status: alertStatusLabel(alert.status, t),
          z: Number(alert.zScore ?? 0).toFixed(1),
        }),
        due: '',
        days: 0,
        bucket: 'today',
        path: '/alerts',
      });
    }
    return items;
  }, [claims, eightDByClaim, activePlans, rejectedPlans, activeAlerts, t, locale]);

  const counts = useMemo(() => {
    const of = (...b: Bucket[]) => priorities.filter((p) => b.includes(p.bucket)).length;
    return {
      overdue: of('overdue', 'stale'),
      week: of('today', 'week'),
      today: of('today'),
      validation: of('validation'),
      redo: of('redo'),
      stale: of('stale'),
    };
  }, [priorities]);

  const listed = useMemo(() => {
    const keep = (p: Priority) => {
      if (filter === 'overdue') return p.bucket === 'overdue' || p.bucket === 'stale';
      if (filter === 'week') return p.bucket === 'today' || p.bucket === 'week';
      if (filter === 'validation') return p.bucket === 'validation';
      if (filter === 'stale') return p.bucket === 'stale';
      return p.bucket !== 'validation' && p.bucket !== 'stale';
    };
    return priorities
      .filter(keep)
      .sort(
        (a, b) =>
          BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
          (a.days ?? Number.POSITIVE_INFINITY) - (b.days ?? Number.POSITIVE_INFINITY) ||
          a.title.localeCompare(b.title, i18n.language)
      );
  }, [priorities, filter, i18n.language]);
  const shown = showAll ? listed : listed.slice(0, SHOWN_BY_DEFAULT);

  const pickFilter = (next: PriorityFilter) => {
    setFilter((current) => (current === next ? 'all' : next));
    setShowAll(false);
    window.requestAnimationFrame(() =>
      document.getElementById('fwh-todo-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  // what was closed and when: drives the weekly chart and the "closed in 30 days" card
  const closedDates = useMemo(() => {
    const dates: Date[] = [];
    for (const c of claims) {
      const s = resolveClaimStatus(c);
      if (s !== 'CLOTUREE' && s !== 'VALIDATED') continue;
      const d = parseDate(c.completedAt || c.updatedAt);
      if (d) dates.push(d);
    }
    for (const p of plans) {
      if (!isPlanClosed(p)) continue;
      const d = parseDate(p.completedAt);
      if (d) dates.push(d);
    }
    return dates;
  }, [claims, plans]);

  const weeklyClosed = useMemo(() => {
    const thisWeek = startOfWeekMonday(new Date());
    const points: { key: string; label: string; count: number }[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      points.push({
        key: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
        count: closedDates.filter((d) => d >= start && d < end).length,
      });
    }
    return points;
  }, [closedDates, locale]);
  const closedInEightWeeks = weeklyClosed.reduce((sum, p) => sum + p.count, 0);

  const closed30 = useMemo(() => {
    const now = Date.now();
    const day = 86_400_000;
    const last = closedDates.filter((d) => now - d.getTime() <= 30 * day && d.getTime() <= now).length;
    const before = closedDates.filter((d) => now - d.getTime() > 30 * day && now - d.getTime() <= 60 * day).length;
    return { last, before };
  }, [closedDates]);

  const avgPlanProgress = useMemo(
    () => (activePlans.length ? Math.round(activePlans.reduce((sum, p) => sum + (p.progress ?? 0), 0) / activePlans.length) : 0),
    [activePlans]
  );

  const kpiCards = useMemo<KpiCard[]>(() => {
    const claimsLate = priorities.filter((p) => p.kind === 'claim' && (p.bucket === 'overdue' || p.bucket === 'stale')).length;
    const stepsTodo = priorities.filter((p) => p.hasStep);
    const stepsLate = stepsTodo.filter((p) => p.bucket === 'overdue' || p.bucket === 'stale').length;
    const delta = closed30.last - closed30.before;
    return [
      {
        key: 'claims',
        label: t('employeeWorkspace.kpiOpenClaims'),
        value: openClaims.length,
        hint: t('employeeWorkspace.kpiOpenClaimsHint', { count: claimsLate }),
        tone: claimsLate > 0 ? 'danger' : 'info',
        path: '/pages/front/my-claims',
      },
      {
        key: 'plans',
        label: t('employeeWorkspace.kpiPlans'),
        value: activePlans.length,
        hint: t('employeeWorkspace.kpiPlansAvg', { value: avgPlanProgress }),
        tone: 'navy',
        path: '/action-plans',
      },
      {
        key: 'steps',
        label: t('employeeWorkspace.kpiSteps'),
        value: stepsTodo.length,
        hint: t('employeeWorkspace.kpiStepsHint', { count: stepsLate }),
        tone: stepsLate > 0 ? 'warn' : 'ok',
        path: '/eight-d',
      },
      {
        key: 'closed',
        label: t('employeeWorkspace.kpiClosed'),
        value: closed30.last,
        hint: t('employeeWorkspace.kpiClosedHint', { delta: `${delta > 0 ? '+' : ''}${delta}` }),
        tone: delta >= 0 ? 'ok' : 'warn',
        path: '/competences',
      },
    ];
  }, [priorities, openClaims.length, activePlans.length, avgPlanProgress, closed30, t]);

  const { notifications } = useNotifications();

  /** The next seven days, day by day: claims and 8D steps, plans and their open sub-actions. */
  const agenda = useMemo(() => {
    type Entry = { id: string; kind: 'claim' | 'plan' | 'action'; title: string; ref?: string; sub: string; path: string };
    const byDay = new Map<number, Entry[]>();
    const push = (day: number, entry: Entry) => byDay.set(day, [...(byDay.get(day) ?? []), entry]);
    for (const p of priorities) {
      if (p.kind === 'alert' || p.days == null || p.days < 0 || p.days > 6) continue;
      if (p.bucket !== 'today' && p.bucket !== 'week') continue;
      push(p.days, { id: p.id, kind: p.kind, title: p.title, ref: p.ref, sub: p.action, path: p.path });
    }
    const planById = new Map(plans.map((pl) => [pl.id, pl]));
    for (const a of actions) {
      if (a.progress >= 100) continue;
      const days = daysUntil(a.deadline);
      const plan = planById.get(a.planId);
      if (days == null || days < 0 || days > 6 || !plan || isPlanClosed(plan)) continue;
      push(days, { id: `action-${a.id}`, kind: 'action', title: plan.title, ref: plan.reference, sub: t('employeeWorkspace.agendaAction'), path: `/action-plans/${plan.id}` });
    }
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([day, entries]) => {
        const date = new Date(base);
        date.setDate(date.getDate() + day);
        const label =
          day === 0 ? t('employeeWorkspace.today') : day === 1 ? t('employeeWorkspace.tomorrow')
            : date.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'short' });
        return { day, label, entries };
      });
  }, [priorities, plans, actions, locale, t]);
  const agendaCount = agenda.reduce((sum, g) => sum + g.entries.length, 0);

  /** The three plans to move forward first: the ones whose deadline comes first. */
  const nextPlans = useMemo(
    () =>
      [...activePlans]
        .sort((a, b) => (daysUntil(a.deadline) ?? Number.POSITIVE_INFINITY) - (daysUntil(b.deadline) ?? Number.POSITIVE_INFINITY))
        .slice(0, 3),
    [activePlans]
  );

  /** Where my open 8D files stand: how many are waiting at each step. */
  const pipeline = useMemo(() => {
    const perStep: Record<string, number> = {};
    for (const claim of claims) {
      const status = resolveClaimStatus(claim);
      if (status === 'CLOTUREE' || status === 'VALIDATED' || status === 'ARCHIVED' || status === 'REJECTED' || status === 'PENDING_VALIDATION') continue;
      const dossier = eightDByClaim[String(claim.id)];
      const dStatus = String(dossier?.statusCode || '').toUpperCase();
      if (dStatus === 'VALIDATED' || dStatus === 'CLOSED' || dStatus === 'REJECTED' || dStatus === 'PENDING_VALIDATION') continue;
      const pending = dossier?.steps?.find((s) => s.unlocked && !s.complete);
      if (pending) {
        const code = pending.code || `D${pending.step}`;
        perStep[code] = (perStep[code] ?? 0) + 1;
      }
    }
    const max = Math.max(1, ...PIPELINE_STEPS.map((c) => perStep[c] ?? 0));
    const total = PIPELINE_STEPS.reduce((sum, c) => sum + (perStep[c] ?? 0), 0);
    return { perStep, max, total };
  }, [claims, eightDByClaim]);

  /** The file the employee worked on last, to pick it up again in one click. */
  const resume = useMemo(() => {
    const candidates = claims
      .filter((c) => {
        const s = resolveClaimStatus(c);
        const d = eightDByClaim[String(c.id)];
        return isClaimOpen(c) && s !== 'PENDING_VALIDATION' && !!d?.steps?.some((st) => st.unlocked && !st.complete);
      })
      .sort((a, b) => new Date((b as any).updatedAt || b.createdAt || 0).getTime() - new Date((a as any).updatedAt || a.createdAt || 0).getTime());
    const c = candidates[0];
    return c ? { title: c.title || '', path: `/pages/front/quality-analyses/8d/${c.id}` } : null;
  }, [claims, eightDByClaim]);

  const decisions = useMemo(
    () =>
      notifications
        .filter((n) => DECISION_TYPES.has(n.type))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [notifications]
  );

  /** The priorities list as a CSV file (semicolon-separated and with a BOM, so Excel opens it with the accents right). */
  const exportCsv = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const kindLabel = (k: Priority['kind']) =>
      k === 'claim' ? t('employeeWorkspace.kindClaim') : k === 'plan' ? t('employeeWorkspace.kindPlan') : t('employeeWorkspace.kindAlert');
    const head = [t('employeeWorkspace.csvType'), t('employeeWorkspace.csvRef'), t('employeeWorkspace.csvTitle'), t('employeeWorkspace.csvAction'), t('employeeWorkspace.csvDue'), t('employeeWorkspace.csvState')];
    const lines = [head, ...listed.map((p) => [kindLabel(p.kind), p.ref ?? '', p.title, p.action, p.due, t(`employeeWorkspace.flag.${p.bucket}`)])];
    const blob = new Blob(['\ufeff' + lines.map((l) => l.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mes-priorites-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const firstName = useMemo(() => {
    const raw = String(displayName || '').trim();
    if (!raw) return 'Collaborateur';
    return raw.split(/[\s@._-]+/)[0] || 'Collaborateur';
  }, [displayName]);

  const welcomeSummary = useMemo(() => {
    if (loading) return t('employeeWorkspace.summaryLoading');
    const parts: string[] = [];
    if (counts.overdue > 0) parts.push(t('employeeWorkspace.overdue', { count: counts.overdue }));
    if (counts.redo > 0) parts.push(t('employeeWorkspace.rejected', { count: counts.redo }));
    if (counts.validation > 0) parts.push(t('employeeWorkspace.pending', { count: counts.validation }));
    if (counts.today > 0 && parts.length < 3) parts.push(t('employeeWorkspace.dueToday', { count: counts.today }));
    if (parts.length === 0) return t('employeeWorkspace.summaryClear');
    return parts.slice(0, 3).join(', ');
  }, [loading, counts, t]);

  const welcomeIsClear = welcomeSummary === t('employeeWorkspace.summaryClear');

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
          <div className="fwh-toolbar">
            <div className="fwh-top-actions">
              <button type="button" className="fwh-refresh primary" onClick={() => navigate('/pages/front/quality-analyses/new')}>
                + {t('employeeWorkspace.newClaim')}
              </button>
              {resume && (
                <button type="button" className="fwh-refresh" onClick={() => navigate(resume.path)} title={resume.title}>
                  {t('employeeWorkspace.resume8d')}
                </button>
              )}
              <button type="button" className="fwh-refresh" onClick={() => void load()} disabled={loading}>
                {t('employeeWorkspace.refresh')}
              </button>
              <button type="button" className="fwh-refresh" onClick={exportCsv} disabled={loading || listed.length === 0}>
                {t('employeeWorkspace.exportCsv')}
              </button>
            </div>
            {updatedAt && (
              <span className="fwh-updated">
                {t('employeeWorkspace.updatedAt', {
                  date: updatedAt.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
                  time: updatedAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
            )}
          </div>
        </header>

        <section className="fwh-trend fwh-hero" aria-label={t('employeeWorkspace.focusAria')}>
          <div className="fwh-trend-score">
            <span className="fwh-trend-label">{t('employeeWorkspace.focusTitle')}</span>
            <div className="fwh-focus">
              <button type="button" className={`fwh-focus-item late${filter === 'overdue' ? ' on' : ''}`} onClick={() => pickFilter('overdue')}>
                <strong>{loading ? '—' : counts.overdue}</strong>
                <span>{t('employeeWorkspace.focusOverdue')}</span>
              </button>
              <button type="button" className={`fwh-focus-item warn${filter === 'week' ? ' on' : ''}`} onClick={() => pickFilter('week')}>
                <strong>{loading ? '—' : counts.week}</strong>
                <span>{t('employeeWorkspace.focusWeek')}</span>
              </button>
              <button type="button" className={`fwh-focus-item info${filter === 'validation' ? ' on' : ''}`} onClick={() => pickFilter('validation')}>
                <strong>{loading ? '—' : counts.validation}</strong>
                <span>{t('employeeWorkspace.focusValidation')}</span>
              </button>
            </div>
          </div>

          <div className="fwh-hero-chart">
            <span className="fwh-trend-label">{t('employeeWorkspace.closedPerWeek')}</span>
            <div className="fwh-trend-chart">
              {loading ? (
                <div className="fwh-trend-skel" aria-hidden />
              ) : (
                <ResponsiveContainer width="100%" height={72}>
                  <BarChart data={weeklyClosed} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,1,104,0.06)' }}
                      formatter={(value) => [String(value), t('employeeWorkspace.closedShort')]}
                      labelFormatter={(label) => t('employeeWorkspace.weekOf', { label: String(label) })}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: 'none' }}
                    />
                    <Bar dataKey="count" fill="#000168" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <p className="fwh-trend-hint">{t('employeeWorkspace.closedInWeeks', { count: closedInEightWeeks })}</p>
          </div>

          <button type="button" className="fwh-trend-cta" onClick={() => navigate('/competences')}>
            {t('employeeWorkspace.seeDetail')}
          </button>
        </section>

        <section className="fwh-stats fwh-stats-4" aria-label={t('employeeWorkspace.kpisAria')}>
          {kpiCards.map((kpi) => (
            <button key={kpi.key} type="button" className={`fwh-stat is-link tone-${kpi.tone}`} onClick={() => navigate(kpi.path!)}>
              <span className="fwh-stat-label">{kpi.label}</span>
              <strong className="fwh-stat-value">{loading ? '—' : kpi.value}</strong>
              <span className="fwh-stat-hint">{kpi.hint}</span>
            </button>
          ))}
        </section>

        <div className="fwh-duo">
          <section className="fwh-card" aria-labelledby="fwh-agenda-title">
            <div className="fwh-card-head">
              <h2 id="fwh-agenda-title">{t('employeeWorkspace.agendaTitle')}</h2>
              <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/action-plans/calendar')}>
                {t('employeeWorkspace.quickCalendar')}
              </button>
            </div>
            <p className="fwh-card-sub">{t('employeeWorkspace.agendaSub')}</p>
            {loading ? (
              <div className="fwh-skel-row" aria-hidden />
            ) : agendaCount === 0 ? (
              <div className="fwh-empty soft">{t('employeeWorkspace.agendaEmpty')}</div>
            ) : (
              agenda.map((group) => (
                <div key={group.day} className="fwh-agenda-day">
                  <div className="fwh-agenda-label">{group.label}</div>
                  {group.entries.map((e) => (
                    <button key={e.id} type="button" className="fwh-agenda-item" onClick={() => navigate(e.path)}>
                      <span className={`fwh-todo-badge ${e.kind === 'claim' ? 'claim' : 'plan'}`}>
                        {e.kind === 'claim' ? t('employeeWorkspace.kindClaim') : t('employeeWorkspace.kindPlan')}
                      </span>
                      <span className="fwh-agenda-text">
                        <span className="fwh-todo-title">{e.ref && <span className="fwh-ref">{e.ref}</span>}{e.title}</span>
                        <span className="fwh-todo-meta">{e.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </section>

          <section className="fwh-card" aria-labelledby="fwh-plans-title">
            <div className="fwh-card-head">
              <h2 id="fwh-plans-title">{t('employeeWorkspace.plansTitle')}</h2>
              <button type="button" className="fwh-card-link" onClick={() => navigate('/action-plans')}>
                {t('employeeWorkspace.plansSeeAll', { count: activePlans.length })}
              </button>
            </div>
            <p className="fwh-card-sub">{t('employeeWorkspace.plansSub')}</p>
            {loading ? (
              <div className="fwh-skel-row" aria-hidden />
            ) : nextPlans.length === 0 ? (
              <div className="fwh-empty soft">{t('employeeWorkspace.plansEmpty')}</div>
            ) : (
              nextPlans.map((plan) => {
                const due = formatActionDeadline(plan.deadline, t, locale);
                const pct = Math.round(plan.progress ?? 0);
                return (
                  <button key={plan.id} type="button" className="fwh-mini-plan" onClick={() => navigate(`/action-plans/${plan.id}`)}>
                    <span className="fwh-todo-title">{plan.reference && <span className="fwh-ref">{plan.reference}</span>}{plan.title}</span>
                    <span className="fwh-mini-bar" aria-label={`${pct} %`}><i style={{ width: `${pct}%` }} /></span>
                    <span className="fwh-mini-meta">
                      <span>{pct}%</span>
                      <span className={`fwh-mini-due ${due.tone}`}>{due.label}</span>
                    </span>
                  </button>
                );
              })
            )}
          </section>
        </div>

        <section className="fwh-banner" aria-labelledby="fwh-todo-title">
          <div className="fwh-banner-head">
            <div>
              <h2 id="fwh-todo-title">{t('employeeWorkspace.prioTitle')}</h2>
              <p>
                {loading
                  ? t('employeeWorkspace.todoLoading')
                  : listed.length === 0
                    ? t('employeeWorkspace.todoNone')
                    : t(`employeeWorkspace.prioSub.${filter}`, { count: listed.length })}
              </p>
            </div>
            {filter !== 'all' && (
              <button type="button" className="fwh-next-open" onClick={() => pickFilter(filter)}>
                {t('employeeWorkspace.prioClear')}
              </button>
            )}
          </div>

          {loading ? (
            <div className="fwh-todo-skel" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="fwh-skel-row" />
              ))}
            </div>
          ) : listed.length === 0 ? (
            <div className="fwh-empty">{t('employeeWorkspace.todoEmpty')}</div>
          ) : (
            <ul className="fwh-todo-list">
              {shown.map((item) => {
                const tone = item.bucket === 'redo' || item.bucket === 'overdue' || item.bucket === 'stale' ? 'late' : item.bucket === 'today' ? 'today' : 'soon';
                return (
                  <li key={item.id} className="fwh-todo-li">
                    <button type="button" className={`fwh-todo ${tone}`} onClick={() => navigate(item.path)}>
                      <span className={`fwh-todo-badge ${item.kind}`}>
                        {item.kind === 'claim' ? t('employeeWorkspace.kindClaim') : item.kind === 'plan' ? t('employeeWorkspace.kindPlan') : t('employeeWorkspace.kindAlert')}
                      </span>
                      <span className="fwh-todo-body">
                        <span className="fwh-todo-title">{item.ref && <span className="fwh-ref">{item.ref}</span>}{item.title}</span>
                        <span className="fwh-todo-meta">{item.action}{item.due ? ` · ${item.due}` : ''}</span>
                      </span>
                      <span className={`fwh-todo-flag ${tone}`}>{t(`employeeWorkspace.flag.${item.bucket}`)}</span>
                      <span className="fwh-todo-chev" aria-hidden>›</span>
                    </button>
                    <PinStar pin={{ id: item.id, kind: item.kind, title: item.title, ref: item.ref, path: item.path }} pins={pins} onToggle={togglePin} />
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && listed.length > SHOWN_BY_DEFAULT && (
            <button type="button" className="fwh-show-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('employeeWorkspace.showLess') : t('employeeWorkspace.showAll', { count: listed.length })}
            </button>
          )}

          {!loading && filter === 'all' && counts.stale > 0 && (
            <div className="fwh-stale">
              <span>{t('employeeWorkspace.staleNote', { count: counts.stale, days: STALE_DAYS })}</span>
              <button type="button" className="fwh-next-open" onClick={() => pickFilter('stale')}>
                {t('employeeWorkspace.staleReview')}
              </button>
            </div>
          )}
        </section>

        <div className="fwh-duo">
          <section className="fwh-card" aria-labelledby="fwh-pipe-title">
            <div className="fwh-card-head">
              <h2 id="fwh-pipe-title">{t('employeeWorkspace.pipeTitle')}</h2>
              <button type="button" className="fwh-card-link" onClick={() => navigate('/eight-d')}>{t('employeeWorkspace.pipeSeeAll')}</button>
            </div>
            <p className="fwh-card-sub">{t('employeeWorkspace.pipeSub', { count: pipeline.total })}</p>
            {loading ? (
              <div className="fwh-skel-row" aria-hidden />
            ) : pipeline.total === 0 ? (
              <div className="fwh-empty soft">{t('employeeWorkspace.pipeEmpty')}</div>
            ) : (
              <div className="fwh-pipe" role="list">
                {PIPELINE_STEPS.map((code) => {
                  const n = pipeline.perStep[code] ?? 0;
                  return (
                    <button key={code} type="button" role="listitem" className={`fwh-pipe-col${n ? '' : ' empty'}`} onClick={() => navigate('/eight-d')}
                      title={`${code} · ${t(`employeeWorkspace.eightDStep.${code}`, { defaultValue: code })}`}>
                      <span className="fwh-pipe-n">{n}</span>
                      <span className="fwh-pipe-bar"><i style={{ height: `${Math.round((n / pipeline.max) * 100)}%` }} /></span>
                      <span className="fwh-pipe-code">{code}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && counts.validation + counts.redo > 0 && (
              <p className="fwh-pipe-foot">
                {counts.validation > 0 && <span>{t('employeeWorkspace.pipeWaiting', { count: counts.validation })}</span>}
                {counts.redo > 0 && <span className="redo">{t('employeeWorkspace.pipeRedo', { count: counts.redo })}</span>}
              </p>
            )}
          </section>

          <section className="fwh-card" aria-labelledby="fwh-decisions-title">
            <div className="fwh-card-head">
              <h2 id="fwh-decisions-title">{t('employeeWorkspace.decisionsTitle')}</h2>
            </div>
            <p className="fwh-card-sub">{t('employeeWorkspace.decisionsSub')}</p>
            {decisions.length === 0 ? (
              <div className="fwh-empty soft">{t('employeeWorkspace.decisionsEmpty')}</div>
            ) : (
              <ul className="fwh-decisions">
                {decisions.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="fwh-decision" onClick={() => n.linkPath && navigate(n.linkPath)} disabled={!n.linkPath}>
                      <span className="fwh-decision-head">
                        <strong>{n.title}</strong>
                        <span>{formatShortDate(n.createdAt, locale)}</span>
                      </span>
                      <span className="fwh-decision-msg">{n.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {accessToken && (
          <WorkspaceExtras accessToken={accessToken} assigned={claims} pins={pins} onTogglePin={togglePin} locale={locale} />
        )}

        <section className="fwh-next" aria-label={t('employeeWorkspace.quickAria')}>
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
