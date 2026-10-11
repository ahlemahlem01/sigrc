import { workflowMessage } from './apiError';

describe('workflowMessage', () => {
  it('returns the server message of a workflow refusal', () => {
    const err = { response: { status: 409, data: { code: 'workflow', message: 'Le workflow n’autorise pas ce passage.' } } };
    expect(workflowMessage(err)).toBe('Le workflow n’autorise pas ce passage.');
  });

  it('ignores every other error so the screen keeps its own wording', () => {
    expect(workflowMessage({ response: { status: 409, data: { message: 'Conflit' } } })).toBeNull();
    expect(workflowMessage({ response: { status: 500, data: { code: 'workflow', message: 'x' } } })).toBeNull();
    expect(workflowMessage(new Error('network'))).toBeNull();
    expect(workflowMessage(undefined)).toBeNull();
  });
});
