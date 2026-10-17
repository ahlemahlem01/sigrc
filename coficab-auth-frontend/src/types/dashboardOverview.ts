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

export interface OverviewHealth {
  lastImportAt: string | null;
  lastImportName: string | null;
  simulatedData: boolean;
  profilesWithoutDepartment: number;
}

export interface OverviewData {
  days: number;
  generatedAt: string;
  targets: OverviewTargets;
  headline: OverviewHeadline;
  actions: OverviewActions;
  problems: OverviewProblems;
  months: OverviewMonth[];
  health: OverviewHealth;
}
