import axios from 'axios';
import { ML_API_URL } from '../config/apiEnv';

const ML_API_BASE = ML_API_URL;

export interface MlDossierFeatures {
  DefectType?: string | null;
  Severity?: string | null;
  DepartmentId?: string | null;
}

export interface MlEmployeeCandidate {
  employeeId: string;
  EmployeeSkill?: number | null;
  Workload?: number | null;
  DepartmentId?: string | null;
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
