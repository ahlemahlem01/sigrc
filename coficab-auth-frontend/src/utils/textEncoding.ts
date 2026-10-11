/** Corrige les titres/notes API affiches en mojibake (UTF-8 lu comme Latin-1 / CP1252). */
export function fixMojibake(input?: string | null): string {
  if (!input) return '';
  // Patterns typiques: Ã© Ã¨ Â© Â® â†' etc.
  if (!/[ÃÂâÄÅÆ]/u.test(input)) return input;
  try {
    const bytes = Uint8Array.from(input, (c) => c.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (decoded.includes('\uFFFD')) return input;
    // Prefer decoded if it reduced mojibake markers
    if (/[ÃÂâ]/.test(decoded) && /[ÃÂâ]/.test(input)) return input;
    return decoded;
  } catch {
    return input;
  }
}
