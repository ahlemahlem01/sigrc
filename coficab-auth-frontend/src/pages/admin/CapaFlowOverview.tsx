import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaIndicators, type CapaFigure, type CapaIndicators } from '../../services/capaIndicatorsService';
import { loadCapaDataset, type PlanRow } from './capaAnalytics';

const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const GREY = '#94a3b8';

const card = 'bg-white border border-slate-200 rounded-2xl px-4 py-3';
const label = 'text-[11px] font-bold uppercase tracking-wide text-slate-500';

function delta(f: CapaFigure, unit = '', goodWhenUp = true) {
  if (f.current == null || f.previous == null) return null;
  const d = Math.round((f.current - f.previous) * 10) / 10;
  if (d === 0) return { text: `= ${f.previous}${unit} sur la période précédente`, tone: GREY };
  const up = d > 0;
  return { text: `${up ? '+' : ''}${d}${unit} vs période précédente`, tone: up === goodWhenUp ? GOOD : BAD };
}

function Stat({ title, value, unit, f, goodWhenUp = true }: { title: string; value: number | null; unit?: string; f: CapaFigure; goodWhenUp?: boolean }) {
  const d = delta(f, unit, goodWhenUp);
  return (
    <div className={card}>
      <div className={label}>{title}</div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums" style={{ color: NAVY }}>
        {value == null ? '—' : `${value}${unit ?? ''}`}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: d?.tone ?? GREY }}>{d?.text ?? 'Pas de période précédente'}</div>
    </div>
  );
}

/** How the plans move: created, in progress, closed; what happened over 90 days; where the delays pile up. */
export default function CapaFlowOverview() {
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [ind, setInd] = useState<CapaIndicators | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    loadCapaDataset(accessToken).then((d) => { if (live) setPlans(d.plans); }).catch(() => { if (live) setPlans([]); });
    fetchCapaIndicators(accessToken, 90, scopeParam).then((d) => { if (live) setInd(d); }).catch(() => { if (live) setInd(null); });
    return () => { live = false; };
  }, [accessToken, scopeParam]);

  const funnel = useMemo(() => {
    const list = plans ?? [];
    const created = list.filter((p) => p.status === 'created').length;
    const ongoing = list.filter((p) => p.status === 'ongoing').length;
    const closed = list.filter((p) => p.status === 'closed').length;
    const toValidate = list.filter((p) => p.status !== 'closed' && p.actions.some((a) => a.progressKind === 'closed')).length;
    return { created, ongoing, closed, toValidate, total: created + ongoing + closed };
  }, [plans]);

  if (!plans || !ind) return <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />;

  const k = ind.kpis;
  const months = ind.monthly.slice(-6);
  const maxMonth = Math.max(1, ...months.flatMap((m) => [m.opened, m.closed]));
  const depts = [...ind.byDepartment].filter((d) => d.latePlans > 0).sort((a, b) => b.latePlans - a.latePlans).slice(0, 5);
  const maxDept = Math.max(1, ...depts.map((d) => d.latePlans));
  const aging = [
    { name: 'Moins de 30 jours', value: ind.aging.under30, tone: ORANGE },
    { name: '30 à 90 jours', value: ind.aging.from30To90, tone: BAD },
    { name: 'Plus de 90 jours', value: ind.aging.over90, tone: '#7f1d1d' },
  ];
  const stages = [
    { name: 'Créés', note: 'pas encore démarrés', value: funnel.created, tone: GREY },
    { name: 'En cours', note: funnel.toValidate > 0 ? `dont ${funnel.toValidate} avec une action à valider` : 'en réalisation', value: funnel.ongoing, tone: NAVY },
    { name: 'Clôturés', note: 'terminés et validés', value: funnel.closed, tone: GOOD },
  ];

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className={card}>
        <div className={label}>Déroulement des plans</div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {stages.map((s, i) => (
            <div key={s.name} className="relative rounded-xl border border-slate-200 px-4 py-3" style={{ borderLeft: `4px solid ${s.tone}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{s.name}</span>
                <span className="text-[11px] text-slate-400 tabular-nums">{funnel.total ? Math.round((100 * s.value) / funnel.total) : 0} %</span>
              </div>
              <div className="mt-1 text-[26px] font-extrabold leading-none tabular-nums" style={{ color: s.tone === GREY ? '#475569' : s.tone }}>{s.value}</div>
              <div className="text-[11px] mt-1.5 text-slate-500">{s.note}</div>
              {i < stages.length - 1 && <span className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-slate-300 text-lg">›</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat title="Ouverts (90 j)" value={k.opened.current} f={k.opened} />
        <Stat title="Clôturés (90 j)" value={k.closed.current} f={k.closed} />
        <Stat title="Délai moyen de clôture" value={k.avgClosureDays.current} unit=" j" f={k.avgClosureDays} goodWhenUp={false} />
        <Stat title="Clôturés dans les délais" value={k.onTimeRate.current} unit=" %" f={k.onTimeRate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className={label}>Flux mensuel</div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: NAVY }} />Ouverts</span>
              <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: GOOD }} />Clôturés</span>
            </div>
          </div>
          {months.length === 0 ? <p className="text-xs text-slate-400 mt-3 mb-0">Pas encore d'historique.</p> : (
            <div className="mt-3 flex items-end gap-3 h-32">
              {months.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="flex items-end gap-1 h-24 w-full justify-center">
                    <div className="w-1/3 rounded-t" title={`${m.opened} ouverts`} style={{ height: `${(100 * m.opened) / maxMonth}%`, minHeight: m.opened ? 3 : 0, background: NAVY }} />
                    <div className="w-1/3 rounded-t" title={`${m.closed} clôturés`} style={{ height: `${(100 * m.closed) / maxMonth}%`, minHeight: m.closed ? 3 : 0, background: GOOD }} />
                  </div>
                  <span className="text-[10px] text-slate-500 tabular-nums">{String(m.month).slice(-5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={card}>
          <div className={label}>Où s'accumulent les retards</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {aging.map((a) => (
              <div key={a.name} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xl font-extrabold tabular-nums" style={{ color: a.tone }}>{a.value}</div>
                <div className="text-[10px] text-slate-500 leading-tight">{a.name}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {depts.length === 0 ? <p className="text-xs text-slate-400 m-0">Aucun retard par département.</p> : depts.map((d) => (
              <div key={`${d.organization}-${d.name}`} className="flex items-center gap-2 text-xs">
                <span className="w-36 truncate text-slate-700" title={d.name}>{d.name}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(100 * d.latePlans) / maxDept}%`, background: BAD }} /></div>
                <span className="w-16 text-right tabular-nums text-slate-600">{d.latePlans} / {d.openPlans}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
