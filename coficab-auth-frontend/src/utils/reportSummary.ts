/** The automatic summary of a generated report: what the period shows, compared with the period just before it. */

export type ReportTotals = { total: number; closed: number; late: number; open: number; rate: number };
export type ReportGroup = { label: string; total: number; late: number; rate: number };

const DAY = 86400000;
const toInput = (d: Date) => d.toISOString().slice(0, 10);

/** The period of the same length that ends the day before `from` (dates as YYYY-MM-DD). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / DAY) + 1);
  const prevTo = start - DAY;
  return { from: toInput(new Date(prevTo - (days - 1) * DAY)), to: toInput(new Date(prevTo)) };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * Plain sentences for the top of a report. `noun` is the translated plural of what is counted
 * (claims, sub-actions). Without a previous period only the figures of the period are given.
 */
export function buildReportSummary(
  t: T,
  noun: string,
  totals: ReportTotals,
  previous: ReportTotals | null | undefined,
  groups: ReportGroup[],
): string[] {
  if (totals.total === 0) return [t('reportSummary.empty', { noun })];
  const lines: string[] = [];

  lines.push(
    previous
      ? t('reportSummary.volume', { total: totals.total, noun, delta: signed(totals.total - previous.total), previous: previous.total })
      : t('reportSummary.volumeAlone', { total: totals.total, noun }),
  );

  const rateDelta = previous && previous.total > 0 ? totals.rate - previous.rate : null;
  lines.push(
    rateDelta == null
      ? t('reportSummary.rateAlone', { rate: totals.rate, closed: totals.closed, total: totals.total })
      : t('reportSummary.rate', { rate: totals.rate, closed: totals.closed, total: totals.total, delta: signed(rateDelta), previous: previous!.rate }),
  );

  if (totals.late > 0) {
    lines.push(
      previous
        ? t('reportSummary.late', { late: totals.late, delta: signed(totals.late - previous.late), previous: previous.late })
        : t('reportSummary.lateAlone', { late: totals.late }),
    );
  } else {
    lines.push(t('reportSummary.noLate'));
  }

  const worst = [...groups].filter((g) => g.late > 0).sort((a, b) => b.late - a.late || a.rate - b.rate)[0];
  if (worst) lines.push(t('reportSummary.worst', { label: worst.label, late: worst.late, rate: worst.rate }));

  if (rateDelta != null && rateDelta <= -5) lines.push(t('reportSummary.watchDown', { delta: Math.abs(rateDelta) }));
  else if (rateDelta != null && rateDelta >= 5) lines.push(t('reportSummary.goodUp', { delta: rateDelta }));
  else if (previous && totals.late > previous.late && totals.late - previous.late >= 3) lines.push(t('reportSummary.watchLate', { delta: totals.late - previous.late }));

  return lines;
}
