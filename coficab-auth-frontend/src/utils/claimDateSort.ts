export type ClaimDateSort =
  | 'detection-desc'
  | 'detection-asc'
  | 'created-desc'
  | 'created-asc';

export const DEFAULT_CLAIM_DATE_SORT: ClaimDateSort = 'detection-desc';

/** label = i18n key */
export const CLAIM_DATE_SORT_OPTIONS: { value: ClaimDateSort; label: string }[] = [
  { value: 'detection-desc', label: 'dateSort.detectionDesc' },
  { value: 'detection-asc', label: 'dateSort.detectionAsc' },
  { value: 'created-desc', label: 'dateSort.createdDesc' },
  { value: 'created-asc', label: 'dateSort.createdAsc' },
];

function toMs(raw?: string | null): number {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function claimDateMs(
  claim: {
    detectionDate?: string | null;
    createdAt?: string | null;
    DetectionDate?: string | null;
    CreatedAt?: string | null;
  },
  field: 'detection' | 'created'
): number {
  if (field === 'detection') {
    return toMs(claim.detectionDate || claim.DetectionDate || claim.createdAt || claim.CreatedAt);
  }
  return toMs(claim.createdAt || claim.CreatedAt || claim.detectionDate || claim.DetectionDate);
}

export function claimDayKey(claim: {
  detectionDate?: string | null;
  createdAt?: string | null;
  DetectionDate?: string | null;
  CreatedAt?: string | null;
}): string {
  const raw = claim.detectionDate || claim.DetectionDate || claim.createdAt || claim.CreatedAt;
  if (!raw) return '';
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function claimMatchesDateRange(claim: object, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  const day = claimDayKey(claim as any);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function sortClaimsByDate<T extends object>(claims: T[], sort: ClaimDateSort): T[] {
  const field = sort.startsWith('detection') ? 'detection' : 'created';
  const dir = sort.endsWith('desc') ? -1 : 1;
  return [...claims].sort(
    (a, b) => (claimDateMs(a as any, field) - claimDateMs(b as any, field)) * dir
  );
}
