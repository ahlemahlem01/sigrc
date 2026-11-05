import type { TFunction } from 'i18next';
import { normalizeRoles } from './roles';

/** The role of a signed-in person, worded the same way in the back office and in the front office. */
export function roleLabel(
  user: { role?: string | string[] | null; roles?: string | string[] | null } | null | undefined,
  t: TFunction,
): string {
  const roles = normalizeRoles(user);
  if (roles.includes('superadmin')) return t('roleNames.superadmin');
  if (roles.includes('admin') || roles.includes('admin_quality')) return t('roleNames.admin');
  return t('roleNames.user');
}
