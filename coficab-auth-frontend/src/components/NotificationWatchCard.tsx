import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';

interface Dept { id: string; name: string; code: string; watching: boolean }

/**
 * Superadmin only: the departments whose requests for validation (5 Why, plans, 8D) also reach the superadmin.
 * Nothing chosen = no request, except the ones nobody else can decide (last resort).
 */
export default function NotificationWatchCard() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [items, setItems] = useState<Dept[] | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!accessToken) return;
    let cancel = false;
    fetch(`${ACTION_PLAN_API_URL}/notification-watch`, { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Dept[]) => { if (!cancel) setItems(data); })
      .catch(() => { if (!cancel) setState('error'); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const save = async (next: Dept[]) => {
    setItems(next);
    setState('saving');
    try {
      const r = await fetch(`${ACTION_PLAN_API_URL}/notification-watch`, {
        method: 'PUT', headers, body: JSON.stringify({ departmentIds: next.filter((d) => d.watching).map((d) => d.id) }),
      });
      setState(r.ok ? 'saved' : 'error');
    } catch { setState('error'); }
  };

  const toggle = (id: string) => items && void save(items.map((d) => (d.id === id ? { ...d, watching: !d.watching } : d)));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
      <h2 className="text-sm font-semibold text-slate-800">{t('notificationWatch.title')}</h2>
      <p className="text-xs text-slate-500 mt-1 mb-4 max-w-xl">{t('notificationWatch.help')}</p>
      {items === null && state !== 'error' && <p className="text-xs text-slate-400">{t('notificationWatch.loading')}</p>}
      {state === 'error' && <p role="alert" className="text-xs text-red-600">{t('notificationWatch.error')}</p>}
      {items && (
        <div className="flex flex-wrap gap-2">
          {items.map((d) => (
            <label
              key={d.id}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer ${d.watching ? 'border-[#000168] bg-[#eef0ff] text-[#000168] font-semibold' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <input type="checkbox" checked={d.watching} onChange={() => toggle(d.id)} />
              {d.code ? `[${d.code}] ` : ''}{d.name}
            </label>
          ))}
        </div>
      )}
      {state === 'saved' && <p role="status" className="text-xs text-emerald-700 mt-3">{t('notificationWatch.saved')}</p>}
    </section>
  );
}
