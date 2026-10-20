import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaWorkload, type CapaWorkload } from '../../services/capaIndicatorsService';

const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const TOP = 8;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** A short look at how the people holding the plans are doing; the full list lives in the CAPA board. */
export default function CapaAssigneeGlance() {
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const navigate = useNavigate();
  const [data, setData] = useState<CapaWorkload | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let live = true;
    fetchCapaWorkload(accessToken, scopeParam).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [accessToken, scopeParam]);

  if (!data) return <div className="h-40 rounded-2xl bg-slate-100 animate-pulse mb-4" />;

  const s = data.summary;
  const people = data.people
    .filter((p) => p.openPlans > 0 || p.closedPlans > 0)
    .sort((a, b) => b.latePlans - a.latePlans || b.openPlans - a.openPlans)
    .slice(0, TOP);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 m-0">Rendement des assignés</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">
            {s.people} personnes · {s.averageOpen} plans ouverts en moyenne · {s.overloaded} surchargée(s) · {s.withoutOpenPlan} sans plan ouvert
          </p>
        </div>
        <button type="button" onClick={() => navigate('/admin/action-plans/dashboard')} className="text-xs font-semibold underline" style={{ color: NAVY }}>
          Voir la charge complète
        </button>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-slate-400 m-0 p-6 text-center">Aucun plan assigné pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 bg-slate-50">
                <th className="text-left font-semibold px-4 py-2">Personne</th>
                <th className="text-right font-semibold px-3 py-2">Ouverts</th>
                <th className="text-right font-semibold px-3 py-2">En retard</th>
                <th className="text-right font-semibold px-3 py-2">Part en retard</th>
                <th className="text-right font-semibold px-3 py-2">Clôturés</th>
                <th className="font-semibold px-3 py-2 text-left w-40">Avancement moyen</th>
                <th className="text-right font-semibold px-4 py-2">Prochaine échéance</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const share = p.openPlans ? Math.round((100 * p.latePlans) / p.openPlans) : 0;
                return (
                  <tr key={p.userId} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: NAVY }}>{initials(p.name)}</span>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{p.department || p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{p.openPlans}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.latePlans > 0 ? BAD : '#94a3b8' }}>{p.latePlans}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: share >= 50 ? BAD : share > 0 ? ORANGE : GOOD }}>{p.openPlans ? `${share} %` : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.closedPlans}</td>
                    <td className="px-3 py-2.5">
                      {p.avgProgress == null ? <span className="text-slate-400">—</span> : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.avgProgress}%`, background: GOOD }} /></div>
                          <span className="tabular-nums text-slate-600 w-9 text-right">{p.avgProgress} %</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{date(p.nextDeadline)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
