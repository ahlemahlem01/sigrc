import { render, screen } from '@testing-library/react';
import { ValidationThread } from './ValidationThread';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { pct?: number }) => (o?.pct !== undefined ? `${k}:${o.pct}` : k) }),
}));

describe('ValidationThread', () => {
  it('shows the root cause to validate first, and the plan that comes after it', () => {
    render(<ValidationThread root="toValidate" plan="none" />);
    expect(screen.getByText(/validationThread\.rootToValidate/)).toBeTruthy();
    expect(screen.getByText(/validationThread\.planAfterRoot/)).toBeTruthy();
  });

  it('says the plan is not created yet once the root cause is validated', () => {
    render(<ValidationThread root="validated" plan="none" />);
    expect(screen.getByText(/validationThread\.rootValidated/)).toBeTruthy();
    expect(screen.getByText(/validationThread\.planNone/)).toBeTruthy();
  });

  it('shows the progress of a plan that is being carried out', () => {
    render(<ValidationThread root="validated" plan="inProgress" progress={60} />);
    expect(screen.getByText(/validationThread\.planInProgress:60/)).toBeTruthy();
  });

  it('shows the plan to validate, and then validated', () => {
    const { rerender } = render(<ValidationThread root="validated" plan="toValidate" />);
    expect(screen.getByText(/validationThread\.planToValidate/)).toBeTruthy();
    rerender(<ValidationThread root="validated" plan="validated" />);
    expect(screen.getByText(/validationThread\.planValidated/)).toBeTruthy();
  });

  it('shows a plan that waits for its approval, and one that was returned', () => {
    const { rerender } = render(<ValidationThread root="validated" plan="toApprove" />);
    expect(screen.getByText(/validationThread\.planToApprove/)).toBeTruthy();
    rerender(<ValidationThread root="validated" plan="returned" />);
    expect(screen.getByText(/validationThread\.planReturned/)).toBeTruthy();
  });

  it('treats an unknown state like a plan not created yet', () => {
    render(<ValidationThread root="validated" plan="something" />);
    expect(screen.getByText(/validationThread\.planNone/)).toBeTruthy();
  });
});
