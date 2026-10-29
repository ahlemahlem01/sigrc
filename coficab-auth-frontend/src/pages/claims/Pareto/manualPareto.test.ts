import { ParetoDimension } from '../../../types/pareto.types';
import { activeFilters, EMPTY_MANUAL, manualDates, manualRequest } from './manualPareto';

describe('manual Pareto configuration', () => {
  it('sends nothing but the axis and the measure when nothing is filtered', () => {
    const request = manualRequest(EMPTY_MANUAL);
    expect(request).toEqual({
      dimension: ParetoDimension.DefectType, defectType: undefined, productionLine: undefined, clientId: undefined, shift: undefined, severity: undefined, measure: 'count',
    });
  });

  it('keeps the filters that are set, trimmed, and drops the one of the axis being analysed', () => {
    const cfg = { ...EMPTY_MANUAL, dimension: ParetoDimension.Shift, shift: 'Soir', productionLine: ' WR-04 ', severity: 'HIGH' };
    const request = manualRequest(cfg);
    expect(request.shift).toBeUndefined();                    // analysing by shift while filtering on one shift would show one bar
    expect(request.productionLine).toBe('WR-04');
    expect(request.severity).toBe('HIGH');
    expect(activeFilters(cfg).map((f) => f.axis)).toEqual([ParetoDimension.ProductionLine, ParetoDimension.Severity]);
  });

  it('turns a preset period into a start date, and "all" into none', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(manualDates({ ...EMPTY_MANUAL, period: 'all' }, now)).toEqual({});
    const six = manualDates({ ...EMPTY_MANUAL, period: '6' }, now);
    expect(new Date(six.dateFrom!).getMonth()).toBe(3);        // April
    expect(six.dateTo).toBeUndefined();
  });

  it('counts the whole last day of a custom period, and puts a back-to-front one in order', () => {
    const range = manualDates({ ...EMPTY_MANUAL, period: 'custom', from: '2026-03-01', to: '2026-03-31' });
    expect(new Date(range.dateTo!).getTime() - new Date(range.dateFrom!).getTime()).toBeGreaterThan(30 * 24 * 3600 * 1000);
    const swapped = manualDates({ ...EMPTY_MANUAL, period: 'custom', from: '2026-03-31', to: '2026-03-01' });
    expect(swapped).toEqual(range);
    expect(manualDates({ ...EMPTY_MANUAL, period: 'custom', from: '2026-03-01' }).dateTo).toBeUndefined();   // an open end is allowed
  });
});
