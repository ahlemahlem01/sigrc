import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RedirectToLogin } from '../../components/RedirectToLogin';
import { isAdminUser } from '../../utils/roles';
import { canValidate, useFunctionRights } from '../../hooks/useAccess';

/** The validation desk: administrators, and people whose function carries the right to validate. */
export const FrontValidatorRoute = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { permissions, loaded } = useFunctionRights();

  if (isLoading || !loaded) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }
  if (!isAuthenticated || !user) {
    return <RedirectToLogin />;
  }
  if (!isAdminUser(user) && !canValidate(permissions)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
};
