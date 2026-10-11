import {
  CartesianGrid, Cell, ComposedChart, Bar, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MiningInsights } from '../../../services/miningService';

interface Props {
  claimId: string;
  /** What comparable closed dossiers recorded for each of the analyst's own Ishikawa causes. */
  evidence?: MiningInsights['causeEvidence'];
  loading: boolean;
}

const short = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Pareto of the analyst's own causes: one bar per Ishikawa cause, height = number of comparable closed dossiers
 * where a similar cause was the root cause. Shows which of the listed causes carry the weight.
 */
export default function CausesPareto({ claimId, evidence, loading }: Props) {
  const { t } = useTranslation();

  // The chart card has a fixed height; the short messages get a compact card so no empty space is left.
  const wrap = (content: React.ReactNode, chart = false) => (
    <section
      className={chart ? 'pareto-chart-card' : undefined}
      style={chart ? { marginTop: 16 } : { marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }}
      aria-labelledby="causes-pareto-title"
    >
      <h2 id="causes-pareto-title" style={{ margin: '0 0 4px', fontSize: 16, color: '#000168' }}>{t('pareto.causesTitle')}</h2>
      <p className="pareto-context" style={{ margin: '0 0 10px' }}>{t('pareto.causesHint')}</p>
      {content}
    </section>
  );

  if (loading) return wrap(<p className="pareto-context">{t('pareto.loading')}</p>);

  const items = evidence?.items ?? [];
  if (items.length === 0) {
    return wrap(
      <p className="pareto-context">
        {t('pareto.causesNoIshikawa')}{' '}
        <Link to={`/pages/front/quality-analyses/ishikawa/${claimId}`}>{t('pareto.causesGoIshikawa')}</Link>
      </p>,
    );
  }
  if (!evidence?.sufficient) return wrap(<p className="pareto-context">{t('pareto.causesThin', { pool: evidence?.pool ?? 0, min: evidence?.min ?? 5 })}</p>);

  const values = items.map((i) => i.rootDossiers ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    // "never a root cause" and "nothing similar recorded" are different findings: say which one it is.
    const seen = items.some((i) => (i.dossiers ?? 0) > 0);
    return wrap(<p className="pareto-context">{t(seen ? 'pareto.causesNone' : 'pareto.causesNoMatch', { pool: evidence.pool })}</p>);
  }

  const ranked = items
    .map((i, idx) => ({ ...i, value: values[idx] }))
    .sort((a, b) => b.value - a.value);
  let cumulative = 0;
  let crossed = false;
  const data = ranked.map((i) => {
    cumulative += i.value;
    const pct = Math.round((cumulative / total) * 1000) / 10;
    const vital = !crossed;
    if (pct >= 80) crossed = true;
    return { id: i.id, label: short(i.text), full: i.text, category: i.category, value: i.value, hidden: i.rootDossiers === null, cumulativePct: pct, vital };
  });
  const flat = data.length >= 5 && data.filter((d) => d.vital).length >= Math.ceil(data.length * 0.6);
  const hiddenCount = data.filter((d) => d.hidden).length;

  return wrap(
    <>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="label" angle={-20} textAnchor="end" height={64} tick={{ fontSize: 11 }} interval={0} />
          <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: t('pareto.causesAxis'), angle: -90, position: 'insideLeft' }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: t('pareto.cumulative'), angle: 90, position: 'insideRight' }} />
          <Tooltip
            formatter={(value, name) => [name === 'cumulativePct' ? `${value} %` : String(value ?? ''), name === 'cumulativePct' ? t('pareto.cumulative') : t('pareto.causesAxis')]}
            labelFormatter={(_, payload) => (payload && payload[0] ? String((payload[0].payload as { full: string }).full) : '')}
          />
          <Bar yAxisId="left" dataKey="value" name="value">
            {data.map((d) => (
              <Cell key={d.id} fill={flat ? '#64748b' : d.vital ? '#d97706' : '#94a3b8'} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="cumulativePct" stroke="#0f2b5c" strokeWidth={2} />
          <ReferenceLine yAxisId="right" y={80} stroke="#dc2626" strokeDasharray="4 4" label={t('pareto.threshold')} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="pareto-context" style={{ margin: '6px 0 0' }}>
        {t('pareto.causesBasis', { pool: evidence.pool })}
        {hiddenCount > 0 ? ` ${t('pareto.causesHidden', { count: hiddenCount })}` : ''}
      </p>
      {flat && <p role="note" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#475569' }}>{t('pareto.causesFlat')}</p>}
    </>,
    true,
  );
}
