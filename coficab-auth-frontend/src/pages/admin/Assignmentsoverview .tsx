// src/pages/admin/AssignmentsOverview.tsx
//
// Data source: GET api/ActionPlan/assignments → ActionPlanService.GetAllAssignmentsAsync()
// Real shape returned (AssignedActionPlanDto, camelCase JSON):
//   { id, title, description, status, progress, assignedToId, createdAt, permissions:{view,edit,delete}, updatedBy }
//
// ── v4.3 ── FIXED DEPARTMENT MATCHING (join on code/name, not a non-existent departmentId UUID) ──

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getUsers, UserDto, getDepartments, DepartmentDto } from '../../services/adminService';
import { getAllAssignments, RawAssignment } from '../../services/actionPlanService';
import { ListSkeleton } from '../../components/TableSkeleton';
import { downloadTable, readPrefs } from '../../utils/dataExchange';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

type RawAssignmentExtended = RawAssignment & {
  status?: string;
  progress?: number;
  updatedBy?: string;
};

// The Action Plan API returns a `code` field on departments that isn't
// declared on the shared DepartmentDto type. We extend it locally so we
// can match on it without touching the shared service file.
type DepartmentDtoExtended = DepartmentDto & { code?: string };

type Assignment = {
  planId: string;
  userId: string;
  userName: string;
  userEmail: string;
  departmentId: string;
  departmentName: string;
  planTitle: string;
  permissions: { view: boolean; edit: boolean };
  assignedAt: string;
  status?: string;
  progress: number;
  updatedBy?: string;
  isPermissionAnomaly: boolean;
  isUnresolvedUser: boolean;
  isUnresolvedDepartment: boolean;
};

const LATE_PROGRESS_THRESHOLD = 50;
const LATE_DAYS_THRESHOLD = 30;

const unwrap = <T,>(raw: any): T[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  return [];
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Corrige les titres mal encodés (ex. SÃ©curisation → Sécurisation). */
const fixMojibake = (text?: string): string => {
  if (!text || !/[\u00C3\u00C2\u00E2]/.test(text)) return text ?? '';
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
};

const initials = (name?: string) =>
  (name ?? '—').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

const daysSince = (iso?: string) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

// ─── Trend Chart ─────────────────────────────────────────────────────────
const TrendChart = ({ data }: { data: [string, number][] }) => {
  if (data.length === 0) {
    return <div className="ao-trend-empty">{i18n.t('assignOverview.trendEmpty')}</div>;
  }
  const max = Math.max(...data.map(([, v]) => v), 1);
  const w = 520;
  const h = 160;
  const pad = { top: 20, right: 20, bottom: 36, left: 40 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const points = data.map(([_, v], i) => ({
    x: pad.left + (i / (data.length - 1 || 1)) * chartW,
    y: pad.top + chartH - (v / max) * chartH,
    v,
  }));

  const areaPath = points.length > 0
    ? `M ${points[0].x} ${pad.top + chartH} ` +
      points.map(p => `L ${p.x} ${p.y}`).join(' ') +
      ` L ${points[points.length - 1].x} ${pad.top + chartH} Z`
    : '';

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img">
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line
          key={t}
          x1={pad.left}
          y1={pad.top + chartH * (1 - t)}
          x2={pad.left + chartW}
          y2={pad.top + chartH * (1 - t)}
          stroke="#e4e8f2"
          strokeWidth={1}
          strokeDasharray={t === 0 ? undefined : '4 4'}
        />
      ))}
      <path d={areaPath} fill="rgba(0,1,104,0.08)" />
      <path d={linePath} fill="none" stroke="#000168" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={5} fill="#fff" stroke="#000168" strokeWidth={2.5} />
          <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fontWeight={700} fill="#0d1340">
            {p.v}
          </text>
          <text x={p.x} y={h - 10} textAnchor="middle" fontSize="11" fill="#94a3b8">
            {data[i][0].split('-').reverse().join('/')}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ─── Data Quality ────────────────────────────────────────────────────────
type Anomaly = { type: 'permission' | 'duplicate' | 'unresolved' | 'unresolved-department'; message: string };

const anomalyMeta: Record<Anomaly['type'], { icon: string; color: string }> = {
  permission: { icon: 'ti-shield-exclamation', color: '#dc2626' },
  duplicate: { icon: 'ti-copy', color: '#d97706' },
  unresolved: { icon: 'ti-user-question', color: '#64748b' },
  'unresolved-department': { icon: 'ti-building-off', color: '#64748b' },
};

const DataQualityPanel = ({ anomalies }: { anomalies: Anomaly[] }) => {
  if (anomalies.length === 0) {
    return (
      <div className="ao-quality-ok">
        <i className="ti ti-circle-check" />
        <span>{i18n.t('assignOverview.noAnomaly')}</span>
      </div>
    );
  }
  return (
    <div className="ao-quality-list">
      {anomalies.slice(0, 5).map((a, i) => {
        const meta = anomalyMeta[a.type];
        return (
          <div className="ao-quality-item" key={i}>
            <i className={`ti ${meta.icon}`} style={{ color: meta.color }} />
            <span>{a.message}</span>
          </div>
        );
      })}
      {anomalies.length > 5 && (
        <div className="ao-quality-more">{i18n.t('assignOverview.more', { count: anomalies.length - 5 })}</div>
      )}
    </div>
  );
};

// ─── Dynamic Filter Chips ────────────────────────────────────────────────
const FilterChips = ({
  departments,
  activeDept,
  onDeptChange,
  activePerm,
  onPermChange,
}: {
  departments: { id: string; name: string }[];
  activeDept: string;
  onDeptChange: (d: string) => void;
  activePerm: 'all' | 'view' | 'edit';
  onPermChange: (p: 'all' | 'view' | 'edit') => void;
}) => {
  return (
    <div className="ao-filter-chips">
      <span className="ao-filter-label">{i18n.t('planDetail.department')} :</span>
      <button
        className={`ao-chip${activeDept === '' ? ' active' : ''}`}
        onClick={() => onDeptChange('')}
      >
        {i18n.t('common.all')}
      </button>
      {departments.map(d => (
        <button
          key={d.id}
          className={`ao-chip${activeDept === d.id ? ' active' : ''}`}
          onClick={() => onDeptChange(d.id)}
        >
          {d.name}
        </button>
      ))}

      <div className="ao-filter-divider" />

      <span className="ao-filter-label">{i18n.t('assignOverview.permission')} :</span>
      {(['all', 'view', 'edit'] as const).map(p => (
        <button
          key={p}
          className={`ao-chip${activePerm === p ? ' active' : ''}`}
          onClick={() => onPermChange(p)}
        >
          {p === 'all' ? i18n.t('assignOverview.allPerms') : p === 'view' ? i18n.t('closedArchive.view') : i18n.t('common.edit')}
        </button>
      ))}
    </div>
  );
};

// ─── Assignments grouped by employee (replaces dense matrix) ───────────────
const AssignmentsByEmployee = ({
  filtered,
  onSelect,
}: {
  filtered: Assignment[];
  onSelect?: (a: Assignment) => void;
}) => {
  const groups = useMemo(() => {
    const map = new Map<string, { user: { id: string; name: string; email: string }; items: Assignment[] }>();
    filtered.forEach((a) => {
      if (!map.has(a.userId)) {
        map.set(a.userId, {
          user: { id: a.userId, name: a.userName, email: a.userEmail },
          items: [],
        });
      }
      map.get(a.userId)!.items.push(a);
    });
    return Array.from(map.values()).sort((a, b) => a.user.name.localeCompare(b.user.name));
  }, [filtered]);

  if (groups.length === 0) {
    return (
      <div className="ao-empty">
        <i className="ti ti-user-off" />
        <p>{i18n.t('assignOverview.nothingToShow')}</p>
      </div>
    );
  }

  return (
    <div className="ao-assign-groups">
      {groups.map(({ user, items }) => {
        const avg = Math.round(items.reduce((s, a) => s + (a.progress ?? 0), 0) / items.length);
        return (
          <section key={user.id} className="ao-assign-group">
            <header className="ao-assign-group-head">
              <div className="ao-assign-user">
                <div className="ao-ava">{initials(user.name)}</div>
                <div>
                  <div className="ao-user-name">{user.name}</div>
                  <div className="ao-user-meta">{user.email} · {i18n.t('assignmentsMap.countPlans', { count: items.length })} · {i18n.t('assignmentsMap.avg', { pct: avg })}</div>
                </div>
              </div>
            </header>
            <div className="ao-assign-list">
              {items.map((a) => (
                <button
                  key={`${a.userId}::${a.planId}`}
                  type="button"
                  className={`ao-assign-row${a.isPermissionAnomaly ? ' warn' : ''}`}
                  onClick={() => onSelect?.(a)}
                >
                  <div className="ao-assign-plan">
                    <span className="ao-assign-plan-title">{fixMojibake(a.planTitle)}</span>
                    <span className="ao-assign-plan-date">{i18n.t('assignmentsList.assignedOn')} {fmt(a.assignedAt)}</span>
                  </div>
                  <div className="ao-assign-perms">
                    <span className={`ao-perm-badge${a.permissions.view ? ' on' : ''}`} title={i18n.t('closedArchive.view')}>
                      <i className="ti ti-eye" />
                    </span>
                    <span className={`ao-perm-badge${a.permissions.edit ? ' on edit' : ''}`} title={i18n.t('common.edit')}>
                      <i className="ti ti-pencil" />
                    </span>
                  </div>
                  <div className="ao-assign-progress">
                    <div className="ao-assign-progress-track">
                      <div className="ao-assign-progress-fill" style={{ width: `${a.progress}%` }} />
                    </div>
                    <span>{a.progress}%</span>
                  </div>
                  {a.isPermissionAnomaly && (
                    <span className="ao-assign-warn" title={i18n.t('assignOverview.editWithoutView')}>
                      <i className="ti ti-alert-triangle" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

// ─── Cell Detail Modal ───────────────────────────────────────────────────
const CellDetailModal = ({
  assignment,
  onClose,
}: {
  assignment: Assignment | null;
  onClose: () => void;
}) => {
  if (!assignment) return null;
  return (
    <div className="ao-overlay" onClick={e => { if ((e.target as HTMLElement).classList.contains('ao-overlay')) onClose(); }}>
      <div className="ao-detail-modal">
        <div className="ao-detail-head">
          <div>
            <div className="ao-detail-title">{assignment.planTitle}</div>
            <div className="ao-detail-sub">{i18n.t('claimDetail.assignedTo')} {assignment.userName}</div>
          </div>
          <button className="ao-detail-close" onClick={onClose} aria-label={i18n.t('fiveWhy.close')}><i className="ti ti-x" /></button>
        </div>
        <div className="ao-detail-body">
          <div className="ao-detail-grid">
            <div className="ao-detail-field">
              <label>{i18n.t('orgChart.email')}</label>
              <div>{assignment.userEmail}</div>
            </div>
            <div className="ao-detail-field">
              <label>{i18n.t('planDetail.department')}</label>
              <div>{assignment.departmentName || '—'}</div>
            </div>
            <div className="ao-detail-field">
              <label>{i18n.t('validationHub.progress')}</label>
              <div style={{ color: assignment.progress >= LATE_PROGRESS_THRESHOLD ? '#0d1340' : '#dc2626', fontWeight: 700 }}>
                {assignment.progress}%
              </div>
            </div>
            <div className="ao-detail-field">
              <label>{i18n.t('assignmentsList.assignedOn')}</label>
              <div>{fmt(assignment.assignedAt)}</div>
            </div>
          </div>
          <div className="ao-detail-perms">
            <label>{i18n.t('assignmentsList.permissions')}</label>
            <div className="ao-detail-perm-row">
              <span className={`ao-detail-perm${assignment.permissions.view ? ' on' : ''}`}>
                <i className="ti ti-eye" /> {i18n.t('closedArchive.view')}
              </span>
              <span className={`ao-detail-perm${assignment.permissions.edit ? ' on' : ''}`}>
                <i className="ti ti-pencil" /> {i18n.t('common.edit')}
              </span>
            </div>
            {assignment.isPermissionAnomaly && (
              <div className="ao-detail-anomaly">
                <i className="ti ti-alert-triangle" />
                {i18n.t('assignOverview.anomalyNoView')}
              </div>
            )}
            {assignment.isUnresolvedDepartment && (
              <div className="ao-detail-anomaly">
                <i className="ti ti-building-off" />
                {i18n.t('assignOverview.unknownDept', { name: assignment.departmentName })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main ────────────────────────────────────────────────────────────────
export default function AssignmentsOverview() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [departments, setDepartments] = useState<DepartmentDtoExtended[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [permFilter, setPermFilter] = useState<'all' | 'view' | 'edit'>('all');
  const [selectedCell, setSelectedCell] = useState<Assignment | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      setLoading(true);
      try {
        // Fetch all data in parallel
        const [rawAssignments, rawUsers, rawDepts] = await Promise.all([
          getAllAssignments(accessToken),
          getUsers(accessToken),
          getDepartments(accessToken),
        ]);

        const raw = unwrap<RawAssignmentExtended>(rawAssignments);
        const users = unwrap<UserDto>(rawUsers);
        const depts = unwrap<DepartmentDtoExtended>(rawDepts);

        // Normalize department fields — handle both camelCase (id/name/code) and
        // PascalCase (Id/Name/Code). `code` isn't on the shared DepartmentDto type
        // but the Action Plan API does return it, and it's what UserDto.department
        // actually matches against (see note below).
        const normalizedDepts: DepartmentDtoExtended[] = depts.map((d: any) => ({
          id: d.id ?? d.Id ?? d.departmentId ?? '',
          name: d.name ?? d.Name ?? d.departmentName ?? 'Unknown',
          code: d.code ?? d.Code ?? '',
        })).filter((d: any) => d.id && d.name);
        setDepartments(normalizedDepts);

        // Build lookup maps.
        const userById = new Map<string, UserDto>(users.map(u => [u.id, u]));

        // IMPORTANT: UserDto has no departmentId field — `department` on the
        // user is a free-text string set by the Auth API, not a foreign key
        // into the Department table. The only reliable way to resolve it is
        // to match against each department's `code` first, then fall back to
        // its `name`, case-insensitively. If neither matches, the department
        // is genuinely unresolved (stale/typo'd value on the user record).
        const deptByKey = new Map<string, DepartmentDtoExtended>();
        normalizedDepts.forEach(d => {
          if (d.code) deptByKey.set(d.code.trim().toLowerCase(), d);
          deptByKey.set(d.name.trim().toLowerCase(), d);
        });

        const enriched: Assignment[] = raw.map((a: RawAssignmentExtended) => {
          const user = userById.get(a.assignedToId);
          const perms = a.permissions;
          const permissions = { view: perms.view, edit: perms.edit };
          const isPermissionAnomaly = perms.edit && !perms.view;

          const rawDept = (user?.department ?? '').trim();
          const dept = rawDept ? deptByKey.get(rawDept.toLowerCase()) : undefined;
          const isUnresolvedDepartment = !!rawDept && !dept;

          return {
            planId: a.id,
            userId: a.assignedToId,
            userName: user?.fullName || a.assignedToId,
            userEmail: user?.email || '—',
            departmentId: dept?.id ?? '',
            departmentName: dept?.name || rawDept || '—',
            planTitle: fixMojibake(a.title),
            permissions,
            assignedAt: a.createdAt,
            status: a.status,
            progress: a.progress ?? 0,
            updatedBy: a.updatedBy,
            isPermissionAnomaly,
            isUnresolvedUser: !user,
            isUnresolvedDepartment,
          };
        });

        setAssignments(enriched);
        setTotalEmployees(users.length);
      } catch (e) {
        console.error('Failed to load assignments:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  // Build department list from actual departments API, filtered to those that have assignments
  const activeDepartments = useMemo(() => {
    // Only surface a department chip if at least one assignment actually
    // resolved to it. Showing chips that match zero assignments (e.g. as a
    // "show everything" fallback) is misleading — clicking them silently
    // returns an empty matrix even though departments technically exist.
    const assignedDeptIds = new Set(assignments.map(a => a.departmentId).filter(Boolean));
    return departments
      .filter(d => assignedDeptIds.has(d.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, assignments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter(a => {
      const matchesSearch = !q || [a.userName, a.userEmail, a.planTitle, a.departmentName].some(v => v?.toLowerCase().includes(q));
      const matchesDept = !deptFilter || a.departmentId === deptFilter;
      const matchesPerm = permFilter === 'all' || a.permissions[permFilter];
      return matchesSearch && matchesDept && matchesPerm;
    });
  }, [assignments, search, deptFilter, permFilter]);

  const kpis = useMemo(() => {
    const total = assignments.length;
    const avgProgress = total ? Math.round(assignments.reduce((s, a) => s + (a.progress ?? 0), 0) / total) : 0;
    const lateAssignments = assignments.filter(a => (a.progress ?? 0) < LATE_PROGRESS_THRESHOLD && daysSince(a.assignedAt) > LATE_DAYS_THRESHOLD);
    const permissionAnomalyCount = assignments.filter(a => a.isPermissionAnomaly).length;
    const uniqueUsers = new Set(assignments.map(a => a.userId)).size;
    const coveragePercent = totalEmployees > 0 ? Math.round((uniqueUsers / totalEmployees) * 100) : 0;
    return { avgProgress, lateCount: lateAssignments.length, permissionAnomalyCount, uniqueUsers, coveragePercent };
  }, [assignments, totalEmployees]);

  const trendData = useMemo((): [string, number][] => {
    const counts: Record<string, number> = {};
    assignments.forEach(a => {
      if (!a.assignedAt) return;
      const d = new Date(a.assignedAt);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  }, [assignments]);

  const anomalies = useMemo((): Anomaly[] => {
    const list: Anomaly[] = [];
    assignments.forEach(a => {
      if (a.isPermissionAnomaly) {
        list.push({ type: 'permission', message: `${a.userName} — "${a.planTitle}" : ${t('assignOverview.editWithoutView')}` });
      }
    });
    const seen = new Map<string, number>();
    assignments.forEach(a => {
      const key = `${a.userId}::${a.planId}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    });
    seen.forEach((count, key) => {
      if (count > 1) {
        const [userId, planId] = key.split('::');
        const sample = assignments.find(a => a.userId === userId && a.planId === planId);
        list.push({ type: 'duplicate', message: t('assignOverview.duplicate', { user: sample?.userName ?? userId, count, plan: sample?.planTitle ?? planId }) });
      }
    });
    assignments.forEach(a => {
      if (a.isUnresolvedUser) {
        list.push({ type: 'unresolved', message: t('assignOverview.notFound', { user: a.userId, plan: a.planTitle }) });
      }
    });
    const unresolvedDeptGroups = new Map<string, Set<string>>();
    assignments.forEach(a => {
      if (a.isUnresolvedDepartment) {
        if (!unresolvedDeptGroups.has(a.departmentName)) unresolvedDeptGroups.set(a.departmentName, new Set());
        unresolvedDeptGroups.get(a.departmentName)!.add(a.userName);
      }
    });
    unresolvedDeptGroups.forEach((userNames, deptValue) => {
      const names = Array.from(userNames);
      const label = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
      list.push({ type: 'unresolved-department', message: t('assignOverview.unknownDeptGroup', { dept: deptValue, count: names.length, names: label }) });
    });
    return list;
  }, [assignments, t]);

  const exportCsv = () => {
    const columns = [t('employeesAdmin.colEmployee'), t('orgChart.email'), t('planDetail.department'), t('assignmentsMap.plan'), t('closedArchive.view'), t('common.edit'), t('validationHub.progress'), t('audit.colDate')];
    const rows = filtered.map(a => [a.userName, a.userEmail, a.departmentName || '—', a.planTitle, a.permissions.view ? t('qualityHistory.yes') : t('qualityHistory.no'), a.permissions.edit ? t('qualityHistory.yes') : t('qualityHistory.no'), `${a.progress}%`, fmt(a.assignedAt)]);
    downloadTable(readPrefs().exportFormat, 'assignations', columns, rows);
  };

  return (
    <>
      <style>{`
        /* ── Page layout: NO top gap, full height ── */
        .ao-page { padding: 12px 20px 16px; font-family: 'Inter', sans-serif; min-height: 0; }
        .ao-header { margin-bottom: 12px; }
        .ao-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #000168; margin: 0 0 4px; }
        .ao-title { font-size: 20px; font-weight: 700; color: #000168; margin: 0 0 2px; }
        .ao-subtitle { font-size: 12.5px; color: #64748b; margin: 0; }

        /* ── KPI cards ── */
        .ao-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
        @media (max-width: 900px) { .ao-kpis { grid-template-columns: repeat(2, 1fr); } }
        .ao-kpi { background: #fff; border: 1px solid #e4e8f2; border-radius: 10px; padding: 12px 14px; }
        .ao-kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: #94a3b8; margin-bottom: 5px; display: flex; align-items: center; gap: 4px; }
        .ao-kpi-label i { font-size: 11px; color: #000168; }
        .ao-kpi-value { font-size: 20px; font-weight: 700; color: #000168; }
        .ao-kpi-sub { font-size: 10.5px; color: #94a3b8; margin-top: 2px; }
        .ao-kpi.warn .ao-kpi-value { color: #dc2626; }
        .ao-kpi.warn .ao-kpi-label i { color: #dc2626; }
        .ao-kpi.good .ao-kpi-value { color: #059669; }

        /* ── insights row ── */
        .ao-insights { display: grid; grid-template-columns: 1.3fr 1fr; gap: 10px; margin-bottom: 12px; }
        @media (max-width: 900px) { .ao-insights { grid-template-columns: 1fr; } }
        .ao-panel { background: #fff; border: 1px solid #e4e8f2; border-radius: 10px; padding: 12px 14px; }
        .ao-panel-title { font-size: 11.5px; font-weight: 700; color: #0d1340; margin: 0 0 8px; display: flex; align-items: center; gap: 5px; }
        .ao-panel-title i { color: #000168; font-size: 12px; }
        .ao-panel-subtitle { font-size: 10.5px; color: #94a3b8; margin: -4px 0 8px; line-height: 1.4; }
        .ao-trend-empty { font-size: 11px; color: #94a3b8; padding: 14px 0; text-align: center; }
        .ao-quality-ok { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #059669; padding: 10px 0; justify-content: center; }
        .ao-quality-list { display: flex; flex-direction: column; gap: 5px; max-height: 110px; overflow-y: auto; }
        .ao-quality-item { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; color: #374151; line-height: 1.4; }
        .ao-quality-item i { margin-top: 1px; font-size: 12px; flex-shrink: 0; }
        .ao-quality-more { font-size: 10px; color: #94a3b8; margin-top: 2px; }

        /* ── Dynamic Filter Chips ── */
        .ao-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .ao-search { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #e4e8f2; border-radius: 8px; padding: 6px 10px; flex: 1; min-width: 160px; max-width: 240px; }
        .ao-search i { font-size: 13px; color: #94a3b8; }
        .ao-search input { border: none; outline: none; font-size: 12px; color: #0d1340; background: transparent; width: 100%; font-family: 'Inter', sans-serif; }
        .ao-spacer { flex: 1; }
        .ao-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 600; border: none; cursor: pointer; font-family: 'Inter', sans-serif; background: #000168; color: #fff; }
        .ao-btn:hover { background: #00009e; }
        .ao-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .ao-filter-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .ao-filter-label { font-size: 10.5px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .4px; }
        .ao-filter-divider { width: 1px; height: 16px; background: #e4e8f2; margin: 0 4px; }
        .ao-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 16px;
          border: 1px solid #e4e8f2; background: #fff;
          font-size: 11px; font-weight: 500; color: #64748b;
          cursor: pointer; transition: all .13s; font-family: 'Inter', sans-serif;
        }
        .ao-chip:hover { border-color: #000168; color: #000168; }
        .ao-chip.active { background: #000168; border-color: #000168; color: #fff; }

        /* ── Assignments by employee ── */
        .ao-assign-groups { display: flex; flex-direction: column; gap: 12px; }
        .ao-assign-group {
          background: #fff; border: 1px solid #e4e8f2; border-radius: 14px; overflow: hidden;
          box-shadow: 0 1px 2px rgba(13,19,64,0.04);
        }
        .ao-assign-group-head {
          padding: 12px 16px; background: #f8f9fc; border-bottom: 1px solid #eef1f7;
        }
        .ao-assign-user { display: flex; align-items: center; gap: 12px; }
        .ao-ava {
          width: 36px; height: 36px; border-radius: 50%; background: #000168; color: #b5d4f4;
          display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .ao-user-name { font-weight: 700; font-size: 14px; color: #0d1340; }
        .ao-user-meta { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .ao-assign-list { display: flex; flex-direction: column; }
        .ao-assign-row {
          display: grid; grid-template-columns: 1fr auto auto auto; gap: 14px; align-items: center;
          width: 100%; text-align: left; border: none; background: #fff; padding: 12px 16px;
          border-bottom: 1px solid #f0f2f8; cursor: pointer; font-family: inherit; transition: background .12s;
        }
        .ao-assign-row:last-child { border-bottom: none; }
        .ao-assign-row:hover { background: #f8faff; }
        .ao-assign-row.warn { box-shadow: inset 3px 0 0 #dc2626; }
        .ao-assign-plan { min-width: 0; }
        .ao-assign-plan-title { display: block; font-size: 13px; font-weight: 600; color: #0d1340; line-height: 1.35; }
        .ao-assign-plan-date { display: block; font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .ao-assign-perms { display: flex; gap: 4px; }
        .ao-perm-badge {
          width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: #cbd5e1; background: #f1f5f9;
        }
        .ao-perm-badge.on { background: rgba(0,1,104,0.1); color: #000168; }
        .ao-perm-badge.on.edit { background: rgba(217,119,6,0.12); color: #b5690a; }
        .ao-assign-progress { display: flex; align-items: center; gap: 8px; min-width: 100px; font-size: 11px; font-weight: 700; color: #000168; }
        .ao-assign-progress-track { flex: 1; height: 6px; background: #e8ebf4; border-radius: 999px; overflow: hidden; min-width: 64px; }
        .ao-assign-progress-fill { height: 100%; background: #000168; border-radius: 999px; }
        .ao-assign-warn { color: #dc2626; font-size: 14px; }
        @media (max-width: 720px) {
          .ao-assign-row { grid-template-columns: 1fr; gap: 8px; }
        }

        /* Tooltip */
    /* Tooltip */
        .ao-cell::after {
          content: attr(data-tooltip);
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #14163a;
          color: #fff;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 11px;
          white-space: pre;
          line-height: 1.5;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          z-index: 100;
          box-shadow: 0 8px 24px rgba(13,19,64,0.18);
          max-width: 220px;
        }
        .ao-cell::before {
          content: '';
          position: absolute;
          top: calc(100% + 1px);
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-bottom-color: #14163a;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          z-index: 100;
        }
        .ao-cell:hover::after, .ao-cell:hover::before { opacity: 1; }

        /* Legend */
        .ao-legend { display: flex; gap: 16px; margin-top: 10px; padding: 8px 14px; background: #fbfbfe; border: 1px solid #f2f3f9; border-radius: 10px; font-size: 11px; color: #6b7290; align-items: center; flex-wrap: wrap; }
        .ao-legend-item { display: flex; align-items: center; gap: 6px; }
        .ao-legend-item i { font-size: 13px; }
        .ao-legend-bar { width: 18px; height: 3px; border-radius: 2px; background: #000168; display: inline-block; }
        .ao-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .ao-legend-anomaly { background: #d64545; }
        .ao-legend-actions { margin-left: auto; color: #a3a8bd; }

        /* Empty */
        .ao-empty { text-align: center; padding: 40px 24px; color: #9a9fb5; background: #fff; border: 1px solid #eceef4; border-radius: 14px; box-shadow: 0 1px 2px rgba(13,19,64,0.04), 0 8px 24px rgba(13,19,64,0.03); }
        .ao-empty i { font-size: 32px; color: #dde3ef; display: block; margin-bottom: 8px; }

        /* ── Detail Modal ── */
        .ao-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .ao-detail-modal { background: #fff; border-radius: 16px; width: 460px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 48px); overflow-y: auto; box-shadow: 0 24px 64px rgba(0,0,0,.18); }
        .ao-detail-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #f0f2f8; }
        .ao-detail-title { font-size: 17px; font-weight: 700; color: #0d1340; }
        .ao-detail-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }
        .ao-detail-close { width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e4e8f2; background: #f8f9fc; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; }
        .ao-detail-close:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
        .ao-detail-close i { font-size: 15px; }
        .ao-detail-body { padding: 20px 24px; }
        .ao-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
        .ao-detail-field { display: flex; flex-direction: column; gap: 4px; }
        .ao-detail-field label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; }
        .ao-detail-field div { font-size: 13.5px; color: #0d1340; font-weight: 500; }
        .ao-detail-perms { border-top: 1px solid #f0f2f8; padding-top: 16px; }
        .ao-detail-perms label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; display: block; }
        .ao-detail-perm-row { display: flex; gap: 8px; }
        .ao-detail-perm { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; border: 1px solid #e4e8f2; background: #f8f9fc; color: #64748b; }
        .ao-detail-perm.on { background: #eef2ff; border-color: #a5b4fc; color: #000168; font-weight: 600; }
        .ao-detail-anomaly { display: flex; align-items: center; gap: 8px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #dc2626; margin-top: 12px; }
        .ao-detail-anomaly i { font-size: 14px; flex-shrink: 0; }
        .ao-row-tooltip-up .ao-cell::after {
          top: auto;
          bottom: calc(100% + 6px);
        }
        .ao-row-tooltip-up .ao-cell::before {
          top: auto;
          bottom: calc(100% + 1px);
          border-top-color: #14163a;
          border-bottom-color: transparent;
        }
      `}</style>

      {selectedCell && (
        <CellDetailModal assignment={selectedCell} onClose={() => setSelectedCell(null)} />
      )}

      <div className="ao-page">
        <div className="ao-header">
          <p className="ao-eyebrow">{t('assignOverview.eyebrow')}</p>
          <h1 className="ao-title">{t('assignOverview.title')}</h1>
          <p className="ao-subtitle">{t('assignOverview.subtitle')}</p>
        </div>

        {/* KPIs */}
        <div className="ao-kpis">
          <div className={`ao-kpi${kpis.avgProgress >= 70 ? ' good' : ''}`}>
            <div className="ao-kpi-label"><i className="ti ti-progress-check" /> {t('assignOverview.avgCompletion')}</div>
            <div className="ao-kpi-value">{kpis.avgProgress}%</div>
            <div className="ao-kpi-sub">{t('assignmentsMap.countAssignments', { count: assignments.length })}</div>
          </div>
          <div className={`ao-kpi${kpis.lateCount > 0 ? ' warn' : ''}`}>
            <div className="ao-kpi-label"><i className="ti ti-clock-exclamation" /> {t('planDetail.late')}</div>
            <div className="ao-kpi-value">{kpis.lateCount}</div>
            <div className="ao-kpi-sub">{t('assignOverview.lateRule', { pct: LATE_PROGRESS_THRESHOLD, days: LATE_DAYS_THRESHOLD })}</div>
          </div>
          <div className={`ao-kpi${kpis.permissionAnomalyCount > 0 ? ' warn' : ''}`}>
            <div className="ao-kpi-label"><i className="ti ti-shield-exclamation" /> {t('assignOverview.anomalies')}</div>
            <div className="ao-kpi-value">{kpis.permissionAnomalyCount}</div>
            <div className="ao-kpi-sub">{t('assignOverview.permWithoutView')}</div>
          </div>
          <div className="ao-kpi">
            <div className="ao-kpi-label"><i className="ti ti-users-group" /> {t('assignOverview.coverage')}</div>
            <div className="ao-kpi-value">{kpis.coveragePercent}%</div>
            <div className="ao-kpi-sub" title={t('assignOverview.coverageHint')}>
              {t('assignOverview.coverageSub', { n: kpis.uniqueUsers, total: totalEmployees || '—' })}
            </div>
          </div>
        </div>

        {/* Trend + Quality */}
        <div className="ao-insights">
          <div className="ao-panel">
            <p className="ao-panel-title"><i className="ti ti-chart-line" /> {t('assignOverview.perMonth')}</p>
            <TrendChart data={trendData} />
          </div>
          <div className="ao-panel">
            <p className="ao-panel-title"><i className="ti ti-list-search" /> {t('assignOverview.dataQuality')}</p>
            <p className="ao-panel-subtitle">{t('assignOverview.dataQualityHelp')}</p>
            <DataQualityPanel anomalies={anomalies} />
          </div>
        </div>

        {/* Toolbar with dynamic chips */}
        <div className="ao-toolbar">
          <div className="ao-search">
            <i className="ti ti-search" />
            <input placeholder={t('activityTracking.searchPh')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <FilterChips
            departments={activeDepartments}
            activeDept={deptFilter}
            onDeptChange={setDeptFilter}
            activePerm={permFilter}
            onPermChange={setPermFilter}
          />

          <div className="ao-spacer" />

          <button className="ao-btn" onClick={exportCsv} disabled={filtered.length === 0}>
            <i className="ti ti-download" /> {t('reportPlans.export')}
          </button>
        </div>

        {/* Assignations par employé */}
        {loading ? (
          <ListSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <div className="ao-empty">
            <i className="ti ti-clipboard-off" />
            <p>{t('assignmentsList.empty')}</p>
          </div>
        ) : (
          <AssignmentsByEmployee filtered={filtered} onSelect={(a) => setSelectedCell(a)} />
        )}
      </div>
    </>
  );
}