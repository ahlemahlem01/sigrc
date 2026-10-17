import { Navigate, useSearchParams } from 'react-router-dom';
import OverviewPage from './dashboard/OverviewPage';

/** Page principale admin — vue comparative Claims / Action Plans. */
export default function AdminGlobalPage() {
  const [searchParams] = useSearchParams();

  if (searchParams.get('locked') === '1') {
    return <Navigate to="/admin/users?locked=1" replace />;
  }

  return <OverviewPage />;
}
