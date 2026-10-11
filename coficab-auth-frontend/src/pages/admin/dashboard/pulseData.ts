import type { MonthlyOpenClosed } from '../../../types/dashboardSummary';

export interface PulseMetric {
  total: number;
  claims: number;
  actions: number;
  trend: number[];
  deltaPercent: number;
}

export interface PulseData {
  opened: PulseMetric;
  closed: PulseMetric;
  netLoad: {
    total: number;
    claims: number;
    actions: number;
    trend: number[];
  };
  closureRate: number;
  /** Variation absolue de charge nette (curr − prev) pour le badge santé */
  backlogDelta: number;
  scope: PulseScope;
}

export type PulsePeriod = 'month' | '3m' | '6m';
export type PulseScope = 'all' | 'claims' | 'plans';

export type HealthStatus = 'healthy' | 'watch' | 'critical';

export type HealthResult = {
  status: HealthStatus;
  labelKey: string;
  color: string;
  bg: string;
};

/**
 * Sain si closureRate > 80% ET backlog en baisse
 * À surveiller si closureRate 60–80% OU backlog stable
 * Critique si closureRate < 60% OU backlog en hausse forte
 */
export function getHealthStatus(stats: {
  closureRate: number;
  backlogDelta: number;
}): HealthResult {
  const { closureRate, backlogDelta } = stats;
  const backlogDown = backlogDelta < -2;
  const backlogUpStrong = backlogDelta > 5;
  const backlogStable = Math.abs(backlogDelta) <= 2;

  if (closureRate < 60 || backlogUpStrong) {
    return {
      status: 'critical',
      labelKey: 'adminDashboard.pulse.healthCritical',
      color: '#b91c1c',
      bg: '#fef2f2',
    };
  }
  if (closureRate > 80 && backlogDown) {
    return {
      status: 'healthy',
      labelKey: 'adminDashboard.pulse.healthHealthy',
      color: '#0f766e',
      bg: '#f0fdfa',
    };
  }
  if ((closureRate >= 60 && closureRate <= 80) || backlogStable) {
    return {
      status: 'watch',
      labelKey: 'adminDashboard.pulse.healthWatch',
      color: '#a16207',
      bg: '#fefce8',
    };
  }
  return {
    status: 'watch',
    labelKey: 'adminDashboard.pulse.healthWatch',
    color: '#a16207',
    bg: '#fefce8',
  };
}

type MonthAgg = {
  month: string;
  claimsOpened: number;
  claimsClosed: number;
  actionsOpened: number;
  actionsClosed: number;
};

function mergeMonthly(
  claims?: MonthlyOpenClosed[] | null,
  plans?: MonthlyOpenClosed[] | null,
): MonthAgg[] {
  const map = new Map<string, MonthAgg>();
  const ensure = (m: string) => {
    if (!map.has(m)) {
      map.set(m, {
        month: m,
        claimsOpened: 0,
        claimsClosed: 0,
        actionsOpened: 0,
        actionsClosed: 0,
      });
    }
    return map.get(m)!;
  };
  (claims ?? []).forEach((r) => {
    const a = ensure(r.month);
    a.claimsOpened = r.opened;
    a.claimsClosed = r.closed;
  });
  (plans ?? []).forEach((r) => {
    const a = ensure(r.month);
    a.actionsOpened = r.opened;
    a.actionsClosed = r.closed;
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function sumSlice(rows: MonthAgg[], start: number, end: number) {
  const slice = rows.slice(start, end);
  return {
    claimsOpened: slice.reduce((s, r) => s + r.claimsOpened, 0),
    claimsClosed: slice.reduce((s, r) => s + r.claimsClosed, 0),
    actionsOpened: slice.reduce((s, r) => s + r.actionsOpened, 0),
    actionsClosed: slice.reduce((s, r) => s + r.actionsClosed, 0),
  };
}

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function emptyMetric(): PulseMetric {
  return { total: 0, claims: 0, actions: 0, trend: [], deltaPercent: 0 };
}

function pickOpened(row: MonthAgg, scope: PulseScope): number {
  if (scope === 'claims') return row.claimsOpened;
  if (scope === 'plans') return row.actionsOpened;
  return row.claimsOpened + row.actionsOpened;
}

function pickClosed(row: MonthAgg, scope: PulseScope): number {
  if (scope === 'claims') return row.claimsClosed;
  if (scope === 'plans') return row.actionsClosed;
  return row.claimsClosed + row.actionsClosed;
}

export function buildPulseData(
  claimsMonthly?: MonthlyOpenClosed[] | null,
  plansMonthly?: MonthlyOpenClosed[] | null,
  period: PulsePeriod = 'month',
  fallbackClosureRate = 0,
  scope: PulseScope = 'all',
): PulseData | null {
  const rows = mergeMonthly(claimsMonthly, plansMonthly);
  if (rows.length < 2) return null;

  const window = period === 'month' ? 1 : period === '3m' ? 3 : 6;
  const currStart = Math.max(0, rows.length - window);
  const prevStart = Math.max(0, currStart - window);
  const curr = sumSlice(rows, currStart, rows.length);
  const prev = sumSlice(rows, prevStart, currStart);

  const openedCurr =
    scope === 'claims'
      ? curr.claimsOpened
      : scope === 'plans'
        ? curr.actionsOpened
        : curr.claimsOpened + curr.actionsOpened;
  const openedPrev =
    scope === 'claims'
      ? prev.claimsOpened
      : scope === 'plans'
        ? prev.actionsOpened
        : prev.claimsOpened + prev.actionsOpened;
  const closedCurr =
    scope === 'claims'
      ? curr.claimsClosed
      : scope === 'plans'
        ? curr.actionsClosed
        : curr.claimsClosed + curr.actionsClosed;
  const closedPrev =
    scope === 'claims'
      ? prev.claimsClosed
      : scope === 'plans'
        ? prev.actionsClosed
        : prev.claimsClosed + prev.actionsClosed;

  const netCurr = openedCurr - closedCurr;
  const netPrev = openedPrev - closedPrev;
  const netClaims = curr.claimsOpened - curr.claimsClosed;
  const netActions = curr.actionsOpened - curr.actionsClosed;

  const trendOpened = rows.map((r) => pickOpened(r, scope));
  const trendClosed = rows.map((r) => pickClosed(r, scope));
  const trendNet = rows.map((r) => pickOpened(r, scope) - pickClosed(r, scope));

  const denom = openedCurr + closedCurr;
  const periodClosure =
    denom === 0 ? fallbackClosureRate : Math.round((1000 * closedCurr) / denom) / 10;

  return {
    opened: {
      total: openedCurr,
      claims: scope === 'plans' ? 0 : curr.claimsOpened,
      actions: scope === 'claims' ? 0 : curr.actionsOpened,
      trend: trendOpened,
      deltaPercent: pctDelta(openedCurr, openedPrev),
    },
    closed: {
      total: closedCurr,
      claims: scope === 'plans' ? 0 : curr.claimsClosed,
      actions: scope === 'claims' ? 0 : curr.actionsClosed,
      trend: trendClosed,
      deltaPercent: pctDelta(closedCurr, closedPrev),
    },
    netLoad: {
      total: netCurr,
      claims: scope === 'plans' ? 0 : netClaims,
      actions: scope === 'claims' ? 0 : netActions,
      trend: trendNet,
    },
    closureRate: periodClosure,
    backlogDelta: netCurr - netPrev,
    scope,
  };
}

export function emptyPulseData(closureRate = 0, scope: PulseScope = 'all'): PulseData {
  return {
    opened: emptyMetric(),
    closed: emptyMetric(),
    netLoad: { total: 0, claims: 0, actions: 0, trend: [] },
    closureRate,
    backlogDelta: 0,
    scope,
  };
}
