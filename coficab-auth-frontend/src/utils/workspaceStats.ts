import type { Claim } from '../types/qualityAnalysis';
import { resolveClaimStatus } from './Claimutils';

/** An open item overdue by more than this many days needs a decision (close, reschedule, escalate) rather than a red badge. */
export const STALE_DAYS = 90;

export interface ClosureStats {
  closed: number;
  total: number;
  claimsClosed: number;
  claimsTotal: number;
  plansClosed: number;
  plansTotal: number;
  /** Whole percent, 0 when there is nothing yet. */
  rate: number;
}

/** A claim is finished once it is closed or validated. */
export function isClaimFinished(claim: Claim): boolean {
  const status = resolveClaimStatus(claim);
  return status === 'CLOTUREE' || status === 'VALIDATED' || status === 'ARCHIVED';
}

/** A plan is finished when it is closed/archived, or when all its work is done (it then only waits for its validation). */
export function isPlanFinished(plan: { status?: unknown; progress?: unknown }): boolean {
  const status = Number(plan.status ?? 0);
  return status === 3 || status === 4 || Number(plan.progress ?? 0) >= 100;
}

/**
 * Closure rate of an employee's own files: the claims assigned to them and the plans assigned to them, the same files the
 * dashboard lists. Closed / total, claims and plans together.
 */
export function closureStats(claims: Claim[], plans: { status?: unknown; progress?: unknown }[]): ClosureStats {
  const claimsClosed = claims.filter(isClaimFinished).length;
  const plansClosed = plans.filter(isPlanFinished).length;
  const total = claims.length + plans.length;
  const closed = claimsClosed + plansClosed;
  return {
    closed,
    total,
    claimsClosed,
    claimsTotal: claims.length,
    plansClosed,
    plansTotal: plans.length,
    rate: total > 0 ? Math.round((closed / total) * 100) : 0,
  };
}
