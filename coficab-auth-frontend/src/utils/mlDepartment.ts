/** Codes DepartmentId attendus par le modèle ML (training_model / artifacts). */
export const ML_DEPARTMENT_CODES = [
  'QUALITE',
  'PRODUCTION',
  'MAINTENANCE',
  'LOGISTIQUE',
] as const;

export type MlDepartmentCode = (typeof ML_DEPARTMENT_CODES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(String(value).trim());
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeDeptToken(raw: string): string {
  return stripDiacritics(String(raw).trim())
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Mappe UUID / libellé FR / code métier → code ML (QUALITE, PRODUCTION, …).
 * Retourne null si non reconnaissable (ex. UUID seul sans contexte).
 */
export function mapDepartmentToMlCode(
  raw: string | null | undefined
): MlDepartmentCode | null {
  const s = String(raw ?? '').trim();
  if (!s || isUuid(s)) return null;

  const u = normalizeDeptToken(s);
  if ((ML_DEPARTMENT_CODES as readonly string[]).includes(u)) {
    return u as MlDepartmentCode;
  }

  if (/\bQUALIT|\bQUALITY|\bQA\b|\bCQ\b/.test(u)) return 'QUALITE';
  if (/\bPROD/.test(u)) return 'PRODUCTION';
  if (/\bMAINT/.test(u)) return 'MAINTENANCE';
  if (/\bLOGIST|\bSUPPLY|\bENTREPOT|\bWAREHOUSE/.test(u)) return 'LOGISTIQUE';

  return null;
}

/** Résout le premier code ML trouvé parmi plusieurs indices (code, name, …). */
export function resolveMlDepartmentCode(
  ...parts: Array<string | null | undefined>
): MlDepartmentCode | null {
  for (const p of parts) {
    const mapped = mapDepartmentToMlCode(p);
    if (mapped) return mapped;
  }
  return null;
}

export interface DeptFilterEmployee {
  employeeId: string;
  departmentId?: string | null;
  department?: string | null;
  DepartmentId?: string | null;
}

export interface DossierDepartmentContext {
  /** UUID du département sélectionné dans le formulaire */
  departmentUuid?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  /** Déjà mappé, ou brut à mapper */
  departmentRaw?: string | null;
}

export function resolveDossierMlDepartment(
  ctx: DossierDepartmentContext
): MlDepartmentCode | null {
  return resolveMlDepartmentCode(
    ctx.departmentCode,
    ctx.departmentName,
    ctx.departmentRaw,
    ctx.departmentUuid
  );
}

function normalizeLoose(s: string): string {
  return normalizeDeptToken(s).replace(/\s+/g, '');
}

/**
 * Même département (UUID ou code ML) ou compatible (libellé proche).
 */
export function employeeMatchesDepartment(
  emp: DeptFilterEmployee,
  ctx: DossierDepartmentContext
): boolean {
  const dossierUuid = String(ctx.departmentUuid ?? '').trim();
  const empUuid = String(emp.departmentId ?? emp.DepartmentId ?? '').trim();

  if (dossierUuid && empUuid && isUuid(dossierUuid) && isUuid(empUuid)) {
    if (dossierUuid.toLowerCase() === empUuid.toLowerCase()) return true;
  }

  const dossierMl = resolveDossierMlDepartment(ctx);
  const empMl = resolveMlDepartmentCode(
    emp.department,
    emp.DepartmentId,
    emp.departmentId
  );
  if (dossierMl && empMl && dossierMl === empMl) return true;

  const dossierName = String(ctx.departmentName ?? ctx.departmentRaw ?? '').trim();
  const empName = String(emp.department ?? '').trim();
  if (dossierName && empName) {
    const a = normalizeLoose(dossierName);
    const b = normalizeLoose(empName);
    if (a && b && (a.includes(b) || b.includes(a))) return true;
  }

  return false;
}

/** Déduplique par employeeId (conserve le premier). */
export function dedupeByEmployeeId<T extends { employeeId: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = String(item.employeeId ?? '')
      .trim()
      .toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * Filtre + déduplique les candidats pour l'appel ML.
 * Si aucun match strict/compatible : liste vide (ne pas renvoyer tout le système).
 */
export function filterEmployeesForDepartment<T extends DeptFilterEmployee>(
  employees: T[],
  ctx: DossierDepartmentContext,
  options?: { requireDepartment?: boolean }
): T[] {
  const unique = dedupeByEmployeeId(employees);
  if (options?.requireDepartment === false) {
    return unique;
  }

  const hasContext =
    !!String(ctx.departmentUuid ?? '').trim() ||
    !!String(ctx.departmentCode ?? '').trim() ||
    !!String(ctx.departmentName ?? '').trim() ||
    !!String(ctx.departmentRaw ?? '').trim();

  if (!hasContext) return [];

  return unique.filter((e) => employeeMatchesDepartment(e, ctx));
}
