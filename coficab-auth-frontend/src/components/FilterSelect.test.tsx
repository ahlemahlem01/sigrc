import { render, screen, fireEvent } from '@testing-library/react';
import FilterSelect from './FilterSelect';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }) }));

const options = [
  { value: 'a', label: '[QA] Ahlem Alaya' },
  { value: 'b', label: '[PROD] Karim Jebali' },
  { value: 'c', label: '[LOG] Aya Mabrouk' },
];

describe('FilterSelect', () => {
  it('shows the entry that clears the filter, then the chosen value', () => {
    const onChange = jest.fn();
    const { rerender } = render(<FilterSelect value="" onChange={onChange} allLabel="Tous les acteurs" options={options} />);
    expect(screen.getByText('Tous les acteurs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tous les acteurs/ }));
    fireEvent.click(screen.getByRole('option', { name: '[PROD] Karim Jebali' }));
    expect(onChange).toHaveBeenCalledWith('b');
    rerender(<FilterSelect value="b" onChange={onChange} allLabel="Tous les acteurs" options={options} />);
    expect(screen.getByText('[PROD] Karim Jebali')).toBeTruthy();
  });

  it('searches the list', () => {
    render(<FilterSelect value="" onChange={jest.fn()} allLabel="Tous" options={options} searchable />);
    fireEvent.click(screen.getByRole('button', { name: /Tous/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'aya' } });
    expect(screen.getByRole('option', { name: '[LOG] Aya Mabrouk' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '[PROD] Karim Jebali' })).toBeNull();
  });

  it('clears the filter with the first entry', () => {
    const onChange = jest.fn();
    render(<FilterSelect value="a" onChange={onChange} allLabel="Tous" options={options} />);
    fireEvent.click(screen.getByRole('button', { name: /Ahlem/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Tous' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
