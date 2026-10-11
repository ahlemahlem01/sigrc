import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';

const LANGS: AppLanguage[] = ['fr', 'en', 'it'];

type Props = {
  compact?: boolean;
  className?: string;
  /** light = text clair (nav Front sombre) */
  variant?: 'default' | 'light';
};

export default function LanguageSwitcher({ compact = false, className = '', variant = 'default' }: Props) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language || 'fr').slice(0, 2) as AppLanguage;

  return (
    <label className={`lang-switch ${variant}${className ? ` ${className}` : ''}`}>
      {!compact && <span className="lang-switch-label">{t('lang.label')}</span>}
      <select
        aria-label={t('lang.label')}
        value={LANGS.includes(current) ? current : 'fr'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {LANGS.map((code) => (
          <option key={code} value={code}>
            {compact ? code.toUpperCase() : t(`lang.${code}`)}
          </option>
        ))}
      </select>
      <style>{`
        .lang-switch {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #475569;
        }
        .lang-switch-label {
          font-weight: 600;
          white-space: nowrap;
        }
        .lang-switch select {
          height: 30px;
          padding: 0 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #0f172a;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .lang-switch.light {
          color: rgba(255,255,255,0.7);
        }
        .lang-switch.light select {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          color: #fff;
        }
        .lang-switch.light select option {
          color: #0f172a;
        }
      `}</style>
    </label>
  );
}
