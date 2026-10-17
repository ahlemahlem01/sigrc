export interface OverviewTargets {
  onTimeGreen: number;
  onTimeOrange: number;
  resolutionDays: number;
  ppmTolerancePct: number;
}

/** A figure for the chosen period and the same figure for the period just before it. */
export interface OverviewMetric {
  value: number | null;
  previous: number | null;
}

export interface OverviewHeadline {
  openClaims: number;
  closedInPeriod: number;
  onTimeRate: OverviewMetric;
  onTimeCount: number;
  onTimeBase: number;
  avgResolutionDays: OverviewMetric;
  ppm: OverviewMetric;
  ppmClaims: number;
  latePlans: number;
  plansClosureRate: number;
}

export interface OverviewAlert {
  id: string;
  defectType: string;
  productionLine: string;
  zScore: number;
  currentCount: number;
  detectedAt: string;
}

export interface OverviewActions {
  pendingValidation: number;
  unassigned: number;
  lateClaims: number;
  noDeadline: number;
  latePlans: number;
  openAlerts: number;
  alerts: OverviewAlert[];
}

export interface RankedItem {
  name: string;
  count: number;
  sharePct: number;
}

export interface RisingDefect {
  defectType: string;
  recent: number;
  previous: number;
}

export interface OverviewProblems {
  claimsInPeriod: number;
  topDefects: RankedItem[];
  topLines: RankedItem[];
  topClients: RankedItem[];
  rising: RisingDefect[];
}

export interface OverviewMonth {
  month: string;
  opened: number;
  closed: number;
  onTime: number;
  onTimeRate: number | null;
}

export interface CriticalClaimItem {
  id: string;
  title: string;
  clientId: string;
  severity: string;
  ageDays: number;
  responsibleName?: string | null;
}

export interface OverviewCritical {
  open: number;
  oldestDays: number | null;
  top: CriticalClaimItem[];
}

export interface OverviewEightD {
  inProgress: number;
  pendingValidation: number;
  stalled: number;
  byStep: { step: number; count: number }[];
}

export interface RepeatedLot {
  lot: string;
  claims: number;
  defects: number;
  clientId?: string | null;
}

export interface RecurringPair {
  defectType: string;
  productionLine: string;
  claims: number;
}

/** Quality escapes that come back: lots claimed several times, the same defect on the same line again and again. */
export interface OverviewRecurrence {
  repeatedLots: number;
  claimsWithLot: number;
  topLots: RepeatedLot[];
  recurringPairs: number;
  topPairs: RecurringPair[];
}

export interface WorkloadItem {
  name: string;
  openClaims: number;
  lateClaims: number;
}

export interface OverviewWorkload {
  averagePerPerson: number;
  people: number;
  overloaded: number;
  top: WorkloadItem[];
  leastLoaded?: WorkloadItem | null;
}

/** What to keep an eye on this week, on the shop floor side. */
export interface OverviewWatch {
  critical: OverviewCritical;
  eightD: OverviewEightD;
  recurrence: OverviewRecurrence;
  workload: OverviewWorkload;
}

export interface OverviewData {
  days: number;
  generatedAt: string;
  targets: OverviewTargets;
  headline: OverviewHeadline;
  actions: OverviewActions;
  problems: OverviewProblems;
  months: OverviewMonth[];
  watch: OverviewWatch;
  simulatedData: boolean;
}
