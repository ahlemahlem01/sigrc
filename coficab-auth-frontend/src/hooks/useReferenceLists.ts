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

  const severityItems = data?.lists.severity ?? [];

  /** Configured wording of a level, or null to keep the default translated wording. */
  const severityLabel = (level: string): string | null =>
    severityItems.find((i) => i.value === level.toUpperCase())?.label?.trim() || null;

  /** Levels offered when creating a claim (all four if nothing is configured). */
  const activeSeverities = (): string[] => {
    const active = severityItems.filter((i) => i.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.value);
    return active.length > 0 ? active : [...LEVELS];
  };

  return { defectTypes, severityLabel, activeSeverities };
}
