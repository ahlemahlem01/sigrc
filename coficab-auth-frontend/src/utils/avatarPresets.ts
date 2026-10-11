/** Avatars style Google — stockés en DB comme `preset:<id>`. */
import { ACTION_PLAN_ORIGIN } from '../config/apiEnv';

export type AvatarPreset = {
  id: string;
  label: string;
  /** Clé du dessin SVG */
  art: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'preset:nova', label: 'Nova', art: 'nova' },
  { id: 'preset:coral', label: 'Coral', art: 'coral' },
  { id: 'preset:sage', label: 'Sage', art: 'sage' },
  { id: 'preset:amber', label: 'Amber', art: 'amber' },
  { id: 'preset:lilac', label: 'Lilac', art: 'lilac' },
  { id: 'preset:slate', label: 'Slate', art: 'slate' },
  { id: 'preset:mint', label: 'Mint', art: 'mint' },
  { id: 'preset:rose', label: 'Rose', art: 'rose' },
  { id: 'preset:sky', label: 'Sky', art: 'sky' },
  { id: 'preset:ink', label: 'Ink', art: 'ink' },
];

/** Anciens IDs (animaux / géométrie) → nouveaux. */
const LEGACY_MAP: Record<string, string> = {
  'preset:dog': 'preset:nova',
  'preset:koala': 'preset:slate',
  'preset:raccoon': 'preset:ink',
  'preset:duck': 'preset:amber',
  'preset:hedgehog': 'preset:coral',
  'preset:otter': 'preset:sky',
  'preset:tiger': 'preset:coral',
  'preset:seal': 'preset:mint',
  'preset:parrot': 'preset:sage',
  'preset:deer': 'preset:lilac',
  'preset:fox': 'preset:coral',
  'preset:cat': 'preset:lilac',
  'preset:panda': 'preset:slate',
  'preset:bunny': 'preset:rose',
  'preset:owl': 'preset:amber',
  'preset:bear': 'preset:sky',
  'preset:penguin': 'preset:mint',
  'preset:frog': 'preset:sage',
  'preset:chick': 'preset:amber',
  'preset:whale': 'preset:nova',
  'preset:navy-orb': 'preset:nova',
  'preset:rings-navy': 'preset:nova',
  'preset:teal-leaf': 'preset:sage',
  'preset:hex-teal': 'preset:sage',
  'preset:slate-grid': 'preset:slate',
  'preset:diag-slate': 'preset:slate',
  'preset:amber-sun': 'preset:amber',
  'preset:blocks-amber': 'preset:amber',
  'preset:rose-bloom': 'preset:rose',
  'preset:sky-arc': 'preset:sky',
  'preset:waves-sky': 'preset:sky',
  'preset:forest': 'preset:sage',
  'preset:signal-forest': 'preset:sage',
  'preset:indigo-wave': 'preset:lilac',
  'preset:orbit-ink': 'preset:ink',
  'preset:copper': 'preset:coral',
  'preset:peak-copper': 'preset:coral',
  'preset:mint': 'preset:mint',
  'preset:graphite': 'preset:slate',
  'preset:crimson': 'preset:rose',
};

export function isPresetAvatar(url?: string | null): boolean {
  return !!url && url.startsWith('preset:');
}

export function normalizePresetId(url?: string | null): string | null {
  if (!isPresetAvatar(url)) return null;
  return LEGACY_MAP[url!] ?? url!;
}

export function getAvatarPreset(url?: string | null): AvatarPreset | undefined {
  const id = normalizePresetId(url);
  if (!id) return undefined;
  return AVATAR_PRESETS.find((p) => p.id === id);
}

export const AVATAR_API_ORIGIN = ACTION_PLAN_ORIGIN;

export function resolveUploadedAvatarUrl(url?: string | null): string | null {
  if (!url || isPresetAvatar(url)) return null;
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${AVATAR_API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
