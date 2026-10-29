import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onloadTurnstile?: () => void;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstile';
let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    window.onloadTurnstile = () => resolve();
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onerror = () => { loading = null; reject(new Error('turnstile script')); };
    document.head.appendChild(tag);
  });
  return loading;
}

/**
 * The Cloudflare Turnstile widget ("are you a person?"). `onToken` gets the token once the visitor passes the check (and null when it
 * expires or fails); a token works once, so change `resetKey` after each attempt to ask for a new one.
 */
export default function TurnstileWidget({ siteKey, onToken, resetKey = 0, onUnavailable, onError }: {
  siteKey: string; onToken: (token: string | null) => void; resetKey?: number; onUnavailable?: () => void; onError?: (code: string | null) => void;
}) {
  const { i18n } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const callbacks = useRef({ onToken, onUnavailable, onError });
  callbacks.current = { onToken, onUnavailable, onError };

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: (i18n.language || 'fr').slice(0, 2),
          theme: 'light',
          callback: (token: string) => { callbacks.current.onError?.(null); callbacks.current.onToken(token); },
          'expired-callback': () => callbacks.current.onToken(null),
          // Cloudflare says why it failed (for example 110200: this host is not in the widget's hostname list)
          'error-callback': (code: string) => {
            console.warn('Cloudflare Turnstile error', code);
            callbacks.current.onError?.(String(code));
            callbacks.current.onToken(null);
          },
        });
      })
      .catch(() => { if (!cancelled) callbacks.current.onUnavailable?.(); });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = undefined;
    };
  }, [siteKey, i18n.language]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      callbacks.current.onToken(null);
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={box} data-testid="turnstile" style={{ minHeight: 65, margin: '4px 0 22px' }} />;
}
