import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import { resolveClaimStatus } from '../utils/Claimutils';

/** True once the claim is closed: its analyses are then shown as they were when it was closed, without any way to change them. */
export function useClaimClosed(claimId?: string): boolean {
  const { accessToken } = useAuth();
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!claimId || !accessToken) return;
    let cancelled = false;
    qualityAnalysisService
      .getClaimById(claimId, accessToken)
      .then((c) => { if (!cancelled) setClosed(resolveClaimStatus(c) === 'CLOTUREE'); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [claimId, accessToken]);

  return closed;
}
