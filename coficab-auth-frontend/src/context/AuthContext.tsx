import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { clearAccessToken, loadAccessToken, saveAccessToken, withRefreshLock } from '../utils/sessionRefresh';
import {
  getUserInfo,
  login as loginService,
  refreshToken as refreshTokenService,
  UserInfo,
} from '../services/authService';
import { employeeService } from '../services/employeeService';
import { resolveDisplayName } from '../utils/displayName';

interface AuthContextType {
  user: UserInfo | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
  updateUser: (updatedFields: Partial<UserInfo> & Record<string, any>) => void;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Fusionne identité du compte (7102) + profil employé (7204).
 * Les rôles / permissions du compte ne doivent JAMAIS être écrasés par le profil RH
 * (ex. Role="Collaborateur" en base UserProfiles).
 * Les champs du compte non vides (department, etc.) ne doivent pas être écrasés par null.
 */
const fetchFullUserProfile = async (token: string): Promise<UserInfo> => {
  const authInfo = await getUserInfo(token);
  try {
    const empProfile = (await employeeService.getProfile(token)) as Record<string, any>;
    const {
      role: _ignoreRole,
      roles: _ignoreRoles,
      permission: _ignorePermission,
      permissions: _ignorePermissions,
      ...empSafe
    } = empProfile || {};

    const prefer = (...vals: unknown[]) => {
      for (const v of vals) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s && s !== 'null' && s !== 'undefined') return s;
      }
      return undefined;
    };

    const merged = { ...authInfo, ...empSafe } as UserInfo;
    const display = resolveDisplayName({
      ...merged,
      name: prefer(empSafe?.name, empSafe?.fullName, authInfo.name, (authInfo as any).fullName),
    } as any);

    return {
      ...merged,
      role: authInfo.role,
      permission: authInfo.permission,
      name: display,
      fullName: display,
      email: prefer(empSafe?.email, authInfo.email) ?? authInfo.email,
      department: prefer(
        empSafe?.department,
        empSafe?.Department,
        authInfo.department,
        (authInfo as any).Department,
      ),
      organizationName: prefer(
        empSafe?.organizationName,
        (authInfo as any).organizationName,
        (authInfo as any).organization,
      ),
      organizationId: prefer(
        empSafe?.organizationId,
        (authInfo as any).organizationId,
      ),
      managerName: prefer(
        empSafe?.managerName,
        empSafe?.ManagerName,
        (authInfo as any).managerName,
      ),
      managerEmail: prefer(
        empSafe?.managerEmail,
        (authInfo as any).managerEmail,
      ),
      hireDate: prefer(empSafe?.hireDate, (authInfo as any).hireDate) ?? (authInfo as any).hireDate,
      status: prefer(empSafe?.status, (authInfo as any).status) ?? (authInfo as any).status,
      profilePictureUrl:
        prefer(empSafe?.profilePictureUrl, empSafe?.ProfilePictureUrl, (authInfo as any)?.profilePictureUrl) ||
        undefined,
      poste: prefer(empSafe?.poste, (authInfo as any).poste),
      equipe: prefer(empSafe?.equipe, (authInfo as any).equipe),
      ligneProduction: prefer(empSafe?.ligneProduction, (authInfo as any).ligneProduction),
      telephone: prefer(empSafe?.telephone, empSafe?.phone, (authInfo as any).telephone, authInfo.phone),
      phone: prefer(empSafe?.telephone, empSafe?.phone, (authInfo as any).telephone, authInfo.phone),
    };
  } catch (err) {
    console.warn('Impossible de charger le profil employé (7204), fallback sur AuthInfo (7102):', err);
    const display = resolveDisplayName(authInfo as any);
    return { ...authInfo, name: display, fullName: display };
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUserProfile = useCallback(async () => {
    if (!accessToken) return;
    try {
      const fullUser = await fetchFullUserProfile(accessToken);
      setUser(fullUser);
    } catch (err) {
      console.error('Erreur lors du rafraîchissement du profil:', err);
    }
  }, [accessToken]);

  // When the current access token expires (ms since epoch). Tokens last about an hour;
  // without renewal every request fails with 401 until the page is reloaded.
  const expiresAtRef = useRef<number>(0);

  const applyTokens = useCallback((data: { access_token: string; refresh_token: string; expires_in?: number }) => {
    setAccessToken(data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    expiresAtRef.current = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    saveAccessToken(data.access_token, expiresAtRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    /** The server answered and said no (revoked, expired, already used): the session is over. Anything else is a hiccup. */
    const refused = (err: any) => [400, 401, 403].includes(Number(err?.response?.status));

    const restore = async (storedRefreshToken: string) => {
      // a reload keeps the access token of this tab: nothing to renew, so nothing to lose
      const kept = loadAccessToken();
      if (kept) {
        try {
          const fullUser = await fetchFullUserProfile(kept.token);
          if (cancelled) return;
          setAccessToken(kept.token);
          expiresAtRef.current = kept.expiresAt;
          setUser(fullUser);
          return;
        } catch {
          clearAccessToken();   // refused or unreachable: renew below
        }
      }

      // one renewal at a time across tabs, with the newest refresh token
      const data = await withRefreshLock(async () => {
        const latest = localStorage.getItem('refresh_token') ?? storedRefreshToken;
        const result = await refreshTokenService(latest);
        localStorage.setItem('refresh_token', result.refresh_token);
        return result;
      });
      if (cancelled) return;
      applyTokens(data);
      const fullUser = await fetchFullUserProfile(data.access_token);
      if (!cancelled) setUser(fullUser);
    };

    const initAuth = async () => {
      const storedRefreshToken = localStorage.getItem('refresh_token');
      if (storedRefreshToken) {
        // An API that is restarting must not end the session: try again for about half a minute.
        for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
          try {
            await restore(storedRefreshToken);
            break;
          } catch (err) {
            if (refused(err)) {
              console.error('Échec de la connexion automatique:', err);
              localStorage.removeItem('refresh_token');
              clearAccessToken();
              setAccessToken(null);
              setUser(null);
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 4000));
          }
        }
      }
      if (!cancelled) setIsLoading(false);
    };

    void initAuth();
    return () => { cancelled = true; };
  }, [applyTokens]);

  // Keep the session alive: renew the access token a minute before it expires, and right away when the
  // tab becomes visible again after the computer slept (timers do not run while it is suspended).
  useEffect(() => {
    if (!accessToken) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const renew = async () => {
      if (!localStorage.getItem('refresh_token') || cancelled) return;
      try {
        // another tab may have renewed already: read the newest refresh token once the lock is ours
        const data = await withRefreshLock(async () => {
          const latest = localStorage.getItem('refresh_token');
          if (!latest) throw new Error('no refresh token');
          const result = await refreshTokenService(latest);
          localStorage.setItem('refresh_token', result.refresh_token);
          return result;
        });
        applyTokens(data);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response) {
          // The server refused the refresh token (revoked or expired): the session is over.
          localStorage.removeItem('refresh_token');
          clearAccessToken();
          setAccessToken(null);
          setUser(null);
        } else {
          // Network down or API restarting: keep the session and try again shortly.
          timer = setTimeout(() => void renew(), 30_000);
        }
      }
    };

    const msLeft = expiresAtRef.current - Date.now();
    timer = setTimeout(() => void renew(), Math.max(msLeft - 60_000, 5_000));

    const onWake = () => {
      if (document.visibilityState === 'visible' && expiresAtRef.current - Date.now() < 60_000) {
        if (timer) clearTimeout(timer);
        void renew();
      }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [accessToken, applyTokens]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await loginService(email, password);
      applyTokens(data);

      const fullUser = await fetchFullUserProfile(data.access_token);
      setUser(fullUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('refresh_token');
    clearAccessToken();
    expiresAtRef.current = 0;
    setAccessToken(null);
    setUser(null);
  };

  const updateUser = (updatedFields: Partial<UserInfo> & Record<string, any>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updatedFields };
      // Ne jamais laisser un update local écraser les rôles du compte avec un rôle RH
      if (updatedFields.role !== undefined && prev.role) {
        const prevRoles = Array.isArray(prev.role) ? prev.role : [prev.role];
        const isIamAdmin = prevRoles.some((r) =>
          ['admin', 'superadmin'].includes(String(r).toLowerCase()),
        );
        if (isIamAdmin) next.role = prev.role;
      }
      return next;
    });
  };

  const hasRole = (role: string): boolean => {
    if (!user || !user.role) return false;
    const needle = role.toLowerCase();
    if (Array.isArray(user.role)) {
      return user.role.some((r) => String(r).toLowerCase() === needle);
    }
    return String(user.role).toLowerCase() === needle;
  };

  const hasPermission = (permission: string): boolean => {
    if (!user || !user.permission) return false;
    if (Array.isArray(user.permission)) return user.permission.includes(permission);
    return user.permission === permission;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!accessToken && !!user,
        isLoading,
        login,
        logout,
        hasRole,
        hasPermission,
        updateUser,
        refreshUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};
