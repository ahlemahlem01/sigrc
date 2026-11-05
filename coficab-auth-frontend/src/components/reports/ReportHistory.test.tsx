import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import SavedReportsBar from '../SavedReportsBar';
import ReportResultView from './ReportResultView';
import JsonValueEditor from './JsonValueEditor';

jest.mock('axios');
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../config/apiEnv', () => ({ ACTION_PLAN_API_URL: 'http://api' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${o.count}` : k), i18n: { language: 'fr' } }),
}));
// recharts measures its container, which jsdom does not have
jest.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Box, BarChart: Box, Bar: Box, PieChart: Box, Pie: Box, Cell: Box, Legend: Box, Tooltip: Box, XAxis: Box, YAxis: Box, CartesianGrid: Box };
});

const mockedGet = axios.get as jest.Mock;

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1', kind: 'claims', title: 'Rapport T1', itemCount: 4, createdAt: '2026-10-01T10:00:00Z', createdByName: 'Ahlem', version: 1, ...over,
});

describe('report history', () => {
  beforeEach(() => { jest.useRealTimers(); mockedGet.mockReset(); });

  it('lists the active reports first, and the archived ones are one toggle away', async () => {
    mockedGet.mockResolvedValue({ data: { items: [row()], total: 1 } });
    render(<SavedReportsBar kind="claims" hasReport={false} snapshot={() => null} defaultTitle="x" onOpen={() => undefined} />);

    expect(await screen.findByText('Rapport T1')).toBeTruthy();
    expect(mockedGet.mock.calls[0][1].params.state).toBe('active');

    mockedGet.mockResolvedValue({ data: { items: [row({ id: 'r2', title: 'Ancien', isArchived: true, archivedAt: '2026-10-05T10:00:00Z' })], total: 1 } });
    fireEvent.click(screen.getByText('reportHistory.state.archived'));

    expect(await screen.findByText('Ancien')).toBeTruthy();
    expect(screen.getByText('reportHistory.restore')).toBeTruthy();       // archived: restore, never a deletion
    expect(screen.queryByText('adminLists.archive')).toBeNull();
    expect(mockedGet.mock.calls.at(-1)![1].params.state).toBe('archived');
  });

  it('is paged: the next page asks the server for the next rows', async () => {
    mockedGet.mockResolvedValue({ data: { items: [row()], total: 12 } });   // 12 reports, 5 per page → 3 pages
    render(<SavedReportsBar kind="claims" hasReport={false} snapshot={() => null} defaultTitle="x" onOpen={() => undefined} />);
    await screen.findByText('Rapport T1');

    fireEvent.click(screen.getByText('reportHistory.next'));
    await waitFor(() => expect(mockedGet.mock.calls.at(-1)![1].params.page).toBe(2));
  });

  it('filters by words of the title and by edited reports', async () => {
    mockedGet.mockResolvedValue({ data: { items: [row()], total: 1 } });
    render(<SavedReportsBar kind="claims" hasReport={false} snapshot={() => null} defaultTitle="x" onOpen={() => undefined} />);
    await screen.findByText('Rapport T1');

    fireEvent.change(screen.getByPlaceholderText('reportHistory.searchPh'), { target: { value: 'soudure' } });
    fireEvent.click(screen.getByLabelText('reportHistory.editedOnly'));
    await waitFor(() => {
      const params = mockedGet.mock.calls.at(-1)![1].params;
      expect(params.q).toBe('soudure');
      expect(params.edited).toBe(true);
    });
  });

  it('lets the report on screen be corrected before it is saved', async () => {
    mockedGet.mockResolvedValue({ data: { items: [], total: 0 } });
    const onOpen = jest.fn();
    render(<SavedReportsBar kind="claims" hasReport snapshot={() => ({ criteria: { a: 1 }, result: { totals: { total: 10 } }, itemCount: 10 })} defaultTitle="x" onOpen={onOpen} />);

    fireEvent.click(screen.getByText('reportHistory.editDraft'));
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('reportHistory.apply'));

    expect(onOpen).toHaveBeenCalledWith({ a: 1 }, { totals: { total: 12 } });
  });
});

describe('ReportResultView', () => {
  const totals = { total: 10, closed: 6, late: 2, open: 4, groups: 2, rate: 60 };
  const groups = [
    { key: 'a', label: 'Alpha', total: 3, closed: 1, late: 1, open: 2, rate: 33 },
    { key: 'b', label: 'Beta', total: 7, closed: 5, late: 1, open: 2, rate: 71 },
  ];

  it('shows the key figures with their change since the previous period, and sorts the groups', () => {
    render(
      <ReportResultView
        generatedAt="2026-10-01T10:00:00Z" periodText="p" onRegenerate={() => undefined} totals={totals}
        previous={{ ...totals, total: 8, late: 3 }} summaryLines={['Point 1']} groups={groups}
        itemLabel="Réclamations" groupColLabel="Groupe" emptyText="vide" renderDetail={(k) => <p>détail {k}</p>}
      />,
    );
    expect(screen.getByText('Point 1')).toBeTruthy();
    expect(screen.getByText('▲ +2')).toBeTruthy();    // 10 against 8
    expect(screen.getByText('▼ -1')).toBeTruthy();    // 2 late against 3

    const names = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(names()[0]).toContain('Beta');             // biggest group first by default
    fireEvent.click(screen.getByText('Groupe'));
    expect(names()[0]).toContain('Alpha');

    fireEvent.click(screen.getAllByText('actionsReport.details')[0]);
    expect(screen.getByText(/détail/)).toBeTruthy();
  });
});

describe('JsonValueEditor', () => {
  it('edits any figure or text, and removes a row of a list', () => {
    const onChange = jest.fn();
    render(<JsonValueEditor value={{ title: 'T', rows: [{ n: 1 }, { n: 2 }] }} onChange={onChange} />);

    fireEvent.change(screen.getByDisplayValue('T'), { target: { value: 'Titre' } });
    expect(onChange).toHaveBeenLastCalledWith({ title: 'Titre', rows: [{ n: 1 }, { n: 2 }] });

    fireEvent.click(screen.getAllByLabelText('reportEdit.removeRow')[0]);
    expect(onChange).toHaveBeenLastCalledWith({ title: 'T', rows: [{ n: 2 }] });
  });
});
