import React, { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import { dateLocale } from '../i18n';
import { MIN_REASON } from './ExtendDeadline';

const MAX_DAYS_AHEAD = 180;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  claimId: string;
  /** Current deadline, if any. */
  deadline?: string | null;
  /** Not closed, not archived, not a draft. */
  open?: boolean;
  onDone: () => void;
}

/**
 * Administrators set a deadline of their own instead of the suggested one: any future date, earlier or later, with a mandatory reason.
 * The previous date (or its absence), the new date and the reason go to the claim history with the author's name.
 */
export const ChangeClaimDeadline: React.FC<Props> = ({ claimId, deadline, open = true, onDone }) => {
  const { t } = useTranslation();
  const { accessToken, hasRole, hasPermission } = useAuth();
  const [show, setShow] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !(hasRole('admin') || hasRole('superadmin') || hasPermission('capa:extend_deadline'))) return null;

  const today = dayStart(new Date());
  const max = new Date(today); max.setDate(max.getDate() + MAX_DAYS_AHEAD);
  const current = deadline ? new Date(deadline) : null;
  const sameAsCurrent = !!date && !!current && dayStart(new Date(date)).getTime() === dayStart(current).getTime();
  const valid = !!date && reason.trim().length >= MIN_REASON && !sameAsCurrent;

  const openDialog = () => { setDate(''); setReason(''); setError(null); setShow(true); };

  const submit = async () => {
    if (!accessToken || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await qualityAnalysisService.changeClaimDeadline(claimId, date, reason.trim(), accessToken);
      setShow(false);
      onDone();
    } catch (e: any) {
      const code = e?.response?.data?.code as string | undefined;
      setError(code ? t(`changeDeadline.errors.${code}`, { defaultValue: t('changeDeadline.errors.generic') }) : t('changeDeadline.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="pfe-cv-btn" onClick={openDialog} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12 }}>
        <CalendarClock size={14} /> {t('changeDeadline.button')}
      </button>
      {show && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('changeDeadline.title')}
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => !busy && setShow(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: 18, width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column', gap: 12, color: '#0f172a' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#0f2b5c', fontSize: 16 }}>{t('changeDeadline.title')}</strong>
              <button type="button" onClick={() => setShow(false)} aria-label={t('changeDeadline.cancel')} style={{ background: 'none', border: 0, cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              {current
                ? t('changeDeadline.current', { date: current.toLocaleDateString(dateLocale()) })
                : t('changeDeadline.none')}
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              {t('changeDeadline.newDate')}
              <input
                type="date"
                value={date}
                min={toInput(today)}
                max={toInput(max)}
                onChange={(e) => setDate(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', font: 'inherit' }}
              />
              {sameAsCurrent && <span style={{ fontWeight: 400, color: '#b91c1c', fontSize: 12 }}>{t('changeDeadline.errors.sameDate')}</span>}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>
              {t('changeDeadline.reason')} <span style={{ fontWeight: 400, color: '#64748b' }}>({t('changeDeadline.reasonHint', { min: MIN_REASON })})</span>
              <textarea
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(e) => setReason(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', font: 'inherit', resize: 'vertical' }}
              />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{t('changeDeadline.trace')}</p>
            {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShow(false)} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                {t('changeDeadline.cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!valid || busy}
                style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: valid && !busy ? 'pointer' : 'default', opacity: valid && !busy ? 1 : 0.55 }}
              >
                {busy ? t('changeDeadline.saving') : t('changeDeadline.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
