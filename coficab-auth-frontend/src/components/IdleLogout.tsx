import { useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';

export const IDLE_LOGOUT_FLAG = 'idle_logout';
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/**
 * Automatic logout after X minutes without activity (specification): X is set by the local administrator
 * (Settings > Security and licences). 0 turns it off. A failed request leaves the session alone.
 */
export default function IdleLogout() {
  const { accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const timer = useRef<number | null>(null);
  // The access token is renewed every few minutes. The countdown must survive a renewal: the effect depends on
  // being signed in, not on the token value, and reads the current token from this ref.
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const signedIn = !!accessToken;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let minutes = 0;

    const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    const arm = () => {
      clear();
      if (minutes <= 0) return;
      timer.current = window.setTimeout(() => {
        try { sessionStorage.setItem(IDLE_LOGOUT_FLAG, '1'); } catch { /* the message is a convenience */ }
        logout();
        navigate('/login');
      }, minutes * 60_000);
    };
    // the reset is throttled: a mouse move fires dozens of events per second
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      arm();
    };

    axios.get(`${ACTION_PLAN_API_URL}/system/session`, { headers: { Authorization: `Bearer ${tokenRef.current}` } })
      .then((r) => {
        if (cancelled) return;
        minutes = Number(r.data?.idleMinutes) || 0;
        arm();
        EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
      })
      .catch(() => { /* no setting: no automatic logout */ });

    return () => {
      cancelled = true;
      clear();
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  return null;
}
