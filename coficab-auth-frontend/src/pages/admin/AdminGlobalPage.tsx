import { Navigate, useSearchParams } from 'react-router-dom';
import Dashboard from './dashboard/Dashboard';

/** Page principale admin — vue comparative Claims / Action Plans. */
export default function AdminGlobalPage() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('locked') === '1') {
    return <Navigate to="/admin/users?locked=1" replace />;
  }

  return <Dashboard />;
}
