import React from 'react';
import {
  Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ActionPlansDashboard } from '../../../types/dashboardSummary';
import KpiMiniCard from './KpiMiniCard';
import DashInfoTip from './DashInfoTip';
import { COFICAB, NATURE_COLORS, PLANS_ACCENT } from './dashPalette';

function monthLabel(m: string, locale: string) {
  const [y, mo] = m.split('-');
  if (!y || !mo) return m;
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(locale, { month: 'short' });
}

type Props = {
  data?: ActionPlansDashboard | null;
  loading?: boolean;
};

export default function ActionPlansOverviewColumn({ data, loading }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language || 'fr';
  const kpis = data?.kpis;
  const lineData = (data?.monthlyOpenClosed ?? []).map((r) => ({
    month: monthLabel(r.month, locale),
    open: r.opened,
    closed: r.closed,
  }));
  const donut = (data?.natureDonut ?? []).map((d) => ({
    name: d.name,
    value: d.count,
    fill: NATURE_COLORS[d.name.toUpperCase()] || '#64748b',
  }));

  const tipStyle = { borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` };

  return (
    <section
      className="rounded-xl bg-white shadow-sm flex flex-col min-h-[780px] overflow-hidden transition-shadow duration-200 hover:shadow-md"
      style={{ border: `1px solid ${COFICAB.line}` }}
    >
      <header
        className="px-4 py-3.5 flex items-center gap-2.5 border-b"
        style={{
          borderColor: COFICAB.line,
          background: `linear-gradient(135deg, ${COFICAB.light} 0%, #fff 72%)`,
        }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: COFICAB.light }}
        >
          <i className="ti ti-tool" style={{ fontSize: 18, color: PLANS_ACCENT }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold m-0" style={{ color: PLANS_ACCENT }}>
              {t('adminDashboard.actionPlans.title')}
            </h2>
            <DashInfoTip
              text={t('adminDashboard.help.plansColumn')}
              title={t('adminDashboard.actionPlans.title')}
              side="bottom"
            />
          </div>
          <p className="text-[11px] text-slate-500 m-0">{t('adminDashboard.actionPlans.subtitle')}</p>
        </div>
      </header>

      <div className="p-4 flex flex-col gap-4 flex-1">
        <div className="grid grid-cols-2 gap-2">
          <KpiMiniCard
            label={t('adminDashboard.actionPlans.totalOpen')}
            to="/admin/action-plans"
            value={kpis?.totalOpen ?? 0}
            loading={loading}
            accent={PLANS_ACCENT}
            tint={COFICAB.light}
            icon="ti-folder-open"
            help={t('adminDashboard.help.plansOpen')}
          />
          <KpiMiniCard
            label={t('adminDashboard.actionPlans.late')}
            to="/admin/action-plans?late=1"
            value={kpis?.late ?? 0}
            loading={loading}
            accent={COFICAB.danger}
            tint={COFICAB.dangerSoft}
            icon="ti-clock-exclamation"
            help={t('adminDashboard.help.plansLate')}
          />
          <KpiMiniCard
            label={t('adminDashboard.actionPlans.closureRate')}
            value={`${(kpis?.closureRate ?? 0).toFixed(1)} %`}
            loading={loading}
            accent={COFICAB.ok}
            tint={COFICAB.okSoft}
            icon="ti-chart-pie"
            help={t('adminDashboard.help.plansClosure')}
          />
          <KpiMiniCard
            label={t('adminDashboard.actionPlans.critical')}
            value={kpis?.critical ?? 0}
            loading={loading}
            accent={COFICAB.warn}
            tint={COFICAB.warnSoft}
            icon="ti-alert-triangle"
            help={t('adminDashboard.help.plansCritical')}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-800 m-0">{t('adminDashboard.actionPlans.top5Late')}</h3>
            <DashInfoTip text={t('adminDashboard.help.plansTop5')} title={t('adminDashboard.actionPlans.top5Late')} />
          </div>
          <div className="rounded-xl overflow-hidden min-h-[220px]" style={{ border: `1px solid ${COFICAB.line}` }}>
            {loading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : !data?.top5Late?.length ? (
              <div className="p-6 text-center text-sm text-slate-400">{t('adminDashboard.actionPlans.emptyLate')}</div>
            ) : (
              <ul className="divide-y m-0 p-0 list-none">
                {data.top5Late.map((row) => (
                  <li
                    key={row.id}
                    className="px-3 py-2.5 flex items-center gap-2 transition-colors hover:bg-[var(--navy-light,#eef2ff)]"
                    style={{ borderColor: COFICAB.line }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 truncate">{row.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {row.nature} · {row.responsibleName || '—'}
                      </div>
                    </div>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: COFICAB.light, color: PLANS_ACCENT }}
                    >
                      {row.nature}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums shrink-0 w-12 text-right" style={{ color: COFICAB.danger }}>
                      {t('adminDashboard.daysLate', { count: row.overdueDays })}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-semibold hover:underline shrink-0"
                      style={{ color: PLANS_ACCENT }}
                      onClick={() => navigate(`/admin/action-plans/${row.id}`)}
                    >
                      {t('adminDashboard.view')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl p-3 min-h-[200px]" style={{ border: `1px solid ${COFICAB.line}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-xs font-bold text-slate-700 m-0">{t('adminDashboard.actionPlans.chartTrend')}</h3>
              <DashInfoTip text={t('adminDashboard.help.chartTrend')} side="bottom" />
            </div>
            {loading ? (
              <div className="h-[160px] rounded-lg bg-slate-100 animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={lineData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={tipStyle} />
                  <Line type="monotone" dataKey="open" name={t('adminDashboard.chartOpen')} stroke={PLANS_ACCENT} strokeWidth={2.2} dot={false} />
                  <Line type="monotone" dataKey="closed" name={t('adminDashboard.chartClosed')} stroke={COFICAB.ok} strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl p-3 min-h-[200px]" style={{ border: `1px solid ${COFICAB.line}` }}>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-xs font-bold text-slate-700 m-0">{t('adminDashboard.actionPlans.chartNature')}</h3>
              <DashInfoTip text={t('adminDashboard.help.chartNature')} side="bottom" />
            </div>
            {loading ? (
              <div className="h-[160px] rounded-lg bg-slate-100 animate-pulse" />
            ) : donut.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-xs text-slate-400">{t('adminDashboard.noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={36} outerRadius={58} paddingAngle={2}>
                    {donut.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
