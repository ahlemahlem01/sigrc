import { ParetoDimension, ParetoMeasure } from '../../../types/pareto.types';

/** What the person chose by hand for the Pareto analysis: the axis, the filters, the period and the measure. Empty text = no filter. */
export interface ManualParetoConfig {
  dimension: ParetoDimension;
  defectType: string;
  productionLine: string;
  clientId: string;
  shift: string;
  severity: string;
  period: 'all' | '6' | '12' | '24' | 'custom';
  from: string;       // yyyy-mm-dd (custom period)
  to: string;
  measure: ParetoMeasure;
}

export const EMPTY_MANUAL: ManualParetoConfig = {
  dimension: ParetoDimension.DefectType, defectType: '', productionLine: '', clientId: '', shift: '', severity: '',
  period: 'all', from: '', to: '', measure: 'count',
};

/** The axes a person can analyse by (the filters are the same list: analysing by one axis while filtering on it is allowed but pointless, so the panel hides that filter). */
export const MANUAL_DIMENSIONS: ParetoDimension[] = [
  ParetoDimension.DefectType, ParetoDimension.ProductionLine, ParetoDimension.ClientId, ParetoDimension.Shift, ParetoDimension.Severity,
];

/** Start and end of the period as the API wants them (the last day counts until its end). A custom period that is back to front is put in order. */
export function manualDates(cfg: ManualParetoConfig, now: Date = new Date()): { dateFrom?: string; dateTo?: string } {
  if (cfg.period === 'all') return {};
  if (cfg.period === 'custom') {
    let from = cfg.from ? new Date(`${cfg.from}T00:00:00`) : undefined;
    let to = cfg.to ? new Date(`${cfg.to}T23:59:59.999`) : undefined;
    if (from && to && from > to) [from, to] = [new Date(`${cfg.to}T00:00:00`), new Date(`${cfg.from}T23:59:59.999`)];
    return { dateFrom: from?.toISOString(), dateTo: to?.toISOString() };
  }
  const start = new Date(now);
  start.setMonth(start.getMonth() - Number(cfg.period));
  return { dateFrom: start.toISOString() };
}

/** The filters that are set, as [axis, value] pairs, left out for the axis being analysed (it would filter the very thing it shows). */
export function activeFilters(cfg: ManualParetoConfig): { axis: ParetoDimension; value: string }[] {
  const all: { axis: ParetoDimension; value: string }[] = [
    { axis: ParetoDimension.DefectType, value: cfg.defectType },
    { axis: ParetoDimension.ProductionLine, value: cfg.productionLine },
    { axis: ParetoDimension.ClientId, value: cfg.clientId },
    { axis: ParetoDimension.Shift, value: cfg.shift },
    { axis: ParetoDimension.Severity, value: cfg.severity },
  ];
  return all.filter((f) => f.value.trim() !== '' && f.axis !== cfg.dimension);
}

/** What the chart needs: filters of the axis being analysed are dropped, the others sent as they are. */
export function manualRequest(cfg: ManualParetoConfig, now: Date = new Date()) {
  const keep = (axis: ParetoDimension, value: string) => (axis === cfg.dimension || value.trim() === '' ? undefined : value.trim());
  return {
    dimension: cfg.dimension,
    defectType: keep(ParetoDimension.DefectType, cfg.defectType),
    productionLine: keep(ParetoDimension.ProductionLine, cfg.productionLine),
    clientId: keep(ParetoDimension.ClientId, cfg.clientId),
    shift: keep(ParetoDimension.Shift, cfg.shift),
    severity: keep(ParetoDimension.Severity, cfg.severity),
    measure: cfg.measure,
    ...manualDates(cfg, now),
  };
}
