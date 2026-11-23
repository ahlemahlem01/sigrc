import { roleLabel } from './roleLabel';

const t = ((k: string) => k) as any;

describe('roleLabel', () => {
  it('words the three roles the same way everywhere', () => {
    expect(roleLabel({ role: 'superadmin' }, t)).toBe('roleNames.superadmin');
    expect(roleLabel({ role: ['Admin'] }, t)).toBe('roleNames.admin');
    expect(roleLabel({ role: 'admin_quality' }, t)).toBe('roleNames.admin');
    expect(roleLabel({ role: 'user' }, t)).toBe('roleNames.user');
    expect(roleLabel(null, t)).toBe('roleNames.user');
  });
});
