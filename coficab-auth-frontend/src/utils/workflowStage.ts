/**
 * The step of the general workflow of an action plan (1 Detection ... 6 Closure), for the screens that already hold the plan and its actions
 * (the employee's page). Same rule as the server (PlanWorkflow.cs, which feeds the admin page and the dashboard): the step is read, never stored.
 *
 * Progress values are the raw ones: 0 not started, 1-99 started, 100 done, 101 validated, 102 cancelled.
 */
export function workflowStageOf(plan: { status: number; assignedToId?: string | null }, actions: { progress: number }[]): number {
  if (plan.status === 3 || plan.status === 4) return 6;                    // closed or archived
  if (actions.length === 0) return (plan.assignedToId ?? '').trim() ? 2 : 1;
  if (actions.every((a) => a.progress >= 100)) return 5;                   // done, validated or cancelled
  return actions.some((a) => a.progress !== 0) ? 4 : 3;
}
