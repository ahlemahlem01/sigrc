import { DEFAULT_DOMAIN, domainOf, inDomain } from './planDomain';

describe('plan domains', () => {
  const plans = [{ id: 1, domain: 'HSE' }, { id: 2, domain: 'maintenance' }, { id: 3 }, { id: 4, domain: '' }];

  it('a plan without a domain is a quality plan, whatever the case of the code', () => {
    expect(domainOf(plans[2])).toBe(DEFAULT_DOMAIN);
    expect(domainOf(plans[3])).toBe('QUALITY');
    expect(domainOf(plans[1])).toBe('MAINTENANCE');
  });

  it('filters by domain and keeps everything for "all"', () => {
    expect(inDomain(plans, 'HSE').map((p) => p.id)).toEqual([1]);
    expect(inDomain(plans, 'QUALITY').map((p) => p.id)).toEqual([3, 4]);
    expect(inDomain(plans, 'all')).toHaveLength(4);
    expect(inDomain(plans, '')).toHaveLength(4);
  });
});
