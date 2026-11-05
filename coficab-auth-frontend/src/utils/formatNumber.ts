import i18n from '../i18n';

/**
 * A decimal number written the way the active language writes it: 30,8 in French and Italian, 30.8 in English.
 * Screens must use this instead of toFixed, which always gives a point. Files for machines (CSV, JSON) keep the point.
 */
export function formatDecimal(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const lang = (i18n.language || 'fr').slice(0, 2);
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}
