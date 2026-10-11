import { useEffect, useState } from "react";
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
  const isEditMode = Boolean(department);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (department) {
      setName(department.name);
      setCode(department.code);
      setDescription(department.description ?? "");
      setOrganizationId(department.organizationId);
    } else {
      setName("");
      setCode("");
      setDescription("");
      setOrganizationId(defaultOrganizationId ?? "");
    }
    setErrors({});
  }, [isOpen, department, defaultOrganizationId]);

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
      });
      onClose();
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
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
                onChange={(e) => setOrganizationId(e.target.value)}
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