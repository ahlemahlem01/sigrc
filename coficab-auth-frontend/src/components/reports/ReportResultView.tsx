import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ReportTotals = { total: number; closed: number; late: number; open: number; groups: number; rate: number };
export type ReportGroup = { key: string; label: string; total: number; closed: number; late: number; open: number; rate: number };

type Props = {
  generatedAt: string;
  periodText: string;
  onRegenerate: () => void;
  totals: ReportTotals;
  previous?: ReportTotals | null;
  previousText?: string;
  summaryLines: string[];
  groups: ReportGroup[];
  /** what is counted: "Réclamations", "Actions"… */
  itemLabel: string;
  groupColLabel: string;
  emptyText: string;
  /** the detail of one group, shown under its row */
  renderDetail: (groupKey: string) => React.ReactNode;
};

const NAVY = '#000168';
const GOOD = '#059669';
const BAD = '#e11d48';
const OPEN = '#3b82f6';

type SortKey = 'label' | 'total' | 'closed' | 'late' | 'rate';

/** A change since the previous period; whether a rise is good or bad depends on the figure. */
function Delta({ now, before, unit = '', higherIsBetter }: { now: number; before?: number; unit?: string; higherIsBetter: boolean }) {
  const { t } = useTranslation();
  if (before == null) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <span className="text-[11px] text-slate-400">{t('reportView.stable')}</span>;
  const good = higherIsBetter ? diff > 0 : diff < 0;
  return (
    <span className="text-[11px] font-semibold" style={{ color: good ? GOOD : BAD }} title={t('reportView.vsPrevious')}>
      {diff > 0 ? '▲' : '▼'} {diff > 0 ? '+' : ''}{diff}{unit}
    </span>
  );
}

/**
 * The result of a generated report (claims, actions): key figures with their change since the previous period, two charts,
 * the points of attention and the groups in a sortable table, each group opening onto its detail.
 */
export default function ReportResultView({
  generatedAt, periodText, onRegenerate, totals, previous, previousText, summaryLines, groups, itemLabel, groupColLabel, emptyText, renderDetail,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'total', dir: -1 });

  const sorted = useMemo(() => {
    const list = [...groups];
    list.sort((a, b) => {
      const va = sort.key === 'label' ? a.label.toLowerCase() : a[sort.key];
      const vb = sort.key === 'label' ? b.label.toLowerCase() : b[sort.key];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
    return list;
  }, [groups, sort]);

  const chartData = useMemo(
    () => [...groups].sort((a, b) => b.total - a.total).slice(0, 8)
      .map((g) => ({ name: g.label.length > 22 ? `${g.label.slice(0, 21)}…` : g.label, closed: g.closed, late: g.late, open: Math.max(0, g.total - g.closed - g.late) })),
    [groups],
  );
  const pie = [
    { name: t('actionsReport.kpiClosed'), value: totals.closed, color: GOOD },
    { name: t('actionsReport.kpiLate'), value: totals.late, color: BAD },
    { name: t('reportView.inProgress'), value: Math.max(0, totals.total - totals.closed - totals.late), color: OPEN },
  ].filter((p) => p.value > 0);

  const cards = [
    { label: itemLabel, value: totals.total, delta: <Delta now={totals.total} before={previous?.total} higherIsBetter /> , accent: NAVY },
    { label: t('actionsReport.kpiClosed'), value: totals.closed, delta: <Delta now={totals.closed} before={previous?.closed} higherIsBetter />, accent: GOOD },
    { label: t('actionsReport.kpiLate'), value: totals.late, delta: <Delta now={totals.late} before={previous?.late} higherIsBetter={false} />, accent: BAD },
    { label: t('actionsReport.kpiOpen'), value: totals.open, delta: <Delta now={totals.open} before={previous?.open} higherIsBetter={false} />, accent: OPEN },
    { label: t('indicators.kpiRate'), value: `${totals.rate}%`, delta: <Delta now={totals.rate} before={previous?.rate} unit=" pt" higherIsBetter />, accent: NAVY },
  ];

  const th = (key: SortKey, label: string, right = false) => (
    <th className={`px-4 py-3 font-semibold ${right ? 'text-right' : ''}`} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="uppercase tracking-wide hover:text-slate-800" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : (key === 'label' ? 1 : -1) }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs text-slate-500">
          {t('actionsReport.generatedAt')}: <span className="font-semibold text-slate-700">{new Date(generatedAt).toLocaleString()}</span>
          {' · '}{periodText}
        </div>
        <button type="button" onClick={onRegenerate} className="text-xs font-semibold text-[#000168] hover:underline">{t('actionsReport.regenerate')}</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-white border border-slate-200 px-4 py-3" style={{ borderTop: `3px solid ${c.accent}` }}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{c.label}</div>
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <div className="text-2xl font-bold tabular-nums" style={{ color: c.accent }}>{c.value}</div>
              {c.delta}
            </div>
          </div>
        ))}
      </div>
      {previous && previousText && <p className="text-[11px] text-slate-400 -mt-2 mb-4">{previousText}</p>}

      {groups.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-700 mb-2">{t('reportView.byGroup')}</div>
            <div style={{ height: Math.max(180, chartData.length * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="closed" name={t('actionsReport.kpiClosed')} stackId="s" fill={GOOD} />
                  <Bar dataKey="open" name={t('reportView.inProgress')} stackId="s" fill={OPEN} />
                  <Bar dataKey="late" name={t('actionsReport.kpiLate')} stackId="s" fill={BAD} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-700 mb-2">{t('reportView.overall')}</div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pie.map((p) => <Cell key={p.name} fill={p.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {summaryLines.length > 0 && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#000168] mb-1.5">{t('reportView.attention')}</div>
          <ul className="m-0 pl-4 space-y-1 text-sm text-slate-700">
            {summaryLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 m-0">{t('actionsReport.resultTitle')} · {totals.groups} {t('actionsReport.kpiGroups').toLowerCase()}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                {th('label', groupColLabel)}
                {th('total', itemLabel)}
                {th('closed', t('actionsReport.kpiClosed'))}
                {th('late', t('actionsReport.kpiLate'))}
                {th('rate', t('indicators.kpiRate'))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{emptyText}</td></tr>
              ) : sorted.map((g) => (
                <React.Fragment key={g.key}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{g.label}</td>
                    <td className="px-4 py-3 tabular-nums">{g.total}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-700">{g.closed}</td>
                    <td className="px-4 py-3 tabular-nums text-rose-600">{g.late}</td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <div className="text-xs text-slate-500 mb-1 tabular-nums">{g.rate}%</div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${g.rate}%`, background: NAVY }} /></div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="text-xs font-semibold text-[#000168] hover:underline" onClick={() => setExpanded(expanded === g.key ? null : g.key)}>
                        {expanded === g.key ? t('actionsReport.hide') : t('actionsReport.details')}
                      </button>
                    </td>
                  </tr>
                  {expanded === g.key && (
                    <tr className="bg-slate-50/60"><td colSpan={6} className="px-4 py-3">{renderDetail(g.key)}</td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
