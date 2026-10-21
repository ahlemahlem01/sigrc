import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClaimsDashboard } from '../../../types/dashboardSummary';
import KpiMiniCard from './KpiMiniCard';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB } from './dashPalette';
import { severityKey, type SeverityKey } from '../../../utils/overviewSeverity';

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
  // one row per severity, from the most to the least serious, in clearly different colours
  const ORDER: SeverityKey[] = ['critical', 'high', 'medium', 'low'];
  const SEVERITY_COLORS: Record<SeverityKey, string> = { critical: '#b91c1c', high: '#ea580c', medium: '#ca8a04', low: '#2f855a' };
  const counts = new Map<SeverityKey, number>();
  (data?.severityDonut ?? []).forEach((d) => counts.set(severityKey(d.name), (counts.get(severityKey(d.name)) ?? 0) + d.count));
  const donut = ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => ({
    key: k,
    name: t(`overviewPage.severity.${k}`),
    value: counts.get(k) ?? 0,
    fill: SEVERITY_COLORS[k],
  }));
  const totalSeverity = donut.reduce((n, d) => n + d.value, 0);

  const tipStyle = { borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` };

  if (part === 'indicators') {
    const toList = (key: SeverityKey) => navigate(`/admin/claims/list?severity=${key}`);
    return (
      <section className="rounded-xl bg-white shadow-sm px-4 py-4" style={{ border: `1px solid ${COFICAB.line}` }}>
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-bold m-0" style={{ color: CLAIMS_ACCENT }}>{t('adminDashboard.claims.chartSeverity')}</h2>
          <DashInfoTip text={t('adminDashboard.help.chartSeverity')} side="bottom" />
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{t('adminDashboard.claims.severityScope', { count: totalSeverity })}</p>
        {loading ? (
          <div className="h-[200px] rounded-lg bg-slate-100 animate-pulse" />
        ) : donut.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-xs text-slate-400">{t('adminDashboard.noData')}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} onClick={(_, i) => toList(donut[i].key)} cursor="pointer">
                  {donut.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="m-0 p-0 list-none space-y-1.5">
              {donut.map((d) => (
                <li key={d.key}>
                  <button type="button" onClick={() => toList(d.key)} className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-slate-50" title={t('adminDashboard.claimKpis.openList')}>
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.fill }} />
                    <span className="font-semibold text-slate-800 flex-1 text-left">{d.name}</span>
                    <span className="tabular-nums font-bold text-slate-800">{d.value}</span>
                    <span className="tabular-nums text-slate-500 w-12 text-right">{Math.round((100 * d.value) / Math.max(1, totalSeverity))} %</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className="rounded-xl bg-white shadow-sm flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md"
      style={{ border: `1px solid ${COFICAB.line}` }}
    >
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
