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
  const [quick, setQuick] = useState<'all' | 'heavy' | 'late' | 'toValidate' | 'idle'>('all');
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

  const average = data?.summary.averageOpen ?? 0;
  const isHeavy = (p: Workload['people'][number]) => p.openPlans >= 4 && p.openPlans >= 1.5 * average;
  const isIdle = (p: Workload['people'][number]) => p.openPlans === 0 && p.openActions === 0;
  const base = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.people ?? [])
      .filter((p) => (!department || p.department === department)
        && (!term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term) || p.position.toLowerCase().includes(term)));
  }, [data, search, department]);
  const counts = useMemo(() => ({
    all: base.length,
    heavy: base.filter(isHeavy).length,
    late: base.filter((p) => p.latePlans > 0 || p.lateActions > 0).length,
    toValidate: base.filter((p) => p.actionsToValidate > 0).length,
    idle: base.filter(isIdle).length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, average]);
  const rows = useMemo(() => base.filter((p) => {
    if (quick === 'heavy') return isHeavy(p);
    if (quick === 'late') return p.latePlans > 0 || p.lateActions > 0;
    if (quick === 'toValidate') return p.actionsToValidate > 0;
    if (quick === 'idle') return isIdle(p);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [base, quick, average]);
  const byDepartment = useMemo(() => {
    const map = new Map<string, { name: string; people: number; busy: number; open: number; late: number; lateActions: number; toValidate: number }>();
    for (const p of data?.people ?? []) {
      const key = p.department || '—';
      const row = map.get(key) ?? { name: key, people: 0, busy: 0, open: 0, late: 0, lateActions: 0, toValidate: 0 };
      row.people += 1;
      if (p.openPlans > 0 || p.openActions > 0) row.busy += 1;
      row.open += p.openPlans;
      row.late += p.latePlans;
      row.lateActions += p.lateActions;
      row.toValidate += p.actionsToValidate;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [data]);
  const maxOpen = Math.max(1, ...(data?.people ?? []).map((p) => p.openPlans));
  const paged = usePagedList(rows, 15);

  if (loading && !data) return <PageSkeleton figures={4} panels={1} />;

  const s = data?.summary;

  return (
    <div className="text-slate-900 w-full min-w-0">
      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          {([
            [t('workload.people'), String(s.people), NAVY],
            [t('workload.average'), String(s.averageOpen), NAVY],
            [t('workload.overloaded'), String(s.overloaded), s.overloaded > 0 ? ORANGE : GOOD],
            [t('workload.idle'), String(s.withoutOpenPlan), s.withoutOpenPlan > 0 ? ORANGE : GOOD],
            [t('workload.lateActions'), String(s.lateActions), s.lateActions > 0 ? BAD : GOOD],
            [t('workload.toValidate'), String(s.actionsToValidate), s.actionsToValidate > 0 ? ORANGE : GOOD],
          ] as [string, string, string][]).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1.5 text-[28px] font-extrabold leading-none tabular-nums" style={{ color: NAVY }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {byDepartment.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 m-0">{t('workload.byDepartment')}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 mb-0">{t('workload.byDepartmentSub')}</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-slate-500 bg-slate-50">
                <th className="text-left font-semibold px-4 py-2">{t('planDetail.department')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.person')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.busyPeople')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.open')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.late')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.lateActionsShort')}</th>
                <th className="text-right font-semibold px-4 py-2">{t('workload.toValidateShort')}</th>
              </tr>
            </thead>
            <tbody>
              {byDepartment.map((d) => (
                <tr key={d.name} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => setDepartment(d.name === '—' ? '' : d.name)}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{d.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.people}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.busy}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{d.open}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: d.late > 0 ? BAD : '#94a3b8' }}>{d.late}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: d.lateActions > 0 ? BAD : '#94a3b8' }}>{d.lateActions}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold" style={{ color: d.toValidate > 0 ? ORANGE : '#94a3b8' }}>{d.toValidate}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="inline-flex flex-wrap gap-1.5" role="group">
          {(['all', 'heavy', 'late', 'toValidate', 'idle'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={quick === k}
              onClick={() => setQuick(k)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
              style={quick === k ? { background: NAVY, color: '#fff', borderColor: NAVY } : { background: '#fff', color: '#475569', borderColor: '#e2e8f0' }}
            >
              {t(`workload.quick.${k}`)} <span className="tabular-nums opacity-75">{counts[k]}</span>
            </button>
          ))}
        </div>
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
                <th className="text-right font-semibold px-3 py-2">{t('workload.openActions')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.lateActionsShort')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.toValidateShort')}</th>
                <th className="text-right font-semibold px-3 py-2">{t('workload.done30')}</th>
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
                            <div className="text-[11px] text-slate-500 truncate">{[p.position, p.department].filter(Boolean).join(' · ') || p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden" title={t('workload.loadBar')}><div className="h-full rounded-full" style={{ width: `${(100 * p.openPlans) / maxOpen}%`, background: heavy ? ORANGE : NAVY }} /></div>
                          <span className="tabular-nums font-semibold w-5 text-right">{p.openPlans}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.latePlans > 0 ? BAD : '#94a3b8' }}>{p.latePlans}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{p.openActions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.lateActions > 0 ? BAD : '#94a3b8' }}>{p.lateActions}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.actionsToValidate > 0 ? ORANGE : '#94a3b8' }}>{p.actionsToValidate}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{p.actionsDoneLast30Days}</td>
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
                        <td colSpan={9} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            {Object.entries(p.openByType).map(([type, n]) => (
                              <span key={type} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">{t(`planPage.type.${type}`, { defaultValue: type })} · {n}</span>
                            ))}
                            {p.email && <span className="text-[11px] text-slate-500 ml-auto">{p.email}{p.department ? ` · ${p.department}` : ''}</span>}
                          </div>
                          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t('workload.plansTitle')}</div>
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
                          {p.actions.length > 0 && (
                            <>
                              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-4 mb-1.5">{t('workload.actionsTitle', { count: p.actions.length })}</div>
                              <ul className="m-0 p-0 list-none space-y-1.5">
                                {p.actions.map((a) => {
                                  const tone = a.state === 'validated' ? GOOD : a.state === 'toValidate' ? ORANGE : a.state === 'cancelled' ? '#94a3b8' : a.lateDays > 0 ? BAD : '#64748b';
                                  return (
                                    <li
                                      key={a.id}
                                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/action-plans/${a.planId}`); }}
                                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-slate-100 cursor-pointer hover:border-slate-300"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-slate-700 truncate">{a.title}</div>
                                        <div className="text-[11px] text-slate-500 truncate">{a.planTitle}</div>
                                      </div>
                                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: tone, background: `${tone}18` }}>{t(`workload.state.${a.state}`)}</span>
                                      {a.lateDays > 0
                                        ? <span className="text-[11px] font-bold" style={{ color: BAD }}>{t('workload.lateDays', { count: a.lateDays })}</span>
                                        : <span className="text-[11px] text-slate-500 w-24 text-right">{date(a.deadline)}</span>}
                                      <span className="tabular-nums text-[11px] text-slate-600 w-9 text-right">{a.progress} %</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}
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
