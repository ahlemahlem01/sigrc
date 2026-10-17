import axios from 'axios';
import type { DashboardSummary } from '../types/dashboardSummary';

import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

function unwrap<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

/** GET /api/dashboard/summary */
export async function fetchDashboardSummary(token: string): Promise<DashboardSummary> {
  const res = await axios.get(`${API_BASE}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = unwrap<any>(res.data);

  const mapNamed = (rows: any[] | undefined) =>
    (rows ?? []).map((r) => ({
      name: String(r.name ?? r.Name ?? ''),
      count: Number(r.count ?? r.Count ?? 0),
    }));

  const mapMonthly = (rows: any[] | undefined) =>
    (rows ?? []).map((r) => ({
      month: String(r.month ?? r.Month ?? ''),
      opened: Number(r.opened ?? r.Opened ?? 0),
      closed: Number(r.closed ?? r.Closed ?? 0),
    }));

  const mapResponsible = (rows: any[] | undefined) =>
    (rows ?? []).map((r) => ({
      userId: String(r.userId ?? r.UserId ?? ''),
      name: String(r.name ?? r.Name ?? '—'),
      department: String(r.department ?? r.Department ?? '—'),
      avatarUrl: r.avatarUrl ?? r.AvatarUrl ?? null,
      total: Number(r.total ?? r.Total ?? 0),
      closed: Number(r.closed ?? r.Closed ?? 0),
      closureRate: Number(r.closureRate ?? r.ClosureRate ?? 0),
    }));

  const mapStreamKpis = (k: any) => ({
    totalOpen: Number(k?.totalOpen ?? k?.TotalOpen ?? 0),
    late: Number(k?.late ?? k?.Late ?? 0),
    closureRate: Number(k?.closureRate ?? k?.ClosureRate ?? 0),
    critical: Number(k?.critical ?? k?.Critical ?? 0),
    noDeadline: Number(k?.noDeadline ?? k?.NoDeadline ?? 0),
  });

  return {
    global: {
      totalActiveDossiers: Number(raw?.global?.totalActiveDossiers ?? raw?.Global?.TotalActiveDossiers ?? 0),
      totalOverdue: Number(raw?.global?.totalOverdue ?? raw?.Global?.TotalOverdue ?? 0),
      globalClosureRate: Number(raw?.global?.globalClosureRate ?? raw?.Global?.GlobalClosureRate ?? 0),
      criticalAlerts: Number(raw?.global?.criticalAlerts ?? raw?.Global?.CriticalAlerts ?? 0),
    },
    claims: {
      kpis: mapStreamKpis(raw?.claims?.kpis ?? raw?.Claims?.Kpis),
      top5Late: (raw?.claims?.top5Late ?? raw?.Claims?.Top5Late ?? []).map((r: any) => ({
        id: String(r.id ?? r.Id ?? ''),
        title: String(r.title ?? r.Title ?? '—'),
        clientId: String(r.clientId ?? r.ClientId ?? '—'),
        severity: String(r.severity ?? r.Severity ?? 'MEDIUM'),
        overdueDays: Number(r.overdueDays ?? r.OverdueDays ?? 0),
        responsibleId: r.responsibleId ?? r.ResponsibleId ?? null,
        responsibleName: r.responsibleName ?? r.ResponsibleName ?? null,
      })),
      monthlyOpenClosed: mapMonthly(raw?.claims?.monthlyOpenClosed ?? raw?.Claims?.MonthlyOpenClosed),
      severityDonut: mapNamed(raw?.claims?.severityDonut ?? raw?.Claims?.SeverityDonut),
      topResponsibles: mapResponsible(raw?.claims?.topResponsibles ?? raw?.Claims?.TopResponsibles),
      top5NoDeadline: (raw?.claims?.top5NoDeadline ?? raw?.Claims?.Top5NoDeadline ?? []).map((r: any) => ({
        id: String(r.id ?? r.Id ?? ''),
        title: String(r.title ?? r.Title ?? '—'),
        clientId: String(r.clientId ?? r.ClientId ?? '—'),
        severity: String(r.severity ?? r.Severity ?? 'MEDIUM'),
        ageDays: Number(r.ageDays ?? r.AgeDays ?? 0),
        responsibleId: r.responsibleId ?? r.ResponsibleId ?? null,
        responsibleName: r.responsibleName ?? r.ResponsibleName ?? null,
      })),
    },
    actionPlans: {
      kpis: mapStreamKpis(raw?.actionPlans?.kpis ?? raw?.ActionPlans?.Kpis),
      top5Late: (raw?.actionPlans?.top5Late ?? raw?.ActionPlans?.Top5Late ?? []).map((r: any) => ({
        id: String(r.id ?? r.Id ?? ''),
        title: String(r.title ?? r.Title ?? '—'),
        nature: String(r.nature ?? r.Nature ?? '—'),
        overdueDays: Number(r.overdueDays ?? r.OverdueDays ?? 0),
        responsibleId: r.responsibleId ?? r.ResponsibleId ?? null,
        responsibleName: r.responsibleName ?? r.ResponsibleName ?? null,
        deadline: r.deadline ?? r.Deadline ?? null,
      })),
      monthlyOpenClosed: mapMonthly(raw?.actionPlans?.monthlyOpenClosed ?? raw?.ActionPlans?.MonthlyOpenClosed),
      natureDonut: mapNamed(raw?.actionPlans?.natureDonut ?? raw?.ActionPlans?.NatureDonut),
      topResponsibles: mapResponsible(raw?.actionPlans?.topResponsibles ?? raw?.ActionPlans?.TopResponsibles),
    },
  };
}
