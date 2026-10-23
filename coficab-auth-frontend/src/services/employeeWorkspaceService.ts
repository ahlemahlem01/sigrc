import axios from 'axios';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import type { Claim } from '../types/qualityAnalysis';
import type { EightDDossier } from './qualityAnalysisService';

export interface WorkspacePlanAction {
  id: string;
  actionPlanId: string;
  progress: number;
  deadline?: string | null;
}

/** Read-only 8D summary: status and steps only (no dossier is created by reading it). */
export type WorkspaceEightD = Pick<EightDDossier, 'claimId' | 'claimTitle' | 'statusCode' | 'steps'>;

export interface WorkspaceDocument {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface WorkspaceBadge {
  id: string;
  name: string;
  description?: string;
  color?: string;
  category?: string;
  earnedAt: string;
}

export interface EmployeeWorkspace {
  claims: Claim[];
  plans: any[];
  planActions: WorkspacePlanAction[];
  eightD: WorkspaceEightD[];
  rejectedPlans: any[];
  /** Latest documents and badges an admin added to the employee's file (3 each). */
  recentDocuments: WorkspaceDocument[];
  recentBadges: WorkspaceBadge[];
}

/** Everything the employee dashboard needs, in one request (GET api/employee/workspace). */
export async function getEmployeeWorkspace(token: string): Promise<EmployeeWorkspace> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/employee/workspace`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    claims: list<Claim>(data?.claims),
    plans: list<any>(data?.plans),
    planActions: list<WorkspacePlanAction>(data?.planActions),
    eightD: list<WorkspaceEightD>(data?.eightD),
    rejectedPlans: list<any>(data?.rejectedPlans),
    recentDocuments: list<WorkspaceDocument>(data?.recentDocuments),
    recentBadges: list<WorkspaceBadge>(data?.recentBadges),
  };
}

export interface EmployeeWorkload {
  mine: number;
  minePlans: number;
  mineClaims: number;
  latePlans: number;
  teamAverage: number;
  teamPlansAverage: number;
  teamSize: number;
  overloadMin: number;
  overloadFactor: number;
  state: 'none' | 'light' | 'normal' | 'high';
}

/** My open files against the team average (anonymous: the server only returns my numbers and the average). */
export async function getEmployeeWorkload(token: string): Promise<EmployeeWorkload> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/employee/workspace/workload`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as EmployeeWorkload;
}

export interface ActivityWeek {
  weekStart: string;
  closed: number;
  open: number;
  teamClosed: number;
  teamOpen: number;
}

export interface EmployeeActivity {
  weeks: ActivityWeek[];
  target: { resolutionDays: number; onTimeGreen: number };
  mine: { avgDays: number | null; onTimeRate: number | null; closed90: number };
  team: { avgDays: number | null; onTimeRate: number | null; closed90PerPerson: number; size: number };
}

/** My last 12 weeks against the team average (anonymous), plus closing time and on-time rate over 90 days. */
export async function getEmployeeActivity(token: string): Promise<EmployeeActivity> {
  const { data } = await axios.get(`${ACTION_PLAN_API_URL}/employee/workspace/activity`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data as EmployeeActivity;
}
