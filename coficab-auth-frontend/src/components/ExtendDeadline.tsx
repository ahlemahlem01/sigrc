import React, { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import { extendPlanDeadline, extendPlanActionDeadline } from '../services/actionPlanService';
import { dateLocale } from '../i18n';

export const MIN_REASON = 10;
const MAX_DAYS_AHEAD = 180;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A late, open item: the only case where more time can be allocated. */
export const canExtendDeadline = (deadline?: string | null, open = true): boolean => {
  if (!open || !deadline) return false;
  const d = new Date(deadline);
  return !Number.isNaN(d.getTime()) && dayStart(d) < dayStart(new Date());
};

interface Props {
  kind: 'claim' | 'plan' | 'action';
  id: string;
  deadline?: string | null;
  /** Not closed, not archived, not a draft. */
  open?: boolean;
  onDone: () => void;
}

/**
 * Administrators and super administrators give a late claim, CAPA plan or sub-action more time. The reason is mandatory and, with the
 * old and the new date, goes to the history: nothing is overwritten silently.
 */
export const ExtendDeadline: React.FC<Props> = ({ kind, id, deadline, open = true, onDone }) => {
  const { t } = useTranslation();
  const { accessToken, hasRole, hasPermission } = useAuth();
  const [show, setShow] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!(hasRole('admin') || hasRole('superadmin') || hasPermission('capa:extend_deadline')) || !canExtendDeadline(deadline, open)) return null;

  const today = dayStart(new Date());
  const max = new Date(today); max.setDate(max.getDate() + MAX_DAYS_AHEAD);
  const current = new Date(deadline as string);
  const extra = date ? Math.round((dayStart(new Date(date)).getTime() - dayStart(current).getTime()) / 86400000) : 0;
  const valid = !!date && reason.trim().length >= MIN_REASON && extra > 0;

  const openDialog = () => { setDate(''); setReason(''); setError(null); setShow(true); };

  const submit = async () => {
    if (!accessToken || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'claim') await qualityAnalysisService.extendClaimDeadline(id, date, reason.trim(), accessToken);
      else if (kind === 'action') await extendPlanActionDeadline(accessToken, id, date, reason.trim());
      else await extendPlanDeadline(accessToken, id, date, reason.trim());
      setShow(false);
      onDone();
    } catch (e: any) {
      const code = e?.response?.data?.code as string | undefined;
      setError(code ? t(`extendDeadline.errors.${code}`, { defaultValue: t('extendDeadline.errors.generic') }) : t('extendDeadline.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="pfe-cv-btn" onClick={openDialog} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <CalendarClock size={14} /> {t('extendDeadline.button')}
      </button>
      {show && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('extendDeadline.title')}
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !busy && setShow(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 18, width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column', gap: 12, color: '#0f172a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#0f2b5c', fontSize: 16 }}>{t('extendDeadline.title')}</strong>
              <button type="button" onClick={() => setShow(false)} aria-label={t('extendDeadline.cancel')} style={{ background: 'none', border: 0, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              {t('extendDeadline.current', { date: current.toLocaleDateString(dateLocale()) })}
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              {t('extendDeadline.newDate')}
              <input
                type="date"
                value={date}
                min={toInput(today)}
                max={toInput(max)}
                onChange={(e) => setDate(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', font: 'inherit' }}
              />
              {extra > 0 && <span style={{ fontWeight: 400, color: '#15803d', fontSize: 12 }}>{t('extendDeadline.extra', { count: extra })}</span>}
              {date && extra <= 0 && <span style={{ fontWeight: 400, color: '#b91c1c', fontSize: 12 }}>{t('extendDeadline.errors.notAfterCurrent')}</span>}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              {t('extendDeadline.reason')} <span style={{ fontWeight: 400, color: '#64748b' }}>({t('extendDeadline.reasonHint', { min: MIN_REASON })})</span>
              <textarea
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', font: 'inherit', resize: 'vertical' }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{t('extendDeadline.trace')}</p>
            {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShow(false)} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                {t('extendDeadline.cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!valid || busy}
                style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default', opacity: valid && !busy ? 1 : 0.55 }}
              >
                {busy ? t('extendDeadline.saving') : t('extendDeadline.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExtendDeadline;
