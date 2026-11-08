import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** The first entry, the one that clears the filter (value ''), e.g. "All actors". */
  allLabel: string;
  options: FilterOption[];
  title?: string;
  disabled?: boolean;
  /** A search box over the list: for the long ones (people, actions). */
  searchable?: boolean;
}

/**
 * A drop-down for the filters, in the app's own style (a slim scroll bar, rounded corners, a search box for long lists) in place of the
 * browser's list. Same behavior as a select: one value, an entry that clears it, Escape and a click outside close it.
 */
export default function FilterSelect({ value, onChange, allLabel, options, title, disabled, searchable }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const id = window.setTimeout(() => search.current?.focus(), 20);
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { window.clearTimeout(id); document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const current = options.find((o) => o.value === value)?.label ?? (value ? value : allLabel);
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className="fsel" ref={root} title={title}>
      <button type="button" className={`fsel-btn${value ? ' on' : ''}`} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="fsel-label">{current}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="fsel-pop" role="listbox">
          {searchable && (
            <input ref={search} className="fsel-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search', { defaultValue: 'Rechercher…' })} aria-label={t('common.search', { defaultValue: 'Rechercher…' })} />
          )}
          <div className="fsel-list">
            {!query && (
              <button type="button" role="option" aria-selected={value === ''} className={`fsel-opt${value === '' ? ' sel' : ''}`} onClick={() => pick('')}>{allLabel}</button>
            )}
            {shown.map((o) => (
              <button type="button" role="option" aria-selected={o.value === value} key={o.value} className={`fsel-opt${o.value === value ? ' sel' : ''}`} onClick={() => pick(o.value)}>{o.label}</button>
            ))}
            {shown.length === 0 && <div className="fsel-none">—</div>}
          </div>
        </div>
      )}
      <style>{`
        .fsel { position: relative; width: 100%; min-width: 0; }
        .fsel-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 12px; border: 1px solid #e4e8f2; border-radius: 8px; font-size: 12px; font-family: inherit; color: #374151; background: #f8f9fc; cursor: pointer; text-align: left; }
        .fsel-btn:hover:not(:disabled) { border-color: #c7cde0; }
        .fsel-btn:focus-visible, .fsel-btn[aria-expanded="true"] { outline: none; border-color: #000168; }
        .fsel-btn.on { border-color: #000168; color: #000168; font-weight: 600; background: #eef0ff; }
        .fsel-btn:disabled { opacity: .55; cursor: not-allowed; }
        .fsel-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsel-pop { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; min-width: 100%; width: max-content; max-width: 340px; background: #fff; border: 1px solid #e4e8f2; border-radius: 12px; box-shadow: 0 12px 32px rgba(15, 23, 42, .16); padding: 6px; }
        .fsel-search { width: 100%; box-sizing: border-box; padding: 7px 10px; margin-bottom: 6px; border: 1px solid #e4e8f2; border-radius: 8px; font-size: 12px; font-family: inherit; outline: none; background: #f8f9fc; }
        .fsel-search:focus { border-color: #000168; }
        .fsel-list { max-height: 260px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #c3c9de transparent; padding-right: 2px; }
        .fsel-list::-webkit-scrollbar { width: 6px; }
        .fsel-list::-webkit-scrollbar-track { background: transparent; }
        .fsel-list::-webkit-scrollbar-thumb { background: #c3c9de; border-radius: 999px; }
        .fsel-list::-webkit-scrollbar-thumb:hover { background: #9aa3c4; }
        .fsel-opt { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 8px; background: transparent; font-size: 12px; font-family: inherit; color: #1f2937; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fsel-opt:hover { background: #f1f3fb; }
        .fsel-opt.sel { background: #e6e9ff; color: #000168; font-weight: 700; }
        .fsel-none { padding: 8px 10px; color: #94a3b8; font-size: 12px; }
      `}</style>
    </div>
  );
}
