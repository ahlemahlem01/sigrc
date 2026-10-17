import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListSkeleton } from "../../components/TableSkeleton";
import DepartmentFormModal from "../../components/DepartmentFormModal";
import { useAuth } from '../../context/AuthContext';
import { departmentService } from "../../services/departmentService";
import type { Department, Organization } from "../../types/department";
import { fetchStructure } from "../../services/organizationStructureService";
import { ACTION_PLAN_API_URL as BASE_URL } from "../../config/apiEnv";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";

export default function DepartmentsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth(); 
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  // ?organizationId= preselects the filter (organizations list "Gérer" button).
  const [searchParams] = useSearchParams();
  const [selectedOrgId, setSelectedOrgId] = useState<string>(searchParams.get("organizationId") || "all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    organizations.forEach((o) => map.set(o.id, o.name));
    return map;
  }, [organizations]);

  // Names of the sites and regions the listed departments can be attached to.
  const [siteNameById, setSiteNameById] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!accessToken) return;
    const orgIds = Array.from(new Set(departments.map((d) => d.organizationId)));
    let live = true;
    Promise.all(orgIds.map((id) => fetchStructure(accessToken, id).catch(() => null))).then((all) => {
      if (!live) return;
      const map = new Map<string, string>();
      all.forEach((st) => st && [...st.sites, ...st.regions].forEach((n) => map.set(n.id, n.name)));
      setSiteNameById(map);
    });
    return () => { live = false; };
  }, [departments, accessToken]);

  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/organization`, {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setOrganizations(data);
    } catch (e) {
      console.error('Failed to fetch organizations', e);
    }
  }, [accessToken]); 

  const loadDepartments = useCallback(async (orgId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data =
        orgId === "all"
          ? await departmentService.getAll(accessToken)
          : await departmentService.getByOrganization(orgId, accessToken);
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t("departments.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchOrganizations(); }, [fetchOrganizations]);
  useEffect(() => { loadDepartments(selectedOrgId); }, [selectedOrgId, loadDepartments]);

  const filteredDepartments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return departments;
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        d.code.toLowerCase().includes(term)
    );
  }, [departments, searchTerm]);

  const stats = useMemo(() => {
    const orgIds = new Set(departments.map((d) => d.organizationId));
    const totalFunctions = departments.reduce(
      (sum, d) => sum + (d.functionsCount ?? 0),
      0
    );
    return {
      total: departments.length,
      organizationsCovered: orgIds.size,
      totalFunctions,
    };
  }, [departments]);

  const openCreateModal = () => { setEditingDepartment(null); setIsModalOpen(true); };
  const openEditModal = (dept: Department) => { setEditingDepartment(dept); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setEditingDepartment(null); };

  const handleSubmit = async (values: {
    name: string;
    code: string;
    description: string;
    organizationId: string;
    siteId: string | null;
    regionId: string | null;
  }) => {
    if (editingDepartment) {
      await departmentService.update(editingDepartment.id, {
        name: values.name,
        code: values.code,
        description: values.description || null,
        siteId: values.siteId,
        regionId: values.regionId,
      }, accessToken);
    } else {
      await departmentService.create({
        name: values.name,
        code: values.code,
        description: values.description || null,
        organizationId: values.organizationId,
        siteId: values.siteId,
        regionId: values.regionId,
      }, accessToken);
    }
    await loadDepartments(selectedOrgId);
  };

  const confirmDelete = async () => {
    if (!departmentToDelete) return;
    try {
      await departmentService.archive(departmentToDelete.id, accessToken);
      setDepartmentToDelete(null);
      await loadDepartments(selectedOrgId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("departments.deleteFailed")
      );
      setDepartmentToDelete(null);
    }
  };

  return (
    <>
      <style>{`
        .dept-page {
          padding: 24px 32px;
          background: #f6f7fb;
          min-height: 100%;
          font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
          color: #1e2433;
        }
        .dept-page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          gap: 16px;
          flex-wrap: wrap;
        }
        .dept-page-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #1b1f6b;
          margin: 0;
        }
        .dept-page-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .dept-search input {
          width: 260px;
          padding: 8px 12px;
          border: 1px solid #e1e3ec;
          border-radius: 8px;
          font-size: 13px;
          background: #fff;
        }
        .dept-search input:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .dept-btn-primary {
          background: #1b1f6b;
          color: #fff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .dept-btn-primary:hover { background: #14185a; }
        .dept-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .dept-btn-primary--danger { background: #dc2626; }
        .dept-btn-primary--danger:hover { background: #b91c1c; }
        .dept-btn-secondary {
          background: #fff;
          color: #1e2433;
          border: 1px solid #e1e3ec;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .dept-btn-secondary:hover { background: #f6f7fb; }
        .dept-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .dept-stat-card {
          background: #fff;
          border-radius: 10px;
          padding: 16px 20px;
          border-top: 3px solid transparent;
          box-shadow: 0 1px 2px rgba(16,24,40,0.04);
        }
        .dept-stat-card--blue { border-top-color: #1b1f6b; }
        .dept-stat-card--green { border-top-color: #16a34a; }
        .dept-stat-card--purple { border-top-color: #7c3aed; }
        .dept-stat-value { font-size: 24px; font-weight: 700; color: #7c3aed; margin-bottom: 4px; }
        .dept-stat-card--blue .dept-stat-value { color: #1b1f6b; }
        .dept-stat-card--green .dept-stat-value { color: #16a34a; }
        .dept-stat-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #6b7280;
        }
        .dept-table-card {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 1px 2px rgba(16,24,40,0.04);
          overflow: hidden;
        }
        .dept-table-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid #eef0f5;
          flex-wrap: wrap;
        }
        .dept-table-header h2 { font-size: 15px; font-weight: 700; color: #1b1f6b; margin: 0; }
        .dept-org-filter { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .dept-org-filter label { font-size: 12px; color: #6b7280; }
        .dept-org-filter select {
          padding: 6px 10px;
          border: 1px solid #e1e3ec;
          border-radius: 8px;
          font-size: 12px;
          background: #fff;
        }
        .dept-count-badge {
          background: #f1f2f9;
          color: #4b4f7a;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
        }
        .dept-table { width: 100%; border-collapse: collapse; }
        .dept-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #9ca3af;
          padding: 10px 20px;
          border-bottom: 1px solid #eef0f5;
        }
        .dept-table tbody td {
          padding: 12px 20px;
          font-size: 13px;
          border-bottom: 1px solid #f3f4f8;
          vertical-align: middle;
        }
        .dept-table tbody tr:last-child td { border-bottom: none; }
        .dept-table tbody tr:hover { background: #fafbfd; }
        .dept-name-cell { font-weight: 600; color: #1e2433; }
        .dept-code-badge {
          background: #eef2ff;
          color: #4338ca;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.02em;
        }
        .dept-description-cell {
          color: #6b7280;
          max-width: 280px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dept-row-actions { display: flex; gap: 6px; }
        .dept-action-btn {
          background: #fff;
          border: 1px solid #e1e3ec;
          color: #374151;
          font-size: 12px;
          font-weight: 600;
          padding: 5px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .dept-action-btn:hover { background: #f6f7fb; }
        .dept-action-btn--danger { color: #dc2626; border-color: #fecaca; }
        .dept-action-btn--danger:hover { background: #fef2f2; }
        .dept-empty-state { padding: 40px 20px; text-align: center; color: #6b7280; font-size: 13px; }
        .dept-link-btn {
          background: none;
          border: none;
          color: #4f46e5;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          font-size: 13px;
        }
        .dept-error-banner {
          background: #fef2f2;
          color: #b91c1c;
          padding: 10px 20px;
          font-size: 12px;
          border-bottom: 1px solid #fecaca;
        }
        .dept-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(17,19,38,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .dept-modal {
          background: #fff;
          border-radius: 12px;
          width: 100%;
          max-width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(16,24,40,0.2);
        }
        .dept-confirm-modal {
          background: #fff;
          border-radius: 12px;
          width: 100%;
          max-width: 420px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(16,24,40,0.2);
        }
        .dept-confirm-modal h2 { font-size: 18px; font-weight: 700; color: #1b1f6b; margin: 0 0 12px; }
        .dept-confirm-modal p { font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 20px; }
        .dept-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid #eef0f5;
        }
        .dept-modal-header h2 { font-size: 18px; font-weight: 700; color: #1b1f6b; margin: 0; }
        .dept-modal-close { background: none; border: none; font-size: 24px; color: #9ca3af; cursor: pointer; line-height: 1; padding: 4px; }
        .dept-modal-close:hover { color: #1e2433; }
        .dept-modal-form { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
        .dept-field { display: flex; flex-direction: column; gap: 6px; }
        .dept-field label { font-size: 13px; font-weight: 600; color: #374151; }
        .dept-field input, .dept-field select, .dept-field textarea {
          padding: 10px 12px;
          border: 1px solid #e1e3ec;
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          background: #fff;
        }
        .dept-field input:focus, .dept-field select:focus, .dept-field textarea:focus {
          outline: none;
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79,70,229,0.12);
        }
        .dept-field-error { font-size: 12px; color: #dc2626; }
        .dept-form-error { background: #fef2f2; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
        .dept-modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px; }
        @media (max-width: 640px) {
          .dept-page { padding: 16px; }
          .dept-page-header { flex-direction: column; align-items: stretch; }
          .dept-page-actions { flex-direction: column; align-items: stretch; }
          .dept-search input { width: 100%; }
          .dept-org-filter { margin-left: 0; }
          .dept-table { display: block; overflow-x: auto; white-space: nowrap; }
        }
      `}</style>

      <div className="dept-page">
        <div className="dept-page-header">
          <div>
            <h1>{t("departments.title")}</h1>
          </div>
          <div className="dept-page-actions">
            <div className="dept-search">
              <input
                type="text"
                placeholder={t("departments.searchPh")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="dept-btn-primary" onClick={openCreateModal}>
              + {t("deptForm.newTitle")}
            </button>
          </div>
        </div>

        <div className="dept-stats-grid">
          <div className="dept-stat-card dept-stat-card--blue">
            <div className="dept-stat-value">{stats.total}</div>
            <div className="dept-stat-label">{t("departments.statTotal")}</div>
          </div>
          <div className="dept-stat-card dept-stat-card--green">
            <div className="dept-stat-value">{stats.organizationsCovered}</div>
            <div className="dept-stat-label">{t("departments.statOrgs")}</div>
          </div>
          <div className="dept-stat-card dept-stat-card--purple">
            <div className="dept-stat-value">{stats.totalFunctions}</div>
            <div className="dept-stat-label">{t("departments.statFunctions")}</div>
          </div>
        </div>

        <div className="dept-table-card">
          <div className="dept-table-header">
            <h2>{t("departments.listTitle")}</h2>
            <div className="dept-org-filter">
              <label htmlFor="org-filter">{t("usersAdmin.organization")}</label>
              <select
                id="org-filter"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
              >
                <option value="all">{t("departments.allOrgs")}</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="dept-count-badge">
              {t("departments.entries", { count: filteredDepartments.length })}
            </span>
          </div>

          {error && <div className="dept-error-banner">{error}</div>}

          {isLoading ? (
            <div className="dept-empty-state" style={{ display: 'block', textAlign: 'left' }}>
              <ListSkeleton rows={8} />
            </div>
          ) : filteredDepartments.length === 0 ? (
            <div className="dept-empty-state">
              {t("departments.empty")}{" "}
              <button className="dept-link-btn" onClick={openCreateModal}>
                {t("departments.createFirst")}
              </button>
            </div>
          ) : (
            <table className="dept-table">
              <thead>
                <tr>
                  <th>{t("deptForm.name")}</th>
                  <th>{t("planRef.colCode")}</th>
                  <th>{t("usersAdmin.organization")}</th>
                  <th>{t("deptForm.site")}</th>
                  <th>{t("claimDetail.description")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map((dept) => (
                  <tr key={dept.id}>
                    <td className="dept-name-cell">{dept.name}</td>
                    <td>
                      <span className="dept-code-badge">{dept.code}</span>
                    </td>
                    <td>
                      {dept.organizationName ?? orgNameById.get(dept.organizationId) ?? "—"}
                    </td>
                    <td>{(dept.siteId && siteNameById.get(dept.siteId)) || (dept.regionId && siteNameById.get(dept.regionId)) || "—"}</td>
                    <td className="dept-description-cell">{dept.description || "—"}</td>
                    <td>
                      <div className="dept-row-actions">
                        <button className="dept-action-btn" onClick={() => openEditModal(dept)}>
                          {t("common.edit")}
                        </button>
                        <button
                          className="dept-action-btn dept-action-btn--danger"
                          onClick={() => setDepartmentToDelete(dept)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DepartmentFormModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSubmit={handleSubmit}
          department={editingDepartment}
          organizations={organizations}
          defaultOrganizationId={selectedOrgId !== "all" ? selectedOrgId : undefined}
        />

        {departmentToDelete && (
          <div
            className="dept-modal-overlay"
            role="presentation"
            onClick={() => setDepartmentToDelete(null)}
          >
            <div
              className="dept-confirm-modal"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>{t("departments.deleteTitle")}</h2>
              <p>
                {t("departments.deleteConfirm")}{" "}
                <strong>{departmentToDelete.name}</strong> ? {t("departments.deleteHint")}
              </p>
              <div className="dept-modal-footer">
                <button className="dept-btn-secondary" onClick={() => setDepartmentToDelete(null)}>
                  {t("common.cancel")}
                </button>
                <button className="dept-btn-primary dept-btn-primary--danger" onClick={confirmDelete}>
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}