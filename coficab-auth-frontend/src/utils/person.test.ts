import { pn, setPeopleDirectory, departmentCodeOf } from './person';

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ accessToken: null, isAuthenticated: false }) }));

describe('pn (a name with the code of the department)', () => {
  beforeEach(() => setPeopleDirectory([
    { userId: 'U1', name: 'Ahlem Alaya', departmentCode: 'QA' },
    { userId: 'U2', name: 'Karim Ben Salah', departmentCode: 'PROD' },
    { userId: 'U3', name: 'Sami Homonyme', departmentCode: 'LOG' },
    { userId: 'U4', name: 'Sami Homonyme', departmentCode: 'MAINT' },
  ]));

  it('puts the code in front of a known name', () => {
    expect(pn('Ahlem Alaya')).toBe('[QA] Ahlem Alaya');
    expect(pn('  karim ben salah ')).toBe('[PROD] karim ben salah');
  });

  it('prefers the id, which settles two people with the same name', () => {
    expect(pn('Sami Homonyme', 'u3')).toBe('[LOG] Sami Homonyme');
    expect(pn('Sami Homonyme', 'U4')).toBe('[MAINT] Sami Homonyme');
    expect(pn('Sami Homonyme')).toBe('Sami Homonyme');   // ambiguous without the id
  });

  it('leaves what is not a known person as it is, and never adds the code twice', () => {
    expect(pn('Client ACME')).toBe('Client ACME');
    expect(pn('')).toBe('');
    expect(pn(null)).toBe('');
    expect(pn('[QA] Ahlem Alaya')).toBe('[QA] Ahlem Alaya');
    expect(departmentCodeOf('inconnu')).toBe('');
  });
});
