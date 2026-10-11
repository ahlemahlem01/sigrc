import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePreferences, ExportFormat, ImportFormat } from '../../context/PreferencesContext';
import { downloadServerTemplate, ImportColumnSpec } from '../../utils/dataExchange';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';

/** title = i18n key */
const MODELS = [
  { entity: 'plans', title: 'nav.actionPlans', url: `${ACTION_PLAN_API_URL}/import-templates/plans` },
  { entity: 'claims', title: 'adminDashboard.claims.title', url: `${ACTION_PLAN_API_URL}/import-templates/claims` },
  { entity: 'employees', title: 'nav.employees', url: `${ACTION_PLAN_API_URL}/import-templates/employees` },
] as const;

export default function PreferencesPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const prefs = usePreferences();
  const [note, setNote] = useState('');
  const [columns, setColumns] = useState<Record<string, ImportColumnSpec[]>>({});

  const update = async (patch: { theme?: 'light' | 'dark'; exportFormat?: ExportFormat; importFormat?: ImportFormat }) => {
    await prefs.save(patch);
    setNote(accessToken ? t('preferences.saved') : t('preferences.signInToKeep'));
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancel = false;
    MODELS.forEach((model) => {
      fetch(`${model.url}/columns`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          if (!cancel && Array.isArray(data.columns)) {
            setColumns((current) => ({ ...current, [model.entity]: data.columns }));
          }
        })
        .catch(() => undefined);
    });
    return () => { cancel = true; };
  }, [accessToken]);

  const downloadModel = async (url: string, title: string) => {
    if (!accessToken) {
      setNote(t('preferences.signInToDownload'));
      return;
    }
    try {
      await downloadServerTemplate(url, accessToken, prefs.importFormat);
      setNote(t('preferences.templateDownloaded', { title, format: prefs.importFormat === 'excel' ? 'Excel' : 'CSV' }));
    } catch (error) {
      setNote(error instanceof Error ? error.message : t('preferences.templateUnavailable'));
    }
  };

  return (
    <div className="text-slate-900 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#000168] mb-1">{t('admin.settings')}</p>
      <h1 className="text-2xl font-bold text-[#000168] mb-5">{t('adminNav.preferences')}</h1>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{t('preferences.appearance')}</h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">{t('preferences.appearanceHelp')}</p>
        <button
          type="button"
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50"
          onClick={() => void update({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
        >
          {prefs.theme === 'dark' ? t('preferences.darkOn') : t('preferences.lightOn')}
        </button>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-800">{t('preferences.importFormat')}</h2>
        <p className="text-xs text-slate-500 mt-1 mb-3">{t('preferences.importFormatHelp')}</p>
        <select
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm mb-4"
          value={prefs.importFormat}
          onChange={(e) => void update({ importFormat: e.target.value as ImportFormat })}
        >
          <option value="excel">Excel</option>
          <option value="csv">CSV</option>
        </select>
        <div className="grid gap-3">
          {MODELS.map((model) => (
            <div key={model.entity} className="border border-slate-200 rounded-xl px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">{t(model.title)}</span>
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => void downloadModel(model.url, t(model.title))}
                >
                  {t('preferences.downloadTemplate')}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {(columns[model.entity] ?? []).map((column) => column.label).join(' · ') || t('preferences.columnsLoading')}
              </p>
            </div>
          ))}
        </div>
      </section>

      {note && <p className="text-sm text-emerald-700 mt-3">{note}</p>}
    </div>
  );
}
