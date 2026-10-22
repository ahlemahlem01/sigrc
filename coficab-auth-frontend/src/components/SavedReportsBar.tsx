import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from './ConfirmDialog';
import { capaBtnPrimary, capaBtnSecondary } from './capa/CapaAdminUi';

type SavedRow = { id: string; kind: string; title: string; itemCount: number; createdByName?: string | null; createdAt: string };

type Props = {
  /** claims | capa-actions */
  kind: string;
  /** what is on screen now, or null when no report has been generated yet */
  snapshot: () => { criteria: unknown; result: unknown; itemCount: number } | null;
  hasReport: boolean;
  defaultTitle: string;
  onOpen: (criteria: any, result: any) => void;
  /** change it to reload the list (a scheduled report has just been generated) */
  refreshKey?: number;
};

/** The reports kept on the server: save the one on screen, reopen one as it was, archive one (it is never deleted). */
export default function SavedReportsBar({ kind, snapshot, hasReport, defaultTitle, onOpen, refreshKey = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<SavedRow | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get<SavedRow[]>(`${ACTION_PLAN_API_URL}/saved-reports`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { kind } });
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRows([]);
    }
  }, [accessToken, kind]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const save = async () => {
    const snap = snapshot();
    if (!snap || !title.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await axios.post(`${ACTION_PLAN_API_URL}/saved-reports`, {
        kind, title: title.trim(), criteriaJson: JSON.stringify(snap.criteria), resultJson: JSON.stringify(snap.result), itemCount: snap.itemCount,
      }, { headers });
      setSaving(false);
      setTitle('');
      setNotice({ ok: true, text: t('savedReports.saved') });
      await load();
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
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch {
      setNotice({ ok: false, text: t('savedReports.failed') });
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
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
          <p className="text-xs text-slate-500 mt-0.5 mb-0">{t('savedReports.hint')}</p>
        </div>
        {!saving && (
          <button type="button" className={`${capaBtnSecondary} disabled:opacity-40`} disabled={!hasReport} onClick={() => { setSaving(true); setTitle(defaultTitle); setNotice(null); }}>
            {t('savedReports.saveCurrent')}
          </button>
        )}
      </div>

      {saving && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder={t('savedReports.titlePh')}
            className="flex-1 min-w-[220px] px-3 py-2 text-sm rounded-lg border border-slate-200"
            autoFocus
          />
          <button type="button" className={capaBtnPrimary} disabled={busy || !title.trim()} onClick={() => void save()}>{t('savedReports.save')}</button>
          <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => setSaving(false)}>{t('common.cancel')}</button>
        </div>
      )}

      {notice && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 m-0">{t('savedReports.none')}</p>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-800 truncate">{r.title}</div>
                <div className="text-[11px] text-slate-500">
                  {new Date(r.createdAt).toLocaleString(i18n.language)}{` · ${r.createdByName || t('savedReports.auto')}`} · {t('savedReports.items', { count: r.itemCount })}
                </div>
              </div>
              <button type="button" className={capaBtnPrimary} disabled={busy} onClick={() => void open(r)}>{t('qualityHistory.open')}</button>
              <button type="button" className={`${capaBtnSecondary} !text-red-600`} disabled={busy} onClick={() => setAsk(r)}>{t('adminLists.archive')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
