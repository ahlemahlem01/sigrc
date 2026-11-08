import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ClaimCreationSheet } from './ClaimCreationSheet';

const mockGetSheet = jest.fn();
const mockGetClaim = jest.fn();
const mockValidate = jest.fn();
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ accessToken: 't' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, o?: any) => (o?.defaultValue && !k.startsWith('creationSheet') ? o.defaultValue : k) }) }));
jest.mock('../i18n', () => ({ dateLocale: () => 'fr-FR', __esModule: true, default: { t: (k: string, o?: any) => o?.defaultValue ?? k, exists: () => false } }));
jest.mock('../hooks/useReferenceLists', () => ({ useReferenceLists: () => ({ defectTypes: ['COPPER_BROKEN'], clients: ['A'] }) }));
jest.mock('../services/qualityAnalysisService', () => ({
  qualityAnalysisService: {
    getClaimCreationSheet: (...a: unknown[]) => mockGetSheet(...a),
    getClaimById: (...a: unknown[]) => mockGetClaim(...a),
    validateClaimCreation: (...a: unknown[]) => mockValidate(...a),
    estimateClaimResolution: jest.fn().mockResolvedValue({ available: false }),
  },
}));

const claim = { id: 'c1', title: 'Cable cassé', clientId: 'A', defectType: 'COPPER_BROKEN', severity: 'Low', lotNumber: 'L1', serialNumber: '', description: 'd', createdAt: '2026-11-03T10:00:00Z', statusCode: 'OUVERTE' };
const sheet = (over: object = {}) => ({
  claimId: 'c1', creatorId: 'u1', creatorName: 'Sami', isCreator: true, validated: false, canEdit: true,
  suggestedDeadline: '2026-11-08T00:00:00Z', deadline: null, assigneeName: 'Meriem', history: [], ...over,
});

describe('ClaimCreationSheet', () => {
  beforeEach(() => { jest.clearAllMocks(); mockGetClaim.mockResolvedValue(claim); });

  it('lets the creator confirm, sending only what was corrected and no date when it was not touched', async () => {
    mockGetSheet.mockResolvedValue(sheet());
    mockValidate.mockResolvedValue({});
    const onClose = jest.fn();
    render(<ClaimCreationSheet claimId="c1" origin="create" onClose={onClose} />);
    const lot = await screen.findByDisplayValue('L1');
    fireEvent.change(lot, { target: { value: 'L2' } });
    fireEvent.click(screen.getByText(/creationSheet\.confirm/));
    await waitFor(() => expect(mockValidate).toHaveBeenCalled());
    expect(mockValidate.mock.calls[0][1]).toEqual({ changes: { lotNumber: 'L2' } });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  });

  it('is read-only for someone who is not the creator: no field, no confirm button, the person in charge is shown', async () => {
    mockGetSheet.mockResolvedValue(sheet({ isCreator: false, canEdit: false }));
    render(<ClaimCreationSheet claimId="c1" origin="detail" onClose={() => undefined} />);
    await screen.findByText('Meriem');
    expect(screen.queryByText(/creationSheet\.confirm/)).toBeNull();
    expect(screen.queryByText('creationSheet.modifyDate')).toBeNull();
    expect(screen.queryByDisplayValue('L1')).toBeNull();
  });

  it('is read-only once confirmed', async () => {
    mockGetSheet.mockResolvedValue(sheet({ validated: true, canEdit: false, validatedByName: 'Sami', validatedAt: '2026-11-03T11:00:00Z' }));
    render(<ClaimCreationSheet claimId="c1" origin="detail" onClose={() => undefined} />);
    await screen.findByText('creationSheet.introValidated');
    expect(screen.queryByText(/creationSheet\.confirm/)).toBeNull();
  });

  it('offers an optional reason when the date is not the suggested one, and confirms without it', async () => {
    mockGetSheet.mockResolvedValue(sheet());
    mockValidate.mockResolvedValue({});
    const onClose = jest.fn();
    render(<ClaimCreationSheet claimId="c1" origin="create" onClose={onClose} />);
    fireEvent.click(await screen.findByText('creationSheet.modifyDate'));
    const date = document.querySelector('input[type="date"]') as HTMLInputElement;
    const other = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
    fireEvent.change(date, { target: { value: other } });
    expect(await screen.findByText('creationSheet.reason')).toBeTruthy();
    const confirm = screen.getByText(/creationSheet\.confirm/).closest('button') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(mockValidate).toHaveBeenCalled());
    expect(mockValidate.mock.calls[0][1]).toEqual({ deadline: other, deadlineReason: '' });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
  });
});
