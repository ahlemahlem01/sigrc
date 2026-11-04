import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import FunctionsPage from './FunctionsPage';

jest.mock('axios');
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('../../config/apiEnv', () => ({ ACTION_PLAN_API_URL: 'http://api' }));
const mockGetAllProfiles = jest.fn();
jest.mock('../../services/adminEmployeeService', () => ({
  adminEmployeeService: { getAllProfiles: (...args: unknown[]) => mockGetAllProfiles(...args) },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${Object.values(o).join(',')}` : k) }),
}));

const mockedGet = axios.get as jest.Mock;
const mockedPost = axios.post as jest.Mock;

const fn = { id: 'f1', code: 'RESP-QUAL', description: 'Responsable qualité', hierarchicalLink: 'DIR-QUAL', functionalLink: null, departmentId: 'd1', departmentName: 'Qualité', permissions: ['8d:validate'], hasJobDescription: false, jobDescriptionFileName: null, holders: 1 };

beforeEach(() => {
  mockGetAllProfiles.mockResolvedValue([{ id: 'u1', name: 'Rania Bouazizi' }]);
  mockedGet.mockReset();
  mockedPost.mockReset();
  mockedGet.mockImplementation((url: string) => {
    if (url.endsWith('/functions')) return Promise.resolve({ data: [fn] });
    if (url.endsWith('/department')) return Promise.resolve({ data: [{ id: 'd1', name: 'Qualité' }] });
    if (url.endsWith('/functions/permissions')) return Promise.resolve({ data: [{ code: '8d:validate', label: 'Valider un 8D' }] });
    if (url.endsWith('/functions/assignments')) return Promise.resolve({ data: [{ id: 'a1', userId: 'u1', userName: 'Rania Bouazizi', functionId: 'f1', status: 'ByInterim', startDate: '2026-11-01' }] });
    return Promise.resolve({ data: [] });
  });
  mockedPost.mockResolvedValue({ data: {} });
});

describe('FunctionsPage', () => {
  it('lists the functions with their links and the rights they carry', async () => {
    render(<FunctionsPage />);
    expect(await screen.findByText('RESP-QUAL')).toBeTruthy();
    expect(screen.getByText('DIR-QUAL')).toBeTruthy();
    expect(screen.getByText('Valider un 8D')).toBeTruthy();
  });

  it('shows who holds a function with the status, and assigns someone else', async () => {
    render(<FunctionsPage />);
    await screen.findByText('RESP-QUAL');
    fireEvent.click(screen.getByText(/functions\.manage/));
    expect(await screen.findByText('Rania Bouazizi', { selector: 'strong' })).toBeTruthy();
    expect((screen.getAllByLabelText('functions.status')[0] as HTMLSelectElement).value).toBe('ByInterim');

    fireEvent.change(screen.getByLabelText('functions.person'), { target: { value: 'u1' } });
    fireEvent.click(screen.getByText('functions.assign'));
    await waitFor(() => expect(mockedPost).toHaveBeenCalledWith(
      'http://api/functions/assignments',
      { userId: 'u1', functionId: 'f1', status: 'Active' },
      expect.anything(),
    ));
  });
});
