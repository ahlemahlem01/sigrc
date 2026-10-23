import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { CapaErrorBanner, CapaPageHeader, capaBtnPrimary, capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import { normalizeRoles } from '../../utils/roles';

type Thresholds = {
  onTimeGreen: number; onTimeOrange: number; resolutionDays: number; ppmTolerancePct: number;
  activeDays: number; lowActivityDays: number; overloadMin: number; overloadFactor: number;
  requireActionValidation: number; validatorsSuperOnly: number; autoCloseOnValidation: number;
};

type Field = { key: keyof Thresholds; unit: string; min: number; max: number; step?: number; toggle?: boolean };

const SECTIONS: { id: string; fields: Field[] }[] = [
  {
    id: 'targets',
    fields: [
      { key: 'onTimeGreen', unit: '%', min: 1, max: 100 },
      { key: 'onTimeOrange', unit: '%', min: 1, max: 100 },
      { key: 'resolutionDays', unit: 'd', min: 1, max: 365 },
      { key: 'ppmTolerancePct', unit: '%', min: 0, max: 100 },
    ],
  },
  {
    id: 'activity',
    fields: [
      { key: 'activeDays', unit: 'd', min: 1, max: 365 },
      { key: 'lowActivityDays', unit: 'd', min: 2, max: 730 },
    ],
  },
  {
    id: 'workload',
    fields: [
      { key: 'overloadMin', unit: '', min: 1, max: 100 },
      { key: 'overloadFactor', unit: '×', min: 1, max: 10, step: 0.1 },
    ],
  },
  {
    id: 'circuit',
    fields: [
      { key: 'requireActionValidation', unit: '', min: 0, max: 1, toggle: true },
      { key: 'validatorsSuperOnly', unit: '', min: 0, max: 1, toggle: true },
      { key: 'autoCloseOnValidation', unit: '', min: 0, max: 1, toggle: true },
    ],
  },
];

const URL = `${ACTION_PLAN_API_URL}/dashboard/thresholds`;

/** Where the superadmin sets the levels that colour the dashboards and decide who is active or overloaded. */
export default function ThresholdsPage() {
  const { t, i18n } = useTranslation();
  const { accessToken, user } = useAuth();
  const canEdit = !!user && normalizeRoles(user as any).includes('superadmin');
  const [saved, setSaved] = useState<Thresholds | null>(null);
  const [defaults, setDefaults] = useState<Thresholds | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [askReset, setAskReset] = useState(false);

  const apply = (t: Thresholds) => {
    setSaved(t);
    setValues(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, String(v)])));
  };

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [current, built] = await Promise.all([
        axios.get<Thresholds>(URL, { headers }),
        axios.get<Thresholds>(`${URL}/defaults`, { headers }),
      ]);
      apply(current.data);
      setDefaults(built.data);
    } catch {
      setError(t('thresholds.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const fail = (err: unknown) => {
    const field = axios.isAxiosError(err) ? (err.response?.data as { field?: string } | undefined)?.field : undefined;
    setError(field ? t(`thresholds.err.${field}`, { defaultValue: t('thresholds.err.generic') }) : t('thresholds.err.generic'));
  };

  const dirty = !!saved && Object.entries(values).some(([k, v]) => Number(v) !== (saved as any)[k]);

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)]));
      const res = await axios.put<Thresholds>(URL, body, { headers: { Authorization: `Bearer ${accessToken}` } });
      apply(res.data);
      setNotice(t('thresholds.saved'));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await axios.delete<Thresholds>(URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      apply(res.data);
      setNotice(t('thresholds.resetDone'));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setAskReset(false);
    }
  };

  const inputCls = 'w-28 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white tabular-nums disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <div className="max-w-4xl pb-8">
      {askReset && (
        <ConfirmDialog
          title={t('thresholds.resetTitle')}
          text={t('thresholds.resetText')}
          confirmLabel={t('thresholds.resetConfirm')}
          busy={busy}
          onConfirm={() => void reset()}
          onCancel={() => setAskReset(false)}
        />
      )}
      <CapaPageHeader
        eyebrow={t('adminNav.settings')}
        title={t('thresholds.title')}
        subtitle={t('thresholds.subtitle')}
        actions={canEdit ? (
          <>
            <button type="button" className={capaBtnSecondary} disabled={busy || loading} onClick={() => setAskReset(true)}>{t('thresholds.reset')}</button>
            <button type="button" className={capaBtnPrimary} disabled={busy || loading || !dirty} onClick={() => void save()}>{t('common.save')}</button>
          </>
        ) : undefined}
      />

      {!canEdit && <div className="mb-4 px-4 py-2.5 rounded-lg text-sm border bg-slate-50 border-slate-200 text-slate-600">{t('thresholds.readOnly')}</div>}
      {error && <CapaErrorBanner message={error} />}
      {notice && <div className="mb-4 px-4 py-2.5 rounded-lg text-sm border bg-emerald-50 border-emerald-200 text-emerald-800">{notice}</div>}

      {loading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : (
        SECTIONS.map((section) => (
          <section key={section.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
            <h2 className="text-sm font-semibold text-slate-800 m-0">{t(`thresholds.section.${section.id}.title`)}</h2>
            <p className="text-xs text-slate-500 mt-1 mb-4">{t(`thresholds.section.${section.id}.sub`)}</p>
            <div className="divide-y divide-slate-100">
              {section.fields.map((f) => {
                const isDefault = defaults && Number(values[f.key]) === (defaults as any)[f.key];
                return (
                  <div key={f.key} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="text-sm font-semibold text-slate-800">{t(`thresholds.field.${f.key}.label`)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{t(`thresholds.field.${f.key}.hint`)}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{t('thresholds.usedBy')} {t(`thresholds.field.${f.key}.used`)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {f.toggle ? (
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Number(values[f.key]) === 1}
                            disabled={!canEdit || busy}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked ? '1' : '0' }))}
                            className="w-4 h-4 accent-blue-600"
                            aria-label={t(`thresholds.field.${f.key}.label`)}
                          />
                          {Number(values[f.key]) === 1 ? t('thresholds.on') : t('thresholds.off')}
                        </label>
                      ) : (<>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={f.min}
                        max={f.max}
                        step={f.step ?? 1}
                        value={values[f.key] ?? ''}
                        disabled={!canEdit || busy}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className={inputCls}
                        aria-label={t(`thresholds.field.${f.key}.label`)}
                      />
                      <span className="text-xs text-slate-500 w-4">{f.unit}</span>
                      </>)}
                    </div>
                    <div className="w-32 text-[11px] text-slate-400">
                      {defaults ? (isDefault ? t('thresholds.defaultValue') : t('thresholds.defaultIs', { value: f.toggle ? t(Number((defaults as any)[f.key]) === 1 ? 'thresholds.on' : 'thresholds.off') : Number((defaults as any)[f.key]).toLocaleString(i18n.language) })) : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
