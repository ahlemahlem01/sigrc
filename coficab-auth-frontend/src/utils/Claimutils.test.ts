import { resolveClaimStatus } from './Claimutils';

describe('resolveClaimStatus', () => {
  it.each([
    ['PENDING_VALIDATION', 'PENDING_VALIDATION'],
    ['VALIDATED', 'VALIDATED'],
    ['REJECTED', 'REJECTED'],
    ['CLOTUREE', 'CLOTUREE'],
    ['EN_ANALYSE', 'EN_ANALYSE'],
    ['ASSIGNED', 'ASSIGNED'],
    ['OUVERTE', 'OUVERTE'],
    ['DRAFT', 'DRAFT'],
  ])('%s stays %s', (statusCode, expected) => {
    expect(resolveClaimStatus({ statusCode })).toBe(expected);
  });
});
