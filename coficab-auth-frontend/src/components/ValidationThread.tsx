import React from 'react';
import { useTranslation } from 'react-i18next';

export type RootStep = 'toValidate' | 'validated';
export type PlanStep = 'none' | 'toApprove' | 'returned' | 'inProgress' | 'toValidate' | 'validated';

interface Props {
  /** First step: the root cause (5 Why). */
  root: RootStep;
  /** Second step: the action plan (CAPA, D5). */
  plan: PlanStep | string | null | undefined;
  /** Progress of the plan, in percent, when it exists. */
  progress?: number | null;
}

const TONE: Record<string, { bg: string; color: string; border: string }> = {
  todo: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },      // waiting for the administrator
  wait: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },      // not started: nothing to do yet
  run: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },       // someone is working on it
  done: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },      // validated
};

/**
 * The validation thread of a claim, in the order it is imposed: ① the root cause is validated, ② then the action plan.
 * It tells the administrator where a file stands and what is still to come, without changing any rule.
 */
export const ValidationThread: React.FC<Props> = ({ root, plan, progress }) => {
  const { t } = useTranslation();
  const planStep: PlanStep = plan === 'inProgress' || plan === 'toValidate' || plan === 'validated' || plan === 'toApprove' || plan === 'returned' ? plan : 'none';

  const first = root === 'validated'
    ? { tone: TONE.done, text: t('validationThread.rootValidated') }
    : { tone: TONE.todo, text: t('validationThread.rootToValidate') };
  const second = planStep === 'validated'
    ? { tone: TONE.done, text: t('validationThread.planValidated') }
    : planStep === 'toApprove'
      ? { tone: TONE.todo, text: t('validationThread.planToApprove') }
    : planStep === 'returned'
      ? { tone: TONE.wait, text: t('validationThread.planReturned') }
    : planStep === 'toValidate'
      ? { tone: TONE.todo, text: t('validationThread.planToValidate') }
      : planStep === 'inProgress'
        ? { tone: TONE.run, text: t('validationThread.planInProgress', { pct: progress ?? 0 }) }
        : { tone: TONE.wait, text: root === 'validated' ? t('validationThread.planNone') : t('validationThread.planAfterRoot') };

  const pill = (n: string, label: string, text: string, tone: { bg: string; color: string; border: string }) => (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
        background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
      }}
    >
      <span aria-hidden="true">{n}</span> {label} : {text}
    </span>
  );

  return (
    <div role="group" aria-label={t('validationThread.label')} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {pill('①', t('validationThread.rootCause'), first.text, first.tone)}
      <span aria-hidden="true" style={{ color: '#94a3b8' }}>→</span>
      {pill('②', t('validationThread.actionPlan'), second.text, second.tone)}
    </div>
  );
};
