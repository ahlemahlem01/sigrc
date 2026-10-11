import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { getUserInfo, refreshToken } from '../services/authService';

jest.mock('../services/authService', () => ({
  getUserInfo: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
}));
jest.mock('../services/employeeService', () => ({
  employeeService: { getProfile: jest.fn().mockResolvedValue({}) },
}));

const mockedRefresh = refreshToken as jest.Mock;

const TokenProbe = () => {
  const { accessToken } = useAuth();
  return <p>token={accessToken ?? 'none'}</p>;
};

const tokens = (n: number) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: 'Bearer', expires_in: 3600 });

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('refresh_token', 'refresh-0');
  (getUserInfo as jest.Mock).mockResolvedValue({ sub: 'u1', name: 'Test' });
  mockedRefresh.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  localStorage.clear();
});

it('renews the access token shortly before it expires, without a reload', async () => {
  mockedRefresh.mockResolvedValueOnce(tokens(1)).mockResolvedValueOnce(tokens(2));

  render(<AuthProvider><TokenProbe /></AuthProvider>);
  expect(await screen.findByText('token=access-1')).toBeInTheDocument();
  expect(mockedRefresh).toHaveBeenLastCalledWith('refresh-0');

  // One hour token: renewal fires a minute before expiry.
  await act(async () => {
    jest.advanceTimersByTime(3600 * 1000 - 60 * 1000);
  });

  expect(await screen.findByText('token=access-2')).toBeInTheDocument();
  expect(mockedRefresh).toHaveBeenLastCalledWith('refresh-1');
  expect(localStorage.getItem('refresh_token')).toBe('refresh-2');
});

it('keeps the session when the renewal fails for network reasons', async () => {
  mockedRefresh.mockResolvedValueOnce(tokens(1)).mockRejectedValueOnce(new Error('Network Error'));

  render(<AuthProvider><TokenProbe /></AuthProvider>);
  expect(await screen.findByText('token=access-1')).toBeInTheDocument();

  await act(async () => {
    jest.advanceTimersByTime(3600 * 1000 - 60 * 1000);
  });

  expect(screen.getByText('token=access-1')).toBeInTheDocument();
  expect(localStorage.getItem('refresh_token')).toBe('refresh-1');
});

it('ends the session when the server refuses the refresh token', async () => {
  mockedRefresh
    .mockResolvedValueOnce(tokens(1))
    .mockRejectedValueOnce({ response: { status: 400 } });

  render(<AuthProvider><TokenProbe /></AuthProvider>);
  expect(await screen.findByText('token=access-1')).toBeInTheDocument();

  await act(async () => {
    jest.advanceTimersByTime(3600 * 1000 - 60 * 1000);
  });

  expect(await screen.findByText('token=none')).toBeInTheDocument();
  expect(localStorage.getItem('refresh_token')).toBeNull();
});
