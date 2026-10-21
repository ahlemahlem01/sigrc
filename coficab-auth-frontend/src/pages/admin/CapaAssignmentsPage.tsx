import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import SegmentedToggle from '../../components/SegmentedToggle';
import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import { ListSkeleton } from '../../components/TableSkeleton';
import { CapaErrorBanner, CapaKpiStrip, CapaPageHeader, capaBtnPrimary, capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import { bulkAssignPlans, getUsersForAssignment } from '../../services/actionPlanService';
import { loadCapaDataset, type PlanRow } from './capaAnalytics';

const NAVY = '#000168';
const BAD = '#dc2626';
const TYPE_KEY: Record<string, string> = { preventif: 'PA', correctif: 'PAC', amelioration: 'PAP' };

type Person = { id: string; name: string };
type View = 'unassigned' | 'assigned';

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Who is responsible for each open CAPA plan: plans waiting for someone, plans already assigned, and (re)assignment in one step. */
export default function CapaAssignmentsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('unassigned');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState('');
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await loadCapaDataset(accessToken);
      setPlans(data.plans.filter((p) => !p.archived && p.status !== 'closed' && p.status !== 'archived'));
    } catch {
      setError(t('capaAssignments.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    getUsersForAssignment(accessToken).then((res) => {
      const payload: any = res.data;
      const list: any[] = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? payload?.['$values'] ?? [];
      setPeople(list
        .map((u) => ({ id: String(u.id ?? u.Id ?? ''), name: String(u.fullName ?? u.FullName ?? u.email ?? u.Email ?? '') }))
        .filter((u) => u.id && u.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setPeople([]));
  }, [accessToken]);

  const unassigned = useMemo(() => plans.filter((p) => !p.assignedToId), [plans]);
  const assigned = useMemo(() => plans.filter((p) => !!p.assignedToId), [plans]);
  const figures = useMemo(() => {
    const isLate = (p: PlanRow) => !!p.deadline && new Date(p.deadline).getTime() < Date.now();
    const owners = new Set(assigned.map((p) => p.assignedToId));
    return {
      lateUnassigned: unassigned.filter(isLate).length,
      lateTotal: plans.filter(isLate).length,
      owners: owners.size,
      average: owners.size === 0 ? 0 : Math.round((10 * assigned.length) / owners.size) / 10,
    };
  }, [plans, unassigned, assigned]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (view === 'unassigned' ? unassigned : assigned)
      .filter((p) => !term || p.title.toLowerCase().includes(term) || (p.assignedToName ?? '').toLowerCase().includes(term) || (p.process ?? '').toLowerCase().includes(term))
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  }, [view, unassigned, assigned, search]);
  const paged = usePagedList(rows, 12);

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = paged.rows.length > 0 && paged.rows.every((p) => selected.has(p.id));
  const togglePage = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPage) paged.rows.forEach((p) => n.delete(p.id)); else paged.rows.forEach((p) => n.add(p.id));
    return n;
  });

  const assigneeName = people.find((p) => p.id === assignee)?.name ?? '';
  const ask = (ids: string[]) => { setSelected(new Set(ids)); setAssignee(''); setDialog(true); };

  const confirm = async () => {
    if (!accessToken || !assignee || selected.size === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data } = await bulkAssignPlans(accessToken, Array.from(selected), assignee);
      setNotice({ ok: true, text: t('capaAssignments.done', { count: data.assigned, name: assigneeName }) + (data.skipped ? ` ${t('capaAssignments.skipped', { count: data.skipped })}` : '') });
      setSelected(new Set());
      setDialog(false);
      await load();
    } catch {
      setNotice({ ok: false, text: t('capaAssignments.failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-6">
      <CapaPageHeader
        eyebrow={t('adminNav.actionPlans')}
        title={t('adminNav.assignments')}
        subtitle={t('capaAssignments.subtitle')}
        actions={<button type="button" className={capaBtnSecondary} onClick={() => void load()}>{t('dashboard.refresh')}</button>}
      />

      <CapaKpiStrip
        items={[
          { key: 'open', label: t('capaAssignments.kpiOpen'), value: plans.length, hint: t('capaAssignments.kpiOpenHint', { count: figures.owners }) },
          { key: 'unassigned', label: t('capaAssignments.toAssign'), value: unassigned.length, hint: t('capaAssignments.kpiToAssignHint', { count: figures.lateUnassigned }), active: view === 'unassigned', onClick: () => { setView('unassigned'); setSelected(new Set()); } },
          { key: 'assigned', label: t('capaAssignments.assigned'), value: assigned.length, hint: t('capaAssignments.kpiAssignedHint', { avg: figures.average }), active: view === 'assigned', onClick: () => { setView('assigned'); setSelected(new Set()); } },
          { key: 'late', label: t('capaAssignments.kpiLate'), value: figures.lateTotal, hint: t('capaAssignments.kpiLateHint', { count: figures.lateUnassigned }) },
        ]}
      />

      {error && <CapaErrorBanner message={error} />}
      {notice && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => !busy && setDialog(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 m-0">{t('capaAssignments.dialogTitle', { count: selected.size })}</h3>
            <p className="text-sm text-gray-600 mt-2 mb-3">{t('capaAssignments.dialogText')}</p>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white">
              <option value="">{t('capaAssignments.choosePerson')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => setDialog(false)}>{t('common.cancel')}</button>
              <button type="button" className={capaBtnPrimary} disabled={busy || !assignee} onClick={() => void confirm()}>{t('capaAssignments.assign')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SegmentedToggle
          options={[
            { id: 'unassigned', labelKey: 'capaAssignments.toAssign' },
            { id: 'assigned', labelKey: 'capaAssignments.assigned' },
          ] as const}
          value={view}
          onChange={(id) => { setView(id); setSelected(new Set()); }}
        />
        <span className="text-xs text-slate-500">
          {t('capaAssignments.counts', { toAssign: unassigned.length, assigned: assigned.length })}
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('capaAssignments.search')}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white w-64 ml-auto"
        />
        {selected.size > 0 && (
          <button type="button" className={capaBtnPrimary} onClick={() => setDialog(true)}>
            {t('capaAssignments.assignSelection', { count: selected.size })}
          </button>
        )}
      </div>

      {loading && plans.length === 0 ? <ListSkeleton /> : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400 m-0 p-8 text-center">{t(view === 'unassigned' ? 'capaAssignments.noneToAssign' : 'capaAssignments.noneAssigned')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[52rem]">
                <thead>
                  <tr className="text-[11px] text-slate-500 bg-slate-50">
                    <th className="px-4 py-3 w-8"><input type="checkbox" checked={allOnPage} onChange={togglePage} style={{ accentColor: NAVY }} aria-label={t('capaAssignments.selectPage')} /></th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">{t('capaAssignments.colPlan')}</th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">{t('capaAssignments.colType')}</th>
                    <th className="text-left font-semibold px-4 py-3 whitespace-nowrap">{t('capaAssignments.colResponsible')}</th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">{t('capaAssignments.colDeadline')}</th>
                    <th className="text-right font-semibold px-4 py-3 whitespace-nowrap">{t('capaAssignments.colProgress')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((p) => {
                    const late = !!p.deadline && new Date(p.deadline).getTime() < Date.now();
                    return (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: NAVY }} aria-label={p.title} /></td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{p.title}</div>
                          {p.process && <div className="text-[11px] text-slate-500">{p.process}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{t(`planPage.type.${TYPE_KEY[p.type] ?? p.type}`, { defaultValue: p.type })}</td>
                        <td className="px-4 py-3 text-slate-700">{p.assignedToName || <span className="text-slate-400">{t('capaAssignments.nobody')}</span>}</td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: late ? BAD : undefined }}>{fmtDate(p.deadline)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{Math.round(p.progress)} %</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex gap-1.5">
                            <button type="button" className={capaBtnPrimary} onClick={() => navigate(`/admin/action-plans/${p.id}`)}>{t('qualityHistory.open')}</button>
                            <button type="button" className={capaBtnSecondary} onClick={() => ask([p.id])}>{t(view === 'unassigned' ? 'capaAssignments.assign' : 'capaAssignments.reassign')}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {rows.length > paged.pageSize && (
        <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={loading} />
      )}
    </div>
  );
}
