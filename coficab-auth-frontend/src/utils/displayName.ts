/** Nom d’affichage à partir d’un profil user (IAM / RH). */
export function resolveDisplayName(user?: Record<string, unknown> | null): string {
  if (!user) return '';
  const candidates = [
    user.name,
    user.fullName,
    user.FullName,
    user.displayName,
    user.email,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

export function resolveInitials(name?: string | null): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
