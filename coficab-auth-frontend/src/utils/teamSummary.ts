import type { HrReportEmployeePayload } from '../services/hrReportService';

type T = (key: string, options?: Record<string, unknown>) => string;

const sum = (rows: HrReportEmployeePayload[], pick: (r: HrReportEmployeePayload) => number | undefined) =>
  rows.reduce((n, r) => n + (pick(r) ?? 0), 0);

/**
 * The summary of the team report when the AI summary is not available: plain sentences from the figures
 * (claims, plans and sub-actions are kept apart, as in the rest of the console).
 */
export function buildTeamSummary(t: T, rows: HrReportEmployeePayload[]): string {
  if (rows.length === 0) return '';
  const lines: string[] = [t('teamSummary.people', { count: rows.length })];

  const claimsOpen = sum(rows, (r) => r.claimsOpen);
  const claimsLate = sum(rows, (r) => r.claimsLate);
  const plansOpen = sum(rows, (r) => r.plansOpen);
  const plansLate = sum(rows, (r) => r.plansLate);
  const toValidate = sum(rows, (r) => r.actionsToValidate);
  lines.push(t('teamSummary.claims', { open: claimsOpen, late: claimsLate }));
  lines.push(t('teamSummary.plans', { open: plansOpen, late: plansLate }));
  if (toValidate > 0) lines.push(t('teamSummary.toValidate', { count: toValidate }));

  const busiest = [...rows].filter((r) => r.activeDossiers > 0).sort((a, b) => b.activeDossiers - a.activeDossiers).slice(0, 3);
  if (busiest.length) lines.push(t('teamSummary.busiest', { list: busiest.map((r) => `${r.fullName} (${r.activeDossiers})`).join(', ') }));

  const lateOnes = [...rows].filter((r) => r.overdueCount > 0).sort((a, b) => b.overdueCount - a.overdueCount).slice(0, 3);
  if (lateOnes.length) lines.push(t('teamSummary.mostLate', { list: lateOnes.map((r) => `${r.fullName} (${r.overdueCount})`).join(', ') }));

  const idle = rows.filter((r) => r.activeDossiers === 0).length;
  if (idle > 0) lines.push(t('teamSummary.idle', { count: idle }));

  const inactivePlans = rows.filter((r) => (r.plansActivity ?? '') === 'Inactive').length;
  const inactiveClaims = rows.filter((r) => (r.claimsActivity ?? '') === 'Inactive').length;
  if (inactivePlans > 0 || inactiveClaims > 0) lines.push(t('teamSummary.inactive', { plans: inactivePlans, claims: inactiveClaims }));

  return lines.join('\n');
}
