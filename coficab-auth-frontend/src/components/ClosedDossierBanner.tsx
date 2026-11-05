import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown on every analysis of a closed claim: it can be read, not changed. */
export function ClosedDossierBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px', padding: '10px 14px', borderRadius: 10,
        background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', fontSize: 13, fontWeight: 600,
      }}
    >
      <Lock size={15} aria-hidden />
      <span>{t('closedDossier.banner')}</span>
    </div>
  );
}
