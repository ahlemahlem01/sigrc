import { getAllAssignments, getActionPlans, getOverduePlanActions, RawAssignment } from './actionPlanService';
import { qualityAnalysisService } from './qualityAnalysisService';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import type { Claim } from '../types/qualityAnalysis';
import type { ClaimsHistoryRow } from '../types/qualityAnalysis';
import i18n from '../i18n';

export type WorkloadLevel = 'low' | 'medium' | 'high';

/** Seuil à partir duquel la charge est considérée en surcharge. */
export const WORKLOAD_CAPACITY_MAX = 10;

export type SkillLevel = 'debutant' | 'confirme' | 'expert';

/** Getters so the label follows the current UI language wherever it is read. */
export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  get debutant() { return i18n.t('skills.beginner'); },
  get confirme() { return i18n.t('skills.confirmed'); },
  get expert() { return i18n.t('skills.expert'); },
};

export interface CompetencyScores {
  fiveWhy: number;
  ishikawa: number;
  eightD: number;
  capa: number;
  deadlines: number;
}

export type CompetencyLevels = Record<keyof CompetencyScores, SkillLevel>;

export interface RecentDossier {
  id: string;
  title: string;
  type: 'claim' | 'capa';
  status: string;
  date: string;
}

export interface EmployeePerformanceRow {
  userId: string;
  fullName: string;
  email: string;
  profilePictureUrl?: string | null;
  poste?: string;
  equipe?: string;
  ligneProduction?: string;
  telephone?: string;
  department?: string;
  activeDossiers: number;
  /** Places restantes avant le seuil de surcharge ({@link WORKLOAD_CAPACITY_MAX}). */
  remainingCapacity: number;
  closureRate: number;
  avgDelayDays: number;
  overdueCount: number;
  workload: WorkloadLevel;
  competencies: CompetencyScores;
  competencyLevels: CompetencyLevels;
  recentDossiers: RecentDossier[];
}

/** Score 0–100 → Débutant / Confirmé / Expert */
export function skillLevelFromScore(score: number): SkillLevel {
  if (score >= 70) return 'expert';
  if (score >= 40) return 'confirme';
  return 'debutant';
}

export function levelsFromScores(scores: CompetencyScores): CompetencyLevels {
  return {
    fiveWhy: skillLevelFromScore(scores.fiveWhy),
    ishikawa: skillLevelFromScore(scores.ishikawa),
    eightD: skillLevelFromScore(scores.eightD),
    capa: skillLevelFromScore(scores.capa),
    deadlines: skillLevelFromScore(scores.deadlines),
  };
}

export function remainingCapacityBeforeOverload(activeDossiers: number): number {
  return Math.max(0, WORKLOAD_CAPACITY_MAX - activeDossiers);
}

/**
 * Charge ML (0–1) à partir du nombre de dossiers actifs.
 * low / medium / high restent disponibles via {@link EmployeePerformanceRow.workload}.
 */
export function workloadRatioFromActiveDossiers(activeDossiers: number): number {
  const ratio = activeDossiers / WORKLOAD_CAPACITY_MAX;
  return Math.min(0.98, Math.max(0.05, Math.round(ratio * 100) / 100));
}

export function workloadRatioFromRow(row: Pick<EmployeePerformanceRow, 'activeDossiers'>): number {
  return workloadRatioFromActiveDossiers(row.activeDossiers);
}

/** Choisit la compétence métier la plus pertinente pour un type de défaut / plan. */
export function competencyScoreForDefect(
  competencies: CompetencyScores,
  defectType?: string | null,
): number {
  const d = String(defectType ?? '')
    .trim()
    .toLowerCase();

  if (/doc|pr[ée]vent|pap\b/.test(d)) return competencies.capa;
  if (/fonct|correct|emball|pac\b|8\s*d|eightd/.test(d)) return competencies.eightD;
  if (/dimens|esth|[aá]m[ée]lior|ishikawa|\bpa\b/.test(d)) return competencies.ishikawa;
  if (/5\s*why|five\s*why|pareto/.test(d)) return competencies.fiveWhy;
  if (/deadline|d[ée]lai|retard/.test(d)) return competencies.deadlines;

  const vals = Object.values(competencies);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Score 0–100 → échelle ML EmployeeSkill 1–5. */
export function skillScoreForDefectType(
  competencies: CompetencyScores,
  defectType?: string | null,
): number {
  const score100 = competencyScoreForDefect(competencies, defectType);
  return Math.max(1, Math.min(5, Math.round(1 + (score100 / 100) * 4)));
}

const CLOSED_CLAIM = new Set(['CLOSED', 'CLOTUREE', 'CLOTURÉE', 'RESOLVED', 'RESOLU', 'ARCHIVED', '3']);
const CLOSED_PLAN_STATUS = new Set([3, 4]);

const unwrap = (raw: unknown): any[] => {
  if (Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o?.['$values'])) return o['$values'] as any[];
  if (Array.isArray(o?.data)) return o.data as any[];
  if (Array.isArray(o?.items)) return o.items as any[];
  return [];
};

const isClaimClosed = (status?: string) =>
  CLOSED_CLAIM.has(String(status ?? '').toUpperCase().trim());

const isPlanClosed = (status: number, progress: number) =>
  CLOSED_PLAN_STATUS.has(status) || progress >= 100;

const workloadLevel = (count: number): WorkloadLevel => {
  if (count >= WORKLOAD_CAPACITY_MAX) return 'high';
  if (count >= 6) return 'medium';
  return 'low';
};

const daysBetween = (from: string, to: Date) => {
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((to.getTime() - start) / 86_400_000));
};

const matchUserId = (value: string | undefined | null, userId: string) =>
  String(value ?? '').toLowerCase() === userId.toLowerCase();

const pickPlanStatus = (p: any) => Number(p.status ?? p.Status ?? 0);
const pickPlanProgress = (p: any) => Number(p.progress ?? p.Progress ?? 0);
const pickPlanDeadline = (p: any) => p.deadline ?? p.Deadline ?? null;
const pickPlanAssigned = (p: any) => p.assignedToId ?? p.AssignedToId ?? '';

const scoreFiveWhy = (rows: ClaimsHistoryRow[]) => {
  if (rows.length === 0) return 0;
  const done = rows.filter((r) => {
    const s = String(r.fiveWhyStatus ?? '').toUpperCase();
    return s === 'VALIDATED' || s === 'VALIDÉ' || s === 'VALIDEE';
  }).length;
  const started = rows.filter((r) => r.fiveWhyId || r.fiveWhyStatus).length;
  if (done > 0) return Math.round((done / rows.length) * 100);
  if (started > 0) return Math.round((started / rows.length) * 55);
  return 15;
};

const scoreIshikawa = (rows: ClaimsHistoryRow[]) => {
  if (rows.length === 0) return 0;
  const withIsh = rows.filter((r) => {
    const s = String(r.ishikawaStatus ?? '').toUpperCase();
    return s && s !== 'NONE' && s !== 'DRAFT';
  }).length;
  return Math.min(100, Math.round((withIsh / rows.length) * 100));
};

const scoreEightD = (rows: ClaimsHistoryRow[]) => {
  if (rows.length === 0) return 0;
  const with8d = rows.filter((r) => r.eightDId || (r.eightDStep ?? 0) > 0).length;
  const advanced = rows.filter((r) => (r.eightDStep ?? 0) >= 5).length;
  if (advanced > 0) return Math.min(100, Math.round((advanced / rows.length) * 100 + 20));
  return Math.min(100, Math.round((with8d / rows.length) * 80));
};

const scoreCapa = (plans: RawAssignment[]) => {
  if (plans.length === 0) return 0;
  const closed = plans.filter((p) => isPlanClosed(p.status, p.progress)).length;
  const avgProgress =
    plans.reduce((s, p) => s + (p.progress ?? 0), 0) / Math.max(plans.length, 1);
  return Math.min(100, Math.round((closed / plans.length) * 60 + avgProgress * 0.4));
};

const scoreDeadlines = (plans: RawAssignment[], overdueForUser: number) => {
  if (plans.length === 0) return overdueForUser === 0 ? 50 : 20;
  const penalty = Math.min(80, overdueForUser * 12);
  const closedOnTime = plans.filter((p) => isPlanClosed(p.status, p.progress)).length;
  const base = Math.round((closedOnTime / plans.length) * 100);
  return Math.max(5, Math.min(100, base - penalty));
};

const buildRecentDossiers = (
  claims: Claim[],
  plans: RawAssignment[],
): RecentDossier[] => {
  const fromClaims: RecentDossier[] = claims.map((c) => ({
    id: c.id,
    title: c.title,
    type: 'claim' as const,
    status: c.statusCode,
    date: c.updatedAt ?? c.createdAt,
  }));
  const fromPlans: RecentDossier[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    type: 'capa' as const,
    status: isPlanClosed(p.status, p.progress) ? i18n.t('planView.statusDone') : i18n.t('planView.statusOngoing'),
    date: p.createdAt,
  }));
  return [...fromClaims, ...fromPlans]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
};

export async function fetchEmployeePerformance(
  token: string,
  employees: {
    id: string;
    fullName?: string;
    name?: string;
    email?: string;
    profilePictureUrl?: string | null;
    poste?: string;
    equipe?: string;
    ligneProduction?: string;
    telephone?: string;
    phone?: string;
    department?: string;
  }[],
): Promise<EmployeePerformanceRow[]> {
  const hdrs = { Authorization: `Bearer ${token}` };

  const [assignmentsRes, claimsRes, overdueRes, historyRes, plansRes] = await Promise.allSettled([
    getAllAssignments(token),
    fetch(`${ACTION_PLAN_API_URL}/QualityAnalysis/claims?status=all`, { headers: hdrs }),
    getOverduePlanActions(token),
    qualityAnalysisService.getClaimsHistory({ page: 1, pageSize: 1000 }, token),
    getActionPlans(token),
  ]);

  const assignments: RawAssignment[] =
    assignmentsRes.status === 'fulfilled' ? assignmentsRes.value : [];

  let claims: Claim[] = [];
  if (claimsRes.status === 'fulfilled' && claimsRes.value.ok) {
    const raw = await claimsRes.value.json();
    claims = unwrap(raw) as Claim[];
  }

  const overdueActions: any[] =
    overdueRes.status === 'fulfilled' ? unwrap(overdueRes.value.data) : [];

  const historyItems: ClaimsHistoryRow[] =
    historyRes.status === 'fulfilled' ? (historyRes.value.items ?? []) : [];

  const allPlans: any[] =
    plansRes.status === 'fulfilled' ? unwrap(plansRes.value.data?.data ?? plansRes.value.data) : [];

  const now = new Date();

  return employees.map((emp) => {
    const userId = emp.id;
    const userEmail = (emp.email ?? '').toLowerCase();
    const userPlans = assignments.filter((a) => matchUserId(a.assignedToId, userId));
    const userFullPlans = allPlans.filter((p) => matchUserId(pickPlanAssigned(p), userId));
    const userClaims = claims.filter(
      (c) =>
        matchUserId(c.createdById, userId) ||
        (!!userEmail && String(c.createdBy ?? '').toLowerCase() === userEmail),
    );
    const userHistory = historyItems.filter(
      (r) =>
        matchUserId(r.createdById, userId) ||
        (!!userEmail && String(r.createdBy ?? '').toLowerCase() === userEmail),
    );

    const activeClaims = userClaims.filter((c) => !isClaimClosed(c.statusCode));
    const activePlans = userPlans.filter((p) => !isPlanClosed(p.status, p.progress));
    const activeDossiers = activeClaims.length + activePlans.length;

    const totalItems = userClaims.length + userPlans.length;
    const closedItems =
      userClaims.filter((c) => isClaimClosed(c.statusCode)).length +
      userPlans.filter((p) => isPlanClosed(p.status, p.progress)).length;
    const closureRate = totalItems > 0 ? Math.round((closedItems / totalItems) * 100) : 0;

    const overdueActionIds = new Set<string>();
    const userOverdueActions = overdueActions.filter((a) => {
      const aid = String(a.assignedToId ?? a.AssignedToId ?? '');
      const planId = String(a.actionPlanId ?? a.ActionPlanId ?? '');
      const plan = userFullPlans.find((p) => String(p.id ?? p.Id) === planId);
      const onUser = matchUserId(aid, userId) || (plan && matchUserId(pickPlanAssigned(plan), userId));
      if (onUser) overdueActionIds.add(String(a.id ?? a.Id ?? `${planId}-${a.title}`));
      return onUser;
    });

    const overduePlans = userFullPlans.filter((p) => {
      const deadline = pickPlanDeadline(p);
      if (!deadline) return false;
      return (
        !isPlanClosed(pickPlanStatus(p), pickPlanProgress(p)) &&
        new Date(deadline).getTime() < now.getTime()
      );
    });

    const overdueCount = userOverdueActions.length + overduePlans.length;

    const delaySamples: number[] = [];
    userOverdueActions.forEach((a) => {
      const dl = a.deadline ?? a.Deadline;
      if (dl) delaySamples.push(daysBetween(dl, now));
    });
    overduePlans.forEach((p) => {
      const dl = pickPlanDeadline(p);
      if (dl) delaySamples.push(daysBetween(dl, now));
    });
    activeClaims.forEach((c) => {
      const ref = c.updatedAt ?? c.createdAt ?? c.detectionDate;
      const age = daysBetween(ref, now);
      if (age > 7) delaySamples.push(age);
    });
    userPlans
      .filter((p) => !isPlanClosed(p.status, p.progress))
      .forEach((p) => {
        delaySamples.push(daysBetween(p.createdAt, now));
      });
    userClaims
      .filter((c) => isClaimClosed(c.statusCode))
      .forEach((c) => {
        const start = c.createdAt ?? c.detectionDate;
        const end = c.updatedAt ?? c.createdAt;
        if (start && end) delaySamples.push(daysBetween(start, new Date(end)));
      });

    const avgDelayDays =
      delaySamples.length > 0
        ? Math.round(delaySamples.reduce((s, d) => s + d, 0) / delaySamples.length)
        : 0;

    const competencies: CompetencyScores = {
      fiveWhy: scoreFiveWhy(userHistory),
      ishikawa: scoreIshikawa(userHistory),
      eightD: scoreEightD(userHistory),
      capa: scoreCapa(userPlans),
      deadlines: scoreDeadlines(userPlans, overdueCount),
    };

    return {
      userId,
      fullName: emp.fullName ?? emp.name ?? emp.email ?? userId,
      email: emp.email ?? '',
      profilePictureUrl: emp.profilePictureUrl,
      poste: emp.poste,
      equipe: emp.equipe,
      ligneProduction: emp.ligneProduction,
      telephone: emp.telephone ?? emp.phone,
      department: emp.department,
      activeDossiers,
      remainingCapacity: remainingCapacityBeforeOverload(activeDossiers),
      closureRate,
      avgDelayDays,
      overdueCount,
      workload: workloadLevel(activeDossiers),
      competencies,
      competencyLevels: levelsFromScores(competencies),
      recentDossiers: buildRecentDossiers(userClaims, userPlans),
    };
  });
}
