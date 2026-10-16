import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { useAuth } from '../../../context/AuthContext';
import UserAvatar from '../../../components/UserAvatar';
import { adminEmployeeService } from '../../../services/adminEmployeeService';
import { getUsers, updateUser } from '../../../services/adminService';
import { departmentService } from '../../../services/departmentService';
import type { Department } from '../../../types/department';
import {
  fetchEmployeePerformance,
  type EmployeePerformanceRow,
} from '../../../services/employeePerformanceService';
import { inferWorkFieldsFromDepartment, phoneFromId } from '../../../utils/employeeWorkFields';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

const NAVY = '#000168';
const LINE = '#e4e8f2';
const OTHER_KEY = '__other__';

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
};

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const norm = (s?: string | null) => String(s ?? '').trim().toLowerCase();

export type OrgEmployee = {
  id: string;
  fullName: string;
  email: string;
  department: string;
  deptKey: string;
  poste: string;
  equipe: string;
  telephone: string;
  profilePictureUrl?: string | null;
  role?: string;
  activeDossiers: number;
};

type OrgDept = {
  key: string;
  label: string;
  code?: string;
};

type EmpNodeData = {
  employee: OrgEmployee;
  selected?: boolean;
  delay: number;
  onSelect: (e: OrgEmployee) => void;
};

type DeptNodeData = {
  label: string;
  count: number;
  delay: number;
};

function DeptNode({ data }: NodeProps) {
  const { t } = useTranslation();
  const d = data as DeptNodeData;
  return (
    <div className="org-dept" style={{ animationDelay: `${d.delay}ms` }}>
      <Handle type="target" position={Position.Top} className="org-handle" />
      <div className="org-dept-label">{d.label}</div>
      <div className="org-dept-count">{t('recognition.employeesShort', { count: d.count })}</div>
      <Handle type="source" position={Position.Bottom} className="org-handle" />
    </div>
  );
}

function EmployeeNode({ data }: NodeProps) {
  const d = data as EmpNodeData;
  const e = d.employee;
  return (
    <div
      className={`org-emp${d.selected ? ' is-on' : ''}`}
      style={{ animationDelay: `${d.delay}ms` }}
      onClick={(ev) => {
        ev.stopPropagation();
        d.onSelect(e);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          d.onSelect(e);
        }
      }}
    >
      <Handle type="target" position={Position.Top} className="org-handle" />
      <UserAvatar
        user={{ profilePictureUrl: e.profilePictureUrl }}
        name={e.fullName}
        size={36}
        radius="lg"
      />
      <div className="org-emp-body">
        <div className="org-emp-name">{e.fullName}</div>
        <div className="org-emp-poste">{e.poste || '—'}</div>
        <div className="org-emp-equipe">{e.equipe || '—'}</div>
      </div>
      <Handle type="source" position={Position.Bottom} className="org-handle" />
    </div>
  );
}

function RootNode() {
  const { t } = useTranslation();
  return (
    <div className="org-root">
      <div className="org-root-mark">COFICAB</div>
      <div className="org-root-sub">{t('usersAdmin.organization')}</div>
      <Handle type="source" position={Position.Bottom} className="org-handle" />
    </div>
  );
}

const nodeTypes = {
  root: RootNode,
  dept: DeptNode,
  employee: EmployeeNode,
};

function resolveDeptKey(
  departmentName: string,
  byName: Map<string, OrgDept>,
): string {
  const key = byName.get(norm(departmentName))?.key;
  return key ?? OTHER_KEY;
}

function mergeEmployees(
  profilesRaw: any[],
  authUsers: any[],
  deptByName: Map<string, OrgDept>,
): OrgEmployee[] {
  const byId = new Map(authUsers.map((u: any) => [String(u.id ?? u.Id).toLowerCase(), u]));
  const adminish = (roles: any) => {
    const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
    return list.some((r) => /admin|superadmin/i.test(String(r)));
  };

  return unwrap(profilesRaw)
    .map((p: any) => {
      const id = String(pick(p, 'userId', 'UserId', 'id', 'Id') ?? '').trim();
      const auth = byId.get(id.toLowerCase());
      const department =
        pick(p, 'department', 'Department', 'departmentName', 'DepartmentName')
        ?? pick(auth, 'department', 'Department')
        ?? '';
      const inferred = inferWorkFieldsFromDepartment(
        department,
        pick(p, 'role', 'Role') ?? auth?.roles?.[0],
      );
      const telephone =
        pick(p, 'telephone', 'Telephone', 'phone', 'Phone')
        || phoneFromId(id);
      return {
        id,
        fullName:
          pick(p, 'name', 'Name', 'fullName', 'FullName')
          ?? pick(auth, 'fullName', 'FullName')
          ?? '—',
        email: pick(p, 'email', 'Email') ?? pick(auth, 'email', 'Email') ?? '',
        department: department || '—',
        deptKey: resolveDeptKey(department, deptByName),
        poste: pick(p, 'poste', 'Poste') || inferred.poste,
        equipe: pick(p, 'equipe', 'Equipe') || inferred.equipe,
        telephone,
        profilePictureUrl:
          pick(p, 'profilePictureUrl', 'ProfilePictureUrl')
          ?? pick(auth, 'profilePictureUrl', 'ProfilePictureUrl')
          ?? null,
        role: pick(p, 'role', 'Role') ?? auth?.roles?.[0],
        activeDossiers: 0,
        _roles: auth?.roles,
      };
    })
    .filter((e: any) => e.id && !adminish(e._roles))
    .map(({ _roles, ...rest }: any) => rest as OrgEmployee);
}

function buildGraph(
  employees: OrgEmployee[],
  departments: OrgDept[],
  selectedId: string | null,
  onSelect: (e: OrgEmployee) => void,
  deptFilter: string,
): { nodes: Node[]; edges: Edge[] } {
  const visible = employees.filter(
    (e) => deptFilter === 'all' || e.deptKey === deptFilter,
  );

  const byDept = new Map<string, OrgEmployee[]>();
  for (const d of departments) byDept.set(d.key, []);
  byDept.set(OTHER_KEY, []);

  for (const e of visible) {
    const key = byDept.has(e.deptKey) ? e.deptKey : OTHER_KEY;
    byDept.get(key)!.push(e);
  }

  const orderedKeys = [
    ...departments.map((d) => d.key),
    ...(byDept.get(OTHER_KEY)?.length ? [OTHER_KEY] : []),
  ].filter((k) => (byDept.get(k)?.length ?? 0) > 0 || (deptFilter !== 'all' && k === deptFilter));

  const labelOf = (key: string) =>
    key === OTHER_KEY
      ? i18n.t('orgChart.others')
      : departments.find((d) => d.key === key)?.label ?? key;

  const COL_W = 230;
  const ROW_H = 108;
  const DEPT_Y = 130;
  const EMP_START_Y = 240;
  const EMP_W = 200;
  const totalW = Math.max(orderedKeys.length - 1, 0) * COL_W;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'root',
    type: 'root',
    position: { x: totalW / 2 - 70, y: 0 },
    data: {},
    draggable: false,
  });

  orderedKeys.forEach((deptKey, i) => {
    const members = (byDept.get(deptKey) ?? []).slice().sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'fr'),
    );
    const deptId = `dept-${deptKey}`;
    const x = i * COL_W;
    const delay = 80 + i * 55;

    nodes.push({
      id: deptId,
      type: 'dept',
      position: { x: x + (EMP_W - 150) / 2, y: DEPT_Y },
      data: { label: labelOf(deptKey), count: members.length, delay },
      draggable: false,
    });

    edges.push({
      id: `e-root-${deptKey}`,
      source: 'root',
      target: deptId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#a5b4fc', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#a5b4fc', width: 14, height: 14 },
    });

    members.forEach((emp, j) => {
      const id = `emp-${emp.id}`;
      nodes.push({
        id,
        type: 'employee',
        position: { x, y: EMP_START_Y + j * ROW_H },
        data: {
          employee: emp,
          selected: selectedId === emp.id,
          delay: delay + 70 + j * 35,
          onSelect,
        },
        draggable: true,
      });
      edges.push({
        id: `e-${deptKey}-${emp.id}`,
        source: deptId,
        target: id,
        type: 'smoothstep',
        style: { stroke: LINE, strokeWidth: 1.25 },
      });
    });
  });

  return { nodes, edges };
}

/** Recentre doucement le graphe après chargement / filtre. */
function FitViewBridge({
  token,
  loading,
}: {
  token: string;
  loading: boolean;
}) {
  const { fitView } = useReactFlow();
  const lastToken = useRef('');

  useEffect(() => {
    if (loading || !token || token === lastToken.current) return;
    lastToken.current = token;
    const t = window.setTimeout(() => {
      void fitView({
        padding: 0.22,
        duration: 520,
        maxZoom: 0.95,
        minZoom: 0.35,
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [token, loading, fitView]);

  return null;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function OrgDownloadButton({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const { getNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);

  const onDownload = useCallback(async () => {
    const nodes = getNodes();
    if (!nodes.length || busy) return;

    const viewportEl = document.querySelector(
      '.org-canvas .react-flow__viewport',
    ) as HTMLElement | null;
    if (!viewportEl) return;

    setBusy(true);
    try {
      const bounds = getNodesBounds(nodes);
      const pad = 48;
      const width = Math.ceil(bounds.width + pad * 2);
      const height = Math.ceil(bounds.height + pad * 2);
      const imgW = Math.min(Math.max(width, 640), 4200);
      const imgH = Math.min(Math.max(height, 480), 4200);
      const viewport = getViewportForBounds(bounds, imgW, imgH, 0.5, 1.2, 0.12);

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#f8f9fc',
        width: imgW,
        height: imgH,
        pixelRatio: 2,
        style: {
          width: `${imgW}px`,
          height: `${imgH}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.classList?.contains('org-handle');
        },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      downloadDataUrl(dataUrl, `organigramme-coficab-${stamp}.png`);
    } catch {
      /* export silencieux en cas d’échec navigateur */
    } finally {
      setBusy(false);
    }
  }, [getNodes, busy]);

  return (
    <button
      type="button"
      className="org-btn"
      onClick={() => void onDownload()}
      disabled={disabled || busy}
      title={t('orgChart.downloadTitle')}
    >
      <i className={`ti ${busy ? 'ti-loader-2' : 'ti-download'}`} />
      {busy ? t('orgChart.exporting') : t('orgChart.download')}
    </button>
  );
}

function OrgChartCanvas({
  employees,
  departments,
  loading,
  error,
  deptFilter,
  selected,
  setSelected,
  onSelect,
  layoutVersion,
  onRequestMove,
}: {
  employees: OrgEmployee[];
  departments: OrgDept[];
  loading: boolean;
  error: string;
  deptFilter: string;
  selected: OrgEmployee | null;
  setSelected: (e: OrgEmployee | null) => void;
  onSelect: (e: OrgEmployee) => void;
  /** Bumped by the page to put every card back where the data says it belongs (move cancelled). */
  layoutVersion: number;
  /** A card was dropped on another department column: ask for confirmation. Returns false when the drop is not a move. */
  onRequestMove: (employee: OrgEmployee, targetDeptKey: string) => boolean;
}) {
  const navigate = useNavigate();
  const { t, i18n: { language } } = useTranslation();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [snapBack, setSnapBack] = useState(0);
  const fitToken = `${deptFilter}|${employees.length}|${departments.map((d) => d.key).join(',')}`;

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(
      employees,
      departments,
      selected?.id ?? null,
      onSelect,
      deptFilter,
    );
    setNodes(n);
    setEdges(e);
    // language: rebuild so the « Autres » column label follows the UI language
  }, [employees, departments, selected?.id, onSelect, deptFilter, setNodes, setEdges, language, layoutVersion, snapBack]);

  // A card dropped on the column of another department asks for a move; anything else snaps back.
  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      const emp = (node.data as EmpNodeData | undefined)?.employee;
      if (node.type !== 'employee' || !emp) return;
      const center = node.position.x + (node.measured?.width ?? 200) / 2;
      let best: { key: string; dist: number } | null = null;
      for (const n of nodes) {
        if (n.type !== 'dept') continue;
        const dist = Math.abs(n.position.x + (n.measured?.width ?? 150) / 2 - center);
        if (best === null || dist < best.dist) best = { key: n.id.replace(/^dept-/, ''), dist };
      }
      const known = departments.some((d) => d.key === emp.deptKey);
      const ownKey = known ? emp.deptKey : OTHER_KEY;
      if (!best || best.key === ownKey || !onRequestMove(emp, best.key)) setSnapBack((v) => v + 1);
    },
    [nodes, departments, onRequestMove],
  );

  return (
    <div className="org-canvas">
      {loading && <div className="org-loading">{t('orgChart.loading')}</div>}
      {error && !loading && <div className="org-err">{error}</div>}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        minZoom={0.25}
        maxZoom={1.6}
        defaultViewport={{ x: 0, y: 40, zoom: 0.72 }}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => setSelected(null)}
        nodesFocusable
        elevateNodesOnSelect={false}
      >
        <Background gap={22} color="#e8ecf5" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={2}
          pannable
          zoomable
          maskColor="rgba(0,1,104,.06)"
          nodeColor={(n) => {
            if (n.type === 'root') return NAVY;
            if (n.type === 'dept') return '#94a3b8';
            return '#c7d2fe';
          }}
        />
        <FitViewBridge token={fitToken} loading={loading} />
      </ReactFlow>

      <div className="org-hint">{t('orgChart.hint')}</div>

      {selected && (
        <aside className="org-pop" role="dialog" aria-label={t('employeeFile.drawerAria')}>
          <div className="org-pop-head">
            <UserAvatar
              user={{ profilePictureUrl: selected.profilePictureUrl }}
              name={selected.fullName}
              size={40}
              radius="lg"
            />
            <div style={{ minWidth: 0 }}>
              <div className="org-pop-name">{selected.fullName}</div>
              <div className="org-pop-dept">
                {selected.department || '—'} · {selected.poste}
              </div>
            </div>
            <button
              type="button"
              className="org-pop-close"
              aria-label={t('fiveWhy.close')}
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <ul className="org-pop-list">
            <li>
              <span>{t('orgChart.email')}</span>
              <strong>{selected.email || '—'}</strong>
            </li>
            <li>
              <span>{t('orgChart.phone')}</span>
              <strong>{selected.telephone || '—'}</strong>
            </li>
            <li>
              <span>{t('orgChart.team')}</span>
              <strong>{selected.equipe || '—'}</strong>
            </li>
            <li>
              <span>{t('comparator.activeFiles')}</span>
              <strong>{selected.activeDossiers}</strong>
            </li>
          </ul>
          <div className="org-pop-actions">
            <button
              type="button"
              className="org-pop-btn"
              onClick={() =>
                navigate(`/admin/employees/${selected.id}`, {
                  state: { employee: selected },
                })
              }
            >
              <i className="ti ti-eye" /> {t('employeesAdmin.viewProfile')}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

export default function EmployeeOrgChartPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [employees, setEmployees] = useState<OrgEmployee[]>([]);
  const [departments, setDepartments] = useState<OrgDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selected, setSelected] = useState<OrgEmployee | null>(null);
  const [authUsers, setAuthUsers] = useState<any[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [pendingMove, setPendingMove] = useState<{ employee: OrgEmployee; target: OrgDept } | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [notice, setNotice] = useState('');

  const onSelect = useCallback((e: OrgEmployee) => {
    setSelected(e);
  }, []);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const [profilesRaw, usersRaw, deptsRaw] = await Promise.all([
        adminEmployeeService.getAllProfiles(accessToken),
        getUsers(accessToken),
        departmentService.getAll(accessToken),
      ]);

      const deptList: OrgDept[] = unwrap(deptsRaw)
        .filter((d: Department) => !d.isArchived)
        .map((d: Department) => ({
          key: String(d.id),
          label: d.name,
          code: d.code,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

      const byName = new Map<string, OrgDept>();
      for (const d of deptList) {
        byName.set(norm(d.label), d);
        if (d.code) byName.set(norm(d.code), d);
      }

      let merged = mergeEmployees(profilesRaw, usersRaw, byName);
      try {
        const perf = await fetchEmployeePerformance(accessToken, merged);
        const byId = new Map(perf.map((r: EmployeePerformanceRow) => [r.userId, r]));
        merged = merged.map((e) => ({
          ...e,
          activeDossiers: byId.get(e.id)?.activeDossiers ?? 0,
        }));
      } catch {
        /* perf optionnel */
      }

      setAuthUsers(unwrap(usersRaw));
      setDepartments(deptList);
      setEmployees(merged);
      setDeptFilter((prev) =>
        prev === 'all' || prev === OTHER_KEY || deptList.some((d) => d.key === prev)
          ? prev
          : 'all',
      );
    } catch {
      setError(i18n.t('orgChart.loadFailed'));
      setEmployees([]);
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestMove = useCallback(
    (employee: OrgEmployee, targetKey: string): boolean => {
      const target = departments.find((d) => d.key === targetKey);
      if (!target) {
        setNotice(i18n.t('orgChart.moveNotDepartment'));
        return false;
      }
      setMoveError('');
      setPendingMove({ employee, target });
      return true;
    },
    [departments],
  );

  const cancelMove = () => {
    if (moving) return;
    setPendingMove(null);
    setMoveError('');
    setLayoutVersion((v) => v + 1);
  };

  const confirmMove = async () => {
    if (!pendingMove || !accessToken || moving) return;
    const { employee, target } = pendingMove;
    const account = authUsers.find((u) => String(pick(u, 'id', 'Id') ?? '').toLowerCase() === employee.id.toLowerCase());
    const roles: string[] = Array.isArray(pick(account, 'roles', 'Roles')) ? pick(account, 'roles', 'Roles') : [];
    if (account && roles.length !== 1) {
      // updateUser replaces the whole role set: refuse rather than risk dropping a role.
      setMoveError(i18n.t('orgChart.moveRoleUnsupported'));
      return;
    }
    const previousKey = employee.deptKey;
    setMoving(true);
    setMoveError('');
    try {
      await adminEmployeeService.moveToDepartment(accessToken, employee.id, target.key);
      if (account) {
        try {
          await updateUser(accessToken, employee.id, {
            fullName: String(pick(account, 'fullName', 'FullName') ?? employee.fullName),
            department: target.label,
            organizationId: pick(account, 'organizationId', 'OrganizationId') ?? undefined,
            role: roles[0],
            permissions: Array.isArray(pick(account, 'permissions', 'Permissions')) ? pick(account, 'permissions', 'Permissions') : [],
          });
        } catch (err) {
          // keep profile and account in step: put the profile back when it had a real department
          if (departments.some((d) => d.key === previousKey)) {
            await adminEmployeeService.moveToDepartment(accessToken, employee.id, previousKey).catch(() => undefined);
          }
          throw err;
        }
      }
      setPendingMove(null);
      setNotice(i18n.t('orgChart.moveDone', { name: employee.fullName, to: target.label }));
      setLayoutVersion((v) => v + 1);
      await load();
    } catch {
      setMoveError(i18n.t('orgChart.moveFailed', { name: employee.fullName }));
    } finally {
      setMoving(false);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: employees.length, [OTHER_KEY]: 0 };
    for (const d of departments) map[d.key] = 0;
    for (const e of employees) {
      const key = map[e.deptKey] !== undefined ? e.deptKey : OTHER_KEY;
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [employees, departments]);

  const otherCount = counts[OTHER_KEY] ?? 0;

  return (
    <div className="org">
      <style>{`
        .org { font-family: Inter, system-ui, sans-serif; color: #0d1340; display: flex; flex-direction: column; height: calc(100dvh - 56px); min-height: 520px; }
        .org-head {
          display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;
          justify-content: space-between; margin-bottom: 12px; flex-shrink: 0;
        }
        .org-eyebrow {
          margin: 0 0 4px; font-size: 10px; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase; color: ${NAVY};
        }
        .org-title { margin: 0; font-size: 20px; font-weight: 700; }
        .org-sub { margin: 6px 0 0; font-size: 13px; color: #64748b; max-width: 520px; line-height: 1.45; }
        .org-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px;
          border-radius: 8px; border: 1px solid ${LINE}; background: #fff; color: ${NAVY};
          font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .org-btn:hover:not(:disabled) { background: #eef2ff; }
        .org-btn:disabled { opacity: .55; cursor: not-allowed; }
        .org-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .org-filters {
          display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; flex-shrink: 0;
        }
        .org-chip {
          height: 30px; padding: 0 11px; border-radius: 999px; border: 1px solid ${LINE};
          background: #fff; font: inherit; font-size: 12px; font-weight: 600; color: #475569;
          cursor: pointer; transition: border-color .2s ease, background .2s ease, color .2s ease, transform .2s ease;
        }
        .org-chip:hover { border-color: #c7d2fe; color: ${NAVY}; transform: translateY(-1px); }
        .org-chip.is-on { background: ${NAVY}; border-color: ${NAVY}; color: #fff; }
        .org-chip span { opacity: .75; margin-left: 4px; font-weight: 500; }
        .org-chip.is-on span { opacity: .85; }

        .org-canvas {
          position: relative; flex: 1; min-height: 0;
          border: 1px solid ${LINE}; border-radius: 12px; overflow: hidden; background: #f8f9fc;
        }
        .org-loading, .org-err {
          position: absolute; inset: 0; display: grid; place-items: center;
          background: rgba(248,249,252,.85); z-index: 5; font-size: 13px; color: #64748b;
        }
        .org-err { color: #b91c1c; }

        .org-handle { width: 6px !important; height: 6px !important; background: #c7d2fe !important; border: none !important; opacity: 0; }

        @keyframes org-rise {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes org-root-in {
          from { opacity: 0; transform: translateY(-8px) scale(.96); }
          to { opacity: 1; transform: none; }
        }
        @keyframes org-root-glow {
          0%, 100% { box-shadow: 0 8px 18px rgba(0,1,104,.22); }
          50% { box-shadow: 0 10px 24px rgba(0,1,104,.32); }
        }

        .org-root {
          background: ${NAVY};
          color: #fff; border-radius: 12px; padding: 12px 18px; min-width: 140px; text-align: center;
          animation: org-root-in .45s ease both, org-root-glow 3.6s ease-in-out 0.5s infinite;
        }
        .org-root-mark { font-size: 13px; font-weight: 800; letter-spacing: .08em; }
        .org-root-sub { font-size: 11px; opacity: .8; margin-top: 2px; }
        .org-dept {
          background: #fff; border: 1px solid ${LINE}; border-radius: 10px;
          padding: 10px 14px; min-width: 150px; text-align: center;
          box-shadow: 0 1px 2px rgba(13,19,64,.04);
          animation: org-rise .42s ease both;
        }
        .org-dept-label { font-size: 13px; font-weight: 700; color: ${NAVY}; }
        .org-dept-count { font-size: 11px; color: #64748b; margin-top: 2px; }
        .org-emp {
          display: flex; align-items: center; gap: 10px;
          background: #fff; border: 1px solid ${LINE}; border-radius: 12px;
          padding: 10px 12px; width: 200px; cursor: pointer;
          animation: org-rise .4s ease both;
          transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .org-emp:hover { border-color: #c7d2fe; box-shadow: 0 6px 14px rgba(0,1,104,.08); transform: translateY(-2px); }
        .org-emp.is-on { border-color: ${NAVY}; box-shadow: 0 0 0 2px rgba(0,1,104,.1); }
        .org-emp-body { min-width: 0; flex: 1; }
        .org-emp-name {
          font-size: 12.5px; font-weight: 650; color: #0d1340;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .org-emp-poste, .org-emp-equipe {
          font-size: 11px; color: #64748b;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .org-emp-poste { margin-top: 1px; font-weight: 550; color: #475569; }

        .org-pop {
          position: absolute; top: 14px; right: 14px; z-index: 6;
          width: min(300px, calc(100% - 28px));
          background: #fff; border: 1px solid ${LINE}; border-radius: 12px;
          padding: 14px; box-shadow: 0 12px 28px rgba(13,19,64,.12);
          animation: org-rise .22s ease both;
        }
        .org-pop-head { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
        .org-pop-name { font-size: 14px; font-weight: 700; }
        .org-pop-dept { font-size: 11px; color: #64748b; margin-top: 2px; }
        .org-pop-close {
          margin-left: auto; border: none; background: #f1f5f9; color: #64748b;
          width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1;
        }
        .org-pop-close:hover { background: #e4e8f2; color: #0d1340; }
        .org-pop-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .org-pop-list li {
          display: flex; justify-content: space-between; gap: 10px;
          font-size: 12.5px; border-bottom: 1px solid #f0f2f8; padding-bottom: 7px;
        }
        .org-pop-list li:last-child { border-bottom: none; padding-bottom: 0; }
        .org-pop-list span { color: #64748b; }
        .org-pop-list strong { font-weight: 650; text-align: right; word-break: break-all; }
        .org-pop-actions { display: flex; gap: 8px; margin-top: 12px; }
        .org-pop-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px;
          border-radius: 7px; font: inherit; font-size: 12px; font-weight: 600;
          border: 1px solid transparent; cursor: pointer; background: ${NAVY}; color: #fff;
        }
        .org-pop-btn:hover { background: #00009e; }
        .org-hint {
          position: absolute; left: 14px; bottom: 14px; z-index: 4;
          font-size: 11px; color: #64748b; background: rgba(255,255,255,.9);
          border: 1px solid ${LINE}; border-radius: 8px; padding: 6px 10px;
          pointer-events: none;
        }
        .org-notice {
          position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60;
          background: #0d1340; color: #fff; font-size: 13px; padding: 10px 16px; border-radius: 10px;
          box-shadow: 0 8px 24px rgba(13,19,64,.25);
        }
        .org-modal-back {
          position: fixed; inset: 0; z-index: 70; display: grid; place-items: center;
          background: rgba(13,19,64,.45); padding: 16px;
        }
        .org-modal {
          width: min(440px, 100%); background: #fff; border-radius: 14px; padding: 20px 22px;
          box-shadow: 0 20px 50px rgba(13,19,64,.3);
        }
        .org-modal-title { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
        .org-modal-text { margin: 0 0 8px; font-size: 14px; line-height: 1.5; }
        .org-modal-hint { margin: 0 0 14px; font-size: 12.5px; color: #64748b; line-height: 1.45; }
        .org-modal-error { margin: 0 0 12px; font-size: 13px; color: #b91c1c; }
        .org-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .react-flow__minimap { border-radius: 8px; overflow: hidden; border: 1px solid ${LINE}; }
        .react-flow__controls { border-radius: 8px; overflow: hidden; border: 1px solid ${LINE}; box-shadow: none; }
        .react-flow__edge.animated path { stroke-dasharray: 5; animation: org-dash 1.2s linear infinite; }
        @keyframes org-dash {
          to { stroke-dashoffset: -20; }
        }
        @media (prefers-reduced-motion: reduce) {
          .org-root, .org-dept, .org-emp, .org-pop, .react-flow__edge.animated path {
            animation: none !important;
          }
        }
      `}</style>

      <ReactFlowProvider>
        <div className="org-head">
          <div>
            <p className="org-eyebrow">{t('frontNav.footerEmployees')}</p>
            <h1 className="org-title">{t('orgChart.title')}</h1>
            <p className="org-sub">
              {t('orgChart.subtitle')}
            </p>
          </div>
          <div className="org-actions">
            <OrgDownloadButton disabled={loading || employees.length === 0} />
            <button type="button" className="org-btn" onClick={() => void load()} disabled={loading}>
              <i className={`ti ${loading ? 'ti-loader-2' : 'ti-refresh'}`} />
              {t('qualityHistory.refresh')}
            </button>
          </div>
        </div>

        <div className="org-filters">
          <button
            type="button"
            className={`org-chip${deptFilter === 'all' ? ' is-on' : ''}`}
            onClick={() => setDeptFilter('all')}
          >
            {t('common.all')}<span>{counts.all}</span>
          </button>
          {departments.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`org-chip${deptFilter === d.key ? ' is-on' : ''}`}
              onClick={() => setDeptFilter(d.key)}
            >
              {d.label}
              <span>{counts[d.key] ?? 0}</span>
            </button>
          ))}
          {otherCount > 0 && (
            <button
              type="button"
              className={`org-chip${deptFilter === OTHER_KEY ? ' is-on' : ''}`}
              onClick={() => setDeptFilter(OTHER_KEY)}
            >
              {t('orgChart.others')}
              <span>{otherCount}</span>
            </button>
          )}
        </div>

        <OrgChartCanvas
          employees={employees}
          departments={departments}
          loading={loading}
          error={error}
          deptFilter={deptFilter}
          selected={selected}
          setSelected={setSelected}
          onSelect={onSelect}
          layoutVersion={layoutVersion}
          onRequestMove={requestMove}
        />

        {notice && <div className="org-notice" role="status">{notice}</div>}

        {pendingMove && (
          <div className="org-modal-back" role="dialog" aria-modal="true" aria-label={t('orgChart.moveTitle')}>
            <div className="org-modal">
              <h2 className="org-modal-title">{t('orgChart.moveTitle')}</h2>
              <p className="org-modal-text">
                {t('orgChart.moveBody', {
                  name: pendingMove.employee.fullName,
                  from: pendingMove.employee.department && pendingMove.employee.department !== '—'
                    ? pendingMove.employee.department
                    : t('orgChart.others'),
                  to: pendingMove.target.label,
                })}
              </p>
              <p className="org-modal-hint">{t('orgChart.moveWarn')}</p>
              {moveError && <p className="org-modal-error">{moveError}</p>}
              <div className="org-modal-actions">
                <button type="button" className="org-btn" onClick={cancelMove} disabled={moving}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="org-pop-btn" onClick={() => void confirmMove()} disabled={moving}>
                  {moving ? t('orgChart.moving') : t('orgChart.moveConfirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </ReactFlowProvider>
    </div>
  );
}
