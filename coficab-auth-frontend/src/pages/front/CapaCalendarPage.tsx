import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getActionPlans,
  getDepartments as getDepartmentsApi,
  getPlanActions,
  getUserActionPlans,
  getUsersForAssignment,
} from '../../services/actionPlanService';
import { getUsers } from '../../services/adminService';
import { adminEmployeeService } from '../../services/adminEmployeeService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import {
  CalendarEventDto,
  CalendarImportance,
  EVENT_COLORS,
  IMPORTANCE_META,
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from '../../services/calendarService';
import { isAdminUser } from '../../utils/roles';
import { resolveClaimStatus } from '../../utils/Claimutils';
import type { Claim } from '../../types/qualityAnalysis';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

type ViewMode = 'month' | 'week' | 'day';
type AudienceMode = 'all' | 'users' | 'departments';

type CalendarPerson = {
  id: string;
  fullName: string;
  email?: string;
  department?: string;
  departmentId?: string;
  roles?: string[];
};
type UiEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  kind: 'capa' | 'claim' | 'custom';
  workType?: 'plan' | 'action' | 'claim';
  importance?: CalendarImportance;
  planId?: string;
  claimId?: string;
  claimScope?: 'assigned' | 'created';
  description?: string;
  dto?: CalendarEventDto;
};

type DraftEvent = {
  id?: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  importance: CalendarImportance;
  audience: AudienceMode;
  targetUserIds: string[];
  targetDepartmentIds: string[];
};

type DeptOption = { id: string; name: string };

/** Short weekday names, Monday first, in the given locale (2024-01-01 is a Monday). */
const weekdayNames = (locale: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));

function unwrapList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function toLocalInput(d: Date, allDay: boolean): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (allDay) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string, allDay: boolean): Date {
  if (allDay) {
    const day = value.includes('T') ? value.slice(0, 10) : value;
    return new Date(`${day}T00:00:00`);
  }
  if (!value.includes('T')) return new Date(`${value}T09:00:00`);
  return new Date(value);
}

function datePart(value: string): string {
  if (!value) return '';
  return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10);
}

function timePart(value: string, fallback = '09:00'): string {
  if (!value || !value.includes('T')) return fallback;
  return value.slice(11, 16) || fallback;
}

function combineDateTime(date: string, time: string, allDay: boolean): string {
  if (allDay) return date;
  return `${date}T${time}`;
}

function eventOnDay(ev: UiEvent, day: Date) {
  const s = startOfDay(ev.start).getTime();
  const e = startOfDay(addDays(ev.end, ev.allDay ? -1 : 0)).getTime();
  const t = startOfDay(day).getTime();
  return t >= s && t <= Math.max(s, e);
}

function importancePrefix(i?: CalendarImportance) {
  if (i === 'urgent') return '[U] ';
  if (i === 'important') return '[!] ';
  return '';
}

function parseDayDate(raw: unknown): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const day = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isClaimActive(claim: Claim | any): boolean {
  const resolved = resolveClaimStatus(claim);
  if (resolved === 'REJECTED') return false;
  const code = String(claim.statusCode || claim.StatusCode || '').toUpperCase();
  if (code.includes('REJECT')) return false;
  return true;
}

function claimDeadline(claim: Claim | any): Date | null {
  return (
    parseDayDate(claim.deadline || claim.Deadline) ||
    parseDayDate(claim.suggestedDeadlineUtc || claim.SuggestedDeadlineUtc)
  );
}

export default function CapaCalendarPage() {
  const { t } = useTranslation();
  const locale = dateLocale();
  const WEEKDAYS = useMemo(() => weekdayNames(locale), [locale]);
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const isAdmin = isAdminUser(user);

  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [capaEvents, setCapaEvents] = useState<UiEvent[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEventDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number; date: Date } | null>(null);
  const [draft, setDraft] = useState<DraftEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [users, setUsers] = useState<CalendarPerson[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(new Date()));

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const range = useMemo(() => {
    if (view === 'month') {
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      return { start: addDays(start, -7), end: addDays(end, 7) };
    }
    if (view === 'week') {
      const start = startOfWeek(cursor);
      return { start, end: addDays(start, 7) };
    }
    const start = startOfDay(cursor);
    return { start, end: addDays(start, 1) };
  }, [cursor, view]);

  const loadCapa = useCallback(async () => {
    if (!accessToken) {
      setCapaEvents([]);
      return;
    }
    try {
      const next: UiEvent[] = [];
      const seen = new Set<string>();
      const push = (ev: UiEvent) => {
        if (seen.has(ev.id)) return;
        seen.add(ev.id);
        next.push(ev);
      };

      const addPlanEvents = (plans: any[], actionsByPlan?: Map<string, any[]>) => {
        for (const p of plans) {
          const id = String(p.id || p.Id || p.actionPlanId || p.ActionPlanId || '');
          if (!id) continue;
          const title = String(p.title || p.Title || i18n.t('calendar.capaPlan')).trim();
          const claimId = p.claimId || p.ClaimId ? String(p.claimId || p.ClaimId) : undefined;

          const actions = (actionsByPlan?.get(id) || unwrapList(p.planActions || p.PlanActions || p.actions))
            .filter((a: any) => {
              if (!(a.deadline || a.Deadline)) return false;
              const progress = Number(a.progress ?? a.Progress ?? 0);
              return progress < 100;
            });

          let actionCount = 0;
          for (const a of actions) {
            const d = parseDayDate(a.deadline || a.Deadline);
            if (!d) continue;
            actionCount += 1;
            const actionTitle = String(a.title || a.Title || i18n.t('calendar.action')).trim();
            push({
              id: `capa-action-${a.id || a.Id}`,
              title: actionTitle,
              start: d,
              end: addDays(d, 1),
              allDay: true,
              color: '#c9850a',
              kind: 'capa',
              workType: 'action',
              planId: id,
              claimId,
              description: i18n.t('calendar.planPrefix', { title }),
            });
          }

          // Plan deadline only if no open actions with dates (évite le doublon)
          if (actionCount === 0) {
            const planDeadline =
              parseDayDate(p.deadline || p.Deadline) ||
              parseDayDate(p.nearestDeadline || p.NearestDeadline);
            if (planDeadline) {
              push({
                id: `capa-plan-${id}`,
                title,
                start: planDeadline,
                end: addDays(planDeadline, 1),
                allDay: true,
                color: '#000168',
                kind: 'capa',
                workType: 'plan',
                planId: id,
                claimId,
                description: p.description || p.Description || undefined,
              });
            }
          }
        }
      };

      if (isAdmin) {
        const res = await getActionPlans(accessToken, true);
        addPlanEvents(unwrapList(res.data));
      } else {
        const res = await getUserActionPlans(accessToken);
        const list = unwrapList(res.data);
        const actionsByPlan = new Map<string, any[]>();
        await Promise.all(
          list.map(async (p: any) => {
            const id = String(p.id || p.Id || p.actionPlanId || p.ActionPlanId || '');
            if (!id) return;
            try {
              const actionsRes = await getPlanActions(accessToken, id);
              actionsByPlan.set(id, unwrapList(actionsRes.data));
            } catch {
              actionsByPlan.set(id, []);
            }
          })
        );
        addPlanEvents(list, actionsByPlan);
      }

      // Claims with deadline → what to do / close
      try {
        let claims: Claim[] = [];
        if (isAdmin) {
          claims = await qualityAnalysisService.getClaims(undefined, accessToken);
        } else {
          const [assigned, related] = await Promise.all([
            qualityAnalysisService.getMyAssignedClaims(accessToken).catch(() => [] as Claim[]),
            qualityAnalysisService
              .getClaims(undefined, accessToken, undefined, { relatedTo: 'me' })
              .catch(() => [] as Claim[]),
          ]);
          const byId = new Map<string, Claim>();
          for (const c of [...assigned, ...related]) {
            if (c?.id) byId.set(String(c.id), c);
          }
          claims = Array.from(byId.values());
        }

        for (const claim of claims) {
          if (!isClaimActive(claim)) continue;
          const d = claimDeadline(claim);
          if (!d) continue;
          const id = String(claim.id);
          const status = resolveClaimStatus(claim);
          const myId = String((user as any)?.id || (user as any)?.sub || '').toLowerCase();
          const assignee = String(claim.assignedToId || (claim as any).AssignedToId || '').toLowerCase();
          const createdBy = String(claim.createdById || (claim as any).CreatedById || '').toLowerCase();
          const claimScope: 'assigned' | 'created' =
            myId && assignee === myId ? 'assigned' : 'created';
          push({
            id: `claim-${id}`,
            title: String(claim.title || i18n.t('analysisTools.claim')).trim(),
            start: d,
            end: addDays(d, 1),
            allDay: true,
            color: '#0b8043',
            kind: 'claim',
            workType: 'claim',
            claimId: id,
            claimScope: createdBy === myId && assignee !== myId ? 'created' : claimScope,
            description: `${status}${claim.defectType ? ` · ${claim.defectType}` : ''}`,
          });
        }
      } catch (e) {
        console.warn('Calendrier claims', e);
      }

      next.sort((a, b) => a.start.getTime() - b.start.getTime());
      setCapaEvents(next);
    } catch {
      setCapaEvents([]);
    }
  }, [accessToken, isAdmin, user]);

  const loadCustom = useCallback(async () => {
    if (!accessToken) return;
    try {
      const list = await getCalendarEvents(accessToken, range.start, range.end);
      setCustomEvents(list);
      setApiOk(true);
    } catch (e) {
      console.warn('API calendrier indisponible', e);
      setApiOk(false);
      setCustomEvents([]);
    }
  }, [accessToken, range.end, range.start]);

  const mapPerson = (u: any): CalendarPerson | null => {
    const id = String(u?.id ?? u?.userId ?? u?.UserId ?? u?.Id ?? '').trim();
    if (!id) return null;
    const fullName =
      u.fullName ||
      u.FullName ||
      u.name ||
      u.Name ||
      [u.firstName || u.FirstName, u.lastName || u.LastName].filter(Boolean).join(' ').trim() ||
      u.email ||
      u.Email ||
      id;
    const rolesRaw = u.roles ?? u.Roles ?? u.role ?? u.Role;
    const roles = Array.isArray(rolesRaw)
      ? rolesRaw.map((r: any) => String(r))
      : rolesRaw
        ? [String(rolesRaw)]
        : [];
    return {
      id,
      fullName: String(fullName),
      email: u.email || u.Email ? String(u.email || u.Email) : undefined,
      department: u.department || u.Department || u.departmentName || u.DepartmentName || undefined,
      departmentId: u.departmentId || u.DepartmentId
        ? String(u.departmentId || u.DepartmentId)
        : undefined,
      roles,
    };
  };

  const loadTargets = useCallback(async () => {
    if (!accessToken) return;
    setTargetsLoading(true);
    setTargetsError(null);

    const peopleById = new Map<string, CalendarPerson>();
    const addPeople = (raw: unknown) => {
      for (const row of unwrapList(raw)) {
        const person = mapPerson(row);
        if (person) peopleById.set(person.id, person);
      }
    };

    // 1) IAM users (admin endpoint — may 403 for employees)
    try {
      const iam = await getUsers(accessToken);
      addPeople(iam);
    } catch {
      /* fallback below */
    }

    // 2) Assignment directory (same source as claim assign)
    try {
      const res = await getUsersForAssignment(accessToken);
      addPeople(res.data);
    } catch {
      /* fallback below */
    }

    // 3) Employee profiles on ActionPlan API
    try {
      const profiles = await adminEmployeeService.getAllProfiles(accessToken);
      addPeople(profiles);
    } catch {
      /* ignore */
    }

    // Departments — load independently so a users failure does not wipe depts
    let depts: DeptOption[] = [];
    try {
      const dRes = await getDepartmentsApi(accessToken);
      depts = unwrapList(dRes.data).map((x: any) => ({
        id: String(x.id || x.Id || ''),
        name: String(x.name || x.Name || i18n.t('planDetail.department')),
      })).filter((d) => d.id);
    } catch {
      try {
        // secondary: sometimes returned as bare array
        const dRes = await getDepartmentsApi(accessToken);
        depts = unwrapList(dRes).map((x: any) => ({
          id: String(x.id || x.Id || ''),
          name: String(x.name || x.Name || i18n.t('planDetail.department')),
        })).filter((d) => d.id);
      } catch {
        /* ignore */
      }
    }

    const people = Array.from(peopleById.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, i18n.language)
    );
    setUsers(people);
    setDepartments(depts.sort((a, b) => a.name.localeCompare(b.name, i18n.language)));

    if (people.length === 0 && depts.length === 0) {
      setTargetsError(i18n.t('calendar.targetsFailed'));
    } else if (people.length === 0) {
      setTargetsError(i18n.t('calendar.noEmployees'));
    } else if (depts.length === 0) {
      setTargetsError(i18n.t('calendar.noDepartments'));
    }

    setTargetsLoading(false);
  }, [accessToken]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCapa(), loadCustom(), loadTargets()]);
    } finally {
      setLoading(false);
    }
  }, [loadCapa, loadCustom, loadTargets]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const allEvents: UiEvent[] = useMemo(() => {
    const customs = customEvents.map((e) => ({
      id: e.id,
      title: `${importancePrefix(e.importance)}${e.title}`,
      start: new Date(e.startAt),
      end: new Date(e.endAt),
      allDay: e.allDay,
      color: e.color || '#039be5',
      kind: 'custom' as const,
      importance: e.importance,
      planId: e.actionPlanId,
      claimId: e.claimId,
      description: e.description,
      dto: e,
    }));
    return [...capaEvents, ...customs];
  }, [capaEvents, customEvents]);

  const openCreateAt = (date: Date, allDay: boolean) => {
    const start = startOfDay(date);
    if (!allDay) {
      const now = new Date();
      start.setHours(Math.max(9, now.getHours()), 0, 0, 0);
    }
    const end = new Date(start);
    if (!allDay) end.setHours(end.getHours() + 1);
    setDraft({
      title: '',
      description: '',
      start: toLocalInput(start, allDay),
      end: toLocalInput(end, allDay),
      allDay,
      color: EVENT_COLORS[0],
      importance: 'normal',
      audience: 'all',
      targetUserIds: [],
      targetDepartmentIds: [],
    });
    setMenu(null);
    if (users.length === 0 || departments.length === 0) {
      void loadTargets();
    }
  };

  const openEdit = (ev: UiEvent) => {
    if (ev.kind === 'capa') {
      if (!ev.planId) return;
      navigate(
        isAdmin
          ? `/pages/front/action-plans/${ev.planId}`
          : `/pages/front/my-action-plans/${ev.planId}`
      );
      return;
    }
    if (ev.kind === 'claim' && ev.claimId) {
      const params = new URLSearchParams();
      params.set('claimId', ev.claimId);
      if (!isAdmin) {
        params.set('scope', ev.claimScope || 'assigned');
        navigate(
          (ev.claimScope === 'created'
            ? '/pages/front/quality-analyses'
            : '/pages/front/my-claims') + `?${params.toString()}`
        );
      } else {
        navigate(`/pages/front/quality-analyses?${params.toString()}`);
      }
      return;
    }
    if (!ev.dto) return;
    const start = new Date(ev.dto.startAt);
    let end = new Date(ev.dto.endAt);
    if (ev.dto.allDay) end = addDays(end, -1);
    if (end < start) end = new Date(start);
    let audience: AudienceMode = 'all';
    if (!ev.dto.isCompanyWide) {
      audience = ev.dto.targetUserIds.length > 0 ? 'users' : 'departments';
    }
    setDraft({
      id: ev.dto.id,
      title: ev.dto.title,
      description: ev.dto.description || '',
      start: toLocalInput(start, ev.dto.allDay),
      end: toLocalInput(end, ev.dto.allDay),
      allDay: ev.dto.allDay,
      color: ev.dto.color || EVENT_COLORS[0],
      importance: ev.dto.importance || 'normal',
      audience,
      targetUserIds: [...ev.dto.targetUserIds],
      targetDepartmentIds: [...ev.dto.targetDepartmentIds],
    });
  };

  const saveDraft = async () => {
    if (!draft) {
      showToast(t('calendar.noDraft'));
      return;
    }
    if (!accessToken) {
      showToast(t('closedArchive.sessionExpired'));
      return;
    }
    if (!draft.title.trim()) {
      showToast(t('calendar.titleRequired'));
      return;
    }
    if (draft.audience === 'users' && draft.targetUserIds.length === 0) {
      showToast(t('calendar.pickPerson'));
      return;
    }
    if (draft.audience === 'departments' && draft.targetDepartmentIds.length === 0) {
      showToast(t('calendar.pickDepartment'));
      return;
    }

    setBusy(true);
    try {
      const startAt = fromLocalInput(draft.start, draft.allDay);
      let endAt = fromLocalInput(draft.end, draft.allDay);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        showToast(t('calendar.invalidDates'));
        return;
      }
      if (draft.allDay) {
        if (endAt < startAt) endAt = new Date(startAt);
        endAt = addDays(startOfDay(endAt), 1);
      } else if (endAt <= startAt) {
        endAt = new Date(startAt);
        endAt.setHours(endAt.getHours() + 1);
      }

      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay: draft.allDay,
        color: draft.color,
        importance: draft.importance,
        eventType: 'custom',
        isCompanyWide: draft.audience === 'all',
        targetUserIds: draft.audience === 'users' ? draft.targetUserIds : [],
        targetDepartmentIds: draft.audience === 'departments' ? draft.targetDepartmentIds : [],
        source: 'custom' as const,
      };

      if (draft.id) {
        const updated = await updateCalendarEvent(accessToken, draft.id, payload);
        setCustomEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        showToast(t('calendar.updated'));
      } else {
        const created = await createCalendarEvent(accessToken, payload);
        setCustomEvents((prev) => [...prev, created]);
        showToast(
          draft.importance === 'urgent' || draft.importance === 'important'
            ? t('calendar.publishedNotified')
            : t('calendar.published')
        );
      }
      setDraft(null);
      await loadCustom();
    } catch (e: any) {
      console.error('saveDraft calendar', e);
      const data = e?.response?.data;
      const msg =
        (typeof data === 'string' && data) ||
        data?.error ||
        data?.title ||
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.join(', ') : null) ||
        (e?.message ? String(e.message) : null) ||
        t('calendar.saveFailed');
      showToast(String(msg));
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!draft?.id || !accessToken) return;
    if (!window.confirm(t('calendar.confirmDelete'))) return;
    setBusy(true);
    try {
      await deleteCalendarEvent(accessToken, draft.id);
      setCustomEvents((prev) => prev.filter((e) => e.id !== draft.id));
      setDraft(null);
      showToast(t('calendar.deleted'));
    } catch {
      alert(t('calendar.deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const titleLabel = useMemo(() => {
    if (view === 'day') {
      return cursor.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }, [cursor, view, locale]);

  const monthCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const total = daysInMonth(year, month);
    const cells: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < offset; i++) cells.push({ date: addDays(first, i - offset), inMonth: false });
    for (let d = 1; d <= total; d++) cells.push({ date: new Date(year, month, d), inMonth: true });
    while (cells.length % 7 !== 0) cells.push({ date: addDays(cells[cells.length - 1].date, 1), inMonth: false });
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const today = startOfDay(new Date());

  const upcomingEvents = useMemo(() => {
    const now = startOfDay(new Date()).getTime();
    return [...allEvents]
      .filter((ev) => startOfDay(ev.end).getTime() >= now || startOfDay(ev.start).getTime() >= now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 12);
  }, [allEvents]);

  const selectedDayEvents = useMemo(
    () => allEvents.filter((ev) => eventOnDay(ev, selectedDay)).sort((a, b) => a.start.getTime() - b.start.getTime()),
    [allEvents, selectedDay]
  );

  const onDayContext = (e: React.MouseEvent, date: Date) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, date });
  };

  const nav = (dir: -1 | 1) => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else if (view === 'week') setCursor(addDays(cursor, dir * 7));
    else setCursor(addDays(cursor, dir));
  };

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    return users.filter(
      (u) =>
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q)
    );
  }, [users, userFilter]);

  const filteredDepts = useMemo(() => {
    const q = deptFilter.trim().toLowerCase();
    return departments.filter((d) => !q || d.name.toLowerCase().includes(q));
  }, [departments, deptFilter]);

  const toggleUser = (id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      targetUserIds: draft.targetUserIds.includes(id)
        ? draft.targetUserIds.filter((x) => x !== id)
        : [...draft.targetUserIds, id],
    });
  };

  const toggleDept = (id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      targetDepartmentIds: draft.targetDepartmentIds.includes(id)
        ? draft.targetDepartmentIds.filter((x) => x !== id)
        : [...draft.targetDepartmentIds, id],
    });
  };

  const chipLabel = (ev: UiEvent, compact = false) => {
    if (ev.kind === 'custom') return ev.title;
    if (compact) return ev.title;
    if (ev.workType === 'action') return ev.title;
    if (ev.workType === 'plan') return ev.title;
    return ev.title;
  };

  const chipMeta = (ev: UiEvent) => {
    if (ev.workType === 'action') return t('calendar.action');
    if (ev.workType === 'plan') return 'CAPA';
    if (ev.workType === 'claim' || ev.kind === 'claim') return t('calendar.dossier');
    return null;
  };

  const renderEventChip = (ev: UiEvent, compact = false) => {
    const isWork = ev.kind === 'capa' || ev.kind === 'claim';
    const meta = chipMeta(ev);
    return (
      <button
        key={ev.id}
        type="button"
        className={`cal-chip${compact ? ' compact' : ''}${isWork ? ' work' : ''}${ev.workType ? ` wt-${ev.workType}` : ''}`}
        style={isWork ? { borderLeftColor: ev.color, color: '#0f172a' } : { background: ev.color }}
        title={[ev.title, ev.description].filter(Boolean).join(' — ')}
        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
      >
        {meta && <span className="cal-chip-tag">{meta}</span>}
        <span className="cal-chip-text">{chipLabel(ev, compact)}</span>
      </button>
    );
  };

  return (
    <div className="cal-page">
      <style>{`
        .fl-nav { background:#000168 !important; height:56px !important; }
        .fl-main { padding-top:56px !important; }
        .cal-page {
          font-family: Inter, Roboto, system-ui, sans-serif;
          min-height: calc(100dvh - 56px);
          background: #f8fafc;
          color: #3c4043;
        }
        .cal-toolbar {
          display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
          padding:12px 20px; border-bottom:1px solid #e2e8f0; background:#fff;
          position:sticky; top:56px; z-index:20;
        }
        .cal-toolbar h1 { margin:0; font-size:20px; font-weight:700; color:#0f2b5c; letter-spacing:-0.02em; }
        .cal-left, .cal-right, .cal-views { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cal-btn {
          height:34px; padding:0 12px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;
          font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; color:#0f2b5c;
        }
        .cal-btn:hover { background:#f8fafc; }
        .cal-btn.primary { background:#000168; border-color:#000168; color:#fff; }
        .cal-btn.on { background:#eef2ff; border-color:#c7d2fe; color:#000168; }
        .cal-title { font-size:16px; font-weight:700; min-width:200px; text-align:center; text-transform:capitalize; color:#0f2b5c; }
        .cal-hint { font-size:12px; color:#80868b; }
        .cal-banner {
          margin:10px 20px 0; padding:8px 12px; border-radius:8px; background:#eef2ff; color:#000168; font-size:12px;
        }
        .cal-banner.warn { background:#fef7e0; color:#b06000; }
        .cal-legend { display:flex; gap:14px; flex-wrap:wrap; padding:8px 20px 0; font-size:12px; color:#5f6368; }
        .cal-legend span { display:inline-flex; align-items:center; gap:6px; }
        .cal-dot { width:10px; height:10px; border-radius:50%; }
        .cal-shell {
          display:grid; grid-template-columns: minmax(0,1fr) 280px; gap:14px;
          padding:12px 16px 28px; align-items:start;
        }
        @media (max-width:980px) {
          .cal-shell { grid-template-columns: 1fr; }
        }
        .cal-side {
          background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px;
          position:sticky; top:120px; max-height:calc(100dvh - 140px); overflow:auto;
        }
        .cal-side h3 {
          margin:0 0 10px; font-size:13px; font-weight:700; letter-spacing: -0.01em;
          text-transform: none; color:#64748b;
        }
        .cal-side-block { margin-bottom:16px; }
        .cal-side-item {
          width:100%; text-align:left; border:none; background:transparent; cursor:pointer;
          padding:8px 8px 8px 10px; border-radius:8px; border-left:3px solid #039be5;
          margin-bottom:4px; font-family:inherit;
        }
        .cal-side-item:hover { background:#f8fafc; }
        .cal-side-item strong { display:block; font-size:12.5px; color:#0f2b5c; font-weight:700; }
        .cal-side-item span { font-size:11px; color:#64748b; }
        .cal-side-empty { font-size:12.5px; color:#94a3b8; padding:8px; }
        .cal-colors { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .cal-swatch {
          width:24px; height:24px; border-radius:50%; border:2px solid transparent; cursor:pointer; padding:0;
        }
        .cal-swatch.on { outline:2px solid #202124; outline-offset:2px; }
        .cal-inline-2 {
          display:grid; grid-template-columns:1fr 1fr; gap:12px; width:100%;
        }
        @media (max-width:560px) {
          .cal-inline-2 { grid-template-columns:1fr; }
        }
        .cal-field-label {
          display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:6px; text-transform: none; letter-spacing: -0.01em;
        }
        .cal-body { min-width:0; }
        .cal-grid-month {
          display:grid; grid-template-columns:repeat(7,minmax(0,1fr));
          border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; background:#fff;
        }
        .cal-dow {
          padding:8px; text-align:center; font-size:11px; font-weight:700; color:#64748b;
          background:#f8fafc; border-bottom:1px solid #e2e8f0;
        }
        .cal-cell {
          min-height:118px; border:1px solid #f1f5f9; padding:6px; text-align:left; background:#fff;
          cursor:pointer; vertical-align:top; transition:background .12s ease;
        }
        .cal-cell:hover { background:#f8fafc; }
        .cal-cell.out { background:#fafafa; color:#9aa0a6; }
        .cal-cell.selected { box-shadow: inset 0 0 0 2px #000168; }
        .cal-cell.today .cal-daynum {
          background:#000168; color:#fff; border-radius:999px; width:24px; height:24px;
          display:inline-flex; align-items:center; justify-content:center;
        }
        .cal-daynum { font-size:12px; font-weight:600; margin-bottom:4px; color:#0f2b5c; }
        .cal-chips { display:flex; flex-direction:column; gap:3px; }
        .cal-chip {
          border:none; border-radius:5px; color:#fff; font-size:11px; font-weight:600;
          padding:3px 6px; text-align:left; cursor:pointer; overflow:hidden;
          font-family:inherit; display:flex; align-items:center; gap:5px; min-width:0;
          line-height:1.25;
        }
        .cal-chip.compact { font-size:10px; padding:2px 5px; gap:4px; }
        .cal-chip.work {
          background:#fff; border:1px solid #e8edf3; border-left-width:3px; border-left-style:solid;
          box-shadow:0 1px 1px rgba(15,23,42,.04);
        }
        .cal-chip.work:hover { background:#f8fafc; }
        .cal-chip.wt-plan { background:#f4f6fb; }
        .cal-chip.wt-action { background:#fffaf0; }
        .cal-chip.wt-claim { background:#f1faf4; }
        .cal-chip-tag {
          flex:0 0 auto; font-size:8.5px; font-weight:800; letter-spacing: -0.01em;
          text-transform: none; color:#64748b; background:rgba(15,23,42,.06);
          border-radius:3px; padding:1px 4px; line-height:1.3;
        }
        .cal-chip.wt-plan .cal-chip-tag { color:#000168; background:rgba(0,1,104,.08); }
        .cal-chip.wt-action .cal-chip-tag { color:#9a6700; background:rgba(201,133,10,.12); }
        .cal-chip.wt-claim .cal-chip-tag { color:#0b8043; background:rgba(11,128,67,.1); }
        .cal-chip-text {
          min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600;
        }
        .cal-side-item .cal-chip-tag { margin-right:4px; display:inline-block; vertical-align:middle; }
        .cal-week, .cal-day {
          border:1px solid #e2e8f0; border-radius:12px; overflow:auto; max-height:calc(100dvh - 180px); background:#fff;
        }
        .cal-week-head, .cal-day-head {
          display:grid; position:sticky; top:0; background:#fff; z-index:2; border-bottom:1px solid #e2e8f0;
        }
        .cal-week-head { grid-template-columns:56px repeat(7,minmax(0,1fr)); }
        .cal-day-head { grid-template-columns:56px 1fr; }
        .cal-week-body { display:grid; grid-template-columns:56px repeat(7,minmax(0,1fr)); }
        .cal-day-body { display:grid; grid-template-columns:56px 1fr; }
        .cal-hcell { padding:8px; text-align:center; font-size:12px; font-weight:600; }
        .cal-hour {
          height:48px; border-top:1px solid #f1f3f4; font-size:10px; color:#80868b;
          display:flex; align-items:flex-start; justify-content:flex-end; padding:2px 6px 0 0;
        }
        .cal-slot {
          height:48px; border-top:1px solid #f1f3f4; border-left:1px solid #f1f3f4; position:relative;
        }
        .cal-slot-events {
          position:absolute; inset:2px; display:flex; flex-direction:column; gap:2px; overflow:hidden;
        }
        .cal-ctx {
          position:fixed; z-index:80; background:#fff; border:1px solid #dadce0; border-radius:8px;
          box-shadow:0 8px 28px rgba(60,64,67,.28); min-width:210px; padding:6px 0;
        }
        .cal-ctx button {
          display:block; width:100%; text-align:left; border:none; background:transparent;
          padding:10px 16px; font-size:13px; cursor:pointer; font-family:inherit;
        }
        .cal-ctx button:hover { background:#f1f3f4; }
        .cal-modal-bg {
          position:fixed; inset:0; background:rgba(15,23,42,.28); z-index:90;
          display:flex; align-items:center; justify-content:center; padding:16px;
        }
        .cal-modal {
          width:min(480px, calc(100vw - 32px));
          max-height:min(78dvh, 640px);
          display:flex; flex-direction:column;
          background:#fff;
          border-radius:12px;
          overflow:hidden;
          box-shadow:0 16px 40px rgba(0,0,0,.18);
        }
        .cal-modal-top {
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 16px 8px; flex-shrink:0;
        }
        .cal-modal-top h2 { margin:0; font-size:15px; font-weight:700; color:#0f2b5c; }
        .cal-x {
          width:32px; height:32px; border:none; border-radius:8px; background:transparent;
          font-size:20px; cursor:pointer; color:#64748b; line-height:1;
        }
        .cal-x:hover { background:#f1f5f9; }
        .cal-modal-body { padding:0 16px 8px; overflow-y:auto; flex:1 1 auto; min-height:0; }
        .cal-preview-meta { font-size:13px; color:#64748b; margin:8px 0 10px; line-height:1.45; }
        .cal-preview-desc { font-size:13.5px; color:#334155; white-space:pre-wrap; }
        .cal-title-input {
          width:100%; border:none; border-bottom:1.5px solid #000168; padding:4px 0 10px;
          font-size:16px; font-weight:600; outline:none; font-family:inherit; color:#0f172a;
          box-sizing:border-box; background:transparent;
        }
        .cal-title-input::placeholder { color:#94a3b8; }
        .cal-row-ico {
          font-size:12px; font-weight:600; color:#64748b; text-align:left; padding-top:8px;
          text-transform: none; letter-spacing: -0.01em; line-height:1.2;
        }
        .cal-row {
          display:grid; grid-template-columns:40px 1fr; gap:8px; align-items:start;
          padding:8px 0; border-bottom:1px solid #f1f5f9;
        }
        .cal-row-fields { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .cal-row input[type="date"], .cal-row input[type="time"], .cal-row textarea, .cal-row select, .cal-search {
          border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px; font-size:13px;
          font-family:inherit; outline:none; background:#fff;
        }
        .cal-row input[type="date"] { min-width:150px; }
        .cal-hour-select {
          width:auto !important; min-width:96px; flex:0 0 auto;
        }
        .cal-row select:not(.cal-hour-select) { width:100%; }
        .cal-row-fields select:disabled { opacity:.55; background:#f8fafc; cursor:not-allowed; }
        .cal-search { width:100%; box-sizing:border-box; margin-bottom:6px; }
        .cal-row textarea { width:100%; resize:vertical; min-height:56px; max-height:96px; box-sizing:border-box; }
        .cal-check { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:#334155; }
        .cal-pick-list {
          max-height:140px; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; padding:4px;
        }
        .cal-pick-item {
          display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px;
          font-size:13px; cursor:pointer;
        }
        .cal-pick-item:hover { background:#f8fafc; }
        .cal-modal-acts {
          display:flex; justify-content:flex-end; gap:8px; padding:12px 16px 14px;
          flex-shrink:0; border-top:1px solid #f1f5f9; background:#fff;
        }
        .cal-modal-acts > div { display:flex; gap:6px; }
        .cal-toast {
          position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:100;
          background:#323232; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px;
        }
      `}</style>

      <div className="cal-toolbar">
        <div className="cal-left">
          <h1>{t('calendar.title')}</h1>
          <button type="button" className="cal-btn primary" onClick={() => openCreateAt(new Date(), false)}>+ {t('calendar.create')}</button>
          <button type="button" className="cal-btn" onClick={() => setCursor(startOfDay(new Date()))}>{t('calendar.today')}</button>
          <button type="button" className="cal-btn" onClick={() => nav(-1)}>←</button>
          <button type="button" className="cal-btn" onClick={() => nav(1)}>→</button>
          <div className="cal-title">{titleLabel}</div>
        </div>
        <div className="cal-right">
          <div className="cal-views">
            <button type="button" className={`cal-btn${view === 'month' ? ' on' : ''}`} onClick={() => setView('month')}>{t('calendar.month')}</button>
            <button type="button" className={`cal-btn${view === 'week' ? ' on' : ''}`} onClick={() => setView('week')}>{t('calendar.week')}</button>
            <button type="button" className={`cal-btn${view === 'day' ? ' on' : ''}`} onClick={() => setView('day')}>{t('calendar.day')}</button>
          </div>
          <button type="button" className="cal-btn" onClick={() => void reload()}>{t('qualityHistory.refresh')}</button>
          {isAdmin ? (
            <Link className="cal-btn" to="/pages/front/action-plans">{t('calendar.plans')}</Link>
          ) : (
            <Link className="cal-btn" to="/pages/front/my-action-plans">{t('planDetail.back')}</Link>
          )}
        </div>
      </div>

      <div className="cal-legend">
        <span><i className="cal-dot" style={{ background: '#000168' }} /> {t('calendar.capaPlan')}</span>
        <span><i className="cal-dot" style={{ background: '#c9850a' }} /> {t('calendar.action')}</span>
        <span><i className="cal-dot" style={{ background: '#0b8043' }} /> {t('analysisTools.claim')}</span>
        <span><i className="cal-dot" style={{ background: '#039be5' }} /> {t('calendar.event')}</span>
      </div>

      {!apiOk ? (
        <div className="cal-banner warn">
          {t('calendar.apiOffline')}
        </div>
      ) : (
        <div className="cal-banner">
          {t('calendar.banner1')}{' '}
          {t('calendar.banner2')}
        </div>
      )}

      <div className="cal-shell">
      <div className="cal-body">
        {loading && <div className="cal-hint">{t('common.loading')}</div>}

        {view === 'month' && (
          <div className="cal-grid-month">
            {WEEKDAYS.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {monthCells.map((c) => {
              const dayEvents = allEvents.filter((ev) => eventOnDay(ev, c.date));
              return (
                <div
                  key={c.date.toISOString()}
                  className={`cal-cell${c.inMonth ? '' : ' out'}${sameDay(c.date, today) ? ' today' : ''}${sameDay(c.date, selectedDay) ? ' selected' : ''}`}
                  onClick={() => setSelectedDay(startOfDay(c.date))}
                  onContextMenu={(e) => onDayContext(e, c.date)}
                  onDoubleClick={() => openCreateAt(c.date, false)}
                >
                  <div className="cal-daynum">{c.date.getDate()}</div>
                  <div className="cal-chips">
                    {dayEvents.slice(0, 3).map((ev) => renderEventChip(ev, true))}
                    {dayEvents.length > 3 && <span className="cal-hint">+{dayEvents.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === 'week' && (
          <div className="cal-week">
            <div className="cal-week-head">
              <div />
              {weekDays.map((d) => (
                <div key={d.toISOString()} className="cal-hcell">
                  {WEEKDAYS[(d.getDay() + 6) % 7]} {d.getDate()}
                </div>
              ))}
            </div>
            <div className="cal-week-body">
              <div>
                {hours.map((h) => <div key={h} className="cal-hour">{String(h).padStart(2, '0')}:00</div>)}
              </div>
              {weekDays.map((d) => (
                <div key={d.toISOString()}>
                  {hours.map((h) => {
                    const slotStart = new Date(d);
                    slotStart.setHours(h, 0, 0, 0);
                    const slotEvents = allEvents.filter((ev) => {
                      if (ev.allDay) return h === 0 && eventOnDay(ev, d);
                      return sameDay(ev.start, d) && ev.start.getHours() === h;
                    });
                    return (
                      <div
                        key={h}
                        className="cal-slot"
                        onContextMenu={(e) => onDayContext(e, slotStart)}
                        onDoubleClick={() => openCreateAt(slotStart, false)}
                      >
                        <div className="cal-slot-events">
                          {slotEvents.map((ev) => renderEventChip(ev, true))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'day' && (
          <div className="cal-day">
            <div className="cal-day-head">
              <div />
              <div className="cal-hcell">{WEEKDAYS[(cursor.getDay() + 6) % 7]} {cursor.getDate()}</div>
            </div>
            <div className="cal-day-body">
              <div>
                {hours.map((h) => <div key={h} className="cal-hour">{String(h).padStart(2, '0')}:00</div>)}
              </div>
              <div>
                {hours.map((h) => {
                  const slotStart = new Date(cursor);
                  slotStart.setHours(h, 0, 0, 0);
                  const slotEvents = allEvents.filter((ev) => {
                    if (ev.allDay) return h === 0 && eventOnDay(ev, cursor);
                    return sameDay(ev.start, cursor) && ev.start.getHours() === h;
                  });
                  return (
                    <div
                      key={h}
                      className="cal-slot"
                      onContextMenu={(e) => onDayContext(e, slotStart)}
                      onDoubleClick={() => openCreateAt(slotStart, false)}
                    >
                      <div className="cal-slot-events">
                        {slotEvents.map((ev) => renderEventChip(ev))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="cal-side" aria-label={t('calendar.agenda')}>
        <div className="cal-side-block">
          <h3>
            {selectedDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selectedDayEvents.length === 0 ? (
            <div className="cal-side-empty">{t('calendar.nothingToday')}</div>
          ) : (
            selectedDayEvents.map((ev) => (
              <button
                key={`day-${ev.id}`}
                type="button"
                className="cal-side-item"
                style={{ borderLeftColor: ev.color }}
                onClick={() => openEdit(ev)}
              >
                <strong>
                  {chipMeta(ev) && <span className="cal-chip-tag">{chipMeta(ev)}</span>}
                  {ev.title}
                </strong>
                <span>
                  {ev.allDay
                    ? t('calendar.allDayShort')
                    : ev.start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                  {ev.description ? ` · ${ev.description}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="cal-side-block">
          <h3>{t('calendar.upcoming')}</h3>
          {upcomingEvents.length === 0 ? (
            <div className="cal-side-empty">{t('calendar.noUpcoming')}</div>
          ) : (
            upcomingEvents.map((ev) => (
              <button
                key={`up-${ev.id}`}
                type="button"
                className="cal-side-item"
                style={{ borderLeftColor: ev.color }}
                onClick={() => openEdit(ev)}
              >
                <strong>
                  {chipMeta(ev) && <span className="cal-chip-tag">{chipMeta(ev)}</span>}
                  {ev.title}
                </strong>
                <span>
                  {ev.start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  {!ev.allDay
                    ? ` · ${ev.start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
      </div>

      {menu && (
        <div className="cal-ctx" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => openCreateAt(menu.date, true)}>{t('calendar.newAllDay')}</button>
          <button type="button" onClick={() => openCreateAt(menu.date, false)}>{t('calendar.newTimed')}</button>
        </div>
      )}

      {draft && (
        <div className="cal-modal-bg" onClick={() => !busy && setDraft(null)}>
          <form
            className="cal-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void saveDraft();
            }}
          >
            <div className="cal-modal-top">
              <h2>{draft.id ? t('calendar.editEvent') : t('calendar.newEvent')}</h2>
              <button type="button" className="cal-x" aria-label={t('fiveWhy.close')} disabled={busy} onClick={() => setDraft(null)}>×</button>
            </div>
            <div className="cal-modal-body">
              <input
                className="cal-title-input"
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={t('calendar.titlePlaceholder')}
              />

              <div className="cal-row">
                <span className="cal-row-ico">{t('calendar.date')}</span>
                <div>
                  <div className="cal-row-fields">
                    <input
                      type="date"
                      value={datePart(draft.start)}
                      onChange={(e) => {
                        const day = e.target.value;
                        if (!day) return;
                        const startTime = timePart(draft.start);
                        const start = combineDateTime(day, startTime, draft.allDay);
                        let end: string;
                        if (draft.allDay) {
                          end = day;
                        } else {
                          const s = fromLocalInput(start, false);
                          const en = new Date(s);
                          en.setHours(en.getHours() + 1);
                          end = toLocalInput(en, false);
                        }
                        setDraft({ ...draft, start, end });
                      }}
                    />
                    <select
                      className="cal-hour-select"
                      aria-label={t('calendar.hour')}
                      disabled={draft.allDay}
                      value={timePart(draft.start).slice(0, 2)}
                      onChange={(e) => {
                        const hour = e.target.value.padStart(2, '0');
                        const day = datePart(draft.start);
                        const start = combineDateTime(day, `${hour}:00`, false);
                        const s = fromLocalInput(start, false);
                        const end = new Date(s);
                        end.setHours(end.getHours() + 1);
                        setDraft({
                          ...draft,
                          allDay: false,
                          start,
                          end: toLocalInput(end, false),
                        });
                      }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={String(h).padStart(2, '0')}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="cal-check" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={draft.allDay}
                      onChange={(e) => {
                        const allDay = e.target.checked;
                        const day = datePart(draft.start) || datePart(toLocalInput(new Date(), true));
                        if (allDay) {
                          setDraft({
                            ...draft,
                            allDay: true,
                            start: day,
                            end: day,
                          });
                        } else {
                          const start = combineDateTime(day, timePart(draft.start, '09:00'), false);
                          const s = fromLocalInput(start, false);
                          const end = new Date(s);
                          end.setHours(end.getHours() + 1);
                          setDraft({
                            ...draft,
                            allDay: false,
                            start,
                            end: toLocalInput(end, false),
                          });
                        }
                      }}
                    />
                    {t('calendar.allDay')}
                  </label>
                </div>
              </div>

              <div className="cal-row">
                <span className="cal-row-ico">{t('calendar.info')}</span>
                <div className="cal-inline-2">
                  <div>
                    <span className="cal-field-label">{t('calendar.importance')}</span>
                    <select
                      value={draft.importance}
                      onChange={(e) => setDraft({ ...draft, importance: e.target.value as CalendarImportance })}
                    >
                      {(Object.keys(IMPORTANCE_META) as CalendarImportance[]).map((k) => (
                        <option key={k} value={k}>{t(IMPORTANCE_META[k].label)}</option>
                      ))}
                    </select>
                    {draft.importance !== 'normal' && (
                      <div className="cal-hint" style={{ marginTop: 6 }}>
                        {t('calendar.willNotify')}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="cal-field-label">{t('calendar.color')}</span>
                    <div className="cal-colors">
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`cal-swatch${draft.color === c ? ' on' : ''}`}
                          style={{ background: c }}
                          aria-label={t('calendar.colorAria', { color: c })}
                          onClick={() => setDraft({ ...draft, color: c })}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="cal-row">
                <span className="cal-row-ico">{t('calendar.for')}</span>
                <div>
                  <span className="cal-field-label">{t('calendar.recipients')}</span>
                  <select
                    value={draft.audience}
                    onChange={(e) => setDraft({
                      ...draft,
                      audience: e.target.value as AudienceMode,
                      targetUserIds: [],
                      targetDepartmentIds: [],
                    })}
                  >
                    <option value="all">{t('calendar.audienceAll')}</option>
                    <option value="users">{t('calendar.audienceUsers')}</option>
                    <option value="departments">{t('calendar.audienceDepartments')}</option>
                  </select>
                  <div className="cal-hint" style={{ marginTop: 6 }}>
                    {t('calendar.recipientsHint')}
                    {targetsLoading ? ` · ${t('common.loading')}` : ` · ${t('calendar.targetsCount', { users: users.length, departments: departments.length })}`}
                  </div>
                  {targetsError && (
                    <div className="cal-hint" style={{ marginTop: 4, color: '#b06000' }}>
                      {targetsError}{' '}
                      <button type="button" className="cal-btn" style={{ height: 28, marginLeft: 6 }} onClick={() => void loadTargets()}>
                        {t('calendar.retry')}
                      </button>
                    </div>
                  )}

                  {draft.audience === 'users' && (
                    <div style={{ marginTop: 10 }}>
                      <input
                        className="cal-search"
                        placeholder={t('calendar.searchEmployee')}
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                      />
                      <div className="cal-hint" style={{ marginBottom: 6 }}>
                        {t('calendar.selected', { count: draft.targetUserIds.length })}
                      </div>
                      <div className="cal-pick-list">
                        {filteredUsers.map((u) => (
                          <label key={u.id} className="cal-pick-item">
                            <input
                              type="checkbox"
                              checked={draft.targetUserIds.includes(u.id)}
                              onChange={() => toggleUser(u.id)}
                            />
                            <span>
                              {u.fullName}
                              <span style={{ color: '#80868b', marginLeft: 6 }}>
                                {[u.department, u.email].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </label>
                        ))}
                        {!targetsLoading && filteredUsers.length === 0 && (
                          <div className="cal-hint" style={{ padding: 8 }}>{t('calendar.noEmployee')}</div>
                        )}
                        {targetsLoading && (
                          <div className="cal-hint" style={{ padding: 8 }}>{t('calendar.loadingEmployees')}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {draft.audience === 'departments' && (
                    <div style={{ marginTop: 10 }}>
                      <input
                        className="cal-search"
                        placeholder={t('calendar.searchDepartment')}
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                      />
                      <div className="cal-hint" style={{ marginBottom: 6 }}>
                        {t('calendar.selected', { count: draft.targetDepartmentIds.length })}
                      </div>
                      <div className="cal-pick-list">
                        {filteredDepts.map((d) => (
                          <label key={d.id} className="cal-pick-item">
                            <input
                              type="checkbox"
                              checked={draft.targetDepartmentIds.includes(d.id)}
                              onChange={() => toggleDept(d.id)}
                            />
                            {d.name}
                          </label>
                        ))}
                        {!targetsLoading && filteredDepts.length === 0 && (
                          <div className="cal-hint" style={{ padding: 8 }}>{t('calendar.noDepartment')}</div>
                        )}
                        {targetsLoading && (
                          <div className="cal-hint" style={{ padding: 8 }}>{t('calendar.loadingDepartments')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="cal-row">
                <span className="cal-row-ico">{t('calendar.note')}</span>
                <textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={t('calendar.descriptionPlaceholder')}
                />
              </div>
            </div>

            <div className="cal-modal-acts">
              <div>
                {draft.id && (
                  <button type="button" className="cal-btn" style={{ color: '#d93025' }} disabled={busy} onClick={() => void removeDraft()}>
                    {t('common.delete')}
                  </button>
                )}
              </div>
              <div>
                <button type="button" className="cal-btn" disabled={busy} onClick={() => setDraft(null)}>{t('common.cancel')}</button>
                <button type="submit" className="cal-btn primary" disabled={busy}>
                  {busy ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="cal-toast">{toast}</div>}
    </div>
  );
}
