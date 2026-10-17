import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import SegmentedToggle from '../../../components/SegmentedToggle';
import { fetchDashboardOverview, fetchModelStatus, type ModelStatus } from '../../../services/dashboardOverviewService';
import type { OverviewData, OverviewMetric, RankedItem } from '../../../types/dashboardOverview';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB, PLANS_ACCENT } from './dashPalette';

type Tone = 'green' | 'orange' | 'red' | 'neutral';
type Period = '30' | '90' | '365';

const TONE_COLOR: Record<Tone, string> = {
  green: COFICAB.ok,
  orange: COFICAB.warn,
  red: COFICAB.danger,
  neutral: COFICAB.navy,
};

/** Is a change an improvement? `null` when there is nothing to compare with. */
type Delta = { text: string; good: boolean | null; up: boolean | null };

function metricDelta(m: OverviewMetric, lowerIsBetter: boolean, unit: 'pts' | 'd' | '%'): Delta | null {
  if (m.value == null || m.previous == null) return null;
  const diff = unit === '%'
    ? (m.previous === 0 ? null : ((m.value - m.previous) / m.previous) * 100)
    : m.value - m.previous;
  if (diff == null) return null;
  const rounded = Math.round(diff * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  const suffix = unit === '%' ? ' %' : unit === 'pts' ? ' pts' : ' d';
  if (rounded === 0) return { text: `0${suffix}`, good: null, up: null };
  return { text: `${sign}${rounded.toLocaleString()}${suffix}`, good: lowerIsBetter ? rounded < 0 : rounded > 0, up: rounded > 0 };
}

function MetricCard({
  label, value, unit, tone, delta, sub, help, to, deltaLabel,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: Tone;
  delta?: Delta | null;
  sub?: string;
  help?: string;
  to?: string;
  deltaLabel?: string;
}) {
  const navigate = useNavigate();
  const color = TONE_COLOR[tone];
  const link = to
    ? {
        role: 'link' as const,
        tabIndex: 0,
        onClick: () => navigate(to),
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') navigate(to); },
      }
    : {};
  return (
    <div
      {...link}
      className={`rounded-xl bg-white shadow-sm px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${to ? 'cursor-pointer' : ''}`}
      style={{ border: `1px solid ${COFICAB.line}`, borderTop: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: COFICAB.muted }}>{label}</span>
        {help ? <DashInfoTip text={help} title={label} side="bottom" /> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold leading-none tabular-nums" style={{ color }}>{value}</span>
        {unit ? <span className="text-sm font-semibold" style={{ color: COFICAB.muted }}>{unit}</span> : null}
      </div>
      {delta ? (
        <div className="mt-1.5 text-xs font-semibold tabular-nums" style={{ color: delta.good == null ? COFICAB.muted : delta.good ? COFICAB.ok : COFICAB.danger }}>
          {delta.up == null ? '' : delta.up ? '▲ ' : '▼ '}{delta.text}
          <span className="font-normal" style={{ color: COFICAB.muted }}> {deltaLabel}</span>
        </div>
      ) : null}
      {sub ? <div className="text-[11px] mt-1" style={{ color: COFICAB.muted }}>{sub}</div> : null}
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide m-0" style={{ color: COFICAB.navy }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function RankedList({ title, rows, color, empty }: { title: string; rows: RankedItem[]; color: string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl bg-white shadow-sm p-4" style={{ border: `1px solid ${COFICAB.line}` }}>
      <h3 className="text-xs font-bold m-0 mb-3" style={{ color: COFICAB.ink }}>{title}</h3>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">{empty}</div>
      ) : (
        <ul className="m-0 p-0 list-none space-y-2.5">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold truncate" style={{ color: COFICAB.ink }}>{r.name}</span>
                <span className="tabular-nums shrink-0" style={{ color: COFICAB.muted }}>
                  <b style={{ color: COFICAB.ink }}>{r.count}</b> · {r.sharePct.toLocaleString()} %
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function monthLabel(m: string, locale: string) {
  const [y, mo] = m.split('-');
  if (!y || !mo) return m;
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

/**
 * The management overview. It answers five questions in order: are we on track, what needs action now,
 * where are the problems, are we improving, can we trust the data. Detail lives on the steering and indicators pages.
 */
export default function OverviewPage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('90');
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [model, setModel] = useState<ModelStatus>('unavailable');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchDashboardOverview(accessToken, Number(period)));
    } catch (err: any) {
      const status = err?.response?.status;
      setError(status === 401 || status === 403 ? t('adminDashboard.errorSession') : t('overviewPage.loadFailed'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, period, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetchModelStatus().then(setModel); }, []);

  const locale = i18n.language || 'fr';
  const days = Number(period);
  const h = data?.headline;
  const targets = data?.targets;
  const num = (n: number | null | undefined, digits = 0) =>
    n == null ? '—' : n.toLocaleString(locale, { maximumFractionDigits: digits });

  const onTimeTone: Tone = useMemo(() => {
    const v = h?.onTimeRate.value;
    if (v == null || !targets) return 'neutral';
    return v >= targets.onTimeGreen ? 'green' : v >= targets.onTimeOrange ? 'orange' : 'red';
  }, [h, targets]);

  const resolutionTone: Tone = useMemo(() => {
    const v = h?.avgResolutionDays.value;
    if (v == null || !targets) return 'neutral';
    return v <= targets.resolutionDays ? 'green' : v <= targets.resolutionDays * 1.5 ? 'orange' : 'red';
  }, [h, targets]);

  const ppmTone: Tone = useMemo(() => {
    const v = h?.ppm.value;
    const p = h?.ppm.previous;
    if (v == null || p == null || !targets) return 'neutral';
    return v <= p ? 'green' : v <= p * (1 + targets.ppmTolerancePct / 100) ? 'orange' : 'red';
  }, [h, targets]);

  const countTone = (n: number, bad: Tone = 'red'): Tone => (n > 0 ? bad : 'green');
  const vs = t('overviewPage.vsPrevious', { days });

  const actionCards = data ? [
    { key: 'validation', label: t('overviewPage.pendingValidation'), n: data.actions.pendingValidation, tone: countTone(data.actions.pendingValidation, 'orange'), to: '/pages/front/validations', help: t('overviewPage.help.pendingValidation') },
    { key: 'lateClaims', label: t('overviewPage.lateClaims'), n: data.actions.lateClaims, tone: countTone(data.actions.lateClaims), to: '/admin/claims/list?deadline=late', help: t('adminDashboard.help.claimsLate') },
    { key: 'noDeadline', label: t('overviewPage.noDeadline'), n: data.actions.noDeadline, tone: countTone(data.actions.noDeadline, 'orange'), to: '/admin/claims/list?deadline=none', help: t('adminDashboard.help.claimsNoDeadline') },
    { key: 'unassigned', label: t('overviewPage.unassigned'), n: data.actions.unassigned, tone: countTone(data.actions.unassigned, 'orange'), to: '/admin/claims/assignments', help: t('overviewPage.help.unassigned') },
    { key: 'latePlans', label: t('overviewPage.latePlans'), n: data.actions.latePlans, tone: countTone(data.actions.latePlans), to: '/admin/action-plans/dashboard', help: t('adminDashboard.help.plansLate') },
    { key: 'alerts', label: t('overviewPage.openAlerts'), n: data.actions.openAlerts, tone: countTone(data.actions.openAlerts), to: '/alerts', help: t('overviewPage.help.alerts') },
  ] : [];

  const trend = (data?.months ?? []).map((m) => ({
    month: monthLabel(m.month, locale),
    rate: m.onTimeRate,
    opened: m.opened,
    closed: m.closed,
  }));
  const tip = { borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` };

  const modelLabel = model === 'validated' ? t('overviewPage.modelValidated')
    : model === 'indicative' ? t('overviewPage.modelIndicative') : t('overviewPage.modelUnavailable');
  const modelTone: Tone = model === 'validated' ? 'green' : model === 'indicative' ? 'orange' : 'neutral';

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1" style={{ color: COFICAB.navy }}>
            {t('adminDashboard.overview.eyebrow')}
          </div>
          <h1 className="text-xl font-bold m-0" style={{ color: COFICAB.ink }}>{t('adminDashboard.navTitle')}</h1>
          <p className="text-sm mt-1 mb-0" style={{ color: COFICAB.muted }}>{t('adminDashboard.overview.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedToggle
            options={[
              { id: '30' as const, labelKey: 'overviewPage.period30' },
              { id: '90' as const, labelKey: 'overviewPage.period90' },
              { id: '365' as const, labelKey: 'overviewPage.period365' },
            ]}
            value={period}
            onChange={setPeriod}
            ariaLabel={t('overviewPage.periodLabel')}
          />
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

      {error && (
        <div className="mb-4 rounded-xl text-sm px-4 py-3" style={{ border: '1px solid #fecaca', background: COFICAB.dangerSoft, color: COFICAB.danger }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-[112px] rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : !data || !h || !targets ? null : (
        <>
          {/* 1. Are we on track? */}
          <Section title={t('overviewPage.q1')}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
              <MetricCard
                label={t('overviewPage.openClaims')}
                value={num(h.openClaims)}
                tone="neutral"
                sub={t('overviewPage.closedSub', { count: h.closedInPeriod, days })}
                to="/admin/claims/list"
                help={t('adminDashboard.help.claimsOpen')}
              />
              <MetricCard
                label={t('overviewPage.onTime')}
                value={num(h.onTimeRate.value, 1)}
                unit={h.onTimeRate.value == null ? undefined : '%'}
                tone={onTimeTone}
                delta={metricDelta(h.onTimeRate, false, 'pts')}
                deltaLabel={vs}
                sub={t('overviewPage.onTimeSub', { ok: h.onTimeCount, total: h.onTimeBase, target: targets.onTimeGreen })}
                help={t('overviewPage.help.onTime', { days })}
              />
              <MetricCard
                label={t('overviewPage.resolution')}
                value={num(h.avgResolutionDays.value, 1)}
                unit={h.avgResolutionDays.value == null ? undefined : t('overviewPage.daysUnit')}
                tone={resolutionTone}
                delta={metricDelta(h.avgResolutionDays, true, 'd')}
                deltaLabel={vs}
                sub={t('overviewPage.resolutionSub', { days: targets.resolutionDays })}
                help={t('overviewPage.help.resolution')}
              />
              <MetricCard
                label={t('overviewPage.ppm')}
                value={num(h.ppm.value)}
                tone={ppmTone}
                delta={metricDelta(h.ppm, true, '%')}
                deltaLabel={vs}
                sub={t('overviewPage.ppmSub', { count: h.ppmClaims })}
                help={t('overviewPage.help.ppm')}
              />
              <MetricCard
                label={t('overviewPage.latePlans')}
                value={num(h.latePlans)}
                tone={countTone(h.latePlans)}
                to="/admin/action-plans/dashboard"
                help={t('adminDashboard.help.plansLate')}
              />
              <MetricCard
                label={t('overviewPage.plansClosure')}
                value={num(h.plansClosureRate, 1)}
                unit="%"
                tone="neutral"
                help={t('overviewPage.help.plansClosure')}
              />
            </div>
          </Section>

          {/* 2. What needs action now? */}
          <Section title={t('overviewPage.q2')}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {actionCards.map((c) => (
                <MetricCard
                  key={c.key}
                  label={c.label}
                  value={num(c.n)}
                  tone={c.tone}
                  sub={c.n === 0 ? t('overviewPage.allClear') : undefined}
                  to={c.to}
                  help={c.help}
                />
              ))}
            </div>
            {data.actions.alerts.length > 0 && (
              <ul className="m-0 mt-3 p-0 list-none rounded-xl bg-white overflow-hidden" style={{ border: `1px solid ${COFICAB.line}` }}>
                {data.actions.alerts.map((a) => (
                  <li key={a.id} className="px-4 py-2 flex items-center gap-3 text-xs" style={{ borderBottom: `1px solid ${COFICAB.line}` }}>
                    <span className="font-bold" style={{ color: COFICAB.danger }}>{t('overviewPage.alert')}</span>
                    <span className="flex-1 min-w-0 truncate" style={{ color: COFICAB.ink }}>
                      {a.defectType} · {a.productionLine || '—'} · {t('overviewPage.alertLine', { count: a.currentCount, z: a.zScore })}
                    </span>
                    <button type="button" className="font-semibold hover:underline" style={{ color: COFICAB.navy }} onClick={() => navigate('/alerts')}>
                      {t('adminDashboard.view')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* 3. Where are the problems? */}
          <Section
            title={t('overviewPage.q3')}
            aside={<span className="text-[11px]" style={{ color: COFICAB.muted }}>{t('overviewPage.claimsInPeriod', { count: data.problems.claimsInPeriod, days })}</span>}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <RankedList title={t('overviewPage.topDefects')} rows={data.problems.topDefects} color={CLAIMS_ACCENT} empty={t('adminDashboard.noData')} />
              <RankedList title={t('overviewPage.topLines')} rows={data.problems.topLines} color={PLANS_ACCENT} empty={t('adminDashboard.noData')} />
              <RankedList title={t('overviewPage.topClients')} rows={data.problems.topClients} color={COFICAB.warn} empty={t('adminDashboard.noData')} />
            </div>
            <div className="mt-3 rounded-xl bg-white px-4 py-3 flex flex-wrap items-center gap-2 text-xs" style={{ border: `1px solid ${COFICAB.line}` }}>
              <span className="font-bold" style={{ color: COFICAB.ink }}>{t('overviewPage.rising')}</span>
              {data.problems.rising.length === 0 ? (
                <span style={{ color: COFICAB.muted }}>{t('overviewPage.noRising')}</span>
              ) : data.problems.rising.map((r) => (
                <span key={r.defectType} className="px-2 py-0.5 rounded-full font-semibold" style={{ background: COFICAB.dangerSoft, color: COFICAB.danger }}>
                  {t('overviewPage.risingLine', { defect: r.defectType, recent: r.recent, previous: r.previous })}
                </span>
              ))}
            </div>
          </Section>

          {/* 4. Are we improving? */}
          <Section title={t('overviewPage.q4')}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-xl bg-white shadow-sm p-4" style={{ border: `1px solid ${COFICAB.line}` }}>
                <h3 className="text-xs font-bold m-0 mb-1" style={{ color: COFICAB.ink }}>{t('overviewPage.onTimeTrend')}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={tip} formatter={(v: any) => (v == null ? '—' : `${v} %`)} />
                    <ReferenceLine y={targets.onTimeGreen} stroke={COFICAB.ok} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="rate" name={t('overviewPage.onTime')} stroke={CLAIMS_ACCENT} strokeWidth={2.4} dot connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <div className="text-[11px]" style={{ color: COFICAB.muted }}>{t('overviewPage.targetLine', { target: targets.onTimeGreen })}</div>
              </div>
              <div className="rounded-xl bg-white shadow-sm p-4" style={{ border: `1px solid ${COFICAB.line}` }}>
                <h3 className="text-xs font-bold m-0 mb-1" style={{ color: COFICAB.ink }}>{t('overviewPage.openedClosed')}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={trend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={tip} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="opened" name={t('adminDashboard.chartOpen')} fill={CLAIMS_ACCENT} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="closed" name={t('adminDashboard.chartClosed')} fill={COFICAB.ok} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Section>

          {/* 5. Can we trust the data? */}
          <Section title={t('overviewPage.q5')}>
            <div className="rounded-xl bg-white shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{ border: `1px solid ${COFICAB.line}` }}>
              <span>
                <b style={{ color: COFICAB.ink }}>{t('overviewPage.lastImport')}: </b>
                <span style={{ color: COFICAB.muted }}>
                  {data.health.lastImportAt
                    ? `${new Date(data.health.lastImportAt).toLocaleDateString(locale)} · ${data.health.lastImportName ?? ''}`
                    : t('overviewPage.noImport')}
                </span>
              </span>
              <span>
                <b style={{ color: COFICAB.ink }}>{t('overviewPage.profilesWithoutDepartment')}: </b>
                <span className="font-semibold" style={{ color: data.health.profilesWithoutDepartment > 0 ? COFICAB.warn : COFICAB.ok }}>
                  {data.health.profilesWithoutDepartment}
                </span>
              </span>
              <span>
                <b style={{ color: COFICAB.ink }}>{t('overviewPage.model')}: </b>
                <span className="font-semibold" style={{ color: TONE_COLOR[modelTone] }}>{modelLabel}</span>
              </span>
              {data.health.simulatedData && (
                <span className="px-2 py-0.5 rounded-full font-semibold" style={{ background: COFICAB.warnSoft, color: COFICAB.warn }}>
                  {t('overviewPage.simulated')}
                </span>
              )}
            </div>
          </Section>
        </>
      )}

      <footer
        className="mt-5 rounded-xl bg-white shadow-sm px-4 py-3.5 flex flex-wrap items-center gap-3"
        style={{ border: `1px solid ${COFICAB.line}` }}
      >
        <button
          type="button"
          onClick={() => navigate('/admin/action-plans/create')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: PLANS_ACCENT }}
        >
          {t('adminDashboard.footer.newPlan')}
        </button>
        <button type="button" onClick={() => navigate('/admin/audit-logs?module=capa')} className="text-xs font-semibold hover:underline" style={{ color: PLANS_ACCENT }}>
          {t('adminDashboard.footer.auditCapa')}
        </button>
        <div className="flex-1 min-w-[8px]" />
        <button
          type="button"
          onClick={() => navigate('/pages/front/quality-analyses/create')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl text-white shadow-sm hover:shadow-md transition-all"
          style={{ background: CLAIMS_ACCENT }}
        >
          {t('adminDashboard.footer.newClaim')}
        </button>
        <button type="button" onClick={() => navigate('/admin/audit-logs?module=quality')} className="text-xs font-semibold hover:underline" style={{ color: CLAIMS_ACCENT }}>
          {t('adminDashboard.footer.auditClaims')}
        </button>
      </footer>
    </div>
  );
}
