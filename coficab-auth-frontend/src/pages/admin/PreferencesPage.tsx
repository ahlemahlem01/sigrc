import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePreferences, ExportFormat, ImportFormat } from '../../context/PreferencesContext';
import { downloadServerTemplate, ImportColumnSpec } from '../../utils/dataExchange';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import SegmentedToggle from '../../components/SegmentedToggle';
import { CapaPageHeader } from '../../components/capa/CapaAdminUi';

/** title = i18n key */
const MODELS = [
  { entity: 'plans', title: 'nav.actionPlans', icon: 'ti-file-description', url: `${ACTION_PLAN_API_URL}/import-templates/plans` },
  { entity: 'claims', title: 'adminDashboard.claims.title', icon: 'ti-clipboard-check', url: `${ACTION_PLAN_API_URL}/import-templates/claims` },
  { entity: 'employees', title: 'nav.employees', icon: 'ti-users', url: `${ACTION_PLAN_API_URL}/import-templates/employees` },
] as const;

const THEMES = [
  { id: 'light', labelKey: 'preferences.themeLight' },
  { id: 'dark', labelKey: 'preferences.themeDark' },
] as const;
const IMPORT_FORMATS = [
  { id: 'excel', labelKey: 'preferences.fmt.excel' },
  { id: 'csv', labelKey: 'preferences.fmt.csv' },
] as const;
const EXPORT_FORMATS = [
  { id: 'csv', labelKey: 'preferences.fmt.csv' },
  { id: 'excel', labelKey: 'preferences.fmt.excel' },
  { id: 'pdf', labelKey: 'preferences.fmt.pdf' },
] as const;

const card = 'bg-white border border-slate-200 rounded-2xl p-5 mb-4';

function Row({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-[240px] flex-1">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5 max-w-lg">{help}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** The personal choices of the signed-in user (theme, default formats) and the import templates. */
export default function PreferencesPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const prefs = usePreferences();
  const [note, setNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, ImportColumnSpec[]>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (kind: 'ok' | 'error', text: string) => {
    setNote({ kind, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 4000);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const update = async (patch: { theme?: 'light' | 'dark'; exportFormat?: ExportFormat; importFormat?: ImportFormat }) => {
    await prefs.save(patch);
    show('ok', accessToken ? t('preferences.saved') : t('preferences.signInToKeep'));
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

  const downloadModel = async (entity: string, url: string, title: string) => {
    if (!accessToken) {
      show('error', t('preferences.signInToDownload'));
      return;
    }
    setBusy(entity);
    try {
      await downloadServerTemplate(url, accessToken, prefs.importFormat);
      show('ok', t('preferences.templateDownloaded', { title, format: prefs.importFormat === 'excel' ? 'Excel' : 'CSV' }));
    } catch (error) {
      show('error', error instanceof Error ? error.message : t('preferences.templateUnavailable'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="text-slate-900 max-w-3xl pb-8">
      <CapaPageHeader eyebrow={t('admin.settings')} title={t('adminNav.preferences')} subtitle={t('preferences.subtitle')} />

      {note && (
        <div
          role="status"
          className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${note.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}
        >
          {note.text}
        </div>
      )}

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">{t('preferences.personal')}</h2>
        <div className="divide-y divide-slate-100">
          <Row title={t('preferences.appearance')} help={t('preferences.appearanceHelp')}>
            <SegmentedToggle
              options={THEMES}
              value={prefs.theme}
              onChange={(id) => void update({ theme: id })}
              ariaLabel={t('preferences.appearance')}
            />
          </Row>
          <Row title={t('preferences.exportFormat')} help={t('preferences.exportFormatHelp')}>
            <SegmentedToggle
              options={EXPORT_FORMATS}
              value={prefs.exportFormat}
              onChange={(id) => void update({ exportFormat: id })}
              ariaLabel={t('preferences.exportFormat')}
            />
          </Row>
          <Row title={t('preferences.importFormat')} help={t('preferences.importFormatHelp')}>
            <SegmentedToggle
              options={IMPORT_FORMATS}
              value={prefs.importFormat}
              onChange={(id) => void update({ importFormat: id })}
              ariaLabel={t('preferences.importFormat')}
            />
          </Row>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-800">{t('preferences.templates')}</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">{t('preferences.templatesHelp')}</p>
        <div className="grid gap-3">
          {MODELS.map((model) => {
            const cols = columns[model.entity];
            return (
              <div key={model.entity} className="border border-slate-200 rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <i className={`ti ${model.icon} text-lg text-slate-500`} aria-hidden />
                    <span className="text-sm font-semibold text-slate-800">{t(model.title)}</span>
                    {cols && <span className="text-[11px] text-slate-500">{t('preferences.columnsCount', { count: cols.length })}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={busy === model.entity}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void downloadModel(model.entity, model.url, t(model.title))}
                  >
                    {busy === model.entity
                      ? t('preferences.downloading')
                      : t('preferences.downloadAs', { format: prefs.importFormat === 'excel' ? 'Excel' : 'CSV' })}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {cols
                    ? cols.map((column) => (
                      <span key={column.label} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-[11px] text-slate-600">
                        {column.label}
                      </span>
                    ))
                    : <span className="text-[11px] text-slate-400">{t('preferences.columnsLoading')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
