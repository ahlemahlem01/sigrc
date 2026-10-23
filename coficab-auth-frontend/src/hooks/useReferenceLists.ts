import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ReferenceLists, referenceListsService } from '../services/referenceListsService';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

let cache: ReferenceLists | null = null;
let inflight: Promise<ReferenceLists> | null = null;

/** Forget the cached lists (after an admin changed them). */
export function resetReferenceListsCache(next?: ReferenceLists) {
  cache = next ?? null;
  inflight = null;
}

/**
 * Defect-type suggestions and severity wording configured for this industry.
 * Fail-open: while loading, or if the lists are empty / unreachable, the forms behave exactly as before.
 */
export function useReferenceLists() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<ReferenceLists | null>(cache);

  useEffect(() => {
    if (!accessToken || cache) return;
    let cancelled = false;
    inflight ??= referenceListsService.get(accessToken);
    inflight
      .then((lists) => {
        cache = lists;
        if (!cancelled) setData(lists);
      })
      .catch(() => { inflight = null; });
    return () => { cancelled = true; };
  }, [accessToken]);

  const defectTypes = data?.defectTypeSuggestions ?? [];

  /** The active entries of a listed vocabulary (customers, production lines, shifts), in the configured order. */
  const listed = (key: 'client' | 'production-line' | 'shift'): string[] =>
    (data?.lists[key] ?? []).filter((i) => i.isActive && !i.mergedInto).sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value)).map((i) => i.value);

  const severityItems = data?.lists.severity ?? [];

  /** Configured wording of a level, or null to keep the default translated wording. */
  const severityLabel = (level: string): string | null =>
    severityItems.find((i) => i.value === level.toUpperCase())?.label?.trim() || null;

  /** Levels offered when creating a claim (all four if nothing is configured). */
  const activeSeverities = (): string[] => {
    const active = severityItems.filter((i) => i.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.value);
    return active.length > 0 ? active : [...LEVELS];
  };

  /** True when the list is strict, has active values, and the value is not one of them (same rule as the server). */
  const isRefused = (key: 'client' | 'production-line' | 'shift', value: string): boolean => {
    if (!data?.strict?.[key]) return false;
    const allowed = listed(key);
    const text = value.trim().toLowerCase();
    return allowed.length > 0 && text.length > 0 && !allowed.some((a) => a.trim().toLowerCase() === text);
  };

  return { isRefused, defectTypes, severityLabel, activeSeverities, clients: listed('client'), productionLines: listed('production-line'), shifts: listed('shift') };
}
