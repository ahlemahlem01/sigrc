// src/pages/front/FrontActionPlans.tsx
// Admin CAPA list — notifications live in FrontLayout nav.
import TablePagination from '../../components/TablePagination';
import { usePagedList } from '../../hooks/usePagedList';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { downloadTable, readPrefs } from '../../utils/dataExchange';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { isPlatformAdmin } from '../../utils/roles';
import {
  archiveActionPlan, archivePlanAction, assignActionPlanToUser, closeActionPlan, createActionPlan, createPlanAction,
  getActionPlans, getPendingValidation, getRejectedActionPlans, getUsersForAssignment, importActionPlansCsv, restoreActionPlan, updateActionPlan, updatePlanAction,
} from '../../services/actionPlanService';
import { ActionPlan, ActionPlanStatus, ActionPlanType, Department, Organization, PlanAction, PlanActionPriority, User } from './action-plan.types';
import { EmployeeRecommendationBanner } from '../../components/EmployeeRecommendationBanner';
import { CsvImportButton } from '../../components/CsvImportButton';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

// ── Constants ─────────────────────────────────────────────────────────────────
const COFICAB = '#000168';

const STATUS_CFG = {
  created:  { label: 'plansAdmin.statusCreated', color: 'text-slate-600',   bg: 'bg-slate-100',   bar: 'bg-slate-400',   dot: '#94a3b8' },
  ongoing:  { label: 'plansAdmin.statusOngoing',   color: 'text-emerald-700', bg: 'bg-emerald-50',  bar: 'bg-emerald-500', dot: '#10b981' },
  closed:   { label: 'plansAdmin.statusClosed',    color: 'text-blue-700',    bg: 'bg-blue-50',     bar: 'bg-blue-500',    dot: '#3b82f6' },
  archived: { label: 'plansAdmin.statusArchived',  color: 'text-gray-500',    bg: 'bg-gray-100',    bar: 'bg-gray-400',    dot: '#9ca3af' },
};

/** label values in STATUS_CFG / TYPE_CFG / PRIORITY_CFG are i18n keys. */
const TYPE_CFG: Record<ActionPlanType, { label: string; color: string; bg: string }> = {
  preventif:    { label: 'plansAdmin.typePreventive', color: 'text-violet-700', bg: 'bg-violet-50' },
  correctif:    { label: 'plansAdmin.typeCorrective', color: 'text-rose-700',   bg: 'bg-rose-50'   },
  amelioration: { label: 'plansAdmin.typeImprovement', color: 'text-teal-700',   bg: 'bg-teal-50'   },
};

/** Map CAPA type → DefectType ML (catégories métier stables). */
const TYPE_TO_DEFECT: Record<ActionPlanType, string> = {
  preventif: 'Documentation',
  correctif: 'Fonctionnel',
  amelioration: 'Dimensionnel',
};

const PRIORITY_TO_SEVERITY: Record<string, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
};

const PRIORITY_CFG: Record<PlanActionPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'myActionPlans.priorityLow',  color: 'text-slate-600',  bg: 'bg-slate-100'  },
  medium: { label: 'myActionPlans.priorityMedium', color: 'text-amber-700',  bg: 'bg-amber-100'  },
  high:   { label: 'myActionPlans.priorityHigh',   color: 'text-rose-700',   bg: 'bg-rose-100'   },
};

const safeStatus   = (s: ActionPlanStatus)    => STATUS_CFG[s]   ?? STATUS_CFG.created;
const safeType     = (t: ActionPlanType)       => TYPE_CFG[t]     ?? TYPE_CFG.preventif;
const safePriority = (p: PlanActionPriority)   => PRIORITY_CFG[p] ?? PRIORITY_CFG.medium;

const getPlanStatus = (plan: ActionPlan) => {
  if (plan.status === 'ongoing' && (plan.progress ?? 0) >= 100)
    return { ...STATUS_CFG.ongoing, label: 'plansAdmin.statusPending', dot: '#f59e0b', bar: 'bg-amber-500', bg: 'bg-amber-50', color: 'text-amber-700' };
  return safeStatus(plan.status);
};

const typeToNumber: Record<ActionPlanType, number>   = { preventif: 1, correctif: 2, amelioration: 3 };
const priorityToNumber = (p: PlanActionPriority): number => ({ low: 1, medium: 2, high: 3 }[p] ?? 2);
const statusToNumber   = (s: ActionPlanStatus): number  => ({ created: 1, ongoing: 2, closed: 3, archived: 4 }[s]);

/** API sérialise les enums en string ("Ongoing") OU parfois en nombre. */
function toUiStatus(raw: unknown): ActionPlanStatus {
  if (typeof raw === 'number') {
    return ({ 1: 'created', 2: 'ongoing', 3: 'closed', 4: 'archived' } as const)[raw as 1|2|3|4] ?? 'created';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'created' || s === 'draft') return 'created';
  if (s === '2' || s === 'ongoing' || s === 'inprogress' || s === 'in_progress') return 'ongoing';
  if (s === '3' || s === 'closed' || s === 'validated' || s === 'done') return 'closed';
  if (s === '4' || s === 'archived') return 'archived';
  return 'created';
}

function toUiType(raw: unknown): ActionPlanType {
  if (typeof raw === 'number') {
    return ({ 1: 'preventif', 2: 'correctif', 3: 'amelioration' } as const)[raw as 1|2|3] ?? 'preventif';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '1' || s === 'pa' || s === 'preventif' || s === 'preventive') return 'preventif';
  if (s === '2' || s === 'pac' || s === 'correctif' || s === 'corrective') return 'correctif';
  if (s === '3' || s === 'pap' || s === 'amelioration' || s === 'improvement') return 'amelioration';
  return 'preventif';
}

function toUiPriority(raw: unknown): PlanActionPriority {
  if (typeof raw === 'number') {
    if (raw === 1) return 'high';
    if (raw === 2) return 'medium';
    return 'low';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'high' || s === '1') return 'high';
  if (s === 'medium' || s === '2') return 'medium';
  if (s === 'low' || s === '3' || s === '0') return 'low';
  return 'medium';
}

function parseActionProgress(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw === 101) return 100; // Validated
    if (raw === 102) return 0;   // Cancelled
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const named: Record<string, number> = {
    notstarted: 0, none: 0,
    twentyfive: 25, thirtythree: 33,
    fifty: 50, sixtysix: 66, seventyfive: 75,
    hundred: 100, done: 100, completed: 100, validated: 100,
    cancelled: 0, canceled: 0,
  };
  if (s in named) return named[s];
  const n = Number(s);
  if (Number.isFinite(n)) return parseActionProgress(n);
  return 0;
}

function unwrapList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function pickClaimId(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    return pickClaimId(r.claimId ?? r.ClaimId);
  }
  const s = String(raw).trim();
  if (!s || /^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(s)) return undefined;
  return s;
}

function mapPlanFromApi(p: any): ActionPlan {
  const status = toUiStatus(p.status ?? p.Status);
  let progress = parseActionProgress(p.progress ?? p.Progress);
  // Validated / archived CAPA are complete by definition — never show < 100%.
  if (status === 'closed' || status === 'archived') progress = 100;

  return {
    ...p,
    id: String(p.id || p.Id || ''),
    title: p.title || p.name || p.Title || '',
    description: p.description || p.Description || '',
    status,
    type: toUiType(p.type ?? p.Type),
    progress,
    assignedToId: p.assignedToId || p.AssignedToId || undefined,
    createdById: p.createdBy || p.CreatedBy || p.ownerId || p.OwnerId || p.createdById || '',
    deadline: p.deadline || p.Deadline || undefined,
    departmentId: p.departmentId || p.DepartmentId || '',
    organizationId: p.organizationId || p.OrganizationId || '',
    claimId: pickClaimId(p),
    proofCount: Number(p.proofCount ?? p.ProofCount ?? 0),
    lastRejectedAt: p.lastRejectedAt || p.LastRejectedAt || undefined,
    lastRejectComment: p.lastRejectComment || p.LastRejectComment || undefined,
    createdAt: p.createdAt || p.CreatedAt || '',
    planActions: unwrapList(p.planActions || p.PlanActions).map((pa: any) => ({
      ...pa,
      id: String(pa.id || pa.Id || ''),
      title: pa.title || pa.Title || '',
      description: pa.description || pa.Description || '',
      priority: toUiPriority(pa.priority ?? pa.Priority),
      status: toUiStatus(pa.status ?? pa.Status),
      progress: parseActionProgress(pa.progress ?? pa.Progress),
      assignedToId: pa.assignedToId || pa.AssignedToId || undefined,
      deadline: pa.deadline || pa.Deadline || undefined,
      documentCount: Number(pa.documentCount ?? pa.DocumentCount ?? 0),
    })),
  } as ActionPlan;
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const Ico = ({ d, size = 16, className = '' }: { d: string | string[]; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
  </svg>
);

const IcoSearch = () => <Ico d={['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z']} />;
const IcoPlus   = () => <Ico d="M12 4v16m8-8H4" />;
const IcoEdit   = () => <Ico d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />;
const IcoArchive= () => <Ico d={['M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4']} />;
const IcoRestore= () => <Ico d={['M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15']} />;
const IcoChevR  = () => <Ico d="M9 5l7 7-7 7" />;
const IcoX      = () => <Ico d="M6 18L18 6M6 6l12 12" />;
const IcoFilter = () => <Ico d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />;
const IcoCheck  = () => <Ico d="M20 6L9 17l-5-5" />;

type ViewFilter = 'all' | 'ongoing' | 'created' | 'archived' | 'pending' | 'closed' | 'rejected';

type ChartSlice = {
  key: ViewFilter;
  label: string;
  value: number;
  color: string;
  filter: ViewFilter;
};

function StatusChart({
  slices,
  total,
  activeFilter,
  onSelect,
  onReset,
}: {
  slices: ChartSlice[];
  total: number;
  activeFilter: ViewFilter;
  onSelect: (f: ViewFilter) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const data = useMemo(() => slices.filter((s) => s.value > 0), [slices]);
  const chartData: Array<ChartSlice | { key: string; label: string; value: number; color: string; filter: ViewFilter }> =
    data.length > 0 ? data : [{ key: 'empty', label: t('createClaim.none'), value: 1, color: '#e2e8f0', filter: 'all' }];

  return (
    <div className="fap-chart">
      <div className="fap-chart-viz">
        <ResponsiveContainer width="100%" height={148}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={46}
              outerRadius={66}
              paddingAngle={data.length > 1 ? 3 : 0}
              stroke="none"
              cursor="pointer"
              onClick={(_, idx) => {
                const slice = chartData[idx as number];
                if (slice && slice.key !== 'empty') onSelect(slice.filter);
              }}
            >
              {chartData.map((entry) => (
                <Cell key={String(entry.key)} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any, name: any) => [t('usersAdmin.plans', { count: Number(value) }), name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <button type="button" className="fap-chart-center" onClick={onReset} title={t('plansAdmin.viewAll')}>
          <strong>{total}</strong>
          <span>{activeFilter === 'all' ? t('plansAdmin.allShort') : `← ${t('plansAdmin.allShort')}`}</span>
        </button>
      </div>
      <div className="fap-chart-legend-wrap">
        <div className="fap-chart-legend-head">
          <p className="fap-chart-title">{t('plansAdmin.breakdown')}</p>
          {activeFilter !== 'all' && (
            <button type="button" className="fap-chip-btn" onClick={onReset}>
              ← {t('plansAdmin.allPlans')}
            </button>
          )}
        </div>
        <div className="fap-chart-legend">
          {slices.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            const on = activeFilter === s.filter;
            return (
              <button
                key={s.key}
                type="button"
                className={`fap-leg${on ? ' on' : ''}`}
                onClick={() => onSelect(s.filter)}
              >
                <span className="fap-leg-dot" style={{ background: s.color }} />
                <span className="fap-leg-label">{s.label}</span>
                <span className="fap-leg-val">{s.value}</span>
                <span className="fap-leg-pct">{pct}%</span>
                <span className="fap-leg-bar"><i style={{ width: `${pct}%`, background: s.color }} /></span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function userLabel(users: User[], id?: string | null): string {
  if (!id) return i18n.t('claimDetail.unassigned');
  const u = users.find((x) => String(x.id) === String(id)) as any;
  if (!u) return i18n.t('claimSidebar.assigned');
  return u.fullName || u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || i18n.t('claimSidebar.assigned');
}

// ── Plan row (liste simple) ───────────────────────────────────────────────────
function PlanRow({ plan, users, index, onEdit, onArchive, onRestore, onValidate, onView, viewFilter, validating }: {
  plan: ActionPlan; users: User[]; index: number;
  onEdit: () => void; onArchive: () => void;
  onRestore: () => void; onValidate: () => void; onView: () => void;
  viewFilter: ViewFilter; validating: boolean;
}) {
  const { t } = useTranslation();
  const sc = getPlanStatus(plan);
  const tc = safeType(plan.type);
  const startOfToday = (() => {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n.getTime();
  })();
  const planOpen = plan.status !== 'archived' && plan.status !== 'closed';
  const openActionOverdue = (plan.planActions || []).some((pa) => {
    if (!pa.deadline) return false;
    const prog = Number(pa.progress ?? 0);
    if (prog >= 100) return false;
    const d = new Date(pa.deadline);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < startOfToday;
  });
  const planDeadlineOverdue = !!plan.deadline && (() => {
    const d = new Date(plan.deadline);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < startOfToday;
  })();
  const isOverdue = planOpen && (planDeadlineOverdue || openActionOverdue);
  const assignee = userLabel(users, plan.assignedToId);
  const progress =
    plan.status === 'closed' || plan.status === 'archived'
      ? 100
      : Math.max(0, Math.min(100, plan.progress ?? 0));

  return (
    <div
      className={`fap-row${isOverdue ? ' is-overdue' : ''}`}
      onClick={onView}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onView(); }}
    >
      <div className="fap-row-idx" style={{ color: isOverdue ? '#b91c1c' : sc.dot }}>{String(index + 1).padStart(2, '0')}</div>
      <div className="fap-row-rail" style={{ background: isOverdue ? '#dc2626' : sc.dot }} />
      <div className="fap-row-body">
        <div className="fap-row-top">
          <h3 className="fap-row-title" style={isOverdue ? { color: '#b91c1c' } : undefined}>
            {plan.title || t('closedArchive.untitled')}
            {isOverdue && <span className="late" style={{ marginLeft: 8, fontSize: 11 }}>{t('planDetail.late')}</span>}
          </h3>
        </div>
        <div className="fap-row-meta">
          <span>{t(tc.label)}</span>
          <span>·</span>
          <span>{t('plansAdmin.assignee', { name: assignee })}</span>
          {plan.claimId && (
            <>
              <span>·</span>
              <Link
                to={`/pages/front/quality-analyses/8d/${encodeURIComponent(String(plan.claimId))}`}
                className="fap-dossier-link"
                onClick={(e) => e.stopPropagation()}
              >
                → {t('myActionPlans.viewDossier')}
              </Link>
            </>
          )}
          {plan.lastRejectComment && (
            <>
              <span>·</span>
              <span className="late">{t('plansAdmin.sentBack')}</span>
            </>
          )}
          {plan.deadline && (
            <>
              <span>·</span>
              <span className={isOverdue ? 'late' : ''}>
                {new Date(plan.deadline).toLocaleDateString(dateLocale())}
                {isOverdue ? ` · ${t('planView.lateShort')}` : ''}
              </span>
            </>
          )}
          {(plan.planActions?.length ?? 0) > 0 && (
            <>
              <span>·</span>
              <span>{t('plansAdmin.actionCount', { count: plan.planActions.length })}</span>
            </>
          )}
        </div>
        <div className="fap-row-prog">
          <div className="fap-row-prog-track"><i style={{ width: `${progress}%`, background: sc.dot }} /></div>
          <span>{progress}%</span>
        </div>
      </div>
      <div className="fap-row-acts" onClick={(e) => e.stopPropagation()}>
        <span className="fap-row-status" style={{ color: sc.dot, background: `${sc.dot}14` }}>{t(sc.label)}</span>
        {viewFilter !== 'archived' && (
          <>
            <button type="button" className="fap-icon-btn" title={t('common.edit')} onClick={onEdit}><IcoEdit /></button>
            <button type="button" className="fap-icon-btn" title={t('alerts.archive')} onClick={onArchive}><IcoArchive /></button>
          </>
        )}
        {viewFilter === 'archived' && (
          <button type="button" className="fap-icon-btn" title={t('alerts.restore')} onClick={onRestore}><IcoRestore /></button>
        )}
        {viewFilter === 'pending' && (
          <button type="button" className="fap-validate" disabled={validating} onClick={onValidate}>
            <IcoCheck /> {validating ? '…' : t('alerts.validate')}
          </button>
        )}
        <button type="button" className="fap-open" onClick={onView}>{t('qualityHistory.open')} <IcoChevR /></button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export const FrontActionPlans: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();

  const [actionPlans, setActionPlans]       = useState<ActionPlan[]>([]);
  const [archivedPlans, setArchivedPlans]   = useState<ActionPlan[]>([]);
  const [pendingPlans, setPendingPlans]     = useState<ActionPlan[]>([]);
  const [validatingId, setValidatingId]     = useState<string | null>(null);
  const [departments, setDepartments]       = useState<Department[]>([]);
  const [organizations, setOrganizations]   = useState<Organization[]>([]);
  const [users, setUsers]                   = useState<User[]>([]);
  const [filteredDepts, setFilteredDepts]   = useState<Department[]>([]);
  const [rejectedPlans, setRejectedPlans]   = useState<ActionPlan[]>([]);
  const [planActions, setPlanActions]       = useState<PlanAction[]>([]);
  const [newPlanAction, setNewPlanAction]   = useState<Partial<PlanAction>>({ title: '', description: '', priority: 'medium', deadline: '', assignedToId: '' });
  const [planActionErrors, setPlanActionErrors] = useState<Record<string, string>>({});
  const [editingPlanActionId, setEditingPlanActionId] = useState<string | null>(null);
  const [editPlanActionData, setEditPlanActionData]   = useState<Partial<PlanAction>>({});
  const [loading, setLoading]               = useState(true);
  const [viewFilter, setViewFilter]         = useState<ViewFilter>('all');
  const [showModal, setShowModal]           = useState(false);
  const [editingPlan, setEditingPlan]       = useState<ActionPlan | null>(null);
  const [submitting, setSubmitting]         = useState(false);
  const [search, setSearch]                 = useState('');
  const [filterDept, setFilterDept]         = useState('');
  const [filterStatus, setFilterStatus]     = useState<string>('all');
  const [filterType, setFilterType]         = useState<string>('all');
  const [showFilters, setShowFilters]       = useState(false);
  const [searchParams] = useSearchParams();
  const sourceAlertId = searchParams.get('alertId') || '';
  const [formData, setFormData] = useState({
    title: '', description: '', type: 'preventif' as ActionPlanType,
    organizationId: '', departmentId: '', assignedToId: '', deadline: '', claimId: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const plansRes = await getActionPlans(accessToken, true);
      const mapped = unwrapList(plansRes.data).map(mapPlanFromApi);
      setActionPlans(mapped.filter((p) => p.status !== 'archived'));
      setArchivedPlans(mapped.filter((p) => p.status === 'archived'));

      // Charger les plans en attente de validation
      try {
        const pendingRes = await getPendingValidation(accessToken);
        const mappedPending = unwrapList(pendingRes.data?.data ?? pendingRes.data).map(mapPlanFromApi);
        setPendingPlans(mappedPending);
      } catch (e) {
        console.error('Failed to load pending validation plans:', e);
        setPendingPlans(mapped.filter((p) => p.status === 'ongoing' && (p.progress ?? 0) >= 100));
      }

      try {
        const rejectedRes = await getRejectedActionPlans(accessToken);
        setRejectedPlans(unwrapList(rejectedRes.data?.data ?? rejectedRes.data).map(mapPlanFromApi));
      } catch {
        setRejectedPlans(mapped.filter((p) => !!p.lastRejectedAt && (p.progress ?? 0) < 100 && p.status === 'ongoing'));
      }

      await Promise.allSettled([
        axios.get(`${ACTION_PLAN_API_URL}/organization`, { headers: { Authorization: `Bearer ${accessToken}` } })
          .then(r => setOrganizations(unwrapList(r.data))).catch(() => setOrganizations([])),
        axios.get(`${ACTION_PLAN_API_URL}/department`, { headers: { Authorization: `Bearer ${accessToken}` } })
          .then(r => setDepartments(unwrapList(r.data))).catch(() => setDepartments([])),
        getUsersForAssignment(accessToken).then(r => {
          const list = unwrapList((r as any)?.data ?? r);
          setUsers(list.map((u: any) => ({
            id: String(u.id || u.Id || u.sub || ''),
            email: u.email || u.Email || '',
            firstName: u.firstName || u.FirstName,
            lastName: u.lastName || u.LastName,
            fullName: u.fullName || u.FullName || u.name || u.Name,
            department: u.department || u.Department,
            departmentId: u.departmentId != null
              ? String(u.departmentId)
              : u.DepartmentId != null
                ? String(u.DepartmentId)
                : undefined,
          })).filter((u: User) => u.id));
        }).catch(() => setUsers([])),
      ]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [accessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (sourceAlertId) setShowModal(true);
  }, [sourceAlertId]);

  const handleOrgChange = async (orgId: string) => {
    setFormData(p => ({ ...p, organizationId: orgId, departmentId: '' }));
    setFilteredDepts([]);
    if (orgId && accessToken) {
      axios.get(`${ACTION_PLAN_API_URL}/department/by-organization/${orgId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(r => setFilteredDepts(r.data || [])).catch(() => setFilteredDepts([]));
    }
  };

  const openEdit = async (plan: ActionPlan) => {
    setFormData({
      title: plan.title, description: plan.description || '', type: plan.type,
      organizationId: plan.organizationId || '', departmentId: plan.departmentId || '',
      assignedToId: plan.assignedToId || '',
      deadline: plan.deadline ? plan.deadline.split('T')[0] : '',
      claimId: plan.claimId || '',
    });
    setEditingPlan(plan);
    setPlanActions(plan.planActions || []);
    setEditingPlanActionId(null);
    if (plan.organizationId && accessToken) {
      axios.get(`${ACTION_PLAN_API_URL}/department/by-organization/${plan.organizationId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(r => setFilteredDepts(r.data || [])).catch(() => setFilteredDepts([]));
    }
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', type: 'preventif', organizationId: '', departmentId: '', assignedToId: '', deadline: '', claimId: '' });
    setFormErrors({}); setFilteredDepts([]); setPlanActions([]);
    setNewPlanAction({ title: '', description: '', priority: 'medium', deadline: '', assignedToId: '' });
    setPlanActionErrors({}); setEditingPlanActionId(null); setEditPlanActionData({});
  };

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!formData.title.trim()) e.title = t('calendar.titleRequired');
    if (!formData.organizationId) e.organizationId = t('plansAdmin.orgRequired');
    if (!formData.departmentId) e.departmentId = t('plansAdmin.deptRequired');
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const validatePA = () => {
    const e: Record<string, string> = {};
    if (!newPlanAction.title?.trim()) e.title = t('calendar.titleRequired');
    if (!newPlanAction.deadline) e.deadline = t('plansAdmin.deadlineRequired');
    setPlanActionErrors(e);
    return Object.keys(e).length === 0;
  };

  const addPA = () => {
    if (!validatePA()) return;
    setPlanActions(prev => [...prev, {
      id: `temp-${Date.now()}`, title: newPlanAction.title!, description: newPlanAction.description,
      priority: newPlanAction.priority as PlanActionPriority, deadline: newPlanAction.deadline,
      assignedToId: newPlanAction.assignedToId, progress: 0,
    } as PlanAction]);
    setNewPlanAction({ title: '', description: '', priority: 'medium', deadline: '', assignedToId: '' });
    setPlanActionErrors({});
  };

  const handleCreate = async () => {
    if (!validateForm() || !accessToken) return;
    try {
      setSubmitting(true);
      const res = await createActionPlan(accessToken, {
        title: formData.title, description: formData.description,
        type: typeToNumber[formData.type], departmentId: formData.departmentId,
        organizationId: formData.organizationId, assignedToId: formData.assignedToId || undefined,
        deadline: formData.deadline || undefined,
        claimId: formData.claimId?.trim() || undefined,
        alertId: sourceAlertId || undefined,
      });
      const id = res.data?.id;

      // 🆕 Créer l'assignation dans UserActionPlanAssignments
      if (formData.assignedToId && id) {
        try {
          await assignActionPlanToUser(accessToken, {
            userId: formData.assignedToId,
            actionPlanId: id,
            permissions: { view: true, edit: true, delete: false },
          });
        } catch (e) {
          console.error('Assignation failed:', e);
        }
      }

      const newOnes = planActions.filter(pa => String(pa.id).startsWith('temp-'));
      if (newOnes.length && id) {
        await Promise.all(newOnes.map(pa => createPlanAction(accessToken, {
          title: pa.title, description: pa.description, deadline: new Date(pa.deadline!).toISOString(),
          priority: priorityToNumber(pa.priority), assignedToId: pa.assignedToId || formData.assignedToId || users[0]?.id || '',
          actionPlanId: id,
        })));
      }
      setShowModal(false); resetForm(); loadData();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editingPlan || !validateForm() || !accessToken) return;
    try {
      setSubmitting(true);
      await updateActionPlan(accessToken, editingPlan.id, {
        title: formData.title, description: formData.description, status: statusToNumber(editingPlan.status),
        type: typeToNumber[formData.type], departmentId: formData.departmentId,
        organizationId: formData.organizationId, assignedToId: formData.assignedToId || undefined,
        deadline: formData.deadline || undefined,
        claimId: formData.claimId?.trim() || undefined,
      });

      // 🆕 Sync assignation
      if (formData.assignedToId) {
        try {
          await assignActionPlanToUser(accessToken, {
            userId: formData.assignedToId,
            actionPlanId: editingPlan.id,
            permissions: { view: true, edit: true, delete: false },
          });
        } catch (e) {
          console.error('Assignation failed:', e);
        }
      }

      const orig = editingPlan.planActions || [];
      const origIds = new Set(orig.map(pa => pa.id));
      const newOnes = planActions.filter(pa => String(pa.id).startsWith('temp-'));
      const existing = planActions.filter(pa => !String(pa.id).startsWith('temp-') && origIds.has(pa.id));
      const removed = Array.from(origIds).filter(id => !planActions.some(pa => pa.id === id));

      if (newOnes.length) await Promise.all(newOnes.map(pa => createPlanAction(accessToken, {
        title: pa.title, description: pa.description, deadline: new Date(pa.deadline!).toISOString(),
        priority: priorityToNumber(pa.priority), assignedToId: pa.assignedToId || formData.assignedToId || users[0]?.id || '',
        actionPlanId: editingPlan.id,
      })));

      for (const pa of existing) {
        const o = orig.find(x => x.id === pa.id);
        if (o && (o.title !== pa.title || o.description !== pa.description || o.deadline !== pa.deadline || o.priority !== pa.priority || o.assignedToId !== pa.assignedToId)) {
          await updatePlanAction(accessToken, pa.id, {
            title: pa.title, description: pa.description,
            deadline: pa.deadline ? new Date(pa.deadline).toISOString() : undefined,
            priority: priorityToNumber(pa.priority), assignedToId: pa.assignedToId,
          });
        }
      }
      if (removed.length) await Promise.all(removed.map(id => archivePlanAction(accessToken, id)));
      setShowModal(false); setEditingPlan(null); resetForm(); loadData();
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm(t('usersAdmin.confirmArchive')) || !accessToken) return;
    try { await archiveActionPlan(accessToken, id); loadData(); } catch (e) { console.error(e); }
  };

  const handleRestore = async (id: string) => {
    if (!accessToken) return;
    try { await restoreActionPlan(accessToken, id); loadData(); } catch (e) { console.error(e); }
  };

  const handleValidate = async (id: string) => {
    if (!accessToken || validatingId) return;
    if (!window.confirm(t('plansAdmin.confirmValidate'))) return;
    setValidatingId(id);
    try {
      await closeActionPlan(accessToken, id);
      await loadData();
    } catch (e) {
      console.error(e);
      alert(t('alerts.validateFailed'));
    } finally {
      setValidatingId(null);
    }
  };

  const sourceList =
    viewFilter === 'archived' ? archivedPlans :
    viewFilter === 'pending'  ? (pendingPlans.length ? pendingPlans : actionPlans.filter((p) => p.status === 'ongoing' && (p.progress ?? 0) >= 100)) :
    viewFilter === 'closed'   ? actionPlans.filter((p) => p.status === 'closed') :
    viewFilter === 'rejected' ? rejectedPlans :
    viewFilter === 'ongoing'  ? actionPlans.filter((p) => p.status === 'ongoing' && (p.progress ?? 0) < 100) :
    viewFilter === 'created'  ? actionPlans.filter((p) => p.status === 'created') :
    actionPlans; // 'all' = tous les plans non archivés

  const selectKpi = (f: ViewFilter) => {
    setViewFilter((prev) => (prev === f ? 'all' : f));
  };

  const displayed = sourceList.filter(p => {
    if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDept && p.departmentId !== filterDept) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterType !== 'all' && p.type !== filterType) return false;
    return true;
  });
  const paged = usePagedList(displayed, 20);

  const exportCsv = () => {
    const rows = displayed.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      type: p.type,
      progress: p.status === 'closed' || p.status === 'archived' ? 100 : (p.progress ?? 0),
      deadline: p.deadline || '',
      claimId: p.claimId || '',
      assignedToId: p.assignedToId || '',
      lastRejectComment: p.lastRejectComment || '',
    }));
    const header = Object.keys(rows[0] || { id: '', title: '', status: '', type: '', progress: '', deadline: '', claimId: '', assignedToId: '', lastRejectComment: '' });
    downloadTable(readPrefs().exportFormat, t('plansAdmin.exportFile'), header, rows.map((r) => header.map((h) => String((r as any)[h] ?? ''))));
  };

  const closedPlans = actionPlans.filter((p) => p.status === 'closed');
  const total = actionPlans.length + archivedPlans.length;
  const pendingCount = pendingPlans.length
    || actionPlans.filter((p) => p.status === 'ongoing' && (p.progress ?? 0) >= 100).length;
  const chartSlices: ChartSlice[] = [
    {
      key: 'ongoing',
      label: t('plansAdmin.statusOngoing'),
      value: actionPlans.filter((p) => p.status === 'ongoing' && (p.progress ?? 0) < 100).length,
      color: '#10b981',
      filter: 'ongoing',
    },
    {
      key: 'created',
      label: t('plansAdmin.chartWaiting'),
      value: actionPlans.filter((p) => p.status === 'created').length,
      color: '#94a3b8',
      filter: 'created',
    },
    {
      key: 'pending',
      label: t('plansAdmin.chartToValidate'),
      value: pendingCount,
      color: '#f59e0b',
      filter: 'pending',
    },
    {
      key: 'closed',
      label: t('plansAdmin.chartValidated'),
      value: closedPlans.length,
      color: '#3b82f6',
      filter: 'closed',
    },
    {
      key: 'archived',
      label: t('plansAdmin.chartArchived'),
      value: archivedPlans.length,
      color: '#64748b',
      filter: 'archived',
    },
  ];

  const activeFilters = [filterStatus !== 'all', filterType !== 'all', !!filterDept].filter(Boolean).length;

  const emptyLabel = t(`plansAdmin.empty.${viewFilter}`);

  if (loading) return (
    <div className="fap-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
      <style>{`.fl-main{padding-top:56px!important}.fl-nav{background:#000168!important;height:56px!important}`}</style>
      <div className="w-full max-w-3xl px-6">
        <ListSkeleton rows={8} />
      </div>
    </div>
  );

  return (
    <div className="fap-page">
      <style>{`
        .fl-nav { background: #000168 !important; border-bottom: 1px solid rgba(255,255,255,.08) !important; box-shadow: 0 10px 40px rgba(0,0,0,.2); height: 56px !important; }
        .fl-main { padding-top: 56px !important; }
        .fap-page {
          --navy:#000168; --ink:#0f172a; --muted:#64748b; --line:#e8edf5;
          font-family:Inter, sans-serif;
          min-height:calc(100dvh - 56px);
          background: linear-gradient(180deg, #eef2f9 0%, #f7f8fc 120px, #f7f8fc 100%);
        }
        .fap-top { border-bottom:1px solid var(--line); background:rgba(255,255,255,.9); backdrop-filter:blur(8px); padding:16px 24px 14px; }
        .fap-top-inner { max-width:1100px; margin:0 auto; display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:flex-end; }
        .fap-top h1 { margin:0; font-family:Inter, sans-serif; font-size:22px; font-weight:800; color:var(--navy); letter-spacing:-.02em; }
        .fap-top p { margin:4px 0 0; font-size:13px; color:var(--muted); }
        .fap-top-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .fap-chip-btn {
          height:34px; padding:0 12px; border-radius:8px; border:1px solid #dbe2ef; background:#fff;
          font-size:12px; font-weight:600; color:#475569; cursor:pointer; font-family:inherit;
        }
        .fap-chip-btn.on-amber { background:#f59e0b; border-color:#f59e0b; color:#fff; }
        .fap-chip-btn.on-blue { background:#2563eb; border-color:#2563eb; color:#fff; }
        .fap-chip-btn.on-dark { background:#0f172a; border-color:#0f172a; color:#fff; }
        .fap-cta {
          height:34px; padding:0 14px; border-radius:8px; border:none; background:var(--navy); color:#fff;
          font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-family:inherit;
        }
        .fap-shell { max-width:1100px; margin:0 auto; padding:20px 24px 48px; display:flex; flex-direction:column; gap:16px; }
        .fap-chart {
          display:grid; grid-template-columns: 180px minmax(0,1fr); gap:12px 24px; align-items:center;
          background:#fff; border:1px solid var(--line); border-radius:16px; padding:14px 18px;
        }
        .fap-chart-viz { position:relative; height:148px; }
        .fap-chart-center {
          position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
          font-family:Inter, sans-serif; border:none; background:transparent; cursor:pointer; padding:0;
        }
        .fap-chart-center:hover strong { color:#2563eb; }
        .fap-chart-center strong { font-size:22px; font-weight:800; color:var(--navy); line-height:1; }
        .fap-chart-center span { font-size:11px; color:var(--muted); font-weight:600; margin-top:2px; }
        .fap-chart-legend-wrap { min-width:0; }
        .fap-chart-legend-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
        .fap-chart-title { margin:0; font-size:11px; font-weight:700; letter-spacing: -0.01em; text-transform: none; color:#94a3b8; }
        .fap-chart-legend { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .fap-leg {
          display:grid;
          grid-template-columns: 10px minmax(0,1fr) 28px 36px;
          grid-template-rows: auto 6px;
          column-gap: 8px;
          row-gap: 6px;
          align-items:center;
          text-align:left; border:1px solid #e8edf5; background:#f8fafc; border-radius:10px; padding:10px 12px;
          cursor:pointer; font-family:inherit; width:100%; box-sizing:border-box;
          transition: background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease;
        }
        .fap-leg:hover {
          border-color:#93c5fd;
          background:#eef2ff;
          box-shadow: 0 4px 14px rgba(0,1,104,.10);
          transform: translateY(-1px);
        }
        .fap-leg:hover .fap-leg-label { color: var(--navy); }
        .fap-leg:active { transform: translateY(0); box-shadow: 0 1px 4px rgba(0,1,104,.08); }
        .fap-leg.on {
          border-color:#000168;
          background:#eef2ff;
          box-shadow: 0 0 0 2px rgba(0,1,104,.12);
        }
        .fap-leg.on .fap-leg-label { color: var(--navy); font-weight:700; }
        .fap-leg-dot { width:8px; height:8px; border-radius:99px; grid-column:1; grid-row:1; }
        .fap-leg-label { font-size:12px; font-weight:650; color:#334155; grid-column:2; grid-row:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fap-leg-val { font-family:Inter, sans-serif; font-size:14px; font-weight:800; color:var(--ink); grid-column:3; grid-row:1; text-align:right; }
        .fap-leg-pct { font-size:11px; color:#94a3b8; font-weight:600; grid-column:4; grid-row:1; text-align:right; font-variant-numeric:tabular-nums; }
        .fap-leg-bar { grid-column:2 / -1; grid-row:2; height:3px; background:#eef2f7; border-radius:99px; overflow:hidden; }
        .fap-leg-bar i { display:block; height:100%; border-radius:99px; }
        .fap-toolbar {
          display:flex; gap:8px; flex-wrap:wrap; align-items:center;
          background:#fff; border:1px solid var(--line); border-radius:14px; padding:10px;
        }
        .fap-search-wrap { position:relative; flex:1; min-width:200px; }
        .fap-search-wrap > span { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; display:flex; }
        .fap-search {
          width:100%; height:36px; border:1px solid var(--line); border-radius:9px; padding:0 12px 0 34px;
          font-size:13px; font-family:inherit; outline:none; background:#fbfcfe;
        }
        .fap-search:focus { border-color:#93c5fd; background:#fff; }
        .fap-count { font-size:12px; color:var(--muted); }
        .fap-list { background:#fff; border:1px solid var(--line); border-radius:16px; overflow:hidden; }
        .fap-row {
          display:flex; align-items:center; gap:0; padding:14px 16px 14px 12px;
          border-bottom:1px solid #f1f5f9; cursor:pointer;
        }
        .fap-row:last-child { border-bottom:none; }
        .fap-row:hover { background:#f8fafc; }
        .fap-row-idx {
          width:28px; font-family:Inter, sans-serif; font-size:11px; font-weight:800;
          display:flex; align-items:center; flex-shrink:0; opacity:.75;
        }
        .fap-row-rail { width:3px; align-self:stretch; border-radius:99px; margin:2px 12px 2px 4px; flex-shrink:0; }
        .fap-row-body { flex:1; min-width:0; }
        .fap-row-top { display:flex; gap:10px; align-items:center; }
        .fap-row-title { margin:0; font-size:14px; font-weight:700; color:var(--ink); line-height:1.35; }
        .fap-row-status {
          font-size:10px; font-weight:700; padding:0 10px; border-radius:8px; white-space:nowrap; flex-shrink:0;
          height:30px; display:inline-flex; align-items:center; line-height:1;
        }
        .fap-row-meta { margin-top:5px; display:flex; flex-wrap:wrap; gap:6px; font-size:12px; color:#94a3b8; }
        .fap-row-meta .late { color:#e11d48; font-weight:650; }
        .fap-dossier-link {
          color:#000168; font-weight:700; text-decoration:none;
          border-bottom:1px solid transparent;
        }
        .fap-dossier-link:hover { border-bottom-color:#000168; }
        .fap-row-prog { margin-top:8px; display:flex; align-items:center; gap:8px; max-width:220px; }
        .fap-row-prog-track { flex:1; height:4px; background:#eef2f7; border-radius:99px; overflow:hidden; }
        .fap-row-prog-track i { display:block; height:100%; border-radius:99px; }
        .fap-row-prog span { font-size:11px; font-weight:700; color:#64748b; min-width:28px; }
        .fap-row-acts { display:flex; align-items:center; gap:6px; margin-left:12px; flex-shrink:0; }
        .fap-icon-btn {
          width:30px; height:30px; border:none; background:transparent; color:#94a3b8; border-radius:8px;
          display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .fap-icon-btn:hover { background:#eef2ff; color:var(--navy); }
        .fap-open {
          height:30px; padding:0 10px; border:1px solid var(--line); border-radius:8px; background:#fff;
          font-size:11px; font-weight:700; color:var(--navy); cursor:pointer; display:inline-flex; align-items:center; gap:2px; font-family:inherit;
        }
        .fap-validate {
          height:30px; padding:0 10px; border:none; border-radius:8px; background:#059669; color:#fff;
          font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; font-family:inherit;
        }
        .fap-validate:disabled { opacity:.6; }
        .fap-empty { padding:48px 20px; text-align:center; color:var(--muted); font-size:13px; }
        @media (max-width:820px) {
          .fap-chart { grid-template-columns:1fr; }
          .fap-chart-legend { grid-template-columns:1fr 1fr; }
          .fap-row { flex-wrap:wrap; align-items:flex-start; }
          .fap-row-acts { width:100%; margin:8px 0 0 44px; justify-content:flex-start; }
        }
      `}</style>

      <div className="fap-top">
        <div className="fap-top-inner">
          <div>
            <h1>{t('usersAdmin.titlePlans')}</h1>
            <p>{t('usersAdmin.plans', { count: total })} · {t('plansAdmin.group')}</p>
          </div>
          <div className="fap-top-actions">
            {isPlatformAdmin(user) && accessToken && (
              <CsvImportButton
                className="fap-chip-btn"
                label={t('claimsList.import')}
                entity="plans"
                columns={['Title', 'Type', 'Department', 'Description', 'Deadline']}
                templateName="plans"
                summary={(n) => t('plansAdmin.imported', { count: n })}
                importFile={async (file) => {
                  const res = await importActionPlansCsv(accessToken, file);
                  return { created: res.data.created, errors: res.data.errors };
                }}
                onImported={() => loadData()}
              />
            )}
            <button type="button" className="fap-chip-btn" onClick={exportCsv}>
              {t('plansAdmin.exportButton')}
            </button>
            <button
              type="button"
              className="fap-cta"
              onClick={() => { resetForm(); setEditingPlan(null); setShowModal(true); }}
            >
              <IcoPlus /> {t('usersAdmin.newPlan')}
            </button>
          </div>
        </div>
      </div>

      <div className="fap-shell">
        <StatusChart
          slices={chartSlices}
          total={total}
          activeFilter={viewFilter}
          onSelect={selectKpi}
          onReset={() => setViewFilter('all')}
        />

        <div className="fap-toolbar">
          <div className="fap-search-wrap">
            <span><IcoSearch /></span>
            <input
              className="fap-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('plansAdmin.searchPlaceholder')}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`fap-chip-btn${showFilters || activeFilters > 0 ? ' on-dark' : ''}`}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IcoFilter /> {t('plansAdmin.filters')}
              {activeFilters > 0 ? ` (${activeFilters})` : ''}
            </span>
          </button>
        </div>

        {showFilters && (
          <div className="fap-toolbar" style={{ paddingTop: 12, paddingBottom: 12 }}>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('planDetail.department')}</label>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none">
                <option value="">{t('common.all')}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('common.status')}</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none">
                <option value="all">{t('common.all')}</option>
                <option value="created">{t('plansAdmin.chartWaiting')}</option>
                <option value="ongoing">{t('plansAdmin.statusOngoing')}</option>
                <option value="closed">{t('plansAdmin.statusClosed')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('planDetail.type')}</label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none">
                <option value="all">{t('common.all')}</option>
                <option value="preventif">{t('plansAdmin.typePreventive')}</option>
                <option value="correctif">{t('plansAdmin.typeCorrective')}</option>
                <option value="amelioration">{t('plansAdmin.typeImprovement')}</option>
              </select>
            </div>
            {activeFilters > 0 && (
              <button type="button" onClick={() => { setFilterDept(''); setFilterStatus('all'); setFilterType('all'); }}
                className="text-xs text-slate-500 underline self-end mb-2">
                {t('common.reset')}
              </button>
            )}
          </div>
        )}

        <p className="fap-count">
          {t(`plansAdmin.result.${viewFilter}`, { count: displayed.length })}
          {search ? ` ${t('plansAdmin.forSearch', { search })}` : ''}
        </p>

        {displayed.length === 0 ? (
          <div className="fap-list"><div className="fap-empty">{emptyLabel}</div></div>
        ) : (
          <div className="fap-list">
            {paged.rows.map((plan, i) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                users={users}
                index={(paged.page - 1) * paged.pageSize + i}
                viewFilter={viewFilter}
                validating={validatingId === plan.id}
                onEdit={() => openEdit(plan)}
                onArchive={() => handleArchive(plan.id)}
                onRestore={() => handleRestore(plan.id)}
                onValidate={() => handleValidate(plan.id)}
                onView={() => navigate(`/pages/front/action-plans/${plan.id}`)}
              />
            ))}
          </div>
        )}
        {displayed.length > paged.pageSize && (
          <TablePagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} loading={false} />
        )}
      </div>

      {/* ── Modal ── */}
      {(showModal || editingPlan) && (
        <>
          <style>{`body{overflow:hidden}`}</style>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-md" onClick={() => { setShowModal(false); setEditingPlan(null); resetForm(); }} />
            <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">

              {/* Modal header */}
              <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{editingPlan ? t('plansAdmin.editPlan') : t('plansAdmin.newActionPlan')}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {editingPlan
                      ? t('plansAdmin.editPlanSub')
                      : sourceAlertId
                        ? t('plansAdmin.alertLinked')
                        : t('plansAdmin.fillBelow')}
                  </p>
                </div>
                <button onClick={() => { setShowModal(false); setEditingPlan(null); resetForm(); }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                  <IcoX />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('drafts.fieldTitle')} <span className="text-rose-500">*</span></label>
                  <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                    placeholder={t('plansAdmin.titlePlaceholder')}
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168] ${formErrors.title ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`} />
                  {formErrors.title && <p className="text-xs text-rose-500 mt-1">{formErrors.title}</p>}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('claimDetail.description')}</label>
                  <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                    rows={2} placeholder={t('plansAdmin.descriptionPlaceholder')}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168] resize-none" />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('planDetail.type')} <span className="text-rose-500">*</span></label>
                  <div className="flex gap-2">
                    {(['preventif', 'correctif', 'amelioration'] as ActionPlanType[]).map(typeKey => {
                      const cfg = TYPE_CFG[typeKey];
                      const active = formData.type === typeKey;
                      return (
                        <button key={typeKey} type="button" onClick={() => setFormData({ ...formData, type: typeKey })}
                          className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${active ? `${cfg.bg} ${cfg.color} border-current` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                          {t(cfg.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Org & Dept */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('usersAdmin.organization')} <span className="text-rose-500">*</span></label>
                    <select value={formData.organizationId} onChange={e => handleOrgChange(e.target.value)}
                      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168] ${formErrors.organizationId ? 'border-rose-400' : 'border-slate-200'}`}>
                      <option value="">{t('myActionPlans.select')}</option>
                      {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {formErrors.organizationId && <p className="text-xs text-rose-500 mt-1">{formErrors.organizationId}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('planDetail.department')} <span className="text-rose-500">*</span></label>
                    <select value={formData.departmentId} onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                      disabled={!formData.organizationId}
                      className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168] disabled:bg-slate-50 disabled:text-slate-400 ${formErrors.departmentId ? 'border-rose-400' : 'border-slate-200'}`}>
                      <option value="">{!formData.organizationId ? t('myActionPlans.chooseOrg') : filteredDepts.length === 0 ? t('myActionPlans.noDept') : t('myActionPlans.select')}</option>
                      {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {formErrors.departmentId && <p className="text-xs text-rose-500 mt-1">{formErrors.departmentId}</p>}
                  </div>
                </div>

                {/* Assigné & Deadline */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('claimDetail.assignedTo')}</label>
                    <EmployeeRecommendationBanner
                      defectType={TYPE_TO_DEFECT[formData.type] || 'Fonctionnel'}
                      severity={PRIORITY_TO_SEVERITY[newPlanAction.priority || 'medium'] || 'MEDIUM'}
                      employees={users.map((u: any) => ({
                        employeeId: u.id,
                        name:
                          u.fullName ||
                          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
                          u.email ||
                          u.id,
                        email: u.email || undefined,
                        department: u.department || u.Department || undefined,
                        departmentId:
                          u.departmentId != null
                            ? String(u.departmentId)
                            : u.DepartmentId != null
                              ? String(u.DepartmentId)
                              : undefined,
                      }))}
                      departmentId={formData.departmentId || null}
                      departmentCode={
                        filteredDepts.find((d) => d.id === formData.departmentId)?.code ||
                        departments.find((d) => d.id === formData.departmentId)?.code ||
                        null
                      }
                      departmentName={
                        filteredDepts.find((d) => d.id === formData.departmentId)?.name ||
                        departments.find((d) => d.id === formData.departmentId)?.name ||
                        null
                      }
                      onAssign={(employeeId) => setFormData({ ...formData, assignedToId: employeeId })}
                    />
                    <select value={formData.assignedToId} onChange={e => setFormData({ ...formData, assignedToId: e.target.value })}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168]">
                      <option value="">{t('claimDetail.unassigned')}</option>
                      {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('myActionPlans.deadline')}</label>
                    <input type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168]" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('myActionPlans.linkedClaim')}</label>
                  <input
                    type="text"
                    value={formData.claimId}
                    onChange={e => setFormData({ ...formData, claimId: e.target.value })}
                    placeholder={t('plansAdmin.claimIdPlaceholder')}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20 focus:border-[#000168]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {t('plansAdmin.claimIdHint')}
                  </p>
                </div>

                {/* Sous-actions */}
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-slate-600">{t('myActionPlans.subActions')}</label>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{planActions.length}</span>
                  </div>

                  {planActions.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {planActions.map((pa, idx) => {
                        const pc = safePriority(pa.priority);
                        if (editingPlanActionId === pa.id) {
                          return (
                            <div key={pa.id} className="border border-[#000168]/30 rounded-xl p-4 bg-[#000168]/3 space-y-3">
                              <input type="text" value={editPlanActionData.title || ''} onChange={e => setEditPlanActionData({ ...editPlanActionData, title: e.target.value })}
                                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20" placeholder={`${t('drafts.fieldTitle')} *`} />
                              <textarea value={editPlanActionData.description || ''} onChange={e => setEditPlanActionData({ ...editPlanActionData, description: e.target.value })}
                                rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#000168]/20 resize-none" placeholder={t('myActionPlans.descriptionPh')} />
                              <div className="grid grid-cols-3 gap-2">
                                <select value={editPlanActionData.priority || 'medium'} onChange={e => setEditPlanActionData({ ...editPlanActionData, priority: e.target.value as PlanActionPriority })}
                                  className="px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white outline-none">
                                  <option value="low">{t('myActionPlans.priorityLow')}</option><option value="medium">{t('myActionPlans.priorityMedium')}</option><option value="high">{t('myActionPlans.priorityHigh')}</option>
                                </select>
                                <input type="date" value={editPlanActionData.deadline || ''} onChange={e => setEditPlanActionData({ ...editPlanActionData, deadline: e.target.value })}
                                  className="px-2 py-2 text-xs border border-slate-200 rounded-lg outline-none" />
                                <select value={editPlanActionData.assignedToId || ''} onChange={e => setEditPlanActionData({ ...editPlanActionData, assignedToId: e.target.value })}
                                  className="px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white outline-none">
                                  <option value="">{t('claimDetail.unassigned')}</option>
                                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
                                </select>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => {
                                  if (!editingPlanActionId || !editPlanActionData.title?.trim()) return;
                                  setPlanActions(prev => prev.map(p => p.id === editingPlanActionId ? { ...p, ...editPlanActionData } as PlanAction : p));
                                  setEditingPlanActionId(null); setEditPlanActionData({});
                                }} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg" style={{ backgroundColor: COFICAB }}>{t('common.save')}</button>
                                <button onClick={() => { setEditingPlanActionId(null); setEditPlanActionData({}); }}
                                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">{t('common.cancel')}</button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={pa.id || idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{pa.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${pc.bg} ${pc.color}`}>{t(pc.label)}</span>
                                {pa.deadline && <span className="text-xs text-slate-400">{new Date(pa.deadline).toLocaleDateString(dateLocale())}</span>}
                              </div>
                            </div>
                            <button onClick={() => { setEditingPlanActionId(pa.id); setEditPlanActionData({ title: pa.title, description: pa.description, priority: pa.priority, deadline: pa.deadline?.split('T')[0], assignedToId: pa.assignedToId }); }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><IcoEdit /></button>
                            {String(pa.id).startsWith('temp-') && (
                              <button onClick={() => setPlanActions(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"><IcoX /></button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add PA form */}
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500">{t('plansAdmin.addSubAction')}</p>
                    <input type="text" value={newPlanAction.title || ''} onChange={e => setNewPlanAction({ ...newPlanAction, title: e.target.value })}
                      placeholder={`${t('drafts.fieldTitle')} *`}
                      className={`w-full px-3 py-2 text-sm border rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#000168]/20 ${planActionErrors.title ? 'border-rose-400' : 'border-slate-200'}`} />
                    <textarea value={newPlanAction.description || ''} onChange={e => setNewPlanAction({ ...newPlanAction, description: e.target.value })}
                      rows={2} placeholder={t('myActionPlans.descriptionPh')}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-[#000168]/20 resize-none" />
                    <div className="grid grid-cols-3 gap-2">
                      <select value={newPlanAction.priority} onChange={e => setNewPlanAction({ ...newPlanAction, priority: e.target.value as PlanActionPriority })}
                        className="px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white outline-none">
                        <option value="low">{t('myActionPlans.priorityLow')}</option><option value="medium">{t('myActionPlans.priorityMedium')}</option><option value="high">{t('myActionPlans.priorityHigh')}</option>
                      </select>
                      <input type="date" value={newPlanAction.deadline || ''} onChange={e => setNewPlanAction({ ...newPlanAction, deadline: e.target.value })}
                        min={new Date().toISOString().split('T')[0]}
                        className={`px-2 py-2 text-xs border rounded-lg outline-none ${planActionErrors.deadline ? 'border-rose-400' : 'border-slate-200'}`} />
                      <select value={newPlanAction.assignedToId || ''} onChange={e => setNewPlanAction({ ...newPlanAction, assignedToId: e.target.value })}
                        className="px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white outline-none">
                        <option value="">{t('claimDetail.unassigned')}</option>
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={addPA}
                      className="w-full py-2 text-xs font-semibold text-[#000168] border-2 border-[#000168]/30 rounded-lg hover:bg-[#000168]/5 transition-colors flex items-center justify-center gap-1.5">
                      <IcoPlus /> {t('ishikawa.add')}
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button onClick={() => { setShowModal(false); setEditingPlan(null); resetForm(); }}
                    className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                    {t('common.cancel')}
                  </button>
                  <button onClick={editingPlan ? handleUpdate : handleCreate} disabled={submitting}
                    className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-60 flex items-center gap-2"
                    style={{ backgroundColor: COFICAB }}>
                    {submitting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {editingPlan ? t('plansAdmin.update') : t('plansAdmin.createPlan')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FrontActionPlans;