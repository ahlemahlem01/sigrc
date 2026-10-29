import axios from 'axios';
import { getTurnstileConfig, resetTurnstileConfig } from './turnstileService';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

describe('getTurnstileConfig', () => {
  beforeEach(() => { resetTurnstileConfig(); mocked.get.mockReset(); });

  it('is on only when the server says so and gives a public key, and asks once', async () => {
    mocked.get.mockResolvedValue({ data: { enabled: true, siteKey: 'abc' } });
    expect(await getTurnstileConfig()).toEqual({ enabled: true, siteKey: 'abc' });
    await getTurnstileConfig();
    expect(mocked.get).toHaveBeenCalledTimes(1);
  });

  it('stays off without a key', async () => {
    mocked.get.mockResolvedValue({ data: { enabled: true, siteKey: null } });
    expect((await getTurnstileConfig()).enabled).toBe(false);
  });

  it('stays off when the server cannot be asked, and asks again next time', async () => {
    mocked.get.mockRejectedValueOnce(new Error('network'));
    expect(await getTurnstileConfig()).toEqual({ enabled: false, siteKey: null });
    mocked.get.mockResolvedValueOnce({ data: { enabled: true, siteKey: 'k' } });
    expect((await getTurnstileConfig()).enabled).toBe(true);
  });
});
