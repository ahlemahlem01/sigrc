import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  getEmployeeActivity,
  getEmployeeWorkload,
  type EmployeeActivity,
  type EmployeeWorkload,
} from '../../services/employeeWorkspaceService';
import './FrontWorkspaceHome.styles.css';
import '../../components/employee/WorkspaceExtras.styles.css';

const NAVY = '#000168';
const GREY = '#94a3b8';

/** "My load and my activity": my last 12 weeks against the (anonymous) team average. */
export default function EmployeeActivityPage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [activity, setActivity] = useState<EmployeeActivity | null>(null);
  const [workload, setWorkload] = useState<EmployeeWorkload | null>(null);
  const [failed, setFailed] = useState(false);
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : i18n.language?.startsWith('it') ? 'it-IT' : 'fr-FR';

  useEffect(() => {
    if (!accessToken) return;
    getEmployeeActivity(accessToken).then(setActivity).catch(() => setFailed(true));
    getEmployeeWorkload(accessToken).then(setWorkload).catch(() => setWorkload(null));
  }, [accessToken]);

  const data = useMemo(
    () =>
      (activity?.weeks ?? []).map((w) => ({
        ...w,
        label: new Date(w.weekStart).toLocaleDateString(locale, { day: '2-digit', month: 'short' }),
      })),
    [activity, locale],
  );

  const fmt = (v: number | null | undefined, suffix = '') =>
    v == null ? '—' : `${v.toLocaleString(locale, { maximumFractionDigits: 1 })}${suffix}`;
  const days = activity?.mine.avgDays ?? null;
  const target = activity?.target.resolutionDays ?? 0;
  const daysTone = days == null ? 'muted' : days <= target ? 'ok' : 'bad';
  const rateTone = activity?.mine.onTimeRate == null ? 'muted' : activity.mine.onTimeRate >= activity.target.onTimeGreen ? 'ok' : 'bad';
  const tooltipStyle = { fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: 'none' };

  return (
    <div className="fwh-page">
      <div className="fwh-inner">
        <header className="fwh-top">
          <div className="fwh-welcome">
            <p className="fwh-kicker">{t('employeeWorkspace.kicker')}</p>
            <h1>{t('employeeWorkspace.actTitle')}</h1>
            <p className="fwh-sub">{t('employeeWorkspace.actSub')}</p>
          </div>
        </header>

        {failed ? (
          <div className="fwh-empty soft">{t('employeeWorkspace.actFailed')}</div>
        ) : !activity ? (
          <div className="fwh-skel-row" aria-hidden />
        ) : (
          <>
            <section className="fwh-stats fwh-stats-4" aria-label={t('employeeWorkspace.actKpisAria')}>
              <div className="fwh-stat tone-navy">
                <span className="fwh-stat-label">{t('employeeWorkspace.actKpiLoad')}</span>
                <strong className="fwh-stat-value">{workload ? workload.mine : '—'}</strong>
                <span className="fwh-stat-hint">
                  {workload ? t('employeeWorkspace.actKpiLoadHint', { avg: fmt(workload.teamAverage) }) : ''}
                </span>
              </div>
              <div className="fwh-stat tone-navy">
                <span className="fwh-stat-label">{t('employeeWorkspace.actKpiClosed')}</span>
                <strong className="fwh-stat-value">{activity.mine.closed90}</strong>
                <span className="fwh-stat-hint">{t('employeeWorkspace.actKpiClosedHint', { avg: fmt(activity.team.closed90PerPerson) })}</span>
              </div>
              <div className={`fwh-stat tone-${daysTone === 'bad' ? 'red' : 'navy'}`}>
                <span className="fwh-stat-label">{t('employeeWorkspace.actKpiDays')}</span>
                <strong className="fwh-stat-value">{fmt(days, ' j')}</strong>
                <span className="fwh-stat-hint">{t('employeeWorkspace.actKpiDaysHint', { target, avg: fmt(activity.team.avgDays, ' j') })}</span>
              </div>
              <div className={`fwh-stat tone-${rateTone === 'bad' ? 'red' : 'navy'}`}>
                <span className="fwh-stat-label">{t('employeeWorkspace.actKpiOnTime')}</span>
                <strong className="fwh-stat-value">{fmt(activity.mine.onTimeRate, ' %')}</strong>
                <span className="fwh-stat-hint">{t('employeeWorkspace.actKpiOnTimeHint', { target: activity.target.onTimeGreen, avg: fmt(activity.team.onTimeRate, ' %') })}</span>
              </div>
            </section>

            {workload && workload.state !== 'none' && (
              <p className={`fwh-load-note ${workload.state}`}>
                {t(`employeeWorkspace.loadState.${workload.state}`, { mine: workload.mine, avg: fmt(workload.teamAverage) })}
              </p>
            )}

            <div className="fwh-duo">
              <section className="fwh-card">
                <div className="fwh-card-head"><h2>{t('employeeWorkspace.actOpenTitle')}</h2></div>
                <p className="fwh-card-sub">{t('employeeWorkspace.actOpenSub')}</p>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="open" name={t('employeeWorkspace.loadMine')} stroke={NAVY} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="teamOpen" name={t('employeeWorkspace.loadTeam')} stroke={GREY} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </section>

              <section className="fwh-card">
                <div className="fwh-card-head"><h2>{t('employeeWorkspace.actClosedTitle')}</h2></div>
                <p className="fwh-card-sub">{t('employeeWorkspace.actClosedSub')}</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="closed" name={t('employeeWorkspace.loadMine')} fill={NAVY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="teamClosed" name={t('employeeWorkspace.loadTeam')} fill={GREY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>

            <p className="fwh-card-sub">{t('employeeWorkspace.actFoot', { size: activity.team.size })}</p>
          </>
        )}
      </div>
    </div>
  );
}
