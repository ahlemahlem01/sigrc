import React, { useEffect } from 'react';
import { X, Factory, Users, FileText, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { Claim } from '../../types/qualityAnalysis';
import { useTranslation } from 'react-i18next';

interface EditProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  claim: Claim | null;
  productionLine: string;
  shiftTeam: string;
  analysisNotes: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onProductionLineChange: (value: string) => void;
  onShiftTeamChange: (value: string) => void;
  onAnalysisNotesChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const EditProductionModal: React.FC<EditProductionModalProps> = ({
  isOpen,
  onClose,
  claim,
  productionLine,
  shiftTeam,
  analysisNotes,
  isSubmitting,
  errorMessage,
  onProductionLineChange,
  onShiftTeamChange,
  onAnalysisNotesChange,
  onSubmit,
}) => {
  const { t } = useTranslation();
  // Sync avec le claim sélectionné à chaque ouverture
  useEffect(() => {
    if (claim && isOpen) {
      onProductionLineChange(
        (claim as any).productionLine || (claim as any).production_line || ''
      );
      onShiftTeamChange(
        (claim as any).shift || (claim as any).shiftTeam || (claim as any).shift_team || ''
      );
      onAnalysisNotesChange(
        (claim as any).analysisNotes || (claim as any).analysis_notes || ''
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parent callbacks are not memoised; listing them would re-run on every render
  }, [claim, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>
              {t('productionModal.editTitle')}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {t('productionModal.editSubtitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onSubmit} style={{ padding: '24px' }}>
          {errorMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Field: Production Line */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '8px',
              }}
            >
              <Factory size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.line')}
            </label>
            <input
              type="text"
              value={productionLine}
              onChange={(e) => onProductionLineChange(e.target.value)}
              placeholder={t('productionModal.linePlaceholder')}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Field: Shift / Team */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '8px',
              }}
            >
              <Users size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.shift')}
            </label>
            <input
              type="text"
              value={shiftTeam}
              onChange={(e) => onShiftTeamChange(e.target.value)}
              placeholder={t('productionModal.shiftPlaceholder')}
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Field: Analysis Notes */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '8px',
              }}
            >
              <FileText size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.notes')}
            </label>
            <textarea
              value={analysisNotes}
              onChange={(e) => onAnalysisNotesChange(e.target.value)}
              placeholder={t('productionModal.notesPlaceholder')}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('common.cancel')}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.8 : 1,
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{t('common.saving')}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>{t('common.save')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};