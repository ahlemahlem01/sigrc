import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { Claim, UpdateClaimCommand } from '../../types/qualityAnalysis';
import {
  Search,
  AlertCircle,
  ShieldAlert,
  Pencil,
  Info,
  ListChecks,
  ArrowLeft,
  X,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { ClaimListFilters } from '../../components/ClaimListFilters';
import {
  claimMatchesDateRange,
  DEFAULT_CLAIM_DATE_SORT,
  sortClaimsByDate,
} from '../../utils/claimDateSort';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { defectLabel, defectValueFromInput } from '../../utils/defectLabel';

// Fields considered when scoring how "ready" a draft claim is (labels are i18n keys).
const READINESS_FIELDS: { label: string; getValue: (c: any) => any }[] = [
  { label: 'drafts.fieldTitle', getValue: (c) => c.title },
  { label: 'drafts.fieldClient', getValue: (c) => c.clientId || c.client_id },
  { label: 'claimDetail.defectType', getValue: (c) => c.defectType || c.defect_type },
  { label: 'claimEdit.severity', getValue: (c) => c.severity },
  { label: 'drafts.fieldLot', getValue: (c) => c.lotNumber || c.lot_number },
  { label: 'drafts.fieldSerial', getValue: (c) => c.serialNumber || c.serial_number },
  { label: 'claimDetail.description', getValue: (c) => c.description },
];

function getFieldReadiness(claim: any) {
  const missing: string[] = [];
  let filled = 0;
  READINESS_FIELDS.forEach((field) => {
    const value = field.getValue(claim);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      filled += 1;
    } else {
      missing.push(field.label);
    }
  });
  const total = READINESS_FIELDS.length;
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  return { filled, total, percent, missing };
}

/** Draft readiness = form fields only. 5 Why / Ishikawa belong to analysis after submission. */
function getClaimReadiness(claim: any) {
  const fields = getFieldReadiness(claim);
  return {
    filled: fields.filled,
    total: fields.total,
    percent: fields.percent,
    missing: fields.missing.map((label) => ({ label })),
    fields,
  };
}

export const DraftClaimsPage: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editFormData, setEditFormData] = useState<Partial<Claim>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Submit-for-validation modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    if (isAuthLoading) return;
    if (!accessToken) {
      setError(i18n.t('createClaim.sessionExpired'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await qualityAnalysisService.getClaims('DRAFT', accessToken);
      const claimsData = data || [];
      setClaims(claimsData);
    } catch (err: any) {
      setError(err.response?.data?.message || i18n.t('drafts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthLoading]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Only claims whose workflow StatusCode is DRAFT belong here.
  // Do not use 5-Why draft status — that is a separate analysis state.
  const draftClaims = useMemo(
    () =>
      claims.filter((claim) => {
        const code = String(
          (claim as any).statusCode ?? (claim as any).status ?? (claim as any).StatusCode ?? ''
        )
          .trim()
          .toUpperCase();
        return code === 'DRAFT' || code.includes('BROUILLON');
      }),
    [claims]
  );

  const filteredClaims = useMemo(() => {
    const filtered = draftClaims.filter(claim => {
      const search = searchTerm.toLowerCase();
      const title = claim.title?.toLowerCase() || '';
      const client = (claim.clientId || (claim as any).client_id)?.toLowerCase() || '';
      const defect = (claim.defectType || (claim as any).defect_type)?.toLowerCase() || '';

      return (title.includes(search) || client.includes(search) || defect.includes(search)) &&
             (severityFilter === 'ALL' || claim.severity?.toUpperCase() === severityFilter) &&
             claimMatchesDateRange(claim, dateFrom, dateTo);
    });
    return sortClaimsByDate(filtered, DEFAULT_CLAIM_DATE_SORT);
  }, [draftClaims, searchTerm, severityFilter, dateFrom, dateTo]);

  // Buckets the filtered list into readiness-based sections so drafts that
  // are close to submittable stand out from ones that were barely started.
  const claimGroups = useMemo(() => {
    const groups: { key: string; label: string; claims: Claim[] }[] = [
      { key: 'READY', label: 'drafts.groupReady', claims: [] },
      { key: 'ALMOST_READY', label: 'drafts.groupAlmost', claims: [] },
      { key: 'JUST_STARTED', label: 'drafts.toComplete', claims: [] },
    ];

    filteredClaims.forEach((claim) => {
      const { percent } = getClaimReadiness(claim);
      if (percent === 100) {
        groups[0].claims.push(claim);
      } else if (percent >= 50) {
        groups[1].claims.push(claim);
      } else {
        groups[2].claims.push(claim);
      }
    });

    return groups.filter((g) => g.claims.length > 0);
  }, [filteredClaims]);

  // Auto-select the first claim once the filtered list loads, without
  // stomping on a selection the user already made.
  useEffect(() => {
    if (selectedClaimId === null && filteredClaims.length > 0) {
      setSelectedClaimId(filteredClaims[0].id);
    }
  }, [filteredClaims, selectedClaimId]);

  const selectedClaim = useMemo(() => {
    if (!selectedClaimId) return filteredClaims[0] || null;
    return draftClaims.find(c => c.id === selectedClaimId) || filteredClaims[0] || null;
  }, [draftClaims, selectedClaimId, filteredClaims]);

  const selectedReadiness = useMemo(
    () => (selectedClaim ? getClaimReadiness(selectedClaim) : null),
    [selectedClaim]
  );

  const isSelectedClaimReady = selectedReadiness?.percent === 100;

  // ---- Edit Modal Handlers ----

  const handleOpenEditModal = useCallback(() => {
    if (!selectedClaim) return;
    setSaveError(null);
    setEditFormData({
      id: selectedClaim.id,
      title: selectedClaim.title || '',
      clientId: selectedClaim.clientId || (selectedClaim as any).client_id || '',
      defectType: selectedClaim.defectType || (selectedClaim as any).defect_type || '',
      severity: selectedClaim.severity || 'Medium',
      lotNumber: selectedClaim.lotNumber || (selectedClaim as any).lot_number || '',
      serialNumber: selectedClaim.serialNumber || (selectedClaim as any).serial_number || '',
      description: selectedClaim.description || '',
    });
    setIsEditModalOpen(true);
  }, [selectedClaim]);

  const handleCloseEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setSaveError(null);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEditFormData(prev => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleSaveClaim = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedClaim?.id || !accessToken) return;

      setIsSaving(true);
      setSaveError(null);
      try {
        const command: UpdateClaimCommand = {
          id: selectedClaim.id,
          title: editFormData.title,
          clientId: editFormData.clientId,
          defectType: editFormData.defectType,
          severity: editFormData.severity,
          lotNumber: editFormData.lotNumber,
          serialNumber: editFormData.serialNumber,
          description: editFormData.description,
          updatedById: (selectedClaim as any).createdById || '00000000-0000-0000-0000-000000000000',
        };

        const updateFn = (qualityAnalysisService as any).updateClaim;
        if (typeof updateFn === 'function') {
          await updateFn(selectedClaim.id, command, accessToken);
        }

        const updatedClaim = { ...selectedClaim, ...editFormData } as Claim;
        setClaims(prev => prev.map(c => (c.id === updatedClaim.id ? updatedClaim : c)));
        setSelectedClaimId(updatedClaim.id);

        setIsEditModalOpen(false);
      } catch (err: any) {
        setSaveError(err?.response?.data?.message || i18n.t('drafts.updateFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [selectedClaim, editFormData, accessToken]
  );

  // ---- Submit-for-Validation Handlers ----

  const handleOpenSubmitModal = useCallback(() => {
    if (!selectedClaim) return;
    setSubmitError(null);
    setIsSubmitModalOpen(true);
  }, [selectedClaim]);

  const handleCloseSubmitModal = useCallback(() => {
    if (isSubmitting) return;
    setIsSubmitModalOpen(false);
    setSubmitError(null);
  }, [isSubmitting]);

  const handleConfirmSubmit = useCallback(async () => {
    if (!selectedClaim?.id || !accessToken) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      // NOTE: UpdateClaimCommand doesn't declare a status field today.
      // Sending `statusCode` alongside it as a pragmatic bridge until the
      // backend exposes a dedicated submit endpoint (e.g. POST /claims/{id}/submit).
      const command: UpdateClaimCommand & { statusCode?: string } = {
        id: selectedClaim.id,
        updatedById: (selectedClaim as any).createdById || '00000000-0000-0000-0000-000000000000',
        statusCode: 'PENDING_VALIDATION',
      };

      const submitFn = (qualityAnalysisService as any).submitClaim;
      const updateFn = (qualityAnalysisService as any).updateClaim;

      if (typeof submitFn === 'function') {
        await submitFn(selectedClaim.id, accessToken);
      } else if (typeof updateFn === 'function') {
        await updateFn(selectedClaim.id, command, accessToken);
      }

      const updatedClaim = { ...selectedClaim, statusCode: 'PENDING_VALIDATION' } as Claim;
      setClaims(prev => prev.map(c => (c.id === updatedClaim.id ? updatedClaim : c)));

      setIsSubmitModalOpen(false);
      // The claim now resolves as PENDING_VALIDATION, so it drops out of the
      // draft list automatically on next render — select the next draft, if any.
      setSelectedClaimId(null);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || i18n.t('drafts.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedClaim, accessToken]);

  return (
    <div className="pfe-container">
      <style>{`
        .pfe-container {
          display: flex;
          flex-direction: column;
          height: calc(100dvh - 56px);
          max-width: 1650px;
          margin: 0 auto;
          padding: 12px 20px;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #0f172a;
          overflow: hidden;
          background: #f8fafc;
        }

        .pfe-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          margin-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .pfe-title-box {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .pfe-header h1 {
          font-size: 18px;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
          color: #0f2b5c;
        }
        .pfe-header p {
          margin: 1px 0 0 0;
          font-size: 11.5px;
          color: #64748b;
          font-weight: 500;
        }

        .pfe-header-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pfe-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          color: #334155;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 600;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .pfe-btn-secondary:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .pfe-btn-edit {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0f2b5c;
          color: #ffffff;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .pfe-btn-edit:hover {
          background: #1e40af;
          transform: translateY(-1px);
        }

        .pfe-btn-edit-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: #ffffff;
          color: #475569;
          padding: 7px 10px;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 600;
          border: 1px solid #e2e8f0;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .pfe-btn-edit-icon:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .pfe-btn-submit {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #16a34a;
          color: #ffffff;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
        }
        .pfe-btn-submit:hover {
          background: #15803d;
          transform: translateY(-1px);
        }

        .pfe-workspace {
          display: flex;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }

        .pfe-sidebar {
          width: 360px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.02);
          overflow: hidden;
        }

        .pfe-filter-pane {
          padding: 10px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }
        .pfe-search-input {
          position: relative;
        }
        .pfe-search-input input {
          width: 100%;
          box-sizing: border-box;
          padding: 7px 10px 7px 32px;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          font-size: 12px;
          outline: none;
          background: #f8fafc;
          transition: all 0.15s ease;
        }
        .pfe-search-input input:focus {
          background: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
        .pfe-search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        .pfe-select-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .pfe-select-group select {
          flex: 1 1 120px;
          min-width: 0;
          padding: 5px 8px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 11.5px;
          background: #f8fafc;
          color: #334155;
          font-weight: 500;
          outline: none;
          cursor: pointer;
        }

        .pfe-list-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .pfe-list-group-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 8px 4px 2px;
        }
        .pfe-list-group-label:first-child {
          padding-top: 2px;
        }

        .pfe-card-item {
          position: relative;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #f1f5f9;
          background: #ffffff;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pfe-card-item:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .pfe-card-item.active {
          background: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
        }
        .pfe-card-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 10px;
          bottom: 10px;
          width: 3.5px;
          border-radius: 0 3px 3px 0;
          background: #2563eb;
        }
        .pfe-card-item.draft-item {
          border-style: dashed;
        }
        .pfe-card-item.ready-item {
          border-style: solid;
        }
        .pfe-card-item.ready-item.active::before {
          background: #16a34a;
        }

        .pfe-item-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pfe-item-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #64748b;
        }
        .pfe-readiness-pill {
          font-size: 10px;
          font-weight: 700;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .pfe-readiness-pill.ready {
          color: #16a34a;
          background: #f0fdf4;
        }

        .pfe-detail-pane {
          flex: 1;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.02);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .pfe-pane-header {
          padding: 16px 20px;
          border-bottom: 1px solid #f1f5f9;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-shrink: 0;
          gap: 12px;
        }
        .pfe-pane-header h2 {
          font-size: 18px;
          font-weight: 800;
          margin: 0 0 4px 0;
          color: #0f2b5c;
          letter-spacing: -0.01em;
        }
        .pfe-ref-pill {
          font-size: 10.5px;
          font-family: 'JetBrains Mono', SFMono-Regular, monospace;
          color: #475569;
          background: #e2e8f0;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }

        .pfe-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .pfe-pane-content {
          flex: 1;
          overflow-y: auto;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .pfe-pane-content::-webkit-scrollbar {
          display: none;
        }

        .pfe-chip-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          line-height: 1;
          margin-bottom: 2px;
        }

        .pfe-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #94a3b8;
          gap: 6px;
          font-size: 13px;
        }

        /* ---- Muted / paused draft detail pane ---- */
        .pfe-draft-pane {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .pfe-draft-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }
        .pfe-draft-banner.ready-banner {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #15803d;
        }
        .pfe-draft-summary {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 10px;
          padding: 16px;
        }
        .pfe-draft-summary.ready-summary {
          background: #f8fdfa;
          border: 1px solid #bbf7d0;
        }
        .pfe-draft-summary-top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 4px;
        }
        .pfe-draft-summary-meta {
          font-size: 12px;
          color: #94a3b8;
          margin: 0 0 14px 0;
        }
        .pfe-progress-track {
          height: 5px;
          background: #e2e8f0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 6px;
        }
        .pfe-progress-fill {
          height: 100%;
          background: #94a3b8;
          border-radius: 3px;
          transition: width 0.2s ease;
        }
        .pfe-progress-fill.ready-fill {
          background: #16a34a;
        }
        .pfe-progress-label {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          margin: 0 0 14px 0;
        }
        .pfe-missing-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }
        .pfe-missing-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 16px;
        }
        .pfe-missing-chip {
          font-size: 11px;
          color: #94a3b8;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 3px 9px;
        }
        .pfe-missing-chip.pfe-missing-none {
          color: #16a34a;
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .pfe-missing-chip.pfe-missing-actionable {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #1e40af;
          border-color: #bfdbfe;
          background: #eff6ff;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pfe-missing-chip.pfe-missing-actionable:hover {
          background: #dbeafe;
          border-color: #93c5fd;
        }

        .pfe-workflow-header {
          font-size: 10.5px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }
        .pfe-workflow-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .pfe-workflow-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pfe-workflow-card.done {
          border-color: #bbf7d0;
          background: #f8fdfa;
        }
        .pfe-workflow-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .pfe-workflow-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #eff6ff;
          color: #1e40af;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pfe-workflow-card.done .pfe-workflow-icon {
          background: #dcfce7;
          color: #16a34a;
        }
        .pfe-workflow-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          background: #f1f5f9;
          padding: 2px 7px;
          border-radius: 10px;
        }
        .pfe-workflow-status.done {
          color: #16a34a;
          background: #dcfce7;
        }
        .pfe-workflow-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 2px;
        }
        .pfe-workflow-desc {
          font-size: 11px;
          color: #64748b;
          margin: 0;
          line-height: 1.4;
          flex: 1;
        }
        .pfe-workflow-open {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 4px;
          padding: 7px 10px;
          background: #0f2b5c;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pfe-workflow-open:hover {
          background: #1e40af;
        }
        .pfe-workflow-card.done .pfe-workflow-open {
          background: #16a34a;
        }
        .pfe-workflow-card.done .pfe-workflow-open:hover {
          background: #15803d;
        }

        .pfe-summary-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .pfe-btn-continue {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          box-sizing: border-box;
          padding: 9px 14px;
          background: #ffffff;
          color: #334155;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pfe-btn-continue:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .pfe-btn-continue.secondary-outline {
          flex: 0 0 auto;
          padding: 9px 12px;
        }
        .pfe-btn-continue:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          background: #f8fafc;
        }
        .pfe-btn-continue:disabled:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }

        .pfe-btn-submit-full {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          box-sizing: border-box;
          padding: 9px 14px;
          background: #16a34a;
          color: #ffffff;
          border: none;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 4px 10px rgba(22, 163, 74, 0.25);
        }
        .pfe-btn-submit-full:hover {
          background: #15803d;
          transform: translateY(-1px);
        }

        .pfe-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.35);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .pfe-modal-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 24px;
          width: 520px;
          max-width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        .pfe-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .pfe-modal-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0f2b5c;
        }
        .pfe-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #64748b;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
        }
        .pfe-modal-close:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .pfe-form-group {
          margin-bottom: 12px;
        }
        .pfe-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .pfe-form-group label {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
          color: #475569;
          margin-bottom: 4px;
        }
        .pfe-form-group input,
        .pfe-form-group select,
        .pfe-form-group textarea {
          width: 100%;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          font-size: 12.5px;
          box-sizing: border-box;
          font-family: inherit;
          outline: none;
        }
        .pfe-form-group input:focus,
        .pfe-form-group select:focus,
        .pfe-form-group textarea:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }
        .pfe-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 16px;
        }
        .pfe-btn-cancel {
          padding: 8px 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 600;
          color: #334155;
        }
        .pfe-btn-save {
          padding: 8px 14px;
          background: #0f2b5c;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 700;
        }
        .pfe-btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .pfe-btn-confirm-submit {
          padding: 8px 14px;
          background: #16a34a;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12.5px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .pfe-btn-confirm-submit:hover {
          background: #15803d;
        }
        .pfe-btn-confirm-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .pfe-modal-error {
          padding: 8px 12px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #e11d48;
          border-radius: 6px;
          font-size: 12px;
          margin-bottom: 12px;
        }

        .pfe-submit-preview {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .pfe-submit-preview-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          padding: 6px 0;
          border-bottom: 1px solid #f1f5f9;
          font-size: 12.5px;
        }
        .pfe-submit-preview-row:last-child {
          border-bottom: none;
        }
        .pfe-submit-preview-label {
          color: #64748b;
          font-weight: 600;
          flex-shrink: 0;
        }
        .pfe-submit-preview-value {
          color: #0f172a;
          font-weight: 600;
          text-align: right;
          overflow-wrap: anywhere;
        }
        .pfe-submit-preview-desc {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #f1f5f9;
          font-size: 12px;
          color: #334155;
          line-height: 1.5;
        }
        .pfe-submit-warning {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #92400e;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 8px;
          padding: 9px 12px;
          margin-bottom: 14px;
        }
      `}</style>

      {/* HEADER SECTION */}
      <div className="pfe-header">
        <div className="pfe-title-box">
          <div>
            <h1>{t('drafts.title')}</h1>
            <p>{t('drafts.subtitle')}</p>
          </div>
        </div>
        <div className="pfe-header-buttons">
          <button className="pfe-btn-secondary" onClick={() => navigate('/pages/front/quality-analyses')}>
            <ArrowLeft size={15} /> {t('drafts.backToClaims')}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fff1f2', border: '1px solid #fecdd3', color: '#e11d48', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* WORKSPACE SPLIT */}
      <div className="pfe-workspace">

        {/* LEFT SIDEBAR */}
        <div className="pfe-sidebar">
          <div className="pfe-filter-pane">
            <div className="pfe-search-input">
              <Search className="pfe-search-icon" size={14} />
              <input
                type="text"
                placeholder={t('drafts.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <ClaimListFilters
              severityFilter={severityFilter}
              onSeverityChange={setSeverityFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          </div>

          <div className="pfe-list-scroll">
            {loading ? (
              <ListSkeleton rows={8} />
            ) : filteredClaims.length === 0 ? (
              <div className="pfe-empty">
                <ShieldAlert size={24} />
                <span>{t('drafts.empty')}</span>
              </div>
            ) : (
              claimGroups.map((group) => (
                <React.Fragment key={group.key}>
                  {claimGroups.length > 1 && (
                    <div className="pfe-list-group-label">{t(group.label)}</div>
                  )}
                  {group.claims.map((claim) => {
                    const isSelected = selectedClaim?.id === claim.id;
                    const clientVal = claim.clientId || (claim as any).client_id || t('drafts.clientNone');
                    const readiness = getClaimReadiness(claim);
                    const isReady = readiness.percent === 100;

                    return (
                      <div
                        key={claim.id}
                        className={`pfe-card-item draft-item ${isReady ? 'ready-item' : ''} ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedClaimId(claim.id)}
                      >
                        <div className="pfe-item-title">{claim.title || t('drafts.untitled')}</div>
                        <div className="pfe-item-meta">
                          <span>{clientVal}</span>
                          <span className={`pfe-readiness-pill ${isReady ? 'ready' : ''}`}>
                            {isReady ? t('drafts.ready') : `${readiness.percent}%`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </div>
        </div>

        {/* RIGHT DETAIL PANEL */}
        <div className="pfe-detail-pane">
          {selectedClaim && selectedReadiness ? (
            <>
              <div className="pfe-pane-header">
                <div>
                  <h2>{selectedClaim.title || t('drafts.untitled')}</h2>
                  <span className="pfe-ref-pill">REF-ID: {selectedClaim.id}</span>
                </div>
                <div className="pfe-header-actions">
                  {isSelectedClaimReady ? (
                    <>
                      <button className="pfe-btn-edit-icon" onClick={handleOpenEditModal} title={t('common.edit')}>
                        <Pencil size={13} />
                      </button>
                      <button className="pfe-btn-submit" onClick={handleOpenSubmitModal}>
                        <Send size={13} /> {t('drafts.submit')}
                      </button>
                    </>
                  ) : (
                    <button className="pfe-btn-edit" onClick={handleOpenEditModal}>
                      <Pencil size={13} /> {t('common.edit')}
                    </button>
                  )}
                </div>
              </div>

              <div className="pfe-pane-content">
                <div className="pfe-draft-pane">
                  <div className={`pfe-draft-banner ${isSelectedClaimReady ? 'ready-banner' : ''}`}>
                    {isSelectedClaimReady ? <CheckCircle2 size={14} /> : <Info size={14} />}
                    <span>
                      {isSelectedClaimReady
                        ? t('drafts.bannerReady')
                        : t('drafts.bannerIncomplete')}
                    </span>
                  </div>

                  <div className={`pfe-draft-summary ${isSelectedClaimReady ? 'ready-summary' : ''}`}>
                    <div className="pfe-draft-summary-top">
                      <span className="pfe-chip-label" style={{ margin: 0 }}>{t('drafts.completeness')}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isSelectedClaimReady ? '#16a34a' : '#64748b' }}>
                        {selectedReadiness.percent}%
                      </span>
                    </div>
                    <p className="pfe-draft-summary-meta">
                      {[
                        t('drafts.metaClient', { client: selectedClaim.clientId || (selectedClaim as any).client_id || '—' }),
                        selectedClaim.severity || t('drafts.noSeverity'),
                        t('drafts.metaCreated', { date: selectedClaim.createdAt ? new Date(selectedClaim.createdAt).toLocaleDateString(dateLocale()) : '—' }),
                      ].join(' · ')}
                    </p>

                    <div className="pfe-progress-track">
                      <div
                        className={`pfe-progress-fill ${isSelectedClaimReady ? 'ready-fill' : ''}`}
                        style={{ width: `${selectedReadiness.percent}%` }}
                      />
                    </div>
                    <p className="pfe-progress-label">
                      {t('drafts.fieldsFilled', { filled: selectedReadiness.filled, total: selectedReadiness.total })}
                    </p>

                    <div className="pfe-missing-header">
                      <ListChecks size={13} style={{ color: '#94a3b8' }} />
                      <span>{t('drafts.toComplete')}</span>
                    </div>
                    <div className="pfe-missing-chips">
                      {selectedReadiness.missing.length > 0 ? (
                        selectedReadiness.missing.map((item) => (
                          <span key={item.label} className="pfe-missing-chip">{t(item.label)}</span>
                        ))
                      ) : (
                        <span className="pfe-missing-chip pfe-missing-none">{t('drafts.allFilled')}</span>
                      )}
                    </div>

                    <div className="pfe-summary-actions">
                      {isSelectedClaimReady ? (
                        <>
                          <button className="pfe-btn-submit-full" onClick={handleOpenSubmitModal}>
                            <Send size={13} /> {t('drafts.submitClaim')}
                          </button>
                          <button
                            className="pfe-btn-continue secondary-outline"
                            onClick={handleOpenEditModal}
                            title={t('common.edit')}
                          >
                            <Pencil size={13} />
                          </button>
                        </>
                      ) : (
                        <button className="pfe-btn-continue" onClick={handleOpenEditModal}>
                          <Pencil size={13} /> {t('drafts.continueEditing')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="pfe-empty">
              <ShieldAlert size={32} />
              <span>{loading ? t('drafts.loading') : t('drafts.selectPrompt')}</span>
            </div>
          )}
        </div>

      </div>

      {/* EDIT CLAIM MODAL */}
      {isEditModalOpen && (
        <div className="pfe-modal-overlay" onClick={handleCloseEditModal}>
          <form
            className="pfe-modal-card"
            onSubmit={handleSaveClaim}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pfe-modal-header">
              <h3>{t('claimEdit.title')}</h3>
              <button type="button" className="pfe-modal-close" onClick={handleCloseEditModal}>
                <X size={16} />
              </button>
            </div>

            {saveError && <div className="pfe-modal-error">{saveError}</div>}

            <div className="pfe-form-group">
              <label>{t('claimEdit.claimTitle')}</label>
              <input
                type="text"
                name="title"
                value={editFormData.title || ''}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="pfe-form-row">
              <div className="pfe-form-group" style={{ marginBottom: 0 }}>
                <label>{t('claimDetail.clientId')}</label>
                <input type="text" name="clientId" value={editFormData.clientId || ''} onChange={handleInputChange} />
              </div>
              <div className="pfe-form-group" style={{ marginBottom: 0 }}>
                <label>{t('claimDetail.defectType')}</label>
                <input type="text" name="defectType" value={defectLabel(editFormData.defectType)} onChange={(e) => { e.target.value = defectValueFromInput(e.target.value); handleInputChange(e); }} />
              </div>
            </div>

            <div className="pfe-form-row">
              <div className="pfe-form-group" style={{ marginBottom: 0 }}>
                <label>{t('claimEdit.severity')}</label>
                <select name="severity" value={editFormData.severity || 'Medium'} onChange={handleInputChange}>
                  <option value="Low">{t('claimStatus.severityLow')}</option>
                  <option value="Medium">{t('claimStatus.severityMedium')}</option>
                  <option value="High">{t('claimStatus.severityHigh')}</option>
                  <option value="Critical">{t('claimStatus.severityCritical')}</option>
                </select>
              </div>
              <div className="pfe-form-group" style={{ marginBottom: 0 }}>
                <label>{t('claimDetail.lotNumber')}</label>
                <input type="text" name="lotNumber" value={editFormData.lotNumber || ''} onChange={handleInputChange} />
              </div>
            </div>

            <div className="pfe-form-group">
              <label>{t('claimDetail.serialNumber')}</label>
              <input type="text" name="serialNumber" value={editFormData.serialNumber || ''} onChange={handleInputChange} />
            </div>

            <div className="pfe-form-group">
              <label>{t('claimDetail.description')}</label>
              <textarea name="description" rows={3} value={editFormData.description || ''} onChange={handleInputChange} />
            </div>

            <div className="pfe-modal-actions">
              <button type="button" className="pfe-btn-cancel" onClick={handleCloseEditModal}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="pfe-btn-save" disabled={isSaving}>
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBMIT FOR VALIDATION MODAL */}
      {isSubmitModalOpen && selectedClaim && selectedReadiness && (
        <div className="pfe-modal-overlay" onClick={handleCloseSubmitModal}>
          <div className="pfe-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pfe-modal-header">
              <h3>{t('drafts.submitClaim')}</h3>
              <button type="button" className="pfe-modal-close" onClick={handleCloseSubmitModal}>
                <X size={16} />
              </button>
            </div>

            {submitError && <div className="pfe-modal-error">{submitError}</div>}

            <div className="pfe-submit-warning">
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {t('drafts.submitWarningBefore')} <strong>{t('drafts.submitWarningStrong')}</strong> {t('drafts.submitWarningAfter')}
              </span>
            </div>

            <div className="pfe-submit-preview">
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('drafts.fieldTitle')}</span>
                <span className="pfe-submit-preview-value">{selectedClaim.title || t('drafts.untitled')}</span>
              </div>
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('drafts.fieldClient')}</span>
                <span className="pfe-submit-preview-value">
                  {selectedClaim.clientId || (selectedClaim as any).client_id || '—'}
                </span>
              </div>
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('claimDetail.defectType')}</span>
                <span className="pfe-submit-preview-value">
                  {defectLabel(selectedClaim.defectType || (selectedClaim as any).defect_type) || '—'}
                </span>
              </div>
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('claimEdit.severity')}</span>
                <span className="pfe-submit-preview-value">{selectedClaim.severity || '—'}</span>
              </div>
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('drafts.fieldLot')}</span>
                <span className="pfe-submit-preview-value">
                  {selectedClaim.lotNumber || (selectedClaim as any).lot_number || '—'}
                </span>
              </div>
              <div className="pfe-submit-preview-row">
                <span className="pfe-submit-preview-label">{t('drafts.fieldSerial')}</span>
                <span className="pfe-submit-preview-value">
                  {selectedClaim.serialNumber || (selectedClaim as any).serial_number || '—'}
                </span>
              </div>
              {selectedClaim.description && (
                <div className="pfe-submit-preview-desc">{selectedClaim.description}</div>
              )}
            </div>

            <div className="pfe-modal-actions">
              <button type="button" className="pfe-btn-cancel" onClick={handleCloseSubmitModal} disabled={isSubmitting}>
                {t('common.back')}
              </button>
              <button
                type="button"
                className="pfe-btn-confirm-submit"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
              >
                <Send size={13} /> {isSubmitting ? t('drafts.submitting') : t('drafts.confirmSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftClaimsPage;