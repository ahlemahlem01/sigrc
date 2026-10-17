import { useTranslation } from 'react-i18next';

export type ToggleOption<Id extends string = string> = { id: Id; labelKey: string };

/**
 * The segmented toggle of the CAPA steering indicators (7d / 1m / 3m / 1y), shared so every toggle in the
 * application looks and behaves the same.
 */
export default function SegmentedToggle<Id extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly ToggleOption<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={on ? { background: '#000168', color: '#fff' } : { color: '#64748b' }}
          >
            {t(o.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
