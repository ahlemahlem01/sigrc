/** Palette Coficab + variables de thème profil (--navy, etc.). */
export const COFICAB = {
  navy: 'var(--navy, #000168)',
  mid: 'var(--navy-mid, #00009e)',
  light: 'var(--navy-light, #eef2ff)',
  soft: 'var(--theme-soft, #f4f6fb)',
  ink: '#0d1340',
  muted: '#64748b',
  line: '#e4e8f2',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  warn: '#9a3412',
  warnSoft: '#fff7ed',
  ok: '#0f766e',
  okSoft: '#f0fdfa',
} as const;

export const CLAIMS_ACCENT = COFICAB.navy;
export const PLANS_ACCENT = COFICAB.mid;

export const SEV_COLORS: Record<string, string> = {
  CRITICAL: '#b91c1c',
  HIGH: '#9a3412',
  MEDIUM: '#a16207',
  LOW: '#0f766e',
  UNKNOWN: '#94a3b8',
};

export const NATURE_COLORS: Record<string, string> = {
  PA: 'var(--navy, #000168)',
  PAC: 'var(--navy-mid, #00009e)',
  PAP: '#4c4c9c',
};
