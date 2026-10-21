import React from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClaimsDashboard } from '../../../types/dashboardSummary';
import KpiMiniCard from './KpiMiniCard';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB, SEV_COLORS } from './dashPalette';
import { severityKey } from '../../../utils/overviewSeverity';

function severityBadge(sev: string) {
  const key = sev.toUpperCase();
  const bg =
    key.includes('CRIT') ? COFICAB.dangerSoft
      : key.includes('HIGH') || key.includes('ELEV') ? COFICAB.warnSoft
        : key.includes('LOW') || key.includes('FAIB') ? COFICAB.okSoft
          : '#fefce8';
  const color =
    key.includes('CRIT') ? COFICAB.danger
      : key.includes('HIGH') || key.includes('ELEV') ? COFICAB.warn
        : key.includes('LOW') || key.includes('FAIB') ? COFICAB.ok
          : '#a16207';
  return { bg, color };
}

type Props = {
  data?: ClaimsDashboard | null;
  loading?: boolean;
  /** steering: figures and lists to act on; indicators: the severity breakdown. */
  part?: 'steering' | 'indicators';
};

export default function ClaimsOverviewColumn({ data, loading, part = 'steering' }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const kpis = data?.kpis;
  const donut = (data?.severityDonut ?? []).map((d) => ({
    name: t(`overviewPage.severity.${severityKey(d.name)}`),
    value: d.count,
    fill: SEV_COLORS[d.name.toUpperCase()] || SEV_COLORS[severityKey(d.name).toUpperCase()] || '#64748b',
  }));

  const tipStyle = { borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` };

  if (part === 'indicators') {
    return (
      <section
        className="rounded-xl bg-white shadow-sm px-4 py-4"
        style={{ border: `1px solid ${COFICAB.line}` }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <h2 className="text-sm font-bold m-0" style={{ color: CLAIMS_ACCENT }}>{t('adminDashboard.claims.chartSeverity')}</h2>
          <DashInfoTip text={t('adminDashboard.help.chartSeverity')} side="bottom" />
        </div>
        {loading ? (
          <div className="h-[220px] rounded-lg bg-slate-100 animate-pulse" />
        ) : donut.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">{t('adminDashboard.noData')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {donut.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </section>
    );
  }

  return (
    <section
      className="rounded-xl bg-white shadow-sm flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md"
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
          <i className="ti ti-clipboard-list" style={{ fontSize: 18, color: CLAIMS_ACCENT }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold m-0" style={{ color: CLAIMS_ACCENT }}>
              {t('adminDashboard.claims.title')}
            </h2>
            <DashInfoTip
              text={t('adminDashboard.help.claimsColumn')}
              title={t('adminDashboard.claims.title')}
              side="bottom"
            />
          </div>
          <p className="text-[11px] text-slate-500 m-0">{t('adminDashboard.claims.subtitle')}</p>
        </div>
      </header>

      <div className="p-4 flex flex-col gap-4 flex-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <KpiMiniCard
            label={t('adminDashboard.claims.totalOpen')}
            to="/admin/claims/list"
            value={kpis?.totalOpen ?? 0}
            loading={loading}
            accent={CLAIMS_ACCENT}
            tint={COFICAB.light}
            icon="ti-folder-open"
            help={t('adminDashboard.help.claimsOpen')}
          />
          <KpiMiniCard
            label={t('adminDashboard.claims.late')}
            to="/admin/claims/list?deadline=late"
            value={kpis?.late ?? 0}
            loading={loading}
            accent={COFICAB.danger}
            tint={COFICAB.dangerSoft}
            icon="ti-clock-exclamation"
            help={t('adminDashboard.help.claimsLate')}
          />
          <KpiMiniCard
            label={t('adminDashboard.claims.noDeadline')}
            to="/admin/claims/list?deadline=none"
            value={kpis?.noDeadline ?? 0}
            loading={loading}
            accent={COFICAB.warn}
            tint={COFICAB.warnSoft}
            icon="ti-calendar-off"
            help={t('adminDashboard.help.claimsNoDeadline')}
          />
          <KpiMiniCard
            label={t('adminDashboard.claims.closureRate')}
            value={`${(kpis?.closureRate ?? 0).toFixed(1)} %`}
            loading={loading}
            accent={COFICAB.ok}
            tint={COFICAB.okSoft}
            icon="ti-chart-pie"
            help={t('adminDashboard.help.claimsClosure')}
          />
          <KpiMiniCard
            label={t('adminDashboard.claims.critical')}
            to="/admin/claims/list?severity=critical"
            value={kpis?.critical ?? 0}
            loading={loading}
            accent={COFICAB.warn}
            tint={COFICAB.warnSoft}
            icon="ti-alert-triangle"
            help={t('adminDashboard.help.claimsCritical')}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-800 m-0">{t('adminDashboard.claims.top5Late')}</h3>
            <DashInfoTip text={t('adminDashboard.help.claimsTop5')} title={t('adminDashboard.claims.top5Late')} />
          </div>
          <div className="rounded-xl overflow-hidden min-h-[220px]" style={{ border: `1px solid ${COFICAB.line}` }}>
            {loading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : !data?.top5Late?.length ? (
              <div className="p-6 text-center text-sm text-slate-400">{t('adminDashboard.claims.emptyLate')}</div>
            ) : (
              <ul className="divide-y m-0 p-0 list-none" style={{ borderColor: COFICAB.line }}>
                {data.top5Late.map((row) => {
                  const badge = severityBadge(row.severity);
                  return (
                    <li
                      key={row.id}
                      className="px-3 py-2.5 flex items-center gap-2 transition-colors hover:bg-[var(--navy-light,#eef2ff)]"
                      style={{ borderColor: COFICAB.line }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-800 truncate">{row.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {row.clientId} · {row.responsibleName || '—'}
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {t(`overviewPage.severity.${severityKey(row.severity)}`)}
                      </span>
                      <span className="text-[11px] font-bold tabular-nums shrink-0 w-12 text-right" style={{ color: COFICAB.danger }}>
                        {t('adminDashboard.daysLate', { count: row.overdueDays })}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-semibold hover:underline shrink-0"
                        style={{ color: CLAIMS_ACCENT }}
                        onClick={() => navigate(`/pages/front/quality-analyses?focus=${row.id}`)}
                      >
                        {t('adminDashboard.view')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-800 m-0">{t('adminDashboard.claims.noDeadlineTitle')}</h3>
            <DashInfoTip text={t('adminDashboard.help.claimsNoDeadline')} title={t('adminDashboard.claims.noDeadlineTitle')} />
          </div>
          <p className="text-[11px] text-slate-500 m-0 mb-2">{t('adminDashboard.claims.noDeadlineHint')}</p>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${COFICAB.line}` }}>
            {loading ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : !data?.top5NoDeadline?.length ? (
              <div className="p-5 text-center text-sm text-slate-400">{t('adminDashboard.claims.noDeadlineEmpty')}</div>
            ) : (
              <ul className="divide-y m-0 p-0 list-none" style={{ borderColor: COFICAB.line }}>
                {data.top5NoDeadline.map((row) => (
                  <li key={row.id} className="px-3 py-2.5 flex items-center gap-2" style={{ borderColor: COFICAB.line }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-800 truncate">{row.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{row.clientId} · {row.responsibleName || '—'}</div>
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: COFICAB.muted }}>
                      {t('adminDashboard.claims.noDeadlineAge', { count: row.ageDays })}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-semibold hover:underline shrink-0"
                      style={{ color: CLAIMS_ACCENT }}
                      onClick={() => navigate(`/pages/front/quality-analyses?focus=${row.id}`)}
                    >
                      {t('adminDashboard.view')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(kpis?.noDeadline ?? 0) > (data?.top5NoDeadline?.length ?? 0) && (
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold hover:underline"
              style={{ color: CLAIMS_ACCENT }}
              onClick={() => navigate('/admin/claims/list?deadline=none')}
            >
              {t('adminDashboard.claims.seeAll', { count: kpis?.noDeadline ?? 0 })}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
