/** Rôles IAM qui ouvrent la console admin / voient tout le périmètre qualité. */
const ADMIN_ROLES = new Set(['admin', 'superadmin', 'admin_quality']);

/** Normalise role / roles (string | string[] | undefined) en liste lowercase. */
export function normalizeRoles(user: {
  role?: string | string[] | null;
  roles?: string | string[] | null;
} | null | undefined): string[] {
  if (!user) return [];
  const raw = user.role ?? user.roles;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim().toLowerCase());
}

export function isPlatformAdmin(user: {
  role?: string | string[] | null;
  roles?: string | string[] | null;
} | null | undefined): boolean {
  const roles = normalizeRoles(user);
  return roles.includes('admin') || roles.includes('superadmin');
}

export function canImportData(user: {
  role?: string | string[] | null;
  roles?: string | string[] | null;
  permission?: string | string[] | null;
} | null | undefined): boolean {
  const roles = normalizeRoles(user);
  if (roles.includes('admin') || roles.includes('superadmin')) return true;
  const raw = user?.permission;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.some((p) => String(p).toLowerCase() === 'data:import');
}

export function isAdminUser(user: {
  role?: string | string[] | null;
  roles?: string | string[] | null;
} | null | undefined): boolean {
  return normalizeRoles(user).some((r) => ADMIN_ROLES.has(r));
}

/**
 * Where a signed-in user lands for a requested path. In-app paths only ('//host' would leave the app);
 * the employee dashboard becomes the validations hub for admins, and /admin is closed to employees.
 */
export function resolvePostLoginTarget(redirectTo: string | undefined, isAdmin: boolean): string {
  let target = redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
    ? redirectTo
    : (isAdmin ? '/admin/validations' : '/dashboard');
  if (target === '/dashboard' && isAdmin) target = '/admin/validations';
  if (target.startsWith('/admin') && !isAdmin) target = '/dashboard';
  return target;
}
