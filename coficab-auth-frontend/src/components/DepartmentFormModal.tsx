import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { fetchStructure, type OrganizationStructure } from "../services/organizationStructureService";
import type { Department, Organization } from "../types/department";
import { useTranslation } from "react-i18next";

interface DepartmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    code: string;
    description: string;
    organizationId: string;
    siteId: string | null;
    regionId: string | null;
  }) => Promise<void>;
  department?: Department | null; // null/undefined = create mode
  organizations: Organization[];
  defaultOrganizationId?: string;
}

export default function DepartmentFormModal({
  isOpen,
  onClose,
  onSubmit,
  department,
  organizations,
  defaultOrganizationId,
}: DepartmentFormModalProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const isEditMode = Boolean(department);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [structure, setStructure] = useState<OrganizationStructure | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (department) {
      setName(department.name);
      setCode(department.code);
      setDescription(department.description ?? "");
      setOrganizationId(department.organizationId);
      setSiteId(department.siteId ?? "");
      setRegionId(department.regionId ?? "");
    } else {
      setName("");
      setCode("");
      setDescription("");
      setOrganizationId(defaultOrganizationId ?? "");
      setSiteId("");
      setRegionId("");
    }
    setErrors({});
  }, [isOpen, department, defaultOrganizationId]);

  // The sites and regions offered are those of the chosen organization.
  useEffect(() => {
    if (!isOpen || !organizationId || !accessToken) { setStructure(null); return; }
    let live = true;
    fetchStructure(accessToken, organizationId).then((st) => { if (live) setStructure(st); }).catch(() => { if (live) setStructure(null); });
    return () => { live = false; };
  }, [isOpen, organizationId, accessToken]);

  if (!isOpen) return null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = t("deptForm.nameRequired");
    if (!code.trim()) next.code = t("deptForm.codeRequired");
    if (!isEditMode && !organizationId) {
      next.organizationId = t("deptForm.orgRequired");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        organizationId,
        siteId: siteId || null,
        regionId: regionId || null,
      });
      onClose();
    } catch (err) {
      // the server answers { code } for a refused name, code, site or region
      let code = "";
      try { code = JSON.parse(err instanceof Error ? err.message : "").code ?? ""; } catch { /* not a coded error */ }
      setErrors({
        form: code
          ? t(`deptForm.err.${code}`, { defaultValue: t("deptForm.genericError") })
          : t("deptForm.genericError"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dept-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="dept-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dept-modal-header">
          <h2 id="dept-modal-title">
            {isEditMode ? t("deptForm.editTitle") : t("deptForm.newTitle")}
          </h2>
          <button
            type="button"
            className="dept-modal-close"
            onClick={onClose}
            aria-label={t("fiveWhy.close")}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dept-modal-form">
          {errors.form && <div className="dept-form-error">{errors.form}</div>}

          <div className="dept-field">
            <label htmlFor="dept-name">{t("deptForm.name")} *</label>
            <input
              id="dept-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("deptForm.namePh")}
              autoFocus
            />
            {errors.name && <span className="dept-field-error">{errors.name}</span>}
          </div>

          <div className="dept-field">
            <label htmlFor="dept-code">{t("planRef.colCode")} *</label>
            <input
              id="dept-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t("deptForm.codePh")}
            />
            {errors.code && <span className="dept-field-error">{errors.code}</span>}
          </div>

          <div className="dept-field">
            <label htmlFor="dept-description">{t("claimDetail.description")}</label>
            <textarea
              id="dept-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("deptForm.descriptionPh")}
              rows={3}
            />
          </div>

          {!isEditMode && (
            <div className="dept-field">
              <label htmlFor="dept-org">{t("usersAdmin.organization")} *</label>
              <select
                id="dept-org"
                value={organizationId}
                onChange={(e) => { setOrganizationId(e.target.value); setSiteId(""); setRegionId(""); }}
              >
                <option value="">{t("deptForm.selectOrg")}</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              {errors.organizationId && (
                <span className="dept-field-error">{errors.organizationId}</span>
              )}
            </div>
          )}

          {structure && structure.sites.length > 0 && (
            <div className="dept-field">
              <label htmlFor="dept-site">{t("deptForm.site")}</label>
              <select id="dept-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">{t("deptForm.notAttached")}</option>
                {structure.sites.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
          )}

          {structure && structure.hasRegions && structure.regions.length > 0 && (
            <div className="dept-field">
              <label htmlFor="dept-region">{t("deptForm.region")}</label>
              <select id="dept-region" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
                <option value="">{t("deptForm.notAttached")}</option>
                {structure.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}

          <div className="dept-modal-footer">
            <button type="button" className="dept-btn-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="dept-btn-primary" disabled={isSubmitting}>
              {isSubmitting
                ? t("common.saving")
                : isEditMode
                ? t("common.save")
                : t("deptForm.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}