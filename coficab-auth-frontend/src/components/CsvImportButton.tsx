import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { downloadImportTemplate, downloadServerTemplate, ImportColumnSpec, ImportFormat, normalizeImportFile } from '../utils/dataExchange';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';
import { useTranslation } from 'react-i18next';

export type CsvImportResult = {
  created: number;
  errors?: { line: number; message: string }[];
};

type Props = {
  className?: string;
  label: string;
  summary: (created: number) => string;
  children?: ReactNode;
  columns?: string[];
  templateName?: string;
  entity?: 'plans' | 'claims' | 'employees';
  importFile: (file: File) => Promise<CsvImportResult>;
  onImported?: () => void | Promise<void>;
};

const TEMPLATE_URL: Record<NonNullable<Props['entity']>, string> = {
  plans: `${ACTION_PLAN_API_URL}/import-templates/plans`,
  claims: `${ACTION_PLAN_API_URL}/import-templates/claims`,
  employees: `${ACTION_PLAN_API_URL}/import-templates/employees`,
};

export function CsvImportButton({ className, label, summary, children, columns, templateName, entity, importFile, onImported }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const prefs = usePreferences();
  const { accessToken } = useAuth();
  const [format, setFormat] = useState<ImportFormat>(prefs.importFormat);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [schema, setSchema] = useState<ImportColumnSpec[] | null>(null);

  useEffect(() => { setFormat(prefs.importFormat); }, [prefs.importFormat]);

  useEffect(() => {
    if (!entity || !accessToken) return;
    let cancel = false;
    fetch(`${TEMPLATE_URL[entity]}/columns`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancel && Array.isArray(data.columns)) setSchema(data.columns);
      })
      .catch(() => { if (!cancel) setSchema(null); });
    return () => { cancel = true; };
  }, [entity, accessToken]);

  const specs: Array<string | ImportColumnSpec> = schema ?? columns ?? [];

  const pick = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const downloadModel = async () => {
    if (!entity || !accessToken) {
      if (columns) downloadImportTemplate(columns, format, templateName || 'import');
      return;
    }
    setFailed(false);
    setNote('');
    try {
      await downloadServerTemplate(TEMPLATE_URL[entity], accessToken, format);
    } catch (e: any) {
      setFailed(true);
      setNote(e?.message || t('csvImport.templateUnavailable'));
    }
  };

  const onChange = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setNote('');
    setFailed(false);
    try {
      const payload = specs.length > 0 ? await normalizeImportFile(file, specs) : file;
      const result = await importFile(payload);
      const errors = result.errors?.length ?? 0;
      const createdLabel = summary(result.created);
      setNote(errors > 0 ? `${createdLabel}. ${t('csvImport.skipped', { count: errors })}` : `${createdLabel}.`);
      setFailed(result.created === 0 && errors > 0);
      if (result.created > 0 && onImported) await onImported();
    } catch (e: any) {
      setFailed(true);
      setNote(e?.response?.data?.message || e?.message || t('csvImport.failed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {(columns || entity) && (
        <>
          <select
            aria-label={t('csvImport.format')}
            value={format}
            onChange={(e) => setFormat(e.target.value as ImportFormat)}
            style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8, border: '1px solid #e2e8f0' }}
          >
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
          </select>
          <button type="button" className={className} onClick={() => void downloadModel()}>
            {t('csvImport.downloadTemplate')}
          </button>
        </>
      )}
      <button type="button" className={className} onClick={pick} disabled={busy}>
        {children}
        {busy ? t('csvImport.importing') : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xls,text/csv,application/vnd.ms-excel"
        style={{ display: 'none' }}
        onChange={(e) => void onChange(e.target.files?.[0] ?? null)}
      />
      {note && (
        <span style={{ fontSize: 12, color: failed ? '#b91c1c' : '#15803d', maxWidth: 280 }}>
          {note}
        </span>
      )}
    </span>
  );
}
