import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export type PageTab<Id extends string = string> = { id: Id; labelKey: string };

/**
 * Underline tab bar driven by the `?tab=` query parameter, shared by the pages that group several views
 * (CAPA steering, claims steering, analyses and reports). Unknown or missing values fall back to the first tab.
 */
export function usePageTab<Id extends string>(tabs: readonly PageTab<Id>[]): [Id, (id: Id) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = (tabs.find((x) => x.id === requested) ?? tabs[0]).id;
  const select = (id: Id) => {
    const next = new URLSearchParams(params);
    next.set('tab', id);
    setParams(next);
  };
  return [active, select];
}

export default function PageTabs<Id extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly PageTab<Id>[];
  active: Id;
  onChange: (id: Id) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <style>{CSS}</style>
      <div className="pt-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            className={`pt-tab${active === item.id ? ' on' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </>
  );
}

const CSS = `
  .pt-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0; }
  .pt-tab {
    border: 0; background: transparent; color: #64748b; padding: 10px 16px; margin-bottom: -1px;
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    border-bottom: 2px solid transparent; transition: color .15s ease, border-color .15s ease;
  }
  .pt-tab:hover { color: #000168; }
  .pt-tab.on { color: #000168; border-bottom-color: #000168; }
  .pt-tab:focus-visible { outline: 2px solid #c7d2fe; outline-offset: -2px; border-radius: 6px; }
`;
