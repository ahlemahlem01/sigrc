import React, { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import type { GlobalDashboardKpis, MonthlyOpenClosed } from '../../../types/dashboardSummary';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB, PLANS_ACCENT } from './dashPalette';
import {
  buildPulseData,
  getHealthStatus,
  type PulseData,
  type PulsePeriod,
  type PulseScope,
} from './pulseData';

type Props = {
  data?: GlobalDashboardKpis | null;
  loading?: boolean;
  claimsMonthly?: MonthlyOpenClosed[] | null;
  plansMonthly?: MonthlyOpenClosed[] | null;
  pulse?: PulseData | null;
};

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const chartData = (values.length ? values : [0, 0]).map((v, i) => ({ i, v }));
  return (
    <div style={{ width: '100%', height: 30 }}>
      <ResponsiveContainer width="100%" height={30}>
        <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeltaArrow({
  deltaPercent,
  invert,
}: {
  deltaPercent: number;
  invert?: boolean;
}) {
  const flat = Math.abs(deltaPercent) < 0.05;
  const rawUp = deltaPercent > 0;
  const good = flat ? null : invert ? !rawUp : rawUp;
  const color = flat ? '#64748b' : good ? '#0f766e' : '#b91c1c';
  const icon = flat ? 'ti-minus' : rawUp ? 'ti-arrow-up' : 'ti-arrow-down';
  const label = `${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(deltaPercent % 1 === 0 ? 0 : 1)}%`;

  return (
    <span
      className="inline-flex items-center gap-0.5 text-xs font-bold tabular-nums"
      style={{ color }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
      {label}
    </span>
  );
}

function NetContextLabel({ total }: { total: number }) {
  const { t } = useTranslation();
  if (total > 2) {
    return (
      <span className="text-[11px] font-semibold" style={{ color: '#b91c1c' }}>
        {t('adminDashboard.pulse.backlogUp')}
      </span>
    );
  }
  if (total < -2) {
    return (
      <span className="text-[11px] font-semibold" style={{ color: '#0f766e' }}>
        {t('adminDashboard.pulse.backlogDown')}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-semibold" style={{ color: '#64748b' }}>
      {t('adminDashboard.pulse.backlogStable')}
    </span>
  );
}

function MetricColumn({
  label,
  help,
  total,
  claims,
  actions,
  trend,
  deltaPercent,
  invertDelta,
  accent,
  showNetContext,
  scope,
}: {
  label: string;
  help: string;
  total: number;
  claims: number;
  actions: number;
  trend: number[];
  deltaPercent?: number;
  invertDelta?: boolean;
  accent: string;
  showNetContext?: boolean;
  scope: PulseScope;
}) {
  const { t } = useTranslation();

  let footer: string;
  if (scope === 'claims') {
    footer = t('adminDashboard.pulse.breakdownClaimsOnly', { count: claims });
  } else if (scope === 'plans') {
    footer = t('adminDashboard.pulse.breakdownPlansOnly', { count: actions });
  } else {
    footer = t('adminDashboard.pulse.breakdown', { claims, actions });
  }

  return (
    <div className="min-w-0 px-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: COFICAB.muted }}
        >
          {label}
        </span>
        <DashInfoTip text={help} title={label} side="bottom" />
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="text-[28px] font-extrabold tabular-nums leading-none"
          style={{ color: accent }}
        >
          {total}
        </span>
        {typeof deltaPercent === 'number' && (
          <DeltaArrow deltaPercent={deltaPercent} invert={invertDelta} />
        )}
      </div>

      {showNetContext && (
        <div className="mt-1">
          <NetContextLabel total={total} />
        </div>
      )}

      <div className="mt-1.5">
        <Sparkline values={trend} color={accent} />
      </div>

      <div className="text-[11px] mt-0.5" style={{ color: COFICAB.muted }}>
        {footer}
      </div>
    </div>
  );
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: PulseScope;
  onChange: (s: PulseScope) => void;
}) {
  const { t } = useTranslation();
  const options: { id: PulseScope; labelKey: string; accent: string }[] = [
    { id: 'all', labelKey: 'adminDashboard.pulse.scopeAll', accent: COFICAB.navy },
    { id: 'claims', labelKey: 'adminDashboard.pulse.scopeClaims', accent: CLAIMS_ACCENT },
    { id: 'plans', labelKey: 'adminDashboard.pulse.scopePlans', accent: PLANS_ACCENT },
  ];

  return (
    <div
      className="inline-flex rounded-xl p-0.5"
      style={{ border: `1px solid ${COFICAB.line}`, background: '#fff' }}
      role="group"
      aria-label={t('adminDashboard.pulse.scopeLabel')}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className="px-2.5 py-1.5 text-[11px] font-bold rounded-[10px] transition-colors"
            style={
              on
                ? { background: o.accent, color: '#fff' }
                : { background: 'transparent', color: COFICAB.muted }
            }
          >
            {t(o.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/** Pulse Global — stats séparables Claims / Action Plans / Global. */
export default function DashboardSummaryBar({
  data,
  loading,
  claimsMonthly,
  plansMonthly,
  pulse: pulseProp,
}: Props) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<PulsePeriod>('month');
  const [scope, setScope] = useState<PulseScope>('all');

  const pulse = useMemo(() => {
    if (pulseProp) return pulseProp;
    return buildPulseData(
      claimsMonthly,
      plansMonthly,
      period,
      data?.globalClosureRate ?? 0,
      scope,
    );
  }, [pulseProp, claimsMonthly, plansMonthly, period, scope, data?.globalClosureRate]);

  const health = useMemo(() => {
    if (!pulse) {
      return getHealthStatus({ closureRate: data?.globalClosureRate ?? 0, backlogDelta: 0 });
    }
    return getHealthStatus({
      closureRate: pulse.closureRate,
      backlogDelta: pulse.backlogDelta,
    });
  }, [pulse, data?.globalClosureRate]);

  const periodOptions: { id: PulsePeriod; labelKey: string }[] = [
    { id: 'month', labelKey: 'adminDashboard.pulse.periodMonth' },
    { id: '3m', labelKey: 'adminDashboard.pulse.period3m' },
    { id: '6m', labelKey: 'adminDashboard.pulse.period6m' },
  ];

  const accent =
    scope === 'claims' ? CLAIMS_ACCENT : scope === 'plans' ? PLANS_ACCENT : COFICAB.navy;
  const closedAccent = COFICAB.ok;

  const titleKey =
    scope === 'claims'
      ? 'adminDashboard.pulse.titleClaims'
      : scope === 'plans'
        ? 'adminDashboard.pulse.titlePlans'
        : 'adminDashboard.pulse.title';

  return (
    <section
      className="rounded-xl bg-white shadow-sm px-4 py-4 mb-5"
      style={{
        border: `1px solid ${COFICAB.line}`,
        background: `linear-gradient(135deg, ${COFICAB.light} 0%, #fff 65%)`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <i className="ti ti-activity-heartbeat" style={{ fontSize: 18, color: accent }} />
          <h2 className="text-sm font-bold m-0" style={{ color: COFICAB.ink }}>
            {t(titleKey)}
          </h2>
          <DashInfoTip
            text={t('adminDashboard.help.pulse')}
            title={t(titleKey)}
            side="bottom"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ color: health.color, background: health.bg }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: health.color }}
            />
            {t(health.labelKey)}
          </span>

          <ScopeToggle value={scope} onChange={setScope} />

          <label className="relative inline-flex items-center">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PulsePeriod)}
              className="appearance-none text-[11px] font-semibold pl-2.5 pr-7 py-1.5 rounded-lg border bg-white cursor-pointer"
              style={{ borderColor: COFICAB.line, color: COFICAB.ink }}
              aria-label={t('adminDashboard.pulse.periodLabel')}
            >
              {periodOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
            <i
              className="ti ti-chevron-down pointer-events-none absolute right-2"
              style={{ fontSize: 12, color: COFICAB.muted }}
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[110px] rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : !pulse ? (
        <div className="text-sm py-6 text-center" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.evolution.noData')}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-4 sm:divide-x"
          style={{ borderColor: COFICAB.line }}
        >
          <div className="sm:pr-4">
            <MetricColumn
              label={t('adminDashboard.evolution.opened')}
              help={t('adminDashboard.help.pulseOpened')}
              total={pulse.opened.total}
              claims={pulse.opened.claims}
              actions={pulse.opened.actions}
              trend={pulse.opened.trend}
              deltaPercent={pulse.opened.deltaPercent}
              invertDelta
              accent={accent}
              scope={scope}
            />
          </div>
          <div className="sm:px-4">
            <MetricColumn
              label={t('adminDashboard.evolution.closed')}
              help={t('adminDashboard.help.pulseClosed')}
              total={pulse.closed.total}
              claims={pulse.closed.claims}
              actions={pulse.closed.actions}
              trend={pulse.closed.trend}
              deltaPercent={pulse.closed.deltaPercent}
              accent={closedAccent}
              scope={scope}
            />
          </div>
          <div className="sm:pl-4">
            <MetricColumn
              label={t('adminDashboard.evolution.backlog')}
              help={t('adminDashboard.help.pulseNet')}
              total={pulse.netLoad.total}
              claims={pulse.netLoad.claims}
              actions={pulse.netLoad.actions}
              trend={pulse.netLoad.trend}
              deltaPercent={(() => {
                const prev = pulse.netLoad.total - pulse.backlogDelta;
                if (prev === 0) return pulse.backlogDelta === 0 ? 0 : 100;
                return Math.round((pulse.backlogDelta / Math.abs(prev)) * 1000) / 10;
              })()}
              invertDelta
              accent={COFICAB.ink}
              showNetContext
              scope={scope}
            />
          </div>
        </div>
      )}
    </section>
  );
}
