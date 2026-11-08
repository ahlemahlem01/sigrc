import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import { qualityAnalysisService } from '../../../services/qualityAnalysisService';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** A cause this serious is always flagged, even when its product is small: the product of three notes can hide a rare but severe risk. */
export const HIGH_SEVERITY = 9;

type Score = number | '';
interface Row {
  id: string;
  category: string;
  text: string;
  s: Score;
  o: Score;
  d: Score;
  state: 'idle' | 'saving' | 'saved' | 'error';
}

const short = (text: string, max = 26) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const toScore = (v: unknown): Score => (typeof v === 'number' && v >= 1 && v <= 10 ? v : '');

/** The Ishikawa endpoint groups causes by category; older payloads carry a flat list. Both give the same flat rows. */
function flatten(d: any): Row[] {
  const rows: any[] = Array.isArray(d?.categories)
    ? d.categories.flatMap((cat: any) => (cat.causes ?? []).map((c: any) => ({ ...c, category: cat.categoryName, text: c.text ?? c.causeDescription })))
    : (d?.causes ?? []).map((c: any) => ({ ...c, text: c.causeDescription ?? c.text }));
  return rows
    .filter((c) => c.id && c.text)
    .map((c) => ({
      id: c.id, category: String(c.category ?? ''), text: c.text,
      s: toScore(c.riskSeverity), o: toScore(c.riskOccurrence), d: toScore(c.riskDetection), state: 'idle' as const,
    }));
}

export interface RankedCause { id: string; text: string; category: string; severity: number; criticality: number; cumulativePct: number; vital: boolean; high: boolean }

/** Ranks the fully scored causes by criticality (severity × occurrence × detection) and works out the cumulative share and the 80 % cut. */
export function rankCauses(rows: Pick<Row, 'id' | 'text' | 'category' | 's' | 'o' | 'd'>[]): RankedCause[] {
  const scored = rows
    .filter((r) => r.s !== '' && r.o !== '' && r.d !== '')
    .map((r) => ({ id: r.id, text: r.text, category: r.category, severity: Number(r.s), criticality: Number(r.s) * Number(r.o) * Number(r.d) }))
    .sort((a, b) => b.criticality - a.criticality);
  const total = scored.reduce((sum, r) => sum + r.criticality, 0);
  let cumulative = 0;
  let crossed = false;
  return scored.map((r) => {
    cumulative += r.criticality;
    const pct = total === 0 ? 0 : Math.round((cumulative / total) * 1000) / 10;
    const vital = !crossed;
    if (pct >= 80) crossed = true;
    return { ...r, cumulativePct: pct, vital, high: r.severity >= HIGH_SEVERITY };
  });
}

/**
 * Prospective Pareto: it does not count the past. The analyst scores each Ishikawa cause (severity, occurrence, detection, 1 to 10) and the causes
 * are ranked by criticality = severity × occurrence × detection. It works for a defect that has no history; the scores are an estimate, not a statistic.
 */
export default function ProspectivePareto({ claimId, readOnly = false }: { claimId: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    qualityAnalysisService
      .getIshikawa(claimId, accessToken || undefined)
      .then((d) => { if (!cancelled) setRows(flatten(d)); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [claimId, accessToken]);

  const patch = useCallback((id: string, change: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r))), []);

  const change = (row: Row, key: 's' | 'o' | 'd', value: string) => {
    const next: Row = { ...row, [key]: value === '' ? '' : Number(value) };
    const all = next.s !== '' && next.o !== '' && next.d !== '';
    const none = next.s === '' && next.o === '' && next.d === '';
    patch(row.id, { [key]: next[key], state: all || none ? 'saving' : 'idle' });
    if (!all && !none) return;                      // a cause is saved only with its three scores, or with none
    qualityAnalysisService
      .setIshikawaCauseRisk(row.id, { severity: all ? Number(next.s) : null, occurrence: all ? Number(next.o) : null, detection: all ? Number(next.d) : null }, accessToken || undefined)
      .then(() => patch(row.id, { state: 'saved' }))
      .catch(() => patch(row.id, { state: 'error' }));
  };

  const ranked = useMemo(() => rankCauses(rows), [rows]);
  const data = ranked.map((r) => ({ ...r, label: short(r.text) }));

  const wrap = (content: React.ReactNode, chart = false) => (
    <section
      className={chart ? 'pareto-chart-card' : undefined}
      style={{ marginTop: 16, ...(chart ? {} : { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px' }) }}
      aria-labelledby="prospective-pareto-title"
    >
      <h2 id="prospective-pareto-title" style={{ margin: '0 0 4px', fontSize: 16, color: '#000168' }}>{t('pareto.prospective.title')}</h2>
      <p className="pareto-context" style={{ margin: '0 0 6px' }}>{t('pareto.prospective.hint')}</p>
      {content}
    </section>
  );

  if (loading) return wrap(<p className="pareto-context">{t('pareto.loading')}</p>);
  if (rows.length === 0) {
    return wrap(
      <p className="pareto-context">
        {t('pareto.causesNoIshikawa')}{' '}
        <Link to={`/pages/front/quality-analyses/ishikawa/${claimId}`}>{t('pareto.causesGoIshikawa')}</Link>
      </p>,
    );
  }

  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eef1f6', fontSize: 13, textAlign: 'left', verticalAlign: 'middle' };
  const select = (row: Row, key: 's' | 'o' | 'd', label: string) => (
    <select
      aria-label={`${label} — ${row.text}`}
      value={row[key]}
      disabled={readOnly}
      onChange={(e) => change(row, key, e.target.value)}
      style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit', width: 64 }}
    >
      <option value="">—</option>
      {SCORES.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  const highCauses = ranked.filter((r) => r.high);

  return wrap(
    <>
      <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 12.5, color: '#475569' }}>
        <li>{t('pareto.prospective.scaleSeverity')}</li>
        <li>{t('pareto.prospective.scaleOccurrence')}</li>
        <li>{t('pareto.prospective.scaleDetection')}</li>
      </ul>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['colCause', 'colSeverity', 'colOccurrence', 'colDetection', 'colCriticality'].map((k) => (
                <th key={k} style={{ ...cell, fontSize: 12, color: '#64748b', borderBottom: '2px solid #dbe2ff' }}>{t(`pareto.prospective.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const crit = r.s !== '' && r.o !== '' && r.d !== '' ? Number(r.s) * Number(r.o) * Number(r.d) : null;
              const incomplete = [r.s, r.o, r.d].some((v) => v !== '') && crit === null;
              return (
                <tr key={r.id}>
                  <td style={{ ...cell, maxWidth: 360 }}>
                    <div style={{ fontWeight: 600, color: '#0f2b5c' }}>{r.text}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      {t(`ishikawa.cat.${r.category}`, { defaultValue: r.category })}
                      {incomplete && <span style={{ color: '#b45309' }}> · {t('pareto.prospective.partial')}</span>}
                      {r.state === 'saving' && <span> · {t('pareto.prospective.saving')}</span>}
                      {r.state === 'saved' && <span style={{ color: '#047857' }}> · {t('pareto.prospective.saved')}</span>}
                      {r.state === 'error' && <span role="alert" style={{ color: '#b91c1c' }}> · {t('pareto.prospective.saveFailed')}</span>}
                    </div>
                  </td>
                  <td style={cell}>{select(r, 's', t('pareto.prospective.colSeverity'))}</td>
                  <td style={cell}>{select(r, 'o', t('pareto.prospective.colOccurrence'))}</td>
                  <td style={cell}>{select(r, 'd', t('pareto.prospective.colDetection'))}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{crit ?? '—'}{crit !== null && Number(r.s) >= HIGH_SEVERITY && <span title={t('pareto.prospective.highPriority')} style={{ marginLeft: 6, color: '#dc2626' }}>●</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.length === 0 ? (
        <p className="pareto-context" style={{ margin: '10px 0 0' }}>{t('pareto.prospective.empty')}</p>
      ) : (
        <>
          <div style={{ marginTop: 14 }}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" angle={-20} textAnchor="end" height={64} tick={{ fontSize: 11 }} interval={0} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: t('pareto.prospective.axis'), angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: t('pareto.cumulative'), angle: 90, position: 'insideRight' }} />
                <Tooltip
                  formatter={(value, name) => [name === 'cumulativePct' ? `${value} %` : String(value ?? ''), name === 'cumulativePct' ? t('pareto.cumulative') : t('pareto.prospective.axis')]}
                  labelFormatter={(_, payload) => (payload && payload[0] ? String((payload[0].payload as { text: string }).text) : '')}
                />
                <Bar yAxisId="left" dataKey="criticality" name="criticality">
                  {data.map((d) => <Cell key={d.id} fill={d.high ? '#dc2626' : d.vital ? '#d97706' : '#94a3b8'} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cumulativePct" name="cumulativePct" stroke="#0f2b5c" strokeWidth={2} />
                <ReferenceLine yAxisId="right" y={80} stroke="#dc2626" strokeDasharray="4 4" label={t('pareto.threshold')} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="pareto-context" style={{ margin: '6px 0 0' }}>{t('pareto.prospective.basis', { count: ranked.length, total: rows.length })}</p>
          {highCauses.length > 0 && (
            <p role="note" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>
              ● {t('pareto.prospective.highPriority')} : {highCauses.map((c) => short(c.text, 40)).join(' · ')}
            </p>
          )}
        </>
      )}
    </>,
    false,
  );
}
