import { Navigate, useLocation } from 'react-router-dom';

/** Sends a signed-out visitor to /login, remembering the page so LoginPage can return to it. */
export const RedirectToLogin = () => {
  const location = useLocation();
  return (
    <Navigate
      to="/login"
      replace
      state={{ redirectTo: `${location.pathname}${location.search}${location.hash}` }}
    />
  );
};
