import axios from 'axios';

import { ACTION_PLAN_API_URL as BASE_URL } from '../config/apiEnv';

const getHeaders = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

export type CalendarImportance = 'normal' | 'important' | 'urgent';

export type CalendarEventDto = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  source: string;
  eventType?: string;
  importance: CalendarImportance;
  color?: string;
  actionPlanId?: string;
  claimId?: string;
  externalUid?: string;
  ownerId?: string;
  isCompanyWide: boolean;
  targetUserIds: string[];
  targetDepartmentIds: string[];
};

export type CalendarEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  color?: string;
  actionPlanId?: string;
  claimId?: string;
  source?: string;
  eventType?: string;
  importance: CalendarImportance;
  isCompanyWide: boolean;
  targetUserIds?: string[];
  targetDepartmentIds?: string[];
};

/** label = i18n key */
export const IMPORTANCE_META: Record<CalendarImportance, { label: string }> = {
  normal: { label: 'calendar.importanceNormal' },
  important: { label: 'calendar.importanceImportant' },
  urgent: { label: 'calendar.importanceUrgent' },
};

export const EVENT_COLORS = [
  '#039be5',
  '#0b8043',
  '#d50000',
  '#f4511e',
  '#f6bf26',
  '#8e24aa',
  '#000168',
  '#616161',
];

function unwrapList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function asStringList(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

function normalizeImportance(raw: any): CalendarImportance {
  const v = String(raw || 'normal').toLowerCase();
  if (v === 'urgent') return 'urgent';
  if (v === 'important') return 'important';
  return 'normal';
}

function normalizeEvent(raw: any): CalendarEventDto {
  return {
    id: String(raw.id || raw.Id),
    title: raw.title || raw.Title || '',
    description: raw.description || raw.Description,
    startAt: raw.startAt || raw.StartAt,
    endAt: raw.endAt || raw.EndAt,
    allDay: !!(raw.allDay ?? raw.AllDay),
    source: raw.source || raw.Source || 'custom',
    eventType: raw.eventType || raw.EventType || 'custom',
    importance: normalizeImportance(raw.importance ?? raw.Importance),
    color: raw.color || raw.Color || '#039be5',
    actionPlanId: raw.actionPlanId || raw.ActionPlanId,
    claimId: raw.claimId || raw.ClaimId,
    externalUid: raw.externalUid || raw.ExternalUid,
    ownerId: raw.ownerId || raw.OwnerId,
    isCompanyWide: !!(raw.isCompanyWide ?? raw.IsCompanyWide ?? true),
    targetUserIds: asStringList(raw.targetUserIds ?? raw.TargetUserIds),
    targetDepartmentIds: asStringList(raw.targetDepartmentIds ?? raw.TargetDepartmentIds),
  };
}

export async function getCalendarEvents(
  token: string,
  from: Date,
  to: Date
): Promise<CalendarEventDto[]> {
  const res = await axios.get(`${BASE_URL}/calendar`, {
    ...getHeaders(token),
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  return unwrapList(res.data).map(normalizeEvent);
}

export async function createCalendarEvent(
  token: string,
  data: CalendarEventPayload
): Promise<CalendarEventDto> {
  const res = await axios.post(`${BASE_URL}/calendar`, data, getHeaders(token));
  return normalizeEvent(res.data);
}

export async function updateCalendarEvent(
  token: string,
  id: string,
  data: CalendarEventPayload
): Promise<CalendarEventDto> {
  const res = await axios.put(`${BASE_URL}/calendar/${id}`, data, getHeaders(token));
  return normalizeEvent(res.data);
}

export async function deleteCalendarEvent(token: string, id: string): Promise<void> {
  await axios.delete(`${BASE_URL}/calendar/${id}`, getHeaders(token));
}
