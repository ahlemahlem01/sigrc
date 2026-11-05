import { useTranslation } from 'react-i18next';

type Props = {
  value: unknown;
  onChange: (next: unknown) => void;
  label?: string;
  /** rows of a list shown at once (the others stay unchanged) */
  maxRows?: number;
};

const words = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');

const inputCls = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white';

/**
 * Edits any report content as it is stored: every text, number and yes/no of it, in lists and groups, and lets rows of a list be
 * removed. Used for the saved reports of the dashboard, whose figures can all be corrected (each correction is kept as a version).
 */
export default function JsonValueEditor({ value, onChange, label, maxRows = 50 }: Props) {
  const { t } = useTranslation();

  if (Array.isArray(value)) {
    const shown = value.slice(0, maxRows);
    return (
      <div className="mb-2">
        {label && <div className="text-xs font-semibold text-slate-600 mb-1 capitalize">{words(label)} <span className="font-normal text-slate-400">({value.length})</span></div>}
        <div className="pl-3 border-l-2 border-slate-100 space-y-2">
          {shown.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <JsonValueEditor
                  value={item}
                  label={typeof item === 'object' && item !== null ? `#${index + 1}` : undefined}
                  maxRows={maxRows}
                  onChange={(next) => onChange(value.map((v, i) => (i === index ? next : v)))}
                />
              </div>
              <button
                type="button"
                title={t('reportEdit.removeRow')}
                aria-label={t('reportEdit.removeRow')}
                className="px-2 py-1 text-xs rounded-lg border border-slate-200 text-red-600 bg-white"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
          {value.length > shown.length && (
            <p className="text-[11px] text-slate-500 m-0">{t('reportEdit.showing', { shown: shown.length, total: value.length })}</p>
          )}
        </div>
      </div>
    );
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="mb-2">
        {label && <div className="text-xs font-semibold text-slate-600 mb-1 capitalize">{words(label)}</div>}
        <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
          {entries.map(([key, child]) => {
            const complex = child !== null && typeof child === 'object';
            return (
              <div key={key} className={complex ? 'sm:col-span-2' : ''}>
                <JsonValueEditor value={child} label={key} maxRows={maxRows} onChange={(next) => onChange({ ...(value as Record<string, unknown>), [key]: next })} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span className="capitalize">{label ? words(label) : ''}</span>
      </label>
    );
  }

  if (typeof value === 'number') {
    return (
      <label className="block">
        {label && <span className="block text-[11px] text-slate-500 mb-0.5 capitalize">{words(label)}</span>}
        <input
          type="number"
          step="any"
          className={inputCls}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      </label>
    );
  }

  const text = value == null ? '' : String(value);
  return (
    <label className="block">
      {label && <span className="block text-[11px] text-slate-500 mb-0.5 capitalize">{words(label)}</span>}
      {text.length > 90 || text.includes('\n') ? (
        <textarea rows={3} className={inputCls} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={inputCls} value={text} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
