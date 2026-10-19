/**
 * Refresh tokens are single use: when two tabs (or two page loads) renew the session at the same moment the second
 * one is refused and the user is logged out. Two measures keep that from happening:
 *  - renewals run one at a time across tabs (Web Locks), each reading the newest refresh token only once it holds the lock;
 *  - the short-lived access token is kept in the tab's session storage, so reloading a page does not renew anything.
 */
const LOCK = 'coficab-token-refresh';
const ACCESS_KEY = 'coficab_access';
/** An access token with less than this left is not reused. */
const MIN_LEFT_MS = 60_000;

/** Runs the renewal alone: no other tab renews while it runs. Browsers without Web Locks just run it. */
export async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return work();
  return locks.request(LOCK, work) as Promise<T>;
}

export function saveAccessToken(token: string, expiresAt: number) {
  try { sessionStorage.setItem(ACCESS_KEY, JSON.stringify({ token, expiresAt })); } catch { /* storage unavailable: a reload will renew instead */ }
}

/** The access token kept by this tab, when it is still good for a while. */
export function loadAccessToken(): { token: string; expiresAt: number } | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (!saved.token || !saved.expiresAt || saved.expiresAt - Date.now() < MIN_LEFT_MS) return null;
    return { token: saved.token, expiresAt: saved.expiresAt };
  } catch {
    return null;
  }
}

export function clearAccessToken() {
  try { sessionStorage.removeItem(ACCESS_KEY); } catch { /* nothing to clear */ }
}
