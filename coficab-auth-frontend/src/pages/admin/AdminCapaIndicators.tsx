import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  FlatAction, loadCapaDataset, monthKey, monthLabel, periodStart, PlanRow, UiType,
} from './capaAnalytics';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { fixMojibake } from '../../utils/textEncoding';
import { CapaPageHeader, capaBtnSecondary } from '../../components/capa/CapaAdminUi';

const COFICAB = '#000168';

type Period = '7d' | '1m' | '3m' | '1y';
type NatureKey = UiType | 'critical';

const NATURE_COLORS: Record<NatureKey, string> = {
  correctif: '#10b981',
  preventif: '#3b82f6',
  amelioration: '#f59e0b',
  critical: '#ef4444',
};

/** Canonical process labels from boss sample (order preserved). */
const CANONICAL_PROCESSES = [
  'Quality',
  'Production',
  'Safety',
  'Logistics',
  'HR',
  'Maintenance',
] as const;

function periodBounds(period: Period) {
  const end = new Date();
  const start = periodStart(period);
  const ms = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - ms);
  return { start, end, prevStart, prevEnd };
}

function inWindow(iso: string | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function normalizeProcess(raw: string): string {
  const s = fixMojibake(raw || '').trim() || '—';
  const lower = s.toLowerCase();
  for (const c of CANONICAL_PROCESSES) {
    if (lower === c.toLowerCase() || lower.includes(c.toLowerCase())) return c;
  }
  // FR aliases
  if (lower.includes('qualité') || lower.includes('qualite')) return 'Quality';
  if (lower.includes('production') || lower.includes('prod')) return 'Production';
  if (lower.includes('sécurité') || lower.includes('securite') || lower.includes('hse')) return 'Safety';
  if (lower.includes('logistique') || lower.includes('supply')) return 'Logistics';
  if (lower.includes('rh') || lower.includes('human') || lower.includes('ressources')) return 'HR';
  if (lower.includes('maintenance') || lower.includes('maint')) return 'Maintenance';
  return s;
}

function weekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function lastNWeeks(n: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d);
    x.setDate(x.getDate() - i * 7);
    const key = weekKey(x);
    out.push({ key, label: `W${key.split('-W')[1]}` });
  }
  // unique preserve order
  const seen = new Set<string>();
  return out.filter((w) => {
    if (seen.has(w.key)) return false;
    seen.add(w.key);
    return true;
  });
}

function natureBucket(a: FlatAction): NatureKey {
  if (a.priority === 1) return 'critical';
  return a.type;
}

function computeKpis(list: FlatAction[]) {
  const total = list.length;
  const closed = list.filter((a) => a.closed).length;
  const late = list.filter((a) => a.late).length;
  const rate = total > 0 ? Math.round((closed / total) * 100) : 0;
  return { total, closed, late, rate };
}

function heatColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return '#f1f5f9';
  const t = value / max;
  if (t < 0.25) return '#dbeafe';
  if (t < 0.5) return '#93c5fd';
  if (t < 0.75) return '#fbbf24';
  return '#f87171';
}

function DeltaBadge({ delta, preferDown }: { delta: number | null; preferDown?: boolean }) {
  if (delta === null) {
    return <span className="text-[11px] font-semibold text-slate-400">n/a</span>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const good = preferDown ? !up : up;
  const color = flat ? '#64748b' : good ? '#059669' : '#dc2626';
  const sign = up ? '+' : '';
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
      {sign}{delta}%
    </span>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) {
    return <div className="h-8 w-24 bg-slate-50 rounded" />;
  }
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.18} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AdminCapaIndicators() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('3m');
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [actions, setActions] = useState<FlatAction[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadCapaDataset(accessToken);
      setPlans(data.plans);
      setActions(data.actions);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('indicators.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const bounds = useMemo(() => periodBounds(period), [period]);

  const scopedActions = useMemo(
    () => actions.filter((a) => inWindow(a.createdAt || a.deadline, bounds.start, bounds.end)
      || (!a.createdAt && !a.deadline)),
    [actions, bounds],
  );

  const prevActions = useMemo(
    () => actions.filter((a) => inWindow(a.createdAt || a.deadline, bounds.prevStart, bounds.prevEnd)),
    [actions, bounds],
  );

  const kpis = useMemo(() => computeKpis(scopedActions), [scopedActions]);
  const prevKpis = useMemo(() => computeKpis(prevActions), [prevActions]);

  const kpiCards = useMemo(() => [
    {
      key: 'total',
      label: t('indicators.kpiTotal'),
      value: kpis.total,
      display: String(kpis.total),
      delta: pctDelta(kpis.total, prevKpis.total),
      tint: '#eff6ff',
      color: '#2563eb',
    },
    {
      key: 'closed',
      label: t('indicators.kpiClosed'),
      value: kpis.closed,
      display: String(kpis.closed),
      delta: pctDelta(kpis.closed, prevKpis.closed),
      tint: '#ecfdf5',
      color: '#059669',
    },
    {
      key: 'late',
      label: t('indicators.kpiLate'),
      value: kpis.late,
      display: String(kpis.late),
      // lower late is better → invert display color via negative preference later
      delta: pctDelta(kpis.late, prevKpis.late),
      invertDelta: true,
      tint: '#fef2f2',
      color: '#dc2626',
    },
    {
      key: 'rate',
      label: t('indicators.kpiRate'),
      value: kpis.rate,
      display: `${kpis.rate}%`,
      delta: pctDelta(kpis.rate, prevKpis.rate),
      tint: '#eef2ff',
      color: '#4f46e5',
    },
  ], [kpis, prevKpis, t]);

  const byProcess = useMemo(() => {
    const map = new Map<string, { total: number; closed: number }>();
    for (const name of CANONICAL_PROCESSES) map.set(name, { total: 0, closed: 0 });

    const source = scopedActions.length
      ? scopedActions.map((a) => ({ process: a.process, closed: a.closed }))
      : plans.map((p) => ({ process: p.process, closed: p.status === 'closed' }));

    for (const a of source) {
      const key = normalizeProcess(String(a.process || '—'));
      const cur = map.get(key) || { total: 0, closed: 0 };
      cur.total += 1;
      if (a.closed) cur.closed += 1;
      map.set(key, cur);
    }

    const ordered = [
      ...CANONICAL_PROCESSES.map((name) => {
        const v = map.get(name)!;
        return {
          name,
          rate: v.total ? Math.round((v.closed / v.total) * 100) : 0,
          total: v.total,
          closed: v.closed,
        };
      }),
      ...Array.from(map.entries())
        .filter(([name]) => !(CANONICAL_PROCESSES as readonly string[]).includes(name) && name !== '—')
        .map(([name, v]) => ({
          name,
          rate: v.total ? Math.round((v.closed / v.total) * 100) : 0,
          total: v.total,
          closed: v.closed,
        }))
        .sort((a, b) => b.total - a.total),
    ];
    return ordered.filter((r) => r.total > 0 || (CANONICAL_PROCESSES as readonly string[]).includes(r.name));
  }, [scopedActions, plans]);

  const byNature = useMemo(() => {
    const map: Record<NatureKey, number> = {
      correctif: 0, preventif: 0, amelioration: 0, critical: 0,
    };
    for (const a of scopedActions) map[natureBucket(a)] += 1;
    const total = Object.values(map).reduce((s, n) => s + n, 0) || 1;
    const order: NatureKey[] = ['correctif', 'preventif', 'amelioration', 'critical'];
    return order.map((k) => ({
      key: k,
      name: t(`indicators.nature.${k}`),
      value: map[k],
      pct: Math.round((map[k] / total) * 100),
      color: NATURE_COLORS[k],
    }));
  }, [scopedActions, t]);

  const trend = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'it' ? 'it-IT' : 'fr-FR';
    return keys.map((key) => {
      const monthActions = actions.filter((a) => monthKey(a.createdAt) === key);
      const open = monthActions.filter((a) => !a.closed).length;
      const closed = monthActions.filter((a) => a.closed).length;
      const late = monthActions.filter((a) => a.late).length;
      return {
        month: monthLabel(key, locale),
        open,
        closed,
        late,
      };
    });
  }, [actions, i18n.language]);

  const topResponsible = useMemo(() => {
    const map = new Map<string, { total: number; closed: number; late: number; name: string }>();
    for (const a of scopedActions) {
      const id = a.assignedToId || '—';
      if (id === '—') continue;
      const cur = map.get(id) || {
        total: 0, closed: 0, late: 0,
        name: a.assignedToName || id.slice(0, 8),
      };
      cur.total += 1;
      if (a.closed) cur.closed += 1;
      if (a.late) cur.late += 1;
      if (a.assignedToName) cur.name = a.assignedToName;
      map.set(id, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({
        id,
        name: v.name,
        rate: v.total ? Math.round((v.closed / v.total) * 100) : 0,
        total: v.total,
        late: v.late,
      }))
      .sort((a, b) => b.total - a.total || b.rate - a.rate)
      .slice(0, 6);
  }, [scopedActions]);

  const weeks = useMemo(() => lastNWeeks(8), []);

  const heatmap = useMemo(() => {
    const processNames = byProcess.map((p) => p.name);
    const matrix = processNames.map((process) => {
      const cells = weeks.map((w) => {
        let load = 0;
        for (const a of actions) {
          if (normalizeProcess(a.process) !== process) continue;
          const ref = a.deadline || a.createdAt;
          if (!ref) continue;
          const d = new Date(ref);
          if (Number.isNaN(d.getTime())) continue;
          if (weekKey(d) === w.key) load += 1;
        }
        return load;
      });
      return { process, cells };
    });
    const max = Math.max(1, ...matrix.flatMap((r) => r.cells));
    return { matrix, max };
  }, [actions, byProcess, weeks]);

  const naturePerformance = useMemo(() => {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const order: NatureKey[] = ['correctif', 'preventif', 'amelioration', 'critical'];
    return order.map((k) => {
      const list = scopedActions.filter((a) => natureBucket(a) === k);
      const total = list.length;
      const closed = list.filter((a) => a.closed).length;
      const late = list.filter((a) => a.late).length;
      const rate = total ? Math.round((closed / total) * 100) : 0;
      const spark = keys.map((mk) => {
        const monthList = actions.filter((a) => monthKey(a.createdAt) === mk && natureBucket(a) === k);
        return monthList.length;
      });
      return {
        key: k,
        name: t(`indicators.nature.${k}`),
        color: NATURE_COLORS[k],
        total,
        closed,
        late,
        rate,
        spark,
      };
    });
  }, [scopedActions, actions, t]);

  const exportPdf = () => {
    exportCapaPdf({
      title: t('indicators.title'),
      subtitle: t('indicators.subtitle'),
      filename: `capa-indicators-${period}`,
      meta: [
        `${t('indicators.kpiTotal')}: ${kpis.total}`,
        `${t('indicators.kpiClosed')}: ${kpis.closed}`,
        `${t('indicators.kpiLate')}: ${kpis.late}`,
        `${t('indicators.kpiRate')}: ${kpis.rate}%`,
        `Period: ${period}`,
      ],
      columns: [
        { key: 'action', label: t('associatedActions.colAction') },
        { key: 'plan', label: t('associatedActions.colPlan') },
        { key: 'process', label: t('dashboard.colProcess') },
        { key: 'nature', label: t('dashboard.colNature') },
        { key: 'responsible', label: t('dashboard.colResponsible') },
        { key: 'progress', label: t('reportPlans.colProgress') },
        { key: 'status', label: t('dashboard.colStatus') },
      ],
      rows: scopedActions.map((a) => ({
        action: a.title,
        plan: a.planTitle,
        process: normalizeProcess(a.process),
        nature: t(`indicators.nature.${natureBucket(a)}`),
        responsible: a.assignedToName || '—',
        progress: `${a.progress}%`,
        status: a.closed ? t('reportPlans.statusClosed') : a.late ? t('followUp.tabBelated') : t('reportPlans.statusOpened'),
      })),
    });
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="text-slate-900 w-full min-w-0">
      <CapaPageHeader
        compact
        eyebrow={t('indicators.eyebrow')}
        title={t('indicators.title')}
        subtitle={t('indicators.subtitle')}
        actions={
          <>
            <button type="button" onClick={() => void load()} className={capaBtnSecondary}>
              {t('dashboard.refresh')}
            </button>
            <button type="button" onClick={exportPdf} className={capaBtnSecondary}>
              {t('common.exportPdf')}
            </button>
            <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200">
              {(['7d', '1m', '3m', '1y'] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg"
                  style={period === p ? { background: COFICAB, color: '#fff' } : { color: '#64748b' }}
                >
                  {t(`indicators.period.${p}`)}
                </button>
              ))}
            </div>
            <span className="text-xs text-emerald-600 font-medium">{t('indicators.dataFresh')}</span>
          </>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* 4 KPI cards + vs previous period */}
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
        {kpiCards.map((c) => (
          <div
            key={c.key}
            className="rounded-2xl border border-slate-200 p-5"
            style={{ background: c.tint, borderTop: `3px solid ${c.color}` }}
          >
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.color }}>{c.label}</div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{c.display}</div>
              <div className="text-right">
                <DeltaBadge delta={c.delta} preferDown={!!c.invertDelta} />
                <div className="text-[10px] text-slate-400 mt-0.5">{t('indicators.vsPrev')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Closure rate by process — progress bars */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{t('indicators.closureByProcess')}</h2>
          <div className="space-y-3.5">
            {byProcess.length === 0 ? (
              <p className="text-sm text-slate-400">{t('indicators.noData')}</p>
            ) : (
              byProcess.map((row) => (
                <div key={row.name}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-slate-700">{row.name}</span>
                    <span className="tabular-nums text-slate-500">
                      <span className="font-semibold text-slate-800">{row.rate}%</span>
                      {' · '}{row.closed}/{row.total}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${row.rate}%`,
                        background: row.rate >= 70 ? '#10b981' : row.rate >= 45 ? '#3b82f6' : row.total === 0 ? '#cbd5e1' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Donut by nature (+ Critical) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">{t('indicators.byNature')}</h2>
          <div className="h-52 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byNature.filter((s) => s.value > 0).length ? byNature.filter((s) => s.value > 0) : byNature}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {byNature.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: any, name: any) => [v, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-xl font-bold text-[#000168]">{kpis.rate}%</div>
                <div className="text-[10px] text-slate-400 uppercase">{t('indicators.global')}</div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5 mt-2">
            {byNature.map((s) => (
              <div key={s.key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="font-semibold tabular-nums">{s.value} · {s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Monthly trend */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{t('indicators.monthlyTrend')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="closed" name={t('indicators.seriesClosed')} stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="open" name={t('indicators.seriesOpen')} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="late" name={t('indicators.seriesLate')} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top responsible */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">{t('indicators.topResponsible')}</h2>
          {topResponsible.length === 0 ? (
            <p className="text-sm text-slate-400">{t('indicators.noData')}</p>
          ) : (
            <div className="space-y-3">
              {topResponsible.map((r, i) => (
                <div key={r.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 truncate max-w-[65%]">
                      #{i + 1} · {r.name}
                    </span>
                    <span className="tabular-nums font-semibold text-slate-800">
                      {r.rate}% · {r.total}
                      {r.late > 0 && <span className="text-rose-600 font-normal"> · {r.late} late</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${r.rate}%`,
                        background: r.rate >= 80 ? '#10b981' : r.rate >= 50 ? '#3b82f6' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap deadline / workload */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 overflow-x-auto">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t('indicators.heatmapTitle')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('indicators.heatmapHint')}</p>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>{t('indicators.heatmapLow')}</span>
            {['#f1f5f9', '#dbeafe', '#93c5fd', '#fbbf24', '#f87171'].map((c) => (
              <span key={c} className="w-4 h-3 rounded-sm border border-slate-200" style={{ background: c }} />
            ))}
            <span>{t('indicators.heatmapHigh')}</span>
          </div>
        </div>
        {heatmap.matrix.length === 0 ? (
          <p className="text-sm text-slate-400">{t('indicators.noData')}</p>
        ) : (
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left font-semibold text-slate-500 py-2 pr-3">{t('dashboard.colProcess')}</th>
                {weeks.map((w) => (
                  <th key={w.key} className="font-semibold text-slate-500 py-2 px-1 text-center">{w.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.matrix.map((row) => (
                <tr key={row.process}>
                  <td className="py-1.5 pr-3 font-medium text-slate-700 whitespace-nowrap">{row.process}</td>
                  {row.cells.map((v, i) => (
                    <td key={weeks[i].key} className="px-1 py-1">
                      <div
                        title={`${row.process} · ${weeks[i].label}: ${v}`}
                        className="h-8 rounded-md flex items-center justify-center font-semibold tabular-nums border border-white/40"
                        style={{ background: heatColor(v, heatmap.max), color: v > heatmap.max * 0.5 ? '#0f172a' : '#475569' }}
                      >
                        {v > 0 ? v : ''}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Performance by nature + sparklines */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-4">{t('indicators.perfByNature')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="pb-3 font-semibold">{t('dashboard.colNature')}</th>
                <th className="pb-3 font-semibold">{t('indicators.kpiTotal')}</th>
                <th className="pb-3 font-semibold">{t('indicators.kpiClosed')}</th>
                <th className="pb-3 font-semibold">{t('indicators.kpiLate')}</th>
                <th className="pb-3 font-semibold">{t('indicators.kpiRate')}</th>
                <th className="pb-3 font-semibold">{t('indicators.sparkTrend')}</th>
              </tr>
            </thead>
            <tbody>
              {naturePerformance.map((row) => (
                <tr key={row.key} className="border-t border-slate-50">
                  <td className="py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: row.color }} />
                      {row.name}
                    </span>
                  </td>
                  <td className="py-3 tabular-nums">{row.total}</td>
                  <td className="py-3 tabular-nums text-emerald-700">{row.closed}</td>
                  <td className="py-3 tabular-nums text-rose-600">{row.late}</td>
                  <td className="py-3 min-w-[120px]">
                    <div className="text-xs tabular-nums mb-1">{row.rate}%</div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden max-w-[100px]">
                      <div className="h-full rounded-full" style={{ width: `${row.rate}%`, background: row.color }} />
                    </div>
                  </td>
                  <td className="py-3">
                    <MiniSparkline data={row.spark} color={row.color} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
