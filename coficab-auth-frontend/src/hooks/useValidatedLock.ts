import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import { isAdminUser } from '../utils/roles';

/**
 * True once the administrator validated the 5 Why of the claim and the current user is not an administrator: the Ishikawa and
 * the Pareto that the validated root cause rests on are then read-only for them. An administrator can still change them (traced).
 */
export function useValidatedLock(claimId?: string): boolean {
  const { user, accessToken } = useAuth();
  const [validated, setValidated] = useState(false);
  const admin = isAdminUser(user as any);

  useEffect(() => {
    if (!claimId || !accessToken || admin) return;
    let cancelled = false;
    qualityAnalysisService
      .getFiveWhy(claimId, accessToken)
      .then((f) => { if (!cancelled) setValidated(String(f?.statusCode ?? '').toUpperCase() === 'VALIDATED' || f?.isValidated === true); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [claimId, accessToken, admin]);

  return validated && !admin;
}
