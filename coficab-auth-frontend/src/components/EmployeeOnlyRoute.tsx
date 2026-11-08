import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminUser } from '../utils/roles';

/** Where an administrator goes instead of an employee page: the page of the same subject on their side, else the validation desk. */
export function adminHomeFor(pathname: string): string {
  if (pathname.startsWith('/pages/front/my-action-plans') || pathname.startsWith('/action-plans')) return '/pages/front/action-plans';
  if (pathname.startsWith('/pages/front/my-claims')) return '/pages/front/quality-analyses';
  if (pathname === '/profile') return '/admin/profile';
  return '/pages/front/validations';
}

/**
 * The employee workspace (dashboard, own plans, own claims, own validations, profile...) belongs to the employees: an administrator or a
 * superadmin works from the administration and the admin front office, and is sent there when they open one of these pages.
 */
export default function EmployeeOnlyRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  if (isAdminUser(user as any)) return <Navigate to={adminHomeFor(location.pathname)} replace />;
  return <Outlet />;
}
