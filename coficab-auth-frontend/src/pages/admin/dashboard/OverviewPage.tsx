import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import SegmentedToggle from '../../../components/SegmentedToggle';
import { fetchDashboardOverview } from '../../../services/dashboardOverviewService';
import { exportOverviewPdf } from '../../../utils/overviewPdfExport';
import { normalizeRoles } from '../../../utils/roles';
import OverviewTargetsDialog from './OverviewTargetsDialog';
import { severityKey } from '../../../utils/overviewSeverity';
import type { OverviewAging, OverviewData, OverviewMetric, RankedItem } from '../../../types/dashboardOverview';
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

function Section({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold m-0" style={{ color: COFICAB.ink }}>{title}</h2>
          {hint ? <DashInfoTip text={hint} title={title} side="bottom" /> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function WatchCard({
  title, help, value, tone, sub, to, children,
}: { title: string; help: string; value: string; tone: Tone; sub?: string; to?: string; children?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div
      className="rounded-xl bg-white shadow-sm px-4 py-3"
      style={{ border: `1px solid ${COFICAB.line}`, borderTop: `3px solid ${TONE_COLOR[tone]}` }}
    >
      <div className="flex items-center justify-between gap-2">
        {to ? (
          <button type="button" onClick={() => navigate(to)} className="text-[11px] font-bold uppercase tracking-wide hover:underline text-left" style={{ color: COFICAB.muted }}>
            {title}
          </button>
        ) : (
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: COFICAB.muted }}>{title}</span>
        )}
        <DashInfoTip text={help} title={title} side="bottom" />
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[28px] font-extrabold leading-none tabular-nums" style={{ color: TONE_COLOR[tone] }}>{value}</span>
        {sub ? <span className="text-xs" style={{ color: COFICAB.muted }}>{sub}</span> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function MiniRows({ rows, empty }: { rows: { key: string; left: string; sub?: string; right: string }[]; empty: string }) {
  if (rows.length === 0) return <div className="text-xs" style={{ color: COFICAB.muted }}>{empty}</div>;
  return (
    <ul className="m-0 p-0 list-none divide-y" style={{ borderColor: COFICAB.line }}>
      {rows.map((r) => (
        <li key={r.key} className="py-1.5 flex items-center gap-2 text-xs" style={{ borderColor: COFICAB.line }}>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate" style={{ color: COFICAB.ink }}>{r.left}</div>
            {r.sub ? <div className="truncate" style={{ color: COFICAB.muted }}>{r.sub}</div> : null}
          </div>
          <span className="shrink-0 font-bold tabular-nums" style={{ color: COFICAB.ink }}>{r.right}</span>
        </li>
      ))}
    </ul>
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

// Yellow, orange, red: three clearly different steps of urgency.
const AGING_COLORS = ['#ca8a04', '#ea580c', '#dc2626'];

/** How long the late items have been late: one compact table, a row per kind of item, a column per age band. */
function AgingTable({ title, bands, rows, none, onOpen }: {
  title: string;
  bands: [string, string, string];
  rows: { label: string; aging: OverviewAging; sub?: string; to?: string }[];
  none: string;
  onOpen: (to: string) => void;
}) {
  return (
    <div className="mt-3 rounded-xl bg-white shadow-sm px-4 py-1.5" style={{ border: `1px solid ${COFICAB.line}` }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px]" style={{ color: COFICAB.muted }}>
            <th className="text-left font-semibold py-1">{title}</th>
            {bands.map((b, i) => (
              <th key={b} className="text-right font-semibold py-1">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: AGING_COLORS[i] }} />{b}
              </th>
            ))}
            <th className="text-right font-semibold py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const parts = [r.aging.under30, r.aging.from30To90, r.aging.over90];
            const total = parts.reduce((x, y) => x + y, 0);
            return (
              <tr
                key={r.label}
                style={{ borderTop: `1px solid ${COFICAB.line}`, cursor: r.to ? 'pointer' : undefined }}
                className={r.to ? 'hover:bg-slate-50' : undefined}
                onClick={r.to ? () => onOpen(r.to!) : undefined}
              >
                <td className="py-1.5 font-semibold" style={{ color: COFICAB.ink }}>{r.label}</td>
                {total === 0 ? (
                  <td colSpan={4} className="py-1.5 text-right text-xs font-semibold" style={{ color: COFICAB.ok }}>{none}</td>
                ) : (
                  <>
                    {parts.map((n, i) => (
                      <td key={i} className="py-1.5 text-right tabular-nums">
                        <b style={{ color: n > 0 ? AGING_COLORS[i] : COFICAB.muted }}>{n}</b>
                        <span className="text-[11px] ml-1" style={{ color: COFICAB.muted }}>({Math.round((n / total) * 100)} %)</span>
                      </td>
                    ))}
                    <td className="py-1.5 text-right tabular-nums font-bold" style={{ color: COFICAB.ink }}>
                      {total}
                      {r.sub && <span className="text-[11px] font-normal ml-1" style={{ color: COFICAB.muted }}>· {r.sub}</span>}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const { accessToken, user } = useAuth();
  const isSuperAdmin = normalizeRoles(user).includes('superadmin');
  const [editingTargets, setEditingTargets] = useState(false);
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('90');
  const [organizationId, setOrganizationId] = useState('');
  // the comparison table must keep listing every organization while one of them is selected
  const [knownOrganizations, setKnownOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchDashboardOverview(accessToken, Number(period), organizationId || undefined);
      setData(result);
      setKnownOrganizations((previous) => {
        const fresh = result.organizations.filter((o) => o.organizationId).map((o) => ({ id: o.organizationId as string, name: o.name }));
        const merged = new Map(previous.map((o) => [o.id, o]));
        fresh.forEach((o) => merged.set(o.id, o));
        return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
      });
    } catch (err: any) {
      const status = err?.response?.status;
      setError(status === 401 || status === 403 ? t('adminDashboard.errorSession') : t('overviewPage.loadFailed'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, period, organizationId, t]);

  useEffect(() => { void load(); }, [load]);

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
  const share = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 0);
  // a plain reading of the share of late claims: up to 10 % is under control, beyond 25 % it is a real problem
  const shareTone = (pct: number): Tone => (pct <= 10 ? 'green' : pct <= 25 ? 'orange' : 'red');
  const severityLabel = (raw: string) => t(`overviewPage.severity.${severityKey(raw)}`);
  const vs = t('overviewPage.vsPrevious', { days });

  const actionCards = data ? [
    { key: 'validation', label: t('overviewPage.pendingValidation'), n: data.actions.pendingValidation, tone: countTone(data.actions.pendingValidation, 'orange'), to: '/pages/front/validations', help: t('overviewPage.help.pendingValidation') },
    { key: 'noDeadline', label: t('overviewPage.noDeadline'), n: data.actions.noDeadline, tone: countTone(data.actions.noDeadline, 'orange'), to: '/admin/claims/list?deadline=none', help: t('adminDashboard.help.claimsNoDeadline') },
    { key: 'unassigned', label: t('overviewPage.unassigned'), n: data.actions.unassigned, tone: countTone(data.actions.unassigned, 'orange'), to: '/admin/claims/assignments', help: t('overviewPage.help.unassigned') },
  ] : [];

  const trend = (data?.months ?? []).map((m) => ({
    month: monthLabel(m.month, locale),
    rate: m.onTimeRate,
    opened: m.opened,
    closed: m.closed,
  }));
  const tip = { borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` };

  return (
    <div className="pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1" style={{ color: COFICAB.navy }}>
            {t('adminDashboard.overview.eyebrow')}
          </div>
          <h1 className="text-xl font-bold m-0" style={{ color: COFICAB.ink }}>{t('adminDashboard.navTitle')}</h1>
          <p className="text-sm mt-1 mb-0" style={{ color: COFICAB.muted }}>{t('adminDashboard.overview.subtitle')}</p>
          {data && (
            <p className="text-[11px] mt-1 mb-0" style={{ color: COFICAB.muted }}>
              {t('overviewPage.updatedAt', { date: new Date(data.generatedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) })}
            </p>
          )}
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
          {knownOrganizations.length > 1 && (
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              aria-label={t('overviewPage.organizationLabel')}
              className="px-3 py-2 text-xs font-semibold rounded-xl border bg-white"
              style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
            >
              <option value="">{t('overviewPage.allOrganizations')}</option>
              {knownOrganizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {isSuperAdmin && data && (
            <button
              type="button"
              onClick={() => setEditingTargets(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border bg-white transition-all hover:shadow-sm"
              style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
            >
              <i className="ti ti-target" /> {t('overviewPage.targetsButton')}
            </button>
          )}
          <button
            type="button"
            disabled={!data}
            onClick={() => data && exportOverviewPdf(data, t as unknown as (k: string, o?: Record<string, unknown>) => string, locale)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border bg-white transition-all hover:shadow-sm disabled:opacity-50"
            style={{ borderColor: COFICAB.line, color: COFICAB.navy }}
          >
            <i className="ti ti-file-type-pdf" /> {t('overviewPage.exportPdf')}
          </button>
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

      {data?.scope.organizationId && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: COFICAB.light, color: COFICAB.navy }}>
          {t('overviewPage.scopeBadge', { name: data.scope.organizationName ?? '' })}
          <button type="button" onClick={() => setOrganizationId('')} className="underline font-bold">{t('overviewPage.clearScope')}</button>
        </div>
      )}

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
          <Section title={t('overviewPage.q1')} hint={t('overviewPage.hint.q1', { days })}>
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
                label={t('overviewPage.lateShare')}
                value={num(share(data.actions.lateClaims, h.openClaims), 1)}
                unit="%"
                tone={h.openClaims === 0 ? 'neutral' : shareTone(share(data.actions.lateClaims, h.openClaims))}
                sub={t('overviewPage.lateShareSub', { late: num(data.actions.lateClaims), open: num(h.openClaims) })}
                to="/admin/claims/list?deadline=late"
                help={t('overviewPage.help.lateShare')}
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
                label={t('overviewPage.plansClosure')}
                value={num(h.plansClosureRate, 1)}
                unit="%"
                tone="neutral"
                help={t('overviewPage.help.plansClosure')}
              />
            </div>
          </Section>

          {/* 0. How do the organizations compare? */}
          {data.organizations.length > 1 && (
            <Section title={t('overviewPage.q0')} hint={t('overviewPage.hint.q0', { days })}>
              <div className="rounded-xl bg-white shadow-sm overflow-x-auto" style={{ border: `1px solid ${COFICAB.line}` }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: COFICAB.muted, background: COFICAB.light }}>
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px]">{t('overviewPage.colOrganization')}</th>
                      {[
                        ['colOpen', 'right'], ['colLate', 'right'], ['colNoDeadline', 'right'], ['colValidation', 'right'],
                        ['colOnTime', 'right'], ['colPpm', 'right'], ['colLatePlans', 'right'], ['colEmployees', 'right'],
                      ].map(([k]) => (
                        <th key={k} className="text-right px-3 py-2 font-bold uppercase tracking-wide text-[10px] whitespace-nowrap">{t(`overviewPage.${k}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.organizations.map((o) => {
                      const selected = !!o.organizationId && o.organizationId === organizationId;
                      const rate = o.onTimeRate;
                      const rateTone: Tone = rate == null ? 'neutral' : rate >= targets.onTimeGreen ? 'green' : rate >= targets.onTimeOrange ? 'orange' : 'red';
                      const clickable = !!o.organizationId;
                      return (
                        <tr
                          key={o.organizationId ?? 'none'}
                          onClick={clickable ? () => setOrganizationId(selected ? '' : (o.organizationId as string)) : undefined}
                          className={clickable ? 'cursor-pointer hover:bg-slate-50' : ''}
                          style={{ borderTop: `1px solid ${COFICAB.line}`, background: selected ? COFICAB.light : undefined }}
                        >
                          <td className="px-3 py-2 font-semibold" style={{ color: o.organizationId ? COFICAB.ink : COFICAB.muted }}>
                            {o.organizationId ? o.name : t('overviewPage.unattributed')}
                            {selected && <span className="ml-1.5 text-[10px] font-bold" style={{ color: COFICAB.navy }}>● {t('overviewPage.selected')}</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{num(o.openClaims)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: o.lateClaims > 0 ? COFICAB.danger : COFICAB.ok }}>{num(o.lateClaims)}
                            {o.openClaims > 0 && <span className="font-normal" style={{ color: COFICAB.muted }}> · {num(share(o.lateClaims, o.openClaims), 0)} %</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: o.noDeadline > 0 ? COFICAB.warn : COFICAB.muted }}>{num(o.noDeadline)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: o.pendingValidation > 0 ? COFICAB.warn : COFICAB.muted }}>{num(o.pendingValidation)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: TONE_COLOR[rateTone] }}>
                            {rate == null ? '—' : `${num(rate, 1)} %`}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(o.ppm)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: o.latePlans > 0 ? COFICAB.danger : COFICAB.muted }}>{o.organizationId ? num(o.latePlans) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: COFICAB.muted }}>{o.organizationId ? num(o.employees) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] mt-2 mb-0" style={{ color: COFICAB.muted }}>{t('overviewPage.comparisonNote')}</p>
            </Section>
          )}

          {/* À traiter en premier */}
          <Section title={t('overviewPage.first')} hint={t('overviewPage.hint.first')}>
            {data.priority.length === 0 ? (
              <div className="rounded-xl bg-white shadow-sm px-4 py-4 text-sm font-semibold" style={{ border: `1px solid ${COFICAB.line}`, color: COFICAB.ok }}>
                {t('overviewPage.firstNone')}
              </div>
            ) : (
              <ol className="m-0 p-0 list-none rounded-xl bg-white shadow-sm overflow-hidden" style={{ border: `1px solid ${COFICAB.line}` }}>
                {data.priority.map((c, i) => {
                  const sev = c.severity.toUpperCase();
                  const critical = sev.includes('CRIT');
                  const high = sev.includes('HIGH') || sev.includes('ELEV');
                  const chip = critical ? { bg: COFICAB.dangerSoft, fg: COFICAB.danger } : high ? { bg: COFICAB.warnSoft, fg: COFICAB.warn } : { bg: COFICAB.light, fg: COFICAB.navy };
                  return (
                    <li
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/pages/front/quality-analyses?focus=${c.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/pages/front/quality-analyses?focus=${c.id}`); }}
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50"
                      style={{ borderTop: i === 0 ? undefined : `1px solid ${COFICAB.line}` }}
                    >
                      <span className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white" style={{ background: critical ? COFICAB.danger : COFICAB.navy }}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate" style={{ color: COFICAB.ink }}>{c.title}</div>
                        <div className="text-[11px] truncate" style={{ color: COFICAB.muted }}>
                          {c.clientId} · {c.responsibleName || <b style={{ color: COFICAB.warn }}>{t('claimDetail.unassigned')}</b>}
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: chip.bg, color: chip.fg }}>{severityLabel(c.severity)}</span>
                      <span className="shrink-0 w-20 text-right text-xs font-bold tabular-nums" style={{ color: COFICAB.danger }}>
                        {t('overviewPage.firstLate', { count: c.overdueDays })}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          {/* 2. What needs action now? */}
          <Section title={t('overviewPage.q2')} hint={t('overviewPage.hint.q2')}>
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
            <AgingTable
              title={t('overviewPage.agingTitle')}
              bands={[t('overviewPage.agingUnder30'), t('overviewPage.aging30to90'), t('overviewPage.agingOver90')]}
              rows={[
                { label: t('overviewPage.agingClaims'), aging: data.claimAging, to: '/admin/claims/list?deadline=late', sub: t('overviewPage.lateOfOpen', { pct: num(share(data.actions.lateClaims, h.openClaims), 1) }) },
                { label: t('overviewPage.agingPlans'), aging: data.capa.aging, to: '/admin/action-plans/dashboard', sub: t('overviewPage.lateOfOpen', { pct: num(share(data.capa.latePlans, data.capa.openPlans), 1) }) },
              ]}
              none={t('overviewPage.agingNone')}
              onOpen={(to) => navigate(to)}
            />
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

          {/* CAPA: the counterpart of the claims figures */}
          <Section title={t('overviewPage.qCapa')} hint={t('overviewPage.hint.qCapa')}>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              <MetricCard
                label={t('overviewPage.capaOpenPlans')}
                value={num(data.capa.openPlans)}
                tone="neutral"
                sub={t('overviewPage.capaOpenPlansSub', { actions: num(data.capa.openActions) })}
                to="/admin/action-plans/dashboard"
              />
              <MetricCard
                label={t('overviewPage.capaLateActions')}
                value={num(data.capa.lateActions)}
                tone={data.capa.openActions === 0 ? 'neutral' : countTone(data.capa.lateActions)}
                sub={t('overviewPage.capaLateActionsSub', { open: num(data.capa.openActions) })}
                help={t('overviewPage.help.capaLateActions')}
              />
              <MetricCard
                label={t('overviewPage.capaOnTime')}
                value={num(data.capa.onTimeRate, 1)}
                unit={data.capa.onTimeRate == null ? undefined : '%'}
                tone={data.capa.onTimeRate == null ? 'neutral' : data.capa.onTimeRate >= targets.onTimeGreen ? 'green' : data.capa.onTimeRate >= targets.onTimeOrange ? 'orange' : 'red'}
                sub={t('overviewPage.capaOnTimeSub', { ok: data.capa.onTimeCount, total: data.capa.onTimeBase, days })}
                help={t('overviewPage.help.capaOnTime')}
              />
              <MetricCard
                label={t('overviewPage.capaClosure')}
                value={num(data.capa.avgClosureDays, 1)}
                unit={data.capa.avgClosureDays == null ? undefined : t('overviewPage.daysUnit')}
                tone="neutral"
                sub={t('overviewPage.capaClosureSub', { count: data.capa.closedInPeriod, days })}
              />
              <MetricCard
                label={t('overviewPage.capaAwaiting')}
                value={num(data.capa.actionsAwaitingValidation)}
                tone={countTone(data.capa.actionsAwaitingValidation, 'orange')}
                sub={t('overviewPage.capaAwaitingSub')}
                to="/admin/action-plans/dashboard"
                help={t('overviewPage.help.capaAwaiting')}
              />
            </div>
            <div className="mt-3 rounded-xl bg-white px-4 py-3 flex flex-wrap items-center gap-2 text-xs" style={{ border: `1px solid ${COFICAB.line}` }}>
              <span className="font-bold" style={{ color: COFICAB.ink }}>{t('overviewPage.capaTypes')}</span>
              {data.capa.byType.map((x) => (
                <span key={x.type} className="px-2 py-0.5 rounded-full font-semibold" style={{ background: COFICAB.light, color: COFICAB.navy }}>
                  {x.type} · {x.openPlans}
                  {x.latePlans > 0 && <span style={{ color: COFICAB.danger }}> ({t('overviewPage.lateCount', { count: x.latePlans })})</span>}
                </span>
              ))}
            </div>
          </Section>

          {/* Customers where the risk sits */}
          <Section title={t('overviewPage.qClients')} hint={t('overviewPage.hint.qClients')}>
            <div className="rounded-xl bg-white shadow-sm overflow-x-auto" style={{ border: `1px solid ${COFICAB.line}` }}>
              {data.clients.length === 0 ? (
                <div className="px-4 py-4 text-sm" style={{ color: COFICAB.muted }}>{t('overviewPage.clientsNone')}</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: COFICAB.muted, background: COFICAB.light }}>
                      <th className="text-left px-3 py-2 font-bold uppercase tracking-wide text-[10px]">{t('overviewPage.colClient')}</th>
                      {['colOpen', 'colCritical', 'colLate', 'colLateShare', 'colOnTime', 'colPpm'].map((k) => (
                        <th key={k} className="text-right px-3 py-2 font-bold uppercase tracking-wide text-[10px] whitespace-nowrap">{t(`overviewPage.${k}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => {
                      const rate = c.onTimeRate;
                      const rateTone: Tone = rate == null ? 'neutral' : rate >= targets.onTimeGreen ? 'green' : rate >= targets.onTimeOrange ? 'orange' : 'red';
                      const lateShare = share(c.lateClaims, c.openClaims);
                      return (
                        <tr key={c.clientId} style={{ borderTop: `1px solid ${COFICAB.line}` }}>
                          <td className="px-3 py-2 font-semibold" style={{ color: COFICAB.ink }}>{c.clientId}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{num(c.openClaims)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: c.criticalOpen > 0 ? COFICAB.danger : COFICAB.muted }}>{num(c.criticalOpen)}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.lateClaims > 0 ? COFICAB.danger : COFICAB.muted }}>{num(c.lateClaims)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: TONE_COLOR[shareTone(lateShare)] }}>{num(lateShare, 0)} %</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: TONE_COLOR[rateTone] }}>{rate == null ? '—' : `${num(rate, 1)} %`}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(c.ppm)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[11px] mt-2 mb-0" style={{ color: COFICAB.muted }}>{t('overviewPage.clientsNote')}</p>
          </Section>

          {/* 3. Where are the problems? */}
          <Section
            title={t('overviewPage.q3')}
            hint={t('overviewPage.hint.q3', { days })}
            aside={<span className="text-[11px]" style={{ color: COFICAB.muted }}>{t('overviewPage.claimsInPeriod', { count: data.problems.claimsInPeriod, days })}</span>}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <RankedList title={t('overviewPage.topDefects')} rows={data.problems.topDefects} color={CLAIMS_ACCENT} empty={t('adminDashboard.noData')} />
              <RankedList title={t('overviewPage.topLines')} rows={data.problems.topLines} color={PLANS_ACCENT} empty={t('adminDashboard.noData')} />
              <RankedList title={t('overviewPage.topClients')} rows={data.problems.topClients} color={COFICAB.warn} empty={t('adminDashboard.noData')} />
            </div>
            <div className="mt-3 rounded-xl bg-white px-4 py-3 flex flex-wrap items-center gap-2 text-xs" style={{ border: `1px solid ${COFICAB.line}` }}>
              <span className="font-bold" style={{ color: COFICAB.ink }}>{t('overviewPage.rising')}</span>
              <DashInfoTip text={t('overviewPage.hint.rising', { days })} title={t('overviewPage.rising')} side="bottom" />
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
          <Section title={t('overviewPage.q4')} hint={t('overviewPage.hint.q4')}>
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
          <Section title={t('overviewPage.q5')} hint={t('overviewPage.hint.q5')}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <WatchCard
                title={t('overviewPage.criticalTitle')}
                help={t('overviewPage.watchHelp.critical')}
                value={num(data.watch.critical.open)}
                tone={data.watch.critical.open > 0 ? 'red' : 'green'}
                sub={data.watch.critical.oldestDays != null ? t('overviewPage.criticalOldest', { days: data.watch.critical.oldestDays }) : undefined}
                to="/admin/claims/list?severity=critical"
              >
                {data.watch.critical.open === 0 ? (
                  <div className="text-xs" style={{ color: COFICAB.muted }}>{t('overviewPage.noCritical')}</div>
                ) : (
                  <ul className="m-0 p-0 list-none text-xs space-y-1.5" style={{ color: COFICAB.ink }}>
                    <li>{t('overviewPage.criticalSplit', { critical: data.watch.critical.criticalCount, high: data.watch.critical.highCount })}</li>
                    <li style={{ color: data.watch.critical.late > 0 ? COFICAB.danger : COFICAB.ok }}>
                      {t('overviewPage.criticalLateUnassigned', { late: data.watch.critical.late, unassigned: data.watch.critical.unassigned })}
                    </li>
                    <li style={{ color: COFICAB.muted }}>{t('overviewPage.criticalSeeFirst')}</li>
                  </ul>
                )}
              </WatchCard>

              <WatchCard
                title={t('overviewPage.eightDTitle')}
                help={t('overviewPage.watchHelp.eightD')}
                value={num(data.watch.eightD.inProgress)}
                tone={data.watch.eightD.stalled > 0 ? 'orange' : 'green'}
                to="/admin/claims/analyses?tab=eightd"
              >
                <div className="flex items-end gap-1.5 h-[64px]">
                  {data.watch.eightD.byStep.map((s) => {
                    const max = Math.max(1, ...data.watch.eightD.byStep.map((x) => x.count));
                    return (
                      <div key={s.step} className="flex-1 flex flex-col items-center justify-end gap-1">
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: COFICAB.ink }}>{s.count}</span>
                        <div className="w-full rounded-t" style={{ height: `${Math.max(3, (s.count / max) * 36)}px`, background: CLAIMS_ACCENT }} />
                        <span className="text-[10px]" style={{ color: COFICAB.muted }}>{t('overviewPage.eightDStep', { n: s.step })}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs font-semibold" style={{ color: data.watch.eightD.stalled > 0 ? COFICAB.warn : COFICAB.ok }}>
                  {data.watch.eightD.stalled > 0
                    ? t('overviewPage.eightDStalled', { count: data.watch.eightD.stalled })
                    : t('overviewPage.eightDMoving')}
                </div>
              </WatchCard>

              <WatchCard
                title={t('overviewPage.recurrenceTitle')}
                help={t('overviewPage.watchHelp.recurrence', { days })}
                value={num(data.watch.recurrence.repeatedLots)}
                tone={data.watch.recurrence.repeatedLots > 0 ? 'orange' : 'green'}
                sub={t('overviewPage.recurrenceSub', { count: data.watch.recurrence.claimsWithLot, days })}
              >
                <MiniRows
                  empty={t('overviewPage.noRepeatedLot')}
                  rows={data.watch.recurrence.topLots.map((l) => ({
                    key: l.lot,
                    left: l.lot,
                    sub: `${l.clientId || '—'} · ${t('overviewPage.lotDefects', { count: l.defects })}`,
                    right: t('overviewPage.lotClaims', { count: l.claims }),
                  }))}
                />
                {data.watch.recurrence.recurringPairs > 0 && (
                  <div className="mt-3 pt-2 text-xs" style={{ borderTop: `1px solid ${COFICAB.line}` }}>
                    <div className="font-bold mb-1" style={{ color: COFICAB.ink }}>
                      {t('overviewPage.recurringPairs', { count: data.watch.recurrence.recurringPairs })}
                    </div>
                    {data.watch.recurrence.topPairs.map((p) => (
                      <div key={`${p.defectType}-${p.productionLine}`} className="flex justify-between gap-2" style={{ color: COFICAB.muted }}>
                        <span className="truncate">{p.defectType} · {p.productionLine}</span>
                        <b className="tabular-nums shrink-0" style={{ color: COFICAB.ink }}>{p.claims}</b>
                      </div>
                    ))}
                  </div>
                )}
              </WatchCard>

              <WatchCard
                title={t('overviewPage.workloadTitle')}
                help={t('overviewPage.watchHelp.workload')}
                value={num(data.watch.workload.overloaded)}
                tone={data.watch.workload.overloaded > 0 ? 'orange' : 'green'}
                sub={t('overviewPage.workloadSub', { avg: num(data.watch.workload.averagePerPerson, 1), people: data.watch.workload.people })}
                to="/admin/claims/assignments"
              >
                {data.watch.workload.top.length === 0 ? (
                  <div className="text-xs" style={{ color: COFICAB.muted }}>{t('overviewPage.noWorkload')}</div>
                ) : (
                  <>
                    <ul className="m-0 p-0 list-none space-y-2.5">
                      {data.watch.workload.top.map((w) => {
                        const max = Math.max(1, ...data.watch.workload.top.map((x) => x.openClaims));
                        const heavy = data.watch.workload.averagePerPerson > 0 && w.openClaims >= data.watch.workload.averagePerPerson * 1.5;
                        const onTime = Math.max(0, w.openClaims - w.lateClaims);
                        return (
                          <li key={w.name}>
                            <div className="flex justify-between gap-2 text-xs">
                              <span className="font-semibold truncate" style={{ color: COFICAB.ink }}>
                                {w.name}
                                {heavy && (
                                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: COFICAB.warnSoft, color: COFICAB.warn }}>
                                    {t('overviewPage.overloaded')}
                                  </span>
                                )}
                              </span>
                              <span className="tabular-nums shrink-0" style={{ color: COFICAB.muted }}>
                                <b style={{ color: COFICAB.ink }}>{w.openClaims}</b>
                                {w.lateClaims > 0 ? <> · <span style={{ color: COFICAB.danger }}>{t('overviewPage.lateCount', { count: w.lateClaims })}</span></> : null}
                              </span>
                            </div>
                            <div className="flex h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden" style={{ width: `${(w.openClaims / max) * 100}%` }}>
                              <div style={{ width: `${(onTime / Math.max(1, w.openClaims)) * 100}%`, background: PLANS_ACCENT }} />
                              <div style={{ width: `${(w.lateClaims / Math.max(1, w.openClaims)) * 100}%`, background: COFICAB.danger }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {data.watch.workload.leastLoaded && (
                      <div className="mt-3 pt-2 text-xs flex justify-between gap-2" style={{ borderTop: `1px solid ${COFICAB.line}`, color: COFICAB.muted }}>
                        <span className="truncate">{t('overviewPage.leastLoaded')} : <b style={{ color: COFICAB.ink }}>{data.watch.workload.leastLoaded.name}</b></span>
                        <b className="tabular-nums shrink-0" style={{ color: COFICAB.ink }}>{data.watch.workload.leastLoaded.openClaims}</b>
                      </div>
                    )}
                  </>
                )}
              </WatchCard>
            </div>
          </Section>
        </>
      )}

      {editingTargets && data && (
        <OverviewTargetsDialog
          targets={data.targets}
          onClose={() => setEditingTargets(false)}
          onSaved={() => { setEditingTargets(false); void load(); }}
        />
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
      {data?.simulatedData && (
        <p className="text-[11px] mt-3 mb-0 text-center" style={{ color: COFICAB.muted }}>{t('overviewPage.simulated')}</p>
      )}
    </div>
  );
}
