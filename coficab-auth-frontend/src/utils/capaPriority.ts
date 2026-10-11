/** Backend PlanAction.Priority: 1=High, 2=Medium, 3=Low */
export type PlanActionPriority = 'low' | 'medium' | 'high';

export function priorityToNumber(p: PlanActionPriority): number {
  return ({ high: 1, medium: 2, low: 3 } as const)[p] ?? 2;
}

export function numberToPriority(raw: unknown): PlanActionPriority {
  if (typeof raw === 'number') {
    if (raw === 1) return 'high';
    if (raw === 2) return 'medium';
    if (raw === 3) return 'low';
    // legacy 0/1/2 mapping still seen in old rows
    if (raw === 0) return 'low';
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'high' || s === '1') return 'high';
  if (s === 'medium' || s === '2') return 'medium';
  if (s === 'low' || s === '3' || s === '0') return 'low';
  return 'medium';
}
