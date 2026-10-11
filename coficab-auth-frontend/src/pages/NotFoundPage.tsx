import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { isAdminUser } from '../utils/roles';

/** Shown for any unknown URL, instead of silently sending people back to the landing page. */
export default function NotFoundPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const home = !isAuthenticated ? '/' : isAdminUser(user) ? '/admin/validations' : '/dashboard';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-5xl font-bold text-slate-300">404</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">{t('notFound.title')}</h1>
        <p className="mt-2 break-all text-sm text-slate-500">
          {t('notFound.body')} <code className="rounded bg-slate-100 px-1">{location.pathname}</code>
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('notFound.back')}
          </button>
          <Link
            to={home}
            className="rounded-lg bg-[#0a1f5c] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t('notFound.home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
