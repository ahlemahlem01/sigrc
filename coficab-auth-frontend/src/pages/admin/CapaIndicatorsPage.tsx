import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaIndicators, type CapaIndicators } from '../../services/capaIndicatorsService';
import { PageSkeleton } from '../../components/TableSkeleton';
import DashInfoTip from './dashboard/DashInfoTip';
import WorkflowEvolutionSection from './dashboard/WorkflowEvolutionSection';
import { COFICAB, PLANS_ACCENT } from './dashboard/dashPalette';
import { useReferenceLists } from '../../hooks/useReferenceLists';

const DAYS = 365;
const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const TYPE_COLORS: Record<string, string> = { PA: '#2f855a', PAC: '#b91c1c', PAP: '#2563eb' };
const fmt = (n: number | null | undefined, digits = 0) => (n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits }));

function Tile({ label, value, unit, tone, sub }: { label: string; value: string; unit?: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tabular-nums" style={{ color: NAVY }}>{value}</span>
        {unit && <span className="text-sm font-semibold text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="text-[11px] mt-1 text-slate-500">{sub}</div>}
    </div>
  );
}

/** The analysis side of the CAPA plans: how the flow moves, how well plans are closed, and what kind of plans they are. */
export default function CapaIndicatorsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const [departmentId, setDepartmentId] = useState('');
  const [domain, setDomain] = useState('');
  const { domains } = useReferenceLists();
  const [data, setData] = useState<CapaIndicators | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchCapaIndicators(accessToken, DAYS, scopeParam, departmentId || undefined, domain || undefined);
      setData(next);
      // a department that left the followed organizations no longer exists in the list
      if (departmentId && !next.byDepartment.some((d) => d.id === departmentId)) setDepartmentId('');
    } catch {
      setError(t('indicators.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, scopeParam, departmentId, domain, t]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <PageSkeleton figures={3} panels={2} />;

  const k = data?.kpis;
  const multiOrg = new Set((data?.byDepartment ?? []).map((d) => d.organization)).size > 1;
  const typeLabel = (type: string) => t(`planPage.type.${type}`, { defaultValue: type });
  const openByType = (data?.byType ?? []).filter((r) => r.openPlans > 0);
  const totalOpen = openByType.reduce((n, r) => n + r.openPlans, 0);

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1" style={{ color: COFICAB.navy }}>{t('adminDashboard.eyebrow')}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold m-0" style={{ color: COFICAB.ink }}>{t('adminNav.indicators')}</h1>
            <DashInfoTip text={t('capaIndicators.help')} title={t('adminNav.indicators')} side="bottom" />
          </div>
          <p className="text-sm mt-1 mb-0" style={{ color: COFICAB.muted }}>{t('capaIndicators.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            aria-label={t('planDomain.label')}
            className="px-3 py-2 text-xs font-semibold rounded-xl border bg-white max-w-[220px]"
            style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
          >
            <option value="">{t('planDomain.all')}</option>
            {domains.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            aria-label={t('planDetail.department')}
            className="px-3 py-2 text-xs font-semibold rounded-xl border bg-white max-w-[260px]"
            style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
          >
            <option value="">{t('audit.allDepartments')}</option>
            {(data?.byDepartment ?? []).map((d) => (
              <option key={d.id} value={d.id}>{multiOrg ? `${d.name} · ${d.organization}` : d.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border bg-white transition-all hover:shadow-sm"
            style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
          >
            <i className="ti ti-refresh" /> {t('adminDashboard.refresh')}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {data && k && (
        <>
          <WorkflowEvolutionSection showClaims={false} plansMonthly={data.monthly} loading={loading} />

          <section className="mb-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-base font-bold m-0" style={{ color: COFICAB.ink }}>{t('capaIndicators.perfTitle')}</h2>
              <p className="text-[11px] m-0" style={{ color: COFICAB.muted }}>{t('capaIndicators.perfPeriod')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Tile label={t('indicators.plansClosed')} value={fmt(k.closed.current)} tone={GOOD} />
              <Tile
                label={t('indicators.onTime')}
                value={fmt(k.onTimeRate.current, 1)}
                unit={k.onTimeRate.current == null ? undefined : '%'}
                tone={k.onTimeRate.current == null ? '#94a3b8' : k.onTimeRate.current >= 85 ? GOOD : k.onTimeRate.current >= 70 ? '#ea580c' : BAD}
                sub={k.onTimeRate.current == null ? t('capaIndicators.noClosed') : undefined}
              />
              <Tile
                label={t('indicators.avgClosure')}
                value={fmt(k.avgClosureDays.current, 1)}
                unit={k.avgClosureDays.current == null ? undefined : t('overviewPage.daysUnit')}
                tone={NAVY}
                sub={k.avgClosureDays.current == null ? t('capaIndicators.noClosed') : undefined}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white shadow-sm px-4 py-4" style={{ border: `1px solid ${COFICAB.line}` }}>
              <h3 className="text-sm font-bold text-slate-800 m-0">{t('indicators.byType')}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{t('capaIndicators.perfPeriod')}</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="pb-2 font-semibold text-left">{t('indicators.colType')}</th>
                    <th className="pb-2 font-semibold text-right">{t('indicators.colOpen')}</th>
                    <th className="pb-2 font-semibold text-right">{t('indicators.colLate')}</th>
                    <th className="pb-2 font-semibold text-right">{t('indicators.colClosed')}</th>
                    <th className="pb-2 font-semibold text-right">{t('indicators.colOnTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byType.map((r) => (
                    <tr key={r.type} className="border-t border-slate-50">
                      <td className="py-1.5 font-semibold text-slate-800">{typeLabel(r.type)}</td>
                      <td className="py-1.5 tabular-nums text-right">{r.openPlans}</td>
                      <td className="py-1.5 tabular-nums text-right" style={{ color: r.latePlans > 0 ? BAD : undefined }}>{r.latePlans}</td>
                      <td className="py-1.5 tabular-nums text-right">{r.closedInPeriod}</td>
                      <td className="py-1.5 tabular-nums text-right">{r.onTimeRate == null ? '—' : `${fmt(r.onTimeRate, 1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-white shadow-sm px-4 py-4" style={{ border: `1px solid ${COFICAB.line}` }}>
              <h3 className="text-sm font-bold m-0" style={{ color: PLANS_ACCENT }}>{t('capaIndicators.openByType')}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{t('capaIndicators.openByTypeScope', { count: totalOpen })}</p>
              {openByType.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">{t('indicators.noData')}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={openByType.map((r) => ({ name: typeLabel(r.type), value: r.openPlans, type: r.type }))} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={2}>
                        {openByType.map((r) => <Cell key={r.type} fill={TYPE_COLORS[r.type] ?? '#64748b'} />)}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="m-0 p-0 list-none space-y-1.5">
                    {openByType.map((r) => (
                      <li key={r.type} className="flex items-center gap-2 text-xs px-2 py-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: TYPE_COLORS[r.type] ?? '#64748b' }} />
                        <span className="font-semibold text-slate-800 flex-1">{typeLabel(r.type)}</span>
                        <span className="tabular-nums font-bold text-slate-800">{r.openPlans}</span>
                        <span className="tabular-nums text-slate-500 w-12 text-right">{Math.round((100 * r.openPlans) / Math.max(1, totalOpen))} %</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
