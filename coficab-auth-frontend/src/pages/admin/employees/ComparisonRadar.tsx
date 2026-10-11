import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CompetencyScores, EmployeePerformanceRow } from '../../../services/employeePerformanceService';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';

/** Labels are shown as-is except 'deadlines', which is translated. */
const AXES: { key: keyof CompetencyScores; label: string }[] = [
  { key: 'fiveWhy', label: '5 Why' },
  { key: 'ishikawa', label: 'Ishikawa' },
  { key: 'eightD', label: '8D' },
  { key: 'capa', label: 'CAPA' },
  { key: 'deadlines', label: 'Délais' },
];

export const COMPARE_COLORS = ['#000168', '#0e7490', '#c2410c'] as const;
const DASH: Array<string | undefined> = [undefined, '6 4', '2 3'];

type Props = {
  employees: EmployeePerformanceRow[];
  height?: number;
};

export default function ComparisonRadar({ employees, height = 300 }: Props) {
  const { t } = useTranslation();
  const axisLabel = (key: keyof CompetencyScores, label: string) => (key === 'deadlines' ? t('skills.deadlines') : label);
  const data = AXES.map(({ key, label }) => {
    const point: Record<string, string | number> = { axis: axisLabel(key, label), fullMark: 100 };
    employees.forEach((emp, i) => {
      point[`e${i}`] = emp.competencies[key] ?? 0;
    });
    return point;
  });

  return (
    <div className="cmp-radar">
      <div className="cmp-radar-legend">
        {employees.map((emp, i) => (
          <div key={emp.userId} className="cmp-radar-legend-item">
            <span
              className="cmp-radar-swatch"
              style={{
                background: COMPARE_COLORS[i],
                borderStyle: i === 0 ? 'solid' : 'dashed',
              }}
            />
            <span className="cmp-radar-legend-name">{emp.fullName}</span>
          </div>
        ))}
      </div>

      <div className="cmp-radar-body">
        <div className="cmp-radar-chart">
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={data} cx="50%" cy="52%" outerRadius="68%">
              <PolarGrid stroke="#d5dbe8" strokeWidth={1} />
              {/* @ts-expect-error recharts PolarAngleAxis typing with React 19 */}
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fill: COFICAB.ink, fontSize: 12, fontWeight: 700 }}
                tickLine={false}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                tickCount={5}
                axisLine={false}
              />
              {employees.map((emp, i) => (
                <Radar
                  key={emp.userId}
                  name={emp.fullName}
                  dataKey={`e${i}`}
                  stroke={COMPARE_COLORS[i]}
                  fill={COMPARE_COLORS[i]}
                  fillOpacity={i === 0 ? 0.14 : 0.06}
                  strokeWidth={i === 0 ? 2.5 : 2}
                  strokeDasharray={DASH[i]}
                  dot={{ r: 3.5, fill: COMPARE_COLORS[i], stroke: '#fff', strokeWidth: 1.5 }}
                  isAnimationActive={false}
                />
              ))}
              <Tooltip
                formatter={(v, name) => [`${Number(v ?? 0)} %`, String(name)]}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  borderRadius: 10,
                  border: `1px solid ${COFICAB.line}`,
                  fontSize: 12,
                  boxShadow: '0 8px 24px rgba(13,19,64,.08)',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="cmp-radar-scores">
          <table>
            <thead>
              <tr>
                <th>{t('comparator.axis')}</th>
                {employees.map((emp, i) => (
                  <th key={emp.userId}>
                    <span className="cmp-radar-th">
                      <span className="cmp-radar-dot" style={{ background: COMPARE_COLORS[i] }} />
                      {emp.fullName.split(' ')[0]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AXES.map(({ key, label }) => {
                const values = employees.map((e) => e.competencies[key] ?? 0);
                const best = Math.max(...values);
                return (
                  <tr key={key}>
                    <td>{axisLabel(key, label)}</td>
                    {values.map((v, i) => (
                      <td key={employees[i].userId} className={v === best && best > 0 ? 'is-best' : undefined}>
                        {v}
                        <span className="cmp-radar-pct">%</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .cmp-radar { width: 100%; }
        .cmp-radar-legend {
          display: flex; flex-wrap: wrap; gap: 10px 18px;
          margin-bottom: 10px;
        }
        .cmp-radar-legend-item {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12.5px; font-weight: 650; color: ${COFICAB.ink};
        }
        .cmp-radar-swatch {
          width: 22px; height: 3px; border-radius: 2px;
          border-width: 0; display: inline-block;
        }
        .cmp-radar-legend-name {
          max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cmp-radar-body {
          display: grid;
          grid-template-columns: minmax(260px, 1.1fr) minmax(240px, .9fr);
          gap: 8px 20px;
          align-items: center;
        }
        .cmp-radar-chart { min-width: 0; }
        .cmp-radar-scores {
          border: 1px solid ${COFICAB.line};
          border-radius: 10px;
          overflow: hidden;
          background: #fafbff;
        }
        .cmp-radar-scores table {
          width: 100%; border-collapse: collapse; font-size: 12.5px;
        }
        .cmp-radar-scores th {
          padding: 9px 10px; text-align: center;
          font-size: 11px; font-weight: 700; color: ${COFICAB.muted};
          background: #f1f4fb; border-bottom: 1px solid ${COFICAB.line};
        }
        .cmp-radar-scores th:first-child,
        .cmp-radar-scores td:first-child {
          text-align: left; color: ${COFICAB.ink}; font-weight: 650;
        }
        .cmp-radar-scores td {
          padding: 9px 10px; text-align: center;
          border-bottom: 1px solid #eef1f7;
          font-weight: 700; color: ${COFICAB.ink};
          font-variant-numeric: tabular-nums;
        }
        .cmp-radar-scores tr:last-child td { border-bottom: none; }
        .cmp-radar-scores td.is-best {
          background: ${COFICAB.okSoft};
          color: ${COFICAB.ok};
        }
        .cmp-radar-pct {
          font-size: 10px; font-weight: 600; color: #94a3b8; margin-left: 1px;
        }
        .cmp-radar-scores td.is-best .cmp-radar-pct { color: #5eead4; }
        .cmp-radar-th {
          display: inline-flex; align-items: center; gap: 6px;
          max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .cmp-radar-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        @media (max-width: 860px) {
          .cmp-radar-body { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
