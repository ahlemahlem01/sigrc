import i18n from '../i18n';

/** The business domains every installation starts with (the list "domain" of the reference lists can add its own). */
export const STANDARD_DOMAINS = ['QUALITY', 'PRODUCTION', 'MAINTENANCE', 'HSE', 'LOGISTICS', 'HR', 'CONTINUOUS_IMPROVEMENT'] as const;

/** A plan without a domain is a quality plan (plans born from claims and alerts). */
export const DEFAULT_DOMAIN = 'QUALITY';

export interface DomainOption {
  value: string;
  label: string;
}

/** The wording of a domain: translated for the standard codes, else the label of the list, else the code itself. */
export function domainLabel(code?: string | null, label?: string | null): string {
  const value = (code ?? '').trim();
  if (!value) return '';
  return i18n.t(`planDomains.${value.toUpperCase()}`, { defaultValue: label?.trim() || value });
}

/** The domain of a plan as the screens use it (always set). */
export function domainOf(plan: { domain?: string | null }): string {
  return (plan.domain ?? '').trim().toUpperCase() || DEFAULT_DOMAIN;
}

/** Keeps the plans of one domain ('all' or empty keeps everything). */
export function inDomain<T extends { domain?: string | null }>(plans: T[], domain: string): T[] {
  return !domain || domain === 'all' ? plans : plans.filter((p) => domainOf(p) === domain.toUpperCase());
}
