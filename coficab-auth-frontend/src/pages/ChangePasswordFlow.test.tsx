import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ChangePasswordPage from './ChangePasswordPage';
import MustChangePasswordRedirect from '../components/MustChangePasswordRedirect';
import { FrontValidatorRoute } from './front/FrontValidatorRoute';

jest.mock('axios');
const mockLogout = jest.fn();
let mockUser: Record<string, unknown> | null = { role: 'user', mustChangePassword: true };
let mockPermissions: string[] = [];
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 't', isAuthenticated: true, isLoading: false, user: mockUser, logout: mockLogout }),
}));
jest.mock('../config/apiEnv', () => ({ AUTH_API_URL: 'http://auth', ACTION_PLAN_API_URL: 'http://api' }));
jest.mock('../hooks/useAccess', () => ({
  useFunctionRights: () => ({ permissions: mockPermissions, loaded: true }),
  canValidate: (p: string[]) => p.includes('8d:validate'),
}));
jest.mock('../utils/roles', () => ({ isAdminUser: (u: any) => u?.role === 'admin' }));
jest.mock('../components/RedirectToLogin', () => ({ RedirectToLogin: () => <div>login</div> }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
const mockedPost = axios.post as jest.Mock;

beforeEach(() => { mockedPost.mockReset(); mockLogout.mockReset(); mockUser = { role: 'user', mustChangePassword: true }; mockPermissions = []; });

describe('forced password change', () => {
  it('sends a person with a temporary password to the page where he chooses his own', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><MustChangePasswordRedirect /><Where /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/change-password'));
  });

  it('does nothing for someone whose password is his own', () => {
    mockUser = { role: 'user', mustChangePassword: false };
    render(<MemoryRouter initialEntries={['/dashboard']}><MustChangePasswordRedirect /><Where /></MemoryRouter>);
    expect(screen.getByTestId('where').textContent).toBe('/dashboard');
  });

  it('refuses two different passwords, then saves and sends him to sign in again', async () => {
    mockedPost.mockResolvedValue({ data: {} });
    render(<MemoryRouter initialEntries={['/change-password']}><Routes><Route path="/change-password" element={<ChangePasswordPage />} /><Route path="/login" element={<Where />} /></Routes></MemoryRouter>);
    const inputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(inputs[0], { target: { value: 'Temp@1234' } });
    fireEvent.change(inputs[1], { target: { value: 'Neuf@5678' } });
    fireEvent.change(inputs[2], { target: { value: 'Autre@5678' } });
    fireEvent.click(screen.getByText('changePassword.submit'));
    expect((await screen.findByRole('alert')).textContent).toBe('changePassword.mismatch');
    expect(mockedPost).not.toHaveBeenCalled();

    fireEvent.change(inputs[2], { target: { value: 'Neuf@5678' } });
    fireEvent.click(screen.getByText('changePassword.submit'));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('http://auth/api/password/change', { currentPassword: 'Temp@1234', newPassword: 'Neuf@5678' }, expect.anything()));
    // the new password closes the older sessions: the person is signed out and goes to sign in again
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect((await screen.findByTestId('where')).textContent).toBe('/login');
  });
});

describe('FrontValidatorRoute', () => {
  const renderAt = () => render(
    <MemoryRouter initialEntries={['/pages/front/validations']}>
      <Routes>
        <Route element={<FrontValidatorRoute />}><Route path="/pages/front/validations" element={<div>desk</div>} /></Route>
        <Route path="/dashboard" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );

  it('opens for an administrator and for someone whose function carries the right', () => {
    mockUser = { role: 'admin' };
    const first = renderAt();
    expect(screen.getByText('desk')).toBeTruthy();
    first.unmount();

    mockUser = { role: 'user' };
    mockPermissions = ['8d:validate'];
    renderAt();
    expect(screen.getByText('desk')).toBeTruthy();
  });

  it('sends a simple employee home', () => {
    mockUser = { role: 'user' };
    renderAt();
    expect(screen.getByText('home')).toBeTruthy();
  });
});
