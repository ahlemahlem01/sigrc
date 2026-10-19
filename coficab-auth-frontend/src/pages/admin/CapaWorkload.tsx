import { usePagedList } from '../../hooks/usePagedList';
import TablePagination from '../../components/TablePagination';
import { PageSkeleton } from '../../components/TableSkeleton';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaWorkload, type CapaWorkload as Workload } from '../../services/capaIndicatorsService';
import { capaBtnSecondary } from '../../components/capa/CapaAdminUi';

const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const ORANGE = '#ea580c';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export default function CapaWorkload() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const navigate = useNavigate();
  const [data, setData] = useState<Workload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchCapaWorkload(accessToken, scopeParam));
    } catch {
      setError(t('workload.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, scopeParam, t]);

  useEffect(() => { void load(); }, [load]);

  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'it' ? 'it-IT' : 'fr-FR';
  const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  const departments = useMemo(
    () => Array.from(new Set((data?.people ?? []).map((p) => p.department).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.people ?? [])
      .filter((p) => (!department || p.department === department)
        && (!lateOnly || p.latePlans > 0)
        && (!term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)));
  }, [data, search, department, lateOnly]);
  const paged = usePagedList(rows, 15);

  if (loading && !data) return <PageSkeleton figures={4} panels={1} />;

  const s = data?.summary;
  const average = s?.averageOpen ?? 0;

  return (
    <div className="text-slate-900 w-full min-w-0">
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {([
            [t('workload.people'), String(s.people), NAVY],
            [t('workload.average'), String(s.averageOpen), NAVY],
            [t('workload.overloaded'), String(s.overloaded), s.overloaded > 0 ? ORANGE : GOOD],
            [t('workload.idle'), String(s.withoutOpenPlan), s.withoutOpenPlan > 0 ? ORANGE : GOOD],
          ] as [string, string, string][]).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1.5 text-[28px] font-extrabold leading-none tabular-nums" style={{ color: NAVY }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('workload.search')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white w-56"
        />
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white">
          <option value="">{t('workload.allDepartments')}</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 px-2">
          <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} style={{ accentColor: NAVY }} />
          {t('workload.lateOnly')}
        </label>
        <button type="button" onClick={() => void load()} className={`${capaBtnSecondary} ml-auto`}>{t('dashboard.refresh')}</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 m-0 p-6 text-center">{t('workload.none')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 bg-slate-50">
                <th className="text-left font-semibold px-4 py-2">{t('workload.person')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.open')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.late')}</th>
                <th className="font-semibold px-3 py-2 text-left w-40">{t('workload.progress')}</th>
                <th className="text-right font-semibold px-4 py-2">{t('workload.next')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((p) => {
                const expanded = openId === p.userId;
                const heavy = p.openPlans >= 4 && p.openPlans >= 1.5 * average;
                const withClosed = showClosed.has(p.userId);
                const plans = p.plans.filter((x) => withClosed || !x.closed);
                return (
                  <Fragment key={p.userId}>
                    <tr
                      className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                      onClick={() => setOpenId(expanded ? null : p.userId)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: NAVY }}>{initials(p.name)}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">{p.name}{heavy && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#fff7ed', color: ORANGE }}>{t('workload.heavy')}</span>}</div>
                            <div className="text-[11px] text-slate-500 truncate">{p.department || p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{p.openPlans}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.latePlans > 0 ? BAD : '#94a3b8' }}>{p.latePlans}</td>
                      <td className="px-3 py-2.5">
                        {p.avgProgress == null ? <span className="text-slate-400">—</span> : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p.avgProgress}%`, background: '#38a169' }} /></div>
                            <span className="tabular-nums text-slate-600 w-9 text-right">{p.avgProgress} %</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{date(p.nextDeadline)}</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={5} className="px-4 py-3">
                          <ul className="m-0 p-0 list-none space-y-1.5">
                            {plans.map((x) => (
                              <li
                                key={x.id}
                                onClick={(e) => { e.stopPropagation(); navigate(`/admin/action-plans/${x.id}`); }}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100 cursor-pointer hover:border-slate-300"
                              >
                                <span className="font-semibold text-slate-700 truncate flex-1">{x.title}</span>
                                <span className="text-[11px] text-slate-500">{x.type}</span>
                                {x.closed
                                  ? <span className="text-[11px] font-semibold" style={{ color: GOOD }}>{t('workload.closed')}</span>
                                  : x.lateDays > 0
                                    ? <span className="text-[11px] font-bold" style={{ color: BAD }}>{t('workload.lateDays', { count: x.lateDays })}</span>
                                    : <span className="text-[11px] text-slate-500">{date(x.deadline)}</span>}
                                <span className="tabular-nums text-[11px] text-slate-600 w-9 text-right">{x.progress} %</span>
                              </li>
                            ))}
                          </ul>
                          {p.closedPlans > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setShowClosed((prev) => { const n = new Set(prev); if (n.has(p.userId)) n.delete(p.userId); else n.add(p.userId); return n; }); }}
                              className="mt-2 text-[11px] font-semibold underline"
                              style={{ color: NAVY }}
                            >
                              {withClosed ? t('workload.hideClosed') : t('workload.showClosed', { count: p.closedPlans })}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.length > paged.pageSize && (
        <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={loading} />
      )}
    </div>
  );
}
