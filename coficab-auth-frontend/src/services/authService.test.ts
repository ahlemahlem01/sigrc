import axios from 'axios';
import { login, refreshToken } from './authService';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

const post = axios.post as jest.Mock;

const sentForm = () => post.mock.calls[0][1] as URLSearchParams;

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { access_token: 'a', refresh_token: 'r', token_type: 'Bearer', expires_in: 3600 } });
});

describe('token requests use the public client', () => {
  it('login sends coficab-frontend and no client secret', async () => {
    await login('user@coficab.com', 'pw');

    expect(post.mock.calls[0][0]).toMatch(/\/connect\/token$/);
    const form = sentForm();
    expect(form.get('grant_type')).toBe('password');
    expect(form.get('client_id')).toBe('coficab-frontend');
    expect(form.has('client_secret')).toBe(false);
  });

  it('refresh sends coficab-frontend and no client secret', async () => {
    await refreshToken('refresh-value');

    const form = sentForm();
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('refresh-value');
    expect(form.get('client_id')).toBe('coficab-frontend');
    expect(form.has('client_secret')).toBe(false);
  });
});
