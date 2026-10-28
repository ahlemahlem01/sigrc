import { useTranslation } from 'react-i18next';

export const WORKFLOW_STAGES = ['DETECTION', 'ANALYSIS', 'PLANNING', 'EXECUTION', 'VERIFICATION', 'CLOSURE'] as const;

/**
 * The six steps of the general workflow of an action plan. The current step is read from the plan (nothing is stored), so the 8D workflow
 * of the claims is not touched. `counts` turns the strip into a pipeline: how many plans stand at each step.
 */
export default function WorkflowStages({ current, counts, compact = false }: { current?: number; counts?: number[]; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
    <ol className="m-0 p-0 list-none flex flex-wrap items-stretch gap-1.5" aria-label={t('workflowStages.title')}>
      {WORKFLOW_STAGES.map((code, i) => {
        const step = i + 1;
        const done = current != null && step < current;
        const on = current === step;
        return (
          <li
            key={code}
            aria-current={on ? 'step' : undefined}
            title={t(`workflowStages.hint.${code}`)}
            className={`flex-1 min-w-[96px] rounded-lg px-2.5 ${compact ? 'py-1.5' : 'py-2'} text-center border`}
            style={{
              background: on ? '#000168' : done ? '#eef2ff' : '#f8fafc',
              borderColor: on ? '#000168' : done ? '#c7d2fe' : '#e2e8f0',
              color: on ? '#fff' : done ? '#3730a3' : '#64748b',
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{step}</div>
            <div className="text-xs font-semibold leading-tight">{t(`workflowStages.${code}`)}</div>
            {counts && <div className="mt-0.5 text-base font-extrabold tabular-nums">{counts[i] ?? 0}</div>}
          </li>
        );
      })}
    </ol>
    {current != null && (
      <div className="mt-2 space-y-1.5">
        {current === 5 && (
          <p className="m-0 text-xs rounded-lg px-3 py-2" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }} role="note">
            {t('workflowStages.noteVerification')}
          </p>
        )}
        <p className="m-0 text-[11px] text-slate-500" role="note">{t('workflowStages.noteBackwards')}</p>
      </div>
    )}
    </>
  );
}
