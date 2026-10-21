import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  archiveActionPlan,
  restoreActionPlan,
  createActionPlan,
  getActionPlans,
  updateActionPlan,
} from '../../services/actionPlanService';
import {
  CapaErrorBanner,
  CapaKpiStrip,
  CapaPageHeader,
  CapaPageShell,
  CapaPanel,
  capaBtnPrimary,
  capaBtnSecondary,
  capaInputCls,
  capaSelectCls,
} from '../../components/capa/CapaAdminUi';
import { ACTION_PLAN_API_URL as BASE_URL } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

interface ActionPlan {
  id: string;
  title: string;
  description?: string;
  type: number;
  status: number;
  ownerId: string;
  departmentId: string;
  departmentName: string;
  createdAt: string;
  deadline?: string;
}

const PAGE_SIZE = 12;

function statusCode(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'created' || s === 'draft') return 1;
  if (s === '2' || s === 'ongoing' || s === 'inprogress') return 2;
  if (s === '3' || s === 'closed') return 3;
  if (s === '4' || s === 'archived') return 4;
  return 0;
}

function typeCode(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'pa' || s === 'preventif' || s === 'preventive') return 1;
  if (s === '2' || s === 'pac' || s === 'correctif' || s === 'corrective') return 2;
  if (s === '3' || s === 'pap' || s === 'amelioration' || s === 'improvement') return 3;
  return 0;
}

function normalizePlan(raw: any): ActionPlan {
  const status = statusCode(raw?.status ?? raw?.Status);
  const archived = Boolean(raw?.isArchived ?? raw?.IsArchived) || status === 4;
  return {
    id: String(raw?.id ?? raw?.Id ?? ''),
    title: raw?.title ?? raw?.Title ?? '',
    description: raw?.description ?? raw?.Description,
    type: typeCode(raw?.type ?? raw?.Type),
    status: archived ? 4 : status,
    ownerId: String(raw?.ownerId ?? raw?.OwnerId ?? ''),
    departmentId: String(raw?.departmentId ?? raw?.DepartmentId ?? ''),
    departmentName: raw?.departmentName ?? raw?.DepartmentName ?? '',
    createdAt: raw?.createdAt ?? raw?.CreatedAt ?? '',
    deadline: raw?.deadline ?? raw?.Deadline,
  };
}

interface Department {
  id: string;
  name: string;
  code: string;
}

/** Values are i18n keys. */
const ACTION_PLAN_TYPES: Record<number, string> = {
  1: 'plansAdmin.typePreventive',
  2: 'plansAdmin.typeCorrective',
  3: 'plansAdmin.typeImprovement',
};
const getTypeLabel = (type: number) => (ACTION_PLAN_TYPES[type] ? i18n.t(ACTION_PLAN_TYPES[type]) : '—');

/** label = i18n key */
const ACTION_PLAN_STATUSES: Record<number, { label: string; color: string }> = {
  1: { label: 'planView.statusDraft', color: 'bg-slate-100 text-slate-600' },
  2: { label: 'status.ongoing', color: 'bg-blue-50 text-blue-700' },
  3: { label: 'status.closed', color: 'bg-emerald-50 text-emerald-700' },
  4: { label: 'status.archived', color: 'bg-rose-50 text-rose-700' },
};
const getStatusInfo = (status: number) => {
  const info = ACTION_PLAN_STATUSES[status];
  return info ? { ...info, label: i18n.t(info.label) } : { label: '—', color: 'bg-slate-100 text-slate-500' };
};

const btnSecondary =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200 disabled:opacity-40';
const btnPrimary =
  'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white hover:bg-[#00009e]';

function dayStamp(value?: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(dateLocale());
}

const ActionPlanList = () => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [plans, setPlans] = useState<ActionPlan[]>([]);
  const [archivedPlans, setArchivedPlans] = useState<ActionPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ActionPlan | null>(null);
  const initialStatus = (() => {
    const raw = searchParams.get('status');
    if (raw === '4' || raw === 'archived') return 4 as const;
    const n = Number(raw);
    if (n === 1 || n === 2 || n === 3) return n;
    return 'all' as const;
  })();
  const [filterStatus, setFilterStatus] = useState<number | 'all'>(initialStatus);
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterType, setFilterType] = useState<'all' | number>('all');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [lateOnly, setLateOnly] = useState(searchParams.get('late') === '1');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 1,
    departmentId: '',
    status: 1,
  });

  const headers = { headers: { Authorization: `Bearer ${accessToken}` } };
  const showArchived = filterStatus === 4;

  const applyStatusFilter = (next: number | 'all') => {
    setPage(1);
    setFilterStatus(next);
    if (next === 'all') {
      searchParams.delete('status');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ status: String(next) }, { replace: true });
    }
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      setError('');
      const res = await getActionPlans(accessToken!);
      const payload = Array.isArray(res.data) ? res.data : res.data?.data ?? [];
      const all = (Array.isArray(payload) ? payload : []).map(normalizePlan).filter((p) => p.id);
      setPlans(all.filter((p) => p.status !== 4));
      setArchivedPlans(all.filter((p) => p.status === 4));
    } catch (e: any) {
      setError(e?.message || t('planList.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/department`, headers);
      setDepartments(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadPlans();
    void loadDepartments();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', type: 1, departmentId: '', status: 1 });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await updateActionPlan(accessToken!, editing.id, {
          title: form.title,
          description: form.description,
          status: form.status,
        });
      } else {
        await createActionPlan(accessToken!, {
          title: form.title,
          description: form.description,
          type: form.type,
          departmentId: form.departmentId,
        });
      }
      setShowModal(false);
      void loadPlans();
    } catch (e) {
      console.error(e);
    }
  };

  const [ask, setAsk] = useState<ActionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const handleArchive = async (plan: ActionPlan) => {
    setBusy(true);
    setNotice(null);
    try {
      await archiveActionPlan(accessToken!, plan.id);
      setNotice({ ok: true, text: t('planList.archiveDone', { title: plan.title }) });
      await loadPlans();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || e?.message || t('adminLists.archiveFailed') });
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const handleRestore = async (plan: ActionPlan) => {
    setBusy(true);
    setNotice(null);
    try {
      await restoreActionPlan(accessToken!, plan.id);
      setNotice({ ok: true, text: t('planList.restoreDone', { title: plan.title }) });
      await loadPlans();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || e?.message || t('adminLists.archiveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const goToDetail = (id: string) => navigate(`/admin/action-plans/${id}`);
  const activeSource = showArchived ? archivedPlans : plans;
  const departmentsInList = Array.from(
    new Set(activeSource.map((p) => p.departmentName).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, i18n.language));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStamp = today.getTime();
  const filteredPlans = activeSource
    .filter((p) => filterStatus === 'all' || filterStatus === 4 || p.status === filterStatus)
    .filter((p) => filterDepartment === 'all' || p.departmentName === filterDepartment)
    .filter((p) => filterType === 'all' || p.type === filterType)
    .filter((p) => {
      if (!filterFrom && !filterTo) return true;
      const due = dayStamp(p.deadline);
      const from = dayStamp(filterFrom);
      const to = dayStamp(filterTo);
      if (due == null) return false;
      if (from != null && due < from) return false;
      if (to != null && due > to) return false;
      return true;
    })
    .filter((p) => {
      if (!lateOnly) return true;
      if (p.status === 3 || p.status === 4) return false;
      const due = dayStamp(p.deadline);
      return due != null && due < todayStamp;
    })
    .filter((p) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        p.title.toLowerCase().includes(term) ||
        (p.departmentName || '').toLowerCase().includes(term) ||
        getTypeLabel(p.type).toLowerCase().includes(term)
      );
    });
  const pageCount = Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredPlans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filteredPlans.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredPlans.length);

  const shimmer = 'ap-shimmer rounded-md';

  return (
    <CapaPageShell>
      <style>{`
        @keyframes ap-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .ap-shimmer {
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
          background-size: 800px 100%;
          animation: ap-shimmer 1.2s ease-in-out infinite;
        }
      `}</style>
      <CapaPageHeader
        eyebrow={t('createPlan.eyebrow')}
        title={t('plansAdmin.allPlans')}
        subtitle={t('planList.subtitle')}
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={() => void loadPlans()}>
              {t('dashboard.refresh')}
            </button>
            {!showArchived && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => navigate('/admin/action-plans/create')}
              >
                + {t('admin.newPlan')}
              </button>
            )}
            {!showArchived && (
              <button type="button" className={btnSecondary} onClick={openCreate}>
                {t('planList.quickCreate')}
              </button>
            )}
          </>
        }
      />

      {error ? <CapaErrorBanner message={error} /> : null}
      {notice && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}
      {ask && (
        <ConfirmDialog
          title={t('planList.archiveTitle')}
          text={t('planList.archiveText', { title: ask.title })}
          confirmLabel={t('adminLists.archive')}
          danger
          busy={busy}
          onConfirm={() => void handleArchive(ask)}
          onCancel={() => setAsk(null)}
        />
      )}

      <CapaKpiStrip
        variant="soft"
        items={Object.entries(ACTION_PLAN_STATUSES).map(([key, val]) => {
          const statusNum = Number(key);
          const count =
            statusNum === 4
              ? archivedPlans.length
              : plans.filter((p) => p.status === statusNum).length;
          return {
            key,
            label: t(val.label),
            value: count,
            active: filterStatus === statusNum,
            onClick: () => applyStatusFilter(filterStatus === statusNum ? 'all' : statusNum),
          };
        })}
      />

      <CapaPanel
        className="mb-5"
        padding
        title={t('plansAdmin.filters')}
        meta={
          <span className="text-xs font-medium text-slate-500">
            {t('adminLists.results', { count: filteredPlans.length })}
          </span>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('actionsReport.search')}</span>
            <input
              className={capaInputCls}
              placeholder={t('planList.searchPh')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('planDetail.department')}</span>
            <select
              className={capaSelectCls}
              value={filterDepartment}
              onChange={(e) => {
                setFilterDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t('audit.allDepartments')}</option>
              {departmentsInList.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('common.status')}</span>
            <select
              className={capaSelectCls}
              value={filterStatus === 'all' ? 'all' : String(filterStatus)}
              onChange={(e) => {
                const v = e.target.value;
                applyStatusFilter(v === 'all' ? 'all' : Number(v));
              }}
            >
              <option value="all">{t('activity.all')}</option>
              <option value="1">{t('planView.statusDraft')}</option>
              <option value="2">{t('status.ongoing')}</option>
              <option value="3">{t('status.closed')}</option>
              <option value="4">{t('status.archived')}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('planDetail.type')}</span>
            <select
              className={capaSelectCls}
              value={filterType === 'all' ? 'all' : String(filterType)}
              onChange={(e) => {
                const v = e.target.value;
                setFilterType(v === 'all' ? 'all' : Number(v));
                setPage(1);
              }}
            >
              <option value="all">{t('reportPlans.allTypes')}</option>
              <option value="1">{t('plansAdmin.typePreventive')}</option>
              <option value="2">{t('plansAdmin.typeCorrective')}</option>
              <option value="3">{t('plansAdmin.typeImprovement')}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('capaDash.dueFrom')}</span>
            <input
              type="date"
              className={capaSelectCls}
              value={filterFrom}
              onChange={(e) => {
                setFilterFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('capaDash.dueTo')}</span>
            <input
              type="date"
              className={capaSelectCls}
              value={filterTo}
              onChange={(e) => {
                setFilterTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-1">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
              <input
                type="checkbox"
                checked={lateOnly}
                onChange={(e) => {
                  setLateOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-300 text-[#000168] focus:ring-[#000168]"
              />
              {t('planDetail.late')}
            </label>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setSearch('');
                setFilterDepartment('all');
                setFilterType('all');
                setFilterFrom('');
                setFilterTo('');
                setLateOnly(false);
                applyStatusFilter('all');
              }}
            >
              {t('common.reset')}
            </button>
          </div>
        </div>
      </CapaPanel>

      <CapaPanel
        padding={false}
        title={showArchived ? t('planList.archivedPlans') : t('planList.activePlans')}
        meta={
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {filteredPlans.length}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t('dashboard.colTitle')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('planDetail.type')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('planDetail.department')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('common.status')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('dashboard.colDeadline')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('planView.createdOn')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-4 w-48 max-w-full`} /></td>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-5 w-20 rounded-full`} /></td>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-4 w-28`} /></td>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-5 w-16 rounded-full`} /></td>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-4 w-16`} /></td>
                      <td className="px-4 py-3.5"><div className={`${shimmer} h-4 w-16`} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <div className={`${shimmer} h-6 w-14`} />
                          <div className={`${shimmer} h-6 w-16`} />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : filteredPlans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      {showArchived ? t('planList.noArchived') : t('planList.noPlans')}
                    </td>
                  </tr>
                ) : (
                pageRows.map((plan) => {
                  const status = getStatusInfo(plan.status);
                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3.5">
                        <button
                          type="button"
                          className="font-medium text-[#000168] hover:underline text-left"
                          onClick={() => goToDetail(plan.id)}
                        >
                          {plan.title}
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-semibold bg-[#000168]/08 text-[#000168]">
                          {getTypeLabel(plan.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">{plan.departmentName || '—'}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{formatDate(plan.deadline)}</td>
                      <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">{formatDate(plan.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" className={btnPrimary} onClick={() => goToDetail(plan.id)}>
                            {t('qualityHistory.open')}
                          </button>
                          {showArchived ? (
                            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void handleRestore(plan)}>{t('adminLists.restore')}</button>
                          ) : (
                            <button type="button" className={`${btnSecondary} !text-red-600`} onClick={() => setAsk(plan)}>{t('adminLists.archive')}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{rangeStart}–{rangeEnd} sur {filteredPlans.length}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t('qualityHistory.previous')}
            </button>
            <span className="tabular-nums text-xs">{currentPage} / {pageCount}</span>
            <button
              type="button"
              className={btnSecondary}
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {t('qualityHistory.next')}
            </button>
          </div>
        </div>
      </CapaPanel>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#000168]">
                  {t('planList.modalKicker')}
                </p>
                <h2 className="text-lg font-bold text-[#000168]">
                  {editing ? t('planList.editPlan') : t('planList.quickCreate')}
                </h2>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                onClick={() => setShowModal(false)}
                aria-label={t('fiveWhy.close')}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input
                className={capaInputCls}
                placeholder={t('dashboard.colTitle')}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <textarea
                className={capaInputCls}
                placeholder={t('planList.descriptionPh')}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
              {!editing && (
                <>
                  <select
                    className={capaSelectCls}
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: Number(e.target.value) })}
                  >
                    <option value={1}>{t('plansAdmin.typePreventive')}</option>
                    <option value={2}>{t('plansAdmin.typeCorrective')}</option>
                    <option value={3}>{t('plansAdmin.typeImprovement')}</option>
                  </select>
                  <select
                    className={capaSelectCls}
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  >
                    <option value="">{t('planList.selectDepartment')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </>
              )}
              {editing && (
                <select
                  className={capaSelectCls}
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}
                >
                  <option value={1}>{t('planView.statusDraft')}</option>
                  <option value={2}>{t('status.ongoing')}</option>
                  <option value={3}>{t('status.closed')}</option>
                </select>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button type="button" className={capaBtnSecondary} onClick={() => setShowModal(false)}>
                {t('common.cancel')}
              </button>
              <button type="button" className={capaBtnPrimary} onClick={() => void handleSubmit()}>
                {editing ? t('common.save') : t('orgs.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </CapaPageShell>
  );
};

export default ActionPlanList;
