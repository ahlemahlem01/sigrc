import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HrReportEmployeePayload } from '../../../../services/hrReportService';
import { activityStatusLabel, normalizeActivityStatus } from '../../../../utils/activityStatus';
import { useTranslation } from 'react-i18next';

type Props = {
  rows: HrReportEmployeePayload[];
};

const NAVY = '#000168';
const LINE = '#e4e8f2';
const COLORS = {
  active: '#000168',
  low: '#c2410c',
  inactive: '#94a3b8',
  bar: '#000168',
  bar2: '#64748b',
};

export default function ReportCharts({ rows }: Props) {
  const { t, i18n } = useTranslation();

  const activityCounts = useMemo(() => {
    const counts = { Active: 0, LowActivity: 0, Inactive: 0 };
    for (const r of rows) {
      const s = normalizeActivityStatus(r.activityStatus);
      counts[s] += 1;
    }
    return [
      { status: 'Active' as const, key: 'active', value: counts.Active, color: COLORS.active },
      { status: 'LowActivity' as const, key: 'low', value: counts.LowActivity, color: COLORS.low },
      { status: 'Inactive' as const, key: 'inactive', value: counts.Inactive, color: COLORS.inactive },
    ].filter((d) => d.value > 0);
  }, [rows]);
  // Labels resolved at render so they follow the UI language.
  const activityData = activityCounts.map((d) => ({ ...d, name: activityStatusLabel(d.status) }));

  const perfTrend = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName, i18n.language));
    return sorted.slice(0, 12).map((r) => ({
      name: r.fullName.split(' ')[0] || r.fullName.slice(0, 8),
      fullName: r.fullName,
      dossiers: r.activeDossiers,
      cloture: r.closureRate,
      capacite: r.remainingCapacity,
      retards: r.overdueCount,
    }));
  }, [rows, i18n.language]);

  if (rows.length === 0) return null;

  return (
    <section className="hrc" data-hr-charts>
      <style>{`
        .hrc {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 16px 18px; margin-bottom: 16px;
        }
        .hrc-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hrc-sub { margin: 0 0 14px; font-size: 12px; color: #64748b; }
        .hrc-grid {
          display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px;
        }
        @media (max-width: 900px) { .hrc-grid { grid-template-columns: 1fr; } }
        .hrc-panel {
          border: 1px solid ${LINE}; border-radius: 10px; padding: 12px;
          background: #fafbff; min-height: 260px;
        }
        .hrc-panel h3 {
          margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #475569;
          text-transform: uppercase; letter-spacing: .04em;
        }
      `}</style>

      <h2 className="hrc-title">{t('hrReports.chartsTitle')}</h2>
      <p className="hrc-sub">{t('hrReports.chartsSub')}</p>

      <div className="hrc-grid">
        <div className="hrc-panel" data-chart="activity">
          <h3>{t('hrReports.activitySplit')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={activityData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={78}
                paddingAngle={2}
              >
                {activityData.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [t('recognition.employeesShort', { count: Number(v ?? 0) }), t('hrReports.headcount')]}
                contentStyle={{ borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="hrc-panel" data-chart="trend">
          <h3>{t('hrReports.filesAndClosure')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={perfTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="dossiers"
                name={t('comparator.activeFiles')}
                stroke={COLORS.bar}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cloture"
                name={t('hrReports.closurePct')}
                stroke={COLORS.bar2}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="hrc-panel" data-chart="capacity" style={{ gridColumn: '1 / -1' }}>
          <h3>{t('hrReports.capacityTitle')}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perfTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={LINE} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="capacite" name={t('hrReports.remainingCapacity')} fill={NAVY} radius={[4, 4, 0, 0]} />
              <Bar dataKey="retards" name={t('comparator.late')} fill="#b91c1c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
