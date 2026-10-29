import { localizedNotification, notificationPath } from './notificationText';

const t = (key: string, o?: Record<string, unknown>) => (o ? `${key}|${JSON.stringify(o)}` : key);
const fmt = (iso: string) => `fmt(${iso})`;
const data = JSON.stringify({ title: 'Plan A', oldDeadline: '2026-10-10', newDeadline: '2026-11-05', days: 26, reason: 'Lot bloqué' });

describe('localizedNotification', () => {
  it('writes a deadline extension from the translations, with the dates formatted for the reader', () => {
    const r = localizedNotification({ type: 'plan_deadline_extended', title: 'Échéance prolongée', message: 'texte français', dataJson: data }, t, fmt);
    expect(r.title).toBe('notificationBell.deadlineExtended.title');
    expect(r.message).toContain('notificationBell.deadlineExtended.message');
    expect(r.message).toContain('fmt(2026-11-05)');
    expect(r.message).toContain('fmt(2026-10-10)');
    expect(r.message).toContain('Lot bloqué');
    expect(r.message).toContain('"days":26');
  });

  it('handles claim extensions the same way', () => {
    expect(localizedNotification({ type: 'claim_deadline_extended', title: 'a', message: 'b', dataJson: data }, t, fmt).title)
      .toBe('notificationBell.deadlineExtended.title');
  });

  it('keeps the stored text for other notifications, missing data or unreadable data', () => {
    expect(localizedNotification({ type: 'claim_assigned', title: 'Réclamation assignée', message: 'm', dataJson: data }, t, fmt))
      .toEqual({ title: 'Réclamation assignée', message: 'm' });
    expect(localizedNotification({ type: 'plan_deadline_extended', title: 'T', message: 'M' }, t, fmt)).toEqual({ title: 'T', message: 'M' });
    expect(localizedNotification({ type: 'plan_deadline_extended', title: 'T', message: 'M', dataJson: '{oops' }, t, fmt)).toEqual({ title: 'T', message: 'M' });
    expect(localizedNotification({ type: 'plan_deadline_extended', title: 'T', message: 'M', dataJson: '{}' }, t, fmt)).toEqual({ title: 'T', message: 'M' });
  });
});

describe('notificationPath', () => {
  const plan = { type: 'action_assigned', actionPlanId: 'p1' };

  it('opens a plan in the management section for an administrator and in "my action plans" for an employee', () => {
    expect(notificationPath(plan, true)).toBe('/pages/front/action-plans/p1');
    expect(notificationPath(plan, false)).toBe('/pages/front/my-action-plans/p1');
  });

  it('keeps an explicit link, but never sends an employee to a page closed to employees', () => {
    expect(notificationPath({ type: 'x', linkPath: '/pages/front/validations?tab=fivewhy' }, true)).toBe('/pages/front/validations?tab=fivewhy');
    expect(notificationPath({ type: 'x', linkPath: '/pages/front/action-plans/p2' }, false)).toBe('/pages/front/my-action-plans/p2');
    expect(notificationPath({ type: 'x', linkPath: '/pages/front/my-claims?claimId=c1' }, false)).toBe('/pages/front/my-claims?claimId=c1');
  });

  it('sends the old 8D link, a page that does not exist, to the 8D file of the claim', () => {
    expect(notificationPath({ type: 'eight_d_pending_validation', claimId: 'c9', linkPath: '/pages/front/quality-analyses/admin?tab=dossier' }, true))
      .toBe('/pages/front/quality-analyses/8d/c9');
  });

  it('leads to the claim when there is one, ignores foreign links and has nothing to open otherwise', () => {
    expect(notificationPath({ type: 'x', claimId: 'c1' }, false)).toBe('/pages/front/my-claims?claimId=c1');
    expect(notificationPath({ type: 'x', linkPath: '//evil.example' }, true)).toBeNull();
    expect(notificationPath({ type: 'x' }, true)).toBeNull();
  });
});
