import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CompetencyScores } from '../../../services/employeePerformanceService';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';

type Props = {
  scores: CompetencyScores;
  height?: number;
};

const AXES: { key: keyof CompetencyScores; label: string }[] = [
  { key: 'fiveWhy', label: '5 Why' },
  { key: 'ishikawa', label: 'Ishikawa' },
  { key: 'eightD', label: '8D' },
  { key: 'capa', label: 'CAPA' },
  { key: 'deadlines', label: 'skills.deadlines' },
];

export default function CompetencyRadar({ scores, height = 280 }: Props) {
  const { t } = useTranslation();
  const data = AXES.map(({ key, label }) => ({
    axis: label.includes('.') ? t(label) : label,
    value: scores[key] ?? 0,
    fullMark: 100,
  }));

  return (
    <div className="cr-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke={COFICAB.line} />
          {/* @ts-expect-error recharts PolarAngleAxis typing with React 19 */}
          <PolarAngleAxis dataKey="axis" tick={{ fill: COFICAB.muted, fontSize: 11, fontWeight: 600 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} tickCount={5} />
          <Radar
            name={t('skills.radarName')}
            dataKey="value"
            stroke={COFICAB.navy}
            fill={COFICAB.navy}
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            formatter={(v) => [`${Number(v ?? 0)}%`, t('skills.score')]}
            contentStyle={{ borderRadius: 8, border: `1px solid ${COFICAB.line}`, fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <style>{`
        .cr-wrap { width: 100%; }
      `}</style>
    </div>
  );
}
