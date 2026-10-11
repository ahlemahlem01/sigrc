import axios from 'axios';
import { ACTION_PLAN_API_URL as BASE_URL } from '../config/apiEnv';

const getHeaders = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

export interface QualityAlert {
  id: string;
  type: string;
  defectType: string;
  productionLine: string;
  description: string;
  zScore: number;
  currentCount: number;
  baselineMean: number;
  detectedAt: string;
  status: string;
  departmentId?: string | null;
  aiProblem?: string | null;
  aiProbableCause?: string | null;
  aiConsequences?: string | null;
  aiAnalyzedAt?: string | null;
  archiveReason?: string | null;
  archivedAt?: string | null;
}

export interface AlertTimelineItem {
  id: string;
  eventType: string;
  title: string;
  detail?: string | null;
  actorName?: string | null;
  createdAt: string;
}

export interface AlertReportItem {
  id: string;
  content: string;
  status: string;
  authorId?: string | null;
  authorName?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  authorAvatarUrl?: string | null;
}

export interface AlertCommentItem {
  id: string;
  body: string;
  authorName?: string | null;
  authorId?: string | null;
  authorAvatarUrl?: string | null;
  createdAt: string;
  isArchived: boolean;
}

export interface AlertCapaItem {
  id: string;
  title: string;
  status: number;
  isArchived: boolean;
  createdAt: string;
}

export interface AlertHistory {
  timeline: AlertTimelineItem[];
  reports: AlertReportItem[];
  comments: AlertCommentItem[];
  attachments: { id: string; fileName: string; isArchived: boolean; createdAt: string }[];
  capas: AlertCapaItem[];
}

function mapAlert(raw: Record<string, unknown>): QualityAlert {
  const description = String(raw.description ?? raw.Description ?? '');
  let currentCount = Number(raw.currentCount ?? raw.CurrentCount ?? 0);
  let baselineMean = Number(raw.baselineMean ?? raw.BaselineMean ?? 0);

  if ((!Number.isFinite(currentCount) || currentCount === 0) && description) {
    const m = description.match(/(\d+)\s*claim/i);
    if (m) currentCount = Number(m[1]);
  }
  if ((!Number.isFinite(baselineMean) || baselineMean === 0) && description) {
    const m = description.match(/moyenne[^0-9]*([\d.,]+)/i);
    if (m) baselineMean = Number(m[1].replace(',', '.'));
  }

  return {
    id: String(raw.id ?? raw.Id ?? ''),
    type: String(raw.type ?? raw.Type ?? ''),
    defectType: String(raw.defectType ?? raw.DefectType ?? ''),
    productionLine: String(raw.productionLine ?? raw.ProductionLine ?? ''),
    description,
    zScore: Number(raw.zScore ?? raw.ZScore ?? 0),
    currentCount: Number.isFinite(currentCount) ? currentCount : 0,
    baselineMean: Number.isFinite(baselineMean) ? baselineMean : 0,
    detectedAt: String(raw.detectedAt ?? raw.DetectedAt ?? ''),
    status: String(raw.status ?? raw.Status ?? ''),
    departmentId: (raw.departmentId ?? raw.DepartmentId ?? null) as string | null,
    aiProblem: (raw.aiProblem ?? raw.AiProblem ?? null) as string | null,
    aiProbableCause: (raw.aiProbableCause ?? raw.AiProbableCause ?? null) as string | null,
    aiConsequences: (raw.aiConsequences ?? raw.AiConsequences ?? null) as string | null,
    aiAnalyzedAt: (raw.aiAnalyzedAt ?? raw.AiAnalyzedAt ?? null) as string | null,
    archiveReason: (raw.archiveReason ?? raw.ArchiveReason ?? null) as string | null,
    archivedAt: (raw.archivedAt ?? raw.ArchivedAt ?? null) as string | null,
  };
}

export async function getAlerts(token: string, status?: string): Promise<QualityAlert[]> {
  const res = await axios.get(`${BASE_URL}/alerts`, {
    ...getHeaders(token),
    params: status ? { status } : undefined,
  });
  const payload = res.data?.data ?? res.data ?? [];
  return (Array.isArray(payload) ? payload : []).map((row) => mapAlert(row as Record<string, unknown>));
}

export async function archiveAlert(token: string, id: string, reason: 'manual' | 'abandoned' | 'auto-resolved' = 'manual'): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${id}/archive`, {}, {
    ...getHeaders(token),
    params: { reason },
  });
}

export async function unarchiveAlert(token: string, id: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${id}/unarchive`, {}, getHeaders(token));
}

export async function resolveAlert(token: string, id: string): Promise<void> {
  await archiveAlert(token, id, 'manual');
}

function pick<T>(raw: Record<string, unknown>, camel: string, pascal: string): T | undefined {
  return (raw[camel] ?? raw[pascal]) as T | undefined;
}

export async function getAlertHistory(token: string, id: string): Promise<AlertHistory> {
  const res = await axios.get(`${BASE_URL}/alerts/${id}/history`, getHeaders(token));
  const raw = (res.data?.data ?? res.data ?? {}) as Record<string, unknown>;
  const mapList = <T>(camel: string, pascal: string, mapper: (row: Record<string, unknown>) => T): T[] => {
    const list = pick<unknown[]>(raw, camel, pascal) ?? [];
    return Array.isArray(list) ? list.map((row) => mapper(row as Record<string, unknown>)) : [];
  };
  return {
    timeline: mapList('timeline', 'Timeline', (row) => ({
      id: String(row.id ?? row.Id ?? ''),
      eventType: String(row.eventType ?? row.EventType ?? ''),
      title: String(row.title ?? row.Title ?? ''),
      detail: (row.detail ?? row.Detail ?? null) as string | null,
      actorName: (row.actorName ?? row.ActorName ?? null) as string | null,
      createdAt: String(row.createdAt ?? row.CreatedAt ?? ''),
    })),
    reports: mapList('reports', 'Reports', (row) => ({
      id: String(row.id ?? row.Id ?? ''),
      content: String(row.content ?? row.Content ?? ''),
      status: String(row.status ?? row.Status ?? ''),
      authorId: (row.authorId ?? row.AuthorId ?? null) as string | null,
      authorName: (row.authorName ?? row.AuthorName ?? null) as string | null,
      reviewNote: (row.reviewNote ?? row.ReviewNote ?? null) as string | null,
      createdAt: String(row.createdAt ?? row.CreatedAt ?? ''),
      reviewedAt: (row.reviewedAt ?? row.ReviewedAt ?? null) as string | null,
      authorAvatarUrl: (row.authorAvatarUrl ?? row.AuthorAvatarUrl ?? null) as string | null,
    })),
    comments: mapList('comments', 'Comments', (row) => ({
      id: String(row.id ?? row.Id ?? ''),
      body: String(row.body ?? row.Body ?? ''),
      authorName: (row.authorName ?? row.AuthorName ?? null) as string | null,
      authorId: (row.authorId ?? row.AuthorId ?? null) as string | null,
      authorAvatarUrl: (row.authorAvatarUrl ?? row.AuthorAvatarUrl ?? null) as string | null,
      createdAt: String(row.createdAt ?? row.CreatedAt ?? ''),
      isArchived: Boolean(row.isArchived ?? row.IsArchived),
    })),
    attachments: mapList('attachments', 'Attachments', (row) => ({
      id: String(row.id ?? row.Id ?? ''),
      fileName: String(row.fileName ?? row.FileName ?? ''),
      isArchived: Boolean(row.isArchived ?? row.IsArchived),
      createdAt: String(row.createdAt ?? row.CreatedAt ?? ''),
    })),
    capas: mapList('capas', 'Capas', (row) => ({
      id: String(row.id ?? row.Id ?? ''),
      title: String(row.title ?? row.Title ?? ''),
      status: Number(row.status ?? row.Status ?? 0),
      isArchived: Boolean(row.isArchived ?? row.IsArchived),
      createdAt: String(row.createdAt ?? row.CreatedAt ?? ''),
    })),
  };
}

export async function submitAlertReport(token: string, id: string, text: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${id}/reports`, { text }, getHeaders(token));
}

export async function updateAlertReport(token: string, alertId: string, reportId: string, text: string): Promise<void> {
  await axios.put(`${BASE_URL}/alerts/${alertId}/reports/${reportId}`, { text }, getHeaders(token));
}

export async function updateAlertAnalysis(
  token: string,
  id: string,
  analysis: { problem: string; probableCause: string; consequences: string },
): Promise<void> {
  await axios.put(`${BASE_URL}/alerts/${id}/analysis`, {
    problem: analysis.problem,
    probableCause: analysis.probableCause,
    consequences: analysis.consequences,
  }, getHeaders(token));
}

export async function decideAlert(token: string, alertId: string, accept: boolean, note?: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${alertId}/decide`, { text: note ?? '' }, {
    ...getHeaders(token),
    params: { accept },
  });
}

export async function reviewAlertReport(token: string, alertId: string, reportId: string, accept: boolean, note?: string): Promise<void> {
  const action = accept ? 'validate' : 'reject';
  await axios.post(`${BASE_URL}/alerts/${alertId}/reports/${reportId}/${action}`, { text: note ?? '' }, getHeaders(token));
}

export async function addAlertComment(token: string, id: string, text: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${id}/comments`, { text }, getHeaders(token));
}

export async function archiveAlertComment(token: string, alertId: string, commentId: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${alertId}/comments/${commentId}/archive`, {}, getHeaders(token));
}

export async function uploadAlertAttachment(token: string, id: string, file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  await axios.post(`${BASE_URL}/alerts/${id}/attachments`, form, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function archiveAlertAttachment(token: string, alertId: string, attachmentId: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${alertId}/attachments/${attachmentId}/archive`, {}, getHeaders(token));
}

export async function downloadAlertAttachment(token: string, alertId: string, attachmentId: string, fileName: string): Promise<void> {
  const res = await axios.get(`${BASE_URL}/alerts/${alertId}/attachments/${attachmentId}`, {
    ...getHeaders(token),
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'fichier';
  link.click();
  URL.revokeObjectURL(url);
}

export async function recordAlertMonitoring(token: string, id: string, text: string): Promise<void> {
  await axios.post(`${BASE_URL}/alerts/${id}/monitoring`, { text }, getHeaders(token));
}

export const emptyAlertHistory: AlertHistory = {
  timeline: [],
  reports: [],
  comments: [],
  attachments: [],
  capas: [],
};

export function sanitizeAlertLabel(text: string): string {
  return String(text || '')
    .replace(/^\s*TEST(?:\s+[A-Za-zÀ-ÿ0-9_-]+)?\s*[—–:-]\s*/i, '')
    .replace(/\bTEST\b\s*[—–:-]?\s*/gi, '')
    .replace(/\bDEBUG\b\s*[—–:-]?\s*/gi, '')
    .trim();
}

export function claimsLinkForAlert(
  alert: Pick<QualityAlert, 'id' | 'defectType' | 'productionLine'>
): string {
  const params = new URLSearchParams();
  if (alert.id) params.set('alertId', alert.id);
  const defect = sanitizeAlertLabel(alert.defectType);
  const line = sanitizeAlertLabel(alert.productionLine);
  if (defect) params.set('defectType', defect);
  if (line) params.set('productionLine', line);
  const qs = params.toString();
  return `/pages/front/quality-analyses${qs ? `?${qs}` : ''}`;
}

export async function getAlertClaims(token: string, alertId: string): Promise<any[]> {
  const res = await axios.get(`${BASE_URL}/alerts/${alertId}/claims`, getHeaders(token));
  const raw = res.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

export function hasAiAnalysis(alert: QualityAlert): boolean {
  return Boolean(
    (alert.aiProblem && alert.aiProblem.trim()) ||
    (alert.aiProbableCause && alert.aiProbableCause.trim()) ||
    (alert.aiConsequences && alert.aiConsequences.trim())
  );
}
