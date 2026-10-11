/**
 * Calcul du PPM (Parts Per Million) lié à un défaut.
 *
 * PPM = (quantité défectueuse / quantité produite) × 1 000 000
 *
 * Le PPM n'est volontairement JAMAIS persisté en base : il est toujours
 * recalculé à partir des deux quantités brutes (producedQuantity /
 * defectiveQuantity) stockées sur le Claim. Cela évite qu'une correction
 * ultérieure d'une des deux quantités laisse un PPM affiché obsolète.
 */

import i18n, { dateLocale } from '../i18n';

export interface PpmInput {
  producedQuantity?: number | null;
  defectiveQuantity?: number | null;
}

export interface PpmResult {
  /** true si les deux quantités sont renseignées et exploitables */
  isComputable: boolean;
  /** valeur PPM arrondie à l'entier le plus proche, ou null si non calculable */
  value: number | null;
  /** message d'erreur/à afficher si non calculable */
  reason?: string;
}

export function computePpm({ producedQuantity, defectiveQuantity }: PpmInput): PpmResult {
  if (producedQuantity === undefined || producedQuantity === null) {
    return { isComputable: false, value: null, reason: i18n.t('ppm.producedMissing') };
  }

  if (defectiveQuantity === undefined || defectiveQuantity === null) {
    return { isComputable: false, value: null, reason: i18n.t('ppm.defectiveMissing') };
  }

  if (producedQuantity <= 0) {
    return { isComputable: false, value: null, reason: i18n.t('ppm.producedPositive') };
  }

  if (defectiveQuantity < 0) {
    return { isComputable: false, value: null, reason: i18n.t('ppm.defectiveNegative') };
  }

  if (defectiveQuantity > producedQuantity) {
    return {
      isComputable: false,
      value: null,
      reason: i18n.t('ppm.defectiveTooHigh'),
    };
  }

  const raw = (defectiveQuantity / producedQuantity) * 1_000_000;
  return { isComputable: true, value: Math.round(raw) };
}

/** Thousands separator in the UI language: 12500 -> "12 500" (fr) / "12,500" (en) */
export function formatPpm(value: number): string {
  return new Intl.NumberFormat(dateLocale()).format(value);
}