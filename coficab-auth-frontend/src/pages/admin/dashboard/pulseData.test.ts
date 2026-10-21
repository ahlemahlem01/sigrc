import { buildPulseData } from './pulseData';

const claims = [
  { month: '2026-07', opened: 200, closed: 180 },
  { month: '2026-08', opened: 183, closed: 170 },
  { month: '2026-09', opened: 150, closed: 160 },
  { month: '2026-10', opened: 0, closed: 0 },
];

describe('buildPulseData', () => {
  it('stops at the last month with activity instead of reading an empty current month as -100 %', () => {
    const p = buildPulseData(claims, [], 'month', 0, 'claims');
    expect(p).not.toBeNull();
    expect(p!.opened.total).toBe(150);
    expect(p!.opened.deltaPercent).toBeCloseTo(-18, 0);
    expect(p!.range.to).toBe('2026-09');
    expect(p!.idleMonths).toBe(1);
    expect(p!.closureRate).toBe(100);
    expect(p!.firstIdleMonth).toBe('2026-10');
  });

  it('compares 3 months with the 3 before when the series is long enough', () => {
    const six = [{ month: '2026-04', opened: 10, closed: 5 }, { month: '2026-05', opened: 10, closed: 5 }, { month: '2026-06', opened: 10, closed: 5 }, ...claims.slice(0, 3)];
    const p = buildPulseData(six, [], '3m', 0, 'claims');
    expect(p!.range).toMatchObject({ from: '2026-07', to: '2026-09', prevFrom: '2026-04', prevTo: '2026-06' });
  });

  it('does not call a balanced flow critical', () => {
    const balanced = [{ month: '2026-08', opened: 100, closed: 100 }, { month: '2026-09', opened: 100, closed: 100 }];
    expect(buildPulseData(balanced, [], 'month', 0, 'claims')!.closureRate).toBe(100);
  });

  it('ignores months where only action plans were active when the scope is claims', () => {
    const plans = [{ month: '2026-09', opened: 5, closed: 3 }, { month: '2026-10', opened: 4, closed: 2 }];
    const p = buildPulseData(claims, plans, 'month', 0, 'claims');
    expect(p!.range.to).toBe('2026-09');
    expect(p!.opened.total).toBe(150);
  });

  it('returns null when fewer than two months have activity', () => {
    expect(buildPulseData([{ month: '2026-09', opened: 1, closed: 0 }], [], 'month')).toBeNull();
  });
});
