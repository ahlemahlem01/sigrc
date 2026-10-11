import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RedirectToLogin } from './RedirectToLogin';

const LoginProbe = () => {
  const state = useLocation().state as { redirectTo?: string } | null;
  return <p>redirectTo={state?.redirectTo}</p>;
};

it('sends the visitor to /login and remembers the full requested URL', () => {
  render(
    <MemoryRouter initialEntries={['/admin/claims/list?severity=critical#top']}>
      <Routes>
        <Route path="/admin/claims/list" element={<RedirectToLogin />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('redirectTo=/admin/claims/list?severity=critical#top')).toBeInTheDocument();
});
