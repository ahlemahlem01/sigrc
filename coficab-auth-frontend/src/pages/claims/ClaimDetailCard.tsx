import React, { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Hash,
  Barcode,
  AlignLeft,
  UserCheck,
  Pencil,
  Tag,
  GitFork,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { Claim } from '../../types/qualityAnalysis';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { resolveClaimStatus, getStatusBadge } from '../../utils/Claimutils';
import { InvestigationWorkflows } from './InvestigationWorkflows';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { defectLabel } from '../../utils/defectLabel';

interface ClaimDetailCardProps {
  claim: Claim | null;
  loading: boolean;
  resolveCreatorName: (claim: any) => string;
  onEdit: () => void;
  onOpenStartAnalysisModal?: () => void;
  /** Admin/SuperAdmin can edit + reassign; employees typically only analyse. */
  canEdit?: boolean;
  onApplySuggestedDeadline?: (claimId: string, deadlineIso: string) => Promise<void> | void;
  applyingDeadline?: boolean;
}

const formatClaimDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(dateLocale());
};

const formatEstimateDays = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const estimateMethodLabel = (method?: string | null) => {
  switch ((method || '').toLowerCase()) {
    case 'type_severity':
      return i18n.t('claimDetail.methodTypeSeverity');
    case 'severity':
      return i18n.t('claimDetail.methodSeverity');
    case 'global':
      return i18n.t('claimDetail.methodGlobal');
    default:
      return method || i18n.t('claimDetail.methodHistory');
  }
};

const pickNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

/** Suggested deadline = creation date + ceil(P80) calendar days. */
export const suggestedDeadlineFromEstimate = (
  createdAt?: string | null,
  daysP80?: number | null
): Date | null => {
  if (!createdAt || daysP80 == null || !Number.isFinite(Number(daysP80))) return null;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const days = Math.max(0, Math.ceil(Number(daysP80)));
  const suggested = new Date(
    Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate())
  );
  suggested.setUTCDate(suggested.getUTCDate() + days);
  return suggested;
};

export const ClaimDetailCard: React.FC<ClaimDetailCardProps> = ({
  claim,
  loading,
  resolveCreatorName,
  onEdit,
  onOpenStartAnalysisModal,
  canEdit = true,
  onApplySuggestedDeadline,
  applyingDeadline = false,
}) => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [liveEstimate, setLiveEstimate] = useState<{
    daysP50: number;
    daysP80: number;
    sampleSize: number;
    method: string;
  } | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const storedP50 = claim
    ? pickNumber(claim.estimatedDaysP50, (claim as any).EstimatedDaysP50)
    : null;
  const storedP80 = claim
    ? pickNumber(claim.estimatedDaysP80, (claim as any).EstimatedDaysP80)
    : null;
  const storedSample = claim
    ? pickNumber(claim.estimateSampleSize, (claim as any).EstimateSampleSize)
    : null;
  const storedMethod = claim
    ? pickString(claim.estimateMethod, (claim as any).EstimateMethod)
    : null;

  useEffect(() => {
    setLiveEstimate(null);
    if (!claim) return;
    if (storedP50 != null && storedP80 != null) return;

    const defect = pickString(claim.defectType, (claim as any).DefectType);
    const severity = pickString(claim.severity, (claim as any).Severity);
    if (!defect || !severity) return;

    let cancelled = false;
    setEstimateLoading(true);
    qualityAnalysisService
      .estimateClaimResolution(defect, severity, accessToken || undefined)
      .then((res) => {
        if (cancelled || !res?.available || res.daysP50 == null || res.daysP80 == null) return;
        setLiveEstimate({
          daysP50: Number(res.daysP50),
          daysP80: Number(res.daysP80),
          sampleSize: Number(res.sampleSize ?? 0),
          method: String(res.method || 'global'),
        });
      })
      .catch(() => {
        if (!cancelled) setLiveEstimate(null);
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [claim?.id, storedP50, storedP80, claim?.defectType, claim?.severity, accessToken]);

  if (!claim) {
    return (
      <div className="pfe-detail-pane">
        <div className="pfe-empty">
          <ShieldAlert size={32} />
          <span>{loading ? t('claimDetail.loading') : t('claimDetail.selectPrompt')}</span>
        </div>
      </div>
    );
  }

  const currentStatus = resolveClaimStatus(claim);
  const sta = getStatusBadge(currentStatus);
  const StatusIcon = sta.icon;
  const canStartAnalysis = currentStatus === 'OUVERTE' || currentStatus === 'ASSIGNED';
  const isAnalysisLocked = canStartAnalysis;
  const assigneeLabel = (() => {
    const name = claim.assignedToName || (claim as any).assigned_to_name;
    if (name && !/^[0-9a-f-]{8,}$/i.test(String(name))) return String(name);
    return claim.assignedToId ? t('claimDetail.unassigned') : null;
  })();
  const completedAtLabel = formatClaimDate(claim.completedAt || (claim as any).CompletedAt);
  const deadlineLabel = formatClaimDate(claim.deadline || (claim as any).Deadline);
  const isOnTime = claim.isOnTime ?? (claim as any).IsOnTime ?? null;
  const showClosure = Boolean(completedAtLabel) || currentStatus === 'CLOTUREE';

  const daysP50 = storedP50 ?? liveEstimate?.daysP50 ?? null;
  const daysP80 = storedP80 ?? liveEstimate?.daysP80 ?? null;
  const sampleSize = storedSample ?? liveEstimate?.sampleSize ?? null;
  const method = storedMethod ?? liveEstimate?.method ?? null;
  const hasEstimate = daysP50 != null && daysP80 != null;
  const suggestedDeadline = suggestedDeadlineFromEstimate(
    claim.createdAt || (claim as any).CreatedAt,
    daysP80
  );
  const suggestedDeadlineLabel = suggestedDeadline
    ? suggestedDeadline.toLocaleDateString(dateLocale())
    : null;
  const suggestedDeadlineIso = suggestedDeadline ? suggestedDeadline.toISOString() : null;
  const currentDeadlineIso = claim.deadline || (claim as any).Deadline || null;
  const deadlineAlreadyApplied =
    Boolean(currentDeadlineIso) &&
    Boolean(suggestedDeadlineIso) &&
    new Date(currentDeadlineIso as string).toDateString() ===
      new Date(suggestedDeadlineIso as string).toDateString();
  const canApplyDeadline =
    Boolean(onApplySuggestedDeadline) &&
    Boolean(suggestedDeadlineIso) &&
    !deadlineAlreadyApplied &&
    currentStatus !== 'CLOTUREE';

  return (
    <div className="pfe-detail-pane">
      <div className="pfe-pane-header">
        <div>
          <h2>{claim.title}</h2>
          <span className="pfe-ref-pill">REF-ID: {claim.id}</span>
        </div>
        <div className="pfe-header-actions">
          <span
            className="pfe-badge"
            style={{ background: sta.bg, color: sta.color, border: `1px solid ${sta.border}`, padding: '5px 10px' }}
          >
            <StatusIcon size={13} /> {sta.label}
          </span>

          {canStartAnalysis && (
            <button type="button" className="pfe-btn-primary" onClick={onOpenStartAnalysisModal}>
              <GitFork size={13} /> {t('claimDetail.startAnalysis')}
            </button>
          )}

          {canEdit && (
            <button type="button" className="pfe-btn-edit" onClick={onEdit}>
              <Pencil size={13} /> {t('claimDetail.editAssign')}
            </button>
          )}
        </div>
      </div>

      <div className="pfe-pane-content">
        <div className="pfe-compact-chips-grid">
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><UserCheck size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.createdBy')}</span>
              <span className="pfe-chip-value">{resolveCreatorName(claim)}</span>
            </div>
          </div>
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><UserCheck size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.assignedTo')}</span>
              <span className="pfe-chip-value">{assigneeLabel || t('claimDetail.unassigned')}</span>
            </div>
          </div>
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><Building2 size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.clientId')}</span>
              <span className="pfe-chip-value">{claim.clientId || (claim as any).client_id || 'N/A'}</span>
            </div>
          </div>
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><Tag size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.defectType')}</span>
              <span className="pfe-chip-value">{defectLabel(claim.defectType || (claim as any).defect_type) || t('claimDetail.general')}</span>
            </div>
          </div>
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><Calendar size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.detectionDate')}</span>
              <span className="pfe-chip-value">
                {formatClaimDate(claim.detectionDate) || formatClaimDate(claim.createdAt) || '—'}
              </span>
            </div>
          </div>
          {showClosure && (
            <div className="pfe-chip-card">
              <div className="pfe-chip-icon"><CheckCircle2 size={14} /></div>
              <div className="pfe-chip-info">
                <span className="pfe-chip-label">{t('claimDetail.closureDate')}</span>
                <span className="pfe-chip-value">{completedAtLabel || '—'}</span>
                {isOnTime === true && (
                  <span className="pfe-chip-value" style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                    {t('claimDetail.onTime')}
                  </span>
                )}
                {isOnTime === false && (
                  <span className="pfe-chip-value" style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                    {deadlineLabel ? t('claimDetail.lateWithLimit', { date: deadlineLabel }) : t('claimDetail.late')}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><Hash size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.lotNumber')}</span>
              <span className="pfe-chip-value">{claim.lotNumber || (claim as any).lot_number || 'N/A'}</span>
            </div>
          </div>
          <div className="pfe-chip-card">
            <div className="pfe-chip-icon"><Barcode size={14} /></div>
            <div className="pfe-chip-info">
              <span className="pfe-chip-label">{t('claimDetail.serialNumber')}</span>
              <span className="pfe-chip-value">{claim.serialNumber || (claim as any).serial_number || 'N/A'}</span>
            </div>
          </div>
        </div>

        <div className="pfe-description-block">
          <div className="pfe-description-header">
            <AlignLeft size={13} style={{ color: '#2563eb' }} />
            <span>{t('claimDetail.description')}</span>
          </div>
          <p className="pfe-description-text">
            {claim.description ||
              (claim as any).description ||
              t('claimDetail.noDescription')}
          </p>
        </div>

        {(hasEstimate || estimateLoading) && (
          <div className="pfe-description-block pfe-estimate-detail">
            <div className="pfe-description-header">
              <Clock size={13} style={{ color: '#0f2b5c' }} />
              <span>{t('claimDetail.estimateTitle')}</span>
            </div>
            {estimateLoading && !hasEstimate ? (
              <p className="pfe-description-text" style={{ color: '#64748b' }}>
                {t('claimDetail.estimateLoading')}
              </p>
            ) : hasEstimate ? (
              <>
                <p className="pfe-description-text" style={{ marginBottom: 8 }}>
                  {t('claimDetail.estimateLabel')}{' '}
                  <strong>
                    {t('claimDetail.estimateRange', { min: formatEstimateDays(daysP50), max: formatEstimateDays(daysP80) })}
                  </strong>
                  {t('claimDetail.estimateBasis', { count: sampleSize ?? 0, method: estimateMethodLabel(method) })}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: '#475569' }}>
                    {t('claimDetail.suggestedDeadline')} <strong>{suggestedDeadlineLabel || '—'}</strong>{' '}
                    {t('claimDetail.suggestedDeadlineRule')}
                    {deadlineLabel
                      ? ` · ${t('claimDetail.currentDeadline', { date: deadlineLabel })}`
                      : ` · ${t('claimDetail.noDeadline')}`}
                  </span>
                  {canApplyDeadline && (
                    <button
                      type="button"
                      className="pfe-btn-primary"
                      disabled={applyingDeadline}
                      onClick={() => {
                        if (!suggestedDeadlineIso || !onApplySuggestedDeadline) return;
                        void onApplySuggestedDeadline(String(claim.id), suggestedDeadlineIso);
                      }}
                      style={{ padding: '6px 10px', fontSize: 12 }}
                    >
                      {applyingDeadline ? t('claimDetail.applying') : t('claimDetail.applyDeadline')}
                    </button>
                  )}
                  {deadlineAlreadyApplied && (
                    <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
                      {t('claimDetail.deadlineAligned')}
                    </span>
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                  {t('claimDetail.neverAutomatic')}
                </p>
              </>
            ) : null}
          </div>
        )}

        <InvestigationWorkflows
          claimId={claim.id}
          isLocked={isAnalysisLocked}
          claimStatus={currentStatus}
        />
      </div>
    </div>
  );
};
