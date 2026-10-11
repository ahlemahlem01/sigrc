import axios from 'axios';
import { ACTION_PLAN_API_URL, ML_API_URL } from '../config/apiEnv';

const ML_API_BASE = ML_API_URL;

export interface MlDossierFeatures {
  DefectType?: string | null;
  Severity?: string | null;
  DepartmentId?: string | null;
  /** Jours entre l'assignation et l'échéance, si connus. */
  AllocDays?: number | null;
}

export interface MlEmployeeCandidate {
  employeeId: string;
  /** Historique de ponctualité de l'employé (voir fetchEmployeeMlStats). */
  OnTimeRate?: number | null;
  ClosedCount?: number | null;
  OpenClaims?: number | null;
  EmployeeSkill?: number | null;
  Workload?: number | null;
  DepartmentId?: string | null;
}

export interface MlEmployeeStats {
  employeeId: string;
  onTimeRate: number;
  closedCount: number;
  openClaims: number;
}

/** Historique de ponctualité des employés candidats, tel que le modèle l'attend. Clés en minuscules. */
export async function fetchEmployeeMlStats(
  token: string,
  employeeIds: string[]
): Promise<Record<string, MlEmployeeStats>> {
  const ids = Array.from(new Set(employeeIds.map((i) => String(i).trim()).filter(Boolean)));
  if (ids.length === 0) return {};
  const { data } = await axios.post<MlEmployeeStats[]>(
    `${ACTION_PLAN_API_URL}/ml-features/employee-stats`,
    { employeeIds: ids },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
  );
  const byId: Record<string, MlEmployeeStats> = {};
  for (const row of data ?? []) byId[String(row.employeeId).toLowerCase()] = row;
  return byId;
}

export interface MlEmployeeRecommendation {
  employeeId: string;
  score: number;
  rank: number;
}

export interface MlRecommendResponse {
  recommendations: MlEmployeeRecommendation[];
  model?: string | null;
  scoredCount: number;
  /** Faux : le modèle n'a pas été validé statistiquement, la recommandation est indicative. */
  validated?: boolean | null;
  trainedOn?: string | null;
}

export async function recommendEmployees(
  dossier: MlDossierFeatures,
  employees: MlEmployeeCandidate[],
  signal?: AbortSignal
): Promise<MlRecommendResponse> {
  const { data } = await axios.post<MlRecommendResponse>(
    `${ML_API_BASE}/recommend`,
    { dossier, employees },
    {
      timeout: 8000,
      signal,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  return data;
}

/** Normalise sévérité UI → contrat ML (LOW / MEDIUM / HIGH / CRITICAL). */
export function normalizeSeverityForMl(raw: string | null | undefined): string {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!s) return '';
  if (s === 'LOW' || s.startsWith('LOW')) return 'LOW';
  if (s === 'MEDIUM' || s.startsWith('MED')) return 'MEDIUM';
  if (s === 'HIGH' || s.startsWith('HIGH')) return 'HIGH';
  if (s === 'CRITICAL' || s.startsWith('CRIT')) return 'CRITICAL';
  return s;
}
