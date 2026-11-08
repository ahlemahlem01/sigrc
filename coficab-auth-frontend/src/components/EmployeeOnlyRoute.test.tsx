import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EmployeeOnlyRoute, { adminHomeFor } from './EmployeeOnlyRoute';

let mockUser: any = { role: 'user' };
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isLoading: false }) }));

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<EmployeeOnlyRoute />}>
        <Route path="/dashboard" element={<div>employee dashboard</div>} />
        <Route path="/pages/front/my-action-plans" element={<div>my plans</div>} />
      </Route>
      <Route path="/pages/front/validations" element={<div>validation desk</div>} />
      <Route path="/pages/front/action-plans" element={<div>admin plans</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('EmployeeOnlyRoute', () => {
  it('lets an employee in', () => {
    mockUser = { role: 'user' };
    at('/dashboard');
    expect(screen.getByText('employee dashboard')).toBeTruthy();
  });

  it.each(['admin', 'superadmin'])('sends a %s to the administration side', (role) => {
    mockUser = { role };
    at('/dashboard');
    expect(screen.getByText('validation desk')).toBeTruthy();
  });

  it('sends an administrator to the page of the same subject on their side', () => {
    mockUser = { role: 'admin' };
    at('/pages/front/my-action-plans');
    expect(screen.getByText('admin plans')).toBeTruthy();
    expect(adminHomeFor('/pages/front/my-claims')).toBe('/pages/front/quality-analyses');
    expect(adminHomeFor('/profile')).toBe('/admin/profile');
  });
});
