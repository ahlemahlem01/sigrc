import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import SegmentedToggle from '../../../components/SegmentedToggle';
import type { DashboardSummary, MonthlyOpenClosed } from '../../../types/dashboardSummary';
import KpiMiniCard from './KpiMiniCard';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB, PLANS_ACCENT } from './dashPalette';

type Row = { id: string; title: string; sub: string; right: string; rightColor: string; to: string };

function Card({ title, hint, help, children }: { title: string; hint?: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white shadow-sm overflow-hidden" style={{ border: `1px solid ${COFICAB.line}` }}>
      <header className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold m-0" style={{ color: COFICAB.ink }}>{title}</h2>
          {help ? <DashInfoTip text={help} title={title} side="bottom" /> : null}
        </div>
        {hint ? <p className="text-[11px] m-0 mt-0.5" style={{ color: COFICAB.muted }}>{hint}</p> : null}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function RowList({
  rows, loading, empty, accent, onOpen,
}: { rows: Row[]; loading?: boolean; empty: string; accent: string; onOpen: (to: string) => void }) {
  const { t } = useTranslation();
  if (loading) {
    return <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}</div>;
  }
  if (rows.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-400">{empty}</div>;
  }
  return (
    <ul className="m-0 p-0 list-none divide-y" style={{ borderColor: COFICAB.line }}>
      {rows.map((r) => (
        <li key={r.id} className="py-2 flex items-center gap-2" style={{ borderColor: COFICAB.line }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 truncate">{r.title}</div>
            <div className="text-[11px] text-slate-500 truncate">{r.sub}</div>
          </div>
          <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: r.rightColor }}>{r.right}</span>
          <button
            type="button"
            className="text-[11px] font-semibold hover:underline shrink-0"
            style={{ color: accent }}
            onClick={() => onOpen(r.to)}
          >
            {t('adminDashboard.view')}
          </button>
        </li>
      ))}
    </ul>
  );
}

function monthLabel(m: string, locale: string) {
  const [y, mo] = m.split('-');
  if (!y || !mo) return m;
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

/**
 * The management summary: the few numbers that matter, what is late, what has no deadline, and one trend.
 * Detail and analysis live on the steering and indicators pages.
 */
export default function OverviewSummary({ data, loading }: { data?: DashboardSummary | null; loading?: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [stream, setStream] = useState<'claims' | 'plans'>('claims');
  const claims = data?.claims;
  const plans = data?.actionPlans;

  const lateClaims: Row[] = (claims?.top5Late ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    sub: `${c.clientId} · ${c.responsibleName || '—'}`,
    right: t('adminDashboard.daysLate', { count: c.overdueDays }),
    rightColor: COFICAB.danger,
    to: `/pages/front/quality-analyses?focus=${c.id}`,
  }));
  const latePlans: Row[] = (plans?.top5Late ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    sub: `${p.nature} · ${p.responsibleName || '—'}`,
    right: t('adminDashboard.daysLate', { count: p.overdueDays }),
    rightColor: COFICAB.danger,
    to: `/admin/action-plans/${p.id}`,
  }));
  const noDeadline: Row[] = (claims?.top5NoDeadline ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    sub: `${c.clientId} · ${c.responsibleName || '—'}`,
    right: t('adminDashboard.claims.noDeadlineAge', { count: c.ageDays }),
    rightColor: COFICAB.muted,
    to: `/pages/front/quality-analyses?focus=${c.id}`,
  }));

  const monthly: MonthlyOpenClosed[] = (stream === 'claims' ? claims?.monthlyOpenClosed : plans?.monthlyOpenClosed) ?? [];
  const chart = monthly.map((m) => ({ month: monthLabel(m.month, i18n.language || 'fr'), open: m.opened, closed: m.closed }));
  const accent = stream === 'claims' ? CLAIMS_ACCENT : PLANS_ACCENT;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <KpiMiniCard
          label={t('adminDashboard.overview.openClaims')}
          to="/admin/claims/list"
          value={claims?.kpis.totalOpen ?? 0}
          loading={loading}
          accent={CLAIMS_ACCENT}
          tint={COFICAB.light}
          icon="ti-folder-open"
          help={t('adminDashboard.help.claimsOpen')}
        />
        <KpiMiniCard
          label={t('adminDashboard.overview.lateClaims')}
          to="/admin/claims/list?deadline=late"
          value={claims?.kpis.late ?? 0}
          loading={loading}
          accent={COFICAB.danger}
          tint={COFICAB.dangerSoft}
          icon="ti-clock-exclamation"
          help={t('adminDashboard.help.claimsLate')}
        />
        <KpiMiniCard
          label={t('adminDashboard.overview.noDeadline')}
          to="/admin/claims/list?deadline=none"
          value={claims?.kpis.noDeadline ?? 0}
          loading={loading}
          accent={COFICAB.warn}
          tint={COFICAB.warnSoft}
          icon="ti-calendar-off"
          help={t('adminDashboard.help.claimsNoDeadline')}
        />
        <KpiMiniCard
          label={t('adminDashboard.overview.latePlans')}
          to="/admin/action-plans/dashboard"
          value={plans?.kpis.late ?? 0}
          loading={loading}
          accent={COFICAB.danger}
          tint={COFICAB.dangerSoft}
          icon="ti-clock-exclamation"
          help={t('adminDashboard.help.plansLate')}
        />
        <KpiMiniCard
          label={t('adminDashboard.overview.claimsClosure')}
          value={`${(claims?.kpis.closureRate ?? 0).toFixed(1)} %`}
          loading={loading}
          accent={COFICAB.ok}
          tint={COFICAB.okSoft}
          icon="ti-chart-pie"
          help={t('adminDashboard.help.claimsClosure')}
        />
        <KpiMiniCard
          label={t('adminDashboard.overview.plansClosure')}
          value={`${(plans?.kpis.closureRate ?? 0).toFixed(1)} %`}
          loading={loading}
          accent={COFICAB.ok}
          tint={COFICAB.okSoft}
          icon="ti-chart-pie"
          help={t('adminDashboard.help.claimsClosure')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title={t('adminDashboard.overview.lateClaimsTitle')}
          hint={t('adminDashboard.overview.lateHint')}
          help={t('adminDashboard.help.claimsTop5')}
        >
          <RowList rows={lateClaims} loading={loading} empty={t('adminDashboard.claims.emptyLate')} accent={CLAIMS_ACCENT} onOpen={navigate} />
        </Card>
        <Card title={t('adminDashboard.overview.latePlansTitle')} hint={t('adminDashboard.overview.lateHint')}>
          <RowList rows={latePlans} loading={loading} empty={t('adminDashboard.actionPlans.emptyLate')} accent={PLANS_ACCENT} onOpen={navigate} />
        </Card>
        <Card
          title={t('adminDashboard.claims.noDeadlineTitle')}
          hint={t('adminDashboard.claims.noDeadlineHint')}
          help={t('adminDashboard.help.claimsNoDeadline')}
        >
          <RowList rows={noDeadline} loading={loading} empty={t('adminDashboard.claims.noDeadlineEmpty')} accent={CLAIMS_ACCENT} onOpen={navigate} />
          {(claims?.kpis.noDeadline ?? 0) > noDeadline.length && (
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold hover:underline"
              style={{ color: CLAIMS_ACCENT }}
              onClick={() => navigate('/admin/claims/list?deadline=none')}
            >
              {t('adminDashboard.claims.seeAll', { count: claims?.kpis.noDeadline ?? 0 })}
            </button>
          )}
        </Card>
        <Card title={t('adminDashboard.overview.trendTitle')}>
          <div className="mb-2">
            <SegmentedToggle
              options={[
                { id: 'claims' as const, labelKey: 'adminDashboard.claims.title' },
                { id: 'plans' as const, labelKey: 'adminDashboard.actionPlans.title' },
              ]}
              value={stream}
              onChange={setStream}
            />
          </div>
          {loading ? (
            <div className="h-[170px] rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${COFICAB.line}` }} />
                <Line type="monotone" dataKey="open" name={t('adminDashboard.chartOpen')} stroke={accent} strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="closed" name={t('adminDashboard.chartClosed')} stroke={COFICAB.ok} strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
