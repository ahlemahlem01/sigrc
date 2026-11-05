import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import ReportEditDialog from './reports/ReportEditDialog';
import ReportDraftDialog from './reports/ReportDraftDialog';
import { capaBtnPrimary, capaBtnSecondary } from './capa/CapaAdminUi';

type SavedRow = {
  id: string; kind: string; title: string; itemCount: number; createdByName?: string | null; createdAt: string;
  version?: number; updatedAt?: string | null; updatedByName?: string | null; isArchived?: boolean; archivedAt?: string | null;
};

type Props = {
  /** claims | capa-actions | team */
  kind: string;
  /** what is on screen now, or null when no report has been generated yet */
  snapshot: () => { criteria: unknown; result: unknown; itemCount: number } | null;
  hasReport: boolean;
  defaultTitle: string;
  onOpen: (criteria: any, result: any) => void;
  /** change it to reload the list (a scheduled report has just been generated) */
  refreshKey?: number;
};

type State = 'active' | 'archived' | 'all';

const inputCls = 'px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white';

/**
 * The reports kept on the server. The report on screen can be corrected before it is saved, then saved; a saved one can be
 * reopened, corrected again (each correction is a version) and archived. The history is paged and filterable, and the archived
 * reports are one toggle away: nothing is ever deleted, an archived report can be restored.
 */
export default function SavedReportsBar({ kind, snapshot, hasReport, defaultTitle, onOpen, refreshKey = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [state, setState] = useState<State>('active');
  const [q, setQ] = useState('');
  const [author, setAuthor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);

  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<SavedRow | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<{ criteria: unknown; result: unknown } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get<{ items: SavedRow[]; total: number }>(`${ACTION_PLAN_API_URL}/saved-reports/search`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          kind, state, page, pageSize,
          q: q.trim() || undefined, author: author.trim() || undefined, from: from || undefined, to: to || undefined,
          edited: editedOnly ? true : undefined,
        },
      });
      setRows(Array.isArray(res.data?.items) ? res.data.items : []);
      setTotal(res.data?.total ?? 0);
    } catch {
      setRows([]);
      setTotal(0);
    }
  }, [accessToken, kind, state, page, pageSize, q, author, from, to, editedOnly]);

  // typing in a filter waits a moment, a click on a toggle or a page does not need to
  useEffect(() => {
    const id = window.setTimeout(() => { void load(); }, 250);
    return () => window.clearTimeout(id);
  }, [load, refreshKey]);

  const changeFilter = (apply: () => void) => { apply(); setPage(1); };
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const filtered = !!(q || author || from || to || editedOnly);

  const save = async (thenEdit = false) => {
    const snap = snapshot();
    if (!snap || !title.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const created = await axios.post<{ id: string }>(`${ACTION_PLAN_API_URL}/saved-reports`, {
        kind, title: title.trim(), criteriaJson: JSON.stringify(snap.criteria), resultJson: JSON.stringify(snap.result), itemCount: snap.itemCount,
      }, { headers });
      setSaving(false);
      setTitle('');
      setNotice({ ok: true, text: t('savedReports.saved') });
      setState('active');
      setPage(1);
      await load();
      if (thenEdit && created.data?.id) setEditing(created.data.id);
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || t('savedReports.failed') });
    } finally {
      setBusy(false);
    }
  };

  const open = async (row: SavedRow) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await axios.get(`${ACTION_PLAN_API_URL}/saved-reports/${row.id}`, { headers });
      onOpen(JSON.parse(res.data.criteriaJson), JSON.parse(res.data.resultJson));
    } catch {
      setNotice({ ok: false, text: t('savedReports.failedOpen') });
    } finally {
      setBusy(false);
    }
  };

  const archive = async (row: SavedRow) => {
    setBusy(true);
    try {
      await axios.post(`${ACTION_PLAN_API_URL}/saved-reports/${row.id}/archive`, {}, { headers });
      await load();
    } catch {
      setNotice({ ok: false, text: t('savedReports.failed') });
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  const restore = async (row: SavedRow) => {
    setBusy(true);
    try {
      await axios.post(`${ACTION_PLAN_API_URL}/saved-reports/${row.id}/unarchive`, {}, { headers });
      setNotice({ ok: true, text: t('reportHistory.restored', { title: row.title }) });
      await load();
    } catch {
      setNotice({ ok: false, text: t('savedReports.failed') });
    } finally {
      setBusy(false);
    }
  };

  const startDraft = () => {
    const snap = snapshot();
    if (snap) setDrafting({ criteria: snap.criteria, result: snap.result });
  };

  const resetFilters = () => { setQ(''); setAuthor(''); setFrom(''); setTo(''); setEditedOnly(false); setPage(1); };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
      {editing && <ReportEditDialog reportId={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />}
      {drafting && (
        <ReportDraftDialog
          result={drafting.result}
          onClose={() => setDrafting(null)}
          onApply={(edited) => { onOpen(drafting.criteria, edited); setDrafting(null); setNotice({ ok: true, text: t('reportHistory.applied') }); }}
        />
      )}
      {ask && (
        <ConfirmDialog
          title={t('savedReports.archiveTitle')}
          text={t('savedReports.archiveText', { title: ask.title })}
          confirmLabel={t('adminLists.archive')}
          danger
          busy={busy}
          onConfirm={() => void archive(ask)}
          onCancel={() => setAsk(null)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 m-0">{t('savedReports.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-0">{t('reportHistory.hint')}</p>
        </div>
        {!saving && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${capaBtnSecondary} disabled:opacity-40`} disabled={!hasReport} onClick={startDraft}>
              {t('reportHistory.editDraft')}
            </button>
            <button type="button" className={`${capaBtnSecondary} disabled:opacity-40`} disabled={!hasReport} onClick={() => { setSaving(true); setTitle(defaultTitle); setNotice(null); }}>
              {t('savedReports.saveCurrent')}
            </button>
          </div>
        )}
      </div>

      {saving && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t('savedReports.titlePh')} className={`flex-1 min-w-[220px] ${inputCls}`} autoFocus />
          <button type="button" className={capaBtnPrimary} disabled={busy || !title.trim()} onClick={() => void save()}>{t('savedReports.save')}</button>
          <button type="button" className={capaBtnSecondary} disabled={busy || !title.trim()} onClick={() => void save(true)}>{t('reportEdit.saveAndEdit')}</button>
          <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => setSaving(false)}>{t('common.cancel')}</button>
        </div>
      )}

      {notice && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200" role="group" aria-label={t('reportHistory.stateLabel')}>
          {(['active', 'archived', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={state === s}
              onClick={() => changeFilter(() => setState(s))}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${state === s ? 'bg-white shadow-sm text-[#000168]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t(`reportHistory.state.${s}`)}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => changeFilter(() => setQ(e.target.value))} placeholder={t('reportHistory.searchPh')} className={`min-w-[160px] flex-1 ${inputCls}`} />
        <input value={author} onChange={(e) => changeFilter(() => setAuthor(e.target.value))} placeholder={t('reportHistory.authorPh')} className={`w-40 ${inputCls}`} />
        <label className="flex items-center gap-1 text-xs text-slate-500">{t('reportHistory.from')}
          <input type="date" value={from} onChange={(e) => changeFilter(() => setFrom(e.target.value))} className={inputCls} />
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500">{t('reportHistory.to')}
          <input type="date" value={to} onChange={(e) => changeFilter(() => setTo(e.target.value))} className={inputCls} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={editedOnly} onChange={(e) => changeFilter(() => setEditedOnly(e.target.checked))} />
          {t('reportHistory.editedOnly')}
        </label>
        {filtered && <button type="button" className="text-xs font-semibold text-[#000168] hover:underline" onClick={resetFilters}>{t('reportHistory.resetFilters')}</button>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 m-0">{filtered || state !== 'active' ? t('reportHistory.noneFilter') : t('savedReports.none')}</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  {r.title}
                  {(r.version ?? 1) > 1 && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 align-middle">{t('reportHistory.versionBadge', { n: r.version })}</span>}
                  {r.isArchived && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 align-middle">{t('reportHistory.archivedBadge')}</span>}
                </div>
                <div className="text-[11px] text-slate-500">
                  {new Date(r.createdAt).toLocaleString(i18n.language)}{` · ${r.createdByName || t('savedReports.auto')}`} · {t('savedReports.items', { count: r.itemCount })}
                  {(r.version ?? 1) > 1 && ` · ${t('reportEdit.edited', { n: r.version, date: r.updatedAt ? new Date(r.updatedAt).toLocaleString(i18n.language) : '' })}`}
                  {r.isArchived && r.archivedAt && ` · ${t('reportHistory.archivedOn', { date: new Date(r.archivedAt).toLocaleDateString(i18n.language) })}`}
                </div>
              </div>
              <button type="button" className={capaBtnPrimary} disabled={busy} onClick={() => void open(r)}>{t('qualityHistory.open')}</button>
              {r.isArchived ? (
                <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => void restore(r)}>{t('reportHistory.restore')}</button>
              ) : (
                <>
                  <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => setEditing(r.id)}>{t('reportEdit.edit')}</button>
                  <button type="button" className={`${capaBtnSecondary} !text-red-600`} disabled={busy} onClick={() => setAsk(r)}>{t('adminLists.archive')}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span>{t('reportHistory.count', { count: total })}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">{t('reportHistory.perPage')}
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={inputCls}>
                {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button type="button" className={capaBtnSecondary} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('reportHistory.prev')}</button>
            <span>{t('reportHistory.pageOf', { page, pages: lastPage })}</span>
            <button type="button" className={capaBtnSecondary} disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>{t('reportHistory.next')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
