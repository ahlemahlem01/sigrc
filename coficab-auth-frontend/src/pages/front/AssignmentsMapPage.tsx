import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  assignActionPlanToUser,
  getActionPlans,
  getAllAssignments,
  type RawAssignment,
} from '../../services/actionPlanService';
import {
  getDepartments,
  getUsers,
  type DepartmentDto,
  type UserDto,
} from '../../services/adminService';
import './AssignmentsMapPage.styles.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

type LinkRow = {
  key: string;
  userId: string;
  userName: string;
  planId: string;
  planTitle: string;
  progress: number;
  status: number;
  createdAt?: string;
  departmentId: string;
  departmentName: string;
  assignedById: string;
  assignedByName: string;
};

type ViewMode = 'by-person' | 'by-plan' | 'by-department' | 'by-assigner';

type Group = {
  id: string;
  name: string;
  items: LinkRow[];
  avgProgress: number;
};

const PAGE_SIZE = 25;
const UNKNOWN_DEPT = '__none__';
const UNKNOWN_ASSIGNER = '__none__';

/** Values are i18n keys. */
const STATUS_LABEL: Record<number, string> = {
  1: 'planView.statusDraft',
  2: 'status.ongoing',
  3: 'status.closed',
  4: 'status.archived',
};

function unwrapList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o['$values'])) return o['$values'] as any[];
  }
  return [];
}

function fixText(text?: string) {
  if (!text || !/[\u00C3\u00C2\u00E2]/.test(text)) return text ?? '';
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function userLabel(u: UserDto) {
  return u.fullName || u.email || u.id;
}

function statusClass(s: number) {
  if (s === 2) return 'ongoing';
  if (s === 3) return 'closed';
  if (s === 4) return 'archived';
  return 'draft';
}

function buildGroups(
  filtered: LinkRow[],
  keyOf: (l: LinkRow) => string,
  nameOf: (l: LinkRow) => string
): Group[] {
  const map = new Map<string, Group>();
  for (const l of filtered) {
    const id = keyOf(l);
    const g = map.get(id) || { id, name: nameOf(l), items: [], avgProgress: 0 };
    g.items.push(l);
    map.set(id, g);
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      avgProgress: Math.round(
        g.items.reduce((s, i) => s + Math.min(100, i.progress || 0), 0) / g.items.length
      ),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}

function countLabel(mode: ViewMode, n: number) {
  if (mode === 'by-person') return i18n.t('assignmentsMap.countPlans', { count: n });
  if (mode === 'by-plan') return i18n.t('assignmentsMap.countEmployees', { count: n });
  return i18n.t('assignmentsMap.countAssignments', { count: n });
}

export default function AssignmentsMapPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<ViewMode>('by-person');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [createPlanId, setCreatePlanId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [rawAssign, usersList, plansRes, deptsRaw] = await Promise.all([
        getAllAssignments(accessToken).catch(() => [] as RawAssignment[]),
        getUsers(accessToken).catch(() => [] as UserDto[]),
        getActionPlans(accessToken).catch(() => ({ data: [] })),
        getDepartments(accessToken).catch(() => [] as DepartmentDto[]),
      ]);

      const userMap = new Map<string, UserDto>();
      for (const u of usersList) userMap.set(String(u.id), u);

      const depts = unwrapList(deptsRaw) as any[];
      const deptByKey = new Map<string, { id: string; name: string }>();
      for (const d of depts) {
        const id = String(d.id ?? d.Id ?? '');
        const name = String(d.name ?? d.Name ?? '');
        const code = String(d.code ?? d.Code ?? '');
        if (!id || !name) continue;
        if (code) deptByKey.set(code.trim().toLowerCase(), { id, name });
        deptByKey.set(name.trim().toLowerCase(), { id, name });
      }

      const assignList = Array.isArray(rawAssign) ? rawAssign : unwrapList(rawAssign);
      const byKey = new Map<string, LinkRow>();

      for (const a of assignList) {
        const planId = String(a.id ?? a.Id ?? a.actionPlanId ?? a.ActionPlanId ?? '');
        const userId = String(a.assignedToId ?? a.AssignedToId ?? '').trim();
        if (!planId || !userId) continue;

        const user = userMap.get(userId);
        const rawDept = (user?.department ?? '').trim();
        const dept = rawDept ? deptByKey.get(rawDept.toLowerCase()) : undefined;

        const assignedByRaw = String(
          a.assignedBy ?? a.AssignedBy ?? a.updatedBy ?? a.UpdatedBy ?? ''
        ).trim();
        const assigner = assignedByRaw ? userMap.get(assignedByRaw) : undefined;

        const key = `${userId}::${planId}`;
        byKey.set(key, {
          key,
          userId,
          userName: user ? userLabel(user) : userId.slice(0, 8),
          planId,
          planTitle: fixText(String(a.title ?? a.Title ?? i18n.t('assignmentsMap.plan'))),
          progress: Number(a.progress ?? a.Progress ?? 0),
          status: Number(a.status ?? a.Status ?? 0),
          createdAt: a.createdAt ?? a.CreatedAt,
          departmentId: dept?.id || UNKNOWN_DEPT,
          departmentName: dept?.name || rawDept || i18n.t('reportPlans.noDepartment'),
          assignedById: assignedByRaw || UNKNOWN_ASSIGNER,
          assignedByName: assigner
            ? userLabel(assigner)
            : assignedByRaw && assignedByRaw !== 'system'
              ? assignedByRaw.slice(0, 12)
              : i18n.t('assignmentsMap.notProvided'),
        });
        const row = byKey.get(key)!;
        if (row.status === 3 || row.status === 4) row.progress = 100;
      }

      setLinks(Array.from(byKey.values()));
      setUsers(usersList);
      setPlans(unwrapList((plansRes as any)?.data ?? plansRes));
    } catch (e: any) {
      setError(e?.message || i18n.t('assignmentsMap.loadFailed'));
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [search, mode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) =>
        l.userName.toLowerCase().includes(q) ||
        l.planTitle.toLowerCase().includes(q) ||
        l.departmentName.toLowerCase().includes(q) ||
        l.assignedByName.toLowerCase().includes(q) ||
        l.userId.toLowerCase().includes(q) ||
        l.planId.toLowerCase().includes(q)
    );
  }, [links, search]);

  const groups = useMemo(() => {
    if (mode === 'by-person') {
      return buildGroups(filtered, (l) => l.userId, (l) => l.userName);
    }
    if (mode === 'by-plan') {
      return buildGroups(filtered, (l) => l.planId, (l) => l.planTitle);
    }
    if (mode === 'by-department') {
      return buildGroups(filtered, (l) => l.departmentId, (l) => l.departmentName);
    }
    return buildGroups(filtered, (l) => l.assignedById, (l) => l.assignedByName);
  }, [filtered, mode]);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = groups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const uniquePeople = new Set(links.map((l) => l.userId)).size;
  const uniquePlans = new Set(links.map((l) => l.planId)).size;

  const createAssignment = async () => {
    if (!accessToken) return;
    if (!createUserId || !createPlanId) {
      setCreateError(t('assignmentsMap.chooseBoth'));
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await assignActionPlanToUser(accessToken, {
        userId: createUserId,
        actionPlanId: createPlanId,
        permissions: { view: true, edit: true, delete: false },
      });
      setShowCreate(false);
      setCreateUserId('');
      setCreatePlanId('');
      await load();
    } catch (e: any) {
      setCreateError(e?.response?.data?.message || e?.message || t('assignmentsMap.assignFailed'));
    } finally {
      setCreating(false);
    }
  };

  const rowPrimary = (l: LinkRow) => {
    if (mode === 'by-person') return l.planTitle;
    if (mode === 'by-plan') return l.userName;
    if (mode === 'by-department') return `${l.userName} → ${l.planTitle}`;
    return `${l.userName} → ${l.planTitle}`;
  };

  const rowSecondary = (l: LinkRow) => {
    const by = t('assignmentsMap.assignedBy', { name: l.assignedByName });
    if (mode === 'by-person') return `${l.departmentName} · ${by}`;
    if (mode === 'by-plan') return `${l.departmentName} · ${by}`;
    if (mode === 'by-department') return by;
    return l.departmentName;
  };

  return (
    <div className="asm-page">
      <div className="asm-inner">
        <header className="asm-top">
          <div>
            <h1>{t('assignmentsMap.title')}</h1>
            <p>{t('assignmentsMap.subtitle')}</p>
          </div>
          <div className="asm-actions">
            <button type="button" className="asm-btn" disabled={loading} onClick={() => void load()}>
              {t('dashboard.refresh')}
            </button>
            <button type="button" className="asm-btn primary" onClick={() => setShowCreate(true)}>
              {t('assignmentsMap.newAssignment')}
            </button>
          </div>
        </header>

        {error && (
          <div className="asm-error" role="alert">
            {error}
          </div>
        )}

        <div className="asm-stats">
          <div className="asm-stat">
            <span>{t('assignmentsMap.title')}</span>
            <strong>{links.length}</strong>
          </div>
          <div className="asm-stat">
            <span>{t('nav.employees')}</span>
            <strong>{uniquePeople}</strong>
          </div>
          <div className="asm-stat">
            <span>{t('reportPlans.colPlans')}</span>
            <strong>{uniquePlans}</strong>
          </div>
          <div className="asm-stat">
            <span>{t('assignmentsMap.filterResult')}</span>
            <strong>{filtered.length}</strong>
          </div>
        </div>

        <div className="asm-toolbar">
          <input
            className="asm-search"
            type="search"
            placeholder={t('assignmentsMap.searchPh')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="asm-modes" role="tablist" aria-label={t('assignmentsMap.viewMode')}>
            <button
              type="button"
              className={mode === 'by-person' ? 'on' : ''}
              onClick={() => setMode('by-person')}
            >
              {t('assignmentsMap.byEmployee')}
            </button>
            <button
              type="button"
              className={mode === 'by-plan' ? 'on' : ''}
              onClick={() => setMode('by-plan')}
            >
              {t('assignmentsMap.byPlan')}
            </button>
            <button
              type="button"
              className={mode === 'by-department' ? 'on' : ''}
              onClick={() => setMode('by-department')}
            >
              {t('assignmentsMap.byDepartment')}
            </button>
            <button
              type="button"
              className={mode === 'by-assigner' ? 'on' : ''}
              onClick={() => setMode('by-assigner')}
            >
              {t('assignmentsMap.byOwner')}
            </button>
          </div>
        </div>

        <div className="asm-panel">
          {loading ? (
            <ListSkeleton rows={8} />
          ) : groups.length === 0 ? (
            <div className="asm-empty">{t('assignmentsMap.empty')}</div>
          ) : (
            <ul className="asm-groups">
              {pageSlice.map((g) => {
                const open = expandedId === g.id;
                return (
                  <li key={g.id} className={`asm-group${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="asm-group-head"
                      onClick={() => setExpandedId((prev) => (prev === g.id ? null : g.id))}
                      aria-expanded={open}
                    >
                      <span className="asm-group-chevron" aria-hidden>
                        {open ? '▾' : '▸'}
                      </span>
                      <span className="asm-group-title">{g.name}</span>
                      <span className="asm-group-meta">
                        {countLabel(mode, g.items.length)} · {t('assignmentsMap.avg', { pct: g.avgProgress })}
                      </span>
                      {mode === 'by-plan' && (
                        <span
                          className="asm-link"
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/pages/front/action-plans/${g.id}`);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              navigate(`/pages/front/action-plans/${g.id}`);
                            }
                          }}
                        >
                          {t('assignmentsMap.openPlan')}
                        </span>
                      )}
                    </button>
                    {open && (
                      <ul className="asm-group-body">
                        {g.items.map((l) => (
                          <li key={l.key}>
                            <div className="asm-row">
                              <div>
                                <strong>{rowPrimary(l)}</strong>
                                <span className="asm-row-sub">{rowSecondary(l)}</span>
                                <span className={`asm-badge ${statusClass(l.status)}`}>
                                  {STATUS_LABEL[l.status] ? t(STATUS_LABEL[l.status]) : '—'}
                                </span>
                              </div>
                              <div className="asm-prog">
                                <div className="asm-prog-track">
                                  <div
                                    className="asm-prog-fill"
                                    style={{ width: `${Math.min(100, l.progress || 0)}%` }}
                                  />
                                </div>
                                <span>{Math.min(100, l.progress || 0)}%</span>
                              </div>
                              <button
                                type="button"
                                className="asm-link"
                                onClick={() => navigate(`/pages/front/action-plans/${l.planId}`)}
                              >
                                {t('qualityHistory.open')}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {groups.length > 0 && (
            <div className="asm-pager">
              <span>
                {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, groups.length)} {t('permMatrix.of')} {t('assignmentsMap.groups', { count: groups.length })}
              </span>
              <div className="asm-pager-btns">
                <button
                  type="button"
                  className="asm-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('qualityHistory.previous')}
                </button>
                <span className="asm-page-n">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  className="asm-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('qualityHistory.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="asm-overlay"
          role="presentation"
          onClick={(e) => {
            if ((e.target as HTMLElement).classList.contains('asm-overlay')) setShowCreate(false);
          }}
        >
          <div className="asm-modal" role="dialog" aria-modal="true">
            <div className="asm-modal-head">
              <div>
                <h3>{t('assignmentsMap.newAssignment')}</h3>
                <p>{t('assignmentsMap.modalSub')}</p>
              </div>
              <button type="button" className="asm-btn" onClick={() => setShowCreate(false)}>
                {t('fiveWhy.close')}
              </button>
            </div>
            <div className="asm-modal-body">
              {createError && <div className="asm-form-error">{createError}</div>}
              <div className="asm-field">
                <label>{t('employeesAdmin.colEmployee')}</label>
                <select value={createUserId} onChange={(e) => setCreateUserId(e.target.value)}>
                  <option value="">— {t('assignmentsMap.choose')} —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {userLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="asm-field">
                <label>{t('planList.modalKicker')}</label>
                <select value={createPlanId} onChange={(e) => setCreatePlanId(e.target.value)}>
                  <option value="">— {t('assignmentsMap.choose')} —</option>
                  {plans.map((p) => {
                    const id = String(p.id ?? p.Id ?? '');
                    return (
                      <option key={id} value={id}>
                        {fixText(String(p.title ?? p.Title ?? id))}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div className="asm-modal-foot">
              <button type="button" className="asm-btn" onClick={() => setShowCreate(false)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="asm-btn primary"
                disabled={creating}
                onClick={() => void createAssignment()}
              >
                {creating ? t('assignmentsMap.assigning') : t('assignmentsMap.assign')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
