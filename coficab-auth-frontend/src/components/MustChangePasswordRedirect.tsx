import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Someone with a temporary password goes to the page where he chooses his own, and nowhere else, until he has. */
export default function MustChangePasswordRedirect() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const must = isAuthenticated && Boolean((user as any)?.mustChangePassword);

  useEffect(() => {
    if (must && location.pathname !== '/change-password') navigate('/change-password', { replace: true });
  }, [must, location.pathname, navigate]);

  return null;
}
