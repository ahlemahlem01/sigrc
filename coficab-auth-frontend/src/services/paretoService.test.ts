import axios from 'axios';
import { paretoService } from './paretoService';
import { ParetoDimension } from '../types/pareto.types';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

const post = axios.post as jest.Mock;

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: [] });
});

describe('paretoService sends the bearer token (the API now requires it)', () => {
  it('getPareto', async () => {
    await paretoService.getPareto({ dimension: ParetoDimension.DefectType }, 'tok');

    const [url, body, config] = post.mock.calls[0];
    expect(url).toMatch(/\/pareto$/);
    expect(body).toEqual({ dimension: ParetoDimension.DefectType });
    expect(config.headers.Authorization).toBe('Bearer tok');
  });

  it('getSuggestion', async () => {
    await paretoService.getSuggestion({ defectType: 'Soudure' }, 'tok');

    const [url, , config] = post.mock.calls[0];
    expect(url).toMatch(/\/pareto\/suggest$/);
    expect(config.headers.Authorization).toBe('Bearer tok');
  });
});
