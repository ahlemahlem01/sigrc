import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  /** Ask for a reason (required unless `optional`). */
  reason?: boolean;
  optional?: boolean;
  confirmLabel: string;
  tone?: 'ok' | 'danger';
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** A confirmation (with an optional reason) in the app's own style, in place of the browser's confirm / prompt boxes. */
export default function DecisionDialog({ open, title, message, reason, optional, confirmLabel, tone = 'ok', busy, error, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    const id = window.setTimeout(() => area.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(id); document.removeEventListener('keydown', onKey); };
  }, [open, busy, onCancel]);

  if (!open) return null;
  const missing = Boolean(reason) && !optional && text.trim().length === 0;
  const color = tone === 'danger' ? '#b91c1c' : '#059669';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: 'min(480px, 100%)', padding: 20, boxShadow: '0 20px 50px rgba(15,23,42,.25)' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{title}</h3>
        {message && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{message}</p>}
        {reason && (
          <>
            <label style={{ display: 'block', margin: '14px 0 4px', fontSize: 12, fontWeight: 700, color: '#334155' }}>
              {t('decisionDialog.reason')}{optional ? ` (${t('decisionDialog.optional')})` : ' *'}
            </label>
            <textarea
              ref={area}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={600}
              placeholder={t('decisionDialog.placeholder')}
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, font: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </>
        )}
        {error && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={busy}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', font: 'inherit', fontSize: 13, fontWeight: 700, color: '#334155', cursor: 'pointer' }}>
            {t('decisionDialog.cancel')}
          </button>
          <button type="button" onClick={() => onConfirm(text.trim())} disabled={busy || missing}
            style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: color, color: '#fff', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: busy || missing ? 'not-allowed' : 'pointer', opacity: busy || missing ? 0.6 : 1 }}>
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
