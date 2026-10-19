import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';
import { normalizeRoles } from '../utils/roles';
import { useAuth } from './AuthContext';

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
}

const KEY = 'coficab_org_scope';
const Ctx = createContext<OrganizationScope | null>(null);

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The organizations the superadmin follows across the whole console. The choice is remembered in the browser and is
 * checked against the organizations that still exist, so a removed organization never leaves the pages empty.
 */
export function OrganizationScopeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, user } = useAuth();
  const canChoose = normalizeRoles(user as any).includes('superadmin');
  const [organizations, setOrganizations] = useState<ScopeOrganization[]>([]);
  const [stored, setStored] = useState<string[]>(readStored);

  useEffect(() => {
    if (!canChoose || !accessToken) { setOrganizations([]); return; }
    let live = true;
    axios.get(`${API_BASE}/organization`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        if (!live) return;
        const rows = (res.data?.data ?? res.data) as { id: string; name: string }[];
        setOrganizations(rows.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => { if (live) setOrganizations([]); });
    return () => { live = false; };
  }, [canChoose, accessToken]);

  const selectedIds = useMemo(() => {
    if (!canChoose) return [];
    // until the list is loaded keep what was stored; afterwards drop the organizations that no longer exist
    return organizations.length === 0 ? stored : stored.filter((id) => organizations.some((o) => o.id === id));
  }, [canChoose, organizations, stored]);

  const setSelectedIds = useCallback((ids: string[]) => {
    setStored(ids);
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* private mode: the choice just is not remembered */ }
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }, [selectedIds, setSelectedIds]);

  const clear = useCallback(() => setSelectedIds([]), [setSelectedIds]);

  const value = useMemo<OrganizationScope>(() => ({
    canChoose,
    organizations,
    selectedIds,
    setSelectedIds,
    toggle,
    clear,
    param: selectedIds.length > 0 ? selectedIds.join(',') : undefined,
  }), [canChoose, organizations, selectedIds, setSelectedIds, toggle, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrganizationScope(): OrganizationScope {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrganizationScope must be used inside OrganizationScopeProvider');
  return ctx;
}
