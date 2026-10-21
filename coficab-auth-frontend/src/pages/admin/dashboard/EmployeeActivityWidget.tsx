import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext';
import { adminEmployeeService, type EmployeeActivitySummary } from '../../../services/adminEmployeeService';
import { COFICAB } from './dashPalette';
import DashInfoTip from './DashInfoTip';

export default function EmployeeActivityWidget({ scope }: { scope?: 'plans' }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<EmployeeActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    adminEmployeeService
      .getActivitySummary(accessToken, true, scope)
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, scope]);

  const total = data?.total ?? 0;
  const rows = [
    { key: 'active', label: t('adminDashboard.activity.active'), value: data?.active ?? 0, color: '#38a169', hint: t('adminDashboard.activity.activeHint') },
    { key: 'low', label: t('adminDashboard.activity.low'), value: data?.lowActivity ?? 0, color: '#f59e0b', hint: t('adminDashboard.activity.lowHint') },
    { key: 'inactive', label: t('adminDashboard.activity.inactive'), value: data?.inactive ?? 0, color: '#94a3b8', hint: t('adminDashboard.activity.inactiveHint') },
  ];

  return (
    <section
      className="rounded-xl bg-white shadow-sm px-4 py-4 hover:shadow-md transition-shadow"
      style={{ border: `1px solid ${COFICAB.line}` }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold m-0" style={{ color: COFICAB.ink }}>
              {t('adminDashboard.activity.title')}
            </h2>
            <DashInfoTip
              text={t(scope === 'plans' ? 'adminDashboard.activity.helpPlans' : 'adminDashboard.activity.help')}
              title={t('adminDashboard.activity.helpTitle')}
              side="bottom"
            />
          </div>
          <p className="text-xs mt-1 mb-0" style={{ color: COFICAB.muted }}>
            {t(scope === 'plans' ? 'adminDashboard.activity.subtitlePlans' : 'adminDashboard.activity.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/employees/activity')}
          className="inline-flex items-center gap-1 text-xs font-semibold hover:underline shrink-0"
          style={{ color: COFICAB.navy }}
        >
          {t('adminDashboard.activity.open')} <i className="ti ti-arrow-right" />
        </button>
      </div>

      {loading ? (
        <div className="text-xs py-6 text-center" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.activity.loading')}
        </div>
      ) : !data ? (
        <div className="text-xs py-6 text-center" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.activity.unavailable')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {rows.map((row) => (
              <div
                key={row.key}
                className="rounded-lg px-3 py-2.5"
                style={{ background: COFICAB.soft, border: `1px solid ${COFICAB.line}` }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: COFICAB.muted }}>
                  {row.label}
                </div>
                <div className="text-xl font-bold mt-0.5" style={{ color: row.color }}>
                  {row.value}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: COFICAB.muted }}>
                  {row.hint}
                </div>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ background: '#f1f5f9' }}>
            {rows.map((row) => {
              const w = total > 0 ? (row.value / total) * 100 : 0;
              if (w <= 0) return null;
              return (
                <div
                  key={row.key}
                  title={`${row.label}: ${row.value}`}
                  style={{ width: `${w}%`, background: row.color }}
                />
              );
            })}
          </div>
          <div className="text-[11px] mt-2" style={{ color: COFICAB.muted }}>
            {t('adminDashboard.activity.total', { count: total })}
          </div>
        </>
      )}
    </section>
  );
}
