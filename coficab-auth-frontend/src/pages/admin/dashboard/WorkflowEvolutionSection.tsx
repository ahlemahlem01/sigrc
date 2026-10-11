import React from 'react';
import { useTranslation } from 'react-i18next';
import type { MonthlyOpenClosed } from '../../../types/dashboardSummary';
import DashInfoTip from './DashInfoTip';
import TrendBadge from './TrendBadge';
import { COFICAB } from './dashPalette';
import {
  computeGlobalEvolution,
  formatMonthKey,
  formatSigned,
  type StreamEvolution,
} from './workflowEvolution';

type Props = {
  claimsMonthly?: MonthlyOpenClosed[] | null;
  plansMonthly?: MonthlyOpenClosed[] | null;
  loading?: boolean;
};

function DualBar({
  prev,
  curr,
  accent,
  okColor,
}: {
  prev: number;
  curr: number;
  accent: string;
  okColor: string;
}) {
  const max = Math.max(prev, curr, 1);
  const prevPct = Math.round((prev / max) * 100);
  const currPct = Math.round((curr / max) * 100);

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="h-2 rounded-full overflow-hidden" style={{ background: COFICAB.soft }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${prevPct}%`, background: '#94a3b8', opacity: 0.85 }}
        />
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: COFICAB.soft }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${currPct}%`,
            background: curr >= prev ? okColor : accent,
          }}
        />
      </div>
    </div>
  );
}

function MetricCompare({
  label,
  prevValue,
  currValue,
  delta,
  invert,
  accent,
  okColor,
}: {
  label: string;
  prevValue: number;
  currValue: number;
  delta: number;
  invert?: boolean;
  accent: string;
  okColor: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: COFICAB.soft, border: `1px solid ${COFICAB.line}` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: COFICAB.muted }}>
        {label}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-2 gap-y-1 items-center text-xs">
        <span style={{ color: COFICAB.muted }}>{prevValue}</span>
        <i className="ti ti-arrow-right" style={{ fontSize: 12, color: '#94a3b8' }} />
        <span className="font-extrabold tabular-nums" style={{ color: accent }}>{currValue}</span>
        <TrendBadge delta={delta} invert={invert} />
      </div>
      <DualBar prev={prevValue} curr={currValue} accent={accent} okColor={okColor} />
    </div>
  );
}

function StreamCard({
  title,
  accent,
  evo,
  loading,
  locale,
}: {
  title: string;
  accent: string;
  evo: StreamEvolution | null;
  loading?: boolean;
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-xl bg-white px-4 py-4 flex flex-col gap-3"
      style={{ border: `1px solid ${COFICAB.line}` }}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        <h3 className="text-sm font-bold m-0" style={{ color: COFICAB.ink }}>{title}</h3>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      ) : !evo ? (
        <div className="text-xs py-6 text-center" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.evolution.noData')}
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-2 gap-2 rounded-lg px-3 py-2 text-center"
            style={{ background: COFICAB.light, border: `1px solid ${COFICAB.line}` }}
          >
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: COFICAB.muted }}>
                {t('adminDashboard.evolution.previousMonth')}
              </div>
              <div className="text-xs font-bold capitalize" style={{ color: COFICAB.ink }}>
                {formatMonthKey(evo.prevMonth, locale)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: COFICAB.navy }}>
                {t('adminDashboard.evolution.currentMonth')}
              </div>
              <div className="text-xs font-bold capitalize" style={{ color: COFICAB.navy }}>
                {formatMonthKey(evo.month, locale)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] px-1" style={{ color: COFICAB.muted }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-1.5 rounded-full bg-slate-400" />
              {t('adminDashboard.evolution.previousMonth')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 rounded-full" style={{ background: accent }} />
              {t('adminDashboard.evolution.currentMonth')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <MetricCompare
              label={t('adminDashboard.evolution.opened')}
              prevValue={evo.prevOpened}
              currValue={evo.opened}
              delta={evo.openedDelta}
              invert
              accent={accent}
              okColor={COFICAB.ok}
            />
            <MetricCompare
              label={t('adminDashboard.evolution.closed')}
              prevValue={evo.prevClosed}
              currValue={evo.closed}
              delta={evo.closedDelta}
              accent={accent}
              okColor={COFICAB.ok}
            />
            <MetricCompare
              label={t('adminDashboard.evolution.net')}
              prevValue={evo.prevNetBacklog}
              currValue={evo.netBacklog}
              delta={evo.backlogDelta}
              invert
              accent={accent}
              okColor={COFICAB.ok}
            />
          </div>

          <p className="text-[11px] m-0 leading-snug font-semibold" style={{ color: COFICAB.ink }}>
            {evo.backlogDelta < 0
              ? t('adminDashboard.evolution.improving')
              : evo.backlogDelta > 0
                ? t('adminDashboard.evolution.worsening')
                : t('adminDashboard.evolution.stable')}
          </p>
          <p className="text-[10px] m-0" style={{ color: COFICAB.muted }}>
            {t('adminDashboard.evolution.netDetail', {
              prev: formatSigned(evo.prevNetBacklog),
              curr: formatSigned(evo.netBacklog),
            })}
          </p>
        </>
      )}
    </div>
  );
}

/** Comparaison détaillée Claims / Action Plans (Pulse Global est dans DashboardSummaryBar). */
export default function WorkflowEvolutionSection({ claimsMonthly, plansMonthly, loading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  const global = computeGlobalEvolution(claimsMonthly, plansMonthly);
  const claimsEvo = global.claims;
  const plansEvo = global.plans;

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold m-0" style={{ color: COFICAB.ink }}>
            {t('adminDashboard.evolution.title')}
          </h2>
          <DashInfoTip
            text={t('adminDashboard.help.evolution')}
            title={t('adminDashboard.evolution.title')}
            side="bottom"
          />
        </div>
        <p className="text-[11px] m-0" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.evolution.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <StreamCard
          title={t('adminDashboard.claims.title')}
          accent={COFICAB.navy}
          evo={claimsEvo}
          loading={loading}
          locale={locale}
        />
        <StreamCard
          title={t('adminDashboard.actionPlans.title')}
          accent={COFICAB.mid}
          evo={plansEvo}
          loading={loading}
          locale={locale}
        />
      </div>
    </section>
  );
}
