import React from 'react';
import { X, AlertCircle, Factory, Users, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReferenceLists } from '../../hooks/useReferenceLists';

interface ClaimProductionModalProps {
  isOpen: boolean;
  mode: 'start' | 'edit';
  formData: { productionLine?: string; shift?: string; analysisNotes?: string };
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ClaimProductionModal: React.FC<ClaimProductionModalProps> = ({
  isOpen,
  mode,
  formData,
  isSaving,
  saveError,
  onClose,
  onChange,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const { productionLines, shifts } = useReferenceLists();
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1000, padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff', borderRadius: '12px', width: '100%',
          maxWidth: '520px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 24px', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#0f172a' }}>
              {mode === 'start' ? t('productionModal.startTitle') : t('productionModal.editTitle')}
            </h3>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {mode === 'start'
                ? t('productionModal.startSubtitle')
                : t('productionModal.editSubtitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8',
              padding: '4px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: '24px' }}>
          {saveError && (
            <div
              style={{
                marginBottom: '16px', padding: '12px', borderRadius: '8px', backgroundColor: '#fef2f2',
                border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', display: 'flex',
                alignItems: 'center', gap: '8px',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{saveError}</span>
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              <Factory size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.line')}
            </label>
            <input
              type="text" name="productionLine" list="reference-production-lines" value={formData.productionLine || ''} onChange={onChange}
              placeholder={t('productionModal.linePlaceholder')} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            <datalist id="reference-production-lines">{productionLines.map((d) => <option key={d} value={d} />)}</datalist>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              <Users size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.shift')}
            </label>
            <input
              type="text" name="shift" list="reference-shifts" value={formData.shift || ''} onChange={onChange}
              placeholder={t('productionModal.shiftPlaceholder')} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
            <datalist id="reference-shifts">{shifts.map((d) => <option key={d} value={d} />)}</datalist>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              <FileText size={15} style={{ color: '#2563eb' }} />
              {t('productionModal.notes')}
            </label>
            <textarea
              name="analysisNotes" value={formData.analysisNotes || ''} onChange={onChange}
              placeholder={t('productionModal.notesPlaceholder')} rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button" onClick={onClose} disabled={isSaving}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
            >
              {t('common.cancel')}
            </button>

            <button
              type="submit" disabled={isSaving}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 20px', borderRadius: '8px',
                border: 'none', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '14px', fontWeight: 500,
                cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.8 : 1,
              }}
            >
              {isSaving ? (
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