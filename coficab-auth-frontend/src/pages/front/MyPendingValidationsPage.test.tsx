import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MyPendingValidationsPage, { waitingDays, LONG_WAIT_DAYS, selectItems } from './MyPendingValidationsPage';

const mockGet = jest.fn();
const mockRemind = jest.fn();
const mockResubmit = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${o.count}` : k), i18n: { language: 'fr' } }),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
jest.mock('../../services/validationsService', () => ({
  getMyValidations: (...a: unknown[]) => mockGet(...a),
  remindValidators: (...a: unknown[]) => mockRemind(...a),
  resubmitPlan: (...a: unknown[]) => mockResubmit(...a),
}));

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 1000).toISOString();
const item = (over: Record<string, unknown> = {}) => ({
  kind: 'fiveWhy', id: 'a1', claimId: 'c1', reference: 'REC-1', title: 'Vrillage', since: daysAgo(3), linkPath: '/x',
  lastReminderAt: null, reminderCount: 0, canRemind: true, nextReminderAt: null, ready: true, progress: null, ...over,
});

describe('MyPendingValidationsPage', () => {
  beforeEach(() => { mockGet.mockReset(); mockRemind.mockReset(); });

  it('counts the days of waiting', () => {
    expect(waitingDays(daysAgo(3))).toBe(3);
    expect(waitingDays(new Date().toISOString())).toBe(0);
    expect(LONG_WAIT_DAYS).toBeGreaterThan(0);
  });

  it('says when nothing waits', async () => {
    mockGet.mockResolvedValue([]);
    render(<MyPendingValidationsPage />);
    expect(await screen.findByText('myValidations.empty')).toBeTruthy();
  });

  it('lists what waits and reminds the validators', async () => {
    mockGet.mockResolvedValue([item()]);
    mockRemind.mockResolvedValue({ sentAt: new Date().toISOString(), nextReminderAt: new Date().toISOString() });
    render(<MyPendingValidationsPage />);
    expect(await screen.findByText('Vrillage')).toBeTruthy();
    expect(screen.getByText(/myValidations\.waitingDays:3/)).toBeTruthy();

    fireEvent.click(screen.getByText('myValidations.remind'));
    await waitFor(() => expect(mockRemind).toHaveBeenCalledWith('tok', 'fiveWhy', 'a1'));
    expect(await screen.findByText('myValidations.reminded')).toBeTruthy();
  });

  it('disables the reminder once it was sent today', async () => {
    mockGet.mockResolvedValue([item({ canRemind: false, lastReminderAt: daysAgo(0), reminderCount: 1 })]);
    render(<MyPendingValidationsPage />);
    const button = (await screen.findByText('myValidations.alreadyReminded')) as HTMLButtonElement;
    expect(button.closest('button')?.disabled).toBe(true);
  });

  it('splits claims from plans, and filters by search, type, state and waiting', () => {
    const list = [
      item({ id: '1', title: 'Vrillage', kind: 'fiveWhy', since: daysAgo(5) }),
      item({ id: '2', title: 'Sertissage', kind: 'eightD', since: daysAgo(0), reminderCount: 1 }),
      item({ id: '3', title: 'Plan CAPA', kind: 'capa', ready: false, progress: 40 }),
      item({ id: '4', title: 'Plan fini', kind: 'capa', ready: true, progress: 100 }),
    ] as any[];
    const base = { query: '', kind: 'all', wait: 'all' as const, step: 'all' as const };
    expect(selectItems(list, { ...base, section: 'claims' }).map((i) => i.id)).toEqual(['1', '2']);
    expect(selectItems(list, { ...base, section: 'plans' }).map((i) => i.id)).toEqual(['3', '4']);
    expect(selectItems(list, { ...base, section: 'claims', query: 'sert' }).map((i) => i.id)).toEqual(['2']);
    expect(selectItems(list, { ...base, section: 'claims', kind: 'fiveWhy' }).map((i) => i.id)).toEqual(['1']);
    expect(selectItems(list, { ...base, section: 'claims', wait: 'long' }).map((i) => i.id)).toEqual(['1']);
    expect(selectItems(list, { ...base, section: 'claims', wait: 'reminded' }).map((i) => i.id)).toEqual(['2']);
    expect(selectItems(list, { ...base, section: 'plans', step: 'ready' }).map((i) => i.id)).toEqual(['4']);
    expect(selectItems(list, { ...base, section: 'plans', step: 'inProgress' }).map((i) => i.id)).toEqual(['3']);
  });

  it('switches to the plans with the toggle, and shows a plan still in progress without a usable reminder', async () => {
    mockGet.mockResolvedValue([item(), item({ id: 'p1', kind: 'capa', title: 'Plan CAPA', ready: false, canRemind: false, progress: 40 })]);
    render(<MyPendingValidationsPage />);
    expect(await screen.findByText('Vrillage')).toBeTruthy();
    expect(screen.queryByText('Plan CAPA')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /myValidations\.sectionPlans/ }));
    expect(await screen.findByText('Plan CAPA')).toBeTruthy();
    expect(screen.getByText(/myValidations\.planInProgress/)).toBeTruthy();
    expect((screen.getByText('myValidations.remind').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('paginates the list', async () => {
    mockGet.mockResolvedValue(Array.from({ length: 12 }, (_, n) => item({ id: `i${n}`, title: `Réclamation ${n}` })));
    render(<MyPendingValidationsPage />);
    expect(await screen.findByText('Réclamation 0')).toBeTruthy();
    expect(screen.queryByText('Réclamation 11')).toBeNull();
    fireEvent.click(screen.getByText('myValidations.next'));
    expect(await screen.findByText('Réclamation 11')).toBeTruthy();
  });

  it('shows a plan waiting for approval, and lets the author submit a returned one again', async () => {
    mockGet.mockResolvedValue([
      item({ id: 'p1', kind: 'capa', title: 'Plan A', approval: 'pending', ready: true, progress: 0 }),
      item({ id: 'p2', kind: 'capa', title: 'Plan B', approval: 'returned', ready: false, canRemind: false, approvalComment: 'Délais trop courts', progress: 0 }),
    ]);
    mockResubmit.mockResolvedValue(undefined);
    render(<MyPendingValidationsPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /myValidations\.sectionPlans/ }));
    expect(await screen.findByText(/myValidations\.planToApprove/)).toBeTruthy();
    expect(screen.getByText(/myValidations\.reason/)).toBeTruthy();
    fireEvent.click(screen.getByText('myValidations.resubmit'));
    await waitFor(() => expect(mockResubmit).toHaveBeenCalledWith('tok', 'p2'));
  });
});
