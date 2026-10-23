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

/**
 * Blue-grey ramp of the dark theme, per colour channel. Input 0 (white things after the inversion: cards) maps to the card
 * tone, the next two steps dip to the darker canvas tone, then it climbs linearly to the soft white of the text.
 */
const RAMP_STEPS = 40;
const RAMP_CARD = [36, 43, 66];
const RAMP_CANVAS = [20, 26, 42];
const RAMP_TEXT = [236, 240, 250];
const DARK_RAMP = [0, 1, 2].map((ch) => {
  const card = RAMP_CARD[ch] / 255;
  const canvas = RAMP_CANVAS[ch] / 255;
  const text = RAMP_TEXT[ch] / 255;
  const values = [card, canvas, canvas];
  for (let k = 3; k <= RAMP_STEPS; k += 1) values.push(canvas + (text - canvas) * ((k - 2) / (RAMP_STEPS - 2)));
  return values.map((v) => v.toFixed(4)).join(' ');
});
/** Inverse of the climbing part of the ramp, for pictures (their darkest tones are clipped at the canvas tone). */
const DARK_UNRAMP = [0, 1, 2].map((ch) => {
  const canvas = RAMP_CANVAS[ch] / 255;
  const text = RAMP_TEXT[ch] / 255;
  const slope = (RAMP_STEPS - 2) / (RAMP_STEPS * (text - canvas));
  return { slope: slope.toFixed(4), intercept: (2 / RAMP_STEPS - canvas * slope).toFixed(4) };
});

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
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }} focusable="false">
        <defs>
          <filter id="coficab-dark-ramp" colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="table" tableValues={DARK_RAMP[0]} />
              <feFuncG type="table" tableValues={DARK_RAMP[1]} />
              <feFuncB type="table" tableValues={DARK_RAMP[2]} />
            </feComponentTransfer>
          </filter>
          <filter id="coficab-dark-ramp-inverse" colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="linear" slope={DARK_UNRAMP[0].slope} intercept={DARK_UNRAMP[0].intercept} />
              <feFuncG type="linear" slope={DARK_UNRAMP[1].slope} intercept={DARK_UNRAMP[1].intercept} />
              <feFuncB type="linear" slope={DARK_UNRAMP[2].slope} intercept={DARK_UNRAMP[2].intercept} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      <style>{`
        /*
         * Dark theme (blue-grey): the page is inverted (lightness flips, hues kept by the rotation) and then mapped onto a
         * blue-grey ramp, so every screen follows without a rule per component. The ramp keeps the page canvas darker than the
         * cards, and the text soft white. Pictures and avatars get the opposite filter to keep their real colours.
         */
        html[data-theme="dark"] {
          background: #f6f6f6;
          filter: invert(1) hue-rotate(180deg) url(#coficab-dark-ramp);
          color-scheme: light;
        }
        html[data-theme="dark"] body,
        html[data-theme="dark"] #root,
        html[data-theme="dark"] .al-root,
        html[data-theme="dark"] .al-content-shell,
        html[data-theme="dark"] .al-page,
        html[data-theme="dark"] .al-main {
          background: #f6f6f6;
        }
        html[data-theme="dark"] img,
        html[data-theme="dark"] video,
        html[data-theme="dark"] picture,
        html[data-theme="dark"] iframe,
        html[data-theme="dark"] [style*="background-image"],
        html[data-theme="dark"] .keep-colors {
          filter: url(#coficab-dark-ramp-inverse) hue-rotate(180deg) invert(1);
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
