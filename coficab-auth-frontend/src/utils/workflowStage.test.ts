import { workflowStageOf } from './workflowStage';

describe('workflowStageOf (same rule as PlanWorkflow.cs)', () => {
  const ongoing = { status: 2, assignedToId: 'u' };

  it('without actions: detection until someone is in charge, then analysis', () => {
    expect(workflowStageOf({ status: 1 }, [])).toBe(1);
    expect(workflowStageOf({ status: 1, assignedToId: '  ' }, [])).toBe(1);
    expect(workflowStageOf(ongoing, [])).toBe(2);
  });

  it('with actions: planning, then execution, then verification', () => {
    expect(workflowStageOf(ongoing, [{ progress: 0 }, { progress: 0 }])).toBe(3);
    expect(workflowStageOf(ongoing, [{ progress: 50 }, { progress: 0 }])).toBe(4);
    expect(workflowStageOf(ongoing, [{ progress: 100 }, { progress: 101 }, { progress: 102 }])).toBe(5);
  });

  it('a new action brings a plan in verification back, and a closed plan is always closure', () => {
    expect(workflowStageOf(ongoing, [{ progress: 100 }, { progress: 0 }])).toBe(4);
    expect(workflowStageOf({ status: 3 }, [{ progress: 0 }])).toBe(6);
    expect(workflowStageOf({ status: 4 }, [])).toBe(6);
  });
});
