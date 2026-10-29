import axios from 'axios';
import { AUTH_API_URL } from '../config/apiEnv';

export interface TurnstileConfig {
  enabled: boolean;
  siteKey: string | null;
}

let cached: Promise<TurnstileConfig> | null = null;

/** Whether the Cloudflare Turnstile check is on (server setting) and the public key of its widget. Off when the server cannot be asked. */
export function getTurnstileConfig(): Promise<TurnstileConfig> {
  cached ??= axios
    .get<TurnstileConfig>(`${AUTH_API_URL}/api/public/turnstile`, { timeout: 5000 })
    .then((r) => ({ enabled: !!r.data.enabled && !!r.data.siteKey, siteKey: r.data.siteKey ?? null }))
    .catch(() => {
      cached = null;                       // try again next time (the API may be waking up)
      return { enabled: false, siteKey: null };
    });
  return cached;
}

/** Forget the answer (tests, or after the administrator changed the setting). */
export function resetTurnstileConfig() {
  cached = null;
}
