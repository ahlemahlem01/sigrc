import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';
import { normalizeRoles } from '../utils/roles';
import { useAuth } from './AuthContext';
import { setScopeParam } from '../services/organizationScopeStore';

export interface ScopeOrganization { id: string; name: string }

interface OrganizationScope {
  /** The superadmin follows the organizations of their choice; everyone else keeps their own view. */
  canChoose: boolean;
  organizations: ScopeOrganization[];
  /** Ids followed together; empty means every organization. */
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  toggle: (id: string) => void;
  clear: () => void;
  /** "id1,id2" for the API, or undefined when nothing is selected. */
  param: string | undefined;
  /** False for a superadmin until the organizations are loaded: the default choice is not known before. */
  ready: boolean;
}

const KEY = 'coficab_org_scope';
const Ctx = createContext<OrganizationScope | null>(null);

/** null: never chosen yet. */
function readStored(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/** The organization followed until the superadmin chooses otherwise. */
const DEFAULT_ORGANIZATION = /tunisi/i;

/**
 * The organizations the superadmin follows across the whole console. The choice is remembered in the browser and is
 * checked against the organizations that still exist, so a removed organization never leaves the pages empty.
 */
export function OrganizationScopeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth();
  const canChoose = normalizeRoles(user as any).includes('superadmin');
  const [organizations, setOrganizations] = useState<ScopeOrganization[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stored, setStored] = useState<string[] | null>(readStored);

  useEffect(() => {
    if (!canChoose || !accessToken) { setOrganizations([]); setLoaded(false); return; }
    let live = true;
    axios.get(`${API_BASE}/organization`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        if (!live) return;
        const rows = (res.data?.data ?? res.data) as { id: string; name: string }[];
        setOrganizations(rows.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)));
        setLoaded(true);
      })
      .catch(() => { if (live) { setOrganizations([]); setLoaded(true); } });
    return () => { live = false; };
  }, [canChoose, accessToken]);

  const selectedIds = useMemo(() => {
    if (!canChoose) return [];
    if (organizations.length === 0) return stored ?? [];
    if (stored === null) {
      const fallback = organizations.find((o) => DEFAULT_ORGANIZATION.test(o.name));
      return fallback ? [fallback.id] : [];
    }
    // drop the organizations that no longer exist
    return stored.filter((id) => organizations.some((o) => o.id === id));
  }, [canChoose, organizations, stored]);

  const setSelectedIds = useCallback((ids: string[]) => {
    setStored(ids);
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* private mode: the choice just is not remembered */ }
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }, [selectedIds, setSelectedIds]);

  const clear = useCallback(() => setSelectedIds([]), [setSelectedIds]);

  const param = selectedIds.length > 0 ? selectedIds.join(',') : undefined;
  // set while rendering so that the children's first requests already carry it
  setScopeParam(canChoose && (organizations.length > 0 || stored !== null) ? param : undefined);

  const value = useMemo<OrganizationScope>(() => ({
    canChoose,
    organizations,
    selectedIds,
    setSelectedIds,
    toggle,
    clear,
    param,
    ready: !canChoose || loaded,
  }), [canChoose, loaded, organizations, selectedIds, setSelectedIds, toggle, clear, param]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrganizationScope(): OrganizationScope {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrganizationScope must be used inside OrganizationScopeProvider');
  return ctx;
}
