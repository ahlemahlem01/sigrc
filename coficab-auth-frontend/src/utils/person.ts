import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';

export interface PersonEntry {
  userId: string;
  name: string;
  departmentCode: string;
}

const byId = new Map<string, PersonEntry>();
const byName = new Map<string, PersonEntry | null>();   // null: two people of different departments share the name

/** The same name once case, accents and extra spaces are ignored. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Keeps the directory at hand for every screen (called when it is loaded). */
export function setPeopleDirectory(list: PersonEntry[]) {
  byId.clear();
  byName.clear();
  for (const p of list) {
    if (!p.name || !p.departmentCode) continue;
    byId.set(p.userId.toLowerCase(), p);
    const key = fold(p.name);
    const known = byName.get(key);
    if (known === undefined) byName.set(key, p);
    else if (known && known.departmentCode !== p.departmentCode) byName.set(key, null);
  }
}

/** The short code of a person's department (QA, PROD, LOG...), from the id when known, else from the name; '' when unknown. */
export function departmentCodeOf(name?: string | null, userId?: string | null): string {
  if (userId) {
    const hit = byId.get(String(userId).toLowerCase());
    if (hit) return hit.departmentCode;
  }
  if (name) return byName.get(fold(name))?.departmentCode ?? '';
  return '';
}

/**
 * A person's name, always preceded by the short code of their department: "[QA] Ahlem Alaya".
 * Display only: never send the result back to the server. A name that is not a known person (a free text, an e-mail, a company) is left as it is.
 */
export function pn(name?: string | null, userId?: string | null): string {
  const text = (name ?? '').trim();
  if (!text) return name ?? '';
  if (/^\[[^\]]+\]\s/.test(text)) return text;
  const code = departmentCodeOf(text, userId);
  return code ? `[${code}] ${text}` : text;
}

/** Loads the directory once the user is signed in; true when it can be used (or when it could not be loaded: names then show without code). */
export function usePeopleDirectory(): boolean {
  const { accessToken, isAuthenticated } = useAuth();
  const [ready, setReady] = useState(false);
  const signedIn = Boolean(isAuthenticated && accessToken);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  // loaded once per sign-in: a refreshed token must not send the user back to a loading screen
  useEffect(() => {
    if (!signedIn) { setReady(false); return; }
    let cancelled = false;
    axios
      .get(`${ACTION_PLAN_API_URL}/people/directory`, { headers: { Authorization: `Bearer ${tokenRef.current}` }, timeout: 8000 })
      .then((res) => { if (!cancelled) setPeopleDirectory(Array.isArray(res.data) ? res.data : []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [signedIn]);

  return ready;
}
