import { useEffect, useState } from 'react';
import axios from 'axios';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';

/** The rights that open the validation desk (the codes of PermissionAccess on the server). */
export const VALIDATION_PERMISSIONS = ['8d:validate', 'analysis:validate_fivewhy'];

/** Rights carried by the functions the signed-in person holds (active or by interim), and whether the answer has arrived. */
export function useFunctionRights(): { permissions: string[]; loaded: boolean } {
  const { accessToken } = useAuth();
  const [state, setState] = useState<{ permissions: string[]; loaded: boolean }>({ permissions: [], loaded: false });

  useEffect(() => {
    if (!accessToken) { setState({ permissions: [], loaded: true }); return; }
    let cancelled = false;
    axios.get(`${ACTION_PLAN_API_URL}/functions/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => { if (!cancelled) setState({ permissions: Array.isArray(r.data?.permissions) ? r.data.permissions : [], loaded: true }); })
      .catch(() => { if (!cancelled) setState({ permissions: [], loaded: true }); });
    return () => { cancelled = true; };
  }, [accessToken]);

  return state;
}

export const useFunctionPermissions = (): string[] => useFunctionRights().permissions;

export function canValidate(permissions: string[]): boolean {
  return permissions.some((p) => VALIDATION_PERMISSIONS.includes(p));
}

/** The optional modules the contract switches off (codes). A module that is not listed is active. */
export function useInactiveModules(): string[] {
  const { accessToken } = useAuth();
  const [inactive, setInactive] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken) { setInactive([]); return; }
    let cancelled = false;
    axios.get(`${ACTION_PLAN_API_URL}/system/modules`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => {
        if (!cancelled) setInactive((Array.isArray(r.data) ? r.data : []).filter((m: any) => m.isActive === false).map((m: any) => String(m.code)));
      })
      .catch(() => { if (!cancelled) setInactive([]); });
    return () => { cancelled = true; };
  }, [accessToken]);

  return inactive;
}
