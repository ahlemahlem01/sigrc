import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { capaBtnPrimary, capaBtnSecondary } from '../capa/CapaAdminUi';
import JsonValueEditor from './JsonValueEditor';

type Props = {
  /** the report as it is on screen, not saved yet */
  result: unknown;
  onApply: (edited: unknown) => void;
  onClose: () => void;
};

/** Corrects the report on screen before it is saved (texts and figures): applying shows the corrected report, which can then be saved. */
export default function ReportDraftDialog({ result, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<unknown>(() => JSON.parse(JSON.stringify(result)));

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800 m-0">{t('reportHistory.draftTitle')}</h3>
          <p className="text-xs text-slate-500 mt-1 mb-0">{t('reportHistory.draftHint')}</p>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
            <JsonValueEditor value={draft} onChange={setDraft} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" className={capaBtnSecondary} onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className={capaBtnPrimary} onClick={() => onApply(draft)}>{t('reportHistory.apply')}</button>
        </div>
      </div>
    </div>
  );
}
