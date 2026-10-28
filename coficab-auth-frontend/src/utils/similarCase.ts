/** A past case whose photo looks like the one just taken (the contract of the image service, relayed by the API as it is). */
export interface SimilarCase {
  id_reclamation: string;
  /** A small embedded image (data URI): nothing to fetch, nothing to authenticate. */
  photo_url: string;
  code_defaut: string;
  libelle_defaut?: string | null;
  /** Percentage, 0 to 100. */
  score_similarite: number;
  /** "claim": the photo of a past claim; "reference": a labelled public example. */
  source?: 'claim' | 'reference' | string | null;
  reference?: string | null;
  severite?: string | null;
}

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * What clicking a similar case fills in: its defect code, and its severity when it is one of a past claim. The lot, the customer and the dates
 * are not copied (they belong to another incident); a past claim is mentioned at the end of the description so the link is not lost.
 */
export function applySimilarCase<T extends { defectType: string; severity: string; description: string }>(values: T, c: SimilarCase): T {
  const next = { ...values, defectType: c.code_defaut };
  const severity = (c.severite || '').toUpperCase();
  if (c.source === 'claim' && SEVERITIES.includes(severity)) next.severity = severity;
  const note = c.source === 'claim' && c.reference ? `Cas similaire : ${c.reference}` : '';
  if (note && !values.description.includes(note)) next.description = values.description.trim() ? `${values.description.trim()}\n${note}` : note;
  return next;
}
