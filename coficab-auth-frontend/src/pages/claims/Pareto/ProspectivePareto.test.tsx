import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProspectivePareto, { rankCauses } from './ProspectivePareto';

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Pass, ComposedChart: Pass, Bar: Pass, Line: Pass, Cell: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, ReferenceLine: () => null };
});
jest.mock('../../../services/qualityAnalysisService', () => ({
  qualityAnalysisService: {
    getIshikawa: (...a: unknown[]) => mockGet(...a),
    setIshikawaCauseRisk: (...a: unknown[]) => mockSet(...a),
  },
}));

const diagram = (scored = false) => ({
  categories: [
    { categoryName: 'Machine', causes: [{ id: 'a', text: 'Frein du dévidoir mal réglé', riskSeverity: scored ? 7 : null, riskOccurrence: scored ? 7 : null, riskDetection: scored ? 6 : null }] },
    { categoryName: 'Material', causes: [{ id: 'd', text: 'Fût de bobine trop petit', riskSeverity: scored ? 9 : null, riskOccurrence: scored ? 2 : null, riskDetection: scored ? 3 : null }] },
  ],
});

describe('rankCauses', () => {
  const rows = [
    { id: 'a', text: 'A', category: 'Machine', s: 7 as const, o: 7 as const, d: 6 as const },
    { id: 'b', text: 'B', category: 'Method', s: 7 as const, o: 5 as const, d: 8 as const },
    { id: 'c', text: 'C', category: 'Milieu', s: 3 as const, o: 3 as const, d: 4 as const },
    { id: 'd', text: 'D', category: 'Material', s: 9 as const, o: 2 as const, d: 3 as const },
    { id: 'e', text: 'E (not scored)', category: 'Machine', s: 5 as const, o: '' as const, d: 5 as const },
  ];

  it('multiplies the three scores and ranks from the most to the least critical, ignoring a cause that is not fully scored', () => {
    const ranked = rankCauses(rows);
    expect(ranked.map((r) => [r.id, r.criticality])).toEqual([['a', 294], ['b', 280], ['d', 54], ['c', 36]]);
  });

  it('works out the cumulative share and the cut at 80 %', () => {
    const ranked = rankCauses(rows);
    expect(ranked[0].cumulativePct).toBeCloseTo(44.3, 1);
    expect(ranked[1].cumulativePct).toBeCloseTo(86.4, 1);
    expect(ranked.map((r) => r.vital)).toEqual([true, true, false, false]);
  });

  it('flags a cause of severity 9 or 10 even when its product is small', () => {
    const ranked = rankCauses(rows);
    expect(ranked.find((r) => r.id === 'd')?.high).toBe(true);
    expect(ranked.find((r) => r.id === 'a')?.high).toBe(false);
  });
});

describe('ProspectivePareto', () => {
  beforeEach(() => { jest.clearAllMocks(); mockSet.mockResolvedValue({ criticality: 294 }); });
  const show = (readOnly = false) => render(<MemoryRouter><ProspectivePareto claimId="c1" readOnly={readOnly} /></MemoryRouter>);

  it('saves a cause only once its three scores are given', async () => {
    mockGet.mockResolvedValue(diagram());
    show();
    const sev = await screen.findByLabelText('pareto.prospective.colSeverity — Frein du dévidoir mal réglé');
    const occ = screen.getByLabelText('pareto.prospective.colOccurrence — Frein du dévidoir mal réglé');
    const det = screen.getByLabelText('pareto.prospective.colDetection — Frein du dévidoir mal réglé');
    fireEvent.change(sev, { target: { value: '7' } });
    fireEvent.change(occ, { target: { value: '7' } });
    expect(mockSet).not.toHaveBeenCalled();
    fireEvent.change(det, { target: { value: '6' } });
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith('a', { severity: 7, occurrence: 7, detection: 6 }, 't'));
  });

  it('shows the criticality and the high-priority mark of the scores already saved', async () => {
    mockGet.mockResolvedValue(diagram(true));
    show();
    expect(await screen.findByText('294')).toBeTruthy();
    expect(screen.getByText('54')).toBeTruthy();
    expect(screen.getAllByTitle('pareto.prospective.highPriority').length).toBeGreaterThan(0);
  });

  it('is read-only on a closed dossier', async () => {
    mockGet.mockResolvedValue(diagram(true));
    show(true);
    const sev = await screen.findByLabelText('pareto.prospective.colSeverity — Frein du dévidoir mal réglé');
    expect((sev as HTMLSelectElement).disabled).toBe(true);
  });

  it('points to the Ishikawa when there is no cause yet', async () => {
    mockGet.mockResolvedValue({ categories: [] });
    show();
    expect(await screen.findByText('pareto.causesGoIshikawa')).toBeTruthy();
  });
});
