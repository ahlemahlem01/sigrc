export type SeverityKey = 'critical' | 'high' | 'medium' | 'low';

/** Maps a stored severity (English or French, any case) to the key of its translation. */
export function severityKey(raw: string | null | undefined): SeverityKey {
  const s = (raw ?? '').trim().toUpperCase();
  if (s.startsWith('CRIT')) return 'critical';
  if (s === 'HIGH' || s.startsWith('ELEV') || s.startsWith('ÉLEV')) return 'high';
  if (s === 'LOW' || s === 'FAIBLE') return 'low';
  return 'medium';
}
