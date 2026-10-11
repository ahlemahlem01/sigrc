import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { isAdminUser } from '../../utils/roles';

export const FrontAdminRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }
  if (!isAuthenticated || !user) {
    return <RedirectToLogin />;
  }
  if (!isAdminUser(user)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};
