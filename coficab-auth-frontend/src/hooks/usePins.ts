import { useCallback, useEffect, useState } from 'react';

/** A file the employee keeps close at hand (claim, plan or 8D file). Stored in this browser only. */
export interface Pin {
  id: string;
  kind: 'claim' | 'plan' | 'alert';
  title: string;
  ref?: string;
  path: string;
}

const MAX_PINS = 12;
const EVENT = 'coficab-pins-changed';

function read(key: string): Pin[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.id === 'string' && typeof p.path === 'string') : [];
  } catch {
    return [];
  }
}

export function usePins(userKey: string | undefined) {
  const key = `coficab_pins_${userKey || 'anon'}`;
  const [pins, setPins] = useState<Pin[]>(() => read(key));

  useEffect(() => {
    setPins(read(key));
    const sync = () => setPins(read(key));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);

  const toggle = useCallback((pin: Pin) => {
    const current = read(key);
    const next = current.some((p) => p.id === pin.id)
      ? current.filter((p) => p.id !== pin.id)
      : [pin, ...current].slice(0, MAX_PINS);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setPins(next);
    window.dispatchEvent(new Event(EVENT));
  }, [key]);

  const isPinned = useCallback((id: string) => pins.some((p) => p.id === id), [pins]);
  return { pins, toggle, isPinned };
}
