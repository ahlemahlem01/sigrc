import { computeStreamEvolution } from './workflowEvolution';

describe('computeStreamEvolution', () => {
  const series = [
    { month: '2026-08', opened: 183, closed: 170 },
    { month: '2026-09', opened: 150, closed: 160 },
    { month: '2026-10', opened: 0, closed: 0 },
  ];

  it('compares the last two months that had activity and reports the empty one', () => {
    const e = computeStreamEvolution(series)!;
    expect(e.month).toBe('2026-09');
    expect(e.prevMonth).toBe('2026-08');
    expect(e.opened).toBe(150);
    expect(e.idleMonths).toBe(1);
    expect(e.firstIdleMonth).toBe('2026-10');
    expect(e.backlogDelta).toBe(-23);
  });

  it('keeps the usual comparison when the current month has activity', () => {
    const e = computeStreamEvolution([...series.slice(0, 2), { month: '2026-10', opened: 5, closed: 1 }])!;
    expect(e.month).toBe('2026-10');
    expect(e.idleMonths).toBe(0);
  });

  it('returns null when fewer than two months have activity', () => {
    expect(computeStreamEvolution([{ month: '2026-09', opened: 1, closed: 0 }, { month: '2026-10', opened: 0, closed: 0 }])).toBeNull();
  });
});
