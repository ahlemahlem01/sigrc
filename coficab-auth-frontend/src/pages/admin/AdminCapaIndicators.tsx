import { PageSkeleton } from '../../components/TableSkeleton';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaIndicators, type CapaFigure, type CapaIndicators } from '../../services/capaIndicatorsService';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import SegmentedToggle from '../../components/SegmentedToggle';
import DashboardSummaryBar from './dashboard/DashboardSummaryBar';

type Period = '7d' | '1m' | '3m' | '1y';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '1m': 30, '3m': 90, '1y': 365 };

const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const YELLOW = '#ca8a04';

const fmt = (n: number | null | undefined, digits = 0) => (n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits }));

/** Change against the previous period: in % for counts, in points for rates, in days for durations. */
function Delta({ figure, unit, lowerIsBetter }: { figure: CapaFigure; unit: 'pct' | 'pts' | 'd'; lowerIsBetter?: boolean }) {
  const { current, previous } = figure;
  if (current == null || previous == null) return null;
  let value: number;
  if (unit === 'pct') {
    if (previous === 0) return null;
    value = Math.round(((current - previous) / previous) * 100);
  } else {
    value = Math.round((current - previous) * 10) / 10;
  }
  if (value === 0) return <span className="text-[11px] font-semibold text-slate-400">=</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const suffix = unit === 'pct' ? ' %' : unit === 'pts' ? ' pts' : ' d';
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color: good ? GOOD : BAD }}>
      {value > 0 ? '▲ +' : '▼ '}{value}{suffix}
    </span>
  );
}

function Kpi({ label, value, unit, tone, sub, delta }: { label: string; value: string; unit?: string; tone: string; sub?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tabular-nums" style={{ color: tone === BAD ? BAD : NAVY }}>{value}</span>
        {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
        {delta}
      </div>
      {sub && <div className="text-[11px] mt-1 text-slate-500">{sub}</div>}
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function AdminCapaIndicators() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const [period, setPeriod] = useState<Period>('3m');
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<CapaIndicators | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchCapaIndicators(accessToken, PERIOD_DAYS[period], scopeParam, departmentId || undefined);
      setData(next);
      // a department that left the followed organizations no longer exists in the list
      if (departmentId && !next.byDepartment.some((d) => d.id === departmentId)) setDepartmentId('');
    } catch {
      setError(t('indicators.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, period, scopeParam, departmentId, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <PageSkeleton figures={3} panels={3} />;

  const k = data?.kpis;
  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'it' ? 'it-IT' : 'fr-FR';
  const monthly = (data?.monthly ?? []).map((m) => {
    const [y, mo] = m.month.split('-').map(Number);
    return { ...m, label: new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: 'short' }) };
  });
  const multiOrg = new Set((data?.byDepartment ?? []).map((d) => d.organization)).size > 1;
  const selectedDepartment = data?.byDepartment.find((d) => d.id === departmentId);
  const lateShare = (late: number, open: number) => (open === 0 ? '' : ` · ${Math.round((100 * late) / open)} %`);

  const exportPdf = () => {
    if (!data || !k) return;
    exportCapaPdf({
      title: t('indicators.title'),
      subtitle: t('indicators.byDepartment'),
      filename: `capa-indicators-${period}`,
      meta: [
        `${t('indicators.plansOpen')}: ${k.openPlans}`,
        `${t('indicators.plansLate')}: ${k.latePlans}`,
        `${t('indicators.plansClosed')}: ${fmt(k.closed.current)}`,
        `${t('indicators.onTime')}: ${k.onTimeRate.current == null ? '—' : `${fmt(k.onTimeRate.current, 1)} %`}`,
        `Period: ${period}`,
        ...(selectedDepartment ? [`${t('planDetail.department')}: ${selectedDepartment.name}`] : []),
      ],
      columns: [
        { key: 'name', label: t('indicators.colDepartment') },
        { key: 'open', label: t('indicators.colOpen') },
        { key: 'late', label: t('indicators.colLate') },
        { key: 'closed', label: t('indicators.colClosed') },
        { key: 'onTime', label: t('indicators.colOnTime') },
      ],
      rows: data.byDepartment.map((d) => ({
        name: multiOrg ? `${d.name} · ${d.organization}` : d.name, open: d.openPlans, late: d.latePlans, closed: d.closedInPeriod,
        onTime: d.onTimeRate == null ? '—' : `${fmt(d.onTimeRate, 1)} %`,
      })),
    });
  };

  const th = 'pb-2 font-semibold text-right';
  const td = 'py-1.5 tabular-nums text-right';

  return (
    <div className="text-slate-900 w-full min-w-0">
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          aria-label={t('planDetail.department')}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 max-w-[260px]"
        >
          <option value="">{t('audit.allDepartments')}</option>
          {(data?.byDepartment ?? []).map((d) => (
            <option key={d.id} value={d.id}>{multiOrg ? `${d.name} · ${d.organization}` : d.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void load()} className={capaBtnSecondary}>{t('dashboard.refresh')}</button>
        <button type="button" onClick={exportPdf} className={capaBtnSecondary} disabled={!data}>{t('common.exportPdf')}</button>
        <SegmentedToggle
          options={(['7d', '1m', '3m', '1y'] as Period[]).map((p) => ({ id: p, labelKey: `indicators.period.${p}` }))}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {data && k && (
        <>
          <DashboardSummaryBar plansMonthly={data.monthly} fixedScope="plans" />

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            <Kpi label={t('indicators.plansOpen')} value={fmt(k.openPlans)} tone={NAVY} />
            <Kpi
              label={t('indicators.plansLate')}
              value={fmt(k.latePlans)}
              tone={k.latePlans > 0 ? BAD : GOOD}
              sub={k.openPlans === 0 ? undefined : t('overviewPage.lateOfOpen', { pct: fmt((100 * k.latePlans) / k.openPlans, 1) })}
            />
            <Kpi label={t('indicators.plansCreated')} value={fmt(k.opened.current)} tone={NAVY} delta={<Delta figure={k.opened} unit="pct" />} />
            <Kpi label={t('indicators.plansClosed')} value={fmt(k.closed.current)} tone={GOOD} delta={<Delta figure={k.closed} unit="pct" />} />
            <Kpi
              label={t('indicators.onTime')}
              value={fmt(k.onTimeRate.current, 1)}
              unit={k.onTimeRate.current == null ? undefined : '%'}
              tone={k.onTimeRate.current == null ? '#94a3b8' : k.onTimeRate.current >= 85 ? GOOD : k.onTimeRate.current >= 70 ? ORANGE : BAD}
              delta={<Delta figure={k.onTimeRate} unit="pts" />}
            />
            <Kpi
              label={t('indicators.avgClosure')}
              value={fmt(k.avgClosureDays.current, 1)}
              unit={k.avgClosureDays.current == null ? undefined : t('overviewPage.daysUnit')}
              tone={NAVY}
              delta={<Delta figure={k.avgClosureDays} unit="d" lowerIsBetter />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
            <Panel title={t('indicators.byType')}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-semibold text-left">{t('indicators.colType')}</th>
                    <th className={th}>{t('indicators.colOpen')}</th>
                    <th className={th}>{t('indicators.colLate')}</th>
                    <th className={th}>{t('indicators.colClosed')}</th>
                    <th className={th}>{t('indicators.colOnTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map((r) => (
                    <tr key={r.type} className="border-t border-slate-50">
                      <td className="py-1.5 font-semibold text-slate-800">{r.type}</td>
                      <td className={td}>{r.openPlans}</td>
                      <td className={td} style={{ color: r.latePlans > 0 ? BAD : undefined }}>{r.latePlans}</td>
                      <td className={td}>{r.closedInPeriod}</td>
                      <td className={td}>{r.onTimeRate == null ? '—' : `${fmt(r.onTimeRate, 1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel title={t('overviewPage.agingTitle')}>
              <div className="grid grid-cols-3 gap-2">
                {([
                  [data.aging.under30, t('overviewPage.agingUnder30'), YELLOW],
                  [data.aging.from30To90, t('overviewPage.aging30to90'), ORANGE],
                  [data.aging.over90, t('overviewPage.agingOver90'), BAD],
                ] as [number, string, string][]).map(([n, label, color]) => (
                  <div key={label} className="rounded-lg px-3 py-2.5" style={{ background: '#f8fafc', borderTop: `3px solid ${color}` }}>
                    <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: NAVY }}>{n}</div>
                    <div className="text-xs font-semibold mt-1 text-slate-700">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 mb-0">{t('indicators.agingNote')}</p>
            </Panel>
          </div>

          <Panel title={t('indicators.byDepartment')} className="mb-5">
            {data.byDepartment.length === 0 ? (
              <p className="text-sm text-slate-400 m-0">{t('indicators.noData')}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-semibold text-left">{t('indicators.colDepartment')}</th>
                    <th className={th}>{t('indicators.colOpen')}</th>
                    <th className={th}>{t('indicators.colLate')}</th>
                    <th className={th}>{t('indicators.colClosed')}</th>
                    <th className={th}>{t('indicators.colOnTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDepartment.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setDepartmentId(departmentId === r.id ? '' : r.id)}
                      className="border-t border-slate-50 cursor-pointer hover:bg-slate-50"
                      style={r.id === departmentId ? { background: '#eef0ff' } : undefined}
                    >
                      <td className="py-1.5 font-semibold text-slate-800">
                        {r.name}
                        {multiOrg && <span className="font-normal text-slate-400"> · {r.organization}</span>}
                      </td>
                      <td className={td}>{r.openPlans}</td>
                      <td className={td} style={{ color: r.latePlans > 0 ? BAD : undefined }}>
                        {r.latePlans}<span className="text-slate-400 font-normal">{lateShare(r.latePlans, r.openPlans)}</span>
                      </td>
                      <td className={td}>{r.closedInPeriod}</td>
                      <td className={td}>{r.onTimeRate == null ? '—' : `${fmt(r.onTimeRate, 1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Panel title={t('indicators.monthlyPlans')} className="lg:col-span-2">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="opened" name={t('indicators.created')} fill="#94a3b8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="closed" name={t('indicators.closed')} fill="#38a169" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title={t('indicators.owners')}>
              {data.owners.length === 0 ? (
                <p className="text-sm text-slate-400 m-0">{t('indicators.noData')}</p>
              ) : (
                <ul className="m-0 p-0 list-none space-y-2">
                  {data.owners.map((o) => (
                    <li key={o.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 truncate">{o.name}</span>
                      <span className="tabular-nums shrink-0 text-slate-500">
                        <b className="text-slate-800">{o.openPlans}</b> {t('indicators.colOpen').toLowerCase()}
                        {o.latePlans > 0 && <span style={{ color: BAD }}> · {o.latePlans} {t('indicators.colLate').toLowerCase()}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
