import { useCallback, useEffect, useState } from 'react';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import type { Claim } from '../types/qualityAnalysis';

/** The claims the connected employee declared (created by them), newest first. */
export function useMyDeclarations(accessToken: string | null | undefined) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const rows = await qualityAnalysisService.getClaims(undefined, accessToken, undefined, { createdBy: 'me' });
      setClaims(
        [...rows].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void reload(); }, [reload]);
  return { claims, loading, failed, reload };
}
