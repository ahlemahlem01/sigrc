import { useTranslation } from 'react-i18next';
import { ParetoDimension } from '../../../types/pareto.types';
import { useReferenceLists } from '../../../hooks/useReferenceLists';
import { defectLabel } from '../../../utils/defectLabel';
import { EMPTY_MANUAL, ManualParetoConfig, MANUAL_DIMENSIONS } from './manualPareto';

/** "Analyse manuelle": the person decides the axis, the filters, the period and the measure, instead of following the guided setup. */
export default function ManualParetoPanel({ config, onChange, onPrefill }: {
  config: ManualParetoConfig; onChange: (next: ManualParetoConfig) => void; onPrefill?: () => void;
}) {
  const { t } = useTranslation();
  const lists = useReferenceLists();
  const set = <K extends keyof ManualParetoConfig>(key: K, value: ManualParetoConfig[K]) => onChange({ ...config, [key]: value });

  const filter = (axis: ParetoDimension, key: 'defectType' | 'productionLine' | 'clientId' | 'shift' | 'severity', options: { value: string; label: string }[]) => {
    if (axis === config.dimension) return null;          // the axis being analysed is not filtered
    return (
      <label key={axis} className="pareto-manual-field">
        <span>{t(`pareto.dim.${axis}`)}</span>
        <select className="pareto-select" value={config[key]} onChange={(e) => set(key, e.target.value)}>
          <option value="">{t('pareto.manual.all')}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  };

  const severities = lists.activeSeverities().map((level) => ({ value: level, label: lists.severityLabel(level) ?? t(`pareto.sev.${level}`, { defaultValue: level }) }));
  const plain = (values: string[]) => values.map((v) => ({ value: v, label: v }));

  return (
    <section className="pareto-manual" aria-label={t('pareto.manual.title')}>
      <style>{`
        .pareto-manual { border: 1px solid #dbe2ff; background: #f8faff; border-radius: 12px; padding: 14px 16px; margin: 0 0 14px; }
        .pareto-manual h2 { margin: 0 0 2px; font-size: 15px; color: #000168; }
        .pareto-manual p.help { margin: 0 0 12px; font-size: 12.5px; color: #64748b; }
        .pareto-manual-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 14px; }
        .pareto-manual-field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: #475569; }
        .pareto-manual-field .pareto-select, .pareto-manual-field input { width: 100%; box-sizing: border-box; }
        .pareto-manual-field input[type=date] { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
        .pareto-manual-axis { grid-column: 1 / -1; }
        .pareto-manual-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .pareto-manual-btn { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 12px; font-size: 12.5px; font-weight: 600; color: #334155; cursor: pointer; }
        .pareto-manual-btn:hover { border-color: #000168; color: #000168; }
        .pareto-manual-filters-title { grid-column: 1 / -1; margin: 6px 0 -2px; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #94a3b8; }
      `}</style>
      <h2>{t('pareto.manual.title')}</h2>
      <p className="help">{t('pareto.manual.help')}</p>

      <div className="pareto-manual-grid">
        <label className="pareto-manual-field pareto-manual-axis">
          <span>{t('pareto.manual.analyzeBy')}</span>
          <select className="pareto-select" value={config.dimension} onChange={(e) => set('dimension', e.target.value as ParetoDimension)}>
            {MANUAL_DIMENSIONS.map((d) => <option key={d} value={d}>{t(`pareto.dim.${d}`)}</option>)}
          </select>
        </label>

        <div className="pareto-manual-filters-title">{t('pareto.manual.filters')}</div>
        {filter(ParetoDimension.DefectType, 'defectType', lists.defectTypes.map((d) => ({ value: d, label: defectLabel(d) || d })))}
        {filter(ParetoDimension.ProductionLine, 'productionLine', plain(lists.productionLines))}
        {filter(ParetoDimension.ClientId, 'clientId', plain(lists.clients))}
        {filter(ParetoDimension.Shift, 'shift', plain(lists.shifts))}
        {filter(ParetoDimension.Severity, 'severity', severities)}

        <div className="pareto-manual-filters-title">{t('pareto.manual.periodTitle')}</div>
        <label className="pareto-manual-field">
          <span>{t('pareto.period')}</span>
          <select className="pareto-select" value={config.period} onChange={(e) => set('period', e.target.value as ManualParetoConfig['period'])}>
            <option value="all">{t('pareto.periodAll')}</option>
            <option value="6">{t('pareto.period6')}</option>
            <option value="12">{t('pareto.period12')}</option>
            <option value="24">{t('pareto.period24')}</option>
            <option value="custom">{t('pareto.manual.periodCustom')}</option>
          </select>
        </label>
        {config.period === 'custom' && (
          <>
            <label className="pareto-manual-field"><span>{t('pareto.manual.from')}</span><input type="date" value={config.from} max={config.to || undefined} onChange={(e) => set('from', e.target.value)} /></label>
            <label className="pareto-manual-field"><span>{t('pareto.manual.to')}</span><input type="date" value={config.to} min={config.from || undefined} onChange={(e) => set('to', e.target.value)} /></label>
          </>
        )}
        <label className="pareto-manual-field">
          <span>{t('pareto.measureLabel')}</span>
          <select className="pareto-select" value={config.measure} onChange={(e) => set('measure', e.target.value as ManualParetoConfig['measure'])}>
            <option value="count">{t('pareto.measureCount')}</option>
            <option value="impact">{t('pareto.measureImpact')}</option>
          </select>
        </label>
      </div>

      <div className="pareto-manual-actions">
        {onPrefill && <button type="button" className="pareto-manual-btn" onClick={onPrefill}>{t('pareto.manual.prefill')}</button>}
        <button type="button" className="pareto-manual-btn" onClick={() => onChange({ ...EMPTY_MANUAL })}>{t('pareto.manual.reset')}</button>
      </div>
    </section>
  );
}
