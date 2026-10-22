import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { ACTION_PLAN_API_URL as ACTION_API, AUTH_API_URL as AUTH_API } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';
import { withScope } from '../../services/organizationScopeStore';

/** Page unique de traçabilité : comptes + workflow (CAPA, claims, RH, orgs…). */
const PAGE_SIZE = 25;

type ModuleKey =
  | 'iam'
  | 'capa'
  | 'calendar'
  | 'document'
  | 'planaction'
  | 'assignment'
  | 'employee'
  | 'quality'
  | 'organization'
  | 'system';

type SourceKey = 'iam' | 'workflow' | '';
type SeverityKey = '' | 'security' | 'mutation' | 'assignment' | 'activity';
type SortOrder = 'desc' | 'asc';
type PresetKey = 'all' | 'actions' | 'capa' | 'quality' | 'assignment';

interface UnifiedEvent {
  id: string;
  source: 'iam' | 'workflow';
  module: ModuleKey;
  action: string;
  actor: string;
  target: string;
  detail: string;
  timestamp: string;
  actionPlanId?: string;
  departmentId?: string;
  departmentName?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

interface AuthAuditLog {
  id: number;
  actorEmail: string;
  targetEmail: string;
  action: string;
  detail: string | null;
  timestamp: string;
}

interface WorkflowHistoryItem {
  id: string;
  actionPlanId?: string;
  actionPlan?: { title?: string; code?: string };
  changedBy: string;
  changedByName?: string;
  actionType: string;
  module?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  note?: string;
  createdAt: string;
  oldAssignedToName?: string;
  newAssignedToName?: string;
  departmentId?: string;
  departmentName?: string;
}

interface ClaimRow {
  id?: string;
  Id?: string;
  title?: string;
  Title?: string;
  clientId?: string;
  ClientId?: string;
  defectType?: string;
  DefectType?: string;
  severity?: string;
  Severity?: string;
  statusCode?: string;
  StatusCode?: string;
  createdById?: string;
  CreatedById?: string;
  createdBy?: string;
  CreatedBy?: string;
  createdAt?: string;
  CreatedAt?: string;
  updatedAt?: string;
  UpdatedAt?: string;
  updatedById?: string;
  UpdatedById?: string;
}

/** label = i18n key */
const MODULE_META: Record<ModuleKey, { label: string; color: string; bg: string; icon: string }> = {
  iam:          { label: 'audit.module.iam',      color: '#6d28d9', bg: '#f5f3ff', icon: 'ti-shield-lock' },
  capa:         { label: 'audit.module.capa',       color: '#000168', bg: '#eef2ff', icon: 'ti-file-description' },
  calendar:     { label: 'audit.module.calendar',         color: '#0284c7', bg: '#e0f2fe', icon: 'ti-calendar' },
  document:     { label: 'audit.module.document',          color: '#4f46e5', bg: '#eef2ff', icon: 'ti-file' },
  planaction:   { label: 'audit.module.planaction',       color: '#b45309', bg: '#fffbeb', icon: 'ti-list-check' },
  assignment:   { label: 'audit.module.assignment',       color: '#7c3aed', bg: '#f5f3ff', icon: 'ti-user-plus' },
  employee:     { label: 'audit.module.employee',     color: '#0f766e', bg: '#f0fdfa', icon: 'ti-users' },
  quality:      { label: 'audit.module.quality',       color: '#be123c', bg: '#fff1f2', icon: 'ti-clipboard-check' },
  organization: { label: 'audit.module.organization',       color: '#334155', bg: '#f1f5f9', icon: 'ti-building' },
  system:       { label: 'audit.module.system',            color: '#64748b', bg: '#f8fafc', icon: 'ti-settings' },
};

/** label = i18n key */
const ACTION_META: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  CREATE:         { label: 'audit.action.CREATE',     bg: '#f0fdf4', color: '#15803d', icon: 'ti-user-plus' },
  UPDATE:         { label: 'audit.action.UPDATE',       bg: '#eff6ff', color: '#1d4ed8', icon: 'ti-pencil' },
  DELETE:         { label: 'audit.action.DELETE',  bg: '#fef2f2', color: '#b91c1c', icon: 'ti-trash' },
  LOCK:           { label: 'audit.action.LOCK',      bg: '#fff7ed', color: '#c2410c', icon: 'ti-lock' },
  LOCKOUT:        { label: 'audit.action.LOCKOUT',      bg: '#fff7ed', color: '#c2410c', icon: 'ti-lock' },
  UNLOCK:         { label: 'audit.action.UNLOCK',    bg: '#f0fdf4', color: '#15803d', icon: 'ti-lock-open' },
  RESET_PASSWORD: { label: 'audit.action.RESET_PASSWORD',         bg: '#fefce8', color: '#a16207', icon: 'ti-key' },
  LOGIN:          { label: 'audit.action.LOGIN',         bg: '#f5f3ff', color: '#6d28d9', icon: 'ti-login' },
  created:            { label: 'audit.action.created',          bg: '#f0fdf4', color: '#15803d', icon: 'ti-file-plus' },
  status_changed:     { label: 'audit.action.status_changed',     bg: '#fffbeb', color: '#b45309', icon: 'ti-arrows-exchange' },
  fields_updated:     { label: 'audit.action.fields_updated',    bg: '#eff6ff', color: '#1d4ed8', icon: 'ti-pencil' },
  assigned:           { label: 'audit.action.assigned',        bg: '#f5f3ff', color: '#7c3aed', icon: 'ti-user-plus' },
  unassigned:         { label: 'audit.action.unassigned',     bg: '#fef2f2', color: '#b91c1c', icon: 'ti-user-minus' },
  reassigned:         { label: 'audit.action.reassigned',      bg: '#f5f3ff', color: '#6d28d9', icon: 'ti-users' },
  archived:           { label: 'audit.action.archived',       bg: '#fff7ed', color: '#c2410c', icon: 'ti-archive' },
  restored:           { label: 'audit.action.restored',      bg: '#f0fdf4', color: '#15803d', icon: 'ti-restore' },
  rejected:           { label: 'audit.action.rejected',       bg: '#fef2f2', color: '#b91c1c', icon: 'ti-x' },
  validated:          { label: 'audit.action.validated',        bg: '#f0fdfa', color: '#0f766e', icon: 'ti-check' },
  progress_updated:   { label: 'audit.action.progress_updated',        bg: '#e0f2fe', color: '#0284c7', icon: 'ti-progress' },
  marked_completed:   { label: 'audit.action.marked_completed',    bg: '#ecfeff', color: '#0891b2', icon: 'ti-flag' },
  document_uploaded:  { label: 'audit.action.document_uploaded',    bg: '#eef2ff', color: '#4f46e5', icon: 'ti-upload' },
  subaction_created:  { label: 'audit.action.subaction_created',       bg: '#f0fdf4', color: '#65a30d', icon: 'ti-plus' },
  subaction_updated:  { label: 'audit.action.subaction_updated',    bg: '#eff6ff', color: '#1d4ed8', icon: 'ti-pencil' },
  subaction_progress: { label: 'audit.action.subaction_progress',       bg: '#fffbeb', color: '#d97706', icon: 'ti-activity' },
  subaction_completed: { label: 'audit.action.subaction_completed',      bg: '#ecfeff', color: '#0891b2', icon: 'ti-flag' },
  subaction_validated: { label: 'audit.action.subaction_validated',      bg: '#f0fdfa', color: '#0f766e', icon: 'ti-check' },
  subaction_rejected:  { label: 'audit.action.subaction_rejected',       bg: '#fef2f2', color: '#b91c1c', icon: 'ti-x' },
  subaction_warning:   { label: 'audit.action.subaction_warning',        bg: '#fff7ed', color: '#c2410c', icon: 'ti-alert-triangle' },
  claim_assigned:      { label: 'audit.action.claim_assigned',          bg: '#f5f3ff', color: '#7c3aed', icon: 'ti-user-plus' },
  claim_unassigned:    { label: 'audit.action.claim_unassigned',        bg: '#fef2f2', color: '#b91c1c', icon: 'ti-user-minus' },
  claim_deadline_set:  { label: 'audit.action.claim_deadline_set',      bg: '#fff7ed', color: '#c2410c', icon: 'ti-calendar-event' },
  claim_archived:      { label: 'audit.action.claim_archived',          bg: '#fff7ed', color: '#c2410c', icon: 'ti-archive' },
  claim_restored:      { label: 'audit.action.claim_restored',          bg: '#f0fdf4', color: '#15803d', icon: 'ti-restore' },
  claim_import_archived: { label: 'audit.action.claim_import_archived', bg: '#fff7ed', color: '#c2410c', icon: 'ti-archive' },
  ishikawa_updated:    { label: 'audit.action.ishikawa_updated',        bg: '#fff1f2', color: '#be123c', icon: 'ti-git-fork' },
  claim_imported:      { label: 'audit.action.claim_imported',          bg: '#eef2ff', color: '#4f46e5', icon: 'ti-file-import' },
  fivewhy_submitted:   { label: 'audit.action.fivewhy_submitted',       bg: '#fefce8', color: '#a16207', icon: 'ti-send' },
  fivewhy_rejected:    { label: 'audit.action.fivewhy_rejected',        bg: '#fef2f2', color: '#b91c1c', icon: 'ti-x' },
  eightd_saved:        { label: 'audit.action.eightd_saved',            bg: '#eff6ff', color: '#1d4ed8', icon: 'ti-device-floppy' },
  eightd_submitted:    { label: 'audit.action.eightd_submitted',        bg: '#fefce8', color: '#a16207', icon: 'ti-send' },
  eightd_validated:    { label: 'audit.action.eightd_validated',        bg: '#f0fdf4', color: '#15803d', icon: 'ti-shield-check' },
  eightd_rejected:     { label: 'audit.action.eightd_rejected',         bg: '#fef2f2', color: '#b91c1c', icon: 'ti-x' },
  warning_sent:        { label: 'audit.action.warning_sent',             bg: '#fff7ed', color: '#c2410c', icon: 'ti-alert-triangle' },
  resubmitted:         { label: 'audit.action.resubmitted',              bg: '#eff6ff', color: '#1d4ed8', icon: 'ti-send' },
  calendar_created:   { label: 'audit.action.calendar_created',     bg: '#e0f2fe', color: '#0284c7', icon: 'ti-calendar-plus' },
  calendar_updated:   { label: 'audit.action.calendar_updated', bg: '#e0f2fe', color: '#0369a1', icon: 'ti-calendar' },
  calendar_deleted:   { label: 'audit.action.calendar_deleted',bg: '#f1f5f9', color: '#64748b', icon: 'ti-calendar-off' },
  profile_updated:    { label: 'audit.action.profile_updated',     bg: '#f0fdfa', color: '#0f766e', icon: 'ti-user' },
  profile_deleted:    { label: 'audit.action.profile_deleted',    bg: '#fef2f2', color: '#b91c1c', icon: 'ti-user-off' },
  badge_awarded:      { label: 'audit.action.badge_awarded',     bg: '#fefce8', color: '#a16207', icon: 'ti-award' },
  badge_removed:      { label: 'audit.action.badge_removed',       bg: '#fff7ed', color: '#c2410c', icon: 'ti-award-off' },
  document_added:     { label: 'audit.action.document_added',    bg: '#eef2ff', color: '#4f46e5', icon: 'ti-file-plus' },
  document_removed:   { label: 'audit.action.document_removed',    bg: '#fef2f2', color: '#b91c1c', icon: 'ti-file-off' },
  timeline_added:     { label: 'audit.action.timeline_added',           bg: '#f8fafc', color: '#475569', icon: 'ti-timeline' },
  claim_created:           { label: 'audit.action.claim_created',        bg: '#fff1f2', color: '#be123c', icon: 'ti-alert-triangle' },
  claim_updated:           { label: 'audit.action.claim_updated',     bg: '#fff1f2', color: '#e11d48', icon: 'ti-pencil' },
  claim_analysis_started:  { label: 'audit.action.claim_analysis_started',  bg: '#fef3c7', color: '#b45309', icon: 'ti-player-play' },
  fivewhy_saved:           { label: 'audit.action.fivewhy_saved',  bg: '#fefce8', color: '#a16207', icon: 'ti-list-numbers' },
  fivewhy_validated:       { label: 'audit.action.fivewhy_validated',      bg: '#f0fdf4', color: '#15803d', icon: 'ti-shield-check' },
  ishikawa_cause_added:    { label: 'audit.action.ishikawa_cause_added',  bg: '#fff1f2', color: '#be123c', icon: 'ti-git-fork' },
  ishikawa_cause_archived: { label: 'audit.action.ishikawa_cause_archived', bg: '#f1f5f9', color: '#64748b', icon: 'ti-archive' },
  org_created:   { label: 'audit.action.org_created',      bg: '#f1f5f9', color: '#334155', icon: 'ti-building' },
  org_updated:   { label: 'audit.action.org_updated',   bg: '#f1f5f9', color: '#475569', icon: 'ti-building' },
  org_archived:  { label: 'audit.action.org_archived',   bg: '#fff7ed', color: '#c2410c', icon: 'ti-archive' },
  dept_created:  { label: 'audit.action.dept_created',       bg: '#f1f5f9', color: '#334155', icon: 'ti-hierarchy' },
  dept_updated:  { label: 'audit.action.dept_updated',    bg: '#f1f5f9', color: '#475569', icon: 'ti-hierarchy' },
  dept_archived: { label: 'audit.action.dept_archived',    bg: '#fff7ed', color: '#c2410c', icon: 'ti-archive' },
};

const SECURITY_ACTIONS = new Set([
  'LOGIN', 'LOCK', 'LOCKOUT', 'UNLOCK', 'RESET_PASSWORD', 'DELETE',
]);
const MUTATION_ACTIONS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'created', 'fields_updated', 'status_changed',
  'archived', 'restored', 'rejected', 'validated', 'profile_updated', 'profile_deleted',
  'org_created', 'org_updated', 'org_archived', 'dept_created', 'dept_updated', 'dept_archived',
  'claim_created', 'claim_updated', 'document_added', 'document_removed', 'document_uploaded',
  'ishikawa_cause_added', 'ishikawa_cause_archived', 'fivewhy_saved',
  'subaction_validated', 'subaction_rejected', 'subaction_warning', 'warning_sent', 'resubmitted',
  'claim_deadline_set', 'claim_archived', 'claim_restored', 'claim_imported', 'claim_import_archived', 'ishikawa_updated', 'fivewhy_rejected', 'fivewhy_validated',
  'eightd_validated', 'eightd_rejected',
]);
const ASSIGNMENT_ACTIONS = new Set(['assigned', 'unassigned', 'reassigned', 'claim_assigned', 'claim_unassigned']);

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'all', label: 'audit.presetAll' },
  { key: 'actions', label: 'audit.presetActions' },
  { key: 'capa', label: 'audit.presetCapa' },
  { key: 'quality', label: 'audit.presetQuality' },
  { key: 'assignment', label: 'audit.presetAssignment' },
];

const ACTOR_SYSTEM = 'Système';
const ACTOR_UNKNOWN = 'Inconnu';
const NON_HUMAN_ACTORS = new Set([ACTOR_SYSTEM, ACTOR_UNKNOWN, 'system', 'unknown']);

const actionMeta = (action: string) => {
  const known = ACTION_META[action] ?? ACTION_META[action.toUpperCase()] ?? ACTION_META[action.toLowerCase()];
  if (known) return { ...known, label: i18n.t(known.label) };
  return { label: action, bg: '#f1f5f9', color: '#475569', icon: 'ti-activity' };
};

const moduleMeta = (mod: ModuleKey) => {
  const meta = MODULE_META[mod] ?? MODULE_META.system;
  return { ...meta, label: i18n.t(meta.label) };
};

/** Actor sentinels stay stable for filtering; only their display is translated. */
const actorDisplay = (name: string) =>
  name === ACTOR_SYSTEM ? i18n.t('audit.system') : name === ACTOR_UNKNOWN ? i18n.t('audit.unknown') : name;

const normAction = (a: string) => String(a || '').trim().toUpperCase();
const isLoginAction = (a: string) => normAction(a) === 'LOGIN';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(dateLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function isUuid(s?: string | null) {
  return !!s && /^[0-9a-f-]{36}$/i.test(s);
}

function emailLocalPart(email?: string | null) {
  if (!email || !email.includes('@')) return email || '';
  return email.split('@')[0];
}

function eventSeverity(action: string): Exclude<SeverityKey, ''> {
  const key = ACTION_META[action] ? action : (ACTION_META[action.toUpperCase()] ? action.toUpperCase() : action.toLowerCase());
  if (SECURITY_ACTIONS.has(key) || SECURITY_ACTIONS.has(normAction(action))) return 'security';
  if (ASSIGNMENT_ACTIONS.has(action) || ASSIGNMENT_ACTIONS.has(action.toLowerCase())) return 'assignment';
  if (MUTATION_ACTIONS.has(key) || MUTATION_ACTIONS.has(action.toLowerCase())) return 'mutation';
  return 'activity';
}

function inferModule(actionType: string, rawModule?: string): ModuleKey {
  const a = String(actionType || '').toLowerCase();
  if (['create', 'update', 'delete', 'lock', 'lockout', 'unlock', 'reset_password', 'login'].includes(a)) {
    return 'iam';
  }
  if (a.startsWith('calendar_')) return 'calendar';
  if (a.startsWith('document_') || a === 'document_uploaded') return 'document';
  if (a.startsWith('subaction_')) return 'planaction';
  if (['assigned', 'unassigned', 'reassigned', 'claim_assigned', 'claim_unassigned'].includes(a)) return 'assignment';
  if (a.startsWith('profile_') || a.startsWith('badge_') || a.startsWith('timeline_')) return 'employee';
  if (a.startsWith('claim_') || a.startsWith('fivewhy_') || a.startsWith('ishikawa_') || a.startsWith('eightd_')) return 'quality';
  if (a.startsWith('org_') || a.startsWith('dept_')) return 'organization';

  const m = String(rawModule || '').toLowerCase();
  if (m && m in MODULE_META) return m as ModuleKey;
  return 'capa';
}

type UserIndex = {
  byId: Record<string, string>;
  byEmail: Record<string, string>;
  /** lower-cased name -> the name as written on the account (one spelling per person) */
  canon: Record<string, string>;
  /** account name -> its department, for the events that carry none */
  deptByName: Record<string, { id?: string; name: string }>;
};

function buildUserIndex(users: any[]): UserIndex {
  const byId: Record<string, string> = {};
  const byEmail: Record<string, string> = {};
  const canon: Record<string, string> = {};
  const deptByName: Record<string, { id?: string; name: string }> = {};
  for (const u of users) {
    const id = String(u.id ?? u.Id ?? '').trim();
    const email = String(u.email ?? u.Email ?? '').trim().toLowerCase();
    const fullName = String(u.fullName ?? u.FullName ?? '').trim();
    const userName = String(u.userName ?? u.UserName ?? '').trim();
    const label =
      fullName
      || (userName.includes('@') ? emailLocalPart(userName) : userName)
      || emailLocalPart(email)
      || email
      || id;
    if (!label) continue;
    if (id) byId[id.toLowerCase()] = label;
    if (email) byEmail[email] = label;
    const known = canon[label.toLowerCase()];
    if (!known || (known === known.toLowerCase() && label !== label.toLowerCase())) canon[label.toLowerCase()] = label;
    const deptName = String(u.department ?? u.Department ?? u.departmentName ?? u.DepartmentName ?? '').trim();
    if (deptName) {
      const deptId = String(u.departmentId ?? u.DepartmentId ?? '').trim();
      deptByName[label] = { id: deptId || undefined, name: deptName };
    }
  }
  return { byId, byEmail, canon, deptByName };
}

function resolveActorLabel(raw: string | null | undefined, index: UserIndex): string {
  const value = String(raw || '').trim();
  if (!value || value.toLowerCase() === 'system') return ACTOR_SYSTEM;
  if (value.toLowerCase() === 'unknown') return ACTOR_UNKNOWN;

  const lower = value.toLowerCase();
  // one spelling per name: two accounts of the same person ("ahlem alaya" / "Ahlem Alaya") are listed once
  const one = (label: string) => index.canon[label.toLowerCase()] ?? label;
  if (index.byId[lower]) return one(index.byId[lower]);
  if (index.byEmail[lower]) return one(index.byEmail[lower]);

  if (value.includes('@')) return emailLocalPart(value) || value;
  if (isUuid(value)) return `${value.slice(0, 8)}…`;
  return index.canon[lower] ?? value;
}

function actorFilterLabel(name: string): string {
  if (name === ACTOR_SYSTEM) return i18n.t('audit.systemFilter');
  if (name === ACTOR_UNKNOWN) return i18n.t('audit.unknownFilter');
  return name;
}

function mapIam(log: AuthAuditLog, users: UserIndex): UnifiedEvent {
  const action = String(log.action || '').trim();
  const actor = resolveActorLabel(log.actorEmail, users);
  const target = resolveActorLabel(log.targetEmail, users) || log.targetEmail || '—';
  const rawDetail = String(log.detail || '').trim();
  let detail = rawDetail || '—';
  if (!rawDetail) {
    const a = action.toUpperCase();
    if (a === 'LOGIN') detail = i18n.t('audit.detailLogin', { target });
    else if (a === 'LOCK') detail = i18n.t('audit.detailLock', { target });
    else if (a === 'LOCKOUT') detail = i18n.t('audit.detailLockout', { target });
    else if (a === 'UNLOCK') detail = i18n.t('audit.detailUnlock', { target });
    else if (a === 'RESET_PASSWORD') detail = i18n.t('audit.detailReset', { target });
  }
  return {
    id: `iam-${log.id}`,
    source: 'iam',
    module: 'iam',
    action: ACTION_META[action] ? action : (ACTION_META[action.toUpperCase()] ? action.toUpperCase() : action),
    actor,
    target,
    detail,
    timestamp: log.timestamp,
  };
}

function mapWorkflow(item: WorkflowHistoryItem, users: UserIndex): UnifiedEvent {
  const planLabel = item.actionPlan?.title || item.actionPlan?.code || '';
  const assign =
    item.newAssignedToName || item.oldAssignedToName
      ? ` · ${item.oldAssignedToName || '—'} → ${item.newAssignedToName || '—'}`
      : '';
  const target = planLabel || item.relatedEntityType || item.relatedEntityId || item.departmentName || '—';
  const detail = [item.note, assign].filter(Boolean).join('') || planLabel || '—';
  const rawActor =
    (!isUuid(item.changedByName) && item.changedByName)
    || item.changedBy
    || ACTOR_SYSTEM;

  return {
    id: `wf-${item.id}`,
    source: 'workflow',
    module: inferModule(item.actionType, item.module),
    action: item.actionType,
    actor: resolveActorLabel(rawActor, users),
    target: String(target),
    detail: String(detail),
    timestamp: item.createdAt,
    actionPlanId: item.actionPlanId ? String(item.actionPlanId) : undefined,
    departmentId: item.departmentId ? String(item.departmentId) : undefined,
    departmentName: item.departmentName || undefined,
    relatedEntityId: item.relatedEntityId ? String(item.relatedEntityId) : undefined,
    relatedEntityType: item.relatedEntityType || undefined,
  };
}

function mapClaimsToEvents(claims: ClaimRow[], users: UserIndex, existing: UnifiedEvent[]): UnifiedEvent[] {
  const covered = new Set(
    existing
      .filter((e) => e.module === 'quality' && e.relatedEntityId)
      .map((e) => `${e.action}:${String(e.relatedEntityId).toLowerCase()}`),
  );
  // a claim with recorded events no longer needs the dates reconstructed from its row
  for (const e of existing) {
    if (e.relatedEntityId && /^(ce|e8)-/.test(String(e.id))) covered.add(`any:${String(e.relatedEntityId).toLowerCase()}`);
  }
  // Also cover by claim id appearing in detail/target for older logs without relatedEntityId
  for (const e of existing) {
    if (e.module !== 'quality') continue;
    const hay = `${e.detail} ${e.target} ${e.id}`.toLowerCase();
    const m = hay.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (m) covered.add(`claim_created:${m[0].toLowerCase()}`);
  }

  const out: UnifiedEvent[] = [];
  for (const c of claims) {
    const id = String(c.id ?? c.Id ?? '').trim();
    if (!id) continue;
    const title = String(c.title ?? c.Title ?? `Claim ${id.slice(0, 8)}`);
    const status = String(c.statusCode ?? c.StatusCode ?? '—');
    const defect = String(c.defectType ?? c.DefectType ?? '');
    const client = String(c.clientId ?? c.ClientId ?? '');
    const createdAt = String(c.createdAt ?? c.CreatedAt ?? '');
    const updatedAt = String(c.updatedAt ?? c.UpdatedAt ?? '');
    const createdBy = String(c.createdById ?? c.CreatedById ?? c.createdBy ?? c.CreatedBy ?? '');
    const updatedBy = String(c.updatedById ?? c.UpdatedById ?? createdBy);

    const createKey = `claim_created:${id.toLowerCase()}`;
    if (!covered.has(createKey) && !covered.has(`any:${id.toLowerCase()}`) && createdAt) {
      out.push({
        id: `claim-created-${id}`,
        source: 'workflow',
        module: 'quality',
        action: 'claim_created',
        actor: resolveActorLabel(createdBy, users),
        target: title,
        detail: [status, defect, client ? i18n.t('audit.client', { client }) : ''].filter(Boolean).join(' · ') || i18n.t('analysisTools.claim'),
        timestamp: createdAt,
        relatedEntityId: id,
        relatedEntityType: 'Claim',
      });
      covered.add(createKey);
    }

    const updatedMs = updatedAt ? new Date(updatedAt).getTime() : NaN;
    const createdMs = createdAt ? new Date(createdAt).getTime() : NaN;
    const hasMeaningfulUpdate =
      !Number.isNaN(updatedMs)
      && !Number.isNaN(createdMs)
      && updatedMs - createdMs > 60_000
      && !covered.has(`any:${id.toLowerCase()}`);

    if (hasMeaningfulUpdate) {
      const statusUp = status.toUpperCase();
      const action =
        statusUp.includes('ANALYS') || statusUp === 'EN_ANALYSE'
          ? 'claim_analysis_started'
          : 'claim_updated';
      const updateKey = `${action}:${id.toLowerCase()}`;
      if (!covered.has(updateKey) && !covered.has(`claim_updated:${id.toLowerCase()}`)) {
        out.push({
          id: `claim-${action}-${id}`,
          source: 'workflow',
          module: 'quality',
          action,
          actor: resolveActorLabel(updatedBy, users),
          target: title,
          detail: `${i18n.t('audit.statusPrefix', { status })}${defect ? ` · ${defect}` : ''}`,
          timestamp: updatedAt,
          relatedEntityId: id,
          relatedEntityType: 'Claim',
        });
        covered.add(updateKey);
      }
    }
  }
  return out;
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function detectPreset(params: URLSearchParams): PresetKey {
  const tab = params.get('tab');
  const preset = params.get('preset');
  if (
    tab === 'actions'
    || preset === 'actions'
    || preset === 'actions_with'
    || preset === 'actions_without'
  ) {
    return 'actions';
  }
  if (params.get('module') === 'capa' || preset === 'capa') return 'capa';
  if (params.get('module') === 'quality' || preset === 'quality') return 'quality';
  if (params.get('module') === 'assignment' || preset === 'assignment') return 'assignment';
  return 'all';
}

function detectIncludeLogin(params: URLSearchParams): boolean {
  // Par défaut hors connexions ; login=1 → inclure les LOGIN
  return params.get('login') === '1' || params.get('preset') === 'actions_with';
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const redirectToLoginLogs =
    searchParams.get('type') === 'LOGIN' || searchParams.get('preset') === 'login';

  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partialError, setPartialError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterActor, setFilterActor] = useState('');
  const [filterSource, setFilterSource] = useState<SourceKey>('');
  const [filterSeverity, setFilterSeverity] = useState<SeverityKey>('');
  const [filterDept, setFilterDept] = useState('');
  const [filterPlanId, setFilterPlanId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [excludeLogin, setExcludeLogin] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [preset, setPreset] = useState<PresetKey>('all');
  const [page, setPage] = useState(1);

  const applyPreset = useCallback((key: PresetKey, planIdFromUrl?: string | null, includeLogin?: boolean) => {
    setPreset(key);
    setSearch('');
    setFilterActor('');
    setFilterSeverity('');
    setFilterDept('');
    setDateFrom('');
    setDateTo('');
    setFilterPlanId(planIdFromUrl || '');
    setPage(1);

    if (key === 'actions') {
      setFilterSource('');
      setFilterModule('');
      setFilterAction('');
      setExcludeLogin(!(includeLogin ?? false));
    } else if (key === 'capa') {
      setFilterSource('workflow');
      setFilterModule('capa');
      setFilterAction('');
      setExcludeLogin(false);
    } else if (key === 'quality') {
      setFilterSource('');
      setFilterModule('quality');
      setFilterAction('');
      setExcludeLogin(false);
    } else if (key === 'assignment') {
      setFilterSource('workflow');
      setFilterModule('assignment');
      setFilterAction('');
      setExcludeLogin(false);
    } else {
      setFilterSource('');
      setFilterModule('');
      setFilterAction('');
      setExcludeLogin(false);
    }
  }, []);

  // Sync URL → filtres (nav, deep links planId, anciens liens history)
  useEffect(() => {
    const key = detectPreset(searchParams);
    const planId = searchParams.get('planId');
    applyPreset(key, planId, key === 'actions' ? detectIncludeLogin(searchParams) : undefined);
  }, [searchParams, applyPreset]);

  const goPreset = (key: PresetKey) => {
    const next = new URLSearchParams();
    if (key === 'actions') {
      next.set('tab', 'actions');
      // conserver le choix include-login si déjà sur Actions
      if (preset === 'actions' && !excludeLogin) next.set('login', '1');
    } else if (key === 'capa') next.set('module', 'capa');
    else if (key === 'quality') next.set('module', 'quality');
    else if (key === 'assignment') next.set('module', 'assignment');
    const planId = searchParams.get('planId');
    if (planId) next.set('planId', planId);
    setSearchParams(next, { replace: true });
  };

  const setActionsIncludeLogin = (include: boolean) => {
    const next = new URLSearchParams();
    next.set('tab', 'actions');
    if (include) next.set('login', '1');
    const planId = searchParams.get('planId');
    if (planId) next.set('planId', planId);
    setSearchParams(next, { replace: true });
  };

  const fetchAll = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    setPartialError(false);
    const hdrs = { Authorization: `Bearer ${accessToken}` };

    try {
      const [iamRes, wfRes, usersRes, claimsRes, claimsHistRes, claimEventsRes] = await Promise.allSettled([
        fetch(withScope(`${AUTH_API}/api/admin/audit-logs?page=1&pageSize=1000`), { headers: hdrs }),
        fetch(withScope(`${ACTION_API}/actionplan/history`), { headers: hdrs }),
        fetch(`${AUTH_API}/api/admin/users`, { headers: hdrs }),
        // Sans status : le backend filtre déjà hors DRAFT. `status=all` matchait StatusCode=="ALL" → 0 résultats.
        fetch(withScope(`${ACTION_API}/QualityAnalysis/claims`), { headers: hdrs }),
        fetch(withScope(`${ACTION_API}/QualityAnalysis/claims/history?page=1&pageSize=100&sort=updatedAt&dir=desc`), { headers: hdrs }),
        fetch(withScope(`${ACTION_API}/QualityAnalysis/claims/events`), { headers: hdrs }),
      ]);

      let userIndex: UserIndex = { byId: {}, byEmail: {}, canon: {}, deptByName: {} };
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        try {
          const raw = await usersRes.value.json();
          const list = Array.isArray(raw) ? raw : (raw?.data ?? raw?.$values ?? []);
          userIndex = buildUserIndex(list);
        } catch { /* empty */ }
      }

      const unified: UnifiedEvent[] = [];
      const errors: string[] = [];

      if (iamRes.status === 'fulfilled' && iamRes.value.ok) {
        const data = await iamRes.value.json();
        const logs: AuthAuditLog[] = data.logs ?? data ?? [];
        unified.push(...logs.map((l) => mapIam(l, userIndex)));
      } else errors.push(i18n.t('audit.sourceAccounts'));

      if (wfRes.status === 'fulfilled' && wfRes.value.ok) {
        const raw = await wfRes.value.json();
        const list: WorkflowHistoryItem[] = Array.isArray(raw)
          ? raw
          : (raw?.$values ?? raw?.data ?? raw?.items ?? []);
        unified.push(...list.map((item) => mapWorkflow(item, userIndex)));
      } else errors.push('Workflow');

      // Claims / 8D: the recorded events (claim changes, 8D history, imports)
      if (claimEventsRes.status === 'fulfilled' && claimEventsRes.value.ok) {
        try {
          const raw = await claimEventsRes.value.json();
          const list: any[] = Array.isArray(raw) ? raw : (raw?.$values ?? raw?.data ?? raw?.items ?? []);
          for (const e of list) {
            const claimId = e.claimId ? String(e.claimId) : undefined;
            unified.push({
              id: String(e.id),
              source: 'workflow',
              module: inferModule(String(e.actionType), 'quality'),
              action: String(e.actionType),
              actor: resolveActorLabel(e.actorName || e.actorId, userIndex),
              target: String(e.claimTitle || '—'),
              detail: String(e.detail || e.claimTitle || '—'),
              timestamp: String(e.createdAt),
              relatedEntityId: claimId,
              relatedEntityType: claimId ? 'Claim' : 'Import',
              departmentId: e.departmentId ? String(e.departmentId) : undefined,
              departmentName: e.departmentName || undefined,
            });
          }
        } catch { /* the claims list below still gives creation and update dates */ }
      }

      // Claims / 8D : liste claims + historique (complète le journal workflow)
      const claimRows: ClaimRow[] = [];
      let claimsOk = false;

      if (claimsRes.status === 'fulfilled' && claimsRes.value.ok) {
        try {
          const raw = await claimsRes.value.json();
          const list: ClaimRow[] = Array.isArray(raw)
            ? raw
            : (raw?.$values ?? raw?.data ?? raw?.items ?? []);
          claimRows.push(...list);
          claimsOk = true;
        } catch {
          /* try history below */
        }
      }

      if (claimsHistRes.status === 'fulfilled' && claimsHistRes.value.ok) {
        try {
          const raw = await claimsHistRes.value.json();
          const list: ClaimRow[] = Array.isArray(raw)
            ? raw
            : (raw?.items ?? raw?.$values ?? raw?.data ?? []);
          // Fusion par id (history peut apporter des lignes absentes de GetClaims)
          const seen = new Set(
            claimRows.map((c) => String(c.id ?? c.Id ?? '').toLowerCase()).filter(Boolean),
          );
          for (const row of list) {
            const id = String(row.id ?? row.Id ?? '').toLowerCase();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            claimRows.push(row);
          }
          claimsOk = true;
        } catch {
          /* ignore */
        }
      }

      if (claimsOk) {
        unified.push(...mapClaimsToEvents(claimRows, userIndex, unified));
      } else {
        errors.push('Claims');
      }

      // events without a department take the one of the person who did it
      for (const e of unified) {
        if (e.departmentId || e.departmentName) continue;
        const d = userIndex.deptByName[e.actor];
        if (d) { e.departmentId = d.id; e.departmentName = d.name; }
      }

      unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(unified);

      if (errors.length >= 3) setError(i18n.t('audit.loadFailedAll'));
      else if (errors.length > 0) {
        setPartialError(true);
        setError(i18n.t('audit.partial', { sources: errors.join(', ') }));
      }
    } catch {
      setError(i18n.t('qualityHistory.loadFailed'));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    const planId = filterPlanId.trim().toLowerCase();

    const rows = events.filter((e) => {
      if (excludeLogin && isLoginAction(e.action)) return false;
      if (filterModule && e.module !== filterModule) return false;
      if (filterAction && normAction(e.action) !== normAction(filterAction)) return false;
      if (filterActor && e.actor !== filterActor) return false;
      if (filterSource && e.source !== filterSource) return false;
      if (filterSeverity && eventSeverity(e.action) !== filterSeverity) return false;
      if (filterDept) {
        if (e.departmentId !== filterDept && e.departmentName !== filterDept) return false;
      }
      if (planId) {
        const matchPlan =
          (e.actionPlanId || '').toLowerCase() === planId
          || e.target.toLowerCase().includes(planId)
          || e.detail.toLowerCase().includes(planId);
        if (!matchPlan) return false;
      }

      const ts = new Date(e.timestamp).getTime();
      if (Number.isNaN(ts)) return false;
      if (fromTs != null && !Number.isNaN(fromTs) && ts < fromTs) return false;
      if (toTs != null && !Number.isNaN(toTs) && ts > toTs) return false;

      if (!q) return true;
      return (
        e.actor.toLowerCase().includes(q)
        || e.target.toLowerCase().includes(q)
        || e.detail.toLowerCase().includes(q)
        || e.action.toLowerCase().includes(q)
        || actionMeta(e.action).label.toLowerCase().includes(q)
        || moduleMeta(e.module).label.toLowerCase().includes(q)
        || (e.departmentName || '').toLowerCase().includes(q)
        || (e.actionPlanId || '').toLowerCase().includes(q)
      );
    });

    rows.sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? db - da : da - db;
    });
    return rows;
  }, [
    events, search, filterModule, filterAction, filterActor,
    filterSource, filterSeverity, filterDept, filterPlanId,
    dateFrom, dateTo, excludeLogin, sortOrder,
  ]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    const startOfBusinessDay = (() => {
      const d = new Date();
      d.setHours(8, 0, 0, 0);
      if (now < d.getTime()) d.setDate(d.getDate() - 1);
      return d.getTime();
    })();
    const last7 = filtered.filter((e) => now - new Date(e.timestamp).getTime() <= 7 * dayMs).length;
    const today = filtered.filter((e) => {
      const ts = new Date(e.timestamp).getTime();
      return !Number.isNaN(ts) && ts >= startOfBusinessDay && ts <= now;
    }).length;
    const actors = new Set(
      filtered.map((e) => e.actor).filter((a) => a && !NON_HUMAN_ACTORS.has(a)),
    ).size;

    return [
      { key: 'total', value: filtered.length, color: '#000168' },
      { key: 'today', value: today, color: '#0369a1' },
      { key: 'week', value: last7, color: '#0f766e' },
      { key: 'actors', value: actors, color: '#7c3aed' },
      { key: 'security', value: filtered.filter((e) => eventSeverity(e.action) === 'security').length, color: '#c2410c' },
      { key: 'mutations', value: filtered.filter((e) => eventSeverity(e.action) === 'mutation').length, color: '#1d4ed8' },
      { key: 'assign', value: filtered.filter((e) => eventSeverity(e.action) === 'assignment').length, color: '#6d28d9' },
      { key: 'modules', value: new Set(filtered.map((e) => e.module)).size, color: '#be123c' },
    ];
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const moduleOptions = useMemo(() => {
    const present = new Set(events.map((e) => e.module));
    const prefer: ModuleKey[] = ['iam', 'capa', 'quality', 'assignment', 'employee', 'document', 'calendar', 'planaction', 'organization'];
    return (Object.keys(MODULE_META) as ModuleKey[]).filter((k) => present.has(k) || prefer.includes(k));
  }, [events]);

  // Actions disponibles selon source/module déjà choisis (cascade)
  const actionOptions = useMemo(() => {
    const pool = events.filter((e) => {
      if (filterSource && e.source !== filterSource) return false;
      if (filterModule && e.module !== filterModule) return false;
      if (excludeLogin && isLoginAction(e.action)) return false;
      return true;
    });
    const set = new Set(pool.map((e) => e.action));
    if (filterAction) set.add(filterAction);
    return Array.from(set).sort((a, b) =>
      actionMeta(a).label.localeCompare(actionMeta(b).label, i18n.language),
    );
  }, [events, filterSource, filterModule, excludeLogin, filterAction]);

  const actorOptions = useMemo(() => {
    const pool = events.filter((e) => {
      if (filterSource && e.source !== filterSource) return false;
      if (filterModule && e.module !== filterModule) return false;
      if (filterAction && normAction(e.action) !== normAction(filterAction)) return false;
      if (excludeLogin && isLoginAction(e.action)) return false;
      return true;
    });
    const set = new Set(pool.map((e) => e.actor).filter(Boolean));
    if (filterActor) set.add(filterActor);
    return Array.from(set).sort((a, b) => {
      const rank = (n: string) => (n === ACTOR_SYSTEM ? 2 : n === ACTOR_UNKNOWN ? 3 : 1);
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.localeCompare(b, i18n.language);
    });
  }, [events, filterSource, filterModule, filterAction, excludeLogin, filterActor]);

  const deptOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (e.departmentId) map.set(e.departmentId, e.departmentName || e.departmentId);
      else if (e.departmentName) map.set(e.departmentName, e.departmentName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [events]);

  const resetFilters = () => {
    setSearchParams({}, { replace: true });
    applyPreset('all');
  };

  const activeFilterCount = [
    search, filterModule, filterAction, filterActor, filterSource, filterSeverity,
    filterDept, filterPlanId, dateFrom, dateTo,
  ].filter(Boolean).length + (excludeLogin ? 1 : 0) + (preset !== 'all' ? 1 : 0);

  const bumpPage = () => setPage(1);

  const exportRows = useCallback(() => filtered.map((e) => ({
    date: formatDate(e.timestamp),
    source: e.source === 'iam' ? i18n.t('audit.sourceAccounts') : 'Workflow',
    module: moduleMeta(e.module).label,
    action: actionMeta(e.action).label,
    actionCode: e.action,
    actor: actorDisplay(e.actor),
    target: e.target,
    detail: e.detail,
    department: e.departmentName || '',
    planId: e.actionPlanId || '',
    severity: eventSeverity(e.action),
  })), [filtered]);

  const handleExportCsv = () => {
    const rows = exportRows();
    downloadCsv(
      `${t('audit.fileName')}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t('audit.csvHeader').split('|'),
        ...rows.map((r) => [
          r.date, r.source, r.module, r.action, r.actionCode, r.actor, r.target, r.detail, r.department, r.planId, r.severity,
        ]),
      ],
    );
  };

  const handleExportPdf = () => {
    const rows = exportRows();
    exportCapaPdf({
      title: t('audit.pdfTitle'),
      subtitle: t('audit.pdfSubtitle'),
      filename: `${t('audit.fileName')}-${new Date().toISOString().slice(0, 10)}`,
      meta: [
        t('audit.pdfCount', { count: rows.length }),
        t('audit.pdfFilters', { count: activeFilterCount }),
        dateFrom || dateTo ? t('audit.pdfPeriod', { from: dateFrom || '…', to: dateTo || '…' }) : t('audit.pdfPeriodAll'),
        filterModule ? t('audit.pdfModule', { module: moduleMeta(filterModule as ModuleKey).label }) : '',
        filterActor ? t('audit.pdfActor', { actor: actorDisplay(filterActor) }) : '',
        filterPlanId ? t('audit.pdfPlan', { plan: filterPlanId }) : '',
      ].filter(Boolean),
      columns: [
        { key: 'date', label: t('audit.colDate') },
        { key: 'module', label: t('audit.colModule') },
        { key: 'action', label: t('audit.colAction') },
        { key: 'actor', label: t('audit.colActor') },
        { key: 'target', label: t('audit.colTarget') },
        { key: 'detail', label: t('audit.colDetail') },
      ],
      rows: rows.map((r) => ({
        date: r.date,
        module: r.module,
        action: r.action,
        actor: r.actor,
        target: r.target,
        detail: r.detail,
      })),
    });
  };

  if (redirectToLoginLogs) {
    return <Navigate to="/admin/login-logs" replace />;
  }

  return (
    <div className="aul-wrap">
      <style>{`
        .aul-wrap { margin-top:0; padding-top:0; }
        .aul-sub { font-size:12px; color:#64748b; margin:0 0 10px; }
        .aul-presets { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; align-items:center; }
        .aul-preset {
          border:1px solid #e4e8f2; background:#fff; color:#374151;
          border-radius:999px; padding:5px 12px; font-size:11px; font-weight:600;
          cursor:pointer; font-family:inherit;
        }
        .aul-preset:hover { border-color:#000168; color:#000168; }
        .aul-preset.active { background:#000168; border-color:#000168; color:#fff; }
        .aul-login-toggle {
          display:inline-flex; align-items:center; gap:0; margin-left:4px;
          padding:3px; border-radius:20px; border:1px solid #e4e8f2; background:#f8f9fc;
        }
        .aul-login-toggle button {
          border:none; background:transparent; cursor:pointer; font:inherit;
          font-size:11px; font-weight:650; color:#64748b;
          padding:4px 10px; border-radius:16px; white-space:nowrap;
        }
        .aul-login-toggle button.active { background:#000168; color:#fff; }
        .aul-login-toggle button:hover:not(.active) { color:#000168; }
        .aul-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:10px; flex-wrap:wrap; }
        .aul-filters { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-bottom:10px; }
        .aul-srch { display:flex; align-items:center; gap:6px; background:#f8f9fc; border:1px solid #e4e8f2; border-radius:8px; padding:8px 12px; flex:1; min-width:220px; }
        .aul-srch:focus-within { border-color:#000168; }
        .aul-srch i { color:#94a3b8; font-size:14px; }
        .aul-srch input { background:none; border:none; outline:none; font-size:13px; color:#0d1340; width:100%; font-family:inherit; }
        .aul-sel, .aul-date { padding:8px 12px; border:1px solid #e4e8f2; border-radius:8px; font-size:12px; font-family:inherit; color:#374151; background:#f8f9fc; outline:none; width:100%; }
        .aul-sel:focus, .aul-date:focus { border-color:#000168; }
        .aul-btn { display:inline-flex; align-items:center; gap:5px; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; border:1px solid #e4e8f2; background:#fff; color:#0d1340; }
        .aul-btn:hover { border-color:#000168; color:#000168; }
        .aul-btn.primary { background:#000168; color:#fff; border-color:#000168; }
        .aul-btn.primary:hover { background:#00009e; }
        .aul-btn:disabled { opacity:.45; cursor:not-allowed; }
        .aul-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
        .aul-kpi {
          background:linear-gradient(180deg,#fff 0%,#f8f9fc 100%);
          border:1px solid #e8ecf4; border-radius:12px; padding:10px 12px 12px;
          display:flex; flex-direction:column; gap:6px; min-height:88px;
          transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .aul-kpi:hover { transform:translateY(-3px); border-color:#c7d2e8; box-shadow:0 8px 20px rgba(13,19,64,.08); background:#fff; }
        .aul-kpi-val { font-size:22px; font-weight:700; line-height:1; color:#0d1340; }
        .aul-kpi-lbl { font-size:12px; font-weight:600; color:#0d1340; margin:2px 0 0; }
        .aul-kpi-hint { font-size:10px; line-height:1.4; color:#64748b; margin:0; }
        .aul-card { background:#fff; border:1px solid #e4e8f2; border-radius:12px; overflow:hidden; }
        .aul-card table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .aul-card thead th { padding:10px 12px; text-align:left; font-size:9px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; color:#94a3b8; background:#f8f9fc; border-bottom:1px solid #f0f2f8; }
        .aul-card tbody td { padding:11px 12px; border-bottom:1px solid #f0f2f8; font-size:12px; color:#374151; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .aul-card tbody tr:hover td { background:#fafbff; }
        .aul-card th:nth-child(1){width:13%} .aul-card th:nth-child(2){width:12%} .aul-card th:nth-child(3){width:16%}
        .aul-card th:nth-child(4){width:16%} .aul-card th:nth-child(5){width:16%} .aul-card th:nth-child(6){width:27%}
        .aul-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:20px; font-size:10px; font-weight:700; }
        .aul-email { font-size:11px; color:#64748b; }
        .aul-detail { font-size:11px; color:#64748b; }
        .aul-empty { padding:48px 24px; text-align:center; color:#94a3b8; font-size:13px; }
        .aul-empty i { font-size:36px; display:block; margin-bottom:10px; opacity:.35; }
        .aul-pagination { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-top:1px solid #f0f2f8; }
        .aul-pg-info { font-size:12px; color:#64748b; }
        .aul-pg-btns { display:flex; gap:4px; }
        .aul-pg-btn { padding:5px 12px; border-radius:6px; border:1px solid #e4e8f2; background:#f8f9fc; font-size:12px; font-weight:500; color:#374151; cursor:pointer; font-family:inherit; }
        .aul-pg-btn:hover:not(:disabled) { border-color:#000168; color:#000168; }
        .aul-pg-btn:disabled { opacity:.4; cursor:not-allowed; }
        .aul-pg-btn.active { background:#000168; color:#fff; border-color:#000168; }
        .aul-error { display:flex; align-items:center; gap:8px; padding:12px 16px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; font-size:13px; color:#b91c1c; margin-bottom:12px; }
        .aul-warn { display:flex; align-items:center; gap:8px; padding:10px 14px; background:#fffbeb; border:1px solid #fde68a; border-radius:10px; font-size:12px; color:#92400e; margin-bottom:12px; }
        .aul-chip { font-size:11px; color:#64748b; margin-bottom:10px; }
        @keyframes aul-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .aul-sk { background:#e8ecf4; border-radius:6px; animation:aul-pulse 1.4s ease-in-out infinite; height:44px; margin:0 14px 2px; }
        @media (max-width: 1100px) { .aul-kpis { grid-template-columns:repeat(2,1fr); } }
        @media (max-width: 900px) {
          .aul-card th:nth-child(5), .aul-card td:nth-child(5) { display:none; }
        }
      `}</style>

      <p className="aul-sub">
        {t('audit.subtitle')}
        {filterPlanId ? ` · ${t('audit.planShort', { plan: filterPlanId.slice(0, 8) })}` : ''}
      </p>

      <div className="aul-presets">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`aul-preset${preset === p.key ? ' active' : ''}`}
            onClick={() => goPreset(p.key)}
          >
            {t(p.label)}
          </button>
        ))}
        {preset === 'actions' && (
          <div className="aul-login-toggle" role="group" aria-label={t('audit.includeLogins')}>
            <button
              type="button"
              className={!excludeLogin ? '' : 'active'}
              onClick={() => setActionsIncludeLogin(false)}
            >
              {t('audit.withoutLogin')}
            </button>
            <button
              type="button"
              className={!excludeLogin ? 'active' : ''}
              onClick={() => setActionsIncludeLogin(true)}
            >
              {t('audit.withLogin')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className={partialError ? 'aul-warn' : 'aul-error'}>
          <i className="ti ti-alert-circle" style={{ fontSize: 16 }} />
          {error}
        </div>
      )}

      <div className="aul-toolbar">
        <div className="aul-srch">
          <i className="ti ti-search" />
          <input
            id="admin-page-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); bumpPage(); }}
            placeholder={t('audit.searchPlaceholder')}
          />
        </div>
        <button type="button" className="aul-btn" onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}>
          <i className={`ti ti-sort-${sortOrder === 'desc' ? 'descending' : 'ascending'}`} />
          {sortOrder === 'desc' ? t('audit.sortDesc') : t('audit.sortAsc')}
        </button>
        <button type="button" className="aul-btn" onClick={resetFilters} disabled={activeFilterCount === 0}>
          <i className="ti ti-filter-off" /> {t('common.reset')}
        </button>
        <button type="button" className="aul-btn" onClick={handleExportCsv} disabled={filtered.length === 0}>
          <i className="ti ti-file-spreadsheet" /> CSV
        </button>
        <button type="button" className="aul-btn" onClick={handleExportPdf} disabled={filtered.length === 0}>
          <i className="ti ti-file-type-pdf" /> PDF
        </button>
        <button type="button" className="aul-btn primary" onClick={fetchAll}>
          <i className="ti ti-refresh" /> {t('qualityHistory.refresh')}
        </button>
      </div>

      <div className="aul-filters">
        <select
          className="aul-sel"
          value={filterSource}
          onChange={(e) => { setFilterSource(e.target.value as SourceKey); setFilterAction(''); bumpPage(); }}
        >
          <option value="">{t('audit.allSources')}</option>
          <option value="iam">{t('audit.sourceAccounts')}</option>
          <option value="workflow">{t('audit.workflow')}</option>
        </select>
        <select
          className="aul-sel"
          value={filterModule}
          onChange={(e) => { setFilterModule(e.target.value); setFilterAction(''); bumpPage(); }}
        >
          <option value="">{t('audit.allModules')}</option>
          {moduleOptions.map((key) => (
            <option key={key} value={key}>{moduleMeta(key).label}</option>
          ))}
        </select>
        <select
          className="aul-sel"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); bumpPage(); }}
        >
          <option value="">{t('audit.allActions')}</option>
          {actionOptions.map((key) => (
            <option key={key} value={key}>{actionMeta(key).label}</option>
          ))}
        </select>
        <select
          className="aul-sel"
          value={filterActor}
          onChange={(e) => { setFilterActor(e.target.value); bumpPage(); }}
          title={t('audit.actorHint')}
        >
          <option value="">{t('audit.allActors')}</option>
          {actorOptions.map((name) => (
            <option key={name} value={name}>{actorFilterLabel(name)}</option>
          ))}
        </select>
        <select
          className="aul-sel"
          value={filterSeverity}
          onChange={(e) => { setFilterSeverity(e.target.value as SeverityKey); bumpPage(); }}
        >
          <option value="">{t('audit.allSeverities')}</option>
          <option value="security">{t('audit.kpi.security.label')}</option>
          <option value="mutation">{t('audit.kpi.mutations.label')}</option>
          <option value="assignment">{t('audit.kpi.assign.label')}</option>
          <option value="activity">{t('audit.activity')}</option>
        </select>
        <select
          className="aul-sel"
          value={filterDept}
          onChange={(e) => { setFilterDept(e.target.value); bumpPage(); }}
          disabled={deptOptions.length === 0}
        >
          <option value="">{t('audit.allDepartments')}</option>
          {deptOptions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input
          type="date"
          className="aul-date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => { setDateFrom(e.target.value); bumpPage(); }}
          title={t('qualityHistory.from')}
        />
        <input
          type="date"
          className="aul-date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => { setDateTo(e.target.value); bumpPage(); }}
          title={t('qualityHistory.to')}
        />
      </div>

      <p className="aul-chip">
        {t('audit.results', { count: filtered.length })}
        {activeFilterCount > 0 ? ` · ${t('audit.filters', { count: activeFilterCount })}` : ''}
        {excludeLogin ? ` · ${t('audit.loginsExcluded')}` : ''}
        {' · '}
        {t('audit.actorHint')}
      </p>

      <div className="aul-kpis">
        {metrics.map((k) => (
          <div key={k.key} className="aul-kpi" style={{ borderLeft: `3px solid ${k.color}` }}>
            <div className="aul-kpi-val">{k.value}</div>
            <p className="aul-kpi-lbl">{t(`audit.kpi.${k.key}.label`)}</p>
            <p className="aul-kpi-hint">{t(`audit.kpi.${k.key}.hint`)}</p>
          </div>
        ))}
      </div>

      <div className="aul-card">
        {loading ? (
          <div style={{ padding: '8px 0' }}>
            {[...Array(8)].map((_, i) => <div key={i} className="aul-sk" />)}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="aul-empty">
            <i className="ti ti-clipboard-off" />
            {t('audit.empty')}
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>{t('audit.colDate')}</th>
                  <th>{t('audit.colModule')}</th>
                  <th>{t('audit.colAction')}</th>
                  <th>{t('audit.colActor')}</th>
                  <th>{t('audit.colTarget')}</th>
                  <th>{t('audit.colDetail')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((ev) => {
                  const am = actionMeta(ev.action);
                  const mm = moduleMeta(ev.module);
                  return (
                    <tr key={ev.id}>
                      <td style={{ color: '#64748b', fontSize: 11 }}>{formatDate(ev.timestamp)}</td>
                      <td>
                        <span className="aul-pill" style={{ background: mm.bg, color: mm.color }}>
                          <i className={`ti ${mm.icon}`} />
                          {mm.label}
                        </span>
                      </td>
                      <td>
                        <span className="aul-pill" style={{ background: am.bg, color: am.color }}>
                          <i className={`ti ${am.icon}`} />
                          {am.label}
                        </span>
                      </td>
                      <td title={ev.actor === ACTOR_SYSTEM
                        ? t('audit.automatic')
                        : ev.actor === ACTOR_UNKNOWN
                          ? t('audit.unresolved')
                          : ev.actor}
                      >
                        <span className="aul-email" style={{
                          color: NON_HUMAN_ACTORS.has(ev.actor) ? '#64748b' : '#0d1340',
                          fontWeight: 600,
                          fontStyle: NON_HUMAN_ACTORS.has(ev.actor) ? 'italic' : 'normal',
                        }}>
                          {actorDisplay(ev.actor)}
                        </span>
                      </td>
                      <td title={ev.target}><span className="aul-email">{ev.target}</span></td>
                      <td title={ev.detail}><span className="aul-detail">{ev.detail}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="aul-pagination">
              <div className="aul-pg-info">
                {t('audit.events', { count: filtered.length })}
                {' '}— {t('qualityHistory.pageOf', { page: safePage, count: totalPages })}
              </div>
              <div className="aul-pg-btns">
                <button type="button" className="aul-pg-btn" disabled={safePage === 1} onClick={() => setPage(1)}>
                  <i className="ti ti-chevrons-left" />
                </button>
                <button type="button" className="aul-pg-btn" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <i className="ti ti-chevron-left" />
                </button>
                {[...Array(Math.min(5, totalPages))].map((_, i) => {
                  const p = Math.max(1, Math.min(safePage - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`aul-pg-btn${p === safePage ? ' active' : ''}`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  );
                })}
                <button type="button" className="aul-pg-btn" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <i className="ti ti-chevron-right" />
                </button>
                <button type="button" className="aul-pg-btn" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>
                  <i className="ti ti-chevrons-right" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
