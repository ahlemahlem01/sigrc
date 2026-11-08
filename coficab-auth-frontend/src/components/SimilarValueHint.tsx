import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';

interface Suggestion { value: string; score: number; exact: boolean }

interface Props {
  field: 'client' | 'line' | 'shift';
  value: string;
  token: string | null | undefined;
  onPick: (value: string) => void;
}

/**
 * Under a free-text field (customer, line, shift): the value already used that is the same one written another way
 * ("Léoni" for "Leoni") or a close one, with a button to take it. Only a suggestion: nothing is changed unless the person clicks.
 */
export default function SimilarValueHint({ field, value, token, onPick }: Props) {
  const { t } = useTranslation();
  const [found, setFound] = useState<Suggestion[]>([]);

  useEffect(() => {
    const text = value.trim();
    if (!token || text.length < 2) { setFound([]); return; }
    let cancel = false;
    const id = window.setTimeout(() => {
      fetch(`${ACTION_PLAN_API_URL}/value-suggestions?field=${field}&value=${encodeURIComponent(text)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: Suggestion[]) => { if (!cancel) setFound(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancel) setFound([]); });
    }, 400);
    return () => { cancel = true; window.clearTimeout(id); };
  }, [field, value, token]);

  // exactly what is typed already: nothing to suggest
  const others = found.filter((s) => s.value.trim() !== value.trim());
  if (others.length === 0) return null;

  return (
    <div role="status" style={{ marginTop: 6, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px' }}>
      {t('similarValue.hint')}{' '}
      {others.slice(0, 3).map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onPick(s.value)}
          style={{ marginRight: 6, padding: '1px 8px', borderRadius: 999, border: '1px solid #f59e0b', background: '#fff', color: '#92400e', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
        >
          {s.value}
        </button>
      ))}
    </div>
  );
}
