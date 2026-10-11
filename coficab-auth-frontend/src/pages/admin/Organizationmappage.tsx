import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { departmentService } from "../../services/departmentService";
import { adminEmployeeService } from "../../services/adminEmployeeService";
import type { Department, Organization } from "../../types/department";
import { ACTION_PLAN_API_URL as BASE_URL } from "../../config/apiEnv";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";

// --- Organization type enum labels (mirrors Coficab.ActionPlan.Core.Enums.OrganizationType) ---
// Values are i18n keys.
const ORG_TYPE_LABELS: Record<number, string> = {
  1: "orgMap.type1",
  2: "orgMap.type2",
  3: "orgMap.type3",
  4: "orgMap.type4",
  5: "orgMap.type5",
};

function getOrgTypeLabel(type?: number | string | null): string {
  if (type === undefined || type === null || type === "") return i18n.t("usersAdmin.organization");
  const num = typeof type === "string" ? Number(type) : type;
  return ORG_TYPE_LABELS[num] ? i18n.t(ORG_TYPE_LABELS[num]) : i18n.t("usersAdmin.organization");
}

// --- Local, defensive extensions -------------------------------------------------
type DepartmentWithMeta = Department & {
  _employeeCount?: number; // computed from admin employee fetch
};
type OrganizationWithMeta = Organization & {
  type?: number | string;
  employeeCount?: number;
};

interface DeptNode {
  dept: DepartmentWithMeta;
  x: number;
  y: number;
  r: number;
  isAnomaly: boolean;
  employeeCount: number;
}
interface OrgNode {
  org: OrganizationWithMeta;
  x: number;
  y: number;
  r: number;
  employeeCount: number;
  departmentCount: number;
}

type SelectedNode =
  | { kind: "org"; data: OrganizationWithMeta; employeeCount: number; departmentCount: number }
  | { kind: "dept"; data: DepartmentWithMeta; employeeCount: number; isAnomaly: boolean };

const WIDTH = 1200;
const ROW_ORG_Y = 110;
const ROW_DEPT_Y = 380;
const MARGIN_X = 120;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function orgRadius(employeeCount: number) {
  return clamp(38 + Math.sqrt(employeeCount) * 7, 38, 90);
}
function deptRadius(employeeCount: number) {
  return clamp(26 + Math.sqrt(employeeCount) * 6, 26, 65);
}

// Dynamic spacing: tighter for few departments, wider for many
function getDeptSpacing(deptCount: number) {
  if (deptCount <= 1) return 0;
  if (deptCount === 2) return 70;
  if (deptCount === 3) return 90;
  if (deptCount <= 5) return 110;
  return 130;
}

// ── Helper: extract employee count from department data ───────────────────────
function getDeptEmployeeCount(d: DepartmentWithMeta): number {
  return d._employeeCount ?? d.functionsCount ?? 0;
}

// ── Helper: extract employee count from organization data ──────────────────────
function getOrgEmployeeCount(o: OrganizationWithMeta): number {
  return o.employeeCount ?? 0;
}

// ── Unwrap .NET $values wrapper ───────────────────────────────────────────────
function unwrap<T>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.["$values"])) return raw["$values"];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

export default function OrganizationMapPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();

  const [organizations, setOrganizations] = useState<OrganizationWithMeta[]>([]);
  const [departments, setDepartments] = useState<DepartmentWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [searchTerm, setSearchTerm] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [showEmptyOnly, setShowEmptyOnly] = useState(false);
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState(false);

  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // simple pan/zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // ── Fetch all organizations ───────────────────────────────────────────────────
  const fetchOrganizations = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/organization`, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
    return (await res.json()) as OrganizationWithMeta[];
  }, [accessToken]);

  // ── Fetch all employees and count by department NAME ─────────────────────────
  const fetchEmployeesByDepartment = useCallback(async (): Promise<Map<string, number>> => {
    if (!accessToken) return new Map();
    try {
      const raw = await adminEmployeeService.getAllProfiles(accessToken);
      const employees = unwrap<any>(raw);

      const map = new Map<string, number>();
      employees.forEach((emp) => {
        const deptName = emp.department || emp.departmentName || emp.dept || "";
        if (deptName) {
          const normalized = String(deptName).trim().toLowerCase();
          map.set(normalized, (map.get(normalized) || 0) + 1);
        }
      });
      return map;
    } catch (err) {
      console.error("Failed to fetch employees:", err);
      return new Map();
    }
  }, [accessToken]);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orgs, depts, empCountsByName] = await Promise.all([
        fetchOrganizations(),
        departmentService.getAll(accessToken) as Promise<DepartmentWithMeta[]>,
        fetchEmployeesByDepartment(),
      ]);

      // Merge employee counts into departments by matching department NAME
      const deptsWithCounts = depts.map((d) => {
        const normalizedName = d.name.trim().toLowerCase();
        const count = empCountsByName.get(normalizedName) || 0;
        return {
          ...d,
          _employeeCount: count,
        };
      });

      setOrganizations(orgs);
      setDepartments(deptsWithCounts);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : i18n.t("orgMap.loadFailed")
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, fetchOrganizations, fetchEmployeesByDepartment]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const orgIds = useMemo(() => new Set(organizations.map((o) => o.id)), [organizations]);

  // Anomalies: departments whose organizationId doesn't match any known organization
  const anomalousDeptIds = useMemo(() => {
    const set = new Set<string>();
    departments.forEach((d) => {
      if (!d.organizationId || !orgIds.has(d.organizationId)) set.add(d.id);
    });
    return set;
  }, [departments, orgIds]);

  const filteredOrganizations = useMemo(() => {
    if (orgFilter === "all") return organizations;
    return organizations.filter((o) => o.id === orgFilter);
  }, [organizations, orgFilter]);

  const term = searchTerm.trim().toLowerCase();

  const departmentsByOrg = useMemo(() => {
    const map = new Map<string, DepartmentWithMeta[]>();
    departments.forEach((d) => {
      if (term) {
        const matches =
          d.name.toLowerCase().includes(term) || d.code.toLowerCase().includes(term);
        if (!matches) return;
      }
      const empCount = getDeptEmployeeCount(d);
      if (showEmptyOnly && empCount > 0) return;
      if (showAnomaliesOnly && !anomalousDeptIds.has(d.id)) return;
      const list = map.get(d.organizationId) ?? [];
      list.push(d);
      map.set(d.organizationId, list);
    });
    return map;
  }, [departments, term, showEmptyOnly, showAnomaliesOnly, anomalousDeptIds]);

  // Global stats (unfiltered, reflects the whole data set)
  const stats = useMemo(() => {
    const totalEmployees = departments.reduce(
      (sum, d) => sum + getDeptEmployeeCount(d),
      0
    );
    const emptyDepts = departments.filter(
      (d) => getDeptEmployeeCount(d) === 0
    ).length;
    return {
      totalOrgs: organizations.length,
      totalDepartments: departments.length,
      totalEmployees,
      avgPerDept:
        departments.length > 0 ? Math.round((totalEmployees / departments.length) * 10) / 10 : 0,
      emptyDepts,
      anomalies: anomalousDeptIds.size,
    };
  }, [organizations, departments, anomalousDeptIds]);

  // --- Layout with tighter org positioning ----------------------------------------
  const { orgNodes, deptNodes, links } = useMemo(() => {
    const orgList = filteredOrganizations.filter((o) => departmentsByOrg.has(o.id) || !term);
    const n = orgList.length || 1;

    // Tighter content width for few orgs so they're closer together
    const contentWidth = n <= 2 ? 400 : n <= 3 ? 600 : n <= 4 ? 800 : WIDTH - MARGIN_X * 2;
    const startX = (WIDTH - contentWidth) / 2;

    const oNodes: OrgNode[] = [];
    const dNodes: DeptNode[] = [];
    const lks: { x1: number; y1: number; x2: number; y2: number; anomaly: boolean }[] = [];

    orgList.forEach((org, i) => {
      const orgX = n === 1 ? WIDTH / 2 : startX + (i * contentWidth) / (n - 1);
      const orgEmployees = getOrgEmployeeCount(org);
      const orgR = orgRadius(orgEmployees);
      const depts = departmentsByOrg.get(org.id) ?? [];
      const spacing = getDeptSpacing(depts.length);

      oNodes.push({
        org,
        x: orgX,
        y: ROW_ORG_Y,
        r: orgR,
        employeeCount: orgEmployees,
        departmentCount: depts.length,
      });

      const groupWidth = (depts.length - 1) * spacing;
      depts.forEach((d, j) => {
        const deptX = orgX - groupWidth / 2 + j * spacing;
        const empCount = getDeptEmployeeCount(d);
        const isAnomaly = anomalousDeptIds.has(d.id);
        const r = deptRadius(empCount);
        dNodes.push({ dept: d, x: deptX, y: ROW_DEPT_Y, r, isAnomaly, employeeCount: empCount });
        lks.push({ x1: orgX, y1: ROW_ORG_Y, x2: deptX, y2: ROW_DEPT_Y, anomaly: isAnomaly });
      });
    });

    return { orgNodes: oNodes, deptNodes: dNodes, links: lks };
  }, [filteredOrganizations, departmentsByOrg, anomalousDeptIds, term]);

  // ── Fixed wheel handler with passive: false ───────────────────────────────────
  const svgWrapRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.001, 0.5, 2.5));
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <>
      <style>{`
        .orgmap-page {
          padding: 24px 32px;
          background: #f6f7fb;
          min-height: 100%;
          font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
          color: #1e2433;
        }
        .orgmap-page-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 20px; gap: 16px; flex-wrap: wrap;
        }
        .orgmap-page-header h1 { font-size: 22px; font-weight: 700; color: #1b1f6b; margin: 0; }
        .orgmap-subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .orgmap-page-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .orgmap-search input {
          width: 240px; padding: 8px 12px; border: 1px solid #e1e3ec;
          border-radius: 8px; font-size: 13px; background: #fff;
        }
        .orgmap-search input:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }
        .orgmap-select {
          padding: 8px 10px; border: 1px solid #e1e3ec; border-radius: 8px;
          font-size: 13px; background: #fff;
        }
        .orgmap-toggle-group { display: flex; border: 1px solid #e1e3ec; border-radius: 8px; overflow: hidden; }
        .orgmap-toggle-btn {
          background: #fff; border: none; padding: 8px 14px; font-size: 13px;
          font-weight: 600; cursor: pointer; color: #6b7280;
        }
        .orgmap-toggle-btn.active { background: #1b1f6b; color: #fff; }
        .orgmap-chip {
          border: 1px solid #e1e3ec; background: #fff; border-radius: 20px;
          padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; color: #4b5563;
        }
        .orgmap-chip.active { background: #eef2ff; border-color: #4338ca; color: #4338ca; }
        .orgmap-stats-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px; margin-bottom: 20px;
        }
        .orgmap-stat-card {
          background: #fff; border-radius: 10px; padding: 14px 18px;
          border-top: 3px solid transparent; box-shadow: 0 1px 2px rgba(16,24,40,0.04);
        }
        .orgmap-stat-card--blue { border-top-color: #1b1f6b; }
        .orgmap-stat-card--green { border-top-color: #16a34a; }
        .orgmap-stat-card--purple { border-top-color: #7c3aed; }
        .orgmap-stat-card--orange { border-top-color: #ea580c; }
        .orgmap-stat-card--red { border-top-color: #dc2626; }
        .orgmap-stat-value { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #1b1f6b; }
        .orgmap-stat-card--green .orgmap-stat-value { color: #16a34a; }
        .orgmap-stat-card--purple .orgmap-stat-value { color: #7c3aed; }
        .orgmap-stat-card--orange .orgmap-stat-value { color: #ea580c; }
        .orgmap-stat-card--red .orgmap-stat-value { color: #dc2626; }
        .orgmap-stat-label { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280; }
        .orgmap-canvas-card {
          background: #12141c; border-radius: 12px; box-shadow: 0 1px 2px rgba(16,24,40,0.04);
          overflow: hidden; position: relative;
        }
        .orgmap-canvas-toolbar {
          position: absolute; top: 14px; right: 14px; display: flex; gap: 8px; z-index: 5;
        }
        .orgmap-zoom-btn {
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          color: #e5e7eb; width: 30px; height: 30px; border-radius: 8px; font-size: 15px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
        }
        .orgmap-zoom-btn:hover { background: rgba(255,255,255,0.16); }
        .orgmap-svg-wrap { width: 100%; height: 520px; cursor: grab; overflow: hidden; }
        .orgmap-svg-wrap.dragging { cursor: grabbing; }
        .orgmap-legend {
          display: flex; align-items: center; gap: 18px; padding: 14px 20px;
          border-top: 1px solid #1f2230; flex-wrap: wrap;
        }
        .orgmap-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #cbd5e1; }
        .orgmap-legend-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .orgmap-legend-note { font-size: 11px; color: #6b7280; margin-left: auto; }
        .orgmap-node-org { fill: #0e7a63; stroke: #14b895; stroke-width: 2; }
        .orgmap-node-filiale { fill: #b45309; stroke: #f59e0b; stroke-width: 2; }
        .orgmap-node-dept { fill: #1d4ed8; stroke: #60a5fa; stroke-width: 2; }
        .orgmap-node-dept-empty { fill: #4b5563; stroke: #9ca3af; stroke-width: 2; }
        .orgmap-node-label { fill: #fff; font-size: 13px; font-weight: 700; text-anchor: middle; pointer-events: none; }
        .orgmap-node-sublabel { fill: #cbd5e1; font-size: 10px; text-anchor: middle; pointer-events: none; }
        .orgmap-link { stroke: #3b4256; stroke-width: 2; fill: none; }
        .orgmap-link-anomaly { stroke: #ef4444; stroke-width: 2; stroke-dasharray: 5 4; fill: none; }
        .orgmap-anomaly-dot { fill: #f43f5e; stroke: #12141c; stroke-width: 2; }
        .orgmap-node-group { cursor: pointer; }
        .orgmap-node-group:hover circle { filter: brightness(1.15); }
        .orgmap-drawer {
          position: absolute; top: 0; right: 0; height: 100%; width: 300px;
          background: #fff; box-shadow: -4px 0 16px rgba(0,0,0,0.15);
          padding: 20px; z-index: 10; overflow-y: auto;
        }
        .orgmap-drawer h3 { margin: 0 0 4px; font-size: 17px; color: #1b1f6b; }
        .orgmap-drawer-kind { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 700; margin-bottom: 14px; }
        .orgmap-drawer-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f1f5; font-size: 13px; }
        .orgmap-drawer-row span:first-child { color: #6b7280; }
        .orgmap-drawer-row span:last-child { font-weight: 600; color: #1e2433; text-align: right; }
        .orgmap-drawer-close {
          position: absolute; top: 14px; right: 14px; background: none; border: none;
          font-size: 20px; color: #9ca3af; cursor: pointer;
        }
        .orgmap-drawer-badge {
          display: inline-block; margin-top: 12px; background: #fef2f2; color: #b91c1c;
          font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px;
        }
        .orgmap-list-card {
          background: #fff; border-radius: 12px; box-shadow: 0 1px 2px rgba(16,24,40,0.04); overflow: hidden;
        }
        .orgmap-list-org-block { border-bottom: 1px solid #eef0f5; }
        .orgmap-list-org-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 20px; background: #fafbfd; font-weight: 700; color: #1b1f6b; font-size: 14px;
        }
        .orgmap-list-dept-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 20px 10px 36px; font-size: 13px; border-top: 1px solid #f3f4f8;
        }
        .orgmap-empty-state { padding: 40px 20px; text-align: center; color: #9ca3af; font-size: 13px; }
        .orgmap-error-banner { background: #fef2f2; color: #b91c1c; padding: 10px 20px; font-size: 12px; border-radius: 8px; margin-bottom: 16px; }
        @media (max-width: 720px) {
          .orgmap-page { padding: 16px; }
          .orgmap-page-header { flex-direction: column; align-items: stretch; }
          .orgmap-page-actions { flex-direction: column; align-items: stretch; }
          .orgmap-search input { width: 100%; }
          .orgmap-drawer { width: 100%; }
        }
      `}</style>

      <div className="orgmap-page">
        <div className="orgmap-page-header">
          <div>
            <h1>{t("orgMap.title")}</h1>
            <div className="orgmap-subtitle">
              {t("orgMap.subtitle")}
            </div>
          </div>
          <div className="orgmap-page-actions">
            <div className="orgmap-search">
              <input
                type="text"
                placeholder={t("orgMap.searchPh")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="orgmap-select"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
            >
              <option value="all">{t("departments.allOrgs")}</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            <div className="orgmap-toggle-group">
              <button
                className={`orgmap-toggle-btn ${viewMode === "map" ? "active" : ""}`}
                onClick={() => setViewMode("map")}
              >
                {t("orgMap.map")}
              </button>
              <button
                className={`orgmap-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                onClick={() => setViewMode("list")}
              >
                {t("orgMap.list")}
              </button>
            </div>
          </div>
        </div>

        {error && <div className="orgmap-error-banner">{error}</div>}

        <div className="orgmap-stats-grid">
          <div className="orgmap-stat-card orgmap-stat-card--blue">
            <div className="orgmap-stat-value">{stats.totalOrgs}</div>
            <div className="orgmap-stat-label">{t("orgs.title")}</div>
          </div>
          <div className="orgmap-stat-card orgmap-stat-card--green">
            <div className="orgmap-stat-value">{stats.totalDepartments}</div>
            <div className="orgmap-stat-label">{t("departments.title")}</div>
          </div>
          <div className="orgmap-stat-card orgmap-stat-card--purple">
            <div className="orgmap-stat-value">{stats.totalEmployees}</div>
            <div className="orgmap-stat-label">{t("orgMap.employeesTotal")}</div>
          </div>
          <div className="orgmap-stat-card orgmap-stat-card--blue">
            <div className="orgmap-stat-value">{stats.avgPerDept}</div>
            <div className="orgmap-stat-label">{t("orgMap.avgPerDept")}</div>
          </div>
          <div
            className="orgmap-stat-card orgmap-stat-card--orange"
            role="button"
            onClick={() => setShowEmptyOnly((v) => !v)}
            style={{ cursor: "pointer", outline: showEmptyOnly ? "2px solid #ea580c" : "none" }}
          >
            <div className="orgmap-stat-value">{stats.emptyDepts}</div>
            <div className="orgmap-stat-label">{t("orgMap.emptyDepts")}</div>
          </div>
          <div
            className="orgmap-stat-card orgmap-stat-card--red"
            role="button"
            onClick={() => setShowAnomaliesOnly((v) => !v)}
            style={{ cursor: "pointer", outline: showAnomaliesOnly ? "2px solid #dc2626" : "none" }}
          >
            <div className="orgmap-stat-value">{stats.anomalies}</div>
            <div className="orgmap-stat-label">{t("assignOverview.anomalies")}</div>
          </div>
        </div>

        {(showEmptyOnly || showAnomaliesOnly) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {showEmptyOnly && (
              <button className="orgmap-chip active" onClick={() => setShowEmptyOnly(false)}>
                {t("orgMap.emptyOnly")} ✕
              </button>
            )}
            {showAnomaliesOnly && (
              <button className="orgmap-chip active" onClick={() => setShowAnomaliesOnly(false)}>
                {t("orgMap.anomaliesOnly")} ✕
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="orgmap-empty-state">{t("orgMap.loading")}</div>
        ) : viewMode === "map" ? (
          <div className="orgmap-canvas-card">
            <div className="orgmap-canvas-toolbar">
              <button className="orgmap-zoom-btn" onClick={() => setZoom((z) => clamp(z + 0.2, 0.5, 2.5))}>+</button>
              <button className="orgmap-zoom-btn" onClick={() => setZoom((z) => clamp(z - 0.2, 0.5, 2.5))}>−</button>
              <button className="orgmap-zoom-btn" onClick={resetView} title={t("orgMap.resetView")}>⟲</button>
            </div>

            <div
              ref={svgWrapRef}
              className={`orgmap-svg-wrap ${isDragging ? "dragging" : ""}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <svg viewBox={`0 0 ${WIDTH} 520`} width="100%" height="100%">
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`} style={{ transformOrigin: "center" }}>
                  {links.map((l, i) => {
                    const midY = (l.y1 + l.y2) / 2;
                    const path = `M ${l.x1} ${l.y1} C ${l.x1} ${midY}, ${l.x2} ${midY}, ${l.x2} ${l.y2}`;
                    return (
                      <path key={i} d={path} className={l.anomaly ? "orgmap-link-anomaly" : "orgmap-link"} />
                    );
                  })}

                  {orgNodes.map((n) => {
                    // Local (1) is treated as a subsidiary/local entity ("Filiale");
                    // all Corporate variants (2-5) are treated as HQ scope ("Siège").
                    const isFiliale = Number(n.org.type) === 1;
                    return (
                      <g
                        key={n.org.id}
                        className="orgmap-node-group"
                        onClick={() =>
                          setSelected({
                            kind: "org",
                            data: n.org,
                            employeeCount: n.employeeCount,
                            departmentCount: n.departmentCount,
                          })
                        }
                      >
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={n.r}
                          className={isFiliale ? "orgmap-node-filiale" : "orgmap-node-org"}
                        />
                        <text x={n.x} y={n.y - 4} className="orgmap-node-label">
                          {n.org.name}
                        </text>
                        <text x={n.x} y={n.y + 14} className="orgmap-node-sublabel">
                          {getOrgTypeLabel(n.org.type)}
                        </text>
                      </g>
                    );
                  })}

                  {deptNodes.map((n) => (
                    <g
                      key={n.dept.id}
                      className="orgmap-node-group"
                      onClick={() =>
                        setSelected({
                          kind: "dept",
                          data: n.dept,
                          employeeCount: n.employeeCount,
                          isAnomaly: n.isAnomaly,
                        })
                      }
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        className={n.employeeCount > 0 ? "orgmap-node-dept" : "orgmap-node-dept-empty"}
                      />
                      <text x={n.x} y={n.y - 3} className="orgmap-node-label">
                        {n.dept.name}
                      </text>
                      <text x={n.x} y={n.y + 13} className="orgmap-node-sublabel">
                        {t("assignmentsMap.countEmployees", { count: n.employeeCount })}
                      </text>
                      {n.isAnomaly && (
                        <circle
                          cx={n.x + n.r * 0.7}
                          cy={n.y - n.r * 0.7}
                          r={6}
                          className="orgmap-anomaly-dot"
                        />
                      )}
                    </g>
                  ))}
                </g>
              </svg>

              {selected && (
                <div className="orgmap-drawer">
                  <button className="orgmap-drawer-close" onClick={() => setSelected(null)} aria-label={t("fiveWhy.close")}>
                    ×
                  </button>
                  {selected.kind === "org" ? (
                    <>
                      <div className="orgmap-drawer-kind">{t("usersAdmin.organization")}</div>
                      <h3>{selected.data.name}</h3>
                      <div className="orgmap-drawer-row">
                        <span>{t("planDetail.type")}</span>
                        <span>{getOrgTypeLabel(selected.data.type)}</span>
                      </div>
                      <div className="orgmap-drawer-row">
                        <span>{t("departments.title")}</span>
                        <span>{selected.departmentCount}</span>
                      </div>
                      <div className="orgmap-drawer-row">
                        <span>{t("nav.employees")}</span>
                        <span>{selected.employeeCount}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="orgmap-drawer-kind">{t("planDetail.department")}</div>
                      <h3>{selected.data.name}</h3>
                      <div className="orgmap-drawer-row">
                        <span>{t("planRef.colCode")}</span>
                        <span>{selected.data.code}</span>
                      </div>
                      <div className="orgmap-drawer-row">
                        <span>{t("nav.employees")}</span>
                        <span>{selected.employeeCount}</span>
                      </div>
                      <div className="orgmap-drawer-row">
                        <span>{t("claimDetail.description")}</span>
                        <span>{selected.data.description || "—"}</span>
                      </div>
                      {selected.isAnomaly && (
                        <div className="orgmap-drawer-badge">
                          ⚠ {t("orgMap.orgInvalid")}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="orgmap-legend">
              <span className="orgmap-legend-item">
                <span className="orgmap-legend-dot" style={{ background: "#0e7a63" }} /> {t("orgMap.legendHq")}
              </span>
              <span className="orgmap-legend-item">
                <span className="orgmap-legend-dot" style={{ background: "#b45309" }} /> {t("orgMap.legendSubsidiary")}
              </span>
              <span className="orgmap-legend-item">
                <span className="orgmap-legend-dot" style={{ background: "#1d4ed8" }} /> {t("orgMap.legendActive")}
              </span>
              <span className="orgmap-legend-item">
                <span className="orgmap-legend-dot" style={{ background: "#4b5563" }} /> {t("orgMap.legendEmpty")}
              </span>
              <span className="orgmap-legend-item">
                <span className="orgmap-legend-dot" style={{ background: "#f43f5e" }} /> {t("orgMap.legendAnomaly")}
              </span>
              <span className="orgmap-legend-note">{t("orgMap.legendNote")}</span>
            </div>
          </div>
        ) : (
          <div className="orgmap-list-card">
            {filteredOrganizations.length === 0 ? (
              <div className="orgmap-empty-state">{t("orgs.empty")}</div>
            ) : (
              filteredOrganizations.map((org) => {
                const depts = departmentsByOrg.get(org.id) ?? [];
                return (
                  <div key={org.id} className="orgmap-list-org-block">
                    <div className="orgmap-list-org-header">
                      <span>
                        {org.name} <span style={{ color: "#9ca3af", fontWeight: 500 }}>· {getOrgTypeLabel(org.type)}</span>
                      </span>
                      <span>{t("orgMap.deptCount", { count: depts.length })}</span>
                    </div>
                    {depts.length === 0 ? (
                      <div className="orgmap-list-dept-row" style={{ color: "#9ca3af" }}>
                        {t("orgMap.noDept")}
                      </div>
                    ) : (
                      depts.map((d) => {
                        const empCount = getDeptEmployeeCount(d);
                        return (
                          <div key={d.id} className="orgmap-list-dept-row">
                            <span>
                              {d.name} <span style={{ color: "#9ca3af" }}>({d.code})</span>
                            </span>
                            <span>{t("assignmentsMap.countEmployees", { count: empCount })}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}