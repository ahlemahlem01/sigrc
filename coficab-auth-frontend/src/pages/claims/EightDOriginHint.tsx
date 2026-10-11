import React from 'react';
import { useTranslation } from 'react-i18next';

export function asOriginText(value?: string | number | null): string {
  if (value == null || value === '') return '';
  return String(value);
}

/** Affiche la première saisie (jamais effacée). La valeur courante reste éditable au-dessus. */
export const OriginHint: React.FC<{
  original?: string | number | null;
  current?: string | number | null;
  label?: string;
}> = ({ original, current, label }) => {
  const { t } = useTranslation();
  const orig = asOriginText(original);
  if (!orig) return null;
  const changed = asOriginText(current) !== orig;
  return (
    <div
      className="e8d-origin"
      title={t('originHint.tooltip')}
    >
      {changed ? t('originHint.kept', { label: label || t('originHint.firstEntry') }) : (label || t('originHint.firstEntry'))} : <span>{orig}</span>
      {changed ? <em> · {t('originHint.currentAbove')}</em> : null}
    </div>
  );
};
