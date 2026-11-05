import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPlanTimeline, PlanTimelineEvent } from '../../services/actionPlanService';
import { dateLocale } from '../../i18n';

const TONE: Record<string, string> = {
  subaction_description: '#4338ca', subaction_deadline_extended: '#b45309', subaction_proof: '#0f766e', subaction_completed: '#059669', subaction_validated: '#047857', subaction_rejected: '#b91c1c',
  subaction_warning: '#b45309', rejected: '#b91c1c', warning_sent: '#b45309', created: '#000168',
};

/** The history of a plan: its own events and those of its sub-actions (progress, proofs, validation, rejection), newest first. `refreshKey` reloads it after a change. */
export default function PlanTimeline({ token, planId, refreshKey = 0 }: { token: string; planId: string; refreshKey?: string | number }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<PlanTimelineEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setError(false);
    getPlanTimeline(token, planId).then((e) => { if (live) setEvents(e); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [token, planId, refreshKey]);

  const label = (e: PlanTimelineEvent) => t(`planTimeline.type.${e.actionType}`, { defaultValue: e.actionType.replace(/_/g, ' ') });

  if (error) return <p className="text-sm text-red-600 m-0">{t('planTimeline.loadError')}</p>;
  if (!events) return <p className="text-sm text-slate-400 m-0">{t('planTimeline.loading')}</p>;
  if (events.length === 0) return <p className="text-sm text-slate-400 m-0">{t('planTimeline.empty')}</p>;
  return (
    <ol className="m-0 p-0 list-none grid gap-2.5">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TONE[e.actionType] ?? '#94a3b8' }} />
          <div className="min-w-0">
            <div className="text-sm text-slate-800">
              <b>{label(e)}</b>
              {e.note ? <span className="text-slate-600"> · {e.note}</span> : null}
            </div>
            <div className="text-[11px] text-slate-500">
              {e.changedByName || e.changedBy || '—'} · {new Date(e.createdAt).toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
