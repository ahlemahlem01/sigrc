import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../ConfirmDialog';
import { addPlanComment, archivePlanComment, editPlanComment, getPlanComments, PlanComment } from '../../services/actionPlanService';
import { dateLocale } from '../../i18n';

const MAX = 2000;
const POLL_MS = 20000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "2 min ago" for the last day, then the date: a comment thread reads better with relative times. */
function when(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const d = new Date(iso);
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return t('planComments.now');
  if (minutes < 60) return t('planComments.minutesAgo', { count: minutes });
  if (minutes < 60 * 24) return t('planComments.hoursAgo', { count: Math.floor(minutes / 60) });
  return d.toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * The comments of a plan: who said what and when, written by administrators and by the people who work on the plan.
 * Posting notifies the others involved (the bell updates at once). The author can edit; the author or an administrator can remove
 * a comment (it is archived, not erased). The thread refreshes by itself while the page is open.
 */
export default function PlanComments({ token, planId }: { token: string; planId: string }) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<PlanComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [removing, setRemoving] = useState<PlanComment | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      setComments(await getPlanComments(token, planId));
      setError('');
    } catch {
      setError(t('planComments.loadError'));
    }
  }, [token, planId, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !busy) void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load, busy]);

  // a new comment (mine or someone else's) scrolls the thread to the bottom
  useEffect(() => {
    if (comments && comments.length > lastCount.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    lastCount.current = comments?.length ?? 0;
  }, [comments]);

  const fail = (e: unknown) => {
    const message = axios.isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error : undefined;
    setError(message || t('planComments.saveError'));
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await addPlanComment(token, planId, body);
      setComments((old) => [...(old ?? []), created]);
      setText('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await editPlanComment(token, planId, editing.id, editing.text.trim());
      setComments((old) => (old ?? []).map((c) => (c.id === updated.id ? updated : c)));
      setEditing(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await archivePlanComment(token, planId, removing.id);
      setComments((old) => (old ?? []).filter((c) => c.id !== removing.id));
      setRemoving(null);
    } catch (e) {
      fail(e);
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); action(); }
  };

  return (
    <section className="pc-wrap" aria-label={t('planComments.title')}>
      <style>{`
        .pc-wrap { background: #fff; border: 1px solid #e4e8f2; border-radius: 14px; padding: 16px 18px; }
        .pc-head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 10px; }
        .pc-head h2 { margin: 0; font-size: 15px; font-weight: 700; color: #0d1340; }
        .pc-count { font-size: 12px; font-weight: 700; color: #64748b; }
        .pc-list { max-height: 340px; overflow-y: auto; display: grid; gap: 12px; padding: 2px 2px 6px 0; }
        .pc-item { display: grid; grid-template-columns: 34px 1fr; gap: 10px; }
        .pc-avatar { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #fff; background: #64748b; }
        .pc-avatar.admin { background: #000168; }
        .pc-bubble { background: #f6f8fc; border: 1px solid #e8ecf5; border-radius: 12px; padding: 8px 12px; min-width: 0; }
        .pc-item.mine .pc-bubble { background: #eef2ff; border-color: #dbe2ff; }
        .pc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
        .pc-meta strong { color: #0d1340; font-size: 13px; }
        .pc-role { font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: 1px 7px; border-radius: 999px; background: #e0e7ff; color: #3730a3; }
        .pc-body { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: #1e293b; white-space: pre-wrap; overflow-wrap: anywhere; }
        .pc-actions { display: flex; gap: 10px; margin-top: 4px; }
        .pc-link { background: none; border: 0; padding: 0; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer; }
        .pc-link:hover { color: #000168; text-decoration: underline; }
        .pc-link.danger:hover { color: #b91c1c; }
        .pc-edit textarea, .pc-compose textarea { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 11px; font: inherit; font-size: 13.5px; resize: vertical; min-height: 64px; }
        .pc-edit textarea:focus, .pc-compose textarea:focus { outline: 2px solid rgba(0, 1, 104, .18); border-color: #000168; }
        .pc-compose { margin-top: 12px; }
        .pc-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; }
        .pc-hint { font-size: 11px; color: #94a3b8; }
        .pc-btn { background: #000168; color: #fff; border: 0; border-radius: 9px; padding: 7px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .pc-btn:disabled { opacity: .45; cursor: default; }
        .pc-btn.sec { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
        .pc-empty { font-size: 13px; color: #94a3b8; margin: 4px 0 0; }
        .pc-error { font-size: 12px; color: #b91c1c; margin: 8px 0 0; }
        @media (max-width: 520px) { .pc-wrap { padding: 14px; } .pc-item { grid-template-columns: 28px 1fr; } .pc-avatar { width: 28px; height: 28px; font-size: 11px; } }
      `}</style>

      <div className="pc-head">
        <h2>{t('planComments.title')}</h2>
        {comments && comments.length > 0 && <span className="pc-count">{comments.length}</span>}
      </div>

      <div className="pc-list" ref={listRef} aria-live="polite">
        {comments === null && !error && <p className="pc-empty">{t('planComments.loading')}</p>}
        {comments?.length === 0 && <p className="pc-empty">{t('planComments.empty')}</p>}
        {(comments ?? []).map((c) => (
          <div key={c.id} className={`pc-item${c.mine ? ' mine' : ''}`}>
            <div className={`pc-avatar ${c.authorRole}`} aria-hidden>{initials(c.authorName)}</div>
            <div className="pc-bubble">
              <div className="pc-meta">
                <strong>{c.authorName}</strong>
                {c.authorRole === 'admin' && <span className="pc-role">{t('planComments.admin')}</span>}
                <span title={new Date(c.createdAt).toLocaleString(dateLocale())}>{when(c.createdAt, t)}</span>
                {c.editedAt && <span>· {t('planComments.edited')}</span>}
              </div>
              {editing?.id === c.id ? (
                <div className="pc-edit" style={{ marginTop: 6 }}>
                  <textarea value={editing.text} maxLength={MAX} autoFocus
                    onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                    onKeyDown={(e) => onKey(e, () => void saveEdit())} aria-label={t('planComments.edit')} />
                  <div className="pc-foot">
                    <span className="pc-hint">{editing.text.length}/{MAX}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="pc-btn sec" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
                      <button type="button" className="pc-btn" disabled={busy || !editing.text.trim()} onClick={() => void saveEdit()}>{t('common.save')}</button>
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="pc-body">{c.body}</p>
                  {(c.canEdit || c.canDelete) && (
                    <div className="pc-actions">
                      {c.canEdit && <button type="button" className="pc-link" onClick={() => setEditing({ id: c.id, text: c.body })}>{t('planComments.edit')}</button>}
                      {c.canDelete && <button type="button" className="pc-link danger" onClick={() => setRemoving(c)}>{t('planComments.remove')}</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pc-compose">
        <textarea value={text} maxLength={MAX} placeholder={t('planComments.placeholder')} aria-label={t('planComments.placeholder')}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => onKey(e, () => void send())} />
        <div className="pc-foot">
          <span className="pc-hint">{text.length > 0 ? `${text.length}/${MAX} · ` : ''}{t('planComments.shortcut')}</span>
          <button type="button" className="pc-btn" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? t('planComments.sending') : t('planComments.send')}</button>
        </div>
        {error && <p className="pc-error" role="alert">{error}</p>}
      </div>

      {removing && (
        <ConfirmDialog title={t('planComments.removeTitle')} text={t('planComments.removeText')} confirmLabel={t('planComments.remove')} danger busy={busy}
          onConfirm={() => void remove()} onCancel={() => setRemoving(null)} />
      )}
    </section>
  );
}
