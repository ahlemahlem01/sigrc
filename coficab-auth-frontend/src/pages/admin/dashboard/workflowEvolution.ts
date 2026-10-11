import type { MonthlyOpenClosed } from '../../../types/dashboardSummary';

export type StreamEvolution = {
  month: string;
  prevMonth: string;
  opened: number;
  closed: number;
  prevOpened: number;
  prevClosed: number;
  openedDelta: number;
  closedDelta: number;
  netBacklog: number;
  prevNetBacklog: number;
  backlogDelta: number;
  volumeDeltaPct: number | null;
};

function pct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

/** Compare le dernier mois de la série au précédent. */
export function computeStreamEvolution(series?: MonthlyOpenClosed[] | null): StreamEvolution | null {
  if (!series || series.length < 2) return null;
  const curr = series[series.length - 1];
  const prev = series[series.length - 2];
  const netCurr = curr.opened - curr.closed;
  const netPrev = prev.opened - prev.closed;
  const volCurr = curr.opened + curr.closed;
  const volPrev = prev.opened + prev.closed;

  return {
    month: curr.month,
    prevMonth: prev.month,
    opened: curr.opened,
    closed: curr.closed,
    prevOpened: prev.opened,
    prevClosed: prev.closed,
    openedDelta: curr.opened - prev.opened,
    closedDelta: curr.closed - prev.closed,
    netBacklog: netCurr,
    prevNetBacklog: netPrev,
    backlogDelta: netCurr - netPrev,
    volumeDeltaPct: pct(volCurr, volPrev),
  };
}

export type GlobalEvolution = {
  claims: StreamEvolution | null;
  plans: StreamEvolution | null;
  /** Variation nette du backlog combiné (positif = charge en hausse) */
  backlogDelta: number | null;
  /** Variation des clôtures combinées */
  closedDelta: number | null;
  /** Variation des ouvertures combinées */
  openedDelta: number | null;
};

export function computeGlobalEvolution(
  claimsMonthly?: MonthlyOpenClosed[] | null,
  plansMonthly?: MonthlyOpenClosed[] | null,
): GlobalEvolution {
  const claims = computeStreamEvolution(claimsMonthly);
  const plans = computeStreamEvolution(plansMonthly);
  const backlogDelta =
    claims || plans
      ? (claims?.backlogDelta ?? 0) + (plans?.backlogDelta ?? 0)
      : null;
  const closedDelta =
    claims || plans
      ? (claims?.closedDelta ?? 0) + (plans?.closedDelta ?? 0)
      : null;
  const openedDelta =
    claims || plans
      ? (claims?.openedDelta ?? 0) + (plans?.openedDelta ?? 0)
      : null;
  return { claims, plans, backlogDelta, closedDelta, openedDelta };
}

export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export function formatMonthKey(key: string, locale = 'fr'): string {
  const [y, mo] = key.split('-');
  if (!y || !mo) return key;
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
