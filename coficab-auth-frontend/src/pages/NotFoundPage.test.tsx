import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockedUseAuth = useAuth as jest.Mock;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>,
  );

it.each([
  ['signed out', { isAuthenticated: false, user: null }, '/'],
  ['employee', { isAuthenticated: true, user: { role: 'user' } }, '/dashboard'],
  ['admin', { isAuthenticated: true, user: { role: 'admin' } }, '/admin/validations'],
])('links a %s visitor to their home page', (_label, auth, home) => {
  mockedUseAuth.mockReturnValue(auth);
  renderAt('/nowhere/at-all');

  expect(screen.getByText('/nowhere/at-all')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'notFound.home' })).toHaveAttribute('href', home);
});
