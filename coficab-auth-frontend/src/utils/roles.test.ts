import { canImportData, isAdminUser, isPlatformAdmin, normalizeRoles } from './roles';

describe('normalizeRoles', () => {
  it('accepts a single role, an array, or the "roles" alias', () => {
    expect(normalizeRoles({ role: ' Admin ' })).toEqual(['admin']);
    expect(normalizeRoles({ role: ['User', 'SUPERADMIN'] })).toEqual(['user', 'superadmin']);
    expect(normalizeRoles({ roles: 'admin_quality' })).toEqual(['admin_quality']);
  });

  it('drops empty values and handles a missing user', () => {
    expect(normalizeRoles({ role: ['', '  ', 'user'] })).toEqual(['user']);
    expect(normalizeRoles(null)).toEqual([]);
    expect(normalizeRoles(undefined)).toEqual([]);
    expect(normalizeRoles({})).toEqual([]);
  });
});

describe('isAdminUser (admin console access)', () => {
  it.each(['admin', 'superadmin', 'admin_quality', 'SuperAdmin'])('lets %s in', (role) => {
    expect(isAdminUser({ role })).toBe(true);
  });

  it.each(['user', 'manager', ''])('keeps %p out', (role) => {
    expect(isAdminUser({ role })).toBe(false);
  });

  it('keeps out a missing user', () => {
    expect(isAdminUser(null)).toBe(false);
  });
});

describe('isPlatformAdmin', () => {
  it('excludes admin_quality, unlike isAdminUser', () => {
    expect(isPlatformAdmin({ role: 'admin_quality' })).toBe(false);
    expect(isPlatformAdmin({ role: ['user', 'admin'] })).toBe(true);
  });
});

describe('canImportData', () => {
  it('allows platform admins without the permission', () => {
    expect(canImportData({ role: 'superadmin' })).toBe(true);
  });

  it('allows a user holding data:import', () => {
    expect(canImportData({ role: 'user', permission: ['claim:read', 'DATA:IMPORT'] })).toBe(true);
    expect(canImportData({ role: 'user', permission: 'data:import' })).toBe(true);
  });

  it('refuses a user without it', () => {
    expect(canImportData({ role: 'user', permission: ['claim:read'] })).toBe(false);
    expect(canImportData({ role: 'admin_quality' })).toBe(false);
  });
});

describe('resolvePostLoginTarget', () => {
  const { resolvePostLoginTarget } = jest.requireActual('./roles') as typeof import('./roles');

  it('sends admins to the validations hub instead of the employee dashboard', () => {
    expect(resolvePostLoginTarget('/dashboard', true)).toBe('/admin/validations');
    expect(resolvePostLoginTarget('/dashboard', false)).toBe('/dashboard');
  });

  it('keeps employees out of /admin', () => {
    expect(resolvePostLoginTarget('/admin/users', false)).toBe('/dashboard');
    expect(resolvePostLoginTarget('/admin/users', true)).toBe('/admin/users');
  });

  it('only accepts in-app paths', () => {
    expect(resolvePostLoginTarget('//evil.example', false)).toBe('/dashboard');
    expect(resolvePostLoginTarget('https://evil.example', true)).toBe('/admin/validations');
    expect(resolvePostLoginTarget(undefined, false)).toBe('/dashboard');
    expect(resolvePostLoginTarget('/pages/front', false)).toBe('/pages/front');
  });
});
