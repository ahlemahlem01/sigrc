import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import QrqcBoardPage from './QrqcBoardPage';

jest.mock('axios');
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../config/apiEnv', () => ({ ACTION_PLAN_API_URL: 'http://api' }));
jest.mock('../../utils/defectLabel', () => ({ defectLabel: (d: string) => d }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${Object.values(o).join(',')}` : k), i18n: { language: 'fr' } }),
}));

const mockedGet = axios.get as jest.Mock;

const board = (over: Record<string, unknown> = {}) => ({
  generatedAt: '2026-11-04T08:41:00Z', scope: 'internal', escalationMinutes: [60, 240],
  kpis: { open: 2, escalated: 1, newToday: 1, closureRate30d: 68 },
  lines: [{ line: 'EXT-01', state: 'red', open: 2, escalated: 1 }, { line: 'WR-02', state: 'green', open: 0, escalated: 0 }],
  problems: [
    { claimId: 'a', title: 'Coupure sur gaine', defectType: 'Coupure fil', severity: 'HIGH', line: 'EXT-01', lotNumber: 'L-1', statusCode: 'EN_ANALYSE', isInternal: true, detectedAt: '2026-11-04T06:00:00Z', minutesOpen: 102, level: 2, hasPhoto: true, hasLot: true, hasRootCause: false, hasCorrective: false },
    { claimId: 'b', title: 'Marquage illisible', defectType: 'Marquage', severity: 'LOW', line: 'CTL-01', lotNumber: '', statusCode: 'OUVERTE', isInternal: true, detectedAt: '2026-11-04T04:00:00Z', minutesOpen: 250, level: 3, hasPhoto: false, hasLot: false, hasRootCause: false, hasCorrective: false },
  ],
  ...over,
});

/** The board answers on /qrqc/board, the rights on /qrqc/access (here: an administrator). */
const serve = (boardResult: () => Promise<unknown>) =>
  mockedGet.mockImplementation((url: string) => (url.includes('/qrqc/access') ? Promise.resolve({ data: { isAdmin: true } }) : boardResult()));

describe('QrqcBoardPage', () => {
  beforeEach(() => { mockedGet.mockReset(); });

  it('shows the lines, the problems with their time and level, and what each one still lacks', async () => {
    serve(() => Promise.resolve({ data: board() }));
    render(<MemoryRouter><QrqcBoardPage /></MemoryRouter>);

    expect(await screen.findByText(/Coupure sur gaine/)).toBeTruthy();
    expect(screen.getByText('1 h 42')).toBeTruthy();
    expect(screen.getByText('4 h 10')).toBeTruthy();
    expect(screen.getAllByText('qrqc.rootCauseMissing').length).toBe(2);
    expect(screen.getByText('qrqc.lotMissing')).toBeTruthy();
    expect(screen.getByText('qrqc.lotOk')).toBeTruthy();
    expect(screen.getByText('qrqc.online')).toBeTruthy();
  });

  it('filters the problems on a line when its light is clicked', async () => {
    serve(() => Promise.resolve({ data: board() }));
    render(<MemoryRouter><QrqcBoardPage /></MemoryRouter>);
    await screen.findByText(/Coupure sur gaine/);

    fireEvent.click(screen.getByText('EXT-01'));
    expect(screen.queryByText(/Marquage illisible/)).toBeNull();
    expect(screen.getByText(/Coupure sur gaine/)).toBeTruthy();
  });

  it('hides the export for a manager, who only reads his people', async () => {
    mockedGet.mockImplementation((url: string) => (url.includes('/qrqc/access') ? Promise.resolve({ data: { isAdmin: false } }) : Promise.resolve({ data: board() })));
    render(<MemoryRouter><QrqcBoardPage /></MemoryRouter>);
    await screen.findByText(/Coupure sur gaine/);
    await waitFor(() => expect(screen.queryByText('qrqc.export')).toBeNull());
    expect(screen.getByText('qrqc.managerScope')).toBeTruthy();
  });

  it('keeps the last data and says it is offline when the network drops', async () => {
    serve(() => Promise.resolve({ data: board() }));
    const { rerender } = render(<MemoryRouter><QrqcBoardPage /></MemoryRouter>);
    await screen.findByText(/Coupure sur gaine/);

    serve(() => Promise.reject(new Error('network')));
    fireEvent.click(screen.getByText('qrqc.scope.all'));          // triggers a new load, which fails
    rerender(<MemoryRouter><QrqcBoardPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('qrqc.offline')).toBeTruthy());
    expect(screen.getByText(/Coupure sur gaine/)).toBeTruthy();   // the board is not blanked
  });
});
