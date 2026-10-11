import { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

import { ParetoDimension, ParetoItemDto, ParetoMeasure, ParetoRequestDto } from '../../../types/pareto.types';
import { paretoService } from '../../../services/paretoService';
import { useAuth } from '../../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';

interface ParetoChartProps {
  dimension?: ParetoDimension;
  clientId?: string;
  productionLine?: string;
    defectType?: string; 
  dateFrom?: string;
  dateTo?: string;
  /** "count" ranks by number of dossiers, "impact" by defective quantity × severity. */
  measure?: ParetoMeasure;
  onDataLoaded?: (data: ParetoItemDto[]) => void;
}

export default function ParetoChart({
  dimension = ParetoDimension.DefectType,
  clientId,
  productionLine,
    defectType, 
  dateFrom,
  dateTo,
  measure = 'count',
  onDataLoaded,
}: ParetoChartProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ParetoItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accessToken } = useAuth();

  useEffect(() => {
    if (!accessToken) return;
    const fetchPareto = async () => {
      setLoading(true);
      setError(null);
      try {
        const request: ParetoRequestDto = { dimension, clientId, productionLine, defectType, dateFrom, dateTo, measure };
        const result = await paretoService.getPareto(request, accessToken);
        setData(result);
        onDataLoaded?.(result);
      } catch (err) {
        setError(i18n.t('pareto.loadFailed'));
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPareto();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parent callbacks are not memoised; listing them would re-run on every render
  }, [dimension, clientId, productionLine, defectType, dateFrom, dateTo, measure, accessToken]);

  if (loading) return <div className="pareto-state">{t('pareto.loading')}</div>;
  if (error) return <div className="pareto-state pareto-state-error">{error}</div>;
  if (data.length === 0) return <div className="pareto-state">{t('pareto.noData')}</div>;

  // A flat distribution has no "vital few": highlighting most bars would be misleading.
  const vitalCount = data.filter((d) => d.isVitalFew).length;
  const flat = data.length >= 5 && vitalCount >= Math.ceil(data.length * 0.6);
  const valueKey = measure === 'impact' ? 'impact' : 'count';
  const valueLabel = measure === 'impact' ? t('pareto.impactAxis') : t('pareto.occurrences');

  return (
    <div className="pareto-chart-card">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="category" angle={-20} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: valueLabel, angle: -90, position: 'insideLeft' }} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: t('pareto.cumulative'), angle: 90, position: 'insideRight' }} />
          <Tooltip />
          <Bar yAxisId="left" dataKey={valueKey} name={valueLabel}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={flat ? '#64748b' : entry.isVitalFew ? '#d97706' : '#94a3b8'} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name={t('pareto.cumulative')} stroke="#0f2b5c" strokeWidth={2} />
          <ReferenceLine yAxisId="right" y={80} stroke="#dc2626" strokeDasharray="4 4" label={t('pareto.threshold')} />
        </ComposedChart>
      </ResponsiveContainer>
      {flat && (
        <p role="note" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#475569' }}>
          {t('pareto.flat', { vital: vitalCount, total: data.length })}
        </p>
      )}
    </div>
  );
}