import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { defaultPrefs, readPrefs, StoredPrefs, writePrefs, ExportFormat, ImportFormat } from '../utils/dataExchange';
import { AUTH_API_URL as AUTH_API } from '../config/apiEnv';

type PreferencesContextType = StoredPrefs & {
  ready: boolean;
  save: (next: Partial<StoredPrefs>) => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextType>({
  ...defaultPrefs,
  ready: false,
  save: async () => undefined,
});


async function fetchPrefs(token: string): Promise<StoredPrefs> {
  const res = await fetch(`${AUTH_API}/api/me/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return readPrefs();
  const data = await res.json();
  return {
    theme: data.theme === 'dark' ? 'dark' : 'light',
    exportFormat: data.exportFormat === 'excel' || data.exportFormat === 'pdf' ? data.exportFormat : 'csv',
    importFormat: data.importFormat === 'excel' ? 'excel' : 'csv',
  };
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [prefs, setPrefs] = useState<StoredPrefs>(readPrefs());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  useEffect(() => {
    if (!accessToken) {
      setReady(true);
      return;
    }
    let active = true;
    void fetchPrefs(accessToken).then((next) => {
      if (!active) return;
      setPrefs(next);
      writePrefs(next);
      setReady(true);
    });
    return () => { active = false; };
  }, [accessToken]);

  const save = async (patch: Partial<StoredPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writePrefs(next);
    if (!accessToken) return;
    await fetch(`${AUTH_API}/api/me/preferences`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: next.theme,
        exportFormat: next.exportFormat,
        importFormat: next.importFormat,
      }),
    });
  };

  return (
    <PreferencesContext.Provider value={{ ...prefs, ready, save }}>
      <style>{`
        html[data-theme="dark"] {
          color-scheme: dark;
          --ink: #e8ebf2;
          --muted: #a7b0c2;
          --canvas: #161820;
          --surface: #1f2330;
          --surface-2: #282d3c;
          --line: #353b4d;
          --accent: #c5cffc;
        }
        html[data-theme="dark"] body,
        html[data-theme="dark"] #root,
        html[data-theme="dark"] .al-root,
        html[data-theme="dark"] .al-content-shell,
        html[data-theme="dark"] .al-page,
        html[data-theme="dark"] .al-main {
          background: var(--canvas);
          color: var(--ink);
        }
        html[data-theme="dark"] .al-sidebar,
        html[data-theme="dark"] .al-sidebar.expanded {
          background: #1a1d27;
          border-right-color: var(--line);
          box-shadow: none;
        }
        html[data-theme="dark"] .al-topbar,
        html[data-theme="dark"] .al-tb-ico,
        html[data-theme="dark"] .al-tb-user-btn,
        html[data-theme="dark"] .al-tb-dropdown {
          background: #1c2030;
          border-color: var(--line);
          color: var(--ink);
        }
        html[data-theme="dark"] .al-tb-title,
        html[data-theme="dark"] [class*="text-[#000168]"],
        html[data-theme="dark"] .al-sidebar-link.active,
        html[data-theme="dark"] .al-sidebar-sublink.active {
          color: var(--accent);
        }
        html[data-theme="dark"] .al-tb-user-name,
        html[data-theme="dark"] .al-tb-drop-name,
        html[data-theme="dark"] .al-sidebar-link,
        html[data-theme="dark"] .al-sidebar-accordion-btn,
        html[data-theme="dark"] .al-sidebar-sublink {
          color: #d5dbeb;
        }
        html[data-theme="dark"] .al-sidebar-link i,
        html[data-theme="dark"] .al-sidebar-accordion-btn i,
        html[data-theme="dark"] .al-tb-user-role,
        html[data-theme="dark"] .al-tb-crumb,
        html[data-theme="dark"] .al-tb-date,
        html[data-theme="dark"] .text-slate-500,
        html[data-theme="dark"] .text-slate-400,
        html[data-theme="dark"] .text-slate-600 {
          color: var(--muted);
        }
        html[data-theme="dark"] .text-slate-900,
        html[data-theme="dark"] .text-slate-800,
        html[data-theme="dark"] .text-slate-700,
        html[data-theme="dark"] h1,
        html[data-theme="dark"] h2 {
          color: var(--ink);
        }
        html[data-theme="dark"] .bg-white,
        html[data-theme="dark"] .asl-card,
        html[data-theme="dark"] .asl-kpi,
        html[data-theme="dark"] .al-tb-date {
          background: var(--surface);
          border-color: var(--line);
        }
        html[data-theme="dark"] .border-slate-200,
        html[data-theme="dark"] .border-slate-100,
        html[data-theme="dark"] .al-sidebar-divider,
        html[data-theme="dark"] .al-tb-drop-divider,
        html[data-theme="dark"] .al-tb-drop-header {
          border-color: var(--line);
        }
        html[data-theme="dark"] .bg-slate-50,
        html[data-theme="dark"] [class*="hover:bg-slate-50"]:hover,
        html[data-theme="dark"] .al-sidebar.expanded .al-sidebar-link:hover,
        html[data-theme="dark"] .al-sidebar.expanded .al-sidebar-accordion-btn:hover,
        html[data-theme="dark"] .al-sidebar-sublink:hover,
        html[data-theme="dark"] .al-sidebar.expanded .al-sidebar-link.active,
        html[data-theme="dark"] .al-sidebar-sublink.active {
          background: var(--surface-2);
        }
        html[data-theme="dark"] input,
        html[data-theme="dark"] select,
        html[data-theme="dark"] textarea {
          background: #171a24;
          color: var(--ink);
          border-color: var(--line);
        }
        html[data-theme="dark"] thead,
        html[data-theme="dark"] tr {
          border-color: var(--line);
        }
        html[data-theme="dark"] th {
          color: var(--muted);
        }
      `}</style>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

export type { ExportFormat, ImportFormat };
