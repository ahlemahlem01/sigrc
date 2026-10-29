import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  getPlanActionAssignmentHistory,
  getPlanActionHistory,
  getUsersForAssignment,
  PlanActionAssignmentHistoryItem,
} from '../services/actionPlanService';
import { AUTH_API_URL as AUTH_API } from '../config/apiEnv';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../i18n';

type TabKey = 'assignments' | 'progress';

type ProgressItem = {
  id: string;
  changedBy: string;
  oldProgress: number;
  newProgress: number;
  note?: string;
  oldDescription?: string | null;
  newDescription?: string | null;
  createdAt: string;
};

type ProgressHistoryRaw = {
  id?: string;
  Id?: string;
  changedBy?: string;
  ChangedBy?: string;
  oldProgress?: number;
  OldProgress?: number;
  newProgress?: number;
  NewProgress?: number;
  note?: string;
  Note?: string;
  oldDescription?: string | null;
  OldDescription?: string | null;
  newDescription?: string | null;
  NewDescription?: string | null;
  createdAt?: string;
  CreatedAt?: string;
};

export type NameLookup = Record<string, string>;

interface PlanActionHistoryModalProps {
  token: string;
  planActionId: string;
  actionTitle?: string;
  /** Optional id -> display name map (employees). */
  nameById?: NameLookup;
  onClose: () => void;
  /** Default tab when opening. */
  initialTab?: TabKey;
}

/** i18n keys */
const ACTION_TYPE_LABEL: Record<string, string> = {
  assigned: 'actionHistory.assigned',
  unassigned: 'actionHistory.unassigned',
  reassigned: 'actionHistory.reassigned',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id?: string | null) {
  if (!id) return '—';
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function displayNameFromUser(u: any): string {
  return (
    String(u?.fullName ?? u?.FullName ?? '').trim() ||
    `${u?.firstName ?? u?.FirstName ?? ''} ${u?.lastName ?? u?.LastName ?? ''}`.trim() ||
    String(u?.userName ?? u?.UserName ?? '').trim() ||
    String(u?.email ?? u?.Email ?? '').trim() ||
    ''
  );
}

function lookupName(id: string | null | undefined, names: NameLookup): string | undefined {
  if (!id) return undefined;
  if (names[id]) return names[id];
  const lower = id.toLowerCase();
  const hit = Object.entries(names).find(([k]) => k.toLowerCase() === lower);
  return hit?.[1];
}

function resolveName(
  id: string | null | undefined,
  explicit: string | null | undefined,
  names: NameLookup
) {
  if (explicit && explicit.trim() && !/^[0-9a-f-]{8,}$/i.test(explicit.trim())) {
    return explicit.trim();
  }
  const fromMap = lookupName(id, names);
  if (fromMap) return fromMap;
  if (explicit && explicit.trim()) return explicit.trim();
  if (id) return shortId(id);
  return i18n.t('claimDetail.unassigned');
}

function collectIds(
  assignments: PlanActionAssignmentHistoryItem[],
  progress: ProgressItem[]
): string[] {
  const ids = new Set<string>();
  const add = (v?: string | null) => {
    const s = String(v ?? '').trim();
    if (s) ids.add(s);
  };
  for (const h of assignments) {
    add(h.changedBy);
    add(h.createdBy);
    add(h.oldAssignedToId);
    add(h.newAssignedToId);
  }
  for (const h of progress) add(h.changedBy);
  return Array.from(ids);
}

async function buildNameMap(
  token: string,
  ids: string[],
  initial?: NameLookup
): Promise<NameLookup> {
  const map: NameLookup = { ...(initial || {}) };

  const put = (id: string, name: string) => {
    if (!id || !name) return;
    map[id] = name;
    map[id.toLowerCase()] = name;
  };

  Object.entries(initial || {}).forEach(([k, v]) => put(k, v));

  // Admin directory (may 403 for employees — ignore)
  try {
    const res = await getUsersForAssignment(token);
    const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as any) : [];
    for (const u of list) {
      const uid = String(u?.id ?? u?.Id ?? '').trim();
      const name = displayNameFromUser(u);
      if (uid && name) put(uid, name);
    }
  } catch {
    /* employees cannot list admin users */
  }

  const missing = ids.filter((id) => !lookupName(id, map));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await axios.get(`${AUTH_API}/api/users/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const name = displayNameFromUser(res.data);
        if (name) put(id, name);
      } catch {
        /* keep short id fallback */
      }
    })
  );

  return map;
}

export const PlanActionHistoryModal: React.FC<PlanActionHistoryModalProps> = ({
  token,
  planActionId,
  actionTitle,
  nameById,
  onClose,
  initialTab = 'assignments',
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<PlanActionAssignmentHistoryItem[]>([]);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [names, setNames] = useState<NameLookup>(nameById || {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [a, p] = await Promise.all([
          getPlanActionAssignmentHistory(token, planActionId),
          getPlanActionHistory(token, planActionId),
        ]);
        if (cancelled) return;

        const progressItems = (p || []).map((h: ProgressHistoryRaw) => ({
          id: String(h.id ?? h.Id ?? ''),
          changedBy: String(h.changedBy ?? h.ChangedBy ?? ''),
          oldProgress: Number(h.oldProgress ?? h.OldProgress ?? 0),
          newProgress: Number(h.newProgress ?? h.NewProgress ?? 0),
          note: h.note ?? h.Note,
          oldDescription: h.oldDescription ?? h.OldDescription ?? null,
          newDescription: h.newDescription ?? h.NewDescription ?? null,
          createdAt: String(h.createdAt ?? h.CreatedAt ?? ''),
        }));

        setAssignments(a);
        setProgress(progressItems);
        // nobody was assigned or removed (the usual case): open on the progress changes instead of an empty tab
        if (initialTab === 'assignments' && a.length === 0 && progressItems.length > 0) setTab('progress');

        const ids = collectIds(a, progressItems);
        const resolved = await buildNameMap(token, ids, nameById);
        if (!cancelled) setNames(resolved);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(i18n.t('qualityHistory.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, planActionId, nameById, initialTab]);

  const title = useMemo(
    () => (actionTitle ? t('actionHistory.titleFor', { title: actionTitle }) : t('actionHistory.title')),
    [actionTitle, t]
  );

  return (
    <div className="pah-overlay" onClick={onClose} role="presentation">
      <div className="pah-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pah-header">
          <div>
            <div className="pah-title">{title}</div>
            <div className="pah-sub">{t('actionHistory.subtitle')}</div>
          </div>
          <button type="button" className="pah-close" onClick={onClose} aria-label={t('fiveWhy.close')}>
            ×
          </button>
        </div>

        <div className="pah-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`pah-tab${tab === 'assignments' ? ' active' : ''}`}
            aria-selected={tab === 'assignments'}
            onClick={() => setTab('assignments')}
          >
            {t('actionHistory.assignments')}
            <span className="pah-count">{assignments.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`pah-tab${tab === 'progress' ? ' active' : ''}`}
            aria-selected={tab === 'progress'}
            onClick={() => setTab('progress')}
          >
            {t('actionHistory.progress')}
            <span className="pah-count">{progress.length}</span>
          </button>
        </div>

        <div className="pah-body">
          {loading && <div className="pah-empty">{t('common.loading')}</div>}
          {!loading && error && <div className="pah-error">{error}</div>}

          {!loading && !error && tab === 'assignments' && (
            assignments.length === 0 ? (
              <div className="pah-empty">{t('actionHistory.noAssignments')}<br /><span style={{ fontSize: 12 }}>{t('actionHistory.assignmentsHint')}</span></div>
            ) : (
              <ul className="pah-list">
                {assignments.map((h) => {
                  const typeLabel = ACTION_TYPE_LABEL[h.actionType] ? t(ACTION_TYPE_LABEL[h.actionType]) : h.actionType || t('actionHistory.change');
                  const from = resolveName(h.oldAssignedToId, h.oldAssignedToName, names);
                  const to = resolveName(h.newAssignedToId, h.newAssignedToName, names);
                  const actor = resolveName(h.changedBy || h.createdBy, h.changedByName, names);
                  return (
                    <li key={h.id || `${h.createdAt}-${h.actionType}`} className="pah-item">
                      <div className="pah-item-top">
                        <span className={`pah-pill pah-${h.actionType || 'other'}`}>{typeLabel}</span>
                        <span className="pah-date">{fmtDate(h.createdAt)}</span>
                      </div>
                      <div className="pah-change">
                        {h.actionType === 'assigned' && (
                          <>{t('actionHistory.assignedTo')} <strong>{to}</strong></>
                        )}
                        {h.actionType === 'unassigned' && (
                          <>{t('actionHistory.unassignedFrom')} <strong>{from}</strong></>
                        )}
                        {h.actionType === 'reassigned' && (
                          <>
                            <span className="pah-from">{from}</span>
                            <span className="pah-arrow">→</span>
                            <span className="pah-to">{to}</span>
                          </>
                        )}
                        {!['assigned', 'unassigned', 'reassigned'].includes(h.actionType) && (
                          <>
                            <span className="pah-from">{from}</span>
                            <span className="pah-arrow">→</span>
                            <span className="pah-to">{to}</span>
                          </>
                        )}
                      </div>
                      <div className="pah-meta">{t('actionHistory.by', { name: actor || '—' })}</div>
                      {h.note && <div className="pah-note">{h.note}</div>}
                    </li>
                  );
                })}
              </ul>
            )
          )}

          {!loading && !error && tab === 'progress' && (
            progress.length === 0 ? (
              <div className="pah-empty">{t('actionHistory.noProgress')}</div>
            ) : (
              <ul className="pah-list">
                {progress.map((h, i) => {
                  const changed = h.oldProgress !== h.newProgress;
                  const isDescription = h.newDescription != null;
                  const kind = isDescription ? 'description' : /^[ée]ch[ée]ance prolong/i.test(h.note ?? '') ? 'deadline' : /^preuve/i.test(h.note ?? '') ? 'proof' : /^avertissement/i.test(h.note ?? '') ? 'warning' : 'progress';
                  return (
                    <li key={h.id || `${h.createdAt}-${i}`} className="pah-item">
                      <div className="pah-item-top">
                        <span className={`pah-pill ${kind === 'progress' ? 'pah-progress' : 'pah-' + kind}`}>{t(`actionHistory.kind.${kind}`)}</span>
                      </div>
                      {changed && (
                        <div className="pah-change">
                          <span className="pah-from" title={t('actionHistory.oldValue')}>{h.oldProgress}%</span>
                          <span className="pah-arrow">→</span>
                          <span className="pah-to">{h.newProgress}%</span>
                        </div>
                      )}
                      {isDescription ? (
                        <div className="pah-desc">
                          <div className="pah-desc-old"><span>{t('actionHistory.descriptionBefore')}</span>{h.oldDescription || t('actionHistory.descriptionEmpty')}</div>
                          <div className="pah-desc-new"><span>{t('actionHistory.descriptionAfter')}</span>{h.newDescription}</div>
                        </div>
                      ) : (
                        h.note && <div className={changed ? 'pah-note' : 'pah-change'}>{h.note}</div>
                      )}
                      <div className="pah-meta">
                        {fmtDate(h.createdAt)} · {t('actionHistory.by', { name: resolveName(h.changedBy, null, names) })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </div>

      <style>{`
        .pah-desc { display: grid; gap: 6px; margin-top: 4px; font-size: 12.5px; line-height: 1.45; }
        .pah-desc span { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 2px; }
        .pah-desc-old { background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; border-radius: 8px; padding: 7px 9px; white-space: pre-wrap; }
        .pah-desc-new { background: #f0fdf4; border: 1px solid #bbf7d0; color: #14532d; border-radius: 8px; padding: 7px 9px; white-space: pre-wrap; }
        .pah-description { background: #eef2ff; color: #3730a3; }
        .pah-overlay {
          position: fixed; inset: 0; z-index: 80;
          background: rgba(15, 23, 42, 0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .pah-modal {
          width: min(520px, 100%);
          max-height: min(80vh, 640px);
          background: #fff;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .pah-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 12px; padding: 16px 18px 10px;
          border-bottom: 1px solid #f1f5f9;
        }
        .pah-title { font-size: 16px; font-weight: 700; color: #0f172a; }
        .pah-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
        .pah-close {
          border: none; background: #f8fafc; width: 32px; height: 32px;
          border-radius: 8px; font-size: 20px; line-height: 1; cursor: pointer; color: #475569;
        }
        .pah-close:hover { background: #e2e8f0; }
        .pah-tabs {
          display: flex; gap: 6px; padding: 10px 14px;
          border-bottom: 1px solid #f1f5f9; background: #f8fafc;
        }
        .pah-tab {
          border: 1px solid transparent; background: transparent;
          padding: 7px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;
          color: #64748b; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        }
        .pah-tab.active {
          background: #fff; color: #0f172a; border-color: #e2e8f0;
          box-shadow: 0 1px 2px rgba(15,23,42,.06);
        }
        .pah-count {
          min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
          background: #e2e8f0; color: #334155; font-size: 10px;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .pah-tab.active .pah-count { background: #dbeafe; color: #1d4ed8; }
        .pah-body { padding: 8px 14px 16px; overflow: auto; }
        .pah-list { list-style: none; margin: 0; padding: 0; }
        .pah-item {
          padding: 12px 4px; border-bottom: 1px solid #f1f5f9;
        }
        .pah-item:last-child { border-bottom: none; }
        .pah-item-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
        .pah-date { font-size: 11px; color: #94a3b8; }
        .pah-pill {
          font-size: 10px; font-weight: 700; letter-spacing: .02em;
          padding: 3px 8px; border-radius: 999px; text-transform: uppercase;
        }
        .pah-assigned { background: #dcfce7; color: #166534; }
        .pah-unassigned { background: #fee2e2; color: #991b1b; }
        .pah-reassigned { background: #ede9fe; color: #5b21b6; }
        .pah-progress, .pah-other { background: #e0e7ff; color: #3730a3; }
        .pah-proof { background: #ccfbf1; color: #0f766e; }
        .pah-warning { background: #fef3c7; color: #92400e; }
        .pah-change { font-size: 14px; color: #0f172a; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .pah-from { color: #94a3b8; text-decoration: line-through; }
        .pah-to { color: #166534; font-weight: 700; }
        .pah-arrow { color: #94a3b8; }
        .pah-meta { margin-top: 4px; font-size: 12px; color: #64748b; }
        .pah-note { margin-top: 4px; font-size: 12px; color: #64748b; font-style: italic; }
        .pah-empty, .pah-error {
          padding: 28px 10px; text-align: center; font-size: 13px; color: #64748b;
        }
        .pah-error { color: #b91c1c; }
      `}</style>
    </div>
  );
};

export default PlanActionHistoryModal;
