import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Claim } from '../../types/qualityAnalysis';
import { EmployeeRecommendationBanner } from '../../components/EmployeeRecommendationBanner';
import { useTranslation } from 'react-i18next';
import { useReferenceLists } from '../../hooks/useReferenceLists';

export interface AssignableUserOption {
  id: string;
  label: string;
  email?: string;
  department?: string;
  departmentId?: string;
}

interface ClaimEditModalProps {
  isOpen: boolean;
  formData: Partial<Claim>;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  /** When provided (Admin/SuperAdmin), shows the employee assignment dropdown. */
  assignableUsers?: AssignableUserOption[];
  canAssign?: boolean;
}

export const ClaimEditModal: React.FC<ClaimEditModalProps> = ({
  isOpen,
  formData,
  isSaving,
  saveError,
  onClose,
  onChange,
  onSubmit,
  assignableUsers = [],
  canAssign = false,
}) => {
  const { t } = useTranslation();
  const { defectTypes } = useReferenceLists();
  const recommendEmployees = useMemo(
    () =>
      assignableUsers.map((u) => ({
        employeeId: u.id,
        name: u.label,
        email: u.email,
        department: u.department,
        departmentId: u.departmentId,
      })),
    [assignableUsers]
  );

  const applyRecommendation = (employeeId: string) => {
    const user = assignableUsers.find((u) => u.id === employeeId);
    onChange({
      target: { name: 'assignedToId', value: employeeId },
    } as React.ChangeEvent<HTMLSelectElement>);
    if (user) {
      onChange({
        target: { name: 'assignedToName', value: user.label },
      } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pfe-modal-overlay" onClick={onClose}>
      <form className="pfe-modal-card" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <div className="pfe-modal-header">
          <h3>{t('claimEdit.title')}</h3>
          <button type="button" className="pfe-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {saveError && <div className="pfe-modal-error">{saveError}</div>}

        <div className="pfe-form-group">
          <label>{t('claimEdit.claimTitle')}</label>
          <input type="text" name="title" value={formData.title || ''} onChange={onChange} required />
        </div>

        <div className="pfe-form-row">
          <div className="pfe-form-group" style={{ marginBottom: 0 }}>
            <label>{t('claimDetail.clientId')}</label>
            <input type="text" name="clientId" value={formData.clientId || ''} onChange={onChange} />
          </div>
          <div className="pfe-form-group" style={{ marginBottom: 0 }}>
            <label>{t('claimDetail.defectType')}</label>
            <input type="text" name="defectType" list="reference-defect-types-edit" value={formData.defectType || ''} onChange={onChange} />
            <datalist id="reference-defect-types-edit">
              {defectTypes.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>
        </div>

        <div className="pfe-form-row">
          <div className="pfe-form-group" style={{ marginBottom: 0 }}>
            <label>{t('claimEdit.severity')}</label>
            <select name="severity" value={formData.severity || 'Medium'} onChange={onChange}>
              <option value="Low">{t('claimStatus.severityLow')}</option>
              <option value="Medium">{t('claimStatus.severityMedium')}</option>
              <option value="High">{t('claimStatus.severityHigh')}</option>
              <option value="Critical">{t('claimStatus.severityCritical')}</option>
            </select>
          </div>
          <div className="pfe-form-group" style={{ marginBottom: 0 }}>
            <label>{t('claimDetail.lotNumber')}</label>
            <input type="text" name="lotNumber" value={formData.lotNumber || ''} onChange={onChange} />
          </div>
        </div>

        <div className="pfe-form-group">
          <label>{t('claimDetail.serialNumber')}</label>
          <input type="text" name="serialNumber" value={formData.serialNumber || ''} onChange={onChange} />
        </div>

        <div className="pfe-form-group">
          <label>{t('claimDetail.description')}</label>
          <textarea name="description" rows={3} value={formData.description || ''} onChange={onChange} />
        </div>

        {canAssign && (
          <div className="pfe-form-group">
            <label>{t('claimDetail.assignedTo')}</label>
            <EmployeeRecommendationBanner
              defectType={formData.defectType}
              severity={formData.severity}
              employees={recommendEmployees}
              requireDepartment={false}
              onAssign={applyRecommendation}
            />
            <select
              name="assignedToId"
              value={formData.assignedToId || ''}
              onChange={onChange}
            >
              <option value="">{t('claimDetail.unassigned')}</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="pfe-modal-actions">
          <button type="button" className="pfe-btn-cancel" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="pfe-btn-save" disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
