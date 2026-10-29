import { render, screen } from '@testing-library/react';
import { ExtendDeadline, canExtendDeadline } from './ExtendDeadline';

let mockRoles: string[] = ['superadmin'];
let mockPermissions: string[] = [];
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    accessToken: 't',
    hasRole: (r: string) => mockRoles.includes(r.toLowerCase()),
    hasPermission: (p: string) => mockPermissions.includes(p),
  }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('../i18n', () => ({ dateLocale: () => 'fr-FR', __esModule: true, default: {} }));
jest.mock('../services/qualityAnalysisService', () => ({ qualityAnalysisService: {} }));
jest.mock('../services/actionPlanService', () => ({ extendPlanDeadline: jest.fn(), extendPlanActionDeadline: jest.fn() }));

const daysFromToday = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

describe('ExtendDeadline', () => {
  beforeEach(() => { mockPermissions = []; });

  it.each(['claim', 'plan', 'action'] as const)('shows the button to an administrator for a late open %s', (kind) => {
    mockRoles = ['admin'];
    render(<ExtendDeadline kind={kind} id="1" deadline={daysFromToday(-3)} open onDone={() => undefined} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows it to a super administrator too', () => {
    mockRoles = ['superadmin'];
    render(<ExtendDeadline kind="action" id="1" deadline={daysFromToday(-3)} open onDone={() => undefined} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows it to an employee who was granted the right, and only with that right', () => {
    mockRoles = ['user'];
    mockPermissions = ['capa:extend_deadline'];
    render(<ExtendDeadline kind="claim" id="1" deadline={daysFromToday(-3)} open onDone={() => undefined} />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('shows nothing for an employee, a deadline not passed, a closed item or no deadline', () => {
    mockRoles = ['user'];
    const { container, rerender } = render(<ExtendDeadline kind="plan" id="1" deadline={daysFromToday(-3)} open onDone={() => undefined} />);
    expect(container.innerHTML).toBe('');
    mockRoles = ['admin'];
    rerender(<ExtendDeadline kind="plan" id="1" deadline={daysFromToday(+3)} open onDone={() => undefined} />);
    expect(container.innerHTML).toBe('');
    rerender(<ExtendDeadline kind="plan" id="1" deadline={daysFromToday(-3)} open={false} onDone={() => undefined} />);
    expect(container.innerHTML).toBe('');
    rerender(<ExtendDeadline kind="plan" id="1" deadline={null} open onDone={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('counts a deadline as late only once the day is over', () => {
    expect(canExtendDeadline(daysFromToday(-1))).toBe(true);
    expect(canExtendDeadline(new Date().toISOString())).toBe(false);
    expect(canExtendDeadline(daysFromToday(2))).toBe(false);
  });
});
