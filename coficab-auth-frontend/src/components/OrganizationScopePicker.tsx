import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationScope } from '../context/OrganizationScopeContext';

const NAVY = '#000168';
const LINE = '#e4e8f2';

/** Top-bar selector of the organizations followed across the console (superadmin only): one, several or all. */
export default function OrganizationScopePicker() {
  const { t } = useTranslation();
  const { canChoose, organizations, selectedIds, toggle, clear } = useOrganizationScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!canChoose || organizations.length < 2) return null;

  const label = selectedIds.length === 0
    ? t('orgScope.all')
    : selectedIds.length === 1
      ? organizations.find((o) => o.id === selectedIds[0])?.name ?? t('orgScope.count', { count: 1 })
      : t('orgScope.count', { count: selectedIds.length });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('orgScope.title')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 10,
          border: `1px solid ${selectedIds.length ? NAVY : LINE}`, background: selectedIds.length ? '#eef0ff' : '#fff',
          color: NAVY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', maxWidth: 220,
        }}
      >
        <i className="ti ti-building" style={{ fontSize: 15 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <i className="ti ti-chevron-down" style={{ fontSize: 12 }} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'absolute', right: 0, top: 44, zIndex: 60, width: 270, maxHeight: 360, overflowY: 'auto',
            background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(13,19,64,.16)', padding: 6,
          }}
        >
          <button
            type="button"
            onClick={clear}
            style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, background: selectedIds.length === 0 ? '#eef0ff' : 'transparent', color: NAVY, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('orgScope.all')}
          </button>
          <div style={{ height: 1, background: LINE, margin: '4px 0' }} />
          {organizations.map((o) => (
            <label
              key={o.id}
              role="option"
              aria-selected={selectedIds.includes(o.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, color: '#1e2433' }}
            >
              <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} style={{ accentColor: NAVY }} />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
