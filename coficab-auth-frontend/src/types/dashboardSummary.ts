export interface NamedCount {
  name: string;
  count: number;
}

export interface MonthlyOpenClosed {
  month: string;
  opened: number;
  closed: number;
}

export interface LateClaimItem {
  id: string;
  title: string;
  clientId: string;
  severity: string;
  overdueDays: number;
  responsibleId?: string | null;
  responsibleName?: string | null;
}

export interface LateActionPlanItem {
  id: string;
  title: string;
  nature: string;
  overdueDays: number;
  responsibleId?: string | null;
  responsibleName?: string | null;
  deadline?: string | null;
}

export interface ResponsibleItem {
  userId: string;
  name: string;
  department: string;
  avatarUrl?: string | null;
  total: number;
  closed: number;
  closureRate: number;
}

export interface StreamKpis {
  totalOpen: number;
  late: number;
  closureRate: number;
  critical: number;
}

export interface ClaimsDashboard {
  kpis: StreamKpis;
  top5Late: LateClaimItem[];
  monthlyOpenClosed: MonthlyOpenClosed[];
  severityDonut: NamedCount[];
  topResponsibles: ResponsibleItem[];
}

export interface ActionPlansDashboard {
  kpis: StreamKpis;
  top5Late: LateActionPlanItem[];
  monthlyOpenClosed: MonthlyOpenClosed[];
  natureDonut: NamedCount[];
  topResponsibles: ResponsibleItem[];
}

export interface GlobalDashboardKpis {
  totalActiveDossiers: number;
  totalOverdue: number;
  globalClosureRate: number;
  criticalAlerts: number;
}

export interface DashboardSummary {
  global: GlobalDashboardKpis;
  claims: ClaimsDashboard;
  actionPlans: ActionPlansDashboard;
}
