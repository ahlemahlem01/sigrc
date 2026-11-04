import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';

/** Flags at the bottom of the page to switch the language (the specification asks for them). Drawn inline: no image to load. */
const FLAGS: Record<AppLanguage, ReactElement> = {
  fr: (
    <svg viewBox="0 0 3 2" width="26" height="18" aria-hidden="true">
      <rect width="1" height="2" fill="#0055A4" /><rect x="1" width="1" height="2" fill="#fff" /><rect x="2" width="1" height="2" fill="#EF4135" />
    </svg>
  ),
  en: (
    <svg viewBox="0 0 60 40" width="26" height="18" aria-hidden="true">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0L60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0L60 40M60 0L0 40" stroke="#C8102E" strokeWidth="3" />
      <path d="M30 0V40M0 20H60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0V40M0 20H60" stroke="#C8102E" strokeWidth="8" />
    </svg>
  ),
  it: (
    <svg viewBox="0 0 3 2" width="26" height="18" aria-hidden="true">
      <rect width="1" height="2" fill="#009246" /><rect x="1" width="1" height="2" fill="#fff" /><rect x="2" width="1" height="2" fill="#CE2B37" />
    </svg>
  ),
};

const LANGS: AppLanguage[] = ['fr', 'en', 'it'];

export default function LanguageFlags({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language || 'fr').slice(0, 2);
  return (
    <div className={className} role="group" aria-label={t('lang.label')} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          title={t(`lang.${code}`)}
          aria-label={t(`lang.${code}`)}
          aria-pressed={current === code}
          onClick={() => void i18n.changeLanguage(code)}
          style={{
            padding: 2, borderRadius: 4, cursor: 'pointer', lineHeight: 0, background: 'transparent',
            border: current === code ? '2px solid #3b82f6' : '2px solid transparent', opacity: current === code ? 1 : 0.7,
          }}
        >
          {FLAGS[code]}
        </button>
      ))}
    </div>
  );
}
