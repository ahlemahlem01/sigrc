import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { resetOverviewTargets, saveOverviewTargets } from '../../../services/dashboardOverviewService';
import type { OverviewTargets } from '../../../types/dashboardOverview';
import { COFICAB } from './dashPalette';

const FIELDS: { key: keyof OverviewTargets; label: string; hint: string; unit: string; min: number; max: number }[] = [
  { key: 'onTimeGreen', label: 'overviewPage.targetsDlg.onTimeGreen', hint: 'overviewPage.targetsDlg.onTimeGreenHint', unit: '%', min: 1, max: 100 },
  { key: 'onTimeOrange', label: 'overviewPage.targetsDlg.onTimeOrange', hint: 'overviewPage.targetsDlg.onTimeOrangeHint', unit: '%', min: 1, max: 100 },
  { key: 'resolutionDays', label: 'overviewPage.targetsDlg.resolutionDays', hint: 'overviewPage.targetsDlg.resolutionDaysHint', unit: 'd', min: 1, max: 365 },
  { key: 'ppmTolerancePct', label: 'overviewPage.targetsDlg.ppmTolerancePct', hint: 'overviewPage.targetsDlg.ppmToleranceHint', unit: '%', min: 0, max: 100 },
];

/** Where the administrator sets the levels the overview's traffic lights are compared with (superadmin only). */
export default function OverviewTargetsDialog({
  targets, onClose, onSaved,
}: { targets: OverviewTargets; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [values, setValues] = useState<Record<keyof OverviewTargets, string>>({
    onTimeGreen: String(targets.onTimeGreen),
    onTimeOrange: String(targets.onTimeOrange),
    resolutionDays: String(targets.resolutionDays),
    ppmTolerancePct: String(targets.ppmTolerancePct),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fail = (err: unknown) => {
    const field = axios.isAxiosError(err) ? (err.response?.data as { field?: string } | undefined)?.field : undefined;
    setError(field ? t(`overviewPage.targetsDlg.err.${field}`) : t('overviewPage.targetsDlg.err.generic'));
  };

  const save = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    try {
      await saveOverviewTargets(accessToken, {
        onTimeGreen: Number(values.onTimeGreen),
        onTimeOrange: Number(values.onTimeOrange),
        resolutionDays: Number(values.resolutionDays),
        ppmTolerancePct: Number(values.ppmTolerancePct),
      });
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    try {
      await resetOverviewTargets(accessToken);
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('overviewPage.targetsDlg.title')}
      className="fixed inset-0 z-[70] grid place-items-center p-4"
      style={{ background: 'rgba(13,19,64,.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold m-0" style={{ color: COFICAB.ink }}>{t('overviewPage.targetsDlg.title')}</h2>
        <p className="text-xs mt-1 mb-4" style={{ color: COFICAB.muted }}>{t('overviewPage.targetsDlg.intro')}</p>

        <div className="space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-xs font-semibold mb-1" style={{ color: COFICAB.ink }}>{t(f.label)}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step="any"
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="w-28 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: COFICAB.line }}
                />
                <span className="text-xs" style={{ color: COFICAB.muted }}>{f.unit}</span>
              </div>
              <span className="block text-[11px] mt-1" style={{ color: COFICAB.muted }}>{t(f.hint)}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-xs font-semibold mt-3 mb-0" style={{ color: COFICAB.danger }}>{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => void reset()} disabled={busy} className="text-xs font-semibold underline" style={{ color: COFICAB.muted }}>
            {t('overviewPage.targetsDlg.reset')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-3 py-2 text-xs font-semibold rounded-xl border bg-white" style={{ borderColor: COFICAB.line, color: COFICAB.navy }}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void save()} disabled={busy} className="px-3 py-2 text-xs font-bold rounded-xl text-white" style={{ background: COFICAB.navy }}>
              {busy ? t('overviewPage.targetsDlg.saving') : t('overviewPage.targetsDlg.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
