import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import LicenceBanner from './LicenceBanner';
import IdleLogout, { IDLE_LOGOUT_FLAG } from './IdleLogout';

jest.mock('axios');
const mockLogout = jest.fn();
let mockToken = 't';
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ accessToken: mockToken, logout: mockLogout }) }));
jest.mock('../config/apiEnv', () => ({ ACTION_PLAN_API_URL: 'http://api' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${Object.values(o).join(',')}` : k), i18n: { language: 'fr' } }),
}));

const mockedGet = axios.get as jest.Mock;

describe('LicenceBanner', () => {
  beforeEach(() => mockedGet.mockReset());

  it('warns before the licence expires and says when it is out', async () => {
    mockedGet.mockResolvedValue({ data: { licence: { state: 'expiring', daysLeft: 12, expiresAt: '2026-11-16T00:00:00Z' } } });
    const { unmount } = render(<LicenceBanner />);
    expect((await screen.findByRole('alert')).textContent).toContain('licence.expiring');
    unmount();

    mockedGet.mockResolvedValue({ data: { licence: { state: 'expired', daysLeft: -3, expiresAt: '2026-10-01T00:00:00Z' } } });
    render(<LicenceBanner />);
    expect((await screen.findByRole('alert')).textContent).toContain('licence.expired');
  });

  it('says nothing without a licence or with a licence valid for long', async () => {
    mockedGet.mockResolvedValue({ data: { licence: { state: 'ok', daysLeft: 300, expiresAt: null } } });
    render(<LicenceBanner />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('IdleLogout', () => {
  beforeEach(() => { mockedGet.mockReset(); mockLogout.mockReset(); jest.useFakeTimers(); sessionStorage.clear(); });
  afterEach(() => jest.useRealTimers());

  it('logs the user out after the delay set by the administrator, and leaves a message for the login page', async () => {
    mockedGet.mockResolvedValue({ data: { idleMinutes: 10 } });
    render(<MemoryRouter><IdleLogout /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    act(() => { jest.advanceTimersByTime(9 * 60_000); });
    expect(mockLogout).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(2 * 60_000); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(IDLE_LOGOUT_FLAG)).toBe('1');
  });

  it('keeps counting when the access token is renewed during the idle time', async () => {
    mockToken = 't';
    mockedGet.mockResolvedValue({ data: { idleMinutes: 5 } });
    const { rerender } = render(<MemoryRouter><IdleLogout /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });

    act(() => { jest.advanceTimersByTime(3 * 60_000); });
    mockToken = 't2'; // silent renewal, nobody touched the page
    rerender(<MemoryRouter><IdleLogout /></MemoryRouter>);
    act(() => { jest.advanceTimersByTime(3 * 60_000); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledTimes(1);
    mockToken = 't';
  });

  it('does nothing when the delay is 0', async () => {
    mockedGet.mockResolvedValue({ data: { idleMinutes: 0 } });
    render(<MemoryRouter><IdleLogout /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    act(() => { jest.advanceTimersByTime(24 * 60 * 60_000); });
    expect(mockLogout).not.toHaveBeenCalled();
  });
});
