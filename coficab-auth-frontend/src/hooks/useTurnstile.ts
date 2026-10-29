import { useEffect, useState } from 'react';
import { getTurnstileConfig, TurnstileConfig } from '../services/turnstileService';

/**
 * State of the Turnstile check for a form: whether it is on, the token the visitor earned, and a counter that renews the widget
 * after an attempt (a token is single-use). `ready` is true when nothing is asked, or the token is there.
 */
export function useTurnstile() {
  const [config, setConfig] = useState<TurnstileConfig | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getTurnstileConfig().then((c) => { if (live) setConfig(c); });
    return () => { live = false; };
  }, []);

  const enabled = !!config?.enabled;
  return {
    enabled,
    siteKey: config?.siteKey ?? null,
    token,
    setToken,
    unavailable,
    setUnavailable,
    errorCode,
    setErrorCode,
    /** What a Cloudflare error code means for the person who runs the site (translated key under login.turnstileHint). */
    hintKey: errorCode === null ? null : errorCode.startsWith('1102') ? 'host' : errorCode.startsWith('1101') ? 'key' : 'client',
    resetKey,
    /** Ask for a new token (call after every attempt, successful or not). */
    renew: () => { setToken(null); setResetKey((k) => k + 1); },
    ready: config !== null && (!enabled || !!token),
  };
}
