import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';
import { capaBtnPrimary, capaBtnSecondary } from '../capa/CapaAdminUi';
import JsonValueEditor from './JsonValueEditor';

type VersionRow = { versionNumber: number; title: string; itemCount: number; savedAt: string; savedByName?: string | null; note?: string | null; current: boolean };

type Props = {
  reportId: string;
  onClose: () => void;
  /** called after a successful edit so that the list can be reloaded */
  onSaved: () => void;
};

/** Edits a saved report (title and every figure of it). The previous content is kept: the history below lists the versions. */
export default function ReportEditDialog({ reportId, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const base = `${ACTION_PLAN_API_URL}/saved-reports/${reportId}`;

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [itemCount, setItemCount] = useState(0);
  const [result, setResult] = useState<unknown>({});
  const [version, setVersion] = useState(1);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [report, history] = await Promise.all([
        axios.get(base, { headers: { Authorization: `Bearer ${accessToken}` } }),
        axios.get<VersionRow[]>(`${base}/versions`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      setTitle(report.data.title);
      setItemCount(report.data.itemCount);
      setVersion(report.data.version ?? 1);
      setResult(JSON.parse(report.data.resultJson));
      setVersions(Array.isArray(history.data) ? history.data : []);
      setViewing(null);
    } catch {
      setNotice({ ok: false, text: t('savedReports.failedOpen') });
    } finally {
      setBusy(false);
    }
  }, [base, accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await axios.put(base, { title: title.trim(), resultJson: JSON.stringify(result), itemCount, note: note.trim() || null }, { headers });
      setNote('');
      setNotice({ ok: true, text: t('reportEdit.saved', { n: res.data.version }) });
      onSaved();
      await load();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || t('reportEdit.failed') });
      setBusy(false);
    }
  };

  /** Reads an earlier version into the editor (nothing is saved until the person saves, which then creates a new version). */
  const takeVersion = async (row: VersionRow) => {
    if (row.current) { await load(); return; }
    setBusy(true);
    try {
      const res = await axios.get(`${base}/versions/${row.versionNumber}`, { headers });
      setTitle(res.data.title);
      setItemCount(res.data.itemCount);
      setResult(JSON.parse(res.data.resultJson));
      setViewing(row.versionNumber);
    } catch {
      setNotice({ ok: false, text: t('savedReports.failedOpen') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800 m-0">{t('reportEdit.title')}</h3>
          <p className="text-xs text-slate-500 mt-1 mb-0">{t('reportEdit.keepsHistory')}</p>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {viewing != null && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs border bg-amber-50 border-amber-200 text-amber-800">
              {t('reportEdit.viewing', { n: viewing })}
            </div>
          )}
          <label className="block mb-3">
            <span className="block text-xs font-semibold text-slate-600 mb-1">{t('reportEdit.titleLabel')}</span>
            <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" />
          </label>
          <label className="block mb-3 max-w-[200px]">
            <span className="block text-xs font-semibold text-slate-600 mb-1">{t('reportEdit.itemCount')}</span>
            <input type="number" min={0} value={itemCount} onChange={(e) => setItemCount(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" />
          </label>

          <div className="text-xs font-semibold text-slate-600 mb-2">{t('reportEdit.content')}</div>
          <div className="rounded-xl border border-slate-100 p-3 mb-4 bg-slate-50/50">
            <JsonValueEditor value={result} onChange={setResult} />
          </div>

          <label className="block mb-4">
            <span className="block text-xs font-semibold text-slate-600 mb-1">{t('reportEdit.note')}</span>
            <input value={note} maxLength={1000} placeholder={t('reportEdit.notePh')} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200" />
          </label>

          <div className="text-xs font-semibold text-slate-600 mb-2">{t('reportEdit.history')}</div>
          <ul className="m-0 p-0 list-none divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {versions.map((v) => (
              <li key={v.versionNumber} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {t('reportEdit.versionLabel', { n: v.versionNumber })}{v.current ? ` · ${t('reportEdit.current')}` : ''}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(v.savedAt).toLocaleString(i18n.language)}{v.savedByName ? ` · ${t('reportEdit.by', { name: v.savedByName })}` : ''}{v.note ? ` · ${v.note}` : ''}
                  </div>
                </div>
                {!v.current && (
                  <button type="button" className={capaBtnSecondary} disabled={busy} onClick={() => void takeVersion(v)}>{t('reportEdit.take')}</button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-400 mt-1 mb-0">{t('reportEdit.versionNow', { n: version })}</p>

          {notice && (
            <div className={`mt-3 px-3 py-2 rounded-lg text-xs border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" className={capaBtnSecondary} onClick={onClose}>{t('reportEdit.close')}</button>
          <button type="button" className={capaBtnPrimary} disabled={busy || !title.trim()} onClick={() => void save()}>{t('reportEdit.save')}</button>
        </div>
      </div>
    </div>
  );
}
