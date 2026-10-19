import { clearAccessToken, loadAccessToken, saveAccessToken, withRefreshLock } from './sessionRefresh';

describe('sessionRefresh', () => {
  afterEach(() => {
    sessionStorage.clear();
    delete (navigator as any).locks;
  });

  it('keeps an access token that is still good and drops it once it is nearly expired', () => {
    saveAccessToken('abc', Date.now() + 10 * 60_000);
    expect(loadAccessToken()?.token).toBe('abc');

    saveAccessToken('abc', Date.now() + 30_000);        // less than a minute left: renew instead
    expect(loadAccessToken()).toBeNull();
  });

  it('forgets the access token when asked', () => {
    saveAccessToken('abc', Date.now() + 10 * 60_000);
    clearAccessToken();
    expect(loadAccessToken()).toBeNull();
  });

  it('ignores a damaged stored value', () => {
    sessionStorage.setItem('coficab_access', '{not json');
    expect(loadAccessToken()).toBeNull();
  });

  it('runs renewals one after the other when the browser has Web Locks', async () => {
    // a minimal lock manager: requests wait for the previous one to finish
    let tail: Promise<unknown> = Promise.resolve();
    (navigator as any).locks = { request: (_name: string, work: () => Promise<unknown>) => (tail = tail.then(work, work)) };

    const order: string[] = [];
    const renew = (name: string, ms: number) => withRefreshLock(async () => {
      order.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${name}:end`);
    });

    await Promise.all([renew('a', 20), renew('b', 1)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);   // b never starts while a is running
  });

  it('just runs the work when Web Locks are not available', async () => {
    await expect(withRefreshLock(async () => 42)).resolves.toBe(42);
  });
});
